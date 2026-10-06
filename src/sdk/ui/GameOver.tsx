// The standard end-of-match card: headline, ranking with scores, and the right buttons for host /
// guests ("play again", "back to room", "leave"). Celebrates if you won.
import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { DoorOpen, Eye, LogOut, RotateCcw, Trophy } from 'lucide-react';
import { useRoom } from '../room';
import { tr, useLang } from '../i18n';
import type { Result } from '../logic';
import { S } from '../../platform/strings';
import { sfx } from '../../platform/audio/sfx';
import { haptic } from '../../platform/audio/haptic';
import { celebrate } from './celebrate';
import { Avatar } from './Avatar';
import { Button } from './Button';
import type { HeaderPlayer } from './GameHeader';

export function GameOver({ result, players, extra }: {
  result: Result;
  /** Default: room players. Engine games: pass g.seats. */
  players?: HeaderPlayer[];
  /** Anything game-specific under the ranking. */
  extra?: ReactNode;
}) {
  const room = useRoom();
  const lang = useLang();
  const t = S.use();
  const [hidden, setHidden] = useState(false);
  const list = players ?? room.players;
  const me = room.me.id;
  const iWon = result.winners.includes(me);
  const draw = !result.coop && result.winners.length === 0;

  useEffect(() => {
    if (result.coop) {
      sfx.win();
      celebrate('small');
    } else if (iWon) {
      sfx.win();
      haptic('double');
      celebrate();
    } else if (draw) sfx.miss();
    else if (!room.isSpectator) {
      sfx.lose();
      haptic('heavy');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const name = (id: string) => list.find((p) => p.id === id)?.name ?? '?';
  const headline = result.headline
    ? tr(result.headline, lang)
    : result.coop
      ? t.teamScore(result.value ?? '—')
      : draw
        ? t.draw
        : iWon
          ? t.youWin
          : t.wins(result.winners.map(name).join(', '));
  const order = result.ranking ?? [...result.winners, ...list.map((p) => p.id).filter((id) => !result.winners.includes(id))];

  return (
    <>
      <AnimatePresence>
        {!hidden && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-ink/35 backdrop-blur-[2px] flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.7, rotate: -4, y: 30 }}
              animate={{ scale: 1, rotate: -1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 18 }}
              className="w-full max-w-sm bg-paper rounded-[2rem] shadow-2xl p-5 text-center max-h-[90dvh] overflow-y-auto"
            >
              <div className="text-5xl">{result.coop ? '🤝' : draw ? '🤝' : iWon ? '🏆' : room.isSpectator ? '🎉' : '💫'}</div>
              <div className="text-2xl font-black mt-1 leading-tight">{headline}</div>
              <ol className="mt-4 flex flex-col gap-1.5 text-left">
                {order.map((id, i) => {
                  const p = list.find((x) => x.id === id);
                  if (!p) return null;
                  const won = result.winners.includes(id);
                  return (
                    <motion.li
                      key={id}
                      initial={{ x: -16, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: 0.15 + i * 0.06 }}
                      className={`flex items-center gap-2.5 px-3 py-1.5 rounded-2xl ${won ? 'bg-gold/25' : 'bg-ink/[.04]'}`}
                    >
                      <span className="w-5 text-sm font-black text-ink-soft tabular-nums">{result.ranking ? i + 1 : won ? <Trophy size={15} className="text-[#c08a00]" /> : ''}</span>
                      <Avatar emoji={p.avatar} name={p.name} size={28} ring={p.color} bot={p.bot} />
                      <span className={`flex-1 min-w-0 truncate font-bold ${id === me ? 'underline decoration-2 underline-offset-2' : ''}`}>{p.name}</span>
                      {result.scores?.[id] !== undefined && <span className="font-black tabular-nums">{result.scores[id]}</span>}
                    </motion.li>
                  );
                })}
              </ol>
              {extra && <div className="mt-3">{extra}</div>}
              <div className="mt-5 flex flex-col gap-2">
                {room.isHost ? (
                  <div className="flex gap-2">
                    <Button variant="ghost" className="flex-1 px-2" onClick={room.backToRoom}>
                      <DoorOpen size={16} /> {t.backToRoom}
                    </Button>
                    <Button className="flex-[1.2]" onClick={room.rematch}>
                      <RotateCcw size={16} /> {t.playAgain}
                    </Button>
                  </div>
                ) : (
                  <div className="text-sm text-ink-soft py-1">{t.waitingForHost}</div>
                )}
                <div className="flex gap-2">
                  <Button variant="soft" size="sm" className="flex-1" onClick={() => setHidden(true)}>
                    <Eye size={15} /> {t.viewBoard}
                  </Button>
                  {!room.isHost && (
                    <Button variant="soft" size="sm" className="flex-1" onClick={room.leave}>
                      <LogOut size={15} /> {t.leave}
                    </Button>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {hidden && (
        <motion.button
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          onClick={() => setHidden(false)}
          className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-full bg-ink text-paper text-sm font-bold shadow-xl flex items-center gap-1.5"
        >
          <Trophy size={15} /> {t.showResult}
        </motion.button>
      )}
    </>
  );
}
