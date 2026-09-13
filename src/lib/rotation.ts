/**
 * XOAY VÒNG HÀNG CHỜ — ai nhường ghế cho ai ở ván sau.
 *
 * Phòng quá 4 người thì người thừa xếp hàng chờ, và sau mỗi ván một người đang
 * ngồi phải ra để người đầu hàng chờ vào. Quy tắc: ai đã chơi LIÊN TỤC nhiều ván
 * nhất thì ra trước; chủ phòng được giữ ghế (phòng còn cần người điều khiển bot
 * và bấm bắt đầu ván).
 *
 * Đặt ở đây vì có ĐÚNG HAI nơi cần câu trả lời và chúng bắt buộc phải khớp nhau:
 *  - server, lúc thật sự chia lại bài (rotateAndDeal);
 *  - bảng điểm cuối ván, để hiện trước 4 người sẽ chơi ván tới.
 * Chép luật này ra hai chỗ thì sớm muộn màn hình hứa một đằng, server làm một
 * nẻo — kiểu lỗi người chơi phát hiện trước lập trình viên.
 */
export interface RotationInput<T extends { id: string }> {
  seats: (T | null)[];
  queue: T[];
  hostId: string;
  /** Số ván liên tục đã chơi, theo id người chơi. */
  consecutive: Record<string, number>;
}

export interface Rotation<T> {
  /** Chỉ số ghế bị đổi người. */
  seat: number;
  out: T;
  in: T;
}

export function pickRotation<T extends { id: string }>(opts: RotationInput<T>): Rotation<T> | null {
  const incoming = opts.queue[0];
  if (!incoming) return null;
  const candidates = opts.seats
    .map((s, i) => ({ s, i }))
    .filter((x): x is { s: T; i: number } => !!x.s && x.s.id !== opts.hostId)
    // Array.prototype.sort ổn định theo chuẩn, nên cùng dữ liệu vào luôn cho
    // cùng một người ra — server và màn hình không thể lệch nhau.
    .sort((a, b) => (opts.consecutive[b.s.id] ?? 0) - (opts.consecutive[a.s.id] ?? 0));
  const out = candidates[0];
  if (!out) return null;
  return { seat: out.i, out: out.s, in: incoming };
}

/** Danh sách ghế SAU khi xoay vòng — dùng để hiện trước đội hình ván sau. */
export function seatsAfterRotation<T extends { id: string }>(opts: RotationInput<T>): (T | null)[] {
  const next = opts.seats.slice();
  const swap = pickRotation(opts);
  if (swap) next[swap.seat] = swap.in;
  return next;
}
