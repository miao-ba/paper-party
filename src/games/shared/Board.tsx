import { useRef, type PointerEvent, type ReactNode } from 'react';
import type { Layout } from './layout';

export type Pt = { x: number; y: number };
type Handler = (p: Pt, e: PointerEvent<SVGSVGElement>) => void;

/** 一張不會摺的紙：處理直橫式旋轉與觸控 → 邏輯座標 */
export function Board({
  layout,
  width,
  height,
  onDown,
  onMove,
  onUp,
  children,
  className = '',
}: {
  layout: Layout;
  width: number;
  height: number;
  onDown?: Handler;
  onMove?: Handler;
  onUp?: Handler;
  children: ReactNode;
  className?: string;
}) {
  const gRef = useRef<SVGGElement>(null);
  const toLogical = (e: PointerEvent<SVGSVGElement>): Pt | null => {
    const ctm = gRef.current?.getScreenCTM();
    if (!ctm) return null;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: pt.x, y: pt.y };
  };
  const wrap = (h?: Handler) =>
    h &&
    ((e: PointerEvent<SVGSVGElement>) => {
      const p = toLogical(e);
      if (p) h(p, e);
    });
  return (
    <svg
      viewBox={layout.viewBox}
      width={width}
      height={height}
      className={`block touch-none ${className}`}
      onPointerDownCapture={(e) => { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 合成事件 */ } }}
      onPointerDown={wrap(onDown)}
      onPointerMove={wrap(onMove)}
      onPointerUp={wrap(onUp)}
      onPointerCancel={wrap(onUp)}
    >
      <g ref={gRef} transform={layout.gTransform}>
        {children}
      </g>
    </svg>
  );
}
