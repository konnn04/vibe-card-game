import { isDarkArt, type Card, type CardColor, type CardFace, type DeckSide, type DeckType } from '@u-no/game-engine';
import type { AtlasId } from '@/src/ui/CardPhoto';
import { resolvePhotoSprite, type AtlasVariant } from '@/src/three/photoAtlas';

/**
 * PHẦN HIỂN THỊ CỦA TỪNG CHẾ ĐỘ CHƠI — cặp đôi với DeckMode (luật) trong
 * packages/game-engine/src/modes.ts. Engine không biết gì về ảnh hay chữ, nên
 * mọi thứ "nhìn thấy" của một mode gom ở đây: atlas ảnh bài, lá nào lấy ảnh
 * nào, slide hướng dẫn, ghi chú ở phòng chờ.
 *
 * Thêm mode mới: thêm một mục vào MODE_VISUALS (TypeScript báo thiếu nếu quên,
 * vì kiểu là Record<DeckType, ...>) + khoá i18n tương ứng.
 */
export interface Slide {
  /** Sprite mặt chính. */
  light: { atlas: AtlasId; name: string };
  /** Mặt còn lại (chỉ bộ Flip) — hiện cạnh mặt Light để thấy rõ cặp đôi. */
  dark?: { atlas: AtlasId; name: string };
  /** Khoá i18n (namespace howto): `${key}Title` + `${key}Body`. */
  key: string;
}

export interface ModeVisual {
  /** Atlas cần tải trong ván. Cards.tsx giữ đúng 2 khe tải (khe 2 có thể trống). */
  atlases: [AtlasVariant, AtlasVariant | null];
  /** Atlas của MỘT lá (theo mặt đang hiển thị và màu Wild đã chọn nếu có). */
  atlasFor(card: Card, f: CardFace, side: DeckSide, chosen?: CardColor): AtlasVariant;
  /** Bài hai mặt thật (Flip): mặt úp là mặt còn lại chứ không phải lưng chung. */
  twoSided: boolean;
  /** Tab trong Hướng dẫn chơi (khoá howto). */
  tabKey: string;
  /** Slide hướng dẫn riêng của mode. */
  slides: Slide[];
  /** Danh sách lá trong bảng (i) trong ván — thường = slides + các lá cổ điển dùng chung. */
  guide: Slide[];
  /** Khung giải thích ở phòng chờ khi chọn mode (khoá rules), hoặc null. */
  lobbyNote: { title: string; items: string[] } | null;
}

const CLASSIC: Slide[] = [
  { key: 'number', light: { atlas: 'std', name: '7_red' } },
  { key: 'skip', light: { atlas: 'std', name: 'skip_blue' } },
  { key: 'reverse', light: { atlas: 'std', name: 'reverse_green' } },
  { key: 'draw2', light: { atlas: 'std', name: 'draw_2_yellow' } },
  { key: 'wild', light: { atlas: 'std', name: 'wild_draw' } },
  { key: 'wild4', light: { atlas: 'std', name: 'wild_draw_4' } },
  { key: 'back', light: { atlas: 'std', name: 'back_side' } },
];
const CLASSIC_CARDS = CLASSIC.filter((s) => s.key !== 'back');

const FLIP: Slide[] = [
  { key: 'flipNumber', light: { atlas: 'flipLight', name: '7_red' }, dark: { atlas: 'flipDark', name: '7_pink' } },
  { key: 'flipCard', light: { atlas: 'flipLight', name: 'flip_red' }, dark: { atlas: 'flipDark', name: 'flip_dark_pink' } },
  { key: 'flipDraw', light: { atlas: 'flipLight', name: 'draw_1_blue' }, dark: { atlas: 'flipDark', name: 'draw_5_dark_cyan' } },
  { key: 'flipSkip', light: { atlas: 'flipLight', name: 'skip_green' }, dark: { atlas: 'flipDark', name: 'skip_all_darkorange' } },
  { key: 'flipReverse', light: { atlas: 'flipLight', name: 'reverse_yellow' }, dark: { atlas: 'flipDark', name: 'reverse_dark_purple' } },
  { key: 'flipWild', light: { atlas: 'flipLight', name: 'wild_draw' }, dark: { atlas: 'flipDark', name: 'wild_dark' } },
  { key: 'flipWildDraw', light: { atlas: 'flipLight', name: 'wild_draw_2' }, dark: { atlas: 'flipDark', name: 'draw_until_dark' } },
];

/** Bộ Hỗn loạn = toàn bộ lá cổ điển + các lá Dark một mặt dưới đây. */
const CHAOS: Slide[] = [
  { key: 'chaosIntro', light: { atlas: 'std', name: 'back_side' } },
  { key: 'chaosNumber', light: { atlas: 'flipDark', name: '7_pink' } },
  { key: 'chaosDraw5', light: { atlas: 'flipDark', name: 'draw_5_dark_purple' } },
  { key: 'chaosSkipAll', light: { atlas: 'flipDark', name: 'skip_all_darkorange' } },
  { key: 'chaosReverse', light: { atlas: 'flipDark', name: 'reverse_dark_cyan' } },
  { key: 'chaosWild', light: { atlas: 'flipDark', name: 'wild_dark' } },
  { key: 'chaosWildColor', light: { atlas: 'flipDark', name: 'draw_until_dark' } },
];

/** Bộ Party = bộ cổ điển (ảnh riêng) + 3 lá độc quyền + luật Đánh nhanh. */
const PARTY: Slide[] = [
  { key: 'partyIntro', light: { atlas: 'party', name: 'back_side' } },
  { key: 'partySpeed', light: { atlas: 'party', name: '5_red' } },
  { key: 'partyPoint', light: { atlas: 'party', name: 'point_taken_red' } },
  { key: 'partyChain', light: { atlas: 'party', name: 'wild_drawn_together' } },
  { key: 'partyPile', light: { atlas: 'party', name: 'wild_pile_up' } },
];
const PARTY_CLASSIC: Slide[] = CLASSIC_CARDS.map((s) => ({ ...s, light: { ...s.light, atlas: 'party' as const } }));

/** Bộ No Mercy: lá riêng + bộ lá màu cơ bản (ảnh riêng, có lá 0). */
const NO_MERCY: Slide[] = [
  { key: 'nmIntro', light: { atlas: 'noMercy2', name: 'back_side' } },
  { key: 'nmDraw', light: { atlas: 'noMercy2', name: 'draw_4_red' } },
  { key: 'nmStack', light: { atlas: 'noMercy2', name: 'draw_10' } },
  { key: 'nmRev4', light: { atlas: 'noMercy2', name: 'reverse_draw_4' } },
  { key: 'nmSkipAll', light: { atlas: 'noMercy2', name: 'skip_all_blue' } },
  { key: 'nmDiscardAll', light: { atlas: 'noMercy2', name: 'color_discard_all_green' } },
  { key: 'nmRoulette', light: { atlas: 'noMercy2', name: 'wild_all_color_face' } },
  { key: 'nmSevenZero', light: { atlas: 'noMercy1', name: '7_yellow' } },
  { key: 'nmMercy', light: { atlas: 'noMercy1', name: 'back_side' } },
];
const NO_MERCY_BASIC: Slide[] = [
  { key: 'number', light: { atlas: 'noMercy1', name: '7_red' } },
  { key: 'skip', light: { atlas: 'noMercy1', name: 'skip_blue' } },
  { key: 'reverse', light: { atlas: 'noMercy1', name: 'reverse_green' } },
  { key: 'draw2', light: { atlas: 'noMercy1', name: 'draw_2_yellow' } },
];
/** Trị lá nằm ở ảnh phần 2 của No Mercy; còn lại ở phần 1. */
const NO_MERCY_PART2 = new Set(['skipAll', 'draw4', 'discardAll', 'wildRev4', 'wild6', 'wild10', 'wildRoulette']);

const DARK_SET = new Set<CardColor>(['pink', 'teal', 'orange', 'purple']);

export const MODE_VISUALS: Record<DeckType, ModeVisual> = {
  classic: {
    atlases: ['std', null],
    atlasFor: () => 'std',
    twoSided: false,
    tabKey: 'tabClassic',
    slides: CLASSIC,
    guide: CLASSIC,
    lobbyNote: null,
  },
  flip: {
    atlases: ['flipLight', 'flipDark'],
    atlasFor: (_c, _f, side) => (side === 'dark' ? 'flipDark' : 'flipLight'),
    twoSided: true,
    tabKey: 'tabFlip',
    slides: FLIP,
    guide: FLIP,
    lobbyNote: null,
  },
  chaos: {
    atlases: ['std', 'flipDark'],
    // Lá hệ Dark lấy ảnh mặt Dark của bộ Flip. Riêng Đổi màu thường gọi được
    // cả 8 màu: chọn màu của hệ kia thì hiện bằng ảnh Đổi màu hệ đó (đã tô màu).
    atlasFor: (card, f, side, chosen) => {
      if (f.value === 'wild' && chosen && chosen !== 'wild') return DARK_SET.has(chosen) ? 'flipDark' : 'std';
      return isDarkArt(card, side) ? 'flipDark' : 'std';
    },
    twoSided: false,
    tabKey: 'tabChaos',
    slides: CHAOS,
    guide: [...CHAOS, ...CLASSIC_CARDS],
    lobbyNote: { title: 'chaosTitle', items: ['chaosDeck', 'chaosPlayers', 'chaosExplode', 'chaosNoDrawToMatch'] },
  },
  party: {
    atlases: ['party', null],
    atlasFor: () => 'party',
    twoSided: false,
    tabKey: 'tabParty',
    slides: PARTY,
    guide: [...PARTY, ...PARTY_CLASSIC],
    lobbyNote: { title: 'partyTitle', items: ['partyDeck', 'partyPlayers', 'partyForced', 'partyExplode'] },
  },
  noMercy: {
    atlases: ['noMercy1', 'noMercy2'],
    atlasFor: (_c, f) => (NO_MERCY_PART2.has(f.value) ? 'noMercy2' : 'noMercy1'),
    twoSided: false,
    tabKey: 'tabNoMercy',
    slides: NO_MERCY,
    guide: [...NO_MERCY, ...NO_MERCY_BASIC],
    lobbyNote: { title: 'nmTitle', items: ['nmDeck', 'nmPlayers', 'nmForced', 'nmExplode'] },
  },
};

export function modeVisual(t: DeckType): ModeVisual {
  return MODE_VISUALS[t] ?? MODE_VISUALS.classic;
}

/** Sprite MẶT của một lá (atlas + tên) theo mode đang chơi. */
export function resolveCardSprite(
  deckType: DeckType,
  side: DeckSide,
  card: Card,
  f: CardFace,
  chosenColor?: CardColor,
): { variant: AtlasVariant; name: string | null } {
  const variant = modeVisual(deckType).atlasFor(card, f, side, chosenColor);
  return { variant, name: resolvePhotoSprite(variant, f.color, f.value, chosenColor) };
}
