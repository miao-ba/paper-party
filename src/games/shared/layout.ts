import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** 所有「紙上遊戲」共用的邏輯座標：1000×700，中線在 x=500，L 在左 */
export const PAPER = { w: 1000, h: 700, fold: 500 } as const;
export type Side = 'L' | 'R';
export const other = (s: Side): Side => (s === 'L' ? 'R' : 'L');

export function usePortrait() {
  const [p, setP] = useState(() => window.innerWidth < window.innerHeight);
  useEffect(() => {
    const f = () => setP(window.innerWidth < window.innerHeight);
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);
  return p;
}

export function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

export type Region = 'left' | 'right' | 'top' | 'bottom';

/**
 * 顯示時依直/橫式與「我方永遠在下/左」做旋轉。
 * 邏輯座標不變，靠 SVG transform 顯示、用 CTM 反推觸控座標。
 */
export function useLayout(mySide: Side, portrait: boolean) {
  const flip = portrait ? mySide === 'L' : mySide === 'R';
  const gTransform = [portrait ? 'translate(700 0) rotate(90)' : '', flip ? 'rotate(180 500 350)' : ''].join(' ').trim();
  const regionOf = (side: Side): Region => {
    const first = (side === 'L') !== flip;
    return portrait ? (first ? 'top' : 'bottom') : first ? 'left' : 'right';
  };
  const toPct = (p: { x: number; y: number }) => {
    let { x, y } = p;
    if (flip) { x = PAPER.w - x; y = PAPER.h - y; }
    const s = portrait ? { x: PAPER.h - y, y: x, W: PAPER.h, H: PAPER.w } : { x, y, W: PAPER.w, H: PAPER.h };
    return { left: `${(s.x / s.W) * 100}%`, top: `${(s.y / s.H) * 100}%` };
  };
  const aspect = portrait ? PAPER.h / PAPER.w : PAPER.w / PAPER.h;
  const viewBox = portrait ? `0 0 ${PAPER.h} ${PAPER.w}` : `0 0 ${PAPER.w} ${PAPER.h}`;
  // 在這個視角下，畫在邏輯座標上要轉幾度才會「正」
  const upright = ((portrait ? -90 : 0) + (flip ? 180 : 0) + 360) % 360;
  return { portrait, flip, gTransform, regionOf, toPct, aspect, viewBox, upright };
}
export type Layout = ReturnType<typeof useLayout>;

/** 把可用區域塞滿紙的尺寸 */
export function fitPaper(area: { w: number; h: number }, aspect: number, pad = 8) {
  const availW = Math.max(0, area.w - pad * 2), availH = Math.max(0, area.h - pad * 2);
  let w = availW, h = w / aspect;
  if (h > availH) { h = availH; w = h * aspect; }
  return { w, h };
}
