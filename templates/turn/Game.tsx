// __NAME__ — the screen. Reads state from the engine, sends actions. No rules in here.
import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Button, GameHeader, GameOver, OfflineBanner, TurnBanner, Waiting, defineStrings, haptic, sfx, useGameState } from '@sdk';
import { logic } from './logic';

const T = defineStrings({
  'zh-TW': {
    left: (n: number) => `還剩 ${n} 根`,
    yourTurn: '輪到你了',
    waiting: (name: string) => `等 ${name}…`,
    take: (n: number) => `拿 ${n}`,
    took: (name: string, n: number) => `${name} 拿了 ${n} 根`,
  },
  en: {
    left: (n: number) => `${n} left`,
    yourTurn: 'Your turn',
    waiting: (name: string) => `Waiting for ${name}…`,
    take: (n: number) => `Take ${n}`,
    took: (name: string, n: number) => `${name} took ${n}`,
  },
});

export default function Game() {
  const g = useGameState(logic);
  const t = T.use();
  const s = g.state;

  // Sound on every move; a buzz when it becomes your turn.
  const sticks = s?.sticks;
  useEffect(() => {
    if (s?.last) sfx.pop();
  }, [sticks]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (g.myTurn) haptic('light');
  }, [g.myTurn]);

  if (!s) return <Waiting />;
  return (
    <div className="h-full flex flex-col">
      <GameHeader players={g.seats} active={g.turn} away={g.away} />
      <OfflineBanner />
      {/* Main area + controls. In landscape on phones (`short:`) the controls move to the right. */}
      <div className="flex-1 min-h-0 flex flex-col short:flex-row">
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-4 p-4">
          <div className="flex flex-wrap justify-center gap-1.5 max-w-sm">
            {Array.from({ length: s.sticks }, (_, i) => (
              <motion.span key={i} layout initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-2.5 h-14 rounded-full bg-gradient-to-b from-accent to-[#c94a37] shadow" />
            ))}
          </div>
          <div className="text-2xl font-black tabular-nums">{t.left(s.sticks)}</div>
          {s.last && <div className="text-sm text-ink-soft">{t.took(g.seat(s.last.by)?.name ?? '?', s.last.took)}</div>}
        </div>
        <footer className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 min-h-[96px] flex flex-col items-center justify-center gap-2 short:w-64 short:shrink-0">
          {g.myTurn ? (
            <>
              <TurnBanner show>{t.yourTurn}</TurnBanner>
              <div className="flex gap-2 w-full max-w-sm">
                {[1, 2, 3].map((n) => (
                  <Button key={n} className="flex-1" disabled={n > s.sticks} onClick={() => g.act({ type: 'take', n })}>
                    {t.take(n)}
                  </Button>
                ))}
              </div>
            </>
          ) : (
            !g.result && <div className="text-sm text-ink-soft">{t.waiting(g.seat(s.turn)?.name ?? '?')}</div>
          )}
        </footer>
      </div>
      {g.result && <GameOver result={g.result} players={g.seats} />}
    </div>
  );
}
