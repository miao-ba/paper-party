# AGENTS.md

Instructions for AI coding agents (Claude Code, Codex, Cursor, Copilot, Gemini, …) working on this repo.

## What this is

Paper Party: a small multiplayer party-game platform. One Node server (Express + socket.io) that only
relays messages and stores small blobs; everything about games runs in the browser (React 19 + Vite +
Tailwind 4 + framer-motion). Rooms with 4-letter codes, bots, spectators, no accounts. Mobile first.
UI languages: Traditional Chinese (zh-TW) and English.

## Most tasks are "add a game"

Follow **`.claude/skills/add-game/SKILL.md`** step by step (it is plain Markdown — read it even if your
tool does not support skills). Short version:

1. `npm run new-game -- <id> --type turn|realtime --name "中文" --en "English"`
2. Rules in `src/games/<id>/logic.ts` (pure, tested by `npm test`), screen in `Game.tsx`, meta in `index.ts`.
3. `npm run check`, then play it in a browser: solo vs bots and two tabs (`localhost` + `127.0.0.1`).

API reference: `docs/sdk.md`. Examples to copy: `src/games/{liars-dice,bomb-number,lowest-unique,quick-draw}`.
The other games are two-player ports from an older app (`@sdk/duo`); do not use them as templates.

## Commands

```bash
npm install
npm run dev        # server :3330 + Vite :5330 (open http://localhost:5330)
npm run check      # typecheck + tests + build — run before you say you are done
npm test           # node:test — plays every engine game with bots, server integration tests
npm run build && npm start   # production: one process on :3330 serving dist/
```

Claude Code preview: `.claude/launch.json` has a `dev` configuration (port 5330).

## Boundaries

- `server/` is game-agnostic. **Never put game rules in the server.** Change it only for platform features,
  and keep `test/server.test.ts` green.
- `src/sdk/` is the public API games use; `src/platform/` is lobby/rooms/settings UI. Games import only
  `@sdk`, `@sdk/logic`, `@sdk/types` — never `src/platform/*`.
- `index.ts` / `logic.ts` / `bot.ts` of a game import only `@sdk/types` and `@sdk/logic` (Node-safe).
- Message types starting with `sys:` are reserved for the platform.
- Every game: a bot, `GameOver` at the end, zh-TW + en strings, works at 360 px wide and in landscape.
- Do not add dependencies for something a few lines can do. No new state libraries, no CSS frameworks.
- Trust model: friends playing together. No anti-cheat, no accounts. Do not over-engineer security into games.

## Style

- TypeScript strict, functional React, hooks. Match the surrounding code; comments explain *why*.
- Tailwind classes inline; theme tokens `paper`, `ink`, `ink-soft`, `accent`, `accent-2`, `gold`.
- Keep files focused: rules in `logic.ts`, drawing in `Game.tsx`, small components in the same file.

## Verifying UI changes

Use a real browser. Two tabs on different origins (`http://localhost:5330` and `http://127.0.0.1:5330`)
are two different players. Background tabs throttle timers and animation frames; bring a tab to the
front before judging what it shows, and prefer reading the DOM over trusting screenshots. Dev console:
`__net.room`, `__net.host.addBot()`, `__net.host.start()`, `__sfx.win()`.
