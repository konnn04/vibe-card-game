import type { NextRequest } from 'next/server';
import { beginMatch, isHost, markOpen, mutate, seatedPlayers, verify } from '@/src/server/room';
import { fail, json, readBody, type Identity } from '@/src/server/http';
import { isBgTheme } from '@/src/lib/themes';

/** Chủ phòng bấm bắt đầu -> server chia bài, client chỉ nhận event. */
export async function POST(req: NextRequest, ctx: RouteContext<'/api/rooms/[code]/start'>) {
  const { code } = await ctx.params;
  const { playerId = '', token = '', bgTheme } = await readBody<Identity & { bgTheme?: string }>(req);
  try {
    const room = await mutate(code.toUpperCase(), async (r) => {
      if (!verify(r, playerId, token)) throw new Error('unauthorized');
      if (!isHost(r, playerId)) throw new Error('not-host');
      if (seatedPlayers(r).length < 2) throw new Error('need-2-players');
      // Nền của ván = nền của CHỦ PHÒNG. Chốt ở đây (không phải lúc chủ phòng
      // đổi cài đặt) để cả bàn bước vào ván với đúng một cảnh, và để người vào
      // sau giữa ván đọc được nó từ chính bản ghi phòng.
      if (isBgTheme(bgTheme)) r.bgTheme = bgTheme;
      return { events: beginMatch(r) };
    });
    await markOpen(room);
    return json({ ok: true });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'start-failed');
  }
}
