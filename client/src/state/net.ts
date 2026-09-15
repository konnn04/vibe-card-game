'use client';
import '@/src/lib/patchDiscord';
import { io, Socket } from 'socket.io-client';
import { create } from 'zustand';
import type { Action, Card, DeckType, Rules } from '@u-no/game-engine';
import {
  SOCKET_EVENTS,
  type NetRoom,
  type NetSeat,
  type Presence,
  type PresenceMap,
  type RoomUpdate,
  type ServerChatDto,
  type Snapshot,
} from '@u-no/shared';
import { setServerClockOffset } from './clock';

export type { NetRoom, NetSeat, Presence, PresenceMap, RoomUpdate, ServerChatDto, Snapshot };

export const realtimeEnabled = true;

const PID_KEY = 'rush.playerId';

/** ID người chơi bền theo trình duyệt (không có đăng nhập). */
export function playerId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem(PID_KEY);
  if (!id) {
    id = `p-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
    localStorage.setItem(PID_KEY, id);
  }
  return id;
}

const tokenKey = (code: string) => `rush.token.${code}`;
export const saveToken = (code: string, token: string) => localStorage.setItem(tokenKey(code), token);
export const loadToken = (code: string) => (typeof window === 'undefined' ? '' : localStorage.getItem(tokenKey(code)) ?? '');

export interface NetworkState {
  connected: boolean;
  isReconnecting: boolean;
  reconnectAttempts: number;
  isOffline: boolean;
  isSlow: boolean;
  ping: number | null;
  showDisconnectModal: boolean;
  dismissed: boolean;
  setConnected: (c: boolean) => void;
  setReconnecting: (r: boolean, attempts?: number) => void;
  setOffline: (o: boolean) => void;
  setPing: (p: number | null) => void;
  dismissModal: () => void;
  openModal: () => void;
}

export const useNetworkStore = create<NetworkState>((set) => ({
  connected: true,
  isReconnecting: false,
  reconnectAttempts: 0,
  isOffline: typeof navigator !== 'undefined' ? !navigator.onLine : false,
  isSlow: false,
  ping: null,
  showDisconnectModal: false,
  dismissed: false,
  setConnected: (c) => set((s) => ({
    connected: c,
    isReconnecting: !c,
    showDisconnectModal: !c && !s.dismissed,
    reconnectAttempts: c ? 0 : s.reconnectAttempts,
  })),
  setReconnecting: (r, attempts) => set((s) => ({
    isReconnecting: r,
    reconnectAttempts: attempts !== undefined ? attempts : s.reconnectAttempts + 1,
    showDisconnectModal: r && !s.dismissed,
  })),
  setOffline: (o) => set((s) => ({
    isOffline: o,
    showDisconnectModal: o && !s.dismissed,
  })),
  setPing: (p) => set({
    ping: p,
    isSlow: p !== null && p > 500,
  }),
  dismissModal: () => set({ dismissed: true, showDisconnectModal: false }),
  openModal: () => set({ dismissed: false, showDisconnectModal: true }),
}));

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    useNetworkStore.getState().setOffline(false);
    if (socket && !socket.connected) {
      socket.connect();
    }
  });
  window.addEventListener('offline', () => {
    useNetworkStore.getState().setOffline(true);
  });
}

function resolveServerUrl(): string | undefined {
  if (process.env.NEXT_PUBLIC_SOCKET_URL) {
    return process.env.NEXT_PUBLIC_SOCKET_URL;
  }
  return undefined;
}

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const url = resolveServerUrl();
    socket = io(url, {
      path: '/socket.io',
      autoConnect: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 4000,
      timeout: 10000,
    });

    socket.on('connect', () => {
      console.log('[Socket.IO] Connected to backend server:', socket?.id);
      useNetworkStore.getState().setConnected(true);
    });

    socket.io.on('reconnect_attempt', (attempt) => {
      useNetworkStore.getState().setReconnecting(true, attempt);
    });

    socket.io.on('reconnect', () => {
      useNetworkStore.getState().setConnected(true);
    });

    socket.on('connect_error', (err) => {
      console.warn('[Socket.IO] Connection error:', err.message);
      useNetworkStore.getState().setReconnecting(true);
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket.IO] Disconnected from server:', reason);
      useNetworkStore.getState().setConnected(false);
      if (reason === 'io server disconnect') {
        socket?.connect();
      }
    });
  }
  return socket;
}

function emitWithAck<T>(event: string, data: unknown, timeoutMs = 8000): Promise<T> {
  const s = getSocket();
  if (!s.connected) {
    s.connect();
  }
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      timer = null;
      reject(new Error(`Timeout: Server is not responding (${event})`));
    }, timeoutMs);

    s.emit(event, data, (response: { ok?: boolean; error?: string } & Record<string, unknown>) => {
      if (!timer) return;
      clearTimeout(timer);
      timer = null;
      if (!response) {
        return resolve({} as T);
      }
      if (response.ok === false) {
        return reject(new Error(response.error ?? 'socket-error'));
      }
      resolve(response as T);
    });
  });
}

export const api = {
  create: (player: NetSeat, opts: { rules?: Partial<Rules>; deckType?: DeckType; isPublic?: boolean; bgTheme?: string }) =>
    emitWithAck<{ code: string; token: string }>(SOCKET_EVENTS.CLIENT_CREATE_ROOM, { player, ...opts }),

  quickMatch: (player: NetSeat, bgTheme?: string) =>
    emitWithAck<Snapshot & { code: string; token: string }>(SOCKET_EVENTS.CLIENT_QUICK_MATCH, { player, bgTheme }),

  join: (code: string, player: NetSeat) =>
    emitWithAck<Snapshot & { token: string }>(SOCKET_EVENTS.CLIENT_JOIN_ROOM, {
      code,
      player,
      token: loadToken(code),
    }),

  snapshot: async (code: string, id: string, token: string): Promise<Snapshot> => {
    const res = await emitWithAck<{ snapshot: Snapshot }>(SOCKET_EVENTS.CLIENT_RECONNECT, {
      code,
      playerId: id,
      token,
    });
    return res.snapshot;
  },

  seats: (code: string, id: string, token: string, op: Record<string, unknown>) =>
    emitWithAck<{ ok: boolean }>(SOCKET_EVENTS.CLIENT_SEATS, { code, playerId: id, token, ...op }),

  rules: (code: string, id: string, token: string, patch: { rules?: Partial<Rules>; deckType?: DeckType; bgTheme?: string }) =>
    emitWithAck<{ ok: boolean }>(SOCKET_EVENTS.CLIENT_RULES, { code, playerId: id, token, patch }),

  start: (code: string, id: string, token: string, bgTheme?: string) =>
    emitWithAck<{ ok: boolean }>(SOCKET_EVENTS.CLIENT_START, { code, playerId: id, token, bgTheme }),

  avatar: (code: string, id: string, token: string, image: string | null) =>
    emitWithAck<{ ok: boolean }>(SOCKET_EVENTS.CLIENT_AVATAR, { code, playerId: id, token, image }),

  step: async (_code: string, _id: string, _token: string) => {
    void _code; void _id; void _token;
    return { ok: true };
  },

  action: (code: string, id: string, token: string, action: Action) =>
    emitWithAck<{ ok: boolean; rejected?: string }>(SOCKET_EVENTS.CLIENT_ACTION, {
      code,
      playerId: id,
      token,
      action,
    }),

  leave: (code: string, id: string, token: string) =>
    emitWithAck<{ ok: boolean }>(SOCKET_EVENTS.CLIENT_LEAVE, { code, playerId: id, token }),

  transferHost: (code: string, id: string, token: string, targetPlayerId: string) =>
    emitWithAck<{ ok: boolean }>(SOCKET_EVENTS.CLIENT_TRANSFER_HOST, { code, playerId: id, token, targetPlayerId }),
};

/* ------------------------------------------------------------- Realtime Connection */

export interface Handlers {
  onRoom(update: RoomUpdate): void;
  onHand(cards: Card[]): void;
  onPresence(map: PresenceMap): void;
  onAvatars(map: Record<string, string>): void;
  onChat?(chat: ServerChatDto): void;
  onResync(): void;
}

let activeCode: string | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let lastPing: number | null = null;
const PING_INTERVAL_MS = 5000;

export function connect(code: string, handlers: Handlers): boolean {
  const s = getSocket();
  activeCode = code;
  const id = playerId();
  const token = loadToken(code);

  // Clear any existing socket listeners
  s.off(SOCKET_EVENTS.SERVER_ROOM_UPDATE);
  s.off(SOCKET_EVENTS.SERVER_HAND_UPDATE);
  s.off(SOCKET_EVENTS.SERVER_PRESENCE_UPDATE);
  s.off(SOCKET_EVENTS.SERVER_AVATARS_UPDATE);
  s.off(SOCKET_EVENTS.SERVER_CHAT);
  s.off(SOCKET_EVENTS.SERVER_PONG);
  s.off('connect');

  s.on(SOCKET_EVENTS.SERVER_ROOM_UPDATE, (update: RoomUpdate) => {
    handlers.onRoom(update);
  });

  s.on(SOCKET_EVENTS.SERVER_HAND_UPDATE, (cards: Card[]) => {
    handlers.onHand(cards ?? []);
  });

  s.on(SOCKET_EVENTS.SERVER_PRESENCE_UPDATE, (map: PresenceMap) => {
    handlers.onPresence(map);
  });

  s.on(SOCKET_EVENTS.SERVER_AVATARS_UPDATE, (map: Record<string, string>) => {
    handlers.onAvatars(map);
  });

  s.on(SOCKET_EVENTS.SERVER_CHAT, (chat: ServerChatDto) => {
    handlers.onChat?.(chat);
  });


  s.on(SOCKET_EVENTS.SERVER_PONG, (payload: { t?: number; serverTime?: number }) => {
    if (payload?.t) {
      const rtt = Date.now() - payload.t;
      lastPing = rtt;
      useNetworkStore.getState().setPing(rtt);
      if (payload.serverTime) {
        const serverOffset = payload.serverTime - (payload.t + rtt / 2);
        setServerClockOffset(serverOffset);
      }
    }
  });

  s.on('connect', () => {
    // Rejoin / reconnect to room
    if (activeCode) {
      s.emit(
        SOCKET_EVENTS.CLIENT_RECONNECT,
        { code: activeCode, playerId: id, token },
        (res: { snapshot?: Snapshot }) => {
          if (res?.snapshot) {
            handlers.onRoom({
              room: res.snapshot.room,
              game: res.snapshot.game,
              events: [],
            });
            handlers.onHand(res.snapshot.hand);
          }
        },
      );
    }
    handlers.onResync();
  });

  if (!s.connected) {
    s.connect();
  } else if (token) {
    s.emit(SOCKET_EVENTS.CLIENT_RECONNECT, { code, playerId: id, token });
  }

  // Ping interval
  if (pingTimer) clearInterval(pingTimer);
  pingTimer = setInterval(() => {
    if (s.connected && activeCode) {
      s.emit(SOCKET_EVENTS.CLIENT_PING, {
        code: activeCode,
        playerId: id,
        ping: lastPing,
        t: Date.now(),
      });
    }
  }, PING_INTERVAL_MS);

  return true;
}

export function disconnect(): void {
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
  lastPing = null;
  activeCode = null;

  useNetworkStore.getState().dismissModal();

  if (socket) {
    socket.off(SOCKET_EVENTS.SERVER_ROOM_UPDATE);
    socket.off(SOCKET_EVENTS.SERVER_HAND_UPDATE);
    socket.off(SOCKET_EVENTS.SERVER_PRESENCE_UPDATE);
    socket.off(SOCKET_EVENTS.SERVER_AVATARS_UPDATE);
    socket.off(SOCKET_EVENTS.SERVER_PONG);
    socket.disconnect();
    socket = null;
  }
}

export function manualReconnect(): void {
  const s = getSocket();
  useNetworkStore.getState().openModal();
  useNetworkStore.getState().setReconnecting(true);
  if (!s.connected) {
    s.connect();
  } else if (activeCode) {
    const id = playerId();
    const token = loadToken(activeCode);
    s.emit(SOCKET_EVENTS.CLIENT_RECONNECT, { code: activeCode, playerId: id, token });
  }
}

export function startPolling(code: string, onSnapshot: (s: Snapshot) => void, ms = 1000) {
  const id = playerId();
  const tick = async () => {
    try {
      onSnapshot(await api.snapshot(code, id, loadToken(code)));
    } catch {
      /* ignore */
    }
  };
  void tick();
  const timer = setInterval(tick, ms);
  return () => clearInterval(timer);
}

export function sendChatSocket(code: string, message: string): void {
  const s = getSocket();
  const id = playerId();
  const token = loadToken(code);
  if (!token) return;
  s.emit(SOCKET_EVENTS.CLIENT_CHAT, {
    code,
    playerId: id,
    token,
    message,
  });
}

