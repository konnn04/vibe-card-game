'use client';
import { create } from 'zustand';

/**
 * VỊ TRÍ GHẾ TRÊN MÀN HÌNH (pixel, cùng hệ toạ độ với lớp giao diện 2D phủ lên
 * canvas). Bàn là 3D, còn hiệu ứng nổ, thông báo bắt lỗi, bàn tay chỉ... là
 * DOM 2D — trước đây mỗi chỗ tự "đoán" vị trí ghế bằng công thức vòng tròn cố
 * định nên lệch hẳn (nổ ở góc trái trên, bắt lỗi luôn ở bên phải).
 *
 * SeatProjector (Scene.tsx, bên trong Canvas) chiếu đúng toạ độ 3D của từng
 * ghế qua camera thật rồi ghi vào đây; ai cần thì đọc.
 */
export interface ScreenPoint { x: number; y: number }

interface SeatScreenStore {
  /** Theo id người chơi: điểm neo của ghế (thẻ tên đối thủ / quạt bài của mình). */
  seats: Record<string, ScreenPoint>;
  /** Tâm bàn (giữa chồng rút và đống bỏ). */
  center: ScreenPoint | null;
  set(seats: Record<string, ScreenPoint>, center: ScreenPoint): void;
}

export const useSeatScreen = create<SeatScreenStore>((set) => ({
  seats: {},
  center: null,
  set: (seats, center) => set({ seats, center }),
}));
