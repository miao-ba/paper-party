import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { motion } from 'framer-motion';

const PERIOD = 1500; // 力道 0→100→0 一輪的毫秒數

/** 力道條上的色塊：from/to 是 0–100 */
export interface Zone { from: number; to: number; className: string }

/** 按住蓄力、放開。power 是來回擺動的，要抓時機；文案和色塊由各遊戲自己給 */
export function PowerButton({
  disabled,
  onCharge,
  onRelease,
  label,
  activeLabel = '放開！',
  zones = [],
}: {
  disabled?: boolean;
  onCharge: (p: number) => void;
  onRelease: (p: number) => void;
  label: string;
  activeLabel?: string;
  zones?: Zone[];
}) {
  const [power, setPower] = useState<number | null>(null);
  const raf = useRef(0);
  const start = useRef(0);
  const cur = useRef(0);

  // 依時間算力道，放開時直接看時鐘，不依賴最後一個動畫幀
  const powerNow = () => {
    const ph = ((performance.now() - start.current) % PERIOD) / PERIOD;
    return Math.round((ph < 0.5 ? ph * 2 : (1 - ph) * 2) * 100);
  };
  const loop = () => {
    cur.current = powerNow();
    setPower(cur.current);
    onCharge(cur.current);
    raf.current = requestAnimationFrame(loop);
  };
  const down = (e: PointerEvent<HTMLButtonElement>) => {
    if (disabled || start.current) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 合成事件沒有 pointerId */ }
    start.current = performance.now();
    loop();
  };
  const up = () => {
    if (!start.current) return;
    cancelAnimationFrame(raf.current);
    const p = powerNow();
    start.current = 0;
    setPower(null);
    onRelease(p);
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return (
    <div className="w-full max-w-xs flex flex-col items-center gap-2">
      <Meter power={power} zones={zones} />
      <motion.button
        disabled={disabled}
        onPointerDown={down}
        onPointerUp={up}
        onPointerCancel={up}
        onContextMenu={(e) => e.preventDefault()}
        whileTap={{ scale: 0.94 }}
        className="w-full py-4 rounded-2xl bg-ink text-paper font-bold text-lg shadow-[0_5px_0_#0f0e14] active:shadow-none active:translate-y-1 disabled:opacity-40 touch-none select-none"
      >
        {power === null ? label : activeLabel}
      </motion.button>
    </div>
  );
}

export function Meter({ power, zones = [] }: { power: number | null; zones?: Zone[] }) {
  const p = power ?? 0;
  return (
    <div className="w-full max-w-xs h-5 rounded-full bg-paper border-2 border-ink/20 relative overflow-hidden">
      {zones.map((z, i) => (
        <div key={i} className={`absolute inset-y-0 ${z.className}`} style={{ left: `${z.from}%`, width: `${z.to - z.from}%` }} />
      ))}
      <div className="absolute inset-y-0 left-0 bg-ink transition-none" style={{ width: `${p}%`, opacity: power === null ? 0.25 : 0.85 }} />
      <div className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-ink/70">
        {power === null ? '' : p}
      </div>
    </div>
  );
}
