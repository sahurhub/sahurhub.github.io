// UK Simulator - tuning menu (F4): change the handling of the vehicle you are in. Saved per
// vehicle in this browser. "Apply" rebuilds the vehicle in place with the new settings.
import { VEHICLES } from '../shared/vehicles.js';
import { escapeHtml as esc } from './hud.js';

const CAR = [
  ['power', 'Engine power', 0.5, 1.5, 0.05], ['grip', 'Tyre grip', 0.6, 1.4, 0.05], ['springF', 'Front springs', 0.5, 2, 0.05], ['springR', 'Rear springs', 0.5, 2, 0.05],
  ['damper', 'Dampers', 0.4, 2, 0.05], ['arbF', 'Front anti-roll bar', 0, 2.5, 0.1], ['arbR', 'Rear anti-roll bar', 0, 2.5, 0.1], ['brakeBias', 'Brake bias (front)', 0.4, 0.8, 0.01],
  ['brakePower', 'Brake power', 0.5, 1.5, 0.05], ['steerMax', 'Steering lock', 0.6, 1.4, 0.05], ['steerFalloff', 'Less steering at speed', 0, 2, 0.1], ['diffLock', 'Differential lock', 0, 1, 0.05],
  ['downforce', 'Downforce', 0, 3, 0.1], ['rideHeight', 'Ride height (m)', -0.05, 0.08, 0.005], ['mass', 'Extra weight (kg)', 0, 400, 10],
];
const BIKE = [
  ['power', 'Power', 0.5, 1.5, 0.05], ['grip', 'Tyre grip', 0.6, 1.4, 0.05], ['springF', 'Front spring', 0.5, 2, 0.05], ['springR', 'Rear spring', 0.5, 2, 0.05], ['damper', 'Dampers', 0.4, 2, 0.05],
  ['brakePower', 'Brake power', 0.5, 1.5, 0.05], ['assist', 'Balance help (0 = all you)', 0, 1, 0.05], ['steerGain', 'Rider reaction', 0.5, 2, 0.05], ['wobble', 'Speed wobble', 0, 2, 0.1],
  ['battery', 'Battery size', 0.5, 2, 0.05], ['mass', 'Extra weight (kg)', 0, 60, 2],
];
const TOGGLES_CAR = [['abs', 'ABS'], ['tc', 'Traction control'], ['autoGears', 'Automatic gears']];
const TOGGLES_BIKE = [['autoGears', 'Automatic gears']];

export class Tuning {
  constructor(game) { this.g = game; this.el = document.getElementById('tuning'); this.open = false; this.el.addEventListener('input', (e) => this.onInput(e)); this.el.addEventListener('click', (e) => this.onClick(e)); }

  toggle(force) {
    this.open = force ?? !this.open;
    this.el.hidden = !this.open;
    if (this.open) this.render();
  }

  render() {
    const v = this.g.vehicle || this.g.myVehicle;
    if (!v) { this.el.innerHTML = '<div class="panel"><p>Get in a vehicle to tune it.</p><button class="btn" data-t="close">Close</button></div>'; return; }
    this.id = v.id;
    this.tune = { ...v.tune };
    const rows = (v.isCar ? CAR : BIKE).filter(([k]) => k !== 'battery' || v.spec.battery).map(([k, name, a, b, s]) => `<div class="slider"><span>${name}</span><input type="range" min="${a}" max="${b}" step="${s}" value="${this.tune[k]}" data-k="${k}"><span>${fmt(this.tune[k])}</span></div>`).join('');
    const tg = (v.isCar ? TOGGLES_CAR : TOGGLES_BIKE).filter(([k]) => k !== 'autoGears' || v.phys.engine && v.phys.engine.box).map(([k, name]) => `<button class="tab ${this.tune[k] ? 'on' : ''}" data-tog="${k}">${name}: ${this.tune[k] ? 'on' : 'off'}</button>`).join('');
    this.el.innerHTML = `<div class="panel"><button class="btn close" data-t="close">Close (F4)</button><h1>Tuning</h1><p>${esc(VEHICLES[v.id].name)} - 1.0 means the real car's setup. Changes are kept for this vehicle in this browser.</p>
      ${rows}<div class="tabs">${tg}</div><div class="row"><button class="btn primary" data-t="apply">Apply</button> <button class="btn" data-t="reset">Back to standard</button></div>
      <p>Tip: open the physics overlay (F3) to see tyre loads, slip and forces while you test.</p></div>`;
  }

  onInput(e) { const k = e.target.dataset.k; if (!k) return; this.tune[k] = Number(e.target.value); e.target.nextElementSibling.textContent = fmt(this.tune[k]); }

  async onClick(e) {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.t === 'close') return this.toggle(false);
    if (b.dataset.tog) { this.tune[b.dataset.tog] = !this.tune[b.dataset.tog]; b.classList.toggle('on'); b.textContent = b.textContent.replace(/(on|off)$/, this.tune[b.dataset.tog] ? 'on' : 'off'); return; }
    if (b.dataset.t === 'reset') { this.g.profile.saveTune(this.id, {}); this.toggle(false); await this.g.summon(this.id); return; }
    if (b.dataset.t === 'apply') {
      this.g.profile.saveTune(this.id, this.tune);
      const v = this.g.myVehicle;
      if (v && v.id === this.id) { Object.assign(v.tune, this.tune); v.phys.tune = v.tune; v.phys.applyTune(); if (v.phys.engine) { v.phys.engine.auto = v.tune.autoGears; } }
      this.g.hud.toast('Tuning applied.', 'good');
    }
  }
}
const fmt = (x) => (typeof x === 'number' ? (Math.abs(x) >= 10 ? x.toFixed(0) : x.toFixed(2)) : String(x));
