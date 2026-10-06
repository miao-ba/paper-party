// URL → QR code as an SVG (drawn here so it matches the paper theme).
import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

export function QrCode({ text, size = 160 }: { text: string; size?: number }) {
  const d = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    let path = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) path += `M${c},${r}h1v1h-1z`;
    return { n, path };
  }, [text]);
  return (
    <svg viewBox={`-2 -2 ${d.n + 4} ${d.n + 4}`} width={size} height={size} className="rounded-2xl bg-white block shrink-0" shapeRendering="crispEdges" aria-label={text}>
      <path d={d.path} fill="#23212e" />
    </svg>
  );
}
