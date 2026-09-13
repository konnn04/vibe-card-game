'use client';
import { ref, onValue, onDisconnect, set as fbSet, serverTimestamp, type Unsubscribe } from 'firebase/database';
import { getFirebaseClientDb, hasFirebaseClient } from '@/src/lib/firebase';
import type { Action, Card, DeckType, GameEvent, GameState, Rules } from '@u-no/game-engine';
import type { BgTheme } from '@/src/lib/themes';
import { NET } from '@/src/config';

export interface NetSeat { id: string; name: string; isBot: boolean; avatarPreset: number; avatarUrl?: string | null }
export interface NetRoom {
  code: string;
  hostId: string;
  deckType: DeckType;
  rules: Rules;
  seats: (NetSeat | null)[];
  queue: NetSeat[];
  status: 'lobby' | 'playing';
  isPublic: boolean;
  /** Chủ đề nền của ván, chốt theo CHỦ PHÒNG lúc bấm bắt đầu (xem api.start). */
  bgTheme?: BgTheme;
  /** Điểm tích luỹ của MỌI thành viên phòng, kể cả người đang ở hàng chờ. */
  scores?: Record<string, number>;
}
export interface RoomUpdate { room: NetRoom; game: GameState | null; events: GameEvent[] }

export const realtimeEnabled = hasFirebaseClient;

/* ------------------------------------------------------------- identity */

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

/* ------------------------------------------------------------- REST */

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `http-${res.status}`);
  return data;
}

export interface Snapshot { room: NetRoom; game: GameState | null; hand: Card[]; you: string | null }

export const api = {
  create: (player: NetSeat, opts: { rules?: Partial<Rules>; deckType?: DeckType; isPublic?: boolean }) =>
    post<{ code: string; token: string }>('/api/rooms', { player, ...opts }),

  quickMatch: (player: NetSeat) =>
    post<Snapshot & { code: string; token: string }>('/api/quickmatch', { player }),

  join: (code: string, player: NetSeat) =>
    post<Snapshot & { token: string }>(`/api/rooms/${code}/join`, { player }),

  snapshot: async (code: string, id: string, token: string): Promise<Snapshot> => {
    const res = await fetch(`/api/rooms/${code}?playerId=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`);
    if (!res.ok) throw new Error('snapshot-failed');
    return (await res.json()) as Snapshot;
  },

  seats: (code: string, id: string, token: string, op: Record<string, unknown>) =>
    post<{ ok: boolean }>(`/api/rooms/${code}/seats`, { playerId: id, token, ...op }),

  rules: (code: string, id: string, token: string, patch: { rules?: Partial<Rules>; deckType?: DeckType }) =>
    post<{ ok: boolean }>(`/api/rooms/${code}/rules`, { playerId: id, token, ...patch }),

  // bgTheme đi kèm lúc BẮT ĐẦU chứ không phải lúc đổi cài đặt: chủ phòng còn
  // chỉnh qua chỉnh lại trong lobby, chốt ở đây thì cả bàn vào ván cùng một nền.
  start: (code: string, id: string, token: string, bgTheme?: BgTheme) =>
    post<{ ok: boolean }>(`/api/rooms/${code}/start`, { playerId: id, token, bgTheme }),

  action: (code: string, id: string, token: string, action: Action) =>
    post<{ ok: boolean; rejected?: string }>(`/api/rooms/${code}/action`, { playerId: id, token, action }),

  leave: (code: string, id: string, token: string) =>
    post<{ ok: boolean }>(`/api/rooms/${code}/leave`, { playerId: id, token }),
};

/* ------------------------------------------------------------- realtime */

interface Connection {
  code: string;
  unsubs: Unsubscribe[];
}

let conn: Connection | null = null;

export interface Handlers {
  onRoom(update: RoomUpdate): void;
  onHand(cards: Card[]): void;
  /** mất/khôi phục kết nối -> gọi lại snapshot cho chắc, không tin state cũ */
  onResync(): void;
}

/**
 * Đăng ký "tôi đang online" + dặn Firebase tự ghi "offline" hộ nếu mất kết nối
 * (đóng tab, rớt mạng, sập trình duyệt...) — không cần client tự polling.
 * Server có 1 vòng sweep định kỳ đọc node này: mất kết nối quá 30s thì bot
 * tiếp quản (đang chơi) hoặc bị gỡ khỏi ghế/hàng chờ (đang ở lobby).
 * onDisconnect() phải đăng ký LẠI mỗi lần kết nối lại — Firebase chỉ giữ nó
 * cho phiên kết nối hiện tại, mất mạng xong có lại là mất luôn đăng ký cũ.
 */
function armPresence(db: ReturnType<typeof getFirebaseClientDb>, code: string, id: string) {
  if (!db) return;
  const presenceRef = ref(db, `rush/rooms/${code}/presence/${id}`);
  void onDisconnect(presenceRef).set({ online: false, ts: serverTimestamp() });
  void fbSet(presenceRef, { online: true, ts: serverTimestamp() });
}

/**
 * Nối Firebase Realtime Database:
 * - rush/rooms/{code}/public: Trạng thái chung (lượt, đống bài bỏ, số lượng bài mỗi người).
 * - rush/rooms/{code}/hands/{playerId}: Bài thật của riêng người chơi đó.
 * - rush/rooms/{code}/presence/{playerId}: "tôi còn online" — xem armPresence().
 * - .info/connected: Trạng thái kết nối WebSocket để tự động resync khi rớt mạng rồi có lại.
 */
export function connect(code: string, handlers: Handlers): boolean {
  const db = getFirebaseClientDb();
  if (!db) return false;

  const id = playerId();
  if (conn?.code === code) return true;
  disconnect();

  const unsubs: Unsubscribe[] = [];

  // 1. Lắng nghe trạng thái bàn chơi công khai
  const publicRef = ref(db, `rush/rooms/${code}/public`);
  const unsubPublic = onValue(
    publicRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const val = snapshot.val() as RoomUpdate;
        if (val) {
          val.events = Array.isArray(val.events) ? val.events : [];
          handlers.onRoom(val);
        }
      }
    },
    (error) => {
      console.warn('[Firebase] Public sync warning:', error);
      handlers.onResync();
    },
  );
  unsubs.push(unsubPublic);

  // 2. Lắng nghe bài trên tay của riêng người chơi này
  const handRef = ref(db, `rush/rooms/${code}/hands/${id}`);
  const unsubHand = onValue(
    handRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const val = snapshot.val() as { cards?: Card[] };
        handlers.onHand(val.cards ?? []);
      }
    },
    (error) => {
      console.warn('[Firebase] Hand sync warning:', error);
    },
  );
  unsubs.push(unsubHand);

  // 3. Tự động resync + tái đăng ký presence khi kết nối mạng được khôi phục
  let initialConnected = true;
  const connectedRef = ref(db, '.info/connected');
  const unsubConnected = onValue(connectedRef, (snap) => {
    if (snap.val() === true) {
      armPresence(db, code, id);
      if (!initialConnected) {
        handlers.onResync();
      }
      initialConnected = false;
    }
  });
  unsubs.push(unsubConnected);

  conn = { code, unsubs };
  return true;
}

export function disconnect() {
  if (!conn) return;
  for (const unsub of conn.unsubs) {
    try {
      unsub();
    } catch {
      /* ignore unsub error */
    }
  }
  conn = null;
}

/** Fallback khi chưa cấu hình Firebase: poll snapshot (chỉ để dev tại chỗ). */
export function startPolling(code: string, onSnapshot: (s: Snapshot) => void, ms = NET.pollMs) {
  const id = playerId();
  const tick = async () => {
    try {
      onSnapshot(await api.snapshot(code, id, loadToken(code)));
    } catch {
      /* phòng đã hết hạn hoặc mất mạng: lần tick sau thử lại */
    }
  };
  void tick();
  const timer = setInterval(tick, ms);
  return () => clearInterval(timer);
}
