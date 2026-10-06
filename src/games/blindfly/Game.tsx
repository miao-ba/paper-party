import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, ChevronUp, Mic, MicOff, RotateCcw, Trophy } from 'lucide-react';
import { useMessage, Button, Countdown, OfflineBanner as PeerOffline, celebrate, sfx, haptic } from '@sdk';
import { useDuo as useRoom, DuoHeader as GameHeader, PlayerTag } from '@sdk/duo';
import { other, type Side } from '../shared/layout';
import { useMic, type MicStatus } from '../shared/mic';
import { DEFAULT_CONFIG, FOG_LABEL, isDual, SWAP_OPTIONS, flap, newBird, pilotFor, step, type Bird, type Config, type Fog } from './logic';
import { drawFpv, drawSide } from './render';

type Phase = 'lobby' | 'count' | 'fly' | 'over';
/** 單駕駛只有一台鳥 'S'；雙駕駛各一台，用 side 當 id */
export type BirdId = 'S' | Side;
type Birds = Partial<Record<BirdId, Bird>>;
export type Msg =
  | { t: 'f:config'; config: Config }
  | { t: 'f:start'; seed: string; config: Config }
  | { t: 'f:bird'; id: BirdId; bird: Bird }
  | { t: 'f:flap'; id: BirdId }
  | { t: 'f:alert'; dir: 'up' | 'down' }
  | { t: 'f:sync:req' };

const COUNT_MS = 2400;
const NET_MS = 50;
const ALERT_MS = 700;

export default function Game() {
  const { me, peer, isHost, send, leave, solo, report } = useRoom();
  const mySide = me.side;
  const names: Record<Side, string> = { [mySide]: me.name, [peer.side]: peer.name } as Record<Side, string>;

  const [phase, setPhase] = useState<Phase>('lobby');
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [seed, setSeed] = useState('');
  const [, tick] = useState(0); // 每幀 re-render 給分數/角色用（便宜，DOM 很少）
  const [banner, setBanner] = useState<string | null>(null);
  /** 合作模式的最佳紀錄（每種霧分開記，存在這台裝置） */
  const [best, setBest] = useState<{ prev: number; now: number } | null>(null);
  const mic = useMic();
  const micRef = useRef(mic);
  micRef.current = mic;

  const phaseRef = useRef<Phase>('lobby');
  phaseRef.current = phase;
  const configRef = useRef(config);
  configRef.current = config;
  const seedRef = useRef('');
  seedRef.current = seed;
  const birds = useRef<Birds>({});
  const alerts = useRef({ up: 0, down: 0 });
  const lastNet = useRef(0);
  const lastPilot = useRef<Side | null>(null);
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  // dev 測試用：window.__fly.birds / seed / flap()
  if (import.meta.env.DEV) (window as any).__fly = { get birds() { return birds.current; }, get seed() { return seedRef.current; }, flap: () => onFlap() };

  // ---- 角色 ----
  const soloBird = birds.current.S;
  const pilot: Side | null = isDual(config) ? null : pilotFor(config, soloBird?.score ?? 0);
  const iControl = (id: BirdId) => (id === 'S' ? pilotFor(configRef.current, birds.current.S?.score ?? 0) === mySide : id === mySide);
  const myIds = (): BirdId[] => (isDual(configRef.current) ? [mySide] : ['S']);
  const iAmPilot = isDual(config) || pilot === mySide;

  // ---- 開始 / 結束 ----
  const startRound = (s: string, c: Config) => {
    setSeed(s); seedRef.current = s;
    setConfig(c); configRef.current = c;
    birds.current = isDual(c) ? { L: newBird(), R: newBird() } : { S: newBird() };
    alerts.current = { up: 0, down: 0 };
    lastPilot.current = isDual(c) ? null : c.pilot;
    setBanner(null);
    if (c.voice && micRef.current.status === 'off') void micRef.current.start();
    setPhase('count'); phaseRef.current = 'count';
    sfx.start();
    setBest(null);
    later(() => { setPhase('fly'); phaseRef.current = 'fly'; sfx.go(); haptic('medium'); }, COUNT_MS);
  };
  const hostStart = () => {
    const c = configRef.current;
    const s = Math.random().toString(36).slice(2, 10);
    send({ t: 'f:start', seed: s, config: c } satisfies Msg);
    startRound(s, c);
  };
  const rematch = () => {
    // 單駕駛下一局換人先開
    const c = configRef.current;
    const next = isDual(c) ? c : { ...c, pilot: other(c.pilot) };
    setConfig(next); configRef.current = next;
    hostStart();
  };
  const finishIfOver = () => {
    const b = birds.current;
    const over = isDual(configRef.current) ? b.L && b.R && !b.L.alive && !b.R.alive : b.S && !b.S.alive;
    if (over && phaseRef.current === 'fly') {
      setPhase('over'); phaseRef.current = 'over';
      const won = winner();
      const c = configRef.current;
      if (isDual(c)) report({ winner: won ?? 'draw', score: `${b.L?.score ?? 0}:${b.R?.score ?? 0} 根` });
      else if (b.S) report({ winner: null, score: `${b.S.score} 根`, value: b.S.score });
      if (!isDual(c) && b.S) {
        const key = `fly:best:${c.fog}`;
        const prev = Number(localStorage.getItem(key) ?? 0);
        setBest({ prev, now: b.S.score });
        if (b.S.score > prev) {
          localStorage.setItem(key, String(b.S.score));
          if (prev > 0 || b.S.score >= 3) { sfx.win(); celebrate(); return; }
        }
      }
      if (won === mySide) { sfx.win(); celebrate(); } else if (won) sfx.lose(); else if (isDual(c)) sfx.miss(); else sfx.lose();
    }
  };
  const winner = (): Side | null => {
    const b = birds.current;
    if (!isDual(configRef.current) || !b.L || !b.R) return null;
    return b.L.score === b.R.score ? null : b.L.score > b.R.score ? 'L' : 'R';
  };

  // ---- 模擬迴圈 ----
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (phaseRef.current !== 'fly') return;
      const s = seedRef.current;
      const b = birds.current;
      for (const id of Object.keys(b) as BirdId[]) {
        const cur = b[id]!;
        if (!cur.alive) continue;
        if (iControl(id)) {
          // 聲控：把目前麥克風音量當升力塞進鳥再算（沒麥克風就退回拍翅膀）
          const src = voiceOn() ? { ...cur, lift: micRef.current.level.current } : cur;
          const next = step(src, dt, s);
          b[id] = next;
          if (next.score !== cur.score) { sfx.score(); }
          if (!next.alive) { sfx.crash(); haptic('heavy'); send({ t: 'f:bird', id, bird: next } satisfies Msg); }
        } else {
          // 不是我開的：本地照樣推算讓畫面順，但生死聽對方的
          b[id] = { ...step(cur, dt, s), alive: true };
        }
      }
      // 換手偵測（單駕駛）
      if (!isDual(configRef.current) && b.S) {
        const p = pilotFor(configRef.current, b.S.score);
        if (lastPilot.current && p !== lastPilot.current) {
          lastPilot.current = p;
          setBanner(p === mySide ? '換手！你開' : `換手！${names[p]} 開`);
          sfx.swap(); haptic('double');
          later(() => setBanner(null), 1400);
        }
      }
      if (now - lastNet.current >= NET_MS) {
        lastNet.current = now;
        for (const id of myIds()) if (b[id]?.alive) send({ t: 'f:bird', id, bird: b[id]! } satisfies Msg);
      }
      finishIfOver();
      tick((n) => n + 1);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- 收訊息 ----
  useMessage<Msg>((m) => {
    switch (m.t) {
      case 'f:config': setConfig(m.config); break;
      case 'f:start': startRound(m.seed, m.config); break;
      case 'f:bird':
        if (phaseRef.current !== 'fly' || iControl(m.id)) return;
        birds.current[m.id] = m.bird;
        if (!m.bird.alive) { sfx.crash(); finishIfOver(); }
        break;
      case 'f:flap':
        if (phaseRef.current === 'fly' && !iControl(m.id) && birds.current[m.id]) birds.current[m.id] = flap(birds.current[m.id]!);
        break;
      case 'f:alert':
        alerts.current[m.dir] = performance.now();
        sfx.poke(); haptic('light');
        break;
      case 'f:sync:req':
        if (isHost) send({ t: 'f:config', config: configRef.current } satisfies Msg);
        break;
    }
  });
  useEffect(() => { if (!isHost) send({ t: 'f:sync:req' } satisfies Msg); }, [isHost, send]);

  const patchConfig = (p: Partial<Config>) => {
    const c = { ...configRef.current, ...p };
    setConfig(c); configRef.current = c;
    send({ t: 'f:config', config: c } satisfies Msg);
  };

  // ---- 操作 ----
  const voiceOn = () => configRef.current.voice && micRef.current.status === 'on';
  const onFlap = () => {
    if (phaseRef.current !== 'fly' || voiceOn()) return;
    for (const id of myIds()) {
      const b = birds.current[id];
      if (!b?.alive || !iControl(id)) continue;
      birds.current[id] = flap(b);
      send({ t: 'f:flap', id } satisfies Msg);
    }
    sfx.flap(); haptic('light');
  };
  const lastAlert = useRef(0);
  const sendAlert = (dir: 'up' | 'down') => {
    const now = performance.now();
    if (now - lastAlert.current < 220) return;
    lastAlert.current = now;
    send({ t: 'f:alert', dir } satisfies Msg);
    sfx.pokeSent(); haptic('light');
  };
  // 鍵盤：空白鍵 / W 拍翅膀；塔台用 ↑ ↓ 按警示
  const keysRef = useRef({ onFlap, sendAlert, alertKeys: false });
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat || phaseRef.current !== 'fly') return;
      const k = e.key;
      if (k === ' ' || k === 'w' || k === 'W') { e.preventDefault(); keysRef.current.onFlap(); }
      else if (k === 'ArrowUp') { e.preventDefault(); if (keysRef.current.alertKeys) keysRef.current.sendAlert('up'); else keysRef.current.onFlap(); }
      else if (k === 'ArrowDown' && keysRef.current.alertKeys) { e.preventDefault(); keysRef.current.sendAlert('down'); }
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, []);

  // ---- 畫面 ----
  const myFpvBird = (): Bird | undefined => (isDual(config) ? birds.current[mySide] : birds.current.S);
  const sideBird = (): Bird | undefined => (isDual(config) ? birds.current[peer.side] : birds.current.S);
  const fpvColor: Side = isDual(config) ? mySide : pilot ?? 'L';
  const sideColor: Side = isDual(config) ? peer.side : pilot ?? 'L';
  const alertA = (k: 'up' | 'down') => Math.max(0, 1 - (performance.now() - alerts.current[k]) / ALERT_MS);
  const score = isDual(config) ? `${birds.current[mySide]?.score ?? 0} : ${birds.current[peer.side]?.score ?? 0}` : `${soloBird?.score ?? 0}`;
  const race = config.mode === 'race';
  const showAlertBtns = config.alert && !race && (isDual(config) || !iAmPilot);
  const showPeerStrip = config.mode === 'dual';
  const showFpv = iAmPilot && !(race && config.raceView === 'side');
  const showMicMeter = iAmPilot && config.voice && (phase === 'count' || phase === 'fly');
  keysRef.current = { onFlap, sendAlert, alertKeys: showAlertBtns };

  return (
    <div className="h-full flex flex-col">
      <GameHeader
        left={<PlayerTag side={mySide} name={me.name}><Role text={roleText(config, phase, mySide, pilot)} /></PlayerTag>}
        center={modeText(config)}
        right={<PlayerTag side={peer.side} name={peer.name}><Role text={roleText(config, phase, peer.side, pilot)} /></PlayerTag>}
      />
      <PeerOffline />

      <div className="flex-1 min-h-0 flex flex-col short:flex-row">
      <div className="flex-1 min-h-0 min-w-0 mx-3 mb-2 flex flex-col gap-2">
        {phase === 'lobby' ? (
          <LobbyPanel config={config} isHost={isHost} names={names} onPatch={patchConfig} hostName={names.L} mic={mic} solo={solo} />
        ) : (
          <>
            {/* 雙駕駛：上面一小條對方的側視角 */}
            {showPeerStrip && (
              <div className="h-[28%] rounded-2xl overflow-hidden shadow-inner border-2 border-ink/10 relative">
                <Canvas draw={(ctx, W, H, t) => { const b = sideBird(); if (b) drawSide(ctx, W, H, b, seedRef.current, { fog: config.fog, color: sideColor, t }); }} />
                <div className="absolute top-1.5 left-2 text-[11px] font-bold text-ink/70 bg-paper/70 rounded-full px-2">{peer.name} 的鳥</div>
              </div>
            )}
            <div
              className="flex-1 min-h-0 rounded-3xl overflow-hidden relative select-none touch-none shadow-[0_18px_40px_-16px_rgba(35,33,46,.5)]"
              onPointerDown={iAmPilot ? onFlap : undefined}
            >
              {showFpv ? (
                <Canvas draw={(ctx, W, H, t) => { const b = myFpvBird(); if (b) drawFpv(ctx, W, H, b, seedRef.current, { fog: config.fog, color: fpvColor, alertUp: alertA('up'), alertDown: alertA('down'), t }); }} />
              ) : (
                <Canvas draw={(ctx, W, H, t) => { const b = race ? myFpvBird() : sideBird(); if (b) drawSide(ctx, W, H, b, seedRef.current, { fog: race ? 'far' : config.fog, color: race ? mySide : sideColor, t, showFog: !race, ghost: race && birds.current[peer.side] ? { bird: birds.current[peer.side]!, color: peer.side } : undefined }); }} />
              )}
              {showMicMeter && <MicMeter status={mic.status} level={mic.level.current} />}
              {(phase === 'fly' || phase === 'over') && (
                <motion.div key={score} initial={{ scale: 1.5 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 600, damping: 15 }} className="absolute top-2 inset-x-0 mx-auto w-max px-3 py-0.5 rounded-full bg-paper/80 text-xl font-black tabular-nums text-ink pointer-events-none">
                  {score}
                </motion.div>
              )}
              <AnimatePresence>
                {phase === 'count' && (
                  <motion.div key="count" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <Countdown ms={COUNT_MS} go="飛！" />
                    <div className="text-sm text-ink/70 bg-paper/80 rounded-full px-3 py-1 mt-2">
                      {race ? '各飛各的，撐比較久的贏' : isDual(config) ? '兩台一起飛，看得到對方、按得到警示' : iAmPilot ? (config.voice ? '你開。大聲往上、安靜就掉' : solo ? '你開。電腦會閃上/下提醒你' : '你開。點畫面拍翅膀') : solo ? '電腦開，它只看得到霧裡，用上/下指揮它' : `${names[pilot!]} 開，你報路`}
                    </div>
                  </motion.div>
                )}
                {banner && (
                  <motion.div key={banner} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-x-0 top-[18%] flex justify-center pointer-events-none">
                    <div className="bg-ink text-paper font-black text-2xl px-5 py-2 rounded-2xl rotate-[-3deg] shadow-xl">{banner}</div>
                  </motion.div>
                )}
                {phase === 'over' && (
                  <motion.div key="over" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="bg-paper/90 rounded-3xl px-6 py-4 text-center shadow-xl">
                      <div className="text-4xl">{overEmoji(config, mySide, winner())}</div>
                      <div className="text-xl font-bold mt-1">{overText(config, mySide, winner(), names)}</div>
                      <div className="text-sm text-ink-soft mt-1">{isDual(config) ? `管子 ${score}` : `過了 ${score} 根管子`}</div>
                      {best && (best.now > best.prev && best.prev > 0
                        ? <div className="mt-1 text-sm font-bold text-side-l flex items-center justify-center gap-1"><Trophy size={14} /> 新紀錄！（之前 {best.prev}）</div>
                        : <div className="mt-1 text-xs text-ink-soft">最佳紀錄 {Math.max(best.prev, best.now)}（{FOG_LABEL[config.fog]}霧）</div>)}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </>
        )}
      </div>

      <footer className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] min-h-[84px] flex items-center justify-center gap-3 text-center short:w-48 short:shrink-0 short:pb-3">
        {phase === 'lobby' && !isHost && <div className="text-ink-soft text-sm">等 {names.L} 設定好按開始…</div>}
        {phase === 'lobby' && isHost && <Button size="lg" className="w-full max-w-xs" onClick={hostStart}>起飛 🐤</Button>}
        {(phase === 'count' || phase === 'fly') && !showAlertBtns && (
          <div className="text-ink-soft text-sm">{iAmPilot ? (config.voice ? (mic.status === 'on' ? '對著麥克風出聲，越大聲飛越高' : '麥克風沒開，先用點的') : '點畫面拍翅膀（鍵盤：空白鍵）') : '用嘴巴報路'}</div>
        )}
        {(phase === 'count' || phase === 'fly') && showAlertBtns && (
          <div className="flex gap-3 w-full max-w-sm short:flex-col short:h-full short:py-2">
            <button onPointerDown={() => sendAlert('up')} className="flex-1 py-3 rounded-2xl bg-paper border-2 border-ink/15 font-black text-lg active:bg-side-l active:text-white active:border-side-l flex items-center justify-center gap-1 select-none touch-none"><ChevronUp /> 上</button>
            <button onPointerDown={() => sendAlert('down')} className="flex-1 py-3 rounded-2xl bg-paper border-2 border-ink/15 font-black text-lg active:bg-side-l active:text-white active:border-side-l flex items-center justify-center gap-1 select-none touch-none"><ChevronDown /> 下</button>
          </div>
        )}
        {phase === 'over' && (
          <div className="flex gap-3 w-full max-w-sm short:flex-col">
            <Button variant="ghost" className="flex-1" onClick={leave}>回大廳</Button>
            {isHost ? <Button className="flex-1" onClick={rematch}><RotateCcw size={16} /> 再來</Button> : <div className="flex-1 text-center text-sm text-ink-soft self-center">等 {names.L} 再開…</div>}
          </div>
        )}
      </footer>
      </div>
    </div>
  );
}

function roleText(c: Config, phase: Phase, side: Side, pilot: Side | null) {
  if (phase === 'lobby') return '';
  if (isDual(c)) return '駕駛';
  return pilot === side ? '駕駛' : '塔台';
}
function overEmoji(c: Config, me: Side, w: Side | null) {
  if (!isDual(c)) return '💥';
  return w === me ? '🏆' : w ? '💀' : '🤝';
}
function overText(c: Config, me: Side, w: Side | null, names: Record<Side, string>) {
  if (!isDual(c)) return '墜機';
  return w === me ? '你飛得比較遠' : w ? `${names[w]} 飛得比較遠` : '平手';
}

function Role({ text }: { text: string }) {
  return text ? <span className="text-[10px] px-1.5 rounded-full bg-ink/10">{text}</span> : null;
}
function modeText(c: Config) {
  const m = c.mode === 'solo' ? '合作' : c.mode === 'dual' ? '雙駕駛' : '競技';
  return c.mode === 'race' && c.raceView === 'side' ? m : `${m}・${FOG_LABEL[c.fog]}霧`;
}

function LobbyPanel({ config, isHost, names, onPatch, hostName, mic, solo }: { config: Config; isHost: boolean; names: Record<Side, string>; onPatch: (p: Partial<Config>) => void; hostName: string; mic: ReturnType<typeof useMic>; solo: boolean }) {
  const Chip = ({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) => (
    <button disabled={!isHost} onClick={() => { sfx.tap(); onClick(); }} className={`px-3 py-1.5 rounded-xl border-2 text-sm font-semibold disabled:opacity-100 ${on ? 'bg-ink text-paper border-ink' : 'bg-paper border-ink/15'}`}>{children}</button>
  );
  const Row = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
    <div className="flex items-start gap-3 py-2.5 border-b border-ink/10 last:border-0">
      <div className="w-20 shrink-0 pt-1.5">
        <div className="font-bold text-sm">{label}</div>
        {hint && <div className="text-[11px] text-ink-soft leading-tight mt-0.5">{hint}</div>}
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
  return (
    <div className="flex-1 min-h-0 overflow-y-auto rounded-3xl bg-paper-2/60 border-2 border-ink/10 p-4">
      <div className="text-center mb-2">
        <div className="text-4xl">🐤</div>
        <div className="font-bold">{solo ? '跟電腦一起飛' : '一人開、一人看'}</div>
        <div className="text-xs text-ink-soft mt-1">{solo
          ? '合作：你開時電腦當塔台閃上/下提醒你；換它開時它只看得到霧裡，換你按上/下指揮它。'
          : '駕駛只看得到前方一點點；塔台看得到整張地圖但不能碰。開語音。'}</div>
      </div>
      {!(config.mode === 'race' && config.raceView === 'side') && <Row label="霧" hint="駕駛看得多遠">
        {(Object.keys(FOG_LABEL) as Fog[]).map((f) => <Chip key={f} on={config.fog === f} onClick={() => onPatch({ fog: f })}>{FOG_LABEL[f]}</Chip>)}
      </Row>}
      {config.mode !== 'race' && !solo && <Row label="警示鈕" hint="塔台可以按上/下閃駕駛畫面">
        <Chip on={config.alert} onClick={() => onPatch({ alert: true })}>開</Chip>
        <Chip on={!config.alert} onClick={() => onPatch({ alert: false })}>關</Chip>
      </Row>}
      <Row label="模式" hint={config.mode === 'solo' ? '一人開、一人報路' : config.mode === 'dual' ? '各飛一台，看得到對方、可按警示' : '各飛一台，只看自己，比誰遠'}>
        <Chip on={config.mode === 'solo'} onClick={() => onPatch({ mode: 'solo' })}>合作</Chip>
        <Chip on={config.mode === 'dual'} onClick={() => onPatch({ mode: 'dual' })}>雙駕駛</Chip>
        <Chip on={config.mode === 'race'} onClick={() => onPatch({ mode: 'race' })}>競技</Chip>
      </Row>
      {config.mode === 'race' && (
        <Row label="視角" hint={config.raceView === 'fpv' ? '第一視角，霧有效' : '側視角，看得到全部'}>
          <Chip on={config.raceView === 'fpv'} onClick={() => onPatch({ raceView: 'fpv' })}>第一視角</Chip>
          <Chip on={config.raceView === 'side'} onClick={() => onPatch({ raceView: 'side' })}>側視角</Chip>
        </Row>
      )}
      <Row label="聲控" hint="麥克風音量當升力，越大聲飛越高">
        <Chip on={!config.voice} onClick={() => onPatch({ voice: false })}>關</Chip>
        <Chip on={config.voice} onClick={() => onPatch({ voice: true })}>開</Chip>
      </Row>
      {config.voice && <MicCheck mic={mic} />}
      {!isDual(config) && (
        <>
          <Row label="換手" hint="每過幾根管子交換駕駛">
            {SWAP_OPTIONS.map((n) => <Chip key={n} on={config.swap === n} onClick={() => onPatch({ swap: n })}>{n === 0 ? '不換' : `${n} 根`}</Chip>)}
          </Row>
          <Row label="先開" hint="下一局自動換人">
            {(['L', 'R'] as Side[]).map((s) => <Chip key={s} on={config.pilot === s} onClick={() => onPatch({ pilot: s })}>{names[s]}</Chip>)}
          </Row>
        </>
      )}
      {!isHost && <div className="mt-3 text-center text-xs text-ink-soft">只有 {hostName} 能改設定</div>}
    </div>
  );
}

/** 大廳裡的麥克風測試：兩個人都要開（會換手） */
function MicCheck({ mic }: { mic: ReturnType<typeof useMic> }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (mic.status !== 'on') return;
    let raf = 0;
    const loop = () => { raf = requestAnimationFrame(loop); tick((n) => n + 1); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [mic.status]);
  const lv = mic.level.current;
  return (
    <div className="py-2.5 border-b border-ink/10">
      {mic.status === 'insecure' ? (
        <div className="text-xs text-side-l leading-snug"><MicOff size={14} className="inline mr-1" />這個網址開不了麥克風。改用 <b>https://（同 IP）:3211</b> 開，第一次要按「仍要前往」。</div>
      ) : mic.status === 'denied' ? (
        <div className="text-xs text-side-l leading-snug"><MicOff size={14} className="inline mr-1" />麥克風被拒絕了，到瀏覽器網址列旁的設定允許後重整。</div>
      ) : mic.status === 'on' ? (
        <div className="flex items-center gap-2">
          <Mic size={16} className="text-ink-soft shrink-0" />
          <div className="flex-1 h-4 rounded-full bg-ink/10 overflow-hidden relative">
            <div className="h-full bg-side-l rounded-full" style={{ width: `${lv * 100}%` }} />
            <div className="absolute inset-y-0 border-l-2 border-dashed border-ink/40" style={{ left: '43%' }} title="懸停" />
          </div>
          <span className="text-[11px] text-ink-soft w-10 text-right">{lv > 0.43 ? '往上' : lv > 0.08 ? '往下' : '安靜'}</span>
        </div>
      ) : (
        <Button variant="ghost" onClick={() => void mic.start()} disabled={mic.status === 'asking'}><Mic size={14} /> {mic.status === 'asking' ? '等瀏覽器允許…' : '開麥克風試試'}</Button>
      )}
    </div>
  );
}

/** 飛行中駕駛畫面右側的音量條（左邊是高度計）；虛線 = 懸停線 */
function MicMeter({ status, level }: { status: MicStatus; level: number }) {
  if (status !== 'on') {
    return <div className="absolute top-2 right-2 text-[11px] font-bold text-paper bg-ink/60 rounded-full px-2 py-0.5 flex items-center gap-1 pointer-events-none"><MicOff size={12} /> {status === 'asking' ? '等允許麥克風' : '沒麥克風，用點的'}</div>;
  }
  return (
    <div className="absolute right-3 top-[12%] bottom-[12%] w-3.5 rounded-full bg-ink/25 overflow-hidden pointer-events-none" title="音量">
      <div className="absolute inset-x-0 bottom-0 bg-paper/90 rounded-full" style={{ height: `${level * 100}%` }} />
      <div className="absolute inset-x-0 border-t-2 border-dashed border-side-l" style={{ bottom: '43%' }} />
    </div>
  );
}

/** 自己跑 rAF 的 canvas；draw 用最新的 closure（ref），DPR 處理好 */
function Canvas({ draw }: { draw: (ctx: CanvasRenderingContext2D, W: number, H: number, t: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  useEffect(() => {
    const el = ref.current!;
    const ctx = el.getContext('2d')!;
    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = el.clientWidth;
      const H = el.clientHeight;
      if (!W || !H) return;
      if (el.width !== Math.round(W * dpr) || el.height !== Math.round(H * dpr)) { el.width = Math.round(W * dpr); el.height = Math.round(H * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawRef.current(ctx, W, H, (now - t0) / 1000);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); raf = 0; };
  }, []);
  return <canvas ref={ref} className="w-full h-full block" />;
}
