# Ú Nồ Card Game

> This game was created by me and AI; it is not intended for reference purposes.

A 3D card party game for the browser and for Discord Activities. Play the
classic deck or the double-sided **Flip** deck, against bots or with up to four
people in a shared room.

Built with Next.js 16 (App Router), React Three Fiber, and Firebase Realtime
Database. The rules live in a dependency-free TypeScript package so the same
engine runs on the server and in the browser.

---

## Table of contents

- [Quick start](#quick-start)
- [Scripts](#scripts)
- [Configuration](#configuration)
- [Project layout](#project-layout)
- [How it works](#how-it-works)
- [Themes](#themes)
- [Replacing sound and music](#replacing-sound-and-music)
- [Testing](#testing)
- [Continuous integration](#continuous-integration)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)

---

## Quick start

**Requirements:** Node.js 20.9+ and pnpm 12.

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

The game is fully playable offline against bots with no configuration at all —
the rules engine runs inside the tab. Firebase is only needed for online rooms;
see [Configuration](#configuration).

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Development server with hot reload |
| `pnpm build` | Production build |
| `pnpm start` | Serve a production build |
| `pnpm typecheck` | `tsc --noEmit` across app, engine and scripts |
| `pnpm lint` | ESLint over `src`, `app` and `packages` |
| `pnpm lint:fix` | Same, with autofix |
| `pnpm test` | Playwright end-to-end tests (builds and serves automatically) |
| `pnpm test:ui` | Playwright in interactive UI mode |
| `pnpm verify` | `typecheck` + `lint` + `build` — run this before pushing |
| `pnpm sfx` | Rescan `public/sfx/` and regenerate its manifest and docs |
| `pnpm music` | Rescan `public/music-theme/`, rename files safely, regenerate manifest and docs |
| `pnpm stamp` | Regenerate the build version stamp from git |

`sfx`, `music` and `stamp` also run automatically via `predev` / `prebuild`, so
you rarely need to call them by hand.

### Version stamping

Every commit is a distinguishable version without anyone editing a number by
hand. `scripts/gen-version.mjs` writes `src/generated/version.ts` at build time:
`major.minor` come from `package.json`, the patch is the commit count, and the
short SHA is appended — `v0.1.248+9f2c1ab`, plus `.dirty` when the tree has
uncommitted changes. It is shown in the Settings panel, so a bug report only
needs that one line.

The commit count is used rather than a git hook that bumps a number: a hook only
runs on machines that installed it, so the moment someone forgets, numbers
diverge between laptops and CI. Counting commits gives everyone the same answer
for the same commit. The generated file is gitignored — it changes every commit
and would conflict on every merge.

## Configuration

Copy `.env.example` to `.env` if present, or create `.env` with:

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_FIREBASE_DATABASE_URL` | for online play | Realtime Database URL the browser subscribes to |
| `FIREBASE_DATABASE_URL` | for online play | Same URL for the server; falls back to the public one |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | for online play | Service account as raw JSON, base64, **or** a path to a key file |
| `NEXT_PUBLIC_FIREBASE_API_KEY`, `..._PROJECT_ID` | optional | Used to detect whether a browser Firebase client can be created |

Without these the app still runs: online buttons fall back to snapshot polling,
and solo-versus-bots is unaffected.

> `FIREBASE_SERVICE_ACCOUNT_KEY` accepts a filesystem path, which the bundler
> cannot trace at build time. That call is explicitly opted out of tracing — see
> the comment in `src/server/firebaseAdmin.ts` for why leaving it in drags the
> whole `public/` folder (~86 MB of audio and card art) into the server bundle.

## Project layout

```
app/                 Next.js routes — the game page, the room API, /legal/*
packages/
  game-engine/       Pure TypeScript rules. No DOM, no network, deterministic.
src/
  config.ts          Tunable numbers: bot think time, poll rates, toast/celebration ms
  state/             Zustand stores, the animation queue, networking, clocks
  three/             React Three Fiber scene, card meshes, layout maths
  ui/                HUD, lobby, menus, settings, tutorial
  lib/               Audio, settings, themes, i18n helpers
public/
  card-texture/      Card art atlases (.jpg) plus their sprite maps (.json)
  sfx/               Optional sound replacements — see the README in there
  music-theme/       Background music — see the README in there
scripts/             Build-time asset scanners
tests/               Playwright end-to-end specs
```

## How it works

### The rules are a pure function

`packages/game-engine` exposes `reduce(state, action, now) -> { state, events }`.
It has no imports outside itself, uses a seeded PRNG, and never touches the DOM
or the network. That is what lets the server be authoritative for online rooms
while the same code runs locally for bot games — and it makes the rules testable
by simulating thousands of games in a plain Node script.

### Animations drive the clock, not the other way round

The engine resolves a whole move instantly, but the player must see it happen in
order. So the client never renders engine state directly. Each engine step is
pushed onto a queue, and `src/state/match.ts` commits one step at a time,
waiting for its animation to finish before committing the next:

```
Create event → build animation → animation completes → commit state → next phase
```

Every turn is therefore split into three phases, and the clock only runs during
the middle one:

| Phase | What happens | Clock | Input |
| --- | --- | --- | --- |
| `start` | Effects landing on you: skip icon, penalty draws, a table flip | paused | locked |
| `action` | Your actual turn | running | free |
| `end` | The consequence of the card you just played | paused | locked |

Animation lengths live in one place (`src/state/timeline.ts`) and are imported
by the code that creates the tweens, so the pacing budget and the real animation
cannot drift apart.

### Anti-cheat

Opponents' hands and the draw pile are masked server-side before broadcast; your
own cards arrive on a private channel. The one deliberate exception is the Flip
deck, where a card's reverse face is public information in the real game — so
the top of the draw pile reveals **only** its non-active face, never the side
that is about to be played.

## Themes

One theme drives both the menu backdrop and the 3D table, so they can never
disagree: `src/lib/themes.ts` holds four of them (`cafe` — the default —
`meadow`, `forest`, `park`), each declaring a menu palette and a table palette.
The backdrops are pure CSS (`src/ui/Backdrop.tsx`): the menu deliberately never
creates a WebGL context, so its background is not allowed to need one either.

Adding a theme is one entry in that array plus one scene component and four
label strings — nothing else needs to know the list.

In an online room the theme is **the host's**. It is frozen into the room record
when the host presses start (not when they change the setting, which they may do
several times in the lobby), so everyone — including someone who joins mid-match
— sees the same table.

## Replacing sound and music

Both are drop-in. Put a file in the folder, run the matching script (or just
build), and it is picked up:

- **Sound effects** — `public/sfx/README.md` lists every sound name, what it is
  used for, and which file currently overrides it. Anything you do not provide
  is synthesised with WebAudio, so the game is never silent.
- **Music** — `public/music-theme/README.md`. Files are renamed to safe ASCII
  slugs automatically (original names are kept as display titles in the
  manifest), because characters like `｜ ’ é` break differently at each layer of
  URL encoding.

On the Flip deck's dark side the music is filtered and drenched in reverb, using
only native WebAudio nodes — no extra dependency.

## Testing

```bash
pnpm test                      # all projects
pnpm test --project=chromium   # one browser
pnpm test:ui                   # interactive
```

Playwright builds the app and serves it on port **3100** automatically, so the
suite never collides with a `pnpm dev` you have open on 3000. Override with
`PORT` or `BASE_URL`.

The rules engine is also exercised by writing short simulation scripts that
bundle `packages/game-engine` with esbuild and play thousands of bot games,
asserting invariants (nobody ends with zero points, the Ú Nồ window always
points at a player actually holding one card, no round deadlocks). These are
written per investigation rather than committed as a suite.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request:

1. **verify** — `typecheck`, `lint`, `build`. The build also regenerates the
   audio and music manifests, so this catches breakage in those scripts too.
2. **e2e** — Playwright on Chromium, gated behind `verify`. The HTML report is
   uploaded as an artifact on both success and failure.

Concurrent runs on the same ref are cancelled, so pushing several commits in a
row only keeps the newest run.

## Deployment

Any Node host that runs `next build` / `next start` works, as does Vercel.

For a **Discord Activity**, serve the app over HTTPS and point the Activity URL
mapping at it. In the Developer Portal you only need the URL mapping — leave
**Interactions Endpoint URL** and **Linked Roles Verification URL** blank (they
are for HTTP slash commands and OAuth linked roles, neither of which this app
uses; a wrong interactions URL will actually fail Discord's signed-PING check).
**Terms of Service** and **Privacy Policy** are optional until you submit for
verification, and are served at `/legal/terms` and `/legal/privacy`.

The app reads `frame_id` / `instance_id` from the query string to
detect the embedded context and derives a default room code from the voice
channel instance. Sharing works through `?room=CODE` — opening that link joins
the room, and reopening it after a refresh reconnects to the same seat using the
token in `localStorage`.

## Troubleshooting

**A sound I dropped in is not playing.** Run `pnpm sfx` and check the table at
the bottom of `public/sfx/README.md` — it shows the exact file picked for each
name. If the name is right but you still hear the synthesised version, open the
console: a file that fails to decode logs a warning naming it.

**No music.** Music starts on the first click or key press — browsers block
audio before a user gesture. Check that `public/music-theme/manifest.json` is
not empty.

**Cards render as flat dark rectangles.** The sprite lookup missed. Confirm that
the atlas `.json` next to the `.jpg` contains the sprite name being requested;
note the Flip dark atlas deliberately has no `back_side`, because in Flip a
card's back *is* its other real face.

**Online rooms do nothing.** Firebase is not configured — see
[Configuration](#configuration). The UI falls back to polling and will say so.
