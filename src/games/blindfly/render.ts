// canvas 畫圖：第一視角（駕駛）與側視角（塔台）。純函式，每幀重畫。
import { BIRD_R, FOG_DIST, PIPE_GAP, PIPE_W, WORLD_H, pipesIn, type Bird, type Fog } from './logic';

const INK = '#23212e';
const SIDE = { L: '#e8604c', R: '#2f9e95' } as const;
type SideKey = keyof typeof SIDE;

/** 走廊半寬（第一視角用，讓管子有透視感） */
const HALF_W = 420;
const FOCAL = 520;

export interface FpvOpts {
  fog: Fog;
  color: SideKey;
  /** 塔台的警示：0–1 淡出 */
  alertUp: number;
  alertDown: number;
  t: number; // 秒，做動畫
}

/** 第一視角：從鳥的位置往前看 */
export function drawFpv(ctx: CanvasRenderingContext2D, W: number, H: number, bird: Bird, seed: string, o: FpvOpts) {
  const fogD = FOG_DIST[o.fog];
  const cx = W / 2;
  const cy = H / 2;
  // 世界 y → 螢幕比例（整個世界高 700 對到畫面高）
  const sy = H / WORLD_H;
  const proj = (d: number) => FOCAL / (FOCAL + Math.max(0, d));
  const screenY = (wy: number, d: number) => cy + (wy - bird.y) * sy * proj(d);
  const screenX = (wz: number, d: number) => cx + wz * (W / (HALF_W * 2)) * proj(d);

  // 天空/地板漸層
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#dfe9f3');
  g.addColorStop(0.5, '#f6f1e6');
  g.addColorStop(1, '#d9c9a8');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // 走廊的天花板/地板（世界 y=0 / 700）與側牆線，往消失點收
  const far = 4000;
  ctx.save();
  ctx.strokeStyle = 'rgba(35,33,46,.18)';
  ctx.lineWidth = 1.5;
  for (const wz of [-HALF_W, HALF_W]) {
    for (const wy of [0, WORLD_H]) {
      ctx.beginPath();
      ctx.moveTo(screenX(wz, 0), screenY(wy, 0));
      ctx.lineTo(screenX(wz, far), screenY(wy, far));
      ctx.stroke();
    }
  }
  // 地板/天花板的橫條（速度感）
  const stripe = 250;
  const off = bird.x % stripe;
  ctx.strokeStyle = 'rgba(35,33,46,.10)';
  for (let d = stripe - off; d < 3000; d += stripe) {
    for (const wy of [0, WORLD_H]) {
      ctx.beginPath();
      ctx.moveTo(screenX(-HALF_W, d), screenY(wy, d));
      ctx.lineTo(screenX(HALF_W, d), screenY(wy, d));
      ctx.stroke();
    }
  }
  ctx.restore();

  // 管子：遠的先畫
  if (fogD > 0) {
    const pipes = pipesIn(seed, bird.x - PIPE_W, bird.x + fogD).filter((p) => p.x + PIPE_W > bird.x - 5);
    for (const p of [...pipes].reverse()) {
      const dNear = Math.max(0, p.x - bird.x);
      const dFar = Math.max(0, p.x + PIPE_W - bird.x);
      const a = Math.max(0, Math.min(1, 1 - (dNear - fogD * 0.55) / (fogD * 0.45)));
      if (a <= 0) continue;
      const top = p.gapY - PIPE_GAP / 2;
      const bot = p.gapY + PIPE_GAP / 2;
      ctx.save();
      ctx.globalAlpha = a;
      // 遠面（深一點）
      drawPipeFace(ctx, screenX(-HALF_W, dFar), screenX(HALF_W, dFar), screenY(0, dFar), screenY(top, dFar), screenY(bot, dFar), screenY(WORLD_H, dFar), '#6f9b62', '#557a4b');
      // 側面（連接遠近面），只畫缺口上下的內側，做出厚度
      ctx.fillStyle = '#7fae70';
      quad(ctx, screenX(-HALF_W, dNear), screenY(top, dNear), screenX(HALF_W, dNear), screenY(top, dNear), screenX(HALF_W, dFar), screenY(top, dFar), screenX(-HALF_W, dFar), screenY(top, dFar));
      quad(ctx, screenX(-HALF_W, dNear), screenY(bot, dNear), screenX(HALF_W, dNear), screenY(bot, dNear), screenX(HALF_W, dFar), screenY(bot, dFar), screenX(-HALF_W, dFar), screenY(bot, dFar));
      // 近面
      drawPipeFace(ctx, screenX(-HALF_W, dNear), screenX(HALF_W, dNear), screenY(0, dNear), screenY(top, dNear), screenY(bot, dNear), screenY(WORLD_H, dNear), '#8cc07c', '#5f8a54');
      ctx.restore();
    }
    // 霧：越接近 fogD 越白（畫在中央一團）
    const fg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.6);
    fg.addColorStop(0, 'rgba(246,241,230,.55)');
    fg.addColorStop(0.35, 'rgba(246,241,230,0)');
    ctx.fillStyle = fg;
    ctx.fillRect(0, 0, W, H);
  } else {
    // 盲飛：整片霧
    ctx.fillStyle = 'rgba(246,241,230,.75)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(35,33,46,.25)';
    ctx.font = `${Math.round(H * 0.035)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.fillText('什麼都看不到，聽塔台的', cx, cy - H * 0.2);
  }

  // 高度計（左側）
  const gx = 22;
  const gy0 = H * 0.12;
  const gy1 = H * 0.88;
  ctx.save();
  ctx.fillStyle = 'rgba(35,33,46,.12)';
  ctx.fillRect(gx - 4, gy0, 8, gy1 - gy0);
  for (let i = 0; i <= 10; i++) {
    const y = gy0 + ((gy1 - gy0) * i) / 10;
    ctx.fillStyle = 'rgba(35,33,46,.35)';
    ctx.fillRect(gx - (i % 5 === 0 ? 9 : 6), y - 0.5, i % 5 === 0 ? 18 : 12, 1);
  }
  const by = gy0 + ((gy1 - gy0) * bird.y) / WORLD_H;
  ctx.fillStyle = SIDE[o.color];
  ctx.beginPath();
  ctx.moveTo(gx + 6, by);
  ctx.lineTo(gx + 16, by - 7);
  ctx.lineTo(gx + 16, by + 7);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.font = 'bold 11px system-ui';
  ctx.textAlign = 'left';
  ctx.fillText(`${Math.round((1 - bird.y / WORLD_H) * 100)}%`, gx + 20, by + 4);
  ctx.restore();

  // 駕駛艙框：鳥嘴 / 機頭
  ctx.save();
  ctx.fillStyle = SIDE[o.color];
  ctx.globalAlpha = 0.9;
  const tilt = Math.max(-1, Math.min(1, bird.vy / 500));
  ctx.beginPath();
  ctx.moveTo(cx - W * 0.09, H);
  ctx.lineTo(cx, H * (0.8 + tilt * 0.03));
  ctx.lineTo(cx + W * 0.09, H);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 警示閃光
  if (o.alertUp > 0) edgeGlow(ctx, W, H, 'top', o.alertUp);
  if (o.alertDown > 0) edgeGlow(ctx, W, H, 'bottom', o.alertDown);

  if (!bird.alive) {
    ctx.fillStyle = 'rgba(232,96,76,.35)';
    ctx.fillRect(0, 0, W, H);
  }
}

function quad(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.lineTo(x4, y4);
  ctx.closePath();
  ctx.fill();
}

function drawPipeFace(ctx: CanvasRenderingContext2D, xl: number, xr: number, yTop: number, yGapTop: number, yGapBot: number, yBot: number, fill: string, edge: string) {
  ctx.fillStyle = fill;
  ctx.fillRect(xl, yTop, xr - xl, yGapTop - yTop);
  ctx.fillRect(xl, yGapBot, xr - xl, yBot - yGapBot);
  ctx.fillStyle = edge;
  const lip = Math.max(2, (xr - xl) * 0.012);
  ctx.fillRect(xl, yGapTop - lip, xr - xl, lip);
  ctx.fillRect(xl, yGapBot, xr - xl, lip);
}

function edgeGlow(ctx: CanvasRenderingContext2D, W: number, H: number, where: 'top' | 'bottom', a: number) {
  const g = where === 'top' ? ctx.createLinearGradient(0, 0, 0, H * 0.35) : ctx.createLinearGradient(0, H, 0, H * 0.65);
  g.addColorStop(0, `rgba(232,96,76,${0.85 * a})`);
  g.addColorStop(1, 'rgba(232,96,76,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, where === 'top' ? 0 : H * 0.65, W, H * 0.35);
  ctx.fillStyle = `rgba(255,255,255,${a})`;
  ctx.font = `bold ${Math.round(H * 0.08)}px system-ui`;
  ctx.textAlign = 'center';
  ctx.fillText(where === 'top' ? '▲ 上' : '▼ 下', W / 2, where === 'top' ? H * 0.14 : H * 0.94);
}

/** 側視角：經典 flappy 畫面；viewW 是畫面寬對應的世界寬度 */
export function drawSide(ctx: CanvasRenderingContext2D, W: number, H: number, bird: Bird, seed: string, o: { fog: Fog; color: SideKey; t: number; showFog?: boolean; ghost?: { bird: Bird; color: SideKey } }) {
  // 直式手機時至少要看到前方 1500 單位（三四根管子），不然塔台也是盲的
  const s = Math.min(H / WORLD_H, W / 1200);
  const viewW = W / s;
  const camX = bird.x - viewW * 0.25;
  const oy = (H - WORLD_H * s) / 2;
  const X = (wx: number) => (wx - camX) * s;
  const Y = (wy: number) => oy + wy * s;

  ctx.fillStyle = '#d9c9a8';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#e9f0f5';
  ctx.fillRect(0, Y(0), W, WORLD_H * s);
  // 遠景雲（視差）
  ctx.fillStyle = 'rgba(255,255,255,.7)';
  for (let i = 0; i < 6; i++) {
    const cxw = ((i * 700 - camX * 0.3) % (viewW + 300) + viewW + 300) % (viewW + 300) - 150;
    const cy = Y(WORLD_H * (0.12 + ((i * 37) % 50) / 100));
    ctx.beginPath();
    ctx.ellipse(cxw, cy, 60 * s + 20, 18 * s + 8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // 駕駛的可視範圍（給塔台看他到底看得到多少）
  const fogD = FOG_DIST[o.fog];
  if (fogD > 0 && o.showFog !== false) {
    const fg = ctx.createLinearGradient(X(bird.x), 0, X(bird.x + fogD), 0);
    fg.addColorStop(0, 'rgba(255,240,150,.28)');
    fg.addColorStop(0.6, 'rgba(255,240,150,.18)');
    fg.addColorStop(1, 'rgba(255,240,150,0)');
    ctx.fillStyle = fg;
    ctx.fillRect(X(bird.x), Y(0), fogD * s, WORLD_H * s);
  }
  // 管子
  for (const p of pipesIn(seed, camX, camX + viewW)) {
    const top = p.gapY - PIPE_GAP / 2;
    const bot = p.gapY + PIPE_GAP / 2;
    ctx.fillStyle = '#8cc07c';
    ctx.fillRect(X(p.x), Y(0), PIPE_W * s, top * s);
    ctx.fillRect(X(p.x), Y(bot), PIPE_W * s, (WORLD_H - bot) * s);
    ctx.fillStyle = '#5f8a54';
    ctx.fillRect(X(p.x) - 4, Y(top) - 14 * s, PIPE_W * s + 8, 14 * s);
    ctx.fillRect(X(p.x) - 4, Y(bot), PIPE_W * s + 8, 14 * s);
  }
  // 地面線
  ctx.fillStyle = 'rgba(35,33,46,.25)';
  ctx.fillRect(0, Y(WORLD_H) - 2, W, 2);
  ctx.fillRect(0, Y(0), W, 2);

  // 對手的鳥（競技模式、同一張地圖）：半透明的影子
  if (o.ghost) {
    ctx.save();
    ctx.globalAlpha = 0.4;
    drawBird(ctx, X(o.ghost.bird.x), Y(o.ghost.bird.y), BIRD_R * s, o.ghost.bird, o.ghost.color, o.t);
    ctx.restore();
  }
  drawBird(ctx, X(bird.x), Y(bird.y), BIRD_R * s, bird, o.color, o.t);
}

function drawBird(ctx: CanvasRenderingContext2D, bx: number, by: number, r: number, bird: Bird, color: SideKey, t: number) {
  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(bird.alive ? Math.max(-0.5, Math.min(0.9, bird.vy / 600)) : Math.PI / 2);
  ctx.fillStyle = SIDE[color];
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  // 翅膀（拍動）
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.2, r * 0.1 + Math.sin(t * 25) * r * 0.25, r * 0.6, r * 0.35, -0.3, 0, Math.PI * 2);
  ctx.fill();
  // 眼睛 + 嘴
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(r * 0.35, -r * 0.3, r * 0.32, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(r * 0.45, -r * 0.3, r * 0.14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f5b544';
  ctx.beginPath();
  ctx.moveTo(r * 0.7, 0);
  ctx.lineTo(r * 1.4, r * 0.15);
  ctx.lineTo(r * 0.7, r * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  if (!bird.alive) {
    ctx.font = `${Math.round(r * 1.6)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.fillText('💥', bx, by - r * 1.2);
  }
}
