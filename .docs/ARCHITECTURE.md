# Ú Nồ - System Architecture Documentation

This document describes the high-level architecture, module boundaries, data flows, and runtime models of the **Ú Nồ Card Game** monorepo.

---

## 1. High-Level Overview

The system is organized as a **pnpm monorepo** designed to operate simultaneously in two environments:
1. **Standard Modern Web Browser** (responsive desktop & mobile).
2. **Discord Voice Channel Activity** (embedded iframe inside Discord Desktop, Web, and Mobile clients).

```
                      +-----------------------------+
                      |   Discord / Web Browser     |
                      +--------------+--------------+
                                     |
                                     | HTTP / WebSocket
                                     v
                       +-------------+-------------+
                       |       Reverse Gateway     |  (Port 3000)
                       +------+---------------+----+
                              |               |
              Static & Pages  |               |  /socket.io & API
                              v               v
            +-----------------+---+       +---+------------------+
            |    Next.js Client   |       |    NestJS Backend    |
            |     (Port 3002)     |       |     (Port 3001)      |
            +----------+----------+       +-----------+----------+
                       |                              |
                       +--------------+---------------+
                                      |
                       +--------------v---------------+
                       |      @u-no/game-engine       |
                       |       @u-no/shared           |
                       +------------------------------+
```

---

## 2. Monorepo Modules & Responsibilities

| Package / App | Location | Technology | Purpose |
| :--- | :--- | :--- | :--- |
| **`@u-no/game-engine`** | `packages/game-engine` | Pure TypeScript (Node + Browser) | Deterministic Uno game logic, card generation, move validation, bot AI, rules (Classic & Flip). Zero DOM/network dependencies. |
| **`@u-no/shared`** | `packages/shared` | TypeScript | Shared data transfer objects, types, constants, and Socket.IO event contracts. |
| **`@u-no/server`** | `server` | NestJS 11, Socket.IO | Authoritative room management, matchmaking, presence tracking, bot reaction timing, and state broadcasting. |
| **`@u-no/client`** | `client` | Next.js 16, React Three Fiber, Three.js, Tailwind CSS, Zustand | WebGL 3D card table, 2D UI overlays, Web Audio API sound effects, and Discord Embedded SDK integration. |
| **`@u-no/gateway`** | `gateway` | Node.js HTTP Proxy | Unified entry point forwarding traffic between Next.js (client) and NestJS (backend) under a single origin. |

---

## 3. The Core Rules Engine (`@u-no/game-engine`)

The rules engine is designed as a **pure state reducer**:

$$\text{reduce}(\text{state}, \text{action}, \text{now}) \longrightarrow \{ \text{state}', \text{events} \}$$

### Key Design Principles:
1. **Deterministic PRNG**: Uses `mulberry32` with a numeric seed. Shuffling and dealing produce identical results given the same seed.
2. **Dual-Environment Execution**:
   - **Client-side (Solo Play)**: Runs in-browser for zero-latency play against bots without needing a backend server or network connection.
   - **Server-side (Online Multiplayer)**: The NestJS server executes the engine authoritatively.
3. **Event Generation**: Every state change emits a sequence of granular `GameEvent` objects (e.g., `deal`, `play`, `draw`, `turn`, `flip`, `skip`, `reverse`, `swap`). The client animation system uses these events to reconstruct continuous visual choreography.

---

## 4. Realtime Networking & State Synchronization

Online multiplayer uses **Socket.IO** with bidirectional event streaming.

```
Client                                                  Server
  |                                                       |
  |--- CLIENT_JOIN_ROOM / CLIENT_CREATE_ROOM (Ack) ------>|
  |<-- Snapshot: { room, game, hand } --------------------|
  |                                                       |
  |--- CLIENT_ACTION { type: 'PLAY', cardId: 'c12' } ---->|
  |    (Optional Optimistic Prediction on Client)         | (Validates under Room Lock)
  |                                                       | (Executes reduce())
  |<-- SERVER_ROOM_UPDATE { room, game, events } ---------| (Broadcast to room)
  |<-- SERVER_HAND_UPDATE [Card, Card, ...] -------------->| (Private to player)
  |                                                       |
  |--- CLIENT_PING { t: timestamp } --------------------->|
  |<-- SERVER_PONG { t, serverTime } ---------------------| (Clock Offset Sync)
```

### Information Hiding & Security
- **Opponent Hands & Draw Pile**: Opponents' cards are serialized with `hidden: true`, masking their color and value.
- **Private Hand Updates**: Only the player receives their unmasked cards through `SERVER_HAND_UPDATE`.
- **Authoritative Validation**: All actions (card eligibility, challenge outcomes, rush calls) are validated on the server. Illegal actions emit a `reject` event.

---

## 5. Client 3D Scene & Animation Pipeline

The 3D game table is rendered using **React Three Fiber (Three.js)**.

```
GameState Update
       │
       ▼
Timeline & Frame Queue (`client/src/state/timeline.ts`)
       │ Split engine steps into choreographic frames
       │ Calculate duration & audio delays
       ▼
Cards Orchestrator (`client/src/three/Cards.tsx`)
       │ Calculate fan layouts (`layout.ts`)
       │ Manage card ordering & accordion spacing
       ▼
Stage Animation Manager (`client/src/three/stage.ts`)
       │ Interpolates 3D transforms (position, rotation, scale)
       │ Smooth flights, parabolic arcs, shake animations
       ▼
Rendered 3D Meshes (`client/src/three/CardMesh.tsx`)
```

- **Photo Atlas Textures**: Cards use atlas sprite textures with UV mapping, avoiding costly runtime canvas redraws.
- **Dynamic Fan Layout**: Supports variable hand sizes with automatic fan width scaling, z-index elevation, and color-grouping accordions when hand size $> 10$ cards.
- **Optimistic Play**: Immediate visual feedback for plays with automatic rollback if the server rejects.

---

## 6. Deployment Topology

In production, all services can be run through `docker-compose.yml`:
- `uno-gateway`: Listens on port `3000` (the public entry point).
- `uno-client`: Next.js standalone server on internal port `3002`.
- `uno-server`: NestJS Socket.IO server on internal port `3001`.
- `cloudflared` (optional): Tunnel container exposing `uno-gateway` to a secure HTTPS domain for Discord Activities.
