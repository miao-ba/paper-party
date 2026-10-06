// 盲飛：純物理 + 地圖生成，不碰 React / 網路。
// 世界座標：y 0–700（側視角高度），x 無限往右；鳥以固定速度 VX 前進。
import { hash } from '../shared/InkBlob';
import type { Side } from '../shared/layout';

export const WORLD_H = 700;
export const VX = 230; // 單位/秒
export const GRAVITY = 1500;
export const FLAP_VY = -430;
export const MAX_VY = 700;
/** 聲控：lift=1（最大聲）時的向上加速度；lift ≈ 0.43 剛好懸停 */
export const LIFT_G = GRAVITY * 2.3;
export const BIRD_R = 18;
export const PIPE_W = 90;
export const PIPE_GAP = 210;
export const PIPE_SPACING = 400;
export const FIRST_PIPE_X = 900; // 起飛後喘口氣

export type Fog = 'far' | 'mid' | 'near' | 'blind';
/** 駕駛前方看得到的距離（世界單位）；blind = 0 只剩高度計 */
export const FOG_DIST: Record<Fog, number> = { far: 1100, mid: 600, near: 300, blind: 0 };
export const FOG_LABEL: Record<Fog, string> = { far: '遠', mid: '中', near: '近', blind: '盲飛' };

export interface Config {
  fog: Fog;
  /** 塔台的上下警示鈕 */
  alert: boolean;
  /** 每過幾根管子換手；0 = 不換 */
  swap: 0 | 3 | 5 | 8;
  /** solo：一人開一人看；dual：各飛一台、看對方側視角；race：各飛一台、只看自己 */
  mode: 'solo' | 'dual' | 'race';
  /** 競技模式看自己的哪種視角 */
  raceView: 'fpv' | 'side';
  /** 單駕駛模式第一回合誰開 */
  pilot: Side;
  /** 聲控：麥克風音量決定升力，越大聲飛越高；點畫面無效 */
  voice: boolean;
}
export const DEFAULT_CONFIG: Config = { fog: 'mid', alert: true, swap: 0, mode: 'solo', raceView: 'fpv', pilot: 'L', voice: false };
/** 兩台鳥同時飛（dual / race） */
export const isDual = (c: Config) => c.mode !== 'solo';
export const SWAP_OPTIONS: Config['swap'][] = [0, 3, 5, 8];

export interface Pipe {
  x: number; // 管子左緣
  gapY: number; // 缺口中心
}
export interface Bird {
  x: number;
  y: number;
  vy: number;
  alive: boolean;
  /** 已通過的管子數 */
  score: number;
  /** 聲控升力 0–1（麥克風音量）；undefined = 一般拍翅膀模式 */
  lift?: number;
}

export const newBird = (): Bird => ({ x: 0, y: WORLD_H / 2, vy: 0, alive: true, score: 0 });

/** 第 i 根管子（i 從 0），由種子決定，兩邊各自算一樣 */
export function pipeAt(seed: string, i: number): Pipe {
  const rnd = hash(`${seed}:${i}`);
  const margin = PIPE_GAP / 2 + 60;
  return { x: FIRST_PIPE_X + i * PIPE_SPACING, gapY: margin + rnd() * (WORLD_H - margin * 2) };
}
/** x 範圍內的管子 */
export function pipesIn(seed: string, x0: number, x1: number): Pipe[] {
  const i0 = Math.max(0, Math.floor((x0 - PIPE_W - FIRST_PIPE_X) / PIPE_SPACING));
  const i1 = Math.floor((x1 - FIRST_PIPE_X) / PIPE_SPACING);
  const out: Pipe[] = [];
  for (let i = i0; i <= i1; i++) out.push(pipeAt(seed, i));
  return out;
}

export function flap(b: Bird): Bird {
  return b.alive ? { ...b, vy: FLAP_VY } : b;
}

/** 前進 dt 秒；死了就回傳 alive=false 的鳥（位置停在撞到的地方） */
export function step(b: Bird, dt: number, seed: string): Bird {
  if (!b.alive) return b;
  const accel = b.lift === undefined ? GRAVITY : GRAVITY - b.lift * LIFT_G;
  const vy = Math.max(-MAX_VY, Math.min(MAX_VY, b.vy + accel * dt));
  const x = b.x + VX * dt;
  const y = b.y + vy * dt;
  let score = b.score;
  // 通過管子：鳥的 x 越過管子右緣
  for (const p of pipesIn(seed, b.x, x)) if (b.x < p.x + PIPE_W && x >= p.x + PIPE_W) score++;
  const next: Bird = { ...b, x, y, vy, alive: true, score };
  if (y - BIRD_R < 0 || y + BIRD_R > WORLD_H) return { ...next, y: Math.max(BIRD_R, Math.min(WORLD_H - BIRD_R, y)), alive: false };
  for (const p of pipesIn(seed, x - PIPE_W, x + BIRD_R)) if (hitsPipe(x, y, p)) return { ...next, alive: false };
  return next;
}

export function hitsPipe(x: number, y: number, p: Pipe) {
  // 圓 vs 兩個矩形（上管、下管），用最近點距離
  const cx = Math.max(p.x, Math.min(p.x + PIPE_W, x));
  const dx = x - cx;
  const top = p.gapY - PIPE_GAP / 2;
  const bot = p.gapY + PIPE_GAP / 2;
  const dyTop = y - Math.min(top, y); // 在上管範圍內 dy=0
  const dyBot = Math.max(bot, y) - y;
  const r2 = BIRD_R * BIRD_R;
  return dx * dx + dyTop * dyTop < r2 || dx * dx + dyBot * dyBot < r2;
}

/** 換手：每 swap 根管子換一次，回傳現在該誰開 */
export function pilotFor(config: Config, score: number): Side {
  if (!config.swap) return config.pilot;
  const n = Math.floor(score / config.swap);
  const other: Side = config.pilot === 'L' ? 'R' : 'L';
  return n % 2 === 0 ? config.pilot : other;
}
