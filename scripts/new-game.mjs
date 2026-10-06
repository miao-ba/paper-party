#!/usr/bin/env node
// Scaffold a new game from a template and register it.
//
//   npm run new-game -- my-game                       turn-based (state engine), the default
//   npm run new-game -- my-game --type realtime       message-based real-time game
//   npm run new-game -- my-game --name "我的遊戲" --en "My Game"
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const id = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const type = flag('type', 'turn');

const fail = (msg) => {
  console.error(`\n✖ ${msg}\n\nUsage: npm run new-game -- <id> [--type turn|realtime] [--name "名稱"] [--en "English name"]\n`);
  process.exit(1);
};
if (!id) fail('Give the game an id, e.g. `npm run new-game -- space-race`.');
if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(id)) fail(`"${id}" is not kebab-case (lowercase letters, digits and dashes).`);

const templates = path.join(root, 'templates');
const kinds = fs.readdirSync(templates).filter((d) => fs.statSync(path.join(templates, d)).isDirectory());
if (!kinds.includes(type)) fail(`Unknown --type "${type}". Available: ${kinds.join(', ')}.`);

const dest = path.join(root, 'src', 'games', id);
if (fs.existsSync(dest)) fail(`src/games/${id} already exists.`);

const title = id.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
const camel = id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const tokens = {
  __ID__: id,
  __EXPORT__: /^[0-9]/.test(camel) ? `game${camel}` : camel,
  __NAME__: flag('name', title),
  __EN__: flag('en', title),
};
const fill = (text) => Object.entries(tokens).reduce((t, [k, v]) => t.split(k).join(v), text);

fs.mkdirSync(dest, { recursive: true });
for (const file of fs.readdirSync(path.join(templates, type))) {
  fs.writeFileSync(path.join(dest, file), fill(fs.readFileSync(path.join(templates, type, file), 'utf8')));
}

// Register it.
const registry = path.join(root, 'src', 'games', 'registry.ts');
let reg = fs.readFileSync(registry, 'utf8');
const importMark = '// @new-game-import';
const entryMark = '  // @new-game-entry';
if (!reg.includes(importMark) || !reg.includes(entryMark)) {
  console.warn('! registry.ts has no scaffolder markers; add the import and the array entry by hand.');
} else {
  reg = reg.replace(importMark, `import { ${tokens.__EXPORT__} } from './${id}';\n${importMark}`);
  reg = reg.replace(entryMark, `  ${tokens.__EXPORT__},\n${entryMark}`);
  fs.writeFileSync(registry, reg);
}

console.log(`
✔ Created src/games/${id}/ from the "${type}" template and added it to src/games/registry.ts

Next:
  1. Edit src/games/${id}/index.ts      name, tagline, icon, players, howto, options
  2. Write the rules                    ${type === 'turn' ? `src/games/${id}/logic.ts (pure functions + bot)` : `src/games/${id}/logic.ts (messages) + bot.ts`}
  3. Draw it                            src/games/${id}/Game.tsx
  4. Check                              npm run check     (typecheck + tests that play your game with bots + build)
  5. Play it                            npm run dev → open two tabs (localhost and 127.0.0.1)

Guide: docs/adding-a-game.md  ·  API: docs/sdk.md
`);
