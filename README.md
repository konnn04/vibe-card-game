# Ú Nồ Card Game

> This game was created by me and AI; it is not intended for reference purposes.

A 3D card party game that runs **as an ordinary website and as a Discord
Activity from the same build** — one deploy, one URL, no separate client. Play
the classic deck or the double-sided **Flip** deck, against bots or with up to
four people in a shared room.

Built with Next.js 16 (App Router), React Three Fiber, and Firebase Realtime
Database. The rules live in a dependency-free TypeScript package so the same
engine runs on the server and in the browser.

---

## Table of contents

- [Two ways to play](#two-ways-to-play)
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

## Two ways to play

The app detects its own context at runtime — there is no build flag, no second
entry point, and no Discord SDK on the critical path. Everything below the
detection line is identical in both.

| | **Web** | **Discord Activity** |
| --- | --- | --- |
| How it opens | Any browser, your own URL | The activity shelf in a voice channel |
| Detection | default | `frame_id` / `instance_id` in the query string **and** running inside an iframe (`src/lib/discord.ts`) |
| Finding each other | Share a `?room=CODE` link, or type the 6-character code | A default room code is derived from the voice channel's `instance_id`, so everyone who launches it lands in the same room |
| Identity | Name and avatar from local settings | Your Discord display name and avatar, via OAuth `identify` (`src/lib/discord.ts` → `/api/discord/token`). The voice channel `instance_id` also becomes the default room code |
| Refresh / reconnect | Reopen the same link; the seat token in `localStorage` puts you back in your chair | Same |

Nothing about the rules, networking, rendering or audio differs between the two.
A Discord Activity is just this site in an iframe that happens to have a room
code handed to it.

Solo-versus-bots needs neither context nor a server: the engine runs in the tab.

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
| `NEXT_PUBLIC_SITE_URL` | for deployment | Public origin. Share links, `sitemap.xml` and the Open Graph image resolve against it; defaults to `localhost:3000` |

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
own cards arrive on a private channel.

The Flip deck is a deliberate, rule-driven exception. A Flip card has two real
faces, and **the face turned away from you is public information at a real
table** — deciding whether to flip is the whole strategic layer of the game, and
it only works if you can see what everyone will be holding afterwards. So
`maskCard` blanks only the **active** face and leaves the other one intact, for
opponents' hands and for the top of the draw pile alike. You still cannot see
what anyone can play *right now*; you can see what they will hold after a flip,
exactly as at a physical table.

This is not a hole in the masking, it is the masking being side-aware. The
classic deck has one face, so it is blanked outright.

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

One build serves both targets. Deploy once, then optionally point Discord at the
same URL.

### With Docker (own host)

```bash
cp .env.example .env          # fill in real values
GIT_SHA=$(git rev-parse --short=7 HEAD) GIT_COUNT=$(git rev-list --count HEAD) docker compose up -d --build
```

Multi-stage build on `output: 'standalone'` — the runtime image carries a ~29MB
server plus `public/` and no `node_modules`. It listens on `127.0.0.1:3000`; put
your own reverse proxy in front for TLS (a Discord Activity requires HTTPS).

Two things that will bite you if you edit `docker-compose.yml`:

- **`NEXT_PUBLIC_*` must stay under `build.args`, not `environment`.** Those
  values are inlined into the browser bundle at build time. Declared under
  `environment` they arrive far too late, the bundle ships empty strings, and
  online play silently does nothing — while the menu still loads, so it reads
  as an unrelated bug.
- **Keep it at one replica.** Room step timers, fallback locks and caches are
  per-process in-memory state. Two replicas each schedule their own timers for
  the same room: not corrupting (Firebase holds the lock) but duplicated work
  and much harder to debug. Scaling out means moving the timers out of process
  first.

### On Vercel

Works out of the box, with **one setting that matters more than everything else
put together**: `vercel.json` pins functions to `sin1`, next to the Firebase
Realtime Database in `asia-southeast1`.

A single player action makes five database round trips — take the lock, read the
room, write the room, broadcast, release the lock. From Vercel's default `iad1`
those cross the Pacific at ~220ms each: **~1.1s per move**, with the room lock
held the whole time, while `withLock` only retries for ~1.2s before throwing
`room-busy`. Two people acting close together collide immediately. From `sin1`
the same five trips cost ~60ms.

**Change that region if the database moves.** Pick the Vercel region nearest the
*database*, not the players — players only fetch static assets, which the CDN
already handles, but every move has to reach the database.

Two more Vercel specifics:

- `FIREBASE_SERVICE_ACCOUNT_KEY` must be **raw JSON or base64**, not a file
  path. There is no filesystem to mount a key into.
- The server's own `setTimeout` room stepper is disabled on serverless (it can
  never fire once the response is sent). The match is driven entirely by the
  client heartbeat at `/api/rooms/[code]/step` — see
  [How it works](#how-it-works).

### As a website

Any Node host that runs `next build` / `next start` works.
Set `NEXT_PUBLIC_SITE_URL` so share links, `sitemap.xml` and the Open Graph
preview point at the real domain instead of `localhost`.

That is the whole deployment. Players share `?room=CODE` links; reopening one
after a refresh reconnects to the same seat using the token in `localStorage`.

### Also as a Discord Activity

Serve the same deployment over HTTPS and add a URL mapping in the Developer
Portal. Nothing in the build changes — the app notices it is embedded and
derives a default room code from the voice channel's `instance_id`, so everyone
who launches the activity lands in the same room without typing a code.

In the portal you only need the URL mapping:

- **Interactions Endpoint URL** — leave blank. It is for receiving slash
  commands over HTTP; an Activity never uses it, and a wrong value fails
  Discord's signed-PING check when you try to save.
- **Linked Roles Verification URL** — leave blank. OAuth linked roles, unused.
- **Terms of Service** / **Privacy Policy** — optional until you submit for
  verification. Served at `/legal/terms` and `/legal/privacy`.

**Map the Firebase host too, if you want realtime online play.** Discord blocks
requests to origins you have not mapped, and the browser talks to Realtime
Database directly over a WebSocket — so add a mapping for the host in
`NEXT_PUBLIC_FIREBASE_DATABASE_URL` (`<project>.firebasedatabase.app` or
`<project>.firebaseio.com`). Without it the app is not broken, it just falls
back to polling its own `/api` routes: rooms still work, they update a little
slower. Everything else — fonts, card art, audio — is served from your own
origin, so there is nothing else to map.

## Troubleshooting

**A sound I dropped in is not playing.** Run `pnpm sfx` and check the table at
the bottom of `public/sfx/README.md` — it shows the exact file picked for each
name. If the name is right but you still hear the synthesised version, open the
console: a file that fails to decode logs a warning naming it.

**No music.** Music starts on the first click or key press — browsers block
audio before a user gesture. Check that `public/music-theme/manifest.json` is
not empty.

**Cards render as flat dark rectangles.** That is the placeholder material,
which should only ever show for the few hundred ms before the atlas finishes
loading. Seeing it mid-match means a sprite lookup missed: confirm the atlas
`.json` next to the `.jpg` contains the name being requested. Note the Flip dark
atlas deliberately has no `back_side` — in Flip a card's back *is* its other
real face — so anything asking for one there falls back to the light atlas.

**The Discord Activity shows a blank frame.** Check that the URL mapping points
at an HTTPS origin that actually serves the app, then open the activity's
devtools — a blank frame is almost always a blocked request to an origin you
have not mapped.

**Inside Discord the game works but rooms update slowly.** The Firebase host is
not mapped, so the realtime WebSocket is blocked and the app fell back to
polling its own API. See [Deployment](#deployment).

**Online rooms do nothing.** Firebase is not configured — see
[Configuration](#configuration). The UI falls back to polling and will say so.
