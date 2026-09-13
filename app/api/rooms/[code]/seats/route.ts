import type { NextRequest } from 'next/server';
import { clearPresence, isHost, markOpen, mutate, removePlayer, verify, type RoomPlayer } from '@/src/server/room';
import { fail, json, readBody, type Identity } from '@/src/server/http';

type Op =
  | { op: 'move'; from: number; to: number }
  | { op: 'toQueue'; index: number }
  | { op: 'seatFromQueue'; queueIndex: number; seatIndex: number }
  | { op: 'addBot' }
  | { op: 'kick'; targetId: string };

const BOT_NAMES = ['Dusty', 'Pudding', 'Luna', 'Mochi', 'Pixel', 'Cocoa'];

/** Sửa ghế/hàng chờ. Chỉ chủ phòng được kéo ghế người khác, kick, thêm bot;
 *  ai cũng được tự rời ghế/hàng chờ của chính mình. */
export async function POST(req: NextRequest, ctx: RouteContext<'/api/rooms/[code]/seats'>) {
  const { code } = await ctx.params;
  const body = await readBody<Op & Identity>(req);
  const { playerId = '', token = '' } = body;
  const upper = code.toUpperCase();
  let kickedId: string | null = null;

  try {
    const room = await mutate(upper, async (r) => {
      if (!verify(r, playerId, token)) throw new Error('unauthorized');
      if (r.status !== 'lobby') throw new Error('match-running');
      const host = isHost(r, playerId);

      switch (body.op) {
        case 'move': {
          const mine = r.seats[body.from]?.id === playerId;
          if (!host && !mine) throw new Error('not-host');
          const seats = r.seats.slice();
          [seats[body.from], seats[body.to]] = [seats[body.to], seats[body.from]];
          r.seats = seats;
          return;
        }
        case 'toQueue': {
          const p = r.seats[body.index];
          if (!p) return;
          if (!host && p.id !== playerId) throw new Error('not-host');
          r.seats[body.index] = null;
          r.queue.push(p);
          return;
        }
        case 'seatFromQueue': {
          const p = r.queue[body.queueIndex];
          if (!p) return;
          if (!host && p.id !== playerId) throw new Error('not-host');
          const occupant = r.seats[body.seatIndex];
          if (occupant) {
            // Ghế đã có người: đổi chỗ — người đang ngồi ra hàng chờ đúng vị trí
            // của người vừa kéo vào, người trong hàng chờ vào ghế.
            r.seats[body.seatIndex] = p;
            r.queue[body.queueIndex] = occupant;
          } else {
            r.seats[body.seatIndex] = p;
            r.queue.splice(body.queueIndex, 1);
          }
          return;
        }
        case 'addBot': {
          if (!host) throw new Error('not-host');
          const used = r.seats.filter(Boolean).length + r.queue.length;
          const bot: RoomPlayer = {
            id: `bot-${Math.random().toString(36).slice(2, 8)}`,
            name: BOT_NAMES[used % BOT_NAMES.length],
            isBot: true,
            avatarPreset: used % 6,
          };
          const free = r.seats.findIndex((s, i) => !s && i < r.rules.maxPlayers);
          if (free >= 0) r.seats[free] = bot;
          else r.queue.push(bot);
          return;
        }
        case 'kick': {
          // Chủ phòng kick bất kỳ ai (ghế hoặc hàng chờ); tự mình thì luôn được
          // rời hàng chờ (rời ghế đã có nút ↩ riêng dùng op 'toQueue').
          if (!host && body.targetId !== playerId) throw new Error('not-host');
          if (body.targetId === r.hostId) throw new Error('cannot-kick-host');
          removePlayer(r, body.targetId);
          kickedId = body.targetId;
          return;
        }
      }
    });
    await markOpen(room);
    if (kickedId) await clearPresence(upper, kickedId);
    return json({ ok: true });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'seats-failed');
  }
}
