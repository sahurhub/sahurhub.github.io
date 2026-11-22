// LAWN MOWING SIMULATOR - the game controller: title screen, jobs, panels, saving.
// Offline only (user's choice 2026-11-22): progress is saved in this browser; no accounts,
// leaderboard, multiplayer or admin page.
import * as THREE from 'three';
import { FLAGS, PHYS_DT } from './config.js';
import { settings, saveSettings, store } from './core/store.js';
import { input, updateInput } from './core/input.js';
import { sfx, startEngine, stopEngine, updateEngine, unlockAudio } from './core/audio.js';
import { Renderer, FpsMonitor, PRESETS, guessPreset } from './render/renderer.js';
import { Sky } from './render/sky.js';
import { Clippings, Rain, Blobs } from './render/effects.js';
import { World } from './level/world.js';
import { Vehicle } from './mower/vehicle.js';
import { CameraRig, CAM_NAMES } from './game/camera.js';
import { Job } from './game/job.js';
import { Hud } from './ui/hud.js';
import { el, esc, toast, modal, closeModal, modalOpen, $ui, money } from './ui/ui.js';
import { openShop, openJobs, openStats, openSettings, openPause, openResults } from './ui/panels.js';
import { LocalBackend } from './net/backend.js';
import { MOWERS } from './shared/mowers.js';
import { LEVELS } from './shared/levels.js';

export class App {
  constructor(canvas) {
    this.canvas = canvas;
    this.R = new Renderer(canvas);
    this.flagsFps = FLAGS.fps;
    this.backend = new LocalBackend();
    this.profile = this.backend.profile;
    this.daily = this.backend.daily;
    this.state = 'loading';
    this.time = 0; this.acc = 0;
    this.paused = false;
    this.job = null;
    this.lastLevel = store.get('lms.lastLevel') || 'back-garden';
    window.LMS = this; // handy for testing in the console
  }

  async start() {
    const R = this.R;
    this.sky = new Sky(R.scene);
    this.blobs = new Blobs(R.scene);
    this.world = new World(R, this.sky, this.blobs);
    this.vehicle = new Vehicle(R.scene, this.blobs);
    this.camRig = new CameraRig(R.camera, this.canvas);
    this.camRig.setMode(settings.camera || 'third');
    this.clippings = new Clippings(R.scene, R.preset.clippings);
    this.rain = new Rain(R.scene);
    this.fpsMon = new FpsMonitor(R);
    this.hud = new Hud(this);
    R.onPresetChange((p) => {
      this.world.rebuildGrass();
      this.clippings.build(p.clippings);
      this.applyWeather(this.weather || 'sunny');
      toast(`Graphics: ${p.name}`);
    });
    const lvl = FLAGS.level && LEVELS[FLAGS.level] ? FLAGS.level : (this.profile.levels.includes(this.lastLevel) ? this.lastLevel : 'back-garden');
    this.loadLevel(lvl);
    this.applyWeather('sunny');
    this.vehicle.set(this.profile.eq.mower, this.profile.eq);
    this.parkVehicle();
    this.hud.setMoney(this.profile.money);
    this.hud.setMode(false);
    this.markers();
    this.showTitle();
    this.lastT = performance.now();
    if (!FLAGS.test) requestAnimationFrame(() => this.loop());
    this.state = 'title';
  }

  // ---------------------------------------------------------------- world
  loadLevel(id) {
    if (this.world.level && this.world.level.id === id) return;
    this.world.build(id);
    this.vehicle.addBlobs();
    this.markers();
    this.parkBody = null;
  }

  applyWeather(w) {
    this.weather = w;
    this.sky.set(w, this.R.preset.fog);
    this.rain.set(w === 'rain', this.R.preset.rain);
    if (this.world.ground.uniforms) this.world.ground.uniforms.uWet.value = this.sky.light.wet;
    this.clippings.setLight(new THREE.Color().copy(this.sky.light.amb).add(this.sky.light.sun));
    this.blobs.setOpacity(w === 'rain' ? 0.18 : w === 'evening' ? 0.22 : 0.32);
  }

  markers() {
    if (this.markerGroup) {
      this.R.scene.remove(this.markerGroup);
      this.markerGroup.traverse((o) => { if (o.isMesh) o.material.dispose(); });
      if (this.markerGeos) for (const g of this.markerGeos) g.dispose();
    }
    const g = new THREE.Group();
    this.markerGroup = g;
    this.markerList = [];
    const L = this.world.level;
    if (!L) return;
    const cone = new THREE.ConeGeometry(0.32, 0.7, 8); cone.rotateX(Math.PI);
    const ring = new THREE.RingGeometry(1.45, 1.7, 32); ring.rotateX(-Math.PI / 2);
    this.markerGeos = [cone, ring];
    for (const [kind, list] of Object.entries(L.stationZones)) for (const z of list) {
      const col = kind === 'compost' ? 0xffd23f : 0x4fb6ff;
      const c = new THREE.Mesh(cone, new THREE.MeshBasicMaterial({ color: col }));
      const r = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.6, depthWrite: false }));
      const y = this.world.heightAt(z.x, z.z);
      c.position.set(z.x, y + 2.6, z.z); r.position.set(z.x, y + 0.06, z.z);
      g.add(c, r);
      this.markerList.push({ kind, c, r, y });
    }
    this.R.scene.add(g);
  }

  parkVehicle() {
    const sp = this.world.level.spawn;
    this.parkBody = { x: sp.x, z: sp.z, h: sp.h, vx: 0, vz: 0, vf: 0, yawRate: 0, steerVis: 0, wheelSpin: 0, lapL: 0, lapR: 0, speed: () => 0 };
  }

  // ---------------------------------------------------------------- title / home
  showTitle() {
    this.hideTitle();
    const t = el('div', { class: 'title-screen' });
    t.innerHTML = `<div class="load-title">Lawn Mowing<span>Simulator</span></div>
      <div class="sub">${esc(LEVELS[this.world.level.id].name)} &middot; ${esc(MOWERS[this.profile.eq.mower].name)}</div>
      <div class="row"></div>`;
    const row = t.querySelector('.row');
    row.appendChild(el('button', { class: 'btn big', onclick: () => this.quickPlay() }, 'Play'));
    row.appendChild(el('button', { class: 'btn big blue', onclick: () => { this.openJobs(); } }, 'Jobs'));
    $ui().appendChild(t);
    this.titleEl = t;
    this.state = this.state === 'loading' ? 'loading' : 'title';
    this.hud.left.classList.remove('hidden');
  }
  hideTitle() { if (this.titleEl) { this.titleEl.remove(); this.titleEl = null; } }

  quickPlay() {
    unlockAudio();
    const lvl = this.profile.levels.includes(this.world.level.id) ? this.world.level.id : 'back-garden';
    this.startJob({ mode: 'free', level: lvl, weather: 'sunny' });
  }

  // ---------------------------------------------------------------- jobs
  async startJob(req) {
    if (this.starting) return;
    if (this.job && this.job.state === 'run') { toast('Finish or quit this job first.'); return; }
    this.starting = true;
    try {
      const cfg = await this.backend.startJob(req);
      cfg.req = req;
      this.hideTitle();
      closeModal(true);
      this.loadLevel(cfg.level);
      this.applyWeather(cfg.weather);
      const look = this.profile.eq;
      this.vehicle.set(cfg.mower, look);
      const ground = this.world.ground;
      ground.resetCut();
      this.world.resetObstacles();
      const job = new Job(cfg, this.world, {
        penalty: (p) => { toast(p.msg + (p.money ? ` (-${money(p.money)})` : ''), 'bad'); sfx.bad(); },
        bump: () => sfx.bump(),
        end: (reason) => this.onJobEnd(reason),
      });
      ground.setPattern(job.pattern);
      this.world.grass.setPattern(ground);
      ground.uniforms.uMissed.value = 0; this.world.grass.uniforms.uMissed.value = 0;
      this.job = job;
      this.paused = false;
      this.acc = 0;
      this.state = 'job';
      this.camRig.snap = true;
      this.hud.startJob(job);
      startEngine(MOWERS[cfg.mower].engine);
      this.lastLevel = cfg.level; store.set('lms.lastLevel', cfg.level);
      const intro = { standard: 'Mow the whole lawn!', timed: 'Beat the clock!', perfect: 'Cut every last blade!', pattern: 'Cut the light shape only!' }[cfg.kind];
      toast(intro, 'good');
      this.canvas.focus();
    } catch (e) {
      toast(e.message || 'Could not start the job.', 'bad');
      sfx.bad();
    } finally { this.starting = false; }
  }

  finishJob() {
    if (!this.job || this.job.state !== 'run') return;
    const j = this.job;
    const ok = j.cfg.kind === 'pattern' ? j.time > 20 : j.coverage >= 0.85;
    if (!ok) { toast('Mow at least 85% first.'); return; }
    j.end('finish');
  }

  async onJobEnd(reason) {
    const job = this.job;
    this.state = 'submitting';
    stopEngine();
    if (reason === 'done') { sfx.done(); toast(job.cfg.kind === 'pattern' ? 'Pattern finished!' : 'Lawn finished!', 'good'); }
    else if (reason === 'time') { sfx.bad(); toast("Time's up!", 'bad'); }
    this.hud.setMode(false);
    this.world.ground.uniforms.uMissed.value = 1; this.world.grass.uniforms.uMissed.value = 1;
    const submit = async () => {
      try {
        const out = await this.backend.finishJob(job.cfg, job.report());
        if (out.profile) this.setProfile(out.profile);
        if (out.pay && out.pay.total > 0) sfx.coin();
        this.state = 'results';
        openResults(this, job, out);
      } catch (e) {
        modal({
          title: 'Could not save the job', color: 'red', narrow: true, closable: false,
          render: (body) => {
            body.innerHTML = `<p style="font-size:18px;margin-top:0">${esc(e.message)}</p>`;
            const row = el('div', { class: 'row-btns' });
            row.appendChild(el('button', { class: 'btn grey', onclick: () => { closeModal(true); this.afterResults('home'); } }, 'Skip'));
            row.appendChild(el('button', { class: 'btn', onclick: () => { closeModal(true); submit(); } }, 'Try again'));
            body.appendChild(row);
          },
        });
      }
    };
    setTimeout(submit, reason === 'done' ? 900 : 300);
  }

  afterResults(next) {
    const job = this.job;
    this.job = null;
    this.state = 'title';
    this.world.ground.uniforms.uMissed.value = 0; this.world.grass.uniforms.uMissed.value = 0;
    // career offers are used up, so "again" there means a free mow at the same place
    if (next === 'again' && job) this.startJob(job.cfg.mode !== 'career' && job.cfg.req ? job.cfg.req : { mode: 'free', level: job.cfg.level, weather: job.cfg.weather });
    else if (next === 'career') this.openJobs('career');
    else if (next === 'board') this.openJobs();
    else { this.parkVehicle(); this.showTitle(); }
  }

  restartJob() {
    if (!this.job) return;
    const req = this.job.cfg.req;
    this.job.state = 'quit';
    this.job = null;
    stopEngine();
    this.state = 'title';
    this.startJob(req);
  }

  quitJob() {
    if (!this.job) return;
    this.job.state = 'quit';
    this.job = null;
    stopEngine();
    this.hud.setMode(false);
    this.world.ground.resetCut();
    this.world.resetObstacles();
    this.parkVehicle();
    this.state = 'title';
    this.paused = false;
    this.showTitle();
  }

  pause() { if (this.job && this.job.state === 'run') { this.paused = true; updateEngine(0, false, false); } }
  resume() { this.paused = false; this.canvas.focus(); }
  panelClosed() { if (this.state === 'job') this.resume(); }

  // ---------------------------------------------------------------- panels
  openShop(tab) { this.pause(); openShop(this, tab); }
  openJobs(tab) { this.pause(); openJobs(this, tab); }
  openStats() { this.pause(); openStats(this); }
  openSettings() { this.pause(); openSettings(this); }

  setProfile(p) {
    this.profile = p;
    this.hud.setMoney(p.money);
  }

  async equip(slot, id) {
    try {
      this.setProfile(await this.backend.equip(slot, id));
      this.refreshVehicle();
      sfx.click();
    } catch (e) { toast(e.message, 'bad'); }
  }

  // show cosmetic changes straight away (the mower itself only changes on the next job)
  refreshVehicle() {
    if (this.job && this.job.state === 'run') this.vehicle.applyLook(this.profile.eq);
    else this.vehicle.set(this.profile.eq.mower, this.profile.eq);
  }

  setQuality(v) {
    settings.quality = v;
    if (v !== 'auto') settings.autoScale = 1;
    saveSettings();
    this.R.setPreset(v === 'auto' ? guessPreset() : v);
    if (v === 'high' && !this.R.r.getContextAttributes().antialias) toast('Smoother edges on High appear after reloading the page.');
  }

  // ---------------------------------------------------------------- save
  // Start again from nothing (Settings > Save). The save lives in this browser only.
  resetSave() {
    if (this.job && this.job.state === 'run') this.quitJob();
    store.del('lms.guest.v1');
    this.backend = new LocalBackend();
    this.daily = this.backend.daily;
    this.setProfile(this.backend.profile);
    if (!this.profile.levels.includes(this.world.level.id)) this.loadLevel('back-garden');
    this.vehicle.set(this.profile.eq.mower, this.profile.eq);
    this.parkVehicle();
    if (this.titleEl) this.showTitle();
    toast('Save deleted. Starting fresh!');
  }

  // ---------------------------------------------------------------- frame loop
  loop() {
    requestAnimationFrame(() => this.loop());
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastT) / 1000);
    this.lastT = now;
    this.frame(dt);
  }

  frame(dt) {
    updateInput();
    const job = this.job && this.job.state === 'run' ? this.job : null;
    // one-shot buttons
    if (input.take('pause')) { if (modalOpen()) closeModal(); else if (job) { this.pause(); openPause(this); } }
    if (input.take('camera')) { const m = this.camRig.next(); this.vehicle.setFirstPerson(m === 'first'); toast('Camera: ' + CAM_NAMES[m]); }
    if (input.take('map')) { settings.minimap = !settings.minimap; saveSettings(); this.hud.setMode(!!job); }
    if (input.take('finish') && job && !this.paused) this.finishJob();
    if (input.take('reset') && job && !this.paused) { job.resetToStart(); toast('Back to the start.'); }
    input.take('action');
    this.time += dt;
    const W = this.world;
    let body = this.parkBody;
    if (job) {
      body = job.body;
      if (!this.paused && !modalOpen()) {
        this.acc += dt;
        let n = 0;
        while (this.acc >= PHYS_DT && n < 6) { job.fixedStep(PHYS_DT, this.autopilot ? this.autopilot(job) : input); this.acc -= PHYS_DT; n++; this.spawnClippings(job); }
        if (n === 6) this.acc = 0;
      }
      W.ground.upload(job.takeDirty());
      for (const e of job.takeEvents()) {
        if (e.type === 'emptied') { sfx.empty(); toast('Catcher emptied into the compost!', 'good'); }
        if (e.type === 'refuelled') { sfx.click(); toast(job.M.engine === 'electric' ? 'Battery charged!' : 'Tank filled up!', 'good'); }
      }
      updateEngine(job.body.vf / job.stats.speed, job.visN > 0, !this.paused && !modalOpen());
    } else if (this.job) {
      W.ground.upload(this.job.takeDirty());
    } else W.ground.upload(null);
    const terrain = (x, z) => W.heightAt(x, z);
    if (body) this.vehicle.update(dt, body, terrain, this.time);
    // camera
    if (this.state === 'title' || this.state === 'loading') {
      const L = W.level, b = L.bounds;
      const c = new THREE.Vector3((b[0] + b[2]) / 2, 0, (b[1] + b[3]) / 2);
      this.camRig.orbit(dt, c, Math.max(b[2] - b[0], b[3] - b[1]) * 0.55 + 4, Math.max(6, (b[2] - b[0]) * 0.25));
    } else if (body) {
      const spec = MOWERS[this.vehicle.mowerId];
      this.camRig.update(dt, { x: body.x, y: terrain(body.x, body.z), z: body.z, h: body.h, speed: Math.abs(body.vf) }, spec, terrain);
    }
    const cam = this.R.camera.position;
    W.update(dt, this.time, cam, this.camRig.look, body ? { x: body.x, z: body.z, r: (this.vehicle.size ? Math.max(this.vehicle.size.x, this.vehicle.size.z) * 0.45 : 0.5) } : null);
    this.sky.update(dt, cam);
    this.rain.update(this.time, cam);
    this.clippings.update(dt, terrain);
    // station markers: show when the catcher is getting full / fuel is low
    if (this.markerList) for (const m of this.markerList) {
      let on = false;
      if (job) {
        const s = job.sim;
        on = m.kind === 'compost' ? Number.isFinite(s.catcherMax) && s.catcher / s.catcherMax > 0.7 : s.fuelMax > 0 && s.fuel / s.fuelMax < 0.3;
      }
      m.c.visible = m.r.visible = on;
      if (on) { m.c.position.y = m.y + 2.6 + Math.sin(this.time * 4) * 0.25; m.c.rotation.y += dt * 2; }
    }
    this.hud.update(dt, job, this.fpsMon.fps);
    this.fpsMon.tick(dt, !!job && !this.paused);
    this.R.render();
  }

  spawnClippings(job) {
    const n = job.visN || 0;
    if (!n) return;
    const b = job.body, s = job.stats;
    const fx = Math.sin(b.h), fz = Math.cos(b.h), rx = -fz, rz = fx;
    const count = Math.min(4, Math.ceil(n / 5));
    const W = this.world;
    const mulch = !Number.isFinite(s.catcherMax);
    for (let i = 0; i < count; i++) {
      const lat = (Math.random() - 0.5) * s.width;
      const x = b.x + fx * s.deck + rx * lat, z = b.z + fz * s.deck + rz * lat;
      const y = W.heightAt(x, z) + 0.12;
      const side = job.M.rider === 'seat' && !job.M.turn.pivot ? 0 : (Math.random() - 0.5);
      const up = mulch ? 0.8 : 1.8 + Math.random() * 1.6;
      this.clippings.spawn(x, y, z,
        b.vx * 0.4 - fx * (1 + Math.random() * 1.5) + rx * side * 2.2,
        up,
        b.vz * 0.4 - fz * (1 + Math.random() * 1.5) + rz * side * 2.2);
    }
  }
}
