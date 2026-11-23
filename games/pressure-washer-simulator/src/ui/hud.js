// In-game HUD: money, job bar with timer and progress, list of objects, crosshair + what you're aiming at,
// pressure (water) gauge, nozzle/tool boxes, prompts, "sparkling" pops, tutorial card and the F3 overlay.
import { el, esc, $ui, money, pct, time, ICONS } from './ui.js';
import { FINISH_AT } from '../game/job.js';

const LAYER_NAMES = { moss: 'moss', oil: 'oil', graffiti: 'graffiti' };

export class Hud {
  constructor(app) {
    this.app = app;
    this.root = el('div', { class: 'hud hidden' });
    this.root.innerHTML = `
      <div class="hud-money"><div class="money-pill"><span class="coin">&pound;</span><span class="mv">0</span></div></div>
      <div class="hud-job hbox"><div class="top"><span class="name"></span><span class="timer">0:00</span></div>
        <div class="bar"><i></i><span class="mark"></span></div><div class="pct"><span class="p">0%</span><span class="d"></span></div></div>
      <div class="hud-list hbox"><div class="hd">To clean</div><div class="items"></div></div>
      <div class="crosshair"></div>
      <div class="target hidden"><div class="nm"></div><div class="bar"><i></i></div><div class="tag"></div></div>
      <div class="hud-gauge hbox"><div class="top"><span>Pressure</span><span class="l">30 L</span></div><div class="bar"><i></i></div><div class="sub">Hold <b>E</b> at the tap to refill</div></div>
      <div class="hud-tool">
        <div class="tool" data-t="narrow">${ICONS.narrow}Narrow<kbd>1</kbd></div>
        <div class="tool" data-t="wide">${ICONS.wide}Wide<kbd>2</kbd></div>
        <div class="tool" data-t="surface">${ICONS.disc}Surface<kbd>3</kbd></div>
        <div class="tool soap">${ICONS.soap}Soap</div>
      </div>
      <div class="hud-prompt hbox hidden"><span class="t"></span><div class="prog hidden"><i></i></div></div>
      <div class="hud-finish hidden">Job done! Press <kbd>Enter</kbd> to finish<small>or keep going: clean everything for the No Missed Spots bonus</small></div>
      <div class="tut hidden"><div class="step"></div><div class="tx"></div></div>`;
    $ui().appendChild(this.root);
    this.fpsEl = el('div', { class: 'fps hidden' });
    $ui().appendChild(this.fpsEl);
    const q = (s) => this.root.querySelector(s);
    this.mv = q('.mv'); this.jobEl = q('.hud-job'); this.jName = q('.hud-job .name'); this.timer = q('.timer');
    this.jBar = q('.hud-job .bar > i'); this.jPct = q('.hud-job .p'); this.jDone = q('.hud-job .d');
    this.list = q('.hud-list .items'); this.cross = q('.crosshair');
    this.target = q('.target'); this.tName = q('.target .nm'); this.tBar = q('.target .bar > i'); this.tTag = q('.target .tag');
    this.gauge = q('.hud-gauge'); this.gL = q('.hud-gauge .l'); this.gBar = q('.hud-gauge .bar > i'); this.gSub = q('.hud-gauge .sub');
    this.tools = [...this.root.querySelectorAll('.tool[data-t]')]; this.soap = q('.tool.soap');
    this.prompt = q('.hud-prompt'); this.pText = q('.hud-prompt .t'); this.pProg = q('.hud-prompt .prog'); this.pBar = q('.hud-prompt .prog i');
    this.finish = q('.hud-finish');
    this.tut = q('.tut'); this.tutStep = q('.tut .step'); this.tutTx = q('.tut .tx');
    this.cache = {};
    this.fpsT = 0;
    this.items = [];
  }

  show(on) { this.root.classList.toggle('hidden', !on); this.fpsEl.classList.toggle('solo', !on); }
  setFps(on) { this.fpsEl.classList.toggle('hidden', !on); }

  set(key, v, fn) { if (this.cache[key] !== v) { this.cache[key] = v; fn(v); } }

  setMoney(n, gained = 0) {
    this.mv.textContent = Math.round(n).toLocaleString('en-GB');
    if (gained > 0) {
      const p = el('div', { class: 'money-pop' }, '+' + money(gained));
      this.root.appendChild(p);
      setTimeout(() => p.remove(), 1600);
    }
  }

  startJob(job) {
    this.job = job;
    this.jName.textContent = job.def.name;
    this.list.innerHTML = '';
    this.items = job.surfaces.filter((s) => s.total > 0).map((s) => {
      const row = el('div', { class: 'it' }, `<span>${esc(s.name)}</span><span class="v">0%</span>`);
      this.list.appendChild(row);
      return { s, row, v: row.querySelector('.v') };
    });
    this.cache = {};
    this.finish.classList.add('hidden');
  }

  ding(text) {
    const d = el('div', { class: 'ding' }, esc(text));
    this.root.appendChild(d);
    setTimeout(() => d.remove(), 1500);
  }

  tutorial(text, step, total) {
    if (!text) { this.tut.classList.add('hidden'); this.cache.tut = null; return; }
    if (this.cache.tut === text) return;
    this.cache.tut = text;
    this.tut.classList.remove('hidden');
    this.tut.style.animation = 'none'; void this.tut.offsetWidth; this.tut.style.animation = '';
    this.tutStep.textContent = `Tutorial ${step} / ${total}`;
    this.tutTx.innerHTML = text;
  }

  update(dt) {
    const a = this.app, job = a.job, w = a.washer;
    this.fpsT -= dt;
    if (!this.fpsEl.classList.contains('hidden') && this.fpsT <= 0) {
      this.fpsT = 0.25;
      const i = a.R.r.info;
      this.fpsEl.textContent = `${Math.round(a.fpsMon.fps)} fps  ${a.fpsMon.ms.toFixed(1)} ms\ncalls ${i.render.calls}  tris ${i.render.triangles}\n${a.R.preset.name}${a.R.shadowsOn() ? ' + shadow' : ''}  x${a.R.r.getPixelRatio().toFixed(2)}`;
    }
    if (this.root.classList.contains('hidden') || !job || !w) return;
    // job bar
    const prog = job.progress;
    this.set('time', Math.floor(job.time), (t) => { this.timer.textContent = time(t) + ' / ' + time(job.def.par); this.timer.classList.toggle('over', t > job.def.par); });
    this.set('prog', Math.floor(prog * 1000), () => { this.jBar.style.width = (prog * 100).toFixed(1) + '%'; this.jPct.textContent = pct(prog); });
    const done = job.surfaces.filter((s) => s.done && s.total).length;
    this.set('done', done, () => { this.jDone.textContent = `${done} / ${this.items.length} sparkling`; });
    const ready = prog >= FINISH_AT && !job.allDone;
    this.set('ready', ready, (r) => { this.finish.classList.toggle('hidden', !r); this.jobEl.classList.toggle('ready', r); });
    // object list
    const cur = w.hit && w.hit.object.userData.surface;
    for (const it of this.items) {
      const p = Math.floor(it.s.progress * 100);
      if (it.p !== p) { it.p = p; it.v.textContent = it.s.done ? 'Done' : p + '%'; it.row.classList.toggle('done', it.s.done); }
      const c = it.s === cur;
      if (it.c !== c) { it.c = c; it.row.classList.toggle('cur', c); }
    }
    // crosshair + target
    const st = w.stats;
    const reach = w.tool === 'surface' ? st.disc.reach : st.range;
    const far = !w.hit || w.hit.distance > reach;
    this.set('cross', w.tool + (far ? ' far' : '') + (w.carrying ? ' hide' : ''), (v) => { this.cross.className = 'crosshair ' + v; });
    if (cur && !far) {
      this.target.classList.remove('hidden');
      this.set('tName', cur.name + (cur.done ? ' - sparkling!' : ''), (v) => { this.tName.textContent = v; this.target.classList.toggle('done', cur.done); });
      this.set('tBar', Math.floor(cur.progress * 200), () => { this.tBar.style.width = (cur.progress * 100).toFixed(1) + '%'; });
      const layer = cur.def.layer && !cur.done ? LAYER_NAMES[cur.def.layer.kind] : null;
      const tag = layer && st.stub < 0.5 ? `Stubborn ${layer}: detergent or pressure level 2 shifts it faster` : '';
      this.set('tTag', tag, (v) => { this.tTag.textContent = v; });
    } else if (!this.target.classList.contains('hidden')) {
      this.target.classList.add('hidden');
      this.cache.tName = null;
    }
    // gauge
    const f = w.water / st.tank;
    this.set('water', Math.round(f * 200), () => {
      this.gBar.style.width = (f * 100).toFixed(1) + '%';
      this.gL.textContent = Math.round(w.water) + ' / ' + st.tank + ' L';
      this.gauge.classList.toggle('low', f < 0.25 && f > 0.01);
      this.gauge.classList.toggle('empty', f <= 0.01);
    });
    this.set('gsub', w.refilling ? 'Refilling...' : f < 0.25 ? 'Running low! Hold <b>E</b> at the tap' : 'Hold <b>E</b> at the tap to refill', (v) => { this.gSub.innerHTML = v; });
    // tools
    this.set('tools', w.tool + '|' + st.surface + '|' + st.detergent, () => {
      for (const t of this.tools) {
        t.classList.toggle('on', t.dataset.t === w.tool);
        t.classList.toggle('off', t.dataset.t === 'surface' && !st.surface);
      }
      this.soap.classList.toggle('on', st.detergent);
      this.soap.classList.toggle('off', !st.detergent);
    });
    // prompt
    const pr = w.prompt;
    this.set('prompt', pr ? pr.text : '', (v) => { this.prompt.classList.toggle('hidden', !v); this.pText.textContent = v; });
    const showProg = pr && pr.prog != null;
    this.set('pprog', showProg, (v) => this.pProg.classList.toggle('hidden', !v));
    if (showProg) this.pBar.style.width = (pr.prog * 100).toFixed(1) + '%';
  }
}
