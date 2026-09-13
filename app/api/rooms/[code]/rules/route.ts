import type { NextRequest } from 'next/server';
import { isHost, markOpen, mutate, verify } from '@/src/server/room';
import { fail, json, readBody, type Identity } from '@/src/server/http';
import type { DeckType, Rules } from '@u-no/game-engine';

interface Body { rules?: Partial<Rules>; deckType?: DeckType }

/** Chỉ chủ phòng đổi luật, và chỉ khi đang ở lobby. */
export async function POST(req: NextRequest, ctx: RouteContext<'/api/rooms/[code]/rules'>) {
  const { code } = await ctx.params;
  const body = await readBody<Body & Identity>(req);
  const { playerId = '', token = '' } = body;
  try {
    const room = await mutate(code.toUpperCase(), async (r) => {
      if (!verify(r, playerId, token)) throw new Error('unauthorized');
      if (!isHost(r, playerId)) throw new Error('not-host');
      if (r.status !== 'lobby') throw new Error('match-running');
      if (body.rules) {
        const next = { ...r.rules, ...body.rules };
        next.startingCards = Math.min(7, Math.max(5, next.startingCards));
        next.turnSeconds = [15, 20, 30].includes(next.turnSeconds) ? next.turnSeconds : 20;
        next.maxPlayers = Math.min(4, Math.max(2, next.maxPlayers));
        r.rules = next;
      }
      if (body.deckType) r.deckType = body.deckType;
    });
    await markOpen(room);
    return json({ ok: true });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'rules-failed');
  }
}
