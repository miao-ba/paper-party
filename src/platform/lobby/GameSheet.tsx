// Tap a game card: rules, open a room for friends, or play right away with bots.
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bot, Minus, Plus, Star, Users, X } from 'lucide-react';
import { tr, useLang } from '@sdk/i18n';
import { TAG_LABEL, type GameMeta } from '@sdk/types';
import { Button } from '@sdk/ui/Button';
import { GameIcon } from '@sdk/ui/GameIcon';
import { RulesSheet } from '@sdk/ui/RulesSheet';
import { useNet } from '../net/NetContext';
import { getGame } from '../../games/registry';
import { setPrefs, toggleFavorite, usePrefs } from '../prefs';
import { statsByGame, useRecords } from '../records';
import { sfx } from '../audio/sfx';
import { S } from '../strings';

export function GameSheet({ meta, onClose }: { meta: GameMeta; onClose: () => void }) {
  const net = useNet();
  const prefs = usePrefs();
  const lang = useLang();
  const t = S.use();
  const recs = useRecords();
  const [rules, setRules] = useState(false);
  const [isPublic, setPublic] = useState(false);
  const [busy, setBusy] = useState(false);
  const minBots = Math.max(1, meta.players.min - 1);
  const maxBots = Math.max(minBots, meta.players.max - 1);
  const [bots, setBots] = useState(() => Math.max(minBots, Math.min(maxBots, prefs.botCount)));
  const [level, setLevel] = useState(prefs.botLevel);
  const fav = prefs.favorites.includes(meta.id);
  const mine = statsByGame(recs).get(meta.id);

  useEffect(() => {
    void getGame(meta.id)?.preload?.();
  }, [meta.id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const create = async () => {
    sfx.pop();
    setBusy(true);
    const ok = await net.createRoom(meta, isPublic);
    setBusy(false);
    if (ok) onClose();
  };
  const solo = () => {
    setPrefs({ botLevel: level });
    onClose();
    net.startSolo(meta, bots, level);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-ink/45 backdrop-blur-[2px] flex items-end sm:items-center justify-center sm:p-6" onClick={onClose}>
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 420, damping: 38 }}
        style={{ ['--h' as string]: meta.hue }}
        className="bg-paper w-full sm:max-w-md rounded-t-[2rem] sm:rounded-[2rem] px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl max-h-[92dvh] overflow-y-auto overscroll-contain"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1.5 rounded-full bg-ink/15 mx-auto mb-3 sm:hidden" />
        <div className="flex items-start gap-3">
          <motion.div initial={{ rotate: -12, scale: 0.6 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 14, delay: 0.05 }}>
            <GameIcon meta={meta} size={56} />
          </motion.div>
          <div className="flex-1 min-w-0 pt-0.5">
            <div className="text-xl font-black leading-tight">{tr(meta.name, lang)}</div>
            <div className="text-sm text-ink-soft mt-1 leading-snug">{tr(meta.tagline, lang)}</div>
          </div>
          <button onClick={() => { toggleFavorite(meta.id); sfx.pop(); }} className="p-2 rounded-xl active:bg-ink/10" aria-label={t.favorite}>
            <Star size={20} className={fav ? 'fill-gold text-[#e0a800]' : 'text-ink-soft'} />
          </button>
          <button onClick={onClose} className="p-2 -mr-2 rounded-xl text-ink-soft active:bg-ink/10" aria-label="close">
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 mt-3">
          <span className="px-2 py-0.5 rounded-full bg-[hsl(var(--h)_75%_93%)] text-[hsl(var(--h)_45%_35%)] text-xs font-bold">{t.playersRange(meta.players.min, meta.players.max)}</span>
          {meta.tags.map((tag) => (
            <span key={tag} className="px-2 py-0.5 rounded-full bg-[hsl(var(--h)_75%_93%)] text-[hsl(var(--h)_45%_35%)] text-xs font-bold">
              {tr(TAG_LABEL[tag], lang)}
            </span>
          ))}
          <span className="px-2 py-0.5 rounded-full bg-ink/5 text-ink-soft text-xs">{t.aboutMinutes(meta.minutes)}</span>
          <button onClick={() => setRules(true)} className="px-2 py-0.5 rounded-full bg-ink/5 text-ink text-xs font-bold underline underline-offset-2">
            {t.howToPlay}
          </button>
        </div>
        {mine && (
          <div className="mt-2 text-xs text-ink-soft">
            {mine.plays} {t.played} · {mine.wins} {t.won}
            {mine.best !== null && <> · {t.best} {mine.best}</>}
          </div>
        )}

        <div className="mt-4 rounded-3xl border-2 border-ink/10 p-4">
          <div className="flex items-center gap-2 font-bold"><Users size={16} /> {t.createRoom}</div>
          <div className="text-xs text-ink-soft mt-0.5">{t.createRoomHint}</div>
          <label className="flex items-center gap-2 mt-3 text-sm">
            <input type="checkbox" checked={isPublic} onChange={(e) => setPublic(e.target.checked)} className="w-4 h-4 accent-[#23212e]" />
            {t.publicRoom}
          </label>
          <Button size="lg" className="w-full mt-3" onClick={() => void create()} disabled={busy || !net.connected}>
            <Users size={18} /> {net.connected ? t.createRoom : t.connecting}
          </Button>
        </div>

        {meta.bots && (
          <div className="mt-3 rounded-3xl bg-[hsl(var(--h)_75%_94%)] border-2 border-[hsl(var(--h)_50%_84%)] p-4">
            <div className="flex items-center gap-2 font-bold mb-3"><Bot size={16} /> {t.playBots}</div>
            {meta.bots.desc && <div className="text-sm text-ink-soft leading-snug -mt-1.5 mb-3">{tr(meta.bots.desc, lang)}</div>}
            {maxBots > minBots && (
              <div className="flex items-center gap-3 mb-3">
                <span className="text-sm flex-1">{t.botCount}</span>
                <Stepper value={bots} min={minBots} max={maxBots} onChange={setBots} />
              </div>
            )}
            {meta.bots.levels && (
              <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-white/60">
                {t.levels.map((label, i) => (
                  <button key={label} onClick={() => { sfx.tap(); setLevel(i as 0 | 1 | 2); }} className={`relative py-1.5 rounded-xl text-sm font-bold ${level === i ? 'text-paper' : 'text-ink-soft'}`}>
                    {level === i && <motion.span layoutId="level-pill" className="absolute inset-0 rounded-xl bg-ink" transition={{ type: 'spring', stiffness: 500, damping: 35 }} />}
                    <span className="relative">{label}</span>
                  </button>
                ))}
              </div>
            )}
            <Button size="lg" variant="ghost" className="w-full mt-3" onClick={solo}>
              <Bot size={18} /> {t.start}
            </Button>
          </div>
        )}
      </motion.div>
      <AnimatePresence>{rules && <RulesSheet meta={meta} onClose={() => setRules(false)} />}</AnimatePresence>
    </motion.div>
  );
}

export function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  const btn = 'w-9 h-9 rounded-xl bg-white/80 border-2 border-ink/10 flex items-center justify-center disabled:opacity-30 active:scale-90 transition';
  return (
    <div className="flex items-center gap-2">
      <button className={btn} disabled={value <= min} onClick={() => { sfx.tap(); onChange(value - 1); }} aria-label="-">
        <Minus size={16} />
      </button>
      <span className="w-6 text-center text-lg font-black tabular-nums">{value}</span>
      <button className={btn} disabled={value >= max} onClick={() => { sfx.tap(); onChange(value + 1); }} aria-label="+">
        <Plus size={16} />
      </button>
    </div>
  );
}
