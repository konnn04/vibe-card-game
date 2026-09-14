import { Injectable, Logger } from '@nestjs/common';
import {
  botAction,
  botReaction,
  createGame,
  DEFAULT_RULES,
  handOf,
  MAX_HOLD_MS,
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
  pickRotation,
  type CreateRoomDto,
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

export function makeToken(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

const VALID_THEMES = ['cafe', 'meadow', 'forest', 'park'];
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

  constructor(private readonly avatarsService: AvatarsService) {
    // Start periodic sweep
    setInterval(() => this.sweepRooms(), 15_000);
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
    const room: RoomRecord = {
      code,
      hostId: host.id,
      deckType: opts.deckType ?? 'classic',
      rules: { ...DEFAULT_RULES, ...opts.rules },
      seats: [host, null, null, null],
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
    // Find open public lobby with free seats
    for (const room of this.rooms.values()) {
      if (room.isPublic && room.status === 'lobby') {
        const freeSeat = room.seats.findIndex((s, i) => !s && i < room.rules.maxPlayers);
        if (freeSeat >= 0) {
          const { token, snapshot } = this.joinRoom(room.code, player);
          return { code: room.code, token, snapshot };
        }
      }
    }

    // Otherwise create new public room
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
      // New joiner or no matching token
      token = makeToken();
      room.tokens[player.id] = token;

      const alreadySeatIndex = room.seats.findIndex((s) => s?.id === player.id);
      if (alreadySeatIndex >= 0) {
        room.seats[alreadySeatIndex] = player;
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
        if (dto.from !== undefined && dto.to !== undefined && room.status === 'lobby') {
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
        if (qIndex !== undefined && dto.seatIndex !== undefined && room.status === 'lobby') {
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
        if (dto.targetId) {
          this.removePlayer(room, dto.targetId);
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

    if (patch.rules) {
      room.rules = { ...room.rules, ...patch.rules };
    }
    if (patch.deckType) {
      room.deckType = patch.deckType;
    }
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

    // Filter seated players
    const seated = room.seats.filter((s): s is NetSeat => !!s);
    if (seated.length < 2) {
      // If only host, add a bot so game can start
      if (seated.length === 1) {
        const botId = `bot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const botName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
        const freeIndex = room.seats.findIndex((s, i) => !s && i < room.rules.maxPlayers);
        if (freeIndex >= 0) {
          room.seats[freeIndex] = {
            id: botId,
            name: botName,
            isBot: true,
            avatarPreset: Math.floor(Math.random() * 6),
          };
        }
      }
    }

    if (isValidTheme(bgTheme)) {
      room.bgTheme = bgTheme!;
    }

    const events = this.beginMatch(room);
    this.onBroadcastRoom?.(room.code, events);
    this.checkAndScheduleRoom(room);
  }

  beginMatch(room: RoomRecord): GameEvent[] {
    const prev = room.game;
    for (const p of prev?.players ?? []) {
      room.scores[p.id] = p.score;
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
        if (outPlayer && !room.queue.some((q) => q.id === outPlayer.id)) {
          room.queue.push(outPlayer);
        }
        const events = this.beginMatch(room);
        this.onBroadcastRoom?.(room.code, events);
        this.checkAndScheduleRoom(room);
        return { ok: true, events };
      }
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
    if (room.status === 'playing' && room.game) {
      // In-game: bot takeover instead of removing
      const gp = room.game.players.find((p) => p.id === playerId);
      if (gp) {
        gp.isBot = true;
        gp.connected = false;
      }
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

    if (room.status === 'playing' && room.game) {
      const gp = room.game.players.find((p) => p.id === playerId);
      if (gp) {
        gp.connected = false;
      }
    }
    // Không xóa người chơi trong lobby ngay lập tức trên socket drop.
    // sweepRooms sẽ kiểm tra và xóa nếu offline quá LOBBY_DISCONNECT_GRACE_MS.
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
        if (pres && !pres.online) {
          // Player is offline -> Bot takes over seat
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
      if (events.length && events[0].t !== 'reject') {
        room.game = state;
        room.updatedAt = now;
        this.onBroadcastRoom?.(room.code, events);
        this.checkAndScheduleRoom(room);
        return;
      }
    }
  }

  // ------------------------------------------------------------- Sweep & Clean

  private sweepRooms(): void {
    const now = Date.now();
    for (const [code, room] of this.rooms.entries()) {
      const humanCount = [...room.seats, ...room.queue].filter((p) => p && !p.isBot).length;
      const idleTime = now - room.updatedAt;

      // Disconnect timeout for human players in active match
      if (room.status === 'playing' && room.game) {
        const pMap = this.presence.get(code);
        for (const p of room.game.players) {
          if (!p.isBot) {
            const pres = pMap?.get(p.id);
            if (pres && !pres.online && now - pres.ts > NET.disconnectTimeoutMs) {
              p.isBot = true;
              p.connected = false;
              const seat = room.seats.find((s) => s?.id === p.id);
              if (seat) seat.isBot = true;
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
