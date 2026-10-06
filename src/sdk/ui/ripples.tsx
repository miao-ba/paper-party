// Tap ripples for button-mashing screens.
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
/** Tap ripples: const ripple = useRipples(); <div onPointerDown={(e) => { ripple.add(e); ... }}>{ripple.node}</div> */
export function useRipples(color = 'rgba(255,255,255,.75)') {
  const [list, setList] = useState<{ id: number; x: number; y: number }[]>([]);
  const n = useRef(0);
  const add = (e: ReactPointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const id = ++n.current;
    setList((l) => [...l.slice(-6), { id, x: e.clientX - r.left, y: e.clientY - r.top }]);
    window.setTimeout(() => setList((l) => l.filter((p) => p.id !== id)), 500);
  };
  const node = (
    <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-[inherit]">
      <AnimatePresence>
        {list.map((p) => (
          <motion.span
            key={p.id}
            className="absolute rounded-full border-[3px]"
            style={{ left: p.x, top: p.y, width: 90, height: 90, marginLeft: -45, marginTop: -45, borderColor: color }}
            initial={{ scale: 0.2, opacity: 0.9 }}
            animate={{ scale: 1.4, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
          />
        ))}
      </AnimatePresence>
    </div>
  );
  return { add, node };
}
