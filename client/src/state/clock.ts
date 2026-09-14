'use client';
import '@/src/lib/patchDiscord';
import { MAX_HOLD_MS } from '@u-no/game-engine';

/**
 * ĐỒNG HỒ CHUNG client <-> server.
 *
 * Offset được tính từ Socket.IO ping/pong với server NestJS.
 */
let offset = 0;

let authority: 'local' | 'remote' = 'local';

/** Chơi với máy: engine ở trong tab -> dùng thẳng Date.now(). */
export function setLocalClock() {
  authority = 'local';
}

/** Chơi online: engine chạy trên server -> cộng offset. */
export function startClockSync() {
  authority = 'remote';
}

export function setServerClockOffset(newOffset: number) {
  offset = newOffset;
}

/**
 * Giờ hiện tại THEO ĐỒNG HỒ CỦA ENGINE — dùng để so với mọi mốc trong
 * GameState (turnHoldUntil, turnDeadline). Chơi với máy thì chính là Date.now().
 */
export function serverNow(): number {
  return authority === 'remote' ? Date.now() + offset : Date.now();
}

/**
 * Trần an toàn cho mọi khoảng "giữ nhịp" (ms) — hằng số dùng CHUNG với engine
 * và server (packages/game-engine MAX_HOLD_MS).
 */
export function holdRemaining(holdUntil: number | undefined | null): number {
  if (typeof holdUntil !== 'number' || !Number.isFinite(holdUntil)) return 0;
  const remain = holdUntil - serverNow();
  if (remain <= 0) return 0;
  return Math.min(remain, MAX_HOLD_MS);
}
