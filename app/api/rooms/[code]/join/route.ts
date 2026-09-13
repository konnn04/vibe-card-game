import type { NextRequest } from 'next/server';
import { markOpen, mutate, newToken, sanitizeAvatarUrl, seatOrQueue, type RoomPlayer } from '@/src/server/room';
import { fail, json, readBody, snapshotFor } from '@/src/server/http';

interface Body { player: RoomPlayer }

/** Vào phòng bằng mã: có ghế thì ngồi, hết ghế thì xếp hàng chờ. */
export async function POST(req: NextRequest, ctx: RouteContext<'/api/rooms/[code]/join'>) {
  const { code } = await ctx.params;
  const body = await readBody<Body>(req);
  if (!body.player?.id || !body.player?.name) return fail('bad-player');

  const player: RoomPlayer = {
    id: body.player.id,
    name: String(body.player.name).slice(0, 16),
    isBot: false,
    avatarPreset: body.player.avatarPreset ?? 0,
    // avatarUrl PHẢI được chép sang: nó là thứ duy nhất cho người khác thấy
    // mặt mình. Trước đây ba route này dựng lại RoomPlayer từng field và bỏ quên
    // nó, nên client gửi lên rồi server vứt ngay ở cửa — cả bàn vĩnh viễn chỉ
    // thấy avatar mặc định, dù Discord đã trả ảnh thật về.
    avatarUrl: sanitizeAvatarUrl(body.player.avatarUrl),
  };

  try {
    let token = '';
    const room = await mutate(code.toUpperCase(), async (r) => {
      token = r.tokens[player.id] ?? newToken();
      r.tokens[player.id] = token;
      seatOrQueue(r, player);
      if (!r.hostId) r.hostId = player.id;
    });
    await markOpen(room);
    return json({ token, ...snapshotFor(room, player.id, token) });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'join-failed', 404);
  }
}
