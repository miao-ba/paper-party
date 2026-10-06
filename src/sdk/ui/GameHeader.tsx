// The standard in-game header: every player (avatar in seat colour, name, your score badge, whose turn),
// then reactions, sound and the room menu (rules / back to room / leave). Fits a 360 px wide phone:
// with many players the strip scrolls sideways.
import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, DoorOpen, LogOut, Menu, Smile, Volume2, VolumeX } from 'lucide-react';
import { useReactions, useRoom } from '../room';
import { useNet } from '../../platform/net/NetContext';
import { setPrefs, usePrefs } from '../../platform/prefs';
import { sfx } from '../../platform/audio/sfx';
import { haptic } from '../../platform/audio/haptic';
import { S } from '../../platform/strings';
import { Avatar } from './Avatar';
import { RulesSheet } from './RulesSheet';

export interface HeaderPlayer {
  id: string;
  name: string;
  avatar: string | null;
  color: string;
  bot?: boolean;
}

export function GameHeader({ players, scores, active, away = [], center, actions }: {
  /** Default: the room's seated players. Engine games may pass `g.seats` (keeps players who left). */
  players?: HeaderPlayer[];
  /** Small badge per player id (score, cards left, ✓…). */
  scores?: Record<string, ReactNode>;
  /** Whose turn it is. */
  active?: string | string[] | null;
  /** Ids played by a bot because the person left. */
  away?: string[];
  /** One short line of info under the players. */
  center?: ReactNode;
  /** Extra buttons before the standard ones. */
  actions?: ReactNode;
}) {
  const room = useRoom();
  const list = players ?? room.players;
  const activeSet = new Set(active == null ? [] : Array.isArray(active) ? active : [active]);
  // 4+ players: avatars only (the active player keeps a name). 3 players: shorter names.
  const compact = list.length > 3;
  const tight = list.length === 3;
  return (
    <header className="relative z-20 pt-[max(0.5rem,env(safe-area-inset-top))] pb-1">
      <div className="px-2 sm:px-3 flex items-center gap-1 sm:gap-2">
        <div className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto no-scrollbar py-1 -my-1 pl-1">
          {list.map((p) => {
            const live = room.player(p.id);
            return (
              <PlayerChip
                key={p.id}
                player={p}
                me={p.id === room.me.id}
                online={live ? live.online : false}
                away={away.includes(p.id) || !live}
                active={activeSet.has(p.id)}
                compact={compact}
                tight={tight}
                badge={scores?.[p.id]}
              />
            );
          })}
        </div>
        {actions}
        <ReactButton />
        <MuteButton />
        <RoomMenu />
      </div>
      {center !== undefined && center !== null && center !== false && (
        <div className="px-3 mt-1 text-center text-xs text-ink-soft truncate">{center}</div>
      )}
    </header>
  );
}

export function PlayerChip({ player, me, online = true, away, active, compact, tight, badge }: {
  player: HeaderPlayer;
  me?: boolean;
  online?: boolean;
  away?: boolean;
  active?: boolean;
  compact?: boolean;
  tight?: boolean;
  badge?: ReactNode;
}) {
  const t = S.use();
  return (
    <motion.div
      layout
      animate={{ scale: active ? 1.05 : 1 }}
      className={`relative flex items-center gap-1 pl-0.5 ${!compact || active || (badge !== undefined && badge !== null) ? 'pr-2' : 'pr-0.5'} py-0.5 rounded-full bg-paper border-2 shrink-0 ${active ? 'border-ink shadow-[0_3px_0_#23212e]' : 'border-ink/10'}`}
      title={`${player.name}${me ? ` (${t.you})` : ''}${away ? ` · ${t.botPlays}` : ''}`}
    >
      <Avatar emoji={player.avatar} name={player.name} size={22} ring={player.color} bot={player.bot || away} dim={!online && !player.bot && !away} className="m-[3px]" />
      {/* Many players: only the active player's name is spelled out (the rest is in the tooltip). */}
      {(!compact || active) && (
        <span className={`font-bold text-sm truncate ${compact ? 'max-w-[4.2rem]' : tight ? 'max-w-[3.2rem] sm:max-w-[8rem]' : 'max-w-[4.6rem] sm:max-w-[8rem]'} ${me ? 'underline decoration-2 underline-offset-2' : ''}`} style={me ? { textDecorationColor: player.color } : undefined}>
          {player.name}
        </span>
      )}
      {badge !== undefined && badge !== null && <span className="shrink-0 text-xs font-bold tabular-nums flex items-center gap-0.5">{badge}</span>}
      {active && (
        <motion.span
          className="absolute -inset-[3px] rounded-full border-2 pointer-events-none"
          style={{ borderColor: player.color }}
          animate={{ opacity: [0.8, 0, 0.8], scale: [1, 1.1, 1] }}
          transition={{ repeat: Infinity, duration: 1.6 }}
        />
      )}
    </motion.div>
  );
}

export function MuteButton({ className = '' }: { className?: string }) {
  const { muted } = usePrefs();
  return (
    <button
      onClick={() => {
        setPrefs({ muted: !muted });
        if (muted) window.setTimeout(() => sfx.pop(), 0);
      }}
      className={`p-1.5 sm:p-2 rounded-xl text-ink-soft active:bg-ink/10 shrink-0 ${className}`}
      aria-label={muted ? 'unmute' : 'mute'}
    >
      {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
    </button>
  );
}

const EMOTES = ['😂', '😍', '😮', '😭', '😡', '👍', '🔥', '🎉', '💀', '🤡'];

/** Emoji + quick phrases for everybody in the room. */
export function ReactButton() {
  const { react } = useReactions();
  const t = S.use();
  const [open, setOpen] = useState(false);
  const [cool, setCool] = useState(0);
  const send = (r: { emoji?: string; text?: string }) => {
    const now = Date.now();
    if (now - cool < 350) return;
    setCool(now);
    react(r);
    sfx.pokeSent();
    haptic('light');
    setOpen(false);
  };
  return (
    <div className="relative shrink-0">
      <motion.button
        whileTap={{ scale: 0.88 }}
        onClick={() => {
          sfx.tap();
          setOpen((o) => !o);
        }}
        className={`p-1.5 sm:p-2 rounded-full border-2 ${open ? 'bg-ink text-paper border-ink' : 'bg-paper border-ink/15'}`}
        aria-label={t.emotes}
      >
        <Smile size={18} />
      </motion.button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.85, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.85, y: -6 }}
              transition={{ type: 'spring', stiffness: 500, damping: 32 }}
              style={{ transformOrigin: 'top right' }}
              className="absolute right-[-3rem] sm:right-0 top-full mt-2 z-40 w-[18.5rem] max-w-[calc(100vw-1rem)] bg-paper rounded-3xl border-2 border-ink/10 shadow-xl p-3"
            >
              <div className="grid grid-cols-5 gap-1">
                {EMOTES.map((e) => (
                  <motion.button key={e} whileTap={{ scale: 0.8 }} onClick={() => send({ emoji: e })} className="text-2xl h-11 rounded-xl active:bg-ink/10">
                    {e}
                  </motion.button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {t.phrases.map((p) => (
                  <button key={p} onClick={() => send({ text: p })} className="px-2.5 py-1 rounded-full bg-ink/5 text-sm active:bg-ink/15">
                    {p}
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Rules, back to room (host), leave (with confirmation), latency. */
export function RoomMenu() {
  const room = useRoom();
  const net = useNet();
  const t = S.use();
  const [open, setOpen] = useState(false);
  const [rules, setRules] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const close = () => {
    setOpen(false);
    setConfirm(false);
  };
  const item = 'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-2xl text-sm font-semibold active:bg-ink/10 text-left';
  return (
    <div className="relative shrink-0">
      <button
        onClick={() => {
          sfx.tap();
          setOpen((o) => !o);
          setConfirm(false);
        }}
        className="p-1.5 sm:p-2 rounded-xl text-ink-soft active:bg-ink/10"
        aria-label={t.menu}
      >
        <Menu size={19} />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-30" onClick={close} />
            <motion.div
              initial={{ opacity: 0, scale: 0.85, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.85, y: -6 }}
              transition={{ type: 'spring', stiffness: 500, damping: 32 }}
              style={{ transformOrigin: 'top right' }}
              className="absolute right-0 top-full mt-2 z-40 bg-paper rounded-3xl border-2 border-ink/10 shadow-xl p-1.5 w-60"
            >
              <button
                className={item}
                onClick={() => {
                  close();
                  setRules(true);
                }}
              >
                <BookOpen size={17} /> {t.howToPlay}
              </button>
              {room.isHost && (
                <button
                  className={item}
                  onClick={() => {
                    close();
                    room.backToRoom();
                  }}
                >
                  <DoorOpen size={17} />
                  <span className="flex-1">
                    {t.backToRoom}
                    <span className="block text-[11px] text-ink-soft font-normal leading-tight">{t.backToRoomHint}</span>
                  </span>
                </button>
              )}
              <div className="h-px bg-ink/10 my-1" />
              {confirm ? (
                <div className="p-2">
                  <div className="text-xs text-ink-soft mb-2">{room.local ? t.leaveSolo : t.leaveOnline}</div>
                  <div className="flex gap-2">
                    <button onClick={() => setConfirm(false)} className="flex-1 py-1.5 rounded-xl border-2 border-ink/15 text-sm font-semibold">
                      {t.cancel}
                    </button>
                    <button onClick={room.leave} className="flex-1 py-1.5 rounded-xl bg-accent text-white text-sm font-bold shadow-[0_3px_0_#a53c2c] active:shadow-none active:translate-y-0.5">
                      {t.leave}
                    </button>
                  </div>
                </div>
              ) : (
                <button className={`${item} text-accent`} onClick={() => setConfirm(true)}>
                  <LogOut size={17} /> {t.leaveRoom}
                </button>
              )}
              {!room.local && net.ping !== null && (
                <div className="px-3 pt-1 pb-1.5 text-[11px] text-ink-soft flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${net.ping < 80 ? 'bg-accent-2' : net.ping < 200 ? 'bg-gold' : 'bg-accent'}`} />
                  {t.latency(net.ping)}
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <AnimatePresence>{rules && <RulesSheet meta={room.meta} onClose={() => setRules(false)} />}</AnimatePresence>
    </div>
  );
}
