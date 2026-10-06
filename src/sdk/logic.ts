// Pure game-logic contract for the state engine (useGameState). No React, no DOM, no network:
// this file and your game's logic.ts must run in Node too (tests simulate whole games with bots).
//
// How the engine uses it (see docs/sdk.md):
//   host: state = setup() → every action: state = act(state, action) → broadcast state (or view per player)
//   everyone else: sends actions to the host, renders what the host broadcasts.
import type { Localized } from './i18n';

/** A seat as the logic sees it. Seats are fixed when the game starts. */
export interface SeatInfo {
  id: string;
  name: string;
  avatar: string | null;
  /** Seat order among players, 0-based. */
  index: number;
  /** Seat colour (CSS colour) — use it for this player's pieces. */
  color: string;
  bot: boolean;
  /** Bot difficulty 0 easy / 1 normal / 2 hard (also 1 for humans). */
  level: 0 | 1 | 2;
}

/** Pseudo-random number in [0, 1). The engine passes Math.random; tests pass a seeded one. */
export type Rng = () => number;

export interface SetupCtx<O> {
  players: SeatInfo[];
  options: O;
  rng: Rng;
}
export interface ActCtx {
  /** Who sent the action. SYSTEM for actions scheduled by `auto`. */
  playerId: string;
  players: SeatInfo[];
  rng: Rng;
  now: number;
}
export interface LogicBotCtx {
  playerId: string;
  level: 0 | 1 | 2;
  players: SeatInfo[];
  rng: Rng;
}

/** End of a match. Every client stores it in its local history and <GameOver> renders it. */
export interface Result {
  /** Player ids. Empty + not coop = draw. */
  winners: string[];
  /** Optional best-first order of all players (shown on the game-over card). */
  ranking?: string[];
  /** Optional score per player id (shown next to names). */
  scores?: Record<string, number | string>;
  /** Everyone is on one team; `value` is the team score. */
  coop?: boolean;
  /** A comparable number for solo / co-op bests (higher = better). */
  value?: number;
  /** Optional custom headline, e.g. "💣 Amy hit the bomb!" */
  headline?: Localized;
}

export const SYSTEM = '$system';

export interface GameLogic<S, A, O = Record<string, unknown>> {
  /** Initial state. Called on the host when a game starts. */
  setup(ctx: SetupCtx<O>): S;
  /**
   * Apply one action and return the NEW state (do not mutate). Throw (e.g. `invalid('not your turn')`) to
   * reject it; returning the same object also means "nothing happened".
   */
  act(state: S, action: A, ctx: ActCtx): S;
  /**
   * Who may act now: one id, several ids (simultaneous turns), or null (nobody / waiting for `auto`).
   * When defined, the engine rejects actions from anyone else, and bots act when it is their turn.
   */
  turn?(state: S): string | string[] | null;
  /** Return a Result when the match is over (the engine reports it once). */
  result?(state: S): Result | null;
  /**
   * Hide secrets (other players' cards, the bomb number…). Called on the host for each recipient;
   * playerId is null for spectators. Without `view`, everyone receives the full state.
   */
  view?(state: S, playerId: string | null): S;
  /**
   * The bot's move when it is its turn. Receives `view(state, botId)` if you defined `view` —
   * bots cannot peek. Return null to pass on this tick.
   */
  bot?(state: S, ctx: LogicBotCtx): A | null | undefined;
  /** A system action the host should fire after `after` ms (round transitions, timers). */
  auto?(state: S): { after: number; action: A } | null;
  /** Bot "thinking time" range in ms. Default [700, 1500]. */
  botDelay?: [number, number];
  /**
   * A player left mid-game and there is no `bot` to take the seat over. Return the new state
   * (e.g. remove them). Without `bot` and `leave`, the room goes back to the waiting room.
   */
  leave?(state: S, playerId: string, ctx: ActCtx): S;
}

/** Identity helper that gives you type inference. */
export function defineLogic<S, A, O = Record<string, unknown>>(logic: GameLogic<S, A, O>): GameLogic<S, A, O> {
  return logic;
}

/** Throw this from `act` to reject an action. */
export class InvalidAction extends Error {}
export const invalid = (why = 'invalid action'): never => {
  throw new InvalidAction(why);
};

// ---------------------------------------------------------------- randomness helpers

/** Seeded RNG (mulberry32) — for tests and for "same random sequence on every client" tricks. */
export function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Integer in [lo, hi] inclusive. */
export const randInt = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
export const pick = <T>(rng: Rng, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];
export function shuffle<T>(rng: Rng, arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
/** Standard normal sample (Box–Muller). Handy for "human-like" bot noise. */
export function gauss(rng: Rng = Math.random) {
  const u = Math.max(1e-9, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Next id in seat order after `id` (wraps), skipping ids for which `skip` returns true. */
export function nextPlayer(order: readonly string[], id: string, skip: (id: string) => boolean = () => false): string {
  const i = order.indexOf(id);
  for (let k = 1; k <= order.length; k++) {
    const c = order[(i + k) % order.length];
    if (!skip(c)) return c;
  }
  return id;
}

/** Normalise `turn()` output to an array. */
export const turnList = (t: string | string[] | null | undefined): string[] => (t == null ? [] : Array.isArray(t) ? t : [t]);

// ---------------------------------------------------------------- bot helpers (message-based bots)

export const between = (a: number, b: number, rng: Rng = Math.random) => a + rng() * (b - a);
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Schedule one thing at a time: the same key never re-schedules (unrelated messages do not reset the
 * timer); a new key cancels the old one. For turn-based message bots: call think() on every message.
 */
export function oneAtATime(ctx: { later: (fn: () => void, ms: number) => number; cancel: (id: number) => void }) {
  let id = 0;
  let current = '';
  return {
    run(key: string, fn: () => void, ms: number) {
      if (key === current) return;
      ctx.cancel(id);
      current = key;
      id = ctx.later(() => {
        current = '';
        fn();
      }, ms);
    },
    clear() {
      ctx.cancel(id);
      current = '';
    },
  };
}

/** A bot that does nothing (co-op games where the "other player" is not needed). */
export const silentBot = () => ({ onMessage() {} });
