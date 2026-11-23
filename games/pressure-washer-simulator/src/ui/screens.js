// Menu screens: title, job select, upgrades shop, settings, click-to-start, pause, results, loading overlay.
import { el, esc, panel, showScreen, closeScreen, money, time, pct, toast, ICONS, $ui, logoHtml } from './ui.js';
import { settings, saveSettings } from '../core/store.js';
import { sfx, setVolume } from '../core/audio.js';
import { PRESETS } from '../render/renderer.js';
import { JOBS } from '../shared/jobs.js';
import { UPGRADES, UPGRADE_ORDER, COLORS } from '../shared/upgrades.js';
import { unlocked, nextJob, upgradePrice, buyUpgrade, buyColor } from '../shared/economy.js';

const chip = (n) => `<span class="money-chip">${money(n)}</span>`;

// ---------------------------------------------------------------- title
const ic = (name) => `<span class="ic">${ICONS[name] || ''}</span>`;

export function openTitle(app) {
  const p = app.profile;
  const nj = nextJob(p);
  const t = el('div', { class: 'title-screen' });
  t.innerHTML = `<div class="title-top"><div class="money-pill"><span class="coin">&pound;</span><span>${Math.round(p.money).toLocaleString('en-GB')}</span></div></div>
    <div class="title-icons"></div>
    <div class="title-left">${logoHtml()}<div class="sub">Blast the grime off Britain, one driveway at a time.</div><div class="title-btns"></div></div>
    <div class="title-foot">Textures and sky from Poly Haven (CC0). Models made in Blender.</div>`;
  const b = t.querySelector('.title-btns');
  b.appendChild(el('button', { class: 'btn big green', onclick: () => { sfx.click(); if (nj) app.startJob(nj.id); else openJobs(app); } }, `${ic('play')}Play`));
  b.appendChild(el('button', { class: 'btn blue', onclick: () => { sfx.click(); openJobs(app); } }, `${ic('jobs')}Jobs`));
  b.appendChild(el('button', { class: 'btn purple', onclick: () => { sfx.click(); openShop(app); } }, `${ic('cart')}Upgrades`));
  b.appendChild(el('button', { class: 'btn orange', onclick: () => { sfx.click(); openSettings(app, () => openTitle(app)); } }, `${ic('gear')}Settings`));
  // top-right: sound on/off and settings
  const icons = t.querySelector('.title-icons');
  const snd = el('button', { class: 'btn navy icon-btn', title: 'Sound on / off' }, ic(settings.mute ? 'muted' : 'sound'));
  snd.addEventListener('click', () => { settings.mute = !settings.mute; saveSettings(); setVolume(); snd.innerHTML = ic(settings.mute ? 'muted' : 'sound'); sfx.click(); });
  icons.appendChild(snd);
  icons.appendChild(el('button', { class: 'btn navy icon-btn', title: 'Settings', onclick: () => { sfx.click(); openSettings(app, () => openTitle(app)); } }, ic('gear')));
  // right: the next job
  const j = nj || JOBS[JOBS.length - 1];
  const card = el('div', { class: 'card title-card' });
  card.innerHTML = `<div class="hd">${ICONS.jobs}${nj ? 'Next job' : 'All jobs done!'}</div>
    <div class="bd"><div class="nm">${esc(j.name)}</div><div class="cl">${esc(j.client)}</div><div class="qp">&ldquo;${esc(j.quip)}&rdquo;</div>
    <div class="facts"><span class="fact">Par ${time(j.par)}</span><span class="fact pay">${money(p.done[j.id] ? Math.round(j.pay * 0.7) : j.pay)}</span></div></div>`;
  card.querySelector('.bd').appendChild(el('button', { class: 'btn yellow', onclick: () => { sfx.click(); app.startJob(j.id); } }, nj ? 'Go!' : 'Play it again'));
  t.appendChild(card);
  // bottom right: an upgrade you can buy now (or the cheapest one to save up for)
  let best = null;
  for (const key of UPGRADE_ORDER) { const pr = upgradePrice(p, key); if (pr != null && (!best || pr < best.pr)) best = { key, pr }; }
  if (best) {
    const u = UPGRADES[best.key], can = p.money >= best.pr;
    const up = el('div', { class: 'card title-upgrade' });
    up.innerHTML = `<div class="ico">${ICONS[u.icon]}</div><div class="tx">${can ? 'Upgrade ready!' : 'Save up for'}<small>${esc(u.name)} &middot; ${money(best.pr)}</small></div>`;
    up.appendChild(el('button', { class: 'btn small yellow', onclick: () => { sfx.click(); openShop(app); } }, 'View'));
    t.appendChild(up);
  }
  showScreen(t, { dim: false });
}

// ---------------------------------------------------------------- jobs
export function openJobs(app, back = () => openTitle(app)) {
  const p = app.profile;
  const { panel: pn, body } = panel({ title: 'Pick a job', size: '', extra: chip(p.money), onBack: back });
  const grid = el('div', { class: 'jobs' });
  for (const j of JOBS) {
    const open = unlocked(p, j);
    const card = el('button', { class: 'job-card' + (open ? '' : ' locked') });
    const best = p.best[j.id];
    const pay = p.done[j.id] ? Math.round(j.pay * 0.7) : j.pay;
    card.innerHTML = `<span class="num">Job ${j.n}</span>
      <div class="art" style="background:linear-gradient(135deg, ${j.colors[0]}, ${j.colors[1]})">${ICONS[j.icon] || ''}</div>
      ${p.done[j.id] ? '<span class="tick">Done</span>' : ''}
      <h3>${esc(j.name)}</h3><div class="client">${esc(j.client)}</div>
      <div class="quip">&ldquo;${esc(j.quip)}&rdquo;</div>
      <div class="facts"><span class="fact">Par ${time(j.par)}</span><span class="fact pay">${money(pay)}${p.done[j.id] ? ' (repeat)' : ''}</span>${best != null ? `<span class="fact best">Best ${time(best)}</span>` : ''}</div>
      ${open ? '' : `<div class="lock">Finish &ldquo;${esc(JOBS[j.n - 2].name)}&rdquo; to unlock</div>`}`;
    if (open) card.addEventListener('click', () => { sfx.click(); app.startJob(j.id); });
    grid.appendChild(card);
  }
  body.appendChild(grid);
  showScreen(pn);
}

// ---------------------------------------------------------------- shop
export function openShop(app, back = () => openTitle(app)) {
  const { panel: pn, body, head } = panel({ title: 'Upgrades', color: 'yellow', extra: chip(app.profile.money), onBack: back });
  const draw = () => {
    const p = app.profile;
    head.querySelector('.money-chip').textContent = money(p.money);
    body.innerHTML = '';
    const list = el('div', { class: 'shop-list' });
    for (const key of UPGRADE_ORDER) {
      const u = UPGRADES[key], lv = p.up[key] || 0, max = u.prices.length, price = upgradePrice(p, key);
      const row = el('div', { class: 'shop-row' });
      const fmt = (v) => (key === 'pressure' ? 'x' + v : u.unit === '°' ? v + '°' : v + ' ' + u.unit);
      const now = u.unit || key === 'pressure' ? fmt(u.values[lv]) : '';
      const nxt = now && price != null ? ` &rarr; ${fmt(u.values[lv + 1])}` : '';
      const extra = key === 'pressure' ? `, reach ${u.range[lv]} m${price != null ? ' &rarr; ' + u.range[lv + 1] + ' m' : ''}` : '';
      row.innerHTML = `<div class="ico">${ICONS[u.icon]}</div>
        <div><h4>${esc(u.name)} ${now ? `<span class="muted" style="font-size:15px">${now}${nxt}${extra}</span>` : ''}</h4><p>${esc(u.desc)}</p>
        <div class="pips">${Array.from({ length: max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div></div>
        <div class="buy"></div>`;
      const buy = row.querySelector('.buy');
      if (price == null) buy.innerHTML = `<span class="owned">${max > 1 ? 'Maxed' : 'Owned'}</span>`;
      else {
        const btn = el('button', { class: 'btn green', onclick: () => {
          const r = buyUpgrade(p, key);
          if (r.ok) { sfx.buy(); app.applyProfile(); toast(u.name + '!', 'good'); draw(); } else { sfx.bad(); toast(r.msg, 'bad'); }
        } }, money(price));
        if (p.money < price) btn.disabled = true;
        buy.appendChild(btn);
      }
      list.appendChild(row);
    }
    body.appendChild(list);
    body.appendChild(el('div', { class: 'section-title' }, 'Washer colour'));
    const sw = el('div', { class: 'swatches' });
    for (const c of COLORS) {
      const owned = p.colors.includes(c.id);
      const b = el('button', { class: 'swatch' + (p.color === c.id ? ' on' : '') },
        `<div class="dot" style="background:${c.hex}"></div>${esc(c.name)}<span class="p ${owned ? '' : 'no'}">${owned ? (p.color === c.id ? 'Using' : 'Owned') : money(c.price)}</span>`);
      b.addEventListener('click', () => {
        const r = buyColor(p, c.id);
        if (r.ok) { sfx[owned ? 'click' : 'buy'](); app.applyProfile(); draw(); } else { sfx.bad(); toast(r.msg, 'bad'); }
      });
      sw.appendChild(b);
    }
    body.appendChild(sw);
  };
  draw();
  showScreen(pn);
}

// ---------------------------------------------------------------- settings
function seg(options, value, onPick) {
  const s = el('div', { class: 'seg' });
  for (const [v, label] of options) s.appendChild(el('button', { class: v === value ? 'on' : '', onclick: () => { sfx.click(); onPick(v); } }, esc(label)));
  return s;
}
function row(label, sub, control) {
  const r = el('div', { class: 'set-row' });
  r.appendChild(el('div', { class: 'lbl' }, `${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}`));
  r.appendChild(control);
  return r;
}

export function openSettings(app, back) {
  const { panel: pn, body } = panel({ title: 'Settings', size: 'mid', color: 'grey', onBack: back });
  let confirmReset = false;
  const draw = () => {
    body.innerHTML = '';
    const q = settings.quality;
    body.appendChild(row('Graphics', q === 'auto' ? `Auto picked ${PRESETS[app.R.presetName].name}` : 'Low is best for Chromebooks',
      seg([['auto', 'Auto'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], q, (v) => { app.setQuality(v); draw(); })));
    body.appendChild(row('Shadows', 'One sun shadow (off on Low)', seg([['auto', 'Auto'], ['on', 'On'], ['off', 'Off']], settings.shadows, (v) => { settings.shadows = v; saveSettings(); app.applyQuality(); draw(); })));
    body.appendChild(row('FPS counter', 'Also F3', seg([[true, 'On'], [false, 'Off']], !!settings.fps, (v) => { settings.fps = v; saveSettings(); app.hud.setFps(v); draw(); })));
    const sens = el('input', { type: 'range', min: '0.3', max: '2.5', step: '0.05', value: String(settings.sens) });
    sens.addEventListener('input', () => { settings.sens = +sens.value; saveSettings(); });
    body.appendChild(row('Mouse speed', null, sens));
    body.appendChild(row('Invert mouse', null, seg([[false, 'Off'], [true, 'On']], !!settings.invertY, (v) => { settings.invertY = v; saveSettings(); draw(); })));
    const vol = el('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(settings.volume) });
    vol.addEventListener('input', () => { settings.volume = +vol.value; saveSettings(); setVolume(); });
    body.appendChild(row('Volume', null, vol));
    body.appendChild(row('Sound', null, seg([[false, 'On'], [true, 'Muted']], !!settings.mute, (v) => { settings.mute = v; saveSettings(); setVolume(); draw(); })));
    body.appendChild(row('Tutorial', app.profile.tutorial ? 'Seen' : 'Shows on your next job',
      el('button', { class: 'btn small', onclick: () => { sfx.click(); app.profile.tutorial = false; app.saveProfile(); toast('The tutorial will show on your next job.', 'info'); draw(); } }, 'Show again')));
    const rb = el('button', { class: 'btn small red', onclick: () => {
      if (!confirmReset) { confirmReset = true; sfx.bad(); rb.textContent = 'Sure? Click again'; return; }
      app.resetSave(); confirmReset = false; draw();
    } }, 'Delete my save');
    body.appendChild(row('Save', 'Money, upgrades and jobs are saved in this browser', rb));
  };
  draw();
  showScreen(pn);
}

// ---------------------------------------------------------------- start / pause
const KEYS_HTML = `
  <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> walk, <kbd>Space</kbd> jump</div>
  <div><kbd>Mouse</kbd> look around</div>
  <div><kbd>Left click</kbd> spray</div>
  <div><kbd>Right click</kbd> / <kbd>Shift</kbd> nozzle</div>
  <div><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> jet, fan, surface cleaner</div>
  <div><kbd>E</kbd> tap / move the washer</div>
  <div><kbd>Q</kbd> show missed spots</div>
  <div><kbd>Enter</kbd> finish at 95%, <kbd>Esc</kbd> pause</div>`;

export function openReady(app, job) {
  const d = job.def;
  const { panel: pn, body } = panel({ title: d.name, size: 'mid' });
  const pay = app.profile.done[d.id] ? Math.round(d.pay * 0.7) : d.pay;
  body.innerHTML = `<div class="start-card">
      <div class="client">${esc(d.client)}</div>
      <div class="quip">&ldquo;${esc(d.quip)}&rdquo;</div>
      <div class="facts"><span class="fact">Par ${time(d.par)}</span><span class="fact pay">Pays ${money(pay)} + bonuses</span><span class="fact">${job.surfaces.filter((s) => s.total).length} things to clean</span></div>
      <div class="keys">${KEYS_HTML}</div>
      <div class="go">Click to start</div>
      <div class="lock-msg"></div>
    </div>`;
  const wrap = showScreen(pn);
  wrap.style.cursor = 'pointer';
  wrap.addEventListener('click', () => { sfx.click(); app.lockAndPlay(); });
  app.lockMsg = body.querySelector('.lock-msg');
}

export function openPause(app) {
  const { panel: pn, body } = panel({ title: 'Paused', size: 'narrow', color: 'grey' });
  const box = el('div', { class: 'pause-btns' });
  box.appendChild(el('button', { class: 'btn big green', onclick: () => { sfx.click(); app.lockAndPlay(); } }, 'Resume'));
  box.appendChild(el('button', { class: 'btn yellow', onclick: () => { sfx.click(); openShop(app, () => openPause(app)); } }, 'Upgrades'));
  box.appendChild(el('button', { class: 'btn', onclick: () => { sfx.click(); openSettings(app, () => openPause(app)); } }, 'Settings'));
  box.appendChild(el('button', { class: 'btn orange', onclick: () => { sfx.click(); app.restartJob(); } }, 'Restart job'));
  box.appendChild(el('button', { class: 'btn red', onclick: () => { sfx.click(); app.quitJob(); } }, 'Quit to menu'));
  body.appendChild(box);
  if (app.job) body.appendChild(el('div', { class: 'muted', style: 'text-align:center;margin-top:12px' }, `${esc(app.job.def.name)}: ${pct(app.job.progress)} clean, ${time(app.job.time)}`));
  const msg = el('div', { class: 'lock-msg', style: 'text-align:center' });
  body.appendChild(msg);
  app.lockMsg = msg;
  showScreen(pn);
}

// ---------------------------------------------------------------- results
export function openResults(app, job, out) {
  const d = job.def, { pay, newBest, firstTime } = out;
  const { panel: pn, body } = panel({ title: 'Sparkling!', color: 'green', size: 'mid', extra: chip(app.profile.money) });
  const lines = [
    ['Job pay' + (pay.repeat ? ' (repeat, 70%)' : ''), pay.base],
    [job.time <= d.par ? 'Speed bonus' : `Speed bonus (beat ${time(d.par)})`, pay.speed],
    [job.allDone ? 'No missed spots' : 'No missed spots (clean 100%)', pay.spots],
  ];
  body.innerHTML = `<div class="results">
      <div class="big-time">
        <div class="stat"><b>${time(job.time)}</b><span>Your time</span></div>
        <div class="stat"><b>${time(d.par)}</b><span>Par</span></div>
        <div class="stat"><b>${pct(job.progress)}</b><span>Clean</span></div>
      </div>
      <div class="pay-lines">
        ${lines.map(([l, v], i) => `<div class="pay-line" style="animation-delay:${0.15 + i * 0.25}s"><span>${esc(l)}</span><span class="${v ? '' : 'no'}">${v ? '+' + money(v) : '-'}</span></div>`).join('')}
        <div class="pay-line total" style="animation-delay:${0.15 + lines.length * 0.25}s"><span>Total</span><span>${money(pay.total)}</span></div>
      </div>
      ${newBest && !firstTime ? '<div class="new-best">New best time!</div>' : ''}
      <div class="unlock"></div>
    </div>`;
  const idx = JOBS.indexOf(d);
  const next = JOBS[idx + 1];
  if (firstTime && next) body.querySelector('.unlock').innerHTML = `<div class="new-best" style="color:#8ff2ff">New job unlocked: ${esc(next.name)}</div>`;
  if (firstTime && !next) body.querySelector('.unlock').innerHTML = `<div class="new-best">That's every job done. Britain sparkles!</div>`;
  const rowb = el('div', { class: 'row-btns' });
  if (next && unlocked(app.profile, next)) rowb.appendChild(el('button', { class: 'btn green', onclick: () => { sfx.click(); app.startJob(next.id); } }, 'Next job'));
  rowb.appendChild(el('button', { class: 'btn yellow', onclick: () => { sfx.click(); openShop(app, () => openResults(app, job, out)); } }, 'Upgrades'));
  rowb.appendChild(el('button', { class: 'btn', onclick: () => { sfx.click(); app.startJob(d.id); } }, 'Do it again'));
  rowb.appendChild(el('button', { class: 'btn grey', onclick: () => { sfx.click(); app.toTitle(); } }, 'Menu'));
  body.appendChild(rowb);
  showScreen(pn);
  setTimeout(() => sfx.coin(), 900);
}

// ---------------------------------------------------------------- loading overlay
let busyEl = null;
export function showBusy(text) {
  hideBusy();
  busyEl = el('div', { class: 'busy' }, `<div><div class="spin"></div>${esc(text)}</div>`);
  $ui().appendChild(busyEl);
}
export function hideBusy() { if (busyEl) { busyEl.remove(); busyEl = null; } }
export { closeScreen };
