// __NAME__ — the rules, as pure functions. No React, no DOM, no network: this file also runs in Node
// (`npm test` plays whole games with your bot to make sure they always end).
//
// Template game: "Last Stick". A pile of sticks; on your turn take 1, 2 or 3. Whoever takes the last
// stick loses. Replace it with your own rules — keep the shape: setup / act / turn / result / bot.
import { defineLogic, invalid, nextPlayer, pick, type Result } from '@sdk/logic';

/** Host settings from meta.options (index.ts). */
export interface Options {
  sticks: number;
}

/** Everything needed to draw the game. Must be plain JSON (no Map / Set / class / undefined). */
export interface State {
  sticks: number;
  order: string[];
  turn: string;
  last: { by: string; took: number } | null;
  loser: string | null;
}

/** What a player can do. One discriminated union, `type` first. */
export type Action = { type: 'take'; n: number };

export const logic = defineLogic<State, Action, Options>({
  // Called once on the host when the game starts.
  setup({ players, options, rng }) {
    const order = players.map((p) => p.id);
    return { sticks: Number(options.sticks) || 21, order, turn: pick(rng, order), last: null, loser: null };
  },

  // Return a NEW state (never mutate). Throw via invalid() to reject. The engine already checks turn().
  act(s, a, { playerId }) {
    if (a.type !== 'take') return invalid('unknown action');
    if (!Number.isInteger(a.n) || a.n < 1 || a.n > Math.min(3, s.sticks)) return invalid('take 1–3 sticks');
    const sticks = s.sticks - a.n;
    const last = { by: playerId, took: a.n };
    if (sticks === 0) return { ...s, sticks, last, loser: playerId };
    return { ...s, sticks, last, turn: nextPlayer(s.order, s.turn) };
  },

  // Who may act now. null = nobody (game over, or waiting for an `auto` action).
  turn: (s) => (s.loser ? null : s.turn),

  // Non-null ends the match: every client records it and <GameOver> shows it.
  result: (s): Result | null => (s.loser ? { winners: s.order.filter((id) => id !== s.loser) } : null),

  // Hidden information? Add `view(state, playerId)` that blanks out what this player must not see.
  // view: (s, me) => ({ ...s, hands: { [me]: s.hands[me] } }),

  // The bot plays bot seats (and seats of players who left). It gets the same view a player would.
  bot(s, { level, rng }) {
    const max = Math.min(3, s.sticks);
    // Perfect play leaves the next player 1 more than a multiple of 4.
    const smart = (s.sticks - 1) % 4;
    const useSmart = smart >= 1 && smart <= max && rng() < [0.2, 0.6, 1][level];
    return { type: 'take', n: useSmart ? smart : 1 + Math.floor(rng() * max) };
  },
});
