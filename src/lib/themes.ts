
/* ─────────────────────────────────────────────────────────────────────────
 * HỆ THỐNG NỀN (BACKGROUND THEME)
 *
 * MỘT bộ chủ đề dùng chung cho CẢ menu lẫn bàn chơi, thay cho hai thứ rời rạc
 * trước đây ("skin bàn" chỉ đổi mặt bàn 3D, còn menu thì cứng một cảnh quán cà
 * phê). Mỗi chủ đề khai báo đủ hai phần:
 *
 *   - `menu`  : bảng màu cho chữ/nhãn của menu (nền sáng thì chữ phải tối lại,
 *               không thể dùng chung một màu vàng neon cho cả bốn cảnh).
 *   - `table` : bảng màu mặt bàn + sương + ambient cho scene 3D (Table.tsx đọc
 *               thẳng từ đây).
 *
 * Cảnh nền vẽ HOÀN TOÀN bằng CSS: menu cố tình không khởi tạo WebGL (GameCanvas
 * nạp động khi vào bàn), nên nền không được phép kéo theo một GPU context.
 * Mọi chuyển động chỉ dùng transform/opacity/filter để chạy trên GPU compositor.
 * ───────────────────────────────────────────────────────────────────────── */

export type BgTheme = 'cafe' | 'meadow' | 'forest' | 'park';

export interface ThemeMeta {
  id: BgTheme;
  /** Ô màu nhỏ hiển thị trong bộ chọn. */
  swatch: string;
  /** Dòng chữ nhỏ dưới tiêu đề menu — mỗi cảnh một câu. */
  tagline: string;
  menu: {
    ink: string;
    glow: string;
    tagInk: string;
    tagBg: string;
    tagPad: string;
    tagGlow: string;
    /** Màu nền phòng khi chưa kịp vẽ cảnh (tránh chớp trắng lúc đổi chủ đề). */
    base: string;
  };
  table: {
    inner: string; mid: string; outer: string; rim: string;
    ambient: number; fog: string;
  };
}

export const THEMES: readonly ThemeMeta[] = [
  {
    id: 'cafe',
    swatch: 'linear-gradient(140deg,#2A1519,#FFB861)',
    tagline: 'late night card café',
    menu: {
      ink: '#FFE9C2',
      glow: '0 0 6px #FFB861,0 0 26px rgba(255,140,60,.85),0 0 62px rgba(255,110,40,.6)',
      tagInk: '#9FD8E0', tagBg: 'transparent', tagPad: '0',
      tagGlow: '0 0 14px rgba(110,210,225,.8)',
      base: '#160F12',
    },
    // Quán tối: ánh sáng tụ lại một vũng dưới đèn thả, không hắt đều mặt bàn.
    table: { inner: '#F2B45C', mid: '#8C3A18', outer: '#2A0F0A', rim: '#F0C489', ambient: 0.58, fog: '#140604' },
  },
  {
    id: 'meadow',
    swatch: 'linear-gradient(140deg,#8FD3E8,#6BA23C)',
    tagline: 'open meadow club',
    menu: {
      ink: '#1D3A14',
      glow: '0 2px 0 rgba(255,255,255,.9), 0 0 26px rgba(255,255,255,.85)',
      tagInk: '#14320E', tagBg: 'rgba(255,255,255,.82)', tagPad: '6px 18px 7px',
      tagGlow: 'none',
      base: '#5E9636',
    },
    table: { inner: '#EAF2C8', mid: '#8FBE4E', outer: '#2F5A22', rim: '#FFFFFF', ambient: 1.0, fog: '#4E7C2E' },
  },
  {
    id: 'forest',
    swatch: 'linear-gradient(140deg,#3A4E63,#1A2418)',
    tagline: 'highland pine lodge',
    menu: {
      ink: '#FFE9C2',
      glow: '0 0 6px #9FD8E0,0 0 26px rgba(120,200,215,.7),0 0 62px rgba(60,140,160,.5)',
      tagInk: '#9FD8E0', tagBg: 'transparent', tagPad: '0',
      tagGlow: '0 0 14px rgba(110,210,225,.8)',
      base: '#1A2418',
    },
    table: { inner: '#9BD86A', mid: '#3E8A38', outer: '#123A18', rim: '#E8FFC9', ambient: 0.82, fog: '#0C1710' },
  },
  {
    id: 'park',
    swatch: 'linear-gradient(140deg,#F4C98A,#4A4326)',
    tagline: 'golden hour park bench',
    menu: {
      ink: '#3A1B06',
      glow: '0 2px 0 rgba(255,240,214,.9), 0 0 26px rgba(255,238,205,.9)',
      tagInk: '#3A1B06', tagBg: 'rgba(255,242,220,.85)', tagPad: '6px 18px 7px',
      tagGlow: 'none',
      base: '#4A4326',
    },
    table: { inner: '#FFD79A', mid: '#B5853F', outer: '#463A1E', rim: '#FFE7B0', ambient: 0.86, fog: '#33290F' },
  },
];

export const DEFAULT_THEME: BgTheme = 'cafe';

const BY_ID = Object.fromEntries(THEMES.map((t) => [t.id, t])) as Record<BgTheme, ThemeMeta>;

/** Tra chủ đề an toàn: giá trị lạ (localStorage cũ, phòng của bản build khác) rơi về mặc định. */
export function themeMeta(id: string | null | undefined): ThemeMeta {
  return BY_ID[(id ?? '') as BgTheme] ?? BY_ID[DEFAULT_THEME];
}

export const isBgTheme = (v: unknown): v is BgTheme => typeof v === 'string' && v in BY_ID;
