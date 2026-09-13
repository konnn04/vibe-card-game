import type { NextRequest } from 'next/server';
import {
  beginMatch, createRoomRecord, findOpenRoom, markOpen, mutate, newToken,
  saveRoom, seatOrQueue, seatedPlayers, type RoomPlayer,
  sanitizeAvatarUrl,
  sweepStaleRooms,
} from '@/src/server/room';
import { fail, json, readBody, snapshotFor } from '@/src/server/http';
import { DEFAULT_RULES, type Rules } from '@u-no/game-engine';

interface Body { player: RoomPlayer }

/** Luật random trong tập hợp lệ (giống mô tả Quick Match). */
function randomRules(): Rules {
  const r = () => Math.random() < 0.5;
  return { ...DEFAULT_RULES, sevenZero: r(), stack: r(), jumpIn: r(), rushPenalty: r(), maxPlayers: 4 };
}

export async function POST(req: NextRequest) {
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

  const open = await findOpenRoom();
  if (!open) {
  // Dọn phòng cũ TRƯỚC khi thêm phòng mới. Tạo phòng là thời điểm tự nhiên để
  // dọn: người dùng vốn đã chờ vài trăm ms, và trên serverless thì đây là một
  // trong số ít khoảnh khắc chắc chắn có request chạy. Lỗi dọn dẹp KHÔNG được
  // chặn việc tạo phòng — dọn hụt thì lần sau dọn tiếp.
  await sweepStaleRooms().catch(() => 0);

    const room = createRoomRecord(player, { rules: randomRules(), isPublic: true });
    await saveRoom(room);
    await markOpen(room);
    return json({ code: room.code, token: room.tokens[player.id], ...snapshotFor(room, player.id, room.tokens[player.id]) });
  }

  let token = '';
  const room = await mutate(open.code, async (r) => {
    token = r.tokens[player.id] ?? newToken();
    r.tokens[player.id] = token;
    seatOrQueue(r, player);
    // đủ người thì vào trận luôn, không cần chủ phòng bấm
    if (r.status === 'lobby' && seatedPlayers(r).length >= r.rules.maxPlayers) return { events: beginMatch(r) };
  });
  await markOpen(room);
  return json({ code: room.code, token, ...snapshotFor(room, player.id, token) });
}
