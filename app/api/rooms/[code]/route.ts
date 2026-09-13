import type { NextRequest } from 'next/server';
import { loadRoom } from '@/src/server/room';
import { fail, json, snapshotFor } from '@/src/server/http';

/** Snapshot khi vừa vào phòng / khi reconnect sau khi mất kết nối Firebase. */
export async function GET(req: NextRequest, ctx: RouteContext<'/api/rooms/[code]'>) {
  const { code } = await ctx.params;
  const room = await loadRoom(code.toUpperCase());
  if (!room) return fail('room-not-found', 404);
  const url = new URL(req.url);
  return json(snapshotFor(room, url.searchParams.get('playerId') ?? '', url.searchParams.get('token') ?? ''));
}
