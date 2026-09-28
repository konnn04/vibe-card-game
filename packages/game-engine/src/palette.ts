import type { Card, CardColor, CardFace, DeckSide } from './types';

/**
 * Nền tảng về MÀU và MẶT BÀI — không phụ thuộc file nào khác trong engine, để
 * cả rules.ts lẫn modes.ts dùng chung mà không import vòng tròn.
 */
export const LIGHT_COLORS: CardColor[] = ['red', 'yellow', 'green', 'blue'];
export const DARK_COLORS: CardColor[] = ['pink', 'teal', 'orange', 'purple'];

/** Mặt đang hiệu lực của lá bài theo side hiện tại của bàn. */
export function face(card: Card, side: DeckSide): CardFace {
  return side === 'dark' && card.dark ? card.dark : card.light;
}

export function colorsOf(side: DeckSide): CardColor[] {
  return side === 'light' ? LIGHT_COLORS.slice() : DARK_COLORS.slice();
}
