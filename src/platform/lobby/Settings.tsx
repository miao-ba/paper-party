// Settings: me (name, avatar), sound & vibration, display, language, install, about.
import { useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Download, Globe, Info, Monitor, RefreshCw, Smartphone, Volume2 } from 'lucide-react';
import { LANGS, LANG_LABEL, setLang, useLang } from '@sdk/i18n';
import { Avatar } from '@sdk/ui/Avatar';
import { Button } from '@sdk/ui/Button';
import { Sheet } from '@sdk/ui/Sheet';
import { useNet } from '../net/NetContext';
import { AVATARS, setPrefs, usePrefs } from '../prefs';
import { setVolume, sfx } from '../audio/sfx';
import { haptic } from '../audio/haptic';
import { platform, useInstall } from '../pwa';
import { CONFIG } from '../../config';
import { S } from '../strings';

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const net = useNet();
  const prefs = usePrefs();
  const lang = useLang();
  const t = S.use();
  const [name, setName] = useState(net.name ?? '');

  return (
    <Sheet title={t.settings} onClose={onClose} wide>
      <div className="flex flex-col gap-4">
        <Section title={t.me}>
          <div className="flex items-center gap-3">
            <Avatar emoji={prefs.avatar} name={net.name ?? '?'} size={56} />
            <form
              className="flex-1 min-w-0 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                net.setName(name);
                sfx.pop();
                net.flash(t.nameSaved, { icon: '✏️' });
              }}
            >
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={16}
                placeholder={t.nickname}
                aria-label={t.nickname}
                className="flex-1 min-w-0 rounded-xl border-2 border-ink/10 bg-white/60 px-3 py-2 outline-none focus:border-ink/40"
              />
              <Button type="submit" disabled={!name.trim() || name.trim() === net.name}>
                {t.save}
              </Button>
            </form>
          </div>
          <div className="grid grid-cols-8 gap-1 mt-3">
            {AVATARS.map((a) => (
              <motion.button
                key={a}
                whileTap={{ scale: 0.85 }}
                onClick={() => { setPrefs({ avatar: a }); sfx.tap(); }}
                className={`aspect-square rounded-xl text-2xl flex items-center justify-center ${prefs.avatar === a ? 'bg-ink/10 ring-2 ring-ink' : 'active:bg-ink/5'}`}
              >
                {a}
              </motion.button>
            ))}
          </div>
        </Section>

        <Section title={t.language} icon={<Globe size={15} />}>
          <div className="flex gap-2">
            {LANGS.map((l) => (
              <button key={l} onClick={() => { setLang(l); sfx.tap(); }} className={`flex-1 py-2 rounded-xl text-sm font-bold ${l === lang ? 'bg-ink text-paper' : 'bg-ink/5'}`}>
                {LANG_LABEL[l]}
              </button>
            ))}
          </div>
        </Section>

        <Section title={t.soundVibration} icon={<Volume2 size={15} />}>
          <Toggle label={t.sound} on={!prefs.muted} onChange={(v) => { setPrefs({ muted: !v }); if (v) sfx.pop(); }} />
          <div className={`flex items-center gap-3 py-2 ${prefs.muted ? 'opacity-40' : ''}`}>
            <span className="text-sm w-16 shrink-0">{t.volume}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={prefs.volume}
              disabled={prefs.muted}
              onChange={(e) => {
                const v = Number(e.target.value);
                setPrefs({ volume: v });
                setVolume(v);
              }}
              onPointerUp={() => sfx.coin()}
              className="flex-1 accent-[#23212e]"
              aria-label={t.volume}
            />
            <span className="text-xs text-ink-soft w-9 text-right tabular-nums">{Math.round(prefs.volume * 100)}%</span>
          </div>
          <Toggle label={t.vibration} on={prefs.haptics} onChange={(v) => { setPrefs({ haptics: v }); if (v) haptic('double'); }} />
        </Section>

        <Section title={t.display} icon={<Monitor size={15} />}>
          <Toggle label={t.reduceMotion} hint={t.reduceMotionHint} on={prefs.calm} onChange={(v) => setPrefs({ calm: v })} />
        </Section>

        <InstallSection />

        <Section title={t.about} icon={<Info size={15} />}>
          <div className="text-xs text-ink-soft leading-relaxed">
            {t.aboutText}
            <br />
            {t.version(__BUILD__)} · {t.credits}
            {CONFIG.repoUrl && (
              <>
                <br />
                <a href={CONFIG.repoUrl} target="_blank" rel="noreferrer" className="underline">
                  {CONFIG.repoUrl}
                </a>
              </>
            )}
          </div>
          <Button variant="ghost" className="w-full mt-3" onClick={() => location.reload()}>
            <RefreshCw size={15} /> {t.reload}
          </Button>
        </Section>
      </div>
    </Sheet>
  );
}

function InstallSection() {
  const install = useInstall();
  const t = S.use();
  if (install.installed) return null;
  return (
    <Section title={t.install} icon={<Smartphone size={15} />}>
      {install.canPrompt ? (
        <Button className="w-full" onClick={() => void install.prompt()}>
          <Download size={16} /> {t.installNow}
        </Button>
      ) : (
        <div className="text-sm leading-relaxed">{platform === 'ios' ? t.installIos : '⋮ → ' + t.install}</div>
      )}
    </Section>
  );
}

function Section({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-3xl border-2 border-ink/10 p-4">
      <h3 className="font-bold text-sm mb-3 flex items-center gap-1.5">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function Toggle({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => { sfx.tap(); onChange(!on); }} className="w-full flex items-center gap-3 py-2 text-left" role="switch" aria-checked={on}>
      <span className="flex-1 min-w-0">
        <span className="text-sm block">{label}</span>
        {hint && <span className="text-[11px] text-ink-soft block">{hint}</span>}
      </span>
      <span className={`w-12 h-7 rounded-full p-0.5 transition-colors ${on ? 'bg-accent-2' : 'bg-ink/20'}`}>
        <motion.span layout transition={{ type: 'spring', stiffness: 600, damping: 35 }} className={`block w-6 h-6 rounded-full bg-white shadow ${on ? 'ml-auto' : ''}`} />
      </span>
    </button>
  );
}
