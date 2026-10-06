import { useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { Button } from '@sdk/ui/Button';
import { Avatar } from '@sdk/ui/Avatar';
import { LANGS, LANG_LABEL, setLang, useLang } from '@sdk/i18n';
import { AVATARS, setPrefs, usePrefs } from '../prefs';
import { sfx } from '../audio/sfx';
import { games } from '../../games/registry';
import { S } from '../strings';

/** First visit: nickname + avatar. No accounts. */
export function NameGate({ onSubmit }: { onSubmit: (name: string) => void }) {
  const prefs = usePrefs();
  const lang = useLang();
  const t = S.use();
  const [v, setV] = useState('');
  return (
    <div className="min-h-full flex items-center justify-center p-5 py-10">
      <motion.form
        initial={{ opacity: 0, y: 16, rotate: -1 }}
        animate={{ opacity: 1, y: 0, rotate: -1 }}
        className="w-full max-w-sm bg-paper rounded-[2rem] p-7 shadow-[0_10px_30px_-10px_rgba(35,33,46,.35)] border border-ink/10"
        onSubmit={(e) => {
          e.preventDefault();
          if (!v.trim()) return;
          sfx.start();
          onSubmit(v);
        }}
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="flex items-center gap-1.5 text-accent">
            <Sparkles size={18} />
            <span className="text-sm font-semibold tracking-wide">{t.appName}</span>
          </span>
          <span className="flex-1" />
          {LANGS.map((l) => (
            <button key={l} type="button" onClick={() => setLang(l)} className={`text-[11px] px-2 py-0.5 rounded-full ${l === lang ? 'bg-ink text-paper' : 'text-ink-soft'}`}>
              {LANG_LABEL[l]}
            </button>
          ))}
        </div>
        <h1 className="text-2xl font-bold">{t.whatsYourName}</h1>
        <p className="text-sm text-ink-soft mt-1 mb-5">{t.nameHint(games.length)}</p>

        <div className="flex items-center gap-3 mb-3">
          <motion.div key={prefs.avatar} initial={{ scale: 0.6, rotate: -15 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 15 }}>
            <Avatar emoji={prefs.avatar} name={v || '?'} size={56} />
          </motion.div>
          <input
            autoFocus
            value={v}
            onChange={(e) => setV(e.target.value)}
            maxLength={16}
            placeholder={t.nickname}
            aria-label={t.nickname}
            className="flex-1 min-w-0 text-lg px-4 py-3 rounded-2xl bg-white/70 border-2 border-ink/15 focus:border-ink/60 outline-none"
          />
        </div>
        <div className="text-xs text-ink-soft mb-1.5">{t.pickAvatar}</div>
        <div className="grid grid-cols-8 gap-1 mb-5">
          {AVATARS.map((a) => (
            <motion.button
              type="button"
              key={a}
              whileTap={{ scale: 0.8 }}
              onClick={() => {
                setPrefs({ avatar: a });
                sfx.tap();
              }}
              className={`aspect-square rounded-xl text-xl flex items-center justify-center ${prefs.avatar === a ? 'bg-ink/10 ring-2 ring-ink' : 'active:bg-ink/5'}`}
            >
              {a}
            </motion.button>
          ))}
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={!v.trim()}>
          {t.enter}
        </Button>
      </motion.form>
    </div>
  );
}
