export const SOCKET_EVENTS = {
  // Client -> Server
  CLIENT_CREATE_ROOM: 'room:create',
  CLIENT_QUICK_MATCH: 'room:quickMatch',
  CLIENT_JOIN_ROOM: 'room:join',
  CLIENT_RECONNECT: 'room:reconnect',
  CLIENT_SEATS: 'room:seats',
  CLIENT_RULES: 'room:rules',
  CLIENT_START: 'room:start',
  CLIENT_ACTION: 'room:action',
  CLIENT_AVATAR: 'room:avatar',
  CLIENT_LEAVE: 'room:leave',
  CLIENT_TRANSFER_HOST: 'room:transferHost',
  CLIENT_PING: 'room:ping',
  CLIENT_CHAT: 'room:chat',

  // Server -> Client
  SERVER_ROOM_UPDATE: 'room:update',
  SERVER_HAND_UPDATE: 'game:hand',
  SERVER_PRESENCE_UPDATE: 'room:presence',
  SERVER_AVATARS_UPDATE: 'room:avatars',
  SERVER_RESYNC: 'room:resync',
  SERVER_PONG: 'room:pong',
  SERVER_CHAT: 'room:chat',
  SERVER_ERROR: 'room:error',
} as const;

export type SocketEventName = typeof SOCKET_EVENTS[keyof typeof SOCKET_EVENTS];
