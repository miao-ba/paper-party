# CLAUDE.md

Read `AGENTS.md` first — it has the commands, boundaries and style for this repo.

- Adding or porting a game → use the **add-game** skill (`.claude/skills/add-game/SKILL.md`). It covers
  design, scaffolding, rules, bot, UI, tests and browser verification.
- Preview: `.claude/launch.json` → `dev` (Vite on 5330, server on 3330). Second player = a tab on
  `http://127.0.0.1:5330`. Bring the tab you inspect to the front (background tabs throttle).
- Before saying something works: `npm run check` and play it in the preview. Report what you could not test.
