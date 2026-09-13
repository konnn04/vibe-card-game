import {
  createGame, publicView, handOf, reduce, startRound,
  botAction, botReaction,
  DEFAULT_RULES, MAX_HOLD_MS, RUSH_GRACE_MS, type Action, type DeckType, type GameEvent, type GameState, type Rules,
} from '@u-no/game-engine';
import { makeRoomCode } from '@/src/config';
import { pickRotation } from '@/src/lib/rotation';
import { isTakenOver } from '@/src/lib/takeover';
import { DEFAULT_THEME, isBgTheme, type BgTheme } from '@/src/lib/themes';
import { dbDel, dbGet, dbSetAdd, dbSetMembers, dbSetRemove, dbUpdate, withLock } from './firebaseStore';

export interface RoomPlayer {
  id: string;
  name: string;
  isBot: boolean;
  avatarPreset: number;
  avatarUrl?: string | null;
  /**
   * Đang ở hàng chờ NHƯNG chỉ muốn xem, không muốn được xoay vào ghế.
   *
   * Đổi được ngay cả khi ván đang chạy — người xem giữa chừng thấy vui thì bấm
   * một cái là ván sau có ghế, và ngược lại.
   */
  watchOnly?: boolean;
}

export interface RoomRecord {
  code: string;
  hostId: string;
  deckType: DeckType;
  rules: Rules;
  seats: (RoomPlayer | null)[];
  queue: RoomPlayer[];
  status: 'lobby' | 'playing';
  game: GameState | null;
  /** token cấp lúc join — mọi action phải kèm token, chống giả mạo người khác */
  tokens: Record<string, string>;
  isPublic: boolean;
  /** Chủ đề nền của ván — chốt theo chủ phòng lúc beginMatch, cả bàn nhìn cùng một cảnh. */
  bgTheme: BgTheme;
  /**
   * ĐIỂM TÍCH LUỸ CỦA MỌI NGƯỜI TRONG PHÒNG, kể cả người đang ở hàng chờ.
   *
   * Điểm sống trong ván đấu (game.players[].score), mà ván đấu chỉ có 4 người
   * đang ngồi. Ai bị xoay ra hàng chờ là biến mất khỏi đó — quay lại ghế ở ván
   * sau thì beginMatch không tìm thấy họ và cho về 0, mất trắng điểm đã kiếm.
   * Bảng xếp hạng cuối ván cũng cần số của người đang chờ mới xếp đủ được.
   */
  scores: Record<string, number>;
  updatedAt: number;
}

const KEY = (code: string) => `rush/rooms/${code}/internal`;
const OPEN_SET = 'rush/openRooms';
/*
 * (Bỏ hằng TTL cũ.) Nó từng được truyền cho dbSet như thể phòng sẽ tự hết hạn,
 * nhưng RTDB không có TTL — tham số đó chỉ áp cho bộ nhớ dự phòng trong tiến
 * trình. Giữ lại một hằng tên TTL mà thực tế không hết hạn gì cả là lời hứa
 * sai ngay trong code. Việc hết hạn giờ do sweepStaleRooms() làm thật.
 */

export const newCode = makeRoomCode;
export const newToken = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

// Dữ liệu thô đọc thẳng từ Firebase RTDB — JSON không đảm bảo shape (mảng rỗng
// có thể bị Firebase bỏ hẳn khỏi object), nên phải normalize trước khi ép kiểu.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeGame(g: any): GameState | null {
  if (!g || typeof g !== 'object') return null;
  const players = Array.isArray(g.players)
    ? g.players.map((p: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
        ...p,
        hand: Array.isArray(p?.hand) ? p.hand : [],
      }))
    : [];

  return {
    ...g,
    players,
    drawPile: Array.isArray(g.drawPile) ? g.drawPile : [],
    discard: Array.isArray(g.discard) ? g.discard : [],
    pending: g.pending ? { ...g.pending } : null,
    resume: g.resume ? { ...g.resume } : null,
    drawRun: g.drawRun ? { ...g.drawRun } : null,
    rushWindow: g.rushWindow ? { ...g.rushWindow } : null,
    lastScores: g.lastScores && typeof g.lastScores === 'object' ? { ...g.lastScores } : {},
    roundPoints: g.roundPoints && typeof g.roundPoints === 'object' ? { ...g.roundPoints } : {},
    wildColors: g.wildColors && typeof g.wildColors === 'object' ? { ...g.wildColors } : {},
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeRoom(raw: any): RoomRecord {
  const seats: (RoomPlayer | null)[] = [null, null, null, null];
  if (Array.isArray(raw.seats)) {
    for (let i = 0; i < 4; i++) seats[i] = raw.seats[i] ?? null;
  } else if (raw.seats && typeof raw.seats === 'object') {
    for (let i = 0; i < 4; i++) seats[i] = raw.seats[i] ?? null;
  }
  return {
    code: raw.code,
    hostId: raw.hostId,
    deckType: raw.deckType || 'classic',
    rules: { ...DEFAULT_RULES, ...(raw.rules || {}) },
    seats,
    queue: Array.isArray(raw.queue) ? raw.queue : [],
    status: raw.status || 'lobby',
    game: raw.game ? normalizeGame(raw.game) : null,
    tokens: raw.tokens && typeof raw.tokens === 'object' ? raw.tokens : {},
    isPublic: Boolean(raw.isPublic),
    bgTheme: isBgTheme(raw.bgTheme) ? raw.bgTheme : DEFAULT_THEME,
    scores: raw.scores && typeof raw.scores === 'object' ? raw.scores : {},
    updatedAt: raw.updatedAt || Date.now(),
  };
}

export const loadRoom = async (code: string) => {
  const r = await dbGet<RoomRecord>(KEY(code));
  return r ? normalizeRoom(r) : null;
};
export const saveRoom = async (room: RoomRecord) => {
  // Mọi lần lưu phòng đều đánh dấu "còn sống" cho vòng dọn dẹp — đây là điểm chạm
  // duy nhất của mọi route, nên đủ để theo dõi toàn bộ phòng đang hoạt động.
  trackRoom(room.code);
  const at = Date.now();
  // Ghi bản ghi phòng VÀ mục sổ trong cùng một lượt: sổ không tốn round trip.
  await dbUpdate({
    [KEY(room.code)]: { ...room, updatedAt: at },
    [`${ROOM_INDEX}/${room.code}`]: at,
  });
};

/** Bản gửi cho client: bỏ token, bỏ bài thật. */
export function publicRoom(room: RoomRecord) {
  const norm = normalizeRoom(room);
  return {
    code: norm.code,
    hostId: norm.hostId,
    deckType: norm.deckType,
    rules: norm.rules,
    seats: norm.seats,
    queue: norm.queue,
    status: norm.status,
    isPublic: norm.isPublic,
    bgTheme: norm.bgTheme,
    scores: norm.scores,
  };
}

/**
 * LỌC URL AVATAR NHẬN TỪ CLIENT.
 *
 * URL này được PHÁT CHO CẢ PHÒNG và trình duyệt của mọi người sẽ tự tải nó về.
 * Nhận bừa nghĩa là bất kỳ ai cũng đặt được một đường dẫn tuỳ ý rồi bắt cả bàn
 * gọi tới đó — đủ để thu IP của từng người, hoặc trỏ vào thứ chẳng liên quan gì
 * tới avatar. Chỉ chấp nhận đúng CDN của Discord, nơi duy nhất game này sinh ra
 * avatar thật (ảnh người chơi tự tải lên KHÔNG bao giờ rời khỏi máy họ).
 */
const AVATAR_HOSTS = new Set(['cdn.discordapp.com', 'media.discordapp.net']);

export function sanitizeAvatarUrl(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 300) return null;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && AVATAR_HOSTS.has(u.host) ? u.toString() : null;
  } catch {
    return null;
  }
}

export function verify(room: RoomRecord, playerId: string, token: string) {
  return !!playerId && !!token && room.tokens[playerId] === token;
}

export const isHost = (room: RoomRecord, playerId: string) => room.hostId === playerId;
/** Người vừa quay lại có ghế nào đang bị máy giữ hộ không. */
export function canReclaimSeat(room: RoomRecord, playerId: string, token: string): boolean {
  if (!verify(room, playerId, token)) return false;
  const gp = room.game?.players.find((p) => p.id === playerId);
  return !!gp && isTakenOver(gp);
}

/**
 * Trả ghế lại cho người vừa kết nối lại.
 *
 * Không có bước này thì "reconnect được miễn phòng còn tồn tại" chỉ đúng một
 * nửa: người chơi vào lại thấy đúng bàn, đúng điểm, nhưng ghế vẫn mang cờ bot
 * nên máy cứ đánh thay còn họ ngồi nhìn chính mình chơi.
 */
export function reclaimSeat(room: RoomRecord, playerId: string) {
  const gp = room.game?.players.find((p) => p.id === playerId);
  if (gp && isTakenOver(gp)) {
    gp.isBot = false;
    gp.connected = true;
  }
  const seat = room.seats.find((s) => s?.id === playerId);
  if (seat) seat.isBot = false;
}

export const seatedPlayers = (room: RoomRecord) => room.seats.filter((s): s is RoomPlayer => !!s);
export const humansIn = (room: RoomRecord) => seatedPlayers(room).filter((p) => !p.isBot);

/**
 * Phát state cho cả phòng qua Firebase Realtime Database.
 * - public node: state ĐÃ che bài + giấu seed (ai cũng đọc được).
 * - hands/{playerId} node: bài thật của riêng người chơi đó (chỉ người đó đọc).
 * Gộp thành 1 atomic multi-path update.
 */
export async function broadcast(room: RoomRecord, events: GameEvent[] = []) {
  const game = room.game ? publicView(room.game) : null;
  const updates: Record<string, unknown> = {
    [`rush/rooms/${room.code}/public`]: {
      room: publicRoom(room),
      game,
      events,
      updatedAt: Date.now(),
    },
  };
  if (room.game) {
    for (const p of humansIn(room)) {
      updates[`rush/rooms/${room.code}/hands/${p.id}`] = {
        cards: handOf(room.game, p.id),
        updatedAt: Date.now(),
      };
    }
  }
  await dbUpdate(updates);
}

/** Đọc-sửa-ghi dưới lock để 2 action gần như đồng thời không ghi đè nhau. */
export async function mutate(
  code: string,
  fn: (room: RoomRecord) => Promise<{ events?: GameEvent[]; skipBroadcast?: boolean } | void>,
) {
  return withLock(code, async () => {
    const room = await loadRoom(code);
    if (!room) throw new Error('room-not-found');
    const res = (await fn(room)) ?? {};
    await saveRoom(room);
    if (!res.skipBroadcast) await broadcast(room, res.events ?? []);
    checkAndScheduleRoom(room);
    return room;
  });
}

export function createRoomRecord(host: RoomPlayer, opts: { rules?: Partial<Rules>; deckType?: DeckType; isPublic?: boolean }): RoomRecord {
  return {
    code: newCode(),
    hostId: host.id,
    deckType: opts.deckType ?? 'classic',
    rules: { ...DEFAULT_RULES, ...opts.rules },
    seats: [host, null, null, null],
    queue: [],
    status: 'lobby',
    game: null,
    tokens: { [host.id]: newToken() },
    isPublic: !!opts.isPublic,
    bgTheme: DEFAULT_THEME,
    scores: {},
    updatedAt: Date.now(),
  };
}

/** Ngồi vào ghế trống, hết ghế thì vào hàng chờ (FIFO). */
export function seatOrQueue(room: RoomRecord, player: RoomPlayer): 'seat' | 'queue' {
  const already = room.seats.findIndex((s) => s?.id === player.id);
  if (already >= 0) return 'seat';
  if (room.queue.some((q) => q.id === player.id)) return 'queue';
  const free = room.seats.findIndex((s, i) => !s && i < room.rules.maxPlayers);
  if (free >= 0 && room.status === 'lobby') {
    room.seats[free] = player;
    return 'seat';
  }
  room.queue.push(player);
  return 'queue';
}

export function removePlayer(room: RoomRecord, playerId: string) {
  room.seats = room.seats.map((s) => (s?.id === playerId ? null : s));
  room.queue = room.queue.filter((q) => q.id !== playerId);
  delete room.tokens[playerId];
  if (room.hostId === playerId) {
    const next = seatedPlayers(room).find((p) => !p.isBot) ?? room.queue.find((p) => !p.isBot);
    room.hostId = next?.id ?? '';
  }
  if (humansIn(room).length === 0) {
    clearRoomTimer(room.code);
  }
}

/** Xoá node presence của 1 người khi họ rời phòng chủ động (leave/kick) — tránh
 *  để lại rác presence chờ sweep dọn sau. */
export const clearPresence = (code: string, playerId: string) => dbDel(`rush/rooms/${code}/presence/${playerId}`);

export async function markOpen(room: RoomRecord) {
  const open = room.isPublic && room.status === 'lobby' && seatedPlayers(room).length < room.rules.maxPlayers;
  if (open) await dbSetAdd(OPEN_SET, room.code);
  else await dbSetRemove(OPEN_SET, room.code);
}

/** Quick match: tìm phòng public còn ghế, không có thì trả null để tạo mới. */
export async function findOpenRoom(): Promise<RoomRecord | null> {
  for (const code of await dbSetMembers(OPEN_SET)) {
    const room = await loadRoom(code);
    if (!room) { await dbSetRemove(OPEN_SET, code); continue; }
    if (room.status === 'lobby' && seatedPlayers(room).length < room.rules.maxPlayers) return room;
    await dbSetRemove(OPEN_SET, code);
  }
  return null;
}

/**
 * Dựng ván mới cho phòng — dùng cho CẢ lúc bấm Bắt đầu LẪN mỗi lần "Ván tiếp"
 * (rotateAndDeal), vì ghế có thể đã đổi nên danh sách người chơi phải dựng lại
 * từ đầu thay vì chạy NEXT_ROUND của engine.
 *
 * Vì dựng lại từ đầu nên mọi thứ TÍCH LUỸ QUA CÁC VÁN đều bị createGame đưa về
 * 0, và phải chép tay sang ván mới:
 *  - `score`: vốn đã chép sẵn (nếu không thì bảng điểm reset mỗi ván).
 *  - `roundNo`: KHÔNG chép thì mọi ván online đều mang số 1. Client dùng chính
 *    số này để nhận ra "sang ván mới" -> từ ván 2 trở đi nó không đổi nữa nên
 *    MẤT HẲN animation chia bài; và khoá của màn ăn mừng (roundNo + người thắng)
 *    lặp lại y hệt khi một người thắng hai ván liền -> cutscene chiến thắng bị
 *    bỏ qua. Đúng hai lỗi "chơi multi, thỉnh thoảng không có cutscene thắng và
 *    không có chia bài, thấy từ ván rematch thứ 2".
 *  - `consecutiveRounds`: rotateAndDeal đọc đúng field này ngay dòng dưới để
 *    chọn ai nhường ghế cho hàng chờ. Luôn bằng 0 thì việc "ai ngồi lâu nhất thì
 *    ra" thành ra chọn bừa.
 */
export function beginMatch(room: RoomRecord): GameEvent[] {
  const prev = room.game;
  // Chốt điểm của ván vừa xong vào sổ của PHÒNG trước khi dựng ván mới. Đây là
  // nơi duy nhất điểm rời khỏi ván đấu, nên cũng là nơi duy nhất phải nhớ.
  for (const p of prev?.players ?? []) room.scores[p.id] = p.score;
  const players = seatedPlayers(room).map((p, i) => ({
    id: p.id, name: p.name, isBot: p.isBot, team: (i % 2) as 0 | 1,
    // Đọc từ sổ phòng chứ không từ ván trước: người vừa ở hàng chờ quay lại ghế
    // KHÔNG có mặt trong ván trước, tra ở đó là ra 0 và họ mất sạch điểm cũ.
    score: room.scores[p.id] ?? 0,
  }));
  const { state, events } = createGame({
    seed: Math.floor(Math.random() * 2 ** 31),
    deckType: room.deckType,
    rules: room.rules,
    players,
  });
  state.roundNo = (prev?.roundNo ?? 0) + 1;
  // Chỉ CHÉP, không cộng thêm: engine đã tự +1 cho mọi người lúc kết ván
  // (xem chỗ chấm điểm trong engine.ts). Cộng lần nữa ở đây là đếm đôi.
  for (const p of state.players) {
    p.consecutiveRounds = prev?.players.find((x) => x.id === p.id)?.consecutiveRounds ?? 0;
  }
  room.game = state;
  room.status = 'playing';
  return events;
}

/**
 * GỠ NGƯỜI ĐÃ RỚT RA KHỎI HÀNG CHỜ.
 *
 * Người đang NGỒI mà rớt thì được máy đánh thay và giữ nguyên ghế — họ đang ở
 * giữa ván, quay lại là chơi tiếp. Người đang CHỜ thì khác hẳn: họ chưa có gì
 * để giữ, mà cứ nằm đó là chiếm suất và tới lượt xoay vòng lại được đẩy vào
 * ghế — một cái ghế ma, để rồi 30 giây sau máy lại phải tiếp quản. Gỡ hẳn ra
 * cho gọn; mở lại link là vào lại như khách mới, xếp cuối hàng.
 *
 * Gọi ngay trước lúc xoay vòng: đó là khoảnh khắc DUY NHẤT việc còn-hay-mất
 * kết nối của người trong hàng chờ thật sự có hệ quả, nên chỉ tốn một lượt đọc
 * presence cho mỗi ván thay vì mỗi bước.
 */
export async function dropDisconnectedQueue(room: RoomRecord): Promise<string[]> {
  if (!room.queue.length) return [];
  const presence = (await dbGet<Record<string, { online?: boolean; ts?: number }>>(
    `rush/rooms/${room.code}/presence`,
  )) ?? {};
  const now = Date.now();
  const gone = room.queue
    .filter((q) => {
      if (q.isBot) return false; // bot trong hàng chờ không có mạng để mà rớt
      const p = presence[q.id];
      // Thiếu bản ghi = vừa vào, chưa kịp đập nhịp nào -> KHÔNG coi là mất kết nối.
      return !!p && p.online === false && now - (p.ts ?? 0) > DISCONNECT_TIMEOUT_MS;
    })
    .map((q) => q.id);
  for (const id of gone) removePlayer(room, id);
  return gone;
}

/**
 * Hết ván: người chơi liên tục nhiều ván nhất nhường ghế cho đầu hàng chờ,
 * rồi chia lại bài. Chủ phòng được giữ ghế để phòng không mất người điều khiển bot.
 */
export async function rotateAndDeal(room: RoomRecord): Promise<GameEvent[]> {
  // Gỡ người đã rớt khỏi hàng chờ TRƯỚC khi chọn ai vào ghế — chọn xong mới gỡ
  // thì vừa đẩy đúng một người vắng mặt vào bàn.
  await dropDisconnectedQueue(room);
  const swap = room.game
    ? pickRotation({
        seats: room.seats,
        queue: room.queue,
        hostId: room.hostId,
        consecutive: Object.fromEntries(room.game.players.map((p) => [p.id, p.consecutiveRounds])),
      })
    : null;
  if (swap) {
    room.seats[swap.seat] = swap.in;
    // Gỡ ĐÚNG người được chọn, không phải người đầu hàng: hàng chờ có thể có
    // người "chỉ xem" đứng trước và họ phải được bỏ qua, không bị đẩy ra.
    room.queue.splice(swap.queueIndex, 1);
    room.queue.push(swap.out);
  }
  // seat thay đổi -> dựng ván mới thay vì NEXT_ROUND để danh sách người chơi khớp ghế
  return beginMatch(room);
}

export function applyAction(room: RoomRecord, action: Action): GameEvent[] {
  if (!room.game) return [];
  const { state, events } = reduce(room.game, action, Date.now());
  room.game = state;
  return events;
}

const roomTimers = new Map<string, NodeJS.Timeout>();

export function clearRoomTimer(code: string) {
  const existing = roomTimers.get(code);
  if (existing) {
    clearTimeout(existing);
    roomTimers.delete(code);
  }
}

/**
 * Nền serverless (Vercel và tương tự) đóng băng tiến trình ngay khi response đi,
 * nên setTimeout đặt trong lúc xử lý request KHÔNG BAO GIỜ nổ.
 *
 * Biết trước điều đó thì đừng đặt: mỗi request lại tạo một hẹn giờ chết, giữ
 * tham chiếu trong roomTimers và có thể níu event loop thêm một nhịp. Tệ hơn là
 * nó làm người đọc code tưởng ván đấu có cơ chế tự đẩy ở server — trong khi
 * thực tế thứ đang đẩy ván là nhịp gõ từ client (xem app/api/rooms/[code]/step).
 *
 * Ở host chạy dài hạn (Docker, VPS) thì tiến trình sống, hẹn giờ nổ thật, và nó
 * là lớp đẩy ván CHÍNH — nhịp từ client khi đó gần như không bao giờ phải gửi đi
 * vì việc đã xong trước khi tới khe của họ.
 */
const SERVERLESS = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

export function scheduleRoomStep(code: string, delayMs = 1100) {
  if (SERVERLESS) return;
  clearRoomTimer(code);
  const timer = setTimeout(() => {
    roomTimers.delete(code);
    void runRoomStep(code);
  }, delayMs);
  roomTimers.set(code, timer);
}

export function checkAndScheduleRoom(room: RoomRecord) {
  const g = room.game;
  if (room.status !== 'playing' || !g || g.phase === 'roundEnd' || g.phase === 'matchEnd') {
    clearRoomTimer(room.code);
    return;
  }

  const actorId = g.resume?.playerId ?? g.players[g.turn]?.id;
  const actor = g.players.find((p) => p.id === actorId);

  // Chuỗi rút từng lá đang chạy: server tự kéo lá kế tiếp cho BẤT KỲ AI (kể cả
  // người thật). Họ đã bấm Rút rồi, không bắt bấm lại từng lá; và nếu để client
  // tự gửi thì mất kết nối giữa chừng là phòng kẹt.
  if (g.drawRun) {
    scheduleRoomStep(room.code, Math.min(MAX_HOLD_MS, Math.max(0, g.turnHoldUntil - Date.now())) + 60);
    return;
  }

  if (actor?.isBot) {
    // Còn animation nào đang phát (turnHoldUntil) thì bot phải chờ hết trước
    // — cộng phần còn lại vào delay bình thường, không hành động đè lên
    // animation (rút bài tuần tự, cấm lượt...) đang chạy phía client.
    // Trần MAX_HOLD_MS dùng CHUNG với client: cắt ngắn hơn client là bot sẽ
    // hành động khi animation (rút chồng phạt...) vẫn đang chạy ở màn hình.
    const holdRemain = Math.min(MAX_HOLD_MS, Math.max(0, g.turnHoldUntil - Date.now()));
    // If bot needs to pick color or swap target, respond quickly (450ms)
    // If bot is playing normal turn, delay 1100ms so card animations look natural
    // max() chứ KHÔNG cộng dồn: thời gian bot "nghĩ" chạy song song với
    // animation, cộng dồn sẽ làm mỗi nước đi ì ạch (đã đo được).
    const delay = Math.max(holdRemain, (g.phase === 'awaitColor' || g.phase === 'awaitSwapTarget') ? 450 : 650);
    scheduleRoomStep(room.code, delay);
    return;
  }

  // Human turn: schedule timeout when turn deadline expires
  const timeRemaining = Math.max(500, g.turnDeadline - Date.now() + 200);

  // If there's an active rushWindow and bots could catch, schedule at min of timeout and catch delay
  if (g.rushWindow && g.players.some((p) => p.isBot)) {
    const elapsed = Date.now() - g.rushWindow.openedAt;
    const catchDelay = Math.max(500, RUSH_GRACE_MS + 300 - elapsed);
    scheduleRoomStep(room.code, Math.min(timeRemaining, catchDelay));
  } else {
    scheduleRoomStep(room.code, timeRemaining);
  }
}

/**
 * NHỊP NGHĨ CỦA BOT (ms) — đo từ lúc lượt của nó bắt đầu.
 *
 * Trước đây độ trễ này nằm ở chỗ ĐẶT HẸN GIỜ (`scheduleRoomStep(code, 650)`),
 * không nằm trong bản thân bước đi. Cách đó chỉ đúng khi duy nhất cái hẹn giờ
 * gọi tới runRoomStep. Từ khi client gõ nhịp (vì hẹn giờ trong tiến trình không
 * sống nổi trên serverless), bot sẽ đi ngay nhịp gõ đầu tiên — tức đi đè lên
 * animation của lá vừa đánh, và nhanh đến mức không kịp thấy nó "nghĩ".
 *
 * Nên điều kiện thời gian phải nằm TRONG bước đi: gọi bao nhiêu lần, gọi từ đâu
 * cũng không làm bot đi sớm hơn được.
 */
const BOT_THINK_MS = 650;
/** Chọn màu / chọn người đổi bài: quyết định nhỏ, đáp nhanh hơn cho đỡ lê thê. */
const BOT_PICK_MS = 450;

export async function runRoomStep(code: string) {
  try {
    await mutate(code, async (r) => {
      const g = r.game;
      if (!g || g.phase === 'roundEnd' || g.phase === 'matchEnd') return { skipBroadcast: true };

      const now = Date.now();
      const actorId = g.resume?.playerId ?? g.players[g.turn]?.id;
      const actor = g.players.find((p) => p.id === actorId);

      // 0. Chuỗi rút từng lá: rút thêm đúng 1 lá cho người đang ở lượt.
      if (g.drawRun && now >= g.turnHoldUntil) {
        const events = applyAction(r, { type: 'DRAW', playerId: actorId });
        return { events };
      }

      // 1. Bot action if it's bot's turn
      if (actor?.isBot) {
        // Chưa hết animation của nước trước thì bot phải chờ — giống hệt luật đã
        // áp cho chuỗi rút ở trên.
        if (now < g.turnHoldUntil) return { skipBroadcast: true };
        // ...và vẫn phải "nghĩ" một nhịp tính từ lúc lượt bắt đầu, để nước đi của
        // bot không nổ ra ngay khung hình sau nước của người trước.
        const think = g.phase === 'awaitColor' || g.phase === 'awaitSwapTarget' ? BOT_PICK_MS : BOT_THINK_MS;
        const turnStart = g.turnDeadline - g.rules.turnSeconds * 1000;
        if (now < turnStart + think) return { skipBroadcast: true };
        const a = botAction(g, actor.id);
        if (a) {
          const events = applyAction(r, a);
          return { events };
        }
      }

      // 2. Turn timeout
      if (now >= g.turnDeadline) {
        /*
         * HẾT GIỜ MÀ FIREBASE ĐÃ BÁO RỚT -> GIAO CHO MÁY NGAY, KHÔNG CHỜ THÊM.
         *
         * Không cần ngưỡng 30 giây ở đây, vì hai điều kiện cộng lại đã quá đủ
         * bằng chứng:
         *  - Chính đồng hồ lượt đã đếm hết 15-30 giây rồi. ĐÓ là thời gian ân
         *    hạn; cộng thêm 30 giây nữa là bắt cả bàn ngồi đợi hai lần.
         *  - `online: false` KHÔNG phải do đoán: Firebase tự ghi nó qua
         *    onDisconnect() khi websocket thật sự đứt, và nếu người chơi có lại
         *    mạng thì armPresence() ghi `true` đè lên. Một cú chớp mạng tự khỏi
         *    trước khi hết lượt sẽ không bao giờ chạm tới nhánh này.
         *
         * Hai trường hợp CỐ Ý không tiếp quản, dù cũng hết giờ:
         *  - Không có bản ghi presence (chưa từng nối Firebase, hoặc đang chạy
         *    kiểu poll): thiếu tin tức KHÁC với tin xấu.
         *  - `online: true` nhưng bỏ lượt: người đó vẫn ngồi đó, chỉ là AFK hay
         *    đang nghĩ. Cướp ghế của họ là sai.
         *
         * Ngưỡng 30 giây vẫn giữ cho HÀNG CHỜ (dropDisconnectedQueue): ở đó
         * không có đồng hồ lượt nào đóng vai ân hạn cả.
         */
        const actorNow = g.players.find((pl) => pl.id === actorId);
        if (actorNow && !actorNow.isBot) {
          const pres = await dbGet<{ online?: boolean; ts?: number }>(
            `rush/rooms/${code}/presence/${actorId}`,
          );
          if (pres && pres.online === false) {
            actorNow.isBot = true;
            actorNow.connected = false;
            const seat = r.seats.find((x) => x?.id === actorId);
            if (seat) seat.isBot = true;
          }
        }
        const events = applyAction(r, { type: 'TIMEOUT', playerId: actorId });
        return { events };
      }

      // 3. Bot reactions (RUSH call / catch)
      const openedAt = g.rushWindow?.openedAt ?? 0;
      for (const p of g.players) {
        if (!p.isBot) continue;
        const react = botReaction(g, p.id);
        if (!react) continue;
        if (react.type === 'CALL_RUSH' && now - openedAt < 1200) continue;
        // Bot cũng phải tôn trọng ân hạn (engine sẽ từ chối sớm hơn thế).
        if (react.type === 'CATCH_RUSH' && now - openedAt < RUSH_GRACE_MS + 300) continue;
        const events = applyAction(r, react);
        if (events.length && events[0].t !== 'reject') return { events };
      }

      return { skipBroadcast: true };
    });
  } catch {
    /*
     * BƯỚC HỎNG THÌ PHẢI HẸN LẠI, KHÔNG ĐƯỢC IM LẶNG BỎ CUỘC.
     *
     * mutate() chạy dưới withLock, và withLock ném 'room-busy' khi khoá đang bị
     * chiếm — chuyện hết sức bình thường: người chơi bấm đúng lúc hẹn giờ nổ là
     * trúng. Nhưng checkAndScheduleRoom() lại nằm TRONG đường thành công của
     * mutate, nên một lần tranh khoá là chuỗi tự hẹn giờ chết hẳn và phòng đứng
     * im tới khi có ai đó hành động — đúng kiểu "thỉnh thoảng nghẽn rồi treo ở
     * 0 giây". Hẹn lại một nhịp ngắn là chuỗi tự lành.
     */
    scheduleRoomStep(code, 250);
  }
}

/* ================================================================
 * QUẢN LÝ VÒNG ĐỜI PHÒNG: dọn phòng rác + phát hiện mất kết nối
 * ================================================================
 * Firebase RTDB không có TTL tự xoá khoá như Redis, nên phòng ghi 1 lần rồi
 * bỏ quên sẽ nằm lại vĩnh viễn nếu không có ai chủ động xoá. 1 vòng sweep định
 * kỳ xử lý cả 2 việc cùng lúc (đọc 1 lần, quyết định luôn):
 *  1. Phòng trống hẳn quá lâu, hoặc phòng cũ không hoạt động dù còn người
 *     (tab bị bỏ quên) -> xoá khỏi DB.
 *  2. Người chơi mất kết nối (Firebase onDisconnect ghi `presence`) quá 30s
 *     -> đang chơi thì AI tiếp quản (isBot=true, giữ nguyên tên/bài để người
 *     khác biết ai vừa rớt mạng), đang ở lobby thì gỡ khỏi ghế/hàng chờ luôn.
 *     Token của họ bị thu hồi — quay lại phải join như người chơi mới.
 */

export interface PresenceEntry { online: boolean; ts: number }

const DISCONNECT_TIMEOUT_MS = 30_000;
const EMPTY_ROOM_TTL_MS = 3 * 60_000;
const STALE_ROOM_TTL_MS = 6 * 3600_000;
const SWEEP_INTERVAL_MS = 15_000;
const FULL_SCAN_EVERY = 20; // ~mỗi 5 phút, quét toàn bộ rush/rooms một lần (bắt cả phòng từ tiến trình cũ)

const activeRoomCodes = new Set<string>();
export function trackRoom(code: string) {
  if (code) activeRoomCodes.add(code);
}
function untrackRoom(code: string) {
  activeRoomCodes.delete(code);
}

async function deleteRoom(code: string) {
  await dbDel(`rush/rooms/${code}`);
  await dbDel(`${ROOM_INDEX}/${code}`);
  await dbSetRemove(OPEN_SET, code);
  untrackRoom(code);
  clearRoomTimer(code);
}
/**
 * SỔ THEO DÕI PHÒNG — code -> mốc cập nhật gần nhất.
 *
 * Firebase RTDB KHÔNG có TTL: tham số `ttlSeconds` của dbSet chỉ áp cho bộ nhớ
 * dự phòng trong tiến trình, còn nhánh Firebase thật là một `.set()` không hạn.
 * Mà việc dọn phòng cũ lại nằm ở vòng sweep chạy bằng setInterval — thứ không
 * bao giờ nổ trên serverless. Hệ quả: MỌI phòng từng tạo ra đều nằm lại vĩnh
 * viễn trong database.
 *
 * Sổ này để dọn được mà không phải tải cả đống phòng về: một lượt đọc là biết
 * phòng nào lâu không đụng tới, chỉ những phòng đó mới cần tải lên kiểm tra.
 * Ghi kèm trong cùng lượt ghi phòng (dbUpdate nhiều đường) nên không tốn thêm
 * round trip nào.
 */
const ROOM_INDEX = 'rush/roomIndex';
/** Trần số phòng xoá trong MỘT lần quét — không để việc dọn làm chậm người tạo phòng. */
const SWEEP_BUDGET = 25;

/**
 * Dọn phòng cũ. Gọi lúc có người TẠO PHÒNG MỚI: đó là thời điểm tự nhiên để
 * dọn (có người đang chờ vài trăm ms rồi), và cũng là thời điểm duy nhất chắc
 * chắn có request trên nền serverless.
 *
 * TUYỆT ĐỐI KHÔNG ĐỘNG VÀO PHÒNG ĐANG CHƠI: sổ chỉ dùng để CHỌN ứng viên, còn
 * quyết định xoá thì đọc lại bản ghi phòng thật và xét `updatedAt` của chính
 * nó. Ván đang chạy thì mỗi nước đi đều ghi phòng, nên `updatedAt` luôn mới —
 * không đời nào lọt vào diện xoá.
 */
export async function sweepStaleRooms(): Promise<number> {
  const index = (await dbGet<Record<string, number>>(ROOM_INDEX)) ?? {};
  const now = Date.now();

  const candidates = Object.entries(index)
    .filter(([, at]) => typeof at === 'number' && now - at > EMPTY_ROOM_TTL_MS)
    .sort((a, b) => a[1] - b[1])
    .slice(0, SWEEP_BUDGET);

  let removed = 0;
  for (const [code] of candidates) {
    try {
      const room = await loadRoom(code);
      // Mục sổ mồ côi (phòng đã bị xoá bằng đường khác) -> dọn nốt mục sổ.
      if (!room) {
        await dbDel(`${ROOM_INDEX}/${code}`);
        removed++;
        continue;
      }
      const idle = now - room.updatedAt;
      const empty = seatedPlayers(room).length === 0 && room.queue.length === 0;
      const stale = (empty && idle > EMPTY_ROOM_TTL_MS) || idle > STALE_ROOM_TTL_MS;
      if (!stale) continue;
      await deleteRoom(code);
      removed++;
    } catch {
      /* một phòng lỗi không được làm hỏng cả lượt dọn */
    }
  }
  return removed;
}


/** true nếu phòng đã bị xoá (gọi sau cùng, đừng broadcast/save thêm nữa). */
async function sweepOneRoom(code: string): Promise<boolean> {
  const room = await loadRoom(code);
  if (!room) {
    untrackRoom(code);
    return true;
  }

  const totallyEmpty = seatedPlayers(room).length === 0 && room.queue.length === 0;
  const idleFor = Date.now() - room.updatedAt;
  if ((totallyEmpty && idleFor > EMPTY_ROOM_TTL_MS) || idleFor > STALE_ROOM_TTL_MS) {
    await deleteRoom(code);
    return true;
  }

  const humanOccupants = [...seatedPlayers(room), ...room.queue].filter((p) => !p.isBot);
  if (!humanOccupants.length) return false;

  const presence = (await dbGet<Record<string, PresenceEntry>>(`rush/rooms/${code}/presence`)) ?? {};
  const now = Date.now();
  const disconnectedIds = humanOccupants
    .map((p) => p.id)
    .filter((id) => {
      const p = presence[id];
      // Chỉ hành động khi CÓ bản ghi presence báo offline — thiếu bản ghi (vừa
      // join, chưa kịp mở kết nối Firebase) không bao giờ bị coi là mất kết nối.
      return !!p && p.online === false && now - p.ts > DISCONNECT_TIMEOUT_MS;
    });
  if (!disconnectedIds.length) return false;

  let changed = false;
  for (const id of disconnectedIds) {
    if (room.status === 'playing' && room.game) {
      const gp = room.game.players.find((pl) => pl.id === id);
      if (gp && !gp.isBot) {
        gp.isBot = true;
        gp.connected = false;
        changed = true;
      }
      const seat = room.seats.find((s) => s?.id === id);
      if (seat && !seat.isBot) {
        seat.isBot = true;
        changed = true;
      }
      // Không ngồi ghế nào, tức đang ở HÀNG CHỜ: gỡ hẳn thay vì để chiếm suất
      // (xem dropDisconnectedQueue). Ván đang chạy cũng gỡ được, vì họ không
      // tham gia ván này.
      if (!seat && room.queue.some((q) => q.id === id)) {
        removePlayer(room, id);
        changed = true;
      }
      // GIỮ NGUYÊN VÉ PHÒNG. Trước đây dòng xoá token nằm ngoài cả hai nhánh,
      // nên người bị máy tiếp quản cũng mất vé — và mất vé là mất luôn đường
      // quay lại: verify() hỏng -> không đòi lại được ghế, mọi thao tác trả về
      // {error:"unauthorized"}, ngồi nhìn máy đánh thay chính mình tới hết ván.
      // Ghế vẫn mang tên họ, nên vé phải còn để họ nhận lại được.
    } else {
      // Rời hẳn khỏi phòng chờ thì vé mới vô nghĩa — removePlayer() tự xoá.
      removePlayer(room, id);
      changed = true;
    }
    await dbDel(`rush/rooms/${code}/presence/${id}`);
  }

  if (changed) {
    await saveRoom(room);
    await broadcast(room, []);
    await markOpen(room);
    checkAndScheduleRoom(room);
  }
  return false;
}

async function sweepRoom(code: string) {
  try {
    await withLock(code, () => sweepOneRoom(code));
  } catch {
    /* phòng đang khoá bởi 1 action khác -> bỏ qua, vòng sweep sau thử lại */
  }
}

let sweepTimer: NodeJS.Timeout | null = null;
let sweepTick = 0;

/** Quét toàn bộ `rush/rooms` (không chỉ các phòng tiến trình này nhớ) — bắt rác
 *  còn sót lại từ trước khi server khởi động lại / phòng do tiến trình khác tạo. */
async function fullScan() {
  try {
    const all = await dbGet<Record<string, unknown>>('rush/rooms');
    if (!all) return;
    for (const code of Object.keys(all)) trackRoom(code);
  } catch {
    /* bỏ qua, lần sau thử lại */
  }
}

function ensureSweepLoop() {
  if (sweepTimer || typeof setInterval === 'undefined') return;
  sweepTimer = setInterval(() => {
    sweepTick += 1;
    void (async () => {
      if (sweepTick % FULL_SCAN_EVERY === 0) await fullScan();
      for (const code of [...activeRoomCodes]) void sweepRoom(code);
    })();
  }, SWEEP_INTERVAL_MS);
  // Không giữ process sống chỉ vì timer này (quan trọng cho script/test ngắn hạn).
  sweepTimer.unref?.();
}

ensureSweepLoop();

export { startRound };
