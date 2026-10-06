// 沒有照片也能拼：用程式畫一張隨機風景（天空漸層、太陽/月亮、雲或星星、幾層山、樹）
import { hash } from '../shared/InkBlob';

const PALETTES = [
  { sky: ['#ffd9a8', '#f7a6a1', '#9a8fd1'], sun: '#fff2c4', hills: ['#7d6bb3', '#5a4c96', '#3b3170', '#251f4d'], tree: '#1b1638', night: false },
  { sky: ['#bfe8ff', '#e6f6ff', '#fff6dc'], sun: '#ffd25e', hills: ['#a8d98a', '#73b86a', '#4f9555', '#2f6b43'], tree: '#1f4a30', night: false },
  { sky: ['#0d1b3d', '#24356b', '#4a4e8f'], sun: '#f4f1d0', hills: ['#2c3e74', '#22305d', '#182447', '#0f1832'], tree: '#0a1124', night: true },
  { sky: ['#ffe3ef', '#ffd0c2', '#ffe9a8'], sun: '#ff8f6b', hills: ['#f5a3b7', '#e07a9b', '#b85a86', '#7c3e6e'], tree: '#4f2448', night: false },
  { sky: ['#cdf3ea', '#9fd8e0', '#6fa9d6'], sun: '#fffbe8', hills: ['#5fb3a1', '#3e8f86', '#2b6b6d', '#1c4851'], tree: '#123238', night: false },
];

export function paintScene(seed = Math.random().toString(36).slice(2), W = 1600, H = 1100) {
  const rnd = hash(`paint:${seed}`);
  const pal = PALETTES[Math.floor(rnd() * PALETTES.length)];
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;

  const sky = g.createLinearGradient(0, 0, 0, H * 0.75);
  pal.sky.forEach((col, i) => sky.addColorStop(i / (pal.sky.length - 1), col));
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);

  // 星星 / 雲
  if (pal.night) {
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(255,255,240,${0.3 + rnd() * 0.7})`;
      const r = rnd() * 2.6 + 0.6;
      g.beginPath(); g.arc(rnd() * W, rnd() * H * 0.6, r, 0, Math.PI * 2); g.fill();
    }
  }
  // 太陽 / 月亮 + 光暈
  const sx = W * (0.2 + rnd() * 0.6), sy = H * (0.18 + rnd() * 0.18), sr = 70 + rnd() * 60;
  const glow = g.createRadialGradient(sx, sy, sr * 0.6, sx, sy, sr * 3.2);
  glow.addColorStop(0, pal.sun + 'aa');
  glow.addColorStop(1, pal.sun + '00');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);
  g.fillStyle = pal.sun;
  g.beginPath(); g.arc(sx, sy, sr, 0, Math.PI * 2); g.fill();
  if (!pal.night) {
    g.fillStyle = 'rgba(255,255,255,.85)';
    for (let k = 0; k < 4; k++) {
      const cx = rnd() * W, cy = H * (0.08 + rnd() * 0.3), s = 0.6 + rnd() * 0.9;
      for (let j = 0; j < 6; j++) { g.beginPath(); g.ellipse(cx + (j - 2.5) * 38 * s, cy + Math.sin(j * 1.7) * 12 * s, 52 * s, 34 * s, 0, 0, Math.PI * 2); g.fill(); }
    }
  }
  // 山：越前面越深、越低
  pal.hills.forEach((col, layer) => {
    const base = H * (0.45 + layer * 0.13);
    const amp = 120 - layer * 18;
    const f1 = 1.5 + rnd() * 2.5, f2 = 3 + rnd() * 5, p1 = rnd() * 6, p2 = rnd() * 6;
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) {
      const t = x / W;
      g.lineTo(x, base - Math.sin(t * f1 * Math.PI + p1) * amp - Math.sin(t * f2 * Math.PI + p2) * amp * 0.35);
    }
    g.lineTo(W, H);
    g.fill();
    // 最前面兩層種樹
    if (layer >= pal.hills.length - 2) {
      g.fillStyle = layer === pal.hills.length - 1 ? pal.tree : col;
      for (let i = 0; i < 9; i++) {
        const x = rnd() * W;
        const t = x / W;
        const y = base - Math.sin(t * f1 * Math.PI + p1) * amp - Math.sin(t * f2 * Math.PI + p2) * amp * 0.35 + 6;
        const h = 70 + rnd() * 90 - layer * 4;
        g.beginPath(); g.moveTo(x, y - h); g.lineTo(x - h * 0.32, y + 4); g.lineTo(x + h * 0.32, y + 4); g.fill();
      }
    }
  });
  // 一點紙紋
  for (let i = 0; i < 2500; i++) {
    g.fillStyle = `rgba(0,0,0,${rnd() * 0.05})`;
    g.fillRect(rnd() * W, rnd() * H, 2, 2);
  }
  return c;
}
