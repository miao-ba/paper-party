# Porting games from the two-player app

Paper Party grew out of a private two-player app (two people, one server over a VPN). Its games used
`useRoom()` with `me / peer / isHost`, sides `'L' | 'R'`, a `GameHeader` with `left` / `right` tags and a
`BotFactory` for solo play. `@sdk/duo` keeps that API, so a port is mostly an import change.

**All eight original games are ported** (`paper-snipe`, `bridge`, `duel`, `puzzle`, `blindfly`, `tug`,
`twohand`, `turtle`) without touching their rules: only imports and `index.ts` changed. Their shared helpers
live in `src/games/shared/`; `shared/bot.ts` and `shared/clock.ts` are now thin wrappers over the SDK, so
the games' own `../shared/*` imports stayed the same. In-game text is still Chinese only.

## Steps

1. Copy the folder: `src/games/<id>/` (and anything it uses from `src/games/shared/`, e.g. `layout.ts`,
   `Board.tsx`, `PowerButton.tsx`, `InkBlob.tsx`, `mic.ts` → copy into `src/games/shared/` as needed).
2. Fix imports in `Game.tsx`:

   ```ts
   // before
   import { useRoom, useMessage } from '../../room/RoomContext';
   import { GameHeader, PeerOffline, PlayerTag } from '../../ui/GameChrome';
   import { Button } from '../../ui/Button';
   import { sfx } from '../../audio/sfx';  import { haptic } from '../../audio/haptic';
   import { celebrate } from '../../ui/celebrate';  import { useRipples } from '../../ui/ripples';
   import { useClockSync } from '../shared/clock';
   import type { Side } from '../shared/layout';

   // after
   import { useMessage, Button, sfx, haptic, celebrate, useRipples,
            OfflineBanner as PeerOffline, useHostClock as useClockSync } from '@sdk';
   import { useDuo as useRoom, DuoHeader as GameHeader, PlayerTag, type Side } from '@sdk/duo';
   ```

3. `logic.ts`: `import type { Side } from '@sdk/duo'` (type-only, stays Node-safe).
4. `bot.ts`: `BotFactory` from `@sdk/types`; `gauss / between / clamp / oneAtATime` from `@sdk/logic`;
   `silentBot` from `@sdk/logic`. `ctx.side`, `ctx.difficulty`, `ctx.send/later/every/cancel` work as before.
   `onMessage(msg)` now also receives `from` as a second argument (optional).
5. `index.ts`: convert the meta:

   | old | new |
   |---|---|
   | `solo: { desc, levels }` | `bots: { levels }` (the lobby shows a generic "play with bots" card) |
   | — | `players: { min: 2, max: 2 }` |
   | `tags: ['versus', …]` | same tags (`chill`, `coop`, `realtime`, `turn`, `versus`, `voice`) |
   | `name: '中文'` | `name: { 'zh-TW': '中文', en: 'English' }` (or keep a plain string) |
   | `bot: myBot` | same |

   Use `defineGame({...})` from `@sdk/types`.
6. Register in `src/games/registry.ts`, `npm run check`, play solo and with two tabs.

## Behaviour differences to know

- **Sides**: the host is `'L'`, the other player `'R'` — as before. Bots are never host, so a bot is `'R'`.
- **Solo**: `useDuo().solo` is true when the other player is a bot; `difficulty` is that bot's level.
  Solo is now a local room: it works without the server, like before.
- **Records**: `report({ winner: 'L' | 'R' | 'draw' | null, score, value })` still works; history is
  stored per device (the shared `match:` kv records of the old app are not used).
- **Rematch**: the platform's "play again" remounts the game; your own in-game "again" button can stay.
- **Host leaves / player leaves mid-game**: message-based games go back to the waiting room.
- **Storage**: `fetch('/api/kv/…')` and `/api/files` still exist (see `kv` / `uploadImage` in `@sdk`), but
  operators may disable them on public servers — handle failures.
- **Microphone / gyroscope** need https. The old self-signed `:3211` server is gone; use a real https
  deployment (see deploy.md) or `vite --https` locally.
- Platform features specific to the two-player app (pokes, direct invites, the "partner" card, shared
  dates) are not part of the public platform.

## Going beyond two players

When a ported game works, consider generalising it: replace `me/peer/sides` with `useRoom().players`
(seat colours, `index`), or move its rules into a `logic.ts` for the state engine — then bots, reconnects,
spectators and host migration come for free.
