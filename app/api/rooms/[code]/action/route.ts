import type { NextRequest } from 'next/server';
import { applyAction, isHost, markOpen, mutate, rotateAndDeal, verify } from '@/src/server/room';
import { fail, json, readBody, type Identity } from '@/src/server/http';
import type { Action } from '@u-no/game-engine';

interface Body { action: Action }

/**
 * Cửa duy nhất thay đổi ván đấu — engine chạy Ở ĐÂY, client không tự tính luật.
 * Quy tắc uỷ quyền:
 *  - chỉ được gửi action mang playerId của chính mình;
 *  - chủ phòng được gửi thay BOT (bot do host tick, serverless không có worker nền);
 *  - TIMEOUT chỉ chấp nhận khi đồng hồ server đã thực sự hết giờ.
 */
export async function POST(req: NextRequest, ctx: RouteContext<'/api/rooms/[code]/action'>) {
  const { code } = await ctx.params;
  const body = await readBody<Body & Identity>(req);
  const { playerId = '', token = '', action } = body;
  if (!action?.type) return fail('bad-action');

  let rejected: string | null = null;
  try {
    const room = await mutate(code.toUpperCase(), async (r) => {
      if (!verify(r, playerId, token)) throw new Error('unauthorized');
      if (!r.game) throw new Error('no-game');

      if (action.type === 'NEXT_ROUND') {
        if (!isHost(r, playerId)) throw new Error('not-host');
        if (r.game.phase !== 'roundEnd') throw new Error('round-not-ended');
        return { events: rotateAndDeal(r) };
      }

      const actor = r.game.players.find((p) => p.id === action.playerId);
      if (!actor) throw new Error('no-actor');
      if (actor.id !== playerId && !(actor.isBot && isHost(r, playerId))) throw new Error('not-your-turn');
      if (action.type === 'TIMEOUT' && Date.now() < r.game.turnDeadline - 400) throw new Error('too-early');

      const events = applyAction(r, action);
      const reject = events.length === 1 && events[0].t === 'reject' ? events[0] : null;
      if (reject) {
        // action sai luật: không phát cho cả phòng, chỉ báo lại người gửi
        rejected = reject.reason;
        return { events, skipBroadcast: true };
      }
      return { events };
    });
    await markOpen(room);
    if (rejected) return json({ ok: false, rejected }, 200);
    return json({ ok: true });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'action-failed');
  }
}
