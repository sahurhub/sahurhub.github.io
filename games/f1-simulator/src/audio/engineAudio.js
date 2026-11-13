// Synthesised car audio (Web Audio API, no sound files): engine note that follows rpm, throttle
// and load, turbo whine, wind, tyre squeal, kerb rumble, gear-change blip and start-light beeps.
// The engine voice is built from the season's engine data (cylinders, rev range), so a V10 from
// another era gets a different firing frequency and a higher scream than the 2026 V6 hybrid.
import { clamp } from '../core/math.js';

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.volume = 0.7;
    this.ready = false;
    this.disabled = false;
  }

  /** Must be called from a click or key press (browsers block audio before that). */
  start(engineSpec) {
    if (this.disabled) return; // silent mode (page opened with ?mute, used by automated tests)
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (this.ready) this.stopEngine();
    const ctx = this.ctx;
    this.cyl = (engineSpec && engineSpec.cylinders) || 6;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 5;
    this.master.connect(comp).connect(ctx.destination);

    // engine: three detuned sawtooth voices at harmonics of the firing frequency
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 900; this.engFilter.Q.value = 1.2;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 2.4); }
    shaper.curve = curve;
    this.engGain.connect(shaper).connect(this.engFilter).connect(this.master);
    this.osc = [0.5, 1, 2, 3].map((h, k) => {
      const o = ctx.createOscillator();
      o.type = k === 1 ? 'sawtooth' : k === 0 ? 'square' : 'sawtooth';
      const g = ctx.createGain();
      g.gain.value = [0.34, 0.5, 0.2, 0.09][k];
      o.connect(g).connect(this.engGain);
      o.start();
      return { o, h };
    });
    // turbo / hybrid whine
    this.whine = ctx.createOscillator(); this.whine.type = 'sine';
    this.whineGain = ctx.createGain(); this.whineGain.gain.value = 0;
    this.whine.connect(this.whineGain).connect(this.master);
    this.whine.start();

    // noise sources: wind, tyres, kerbs
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const mkNoise = (type, freq, q) => {
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(f).connect(g).connect(this.master);
      src.start();
      return { src, f, g };
    };
    this.wind = mkNoise('lowpass', 500, 0.5);
    this.squeal = mkNoise('bandpass', 1900, 9);
    this.rumble = mkNoise('lowpass', 120, 1);
    this.ready = true;
    this.lastGear = 0;
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  /** Call every frame with the player's car. */
  update(veh, muted = false) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, k = 0.035;
    const rpm = clamp(veh.rpm, 2500, 20000);
    const fire = (rpm / 60) * (this.cyl / 2);
    for (const { o, h } of this.osc) o.frequency.setTargetAtTime(fire * h, t, 0.015);
    const load = 0.32 + 0.68 * veh.throttle;
    this.engGain.gain.setTargetAtTime(muted ? 0 : 0.2 * load + 0.05, t, k);
    this.engFilter.frequency.setTargetAtTime(500 + rpm * 0.16 + veh.throttle * 1500, t, k);
    this.whine.frequency.setTargetAtTime(900 + rpm * 0.52, t, k);
    this.whineGain.gain.setTargetAtTime(muted ? 0 : 0.012 + 0.03 * veh.throttle + (veh.deployKw > 50 ? 0.02 : 0), t, 0.08);
    const sp = veh.speed;
    this.wind.g.gain.setTargetAtTime(muted ? 0 : clamp((sp / 95) ** 2, 0, 1) * 0.22, t, 0.1);
    this.wind.f.frequency.setTargetAtTime(300 + sp * 14, t, 0.1);
    const sq = Math.max(veh.squeal, veh.lock, veh.spin * 0.7);
    this.squeal.g.gain.setTargetAtTime(muted ? 0 : sq * 0.16, t, 0.05);
    this.squeal.f.frequency.setTargetAtTime(1500 + veh.lock * 900 + sp * 6, t, 0.05);
    this.rumble.g.gain.setTargetAtTime(muted ? 0 : veh.rumble * clamp(sp / 30, 0, 1) * 0.5, t, 0.03);
    this.rumble.f.frequency.setTargetAtTime(70 + sp * 1.6, t, 0.05);
    if (veh.gear !== this.lastGear) {
      if (this.lastGear && !muted) this.blip(veh.gear > this.lastGear ? 180 : 260, 0.05, 0.12, 'square');
      this.lastGear = veh.gear;
    }
    if (veh.wallHit > 2 && !muted) this.thud(clamp(veh.wallHit / 20, 0.2, 1));
    if (veh.contact > 0 && !muted) { this.thud(clamp(veh.contact / 12, 0.15, 0.8)); veh.contact = 0; }
  }

  blip(freq, dur = 0.12, vol = 0.25, type = 'sine') {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol * this.volume, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }

  thud(vol) {
    if (!this.ctx || (this._thudT && this.ctx.currentTime - this._thudT < 0.25)) return;
    this._thudT = this.ctx.currentTime;
    this.blip(70, 0.25, vol * 0.9, 'triangle');
    this.blip(140, 0.12, vol * 0.5, 'sawtooth');
  }

  /** Start-light beep (one per red light) and the higher "go" tone. */
  lightBeep(go = false) { this.blip(go ? 880 : 440, go ? 0.5 : 0.18, 0.3, 'sine'); }

  stopEngine() {
    if (!this.ready) return;
    try {
      this.osc.forEach(({ o }) => o.stop());
      this.whine.stop(); this.wind.src.stop(); this.squeal.src.stop(); this.rumble.src.stop();
      this.master.disconnect();
    } catch { /* already stopped */ }
    this.ready = false;
  }
}
