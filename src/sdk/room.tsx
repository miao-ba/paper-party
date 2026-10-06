// The room as a game sees it: who is here, who is host, and a message bus.
//
//   const { me, players, isHost, send, options, report } = useRoom();
//   useMessage<Msg>((msg, from) => { ... });   // what the others send
//
// Messages:
//   send(msg)        → every other player (and bots), never back to yourself
//   send(msg, id)    → one player / bot
//   `t` values starting with "sys:" are reserved for the platform (reactions, clock sync, state engine).
//
// Bots: bot seats are simulated by the HOST's browser. For message-based games the host runs your
// BotFactory per bot seat; a bot's ctx.send goes out exactly like a human's send (the server relays it
// "as" the bot). In local rooms (solo) the network is skipped entirely; messages still take ~20 ms
// and go through JSON, so Game.tsx behaves the same.
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { socket, clientId } from '../platform/net/socket';
import { useNet } from '../platform/net/NetContext';
import { addRecord } from '../platform/records';
import { sfx } from '../platform/audio/sfx';
import { haptic } from '../platform/audio/haptic';
import { seatColor } from './colors';
import type { RoomView } from '../../shared/protocol';
import type { Bot, BotCtx, BotFactory, GameMeta, GameModule, Player } from './types';
import type { Result } from './logic';

type Handler = (msg: any, from: string) => void;
export type Reaction = { id: number; from: string; emoji?: string; text?: string };

export interface RoomApi {
  code: string;
  gameId: string;
  meta: GameMeta;
  status: RoomView['status'];
  /** Increments on every (re)start. */
  round: number;
  options: Record<string, any>;
  /** Solo / offline room in this tab. */
  local: boolean;
  /** Listed in the lobby. */
  public: boolean;
  me: Player;
  /** Seated players in seat order (humans + bots). */
  players: Player[];
  spectators: Player[];
  host: Player;
  isHost: boolean;
  isSpectator: boolean;
  player: (id: string) => Player | undefined;
  /** Send to everyone else, or to one seat. */
  send: (msg: unknown, to?: string) => void;
  /** Store the match in this device's history. Call once when a match ends (engine games: automatic). */
  report: (result: Result) => void;
  /** Host: restart the same game (new round, fresh Game mount). */
  rematch: () => void;
  /** Host: everyone back to the waiting room. */
  backToRoom: () => void;
  /** Leave the room. */
  leave: () => void;
}

interface Internal {
  api: RoomApi;
  subscribe: (fn: Handler) => () => void;
  onSys: (fn: Handler) => () => void;
  sendSys: (msg: { t: string } & Record<string, unknown>, opts?: { to?: string; as?: string }) => void;
  engine: { current: boolean };
  clock: ClockState;
  reactions: Reaction[];
  react: (r: { emoji?: string; text?: string }, as?: string) => void;
}

const LOCAL_LATENCY = 20;
/** Same serialisation as the network: games and bots never share objects. */
const wire = <T,>(data: T): T => (data === undefined ? data : JSON.parse(JSON.stringify(data)));
const isSys = (d: unknown): d is { t: string } => !!d && typeof d === 'object' && typeof (d as { t?: unknown }).t === 'string' && (d as { t: string }).t.startsWith('sys:');

const Ctx = createContext<Internal | null>(null);
function useInternal() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useRoom() must be used inside a game (RoomProvider)');
  return c;
}
/** @internal platform + engine */
export const useRoomInternal = useInternal;
export const useRoom = (): RoomApi => useInternal().api;

/** Receive messages from the other players / bots. The handler always sees fresh props/state. */
export function useMessage<T = any>(fn: (msg: T, from: string) => void) {
  const { subscribe } = useInternal();
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => subscribe((m, f) => ref.current(m, f)), [subscribe]);
}

export function toPlayers(room: RoomView): { players: Player[]; spectators: Player[] } {
  let i = 0;
  const all = room.players.map((s): Player => {
    const index = s.spectator ? -1 : i++;
    return {
      id: s.id,
      name: s.name,
      avatar: s.avatar,
      index,
      color: index >= 0 ? seatColor(index) : '#9a97a6',
      bot: !!s.bot,
      level: s.bot?.level ?? 1,
      online: s.online,
      spectator: !!s.spectator,
      isHost: s.id === room.hostId,
      isMe: s.id === clientId,
    };
  });
  return { players: all.filter((p) => !p.spectator), spectators: all.filter((p) => p.spectator) };
}

// ---------------------------------------------------------------- clock sync

export interface ClockState {
  /** hostTime - myTime (ms). 0 for the host. */
  offset: number | null;
  rtt: number | null;
}

/**
 * The host's clock, for real-time games: the host schedules events in ITS performance.now() and
 * sends them; everyone converts with toLocal(). Measure reaction times locally — then clock error
 * does not matter for fairness. Synced automatically when you are not the host.
 */
export function useHostClock() {
  const { clock, api } = useInternal();
  const off = api.isHost || api.local ? 0 : clock.offset;
  return {
    synced: off !== null,
    rtt: clock.rtt,
    /** host performance.now() → my performance.now() */
    toLocal: (hostTime: number) => hostTime - (off ?? 0),
    /** my performance.now() → host time */
    toHost: (localTime: number) => localTime + (off ?? 0),
    /** The host's performance.now(), right now. */
    hostNow: () => performance.now() + (off ?? 0),
  };
}

// ---------------------------------------------------------------- provider

export function RoomProvider({ room, mod, children }: { room: RoomView; mod: GameModule; children: ReactNode }) {
  const net = useNet();
  const handlers = useRef(new Set<Handler>());
  const sysHandlers = useRef(new Set<Handler>());
  /** Messages that arrive before the game code has loaded and subscribed. */
  const queue = useRef<[unknown, string][]>([]);
  const bots = useRef(new Map<string, Bot>());
  const engine = useRef(false);
  const roomRef = useRef(room);
  roomRef.current = room;
  const local = !!room.local;
  const isHost = room.hostId === clientId;
  const [clock, setClock] = useState<ClockState>({ offset: isHost || local ? 0 : null, rtt: null });
  const [reactions, setReactions] = useState<Reaction[]>([]);

  const toGame = (data: unknown, from: string) => {
    if (handlers.current.size === 0) {
      queue.current.push([data, from]);
      return;
    }
    handlers.current.forEach((fn) => fn(data, from));
  };
  const toBot = (id: string, data: unknown, from: string) => {
    const b = bots.current.get(id);
    if (b) window.setTimeout(() => bots.current.get(id) === b && b.onMessage(data, from), LOCAL_LATENCY);
  };
  /** Deliver a game message to every local participant (me + my bots) except the sender. */
  const fanOut = (data: unknown, from: string, to?: string) => {
    if (to === undefined || to === clientId) {
      if (from !== clientId) toGame(data, from);
    }
    for (const id of bots.current.keys()) if (id !== from && (to === undefined || to === id)) toBot(id, data, from);
  };

  const sendAs = (from: string, data: unknown, to?: string) => {
    const msg = wire(data);
    if (local) {
      // Local room: me → bots / bot → me, with a tiny fake latency so nothing runs re-entrantly.
      window.setTimeout(() => fanOut(msg, from, to), LOCAL_LATENCY);
      return;
    }
    fanOut(msg, from, to);
    const toLocalBot = to !== undefined && bots.current.has(to);
    if (to !== clientId && !toLocalBot) socket.emit('room:msg', { data: msg, to, ...(from !== clientId ? { as: from } : {}) });
  };

  const sendSys: Internal['sendSys'] = (msg, opts = {}) => {
    if (local) return;
    socket.emit('room:msg', { data: msg, to: opts.to, ...(opts.as ? { as: opts.as } : {}) });
  };

  // ---- incoming from the server
  useEffect(() => {
    if (local) return;
    const onMsg = ({ from, data, to }: { from: string; data: unknown; to?: string }) => {
      if (isSys(data)) {
        sysHandlers.current.forEach((fn) => fn(data, from));
        return;
      }
      fanOut(data, from, to);
    };
    socket.on('room:msg', onMsg);
    return () => {
      socket.off('room:msg', onMsg);
    };
  }, [local]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- clock sync with the host (non-hosts), re-run when the host changes and every 30 s
  useEffect(() => {
    if (local || isHost) {
      setClock({ offset: 0, rtt: null });
      return;
    }
    setClock({ offset: null, rtt: null });
    const samples: { off: number; rtt: number }[] = [];
    const onSys: Handler = (m, from) => {
      if (m.t === 'sys:clock:pong' && from === roomRef.current.hostId) {
        const now = performance.now();
        const rtt = now - m.a;
        samples.push({ off: m.b - (m.a + rtt / 2), rtt });
        if (samples.length >= 5) {
          // the fastest half, then the median: robust against jitter
          const best = [...samples].sort((x, y) => x.rtt - y.rtt).slice(0, Math.ceil(samples.length / 2));
          const offs = best.map((s) => s.off).sort((x, y) => x - y);
          setClock({ offset: offs[Math.floor(offs.length / 2)], rtt: best[0].rtt });
        }
      }
    };
    sysHandlers.current.add(onSys);
    let n = 0;
    const burst = () => {
      samples.length = 0;
      n = 0;
      const id = window.setInterval(() => {
        sendSys({ t: 'sys:clock:ping', a: performance.now() }, { to: roomRef.current.hostId });
        if (++n >= 6) window.clearInterval(id);
      }, 120);
      return id;
    };
    let burstId = burst();
    const again = window.setInterval(() => {
      window.clearInterval(burstId);
      burstId = burst();
    }, 30_000);
    return () => {
      sysHandlers.current.delete(onSys);
      window.clearInterval(burstId);
      window.clearInterval(again);
    };
  }, [local, isHost, room.hostId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- the host answers clock pings and handles platform requests
  useEffect(() => {
    if (local || !isHost) return;
    const onSys: Handler = (m, from) => {
      if (m.t === 'sys:clock:ping') sendSys({ t: 'sys:clock:pong', a: m.a, b: performance.now() }, { to: from });
    };
    sysHandlers.current.add(onSys);
    return () => {
      sysHandlers.current.delete(onSys);
    };
  }, [local, isHost]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- reactions (emoji / quick phrases), any status
  const addReaction = (r: Omit<Reaction, 'id'>) => {
    const id = Date.now() + Math.random();
    setReactions((l) => [...l.slice(-7), { ...r, id }]);
    if (r.from !== clientId) {
      sfx.pop();
      haptic('light');
    }
    window.setTimeout(() => setReactions((l) => l.filter((x) => x.id !== id)), 2600);
  };
  const botReply = (emoji?: string) => {
    // A bot sometimes answers a human's reaction (host only, so it happens once).
    const botIds = roomRef.current.players.filter((p) => p.bot && !p.spectator).map((p) => p.id);
    if (!botIds.length || Math.random() > 0.35) return;
    const as = botIds[Math.floor(Math.random() * botIds.length)];
    const pool = ['😂', '😎', '🤖', '👍', '🔥', '😜', '🙃', '🎉'];
    window.setTimeout(() => react({ emoji: emoji && Math.random() < 0.4 ? emoji : pool[Math.floor(Math.random() * pool.length)] }, as), 700 + Math.random() * 1200);
  };
  const react = (r: { emoji?: string; text?: string }, as?: string) => {
    const from = as ?? clientId;
    addReaction({ ...r, from });
    sendSys({ t: 'sys:react', ...r }, as ? { as } : {});
    if (!as && roomRef.current.hostId === clientId) botReply(r.emoji);
  };
  useEffect(() => {
    const onSys: Handler = (m, from) => {
      if (m.t !== 'sys:react') return;
      addReaction({ from, emoji: typeof m.emoji === 'string' ? m.emoji.slice(0, 8) : undefined, text: typeof m.text === 'string' ? m.text.slice(0, 40) : undefined });
      const sender = roomRef.current.players.find((p) => p.id === from);
      if (roomRef.current.hostId === clientId && sender && !sender.bot) botReply(m.emoji);
    };
    sysHandlers.current.add(onSys);
    return () => {
      sysHandlers.current.delete(onSys);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- message-based bots: the host runs one per bot seat while a game is running
  const botKey = room.players
    .filter((p) => p.bot && !p.spectator)
    .map((p) => `${p.id}:${p.bot!.level}`)
    .join(',');
  useEffect(() => {
    if (!isHost || room.status !== 'playing' || !mod.bot) return;
    const factory: BotFactory = mod.bot;
    const disposers: (() => void)[] = [];
    const seats = toPlayers(roomRef.current).players;
    for (const p of seats.filter((s) => s.bot)) {
      const timeouts = new Set<number>();
      const intervals = new Set<number>();
      let alive = true;
      const later = (fn: () => void, ms: number) => {
        const id = window.setTimeout(() => {
          timeouts.delete(id);
          if (alive) fn();
        }, ms);
        timeouts.add(id);
        return id;
      };
      const ctx: BotCtx = {
        id: p.id,
        name: p.name,
        level: p.level,
        difficulty: p.level,
        index: p.index,
        side: 'R',
        options: roomRef.current.options,
        players: () => toPlayers(roomRef.current).players,
        hostId: () => roomRef.current.hostId,
        send: (msg, to) => alive && sendAs(p.id, msg, to),
        later,
        every: (fn, ms) => {
          const id = window.setInterval(() => alive && fn(), ms);
          intervals.add(id);
          return id;
        },
        cancel: (id) => {
          window.clearTimeout(id);
          window.clearInterval(id);
          timeouts.delete(id);
          intervals.delete(id);
        },
      };
      const b = factory(ctx);
      bots.current.set(p.id, b);
      disposers.push(() => {
        alive = false;
        b.dispose?.();
        timeouts.forEach((id) => window.clearTimeout(id));
        intervals.forEach((id) => window.clearInterval(id));
        if (bots.current.get(p.id) === b) bots.current.delete(p.id);
      });
    }
    return () => disposers.forEach((d) => d());
  }, [isHost, room.status, room.round, botKey, mod]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- match history
  const matchStart = useRef(Date.now());
  useEffect(() => {
    matchStart.current = Date.now();
  }, [room.round]);
  const lastReport = useRef({ key: '', at: 0 });
  const report = (r: Result) => {
    const key = JSON.stringify([roomRef.current.round, r]);
    const now = Date.now();
    if (key === lastReport.current.key && now - lastReport.current.at < 8000) return;
    lastReport.current = { key, at: now };
    const { players } = toPlayers(roomRef.current);
    const me = players.find((p) => p.isMe);
    if (!me) return; // spectators do not record
    const coop = !!r.coop;
    const draw = !coop && r.winners.length === 0;
    addRecord({
      id: `${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      game: roomRef.current.gameId,
      at: now,
      dur: now - matchStart.current,
      local: !!roomRef.current.local,
      players: players.map((p) => ({ name: p.name, avatar: p.avatar, bot: p.bot, me: p.isMe, won: r.winners.includes(p.id), score: r.scores?.[p.id] })),
      won: coop || draw ? null : r.winners.includes(me.id),
      coop,
      draw,
      value: r.value,
    });
  };

  // ---- public API
  const api = useMemo<RoomApi>(() => {
    const { players, spectators } = toPlayers(room);
    const all = [...players, ...spectators];
    const me = all.find((p) => p.isMe) ?? { ...players[0], isMe: true };
    return {
      code: room.code,
      gameId: room.gameId,
      meta: mod.meta,
      status: room.status,
      round: room.round,
      options: room.options as Record<string, any>,
      local,
      public: room.public,
      me,
      players,
      spectators,
      host: all.find((p) => p.isHost) ?? players[0],
      isHost,
      isSpectator: me.spectator,
      player: (id) => all.find((p) => p.id === id),
      send: (msg, to) => sendAs(clientId, msg, to),
      report,
      rematch: () => isHost && net.host.start(),
      backToRoom: () => isHost && net.host.end(),
      leave: net.leaveRoom,
    };
  }, [room, mod, local, isHost]); // eslint-disable-line react-hooks/exhaustive-deps

  const subscribe = useMemo(
    () => (fn: Handler) => {
      handlers.current.add(fn);
      // Flush queued messages once every useMessage of this commit has subscribed.
      if (queue.current.length && handlers.current.size === 1) {
        window.setTimeout(() => {
          const q = queue.current;
          queue.current = [];
          q.forEach(([d, f]) => handlers.current.forEach((h) => h(d, f)));
        }, 0);
      }
      return () => {
        handlers.current.delete(fn);
      };
    },
    [],
  );
  const onSys = useMemo(
    () => (fn: Handler) => {
      sysHandlers.current.add(fn);
      return () => {
        sysHandlers.current.delete(fn);
      };
    },
    [],
  );
  // A new round is a fresh game: forget queued messages from the previous one.
  useEffect(() => {
    queue.current = [];
  }, [room.round, room.gameId]);

  // Message-based games keep their state in the players' browsers, mostly the host's. If the host
  // changes mid-game, or someone leaves for good (unless meta.continueOnLeave), the new/current host
  // sends everyone back to the waiting room. Engine games handle both cases themselves.
  const prevRoom = useRef(room);
  useEffect(() => {
    const prev = prevRoom.current;
    prevRoom.current = room;
    if (local || !isHost || room.status !== 'playing' || prev.status !== 'playing' || prev.round !== room.round || engine.current) return;
    const ids = new Set(room.players.map((p) => p.id));
    const left = prev.players.some((p) => !p.bot && !p.spectator && !ids.has(p.id));
    if (prev.hostId !== room.hostId || (left && !mod.meta.continueOnLeave)) net.host.end();
  }, [room]); // eslint-disable-line react-hooks/exhaustive-deps

  const value: Internal = { api, subscribe, onSys, sendSys, engine, clock, reactions, react };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Reactions for the platform layer (floating emoji). */
export function useReactions() {
  const { reactions, react } = useInternal();
  return { reactions, react: (r: { emoji?: string; text?: string }) => react(r) };
}
