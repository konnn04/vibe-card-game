import type { Card, CardColor, CardValue } from './types';
import { mulberry32, shuffle } from './rng';

/** Map màu Light -> Dark (mặt sau của cùng 1 lá vật lý trong bộ Flip). */
export const LIGHT_TO_DARK: Record<string, CardColor> = {
  red: 'pink', yellow: 'teal', green: 'orange', blue: 'purple', wild: 'wild',
};

/**
 * Map trị Light -> Dark cho bộ Flip. Chỉ áp dụng cho các trị THUỘC bộ Flip
 * (draw1/wild2/skip) — các bộ khác không bao giờ gọi tới.
 */
const VALUE_TO_DARK: Partial<Record<CardValue, CardValue>> = {
  skip: 'skipAll',
  draw1: 'draw5',
  wild2: 'wildColor',
};

const NUMBERS_1_9 = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as CardValue[];

/**
 * BỘ DỰNG BÀI — mỗi mode (modes.ts) mô tả thành phần bộ bài của nó bằng các
 * lệnh add*, builder lo đánh id tuần tự ("c0", "c1", ...) và xáo tất định
 * theo seed. Id phải tuần tự từ c0 mỗi ván: client dựa vào đó để reset bàn 3D
 * (xem AGENTS.md mục "Ván mới").
 */
export class DeckBuilder {
  private readonly cards: Card[] = [];
  private n = 0;
  private readonly rnd: () => number;

  constructor(private readonly seed: number) {
    this.rnd = mulberry32(seed ^ 0x9e3779b9);
  }

  /** Thêm `copies` lá một mặt. `extra` cho các cờ riêng (vd `art: 'dark'`). */
  add(color: CardColor, value: CardValue, copies = 1, extra: Partial<Card> = {}): this {
    for (let i = 0; i < copies; i++) this.cards.push({ id: `c${this.n++}`, light: { color, value }, ...extra });
    return this;
  }

  /**
   * Thêm lá HAI MẶT của bộ Flip: mặt Dark luôn có trị "nặng" hơn
   * (draw1->draw5, wild2->wildColor, skip->skipAll). Số ở mặt Dark lệch đi để 2
   * mặt không trùng nhau, LUÔN trong 1-9 (bộ Flip thật không có lá 0) —
   * deterministic theo seed.
   */
  addFlip(color: CardColor, value: CardValue, copies = 1): this {
    for (let i = 0; i < copies; i++) {
      const dv = VALUE_TO_DARK[value]
        ?? (/^\d$/.test(value) ? (String(((Number(value) + Math.floor(this.rnd() * 8)) % 9) + 1) as CardValue) : value);
      this.cards.push({
        id: `c${this.n++}`,
        light: { color, value },
        dark: { color: LIGHT_TO_DARK[color] ?? 'wild', value: dv },
      });
    }
    return this;
  }

  /** Mỗi màu: `zeros` lá 0, `sets` bộ 1-9. */
  numbers(colors: CardColor[], zeros: number, sets: number): this {
    for (const c of colors) {
      this.add(c, '0', zeros);
      for (const v of NUMBERS_1_9) this.add(c, v, sets);
    }
    return this;
  }

  /** Mỗi màu thêm `copies` lá của từng trị trong `values`. */
  actions(colors: CardColor[], values: CardValue[], copies: number): this {
    for (const c of colors) for (const v of values) this.add(c, v, copies);
    return this;
  }

  /** Xáo tất định theo seed — gọi một lần khi dựng xong. */
  build(): Card[] {
    return shuffle(this.cards, mulberry32(this.seed));
  }
}

