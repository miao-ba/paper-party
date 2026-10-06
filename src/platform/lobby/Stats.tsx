// Match history on this device: totals, per game, recent matches.
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { tr, useLang } from '@sdk/i18n';
import { Avatar } from '@sdk/ui/Avatar';
import { Button } from '@sdk/ui/Button';
import { GameIcon } from '@sdk/ui/GameIcon';
import { Sheet } from '@sdk/ui/Sheet';
import { getGame } from '../../games/registry';
import { clearRecords, statsByGame, useRecords } from '../records';
import { S } from '../strings';

export function StatsSheet({ onClose }: { onClose: () => void }) {
  const recs = useRecords();
  const lang = useLang();
  const t = S.use();
  const [confirm, setConfirm] = useState(false);
  const decided = recs.filter((r) => r.won !== null);
  const wins = decided.filter((r) => r.won).length;
  const byGame = [...statsByGame(recs).entries()].sort((a, b) => b[1].plays - a[1].plays);

  return (
    <Sheet title={t.stats} onClose={onClose} wide>
      {recs.length === 0 ? (
        <div className="text-center text-ink-soft py-10">
          <div className="text-5xl mb-2">🎲</div>
          {t.noMatches}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Big n={recs.length} label={t.played} />
            <Big n={wins} label={t.won} />
            <Big n={decided.length ? `${Math.round((wins / decided.length) * 100)}%` : '—'} label={t.winRate} />
          </div>

          <section className="flex flex-col gap-1.5">
            {byGame.map(([id, s]) => {
              const g = getGame(id);
              return (
                <div key={id} className="flex items-center gap-3 p-2 rounded-2xl bg-ink/[.03]">
                  {g ? <GameIcon meta={g.meta} size={34} /> : <span className="w-[34px] h-[34px] rounded-xl bg-ink/10" />}
                  <span className="flex-1 min-w-0 font-bold truncate">{g ? tr(g.meta.name, lang) : id}</span>
                  <span className="text-xs text-ink-soft tabular-nums">
                    {s.plays} {t.played} · {s.wins} {t.won}
                    {s.best !== null && ` · ${t.best} ${s.best}`}
                  </span>
                </div>
              );
            })}
          </section>

          <section>
            <h3 className="text-sm text-ink-soft mb-2">{t.recentMatches}</h3>
            <div className="flex flex-col gap-1">
              {recs.slice(0, 25).map((r) => {
                const g = getGame(r.game);
                return (
                  <div key={r.id} className="flex items-center gap-2 py-1.5 border-b border-ink/5 text-sm">
                    <span className="w-6 text-center">{r.coop ? '🤝' : r.draw ? '🟰' : r.won ? '🏆' : '·'}</span>
                    <span className="font-bold truncate max-w-[8rem]">{g ? tr(g.meta.name, lang) : r.game}</span>
                    <span className="flex -space-x-1.5 flex-1 min-w-0 overflow-hidden">
                      {r.players.filter((p) => !p.me).slice(0, 6).map((p, i) => (
                        <Avatar key={i} emoji={p.avatar} name={p.name} size={20} bot={p.bot} />
                      ))}
                    </span>
                    {r.value !== undefined && <span className="text-xs tabular-nums">{r.value}</span>}
                    <span className="text-[11px] text-ink-soft tabular-nums shrink-0">{new Date(r.at).toLocaleDateString(lang, { month: 'numeric', day: 'numeric' })}</span>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="flex items-center justify-between gap-2 text-[11px] text-ink-soft">
            <span>{t.historyLocal}</span>
            {confirm ? (
              <span className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>{t.cancel}</Button>
                <Button size="sm" variant="danger" onClick={() => { clearRecords(); setConfirm(false); }}>{t.clearHistory}</Button>
              </span>
            ) : (
              <Button size="sm" variant="soft" onClick={() => setConfirm(true)}>
                <Trash2 size={14} /> {t.clearHistory}
              </Button>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}

function Big({ n, label }: { n: number | string; label: string }) {
  return (
    <div className="rounded-2xl bg-ink/[.04] py-3">
      <div className="text-2xl font-black tabular-nums">{n}</div>
      <div className="text-[11px] text-ink-soft">{label}</div>
    </div>
  );
}
