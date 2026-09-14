import type { CardColor } from '@u-no/game-engine';

/**
 * Bảng mã màu dùng chung cho UI 2D (viền bàn, bánh xe chọn màu, HUD).
 *
 * File này TRƯỚC ĐÂY còn chứa cả bộ sinh atlas VẼ TAY bằng canvas (~260 dòng)
 * làm ảnh dự phòng khi thiếu ảnh bài thật. Đã xoá: kiểm tra tự động cho thấy
 * 356/356 lượt tra sprite của CẢ HAI bộ bài (classic + flip, kể cả lá Wild sau
 * khi đã chọn màu) đều có ảnh thật trong public/card-texture — không còn
 * trường hợp nào phải rơi về bản vẽ tay. Giữ lại chỉ tổ có 2 nguồn hình cho
 * cùng một lá bài và lại lệch nhau như đã từng xảy ra.
 */
export const COLOR_HEX: Record<CardColor, string> = {
  red: '#E23B2E', yellow: '#F5C215', green: '#37A64A', blue: '#1B72C4',
  pink: '#FF4D95', teal: '#12B9B9', orange: '#FF8410', purple: '#8348D1',
  wild: '#17141F',
};

