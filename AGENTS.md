<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AI Agent Developer Guide - Ú Nồ Monorepo

Welcome! This document provides essential architectural context, invariants, coding rules, and workflows for any AI coding assistant or human engineer working on the **Ú Nồ Card Game** codebase.

---

## 1. Project Organization & Workspace Architecture

This codebase is a **pnpm monorepo** containing frontend, backend, gateway, and shared libraries:

```
├── packages/
│   ├── game-engine/     # Pure TypeScript game rules engine (dependency-free)
│   └── shared/          # Shared DTOs, TypeScript interfaces, Socket.IO event names
├── client/              # Next.js 16 + React Three Fiber frontend
├── server/              # NestJS 11 + Socket.IO realtime server
├── gateway/             # Node.js reverse proxy on port 3000 (routes client & server)
├── scripts/             # Version synchronizers and build helpers
└── .docs/               # Technical architecture & integration documentation
```

### Dependency Rules:
- **`packages/game-engine` MUST NEVER import from `client/`, `server/`, or `gateway/`**. It has ZERO external dependencies and must remain 100% pure TypeScript.
- **`packages/shared`** is shared across `client`, `server`, and `gateway`.
- **`client`** and **`server`** consume `@u-no/game-engine` and `@u-no/shared` as workspace dependencies (`workspace:*`).

---

## 2. Core Architectural Invariants

### 1. The Rules Engine is a Pure State Reducer
- Located in `packages/game-engine/src/engine.ts`.
- Core signature: `reduce(state: GameState, action: Action, now: number): EngineResult`.
- It is completely deterministic and uses a seeded PRNG (`mulberry32`).
- **Never** add network calls, database queries, timers, or DOM APIs inside `packages/game-engine`.
- Both **server** (for online rooms) and **client** (for solo games against bots) execute the identical engine reducer.

### 2. Information Security (Anti-Cheat)
- Server-side state broadcasting masks opponents' hands (`hidden: true`) and masks the draw pile.
- The player's unmasked hand is sent exclusively over a private channel (`SERVER_HAND_UPDATE`).
- For the **Flip deck**, only the active side is masked. The opposite side is considered public knowledge on a physical table and remains visible to opponents.

### 3. Client Timeline & Animation Pacing
- The client does not immediately snap to engine state.
- In `client/src/state/timeline.ts` and `client/src/state/match.ts`, engine events are converted into choreographed frames.
- **The animation drives the turn clock**:
  - `start`: Animation of incoming penalties/skips playing -> clock paused, input locked.
  - `action`: Player's actual turn -> clock ticking, input active.
  - `end`: Outgoing card flight animation -> clock paused, input locked.

### 4. 3D Card Scene & Stage Invariants
- Managed in `client/src/three/stage.ts`, `Cards.tsx`, and `layout.ts`.
- Every card mesh is registered in the stage coordinator with an ID (`c0`, `c1`, ...).
- Card transforms (position, rotation, scale) are interpolated smoothly via `tick()`.
- Layouts are computed with `fanTransform` in `layout.ts`, with accordion scaling for hand sizes $> 10$ cards.
- **Ván mới (rematch / NEXT_ROUND)**:
  - Card IDs are regenerated deterministically from `c0`.
  - The stage must be reset using `resetForNewRound(DECK_POS)` and `knownCardsByPlayer.current.clear()`.
  - Never allow stale target coordinates or lingering `armed`/`delay` flags to prevent cards from animating into player hands.

---

## 3. Common Commands

All commands should be executed from the **monorepo root**:

```bash
# Start all services (Client, Server, Gateway) concurrently
pnpm dev

# Start individual services
pnpm dev:client
pnpm dev:server
pnpm dev:gateway

# Build all packages and services
pnpm build

# Typecheck across all workspace packages
pnpm typecheck

# Lint across all workspace packages
pnpm lint

# Sync version stamps from Git
pnpm sync:version
```

---

## 4. Coding Conventions & Best Practices

1. **TypeScript Strictness**:
   - Do not use `any` unless absolutely necessary for low-level library wrappers.
   - Always declare interfaces and types in `packages/shared` if they cross the network boundary.
2. **State Management**:
   - Client stores are implemented with **Zustand** in `client/src/state/`.
   - Keep stores decoupled: `useMatch` (game state), `useRoom` (room metadata/seats), `useNetworkStore` (connection status).
3. **Styling**:
   - Vanilla CSS and Tailwind CSS classes in `client/`.
   - Maintain rich, glassmorphic dark-mode aesthetics with vibrant game accents.
4. **Preserve Comments**:
   - Maintain existing docstrings and architectural explanations in the source code.
