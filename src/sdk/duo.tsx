// Compatibility layer for 2-player games written for the original two-player app.
// Porting one is mostly changing imports:
//
//   useRoom()        → useDuo()          { me, peer, isHost, send, leave, solo, difficulty, report }
//   GameHeader       → DuoHeader         left / right / center props, as before
//   PlayerTag        → PlayerTag         side + name (+ active, children)
//   PeerOffline      → OfflineBanner
//   useClockSync()   → useHostClock()    same { synced, toLocal }
//
// Sides: the host is always 'L', the other player 'R' (a bot is never host, so bots are 'R').
// See docs/porting-2p-games.md.
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useRoom } from './room';
import { MuteButton, ReactButton, RoomMenu } from './ui/GameHeader';
import { Avatar } from './ui/Avatar';

export type Side = 'L' | 'R';
export const other = (s: Side): Side => (s === 'L' ? 'R' : 'L');
/** Seat colours of the original app: L coral, R teal. */
export const SIDE_COLOR: Record<Side, string> = { L: '#e8604c', R: '#2f9e95' };

export interface DuoPlayer {
  id: string;
  name: string;
  avatar: string | null;
  online: boolean;
  bot: boolean;
  side: Side;
}

export function useDuo() {
  const room = useRoom();
  const sideOf = (id: string): Side => (id === room.host.id ? 'L' : 'R');
  const toDuo = (p: { id: string; name: string; avatar: string | null; online: boolean; bot: boolean }): DuoPlayer => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    online: p.online,
    bot: p.bot,
    side: sideOf(p.id),
  });
  const otherPlayer = room.players.find((p) => !p.isMe) ?? room.players[0];
  const me = toDuo(room.me);
  const peer = toDuo(otherPlayer);
  return {
    room,
    me,
    peer,
    isHost: room.isHost,
    send: (msg: unknown) => room.send(msg),
    leave: room.leave,
    /** Playing against a bot (the original "solo" mode). */
    solo: peer.bot,
    /** The bot's difficulty 0/1/2 (1 when the peer is human). */
    difficulty: otherPlayer.level,
    sideOf,
    idOf: (side: Side) => (side === me.side ? me.id : peer.id),
    /** Original report shape: winner 'L' | 'R' | 'draw' | null (co-op). */
    report: (r: { winner: Side | 'draw' | null; score?: string; value?: number }) => {
      const id = r.winner === 'L' || r.winner === 'R' ? (r.winner === me.side ? me.id : peer.id) : null;
      room.report({ winners: id ? [id] : [], coop: r.winner === null, value: r.value });
    },
  };
}

/** The original header API: left / right player tags and a centre line (hidden under 400 px). */
export function DuoHeader({ left, right, center, actions }: { left?: ReactNode; right?: ReactNode; center?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="relative z-20 px-2 sm:px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-1 flex items-center gap-1 sm:gap-2">
      {left}
      <div className="flex-1 min-w-0 text-center text-xs text-ink-soft truncate hidden min-[400px]:block">{center}</div>
      <div className="flex-1 min-[400px]:hidden" />
      {right}
      {actions}
      <ReactButton />
      <MuteButton />
      <RoomMenu />
    </header>
  );
}

/** The original name tag: avatar ringed in the side colour, name, optional badge. */
export function PlayerTag({ side, name, active, children, className = '' }: { side: Side; name: string; active?: boolean; children?: ReactNode; className?: string }) {
  const { me, peer } = useDuo();
  const who = side === me.side ? me : peer;
  return (
    <motion.div
      animate={{ scale: active ? 1.04 : 1, opacity: active === false ? 0.75 : 1 }}
      className={`relative flex items-center gap-1 pl-0.5 pr-2 py-0.5 rounded-full bg-paper border-2 min-w-0 shrink ${active ? 'border-ink shadow-[0_3px_0_#23212e]' : 'border-ink/10'} ${className}`}
      title={name}
    >
      <Avatar emoji={who.avatar} name={name} size={20} ring={SIDE_COLOR[side]} bot={who.bot} dim={!who.online} className="m-[3px]" />
      <span className="font-bold text-sm truncate min-w-[1.9rem] max-w-[4.2rem] sm:max-w-[8rem]">{name}</span>
      {children !== undefined && <span className="shrink-0 text-xs flex items-center gap-0.5 tabular-nums">{children}</span>}
    </motion.div>
  );
}
