import type { NextRequest } from 'next/server';
import { createRoomRecord, markOpen, saveRoom, type RoomPlayer } from '@/src/server/room';
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
  };
  const room = createRoomRecord(host, { rules: body.rules, deckType: body.deckType, isPublic: body.isPublic });
  await saveRoom(room);
  await markOpen(room);
  return json({ code: room.code, token: room.tokens[host.id] });
}
