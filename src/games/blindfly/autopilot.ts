// 盲飛的自動駕駛 / 自動塔台（單人模式的電腦用，也可以拿來寫測試）。純函式，不碰 React / 網路。
import { BIRD_R, FIRST_PIPE_X, FLAP_VY, GRAVITY, PIPE_SPACING, PIPE_W, WORLD_H, pipeAt, type Bird, type Pipe } from './logic';

/** 鳥還沒過的下一根管子（還在管子裡也算） */
export function nextPipe(seed: string, x: number): { i: number; pipe: Pipe } {
  const i = Math.max(0, Math.ceil((x - BIRD_R - PIPE_W - FIRST_PIPE_X) / PIPE_SPACING));
  return { i, pipe: pipeAt(seed, i) };
}

/** 拍一下大約往上竄多高（FLAP_VY² / 2g），拍的時機抓「掉到目標下方一半」，上下擺動就會繞著目標 */
const HOP = (FLAP_VY * FLAP_VY) / (2 * GRAVITY);

/** 想飛到 target 高度該不該拍。離目標很遠就連拍；cooldown 由呼叫的人控制 */
export function shouldFlap(b: Bird, target: number) {
  if (!b.alive || b.y < BIRD_R + 30) return false;
  if (b.y - target > HOP * 1.5) return b.vy > -200;
  return b.y > target + HOP * 0.45 && b.vy > 0;
}

/** 塔台建議：離缺口太遠就喊上 / 下；null = 不用喊 */
export function towerCall(b: Bird, seed: string, margin = 55): 'up' | 'down' | null {
  if (!b.alive) return null;
  const { pipe } = nextPipe(seed, b.x);
  if (pipe.x - b.x > 650) return null;
  const dy = b.y - pipe.gapY;
  if (dy > margin && b.vy > -80) return 'up';
  if (dy < -margin && b.vy < 80) return 'down';
  return null;
}

export const clampAlt = (y: number) => Math.max(BIRD_R + 70, Math.min(WORLD_H - BIRD_R - 70, y));
