import type { NextRequest } from 'next/server';
import { loadRoom, runRoomStep, verify } from '@/src/server/room';
import { fail, json, readBody, type Identity } from '@/src/server/http';

/**
 * ĐẨY VÁN ĐẤU MỘT NHỊP — bot đi, hết giờ lượt, rút tiếp lá kế.
 *
 * Vì sao cần một route riêng: server đã có sẵn vòng `scheduleRoomStep`, nhưng nó
 * là `setTimeout` nằm trong tiến trình. Trên nền serverless (Vercel và tương tự)
 * tiến trình bị đóng băng ngay khi response trả xong, nên cái hẹn giờ đó KHÔNG
 * BAO GIỜ nổ: hết giờ không ai chuyển lượt (đồng hồ về 0 rồi bàn treo cứng), bot
 * không tự đi, chuỗi rút đứng giữa chừng. Chạy `next start` trên máy nhà thì
 * timer lại sống, nên lỗi trông như "thỉnh thoảng".
 *
 * Route này để CLIENT gõ nhịp thay cho cái hẹn giờ đó. Nó không nhận hành động
 * nào từ client — chỉ chạy đúng `runRoomStep`, vốn tự kiểm tra mọi mốc thời gian
 * bằng đồng hồ SERVER. Gọi thừa cũng vô hại: chưa tới hạn thì nó không làm gì,
 * và mọi thay đổi đều nằm dưới khoá phòng nên hai client gọi cùng lúc cũng chỉ
 * một bên đi được.
 */
export async function POST(req: NextRequest, ctx: RouteContext<'/api/rooms/[code]/step'>) {
  const { code } = await ctx.params;
  const { playerId = '', token = '' } = await readBody<Identity>(req);
  const upper = code.toUpperCase();
  try {
    // Chỉ người trong phòng được gõ nhịp — route không đổi luật gì, nhưng cũng
    // không để người lạ bơm request vào phòng của người khác.
    const room = await loadRoom(upper);
    if (!room) throw new Error('room-not-found');
    if (!verify(room, playerId, token)) throw new Error('unauthorized');
    await runRoomStep(upper);
    return json({ ok: true });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'step-failed');
  }
}
