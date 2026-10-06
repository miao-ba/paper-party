// Global layers: toasts, "reconnecting" strip, "new version" pill, and room event toasts
// (someone joined / left, new host, game switched).
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { RefreshCw, WifiOff, X } from 'lucide-react';
import { useNet } from '../net/NetContext';
import { clientId } from '../net/socket';
import { getGame } from '../../games/registry';
import { tr } from '@sdk/i18n';
import { pushRecent } from '../prefs';
import { sfx } from '../audio/sfx';
import { haptic } from '../audio/haptic';
import { S } from '../strings';
import type { RoomView } from '../../../shared/protocol';

export function Overlays() {
  useRoomEvents();
  return (
    <>
      <Toasts />
      <ConnectionBanner />
      <UpdateBanner />
    </>
  );
}

function useRoomEvents() {
  const net = useNet();
  const prev = useRef<RoomView | null>(null);
  useEffect(() => {
    const r = net.room;
    const p = prev.current;
    prev.current = r;
    if (!r) return;
    const t = S.get();
    if (r.status === 'playing' && (p?.code !== r.code || p.status !== 'playing' || p.round !== r.round)) {
      pushRecent(r.gameId);
      sfx.start();
    }
    if (!p || p.code !== r.code || r.local) return;
    const before = new Map(p.players.map((x) => [x.id, x]));
    const now = new Set(r.players.map((x) => x.id));
    for (const x of r.players) {
      if (!before.has(x.id) && !x.bot && x.id !== clientId) {
        net.flash(t.joined(x.name), { icon: '👋', tone: 'good' });
        sfx.invite();
        haptic('light');
      }
    }
    for (const x of p.players) if (!now.has(x.id) && !x.bot && x.id !== clientId) net.flash(t.left(x.name), { icon: '🚪' });
    if (p.hostId !== r.hostId) {
      if (r.hostId === clientId) net.flash(t.nowHost, { icon: '👑', tone: 'good' });
      else net.flash(t.newHost(r.players.find((x) => x.id === r.hostId)?.name ?? '?'), { icon: '👑' });
    }
    if (p.gameId !== r.gameId && r.hostId !== clientId) {
      const g = getGame(r.gameId);
      net.flash(t.switched(g ? tr(g.meta.name) : r.gameId), { icon: '🔀' });
    }
  }, [net.room]); // eslint-disable-line react-hooks/exhaustive-deps
  useTitleFlash(net.room && !net.room.local && net.room.status === 'waiting' ? net.room.players.length : null);
}

/** Background tab + someone joined your room: blink the tab title. */
function useTitleFlash(count: number | null) {
  const base = useRef(document.title);
  const last = useRef(count);
  useEffect(() => {
    const prev = last.current;
    last.current = count;
    if (count === null || prev === null || count <= prev || document.visibilityState === 'visible') return;
    const t = S.get();
    let on = false;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        document.title = base.current;
        window.clearInterval(id);
        return;
      }
      on = !on;
      document.title = on ? `👋 ${t.appName}` : base.current;
    }, 900);
    return () => {
      window.clearInterval(id);
      document.title = base.current;
    };
  }, [count]);
}

function Toasts() {
  const net = useNet();
  return (
    <div className="fixed top-[max(0.75rem,env(safe-area-inset-top))] inset-x-0 z-[55] flex flex-col items-center gap-2 pointer-events-none px-4">
      <AnimatePresence initial={false}>
        {net.toasts.map((t) => (
          <motion.button
            layout
            key={t.id}
            initial={{ y: -24, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -16, opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 500, damping: 32 }}
            onClick={() => net.dismissToast(t.id)}
            className={`pointer-events-auto max-w-full px-4 py-2 rounded-full text-sm shadow-lg flex items-center gap-2 ${
              t.tone === 'good' ? 'bg-accent-2 text-white' : t.tone === 'warn' ? 'bg-gold text-ink' : 'bg-ink text-paper'
            }`}
          >
            {t.icon && <span className="text-base leading-none">{t.icon}</span>}
            <span className="truncate">{t.text}</span>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}

function ConnectionBanner() {
  const net = useNet();
  const t = S.use();
  const show = net.everConnected && !net.connected && !net.room?.local;
  return (
    <AnimatePresence>
      {show && (
        <motion.div initial={{ y: -40 }} animate={{ y: 0 }} exit={{ y: -40 }} className="fixed top-0 inset-x-0 z-[56] flex justify-center pointer-events-none pt-[env(safe-area-inset-top)]">
          <div className="mt-1 px-3 py-1 rounded-full bg-accent text-white text-xs font-bold flex items-center gap-1.5 shadow-lg">
            <WifiOff size={13} /> {t.disconnected}
            <motion.span animate={{ opacity: [1, 0.2, 1] }} transition={{ repeat: Infinity, duration: 1 }}>
              …
            </motion.span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** A new build is on the server: offer a reload (only outside games). */
function UpdateBanner() {
  const net = useNet();
  const t = S.use();
  const [fresh, setFresh] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (__BUILD__ === 'dev') return;
    const check = () => {
      fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((v: { build?: string } | null) => {
          if (v?.build && v.build !== __BUILD__) setFresh(v.build);
        })
        .catch(() => {});
    };
    check();
    const id = window.setInterval(check, 5 * 60_000);
    const onVis = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [net.connected]);
  const show = !!fresh && !hidden && net.room?.status !== 'playing';
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-[45] flex items-center gap-1 bg-gold text-ink rounded-full shadow-xl pl-4 pr-1 py-1"
        >
          <button onClick={() => location.reload()} className="flex items-center gap-2 text-sm font-bold py-1.5 whitespace-nowrap">
            <RefreshCw size={15} /> {t.updateReady}
          </button>
          <button onClick={() => setHidden(true)} className="p-1.5 rounded-full active:bg-ink/10" aria-label="later">
            <X size={15} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
