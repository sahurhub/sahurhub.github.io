// TURBO TOWN - app controller: menus, race modes (Quick Race, Single Race, Grand Prix,
// Time Trials), the race intro, pause, finishing and results.
import { createAI } from './ai/ai-driver.js';
import { KARTS, KART_BY_ID } from './shared/karts.js';
import { DRIVERS, CUPS, GP_POINTS, MAP_INFO, LAPS } from './shared/rules.js';
import { MAP_BY_ID } from './maps/index.js';
import { GhostRecorder, GhostPlayer } from './race/ghost.js';
import { Showroom } from './render/showroom.js';
import * as screens from './ui/screens/index.js';
import { makeRng } from './core/noise.js';
import { saveSettings } from './save/settings.js';
import { AdminQuick } from './ui/admin-quick.js';

const TIPS = [
  'Keep turning for a moment at speed and your kart slides into a drift. Drifting turns tighter, so it gets you round sharp corners.',
  'Fly off a ramp and your kart does a trick. Land it for a little boost.',
  'Press <b>Space</b> to use your item.',
  'Press accelerate when the <b>1</b> appears in the countdown for a rocket start. Too early and you stall!',
  'Racers further back get better items from item boxes.',
  'The <b>Bubble Shield</b> blocks one hit. Keep it for when a rocket is coming.',
  'Press <b>Shift</b> (or <b>Y</b> on a controller) to look behind you.',
  'Bumping the barriers slows you down. Stay off the walls!',
  'Every map has a shortcut, and some of them are hidden. Explore!',
  'Overtaking other racers earns you coins.',
  'Grass, sand and mud slow you down. Boost pads speed you up.',
  'Win cups in Grand Prix to open new maps.',
  'Heavy karts push light karts around. Light karts speed up faster.',
  'Ice is slippery. Turn early and gently.',
  'Spring Jump can hop you over hazards and some gaps.',
  'Time Trials save a ghost of your best lap so you can race yourself.',
];

export class App {
  constructor({ game, ui, profile, assets }) {
    this.game = game;
    this.ui = ui;
    this.profile = profile;
    this.assets = assets;
    ui.app = this;
    game.showroom = new Showroom(assets);
    this.active = null;   // current race config
    this.gp = null;       // Grand Prix in progress
    game.on('raceEvent', (e) => this.onRaceEvent(e));
    game.on('introDone', () => { this.game.hud.show(true); });
    game.hud.onButton = (b) => this.hudButton(b);
    game.hud.setSound(game.settings.sfx !== false);
    this.loading = document.getElementById('loading');
  }

  // per frame (called from the game loop)
  tick(dt) {
    const g = this.game;
    if (this.online) this.online.tick(dt);
    // public chat: bottom left while racing, bottom right everywhere else (when signed in)
    if (this.gchat) {
      const racing = g.view === 'race' && g.race && (!g.race.practice || g.race.roam) && !this.ui.current && !g.intro;
      this.gchat.setMode(!this.profile ? 'hidden' : racing ? 'race' : 'menu');
      this.gchat.tick();
    }
    // admin accounts: 1 pauses an online race at once, 2-4 open the quick command menus
    const adminRace = g.view === 'race' && g.race && g.race.online && this.online && this.profile && this.profile.admin;
    if (adminRace) { if (!this.adminQuick) this.adminQuick = new AdminQuick(this); this.adminQuick.tick(dt); }
    else if (this.adminQuick) this.adminQuick.close();
    if (g.view === 'race' && g.race && g.race.online) {
      if (g.input.consume('pause')) { if (g.intro) g.skipIntro(); else this.online.requestPause(); }
      if (g.input.consume('quickpause')) this.online.quickPause();
      return;
    }
    if (g.view === 'race' && g.race && this.active) {
      if (g.input.consume('quickpause') && !g.intro && !this.resultsShown) this.togglePause();
      if (g.input.consume('pause')) {
        if (g.intro) g.skipIntro();
        else if (!this.resultsShown) this.togglePause();
      }
      if (g.intro && (g.input.consume('confirm') || g.input.keys.has('item'))) g.skipIntro();
    } else g.input.clearPresses();
  }

  // ---------------------------------------------------------------- menus

  menu() {
    if (this.online && this.online.party) { this.online.leave(); return; }
    if (this.online) this.online.mode = 'none';
    this.active = null; this.gp = null;
    this.game.endRace();
    this.game.paused = false;
    this.game.setView('showroom');
    const p = this.profile.get();
    this.game.showroom.showKart(p.kart, { paint: this.profile.lookFor(p.kart).paint, cosmetics: this.cosmeticsFor(p.kart) });
    this.ui.show(screens.MainMenu, {}, { replace: true });
    if (this.game.slowSeen) this.offerLowGraphics(this.game.slowSeen);
  }

  // the last race ran slowly: offer Low graphics (asked once per device)
  offerLowGraphics(fps) {
    const g = this.game;
    g.slowSeen = 0;
    const s = { ...g.settings, lowAsked: true };
    const keep = () => { g.applySettings(s); saveSettings(s); };
    this.ui.modal({
      title: 'Smoother racing?',
      text: `The last race ran at about ${fps} frames per second on this computer. Low graphics makes the game smoother. You can change this any time in Settings.`,
      buttons: [
        { label: 'Use Low graphics', cls: 'small', onClick: () => { s.quality = 'low'; keep(); if (g.map) g.unloadMap(); this.ui.toast('Graphics set to Low', 'good'); } },
        { label: 'Keep as it is', cls: 'small ghost', onClick: keep },
      ],
    });
  }

  cosmeticsFor(kartId) {
    const l = this.profile.lookFor(kartId);
    return { acc: l.acc };
  }

  showLoading(text) {
    this.loading.classList.remove('hidden');
    document.getElementById('loading-what').textContent = text;
    document.getElementById('loading-fill').style.width = '60%';
    this.tipN = ((this.tipN ?? Math.floor(Math.random() * TIPS.length)) + 1) % TIPS.length;
    document.getElementById('loading-tip').innerHTML = '<b>Tip:</b> ' + TIPS[this.tipN];
  }
  hideLoading() { this.loading.classList.add('hidden'); }

  // ---------------------------------------------------------------- racing

  // cfg: { mode: 'quick'|'single'|'gp'|'tt', map, aiCount, difficulty, playerSlot }
  async startRace(cfg) {
    const p = this.profile.get();
    cfg.kart = cfg.kart || p.kart;
    this.ui.hide();
    this.showLoading('Getting ' + (MAP_BY_ID[cfg.map]?.name || 'the track') + ' ready');
    await new Promise((r) => setTimeout(r, 30));
    // the server notes the start of every race (results are only paid with this ticket)
    if (cfg.mode === 'gp') { cfg.cup = this.gp.cup; cfg.race = this.gp.race; cfg.aiCount = 7; }
    if (cfg.mode === 'tt') cfg.aiCount = 0;
    try { cfg.ticket = await this.profile.startRace(cfg); } catch (e) { this.hideLoading(); this.ui.toast(e.message, 'bad'); this.menu(); return null; }
    const ghostData = cfg.mode === 'tt' ? await this.profile.ghost(cfg.map).catch(() => null) : null;
    const racers = this.buildRacers(cfg);
    this.resultsShown = false;
    this.game.paused = false;
    const race = await this.game.startRace({ map: cfg.map, racers, laps: LAPS, items: cfg.mode !== 'tt' && cfg.items !== false });
    this.active = cfg;
    // time trials: race your best ghost
    this.recorder = this.game.recorder = cfg.mode === 'tt' ? new GhostRecorder() : null;
    if (ghostData && ghostData.data) this.game.ghost = new GhostPlayer(ghostData, this.assets, this.game.r.scene);
    this.hideLoading();
    this.game.startIntro(cfg.mode === 'tt' || cfg.retry ? 1.6 : 3.4);
    const name = MAP_BY_ID[cfg.map]?.name || cfg.map;
    const sub = cfg.mode === 'gp' ? `${this.gp.cupName} - Race ${this.gp.race + 1} of 4` : cfg.mode === 'tt' ? 'Time Trial' : '';
    this.game.hud.banner(name, 'title', 3);
    if (sub) setTimeout(() => this.game.hud.toast(sub), 300);
    this.showHelpOnce();
    return race;
  }

  // first three races on this device: the controls as keycaps during the countdown
  showHelpOnce() {
    let n = 0;
    try { n = Number(localStorage.getItem('turbotown.help') || 0) || 0; if (n >= 3) return; localStorage.setItem('turbotown.help', String(n + 1)); } catch (e) { return; }
    const pad = this.game.input.lastDevice === 'pad';
    const keys = pad
      ? { up: ['A', 'GAS'], left: ['STICK', 'STEER'], right: null, down: ['B', 'BRAKE'], back: ['Y', 'BEHIND'], item: ['X', 'ITEM'] }
      : { up: ['W', 'GAS'], left: ['A', 'LEFT'], right: ['D', 'RIGHT'], down: ['S', 'BRAKE'], back: ['SHIFT', 'BEHIND'], item: ['SPACE', 'ITEM'] };
    const cap = (k, cls) => (k ? `<div class="hk ${cls}"><kbd>${k[0]}</kbd><span>${k[1]}</span></div>` : '');
    const card = document.createElement('div');
    card.className = 'help-card';
    card.innerHTML = cap(keys.up, 'up') + cap(keys.left, 'left') + cap(keys.right, 'right') + cap(keys.down, 'down') + cap(keys.back, 'back') + cap(keys.item, 'item')
      + '<div class="hk-note">Keep turning to drift</div>';
    document.body.appendChild(card);
    const total = this.game.intro ? 9500 : 7000;
    setTimeout(() => card.classList.add('out'), total);
    setTimeout(() => card.remove(), total + 500);
  }

  buildRacers(cfg) {
    const p = this.profile.get();
    const look = this.profile.lookFor(cfg.kart);
    const me = { kart: cfg.kart, name: p.name || 'You', isPlayer: true, data: { paint: look.paint, cosmetics: this.cosmeticsFor(cfg.kart), boost: p.boost, id: 'me' } };
    if (cfg.mode === 'tt') return [me];
    let others;
    if (cfg.mode === 'gp') others = this.gp.entrants.filter((e) => !e.isPlayer);
    else others = this.makeEntrants(cfg.aiCount ?? 7).filter((e) => !e.isPlayer);
    const ai = others.map((e) => ({
      kart: e.kart, name: e.name, data: { id: e.id, diff: cfg.difficulty },
      controller: createAI(cfg.difficulty || 'normal', makeRng(Math.floor(Math.random() * 1e9))),
    }));
    // grid order
    let order;
    if (cfg.mode === 'gp' && this.gp.race > 0) {
      // leaders start at the back
      const pts = this.gp.points;
      order = [me, ...ai].sort((a, b) => (pts[a.data.id] || 0) - (pts[b.data.id] || 0));
    } else {
      order = [...ai];
      const slot = cfg.mode === 'gp' ? order.length : Math.min(order.length, cfg.playerSlot ?? 5);
      order.splice(slot, 0, me);
    }
    return order;
  }

  // up to 7 computer racers (names from the racer list) in random karts
  makeEntrants(count) {
    const rng = makeRng(Math.floor(Math.random() * 1e9));
    const drivers = DRIVERS.slice(0, 7);
    const out = [{ id: 'me', isPlayer: true }];
    for (let i = 0; i < Math.min(count, drivers.length); i++) {
      const d = drivers[i];
      out.push({ id: 'ai_' + d.id, name: d.name, kart: KARTS[Math.floor(rng() * KARTS.length)].id });
    }
    return out;
  }

  // Free roam on your own: drive anywhere in Turbo City, no race. Esc pauses (and leaves).
  async freeRoam() {
    const p = this.profile.get();
    const look = this.profile.lookFor(p.kart);
    this.ui.hide();
    this.showLoading('Getting Turbo City ready');
    await new Promise((r) => setTimeout(r, 30));
    this.resultsShown = false;
    this.game.paused = false;
    await this.game.startRace({
      map: 'turbo-city', laps: 99, items: false, countdown: 0.01, roam: true,
      racers: [{ kart: p.kart, name: p.name || 'You', isPlayer: true, data: { paint: look.paint, cosmetics: this.cosmeticsFor(p.kart) } }],
    });
    this.active = { mode: 'roam', map: 'turbo-city' };
    this.hideLoading();
    this.game.hud.banner('TURBO CITY', 'title', 2.5);
    setTimeout(() => { if (this.active && this.active.mode === 'roam') this.game.hud.toast('Drive anywhere! Hold Space to drift, Esc to pause or leave'); }, 1200);
  }

  quickRace() {
    const maps = this.profile.get().maps;
    const map = maps[Math.floor(Math.random() * maps.length)];
    return this.startRace({ mode: 'quick', map, aiCount: 7, difficulty: 'normal' });
  }

  startGP(cupId, difficulty) {
    const cup = CUPS.find((c) => c.id === cupId);
    const p = this.profile.get();
    const entrants = this.makeEntrants(7);
    this.gp = { cup: cupId, cupName: cup.name, maps: cup.maps, difficulty, race: 0, entrants, points: {}, history: [] };
    return this.startRace({ mode: 'gp', map: cup.maps[0], difficulty });
  }

  nextGPRace() {
    this.gp.race++;
    return this.startRace({ mode: 'gp', map: this.gp.maps[this.gp.race], difficulty: this.gp.difficulty });
  }

  restart() {
    const cfg = { ...this.active, retry: true };
    this.closePause();
    return this.startRace(cfg);
  }

  // the small buttons at the top right of the race screen
  hudButton(b) {
    const g = this.game;
    if (b === 'sound') {
      const s = { ...g.settings, sfx: g.settings.sfx === false };
      g.applySettings(s); saveSettings(s);
      g.hud.setSound(s.sfx);
    } else if (b === 'full') {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else document.documentElement.requestFullscreen().catch(() => {});
    } else if (b === 'pause') {
      if (g.race && g.race.online) { if (this.online) this.online.requestPause(); }
      else if (g.view === 'race' && g.race && this.active && !this.resultsShown) {
        if (g.intro) g.skipIntro(); else this.togglePause();
      }
    }
  }

  // ---------------------------------------------------------------- pause

  togglePause() {
    if (this.game.paused) this.closePause();
    else {
      this.game.paused = true;
      this.ui.show(screens.PauseMenu, { mode: this.active.mode }, { replace: true });
    }
  }
  closePause() {
    this.game.paused = false;
    this.ui.hide();
    this.game.input.clearPresses();
  }

  // ---------------------------------------------------------------- finishing

  onRaceEvent(e) {
    const race = this.game.race;
    if (!race || !this.active || race.online || race.practice) return;
    // every lap you finish pays coins (the server checks it and pays straight away)
    if (e.type === 'lap' && e.racer === race.player && this.active.ticket && e.lap >= 1 && e.lap <= race.laps) {
      const lap = e.lap;
      this.profile.lapDone(this.active.ticket, lap)
        .then((out) => { if (out && out.coins && this.game.race === race) this.game.hud.toast(`Lap ${lap} +${out.coins} coins`, 'coin'); })
        .catch(() => {});
    }
    if (e.type === 'finish' && e.racer === race.player) {
      // let the computer drive the player's kart on, and show results shortly
      race.player.controller = createAI('hard');
      setTimeout(() => this.finishRace(), this.active.mode === 'tt' ? 1800 : 2800);
    }
  }

  // Order everyone, estimating finish times for drivers still on track.
  finalOrder(race) {
    const L = race.track.length;
    const rows = race.racers.map((r) => {
      let time = r.finishTime, est = false;
      if (!r.finished) {
        const left = Math.max(0, race.laps * L - r.progress.distance());
        time = race.time + left / (26 * (r.kart.speedScale || 1));
        est = true;
      }
      return { r, time, est };
    });
    rows.sort((a, b) => a.time - b.time);
    rows.forEach((row, i) => { row.place = i + 1; });
    return rows;
  }

  async finishRace() {
    const race = this.game.race;
    if (!race || this.resultsShown) return;
    this.resultsShown = true;
    const cfg = this.active;
    const rows = this.finalOrder(race);
    const me = rows.find((x) => x.r.isPlayer);
    const prof = this.profile.get();
    const out = { cfg, rows, me, lines: [], coins: 0, xp: 0 };

    if (cfg.mode === 'tt') {
      out.oldRecord = { ...(prof.records[cfg.map] || {}) };
      try {
        const res = await this.profile.submitTT({
          ticket: cfg.ticket, map: cfg.map, kart: cfg.kart, total: me.time, lap: me.r.bestLap, laps: me.r.lapTimes,
          ghost: this.recorder.encode({ kart: cfg.kart, paint: this.profile.lookFor(cfg.kart).paint }),
        });
        Object.assign(out, res);
      } catch (e) { out.error = e.message; }
      this.ui.show(screens.TimeTrialResults, out, { replace: true });
      return;
    }

    const overtakes = me.r.ov ? me.r.ov.count : 0;
    const field = race.racers.length;
    let gpPlace = 0;
    if (cfg.mode === 'gp') {
      const gp = this.gp;
      for (const row of rows) {
        const id = row.r.data.id;
        gp.points[id] = (gp.points[id] || 0) + GP_POINTS[row.place - 1];
      }
      gp.history.push(rows.map((row) => ({ id: row.r.data.id, place: row.place })));
      if (gp.race >= 3) {
        gpPlace = this.gpStandings().findIndex((s) => s.id === 'me') + 1;
        out.gpDone = true; out.gpPlace = gpPlace;
      }
    }
    try {
      const res = await this.profile.submitRace({
        ticket: cfg.ticket, mode: cfg.mode, map: cfg.map, place: me.place, field, overtakes, time: me.time, bestLap: me.r.bestLap,
        difficulty: cfg.difficulty, clean: !me.r.stats.fall, cup: cfg.cup, gpRace: cfg.race, gpPlace,
        stats: { items: me.r.stats.itemUse || 0, turbo3: me.r.stats.drifts || 0 }, // turbo3 = drifts now shortcuts: [...(me.r.shortcuts || [])],
      });
      Object.assign(out, res);
    } catch (e) { out.error = e.message; }
    this.ui.show(screens.RaceResults, out, { replace: true });
  }

  gpStandings() {
    const gp = this.gp;
    return gp.entrants.map((e) => ({ ...e, pts: gp.points[e.id] || 0 }))
      .sort((a, b) => b.pts - a.pts || (a.isPlayer ? -1 : 1));
  }

  // GP podium in the showroom
  showPodium() {
    const st = this.gpStandings();
    const p = this.profile.get();
    this.game.endRace();
    this.game.setView('showroom');
    this.game.showroom.showPodium(st.slice(0, 3).map((e) => e.isPlayer
      ? { kart: p.kart, paint: this.profile.lookFor(p.kart).paint, cosmetics: this.cosmeticsFor(p.kart) }
      : { kart: e.kart }));
  }
}

export { MAP_INFO, KART_BY_ID };
