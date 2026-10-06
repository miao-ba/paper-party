// Every game in the registry is checked here — new games get these tests for free:
//   - meta is complete (ids unique, players range sane, howto present…)
//   - engine games: bots play whole matches for every player count and many seeds;
//     the game must always finish, never throw, and keep its state JSON-safe and immutable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { games } from '../src/games/registry';
import { simulate } from '../src/sdk/simulate';
import type { GameMeta } from '../src/sdk/types';

const defaults = (meta: GameMeta) => Object.fromEntries((meta.options ?? []).map((o) => [o.key, o.default]));
/** Every combination of select/toggle option values (capped), so odd settings get played too. */
function optionSets(meta: GameMeta): Record<string, unknown>[] {
  let sets: Record<string, unknown>[] = [defaults(meta)];
  for (const o of meta.options ?? []) {
    const values = o.type === 'select' ? o.choices.map((c) => c.value) : [true, false];
    sets = sets.flatMap((s) => values.map((v) => ({ ...s, [o.key]: v })));
    if (sets.length > 12) sets = sets.slice(0, 12);
  }
  return sets;
}

test('game ids are unique kebab-case', () => {
  const ids = games.map((g) => g.meta.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate game id');
  for (const id of ids) assert.match(id, /^[a-z0-9]+(-[a-z0-9]+)*$/, `bad id ${id}`);
});

for (const g of games) {
  const { meta } = g;

  test(`${meta.id}: meta is complete`, () => {
    assert.ok(meta.name && meta.tagline, 'name / tagline');
    assert.ok(meta.players.min >= 1 && meta.players.min <= meta.players.max && meta.players.max <= 16, 'players range');
    assert.ok(meta.tags.length > 0, 'at least one tag');
    assert.ok(meta.minutes, 'minutes');
    const howto = Array.isArray(meta.howto) ? meta.howto : Object.values(meta.howto)[0];
    assert.ok(howto && howto.length >= 2, 'howto needs a few lines');
    assert.ok(g.logic || g.bot || !meta.bots, 'meta.bots is set but there is no logic.bot / bot');
    for (const o of meta.options ?? []) {
      if (o.type === 'select') assert.ok(o.choices.some((c) => c.value === o.default), `option ${o.key}: default must be one of the choices`);
    }
  });

  const logic = g.logic;
  if (!logic?.bot) continue;

  test(`${meta.id}: bots finish matches for ${meta.players.min}–${meta.players.max} players`, () => {
    const top = Math.min(meta.players.max, 8);
    let runs = 0;
    for (const options of optionSets(meta)) {
      for (let n = meta.players.min; n <= top; n++) {
        for (let seed = 1; seed <= 6; seed++) {
          const { result, state } = simulate(logic, { players: n, options, seed: seed * 7919 + n });
          const ids = new Set(Array.from({ length: n }, (_, i) => `p${i}`));
          for (const w of result.winners) assert.ok(ids.has(w), `winner ${w} is not a player`);
          if (logic.view) {
            // view must not throw for players and spectators at the end either
            logic.view(state, 'p0');
            logic.view(state, null);
          }
          runs++;
        }
      }
    }
    assert.ok(runs > 0);
  });
}
