import { useMemo } from 'react';
import { motion } from 'framer-motion';
import type { Ink } from '../paper-snipe/logic';

export function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** 有點不規則的墨點，蓋印的比畫的更毛邊 */
export function blobPath(r: number, seed: string, rough: number, n = 14) {
  const rnd = hash(seed);
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (1 + (rnd() - 0.5) * rough);
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  const mid = (i: number) => {
    const p = pts[i], q = pts[(i + 1) % n];
    return `${(p[0] + q[0]) / 2},${(p[1] + q[1]) / 2}`;
  };
  // 以相鄰點中點為錨、頂點為控制點的平滑閉合曲線
  let d = `M${mid(0)}`;
  for (let i = 1; i < n; i++) d += `Q${pts[i][0]},${pts[i][1]} ${mid(i)}`;
  d += `Q${pts[0][0]},${pts[0][1]} ${mid(0)}`;
  return d + 'Z';
}

export function InkBlob({ ink, pop }: { ink: Ink; pop?: boolean }) {
  const print = ink.kind === 'print';
  const d = useMemo(() => blobPath(ink.r, ink.id, print ? 0.45 : 0.2), [ink.r, ink.id, print]);
  return (
    <g transform={`translate(${ink.x} ${ink.y})`}>
      <motion.path
        d={d}
        fill={print ? '#2a2740' : '#17151f'}
        opacity={print ? 0.85 : 1}
        initial={pop ? { scale: 0 } : false}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 520, damping: 18 }}
        style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
      />
    </g>
  );
}
