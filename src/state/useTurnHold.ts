'use client';
import { useMatch } from './match';

/**
 * true khi đang phát animation — tức lượt đang ở TURN_START (nhận hiệu ứng tồn
 * đọng: bị skip, rút chồng phạt, lật bàn, đổi bài) hoặc TURN_END (hậu quả của
 * lá vừa đánh). Trong hai khoảng này, theo thiết kế (text.txt mục 3):
 *   Timer = Pause
 *   Player input = Lock
 * Hết animation mới sang TURN_ACTION: đồng hồ chạy, thao tác bình thường.
 *
 * CÁCH CŨ VÀ VÌ SAO BỎ: trước đây so `Date.now()` với mốc `turnHoldUntil` do
 * engine sinh ra. Ở chế độ online engine chạy trên SERVER nên mốc đó theo đồng
 * hồ server, client lại so với đồng hồ của chính nó — lệch giờ vài giây là khoá
 * bàn vĩnh viễn (hoặc không bao giờ dừng đồng hồ). Giờ chỉ cần hỏi hàng đợi
 * animation còn việc không: không cần biết mấy giờ, và giống nhau trên mọi máy.
 */
export function useTurnHold(): boolean {
  return useMatch((s) => s.animating);
}

/**
 * Giai đoạn hiện tại của lượt:
 *  - 'effect' : TRƯỚC ĐÁNH (TURN_START) — đang nhận hiệu ứng tồn đọng
 *  - 'play'   : SAU ĐÁNH  (TURN_END)   — đang phát hậu quả lá vừa đánh
 *  - null     : TRONG ĐÁNH (TURN_ACTION) — đếm giờ, thao tác bình thường
 */
export function useTurnStage(): 'effect' | 'play' | null {
  const animating = useMatch((s) => s.animating);
  const phase = useMatch((s) => s.phase);
  if (!animating) return null;
  return phase === 'end' ? 'play' : 'effect';
}
