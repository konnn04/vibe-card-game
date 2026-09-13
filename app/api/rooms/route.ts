import type { NextRequest } from 'next/server';
import { createRoomRecord, markOpen, sanitizeAvatarUrl, saveRoom, sweepStaleRooms, type RoomPlayer } from '@/src/server/room';
import { fail, json, readBody } from '@/src/server/http';
import type { DeckType, Rules } from '@u-no/game-engine';

interface Body { player: RoomPlayer; rules?: Partial<Rules>; deckType?: DeckType; isPublic?: boolean }

/** Tạo phòng: server sinh mã + token, client không tự đặt được. */
export async function POST(req: NextRequest) {
  const body = await readBody<Body>(req);
  if (!body.player?.id || !body.player?.name) return fail('bad-player');
  const host: RoomPlayer = {
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
  // Dọn phòng cũ TRƯỚC khi thêm phòng mới. Tạo phòng là thời điểm tự nhiên để
  // dọn: người dùng vốn đã chờ vài trăm ms, và trên serverless thì đây là một
  // trong số ít khoảnh khắc chắc chắn có request chạy. Lỗi dọn dẹp KHÔNG được
  // chặn việc tạo phòng — dọn hụt thì lần sau dọn tiếp.
  await sweepStaleRooms().catch(() => 0);

  const room = createRoomRecord(host, { rules: body.rules, deckType: body.deckType, isPublic: body.isPublic });
  await saveRoom(room);
  await markOpen(room);
  return json({ code: room.code, token: room.tokens[host.id] });
}
