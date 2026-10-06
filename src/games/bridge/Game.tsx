import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { useMessage, Button, OfflineBanner as PeerOffline, celebrate, sfx, haptic } from '@sdk';
import { useDuo as useRoom, DuoHeader as GameHeader, PlayerTag } from '@sdk/duo';
import { useLayout, usePortrait, useSize, fitPaper } from '../shared/layout';
import { Board } from '../shared/Board';
import { PowerButton, type Zone } from '../shared/PowerButton';
import { MAPS, getMap, type Pt } from './maps';
import { MapSvg, PieceSvg, StrokeInk, AimArrow } from './Scene';
import {
  DEFAULT_CONFIG, HOLD_MS, POWER, SIZES, applyMove, moveDuration, canPlace, initialState, mergeSetup, nextTurn, placePiece, progress, removePiece,
  resultText, simulateMove, type Config, type GameState, type Piece, type Side, type Size,
} from './logic';

// 沒有甜蜜區：越用力越遠越歪，最右邊是筆會滑掉的危險區
const ZONES: Zone[] = [
  { from: 0, to: 100, className: 'bg-gradient-to-r from-side-r/10 to-side-l/30' },
  { from: POWER.slipAbove, to: 100, className: 'bg-side-l/50' },
];
export type Msg =
  | { t: 'config'; config: Config }
  | { t: 'setup'; side: Side; pieces: Piece[]; ready: boolean }
  | { t: 'state'; state: GameState }
  | { t: 'sync:req' }
  | { t: 'sync'; state: GameState }
  | { t: 'rematch' };

export default function Game() {
  const { me, peer, isHost, send, leave, report } = useRoom();
  const mySide = me.side;
  const portrait = usePortrait();
  const layout = useLayout(mySide, portrait);
  const [areaRef, area] = useSize<HTMLDivElement>();
  const { w: pw, h: ph } = fitPaper(area, layout.aspect);

  const [state, setState] = useState<GameState>(() => initialState(DEFAULT_CONFIG));
  const stateRef = useRef(state);
  stateRef.current = state;
  const [sizeSel, setSizeSel] = useState<Size>('M');
  const [sel, setSel] = useState<string | null>(null);
  const [aim, setAim] = useState<number | null>(null);
  const [charge, setCharge] = useState<number | null>(null);
  const [resolved, setResolved] = useState(false); // 這回合的動畫播完了沒
  const [hint, setHint] = useState<string | null>(null);
  const aiming = useRef(false);

  const map = getMap(state.config.map);
  const isMyTurn = state.phase === 'play' && state.turn === mySide;
  const myPieces = state.pieces.filter((p) => p.side === mySide);
  const anyReady = state.ready.L || state.ready.R;
  const nameOf = (s: Side) => (s === mySide ? me.name : peer.name);
  // 動畫還沒播完前，數字先不要變
  const alive = (side: Side) => {
    let n = state.pieces.filter((p) => p.side === side && p.alive).length;
    const m = state.lastMove;
    if (state.step === 'resolve' && !resolved && m) {
      const mover = state.pieces.find((p) => p.id === m.pieceId);
      if (mover?.side === side && m.drowned) n += 1;
      if (mover && mover.side !== side) n += m.killed.length;
    }
    return n;
  };

  const setLocal = (next: GameState) => { stateRef.current = next; setState(next); };
  const update = (fn: (s: GameState) => GameState) => {
    const next = fn(stateRef.current);
    setLocal(next);
    send({ t: 'state', state: next } satisfies Msg);
  };
  const flashHint = (m: string) => { setHint(m); window.setTimeout(() => setHint(null), 1500); };

  useMessage<Msg>((msg) => {
    const s = stateRef.current;
    switch (msg.t) {
      case 'config': setLocal(initialState(msg.config)); break;
      case 'setup': setLocal(mergeSetup(s, msg.side, msg.pieces, msg.ready)); break;
      case 'state': setLocal(msg.state); break;
      case 'sync:req': send({ t: 'sync', state: s } satisfies Msg); break;
      case 'sync': if (progress(msg.state) > progress(s)) setLocal(msg.state); break;
      case 'rematch': setLocal(initialState(s.config)); break;
    }
  });
  useEffect(() => { send({ t: 'sync:req' } satisfies Msg); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- 動畫：兩邊各自照 lastMove 播 ----
  const move = state.lastMove;
  const moveMs = move ? moveDuration(Math.hypot(move.to.x - move.from.x, move.to.y - move.from.y)) : 0;
  useEffect(() => {
    if (state.step !== 'resolve' || !move) { setResolved(false); return; }
    setResolved(false);
    sfx.ink();
    const t = window.setTimeout(() => {
      setResolved(true);
      if (move.slipped) sfx.miss();
      if (move.drowned) { sfx.splash(); haptic('double'); }
      if (move.killed.length) { sfx.hit(); haptic(move.killed.length > 1 ? 'triple' : 'medium'); }
      if (!move.killed.length && !move.drowned && !move.slipped) sfx.stamp();
    }, moveMs);
    return () => clearTimeout(t);
  }, [state.step, state.turnNo, move?.pieceId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 輪到我的人負責推進
  useEffect(() => {
    if (!isMyTurn || state.step !== 'resolve' || state.phase !== 'play') return;
    const t = window.setTimeout(() => update(nextTurn), moveMs + HOLD_MS);
    return () => clearTimeout(t);
  }, [state.step, state.phase, isMyTurn]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setSel(null); setAim(null); }, [state.turnNo, state.phase]);

  const showOver = state.phase === 'over' && (resolved || !move);
  useEffect(() => {
    if (!showOver) return;
    window.setTimeout(() => { if (state.winner === mySide) { sfx.win(); celebrate(); } else sfx.lose(); }, 400);
    report({ winner: state.winner, score: `剩 ${alive('L')}:${alive('R')}` });
  }, [showOver]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- 互動 ----
  const sendSetup = (next: GameState) =>
    send({ t: 'setup', side: mySide, pieces: next.pieces.filter((p) => p.side === mySide), ready: next.ready[mySide] } satisfies Msg);
  const setConfig = (patch: Partial<Config>) => {
    const config = { ...stateRef.current.config, ...patch };
    setLocal(initialState(config));
    send({ t: 'config', config } satisfies Msg);
    sfx.tap();
  };
  const onDown = (p: Pt) => {
    const s = stateRef.current;
    if (s.phase === 'setup') {
      if (s.ready[mySide]) return;
      if (myPieces.length >= s.config.count) return flashHint('數量已滿，點圈圈可以移除');
      if (!canPlace(s, mySide, p, sizeSel)) return flashHint('要放在自己的地界、離水遠一點');
      const next = placePiece(s, mySide, p, sizeSel);
      sfx.pop(); haptic('light');
      setLocal(next); sendSetup(next);
    } else if (isMyTurn && s.step === 'aim' && sel) {
      aiming.current = true;
      onMove(p);
    }
  };
  const onMove = (p: Pt) => {
    if (!aiming.current || !sel) return;
    const piece = stateRef.current.pieces.find((x) => x.id === sel)!;
    setAim(Math.atan2(p.y - piece.y, p.x - piece.x));
  };
  const onUp = () => { aiming.current = false; };
  const onTapPiece = (id: string) => {
    const s = stateRef.current;
    const piece = s.pieces.find((p) => p.id === id)!;
    if (s.phase === 'setup') {
      if (s.ready[mySide] || piece.side !== mySide) return;
      const next = removePiece(s, id);
      sfx.undo(); setLocal(next); sendSetup(next);
    } else if (isMyTurn && s.step === 'aim' && piece.side === mySide && piece.alive) {
      if (sel === id) { aiming.current = true; return; } // 從選中的圈直接拖出去瞄準
      sfx.tap(); setSel(id); setAim(null);
    }
  };
  const ready = () => {
    sfx.pop();
    const next = mergeSetup(stateRef.current, mySide, myPieces, true);
    setLocal(next); sendSetup(next);
  };
  const lastTick = useRef(-1);
  const onCharge = (p: number) => {
    setCharge(p);
    const b = Math.floor(p / 10);
    if (b !== lastTick.current) { lastTick.current = b; sfx.tick(p); }
  };
  const fire = (power: number) => {
    setCharge(null);
    if (!sel || aim === null) return;
    haptic('heavy');
    update((s) => applyMove(s, simulateMove(s, sel, aim, power)));
  };
  const rematch = () => { send({ t: 'rematch' } satisfies Msg); setLocal(initialState(stateRef.current.config)); };

  const selPiece = sel ? state.pieces.find((p) => p.id === sel) : null;

  return (
    <div className="h-full flex flex-col">
      <GameHeader
        left={<PlayerTag side={mySide} name={me.name} active={state.phase === 'play' ? isMyTurn : undefined}>⭕{state.phase === 'setup' ? myPieces.length : alive(mySide)}</PlayerTag>}
        center={state.phase === 'play' ? `第 ${state.turnNo} 手・${map.name}` : map.name}
        right={<PlayerTag side={peer.side} name={peer.name} active={state.phase === 'play' ? !isMyTurn : undefined}>⭕{state.phase === 'setup' ? '?' : alive(peer.side)}</PlayerTag>}
      />
      <PeerOffline />

      <div className="flex-1 min-h-0 flex flex-col short:flex-row">
      <div ref={areaRef} className="flex-1 min-h-0 min-w-0 flex items-center justify-center relative">
        {pw > 0 && (
          <div className="shadow-[0_18px_40px_-16px_rgba(35,33,46,.5)] rounded-sm overflow-hidden">
            <Board layout={layout} width={pw} height={ph} onDown={onDown} onMove={onMove} onUp={onUp}>
              <MapSvg map={map} />
              {state.strokes.map((s) => (
                <StrokeInk key={s.id} s={s} draw={s.turn === state.turnNo && state.step === 'resolve'} duration={moveMs} />
              ))}
              {state.pieces
                .filter((p) => !(state.phase === 'setup' && p.side !== mySide))
                .map((p) => {
                  const pending = state.step === 'resolve' && !resolved && move;
                  const isMover = pending && move.pieceId === p.id;
                  const justKilled = pending && move.killed.includes(p.id);
                  const visual = isMover || justKilled ? { alive: true } : { alive: p.alive, deathBy: p.deathBy };
                  return (
                    <PieceSvg
                      key={p.id}
                      p={p}
                      visual={visual}
                      selected={sel === p.id && state.step === 'aim'}
                      animateFrom={isMover ? move.from : null}
                      duration={moveMs}
                      onTap={p.side === mySide && (state.phase === 'setup' || (isMyTurn && state.step === 'aim')) ? onTapPiece : undefined}
                    />
                  );
                })}
              {selPiece && aim !== null && state.step === 'aim' && <AimArrow from={selPiece} angle={aim} r={SIZES[selPiece.size].r} power={charge} />}
            </Board>
          </div>
        )}
        <AnimatePresence>
          {hint && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute bottom-3 bg-ink text-paper text-sm px-3 py-1.5 rounded-full">
              {hint}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <footer className="px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] min-h-[132px] flex flex-col items-center justify-center gap-2 text-center short:w-72 short:shrink-0 short:min-h-0 short:pb-3 short:overflow-y-auto">
        {state.phase === 'setup' && (
          <>
            {isHost && !anyReady && (
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-ink-soft">每人</span>
                  <button onClick={() => setConfig({ count: Math.max(1, state.config.count - 1) })} className="p-1.5 rounded-lg bg-paper border border-ink/15"><Minus size={14} /></button>
                  <b className="text-lg w-4 text-center">{state.config.count}</b>
                  <button onClick={() => setConfig({ count: Math.min(5, state.config.count + 1) })} className="p-1.5 rounded-lg bg-paper border border-ink/15"><Plus size={14} /></button>
                  <span className="text-ink-soft">個</span>
                </div>
                <div className="flex gap-1">
                  {MAPS.map((m) => (
                    <button key={m.id} onClick={() => setConfig({ map: m.id })} className={`px-2.5 py-1 rounded-lg border-2 text-xs ${state.config.map === m.id ? 'bg-ink text-paper border-ink' : 'bg-paper border-ink/15'}`}>{m.name}</button>
                  ))}
                </div>
                <button onClick={() => setConfig({ chain: !state.config.chain })} className={`px-2.5 py-1 rounded-lg border-2 text-xs ${state.config.chain ? 'bg-ink text-paper border-ink' : 'bg-paper border-ink/15'}`}>
                  連殺 {state.config.chain ? 'ON' : 'OFF'}
                </button>
              </div>
            )}
            {!isHost && !anyReady && (
              <div className="text-xs text-ink-soft">{map.name}・每人 {state.config.count} 個・連殺 {state.config.chain ? 'ON' : 'OFF'}</div>
            )}
            {state.ready[mySide] ? (
              <div className="text-ink-soft">等 {peer.name} 佈陣完成…</div>
            ) : (
              <>
                <div className="flex gap-2">
                  {(Object.keys(SIZES) as Size[]).map((k) => (
                    <button key={k} onClick={() => setSizeSel(k)} className={`px-4 py-2 rounded-2xl border-2 text-sm font-semibold ${sizeSel === k ? 'bg-ink text-paper border-ink' : 'bg-paper border-ink/15'}`}>
                      {SIZES[k].label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5">
                  <span className="text-sm text-ink-soft">點自己地界放圈圈（{myPieces.length}/{state.config.count}）</span>
                  <Button onClick={ready} disabled={myPieces.length < state.config.count}>佈陣完成</Button>
                </div>
              </>
            )}
          </>
        )}

        {state.phase === 'play' && !isMyTurn && (
          <div className="text-ink-soft">
            {state.step === 'aim' && `${peer.name} 正在瞄準…`}
            {state.step === 'resolve' && move && (resolved ? resultText(move) : '筆滑出去了！')}
          </div>
        )}
        {isMyTurn && state.step === 'aim' && !sel && <div className="text-lg font-bold">輪到你了，點一個自己的圈圈</div>}
        {isMyTurn && state.step === 'aim' && sel && aim === null && <div className="text-lg font-bold">在紙上拖曳決定筆要往哪滑</div>}
        {isMyTurn && state.step === 'aim' && sel && aim !== null && <PowerButton onCharge={onCharge} onRelease={fire} label="按住壓筆，放開就滑出去" activeLabel="放開！" zones={ZONES} />}
        {isMyTurn && state.step === 'resolve' && move && <div className="text-lg font-bold">{resolved ? resultText(move) : '滑！'}</div>}
      </footer>
      </div>

      <AnimatePresence>
        {showOver && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-ink/50 flex items-center justify-center p-6">
            <motion.div initial={{ scale: 0.7, rotate: -6 }} animate={{ scale: 1, rotate: -2 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }} className="bg-paper rounded-3xl p-7 w-full max-w-sm text-center">
              <div className="text-6xl mb-2">{state.winner === mySide ? '🏆' : '🌊'}</div>
              <div className="text-2xl font-bold">{state.winner === mySide ? '你贏了！' : `${nameOf(state.winner!)} 贏了`}</div>
              {move && <div className="text-sm text-ink-soft mt-1">{resultText(move)}</div>}
              <div className="flex gap-3 mt-6">
                <Button variant="ghost" className="flex-1" onClick={leave}>回大廳</Button>
                <Button className="flex-1" onClick={rematch}><RotateCcw size={16} /> 再來一局</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
