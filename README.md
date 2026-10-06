# Paper Party

**Tiny multiplayer party games for a bunch of friends — in the browser, on phones, no sign-up.**
Open a room, send the 4-letter code, play. Not enough people? Bots take the empty seats.

And it is built to grow: **a game is one folder**. Describe your idea to an AI coding agent and the bundled
[`add-game` skill](.claude/skills/add-game/SKILL.md) takes it from idea to a tested, playable game.

[繁體中文說明](README.zh-TW.md)

---

## Features

- **Rooms** with join codes, share links, QR codes and an optional public room list
- **2–16 players** per room, spectators, kick, hand over the host crown
- **Bots in every game** (easy / normal / hard); solo games run fully in the browser, even offline
- **Reconnect-proof**: reload mid-game and carry on; if the host leaves, someone else takes over
- **Phone first**: portrait and landscape layouts, vibration, sounds, add-to-home-screen (PWA)
- **Two languages**: 繁體中文 and English, switchable any time
- **One small Node server**, no database, no accounts — deploy anywhere Node runs

## Games included

| | Game | Players | Shows off |
|---|---|---|---|
| 🎲 | **Liar's Dice** 吹牛骰 — bid on dice you cannot see, call the liar | 2–6 | hidden hands, timed reveals, a bot that does probability |
| 💣 | **Bomb Number** 終極密碼 — guess in turns, the range shrinks, don't hit the secret | 2–10 | the simplest turn-based game with a secret |
| ⚡ | **Quick Draw** 快手 — tap on "DRAW!", fastest wins, beware the decoy | 2–8 | real-time play with clock sync |
| #️⃣ | **Lowest Unique** 最小獨特數 — everyone picks 1–7, the smallest unique number scores | 2–12 | simultaneous secret picks |

They are deliberately small: read them, copy them, replace them.

**Two-player classics** (from the app Paper Party grew out of; in-game text is Chinese for now):

| | Game | |
|---|---|---|
| 🎯 | **Paper Sniper** 摺紙狙擊 | draw a dot, fold the paper, slam — stamp the other side's stick figures |
| 🌊 | **Bridge Flick** 過橋 | press and flick rings across a river, knock the other side's off |
| 🤠 | **Cowboy Duel** 牛仔決鬥 | one-on-one quick draw |
| 🧩 | **Puzzle Together** 一起拼圖 | your own photo, any piece count and shape, saved on the server |
| 🐦 | **Blind Flight** 盲飛 | one flies blind, the other sees the map and calls it out (voice chat; can be flown with your voice) |
| 🪢 | **Tug of War** 拔河 | mash to pull, freeze on the whistle |
| ✍️ | **Two-Hand Sketch** 一起一筆畫 | one controls X, the other Y — trace a picture together |
| 🐢 | **Turtle Match** 烏龜對對碰 | same bag of blind boxes, place and cash in better |

They run through the `@sdk/duo` compatibility layer and all have bots — see
[docs/porting-2p-games.md](docs/porting-2p-games.md).

## Quick start

```bash
npm install
npm run dev          # server on :3330 + Vite on :5330
```

Open <http://localhost:5330>. To be a second player on the same computer, open
<http://127.0.0.1:5330> in another tab (a different origin keeps a different name).

Production:

```bash
npm run build
npm start            # one process on :3330 (or $PORT) serving everything
```

Friends on the same Wi-Fi / Tailscale / ZeroTier can join at `http://<your-ip>:3330`. For the internet,
see [docs/deploy.md](docs/deploy.md) (Docker, Render/Railway/Fly, a VPS with Caddy).

## Add your own game

### With an AI agent (recommended)

Open the repo in Claude Code and describe the game:

> *"Add a game for 3–8 players: everyone secretly writes a number, the person closest to two-thirds of the
> average wins the round. Five rounds. Bots should be smarter on hard."*

The `add-game` skill makes the agent design it, scaffold it, write pure rules + a bot, build a mobile UI,
run the tests (which play your game hundreds of times with bots) and try it in a browser with two tabs.
Other agents (Codex, Cursor, Copilot, Gemini…) follow the same workflow through [AGENTS.md](AGENTS.md).

### By hand

```bash
npm run new-game -- space-race --name "太空競賽" --en "Space Race"
```

You get a working mini-game in `src/games/space-race/`, already in the lobby. The rules of a turn-based
game are a handful of pure functions:

```ts
export const logic = defineLogic<State, Action>({
  setup: ({ players, rng }) => ({ sticks: 21, order: players.map((p) => p.id), turn: players[0].id, loser: null }),
  act: (s, a, { playerId }) => {
    if (a.n < 1 || a.n > Math.min(3, s.sticks)) return invalid('take 1–3');
    const sticks = s.sticks - a.n;
    return sticks === 0 ? { ...s, sticks, loser: playerId } : { ...s, sticks, turn: nextPlayer(s.order, s.turn) };
  },
  turn: (s) => (s.loser ? null : s.turn),
  result: (s) => (s.loser ? { winners: s.order.filter((id) => id !== s.loser) } : null),
  bot: (s, { rng }) => ({ type: 'take', n: 1 + Math.floor(rng() * Math.min(3, s.sticks)) }),
});
```

The platform runs them on the host, syncs every player, plays bot seats, resumes after reloads and shows
the game-over card. Guide: [docs/adding-a-game.md](docs/adding-a-game.md) · API: [docs/sdk.md](docs/sdk.md).

## How it works

The server is a post office: it knows rooms, seats and who the host is, and relays messages without
reading them. Game rules run in the browsers — for engine games, in the host's browser, which broadcasts
the state (redacted per player when there are secrets). Bots run on the host too. Details:
[docs/architecture.md](docs/architecture.md).

> Trust model: built for friends. There are no accounts and no anti-cheat; a determined player can read
> the network traffic.

## Project layout

```
server/            relay + rooms (rooms.ts), storage (storage.ts) — no game code
shared/            socket protocol types and limits
src/sdk/           what games import: room bus, state engine, clock, UI kit, i18n, sound
src/platform/      lobby, waiting room, settings, history, connection
src/games/<id>/    one folder per game + registry.ts
templates/         starting points for `npm run new-game`
test/              bot simulations of every game, rule tests, server integration tests
docs/              sdk, adding a game, architecture, deploy, porting 2-player games
.claude/skills/    the add-game skill for AI agents
```

## Contributing

New games are very welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). `npm run check` must pass.

## License

MIT. Sound effects by [Kenney](https://kenney.nl) (CC0). Fonts: Klee One and Noto Sans TC (SIL OFL) via
Google Fonts. Icons: [Lucide](https://lucide.dev) (ISC).
