'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_THEME, isBgTheme, type BgTheme } from '@/src/lib/themes';

export type Graphics = 'low' | 'medium' | 'high';
export type Locale = 'en' | 'vi';
export type FpsLimit = '60' | '120' | 'unlimited';

export interface SettingsState {
  locale: Locale;
  graphics: Graphics;
  fpsLimit: FpsLimit;
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  muteSfx: boolean;
  muteMusic: boolean;
  /**
   * File nhạc nền đang chọn. '' = chưa chọn -> dùng bài mặc định ghi trong
   * public/music-theme/manifest.json. 'random' = mỗi bài hết thì bốc bài khác.
   */
  musicTrack: string;
  username: string;
  avatarKey: string | null;   // key trong IndexedDB
  avatarPreset: number;       // avatar mặc định khi chưa upload
  avatarUrl?: string | null;  // URL avatar từ Discord hoặc dịch vụ ngoài
  /**
   * Chủ đề nền dùng cho CẢ menu lẫn bàn chơi (src/lib/themes.ts). Thay cho
   * `tableSkin` cũ vốn chỉ đổi được mặt bàn 3D. Ở phòng online, chủ đề của CHỦ
   * PHÒNG mới là chủ đề của ván — xem useRoom.bgTheme.
   */
  bgTheme: BgTheme;
  set: <K extends keyof SettingsState>(k: K, v: SettingsState[K]) => void;
}

/** Preset đồ họa — phải cắt giảm TÍNH TOÁN thật, không chỉ ẩn CSS. */
export const GFX = {
  low:    { dpr: [0.7, 1] as [number, number],   shadows: false, bloom: false, standardMaterial: false, particles: 0,  atlasTile: 112, smoothing: 26, linear: true,  maxDiscard: 4,  maxOppCards: 5 },
  medium: { dpr: [1, 1.25] as [number, number],  shadows: false, bloom: false, standardMaterial: true,  particles: 30, atlasTile: 144, smoothing: 14, linear: false, maxDiscard: 7,  maxOppCards: 7 },
  high:   { dpr: [1, 1.5] as [number, number],   shadows: true,  bloom: true,  standardMaterial: true,  particles: 80, atlasTile: 160, smoothing: 11, linear: false, maxDiscard: 12, maxOppCards: 9 },
} as const;

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      locale: 'vi',
      graphics: 'medium',
      // 'unlimited' = để R3F render đúng mỗi nhịp rAF (khớp tuyệt đối vsync của
      // màn hình). Ép cap 60fps từng là giá trị mặc định và gây "khựt" trên
      // màn hình không phải 60Hz — xem chú thích ở FpsGovernor (Scene.tsx).
      fpsLimit: 'unlimited',
      masterVolume: 0.8,
      sfxVolume: 0.9,
      musicVolume: 0.35,
      muteSfx: false,
      muteMusic: false,
      musicTrack: '',
      username: '',
      avatarKey: null,
      avatarPreset: 0,
      avatarUrl: null,
      bgTheme: DEFAULT_THEME,
      set: (k, v) => set({ [k]: v } as Partial<SettingsState>),
    }),
    {
      name: 'rush.settings',
      version: 6,
      migrate: (persisted, from) => {
        let s = persisted as Partial<SettingsState> & { cardSkin?: unknown; tableSkin?: unknown };
        // v1 mặc định 'high' -> nặng trên máy yếu; hạ 1 lần, người dùng vẫn tự chọn lại được
        if (from < 2 && s?.graphics === 'high') s = { ...s, graphics: 'medium' };
        // v2 mặc định 'fpsLimit: 60' dùng thuật toán cap theo mốc thời gian tường,
        // lệch pha với màn hình không phải 60Hz -> giật khựt. Thuật toán mới (v3,
        // tích luỹ theo dt) đã sửa triệt để, nhưng đưa về 'unlimited' 1 lần để ai
        // đang dính giá trị 60/120 mặc định (chưa chắc họ chủ ý chọn) thấy hiệu
        // quả ngay — vẫn tự chọn lại được trong Cài đặt nếu muốn giới hạn FPS.
        if (from < 3) s = { ...s, fpsLimit: 'unlimited' };
        // v5: bỏ hẳn cơ chế chọn skin lá bài (classic/checkered/custom) — từ giờ
        // LUÔN dùng ảnh thật (public/card-texture). Dọn field cũ khỏi localStorage.
        if (from < 5) delete s.cardSkin;
        // v6: `tableSkin` (chỉ đổi mặt bàn 3D) nhập vào hệ thống nền dùng chung
        // cho cả menu. 'forest' trùng tên nên giữ nguyên; 'neonRed' không còn
        // cảnh nền tương ứng -> về mặc định 'cafe'.
        if (from < 6) {
          const old = s.tableSkin;
          s = { ...s, bgTheme: isBgTheme(old) ? old : DEFAULT_THEME };
          delete s.tableSkin;
        }
        return s as SettingsState;
      },
    },
  ),
);

export const gfxOf = (g: Graphics) => GFX[g];
