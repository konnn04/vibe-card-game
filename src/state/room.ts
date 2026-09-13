'use client';
import { create } from 'zustand';
import { DEFAULT_RULES, type DeckType, type Rules } from '@u-no/game-engine';
import { BOT_NAMES, roomCode } from '@/src/lib/names';
import { api, loadToken, playerId, type NetRoom, type NetSeat } from './net';
import { isBgTheme, type BgTheme } from '@/src/lib/themes';
import { pickRotation } from '@/src/lib/rotation';
import { useSettings } from '@/src/lib/settings';

export interface Seat {
  id: string;
  name: string;
  isBot: boolean;
  avatarPreset: number;
  avatarUrl?: string | null;
  /** số ván liên tục đã chơi — dùng để xoay vòng hàng chờ (FIFO) */
  consecutiveRounds: number;
}

type Mode = 'local' | 'online';

interface RoomStore {
  mode: Mode;
  code: string;
  hostId: string;
  meId: string;
  deckType: DeckType;
  rules: Rules;
  seats: (Seat | null)[];
  queue: Seat[];
  /**
   * Nền do CHỦ PHÒNG chốt lúc vào ván (null = chưa chốt -> dùng nền của mình).
   * Chỉ có nghĩa ở phòng online; phòng local luôn theo cài đặt cá nhân.
   */
  bgTheme: BgTheme | null;
  /**
   * Điểm tích luỹ của mọi thành viên phòng (server giữ sổ, xem RoomRecord.scores).
   * Ván đấu chỉ chứa 4 người đang ngồi nên đây là nguồn duy nhất biết được điểm
   * của người đang ở hàng chờ.
   */
  scores: Record<string, number>;
  createRoom(me: Seat, opts?: { rules?: Partial<Rules>; deckType?: DeckType; bots?: number }): void;
  quickMatch(me: Seat): void;
  attachOnline(room: NetRoom): void;
  applyRemote(room: NetRoom): void;
  setRules(patch: Partial<Rules>): void;
  setDeck(d: DeckType): void;
  moveSeat(from: number, to: number): void;
  toQueue(index: number): void;
  seatFromQueue(qIndex: number, seatIndex: number): void;
  addBot(): void;
  kick(id: string): void;
  rotateAfterRound(consecutive: Record<string, number>, protectedId: string): { out: Seat; in: Seat } | null;
  reset(): void;
}

let botSeq = 0;
export function makeBot(): Seat {
  const name = BOT_NAMES[botSeq % BOT_NAMES.length];
  botSeq++;
  return {
    id: `bot-${botSeq}-${Math.random().toString(36).slice(2, 6)}`,
    name, isBot: true, avatarPreset: botSeq % 6, consecutiveRounds: 0,
  };
}

const toSeat = (p: { id: string; name: string; isBot: boolean; avatarPreset: number; avatarUrl?: string | null } | null): Seat | null =>
  p ? { ...p, consecutiveRounds: 0 } : null;

/** Ở chế độ online mọi thay đổi phải qua server; helper này gọi API rồi chờ broadcast. */
function remote(get: () => RoomStore, fn: (code: string, id: string, token: string) => Promise<unknown>) {
  const { code, meId } = get();
  if (!code) return;
  void fn(code, meId, loadToken(code)).catch(() => {
    /* server từ chối (không phải host, ván đã bắt đầu...) -> state cũ vẫn đúng */
  });
}

export const useRoom = create<RoomStore>((set, get) => ({
  mode: 'local',
  code: '',
  hostId: '',
  meId: 'me',
  deckType: 'classic',
  rules: { ...DEFAULT_RULES },
  seats: [null, null, null, null],
  queue: [],
  bgTheme: null,
  scores: {},

  /** Phòng cục bộ (chơi với bot, không cần mạng). */
  createRoom(me, opts) {
    const rules = { ...DEFAULT_RULES, ...opts?.rules };
    const seats: (Seat | null)[] = [me, null, null, null];
    for (let i = 0; i < (opts?.bots ?? 0) && i < 3; i++) seats[i + 1] = makeBot();
    set({ mode: 'local', code: roomCode(), hostId: me.id, meId: me.id, rules, deckType: opts?.deckType ?? 'classic', seats, queue: [] });
  },

  /** Quick match cục bộ: luật random, 3 bot. */
  quickMatch(me) {
    const r = () => Math.random() < 0.5;
    const rules: Rules = {
      ...DEFAULT_RULES,
      sevenZero: r(), stack: r(), jumpIn: r(), rushPenalty: r(),
      startingCards: 7, turnSeconds: 20, maxPlayers: 4,
    };
    set({
      mode: 'local', code: roomCode(), hostId: me.id, meId: me.id, rules, deckType: 'classic',
      seats: [me, makeBot(), makeBot(), makeBot()], queue: [],
    });
  },

  attachOnline(room) {
    set({ mode: 'online', meId: playerId() });
    get().applyRemote(room);
  },

  applyRemote(room) {
    if (!room) return;
    // Firebase RTDB có thể trả seats dạng object thưa {0:.., 2:..} thay vì mảng
    // đủ 4 phần tử (chuẩn JSON không phân biệt) — chuẩn hoá lại trước khi dùng.
    const seatsRaw = room.seats as unknown;
    const seatAt = (i: number): NetSeat | null =>
      Array.isArray(seatsRaw)
        ? (seatsRaw[i] ?? null)
        : (seatsRaw && typeof seatsRaw === 'object' ? ((seatsRaw as Record<number, NetSeat>)[i] ?? null) : null);
    const seats = [0, 1, 2, 3].map((i) => toSeat(seatAt(i)));
    const rawQueue = Array.isArray(room.queue) ? room.queue : [];
    const queue = rawQueue.map((q) => toSeat(q)).filter((s): s is Seat => !!s);

    set({
      code: room.code,
      hostId: room.hostId,
      deckType: room.deckType || 'classic',
      rules: room.rules ? { ...DEFAULT_RULES, ...room.rules } : { ...DEFAULT_RULES },
      seats,
      queue,
      bgTheme: isBgTheme(room.bgTheme) ? room.bgTheme : null,
      scores: room.scores && typeof room.scores === 'object' ? room.scores : {},
    });
  },

  setRules(patch) {
    if (get().mode === 'online') return remote(get, (c, i, t) => api.rules(c, i, t, { rules: patch }));
    set({ rules: { ...get().rules, ...patch } });
  },

  setDeck(d) {
    if (get().mode === 'online') return remote(get, (c, i, t) => api.rules(c, i, t, { deckType: d }));
    set({ deckType: d });
  },

  moveSeat(from, to) {
    if (get().mode === 'online') return remote(get, (c, i, t) => api.seats(c, i, t, { op: 'move', from, to }));
    const seats = get().seats.slice();
    [seats[from], seats[to]] = [seats[to], seats[from]];
    set({ seats });
  },

  toQueue(index) {
    if (get().mode === 'online') return remote(get, (c, i, t) => api.seats(c, i, t, { op: 'toQueue', index }));
    const seats = get().seats.slice();
    const p = seats[index];
    if (!p) return;
    seats[index] = null;
    set({ seats, queue: [...get().queue, p] });
  },

  seatFromQueue(qIndex, seatIndex) {
    if (get().mode === 'online')
      return remote(get, (c, i, t) => api.seats(c, i, t, { op: 'seatFromQueue', queueIndex: qIndex, seatIndex }));
    const queue = get().queue.slice();
    const seats = get().seats.slice();
    if (!queue[qIndex] || seats[seatIndex]) return;
    seats[seatIndex] = queue[qIndex];
    queue.splice(qIndex, 1);
    set({ seats, queue });
  },

  addBot() {
    if (get().mode === 'online') return remote(get, (c, i, t) => api.seats(c, i, t, { op: 'addBot' }));
    const seats = get().seats.slice();
    const free = seats.findIndex((s, i) => !s && i < get().rules.maxPlayers);
    const bot = makeBot();
    if (free >= 0) { seats[free] = bot; set({ seats }); }
    else set({ queue: [...get().queue, bot] });
  },

  kick(id) {
    if (get().mode === 'online') return remote(get, (c, i, t) => api.seats(c, i, t, { op: 'kick', targetId: id }));
    set({
      seats: get().seats.map((s) => (s?.id === id ? null : s)),
      queue: get().queue.filter((q) => q.id !== id),
    });
  },

  /**
   * Xoay vòng hàng chờ (chỉ chế độ local — online thì server tự làm khi NEXT_ROUND).
   * Chọn ai ra bằng ĐÚNG hàm server dùng, để hai chế độ không có hai luật khác nhau.
   */
  rotateAfterRound(consecutive, protectedId) {
    const { seats, queue, mode } = get();
    if (mode === 'online') return null;
    const swap = pickRotation({ seats, queue, hostId: protectedId, consecutive });
    if (!swap) return null;
    const nextSeats = seats.slice();
    nextSeats[swap.seat] = swap.in;
    set({ seats: nextSeats, queue: [...queue.slice(1), { ...swap.out, consecutiveRounds: 0 }] });
    return { out: swap.out, in: swap.in };
  },

  reset: () =>
    set({
      mode: 'local', code: '', hostId: '', meId: 'me', bgTheme: null, scores: {},
      seats: [null, null, null, null], queue: [], rules: { ...DEFAULT_RULES }, deckType: 'classic',
    }),
}));

/**
 * CHỦ ĐỀ NỀN ĐANG ÁP DỤNG — một câu trả lời duy nhất cho cả menu, phòng chờ và
 * scene 3D.
 *
 * Phòng online đã chốt nền (chủ phòng bấm Bắt đầu) thì cả bàn theo nền đó, kể
 * cả người vào giữa ván; ngoài ra theo cài đặt cá nhân.
 */
export function useActiveTheme(): BgTheme {
  const shared = useRoom((s) => (s.mode === 'online' ? s.bgTheme : null));
  const mine = useSettings((s) => s.bgTheme);
  return shared ?? mine;
}
