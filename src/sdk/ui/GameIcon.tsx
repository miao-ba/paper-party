import type { GameMeta } from '../types';

/** The game's icon on its coloured tile. */
export function GameIcon({ meta, size = 44, className = '' }: { meta: Pick<GameMeta, 'icon' | 'hue'>; size?: number; className?: string }) {
  const Icon = meta.icon;
  return (
    <span
      className={`rounded-[30%] text-white flex items-center justify-center shrink-0 shadow-[inset_0_-3px_0_rgba(0,0,0,.15)] ${className}`}
      style={{ width: size, height: size, background: `hsl(${meta.hue} 60% 52%)` }}
    >
      <Icon size={Math.round(size * 0.5)} />
    </span>
  );
}
