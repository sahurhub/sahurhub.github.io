// Driver Online USA - the game: loading, menus, rooms, driving, syncing, cameras.
import * as THREE from 'three';
import { FLAGS, GAME_NAME } from './config.js';
import { settings } from './core/settings.js';
import { input } from './core/input.js';
import { clamp, store, save, el } from './core/util.js';
import { Quality } from './core/quality.js';
import { CameraRig } from './core/camera.js';
import { initRapier, Physics, GROUPS, RAPIER } from './physics/physics.js';
import { Vehicle } from './physics/vehicle.js';
import { loadCatalog, loadCarTemplate, CarView, carSpec } from './car/car-model.js';
import { World } from './world/world.js';
import { Weather } from './world/weather.js';
import { TrafficView } from './world/traffic-view.js';
import { Net } from './net/net.js';
import { Remotes } from './net/remotes.js';
import { Audio } from './audio/audio.js';
import { UI } from './ui/ui.js';
import { HUD, colorFor } from './ui/hud.js';
import { Chat } from './ui/chat.js';
import { PlayersPanel } from './ui/players.js';
import { BigMap } from './ui/bigmap.js';
import * as S from './ui/screens.js';
import { encodeState, F, F2, LIMITS } from './shared/protocol.js';

class Game {
  constructor() {
    this.settings = settings;
    this.input = input;
    this.net = new Net();
    this.audio = new Audio(settings);
    this.ui = new UI(this);
    this.inRoom = false;
    this.room = null;
    this.myPid = 0;
    this.playerList = new Map();
    this.localMutes = new Set(store('dousa.mutes', []));
    this.car = null;
    this.spectating = 0;
    this.locatePid = 0;
    this.lightsManual = null; // null = automatic (on in bad weather), true/false = the player's choice
    this.ind = { l: false, r: false, hazard: false, steerHold: 0 };
    this.ghostT = 0;
    this.sendT = 0; this.seq = 0;
    this.dentT = 0; this.crashT = 0;
    this.lastPos = new THREE.Vector3();
    this.menuT = 0;
    this.last = performance.now();
  }

  // ---- start up ------------------------------------------------------------------------
  async boot() {
    const view = document.getElementById('view');
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    this.quality = new Quality(this.renderer);
    const q = this.quality.current;
    if (q.antialias) {
      // high quality: recreate with anti-aliasing
      this.renderer.dispose();
      this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', stencil: false });
      this.quality.renderer = this.renderer;
    }
    const r = this.renderer;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.setPixelRatio(this.quality.pixelRatio());
    r.setSize(window.innerWidth, window.innerHeight);
    view.append(r.domElement);
    window.addEventListener('resize', () => this.resize());

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(settings.get('fov'), window.innerWidth / window.innerHeight, 0.25, 2600);
    this.glowTexture = makeGlowTexture();
    this.hud = new HUD(this);
    this.chat = new Chat(this);
    this.players = new PlayersPanel(this);
    this.bigmap = new BigMap(this);
    this.hud.show(false);

    const load = S.loadingScreen(this.ui, 'Starting the engine...');
    try {
      load.set(0.02, 'Loading physics...');
      await initRapier();
      this.physics = new Physics();
      load.set(0.06, 'Loading cars...');
      await loadCatalog();
      this.audio.engineTypeOf = (id) => { const s = carSpec(id); return s && s.engine; };
      this.world = new World(this.scene, this.physics, this.quality.current);
      this.weather = new Weather(this.scene, this.renderer, this.quality.current);
      this.weather.onThunder = (d) => this.audio.thunder(d);
      this.traffic = new TrafficView(this);
      this.remotes = new Remotes(this);
      load.set(0.08, 'Loading the map...');
      await Promise.all([
        this.world.load((p) => load.set(0.08 + p * 0.84, 'Loading the map...'), this.renderer),
        this.weather.load(),
        this.traffic.load(),
      ]);
      this.hud.buildMapImage(this.world.layout);
      this.cameraRig = new CameraRig(this.camera, this.physics, settings);
      load.set(1, 'Ready');
    } catch (e) {
      console.error(e);
      S.messageScreen(this, 'Could not load the game', e.message + ' Try reloading the page.', 'Reload', () => location.reload());
      return;
    }

    this.quality.onChange((qc) => {
      this.renderer.setPixelRatio(this.quality.pixelRatio());
      this.weather.setQuality(qc);
      this.world.quality = qc;
    });
    settings.on('change', (k) => {
      if (['quality', 'shadows', 'renderScale'].includes(k)) this.quality.refresh();
      if (k === 'gearbox' && this.car) this.car.veh.manual = settings.get('gearbox') === 'manual';
    });
    this.net.on('disconnect', () => this.onDisconnect());
    this.bindNet();
    window.__game = this; // handy for testing from the console

    requestAnimationFrame((t) => this.frame(t));
    if (FLAGS.offline) { this.startOffline(); return; }
    S.mainMenu(this);
  }

  resize() {
    this.renderer.setPixelRatio(this.quality.pixelRatio());
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  onUIChange() {
    input.enabled = !this.ui.open && !this.chat.isOpen && !this.bigmap.visible;
    if (!input.enabled) input.release();
  }

  // ---- account and rooms ---------------------------------------------------------------
  async play() {
    this.audio.start();
    if (this.net.online) { S.roomBrowser(this); return; }
    const l = S.loadingScreen(this.ui, 'Connecting...');
    l.set(0.5);
    try {
      await this.net.connect();
      S.roomBrowser(this);
    } catch (e) {
      if (e.signin) S.signInScreen(this, e.message === 'Please sign in with your SahurHub Chat account.' ? '' : e.message, () => this.play());
      else S.messageScreen(this, 'Could not connect', e.message, 'OK', () => S.mainMenu(this));
    }
  }

  bindNet() {
    const n = this.net;
    n.on('joined', (m) => this.onJoined(m));
    n.on('pjoin', (m) => {
      this.playerList.set(m.player.pid, m.player);
      this.remotes.add(m.player);
      this.hud.notice(`${m.player.name} joined the room`, 'good');
      this.refreshRoomUI();
    });
    n.on('pleave', (m) => {
      this.playerList.delete(m.pid);
      this.remotes.remove(m.pid);
      if (this.spectating === m.pid) this.stopSpectating();
      if (this.locatePid === m.pid) this.locatePid = 0;
      this.hud.notice(m.reason === 'kicked' ? `${m.name} was kicked` : `${m.name} left the room`, m.reason === 'kicked' ? 'bad' : '');
      this.refreshRoomUI();
    });
    n.on('leader', (m) => {
      if (!this.room) return;
      this.room.leader = m.pid;
      if (m.pid === this.myPid) this.hud.notice('You are now the room leader', 'good');
      this.refreshRoomUI();
    });
    n.on('settings', (m) => {
      const ghostBefore = this.room && this.room.ghost;
      this.room = m.room;
      if (m.room.sky) this.weather.setState(m.room.sky);
      if (ghostBefore !== m.room.ghost) { this.remotes.refreshGhosts(); this.applyCarGroups(); }
      this.refreshRoomUI();
    });
    n.on('sky', (m) => { this.weather.setState(m.sky); if (this.room) this.room.sky = m.sky; });
    n.on('chat', (m) => this.chat.add(m));
    n.on('typing', (m) => { const p = this.playerList.get(m.pid); if (p) { p.typing = m.on; this.players.markDirty(); } });
    n.on('pings', (m) => { for (const [pid, ping] of m.list) { const p = this.playerList.get(pid); if (p) p.ping = ping; } this.players.markDirty(); this.hud.updateRoomInfo(); });
    n.on('pcar', (m) => { const p = this.playerList.get(m.pid); if (p) p.car = m.car; this.remotes.setCar(m.pid, m.car); this.remotes.repair(m.pid); this.players.markDirty(); });
    n.on('pmute', (m) => { const p = this.playerList.get(m.pid); if (p) p.muted = m.on; this.players.markDirty(); });
    n.on('dent', (m) => this.remotes.addDent(m.pid, { p: m.p, d: m.d, s: m.s }));
    n.on('repair', (m) => this.remotes.repair(m.pid));
    n.on('toast', (m) => this.hud.notice(m.text, m.kind));
    n.on('kicked', (m) => { this.leaveRoomLocal(); S.messageScreen(this, 'You were kicked from the room', `${m.by || 'The room leader'} removed you from the room. You can join another room or make your own.`, 'Back to rooms', () => S.roomBrowser(this)); });
    n.on('closed', (m) => { if (!this.inRoom) return; this.leaveRoomLocal(); S.messageScreen(this, 'The room was closed', m.reason === 'closed by an Owner' ? 'A SahurHub Owner closed this room.' : 'This room has closed.', 'Back to rooms', () => S.roomBrowser(this)); });
    n.on('replaced', () => { this.leaveRoomLocal(); this.net.close(); S.messageScreen(this, 'Opened somewhere else', 'You opened Driver Online USA in another tab or window, so this one was disconnected.', 'OK', () => S.mainMenu(this)); });
    n.on('snapshot', (v) => this.remotes.onSnapshot(v));
    n.on('traffic', (v) => this.traffic.onSnapshot(v));
  }

  async createRoom(o) {
    await this.net.request('create', { name: o.name, max: o.max, priv: o.priv, password: o.priv ? o.password : '', weather: o.weather, traffic: o.traffic, teleport: o.teleport, ghost: o.ghost, car: settings.get('car') });
    this.roomPassword = o.priv ? o.password : '';
    S.carSelectScreen(this, {});
  }

  async joinRoom(name, password) {
    if (!String(name || '').trim()) throw new Error('Type the name of the room.');
    await this.net.request('join', { name, password, car: settings.get('car') });
    this.roomPassword = password || '';
    S.carSelectScreen(this, {});
  }

  onJoined(m) {
    this.inRoom = true;
    this.room = m.room;
    this.myPid = m.you;
    this.playerList.clear();
    this.remotes.clear();
    this.traffic.clear();
    this.chat.clear();
    for (const p of m.players) { this.playerList.set(p.pid, p); this.remotes.add(p); }
    for (const [pid, list] of Object.entries(m.dents || {})) for (const d of list) this.remotes.addDent(Number(pid), d);
    for (const c of m.chat || []) this.chat.add(c);
    if (m.room.sky) this.weather.setState(m.room.sky);
    this.refreshRoomUI();
  }

  refreshRoomUI() { this.players.markDirty(); this.hud.updateRoomInfo(); for (const r of this.remotes.players.values()) r.tagKey = ''; }

  isLeader() { return !!this.room && this.room.leader === this.myPid; }
  uidOf(pid) { const p = this.playerList.get(pid); return p ? p.uid : 0; }
  localMute(uid, on) { if (on) this.localMutes.add(uid); else this.localMutes.delete(uid); save('dousa.mutes', [...this.localMutes]); this.players.markDirty(); }

  leaveRoom() {
    this.net.request('leave').catch(() => {});
    this.leaveRoomLocal();
    S.roomBrowser(this);
  }

  leaveRoomLocal() {
    this.inRoom = false;
    this.room = null;
    this.myPid = 0;
    this.playerList.clear();
    this.remotes.clear();
    this.traffic.clear();
    this.chat.close(); this.chat.clear();
    this.players.close();
    this.bigmap.close();
    this.spectating = 0; this.locatePid = 0;
    this.removeCar();
    this.audio.silenceAll();
    this.hud.show(false);
    this.hud.centreMsg('');
    this.weather.setState({ from: 'sunny', to: 'sunny', t0: 0, t1: 0 });
  }

  async onDisconnect() {
    if (!this.inRoom) { if (!this.ui.open) S.mainMenu(this); return; }
    const roomName = this.room.name;
    this.hud.centreMsg('Lost the connection - reconnecting...');
    for (let i = 0; i < 6; i++) {
      await new Promise((res) => setTimeout(res, 1000 + i * 1500));
      try {
        await this.net.connect();
        await this.net.request('join', { name: roomName, password: this.roomPassword || '', car: this.car ? this.car.spec.id : settings.get('car') });
        this.hud.centreMsg('');
        this.hud.notice('Reconnected', 'good');
        if (this.car) this.net.send({ t: 'car', car: this.car.spec.id });
        return;
      } catch (e) {
        if (e.signin) break;
        if (/No room has that name/.test(e.message)) { this.leaveRoomLocal(); S.messageScreen(this, 'The room is gone', 'The room closed while you were disconnected.', 'Back to rooms', () => S.roomBrowser(this)); return; }
      }
    }
    this.leaveRoomLocal();
    S.messageScreen(this, 'Connection lost', 'Could not reconnect to the game server. Check your internet and try again.', 'OK', () => S.mainMenu(this));
  }

  // ---- the player's car ------------------------------------------------------------------
  async selectCar(id) {
    const first = !this.car;
    let tpl;
    const slow = setTimeout(() => this.hud.centreMsg('Loading car...'), 300);
    try {
      tpl = await loadCarTemplate(id, () => {});
    } finally { clearTimeout(slow); this.hud.centreMsg(''); }
    if (!this.inRoom && !FLAGS.offline) throw new Error('You are not in a room any more.');
    // keep the old position when switching cars
    let pose;
    if (this.car) {
      const p = this.car.veh.body.translation(), q = this.car.veh.body.rotation();
      const fx = -2 * (q.x * q.z + q.w * q.y), fz = -(1 - 2 * (q.x * q.x + q.y * q.y));
      pose = { x: p.x, y: p.y + 0.4, z: p.z, h: Math.atan2(-fx, -fz) };
      this.removeCar();
    } else pose = this.world.spawnPoint(this.myPid - 1 + Math.floor(Math.random() * 3));
    const spec = tpl.spec;
    const view = new CarView(tpl, { local: true, shadows: this.quality.current.carShadows || this.quality.current.shadows });
    this.scene.add(view.root);
    const veh = new Vehicle(this.physics, spec, tpl.geo, pose);
    veh.manual = settings.get('gearbox') === 'manual';
    this.car = { spec, tpl, view, veh, prevPos: new THREE.Vector3(pose.x, pose.y, pose.z), prevQuat: new THREE.Quaternion(), curPos: new THREE.Vector3(pose.x, pose.y, pose.z), curQuat: new THREE.Quaternion() };
    this.car.curQuat.copy(veh.body.rotation()); this.car.prevQuat.copy(this.car.curQuat);
    this.makeHeadlight();
    this.ghost(3);
    settings.set('car', spec.id);
    this.net.send({ t: 'car', car: spec.id });
    const meRow = this.playerList.get(this.myPid);
    if (meRow) { meRow.car = spec.id; this.players.markDirty(); } // the server only tells the others
    this.ui.close();
    this.hud.show(true);
    this.hud.updateRoomInfo();
    if (first) { this.cameraRig.snap(); this.hud.showCamera(this.cameraRig.mode); }
    if (tpl.warnings.length && FLAGS.dev) this.hud.notice(`Car check: ${tpl.warnings.join(', ')}`, 'bad', 7000);
  }

  removeCar() {
    if (!this.car) return;
    this.car.view.dispose();
    this.car.veh.destroy();
    if (this.headlight) { this.headlight.parent && this.headlight.parent.remove(this.headlight); this.headlight = null; }
    this.car = null;
    this.audio.stopCar();
  }

  makeHeadlight() {
    if (this.quality.current.name === 'low') return;
    const l = new THREE.SpotLight(0xfff1d6, 0, 70, 0.55, 0.5, 1.2);
    const b = this.car.tpl.geo.box;
    l.position.set(0, (b.maxY - b.minY) * 0.45, b.minZ + 0.2);
    l.target.position.set(0, 0, b.minZ - 20);
    this.car.view.root.add(l, l.target);
    this.headlight = l;
  }

  /** See-through for a few seconds after appearing (spawn, reset, teleport). */
  ghost(seconds) { this.ghostT = seconds; this.applyCarGroups(); }

  applyCarGroups() {
    if (!this.car) return;
    const g = this.ghostT > 0 || this.spectating ? GROUPS.carGhost : this.room && this.room.ghost ? GROUPS.carNoPlayers : GROUPS.car;
    this.car.veh.col.setCollisionGroups(g);
  }

  resetCar() {
    if (!this.car) return;
    const p = this.car.veh.body.translation(), q = this.car.veh.body.rotation();
    const fx = -2 * (q.x * q.z + q.w * q.y), fz = -(1 - 2 * (q.x * q.x + q.y * q.y));
    const spot = this.world.nearestRoad(p.x, p.z, Math.atan2(-fx, -fz));
    this.car.veh.place(spot.x, spot.y, spot.z, spot.h);
    this.ghost(3);
    this.repairCar();
  }

  repairCar() {
    if (!this.car) return;
    this.car.view.repair();
    this.net.send({ t: 'repair' });
  }

  async teleportTo(pid) {
    const r = this.remotes.players.get(pid);
    if (!r || !r.seen) { this.hud.notice('That player has not spawned yet.', 'bad'); return; }
    try { await this.net.request('tp', { pid }); } catch (e) { this.hud.notice(e.message, 'bad'); return; }
    if (this.spectating) this.stopSpectating();
    const P = r.pose;
    const fx = -2 * (P.quat.x * P.quat.z + P.quat.w * P.quat.y), fz = -(1 - 2 * (P.quat.x * P.quat.x + P.quat.y * P.quat.y));
    const h = Math.atan2(-fx, -fz);
    const x = P.pos.x - fx * 9, z = P.pos.z - fz * 9;
    const y = this.world.surfaceAt(x, z) + 0.6;
    this.car.veh.place(x, Math.max(y, P.pos.y + 0.3), z, h);
    this.ghost(3);
    this.cameraRig.snap();
    this.hud.notice(`Teleported to ${r.info.name}`, 'good');
  }

  spectate(pid) {
    const r = this.remotes.players.get(pid);
    if (!r || !r.view) { this.hud.notice('That player has not spawned yet.', 'bad'); return; }
    this.spectating = pid;
    this.applyCarGroups();
    this.hud.spectateBar.hidden = false;
    this.hud.spectateBar.textContent = `Spectating ${r.info.name} - Esc to go back, C to change view`;
    this.cameraRig.snap();
  }
  stopSpectating() {
    this.spectating = 0;
    this.hud.spectateBar.hidden = true;
    this.applyCarGroups();
    this.cameraRig.snap();
  }

  locate(pid) {
    this.locatePid = pid;
    if (pid) { const p = this.playerList.get(pid); this.hud.notice(`Showing where ${p ? p.name : 'they'} are on the minimap`); }
  }

  focusPos() {
    if (this.spectating) { const r = this.remotes.players.get(this.spectating); if (r) return { x: r.pose.pos.x, z: r.pose.pos.z, h: headingOf(r.pose.quat) }; }
    if (this.car) return { x: this.car.curPos.x, z: this.car.curPos.z, h: headingOf(this.car.curQuat) };
    return { x: 0, z: 0, h: 0 };
  }

  minimapPlayers() {
    const out = [];
    for (const r of this.remotes.players.values()) {
      if (!r.seen || (r.flags2 & F2.SPECTATING)) continue;
      out.push({ x: r.pose.pos.x, z: r.pose.pos.z, h: headingOf(r.pose.quat), color: colorFor(r.pid), name: r.info.name, locate: this.locatePid === r.pid });
    }
    return out;
  }

  // ---- offline test drive (?offline on this PC) -------------------------------------------
  async startOffline() {
    this.inRoom = true;
    this.myPid = 1;
    this.room = { name: 'Test drive', max: 1, weather: 'sunny', traffic: 'none', teleport: true, ghost: false, leader: 1 };
    this.playerList.set(1, { pid: 1, uid: 1, name: 'You', car: '', ping: 0, joined: Date.now() });
    const id = FLAGS.car || settings.get('car') || (carSpec() && carSpec().id);
    try { await this.selectCar(id); } catch (e) { S.messageScreen(this, 'No car', e.message, 'OK', () => {}); }
  }

  // ---- every frame -----------------------------------------------------------------------
  frame(t) {
    requestAnimationFrame((tt) => this.frame(tt));
    const dt = clamp((t - this.last) / 1000, 0.0005, 0.1);
    this.last = t;
    try { this.tick(dt); } catch (e) { console.error(e); }
    input.endFrame();
  }

  tick(dt) {
    const serverMs = this.net.serverNow();
    const driving = this.inRoom && !!this.car;
    if (driving) this.drive(dt, serverMs);
    else this.menuCamera(dt);
    const focus = driving ? this.car.curPos : this.camera.position;
    this.weather.update(dt, serverMs, this.camera.position, focus);
    this.world.update(dt, this.camera.position, serverMs);
    this.renderer.render(this.scene, this.camera);
    if (this.bigmap.visible) this.bigmap.draw();
    this.audio.update(this.camera, this.weather.cur, !driving || this.ui.open);
    if (driving) {
      const msg = this.quality.sample(dt);
      if (msg && settings.get('autoQualityNotice')) this.hud.notice(msg + ' (Settings > Graphics)', '', 6000);
    }
  }

  menuCamera(dt) {
    this.menuT += dt * 0.05;
    const sp = this.world.spawnPoint(0);
    const cx = sp.x, cz = sp.z, y = this.world.heightAt(cx, cz);
    this.camera.position.set(cx + Math.cos(this.menuT) * 38, y + 9, cz + Math.sin(this.menuT) * 38);
    this.camera.lookAt(cx, y + 2, cz);
    if (this.camera.fov !== 60) { this.camera.fov = 60; this.camera.near = 0.3; this.camera.updateProjectionMatrix(); }
  }

  keys() {
    // keys that work while driving (menus handle their own keys)
    if (input.pressed('pause', true) && !this.ui.open && !this.chat.isOpen) {
      if (this.bigmap.visible) this.bigmap.close();
      else if (this.spectating) this.stopSpectating();
      else if (this.players.visible) this.players.close();
      else S.pauseMenu(this);
      return;
    }
    if (this.ui.open || this.chat.isOpen) { if (!this.chat.isOpen) this.players.setHeld(false); return; }
    if (input.pressed('map', true)) this.bigmap.toggle();
    if (this.bigmap.visible) return;
    // Tab is checked by key code so it works even with input disabled
    this.players.setHeld(input.codes.has('Tab') || (settings.get('keys').players || []).some((c) => input.codes.has(c)));
    if (input.pressed('chat')) { this.chat.open(); return; }
    if (input.pressed('camera')) { this.cameraRig.cycle(); this.hud.showCamera(this.cameraRig.mode); }
    if (this.spectating) return;
    if (input.pressed('reset')) this.resetCar();
    if (input.pressed('lights')) this.lightsManual = !this.lightsOn();
    if (input.pressed('indL')) { this.ind.l = !this.ind.l; this.ind.r = false; this.ind.hazard = false; this.ind.steerHold = 0; }
    if (input.pressed('indR')) { this.ind.r = !this.ind.r; this.ind.l = false; this.ind.hazard = false; this.ind.steerHold = 0; }
    if (input.pressed('hazard')) { this.ind.hazard = !this.ind.hazard; }
  }

  lightsOn() { return this.lightsManual === null ? this.weather.isDark() : this.lightsManual; }

  drive(dt, serverMs) {
    const car = this.car, veh = car.veh;
    this.keys();
    // controls
    const on = input.enabled && !this.spectating;
    const steer = on ? (input.down('right') ? 1 : 0) - (input.down('left') ? 1 : 0) : 0;
    const ctrl = {
      throttle: on && input.down('throttle') ? 1 : 0,
      brake: on && input.down('brake') ? 1 : (!on ? 0.4 : 0),
      steer,
      handbrake: on ? input.down('handbrake') : !!this.spectating,
      gearUp: on && input.pressed('gearUp'), gearDown: on && input.pressed('gearDown'),
    };
    // indicators switch themselves off after the turn
    if (this.ind.l || this.ind.r) {
      const dir = this.ind.l ? -1 : 1;
      if (steer === dir && veh.speed > 3) this.ind.steerHold += dt;
      else if (this.ind.steerHold > 0.6 && steer !== dir) { this.ind.l = this.ind.r = false; this.ind.steerHold = 0; }
    }
    // other players and traffic move first, so we collide with where they are now
    const camPos = this.camera.position;
    this.remotes.update(dt, camPos);
    this.traffic.update(dt, camPos, car.curPos);
    // physics
    if (this.ghostT > 0) { this.ghostT -= dt; if (this.ghostT <= 0) this.applyCarGroups(); }
    let gearEdgeUsed = false;
    const res = this.physics.update(dt, (h) => {
      car.prevPos.copy(car.curPos); car.prevQuat.copy(car.curQuat);
      veh.step(h, gearEdgeUsed ? { ...ctrl, gearUp: false, gearDown: false } : ctrl);
      gearEdgeUsed = true;
    }, () => {
      const p = veh.body.translation(), q = veh.body.rotation();
      car.curPos.set(p.x, p.y, p.z); car.curQuat.set(q.x, q.y, q.z, q.w);
      this.handleContacts();
    });
    // draw the car between the last two physics steps
    const V = car.view;
    V.root.position.lerpVectors(car.prevPos, car.curPos, res.alpha);
    V.root.quaternion.slerpQuaternions(car.prevQuat, car.curQuat, res.alpha);
    const lights = this.lightsOn();
    const blink = (serverMs % 800) < 420;
    const indL = this.ind.l || this.ind.hazard, indR = this.ind.r || this.ind.hazard;
    if ((indL || indR) && blink !== this.lastBlink) this.audio.tick();
    this.lastBlink = blink;
    V.updateParts({ dt, wheels: veh.wheels.map((w) => ({ spin: w.spin, steer: w.steer, len: w.len })), steer: veh.steerInput, lights, brake: ctrl.brake > 0.1 && veh.gear !== -1 && veh.vLong > 0.5 || (veh.gear === -1 && ctrl.throttle > 0.1), reverse: veh.gear === -1, indL: this.ind.l, indR: this.ind.r, hazard: this.ind.hazard });
    if (this.headlight) this.headlight.intensity = lights ? 60 : 0;

    // camera
    const look = input.takeMouse();
    let target;
    if (this.spectating) {
      const r = this.remotes.players.get(this.spectating);
      if (!r || !r.view) this.stopSpectating();
      else target = { pos: r.pose.pos, quat: r.pose.quat, vel: r.pose.vel, anchors: r.view.anchors, body: r.body && r.body.body };
    }
    if (!target) {
      const lv = veh.body.linvel();
      target = { pos: V.root.position, quat: V.root.quaternion, vel: new THREE.Vector3(lv.x, lv.y, lv.z), anchors: V.anchors, body: veh.body };
    }
    this.cameraRig.update(dt, target, { dx: look[0], dy: look[1], active: input.freeLook, back: on && input.down('lookBack') });
    const inside = this.cameraRig.mode === 'cockpit' && !this.spectating;
    V.setInteriorVisible(inside || this.cameraRig.mode === 'hood' ? inside : false);
    V.setHoodHidden(this.cameraRig.mode === 'hood' && !this.spectating);
    V.setLOD(0);
    V.root.visible = true;
    if (this.spectating) { const r = this.remotes.players.get(this.spectating); if (r && r.view) { r.view.setInteriorVisible(this.cameraRig.mode === 'cockpit'); r.view.setHoodHidden(this.cameraRig.mode === 'hood'); r.view.setLOD(0); } }

    // send our state 15 times a second
    this.sendT += dt;
    if (this.sendT >= 1 / LIMITS.sendHz) {
      this.sendT = Math.min(this.sendT - 1 / LIMITS.sendHz, 0.1);
      const p = car.curPos, q = car.curQuat, v = veh.body.linvel();
      let flags = 0, flags2 = 0;
      if (ctrl.brake > 0.1 || (veh.gear === -1 && ctrl.throttle > 0.1)) flags |= F.BRAKE;
      if (ctrl.handbrake) flags |= F.HANDBRAKE;
      if (lights) flags |= F.LIGHTS;
      if (this.ind.l) flags |= F.IND_L;
      if (this.ind.r) flags |= F.IND_R;
      if (this.ind.hazard) flags |= F.HAZARD;
      if (on && input.down('horn')) flags |= F.HORN;
      if (veh.gear === -1) flags |= F.REVERSE;
      if (this.ghostT > 0) flags2 |= F2.GHOST;
      if (this.spectating) flags2 |= F2.SPECTATING;
      this.net.sendBin(encodeState({ flags, flags2, gear: veh.gear, x: p.x, y: p.y, z: p.z, qx: q.x, qy: q.y, qz: q.z, qw: q.w, vx: v.x, vy: v.y, vz: v.z, rpm: veh.rpm, steer: veh.steerInput, throttle: veh.throttle, seq: this.seq++ }));
    }

    // fell off the world or stuck upside down
    if (car.curPos.y < -60) this.resetCar();
    if (veh.upsideDown() && veh.speed < 2) { this.upsideT = (this.upsideT || 0) + dt; if (this.upsideT > 2.5) this.hud.centreMsg('Press R to flip your car back onto the road'); }
    else if (this.upsideT) { this.upsideT = 0; this.hud.centreMsg(''); }

    // sound
    this.audio.car({ engine: car.spec.engine || 'v6', rpm: veh.rpm, throttle: veh.throttle, slip: veh.grounded ? veh.slipMax : 0, speed: veh.speed, horn: on && input.down('horn'), inside, paused: !!this.spectating });

    // HUD
    const f = this.focusPos();
    const camFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    let locate = null;
    if (this.locatePid) { const r = this.remotes.players.get(this.locatePid); if (r && r.seen) locate = { x: r.pose.pos.x, z: r.pose.pos.z, name: r.info.name }; }
    const s = this.spectating ? this.remotes.players.get(this.spectating) : null;
    const st = s && s.state;
    this.hud.update(dt, {
      speed: s ? s.pose.vel.length() : veh.speed, rpm: st ? st.rpm : veh.rpm, gear: st ? st.gear : veh.gear,
      topSpeed: (s && s.tpl ? s.tpl.spec.topSpeed : car.spec.topSpeed), redline: (s && s.tpl ? s.tpl.spec.redline : car.spec.redline) || 6800, maxRpm: ((s && s.tpl ? s.tpl.spec.redline : car.spec.redline) || 6800) + 400,
      manual: veh.manual, lights, indL: this.ind.l, indR: this.ind.r, hazard: this.ind.hazard, blink, handbrake: ctrl.handbrake && !this.spectating,
      x: f.x, z: f.z, heading: f.h, players: this.minimapPlayers(), mapRadius: 160 + clamp(veh.speed * 3, 0, 160),
      locate, camX: this.camera.position.x, camZ: this.camera.position.z, camYaw: Math.atan2(-camFwd.x, -camFwd.z),
    });
  }

  /** Crashes: sound, camera shake, dents, and telling the server when we hit traffic. */
  handleContacts() {
    const car = this.car, veh = car.veh;
    const me = veh.col.handle;
    this.physics.events.drainContactForceEvents((ev) => {
      const h1 = ev.collider1(), h2 = ev.collider2();
      if (h1 !== me && h2 !== me) return;
      const other = h1 === me ? h2 : h1;
      const info = this.physics.colliderInfo.get(other) || { kind: 'world' };
      const s = clamp((ev.totalForceMagnitude() / veh.spec.mass - 60) / 1200, 0, 1);
      if (s < 0.05) return;
      const now = performance.now();
      if (now - this.crashT > 180) {
        this.crashT = now;
        this.audio.crash(s);
        if (this.cameraRig.mode !== 'cockpit' || s > 0.2) this.cameraRig.shake(s * 0.8);
      }
      if (info.kind === 'traffic' && info.id) {
        const v = veh.body.linvel();
        this.net.send({ t: 'hitTraffic', id: info.id, dx: v.x, dz: v.z, f: s });
      }
      if (s > 0.12 && now - this.dentT > 300) {
        this.dentT = now;
        let point = null;
        const col = this.physics.world.getCollider(other);
        if (col) this.physics.world.contactPair(veh.col, col, (manifold) => { if (!point && manifold.numSolverContacts() > 0) point = manifold.solverContactPoint(0); });
        if (point) {
          const inv = car.curQuat.clone().invert();
          const pl = new THREE.Vector3(point.x, point.y, point.z).sub(car.curPos).applyQuaternion(inv);
          const centre = new THREE.Vector3(0, (car.tpl.geo.box.minY + car.tpl.geo.box.maxY) / 2, (car.tpl.geo.box.minZ + car.tpl.geo.box.maxZ) / 2);
          const d = centre.clone().sub(pl); d.y *= 0.3; d.normalize();
          const dent = { p: [pl.x, pl.y, pl.z], d: [d.x, d.y, d.z], s };
          car.view.addDent(dent.p, dent.d, dent.s);
          this.net.send({ t: 'dent', ...dent });
        }
      }
    });
  }
}

function headingOf(q) {
  const fx = -2 * (q.x * q.z + q.w * q.y), fz = -(1 - 2 * (q.x * q.x + q.y * q.y));
  return Math.atan2(-fx, -fz);
}

function makeGlowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,0.6)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

document.title = GAME_NAME;
void el; void RAPIER;
const game = new Game();
game.boot();
