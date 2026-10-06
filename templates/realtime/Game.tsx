// __NAME__ — a message-based real-time game. The host referees; everyone renders.
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Avatar, Button, Countdown, GameHeader, GameOver, OfflineBanner, defineStrings, haptic, sfx, useHostClock, useMessage, useRipples, useRoom, type Result } from '@sdk';
import { COUNTDOWN_MS, GOAL, standings, type Msg } from './logic';

const T = defineStrings({
  'zh-TW': { ready: '準備好了', waiting: '等其他人準備…', tap: '點！點！點！', go: '衝！' },
  en: { ready: "I'm ready", waiting: 'Waiting for the others…', tap: 'TAP! TAP! TAP!', go: 'GO!' },
});

type Phase = 'ready' | 'countdown' | 'race' | 'over';

export default function Game() {
  const room = useRoom();
  const { me, players, isHost, send } = room;
  const clock = useHostClock();
  const ripple = useRipples();
  const t = T.use();
  const [phase, setPhase] = useState<Phase>('ready');
  const [ready, setReady] = useState<string[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>(() => Object.fromEntries(players.map((p) => [p.id, 0])));
  const [result, setResult] = useState<Result | null>(null);
  const mine = useRef(0);
  const host = useRef({ ready: new Set<string>(), started: false, done: false, counts: {} as Record<string, number> });

  // ---- host: start when everyone is ready, declare the winner
  const hostReady = (id: string) => {
    const h = host.current;
    h.ready.add(id);
    if (!h.started && players.every((p) => h.ready.has(p.id))) {
      h.started = true;
      const msg: Msg = { t: 'tr:start', at: clock.hostNow() + COUNTDOWN_MS };
      send(msg);
      start(msg.at);
    }
  };
  const hostCount = (id: string, n: number) => {
    const h = host.current;
    if (h.done) return;
    h.counts[id] = Math.max(h.counts[id] ?? 0, n);
    if (n >= GOAL) {
      h.done = true;
      const msg: Msg = { t: 'tr:win', winner: id, counts: { ...h.counts } };
      send(msg);
      finish(msg);
    }
  };

  // ---- everyone
  const start = (hostAt: number) => {
    setPhase('countdown');
    window.setTimeout(() => setPhase((p) => (p === 'countdown' ? 'race' : p)), Math.max(0, clock.toLocal(hostAt) - performance.now()));
  };
  const finish = (m: Extract<Msg, { t: 'tr:win' }>) => {
    setPhase('over');
    setCounts((c) => ({ ...c, ...m.counts }));
    const r: Result = { winners: [m.winner], ranking: standings(m.counts), scores: m.counts };
    room.report(r);
    setResult(r);
  };

  useMessage<Msg>((m, from) => {
    if (m.t === 'tr:ready') {
      setReady((l) => (l.includes(from) ? l : [...l, from]));
      if (isHost) hostReady(from);
    } else if (m.t === 'tr:start') {
      if (!isHost) start(m.at);
    } else if (m.t === 'tr:count') {
      setCounts((c) => ({ ...c, [from]: Math.max(c[from] ?? 0, m.n) }));
      if (isHost) hostCount(from, m.n);
    } else if (m.t === 'tr:win') {
      if (!isHost) finish(m);
    }
  });

  const onReady = () => {
    sfx.tap();
    setReady((l) => [...l, me.id]);
    send({ t: 'tr:ready' } satisfies Msg);
    if (isHost) hostReady(me.id);
  };
  const onTap = () => {
    if (phase !== 'race') return;
    mine.current += 1;
    const n = mine.current;
    setCounts((c) => ({ ...c, [me.id]: n }));
    send({ t: 'tr:count', n } satisfies Msg);
    if (isHost) hostCount(me.id, n);
    sfx.tap();
    haptic('light');
  };
  useEffect(() => {
    if (phase === 'race') sfx.go();
  }, [phase]);

  return (
    <div className="h-full flex flex-col">
      <GameHeader scores={counts} />
      <OfflineBanner />
      <div className="flex-1 min-h-0 flex flex-col short:flex-row gap-3 p-3">
        {/* one lane per player */}
        <div className="flex flex-col gap-2 justify-center short:flex-1">
          {players.map((p) => (
            <div key={p.id} className="flex items-center gap-2">
              <Avatar emoji={p.avatar} name={p.name} size={28} ring={p.color} bot={p.bot} dim={phase === 'ready' && !ready.includes(p.id)} />
              <div className="flex-1 h-4 rounded-full bg-ink/10 overflow-hidden">
                <motion.div className="h-full rounded-full" style={{ background: p.color }} animate={{ width: `${Math.min(100, ((counts[p.id] ?? 0) / GOAL) * 100)}%` }} transition={{ type: 'spring', stiffness: 400, damping: 30 }} />
              </div>
            </div>
          ))}
        </div>
        <motion.button
          onPointerDown={(e) => {
            ripple.add(e);
            onTap();
          }}
          whileTap={phase === 'race' ? { scale: 0.97 } : undefined}
          className="relative flex-1 min-h-[12rem] rounded-3xl bg-gradient-to-b from-[#ffd98a] to-[#f2a65a] shadow-[0_8px_0_#c97a35] active:shadow-none active:translate-y-2 flex items-center justify-center text-3xl font-black select-none touch-none overflow-hidden"
        >
          {phase === 'ready' && (ready.includes(me.id) ? <span className="text-base font-normal">{t.waiting}</span> : null)}
          {phase === 'countdown' && <Countdown ms={COUNTDOWN_MS} go={t.go} />}
          {phase === 'race' && t.tap}
          {ripple.node}
        </motion.button>
      </div>
      {phase === 'ready' && !ready.includes(me.id) && (
        <footer className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] flex justify-center">
          <Button size="lg" onClick={onReady}>{t.ready}</Button>
        </footer>
      )}
      {result && <GameOver result={result} />}
    </div>
  );
}
