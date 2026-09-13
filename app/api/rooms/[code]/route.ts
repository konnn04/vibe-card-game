import type { NextRequest } from 'next/server';
import { canReclaimSeat, loadRoom, mutate, reclaimSeat } from '@/src/server/room';
import { fail, json, snapshotFor } from '@/src/server/http';

/**
 * Snapshot khi vừa vào phòng / khi reconnect sau khi mất kết nối Firebase.
 *
 * Đây cũng là tín hiệu "tôi quay lại rồi": xin được snapshot kèm vé phòng hợp lệ
 * nghĩa là người chơi đã online trở lại. Nếu ghế của họ đang bị máy giữ hộ (do
 * rớt quá 30 giây) thì trả lại ngay tại đây — chờ tới lượt sau mới trả thì họ
 * phải ngồi xem máy đánh thay chính mình thêm một vòng.
 */
export async function GET(req: NextRequest, ctx: RouteContext<'/api/rooms/[code]'>) {
  const { code } = await ctx.params;
  const upper = code.toUpperCase();
  const url = new URL(req.url);
  const playerId = url.searchParams.get('playerId') ?? '';
  const token = url.searchParams.get('token') ?? '';

  let room = await loadRoom(upper);
  if (!room) return fail('room-not-found', 404);

  // Chỉ ghi khi thật sự có ghế cần đòi lại — snapshot được gọi khá thường xuyên,
  // không để mỗi lần đọc lại kéo theo một lượt ghi + broadcast.
  if (canReclaimSeat(room, playerId, token)) {
    room = await mutate(upper, async (r) => { reclaimSeat(r, playerId); });
  }

  return json(snapshotFor(room, playerId, token));
}
