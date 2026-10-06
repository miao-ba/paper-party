import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Lock } from 'lucide-react';
import { Avatar, Button, GameHeader, GameOver, OfflineBanner, Waiting, defineStrings, haptic, sfx, useGameState } from '@sdk';
import { MAX_PICK, REVEAL_MS, logic, lowestUnique, type State } from './logic';

const T = defineStrings({
  'zh-TW': {
    round: (a: number, b: number) => `第 ${a} / ${b} 回合`,
    pick: '選一個數字',
    hint: '沒人撞號的最小數字得分（分數 = 那個數字）',
    lock: (n: number) => `就選 ${n}`,
    locked: (n: number) => `你選了 ${n}，等其他人…`,
    watching: '觀戰中',
    wins: (name: string, n: number) => `${name} 以 ${n} 拿下 ${n} 分！`,
    nobody: '全部撞號，沒人得分 💥',
    you: '你',
  },
  en: {
    round: (a: number, b: number) => `Round ${a} / ${b}`,
    pick: 'Pick a number',
    hint: 'The smallest number nobody else picked scores (points = the number)',
    lock: (n: number) => `Lock in ${n}`,
    locked: (n: number) => `You picked ${n}. Waiting for the others…`,
    watching: 'Watching',
    wins: (name: string, n: number) => `${name} takes ${n} with a ${n}!`,
    nobody: 'Everything collided — no points 💥',
    you: 'You',
  },
});

export default function Game() {
  const g = useGameState(logic);
  const t = T.use();
  const [choice, setChoice] = useState<number | null>(null);
  const s = g.state;

  const phase = s?.phase;
  const round = s?.round;
  useEffect(() => setChoice(null), [round]);
  useEffect(() => {
    if (phase === 'reveal' && s) {
      const last = s.log[s.log.length - 1];
      if (last?.winner && last.winner === g.me?.id) {
        sfx.jackpot();
        haptic('double');
      } else if (last?.winner) sfx.coin();
      else sfx.miss();
    } else if (phase === 'pick' && round && round > 1) sfx.swap();
  }, [phase, round]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!s) return <Waiting />;
  const mine = g.me ? s.picks[g.me.id] : null;
  const pickedCount = s.order.filter((id) => s.picks[id] !== null).length;

  return (
    <div className="h-full flex flex-col">
      <GameHeader players={g.seats} away={g.away} active={g.turn} scores={s.scores} center={t.round(s.round, s.rounds)} />
      <OfflineBanner />
      <div className="flex-1 min-h-0 flex flex-col short:flex-row">
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-4 px-4">
          <AnimatePresence mode="wait">
            {s.phase === 'pick' ? (
              <motion.div key={`pick${s.round}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="w-full max-w-sm flex flex-col items-center gap-3">
                <div className="text-lg font-black">{g.me ? t.pick : t.watching}</div>
                <div className="text-xs text-ink-soft text-center">{t.hint}</div>
                <div className="grid grid-cols-4 gap-2 w-full mt-1">
                  {Array.from({ length: MAX_PICK }, (_, i) => i + 1).map((n) => {
                    const sel = (mine ?? choice) === n;
                    const disabled = !g.me || mine !== null;
                    return (
                      <motion.button
                        key={n}
                        whileTap={disabled ? undefined : { scale: 0.9 }}
                        disabled={disabled}
                        onClick={() => {
                          sfx.tap();
                          setChoice(n);
                        }}
                        className={`aspect-square rounded-2xl text-3xl font-black tabular-nums border-2 transition ${sel ? 'bg-ink text-paper border-ink shadow-[0_4px_0_#0f0e14] -translate-y-1' : 'bg-paper border-ink/10 shadow-[0_4px_0_rgba(35,33,46,.12)]'} ${disabled && !sel ? 'opacity-40' : ''}`}
                      >
                        {n}
                      </motion.button>
                    );
                  })}
                </div>
                <Pickers s={s} seats={g.seats} />
              </motion.div>
            ) : (
              <Reveal key={`rev${s.round}`} s={s} seats={g.seats} meId={g.me?.id} />
            )}
          </AnimatePresence>
        </div>
        <footer className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 min-h-[76px] flex items-center justify-center short:w-64 short:shrink-0">
          {s.phase === 'pick' && g.me && (mine !== null ? (
            <div className="text-sm text-ink-soft flex items-center gap-1.5"><Lock size={14} /> {t.locked(mine)} ({pickedCount}/{s.order.length})</div>
          ) : (
            <Button size="lg" className="w-full max-w-sm" disabled={choice === null} onClick={() => { sfx.pop(); haptic('light'); g.act({ type: 'pick', n: choice! }); }}>
              <Lock size={17} /> {choice ? t.lock(choice) : t.pick}
            </Button>
          ))}
        </footer>
      </div>
      {g.result && <GameOver result={g.result} players={g.seats} />}
    </div>
  );
}

function Pickers({ s, seats }: { s: State; seats: { id: string; name: string; avatar: string | null; color: string; bot: boolean }[] }) {
  return (
    <div className="flex flex-wrap justify-center gap-1.5 mt-2">
      {seats.map((p) => (
        <span key={p.id} className="relative">
          <Avatar emoji={p.avatar} name={p.name} size={28} ring={p.color} bot={p.bot} dim={s.picks[p.id] === null} />
          {s.picks[p.id] !== null && <Check size={13} className="absolute -top-1 -right-1 bg-accent-2 text-white rounded-full p-0.5" />}
        </span>
      ))}
    </div>
  );
}

function Reveal({ s, seats, meId }: { s: State; seats: { id: string; name: string; avatar: string | null; color: string; bot: boolean }[]; meId?: string }) {
  const t = T.use();
  const last = s.log[s.log.length - 1];
  if (!last) return null;
  const { winner, value } = lowestUnique(last.picks);
  const w = seats.find((p) => p.id === winner);
  const columns = Array.from({ length: MAX_PICK }, (_, i) => i + 1).map((n) => ({ n, ids: Object.keys(last.picks).filter((id) => last.picks[id] === n) }));
  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="w-full max-w-md flex flex-col items-center gap-4">
      <div className="flex items-end justify-center gap-1.5 w-full">
        {columns.map(({ n, ids }, ci) => {
          const unique = ids.length === 1;
          const won = n === value && !!winner;
          return (
            <div key={n} className="flex-1 flex flex-col items-center gap-1">
              <div className="flex flex-col-reverse items-center gap-0.5 min-h-[2rem]">
                {ids.map((id, i) => {
                  const p = seats.find((x) => x.id === id);
                  return (
                    <motion.span key={id} initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 + ci * 0.08 + i * 0.05, type: 'spring', stiffness: 500, damping: 20 }}>
                      <Avatar emoji={p?.avatar} name={p?.name ?? '?'} size={26} ring={p?.color} bot={p?.bot} />
                    </motion.span>
                  );
                })}
              </div>
              <motion.div
                animate={won ? { scale: [1, 1.25, 1.1] } : {}}
                transition={{ delay: 0.9 }}
                className={`w-full aspect-square max-w-[3rem] rounded-xl flex items-center justify-center text-xl font-black tabular-nums border-2 ${won ? 'bg-gold border-[#c08a00]' : ids.length > 1 ? 'bg-accent/15 border-accent/30 text-accent line-through' : unique ? 'bg-paper border-ink/20' : 'bg-ink/[.04] border-transparent text-ink-soft'}`}
              >
                {n}
              </motion.div>
            </div>
          );
        })}
      </div>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1 }} className="text-center text-lg font-black">
        {w ? t.wins(w.id === meId ? t.you : w.name, value) : t.nobody}
      </motion.div>
      <div className="w-40 h-1 rounded-full bg-ink/10 overflow-hidden">
        <motion.div className="h-full bg-ink/40" initial={{ width: '100%' }} animate={{ width: '0%' }} transition={{ duration: REVEAL_MS / 1000, ease: 'linear' }} />
      </div>
    </motion.div>
  );
}
