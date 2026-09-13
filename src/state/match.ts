'use client';
import { create } from 'zustand';
import {
  botAction, botReaction, createGame, face, reduce,
  RUSH_GRACE_MS,
  type Action, type Card, type CardValue, type DeckType, type GameEvent, type GameState, type PlayerSeed, type Rules,
} from '@u-no/game-engine';
import { playSfx, type Sfx } from '@/src/lib/audio';
import { api, loadToken, playerId, type RoomUpdate } from './net';
import { serverNow, startClockSync, setLocalClock } from './clock';
 import {
  catchUpScale, DEAL_STAGGER_MS, frameMs, MIN_PHASE_MS, phaseOf, sfxDelayOf, splitFrames,
  type Frame, type TurnPhase,
} from './timeline';
import { busyCount } from '@/src/three/stage';
import { BOT, MATCH } from '@/src/config';

export interface FxItem {
  id: number;
  kind: GameEvent['t'] | 'jumpin';
  payload: GameEvent;
  at: number;
  /**
   * Ai GÂY ra hiệu ứng này (chỉ dùng cho 'skipAll').
   *
   * Event 'skipAll' không nói ai là người đánh lá đó, mà lá này đưa lượt về lại
   * chính họ — nên suy được từ state NGAY KHOẢNH KHẮC commit. Phải đóng băng
   * vào đây: UI đọc lại `state.turn` ở những lần render sau sẽ ra người khác,
   * làm biểu tượng cấm lượt bật/tắt theo từng lượt suốt 2.6s fx còn sống —
   * đúng lỗi 'chữ skip hiện lặp lại vài lần khi người sau đánh nhanh'.
   */
  actorId?: string;
}

export type MatchMode = 'local' | 'online';

interface MatchStore {
  mode: MatchMode;
  code: string;
  hostId: string;
  state: GameState | null;
  myId: string;
  version: number;
  fx: FxItem[];
  toast: string | null;
  /** Đang phát animation -> khoá thao tác, đồng hồ dừng (TURN_START/TURN_END). */
  animating: boolean;
  /** Giai đoạn lượt hiện tại, suy ra từ hàng đợi (xem timeline.ts). */
  phase: TurnPhase;
  /**
   * Tăng một nấc mỗi khi một lượt CHIA BÀI được commit.
   *
   * Sân khấu 3D cần biết "ván mới bắt đầu" để kéo mọi lá về bộ bài rồi chia
   * lại. Trước đây nó tự suy ra bằng cách so `state.roundNo`, nhưng số đó do
   * server dựng và có đường khiến nó không đổi giữa hai ván — suy gián tiếp là
   * hỏng. Đây là tín hiệu đọc THẲNG từ event 'deal' của engine, không thể sai.
   */
  dealSeq: number;
  /** Bài thật của mình (online): kênh riêng gửi về, ghép vào state đã bị che. */
  myCards: Record<string, Card>;
  start(opts: { players: PlayerSeed[]; rules: Partial<Rules>; deckType: DeckType; myId: string; seed?: number }): void;
  attachOnline(code: string, hostId: string): void;
  applyRemote(update: RoomUpdate): void;
  applyHand(cards: Card[]): void;
  act(action: Action): void;
  /** Giữ hàng đợi lại (màn đếm ngược trước ván) — xem queueHeld. */
  holdQueue(): void;
  releaseQueue(): void;
  /** Báo lỗi ra HUD — dùng chung cho cả thao tác phòng chờ (xem room.ts). */
  setToast(msg: string): void;
  clearToast(): void;
  dropFx(id: number): void;
  stop(): void;
}

/* ─────────────────────────────────────────────────────────────────────────
 * EVENT QUEUE -> ANIMATION QUEUE -> COMMIT STATE
 *
 * Nguyên tắc số 1 của thiết kế (text.txt mục 11): KHÔNG hiệu ứng nào được đổi
 * game state ngay lập tức. Thứ tự bắt buộc là
 *     Create Event -> Create Animation -> Animation Complete -> Commit State.
 *
 * Nên `state` mà toàn bộ UI đọc KHÔNG phải state mới nhất của engine, mà là
 * state ĐÃ COMMIT — tức bước cuối cùng đã phát xong animation. State mới từ
 * engine/server đi vào `frames` xếp hàng, `pump()` lần lượt commit từng bước
 * sau đúng thời lượng animation của bước đó (timeline.ts).
 *
 * Cách cũ làm ngược hẳn: commit ngay rồi để Cards.tsx SO SÁNH state cũ/mới mà
 * đoán ra animation. Mọi lỗi "bài bay trễ cả lượt", "bot đánh đè lên animation",
 * "đổi lượt khi bài chưa bay xong" đều là hệ quả trực tiếp của chỗ đảo ngược đó.
 * ───────────────────────────────────────────────────────────────────────── */
let frames: Frame[] = [];
/** Hẹn giờ phát SFX theo hình — dọn khi rời ván để không kêu sau khi đã thoát. */
let sfxTimers: ReturnType<typeof setTimeout>[] = [];
let frameTimer: ReturnType<typeof setTimeout> | null = null;
/**
 * KHOÁ HÀNG ĐỢI TRONG LÚC ĐẾM NGƯỢC.
 *
 * Chơi với bot thì engine chỉ chạy khi đếm ngược xong (start() gọi ở
 * handleIntroDone). Chơi online thì ngược lại: server chia bài NGAY khi chủ
 * phòng bấm bắt đầu, state về tới client cùng lúc màn đếm ngược vừa hiện —
 * pump() phát luôn tiếng chia bài khi số đếm mới ở giây thứ 5. Giữ hàng đợi lại
 * cho tới khi đếm xong thì cả hai chế độ vào bàn giống hệt nhau.
 */
let queueHeld = false;

function clearFrames() {
  frames = [];
  sfxEchoGuard.clear();
  sfxTimers.forEach(clearTimeout);
  sfxTimers = [];
  if (frameTimer) clearTimeout(frameTimer);
  frameTimer = null;
}

/** State ngay TRƯỚC nước đi đang dự đoán (để hoàn nguyên nếu server từ chối). */
let predictedFrom: GameState | null = null;
let predictedAt = -1;
/**
 * CHỐNG PHÁT ÂM HAI LẦN KHI DỰ ĐOÁN TẠI CHỖ.
 *
 * Đánh bài ở phòng online thì client tự reduce trước rồi mới gửi lên server
 * (xem act()), nên MỖI event của nước đi đó sẽ đi qua pump() hai lần: bản dự
 * đoán, rồi bản server dội về. Ghi chữ ký của cả LOẠT event dự đoán vào đây;
 * pump() gặp lại chữ ký nào thì bỏ qua âm thanh của riêng event đó (hình vẫn
 * vẽ bình thường, vì state server mới là bản chính thức).
 *
 * Trước đây chỉ chặn mỗi event 'play', nên lá cuối cùng kết thúc ván sinh ra
 * [play, roundEnd, ...]: tiếng đặt bài thì đúng một lần, còn tiếng CHIẾN THẮNG
 * kêu hai lần — và chỉ ở chế độ nhiều người, vì chơi với bot không có dự đoán.
 *
 * Mỗi chữ ký có HẠN DÙNG. Bản dội của server luôn về trong khoảng một giây;
 * chữ ký nào quá hạn mà chưa khớp nghĩa là bản dội đó KHÔNG BAO GIỜ tới (server
 * xử khác dự đoán, hoặc state về qua đường resync vốn không kèm event). Không
 * có hạn dùng thì chữ ký treo lại vĩnh viễn, mà engine đánh số lá lại từ 'c0'
 * mỗi ván — một 'play:c37' mồ côi sẽ nuốt mất tiếng của lá c37 ở ván sau, im
 * lặng và ngẫu nhiên.
 */
const ECHO_TTL_MS = 5000;
const sfxEchoGuard = new Map<string, number>();

/** Ghi chữ ký kèm hạn dùng, tiện thể dọn những cái đã quá hạn. */
function guardEcho(sigs: string[]) {
  const now = Date.now();
  for (const [sig, expiry] of sfxEchoGuard) if (expiry <= now) sfxEchoGuard.delete(sig);
  for (const sig of sigs) sfxEchoGuard.set(sig, now + ECHO_TTL_MS);
}

/** Event này có phải bản dội của một dự đoán CÒN HẠN không (và tiêu luôn chữ ký). */
function takeEcho(sig: string): boolean {
  const expiry = sfxEchoGuard.get(sig);
  if (expiry === undefined) return false;
  sfxEchoGuard.delete(sig);
  return expiry > Date.now();
}

/**
 * Chữ ký nhận dạng một event qua hai lần đi.
 *
 * KHÔNG dùng JSON.stringify cả event: bản server đi qua Firebase RTDB có thể
 * đổi thứ tự khoá của object con (vd `scores`) và mốc thời gian trong 'turn'
 * được tính bằng đồng hồ khác — chuỗi sẽ khác nhau dù là cùng một sự kiện.
 * Chỉ lấy những trường ĐỊNH DANH, đủ để phân biệt với mọi event khác trong
 * cùng một nước đi. Trả về '' = không cần canh (event không phát âm thanh).
 */
function sfxSigOf(e: GameEvent): string {
  switch (e.t) {
    case 'play': return `play:${e.cardId}`;
    case 'draw': return `draw:${e.playerId}:${e.cardIds.length}:${e.penalty}`;
    case 'skip': return `skip:${e.playerId}`;
    case 'skipAll': return 'skipAll';
    case 'reverse': return `reverse:${e.direction}`;
    case 'color': return `color:${e.color}`;
    case 'flip': return `flip:${e.side}`;
    case 'swap': return `swap:${e.a}:${e.b}`;
    case 'rotate': return `rotate:${e.direction}`;
    case 'rush': return `rush:${e.playerId}`;
    case 'caught': return `caught:${e.playerId}`;
    case 'challenge': return `challenge:${e.playerId}:${e.targetId}`;
    case 'roundEnd': return `roundEnd:${e.winnerId}`;
    default: return '';
  }
}

/**
 * Lý do bị từ chối KHÔNG đáng báo cho người chơi.
 *
 * Cuối ván, NEXT_ROUND chỉ chủ phòng gửi được ('not-host') và chỉ đúng một lần
 * ăn ('round-not-ended' cho mọi lời gọi sau đó). Cả hai đều là kết quả BÌNH
 * THƯỜNG của việc nhiều client cùng đợi một khoảnh khắc, không phải lỗi — hiện
 * toast đỏ chỉ làm người chơi tưởng game hỏng.
 */
const QUIET_REJECTS = new Set(['round-not-ended', 'not-host']);

/**
 * ĐẨY VÁN Ở PHÒNG ONLINE — HẸN ĐÚNG LÚC, KHÔNG DÒ LIÊN TỤC.
 *
 * Server có sẵn vòng tự đẩy ván bằng setTimeout, nhưng trên nền serverless tiến
 * trình bị đóng băng ngay sau khi trả response nên cái hẹn giờ đó không bao giờ
 * nổ. Client phải gõ nhịp hộ.
 *
 * Bản đầu tôi làm bằng setInterval 500ms rồi mỗi nhịp hỏi "có việc gì tới hạn
 * chưa?". Chạy thì đúng, nhưng đó là DÒ: lượt của bot dài 650ms thì hỏi 2 lần,
 * cửa sổ hô Ú Nồ thì hỏi cả chục lần, mà đa số lần hỏi chẳng để làm gì.
 *
 * Không cần dò, vì client BIẾT TRƯỚC mốc tới hạn: turnHoldUntil, turnDeadline,
 * hạn hô. Nên chỉ cần MỘT hẹn giờ đặt đúng vào mốc đó. Mỗi việc tới hạn tốn
 * đúng một request thay vì hai tới mười.
 *
 * State đổi (mình đánh bài, hoặc server dội về) thì mốc cũ hết nghĩa -> đặt lại
 * lịch. planStep() được gọi ở cuối pump() và trong applyRemote().
 */
let stepTimer: ReturnType<typeof setTimeout> | null = null;
/** Khoảng cách giữa hai khe tiếp quản. */
const STEP_SLOT_MS = 900;
/** Khe cho người đang ở hàng chờ — chỉ cứu khi cả bàn im. */
const STEP_SPECTATOR_SLOT = 6;
/** Chặn chính mình gửi dồn khi server chậm trả lời. */
const STEP_MIN_GAP_MS = 400;
let lastStepAt = 0;

/**
 * Tình trạng mạng cả phòng, do room.ts đẩy sang.
 *
 * KHÔNG import useRoom ở đây: room.ts đã import match.ts (để báo lỗi ra toast),
 * import ngược lại là thành vòng tròn. Một biến phẳng cộng một hàm set là đủ,
 * và cũng rẻ hơn một subscription.
 */
let livePresence: Record<string, { online: boolean; ts: number }> = {};
export function setLivePresence(map: Record<string, { online: boolean; ts: number }>) {
  livePresence = map;
  // Người đang giữ khe trước mình vừa rớt -> khe của mình xê lên, phải tính lại.
  planStep();
}

/** Coi như mất kết nối nếu nhịp tim im quá lâu (nhịp là 5s — xem net.ts). */
const PRESENCE_STALE_MS = 15000;

function alive(id: string): boolean {
  const p = livePresence[id];
  // Chưa có bản ghi = vừa vào phòng, chưa kịp đập nhịp nào. Coi là còn sống,
  // không thì người mới vào luôn bị nhảy khe.
  if (!p) return true;
  return p.online && Date.now() - p.ts < PRESENCE_STALE_MS;
}

function stopStepLoop() {
  if (stepTimer) clearTimeout(stepTimer);
  stepTimer = null;
}

/**
 * Đặt lịch cho lần gõ nhịp kế tiếp, hoặc không đặt gì nếu chẳng có việc gì.
 */
function planStep() {
  stopStepLoop();
  const { mode, code, myId, hostId } = useMatch.getState();
  if (mode !== 'online' || !code) return;
  const s = frames.length ? frames[frames.length - 1].state : useMatch.getState().state;
  if (!s || s.phase === 'roundEnd' || s.phase === 'matchEnd') return;

  const actorId = s.resume?.playerId ?? s.players[s.turn]?.id;
  const actor = s.players.find((p) => p.id === actorId);

  // Mốc SỚM NHẤT trong các việc đang chờ. turnDeadline luôn có mặt, nên lúc nào
  // cũng có một lần thức dậy được hẹn — kể cả khi bàn đang yên.
  const dueAts: number[] = [s.turnDeadline];
  if (s.drawRun) dueAts.push(s.turnHoldUntil);
  if (actor?.isBot) dueAts.push(s.turnHoldUntil);
  if (s.rushWindow && s.players.some((p) => p.isBot)) dueAts.push(s.rushWindow.openedAt + RUSH_GRACE_MS);
  const dueAt = Math.min(...dueAts);

  // Khe của mình: chủ phòng 0, rồi theo thứ tự ghế, người xem cuối cùng. Ai
  // đang mất kết nối thì BỊ BỎ QUA hẳn thay vì phải chờ hết khe của họ — đó là
  // toàn bộ ý nghĩa của việc chuyển vai khi có người rớt.
  const order = [
    ...(alive(hostId) ? [hostId] : []),
    ...s.players.filter((p) => !p.isBot && p.id !== hostId && alive(p.id)).map((p) => p.id),
  ];
  const mine = order.indexOf(myId);
  const rank = mine >= 0 ? mine : STEP_SPECTATOR_SLOT;

  const wait = Math.max(0, dueAt - serverNow()) + rank * STEP_SLOT_MS;
  stepTimer = setTimeout(() => {
    stepTimer = null;
    fireStep();
    // Chưa xong thì tự hẹn lại; xong rồi thì state đổi và applyRemote sẽ hẹn mới.
    planStep();
  }, Math.max(wait, 0));
}

function fireStep() {
  const { mode, code, myId } = useMatch.getState();
  if (mode !== 'online' || !code) return;
  if (Date.now() - lastStepAt < STEP_MIN_GAP_MS) return;
  lastStepAt = Date.now();
  void api.step(code, myId, loadToken(code)).catch(() => {});
}

let botTimers: ReturnType<typeof setTimeout>[] = [];
let tickTimer: ReturnType<typeof setInterval> | null = null;
let fxSeq = 0;

function clearTimers() {
  botTimers.forEach(clearTimeout);
  botTimers = [];
}

function stopLoop() {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = null;
}

/**
 * Âm riêng cho TỪNG LOẠI LÁ đánh ra; lá số không có mặt ở đây nên rơi về 'place'.
 *
 * Gộp theo SỨC NẶNG chứ không theo tên lá: tai người chơi cần phân biệt "vừa ăn
 * đòn to hay nhỏ", chứ không cần tách +4 với +5. Khai bảng thay vì viết if/else
 * để thêm luật/lá mới chỉ là thêm một dòng.
 */
const PLAY_SFX: Partial<Record<CardValue, Sfx>> = {
  skip: 'playSkip',
  skipAll: 'playSkip',
  reverse: 'reverse',
  draw1: 'playDraw2',
  draw2: 'playDraw2',
  wild2: 'playDraw4',
  wild4: 'playDraw4',
  draw5: 'playDraw4',
  wildColor: 'playDrawUntil',
  flip: 'playFlipCard',
  wild: 'action',
};

/**
 * SFX gắn với event của engine — 1 chỗ duy nhất, không rải playSfx khắp UI.
 * Cần `state` (state SAU khi áp dụng event) để tra lá vừa đánh — event 'play'
 * chỉ mang cardId, không mang value/color.
 */
function sfxFor(e: GameEvent, state: GameState) {
  switch (e.t) {
    // 'deal' được rải thành từng lá ở pump() — xem chỗ đó, không phát ở đây.
    case 'deal': return undefined;
    case 'play': {
      const card = state.discard.find((c) => c.id === e.cardId)
        ?? state.players.flatMap((p) => p.hand).find((c) => c.id === e.cardId);
      // Tra theo mặt LÚC ĐÁNH, không phải mặt hiện tại: lá 'flip' tự đổi
      // state.side ngay sau đó, dùng side mới là ra nhầm mặt của chính nó.
      const f = card ? face(card, state.playedSide?.[card.id] ?? state.side) : null;
      // Đánh chen cướp lượt -> âm riêng, nghe ra ngay là có người chen ngang.
      if (e.jump) return playSfx('jumpIn');
      return playSfx((f && PLAY_SFX[f.value]) ?? 'place');
    }
    case 'draw': {
      if (!e.penalty) return playSfx('draw');
      // Càng rút nhiều (chồng stack càng cao) -> cao độ càng trầm, nghe "nặng" hơn
      const n = e.cardIds.length;
      return playSfx('penalty', Math.max(0.5, 1 - Math.min(n, 10) * 0.055));
    }
    // Event 'skip'/'skipAll' bắn ra khi NẠN NHÂN mất lượt — khác khoảnh khắc
    // lá cấm lượt được đánh xuống (đó là 'playSkip' ở PLAY_SFX).
    case 'skip':
    case 'skipAll': return playSfx('skipped');
    case 'rush': return playSfx('rush');
    case 'caught': return playSfx('caught');
    case 'reverse': return playSfx('reverse');
    case 'color': return playSfx('color');
    case 'flip': return playSfx('flip');
    case 'swap':
    case 'rotate': return playSfx('swap');
    // Bắt lỗi +4: thắng và thua nghe KHÁC HẲN nhau — đây là khoảnh khắc ăn thua
    // lớn nhất ván, người chơi phải biết kết quả ngay không cần đọc chữ.
    case 'challenge': return playSfx(e.success ? 'challengeWin' : 'challengeLose');
    case 'roundEnd': return playSfx('win');
    case 'emote': return playSfx('click');
    default: return undefined;
  }
}

/**
 * Hiệu ứng CHỚP MỘT LẦN. Bản server dội lại của một nước đi đã dự đoán sẽ làm
 * chúng nháy thêm lần nữa, nên bị lọc bỏ (xem pump). Cố tình KHÔNG có 'draw' và
 * 'play': hai loại này còn mang dữ liệu mà Cards.tsx cần để dựng animation
 * (danh sách id lá vừa rút), bỏ đi là hỏng hình chứ không chỉ thừa một cú nháy.
 */
const ONESHOT_FX = new Set<GameEvent['t']>(
  ['skip', 'skipAll', 'caught', 'flip', 'rush', 'color', 'reverse', 'rotate', 'swap', 'roundEnd', 'matchEnd'],
);

function pushFx(prev: FxItem[], events: GameEvent[], state: GameState): FxItem[] {
  const now = Date.now();
  const keep = ['play', 'rush', 'caught', 'reverse', 'skip', 'skipAll', 'flip', 'color', 'rotate', 'swap', 'roundEnd', 'matchEnd', 'draw', 'emote'];
  const add = events
    .filter((e) => keep.includes(e.t))
    .map((e) => ({
      id: ++fxSeq, kind: e.t, payload: e, at: now,
      actorId: e.t === 'skipAll' ? state.players[state.turn]?.id : undefined,
    }));
  return [...prev.filter((f) => now - f.at < MATCH.fxTtlMs), ...add].slice(-MATCH.fxMax);
}

function normalizeClientGame(g: GameState): GameState {
  return {
    ...g,
    drawPile: Array.isArray(g.drawPile) ? g.drawPile : [],
    discard: Array.isArray(g.discard) ? g.discard : [],
    players: (g.players || []).map((p) => ({
      ...p,
      hand: Array.isArray(p.hand) ? p.hand : [],
    })),
    // Firebase không lưu object rỗng ({}) -> field có thể vắng mặt khi round
    // chưa ai đánh Wild; đảm bảo luôn là object để Cards.tsx đọc thẳng không cần check.
    wildColors: g.wildColors && typeof g.wildColors === 'object' ? g.wildColors : {},
    playedSide: g.playedSide && typeof g.playedSide === 'object' ? g.playedSide : {},
    turnHoldKind: g.turnHoldKind ?? null,
    drawRun: g.drawRun ?? null,
    roundPoints: g.roundPoints && typeof g.roundPoints === 'object' ? g.roundPoints : {},
  };
}

/** Ghép bài thật của mình vào state đã che (giữ nguyên thứ tự server trả về). */
function mergeHand(state: GameState, myId: string, myCards: Record<string, Card>): GameState {
  const norm = normalizeClientGame(state);
  const me = norm.players.find((p) => p.id === myId);
  const myHand = me?.hand ?? [];
  if (!me || !myHand.some((c) => c.hidden)) return norm;
  return {
    ...norm,
    players: norm.players.map((p) =>
      p.id === myId ? { ...p, hand: (p.hand ?? []).map((c) => myCards[c.id] ?? c) } : p,
    ),
  };
}

export const useMatch = create<MatchStore>((set, get) => ({
  mode: 'local',
  code: '',
  hostId: '',
  state: null,
  myId: '',
  version: 0,
  fx: [],
  toast: null,
  animating: false,
  phase: 'action',
  dealSeq: 0,
  myCards: {},

  /** Chế độ chơi 1 mình với bot: engine chạy ngay trong tab. */
  start({ players, rules, deckType, myId, seed }) {
    setLocalClock();
    queueHeld = false;
    stopStepLoop();
    clearTimers();
    const { state, events } = createGame({
      seed: seed ?? Math.floor(Math.random() * 2 ** 31),
      deckType,
      rules,
      players,
    });
    clearFrames();
    set({ mode: 'local', code: '', hostId: myId, state: null, myId, myCards: {}, fx: [], animating: true, phase: 'start' });
    enqueue(get, set, state, events);
    stopLoop();
    tickTimer = setInterval(() => localTick(get), MATCH.tickMs);
  },

  /** Chuyển sang chế độ online: state đến từ Firebase Realtime Database, mọi action gửi lên server. */
  attachOnline(code, hostId) {
    startClockSync();
    clearFrames();
    clearTimers();
    stopLoop();
    set({ mode: 'online', code, hostId, myId: playerId() });
    stopStepLoop();
    planStep();
  },

  applyRemote({ room, game, events }: RoomUpdate) {
    const safeEvents = Array.isArray(events) ? events : [];
    const { myId, myCards } = get();
    // Bản thật từ server đã về -> mọi dự đoán đang treo coi như xong.
    predictedFrom = null;
    predictedAt = -1;
    set({ hostId: room.hostId, code: room.code });
    if (!game) { clearFrames(); set({ state: null, version: get().version + 1 }); return; }
    // State server về -> xếp hàng, KHÔNG commit thẳng. SFX + fx phát lúc pump.
    void myId; void myCards;
    enqueue(get, set, game, safeEvents);
  },

  applyHand(cards) {
    const map: Record<string, Card> = {};
    for (const c of cards) map[c.id] = c;
    const shown = get().state;
    set({
      myCards: map,
      state: shown ? mergeHand(shown, get().myId, map) : shown,
      version: get().version + 1,
    });
  },

  /** Cửa ngõ DUY NHẤT thay đổi ván đấu ở phía client. */
  act(action) {
    const { mode, code, myId } = get();

    if (mode === 'online') {
      if (!code) return;

      // DỰ ĐOÁN TẠI CHỖ (optimistic): áp dụng nước đi của CHÍNH MÌNH ngay lập
      // tức rồi mới gửi lên server, thay vì ngồi im chờ round-trip
      // HTTP -> firebase-admin -> RTDB -> onValue (qua proxy Discord có thể mất
      // vài giây). Đó chính là lỗi "đánh ra rồi mà không biết bài ra chưa":
      // trước đây act() chỉ POST, không có gì nhúc nhích tại chỗ nên lá bài nằm
      // yên trong tay suốt thời gian chờ.
      //
      // CHỈ dự đoán PLAY: client biết chắc lá bài của mình. KHÔNG dự đoán DRAW
      // vì drawPile ở client bị che (hidden) — đoán sẽ ra sai mặt bài rồi nháy
      // khi server sửa lại. State server về sau luôn GHI ĐÈ (applyRemote), nên
      // sai lệch nhỏ nào cũng tự lành trong 1 nhịp.
      const snapshot = authoritative(get);
      const canPredict = action.type === 'PLAY' && !!snapshot && action.playerId === myId;
      if (canPredict && snapshot) {
        const { state: guess, events: guessEvents } = reduce(snapshot, action, serverNow());
        const bad = guessEvents.find((e) => e.t === 'reject');
        if (!bad) {
          // Canh CẢ LOẠT event, không riêng 'play' — xem sfxEchoGuard.
          guardEcho(guessEvents.map(sfxSigOf).filter(Boolean));
          predictedFrom = snapshot;
          predictedAt = get().version + 1;
          enqueue(get, set, guess, guessEvents);
        }
      }

      void api
        .action(code, myId, loadToken(code), action)
        .then((res) => {
          if (!res.rejected) return;
          // Server từ chối -> hoàn nguyên, TRỪ KHI đã có state thật mới hơn về
          // (applyRemote đã ghi đè rồi thì đừng đạp lên nó).
          if (predictedFrom && get().version === predictedAt) {
            set({ state: predictedFrom, version: get().version + 1 });
          }
          predictedFrom = null;
          // Dự đoán hỏng -> chữ ký treo lại sẽ nuốt oan âm thanh của event thật sau này.
          sfxEchoGuard.clear();
          if (!QUIET_REJECTS.has(res.rejected)) set({ toast: res.rejected });
        })
        .catch((e: Error) => {
          if (predictedFrom && get().version === predictedAt) {
            set({ state: predictedFrom, version: get().version + 1 });
          }
          predictedFrom = null;
          sfxEchoGuard.clear();
          set({ toast: e.message });
        });
      return;
    }

    // Chơi với máy: engine chạy tại chỗ. Phải reduce từ state MỚI NHẤT của
    // engine (cuối hàng đợi) chứ không phải state đang hiển thị — nếu không,
    // 2 nước đi liên tiếp trong lúc animation còn chạy sẽ cùng xuất phát từ
    // một state cũ và nước sau ghi đè nước trước.
    const base = authoritative(get);
    if (!base) return;
    const { state: next, events } = reduce(base, action, serverNow());
    const rejected = events.find((e) => e.t === 'reject');
    if (rejected && events.length === 1) {
      if ('playerId' in action && action.playerId === myId && rejected.t === 'reject') set({ toast: rejected.reason });
      return;
    }
    enqueue(get, set, next, events);
  },

  holdQueue() {
    queueHeld = true;
    // Khoá thao tác + dừng đồng hồ luôn: màn đếm ngược đang che bàn, không ai
    // được đánh và cũng không ai bị tính giờ.
    set({ animating: true, phase: 'start' });
  },

  releaseQueue() {
    if (!queueHeld) return;
    queueHeld = false;
    pump(get, set);
  },

  setToast: (msg) => set({ toast: msg }),
  clearToast: () => set({ toast: null }),
  dropFx: (id) => set({ fx: get().fx.filter((f) => f.id !== id) }),

  stop() {
    queueHeld = false;
    stopStepLoop();
    clearFrames();
    clearTimers();
    stopLoop();
    set({ state: null, fx: [], myCards: {}, code: '', mode: 'local', animating: false, phase: 'action', version: get().version + 1 });
  },
}));

type Getter = () => MatchStore;
type Setter = (partial: Partial<MatchStore>) => void;

/**
 * State MỚI NHẤT của engine = bước cuối trong hàng đợi, hoặc state đang hiển
 * thị nếu hàng đợi rỗng. Khác hẳn `get().state` — thứ NGƯỜI CHƠI đang nhìn,
 * vốn cố tình tụt lại sau đúng bằng thời lượng animation.
 */
function authoritative(get: Getter): GameState | null {
  return frames.length ? frames[frames.length - 1].state : get().state;
}

/**
 * Xếp một bước (state sau bước + event của bước) vào hàng đợi rồi chạy vòng bơm.
 * KHÔNG bao giờ set thẳng `state` ở nơi khác — mọi thay đổi phải qua đây.
 */
function enqueue(get: Getter, set: Setter, state: GameState, events: GameEvent[]) {
  // Cắt bước của engine thành đúng TURN_END rồi mới tới TURN_START/NEXT_PLAYER
  // — lượt chỉ được đổi SAU khi lá vừa đánh bay xong (text.txt mục 3).
  const prev = frames.length ? frames[frames.length - 1].state : get().state;
  for (const f of splitFrames(prev, state, events)) frames.push(f);
  pump(get, set);
}

/**
 * Vòng bơm: commit bước kế tiếp, rồi hẹn giờ đúng bằng thời lượng animation
 * của bước đó mới commit bước sau. Đang bận (frameTimer) thì không đụng vào.
 */
function pump(get: Getter, set: Setter) {
  if (queueHeld) return;  // đang đếm ngược trước ván
  if (frameTimer) return; // animation của bước trước còn đang chạy

  // Commit liên tiếp các bước KHÔNG có gì để xem trong cùng một nhịp — dùng
  // vòng lặp chứ không đệ quy, hàng đợi dồn cục sau khi tab ngủ dậy có thể rất dài.
  while (frames.length > 0) {
    const frame = frames.shift()!;
    const { myId, myCards } = get();

    // ÂM THANH PHÁT THEO HÌNH, không theo lúc engine tính xong: tiếng đặt bài
    // kêu đúng lúc lá CHẠM MẶT BÀN (trễ đúng bằng thời gian bay), tiếng rút kêu
    // khi lá đáp vào tay. Trước đây phát hết ngay lúc commit nên nghe lệch pha.
    // Event nào là bản dội lại của nước đi mình đã dự đoán -> vừa tắt âm, vừa
    // không đẩy lại hiệu ứng chớp một lần.
    const echoed = new Set<GameEvent>();
    for (const e of frame.events) {
      const sig = sfxSigOf(e);
      if (sig && takeEcho(sig)) { echoed.add(e); continue; }

      // CHIA BÀI: engine chỉ bắn 1 event cho MỖI NGƯỜI (4 event), trong khi mắt
      // thấy 28 lá bay ra lệch pha nhau -> nghe thành 4 tiếng rời rạc không ăn
      // khớp gì với hình. Ở đây tự rải 1 tiếng cho TỪNG LÁ, đúng bằng nhịp
      // DEAL_STAGGER_MS mà Cards.tsx dùng để xếp delay bay.
      if (e.t === 'deal') {
        // Chỉ event ĐẦU TIÊN lo phát cho cả lượt chia, 3 event còn lại bỏ qua.
        if (frame.events.indexOf(e) !== frame.events.findIndex((x) => x.t === 'deal')) continue;
        const cards = frame.state.players.length * frame.state.rules.startingCards;
        for (let i = 0; i < cards; i++) {
          sfxTimers.push(setTimeout(() => playSfx('whoosh', 1 + Math.random() * 0.15), i * DEAL_STAGGER_MS));
        }
        continue;
      }

      const wait = sfxDelayOf(e);
      if (wait <= 0) sfxFor(e, frame.state);
      else sfxTimers.push(setTimeout(() => sfxFor(e, frame.state), wait));
    }

    // Backlog = tổng thời lượng các bước CÒN LẠI trong hàng đợi (không phải số
    // bước) — xem catchUpScale trong timeline.ts.
    let backlog = 0;
    for (const f of frames) backlog += frameMs(f);
    const budget = frameMs(frame) * catchUpScale(backlog);

    set({
      state: mergeHand(frame.state, myId, myCards),
      version: get().version + 1,
      dealSeq: get().dealSeq + (frame.events.some((e) => e.t === 'deal') ? 1 : 0),
      fx: pushFx(get().fx, frame.events.filter((e) => !(echoed.has(e) && ONESHOT_FX.has(e.t))), frame.state),
      // PHẢI tính cả `budget > 0`: bước CUỐI của hàng đợi vẫn còn animation đang
      // chạy, chưa được mở khoá.
      animating: budget > 0 || frames.length > 0,
      phase: frame.phase ?? phaseOf(frame.events),
    });

    if (budget > 0) {
      waitForFrame(get, set, budget);
      return;
    }
  }

  // Hàng đợi cạn -> TURN_ACTION: đồng hồ chạy, mở khoá thao tác, bot được đi.
  if (get().animating) set({ animating: false, phase: 'action', version: get().version + 1 });
  scheduleLocalBots(get);
  // State vừa đổi -> mốc tới hạn cũ hết nghĩa, đặt lại lịch gõ nhịp.
  planStep();
}

/**
 * Chờ hết bước hiện tại rồi bơm tiếp.
 *
 * Mốc kết thúc THẬT là lúc sân khấu 3D báo không còn lá nào đang bay
 * (`busyCount() === 0`), chứ không phải lúc chạy hết ngân sách tính sẵn — đúng
 * yêu cầu "cần callback sau khi xong animation chứ đừng tính 7 lá × gì đó".
 * Chia bài đầu ván là ví dụ rõ nhất: ngân sách tính ra ~2s nhưng thực tế đàn
 * bài đáp xong sớm hơn, chờ đủ 2s là thừa.
 *
 * Ngân sách vẫn giữ, với 2 vai trò:
 *  - SÀN: luôn chờ ít nhất MIN_PHASE_MS để các khoảng không dính liền nhau.
 *  - TRẦN: lỡ có lá không bao giờ đáp thì vẫn phải đi tiếp, không treo bàn.
 */
function waitForFrame(get: Getter, set: Setter, budget: number) {
  const floor = Math.min(MIN_PHASE_MS, budget);
  const start = Date.now();
  const step = () => {
    const elapsed = Date.now() - start;
    const done = elapsed >= budget || (elapsed >= floor && busyCount() === 0);
    if (!done) { frameTimer = setTimeout(step, MATCH.frameProbeMs); return; }
    frameTimer = null;
    pump(get, set);
  };
  frameTimer = setTimeout(step, floor);
}

/**
 * Bot ở chế độ local. Thời gian "nghĩ" lấy từ BOT trong src/config.ts.
 *
 * Hàng đợi animation đã rỗng khi hàm này chạy, nên đây là thời gian nghĩ THUẦN,
 * cộng THẲNG vào độ trễ người chơi cảm nhận. Thời hàng đợi chưa có, nó chạy
 * SONG SONG với animation (Math.max) nên 650-900ms không ai thấy; giờ tuần tự
 * thì 550ms animation + 900ms nghĩ = gần 1.5s chết mỗi lượt bot — đúng lỗi
 * "bot đánh mà cả giây sau bài mới ra". Vì thế các số trong config cố tình ngắn.
 */
function scheduleLocalBots(get: Getter) {
  clearTimers();
  /**
   * CHỈ chế độ chơi với máy. Ở phòng online, BOT DO SERVER ĐIỀU KHIỂN
   * (runRoomStep) — engine chạy ở đó mới là bản chính thức.
   *
   * Thiếu dòng này thì MỌI client đều tự tính nước đi cho bot rồi bắn lên
   * /api/.../action: server từ chối gần hết (400 not-your-turn) nên nhìn bề
   * ngoài vẫn chạy, nhưng thực chất mỗi lượt bot là một tràng request rác, và
   * bot online thực ra đang được máy CHỦ PHÒNG điều khiển chứ không phải server.
   */
  if (get().mode !== 'local') return;
  // ĐANG PHÁT ANIMATION -> không ai được hành động. pump() sẽ gọi lại hàm này
  // ngay khi hàng đợi cạn. Đây là chỗ duy nhất chặn "bot đánh đè lên animation",
  // thay cho việc so mốc thời gian turnHoldUntil (vốn lệch đồng hồ là hỏng).
  if (get().animating) return;
  const s = get().state;
  if (!s || s.phase === 'roundEnd' || s.phase === 'matchEnd') return;

  const current = s.players[s.turn];
  const isRoundStart = s.discard.length <= 1;
  /** [nền, dao động] -> một con số ms; bot không được đi đều tăm tắp như máy. */
  const think = ([base, jitter]: readonly [number, number]) => base + Math.random() * jitter;

  // Chuỗi rút từng lá: tự rút lá kế tiếp NGAY khi lá trước bay xong, cho cả
  // người thật lẫn bot. Người chơi đã chọn rút rồi — không bắt bấm lại từng lá.
  if (s.drawRun && current) {
    const id = current.id;
    botTimers.push(setTimeout(() => get().act({ type: 'DRAW', playerId: id }), BOT.drawRunDelay));
    return;
  }

  if (s.phase === 'awaitColor' && s.resume && s.players.find((p) => p.id === s.resume!.playerId)?.isBot) {
    const a = botAction(s, s.resume.playerId);
    if (a) botTimers.push(setTimeout(() => get().act(a), think(BOT.pickColor)));
    return;
  }

  if (s.phase === 'awaitSwapTarget' && s.resume && s.players.find((p) => p.id === s.resume!.playerId)?.isBot) {
    const a = botAction(s, s.resume.playerId);
    if (a) botTimers.push(setTimeout(() => get().act(a), think(BOT.pickSwap)));
    return;
  }

  if (current?.isBot) {
    // Nước đầu ván đi NGAY (0ms): chia bài vừa xong là một khoảng chờ dài rồi.
    const a = botAction(s, current.id);
    if (a) botTimers.push(setTimeout(() => get().act(a), isRoundStart ? 0 : think(s.drawnThisTurn ? BOT.playAfterDraw : BOT.play)));
  }

  // Phản ứng ngoài lượt (hô RUSH, bắt phạt) — chậm hơn lượt thường để người
  // thật luôn kịp bấm trước.
  for (const p of s.players) {
    if (!p.isBot) continue;
    const r = botReaction(s, p.id);
    if (!r) continue;
    // Ân hạn hô Ú Nồ: bot phải chờ qua RUSH_GRACE_MS mới được bắt, nếu không
    // người chơi thật không bao giờ kịp bấm hô (engine cũng từ chối bắt sớm).
    const lead = r.type === 'CATCH_RUSH' ? RUSH_GRACE_MS + BOT.catchRushExtra : BOT.react[0];
    botTimers.push(setTimeout(() => get().act(r), lead + Math.random() * BOT.react[1]));
  }
}

/** Đồng hồ lượt ở chế độ local. */
function localTick(get: Getter) {
  // Đồng hồ CHỈ chạy ở TURN_ACTION. Đang phát animation (TURN_START/TURN_END)
  // thì không ai bị tính giờ — đúng mục 3 của thiết kế.
  if (get().animating) return;
  const s = get().state;
  if (!s || s.phase === 'roundEnd' || s.phase === 'matchEnd') return;
  if (serverNow() > s.turnDeadline + MATCH.timeoutSlackMs) {
    get().act({ type: 'TIMEOUT', playerId: s.resume?.playerId ?? s.players[s.turn].id });
  }
}


export const selectMe = (s: MatchStore) => s.state?.players.find((p) => p.id === s.myId) ?? null;
