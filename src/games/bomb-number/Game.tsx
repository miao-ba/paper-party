import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Delete } from 'lucide-react';
import { Avatar, Button, Delayed, GameHeader, GameOver, OfflineBanner, Waiting, defineStrings, haptic, sfx, useGameState } from '@sdk';
import { logic } from './logic';

const T = defineStrings({
  'zh-TW': {
    range: '密碼在這之間',
    left: (n: number) => `還剩 ${n} 個數字`,
    yourTurn: '輪到你猜！',
    waiting: (n: string) => `${n} 在想…`,
    guess: '猜',
    outOfRange: (a: number, b: number) => `要在 ${a}–${b} 之間`,
    higher: '太小',
    lower: '太大',
    boom: '炸了！',
  },
  en: {
    range: 'The bomb is between',
    left: (n: number) => `${n} numbers left`,
    yourTurn: 'Your guess!',
    waiting: (n: string) => `${n} is thinking…`,
    guess: 'Guess',
    outOfRange: (a: number, b: number) => `Between ${a} and ${b}`,
    higher: 'too low',
    lower: 'too high',
    boom: 'BOOM!',
  },
});

export default function Game() {
  const g = useGameState(logic);
  const t = T.use();
  const [typed, setTyped] = useState('');
  const s = g.state;

  // Sound + buzz when someone guesses; a boom when it blows up.
  const count = s?.history.length ?? 0;
  useEffect(() => {
    if (!s || !count) return;
    if (s.loser) {
      sfx.crash();
      haptic('triple');
    } else {
      sfx.stamp();
      if (g.myTurn) haptic('light');
    }
  }, [count]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setTyped(''), [g.myTurn]);

  if (!s) return <Waiting />;
  const lo = s.lo + 1;
  const hi = s.hi - 1;
  const n = Number(typed);
  const valid = typed !== '' && n >= lo && n <= hi;
  const heat = 1 - Math.min(1, Math.log10(hi - lo + 1) / 3); // 0 calm … 1 about to blow
  const press = (d: string) => {
    sfx.tap();
    setTyped((x) => (x + d).replace(/^0+/, '').slice(0, String(hi).length));
  };
  const submit = () => {
    if (!valid) return;
    sfx.pop();
    g.act({ type: 'guess', n });
    setTyped('');
  };
  const turnName = g.seat(s.turn)?.name ?? '?';

  return (
    <div
      className="h-full flex flex-col"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (!g.myTurn) return;
        if (/^\d$/.test(e.key)) press(e.key);
        else if (e.key === 'Backspace') setTyped((x) => x.slice(0, -1));
        else if (e.key === 'Enter') submit();
      }}
    >
      <GameHeader players={g.seats} active={g.turn} away={g.away} />
      <OfflineBanner />
      <div className="flex-1 min-h-0 flex flex-col short:flex-row">
        {/* range + bomb */}
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 px-4">
          <div className="text-sm text-ink-soft">{t.range}</div>
          <div className="flex items-center gap-3 sm:gap-5">
            <Num n={lo} />
            <motion.div
              className="text-6xl sm:text-7xl select-none"
              animate={s.loser ? { scale: [1, 2.4, 0], rotate: [0, 20, 0] } : { rotate: [0, -6 - heat * 10, 6 + heat * 10, 0], scale: 1 + heat * 0.25 }}
              transition={s.loser ? { duration: 0.6 } : { repeat: Infinity, duration: 1.4 - heat * 1.1 }}
            >
              💣
            </motion.div>
            <Num n={hi} />
          </div>
          <AnimatePresence>
            {s.loser ? (
              <motion.div key="boom" initial={{ scale: 0.2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-4xl font-black text-accent">
                💥 {s.secret} · {t.boom}
              </motion.div>
            ) : (
              <div className="text-xs text-ink-soft tabular-nums">{t.left(hi - lo + 1)}</div>
            )}
          </AnimatePresence>
          {history()}
        </div>

        {/* number pad / waiting */}
        <footer className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 short:w-72 short:shrink-0 short:flex short:flex-col short:justify-center">
          {g.myTurn ? (
            <div className="mx-auto w-full max-w-xs">
              <div className="flex items-center gap-2 mb-2">
                <div className={`flex-1 h-12 rounded-2xl border-2 flex items-center justify-center text-2xl font-black tabular-nums ${typed && !valid ? 'border-accent text-accent' : 'border-ink/15 bg-white/70'}`}>
                  {typed || <span className="text-sm font-normal text-ink-soft">{t.yourTurn}</span>}
                </div>
                <Button onClick={submit} disabled={!valid} className="h-12 px-5">
                  {t.guess}
                </Button>
              </div>
              {typed && !valid && <div className="text-xs text-accent text-center -mt-1 mb-1">{t.outOfRange(lo, hi)}</div>}
              <div className="grid grid-cols-3 gap-1.5">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                  <Key key={d} onClick={() => press(d)}>{d}</Key>
                ))}
                <Key onClick={() => { sfx.undo(); setTyped(''); }}>C</Key>
                <Key onClick={() => press('0')}>0</Key>
                <Key onClick={() => setTyped((x) => x.slice(0, -1))} label="backspace"><Delete size={20} /></Key>
              </div>
            </div>
          ) : !s.loser ? (
            <div className="h-24 flex items-center justify-center text-ink-soft">{t.waiting(turnName)}</div>
          ) : null}
        </footer>
      </div>
      {g.result && <Delayed ms={1300}><GameOver result={g.result} players={g.seats} /></Delayed>}
    </div>
  );

  function history() {
    const recent = s!.history.slice(-6).reverse();
    return (
      <div className="flex flex-wrap justify-center gap-1.5 max-w-sm min-h-[2rem]">
        <AnimatePresence initial={false}>
          {recent.map((h, i) => {
            const p = g.seat(h.by);
            const boom = s!.loser === h.by && i === 0;
            const low = s!.secret !== null ? h.n < s!.secret : h.n <= s!.lo;
            return (
              <motion.span
                key={s!.history.length - i}
                layout
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: i === 0 ? 1 : 0.7 }}
                className={`flex items-center gap-1 pl-0.5 pr-2 py-0.5 rounded-full text-sm font-bold ${boom ? 'bg-accent text-white' : 'bg-paper border-2 border-ink/10'}`}
              >
                <Avatar emoji={p?.avatar} name={p?.name ?? '?'} size={20} ring={p?.color} />
                <span className="tabular-nums">{h.n}</span>
                {!boom && <span className="text-[10px] text-ink-soft font-normal">{low ? t.higher : t.lower}</span>}
              </motion.span>
            );
          })}
        </AnimatePresence>
      </div>
    );
  }
}

function Num({ n }: { n: number }) {
  return (
    <motion.div key={n} initial={{ y: -16, opacity: 0, scale: 1.4 }} animate={{ y: 0, opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 20 }} className="min-w-[4.5rem] px-3 py-2 rounded-2xl bg-paper border-2 border-ink/10 shadow-[0_4px_0_rgba(35,33,46,.1)] text-3xl sm:text-4xl font-black text-center tabular-nums">
      {n}
    </motion.div>
  );
}

function Key({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label?: string }) {
  return (
    <motion.button whileTap={{ scale: 0.9 }} onClick={onClick} aria-label={label} className="h-12 short:h-10 rounded-2xl bg-paper border-2 border-ink/10 shadow-[0_3px_0_rgba(35,33,46,.12)] active:shadow-none active:translate-y-0.5 text-xl font-black flex items-center justify-center">
      {children}
    </motion.button>
  );
}
