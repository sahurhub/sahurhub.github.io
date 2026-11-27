// TURBO TOWN - online play: parties, the practice lobby, and online races.
// In an online race you drive your own kart (so steering feels instant) and the server
// decides everything that matters: start time, laps, places, item boxes, hits, shields,
// pauses and rewards. Other karts are moved smoothly between the server's updates.
import * as THREE from 'three';
import { KART_BY_ID } from '../shared/karts.js';
import { ITEM_TUNING as TU } from '../shared/items.js';
import { pointAt } from '../shared/track-math.js';
import { giveBoost, spinOut } from '../physics/kart-physics.js';
import { KartVisual } from '../karts/kart-visual.js';
import { paintColors } from '../shared/cosmetics.js';
import * as screens from '../ui/screens/index.js';
import { createAI } from '../ai/ai-driver.js';
import { SpectatorCam, MODE_NAMES } from '../camera/spectator-camera.js';

// INPUT: the player is pressing something (the server uses it for the AFK check)
const FL = { RESPAWN: 1, DRIFT: 2, BOOST: 4, AIR: 8, SPIN: 16, SHIELD: 32, RAINBOW: 64, TRAIL: 128, INPUT: 256 };
const INTERP_MS = 130;

export class Online {
  constructor(app, net) {
    this.app = app; this.net = net; this.game = app.game; this.ui = app.ui;
    this.party = null;
    this.chatLog = [];
    this.mode = 'none';           // none | lobby | race | results
    this.remote = new Map();      // practice: uid -> { vis, kart, target }
    this.sendAcc = 0;
    this.listeners = [];
    const on = (t, fn) => this.listeners.push(net.on(t, fn));
    on('party', (m) => this.onParty(m.party));
    on('partyGone', (m) => { this.party = null; this.chatLog = []; this.ui.toast(m.reason || 'You left the party.'); this.exitToMenu(); });
    on('chat', (m) => this.onChat(m));
    on('ps', (m) => this.onPractice(m.k));
    on('raceLoad', (m) => this.onRaceLoad(m));
    on('spectate', (m) => this.onSpectate(m));
    on('raceStart', (m) => this.onRaceStart(m));
    on('snap', (m) => this.onSnap(m));
    on('roulette', () => { const me = this.meRacer(); if (me) { me.roulette = TU.roulette; } });
    on('item', (m) => { const me = this.meRacer(); if (me) { me.roulette = 0; me.item = m.item; me.itemCharges = m.charges || 1; this.raceEvent('itemGot', me, { item: m.item }); } });
    on('box', (m) => this.onBox(m));
    on('fx', (m) => this.onFx(m));
    on('hit', (m) => this.onHit(m));
    on('shieldPop', (m) => { const r = this.racerOf(m.u); if (r) { r.kart.shield = false; this.raceEvent('shieldPop', r, { kind: m.kind, by: this.racerOf(m.by) }); } });
    on('frozen', (m) => { const r = this.racerOf(m.u); if (r) { if (r.isPlayer) { r.kart.slowT = TU.freezeTime; r.kart.slowMul = TU.freezeMul; r.kart.drift.on = false; } r.kart.frozenT = TU.freezeTime; this.raceEvent('frozen', r, { by: this.racerOf(m.by) }); } });
    on('hazard', (m) => this.onHazard(m));
    on('boom', (m) => this.raceEvent('rocketBoom', null, { x: m.x, y: m.y, z: m.z }));
    on('overtake', () => { const me = this.meRacer(); if (me) { me.ov = me.ov || { count: 0 }; me.ov.count++; this.raceEvent('overtake', me, {}); } });
    on('finish', (m) => this.onFinish(m));
    // admin quick commands: the admin's own boost lands here
    on('adminFx', (m) => { const me = this.meRacer(); if (me && m.fx === 'boost') giveBoost(me.kart, 1.6, 2.4, 'item'); });
    // coins for a lap, paid by the server as you cross the line
    on('lapCoins', (m) => {
      const prof = this.app.profile && this.app.profile.get();
      if (prof && typeof m.total === 'number') prof.coins = m.total;
      if (this.game.race && this.game.race.online) this.game.hud.toast(`Lap ${m.lap} +${m.coins} coins`, 'coin');
    });
    on('raceEnd', (m) => this.onRaceEnd(m));
    on('lobby', () => this.enterLobby());
    on('pause', (m) => this.onPause(m));
    on('resume', () => { this.game.paused = false; this.pauseState = null; this.renderPause(); });
    on('correct', (m) => this.onCorrect(m));
    on('raceDropped', (m) => { this.ui.toast(m.reason || 'You left the race.', 'bad'); this.enterLobby(); });
    on('toast', (m) => this.ui.toast(m.text));
    on('status', (m) => this.onStatus(m));
  }

  get me() { return this.net.me; }
  isLeader() { return this.party && this.party.leader === this.me.uid; }

  // ---------------------------------------------------------------- party actions

  async create() { await this.net.request('partyCreate'); }
  async join(code) { await this.net.request('partyJoin', { code }); }
  async queue() { await this.net.request('queue'); }
  async roam() { await this.net.request('roamJoin'); } // the public city (free roam with anyone)
  async leave() { await this.net.request('partyLeave').catch(() => {}); this.party = null; this.chatLog = []; this.exitToMenu(); }
  async setKart(kart) { await this.net.request('partyKart', { kart }); }
  async ready(on) { await this.net.request('partyReady', { ready: on }); }
  async settings(s) { await this.net.request('partySettings', s); }
  async start() { await this.net.request('partyStart'); }
  async back() { await this.net.request('partyBack'); }
  chat(text) { this.net.send('chat', { text }); }

  onParty(p) {
    const first = !this.party;
    this.party = p;
    if (this.app.gchat) this.app.gchat.setParty(p);
    // joined while a race is running: the server sends 'spectate' (watch it); joined while
    // the results are up: wait in the lobby for everyone to come back
    if (first && (p.state === 'lobby' || p.state === 'results')) this.enterLobby();
    // missed the end of a race (connection trouble): go back to the lobby with everyone
    else if (p.state === 'lobby' && (this.mode === 'race' || this.mode === 'results')) this.enterLobby();
    if (this.lobbyScreen && this.lobbyScreen.refresh) this.lobbyScreen.refresh();
    if (this.resultsScreen && this.resultsScreen.refresh) this.resultsScreen.refresh();
  }

  // party chat (and the game's party notes) go in the chat box, tagged PARTY / CITY
  onChat(m) {
    this.chatLog.push(m);
    if (this.chatLog.length > 60) this.chatLog.shift();
    if (this.app.gchat) this.app.gchat.addParty(m);
  }

  exitToMenu() {
    this.mode = 'none';
    this.endSpectate();
    if (this.app.gchat) this.app.gchat.setParty(null);
    this.clearRemote();
    this.game.endRace();
    this.app.menu();
  }

  // ---------------------------------------------------------------- practice lobby

  async enterLobby() {
    if (!this.party) return;
    this.endSpectate();
    this.mode = 'lobby';
    this.resultsScreen = null;
    this.game.paused = false;
    this.pauseState = null; this.renderPause();
    const p = this.app.profile.get();
    const look = this.app.profile.lookFor(p.kart);
    this.clearRemote();
    // the lobby (and the public city) is Turbo City: drive around with everyone while you wait
    await this.game.startRace({
      map: 'turbo-city', laps: 99, items: false, countdown: 0.01, roam: true,
      racers: [{ kart: p.kart, name: p.name, isPlayer: true, data: { paint: look.paint, cosmetics: this.app.cosmeticsFor(p.kart) } }],
    });
    this.game.hud.show(false);
    this.lobbyScreen = this.ui.show(screens.PartyLobby, { online: this }, { replace: true });
  }

  onPractice(list) {
    if (this.mode !== 'lobby' || !this.game.race) return;
    const seen = new Set();
    for (const [uid, x, y, z, yaw, sp, fl, kart] of list) {
      if (uid === this.me.uid) continue;
      seen.add(uid);
      let r = this.remote.get(uid);
      const m = this.party && this.party.members.find((x) => x.uid === uid);
      const skin = (m && m.look && m.look.skin) || null;
      if (!r || r.kartId !== kart || r.skin !== skin) {
        if (r) r.vis.dispose();
        const def = KART_BY_ID[kart] || KART_BY_ID.starter;
        const paint = paintColors(m && m.look && m.look.paint, def);
        const vis = new KartVisual(def, { assets: this.app.assets, paint, cosmetics: lookCosmetics(m && m.look), blob: true });
        this.game.r.scene.add(vis.root);
        r = { vis, kartId: kart, skin, kart: fakeKart(def), target: { x, y, z, yaw }, name: m ? m.name : '' };
        r.kart.x = x; r.kart.y = y; r.kart.z = z; r.kart.yaw = yaw;
        this.remote.set(uid, r);
      }
      r.target = { x, y, z, yaw, sp, fl };
    }
    for (const [uid, r] of this.remote) if (!seen.has(uid)) { r.vis.dispose(); this.remote.delete(uid); }
  }

  clearRemote() { for (const r of this.remote.values()) r.vis.dispose(); this.remote.clear(); }

  // ---------------------------------------------------------------- online race

  meRacer() { const race = this.game.race; return race && race.online ? race.player : null; }
  racerOf(uid) { const race = this.game.race; return race && race.online ? race.racers.find((r) => r.data.uid === uid) : null; }
  raceEvent(type, racer, extra) { const race = this.game.race; if (race) race.emit(type, racer, extra); }

  // ---------------------------------------------------------------- watching a race
  // Joined the party mid-race: load the race with every car driven by the network, and watch
  // with the spectator cameras (camera/spectator-camera.js) until it ends.
  async onSpectate(m) {
    this.endSpectate();
    this.buffers = new Map();
    this.mode = 'race';
    this.spectating = true;
    this.clearRemote();
    this.ui.hide();
    this.app.showLoading('Getting ready to watch the race');
    const racers = m.grid.map((uid) => {
      const pl = m.players.find((x) => x.uid === uid);
      const def = KART_BY_ID[pl.kart] || KART_BY_ID.starter;
      return { kart: pl.kart, name: pl.name, isPlayer: false, remote: true, data: { uid, paint: paintColors(pl.look && pl.look.paint, def), cosmetics: lookCosmetics(pl.look) } };
    });
    const race = await this.game.startRace({ map: m.map, racers, laps: 3, items: false, countdown: 99, online: true });
    race.online = true;
    race.spectating = true;
    race.items = this.items = new OnlineItems(race, this);
    this.game.itemVis = null;
    const { ItemVisuals } = await import('../items/item-visuals.js');
    this.game.itemVis = new ItemVisuals(this.game, race);
    // the race may already be going (then straight in, no countdown or GO!)
    const left = m.startAt ? (m.startAt - this.net.serverNow()) / 1000 : 99;
    if (m.startAt && left <= 0) { race.countdown = 0; race.state = 'racing'; for (const r of race.racers) r.kart.frozen = false; }
    else race.countdown = Math.max(0.2, left);
    for (const f of m.finished || []) {
      const r = this.racerOf(f.u);
      if (r && !r.finished) { race.finish(r); r.finishTime = f.time; r.place = f.place; }
    }
    this.app.hideLoading();
    this.game.hud.setSpectating(true);
    this.game.hud.show(true);
    this.game.spectator = new SpectatorCam(this.game);
    this.showSpectatePanel();
  }

  showSpectatePanel() {
    if (!this.spectEl) { this.spectEl = document.createElement('div'); this.spectEl.className = 'spectate-panel'; document.body.appendChild(this.spectEl); }
    const sc = this.game.spectator;
    if (!sc) return;
    const el = this.spectEl;
    el.innerHTML = '';
    const btn = (label, title, fn, cls = '') => { const b = document.createElement('button'); b.type = 'button'; b.className = 'sp-btn ' + cls; b.textContent = label; b.title = title; b.addEventListener('click', () => { fn(); b.blur(); }); return b; };
    const name = document.createElement('div');
    name.className = 'sp-name';
    const help = document.createElement('div');
    help.className = 'sp-help';
    const camBtn = btn('', 'Change camera (C)', () => sc.nextMode(), 'cam');
    const refresh = () => {
      const r = this.game.race && this.game.race.racers[this.game.focus || 0];
      name.innerHTML = '<span>WATCHING</span><b></b>';
      name.querySelector('b').textContent = r ? (r.place ? r.place + '. ' : '') + r.name : '-';
      camBtn.textContent = MODE_NAMES[sc.mode] + ' (C)';
      help.textContent = sc.mode === 'free' ? 'W A S D move, arrows or drag to look, Space up, Shift down' : 'Q / E: watch another racer   C: change camera';
    };
    sc.onChange = refresh;
    el.append(btn('<', 'Previous racer (Q)', () => sc.switchFocus(-1)), name, btn('>', 'Next racer (E)', () => sc.switchFocus(1)), camBtn,
      btn('Leave', 'Leave the party', () => this.leave(), 'leave'), help);
    refresh();
    clearInterval(this.spectTimer);
    this.spectTimer = setInterval(refresh, 1000); // places change while you watch
  }

  endSpectate() {
    this.spectating = false;
    clearInterval(this.spectTimer);
    if (this.spectEl) { this.spectEl.remove(); this.spectEl = null; }
    if (this.game.spectator) { this.game.spectator.dispose(); this.game.spectator = null; }
    this.game.hud.setSpectating(false);
  }

  async onRaceLoad(m) {
    this.endSpectate();
    // ready before anything waits: tickRace runs every frame while this is loading
    this.buffers = new Map();
    this.mode = 'race';
    this.clearRemote();
    this.ui.hide();
    this.app.showLoading('Getting ' + m.map.replace(/-/g, ' ') + ' ready');
    const meId = this.me.uid;
    const racers = m.grid.map((uid) => {
      const pl = m.players.find((x) => x.uid === uid);
      const def = KART_BY_ID[pl.kart] || KART_BY_ID.starter;
      const paint = paintColors(pl.look && pl.look.paint, def);
      return {
        kart: pl.kart, name: pl.name, isPlayer: uid === meId, remote: uid !== meId,
        data: { uid, paint, cosmetics: lookCosmetics(pl.look) },
      };
    });
    const race = await this.game.startRace({ map: m.map, racers, laps: 3, items: false, countdown: 99, online: true });
    race.online = true;
    race.items = this.items = new OnlineItems(race, this);
    this.game.itemVis = null;
    const { ItemVisuals } = await import('../items/item-visuals.js');
    this.game.itemVis = new ItemVisuals(this.game, race);
    this.app.hideLoading();
    this.game.startIntro(2.4);
    this.net.send('loaded');
  }

  onRaceStart(m) {
    const race = this.game.race;
    if (!race || !race.online) return;
    this.startAt = m.startAt;
    // the server's countdown has begun: finish the camera intro now (the countdown does
    // not run during the intro, so it would show late and you would start behind)
    this.game.skipIntro();
    race.countdown = Math.max(0.2, (m.startAt - this.net.serverNow()) / 1000);
  }

  onSnap(m) {
    const race = this.game.race;
    if (!race || !race.online) return;
    race.netTime = m.tm; // the server's race clock (the leaderboard gaps use it)
    if (race.spectating && m.tm > 0) race.time = m.tm; // watchers show the real race time
    for (const row of m.k) {
      const [uid, x, y, z, yaw, vx, vz, sp, fl, d, place, lap, fin, shield, dist, afk] = row;
      const r = race.racers.find((q) => q.data.uid === uid);
      if (!r) continue;
      r.place = place;
      r.serverLap = lap;
      if (typeof dist === 'number') r.netDist = dist;
      // AFK (the server decides): see-through and no collisions until they drive again
      const nowAfk = !!afk;
      if (r.isPlayer && nowAfk && !r.afk) this.game.hud.notice('You are AFK: your car is see-through until you drive again', 'pause', 4, 'afk');
      r.afk = nowAfk;
      r.kart.shield = !!shield;
      if (!r.remote) continue;
      let buf = this.buffers.get(uid);
      if (!buf) this.buffers.set(uid, buf = []);
      buf.push({ at: m.at, x, y, z, yaw, vx, vz, sp, fl, d });
      if (buf.length > 30) buf.shift();
    }
    // rockets from the server
    this.items.rockets = (m.r || []).map(([id, x, y, z, yaw]) => ({ id, x, y, z, yaw }));
    // keep the race clock in step with the server
    if (race.state === 'racing' && !this.game.paused) {
      const drift = m.tm - race.time;
      if (Math.abs(drift) > 0.25) race.time = m.tm; else race.time += drift * 0.1;
    }
  }

  onBox(m) {
    const b = this.items && this.items.boxes[m.id];
    if (!b) return;
    b.active = m.active;
    b.pending = false;
    if (!m.active) this.raceEvent('boxHit', this.racerOf(m.u) || null, { box: m.id });
  }

  onFx(m) {
    const r = this.racerOf(m.u);
    if (!r) return;
    const k = r.kart;
    const mine = r.isPlayer;
    if (m.item === 'mystery') {
      this.raceEvent('mystery', r, { effect: m.effect });
      if (m.effect === 'rainbow') { k.rainbowT = TU.rainbowTime; if (mine) { k.invulnT = TU.rainbowTime; giveBoost(k, TU.rainbowMul, TU.rainbowTime, 'rainbow'); } }
      if (m.effect === 'bubbleBoost') { k.shield = true; if (mine) giveBoost(k, TU.speedMul, TU.speedTime, 'item'); }
      if (m.effect === 'snowGlobe' && !mine) { const me = this.meRacer(); if (me) { me.kart.slowT = TU.snowGlobeTime; me.kart.slowMul = TU.snowGlobeMul; me.kart.frozenT = TU.snowGlobeTime; } }
      return;
    }
    this.raceEvent('itemUse', r, { item: m.item });
    if (m.item === 'shield') k.shield = true;
    if (m.item === 'trail') k.trailT = TU.trailTime;
    if (!mine) return;
    if (m.item === 'speed') giveBoost(k, TU.speedMul, TU.speedTime, 'item');
    if (m.item === 'trail') giveBoost(k, TU.trailMul, TU.trailTime, 'trail');
    if (m.item === 'spring') { k.vy += TU.springUp; k.grounded = false; k.canTrick = true; k.airT = 0; giveBoost(k, TU.springForward, 0.9, 'spring'); }
  }

  onHit(m) {
    const r = this.racerOf(m.u);
    if (!r) return;
    if (r.isPlayer) { spinOut(r.kart, m.kind === 'rocket' ? TU.rocketSpin : TU.stickySpin, Math.random() < 0.5 ? 1 : -1); r.kart.invulnT = 1.2; }
    else r.kart.spinT = 1.0;
    this.raceEvent('itemHit', r, { kind: m.kind, by: this.racerOf(m.by) });
  }

  onHazard(m) {
    if (!this.items) return;
    if (m.add) this.items.hazards.push({ ...m.add, active: true });
    if (m.remove) {
      const ids = new Set(m.remove);
      for (const h of this.items.hazards) if (ids.has(h.id)) { const near = this.racersNear(h); if (near) this.raceEvent('splashed', near, { x: h.x, z: h.z }); }
      this.items.hazards = this.items.hazards.filter((h) => !ids.has(h.id));
    }
  }

  racersNear(h) {
    const race = this.game.race;
    let best = null, bd = 9;
    for (const r of race.racers) { const d = (r.kart.x - h.x) ** 2 + (r.kart.z - h.z) ** 2; if (d < bd) { bd = d; best = r; } }
    return best;
  }

  onFinish(m) {
    const race = this.game.race;
    const r = this.racerOf(m.u);
    if (!race || !r || r.finished) return;
    race.finish(r);
    r.finishTime = m.time;
    r.place = m.place;
    // like single player: the computer drives your car on after the finish. Online it is a
    // see-through ghost nobody can bump into (game.js / race.js check r.finished)
    if (r.isPlayer) r.controller = createAI('hard');
  }

  onRaceEnd(m) {
    this.mode = 'results';
    this.game.paused = false;
    this.pauseState = null; this.renderPause();
    this.resultsScreen = this.ui.show(screens.OnlineResults, { online: this, end: m }, { replace: true });
  }

  onCorrect(m) {
    const me = this.meRacer();
    if (!me) return;
    const k = me.kart;
    k.x = k.px = m.x; k.y = k.py = m.y + 0.2; k.z = k.pz = m.z;
    k.vx *= 0.3; k.vz *= 0.3;
  }

  onStatus(m) {
    if (m.status === 'reconnecting' && this.mode === 'race') this.ui.toast('Connection lost, trying again...', 'bad');
  }

  // ---------------------------------------------------------------- pause vote

  requestPause() {
    const race = this.game.race;
    if (!race || !race.online || race.state !== 'racing' || this.spectating) return; // watchers have no vote
    this.pausePanel = !this.pausePanel;
    this.renderPause();
  }
  vote(on) { this.net.send(on ? 'pauseVote' : 'pauseCancel'); }
  // the ` key: vote for a pause straight away (no menu); press it again to take it back
  quickPause() {
    const race = this.game.race;
    if (!race || !race.online || race.state !== 'racing' || this.spectating) return;
    const s = this.pauseState;
    if (s && (s.state === 'paused' || s.state === 'countdown')) { if (s.state === 'paused') this.readyUp(); return; }
    const iVoted = !!(s && s.votes && s.votes.includes(this.me.uid));
    this.vote(!iVoted);
  }
  readyUp() { this.net.send('pauseReady'); }

  onPause(m) {
    // a notice at the top for everyone when somebody asks for a pause (or takes it back)
    const before = new Set((this.pauseState && this.pauseState.votes) || []);
    const now = new Set(m.votes || []);
    const race = this.game.race;
    const nameOf = (u) => (race && race.racers.find((r) => r.data.uid === u) || {}).name || 'Someone';
    if (this.mode === 'race' && m.state === 'voting') {
      for (const u of now) {
        if (before.has(u)) continue;
        const count = `(${now.size}/${m.needed})`;
        if (u === this.me.uid) this.game.hud.notice(`You asked for a pause ${count}. Press \` again to cancel`, 'pause', 4, 'pause');
        else this.game.hud.notice(`${nameOf(u)} wants to pause ${count}. Press \` to agree`, 'pause', 5, 'pause');
      }
    }
    if (this.mode === 'race' && (m.state === 'voting' || m.state === 'none')) {
      for (const u of before) if (!now.has(u) && u !== this.me.uid) this.game.hud.notice(`${nameOf(u)} took back their pause request`, '', 3, 'pause');
    }
    if (m.state === 'paused' && (!this.pauseState || this.pauseState.state !== 'paused')) this.game.hud.notice('The race is paused', 'pause', 2.5, 'pause');
    this.pauseState = m;
    if (m.state === 'paused' || m.state === 'countdown') this.game.paused = true;
    if (m.state === 'none' || m.state === 'voting') { if (this.game.paused && !m.resumeAt) this.game.paused = false; }
    this.renderPause();
  }

  renderPause() {
    const s = this.pauseState;
    const show = this.mode === 'race' && (this.pausePanel || (s && (s.state === 'paused' || s.state === 'countdown')));
    if (!show) { if (this.pauseEl) { this.pauseEl.remove(); this.pauseEl = null; } return; }
    if (!this.pauseEl) { this.pauseEl = document.createElement('div'); this.pauseEl.className = 'pause-vote'; document.body.appendChild(this.pauseEl); }
    screens.renderPauseVote(this.pauseEl, this, s);
  }

  // ---------------------------------------------------------------- per frame

  tick(dt) {
    if (this.mode === 'lobby') this.tickLobby(dt);
    else if (this.mode === 'race') this.tickRace(dt);
  }

  tickLobby(dt) {
    const race = this.game.race;
    if (!race) return;
    const k = race.player.kart;
    this.sendAcc += dt;
    if (this.sendAcc > 0.1) {
      this.sendAcc = 0;
      this.net.send('p', { x: k.x, y: k.y, z: k.z, yaw: k.yaw, sp: k.speed, fl: flagsOf(k) });
    }
    for (const r of this.remote.values()) {
      const t = r.target, rk = r.kart;
      const a = 1 - Math.exp(-dt * 10);
      rk.x += (t.x - rk.x) * a; rk.y += (t.y - rk.y) * a; rk.z += (t.z - rk.z) * a;
      let dy = t.yaw - rk.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      rk.yaw += dy * a; rk.speed = t.sp || 0; rk.time += dt;
      rk.px = rk.x; rk.py = rk.y; rk.pz = rk.z; rk.pyaw = rk.yaw;
      applyFlags(rk, t.fl | 0, 0);
      r.vis.update(rk, 1, dt);
    }
  }

  tickRace(dt) {
    const race = this.game.race;
    if (!race || !race.online || !this.buffers) return;
    const me = race.player;
    // remote karts: shown a little in the past, smoothly between server updates
    const renderAt = this.net.serverNow() - INTERP_MS;
    for (const r of race.racers) {
      if (!r.remote) continue;
      const buf = this.buffers.get(r.data.uid);
      if (!buf || !buf.length) continue;
      while (buf.length > 2 && buf[1].at <= renderAt) buf.shift();
      const a = buf[0], b = buf[1] || buf[0];
      const span = Math.max(1, b.at - a.at);
      const u = Math.max(0, Math.min(1.3, (renderAt - a.at) / span));
      const k = r.kart;
      k.x = a.x + (b.x - a.x) * u; k.y = a.y + (b.y - a.y) * u; k.z = a.z + (b.z - a.z) * u;
      let dy = b.yaw - a.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      const yaw = a.yaw + dy * u;
      k.steer = Math.max(-1, Math.min(1, -dy * 4));
      k.yaw = yaw; k.px = k.x; k.py = k.y; k.pz = k.z; k.pyaw = yaw;
      k.speed = b.sp; k.vx = b.vx; k.vz = b.vz;
      applyFlags(k, b.fl, b.d);
    }
    // my kart's state to the server, 20 times a second
    this.sendAcc += dt;
    if (me && this.sendAcc >= 0.05) {
      this.sendAcc = 0;
      const k = me.kart;
      let fl = flagsOf(k);
      if (this.respawnFlagT > 0) fl |= FL.RESPAWN;
      this.net.send('k', { x: +k.x.toFixed(2), y: +k.y.toFixed(2), z: +k.z.toFixed(2), yaw: +k.yaw.toFixed(3), vx: +k.vx.toFixed(2), vz: +k.vz.toFixed(2), sp: +k.speed.toFixed(1), fl, d: k.drift.on ? k.drift.dir * (2 + Math.round((k.drift.ang || 0) * 57.3)) : 0 }); // d: drift side and angle in degrees (+2)
    }
    if (this.respawnFlagT > 0) this.respawnFlagT -= dt;
    if (me && me.kart.events.some((e) => e.type === 'rescue')) this.respawnFlagT = 0.8;
    if (me && me.roulette > 0) me.roulette -= dt;
  }
}

// ------------------------------------------------------------------ online items (shown, not decided)

class OnlineItems {
  constructor(race, online) {
    this.race = race; this.online = online;
    this.boxes = [];
    for (const row of race.track.def.itemBoxes || []) {
      const path = row.path ? race.track.paths.find((p) => p.id === row.path) : race.track.main;
      if (!path) continue;
      const p = pointAt(path, row.path ? path.length * (row.f ?? 0.5) : row.s);
      for (const lat of row.lats || [0]) {
        const x = p.x + p.rx * lat, z = p.z + p.rz * lat;
        const g = race.world.ground(x, p.y + 4, z);
        this.boxes.push({ id: this.boxes.length, x, y: (g ? g.y : p.y) + 1.1, z, active: true });
      }
    }
    this.rockets = []; this.hazards = race.hazards = []; this.freezes = []; this.trail = [];
    this.prevBtn = false;
  }
  step(dt) {
    const race = this.race, me = race.player;
    if (race.state !== 'racing') return;
    if (!me) { // watching: only the other cars' effect timers
      for (const r of race.racers) { const rk = r.kart; if (rk.trailT > 0) rk.trailT -= dt; if (rk.rainbowT > 0) rk.rainbowT -= dt; if (rk.frozenT > 0) rk.frozenT -= dt; }
      return;
    }
    const k = me.kart;
    // drive through a box: ask the server for it (it checks we really were there)
    for (const b of this.boxes) {
      if (!b.active || b.pending) continue;
      if ((b.x - k.x) ** 2 + (b.z - k.z) ** 2 < TU.boxRadius ** 2 && Math.abs(b.y - 1.1 - k.y) < 2.2) {
        b.pending = true; b.active = false;
        this.online.net.send('box', { id: b.id });
        setTimeout(() => { b.pending = false; }, 1500);
      }
    }
    // use the item: the server says what happens
    const btn = !!k.input.item;
    if (btn && !this.prevBtn && me.item && !me.finished) {
      this.online.net.send('use');
      me.itemCharges--;
      if (me.itemCharges <= 0) me.item = null;
    }
    this.prevBtn = btn;
    // turbo trails left by anyone glow and boost whoever rides them
    const t = race.time;
    for (const r of race.racers) {
      const rk = r.kart;
      if (rk.trailT > 0) {
        rk.trailT -= dt;
        if (!r._tn || t >= r._tn) { r._tn = t + 0.09; this.trail.push({ x: rk.x - Math.sin(rk.yaw) * 1.2, y: rk.y + 0.05, z: rk.z - Math.cos(rk.yaw) * 1.2, t, owner: r.index }); }
      }
      if (rk.rainbowT > 0) rk.rainbowT -= dt;
      if (rk.frozenT > 0) rk.frozenT -= dt;
    }
    this.trail = this.trail.filter((s) => t - s.t < TU.trailSegLife);
    if (k.grounded && k.padCool <= 0) {
      for (const s of this.trail) {
        if (s.owner === me.index && t - s.t < 0.35) continue;
        if ((k.x - s.x) ** 2 + (k.z - s.z) ** 2 < 2.2) { giveBoost(k, 1.26, TU.trailBoost, 'trailride'); k.padCool = 0.3; break; }
      }
    }
  }
}

// ------------------------------------------------------------------ helpers

function flagsOf(k) {
  const i = k.input;
  return (k.drift.on ? FL.DRIFT : 0) | (k.boostT > 0 ? FL.BOOST : 0) | (!k.grounded ? FL.AIR : 0) | (k.spinT > 0 ? FL.SPIN : 0)
    | (k.shield ? FL.SHIELD : 0) | (k.rainbowT > 0 ? FL.RAINBOW : 0) | (k.trailT > 0 ? FL.TRAIL : 0)
    | (i && (i.throttle || i.steer || i.item || i.back) ? FL.INPUT : 0);
}

function applyFlags(k, fl, d) {
  k.drift.on = !!(fl & FL.DRIFT);
  k.drift.dir = d ? Math.sign(d) : (k.drift.dir || 1);
  k.drift.tier = 0;
  // drift angle from the other player's game (degrees + 2); an older game version only sends 1
  k.drift.ang = !k.drift.on ? 0 : Math.abs(d) >= 2 ? (Math.abs(d) - 2) / 57.3 : 0.42;
  k.boostT = fl & FL.BOOST ? 0.1 : 0;
  k.boostKind = 'item';
  k.grounded = !(fl & FL.AIR);
  if (fl & FL.SPIN) { k.spinT = 0.2; k.spinAngle += 0.25; } else { k.spinT = 0; k.spinAngle = 0; }
  if (fl & FL.TRAIL && k.trailT <= 0) k.trailT = 0.2;
  if (fl & FL.RAINBOW) k.rainbowT = Math.max(k.rainbowT || 0, 0.2);
  const dv = k.drift.on ? -k.drift.dir * k.drift.ang : 0;
  k.driftVis += (dv - k.driftVis) * 0.2;
  k.snx = 0; k.sny = 1; k.snz = 0;
}

// another player's chosen accessory as KartVisual cosmetics (cars keep their own livery)
function lookCosmetics(look) {
  return look ? { acc: look.acc } : {};
}

function fakeKart(def) {
  return {
    def, x: 0, y: 0, z: 0, px: 0, py: 0, pz: 0, yaw: 0, pyaw: 0, speed: 0, steer: 0, vx: 0, vy: 0, vz: 0, time: 0,
    snx: 0, sny: 1, snz: 0, grounded: true, airT: 0, gy: 0, driftVis: 0, spinAngle: 0, trickSpin: 0, spinT: 0, invulnT: 0, rescue: false,
    respawnT: 0, boostT: 0, boostKind: '', frozen: false, input: { throttle: 0, back: false }, drift: { on: false, dir: 1, tier: 0 },
    shield: false, rainbowT: 0, trailT: 0, frozenT: 0, events: [],
  };
}

export { THREE };
