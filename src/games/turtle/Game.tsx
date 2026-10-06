import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { RotateCcw } from 'lucide-react';
import { useMessage, Button, OfflineBanner as PeerOffline, celebrate, sfx, haptic } from '@sdk';
import { useDuo as useRoom, DuoHeader as GameHeader, PlayerTag } from '@sdk/duo';
import { useSize } from '../shared/layout';
import {
  COLORS, N_COLORS, PACKS, REWARD, canOpen, canPlace, canSettle, colorOf, evaluate, finished, mustSettle, newBoard, open, place,
  progress, resultText, settle, winnerOf, type Board, type Cell, type Result, type Side, type Stats,
} from './logic';
import { BagSvg, TurtleSvg } from './Turtle';

type Phase = 'setup' | 'play' | 'over';
type Ev = { k: 'wish' } | { k: 'settle'; text: string; big: boolean };
type Burst = { id: number; text: string; tone: 'wish' | 'pair' | 'big' };
interface Snap {
  round: number;
  phase: Phase;
  packs: number;
  seed: string;
  boards: Record<Side, Board | null>;
  ready: Record<Side, boolean>;
  wishes: Record<Side, number | null>;
}
export type Msg =
  | { t: 'tt:config'; packs: number }
  | { t: 'tt:ready'; side: Side; wish: number }
  | { t: 'tt:start'; round: number; seed: string; packs: number; wishes: Record<Side, number> }
  | { t: 'tt:board'; round: number; side: Side; board: Board; ev?: Ev }
  | { t: 'tt:anim'; round: number; side: Side; cells: Cell[]; result: Result } // 開獎亮框開始，給對方同步播
  | { t: 'tt:rematch' }
  | { t: 'tt:sync:req' }
  | { t: 'tt:sync'; snap: Snap };

/** 開獎時亮框停多久才收走 */
const SETTLE_MS = 750;
/** 滿格 / 包拆完時自動開獎前停一下，讓人看到最後一隻放上去 */
const AUTO_SETTLE_MS = 380;

const initialSnap = (): Snap => ({
  round: 0, phase: 'setup', packs: PACKS[1], seed: '',
  boards: { L: null, R: null }, ready: { L: false, R: false }, wishes: { L: null, R: null },
});

export default function Game() {
  const { me, peer, isHost, send, leave, report } = useRoom();
  const mySide = me.side;

  const [s, setS] = useState<Snap>(initialSnap);
  const sRef = useRef(s);
  sRef.current = s;
  const setLocal = (next: Snap) => { sRef.current = next; setS(next); };

  const [pick, setPick] = useState<number | null>(null); // 我選的許願色（再來一局沿用）
  const [anim, setAnim] = useState<{ cells: Cell[]; result: Result } | null>(null);
  const animRef = useRef(anim);
  animRef.current = anim;
  const [burst, setBurst] = useState<Burst | null>(null);
  // 對方的開獎動畫 / 跳字，在他的盤面上同步播
  const [peerAnim, setPeerAnim] = useState<{ id: number; cells: Cell[]; result: Result } | null>(null);
  const [peerBurst, setPeerBurst] = useState<Burst | null>(null);

  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => clearTimers, []);
  const flash = (who: 'me' | 'peer', text: string, tone: Burst['tone']) => {
    const id = Date.now() + Math.random();
    const set = who === 'me' ? setBurst : setPeerBurst;
    set({ id, text, tone });
    window.setTimeout(() => set((b) => (b?.id === id ? null : b)), 1300);
  };
  const resetFx = () => { setAnim(null); setBurst(null); setPeerAnim(null); setPeerBurst(null); };

  // ---- 開局 ----
  const begin = (round: number, seed: string, packs: number, wishes: Record<Side, number>) => {
    clearTimers();
    resetFx();
    setLocal({
      round, phase: 'play', packs, seed,
      boards: { L: newBoard(packs, wishes.L), R: newBoard(packs, wishes.R) },
      ready: { L: false, R: false }, wishes,
    });
    sfx.start(); haptic('medium');
  };
  const maybeStart = (next: Snap) => {
    if (!isHost || next.phase !== 'setup' || !next.ready.L || !next.ready.R) return;
    later(() => {
      const cur = sRef.current;
      const { L, R } = cur.wishes;
      if (cur.phase !== 'setup' || !cur.ready.L || !cur.ready.R || L === null || R === null) return;
      const round = cur.round + 1;
      const seed = Math.random().toString(36).slice(2, 10);
      send({ t: 'tt:start', round, seed, packs: cur.packs, wishes: { L, R } } satisfies Msg);
      begin(round, seed, cur.packs, { L, R });
    }, 600);
  };
  const backToSetup = () => {
    clearTimers();
    resetFx();
    const cur = sRef.current;
    setLocal({ ...cur, phase: 'setup', seed: '', boards: { L: null, R: null }, ready: { L: false, R: false }, wishes: { L: null, R: null } });
  };

  // ---- 收訊息 ----
  useMessage<Msg>((m) => {
    const cur = sRef.current;
    switch (m.t) {
      case 'tt:config':
        if (cur.phase === 'setup') setLocal({ ...cur, packs: m.packs });
        break;
      case 'tt:ready': {
        const next = { ...cur, ready: { ...cur.ready, [m.side]: true }, wishes: { ...cur.wishes, [m.side]: m.wish } };
        setLocal(next);
        maybeStart(next);
        break;
      }
      case 'tt:start': begin(m.round, m.seed, m.packs, m.wishes); break;
      case 'tt:board':
        if (m.side !== peer.side || m.round !== cur.round || cur.phase === 'setup') return;
        setLocal({ ...cur, boards: { ...cur.boards, [m.side]: m.board } });
        setPeerAnim(null); // 開獎結果到了，亮框收掉、該收走的烏龜飛走
        if (m.ev?.k === 'settle') {
          flash('peer', m.ev.text, m.ev.big ? 'big' : 'pair');
          if (m.ev.big) sfx.tick(60);
        } else if (m.ev?.k === 'wish') flash('peer', '許願色！', 'wish');
        break;
      case 'tt:anim': {
        if (m.side !== peer.side || m.round !== cur.round || cur.phase !== 'play') return;
        const id = Date.now();
        setPeerAnim({ id, cells: m.cells, result: m.result });
        // 保險：結果那則掉了也不要一直亮著
        window.setTimeout(() => setPeerAnim((a) => (a?.id === id ? null : a)), SETTLE_MS + 1500);
        break;
      }
      case 'tt:rematch': backToSetup(); break;
      case 'tt:sync:req': {
        // 對方重整了：佈置階段他的準備要重來；遊戲中把我手上兩份盤面給他
        const next = cur.phase === 'setup'
          ? { ...cur, ready: { ...cur.ready, [peer.side]: false }, wishes: { ...cur.wishes, [peer.side]: null } }
          : cur;
        setLocal(next);
        send({ t: 'tt:sync', snap: next } satisfies Msg);
        break;
      }
      case 'tt:sync': {
        const snap = m.snap;
        if (snap.round > cur.round || (cur.phase === 'setup' && snap.phase !== 'setup' && snap.round >= cur.round)) {
          setLocal(snap);
        } else if (snap.round === cur.round && snap.phase !== 'setup' && cur.phase !== 'setup') {
          const boards = { ...cur.boards };
          for (const side of ['L', 'R'] as Side[]) if (progress(snap.boards[side]) > progress(boards[side])) boards[side] = snap.boards[side];
          setLocal({ ...cur, boards });
        } else if (snap.phase === 'setup' && cur.phase === 'setup') {
          setLocal({
            ...cur,
            packs: isHost ? cur.packs : snap.packs,
            ready: { ...cur.ready, [peer.side]: snap.ready[peer.side] },
            wishes: { ...cur.wishes, [peer.side]: snap.wishes[peer.side] },
          });
        }
        break;
      }
    }
  });
  useEffect(() => { send({ t: 'tt:sync:req' } satisfies Msg); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- 佈置 ----
  const anyReady = s.ready.L || s.ready.R;
  const setPacks = (packs: number) => {
    if (!isHost || anyReady) return;
    sfx.tap();
    setLocal({ ...sRef.current, packs });
    send({ t: 'tt:config', packs } satisfies Msg);
  };
  const choose = (c: number) => {
    if (s.ready[mySide]) return;
    sfx.pop(); haptic('light');
    setPick(c);
  };
  const onReady = () => {
    if (pick === null) return;
    sfx.tap();
    const cur = sRef.current;
    const next = { ...cur, ready: { ...cur.ready, [mySide]: true }, wishes: { ...cur.wishes, [mySide]: pick } };
    setLocal(next);
    send({ t: 'tt:ready', side: mySide, wish: pick } satisfies Msg);
    maybeStart(next);
  };

  // ---- 我的盤面 ----
  const mine = () => sRef.current.boards[mySide];
  const commit = (board: Board, ev?: Ev) => {
    const cur = sRef.current;
    setLocal({ ...cur, boards: { ...cur.boards, [mySide]: board } });
    send({ t: 'tt:board', round: cur.round, side: mySide, board, ev } satisfies Msg);
  };
  const onOpen = () => {
    const b = mine();
    if (!b || sRef.current.phase !== 'play' || animRef.current || !canOpen(b)) return;
    const { board, wished } = open(b, sRef.current.seed);
    sfx.rip(); haptic('light');
    if (wished) {
      later(() => { sfx.coin(); haptic('double'); }, 200);
      flash('me', `許願色！+${REWARD.wish} 包`, 'wish');
    }
    commit(board, wished ? { k: 'wish' } : undefined);
  };
  const onCell = (i: number) => {
    const b = mine();
    if (!b || sRef.current.phase !== 'play' || animRef.current || !canPlace(b, i)) return;
    sfx.pop(); haptic('light');
    commit(place(b, i));
  };
  const doSettle = () => {
    const b = mine();
    if (!b || sRef.current.phase !== 'play' || animRef.current || !canSettle(b)) return;
    const { board, result } = settle(b);
    const big = result.lines.length > 0 || result.family || result.clear;
    setAnim({ cells: b.cells, result });
    send({ t: 'tt:anim', round: sRef.current.round, side: mySide, cells: b.cells, result } satisfies Msg);
    sfx.stamp(); haptic('medium');
    later(() => {
      setAnim(null);
      commit(board, { k: 'settle', text: resultText(result), big });
      flash('me', resultText(result), big ? 'big' : 'pair');
      if (big) { sfx.jackpot(); haptic('triple'); celebrate('small'); } else sfx.coin();
    }, SETTLE_MS);
  };

  const myBoard = s.boards[mySide];
  const peerBoard = s.boards[peer.side];
  // 滿格或包拆完 → 自動開獎
  useEffect(() => {
    if (s.phase !== 'play' || !myBoard || anim || !mustSettle(myBoard)) return;
    const t = window.setTimeout(doSettle, AUTO_SETTLE_MS);
    return () => clearTimeout(t);
  }, [myBoard, anim, s.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // 兩邊都拆完 → 結算
  const myDone = !!myBoard && finished(myBoard);
  const peerDone = !!peerBoard && finished(peerBoard);
  useEffect(() => {
    if (s.phase !== 'play' || !myDone || !peerDone || anim) return;
    const t = window.setTimeout(() => {
      const cur = sRef.current;
      if (cur.phase === 'play') setLocal({ ...cur, phase: 'over' });
    }, 700);
    return () => clearTimeout(t);
  }, [s.phase, myDone, peerDone, anim]); // eslint-disable-line react-hooks/exhaustive-deps
  const winner = s.boards.L && s.boards.R ? winnerOf({ L: s.boards.L, R: s.boards.R }) : null;
  useEffect(() => {
    if (s.phase !== 'over') return;
    window.setTimeout(() => { if (winner === mySide) { sfx.win(); celebrate(); } else if (winner) sfx.lose(); else sfx.win2(); }, 300);
    if (s.boards.L && s.boards.R) report({ winner: winner ?? 'draw', score: `${s.boards.L.opened}:${s.boards.R.opened} 隻` });
  }, [s.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const rematch = () => { sfx.tap(); send({ t: 'tt:rematch' } satisfies Msg); backToSetup(); };

  if (import.meta.env.DEV) (window as any).__turtle = {
    get snap() { return sRef.current; }, get board() { return mine(); },
    open: onOpen, place: onCell, settle: doSettle, pick: choose, ready: onReady,
  };

  // ---- 畫面 ----
  return (
    <div className="h-full flex flex-col">
      <GameHeader
        left={<PlayerTag side={mySide} name={me.name}>{myBoard && <>🐢{myBoard.opened}</>}</PlayerTag>}
        center={s.phase !== 'setup' && `${s.packs} 包開局`}
        right={<PlayerTag side={peer.side} name={peer.name}>{peerBoard && <>🐢{peerBoard.opened}</>}</PlayerTag>}
      />
      <PeerOffline />

      {s.phase === 'setup' ? (
        <Setup
          isHost={isHost} anyReady={anyReady} packs={s.packs} setPacks={setPacks}
          pick={pick} choose={choose} meReady={s.ready[mySide]} peerReady={s.ready[peer.side]} peerName={peer.name} onReady={onReady}
        />
      ) : (
        <div className="flex-1 min-h-0 flex flex-col short:flex-row">
          {/* 對戰區：直式上面對方、下面我；橫式左我右對方。對方的盤面跟動畫都是即時的 */}
          <Arena className="flex-1 min-h-0 min-w-0">
            {(L) => {
              const peerView = peerBoard && (
                <PeerView
                  board={peerBoard} size={L.sp} name={peer.name} side={peer.side} done={peerDone}
                  cells={peerAnim ? peerAnim.cells : peerBoard.cells} result={peerAnim?.result ?? null} burst={peerBurst}
                />
              );
              const myView = myBoard && (
                <div className="flex flex-col items-center">
                  <div className="flex items-center gap-1 text-xs text-ink-soft mb-1.5 h-[18px]" style={{ width: L.sm }}>
                    <span className={`truncate ${myBoard.hand !== null && !anim ? 'font-bold text-ink' : ''}`}>
                      {myDone ? '你拆完了' : hintOf(myBoard, !!anim)}
                    </span>
                    <span className="flex-1" />
                    <span className="shrink-0">許願</span>
                    <TurtleSvg color={myBoard.wish} className="w-6 h-5 shrink-0" />
                  </div>
                  <BoardBox size={L.sm} burst={burst}>
                    <Grid
                      size={L.sm}
                      cells={anim ? anim.cells : myBoard.cells}
                      result={anim?.result ?? null}
                      targets={myBoard.hand !== null && !anim}
                      onCell={onCell}
                      dim={myDone}
                    />
                  </BoardBox>
                </div>
              );
              return L.portrait
                ? <div className="h-full flex flex-col items-center justify-center gap-3">{peerView}{myView}</div>
                : <div className="h-full flex items-center justify-center gap-6">{myView}{peerView}</div>;
            }}
          </Arena>

          <footer className="px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] min-h-[124px] flex flex-col items-center justify-center short:w-28 short:px-1 short:shrink-0 short:min-h-0 short:pb-2 short:pt-0">
            {myBoard && !myDone && (
              <div className="flex items-end justify-center gap-5 w-full max-w-sm short:flex-col short:items-center short:gap-1.5">
                <BagPile count={myBoard.bags} opened={myBoard.opened} disabled={!canOpen(myBoard) || !!anim} onOpen={onOpen} />
                <Hand color={myBoard.hand} opened={myBoard.opened} wish={myBoard.wish} />
                <SettleButton gain={anim ? 0 : evaluate(myBoard.cells).gain} disabled={!canSettle(myBoard) || !!anim} onClick={doSettle} />
              </div>
            )}
            {myBoard && myDone && s.phase === 'play' && (
              <div className="text-center">
                <div className="text-lg font-bold">拆完了！你拿到 {myBoard.opened} 隻 🐢</div>
                <div className="text-sm text-ink-soft">等 {peer.name} 拆完…</div>
              </div>
            )}
          </footer>
        </div>
      )}

      <AnimatePresence>
        {s.phase === 'over' && s.boards.L && s.boards.R && (
          <Over
            mine={s.boards[mySide]!} theirs={s.boards[peer.side]!} myName={me.name} peerName={peer.name}
            winner={winner} mySide={mySide} seed={s.seed} onLeave={leave} onRematch={rematch}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function hintOf(b: Board, animating: boolean) {
  if (animating) return '開獎中…';
  if (b.hand !== null) return '點一個空格擺下去';
  const gain = evaluate(b.cells).gain;
  if (canOpen(b)) return gain > 0 ? `繼續拆，或按開獎先收 +${gain}` : '點盲袋拆一包';
  return '';
}

// ---------------------------------------------------------------- 元件

/** 對方盤面旁邊那欄（名字、手上、剩幾包）的寬度 */
const PEER_INFO_W = 104;

/**
 * 量對戰區大小，算兩塊九宮格的邊長（sm = 我、sp = 對方）。開局才 mount，所以獨立成元件。
 * 直式：對方在上（盤面 + 右邊資訊欄）、我在下，對方約我的 0.56 倍；橫式：左我右對方，對方 0.85 倍。
 */
function Arena({ className, children }: { className: string; children: (l: { portrait: boolean; sm: number; sp: number }) => ReactNode }) {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  let l: { portrait: boolean; sm: number; sp: number } | null = null;
  if (w > 0 && h > 0) {
    const portrait = h > w;
    const LABEL = 24; // 我的盤面上面那行
    if (portrait) {
      let sm = Math.min(w - 24, 440);
      let sp = Math.min(sm * 0.56, w - 24 - PEER_INFO_W - 10);
      const k = Math.min(1, (h - LABEL - 12 - 8) / (sm + sp));
      l = { portrait, sm: Math.floor(sm * k), sp: Math.floor(sp * k) };
    } else {
      const sm = Math.min((w - PEER_INFO_W - 24 * 3) / 1.85, h - LABEL - 8, 520);
      l = { portrait, sm: Math.floor(sm), sp: Math.floor(sm * 0.85) };
    }
  }
  return <div ref={ref} className={className}>{l && l.sm > 0 && children(l)}</div>;
}

/** 盤面 + 蓋在上面的跳字（三連 +5、許願色…） */
function BoardBox({ size, burst, children }: { size: number; burst: Burst | null; children: ReactNode }) {
  const small = size < 260;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {children}
      <AnimatePresence>
        {burst && (
          <motion.div
            key={burst.id}
            initial={{ scale: 0.4, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0, rotate: -3 }}
            exit={{ opacity: 0, y: -30 }}
            transition={{ type: 'spring', stiffness: 600, damping: 18 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            <span className={`rounded-2xl font-black shadow-xl whitespace-nowrap ${small ? 'px-3 py-1 text-lg' : 'px-5 py-2 text-2xl'} ${
              burst.tone === 'big' ? `bg-[#f2c230] text-ink ${small ? 'text-xl' : 'text-3xl'}` : burst.tone === 'wish' ? 'bg-[#f07fae] text-white' : 'bg-ink text-paper'
            }`}>
              {burst.text}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** 對方的即時畫面：他的九宮格（含開獎動畫）+ 他手上那隻、剩幾包 */
function PeerView({ board, size, name, side, done, cells, result, burst }: {
  board: Board; size: number; name: string; side: Side; done: boolean; cells: Cell[]; result: Result | null; burst: Burst | null;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <BoardBox size={size} burst={burst}>
        <Grid size={size} cells={cells} result={result} targets={false} dim={done} />
      </BoardBox>
      <div className="flex flex-col gap-2 pt-1" style={{ width: PEER_INFO_W }}>
        <div className="flex items-center gap-1.5 text-sm font-bold min-w-0">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${side === 'L' ? 'bg-side-l' : 'bg-side-r'}`} />
          <span className="truncate">{name}</span>
        </div>
        {done ? (
          <div className="text-xs px-2 py-1 rounded-full bg-ink text-paper self-start">拆完了</div>
        ) : (
          <div className="flex items-center gap-2">
            <div className={`relative w-14 h-14 rounded-full flex items-center justify-center shrink-0 ${board.hand !== null ? 'bg-paper shadow-[0_6px_14px_-6px_rgba(35,33,46,.45)]' : 'border-2 border-dashed border-ink/20'}`}>
              <AnimatePresence mode="popLayout">
                {board.hand !== null && (
                  <motion.div
                    key={board.opened}
                    initial={{ y: 24, scale: 0.2, rotate: -25, opacity: 0 }}
                    animate={{ y: 0, scale: 1, rotate: 0, opacity: 1 }}
                    exit={{ y: -24, scale: 0.5, opacity: 0, transition: { duration: 0.18 } }}
                    transition={{ type: 'spring', stiffness: 500, damping: 16 }}
                    className="w-[80%]"
                  >
                    <TurtleSvg color={board.hand} className="w-full" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <span className="text-[11px] text-ink-soft leading-tight">{board.hand !== null ? '手上' : '拆袋中'}</span>
          </div>
        )}
        <div className="text-xs text-ink-soft flex flex-col gap-0.5">
          <span className="flex items-center gap-1"><BagSvg className="w-3.5 h-4" /> 剩 <b className="text-ink tabular-nums">{board.bags}</b> 包</span>
          <span>拿到 <b className="text-ink tabular-nums">{board.opened}</b> 隻</span>
          <span className="flex items-center gap-0.5">許願 <TurtleSvg color={board.wish} className="w-6 h-5" /></span>
        </div>
      </div>
    </div>
  );
}

/** 九宮格中心點（百分比），跟 Grid 的 padding / gap 對齊 */
const PAD = 3.5, GAP = 3;
const CELL = (100 - PAD * 2 - GAP * 2) / 3;
const center = (i: number) => ({ x: PAD + (i % 3) * (CELL + GAP) + CELL / 2, y: PAD + Math.floor(i / 3) * (CELL + GAP) + CELL / 2 });

function Grid({ size, cells, result, targets, onCell, dim }: {
  size: number; cells: Cell[]; result: Result | null; targets: boolean; onCell?: (i: number) => void; dim?: boolean;
}) {
  const kind = (i: number) => {
    if (!result) return null;
    if (result.family) return 'family';
    if (result.lines.some((l) => l.includes(i))) return 'line';
    if (result.pairs.some((p) => p.includes(i))) return 'pair';
    return null;
  };
  const r = Math.round(size * 0.042); // 格子圓角，跟著盤面大小縮
  const ring = Math.max(2, Math.round(size * 0.01));
  return (
    <div
      className={`relative bg-[#e4d8bc] shadow-[inset_0_2px_0_rgba(255,255,255,.6),0_16px_32px_-14px_rgba(35,33,46,.5)] transition-opacity ${dim ? 'opacity-60' : ''}`}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.07) }}
    >
      {cells.map((c, i) => {
        const k = kind(i);
        const p = center(i);
        const target = targets && c === null;
        return (
          <button
            key={i}
            disabled={!onCell || !target}
            onClick={() => onCell?.(i)}
            className={`absolute bg-paper/85 shadow-[inset_0_2px_6px_rgba(35,33,46,.13)] ${target ? 'outline-dashed outline-2 outline-ink/35 -outline-offset-4 active:bg-paper' : ''}`}
            style={{ left: `${p.x - CELL / 2}%`, top: `${p.y - CELL / 2}%`, width: `${CELL}%`, height: `${CELL}%`, borderRadius: r }}
          >
            {target && <span className="absolute inset-0 bg-[#f2c230]/15 animate-pulse" style={{ borderRadius: r }} />}
            {k && (
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`absolute -inset-1 ${k === 'line' ? 'border-[#f2b705] shadow-[0_0_18px_#f2c230]' : k === 'family' ? 'border-[#f07fae] shadow-[0_0_18px_#e7b8ef]' : 'border-ink/70'}`}
                style={{ borderRadius: r + 3, borderWidth: ring }}
              />
            )}
            <AnimatePresence>
              {c !== null && (
                <motion.span
                  key={`${i}-${c}`}
                  initial={{ scale: 0.3, y: -24, opacity: 0 }}
                  animate={k ? { scale: [1, 1.15, 1.08], y: 0, opacity: 1, rotate: [0, -8, 8, 0] } : { scale: 1, y: 0, opacity: 1, rotate: 0 }}
                  exit={{ y: -50, scale: 0.5, opacity: 0, transition: { duration: 0.35 } }}
                  transition={{ type: 'spring', stiffness: 520, damping: 20 }}
                  className="absolute inset-[9%] flex items-center justify-center pointer-events-none"
                >
                  <TurtleSvg color={c} className="w-full h-full" />
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        );
      })}
      {result && result.lines.length > 0 && (
        <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full pointer-events-none">
          {result.lines.map((l) => {
            const a = center(l[0]), b = center(l[2]);
            return (
              <motion.line
                key={l.join()}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke="#f2b705" strokeWidth={5} strokeLinecap="round" opacity={0.85}
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35 }}
              />
            );
          })}
        </svg>
      )}
    </div>
  );
}

function BagPile({ count, opened, disabled, onOpen }: { count: number; opened: number; disabled: boolean; onOpen: () => void }) {
  const shown = Math.min(3, count);
  return (
    <div className="flex flex-col items-center gap-1 w-[72px]">
      <motion.button
        whileTap={disabled ? undefined : { scale: 0.9 }}
        onClick={onOpen}
        disabled={disabled}
        className={`relative w-16 h-20 ${disabled ? 'opacity-40' : ''}`}
        aria-label="拆一包"
      >
        {Array.from({ length: shown }, (_, i) => {
          const top = i === shown - 1;
          return (
            <motion.div
              key={top ? `top-${opened}` : i}
              className="absolute inset-0"
              style={{ zIndex: i }}
              initial={top ? { y: 14, opacity: 0 } : false}
              animate={{ y: 0, opacity: 1, rotate: (shown - 1 - i) * -7 + (top ? 0 : 3), x: (shown - 1 - i) * -5 }}
              transition={{ type: 'spring', stiffness: 400, damping: 22 }}
            >
              <BagSvg className="w-full h-full drop-shadow-[0_4px_4px_rgba(35,33,46,.25)]" />
            </motion.div>
          );
        })}
        {count === 0 && <div className="absolute inset-0 rounded-2xl border-2 border-dashed border-ink/20 flex items-center justify-center text-xs text-ink-soft">沒了</div>}
        <span className="absolute -right-2 -top-1 z-10 min-w-7 h-7 px-1.5 rounded-full bg-side-l text-white text-sm font-black flex items-center justify-center shadow tabular-nums">{count}</span>
      </motion.button>
      <span className="text-xs text-ink-soft h-4 short:hidden">盲袋</span>
    </div>
  );
}

function Hand({ color, opened, wish }: { color: number | null; opened: number; wish: number }) {
  return (
    <div className="flex flex-col items-center gap-1 w-20">
      <div className={`relative w-20 h-20 rounded-full flex items-center justify-center ${color !== null ? 'bg-paper shadow-[0_8px_20px_-8px_rgba(35,33,46,.45)]' : 'border-2 border-dashed border-ink/20'}`}>
        <AnimatePresence mode="popLayout">
          {color !== null && (
            <motion.div
              key={opened}
              initial={{ y: 32, scale: 0.2, rotate: -25, opacity: 0 }}
              animate={{ y: 0, scale: 1, rotate: 0, opacity: 1 }}
              exit={{ y: -32, scale: 0.5, opacity: 0, transition: { duration: 0.18 } }}
              transition={{ type: 'spring', stiffness: 500, damping: 16 }}
              className="w-[80%]"
            >
              <TurtleSvg color={color} className="w-full" />
            </motion.div>
          )}
        </AnimatePresence>
        {color !== null && color === wish && (
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute -top-1 -right-1 text-xl">✨</motion.span>
        )}
      </div>
      <span className="text-xs text-ink-soft h-4">{color !== null ? `${COLORS[color].name}色` : '手上'}</span>
    </div>
  );
}

function SettleButton({ gain, disabled, onClick }: { gain: number; disabled: boolean; onClick: () => void }) {
  return (
    <div className="flex flex-col items-center gap-1 w-[72px]">
      <motion.button
        whileTap={disabled ? undefined : { scale: 0.9 }}
        onClick={onClick}
        disabled={disabled}
        className={`w-[72px] h-[72px] mb-1 rounded-3xl font-black flex flex-col items-center justify-center leading-tight transition ${
          disabled ? 'bg-paper border-2 border-ink/15 text-ink-soft opacity-60' : 'bg-[#f2c230] text-ink shadow-[0_5px_0_#b8901c] active:shadow-none active:translate-y-1'
        }`}
      >
        <span className="text-lg">開獎</span>
        <span className="text-sm tabular-nums">{gain > 0 ? `+${gain}` : '—'}</span>
      </motion.button>
      <span className="text-xs text-ink-soft h-4 short:hidden">收對子</span>
    </div>
  );
}

const RULES: { label: string; desc: string; gain: number }[] = [
  { label: '許願色', desc: '拆到自己選的顏色', gain: REWARD.wish },
  { label: '對碰', desc: '格子裡兩隻同色', gain: REWARD.pair },
  { label: '三連', desc: '同色連成一線（橫直斜）', gain: REWARD.line },
  { label: '全家福', desc: '九格九種顏色', gain: REWARD.family },
  { label: '清台', desc: '滿格一次全部收光', gain: REWARD.clear },
];

function Setup({ isHost, anyReady, packs, setPacks, pick, choose, meReady, peerReady, peerName, onReady }: {
  isHost: boolean; anyReady: boolean; packs: number; setPacks: (n: number) => void;
  pick: number | null; choose: (c: number) => void; meReady: boolean; peerReady: boolean; peerName: string; onReady: () => void;
}) {
  return (
    <>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-3">
        <div className="max-w-md mx-auto flex flex-col gap-4">
          <div className="text-center pt-2">
            <div className="flex justify-center gap-1 h-12">
              {[0, 5, 2].map((c, i) => (
                <motion.div key={c} animate={{ y: [0, -8, 0] }} transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.18 }} className="w-14">
                  <TurtleSvg color={c} className="w-full" />
                </motion.div>
              ))}
            </div>
            <div className="text-2xl font-black mt-1">烏龜對對碰</div>
            <div className="text-sm text-ink-soft mt-1">同一袋盲袋，兩人各拆各的。拆到的都是你的，最後誰拿得多誰贏。</div>
          </div>

          <div className="rounded-3xl bg-paper/90 border-2 border-ink/10 p-4">
            <div className="grid grid-cols-[auto_1fr_auto] gap-x-3 gap-y-1.5 items-center text-sm">
              {RULES.map((r) => (
                <div key={r.label} className="contents">
                  <b>{r.label}</b>
                  <span className="text-ink-soft">{r.desc}</span>
                  <span className="font-black text-side-l tabular-nums text-right">+{r.gain} 包</span>
                </div>
              ))}
            </div>
            <div className="text-xs text-ink-soft mt-3 leading-relaxed">
              拆一包 → 擺進空格。格子滿了自動開獎；沒滿也能自己按「開獎」，但等三連的那對也會一起被收走。兩人拆到的顏色順序一樣，差在擺哪裡、什麼時候開。
            </div>
          </div>

          <div>
            <div className="text-sm text-ink-soft mb-1.5">開局包數{!isHost && '（房主選）'}</div>
            <div className="flex gap-2">
              {PACKS.map((n) => (
                <button
                  key={n}
                  onClick={() => setPacks(n)}
                  disabled={!isHost || anyReady}
                  className={`flex-1 py-2 rounded-2xl border-2 font-bold ${packs === n ? 'bg-ink text-paper border-ink' : 'bg-paper border-ink/15'} ${!isHost || anyReady ? 'cursor-default' : ''} ${!isHost && packs !== n ? 'opacity-50' : ''}`}
                >
                  {n} 包
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-sm text-ink-soft mb-1.5">選許願色（開局前對方看不到）</div>
            <div className="grid grid-cols-5 gap-2">
              {Array.from({ length: N_COLORS }, (_, c) => (
                <motion.button
                  key={c}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => choose(c)}
                  disabled={meReady}
                  animate={pick === c ? { y: -3 } : { y: 0 }}
                  className={`rounded-2xl p-1.5 flex flex-col items-center border-2 ${pick === c ? 'bg-paper border-ink shadow-[0_4px_0_#23212e]' : 'bg-paper/70 border-transparent'} ${meReady && pick !== c ? 'opacity-40' : ''}`}
                >
                  <TurtleSvg color={c} className="w-full" />
                  <span className="text-xs">{COLORS[c].name}</span>
                </motion.button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <footer className="px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] min-h-[84px] flex flex-col items-center justify-center gap-1">
        {meReady ? (
          <div className="text-ink-soft">{peerReady ? '開始！' : `等 ${peerName} 選許願色…`}</div>
        ) : (
          <>
            <Button size="lg" onClick={onReady} disabled={pick === null}>{pick === null ? '先選一個許願色' : '準備好了'}</Button>
            {peerReady && <div className="text-xs text-ink-soft">{peerName} 已經準備好了</div>}
          </>
        )}
      </footer>
    </>
  );
}

const STAT_ROWS: { key: keyof Stats; label: string }[] = [
  { key: 'wish', label: '許願' }, { key: 'pair', label: '對碰' }, { key: 'line', label: '三連' }, { key: 'family', label: '全家福' }, { key: 'clear', label: '清台' },
];

function Over({ mine, theirs, myName, peerName, winner, mySide, seed, onLeave, onRematch }: {
  mine: Board; theirs: Board; myName: string; peerName: string; winner: Side | null; mySide: Side; seed: string; onLeave: () => void; onRematch: () => void;
}) {
  const counts = Array(N_COLORS).fill(0) as number[];
  for (let k = 0; k < mine.opened; k++) counts[colorOf(seed, k)]++;
  const won = winner === mySide;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-ink/50 flex items-center justify-center p-5">
      <motion.div
        initial={{ scale: 0.7, rotate: -6 }} animate={{ scale: 1, rotate: -1 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }}
        className="bg-paper rounded-3xl p-6 w-full max-w-sm text-center max-h-full overflow-y-auto"
      >
        <div className="text-5xl">{winner === null ? '🤝' : won ? '🏆' : '🐢'}</div>
        <div className="text-2xl font-black mt-1">{winner === null ? '平手！' : won ? '你拆得比較多！' : `${peerName} 拆得比較多`}</div>
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-1 text-sm mt-4 items-center">
          <span />
          <b className="truncate max-w-[6rem]">{myName}</b>
          <b className="truncate max-w-[6rem]">{peerName}</b>
          <span className="text-left text-ink-soft">拿到</span>
          <span className={`text-2xl font-black tabular-nums ${won ? 'text-side-l' : ''}`}>{mine.opened}</span>
          <span className={`text-2xl font-black tabular-nums ${winner && !won ? 'text-side-l' : ''}`}>{theirs.opened}</span>
          {STAT_ROWS.map((r) => (
            <div key={r.key} className="contents">
              <span className="text-left text-ink-soft">{r.label}</span>
              <span className="tabular-nums">{mine.stats[r.key]}</span>
              <span className="tabular-nums">{theirs.stats[r.key]}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 text-xs text-ink-soft">你的戰利品</div>
        <div className="flex flex-wrap justify-center gap-x-2 gap-y-1 mt-1">
          {counts.map((n, c) => n > 0 && (
            <span key={c} className="flex items-center text-sm tabular-nums"><TurtleSvg color={c} className="w-7 h-6" />×{n}</span>
          ))}
        </div>
        <div className="flex gap-3 mt-6">
          <Button variant="ghost" className="flex-1" onClick={onLeave}>回大廳</Button>
          <Button className="flex-1" onClick={onRematch}><RotateCcw size={16} /> 再來一局</Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
