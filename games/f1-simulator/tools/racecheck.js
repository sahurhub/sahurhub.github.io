// Race checker for the game page. In the browser console on http://localhost:8770/?mute=1 :
//   const rc = await import('/tools/racecheck.js');
//   const res = await rc.run([1, 2, 3], 2);      // seeds, laps (or rc.run([1,2], 1, 40) for 40 s)
// Runs whole races without drawing (player on autopilot) and counts car-to-car contacts, hard
// contacts (over 3 m/s), cars going fully off the track, AI resets and the longest time any car
// sat still. Uses MessageChannel to yield so it keeps going when the tab is in the background.
const yieldNow = () => new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });

export async function run(seeds, laps = 2, maxT = 400) {
  const g = window.__game, res = [];
  for (const seed of seeds) {
    g.endSession();
    g.settings.driver = 'norris'; g.settings.laps = laps; g.settings.grid = 10;
    await g.startSession({ mode: 'race', seed });
    g.running = false;
    g.session.autopilot(true, 85);
    const s = g.session, offPrev = new Map(), lastHit = new Map(), still = new Map();
    let hits = 0, big = 0, offs = 0, longestStill = 0, stillWho = '';
    const bigList = [], offList = [];
    const collide = s._collide.bind(s);
    s._collide = function () {
      for (const c of s.cars) c.veh.contact = 0;
      collide();
      if (s.state !== 'racing') return;
      for (const c of s.cars) if (c.veh.contact > 0) {
        const lh = lastHit.get(c.id);
        if (lh == null || s.time - lh > 1) {
          hits++;
          if (c.veh.contact > 3) { big++; bigList.push(`${c.id}@${c.veh.loc.s.toFixed(0)} t${s.time.toFixed(1)} dv${c.veh.contact.toFixed(1)}`); }
        }
        lastHit.set(c.id, s.time);
      }
    };
    let k = 0;
    while (s.state !== 'finished' && s.time < maxT) {
      g.tick(1 / 60, false); k++;
      for (const c of s.cars) {
        const off = c.veh.offWheels === 4;
        if (off && !offPrev.get(c.id)) { offs++; offList.push(`${c.id}@${c.veh.loc.s.toFixed(0)} t${s.time.toFixed(0)} d${c.veh.loc.d.toFixed(1)}`); }
        offPrev.set(c.id, off);
        if (s.state === 'racing' && s.time > 10 && !c.finished && c.veh.speed < 3) {
          const t = (still.get(c.id) || 0) + 1 / 60;
          still.set(c.id, t);
          if (t > longestStill) { longestStill = t; stillWho = `${c.id}@${c.veh.loc.s.toFixed(0)} t${s.time.toFixed(0)}`; }
        } else still.set(c.id, 0);
      }
      if (k % 300 === 0) await yieldNow();
    }
    res.push({
      seed, hits, big, offs, longestStill: +longestStill.toFixed(1), stillWho,
      resets: s.cars.filter((c) => c.resets).map((c) => c.id), bigList, offList,
      order: s.state === 'finished' ? s.order.map((c) => c.id + (c.bestLap ? ' ' + c.bestLap.toFixed(2) : '')).join(', ') : undefined,
    });
    window.__rcPartial = res.slice();
  }
  return res;
}
