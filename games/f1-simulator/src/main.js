// Application entry point: loads data, shows menus, creates a session (track + cars + race
// logic + graphics + HUD + sound) and runs the game loop.
import { Engine } from './render/engine.js';
import { loadTrack } from './track/track.js';
import { computeRacingLine } from './track/racingLine.js';
import { buildTrackMeshes } from './track/trackMesh.js';
import { CarLibrary } from './cars/carVisual.js';
import { CameraRig } from './render/cameras.js';
import { RaceSession } from './race/session.js';
import { PHYSICS_DT } from './physics/vehicle.js';
import { Input, DEFAULT_KEYS } from './core/input.js';
import { GameAudio } from './audio/engineAudio.js';
import { Hud } from './ui/hud.js';
import { HaloHud3D } from './ui/haloHud3d.js';
import { Menu } from './ui/menu.js';
import * as store from './core/storage.js';
import { TIPS } from './config.js';
import { wrapPi } from './core/math.js';

const $ = (id) => document.getElementById(id);
const getJson = async (path) => (await fetch(new URL(`../${path}`, import.meta.url))).json();
// Wait for the next paint (or 80 ms if the tab is in the background and frames are paused).
const nextFrame = () => new Promise((r) => { requestAnimationFrame(() => r()); setTimeout(r, 80); });

class App {
  constructor() {
    this.session = null;
    this.paused = false;
    this.running = false;
    this.frame = this.frame.bind(this);
  }

  async boot() {
    this.settings = await store.loadSettings();
    this.records = await store.load('records', {});
    this.season = await getJson('data/seasons/2026.json');
    this.regs = await getJson(`data/regulations/${this.season.regulations}.json`);
    this.circuitId = 'monza';
    this.circuitName = 'Autodromo Nazionale Monza';
    this.input = new Input({ ...DEFAULT_KEYS, ...(this.settings.keys || {}) });
    this.input.enabled = false;
    this.audio = new GameAudio();
    this.audio.volume = this.settings.volume;
    // adding ?mute to the address runs the game with no sound at all
    this.audio.disabled = new URLSearchParams(location.search).has('mute');
    this.lib = new CarLibrary(this.season);
    const idx = await this.lib.init();
    this.carCredits = idx.credits || [];
    this.menu = new Menu($('ui'), this);
    this.menu.main();
    window.addEventListener('beforeunload', (e) => {
      if (this.session && this.running) { e.preventDefault(); e.returnValue = ''; }
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.running && !this.paused) this.pause(); });
  }

  saveSettings() { return store.save('settings', this.settings); }

  progress(frac, what) {
    $('loading-fill').style.width = Math.round(frac * 100) + '%';
    if (what) $('loading-what').textContent = what;
  }

  async startSession(opts) {
    this.lastOpts = opts;
    const s = this.settings;
    this.menu.clear();
    $('loading').classList.remove('hidden');
    $('loading-tip').textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
    this.progress(0.03, 'Reading circuit data');
    await nextFrame();
    try {
      this.track = this.track || (await loadTrack(this.circuitId));
      this.progress(0.12, 'Working out the racing line');
      await nextFrame();
      this.line = this.line || computeRacingLine(this.track);
      this.progress(0.25, 'Building the circuit');
      await nextFrame();
      const engine = new Engine($('game'), s.quality);
      const trackVis = buildTrackMeshes(this.track, this.line, engine);
      engine.scene.add(trackVis.group);
      this.progress(0.32, 'Loading the circuit model');
      await trackVis.ready;
      this.progress(0.45, 'Setting up the grid');
      await nextFrame();
      const race = opts.mode === 'race';
      const session = new RaceSession({
        track: this.track, line: this.line, regs: this.regs, season: this.season,
        mode: opts.mode, laps: s.laps, difficulty: s.difficulty, playerDriverId: s.driver,
        playerGrid: s.grid, assists: { ...s.assists }, compound: s.compound || 'soft', seed: opts.seed,
        fuel: race ? 3 + s.laps * 1.35 : 6,
      });
      const models = [...new Set(session.cars.map((c) => c.team.model))];
      this.lib.onProgress = (f, file) => this.progress(0.45 + f * 0.45, 'Loading cars: ' + file);
      await this.lib.preload(models, session.player.team.model);
      this.progress(0.93, 'Placing cars');
      const visuals = [];
      let playerVis = null;
      for (const car of session.cars) {
        const v = await this.lib.make(car.team, car.isPlayer, engine.q, car.driver);
        engine.scene.add(v.group);
        v.update(car.veh, null);
        visuals.push(v);
        if (car.isPlayer) playerVis = v;
      }
      const rig = new CameraRig(engine.camera);
      rig.set(s.camera);
      const round = this.season.calendar.find((r) => r.circuitId === this.circuitId);
      const title = round ? round.name : this.circuitName;
      const hud = new Hud($('hud'), session, { title });
      const haloHud = new HaloHud3D(playerVis, session.player.team);
      Object.assign(this, { engine, trackVis, session, visuals, rig, hud, title, playerVis, haloHud });
      this.audio.start(this.regs.physics.engine);
      this.audio.setVolume(s.volume);
      // draw once so shaders compile before the lights sequence starts
      playerVis.group.updateMatrixWorld(true);
      rig.update(session.player.veh, 0.016, playerVis);
      engine.focus(session.player.veh.x, session.player.veh.z);
      engine.renderer.compile(engine.scene, engine.camera);
      engine.render();
      this.progress(1, 'Ready');
      await nextFrame();
      $('loading').classList.add('hidden');
      this.input.clear();
      this.input.enabled = true;
      this.paused = false;
      this.running = true;
      this.acc = 0; this.last = performance.now();
      this.lightsSeen = 0; this.wrongT = 0; this.fpsT = 0; this.fpsN = 0; this.fps = 0; this.resultsShown = false;
      this.bestSeen = session.player.bestLap;
      requestAnimationFrame(this.frame);
    } catch (err) {
      console.error(err);
      $('loading').classList.add('hidden');
      this.endSession();
      this.menu.error(String(err && err.message ? err.message : err));
    }
  }

  frame(now) {
    if (!this.running) return;
    requestAnimationFrame(this.frame);
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    this.tick(dt);
  }

  /** One frame of game time. Separate from frame() so tests can drive it without a display. */
  tick(dt, render = true) {
    const { session, input, rig, engine } = this;
    const car = session.player, veh = car.veh;
    if (input.take('pause')) { if (this.paused) this.resume(); else if (!this.resultsShown) this.pause(); }
    if (!this.paused) {
      if (!car.ai) {
        input.read(car.ctl, dt, veh.speed);
        if (veh.assist.autoGear) car.ctl.shift = 0;
      }
      if (input.take('camera')) { const c = rig.next(); this.settings.camera = c.id; this.saveSettings(); }
      if (input.take('reset') && session.state === 'racing') session.resetCar(car);
      rig.lookBack = input.held('lookBack');
      this.acc += dt;
      let n = 0;
      while (this.acc >= PHYSICS_DT && n < 24) { session.step(); this.acc -= PHYSICS_DT; n++; }
      if (n === 24) this.acc = 0;
      // start lights sound
      if (session.state === 'grid' && session.lights !== this.lightsSeen) { this.lightsSeen = session.lights; if (session.lights > 0) this.audio.lightBeep(false); }
      if (session.state === 'racing' && this.lightsSeen > 0) { this.lightsSeen = 0; this.audio.lightBeep(true); }
      // wrong way warning
      const dpsi = veh.loc.i >= 0 ? Math.abs(wrapPi(veh.psi - this.track.psi[veh.loc.i])) : 0;
      this.wrongT = dpsi > 1.9 && veh.speed > 5 ? this.wrongT + dt : 0;
      // lap records
      if (car.bestLap != null && car.bestLap !== this.bestSeen) { this.bestSeen = car.bestLap; this.saveRecord(car); }
      if (car.finished && !car.coast) car.coast = true;
      if (veh.ersMode !== this.ersSeen) {
        if (this.ersSeen != null) session.say('ERS ' + ['Harvest', 'Medium', 'Hotlap'][veh.ersMode], 'info');
        this.ersSeen = veh.ersMode;
      }
      if (session.state === 'finished' && !this.resultsShown) this.showResults();
    }
    if (!render) return;
    const camPos = engine.camera.position;
    for (let k = 0; k < this.visuals.length; k++) this.visuals[k].update(session.cars[k].veh, camPos);
    this.playerVis.group.updateMatrixWorld(true);
    const camDef = rig.update(veh, dt, this.playerVis);
    this.playerVis.setTcamVisible(!camDef.haloHud);
    this.haloHud.setVisible(!!camDef.haloHud);
    if (camDef.haloHud) {
      const pc = session.player, ahead = session.mode === 'race' ? session.order[pc.pos - 2] : null;
      this.haloHud.update(dt, veh, {
        pos: session.mode === 'race' ? pc.pos : '-',
        name: pc.driver.name.split(' ').pop(),
        ahead: ahead ? `${ahead.pos}  ${ahead.driver.name.split(' ').pop().toUpperCase()}` : '',
      });
    }
    engine.focus(veh.x, veh.z);
    this.trackVis.setStartLights(session.state === 'grid' ? session.lights : 0);
    engine.render();
    this.fpsN++; this.fpsT += dt;
    if (this.fpsT >= 0.5) { this.fps = Math.round(this.fpsN / this.fpsT); this.fpsN = 0; this.fpsT = 0; }
    this.hud.update(dt, { camera: rig.current.name, haloHud: !!camDef.haloHud, wrongWay: this.wrongT > 1, fps: this.settings.showFps ? this.fps : null });
    this.audio.update(veh, this.paused || this.resultsShown);
  }

  saveRecord(car) {
    const key = `${this.circuitId}:${this.season.year}`;
    const old = this.records[key];
    if (!old || car.bestLap < old.time) {
      this.records[key] = { time: car.bestLap, driver: car.driver.name, team: car.team.name, date: new Date().toISOString().slice(0, 10) };
      store.save('records', this.records);
      if (old) this.session.say('New personal best', 'purple');
    }
  }

  showResults() {
    this.resultsShown = true;
    this.input.enabled = false;
    this.menu.results(this.session, { title: `${this.title}, ${this.session.laps} laps` });
  }

  pause() {
    if (!this.session || this.paused || this.resultsShown) return;
    this.paused = true;
    this.input.enabled = false;
    this.menu.pause();
  }

  resume() {
    this.menu.clear();
    this.paused = false;
    this.input.clear();
    this.input.enabled = true;
    this.last = performance.now();
  }

  endSession() {
    this.running = false;
    this.input.enabled = false;
    this.audio.stopEngine();
    if (this.hud) this.hud.destroy();
    if (this.engine) this.engine.dispose();
    this.engine = this.hud = this.session = this.visuals = this.rig = this.trackVis = null;
  }

  restart() { this.endSession(); this.startSession(this.lastOpts); }
  quit() { this.endSession(); this.menu.main(); }
}

const app = new App();
window.__game = app; // handy for testing from the browser console
app.boot().catch((e) => {
  console.error(e);
  document.getElementById('ui').innerHTML = `<div class="screen"><div class="body"><div class="center"><h1>Could not start</h1><p class="note">${String(e)}</p></div></div></div>`;
});
