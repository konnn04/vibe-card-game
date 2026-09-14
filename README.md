# Ú Nồ Card Game 🎴

> **A modern, full-stack 3D multiplayer card party game** playable both as a **standalone web application** and directly inside **Discord Voice Channels as a Discord Activity** — from a single unified codebase.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16_App_Router-black.svg)](https://nextjs.org/)
[![NestJS](https://img.shields.io/badge/NestJS-11.x-red.svg)](https://nestjs.com/)
[![React Three Fiber](https://img.shields.io/badge/R3F-Three.js-white.svg)](https://docs.pmnd.rs/react-three-fiber)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.x-black.svg)](https://socket.io/)
[![pnpm](https://img.shields.io/badge/pnpm-workspace-orange.svg)](https://pnpm.io/)

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [Monorepo Structure](#-monorepo-structure)
- [Architecture & Tech Stack](#-architecture--tech-stack)
- [Quick Start](#-quick-start)
- [Available Scripts](#-available-scripts)
- [Environment Configuration](#-environment-configuration)
- [Two Ways to Play](#-two-ways-to-play)
- [Docker Deployment](#-docker-deployment)
- [Documentation](#-documentation)
- [Author & License](#-author--license)

---

## 🌟 Overview

**Ú Nồ** is an interactive 3D adaptation of the beloved card game. It features both the **Classic Deck** and the double-sided **Flip Deck**, playable with up to 4 players (with spectator queueing) or offline against intelligent bots.

The project is structured as a **clean monorepo** utilizing `pnpm workspaces`:
- **Client**: Next.js 16 with React Three Fiber (Three.js) delivering a smooth 60fps 3D card table.
- **Server**: NestJS 11 with Socket.IO for low-latency authoritative room management and state broadcasting.
- **Engine**: A pure TypeScript deterministic game engine with zero external dependencies that runs identically on both server and client.
- **Gateway**: A lightweight unified reverse proxy routing client assets and WebSocket traffic under a single origin.

---

## 🎮 Key Features

- **3D Card Table**: Interactive 3D scene built with Three.js / React Three Fiber, featuring dynamic card fanning, accordion spacing for large hands, card flip animations, and table themes (*Café, Meadow, Forest, Park*).
- **Classic & Flip Decks**:
  - **Classic**: Traditional 108 cards (+2, Skip, Reverse, Wild, Wild +4).
  - **Flip**: Double-sided cards featuring **Light** and **Dark** sides with severe action cards (+5, Skip All, Wild Draw Color).
- **Customizable House Rules**: 7-0 hand swapping/rotating, stacking penalties (+2/+4/+5), jump-in plays out of turn, draw-until-playable, and Ú Nồ rush calls.
- **Dual Play Modes**:
  - **Online Multiplayer**: Realtime rooms with invite links, matchmaking, spectators, and reconnection recovery.
  - **Solo vs Bots**: Zero-latency offline game running directly in the browser tab with no server required.
- **Discord Activity Native**: Instant voice-channel party play using the Discord Embedded App SDK, with auto-matching channel rooms and OAuth2 avatar/profile sync.
- **Sound & Music**: Spatial Web Audio API sound effects and ambient music that dynamically muffles and gains reverb when flipping to the Dark side.
- **Multi-language**: Built-in support for Vietnamese (`vi`) and English (`en`).

---

## 📁 Monorepo Structure

```
uno-discord-activity-mix/
├── client/                     # Next.js 16 Web Client & 3D Interface
│   ├── app/                    # Next.js App Router (pages & API routes)
│   ├── src/
│   │   ├── three/              # Three.js 3D scene, Card meshes, layout maths, stage tweening
│   │   ├── state/              # Zustand stores (match, room, net, settings) & timeline queue
│   │   ├── ui/                 # 2D HUD, lobby, modales, avatars, settings
│   │   └── lib/                # Web Audio, themes, Discord SDK helpers
│   └── public/                 # Card atlases, textures, SFX, and music
│
├── server/                     # NestJS 11 Realtime Backend
│   └── src/
│       ├── rooms/              # Room lifecycle, matchmaking, presence, gateway
│       └── app.module.ts       # Main NestJS module
│
├── gateway/                    # Node.js HTTP & WebSocket Reverse Proxy
│   └── index.mjs               # Routes traffic between client (3002) and server (3001)
│
├── packages/
│   ├── game-engine/            # Pure deterministic Uno game logic (reduce, rules, bots)
│   └── shared/                 # Shared types, DTOs, and Socket.IO event constants
│
├── scripts/                    # Automation (version syncing, asset manifests)
├── .docs/                      # Detailed system & integration documentation
└── docker-compose.yml          # Containerized deployment
```

---

## 🛠 Architecture & Tech Stack

```
                     ┌─────────────────────────────┐
                     │    Browser / Discord Client │
                     └──────────────┬──────────────┘
                                    │ (Single Origin HTTP / WS)
                                    ▼
                     ┌─────────────────────────────┐
                     │    Gateway (Port 3000)      │
                     └──────┬───────────────┬──────┘
             Static Assets  │               │ /socket.io & API
                            ▼               ▼
           ┌───────────────────────┐ ┌───────────────────────┐
           │ Next.js Client (3002) │ │  NestJS Backend (3001)│
           └───────────┬───────────┘ └───────────┬───────────┘
                       │                         │
                       └────────────┬────────────┘
                                    │
                                    ▼
                       ┌─────────────────────────┐
                       │    @u-no/game-engine    │
                       │      @u-no/shared       │
                       └─────────────────────────┘
```

- **Frontend**: Next.js 16, React 19, `@react-three/fiber`, `@react-three/drei`, Three.js, Tailwind CSS, Zustand, Lucide icons.
- **Backend**: NestJS 11, `@nestjs/websockets`, Socket.IO, TypeScript.
- **Shared Engine**: Pure functional state reducer `reduce(state, action, now) => { state, events }`.
- **Packaging & Monorepo**: `pnpm` workspaces with cross-package hot reloading.

---

## 🚀 Quick Start

### Prerequisites
- **Node.js**: `v20.9+`
- **pnpm**: `v10+` or `v12+`

### 1. Clone & Install
```bash
git clone https://github.com/konnn04/uno-discord-activity-mix.git
cd uno-discord-activity-mix
pnpm install
```

### 2. Environment Setup
Copy the template configuration:
```bash
cp .env.example .env
```
*(For local standalone play, default `.env` values work out of the box).*

### 3. Start Development Servers
```bash
# Starts client, server, and gateway concurrently
pnpm dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📜 Available Scripts

Run from the root directory:

| Script | Command | Description |
| :--- | :--- | :--- |
| `pnpm dev` | Full Dev Stack | Runs Server, Client, and Gateway concurrently with live reload. |
| `pnpm dev:client` | Client Only | Runs the Next.js frontend dev server. |
| `pnpm dev:server` | Server Only | Runs the NestJS backend dev server. |
| `pnpm dev:gateway`| Gateway Only | Runs the reverse proxy gateway. |
| `pnpm build` | Production Build | Builds `@u-no/game-engine`, `@u-no/shared`, server, and client. |
| `pnpm typecheck` | Type Checking | Executes `tsc --noEmit` across all workspace packages. |
| `pnpm lint` | Code Linting | Runs ESLint across all packages and services. |
| `pnpm sync:version`| Sync Version | Synchronizes Git SHA, commit count, and version metadata across packages. |

---

## ⚙️ Environment Configuration

| Variable | Description | Default |
| :--- | :--- | :--- |
| `PORT` | Public port exposed by Gateway | `3000` |
| `SERVER_PORT` | Port for the NestJS backend | `3001` |
| `CLIENT_PORT` | Port for the Next.js frontend | `3002` |
| `INTERNAL_SERVER_URL`| Internal URL gateway proxies backend to | `http://localhost:3001` |
| `APP_URL` / `NEXT_PUBLIC_SITE_URL` | Public origin URL for invites & Discord | `http://localhost:3000` |
| `NEXT_PUBLIC_DISCORD_CLIENT_ID` | Discord Application Client ID | (Optional for web) |
| `DISCORD_CLIENT_SECRET` | Discord Application Client Secret | (Optional for web) |

---

## 🌐 Two Ways to Play

| Capability | Standard Web App | Discord Voice Activity |
| :--- | :--- | :--- |
| **Launch Method** | Direct URL or invite link | Activity shelf inside Discord Voice Channel |
| **Room Discovery**| Share 6-character room codes or `?room=CODE` links | Automatically creates/joins room matching `instance_id` |
| **User Identity** | Local name and custom/preset avatar | Discord Username and Avatar via OAuth2 token exchange |
| **Networking** | Socket.IO via Gateway reverse proxy | Same (works securely within Discord iframe sandbox) |

---

## 🐳 Docker Deployment

The project includes a production-ready `docker-compose.yml`:

```bash
docker compose up -d --build
```

This starts:
1. `uno-gateway` on port `3000`.
2. `uno-server` on internal port `3001`.
3. `uno-client` on internal port `3002`.

For Discord Activities, point your domain (e.g. via Cloudflare Tunnel or reverse proxy) to port `3000` over HTTPS.

---

## 📚 Documentation

For in-depth technical guides, explore the [`.docs/`](./.docs/) directory:
- [`.docs/ARCHITECTURE.md`](./.docs/ARCHITECTURE.md) — Detailed architecture, data flow, and networking protocol.
- [`.docs/DISCORD_ACTIVITY.md`](./.docs/DISCORD_ACTIVITY.md) — Complete guide to registering and deploying on Discord.
- [`.docs/GAME_ENGINE.md`](./.docs/GAME_ENGINE.md) — Card deck breakdowns, game mechanics, and action specifications.

---

## 👤 Author & Acknowledgments

Developed with ❤️ by **Thanh Trieu Nguyen (Konnn04)**.
- **GitHub**: [@konnn04](https://github.com/konnn04)
- **Email**: [trieukon1011@gmail.com](mailto:trieukon1011@gmail.com)

Distributed under the **MIT License**.
