'use client';
import '@/src/lib/patchDiscord';
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

/** Tình trạng mạng của một người trong phòng. */
export interface Presence {
  online: boolean;
  /** Mốc nhịp tim gần nhất (đồng hồ SERVER). */
  ts: number;
  /** Độ trễ khứ hồi tới database, mili-giây. null = chưa đo được. */
  ping: number | null;
}
export type PresenceMap = Record<string, Presence>;

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

  // Gõ nhịp cho server đẩy ván (bot đi / hết giờ / rút tiếp). KHÔNG mang hành
  // động nào — xem app/api/rooms/[code]/step/route.ts.
  // Ảnh đại diện tạm dùng chung trong phòng. image = null nghĩa là xoá.
  avatar: (code: string, id: string, token: string, image: string | null) =>
    post<{ ok: boolean }>(`/api/rooms/${code}/avatar`, { playerId: id, token, image }),

  step: (code: string, id: string, token: string) =>
    post<{ ok: boolean }>(`/api/rooms/${code}/step`, { playerId: id, token }),

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
  /** Ai đang online, trễ bao nhiêu — xem armPresence(). */
  onPresence(map: PresenceMap): void;
  /** Ảnh đại diện tạm của cả phòng, theo id người chơi. */
  onAvatars(map: Record<string, string>): void;
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
  void onDisconnect(presenceRef).set({ online: false, ts: serverTimestamp(), ping: null });
  void beat(db, code, id);
}

/**
 * NHỊP TIM + ĐO ĐỘ TRỄ.
 *
 * Ping ở đây là thời gian khứ hồi của một lần GHI vào database rồi được server
 * xác nhận — đúng con đường mà mọi nước đi phải đi qua, nên nó là con số có
 * nghĩa với người chơi, không phải một cú ping ICMP cho đẹp.
 *
 * Giá trị gửi đi là của nhịp TRƯỚC: phải ghi xong mới biết lần ghi đó mất bao
 * lâu, mà lúc đó thì đã ghi rồi. Trễ một nhịp (5s) không ảnh hưởng gì.
 */
let lastPing: number | null = null;
let beatTimer: ReturnType<typeof setInterval> | null = null;
const BEAT_MS = 5000;

async function beat(db: NonNullable<ReturnType<typeof getFirebaseClientDb>>, code: string, id: string) {
  const t0 = Date.now();
  try {
    await fbSet(ref(db, `rush/rooms/${code}/presence/${id}`), {
      online: true,
      ts: serverTimestamp(),
      ping: lastPing,
    });
    lastPing = Date.now() - t0;
  } catch {
    lastPing = null;
  }
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

  // 2b. Tình trạng mạng của cả phòng + nhịp tim của chính mình.
  const presenceRef = ref(db, `rush/rooms/${code}/presence`);
  const unsubPresence = onValue(presenceRef, (snap) => {
    const raw = (snap.val() ?? {}) as Record<string, Partial<Presence>>;
    const map: PresenceMap = {};
    for (const [pid, v] of Object.entries(raw)) {
      map[pid] = {
        online: !!v?.online,
        ts: typeof v?.ts === 'number' ? v.ts : 0,
        ping: typeof v?.ping === 'number' ? v.ping : null,
      };
    }
    handlers.onPresence(map);
  }, (error) => {
    // KHÔNG nuốt: thiếu luật trong database.rules.json thì Firebase từ chối đọc,
    // mà không có chỗ nào báo thì nhìn y hệt "tính năng không chạy".
    console.warn('[Firebase] presence sync warning:', error);
  });
  unsubs.push(unsubPresence);

  // 2c. Ảnh đại diện tạm — nhánh RIÊNG, đọc một lần rồi chỉ đổi khi có người
  // vào/ra, không đi kèm mỗi nước đi như bản ghi phòng.
  const avatarsRef = ref(db, `rush/rooms/${code}/avatars`);
  const unsubAvatars = onValue(avatarsRef, (snap) => {
    const raw = (snap.val() ?? {}) as Record<string, unknown>;
    const map: Record<string, string> = {};
    for (const [pid, v] of Object.entries(raw)) if (typeof v === 'string') map[pid] = v;
    handlers.onAvatars(map);
  }, (error) => {
    console.warn('[Firebase] avatar sync warning:', error);
  });
  unsubs.push(unsubAvatars);

  if (beatTimer) clearInterval(beatTimer);
  beatTimer = setInterval(() => { void beat(db, code, id); }, BEAT_MS);

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
  if (beatTimer) { clearInterval(beatTimer); beatTimer = null; }
  lastPing = null;
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
