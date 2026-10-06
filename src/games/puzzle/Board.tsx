import { useEffect, useImperativeHandle, useRef, forwardRef, type PointerEvent, type WheelEvent } from 'react';
import type { PuzzleEngine } from './engine';

export interface BoardHandle {
  invalidate: () => void;
  fit: () => void;
}
export interface Cursor { x: number; y: number; at: number }

interface Props {
  engine: PuzzleEngine;
  peerColor: string;
  peerCursor: React.MutableRefObject<Cursor | null>;
  dragging: React.MutableRefObject<Set<number>>;
  onGrab: (ids: number[]) => void;
  onMove: (ids: number[], cursor: { x: number; y: number }) => void;
  onDrop: (ids: number[]) => void;
}

/** 畫布 + 觸控：拖片、平移、雙指縮放、滾輪縮放 */
export const Board = forwardRef<BoardHandle, Props>(function Board({ engine, peerColor, peerCursor, dragging, onGrab, onMove, onDrop }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const view = useRef({ s: 1, tx: 0, ty: 0 });
  const raf = useRef(0);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ ids: number[]; lx: number; ly: number } | null>(null);
  const pinch = useRef<{ d: number; s: number; cx: number; cy: number } | null>(null);

  const draw = () => {
    raf.current = 0;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#efe7d3';
    ctx.fillRect(0, 0, c.width, c.height);
    const v = { s: view.current.s * dpr, tx: view.current.tx * dpr, ty: view.current.ty * dpr };
    engine.draw(ctx, v, dragging.current, peerColor);
    const pc = peerCursor.current;
    if (pc && performance.now() - pc.at < 4000) {
      ctx.setTransform(v.s, 0, 0, v.s, v.tx, v.ty);
      ctx.fillStyle = peerColor;
      ctx.beginPath();
      ctx.arc(pc.x, pc.y, 9 / view.current.s, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2 / view.current.s;
      ctx.stroke();
    }
  };
  const invalidate = () => { if (!raf.current) raf.current = requestAnimationFrame(draw); };

  const fit = () => {
    const c = canvasRef.current;
    if (!c) return;
    const b = engine.bounds();
    const w = c.clientWidth, h = c.clientHeight;
    const s = Math.min(w / (b.x1 - b.x0), h / (b.y1 - b.y0)) * 0.95;
    view.current = { s, tx: (w - (b.x1 + b.x0) * s) / 2, ty: (h - (b.y1 + b.y0) * s) / 2 };
    invalidate();
  };
  useImperativeHandle(ref, () => ({ invalidate, fit }));

  useEffect(() => {
    const c = canvasRef.current!, wrap = wrapRef.current!;
    let first = true;
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.round(wrap.clientWidth * dpr);
      c.height = Math.round(wrap.clientHeight * dpr);
      c.style.width = `${wrap.clientWidth}px`;
      c.style.height = `${wrap.clientHeight}px`;
      if (first) { first = false; fit(); } // 第一次量到尺寸再 fit，不然算出來是縮在角落
      else invalidate();
    });
    ro.observe(wrap);
    if (import.meta.env.DEV) (window as any).__view = view;
    return () => { ro.disconnect(); cancelAnimationFrame(raf.current); raf.current = 0; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  const toBoard = (sx: number, sy: number) => ({ x: (sx - view.current.tx) / view.current.s, y: (sy - view.current.ty) / view.current.s });
  const local = (e: PointerEvent | WheelEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 2) {
      // 進入雙指縮放，取消拖片
      if (drag.current) { onDrop(drag.current.ids); dragging.current = new Set(); drag.current = null; }
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), s: view.current.s, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      return;
    }
    const bp = toBoard(p.x, p.y);
    const hit = engine.hitTest(bp.x, bp.y);
    if (hit !== null && !engine.locked.has(hit)) {
      const ids = engine.group(hit);
      engine.bringToTop(ids);
      drag.current = { ids, lx: p.x, ly: p.y };
      dragging.current = new Set(ids);
      onGrab(ids);
    } else {
      drag.current = null;
    }
    invalidate();
  };
  const onMovePtr = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    const p = local(e);
    const prev = pointers.current.get(e.pointerId)!;
    pointers.current.set(e.pointerId, p);
    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const s = Math.min(8, Math.max(0.05, (pinch.current.s * d) / pinch.current.d));
      // 以雙指中點為中心縮放，並跟著中點平移
      const v = view.current;
      const bx = (pinch.current.cx - v.tx) / v.s, by = (pinch.current.cy - v.ty) / v.s;
      view.current = { s, tx: cx - bx * s, ty: cy - by * s };
      pinch.current = { ...pinch.current, cx, cy, s, d };
      invalidate();
      return;
    }
    if (drag.current) {
      const dx = (p.x - drag.current.lx) / view.current.s, dy = (p.y - drag.current.ly) / view.current.s;
      engine.moveGroup(drag.current.ids, dx, dy);
      drag.current.lx = p.x; drag.current.ly = p.y;
      onMove(drag.current.ids, toBoard(p.x, p.y));
    } else {
      view.current.tx += p.x - prev.x;
      view.current.ty += p.y - prev.y;
    }
    invalidate();
  };
  const onUp = (e: PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (drag.current && pointers.current.size === 0) {
      onDrop(drag.current.ids);
      dragging.current = new Set();
      drag.current = null;
      invalidate();
    }
  };
  const onWheel = (e: WheelEvent<HTMLCanvasElement>) => {
    const p = local(e);
    const v = view.current;
    const k = Math.exp(-e.deltaY * 0.0015);
    const s = Math.min(8, Math.max(0.05, v.s * k));
    const bx = (p.x - v.tx) / v.s, by = (p.y - v.ty) / v.s;
    view.current = { s, tx: p.x - bx * s, ty: p.y - by * s };
    invalidate();
  };

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <canvas
        ref={canvasRef}
        className="block touch-none select-none"
        onPointerDown={onDown}
        onPointerMove={onMovePtr}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
});
