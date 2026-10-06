// 快手 / Quick Draw — pure helpers for a real-time game. (Template for: message-based games where the host
// schedules events on its clock, everyone measures locally, and the host announces results.)

export const DRAW_DELAY = { min: 1600, max: 5200 }; // after the round starts
export const FAKE_CHANCE = 0.35; // a decoy signal before the real one
export const NO_SHOT_MS = 2500; // after "DRAW!" the round is resolved anyway
export const RESULT_HOLD_MS = 2600;

export interface Shot {
  /** Reaction time in ms, measured on the player's own device. */
  ms: number;
  /** Tapped before "DRAW!" (or on the decoy). */
  early: boolean;
}

export type Msg =
  | { t: 'qd:ready' }
  /** Host → all: next round. Times are the HOST's performance.now(). */
  | { t: 'qd:round'; n: number; drawAt: number; fakeAt: number | null }
  | { t: 'qd:shot'; n: number; shot: Shot }
  /** Host → all: the official outcome of round n. */
  | { t: 'qd:result'; n: number; shots: Record<string, Shot>; winner: string | null; scores: Record<string, number>; over: boolean }
  /** Rejoining player asks the host where we are. */
  | { t: 'qd:hello' }
  | { t: 'qd:state'; ready: string[]; scores: Record<string, number>; n: number };

/** Fastest clean shot wins; ties and "nobody" give no point. */
export function winnerOf(shots: Record<string, Shot>): string | null {
  let best: string | null = null;
  let tie = false;
  for (const [id, s] of Object.entries(shots)) {
    if (s.early) continue;
    if (best === null || s.ms < shots[best].ms) {
      best = id;
      tie = false;
    } else if (s.ms === shots[best].ms) tie = true;
  }
  return tie ? null : best;
}

export function ranking(scores: Record<string, number>) {
  return Object.keys(scores).sort((a, b) => scores[b] - scores[a]);
}
