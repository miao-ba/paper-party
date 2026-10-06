import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { PAPER } from '../shared/layout';
import { blobPath, hash } from '../shared/InkBlob';
import { territoryPolygon, type GameMap } from './maps';
import { SIZES, expected, type Piece, type Stroke } from './logic';

const SIDE = { L: 'var(--color-side-l)', R: 'var(--color-side-r)' };

/** 地形：地界底色、河、橋、島 */
export function MapSvg({ map }: { map: GameMap }) {
  const riverD = map.river.pts.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ');
  return (
    <g>
      <rect x={0} y={0} width={PAPER.w} height={PAPER.h} fill="var(--color-paper)" />
      <polygon points={territoryPolygon(map, 'L')} fill={SIDE.L} opacity={0.06} />
      <polygon points={territoryPolygon(map, 'R')} fill={SIDE.R} opacity={0.06} />
      {/* 河：先畫深一點的岸，再畫水 */}
      <path d={riverD} fill="none" stroke="#7fb3c4" strokeWidth={map.river.w + 8} strokeLinecap="round" strokeLinejoin="round" opacity={0.55} />
      <path d={riverD} fill="none" stroke="#bfe3ec" strokeWidth={map.river.w} strokeLinecap="round" strokeLinejoin="round" />
      {/* 水紋 */}
      <path d={riverD} fill="none" stroke="#ffffff" strokeWidth={2} strokeDasharray="14 26" strokeLinecap="round" opacity={0.6} transform="translate(-22 10)" />
      <path d={riverD} fill="none" stroke="#ffffff" strokeWidth={2} strokeDasharray="10 30" strokeLinecap="round" opacity={0.5} transform="translate(26 -14)" />
      {map.islands.map((i, k) => (
        <g key={k}>
          <circle cx={i.x} cy={i.y} r={i.r + 4} fill="#9c8a66" opacity={0.5} />
          <circle cx={i.x} cy={i.y} r={i.r} fill="#efe4c8" />
        </g>
      ))}
      {map.bridges.map((b, k) => (
        <g key={k}>
          <line x1={b.a.x} y1={b.a.y} x2={b.b.x} y2={b.b.y} stroke="#8a6a3d" strokeWidth={b.w + 6} strokeLinecap="butt" opacity={0.7} />
          <line x1={b.a.x} y1={b.a.y} x2={b.b.x} y2={b.b.y} stroke="#d9b98a" strokeWidth={b.w} strokeLinecap="butt" />
          <line x1={b.a.x} y1={b.a.y} x2={b.b.x} y2={b.b.y} stroke="#8a6a3d" strokeWidth={b.w} strokeDasharray="3 15" strokeLinecap="butt" opacity={0.35} />
        </g>
      ))}
    </g>
  );
}

/** 手繪感的圈圈 */
export function PieceSvg({
  p,
  selected,
  visual,
  onTap,
  animateFrom,
  duration,
}: {
  p: Piece;
  selected?: boolean;
  /** 動畫尚未播完時，用這個覆蓋顯示狀態 */
  visual: { alive: boolean; deathBy?: 'water' | 'hit' };
  onTap?: (id: string) => void;
  animateFrom?: { x: number; y: number } | null;
  duration?: number;
}) {
  const r = SIZES[p.size].r;
  const d = useMemo(() => blobPath(r, p.id, 0.12, 18), [r, p.id]);
  const color = SIDE[p.side];
  const dead = !visual.alive;
  const water = dead && visual.deathBy === 'water';
  return (
    <motion.g
      initial={animateFrom ? { x: animateFrom.x, y: animateFrom.y } : false}
      animate={{ x: p.x, y: p.y }}
      transition={animateFrom ? { duration: (duration ?? 600) / 1000, ease: 'easeOut' } : { duration: 0 }}
      onPointerDown={onTap ? (e) => { e.stopPropagation(); onTap(p.id); } : undefined}
      style={{ cursor: onTap ? 'pointer' : 'default', pointerEvents: onTap ? 'auto' : 'none' }}
    >
      {selected && (
        <motion.circle r={r + 9} fill="none" stroke={color} strokeWidth={2} strokeDasharray="6 6" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 6, ease: 'linear' }} />
      )}
      <motion.g animate={water ? { scale: 0.55, opacity: 0.35 } : { scale: 1, opacity: dead ? 0.45 : 1 }} transition={{ duration: 0.5 }}>
        <path d={d} fill={color} opacity={0.12} />
        <path d={d} fill="none" stroke={color} strokeWidth={4} strokeLinejoin="round" />
        {dead && !water && (
          <g stroke="var(--color-ink)" strokeWidth={3.5} strokeLinecap="round">
            <line x1={-r * 0.6} y1={-r * 0.6} x2={r * 0.6} y2={r * 0.6} />
            <line x1={r * 0.6} y1={-r * 0.6} x2={-r * 0.6} y2={r * 0.6} />
          </g>
        )}
      </motion.g>
      {water && (
        <>
          <motion.circle r={r} fill="none" stroke="#5f9fb5" strokeWidth={2} initial={{ scale: 0.6, opacity: 0.8 }} animate={{ scale: 2.2, opacity: 0 }} transition={{ duration: 1.2 }} />
          <motion.circle r={r} fill="none" stroke="#5f9fb5" strokeWidth={2} initial={{ scale: 0.6, opacity: 0.8 }} animate={{ scale: 1.8, opacity: 0 }} transition={{ duration: 1.2, delay: 0.25 }} />
        </>
      )}
    </motion.g>
  );
}

/** 筆滑出去的那條線：有點抖的墨線 */
export function StrokeInk({ s, draw, duration }: { s: Stroke; draw?: boolean; duration?: number }) {
  const d = useMemo(() => {
    const rnd = hash(s.id);
    const len = Math.hypot(s.to.x - s.from.x, s.to.y - s.from.y);
    const n = Math.max(2, Math.round(len / 18));
    const nx = -(s.to.y - s.from.y) / (len || 1), ny = (s.to.x - s.from.x) / (len || 1);
    let path = `M${s.from.x},${s.from.y}`;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const j = (rnd() - 0.5) * 3.5;
      path += ` L${s.from.x + (s.to.x - s.from.x) * t + nx * j},${s.from.y + (s.to.y - s.from.y) * t + ny * j}`;
    }
    return path;
  }, [s]);
  return (
    <motion.path
      d={d}
      fill="none"
      stroke="#23212e"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={0.8}
      initial={draw ? { pathLength: 0 } : false}
      animate={{ pathLength: 1 }}
      transition={draw ? { duration: (duration ?? 600) / 1000, ease: 'easeOut' } : { duration: 0 }}
    />
  );
}

/** 瞄準箭頭：蓄力中會顯示預期距離與偏差扇形 */
export function AimArrow({ from, angle, r, power }: { from: { x: number; y: number }; angle: number; r: number; power: number | null }) {
  const { dist, spreadDeg } = power === null ? { dist: 150, spreadDeg: 0 } : expected(power);
  const len = Math.max(30, dist);
  const at = (a: number, d: number) => ({ x: from.x + Math.cos(a) * d, y: from.y + Math.sin(a) * d });
  const p1 = at(angle, r + 6), p2 = at(angle, r + len);
  const sp = (spreadDeg * Math.PI) / 180;
  const l = at(angle - sp, r + len), rr = at(angle + sp, r + len);
  const deg = (angle * 180) / Math.PI;
  return (
    <g opacity={0.85}>
      {power !== null && spreadDeg > 0.5 && (
        <path
          d={`M${p1.x},${p1.y} L${l.x},${l.y} A${r + len},${r + len} 0 0 1 ${rr.x},${rr.y} Z`}
          fill="var(--color-ink)"
          opacity={0.08}
        />
      )}
      <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="var(--color-ink)" strokeWidth={3} strokeDasharray="8 8" strokeLinecap="round" />
      <polygon points="0,-8 14,0 0,8" fill="var(--color-ink)" transform={`translate(${p2.x} ${p2.y}) rotate(${deg})`} />
      {power !== null && <circle cx={p2.x} cy={p2.y} r={r} fill="none" stroke="var(--color-ink)" strokeWidth={2} strokeDasharray="4 4" opacity={0.5} />}
    </g>
  );
}
