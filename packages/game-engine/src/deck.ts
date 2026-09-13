import type { Card, CardColor, CardValue, DeckType } from './types';
import { mulberry32, shuffle } from './rng';

export const LIGHT_COLORS: CardColor[] = ['red', 'yellow', 'green', 'blue'];
export const DARK_COLORS: CardColor[] = ['pink', 'teal', 'orange', 'purple'];

/** Map màu Light -> Dark (mặt sau của cùng 1 lá vật lý trong bộ Flip). */
export const LIGHT_TO_DARK: Record<string, CardColor> = {
  red: 'pink', yellow: 'teal', green: 'orange', blue: 'purple', wild: 'wild',
};

/**
 * Map trị Light -> Dark cho bộ Flip. Chỉ áp dụng cho các trị THUỘC bộ Flip
 * (draw1/wild2/skip) — classic không bao giờ gọi hàm này nên không cần map
 * draw2/wild4 ở đây.
 */
const VALUE_TO_DARK: Partial<Record<CardValue, CardValue>> = {
  skip: 'skipAll',
  draw1: 'draw5',
  wild2: 'wildColor',
};

function darkFaceOf(color: CardColor, value: CardValue, shiftNum: (v: string) => string) {
  const dv = VALUE_TO_DARK[value] ?? (/^\d$/.test(value) ? (shiftNum(value) as CardValue) : value);
  return { color: LIGHT_TO_DARK[color] ?? 'wild', value: dv };
}

/**
 * Bộ classic: 108 lá (mỗi màu: 0 x1, 1-9 x2, skip/reverse/draw2 x2) + 4 wild + 4 wild4.
 * Bộ flip: 112 lá — ĐÚNG theo bộ bài Flip thật (và bộ ảnh texture được cấp):
 * mỗi màu 1-9 x2 (KHÔNG có lá "0" — bộ Flip thật không có lá này ở CẢ 2 mặt),
 * skip/reverse/draw1/flip x2, cộng 4 wild + 4 wild2. Mặt Dark tương ứng luôn
 * có trị "nặng" hơn: draw1->draw5, wild2->wildColor, skip->skipAll.
 */
export function buildDeck(type: DeckType, seed: number): Card[] {
  const cards: Card[] = [];
  const rnd = mulberry32(seed ^ 0x9e3779b9);
  // Số ở mặt Dark lệch đi để 2 mặt không trùng nhau, LUÔN nằm trong 1-9 (bộ
  // Flip thật không có lá "0" ở mặt Dark) — deterministic theo seed.
  const shiftNum = (v: string) => String((((Number(v) - 1) + 1 + Math.floor(rnd() * 8)) % 9) + 1);
  let n = 0;
  const push = (color: CardColor, value: CardValue) => {
    const id = `c${n++}`;
    cards.push(
      type === 'flip'
        ? { id, light: { color, value }, dark: darkFaceOf(color, value, shiftNum) }
        : { id, light: { color, value } },
    );
  };

  for (const color of LIGHT_COLORS) {
    if (type === 'flip') {
      for (let v = 1; v <= 9; v++) { push(color, String(v) as CardValue); push(color, String(v) as CardValue); }
      for (const v of ['skip', 'reverse', 'draw1', 'flip'] as CardValue[]) { push(color, v); push(color, v); }
    } else {
      push(color, '0');
      for (let v = 1; v <= 9; v++) { push(color, String(v) as CardValue); push(color, String(v) as CardValue); }
      for (const v of ['skip', 'reverse', 'draw2'] as CardValue[]) { push(color, v); push(color, v); }
    }
  }
  for (let i = 0; i < 4; i++) { push('wild', 'wild'); push('wild', type === 'flip' ? 'wild2' : 'wild4'); }
  return shuffle(cards, mulberry32(seed));
}
