// UK Simulator - the menu: garage, shop (vehicles, upgrades, paint), events, daily challenge,
// settings, account (SahurHub Chat sign-in), controls and credits.
import { VEHICLES, VEHICLE_ORDER, KMH } from '../shared/vehicles.js';
import { UPGRADES, MAX_UPGRADE, upgradePrice, PAINTS, PAINT_PRICE, repairPrice, medalTimes, eventAllows, dailyReward, levelOk } from '../shared/rules.js';
import { TYPE_NAME, fmt } from '../game/events.js';
import { escapeHtml as esc } from './hud.js';
import { creditsHtml } from './credits.js';
import { chatLogin, chatSignup, chatSession } from '../net/net.js';

const TABS = [['play', 'Play'], ['garage', 'Garage'], ['shop', 'Shop'], ['events', 'Events'], ['settings', 'Settings'], ['account', 'Account'], ['controls', 'Controls'], ['credits', 'Credits']];

export class Menu {
  constructor(game) {
    this.g = game; this.el = document.getElementById('menu'); this.open = false; this.tab = 'play';
    this.el.addEventListener('click', (e) => this.onClick(e));
    this.el.addEventListener('input', (e) => this.onInput(e));
  }

  toggle(force) {
    this.open = force ?? !this.open;
    this.el.hidden = !this.open;
    if (this.open) { this.render(); if (document.pointerLockElement) document.exitPointerLock(); }
  }
  refreshIfOpen() { if (this.open) this.render(); }

  render() {
    const g = this.g, p = g.profile;
    const tabs = TABS.map(([id, name]) => `<button class="tab ${this.tab === id ? 'on' : ''}" data-tab="${id}">${name}</button>`).join('');
    this.el.innerHTML = `<div class="panel"><button class="btn close" data-act="close">Resume (Esc)</button><h1>LB Simulator</h1><p>£${Math.round(p.data.money).toLocaleString('en-GB')} - level ${p.level} - ${p.online ? 'signed in as ' + esc(p.data.name) + ' (progress saved on the server)' : 'guest (progress saved in this browser only)'}</p><div class="tabs">${tabs}</div><div id="menu-body">${this[this.tab]()}</div></div>`;
  }

  play() {
    const g = this.g, p = g.profile, d = p.daily, dd = p.data.daily;
    const r = dailyReward(dd.streak + (dd.done ? 0 : 1));
    const prog = d.goal >= 1000 ? `${(Math.min(dd.progress, d.goal) / 1000).toFixed(1)} / ${d.goal / 1000} km` : `${Math.min(dd.progress, d.goal)} / ${d.goal}`;
    return `<h2>Daily challenge</h2><div class="card"><h3>${esc(d.text)}</h3><div class="meta">${dd.done ? 'Done for today - come back tomorrow!' : `Progress ${prog}. Reward £${r.money} and ${r.xp} XP.`} Streak: ${dd.streak} day${dd.streak === 1 ? '' : 's'}.</div></div>
      <h2>Jobs</h2><div class="row"><button class="btn primary" data-act="job">${g.events.job ? 'Cancel delivery' : 'Find a delivery job'}</button></div>
      <p>Pick up parcels from real Leighton Buzzard shops and businesses and drop them off across town. Faster deliveries pay a bonus. You can also press G in the world.</p>
      <h2>Quick actions</h2><div class="row"><button class="btn" data-act="map">Open the map (M)</button> <button class="btn" data-act="tuning">Tuning (F4)</button> <button class="btn" data-act="debug">Physics overlay (F3)</button> <button class="btn" data-act="spawn">Back to the town centre</button></div>`;
  }

  garage() {
    const g = this.g, p = g.profile;
    const cur = g.myVehicle;
    let html = '<p>Your vehicles. "Use" brings it to you.</p><div class="grid">';
    for (const id of VEHICLE_ORDER) {
      const own = p.vehicle(id);
      if (!own) continue;
      const v = VEHICLES[id];
      const dmg = cur && cur.id === id ? cur.phys.damage.total : own.damage || 0;
      const ups = Object.entries(UPGRADES).filter(([k, u]) => !u.electric || v.battery).map(([k, u]) => {
        const lvl = own.upgrades[k] || 0;
        return `<div class="spec">${u.name}: ${'|'.repeat(lvl)}${'.'.repeat(MAX_UPGRADE - lvl)} ${lvl < MAX_UPGRADE ? `<button class="btn" data-up="${id}:${k}">+ ${upgradePrice(id, k, lvl + 1) ? '£' + upgradePrice(id, k, lvl + 1) : 'free'}</button>` : 'max'}</div>`;
      }).join('');
      const paints = PAINTS.map((c) => `<button class="swatch" title="${c.name}${own.paints.includes(c.id) ? '' : ' - £' + PAINT_PRICE}" style="background:#${c.hex.toString(16).padStart(6, '0')};${own.paint === c.id ? 'outline:3px solid #ffcc33' : ''}" data-paint="${id}:${c.id}"></button>`).join(' ');
      html += `<div class="card"><h3>${esc(v.short)}</h3><div class="meta">${esc(v.name)}${cur && cur.id === id ? ' - in use' : ''}</div>
        <div class="row"><button class="btn primary" data-use="${id}">Use</button>${dmg > 0.03 ? ` <button class="btn" data-repair="${id}">Repair £${repairPrice(id, dmg)}</button>` : ''}</div>
        <div style="margin-top:8px">${ups}</div><div class="row">${paints}</div></div>`;
    }
    return html + '</div>';
  }

  shop() {
    const p = this.g.profile;
    let html = '<p>Real vehicles with their real specs. The physics is tuned against these figures.</p><div class="grid">';
    for (const id of VEHICLE_ORDER) {
      const v = VEHICLES[id], r = v.real, own = p.owns(id), locked = !levelOk(p.level, v.level);
      const rows = [['Power', r.power], ['Torque', r.torque], ['Battery', r.battery], ['Mass', r.mass], ['Top speed', `${Math.round(r.top / KMH)} km/h (${Math.round(r.top * 2.237)} mph)`], ['0-60 mph', r.zeroTo60 ? r.zeroTo60 + ' s' : null], ['Range', r.range], ['Tyres', r.tyres], ['Suspension', r.suspension], ['Drive', r.drive]].filter((x) => x[1]);
      html += `<div class="card ${locked && !own ? 'locked' : ''}"><h3>${esc(v.short)}</h3><div class="meta">${esc(v.name)}</div>
        <table class="kv">${rows.map(([k, val]) => `<tr><td>${k}</td><td>${esc(val)}</td></tr>`).join('')}</table>
        <div class="row">${own ? '<span class="spec">Owned</span>' : locked ? `<span class="spec">Unlocks at level ${v.level}</span>` : `<button class="btn primary" data-buy="${id}">Buy £${v.price.toLocaleString('en-GB')}</button>`}</div></div>`;
    }
    return html + '</div>';
  }

  events() {
    const g = this.g, p = g.profile;
    const vid = g.vehicle ? g.vehicle.id : p.data.current;
    let html = '<p>Events use real roads around town. Drive to the coloured beam and press G, or use "Go" to jump to the start line.</p><div class="grid">';
    for (const ev of g.events.list) {
      if (ev.type === 'stunt') continue;
      const rec = p.data.records[ev.id];
      const locked = !levelOk(p.level, ev.level);
      const ok = eventAllows(ev, vid);
      const m = ['race', 'timetrial', 'offroad'].includes(ev.type) ? medalTimes(ev, vid) : null;
      html += `<div class="card ${locked ? 'locked' : ''}"><h3>${esc(ev.name)}</h3><div class="meta">${TYPE_NAME[ev.type]}${ev.night ? ' (night)' : ''} - ${ev.mode === 'any' ? 'any vehicle' : ev.mode === 'car' ? 'cars only' : ev.mode === 'bike' ? 'two-wheelers' : 'off-road vehicles'}${ev.length ? ` - ${(ev.length * (ev.laps || 1) / 1000).toFixed(1)} km` : ''}${ev.laps > 1 ? `, ${ev.laps} laps` : ''}</div>
        ${m ? `<div class="spec">Gold ${fmt(m.gold)} - Silver ${fmt(m.silver)} - Bronze ${fmt(m.bronze)}</div>` : ''}
        ${rec ? `<div class="spec">Best: ${rec.medal} ${rec.time ? fmt(rec.time) : rec.score}</div>` : ''}
        <div class="row">${locked ? `<span class="spec">Level ${ev.level}</span>` : ok ? `<button class="btn primary" data-go="${ev.id}">Go</button> <button class="btn" data-route="${ev.id}">Route me there</button>` : '<span class="spec">Not with this vehicle</span>'}</div></div>`;
    }
    const jumps = g.events.list.filter((e) => e.type === 'stunt');
    html += `</div><h2>Stunt jumps (${jumps.length})</h2><p>Always on: hit them fast and land clean. Humpback bridges over the canal and ramps in car parks and the sand pits.</p><div class="grid">${jumps.map((e) => `<div class="card"><h3>${esc(e.name)}</h3><div class="row"><button class="btn" data-route="${e.id}">Route me there</button></div></div>`).join('')}</div>`;
    return html;
  }

  settings() {
    const s = this.g.profile.settings, w = this.g.weather;
    const opt = (name, val, list) => list.map(([v, t]) => `<button class="tab ${val === v ? 'on' : ''}" data-set="${name}:${v}">${t}</button>`).join('');
    return `<h2>Graphics</h2><div class="tabs">${opt('quality', s.quality || this.g.quality, [['low', 'Low (laptops, phones)'], ['medium', 'Medium'], ['high', 'High']])}</div><p>Changing quality reloads the page.</p>
      <h2>Units</h2><div class="tabs">${opt('units', s.units, [['mph', 'mph'], ['kmh', 'km/h']])}</div>
      <h2>Time of day</h2><div class="tabs">${opt('timeMode', w.mode, [['cycle', 'Day and night cycle'], ['real', 'Real UK time'], ['fixed', 'Fixed']])}</div>
      <div class="slider"><span>Hour</span><input type="range" min="0" max="23.9" step="0.1" value="${w.hour.toFixed(1)}" data-slider="hour"><span>${w.clock()}</span></div>
      <h2>Weather</h2><div class="tabs">${opt('weather', w.rainTarget > 0.5 ? 'rain' : 'dry', [['dry', 'Dry'], ['rain', 'Rain (wet roads, less grip)']])}</div>
      <h2>Sound</h2><div class="slider"><span>Volume</span><input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-slider="volume"><span>${Math.round(s.volume * 100)}%</span></div>`;
  }

  account() {
    const p = this.g.profile, net = this.g.net;
    if (p.online) return `<p>Signed in with your SahurHub Chat account as <b>${esc(p.data.name)}</b>. Your money, vehicles and records are saved on the server, and you can see and chat with other players in town.</p><p>Status: ${net.status}</p>`;
    const has = !!chatSession();
    return `<p>Sign in with your <b>SahurHub Chat</b> account to save progress on the server, drive with other players and chat. As a guest your progress stays in this browser.</p>
      ${has ? `<div class="row"><button class="btn primary" data-act="connect">Connect with my chat account</button></div><p>Status: ${net.status}${net.lastError ? ' - ' + esc(net.lastError) : ''}</p>` : `
      <div class="card"><div class="row"><input id="acc-name" placeholder="Username" autocomplete="username" style="padding:8px;border-radius:8px;border:1px solid #444;background:#111;color:#fff"> <input id="acc-pass" type="password" placeholder="Password" autocomplete="current-password" style="padding:8px;border-radius:8px;border:1px solid #444;background:#111;color:#fff"></div>
      <div class="row"><button class="btn primary" data-act="login">Sign in</button> <button class="btn" data-act="signup">Make a new account</button></div><p id="acc-msg"></p></div>`}`;
  }

  controls() {
    return `<table class="kv">
      <tr><td>Drive / ride</td><td>W A S D or arrow keys (gamepad: triggers + left stick)</td></tr>
      <tr><td>Get in / out</td><td>F (gamepad Y)</td></tr><tr><td>Handbrake (cars)</td><td>Space (gamepad A)</td></tr>
      <tr><td>Bunny hop / jump (bikes, scooters)</td><td>Space (gamepad A)</td></tr><tr><td>Lean back (wheelie) / lean forward</td><td>Shift / Ctrl (gamepad right stick)</td></tr>
      <tr><td>Rear brake only (bikes)</td><td>X</td></tr><tr><td>Gears (manual mode in Tuning)</td><td>Q / E (bumpers)</td></tr>
      <tr><td>E-scooter speed mode</td><td>V</td></tr><tr><td>Start event / delivery</td><td>G (d-pad down)</td></tr>
      <tr><td>Camera / first person</td><td>C, drag the mouse to look, B to look back</td></tr><tr><td>Reset vehicle</td><td>R</td></tr>
      <tr><td>Lights / horn</td><td>L / H</td></tr><tr><td>Map / chat / menu</td><td>M / T / Esc</td></tr><tr><td>Physics overlay / tuning</td><td>F3 / F4</td></tr></table>
      <p>On a phone or tablet: the stick steers, GO and BRAKE pedals, plus buttons for getting in and out, camera, reset, map and start.</p>`;
  }

  credits() { return creditsHtml(); }

  async onClick(e) {
    const b = e.target.closest('button');
    if (!b) return;
    const g = this.g, d = b.dataset;
    const run = async (fn) => { try { await fn(); } catch (err) { g.hud.toast(err.message, 'bad'); } this.render(); g.hud.refresh(); };
    if (d.tab) { this.tab = d.tab; this.render(); return; }
    if (d.act === 'close') return this.toggle(false);
    if (d.act === 'job') { if (g.events.job) g.events.cancelJob(); else { this.toggle(false); g.events.startJob(); } return; }
    if (d.act === 'map') { this.toggle(false); g.bigmap.toggle(true); return; }
    if (d.act === 'tuning') { this.toggle(false); g.tuning.toggle(true); return; }
    if (d.act === 'debug') { g.debug.toggle(); return; }
    if (d.act === 'spawn') { this.toggle(false); const s = g.missions.spawn; if (g.vehicle) { g.vehicle.phys.reset(s.x, g.world.heightAt(s.x, s.z) + 0.6, s.z, 0); g.vehicle.capture(); g.vehicle.capture(); } else g.character.teleport(s.x, g.world.heightAt(s.x, s.z), s.z); return; }
    if (d.use) { this.toggle(false); await g.summon(d.use); return; }
    if (d.buy) return run(() => g.profile.buyVehicle(d.buy).then(() => g.hud.toast(`You bought the ${VEHICLES[d.buy].name}! Find it in the Garage.`, 'good')));
    if (d.up) { const [id, kind] = d.up.split(':'); return run(async () => { await g.profile.buyUpgrade(id, kind); if (g.myVehicle && g.myVehicle.id === id) g.hud.toast('Upgrade fitted - use the vehicle again from the Garage to feel it.', 'good'); }); }
    if (d.paint) { const [id, paint] = d.paint.split(':'); return run(async () => { await g.profile.buyPaint(id, paint); if (g.myVehicle && g.myVehicle.id === id) await g.summon(id); }); }
    if (d.repair) return run(async () => { const dmg = g.myVehicle && g.myVehicle.id === d.repair ? g.myVehicle.phys.damage.total : 0; await g.profile.repair(d.repair, dmg); if (g.myVehicle && g.myVehicle.id === d.repair) { this.toggle(false); await g.summon(d.repair); } g.hud.toast('Good as new.', 'good'); });
    if (d.go) { const ev = g.events.list.find((x) => x.id === d.go); this.toggle(false); g.events.start(ev); return; }
    if (d.route) { const ev = g.events.list.find((x) => x.id === d.route); g.events.waypoint = ev.at || ev.start; this.toggle(false); g.hud.toast(`Route set to ${ev.name}.`); return; }
    if (d.set) {
      const [k, v] = d.set.split(':');
      const s = g.profile.settings;
      if (k === 'quality') { s.quality = v; g.profile.saveSettings(); location.reload(); return; }
      if (k === 'units') s.units = v;
      if (k === 'timeMode') { s.timeMode = v; g.weather.mode = v; }
      if (k === 'weather') { s.weather = v; g.weather.rainTarget = v === 'rain' ? 1 : 0; if (v === 'rain') g.weather.rain = Math.max(g.weather.rain, 0.6); }
      g.profile.saveSettings(); this.render(); return;
    }
    if (d.act === 'connect') { g.net.start(true); setTimeout(() => this.render(), 1500); return; }
    if (d.act === 'login' || d.act === 'signup') {
      const name = document.getElementById('acc-name').value.trim(), pass = document.getElementById('acc-pass').value;
      const msg = document.getElementById('acc-msg');
      try { if (d.act === 'login') await chatLogin(name, pass); else await chatSignup(name, pass); msg.textContent = 'Signed in - connecting...'; g.net.start(true); setTimeout(() => this.render(), 1500); } catch (err) { msg.textContent = err.message; }
    }
  }

  onInput(e) {
    const t = e.target, s = this.g.profile.settings;
    if (t.dataset.slider === 'hour') { this.g.weather.setHour(Number(t.value)); s.hour = Number(t.value); t.nextElementSibling.textContent = this.g.weather.clock(); }
    if (t.dataset.slider === 'volume') { s.volume = Number(t.value); t.nextElementSibling.textContent = Math.round(s.volume * 100) + '%'; this.g.audio.setVolume(s.volume); }
    this.g.profile.saveSettings();
  }
}
