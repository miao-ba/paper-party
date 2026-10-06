// 最小獨特數 / Lowest Unique — pure rules. (Template for: simultaneous secret picks, then a reveal.)
//
// Every round, everyone secretly picks a number 1–7. The SMALLEST number that nobody else picked wins,
// and its owner scores that many points. Pick 1 and you are safe-ish but earn 1; pick 6 and you may get 6…
// or collide with someone. Most points after the last round wins.
import { defineLogic, invalid, type Result } from '@sdk/logic';

export const MAX_PICK = 7;
export const REVEAL_MS = 4200;

export interface Options {
  rounds: number;
}
export interface RoundLog {
  picks: Record<string, number>;
  winner: string | null;
  value: number;
}
export interface State {
  order: string[];
  round: number;
  rounds: number;
  phase: 'pick' | 'reveal' | 'done';
  /** null = not picked yet. In your `view` other people's picks are 0 ("picked, secret") until the reveal. */
  picks: Record<string, number | null>;
  scores: Record<string, number>;
  log: RoundLog[];
}
export type Action = { type: 'pick'; n: number } | { type: 'next' };

/** The smallest number picked exactly once, and who picked it. */
export function lowestUnique(picks: Record<string, number>): { winner: string | null; value: number } {
  const counts = new Map<number, string[]>();
  for (const [id, n] of Object.entries(picks)) counts.set(n, [...(counts.get(n) ?? []), id]);
  const unique = [...counts.entries()].filter(([, ids]) => ids.length === 1).sort((a, b) => a[0] - b[0]);
  return unique.length ? { winner: unique[0][1][0], value: unique[0][0] } : { winner: null, value: 0 };
}

export const logic = defineLogic<State, Action, Options>({
  setup({ players, options }) {
    const order = players.map((p) => p.id);
    return {
      order,
      round: 1,
      rounds: [3, 5, 8].includes(Number(options.rounds)) ? Number(options.rounds) : 5,
      phase: 'pick',
      picks: Object.fromEntries(order.map((id) => [id, null])),
      scores: Object.fromEntries(order.map((id) => [id, 0])),
      log: [],
    };
  },

  act(s, a, { playerId }) {
    if (a.type === 'pick') {
      if (s.phase !== 'pick') return invalid('not picking now');
      if (s.picks[playerId] !== null) return invalid('already picked');
      const n = Math.round(a.n);
      if (!(n >= 1 && n <= MAX_PICK)) return invalid('pick 1–7');
      const picks = { ...s.picks, [playerId]: n };
      if (s.order.some((id) => picks[id] === null)) return { ...s, picks };
      // Everyone has picked: reveal and score.
      const final = picks as Record<string, number>;
      const { winner, value } = lowestUnique(final);
      return {
        ...s,
        picks,
        phase: 'reveal',
        scores: winner ? { ...s.scores, [winner]: s.scores[winner] + value } : s.scores,
        log: [...s.log, { picks: final, winner, value }],
      };
    }
    if (a.type === 'next') {
      if (s.phase !== 'reveal') return invalid('not now');
      if (s.round >= s.rounds) return { ...s, phase: 'done' };
      return { ...s, round: s.round + 1, phase: 'pick', picks: Object.fromEntries(s.order.map((id) => [id, null])) };
    }
    return invalid('unknown action');
  },

  // Simultaneous: everyone who has not picked yet may act.
  turn: (s) => (s.phase === 'pick' ? s.order.filter((id) => s.picks[id] === null) : null),

  auto: (s) => (s.phase === 'reveal' ? { after: REVEAL_MS, action: { type: 'next' } } : null),

  result(s): Result | null {
    if (s.phase !== 'done') return null;
    const best = Math.max(...s.order.map((id) => s.scores[id]));
    return {
      winners: s.order.filter((id) => s.scores[id] === best),
      ranking: [...s.order].sort((a, b) => s.scores[b] - s.scores[a]),
      scores: s.scores,
    };
  },

  view: (s, me) =>
    s.phase === 'pick' ? { ...s, picks: Object.fromEntries(s.order.map((id) => [id, id === me || s.picks[id] === null ? s.picks[id] : 0])) } : s,

  bot(s, { playerId, level, rng }) {
    if (s.phase !== 'pick' || s.picks[playerId] !== null) return null;
    const p = s.order.length;
    // Easy: anything. Normal: likes the middle. Hard: weighs value against collision risk for this table size.
    const weights = Array.from({ length: MAX_PICK }, (_, i) => {
      const n = i + 1;
      if (level === 0) return 1;
      if (level === 1) return [3, 4, 4, 3, 2, 1, 1][i];
      return Math.sqrt(n) * Math.exp(-n / (0.9 * p + 0.6));
    });
    let r = rng() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) return { type: 'pick', n: i + 1 };
    }
    return { type: 'pick', n: 1 };
  },
  botDelay: [800, 2600],
});
