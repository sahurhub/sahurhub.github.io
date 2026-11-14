// DOM user interface: title screen, HUD, minimap, prompts, pop-ups, toasts, and all menus.
import * as THREE from 'three';
import {
  VEHICLES, VEHICLE_BY_ID, UPGRADE_STATS, UPGRADE_MAX, UPGRADE_FREE_MAX, PAINTS, WHEELS, ACCESSORIES, COSMETICS, EQUIPMENT,
  GARAGE_UPGRADES, DISTRICTS, DISTRICT_ORDER, JOB_TYPES, RARITY_BY_ID, SPECIAL_MISSIONS, TIME_TRIALS, SHIRT_COLORS, PANTS_COLORS,
  COLOR_PRICE, vehicleStats, upgradeCost, STREAK_BONUS, STREAK_MAX, GAME_VERSION,
} from './config.js';
import { fmtMoney, fmtShort, fmtTime, fmtDist, clamp, lerp } from './utils.js';
import { CityMap } from './map.js';
import { districtAt, gx } from './cityLayout.js';
import { TEX } from './textures.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SVG = {
  map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/></svg>',
  missions: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3"/></svg>',
  garage: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/></svg>',
  shop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h16l-1.5 12h-13z"/><path d="M8 8a4 4 0 0 1 8 0"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
};
const TIPS = [
  'Rarer parcels pay much more. Legendary ones glow gold!',
  'Bigger vehicles carry more parcels, and bulk orders pay extra for every parcel.',
  'Keep a delivery streak going for up to +40% pay.',
  'Fragile parcels lose value with every bump. Drive gently!',
  'Golden Drop events appear on the map now and then. Grab them first!',
  'Press V to call your vehicle to you, and R to put it back on the road.',
  'Unlock new districts in the Shop for better paying jobs.',
  'Time trials start at the red flags on the map. Gold medals pay best.',
];

export class UI {
  constructor(game) {
    this.g = game;
    this.hud = document.getElementById('hud');
    this.menus = document.getElementById('menus');
    this.worldUi = document.getElementById('world-ui');
    this.toasts = document.getElementById('toasts');
    this.speedCanvas = document.getElementById('speedlines');
    this.menu = null;            // {name, el, ...}
    this.shownMoney = 0;
    this.popups = [];
    this.bubbles = [];
    this.frame = 0;
    this.v3 = new THREE.Vector3();
    addEventListener('keydown', e => this.onKey(e));
    this.menus.addEventListener('mouseover', e => { const b = e.target.closest('button'); if (b && b !== this.lastHover) { this.lastHover = b; this.g.audio && this.g.audio.uiHover(); } });
    this.drawSpeedLines();
  }

  // ---------------------------------------------------------------- setup after the world exists
  init() {
    this.map = new CityMap(this.g);
    this.buildHUD();
    this.wire();
    this.shownMoney = this.g.profile.money;
  }

  wire() {
    const ev = this.g.events;
    ev.on('money', e => {
      this.moneyEl && this.moneyEl.classList.remove('bump');
      void (this.moneyEl && this.moneyEl.offsetWidth);
      this.moneyEl && this.moneyEl.classList.add('bump');
      if (e.source === 'delivery' || e.source === 'trial') this.popupAtPlayer('+' + fmtMoney(e.amount), 'money');
      this.refreshMenu();
    });
    ev.on('spend', () => this.refreshMenu());
    ev.on('xp', e => { if (e.source === 'delivery') setTimeout(() => this.popupAtPlayer('+' + e.amount + ' XP', 'xp'), 250); });
    ev.on('levelup', e => this.levelUp(e));
    ev.on('job:complete', e => { this.summary(e); this.tutorialEvent('complete'); });
    ev.on('job:accepted', job => { this.toast(`Job accepted: ${job.name}. Go to the blue marker.`, 'good'); this.tutorialEvent('accepted'); this.refreshMenu(); });
    ev.on('job:pickup', job => { this.toast(`Collected ${job.name}! Deliver it to the green marker.`, 'good'); this.tutorialEvent('pickup'); });
    ev.on('job:drop', e => { if (!e.last) this.toast(`Drop ${e.index + 1} done. Next stop marked.`, 'good'); });
    ev.on('job:failed', e => this.toast(e.reason === 'late' ? 'Too late! The job failed and your streak was reset.' : e.reason === 'broken' ? 'The fragile parcel broke! Job failed.' : 'Job cancelled. Your streak was reset.', 'warn'));
    ev.on('job:late', () => this.toast('You are late. The pay drops by 25%.', 'warn'));
    ev.on('job:damage', e => { if (e.dmg > 6) this.toast(`Careful! Parcel condition ${Math.round(e.health)}%`, 'warn'); });
    ev.on('achievement', a => this.toast(`${a.name} (+${fmtMoney(a.reward)})`, 'gold', 'Achievement unlocked'));
    ev.on('daily:done', d => this.toast(`${d.text}. Claim it in Missions > Daily.`, 'gold', 'Daily mission complete'));
    ev.on('event:start', e => this.toast(`A Golden Drop appeared in ${DISTRICTS[e.job.district].name}! Find the gold star on the map.`, 'gold', 'Event'));
    ev.on('event:end', () => this.toast('The Golden Drop vanished.', 'warn'));
    ev.on('toast', t => this.toast(t.text, t.kind));
    ev.on('npc:say', s => this.bubble(s));
    ev.on('trial:start', t => this.toast(`${t.def.name}: drive through every red checkpoint!`, 'good'));
    ev.on('trial:tick', n => this.countdown(n === 0 ? 'GO!' : String(n)));
    ev.on('trial:end', e => {
      if (e.cancelled) return this.toast('Time trial cancelled.', 'warn');
      const medal = ['Gold', 'Silver', 'Bronze'][e.medal] || 'No medal';
      this.toast(`${e.def.name}: ${fmtTime(e.time)} - ${medal}${e.reward ? ' +' + fmtMoney(e.reward) : ''}`, e.medal >= 0 ? 'gold' : 'warn', 'Time trial');
    });
    ev.on('purchase', e => { if (e.kind === 'vehicle') this.tutorialEvent('bought'); this.refreshMenu(); });
    ev.on('district', e => { this.map.drawLocks(); this.toast(`${DISTRICTS[e.id].name} unlocked! New jobs are on its job board.`, 'gold'); this.refreshMenu(); });
    ev.on('vehicle:enter', def => this.tutorialEvent('ride', def));
  }

  // ---------------------------------------------------------------- title
  showTitle(onPlay) {
    const p = this.g.profile;
    const has = !this.g.isNewPlayer;
    const el = document.createElement('div');
    el.id = 'title';
    el.innerHTML = `
      <div class="title-box">
        <div class="logo"><span class="logo-a">DELIVERY</span><span class="logo-b">RUSH</span></div>
        ${has ? `<div class="title-save">Level ${p.level} &middot; ${fmtMoney(p.money)} &middot; ${p.stats.deliveries} deliveries</div>` : ''}
        <div class="title-buttons">
          <button class="btn big green" data-t="play">${has ? 'Continue' : 'Play'}</button>
          ${has ? '<button class="btn gray" data-t="new">New Game</button>' : ''}
          <div style="display:flex;gap:10px">
            <button class="btn blue small" data-t="settings">Settings</button>
            <button class="btn blue small" data-t="controls">Controls</button>
            <button class="btn blue small" data-t="credits">Credits</button>
          </div>
        </div>
      </div>
      <div class="title-foot">DELIVERY RUSH v${GAME_VERSION} &middot; progress saves automatically in this browser</div>`;
    document.body.appendChild(el);
    this.titleEl = el;
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-t]');
      if (!b) return;
      this.g.audio.init(); this.g.audio.uiClick();
      const t = b.dataset.t;
      if (t === 'play') { el.remove(); this.titleEl = null; onPlay(); }
      if (t === 'new') this.confirm('Start a new game? This deletes your saved progress.', () => this.g.resetProgress());
      if (t === 'settings') this.openSettings();
      if (t === 'controls') this.openControls();
      if (t === 'credits') this.openCredits();
    });
  }

  // ---------------------------------------------------------------- HUD
  buildHUD() {
    this.hud.innerHTML = `
      <div class="hud-profile">
        <div class="lvl-badge"><span id="h-lvl">1</span><small>LEVEL</small></div>
        <div class="hud-bars">
          <div class="money" id="h-money"><span class="coin">$</span><span id="h-money-v">0</span></div>
          <div class="xpbar"><div class="fill" id="h-xp"></div><span id="h-xp-t"></span></div>
          <div class="streak" id="h-streak"></div>
        </div>
      </div>
      <div class="side-buttons">
        <button class="side-btn sb-map" data-open="map">${SVG.map}Map<span class="key">M</span></button>
        <button class="side-btn sb-missions" data-open="missions">${SVG.missions}Missions<span class="key">J</span><span class="dot hidden" id="h-dot"></span></button>
        <button class="side-btn sb-garage" data-open="garage">${SVG.garage}Garage<span class="key">G</span></button>
        <button class="side-btn sb-shop" data-open="shop">${SVG.shop}Shop<span class="key">B</span></button>
        <button class="side-btn sb-settings" data-open="settings">${SVG.settings}Settings</button>
      </div>
      <div class="mission-card hidden" id="h-mission"></div>
      <div class="trial-hud hidden" id="h-trial"></div>
      <div class="hint hidden" id="h-hint"></div>
      <div class="event-banner hidden" id="h-event"></div>
      <div class="prompt hidden" id="h-prompt"></div>
      <div class="vehicle-panel" id="h-vehicle"></div>
      <div class="minimap-wrap"><canvas id="minimap" width="210" height="210"></canvas>
        <div class="mm-info"><span class="chip" id="h-district"></span><span class="chip" id="h-clock"></span></div></div>
      <div class="fps hidden" id="h-fps"></div>
      <div class="edge-arrow hidden" id="h-edge"><svg viewBox="0 0 40 40"><path d="M20 4 L36 34 L20 26 L4 34 Z" fill="currentColor" stroke="#fff" stroke-width="3" stroke-linejoin="round"/></svg><span></span></div>`;
    const $ = id => document.getElementById(id);
    Object.assign(this, {
      lvlEl: $('h-lvl'), moneyEl: $('h-money'), moneyV: $('h-money-v'), xpEl: $('h-xp'), xpT: $('h-xp-t'), streakEl: $('h-streak'),
      missionEl: $('h-mission'), trialEl: $('h-trial'), hintEl: $('h-hint'), eventEl: $('h-event'), promptEl: $('h-prompt'),
      vehEl: $('h-vehicle'), mmCanvas: $('minimap'), districtEl: $('h-district'), clockEl: $('h-clock'), fpsEl: $('h-fps'), dotEl: $('h-dot'),
      edgeEl: $('h-edge'),
    });
    this.hud.addEventListener('click', e => {
      const b = e.target.closest('[data-open]');
      if (!b) return;
      this.g.audio.uiClick();
      this.openByName(b.dataset.open);
    });
  }

  openByName(n) {
    if (n === 'map') this.openMap();
    if (n === 'missions') this.openMissions();
    if (n === 'garage') this.openGarage();
    if (n === 'shop') this.openShop();
    if (n === 'settings') this.openSettings();
  }

  update(dt) {
    this.frame++;
    const g = this.g;
    if (g.state !== 'playing' || !this.lvlEl) { this.updateWorldUi(dt); return; }
    const p = g.profile;
    // money counter
    this.shownMoney = Math.abs(this.shownMoney - p.money) < 1 ? p.money : lerp(this.shownMoney, p.money, Math.min(1, dt * 6));
    this.moneyV.textContent = fmtMoney(this.shownMoney);
    this.lvlEl.textContent = p.level;
    const xp = g.eco.xpProgress();
    this.xpEl.style.width = (xp.frac * 100).toFixed(1) + '%';
    this.xpT.textContent = `${xp.xp} / ${xp.need} XP`;
    const sb = Math.round(STREAK_BONUS * Math.min(p.streak, STREAK_MAX) * 100);
    this.streakEl.textContent = p.streak > 0 ? `Streak x${p.streak}  +${sb}% pay` : '';
    this.streakEl.classList.toggle('hidden', p.streak === 0);
    this.dotEl.classList.toggle('hidden', !this.hasClaimable());
    this.updateMission();
    this.updateVehiclePanel();
    this.updatePrompt();
    this.updateEdgeArrow();
    this.updateHint();
    this.updateEventBanner();
    if (this.frame % 3 === 0) this.map.drawMinimap(this.mmCanvas, g.settings.minimapRotate);
    if (this.frame % 15 === 0) {
      const fp = g.player.vehicle ? g.player.vehicle : g.player.pos;
      const d = districtAt(fp.x, fp.z);
      this.districtEl.textContent = d ? DISTRICTS[d].name : 'Outskirts';
      this.districtEl.style.color = d ? DISTRICTS[d].color : '#fff';
      const t = g.world.time;
      this.clockEl.textContent = `${String(Math.floor(t)).padStart(2, '0')}:${String(Math.floor((t % 1) * 60)).padStart(2, '0')}`;
      this.fpsEl.classList.toggle('hidden', !g.settings.showFps);
      if (g.settings.showFps) this.fpsEl.textContent = `${Math.round(g.fps)} FPS`;
    }
    // speed lines
    const v = g.player.vehicle;
    const sp = v ? Math.abs(v.vf) / Math.max(10, v.stats.top) : 0;
    const op = v && Math.abs(v.vf) > 12 ? clamp((sp - 0.55) / 0.4, 0, 1) * 0.55 : 0;
    this.speedCanvas.style.opacity = (this.menu ? 0 : op).toFixed(2);
    if (op > 0) this.speedCanvas.style.transform = `scale(${1 + Math.sin(performance.now() / 60) * 0.01})`;
    this.updateWorldUi(dt);
    if (this.menu && this.menu.tick) this.menu.tick(dt);
  }

  updateMission() {
    const g = this.g, j = g.jobs, a = j.active;
    if (j.trial) {
      this.missionEl.classList.add('hidden');
      const tr = j.trial;
      this.trialEl.classList.remove('hidden');
      const nextMedal = tr.medals.find(m => tr.time <= m);
      this.trialEl.innerHTML = `<div class="tag" style="background:#e5383b">TIME TRIAL</div> <b>${esc(tr.def.name)}</b>
        <div class="big">${tr.countdown > 0 ? '-' + Math.ceil(tr.countdown) : fmtTime(tr.time).replace(/^0:/, '0:')}.${String(Math.floor((tr.time % 1) * 10))}</div>
        <div>Checkpoint ${Math.min(tr.index, tr.pts.length - 1)} / ${tr.pts.length - 1} &middot; ${fmtDist(g.routeLen || 0)}</div>
        <div style="font-size:13px;color:var(--muted)">Gold ${fmtTime(tr.medals[0])} &middot; Silver ${fmtTime(tr.medals[1])} &middot; Bronze ${fmtTime(tr.medals[2])}${nextMedal ? '' : ' &middot; no medal'}</div>`;
      return;
    }
    this.trialEl.classList.add('hidden');
    if (!a) {
      if (j.waypoint) {
        this.missionEl.classList.remove('hidden');
        this.missionEl.innerHTML = `<div class="row"><span class="tag" style="background:#e94f9a">Waypoint</span><div class="mission-title">Marked location</div></div>
          <div class="mission-step">Follow the arrow <span class="mission-dist">${fmtDist(g.routeLen || 0)}</span></div>`;
      } else this.missionEl.classList.add('hidden');
      return;
    }
    const job = a.job, t = JOB_TYPES[job.type], r = RARITY_BY_ID[job.rarity];
    const target = a.state === 'pickup' ? a.pickupB : a.dropBs[a.dropIndex];
    const total = a.dropBs.length + 1, done = a.state === 'pickup' ? 0 : 1 + a.dropIndex;
    const low = a.timeLeft < 20 && !a.late;
    this.missionEl.classList.remove('hidden');
    this.missionEl.innerHTML = `
      <div class="row">
        <span class="tag" style="background:${job.event ? '#e8b923' : t.color}">${job.event ? 'Golden Drop' : job.special ? 'Special' : t.name}</span>
        <span class="tag" style="background:${r.color}">${r.name}</span>
        <div class="mission-title">${esc(job.name)}${job.units > 1 ? ' x' + job.units : ''}</div>
        <div class="mission-timer ${low ? 'low' : ''}" style="${a.late ? 'color:var(--red)' : ''}">${a.late ? 'LATE' : fmtTime(a.timeLeft)}</div>
      </div>
      <div class="mission-step">${a.state === 'pickup' ? 'Collect at' : (a.dropBs.length > 1 ? `Deliver (${a.dropIndex + 1}/${a.dropBs.length}) to` : 'Deliver to')} <b>${esc(target.name)}</b>
        <span class="mission-dist">${fmtDist(g.routeLen || 0)}</span></div>
      <div class="steps">${Array.from({ length: total }, (_, i) => `<i class="${i < done ? 'done' : i === done ? 'now' : ''}"></i>`).join('')}</div>
      ${job.fragile ? `<div class="health"><div class="fill" style="width:${a.health}%"></div></div>` : ''}`;
  }

  updateVehiclePanel() {
    const g = this.g, v = g.player.vehicle;
    const c = g.cargo && g.cargo.units > 0 ? g.cargo : null;
    const cap = g.currentCapacity();
    const key = v ? v.def.id + Math.round(Math.abs(v.vf) * 3.6) + (c ? c.units : 0) + cap + v.gear : 'foot' + (c ? c.units : 0) + cap + (g.vehicle ? g.vehicle.def.id : '') + Math.round(Math.hypot(g.player.vel.x, g.player.vel.z) * 3.6);
    if (key === this.vehKey) return;
    this.vehKey = key;
    const slots = Math.min(cap, 40);
    const color = c ? c.color : '#b07a45';
    const slotHtml = Array.from({ length: slots }, (_, i) => `<i class="${c && i < c.units ? 'full' : ''}" style="--c:${color}"></i>`).join('');
    if (v) {
      const kmh = Math.round(Math.abs(v.vf) * 3.6);
      const motor = v.def.kind === 'motor' || v.def.kind === 'van' || v.def.kind === 'truck';
      this.vehEl.innerHTML = `<div class="speed">${kmh}<small>KM/H${motor && v.def.id !== 'moped' ? ' &middot; G' + (v.vf < -0.3 ? 'R' : v.gear) : ''}</small></div>
        <div><div class="vp-name">${esc(v.def.name)}</div><div class="vp-sub">Cargo ${c ? c.units : 0} / ${cap}</div><div class="cargo-slots">${slotHtml}</div></div>`;
    } else {
      const kmh = Math.round(Math.hypot(g.player.vel.x, g.player.vel.z) * 3.6);
      this.vehEl.innerHTML = `<div class="speed">${kmh}<small>KM/H</small></div>
        <div><div class="vp-name">On Foot</div><div class="vp-sub">${g.vehicle ? `[V] call ${esc(g.vehicle.def.name)}` : 'Hold Shift to sprint'}</div><div class="cargo-slots">${slotHtml}</div></div>`;
    }
  }

  updatePrompt() {
    const it = this.g.interactables();
    const key = it ? it.text + (it.action ? 1 : 0) : '';
    if (key === this.promptKey) return;
    this.promptKey = key;
    if (!it) { this.promptEl.classList.add('hidden'); return; }
    this.promptEl.classList.remove('hidden');
    this.promptEl.classList.toggle('warn', !!it.warn);
    this.promptEl.innerHTML = it.action ? `<span class="kbd">E</span>${esc(it.text)}` : esc(it.text);
  }

  // arrow at the screen edge pointing to the target when its marker is off screen
  updateEdgeArrow() {
    const t = this.g.navTarget;
    if (!t) { this.edgeEl.classList.add('hidden'); return; }
    const cam = this.g.camera;
    this.v3.set(t.x, 3, t.z).applyMatrix4(cam.matrixWorldInverse);
    const behind = this.v3.z > 0;
    this.v3.applyMatrix4(cam.projectionMatrix);
    let x = this.v3.x, y = this.v3.y;
    if (behind) { x = -x; y = -y; }
    const onScreen = !behind && Math.abs(x) < 0.92 && Math.abs(y) < 0.88;
    if (onScreen) { this.edgeEl.classList.add('hidden'); return; }
    const ang = Math.atan2(x, y);
    const k = 0.86 / Math.max(Math.abs(Math.sin(ang)) / 0.9, Math.abs(Math.cos(ang)) / 0.8);
    const sx = (Math.sin(ang) * k * 0.5 + 0.5) * innerWidth, sy = (-Math.cos(ang) * k * 0.5 + 0.5) * innerHeight;
    this.edgeEl.classList.remove('hidden');
    this.edgeEl.style.left = sx + 'px';
    this.edgeEl.style.top = sy + 'px';
    this.edgeEl.querySelector('svg').style.transform = `rotate(${ang}rad)`;
    this.edgeEl.style.color = t.kind === 'pickup' ? '#4ea3ff' : t.kind === 'deliver' ? '#3ddc84' : t.kind === 'trial' ? '#ff5d5d' : '#ff70b8';
    this.edgeEl.querySelector('span').textContent = fmtDist(this.g.routeLen || 0);
  }

  updateEventBanner() {
    const e = this.g.jobs.event;
    if (!e || e.taken) { this.eventEl.classList.add('hidden'); return; }
    this.eventEl.classList.remove('hidden');
    const fp = this.g.player.vehicle || this.g.player.pos;
    const d = Math.hypot(e.building.door.x - fp.x, e.building.door.z - fp.z);
    this.eventEl.innerHTML = `GOLDEN DROP<div class="t">${fmtTime(e.timeLeft)}</div><div style="font-size:13px">${fmtDist(d)} away &middot; ${fmtMoney(e.job.reward)}</div>`;
  }

  // ---------------------------------------------------------------- tutorial hints
  updateHint() {
    const t = this.g.profile.tutorial;
    if (t.done || this.menu) { this.hintEl.classList.add('hidden'); return; }
    const texts = [
      'Welcome, courier! Walk with WASD to the orange Job Board icon across the street and press E (or press J for Missions).',
      'Pick any job and press Accept. Your first jobs can be done on foot.',
      'Follow the floating arrow to the BLUE marker and press E to collect the parcel.',
      'Now take it to the GREEN marker and press E to deliver. Press M to see the whole map.',
      'Great job! Keep delivering. With $500 you can buy a Bicycle at Wheelhouse Motors next to the garage (or press B).',
      'Press V any time to call your vehicle, then E to ride it. W/S drive, A/D steer, Space handbrake.',
    ];
    if (t.step >= texts.length) { t.done = true; return; }
    this.hintEl.classList.remove('hidden');
    this.hintEl.textContent = texts[t.step];
  }
  tutorialEvent(ev) {
    const t = this.g.profile.tutorial;
    if (t.done) return;
    const advance = { 0: ['board', 'accepted'], 1: ['accepted'], 2: ['pickup'], 3: ['complete'], 4: ['bought'], 5: ['ride'] }[t.step] || [];
    if (advance.includes(ev)) {
      t.step = ev === 'accepted' ? 2 : t.step + 1;
      if (t.step === 6) t.done = true;
      this.g.saveSoon();
    }
  }

  // ---------------------------------------------------------------- world-anchored UI
  project(x, y, z) {
    this.v3.set(x, y, z).project(this.g.camera);
    if (this.v3.z > 1) return null;
    return { x: (this.v3.x * 0.5 + 0.5) * innerWidth, y: (-this.v3.y * 0.5 + 0.5) * innerHeight };
  }
  popupAtPlayer(text, cls) {
    const g = this.g, v = g.player.vehicle;
    const p = v ? { x: v.x, y: v.y + v.M.top + 1, z: v.z } : { x: g.player.pos.x, y: g.player.pos.y + 2.4, z: g.player.pos.z };
    const el = document.createElement('div');
    el.className = 'popup ' + (cls || '');
    el.textContent = text;
    this.worldUi.appendChild(el);
    this.popups.push({ el, x: p.x, y: p.y, z: p.z, t: 0 });
  }
  bubble(s) {
    const el = document.createElement('div');
    el.className = 'bubble';
    el.textContent = s.text;
    this.worldUi.appendChild(el);
    this.bubbles.push({ el, x: s.x, y: s.y, z: s.z, t: 0 });
  }
  updateWorldUi(dt) {
    for (const list of [this.popups, this.bubbles]) {
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.t += dt;
        const life = list === this.popups ? 1.8 : 2.2;
        if (p.t > life || this.menu) { p.el.remove(); list.splice(i, 1); continue; }
        const s = this.project(p.x, p.y, p.z);
        if (!s) { p.el.style.display = 'none'; continue; }
        p.el.style.display = '';
        p.el.style.left = s.x + 'px';
        p.el.style.top = s.y + 'px';
      }
    }
  }
  drawSpeedLines() {
    const c = this.speedCanvas;
    const draw = () => {
      c.width = innerWidth; c.height = innerHeight;
      const x = c.getContext('2d');
      const cx = c.width / 2, cy = c.height * 0.45;
      x.strokeStyle = 'rgba(255,255,255,0.55)';
      for (let i = 0; i < 90; i++) {
        const a = Math.random() * Math.PI * 2;
        const r0 = Math.max(c.width, c.height) * (0.32 + Math.random() * 0.12);
        const r1 = r0 + 80 + Math.random() * 200;
        x.lineWidth = 1 + Math.random() * 2.5;
        x.beginPath(); x.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); x.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); x.stroke();
      }
    };
    draw();
    addEventListener('resize', draw);
  }

  // ---------------------------------------------------------------- toasts / effects
  toast(text, kind = 'info', title = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.innerHTML = (title ? `<div class="t">${esc(title)}</div>` : '') + esc(text);
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 5) this.toasts.firstChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 350); }, kind === 'warn' ? 3500 : 4500);
    if (kind === 'warn' && this.g.audio) this.g.audio.error();
  }
  countdown(text) {
    const el = document.createElement('div');
    el.className = 'countdown';
    el.textContent = text;
    this.hud.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }
  levelUp(e) {
    const el = document.createElement('div');
    el.className = 'levelup';
    el.innerHTML = `<div class="box"><div class="ring">${e.level}</div><h1>LEVEL UP!</h1><div class="rw">+${fmtMoney(e.reward)} bonus</div>
      ${e.unlocks.length ? `<div class="ul">${e.unlocks.map(u => `<span>${esc(u.kind)}: ${esc(u.name)}</span>`).join('')}</div>` : ''}</div>`;
    document.body.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 450); }, 3200);
  }
  summary(e) {
    if (this.summaryEl) this.summaryEl.remove();
    const el = document.createElement('div');
    el.className = 'summary';
    const r = RARITY_BY_ID[e.job.rarity];
    el.innerHTML = `<h3>Delivered!</h3><div style="color:var(--muted);margin-bottom:6px">${esc(e.job.name)} &middot; <span style="color:${r.color}">${r.name}</span></div>
      ${e.parts.map(p => `<div class="ln ${p.value < 0 ? 'neg' : ''}"><span>${esc(p.label)}</span><span>${p.value < 0 ? '-' : '+'}${fmtMoney(Math.abs(p.value))}</span></div>`).join('')}
      <div class="tot"><span>Total</span><span style="color:var(--green)">${fmtMoney(e.pay)}</span></div>
      <div class="ln"><span>XP</span><span style="color:#8fd0ff">+${e.xp}</span></div>`;
    document.body.appendChild(el);
    this.summaryEl = el;
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 450); }, 4200);
  }
  hasClaimable() {
    const pr = this.g.progress;
    if (this.frame % 30 !== 0 && this._claim !== undefined) return this._claim;
    this._claim = pr.canClaimLogin() || pr.dailyList().some(m => m.progress >= m.goal && !m.claimed);
    return this._claim;
  }

  // ---------------------------------------------------------------- menu framework
  onKey(e) {
    if (this.g.state !== 'playing') {
      if (e.code === 'Escape' && this.menu) this.close();
      return;
    }
    const k = e.code;
    if (k === 'Escape') {
      e.preventDefault();
      if (this.confirmEl) { this.confirmEl.remove(); this.confirmEl = null; return; }
      if (this.menu) this.close(); else this.openPause();
      return;
    }
    if (e.target && e.target.tagName === 'INPUT') return;
    const map = { KeyM: 'map', KeyJ: 'missions', KeyG: 'garage', KeyB: 'shop' };
    if (map[k]) {
      if (this.menu && this.menu.name === map[k]) this.close();
      else if (!this.menu || this.menu.name !== 'pause') { this.close(true); this.openByName(map[k]); }
    }
  }
  show(name, html, opts = {}) {
    this.close(true);
    const el = document.createElement('div');
    el.innerHTML = html;
    const root = el.firstElementChild;
    this.menus.appendChild(root);
    this.menu = { name, el: root, ...opts };
    this.hud.style.visibility = 'hidden';
    this.g.menuOpen = true;
    this.g.expectUnlock = true;
    this.g.input.unlock();
    this.g.input.enabled = false;
    this.g.audio && this.g.audio.uiOpen();
    this.g.audio && this.g.audio.setPaused(true);
    root.addEventListener('click', ev => {
      const t = ev.target.closest('[data-act]');
      if (ev.target.classList.contains('backdrop') && opts.closeOnBackdrop !== false) { this.close(); return; }
      if (!t || !root.contains(t)) return;
      ev.preventDefault();
      if (t.classList.contains('disabled')) { this.g.audio.error(); return; }
      this.g.audio.uiClick();
      this.handle(t.dataset.act, t.dataset, t);
    });
    return root;
  }
  close(silent = false) {
    if (!this.menu) return;
    const m = this.menu;
    if (m.onClose) m.onClose();
    m.el.remove();
    this.menu = null;
    this.hud.style.visibility = '';
    this.g.preview && this.g.preview.clear();
    if (!silent) this.g.audio && this.g.audio.uiClose();
    if (this.g.state === 'playing') {
      this.g.menuOpen = false;
      this.g.input.enabled = true;
      this.g.audio && this.g.audio.setPaused(false);
    }
  }
  refreshMenu() { if (this.menu && this.menu.render) this.menu.render(); }
  previewRect() {
    if (!this.menu || !this.menu.previewEl) return null;
    const r = this.menu.previewEl.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }
  result(r, okText) {
    if (r && r.ok) { if (okText) this.toast(okText, 'good'); }
    else if (r) this.toast(r.error || 'Not possible', 'warn');
    this.refreshMenu();
    return r && r.ok;
  }
  head(title, icon, color) {
    return `<div class="modal-head"><div class="icon" style="background:${color}">${SVG[icon] || ''}</div><h2>${title}</h2>
      <div class="money-line"><span class="coin" style="width:22px;height:22px;border-radius:50%;background:#e8b923;display:inline-grid;place-items:center;color:#6b4a00;font-size:13px">$</span><span class="m-amt">${fmtMoney(this.g.profile.money)}</span></div>
      <button class="close" data-act="close">&times;</button></div>`;
  }

  // shared action handler
  handle(act, d) {
    const g = this.g, eco = g.eco;
    switch (act) {
      case 'close': return this.close();
      // jobs
      case 'accept': { const r = g.jobs.accept(+d.id); if (this.result(r)) this.close(); return; }
      case 'cancel-job': return this.confirm('Cancel the current job? Your streak will reset.', () => { g.jobs.cancel(); this.refreshMenu(); });
      case 'district-tab': this.menu.district = d.id; return this.refreshMenu();
      case 'mtab': this.menu.tab = d.id; return this.refreshMenu();
      case 'claim-daily': { const r = g.progress.claimDaily(+d.i); if (this.result(r, r.ok ? `Claimed ${fmtMoney(r.money)} and ${r.xp} XP` : '')) g.audio.coin(4); return; }
      case 'claim-login': { const r = g.progress.claimLogin(); if (this.result(r, r.ok ? `Daily reward: ${fmtMoney(r.money)} (day ${r.day})` : '')) g.audio.coin(5); return; }
      case 'special': { const r = g.jobs.startSpecial(d.id); if (this.result(r, 'Special mission started!')) this.close(); return; }
      case 'trial-way': { const t = TIME_TRIALS.find(x => x.id === d.id); g.jobs.setWaypoint(gx(t.nodes[0][0]), gx(t.nodes[0][1])); this.toast('Waypoint set to the start flag.', 'good'); return this.close(); }
      case 'cancel-trial': g.jobs.cancelTrial(); return this.refreshMenu();
      // garage
      case 'gsel': this.menu.sel = d.id; return this.refreshMenu();
      case 'gtab': this.menu.gtab = d.id; return this.refreshMenu();
      case 'equip': {
        const r = eco.equipVehicle(d.id);
        if (this.result(r, d.id === 'walk' ? 'You are on foot now.' : `${VEHICLE_BY_ID[d.id].name} equipped and waiting next to you.`)) {
          g.spawnVehicle(d.id);
          g.saveSoon();
        }
        return;
      }
      case 'upgrade': {
        const r = eco.buyUpgrade(d.id, d.stat);
        if (this.result(r, `${UPGRADE_STATS.find(s => s.id === d.stat).name} upgraded!`)) this.afterCustomize(d.id);
        return;
      }
      case 'paint': { if (this.result(eco.buyOrApplyPaint(d.id, d.p))) this.afterCustomize(d.id); return; }
      case 'wheels': { if (this.result(eco.buyOrApplyWheels(d.id, d.w))) this.afterCustomize(d.id); return; }
      case 'acc': { if (this.result(eco.toggleAccessory(d.id, d.a))) this.afterCustomize(d.id); return; }
      // shop
      case 'stab': this.menu.tab = d.id; return this.refreshMenu();
      case 'dsel': this.menu.sel = d.id; return this.refreshMenu();
      case 'buy-vehicle': {
        const r = eco.buyVehicle(d.id);
        if (this.result(r, `You bought the ${VEHICLE_BY_ID[d.id].name}!`)) {
          eco.equipVehicle(d.id);
          g.spawnVehicle(d.id);
          this.toast('It is parked next to you. Press E to ride it.', 'good');
          g.saveSoon();
        }
        return;
      }
      case 'cosmetic': { this.result(g.eco.buyCosmetic(d.id)); return this.refreshMenu(); }
      case 'color': { this.result(g.eco.buyColor(d.kind, d.c)); return this.refreshMenu(); }
      case 'equipment': { if (this.result(eco.buyEquipment(d.id), `${EQUIPMENT.find(e => e.id === d.id).name} bought!`)) g.applyEquipment(); return; }
      case 'garage-up': { this.result(eco.buyGarageUpgrade(d.id), `${GARAGE_UPGRADES.find(e => e.id === d.id).name} built!`); return; }
      case 'district': { this.result(eco.unlockDistrict(d.id)); return; }
      // map
      case 'clear-way': g.jobs.setWaypoint(null); return this.refreshMenu();
      case 'map-accept': { const r = g.jobs.accept(+d.id); if (this.result(r)) this.close(); return; }
      // settings / pause
      case 'resume': return this.close();
      case 'open-settings': return this.openSettings();
      case 'open-controls': return this.openControls();
      case 'save-now': g.saveNow().then(ok => this.toast(ok === false ? 'Could not save (storage blocked).' : 'Game saved.', ok === false ? 'warn' : 'good')); return;
      case 'quit-title': g.saveNow().then(() => location.reload()); return;
      case 'reset': return this.confirm('Delete ALL progress and start again? This cannot be undone.', () => g.resetProgress());
      case 'set-toggle': { g.settings[d.key] = !g.settings[d.key]; g.applySettings(); g.saveSettings(); return this.refreshMenu(); }
      case 'confirm-yes': return;
      default: return;
    }
  }
  afterCustomize(id) {
    const g = this.g;
    if (g.vehicle && g.vehicle.def.id === id) g.vehicle.setCustom(g.eco.custom(id));
    g.preview.showVehicle(VEHICLE_BY_ID[id], g.eco.custom(id));
    g.saveSoon();
  }

  confirm(text, onYes) {
    if (this.confirmEl) this.confirmEl.remove();
    const el = document.createElement('div');
    el.className = 'backdrop';
    el.style.zIndex = 35;
    el.style.position = 'fixed';
    el.innerHTML = `<div class="modal narrow"><div class="modal-head"><h2>Are you sure?</h2></div>
      <div class="modal-body"><div class="confirm-text">${esc(text)}</div>
      <div class="btn-row"><button class="btn gray" data-c="no">No</button><button class="btn red" data-c="yes">Yes</button></div></div></div>`;
    document.body.appendChild(el);
    this.confirmEl = el;
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-c]');
      if (!b && e.target !== el) return;
      el.remove();
      this.confirmEl = null;
      if (b && b.dataset.c === 'yes') onYes();
    });
  }

  // ---------------------------------------------------------------- MAP
  openMap() {
    const g = this.g;
    const root = this.show('map', `<div class="map-wrap">
      <div class="stage-head"><div class="icon" style="background:linear-gradient(160deg,#36c47a,#1f8e54);width:44px;height:44px;border-radius:14px;display:grid;place-items:center">${SVG.map}</div>
        <h2>City Map</h2><span style="color:var(--muted)">Click to set a waypoint &middot; right-click to clear &middot; drag to pan &middot; scroll to zoom</span>
        <button class="close" data-act="close">&times;</button></div>
      <div class="map-body"><div class="map-canvas-box"><canvas id="bigmap"></canvas><div class="map-tip hidden" id="map-tip"></div></div>
        <div class="stage-panel" id="map-side"></div></div></div>`, { closeOnBackdrop: false });
    const canvas = root.querySelector('#bigmap');
    const tip = root.querySelector('#map-tip');
    const fp = g.player.vehicle || g.player.pos;
    const view = { cx: fp.x, cz: fp.z, zoom: 0.9 };
    const m = this.menu;
    m.view = view;
    let drag = null, moved = false, hover = null;
    const resize = () => { const r = canvas.getBoundingClientRect(); canvas.width = r.width; canvas.height = r.height; };
    resize();
    const jobsList = () => g.jobs.active ? [] : g.jobs.allJobs();
    const jobAt = (mx, my) => {
      let best = null, bd = 14;
      for (const j of jobsList()) {
        const b = g.layout.buildings[j.pickup];
        const sx = canvas.width / 2 + (b.door.x - view.cx) * view.zoom, sy = canvas.height / 2 + (b.door.z - view.cz) * view.zoom;
        const d = Math.hypot(sx - mx, sy - my);
        if (d < bd) { bd = d; best = j; }
      }
      return best;
    };
    canvas.addEventListener('mousedown', e => { drag = { x: e.clientX, y: e.clientY, cx: view.cx, cz: view.cz }; moved = false; });
    canvas.addEventListener('mousemove', e => {
      const r = canvas.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
        view.cx = clamp(drag.cx - dx / view.zoom, -640, 640); view.cz = clamp(drag.cz - dy / view.zoom, -640, 640);
      }
      hover = jobAt(mx, my);
      if (hover) {
        const r2 = RARITY_BY_ID[hover.rarity];
        tip.classList.remove('hidden');
        tip.style.left = mx + 'px'; tip.style.top = my + 'px';
        tip.innerHTML = `<b>${esc(hover.name)}</b> &middot; <span style="color:${r2.color}">${r2.name}</span> &middot; <span style="color:var(--green)">${fmtMoney(hover.reward)}</span><br>${JOB_TYPES[hover.type].name} &middot; ${fmtDist(hover.distance)} &middot; click for details`;
      } else tip.classList.add('hidden');
    });
    addEventListener('mouseup', m.up = e => {
      if (!drag) return;
      const was = moved;
      drag = null;
      if (was || e.button !== 0 || e.target !== canvas) return;
      const r = canvas.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const j = jobAt(mx, my);
      if (j) { m.selJob = j.id; this.audio('uiClick'); renderSide(); return; }
      const w = this.map.screenToWorld(view, canvas, mx, my);
      g.jobs.setWaypoint(w.x, w.z);
      this.audio('uiClick');
      renderSide();
    });
    canvas.addEventListener('contextmenu', e => { e.preventDefault(); g.jobs.setWaypoint(null); renderSide(); });
    canvas.addEventListener('wheel', e => { e.preventDefault(); view.zoom = clamp(view.zoom * (e.deltaY > 0 ? 0.85 : 1.18), 0.35, 4); }, { passive: false });
    addEventListener('resize', m.rs = resize);
    m.onClose = () => { removeEventListener('mouseup', m.up); removeEventListener('resize', m.rs); };
    const side = root.querySelector('#map-side');
    const renderSide = () => {
      const a = g.jobs.active;
      const sel = m.selJob ? g.jobs.findJob(m.selJob) : null;
      const leg = (icon, text) => `<canvas width="22" height="22" data-icon="${icon}"></canvas><span>${text}</span>`;
      side.innerHTML = `
        ${a ? `<div class="section-title">Current job</div><div class="note"><b>${esc(a.job.name)}</b><br>${a.state === 'pickup' ? 'Collect at ' + esc(a.pickupB.name) : 'Deliver to ' + esc(a.dropBs[a.dropIndex].name)}<br>${fmtTime(a.timeLeft)} left &middot; ${fmtMoney(a.job.reward)}</div>` : ''}
        ${sel ? this.jobCard(sel, 'map-accept') : (!a ? '<div class="note">Blue box icons are open jobs. Click one to see it, or click anywhere to set a waypoint.</div>' : '')}
        ${g.jobs.waypoint ? '<button class="btn small gray" data-act="clear-way" style="width:100%;margin-bottom:10px">Clear waypoint</button>' : ''}
        <div class="section-title">Legend</div>
        <div class="legend">${leg('pickup', 'Pickup / open job')}${leg('drop', 'Delivery')}${leg('job', 'Job board')}${leg('garage', 'Rush HQ Garage')}${leg('dealer', 'Wheelhouse Motors')}${leg('trial', 'Time trial checkpoint')}${leg('event', 'Golden Drop event')}${leg('waypoint', 'Your waypoint')}</div>
        <div class="section-title" style="margin-top:14px">Districts</div>
        ${DISTRICT_ORDER.map(id => { const d = DISTRICTS[id]; const on = g.eco.isUnlocked(id); return `<div class="list-row" style="padding:8px 10px"><span style="width:14px;height:14px;border-radius:4px;background:${d.color}"></span><span class="grow"><b>${d.name}</b> <span style="color:var(--muted);font-size:13px">x${d.mult} pay</span></span>${on ? '<span class="tag" style="background:#2fbf71">Open</span>' : `<span class="tag" style="background:#e5383b">Lv ${d.level}</span>`}</div>`; }).join('')}`;
      side.querySelectorAll('canvas[data-icon]').forEach(c => { const src = this.iconCanvas(c.dataset.icon); if (src) c.getContext('2d').drawImage(src, 0, 0, 22, 22); });
    };
    m.render = renderSide;
    renderSide();
    m.tick = () => { this.map.drawFull(canvas, view, hover, jobsList()); };
  }
  iconCanvas(name) { return (TEX.icons && TEX.icons[name + '_canvas']) || null; }
  audio(fn) { this.g.audio && this.g.audio[fn] && this.g.audio[fn](); }

  // ---------------------------------------------------------------- MISSIONS
  jobCard(j, act = 'accept') {
    const g = this.g;
    const t = JOB_TYPES[j.type], r = RARITY_BY_ID[j.rarity];
    const dsc = g.jobs.describe(j);
    const req = VEHICLE_BY_ID[j.required];
    const cap = g.currentCapacity();
    const best = g.jobs.bestOwned();
    let warn = '';
    if (j.units > best.cap) warn = `Needs ${j.units} cargo space. Buy a ${req.name} or upgrade cargo.`;
    else if (j.units > cap) warn = `Needs ${j.units} cargo space. Use a bigger vehicle from your garage.`;
    return `<div class="job">
      <div>
        <div class="top"><span class="name">${esc(j.name)}${j.units > 1 ? ' x' + j.units : ''}</span>
          <span class="tag" style="background:${t.color}">${t.name}</span><span class="tag" style="background:${r.color}">${r.name}</span></div>
        <div class="route">${esc(dsc.pickup)} <span style="color:var(--muted)">(${dsc.districtFrom})</span> &rarr; ${esc(dsc.drop)} <span style="color:var(--muted)">(${dsc.districtTo})</span></div>
        <div class="meta"><span>Distance <b>${dsc.dist}</b></span><span>Time <b>${fmtTime(j.time)}</b></span><span>Parcels <b>${j.units}</b></span><span>Vehicle <b>${req.id === 'walk' ? 'Any' : req.name + '+'}</b></span></div>
        ${warn ? `<div class="warnline">${esc(warn)}</div>` : ''}
      </div>
      <div class="pay"><div class="m">${fmtMoney(j.reward)}</div><div class="x">+${j.xp} XP</div>
        <button class="btn small green ${g.jobs.active || g.jobs.trial ? 'disabled' : ''}" data-act="${act}" data-id="${j.id}">Accept</button></div></div>`;
  }

  openMissions(tab = 'jobs', district = null) {
    const g = this.g;
    if (district) this.tutorialEvent('board');
    const root = this.show('missions', `<div class="backdrop"><div class="modal">${this.head('Missions', 'missions', 'linear-gradient(160deg,#ffa043,#e9661b)')}
      <div class="tabs" id="m-tabs"></div><div class="modal-body" id="m-body"></div></div></div>`);
    const m = this.menu;
    m.tab = tab;
    m.district = district || (g.eco.isUnlocked(districtAt(g.player.pos.x, g.player.pos.z) || 'downtown') ? (districtAt(g.player.pos.x, g.player.pos.z) || 'downtown') : 'downtown');
    const body = root.querySelector('#m-body'), tabs = root.querySelector('#m-tabs');
    m.render = () => {
      root.querySelector('.m-amt').textContent = fmtMoney(g.profile.money);
      const claim = g.progress.canClaimLogin() || g.progress.dailyList().some(x => x.progress >= x.goal && !x.claimed);
      tabs.innerHTML = [['jobs', 'Jobs'], ['daily', 'Daily' + (claim ? ' (!)' : '')], ['special', 'Special'], ['trials', 'Time Trials'], ['ach', 'Achievements']]
        .map(([id, n]) => `<button class="tab ${m.tab === id ? 'on' : ''}" data-act="mtab" data-id="${id}">${n}</button>`).join('');
      body.innerHTML = this['mission_' + m.tab]();
    };
    m.tick = () => {
      if (m.tab === 'jobs' && this.frame % 30 === 0) {
        const b = g.jobs.boards[m.district];
        const el = body.querySelector('#refresh-t');
        if (b && el) el.textContent = fmtTime(Math.max(0, b.refreshAt - g.clock));
        if (b && g.clock >= b.refreshAt) m.render();
      }
    };
    m.render();
  }
  mission_jobs() {
    const g = this.g, m = this.menu;
    const a = g.jobs.active;
    let html = '';
    if (a) {
      html += `<div class="section-title">Current job</div><div class="list-row"><div class="grow"><b>${esc(a.job.name)}</b> &middot; ${a.state === 'pickup' ? 'collect at ' + esc(a.pickupB.name) : 'deliver to ' + esc(a.dropBs[a.dropIndex].name)} &middot; ${fmtTime(a.timeLeft)} left</div>
        <button class="btn small red" data-act="cancel-job">Cancel job</button></div>`;
    }
    if (g.jobs.trial) html += `<div class="list-row"><div class="grow">Time trial running: <b>${esc(g.jobs.trial.def.name)}</b></div><button class="btn small red" data-act="cancel-trial">Stop trial</button></div>`;
    html += `<div class="section-title">Job boards ${DISTRICT_ORDER.map(id => {
      const on = g.eco.isUnlocked(id), d = DISTRICTS[id];
      return `<button class="btn small ${m.district === id ? '' : 'gray'} ${on ? '' : 'disabled'}" data-act="district-tab" data-id="${id}" style="${m.district === id ? `--c:${d.color};--c2:rgba(0,0,0,0.35)` : ''}">${d.name}${on ? '' : ' (locked)'}</button>`;
    }).join(' ')}</div>`;
    if (!g.eco.isUnlocked(m.district)) return html + `<div class="empty">${DISTRICTS[m.district].name} is locked. Unlock it in Shop &gt; Districts.</div>`;
    const b = g.jobs.refreshBoard(m.district);
    html += `<div class="note">${esc(DISTRICTS[m.district].name)} pays x${DISTRICTS[m.district].mult}. New jobs in <b id="refresh-t">${fmtTime(Math.max(0, b.refreshAt - g.clock))}</b>. You can accept jobs from anywhere.</div>`;
    html += b.jobs.length ? b.jobs.map(j => this.jobCard(j)).join('') : '<div class="empty">No jobs right now. Check back soon!</div>';
    return html;
  }
  mission_daily() {
    const pr = this.g.progress;
    const can = pr.canClaimLogin();
    let html = `<div class="section-title">Daily login reward</div><div class="list-row ${can ? '' : 'done'}"><div class="grow"><b>Day ${this.g.profile.login.streak}</b> streak &middot; come back every day for bigger rewards (day 7 pays 4x)</div>
      <span class="price" style="color:var(--green);font-weight:700">${fmtMoney(pr.loginReward())}</span>
      <button class="btn small ${can ? 'gold' : 'gray disabled'}" data-act="claim-login">${can ? 'Claim' : 'Claimed'}</button></div>`;
    html += '<div class="section-title">Daily missions (new ones every day)</div>';
    for (const d of pr.dailyList()) {
      const done = d.progress >= d.goal;
      const shown = d.id === 'distance' ? `${(d.progress / 1000).toFixed(1)} / ${(d.goal / 1000).toFixed(1)} km` : d.id === 'earn' ? `${fmtShort(d.progress)} / ${fmtShort(d.goal)}` : `${Math.floor(d.progress)} / ${d.goal}`;
      html += `<div class="list-row ${d.claimed ? 'done' : ''}"><div class="grow"><b>${esc(d.text)}</b><div class="prog" style="margin-top:6px"><div class="fill" style="width:${(d.progress / d.goal * 100).toFixed(0)}%"></div></div>
        <div style="font-size:13px;color:var(--muted);margin-top:3px">${shown} &middot; reward ${fmtMoney(d.money)} + ${d.xp} XP</div></div>
        <button class="btn small ${d.claimed ? 'gray disabled' : done ? 'gold' : 'gray disabled'}" data-act="claim-daily" data-i="${d.index}">${d.claimed ? 'Claimed' : done ? 'Claim' : 'In progress'}</button></div>`;
    }
    return html;
  }
  mission_special() {
    const g = this.g;
    return '<div class="section-title">Special missions (one time, big rewards)</div>' + SPECIAL_MISSIONS.map(s => {
      const done = g.profile.specials[s.id];
      const lock = g.profile.level < s.level;
      const t = JOB_TYPES[s.type], r = RARITY_BY_ID[s.rarity];
      return `<div class="list-row ${done ? 'done' : ''}"><div class="grow"><b style="font-size:17px">${esc(s.name)}</b> <span class="tag" style="background:${t.color}">${t.name}</span> <span class="tag" style="background:${r.color}">${r.name}</span>
        <div style="color:var(--muted);font-size:14px;margin-top:3px">${esc(s.desc)}</div>
        <div style="font-size:13px;margin-top:3px">${s.units} parcel${s.units > 1 ? 's' : ''} &middot; ${fmtTime(s.time)} &middot; <span style="color:var(--green)">${fmtMoney(s.reward)}</span> + ${s.xp} XP</div></div>
        ${done ? '<span class="tag" style="background:#2fbf71">Done</span>' : lock ? `<span class="tag" style="background:#e5383b">Level ${s.level}</span>` : `<button class="btn small purple ${g.jobs.active || g.jobs.trial ? 'disabled' : ''}" data-act="special" data-id="${s.id}">Start</button>`}</div>`;
    }).join('');
  }
  mission_trials() {
    const g = this.g;
    return '<div class="section-title">Time trials &middot; drive to a red flag on the map and press E to start</div>' + TIME_TRIALS.map(t => {
      const rec = g.profile.trials[t.id];
      const lock = g.profile.level < t.level || !g.eco.isUnlocked(t.district);
      const medal = rec ? rec.medal : -1;
      return `<div class="list-row"><span class="medal ${medal >= 0 ? 'm' + medal : 'mn'}">${medal >= 0 ? ['G', 'S', 'B'][medal] : '-'}</span>
        <div class="grow"><b>${esc(t.name)}</b> <span style="color:var(--muted);font-size:13px">${DISTRICTS[t.district].name} &middot; ${t.nodes.length - 1} checkpoints</span>
        <div style="font-size:13px;margin-top:3px">Best ${rec && rec.best != null ? fmtTime(rec.best) : '--'} &middot; rewards gold ${fmtMoney(t.reward[0])} / silver ${fmtMoney(t.reward[1])} / bronze ${fmtMoney(t.reward[2])}</div></div>
        ${lock ? `<span class="tag" style="background:#e5383b">Lv ${t.level} + ${DISTRICTS[t.district].name}</span>` : `<button class="btn small blue" data-act="trial-way" data-id="${t.id}">Set waypoint</button>`}</div>`;
    }).join('');
  }
  mission_ach() {
    const list = this.g.progress.achievementList();
    const done = list.filter(a => a.done).length;
    return `<div class="section-title">Achievements ${done} / ${list.length}</div>` + list.map(a => `<div class="list-row ${a.done ? 'done' : ''}">
      <div class="grow"><b>${esc(a.name)}</b> <span style="color:var(--muted);font-size:14px">${esc(a.desc)}</span>
      <div class="prog" style="margin-top:6px"><div class="fill" style="width:${(a.progress / a.goal * 100).toFixed(0)}%"></div></div></div>
      <span style="color:var(--green);font-weight:700">${fmtMoney(a.reward)}</span>${a.done ? '<span class="tag" style="background:#2fbf71">Done</span>' : ''}</div>`).join('');
  }

  // ---------------------------------------------------------------- GARAGE
  openGarage(sel) {
    const g = this.g;
    const root = this.show('garage', `<div class="stage-menu">
      <div class="stage-head"><div class="icon" style="background:linear-gradient(160deg,#a46cf0,#6c3bc0);width:44px;height:44px;border-radius:14px;display:grid;place-items:center">${SVG.garage}</div>
        <h2>Rush HQ Garage</h2><div class="money-line"><span class="m-amt"></span></div><button class="close" data-act="close">&times;</button></div>
      <div class="stage-body"><div class="stage-panel vlist" id="g-list"></div><div class="preview-slot" id="g-prev"><div class="preview-label" id="g-label"></div></div><div class="stage-panel" id="g-side"></div></div></div>`, { closeOnBackdrop: false });
    const m = this.menu;
    m.sel = sel || (g.profile.equipped !== 'walk' ? g.profile.equipped : (Object.keys(g.profile.owned)[0] || 'walk'));
    m.gtab = 'upgrades';
    m.previewEl = root.querySelector('#g-prev');
    this.bindPreviewDrag(m.previewEl);
    let shown = null;
    m.render = () => {
      root.querySelector('.m-amt').textContent = fmtMoney(g.profile.money);
      const owned = ['walk', ...VEHICLES.filter(v => g.eco.owns(v.id) && v.id !== 'walk').map(v => v.id)];
      root.querySelector('#g-list').innerHTML = '<div class="section-title">Your vehicles</div>' + owned.map(id => {
        const v = VEHICLE_BY_ID[id];
        const c = g.eco.custom(id);
        const paint = PAINTS.find(p => p.id === c.paint);
        return `<button class="${m.sel === id ? 'on' : ''}" data-act="gsel" data-id="${id}"><span class="sw" style="background:${id === 'walk' ? g.profile.cosmetics.shirt : (paint && paint.color) || v.color}"></span>
          <span><div class="nm">${esc(v.name)}</div><div class="sub">${id === 'walk' ? 'Always available' : 'Capacity ' + g.eco.capacityOf(id)}</div></span>${g.profile.equipped === id ? '<span class="lk" style="color:var(--green)">Equipped</span>' : ''}</button>`;
      }).join('') + (owned.length === 1 ? '<div class="note">You have no vehicles yet. Buy one in the Shop (Wheelhouse Motors).</div>' : '');
      const id = m.sel, def = VEHICLE_BY_ID[id];
      const key = id + JSON.stringify(g.eco.custom(id));
      if (shown !== key) {
        shown = key;
        if (id === 'walk') g.preview.showCharacter({ shirt: g.profile.cosmetics.shirt, pants: g.profile.cosmetics.pantsColor }, g.profile.cosmetics.equipped);
        else g.preview.showVehicle(def, g.eco.custom(id));
      }
      root.querySelector('#g-label').innerHTML = `${esc(def.name)}<small>${id === 'walk' ? 'On foot' : def.kind === 'pedal' ? 'Pedal bike' : def.kind === 'electric' ? 'Electric' : def.kind === 'motor' ? 'Motorbike class' : def.kind === 'van' ? 'Van' : 'Truck'}</small>`;
      root.querySelector('#g-side').innerHTML = this.garageSide(id);
    };
    m.render();
  }
  bindPreviewDrag(el) {
    const pv = this.g.preview;
    let last = null;
    el.addEventListener('mousedown', e => { last = e.clientX; pv.dragging = true; pv.autoSpin = false; });
    addEventListener('mousemove', e => { if (last != null) { pv.drag(e.clientX - last); last = e.clientX; } });
    addEventListener('mouseup', () => { last = null; pv.dragging = false; });
    el.addEventListener('wheel', e => { e.preventDefault(); pv.zoom = clamp(pv.zoom * (e.deltaY > 0 ? 1.1 : 0.9), 0.6, 1.6); }, { passive: false });
  }
  statBars(def, up, compare = null) {
    if (def.id === 'walk') {
      const sp = 7.8 * this.g.player.speedMult;
      return `<div class="stat"><div class="lbl"><span>Sprint speed</span><span>${Math.round(sp * 3.6)} km/h</span></div><div class="bar"><div class="b" style="width:${sp / 30 * 100}%"></div></div></div>
        <div class="stat"><div class="lbl"><span>Capacity</span><span>${this.g.eco.capacityOf('walk')}</span></div><div class="bar"><div class="b" style="width:${this.g.eco.capacityOf('walk') / 60 * 100}%"></div></div></div>`;
    }
    const base = vehicleStats(def, {}), st = vehicleStats(def, up);
    const rows = [['Top speed', 'top', 32, v => Math.round(v * 3.6) + ' km/h'], ['Acceleration', 'accel', 10, v => v.toFixed(1)], ['Handling', 'handling', 1.6, v => (v * 100).toFixed(0)],
      ['Braking', 'brake', 18, v => v.toFixed(1)], ['Capacity', 'capacity', 66, v => Math.round(v)]];
    return rows.map(([n, k, max, f]) => {
      const bw = base[k] / max * 100, uw = (st[k] - base[k]) / max * 100;
      const cmp = compare ? ` <span style="color:${compare[k] > st[k] ? 'var(--red)' : compare[k] < st[k] ? 'var(--green)' : 'var(--muted)'};font-size:12px">${compare[k] === st[k] ? '' : (st[k] > compare[k] ? '+' : '') + f(st[k] - compare[k])}</span>` : '';
      return `<div class="stat"><div class="lbl"><span>${n}</span><span>${f(st[k])}${cmp}</span></div><div class="bar"><div class="b" style="width:${Math.min(100, bw)}%"></div><div class="u" style="left:${Math.min(100, bw)}%;width:${Math.min(100 - bw, uw)}%"></div></div></div>`;
    }).join('');
  }
  garageSide(id) {
    const g = this.g, m = this.menu, eco = g.eco, def = VEHICLE_BY_ID[id];
    const c = eco.custom(id);
    const equipped = g.profile.equipped === id;
    let html = `<button class="btn ${equipped ? 'gray disabled' : 'green'}" style="width:100%;margin-bottom:12px" data-act="equip" data-id="${id}">${equipped ? 'Equipped' : id === 'walk' ? 'Go on foot' : 'Equip and ride'}</button>`;
    if (id === 'walk') {
      return html + `<div class="section-title">Stats</div>${this.statBars(def, {})}<div class="note">Change your outfit in Shop &gt; Outfit. Equipment like Running Shoes and the Courier Bag makes walking better.</div>`;
    }
    const tabs = [['upgrades', 'Upgrades'], ['paint', 'Paint'], ['wheels', 'Wheels'], ['acc', 'Extras'], ['stats', 'Stats']];
    html += `<div class="inner-tabs">${tabs.map(([t, n]) => `<button class="${m.gtab === t ? 'on' : ''}" data-act="gtab" data-id="${t}">${n}</button>`).join('')}</div>`;
    if (m.gtab === 'stats') {
      const p = g.profile.stats;
      html += this.statBars(def, c.upgrades) + `<div class="note">Base price ${fmtMoney(def.price)} &middot; ${esc(def.desc)}</div><div class="note">Account totals: ${p.deliveries} deliveries &middot; ${fmtDist(p.distance)} travelled</div>`;
    } else if (m.gtab === 'upgrades') {
      const lab = g.profile.garage.tuninglab;
      html += (lab ? '' : `<div class="note lock">Levels 4 and 5 need the Tuning Lab (Shop &gt; Garage).</div>`);
      for (const s of UPGRADE_STATS) {
        const lvl = c.upgrades[s.id] || 0;
        const cost = lvl < UPGRADE_MAX ? upgradeCost(def, lvl) : null;
        const blocked = lvl >= UPGRADE_FREE_MAX && !lab;
        html += `<div class="up-row"><div class="row" style="display:flex;justify-content:space-between"><b>${s.name}</b><span style="color:var(--muted);font-size:13px">Level ${lvl}/${UPGRADE_MAX}</span></div>
          <div class="pips">${Array.from({ length: UPGRADE_MAX }, (_, i) => `<i class="${i < lvl ? 'on' : i >= UPGRADE_FREE_MAX && !lab ? 'lab' : ''}"></i>`).join('')}</div>
          <div style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:12px;color:var(--muted)">${s.desc}</span>
          ${cost == null ? '<span class="tag" style="background:#2fbf71">MAX</span>' : `<button class="btn small ${blocked || g.profile.money < cost ? 'gray disabled' : 'green'}" data-act="upgrade" data-id="${id}" data-stat="${s.id}">${fmtShort(cost)}</button>`}</div></div>`;
      }
      html += '<div class="section-title" style="margin-top:8px">Stats</div>' + this.statBars(def, c.upgrades);
    } else if (m.gtab === 'paint') {
      if (!g.profile.garage.paintbooth) html += '<div class="note lock">Build the Paint Booth (Shop &gt; Garage) to repaint vehicles.</div>';
      html += `<div class="swatches">${PAINTS.map(p => {
        const own = (c.paints || ['stock']).includes(p.id);
        return `<button class="swatch ${c.paint === p.id ? 'on' : ''} ${!g.profile.garage.paintbooth && p.id !== 'stock' ? 'disabled' : ''}" data-act="paint" data-id="${id}" data-p="${p.id}"><span class="c" style="background:${p.color || def.color}"></span>${esc(p.name)}<span class="p">${own ? (c.paint === p.id ? 'On' : 'Owned') : fmtShort(p.price)}</span></button>`;
      }).join('')}</div>`;
    } else if (m.gtab === 'wheels') {
      if (!g.profile.garage.wheelbay) html += '<div class="note lock">Build the Wheel Bay (Shop &gt; Garage) to change wheels.</div>';
      html += `<div class="swatches">${WHEELS.map(w => {
        const own = (c.wheelSets || ['standard']).includes(w.id);
        return `<button class="swatch ${c.wheels === w.id ? 'on' : ''} ${!g.profile.garage.wheelbay && w.id !== 'standard' ? 'disabled' : ''}" data-act="wheels" data-id="${id}" data-w="${w.id}"><span class="c" style="background:radial-gradient(circle,${w.rim} 45%,#24262b 47%)"></span>${esc(w.name)}<span class="p">${own ? (c.wheels === w.id ? 'On' : 'Owned') : fmtShort(w.price)}</span></button>`;
      }).join('')}</div>`;
    } else if (m.gtab === 'acc') {
      if (!g.profile.garage.workshop) html += '<div class="note lock">Build the Accessory Workshop (Shop &gt; Garage) to add extras.</div>';
      html += ACCESSORIES.map(a => {
        const own = (c.accOwned || []).includes(a.id), on = (c.accessories || []).includes(a.id);
        return `<div class="up-row" style="display:flex;align-items:center;gap:10px"><div style="flex:1"><b>${esc(a.name)}</b><div style="font-size:12px;color:var(--muted)">${esc(a.desc)}</div></div>
          <button class="btn small ${!g.profile.garage.workshop ? 'gray disabled' : own ? (on ? 'gray' : 'blue') : 'green'}" data-act="acc" data-id="${id}" data-a="${a.id}">${own ? (on ? 'Remove' : 'Fit') : fmtShort(a.price)}</button></div>`;
      }).join('');
    }
    return html;
  }

  // ---------------------------------------------------------------- SHOP
  openShop(tab = 'vehicles') {
    const g = this.g;
    const root = this.show('shop', `<div class="stage-menu">
      <div class="stage-head"><div class="icon" style="background:linear-gradient(160deg,#4ea3ff,#2a66d1);width:44px;height:44px;border-radius:14px;display:grid;place-items:center">${SVG.shop}</div>
        <h2>Shop</h2><div class="tabs" id="s-tabs" style="padding:0"></div><div class="money-line"><span class="m-amt"></span></div><button class="close" data-act="close">&times;</button></div>
      <div id="s-body" style="flex:1;min-height:0;display:flex;flex-direction:column"></div></div>`, { closeOnBackdrop: false });
    const m = this.menu;
    m.tab = tab;
    m.sel = null;
    const body = root.querySelector('#s-body');
    let shown = null, layoutTab = null;
    m.render = () => {
      root.querySelector('.m-amt').textContent = fmtMoney(g.profile.money);
      root.querySelector('#s-tabs').innerHTML = [['vehicles', 'Vehicles'], ['outfit', 'Outfit'], ['equipment', 'Equipment'], ['garage', 'Garage'], ['districts', 'Districts']]
        .map(([id, n]) => `<button class="tab ${m.tab === id ? 'on' : ''}" style="border-radius:12px" data-act="stab" data-id="${id}">${n}</button>`).join('');
      if (m.tab === 'vehicles' || m.tab === 'outfit') {
        if (layoutTab !== m.tab) {
          layoutTab = m.tab; shown = null;
          body.innerHTML = `<div class="stage-body"><div class="stage-panel vlist" id="s-list"></div><div class="preview-slot" id="s-prev"><div class="preview-label" id="s-label"></div></div><div class="stage-panel" id="s-side"></div></div>`;
          m.previewEl = body.querySelector('#s-prev');
          this.bindPreviewDrag(m.previewEl);
        }
        if (m.tab === 'vehicles') this.shopVehicles(body, k => { if (shown !== k.key) { shown = k.key; k.show(); } });
        else this.shopOutfit(body, k => { if (shown !== k.key) { shown = k.key; k.show(); } });
      } else {
        layoutTab = m.tab;
        m.previewEl = null;
        g.preview.clear();
        body.innerHTML = `<div class="stage-panel" style="flex:1">${this['shop_' + m.tab]()}</div>`;
      }
    };
    m.render();
  }
  shopVehicles(body, show) {
    const g = this.g, m = this.menu;
    const list = VEHICLES.filter(v => v.id !== 'walk');
    if (!m.sel || !VEHICLE_BY_ID[m.sel] || m.sel === 'walk') m.sel = list.find(v => !g.eco.owns(v.id))?.id || list[0].id;
    body.querySelector('#s-list').innerHTML = '<div class="section-title">Wheelhouse Motors</div>' + list.map(v => {
      const own = g.eco.owns(v.id), lock = g.profile.level < v.level;
      return `<button class="${m.sel === v.id ? 'on' : ''}" data-act="dsel" data-id="${v.id}"><span class="sw" style="background:${v.color}"></span>
        <span><div class="nm">${esc(v.name)}</div><div class="sub">${own ? 'Owned' : fmtMoney(v.price)}</div></span><span class="lk" style="${own ? 'color:var(--green)' : lock ? 'color:var(--red)' : ''}">${own ? 'Owned' : lock ? 'Lv ' + v.level : ''}</span></button>`;
    }).join('');
    const def = VEHICLE_BY_ID[m.sel];
    show({ key: 'v:' + def.id, show: () => g.preview.showVehicle(def, g.eco.owns(def.id) ? g.eco.custom(def.id) : {}) });
    body.querySelector('#s-label').innerHTML = `${esc(def.name)}<small>${fmtMoney(def.price)} &middot; level ${def.level}</small>`;
    const own = g.eco.owns(def.id), lock = g.profile.level < def.level, poor = g.profile.money < def.price;
    const cur = g.profile.equipped !== 'walk' ? vehicleStats(VEHICLE_BY_ID[g.profile.equipped], g.eco.custom(g.profile.equipped).upgrades) : null;
    body.querySelector('#s-side').innerHTML = `<div class="section-title">${esc(def.name)}</div><div class="note">${esc(def.desc)}</div>
      ${this.statBars(def, own ? g.eco.custom(def.id).upgrades : {}, cur)}
      ${cur ? `<div class="note">Green / red numbers compare with your ${esc(VEHICLE_BY_ID[g.profile.equipped].name)}.</div>` : ''}
      <div style="display:flex;align-items:center;justify-content:space-between;margin:10px 0"><span class="price" style="font-size:26px;font-weight:700;color:var(--green)">${fmtMoney(def.price)}</span>
      ${lock ? `<span class="req" style="color:var(--red);font-weight:700">Requires level ${def.level}</span>` : ''}</div>
      ${own ? `<button class="btn ${g.profile.equipped === def.id ? 'gray disabled' : 'green'}" style="width:100%" data-act="equip" data-id="${def.id}">${g.profile.equipped === def.id ? 'Equipped' : 'Equip and ride'}</button>`
    : `<button class="btn ${lock || poor ? 'gray disabled' : 'green'}" style="width:100%" data-act="buy-vehicle" data-id="${def.id}">${lock ? 'Locked' : poor ? `Need ${fmtMoney(def.price - g.profile.money)} more` : 'Buy'}</button>`}`;
  }
  shopOutfit(body, show) {
    const g = this.g, cs = g.profile.cosmetics;
    const look = { shirt: cs.shirt, pants: cs.pantsColor };
    show({ key: 'c:' + JSON.stringify(cs), show: () => g.preview.showCharacter(look, cs.equipped) });
    body.querySelector('#s-label').innerHTML = 'Your courier<small>Drag to turn</small>';
    const item = c => {
      const own = cs.owned.includes(c.id), on = cs.equipped[c.slot] === c.id, lock = g.profile.level < c.level;
      return `<button class="${on ? 'on' : ''} ${lock && !own ? 'disabled' : ''}" data-act="cosmetic" data-id="${c.id}"><span class="sw" style="background:#2e3a58;display:grid;place-items:center;font-size:11px">${c.slot[0].toUpperCase()}</span>
        <span><div class="nm">${esc(c.name)}</div><div class="sub">${own ? (on ? 'Wearing (click to remove)' : 'Owned') : lock ? 'Level ' + c.level : fmtMoney(c.price)}</div></span></button>`;
    };
    body.querySelector('#s-list').innerHTML = `<div class="section-title">Hats</div>${COSMETICS.filter(c => c.slot === 'hat').map(item).join('')}
      <div class="section-title">Face</div>${COSMETICS.filter(c => c.slot === 'face').map(item).join('')}
      <div class="section-title">Back</div>${COSMETICS.filter(c => c.slot === 'back').map(item).join('')}`;
    const sw = (kind, list, owned, cur) => `<div class="swatches">${list.map(col => `<button class="swatch ${cur === col ? 'on' : ''}" data-act="color" data-kind="${kind}" data-c="${col}"><span class="c" style="background:${col}"></span><span class="p">${owned.includes(col) ? (cur === col ? 'On' : 'Owned') : fmtMoney(COLOR_PRICE)}</span></button>`).join('')}</div>`;
    body.querySelector('#s-side').innerHTML = `<div class="section-title">Shirt colour</div>${sw('shirt', SHIRT_COLORS, cs.shirts, cs.shirt)}
      <div class="section-title" style="margin-top:12px">Trousers colour</div>${sw('pants', PANTS_COLORS, cs.pants, cs.pantsColor)}
      <div class="note" style="margin-top:12px">Cosmetics are just for looks. Equipment (next tab) gives real bonuses.</div>`;
  }
  shop_equipment() {
    const g = this.g;
    return `<div class="section-title">Equipment &middot; permanent bonuses</div><div class="grid">${EQUIPMENT.map(e => {
      const own = g.eco.hasEquip(e.id), lock = g.profile.level < e.level;
      return `<div class="card ${own ? 'owned' : lock ? 'locked' : ''}">${own ? '<span class="badge">Owned</span>' : ''}<h3>${esc(e.name)}</h3><div class="desc">${esc(e.desc)}</div>
        <div class="row"><span class="price">${fmtMoney(e.price)}</span>${lock ? `<span class="req">Level ${e.level}</span>` : ''}</div>
        ${own ? '' : `<button class="btn small ${lock || g.profile.money < e.price ? 'gray disabled' : 'green'}" data-act="equipment" data-id="${e.id}">Buy</button>`}</div>`;
    }).join('')}</div>`;
  }
  shop_garage() {
    const g = this.g;
    return `<div class="section-title">Garage upgrades for Rush HQ</div><div class="grid">${GARAGE_UPGRADES.map(e => {
      const own = g.profile.garage[e.id], lock = g.profile.level < e.level;
      return `<div class="card ${own ? 'owned' : lock ? 'locked' : ''}">${own ? '<span class="badge">Built</span>' : ''}<h3>${esc(e.name)}</h3><div class="desc">${esc(e.desc)}</div>
        <div class="row"><span class="price">${fmtMoney(e.price)}</span>${lock ? `<span class="req">Level ${e.level}</span>` : ''}</div>
        ${own ? '' : `<button class="btn small ${lock || g.profile.money < e.price ? 'gray disabled' : 'green'}" data-act="garage-up" data-id="${e.id}">Build</button>`}</div>`;
    }).join('')}</div>`;
  }
  shop_districts() {
    const g = this.g;
    return `<div class="section-title">Districts &middot; unlock new areas with better paying jobs</div><div class="grid">${DISTRICT_ORDER.map(id => {
      const d = DISTRICTS[id], own = g.eco.isUnlocked(id), lock = g.profile.level < d.level;
      return `<div class="card ${own ? 'owned' : lock ? 'locked' : ''}" style="border-top:6px solid ${d.color}">${own ? '<span class="badge">Unlocked</span>' : ''}<h3>${d.name}</h3><div class="desc">${esc(d.desc)}</div>
        <div class="row"><span>Pay x${d.mult}</span>${own ? '' : `<span class="price">${fmtMoney(d.cost)}</span>`}</div>${lock && !own ? `<span class="req">Requires level ${d.level}</span>` : ''}
        ${own ? '' : `<button class="btn small ${lock || g.profile.money < d.cost ? 'gray disabled' : 'green'}" data-act="district" data-id="${id}">Unlock</button>`}</div>`;
    }).join('')}</div>`;
  }

  // ---------------------------------------------------------------- SETTINGS / PAUSE / HELP
  openSettings() {
    const g = this.g;
    const inGame = g.state === 'playing';
    const root = this.show('settings', `<div class="backdrop"><div class="modal narrow" style="width:min(640px,94vw)">${this.head('Settings', 'settings', 'linear-gradient(160deg,#6b7896,#434e69)')}<div class="modal-body" id="set-body"></div></div></div>`);
    const m = this.menu;
    const s = g.settings;
    const slider = (key, label, min, max, step) => `<div class="set-row"><label>${label}</label><input type="range" min="${min}" max="${max}" step="${step}" value="${s[key]}" data-key="${key}"><span style="width:44px;text-align:right" data-v="${key}">${key === 'fov' ? s[key] : Math.round(s[key] * 100) + (key === 'sensitivity' ? '%' : '%')}</span></div>`;
    const toggle = (key, label) => `<div class="set-row"><label>${label}</label><button class="toggle ${s[key] ? 'on' : ''}" data-act="set-toggle" data-key="${key}"></button></div>`;
    const select = (key, label, opts) => `<div class="set-row"><label>${label}</label><select data-key="${key}">${opts.map(([v, n]) => `<option value="${v}" ${s[key] === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div>`;
    m.render = () => {
      root.querySelector('.m-amt').textContent = fmtMoney(g.profile ? g.profile.money : 0);
      root.querySelector('#set-body').innerHTML = `
        <div class="section-title">Audio</div>${slider('master', 'Master volume', 0, 1, 0.05)}${slider('sfx', 'Effects', 0, 1, 0.05)}${slider('engine', 'Engines', 0, 1, 0.05)}${slider('ambient', 'City ambience', 0, 1, 0.05)}
        ${g.audio && !g.audio.enabled ? '<div class="note">Sound is off because the page was opened with ?mute.</div>' : ''}
        <div class="section-title" style="margin-top:12px">Controls</div>${slider('sensitivity', 'Mouse sensitivity', 0.3, 2.5, 0.05)}${toggle('invertY', 'Invert mouse Y')}${slider('fov', 'Field of view', 55, 95, 1)}
        <div class="section-title" style="margin-top:12px">Graphics</div>${select('quality', 'Quality (Low / Medium / High)', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']])}
        ${select('timeMode', 'Time of day', [['cycle', 'Day and night cycle'], ['day', 'Always day'], ['night', 'Always night']])}
        ${toggle('minimapRotate', 'Rotate minimap with camera')}${toggle('showFps', 'Show FPS')}
        ${inGame ? `<div class="section-title" style="margin-top:12px">Save</div><div class="set-row"><label>Progress saves automatically every 30 seconds and after every delivery or purchase.${g.save.persistent ? '' : ' <span style="color:var(--red)">This browser blocks storage, so progress will not survive a reload.</span>'}</label><button class="btn small blue" data-act="save-now">Save now</button></div>
        <div class="set-row"><label>Delete all progress</label><button class="btn small red" data-act="reset">Reset</button></div>` : ''}`;
      root.querySelectorAll('input[type=range]').forEach(inp => inp.addEventListener('input', () => {
        const k = inp.dataset.key;
        s[k] = +inp.value;
        root.querySelector(`[data-v="${k}"]`).textContent = k === 'fov' ? s[k] : Math.round(s[k] * 100) + '%';
        g.applySettings();
      }));
      root.querySelectorAll('input[type=range]').forEach(inp => inp.addEventListener('change', () => g.saveSettings()));
      root.querySelectorAll('select').forEach(sel => sel.addEventListener('change', () => { s[sel.dataset.key] = sel.value; g.applySettings(); g.saveSettings(); }));
    };
    m.render();
  }
  openPause() {
    if (this.menu) return;
    this.show('pause', `<div class="backdrop"><div class="modal narrow" style="width:min(420px,94vw)"><div class="modal-head"><h2>Paused</h2></div>
      <div class="pause-buttons"><button class="btn big green" data-act="resume">Resume</button><button class="btn blue" data-act="open-settings">Settings</button>
      <button class="btn blue" data-act="open-controls">Controls</button><button class="btn gray" data-act="save-now">Save game</button><button class="btn red" data-act="quit-title">Save and quit to title</button></div></div></div>`);
  }
  openControls() {
    this.show('controls', `<div class="backdrop"><div class="modal narrow">${this.head('Controls', 'settings', '#3a86ff')}<div class="modal-body"><div class="controls-grid">
      <span class="kbd">W A S D</span><span>Walk / drive and steer</span><span class="kbd">Mouse</span><span>Look around (click the game to capture the mouse)</span>
      <span class="kbd">Shift</span><span>Sprint</span><span class="kbd">Space</span><span>Jump (on foot) / handbrake (driving)</span><span class="kbd">E</span><span>Interact: collect, deliver, ride, get off, job boards, garage, shop</span>
      <span class="kbd">V</span><span>Call your vehicle</span><span class="kbd">R</span><span>Reset vehicle onto the road</span><span class="kbd">H</span><span>Horn / bell</span>
      <span class="kbd">M</span><span>Map</span><span class="kbd">J</span><span>Missions</span><span class="kbd">G</span><span>Garage</span><span class="kbd">B</span><span>Shop</span>
      <span class="kbd">Wheel</span><span>Camera zoom</span><span class="kbd">Esc</span><span>Pause / close menus</span></div></div></div></div>`);
  }
  openCredits() {
    this.show('credits', `<div class="backdrop"><div class="modal narrow">${this.head('Credits', 'missions', '#ff7a1f')}<div class="modal-body"><div class="confirm-text">
      <b>DELIVERY RUSH</b> is an original game.<br><br>
      3D models: every character, vehicle, building and prop was modelled for this game in Blender with scripts (see docs/ASSETS.md). No third-party models are used.<br>
      Sound: all sounds are synthesised live with the Web Audio API.<br>
      Textures: drawn in code at load time.<br>
      Engine: three.js (MIT licence).<br>Font: Fredoka by Milena Brandao and Hafontia (SIL Open Font Licence).</div></div></div></div>`);
  }
}

export { TIPS };
