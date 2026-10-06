import { AnimatePresence, motion } from 'framer-motion';
import { useReactions, useRoom } from '../room';
import { Avatar } from './Avatar';

/** Floating reactions: other people's on the left, yours on the right. Mounted by the platform. */
export function ReactionLayer() {
  const { reactions } = useReactions();
  const room = useRoom();
  return (
    <div className="fixed inset-x-0 top-16 z-[35] pointer-events-none px-3 flex justify-between">
      {[false, true].map((mine) => (
        <div key={String(mine)} className={`flex flex-col gap-1.5 ${mine ? 'items-end' : 'items-start'}`}>
          <AnimatePresence>
            {reactions
              .filter((r) => (r.from === room.me.id) === mine)
              .map((r) => {
                const p = room.player(r.from);
                return (
                  <motion.div
                    key={r.id}
                    layout
                    initial={{ opacity: 0, scale: 0.4, y: -10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20, scale: 0.8 }}
                    transition={{ type: 'spring', stiffness: 520, damping: 22 }}
                    className={`flex items-center gap-1.5 ${mine ? 'flex-row-reverse' : ''}`}
                  >
                    <Avatar emoji={p?.avatar} name={p?.name ?? '?'} size={26} ring={p?.color} />
                    {r.emoji ? (
                      <motion.span className="text-4xl drop-shadow-[0_3px_3px_rgba(0,0,0,.2)]" animate={{ rotate: [0, -12, 12, 0], scale: [1, 1.25, 1] }} transition={{ duration: 0.6 }}>
                        {r.emoji}
                      </motion.span>
                    ) : (
                      <span className={`px-3 py-1.5 rounded-2xl text-sm font-bold shadow-lg max-w-[60vw] truncate ${mine ? 'bg-ink text-paper rounded-tr-sm' : 'bg-paper text-ink border-2 border-ink/10 rounded-tl-sm'}`}>
                        {!mine && <span className="text-ink-soft font-normal mr-1">{p?.name}</span>}
                        {r.text}
                      </span>
                    )}
                  </motion.div>
                );
              })}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}
