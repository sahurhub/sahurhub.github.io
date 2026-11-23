// Short tutorial on the first job: each step waits for you to try the thing it explains.
const STEPS = [
  { text: 'Walk with <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> and look around with the mouse.', done: (s) => s.walked > 2 && s.looked > 0.8 },
  { text: 'Hold <kbd>Left click</kbd> to spray. Aim at something dirty and watch it come clean!', done: (s) => s.cleanT > 1.5 },
  { text: 'Press <kbd>Right click</kbd> or <kbd>Shift</kbd> to swap between the narrow jet and the wide fan.', done: (s) => s.swaps >= 1 },
  { text: 'Spraying uses water. When the PRESSURE bar runs low, hold <kbd>E</kbd> at the tap (or wait, it refills slowly).', done: (s) => s.t > 8 || s.refilled },
  { text: 'Hold <kbd>Q</kbd> to light up the dirt you have missed.', done: (s) => s.found },
  { text: 'The hose only reaches so far. Press <kbd>E</kbd> next to the washer to wheel it somewhere else.', done: (s) => s.t > 8 || s.picked },
  { text: 'Moss, oil and graffiti are stubborn. Detergent and more pressure (from the upgrades shop) shift them faster.', done: (s) => s.t > 8 },
  { text: 'Every object dings when it is sparkling clean. Get the job to 95% and press <kbd>Enter</kbd>, or clean it all for a bonus!', done: (s) => s.t > 9 },
];

export class Tutorial {
  constructor() { this.i = 0; this.reset(); this.over = false; }
  reset() { this.s = { t: 0, walked: 0, looked: 0, cleanT: 0, swaps: 0, refilled: false, found: false, picked: false }; }

  // info = { walked, looked, cleaning, swapped, refilled, found, picked }
  update(dt, info) {
    if (this.over) return null;
    const s = this.s;
    s.t += dt;
    s.walked = info.walked - (this.walked0 ?? (this.walked0 = info.walked));
    s.looked = info.looked - (this.looked0 ?? (this.looked0 = info.looked));
    if (info.cleaning) s.cleanT += dt;
    if (info.swapped) s.swaps++;
    if (info.refilled) s.refilled = true;
    if (info.found) s.found = true;
    if (info.picked) s.picked = true;
    if (s.t > 1.2 && STEPS[this.i].done(s)) {
      this.i++;
      this.walked0 = info.walked; this.looked0 = info.looked;
      this.reset();
      if (this.i >= STEPS.length) { this.over = true; return null; }
    }
    return { text: STEPS[this.i].text, step: this.i + 1, total: STEPS.length };
  }
}
