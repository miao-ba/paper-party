import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { useMessage, Button, OfflineBanner as PeerOffline, celebrate, sfx, haptic } from '@sdk';
import { useDuo as useRoom, DuoHeader as GameHeader, PlayerTag } from '@sdk/duo';
import { Paper, FOLD_MS, SLAM_MS } from './Paper';
import { useLayout, usePortrait, useSize, fitPaper } from '../shared/layout';
import { PowerButton, Meter, type Zone } from '../shared/PowerButton';
import {
  POWER, REVEAL_HOLD_MS, SIZES, applyStamp, canPlace, drawDot, initialState, mergeSetup, nextTurn, placeStickman, progress,
  removeStickman, resultText, type GameState, type Side, type Size, type Stickman,
} from './logic';

const ZONES: Zone[] = [
  { from: 0, to: POWER.min, className: 'bg-side-l/25' },
  { from: POWER.sweet - POWER.sweetHalf, to: POWER.sweet + POWER.sweetHalf, className: 'bg-side-r/40' },
];
export type Msg =
  | { t: 'config'; count: number }
  | { t: 'setup'; side: Side; stickmen: Stickman[]; ready: boolean }
  | { t: 'state'; state: GameState }
  | { t: 'charge'; power: number | null }
  | { t: 'sync:req' }
  | { t: 'sync'; state: GameState }
  | { t: 'rematch' };

export default function Game() {
  const { me, peer, isHost, send, leave, report } = useRoom();
  const mySide = me.side;
  const portrait = usePortrait();
  const layout = useLayout(mySide, portrait);

  const [state, setState] = useState<GameState>(() => initialState(3));
  const stateRef = useRef(state);
  stateRef.current = state;
  const [charge, setCharge] = useState<number | null>(null);
  const [fx, setFx] = useState<'flat' | 'folded' | 'slam'>('flat');
  const [printShown, setPrintShown] = useState(false);
  const [sizeSel, setSizeSel] = useState<Size>('M');
  const [hint, setHint] = useState<string | null>(null);
  const [areaRef, area] = useSize<HTMLDivElement>();
  const lastChargeSent = useRef(0);

  const isMyTurn = state.phase === 'play' && state.turn === mySide;
  const nameOf = (s: Side) => (s === mySide ? me.name : peer.name);

  const setLocal = (next: GameState) => {
    stateRef.current = next;
    setState(next);
  };
  const update = (fn: (s: GameState) => GameState) => {
    const next = fn(stateRef.current);
    setLocal(next);
    send({ t: 'state', state: next } satisfies Msg);
  };
  const flashHint = (m: string) => {
    setHint(m);
    window.setTimeout(() => setHint(null), 1500);
  };

  // ---- 收訊息 ----
  useMessage<Msg>((msg) => {
    const s = stateRef.current;
    switch (msg.t) {
      case 'config':
        setLocal(initialState(msg.count));
        break;
      case 'setup':
        setLocal(mergeSetup(s, msg.side, msg.stickmen, msg.ready));
        break;
      case 'state':
        setLocal(msg.state);
        break;
      case 'charge':
        setCharge(msg.power);
        break;
      case 'sync:req':
        send({ t: 'sync', state: s } satisfies Msg);
        break;
      case 'sync':
        if (progress(msg.state) > progress(s)) setLocal(msg.state);
        break;
      case 'rematch':
        setLocal(initialState(s.config.count));
        break;
    }
  });
  useEffect(() => {
    send({ t: 'sync:req' } satisfies Msg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- 動畫階段（兩邊各自跟著 state.step 跑）----
  useEffect(() => {
    const step = state.phase === 'setup' ? 'draw' : state.step;
    if (step === 'draw') {
      setFx('flat');
      setPrintShown(false);
      setCharge(null);
    } else if (step === 'fold') {
      setFx('folded');
      sfx.fold();
    } else if (step === 'aim') {
      setFx('folded');
    } else if (step === 'reveal') {
      setFx('slam');
      setCharge(null);
      sfx.slam();
      haptic('heavy');
      const r = stateRef.current.lastResult;
      const a = window.setTimeout(() => { setFx('flat'); sfx.fold(); }, SLAM_MS);
      const b = window.setTimeout(() => {
        setPrintShown(true);
        if (!r?.ok) sfx.miss();
        else if (!r.hit) { sfx.stamp(); sfx.miss(); }
        else if (r.hit.part === 'head') { sfx.headshot(); haptic('triple'); }
        else { sfx.stamp(); sfx.hit(); haptic(r.hit.killed ? 'double' : 'medium'); if (r.hit.killed) sfx.fall(); }
      }, SLAM_MS + FOLD_MS);
      return () => {
        clearTimeout(a);
        clearTimeout(b);
      };
    }
  }, [state.step, state.phase, state.turnNo]);

  // ---- 輪到我的人負責推進 ----
  useEffect(() => {
    if (!isMyTurn) return;
    if (state.step === 'fold') {
      const t = window.setTimeout(() => update((s) => ({ ...s, step: 'aim' })), FOLD_MS + 250);
      return () => clearTimeout(t);
    }
    if (state.step === 'reveal') {
      const t = window.setTimeout(() => update(nextTurn), SLAM_MS + FOLD_MS + REVEAL_HOLD_MS);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.step, state.phase, isMyTurn]);

  // ---- 互動 ----
  const myMen = state.stickmen.filter((s) => s.side === mySide);
  const anyReady = state.ready.L || state.ready.R;

  const sendSetup = (next: GameState) =>
    send({ t: 'setup', side: mySide, stickmen: next.stickmen.filter((s) => s.side === mySide), ready: next.ready[mySide] } satisfies Msg);

  const onTap = (p: { x: number; y: number }, side: Side) => {
    const s = stateRef.current;
    if (s.phase === 'setup') {
      if (side !== mySide || s.ready[mySide]) return;
      if (myMen.length >= s.config.count) return flashHint('數量已滿，點火柴人可以移除');
      if (!canPlace(s, mySide, p.x, p.y, sizeSel, layout.upright)) return flashHint('這裡放不下');
      const next = placeStickman(s, mySide, p.x, p.y, sizeSel, layout.upright);
      sfx.pop();
      haptic('light');
      setLocal(next);
      sendSetup(next);
    } else if (s.phase === 'play' && s.turn === mySide && s.step === 'draw') {
      if (side !== mySide) return flashHint('要畫在自己這一半');
      const next = drawDot(s, p.x, p.y);
      if (!next) return flashHint('太靠邊了');
      sfx.ink();
      update(() => next);
    }
  };
  const onTapStickman = (id: string) => {
    const s = stateRef.current;
    if (s.phase !== 'setup' || s.ready[mySide]) return;
    const target = s.stickmen.find((m) => m.id === id);
    if (target?.side !== mySide) return;
    const next = removeStickman(s, id);
    sfx.undo();
    setLocal(next);
    sendSetup(next);
  };
  const setCount = (n: number) => {
    const c = Math.max(1, Math.min(5, n));
    setLocal(initialState(c));
    send({ t: 'config', count: c } satisfies Msg);
  };
  const ready = () => {
    sfx.pop();
    const next = mergeSetup(stateRef.current, mySide, myMen, true);
    setLocal(next);
    sendSetup(next);
  };
  const lastTick = useRef(-1);
  const onCharge = (p: number) => {
    setCharge(p);
    const bucket = Math.floor(p / 10);
    if (bucket !== lastTick.current) { lastTick.current = bucket; sfx.tick(p); }
    const now = performance.now();
    if (now - lastChargeSent.current > 50) {
      lastChargeSent.current = now;
      send({ t: 'charge', power: p } satisfies Msg);
    }
  };
  const onRelease = (p: number) => {
    send({ t: 'charge', power: null } satisfies Msg);
    update((s) => applyStamp(s, p));
  };
  const rematch = () => {
    send({ t: 'rematch' } satisfies Msg);
    setLocal(initialState(stateRef.current.config.count));
  };

  // 紙張尺寸：塞進可用區域
  const { w: pw, h: ph } = fitPaper(area, layout.aspect);

  const hitKey = printShown && state.lastResult?.hit ? `${state.turnNo}` : null;
  const showOver = state.phase === 'over' && printShown;
  useEffect(() => {
    if (!showOver) return;
    window.setTimeout(() => { if (state.winner === mySide) { sfx.win(); celebrate(); } else sfx.lose(); }, 500);
    report({ winner: state.winner, score: `剩 ${alive('L').length}:${alive('R').length}` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showOver]);
  const alive = (side: Side) => state.stickmen.filter((s) => s.side === side && s.hp > 0);

  return (
    <div className="h-full flex flex-col">
      {/* 頂部：雙方狀態 */}
      <GameHeader
        left={<PlayerTag side={mySide} name={me.name} active={state.phase === 'play' ? isMyTurn : undefined}>🧍{state.phase === 'setup' ? myMen.length : alive(mySide).length}</PlayerTag>}
        center={state.phase === 'play' && `第 ${state.turnNo} 手`}
        right={<PlayerTag side={peer.side} name={peer.name} active={state.phase === 'play' ? !isMyTurn : undefined}>🧍{state.phase === 'setup' ? '?' : alive(peer.side).length}</PlayerTag>}
      />
      <PeerOffline />

      <div className="flex-1 min-h-0 flex flex-col short:flex-row">
      {/* 紙 */}
      <div ref={areaRef} className="flex-1 min-h-0 min-w-0 flex items-center justify-center relative">
        {pw > 0 && (
          <div className="shadow-[0_18px_40px_-16px_rgba(35,33,46,.5)] rounded-sm">
            <Paper
              state={state}
              mySide={mySide}
              portrait={portrait}
              width={pw}
              height={ph}
              folded={fx !== 'flat'}
              slam={fx === 'slam'}
              hiddenPrintTurn={printShown ? null : state.turnNo}
              hideSide={state.phase === 'setup' ? peer.side : null}
              chargePower={charge}
              hitKey={hitKey}
              onTap={onTap}
              onTapStickman={state.phase === 'setup' ? onTapStickman : undefined}
            />
          </div>
        )}
        <AnimatePresence>
          {hint && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="absolute bottom-3 bg-ink text-paper text-sm px-3 py-1.5 rounded-full"
            >
              {hint}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 底部：依階段的操作區 */}
      <footer className="px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] min-h-[132px] flex flex-col items-center justify-center gap-2 text-center short:w-72 short:shrink-0 short:min-h-0 short:pb-3 short:overflow-y-auto">
        {state.phase === 'setup' && (
          <>
            {isHost && !anyReady && (
              <div className="flex items-center gap-3 text-sm">
                <span className="text-ink-soft">每人火柴人數</span>
                <button onClick={() => setCount(state.config.count - 1)} className="p-1.5 rounded-lg bg-paper border border-ink/15"><Minus size={14} /></button>
                <b className="text-lg w-4 text-center">{state.config.count}</b>
                <button onClick={() => setCount(state.config.count + 1)} className="p-1.5 rounded-lg bg-paper border border-ink/15"><Plus size={14} /></button>
              </div>
            )}
            {state.ready[mySide] ? (
              <div className="text-ink-soft">等 {peer.name} 佈陣完成…</div>
            ) : (
              <>
                <div className="flex gap-2">
                  {(Object.keys(SIZES) as Size[]).map((k) => (
                    <button
                      key={k}
                      onClick={() => setSizeSel(k)}
                      className={`px-4 py-2 rounded-2xl border-2 text-sm font-semibold transition ${
                        sizeSel === k ? 'bg-ink text-paper border-ink' : 'bg-paper border-ink/15'
                      }`}
                    >
                      {SIZES[k].label} <span className="opacity-60">♥{SIZES[k].hp}</span>
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5">
                  <span className="text-sm text-ink-soft">
                    點自己那半邊放火柴人（{myMen.length}/{state.config.count}）
                  </span>
                  <Button onClick={ready} disabled={myMen.length < state.config.count}>
                    佈陣完成
                  </Button>
                </div>
              </>
            )}
          </>
        )}

        {state.phase === 'play' && !isMyTurn && (
          <>
            {state.step === 'aim' && <Meter power={charge} zones={ZONES} />}
            <div className="text-ink-soft">
              {state.step === 'draw' && `${peer.name} 正在畫點…`}
              {state.step === 'fold' && '摺紙中…'}
              {state.step === 'aim' && `${peer.name} 蓄力中…`}
              {state.step === 'reveal' && (printShown && state.lastResult ? resultText(state.lastResult, me.name) : '敲！')}
            </div>
          </>
        )}

        {isMyTurn && state.step === 'draw' && <div className="text-lg font-bold">輪到你了，在自己這半邊畫一個點</div>}
        {isMyTurn && state.step === 'fold' && <div className="text-ink-soft">摺紙中…</div>}
        {isMyTurn && state.step === 'aim' && <PowerButton onCharge={onCharge} onRelease={onRelease} label="按住蓄力，放開敲下去" zones={ZONES} />}
        {isMyTurn && state.step === 'reveal' && (
          <div className="text-lg font-bold">{printShown && state.lastResult ? resultText(state.lastResult, peer.name) : '敲！'}</div>
        )}

        {state.phase === 'over' && (
          <div className="text-ink-soft">{printShown ? '' : '敲！'}</div>
        )}
      </footer>
      </div>

      <AnimatePresence>
        {showOver && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-ink/50 flex items-center justify-center p-6">
            <motion.div
              initial={{ scale: 0.7, rotate: -6 }}
              animate={{ scale: 1, rotate: -2 }}
              transition={{ type: 'spring', stiffness: 260, damping: 16 }}
              className="bg-paper rounded-3xl p-7 w-full max-w-sm text-center"
            >
              <div className="text-6xl mb-2">{state.winner === mySide ? '🏆' : '💀'}</div>
              <div className="text-2xl font-bold">{state.winner === mySide ? '你贏了！' : `${nameOf(state.winner!)} 贏了`}</div>
              <div className="text-sm text-ink-soft mt-1">{state.lastResult && resultText(state.lastResult, nameOf(state.winner === 'L' ? 'R' : 'L'))}</div>
              <div className="flex gap-3 mt-6">
                <Button variant="ghost" className="flex-1" onClick={leave}>
                  回大廳
                </Button>
                <Button className="flex-1" onClick={rematch}>
                  <RotateCcw size={16} /> 再來一局
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
