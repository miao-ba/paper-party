# Game SDK reference

Everything a game may import. Three entry points:

| Import from | Use in | Contains |
|---|---|---|
| `@sdk/types` | `index.ts` | `defineGame`, `GameMeta`, `GameModule`, `OptionSpec`, `BotFactory`, `TAG_LABEL` |
| `@sdk/logic` | `logic.ts`, `bot.ts` | `defineLogic`, `invalid`, `nextPlayer`, rng helpers, `Result`, bot helpers — **pure, no React** |
| `@sdk` | `Game.tsx` | everything above + hooks, UI kit, sound, i18n, storage |

`index.ts`, `logic.ts` and `bot.ts` must only import `@sdk/types` / `@sdk/logic` (and each other): `npm test`
loads them in Node and plays your game with bots. Only `Game.tsx` (and components it imports) may use `@sdk`.

---

## 1. The module — `index.ts`

```ts
import { lazy } from 'react';
import { Dices } from 'lucide-react';          // any icon from lucide.dev
import { defineGame } from '@sdk/types';
import { logic } from './logic';

const load = () => import('./Game');

export const myGame = defineGame({
  meta: {
    id: 'my-game',                              // kebab-case, never rename after release
    name: { 'zh-TW': '我的遊戲', en: 'My Game' },
    tagline: { 'zh-TW': '一句話', en: 'One line' },
    icon: Dices,
    hue: 268,                                   // card colour (HSL hue)
    players: { min: 2, max: 6 },                // humans + bots
    tags: ['party', 'turn'],                    // versus coop party realtime turn bluff luck voice chill
    minutes: '3–5',
    howto: { 'zh-TW': ['…', '…', '…'], en: ['…', '…', '…'] },
    options: [                                  // optional host settings, rendered by the platform
      { key: 'rounds', label: { 'zh-TW': '回合', en: 'Rounds' }, type: 'select',
        choices: [{ value: 3, label: '3' }, { value: 5, label: '5' }], default: 3 },
      { key: 'wild', label: '1s wild', type: 'toggle', default: true },
    ],
    bots: { levels: true, desc: { 'zh-TW': '…', en: '…' } },   // omit if there is no bot; desc is optional
    spectators: true,                           // late joiners may watch (free for engine games)
    continueOnLeave: false,                     // message games: keep going when someone leaves?
  },
  Game: lazy(load),
  preload: load,
  logic,                                        // engine games
  // bot: myBot,                                // message-based games
});
```

Register it in `src/games/registry.ts` (the scaffolder does this).

`Localized` values are either a plain string or `{ 'zh-TW': …, en: … }`.

---

## 2. State engine — `logic.ts` + `useGameState`

The default for anything that can be described as *state + actions*: turn-based, simultaneous picks,
card/dice/board games, voting, drawing-free party games, even timed phases (via `auto`).

```ts
import { defineLogic, invalid, nextPlayer, pick, type Result } from '@sdk/logic';

export interface Options { rounds: number }
export interface State { … }                      // plain JSON only
export type Action = { type: 'play'; card: number } | { type: 'pass' } | { type: 'next' };

export const logic = defineLogic<State, Action, Options>({
  setup({ players, options, rng }): State,        // host, once per match
  act(state, action, { playerId, players, rng, now }): State,   // return NEW state or invalid('why')
  turn?(state): string | string[] | null,          // who may act; engine rejects everyone else
  result?(state): Result | null,                   // non-null ends the match
  view?(state, playerId | null): State,            // hide secrets (null = spectator)
  bot?(state, { playerId, level, players, rng }): Action | null,   // gets view(state, botId)
  auto?(state): { after: ms, action } | null,      // host fires a SYSTEM action later
  botDelay?: [minMs, maxMs],                       // default [700, 1500]
  leave?(state, playerId, ctx): State,             // a player left and there is no bot
});
```

How it runs:

- The **host** holds the full state. `setup()` when the game starts; every action goes through `act()`;
  the new state is broadcast (one `view` per player if you defined `view`).
- Everyone else sends actions to the host and renders what comes back. There is no optimistic update.
- **Bots** (and seats of players who left) act when `turn()` includes them, after `botDelay`.
- **`auto`** is how time passes: a reveal that lasts 5 s, a turn timer, "next round". Its action arrives with
  `playerId === SYSTEM` and skips the turn check — guard it in `act` (`if (s.phase !== 'reveal') return invalid()`).
- **Reloads**: the host keeps its state in `sessionStorage` and resumes; others re-sync automatically.
- **Host leaves**: without `view`, the next host continues from the last state. With `view` (secrets the new
  host never saw) a fresh match starts.
- **Player leaves for good**: a bot takes the seat if you have `bot`; else `leave()`; else back to the room.

Rules of thumb:

- Never mutate `state` (tests deep-freeze it). Spread: `{ ...s, scores: { ...s.scores, [id]: v } }`.
- No `Map`/`Set`/`Date`/`undefined`/class instances in state — it travels as JSON.
- Use `ctx.rng` (not `Math.random`) in `setup`/`act`/`bot` so tests are reproducible.
- Store what the UI or `result` needs (e.g. `names`) in the state; logic does not see the room.
- Simultaneous turns: `turn` returns every id that still has to act (see `lowest-unique`).

`Result`:

```ts
interface Result {
  winners: string[];                 // [] and not coop = draw
  ranking?: string[];                // best first, shown on the game-over card
  scores?: Record<string, number | string>;
  coop?: boolean; value?: number;    // co-op: team score
  headline?: Localized;              // custom title, e.g. "💣 Amy hit the bomb!"
}
```

In `Game.tsx`:

```tsx
const g = useGameState(logic);
if (!g.state) return <Waiting />;
g.state            // your view of the state
g.seats            // SeatInfo[] fixed at start: { id, name, avatar, index, color, bot, level }
g.me               // your seat, or null when spectating
g.seat(id)         // lookup
g.turn / g.myTurn  // from logic.turn
g.result           // from logic.result
g.away             // ids played by a bot because the person left
g.act(action)      // send an action
g.isHost, g.rematch()
```

Helpers in `@sdk/logic`: `invalid(why)`, `nextPlayer(order, id, skip?)`, `turnList`, `seeded(seed)`,
`randInt(rng, lo, hi)`, `pick(rng, arr)`, `shuffle(rng, arr)`, `gauss(rng)`, `between(a, b)`, `clamp`,
`oneAtATime(ctx)`, `silentBot`, `SYSTEM`.

---

## 3. Messages — `useRoom` + `useMessage`

For real-time games (reaction times, mashing, continuous movement) or anything the engine does not fit.

```tsx
const room = useRoom();
room.me / room.players / room.spectators / room.host / room.isHost / room.isSpectator
room.player(id)              // Player: { id, name, avatar, index, color, bot, level, online, spectator, isHost, isMe }
room.options                 // host settings from meta.options
room.code / room.round / room.local
room.send(msg)               // everyone else (never yourself)
room.send(msg, playerId)     // one player or bot
room.report(result)          // once per match (engine games: automatic)
room.rematch() / room.backToRoom()   // host
room.leave()

useMessage<Msg>((msg, from) => { … });   // handler always sees fresh state
```

Conventions:

- Messages are `{ t: 'prefix:name', … }` discriminated unions; prefix `t` with your game (`qd:`, `tr:`).
- `t` starting with `sys:` is reserved for the platform.
- **The host referees.** It schedules events, collects inputs and *announces* outcomes (`{ t: 'x:result' }`);
  other clients display what the host says. Do not let every client compute results independently unless
  the computation is deterministic from identical inputs.
- Apply your own action locally and `send` it — you never receive your own messages.
- On mount, a non-host may `send({ t: 'x:hello' }, room.host.id)` so the host can answer with the current
  state (reload / late join). Messages sent before your `Game` mounted are queued, not lost.
- Rate limit: 60 messages/second per player (burst 120), 64 KB per message. Throttle continuous streams
  (positions: ~20 Hz).

### Host clock

```tsx
const clock = useHostClock();
clock.hostNow()          // host's performance.now(), now
clock.toLocal(hostTime)  // → my performance.now()
clock.toHost(localTime)
clock.synced             // false for ~1 s after joining
```

Schedule on the host clock (`drawAt = clock.hostNow() + 3000`), convert with `toLocal` on each client,
and **measure reaction times locally** so clock error never decides who was faster.

### Message bots

```ts
import { between } from '@sdk/logic';
import type { BotFactory } from '@sdk/types';

export const bot: BotFactory = (ctx) => {
  // ctx: { id, name, level, index, side, options, players(), hostId(), send(msg, to?), later, every, cancel }
  ctx.later(() => ctx.send({ t: 'x:ready' }), between(400, 1200));
  return { onMessage(msg, from) { … }, dispose() {} };
};
```

The host runs one instance per bot seat. A bot receives what a player would and talks with `ctx.send`;
always use `ctx.later/every` (cleared automatically). Bots live in the host's browser, so the host clock is
their clock.

---

## 4. UI kit

| Component | |
|---|---|
| `<GameHeader players? scores? active? away? center? actions? />` | Standard top bar: players (seat colours, turn highlight, badges) + reactions + sound + menu. Pass `players={g.seats}` in engine games. |
| `<OfflineBanner />` | "X disconnected, waiting…" strip. Put it under the header. |
| `<GameOver result players? extra? />` | End card: ranking, play again / back to room / leave, confetti. |
| `<Waiting>text</Waiting>` | Bouncing dots. |
| `<TurnBanner show>Your turn</TurnBanner>` | Pop-in pill. |
| `<Countdown ms go />` | 3-2-1-GO with ticks. |
| `<Delayed ms>…</Delayed>` | Render children later (let an animation finish before `GameOver`). |
| `<Button variant="primary\|ghost\|soft\|danger" size="sm\|md\|lg">` | The one button. |
| `<Avatar emoji name size ring bot dim online />` | Player avatar. |
| `<PlayerChip />`, `<Sheet title onClose>` (wrap in `AnimatePresence`), `<GameIcon meta />` | |
| `useRipples()` | Tap ripples: `ripple.add(e)` + `{ripple.node}`. |
| `useSize()`, `usePortrait()` | Layout helpers. |
| `celebrate('big' \| 'small')` | Confetti (GameOver already does it). |
| `sfx.tap/pop/undo/start/count/go/win/lose/win2/lose2/miss/hit/chip/coin/shake/jackpot/draw/shot/whistle/crash/swap/…` | Sounds (CC0 samples + synth fallback). Try `__sfx.name()` in the dev console. |
| `haptic('light' \| 'medium' \| 'heavy' \| 'double' \| 'triple')` | Vibration (Android; one tick on iOS). |

Layout skeleton every game uses:

```tsx
<div className="h-full flex flex-col">
  <GameHeader … />
  <OfflineBanner />
  <div className="flex-1 min-h-0 flex flex-col short:flex-row">
    <main className="flex-1 min-h-0 …">…the board…</main>
    <footer className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] short:w-64 short:shrink-0">…controls…</footer>
  </div>
  {result && <GameOver … />}
</div>
```

`short:` = landscape phone (height ≤ 540 px): controls move to the right. Design for **360 px wide** first.
Theme colours: `paper`, `paper-2`, `ink`, `ink-soft`, `accent` (coral), `accent-2` (teal), `gold`; player
colours come from `seat.color` / `player.color`. Font: Klee One (hand-written look).

---

## 5. Text — `defineStrings`

```ts
const T = defineStrings({
  'zh-TW': { yourTurn: '輪到你了', took: (n: string, k: number) => `${n} 拿了 ${k} 根` },
  en:      { yourTurn: 'Your turn',  took: (n: string, k: number) => `${n} took ${k}` },
});
const t = T.use();   // in a component; re-renders on language change
```

The first language listed is the fallback for missing keys. Single-language games are fine too.

---

## 6. Storage (optional)

```ts
import { kv, uploadImage } from '@sdk';
await kv.set('my-game:save:abc', data);  await kv.get('my-game:save:abc');  await kv.list('my-game:save:');
const url = await uploadImage(blob);     // null if the server disabled uploads
```

Server operators can turn these off (`KV=off`, `FILES=off`); handle `null`/`false`. Uploads expire after
`FILES_TTL_DAYS` (30).

---

## 7. Two-player ports — `@sdk/duo`

`useDuo()`, `DuoHeader`, `PlayerTag`, `Side`, `SIDE_COLOR` keep the API of the original two-player app.
See [porting-2p-games.md](porting-2p-games.md).
