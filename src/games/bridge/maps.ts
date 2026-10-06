// 地圖：一條河（折線 + 寬度）、橋（線段 + 寬度）、島（圓）。
// 河把紙分成左右兩塊地界；橋和島是河裡的陸地。
import { PAPER } from '../shared/layout';

export type Pt = { x: number; y: number };
export interface Bridge { a: Pt; b: Pt; w: number }
export interface Island { x: number; y: number; r: number }
export interface GameMap {
  id: string;
  name: string;
  desc: string;
  river: { pts: Pt[]; w: number };
  bridges: Bridge[];
  islands: Island[];
}

const V = (x: number) => [{ x, y: -20 }, { x, y: PAPER.h + 20 }]; // 直的河

/** 在河的第 seg 段、t（0–1）處架一座垂直於河的橋，兩端各伸進岸上 30 */
function across(river: { pts: Pt[]; w: number }, seg: number, t: number, w: number, extra = 30): Bridge {
  const a = river.pts[seg], b = river.pts[seg + 1];
  const c = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const n = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
  const half = river.w / 2 + extra;
  return { a: { x: c.x - n.x * half, y: c.y - n.y * half }, b: { x: c.x + n.x * half, y: c.y + n.y * half }, w };
}

export const MAPS: GameMap[] = [
  {
    id: 'single',
    name: '獨木橋',
    desc: '就一條窄橋，大圈小心',
    river: { pts: V(500), w: 220 },
    bridges: [across({ pts: V(500), w: 220 }, 0, 0.5, 70)],
    islands: [],
  },
  {
    id: 'double',
    name: '雙橋',
    desc: '寬橋安全但繞遠，窄橋近但險',
    river: { pts: V(500), w: 220 },
    bridges: [across({ pts: V(500), w: 220 }, 0, 0.26, 120), across({ pts: V(500), w: 220 }, 0, 0.78, 56)],
    islands: [],
  },
  {
    id: 'islands',
    name: '跳島',
    desc: '河中央有島可以停一下再走',
    river: { pts: V(500), w: 320 },
    islands: [
      { x: 500, y: 200, r: 58 },
      { x: 500, y: 500, r: 58 },
    ],
    bridges: [
      { a: { x: 330, y: 200 }, b: { x: 450, y: 200 }, w: 64 },
      { a: { x: 550, y: 200 }, b: { x: 670, y: 200 }, w: 64 },
      { a: { x: 330, y: 500 }, b: { x: 450, y: 500 }, w: 64 },
      { a: { x: 550, y: 500 }, b: { x: 670, y: 500 }, w: 64 },
      { a: { x: 500, y: 250 }, b: { x: 500, y: 450 }, w: 50 },
    ],
  },
  (() => {
    // 兩個大彎，河窄一點；橋放在直段中間，彼此離遠
    const river = {
      pts: [
        { x: 520, y: -20 },
        { x: 370, y: 170 },
        { x: 620, y: 370 },
        { x: 400, y: 560 },
        { x: 520, y: PAPER.h + 20 },
      ],
      w: 130,
    };
    return {
      id: 'snake',
      name: '蜿蜒',
      desc: '河是彎的、橋是斜的，地界犬牙交錯',
      river,
      bridges: [across(river, 1, 0.25, 60), across(river, 2, 0.75, 96)],
      islands: [],
    };
  })(),
];

export const getMap = (id: string) => MAPS.find((m) => m.id === id) ?? MAPS[0];

// ---- 幾何 ----
export function distToSeg(p: Pt, a: Pt, b: Pt) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
function distToPolyline(p: Pt, pts: Pt[]) {
  let d = Infinity;
  for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, distToSeg(p, pts[i], pts[i + 1]));
  return d;
}
/** 河在某個 y 的中心 x（河是由上到下單調的） */
export function riverXAt(map: GameMap, y: number) {
  const pts = map.river.pts;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (y >= a.y && y <= b.y) {
      const t = (y - a.y) / (b.y - a.y || 1);
      return a.x + (b.x - a.x) * t;
    }
  }
  return pts[pts.length - 1].x;
}
export function onLand(map: GameMap, p: Pt) {
  return map.islands.some((i) => Math.hypot(p.x - i.x, p.y - i.y) <= i.r) || map.bridges.some((b) => distToSeg(p, b.a, b.b) <= b.w / 2);
}
export function isWater(map: GameMap, p: Pt) {
  return distToPolyline(p, map.river.pts) < map.river.w / 2 && !onLand(map, p);
}
/** 這個點屬於哪邊的地界（河、橋、島都不算） */
export function territoryOf(map: GameMap, p: Pt): 'L' | 'R' | null {
  if (distToPolyline(p, map.river.pts) < map.river.w / 2) return null;
  return p.x < riverXAt(map, p.y) ? 'L' : 'R';
}
/** 圓會不會掉水：取中心 + 圓周上幾點，任何一點碰水就掉 */
export function circleFalls(map: GameMap, c: Pt, r: number, rim = 0.8) {
  if (isWater(map, c)) return true;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    if (isWater(map, { x: c.x + Math.cos(a) * r * rim, y: c.y + Math.sin(a) * r * rim })) return true;
  }
  return false;
}
/** 地界多邊形（畫底色用） */
export function territoryPolygon(map: GameMap, side: 'L' | 'R') {
  const pts = map.river.pts;
  const edgeX = side === 'L' ? -20 : PAPER.w + 20;
  const path = [{ x: edgeX, y: -20 }, ...pts, { x: edgeX, y: PAPER.h + 20 }];
  return path.map((p) => `${p.x},${p.y}`).join(' ');
}
