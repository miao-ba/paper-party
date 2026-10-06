// Wire protocol shared by the server and the client.
// The server is a *relay*: it knows rooms, seats and who is host, but nothing about any game.

/** A seat in a room. Bots are seats too: they are owned and simulated by the host's browser. */
export interface Seat {
  id: string;
  name: string;
  avatar: string | null;
  /** Present for bot seats. level: 0 easy / 1 normal / 2 hard */
  bot?: { level: 0 | 1 | 2 };
  online: boolean;
  /** Joined while a game was running: watches until the room goes back to the waiting room. */
  spectator?: boolean;
}

export type RoomStatus = 'waiting' | 'playing';

export interface RoomView {
  /** 4-letter join code, e.g. "KXPT". Local (offline / solo) rooms use "LOCAL-…". */
  code: string;
  gameId: string;
  hostId: string;
  status: RoomStatus;
  /** Listed in the lobby's open-room list. */
  public: boolean;
  /** Seat limits come from the game's meta (the server only enforces them). */
  min: number;
  max: number;
  /** Game options chosen by the host in the waiting room (see GameMeta.options). */
  options: Record<string, unknown>;
  /** Seat order is stable; index 0 is usually the creator. */
  players: Seat[];
  /** Incremented every time a game starts (rematch = new round). Games remount on a new round. */
  round: number;
  /** Set when the room only exists in this browser tab (solo vs bots, no server). */
  local?: boolean;
}

/** Entry in the lobby's open-room list. */
export interface PublicRoom {
  code: string;
  gameId: string;
  host: string;
  hostAvatar: string | null;
  players: number;
  max: number;
  status: RoomStatus;
}

export interface LobbyInfo {
  online: number;
  rooms: PublicRoom[];
}

export type JoinError = 'not-found' | 'full' | 'kicked' | 'invalid';
export type Ack<T = object> = (res: ({ ok: true } & T) | { ok: false; error: string }) => void;

/** Payload relayed between players. `to` = only this seat; `as` = host speaking for one of its bots. */
export interface RelayOut { data: unknown; to?: string; as?: string }
export interface RelayIn { from: string; data: unknown; to?: string }

export interface ClientToServer {
  hello: (p: { clientId: string; name: string; avatar?: string | null; build?: string }) => void;
  'room:create': (p: { gameId: string; min: number; max: number; options: Record<string, unknown>; public: boolean }, ack: Ack<{ code: string }>) => void;
  'room:join': (p: { code: string }, ack: Ack<{ code: string }>) => void;
  'room:leave': () => void;
  /** Host only. */
  'room:update': (p: Partial<Pick<RoomView, 'gameId' | 'min' | 'max' | 'options' | 'public'>>) => void;
  'room:bot:add': (p: { name: string; avatar: string; level: 0 | 1 | 2 }) => void;
  'room:bot:remove': (p: { id: string }) => void;
  'room:bot:level': (p: { id: string; level: 0 | 1 | 2 }) => void;
  'room:kick': (p: { id: string }) => void;
  'room:start': () => void;
  /** Host: end the game and go back to the waiting room. */
  'room:end': () => void;
  /** Host hands the crown to someone else. */
  'room:host': (p: { id: string }) => void;
  'room:msg': (p: RelayOut) => void;
  latency: (cb: () => void) => void;
}

export interface ServerToClient {
  /** Full room snapshot after any change (null = you are not in a room any more). */
  'room:state': (room: RoomView | null, why?: { reason: RoomLeaveReason; by?: string }) => void;
  'room:msg': (m: RelayIn) => void;
  lobby: (info: LobbyInfo) => void;
}

export type RoomLeaveReason = 'left' | 'kicked' | 'closed';

/** Hard limits (also documented in docs/architecture.md). */
export const LIMITS = {
  name: 16,
  avatar: 8,
  seats: 16,
  /** Relayed messages per second per socket (burst = 2×). Extra messages are dropped. */
  msgPerSec: 60,
  /** Max relayed payload, bytes (JSON). */
  msgBytes: 64 * 1024,
  /** Reconnect grace before an offline player loses the seat. */
  graceMs: 90_000,
  rooms: 5000,
} as const;

/** Unambiguous letters for room codes (no I, O, 0, 1). */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const normalizeCode = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
