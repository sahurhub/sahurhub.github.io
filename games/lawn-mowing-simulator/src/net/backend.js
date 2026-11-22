// Keeps progress in this browser (localStorage). The game is offline only (user's choice
// 2026-11-22): no accounts or server. Results are still checked with the same rules the
// server would have used (shared/validate.js), so a broken run can't pay out nonsense.
import { store } from '../core/store.js';
import { FLAGS } from '../config.js';
import { newProfile, fixProfile, buy, upgrade, equip, jobSetup, applyJob, newOffers } from '../shared/economy.js';
import { evaluateJob } from '../shared/validate.js';
import { dailyFor } from '../shared/daily.js';
import { utcDate } from '../shared/rng.js';

const SAVE_KEY = 'lms.guest.v1'; // name kept so earlier saves still load
const clone = (o) => JSON.parse(JSON.stringify(o));

export class LocalBackend {
  constructor() {
    this.kind = 'local';
    const saved = FLAGS.fresh ? null : store.json(SAVE_KEY, null);
    this.profile = fixProfile(saved || newProfile());
    this.daily = dailyFor(utcDate());
    this.settings = { moneyMult: 1 };
    this.save();
  }
  save() { store.setJson(SAVE_KEY, this.profile); }
  act(fn) {
    const p = clone(this.profile);
    fn(p);
    this.profile = fixProfile(p);
    this.save();
    return this.profile;
  }
  async buy(kind, id) { return this.act((p) => buy(p, kind, id)); }
  async upgrade(mower, stat) { return this.act((p) => upgrade(p, mower, stat)); }
  async equip(slot, id) { return this.act((p) => equip(p, slot, id)); }
  async newOffers() { return this.act((p) => newOffers(p)); }
  async startJob(req) {
    if (utcDate() !== this.daily.date) this.daily = dailyFor(utcDate());
    const job = jobSetup(this.profile, req, this.daily);
    return { ...job, ticket: 'local-' + Date.now() };
  }
  async finishJob(job, report) {
    const ev = evaluateJob(job, report);
    if (!ev.ok) throw new Error(ev.reason);
    let out;
    this.act((p) => { out = applyJob(p, job, ev.result, { settingsMult: this.settings.moneyMult }); });
    return { result: ev.result, ...out, profile: this.profile };
  }
}
