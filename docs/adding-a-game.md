# Adding a game

A game is **one folder** in `src/games/<id>/` and **one line** in `src/games/registry.ts`. You never touch
the server. Rooms, seats, bots, reconnects, spectators, sound, i18n and match history are the platform's job.

> **With an AI coding agent** — Claude Code picks up the [`add-game` skill](../.claude/skills/add-game/SKILL.md)
> automatically: just describe your game ("make a 3–8 player game where everyone secretly bids for…").
> Other agents (Codex, Cursor, Copilot, Gemini…) read [`AGENTS.md`](../AGENTS.md), which points to the same
> workflow. The agent scaffolds, writes rules + bot, builds the UI, runs the tests and plays it in a browser.

## 1. Scaffold

```bash
npm run new-game -- space-race                    # turn-based template (state engine)
npm run new-game -- space-race --type realtime    # real-time template (messages)
npm run new-game -- space-race --name "太空競賽" --en "Space Race"
```

You get a tiny working game ("Last Stick" or "Tap Race") registered in the lobby. Run `npm run dev`, open
<http://localhost:5330>, and play it against bots right away. Then make it yours.

## 2. Pick the pattern

**State engine (default).** You write the rules as pure functions; the platform runs them on the host,
syncs everyone, runs your bot, resumes after reloads and handles spectators and players leaving.
Good for: turns, simultaneous secret picks, cards, dice, bidding, voting, word games, timed phases.

**Messages.** You send `{ t: '…' }` messages between browsers yourself. For real-time play: reaction
times, mashing, movement. The host acts as referee: it schedules events on its clock, collects inputs and
announces results.

You can mix them: engine for the flow, a few messages for a fast mini-phase.

## 3. The files

```
src/games/space-race/
  index.ts    metadata (name, players, howto, options…) + lazy-loaded Game — no React-heavy imports
  logic.ts    engine: the rules (pure) + bot   ·   messages: message types + pure helpers
  bot.ts      messages only: the bot as a "fake player"
  Game.tsx    the screen
```

### logic.ts (engine)

```ts
export const logic = defineLogic<State, Action, Options>({
  setup({ players, options, rng }) { … },        // initial state
  act(state, action, { playerId, rng }) { … },   // new state, or invalid('why')
  turn: (state) => …,                            // who may act: id, ids, or null
  result: (state) => …,                          // { winners, ranking?, scores? } when over
  view: (state, playerId) => …,                  // optional: hide secrets
  bot: (view, { playerId, level, rng }) => …,    // a legal action
  auto: (state) => …,                            // optional: { after: ms, action } for timed steps
});
```

Write it like a reducer: no mutation, plain JSON state, randomness from `rng`. `npm test` will play
hundreds of bot-only matches of your game (every player count and option combination) and fail if a match
never ends, throws, mutates state or puts non-JSON values in it.

### Game.tsx (engine)

```tsx
export default function Game() {
  const g = useGameState(logic);
  const t = T.use();
  if (!g.state) return <Waiting />;
  return (
    <div className="h-full flex flex-col">
      <GameHeader players={g.seats} active={g.turn} away={g.away} />
      <OfflineBanner />
      <div className="flex-1 min-h-0 flex flex-col short:flex-row">
        <main className="flex-1 min-h-0">…draw g.state…</main>
        <footer className="p-4 short:w-64 short:shrink-0">
          {g.myTurn && <Button onClick={() => g.act({ type: 'roll' })}>{t.roll}</Button>}
        </footer>
      </div>
      {g.result && <GameOver result={g.result} players={g.seats} />}
    </div>
  );
}
```

Full API: [sdk.md](sdk.md). Real examples: `src/games/bomb-number` (simplest), `liars-dice` (hidden hands,
auto rounds, smarter bot), `lowest-unique` (simultaneous picks), `quick-draw` (real-time messages).

## 4. Make it feel good

- Design for a **360 px wide phone** first; check landscape phones too (`short:` variant).
- Big touch targets (≥ 44 px), no hover-only controls, `touch-none` where people drag or mash.
- Sound and vibration on every meaningful event (`sfx.*`, `haptic()`), motion for things that change.
- Always tell people who we are waiting for.
- Both languages via `defineStrings` (zh-TW + en). The lobby texts come from `index.ts` meta.

## 5. Check it

```bash
npm run check        # typecheck + tests (plays your game with bots) + production build
```

Then play it for real:

1. Solo: lobby → your game → **Play with bots**, finish a match.
2. Friends: tab A at <http://localhost:5330> → **Create room**; tab B at `http://127.0.0.1:5330/?r=CODE`
   (a different origin keeps a different name). Add a bot, start, finish, **Play again**. Reload a tab
   mid-game: it must resume.
3. Dev console helpers: `__net.room`, `__net.host.addBot()`, `__sfx.win()`.

## 6. Ship it

Open a pull request with a short description and a screenshot or GIF. Checklist:

- [ ] `npm run check` passes
- [ ] Bot at three difficulty levels; the game always ends
- [ ] Played solo and with two tabs; reload resumes
- [ ] Phone portrait + landscape; zh-TW + en
- [ ] Nothing changed in `server/`, `src/platform/`, `src/sdk/` (or it is a generic improvement, documented)
