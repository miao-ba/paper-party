// __NAME__ — pure helpers and the message format for a real-time game.
//
// Template game: "Tap Race". Everyone mashes the button; first to GOAL taps wins.
// Pattern: the HOST is the referee. It schedules the start on its own clock (`useHostClock`), everyone
// counts their own taps and broadcasts them, and only the host announces the winner.

export const GOAL = 40;
export const COUNTDOWN_MS = 3000;

/** All messages of this game. Prefix `t` with something unique to the game. */
export type Msg =
  | { t: 'tr:ready' }
  /** host → all: the race starts at `at` (host's performance.now()). */
  | { t: 'tr:start'; at: number }
  | { t: 'tr:count'; n: number }
  /** host → all: official result. */
  | { t: 'tr:win'; winner: string; counts: Record<string, number> };

/** Player ids ordered by taps, most first. */
export const standings = (counts: Record<string, number>) => Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
