import type { Card, CardValue, DeckSide, GameState, PendingDraw, Rules } from './types';
import { face } from './palette';
import { getMode } from './modes';

export const DEFAULT_RULES: Rules = {
  sevenZero: false,
  stack: true,
  jumpIn: false,
  challenge: true,
  rushPenalty: true,
  drawToMatch: false,
  forcePlay: true,
  startingCards: 7,
  turnSeconds: 20,
  maxPlayers: 4,
  teamMode: false,
  targetScore: 0,
  randomizeSeats: true,
  blowUp: false,
  blowUpAt: 36,
};

const WILD_VALUES = new Set<CardValue>([
  'wild', 'wild4', 'wild2', 'wildColor', 'wildTogether', 'wildPileUp', 'wildRev4', 'wild6', 'wild10', 'wildRoulette',
]);
export function isWildValue(v: CardValue): boolean {
  return WILD_VALUES.has(v);
}

/**
 * Số lá phạt CỐ ĐỊNH của 1 lá — KHÔNG áp dụng cho 'wildColor' (Wild Draw
 * Color không có số cố định, xem giveUntilColor() trong engine.ts).
 */
export function drawAmountOf(v: CardValue): number {
  if (v === 'draw1') return 1;
  if (v === 'draw2') return 2;
  if (v === 'wild2') return 2;
  if (v === 'wild4') return 4;
  if (v === 'draw5') return 5;
  if (v === 'draw4' || v === 'wildRev4') return 4;
  if (v === 'wild6') return 6;
  if (v === 'wild10') return 10;
  return 0;
}

/**
 * Loại phạt sẽ treo lên `pending` khi đánh lá này — null nếu lá không tạo
 * chuỗi phạt (kể cả 'wildColor': engine.ts xử lý riêng vì nó mang theo MÀU
 * chứ không phải số).
 */
function pendingKey(v: CardValue): PendingDraw {
  if (v === 'draw1') return { value: 'draw1', amount: 1 };
  if (v === 'draw2') return { value: 'draw2', amount: 2 };
  if (v === 'wild2') return { value: 'draw2f', amount: 2 };
  if (v === 'wild4') return { value: 'draw4', amount: 4 };
  if (v === 'draw5') return { value: 'draw5', amount: 5 };
  // No Mercy: mọi lá rút dồn chung một kiểu chuỗi; chồng được hay không xét
  // theo `last` (DeckMode.canStackOn), không theo `value`.
  if (v === 'draw4' || v === 'wildRev4' || v === 'wild6' || v === 'wild10') return { value: 'draw4', amount: drawAmountOf(v) };
  return null;
}
export { pendingKey };

/**
 * Có được đánh lá này lên đống hay không.
 * Khi đang có chuỗi phạt treo (stack) thì CHỈ được chồng đúng loại cho phép,
 * không được đánh lá thường (nếu không thì phải rút/chịu hết chuỗi).
 */
export function canPlay(
  card: Card,
  state: Pick<GameState, 'side' | 'discard' | 'activeColor' | 'pending' | 'rules' | 'pileUp' | 'deckType' | 'mustPlayCardId'>,
): boolean {
  const f = face(card, state.side);
  // No Mercy — vừa rút trúng lá đánh được: lượt này CHỈ được đánh đúng lá đó.
  if (state.mustPlayCardId && card.id !== state.mustPlayCardId) return false;
  // Party — vòng 3 lá con: CHỈ lá đúng màu của chồng phụ, không lá nào khác (kể cả Wild).
  if (state.pileUp) return f.color === state.pileUp.color;
  const top = state.discard[state.discard.length - 1];
  const topFace = top ? face(top, state.side) : null;

  if (state.pending) {
    // Đang có chuỗi phạt: CHỈ lá chồng được mới hợp lệ (mỗi mode tự quy định
    // chồng gì lên gì — DeckMode.canStackOn). Lá thường không bao giờ né được.
    if (!state.rules.stack) return false;
    return getMode(state.deckType ?? 'classic').canStackOn(f.value, state.pending);
  }

  if (f.color === 'wild') return true;
  if (f.color === state.activeColor) return true;
  if (topFace && f.value === topFace.value) return true;
  return false;
}

/** Jump-in: lá y hệt (cùng màu + cùng trị) lá trên cùng. */
export function canJumpIn(
  card: Card,
  state: Pick<GameState, 'side' | 'discard' | 'pending' | 'rules' | 'pileUp' | 'vote' | 'phase' | 'deckType'>,
): boolean {
  // Không đánh chen giữa vòng phụ (3 lá con), vòng bình chọn, hay khi đang chờ ai chọn gì.
  if (!state.rules.jumpIn || state.pending || state.pileUp || state.vote || state.phase !== 'awaitPlay') return false;
  const top = state.discard[state.discard.length - 1];
  if (!top) return false;
  const a = face(card, state.side);
  const b = face(top, state.side);
  // Party (Speed Play): chỉ LÁ SỐ giống hệt mới được đánh nhanh.
  if (state.deckType === 'party' && !/^\d$/.test(a.value)) return false;
  return a.color !== 'wild' && a.color === b.color && a.value === b.value;
}

// Điểm cộng cho người thắng khi kết ván = tổng điểm bài còn lại trên tay người
// thua (theo bảng điểm Ú Nô Flip chính hãng). 'wild' dùng chung 1 giá trị cho cả
// classic lẫn Flip (chính hãng Flip-wild=40 khác classic-wild=50, nhưng gộp
// chung cho gọn — chỉ lệch điểm cuối ván, không ảnh hưởng luật chơi/tính hợp lệ).
const SCORE: Partial<Record<CardValue, number>> = {
  skip: 20, reverse: 20, draw2: 20, draw1: 20,
  wild: 50, wild4: 50, wild2: 50,
  draw5: 30, skipAll: 30, wildColor: 60, flip: 20,
  pointTaken: 20, wildTogether: 50, wildPileUp: 50,
};

export function cardScore(card: Card, side: DeckSide, deckType: GameState['deckType'] = 'classic'): number {
  const f = face(card, side);
  if (/^\d$/.test(f.value)) return Number(f.value);
  // Mode có bảng điểm riêng (No Mercy: lá màu 20, Wild 50) thì theo mode.
  return getMode(deckType).scoreOf(f.value) ?? SCORE[f.value] ?? 20;
}

export function handScore(cards: Card[], side: DeckSide, deckType: GameState['deckType'] = 'classic'): number {
  return cards.reduce((s, c) => s + cardScore(c, side, deckType), 0);
}

/**
 * Lá mà phím tắt [S] sẽ đánh, hoặc null nếu không có.
 *
 * Một chỗ duy nhất cho câu hỏi này vì HAI nơi cùng cần: HUD (để hiện nút + bắt
 * phím) và bàn 3D (để gắn nhãn [S] lên đúng lá). Tách riêng mỗi bên tự tính là
 * kiểu gì cũng có lúc nhãn chỉ một lá còn phím đánh lá khác.
 *
 * Ưu tiên ĐÁNH CHEN trước: nó có hạn chót (lá khác đè lên đỉnh đống là hết
 * cửa), còn chồng phạt thì cứ tới lượt mình là vẫn còn đó.
 */
export function hotkeyCard(s: GameState, playerId: string): Card | null {
  if (s.phase !== 'awaitPlay' || s.drawRun) return null;
  const pi = s.players.findIndex((p) => p.id === playerId);
  if (pi < 0) return null;
  const hand = s.players[pi].hand;
  if (s.turn !== pi) return hand.find((c) => canJumpIn(c, s)) ?? null;
  if (s.pending) return hand.find((c) => canPlay(c, s)) ?? null;
  return null;
}
