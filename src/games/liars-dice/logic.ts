// 吹牛骰 / Liar's Dice — pure rules. (Template for: hidden hands, `auto` round transitions, a bot that
// reasons with probabilities.)
//
// Everyone rolls dice in secret. Take turns raising the bid "there are at least Q dice showing F on the
// whole table", or call the last bid a lie. Wrong side of the call loses one die. Last one with dice wins.
import { defineLogic, invalid, nextPlayer, randInt, type Result } from '@sdk/logic';

export interface Options {
  dice: number;
  /** 1s count as any face (unless the bid is on 1s). */
  wild: boolean;
}
export interface Bid {
  by: string;
  q: number;
  f: number;
}
export interface Showdown {
  caller: string;
  bid: Bid;
  /** How many dice actually matched. */
  actual: number;
  loser: string;
}
export interface State {
  order: string[];
  names: Record<string, string>;
  /** Faces 1–6. Other players' dice are [] in your `view` until the showdown. */
  dice: Record<string, number[]>;
  count: Record<string, number>;
  wild: boolean;
  phase: 'bid' | 'reveal';
  turn: string;
  bid: Bid | null;
  /** Bids made this round, oldest first. */
  bids: Bid[];
  last: Showdown | null;
  /** Elimination order. */
  out: string[];
  round: number;
}
export type Action = { type: 'bid'; q: number; f: number } | { type: 'call' } | { type: 'next' };

export const REVEAL_MS = 5200;

const roll = (n: number, rng: () => number) =>
  Array.from({ length: n }, () => randInt(rng, 1, 6)).sort((a, b) => a - b);
export const alive = (s: State) => s.order.filter((id) => s.count[id] > 0);
export const totalDice = (s: State) => alive(s).reduce((n, id) => n + s.count[id], 0);
/** With wild ones, a bid on 1s outranks the same quantity of any other face. */
export const rank = (f: number, wild: boolean) => (wild && f === 1 ? 7 : f);
export const beats = (q: number, f: number, prev: Bid | null, wild: boolean) =>
  !prev || q > prev.q || (q === prev.q && rank(f, wild) > rank(prev.f, wild));
/** Does this die count for a bid on face f? */
export const matches = (die: number, f: number, wild: boolean) => die === f || (wild && f !== 1 && die === 1);

export const logic = defineLogic<State, Action, Options>({
  setup({ players, options, rng }) {
    const n = [3, 4, 5].includes(Number(options.dice)) ? Number(options.dice) : 5;
    const order = players.map((p) => p.id);
    return {
      order,
      names: Object.fromEntries(players.map((p) => [p.id, p.name])),
      dice: Object.fromEntries(order.map((id) => [id, roll(n, rng)])),
      count: Object.fromEntries(order.map((id) => [id, n])),
      wild: options.wild !== false,
      phase: 'bid',
      turn: order[randInt(rng, 0, order.length - 1)],
      bid: null,
      bids: [],
      last: null,
      out: [],
      round: 1,
    };
  },

  act(s, a, { playerId, rng }) {
    if (a.type === 'bid') {
      if (s.phase !== 'bid') return invalid('not bidding now');
      const q = Math.round(a.q);
      const f = Math.round(a.f);
      if (!(f >= 1 && f <= 6) || !(q >= 1 && q <= totalDice(s))) return invalid('bad bid');
      if (!beats(q, f, s.bid, s.wild)) return invalid('must raise the bid');
      const bid = { by: playerId, q, f };
      return { ...s, bid, bids: [...s.bids, bid], turn: nextPlayer(s.order, s.turn, (id) => s.count[id] === 0) };
    }
    if (a.type === 'call') {
      if (s.phase !== 'bid' || !s.bid) return invalid('nothing to call');
      const bid = s.bid;
      const actual = alive(s).reduce((n, id) => n + s.dice[id].filter((d) => matches(d, bid.f, s.wild)).length, 0);
      const loser = actual >= bid.q ? playerId : bid.by;
      const count = { ...s.count, [loser]: s.count[loser] - 1 };
      return {
        ...s,
        count,
        out: count[loser] === 0 ? [...s.out, loser] : s.out,
        phase: 'reveal',
        last: { caller: playerId, bid, actual, loser },
      };
    }
    if (a.type === 'next') {
      if (s.phase !== 'reveal' || !s.last) return invalid('not now');
      const loser = s.last.loser;
      const starter = s.count[loser] > 0 ? loser : nextPlayer(s.order, loser, (id) => s.count[id] === 0);
      return {
        ...s,
        dice: Object.fromEntries(s.order.map((id) => [id, roll(s.count[id], rng)])),
        phase: 'bid',
        turn: starter,
        bid: null,
        bids: [],
        round: s.round + 1,
      };
    }
    return invalid('unknown action');
  },

  turn: (s) => (s.phase === 'bid' && alive(s).length > 1 ? s.turn : null),

  auto: (s) => (s.phase === 'reveal' && alive(s).length > 1 ? { after: REVEAL_MS, action: { type: 'next' } } : null),

  result(s): Result | null {
    const left = alive(s);
    if (left.length > 1) return null;
    return {
      winners: left,
      ranking: [...left, ...[...s.out].reverse()],
      scores: Object.fromEntries(s.order.map((id) => [id, `🎲${s.count[id]}`])),
    };
  },

  // Your own dice only — until the showdown, when every cup is lifted.
  view: (s, me) => (s.phase === 'reveal' ? s : { ...s, dice: Object.fromEntries(s.order.map((id) => [id, id === me ? s.dice[id] : []])) }),

  bot(s, { playerId, level, rng }) {
    const mine = s.dice[playerId] ?? [];
    const unknown = totalDice(s) - mine.length;
    const p = (f: number) => (s.wild && f !== 1 ? 1 / 3 : 1 / 6);
    const have = (f: number) => mine.filter((d) => matches(d, f, s.wild)).length;
    /** Probability that the table has at least q of face f, from what this bot knows. */
    const chance = (q: number, f: number) => binomialAtLeast(unknown, p(f), q - have(f));
    const noise = [0.22, 0.1, 0.03][level];

    if (s.bid) {
      const truth = chance(s.bid.q, s.bid.f);
      const threshold = [0.3, 0.38, 0.45][level];
      if (truth + (rng() * 2 - 1) * noise < threshold) return { type: 'call' };
    }
    // Candidate raises: the smallest legal quantity for every face, plus one step more.
    const options: { q: number; f: number; score: number }[] = [];
    for (let f = 1; f <= 6; f++) {
      let q = s.bid ? s.bid.q : 1;
      while (!beats(q, f, s.bid, s.wild)) q++;
      for (const qq of [q, q + 1]) {
        if (qq > totalDice(s)) continue;
        // Likely bids score high; easy bots bluff more.
        options.push({ q: qq, f, score: chance(qq, f) + rng() * noise * 2 + (have(f) > 0 ? 0.02 * have(f) : 0) });
      }
    }
    if (!options.length) return { type: 'call' };
    options.sort((x, y) => y.score - x.score);
    const pickTop = level === 0 ? Math.min(options.length, 3) : 1;
    const choice = options[Math.floor(rng() * pickTop)];
    // Nothing plausible left: call instead of bidding into a lie (if there is a bid to call).
    if (s.bid && choice.score < 0.2) return { type: 'call' };
    return { type: 'bid', q: choice.q, f: choice.f };
  },
  botDelay: [1100, 2200],
});

/** P(X ≥ k) for X ~ Binomial(n, p). */
export function binomialAtLeast(n: number, p: number, k: number) {
  if (k <= 0) return 1;
  if (k > n) return 0;
  let sum = 0;
  let term = Math.pow(1 - p, n); // P(X = 0)
  for (let i = 0; i <= n; i++) {
    if (i >= k) sum += term;
    term = (term * (n - i) * p) / ((i + 1) * (1 - p));
  }
  return Math.min(1, sum);
}
