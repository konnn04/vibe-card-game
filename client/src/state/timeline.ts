'use client';
import type { GameEvent, GameState } from '@u-no/game-engine';

/* ─────────────────────────────────────────────────────────────────────────
 * THỜI LƯỢNG ANIMATION — NGUỒN SỰ THẬT DUY NHẤT
 *
 * Mọi con số dưới đây được IMPORT ở đúng nơi tạo ra animation (tween trong
 * Cards.tsx, keyframes trong globals.css), nên thời lượng dùng để KHOÁ NHỊP và
 * thời lượng animation THẬT không thể lệch nhau.
 *
 * Trước đây file này có một bảng ANIM_MS chép tay, còn `dur` của tween nằm rải
 * trong Cards.tsx — hai bên trôi khỏi nhau và sinh ra đúng loại lỗi "bot đánh
 * đè lên animation" / "khoá input lâu hơn hình". Giờ chỉ còn một chỗ để sửa.
 * ───────────────────────────────────────────────────────────────────────── */

/** Lá bay từ tay ra đống discard (Cards.tsx dùng làm dur). */
export const CARD_FLIGHT_MS = 380;
/**
 * RÚT CHẬM — rút tới khi đánh được / tới khi ra màu / chủ động rút 1 lá.
 * Người chơi cần kịp NHÌN MẶT từng lá mới biết dừng chưa (text.txt mục 6:
 * Draw -> Reveal -> Check), nên để rộng rãi.
 */
export const DRAW_SLOW_MS = 520;
/**
 * RÚT NHANH (Fast Draw) — khi bị phạt (+2, +4, +6 dồn stack, bắt Ú Nồ, challenge):
 * - DRAW_FAST_STAGGER_MS: độ trễ cất cánh giữa 2 lá liên tiếp (nhanh, dồn dập "quèo quèo" 75ms/lá).
 * - DRAW_FAST_DUR_MS: thời gian 1 lá bay trên không (260ms).
 */
export const DRAW_FAST_STAGGER_MS = 75;
export const DRAW_FAST_DUR_MS = 260;
export const DRAW_FAST_MS = DRAW_FAST_STAGGER_MS;
/**
 * Chia bài đầu ván: độ lệch pha giữa 2 lá liên tiếp.
 *
 * 38ms là QUÁ NHANH: mỗi lá kèm một tiếng 'whoosh', cách nhau 38ms thì 28 tiếng
 * dính thành một cục rào rào không nghe ra từng lá. Ở mức này tai tách bạch
 * được từng lá mà cả lượt chia vẫn chưa tới 2.5 giây.
 */
export const DEAL_STAGGER_MS = 70;
/** Luật 0/7: gom bài -> bay sang tay mới -> xoè lại. */
export const SWAP_GATHER_MS = 300;
export const SWAP_FLY_MS = 420;
export const SWAP_FAN_MS = 380;
/** Biểu tượng cấm lượt — PHẢI khớp @keyframes banPop trong globals.css (1.2s). */
export const BAN_POP_MS = 1200;
/** Lật cả bàn (Flip): đổi mặt toàn bộ bài + đổi tông nền. */
export const FLIP_MS = 900;
/** Wild đã chọn màu: cú quét màu toàn màn (@keyframes colorWash, 0.75s). */
export const COLOR_MS = 700;
/**
 * Đổi chiều: vòng mũi tên trên bàn LẬT từng cái một chạy vòng quanh, kèm badge
 * chiều đánh chớp sáng. 260ms (bản cũ, hồi mũi tên chỉ nhảy 180 độ tức thì) là
 * quá ngắn để mắt bắt được cú lật — nới ra vừa đủ cho cả vòng lật xong.
 */
export const REVERSE_MS = 520;
/** Bắt lỗi +4: kéo dài để kịp nhìn animation và kết quả thắng/thua. */
export const CHALLENGE_MS = 1400;
/** Đệm nhỏ sau mỗi animation để mắt kịp chốt, tránh cắt ngay khung cuối. */
const SETTLE_MS = 50;
/**
 * Mỗi khoảng của lượt luôn kéo ÍT NHẤT chừng này, kể cả khi chẳng có gì để xem
 * (vd bước chỉ có mỗi [turn]). Không có nhịp nghỉ này thì các khoảng dính liền
 * nhau, mắt không kịp nhận ra lượt đã sang người khác.
 */
export const MIN_PHASE_MS = 300;
/**
 * KHOẢNG LẶNG TRƯỚC ĐÒN PHẠT.
 *
 * Lá chức năng (+2, +4, cấm lượt, rút tới khi ra màu) trước đây nổ hậu quả ngay
 * khung hình sau khi lá chạm bàn: tiếng "đặt bài" và tiếng "rút phạt" chồng lên
 * nhau thành một cục, còn mắt thì chưa kịp đọc xem lá vừa xuống là lá gì.
 * Chèn một nhịp nghỉ ngắn ở ĐÚNG ranh giới đó — lá đáp xuống, ngưng một nhịp,
 * rồi đòn phạt mới bay sang nạn nhân.
 */
export const PENALTY_LEAD_MS = 300;

/**
 * GIAI ĐOẠN NÀO CỦA LƯỢT. Theo text.txt:
 *  - TURN_END   (hậu quả của lá VỪA ĐÁNH): play, color, reverse, flip, swap, rotate
 *  - TURN_START (người KẾ TIẾP nhận hiệu ứng): turn, skip, skipAll, draw, caught
 * Ranh giới này quyết định chỗ CẮT bước — xem splitFrames().
 */
const TURN_END_EVENTS = new Set<GameEvent['t']>(['play', 'color', 'reverse', 'flip', 'swap', 'rotate']);

/** Thời lượng animation của MỘT event, tính từ chính hằng số tween ở trên. */
function eventMs(e: GameEvent, state: GameState): number {
  switch (e.t) {
    case 'deal': {
      // Chia bài vòng tròn từng lá: lá cuối xuất phát sau (n*cards - 1) nhịp
      // lệch pha, rồi còn phải bay hết quãng của nó. Tính từ CHÍNH state nên
      // đổi số người / số lá khởi tạo là tự đúng theo, không phải sửa tay.
      const cards = state.players.length * state.rules.startingCards;
      return (cards - 1) * DEAL_STAGGER_MS + DRAW_SLOW_MS;
    }
    case 'play': return CARD_FLIGHT_MS;
    case 'draw': {
      const n = Math.max(1, e.cardIds.length);
      return e.fast ? (n - 1) * DRAW_FAST_STAGGER_MS + DRAW_FAST_DUR_MS : n * DRAW_SLOW_MS;
    }
    case 'skip':
    case 'skipAll': return BAN_POP_MS;
    case 'flip': return FLIP_MS;
    case 'swap':
    case 'rotate': return SWAP_GATHER_MS + SWAP_FLY_MS + SWAP_FAN_MS;
    case 'color': return COLOR_MS;
    case 'reverse': return REVERSE_MS;
    case 'challenge': return e.revealedCard ? 1600 : 1200;
    // turn/reject/rush/reshuffle/emote/roundEnd/matchEnd: không có gì để xem
    default: return 0;
  }
}

/**
 * Tổng thời lượng của MỘT bước. Các hiệu ứng trong cùng bước chạy TUẦN TỰ nên
 * cộng dồn — đúng mô hình "Animation A xong -> B xong -> C xong -> Commit State".
 */
export function animMsOf(events: GameEvent[], state: GameState): number {
  if (!events.length) return 0;
  let total = 0;
  for (const e of events) total += eventMs(e, state);
  if (total === 0) return 0;
  return Math.max(MIN_PHASE_MS, total + SETTLE_MS);
}

/**
 * Âm thanh của event này phải phát TRỄ bao lâu so với lúc commit.
 *
 * Tiếng đặt bài phải kêu đúng lúc lá CHẠM MẶT BÀN, không phải lúc nó vừa rời
 * tay — đó là lý do nghe cứ lệch pha với hình. Tương tự, tiếng rút bài kêu khi
 * lá đáp vào tay. Các hiệu ứng còn lại (cấm lượt, lật bàn, đổi bài) bắt đầu
 * ngay từ khung đầu nên phát luôn.
 */
export function sfxDelayOf(e: GameEvent): number {
  // Tiếng đặt bài phải kêu đúng lúc lá CHẠM MẶT BÀN — tức sau đúng thời gian bay.
  if (e.t === 'play') return CARD_FLIGHT_MS;
  if (e.t === 'draw') return e.fast ? DRAW_FAST_DUR_MS : DRAW_SLOW_MS;
  return 0;
}

/**
 * CẮT MỘT BƯỚC CỦA ENGINE THÀNH ĐÚNG CÁC GIAI ĐOẠN CỦA LƯỢT.
 *
 * Engine trả về state + events trong MỘT nhịp, ví dụ đánh lá thường là
 * [play, turn]: lá bay ra VÀ lượt đã sang người khác, cùng một khoảnh khắc.
 * Commit thẳng cả cục thì banner đổi lượt ngay lúc lá mới rời tay — đúng lỗi
 * "bài chưa đánh ra xong nó đã chuyển lượt rồi".
 *
 * text.txt mục 3: toàn bộ animation TURN_END phải xong rồi mới sang
 * NEXT_PLAYER. Nên cắt tại event đầu tiên KHÔNG thuộc TURN_END:
 *   [play, turn]        -> [play] rồi mới [turn]
 *   [play, skip, turn]  -> [play] rồi mới [skip, turn]   (skip là TURN_START
 *                          của nạn nhân, phải hiện SAU khi lượt đã sang họ)
 *
 * Bước đầu dùng state MỚI nhưng GIỮ NGUYÊN `turn` cũ, nên lá bay ra trong khi
 * lượt vẫn còn là của người vừa đánh — đúng thứ tự người chơi nhìn thấy.
 */
export function splitFrames(prev: GameState | null, state: GameState, events: GameEvent[]): Frame[] {
  if (!prev || events.length < 2) return [{ state, events }];

  // Bắt đầu bằng event 'challenge' (bắt lỗi +4) -> Phải chiếu màn bắt lỗi / lật bài trước,
  // sau đó mới tới bước rút bài phạt dồn và chuyển lượt.
  if (events[0].t === 'challenge') {
    const headEvents = [events[0]];
    const tailEvents = events.slice(1);
    const drawnPlayerIds = new Set(tailEvents.filter((e) => e.t === 'draw').map((e) => e.playerId));
    let headState: GameState = { ...state, turn: prev.turn };
    if (drawnPlayerIds.size > 0 && prev) {
      headState = {
        ...headState,
        drawPile: prev.drawPile,
        players: headState.players.map((p) => {
          if (!drawnPlayerIds.has(p.id)) return p;
          const prevP = prev.players.find((x) => x.id === p.id);
          return prevP ? { ...p, hand: prevP.hand } : p;
        }),
      };
    }
    const head: Frame = { state: headState, events: headEvents, phase: 'end' };
    const tail: Frame = { state, events: tailEvents, phase: 'start' };
    return [head, tail];
  }

  let cut = 0;
  while (cut < events.length && TURN_END_EVENTS.has(events[cut].t)) cut++;
  if (cut === 0 || cut === events.length) return [{ state, events }];

  const headEvents = events.slice(0, cut);
  const tailEvents = events.slice(cut);

  // Nếu phần sau (tail) có event 'draw' (vd đánh lá +4 phạt người sau):
  // Trong frame đầu (head), nạn nhân CHƯA ĐƯỢC nhận các lá bài đó vào tay,
  // nếu không thì bài sẽ tự xuất hiện trong tay nạn nhân ngay lúc lá bài vừa đánh ra!
  const drawnPlayerIds = new Set(tailEvents.filter((e) => e.t === 'draw').map((e) => e.playerId));
  let headState: GameState = { ...state, turn: prev.turn };
  if (drawnPlayerIds.size > 0 && prev) {
    headState = {
      ...headState,
      drawPile: prev.drawPile,
      players: headState.players.map((p) => {
        if (!drawnPlayerIds.has(p.id)) return p;
        const prevP = prev.players.find((x) => x.id === p.id);
        return prevP ? { ...p, hand: prevP.hand } : p;
      }),
    };
  }

  const head: Frame = { state: headState, events: headEvents };
  const tail: Frame = { state, events: tailEvents };
  // Đòn phạt thì chèn thêm một nhịp nghỉ vào giữa (xem PENALTY_LEAD_MS). Nhịp
  // nghỉ là một bước THẬT trong hàng đợi chứ không phải setTimeout rời: nó vẫn
  // nằm đúng chỗ khi hàng đợi bị tua nhanh, vẫn bị dọn khi rời ván.
  if (!isPenaltyFrame(tail.events)) return [head, tail];
  return [head, { state: head.state, events: [], hold: PENALTY_LEAD_MS, phase: 'end' }, tail];
}

/** Bước này có phải "nạn nhân ăn đòn" không: bị cấm lượt, hoặc bị bắt rút phạt. */
function isPenaltyFrame(events: GameEvent[]): boolean {
  return events.some((e) => e.t === 'skip' || e.t === 'skipAll' || (e.t === 'draw' && e.penalty));
}

const TURN_EFFECT_EVENTS = new Set<GameEvent['t']>(['skip', 'skipAll', 'draw', 'caught', 'challenge', 'flip', 'swap', 'rotate']);

/**
 * Giai đoạn hiện tại, suy ra từ chính các event của bước đang phát:
 *  - 'end'    : TURN_END — hậu quả lá vừa đánh (đồng hồ dừng, khoá thao tác)
 *  - 'start'  : TURN_START — người kế tiếp đang nhận hiệu ứng (cũng khoá)
 *  - 'action' : TURN_ACTION — hàng đợi rỗng, đếm giờ, thao tác bình thường
 */
export type TurnPhase = 'start' | 'action' | 'end';

export function phaseOf(pendingEvents: GameEvent[] | null): TurnPhase {
  if (!pendingEvents || pendingEvents.length === 0) return 'action';
  if (pendingEvents.some((e) => TURN_END_EVENTS.has(e.t))) return 'end';
  if (pendingEvents.some((e) => TURN_EFFECT_EVENTS.has(e.t))) return 'start';
  return 'action';
}

/**
 * Hàng đợi tụt lại quá xa (mạng dồn cục, tab ngủ dậy) thì phải ĐUỔI KỊP, không
 * thì người chơi ngồi xem lại cả phút quá khứ. Giữ nguyên THỨ TỰ, chỉ tua nhanh.
 *
 * Đo bằng TỔNG THỜI GIAN còn tồn đọng, KHÔNG phải số frame. Lỗi cũ đếm frame:
 * từ khi splitFrames() cắt mỗi bước engine thành 2 frame (TURN_END rồi
 * TURN_START), hàng đợi chạm ngưỡng "3 frame" ngay trong lúc chơi bình thường
 * -> tua còn 40% -> animation chưa chạy hết đã nhảy sang lượt khác. Tính theo
 * thời gian thì cắt frame nhỏ bao nhiêu cũng không kích hoạt nhầm.
 */
export function catchUpScale(pendingMs: number): number {
  if (pendingMs > 6000) return 0.2;
  if (pendingMs > 3000) return 0.5;
  return 1;
}

/** Bước đang chờ phát: state SAU bước đó + các event của chính bước đó. */
export interface Frame {
  state: GameState;
  events: GameEvent[];
  /**
   * Ép thời lượng của bước thay vì tính từ events. Chỉ dùng cho bước NGHỈ
   * (không event, state giữ nguyên) — xem PENALTY_LEAD_MS.
   */
  hold?: number;
  /** Ép giai đoạn thay vì suy từ events: bước nghỉ không có event nào để suy. */
  phase?: TurnPhase;
  /** Frame sinh ra từ dự đoán lạc quan (optimistic) của người chơi tại máy */
  isOptimistic?: boolean;
}

/** Thời lượng của một bước, tính cả bước nghỉ do splitFrames chèn vào. */
export function frameMs(f: Frame): number {
  return f.hold ?? animMsOf(f.events, f.state);
}
