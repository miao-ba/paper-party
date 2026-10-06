import { motion } from 'framer-motion';

const BG = ['#fde2dc', '#d9f0ec', '#fdf0c9', '#e6e0f8', '#dcebfb', '#fbe0ec', '#e2f3d9', '#f6e4d3'];
function tint(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return BG[h % BG.length];
}

/**
 * Emoji avatar on a pastel disc. ring = seat colour; bot = small robot badge; online = presence dot.
 */
export function Avatar({ emoji, name, size = 40, online, ring, bot, dim, className = '' }: {
  emoji?: string | null;
  name: string;
  size?: number;
  online?: boolean;
  ring?: string;
  bot?: boolean;
  dim?: boolean;
  className?: string;
}) {
  const badge = Math.max(12, size * 0.38);
  return (
    <span className={`relative inline-flex shrink-0 ${dim ? 'grayscale opacity-60' : ''} ${className}`} style={{ width: size, height: size }}>
      <span
        className="w-full h-full rounded-full flex items-center justify-center select-none"
        style={{ background: tint(name), fontSize: size * 0.56, lineHeight: 1, boxShadow: ring ? `0 0 0 ${size >= 36 ? 3 : 2}px ${ring}` : 'inset 0 -2px 0 rgba(35,33,46,.08)' }}
      >
        {emoji || name.slice(0, 1).toUpperCase()}
      </span>
      {bot && (
        <span className="absolute -bottom-1 -right-1 rounded-full bg-paper border border-ink/15 flex items-center justify-center" style={{ width: badge, height: badge, fontSize: badge * 0.62 }}>
          🤖
        </span>
      )}
      {online !== undefined && !bot && (
        <span
          className={`absolute bottom-0 right-0 rounded-full border-2 border-paper ${online ? 'bg-accent-2' : 'bg-ink/25'}`}
          style={{ width: Math.max(10, size * 0.28), height: Math.max(10, size * 0.28) }}
        >
          {online && <motion.span className="absolute inset-0 rounded-full bg-accent-2" animate={{ scale: [1, 2], opacity: [0.6, 0] }} transition={{ repeat: Infinity, duration: 1.8 }} />}
        </span>
      )}
    </span>
  );
}
