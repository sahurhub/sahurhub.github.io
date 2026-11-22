// The on-screen HUD, laid out like the user's reference picture: money pill top centre,
// big buttons on the left, "Grass Mowed" bottom left,
// "Upgrade Mower!" bottom right. Plus timer, catcher/fuel gauges, hints, minimap, touch stick.
import { el, esc, money, pct, time, $ui } from './ui.js';
import { icon } from './icons.js';
import { bindStick, isTouchDevice, input } from '../core/input.js';
import { settings } from '../core/store.js';
import { SURF } from '../shared/lawn.js';
import { CHALLENGES, WEATHER, RULES } from '../shared/rules.js';
import { LEVELS } from '../shared/levels.js';

const SURF_COL = { [SURF.meadow]: [70, 140, 50], [SURF.lawn]: [52, 140, 40], [SURF.path]: [190, 188, 182], [SURF.soil]: [110, 76, 48], [SURF.sand]: [230, 212, 160], [SURF.water]: [60, 160, 225], [SURF.asphalt]: [90, 92, 98], [SURF.patio]: [210, 190, 155] };

export class Hud {
  constructor(app) {
    this.app = app;
    this.last = {};
    this.mmT = 0;
    this.build();
  }

  build() {
    const ui = $ui();
    const a = this.app;
    // money
    this.moneyBox = el('div', { class: 'hud-money' });
    this.moneyBox.innerHTML = `<div class="money-pill">${icon('grass')}<span class="money-val">$0</span></div>`;
    this.moneyBox.appendChild(el('button', { class: 'btn money-plus', title: 'Shop', onclick: () => a.openShop('mowers') }, '+'));
    this.moneyVal = this.moneyBox.querySelector('.money-val');
    // left buttons
    this.left = el('div', { class: 'hud-left' });
    const side = (cls, ico, label, fn) => this.left.appendChild(el('button', { class: 'btn side-btn ' + cls, onclick: fn }, `${icon(ico)}<span>${label}</span>`));
    side('', 'jobs', 'Jobs', () => a.openJobs());
    side('blue', 'shop', 'Shop', () => a.openShop('mowers'));
    side('purple', 'paw', 'Pets', () => a.openShop('pets'));
    side('orange', 'stats', 'Stats', () => a.openStats());
    side('grey', 'gear', 'Settings', () => a.openSettings());
    // job chips
    this.jobBox = el('div', { class: 'hud-job hidden' });
    // grass mowed
    this.mowed = el('div', { class: 'hud-mowed' }, `<div class="lbl">Grass Mowed:</div><div class="pct">0%</div><div class="bar"><i></i></div>`);
    this.mowedLbl = this.mowed.querySelector('.lbl'); this.mowedPct = this.mowed.querySelector('.pct'); this.mowedBar = this.mowed.querySelector('.bar i');
    // gauges
    this.gauges = el('div', { class: 'gauges hidden' });
    this.gCatch = el('div', { class: 'gauge' }, `<div class="top"><span>Catcher</span><span class="v"></span></div><div class="bar catcher"><i></i></div>`);
    this.gFuel = el('div', { class: 'gauge' }, `<div class="top"><span class="n">Fuel</span><span class="v"></span></div><div class="bar fuel"><i></i></div>`);
    this.gauges.append(this.gCatch, this.gFuel);
    // upgrade button
    this.upgrade = el('button', { class: 'btn hud-upgrade', onclick: () => a.openShop('upgrades') }, `${icon('mower')}<span class="txt">Upgrade<b>Mower!</b></span>`);
    // hint, finish, right buttons
    this.hintEl = el('div', { class: 'hud-hint hidden' });
    this.finishBtn = el('button', { class: 'btn yellow hud-finish hidden', onclick: () => a.finishJob() }, 'Finish job (F)');
    this.right = el('div', { class: 'hud-cam' });
    const rb = (ico, title, fn) => this.right.appendChild(el('button', { class: 'btn grey round-btn', title, onclick: fn }, icon(ico)));
    rb('camera', 'Change camera (C)', () => input.press('camera'));
    rb('map', 'Minimap (M)', () => input.press('map'));
    rb('reset', 'Back to the start (R)', () => input.press('reset'));
    rb('pause', 'Pause (Esc)', () => input.press('pause'));
    this.minimap = el('canvas', { class: 'minimap hidden', width: 120, height: 120 });
    this.fps = el('div', { class: 'fps hidden' });
    ui.append(this.left, this.moneyBox, this.jobBox, this.gauges, this.mowed, this.upgrade, this.hintEl, this.finishBtn, this.right, this.minimap, this.fps);
    // touch controls
    if (isTouchDevice()) {
      document.body.classList.add('touch-mode');
      const t = el('div', { class: 'touch' });
      const stick = el('div', { class: 'stick' }, '<i></i>');
      t.appendChild(stick);
      bindStick(stick);
      ui.prepend(t);
      this.touchEl = t;
    }
  }

  setMoney(n) {
    if (this.last.money === n) return;
    const prev = this.last.money;
    this.last.money = n;
    this.moneyVal.textContent = money(n);
    if (prev != null && n !== prev) this.pop(n - prev);
  }

  pop(delta) {
    const p = el('div', { class: 'money-pop' + (delta < 0 ? ' neg' : '') }, (delta < 0 ? '-' : '+') + money(Math.abs(delta)));
    this.moneyBox.appendChild(p);
    setTimeout(() => p.remove(), 1500);
  }

  // inJob = a job is running (shows timer, gauges...)
  setMode(inJob) {
    this.jobBox.classList.toggle('hidden', !inJob);
    this.gauges.classList.toggle('hidden', !inJob);
    this.right.classList.toggle('hidden', !inJob);
    this.minimap.classList.toggle('hidden', !(inJob && settings.minimap));
    this.mowed.classList.toggle('hidden', !inJob);
    if (!inJob) { this.hintEl.classList.add('hidden'); this.finishBtn.classList.add('hidden'); }
    if (this.touchEl) this.touchEl.classList.toggle('hidden', !inJob);
    this.last.job = null;
  }

  startJob(job) {
    const c = job.cfg, L = LEVELS[c.level];
    const tag = c.kind !== 'standard' ? ` - ${CHALLENGES[c.kind].name}` : '';
    this.jobBox.innerHTML = `<span class="chip t-timer">${icon('clock').replace('<svg', '<svg class="ico"')}<b>0:00</b></span><span class="chip">${esc(L.short)}${esc(tag)}</span>${c.weather !== 'sunny' ? `<span class="chip">${esc(WEATHER[c.weather].name)}</span>` : ''}`;
    this.timerChip = this.jobBox.querySelector('.t-timer');
    this.timerEl = this.timerChip.querySelector('b');
    this.gCatch.classList.toggle('hidden', !Number.isFinite(job.sim.catcherMax));
    this.gFuel.classList.toggle('hidden', !(job.sim.fuelMax > 0));
    this.gFuel.querySelector('.n').textContent = job.M.engine === 'electric' ? 'Battery' : 'Fuel';
    this.mowedLbl.textContent = c.kind === 'pattern' ? 'Pattern Cut:' : 'Grass Mowed:';
    this.prepareMinimap(job);
    this.setMode(true);
  }

  update(dt, job, fps) {
    if (settings.fps || this.app.flagsFps) { this.fps.classList.remove('hidden'); this.fps.textContent = Math.round(fps) + ' fps ' + this.app.R.preset.name; }
    else this.fps.classList.add('hidden');
    if (!job) return;
    const cov = job.coverage;
    const shown = cov >= RULES.AUTO_DONE ? 1 : Math.min(0.99, cov);
    const p = Math.floor(shown * 100);
    if (this.last.pct !== p) { this.last.pct = p; this.mowedPct.textContent = p + '%'; this.mowedBar.style.width = p + '%'; }
    const left = Math.ceil(job.timeLeft);
    if (this.last.left !== left) { this.last.left = left; this.timerEl.textContent = time(left); this.timerChip.classList.toggle('warn', left <= 20); }
    const s = job.sim;
    if (Number.isFinite(s.catcherMax)) {
      const f = s.catcher / s.catcherMax, k = Math.round(f * 100);
      if (this.last.c !== k) { this.last.c = k; this.gCatch.querySelector('i').style.width = k + '%'; this.gCatch.querySelector('.v').textContent = Math.round(s.catcher) + ' / ' + Math.round(s.catcherMax) + ' L'; this.gCatch.querySelector('.bar').classList.toggle('full', f > 0.99); }
    }
    if (s.fuelMax > 0) {
      const f = s.fuel / s.fuelMax, k = Math.round(f * 100);
      if (this.last.f !== k) { this.last.f = k; this.gFuel.querySelector('i').style.width = k + '%'; this.gFuel.querySelector('.v').textContent = k + '%'; this.gFuel.querySelector('.bar').classList.toggle('low', f < 0.2); }
    }
    const h = job.hint();
    const key = h ? h.text + (h.prog != null ? Math.round(h.prog * 20) : '') : '';
    if (this.last.hint !== key) {
      this.last.hint = key;
      if (!h) this.hintEl.classList.add('hidden');
      else {
        this.hintEl.classList.remove('hidden');
        this.hintEl.style.background = h.warn ? 'rgba(196,45,45,.9)' : '';
        this.hintEl.innerHTML = esc(h.text) + (h.prog != null ? `<div class="prog"><i style="width:${Math.min(100, h.prog * 100)}%"></i></div>` : '');
      }
    }
    const canFinish = job.cfg.kind === 'pattern' ? job.time > 20 : cov >= RULES.FINISH_MIN;
    if (this.last.fin !== canFinish) { this.last.fin = canFinish; this.finishBtn.classList.toggle('hidden', !canFinish); }
    // minimap 4 times a second
    this.mmT += dt;
    if (this.mmT > 0.25 && settings.minimap) { this.mmT = 0; this.drawMinimap(job); }
  }

  // ---------------- minimap
  prepareMinimap(job) {
    const G = job.G;
    const s = 120 / Math.max(G.nx, G.nz);
    const w = Math.max(8, Math.round(G.nx * s)), h = Math.max(8, Math.round(G.nz * s));
    this.minimap.width = w; this.minimap.height = h;
    const ar = w / h;
    this.minimap.style.width = (ar >= 1 ? 170 : 170 * ar) + 'px';
    this.minimap.style.height = (ar >= 1 ? 170 / ar : 170) + 'px';
    this.mm = { w, h, img: this.minimap.getContext('2d').createImageData(w, h), cells: new Int32Array(w * h) };
    // map pixel -> grid cell (x mirrored and z flipped so "forward from the start" is up)
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
      const i = Math.min(G.nx - 1, Math.floor(((w - 1 - px) / w) * G.nx));
      const j = Math.min(G.nz - 1, Math.floor(((h - 1 - py) / h) * G.nz));
      this.mm.cells[py * w + px] = j * G.nx + i;
    }
  }

  drawMinimap(job) {
    const mm = this.mm;
    if (!mm) return;
    const G = job.G, d = job.world.ground.data, img = mm.img.data, pat = job.pattern;
    for (let p = 0; p < mm.cells.length; p++) {
      const k = mm.cells[p];
      let c = SURF_COL[G.surf[k]] || SURF_COL[0];
      if (G.mow[k]) {
        const cut = d[k * 4] >= 200;
        c = cut ? [128, 214, 82] : [44, 120, 34];
        if (pat && pat[k] && !cut) c = [214, 220, 120];
        if (pat && !pat[k] && cut) c = [230, 110, 80];
      }
      img[p * 4] = c[0]; img[p * 4 + 1] = c[1]; img[p * 4 + 2] = c[2]; img[p * 4 + 3] = 255;
    }
    const g = this.minimap.getContext('2d');
    g.putImageData(mm.img, 0, 0);
    const toPx = (x, z) => [mm.w - 1 - ((x - G.x0) / (G.nx * G.cs)) * mm.w, mm.h - 1 - ((z - G.z0) / (G.nz * G.cs)) * mm.h];
    const L = job.L;
    for (const s of L.stationZones.compost) { const [x, y] = toPx(s.x, s.z); g.fillStyle = '#8a5a2b'; g.fillRect(x - 3, y - 3, 6, 6); }
    for (const s of L.stationZones.fuel) { const [x, y] = toPx(s.x, s.z); g.fillStyle = '#2f8cff'; g.fillRect(x - 3, y - 3, 6, 6); }
    const b = job.body;
    const [x, y] = toPx(b.x, b.z);
    g.save(); g.translate(x, y); g.rotate(-b.h); // map is mirrored in x and flipped in z
    g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, -5); g.lineTo(4, 4); g.lineTo(-4, 4); g.closePath(); g.fill(); g.stroke();
    g.restore();
  }
}
