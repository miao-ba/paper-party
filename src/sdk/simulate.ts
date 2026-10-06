// Headless runner: plays a whole game with bots only. Used by `npm test` for every game that has a
// `logic` with a `bot`, so a new game is checked for "always finishes, never throws, state is JSON".
import { SYSTEM, seeded, turnList, type GameLogic, type Result, type SeatInfo } from './logic';
import { seatColor } from './colors';

export interface SimOptions<O> {
  players?: number;
  options?: O;
  seed?: number;
  maxSteps?: number;
  /** Bot level for every seat (default: mixed 0/1/2). */
  level?: 0 | 1 | 2;
}
export interface SimResult<S> {
  state: S;
  result: Result;
  steps: number;
}

export function makeSeats(n: number, level?: 0 | 1 | 2): SeatInfo[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    avatar: null,
    index: i,
    color: seatColor(i),
    bot: true,
    level: level ?? ((i % 3) as 0 | 1 | 2),
  }));
}

function deepFreeze<T>(v: T): T {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v)) deepFreeze((v as Record<string, unknown>)[k]);
  }
  return v;
}
/** State travels as JSON: Map/Set/undefined/class instances would silently break on the wire. */
const wire = <T>(v: T): T => deepFreeze(JSON.parse(JSON.stringify(v)) as T);

export function simulate<S, A, O>(logic: GameLogic<S, A, O>, opts: SimOptions<O> = {}): SimResult<S> {
  const rng = seeded(opts.seed ?? 1);
  const players = makeSeats(opts.players ?? 3, opts.level);
  const maxSteps = opts.maxSteps ?? 5000;
  let state = wire(logic.setup({ players, options: (opts.options ?? {}) as O, rng }));
  let now = 0;
  for (let steps = 0; steps < maxSteps; steps++) {
    const result = logic.result?.(state);
    if (result) return { state, result, steps };
    let next: S | null = null;
    for (const id of turnList(logic.turn?.(state))) {
      const seat = players.find((p) => p.id === id);
      if (!seat || !logic.bot) continue;
      const seen = logic.view ? wire(logic.view(state, id)) : state;
      const action = logic.bot(seen, { playerId: id, level: seat.level, players, rng });
      if (action == null) continue;
      next = logic.act(state, wire(action), { playerId: id, players, rng, now });
      break;
    }
    if (next === null) {
      const auto = logic.auto?.(state);
      if (!auto) throw new Error(`stuck after ${steps} steps: nobody can act and there is no auto action`);
      now += auto.after;
      next = logic.act(state, wire(auto.action), { playerId: SYSTEM, players, rng, now });
    }
    now += 500;
    state = wire(next);
  }
  throw new Error(`game did not finish in ${maxSteps} steps`);
}
