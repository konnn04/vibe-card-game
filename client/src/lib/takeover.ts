/**
 * MÁY ĐANG ĐÁNH THAY CHO NGƯỜI NÀY?
 *
 * Bot thật sinh ra đã là bot và `connected` luôn là true (xem emptyState trong
 * engine). Người bị rớt mạng thì bị đặt `isBot = true` KÈM `connected = false`.
 * Cặp hai cờ đó là thứ duy nhất phân biệt "máy trong phòng" với "ghế đang bị
 * máy giữ hộ".
 *
 * Để ở lib dùng chung cho giao diện và logic ván đấu.
 */
export const isTakenOver = (p: { isBot: boolean; connected?: boolean }) =>
  p.isBot && p.connected === false;
