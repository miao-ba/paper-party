// Connection + lobby + room membership. Two kinds of rooms behind one API:
//   - server rooms (a join code, other people, the server relays messages)
//   - local rooms (solo vs bots in this tab; no server needed, works offline)
// Games never use this directly — they use @sdk's useRoom().
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { socket, clientId } from './socket';
import { normalizeCode, type LobbyInfo, type RoomView, type Seat } from '../../../shared/protocol';
import type { GameMeta } from '@sdk/types';
import { getLang } from '@sdk/i18n';
import { getPrefs, setPrefs, usePrefs } from '../prefs';
import { S } from '../strings';

export type Toast = { id: number; text: string; icon?: string; tone?: 'info' | 'good' | 'warn' };
type Level = 0 | 1 | 2;

interface HostOps {
  update: (patch: Partial<Pick<RoomView, 'options' | 'public'>>) => void;
  switchGame: (meta: GameMeta) => void;
  addBot: (level?: Level) => void;
  removeBot: (id: string) => void;
  botLevel: (id: string, level: Level) => void;
  kick: (id: string) => void;
  makeHost: (id: string) => void;
  /** Start (from the waiting room) or restart (while playing = "play again"). */
  start: () => void;
  /** Back to the waiting room. */
  end: () => void;
}

interface Net {
  name: string | null;
  setName: (n: string) => void;
  connected: boolean;
  /** Connected at least once (do not show "reconnecting" on first load). */
  everConnected: boolean;
  ping: number | null;
  lobby: LobbyInfo;
  room: RoomView | null;
  createRoom: (meta: GameMeta, isPublic: boolean) => Promise<boolean>;
  joinRoom: (code: string) => Promise<boolean>;
  leaveRoom: () => void;
  startSolo: (meta: GameMeta, bots: number, level: Level) => void;
  host: HostOps;
  toasts: Toast[];
  flash: (text: string, opts?: { icon?: string; tone?: Toast['tone']; ms?: number }) => void;
  dismissToast: (id: number) => void;
}

const NetCtx = createContext<Net>(null!);
export const useNet = () => useContext(NetCtx);

export const defaultOptions = (meta: GameMeta) => Object.fromEntries((meta.options ?? []).map((o) => [o.key, o.default]));

const BOT_AVATARS = ['🤖', '👾', '🛸', '🦾', '🧸', '🎃', '👻', '🐲'];
/** A bot name/avatar not used in the room yet. */
export function botIdentity(seats: Seat[]) {
  const names = S.get(getLang()).botNames;
  const used = new Set(seats.map((s) => s.name));
  const name = names.find((n) => !used.has(n)) ?? `${names[0]} ${seats.length + 1}`;
  const usedAv = new Set(seats.map((s) => s.avatar));
  const avatar = BOT_AVATARS.find((a) => !usedAv.has(a)) ?? '🤖';
  return { name, avatar };
}

const codeFromUrl = () => {
  const c = new URLSearchParams(location.search).get('r');
  return c ? normalizeCode(c) : null;
};

export function NetProvider({ children }: { children: ReactNode }) {
  const prefs = usePrefs();
  const [name, setNameState] = useState<string | null>(() => localStorage.getItem('name'));
  const [connected, setConnected] = useState(false);
  const [everConnected, setEverConnected] = useState(false);
  const [ping, setPing] = useState<number | null>(null);
  const [lobby, setLobby] = useState<LobbyInfo>({ online: 0, rooms: [] });
  const [room, setRoom] = useState<RoomView | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pendingCode = useRef<string | null>(codeFromUrl());
  const roomRef = useRef(room);
  roomRef.current = room;

  const flash: Net['flash'] = (text, opts = {}) => {
    const id = Date.now() + Math.random();
    setToasts((l) => [...l.slice(-2), { id, text, icon: opts.icon, tone: opts.tone }]);
    window.setTimeout(() => setToasts((l) => l.filter((t) => t.id !== id)), opts.ms ?? 2800);
  };
  const flashRef = useRef(flash);
  flashRef.current = flash;

  const joinRoom = (code: string) =>
    new Promise<boolean>((resolve) => {
      const c = normalizeCode(code);
      const t = S.get();
      if (c.length !== 4) {
        flashRef.current(t.badCode, { icon: '🤔', tone: 'warn' });
        return resolve(false);
      }
      socket.timeout(6000).emit('room:join', { code: c }, (err, res) => {
        if (err || !res?.ok) {
          const e = err ? 'timeout' : res && !res.ok ? res.error : 'unknown';
          flashRef.current(t.joinError(e), { icon: '🚪', tone: 'warn' });
          return resolve(false);
        }
        resolve(true);
      });
    });

  // ---- socket lifecycle
  useEffect(() => {
    if (!name) return;
    const hello = () => socket.emit('hello', { clientId, name, avatar: getPrefs().avatar, build: __BUILD__ });
    const onConnect = () => {
      setConnected(true);
      setEverConnected(true);
      hello();
    };
    const onDisconnect = () => {
      setConnected(false);
      setPing(null);
    };
    const onRoom = (r: RoomView | null, why?: { reason: string }) => {
      setRoom((prev) => (r ? r : prev?.local ? prev : null));
      const t = S.get();
      if (!r && why?.reason === 'kicked') flashRef.current(t.kicked, { icon: '👢', tone: 'warn' });
      if (!r && why?.reason === 'closed') flashRef.current(t.seatLost, { icon: '⌛', tone: 'warn' });
      // Opened a ?r=CODE link: join it once the server told us where we are (a reload of the same
      // room needs nothing; a link to another room moves us there).
      const c = pendingCode.current;
      pendingCode.current = null;
      if (c && c !== r?.code) {
        void joinRoom(c).then((ok) => {
          if (ok) return;
          const url = new URL(location.href);
          url.searchParams.delete('r');
          history.replaceState(null, '', url);
        });
      }
    };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room:state', onRoom);
    socket.on('lobby', setLobby);
    if (socket.connected) onConnect();
    else socket.connect();
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room:state', onRoom);
      socket.off('lobby', setLobby);
    };
  }, [name]); // eslint-disable-line react-hooks/exhaustive-deps

  // New avatar → tell the server (others see it at once).
  useEffect(() => {
    if (name && socket.connected) socket.emit('hello', { clientId, name, avatar: prefs.avatar, build: __BUILD__ });
    setRoom((r) => (r?.local ? { ...r, players: r.players.map((p) => (p.id === clientId ? { ...p, name: name ?? p.name, avatar: prefs.avatar } : p)) } : r));
  }, [prefs.avatar, name]);

  // Latency: an acked ping every 5 s.
  useEffect(() => {
    if (!connected) return;
    const measure = () => {
      const t = performance.now();
      socket.timeout(4000).emit('latency', (err: unknown) => {
        if (!err) setPing(Math.round(performance.now() - t));
      });
    };
    measure();
    const id = window.setInterval(measure, 5000);
    return () => window.clearInterval(id);
  }, [connected]);

  // The address bar always holds the room link (refresh / share it).
  useEffect(() => {
    const url = new URL(location.href);
    if (room && !room.local) url.searchParams.set('r', room.code);
    else if (!pendingCode.current) url.searchParams.delete('r');
    if (url.href !== location.href) history.replaceState(null, '', url);
  }, [room?.code, room?.local]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- local rooms (solo vs bots)
  const meSeat = (): Seat => ({ id: clientId, name: name ?? '?', avatar: getPrefs().avatar, online: true });
  const editLocal = (fn: (r: RoomView) => RoomView | null) => setRoom((r) => (r?.local ? fn(r) : r));
  const isLocal = () => !!roomRef.current?.local;
  const seated = (r: RoomView) => r.players.filter((p) => !p.spectator);

  const host: HostOps = {
    update: (patch) => (isLocal() ? editLocal((r) => ({ ...r, ...patch })) : socket.emit('room:update', patch)),
    switchGame: (meta) => {
      const patch = { gameId: meta.id, min: meta.players.min, max: meta.players.max, options: defaultOptions(meta) };
      if (!isLocal()) return socket.emit('room:update', patch);
      editLocal((r) => {
        const players = [...r.players];
        while (players.length > patch.max && players.some((p) => p.bot)) players.splice(players.map((p) => !!p.bot).lastIndexOf(true), 1);
        return { ...r, ...patch, players };
      });
    },
    addBot: (level = getPrefs().botLevel) => {
      const r = roomRef.current;
      if (!r) return;
      const who = botIdentity(r.players);
      if (!r.local) return socket.emit('room:bot:add', { ...who, level });
      editLocal((x) => (seated(x).length >= x.max ? x : { ...x, players: [...x.players, { id: `bot-${Math.random().toString(36).slice(2, 8)}`, ...who, bot: { level }, online: true }] }));
    },
    removeBot: (id) => (isLocal() ? editLocal((r) => ({ ...r, players: r.players.filter((p) => p.id !== id) })) : socket.emit('room:bot:remove', { id })),
    botLevel: (id, level) =>
      isLocal() ? editLocal((r) => ({ ...r, players: r.players.map((p) => (p.id === id && p.bot ? { ...p, bot: { level } } : p)) })) : socket.emit('room:bot:level', { id, level }),
    kick: (id) => socket.emit('room:kick', { id }),
    makeHost: (id) => socket.emit('room:host', { id }),
    start: () => (isLocal() ? editLocal((r) => (seated(r).length < r.min ? r : { ...r, status: 'playing', round: r.round + 1 })) : socket.emit('room:start')),
    end: () => (isLocal() ? editLocal((r) => ({ ...r, status: 'waiting' })) : socket.emit('room:end')),
  };

  const value: Net = {
    name,
    setName: (n) => {
      const v = n.trim().slice(0, 16);
      if (!v) return;
      localStorage.setItem('name', v);
      setNameState(v);
    },
    connected,
    everConnected,
    ping,
    lobby,
    room,
    createRoom: (meta, isPublic) =>
      new Promise<boolean>((resolve) => {
        socket
          .timeout(6000)
          .emit('room:create', { gameId: meta.id, min: meta.players.min, max: meta.players.max, options: defaultOptions(meta), public: isPublic }, (err, res) => {
            if (err || !res?.ok) {
              flashRef.current(S.get().createError, { icon: '😵', tone: 'warn' });
              return resolve(false);
            }
            resolve(true);
          });
      }),
    joinRoom,
    leaveRoom: () => {
      if (room?.local) setRoom(null);
      else socket.emit('room:leave');
    },
    startSolo: (meta, bots, level) => {
      setPrefs({ botCount: bots, botLevel: level });
      if (room && !room.local) socket.emit('room:leave');
      const seats: Seat[] = [meSeat()];
      const n = Math.max(meta.players.min - 1, Math.min(meta.players.max - 1, bots));
      for (let i = 0; i < n; i++) seats.push({ id: `bot-${i}-${Math.random().toString(36).slice(2, 6)}`, ...botIdentity(seats), bot: { level }, online: true });
      setRoom({
        code: `LOCAL-${Date.now().toString(36)}`,
        gameId: meta.id,
        hostId: clientId,
        status: 'playing',
        public: false,
        min: meta.players.min,
        max: meta.players.max,
        options: defaultOptions(meta),
        players: seats,
        round: 1,
        local: true,
      });
    },
    host,
    toasts,
    flash,
    dismissToast: (id) => setToasts((l) => l.filter((t) => t.id !== id)),
  };
  // Dev console: __net.room, __net.host.addBot(), __net.joinRoom('ABCD')…
  if (import.meta.env.DEV) (window as unknown as { __net: Net }).__net = value;
  return <NetCtx.Provider value={value}>{children}</NetCtx.Provider>;
}
