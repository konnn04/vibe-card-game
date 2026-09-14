import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import {
  SOCKET_EVENTS,
  CHAT,
  type ActionOpDto,
  type AvatarOpDto,
  type ChatDto,
  type CreateRoomDto,
  type JoinRoomDto,
  type LeaveOpDto,
  type QuickMatchDto,
  type ReconnectDto,
  type RulesOpDto,
  type SeatOpDto,
  type ServerChatDto,
  type StartOpDto,
} from '@u-no/shared';
import { handOf, publicView, type GameEvent } from '@u-no/game-engine';
import { RoomsService } from './rooms.service';
import { AvatarsService } from './avatars.service';

interface SocketMeta {
  code?: string;
  playerId?: string;
}

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class RoomsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RoomsGateway.name);

  @WebSocketServer()
  server: Server;

  // socketId -> metadata
  private socketMeta = new Map<string, SocketMeta>();
  // playerId -> Set of socketIds
  private playerSockets = new Map<string, Set<string>>();

  constructor(
    private readonly roomsService: RoomsService,
    private readonly avatarsService: AvatarsService,
  ) {}

  afterInit() {
    this.roomsService.onBroadcastRoom = (code, events) => this.broadcastRoom(code, events);
    this.roomsService.onBroadcastPresence = (code) => this.broadcastPresence(code);
    this.roomsService.onBroadcastAvatars = (code) => this.broadcastAvatars(code);
    this.logger.log('RoomsGateway initialized');
  }

  handleConnection(client: Socket) {
    this.socketMeta.set(client.id, {});
  }

  handleDisconnect(client: Socket) {
    const meta = this.socketMeta.get(client.id);
    if (meta?.code && meta?.playerId) {
      const sockets = this.playerSockets.get(meta.playerId);
      sockets?.delete(client.id);
      if (!sockets || sockets.size === 0) {
        this.playerSockets.delete(meta.playerId);
        this.roomsService.handleDisconnect(meta.code, meta.playerId);
      }
    }
    this.socketMeta.delete(client.id);
  }

  private registerClient(client: Socket, code: string, playerId: string) {
    const upperCode = code.toUpperCase();
    this.socketMeta.set(client.id, { code: upperCode, playerId });
    client.join(upperCode);

    if (!this.playerSockets.has(playerId)) {
      this.playerSockets.set(playerId, new Set());
    }
    this.playerSockets.get(playerId)!.add(client.id);
  }

  // ------------------------------------------------------------- Broadcasts

  broadcastRoom(code: string, events: GameEvent[] = []) {
    const upperCode = code.toUpperCase();
    const room = this.roomsService.getRoom(upperCode);
    if (!room) return;

    const publicRoom = this.roomsService.getPublicRoom(room);
    const game = room.game ? publicView(room.game) : null;

    this.server.to(upperCode).emit(SOCKET_EVENTS.SERVER_ROOM_UPDATE, {
      room: publicRoom,
      game,
      events,
      updatedAt: Date.now(),
    });

    // Send private hand to each human player
    if (room.game) {
      const humans = room.seats.filter((s) => s && !s.isBot);
      for (const h of humans) {
        if (!h) continue;
        const sockets = this.playerSockets.get(h.id);
        if (sockets) {
          const cards = handOf(room.game, h.id);
          for (const sid of sockets) {
            this.server.to(sid).emit(SOCKET_EVENTS.SERVER_HAND_UPDATE, cards);
          }
        }
      }
    }
  }

  broadcastPresence(code: string) {
    const upperCode = code.toUpperCase();
    this.server.to(upperCode).emit(
      SOCKET_EVENTS.SERVER_PRESENCE_UPDATE,
      this.roomsService.getPresenceMap(upperCode),
    );
  }

  broadcastAvatars(code: string) {
    const upperCode = code.toUpperCase();
    this.server.to(upperCode).emit(
      SOCKET_EVENTS.SERVER_AVATARS_UPDATE,
      this.avatarsService.getAvatars(upperCode),
    );
  }

  // ------------------------------------------------------------- Listeners

  @SubscribeMessage(SOCKET_EVENTS.CLIENT_CREATE_ROOM)
  handleCreateRoom(@ConnectedSocket() client: Socket, @MessageBody() dto: CreateRoomDto) {
    try {
      const { code, token, room } = this.roomsService.createRoom(dto.player, dto);
      this.registerClient(client, code, dto.player.id);
      this.broadcastRoom(code);
      this.broadcastPresence(code);
      this.broadcastAvatars(code);
      return { ok: true, code, token, room: this.roomsService.getPublicRoom(room) };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }

  @SubscribeMessage(SOCKET_EVENTS.CLIENT_QUICK_MATCH)
  handleQuickMatch(@ConnectedSocket() client: Socket, @MessageBody() dto: QuickMatchDto) {
    try {
      const { code, token, snapshot } = this.roomsService.quickMatch(dto.player, dto.bgTheme);
      this.registerClient(client, code, dto.player.id);
      this.broadcastRoom(code);
      this.broadcastPresence(code);
      this.broadcastAvatars(code);
      return { ok: true, code, token, snapshot };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }

  @SubscribeMessage(SOCKET_EVENTS.CLIENT_JOIN_ROOM)
  handleJoinRoom(@ConnectedSocket() client: Socket, @MessageBody() dto: JoinRoomDto) {
    try {
      const { token, snapshot } = this.roomsService.joinRoom(dto.code, dto.player, dto.token);
      this.registerClient(client, dto.code, dto.player.id);
      this.broadcastRoom(dto.code);
      this.broadcastPresence(dto.code);
      this.broadcastAvatars(dto.code);
      return { ok: true, token, snapshot };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }

  @SubscribeMessage(SOCKET_EVENTS.CLIENT_RECONNECT)
  handleReconnect(@ConnectedSocket() client: Socket, @MessageBody() dto: ReconnectDto) {
    try {
      const snapshot = this.roomsService.reconnect(dto.code, dto.playerId, dto.token);
      this.registerClient(client, dto.code, dto.playerId);
      this.broadcastRoom(dto.code);
      this.broadcastPresence(dto.code);
      this.broadcastAvatars(dto.code);
      return { ok: true, snapshot };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }

  @SubscribeMessage(SOCKET_EVENTS.CLIENT_SEATS)
  handleSeats(@ConnectedSocket() client: Socket, @MessageBody() dto: SeatOpDto) {
    try {
      this.roomsService.seatOp(dto.code, dto.playerId, dto.token, dto);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }

  @SubscribeMessage(SOCKET_EVENTS.CLIENT_RULES)
  handleRules(@ConnectedSocket() client: Socket, @MessageBody() dto: RulesOpDto) {
    try {
      this.roomsService.rulesOp(dto.code, dto.playerId, dto.token, dto.patch);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }

  @SubscribeMessage(SOCKET_EVENTS.CLIENT_START)
  handleStart(@ConnectedSocket() client: Socket, @MessageBody() dto: StartOpDto) {
    try {
      this.roomsService.startOp(dto.code, dto.playerId, dto.token, dto.bgTheme);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }

  @SubscribeMessage(SOCKET_EVENTS.CLIENT_ACTION)
  handleAction(@ConnectedSocket() client: Socket, @MessageBody() dto: ActionOpDto) {
    try {
      const res = this.roomsService.actionOp(dto.code, dto.playerId, dto.token, dto.action);
      return res;
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }

  @SubscribeMessage(SOCKET_EVENTS.CLIENT_AVATAR)
  handleAvatar(@ConnectedSocket() client: Socket, @MessageBody() dto: AvatarOpDto) {
    try {
      const room = this.roomsService.getRoom(dto.code);
      if (!room || !this.roomsService.verifyToken(room, dto.playerId, dto.token)) {
        throw new Error('unauthorized');
      }
      this.avatarsService.setAvatar(dto.code, dto.playerId, dto.image);
      this.broadcastAvatars(dto.code);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }

  @SubscribeMessage(SOCKET_EVENTS.CLIENT_LEAVE)
  handleLeave(@ConnectedSocket() client: Socket, @MessageBody() dto: LeaveOpDto) {
    try {
      this.roomsService.leaveRoom(dto.code, dto.playerId, dto.token);
      client.leave(dto.code.toUpperCase());
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }

  @SubscribeMessage(SOCKET_EVENTS.CLIENT_TRANSFER_HOST)
  handleTransferHost(
    @ConnectedSocket() _client: Socket,
    @MessageBody() dto: { code: string; playerId: string; token: string; targetPlayerId: string },
  ) {
    try {
      this.roomsService.transferHost(dto.code, dto.playerId, dto.token, dto.targetPlayerId);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }

  @SubscribeMessage(SOCKET_EVENTS.CLIENT_CHAT)
  handleChat(
    @ConnectedSocket() _client: Socket,
    @MessageBody() dto: ChatDto,
  ) {
    try {
      const room = this.roomsService.getRoom(dto.code);
      if (!room || !this.roomsService.verifyToken(room, dto.playerId, dto.token)) {
        throw new Error('unauthorized');
      }
      const rawMsg = (dto.message || '').trim();
      if (!rawMsg) return { ok: true };
      const message = rawMsg.slice(0, CHAT.maxLength);
      const sender = room.seats.find((s) => s?.id === dto.playerId) || room.queue.find((s) => s?.id === dto.playerId);
      const senderName = sender?.name || dto.senderName || 'Player';
      const chatPayload: ServerChatDto = {
        playerId: dto.playerId,
        senderId: dto.playerId,
        senderName,
        message,
        timestamp: Date.now(),
      };
      this.server.to(dto.code.toUpperCase()).emit(SOCKET_EVENTS.SERVER_CHAT, chatPayload);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }

  @SubscribeMessage(SOCKET_EVENTS.CLIENT_PING)
  handlePing(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { code: string; playerId: string; ping?: number; t?: number },
  ) {
    if (body.code && body.playerId) {
      this.roomsService.updatePresence(body.code, body.playerId, true, body.ping ?? null);
      this.broadcastPresence(body.code);
    }
    client.emit(SOCKET_EVENTS.SERVER_PONG, { t: body.t, serverTime: Date.now() });
  }
}
