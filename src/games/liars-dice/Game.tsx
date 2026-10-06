import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Minus, Plus } from 'lucide-react';
import { Avatar, Button, GameHeader, GameOver, OfflineBanner, TurnBanner, Waiting, defineStrings, haptic, sfx, useGameState, type SeatInfo } from '@sdk';
import { REVEAL_MS, alive, beats, logic, matches, totalDice, type Bid, type State } from './logic';

const T = defineStrings({
  'zh-TW': {
    yourTurn: '輪到你喊',
    firstBid: '開第一口',
    waiting: (n: string) => `${n} 在想…`,
    bid: '喊',
    liar: '抓！',
    atLeast: '全桌至少',
    noBid: '還沒人喊',
    yourDice: '你的骰子',
    out: '出局',
    actual: (n: number) => `開出來有 ${n} 個`,
    loses: (n: string) => `${n} 少一顆骰子`,
    eliminated: (n: string) => `${n} 出局！`,
    called: (a: string, b: string) => `${a} 抓 ${b}！`,
    wild: '1 點萬能',
    total: (n: number) => `桌上共 ${n} 顆`,
    cantRaise: '已經喊到頂了，只能抓',
  },
  en: {
    yourTurn: 'Your bid',
    firstBid: 'Open the bidding',
    waiting: (n: string) => `${n} is thinking…`,
    bid: 'Bid',
    liar: 'Liar!',
    atLeast: 'At least',
    noBid: 'No bid yet',
    yourDice: 'Your dice',
    out: 'out',
    actual: (n: number) => `There were ${n}`,
    loses: (n: string) => `${n} loses a die`,
    eliminated: (n: string) => `${n} is out!`,
    called: (a: string, b: string) => `${a} calls ${b} a liar!`,
    wild: '1s wild',
    total: (n: number) => `${n} dice on the table`,
    cantRaise: 'Nothing left to raise — call it',
  },
});

export default function Game() {
  const g = useGameState(logic);
  const t = T.use();
  const s = g.state;

  // Feedback on every change of the table.
  const bids = s?.bids.length ?? 0;
  useEffect(() => {
    if (bids) sfx.chip();
  }, [bids]);
  const phase = s?.phase;
  useEffect(() => {
    if (!s) return;
    if (phase === 'reveal' && s.last) {
      sfx.slam();
      window.setTimeout(() => {
        if (s.last!.loser === g.me?.id) {
          sfx.lose2();
          haptic('heavy');
        } else sfx.win2();
      }, 900);
    } else if (phase === 'bid' && s.round > 1) {
      sfx.shake();
    }
  }, [phase, s?.round]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (g.myTurn) haptic('light');
  }, [g.myTurn]);

  if (!s) return <Waiting />;
  const scores = Object.fromEntries(s.order.map((id) => [id, s.count[id] ? `🎲${s.count[id]}` : '💀']));
  const others = g.seats.filter((p) => p.id !== g.me?.id);

  return (
    <div className="h-full flex flex-col">
      <GameHeader players={g.seats} active={g.turn} away={g.away} scores={scores} center={`${t.total(totalDice(s))}${s.wild ? ` · ${t.wild}` : ''}`} />
      <OfflineBanner />
      <div className="flex-1 min-h-0 flex flex-col short:flex-row">
        <div className="flex-1 min-h-0 overflow-y-auto px-3 pt-2 flex flex-col gap-3">
          {/* opponents */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {others.map((p) => (
              <Opponent key={p.id} p={p} s={s} active={g.turn.includes(p.id)} />
            ))}
          </div>
          {/* the bid in the middle of the table */}
          <div className="flex-1 min-h-[9rem] flex items-center justify-center">
            <AnimatePresence mode="wait">
              {s.phase === 'reveal' && s.last ? <Verdict key={`v${s.round}`} s={s} seat={g.seat} /> : <CurrentBid key={`b${s.bids.length}`} bid={s.bid} s={s} seat={g.seat} />}
            </AnimatePresence>
          </div>
        </div>

        <footer className="px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 short:w-80 short:shrink-0 short:flex short:flex-col short:justify-center">
          {g.me && <MyDice s={s} me={g.me} />}
          <div className="mt-2">
            {g.myTurn ? (
              <BidControls s={s} onBid={(q, f) => g.act({ type: 'bid', q, f })} onCall={() => g.act({ type: 'call' })} />
            ) : s.phase === 'bid' && alive(s).length > 1 ? (
              <div className="h-12 flex items-center justify-center text-sm text-ink-soft">{t.waiting(g.seat(s.turn)?.name ?? '?')}</div>
            ) : null}
          </div>
        </footer>
      </div>
      {g.result && <GameOver result={g.result} players={g.seats} />}
    </div>
  );
}

function Opponent({ p, s, active }: { p: SeatInfo; s: State; active: boolean }) {
  const t = T.use();
  const n = s.count[p.id];
  const dice = s.dice[p.id] ?? [];
  const reveal = s.phase === 'reveal';
  const lost = reveal && s.last?.loser === p.id;
  return (
    <motion.div
      animate={{ scale: active ? 1.03 : 1 }}
      className={`rounded-2xl p-2 border-2 bg-paper ${active ? 'border-ink shadow-[0_3px_0_#23212e]' : 'border-ink/10'} ${n === 0 && !lost ? 'opacity-45' : ''}`}
    >
      <div className="flex items-center gap-1.5 mb-1.5 min-w-0">
        <Avatar emoji={p.avatar} name={p.name} size={22} ring={p.color} bot={p.bot} />
        <span className="text-sm font-bold truncate flex-1">{p.name}</span>
        {n === 0 && !lost && <span className="text-[10px] text-ink-soft">{t.out}</span>}
        {lost && <motion.span initial={{ scale: 2 }} animate={{ scale: 1 }} className="text-xs font-black text-accent">−1</motion.span>}
      </div>
      <div className="flex flex-wrap gap-1 min-h-[26px]">
        {reveal && dice.length
          ? dice.map((d, i) => <Die key={i} face={d} size={24} hl={!!s.last && matches(d, s.last.bid.f, s.wild)} dim={!!s.last && !matches(d, s.last.bid.f, s.wild)} />)
          : Array.from({ length: n }, (_, i) => <Cup key={i} color={p.color} />)}
      </div>
    </motion.div>
  );
}

function CurrentBid({ bid, s, seat }: { bid: Bid | null; s: State; seat: (id: string) => SeatInfo | undefined }) {
  const t = T.use();
  if (!bid) return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-ink-soft text-sm">{t.noBid}</motion.div>;
  const by = seat(bid.by);
  return (
    <motion.div
      initial={{ scale: 0.6, opacity: 0, rotate: -6 }}
      animate={{ scale: 1, opacity: 1, rotate: -1 }}
      exit={{ scale: 0.9, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 420, damping: 18 }}
      className="bg-paper rounded-[1.75rem] border-2 border-ink/10 shadow-[0_10px_30px_-14px_rgba(35,33,46,.5)] px-6 py-4 text-center"
    >
      <div className="flex items-center justify-center gap-1.5 text-xs text-ink-soft mb-1">
        <Avatar emoji={by?.avatar} name={by?.name ?? '?'} size={18} ring={by?.color} /> {by?.name} · {t.atLeast}
      </div>
      <div className="flex items-center justify-center gap-3">
        <span className="text-5xl font-black tabular-nums">{bid.q}</span>
        <span className="text-2xl text-ink-soft">×</span>
        <Die face={bid.f} size={52} />
      </div>
      {s.bids.length > 1 && (
        <div className="flex justify-center gap-1 mt-2 opacity-60">
          {s.bids.slice(-5, -1).map((b, i) => (
            <span key={i} className="text-[11px] flex items-center gap-0.5 tabular-nums">
              {b.q}×<Die face={b.f} size={12} />
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function Verdict({ s, seat }: { s: State; seat: (id: string) => SeatInfo | undefined }) {
  const t = T.use();
  const last = s.last!;
  const caller = seat(last.caller)?.name ?? '?';
  const bidder = seat(last.bid.by)?.name ?? '?';
  const loser = seat(last.loser)?.name ?? '?';
  return (
    <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} className="bg-ink text-paper rounded-[1.75rem] px-6 py-4 text-center shadow-2xl max-w-xs">
      <div className="text-sm opacity-80">{t.called(caller, bidder)}</div>
      <div className="flex items-center justify-center gap-2 my-2">
        <span className="text-3xl font-black tabular-nums">{last.bid.q}</span>×<Die face={last.bid.f} size={34} />
      </div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
        <div className="font-bold">{t.actual(last.actual)}</div>
        <div className="text-gold font-black text-lg mt-1">{s.count[last.loser] === 0 ? t.eliminated(loser) : t.loses(loser)}</div>
      </motion.div>
      <div className="h-1 rounded-full bg-paper/20 mt-3 overflow-hidden">
        <motion.div className="h-full bg-paper/70" initial={{ width: '100%' }} animate={{ width: '0%' }} transition={{ duration: REVEAL_MS / 1000, ease: 'linear' }} />
      </div>
    </motion.div>
  );
}

function MyDice({ s, me }: { s: State; me: SeatInfo }) {
  const t = T.use();
  const dice = s.dice[me.id] ?? [];
  const bidF = s.phase === 'reveal' ? s.last?.bid.f : s.bid?.f;
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[11px] text-ink-soft">{t.yourDice}</span>
      <div className="flex gap-1.5 flex-wrap justify-center">
        {dice.length === 0 && <span className="text-sm text-ink-soft py-3">💀</span>}
        {dice.map((d, i) => (
          <motion.div key={`${s.round}-${i}`} initial={{ rotate: -200, scale: 0.3, y: -30 }} animate={{ rotate: 0, scale: 1, y: 0 }} transition={{ delay: i * 0.06, type: 'spring', stiffness: 300, damping: 16 }}>
            <Die face={d} size={46} hl={bidF !== undefined && matches(d, bidF, s.wild)} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function BidControls({ s, onBid, onCall }: { s: State; onBid: (q: number, f: number) => void; onCall: () => void }) {
  const t = T.use();
  const total = totalDice(s);
  // Start from the smallest legal raise.
  const first = useMemo(() => {
    for (let q = s.bid?.q ?? 1; q <= total; q++) for (const f of [2, 3, 4, 5, 6, 1]) if (beats(q, f, s.bid, s.wild)) return { q, f };
    return null;
  }, [s.bid, s.wild, total]);
  const [q, setQ] = useState(first?.q ?? 1);
  const [f, setF] = useState(first?.f ?? 2);
  const ok = beats(q, f, s.bid, s.wild) && q <= total;
  const btn = 'w-10 h-10 rounded-xl bg-paper border-2 border-ink/10 flex items-center justify-center disabled:opacity-30 active:scale-90 transition';
  return (
    <div className="mx-auto w-full max-w-sm">
      <TurnBanner show>{s.bid ? t.yourTurn : t.firstBid}</TurnBanner>
      {first ? (
        <>
          <div className="flex items-center justify-center gap-2 mt-2">
            <button className={btn} disabled={q <= 1} onClick={() => { sfx.tap(); setQ(q - 1); }} aria-label="-"><Minus size={16} /></button>
            <span className="w-12 text-center text-3xl font-black tabular-nums">{q}</span>
            <button className={btn} disabled={q >= total} onClick={() => { sfx.tap(); setQ(q + 1); }} aria-label="+"><Plus size={16} /></button>
          </div>
          <div className="grid grid-cols-6 gap-1 mt-2">
            {[1, 2, 3, 4, 5, 6].map((face) => (
              <button
                key={face}
                onClick={() => { sfx.tap(); setF(face); }}
                className={`h-11 rounded-xl flex items-center justify-center transition ${f === face ? 'bg-ink' : beats(q, face, s.bid, s.wild) ? 'bg-ink/[.04]' : 'opacity-30'}`}
                aria-label={String(face)}
              >
                <Die face={face} size={30} />
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="text-center text-sm text-ink-soft mt-2">{t.cantRaise}</div>
      )}
      <div className="flex gap-2 mt-2">
        {s.bid && (
          <Button variant="danger" className="flex-1" onClick={() => { haptic('medium'); onCall(); }}>
            {t.liar}
          </Button>
        )}
        {first && (
          <Button className="flex-[1.4]" disabled={!ok} onClick={() => { sfx.pop(); onBid(q, f); }}>
            {t.bid} {q} × <Die face={f} size={20} />
          </Button>
        )}
      </div>
    </div>
  );
}

const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

/** A die drawn with CSS. 1 and 4 have red pips, like Chinese dice. */
export function Die({ face, size = 40, hl, dim }: { face: number; size?: number; hl?: boolean; dim?: boolean }) {
  const red = face === 1 || face === 4;
  return (
    <span
      className={`inline-grid grid-cols-3 grid-rows-3 rounded-[22%] bg-white shrink-0 align-middle transition ${dim ? 'opacity-35' : ''}`}
      style={{
        width: size,
        height: size,
        padding: size * 0.14,
        gap: size * 0.04,
        boxShadow: hl ? `0 0 0 ${Math.max(2, size * 0.07)}px #f2c230, 0 2px 0 rgba(35,33,46,.25)` : 'inset 0 -2px 0 rgba(35,33,46,.12), 0 1px 0 rgba(35,33,46,.25)',
      }}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className="flex items-center justify-center">
          {PIPS[face]?.includes(i) && <span className="rounded-full block" style={{ width: face === 1 ? '120%' : '78%', height: face === 1 ? '120%' : '78%', background: red ? '#d8432f' : '#23212e' }} />}
        </span>
      ))}
    </span>
  );
}

function Cup({ color }: { color: string }) {
  return <span className="w-[22px] h-[24px] rounded-t-[40%] rounded-b-md block" style={{ background: `linear-gradient(180deg, ${color}, color-mix(in srgb, ${color} 70%, #23212e))` }} />;
}
