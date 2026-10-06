// 終極密碼 / Bomb Number — the pure rules. (Template for: turn-based + a hidden secret via `view`.)
//
// A secret number between 1 and max. Players take turns guessing; every miss narrows the range.
// Whoever guesses the secret "steps on the bomb" and loses; everyone else wins.
import { defineLogic, invalid, nextPlayer, pick, randInt, type Result } from '@sdk/logic';

export interface Options {
  max: number;
}
export interface Guess {
  by: string;
  n: number;
}
export interface State {
  /** Valid guesses are lo+1 … hi-1. */
  lo: number;
  hi: number;
  /** null for everyone until somebody hits it (see `view`). */
  secret: number | null;
  order: string[];
  names: Record<string, string>;
  turn: string;
  history: Guess[];
  /** Who hit the bomb. */
  loser: string | null;
}
export type Action = { type: 'guess'; n: number };

export const MAX_CHOICES = [50, 100, 1000];

export const logic = defineLogic<State, Action, Options>({
  setup({ players, options, rng }) {
    const max = MAX_CHOICES.includes(Number(options.max)) ? Number(options.max) : 100;
    const order = players.map((p) => p.id);
    return {
      lo: 0,
      hi: max + 1,
      secret: randInt(rng, 1, max),
      order,
      names: Object.fromEntries(players.map((p) => [p.id, p.name])),
      turn: pick(rng, order),
      history: [],
      loser: null,
    };
  },

  act(s, a, { playerId }) {
    if (a.type !== 'guess') return invalid('unknown action');
    const n = Math.round(Number(a.n));
    if (!(n > s.lo && n < s.hi)) return invalid(`guess must be between ${s.lo + 1} and ${s.hi - 1}`);
    const history = [...s.history, { by: playerId, n }];
    if (n === s.secret) return { ...s, history, loser: playerId };
    return {
      ...s,
      history,
      lo: n < s.secret! ? n : s.lo,
      hi: n > s.secret! ? n : s.hi,
      turn: nextPlayer(s.order, s.turn),
    };
  },

  turn: (s) => (s.loser ? null : s.turn),

  result(s): Result | null {
    if (!s.loser) return null;
    return {
      winners: s.order.filter((id) => id !== s.loser),
      headline: { 'zh-TW': `💣 ${s.names[s.loser]} 踩到炸彈 ${s.secret}！`, en: `💣 ${s.names[s.loser]} hit the bomb: ${s.secret}!` },
    };
  },

  // Nobody sees the secret until it explodes. Bots get this view too, so they cannot cheat.
  view: (s) => (s.loser ? s : { ...s, secret: null }),

  bot(s, { playerId, rng, players }) {
    const lo = s.lo + 1;
    const hi = s.hi - 1;
    // Three personalities by seat: random, splits the range, nibbles the edges.
    const style = (players.find((p) => p.id === playerId)?.index ?? 0) % 3;
    if (style === 0 || hi - lo < 3) return { type: 'guess', n: randInt(rng, lo, hi) };
    if (style === 1) {
      const mid = (lo + hi) / 2;
      const spread = (hi - lo) / 6;
      return { type: 'guess', n: Math.max(lo, Math.min(hi, Math.round(mid + (rng() * 2 - 1) * spread))) };
    }
    return { type: 'guess', n: rng() < 0.5 ? lo + randInt(rng, 0, 2) : hi - randInt(rng, 0, 2) };
  },
  botDelay: [900, 1800],
});
