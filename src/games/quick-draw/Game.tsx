import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { Avatar, Button, GameHeader, GameOver, OfflineBanner, defineStrings, haptic, sfx, useHostClock, useMessage, useRipples, useRoom, type Result } from '@sdk';
import { DRAW_DELAY, FAKE_CHANCE, NO_SHOT_MS, RESULT_HOLD_MS, ranking, winnerOf, type Msg, type Shot } from './logic';

const T = defineStrings({
  'zh-TW': {
    title: '看到「拔槍！」就點畫面',
    sub: (n: number) => `最快的人得 1 分，先拿 ${n} 分贏。太早點、或被假訊號騙到就犯規`,
    ready: '準備好了',
    waitingOthers: '等其他人準備…',
    wait: '等…',
    fake: '🦆 鴨！',
    draw: '拔槍！',
    early: '太早了！',
    you: '你',
    roundWin: (n: string) => `${n} 最快！`,
    nobody: '沒有人得分',
    tapAnywhere: '點畫面任何地方',
    waitOthers: '等其他人…',
    noShot: '沒反應',
    foul: '犯規',
    round: (n: number) => `第 ${n} 回合`,
    syncing: '對時中…',
  },
  en: {
    title: 'Tap the moment you see “DRAW!”',
    sub: (n: number) => `Fastest gets a point, first to ${n} wins. Too early — or fooled by the decoy — is a foul`,
    ready: "I'm ready",
    waitingOthers: 'Waiting for the others…',
    wait: 'Wait…',
    fake: '🦆 DUCK!',
    draw: 'DRAW!',
    early: 'Too early!',
    you: 'you',
    roundWin: (n: string) => `${n} was fastest!`,
    nobody: 'No point this round',
    tapAnywhere: 'Tap anywhere',
    waitOthers: 'Waiting for the others…',
    noShot: 'no shot',
    foul: 'foul',
    round: (n: number) => `Round ${n}`,
    syncing: 'syncing clock…',
  },
});

type Phase = 'ready' | 'wait' | 'fake' | 'draw' | 'result' | 'over';
type ResultMsg = Extract<Msg, { t: 'qd:result' }>;

export default function Game() {
  const room = useRoom();
  const { me, players, isHost, send } = room;
  const clock = useHostClock();
  const ripple = useRipples();
  const t = T.use();
  const target = Number(room.options.wins) || 3;

  const [phase, setPhase] = useState<Phase>('ready');
  const [ready, setReady] = useState<string[]>([]);
  const [scores, setScores] = useState<Record<string, number>>(() => Object.fromEntries(players.map((p) => [p.id, 0])));
  const [round, setRound] = useState(0);
  const [shot, setShot] = useState<Shot | null>(null);
  const [shotIds, setShotIds] = useState<string[]>([]);
  const [result, setResult] = useState<ResultMsg | null>(null);
  const [final, setFinal] = useState<Result | null>(null);

  // Refs for timer callbacks (no stale state).
  const phaseRef = useRef<Phase>('ready');
  const roundRef = useRef(0);
  const shownAt = useRef(0);
  const drawLocal = useRef(0);
  const host = useRef({ ready: new Set<string>(), scores: { ...scores }, shots: {} as Record<string, Shot>, resolved: 0, started: false });
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));
  const clearTimers = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  };
  useEffect(() => clearTimers, []);
  const go = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  // ---------------------------------------------------------------- host: rounds and results
  const hostReady = (id: string) => {
    const h = host.current;
    h.ready.add(id);
    if (!h.started && players.every((p) => h.ready.has(p.id))) {
      h.started = true;
      later(() => startRound(1), 900);
    }
  };
  const startRound = (n: number) => {
    const now = clock.hostNow();
    const drawAt = now + DRAW_DELAY.min + Math.random() * (DRAW_DELAY.max - DRAW_DELAY.min);
    const fakeAt = Math.random() < FAKE_CHANCE && drawAt - now > 2200 ? now + 900 + Math.random() * (drawAt - now - 1900) : null;
    host.current.shots = {};
    const msg: Msg = { t: 'qd:round', n, drawAt, fakeAt };
    send(msg);
    beginRound(msg);
    later(() => resolve(n), drawAt - now + NO_SHOT_MS);
  };
  const hostShot = (id: string, n: number, s: Shot) => {
    const h = host.current;
    if (n !== roundRef.current || h.resolved >= n) return;
    h.shots[id] = s;
    if (players.every((p) => h.shots[p.id])) resolve(n);
  };
  const resolve = (n: number) => {
    const h = host.current;
    if (h.resolved >= n) return;
    h.resolved = n;
    const winner = winnerOf(h.shots);
    if (winner) h.scores = { ...h.scores, [winner]: (h.scores[winner] ?? 0) + 1 };
    const over = !!winner && h.scores[winner] >= target;
    const msg: ResultMsg = { t: 'qd:result', n, shots: h.shots, winner, scores: h.scores, over };
    send(msg);
    showResult(msg);
    if (!over) later(() => startRound(n + 1), RESULT_HOLD_MS);
  };

  // ---------------------------------------------------------------- everyone
  const beginRound = (m: Extract<Msg, { t: 'qd:round' }>) => {
    clearTimers();
    roundRef.current = m.n;
    setRound(m.n);
    setShot(null);
    setShotIds([]);
    setResult(null);
    go('wait');
    const now = performance.now();
    drawLocal.current = clock.toLocal(m.drawAt);
    if (m.fakeAt !== null) {
      later(() => {
        if (phaseRef.current !== 'wait') return;
        go('fake');
        sfx.pokeSent();
        later(() => phaseRef.current === 'fake' && go('wait'), 650);
      }, clock.toLocal(m.fakeAt) - now);
    }
    later(() => {
      if (phaseRef.current !== 'wait' && phaseRef.current !== 'fake') return;
      shownAt.current = performance.now();
      go('draw');
      sfx.draw();
      haptic('medium');
    }, Math.max(0, drawLocal.current - now));
  };

  const showResult = (m: ResultMsg) => {
    clearTimers();
    setResult(m);
    setScores(m.scores);
    go(m.over ? 'over' : 'result');
    if (m.winner === me.id) {
      sfx.win2();
      haptic('double');
    } else sfx.lose2();
    if (m.over) {
      const r: Result = { winners: m.winner ? [m.winner] : [], ranking: ranking(m.scores), scores: m.scores };
      room.report(r);
      later(() => setFinal(r), 1200);
    }
  };

  const fire = (s: Shot) => {
    if (shot || roundRef.current === 0) return;
    setShot(s);
    send({ t: 'qd:shot', n: roundRef.current, shot: s } satisfies Msg);
    setShotIds((l) => [...l, me.id]);
    if (isHost) hostShot(me.id, roundRef.current, s);
  };
  const onTap = () => {
    const p = phaseRef.current;
    if (p === 'wait' || p === 'fake') {
      sfx.miss();
      haptic('triple');
      fire({ ms: -1, early: true });
    } else if (p === 'draw') {
      sfx.shot();
      haptic('heavy');
      fire({ ms: Math.round(performance.now() - shownAt.current), early: false });
    }
  };

  useMessage<Msg>((m, from) => {
    switch (m.t) {
      case 'qd:ready':
        setReady((l) => (l.includes(from) ? l : [...l, from]));
        if (isHost) hostReady(from);
        break;
      case 'qd:round':
        if (!isHost) beginRound(m);
        break;
      case 'qd:shot':
        setShotIds((l) => (l.includes(from) ? l : [...l, from]));
        if (isHost) hostShot(from, m.n, m.shot);
        break;
      case 'qd:result':
        if (!isHost && m.n >= roundRef.current) {
          roundRef.current = m.n;
          setRound(m.n);
          showResult(m);
        }
        break;
      case 'qd:hello':
        if (isHost) send({ t: 'qd:state', ready: [...host.current.ready], scores: host.current.scores, n: roundRef.current } satisfies Msg, from);
        break;
      case 'qd:state':
        setReady(m.ready);
        setScores(m.scores);
        roundRef.current = m.n;
        setRound(m.n);
        if (m.n > 0) go('result');
        break;
    }
  });
  // Reloaded mid-game? Ask the host where we are.
  useEffect(() => {
    if (!isHost) send({ t: 'qd:hello' } satisfies Msg, room.host.id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const imReady = ready.includes(me.id);
  const onReady = () => {
    sfx.tap();
    setReady((l) => [...l, me.id]);
    send({ t: 'qd:ready' } satisfies Msg);
    if (isHost) hostReady(me.id);
  };

  const bg =
    phase === 'draw' ? 'from-yellow-200 to-orange-300' : phase === 'fake' ? 'from-violet-300 to-fuchsia-400' : phase === 'wait' ? 'from-[#f3c9a2] to-[#c88a5e]' : 'from-[#f8dcb8] to-[#e2a97a]';
  const dots = (n: number) => '●'.repeat(Math.min(n, target)) + '○'.repeat(Math.max(0, target - n));

  return (
    <div className="h-full flex flex-col">
      <GameHeader
        scores={Object.fromEntries(players.map((p) => [p.id, <span className="tracking-tighter text-[11px]">{dots(scores[p.id] ?? 0)}</span>]))}
        center={round > 0 ? `${t.round(round)}${!clock.synced ? ` · ${t.syncing}` : ''}` : undefined}
      />
      <OfflineBanner />
      <div className="flex-1 min-h-0 flex flex-col short:flex-row">
        <motion.div
          onPointerDown={(e) => {
            if (phaseRef.current !== 'ready') ripple.add(e);
            onTap();
          }}
          className={`flex-1 min-h-0 m-3 short:mr-0 rounded-3xl bg-gradient-to-b ${bg} relative overflow-hidden select-none touch-none shadow-[0_18px_40px_-16px_rgba(35,33,46,.5)] transition-colors duration-150`}
          animate={phase === 'draw' ? { scale: [1, 1.02, 1] } : { scale: 1 }}
          transition={{ duration: 0.25 }}
        >
          <div className="absolute left-1/2 -translate-x-1/2 top-[10%] w-24 h-24 rounded-full bg-[#ffd98a] opacity-80" />
          <div className="absolute inset-x-0 bottom-0 h-[28%] bg-[#d9b27a]/70" />
          <div className="absolute inset-0 flex items-center justify-center px-6 pointer-events-none">
            <AnimatePresence mode="wait">
              {phase === 'ready' && (
                <motion.div key="ready" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center">
                  <div className="text-6xl mb-2">🤠</div>
                  <div className="font-bold text-lg">{t.title}</div>
                  <div className="text-sm text-ink/70 mt-1 max-w-xs">{t.sub(target)}</div>
                </motion.div>
              )}
              {(phase === 'wait' || phase === 'fake') && (
                <motion.div key={phase} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="text-center">
                  {shot?.early ? (
                    <div className="text-3xl font-black text-accent">{t.early} 💨</div>
                  ) : phase === 'fake' ? (
                    <div className="text-6xl font-black text-white drop-shadow-[0_4px_0_rgba(0,0,0,.2)]">{t.fake}</div>
                  ) : (
                    <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.6 }} className="text-2xl text-ink/70 tracking-[0.5em]">
                      {t.wait}
                    </motion.div>
                  )}
                </motion.div>
              )}
              {phase === 'draw' && (
                <motion.div key="draw" initial={{ scale: 0.3, rotate: -8 }} animate={{ scale: 1, rotate: -4 }} transition={{ type: 'spring', stiffness: 700, damping: 18 }} className="text-6xl font-black text-ink drop-shadow-[0_4px_0_rgba(255,255,255,.6)] tabular-nums">
                  {shot ? (shot.early ? t.early : `${shot.ms} ms`) : t.draw}
                </motion.div>
              )}
              {(phase === 'result' || phase === 'over') && result && <RoundResult key={`r${result.n}`} result={result} />}
            </AnimatePresence>
          </div>
          {ripple.node}
        </motion.div>

        <footer className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] min-h-[84px] flex flex-col items-center justify-center gap-2 short:w-60 short:shrink-0 short:pb-3">
          {phase === 'ready' && (
            <>
              <div className="flex flex-wrap justify-center gap-1.5">
                {players.map((p) => (
                  <span key={p.id} className="relative">
                    <Avatar emoji={p.avatar} name={p.name} size={30} ring={p.color} bot={p.bot} dim={!ready.includes(p.id)} />
                    {ready.includes(p.id) && <Check size={14} className="absolute -top-1 -right-1 bg-accent-2 text-white rounded-full p-0.5" />}
                  </span>
                ))}
              </div>
              {imReady ? <div className="text-sm text-ink-soft">{t.waitingOthers}</div> : <Button size="lg" onClick={onReady}>{t.ready}</Button>}
            </>
          )}
          {(phase === 'wait' || phase === 'fake' || phase === 'draw') && (
            <div className="flex items-center gap-2 text-sm text-ink-soft">
              {shot ? t.waitOthers : t.tapAnywhere}
              <span className="flex -space-x-1">
                {players.map((p) => (
                  <Avatar key={p.id} emoji={p.avatar} name={p.name} size={20} ring={p.color} dim={!shotIds.includes(p.id)} />
                ))}
              </span>
            </div>
          )}
        </footer>
      </div>
      {final && <GameOver result={final} />}
    </div>
  );
}

function RoundResult({ result }: { result: ResultMsg }) {
  const room = useRoom();
  const t = T.use();
  const rows = room.players
    .map((p) => ({ p, s: result.shots[p.id] }))
    .sort((a, b) => (a.s && !a.s.early ? a.s.ms : 1e9) - (b.s && !b.s.early ? b.s.ms : 1e9));
  const w = result.winner ? room.player(result.winner) : null;
  return (
    <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} className="bg-paper/90 rounded-3xl px-5 py-4 w-full max-w-xs shadow-xl">
      <div className="text-xl font-black text-center mb-2">{w ? (w.isMe ? `🏆 ${t.roundWin(t.you)}` : t.roundWin(w.name)) : t.nobody}</div>
      <div className="flex flex-col gap-1">
        {rows.map(({ p, s }) => (
          <div key={p.id} className={`flex items-center gap-2 px-2 py-1 rounded-xl ${p.id === result.winner ? 'bg-gold/30' : ''}`}>
            <Avatar emoji={p.avatar} name={p.name} size={22} ring={p.color} bot={p.bot} />
            <span className={`flex-1 truncate text-sm font-bold ${p.isMe ? 'underline' : ''}`}>{p.name}</span>
            <span className={`text-sm tabular-nums ${s?.early ? 'text-accent font-bold' : ''}`}>{!s ? t.noShot : s.early ? t.foul : `${s.ms} ms`}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
