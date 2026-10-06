import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** true when the window is taller than wide. */
export function usePortrait() {
  const [p, setP] = useState(() => window.innerWidth < window.innerHeight);
  useEffect(() => {
    const f = () => setP(window.innerWidth < window.innerHeight);
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);
  return p;
}

/** Measure an element: const [ref, { w, h }] = useSize<HTMLDivElement>(); */
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
