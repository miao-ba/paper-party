import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ImagePlus, Maximize2, Palette, Trash2, Undo2 } from 'lucide-react';
import { useMessage, Button, OfflineBanner as PeerOffline, celebrate, sfx, haptic } from '@sdk';
import { useDuo as useRoom, DuoHeader as GameHeader } from '@sdk/duo';
import { SHAPES, gridFor, previewPathD, type ShapeId } from './geometry';
import { PuzzleEngine, loadScaled, type PuzzleMeta, type PuzzleSave, type Pos } from './engine';
import { Board, type BoardHandle, type Cursor } from './Board';
import { deleteSave, listSaves, putSave, uploadImage } from './api';
import { paintScene } from './paint';

export type Msg =
  | { t: 'p:new'; meta: PuzzleMeta; pos: number[]; order: number[] }
  | { t: 'p:open'; save: PuzzleSave }
  | { t: 'p:grab'; ids: number[] }
  | { t: 'p:move'; pos: Pos; cursor: { x: number; y: number } }
  | { t: 'p:drop'; pos: Pos; links: [number, number][] }
  | { t: 'p:close' }
  | { t: 'p:state:req' }
  | { t: 'p:state'; save: PuzzleSave | null };

const COUNTS = [12, 24, 48, 96, 150, 200, 300, 500];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export default function Game() {
  const { me, peer, send, solo, report } = useRoom();
  const peerColor = peer.side === 'L' ? '#e8604c' : '#2f9e95';

  const [engine, setEngine] = useState<PuzzleEngine | null>(null);
  const engineRef = useRef<PuzzleEngine | null>(null);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const board = useRef<BoardHandle>(null);
  const peerCursor = useRef<Cursor | null>(null);
  const dragging = useRef<Set<number>>(new Set());
  const lastMoveSent = useRef(0);
  const saveTimer = useRef(0);

  // ---- 建立 / 開啟 ----
  const mount = async (save: PuzzleSave, scatter: boolean) => {
    setBusy('載入圖片…');
    try {
      const img = await loadScaled(save.imageUrl, 4000);
      const e = new PuzzleEngine(save, img);
      if (scatter) e.scatter(); else e.load(save);
      engineRef.current = e;
      if (import.meta.env.DEV) (window as any).__puzzle = e;
      setEngine(e);
      setProgress(e.progress());
      setDone(e.done());
    } finally {
      setBusy(null);
    }
  };
  const currentSave = (): PuzzleSave | null => {
    const e = engineRef.current;
    if (!e) return null;
    return { ...e.meta, ...e.toSave(), updatedAt: Date.now() };
  };
  const scheduleSave = () => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { const s = currentSave(); if (s) void putSave(s); }, 800);
  };

  const createPuzzle = async (src: File | HTMLCanvasElement, count: number, shape: ShapeId, name: string) => {
    setBusy('處理圖片…');
    try {
      const canvas = src instanceof HTMLCanvasElement ? src : await loadScaled(src, 1600);
      setBusy('上傳中…');
      const imageUrl = await uploadImage(canvas);
      const { cols, rows } = gridFor(count, canvas.width, canvas.height);
      const meta: PuzzleMeta = { id: uid(), name, imageUrl, W: canvas.width, H: canvas.height, cols, rows, shape, seed: Math.floor(Math.random() * 2 ** 31) };
      const e = new PuzzleEngine(meta, canvas);
      e.scatter();
      engineRef.current = e;
      if (import.meta.env.DEV) (window as any).__puzzle = e;
      setEngine(e);
      setProgress(0);
      setDone(false);
      const s = e.toSave();
      send({ t: 'p:new', meta, pos: s.pos, order: s.order } satisfies Msg);
      void putSave({ ...meta, ...s, updatedAt: Date.now() });
      sfx.start();
    } catch (err) {
      alert(String(err));
    } finally {
      setBusy(null);
    }
  };
  const openSave = (save: PuzzleSave) => {
    send({ t: 'p:open', save } satisfies Msg);
    void mount(save, false);
  };
  const close = () => {
    send({ t: 'p:close' } satisfies Msg);
    engineRef.current = null;
    setEngine(null);
  };

  // ---- 網路 ----
  useMessage<Msg>(async (m) => {
    const e = engineRef.current;
    switch (m.t) {
      case 'p:new': {
        const save: PuzzleSave = { ...m.meta, pos: m.pos, links: [], order: m.order, progress: 0, updatedAt: Date.now() };
        void mount(save, false);
        break;
      }
      case 'p:open': void mount(m.save, false); break;
      case 'p:close': engineRef.current = null; setEngine(null); break;
      case 'p:state:req': send({ t: 'p:state', save: currentSave() } satisfies Msg); break;
      case 'p:state': if (m.save && !engineRef.current) void mount(m.save, false); break;
      case 'p:grab':
        if (!e) return;
        for (const i of m.ids) e.locked.add(i);
        e.bringToTop(m.ids);
        board.current?.invalidate();
        break;
      case 'p:move':
        if (!e) return;
        e.applyPositions(m.pos);
        peerCursor.current = { ...m.cursor, at: performance.now() };
        board.current?.invalidate();
        break;
      case 'p:drop':
        if (!e) return;
        e.applyPositions(m.pos);
        for (const [i] of m.pos) e.locked.delete(i);
        e.locked = new Set([...e.locked].filter((i) => !m.pos.some(([j]) => j === i)));
        if (m.links.length) { e.addLinks(m.links); sfx.pop(); }
        setProgress(e.progress());
        if (e.done()) finish();
        board.current?.invalidate();
        break;
    }
  });
  useEffect(() => { send({ t: 'p:state:req' } satisfies Msg); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = () => {
    setDone(true); sfx.win(); haptic('triple'); celebrate();
    const e = engineRef.current;
    if (e) report({ winner: null, score: `${e.meta.name} ${e.n} 片`, value: e.n });
  };

  const positionsOf = (ids: number[]): Pos => ids.map((i) => [i, engineRef.current!.x(i), engineRef.current!.y(i)]);
  const onGrab = (ids: number[]) => { sfx.tap(); send({ t: 'p:grab', ids } satisfies Msg); };
  const onMove = (ids: number[], cursor: { x: number; y: number }) => {
    const now = performance.now();
    if (now - lastMoveSent.current < 40) return;
    lastMoveSent.current = now;
    send({ t: 'p:move', pos: positionsOf(ids), cursor } satisfies Msg);
  };
  const onDrop = (ids: number[]) => {
    const e = engineRef.current!;
    const tol = Math.max(e.pw, e.ph) * 0.2;
    const links = e.snap(ids, tol);
    const group = links.length ? e.group(ids[0]) : ids;
    send({ t: 'p:drop', pos: positionsOf(group), links } satisfies Msg);
    if (links.length) { sfx.pop(); haptic('light'); }
    setProgress(e.progress());
    if (e.done()) finish();
    board.current?.invalidate();
    scheduleSave();
  };

  return (
    <div className="h-full flex flex-col">
      <GameHeader
        left={
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-paper border-2 border-ink/10 text-sm min-w-0">
            <span className="font-bold truncate">🧩 {engine ? engine.meta.name : '一起拼圖'}</span>
            {engine && <span className="text-ink-soft shrink-0 tabular-nums">{Math.round(progress * 100)}%</span>}
          </div>
        }
        center={engine && `${engine.meta.cols}×${engine.meta.rows} 片`}
        actions={engine && (
          <>
            <button onClick={() => board.current?.fit()} className="p-1.5 sm:p-2 rounded-xl text-ink-soft active:bg-ink/10 shrink-0" title="看全部"><Maximize2 size={18} /></button>
            <button onClick={close} className="p-1.5 sm:p-2 rounded-xl text-ink-soft active:bg-ink/10 shrink-0" title="回選單"><Undo2 size={18} /></button>
          </>
        )}
      />
      <PeerOffline />

      <div className="flex-1 min-h-0 relative">
        {engine ? (
          <>
            {engine && <div className="absolute left-0 right-0 top-0 h-1 bg-ink/10 z-10"><div className="h-full bg-side-r transition-all" style={{ width: `${progress * 100}%` }} /></div>}
            <Board ref={board} engine={engine} peerColor={peerColor} peerCursor={peerCursor} dragging={dragging} onGrab={onGrab} onMove={onMove} onDrop={onDrop} />
          </>
        ) : (
          <Menu onCreate={createPuzzle} onOpen={openSave} busy={busy} peerName={solo ? null : peer.name} myName={me.name} />
        )}
        {busy && engine && <div className="absolute inset-0 bg-paper/70 flex items-center justify-center text-ink-soft">{busy}</div>}
        <AnimatePresence>
          {done && engine && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
              <motion.div initial={{ scale: 0.6, rotate: -6 }} animate={{ scale: 1, rotate: -2 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }} className="bg-paper rounded-3xl px-8 py-6 text-center shadow-2xl pointer-events-auto">
                <div className="text-5xl mb-2">🎉</div>
                <div className="text-2xl font-bold">拼完了！</div>
                <div className="text-sm text-ink-soft mt-1">{engine.meta.cols * engine.meta.rows} 片・{solo ? me.name : `${me.name} × ${peer.name}`}</div>
                <div className="flex gap-3 mt-5">
                  <Button variant="ghost" className="flex-1" onClick={() => setDone(false)}>再看看</Button>
                  <Button className="flex-1" onClick={close}>回選單</Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ---------------- 選單：新拼圖 / 繼續 ----------------
function Menu({ onCreate, onOpen, busy, peerName, myName }: { onCreate: (src: File | HTMLCanvasElement, count: number, shape: ShapeId, name: string) => void; onOpen: (s: PuzzleSave) => void; busy: string | null; peerName: string | null; myName: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [painted, setPainted] = useState<HTMLCanvasElement | null>(null);
  const [preview, setPreview] = useState<{ url: string; w: number; h: number } | null>(null);
  const [count, setCount] = useState(96);
  const [shape, setShape] = useState<ShapeId>('classic');
  const [saves, setSaves] = useState<PuzzleSave[] | null>(null);

  useEffect(() => { void listSaves().then(setSaves).catch(() => setSaves([])); }, []);
  useEffect(() => {
    if (painted) { setPreview({ url: painted.toDataURL('image/jpeg', 0.8), w: painted.width, h: painted.height }); return; }
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => setPreview({ url, w: img.naturalWidth, h: img.naturalHeight });
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file, painted]);
  const paint = () => { sfx.pop(); setFile(null); setPainted(paintScene()); };

  const grid = preview ? gridFor(count, preview.w, preview.h) : null;

  return (
    <div className="absolute inset-0 overflow-y-auto">
      <div className="max-w-md mx-auto p-4 pb-10 flex flex-col gap-6">
        <section className="bg-paper rounded-3xl p-4 border-2 border-ink/10">
          <h2 className="font-bold mb-3">新拼圖</h2>
          <label className="block rounded-2xl border-2 border-dashed border-ink/20 bg-white/50 overflow-hidden cursor-pointer active:bg-ink/5">
            <input type="file" accept="image/*" className="hidden" onChange={(e) => { setPainted(null); setFile(e.target.files?.[0] ?? null); }} />
            {preview ? (
              <img src={preview.url} className="w-full max-h-56 object-contain" />
            ) : (
              <div className="py-8 flex flex-col items-center gap-2 text-ink-soft"><ImagePlus /> 選一張照片</div>
            )}
          </label>
          <button onClick={paint} className="mt-2 w-full py-2 rounded-xl border-2 border-ink/10 bg-white/60 text-sm text-ink-soft flex items-center justify-center gap-1.5 active:bg-ink/5">
            <Palette size={16} /> {painted ? '再畫一張' : '沒有照片？隨機畫一張風景'}
          </button>
          <div className="mt-4">
            <div className="text-sm text-ink-soft mb-1.5">片數{grid && <span> ・ 實際 {grid.cols}×{grid.rows} = {grid.cols * grid.rows}</span>}</div>
            <div className="flex flex-wrap gap-1.5">
              {COUNTS.map((n) => (
                <button key={n} onClick={() => setCount(n)} className={`px-3 py-1.5 rounded-xl border-2 text-sm ${count === n ? 'bg-ink text-paper border-ink' : 'bg-white/60 border-ink/10'}`}>{n}</button>
              ))}
            </div>
          </div>
          <div className="mt-4">
            <div className="text-sm text-ink-soft mb-1.5">形狀</div>
            <div className="grid grid-cols-4 gap-2">
              {(Object.keys(SHAPES) as ShapeId[]).map((k) => (
                <button key={k} onClick={() => setShape(k)} className={`rounded-2xl border-2 p-2 flex flex-col items-center gap-1 ${shape === k ? 'bg-ink text-paper border-ink' : 'bg-white/60 border-ink/10'}`}>
                  <svg viewBox="-40 -40 180 180" className="w-12 h-12"><path d={previewPathD(k)} fill={shape === k ? '#fbf7ee' : '#e8604c'} stroke={shape === k ? 'none' : '#23212e'} strokeWidth={4} /></svg>
                  <span className="text-xs">{SHAPES[k].label}</span>
                </button>
              ))}
            </div>
          </div>
          <Button size="lg" className="w-full mt-4" disabled={(!file && !painted) || !!busy} onClick={() => {
            if (painted) onCreate(painted, count, shape, '隨機風景');
            else if (file) onCreate(file, count, shape, file.name.replace(/\.[^.]+$/, ''));
          }}>
            {busy ?? (peerName ? `開始，跟 ${peerName} 一起拼` : '開始拼')}
          </Button>
        </section>

        <section>
          <h2 className="font-bold mb-2 px-1">繼續</h2>
          {saves === null && <div className="text-sm text-ink-soft px-1">讀取中…</div>}
          {saves?.length === 0 && <div className="text-sm text-ink-soft px-1">還沒有存檔。{myName}，開一張吧。</div>}
          <div className="flex flex-col gap-2">
            {saves?.map((s) => (
              <div key={s.id} className="bg-paper rounded-2xl border-2 border-ink/10 p-2 flex items-center gap-3">
                <button onClick={() => onOpen(s)} className="flex items-center gap-3 flex-1 text-left active:opacity-70">
                  <img src={s.imageUrl} className="w-16 h-16 object-cover rounded-xl bg-ink/5" />
                  <div className="min-w-0 flex-1">
                    <div className="font-bold truncate">{s.name}</div>
                    <div className="text-xs text-ink-soft">{s.cols}×{s.rows}・{SHAPES[s.shape].label}・{new Date(s.updatedAt).toLocaleDateString()}</div>
                    <div className="mt-1 h-1.5 rounded-full bg-ink/10 overflow-hidden"><div className="h-full bg-side-r" style={{ width: `${(s.progress ?? 0) * 100}%` }} /></div>
                  </div>
                </button>
                <button onClick={() => { if (confirm(`刪除「${s.name}」？`)) void deleteSave(s.id).then(() => setSaves((l) => l?.filter((x) => x.id !== s.id) ?? null)); }} className="p-2 text-ink-soft active:bg-ink/10 rounded-xl"><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
