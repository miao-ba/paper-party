// 烏龜和盲袋的 SVG，全部用程式畫，不用圖檔。
import { useId, type CSSProperties } from 'react';
import { COLORS } from './logic';

function mix(hex: string, to: string, t: number) {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = p(hex), b = p(to);
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;
}

/** 側面 Q 版小烏龜（樹脂公仔那種一整隻同色） */
export function TurtleSvg({ color, className, style }: { color: number; className?: string; style?: CSSProperties }) {
  const base = COLORS[color].hex;
  const dark = mix(base, '#000000', 0.28);
  const light = mix(base, '#ffffff', 0.55);
  return (
    <svg viewBox="0 0 100 84" className={className} style={style} aria-label={`${COLORS[color].name}烏龜`}>
      <ellipse cx="48" cy="79" rx="38" ry="4.5" fill="#23212e" opacity=".14" />
      <path d="M15 58 L4 66 L18 65 Z" fill={dark} />
      <rect x="21" y="57" width="15" height="19" rx="7" fill={dark} />
      <rect x="57" y="57" width="15" height="19" rx="7" fill={dark} />
      <path d="M10 62 C10 30 26 15 45 15 C65 15 80 30 80 62 Z" fill={base} />
      <path d="M45 25 L55 31 L55 43 L45 49 L35 43 L35 31 Z" fill={light} opacity=".55" />
      <path d="M30 34 L32 46 L24 55 L15 55 C15 46 19 39 30 34 Z" fill={light} opacity=".4" />
      <path d="M60 34 L58 46 L66 55 L75 55 C75 46 71 39 60 34 Z" fill={light} opacity=".4" />
      <rect x="7" y="55" width="76" height="9" rx="4.5" fill={dark} />
      <ellipse cx="30" cy="26" rx="9" ry="4" transform="rotate(-30 30 26)" fill="#fff" opacity=".4" />
      <rect x="70" y="40" width="13" height="17" rx="6" fill={base} />
      <circle cx="84" cy="39" r="13.5" fill={base} />
      <circle cx="88.5" cy="36" r="3.1" fill="#23212e" />
      <circle cx="89.6" cy="34.7" r="1.1" fill="#fff" />
      <ellipse cx="90.5" cy="44" rx="3.4" ry="2" fill="#ff8a8a" opacity=".55" />
      <path d="M84 45 q2.6 2.2 5.2 0" stroke="#23212e" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** 鋁箔盲袋：鋸齒封口 + 問號標籤 */
export function BagSvg({ className, style }: { className?: string; style?: CSSProperties }) {
  const id = useId();
  return (
    <svg viewBox="0 0 80 100" className={className} style={style}>
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f9cfe1" />
          <stop offset=".55" stopColor="#e7b8ef" />
          <stop offset="1" stopColor="#b9b3f0" />
        </linearGradient>
      </defs>
      <path d="M9 14 L71 14 L72 90 Q72 97 65 97 L15 97 Q8 97 8 90 Z" fill={`url(#${id}g)`} stroke="#23212e" strokeOpacity=".15" strokeWidth="1.5" />
      <path d="M8 8 L13 3 L18 8 L23 3 L28 8 L33 3 L38 8 L43 3 L48 8 L53 3 L58 8 L63 3 L68 8 L72 4 L72 20 L8 20 Z" fill="#e59ac0" />
      <line x1="10" y1="25" x2="70" y2="25" stroke="#fff" strokeWidth="1.5" strokeDasharray="3 3" opacity=".8" />
      <rect x="15" y="31" width="6" height="56" rx="3" fill="#fff" opacity=".35" />
      <circle cx="42" cy="60" r="19" fill="#fbf7ee" />
      <text x="42" y="69" textAnchor="middle" fontSize="26" fontWeight="900" fill="#23212e" fontFamily="system-ui, sans-serif">?</text>
    </svg>
  );
}
