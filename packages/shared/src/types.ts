import type { Action, Card, DeckType, GameEvent, GameState, Rules } from '@u-no/game-engine';

export interface NetSeat {
  id: string;
  name: string;
  isBot: boolean;
  avatarPreset: number;
  avatarUrl?: string | null;
  watchOnly?: boolean;
}

export interface NetRoom {
  code: string;
  hostId: string;
  deckType: DeckType;
  rules: Rules;
  seats: (NetSeat | null)[];
  queue: NetSeat[];
  status: 'lobby' | 'playing';
  isPublic: boolean;
  bgTheme?: string;
  scores?: Record<string, number>;
}

export interface RoomUpdate {
  room: NetRoom;
  game: GameState | null;
  events: GameEvent[];
}

export interface Presence {
  online: boolean;
  ts: number;
  ping: number | null;
}

export type PresenceMap = Record<string, Presence>;

export interface Snapshot {
  room: NetRoom;
  game: GameState | null;
  hand: Card[];
  you: string | null;
  avatars?: Record<string, string>;
}

export interface CreateRoomDto {
  player: NetSeat;
  rules?: Partial<Rules>;
  deckType?: DeckType;
  isPublic?: boolean;
  bgTheme?: string;
}

export interface QuickMatchDto {
  player: NetSeat;
  bgTheme?: string;
}

export interface JoinRoomDto {
  code: string;
  player: NetSeat;
  token?: string;
}

export interface ReconnectDto {
  code: string;
  playerId: string;
  token: string;
}

export interface SeatOpDto {
  code: string;
  playerId: string;
  token: string;
  op: 'move' | 'toQueue' | 'seatFromQueue' | 'addBot' | 'kick' | 'watchMode';
  from?: number;
  index?: number;
  to?: number;
  qIndex?: number;
  queueIndex?: number;
  seatIndex?: number;
  targetId?: string;
  watchOnly?: boolean;
}

export interface RulesOpDto {
  code: string;
  playerId: string;
  token: string;
  patch: {
    rules?: Partial<Rules>;
    deckType?: DeckType;
    bgTheme?: string;
  };
}

export interface StartOpDto {
  code: string;
  playerId: string;
  token: string;
  bgTheme?: string;
}

export interface ActionOpDto {
  code: string;
  playerId: string;
  token: string;
  action: Action;
}

export interface AvatarOpDto {
  code: string;
  playerId: string;
  token: string;
  image: string | null;
}

export interface LeaveOpDto {
  code: string;
  playerId: string;
  token: string;
}

export interface ChatDto {
  code: string;
  playerId: string;
  token: string;
  message: string;
  senderName?: string;
}

export interface ServerChatDto {
  playerId: string;
  senderId?: string;
  senderName?: string;
  message: string;
  timestamp: number;
}

