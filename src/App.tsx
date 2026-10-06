import { Suspense, useEffect } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { DoorOpen, Eye } from 'lucide-react';
import { RoomProvider, useRoom } from '@sdk/room';
import { tr, useLang } from '@sdk/i18n';
import type { GameModule } from '@sdk/types';
import { Avatar } from '@sdk/ui/Avatar';
import { Button } from '@sdk/ui/Button';
import { GameIcon } from '@sdk/ui/GameIcon';
import { ReactionLayer } from '@sdk/ui/Reactions';
import { NetProvider, useNet } from './platform/net/NetContext';
import { NameGate } from './platform/lobby/NameGate';
import { Lobby } from './platform/lobby/Lobby';
import { RoomLobby } from './platform/lobby/RoomLobby';
import { Overlays } from './platform/ui/Overlays';
import { ErrorBoundary } from './platform/ui/ErrorBoundary';
import { usePrefs } from './platform/prefs';
import { keepAwake } from './platform/pwa';
import { S } from './platform/strings';
import { getGame } from './games/registry';
import './platform/motion';

export default function App() {
  const prefs = usePrefs();
  return (
    <MotionConfig reducedMotion={prefs.calm ? 'always' : 'user'}>
      <ErrorBoundary onLeave={() => location.reload()}>
        <NetProvider>
          <Shell />
          <Overlays />
        </NetProvider>
      </ErrorBoundary>
    </MotionConfig>
  );
}

const fade = {
  initial: { opacity: 0, y: 14, scale: 0.985 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -10, scale: 0.985 },
  transition: { duration: 0.22, ease: 'easeOut' as const },
};

function Shell() {
  const net = useNet();
  const t = S.use();
  if (!net.name) return <NameGate onSubmit={net.setName} />;
  const room = net.room;
  const mod = room ? getGame(room.gameId) : undefined;
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={room ? `room:${room.code}` : 'lobby'} className="h-full" {...fade}>
        {!room ? (
          <Lobby />
        ) : !mod ? (
          <div className="h-full flex flex-col items-center justify-center gap-4 p-6 text-center">
            <div>{t.gameNotFound(room.gameId)}</div>
            <Button onClick={net.leaveRoom}>{t.leaveRoom}</Button>
          </div>
        ) : (
          <RoomProvider room={room} mod={mod}>
            <RoomStage mod={mod} />
            <ReactionLayer />
          </RoomProvider>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

/** Waiting room ↔ game. Every round is a fresh mount of the game component. */
function RoomStage({ mod }: { mod: GameModule }) {
  const room = useRoom();
  const net = useNet();
  const playing = room.status === 'playing';
  const watchOnly = room.isSpectator && !mod.meta.spectators;
  useWakeLock(playing);
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={playing ? `game:${room.gameId}:${room.round}` : 'waiting'} className="h-full" {...fade}>
        {!playing ? (
          <RoomLobby />
        ) : watchOnly ? (
          <InProgress mod={mod} />
        ) : (
          <ErrorBoundary onLeave={() => (room.isHost ? room.backToRoom() : net.leaveRoom())}>
            <Suspense fallback={<GameLoading mod={mod} />}>
              <mod.Game />
            </Suspense>
          </ErrorBoundary>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function GameLoading({ mod }: { mod: GameModule }) {
  const lang = useLang();
  const t = S.use();
  return (
    <div className="h-full flex flex-col items-center justify-center gap-3">
      <motion.div animate={{ y: [0, -10, 0], rotate: [0, -6, 6, 0] }} transition={{ repeat: Infinity, duration: 0.9 }}>
        <GameIcon meta={mod.meta} size={64} />
      </motion.div>
      <div className="text-sm text-ink-soft">{t.loading(tr(mod.meta.name, lang))}</div>
    </div>
  );
}

/** Joined mid-game and this game has no spectator mode. */
function InProgress({ mod }: { mod: GameModule }) {
  const room = useRoom();
  const lang = useLang();
  const t = S.use();
  return (
    <div className="h-full flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-paper rounded-[2rem] border-2 border-ink/10 shadow-xl p-6 text-center">
        <GameIcon meta={mod.meta} size={56} className="mx-auto" />
        <div className="text-xl font-black mt-3">{tr(mod.meta.name, lang)}</div>
        <div className="mt-1 font-bold flex items-center justify-center gap-1.5">
          <Eye size={16} /> {t.gameInProgress}
        </div>
        <div className="text-sm text-ink-soft mt-1">{t.gameInProgressHint}</div>
        <div className="flex flex-wrap justify-center gap-2 mt-4">
          {room.players.map((p) => (
            <Avatar key={p.id} emoji={p.avatar} name={p.name} size={36} ring={p.color} bot={p.bot} />
          ))}
        </div>
        <Button variant="ghost" className="w-full mt-5" onClick={room.leave}>
          <DoorOpen size={16} /> {t.leaveRoom}
        </Button>
      </div>
    </div>
  );
}

/** Keep the screen awake while a game runs (https / localhost only). */
function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on) return;
    let lock: { release: () => Promise<void> } | null = null;
    let alive = true;
    const grab = async () => {
      const l = await keepAwake();
      if (alive) lock = l;
      else void l?.release();
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') void grab();
    };
    void grab();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVis);
      void lock?.release().catch(() => {});
    };
  }, [on]);
}
