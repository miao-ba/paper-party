import { tr, trList, useLang } from '../i18n';
import { TAG_LABEL, type GameMeta } from '../types';
import { S } from '../../platform/strings';
import { Sheet } from './Sheet';
import { GameIcon } from './GameIcon';

/** "How to play" sheet built from the game's meta. */
export function RulesSheet({ meta, onClose }: { meta: GameMeta; onClose: () => void }) {
  const lang = useLang();
  const t = S.use();
  return (
    <Sheet title={tr(meta.name, lang)} onClose={onClose} icon={<GameIcon meta={meta} size={36} />}>
      <div className="flex flex-wrap gap-1.5 mb-3">
        <span className="px-2 py-0.5 rounded-full bg-ink/5 text-xs text-ink-soft">{t.playersRange(meta.players.min, meta.players.max)}</span>
        {meta.tags.map((tag) => (
          <span key={tag} className="px-2 py-0.5 rounded-full bg-ink/5 text-xs text-ink-soft">
            {tr(TAG_LABEL[tag], lang)}
          </span>
        ))}
        <span className="px-2 py-0.5 rounded-full bg-ink/5 text-xs text-ink-soft">{t.aboutMinutes(meta.minutes)}</span>
      </div>
      <ol className="flex flex-col gap-2">
        {trList(meta.howto, lang).map((h, i) => (
          <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
            <span className="w-6 h-6 rounded-full text-white text-xs font-black flex items-center justify-center shrink-0 mt-0.5" style={{ background: `hsl(${meta.hue} 60% 52%)` }}>
              {i + 1}
            </span>
            <span>{h}</span>
          </li>
        ))}
      </ol>
    </Sheet>
  );
}
