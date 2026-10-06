---
name: add-game
description: Add a new multiplayer game to this Paper Party repo — design it, scaffold it, write pure rules + bot, build a mobile-first UI with the SDK, test it with bots and two browser tabs. Use whenever the user wants to create, add, make, prototype or port a game here, including requests like "做一個新遊戲", "加一個遊戲", "幫我把這個點子做成遊戲", "port my game", or describes a game idea and wants it playable.
---

# Add a game to Paper Party

A game is one folder in `src/games/<id>/` plus one line in `src/games/registry.ts`. The server never
changes: it only relays messages. Rooms, seats, bots, reconnects, host migration, spectators, lobby,
reactions, sound, i18n and match history are the platform's job — **do not rebuild any of them in a game.**

Read `docs/sdk.md` for the full API before writing code. The N-player examples — `liars-dice`,
`bomb-number`, `lowest-unique`, `quick-draw` — are the references; copy patterns from them rather than
inventing new ones. The two-player games (`duel`, `tug`, `turtle`, `paper-snipe`, `bridge`, `puzzle`,
`blindfly`, `twohand`) were ported from an older app through `@sdk/duo`: fine to read for UI ideas, but do
not copy their structure (`me/peer`, sides, hand-rolled sync) into new games.

## 1. Pin down the design (2 minutes, then build)

Turn the idea into this mini-spec and state it to the user in a few lines. If the idea is vague, choose
sensible defaults yourself and say so — only ask when two readings lead to genuinely different games.

- **Pitch**: one sentence (becomes `tagline`).
- **Players**: `min`–`max` (humans + bots count). Party games: aim for 2–8.
- **Flow**: turns / simultaneous secret picks / real-time.
- **Hidden information**: what each player must not see.
- **End & winner**: when it ends, who wins, scores shown.
- **Host options**: 0–3 settings (rounds, size, a rule toggle).
- **Bot**: what easy / normal / hard do differently. Every game ships with a bot.

## 2. Choose the pattern

| The game is… | Use | Copy from |
|---|---|---|
| turn-based, simultaneous picks, cards, dice, voting, bluffing, timed phases | **state engine** `--type turn` | `bomb-number` (turns + secret), `liars-dice` (hidden hands, `auto` rounds, probabilistic bot), `lowest-unique` (simultaneous) |
| reaction time, mashing, continuous movement, anything at 60 fps | **messages** `--type realtime` | `quick-draw` (host clock, decoys, host referees) |
| mostly turns but with a twitchy mini-phase | engine for flow + `useMessage` for the fast part | — |

Default to the engine. It gives bots, reloads, spectators and host migration for free and its rules are
tested automatically.

## 3. Scaffold

```bash
npm run new-game -- <kebab-id> --type turn --name "中文名" --en "English Name"
```

This copies `templates/<type>/` into `src/games/<id>/` and registers it. The template is a tiny working
game ("Last Stick" / "Tap Race"): replace its rules, keep its shape.

## 4. Write the rules — `logic.ts` (engine games)

`defineLogic<State, Action, Options>({ setup, act, turn, result, view?, bot, auto?, botDelay? })`

- Pure TypeScript: import only from `@sdk/logic`. No React, DOM, timers or network.
- State is plain JSON. **Never mutate** — return new objects (tests deep-freeze state).
- Reject illegal actions with `invalid('why')`. The engine already enforces `turn()`.
- Randomness: use `ctx.rng` / `rng` (seeded in tests), never `Math.random`.
- Secrets → `view(state, playerId)` returns a redacted copy (`playerId` null = spectator). Bots receive
  their view too, so they cannot cheat.
- Time-based steps (reveal for 4 s, next round, turn timer) → `auto(state)` returns `{ after, action }`;
  its action has `playerId === SYSTEM`; guard it by phase.
- Keep anything the UI or `result.headline` needs (player names, last move, round log) in the state.
- `result()` returns `{ winners, ranking?, scores?, headline? }` exactly once the match is over.

Bot (`bot(view, { playerId, level, rng })`): return a legal action. Make levels feel different (noise,
search depth, risk). It must never get stuck: if it returns `null`, something else (`auto`) must move the
game on.

## 5. Message games — `logic.ts` (types/helpers) + `bot.ts` + `Game.tsx`

- Define `type Msg = { t: 'xx:…' } | …` with a game prefix. `sys:` is reserved.
- **Host referees**: schedules on `useHostClock().hostNow()`, collects inputs, broadcasts the official
  result; clients display it. Measure reaction times locally.
- Non-host on mount: `send({ t: 'xx:hello' }, room.host.id)`; host replies with current scores/phase.
- Bot: `BotFactory` receiving the same messages a player gets; use `ctx.later/every`.
- Throttle streams (~20 Hz). Limit: 60 msgs/s per player.
- Call `room.report(result)` once when the match ends, then render `<GameOver result={…} />`.

## 6. Build the screen — `Game.tsx`

- Imports from `@sdk`. Engine: `const g = useGameState(logic); if (!g.state) return <Waiting />;`
- Skeleton: `GameHeader` → `OfflineBanner` → `flex-1 min-h-0 flex flex-col short:flex-row` with main area
  and a footer for controls (`short:w-64 short:shrink-0`) → `GameOver` when `result`. See docs/sdk.md §4.
- Engine games pass `players={g.seats} active={g.turn} away={g.away}` (and `scores`) to `GameHeader`,
  and `players={g.seats}` to `GameOver`.
- **Mobile first**: must work at 360×640 portrait and landscape phones (`short:`). Touch targets ≥ 44 px.
  No hover-only UI. Use `touch-none` on drag / mash areas.
- Spectators: `g.me === null` (or `room.isSpectator`) → show the board, hide controls.
- Waiting states always say who we are waiting for (`g.seat(id).name`).
- Text through `defineStrings({ 'zh-TW': {…}, en: {…} })` — both languages, same keys.
- Juice: `sfx.*` on every meaningful event, `haptic('light')` when it becomes your turn, framer-motion for
  enter/exit. Keep the paper look (`bg-paper`, `border-ink/10`, `rounded-2xl/3xl`, seat colours).
- Never put rules in the component: anything that decides the outcome lives in `logic.ts`.

## 7. Meta — `index.ts`

Fill `name`, `tagline`, `icon` (lucide), `hue`, `players`, `tags`, `minutes`, `howto` (3–5 lines, both
languages), `options`, `bots: { levels }`, `spectators: true` for engine games. Only `@sdk/types` /
`@sdk/logic` imports here.

## 8. Verify — do all of it, then report what you saw

1. `npm run check` — typecheck + tests + build. `test/games.test.ts` plays your engine game with bots for
   every player count and option combination; a failure there is a real bug (game never ends, mutation,
   non-JSON state, crash). Add `test/<id>.test.ts` for tricky rules (copy `test/rules.test.ts` style).
2. Start the dev server (`npm run dev`, or the `dev` config in `.claude/launch.json` with the preview
   tools) and play:
   - **Solo**: lobby → your game → "Play with bots" → finish a whole match.
   - **Multiplayer**: tab A `http://localhost:5330` creates a room; tab B `http://127.0.0.1:5330/?r=CODE`
     (different origin = different player name). Add a bot. Play a match through to the game-over card;
     try "play again". Reload one tab mid-game — it must resume.
   - Check 360 px wide and a landscape phone size; no console errors.
   - Debug: `__net.room`, `__net.host.addBot()`, `__sfx.win()`.
3. Report honestly: what you played, what you could not test.

## Definition of done

- [ ] Folder `src/games/<id>/` with `index.ts`, `logic.ts`, `Game.tsx` (+ `bot.ts` for message games), registered.
- [ ] Rules pure and tested by `npm test`; bot at three levels; game always ends.
- [ ] Works solo vs bots and with two real tabs; reload mid-game resumes.
- [ ] Mobile portrait + landscape, both languages, sounds, `GameOver` at the end.
- [ ] No changes to `server/`, `src/platform/` or `src/sdk/` unless the platform truly lacks something —
      then make the change generic, document it in `docs/sdk.md`, and tell the user.

## Pitfalls (learned the hard way)

- Background tabs pause `requestAnimationFrame`; in dev the platform falls back to timers, but to *see*
  a tab, bring it to the front. Screenshots can be stale — verify with the DOM.
- A component defined inside another component remounts every render (animations restart, inputs lose
  focus). Define components at module level or call render helpers as functions.
- `useMessage` handlers see fresh state, but `setTimeout` callbacks do not — keep timing state in refs.
- The host is a player too: when the host acts in a message game, apply the effect locally *and* in its
  referee logic (it never receives its own message).
- Simultaneous engine games: `turn` must shrink as people act, or bots will try to act twice.
- Do not add `Math.random()` to `act` / `setup`; do not keep `Date.now()` deltas in state for animations.
- Porting a game from the original two-player app: read `docs/porting-2p-games.md`.
