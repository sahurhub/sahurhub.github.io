// TURBO TOWN - pause, results, Grand Prix standings and podium, Time Trial results.
import { h, btn, icon, countUp } from '../ui.js';
import { fmtTime, ordinal } from '../hud.js';
import { DRIVERS, MAP_INFO, GP_POINTS } from '../../shared/rules.js';
import { KART_BY_ID } from '../../shared/karts.js';
import { MainMenu, MapSelect, Settings } from './menus.js';

const driverName = (id) => (DRIVERS.find((d) => d.id === id) || {}).name || id;
const mapName = (id) => (MAP_INFO.find((m) => m.id === id) || {}).name || id;

export function PauseMenu(ui, params) {
  const app = ui.app;
  const canRestart = params.mode !== 'gp';
  const el = h('div', { class: 'menu-overlay' },
    h('div', { class: 'panel pause' },
      h('h1', {}, 'Paused'),
      btn({ label: 'Resume', icon: 'play', color: '#3ddc84', onClick: () => app.closePause() }),
      canRestart ? btn({ label: 'Restart', icon: 'restart', onClick: () => app.restart() }) : null,
      btn({ label: 'Settings', icon: 'gear', onClick: () => ui.show(Settings) }),
      btn({ label: params.mode === 'gp' ? 'Quit Grand Prix' : 'Quit to menu', icon: 'home', cls: 'danger', onClick: () => app.menu() })));
  return { el, onKey(e) { if (e.code === 'Escape' && ui.stack.length === 1) { e.preventDefault(); app.closePause(); return true; } return false; } };
}

function resultsTable(rows, extraCol) {
  return h('div', { class: 'res-table' },
    ...rows.map((row) => h('div', { class: 'res-row' + (row.r.isPlayer ? ' me' : '') + (row.place <= 3 ? ' p' + row.place : '') },
      h('span', { class: 'res-place' }, ordinal(row.place)),
      h('span', { class: 'res-name' }, row.r.isPlayer ? row.r.name + ' (you)' : row.r.name),
      h('span', { class: 'res-kart muted' }, KART_BY_ID[row.r.def.id].name),
      h('span', { class: 'res-time' }, (row.est ? '~' : '') + fmtTime(row.time)),
      extraCol ? extraCol(row) : null)));
}

function rewardBox(out) {
  const total = h('b', {}, '0');
  const xp = h('b', {}, '0');
  const box = h('div', { class: 'reward panel' },
    h('h3', { html: icon('coin') + ' Rewards' }),
    ...out.lines.map((l, i) => {
      const v = h('b', {}, '+0');
      setTimeout(() => countUp(v, l.coins, 600, (x) => '+' + Math.round(x)), 250 + i * 250);
      return h('div', { class: 'rw-line' }, h('span', {}, l.label), v);
    }),
    h('div', { class: 'rw-line total' }, h('span', {}, 'Total coins'), total),
    h('div', { class: 'rw-line' }, h('span', {}, 'XP'), xp),
    out.levelUp ? h('div', { class: 'levelup' }, 'LEVEL UP! You are now level ' + out.levelUp) : null,
    out.unlocks && out.unlocks.length ? h('div', { class: 'unlocks' }, h('b', {}, 'New to try: '), out.unlocks.map((u) => u.name).join(', ')) : null,
    out.error ? h('p', { class: 'lockline' }, 'Rewards could not be saved: ' + out.error) : null,
    ui_dev(out));
  if (out.levelUp) setTimeout(() => sfxPlay('levelup'), 600 + out.lines.length * 250);
  else if (out.coins > 0) setTimeout(() => sfxPlay('coin'), 400);
  setTimeout(() => { countUp(total, out.coins, 900); countUp(xp, out.xp, 900); }, 250 + out.lines.length * 250);
  return box;
}

let sfxPlay = () => {};
export function setResultSfx(fn) { sfxPlay = fn; }

function ui_dev(out) {
  return out.cfg && out.dev ? h('p', { class: 'muted' }, 'Test mode: rewards stay on this PC') : null;
}

export function RaceResults(ui, out) {
  const app = ui.app;
  const cfg = out.cfg;
  const me = out.me;
  const actions = h('div', { class: 'row center wrap' });
  if (cfg.mode === 'gp') {
    if (out.gpDone) actions.append(btn({ label: 'See the podium', icon: 'trophy', color: '#ffb02e', onClick: () => { app.showPodium(); ui.show(GPPodium, out, { replace: true }); } }));
    else actions.append(btn({ label: 'Standings', icon: 'trophy', color: '#ffb02e', onClick: () => ui.show(GPStandings, out, { replace: true }) }));
  } else {
    actions.append(
      btn({ label: 'Race again', icon: 'restart', color: '#3ddc84', onClick: () => app.restart() }),
      btn({ label: 'Change map', icon: 'map', onClick: () => { app.menu(); ui.show(MapSelect, { mode: 'single' }); } }),
      btn({ label: 'Menu', icon: 'home', onClick: () => app.menu() }));
  }
  const extra = cfg.mode === 'gp' ? (row) => h('span', { class: 'res-pts' }, '+' + GP_POINTS[row.place - 1]) : null;
  const el = h('div', { class: 'menu-results' },
    h('div', { class: 'res-head' },
      h('div', { class: 'res-big place' + Math.min(4, me.place) }, ordinal(me.place)),
      h('div', {}, h('h2', {}, mapName(cfg.map)),
        h('p', {}, 'Time ' + fmtTime(me.time) + '   Best lap ' + fmtTime(me.r.bestLap)),
        h('p', { class: 'muted' }, (me.r.ov ? me.r.ov.count : 0) + ' overtakes'),
        out.unlockMaps && out.unlockMaps.length ? h('p', { class: 'okline', html: icon('check') + ' Unlocked for Single Race and Time Trials' }) : null)),
    h('div', { class: 'res-cols' }, resultsTable(out.rows, extra), rewardBox({ ...out, dev: app.profile.dev })),
    actions);
  return { el, noBack: true };
}

export function GPStandings(ui, out) {
  const app = ui.app;
  const gp = app.gp;
  const st = app.gpStandings();
  const el = h('div', { class: 'menu-results' },
    h('h1', { class: 'scr-title' }, gp.cupName + ' standings after race ' + (gp.race + 1) + ' of 4'),
    h('div', { class: 'res-table' },
      ...st.map((e, i) => h('div', { class: 'res-row' + (e.isPlayer ? ' me' : '') + (i < 3 ? ' p' + (i + 1) : '') },
        h('span', { class: 'res-place' }, ordinal(i + 1)),
        h('span', { class: 'res-name' }, e.isPlayer ? (app.profile.get().name + ' (you)') : e.name),
        h('span', { class: 'res-kart muted' }, e.isPlayer ? '' : KART_BY_ID[e.kart].name),
        h('span', { class: 'res-pts big' }, e.pts + ' pts')))),
    h('p', { class: 'muted center' }, 'Next: ' + mapName(gp.maps[gp.race + 1])),
    h('div', { class: 'row center' },
      btn({ label: 'Next race', icon: 'next', color: '#3ddc84', onClick: () => app.nextGPRace() }),
      btn({ label: 'Quit Grand Prix', icon: 'home', cls: 'danger', onClick: () => ui.modal({ title: 'Quit the Grand Prix?', text: 'Your points so far will be lost.', buttons: [{ label: 'Keep racing' }, { label: 'Quit', cls: 'small danger', onClick: () => app.menu() }] }) })));
  return { el, noBack: true };
}

export function GPPodium(ui, out) {
  const app = ui.app;
  const gp = app.gp;
  const st = app.gpStandings();
  const place = st.findIndex((s) => s.isPlayer) + 1;
  const trophy = place === 1 ? 'gold' : place === 2 ? 'silver' : place === 3 ? 'bronze' : null;
  const el = h('div', { class: 'menu-podium' },
    h('div', { class: 'panel podium-card' },
      h('h1', {}, gp.cupName),
      h('div', { class: 'res-big place' + Math.min(4, place) }, ordinal(place)),
      trophy ? h('div', { class: 'trophy big ' + trophy, html: icon('trophy') + `<span>${trophy.toUpperCase()} TROPHY</span>` }) : h('p', {}, 'Finish in the top three for a trophy. Try again!'),
      h('div', { class: 'podium-names' }, ...st.slice(0, 3).map((e, i) => h('div', {}, ordinal(i + 1) + '  ' + (e.isPlayer ? 'You' : e.name) + '  ' + e.pts + ' pts'))),
      out.unlockCups && out.unlockCups.length ? h('p', { class: 'okline', html: icon('check') + ' New cup unlocked!' }) : null,
      rewardBox({ ...out, dev: app.profile.dev }),
      btn({ label: 'Back to menu', icon: 'home', color: '#3ddc84', onClick: () => app.menu() })));
  return { el, noBack: true };
}

export function TimeTrialResults(ui, out) {
  const app = ui.app;
  const me = out.me, cfg = out.cfg;
  const old = out.oldRecord || {};
  const el = h('div', { class: 'menu-results' },
    h('div', { class: 'res-head' },
      h('div', { class: 'res-big' }, fmtTime(me.time)),
      h('div', {},
        h('h2', {}, mapName(cfg.map) + ' - Time Trial'),
        out.pb ? h('p', { class: 'pb' }, old.total ? 'NEW PERSONAL BEST! (was ' + fmtTime(old.total) + ')' : 'First time set! Your ghost will race you next time.') : h('p', {}, 'Personal best ' + fmtTime(old.total)),
        out.lapPb ? h('p', { class: 'pb small' }, 'New best lap ' + fmtTime(me.r.bestLap)) : h('p', { class: 'muted' }, 'Best lap ' + fmtTime(me.r.bestLap)))),
    h('div', { class: 'panel laps' }, ...me.r.lapTimes.map((t, i) => h('div', { class: 'rw-line' }, h('span', {}, 'Lap ' + (i + 1)), h('b', {}, fmtTime(t))))),
    h('p', { class: 'muted center' }, app.profile.dev ? 'Online leaderboards appear once you are signed in to the server.' : ''),
    h('div', { class: 'row center' },
      btn({ label: 'Try again', icon: 'restart', color: '#3ddc84', onClick: () => app.restart() }),
      btn({ label: 'Change map', icon: 'map', onClick: () => { app.menu(); ui.show(MapSelect, { mode: 'tt' }); } }),
      btn({ label: 'Menu', icon: 'home', onClick: () => app.menu() })));
  return { el, noBack: true };
}

export { MainMenu, driverName };
