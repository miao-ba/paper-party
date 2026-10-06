// The lobby: join a room by code, open public rooms, recently played, and the game catalogue.
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BarChart3, Eye, LogIn, Pencil, Settings, Star, Users } from 'lucide-react';
import { tr, useLang } from '@sdk/i18n';
import { TAG_LABEL, type GameMeta, type GameModule, type GameTag } from '@sdk/types';
import { Avatar } from '@sdk/ui/Avatar';
import { Button } from '@sdk/ui/Button';
import { GameIcon } from '@sdk/ui/GameIcon';
import { MuteButton } from '@sdk/ui/GameHeader';
import { normalizeCode, type PublicRoom } from '../../../shared/protocol';
import { useNet } from '../net/NetContext';
import { games, getGame } from '../../games/registry';
import { toggleFavorite, usePrefs } from '../prefs';
import { statsByGame, useRecords } from '../records';
import { sfx } from '../audio/sfx';
import { S } from '../strings';
import { GameSheet } from './GameSheet';
import { SettingsSheet } from './Settings';
import { StatsSheet } from './Stats';

type Filter = 'all' | 'fav' | GameTag;

export function Lobby() {
  const net = useNet();
  const prefs = usePrefs();
  const lang = useLang();
  const t = S.use();
  const recs = useRecords();
  const [open, setOpen] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'settings' | 'stats' | null>(null);
  const [filter, setFilter] = useState<Filter>(() => (sessionStorage.getItem('lobbyFilter') as Filter) || 'all');
  useEffect(() => sessionStorage.setItem('lobbyFilter', filter), [filter]);

  const usedTags = [...new Set(games.flatMap((g) => g.meta.tags))];
  const filters: Filter[] = ['all', ...(prefs.favorites.length ? (['fav'] as const) : []), ...usedTags];
  const shown = games.filter(({ meta }) => (filter === 'all' ? true : filter === 'fav' ? prefs.favorites.includes(meta.id) : meta.tags.includes(filter)));
  const recent = prefs.recent.map((id) => getGame(id)).filter((g): g is GameModule => !!g).slice(0, 4);
  const stats = statsByGame(recs);
  const label = (f: Filter) => (f === 'all' ? t.all : f === 'fav' ? t.favorites : tr(TAG_LABEL[f], lang));

  return (
    <div className="min-h-full w-full max-w-md sm:max-w-2xl lg:max-w-4xl mx-auto px-4 sm:px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-16 flex flex-col gap-5">
      <motion.header initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between gap-2">
        <button onClick={() => setSheet('settings')} className="flex items-center gap-2.5 min-w-0 text-left">
          <Avatar emoji={prefs.avatar} name={net.name ?? '?'} size={44} />
          <div className="min-w-0">
            <div className="text-[11px] text-ink-soft tracking-widest">{t.appName}</div>
            <div className="text-xl font-bold flex items-center gap-1.5 leading-tight">
              <span className="truncate">{net.name}</span>
              <Pencil size={13} className="text-ink-soft shrink-0" />
            </div>
          </div>
        </button>
        <div className="flex items-center gap-0.5 shrink-0">
          <ConnDot />
          <button onClick={() => { sfx.tap(); setSheet('stats'); }} className="p-2 rounded-xl text-ink-soft active:bg-ink/10" aria-label={t.stats}>
            <BarChart3 size={19} />
          </button>
          <MuteButton />
          <button onClick={() => { sfx.tap(); setSheet('settings'); }} className="p-2 rounded-xl text-ink-soft active:bg-ink/10" aria-label={t.settings}>
            <Settings size={19} />
          </button>
        </div>
      </motion.header>

      <JoinCard />
      <OpenRooms rooms={net.lobby.rooms} />

      {recent.length > 0 && (
        <section>
          <h2 className="text-sm text-ink-soft mb-2">{t.recent}</h2>
          <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 no-scrollbar">
            {recent.map((g) => (
              <motion.button
                key={g.meta.id}
                whileTap={{ scale: 0.95 }}
                onClick={() => { sfx.tap(); setOpen(g.meta.id); }}
                className="flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-2xl bg-paper border-2 border-ink/10 shrink-0"
              >
                <GameIcon meta={g.meta} size={32} />
                <span className="text-sm font-bold whitespace-nowrap">{tr(g.meta.name, lang)}</span>
              </motion.button>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="flex items-center gap-2 mb-2.5">
          <h2 className="text-sm text-ink-soft shrink-0">{t.pickGame}</h2>
          <div className="flex gap-1 overflow-x-auto no-scrollbar -mr-4 pr-4">
            {filters.map((f) => (
              <button key={f} onClick={() => { sfx.tap(); setFilter(f); }} className={`relative px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap ${filter === f ? 'text-paper' : 'text-ink-soft bg-ink/5'}`}>
                {filter === f && <motion.span layoutId="lobby-filter" className="absolute inset-0 rounded-full bg-ink" transition={{ type: 'spring', stiffness: 500, damping: 35 }} />}
                <span className="relative">{label(f)}</span>
              </button>
            ))}
          </div>
        </div>
        <motion.div layout className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <AnimatePresence mode="popLayout">
            {shown.map(({ meta }, i) => (
              <GameCard key={meta.id} meta={meta} i={i} fav={prefs.favorites.includes(meta.id)} plays={stats.get(meta.id)?.plays ?? 0} onOpen={() => setOpen(meta.id)} />
            ))}
          </AnimatePresence>
        </motion.div>
        {shown.length === 0 && <div className="text-sm text-ink-soft py-6 text-center">{t.noGames}</div>}
      </section>

      <footer className="text-center text-[11px] text-ink-soft/80 mt-2">
        {t.version(__BUILD__)} · {t.credits}
      </footer>

      <AnimatePresence>
        {open && getGame(open) && <GameSheet key={open} meta={getGame(open)!.meta} onClose={() => setOpen(null)} />}
        {sheet === 'settings' && <SettingsSheet key="settings" onClose={() => setSheet(null)} />}
        {sheet === 'stats' && <StatsSheet key="stats" onClose={() => setSheet(null)} />}
      </AnimatePresence>
    </div>
  );
}

function JoinCard() {
  const net = useNet();
  const t = S.use();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (busy) return;
    sfx.tap();
    setBusy(true);
    await net.joinRoom(code);
    setBusy(false);
  };
  return (
    <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-[1.75rem] bg-paper border-2 border-ink/10 shadow-[0_10px_30px_-18px_rgba(35,33,46,.45)] p-4">
      <div className="flex items-center gap-2 font-bold mb-0.5">
        <LogIn size={17} /> {t.joinRoom}
      </div>
      <div className="text-xs text-ink-soft mb-3">{t.joinHint}</div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void go();
        }}
      >
        <input
          value={code}
          onChange={(e) => setCode(normalizeCode(e.target.value))}
          placeholder="ABCD"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          aria-label={t.roomCode}
          className="flex-1 min-w-0 text-2xl font-black tracking-[0.5em] text-center uppercase px-3 py-2 rounded-2xl bg-white/70 border-2 border-ink/15 focus:border-ink/60 outline-none placeholder:text-ink/15"
        />
        <Button type="submit" disabled={code.length !== 4 || busy || !net.connected} className="px-5">
          {t.join}
        </Button>
      </form>
    </motion.section>
  );
}

function OpenRooms({ rooms }: { rooms: PublicRoom[] }) {
  const net = useNet();
  const lang = useLang();
  const t = S.use();
  return (
    <section>
      <h2 className="text-sm text-ink-soft mb-2 flex items-center gap-1.5">
        <Users size={14} /> {t.openRooms}
      </h2>
      {rooms.length === 0 ? (
        <div className="text-xs text-ink-soft/80 px-1">{t.noOpenRooms}</div>
      ) : (
        <div className="flex flex-col gap-2">
          {rooms.map((r) => {
            const g = getGame(r.gameId);
            const full = r.players >= r.max;
            return (
              <motion.button
                key={r.code}
                layout
                whileTap={{ scale: 0.98 }}
                onClick={() => { sfx.tap(); void net.joinRoom(r.code); }}
                className="flex items-center gap-3 p-2.5 pr-3 rounded-2xl bg-paper border-2 border-ink/10 text-left"
              >
                {g ? <GameIcon meta={g.meta} size={40} /> : <span className="w-10 h-10 rounded-xl bg-ink/10" />}
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate">{g ? tr(g.meta.name, lang) : r.gameId}</div>
                  <div className="text-xs text-ink-soft flex items-center gap-1 truncate">
                    <Avatar emoji={r.hostAvatar} name={r.host} size={16} /> {r.host} · {r.players}/{r.max}
                    {r.status === 'playing' && <span className="ml-1 px-1.5 rounded-full bg-gold/30 text-ink text-[10px] font-bold">{t.inGame}</span>}
                  </div>
                </div>
                <span className={`px-3 py-1.5 rounded-xl text-sm font-bold flex items-center gap-1 ${r.status === 'playing' || full ? 'bg-ink/5' : 'bg-ink text-paper'}`}>
                  {r.status === 'playing' || full ? <><Eye size={14} /> {t.watch}</> : t.join}
                </span>
              </motion.button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function GameCard({ meta, i, fav, plays, onOpen }: { meta: GameMeta; i: number; fav: boolean; plays: number; onOpen: () => void }) {
  const lang = useLang();
  const t = S.use();
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 18, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ delay: 0.03 * i, type: 'spring', stiffness: 380, damping: 26 }}
      className="relative"
      style={{ ['--h' as string]: meta.hue }}
    >
      <motion.button
        whileHover={{ y: -3 }}
        whileTap={{ scale: 0.96 }}
        onClick={() => { sfx.tap(); onOpen(); }}
        onPointerEnter={() => void getGame(meta.id)?.preload?.()}
        className="w-full h-full text-left rounded-3xl p-4 flex flex-col bg-[hsl(var(--h)_75%_93%)] border-2 border-[hsl(var(--h)_50%_80%)] shadow-[0_6px_0_hsl(var(--h)_50%_80%)] active:shadow-none active:translate-y-1 transition-shadow"
      >
        <GameIcon meta={meta} size={44} className="mb-3" />
        <div className="font-bold text-lg leading-tight pr-5">{tr(meta.name, lang)}</div>
        <div className="text-xs text-ink-soft mt-1 flex-1 line-clamp-3">{tr(meta.tagline, lang)}</div>
        <div className="flex flex-wrap items-center gap-1 mt-3 text-[10px] font-bold text-[hsl(var(--h)_45%_35%)]">
          <span className="px-1.5 py-0.5 rounded-full bg-white/70">{t.playersRange(meta.players.min, meta.players.max)}</span>
          <span className="px-1.5 py-0.5 rounded-full bg-white/60">{t.minutes(meta.minutes)}</span>
          {plays > 0 && <span className="px-1.5 py-0.5 rounded-full bg-white/60 tabular-nums">×{plays}</span>}
        </div>
      </motion.button>
      <motion.button whileTap={{ scale: 0.75 }} onClick={() => { toggleFavorite(meta.id); sfx.pop(); }} className="absolute top-2.5 right-2.5 p-1.5 rounded-full" aria-label={t.favorite}>
        <Star size={17} className={fav ? 'fill-gold text-[#e0a800]' : 'text-[hsl(var(--h)_40%_60%)]'} />
      </motion.button>
    </motion.div>
  );
}

function ConnDot() {
  const net = useNet();
  const t = S.use();
  const good = net.connected && (net.ping ?? 0) < 200;
  return (
    <span className="flex items-center gap-1 px-1.5 text-[11px] text-ink-soft" title={net.ping !== null ? `${net.ping} ms` : ''}>
      <span className={`w-2 h-2 rounded-full ${!net.connected ? 'bg-accent animate-pulse' : good ? 'bg-accent-2' : 'bg-gold'}`} />
      <span className="tabular-nums whitespace-nowrap">{net.connected ? t.online(net.lobby.online) : t.connecting}</span>
    </span>
  );
}
