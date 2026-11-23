// PRESSURE WASHER SIMULATOR - game controller: loading, title, jobs, the frame loop, saving, clean-up.
// Offline single player: progress is saved in this browser (shared/economy.js).
import * as THREE from 'three';
import { FLAGS } from './config.js';
import { settings, saveSettings } from './core/store.js';
import { input, initInput, requestLock, exitLock } from './core/input.js';
import { on, onShutdown, shutdown } from './core/life.js';
import { sfx, unlockAudio, updateSpray, stopSpray, updateRefill, setAmbient, tickAudio } from './core/audio.js';
import { Renderer, FpsMonitor, guessPreset } from './render/renderer.js';
import { Env } from './render/env.js';
import { loadGLB, loadSky, loadTextures, setAnisotropy, disposeCaches, sceneMaterial } from './render/assets.js';
import { Particles, Jet } from './render/particles.js';
import { washGlobal } from './render/washmat.js';
import { Player } from './game/player.js';
import { Washer } from './game/washer.js';
import { Job, FINISH_AT } from './game/job.js';
import { Reveal } from './game/reveal.js';
import { Tutorial } from './game/tutorial.js';
import { Hud } from './ui/hud.js';
import { toast, closeScreen, clearToasts } from './ui/ui.js';
import { openTitle, openReady, openPause, openResults, showBusy, hideBusy } from './ui/screens.js';
import { JOBS, JOB_BY_ID } from './shared/jobs.js';
import { washerStats, colorHex } from './shared/upgrades.js';
import { loadProfile, saveProfile, resetProfile, finishJob } from './shared/economy.js';

const COMMON_TEX = ['paint', 'dirt', 'moss', 'wood', 'brick', 'grass', 'slabs', 'paving', 'render', 'roof', 'asphalt', 'concrete', 'stone'];

export class App {
  constructor(canvas) {
    this.canvas = canvas;
    this.R = new Renderer(canvas);
    this.env = new Env(this.R);
    this.player = new Player(this.R.camera);
    this.fpsMon = new FpsMonitor(this.R);
    this.profile = loadProfile();
    this.state = 'loading'; // loading | title | ready | play | paused | reveal | results
    this.time = 0;
    this.lastT = performance.now();
    this.raf = 0;
    this.job = null;
    this.glbCache = new Map(); // job id -> loaded GLB scene (kept for the current and the last job only)
    window.PWS = this; // handy for testing in the console
  }

  stats() { return washerStats(this.profile.up); }

  async boot(progress) {
    const P = (f) => progress && progress(f);
    this.hud = new Hud(this);
    this.hud.setFps(!!(settings.fps || FLAGS.fps));
    initInput(this.canvas, (locked, failed) => this.onLock(locked, failed));
    this.R.onPresetChange((p) => { this.applyQuality(); toast(`Graphics: ${p.name}`); });
    // the washer models, the sky, the textures and the first job
    let gotW = 0, gotT = 0, gotJ = 0;
    const tick = () => P(gotW * 0.15 + gotT * 0.5 + gotJ * 0.35);
    const first = JOB_BY_ID[FLAGS.job] || JOBS.find((j) => !this.profile.done[j.id]) || JOBS[0];
    const [wglb, sky] = await Promise.all([
      loadGLB('models/washer.glb', (f) => { gotW = f; tick(); }),
      loadSky(),
      loadTextures(COMMON_TEX, (f) => { gotT = f; tick(); }),
      this.fetchJob(first, (f) => { gotJ = f; tick(); }),
    ]);
    this.env.setSky(sky);
    this.models = {};
    for (const c of wglb.children) this.models[c.name] = c;
    this.parts = new Particles(this.R.scene, this.R.preset.particles);
    this.jet = new Jet(this.R.scene);
    this.washer = new Washer(this, this.models);
    this.applyProfile();
    this.reveal = new Reveal(this);
    await this.useJob(first);
    this.applyQuality();
    this.toTitle();
    on(window, 'pagehide', (e) => { if (!e.persisted) shutdown(); else this.hidden = true; });
    on(window, 'pageshow', (e) => { if (e.persisted && this.dead) location.reload(); });
    onShutdown(() => this.dispose());
    if (!FLAGS.test) this.raf = requestAnimationFrame(() => this.loop());
  }

  // ---------------------------------------------------------------- jobs
  async fetchJob(def, onProgress) {
    if (this.glbCache.has(def.id)) return this.glbCache.get(def.id);
    const g = await loadGLB(def.file, onProgress);
    this.glbCache.set(def.id, g);
    return g;
  }

  // build (or reuse) the job's world and put everything at the start
  async useJob(def) {
    if (this.job && this.job.def.id === def.id) {
      this.job.resetDirt();
    } else {
      const gltf = await this.fetchJob(def);
      if (this.job) {
        const old = this.job.def.id;
        this.job.dispose();
        // keep only the new job's GLB in memory
        for (const k of [...this.glbCache.keys()]) if (k !== def.id && k !== old) this.glbCache.delete(k);
      }
      this.job = new Job(this, def, gltf, this.models);
      this.env.fitShadow({ x0: this.job.bounds.x0 - 6, z0: this.job.bounds.z0 - 6, x1: this.job.bounds.x1 + 6, z1: this.job.bounds.z1 + 6 });
    }
    const j = this.job;
    j.surfaces.forEach((s) => s.upload());
    this.player.setWorld(j.boxes, j.bounds);
    const sp = j.points.spawn || { x: 0, y: 0, z: 0, yaw: 0 };
    this.player.place(sp.x, 0, sp.z, sp.yaw);
    const wp = j.points.washer || { x: sp.x + 1, z: sp.z, yaw: 0 };
    this.washer.place(wp.x, wp.z, wp.yaw);
    this.player.tether = this.washer.tether();
    this.parts.clear();
    this.env.refreshShadow();
    return j;
  }

  async startJob(id) {
    const def = JOB_BY_ID[id];
    if (!def || this.loadingJob) return;
    unlockAudio();
    this.reveal.finish();
    closeScreen(true);
    this.loadingJob = true;
    this.state = 'loading';
    if (!this.job || this.job.def.id !== id) showBusy('Loading ' + def.name + '...');
    try {
      await this.useJob(def);
    } catch (e) {
      console.error(e);
      hideBusy();
      this.loadingJob = false;
      toast('Could not load the job. Check your connection and try again.', 'bad', 4000);
      this.toTitle();
      return;
    }
    hideBusy();
    this.loadingJob = false;
    this.tutorial = !this.profile.tutorial && def.n === 1 ? new Tutorial() : null;
    this.state = 'ready';
    this.hud.show(false);
    this.washer.hideAll(true);
    openReady(this, this.job);
  }

  restartJob() { if (this.job) this.startJob(this.job.def.id); }

  quitJob() {
    if (this.job) this.job.state = 'idle';
    this.toTitle();
  }

  lockAndPlay() {
    if (this.lockMsg) this.lockMsg.textContent = '';
    unlockAudio();
    requestLock();
  }

  onLock(locked, failed) {
    if (failed) {
      if (this.lockMsg) this.lockMsg.textContent = 'The browser needs a moment. Click again.';
      return;
    }
    if (locked && (this.state === 'ready' || this.state === 'paused')) {
      closeScreen(true);
      if (this.state === 'ready') { this.job.state = 'play'; this.job.started = true; }
      this.state = 'play';
      this.job.state = 'play';
      input.playing = true;
      input.reset();
      this.hud.startJob(this.job);
      this.hud.show(true);
      this.washer.hideAll(false);
      this.R.showView = true;
      setAmbient(true);
      this.canvas.focus();
    } else if (!locked && this.state === 'play') {
      this.pause();
    }
  }

  pause() {
    this.state = 'paused';
    if (this.job) this.job.state = 'paused';
    input.playing = false;
    input.reset();
    stopSpray(); updateRefill(false);
    this.jet.hide();
    this.hud.show(false);
    openPause(this);
  }

  // Enter at 95%+, or automatically when everything is finished
  finishJob() {
    const j = this.job;
    if (!j || this.state !== 'play') return;
    this.state = 'reveal';
    j.state = 'done';
    input.playing = false;
    input.reset();
    stopSpray(); updateRefill(false);
    this.jet.hide();
    exitLock();
    this.hud.show(false);
    this.hud.tutorial(null);
    this.washer.hideAll(true);
    this.R.showView = false;
    clearToasts();
    if (this.tutorial) { this.profile.tutorial = true; this.saveProfile(); this.tutorial = null; }
    const result = { time: j.time, allDone: j.allDone, litres: this.litres || 0 };
    this.litres = 0;
    const before = this.profile.money;
    const out = finishJob(this.profile, j.def, result);
    this.reveal.start(j, () => {
      this.state = 'results';
      openResults(this, j, out);
      this.hud.setMoney(this.profile.money, this.profile.money - before);
    });
  }

  toTitle() {
    exitLock();
    input.playing = false;
    this.reveal.finish();
    stopSpray(); updateRefill(false);
    if (this.jet) this.jet.hide();
    this.state = 'title';
    this.hud.show(false);
    this.hud.tutorial(null);
    if (this.washer) this.washer.hideAll(true);
    this.R.showView = false;
    setAmbient(true);
    openTitle(this);
  }

  // ---------------------------------------------------------------- profile / settings
  saveProfile() { saveProfile(this.profile); }

  applyProfile() {
    if (!this.washer) return;
    this.washer.setStats(this.stats());
    this.washer.setColor(colorHex(this.profile.color));
    this.hud.setMoney(this.profile.money);
  }

  resetSave() {
    this.profile = resetProfile();
    this.applyProfile();
    toast('Save deleted. Starting fresh!', 'info');
  }

  setQuality(v) {
    settings.quality = v;
    if (v !== 'auto') settings.autoScale = 1;
    saveSettings();
    this.R.setPreset(v === 'auto' ? guessPreset() : v);
    this.applyQuality();
    if (v === 'high' && !this.R.r.getContextAttributes().antialias) toast('Smoother edges on High appear after reloading the page.');
  }

  applyQuality() {
    this.env.applyQuality();
    setAnisotropy(Math.min(this.R.preset.aniso, this.R.r.capabilities.getMaxAnisotropy()));
    if (this.parts && this.parts.max !== this.R.preset.particles) this.parts.build(this.R.preset.particles);
  }

  // ---------------------------------------------------------------- frame loop
  loop() {
    this.raf = requestAnimationFrame(() => this.loop());
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastT) / 1000);
    this.lastT = now;
    this.frame(dt);
  }

  frame(dt) {
    this.time += dt;
    washGlobal.uTime.value = this.time;
    if (input.take('fps')) { settings.fps = !settings.fps; saveSettings(); this.hud.setFps(settings.fps); }
    const job = this.job;
    const playing = this.state === 'play';
    let found = false, swapped = false;
    if (playing) {
      const [mx, my] = input.mouse();
      this.player.look(mx, my, settings.sens, settings.invertY);
      const move = { x: (input.down('right') ? 1 : 0) - (input.down('left') ? 1 : 0), z: (input.down('fwd') ? 1 : 0) - (input.down('back') ? 1 : 0) };
      this.player.update(dt, move, input.take('jump'));
      if (input.take('nozzle')) swapped = this.washer.toggleNozzle();
      if (input.take('tool1')) swapped = this.washer.setTool('narrow') || swapped;
      if (input.take('tool2')) swapped = this.washer.setTool('wide') || swapped;
      if (input.take('tool3')) swapped = this.washer.setTool('surface') || swapped;
      if (input.take('pause')) exitLock();
      found = input.down('find');
    } else {
      input.mouse();
      if (this.state === 'title' || this.state === 'results' || this.state === 'loading') this.orbit(dt);
    }
    washGlobal.uFind.value += ((found ? 1 : 0) - washGlobal.uFind.value) * Math.min(1, dt * 10);
    // washer: tank, spray, hose
    if (this.washer && job) {
      const use = input.take('use');
      this.washer.update(dt, {
        want: playing && input.down('spray'), useHeld: playing && input.down('use'), usePressed: playing && use,
        job, player: this.player, cam: this.R.camera, time: this.time, parts: playing ? this.parts : null, jet: this.jet, active: playing,
      });
      const w = this.washer;
      for (const e of w.events) {
        if (e === 'nozzle') sfx.nozzle();
        else if (e === 'empty') { sfx.empty(); toast('Out of water!', 'bad'); }
        else if (e === 'refill') sfx.full();
        else if (e === 'pickup' || e === 'drop') sfx.pickup();
        else if (e === 'nosurface') { sfx.bad(); toast('Buy the surface cleaner in Upgrades first.', 'bad'); }
      }
      if (w.spraying) this.litres = (this.litres || 0) + dt * 0.7;
      updateSpray(w.spraying, w.power(), w.tool, w.hit ? w.hit.distance : null, w.cleaning > 0);
      updateRefill(w.refilling);
      // job progress
      const evs = job.update(dt, this.R.preset.uploads);
      for (const e of evs) {
        if (this.state !== 'play') continue;
        sfx.ding();
        this.hud.ding(e.surface.name + ' sparkling!');
        for (let i = 0; i < 26; i++) {
          const k = (Math.random() * e.surface.count) | 0;
          if (e.surface.count) this.parts.sparkle(e.surface.pos[k * 3], e.surface.pos[k * 3 + 1] + 0.04, e.surface.pos[k * 3 + 2]);
        }
      }
      if (playing) {
        if (job.allDone) this.finishJob();
        else if (input.take('finish')) {
          if (job.progress >= FINISH_AT) this.finishJob();
          else toast(`Clean at least ${Math.round(FINISH_AT * 100)}% first (${Math.floor(job.progress * 100)}% now).`, 'info');
        }
      }
      // tutorial
      if (this.tutorial && this.state === 'play') {
        const t = this.tutorial.update(dt, {
          walked: this.player.walked, looked: this.player.looked, cleaning: w.cleaning > 0, swapped,
          refilled: w.events.includes('refill'), found, picked: w.events.includes('pickup'),
        });
        this.hud.tutorial(t && t.text, t && t.step, t && t.total);
        if (!t) { this.profile.tutorial = true; this.saveProfile(); this.tutorial = null; }
      }
    }
    if (this.state === 'reveal') this.reveal.update(dt);
    input.pressed.clear();
    if (this.parts) {
      this.parts.setScale(this.R.r.domElement.height, this.R.camera.fov);
      this.parts.update(dt);
    }
    tickAudio();
    this.hud.update(dt);
    this.fpsMon.tick(dt, playing);
    this.R.render();
  }

  // slow camera drift behind the menus: low down on the player's side, so you see the job and the sky
  orbit(dt) {
    const j = this.job;
    if (!j) return;
    const c = j.centre(), cam = this.R.camera, sp = j.points.spawn || { x: c.x, z: c.z + c.r };
    const base = Math.atan2(sp.z - c.z, sp.x - c.x);
    const a = base + Math.sin(this.time * 0.07) * 0.55;
    const r = c.r * 0.95;
    cam.position.set(c.x + Math.cos(a) * r, c.y + 1.3 + c.r * 0.12, c.z + Math.sin(a) * r);
    cam.lookAt(c.x, c.y + 0.9, c.z);
    cam.updateMatrixWorld();
  }

  // ---------------------------------------------------------------- leaving the page
  dispose() {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    try {
      if (this.job) this.job.dispose();
      if (this.washer) this.washer.dispose();
      if (this.parts) this.parts.dispose();
      if (this.jet) this.jet.dispose();
      this.env.dispose();
      this.glbCache.forEach((g) => g.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }));
      this.glbCache.clear();
      if (this.models) for (const m of Object.values(this.models)) m.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
      disposeCaches();
      this.R.dispose();
    } catch (e) { /* page is going away anyway */ }
    window.PWS = null;
  }
}
