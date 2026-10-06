// The waiting room: share the code, fill seats (friends or bots), set options, start.
import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Bot, Check, Copy, Crown, Eye, Globe, Lock, Plus, QrCode as QrIcon, Share2, Shuffle, X } from 'lucide-react';
import { useRoom } from '@sdk/room';
import { tr, trList, useLang } from '@sdk/i18n';
import type { OptionSpec, Player } from '@sdk/types';
import { Avatar } from '@sdk/ui/Avatar';
import { Button } from '@sdk/ui/Button';
import { GameIcon } from '@sdk/ui/GameIcon';
import { MuteButton, ReactButton } from '@sdk/ui/GameHeader';
import { RulesSheet } from '@sdk/ui/RulesSheet';
import { Sheet } from '@sdk/ui/Sheet';
import { useNet } from '../net/NetContext';
import { games, getGame } from '../../games/registry';
import { sfx } from '../audio/sfx';
import { S } from '../strings';
import { QrCode } from '../ui/QrCode';

export function RoomLobby() {
  const room = useRoom();
  const net = useNet();
  const lang = useLang();
  const t = S.use();
  const [rules, setRules] = useState(false);
  const [switching, setSwitching] = useState(false);
  const { meta } = room;
  const need = Math.max(0, meta.players.min - room.players.length);

  useEffect(() => {
    void getGame(meta.id)?.preload?.();
  }, [meta.id]);

  return (
    <div className="h-full flex flex-col w-full max-w-md sm:max-w-xl mx-auto">
      <header className="px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 flex items-center gap-2">
        <button onClick={() => { sfx.undo(); room.leave(); }} className="p-2 -ml-1 rounded-xl text-ink-soft active:bg-ink/10" aria-label={t.leaveRoom}>
          <ArrowLeft size={20} />
        </button>
        <button onClick={() => setRules(true)} className="flex items-center gap-2 min-w-0 flex-1 text-left">
          <GameIcon meta={meta} size={36} />
          <span className="min-w-0">
            <span className="block font-black leading-tight truncate">{tr(meta.name, lang)}</span>
            <span className="block text-[11px] text-ink-soft underline underline-offset-2">{t.howToPlay}</span>
          </span>
        </button>
        <ReactButton />
        <MuteButton />
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 flex flex-col gap-3">
        {room.local ? (
          <div className="rounded-3xl bg-ink/[.04] px-4 py-3 text-sm flex items-center gap-2">
            <Bot size={16} /> {t.playBots}
          </div>
        ) : (
          <CodeCard />
        )}
        <Seats />
        {(meta.options?.length ?? 0) > 0 && <Options specs={meta.options!} />}
        {room.isHost && (
          <Button variant="ghost" onClick={() => setSwitching(true)}>
            <Shuffle size={16} /> {t.changeGame}
          </Button>
        )}
        <div className="rounded-3xl bg-ink/[.03] p-4 text-sm text-ink-soft leading-relaxed">
          {trList(meta.howto, lang).slice(0, 3).map((h, i) => (
            <div key={i}>• {h}</div>
          ))}
        </div>
      </main>

      <footer className="px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] border-t-2 border-ink/5 bg-paper/60 backdrop-blur">
        {room.isHost ? (
          <>
            <Button size="lg" className="w-full" disabled={need > 0} onClick={() => net.host.start()}>
              {t.startGame}
            </Button>
            {need > 0 && <div className="text-xs text-ink-soft text-center mt-2">{t.needPlayers(need)}</div>}
          </>
        ) : (
          <div className="text-center text-sm text-ink-soft py-3 flex items-center justify-center gap-2">
            <motion.span animate={{ rotate: [0, -10, 10, 0] }} transition={{ repeat: Infinity, duration: 1.6 }}>
              ⏳
            </motion.span>
            {t.waitingHost(room.host.name)}
          </div>
        )}
      </footer>

      <AnimatePresence>
        {rules && <RulesSheet meta={meta} onClose={() => setRules(false)} />}
        {switching && (
          <Sheet title={t.changeGame} onClose={() => setSwitching(false)}>
            <div className="grid grid-cols-2 gap-2">
              {games.map(({ meta: m }) => (
                <button
                  key={m.id}
                  onClick={() => {
                    sfx.pop();
                    setSwitching(false);
                    net.host.switchGame(m);
                  }}
                  onPointerEnter={() => void getGame(m.id)?.preload?.()}
                  className={`flex items-center gap-2 p-2 rounded-2xl border-2 text-left active:scale-[0.97] transition ${m.id === meta.id ? 'ring-2 ring-ink' : ''}`}
                  style={{ background: `hsl(${m.hue} 75% 94%)`, borderColor: `hsl(${m.hue} 50% 84%)` }}
                >
                  <GameIcon meta={m} size={36} />
                  <span className="min-w-0">
                    <span className="block font-bold text-sm leading-tight truncate">{tr(m.name, lang)}</span>
                    <span className="block text-[11px] text-ink-soft">{t.playersRange(m.players.min, m.players.max)}</span>
                  </span>
                </button>
              ))}
            </div>
          </Sheet>
        )}
      </AnimatePresence>
    </div>
  );
}

function CodeCard() {
  const room = useRoom();
  const net = useNet();
  const t = S.use();
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState(false);
  const [lan, setLan] = useState<string[]>([]);
  const [pick, setPick] = useState(0);
  const link = `${location.origin}/?r=${room.code}`;
  const isLoopback = /^(localhost|127\.|\[::1\])/.test(location.hostname);
  useEffect(() => {
    if (!isLoopback) return;
    fetch('/api/info')
      .then((r) => r.json())
      .then((i: { ips: { address: string }[] }) => setLan(i.ips.map((ip) => `${location.protocol}//${ip.address}:${location.port || 80}/?r=${room.code}`)))
      .catch(() => {});
  }, [isLoopback, room.code]);
  const shareUrl = isLoopback && lan[pick] ? lan[pick] : link;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      window.prompt(t.copyLink, shareUrl);
    }
    sfx.pop();
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  const share = () => navigator.share?.({ title: t.appName, text: `${t.inviteFriends}: ${room.code}`, url: shareUrl }).catch(() => {});

  return (
    <section className="rounded-[1.75rem] bg-paper border-2 border-ink/10 shadow-[0_10px_30px_-18px_rgba(35,33,46,.45)] p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-ink-soft">{t.roomCode}</div>
        {room.isHost ? (
          <button onClick={() => net.host.update({ public: !room.public })} className="text-xs flex items-center gap-1 px-2 py-0.5 rounded-full bg-ink/5 active:bg-ink/10">
            {room.public ? <><Globe size={12} /> {t.publicRoomShort}</> : <><Lock size={12} /> {t.privateRoom}</>}
          </button>
        ) : (
          <span className="text-xs text-ink-soft flex items-center gap-1">{room.public ? <><Globe size={12} /> {t.publicRoomShort}</> : <><Lock size={12} /> {t.privateRoom}</>}</span>
        )}
      </div>
      <div className="flex justify-center gap-2 my-2 select-text" aria-label={room.code}>
        {room.code.split('').map((c, i) => (
          <motion.span
            key={i}
            initial={{ y: -12, opacity: 0, rotate: -8 }}
            animate={{ y: 0, opacity: 1, rotate: i % 2 ? 2 : -2 }}
            transition={{ delay: i * 0.06, type: 'spring', stiffness: 500, damping: 18 }}
            className="w-14 h-16 rounded-2xl bg-white border-2 border-ink/15 shadow-[0_4px_0_rgba(35,33,46,.12)] flex items-center justify-center text-4xl font-black"
          >
            {c}
          </motion.span>
        ))}
      </div>
      <div className="flex gap-2 mt-3">
        <Button variant="ghost" size="sm" className="flex-1" onClick={() => void copy()}>
          {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? t.copied : t.copyLink}
        </Button>
        {typeof navigator.share === 'function' && (
          <Button variant="ghost" size="sm" onClick={share} aria-label={t.share}>
            <Share2 size={15} />
          </Button>
        )}
        <Button variant={qr ? 'primary' : 'ghost'} size="sm" onClick={() => setQr((q) => !q)} aria-label="QR">
          <QrIcon size={15} />
        </Button>
      </div>
      <AnimatePresence>
        {qr && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="flex items-center gap-3 pt-3">
              <QrCode text={shareUrl} size={120} />
              <div className="text-xs text-ink-soft break-all font-mono select-text">{shareUrl}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {isLoopback && lan.length > 0 && (
        <div className="mt-2 text-[11px] text-ink-soft">
          {t.lanLink}: <span className="font-mono select-text break-all">{lan[pick] ?? lan[0]}</span>
          {lan.length > 1 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {lan.map((u, i) => (
                <button key={u} onClick={() => setPick(i)} className={`px-2 py-0.5 rounded-full border font-mono ${i === pick ? 'bg-ink text-paper border-ink' : 'border-ink/15'}`}>
                  {new URL(u).hostname}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Seats() {
  const room = useRoom();
  const net = useNet();
  const t = S.use();
  const empty = Math.max(0, room.meta.players.max - room.players.length);
  return (
    <section className="rounded-3xl border-2 border-ink/10 p-3">
      <div className="text-sm font-bold px-1 mb-2">{t.seats(room.players.length, room.meta.players.max)}</div>
      <div className="flex flex-col gap-1.5">
        <AnimatePresence initial={false}>
          {room.players.map((p) => (
            <SeatRow key={p.id} p={p} />
          ))}
        </AnimatePresence>
        {room.isHost && empty > 0 && (
          <button onClick={() => { sfx.pop(); net.host.addBot(); }} className="flex items-center gap-3 p-2 rounded-2xl border-2 border-dashed border-ink/15 text-ink-soft active:bg-ink/5">
            <span className="w-9 h-9 rounded-full bg-ink/5 flex items-center justify-center"><Plus size={18} /></span>
            <span className="text-sm font-bold flex-1 text-left">{t.addBot}</span>
            <span className="text-xs">{empty} {t.waitingSeat}</span>
          </button>
        )}
        {!room.isHost && empty > 0 && (
          <div className="flex items-center gap-3 p-2 rounded-2xl border-2 border-dashed border-ink/10 text-ink-soft/70 text-sm">
            <span className="w-9 h-9 rounded-full bg-ink/5" />
            {empty} {t.waitingSeat}
          </div>
        )}
        {room.spectators.map((p) => (
          <div key={p.id} className="flex items-center gap-3 p-2 text-sm text-ink-soft">
            <Avatar emoji={p.avatar} name={p.name} size={30} dim />
            <span className="flex-1 truncate">{p.name}</span>
            <Eye size={14} /> {t.spectating}
          </div>
        ))}
      </div>
    </section>
  );
}

function SeatRow({ p }: { p: Player }) {
  const room = useRoom();
  const net = useNet();
  const t = S.use();
  const [confirmKick, setConfirmKick] = useState(false);
  useEffect(() => {
    if (!confirmKick) return;
    const id = window.setTimeout(() => setConfirmKick(false), 3000);
    return () => window.clearTimeout(id);
  }, [confirmKick]);
  const small = 'p-1.5 rounded-xl active:bg-ink/10 text-ink-soft';
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12 }}
      className={`flex items-center gap-3 p-2 rounded-2xl ${p.isMe ? 'bg-ink/[.05]' : ''}`}
    >
      <Avatar emoji={p.avatar} name={p.name} size={36} ring={p.color} bot={p.bot} online={p.bot ? undefined : p.online} />
      <div className="flex-1 min-w-0">
        <div className="font-bold truncate flex items-center gap-1.5">
          {p.name}
          {p.isMe && <span className="text-[10px] font-normal text-ink-soft">({t.you})</span>}
          {p.isHost && <Crown size={14} className="text-[#d49b00] shrink-0" aria-label={t.host} />}
        </div>
        {p.bot && (
          <div className="flex gap-1 mt-0.5">
            {t.levels.map((l, i) => (
              <button
                key={l}
                disabled={!room.isHost}
                onClick={() => net.host.botLevel(p.id, i as 0 | 1 | 2)}
                className={`text-[10px] px-1.5 rounded-full ${p.level === i ? 'bg-ink text-paper' : room.isHost ? 'bg-ink/5 text-ink-soft' : 'hidden'}`}
              >
                {l}
              </button>
            ))}
          </div>
        )}
      </div>
      {room.isHost && !p.isMe && (
        <div className="flex items-center gap-0.5">
          {!p.bot && !room.local && p.online && (
            <IconBtn title={t.makeHost} onClick={() => net.host.makeHost(p.id)} className={small}>
              <Crown size={16} />
            </IconBtn>
          )}
          {p.bot ? (
            <IconBtn title={t.removeBot} onClick={() => { sfx.undo(); net.host.removeBot(p.id); }} className={small}>
              <X size={17} />
            </IconBtn>
          ) : confirmKick ? (
            <button onClick={() => net.host.kick(p.id)} className="px-2 py-1 rounded-xl bg-accent text-white text-xs font-bold">
              {t.kick}?
            </button>
          ) : (
            <IconBtn title={t.kick} onClick={() => setConfirmKick(true)} className={small}>
              <X size={17} />
            </IconBtn>
          )}
        </div>
      )}
    </motion.div>
  );
}

function IconBtn({ title, onClick, className, children }: { title: string; onClick: () => void; className: string; children: ReactNode }) {
  return (
    <button title={title} aria-label={title} onClick={onClick} className={className}>
      {children}
    </button>
  );
}

function Options({ specs }: { specs: OptionSpec[] }) {
  const room = useRoom();
  const net = useNet();
  const lang = useLang();
  const t = S.use();
  const set = (key: string, value: unknown) => {
    sfx.tap();
    net.host.update({ options: { ...room.options, [key]: value } });
  };
  return (
    <section className="rounded-3xl border-2 border-ink/10 p-4">
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-sm font-bold">{t.options}</div>
        {!room.isHost && <div className="text-[11px] text-ink-soft">{t.hostSets}</div>}
      </div>
      <div className="flex flex-col gap-3">
        {specs.map((o) => {
          const cur = room.options[o.key] ?? o.default;
          return (
            <div key={o.key} className="flex flex-col gap-1.5">
              <div className="text-sm">{tr(o.label, lang)}</div>
              {o.type === 'select' ? (
                <div className="flex flex-wrap gap-1">
                  {o.choices.map((c) => (
                    <button
                      key={String(c.value)}
                      disabled={!room.isHost}
                      onClick={() => set(o.key, c.value)}
                      className={`px-3 py-1 rounded-full text-sm font-bold transition ${cur === c.value ? 'bg-ink text-paper' : 'bg-ink/5 text-ink-soft'} ${!room.isHost && cur !== c.value ? 'opacity-50' : ''}`}
                    >
                      {tr(c.label, lang)}
                    </button>
                  ))}
                </div>
              ) : (
                <button
                  disabled={!room.isHost}
                  onClick={() => set(o.key, !cur)}
                  role="switch"
                  aria-checked={!!cur}
                  className={`w-12 h-7 rounded-full p-0.5 transition-colors ${cur ? 'bg-accent-2' : 'bg-ink/20'} ${!room.isHost ? 'opacity-60' : ''}`}
                >
                  <motion.span layout transition={{ type: 'spring', stiffness: 600, damping: 35 }} className={`block w-6 h-6 rounded-full bg-white shadow ${cur ? 'ml-auto' : ''}`} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
