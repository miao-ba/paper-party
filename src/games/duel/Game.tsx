import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { RotateCcw } from 'lucide-react';
import { useMessage, Button, OfflineBanner as PeerOffline, useRipples, celebrate, sfx, haptic } from '@sdk';
import { useDuo as useRoom, DuoHeader as GameHeader, PlayerTag } from '@sdk/duo';
import { useClockSync } from '../shared/clock';
import type { Side } from '../shared/layout';
import { DRAW_DELAY, SLOW_MS, WIN_SCORE, resolve, outcomeText, type Outcome, type Shot } from './logic';

type Phase = 'lobby' | 'wait' | 'draw' | 'result' | 'over';
export type Msg =
  | { t: 'ready'; side: Side }
  | { t: 'round'; n: number; drawAt: number } // drawAt 是房主時鐘
  | { t: 'shot'; n: number; side: Side; shot: Shot }
  | { t: 'rematch' };

const RESULT_HOLD_MS = 2400;

export default function Game() {
  const { me, peer, isHost, send, leave, report } = useRoom();
  const mySide = me.side;
  const clock = useClockSync();
  const ripple = useRipples();
  const names: Record<Side, string> = { [mySide]: me.name, [peer.side]: peer.name } as Record<Side, string>;

  const [phase, setPhase] = useState<Phase>('lobby');
  const [ready, setReady] = useState<Record<Side, boolean>>({ L: false, R: false });
  const [round, setRound] = useState(0);
  const [score, setScore] = useState<Record<Side, number>>({ L: 0, R: 0 });
  const [shots, setShots] = useState<Partial<Record<Side, Shot>>>({});
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [myReaction, setMyReaction] = useState<number | null>(null);

  // 用 ref 存時間點，handler 裡不吃 stale state
  const phaseRef = useRef<Phase>('lobby');
  phaseRef.current = phase;
  const roundRef = useRef(0);
  roundRef.current = round;
  const drawAtLocal = useRef(0);
  const drawShownAt = useRef(0);
  const shotsRef = useRef<Partial<Record<Side, Shot>>>({});
  const scoreRef = useRef(score);
  scoreRef.current = score;
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => clearTimers, []);

  // ---- 房主：排下一回合 ----
  const scheduleRound = (n: number) => {
    const drawAt = performance.now() + DRAW_DELAY.min + Math.random() * (DRAW_DELAY.max - DRAW_DELAY.min);
    send({ t: 'round', n, drawAt } satisfies Msg);
    startRound(n, drawAt);
  };

  // ---- 兩邊：進入回合 ----
  const startRound = (n: number, drawAtHost: number) => {
    clearTimers();
    setRound(n);
    roundRef.current = n;
    setShots({});
    shotsRef.current = {};
    setOutcome(null);
    setMyReaction(null);
    setPhase('wait');
    phaseRef.current = 'wait';
    drawAtLocal.current = clock.toLocal(drawAtHost);
    const delay = Math.max(0, drawAtLocal.current - performance.now());
    later(() => {
      if (phaseRef.current !== 'wait') return; // 已經自爆了
      drawShownAt.current = performance.now();
      setPhase('draw');
      phaseRef.current = 'draw';
      sfx.draw();
      haptic('medium');
      later(() => {
        if (!shotsRef.current[mySide]) submitShot({ reaction: SLOW_MS, early: false });
      }, SLOW_MS);
    }, delay);
  };

  const submitShot = (shot: Shot) => {
    if (shotsRef.current[mySide]) return;
    shotsRef.current = { ...shotsRef.current, [mySide]: shot };
    setShots(shotsRef.current);
    setMyReaction(shot.reaction);
    send({ t: 'shot', n: roundRef.current, side: mySide, shot } satisfies Msg);
    tryResolve();
  };

  const tryResolve = () => {
    const s = shotsRef.current;
    if (!s.L || !s.R) return;
    const o = resolve(s.L, s.R);
    setOutcome(o);
    setPhase('result');
    phaseRef.current = 'result';
    const next = { ...scoreRef.current };
    if (o.winner) next[o.winner] += 1;
    scoreRef.current = next;
    setScore(next);
    if (o.winner === mySide) { sfx.win2(); haptic('double'); } else if (o.winner) { sfx.lose2(); haptic('heavy'); } else sfx.miss();
    const over = next.L >= WIN_SCORE || next.R >= WIN_SCORE;
    later(() => {
      if (over) {
        setPhase('over'); phaseRef.current = 'over';
        if (next[mySide] >= WIN_SCORE) { sfx.win(); celebrate(); } else sfx.lose();
        report({ winner: next.L >= WIN_SCORE ? 'L' : 'R', score: `${next.L}:${next.R}` });
      }
      else if (isHost) scheduleRound(roundRef.current + 1);
    }, RESULT_HOLD_MS);
  };

  // ---- 收訊息 ----
  useMessage<Msg>((m) => {
    switch (m.t) {
      case 'ready': {
        const r = { ...ready, [m.side]: true };
        setReady(r);
        if (isHost && r.L && r.R && phaseRef.current === 'lobby') later(() => scheduleRound(1), 600);
        break;
      }
      case 'round':
        startRound(m.n, m.drawAt);
        break;
      case 'shot':
        if (m.n !== roundRef.current) return;
        shotsRef.current = { ...shotsRef.current, [m.side]: m.shot };
        setShots(shotsRef.current);
        tryResolve();
        break;
      case 'rematch':
        resetAll();
        break;
    }
  });

  const resetAll = () => {
    clearTimers();
    setScore({ L: 0, R: 0 }); scoreRef.current = { L: 0, R: 0 };
    setReady({ L: false, R: false });
    setRound(0); setShots({}); shotsRef.current = {}; setOutcome(null); setMyReaction(null);
    setPhase('lobby'); phaseRef.current = 'lobby';
  };
  const onReady = () => {
    sfx.tap();
    const r = { ...ready, [mySide]: true };
    setReady(r);
    send({ t: 'ready', side: mySide } satisfies Msg);
    if (isHost && r.L && r.R) later(() => scheduleRound(1), 600);
  };
  const rematch = () => { send({ t: 'rematch' } satisfies Msg); resetAll(); };

  // ---- 大按鈕：整個畫面 ----
  const onTap = () => {
    const now = performance.now();
    if (phaseRef.current === 'wait') {
      sfx.miss(); haptic('triple');
      submitShot({ reaction: Math.round(now - drawAtLocal.current), early: true });
    } else if (phaseRef.current === 'draw') {
      sfx.shot(); haptic('heavy');
      submitShot({ reaction: Math.round(now - drawShownAt.current), early: false });
    }
  };

  const myShot = shots[mySide];
  const bothReady = ready.L && ready.R;
  const bg =
    phase === 'draw' ? 'from-yellow-200 to-orange-300' : phase === 'wait' ? 'from-[#f3c9a2] to-[#c88a5e]' : 'from-[#f8dcb8] to-[#e2a97a]';

  return (
    <div className="h-full flex flex-col">
      <GameHeader
        left={<PlayerTag side={mySide} name={me.name}><Dots n={score[mySide]} /></PlayerTag>}
        center={<>{round > 0 && `第 ${round} 回合`}{!clock.synced && !isHost && ' · 對時中…'}</>}
        right={<PlayerTag side={peer.side} name={peer.name}><Dots n={score[peer.side]} /></PlayerTag>}
      />
      <PeerOffline />
      <div className="flex-1 min-h-0 flex flex-col short:flex-row">

      <motion.div
        onPointerDown={(e) => { if (phaseRef.current !== 'lobby') ripple.add(e); onTap(); }}
        className={`flex-1 min-h-0 m-3 short:mr-0 rounded-3xl bg-gradient-to-b ${bg} relative overflow-hidden select-none touch-none shadow-[0_18px_40px_-16px_rgba(35,33,46,.5)]`}
        animate={phase === 'draw' ? { scale: [1, 1.02, 1] } : { scale: 1 }}
        transition={{ duration: 0.25 }}
      >
        {/* 太陽 + 地面 */}
        <div className="absolute left-1/2 -translate-x-1/2 top-[12%] w-24 h-24 rounded-full bg-[#ffd98a] opacity-80 blur-[1px]" />
        <div className="absolute inset-x-0 bottom-0 h-[32%] bg-[#d9b27a]/70" />
        <div className="absolute inset-x-0 bottom-[32%] h-1 bg-[#8a6a3d]/30" />

        {/* 兩個牛仔：我永遠在左 */}
        <Cowboy side={mySide} name={me.name} left phase={phase} outcome={outcome} shot={shots[mySide]} />
        <Cowboy side={peer.side} name={peer.name} left={false} phase={phase} outcome={outcome} shot={shots[peer.side]} />

        {/* 中央訊息 */}
        <div className="absolute inset-x-0 top-0 bottom-[40%] flex items-center justify-center pointer-events-none px-[15%]">
          <AnimatePresence mode="wait">
            {phase === 'lobby' && (
              <motion.div key="lobby" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center px-6">
                <div className="text-5xl short:text-3xl mb-2">🤠</div>
                <div className="font-bold text-lg">看到「拔槍！」就點畫面</div>
                <div className="text-sm text-ink-soft mt-1">太早點會自爆。先贏 {WIN_SCORE} 回合的贏</div>
              </motion.div>
            )}
            {phase === 'wait' && (
              <motion.div key="wait" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center">
                {myShot?.early ? (
                  <div className="text-2xl font-bold text-side-l">太早了！💨</div>
                ) : (
                  <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.6 }} className="text-xl text-ink/70 tracking-[0.5em]">
                    等…
                  </motion.div>
                )}
              </motion.div>
            )}
            {phase === 'draw' && (
              <motion.div key="draw" initial={{ scale: 0.3, rotate: -8 }} animate={{ scale: 1, rotate: -4 }} transition={{ type: 'spring', stiffness: 700, damping: 18 }} className="text-6xl font-black text-ink drop-shadow-[0_4px_0_rgba(255,255,255,.6)]">
                {myShot ? `${myShot.reaction} ms` : '拔槍！'}
              </motion.div>
            )}
            {(phase === 'result' || phase === 'over') && outcome && (
              <motion.div key={`r${round}`} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="text-center bg-paper/85 rounded-2xl px-5 py-3">
                <div className="text-xl font-bold">{outcomeText(outcome, mySide, names)}</div>
                <div className="text-sm text-ink-soft mt-1">
                  {names[mySide]} {fmt(shots[mySide])} ・ {names[peer.side]} {fmt(shots[peer.side])}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {ripple.node}
      </motion.div>

      <footer className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] min-h-[84px] flex items-center justify-center short:w-56 short:shrink-0 short:pb-3">
        {phase === 'lobby' && (ready[mySide] ? <div className="text-ink-soft">{bothReady ? '開始！' : `等 ${peer.name} 準備…`}</div> : <Button size="lg" onClick={onReady}>準備好了</Button>)}
        {(phase === 'wait' || phase === 'draw') && <div className="text-ink-soft text-sm">{myReaction === null ? '點畫面任何地方' : '等對方…'}</div>}
        {phase === 'result' && <div className="text-ink-soft text-sm">下一回合…</div>}
        {phase === 'over' && (
          <div className="flex gap-3 w-full max-w-sm short:flex-col">
            <Button variant="ghost" className="flex-1" onClick={leave}>回大廳</Button>
            <Button className="flex-1" onClick={rematch}><RotateCcw size={16} /> 再來</Button>
          </div>
        )}
      </footer>
      </div>

      <AnimatePresence>
        {phase === 'over' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pointer-events-none fixed top-16 short:top-12 inset-x-0 flex justify-center z-30">
            <motion.div initial={{ scale: 0.6, rotate: -6 }} animate={{ scale: 1, rotate: -2 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }} className="bg-ink text-paper rounded-3xl px-7 py-4 text-center shadow-2xl">
              <div className="text-4xl">{score[mySide] >= WIN_SCORE ? '🏆' : '💀'}</div>
              <div className="text-xl font-bold">{score[mySide] >= WIN_SCORE ? '你是最快的槍' : `${peer.name} 是最快的槍`}</div>
              <div className="text-sm opacity-70">{score[mySide]} : {score[peer.side]}</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function fmt(s?: Shot) {
  if (!s) return '—';
  if (s.early) return `早了 ${Math.abs(s.reaction)} ms`;
  if (s.reaction >= SLOW_MS) return '沒反應';
  return `${s.reaction} ms`;
}

function Dots({ n }: { n: number }) {
  return (
    <span className="tracking-tighter">
      {Array.from({ length: WIN_SCORE }, (_, i) => (
        <motion.span key={i} className="inline-block" animate={i < n ? { scale: [1.8, 1] } : { scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 12 }}>
          {i < n ? '●' : '○'}
        </motion.span>
      ))}
    </span>
  );
}

function Cowboy({ side, name, left, phase, outcome, shot }: { side: Side; name: string; left: boolean; phase: Phase; outcome: Outcome | null; shot?: Shot }) {
  const color = side === 'L' ? 'var(--color-side-l)' : 'var(--color-side-r)';
  const lost = outcome && (outcome.winner ? outcome.winner !== side : outcome.reason === 'both-early' || outcome.reason === 'both-slow');
  const won = outcome?.winner === side;
  const firing = phase === 'draw' && shot && !shot.early;
  return (
    <div className={`absolute bottom-[26%] ${left ? 'left-[12%]' : 'right-[12%]'} flex flex-col items-center`} style={{ transform: left ? undefined : 'scaleX(-1)' }}>
      <motion.div
        className="text-7xl leading-none relative"
        animate={lost ? { rotate: left ? -80 : 80, y: 20, opacity: 0.6 } : phase === 'wait' ? { y: [0, -3, 0] } : { rotate: 0, y: 0, opacity: 1 }}
        transition={lost ? { type: 'spring', stiffness: 200, damping: 14 } : { repeat: Infinity, duration: 1.2 }}
        style={{ transformOrigin: 'bottom center' }}
      >
        🤠
        {(firing || won) && (
          <motion.span initial={{ scale: 0, x: 10 }} animate={{ scale: 1, x: 30 }} className="absolute top-3 -right-8 text-4xl">💥</motion.span>
        )}
        {shot?.early && phase !== 'result' && <span className="absolute -top-4 -right-4 text-3xl">💨</span>}
      </motion.div>
      <div className="mt-1 px-2 py-0.5 rounded-full text-xs font-bold text-white" style={{ background: color, transform: left ? undefined : 'scaleX(-1)' }}>
        {name}
      </div>
    </div>
  );
}
