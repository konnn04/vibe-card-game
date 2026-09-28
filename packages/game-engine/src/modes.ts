import type { Card, CardColor, CardValue, DeckSide, DeckType, GameState, PendingDraw, Rules } from './types';
import { DeckBuilder } from './deck';
import { DARK_COLORS, LIGHT_COLORS, colorsOf, face } from './palette';

/**
 * CHẾ ĐỘ CHƠI (bộ bài + luật riêng) — mỗi mode là MỘT class, gom mọi khác biệt
 * của nó về một chỗ thay vì rải `if (deckType === ...)` khắp engine/server/client.
 *
 * Thêm mode mới:
 *  1. thêm tên vào `DeckType` (types.ts);
 *  2. viết một class kế thừa DeckMode ở đây và đăng ký vào MODES;
 *  3. khai phần hiển thị (atlas ảnh, tên, slide hướng dẫn) ở client/src/modes.ts;
 *  4. nếu có lá mới: thêm trị vào CardValue + xử lý hiệu ứng trong engine.ts.
 * Server, phòng chờ, số ghế, luật bị khoá... tự đọc từ đây.
 */
export abstract class DeckMode {
  abstract readonly id: DeckType;
  /** Số người tối thiểu / tối đa. Bắt đầu ván khi thiếu người thì thêm bot cho đủ `minPlayers`. */
  readonly minPlayers: number = 2;
  abstract readonly maxPlayers: number;
  /** Luật bị ép giá trị ở mode này — phòng chờ khoá công tắc tương ứng. */
  readonly forcedRules: Partial<Rules> = {};
  /**
   * Vỡ trận MẶC ĐỊNH của mode: có số = bật sẵn với ngưỡng đó (vượt N lá là bị
   * loại); null = tắt sẵn. Luật này mode nào cũng bật/tắt và chọn ngưỡng được
   * (Rules.blowUp / blowUpAt) — đây chỉ là giá trị khởi đầu khi chọn mode.
   */
  readonly eliminateOver: number | null = null;
  /** Đánh chen (Speed Play) sai bài: phạt rút chừng này lá. 0 = chỉ từ chối. */
  readonly jumpInPenalty: number = 0;
  /** Luật mặc định khi chủ phòng CHỌN mode này (vẫn đổi được, khác forcedRules). */
  readonly defaultRules: Partial<Rules> = {};
  /** Điểm thưởng người thắng nhận cho MỖI người bị loại (vỡ trận) trong ván. */
  readonly eliminationBonus: number = 0;
  /**
   * Rút tới khi đánh được thì BẮT BUỘC đánh đúng lá vừa rút (khi luật
   * forcePlay bật). Mode khác: rút xong được đánh bất kỳ lá hợp lệ nào.
   */
  readonly mustPlayDrawn: boolean = false;

  /**
   * Đang có chuỗi phạt `pending`: lá trị `v` có chồng tiếp được không.
   * Mặc định (cổ điển/Flip/Hỗn loạn/Party): theo loại lá, lá nặng đè lá nhẹ.
   */
  canStackOn(v: CardValue, pending: NonNullable<PendingDraw>): boolean {
    // Light: draw1 chồng draw1/wild2 (yếu -> mạnh), draw2f (đã bị wild2 đè)
    // chỉ chồng được wild2. Classic: draw2 chồng draw2/wild4, draw4 chỉ wild4.
    // Hỗn loạn: +5 đè được +2/+4. Dark: draw5 chồng draw5/wildColor;
    // drawColor (Wild Draw Color) chỉ chồng được đúng loại đó.
    switch (pending.value) {
      case 'draw1': return v === 'draw1' || v === 'wild2';
      case 'draw2f': return v === 'wild2';
      case 'draw2': return v === 'draw2' || v === 'wild4' || v === 'draw5';
      case 'draw4': return v === 'wild4' || v === 'draw5';
      case 'draw5': return v === 'draw5' || v === 'wildColor';
      case 'drawColor': return v === 'wildColor';
    }
    return false;
  }

  /** Điểm cuối ván của lá chức năng trị `v` — undefined = dùng bảng chung (rules.ts). */
  scoreOf(_v: CardValue): number | undefined {
    return undefined;
  }

  /** Thành phần bộ bài — builder tự đánh id và xáo. */
  protected abstract compose(b: DeckBuilder): void;

  buildDeck(seed: number): Card[] {
    const b = new DeckBuilder(seed);
    this.compose(b);
    return b.build();
  }

  /** Các màu được gọi khi đánh lá Wild `card` (undefined = Wild cổ điển). */
  colorsFor(_card: Card | undefined, side: DeckSide): CardColor[] {
    return colorsOf(side);
  }
}

/** 108 lá cổ điển — dùng cho bộ Cổ điển và làm nền của bộ Hỗn loạn. */
function composeClassic(b: DeckBuilder) {
  b.numbers(LIGHT_COLORS, 1, 2)
    .actions(LIGHT_COLORS, ['skip', 'reverse', 'draw2'], 2)
    .add('wild', 'wild', 4)
    .add('wild', 'wild4', 4);
}

/** Ú Nồ cổ điển: 108 lá. */
class ClassicMode extends DeckMode {
  readonly id = 'classic' as const;
  readonly maxPlayers = 4;
  protected compose(b: DeckBuilder) {
    composeClassic(b);
  }
}

/**
 * Ú Nồ Flip: 112 lá HAI MẶT — đúng bộ Flip thật: mỗi màu 1-9 x2 (không có lá
 * 0 ở cả 2 mặt), skip/reverse/draw1/flip x2, cộng 4 wild + 4 wild2.
 */
class FlipMode extends DeckMode {
  readonly id = 'flip' as const;
  readonly maxPlayers = 4;
  protected compose(b: DeckBuilder) {
    for (const c of LIGHT_COLORS) {
      for (let v = 1; v <= 9; v++) b.addFlip(c, String(v) as CardValue, 2);
      for (const v of ['skip', 'reverse', 'draw1', 'flip'] as CardValue[]) b.addFlip(c, v, 2);
    }
    b.addFlip('wild', 'wild', 4).addFlip('wild', 'wild2', 4);
  }
}

const DARK_ONLY_VALUES: CardValue[] = ['draw5', 'skipAll', 'wildColor'];

/**
 * Lá này có phải lá "hệ Dark" của bộ Hỗn loạn không: cờ `art` (Đổi màu Dark),
 * màu Dark, hoặc trị chỉ bộ Dark mới có (+5, Cấm cả bàn, Rút tới khi ra màu).
 */
export function isDarkArt(card: Card, side: DeckSide): boolean {
  const f = face(card, side);
  return card.art === 'dark' || DARK_COLORS.includes(f.color) || DARK_ONLY_VALUES.includes(f.value);
}

/**
 * Ú Nồ Hỗn loạn: bộ cổ điển + 104 lá Dark MỘT MẶT (4 màu Dark: 1-9 x2, Cấm cả
 * bàn/Đổi chiều/+5 x2) + 4 Đổi màu Dark + 4 Rút tới khi ra màu = 212 lá, 8 màu,
 * tới 8 người. Rút tới khi đánh được luôn tắt; tay bài vượt 36 lá là vỡ trận.
 */
class ChaosMode extends DeckMode {
  readonly id = 'chaos' as const;
  readonly maxPlayers = 8;
  readonly forcedRules: Partial<Rules> = { drawToMatch: false };
  readonly eliminateOver = 30;
  protected compose(b: DeckBuilder) {
    composeClassic(b);
    for (const c of DARK_COLORS) {
      for (let v = 1; v <= 9; v++) b.add(c, String(v) as CardValue, 2);
      for (const v of ['skipAll', 'reverse', 'draw5'] as CardValue[]) b.add(c, v, 2);
    }
    b.add('wild', 'wild', 4, { art: 'dark' }).add('wild', 'wildColor', 4);
  }
  /**
   * 8 màu trên bàn, nhưng: Đổi màu thường (cả 2 hệ) gọi được CẢ 8 màu; Wild +4
   * chỉ 4 màu Light; Rút tới khi ra màu chỉ 4 màu Dark.
   */
  colorsFor(card: Card | undefined, side: DeckSide): CardColor[] {
    if (card && face(card, side).value === 'wild') return [...LIGHT_COLORS, ...DARK_COLORS];
    return colorsOf(card && isDarkArt(card, side) ? 'dark' : 'light');
  }
}

/**
 * Ú Nồ Party (bản Refresh 2025): 168 lá, 4-8 người. Chồng phạt và Đánh nhanh
 * (jump-in) luôn bật; đánh nhanh sai bài bị phạt rút 1 lá.
 *   Lá số 76 (mỗi màu: 0 x1, 1-9 x2) · Cấm/Đổi chiều/+2 mỗi màu x2 (24)
 *   Đổi màu 16 · +4 12 · Chỉ tay 16 (4 mỗi màu) · Cọng xích 12 · 3 lá con 12.
 */
class PartyMode extends DeckMode {
  readonly id = 'party' as const;
  readonly minPlayers = 4;
  readonly maxPlayers = 8;
  readonly forcedRules: Partial<Rules> = { stack: true, jumpIn: true };
  readonly jumpInPenalty = 1;
  /**
   * Mô phỏng 8 bot: đúng luật gốc thì Cọng xích + 3 lá con + bầu Chỉ tay dìm
   * người sắp thắng tới mức ván dài ~26.000 lá (cổ điển: ~43). Bật vỡ trận ở
   * 36 lá thì ván còn ~300 (4 người) / ~770 (8 người).
   */
  readonly eliminateOver = 36;
  protected compose(b: DeckBuilder) {
    b.numbers(LIGHT_COLORS, 1, 2)
      .actions(LIGHT_COLORS, ['skip', 'reverse', 'draw2'], 2)
      .actions(LIGHT_COLORS, ['pointTaken'], 4)
      .add('wild', 'wild', 16)
      .add('wild', 'wild4', 12)
      .add('wild', 'wildTogether', 12)
      .add('wild', 'wildPileUp', 12);
  }
}

/** Số lá rút của các lá No Mercy (bảng riêng để modes.ts không phụ thuộc rules.ts). */
const NO_MERCY_DRAW: Partial<Record<CardValue, number>> = { draw2: 2, draw4: 4, wildRev4: 4, wild6: 6, wild10: 10 };
const NO_MERCY_WILDS = new Set<CardValue>(['wildRev4', 'wild6', 'wild10', 'wildRoulette']);

/**
 * Ú Nồ No Mercy (UNO Show 'Em No Mercy): 168 lá, 2-6 người, không có Wild thường.
 *   Số 0-9 x2 mỗi màu (80) · Cấm lượt/Đổi chiều/+2/Bỏ hết x3 mỗi màu (48)
 *   Cấm cả bàn/+4 màu x2 mỗi màu (16) · Wild Đảo chiều +4 8 · Wild +6 4 ·
 *   Wild +10 4 · Wild Color Roulette 8.
 * Rút tới khi đánh được (bắt buộc đánh lá đó), chồng phạt theo GIÁ TRỊ (màu
 * không quan trọng), Mercy: đủ 25 lá là bị loại (+250 điểm cho người thắng mỗi
 * người bị loại), luật 0-7 bật sẵn, đua 1000 điểm.
 *
 * Cấu hình phòng của spec ánh xạ vào Rules chung: mercyLimit -> ngưỡng cố định
 * 25 (`blowUpAt` 24) + công tắc `blowUp`; sevenZeroRule -> `sevenZero`; stacking -> `stack`;
 * mustPlayDrawnCard -> `forcePlay`; unoPenalty -> 2 (luật hô chung);
 * turnTimeoutSec -> `turnSeconds`; scoringMode -> `targetScore` (0 / 1000).
 * Mercy = luật Vỡ trận chung (bật sẵn, ngưỡng 24 = đủ 25 lá là bị loại); chủ
 *   phòng tắt hoặc đổi ngưỡng (24/30/36/40) được như mọi mode.
 * RULE-ASSUMPTION: "bắt buộc đánh lá vừa rút" gắn với luật forcePlay — tắt
 *   forcePlay thì rút xong được chọn đánh hay bỏ lượt như các mode khác.
 */
class NoMercyMode extends DeckMode {
  readonly id = 'noMercy' as const;
  readonly maxPlayers = 6;
  readonly forcedRules: Partial<Rules> = { drawToMatch: true, challenge: false };
  readonly defaultRules: Partial<Rules> = { sevenZero: true, stack: true, forcePlay: true, jumpIn: false };
  /** Mercy: ĐỦ 25 lá là bị loại, tức vượt 24. */
  readonly eliminateOver = 24;
  readonly eliminationBonus = 250;
  readonly mustPlayDrawn = true;
  protected compose(b: DeckBuilder) {
    for (const c of LIGHT_COLORS) {
      b.add(c, '0', 2);
      for (let v = 1; v <= 9; v++) b.add(c, String(v) as CardValue, 2);
    }
    b.actions(LIGHT_COLORS, ['skip', 'reverse', 'draw2', 'discardAll'], 3)
      .actions(LIGHT_COLORS, ['skipAll', 'draw4'], 2)
      .add('wild', 'wildRev4', 8)
      .add('wild', 'wild6', 4)
      .add('wild', 'wild10', 4)
      .add('wild', 'wildRoulette', 8);
  }
  /**
   * Chồng theo GIÁ TRỊ: lá rút >= lá rút vừa chồng (màu không quan trọng, +2
   * không lên được +4). Roulette không phải lá rút nên không chồng được.
   */
  canStackOn(v: CardValue, pending: NonNullable<PendingDraw>): boolean {
    if (pending.value === 'drawColor') return false;
    const n = NO_MERCY_DRAW[v] ?? 0;
    return n > 0 && n >= (pending.last ?? pending.amount);
  }
  scoreOf(v: CardValue): number {
    return NO_MERCY_WILDS.has(v) ? 50 : 20;
  }
}

export const MODES: Record<DeckType, DeckMode> = {
  classic: new ClassicMode(),
  flip: new FlipMode(),
  chaos: new ChaosMode(),
  party: new PartyMode(),
  noMercy: new NoMercyMode(),
};

/** Thứ tự hiển thị ở phòng chờ. */
export const DECK_TYPES = Object.keys(MODES) as DeckType[];

export function isDeckType(v: unknown): v is DeckType {
  return typeof v === 'string' && v in MODES;
}

export function getMode(t: DeckType): DeckMode {
  return MODES[t] ?? MODES.classic;
}

/** Số ô ghế tối đa của mọi mode — mảng ghế của phòng luôn đủ chừng này ô. */
export const MAX_SEATS = Math.max(...Object.values(MODES).map((m) => m.maxPlayers));

export function buildDeck(type: DeckType, seed: number): Card[] {
  return getMode(type).buildDeck(seed);
}

export function maxPlayersFor(t: DeckType): number {
  return getMode(t).maxPlayers;
}

export function minPlayersFor(t: DeckType): number {
  return getMode(t).minPlayers;
}

/** Những luật bị mode khoá cứng (phòng chờ vô hiệu công tắc). */
export function lockedRules(t: DeckType): (keyof Rules)[] {
  return Object.keys(getMode(t).forcedRules) as (keyof Rules)[];
}

/**
 * Chuẩn hoá luật theo bộ bài — MỌI nơi tạo/đổi luật (server, phòng cục bộ,
 * engine) đều đi qua đây để không nơi nào lọt luật sai bộ:
 *  - maxPlayers (số người chơi chủ phòng chọn, "khoá phòng") kẹp trong
 *    minPlayers..maxPlayers của mode;
 *  - luật mode ép (forcedRules) luôn thắng.
 */
export function normalizeRules(t: DeckType, rules: Rules): Rules {
  const m = getMode(t);
  const want = Number.isFinite(rules.maxPlayers) ? Math.round(rules.maxPlayers) : m.maxPlayers;
  return {
    ...rules,
    ...m.forcedRules,
    maxPlayers: Math.min(m.maxPlayers, Math.max(m.minPlayers, want)),
    blowUp: !!rules.blowUp,
    blowUpAt: nearestBlowUp(rules.blowUpAt ?? m.eliminateOver ?? DEFAULT_BLOW_UP),
  };
}

/** Các ngưỡng vỡ trận chọn được ở phòng chờ ("vượt N lá thì nổ"). */
export const BLOW_UP_OPTIONS = [24, 30, 36, 40] as const;
const DEFAULT_BLOW_UP = 36;
/** Kẹp về ngưỡng hợp lệ gần nhất (client gửi số lạ thì không lọt vào engine). */
function nearestBlowUp(n: number): number {
  const v = Number.isFinite(n) ? n : DEFAULT_BLOW_UP;
  return BLOW_UP_OPTIONS.reduce((best, o) => (Math.abs(o - v) < Math.abs(best - v) ? o : best), BLOW_UP_OPTIONS[0] as number);
}

/** Vỡ trận mặc định khi chọn mode: bật + ngưỡng của mode, hoặc tắt (ngưỡng 36 chờ sẵn). */
function blowUpDefaults(m: DeckMode): Pick<Rules, 'blowUp' | 'blowUpAt'> {
  return { blowUp: m.eliminateOver !== null, blowUpAt: m.eliminateOver ?? DEFAULT_BLOW_UP };
}

/**
 * Luật khi CHỦ PHÒNG ĐỔI SANG mode `t`: số người về mức tối đa của mode, vỡ
 * trận bật sẵn nếu mode có. Dùng chung cho server và phòng cục bộ.
 */
export function rulesForNewDeck(t: DeckType, rules: Rules): Rules {
  const m = getMode(t);
  return normalizeRules(t, { ...rules, ...blowUpDefaults(m), ...m.defaultRules, maxPlayers: m.maxPlayers });
}

/**
 * Luật nền của một mode khi TẠO ván/phòng: mặc định chung < mặc định của mode
 * < luật được truyền vào (luật chủ phòng đã chọn luôn thắng), rồi chuẩn hoá.
 */
export function baseRulesFor(t: DeckType, rules: Partial<Rules> = {}, defaults: Rules): Rules {
  const m = getMode(t);
  return normalizeRules(t, { ...defaults, ...blowUpDefaults(m), ...m.defaultRules, ...rules });
}

/** Ngưỡng vỡ trận MẶC ĐỊNH của mode (null = mặc định tắt). */
export function blowUpLimit(t: DeckType): number | null {
  return getMode(t).eliminateOver;
}

/** Các màu được gọi khi đánh lá Wild `card` ở ván này. */
export function colorsFor(s: Pick<GameState, 'deckType' | 'side'>, card?: Card): CardColor[] {
  return getMode(s.deckType).colorsFor(card, s.side);
}
