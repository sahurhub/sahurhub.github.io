// Game orchestrator: owns the systems, runs the fixed-step simulation and rendering, handles
// interaction, vehicles, district locks, saving, settings and the action layer used by the UI.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { VEHICLE_BY_ID, DISTRICTS, CITY, CALL_COOLDOWN, GAME_VERSION } from './config.js';
import { Emitter, clamp, FLAGS, fmtMoney } from './utils.js';
import { generateCity, districtAtCell, districtAt, cellOf, gx } from './cityLayout.js';
import { CollisionWorld } from './physics.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Vehicle } from './vehicles.js';
import { CameraRig } from './camera.js';
import { Input } from './input.js';
import { JobSystem } from './delivery.js';
import { Economy, createProfile, migrateProfile } from './economy.js';
import { Progression } from './progression.js';
import { NPCSystem } from './npc.js';
import { Traffic } from './traffic.js';
import { Effects } from './effects.js';
import { Audio } from './audio.js';
import { SaveManager } from './save.js';
import { Preview } from './preview.js';
import { RouteArrows, DirectionArrow, PoiIcon } from './markers.js';
import { findPath } from './cityLayout.js';
import { snapshotSession, restoreSession } from './net/protocol.js';

export const DEFAULT_SETTINGS = {
  master: 0.8, sfx: 0.8, engine: 0.7, ambient: 0.5, sensitivity: 1, invertY: false,
  quality: 'high', fov: 70, showFps: false, timeMode: 'cycle', minimapRotate: true,
};
const QUALITY = {
  low: { ratio: 0.85, shadows: false, map: 1024, view: 360, npc: 12, traffic: 10 },
  medium: { ratio: 1, shadows: true, map: 1024, view: 460, npc: 22, traffic: 16 },
  high: { ratio: 1.5, shadows: true, map: 2048, view: 560, npc: 30, traffic: 24 },
};
const STEP = 1 / 60;

export class Game {
  constructor(container) {
    this.container = container;
    this.events = new Emitter();
    this.save = new SaveManager();
    this.settings = { ...DEFAULT_SETTINGS };
    this.clock = 0;
    this.frame = 0;
    this.state = 'loading';
    this.paused = false;
    this.menuOpen = false;
    this.vehicle = null;
    this.callCooldown = 0;
    this.accum = 0;
    this.lastLockToast = 0;
    this.fps = 60;
  }

  // ---------------------------------------------------------------- setup
  initRenderer() {
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(r.domElement);
    this.renderer = r;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.3, 1600);
    const pm = new THREE.PMREMGenerator(r);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.45;
    this.input = new Input(r.domElement);
    this.input.onLockChange = locked => {
      if (!locked && this.state === 'playing' && !this.menuOpen && !this.expectUnlock) this.ui.openPause();
      this.expectUnlock = false;
    };
    addEventListener('resize', () => this.resize());
    this.resize();
  }
  resize() {
    const w = this.container.clientWidth || innerWidth, h = this.container.clientHeight || innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.effects) this.effects.setScale(h);
  }

  async loadSettings() {
    const s = await this.save.loadSettings();
    if (s) Object.assign(this.settings, s);
  }

  buildWorld(onStep) {
    this.layout = generateCity();
    this.collision = new CollisionWorld(this.layout);
    this.world = new World(this.scene, this.layout, this.settings);
    this.world.build(onStep);
    // the world adds sign post colliders while building
    for (const c of this.layout.colliders) if (c._s === undefined) this.collision.add(c);
    this.effects = new Effects(this.scene, this.settings.quality);
    this.effects.setScale(this.container.clientHeight || innerHeight);
    this.audio = new Audio(this.settings);
    this.preview = new Preview();
    this.cam = new CameraRig(this.camera, this.collision);
    this.routeArrows = new RouteArrows(this.scene);
    this.arrow = new DirectionArrow(this.scene);
    // one real headlight for the player's vehicle (always in the scene so shaders never recompile)
    this.headlight = new THREE.SpotLight(0xfff1cc, 0, 55, 0.6, 0.55, 1.1);
    this.headlight.castShadow = false;
    this.scene.add(this.headlight, this.headlight.target);
    this.poiIcons = [
      new PoiIcon(this.scene, 'garage', this.layout.pois.garage.x, 9, this.layout.pois.garage.z - 4, 3),
      new PoiIcon(this.scene, 'dealer', this.layout.pois.dealership.x, 11, this.layout.pois.dealership.z - 4, 3),
    ];
  }

  async loadProfile() {
    let p = FLAGS.fresh ? null : await this.save.loadProfile();
    this.isNewPlayer = !p;
    this.profile = migrateProfile(p || createProfile());
  }

  startSystems() {
    const q = QUALITY[this.settings.quality] || QUALITY.high;
    this.eco = new Economy(this.profile, this.events);
    this.player = new Player(this.scene, this.collision, this.layout);
    this.jobs = new JobSystem(this);
    this.progress = new Progression(this);
    this.npcs = new NPCSystem(this, q.npc);
    this.traffic = new Traffic(this, q.traffic);
    this.applySettings();
    this.applyCosmetics();
    this.applyEquipment();
    this.world.setBarriers(d => this.eco.isUnlocked(d));
    this.world.setTime(this.profile.time || 9);
    this.wireEvents();
    // place the player
    const sp = this.layout.pois.spawn;
    this.player.place(sp.x, sp.z, sp.ry);
    if (this.profile.equipped !== 'walk') this.spawnVehicle(this.profile.equipped, true);
    if (this.profile.player) restoreSession(this, this.profile.player);
    this.cam.snapBehind(this.player.vehicle ? this.player.vehicle.h : this.player.heading);
    this.progress.init();
    this.lastPos = { x: this.player.pos.x, z: this.player.pos.z };
    this.validPos = { x: this.player.pos.x, z: this.player.pos.z };
  }

  wireEvents() {
    const ev = this.events;
    ev.on('job:complete', e => {
      const p = this.player.vehicle ? this.player.vehicle.object.position : this.player.pos;
      this.effects.coinBurst(p.x, p.y + 1.5, p.z, 30);
      this.effects.confetti(p.x, p.y + 1.2, p.z, 50);
      this.audio.deliver();
      if (!this.player.vehicle) this.player.emote = 'cheer';
      this.saveSoon();
    });
    ev.on('job:pickup', () => { this.audio.pickup(); const p = this.player.pos; this.effects.ring(p.x, p.y + 0.3, p.z, '#2f80ed'); });
    ev.on('job:drop', e => { if (!e.last) { this.audio.pickup(); this.audio.coin(2); } });
    ev.on('job:failed', () => { this.audio.fail(); this.saveSoon(); });
    ev.on('levelup', () => {
      this.audio.levelUp();
      const p = this.player.vehicle ? this.player.vehicle.object.position : this.player.pos;
      this.effects.confetti(p.x, p.y + 2, p.z, 120);
      this.effects.ring(p.x, p.y + 0.5, p.z, '#ffd23f', 50);
      this.jobs.refreshBoard('downtown', true);
      this.saveSoon();
    });
    ev.on('purchase', () => { this.audio.purchase(); this.saveSoon(); });
    ev.on('district', () => { this.audio.purchase(); this.world.setBarriers(d => this.eco.isUnlocked(d)); this.saveSoon(); });
    ev.on('cosmetics', () => { this.applyCosmetics(); this.saveSoon(); });
    ev.on('achievement', () => this.audio.achievement());
    ev.on('event:start', () => this.audio.event());
    ev.on('trial:tick', n => this.audio.beep(n === 0));
    ev.on('trial:checkpoint', () => this.audio.checkpoint());
    ev.on('trial:end', e => { if (!e.cancelled) { this.audio.deliver(); this.saveSoon(); } });
  }

  // ---------------------------------------------------------------- settings / cosmetics
  applySettings() {
    const s = this.settings;
    const q = QUALITY[s.quality] || QUALITY.high;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q.ratio));
    this.renderer.shadowMap.enabled = q.shadows;
    if (this.world) {
      this.world.sun.castShadow = q.shadows;
      if (this.world.sun.shadow.mapSize.x !== q.map) {
        this.world.sun.shadow.mapSize.set(q.map, q.map);
        if (this.world.sun.shadow.map) { this.world.sun.shadow.map.dispose(); this.world.sun.shadow.map = null; }
      }
      this.settings.viewDist = q.view;
      this.scene.fog.far = q.view + 200;
      this.scene.fog.near = q.view * 0.4;
    }
    if (this.npcs) this.npcs.setMax(q.npc);
    if (this.traffic) this.traffic.setMax(q.traffic);
    this.input.sensitivity = s.sensitivity;
    this.input.invertY = s.invertY;
    this.cam && (this.cam.fovBase = s.fov);
    if (this.audio) this.audio.applyVolumes();
    this.resize();
  }
  saveSettings() { this.save.saveSettings(this.settings); }

  applyCosmetics() {
    const cs = this.profile.cosmetics;
    const ch = this.player.char;
    ch.setColors({ shirt: cs.shirt, pants: cs.pantsColor });
    for (const slot of ['hat', 'face', 'back']) {
      if ((ch._eq || {})[slot] !== cs.equipped[slot]) ch.setAccessory(slot, cs.equipped[slot]);
    }
    ch._eq = { ...cs.equipped };
  }
  applyEquipment() {
    const e = id => this.eco.hasEquip(id);
    this.player.speedMult = e('sneakers') ? 1.3 : e('shoes') ? 1.15 : 1;
    this.player.jumpMult = e('sneakers') ? 1.18 : 1;
  }

  // ---------------------------------------------------------------- vehicles
  nearestLane(x, z) {
    // closest road centre line, then the lane next to the curb, heading along the road
    const i = Math.round((x - CITY.origin) / CITY.cell), j = Math.round((z - CITY.origin) / CITY.cell);
    const vx = gx(i), hz = gx(j);
    const ci = cellOf(x), cj = cellOf(z);
    const candidates = [];
    if (this.layout.hasV(i, clamp(cj, 0, CITY.cells - 1))) candidates.push({ d: Math.abs(x - vx), x: vx + Math.sign(x - vx || 1) * 5.0, z: clamp(z, gx(cj) + 12, gx(cj + 1) - 12), h: x > vx ? Math.PI : 0 });
    if (this.layout.hasH(clamp(ci, 0, CITY.cells - 1), j)) candidates.push({ d: Math.abs(z - hz), x: clamp(x, gx(ci) + 12, gx(ci + 1) - 12), z: hz + Math.sign(z - hz || 1) * 5.0, h: z > hz ? -Math.PI / 2 : Math.PI / 2 });
    candidates.sort((a, b) => a.d - b.d);
    return candidates[0] || { x, z, h: 0 };
  }
  spawnVehicle(id, initial = false) {
    if (this.vehicle) {
      if (this.player.vehicle) this.player.exit();
      this.vehicle.dispose();
      this.vehicle = null;
    }
    if (!id || id === 'walk') { this.audio.setVehicle(null); return; }
    const def = VEHICLE_BY_ID[id];
    const v = new Vehicle(def, this.eco.custom(id), { layout: this.layout });
    this.scene.add(v.object);
    this.vehicle = v;
    const p = this.player.pos;
    const lane = initial && this.layout.pois.garage ? { x: this.layout.pois.garage.x + 6, z: this.layout.pois.garage.z + 3.2, h: Math.PI / 2 } : this.nearestLane(p.x, p.z);
    const r = this.collision.resolveCircle(lane.x, lane.z, v.radius + 0.3, 0, 0.3);
    v.place(r.x, r.z, lane.h);
    this.refreshCargoDisplay();
  }
  callVehicle() {
    if (this.profile.equipped === 'walk') return this.toast('You have no vehicle equipped. Buy one at Wheelhouse Motors.', 'warn');
    if (this.player.vehicle) return;
    if (this.callCooldown > 0 && !this.profile.garage.expresscall) return this.toast(`Vehicle call ready in ${Math.ceil(this.callCooldown)}s (Express Call removes the wait)`, 'warn');
    const v = this.vehicle;
    const p = this.player.pos;
    if (!v) { this.spawnVehicle(this.profile.equipped); }
    else {
      const lane = this.nearestLane(p.x, p.z);
      const r = this.collision.resolveCircle(lane.x, lane.z, v.radius + 0.3, 0, 0.3);
      v.place(r.x, r.z, lane.h);
    }
    this.callCooldown = CALL_COOLDOWN;
    this.effects.ring(this.vehicle.x, 0.4, this.vehicle.z, '#ff7a1f');
    this.audio.horn(null, null, this.hornKind());
    this.toast('Your ' + VEHICLE_BY_ID[this.profile.equipped].name + ' is here!');
  }
  hornKind() {
    const v = this.vehicle;
    if (!v) return 'car';
    if ((v.custom.accessories || []).includes('horn')) return 'party';
    if (v.def.kind === 'pedal' || v.def.kind === 'electric') return 'bell';
    if (v.def.kind === 'truck') return 'truck';
    return 'car';
  }
  enterVehicle(silent = false) {
    const v = this.vehicle;
    if (!v) return;
    this.player.enter(v);
    this.audio.setVehicle(v.def);
    this.cam.setMode('vehicle', { dist: v.def.camDist || 7, height: Math.max(1.4, v.M.top * 0.7) });
    this.refreshCargoDisplay();
    if (!silent) this.events.emit('vehicle:enter', v.def);
  }
  exitVehicle() {
    this.player.exit();
    this.audio.setVehicle(null);
    this.cam.setMode('foot', { dist: 6.5, height: 1.5 });
    this.refreshCargoDisplay();
    this.events.emit('vehicle:exit');
  }
  resetVehicle() {
    const v = this.player.vehicle;
    if (!v) return;
    const lane = this.nearestLane(v.x, v.z);
    const r = this.collision.resolveCircle(lane.x, lane.z, v.radius + 0.3, 0, 0.3);
    v.place(r.x, r.z, lane.h);
    this.toast('Vehicle reset to the road');
  }

  // ---------------------------------------------------------------- cargo
  currentCapacity() {
    if (this.player.vehicle) return this.player.vehicle.stats.capacity;
    return this.eco.capacityOf('walk');
  }
  cargoNearby(pos, r) {
    return !!(this.vehicle && this.vehicle.cargoCount > 0 && Math.hypot(this.vehicle.x - pos.x, this.vehicle.z - pos.z) < r);
  }
  // parcels collected in a vehicle ride on it (and stay there when you hop off);
  // parcels collected on foot are carried, and move onto the vehicle when you get on
  loadCargo(units, color, glow) {
    const keep = this.cargo && this.cargo.units > 0 ? this.cargoOn : null;
    this.cargo = { units, color, glow };
    this.cargoOn = keep;
    this.refreshCargoDisplay();
  }
  setCargo(n) { this.cargo = { units: n, color: null, glow: 0 }; this.cargoOn = null; this.refreshCargoDisplay(); }
  refreshCargoDisplay() {
    const c = this.cargo;
    if (!c || c.units <= 0) {
      if (this.vehicle) this.vehicle.setCargoCount(0, null, 0);
      this.player.carrying = null;
      this.cargoOn = null;
      return;
    }
    if (this.player.vehicle) this.cargoOn = 'vehicle';
    else if (!this.cargoOn || !this.vehicle) this.cargoOn = 'hands';
    if (this.cargoOn === 'vehicle' && this.vehicle) {
      this.vehicle.setCargoCount(c.units, c.color, c.glow);
      this.player.carrying = null;
    } else {
      if (this.vehicle) this.vehicle.setCargoCount(0, null, 0);
      this.player.carrying = c.color;
    }
  }

  // ---------------------------------------------------------------- districts
  isAccessible(x, z) {
    const c = cellOf(x), r = cellOf(z);
    const d = districtAtCell(c, r);
    if (!d || this.eco.isUnlocked(d)) return true;
    const open = (cc, rr) => { const dd = districtAtCell(cc, rr); return !dd || this.eco.isUnlocked(dd); };
    const lx = x - gx(c), lz = z - gx(r), n = CITY.roadHalf + 0.5, S = CITY.cell;
    if (lx < n && open(c - 1, r)) return true;
    if (lx > S - n && open(c + 1, r)) return true;
    if (lz < n && open(c, r - 1)) return true;
    if (lz > S - n && open(c, r + 1)) return true;
    if (lx < n && lz < n && open(c - 1, r - 1)) return true;
    if (lx > S - n && lz < n && open(c + 1, r - 1)) return true;
    if (lx < n && lz > S - n && open(c - 1, r + 1)) return true;
    if (lx > S - n && lz > S - n && open(c + 1, r + 1)) return true;
    return false;
  }
  lockedToast(x, z) {
    if (this.clock - this.lastLockToast < 3) return;
    this.lastLockToast = this.clock;
    const d = DISTRICTS[districtAt(x, z)];
    if (d) this.toast(`${d.name} is locked. Unlock it in Shop > Districts (level ${d.level}, ${fmtMoney(d.cost)}).`, 'warn');
  }

  // ---------------------------------------------------------------- interaction
  interactables() {
    const pv = this.player.vehicle;
    const pos = pv ? { x: pv.x, z: pv.z } : this.player.pos;
    const speed = pv ? pv.speed() : 0;
    const job = this.jobs.prompt(pos, !!pv, speed);
    if (job) return job;
    const L = this.layout.pois;
    const reach = pv ? 9 : 4.5;
    const near = (p, r = reach) => Math.hypot(pos.x - p.x, pos.z - p.z) < r;
    if (!pv && this.vehicle && Math.hypot(pos.x - this.vehicle.x, pos.z - this.vehicle.z) < this.vehicle.radius + 2.6) {
      return { text: 'Ride ' + this.vehicle.def.name, action: () => this.enterVehicle(), key: 'E' };
    }
    for (const jb of L.jobBoards) {
      if (near({ x: jb.x, z: jb.z + (jb.ry === 0 ? 1.5 : jb.ry === Math.PI ? -1.5 : 0) }, reach + 1)) {
        if (!this.eco.isUnlocked(jb.district)) return { text: `${jb.name} (district locked)`, action: null, warn: true };
        return { text: 'Open ' + jb.name, action: () => this.ui.openMissions('jobs', jb.district) };
      }
    }
    if (near(L.garage, reach + 3)) return { text: 'Open Rush HQ Garage', action: () => this.ui.openGarage() };
    if (near(L.dealership, reach + 3)) return { text: 'Enter Wheelhouse Motors', action: () => this.ui.openShop('vehicles') };
    if (pv && speed < 2) return { text: 'Get off ' + pv.def.name, action: () => this.exitVehicle() };
    return null;
  }

  onVehicleImpact(speed, tag) {
    if (speed < 1.5) return;
    this.jobs.impact(speed);
    this.cam.addShake(clamp(speed / 14, 0.1, 0.9));
    if (speed > 3) {
      this.audio.crash(speed);
      const v = this.player.vehicle;
      if (v) this.effects.sparks(v.x + Math.sin(v.h) * 1.2, v.y + 0.6, v.z + Math.cos(v.h) * 1.2, Math.round(speed * 1.5));
    }
    void tag;
  }

  toast(text, kind = 'info') { this.events.emit('toast', { text, kind }); }

  // ---------------------------------------------------------------- saving
  saveSoon() { this.saveAt = this.clock + 0.8; }
  async saveNow() {
    if (!this.profile || this.state !== 'playing') return;
    this.profile.player = snapshotSession(this);
    this.profile.time = this.world.time;
    return this.save.saveProfile(this.profile);
  }
  async resetProgress() {
    await this.save.deleteProfile();
    location.reload();
  }

  // ---------------------------------------------------------------- main loop
  runTitle() {
    this.state = 'title';
    this.lastTime = performance.now();
    if (!this.looping) { this.looping = true; this.loop(); }
  }
  start() {
    this.state = 'playing';
    this.menuOpen = false;
    this.input.enabled = true;
    this.audio.init();
    this.audio.resume();
    this.lastTime = performance.now();
    if (!this.looping) { this.looping = true; this.loop(); }
    this.autosave = setInterval(() => this.saveNow(), 30000);
    addEventListener('beforeunload', () => this.saveNow());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.saveNow(); });
  }

  loop() {
    requestAnimationFrame(() => this.loop());
    const now = performance.now();
    let dt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.tick(dt);
  }

  tick(dt) {
    this.frame++;
    this.fps = this.fps * 0.95 + (1 / Math.max(dt, 0.001)) * 0.05;
    const controls = this.input.read();
    this.camControls = controls;
    const running = this.state === 'playing' && !this.paused && !this.menuOpen;
    if (running) this.simulate(dt, controls);
    this.input.endFrame();
    this.render(dt);
  }

  simulate(dt, c) {
    this.clock += dt;
    this.callCooldown = Math.max(0, this.callCooldown - dt);
    const pv = this.player.vehicle;
    // discrete actions
    if (c.interact) {
      const it = this.interactables();
      if (it && it.action) { it.action(); this.audio.uiClick(); }
    }
    if (c.call) this.callVehicle();
    if (c.reset) this.resetVehicle();
    if (c.horn && !this.hornHeld) { this.hornHeld = true; if (pv) this.audio.horn(null, null, this.hornKind()); }
    if (!c.horn) this.hornHeld = false;
    // fixed-step physics
    this.accum += dt;
    let steps = 0;
    const camF = this.cam.forward();
    while (this.accum >= STEP && steps < 5) {
      this.accum -= STEP;
      steps++;
      if (pv) {
        const ox = pv.x, oz = pv.z;
        pv.step(STEP, c, this.collision);
        if (!this.isAccessible(pv.x, pv.z)) { this.lockedToast(pv.x, pv.z); pv.x = ox; pv.z = oz; pv.vx *= -0.3; pv.vz *= -0.3; }
        if (pv.impact > 1.5) this.onVehicleImpact(pv.impact, pv.lastHitTag);
      } else {
        const ox = this.player.pos.x, oz = this.player.pos.z;
        this.player.step(STEP, c, camF);
        if (!this.isAccessible(this.player.pos.x, this.player.pos.z)) { this.lockedToast(this.player.pos.x, this.player.pos.z); this.player.pos.x = ox; this.player.pos.z = oz; }
      }
    }
    if (steps === 5) this.accum = 0;
    // footsteps / jump sounds
    if (!pv) {
      if (this.player.justJumped) { this.audio.jump(); this.player.justJumped = false; }
      if (this.player.landed) { this.audio.land(); this.player.landed = false; this.jobs.impact(this.player.carrying ? 4 : 0); }
      if (this.player.onGround && this.player.moving) this.audio.step(this.player.sprinting);
    }
    // distance (for stats / daily missions)
    const fp = pv ? { x: pv.x, z: pv.z } : this.player.pos;
    const moved = Math.hypot(fp.x - this.lastPos.x, fp.z - this.lastPos.z);
    if (moved < 50) this.progress.addDistance(moved);
    this.lastPos = { x: fp.x, z: fp.z };
    // systems
    this.jobs.update(dt);
    this.npcs.update(dt);
    this.traffic.update(dt, this.clock);
    // vehicle visuals, sounds, exhaust, dust
    if (this.vehicle) {
      const v = this.vehicle;
      v.syncObject(dt, this.clock);
      v.setLights(this.world.night);
      const night = this.world.night;
      if (pv && night > 0.2) {
        const hp = v.object.localToWorld(v.M.headlamp.clone());
        this.headlight.position.copy(hp);
        this.headlight.target.position.set(hp.x + Math.sin(v.h) * 14, 0, hp.z + Math.cos(v.h) * 14);
        this.headlight.intensity = 140 * Math.min(1, (night - 0.2) * 2);
      } else this.headlight.intensity = 0;
      if (pv && v.M.exhaust && (v.def.kind === 'motor' || v.def.kind === 'van' || v.def.kind === 'truck') && this.frame % (v.throttle > 0 ? 2 : 6) === 0) {
        const e = v.object.localToWorld(v.M.exhaust.clone());
        this.effects.exhaust(e.x, e.y, e.z, v.throttle);
      }
      const slip = Math.abs(v.vx * Math.cos(v.h) - v.vz * Math.sin(v.h));
      if (pv && (slip > 3 || (v.braking && Math.abs(v.vf) > 8)) && this.frame % 2 === 0) this.effects.dust(v.x - Math.sin(v.h) * 1.2, 0.2, v.z - Math.cos(v.h) * 1.2, 1);
      if (v.cargoGlow > 0.4 && this.frame % 6 === 0) { const cp = v.object.localToWorld(v.M.cargo.pos.clone()); this.effects.sparkle(cp.x, cp.y + 0.3, cp.z, v.cargoColor); }
    }
    if (!pv && this.player.carrying && this.jobs.active && this.frame % 8 === 0) {
      const rar = this.jobs.active.job.rarity;
      if (rar === 'epic' || rar === 'legendary') this.effects.sparkle(this.player.pos.x, this.player.pos.y + 1.3, this.player.pos.z, this.player.carrying, 1);
    }
    // chimney smoke near the player
    if (this.frame % 10 === 0) {
      for (const b of this.layout.buildings) {
        if (!b.chimneys) continue;
        if (Math.abs(b.x - fp.x) > 260 || Math.abs(b.z - fp.z) > 260) continue;
        for (const ch of b.chimneys) this.effects.smoke(ch.x, CITY.curb + ch.h + 0.5, ch.z);
      }
    }
    this.player.update(dt);
    // navigation: route to the current target, arrow, GPS arrows
    this.updateNavigation(dt, fp);
    // audio
    this.audio.listener = { x: fp.x, z: fp.z };
    this.audio.updateVehicle(dt, pv);
    this.audio.updateAmbient(dt, districtAt(fp.x, fp.z), this.world.night);
    if (this.saveAt && this.clock > this.saveAt) { this.saveAt = 0; this.saveNow(); }
  }

  updateNavigation(dt, fp) {
    const target = this.jobs.currentTarget();
    this.navTarget = target;
    if (!target) { this.route = null; this.arrow.update(dt, null); this.routeArrows.update(null); return; }
    this.routeTimer = (this.routeTimer || 0) - dt;
    if (this.routeTimer <= 0 || !this.route || this.routeKey !== target.x + ',' + target.z) {
      this.routeTimer = 1.2;
      this.routeKey = target.x + ',' + target.z;
      const path = findPath(this.layout, fp.x, fp.z, target.x, target.z, n => this.isAccessible(n.x, n.z));
      // skip the first node if we are already past it (closer to the second)
      if (path.length > 2) {
        const a = path[0], b = path[1];
        if (Math.hypot(b.x - fp.x, b.z - fp.z) < Math.hypot(b.x - a.x, b.z - a.z)) path.shift();
      }
      this.route = path;
    }
    const pts = [{ x: fp.x, z: fp.z }, ...this.route];
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    const direct = Math.hypot(target.x - fp.x, target.z - fp.z);
    this.routeLen = Math.max(direct, len);
    const next = direct < 60 ? target : (this.route[0] && Math.hypot(this.route[0].x - fp.x, this.route[0].z - fp.z) > 6 ? this.route[0] : (this.route[1] || target));
    const pv = this.player.vehicle;
    const from = pv ? { x: pv.x, y: pv.y, z: pv.z } : this.player.pos;
    this.arrow.update(dt, from, next, pv ? pv.M.top + 1.2 : 2.6);
    this.arrow.setColor(target.kind === 'pickup' ? '#4ea3ff' : target.kind === 'deliver' ? '#3ddc84' : target.kind === 'trial' ? '#ff5d5d' : '#ff70b8');
    this.routeArrows.update(pts, (x, z) => this.layout.heightAt(x, z), this.eco.hasEquip('gps'));
  }

  render(dt) {
    const pr = this.ui && this.preview ? this.ui.previewRect() : null;
    if (pr) {
      this.preview.render(this.renderer, dt, pr);
      this.ui.update(dt);
      return;
    }
    if (this.state === 'playing' || this.state === 'title') {
      const pv = this.player && this.player.vehicle;
      if (this.state === 'title') {
        // slow orbit around downtown for the title screen
        const t = performance.now() / 1000 * 0.04;
        this.camera.position.set(Math.cos(t) * 260, 150, Math.sin(t) * 260);
        this.camera.lookAt(0, 10, 0);
        this.world.update(dt, { x: 0, z: 0 }, this.camera);
        if (this.traffic) { this.clock += dt; this.traffic.update(dt, this.clock); }
      } else {
        const running = !this.paused && !this.menuOpen;
        const focus = pv ? new THREE.Vector3(pv.x, pv.y, pv.z) : this.player.pos;
        if (running) {
          this.cam.update(dt, focus, this.camControls || { lookX: 0, lookY: 0, zoom: 0 }, pv ? { heading: pv.h, speed: pv.vf } : { sprint: this.player.sprinting });
          this.world.update(dt, focus, this.camera);
          this.effects.update(dt);
          for (const ic of this.poiIcons) ic.update(this.camera.position);
        }
      }
      this.renderer.render(this.scene, this.camera);
    }
    if (this.ui) this.ui.update(dt);
  }
}

export { GAME_VERSION };
