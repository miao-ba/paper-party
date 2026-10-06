// 烏龜對對碰的電腦：玩家選好許願色它才準備（不然房主改不了包數），開局後自己拆自己的。
// 難度 = 打法：簡單亂擺、只在被迫時開獎；普通會擺三連；困難再加上「沒有對子在等三連就先開獎」
// （README 的模擬：18 包平均約 43 / 60 / 69 隻）
import type { BotFactory } from '@sdk/types';
import { between } from '../shared/bot';
import type { Msg } from './Game';
import {
  LINES, N_COLORS, canOpen, canSettle, finished, mustSettle, newBoard, open, place, resultText, settle, type Board, type Cell,
} from './logic';

/** 跟 Game.tsx 一樣：開獎亮框停多久才收走 */
const SETTLE_MS = 750;

/** 擺哪格：能連成三連的先、再來是湊成「兩個 + 空格」的線、再來是跟同色同一條線的格子 */
function smartCell(cells: Cell[], c: number): number {
  const empty = cells.map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0);
  const score = (i: number) => {
    let sc = 0;
    for (const line of LINES) {
      if (!(line as readonly number[]).includes(i)) continue;
      const others = line.filter((j) => j !== i).map((j) => cells[j]);
      const same = others.filter((v) => v === c).length;
      const blank = others.filter((v) => v === null).length;
      const foreign = others.filter((v) => v !== null && v !== c).length;
      if (same === 2) sc += 100;
      else if (same === 1 && blank === 1) sc += 12;
      else if (blank === 2) sc += 2;
      // 擋到別的顏色快成的線，扣一點
      if (foreign === 2 && others[0] === others[1]) sc -= 8;
    }
    return sc + Math.random();
  };
  return empty.reduce((best, i) => (score(i) > score(best) ? i : best), empty[0]);
}

/** 有沒有同色的一對在同一條線上、第三格還空著（先開獎會把它收掉，划不來） */
function pairWaiting(cells: Cell[]) {
  return LINES.some((line) => {
    const v = line.map((j) => cells[j]);
    const blanks = v.filter((x) => x === null).length;
    const filled = v.filter((x) => x !== null);
    return blanks === 1 && filled[0] === filled[1];
  });
}

export const turtleBot: BotFactory = (ctx) => {
  const me = ctx.side;
  const level = ctx.difficulty;
  let round = 0;
  let seed = '';
  let board: Board | null = null;
  let ready = false;
  let timer = 0;
  /** 玩家拆完了就加快，不要讓人乾等 */
  let humanDone = false;

  const send = (msg: Msg) => ctx.send(msg);
  const commit = (b: Board, ev?: Extract<Msg, { t: 'tt:board' }>['ev']) => {
    board = b;
    send({ t: 'tt:board', round, side: me, board: b, ev });
  };
  const next = (ms: number) => { ctx.cancel(timer); timer = ctx.later(act, ms); };
  const pace = () => (humanDone ? between(140, 240) : between(520, 950));

  const act = () => {
    const b = board;
    if (!b || finished(b)) return;
    if (mustSettle(b) || (b.hand === null && !canOpen(b) && canSettle(b))) return doSettle(b);
    if (b.hand !== null) {
      const empty = b.cells.map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0);
      const i = level === 0 ? empty[Math.floor(Math.random() * empty.length)] : smartCell(b.cells, b.hand);
      commit(place(b, i));
      return next(pace());
    }
    if (level === 2 && canSettle(b) && !pairWaiting(b.cells)) return doSettle(b);
    if (canOpen(b)) {
      const { board: nb, wished } = open(b, seed);
      commit(nb, wished ? { k: 'wish' } : undefined);
      return next(pace());
    }
  };

  const doSettle = (b: Board) => {
    const { board: nb, result } = settle(b);
    const big = result.lines.length > 0 || result.family || result.clear;
    send({ t: 'tt:anim', round, side: me, cells: b.cells, result });
    ctx.later(() => {
      if (board !== b) return;
      commit(nb, { k: 'settle', text: resultText(result), big });
      next(pace());
    }, SETTLE_MS);
  };

  return {
    onMessage(m: Msg) {
      switch (m.t) {
        case 'tt:ready':
          if (m.side !== me && !ready) {
            ready = true;
            ctx.later(() => send({ t: 'tt:ready', side: me, wish: Math.floor(Math.random() * N_COLORS) }), between(600, 1300));
          }
          break;
        case 'tt:board':
          if (m.side !== me && m.round === round) humanDone = finished(m.board);
          break;
        case 'tt:start':
          humanDone = false;
          round = m.round;
          seed = m.seed;
          board = newBoard(m.packs, m.wishes[me]);
          next(between(900, 1400));
          break;
        case 'tt:rematch':
          ctx.cancel(timer);
          board = null;
          ready = false;
          break;
      }
    },
  };
};

