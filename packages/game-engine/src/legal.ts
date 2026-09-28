import type { Action, GameState } from './types';
import { canJumpIn, canPlay, isWildValue } from './rules';
import { face } from './palette';
import { colorsFor } from './modes';
import { RUSH_GRACE_MS } from './engine';

/**
 * MỌI NƯỚC ĐI HỢP LỆ của `playerId` lúc này — một chỗ trả lời câu hỏi "được
 * làm gì", dùng cho UI (sáng lá đánh được), bot và kiểm thử. Engine (reduce)
 * vẫn là nơi quyết định cuối cùng; hàm này chỉ liệt kê, không đổi state.
 *
 * Lá Wild được liệt kê kèm TỪNG màu gọi được (mỗi màu một nước đi). Riêng
 * Color Roulette không kèm màu vì người đánh không chọn màu.
 */
export function legalActions(s: GameState, playerId: string, now = Date.now()): Action[] {
  const pi = s.players.findIndex((p) => p.id === playerId);
  if (pi < 0) return [];
  const me = s.players[pi];
  if (me.eliminated || s.phase === 'roundEnd' || s.phase === 'matchEnd') return [];
  const out: Action[] = [];
  const myTurn = s.turn === pi;

  // Phản ứng được làm bất kể tới lượt ai.
  if (me.hand.length === 1 && !me.calledRush) out.push({ type: 'CALL_RUSH', playerId });
  const w = s.rushWindow;
  if (w && w.playerId !== playerId && now >= w.openedAt + RUSH_GRACE_MS && now <= w.until)
    out.push({ type: 'CATCH_RUSH', playerId, targetId: w.playerId });

  const resumeMine = s.resume?.playerId === playerId;
  if ((s.phase === 'awaitColor' || s.phase === 'awaitRoulette') && resumeMine) {
    for (const color of colorsFor(s, s.discard[s.discard.length - 1])) out.push({ type: 'CHOOSE_COLOR', playerId, color });
    return out;
  }
  if (s.phase === 'awaitSwapTarget' && resumeMine) {
    for (const p of s.players) if (p.id !== playerId && !p.eliminated) out.push({ type: 'SWAP_TARGET', playerId, targetId: p.id });
    return out;
  }
  if (s.phase === 'awaitChain' && resumeMine) {
    const ids = s.players.filter((p) => !p.eliminated).map((p) => p.id);
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) out.push({ type: 'CHAIN', playerId, a: ids[i], b: ids[j] });
    return out;
  }
  if (s.phase === 'awaitVote') {
    for (const p of s.players) if (p.id !== playerId && !p.eliminated) out.push({ type: 'VOTE', playerId, targetId: p.id });
    return out;
  }
  if (s.phase !== 'awaitPlay') return out;

  // Đang rút dở: việc duy nhất là rút lá kế tiếp.
  if (s.drawRun) return myTurn ? [...out, { type: 'DRAW', playerId }] : out;

  for (const card of me.hand) {
    const ok = myTurn ? canPlay(card, s) : canJumpIn(card, s);
    if (!ok) continue;
    const v = face(card, s.side).value;
    if (isWildValue(v) && v !== 'wildRoulette') {
      for (const color of colorsFor(s, card)) out.push({ type: 'PLAY', playerId, cardId: card.id, chosenColor: color });
    } else {
      out.push({ type: 'PLAY', playerId, cardId: card.id });
    }
  }
  if (!myTurn) return out;

  if (s.pending || s.pileUp || !s.drawnThisTurn) out.push({ type: 'DRAW', playerId });
  const p = s.pending;
  if (p && p.value !== 'drawColor' && p.wild4 && p.wild4.by !== playerId && s.rules.challenge) out.push({ type: 'CHALLENGE', playerId });
  const canPlayAny = me.hand.some((c) => canPlay(c, s));
  if (s.drawnThisTurn && !s.pending && !(s.rules.forcePlay && canPlayAny)) out.push({ type: 'PASS', playerId });
  return out;
}
