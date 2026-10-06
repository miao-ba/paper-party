// 過橋的電腦：玩家佈陣完它才佈陣；輪到它就用 simulateMove 蒙地卡羅試一堆方向 × 力道，挑期望最好的
// （撞掉幾個、會不會掉水、離敵人有沒有更近）。難度 = 從前幾名裡隨機挑 + 額外手抖。
import type { BotFactory } from '@sdk/types';
import { between, clamp, gauss, oneAtATime, pickOne } from '../shared/bot';
import type { Msg } from './Game';
import { getMap } from './maps';
import {
  HOLD_MS, PAPER, applyMove, canPlace, initialState, mergeSetup, moveDuration, nextTurn, other, placePiece, simulateMove,
  type GameState, type MoveResult, type Piece, type Size,
} from './logic';

const SKILL = [
  { top: 6, angle: 7, power: 9 },
  { top: 3, angle: 2.5, power: 4 },
  { top: 1, angle: 0, power: 0 },
];
const POWERS = [16, 26, 36, 46, 56, 66, 76, 86, 94];
type Cand = { id: string; angle: number; power: number; score: number };

export const bridgeBot: BotFactory = (ctx) => {
  const me = ctx.side;
  const foe = other(me);
  const skill = SKILL[ctx.difficulty];
  let s: GameState = initialState({ count: 3, map: 'single', chain: true });
  const plan = oneAtATime(ctx);

  const commit = (next: GameState) => {
    s = next;
    ctx.send({ t: 'state', state: next } satisfies Msg);
    think();
  };

  const deploy = () => {
    if (s.phase !== 'setup' || s.ready[me]) return;
    let tmp = s;
    const sizes: Size[] = ['L', 'M', 'M', 'S'];
    for (let k = 0; k < s.config.count; k++) {
      const size = pickOne(sizes);
      for (let tries = 0; tries < 600; tries++) {
        const p = { x: between(0, PAPER.w), y: between(0, PAPER.h) };
        if (canPlace(tmp, me, p, size)) { tmp = placePiece(tmp, me, p, size); break; }
      }
    }
    const mine = tmp.pieces.filter((p) => p.side === me);
    ctx.send({ t: 'setup', side: me, pieces: mine, ready: true } satisfies Msg);
    s = mergeSetup(s, me, mine, true);
    think();
  };

  /** 一步的好壞：撞掉越多越好、掉水很糟、離最近的敵人更近一點點加分 */
  const value = (piece: Piece, mv: MoveResult, enemies: Piece[], allies: number) => {
    let v = mv.killed.length * 100;
    if (mv.killed.length >= enemies.length) v += 1000;
    if (mv.drowned) v -= allies <= 1 ? 600 : 90;
    if (!mv.drowned) {
      const near = (p: { x: number; y: number }) => Math.min(...enemies.filter((e) => !mv.killed.includes(e.id)).map((e) => Math.hypot(e.x - p.x, e.y - p.y)), 9999);
      v += (near(piece) - near(mv.to)) * 0.12;
    }
    if (mv.slipped) v -= 5;
    return v;
  };

  /** 分批算（每顆圈一批），不要一次卡住畫面 */
  const aim = () => {
    const mine = s.pieces.filter((p) => p.side === me && p.alive);
    const enemies = s.pieces.filter((p) => p.side === foe && p.alive);
    if (!mine.length || !enemies.length) return;
    const map = getMap(s.config.map);
    const cands: Cand[] = [];
    const snapshot = s;
    let i = 0;
    const batch = () => {
      if (s !== snapshot) return; // 狀態變了（重來之類）就放棄
      const piece = mine[i++];
      const angles: number[] = [];
      const toward = (q: { x: number; y: number }) => angles.push(Math.atan2(q.y - piece.y, q.x - piece.x));
      enemies.forEach(toward);
      for (const b of map.bridges) { toward(b.a); toward(b.b); toward({ x: (b.a.x + b.b.x) / 2, y: (b.a.y + b.b.y) / 2 }); }
      map.islands.forEach(toward);
      for (let k = 0; k < 10; k++) angles.push((k / 10) * Math.PI * 2);
      for (const angle of angles)
        for (const power of POWERS) {
          let sum = 0;
          for (let n = 0; n < 2; n++) sum += value(piece, simulateMove(s, piece.id, angle, power), enemies, mine.length);
          cands.push({ id: piece.id, angle, power, score: sum / 2 });
        }
      if (i < mine.length) { ctx.later(batch, 0); return; }
      // 前幾名再多試幾次，挑穩的
      cands.sort((a, b) => b.score - a.score);
      const top = cands.slice(0, 12).map((c) => {
        const piece = mine.find((p) => p.id === c.id)!;
        let sum = 0;
        for (let n = 0; n < 8; n++) sum += value(piece, simulateMove(s, c.id, c.angle, c.power), enemies, mine.length);
        return { ...c, score: sum / 8 };
      }).sort((a, b) => b.score - a.score);
      const pick = top[Math.floor(Math.random() * Math.min(skill.top, top.length))];
      const angle = pick.angle + (gauss() * skill.angle * Math.PI) / 180;
      const power = Math.round(clamp(pick.power + gauss() * skill.power, 8, 100));
      commit(applyMove(s, simulateMove(s, pick.id, angle, power)));
    };
    batch();
  };

  const think = () => {
    if (s.phase === 'setup') {
      if (s.ready[foe] && !s.ready[me]) plan.run('deploy', deploy, between(900, 1600));
      return;
    }
    if (s.phase !== 'play' || s.turn !== me) return;
    const key = `${s.turnNo}:${s.step}`;
    if (s.step === 'aim') plan.run(key, aim, between(1300, 2200));
    else if (s.step === 'resolve' && s.lastMove) {
      const m = s.lastMove;
      plan.run(key, () => commit(nextTurn(s)), moveDuration(Math.hypot(m.to.x - m.from.x, m.to.y - m.from.y)) + HOLD_MS);
    }
  };

  return {
    onMessage(m: Msg) {
      switch (m.t) {
        case 'config': plan.clear(); s = initialState(m.config); break;
        case 'setup': s = mergeSetup(s, m.side, m.pieces, m.ready); break;
        case 'state': s = m.state; break;
        case 'rematch': plan.clear(); s = initialState(s.config); break;
        default: return;
      }
      think();
    },
  };
};

