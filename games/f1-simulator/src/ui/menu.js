// Menu screens. Each function draws one screen into #ui and calls back into the app.
// Only things that really work are clickable; modes still being built are shown as locked.
import { fmtTime } from '../core/math.js';
import { QUALITY } from '../render/engine.js';
import { ACTION_LABELS, DEFAULT_KEYS } from '../core/input.js';
import { TITLE, TAGLINE, DISCLAIMER } from '../config.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const keyName = (code) => code.replace(/^Key/, '').replace(/^Digit/, '').replace('Arrow', 'Arrow ').replace('Left', ' Left').replace('Right', ' Right').replace('Control', 'Ctrl').replace(/\s+/g, ' ').trim();

export class Menu {
  constructor(root, app) {
    this.root = root;
    this.app = app;
  }

  clear() { this.root.innerHTML = ''; }

  _screen(html, overlay = false) {
    this.root.innerHTML = `<div class="screen${overlay ? ' overlay' : ''}">${html}</div>`;
    return this.root.firstChild;
  }

  _top(crumb) {
    return `<div class="topbar"><div class="brand">${TITLE}<small>${esc(DISCLAIMER)}</small></div><div class="spacer"></div><div class="crumb">${esc(crumb)}</div></div>`;
  }

  // ---- main menu ----------------------------------------------------------------------------
  main() {
    const { season } = this.app;
    const modes = [
      ['gp', 'Grand Prix', `Race the full ${season.year} grid: 22 real drivers, start lights, timing and results.`, null],
      ['tt', 'Time Trial', 'Empty track, flying laps, your best lap is saved.', null],
      ['practice', 'Practice', 'Unlimited running to learn the car and the circuit.', null],
      [null, 'Career', 'Create a driver and race through the seasons.', 'In development'],
      [null, 'My Team', 'Create and run your own team.', 'In development'],
      [null, 'Championship', 'Full season and custom championships.', 'In development'],
    ];
    const s = this._screen(`${this._top(`${season.year} season`)}
      <div class="body">
        <h1>${esc(TAGLINE)}</h1>
        <p class="lead">${season.championship}. Regulations: ${esc(this.app.regs.label)}.</p>
        <h2>Game modes</h2>
        <div class="modes">${modes.map(([id, name, desc, lock]) => `<button class="mode${lock ? ' locked' : ''}" ${lock ? 'disabled' : `data-mode="${id}"`}><div class="name">${name}</div><div class="desc">${esc(desc)}</div>${lock ? `<span class="tag">${lock}</span>` : '<span class="tag red">Play</span>'}</button>`).join('')}</div>
      </div>
      <div class="footer"><button class="btn" data-act="settings">Settings</button><button class="btn" data-act="controls">Controls</button><button class="btn" data-act="credits">Credits</button><div class="spacer"></div><span class="hint">Version 0.1 &middot; first playable</span></div>`);
    s.addEventListener('click', (e) => {
      const m = e.target.closest('[data-mode]'), a = e.target.closest('[data-act]');
      if (m) this.setup(m.dataset.mode);
      else if (a) this[a.dataset.act]();
    });
  }

  // ---- session setup (Grand Prix / Time Trial / Practice) ------------------------------------
  setup(mode) {
    const app = this.app, { season, regs, settings } = app;
    const teams = Object.fromEntries(season.teams.map((t) => [t.id, t]));
    const st = { driver: settings.driver, laps: settings.laps, difficulty: settings.difficulty, grid: settings.grid, compound: settings.compound || 'soft', assists: { ...settings.assists } };
    const race = mode === 'gp';
    const title = race ? 'Grand Prix' : mode === 'tt' ? 'Time Trial' : 'Practice';
    const round = season.calendar.find((r) => r.circuitId === 'monza');
    const lapChoices = [[3, '3 laps'], [5, '5 laps'], [10, '10 laps'], [13, '25% (13 laps)'], [27, '50% (27 laps)'], [53, 'Full race (53 laps)']];
    const seg = (key, opts, val) => `<div class="seg" data-seg="${key}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(v) === String(val) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    const draw = () => {
      const d = season.drivers.find((x) => x.id === st.driver) || season.drivers[0];
      const t = teams[d.team];
      const r = Object.fromEntries(season.driverFields.map((f, i) => [f, d.r[i]]));
      const rec = app.records[`monza:${season.year}`];
      const html = `${this._top(title)}
      <div class="body"><div class="cols"><div>
        <h2>Choose your driver</h2>
        <div class="drivers">${season.drivers.map((x) => `<button class="driver${x.id === st.driver ? ' sel' : ''}" data-driver="${x.id}" style="--tc:${teams[x.team].color}"><span class="num">${x.number}</span><span><div class="nm">${esc(x.name)}</div><div class="tm">${esc(teams[x.team].name)}</div></span></button>`).join('')}</div>
      </div><div>
        <div class="panel"><div class="card-car" style="--tc:${t.color}"><div class="hint">#${d.number} &middot; ${d.nat}</div><div class="big">${esc(d.name)}</div><div>${esc(t.fullName)}</div><div class="hint">${esc(t.car)} &middot; ${esc(t.powerUnit)} power unit</div></div>
          <div class="bars">${[['Overall', r.overall], ['Qualifying', r.qualifying], ['Race pace', r.racePace], ['Wet weather', r.wet], ['Overtaking', r.overtaking], ['Tyre care', r.tyreManagement]].map(([l, v]) => `<div class="bar"><span>${l}</span><i><b style="width:${v}%"></b></i><span>${v}</span></div>`).join('')}</div></div>
        <div class="panel"><h2>Event</h2>
          <dl class="kv"><dt>Circuit</dt><dd>${esc(app.circuitName)}</dd><dt>Grand Prix</dt><dd>${round ? `Round ${round.round}, ${esc(round.name)}` : ''}</dd><dt>Lap length</dt><dd>5.793 km</dd><dt>Weather</dt><dd>Dry</dd>${rec ? `<dt>Your best lap</dt><dd>${fmtTime(rec.time)}</dd>` : ''}</dl>
          <div style="height:12px"></div>
          ${race ? `<div class="field"><label>Distance</label><select data-f="laps">${lapChoices.map(([v, l]) => `<option value="${v}" ${v === +st.laps ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="field"><label>Start from</label>${seg('grid', [['pole', 'Pole'], ['mid', 'Midfield'], ['back', 'Back']], st.grid)}</div>
          <div class="field"><label>AI level <span data-k="dv">${st.difficulty}</span></label><input type="range" min="0" max="100" step="5" value="${st.difficulty}" data-f="difficulty"></div>` : ''}
          <div class="field"><label>Tyres</label>${seg('compound', [['soft', 'Soft'], ['medium', 'Medium'], ['hard', 'Hard']], st.compound)}</div>
        </div>
        <div class="panel"><h2>Driving assists</h2>
          <div class="field"><label>Traction control</label>${seg('tc', [[0, 'Off'], [1, 'Medium'], [2, 'Full']], st.assists.tc)}</div>
          <div class="field"><label>Stability control</label>${seg('stability', [[true, 'On'], [false, 'Off']], !!st.assists.stability)}</div>
          <div class="field"><label>Anti-lock brakes</label>${seg('abs', [[0, 'Off'], [1, 'On']], st.assists.abs)}</div>
          <div class="field"><label>Gearbox</label>${seg('autoGear', [[true, 'Automatic'], [false, 'Manual']], st.assists.autoGear)}</div>
          <div class="field"><label>Straight mode</label>${seg('autoAero', [[true, 'Automatic'], [false, 'Button (F)']], st.assists.autoAero !== false)}</div>
          <div class="field"><label>Steering help</label>${seg('steer', [[true, 'On'], [false, 'Off']], st.assists.steer)}</div>
          <div class="note">With everything on, the car forgives full-throttle and full-steering key presses. Steering help limits how far the front wheels turn at speed, traction control stops power slides, stability control catches the rear if it steps out. The real 2026 cars have none of these: turn them off one at a time as you get faster.</div>
        </div>
      </div></div></div>
      <div class="footer"><button class="btn" data-act="back">Back</button><div class="spacer"></div><span class="hint">${race ? 'Qualifying and pit stops arrive in a later version' : 'Flying start from the last corner'}</span><button class="btn primary" data-act="go">${race ? 'Start race' : 'Go to track'}</button></div>`;
      const s = this._screen(html);
      s.addEventListener('click', (e) => {
        const dr = e.target.closest('[data-driver]'), sg = e.target.closest('[data-seg] button'), a = e.target.closest('[data-act]');
        if (dr) { st.driver = dr.dataset.driver; draw(); }
        else if (sg) {
          const key = sg.parentNode.dataset.seg; let v = sg.dataset.v;
          if (v === 'true') v = true; else if (v === 'false') v = false; else if (!isNaN(+v)) v = +v;
          if (key in st.assists) st.assists[key] = v; else st[key] = v;
          draw();
        } else if (a && a.dataset.act === 'back') this.main();
        else if (a && a.dataset.act === 'go') {
          Object.assign(settings, { driver: st.driver, laps: +st.laps, difficulty: +st.difficulty, grid: st.grid, compound: st.compound, assists: st.assists });
          app.saveSettings();
          app.startSession({ mode: race ? 'race' : mode === 'tt' ? 'timetrial' : 'practice' });
        }
      });
      s.addEventListener('input', (e) => {
        const f = e.target.dataset.f;
        if (!f) return;
        st[f] = +e.target.value;
        if (f === 'difficulty') s.querySelector('[data-k=dv]').textContent = st.difficulty;
      });
      s.addEventListener('change', (e) => { if (e.target.dataset.f === 'laps') st.laps = +e.target.value; });
    };
    draw();
  }

  // ---- settings ------------------------------------------------------------------------------
  settings(back = () => this.main(), overlay = false) {
    const app = this.app, s0 = app.settings;
    const draw = () => {
      const s = this._screen(`${overlay ? '' : this._top('Settings')}<div class="body"><div class="center" style="max-width:640px;margin-top:${overlay ? '6vh' : '0'}">
        <h1>Settings</h1>
        <h2 style="margin-top:16px">Graphics</h2>
        <div class="field"><label>Quality</label><div class="seg" data-seg="quality">${Object.entries(QUALITY).map(([k, q]) => `<button data-v="${k}" class="${s0.quality === k ? 'on' : ''}">${q.label}</button>`).join('')}</div></div>
        <div class="note">Quality sets resolution, shadows, texture sharpness, trees and crowd detail together. It takes effect the next time you go on track. Medium is recommended for a GTX 1650.</div>
        <div class="field" style="margin-top:12px"><label>Show FPS</label><div class="seg" data-seg="showFps"><button data-v="true" class="${s0.showFps ? 'on' : ''}">On</button><button data-v="false" class="${!s0.showFps ? 'on' : ''}">Off</button></div></div>
        <h2 style="margin-top:18px">Sound</h2>
        <div class="field"><label>Volume</label><input type="range" min="0" max="1" step="0.05" value="${s0.volume}" data-f="volume"></div>
        <div class="stack"><button class="btn primary" data-act="back">Done</button></div></div></div>`, overlay);
      s.addEventListener('click', (e) => {
        const sg = e.target.closest('[data-seg] button');
        if (sg) { const k = sg.parentNode.dataset.seg; s0[k] = sg.dataset.v === 'true' ? true : sg.dataset.v === 'false' ? false : sg.dataset.v; app.saveSettings(); draw(); }
        else if (e.target.closest('[data-act=back]')) back();
      });
      s.addEventListener('input', (e) => { if (e.target.dataset.f === 'volume') { s0.volume = +e.target.value; app.audio.setVolume(s0.volume); app.saveSettings(); } });
    };
    draw();
  }

  // ---- controls (with remapping) -------------------------------------------------------------
  controls(back = () => this.main(), overlay = false) {
    const app = this.app;
    const draw = (waiting = null) => {
      const keys = app.input.keys;
      const s = this._screen(`${overlay ? '' : this._top('Controls')}<div class="body"><div class="center" style="max-width:640px;margin-top:${overlay ? '4vh' : '0'}">
        <h1>Controls</h1>
        <p class="note" style="margin-top:0">Click a key to change it, then press the new key. A controller works too: left stick steers, right trigger accelerates, left trigger brakes, bumpers change gear.</p>
        <div class="keys">${Object.keys(ACTION_LABELS).map((a) => `<span class="k">${ACTION_LABELS[a]}</span><span>${keys[a].map((c, i) => `<button class="btn small" data-remap="${a}:${i}">${waiting === `${a}:${i}` ? 'Press a key' : esc(keyName(c))}</button>`).join(' ')}</span>`).join('')}</div>
        <p class="note">Careful: holding Ctrl together with W closes a browser tab. If you use Ctrl to shift down, use the arrow keys to drive, or change the key above. The game also asks before the page closes during a session.</p>
        <div class="stack"><button class="btn" data-act="defaults">Restore defaults</button><button class="btn primary" data-act="back">Done</button></div></div></div>`, overlay);
      s.addEventListener('click', (e) => {
        const r = e.target.closest('[data-remap]');
        if (r) {
          const [a, i] = r.dataset.remap.split(':');
          draw(r.dataset.remap);
          app.input.capture = (code) => {
            if (code !== 'Escape' || a === 'pause') {
              const k = JSON.parse(JSON.stringify(app.input.keys));
              for (const act of Object.keys(k)) k[act] = k[act].filter((c) => c !== code || act === a);
              k[a][+i] = code;
              app.input.setKeys(k); app.settings.keys = k; app.saveSettings();
            }
            draw();
          };
        } else if (e.target.closest('[data-act=defaults]')) { app.input.setKeys(DEFAULT_KEYS); app.settings.keys = null; app.saveSettings(); draw(); }
        else if (e.target.closest('[data-act=back]')) { app.input.capture = null; back(); }
      });
    };
    draw();
  }

  // ---- credits -------------------------------------------------------------------------------
  credits() {
    const app = this.app;
    const cars = (app.carCredits || []).map((c) => `<li><b>${esc(c.title)}</b> by ${esc(c.author)} (${esc(c.license)}), <a href="${esc(c.url)}" target="_blank" rel="noopener">Sketchfab</a>. Simplified and re-exported for this game.</li>`).join('');
    const s = this._screen(`${this._top('Credits')}<div class="body credits" style="max-width:860px">
      <h1>Credits</h1><p class="lead">${esc(DISCLAIMER)} Team, driver, circuit and sponsor names belong to their owners and are used here to describe the real sport.</p>
      <h2>Car models</h2><ul>${cars || '<li>None loaded.</li>'}</ul>
      <h2>Circuit</h2><ul><li>Monza 3D model: "Autodromo Nazionale Monza Circuit 2020 layout" by Tyler_Dave, <a href="https://sketchfab.com/3d-models/25ed955115094de382935aa6d1a1e9c6" target="_blank" rel="noopener">Sketchfab</a>, labelled CC Attribution (it appears to come from the game Assetto Corsa by Kunos Simulazioni). Simplified for the browser.</li>
      <li>Monza centre line used to align the model: <a href="https://github.com/TUMFTM/racetrack-database" target="_blank" rel="noopener">TUMFTM racetrack-database</a> (LGPL-3.0).</li></ul>
      <h2>Software</h2><ul><li><a href="https://threejs.org" target="_blank" rel="noopener">three.js</a> (MIT licence) for 3D graphics. Titillium Web font (SIL Open Font Licence).</li></ul>
      <h2>Season data</h2><ul>${app.season.sources.map((u) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(new URL(u).hostname)}</a></li>`).join('')}<li>Driver and car ratings are this game's own estimates.</li></ul>
      </div><div class="footer"><button class="btn" data-act="back">Back</button></div>`);
    s.querySelector('[data-act=back]').addEventListener('click', () => this.main());
  }

  // ---- pause ---------------------------------------------------------------------------------
  pause() {
    const app = this.app;
    const s = this._screen(`<div class="body"><div class="center"><h1>Paused</h1>
      <div class="stack"><button class="btn primary" data-act="resume">Resume</button><button class="btn" data-act="restart">Restart session</button><button class="btn" data-act="settings">Settings</button><button class="btn" data-act="controls">Controls</button><button class="btn" data-act="quit">Quit to menu</button></div>
      <p class="note">C changes camera, R puts the car back on track, B looks behind, Space gives an electric boost.</p></div></div>`, true);
    s.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]');
      if (!a) return;
      const act = a.dataset.act;
      if (act === 'resume') app.resume();
      else if (act === 'restart') app.restart();
      else if (act === 'quit') app.quit();
      else if (act === 'settings') this.settings(() => this.pause(), true);
      else if (act === 'controls') this.controls(() => this.pause(), true);
    });
  }

  // ---- results -------------------------------------------------------------------------------
  results(ses, extra = {}) {
    const app = this.app, rows = ses.classification();
    const winner = rows[0];
    const me = rows.find((r) => r.car.isPlayer);
    const body = rows.map((r) => {
      const t = r.pos === 1 ? (r.time != null ? fmtTime(r.time) : '-') : r.lapsDown > 0 ? `+${r.lapsDown} lap${r.lapsDown > 1 ? 's' : ''}` : r.gap != null ? '+' + r.gap.toFixed(3) : '-';
      return `<tr class="${r.car.isPlayer ? 'me' : ''}"><td class="pos">${r.pos}</td><td><span class="tc" style="--tc:${r.team.color}"></span>${esc(r.driver.name)}</td><td>${esc(r.team.name)}</td><td>${r.grid}</td><td>${r.finished ? t : 'Running'}</td><td class="${r.fastest ? 'purple' : ''}">${r.best ? fmtTime(r.best) : '-'}</td><td>${r.points || ''}</td></tr>`;
    }).join('');
    const s = this._screen(`${this._top('Race result')}<div class="body">
      <h1>${me ? `P${me.pos} ${esc(me.driver.name)}` : 'Result'}</h1>
      <p class="lead">${esc(extra.title || '')}. Winner: ${esc(winner.driver.name)} (${esc(winner.team.name)}). ${ses.fastest ? `Fastest lap: ${esc(ses.fastest.car.driver.name)}, ${fmtTime(ses.fastest.time)}.` : ''}${me && me.pos <= 3 ? ' You are on the podium.' : ''}</p>
      <div class="panel"><table class="results"><thead><tr><th>Pos</th><th>Driver</th><th>Team</th><th>Grid</th><th>Time / gap</th><th>Best lap</th><th>Pts</th></tr></thead><tbody>${body}</tbody></table></div>
      </div><div class="footer"><button class="btn" data-act="quit">Main menu</button><div class="spacer"></div><button class="btn primary" data-act="restart">Race again</button></div>`);
    s.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]');
      if (a) (a.dataset.act === 'restart' ? app.restart() : app.quit());
    });
  }

  error(msg) {
    this._screen(`<div class="body"><div class="center"><h1>Something went wrong</h1><p class="note">${esc(msg)}</p><div class="stack"><button class="btn primary" onclick="location.reload()">Reload</button></div></div></div>`);
  }
}
