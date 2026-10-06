// Hand-written rule tests for the example games. Copy this style for your own game's tricky rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSeats } from '../src/sdk/simulate';
import { SYSTEM, seeded, type ActCtx } from '../src/sdk/logic';
import * as bomb from '../src/games/bomb-number/logic';
import * as dice from '../src/games/liars-dice/logic';
import * as lu from '../src/games/lowest-unique/logic';
import * as qd from '../src/games/quick-draw/logic';

const ctx = (playerId: string, n = 3): ActCtx => ({ playerId, players: makeSeats(n), rng: seeded(1), now: 0 });

test('bomb-number: a miss narrows the range, a hit ends the game', () => {
  const s0 = bomb.logic.setup({ players: makeSeats(3), options: { max: 100 }, rng: seeded(3) });
  const secret = s0.secret!;
  const first = s0.turn;
  const miss = secret > 1 ? secret - 1 : secret + 1;
  const s1 = bomb.logic.act(s0, { type: 'guess', n: miss }, ctx(first));
  assert.ok(s1.lo === miss || s1.hi === miss, 'range moved to the guess');
  assert.notEqual(s1.turn, first, 'turn passed on');
  assert.throws(() => bomb.logic.act(s1, { type: 'guess', n: miss }, ctx(s1.turn)), 'guess outside the range is rejected');
  const s2 = bomb.logic.act(s1, { type: 'guess', n: secret }, ctx(s1.turn));
  assert.equal(s2.loser, s1.turn);
  const r = bomb.logic.result!(s2)!;
  assert.equal(r.winners.length, 2);
  assert.ok(!r.winners.includes(s1.turn));
});

test('bomb-number: view hides the secret until it explodes', () => {
  const s = bomb.logic.setup({ players: makeSeats(2), options: { max: 50 }, rng: seeded(9) });
  assert.equal(bomb.logic.view!(s, 'p0').secret, null);
  assert.equal(bomb.logic.view!({ ...s, loser: 'p0' }, 'p1').secret, s.secret);
});

test("liars-dice: bid ordering with wild ones", () => {
  const prev = { by: 'p0', q: 3, f: 5 };
  assert.ok(dice.beats(3, 6, prev, true));
  assert.ok(dice.beats(3, 1, prev, true), '1s outrank other faces at the same quantity when wild');
  assert.ok(!dice.beats(3, 4, prev, true));
  assert.ok(dice.beats(4, 2, prev, true));
  assert.ok(!dice.beats(3, 1, prev, false), 'without wilds, 1 is the lowest face');
});

test('liars-dice: calling resolves against the real dice', () => {
  const s0 = dice.logic.setup({ players: makeSeats(2), options: { dice: 3, wild: true }, rng: seeded(5) });
  const s = { ...s0, turn: 'p0', dice: { p0: [1, 5, 5], p1: [2, 5, 6] } };
  const bid = dice.logic.act(s, { type: 'bid', q: 4, f: 5 }, ctx('p0', 2)); // there are 3 fives + one wild 1 = 4
  const called = dice.logic.act(bid, { type: 'call' }, ctx('p1', 2));
  assert.equal(called.last!.actual, 4);
  assert.equal(called.last!.loser, 'p1', 'the bid was true, so the caller loses');
  assert.equal(called.count.p1, 2);
  const next = dice.logic.act(called, { type: 'next' }, ctx(SYSTEM, 2));
  assert.equal(next.phase, 'bid');
  assert.equal(next.dice.p1.length, 2);
  assert.equal(next.turn, 'p1', 'the loser starts the next round');
});

test('liars-dice: binomial tail', () => {
  assert.equal(dice.binomialAtLeast(10, 0.5, 0), 1);
  assert.equal(dice.binomialAtLeast(3, 0.5, 4), 0);
  assert.ok(Math.abs(dice.binomialAtLeast(2, 0.5, 1) - 0.75) < 1e-9);
});

test('lowest-unique: smallest number picked exactly once wins', () => {
  assert.deepEqual(lu.lowestUnique({ a: 1, b: 1, c: 3, d: 2 }), { winner: 'd', value: 2 });
  assert.deepEqual(lu.lowestUnique({ a: 4, b: 4 }), { winner: null, value: 0 });
  let s = lu.logic.setup({ players: makeSeats(3), options: { rounds: 3 }, rng: seeded(1) });
  s = lu.logic.act(s, { type: 'pick', n: 2 }, ctx('p0'));
  assert.equal(s.phase, 'pick');
  assert.deepEqual(lu.logic.view!(s, 'p1').picks, { p0: 0, p1: null, p2: null }, 'others see "picked", not the number');
  s = lu.logic.act(s, { type: 'pick', n: 2 }, ctx('p1'));
  s = lu.logic.act(s, { type: 'pick', n: 5 }, ctx('p2'));
  assert.equal(s.phase, 'reveal');
  assert.equal(s.scores.p2, 5);
});

test('quick-draw: fastest clean shot wins, ties and fouls do not', () => {
  assert.equal(qd.winnerOf({ a: { ms: 300, early: false }, b: { ms: 250, early: false } }), 'b');
  assert.equal(qd.winnerOf({ a: { ms: 300, early: false }, b: { ms: -1, early: true } }), 'a');
  assert.equal(qd.winnerOf({ a: { ms: 300, early: false }, b: { ms: 300, early: false } }), null);
  assert.equal(qd.winnerOf({ a: { ms: -1, early: true } }), null);
});
