// Simple synthesised sounds (no sound files): mower engine that follows speed, a cutting
// rustle, and a few UI blips. Started on the first click (browsers need a user gesture).
import { FLAGS } from '../config.js';
import { settings } from './store.js';

let ctx = null, master = null, engine = null, cutter = null, noiseBuf = null;

function ensure() {
  if (ctx || FLAGS.mute) return ctx;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) { return null; }
  master = ctx.createGain();
  master.gain.value = settings.mute ? 0 : settings.volume;
  master.connect(ctx.destination);
  const len = ctx.sampleRate;
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

export function unlockAudio() {
  const c = ensure();
  if (c && c.state === 'suspended') c.resume();
}
addEventListener('pointerdown', unlockAudio, { once: false });
addEventListener('keydown', unlockAudio, { once: false });

export function setVolume() {
  if (master) master.gain.value = settings.mute ? 0 : settings.volume;
}

// Engine sound types: reel (clicky push mower), petrol, electric, tractor, big
const ENG = {
  reel: { wave: 'triangle', base: 0, top: 0, gain: 0, noise: 0.05 },
  petrol: { wave: 'sawtooth', base: 48, top: 95, gain: 0.07, noise: 0.03 },
  electric: { wave: 'sine', base: 220, top: 420, gain: 0.035, noise: 0.01 },
  tractor: { wave: 'sawtooth', base: 38, top: 78, gain: 0.08, noise: 0.03 },
  big: { wave: 'sawtooth', base: 32, top: 70, gain: 0.09, noise: 0.04 },
};

export function startEngine(type) {
  stopEngine();
  const c = ensure();
  if (!c) return;
  const e = ENG[type] || ENG.petrol;
  const out = c.createGain(); out.gain.value = 0; out.connect(master);
  const filt = c.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 600; filt.connect(out);
  let osc = null, osc2 = null;
  if (e.gain > 0) {
    osc = c.createOscillator(); osc.type = e.wave; osc.frequency.value = e.base; osc.connect(filt); osc.start();
    osc2 = c.createOscillator(); osc2.type = 'square'; osc2.frequency.value = e.base * 0.5; const g2 = c.createGain(); g2.gain.value = 0.4; osc2.connect(g2); g2.connect(filt); osc2.start();
  }
  const ns = c.createBufferSource(); ns.buffer = noiseBuf; ns.loop = true;
  const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 1800; nf.Q.value = 0.8;
  const ng = c.createGain(); ng.gain.value = e.noise;
  ns.connect(nf); nf.connect(ng); ng.connect(out); ns.start();
  engine = { e, out, filt, osc, osc2, ns, ng, nf };
  // cutting rustle (separate, louder while cutting)
  const cs = c.createBufferSource(); cs.buffer = noiseBuf; cs.loop = true; cs.playbackRate.value = 0.7;
  const cf = c.createBiquadFilter(); cf.type = 'highpass'; cf.frequency.value = 2500;
  const cg = c.createGain(); cg.gain.value = 0;
  cs.connect(cf); cf.connect(cg); cg.connect(master); cs.start();
  cutter = { cs, cg };
}

export function stopEngine() {
  for (const n of [engine && engine.osc, engine && engine.osc2, engine && engine.ns, cutter && cutter.cs]) { try { n && n.stop(); } catch (e) { /* */ } }
  if (engine) engine.out.disconnect();
  if (cutter) cutter.cg.disconnect();
  engine = null; cutter = null;
}

// speed01 = 0..1 of top speed, cutting = cells cut this frame > 0, running = engine on
export function updateEngine(speed01, cutting, running = true) {
  if (!ctx || !engine) return;
  const t = ctx.currentTime;
  const e = engine.e;
  const s = Math.min(1, Math.abs(speed01));
  if (engine.osc) {
    engine.osc.frequency.setTargetAtTime(e.base + (e.top - e.base) * s + (cutting ? 6 : 0), t, 0.08);
    engine.osc2.frequency.setTargetAtTime((e.base + (e.top - e.base) * s) * 0.5, t, 0.08);
  }
  engine.filt.frequency.setTargetAtTime(500 + 1400 * s, t, 0.1);
  engine.out.gain.setTargetAtTime(running ? (e.gain > 0 ? 1 : 0.3 + 0.9 * s) : 0, t, 0.15);
  if (e.gain === 0) engine.ng.gain.setTargetAtTime(0.05 * s, t, 0.05); // reel: only clicks while moving
  cutter.cg.gain.setTargetAtTime(cutting && running ? 0.05 + 0.05 * s : 0, t, 0.06);
}

function blip(freq, dur = 0.08, type = 'square', vol = 0.08, when = 0) {
  const c = ensure();
  if (!c) return;
  const t = c.currentTime + when;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}

export const sfx = {
  click() { blip(660, 0.05, 'square', 0.05); },
  open() { blip(520, 0.06, 'triangle', 0.08); blip(780, 0.08, 'triangle', 0.07, 0.05); },
  coin() { blip(988, 0.08, 'square', 0.06); blip(1319, 0.16, 'square', 0.06, 0.07); },
  buy() { [523, 659, 784, 1047].forEach((f, i) => blip(f, 0.12, 'triangle', 0.08, i * 0.07)); },
  bad() { blip(180, 0.18, 'sawtooth', 0.08); blip(140, 0.2, 'sawtooth', 0.07, 0.1); },
  bump() { blip(90, 0.12, 'sine', 0.2); },
  empty() { [400, 360, 320, 280].forEach((f, i) => blip(f, 0.08, 'triangle', 0.06, i * 0.06)); },
  star(i) { blip(700 + i * 180, 0.18, 'triangle', 0.09); },
  done() { [523, 659, 784, 1047, 1319].forEach((f, i) => blip(f, 0.16, 'triangle', 0.09, i * 0.09)); },
};
