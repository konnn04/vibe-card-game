import type { Card, CardColor, CardFace, CardValue, DeckSide, GameState, PendingDraw, Rules } from './types';

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
};

/** Mặt đang hiệu lực của lá bài theo side hiện tại của bàn. */
export function face(card: Card, side: DeckSide): CardFace {
  return side === 'dark' && card.dark ? card.dark : card.light;
}

export function isWildValue(v: CardValue): boolean {
  return v === 'wild' || v === 'wild4' || v === 'wild2' || v === 'wildColor';
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
  state: Pick<GameState, 'side' | 'discard' | 'activeColor' | 'pending' | 'rules'>,
): boolean {
  const f = face(card, state.side);
  const top = state.discard[state.discard.length - 1];
  const topFace = top ? face(top, state.side) : null;

  if (state.pending) {
    if (!state.rules.stack) return false;
    // Light: draw1 chồng draw1/wild2 (yếu -> mạnh), draw2f (đã bị wild2 đè)
    // chỉ chồng được wild2. Classic: draw2 chồng draw2/wild4, draw4 chỉ wild4.
    // Dark: draw5 chồng draw5/wildColor; drawColor (Wild Draw Color) chỉ
    // chồng được đúng loại đó.
    switch (state.pending.value) {
      case 'draw1': return f.value === 'draw1' || f.value === 'wild2';
      case 'draw2f': return f.value === 'wild2';
      case 'draw2': return f.value === 'draw2' || f.value === 'wild4';
      case 'draw4': return f.value === 'wild4';
      case 'draw5': return f.value === 'draw5' || f.value === 'wildColor';
      case 'drawColor': return f.value === 'wildColor';
    }
    return false; // luôn chặn lá thường khi có pending, không rơi xuống check bên dưới
  }

  if (f.color === 'wild') return true;
  if (f.color === state.activeColor) return true;
  if (topFace && f.value === topFace.value) return true;
  return false;
}

/** Jump-in: lá y hệt (cùng màu + cùng trị) lá trên cùng. */
export function canJumpIn(card: Card, state: Pick<GameState, 'side' | 'discard' | 'pending' | 'rules'>): boolean {
  if (!state.rules.jumpIn || state.pending) return false;
  const top = state.discard[state.discard.length - 1];
  if (!top) return false;
  const a = face(card, state.side);
  const b = face(top, state.side);
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
};

export function cardScore(card: Card, side: DeckSide): number {
  const f = face(card, side);
  if (/^\d$/.test(f.value)) return Number(f.value);
  return SCORE[f.value] ?? 20;
}

export function handScore(cards: Card[], side: DeckSide): number {
  return cards.reduce((s, c) => s + cardScore(c, side), 0);
}

export function colorsOf(side: DeckSide): CardColor[] {
  return side === 'light' ? ['red', 'yellow', 'green', 'blue'] : ['pink', 'teal', 'orange', 'purple'];
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
