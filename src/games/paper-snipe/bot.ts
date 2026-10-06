// 摺紙狙擊的電腦：玩家佈陣完它才佈陣（不然房主改不了人數）；輪到它就瞄一個火柴人畫點、蓄力敲下去
import type { BotFactory } from '@sdk/types';
import { between, clamp, gauss, oneAtATime, pickOne } from '../shared/bot';
import type { Msg } from './Game';
import {
  DOT_R, FOLD_MS, PAPER, POWER, REVEAL_HOLD_MS, SIZES, SLAM_MS, applyStamp, canPlace, drawDot, initialState, mergeSetup,
  nextTurn, other, placeStickman, type GameState, type Size, type Stickman,
} from './logic';

/** 瞄準誤差（標準差，邏輯座標）、力道誤差、瞄頭的機率 */
const SKILL = [
  { aim: 46, power: 13, head: 0.12 },
  { aim: 28, power: 8, head: 0.3 },
  { aim: 15, power: 4.5, head: 0.55 },
];
/** PowerButton 0→100 要 750ms */
const RISE_MS = 750;

export const snipeBot: BotFactory = (ctx) => {
  const me = ctx.side;
  const foe = other(me);
  const skill = SKILL[ctx.difficulty];
  let s: GameState = initialState(3);
  const plan = oneAtATime(ctx);
  let charging = 0;

  const commit = (next: GameState) => {
    s = next;
    ctx.send({ t: 'state', state: next } satisfies Msg);
    think();
  };

  const deploy = () => {
    if (s.phase !== 'setup' || s.ready[me]) return;
    let tmp = s;
    const sizes: Size[] = ['L', 'M', 'S'];
    // 坐在對面：比玩家的火柴人多轉 180°，玩家看起來是倒的（跟兩人玩一樣）
    const rot = ((s.stickmen.find((m) => m.side === foe)?.rot ?? 0) + 180) % 360;
    for (let k = 0; k < s.config.count; k++) {
      const size = pickOne(sizes);
      for (let tries = 0; tries < 300; tries++) {
        const x = between(PAPER.fold + 30, PAPER.w - 30);
        const y = between(40, PAPER.h - 40);
        if (canPlace(tmp, me, x, y, size, rot)) { tmp = placeStickman(tmp, me, x, y, size, rot); break; }
      }
    }
    const mine = tmp.stickmen.filter((m) => m.side === me);
    ctx.send({ t: 'setup', side: me, stickmen: mine, ready: true } satisfies Msg);
    s = mergeSetup(s, me, mine, true);
    think();
  };

  /** 火柴人身上某個點（火柴人自己的座標）→ 紙上座標 */
  const worldOf = (m: Stickman, lx: number, ly: number) => {
    const sc = SIZES[m.size].scale;
    const a = (m.rot * Math.PI) / 180;
    return { x: m.x + (lx * Math.cos(a) - ly * Math.sin(a)) * sc, y: m.y + (lx * Math.sin(a) + ly * Math.cos(a)) * sc };
  };

  const draw = () => {
    const targets = s.stickmen.filter((m) => m.side === foe && m.hp > 0);
    if (!targets.length) return;
    // 偏好血少的（補刀）
    const t = Math.random() < 0.5 ? targets.reduce((a, b) => (b.hp < a.hp ? b : a)) : pickOne(targets);
    const p = Math.random() < skill.head ? worldOf(t, 0, -50) : worldOf(t, 0, -14);
    const aim = { x: p.x + gauss() * skill.aim, y: p.y + gauss() * skill.aim };
    // 墨點畫在自己這半邊的鏡像位置，摺過去就印到對面
    const m = DOT_R + 6;
    const x = clamp(PAPER.w - aim.x, PAPER.fold + m, PAPER.w - m);
    const y = clamp(aim.y, m, PAPER.h - m);
    const next = drawDot(s, x, y);
    if (next) commit(next);
  };

  const strike = () => {
    const power = Math.round(clamp(POWER.sweet + gauss() * skill.power, 20, 100));
    const t0 = performance.now();
    const holdMs = (power / 100) * RISE_MS;
    // 讓玩家看到力道條在跑
    ctx.cancel(charging);
    charging = ctx.every(() => {
      const p = Math.min(power, Math.round(((performance.now() - t0) / RISE_MS) * 100));
      ctx.send({ t: 'charge', power: p } satisfies Msg);
    }, 50);
    ctx.later(() => {
      ctx.cancel(charging);
      ctx.send({ t: 'charge', power: null } satisfies Msg);
      commit(applyStamp(s, power));
    }, holdMs);
  };

  const think = () => {
    if (s.phase === 'setup') {
      if (s.ready[foe] && !s.ready[me]) plan.run('deploy', deploy, between(900, 1600));
      return;
    }
    if (s.phase !== 'play' || s.turn !== me) return;
    const key = `${s.turnNo}:${s.step}`;
    if (s.step === 'draw') plan.run(key, draw, between(900, 1700));
    else if (s.step === 'fold') plan.run(key, () => commit({ ...s, step: 'aim' }), FOLD_MS + 250);
    else if (s.step === 'aim') plan.run(key, strike, between(400, 900));
    else if (s.step === 'reveal') plan.run(key, () => commit(nextTurn(s)), SLAM_MS + FOLD_MS + REVEAL_HOLD_MS);
  };

  return {
    onMessage(m: Msg) {
      switch (m.t) {
        case 'config': plan.clear(); s = initialState(m.count); break;
        case 'setup': s = mergeSetup(s, m.side, m.stickmen, m.ready); break;
        case 'state': s = m.state; break;
        case 'rematch': plan.clear(); s = initialState(s.config.count); break;
        default: return;
      }
      think();
    },
  };
};
