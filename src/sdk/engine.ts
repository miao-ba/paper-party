// State engine: write the rules as pure functions (see logic.ts), get networking, bots, reconnects,
// spectators, host migration and match history for free.
//
//   const g = useGameState(logic);
//   if (!g.state) return <Loading />;
//   g.state, g.me, g.myTurn, g.act({ type: 'roll' }), g.result
//
// The host keeps the authoritative state, applies every action with logic.act() and broadcasts the
// result (a per-player `view` if the logic hides secrets). Everyone else sends actions to the host.
import { useEffect, useRef, useState } from 'react';
import { useRoomInternal } from './room';
import { SYSTEM, turnList, type GameLogic, type Result, type SeatInfo } from './logic';
import type { Player } from './types';

interface Envelope<S> {
  /** New random id every time a host (re)starts its engine; v only counts up within one epoch. */
  epoch: string;
  v: number;
  seats: SeatInfo[];
  /** Seats whose player left; a bot plays them now. */
  away: string[];
  state: S;
  result: Result | null;
}
type SysMsg<S, A> =
  | { t: 'sys:engine:state'; env: Envelope<S> }
  | { t: 'sys:engine:act'; action: A }
  | { t: 'sys:engine:sync' }
  | { t: 'sys:engine:reject'; why: string };

export interface GameState<S, A> {
  /** What you are allowed to see (the host's `view` for you). null until the first sync. */
  state: S | null;
  /** Seats fixed at game start, in seat order. */
  seats: SeatInfo[];
  /** Your seat; null when spectating. */
  me: SeatInfo | null;
  seat: (id: string) => SeatInfo | undefined;
  /** Ids whose turn it is (from logic.turn). */
  turn: string[];
  myTurn: boolean;
  /** Set once the match is over (logic.result). */
  result: Result | null;
  /** Players who left mid-game (a bot plays their seat). */
  away: string[];
  /** Send an action (host applies it; invalid ones are ignored and logged). */
  act: (action: A) => void;
  isHost: boolean;
  /** Host: same game again. */
  rematch: () => void;
}

const wire = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const newEpoch = () => Math.random().toString(36).slice(2, 8);
const toSeat = (p: Player): SeatInfo => ({ id: p.id, name: p.name, avatar: p.avatar, index: p.index, color: p.color, bot: p.bot, level: p.level });

export function useGameState<S, A, O = Record<string, unknown>>(logic: GameLogic<S, A, O>): GameState<S, A> {
  const { api, onSys, sendSys, engine } = useRoomInternal();
  const [env, setEnv] = useState<Envelope<S> | null>(null);
  const envRef = useRef<Envelope<S> | null>(null);
  /** Host only: the full (unredacted) envelope. */
  const full = useRef<Envelope<S> | null>(null);
  const apiRef = useRef(api);
  apiRef.current = api;
  const logicRef = useRef(logic);
  logicRef.current = logic;
  const timers = useRef<number[]>([]);
  const bailed = useRef(false);

  const show = (e: Envelope<S>) => {
    envRef.current = e;
    setEnv(e);
  };
  const clearTimers = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  };
  const viewFor = (e: Envelope<S>, id: string | null): Envelope<S> => {
    const L = logicRef.current;
    return L.view ? { ...e, state: wire(L.view(e.state, id)) } : e;
  };
  const mySeatId = () => (apiRef.current.isSpectator ? null : apiRef.current.me.id);

  // ---------------------------------------------------------------- host side

  const sendTo = (e: Envelope<S>, id: string) => {
    const seated = e.seats.some((s) => s.id === id);
    sendSys({ t: 'sys:engine:state', env: viewFor(e, seated ? id : null) } satisfies SysMsg<S, A>, { to: id });
  };
  const broadcast = (e: Envelope<S>) => {
    const a = apiRef.current;
    show(viewFor(e, mySeatId()));
    if (a.local) return;
    const humans = [...a.players, ...a.spectators].filter((p) => !p.bot && !p.isMe);
    if (logicRef.current.view) humans.forEach((p) => sendTo(e, p.id));
    else sendSys({ t: 'sys:engine:state', env: e } satisfies SysMsg<S, A>);
  };

  const ctxFor = (playerId: string) => ({ playerId, players: full.current!.seats, rng: Math.random, now: Date.now() });

  // The host keeps a copy in sessionStorage, so reloading the page (or a phone killing the tab)
  // continues the same match instead of dealing a new one.
  const saveKey = `engine:${api.code}:${api.gameId}:${api.round}`;
  const save = (e: Envelope<S>) => {
    try {
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const k = sessionStorage.key(i);
        if (k?.startsWith('engine:') && k !== saveKey) sessionStorage.removeItem(k);
      }
      sessionStorage.setItem(saveKey, JSON.stringify(e));
    } catch {
      /* quota / private mode: no resume, fine */
    }
  };
  const restore = (): Envelope<S> | null => {
    try {
      const raw = sessionStorage.getItem(saveKey);
      const saved = raw ? (JSON.parse(raw) as Envelope<S>) : null;
      // Only the same match: everyone seated now must have a seat in the save (people may have left).
      const seats = new Set(saved?.seats.map((s) => s.id));
      return saved && apiRef.current.players.every((p) => seats.has(p.id)) ? saved : null;
    } catch {
      return null;
    }
  };

  const commit = (state: S, patch: Partial<Envelope<S>> = {}) => {
    const prev = full.current!;
    const next: Envelope<S> = { ...prev, ...patch, state: wire(state), v: prev.v + 1, result: null };
    next.result = logicRef.current.result?.(next.state) ?? null;
    full.current = next;
    save(next);
    broadcast(next);
    schedule();
  };

  const apply = (playerId: string, action: A): boolean => {
    const cur = full.current;
    const L = logicRef.current;
    if (!cur || cur.result) return false;
    if (playerId !== SYSTEM) {
      if (!cur.seats.some((s) => s.id === playerId)) return false;
      if (L.turn && !turnList(L.turn(cur.state)).includes(playerId)) {
        reject(playerId, 'not your turn');
        return false;
      }
    }
    let next: S;
    try {
      next = L.act(cur.state, wire(action), ctxFor(playerId));
    } catch (e) {
      reject(playerId, e instanceof Error ? e.message : String(e));
      return false;
    }
    if (next === cur.state) return false;
    commit(next);
    return true;
  };
  const reject = (playerId: string, why: string) => {
    if (import.meta.env.DEV) console.warn(`[engine] rejected action from ${playerId}: ${why}`);
    const a = apiRef.current;
    if (!a.local && playerId !== a.me.id && playerId !== SYSTEM && !full.current?.seats.find((s) => s.id === playerId)?.bot) {
      sendSys({ t: 'sys:engine:reject', why } satisfies SysMsg<S, A>, { to: playerId });
    }
  };

  /** Bots (and away seats) act when it is their turn; `auto` fires system actions. */
  const schedule = () => {
    clearTimers();
    const cur = full.current;
    const L = logicRef.current;
    if (!cur || cur.result) return;
    const [lo, hi] = L.botDelay ?? [700, 1500];
    for (const id of turnList(L.turn?.(cur.state))) {
      const seat = cur.seats.find((s) => s.id === id);
      if (!seat || !L.bot || !(seat.bot || cur.away.includes(id))) continue;
      timers.current.push(
        window.setTimeout(() => {
          const now = full.current;
          if (!now || now.v !== cur.v) return;
          const seen = L.view ? wire(L.view(now.state, id)) : wire(now.state);
          let action: A | null | undefined;
          try {
            action = L.bot!(seen, { playerId: id, level: seat.level, players: now.seats, rng: Math.random });
          } catch (e) {
            console.error('[engine] bot crashed', e);
          }
          if (action != null) apply(id, action);
        }, lo + Math.random() * (hi - lo)),
      );
    }
    const auto = L.auto?.(cur.state);
    if (auto) timers.current.push(window.setTimeout(() => full.current?.v === cur.v && apply(SYSTEM, auto.action), auto.after));
  };

  const startFresh = () => {
    const a = apiRef.current;
    const seats = a.players.map(toSeat);
    const state = logicRef.current.setup({ players: seats, options: a.options as O, rng: Math.random });
    const e: Envelope<S> = { epoch: newEpoch(), v: 1, seats, away: [], state: wire(state), result: null };
    e.result = logicRef.current.result?.(e.state) ?? null;
    full.current = e;
    save(e);
    broadcast(e);
    schedule();
  };

  // Become host: on mount, or when the crown moves to us mid-game (host migration).
  useEffect(() => {
    engine.current = true;
    if (!api.isHost) return;
    if (!full.current) {
      const saved = restore();
      if (saved) full.current = { ...saved, epoch: newEpoch() };
    }
    if (full.current) {
      broadcast(full.current);
      schedule();
    } else if (envRef.current && !logicRef.current.view) {
      // We were a player with the full state: just carry on.
      full.current = { ...envRef.current, epoch: newEpoch() };
      save(full.current);
      broadcast(full.current);
      schedule();
    } else {
      // Fresh game (or the old host hid secrets from us: start a new match).
      startFresh();
    }
    return clearTimers;
  }, [api.isHost]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(
    () => () => {
      engine.current = false;
    },
    [engine],
  );

  // Seats whose player left for good: a bot takes over, or logic.leave, or back to the waiting room.
  const presentKey = api.players.map((p) => p.id).join(',');
  useEffect(() => {
    const cur = full.current;
    if (!api.isHost || !cur || cur.result) return;
    const present = new Set(api.players.map((p) => p.id));
    const gone = cur.seats.filter((s) => !s.bot && !present.has(s.id) && !cur.away.includes(s.id)).map((s) => s.id);
    if (!gone.length) return;
    const L = logicRef.current;
    if (L.bot) {
      commit(cur.state, { away: [...cur.away, ...gone] });
    } else if (L.leave) {
      let state = cur.state;
      for (const id of gone) state = L.leave(state, id, ctxFor(SYSTEM));
      commit(state, { away: [...cur.away, ...gone] });
    } else if (!bailed.current) {
      bailed.current = true;
      api.backToRoom();
    }
  }, [presentKey, api.isHost]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------- messages

  // The handler is read through a ref so it always runs the latest code / sees the latest refs.
  const onMessage = (m: SysMsg<S, A>, from: string) => {
    const a = apiRef.current;
    if (m.t === 'sys:engine:state') {
      if (a.isHost || from !== a.host.id) return;
      const cur = envRef.current;
      // A new epoch (host reloaded / changed) always wins; within an epoch, never go back in time.
      if (!cur || m.env.epoch !== cur.epoch || m.env.v >= cur.v) show(m.env);
    } else if (m.t === 'sys:engine:act') {
      if (a.isHost) apply(from, m.action);
    } else if (m.t === 'sys:engine:sync') {
      if (a.isHost && full.current) sendTo(full.current, from);
    } else if (m.t === 'sys:engine:reject') {
      if (import.meta.env.DEV) console.warn(`[engine] host rejected my action: ${m.why}`);
    }
  };
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  useEffect(() => onSys((m: SysMsg<S, A>, from) => onMessageRef.current(m, from)), [onSys]);

  // Not host: ask for the state (and keep asking until it arrives — the host may still be loading).
  useEffect(() => {
    if (api.isHost || api.local) return;
    full.current = null;
    clearTimers();
    const ask = () => sendSys({ t: 'sys:engine:sync' } satisfies SysMsg<S, A>, { to: apiRef.current.host.id });
    ask();
    let tries = 0;
    const id = window.setInterval(() => {
      if (envRef.current && tries > 0) return window.clearInterval(id);
      tries++;
      ask();
    }, 1500);
    return () => window.clearInterval(id);
  }, [api.isHost, api.host.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Every client records the result once (one engine instance = one match; a rematch remounts it).
  const reported = useRef(false);
  useEffect(() => {
    if (env?.result && !reported.current) {
      reported.current = true;
      api.report(env.result);
    }
  }, [env?.result]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------- API

  const seats = env?.seats ?? [];
  const meSeat = seats.find((s) => s.id === api.me.id && !api.isSpectator) ?? null;
  const turn = env ? turnList(logic.turn?.(env.state)) : [];
  return {
    state: env?.state ?? null,
    seats,
    me: meSeat,
    seat: (id) => seats.find((s) => s.id === id),
    turn,
    myTurn: !!meSeat && turn.includes(meSeat.id) && !env?.result,
    result: env?.result ?? null,
    away: env?.away ?? [],
    act: (action) => {
      const a = apiRef.current;
      if (a.isSpectator) return;
      if (a.isHost) apply(a.me.id, action);
      else sendSys({ t: 'sys:engine:act', action } satisfies SysMsg<S, A>, { to: a.host.id });
    },
    isHost: api.isHost,
    rematch: api.rematch,
  };
}
