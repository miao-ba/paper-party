// Rooms, seats and message relay. Game-agnostic on purpose: every game rule lives in the browser.
//
//  - A room has ordered seats (humans + bots). Bots are simulated by the host's browser; the host may
//    speak for them with `room:msg { as: botId }`.
//  - The host is the authority for games that need one. If the host stays offline for HOST_GRACE_MS
//    (or leaves), the crown moves to the next online human and the bots move with it.
//  - Offline players keep their seat for LIMITS.graceMs, then lose it. A room with no humans is closed.
import type { Server, Socket } from 'socket.io';
import {
  CODE_ALPHABET,
  LIMITS,
  normalizeCode,
  type ClientToServer,
  type LobbyInfo,
  type RelayOut,
  type RoomLeaveReason,
  type RoomView,
  type Seat,
  type ServerToClient,
} from '../shared/protocol';

type IO = Server<ClientToServer, ServerToClient>;
type Sock = Socket<ClientToServer, ServerToClient>;

interface Player {
  id: string;
  name: string;
  avatar: string | null;
  socketId?: string;
  room?: string;
}
interface SeatRec {
  id: string;
  /** bots carry their own name/avatar; humans read them from `players` */
  bot?: { level: 0 | 1 | 2; name: string; avatar: string };
  spectator?: boolean;
  offlineTimer?: NodeJS.Timeout;
}
interface Room {
  code: string;
  gameId: string;
  hostId: string;
  status: 'waiting' | 'playing';
  public: boolean;
  min: number;
  max: number;
  options: Record<string, unknown>;
  seats: SeatRec[];
  round: number;
  kicked: Set<string>;
  hostTimer?: NodeJS.Timeout;
}

const HOST_GRACE_MS = 15_000;
const LOBBY_ROOM = 'lobby';

const clean = (s: unknown, max: number) =>
  String(s ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max);
const level = (v: unknown): 0 | 1 | 2 => (v === 0 || v === 2 ? v : 1);
const clampSeats = (n: unknown, fallback: number) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.max(1, Math.min(LIMITS.seats, v)) : fallback;
};
const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Token bucket: `rate` per second, burst 2×rate. */
function bucket(rate: number) {
  let tokens = rate * 2;
  let last = Date.now();
  return () => {
    const now = Date.now();
    tokens = Math.min(rate * 2, tokens + ((now - last) / 1000) * rate);
    last = now;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}

export function attachRooms(io: IO) {
  const players = new Map<string, Player>();
  const rooms = new Map<string, Room>();

  // ---------------------------------------------------------------- views

  const seatView = (s: SeatRec): Seat => {
    if (s.bot) return { id: s.id, name: s.bot.name, avatar: s.bot.avatar, bot: { level: s.bot.level }, online: true };
    const p = players.get(s.id);
    return { id: s.id, name: p?.name ?? '?', avatar: p?.avatar ?? null, online: !!p?.socketId, ...(s.spectator ? { spectator: true } : {}) };
  };
  const roomView = (r: Room): RoomView => ({
    code: r.code,
    gameId: r.gameId,
    hostId: r.hostId,
    status: r.status,
    public: r.public,
    min: r.min,
    max: r.max,
    options: r.options,
    players: r.seats.map(seatView),
    round: r.round,
  });
  const playing = (r: Room) => r.seats.filter((s) => !s.spectator);
  const humans = (r: Room) => r.seats.filter((s) => !s.bot);
  const isOnline = (id: string) => !!players.get(id)?.socketId;

  const pushRoom = (r: Room) => {
    io.to(r.code).emit('room:state', roomView(r));
    pushLobby();
  };

  // Lobby info goes to sockets that are not in a room, at most every 400 ms.
  let lobbyTimer: NodeJS.Timeout | undefined;
  const lobbyInfo = (): LobbyInfo => {
    let online = 0;
    for (const p of players.values()) if (p.socketId) online++;
    const list = [...rooms.values()]
      .filter((r) => r.public && humans(r).some((s) => isOnline(s.id)))
      .sort((a, b) => Number(a.status === 'playing') - Number(b.status === 'playing'))
      .slice(0, 60)
      .map((r) => {
        const host = players.get(r.hostId);
        return { code: r.code, gameId: r.gameId, host: host?.name ?? '?', hostAvatar: host?.avatar ?? null, players: playing(r).length, max: r.max, status: r.status };
      });
    return { online, rooms: list };
  };
  function pushLobby() {
    if (lobbyTimer) return;
    lobbyTimer = setTimeout(() => {
      lobbyTimer = undefined;
      io.to(LOBBY_ROOM).emit('lobby', lobbyInfo());
    }, 400).unref();
  }

  // ---------------------------------------------------------------- room helpers

  const newCode = () => {
    for (let i = 0; i < 1000; i++) {
      let c = '';
      for (let j = 0; j < 4; j++) c += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      if (!rooms.has(c)) return c;
    }
    throw new Error('no free room code');
  };
  const socketOf = (id: string) => {
    const sid = players.get(id)?.socketId;
    return sid ? io.sockets.sockets.get(sid) : undefined;
  };

  /** Spectators take free seats (in join order) when the room is between games. */
  const promoteSpectators = (r: Room) => {
    for (const s of r.seats) {
      if (!s.spectator) continue;
      if (playing(r).length >= r.max) break;
      delete s.spectator;
    }
  };

  /** Too many seats for the (new) game: drop bots first, then make the last humans spectators. */
  const fitSeats = (r: Room) => {
    while (playing(r).length > r.max) {
      const bots = r.seats.filter((s) => s.bot);
      if (bots.length) {
        r.seats.splice(r.seats.indexOf(bots[bots.length - 1]), 1);
        continue;
      }
      const last = [...r.seats].reverse().find((s) => !s.spectator && s.id !== r.hostId);
      if (!last) break;
      last.spectator = true;
    }
  };

  const pickHost = (r: Room, except?: string) =>
    humans(r).find((s) => s.id !== except && !s.spectator && isOnline(s.id)) ??
    humans(r).find((s) => s.id !== except && isOnline(s.id)) ??
    humans(r).find((s) => s.id !== except);

  const setHost = (r: Room, id: string) => {
    clearTimeout(r.hostTimer);
    r.hostTimer = undefined;
    r.hostId = id;
  };

  function closeRoom(r: Room) {
    clearTimeout(r.hostTimer);
    for (const s of r.seats) clearTimeout(s.offlineTimer);
    rooms.delete(r.code);
    pushLobby();
  }

  /** Remove a human or bot seat. Humans get `room:state null` with the reason. */
  function removeSeat(r: Room, id: string, reason: RoomLeaveReason) {
    const i = r.seats.findIndex((s) => s.id === id);
    if (i < 0) return;
    const [seat] = r.seats.splice(i, 1);
    clearTimeout(seat.offlineTimer);
    if (!seat.bot) {
      const p = players.get(id);
      if (p) {
        p.room = undefined;
        const sock = socketOf(id);
        if (sock) {
          void sock.leave(r.code);
          void sock.join(LOBBY_ROOM);
          sock.emit('room:state', null, { reason });
          sock.emit('lobby', lobbyInfo());
        } else {
          players.delete(id);
        }
      }
    }
    if (!humans(r).length) return closeRoom(r);
    if (r.hostId === id) setHost(r, pickHost(r)!.id);
    if (r.status === 'waiting') promoteSpectators(r);
    pushRoom(r);
  }

  function enterRoom(sock: Sock, p: Player, r: Room) {
    if (p.room && p.room !== r.code) {
      const old = rooms.get(p.room);
      if (old) removeSeat(old, p.id, 'left');
    }
    p.room = r.code;
    void sock.leave(LOBBY_ROOM);
    void sock.join(r.code);
  }

  /** Called when a seated human goes offline. */
  function scheduleOffline(r: Room, id: string) {
    const seat = r.seats.find((s) => s.id === id);
    if (!seat) return;
    clearTimeout(seat.offlineTimer);
    // Timers never keep the process alive on their own (the HTTP server does).
    seat.offlineTimer = setTimeout(() => removeSeat(r, id, 'closed'), LIMITS.graceMs).unref();
    if (r.hostId === id && !r.hostTimer) {
      r.hostTimer = setTimeout(() => {
        r.hostTimer = undefined;
        if (isOnline(r.hostId)) return;
        const next = pickHost(r, r.hostId);
        if (next && isOnline(next.id)) {
          setHost(r, next.id);
          pushRoom(r);
        }
      }, HOST_GRACE_MS).unref();
    }
  }

  // ---------------------------------------------------------------- sockets

  io.on('connection', (socket: Sock) => {
    const msgOk = bucket(LIMITS.msgPerSec);
    const opOk = bucket(4);
    const me = () => players.get(socket.data.playerId as string);
    const myRoom = () => {
      const p = me();
      return p?.room ? rooms.get(p.room) : undefined;
    };
    /** The room, but only if I am its host. */
    const hostRoom = () => {
      const r = myRoom();
      return r && r.hostId === socket.data.playerId ? r : undefined;
    };

    socket.on('hello', ({ clientId, name, avatar }) => {
      const id = clean(clientId, 24);
      if (!id) return;
      const p = players.get(id) ?? { id, name: '', avatar: null };
      p.name = clean(name, LIMITS.name) || '???';
      p.avatar = clean(avatar, LIMITS.avatar) || null;
      p.socketId = socket.id;
      players.set(id, p);
      socket.data.playerId = id;

      const r = p.room ? rooms.get(p.room) : undefined;
      const seat = r?.seats.find((s) => s.id === id);
      if (r && seat) {
        clearTimeout(seat.offlineTimer);
        seat.offlineTimer = undefined;
        if (r.hostId === id) {
          clearTimeout(r.hostTimer);
          r.hostTimer = undefined;
        }
        void socket.join(r.code);
        pushRoom(r);
      } else {
        p.room = undefined;
        void socket.join(LOBBY_ROOM);
        socket.emit('room:state', null);
        socket.emit('lobby', lobbyInfo());
        pushLobby();
      }
    });

    socket.on('room:create', (o, ack) => {
      const p = me();
      if (typeof ack !== 'function') return;
      if (!p) return ack({ ok: false, error: 'hello-first' });
      if (!opOk()) return ack({ ok: false, error: 'slow-down' });
      if (rooms.size >= LIMITS.rooms) return ack({ ok: false, error: 'server-full' });
      const max = clampSeats(o?.max, 8);
      const r: Room = {
        code: newCode(),
        gameId: clean(o?.gameId, 40),
        hostId: p.id,
        status: 'waiting',
        public: !!o?.public,
        min: Math.min(max, clampSeats(o?.min, 2)),
        max,
        options: isPlainObject(o?.options) ? o.options : {},
        seats: [{ id: p.id }],
        round: 0,
        kicked: new Set(),
      };
      rooms.set(r.code, r);
      enterRoom(socket, p, r);
      ack({ ok: true, code: r.code });
      pushRoom(r);
    });

    socket.on('room:join', (o, ack) => {
      const p = me();
      if (typeof ack !== 'function') return;
      if (!p) return ack({ ok: false, error: 'hello-first' });
      if (!opOk()) return ack({ ok: false, error: 'slow-down' });
      const r = rooms.get(normalizeCode(String(o?.code ?? '')));
      if (!r) return ack({ ok: false, error: 'not-found' });
      if (r.kicked.has(p.id)) return ack({ ok: false, error: 'kicked' });
      if (!r.seats.some((s) => s.id === p.id)) {
        if (r.seats.length >= LIMITS.seats) return ack({ ok: false, error: 'full' });
        if (r.status === 'playing') {
          r.seats.push({ id: p.id, spectator: true });
        } else if (playing(r).length < r.max) {
          r.seats.push({ id: p.id });
        } else {
          // Full of bots? A human beats a bot.
          const bot = [...r.seats].reverse().find((s) => s.bot);
          if (!bot) return ack({ ok: false, error: 'full' });
          r.seats.splice(r.seats.indexOf(bot), 1, { id: p.id });
        }
      }
      enterRoom(socket, p, r);
      ack({ ok: true, code: r.code });
      pushRoom(r);
    });

    socket.on('room:leave', () => {
      const r = myRoom();
      if (r) removeSeat(r, socket.data.playerId, 'left');
    });

    socket.on('room:update', (o) => {
      const r = hostRoom();
      if (!r || !isPlainObject(o)) return;
      if (typeof o.gameId === 'string' && o.gameId) r.gameId = clean(o.gameId, 40);
      if (o.max !== undefined) r.max = clampSeats(o.max, r.max);
      if (o.min !== undefined) r.min = Math.min(r.max, clampSeats(o.min, r.min));
      if (isPlainObject(o.options)) r.options = o.options;
      if (typeof o.public === 'boolean') r.public = o.public;
      fitSeats(r);
      if (r.status === 'waiting') promoteSpectators(r);
      pushRoom(r);
    });

    socket.on('room:bot:add', (o) => {
      const r = hostRoom();
      if (!r || r.seats.length >= LIMITS.seats || playing(r).length >= r.max) return;
      const id = `bot-${Math.random().toString(36).slice(2, 8)}`;
      r.seats.push({ id, bot: { level: level(o?.level), name: clean(o?.name, LIMITS.name) || 'Bot', avatar: clean(o?.avatar, LIMITS.avatar) || '🤖' } });
      pushRoom(r);
    });

    socket.on('room:bot:remove', (o) => {
      const r = hostRoom();
      const seat = r?.seats.find((s) => s.id === o?.id && s.bot);
      if (r && seat) removeSeat(r, seat.id, 'left');
    });

    socket.on('room:bot:level', (o) => {
      const r = hostRoom();
      const seat = r?.seats.find((s) => s.id === o?.id && s.bot);
      if (!r || !seat?.bot) return;
      seat.bot.level = level(o?.level);
      pushRoom(r);
    });

    socket.on('room:kick', (o) => {
      const r = hostRoom();
      const id = String(o?.id ?? '');
      if (!r || id === r.hostId || !r.seats.some((s) => s.id === id)) return;
      if (!id.startsWith('bot-')) r.kicked.add(id);
      removeSeat(r, id, 'kicked');
    });

    socket.on('room:host', (o) => {
      const r = hostRoom();
      const seat = r?.seats.find((s) => s.id === o?.id && !s.bot);
      if (!r || !seat || !isOnline(seat.id)) return;
      setHost(r, seat.id);
      pushRoom(r);
    });

    socket.on('room:start', () => {
      const r = hostRoom();
      if (!r) return;
      // Also used for "play again" while playing: spectators get their seats now.
      promoteSpectators(r);
      if (playing(r).length < r.min) return;
      r.status = 'playing';
      r.round += 1;
      pushRoom(r);
    });

    socket.on('room:end', () => {
      const r = hostRoom();
      if (!r || r.status !== 'playing') return;
      r.status = 'waiting';
      promoteSpectators(r);
      pushRoom(r);
    });

    socket.on('room:msg', (m: RelayOut) => {
      if (!msgOk()) return;
      const r = myRoom();
      if (!r || !isPlainObject(m)) return;
      const self = socket.data.playerId as string;
      let from = self;
      if (m.as !== undefined) {
        // Only the host may speak for a bot.
        if (r.hostId !== self || !r.seats.some((s) => s.id === m.as && s.bot)) return;
        from = String(m.as);
      }
      if (m.to === undefined) {
        socket.to(r.code).emit('room:msg', { from, data: m.data });
        return;
      }
      const target = r.seats.find((s) => s.id === m.to);
      if (!target) return;
      // Messages for a bot go to the host's browser, which runs it.
      const sock = socketOf(target.bot ? r.hostId : target.id);
      if (sock && sock.id !== socket.id) sock.emit('room:msg', { from, data: m.data, to: target.id });
    });

    socket.on('latency', (cb) => {
      if (typeof cb === 'function') cb();
    });

    socket.on('disconnect', () => {
      const p = me();
      // A reload can deliver the new connection's `hello` before the old one's `disconnect`.
      if (!p || p.socketId !== socket.id) return;
      p.socketId = undefined;
      const r = p.room ? rooms.get(p.room) : undefined;
      if (r) {
        scheduleOffline(r, p.id);
        pushRoom(r);
      } else {
        players.delete(p.id);
        pushLobby();
      }
    });
  });

  return {
    stats: () => ({ players: players.size, online: [...players.values()].filter((p) => p.socketId).length, rooms: rooms.size }),
  };
}
