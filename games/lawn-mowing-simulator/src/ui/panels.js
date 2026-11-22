// All pop-up panels: shop, job board, stats, settings, results, pause, credits.
import { el, esc, money, pct, time, stars, modal, closeModal, redrawModal, toast, confirmBox, modalOpen } from './ui.js';
import { icon } from './icons.js';
import { sfx, setVolume } from '../core/audio.js';
import { settings, saveSettings } from '../core/store.js';
import { MOWERS, MOWER_IDS, UPGRADES, UPGRADE_IDS, MAX_UPGRADE, upgradeCost, upgradeApplies, mowerStats } from '../shared/mowers.js';
import { LEVELS, LEVEL_IDS } from '../shared/levels.js';
import { levelGrid } from '../shared/lawn.js';
import { PAINTS, HATS, OUTFITS, PETS } from '../shared/cosmetics.js';
import { WEATHER, CHALLENGES, parTime } from '../shared/rules.js';
import { TIERS, tierFor, LEVEL_REP } from '../shared/career.js';
import { PATTERNS, PATTERN_IDS, patternMask } from '../shared/patterns.js';
import { streakMult } from '../shared/daily.js';
import { utcDate } from '../shared/rng.js';
import { CAM_MODES, CAM_NAMES } from '../game/camera.js';
import { PRESETS } from '../render/renderer.js';
import { VERSION } from '../config.js';

const area = (id) => Math.round(levelGrid(id).area);
const turnText = (m) => (m.turn.pivot ? 'Spins on the spot' : `Turns like a car (${m.turn.radius} m)`);

// ---------------------------------------------------------------- shop
export function openShop(app, tab = 'mowers') {
  const head = () => `<span class="money-small">${money(app.profile.money)}</span>`;
  modal({
    title: 'Shop', icon: 'shop', color: '', headExtra: head(), tab,
    tabs: [['mowers', 'Mowers'], ['upgrades', 'Upgrades'], ['places', 'Places'], ['paint', 'Colours'], ['hat', 'Hats'], ['outfit', 'Outfits'], ['pets', 'Pets']],
    onClose: () => app.panelClosed(),
    render(body, t) {
      const m = document.querySelector('.panel-head .money-small');
      if (m) m.textContent = money(app.profile.money);
      const p = app.profile;
      const act = async (fn, okMsg) => {
        try { const prof = await fn(); app.setProfile(prof); sfx.buy(); if (okMsg) toast(okMsg, 'good'); redrawModal(); return true; }
        catch (e) { sfx.bad(); toast(e.message, 'bad'); return false; }
      };
      if (t === 'mowers') {
        const grid = el('div', { class: 'grid' });
        for (const id of MOWER_IDS) {
          const M = MOWERS[id], own = !!p.mowers[id], on = p.eq.mower === id;
          const st = mowerStats(id, own ? p.mowers[id].up : {});
          const c = el('div', { class: 'card' + (on ? ' on' : '') + (!own && p.money < M.price ? ' locked' : '') });
          c.innerHTML = `<div class="icon-box">${icon('mower')}</div><h3>${esc(M.name)}</h3><p>${esc(M.desc)}</p>
            <div class="stat"><span>Cutting width</span><b>${st.width.toFixed(2)} m</b></div>
            <div class="stat"><span>Top speed</span><b>${(st.speed * 3.6).toFixed(1)} km/h</b></div>
            <div class="stat"><span>Catcher</span><b>${Number.isFinite(st.catcher) ? Math.round(st.catcher) + ' L' : 'Mulches'}</b></div>
            <div class="stat"><span>${M.engine === 'electric' ? 'Battery' : 'Fuel'}</span><b>${st.fuel ? Math.round(st.fuel / 60 * 10) / 10 + ' min' : 'None needed'}</b></div>
            <div class="stat"><span>Turning</span><b>${turnText(M)}</b></div>`;
          const acts = el('div', { class: 'acts' });
          if (!own) acts.appendChild(el('button', { class: 'btn small', onclick: () => act(() => app.backend.buy('mower', id), `${M.name} bought!`).then((ok) => ok && app.equip('mower', id)) }, `Buy ${money(M.price)}`));
          else if (!on) acts.appendChild(el('button', { class: 'btn small blue', onclick: () => app.equip('mower', id).then(redrawModal) }, 'Use'));
          else acts.appendChild(el('span', { class: 'tag' }, 'In use'));
          c.appendChild(acts);
          grid.appendChild(c);
        }
        body.appendChild(grid);
      } else if (t === 'upgrades') {
        const pickRow = el('div', { class: 'mower-pick' });
        const sel = app.shopMower && p.mowers[app.shopMower] ? app.shopMower : p.eq.mower;
        for (const id of MOWER_IDS) if (p.mowers[id]) pickRow.appendChild(el('button', { class: 'btn small ' + (id === sel ? '' : 'grey'), onclick: () => { app.shopMower = id; redrawModal(); } }, esc(MOWERS[id].name)));
        body.appendChild(pickRow);
        const up = p.mowers[sel].up;
        for (const k of UPGRADE_IDS) {
          if (!upgradeApplies(sel, k)) continue;
          const lv = up[k], cost = upgradeCost(sel, k, lv);
          const row = el('div', { class: 'upg' });
          row.innerHTML = `<div><b style="font-size:18px">${esc(UPGRADES[k].name)}</b> <span class="muted">${esc(UPGRADES[k].desc)}</span>
            <div class="pips">${Array.from({ length: MAX_UPGRADE }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div></div>`;
          row.appendChild(cost == null ? el('span', { class: 'tag' }, 'MAX') : el('button', { class: 'btn small', onclick: () => act(() => app.backend.upgrade(sel, k), `${UPGRADES[k].name} upgraded!`).then(() => app.refreshVehicle()) }, money(cost)));
          body.appendChild(row);
        }
      } else if (t === 'places') {
        const grid = el('div', { class: 'grid' });
        for (const id of LEVEL_IDS) {
          const L = LEVELS[id], own = p.levels.includes(id);
          const c = el('div', { class: 'card' + (own ? '' : ' locked') });
          c.innerHTML = `<h3>${esc(L.name)}</h3><p>${esc(L.desc)}</p>
            <div class="stat"><span>Lawn</span><b>${area(id)} m²</b></div><div class="stat"><span>Pay from</span><b>${money(L.basePay)}</b></div>
            ${L.recommend ? `<div class="stat"><span>Best with</span><b>${esc(MOWERS[L.recommend].name)}</b></div>` : ''}
            ${!own ? `<div class="stat"><span>Career contract</span><b>${LEVEL_REP[id]} rep</b></div>` : ''}`;
          const acts = el('div', { class: 'acts' });
          if (own) acts.appendChild(el('button', { class: 'btn small blue', onclick: () => { closeModal(true); app.startJob({ mode: 'free', level: id, weather: 'sunny' }); } }, 'Mow here'));
          else acts.appendChild(el('button', { class: 'btn small', onclick: () => act(() => app.backend.buy('level', id), `${L.short} unlocked!`) }, `Buy ${money(L.price)}`));
          c.appendChild(acts);
          grid.appendChild(c);
        }
        body.appendChild(grid);
      } else {
        const kind = t === 'pets' ? 'pet' : t;
        const table = { paint: PAINTS, hat: HATS, outfit: OUTFITS, pet: PETS }[kind];
        const grid = el('div', { class: 'grid' });
        for (const [id, item] of Object.entries(table)) {
          const own = p.cos[kind].includes(id), on = p.eq[kind] === id;
          const c = el('div', { class: 'card' + (on ? ' on' : '') });
          let pic = '';
          if (kind === 'paint') pic = `<div class="swatch" style="background:${item.color}"></div>`;
          else if (kind === 'outfit') pic = `<div class="swatch" style="background:linear-gradient(${item.shirt} 55%, ${item.pants} 55%)"></div>`;
          else pic = `<div class="icon-box">${icon(kind === 'pet' ? 'paw' : 'trophy')}</div>`;
          c.innerHTML = `${pic}<h3>${esc(item.name)}</h3>${!own ? `<div class="price">${item.price ? money(item.price) : 'Free'}</div>` : ''}`;
          const acts = el('div', { class: 'acts' });
          if (!own) acts.appendChild(el('button', { class: 'btn small', onclick: () => act(() => app.backend.buy(kind, id), `${item.name} bought!`).then(() => app.refreshVehicle()) }, 'Buy'));
          else if (!on) acts.appendChild(el('button', { class: 'btn small blue', onclick: () => app.equip(kind, id).then(redrawModal) }, 'Use'));
          else acts.appendChild(el('span', { class: 'tag' }, 'In use'));
          c.appendChild(acts);
          grid.appendChild(c);
        }
        body.appendChild(grid);
      }
    },
  });
}

// ---------------------------------------------------------------- job board
function weatherTags(w) { return w === 'sunny' ? '' : `<span class="tag ${w}">${esc(WEATHER[w].name)}</span>`; }
function kindTag(k) { return k === 'standard' ? '' : `<span class="tag ${k}">${esc(CHALLENGES[k].name)}</span>`; }

export function drawPattern(canvas, levelId, patternId) {
  const G = levelGrid(levelId);
  const m = patternMask(levelId, patternId);
  const w = 64, h = Math.max(16, Math.round(64 * G.nz / G.nx));
  canvas.width = w; canvas.height = h;
  const g = canvas.getContext('2d');
  const img = g.createImageData(w, h);
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const i = Math.min(G.nx - 1, Math.floor(((w - 1 - px) / w) * G.nx)), j = Math.min(G.nz - 1, Math.floor(((h - 1 - py) / h) * G.nz));
    const k = j * G.nx + i, o = (py * w + px) * 4;
    const c = !G.mow[k] ? [70, 120, 60] : m[k] ? [180, 240, 120] : [40, 120, 34];
    img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}

export function openJobs(app, tab = 'career') {
  modal({
    title: 'Jobs', icon: 'jobs', color: 'green', tab,
    tabs: [['career', 'Career'], ['free', 'Free Mow'], ['daily', 'Daily Challenge'], ['pattern', 'Mow a Pattern']],
    onClose: () => app.panelClosed(),
    render(body, t) {
      const p = app.profile;
      if (t === 'career') {
        const tier = tierFor(p.career.rep);
        const next = tier.next;
        body.innerHTML = `<div class="sec-title">${esc(tier.name)} <span class="muted" style="font-size:16px">Reputation ${Math.round(p.career.rep)} / 100 &middot; pay x${tier.mult.toFixed(2)}</span></div>
          <div class="bar" style="margin-bottom:6px"><i style="width:${p.career.rep}%"></i></div>
          <p class="muted" style="margin:0 0 12px">${next ? `Reach ${next.rep} reputation to become a ${esc(next.name)} (pay x${next.mult.toFixed(2)}).` : 'You are a Lawn Legend!'} Good reviews raise your reputation; bigger customers call once you are trusted.</p>`;
        for (const o of p.career.offers) {
          const L = LEVELS[o.level];
          const card = el('div', { class: 'card offer', style: 'margin-bottom:10px' });
          const est = Math.round(L.basePay * o.mult * tier.mult * WEATHER[o.weather].pay * 1.25);
          card.innerHTML = `<div><h3>${esc(o.customer)} <span class="muted" style="font-size:15px">- ${esc(L.name)}</span></h3>
            <p style="margin:4px 0">${o.isNew ? '<span class="tag new">NEW PLACE</span>' : ''}${kindTag(o.kind)}${weatherTags(o.weather)}${o.pattern ? `<span class="tag">${esc(PATTERNS[o.pattern].name)}</span>` : ''}</p>
            <p>"${esc(o.note)}"</p></div>`;
          const right = el('div', { style: 'text-align:right' }, `<div class="price">about ${money(est)}</div>`);
          right.appendChild(el('button', { class: 'btn', onclick: () => { closeModal(true); app.startJob({ mode: 'career', offerId: o.id }); } }, 'Accept'));
          card.appendChild(right);
          body.appendChild(card);
        }
        body.appendChild(el('button', { class: 'btn small grey', onclick: async () => { try { app.setProfile(await app.backend.newOffers()); redrawModal(); } catch (e) { toast(e.message, 'bad'); } } }, 'Different offers'));
        const rv = p.career.reviews.slice(-5).reverse();
        if (rv.length) {
          body.appendChild(el('div', { class: 'sec-title' }, 'Latest reviews'));
          for (const r of rv) body.appendChild(el('div', { class: 'review' }, `${stars(r.stars, 5)} <b>${esc(r.customer)}</b><div>${esc(r.text)}</div>`));
        }
      } else if (t === 'free') {
        const sel = app.freeSel || (app.freeSel = { weather: 'sunny' });
        const wrow = el('div', { class: 'setting' }, '<b>Weather</b>');
        const seg = el('div', { class: 'seg' });
        for (const w of Object.keys(WEATHER)) seg.appendChild(el('button', { class: w === sel.weather ? 'on' : '', onclick: () => { sel.weather = w; redrawModal(); } }, `${esc(WEATHER[w].name)}${WEATHER[w].pay > 1 ? ` (+${Math.round((WEATHER[w].pay - 1) * 100)}%)` : ''}`));
        wrow.appendChild(seg);
        body.appendChild(wrow);
        const mrow = el('div', { class: 'setting' }, `<b>Mower</b><span>${esc(MOWERS[p.eq.mower].name)} <button class="btn small grey" id="chg-mower">Change</button></span>`);
        body.appendChild(mrow);
        mrow.querySelector('#chg-mower').onclick = () => { closeModal(true); app.openShop('mowers'); };
        const grid = el('div', { class: 'grid', style: 'margin-top:12px' });
        for (const id of LEVEL_IDS) {
          const L = LEVELS[id], own = p.levels.includes(id);
          const st = mowerStats(p.eq.mower, p.mowers[p.eq.mower].up);
          const par = parTime(L, levelGrid(id), st, sel.weather);
          const c = el('div', { class: 'card' + (own ? '' : ' locked') });
          c.innerHTML = `<h3>${esc(L.short)}</h3><div class="stat"><span>Lawn</span><b>${area(id)} m²</b></div>
            <div class="stat"><span>About</span><b>${time(par)} with your mower</b></div><div class="stat"><span>Best score</span><b>${p.stats.best[id] || '-'}</b></div>`;
          const acts = el('div', { class: 'acts' });
          if (own) acts.appendChild(el('button', { class: 'btn small', onclick: () => { closeModal(true); app.startJob({ mode: 'free', level: id, weather: sel.weather }); } }, 'Mow'));
          else acts.appendChild(el('button', { class: 'btn small grey', onclick: () => { closeModal(true); app.openShop('places'); } }, `Unlock ${money(L.price)}`));
          c.appendChild(acts);
          grid.appendChild(c);
        }
        body.appendChild(grid);
      } else if (t === 'daily') {
        const d = app.daily;
        const L = LEVELS[d.level];
        const done = p.daily.last === d.date;
        const streakNext = done ? p.daily.streak : (p.daily.last && p.daily.last === yesterday(d.date) ? p.daily.streak + 1 : 1);
        body.innerHTML = `<div class="sec-title">${esc(new Date(d.date + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }))}</div>
          <div class="card"><h3>${esc(L.name)}</h3>
          <p>${kindTag(d.kind) || '<span class="tag">Standard job</span>'}${weatherTags(d.weather)}${d.pattern ? `<span class="tag">${esc(PATTERNS[d.pattern].name)}</span>` : ''}</p>
          <div class="stat"><span>Mower (given to you)</span><b>${esc(MOWERS[d.mower].name)}</b></div>
          <div class="stat"><span>Reward</span><b>x${(d.mult * streakMult(streakNext)).toFixed(1)} pay</b></div>
          <div class="stat"><span>Your streak</span><b>${p.daily.streak} day${p.daily.streak === 1 ? '' : 's'} (best ${p.daily.bestStreak || 0})</b></div>
          <div class="stat"><span>Your best today</span><b>${p.daily.scores[d.date] || '-'}</b></div>
          <p>${done ? 'Done for today! You can play again for a better score (smaller reward).' : 'Finish with at least 1 star to keep your streak going. Everyone gets the same challenge today.'}</p></div>`;
        const b = el('div', { class: 'row-btns' });
        b.appendChild(el('button', { class: 'btn big', onclick: () => { closeModal(true); app.startJob({ mode: 'daily' }); } }, done ? 'Play again' : 'Play the daily'));
        body.appendChild(b);
      } else if (t === 'pattern') {
        const places = LEVEL_IDS.filter((id) => LEVELS[id].patternOk);
        const sel = app.patSel || (app.patSel = { level: places.find((id) => p.levels.includes(id)) || places[0], pattern: PATTERN_IDS[0] });
        body.innerHTML = `<p class="muted" style="margin-top:0">Cut only the light shape into the lawn. Cutting outside the shape loses points.</p>`;
        const lrow = el('div', { class: 'seg', style: 'margin-bottom:12px' });
        for (const id of places) {
          const own = p.levels.includes(id);
          lrow.appendChild(el('button', { class: id === sel.level ? 'on' : '', disabled: !own, title: own ? '' : 'Unlock this place first', onclick: () => { sel.level = id; redrawModal(); } }, esc(LEVELS[id].short) + (own ? '' : ' (locked)')));
        }
        body.appendChild(lrow);
        const grid = el('div', { class: 'grid' });
        for (const pid of PATTERN_IDS) {
          const c = el('div', { class: 'card' + (pid === sel.pattern ? ' on' : ''), style: 'cursor:pointer' });
          const cv = el('canvas', { class: 'pattern-prev' });
          c.appendChild(cv);
          c.appendChild(el('h3', {}, esc(PATTERNS[pid].name)));
          c.onclick = () => { sel.pattern = pid; redrawModal(); };
          grid.appendChild(c);
          if (p.levels.includes(sel.level)) drawPattern(cv, sel.level, pid);
        }
        body.appendChild(grid);
        const b = el('div', { class: 'row-btns' });
        b.appendChild(el('button', { class: 'btn big', disabled: !p.levels.includes(sel.level), onclick: () => { closeModal(true); app.startJob({ mode: 'pattern', level: sel.level, pattern: sel.pattern }); } }, 'Start mowing'));
        body.appendChild(b);
      }
    },
  });
}

function yesterday(date) { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); }

// ---------------------------------------------------------------- stats
export function openStats(app) {
  const p = app.profile, s = p.stats;
  modal({
    title: 'Stats', icon: 'stats', color: 'orange', narrow: false, onClose: () => app.panelClosed(),
    render(body) {
      {
        const tier = tierFor(p.career.rep);
        body.innerHTML = `<div class="kv">
          <span>Money now</span><b>${money(p.money)}</b>
          <span>Total earned</span><b>${money(p.earned)}</b>
          <span>Jobs done</span><b>${s.jobs}</b>
          <span>Grass mowed</span><b>${Math.round(s.area).toLocaleString('en-GB')} m²</b>
          <span>Time mowing</span><b>${time(s.time)}</b>
          <span>Stars earned</span><b>${s.stars}</b>
          <span>Perfect lawns (100%)</span><b>${s.perfect}</b>
          <span>Patterns mown</span><b>${s.patterns}</b>
          <span>Clippings composted</span><b>${Math.round(s.dumped).toLocaleString('en-GB')} L</b>
          <span>Daily streak (best)</span><b>${p.daily.streak} (${p.daily.bestStreak || 0})</b>
          <span>Career</span><b>${esc(tier.name)}, ${p.career.jobs} jobs</b>
          <span>Mowers owned</span><b>${Object.keys(p.mowers).length} / ${MOWER_IDS.length}</b>
          <span>Places unlocked</span><b>${p.levels.length} / ${LEVEL_IDS.length}</b></div>
          <div class="sec-title">Best scores</div>
          <div class="kv">${LEVEL_IDS.map((id) => `<span>${esc(LEVELS[id].short)}</span><b>${s.best[id] || '-'}</b>`).join('')}</div>
          <p class="muted">Your progress is saved in this browser on this device.</p>`;
      }
    },
  });
}

// ---------------------------------------------------------------- settings
export function openSettings(app) {
  modal({
    title: 'Settings', icon: 'gear', color: 'grey', onClose: () => app.panelClosed(),
    tabs: [['game', 'Game'], ['save', 'Save'], ['controls', 'Controls'], ['credits', 'Credits']],
    render(body, t) {
      if (t === 'game') {
        const seg = (label, opts, cur, fn, note = '') => {
          const row = el('div', { class: 'setting' }, `<div><b>${esc(label)}</b>${note ? `<div class="muted" style="font-size:14px">${note}</div>` : ''}</div>`);
          const s = el('div', { class: 'seg' });
          for (const [v, l] of opts) s.appendChild(el('button', { class: v === cur ? 'on' : '', onclick: () => { sfx.click(); fn(v); redrawModal(); } }, esc(l)));
          row.appendChild(s);
          body.appendChild(row);
        };
        seg('Graphics', [['auto', 'Auto'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], settings.quality, (v) => app.setQuality(v),
          `Now: ${esc(app.R.preset.name)}${settings.quality === 'auto' ? ' (picked from your frame rate)' : ''}. Low is best for school Chromebooks.`);
        seg('FPS counter', [[false, 'Off'], [true, 'On']], settings.fps, (v) => { settings.fps = v; saveSettings(); });
        seg('Minimap', [[true, 'On'], [false, 'Off']], settings.minimap, (v) => { settings.minimap = v; saveSettings(); app.hud.setMode(!!app.job); });
        seg('Camera', CAM_MODES.map((m) => [m, CAM_NAMES[m]]), settings.camera, (v) => { settings.camera = v; saveSettings(); app.camRig.setMode(v); app.vehicle.setFirstPerson(v === 'first'); });
        seg('Sound', [[0, 'Off'], [0.35, 'Quiet'], [0.7, 'Normal'], [1, 'Loud']], settings.mute ? 0 : settings.volume, (v) => { settings.mute = v === 0; if (v) settings.volume = v; saveSettings(); setVolume(); });
      } else if (t === 'save') {
        body.innerHTML = `<p style="font-size:18px;margin-top:0">Your progress saves by itself in this browser on this device.</p>
          <p class="muted">Clearing your browser data, or playing on another device or browser, starts a new save.</p>`;
        body.appendChild(el('div', { class: 'sec-title', style: 'margin-top:24px' }, 'Start again'));
        body.appendChild(el('button', { class: 'btn red small', onclick: async () => { if (await confirmBox('Delete your save?', 'This deletes all your money, mowers, places and stats on this device. It cannot be undone.', 'Delete')) { closeModal(true); app.resetSave(); } } }, 'Delete my save'));
      } else if (t === 'controls') {
        body.innerHTML = `<div class="keys">
          <kbd>W / Up</kbd><span>Drive forward</span><kbd>S / Down</kbd><span>Reverse</span><kbd>A D / Left Right</kbd><span>Steer</span>
          <kbd>Space</kbd><span>Brake</span><kbd>C</kbd><span>Change camera (behind, top-down, first person)</span>
          <kbd>Drag / Scroll</kbd><span>Look around / zoom (mouse or trackpad)</span><kbd>M</kbd><span>Minimap on / off</span>
          <kbd>F</kbd><span>Finish the job (from 85%)</span><kbd>R</kbd><span>Back to the start if you get stuck</span><kbd>Esc / P</kbd><span>Pause</span>
          <kbd>Gamepad</kbd><span>Left stick steer, RT drive, LT reverse, A action, Y camera, Start pause</span>
          <kbd>Touch</kbd><span>Stick bottom left (up = drive), drag the screen to look</span></div>
          <p class="muted">Stop near the compost bin to empty a full grass catcher, and near the fuel stand to refuel or recharge.</p>`;
      } else {
        renderCredits(body);
      }
    },
  });
}

export function renderCredits(body) {
  body.innerHTML = `<div class="credits">
    <p><b>Lawn Mowing Simulator</b> v${VERSION} - made for SahurHub.</p>
    <p><b>3D models:</b> every mower, character, hat, pet, house, tree, flower, fence, gnome, toy and prop was made for this game in Blender (original low-poly models, one shared colour palette, no downloaded models).</p>
    <p><b>Sounds:</b> made live in your browser with the Web Audio API (no sound files).</p>
    <p><b>Textures:</b> none - grass, paths and water are drawn by the game's own shaders.</p>
    <p><b>Open-source code and fonts used:</b></p>
    <p>three.js r170 - 3D engine. MIT License. <a href="https://threejs.org" target="_blank" rel="noopener">threejs.org</a></p>
    <p>meshoptimizer decoder (included with three.js) - model compression. MIT License, by Arseny Kapoulkine. <a href="https://github.com/zeux/meshoptimizer" target="_blank" rel="noopener">github.com/zeux/meshoptimizer</a></p>
    <p>Fredoka font - by Milena Brandão and Hafontia. SIL Open Font License 1.1, via Google Fonts. <a href="https://fonts.google.com/specimen/Fredoka" target="_blank" rel="noopener">fonts.google.com</a></p></div>`;
}

// ---------------------------------------------------------------- pause
export function openPause(app) {
  modal({
    title: 'Paused', icon: 'pause', color: 'grey', narrow: true, onClose: () => app.resume(),
    render(body) {
      const col = el('div', { class: 'form' });
      col.appendChild(el('button', { class: 'btn', onclick: () => closeModal() }, 'Resume'));
      col.appendChild(el('button', { class: 'btn blue', onclick: () => { closeModal(true); app.restartJob(); } }, 'Restart this job'));
      col.appendChild(el('button', { class: 'btn orange', onclick: () => { closeModal(true); openSettings(app); } }, 'Settings'));
      col.appendChild(el('button', { class: 'btn red', onclick: async () => { closeModal(true); if (await confirmBox('Quit job?', 'Quit this job? You will not be paid for it.', 'Quit')) app.quitJob(); else app.resume(); } }, 'Quit job'));
      body.appendChild(col);
    },
  });
}

// ---------------------------------------------------------------- results
export function openResults(app, job, out) {
  const r = out.result, pay = out.pay;
  const L = LEVELS[job.cfg.level];
  modal({
    title: r.failed ? 'Job failed' : r.stars === 3 ? 'Amazing job!' : 'Job done!', color: r.failed ? 'red' : 'green', icon: 'trophy', closable: false,
    render(body) {
      const isPat = job.cfg.kind === 'pattern';
      body.innerHTML = `<div class="result-stars">${[0, 1, 2].map((i) => `<span data-i="${i}">★</span>`).join('')}</div>
        ${r.failed ? `<div class="result-big" style="color:#ff8a8a">${esc(r.failed)}</div>` : ''}
        <div class="result-pay">+${money(pay.total)}</div>
        <div style="display:grid;grid-template-columns:1fr auto;gap:14px;align-items:start">
        <div class="kv">
          <span>${isPat ? 'Pattern cut' : 'Grass mowed'}</span><b>${r.coverage >= 0.995 ? '100%' : pct(Math.min(0.99, r.coverage))}</b>
          ${isPat ? `<span>Cut outside the shape</span><b>${pct(r.wrong)}</b>` : `<span>Neat straight lines</span><b>${pct(r.neat)}</b>`}
          <span>Time</span><b>${time(r.time)} <span class="muted">(par ${time(r.par)})</span></b>
          <span>Penalties</span><b>${r.pen ? '-' + r.pen + ' pts' : 'None'}</b>
          <span>Score</span><b>${r.score} / 1000</b>
          <span>Pay</span><b>${money(pay.base)}</b>
          ${pay.compost ? `<span>Compost bonus</span><b>+${money(pay.compost)}</b>` : ''}
          ${pay.penalty ? `<span>Damage costs</span><b style="color:#ff8a8a">-${money(pay.penalty)}</b>` : ''}
          ${out.streak ? `<span>Daily streak</span><b>${out.streak} day${out.streak === 1 ? '' : 's'}!</b>` : ''}
          ${out.best ? `<span>New best score!</span><b>${esc(L.short)}</b>` : ''}
        </div><canvas class="res-map" style="width:150px;border-radius:10px;image-rendering:pixelated"></canvas></div>
        ${out.unlocked ? `<div class="review" style="background:#ffd23f"><b>New place unlocked: ${esc(LEVELS[out.unlocked].name)}!</b></div>` : ''}
        ${out.review ? `<div class="review">${stars(out.review.stars, 5)} <b>${esc(out.review.customer)}</b><div>"${esc(out.review.text)}"</div></div>` : ''}`;
      const row = el('div', { class: 'row-btns' });
      row.appendChild(el('button', { class: 'btn grey', onclick: () => { closeModal(true); app.afterResults('board'); } }, 'Job board'));
      row.appendChild(el('button', { class: 'btn blue', onclick: () => { closeModal(true); app.afterResults('again'); } }, 'Mow again'));
      if (job.cfg.mode === 'career') row.appendChild(el('button', { class: 'btn', onclick: () => { closeModal(true); app.afterResults('career'); } }, 'Next customer'));
      else row.appendChild(el('button', { class: 'btn', onclick: () => { closeModal(true); app.afterResults('home'); } }, 'Continue'));
      body.appendChild(row);
      // final lawn picture, missed patches in red
      const cv = body.querySelector('.res-map');
      const G = job.G, d = job.world.ground.data, pat = job.pattern;
      const s = 140 / Math.max(G.nx, G.nz), w = Math.max(8, Math.round(G.nx * s)), h = Math.max(8, Math.round(G.nz * s));
      cv.width = w; cv.height = h;
      const g = cv.getContext('2d'), img = g.createImageData(w, h);
      for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
        const i = Math.min(G.nx - 1, Math.floor(((w - 1 - px) / w) * G.nx)), j = Math.min(G.nz - 1, Math.floor(((h - 1 - py) / h) * G.nz));
        const k = j * G.nx + i, o = (py * w + px) * 4;
        let c = [60, 110, 50];
        if (G.mow[k]) {
          const cut = job.sim.cut[k];
          if (pat) c = pat[k] ? (cut ? [140, 225, 90] : [235, 60, 50]) : (cut ? [240, 150, 60] : [44, 120, 34]);
          else c = cut ? [128, 214, 82] : [235, 60, 50];
        } else if (G.surf[k] !== 0 && G.surf[k] !== 1) c = [170, 165, 155];
        img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      // stars pop in one by one
      const spans = body.querySelectorAll('.result-stars span');
      for (let i = 0; i < r.stars; i++) setTimeout(() => { spans[i].classList.add('on'); sfx.star(i); }, 350 + i * 380);
    },
  });
}
