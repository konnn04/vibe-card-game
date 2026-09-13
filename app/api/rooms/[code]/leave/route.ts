import type { NextRequest } from 'next/server';
import { clearPresence, markOpen, mutate, removePlayer, verify } from '@/src/server/room';
import { fail, json, readBody, type Identity } from '@/src/server/http';

export async function POST(req: NextRequest, ctx: RouteContext<'/api/rooms/[code]/leave'>) {
  const { code } = await ctx.params;
  const { playerId = '', token = '' } = await readBody<Identity>(req);
  const upper = code.toUpperCase();
  try {
    const room = await mutate(upper, async (r) => {
      if (!verify(r, playerId, token)) throw new Error('unauthorized');
      removePlayer(r, playerId);
    });
    await markOpen(room);
    await clearPresence(upper, playerId);
    return json({ ok: true });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'leave-failed');
  }
}
