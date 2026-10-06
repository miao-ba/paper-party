import { motion } from 'framer-motion';
import { HEAD, SEGMENTS, SIZES, type Stickman } from './logic';

const COLOR = { L: 'var(--color-side-l)', R: 'var(--color-side-r)' };

export function StickmanSvg({
  s,
  hitKey,
  onTap,
}: {
  s: Stickman;
  hitKey?: string | null; // 變動時閃一下（被打中）
  onTap?: (id: string) => void;
}) {
  const sc = SIZES[s.size].scale;
  const dead = s.hp <= 0;
  const color = COLOR[s.side];
  return (
    <g
      transform={`translate(${s.x} ${s.y}) rotate(${s.rot}) scale(${sc})`}
      onPointerDown={onTap ? (e) => { e.stopPropagation(); onTap(s.id); } : undefined}
      style={{ cursor: onTap ? 'pointer' : 'default' }}
    >
      <motion.g animate={{ rotate: dead ? 78 : 0, opacity: dead ? 0.4 : 1 }} transition={{ type: 'spring', stiffness: 120, damping: 12 }} style={{ originX: '0px', originY: '50px' } as any}>
        <g stroke="var(--color-ink)" strokeWidth={5} strokeLinecap="round" fill="none">
          {SEGMENTS.map((seg, i) => (
            <line key={i} x1={seg.a[0]} y1={seg.a[1]} x2={seg.b[0]} y2={seg.b[1]} />
          ))}
        </g>
        {/* 圍巾 = 陣營色 */}
        <path d="M-9,-36 q9,6 18,0" stroke={color} strokeWidth={5} strokeLinecap="round" fill="none" />
        <circle cx={HEAD.cx} cy={HEAD.cy} r={HEAD.r} fill="var(--color-paper)" stroke="var(--color-ink)" strokeWidth={4} />
        {dead ? (
          <g stroke="var(--color-ink)" strokeWidth={2.2} strokeLinecap="round">
            <line x1={-7} y1={-54} x2={-3} y2={-50} />
            <line x1={-3} y1={-54} x2={-7} y2={-50} />
            <line x1={3} y1={-54} x2={7} y2={-50} />
            <line x1={7} y1={-54} x2={3} y2={-50} />
          </g>
        ) : (
          <g fill="var(--color-ink)">
            <circle cx={-5} cy={-52} r={1.8} />
            <circle cx={5} cy={-52} r={1.8} />
            <path d="M-4,-46 q4,3 8,0" stroke="var(--color-ink)" strokeWidth={1.6} fill="none" strokeLinecap="round" />
          </g>
        )}
      </motion.g>
      {!dead && (
        <text y={-72} textAnchor="middle" fontSize={11} fill={color} fontWeight={700} style={{ letterSpacing: 1 }}>
          {'♥'.repeat(s.hp)}
        </text>
      )}
      {hitKey && (
        <motion.circle
          key={hitKey}
          r={60}
          fill="#e8604c"
          initial={{ opacity: 0.55, scale: 0.4 }}
          animate={{ opacity: 0, scale: 1.4 }}
          transition={{ duration: 0.7 }}
          style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
        />
      )}
    </g>
  );
}
