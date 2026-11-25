// Driver Online USA - all sounds are made in code (no downloads, nothing copyrighted):
// engines (pitch follows RPM, different character per engine type), tyre screech, wind,
// crashes, horns, indicator ticks, rain, wind and thunder. With ?mute nothing is ever created.
import { FLAGS } from '../config.js';
import { clamp } from '../core/util.js';

const ENGINE_TYPES = {
  v8:   { cyl: 8, sub: 0.55, saw: 0.35, burble: 0.45, cutoff: 900, q: 1.2, noise: 0.18 },
  v6:   { cyl: 6, sub: 0.35, saw: 0.45, burble: 0.2, cutoff: 1200, q: 1.0, noise: 0.15 },
  i4:   { cyl: 4, sub: 0.2, saw: 0.55, burble: 0.05, cutoff: 1500, q: 1.4, noise: 0.22 },
  i6:   { cyl: 6, sub: 0.3, saw: 0.5, burble: 0.08, cutoff: 1400, q: 1.6, noise: 0.15 },
  v10:  { cyl: 10, sub: 0.3, saw: 0.5, burble: 0.15, cutoff: 1800, q: 1.8, noise: 0.15 },
  v12:  { cyl: 12, sub: 0.25, saw: 0.55, burble: 0.1, cutoff: 2000, q: 1.6, noise: 0.14 },
  rotary: { cyl: 3, sub: 0.15, saw: 0.6, burble: 0.02, cutoff: 1900, q: 2.2, noise: 0.25 },
  diesel: { cyl: 6, sub: 0.5, saw: 0.3, burble: 0.3, cutoff: 600, q: 0.9, noise: 0.3 },
};

export class Audio {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.voices = new Map();
    this.listener = { x: 0, y: 0, z: 0 };
    this.enabled = !FLAGS.mute;
  }

  /** Must be called from a click or key press (browsers only allow sound after one). */
  start() {
    if (!this.enabled || this.ctx) { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) { this.enabled = false; return; }
    const ctx = (this.ctx = new Ctx());
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.engineBus = ctx.createGain(); this.engineBus.connect(this.master);
    this.fxBus = ctx.createGain(); this.fxBus.connect(this.master);
    this.applyVolume();
    this.settings.on('change', (k) => { if (/olume/.test(k)) this.applyVolume(); });
    this.noiseBuf = this.makeNoise(2);
    this.pinkBuf = this.makeNoise(3, true);
    // always-running loops for the player's own car and the weather
    this.screech = this.loopNoise(this.fxBus, 'bandpass', 1100, 3.5);
    this.wind = this.loopNoise(this.fxBus, 'lowpass', 500, 0.7);
    this.rain = this.loopNoise(this.fxBus, 'highpass', 1400, 0.5, true);
    this.stormWind = this.loopNoise(this.fxBus, 'lowpass', 260, 1, true);
    this.ambient = this.loopNoise(this.fxBus, 'lowpass', 180, 0.6, true);
    this.ambient.gain.gain.value = 0.02;
    this.hornNode = null;
  }

  applyVolume() {
    if (!this.ctx) return;
    const s = this.settings;
    this.master.gain.value = s.get('volume');
    this.engineBus.gain.value = s.get('engineVolume') * 0.7;
    this.fxBus.gain.value = s.get('effectsVolume');
  }

  makeNoise(seconds, pink) {
    const ctx = this.ctx, n = ctx.sampleRate * seconds;
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (pink) { b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18; }
      else d[i] = w;
    }
    return buf;
  }

  loopNoise(out, type, freq, q, pink) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = pink ? this.pinkBuf : this.noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(out); src.start();
    return { src, filter: f, gain: g };
  }

  /** One engine sound. pos = null for the player's own car (no 3D panning). */
  makeEngine(type, spatial) {
    const ctx = this.ctx, p = ENGINE_TYPES[type] || ENGINE_TYPES.v6;
    const out = ctx.createGain(); out.gain.value = 0;
    let dest = this.engineBus, panner = null;
    if (spatial) {
      panner = ctx.createPanner();
      panner.panningModel = 'equalpower'; panner.distanceModel = 'inverse';
      panner.refDistance = 6; panner.rolloffFactor = 1.2; panner.maxDistance = 400;
      panner.connect(this.engineBus); dest = panner;
    }
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.Q.value = p.q;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 2.2); }
    shaper.curve = curve;
    const saw = ctx.createOscillator(); saw.type = 'sawtooth';
    const sub = ctx.createOscillator(); sub.type = 'square';
    const hi = ctx.createOscillator(); hi.type = 'sawtooth';
    const gSaw = ctx.createGain(), gSub = ctx.createGain(), gHi = ctx.createGain();
    gSaw.gain.value = p.saw; gSub.gain.value = p.sub; gHi.gain.value = 0.12;
    // uneven firing "burble": wobble the volume at a low rate
    const lfo = ctx.createOscillator(); lfo.type = 'triangle';
    const lfoGain = ctx.createGain(); lfoGain.gain.value = p.burble * 0.5;
    const am = ctx.createGain(); am.gain.value = 1 - p.burble * 0.3;
    lfo.connect(lfoGain); lfoGain.connect(am.gain);
    // intake / exhaust noise
    const nz = ctx.createBufferSource(); nz.buffer = this.noiseBuf; nz.loop = true;
    const nzf = ctx.createBiquadFilter(); nzf.type = 'bandpass'; nzf.frequency.value = 900; nzf.Q.value = 0.8;
    const gNz = ctx.createGain(); gNz.gain.value = 0;
    saw.connect(gSaw); sub.connect(gSub); hi.connect(gHi);
    gSaw.connect(shaper); gSub.connect(shaper); gHi.connect(shaper);
    shaper.connect(am); am.connect(filter);
    nz.connect(nzf); nzf.connect(gNz); gNz.connect(filter);
    filter.connect(out); out.connect(dest);
    for (const o of [saw, sub, hi, lfo, nz]) o.start();
    return { p, out, panner, filter, saw, sub, hi, lfo, gNz, nodes: [saw, sub, hi, lfo, nz] };
  }

  setEngine(e, rpm, throttle, gain) {
    const t = this.ctx.currentTime, p = e.p;
    const f = Math.max(20, (rpm / 60) * (p.cyl / 2));
    e.saw.frequency.setTargetAtTime(f, t, 0.03);
    e.sub.frequency.setTargetAtTime(f / 2, t, 0.03);
    e.hi.frequency.setTargetAtTime(f * 2.01, t, 0.03);
    e.lfo.frequency.setTargetAtTime(f / 4, t, 0.05);
    e.filter.frequency.setTargetAtTime(p.cutoff * (0.55 + throttle * 0.9) + rpm * 0.18, t, 0.05);
    e.gNz.gain.setTargetAtTime(p.noise * (0.2 + throttle) * clamp(rpm / 7000, 0.1, 1), t, 0.05);
    e.out.gain.setTargetAtTime(gain * (0.22 + throttle * 0.28) * (0.6 + 0.4 * clamp(rpm / 7000, 0, 1)), t, 0.05);
  }

  stopEngine(e) {
    try { e.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05); } catch (err) { /* */ }
    setTimeout(() => { for (const n of e.nodes) { try { n.stop(); } catch (err) { /* */ } } try { e.out.disconnect(); if (e.panner) e.panner.disconnect(); } catch (err) { /* */ } }, 300);
  }

  /** The player's car: called every frame. */
  car(st) {
    if (!this.ctx) return;
    if (!this.mine || this.mine.type !== st.engine) {
      if (this.mine) this.stopEngine(this.mine.e);
      this.mine = { type: st.engine, e: this.makeEngine(st.engine, false) };
    }
    this.setEngine(this.mine.e, st.rpm, st.throttle, st.paused ? 0 : 1);
    const t = this.ctx.currentTime;
    this.screech.gain.gain.setTargetAtTime(st.paused ? 0 : clamp(st.slip, 0, 1) * 0.35, t, 0.05);
    this.screech.filter.frequency.setTargetAtTime(900 + st.slip * 500, t, 0.1);
    this.wind.gain.gain.setTargetAtTime(st.paused ? 0 : clamp(st.speed / 60, 0, 1) ** 2 * 0.25 * (st.inside ? 0.5 : 1), t, 0.1);
    this.horn(st.horn && !st.paused);
  }

  stopCar() { if (this.mine) { this.stopEngine(this.mine.e); this.mine = null; } if (this.ctx) { this.screech.gain.gain.value = 0; this.wind.gain.gain.value = 0; } this.horn(false); }

  horn(on) {
    if (!this.ctx) return;
    if (on && !this.hornNode) this.hornNode = this.makeHorn(this.fxBus, 0.32);
    else if (!on && this.hornNode) { this.endHorn(this.hornNode); this.hornNode = null; }
  }

  makeHorn(dest, vol, high) {
    const ctx = this.ctx;
    const g = ctx.createGain(); g.gain.value = 0; g.gain.setTargetAtTime(vol, ctx.currentTime, 0.01);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 520; f.Q.value = 0.9;
    const oscs = (high ? [480, 600] : [415, 520]).map((hz) => { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = hz; o.connect(f); o.start(); return o; });
    f.connect(g); g.connect(dest);
    return { g, oscs };
  }
  endHorn(h) { const t = this.ctx.currentTime; h.g.gain.setTargetAtTime(0, t, 0.02); setTimeout(() => { for (const o of h.oscs) { try { o.stop(); } catch (e) { /* */ } } h.g.disconnect(); }, 200); }

  /** Another player's car (nearest 6 get engine sound). */
  voice(id, pos, vel, rpm, throttle, horn, carId, dist) {
    if (!this.ctx) return;
    let v = this.voices.get(id);
    if (!v) { v = { id, engine: null, horn: null, dist: 1e9, rpm: 800, throttle: 0, pos: { x: 0, y: 0, z: 0 }, type: 'v6' }; this.voices.set(id, v); }
    v.dist = dist; v.rpm = rpm; v.throttle = throttle; v.pos.x = pos.x; v.pos.y = pos.y; v.pos.z = pos.z;
    v.type = (this.engineTypeOf && this.engineTypeOf(carId)) || 'v6';
    v.wantHorn = horn && dist < 150;
    v.touched = true;
  }
  removeVoice(id) { const v = this.voices.get(id); if (!v || !this.ctx) return; if (v.engine) this.stopEngine(v.engine); if (v.horn) this.endHorn(v.horn.h); this.voices.delete(id); }

  /** A traffic car honking at pos. */
  honk(pos, kind) {
    if (!this.ctx) return;
    const d = Math.hypot(pos.x - this.listener.x, pos.z - this.listener.z);
    if (d > 120) return;
    const p = this.ctx.createPanner(); p.panningModel = 'equalpower'; p.refDistance = 8; p.rolloffFactor = 1.3;
    p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
    p.connect(this.fxBus);
    const h = this.makeHorn(p, 0.28, kind === 'sedan' || kind === 'police');
    setTimeout(() => { this.endHorn(h); setTimeout(() => p.disconnect(), 300); }, 450);
  }

  crash(strength, pos) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime, s = clamp(strength, 0.1, 1);
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1200 + s * 2500;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.9 * s, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25 + s * 0.5);
    src.connect(f); f.connect(g); g.connect(this.fxBus);
    src.start(t, Math.random()); src.stop(t + 1);
    // low thump
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(35, t + 0.3);
    const og = ctx.createGain(); og.gain.setValueAtTime(0.8 * s, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(og); og.connect(this.fxBus); o.start(t); o.stop(t + 0.4);
    void pos;
  }

  tick() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'square'; o.frequency.value = 1800; g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.03);
    o.connect(g); g.connect(this.fxBus); o.start(t); o.stop(t + 0.04);
  }

  thunder(delay) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.pinkBuf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220;
    const g = ctx.createGain(); const loud = clamp(1.2 - delay * 0.2, 0.3, 1);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(loud, t + 0.15); g.gain.exponentialRampToValueAtTime(0.001, t + 3.5);
    src.connect(f); f.connect(g); g.connect(this.fxBus); src.start(t); src.stop(t + 3.6);
  }

  /** Every frame: listener position, weather sounds, other players' voices. */
  update(cam, wx, paused) {
    if (!this.ctx) return;
    const L = this.ctx.listener, t = this.ctx.currentTime;
    this.listener.x = cam.position.x; this.listener.y = cam.position.y; this.listener.z = cam.position.z;
    if (L.positionX) {
      L.positionX.value = cam.position.x; L.positionY.value = cam.position.y; L.positionZ.value = cam.position.z;
      const f = { x: 0, y: 0, z: -1 }, u = { x: 0, y: 1, z: 0 };
      const q = cam.quaternion;
      const rot = (v) => { const ix = q.w * v.x + q.y * v.z - q.z * v.y, iy = q.w * v.y + q.z * v.x - q.x * v.z, iz = q.w * v.z + q.x * v.y - q.y * v.x, iw = -q.x * v.x - q.y * v.y - q.z * v.z; return { x: ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y, y: iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z, z: iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x }; };
      const F = rot(f), U = rot(u);
      L.forwardX.value = F.x; L.forwardY.value = F.y; L.forwardZ.value = F.z; L.upX.value = U.x; L.upY.value = U.y; L.upZ.value = U.z;
    }
    const k = paused ? 0.3 : 1;
    this.rain.gain.gain.setTargetAtTime(wx.rain * 0.22 * k, t, 0.3);
    this.stormWind.gain.gain.setTargetAtTime((wx.rain > 0.9 ? 0.25 : wx.snow * 0.12) * k, t, 0.5);
    // nearest 6 other cars get an engine sound
    const list = [...this.voices.values()].filter((v) => v.touched).sort((a, b) => a.dist - b.dist);
    list.forEach((v, i) => {
      const want = i < 6 && v.dist < 260 && !paused;
      if (want && !v.engine) v.engine = this.makeEngine(v.type, true);
      if (!want && v.engine) { this.stopEngine(v.engine); v.engine = null; }
      if (v.engine) {
        const p = v.engine.panner;
        p.positionX.value = v.pos.x; p.positionY.value = v.pos.y; p.positionZ.value = v.pos.z;
        this.setEngine(v.engine, v.rpm, v.throttle, 0.8);
      }
      if (v.wantHorn && !v.horn) {
        const pan = this.ctx.createPanner(); pan.panningModel = 'equalpower'; pan.refDistance = 8; pan.rolloffFactor = 1.2; pan.connect(this.fxBus);
        v.horn = { h: this.makeHorn(pan, 0.3), pan };
      }
      if (v.horn) { v.horn.pan.positionX.value = v.pos.x; v.horn.pan.positionY.value = v.pos.y; v.horn.pan.positionZ.value = v.pos.z; }
      if (!v.wantHorn && v.horn) { this.endHorn(v.horn.h); v.horn = null; }
      v.touched = false;
    });
  }

  silenceAll() {
    if (!this.ctx) return;
    for (const id of [...this.voices.keys()]) this.removeVoice(id);
    this.stopCar();
  }
}
