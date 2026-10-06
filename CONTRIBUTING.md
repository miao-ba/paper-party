# Contributing

Thanks for helping! The most valuable contribution is **a new game**. Platform improvements are welcome
too when they make games easier to write.

## Setup

```bash
npm install
npm run dev     # http://localhost:5330 (second player: http://127.0.0.1:5330)
npm run check   # typecheck + tests + build — CI runs the same
```

## Adding a game

Follow [docs/adding-a-game.md](docs/adding-a-game.md) (or let an AI agent follow
[.claude/skills/add-game/SKILL.md](.claude/skills/add-game/SKILL.md)). A good game PR:

- lives entirely in `src/games/<id>/` plus one line in `src/games/registry.ts`;
- has a bot with three levels and always ends (`npm test` proves it for engine games);
- works on a 360 px wide phone, portrait and landscape;
- has zh-TW and English text (ask in the PR if you need help with one of them);
- includes a screenshot or short GIF in the PR description.

Keep games small and readable — they are also documentation for the next person.

## Changing the platform

- The server must stay game-agnostic. If a game needs something new from the server, make it generic.
- `src/sdk/` is a public API: document additions in `docs/sdk.md`, keep existing games working.
- Add or update tests (`test/server.test.ts`, `test/games.test.ts`).

## Style

TypeScript strict, React function components, Tailwind classes inline, framer-motion for motion. Match the
code around you; comment the *why*. No new dependencies without a good reason.
