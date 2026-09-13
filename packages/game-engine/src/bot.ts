import type { Action, CardColor, GameState } from './types';
import { canJumpIn, canPlay, colorsOf, face } from './rules';
import { mulberry32 } from './rng';

/** Heuristic ưu tiên: chồng +N > action > số cao > wild (giữ wild để cứu nước). */
function weight(value: string): number {
  if (value === 'draw1' || value === 'draw2' || value === 'draw5') return 100;
  if (value === 'wild4' || value === 'wild2' || value === 'wildColor') return 95;
  if (value === 'skipAll') return 90;
  if (value === 'skip' || value === 'reverse') return 80;
  if (value === 'flip') return 70;
  if (value === 'wild') return 20;
  return 30 + Number(value || 0);
}

/** Màu nên chọn cho wild: màu mình có nhiều lá nhất. */
function bestColor(s: GameState, playerId: string): CardColor {
  const me = s.players.find((p) => p.id === playerId)!;
  const palette = colorsOf(s.side);
  const count = new Map<CardColor, number>(palette.map((c) => [c, 0]));
  for (const c of me.hand) {
    const f = face(c, s.side);
    if (count.has(f.color)) count.set(f.color, count.get(f.color)! + 1);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/** Nước đi của bot khi ĐẾN LƯỢT. Trả null nếu không làm gì được. */
export function botAction(s: GameState, playerId: string): Action | null {
  const me = s.players.find((p) => p.id === playerId);
  if (!me) return null;

  if (s.phase === 'awaitColor' && s.resume?.playerId === playerId)
    return { type: 'CHOOSE_COLOR', playerId, color: bestColor(s, playerId) };

  if (s.phase === 'awaitSwapTarget' && s.resume?.playerId === playerId) {
    // luật 7: đổi với người ít bài nhất (trừ đồng đội nếu chơi đội)
    const target = s.players
      .filter((p) => p.id !== playerId && !(s.rules.teamMode && p.team === me.team))
      .sort((a, b) => a.hand.length - b.hand.length)[0];
    return target ? { type: 'SWAP_TARGET', playerId, targetId: target.id } : null;
  }

  if (s.phase !== 'awaitPlay') return null;
  if (s.players[s.turn]?.id !== playerId) return null;
  // Đang trong chuỗi rút từng lá -> việc duy nhất được làm là rút lá tiếp theo.
  if (s.drawRun) return { type: 'DRAW', playerId };

  // Bắt lỗi Wild +N: bot nghi ngờ ~35% số lần, và HĂNG hơn khi chuỗi phạt to
  // (thua thì mất nhiều nên đáng liều). Dùng rng tất định theo state -> mọi
  // client/server suy ra cùng một quyết định.
  if (s.rules.challenge && s.pending && s.pending.value !== 'drawColor' && s.pending.wild4
      && s.pending.wild4.by !== playerId) {
    const odds = s.pending.amount >= 8 ? 0.55 : 0.35;
    if (mulberry32(s.eventSeq ^ s.seed ^ 0xc4a1)() < odds) return { type: 'CHALLENGE', playerId };
  }

  const playable = me.hand.filter((c) => canPlay(c, s));
  if (!playable.length) return { type: 'DRAW', playerId };

  const rnd = mulberry32(s.eventSeq ^ s.seed);
  const pick = playable
    .map((c) => ({ c, w: weight(face(c, s.side).value) + rnd() * 8 }))
    .sort((a, b) => b.w - a.w)[0].c;
  const f = face(pick, s.side);
  return {
    type: 'PLAY',
    playerId,
    cardId: pick.id,
    chosenColor: f.color === 'wild' ? bestColor(s, playerId) : undefined,
  };
}

/** Bot phản ứng ngoài lượt: hô RUSH, bắt RUSH, jump-in. */
export function botReaction(s: GameState, playerId: string): Action | null {
  const me = s.players.find((p) => p.id === playerId);
  if (!me || s.phase !== 'awaitPlay') return null;
  if (me.hand.length === 1 && !me.calledRush) return { type: 'CALL_RUSH', playerId };
  if (s.rushWindow && s.rushWindow.playerId !== playerId)
    return { type: 'CATCH_RUSH', playerId, targetId: s.rushWindow.playerId };
  if (s.rules.jumpIn && s.players[s.turn]?.id !== playerId) {
    const jump = me.hand.find((c) => canJumpIn(c, s));
    if (jump) return { type: 'PLAY', playerId, cardId: jump.id };
  }
  return null;
}
