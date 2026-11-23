// All sounds are made in code (no sound files): the spray loop follows the pressure and nozzle, a bell
// "ding" for every finished object, birds in the background, and small UI sounds.
// Started on the first click or key press (browsers need a user gesture).
import { FLAGS } from '../config.js';
import { settings } from './store.js';
import { on, onShutdown } from './life.js';

let ctx = null, master = null, noiseBuf = null, spray = null, refill = null;
let ambientOn = false, nextBird = 0;

function ensure() {
  if (ctx || FLAGS.mute) return ctx;
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
  master = ctx.createGain();
  master.gain.value = settings.mute ? 0 : settings.volume;
  master.connect(ctx.destination);
  const len = ctx.sampleRate * 2;
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

export function unlockAudio() {
  const c = ensure();
  if (c && c.state === 'suspended') c.resume();
}
on(window, 'pointerdown', unlockAudio);
on(window, 'keydown', unlockAudio);
onShutdown(() => { try { if (ctx) ctx.close(); } catch (e) { /* */ } ctx = null; });

export function setVolume() { if (master) master.gain.setTargetAtTime(settings.mute ? 0 : settings.volume, ctx.currentTime, 0.05); }

function noiseSrc(rate = 1) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.playbackRate.value = rate; s.start();
  return s;
}

// ---------------------------------------------------------------- spray loop
function buildSpray() {
  const out = ctx.createGain(); out.gain.value = 0; out.connect(master);
  const hiss = noiseSrc(1);
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 0.8;
  const hg = ctx.createGain(); hg.gain.value = 0.5;
  hiss.connect(bp); bp.connect(hg); hg.connect(out);
  const rumble = noiseSrc(0.6);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
  const sg = ctx.createGain(); sg.gain.value = 0;
  rumble.connect(lp); lp.connect(sg); sg.connect(out);
  const pump = ctx.createOscillator(); pump.type = 'sawtooth'; pump.frequency.value = 46;
  const plp = ctx.createBiquadFilter(); plp.type = 'lowpass'; plp.frequency.value = 260;
  const pg = ctx.createGain(); pg.gain.value = 0;
  pump.connect(plp); plp.connect(pg); pg.connect(master); pump.start();
  spray = { out, bp, hg, lp, sg, pump, pg };
}

// on = water coming out; pressure ~0.35..2.2; tool 'narrow' | 'wide' | 'surface'; hitDist (m) or null; cleaning = dirt coming off
export function updateSpray(on, pressure, tool, hitDist, cleaning) {
  if (!ctx) return;
  if (!spray) buildSpray();
  const t = ctx.currentTime, s = spray;
  const p = Math.max(0.3, Math.min(2.3, pressure || 1));
  const f = (tool === 'narrow' ? 3600 : tool === 'wide' ? 2500 : 1500) * (0.8 + 0.2 * p);
  s.bp.frequency.setTargetAtTime(f, t, 0.05);
  s.bp.Q.value = tool === 'narrow' ? 1.0 : 0.6;
  s.out.gain.setTargetAtTime(on ? 0.11 + 0.05 * p : 0, t, on ? 0.03 : 0.08);
  const near = hitDist == null ? 0 : Math.max(0, 1 - hitDist / 8);
  s.sg.gain.setTargetAtTime(on ? (0.25 + 0.9 * near) * (cleaning ? 1.3 : 0.8) : 0, t, 0.06);
  s.lp.frequency.setTargetAtTime(cleaning ? 900 : 600, t, 0.1);
  s.pump.frequency.setTargetAtTime(on ? 44 + 10 * p : 40, t, 0.2);
  s.pg.gain.setTargetAtTime(on ? 0.05 : 0, t, on ? 0.05 : 0.25);
}

export function stopSpray() { if (spray && ctx) updateSpray(false, 1, 'narrow', null, false); }

export function updateRefill(on) {
  if (!ctx) return;
  if (!refill) {
    const out = ctx.createGain(); out.gain.value = 0; out.connect(master);
    const n = noiseSrc(0.8);
    const lp = ctx.createBiquadFilter(); lp.type = 'bandpass'; lp.frequency.value = 500; lp.Q.value = 2;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 7;
    const lg = ctx.createGain(); lg.gain.value = 250;
    lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
    n.connect(lp); lp.connect(out);
    refill = { out };
  }
  refill.out.gain.setTargetAtTime(on ? 0.12 : 0, ctx.currentTime, 0.08);
}

// ---------------------------------------------------------------- one-shots
function tone(freq, dur, type = 'sine', vol = 0.08, when = 0, slideTo = null, pan = 0) {
  const c = ensure();
  if (!c) return;
  const t = c.currentTime + when;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.01, dur * 0.2));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = g;
  if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); node = p; }
  o.connect(g); node.connect(master); o.start(t); o.stop(t + dur + 0.05);
}

function noiseBurst(dur, freq, vol, when = 0, type = 'bandpass') {
  const c = ensure();
  if (!c) return;
  const t = c.currentTime + when;
  const s = c.createBufferSource(); s.buffer = noiseBuf;
  const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
  const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
}

export const sfx = {
  click() { tone(720, 0.05, 'square', 0.035); },
  open() { tone(520, 0.07, 'triangle', 0.06); tone(780, 0.09, 'triangle', 0.05, 0.05); },
  nozzle() { tone(1400, 0.03, 'square', 0.03); noiseBurst(0.08, 4000, 0.05, 0.01); },
  pickup() { tone(180, 0.12, 'triangle', 0.08); tone(120, 0.1, 'sine', 0.08, 0.06); },
  empty() { for (let i = 0; i < 4; i++) noiseBurst(0.06, 900 + i * 200, 0.08, i * 0.09); },
  full() { tone(880, 0.08, 'sine', 0.06); tone(1320, 0.12, 'sine', 0.05, 0.07); },
  bad() { tone(200, 0.16, 'sawtooth', 0.06); tone(150, 0.2, 'sawtooth', 0.05, 0.1); },
  coin() { tone(988, 0.08, 'square', 0.05); tone(1319, 0.18, 'square', 0.05, 0.07); },
  buy() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.14, 'triangle', 0.07, i * 0.07)); },
  // a bell: base partial plus inharmonic overtones, long decay
  ding() {
    const b = 1318.5;
    tone(b, 1.3, 'sine', 0.12); tone(b * 2.0, 0.9, 'sine', 0.05); tone(b * 2.76, 0.6, 'sine', 0.03); tone(b * 0.5, 0.8, 'sine', 0.03);
  },
  sparkle() { for (let i = 0; i < 7; i++) tone(2000 + Math.random() * 2600, 0.18, 'sine', 0.035, i * 0.06, null, Math.random() * 2 - 1); },
  fanfare() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.22, 'triangle', 0.08, i * 0.1));
    tone(1568, 0.8, 'triangle', 0.08, 0.55); tone(1047, 0.8, 'triangle', 0.05, 0.55);
  },
};

// ---------------------------------------------------------------- birds
export function setAmbient(on) { ambientOn = on; }

function chirp(when) {
  const c = ctx;
  const n = 2 + ((Math.random() * 5) | 0);
  const base = 2600 + Math.random() * 2400;
  const pan = Math.random() * 1.6 - 0.8;
  const kind = Math.random();
  for (let i = 0; i < n; i++) {
    const f0 = base * (0.85 + Math.random() * 0.3);
    const f1 = kind < 0.5 ? f0 * (1.25 + Math.random() * 0.3) : f0 * (0.7 + Math.random() * 0.15);
    const o = c.createOscillator(), g = c.createGain();
    const t = when + i * (0.09 + Math.random() * 0.06), d = 0.05 + Math.random() * 0.06;
    o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.018, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    let node = g;
    if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); node = p; }
    o.connect(g); node.connect(master); o.start(t); o.stop(t + d + 0.02);
  }
}

// called every frame
export function tickAudio() {
  if (!ctx || !ambientOn || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  if (t >= nextBird) {
    if (nextBird > 0) chirp(t + 0.02);
    nextBird = t + 1.5 + Math.random() * 4.5;
  }
}
