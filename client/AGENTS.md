<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Client Guidelines (Next.js 16 + React Three Fiber)

- **Root Guide**: See [AGENTS.md](../AGENTS.md) and [.docs/ARCHITECTURE.md](../.docs/ARCHITECTURE.md) for monorepo-wide architecture and guidelines.
- **3D Scene**: Located in `src/three/`. Uses React Three Fiber and Three.js.
  - Card movement is managed by the stage coordinator in `src/three/stage.ts`.
  - Layout calculations (fan curves, tilt, spacing) are in `src/three/layout.ts`.
  - Texture mapping is done via photo atlases in `src/three/photoAtlas.ts`.
- **State**: Zustand stores in `src/state/` (`useMatch`, `useRoom`, `useNetworkStore`, `useSettings`).
- **Realtime**: Connects to the NestJS backend via Socket.IO through the reverse gateway on port 3000.
