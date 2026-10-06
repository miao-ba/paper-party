import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ImagePlus, RotateCcw, Shuffle, Trash2 } from 'lucide-react';
import { useMessage, Button, Countdown, OfflineBanner as PeerOffline, celebrate, sfx, haptic } from '@sdk';
import { useDuo as useRoom, DuoHeader as GameHeader, PlayerTag } from '@sdk/duo';
import { useSize, type Side } from '../shared/layout';
import { AXIS_MS, COUNT_MS, DEFAULT_CONFIG, DURATIONS, PEN_LERP, SHAPES, SPEEDS, TOL, TOLS, TRAIL_MS, axisFor, freeTravel, scoreTrail, verdict, type Axis, type Config, type Pt, type Score, type Target } from './logic';
import { deleteCustom, imageToTarget, listCustom, loadImageData, packPts, putCustom, toTarget, type CustomSave } from './api';

type Phase = 'menu' | 'count' | 'draw' | 'wait' | 'result';
export type Msg =
  | { t: 'd:round'; n: number; target: Target; cfg: Config }
  | { t: 'd:axis'; v: number }
  | { t: 'd:end'; n: number; trail: Pt[]; score: Score }
  | { t: 'd:menu' }
  | { t: 'sync:req' };

const COLOR: Record<Side, string> = { L: '#e8604c', R: '#2f9e95' };

export default function Game() {
  const { me, peer, isHost, send, solo, report } = useRoom();
  const mySide = me.side;

  const [phase, setPhase] = useState<Phase>('menu');
  const [target, setTarget] = useState<Target | null>(null);
  const [round, setRound] = useState(0);
  const [cfg, setCfg] = useState<Config>(DEFAULT_CONFIG);
  const [left, setLeft] = useState(0);
  const [score, setScore] = useState<Score | null>(null);

  const phaseRef = useRef<Phase>('menu');
  phaseRef.current = phase;
  const roundRef = useRef(0);
  const targetRef = useRef<Target | null>(null);
  const vals = useRef<Record<Axis, number>>({ x: 0.5, y: 0.5 });
  const pen = useRef<Pt>([0.5, 0.5]);
  const trail = useRef<Pt[]>([]);
  const endAt = useRef(0);
  const lastAxisSent = useRef(0);
  const lastTrail = useRef(0);
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;
  /** 按鍵 / 方向鍵按住中：-1 / 0 / 1 */
  const hold = useRef(0);
  const lastFrame = useRef(0);
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => clearTimers, []);

  const myAxis: Axis = axisFor(mySide, round, cfg.swap);
  const peerAxis: Axis = myAxis === 'x' ? 'y' : 'x';
  if (import.meta.env.DEV) (window as any).__draw = { vals: vals.current, get pen() { return pen.current; }, get trail() { return trail.current; }, set: (v: number) => setMine(v), get target() { return targetRef.current; }, set hold(d: number) { hold.current = d; }, get hold() { return hold.current; }, custom: (img: ImageData, strength = 0.5) => { const t = imageToTarget(img, 'dev', strength); void putCustom({ id: t.id, name: t.name, pts: packPts(t.pts), createdAt: Date.now() }); pick(t); } };

  // ---- 回合 ----
  const startRound = (n: number, t: Target, c: Config) => {
    clearTimers();
    setRound(n); roundRef.current = n;
    setTarget(t); targetRef.current = t;
    setCfg(c); cfgRef.current = c;
    hold.current = 0;
    setScore(null);
    trail.current = [];
    vals.current = { x: 0.5, y: 0.5 };
    pen.current = [0.5, 0.5];
    setPhase('count'); phaseRef.current = 'count';
    sfx.start();
    later(() => {
      setPhase('draw'); phaseRef.current = 'draw';
      endAt.current = performance.now() + c.dur * 1000;
      sfx.go(); haptic('medium');
    }, COUNT_MS);
  };
  const pick = (t: Target, c = cfg) => {
    const n = roundRef.current + 1;
    send({ t: 'd:round', n, target: t, cfg: c } satisfies Msg);
    startRound(n, t, c);
  };
  const finish = () => {
    // 房主算分並廣播；對方等結果
    if (phaseRef.current !== 'draw') return;
    if (!isHost) { setPhase('wait'); phaseRef.current = 'wait'; return; }
    const tol = TOLS[cfgRef.current.tol];
    const s = scoreTrail(targetRef.current!.pts, trail.current, tol, freeTravel(targetRef.current!.pts, tol));
    send({ t: 'd:end', n: roundRef.current, trail: trail.current, score: s } satisfies Msg);
    showResult(trail.current, s);
  };
  const showResult = (tr: Pt[], s: Score) => {
    report({ winner: null, score: `${targetRef.current?.name ?? ''} ${s.total} 分`, value: s.total });
    trail.current = tr;
    setScore(s);
    setPhase('result'); phaseRef.current = 'result';
    if (s.total >= 65) { sfx.win(); haptic('double'); celebrate(s.total >= 80 ? 'big' : 'small'); } else if (s.total >= 40) { sfx.win2(); haptic('light'); } else { sfx.lose2(); haptic('heavy'); }
  };
  const toMenu = () => { send({ t: 'd:menu' } satisfies Msg); clearTimers(); setPhase('menu'); phaseRef.current = 'menu'; };

  useMessage<Msg>((m) => {
    switch (m.t) {
      case 'd:round': startRound(m.n, m.target, m.cfg); break;
      case 'd:axis': vals.current[peerAxis] = m.v; break;
      case 'd:end': if (m.n === roundRef.current && (phaseRef.current === 'draw' || phaseRef.current === 'wait')) { clearTimers(); showResult(m.trail, m.score); } break;
      case 'd:menu': clearTimers(); setPhase('menu'); phaseRef.current = 'menu'; break;
      case 'sync:req': if (phaseRef.current !== 'menu') send({ t: 'd:menu' } satisfies Msg); break;
    }
  });
  useEffect(() => { send({ t: 'sync:req' } satisfies Msg); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- 每幀：筆追手指、記軌跡、倒數 ----
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastFrame.current) / 1000);
      lastFrame.current = now;
      if (hold.current && (phaseRef.current === 'draw' || phaseRef.current === 'count')) setMine(vals.current[myAxis] + hold.current * SPEEDS[cfgRef.current.speed] * dt);
      const p = pen.current;
      p[0] += (vals.current.x - p[0]) * PEN_LERP;
      p[1] += (vals.current.y - p[1]) * PEN_LERP;
      if (phaseRef.current === 'draw') {
        if (now - lastTrail.current >= TRAIL_MS) { lastTrail.current = now; trail.current.push([p[0], p[1]]); }
        const remain = Math.max(0, endAt.current - now);
        setLeft(Math.ceil(remain / 1000));
        if (remain <= 0) finish();
      }
      draw();
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); raf = 0; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, myAxis]);

  // ---- 鍵盤：方向鍵 / WASD，只有我這個軸的鍵有用 ----
  useEffect(() => {
    const dirOf = (k: string): number => {
      if (myAxis === 'x') return k === 'ArrowLeft' || k === 'a' || k === 'A' ? -1 : k === 'ArrowRight' || k === 'd' || k === 'D' ? 1 : 0;
      return k === 'ArrowUp' || k === 'w' || k === 'W' ? -1 : k === 'ArrowDown' || k === 's' || k === 'S' ? 1 : 0;
    };
    const down = (e: KeyboardEvent) => { const d = dirOf(e.key); if (d) { e.preventDefault(); hold.current = d; } };
    const up = (e: KeyboardEvent) => { const d = dirOf(e.key); if (d && hold.current === d) { hold.current = 0; onUp(); } };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myAxis]);
  const holdBtn = (d: number) => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); hold.current = d; try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* 合成事件沒有真的 pointer */ } },
    onPointerUp: () => { hold.current = 0; onUp(); },
    onPointerCancel: () => { hold.current = 0; onUp(); },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  // ---- 輸入：我只管一個軸 ----
  const [boxRef, size] = useSize<HTMLDivElement>();
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const setMine = (v: number) => {
    v = Math.max(0, Math.min(1, v));
    vals.current[myAxis] = v;
    const now = performance.now();
    if (now - lastAxisSent.current >= AXIS_MS) { lastAxisSent.current = now; send({ t: 'd:axis', v } satisfies Msg); }
  };
  const onPointer = (e: React.PointerEvent) => {
    if (phaseRef.current !== 'draw' && phaseRef.current !== 'count') return;
    if (e.type === 'pointerdown') (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    else if (e.buttons === 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    setMine(myAxis === 'x' ? (e.clientX - r.left) / r.width : (e.clientY - r.top) / r.height);
  };
  // 放開手指也送最後一次，免得對方卡在節流前的值
  const onUp = () => { lastAxisSent.current = 0; send({ t: 'd:axis', v: vals.current[myAxis] } satisfies Msg); };

  const draw = () => {
    const c = canvasRef.current;
    if (!c) return;
    const S = Math.min(sizeRef.current.w, sizeRef.current.h);
    if (S <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(S * dpr)) { c.width = Math.round(S * dpr); c.height = Math.round(S * dpr); }
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr * S, 0, 0, dpr * S, 0, 0);
    ctx.clearRect(0, 0, 1, 1);
    const t = targetRef.current;
    const ph = phaseRef.current;
    if (t && ph !== 'menu') drawTarget(ctx, t, ph === 'result' ? 0.25 : 0.45, TOLS[cfgRef.current.tol]);
    // 軌跡
    const tr = trail.current;
    if (tr.length > 1) {
      ctx.beginPath();
      ctx.moveTo(tr[0][0], tr[0][1]);
      for (let i = 1; i < tr.length; i++) ctx.lineTo(tr[i][0], tr[i][1]);
      ctx.strokeStyle = '#23212e';
      ctx.lineWidth = 0.012;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.stroke();
    }
    if (ph === 'count' || ph === 'draw') {
      const [px, py] = pen.current;
      // 兩條導線：我的顏色 = 我控制的軸
      ctx.lineWidth = 0.004;
      ctx.setLineDash([0.02, 0.015]);
      ctx.strokeStyle = COLOR[mySide] + 'aa';
      ctx.beginPath();
      if (myAxis === 'x') { ctx.moveTo(px, 0); ctx.lineTo(px, 1); } else { ctx.moveTo(0, py); ctx.lineTo(1, py); }
      ctx.stroke();
      ctx.strokeStyle = COLOR[peer.side] + 'aa';
      ctx.beginPath();
      if (peerAxis === 'x') { ctx.moveTo(px, 0); ctx.lineTo(px, 1); } else { ctx.moveTo(0, py); ctx.lineTo(1, py); }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(px, py, 0.016, 0, Math.PI * 2);
      ctx.fillStyle = '#23212e';
      ctx.fill();
      ctx.lineWidth = 0.005; ctx.strokeStyle = '#f5efe0'; ctx.stroke();
    }
  };

  const names: Record<Side, string> = { [mySide]: me.name, [peer.side]: peer.name } as Record<Side, string>;
  const axisLabel = (a: Axis) => (a === 'x' ? '左右 ⟷' : '上下 ↕');

  return (
    <div className="h-full flex flex-col">
      <GameHeader
        left={<PlayerTag side={mySide} name={me.name}>{phase !== 'menu' && <AxisBadge side={mySide} text={axisLabel(myAxis)} />}</PlayerTag>}
        center={target && phase !== 'menu' ? target.name : '一起一筆畫'}
        right={<PlayerTag side={peer.side} name={peer.name}>{phase !== 'menu' && <AxisBadge side={peer.side} text={axisLabel(peerAxis)} />}</PlayerTag>}
      />
      <PeerOffline />

      <div className="flex-1 min-h-0 flex flex-col short:flex-row">
      <div ref={boxRef} className="flex-1 min-h-0 min-w-0 m-3 relative flex items-center justify-center">
        {phase === 'menu' ? (
          <Menu onPick={pick} cfg={cfg} setCfg={setCfg} />
        ) : (
          <div
            className="relative rounded-3xl bg-paper shadow-[0_18px_40px_-16px_rgba(35,33,46,.5)] border-2 border-ink/10 overflow-hidden select-none touch-none"
            style={{ width: Math.min(size.w, size.h), height: Math.min(size.w, size.h), cursor: myAxis === 'x' ? 'ew-resize' : 'ns-resize' }}
            onPointerDown={onPointer} onPointerMove={onPointer} onPointerUp={onUp} onPointerCancel={onUp}
          >
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
            {(phase === 'count' || phase === 'draw') && (
              <div className="absolute top-2 left-3 text-xs font-bold px-2 py-0.5 rounded-full bg-paper/80 border" style={{ color: COLOR[mySide], borderColor: COLOR[mySide] + '66' }}>你：{axisLabel(myAxis)}</div>
            )}
            {phase === 'draw' && (
              <div className={`absolute top-2 right-3 font-black text-2xl tabular-nums ${left <= 5 ? 'text-side-l' : 'text-ink/60'}`}>{left}</div>
            )}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <AnimatePresence mode="wait">
                {phase === 'count' && (
                  <motion.div key="count" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center">
                    <Countdown ms={COUNT_MS} step={850} go="畫！" />
                    <div className="text-sm text-ink-soft mt-2 bg-paper/80 rounded-xl px-3 py-1">你負責 <b style={{ color: COLOR[mySide] }}>{axisLabel(myAxis)}</b>，{peer.name} 負責 {axisLabel(peerAxis)}{solo && '，你帶路它跟'}</div>
                  </motion.div>
                )}
                {phase === 'wait' && <motion.div key="wait" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-ink-soft bg-paper/80 rounded-xl px-3 py-1">計算中…</motion.div>}
                {phase === 'result' && score && (
                  <motion.div key="res" initial={{ y: 20, opacity: 0, scale: 0.8 }} animate={{ y: 0, opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 18 }} className="text-center bg-ink text-paper rounded-3xl px-6 py-4 shadow-2xl rotate-[-2deg]">
                    <div className="text-5xl font-black">{score.total}<span className="text-lg opacity-60"> 分</span></div>
                    <div className="text-lg font-bold mt-1">{verdict(score.total)}</div>
                    <div className="text-xs opacity-70 mt-1">畫到 {Math.round(score.covered * 100)}% 的線 ・ {Math.round(score.onLine * 100)}% 的筆跡在線上</div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>

      <footer className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] min-h-[84px] flex items-center justify-center short:w-64 short:shrink-0 short:pb-3">
        {phase === 'menu' && <div className="text-ink-soft text-sm text-center">{solo ? '你管一個軸、電腦管另一個，你帶路它會盡量待在線上。選一張圖就開始' : '一人管左右、一人管上下，筆不能停。選一張圖就開始（每回合換手）'}</div>}
        {(phase === 'count' || phase === 'draw') && (
          <div className={`w-full max-w-sm flex items-center gap-3 ${myAxis === 'y' ? 'short:flex-col' : 'short:flex-wrap short:justify-center'}`}>
            <HoldButton {...holdBtn(-1)} color={COLOR[mySide]}>{myAxis === 'x' ? <ChevronLeft size={30} /> : <ChevronUp size={30} />}</HoldButton>
            <div className={`text-ink-soft text-xs text-center flex-1 min-w-0 ${myAxis === 'x' ? 'short:order-last short:basis-full' : ''}`}>{phase === 'count' ? '按住按鈕或在畫布上滑' : solo ? '慢慢走，電腦會跟上' : `跟 ${names[peer.side]} 用嘴巴喊！`}</div>
            <HoldButton {...holdBtn(1)} color={COLOR[mySide]}>{myAxis === 'x' ? <ChevronRight size={30} /> : <ChevronDown size={30} />}</HoldButton>
          </div>
        )}
        {phase === 'wait' && <div className="text-ink-soft text-sm">等房主算分…</div>}
        {phase === 'result' && (
          <div className="flex gap-3 w-full max-w-sm short:flex-col">
            <Button variant="ghost" className="flex-1" onClick={toMenu}><Shuffle size={16} /> 換一張</Button>
            <Button className="flex-1" onClick={() => pick(target!)}><RotateCcw size={16} /> {cfg.swap ? '再來（換手）' : '再來'}</Button>
          </div>
        )}
      </footer>
      </div>
    </div>
  );
}

/** 按住就一直走的方向鈕 */
function HoldButton({ color, children, ...rest }: { color: string; children: React.ReactNode } & React.HTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...rest} className="w-20 h-16 rounded-2xl bg-paper border-2 flex items-center justify-center select-none touch-none active:scale-95 active:bg-ink/10 transition" style={{ borderColor: color, color }}>
      {children}
    </button>
  );
}

function drawTarget(ctx: CanvasRenderingContext2D, t: Target, alpha: number, tol: number = TOL) {
  ctx.save();
  ctx.globalAlpha = alpha;
  if (t.lines) {
    ctx.strokeStyle = '#6b6580';
    ctx.lineWidth = tol * 0.9;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const line of t.lines) {
      ctx.beginPath();
      ctx.moveTo(line[0][0], line[0][1]);
      for (let i = 1; i < line.length; i++) ctx.lineTo(line[i][0], line[i][1]);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = '#6b6580';
    const r = tol * 0.35;
    for (const [x, y] of t.pts) ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.restore();
}

// ---- 選圖 ----
function Menu({ onPick, cfg, setCfg }: { onPick: (t: Target, c: Config) => void; cfg: Config; setCfg: (c: Config) => void }) {
  const [customs, setCustoms] = useState<CustomSave[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [img, setImg] = useState<ImageData | null>(null);
  const [strength, setStrength] = useState(0.5);
  const [preview, setPreview] = useState<Target | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { void listCustom().then(setCustoms).catch(() => {}); }, []);
  useEffect(() => {
    if (!file) { setImg(null); setPreview(null); return; }
    setBusy(true);
    loadImageData(file).then((d) => { setImg(d); setName(file.name.replace(/\.[^.]+$/, '').slice(0, 12)); }).catch((e) => alert(String(e))).finally(() => setBusy(false));
  }, [file]);
  useEffect(() => { if (img) setPreview(imageToTarget(img, name || '自訂', strength)); }, [img, strength]); // eslint-disable-line react-hooks/exhaustive-deps

  const startCustom = async () => {
    if (!preview) return;
    const t: Target = { ...preview, name: name.trim() || '自訂' };
    const save: CustomSave = { id: t.id, name: t.name, pts: packPts(t.pts), createdAt: Date.now() };
    void putCustom(save).catch(() => {});
    onPick(t, cfg);
  };
  const customDur = !(DURATIONS as readonly number[]).includes(cfg.dur);
  const [durText, setDurText] = useState(customDur ? String(cfg.dur) : '');
  useEffect(() => { if (!customDur) setDurText(''); }, [customDur]);
  const remove = async (id: string) => { await deleteCustom(id); setCustoms((c) => c.filter((s) => s.id !== id)); sfx.undo(); };

  return (
    <div className="absolute inset-0 overflow-y-auto">
      <div className="max-w-md mx-auto flex flex-col gap-4 pb-4">
        <section className="bg-paper rounded-3xl p-4 border-2 border-ink/10 flex flex-col gap-2.5">
          <h2 className="font-bold">設定</h2>
          <Opt label="時間">
            {DURATIONS.map((d) => <Chip key={d} on={cfg.dur === d} onClick={() => setCfg({ ...cfg, dur: d })}>{d}s</Chip>)}
            <label className={`flex items-center gap-1 px-2 py-1 rounded-lg ${customDur ? 'bg-ink text-paper' : 'bg-ink/5 text-ink-soft'}`}>
              自訂
              <input type="number" inputMode="numeric" min={5} max={600} value={durText} placeholder="秒" onFocus={() => { if (!customDur) { setDurText('120'); setCfg({ ...cfg, dur: 120 }); } }} onChange={(e) => setDurText(e.target.value)} onBlur={() => { const n = Math.max(5, Math.min(600, Math.round(Number(durText)) || 5)); setDurText(String(n)); setCfg({ ...cfg, dur: n }); }} className="w-12 bg-transparent text-center outline-none border-b border-current" />
            </label>
          </Opt>
          <Opt label="按鍵速度">{(['slow', 'mid', 'fast'] as const).map((k) => <Chip key={k} on={cfg.speed === k} onClick={() => setCfg({ ...cfg, speed: k })}>{{ slow: '慢', mid: '中', fast: '快' }[k]}</Chip>)}</Opt>
          <Opt label="判定">{(['loose', 'normal', 'strict'] as const).map((k) => <Chip key={k} on={cfg.tol === k} onClick={() => setCfg({ ...cfg, tol: k })}>{{ loose: '寬鬆', normal: '普通', strict: '嚴格' }[k]}</Chip>)}</Opt>
          <Opt label="換手"><Chip on={cfg.swap} onClick={() => setCfg({ ...cfg, swap: true })}>每回合換</Chip><Chip on={!cfg.swap} onClick={() => setCfg({ ...cfg, swap: false })}>固定</Chip></Opt>
        </section>

        <section className="bg-paper rounded-3xl p-4 border-2 border-ink/10">
          <h2 className="font-bold mb-3">選一張</h2>
          <div className="grid grid-cols-4 gap-2">
            {SHAPES.map((s) => (
              <button key={s.id} onClick={() => { sfx.tap(); onPick(s, cfg); }} className="rounded-2xl bg-white/60 border-2 border-ink/10 p-1.5 active:scale-95 transition">
                <Thumb t={s} />
                <div className="text-xs mt-1">{s.name}</div>
              </button>
            ))}
            {customs.map((s) => (
              <div key={s.id} className="relative">
                <button onClick={() => { sfx.tap(); onPick(toTarget(s), cfg); }} className="w-full rounded-2xl bg-white/60 border-2 border-ink/10 p-1.5 active:scale-95 transition">
                  <Thumb t={toTarget(s)} />
                  <div className="text-xs mt-1 truncate">{s.name}</div>
                </button>
                <button onClick={() => remove(s.id)} className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-paper border-2 border-ink/10 flex items-center justify-center text-ink-soft"><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-paper rounded-3xl p-4 border-2 border-ink/10">
          <h2 className="font-bold mb-3">自己的圖 → 線稿</h2>
          <label className="block rounded-2xl border-2 border-dashed border-ink/20 bg-white/50 overflow-hidden cursor-pointer active:bg-ink/5">
            <input type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            {preview ? (
              <div className="p-2 flex justify-center"><Thumb t={preview} size={200} /></div>
            ) : (
              <div className="py-8 flex flex-col items-center gap-2 text-ink-soft"><ImagePlus /> {busy ? '轉線稿中…' : '選一張照片（簡單線條的圖最好畫）'}</div>
            )}
          </label>
          {preview && (
            <div className="mt-3 flex flex-col gap-3">
              <label className="flex items-center gap-3 text-sm">
                <span className="text-ink-soft whitespace-nowrap">線條多寡</span>
                <input type="range" min={0} max={1} step={0.05} value={strength} onChange={(e) => setStrength(Number(e.target.value))} className="flex-1 accent-[#23212e]" />
              </label>
              <div className="flex gap-2">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="取個名字" maxLength={12} className="flex-1 min-w-0 rounded-xl border-2 border-ink/10 bg-white/60 px-3 py-2 text-sm" />
                <Button onClick={startCustom} disabled={preview.pts.length < 30}>開始畫</Button>
              </div>
              {preview.pts.length < 30 && <div className="text-xs text-side-l">線太少了，調高「線條多寡」或換一張</div>}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Opt({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-ink-soft w-14 shrink-0">{label}</span>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={() => { sfx.tap(); onClick(); }} className={`px-2 py-1 rounded-lg ${on ? 'bg-ink text-paper' : 'bg-ink/5 text-ink-soft'}`}>{children}</button>;
}

function Thumb({ t, size = 64 }: { t: Target; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const dpr = window.devicePixelRatio || 1;
    c.width = size * dpr; c.height = size * dpr;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr * size, 0, 0, dpr * size, 0, 0);
    ctx.clearRect(0, 0, 1, 1);
    drawTarget(ctx, t, 1);
  }, [t, size]);
  return <canvas ref={ref} style={{ width: size, height: size }} className="mx-auto rounded-xl bg-white" />;
}

function AxisBadge({ side, text }: { side: Side; text: string }) {
  return <span className="hidden sm:inline text-[10px] font-bold whitespace-nowrap" style={{ color: COLOR[side] }}>{text}</span>;
}
