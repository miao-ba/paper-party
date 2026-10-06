# Architecture

```
browser (React)                                   server (Node)
┌──────────────────────────────────────┐          ┌───────────────────────────────┐
│ src/platform  lobby · waiting room ·  │          │ server/rooms.ts               │
│               settings · history      │ socket.io│   players, rooms, seats,      │
│ src/sdk       RoomProvider (bus)      │◄────────►│   host, relay, rate limits    │
│               state engine · clock ·  │          │ server/storage.ts             │
│               UI kit · i18n · sfx     │   HTTP   │   /api/kv  /api/files         │
│ src/games/*   one folder per game     │◄────────►│ static dist/ (production)     │
└──────────────────────────────────────┘          └───────────────────────────────┘
```

## Principles

1. **The server is a post office.** It knows rooms, seats and who the host is. It relays `room:msg`
   payloads without reading them. Adding or changing a game never touches the server and never needs a
   server restart: rebuild, players reload.
2. **The host is the referee.** Rules that need one authority run in the host's browser (the state engine
   does this for you). Bots are simulated there too.
3. **Every game works alone.** Bots fill seats; a solo game is a *local room* that never touches the network
   (so it even works offline).
4. **Friends, not strangers.** No accounts, no anti-cheat: anyone can read the network traffic or the
   host's memory. Secrets are hidden from the UI (`view`), not from devtools. Keep that in mind before
   adding real stakes.

## Identity

- `clientId` is per **browser tab** (sessionStorage): two tabs are two players, and a reload keeps the seat.
  "Duplicate tab" copies sessionStorage, so tabs that share an id negotiate over a `BroadcastChannel` and
  the younger one takes a new id.
- Name / avatar / language / volume live in localStorage (per device). Match history is per device too.

## Rooms

```
waiting ──start──► playing ──end──► waiting
   ▲                  │  └──start (rematch, round+1)──┐
   └──────────────────┘◄──────────────────────────────┘
```

- `RoomView = { code, gameId, hostId, status, public, min, max, options, players: Seat[], round }`.
  The full view is pushed to every member after any change.
- Codes are 4 letters without I/O. `?r=CODE` links join directly; the address bar always shows the link.
- `min/max/options` come from the game's meta (the server only enforces limits). Switching games trims
  seats (bots first, then late humans become spectators).
- **Seats** are ordered. `index` (seat order among players) gives each player a colour.
- **Bots** are seats owned by the host. The host speaks for them with `room:msg { as: botId }` (the server
  checks the sender is the host and the seat is a bot). Messages addressed to a bot are delivered to the
  host's browser.
- **Late joiners** become spectators while a game runs and take free seats when it ends / restarts.
  A human joining a room full of bots replaces a bot.
- **Offline**: a disconnected player keeps the seat for 90 s (`LIMITS.graceMs`). If the host is offline
  for 15 s, the crown moves to the next online human (bots move with it). A room with no humans closes.
- A reconnect's `hello` can arrive before the old socket's `disconnect`; the server only treats a
  disconnect as real if it comes from the player's current socket.

## The message bus (`src/sdk/room.tsx`)

`RoomProvider` connects a game to the room:

- `send(msg, to?)` → local bots (if you are host) + the server (unless the target is your own bot).
- Incoming messages fan out to the game's `useMessage` handlers and to local bots, except the sender.
- Messages that arrive before the lazily-loaded game subscribes are queued and flushed on subscribe.
- Local rooms short-circuit everything with a 20 ms timeout and a JSON round-trip, so games behave the
  same online and offline.
- `sys:*` messages are for the platform: reactions, clock sync, state engine.
- Message-based games: if the host changes or a player leaves for good mid-game (unless
  `meta.continueOnLeave`), the host sends everyone back to the waiting room.

## Clock sync

Non-hosts ping the host 6 times (`sys:clock:ping/pong`), keep the fastest half and take the median offset;
repeated every 30 s and whenever the host changes. `useHostClock()` exposes `hostNow / toLocal / toHost`.
Real-time games schedule on the host clock and measure reactions locally, so sync error never decides a
winner.

## State engine (`src/sdk/engine.ts`)

```
non-host                  host                                  everyone
act(a) ── sys:engine:act ──► turn check → logic.act → result?  ── sys:engine:state {epoch, v, state|view}
                             schedule bots / auto               (one per player when logic.view exists)
mount  ── sys:engine:sync ─► reply with current state
```

- Envelope `{ epoch, v, seats, away, state, result }`. `v` increases with every change; `epoch` is new
  whenever a host (re)starts its engine. Clients accept a new epoch unconditionally and never go back in
  `v` within an epoch.
- The host saves the full envelope in sessionStorage on every change: a host reload resumes the match.
- Host migration: without `view` the new host continues from the last state it saw; with `view` it never
  saw the secrets, so it starts a new match.
- Seats are frozen at game start. A player who leaves becomes `away` and a bot plays their seat
  (`logic.bot`), or `logic.leave` runs, or the room returns to waiting.
- Every client records the result once (local history).
- `test/games.test.ts` simulates every engine game headlessly (`src/sdk/simulate.ts`): deep-frozen, JSON
  round-tripped state, all player counts and option combinations.

## Limits (`shared/protocol.ts`, server env)

| | default |
|---|---|
| seats per room | 16 |
| relayed messages | 60/s per socket, burst 120 (excess dropped) |
| message size | 64 KB (socket buffer 128 KB) |
| rooms | 5000 |
| reconnect grace | 90 s (host: 15 s before migration) |
| kv | 5000 keys, 256 KB each, 120 writes/min/IP |
| uploads | images only, 4 MB, 20/min/IP, deleted after 30 days |

## Scaling

One process holds all rooms in memory. That is plenty for friends and small communities (thousands of
concurrent players on a small VM; traffic is mostly tiny JSON). Horizontal scaling would need sticky
sessions plus a shared room store (e.g. the socket.io Redis adapter and moving `rooms.ts` state to Redis);
that is deliberately out of scope.

## Why these choices

- **Relay instead of server-side game logic**: adding a game is a front-end change only; anyone can write
  one without touching infrastructure. The cost is trust (see principle 4).
- **Full-state broadcast instead of diffs/CRDTs**: party-game state is tiny; whole-state replacement makes
  reconnects and late joins trivial.
- **Bots on the host**: no server CPU, the same code path as humans, works offline.
- **Per-device history**: no accounts, no personal data on the server.
- **No service worker**: the game must always be the latest build when friends join; the app shows an
  "update available" pill instead (`dist/version.json`).

## Front-end gotchas (already handled, keep them in mind)

- Background tabs pause `requestAnimationFrame` and Web Animations. In dev, `devFrames.ts` falls back to
  timers; `motion.ts` skips animations while hidden so `AnimatePresence` screen switches never get stuck.
- `AnimatePresence` keeps rendering exiting components: pass data as props instead of reading context that
  may already be null.
- React StrictMode mounts effects twice in dev; the engine keeps its state in refs for that reason.
- iOS has no vibration API: `haptic()` toggles a hidden `<input type=checkbox switch>` (iOS 17.4+).
- iOS does not play `.ogg`: sounds are `.wav` (short) / `.mp3` (long).
