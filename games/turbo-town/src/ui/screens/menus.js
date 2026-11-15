// TURBO TOWN - menu screens.
import { h, btn, header, statBar, icon } from '../ui.js';
import { KARTS, KART_BY_ID } from '../../shared/karts.js';
import { DRIVERS, CUPS, MAP_INFO, AI_DIFFICULTIES, levelFromXp } from '../../shared/rules.js';
import { MAP_BY_ID } from '../../maps/index.js';
import { fmtTime } from '../hud.js';
import { saveSettings } from '../../save/settings.js';
import { QUALITY } from '../../render/renderer.js';
import { Multiplayer } from './online.js';
import { PAINTS, WHEELS, ACCS, TITLES, FRAMES, BOOSTS } from '../../shared/cosmetics.js';
import { ACHIEVEMENTS } from '../../shared/achievements.js';

const SEASON_COLORS = { spring: '#ff7ab8', summer: '#ffb02e', autumn: '#ff6b2c', winter: '#4fc3ff' };
const STAT_NAMES = [['speed', 'Speed'], ['accel', 'Acceleration'], ['handling', 'Handling'], ['drift', 'Drift'], ['braking', 'Braking'], ['weight', 'Weight'], ['offroad', 'Off-road'], ['grip', 'Grip']];

function topBar(app) {
  const p = app.profile.get();
  const lv = levelFromXp(p.xp);
  return h('div', { class: 'topbar' },
    h('div', { class: 'chip' }, h('span', { html: icon('user') }), p.name),
    h('div', { class: 'chip level' }, 'Lv ' + lv.level, h('span', { class: 'xpbar' }, h('i', { style: { width: (lv.into / lv.need * 100) + '%' } }))),
    h('div', { class: 'chip coins' }, h('span', { html: icon('coin') }), String(p.coins)),
    app.profile.dev ? h('div', { class: 'chip dev' }, 'Test mode (this PC only)') : null);
}

// ------------------------------------------------------------------ main menu

export function MainMenu(ui) {
  const app = ui.app;
  const el = h('div', { class: 'menu-main' },
    topBar(app),
    h('div', { class: 'menu-left' },
      h('div', { class: 'logo small' }, h('span', { class: 'logo-a' }, 'TURBO'), h('span', { class: 'logo-b' }, 'TOWN')),
      btn({ label: 'Play', sub: 'Quick race, jump straight in', icon: 'play', cls: 'big', color: '#ff4f9a', onClick: () => app.quickRace() }),
      h('div', { class: 'grid2' },
        btn({ label: 'Grand Prix', icon: 'trophy', color: '#ffb02e', onClick: () => ui.show(KartSelect, { next: () => ui.show(CupSelect) }) }),
        btn({ label: 'Single Race', icon: 'flag', color: '#3ddc84', onClick: () => ui.show(KartSelect, { next: () => ui.show(MapSelect, { mode: 'single' }) }) }),
        btn({ label: 'Time Trials', icon: 'clock', color: '#2fb6ff', onClick: () => ui.show(KartSelect, { next: () => ui.show(MapSelect, { mode: 'tt' }) }) }),
        btn({ label: 'Multiplayer', icon: 'users', color: '#a55eea', onClick: () => ui.show(Multiplayer) })),
      h('div', { class: 'grid3' },
        btn({ label: 'Garage', icon: 'wrench', cls: 'small', onClick: () => ui.show(Garage) }),
        btn({ label: 'Karts', icon: 'kart', cls: 'small', onClick: () => ui.show(KartSelect, { next: () => ui.back() }) }),
        btn({ label: 'Maps', icon: 'map', cls: 'small', onClick: () => ui.show(MapSelect, { mode: 'browse' }) }),
        btn({ label: 'Profile', icon: 'user', cls: 'small', onClick: () => ui.show(Profile) }),
        btn({ label: 'Settings', icon: 'gear', cls: 'small', onClick: () => ui.show(Settings) }),
        btn({ label: 'Credits', icon: 'info', cls: 'small', onClick: () => ui.show(Credits) }))));
  return { el, noBack: true };
}

// ------------------------------------------------------------------ kart + driver select

export function KartSelect(ui, params) {
  const app = ui.app, prof = app.profile;
  const p = prof.get();
  let kart = p.kart, driver = p.driver;
  const show = () => app.game.showroom.showKart(kart, driver, { paint: prof.lookFor(kart).paint, cosmetics: app.cosmeticsFor(kart), locked: !prof.hasKart(kart) });
  const info = h('div', { class: 'kart-info panel' });
  const kartList = h('div', { class: 'pick-row' });
  const drvList = h('div', { class: 'pick-row' });
  const go = btn({ label: 'Choose', icon: 'check', color: '#3ddc84', onClick: async () => { await prof.select(kart, driver); params.next(); } });
  const render = () => {
    const def = KART_BY_ID[kart];
    const owned = prof.hasKart(kart);
    info.innerHTML = '';
    info.append(h('h2', {}, def.name), h('p', { class: 'muted' }, def.blurb),
      ...STAT_NAMES.map(([k, n]) => statBar(n, def.stats[k], 10)),
      owned ? null : h('p', { class: 'lockline', html: icon('lock') + ` Unlocks at level ${def.level} for ${def.price} coins (buy it in the Garage)` }));
    go.disabled = !owned;
    kartList.querySelectorAll('.pick').forEach((b) => b.classList.toggle('on', b.dataset.id === kart));
    drvList.querySelectorAll('.pick').forEach((b) => b.classList.toggle('on', b.dataset.id === driver));
    show();
  };
  for (const k of KARTS) {
    const b = h('button', { class: 'pick' + (prof.hasKart(k.id) ? '' : ' locked'), 'data-id': k.id, style: { '--c': k.colors[0] } }, h('span', { class: 'pick-dot' }), k.name);
    b.addEventListener('click', () => { kart = k.id; render(); });
    kartList.appendChild(b);
  }
  for (const d of DRIVERS) {
    const b = h('button', { class: 'pick', 'data-id': d.id, style: { '--c': d.color } }, h('span', { class: 'pick-dot' }), d.name + ' the ' + d.animal);
    b.addEventListener('click', () => { driver = d.id; render(); });
    drvList.appendChild(b);
  }
  const el = h('div', { class: 'menu-side' }, header(ui, 'Choose your kart'),
    h('div', { class: 'side-col' }, h('h3', {}, 'Kart'), kartList, h('h3', {}, 'Driver'), drvList, info, go));
  render();
  let detach = null;
  return { el, enter() { detach = app.game.showroom.attach(app.game.r.canvas); }, leave() { if (detach) detach(); } };
}

// ------------------------------------------------------------------ map select

export function MapSelect(ui, params) {
  const app = ui.app, prof = app.profile.get();
  const mode = params.mode;
  const grid = h('div', { class: 'map-grid' });
  for (const m of MAP_INFO) {
    const built = !!MAP_BY_ID[m.id];
    const open = built && prof.maps.includes(m.id);
    const rec = prof.records[m.id];
    const card = h('button', { class: 'map-card' + (open ? '' : ' locked'), style: { '--c': SEASON_COLORS[m.season] }, disabled: !open },
      h('span', { class: 'map-season' }, m.season),
      h('span', { class: 'map-name' }, m.name),
      rec && rec.total ? h('span', { class: 'map-rec', html: icon('clock') + ' ' + fmtTime(rec.total) }) : null,
      open ? null : h('span', { class: 'map-lock', html: icon('lock') + (built ? ' Race it in a Grand Prix to unlock' : ' Coming in a later stage') }));
    card.addEventListener('click', () => {
      if (!open) return;
      if (mode === 'single') ui.show(RaceSetup, { map: m.id });
      else if (mode === 'tt') app.startRace({ mode: 'tt', map: m.id });
      else if (mode === 'browse') ui.toast(m.name + (rec && rec.total ? ' - best ' + fmtTime(rec.total) : ' - no record yet'));
    });
    grid.appendChild(card);
  }
  const title = mode === 'tt' ? 'Time Trials: pick a map' : mode === 'single' ? 'Single Race: pick a map' : 'Maps';
  return { el: h('div', { class: 'menu-full' }, header(ui, title), grid) };
}

// ------------------------------------------------------------------ single race setup

export function RaceSetup(ui, params) {
  const app = ui.app;
  let ai = 7, diff = 'normal';
  const aiRow = h('div', { class: 'seg' });
  for (let i = 0; i <= 7; i++) {
    const b = h('button', { class: 'seg-b' + (i === ai ? ' on' : '') }, String(i));
    b.addEventListener('click', () => { ai = i; aiRow.querySelectorAll('.seg-b').forEach((x, j) => x.classList.toggle('on', j === i)); });
    aiRow.appendChild(b);
  }
  const dRow = h('div', { class: 'seg' });
  AI_DIFFICULTIES.forEach((d) => {
    const b = h('button', { class: 'seg-b' + (d === diff ? ' on' : '') }, d[0].toUpperCase() + d.slice(1));
    b.addEventListener('click', () => { diff = d; dRow.querySelectorAll('.seg-b').forEach((x) => x.classList.toggle('on', x === b)); });
    dRow.appendChild(b);
  });
  const el = h('div', { class: 'menu-side' }, header(ui, 'Race settings'),
    h('div', { class: 'side-col panel' },
      h('h3', {}, MAP_BY_ID[params.map]?.name || params.map), h('p', { class: 'muted' }, '3 laps'),
      h('h3', {}, 'Computer racers'), aiRow,
      h('h3', {}, 'Computer skill'), dRow,
      btn({ label: 'Start race', icon: 'flag', color: '#3ddc84', onClick: () => app.startRace({ mode: 'single', map: params.map, aiCount: ai, difficulty: diff }) })));
  return { el };
}

// ------------------------------------------------------------------ Grand Prix cup select

export function CupSelect(ui) {
  const app = ui.app, prof = app.profile;
  let diff = 'normal';
  const dRow = h('div', { class: 'seg' });
  AI_DIFFICULTIES.forEach((d) => {
    const b = h('button', { class: 'seg-b' + (d === diff ? ' on' : '') }, d[0].toUpperCase() + d.slice(1));
    b.addEventListener('click', () => { diff = d; dRow.querySelectorAll('.seg-b').forEach((x) => x.classList.toggle('on', x === b)); });
    dRow.appendChild(b);
  });
  const cups = h('div', { class: 'cup-grid' });
  for (const c of CUPS) {
    const open = prof.cupOpen(c.id);
    const built = c.maps.every((m) => MAP_BY_ID[m]);
    const res = prof.get().cups[c.id];
    const card = h('button', { class: 'cup-card' + (open && built ? '' : ' locked'), style: { '--c': c.color }, disabled: !(open && built) },
      h('span', { class: 'cup-icon', html: icon('trophy') }),
      h('span', { class: 'cup-name' }, c.name),
      h('span', { class: 'cup-maps' }, c.maps.map((m) => MAP_INFO.find((x) => x.id === m).name).join(' / ')),
      res ? h('span', { class: 'cup-best ' + (res.trophy || '') }, res.trophy ? res.trophy.toUpperCase() + ' trophy' : 'Best: ' + res.best + 'th') : null,
      !open ? h('span', { class: 'map-lock', html: icon('lock') + ' Finish the previous cup' }) : !built ? h('span', { class: 'map-lock', html: icon('lock') + ' Maps coming in a later stage' }) : null);
    card.addEventListener('click', () => { if (open && built) app.startGP(c.id, diff); });
    cups.appendChild(card);
  }
  return { el: h('div', { class: 'menu-full' }, header(ui, 'Grand Prix'), h('div', { class: 'panel row center' }, h('b', {}, 'Computer skill'), dRow), cups) };
}

// ------------------------------------------------------------------ garage

export function Garage(ui) {
  const app = ui.app, prof = app.profile;
  let kart = prof.get().kart;
  let tab = 'kart';
  const panel = h('div', { class: 'side-col panel' });
  const list = h('div', { class: 'pick-row' });
  const tabs = h('div', { class: 'seg' });
  const preview = (over = {}) => {
    const look = { ...prof.lookFor(kart), ...over };
    app.game.showroom.showKart(kart, prof.get().driver, { paint: look.paint, cosmetics: { wheels: look.wheels, acc: look.acc }, locked: !prof.hasKart(kart) });
  };
  const render = () => {
    const def = KART_BY_ID[kart];
    const owned = prof.hasKart(kart);
    preview();
    tabs.querySelectorAll('.seg-b').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
    panel.innerHTML = '';
    if (tab === 'kart' || !owned) {
      panel.append(h('h2', {}, def.name), h('p', { class: 'muted' }, def.blurb), ...STAT_NAMES.map(([k, n]) => statBar(n, def.stats[k], 10)));
      if (owned) panel.append(h('p', { class: 'okline', html: icon('check') + ' You own this kart. Drag the kart to spin it.' }));
      else {
        const can = prof.canBuyKart(kart);
        const lv = prof.level;
        panel.append(h('p', { class: 'lockline', html: icon('lock') + ` Needs level ${def.level} (you are ${lv}) and ${def.price} coins (you have ${prof.get().coins})` }),
          btn({ label: 'Buy for ' + def.price, icon: 'coin', color: '#ffb02e', disabled: !can, onClick: async () => {
            try { await prof.buyKart(kart); app.game.sfx.play('purchase'); ui.toast(def.name + ' is yours!', 'good'); render(); rebuild(); } catch (e) { app.game.sfx.play('error'); ui.toast(e.message, 'bad'); }
          } }));
      }
    } else {
      // cosmetics never change how the kart drives
      const un = prof.unlocked();
      const cur = prof.lookFor(kart);
      const items = tab === 'paint' ? PAINTS : tab === 'wheels' ? WHEELS : ACCS;
      const key = tab === 'paint' ? 'paint' : tab === 'wheels' ? 'wheels' : 'acc';
      const curId = tab === 'paint' ? cur.paintId : tab === 'wheels' ? cur.wheels : cur.acc;
      const unl = tab === 'paint' ? un.paints : tab === 'wheels' ? un.wheels : un.accs;
      panel.append(h('h2', {}, def.name + ': ' + (tab === 'paint' ? 'Paint' : tab === 'wheels' ? 'Wheels' : 'Accessory')), h('p', { class: 'muted' }, 'Just for looks: these never change how a kart drives.'));
      const grid = h('div', { class: 'cos-grid' });
      for (const c of items) {
        const open = c.id === null || unl.includes(c.id);
        const colors = c.colors || (tab === 'paint' ? def.colors : null);
        const sw = h('button', { class: 'cos' + (c.id === curId ? ' on' : '') + (open ? '' : ' locked'), type: 'button' },
          colors ? h('span', { class: 'cos-sw', style: { background: `linear-gradient(135deg, ${colors[0]} 50%, ${colors[1]} 50%)` } }) : h('span', { class: 'cos-sw icon-sw', html: icon(tab === 'wheels' ? 'kart' : 'star') }),
          h('span', { class: 'cos-name' }, c.name), open ? null : h('span', { class: 'cos-lv' }, 'Lv ' + c.level));
        sw.addEventListener('mouseenter', () => { if (open) preview({ [key]: tab === 'paint' ? (c.colors || def.colors) : c.id, ...(tab === 'paint' ? {} : {}) }); });
        sw.addEventListener('mouseleave', () => preview());
        sw.addEventListener('click', async () => {
          if (!open) { ui.toast(`Unlocks at level ${c.level}`); return; }
          try { await prof.setLook(kart, { [key]: c.id }); app.game.sfx.play('click'); render(); } catch (e) { ui.toast(e.message, 'bad'); }
        });
        grid.append(sw);
      }
      panel.append(grid);
    }
    list.querySelectorAll('.pick').forEach((b) => b.classList.toggle('on', b.dataset.id === kart));
  };
  for (const [t, label] of [['kart', 'Kart'], ['paint', 'Paint'], ['wheels', 'Wheels'], ['acc', 'Extras']]) {
    const b = h('button', { class: 'seg-b', 'data-t': t }, label);
    b.addEventListener('click', () => { tab = t; render(); });
    tabs.append(b);
  }
  const rebuild = () => {
    list.innerHTML = '';
    for (const k of KARTS) {
      const b = h('button', { class: 'pick' + (prof.hasKart(k.id) ? '' : ' locked'), 'data-id': k.id, style: { '--c': k.colors[0] } }, h('span', { class: 'pick-dot' }), k.name);
      b.addEventListener('click', () => { kart = k.id; render(); });
      list.appendChild(b);
    }
  };
  rebuild();
  render();
  const el = h('div', { class: 'menu-side' }, topBar(app), header(ui, 'Garage'), h('div', { class: 'side-col' }, list, tabs, panel));
  let detach = null;
  return { el, enter() { detach = app.game.showroom.attach(app.game.r.canvas); }, leave() { if (detach) detach(); } };
}

// ------------------------------------------------------------------ profile

export function Profile(ui) {
  const app = ui.app, prof = app.profile, p = prof.get();
  const lv = levelFromXp(p.xp);
  const un = prof.unlocked();
  const frame = FRAMES.find((f) => f.id === p.frame) || FRAMES[0];
  const trophies = CUPS.map((c) => { const r = p.cups[c.id]; return h('div', { class: 'trophy ' + (r && r.trophy ? r.trophy : 'none'), html: icon('trophy') + `<span>${c.name}${r && r.trophy ? ' - ' + r.trophy : ''}</span>` }); });
  const recs = MAP_INFO.filter((m) => p.records[m.id]).map((m) => h('div', { class: 'rec-row' }, h('span', {}, m.name), h('b', {}, fmtTime(p.records[m.id].total || 0)), h('span', { class: 'muted' }, 'lap ' + fmtTime(p.records[m.id].lap || 0))));
  // style choices: title, profile frame, boost colour
  const choose = (label, list, cur, key, unl) => {
    const row = h('div', { class: 'seg' });
    for (const c of list) {
      const open = unl.includes(c.id);
      const b = h('button', { class: 'seg-b' + (c.id === cur ? ' on' : '') + (open ? '' : ' locked'), title: open ? '' : 'Unlocks at level ' + c.level }, (c.name || c.id) + (open ? '' : ' (Lv ' + c.level + ')'));
      b.addEventListener('click', async () => {
        if (!open) { ui.toast('Unlocks at level ' + c.level); return; }
        try { await prof.setStyle({ [key]: c.id }); ui.back(); ui.show(Profile); } catch (e) { ui.toast(e.message, 'bad'); }
      });
      row.append(b);
    }
    return h('div', { class: 'set-row' }, h('span', {}, label), row);
  };
  const achList = ACHIEVEMENTS.map((a) => h('div', { class: 'ach' + (p.achievements[a.id] ? ' got' : '') }, h('span', { class: 'ach-ico', html: icon(p.achievements[a.id] ? 'star' : 'lock') }), h('span', {}, h('b', {}, a.name), h('br'), h('span', { class: 'muted' }, a.desc)), h('span', { class: 'ach-c' }, '+' + a.coins)));
  const daily = (p.daily || []).map((d) => h('div', { class: 'daily' + (d.done ? ' done' : '') }, h('span', {}, d.name), h('span', { class: 'stat-bar' }, h('i', { style: { width: (Math.min(1, d.progress / d.goal) * 100) + '%' } })), h('b', {}, d.done ? 'Done!' : `${d.progress}/${d.goal}`), h('span', { class: 'ach-c' }, '+' + d.coins)));
  // online leaderboard for one map at a time
  const lbBox = h('div', { class: 'lb' });
  const lbSel = h('select', { class: 'field small' }, ...MAP_INFO.map((m) => h('option', { value: m.id }, m.name)));
  const loadLb = async () => {
    lbBox.textContent = 'Loading...';
    try {
      const lb = await prof.leaderboard(lbSel.value);
      lbBox.innerHTML = '';
      if (!lb.top.length) lbBox.append(h('p', { class: 'muted' }, 'No times yet. Be the first!'));
      lb.top.forEach((r, i) => lbBox.append(h('div', { class: 'rec-row' + (r.me ? ' me' : '') }, h('span', {}, (i + 1) + '. ' + r.name), h('b', {}, fmtTime(r.total)), h('span', { class: 'muted' }, (KART_BY_ID[r.kart] || {}).name || ''))));
      if (lb.mine && lb.mine.rank > 10) lbBox.append(h('p', {}, `You: #${lb.mine.rank} (${fmtTime(lb.mine.total)})`));
      if (lb.local) lbBox.append(h('p', { class: 'muted' }, 'Test mode: only your own times are shown.'));
    } catch (e) { lbBox.textContent = e.message; }
  };
  lbSel.addEventListener('change', loadLb);
  const el = h('div', { class: 'menu-full' }, header(ui, 'Profile'),
    h('div', { class: 'panel profile-head', style: { '--f1': frame.colors[0], '--f2': frame.colors[1] } },
      h('div', { class: 'avatar' }, h('span', {}, (p.name || '?')[0].toUpperCase())),
      h('div', {}, h('h2', {}, p.name), h('p', { class: 'title-tag' }, p.title || 'Rookie'),
        h('p', {}, `Level ${lv.level} - ${lv.into} / ${lv.need} XP to the next level`),
        h('div', { class: 'xpbar big' }, h('i', { style: { width: (lv.into / lv.need * 100) + '%' } })),
        h('p', {}, `Coins: ${p.coins}   Races: ${p.stats.races || 0}   Wins: ${p.stats.wins || 0}   Overtakes: ${p.stats.overtakes || 0}`))),
    h('div', { class: 'panel' }, h('h3', {}, 'Your style'), choose('Title', TITLES, p.title, 'title', un.titles), choose('Frame', FRAMES, p.frame, 'frame', un.frames), choose('Boost colour', BOOSTS, p.boost, 'boost', un.boosts)),
    daily.length ? h('div', { class: 'panel' }, h('h3', {}, "Today's challenges"), ...daily) : null,
    h('div', { class: 'panel' }, h('h3', {}, 'Trophies'), h('div', { class: 'trophies' }, ...trophies)),
    h('div', { class: 'panel' }, h('h3', {}, 'Achievements ' + Object.keys(p.achievements || {}).length + '/' + ACHIEVEMENTS.length), h('div', { class: 'ach-grid' }, ...achList)),
    h('div', { class: 'panel' }, h('h3', {}, 'Personal bests'), recs.length ? h('div', {}, ...recs) : h('p', { class: 'muted' }, 'Set a time in Time Trials.')),
    h('div', { class: 'panel' }, h('h3', {}, 'Time Trial leaderboard'), lbSel, lbBox),
    h('div', { class: 'panel' }, h('h3', {}, 'Recent rewards'), (p.recent || []).length ? h('div', {}, ...(p.recent || []).map((r) => h('div', { class: 'muted' }, r))) : h('p', { class: 'muted' }, 'Race to earn coins.')));
  loadLb();
  return { el };
}

// ------------------------------------------------------------------ settings

export function Settings(ui) {
  const app = ui.app, game = app.game;
  const s = { ...game.settings };
  const seg = (label, key, opts, fmt = (v) => v) => {
    const row = h('div', { class: 'seg' });
    opts.forEach((v) => {
      const b = h('button', { class: 'seg-b' + (String(s[key]) === String(v) ? ' on' : '') }, fmt(v));
      b.addEventListener('click', () => { s[key] = v; row.querySelectorAll('.seg-b').forEach((x) => x.classList.toggle('on', x === b)); apply(key); });
      row.appendChild(b);
    });
    return h('div', { class: 'set-row' }, h('span', {}, label), row);
  };
  let needsReload = false;
  const apply = (key) => {
    if (key === 'quality') needsReload = true;
    game.applySettings(s);
    saveSettings(s);
  };
  const cap = (v) => String(v)[0].toUpperCase() + String(v).slice(1);
  const el = h('div', { class: 'menu-full' }, header(ui, 'Settings'),
    h('div', { class: 'panel' },
      h('h3', {}, 'Graphics'),
      h('p', { class: 'muted' }, `Recommended for this device: ${cap(s.detected)}`),
      seg('Quality', 'quality', ['low', 'medium', 'high'], cap),
      seg('Pixel look', 'pixel', ['chunky', 'retro', 'smooth'], cap),
      seg('Render distance', 'view', ['auto', 300, 450, 650], (v) => v === 'auto' ? 'Auto' : v + ' m'),
      seg('Shadows', 'shadows', ['auto', 'on', 'off'], cap),
      seg('Particles', 'particles', ['normal', 'low', 'off'], cap),
      seg('Resolution', 'resolution', [50, 75, 100], (v) => v + '%'),
      seg('FPS counter', 'showFps', [false, true], (v) => v ? 'On' : 'Off'),
      h('div', { class: 'set-row' }, h('span', {}, 'Fullscreen'), btn({ label: 'Toggle', icon: 'fullscreen', cls: 'small', onClick: () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); } }))),
    h('div', { class: 'panel' },
      h('h3', {}, 'Sound'),
      seg('Sound effects', 'sfx', [true, false], (v) => v ? 'On' : 'Off'),
      seg('Volume', 'volume', [0.25, 0.5, 0.8, 1], (v) => Math.round(v * 100) + '%')),
    h('div', { class: 'panel' },
      h('h3', {}, 'Controls'),
      h('div', { class: 'controls' },
        ...[['W / Up', 'Accelerate'], ['S / Down', 'Brake and reverse'], ['A D / Left Right', 'Steer'], ['Space', 'Use item'], ['Shift / Q', 'Look behind'], ['Esc', 'Pause']]
          .map(([k, v]) => h('div', { class: 'ctl' }, h('kbd', {}, k), h('span', {}, v))),
        h('p', { class: 'muted' }, 'Drifting is automatic: hold a turn at speed to slide and charge sparks, let go for a boost. Ramp tricks happen by themselves too.'),
        h('p', { class: 'muted' }, 'Controllers work too: A or RT to drive, B or LT to brake, stick or d-pad to steer, X, LB or RB for items, Y to look behind, Start to pause. Menus: d-pad to move, A to press, B to go back.'))));
  return { el, leave() { if (needsReload && game.map) { game.unloadMap(); } } };
}

// ------------------------------------------------------------------ credits / multiplayer

export function Credits(ui) {
  const el = h('div', { class: 'menu-full' }, header(ui, 'Credits'),
    h('div', { class: 'panel credits' },
      h('h2', {}, 'TURBO TOWN'),
      h('p', {}, 'An original kart racer. Every kart, driver, map, item, model and sound was made for this game.'),
      h('h3', {}, 'Made with'),
      h('p', {}, 'three.js (MIT licence) for 3D graphics. Blender for all 3D models. Press Start 2P and Pixelify Sans fonts (SIL Open Font Licence) from Google Fonts.'),
      h('h3', {}, 'Built by'),
      h('p', {}, 'Built with Claude for SahurHub.')));
  return { el };
}

export { QUALITY };
