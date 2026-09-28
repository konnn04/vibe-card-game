import { Injectable, Logger } from '@nestjs/common';
import {
  botAction,
  botReaction,
  createGame,
  DEFAULT_RULES,
  handOf,
  MAX_HOLD_MS,
  MAX_SEATS,
  isDeckType,
  baseRulesFor,
  minPlayersFor,
  normalizeRules,
  rulesForNewDeck,
  publicView,
  reduce,
  RUSH_GRACE_MS,
  type Action,
  type DeckType,
  type GameEvent,
  type GameState,
  type Rules,
} from '@u-no/game-engine';
import {
  fillFreeSeats,
  leavesNextRound,
  MIN_TABLE_AFTER_KICK,
  shrinkSeats,
  pickRotation,
  type CreateRoomDto,
  type KickReason,
  type NetRoom,
  type NetSeat,
  type Presence,
  type PresenceMap,
  type SeatOpDto,
  type Snapshot,
  BOT,
  BOT_NAMES,
  NET,
  makeRoomCode,
  ROOM_CODE_LENGTH,
  ROOM_CODE_ALPHABET,
} from '@u-no/shared';
import { AvatarsService } from './avatars.service';
import type { RoomRecord } from './rooms.types';

/** Tổng người tối đa trong phòng (ngồi + hàng chờ): đủ ghế + 4 chỗ xem. */
const roomCapacity = (room: RoomRecord): number => room.rules.maxPlayers + 4;

/** Bàn thu nhỏ (8 -> 4 ghế): người dư NGẪU NHIÊN xuống hàng chờ — xem shrinkSeats(). */
function compactSeats(room: RoomRecord): void {
  while (room.seats.length < MAX_SEATS) room.seats.push(null);
  const r = shrinkSeats(room.seats, room.queue, room.rules.maxPlayers, room.hostId);
  room.seats = r.seats;
  room.queue = r.queue;
}

/** Bot do chủ phòng thêm (id sinh ở addBot/startOp) — khác người thật bị bot ngồi thay. */
const isRealBot = (id: string): boolean => id.startsWith('bot-');

export function makeToken(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

const VALID_THEMES = ['cafe', 'meadow', 'forest', 'park', 'space', 'paddy', 'city'];
const isValidTheme = (t?: string): boolean => !!t && VALID_THEMES.includes(t);

@Injectable()
export class RoomsService {
  private readonly logger = new Logger(RoomsService.name);

  private rooms = new Map<string, RoomRecord>();
  private roomTimers = new Map<string, NodeJS.Timeout>();

  // roomCode -> (playerId -> Presence)
  private presence = new Map<string, Map<string, Presence>>();

  // Callbacks registered by RoomsGateway
  public onBroadcastRoom?: (code: string, events?: GameEvent[]) => void;
  public onBroadcastPresence?: (code: string) => void;
  public onBroadcastAvatars?: (code: string) => void;
  /** Báo riêng cho người vừa bị mời khỏi phòng (gateway gửi SERVER_KICKED + rút socket khỏi room). */
  public onKicked?: (code: string, playerId: string, reason: KickReason) => void;

  constructor(private readonly avatarsService: AvatarsService) {
    // Start periodic sweep
    setInterval(() => this.sweepRooms(), 5_000);
  }

  // ------------------------------------------------------------- Room Queries

  getRoom(code: string): RoomRecord | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  getPublicRoom(room: RoomRecord): NetRoom {
    return {
      code: room.code,
      hostId: room.hostId,
      deckType: room.deckType,
      rules: room.rules,
      seats: room.seats,
      queue: room.queue,
      status: room.status,
      isPublic: room.isPublic,
      bgTheme: room.bgTheme,
      scores: room.scores,
    };
  }

  getSnapshot(code: string, playerId: string): Snapshot | null {
    const room = this.getRoom(code);
    if (!room) return null;
    return {
      room: this.getPublicRoom(room),
      game: room.game ? publicView(room.game) : null,
      hand: room.game ? handOf(room.game, playerId) : [],
      you: playerId,
      avatars: this.avatarsService.getAvatars(code),
    };
  }

  getPresenceMap(code: string): PresenceMap {
    const map = this.presence.get(code.toUpperCase());
    if (!map) return {};
    return Object.fromEntries(map.entries());
  }

  // ------------------------------------------------------------- Room Mutations

  createRoom(host: NetSeat, opts: CreateRoomDto): { code: string; token: string; room: RoomRecord } {
    let code = makeRoomCode();
    while (this.rooms.has(code)) {
      code = makeRoomCode();
    }
    const token = makeToken();
    const initialTheme = isValidTheme(opts.bgTheme) ? opts.bgTheme! : 'cafe';
    const deckType = isDeckType(opts.deckType) ? opts.deckType : 'classic';
    // Luôn đủ MAX_SEATS ô; số ghế DÙNG ĐƯỢC do rules.maxPlayers (theo bộ bài) quyết định.
    const seats: (NetSeat | null)[] = Array.from({ length: MAX_SEATS }, () => null);
    seats[0] = host;
    const room: RoomRecord = {
      code,
      hostId: host.id,
      deckType,
      rules: baseRulesFor(deckType, opts.rules, DEFAULT_RULES),
      seats,
      queue: [],
      status: 'lobby',
      game: null,
      tokens: { [host.id]: token },
      isPublic: !!opts.isPublic,
      bgTheme: initialTheme,
      scores: {},
      updatedAt: Date.now(),
    };

    this.rooms.set(code, room);
    if (host.avatarUrl) {
      this.avatarsService.setAvatar(code, host.id, host.avatarUrl);
    }
    this.updatePresence(code, host.id, true, null);
    return { code, token, room };
  }

  quickMatch(player: NetSeat, bgTheme?: string): { code: string; token: string; snapshot: Snapshot } {
    // Ghép random: chỉ ghép vào phòng đang ở lobby, còn ghế trống và tổng số người < 4
    for (const room of this.rooms.values()) {
      if (room.isPublic && room.status === 'lobby') {
        const totalMembers = room.seats.filter((s) => !!s).length + room.queue.length;
        if (totalMembers < 4) {
          const freeSeat = room.seats.findIndex((s, i) => !s && i < room.rules.maxPlayers);
          if (freeSeat >= 0) {
            const { token, snapshot } = this.joinRoom(room.code, player);
            return { code: room.code, token, snapshot };
          }
        }
      }
    }

    // Nếu không có phòng phù hợp (< 4 người), tự động tạo phòng public mới
    const { code, token } = this.createRoom(player, { player, isPublic: true, bgTheme });
    const snapshot = this.getSnapshot(code, player.id)!;
    return { code, token, snapshot };
  }

  joinRoom(code: string, player: NetSeat, providedToken?: string): { token: string; snapshot: Snapshot } {
    const room = this.getRoom(code);
    if (!room) throw new Error('room-not-found');

    let token = providedToken;
    const existingToken = room.tokens[player.id];

    if (existingToken && existingToken === providedToken) {
      // Re-joining with valid token
      this.reclaimSeat(room, player.id, player);
    } else {
      // Tham gia phòng bằng mã: giới hạn tối đa 8 người bao gồm trên bàn chơi lẫn hàng chờ
      const isAlreadyInRoom = room.seats.some((s) => s?.id === player.id) || room.queue.some((q) => q.id === player.id);
      if (!isAlreadyInRoom) {
        const totalMembers = room.seats.filter((s) => !!s).length + room.queue.length;
        if (totalMembers >= roomCapacity(room)) {
          throw new Error('room-full');
        }
      }

      // New joiner or no matching token
      token = makeToken();
      room.tokens[player.id] = token;

      const alreadySeatIndex = room.seats.findIndex((s) => s?.id === player.id);
      if (alreadySeatIndex >= 0) {
        room.seats[alreadySeatIndex] = player;
        // Bị kick giữa ván rồi vào lại bằng link: ghế vẫn đang do máy giữ hộ ->
        // trả lại cho chủ cũ (kick không phải chặn).
        this.reclaimSeat(room, player.id, player);
        if (room.afkStrikes) delete room.afkStrikes[player.id];
      } else {
        const freeSeat = room.seats.findIndex((s, i) => !s && i < room.rules.maxPlayers);
        if (freeSeat >= 0 && room.status === 'lobby') {
          room.seats[freeSeat] = player;
        } else if (!room.queue.some((q) => q.id === player.id)) {
          room.queue.push(player);
        }
      }
    }

    if (player.avatarUrl) {
      this.avatarsService.setAvatar(code, player.id, player.avatarUrl);
    }

    room.updatedAt = Date.now();
    this.updatePresence(code, player.id, true, null);

    const snapshot = this.getSnapshot(code, player.id)!;
    this.onBroadcastRoom?.(room.code);
    this.onBroadcastPresence?.(room.code);
    this.onBroadcastAvatars?.(room.code);
    return { token, snapshot };
  }

  reconnect(code: string, playerId: string, token: string): Snapshot {
    const room = this.getRoom(code);
    if (!room) throw new Error('room-not-found');
    if (room.tokens[playerId] !== token) throw new Error('unauthorized');

    this.reclaimSeat(room, playerId);
    this.updatePresence(code, playerId, true, null);

    const snapshot = this.getSnapshot(code, playerId)!;
    this.onBroadcastRoom?.(room.code);
    this.onBroadcastPresence?.(room.code);
    this.onBroadcastAvatars?.(room.code);
    return snapshot;
  }

  reclaimSeat(room: RoomRecord, playerId: string, player?: NetSeat): void {
    if (room.game) {
      const gp = room.game.players.find((p) => p.id === playerId);
      if (gp) {
        gp.isBot = false;
        gp.connected = true;
        if (player?.name) gp.name = player.name;
      }
    }
    const seat = room.seats.find((s) => s?.id === playerId);
    if (seat) {
      seat.isBot = false;
      if (player) {
        seat.name = player.name;
        seat.avatarPreset = player.avatarPreset;
        if (player.avatarUrl !== undefined) seat.avatarUrl = player.avatarUrl;
      }
    } else if (room.status === 'lobby' && player) {
      const free = room.seats.findIndex((s, i) => !s && i < room.rules.maxPlayers);
      if (free >= 0) {
        room.seats[free] = player;
      } else if (!room.queue.some((q) => q.id === player.id)) {
        room.queue.push(player);
      }
    }
    const qSeat = room.queue.find((q) => q.id === playerId);
    if (qSeat && player) {
      qSeat.name = player.name;
      qSeat.avatarPreset = player.avatarPreset;
      if (player.avatarUrl !== undefined) qSeat.avatarUrl = player.avatarUrl;
    }
  }

  verifyToken(room: RoomRecord, playerId: string, token: string): boolean {
    return !!playerId && !!token && room.tokens[playerId] === token;
  }

  seatOp(code: string, playerId: string, token: string, dto: SeatOpDto): void {
    const room = this.getRoom(code);
    if (!room) throw new Error('room-not-found');
    if (!this.verifyToken(room, playerId, token)) throw new Error('unauthorized');

    const isHost = room.hostId === playerId;

    switch (dto.op) {
      case 'move': {
        if (!isHost && dto.from !== undefined && room.seats[dto.from]?.id !== playerId) {
          throw new Error('not-allowed');
        }
        if (dto.from !== undefined && dto.to !== undefined && room.status === 'lobby'
          && dto.from < room.rules.maxPlayers && dto.to < room.rules.maxPlayers) {
          const temp = room.seats[dto.from];
          room.seats[dto.from] = room.seats[dto.to];
          room.seats[dto.to] = temp;
        }
        break;
      }
      case 'toQueue': {
        const from = dto.from !== undefined ? dto.from : dto.index;
        if (from !== undefined && room.seats[from]) {
          const targetPlayer = room.seats[from]!;
          if (!isHost && targetPlayer.id !== playerId) {
            throw new Error('not-allowed');
          }
          room.seats[from] = null;
          if (!room.queue.some((q) => q.id === targetPlayer.id)) {
            room.queue.push(targetPlayer);
          }
        }
        break;
      }
      case 'seatFromQueue': {
        const qIndex = dto.qIndex !== undefined ? dto.qIndex : dto.queueIndex;
        if (qIndex !== undefined && dto.seatIndex !== undefined && room.status === 'lobby'
          && dto.seatIndex < room.rules.maxPlayers) {
          const qPlayer = room.queue[qIndex];
          if (qPlayer) {
            if (!isHost && qPlayer.id !== playerId) throw new Error('not-allowed');
            room.queue.splice(qIndex, 1);
            const old = room.seats[dto.seatIndex];
            room.seats[dto.seatIndex] = qPlayer;
            if (old && !room.queue.some((q) => q.id === old.id)) {
              room.queue.push(old);
            }
          }
        }
        break;
      }
      case 'addBot': {
        if (!isHost || room.status !== 'lobby') throw new Error('not-allowed');
        const freeIndex = room.seats.findIndex((s, i) => !s && i < room.rules.maxPlayers);
        if (freeIndex >= 0) {
          const botId = `bot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          const botName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
          room.seats[freeIndex] = {
            id: botId,
            name: botName,
            isBot: true,
            avatarPreset: Math.floor(Math.random() * 6),
          };
        }
        break;
      }
      case 'kick': {
        if (!isHost) throw new Error('not-allowed');
        if (dto.targetId && dto.targetId !== playerId) {
          this.kickPlayer(room, dto.targetId);
        }
        break;
      }
      case 'watchMode': {
        const qIndex = room.queue.findIndex((q) => q.id === playerId);
        if (qIndex >= 0) {
          room.queue[qIndex].watchOnly = !!dto.watchOnly;
        }
        break;
      }
    }

    room.updatedAt = Date.now();
    this.onBroadcastRoom?.(room.code);
  }

  rulesOp(code: string, playerId: string, token: string, patch: { rules?: Partial<Rules>; deckType?: DeckType; bgTheme?: string }): void {
    const room = this.getRoom(code);
    if (!room) throw new Error('room-not-found');
    if (!this.verifyToken(room, playerId, token)) throw new Error('unauthorized');
    if (room.hostId !== playerId || room.status !== 'lobby') throw new Error('not-allowed');

    if (isDeckType(patch.deckType) && patch.deckType !== room.deckType) {
      room.deckType = patch.deckType;
      // Đổi mode -> số người về tối đa của mode, vỡ trận bật sẵn nếu mode có;
      // chủ phòng chỉnh lại sau. Mode mới nhỏ hơn thì shrinkSeats mời bớt người ra.
      room.rules = rulesForNewDeck(room.deckType, room.rules);
    }
    // Chuẩn hoá SAU khi áp cả 2: maxPlayers bị kẹp trong giới hạn của bộ bài,
    // client không tự bật lại được luật mà bộ Hỗn loạn bắt buộc tắt.
    room.rules = normalizeRules(room.deckType, { ...room.rules, ...patch.rules });
    // Giảm số người chơi / đổi sang bộ nhỏ hơn -> người dư NGẪU NHIÊN xuống hàng chờ.
    // Tăng thì không ai bị động tới: người chờ vào ghế trống ở ván sau.
    compactSeats(room);
    if (isValidTheme(patch.bgTheme)) {
      room.bgTheme = patch.bgTheme!;
    }

    room.updatedAt = Date.now();
    this.onBroadcastRoom?.(room.code);
  }

  startOp(code: string, playerId: string, token: string, bgTheme?: string): void {
    const room = this.getRoom(code);
    if (!room) throw new Error('room-not-found');
    if (!this.verifyToken(room, playerId, token)) throw new Error('unauthorized');
    if (room.hostId !== playerId) throw new Error('not-allowed');

    this.fillBotsToMin(room);

    if (isValidTheme(bgTheme)) {
      room.bgTheme = bgTheme!;
    }

    const events = this.beginMatch(room);
    this.onBroadcastRoom?.(room.code, events);
    this.checkAndScheduleRoom(room);
  }

  /** Thiếu người so với mức tối thiểu của mode (Party: 4, còn lại: 2) -> thêm bot cho đủ. */
  private fillBotsToMin(room: RoomRecord): void {
    const need = minPlayersFor(room.deckType) - room.seats.filter((s) => !!s).length;
    for (let k = 0; k < need; k++) {
      const freeIndex = room.seats.findIndex((s, i) => !s && i < room.rules.maxPlayers);
      if (freeIndex < 0) break;
      room.seats[freeIndex] = {
        id: `bot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)],
        isBot: true,
        avatarPreset: Math.floor(Math.random() * 6),
      };
    }
  }

  beginMatch(room: RoomRecord): GameEvent[] {
    const prev = room.game;
    for (const p of prev?.players ?? []) {
      room.scores[p.id] = p.score;
    }

    // Nếu bật đổi chỗ ngẫu nhiên mỗi ván: xáo trộn vị trí người chơi trên bàn
    if (room.rules.randomizeSeats ?? true) {
      const occupiedIndices = room.seats.map((s, i) => (s ? i : -1)).filter((i) => i !== -1);
      const shuffled = [...room.seats.filter((s): s is NetSeat => !!s)];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      occupiedIndices.forEach((seatIdx, i) => {
        room.seats[seatIdx] = shuffled[i];
      });
    }

    const seated = room.seats.filter((s): s is NetSeat => !!s);
    const players = seated.map((p, i) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      team: (i % 2) as 0 | 1,
      score: room.scores[p.id] ?? 0,
    }));

    const { state, events } = createGame({
      seed: Math.floor(Math.random() * 2 ** 31),
      deckType: room.deckType,
      rules: room.rules,
      players,
    });

    state.roundNo = (prev?.roundNo ?? 0) + 1;
    for (const p of state.players) {
      p.consecutiveRounds = prev?.players.find((x) => x.id === p.id)?.consecutiveRounds ?? 0;
    }

    room.game = state;
    room.status = 'playing';
    room.updatedAt = Date.now();
    return events;
  }

  actionOp(code: string, playerId: string, token: string, action: Action): { ok: boolean; rejected?: string; events?: GameEvent[] } {
    const room = this.getRoom(code);
    if (!room) throw new Error('room-not-found');
    if (!this.verifyToken(room, playerId, token)) throw new Error('unauthorized');
    if (!room.game) throw new Error('no-game');

    if (action.type === 'NEXT_ROUND') {
      if (room.hostId !== playerId) {
        return { ok: false, rejected: 'not-host' };
      }
      if (room.game.phase !== 'roundEnd') {
        return { ok: false, rejected: 'round-not-ended' };
      }
      // Người xem đã rớt mạng thì dọn khỏi hàng chờ TRƯỚC — không thì họ được
      // xếp vào ghế, đẩy một người thật ra ngoài rồi bị bot ngồi thay luôn.
      this.purgeOfflineSpectators(room, 0);

      // Người thật đang bị máy giữ ghế (rớt mạng / bỏ đi / để hết giờ nhiều
      // lượt) và mọi ghế bị kick giữa ván (kể cả bot) -> dọn khỏi phòng luôn,
      // không xếp vào hàng chờ. Bot không bị kick thì ở lại.
      const afk = room.seats.filter((s): s is NetSeat => leavesNextRound(s));
      for (const s of afk) this.evictPlayer(room, s.id, 'afk');
      if (afk.length) {
        this.onBroadcastPresence?.(room.code);
        this.onBroadcastAvatars?.(room.code);
        if (![...room.seats, ...room.queue].some((p) => p && !p.isBot)) {
          this.clearRoomTimer(room.code);
          this.onBroadcastRoom?.(room.code);
          return { ok: true };
        }
      }

      // Bàn còn ghế trống (ván trước bắt đầu khi chưa đủ người) -> người trong
      // hàng chờ vào thẳng ghế trống, KHÔNG ai phải nhường chỗ. Bàn tăng dần lên
      // tới maxPlayers thay vì kẹt mãi ở số người lúc bắt đầu.
      const fills = fillFreeSeats(room.seats, room.queue, room.rules.maxPlayers);
      if (fills.length) {
        for (const f of fills) room.seats[f.seat] = room.queue[f.queueIndex];
        const moved = new Set(fills.map((f) => f.queueIndex));
        room.queue = room.queue.filter((_, k) => !moved.has(k));
        this.fillBotsToMin(room);
        const events = this.beginMatch(room);
        this.onBroadcastRoom?.(room.code, events);
        this.checkAndScheduleRoom(room);
        return { ok: true, events };
      }

      // Nếu có người đang đợi trong hàng chờ (không phải watchOnly) -> xoay vòng
      const consecutive: Record<string, number> = {};
      for (const p of room.game.players) {
        consecutive[p.id] = p.consecutiveRounds ?? 0;
      }
      const swap = pickRotation({
        seats: room.seats,
        queue: room.queue,
        hostId: room.hostId,
        consecutive,
      });
      if (swap) {
        const outPlayer = room.seats[swap.seat];
        const inPlayer = room.queue.splice(swap.queueIndex, 1)[0];
        room.seats[swap.seat] = inPlayer;
        // Bot thật (do chủ phòng thêm) thì bỏ luôn, không xếp vào hàng chờ.
        // Người thật bị bot ngồi thay lúc rớt mạng thì về hàng chờ như người thường.
        if (outPlayer && !isRealBot(outPlayer.id) && !room.queue.some((q) => q.id === outPlayer.id)) {
          room.queue.push({ ...outPlayer, isBot: false });
        }
        const events = this.beginMatch(room);
        this.onBroadcastRoom?.(room.code, events);
        this.checkAndScheduleRoom(room);
        return { ok: true, events };
      }

      // Có người AFK bị dọn mà không ai vào thay -> vẫn phải chia lại bàn từ
      // danh sách ghế mới (NEXT_ROUND của engine giữ nguyên người chơi cũ).
      if (afk.length) {
        this.fillBotsToMin(room);
        const events = this.beginMatch(room);
        this.onBroadcastRoom?.(room.code, events);
        this.checkAndScheduleRoom(room);
        return { ok: true, events };
      }
    } else {
      // Người chơi tự thao tác = đang ở đây: xoá đếm AFK, và nếu máy đang giữ
      // ghế hộ (vd bị đánh dấu AFK vì để hết giờ) thì trả ghế lại ngay.
      this.markActive(room, playerId);
    }

    const { state, events } = reduce(room.game, action, Date.now());
    const rej = events.find((e) => e.t === 'reject');
    if (rej && rej.t === 'reject') {
      return { ok: false, rejected: rej.reason };
    }

    room.game = state;
    room.updatedAt = Date.now();

    this.onBroadcastRoom?.(room.code, events);
    this.checkAndScheduleRoom(room);
    return { ok: true, events };
  }

  leaveRoom(code: string, playerId: string, token: string): void {
    const room = this.getRoom(code);
    if (!room) return;
    if (!this.verifyToken(room, playerId, token)) return;

    this.removePlayer(room, playerId);
    this.avatarsService.removePlayer(room.code, playerId);
    this.presence.get(room.code)?.delete(playerId);

    this.onBroadcastRoom?.(room.code);
    this.onBroadcastPresence?.(room.code);
    this.onBroadcastAvatars?.(room.code);
  }

  transferHost(code: string, playerId: string, token: string, targetPlayerId: string): void {
    const room = this.getRoom(code);
    if (!room) throw new Error('room-not-found');
    if (!this.verifyToken(room, playerId, token)) throw new Error('unauthorized');
    if (room.hostId !== playerId) throw new Error('not-host');

    const target = [...room.seats, ...room.queue].find((p) => p && p.id === targetPlayerId && !p.isBot);
    if (!target) throw new Error('target-not-found');

    room.hostId = target.id;
    room.updatedAt = Date.now();
    this.onBroadcastRoom?.(room.code);
  }

  removePlayer(room: RoomRecord, playerId: string): void {
    const gp = room.status === 'playing' ? room.game?.players.find((p) => p.id === playerId) : undefined;
    if (gp) {
      // In-game: bot takeover instead of removing
      gp.isBot = true;
      gp.connected = false;
      const seat = room.seats.find((s) => s?.id === playerId);
      if (seat) {
        seat.isBot = true;
      }
    } else {
      room.seats = room.seats.map((s) => (s?.id === playerId ? null : s));
      room.queue = room.queue.filter((q) => q.id !== playerId);
      delete room.tokens[playerId];
    }

    if (room.hostId === playerId) {
      const remainingHumans = [...room.seats, ...room.queue].filter((p) => p && p.id !== playerId && !p.isBot);
      room.hostId = remainingHumans.length > 0 ? remainingHumans[0]!.id : '';
    }

    const humanCount = [...room.seats, ...room.queue].filter((p) => p && !p.isBot).length;
    if (humanCount === 0) {
      this.clearRoomTimer(room.code);
    }
  }

  /**
   * Chủ phòng KICK một người. Kick không phải chặn: người đó vào lại bằng link
   * như khách mới được.
   *  - Đang có ván và người đó đang cầm bài: không rút được khỏi ván giữa
   *    chừng -> máy đánh thay tới hết ván, ghế thành AFK và bị dọn ở NEXT_ROUND.
   *  - Còn lại (phòng chờ, hàng chờ): mời ra ngay.
   */
  private kickPlayer(room: RoomRecord, targetId: string): void {
    const gp = room.status === 'playing' ? room.game?.players.find((p) => p.id === targetId) : undefined;
    if (gp) {
      // Bàn chỉ còn MIN_TABLE_AFTER_KICK người (không tính ghế sắp rời) thì
      // thôi — kick nữa là bàn còn một mình chủ phòng.
      const staying = room.seats.filter((s) => s && !leavesNextRound(s)).length;
      const seat = room.seats.find((s) => s?.id === targetId);
      if (!seat || seat.leaving) return;
      if (staying <= MIN_TABLE_AFTER_KICK) throw new Error('too-few-players');
      seat.leaving = true;
      // Bot: đánh nốt ván này rồi rời bàn lúc NEXT_ROUND, không có ai để báo.
      if (isRealBot(targetId)) return;
      // Người thật: máy đánh thay NGAY, người bị kick về menu.
      this.removePlayer(room, targetId);
      room.queue = room.queue.filter((q) => q.id !== targetId);
      delete room.tokens[targetId];
      if (room.afkStrikes) delete room.afkStrikes[targetId];
      this.presence.get(room.code)?.delete(targetId);
      this.onKicked?.(room.code, targetId, 'host');
      this.checkAndScheduleRoom(room);
    } else {
      this.evictPlayer(room, targetId, 'host');
    }
    this.onBroadcastPresence?.(room.code);
    this.onBroadcastAvatars?.(room.code);
  }

  /** Mời hẳn một người khỏi phòng (ghế, hàng chờ, vé, avatar, presence). */
  private evictPlayer(room: RoomRecord, playerId: string, reason: KickReason): void {
    const hadToken = !!room.tokens[playerId];
    room.seats = room.seats.map((s) => (s?.id === playerId ? null : s));
    room.queue = room.queue.filter((q) => q.id !== playerId);
    delete room.tokens[playerId];
    if (room.afkStrikes) delete room.afkStrikes[playerId];
    this.avatarsService.removePlayer(room.code, playerId);
    this.presence.get(room.code)?.delete(playerId);
    if (room.hostId === playerId) {
      const next = [...room.seats, ...room.queue].find((p) => p && !p.isBot);
      room.hostId = next ? next.id : '';
    }
    // Bị kick giữa ván thì đã được báo lúc đó (vé đã xoá) — khỏi báo lần hai.
    if (hadToken) this.onKicked?.(room.code, playerId, reason);
  }

  /** Người thật vừa tự thao tác: xoá đếm AFK, lấy lại ghế nếu máy đang giữ hộ. */
  private markActive(room: RoomRecord, playerId: string): void {
    if (room.afkStrikes) delete room.afkStrikes[playerId];
    const gp = room.game?.players.find((p) => p.id === playerId);
    if (gp && gp.isBot && !isRealBot(playerId)) {
      gp.isBot = false;
      gp.connected = true;
      const seat = room.seats.find((s) => s?.id === playerId);
      if (seat) seat.isBot = false;
    }
  }

  /**
   * Dọn người xem (hàng chờ) đã offline quá `graceMs`. Người xem không có ghế
   * nên chẳng có gì để bot giữ hộ — để lại chỉ gây hại: tới lượt xoay vòng họ
   * bị kéo vào ghế, đẩy một người thật ra, rồi bot lại ngồi thay họ.
   * Trả về true nếu có người bị dọn (caller tự broadcast).
   */
  purgeOfflineSpectators(room: RoomRecord, graceMs: number = NET.spectatorDisconnectGraceMs): boolean {
    const pMap = this.presence.get(room.code);
    const now = Date.now();
    const gone = room.queue.filter((q) => {
      if (q.isBot) return false;
      const pres = pMap?.get(q.id);
      // Không có presence = đã mất dấu hẳn.
      if (!pres) return true;
      // Socket đã đóng quá thời gian ân hạn.
      if (!pres.online) return now - pres.ts >= graceMs;
      // Socket CHƯA đóng nhưng ping im quá presenceStaleMs (mạng treo, máy
      // ngủ) — client đã hiện OFF, server cũng phải coi là off, không thì
      // người này vẫn được xoay vào ghế ván sau.
      return now - pres.ts > NET.presenceStaleMs;
    });
    for (const q of gone) {
      // evictPlayer: dọn vé/avatar/presence, và nếu socket còn sống thì báo
      // SERVER_KICKED để client tự về menu thay vì kẹt ở màn xem.
      this.evictPlayer(room, q.id, 'afk');
    }
    return gone.length > 0;
  }

  private spectatorTimers = new Map<string, NodeJS.Timeout>();

  private scheduleSpectatorPurge(code: string, playerId: string): void {
    const key = `${code}:${playerId}`;
    clearTimeout(this.spectatorTimers.get(key));
    const timer = setTimeout(() => {
      this.spectatorTimers.delete(key);
      const room = this.getRoom(code);
      if (!room) return;
      if (this.purgeOfflineSpectators(room)) {
        room.updatedAt = Date.now();
        this.onBroadcastRoom?.(room.code);
        this.onBroadcastPresence?.(room.code);
        this.onBroadcastAvatars?.(room.code);
      }
    }, NET.spectatorDisconnectGraceMs + 50);
    this.spectatorTimers.set(key, timer);
  }

  // ------------------------------------------------------------- Presence & Ping

  updatePresence(code: string, playerId: string, online: boolean, ping: number | null): void {
    const c = code.toUpperCase();
    if (!this.presence.has(c)) {
      this.presence.set(c, new Map());
    }
    const map = this.presence.get(c)!;
    map.set(playerId, {
      online,
      ts: Date.now(),
      ping,
    });
  }

  handleDisconnect(code: string, playerId: string): void {
    const room = this.getRoom(code);
    if (!room) return;

    this.updatePresence(code, playerId, false, null);
    this.onBroadcastPresence?.(code);

    if (room.queue.some((q) => q.id === playerId)) {
      this.scheduleSpectatorPurge(room.code, playerId);
    }

    if (room.status === 'playing' && room.game) {
      const gp = room.game.players.find((p) => p.id === playerId);
      if (gp) {
        gp.connected = false;
        this.scheduleTakeover(room.code, playerId);
      }
    }
    // Không xóa người chơi trong lobby ngay lập tức trên socket drop.
    // sweepRooms sẽ kiểm tra và xóa nếu offline quá LOBBY_DISCONNECT_GRACE_MS.
  }

  private takeoverTimers = new Map<string, NodeJS.Timeout>();

  /**
   * Socket của người đang cầm bài vừa đóng: hẹn NET.disconnectTimeoutMs rồi
   * nếu vẫn offline thì máy đánh thay ngay — trước đây phải chờ tới lượt họ
   * hết giờ (cả bàn ngồi nhìn đồng hồ) hoặc lượt quét 30s. Vào lại kịp thì
   * presence đã online nên timer bỏ qua; vào lại muộn thì reclaimSeat trả ghế.
   */
  private scheduleTakeover(code: string, playerId: string): void {
    const key = `${code}:${playerId}`;
    clearTimeout(this.takeoverTimers.get(key));
    const timer = setTimeout(() => {
      this.takeoverTimers.delete(key);
      const room = this.getRoom(code);
      if (!room || room.status !== 'playing' || !room.game) return;
      const pres = this.presence.get(room.code)?.get(playerId);
      if (pres?.online) return;
      if (this.takeOver(room, playerId)) {
        room.updatedAt = Date.now();
        this.onBroadcastRoom?.(room.code);
        this.checkAndScheduleRoom(room);
      }
    }, NET.disconnectTimeoutMs + 50);
    this.takeoverTimers.set(key, timer);
  }

  /** Máy ngồi giữ ghế cho người thật đang cầm bài. Trả về true nếu có đổi. */
  private takeOver(room: RoomRecord, playerId: string): boolean {
    const gp = room.game?.players.find((p) => p.id === playerId);
    if (!gp || gp.isBot) return false;
    gp.isBot = true;
    gp.connected = false;
    const seat = room.seats.find((s) => s?.id === playerId);
    if (seat) seat.isBot = true;
    return true;
  }

  // ------------------------------------------------------------- Game Timers & Bot Takeover

  clearRoomTimer(code: string): void {
    const c = code.toUpperCase();
    const existing = this.roomTimers.get(c);
    if (existing) {
      clearTimeout(existing);
      this.roomTimers.delete(c);
    }
  }

  scheduleRoomStep(code: string, delayMs = 1100): void {
    const c = code.toUpperCase();
    this.clearRoomTimer(c);
    const timer = setTimeout(() => {
      this.roomTimers.delete(c);
      void this.runRoomStep(c);
    }, delayMs);
    this.roomTimers.set(c, timer);
  }

  checkAndScheduleRoom(room: RoomRecord): void {
    const g = room.game;
    if (room.status !== 'playing' || !g || g.phase === 'roundEnd' || g.phase === 'matchEnd') {
      this.clearRoomTimer(room.code);
      return;
    }

    const actorId = g.resume?.playerId ?? g.players[g.turn]?.id;
    const actor = g.players.find((p) => p.id === actorId);

    // Auto draw run
    if (g.drawRun) {
      this.scheduleRoomStep(room.code, Math.min(MAX_HOLD_MS, Math.max(0, g.turnHoldUntil - Date.now())) + 60);
      return;
    }

    // Party — vòng bầu Chỉ tay (xét TRƯỚC nhánh bot giữ lượt: người giữ lượt ở đây
    // chỉ là người đánh lá, còn cả bàn cùng bầu). Bot nào chưa bầu thì bầu sớm
    // (runRoomStep bước 3); bầu hết rồi thì hẹn đúng hạn chốt phiếu (bước 2 TIMEOUT).
    if (g.phase === 'awaitVote' && g.vote) {
      const botsLeft = g.players.some((p) => p.isBot && !p.eliminated && !g.vote!.votes[p.id]);
      this.scheduleRoomStep(
        room.code,
        botsLeft ? BOT.pickMs + Math.random() * 400 : Math.max(50, g.vote.deadline - Date.now() + 50),
      );
      return;
    }

    if (actor?.isBot) {
      const holdRemain = Math.min(MAX_HOLD_MS, Math.max(0, g.turnHoldUntil - Date.now()));
      const delay = Math.max(holdRemain, g.phase === 'awaitColor' || g.phase === 'awaitSwapTarget' ? 450 : 650);
      this.scheduleRoomStep(room.code, delay);
      return;
    }

    // Human turn timeout
    const timeRemaining = Math.max(500, g.turnDeadline - Date.now() + 200);
    if (g.rushWindow && g.players.some((p) => p.isBot)) {
      const elapsed = Date.now() - g.rushWindow.openedAt;
      const catchDelay = Math.max(500, RUSH_GRACE_MS + 300 - elapsed);
      this.scheduleRoomStep(room.code, Math.min(timeRemaining, catchDelay));
    } else {
      this.scheduleRoomStep(room.code, timeRemaining);
    }
  }

  async runRoomStep(code: string): Promise<void> {
    const room = this.getRoom(code);
    if (!room || !room.game || room.status !== 'playing') return;

    const g = room.game;
    if (g.phase === 'roundEnd' || g.phase === 'matchEnd') return;

    const now = Date.now();
    const actorId = g.resume?.playerId ?? g.players[g.turn]?.id;
    const actor = g.players.find((p) => p.id === actorId);

    // 0. Auto draw run
    if (g.drawRun && now >= g.turnHoldUntil) {
      const { state, events } = reduce(g, { type: 'DRAW', playerId: actorId }, now);
      room.game = state;
      room.updatedAt = now;
      this.onBroadcastRoom?.(room.code, events);
      this.checkAndScheduleRoom(room);
      return;
    }

    // 1. Bot action
    if (actor?.isBot) {
      if (now < g.turnHoldUntil) {
        this.scheduleRoomStep(room.code, g.turnHoldUntil - now + 50);
        return;
      }
      const think = g.phase === 'awaitColor' || g.phase === 'awaitSwapTarget' ? BOT.pickMs : BOT.thinkMs;
      const turnStart = g.turnDeadline - g.rules.turnSeconds * 1000;
      if (now < turnStart + think) {
        this.scheduleRoomStep(room.code, turnStart + think - now + 50);
        return;
      }
      const a = botAction(g, actor.id);
      if (a) {
        const { state, events } = reduce(g, a, now);
        room.game = state;
        room.updatedAt = now;
        this.onBroadcastRoom?.(room.code, events);
        this.checkAndScheduleRoom(room);
        return;
      }
    }

    // 2. Turn timeout & Bot takeover for disconnected human
    if (now >= g.turnDeadline) {
      if (actor && !actor.isBot) {
        const pMap = this.presence.get(room.code);
        const pres = pMap?.get(actor.id);
        // Online mà để hết giờ liên tiếp nhiều lượt cũng là AFK (bỏ đi, treo
        // tab). Vòng bầu Chỉ tay không tính: cả bàn cùng bầu, không phải lượt ai.
        let afk = !!pres && !pres.online;
        if (!afk && g.phase !== 'awaitVote') {
          room.afkStrikes ??= {};
          room.afkStrikes[actor.id] = (room.afkStrikes[actor.id] ?? 0) + 1;
          afk = room.afkStrikes[actor.id] >= NET.afkTimeoutStrikes;
        }
        if (afk) {
          // Bot takes over seat — ghế thành AFK, bị dọn khỏi phòng ở ván sau
          actor.isBot = true;
          actor.connected = false;
          const seat = room.seats.find((s) => s?.id === actor.id);
          if (seat) seat.isBot = true;
        }
      }
      const { state, events } = reduce(g, { type: 'TIMEOUT', playerId: actorId }, now);
      room.game = state;
      room.updatedAt = now;
      this.onBroadcastRoom?.(room.code, events);
      this.checkAndScheduleRoom(room);
      return;
    }

    // 3. Bot reactions (RUSH call / catch)
    const openedAt = g.rushWindow?.openedAt ?? 0;
    for (const p of g.players) {
      if (!p.isBot) continue;
      const react = botReaction(g, p.id);
      if (!react) continue;
      if (react.type === 'CALL_RUSH' && now - openedAt < 1200) continue;
      if (react.type === 'CATCH_RUSH' && now - openedAt < RUSH_GRACE_MS + 300) continue;
      const { state, events } = reduce(g, react, now);
      // Chỉ 'reject' mới là thất bại — nước hợp lệ có thể không phát event nào.
      if (events[0]?.t !== 'reject') {
        room.game = state;
        room.updatedAt = now;
        this.onBroadcastRoom?.(room.code, events);
        this.checkAndScheduleRoom(room);
        return;
      }
    }

    // LƯỚI AN TOÀN: bước này không làm gì (chưa tới hạn, bot chưa có việc...) thì
    // vẫn phải HẸN LẦN SAU. Thiếu dòng này thì phòng không còn bộ hẹn giờ nào và
    // đứng im cho tới khi có người thao tác — đúng lỗi vòng bầu Chỉ tay treo ở 0s.
    this.checkAndScheduleRoom(room);
  }

  // ------------------------------------------------------------- Sweep & Clean

  private sweepRooms(): void {
    const now = Date.now();
    for (const [code, room] of this.rooms.entries()) {
      const humanCount = [...room.seats, ...room.queue].filter((p) => p && !p.isBot).length;
      const idleTime = now - room.updatedAt;

      // Lưới an toàn cho timer ở handleDisconnect (vd người xem mất ping mà
      // socket chưa kịp đóng).
      if (this.purgeOfflineSpectators(room)) {
        this.onBroadcastRoom?.(code);
        this.onBroadcastPresence?.(code);
        this.onBroadcastAvatars?.(code);
      }

      // Disconnect timeout for human players in active match
      if (room.status === 'playing' && room.game) {
        const pMap = this.presence.get(code);
        for (const p of room.game.players) {
          if (!p.isBot) {
            const pres = pMap?.get(p.id);
            // Lưới an toàn cho scheduleTakeover, và bắt thêm ca socket CHƯA đóng
            // nhưng ping đã im quá presenceStaleMs (mạng treo, máy ngủ).
            const offline = !!pres && !pres.online && now - pres.ts > NET.disconnectTimeoutMs;
            const silent = !!pres && pres.online && now - pres.ts > NET.presenceStaleMs;
            if ((offline || silent) && this.takeOver(room, p.id)) {
              this.onBroadcastRoom?.(code);
              this.checkAndScheduleRoom(room);
            }
          }
        }
      } else if (room.status === 'lobby') {
        // Trong lobby: xóa người chơi nếu offline liên tục quá NET.lobbyDisconnectGraceMs
        const pMap = this.presence.get(code);
        const allHumans = [...room.seats, ...room.queue].filter((p): p is NetSeat => !!p && !p.isBot);
        let lobbyChanged = false;
        for (const p of allHumans) {
          const pres = pMap?.get(p.id);
          if (pres && !pres.online && now - pres.ts > NET.lobbyDisconnectGraceMs) {
            this.removePlayer(room, p.id);
            this.avatarsService.removePlayer(code, p.id);
            pMap.delete(p.id);
            lobbyChanged = true;
          }
        }
        if (lobbyChanged) {
          this.onBroadcastRoom?.(code);
          this.onBroadcastPresence?.(code);
          this.onBroadcastAvatars?.(code);
        }
      }

      if (humanCount === 0 && idleTime > NET.emptyRoomTtlMs) {
        this.logger.log(`Sweeping empty room ${code}`);
        this.clearRoomTimer(code);
        this.rooms.delete(code);
        this.presence.delete(code);
        this.avatarsService.clearRoom(code);
      }
    }
  }
}
