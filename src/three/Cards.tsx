'use client';
import * as THREE from 'three';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { canPlay, canJumpIn, face, hotkeyCard, type Card, type CardColor, type DeckSide, type GameState } from '@u-no/game-engine';
import { useMatch, type FxItem } from '@/src/state/match';
import { useTurnHold } from '@/src/state/useTurnHold';
import {
  CARD_FLIGHT_MS, DEAL_STAGGER_MS, DRAW_FAST_MS, DRAW_SLOW_MS, SWAP_FLY_MS, SWAP_GATHER_MS,
} from '@/src/state/timeline';
import { CardMesh, warmCardMaterials } from './CardMesh';
import { DECK_POS, DISCARD_POS, deckTransform, discardTransform, fanTransform, seatIndex, seatPos } from './layout';
import { resetForNewRound, setSpawnOrigin, setTarget, shake, tick } from './stage';
import { PHOTO_BACK_NAME, resolvePhotoSprite, usePhotoAtlas, type PhotoAtlas } from './photoAtlas';
import { gfxOf, useSettings } from '@/src/lib/settings';
import { playSfx } from '@/src/lib/audio';

interface Item {
  card: Card;
  zone: 'hand' | 'discard' | 'deck';
  ownerIdx: number;
  index: number;
  layerIndex: number;
  count: number;
  mine: boolean;
  spawnPos?: THREE.Vector3;
  spawnRot?: THREE.Euler;
}

// Cả 2 hệ màu (Light: red/yellow/green/blue VÀ Dark: pink/teal/orange/purple —
// BUG CŨ chỉ định nghĩa mặt Light nên mọi lá mặt Dark rơi cùng hạng ?? 99,
// không group theo màu được, đúng như báo cáo "chỉ ở std có chứ flip dark k có").
const COLOR_ORDER: Record<string, number> = {
  red: 0, yellow: 1, green: 2, blue: 3,
  pink: 0, teal: 1, orange: 2, purple: 3,
  wild: 4,
};
const VALUE_ORDER: Record<string, number> = {
  '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  'flip': 10, 'skip': 11, 'skipAll': 11, 'reverse': 12, 'draw1': 13, 'draw2': 13, 'draw5': 13,
  'wild': 20, 'wild2': 21, 'wild4': 21, 'wildColor': 22,
};

const DECK_LAYERS = 6;

/**
 * LUẬT 0/7 — ĐỔI TAY BÀI: gom bài lại -> trao cho nhau -> xoè ra lại.
 *
 * Chia đúng 3 chặng khớp ngân sách SWAP_ANIM_MS = 1100ms của engine (engine đã
 * đóng băng đồng hồ suốt khoảng này nên animation KHÔNG ăn vào thời gian của
 * ai — đúng yêu cầu). Mọi lá bay CÙNG LÚC (delay = 0), không chuyền lẻ từng lá.
 *   0   -> 300ms : gom cả tay bài thành 1 cọc tại ghế CHỦ CŨ
 *   300 -> 720ms : cả cọc bay sang ghế CHỦ MỚI
 *   720ms+       : trả về quạt bài bình thường (tự xoè ra)
 */

/**
 * Một lượt "trao tay bài", dùng chung cho cả 2 luật:
 *  - 'swap'   (lá 7): ĐÚNG 2 người đổi tay bài cho nhau.
 *  - 'rotate' (lá 0): CẢ BÀN chuyển tay bài sang người kế tiếp theo chiều chơi.
 * Khác nhau duy nhất ở chỗ tính "chủ cũ" của một lá; 3 chặng gom/bay/xoè y hệt.
 */
type HandoverAnim =
  | { kind: 'swap'; a: string; b: string; at: number }
  | { kind: 'rotate'; direction: 1 | -1; at: number };

/**
 * Chỉ số người chơi TRƯỚC khi trao tay bài. State đã trao xong ngay lúc engine
 * xử lý, nên phải suy ngược lại để biết lá này bay TỪ đâu.
 *  - swap  : chủ cũ là người còn lại trong cặp.
 *  - rotate: engine gán `rotated[i] = hands[step(i, -1)]`, nên chủ cũ của
 *            người i là người ở vị trí (i - direction).
 * Trả -1 nếu lá không thuộc diện trao tay (không đụng tới).
 */
function formerOwnerIdx(anim: HandoverAnim, ownerIdx: number, ownerId: string, players: { id: string }[]): number {
  const n = players.length;
  if (anim.kind === 'rotate') return ((ownerIdx - anim.direction) % n + n) % n;
  if (ownerId !== anim.a && ownerId !== anim.b) return -1;
  return players.findIndex((p) => p.id === (ownerId === anim.a ? anim.b : anim.a));
}

function collect(state: GameState, myId: string, maxDiscard: number, maxOpp: number): Item[] {
  const out: Item[] = [];
  const n = state.players.length;
  const myIdx = Math.max(0, state.players.findIndex((p) => p.id === myId));

  // 1. Bài trong tay từng người chơi
  state.players.forEach((p, pi) => {
    const mine = p.id === myId;
    let visible = p.hand;
    if (mine) {
      // Sắp xếp bài chính diện theo nhóm màu: Đỏ -> Vàng -> Lục -> Lam -> Wild, tăng dần theo số & chức năng
      visible = p.hand.slice().sort((a, b) => {
        const fa = face(a, state.side);
        const fb = face(b, state.side);
        const ca = COLOR_ORDER[fa.color] ?? 99;
        const cb = COLOR_ORDER[fb.color] ?? 99;
        if (ca !== cb) return ca - cb;
        const va = VALUE_ORDER[fa.value] ?? 99;
        const vb = VALUE_ORDER[fb.value] ?? 99;
        if (va !== vb) return va - vb;
        return a.id.localeCompare(b.id);
      });
    } else {
      // Quạt bài đối phương giới hạn 10 lá cho khỏi tràn bàn — nhưng lấy 10 lá
      // CUỐI, không phải 10 lá đầu.
      //
      // LỖI CŨ (slice(0,10)): lá mới rút được nối vào CUỐI tay bài, nên khi đối
      // thủ đã có hơn 10 lá thì lá vừa rút nằm ngoài lát cắt -> không có mesh ->
      // KHÔNG CÓ animation rút bài. Tới khi tay bài rụng xuống dưới 10 thì đám
      // lá đó mới lòi ra một lượt, nhìn như "bù animation cho đủ".
      //
      // Đánh đổi: mỗi lần rút, lá cũ nhất ở rìa bị đẩy ra khỏi quạt và biến mất.
      // Chấp nhận được — nó nằm ở mép, còn animation rút bài thì luôn thấy.
      visible = p.hand.slice(-10);
    }

    visible.forEach((card, i) => {
      // YÊU CẦU: Lá phải nằm sau lá trái -> lá i=0 (trái nhất) có layerIndex cao nhất để đè lên lá bên phải
      const layerIndex = i;
      out.push({
        card,
        zone: 'hand',
        ownerIdx: pi,
        index: i,
        layerIndex,
        count: visible.length,
        mine,
      });
    });
  });

  // 2. Đống bài đã đánh: phân tầng height bằng relative index `i` trong slice để không bị trùng Y
  const discardSlice = state.discard.slice(-maxDiscard);
  discardSlice.forEach((card, i, arr) => {
    const pileIndex = state.discard.length - arr.length + i;
    out.push({
      card,
      zone: 'discard',
      ownerIdx: -1,
      index: pileIndex,
      layerIndex: i,
      count: arr.length,
      mine: false,
    });
  });

  // 3. Chồng bài rút trực quan luôn ổn định trên bàn (không bị biến mất khi drawPile rỗng hoặc đang reshuffle)
  for (let i = 0; i < DECK_LAYERS; i++) {
    out.push({
      card: { id: `deck-slot-${i}`, light: { color: 'wild', value: 'wild' }, hidden: true },
      zone: 'deck',
      ownerIdx: -1,
      index: i,
      layerIndex: i,
      count: DECK_LAYERS,
      mine: false,
    });
  }

  void myIdx;
  void n;
  void maxOpp;
  return out;
}

/**
 * Loé sáng ngắn tại đống bài đánh ra khi vừa đánh 1 lá CHỨC NĂNG (skip/reverse/
 * +N/wild...) — CHỈ 1 lần thoáng qua lúc đánh, khác hẳn viền nhấp nháy đã bỏ
 * khỏi bài nằm sẵn trên bàn (yêu cầu trước: bài đã đánh xong không cần
 * nhấp nháy/viền liên tục nữa — đây là hiệu ứng lúc ĐÁNH, không phải trạng
 * thái thường trực). Animation CSS (0.5s, forwards) tự giữ trạng thái mờ hẳn
 * sau khi chạy xong — key ổn định theo fx.id nên không remount/replay khi
 * component re-render vì lý do khác; KHÔNG lọc theo Date.now() ở đây (impure,
 * bị React Compiler chặn khi gọi lúc render) — fx tự hết hạn sau 2.6s ở
 * pushFx (match.ts), muộn hơn nhiều so với 0.5s hiệu ứng nên không lệch pha.
 */
function PlayFlash({ state, fx }: { state: GameState; fx: FxItem[] }) {
  let latest: FxItem | null = null;
  for (const f of fx) {
    const payload = f.payload;
    if (payload.t !== 'play') continue;
    const card = state.discard.find((c) => c.id === payload.cardId);
    if (!card) continue;
    const fa = face(card, state.side);
    const isFunctionCard = fa.color === 'wild' || !/^\d$/.test(fa.value);
    if (isFunctionCard && (!latest || f.at > latest.at)) latest = f;
  }
  if (!latest) return null;
  return (
    <Html position={[DISCARD_POS.x, 0.08, DISCARD_POS.z]} center zIndexRange={[3, 0]} style={{ pointerEvents: 'none' }}>
      <div
        key={latest.id}
        style={{
          width: 140,
          height: 140,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,211,77,.9), rgba(255,150,40,.35) 55%, rgba(255,150,40,0) 72%)',
          animation: 'playFlash 0.5s ease-out forwards',
        }}
      />
    </Html>
  );
}

/**
 * "+N" nổi trên đầu người ĐANG BỊ chồng phạt — hiện ĐỒNG THỜI với dấu cấm lượt
 * để nhìn một cái là hiểu "bị cấm lượt VÌ ăn +N", thay vì đoán.
 *
 * Suy từ STATE chứ không từ fx rút bài. Lỗi cũ: lọc fx `draw` có
 * `cardIds.length > 1`, nhưng từ khi rút bài tách ra TỪNG LÁ MỘT (drawRun) thì
 * mỗi event chỉ còn đúng 1 lá -> điều kiện không bao giờ đúng, "+N" chẳng bao
 * giờ hiện nữa.
 *
 * Tổng số lá phải rút: `pending.amount` khi chuỗi phạt còn đang treo, hoặc
 * `count + remaining` khi đang rút dở (count tăng dần, remaining giảm dần nên
 * tổng luôn đúng). Rút "tới khi ra màu" thì không biết trước tổng -> không hiện số.
 */
function DrawTotalPopups({ state, myId }: { state: GameState; myId: string }) {
  const n = state.players.length;
  const myIdx = Math.max(0, state.players.findIndex((p) => p.id === myId));

  let amount = 0;
  if (state.pending && state.pending.value !== 'drawColor') amount = state.pending.amount;
  else if (state.drawRun?.penalty && state.drawRun.kind === 'fixed') {
    amount = state.drawRun.count + (state.drawRun.remaining ?? 0);
  }
  if (amount <= 0) return null;

  const victim = state.players[state.turn];
  if (!victim) return null;
  const seatJ = seatIndex(state.turn, myIdx, n);
  const pos = seatPos(seatJ, n, seatJ === 0 ? 2.3 : 1.75);

  return (
    <Html position={[pos.x, 0.95, pos.z]} center zIndexRange={[8, 0]} style={{ pointerEvents: 'none' }}>
      <div
        className="label"
        style={{
          fontSize: 34,
          fontWeight: 800,
          color: '#FFD34D',
          textShadow: '0 2px 6px rgba(0,0,0,.85), 0 0 16px rgba(255,140,40,.85)',
          animation: 'drawTotalFly 0.45s ease-out',
        }}
      >
        +{amount}
      </div>
    </Html>
  );
}

export function Cards({ paused = false }: { paused?: boolean }) {
  const state = useMatch((s) => s.state);
  const version = useMatch((s) => s.version);
  const myId = useMatch((s) => s.myId);
  const fx = useMatch((s) => s.fx);
  const dealSeq = useMatch((s) => s.dealSeq);
  const act = useMatch((s) => s.act);
  const graphics = useSettings((s) => s.graphics);
  const gfx = gfxOf(graphics);
  // Đang phát animation nhận hiệu ứng -> khoá tương tác bài (xem useTurnHold).
  const holding = useTurnHold();
  // Lá sẽ được đánh khi bấm [S] — gắn nhãn phím lên đúng lá đó.
  const sCardId = state && !holding ? hotkeyCard(state, myId)?.id : undefined;

  const lastRound = useRef(-1);
  const lastDeal = useRef(-1);
  const [fontsReady, setFontsReady] = useState(false);
  const [hoveredColor, setHoveredColor] = useState<CardColor | null>(null);
  // Lá ĐANG hover trong tay mình — dùng để nhấc theo Y + dạt bài lân cận (layout.ts fanTransform).
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const knownCardsByPlayer = useRef<Map<string, Set<string>>>(new Map());

  // Animation đổi tay bài (luật 0/7) đang chạy — giữ trong ref, KHÔNG phải state:
  // chặng được suy ra từ mốc thời gian ngay trong effect bố trí bài bên dưới.
  // `swapTick` chỉ để ép effect đó chạy lại đúng lúc chuyển chặng (React chặn
  // setState đồng bộ trong thân effect, nên bơm state trong callback timer).
  const swapRef = useRef<HandoverAnim | null>(null);
  const [swapTick, setSwapTick] = useState(0);

  /** Fx trao tay bài MỚI NHẤT (lá 7 đổi 1-1, hoặc lá 0 xoay cả bàn). */
  const handoverFx = useMemo(() => {
    let latest: FxItem | null = null;
    for (const f of fx) {
      if ((f.payload?.t === 'swap' || f.payload?.t === 'rotate') && (!latest || f.id > latest.id)) latest = f;
    }
    return latest;
  }, [fx]);
  const handoverId = handoverFx?.id ?? -1;

  /**
   * Hẹn giờ chuyển chặng gom -> bay -> xoè.
   *
   * Dep phải là ID của fx trao bài, KHÔNG phải mảng fx. LỖI CŨ: dep là fx, mà
   * pushFx trả về MẢNG MỚI ở mọi lần commit state, nên effect chạy lại liên tục
   * và hàm cleanup HUỶ CẢ 2 TIMER trước khi chúng kịp bắn; lần chạy lại thì
   * thoát sớm vì id không đổi nên không đặt timer mới. Hậu quả: chặng không bao
   * giờ chuyển sang "bay", và swapRef không bao giờ được dọn — animation trao
   * bài kẹt lại ở trạng thái GOM.
   */
  useEffect(() => {
    const p = handoverFx?.payload;
    if (!p) return;
    if (p.t === 'swap') swapRef.current = { kind: 'swap', a: p.a, b: p.b, at: Date.now() };
    else if (p.t === 'rotate') swapRef.current = { kind: 'rotate', direction: p.direction, at: Date.now() };
    else return;
    const t1 = setTimeout(() => setSwapTick((v) => v + 1), SWAP_GATHER_MS);
    const t2 = setTimeout(() => { swapRef.current = null; setSwapTick((v) => v + 1); }, SWAP_GATHER_MS + SWAP_FLY_MS);
    return () => { clearTimeout(t1); clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handoverId]);

  // Bỏ hover có ĐỘ TRỄ NHỎ (debounce) — không tắt ngay khi rời khỏi lá. Lá
  // nhấc lên khi hover (hoverLift) dịch chuyển vị trí màn hình của chính nó;
  // nếu tắt hover ngay lập tức, chuột dễ rơi ra ngoài lá VỪA DI CHUYỂN rồi bị
  // tắt/bật lại liên tục ("chớp" mất hover ngay khi vừa chạm) — đúng lỗi báo
  // "hover tý là mất luôn", nhất là các lá ở biên quạt bài. Bật hover (khi có
  // id mới) vẫn tức thời — chỉ trễ lúc TẮT.
  const hoverClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setHoveredCardDebounced = useCallback((id: string | null) => {
    if (hoverClearTimer.current) { clearTimeout(hoverClearTimer.current); hoverClearTimer.current = null; }
    if (id !== null) { setHoveredCardId(id); return; }
    hoverClearTimer.current = setTimeout(() => setHoveredCardId(null), 140);
  }, []);
  useEffect(() => () => { if (hoverClearTimer.current) clearTimeout(hoverClearTimer.current); }, []);

  // Lưu vết chính xác người vừa đánh từng cardId ĐỒNG BỘ từ fx (không chờ useEffect)
  const cardShooterMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of fx) {
      if (f.payload && f.payload.t === 'play' && f.payload.cardId && f.payload.playerId) {
        map.set(f.payload.cardId, f.payload.playerId);
      }
    }
    return map;
  }, [fx]);

  // Lá vừa bị RÚT PHẠT (+2/+4/+5 hoặc hết giờ) — dùng để chọn thời lượng bay.
  const penaltyDrawIds = useMemo(() => {
    const set = new Set<string>();
    for (const f of fx) {
      if (f.payload?.t === 'draw' && f.payload.penalty) {
        for (const id of f.payload.cardIds) set.add(id);
      }
    }
    return set;
  }, [fx]);

  // Lá rút theo kiểu ĐỔ NHANH (chồng phạt, phạt bắt lỗi, phạt quên hô) — engine
  // đánh dấu `fast` vì số lá đã biết trước, không có gì để cân nhắc.
  const fastDrawIds = useMemo(() => {
    const set = new Set<string>();
    for (const f of fx) {
      if (f.payload?.t === 'draw' && f.payload.fast) {
        for (const id of f.payload.cardIds) set.add(id);
      }
    }
    return set;
  }, [fx]);

  // TẤT CẢ lá vừa RÚT TỪ BỘ BÀI (phạt lẫn thường). CHỈ những lá này mới được
  // bay lệch pha từng lá (stagger 0.5s) — vì rút bài đúng là hành động tuần tự.
  // Bài đổi tay do luật 0/7 KHÔNG nằm trong đây nên sẽ bay CÙNG LÚC, cho cảm
  // giác "đổi tức thì" đúng như luật, thay vì chuyền lẻ từng lá (lỗi cũ: mọi lá
  // lạ trong tay đều bị coi là "vừa rút" nên bị xếp hàng 0.5s/lá).
  const drawnCardIds = useMemo(() => {
    const set = new Set<string>();
    for (const f of fx) {
      if (f.payload?.t === 'draw') {
        for (const id of f.payload.cardIds) set.add(id);
      }
    }
    return set;
  }, [fx]);

  // Atlas ẢNH THẬT — nguồn duy nhất để vẽ mặt bài (đã bỏ cơ chế chọn skin).
  // Classic chỉ cần 'std'; Flip cần tải sẵn CẢ light lẫn dark (đổi mặt bất cứ
  // lúc nào trong ván, không muốn khựt lúc lật). 2 slot hook cố định (không
  // gọi điều kiện) để không vi phạm rules-of-hooks.
  const isFlipDeck = state?.deckType === 'flip';
  const variantA = isFlipDeck ? 'flipLight' : 'std';
  const variantB = isFlipDeck ? 'flipDark' : null;
  const atlasA = usePhotoAtlas(variantA);
  const atlasB = usePhotoAtlas(variantB);
  // Dựng sẵn material của cả atlas ngay khi tải xong, để lúc rút/đánh bài không
  // phải tạo gì mới nữa (xem warmCardMaterials).
  const wantStandard = gfx.standardMaterial;
  useEffect(() => {
    if (atlasA) warmCardMaterials(atlasA, wantStandard);
    if (atlasB) warmCardMaterials(atlasB, wantStandard);
  }, [atlasA, atlasB, wantStandard]);

  const photoAtlasFor = useCallback(
    (side: 'light' | 'dark'): PhotoAtlas | null => (isFlipDeck && side === 'dark' ? atlasB : atlasA),
    [isFlipDeck, atlasA, atlasB],
  );

  // Vị trí bàn tay của người đánh lá bài ra bàn — bọc useCallback để hàm này
  // khai đúng phụ thuộc (state, myId, cardShooterMap) thay vì tạo mới mỗi
  // render, cho phép effect bên dưới liệt kê nó vào deps mà không chạy lại vô ích.
  const getShooterHandPos = useCallback((cardId: string): THREE.Vector3 => {
    if (!state) return DECK_POS.clone();
    const n = state.players.length;
    const myIdx = Math.max(0, state.players.findIndex((p) => p.id === myId));
    let shooterId = cardShooterMap.get(cardId);
    if (!shooterId && state.resume?.cardId === cardId) {
      shooterId = state.resume.playerId;
    }
    if (!shooterId && state.discard.length > 0 && state.discard[state.discard.length - 1].id === cardId) {
      shooterId = state.resume?.playerId;
      if (!shooterId) {
        const prevIdx = (((state.turn - state.direction) % n) + n) % n;
        shooterId = state.players[prevIdx]?.id;
      }
    }
    if (shooterId === myId) {
      return new THREE.Vector3(0, 0.45, 2.14);
    }
    if (shooterId) {
      const shooterIdx = state.players.findIndex((p) => p.id === shooterId);
      if (shooterIdx >= 0) {
        const shooterSeatJ = seatIndex(shooterIdx, myIdx, n);
        const p = seatPos(shooterSeatJ, n, 2.15);
        return new THREE.Vector3(p.x, 0.45, p.z);
      }
    }
    return DECK_POS.clone();
  }, [state, myId, cardShooterMap]);

  useEffect(() => {
    let dead = false;
    const done = () => { if (!dead) setFontsReady(true); };
    if (typeof document !== 'undefined' && document.fonts) document.fonts.ready.then(done);
    else done();
    return () => { dead = true; };
  }, []);

  const items = useMemo(
    () => (state ? collect(state, myId, gfx.maxDiscard, gfx.maxOppCards) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version, state, myId, gfx.maxDiscard, gfx.maxOppCards],
  );


  // Tính toán vị trí xòe Accordion khi bài chính diện > 12 lá
  const accordionProgress = useMemo(() => {
    if (!state) return new Map<string, number>();
    const myItems = items.filter((it) => it.mine && it.zone === 'hand');
    const result = new Map<string, number>();
    if (myItems.length <= 1) {
      if (myItems[0]) result.set(myItems[0].card.id, 0);
      return result;
    }

    // Nếu <= 12 lá: xòe đều tiêu chuẩn
    if (myItems.length <= 12) {
      myItems.forEach((it, i) => {
        result.set(it.card.id, (i / (myItems.length - 1)) - 0.5);
      });
      return result;
    }

    // Khi > 12 lá: gom cụm theo màu, hover màu nào thì nhóm màu đó bung rộng ra
    const weights: number[] = [];
    const interGaps: boolean[] = [];
    let prevColor: string | null = null;

    for (let i = 0; i < myItems.length; i++) {
      const f = face(myItems[i].card, state.side);
      const col = f.color;
      let w = 1.0;

      if (hoveredColor) {
        if (col === hoveredColor) {
          w = 1.45; // Nhóm màu đang hover được mở rộng thoải mái đọc số
        } else {
          w = 0.22; // Các nhóm màu khác xếp co cụm gọn gàng
        }
      } else {
        w = 0.65; // Cân bằng các cọc khi không hover
      }

      if (prevColor !== null && prevColor !== col) {
        interGaps.push(true);
      } else {
        interGaps.push(false);
      }
      prevColor = col;
      weights.push(w);
    }

    let totalWeight = 0;
    for (let i = 0; i < weights.length; i++) {
      if (interGaps[i]) totalWeight += 0.45;
      totalWeight += weights[i];
    }

    let currentWeight = 0;
    for (let i = 0; i < myItems.length; i++) {
      if (interGaps[i]) currentWeight += 0.45;
      const w = weights[i];
      const centerWeight = currentWeight + w * 0.5;
      currentWeight += w;
      const progress = totalWeight > 0 ? (centerWeight / totalWeight) - 0.5 : 0;
      result.set(myItems[i].card.id, progress);
    }

    return result;
  }, [items, state, hoveredColor]);

  useEffect(() => {
    if (!state || paused) return;
    const n = state.players.length;
    const myIdx = Math.max(0, state.players.findIndex((p) => p.id === myId));
    // Chặng đổi tay bài 0/7 tại thời điểm effect này chạy.
    const sw = swapRef.current;
    const swElapsed = sw ? Date.now() - sw.at : 0;
    const swPhase: 0 | 1 | null = !sw
      ? null
      : swElapsed < SWAP_GATHER_MS ? 0
      : swElapsed < SWAP_GATHER_MS + SWAP_FLY_MS ? 1
      : null;
    // Hai tín hiệu cho cùng một câu hỏi "đã sang ván mới chưa", vì mỗi cái có
    // một điểm mù riêng:
    //  - dealSeq: đếm event 'deal' thật của engine. Chính xác tuyệt đối, nhưng
    //    im lặng khi state mới về qua đường resync/poll (những lần đó không kèm
    //    event nào).
    //  - roundNo: luôn có mặt trong state, kể cả bản resync.
    const dealing = dealSeq !== lastDeal.current || state.roundNo !== lastRound.current;
    if (dealing) {
      lastDeal.current = dealSeq;
      lastRound.current = state.roundNo;
      knownCardsByPlayer.current.clear();
      // Kéo mọi lá về bộ bài và giấu đi, để ván nào cũng chia bài giống ván đầu
      // — engine đánh số lá lại từ 'c0' nên mesh cũ được dùng lại, không tự
      // quay về trạng thái 'vừa mount' được (xem resetForNewRound).
      resetForNewRound(DECK_POS);
    }

    // Đếm bài mới rút của từng người để tạo delay so le (stagger)
    const newCardsThisUpdate = new Map<string, number>();

    for (const it of items) {
      if (it.zone === 'deck') {
        const t = deckTransform(it.index);
        setTarget(it.card.id, t.p, t.q, t.s, { snapIfFresh: true });
        continue;
      }

      if (it.zone === 'discard') {
        const t = discardTransform(it.index, it.layerIndex);
        const isFirstCardOfRound = it.index === 0;

        if (!isFirstCardOfRound) {
          const shooterHandPos = getShooterHandPos(it.card.id);
          setSpawnOrigin(it.card.id, shooterHandPos, new THREE.Euler(-Math.PI / 2, 0, 0));
        }

        setTarget(it.card.id, t.p, t.q, t.s, {
          arc: 0.85,
          dur: CARD_FLIGHT_MS / 1000,
          snapIfFresh: isFirstCardOfRound,
        });
        continue;
      }

      // Vùng bài trên tay người chơi
      const seatJ = seatIndex(it.ownerIdx, myIdx, n);

      // LUẬT 0/7 — gom bài -> trao cho nhau -> xoè lại.
      // state ĐÃ đổi tay xong ngay khi engine xử lý, nên "chủ cũ" của 1 lá
      // chính là NGƯỜI CÒN LẠI trong cặp đổi. Dồn mọi lá về đúng 1 điểm bằng
      // cách mượn fanTransform với count=1 (tâm quạt bài của ghế đó) — không
      // phải bịa công thức toạ độ mới.
      const ownerId = state.players[it.ownerIdx]?.id ?? '';
      if (sw && swPhase !== null) {
        const formerIdx = formerOwnerIdx(sw, it.ownerIdx, ownerId, state.players);
        // Chặng 0 gom về tay CHỦ CŨ, chặng 1 bay sang tay CHỦ MỚI (chính chủ).
        const holderIdx = formerIdx < 0 ? -1 : swPhase === 0 ? formerIdx : it.ownerIdx;
        if (holderIdx >= 0) {
          const mineHolder = state.players[holderIdx]?.id === myId;
          const g = fanTransform(seatIndex(holderIdx, myIdx, n), n, 0, 1, {
            self: mineHolder,
            faceUp: mineHolder,
          });
          setTarget(it.card.id, g.p, g.q, g.s, {
            delay: 0, // TẤT CẢ bay cùng lúc — đổi bài là tức thì, không chuyền lẻ
            dur: (swPhase === 0 ? SWAP_GATHER_MS : SWAP_FLY_MS) / 1000,
            arc: swPhase === 0 ? 0.08 : 0.75,
          });
          continue;
        }
      }

      const customProgress = it.mine ? accordionProgress.get(it.card.id) : undefined;
      const isHovered = it.mine && it.card.id === hoveredCardId;
      const hoverProgress = it.mine && hoveredCardId ? accordionProgress.get(hoveredCardId) : undefined;
      const t = fanTransform(seatJ, n, it.index, it.count, {
        self: it.mine,
        faceUp: it.mine,
        customProgress,
        layerOrder: it.mine ? it.layerIndex : undefined,
        hoverProgress,
        isHovered,
      });

      // Độ trễ bay bài — CHỈ 2 trường hợp được xếp hàng lệch pha:
      //  1. Chia bài đầu ván: vòng tròn từng lá (0.055s/lá).
      //  2. RÚT TỪ BỘ BÀI (drawnCardIds — có event 'draw' thật): 0.5s/lá, đúng
      //     yêu cầu "rút phải tuần tự chứ không rút 1 cục".
      // Mọi trường hợp khác (đổi bài luật 0/7, xếp lại quạt bài...) delay = 0 ->
      // bay CÙNG LÚC. Lỗi cũ: dùng "lá lạ trong tay" làm điều kiện nên bài đổi
      // tay cũng bị chuyền lẻ 0.5s/lá, 7 lá mất 3.5s.
      let delay = 0;
      const pId = state.players[it.ownerIdx]?.id ?? '';
      let knownSet = knownCardsByPlayer.current.get(pId);
      if (!knownSet) {
        knownSet = new Set();
        knownCardsByPlayer.current.set(pId, knownSet);
      }
      const isNewCard = !knownSet.has(it.card.id);
      const isInitialDeal = dealing || (knownSet.size === 0 && it.count >= 5);
      // Rút nhanh hay chậm quyết định CẢ thời gian bay LẪN nhịp lệch pha giữa
      // các lá — và khớp đúng ngân sách timeline đã tính cho bước này.
      const drawMs = fastDrawIds.has(it.card.id) ? DRAW_FAST_MS : DRAW_SLOW_MS;
      const isJustDrawn = drawnCardIds.has(it.card.id);

      if (isInitialDeal) {
        delay = (it.index * n + seatJ) * (DEAL_STAGGER_MS / 1000);
      } else if (isNewCard && isJustDrawn) {
        const orderIndex = newCardsThisUpdate.get(pId) ?? 0;
        newCardsThisUpdate.set(pId, orderIndex + 1);
        delay = orderIndex * (drawMs / 1000);
      }

      setTarget(it.card.id, t.p, t.q, t.s, {
        delay,
        dur: (isInitialDeal ? CARD_FLIGHT_MS : isNewCard && isJustDrawn ? drawMs : CARD_FLIGHT_MS) / 1000,
        arc: isInitialDeal ? 0.95 : 0.55,
        // Lá VỪA LỘ RA CHỨ KHÔNG PHẢI VỪA RÚT -> đặt thẳng vào quạt, không bay.
        //
        // Quạt bài đối phương chỉ vẽ 10 lá cuối. Khi họ cầm hơn 10 lá và đánh ra
        // một lá, cửa sổ 10 lá trượt đi một nấc: lá thứ 11 từ trước tới nay chưa
        // có mesh nay mới mount -> `fresh` -> nó BAY từ bộ bài vào tay, nhìn y
        // hệt như vừa đánh xong lại vừa rút thêm một lá. Nó không hề mới; chỉ
        // mình mới nhìn thấy nó. Bay chỉ dành cho lá thật sự vừa rút (có event
        // 'draw') hoặc lúc chia bài đầu ván.
        snapIfFresh: !isInitialDeal && !isJustDrawn,
      });
    }

    // Cập nhật danh sách các lá bài đã biết
    for (const p of state.players) {
      const set = knownCardsByPlayer.current.get(p.id) ?? new Set();
      p.hand.forEach((c) => set.add(c.id));
      knownCardsByPlayer.current.set(p.id, set);
    }
  }, [items, state, myId, version, dealSeq, paused, accordionProgress, getShooterHandPos, hoveredCardId, penaltyDrawIds, drawnCardIds, fastDrawIds, swapTick]);

  // 1 vòng lặp duy nhất cho toàn bộ chuyển động của bài
  useFrame((_, dt) => tick(Math.min(dt, 0.05), gfx.smoothing, gfx.linear));

  if (!state || !fontsReady) return null;

  return (
    <group>
      {items.map((it) => {
        // Bài đã đánh ra (discard) GIỮ NGUYÊN mặt lúc đánh (state.playedSide,
        // đóng băng trong engine state) — không tự đổi hiển thị khi ván sau đó
        // bị lật (Flip). Chỉ bài còn trong bộ rút/trên tay mới theo state.side
        // hiện tại (chưa "chốt" mặt nào).
        // Lá TRÊN ĐỈNH đống luôn hiển thị theo MẶT HIỆN TẠI: lật bàn là lật cả
        // nó, và mặt vừa lộ ra mới là lá người kế tiếp phải chặn — không cho
        // thấy thì chẳng biết màu nào được đánh. Các lá BỊ ĐÈ bên dưới vẫn đóng
        // băng ở mặt lúc đánh (chúng chỉ còn là lịch sử).
        const isTopDiscard = it.zone === 'discard' && it.index === state.discard.length - 1;
        const displaySide = it.zone === 'discard' && !isTopDiscard
          ? (state.playedSide?.[it.card.id] ?? state.side)
          : state.side;
        const f = face(it.card, displaySide);
        // Viền sáng "đánh được" phải khớp CHÍNH XÁC với việc bấm có ăn hay
        // không (interactive bên dưới cũng có `&& !holding`). Trước đây thiếu
        // `!holding`: trong giai đoạn TRƯỚC ĐÁNH (đang phát animation rút phạt/
        // cấm lượt/lật bài) bài vẫn sáng nhưng bấm không ăn -> đúng lỗi được
        // báo "chưa tới lượt thì bài sáng lên" + "bấm mà không biết ra chưa".
        // (canJumpIn tự trả false khi luật jumpIn tắt — mặc định tắt.)
        const myTurnNow = state.turn === it.ownerIdx;
        const canJump = !myTurnNow && canJumpIn(it.card, state);
        const playable = it.mine && state.phase === 'awaitPlay' && !holding &&
          (myTurnNow ? canPlay(it.card, state) : canJump);

        // Lá Wild đã từng được chọn màu (state.wildColors — engine state thật,
        // đồng bộ đúng cho mọi client/người vào sau) -> hiển thị màu đó VĨNH
        // VIỄN, kể cả khi đã bị lá khác đè lên trong đống discard. Bài đã đánh
        // ra bàn KHÔNG có halo/viền phát sáng nữa — chỉ bài trên tay có thể
        // đánh mới cần chỉ báo (glowColor luôn undefined ở zone discard).
        const rememberedColor = f.color === 'wild' ? state.wildColors?.[it.card.id] : undefined;
        const hasChosenColor = !!rememberedColor;
        const displayColor = rememberedColor ?? f.color;

        // Atlas ẢNH THẬT: chỉ mặt trước cần (mặt sau luôn PHOTO_BACK_NAME cố định).
        // Nếu atlas chưa tải xong hoặc không có sprite này (vd lá "0" bộ Flip —
        // bộ ảnh thật không có) -> null, CardMesh tự rơi về atlas vẽ tay.
        const photoAtlas = photoAtlasFor(displaySide);
        // BUG ĐÃ SỬA: phải truyền f.color (LUÔN LÀ 'wild' cho lá wild) chứ không
        // phải displayColor (màu ĐÃ CHỌN, vd 'yellow') — resolvePhotoSprite tự
        // nhận diện lá wild qua color==='wild' để tra đúng tên sprite
        // wild_draw_4_yellow v.v.; truyền nhầm displayColor khiến nó rơi vào
        // nhánh màu thường (không khớp value dạng số/skip/reverse) và luôn trả
        // về null -> rơi về atlas vector. Đây là lý do lá Wild/+4 SAU KHI CHỌN
        // MÀU (tức gần như luôn luôn, kể cả trên đống bài đã đánh) hiện vector.
        const photoFaceName = photoAtlas
          ? resolvePhotoSprite(
              photoAtlas.variant,
              f.color,
              f.value,
              hasChosenColor ? displayColor : undefined,
            )
          : null;

        // ĐẶC THÙ Ú NÔ FLIP: 1 lá có 2 MẶT THẬT (light/dark), không có "mặt sau"
        // trung tính như bộ classic — mặt người khác thấy khi bài úp trong tay
        // đối thủ CHÍNH LÀ mặt CÒN LẠI thật của lá đó (không phải logo
        // 'back_side'/'flip_dark' dùng chung). Chỉ áp dụng cho bài trên tay
        // ĐỐI THỦ của bộ Flip — bộ classic và chồng rút (toàn thẻ giả lập,
        // không có 2 mặt thật) vẫn dùng PHOTO_BACK_NAME như cũ.
        let photoBackAtlas: PhotoAtlas | null | undefined;
        let photoBackNameFinal: string | null;
        if (state.deckType === 'flip' && it.zone !== 'deck') {
          // Áp dụng cho MỌI lá thật, không riêng bài đối thủ: bài trên tay mình
          // và lá nằm trên đống cũng là lá hai mặt, mặt lưng của chúng cũng là
          // mặt còn lại chứ không phải logo chung.
          //
          // Bản cũ chỉ xử lý bài đối thủ, phần còn lại rơi xuống nhánh cuối và
          // xin sprite 'back_side' trong atlas ĐANG DÙNG. Atlas Dark KHÔNG có
          // sprite đó (đúng thôi — bộ Flip vốn không có mặt lưng), nên cứ lật
          // sang mặt Dark là bài của chính mình mất mặt lưng, rơi về material
          // tạm dùng chung — và material tạm đó lại bị ghi đè `side`, kéo hỏng
          // luôn cả những lá khác. Đúng lỗi "flip tới lui là mặt lưng hỏng hết".
          const otherSide: DeckSide = state.side === 'light' ? 'dark' : 'light';
          const otherFace = face(it.card, otherSide);
          const otherAtlas = photoAtlasFor(otherSide);
          photoBackAtlas = otherAtlas;
          photoBackNameFinal = otherAtlas
            ? resolvePhotoSprite(otherAtlas.variant, otherFace.color, otherFace.value)
            : null;
        } else if (state.deckType === 'flip' && it.zone === 'deck') {
          // CHỒNG BÀI RÚT, BỘ FLIP: mặt ngửa lên của chồng chính là MẶT CÒN LẠI
          // THẬT của lá sắp rút — y như ngoài đời, ai cũng nhìn thấy và tính
          // theo nó. Bộ Flip cũng KHÔNG có sprite 'back_side' ở atlas Dark (vì
          // nó vốn không có mặt lưng chung), nên dùng PHOTO_BACK_NAME ở mặt Dark
          // là tra trượt -> lá thành ô đen trơn, đúng lỗi đã thấy.
          const otherSide: DeckSide = state.side === 'light' ? 'dark' : 'light';
          const otherAtlas = photoAtlasFor(otherSide);
          const top = state.drawPile[state.drawPile.length - 1];
          photoBackAtlas = otherAtlas;
          photoBackNameFinal = otherAtlas && top
            ? resolvePhotoSprite(otherAtlas.variant, face(top, otherSide).color, face(top, otherSide).value)
            : null;
          // Bộ rút cạn (đang chờ xáo lại) thì không tra ra tên nào — lưới an toàn
          // chung ở dưới sẽ kéo về mặt lưng của atlas Light.
        } else {
          photoBackAtlas = undefined; // undefined -> CardMesh tự dùng chung photoAtlas như cũ
          photoBackNameFinal = photoAtlas?.has(PHOTO_BACK_NAME) ? PHOTO_BACK_NAME : null;
        }

        // LƯỚI AN TOÀN CUỐI. Không bao giờ để một lá đi tiếp mà không có mặt
        // lưng: thiếu là nó rơi về material tạm, và material tạm chỉ nên xuất
        // hiện trong vài trăm ms đầu lúc atlas chưa tải xong, không phải làm
        // nền cho cả ván. Atlas Light/std luôn có 'back_side' nên luôn cứu được.
        if (!photoBackNameFinal) {
          const fallback = photoAtlasFor('light');
          if (fallback?.has(PHOTO_BACK_NAME)) {
            photoBackAtlas = fallback;
            photoBackNameFinal = PHOTO_BACK_NAME;
          }
        }

        // Xác định vị trí spawn cho lá bài đánh ra (bay từ bàn tay người vừa đánh)
        let spawnPos: THREE.Vector3 | undefined;
        let spawnRot: THREE.Euler | undefined;
        if (it.zone === 'discard') {
          spawnRot = new THREE.Euler(-Math.PI / 2, 0, 0); // Luôn ngửa mặt lên trời
          const isFirst = it.index === 0;
          if (isFirst) {
            spawnPos = DECK_POS.clone();
          } else {
            spawnPos = getShooterHandPos(it.card.id);
          }
        } else if (it.zone === 'hand') {
          // Lá bài rút vào tay mặc định spawn từ DECK_POS trong CardMesh
          spawnPos = undefined;
        }

        return (
          <CardMesh
            key={it.card.id}
            id={it.card.id}
            isMe={it.mine}
            standard={gfx.standardMaterial}
            shadows={gfx.shadows}
            sides={it.mine || it.zone === 'discard' ? 'both' : 'back'}
            photoAtlas={photoAtlas}
            photoFaceName={photoFaceName}
            photoBackAtlas={photoBackAtlas}
            photoBackName={photoBackNameFinal}
            interactive={(it.mine || it.zone === 'deck') && !holding}
            playable={playable}
            jumpIn={playable && !myTurnNow}
            hotkey={it.card.id === sCardId ? 'S' : undefined}
            layerIndex={it.layerIndex}
            spawnPos={spawnPos}
            spawnRot={spawnRot}
            cardColor={f.color}
            onHoverColor={(c) => setHoveredColor(c as CardColor | null)}
            onHoverCard={it.mine ? setHoveredCardDebounced : undefined}
            onSelect={
              it.zone === 'deck'
                ? () => act({ type: 'DRAW', playerId: myId })
                : (id) => {
                    // Lá KHÔNG đánh được -> rung + âm báo tại chỗ, không gửi
                    // action. Trước đây vẫn gửi, engine lặng lẽ từ chối và màn
                    // hình đứng im -> người chơi tưởng game bị trễ/treo (đã đo:
                    // bấm hợp lệ thì bài bay sau 2ms, không hề có độ trễ nào).
                    if (!playable) {
                      shake(id);
                      playSfx('click', 0.6);
                      return;
                    }
                    act({ type: 'PLAY', playerId: myId, cardId: id });
                  }
            }
          />
        );
      })}
      <DrawTotalPopups state={state} myId={myId} />
      <PlayFlash state={state} fx={fx} />
    </group>
  );
}
