import { useRef, type CSSProperties, type PointerEvent } from 'react';
import { motion } from 'framer-motion';
import { FOLD_MS, PAPER, mirrorOf, sideOfX, type GameState, type Side } from './logic';
import { useLayout, type Region } from '../shared/layout';
export { useLayout };
import { StickmanSvg } from './Stickman';
import { InkBlob } from '../shared/InkBlob';

export { FOLD_MS, SLAM_MS } from './logic';

const REGION: Record<Region, { style: CSSProperties; viewBox: string; origin: string; rot: 'rotateX' | 'rotateY'; deg: number }> = {
  left: { style: { left: 0, top: 0, width: '50%', height: '100%' }, viewBox: '0 0 500 700', origin: '100% 50%', rot: 'rotateY', deg: 180 },
  right: { style: { left: '50%', top: 0, width: '50%', height: '100%' }, viewBox: '500 0 500 700', origin: '0% 50%', rot: 'rotateY', deg: -180 },
  top: { style: { left: 0, top: 0, width: '100%', height: '50%' }, viewBox: '0 0 700 500', origin: '50% 100%', rot: 'rotateX', deg: -180 },
  bottom: { style: { left: 0, top: '50%', width: '100%', height: '50%' }, viewBox: '0 500 700 500', origin: '50% 0%', rot: 'rotateX', deg: 180 },
};

interface Props {
  state: GameState;
  mySide: Side;
  portrait: boolean;
  width: number;
  height: number;
  folded: boolean;
  slam: boolean;
  hiddenPrintTurn: number | null;
  hideSide: Side | null; // 佈陣時不看對方
  chargePower: number | null;
  hitKey: string | null;
  onTap?: (p: { x: number; y: number }, side: Side) => void;
  onTapStickman?: (id: string) => void;
}

export function Paper({ state, mySide, portrait, width, height, folded, slam, hiddenPrintTurn, hideSide, chargePower, hitKey, onTap, onTapStickman }: Props) {
  const L = useLayout(mySide, portrait);
  const activeSide = state.turn;
  const target = state.pendingDot ? mirrorOf(state.pendingDot) : null;
  const handPct = target ? L.toPct(target) : null;
  const power = chargePower ?? 0;

  return (
    <motion.div
      className="relative"
      style={{ width, height, perspective: 1600 }}
      animate={slam ? { x: [0, -5, 5, -3, 3, 0], y: [0, 3, -2, 2, 0] } : { x: 0, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      {(['L', 'R'] as Side[]).map((side) => (
        <Half
          key={side}
          side={side}
          region={REGION[L.regionOf(side)]}
          gTransform={L.gTransform}
          folded={folded && side === activeSide}
          raised={side === activeSide}
          state={state}
          hiddenPrintTurn={hiddenPrintTurn}
          hideSide={hideSide}
          hitKey={hitKey}
          onTap={onTap}
          onTapStickman={onTapStickman}
        />
      ))}

      {/* 摺起來之後：透出來的墨點 + 手 */}
      {folded && handPct && (
        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 20 }}>
          <div
            className="absolute rounded-full bg-ink/25 blur-[3px]"
            style={{ ...handPct, width: width * 0.028, height: width * 0.028, transform: 'translate(-50%,-50%)' }}
          />
          <motion.div
            className="absolute rounded-full bg-ink/30 blur-[4px]"
            style={{ ...handPct, width: width * 0.09, height: width * 0.045, x: '-50%', y: '-50%' }}
            animate={{ scale: slam ? 1.15 : 0.7 - power / 300, opacity: slam ? 0.5 : 0.35 }}
          />
          <motion.div
            className="absolute"
            style={{ ...handPct, x: '-50%', y: '-50%', fontSize: width * 0.11, lineHeight: 1 }}
            animate={
              slam
                ? { scale: [1.4, 0.85, 1], rotate: [ -10, 4, 0 ], marginTop: [-width * 0.1, 0, 0] }
                : { scale: 1 + power / 130, rotate: -10, marginTop: -width * 0.02 - power * 0.5 }
            }
            transition={slam ? { duration: 0.35, times: [0, 0.4, 1] } : { type: 'spring', stiffness: 260, damping: 20 }}
          >
            <span style={{ filter: 'drop-shadow(0 6px 4px rgba(0,0,0,.25))', display: 'block' }}>✊</span>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}

function Half({
  side, region, gTransform, folded, raised, state, hiddenPrintTurn, hideSide, hitKey, onTap, onTapStickman,
}: {
  side: Side;
  region: (typeof REGION)[Region];
  gTransform: string;
  folded: boolean;
  raised: boolean;
  state: GameState;
  hiddenPrintTurn: number | null;
  hideSide: Side | null;
  hitKey: string | null;
  onTap?: Props['onTap'];
  onTapStickman?: Props['onTapStickman'];
}) {
  const gRef = useRef<SVGGElement>(null);
  const [minX, maxX] = side === 'L' ? [0, PAPER.fold] : [PAPER.fold, PAPER.w];

  const handleTap = (e: PointerEvent<SVGSVGElement>) => {
    if (!onTap || !gRef.current) return;
    const ctm = gRef.current.getScreenCTM();
    if (!ctm) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    onTap({ x: pt.x, y: pt.y }, sideOfX(pt.x));
  };

  const face = 'absolute inset-0 overflow-hidden';
  return (
    <motion.div
      className="absolute"
      style={{ ...region.style, transformOrigin: region.origin, transformStyle: 'preserve-3d', zIndex: raised ? 5 : 1 }}
      animate={{ [region.rot]: folded ? region.deg : 0 }}
      transition={{ duration: FOLD_MS / 1000, ease: [0.55, 0, 0.25, 1] }}
    >
      {/* 正面 */}
      <div className={`${face} bg-paper`} style={{ backfaceVisibility: 'hidden' }}>
        <svg viewBox={region.viewBox} className="w-full h-full block" onPointerDown={handleTap}>
          <g ref={gRef} transform={gTransform}>
            <rect x={minX} y={0} width={PAPER.fold} height={PAPER.h} fill={side === 'L' ? 'var(--color-side-l)' : 'var(--color-side-r)'} opacity={0.05} />
            <line x1={PAPER.fold} y1={0} x2={PAPER.fold} y2={PAPER.h} stroke="var(--color-ink)" strokeOpacity={0.25} strokeWidth={2} strokeDasharray="10 10" />
            {state.inks
              .filter((i) => i.side === side && !(i.kind === 'print' && i.turn === hiddenPrintTurn))
              .map((i) => <InkBlob key={i.id} ink={i} pop={i.kind === 'print'} />)}
            {state.stickmen
              .filter((s) => s.side === side && s.side !== hideSide)
              .map((s) => (
                <StickmanSvg
                  key={s.id}
                  s={s}
                  hitKey={hitKey && state.lastResult?.hit?.stickmanId === s.id ? hitKey : null}
                  onTap={onTapStickman}
                />
              ))}
          </g>
        </svg>
      </div>
      {/* 背面：素紙 */}
      <div
        className={`${face} bg-paper-2`}
        style={{
          backfaceVisibility: 'hidden',
          transform: `${region.rot}(180deg)`,
          backgroundImage: 'linear-gradient(135deg, rgba(0,0,0,.04), transparent 40%, rgba(0,0,0,.06))',
        }}
      />
    </motion.div>
  );
}
