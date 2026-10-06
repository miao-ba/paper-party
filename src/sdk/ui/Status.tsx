import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { WifiOff } from 'lucide-react';
import { useRoom } from '../room';
import { sfx } from '../../platform/audio/sfx';
import { S } from '../../platform/strings';

/** A strip listing seated humans who are offline (they have 90 s to come back). Put it under the header. */
export function OfflineBanner({ text }: { text?: (names: string) => ReactNode }) {
  const { players } = useRoom();
  const t = S.use();
  const off = players.filter((p) => !p.online && !p.bot);
  const names = off.map((p) => p.name).join(', ');
  return (
    <AnimatePresence>
      {off.length > 0 && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mx-3 overflow-hidden">
          <div className="mb-1 px-3 py-1.5 rounded-xl bg-accent/15 text-accent text-xs flex items-center gap-2">
            <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 1.2 }}>
              <WifiOff size={14} />
            </motion.span>
            <span className="truncate">{text ? text(names) : t.offlineWait(names)}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Bouncing dots + a line of text: "waiting for the host…", "loading…". */
export function Waiting({ children }: { children?: ReactNode }) {
  const t = S.use();
  return (
    <div className="flex flex-col items-center justify-center gap-3 text-ink-soft text-sm p-6">
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <motion.span key={i} className="w-2.5 h-2.5 rounded-full bg-ink/40" animate={{ y: [0, -8, 0] }} transition={{ repeat: Infinity, duration: 0.9, delay: i * 0.15 }} />
        ))}
      </div>
      <div>{children ?? t.waitingForHost}</div>
    </div>
  );
}

/** 3, 2, 1, go! — one tick sound per number. Mount it when the countdown starts. */
export function Countdown({ ms = 2400, step = 800, go = 'GO!' }: { ms?: number; step?: number; go?: ReactNode }) {
  const total = Math.ceil(ms / step);
  const [n, setN] = useState(total);
  useEffect(() => {
    const id = window.setInterval(() => setN((x) => Math.max(0, x - 1)), step);
    return () => window.clearInterval(id);
  }, [step]);
  useEffect(() => {
    if (n > 0) sfx.count();
    else sfx.go();
  }, [n]);
  return (
    <motion.div
      key={n}
      initial={{ scale: 2, opacity: 0, rotate: -10 }}
      animate={{ scale: 1, opacity: 1, rotate: n > 0 ? 0 : -4 }}
      transition={{ type: 'spring', stiffness: 520, damping: 20 }}
      className="text-7xl font-black text-ink drop-shadow-[0_4px_0_rgba(255,255,255,.7)] tabular-nums"
    >
      {n > 0 ? n : go}
    </motion.div>
  );
}

/** "Your turn!" pill that pops when `show` turns true. */
export function TurnBanner({ show, children }: { show: boolean; children: ReactNode }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: -10, opacity: 0, scale: 0.8 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: -10, opacity: 0, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 500, damping: 26 }}
          className="mx-auto w-fit px-4 py-1.5 rounded-full bg-ink text-paper text-sm font-bold shadow-lg"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Render children only after `ms` (e.g. let an explosion play before <GameOver>). */
export function Delayed({ ms, children }: { ms: number; children: ReactNode }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setOn(true), ms);
    return () => window.clearTimeout(id);
  }, [ms]);
  return on ? <>{children}</> : null;
}
