import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { RotateCcw } from 'lucide-react';
import { useMessage, Button, Countdown, OfflineBanner as PeerOffline, useRipples, celebrate, sfx, haptic } from '@sdk';
import { useDuo as useRoom, DuoHeader as GameHeader, PlayerTag } from '@sdk/duo';
import { useClockSync } from '../shared/clock';
import type { Side } from '../shared/layout';
import { COUNT_MS, MIN_TAP_GAP, STUN_MS, WIN_ROUNDS, position, segmentAt, winnerOf, zeroTally, type Tally } from './logic';

type Phase = 'lobby' | 'count' | 'pull' | 'result' | 'over';
export type Msg =
  | { t: 'w:ready'; side: Side }
  | { t: 'w:round'; n: number; seed: string; t0: number } // t0 = 倒數結束、開始拉的時刻（房主時鐘）
  | { t: 'w:tally'; n: number; side: Side; tally: Tally }
  | { t: 'w:over'; n: number; winner: Side }
  | { t: 'w:rematch' };

const RESULT_HOLD_MS = 2200;

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
  const [stop, setStop] = useState(false);
  const [winner, setWinner] = useState<Side | null>(null);
  const [, tick] = useState(0);

  const phaseRef = useRef<Phase>('lobby');
  phaseRef.current = phase;
  const roundRef = useRef(0);
  const seedRef = useRef('');
  const t0Local = useRef(0);
  const tallies = useRef<Record<Side, Tally>>({ L: zeroTally(), R: zeroTally() });
  const scoreRef = useRef(score);
  scoreRef.current = score;
  const stunUntil = useRef(0);
  const lastTap = useRef(0);
  const lastPull = useRef<Record<Side, number>>({ L: 0, R: 0 }); // 最近一次拉的時間，畫人物出力用
  const lastSlip = useRef<Record<Side, number>>({ L: 0, R: 0 });
  const segIdx = useRef(-1);
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => clearTimers, []);
  if (import.meta.env.DEV) (window as any).__tug = { get tallies() { return tallies.current; }, get pos() { return position(tallies.current.L, tallies.current.R); }, tap: () => onTap(), get stop() { return segmentAt(seedRef.current, performance.now() - t0Local.current).stop; } };

  // ---- 回合 ----
  const scheduleRound = (n: number) => {
    const seed = Math.random().toString(36).slice(2, 10);
    const t0 = performance.now() + COUNT_MS;
    send({ t: 'w:round', n, seed, t0 } satisfies Msg);
    startRound(n, seed, t0);
  };
  const startRound = (n: number, seed: string, t0Host: number) => {
    clearTimers();
    setRound(n); roundRef.current = n;
    seedRef.current = seed;
    t0Local.current = clock.toLocal(t0Host);
    tallies.current = { L: zeroTally(), R: zeroTally() };
    stunUntil.current = 0;
    segIdx.current = -1;
    setWinner(null);
    setStop(false);
    setPhase('count'); phaseRef.current = 'count';
    sfx.start();
    later(() => { setPhase('pull'); phaseRef.current = 'pull'; sfx.go(); haptic('medium'); }, Math.max(0, t0Local.current - performance.now()));
  };
  const finishRound = (w: Side) => {
    if (phaseRef.current !== 'pull') return;
    setWinner(w);
    setPhase('result'); phaseRef.current = 'result';
    const next = { ...scoreRef.current, [w]: scoreRef.current[w] + 1 };
    scoreRef.current = next; setScore(next);
    if (w === mySide) { sfx.win2(); haptic('double'); } else { sfx.lose2(); haptic('heavy'); }
    const over = next[w] >= WIN_ROUNDS;
    later(() => {
      if (over) {
        setPhase('over'); phaseRef.current = 'over';
        if (next[mySide] >= WIN_ROUNDS) { sfx.win(); celebrate(); } else sfx.lose();
        report({ winner: next.L >= WIN_ROUNDS ? 'L' : 'R', score: `${next.L}:${next.R}` });
      }
      else if (isHost) scheduleRound(roundRef.current + 1);
    }, RESULT_HOLD_MS);
  };

  // ---- 每幀：時間表 + 勝負 ----
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (phaseRef.current !== 'pull') return;
      const seg = segmentAt(seedRef.current, performance.now() - t0Local.current);
      if (seg.idx !== segIdx.current) {
        segIdx.current = seg.idx;
        setStop(seg.stop);
        if (seg.stop) { sfx.whistle(); haptic('heavy'); } else if (seg.idx > 0) { sfx.go(); haptic('light'); }
      }
      const w = winnerOf(position(tallies.current.L, tallies.current.R));
      if (w && isHost) { send({ t: 'w:over', n: roundRef.current, winner: w } satisfies Msg); finishRound(w); }
      tick((n) => n + 1);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- 收訊息 ----
  useMessage<Msg>((m) => {
    switch (m.t) {
      case 'w:ready': {
        const r = { ...ready, [m.side]: true };
        setReady(r);
        if (isHost && r.L && r.R && phaseRef.current === 'lobby') later(() => scheduleRound(1), 600);
        break;
      }
      case 'w:round': startRound(m.n, m.seed, m.t0); break;
      case 'w:tally': {
        if (m.n !== roundRef.current) return;
        const prev = tallies.current[m.side];
        if (m.tally.pulls > prev.pulls) lastPull.current[m.side] = performance.now();
        if (m.tally.slips > prev.slips) { lastSlip.current[m.side] = performance.now(); sfx.miss(); }
        // 只會變大，收到舊的就略過
        tallies.current[m.side] = { pulls: Math.max(prev.pulls, m.tally.pulls), slips: Math.max(prev.slips, m.tally.slips) };
        break;
      }
      case 'w:over': if (m.n === roundRef.current) finishRound(m.winner); break;
      case 'w:rematch': resetAll(); break;
    }
  });

  const resetAll = () => {
    clearTimers();
    setScore({ L: 0, R: 0 }); scoreRef.current = { L: 0, R: 0 };
    setReady({ L: false, R: false });
    setRound(0); roundRef.current = 0;
    tallies.current = { L: zeroTally(), R: zeroTally() };
    setWinner(null); setStop(false);
    setPhase('lobby'); phaseRef.current = 'lobby';
  };
  const onReady = () => {
    sfx.tap();
    const r = { ...ready, [mySide]: true };
    setReady(r);
    send({ t: 'w:ready', side: mySide } satisfies Msg);
    if (isHost && r.L && r.R) later(() => scheduleRound(1), 600);
  };
  const rematch = () => { send({ t: 'w:rematch' } satisfies Msg); resetAll(); };

  // ---- 點畫面 ----
  const onTap = () => {
    if (phaseRef.current !== 'pull') return;
    const now = performance.now();
    if (now - lastTap.current < MIN_TAP_GAP) return;
    lastTap.current = now;
    if (now < stunUntil.current) return; // 滑手中，點了沒用
    if (winnerOf(position(tallies.current.L, tallies.current.R))) return; // 已分勝負，等房主宣布
    const mine = tallies.current[mySide];
    const seg = segmentAt(seedRef.current, now - t0Local.current);
    if (seg.stop) {
      mine.slips++;
      stunUntil.current = now + STUN_MS;
      lastSlip.current[mySide] = now;
      sfx.miss(); haptic('triple');
    } else {
      mine.pulls++;
      lastPull.current[mySide] = now;
      sfx.tick(mine.pulls % 7 * 12); haptic('light');
    }
    send({ t: 'w:tally', n: roundRef.current, side: mySide, tally: { ...mine } } satisfies Msg);
  };

  // ---- 畫面 ----
  const now = performance.now();
  const pos = position(tallies.current.L, tallies.current.R);
  const myPos = mySide === 'L' ? pos : -pos; // 正 = 往我這邊
  const stunned = phase === 'pull' && now < stunUntil.current;
  const pulling = (s: Side) => now - lastPull.current[s] < 160;
  const slipped = (s: Side) => now - lastSlip.current[s] < STUN_MS;
  const bothReady = ready.L && ready.R;
  const bg = phase === 'pull' ? (stop ? 'from-[#f6b3a8] to-[#e8604c]' : 'from-[#d9ecc9] to-[#9fcf8b]') : 'from-[#e9e2d0] to-[#cfc3a4]';

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
        className={`flex-1 min-h-0 m-3 short:mr-0 rounded-3xl bg-gradient-to-b ${bg} relative overflow-hidden select-none touch-none shadow-[0_18px_40px_-16px_rgba(35,33,46,.5)] transition-colors duration-150`}
        animate={stunned ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }}
        transition={{ duration: 0.35 }}
      >
        {/* 地面 + 中線 + 兩邊的勝利線 */}
        <div className="absolute inset-x-0 bottom-0 h-[30%] bg-[#b89b6a]/40" />
        <div className="absolute top-[22%] bottom-[30%] left-1/2 w-0.5 bg-ink/25" />
        <div className="absolute top-[22%] bottom-[30%] left-[14%] w-0.5 border-l-2 border-dashed border-side-l/60" />
        <div className="absolute top-[22%] bottom-[30%] right-[14%] w-0.5 border-l-2 border-dashed border-side-r/60" />

        {/* 繩子 + 繩結（我永遠在左） */}
        <div className="absolute left-[8%] right-[8%] bottom-[33%] h-1.5 rounded-full bg-[#8a6a3d]" />
        <div className="absolute bottom-[33%] translate-y-[45%] -translate-x-1/2 transition-[left] duration-75 w-8 h-8 rounded-full border-4 border-paper shadow-md" style={{ left: `${50 - myPos * 36}%`, background: 'var(--color-ink)' }} />

        <Puller side={mySide} name={me.name} left pulling={pulling(mySide)} slipped={slipped(mySide)} lost={winner ? winner !== mySide : false} />
        <Puller side={peer.side} name={peer.name} left={false} pulling={pulling(peer.side)} slipped={slipped(peer.side)} lost={winner ? winner !== peer.side : false} />

        <div className="absolute inset-x-0 top-0 bottom-[36%] flex items-center justify-center pointer-events-none px-[15%]">
          <AnimatePresence mode="wait">
            {phase === 'lobby' && (
              <motion.div key="lobby" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center px-6">
                <div className="text-5xl short:text-3xl mb-2">🪢</div>
                <div className="font-bold text-lg">狂點畫面把繩結拉到虛線</div>
                <div className="text-sm text-ink-soft mt-1">畫面變紅喊「停」就要放手，那時候點會滑手倒退。先贏 {WIN_ROUNDS} 回合</div>
              </motion.div>
            )}
            {phase === 'count' && (
              <motion.div key="count" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} ><Countdown ms={COUNT_MS} go="拉！" /></motion.div>
            )}
            {phase === 'pull' && (
              <motion.div key={stop ? 'stop' : 'go'} initial={{ scale: 0.3, rotate: -8 }} animate={{ scale: 1, rotate: -4 }} transition={{ type: 'spring', stiffness: 700, damping: 18 }} className={`font-black drop-shadow-[0_4px_0_rgba(255,255,255,.6)] ${stop ? 'text-7xl text-paper' : 'text-4xl text-ink/80'}`}>
                {stop ? '停！' : '拉！'}
              </motion.div>
            )}
            {(phase === 'result' || phase === 'over') && winner && (
              <motion.div key={`r${round}`} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="text-center bg-paper/85 rounded-2xl px-5 py-3">
                <div className="text-xl font-bold">{winner === mySide ? '拉過來了！' : `被 ${names[winner]} 拉走了`}</div>
                <div className="text-sm text-ink-soft mt-1">
                  {names[mySide]} 拉 {tallies.current[mySide].pulls} 滑 {tallies.current[mySide].slips} ・ {names[peer.side]} 拉 {tallies.current[peer.side].pulls} 滑 {tallies.current[peer.side].slips}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <AnimatePresence>
          {stunned && (
            <motion.div key="stun" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-x-0 top-[24%] flex justify-center pointer-events-none">
              <div className="bg-ink text-paper font-black text-xl px-4 py-1.5 rounded-2xl rotate-[3deg] shadow-xl">滑手了！</div>
            </motion.div>
          )}
        </AnimatePresence>
        {ripple.node}
      </motion.div>

      <footer className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] min-h-[84px] flex items-center justify-center short:w-56 short:shrink-0 short:pb-3">
        {phase === 'lobby' && (ready[mySide] ? <div className="text-ink-soft">{bothReady ? '開始！' : `等 ${peer.name} 準備…`}</div> : <Button size="lg" onClick={onReady}>準備好了</Button>)}
        {(phase === 'count' || phase === 'pull') && <div className="text-ink-soft text-sm">{stop ? '手放開！' : '狂點畫面'}</div>}
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
              <div className="text-4xl">{score[mySide] >= WIN_ROUNDS ? '🏆' : '💀'}</div>
              <div className="text-xl font-bold">{score[mySide] >= WIN_ROUNDS ? '你力氣比較大' : `${peer.name} 力氣比較大`}</div>
              <div className="text-sm opacity-70">{score[mySide]} : {score[peer.side]}</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Dots({ n }: { n: number }) {
  return (
    <span className="tracking-tighter">
      {Array.from({ length: WIN_ROUNDS }, (_, i) => (
        <motion.span key={i} className="inline-block" animate={i < n ? { scale: [1.8, 1] } : { scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 12 }}>
          {i < n ? '●' : '○'}
        </motion.span>
      ))}
    </span>
  );
}

/** 拉繩的人：出力時往後仰，滑手時翻倒，輸了趴地 */
function Puller({ side, name, left, pulling, slipped, lost }: { side: Side; name: string; left: boolean; pulling: boolean; slipped: boolean; lost: boolean }) {
  const color = side === 'L' ? 'var(--color-side-l)' : 'var(--color-side-r)';
  const lean = lost ? 70 : slipped ? -40 : pulling ? 22 : 8;
  return (
    <div className={`absolute bottom-[24%] ${left ? 'left-[4%]' : 'right-[4%]'} flex flex-col items-center`} style={{ transform: left ? undefined : 'scaleX(-1)' }}>
      <motion.div
        className="text-7xl leading-none"
        animate={{ rotate: -lean, y: lost ? 14 : 0, opacity: lost ? 0.6 : 1 }}
        transition={{ type: 'spring', stiffness: 500, damping: 20 }}
        style={{ transformOrigin: 'bottom center' }}
      >
        {slipped ? '🙃' : '🧍'}
      </motion.div>
      <div className="mt-1 px-2 py-0.5 rounded-full text-xs font-bold text-white" style={{ background: color, transform: left ? undefined : 'scaleX(-1)' }}>
        {name}
      </div>
    </div>
  );
}
