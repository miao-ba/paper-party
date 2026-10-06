// Sound effects: Kenney.nl CC0 samples in public/sfx/ + live Web Audio synthesis (gunshot, splash,
// whistle… and a fallback for every sample that has not loaded yet, so there is always a sound).
// Everything goes through a compressor; synthesized sounds get a little reverb.
// Browsers need a user gesture before audio: the first pointerdown unlocks it and starts loading samples.
//
// Games: `import { sfx } from '@sdk'` and call e.g. sfx.tap(), sfx.win(). Try them all in the dev
// console with `__sfx.<name>()`.
import { getPrefs } from '../prefs';

type Wave = OscillatorType;
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let verb: GainNode | null = null;
const muted = () => getPrefs().muted;

function ac() {
  if (!ctx) {
    ctx = new AudioContext();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 10;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    master = ctx.createGain();
    master.gain.value = getPrefs().volume;
    master.connect(comp).connect(ctx.destination);
    // Reverb: a decaying noise burst as impulse response.
    const conv = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 1.1);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    }
    conv.buffer = ir;
    verb = ctx.createGain();
    verb.gain.value = 0.18;
    verb.connect(conv).connect(master);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}
// First touch unlocks audio and loads samples; later touches resume it (iOS suspends after calls / app switches).
const unlock = () => {
  if (!ctx) {
    ac();
    void loadAll();
    return;
  }
  if (ctx.state !== 'running') void ctx.resume();
};
for (const ev of ['pointerdown', 'touchend', 'keydown'] as const) window.addEventListener(ev, unlock, { capture: true, passive: true });

/** Settings volume slider. */
export function setVolume(v: number) {
  if (master && ctx) master.gain.setTargetAtTime(v, ctx.currentTime, 0.02);
}

// ---------------------------------------------------------------- samples

/** name → [file, volume] (raw files differ a lot in loudness; levelled here) */
const FILES = {
  click: ['click.wav', 0.5],
  drop: ['drop.wav', 0.6],
  back: ['back.wav', 0.55],
  invite: ['invite.mp3', 0.55],
  go: ['go.mp3', 0.55],
  pluck: ['pluck.wav', 0.7],
  ding: ['ding.wav', 0.6],
  tick: ['tick.wav', 0.45],
  count: ['count.wav', 0.8],
  scratch: ['scratch.wav', 0.45],
  miss: ['miss.wav', 0.6],
  switch: ['switch.mp3', 0.45],
  win: ['win.mp3', 0.55],
  lose: ['lose.mp3', 0.55],
  win2: ['win2.mp3', 0.55],
  lose2: ['lose2.mp3', 0.55],
  start: ['start.mp3', 0.5],
  jackpot: ['jackpot.mp3', 0.5],
  bell: ['bell.mp3', 0.5],
  slam: ['slam.mp3', 0.7],
  thud: ['thud.mp3', 0.6],
  punch: ['punch.mp3', 0.65],
  punch2: ['punch2.mp3', 0.7],
  glass: ['glass.wav', 0.55],
  wood: ['wood.wav', 0.75],
  plank: ['plank.mp3', 0.6],
  rip: ['rip.mp3', 1.4],
  chips: ['chips.wav', 1.1],
  chip: ['chip.wav', 1.0],
  fold: ['fold.mp3', 2.6],
  cloth: ['cloth.mp3', 1.2],
} as const satisfies Record<string, readonly [string, number]>;
type Sample = keyof typeof FILES;
const buffers = new Map<Sample, AudioBuffer>();
let loading: Promise<void> | null = null;

function loadAll() {
  if (loading) return loading;
  const c = ac();
  const base = `${import.meta.env.BASE_URL}sfx/`;
  loading = Promise.all(
    (Object.keys(FILES) as Sample[]).map(async (k) => {
      try {
        const res = await fetch(base + FILES[k][0]);
        const buf = await c.decodeAudioData(await res.arrayBuffer());
        buffers.set(k, buf);
      } catch {
        /* not loaded: the synthesized fallback plays */
      }
    }),
  ).then(() => undefined);
  return loading;
}

/** Play a sample; returns false if it is not loaded yet (caller falls back to synthesis). */
function play(name: Sample, { vol = 1, rate = 1, delay = 0, wet = 0 }: { vol?: number; rate?: number; delay?: number; wet?: number } = {}) {
  if (muted()) return true;
  const buf = buffers.get(name);
  if (!buf) return false;
  const c = ac();
  const src = c.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const g = c.createGain();
  g.gain.value = FILES[name][1] * vol;
  src.connect(g).connect(master!);
  if (wet > 0) {
    const w = c.createGain();
    w.gain.value = wet;
    g.connect(w).connect(verb!);
  }
  src.start(c.currentTime + delay);
  return true;
}

// ---------------------------------------------------------------- synthesis

/** One note; freq may be [from, to] for a glide. */
function note(
  freq: number | [number, number],
  dur: number,
  { wave = 'square', vol = 0.18, delay = 0, attack = 0.005, decay, wet = 0.4 }: { wave?: Wave; vol?: number; delay?: number; attack?: number; decay?: number; wet?: number } = {},
) {
  if (muted()) return;
  const c = ac();
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = wave;
  const [f0, f1] = Array.isArray(freq) ? freq : [freq, freq];
  osc.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + (decay ?? dur));
  osc.connect(g).connect(master!);
  if (wet) { const w = c.createGain(); w.gain.value = wet; g.connect(w).connect(verb!); }
  osc.start(t0);
  osc.stop(t0 + Math.max(dur, decay ?? 0) + 0.02);
}

/** Filtered noise; tone = cutoff (or [from, to] sweep). */
function noise(
  dur: number,
  { vol = 0.2, delay = 0, tone = 1200, type = 'lowpass', q = 0.7, wet = 0.3 }: { vol?: number; delay?: number; tone?: number | [number, number]; type?: BiquadFilterType; q?: number; wet?: number } = {},
) {
  if (muted()) return;
  const c = ac();
  const t0 = c.currentTime + delay;
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  const [a, b] = Array.isArray(tone) ? tone : [tone, tone];
  f.frequency.setValueAtTime(a, t0);
  if (b !== a) f.frequency.exponentialRampToValueAtTime(b, t0 + dur);
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master!);
  if (wet) { const w = c.createGain(); w.gain.value = wet; g.connect(w).connect(verb!); }
  src.start(t0);
}

/** Bell / xylophone: sine + overtones, fast attack, slow decay. */
function bell(f: number, dur: number, { vol = 0.12, delay = 0 } = {}) {
  note(f, dur, { wave: 'sine', vol, delay, decay: dur, wet: 0.6 });
  note(f * 2.01, dur * 0.6, { wave: 'sine', vol: vol * 0.35, delay, wet: 0.6 });
  note(f * 3.98, dur * 0.25, { wave: 'triangle', vol: vol * 0.12, delay, wet: 0.6 });
}
const arp = (fs: number[], gap: number, dur: number, vol = 0.12) => fs.forEach((f, i) => bell(f, dur, { vol, delay: i * gap }));
const rand = (a: number, b: number) => a + Math.random() * (b - a);

// Notes: C5=523 D5=587 E5=659 G5=784 A5=880 C6=1047
export const sfx = {
  /** Generic click. */
  tap: () => play('click', { rate: rand(0.95, 1.05) }) || note(880, 0.05, { wave: 'square', vol: 0.06, wet: 0 }),
  /** Place / pop. */
  pop: () => play('drop', { rate: rand(0.95, 1.1) }) || note([400, 900], 0.08, { wave: 'triangle', vol: 0.2 }),
  /** Cancel / remove. */
  undo: () => play('back') || note([700, 300], 0.1, { wave: 'triangle', vol: 0.15 }),
  /** Notification (someone joined…). */
  invite: () => play('invite', { wet: 0.2 }) || arp([659, 880, 1047], 0.11, 0.3),
  /** Game start. */
  start: () => play('start', { wet: 0.15 }) || arp([523, 659, 784, 1047], 0.08, 0.25),
  /** Countdown tick. */
  count: () => play('count') || note(1047, 0.06, { wave: 'sine', vol: 0.15 }),
  /** Countdown finished: go! */
  go: () => play('go', { wet: 0.15 }) || arp([784, 1568], 0.06, 0.3, 0.15),
  /** Pen / scribble. */
  ink: () => play('scratch', { rate: rand(0.9, 1.15) }) || noise(0.06, { vol: 0.15, tone: 3000 }),
  /** Paper fold. */
  fold: () => {
    if (!play('fold', { rate: rand(0.95, 1.05) })) noise(0.35, { vol: 0.12, tone: [600, 1800], type: 'bandpass', q: 1.2 });
    note([300, 180], 0.35, { wave: 'sine', vol: 0.04 });
  },
  /** Charging tick; pitch rises with power (0–100). */
  tick: (power: number) => play('tick', { rate: 0.7 + power / 90, vol: 0.7 + power / 250 }) || note(300 + power * 8, 0.03, { wave: 'square', vol: 0.05, wet: 0 }),
  /** Heavy slam. */
  slam: () => {
    if (!play('slam')) noise(0.12, { vol: 0.4, tone: 500 });
    note([140, 40], 0.3, { wave: 'sine', vol: 0.45, wet: 0.1 });
  },
  /** Stamp / thud. */
  stamp: () => play('thud', { rate: rand(1, 1.15) }) || note([200, 600], 0.06, { wave: 'triangle', vol: 0.2 }),
  /** Miss / fail. */
  miss: () => play('miss') || (note(330, 0.12, { wave: 'square', vol: 0.1 }), note(247, 0.25, { wave: 'square', vol: 0.1, delay: 0.13 })),
  /** Hit. */
  hit: () => play('punch2', { rate: rand(0.95, 1.08) }) || (noise(0.08, { vol: 0.25, tone: 1500 }), note([500, 250], 0.15, { wave: 'sawtooth', vol: 0.12 })),
  /** Critical hit. */
  headshot: () => {
    if (!play('punch')) noise(0.15, { vol: 0.4, tone: 2500 });
    play('glass', { delay: 0.04, vol: 0.8 });
    note([900, 200], 0.3, { wave: 'sawtooth', vol: 0.08 });
    arp([1047, 1319, 1568, 2093], 0.07, 0.35, 0.1);
  },
  /** Splash into water. */
  splash: () => {
    note([420, 90], 0.3, { wave: 'sine', vol: 0.35, wet: 0.2 });
    noise(0.5, { vol: 0.32, tone: [2600, 500], type: 'lowpass', q: 1.5, wet: 0.5 });
    for (let i = 0; i < 4; i++) note([rand(500, 900), rand(1200, 1800)], 0.06, { wave: 'sine', vol: 0.07, delay: 0.18 + i * rand(0.05, 0.09), wet: 0.6 });
  },
  /** Fall over. */
  fall: () => {
    note([400, 80], 0.5, { wave: 'triangle', vol: 0.12, delay: 0.05 });
    play('wood', { delay: 0.35 }) || noise(0.1, { vol: 0.2, tone: 600, delay: 0.35 });
  },
  win: () => play('win', { wet: 0.2 }) || arp([523, 659, 784, 1047, 784, 1047], 0.11, 0.4),
  lose: () => play('lose', { wet: 0.2 }) || [392, 370, 349, 330].forEach((f, i) => note(f, 0.28, { delay: i * 0.25, vol: 0.12, wave: 'triangle' })),
  /** Bell: 'draw!' / attention. */
  draw: () => {
    if (!play('bell', { wet: 0.25 })) { note(1568, 0.08, { wave: 'square', vol: 0.2 }); note(2093, 0.25, { wave: 'square', vol: 0.2, delay: 0.08 }); }
  },
  /** Gunshot. */
  shot: () => {
    noise(0.05, { vol: 0.7, tone: 6000, wet: 0 });
    noise(0.35, { vol: 0.5, tone: [3000, 300], wet: 0.7 });
    note([180, 45], 0.22, { wave: 'sine', vol: 0.6, wet: 0.2 });
  },
  /** Won a round. */
  win2: () => play('win2', { wet: 0.15 }) || arp([784, 1047], 0.1, 0.3, 0.14),
  /** Lost a round. */
  lose2: () => play('lose2', { wet: 0.15 }) || [330, 262].forEach((f, i) => note(f, 0.18, { delay: i * 0.16, vol: 0.12, wave: 'triangle' })),
  /** Ding-ding. */
  poke: () => {
    if (!play('ding', { rate: 1.25 })) note([1200, 600], 0.07, { wave: 'square', vol: 0.15 });
    play('ding', { rate: 1, delay: 0.11 }) || note([1200, 600], 0.07, { wave: 'square', vol: 0.15, delay: 0.1 });
  },
  /** Pluck / send. */
  pokeSent: () => play('pluck', { rate: 1.2 }) || note([600, 1200], 0.07, { wave: 'square', vol: 0.1 }),
  /** Rip open. */
  rip: () => play('rip', { rate: rand(1, 1.15) }) || (noise(0.05, { vol: 0.22, tone: 5000 }), noise(0.08, { vol: 0.18, tone: 3500, delay: 0.05 })),
  /** Coins / chips. */
  coin: () => play('chips', { rate: rand(0.95, 1.1) }) || (note(988, 0.06, { wave: 'square', vol: 0.1 }), note(1319, 0.16, { wave: 'square', vol: 0.1, delay: 0.07 })),
  /** Jackpot. */
  jackpot: () => play('jackpot', { wet: 0.2 }) || arp([784, 988, 1175, 1568, 1319, 1568, 2093], 0.065, 0.3, 0.11),
  /** Referee whistle. */
  whistle: () => {
    if (muted()) return;
    const c = ac();
    const t0 = c.currentTime;
    const osc = c.createOscillator();
    const lfo = c.createOscillator();
    const lg = c.createGain();
    const g = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = 2300;
    lfo.frequency.value = 38;
    lg.gain.value = 90;
    lfo.connect(lg).connect(osc.frequency);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.14, t0 + 0.02);
    g.gain.setValueAtTime(0.14, t0 + 0.32);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.42);
    osc.connect(g).connect(master!);
    osc.start(t0); lfo.start(t0);
    osc.stop(t0 + 0.45); lfo.stop(t0 + 0.45);
    noise(0.4, { vol: 0.04, tone: 2300, type: 'bandpass', q: 6, wet: 0.2 });
  },
  /** Flap / whoosh. */
  flap: () => noise(0.12, { vol: 0.22, tone: [700, 2200], type: 'bandpass', q: 1.5, wet: 0.1 }),
  /** Small score. */
  score: () => play('chip', { rate: rand(1.1, 1.25) }) || bell(1319, 0.2, { vol: 0.08 }),
  /** Crash. */
  crash: () => {
    play('punch', { rate: 0.9 }) || noise(0.2, { vol: 0.4, tone: 1200 });
    play('wood', { delay: 0.08, rate: 0.8 });
  },
  /** A chip / token placed (bids, small moves). */
  chip: () => play('chip', { rate: rand(0.9, 1.1) }) || note(1200, 0.04, { wave: 'triangle', vol: 0.1 }),
  /** Dice rattle / shuffle. */
  shake: () => {
    for (let i = 0; i < 4; i++) play('chips', { rate: rand(1.1, 1.5), delay: i * 0.07, vol: 0.45 }) || noise(0.05, { vol: 0.12, tone: 3000, delay: i * 0.07 });
  },
  /** Swap / switch. */
  swap: () => play('switch', { wet: 0.1 }) || arp([659, 988], 0.08, 0.2),
};

/** Dev: try every sound from the console. */
if (import.meta.env.DEV) (window as any).__sfx = sfx;
