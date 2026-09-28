import type { Action, DeckType, GameEvent, GameState, Rules } from '@u-no/game-engine';
import type { NetRoom, NetSeat, Presence, PresenceMap } from '@u-no/shared';

export interface RoomRecord {
  code: string;
  hostId: string;
  deckType: DeckType;
  rules: Rules;
  seats: (NetSeat | null)[];
  queue: NetSeat[];
  status: 'lobby' | 'playing';
  game: GameState | null;
  /** token issued at join/create */
  tokens: Record<string, string>;
  isPublic: boolean;
  bgTheme: string;
  scores: Record<string, number>;
  /** Số lượt hết giờ LIÊN TIẾP của từng người thật (dù vẫn online) — xem NET.afkTimeoutStrikes. */
  afkStrikes?: Record<string, number>;
  updatedAt: number;
}
