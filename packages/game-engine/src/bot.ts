import type { Action, CardColor, GameState } from './types';
import { canJumpIn, canPlay } from './rules';
import { face } from './palette';
import { colorsFor } from './modes';
import { autoChainTargets } from './engine';
import type { Card } from './types';
import { mulberry32 } from './rng';

/** Heuristic ưu tiên: chồng +N > action > số cao > wild (giữ wild để cứu nước). */
function weight(value: string): number {
  if (value === 'draw1' || value === 'draw2' || value === 'draw5' || value === 'draw4') return 100;
  if (value === 'wild4' || value === 'wild2' || value === 'wildColor') return 95;
  // No Mercy: Wild rút nặng giữ lại để chồng phạt; Bỏ hết đánh sớm (xả nhiều lá).
  if (value === 'wildRev4' || value === 'wild6' || value === 'wild10') return 50;
  if (value === 'discardAll') return 92;
  if (value === 'wildRoulette') return 88;
  if (value === 'skipAll') return 90;
  if (value === 'skip' || value === 'reverse') return 80;
  if (value === 'flip') return 70;
  // Party: Chỉ tay dồn bài cho người khác nên đánh sớm; Cọng xích / 3 lá con là
  // Wild -> giữ lại như Đổi màu để cứu nước.
  if (value === 'pointTaken') return 75;
  if (value === 'wildTogether' || value === 'wildPileUp') return 25;
  if (value === 'wild') return 20;
  // Lá số: số cao đánh trước (bị bắt giữ lại thì mất nhiều điểm hơn). Trị lạ
  // (lá của mode mới chưa khai ở trên) rơi về mức lá chức năng thường, không NaN.
  return /^\d$/.test(value) ? 30 + Number(value) : 60;
}

/** Màu nên chọn cho lá wild `card`: màu (trong hệ của lá) mình có nhiều lá nhất. */
function bestColor(s: GameState, playerId: string, card: Card): CardColor {
  const me = s.players.find((p) => p.id === playerId)!;
  const palette = colorsFor(s, card);
  const count = new Map<CardColor, number>(palette.map((c) => [c, 0]));
  for (const c of me.hand) {
    const f = face(c, s.side);
    if (count.has(f.color)) count.set(f.color, count.get(f.color)! + 1);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Party — phiếu bầu Chỉ tay của bot: người KHÁC ít bài nhất (sắp thắng), trừ
 * đồng đội nếu chơi đội. null nếu đã bầu hoặc không trong vòng bầu.
 */
function botVote(s: GameState, playerId: string): Action | null {
  if (s.phase !== 'awaitVote' || !s.vote || s.vote.votes[playerId]) return null;
  const me = s.players.find((p) => p.id === playerId);
  if (!me || me.eliminated) return null;
  const target = s.players
    .filter((p) => p.id !== playerId && !p.eliminated && !(s.rules.teamMode && p.team === me.team))
    .sort((a, b) => a.hand.length - b.hand.length)[0]
    ?? s.players.find((p) => p.id !== playerId && !p.eliminated);
  return target ? { type: 'VOTE', playerId, targetId: target.id } : null;
}

/** Nước đi của bot khi ĐẾN LƯỢT. Trả null nếu không làm gì được. */
export function botAction(s: GameState, playerId: string): Action | null {
  const me = s.players.find((p) => p.id === playerId);
  if (!me) return null;

  if ((s.phase === 'awaitColor' || s.phase === 'awaitRoulette') && s.resume?.playerId === playerId)
    return { type: 'CHOOSE_COLOR', playerId, color: bestColor(s, playerId, s.discard[s.discard.length - 1]) };

  if (s.phase === 'awaitVote') return botVote(s, playerId);

  if (s.phase === 'awaitChain' && s.resume?.playerId === playerId) {
    const [a, b] = autoChainTargets(s, playerId);
    return { type: 'CHAIN', playerId, a, b };
  }

  if (s.phase === 'awaitSwapTarget' && s.resume?.playerId === playerId) {
    // luật 7: đổi với người ít bài nhất (trừ đồng đội nếu chơi đội)
    const target = s.players
      // Người bị loại có 0 lá nên luôn "ít bài nhất" — phải loại ra trước khi chọn.
      .filter((p) => p.id !== playerId && !p.eliminated && !(s.rules.teamMode && p.team === me.team))
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
    chosenColor: f.color === 'wild' ? bestColor(s, playerId, pick) : undefined,
  };
}

/** Bot phản ứng ngoài lượt: hô RUSH, bắt RUSH, jump-in. */
export function botReaction(s: GameState, playerId: string): Action | null {
  const me = s.players.find((p) => p.id === playerId);
  if (!me || me.eliminated) return null;
  // Party — vòng bầu Chỉ tay: mọi bot đều bầu, không riêng người tới lượt.
  if (s.phase === 'awaitVote') return botVote(s, playerId);
  if (s.phase !== 'awaitPlay') return null;
  if (me.hand.length === 1 && !me.calledRush) return { type: 'CALL_RUSH', playerId };
  if (s.rushWindow && s.rushWindow.playerId !== playerId)
    return { type: 'CATCH_RUSH', playerId, targetId: s.rushWindow.playerId };
  if (s.rules.jumpIn && s.players[s.turn]?.id !== playerId) {
    const jump = me.hand.find((c) => canJumpIn(c, s));
    if (jump) return { type: 'PLAY', playerId, cardId: jump.id };
  }
  return null;
}
