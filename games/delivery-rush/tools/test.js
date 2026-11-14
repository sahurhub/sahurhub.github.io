// Developer test helpers (not loaded by the game). In the browser console:
//   const T = await import('/tools/test.js'); await T.boot(); await T.stage1();
// Frames are stepped manually and yield with MessageChannel, so tests also run in a hidden tab.

const mc = new MessageChannel();
const queue = [];
mc.port1.onmessage = () => { const f = queue.shift(); if (f) f(); };
export const yieldNow = () => new Promise(r => { queue.push(r); mc.port2.postMessage(0); });
export const G = () => window.__game;

export async function waitFor(fn, timeout = 30000) {
  const t0 = performance.now();
  while (!fn()) {
    if (performance.now() - t0 > timeout) throw new Error('timeout waiting for ' + fn);
    await new Promise(r => setTimeout(r, 50));
  }
}

// run n frames of dt seconds with the given keys held
export async function frames(n, keys = [], dt = 1 / 60, every = 4) {
  const g = G();
  keys.forEach(k => g.input.down.add(k));
  for (let i = 0; i < n; i++) {
    g.tick(dt);
    if (i % every === 0) await yieldNow();
  }
  keys.forEach(k => g.input.down.delete(k));
}
export async function press(code) {
  const g = G();
  g.input.pressed.add(code); g.input.down.add(code);
  g.tick(1 / 60);
  g.input.down.delete(code);
  await yieldNow();
}

export async function boot() {
  await waitFor(() => G() && G().state === 'title', 60000);
  document.querySelector('[data-t=play]').click();
  await waitFor(() => G().state === 'playing');
  G().looping = true;          // keep rAF loop from double-ticking if the tab becomes visible
  await frames(10);
  return true;
}

function teleport(x, z) {
  const g = G();
  if (g.player.vehicle) { g.player.vehicle.place(x, z, g.player.vehicle.h); }
  else g.player.place(x, z, g.player.heading);
  g.lastPos = { x, z };
}

export async function stage1() {
  const g = G(), out = {};
  const p0 = { ...g.player.pos };
  // walk forward for 1 s
  await frames(60, ['KeyW']);
  out.walked = +Math.hypot(g.player.pos.x - p0.x, g.player.pos.z - p0.z).toFixed(2);
  // sprint + jump
  await press('Space');
  await frames(10);
  out.jumpY = +(g.player.pos.y).toFixed(2);
  await frames(60);
  // job board
  const jb = g.layout.pois.jobBoards[0];
  teleport(jb.x, jb.z - 2.5);
  await frames(5);
  out.prompt = g.interactables() && g.interactables().text;
  await press('KeyE');
  out.menu = g.ui.menu && g.ui.menu.name;
  const jobs = g.jobs.refreshBoard('downtown').jobs;
  const job = jobs.find(j => j.units <= g.currentCapacity()) || jobs[0];
  out.job = { name: job.name, type: job.type, rarity: job.rarity, reward: job.reward, units: job.units, time: job.time };
  const r = g.jobs.accept(job.id);
  out.accept = r.ok;
  g.ui.close();
  await frames(5);
  // go to pickup
  const a = g.jobs.active;
  teleport(a.pickupB.door.x, a.pickupB.door.z);
  await frames(5);
  out.pickupPrompt = g.interactables() && g.interactables().text;
  await press('KeyE');
  out.state = g.jobs.active && g.jobs.active.state;
  out.carrying = g.player.carrying;
  const money0 = g.profile.money, xp0 = g.profile.xp, lv0 = g.profile.level;
  for (let k = 0; k < a.dropBs.length; k++) {
    const d = g.jobs.active.dropBs[g.jobs.active.dropIndex];
    teleport(d.door.x, d.door.z);
    await frames(5);
    out['dropPrompt' + k] = g.interactables() && g.interactables().text;
    await press('KeyE');
  }
  await frames(10);
  out.moneyGain = g.profile.money - money0;
  out.xpGain = g.profile.xp - xp0 + (g.profile.level - lv0) * 1000;
  out.active = !!g.jobs.active;
  out.deliveries = g.profile.stats.deliveries;
  return out;
}

export async function drive(id = 'bicycle') {
  const g = G(), out = {};
  if (!g.eco.owns(id)) { g.profile.money += 2000000; g.profile.level = Math.max(g.profile.level, 30); out.buy = g.eco.buyVehicle(id); }
  g.eco.equipVehicle(id);
  g.spawnVehicle(id);
  await frames(5);
  const v = g.vehicle;
  teleport(v.x, v.z);
  g.player.place(v.x + 1, v.z, 0);
  await frames(3);
  out.enterPrompt = g.interactables() && g.interactables().text;
  g.enterVehicle();
  await frames(3);
  out.inVehicle = !!g.player.vehicle;
  const x0 = v.x, z0 = v.z, h0 = v.h;
  const w0 = v.M.wheels.map(w => w.node.quaternion.x.toFixed(3)).join();
  await frames(180, ['KeyW']);
  out.speedKmh = +(Math.abs(v.vf) * 3.6).toFixed(1);
  out.moved = +Math.hypot(v.x - x0, v.z - z0).toFixed(1);
  out.wheelsSpun = v.M.wheels.map(w => w.node.quaternion.x.toFixed(3)).join() !== w0;
  await frames(60, ['KeyW', 'KeyA']);
  out.turned = +(v.h - h0).toFixed(2);
  out.steer = +v.steer.toFixed(2);
  await frames(90, ['KeyS']);
  out.afterBrake = +(Math.abs(v.vf) * 3.6).toFixed(1);
  out.top = +(v.stats.top * 3.6).toFixed(0);
  return out;
}

// complete the active job instantly (teleporting to each stop)
export async function finishJob() {
  const g = G();
  const a = g.jobs.active;
  if (!a) return false;
  if (a.state === 'pickup') { teleport(a.pickupB.door.x, a.pickupB.door.z); await frames(3); await press('KeyE'); }
  while (g.jobs.active && g.jobs.active.state === 'deliver') {
    const d = g.jobs.active.dropBs[g.jobs.active.dropIndex];
    teleport(d.door.x, d.door.z);
    await frames(3);
    const it = g.interactables();
    if (!it || !it.action) return 'blocked: ' + (it && it.text);
    await press('KeyE');
  }
  return true;
}

const click = sel => { const el = document.querySelector(sel); if (!el) throw new Error('missing ' + sel); el.click(); return el; };

export async function stage2() {
  const g = G(), out = {};
  // earn through real deliveries until we can afford the bicycle
  let n = 0;
  while (g.profile.money < 500 && n < 30) {
    const j = g.jobs.refreshBoard('downtown', true).jobs.find(x => x.units <= g.currentCapacity());
    if (!j) break;
    g.jobs.accept(j.id);
    await finishJob();
    n++;
  }
  out.jobsToBicycle = n;
  out.money = g.profile.money; out.level = g.profile.level;
  // dealership UI: select bicycle + buy
  g.ui.openShop('vehicles');
  click('[data-act=dsel][data-id=bicycle]');
  out.buyBtn = document.querySelector('[data-act=buy-vehicle]') && document.querySelector('[data-act=buy-vehicle]').textContent;
  click('[data-act=buy-vehicle][data-id=bicycle]');
  out.owned = Object.keys(g.profile.owned);
  out.equipped = g.profile.equipped;
  out.previewSubject = !!g.preview.subject;
  g.ui.close();
  // garage UI: buy upgrades
  g.profile.money += 1000;
  g.ui.openGarage('bicycle');
  click('[data-act=gtab][data-id=upgrades]');
  const top0 = g.vehicle.stats.top;
  click('[data-act=upgrade][data-stat=speed]');
  click('[data-act=upgrade][data-stat=cargo]');
  out.upgrades = { ...g.profile.owned.bicycle.upgrades };
  out.topBefore = +(top0 * 3.6).toFixed(1); out.topAfter = +(g.vehicle.stats.top * 3.6).toFixed(1);
  out.capacity = g.vehicle.stats.capacity;
  // paint needs the paint booth
  click('[data-act=gtab][data-id=paint]');
  out.paintLocked = !!document.querySelector('.note.lock');
  g.ui.close();
  // level up overlay
  const lvl = g.profile.level;
  g.eco.addXP(5000);
  out.levelUp = g.profile.level - lvl;
  out.overlay = !!document.querySelector('.levelup');
  // save + read back raw storage
  await g.saveNow();
  const raw = await g.save.loadProfile();      // through the save layer (works with ?nosave too)
  out.saved = { money: raw.money, level: raw.level, owned: Object.keys(raw.owned), up: raw.owned.bicycle && raw.owned.bicycle.upgrades, pos: raw.player && raw.player.player };
  return out;
}

export async function allVehicles() {
  const g = G(), out = {};
  g.profile.money += 3e6; g.profile.level = Math.max(g.profile.level, 30);
  const sp = g.layout.pois.spawn;
  for (const v of (await import('/src/config.js')).VEHICLES) {
    if (v.id === 'walk') continue;
    if (g.player.vehicle) g.exitVehicle();
    teleport(sp.x, sp.z);
    if (!g.eco.owns(v.id)) g.eco.buyVehicle(v.id);
    g.eco.equipVehicle(v.id);
    g.spawnVehicle(v.id);
    const veh = g.vehicle;
    // straight road east of spawn: place on the lane of the z = 0 road
    veh.place(-20, 3.4, Math.PI / 2);
    g.player.place(-20, 6, 0);
    g.enterVehicle();
    await frames(240, ['KeyW']);
    const kmh = Math.abs(veh.vf) * 3.6;
    out[v.id] = { kmh: +kmh.toFixed(0), top: +(veh.stats.top * 3.6).toFixed(0), cap: veh.stats.capacity, wheels: veh.M.wheels.length, steer: !!veh.M.steer || veh.M.wheels.some(w => w.pivot), seat: veh.M.seat.toArray().map(n => +n.toFixed(2)), fallback: veh.M.fallback };
  }
  g.exitVehicle();
  return out;
}

export async function jobTypes() {
  const g = G(), out = {};
  g.profile.level = Math.max(g.profile.level, 20);
  for (const d of ['suburbs', 'shopping', 'industrial', 'airport']) if (!g.eco.isUnlocked(d)) { g.profile.money += 200000; out['unlock_' + d] = g.eco.unlockDistrict(d).ok; }
  const r = (await import('/src/utils.js')).rng(99);
  for (const t of ['standard', 'express', 'fragile', 'multi', 'heavy', 'longhaul', 'premium']) {
    const j = g.jobs.makeJob('industrial', r, t) || g.jobs.makeJob('downtown', r, t);
    out[t] = j ? { units: j.units, drops: j.drops.length, rarity: j.rarity, reward: j.reward, xp: j.xp, time: j.time, dist: Math.round(j.distance), req: j.required } : null;
  }
  // fragile damage
  const fj = g.jobs.makeJob('downtown', r, 'fragile');
  g.jobs.start(fj); g.jobs.collect();
  g.jobs.impact(6); g.jobs.impact(4);
  out.fragileHealth = Math.round(g.jobs.active.health);
  g.jobs.cancel();
  // express timeout fails
  const ej = g.jobs.makeJob('downtown', r, 'express');
  g.jobs.start(ej);
  g.jobs.active.timeLeft = 0.01;
  await frames(3);
  out.expressFailed = !g.jobs.active;
  // standard late => penalty, still deliverable
  const sj = g.jobs.makeJob('downtown', r, 'standard');
  sj.units = 1;
  g.jobs.start(sj);
  g.jobs.active.timeLeft = 0.01;
  await frames(3);
  out.lateActive = !!g.jobs.active && g.jobs.active.late;
  const m0 = g.profile.money;
  out.lateFinish = await finishJob();
  out.latePay = g.profile.money - m0;
  // heavy job needs capacity
  const hj = g.jobs.makeJob('industrial', r, 'heavy');
  hj.units = 12;
  if (g.player.vehicle) g.exitVehicle();
  g.jobs.start(hj);
  teleport(g.jobs.active.pickupB.door.x, g.jobs.active.pickupB.door.z);
  await frames(3);
  out.heavyOnFoot = g.interactables() && g.interactables().text;
  g.jobs.cancel();
  return out;
}

export async function extras() {
  const g = G(), out = {};
  // special mission
  const sm = g.jobs.startSpecial('opening');
  out.special = sm.ok ? await finishJob() : sm.error;
  out.specialDone = !!g.profile.specials.opening;
  // golden drop event
  g.jobs.eventTimer = 0;
  for (let k = 0; k < 10 && !g.jobs.event; k++) { g.jobs.eventTimer = 0; await frames(2); }
  out.event = !!g.jobs.event;
  if (g.jobs.event) {
    const b = g.jobs.event.building.door;
    teleport(b.x, b.z); await frames(3);
    out.eventPrompt = g.interactables() && g.interactables().text;
    await press('KeyE');
    out.eventJob = !!(g.jobs.active && g.jobs.active.job.event);
    out.eventFinish = await finishJob();
    out.events = g.profile.stats.events;
  }
  // time trial
  const t = (await import('/src/config.js')).TIME_TRIALS[0];
  const { gx } = await import('/src/cityLayout.js');
  teleport(gx(t.nodes[0][0]), gx(t.nodes[0][1])); await frames(3);
  out.trialPrompt = g.interactables() && g.interactables().text;
  await press('KeyE');
  out.trialRunning = !!g.jobs.trial;
  await frames(200);
  for (let k = 1; k < t.nodes.length; k++) { teleport(gx(t.nodes[k][0]), gx(t.nodes[k][1])); await frames(4); }
  out.trialDone = !g.jobs.trial;
  out.trialRecord = g.profile.trials[t.id];
  // daily mission claim
  const dl = g.progress.dailyList();
  out.daily = dl.map(d => d.text + ' ' + Math.floor(d.progress) + '/' + d.goal);
  out.login = g.progress.claimLogin();
  // waypoint + route
  g.jobs.setWaypoint(200, 200); await frames(80);
  out.route = g.route ? g.route.length : 0;
  out.routeLen = Math.round(g.routeLen || 0);
  g.jobs.setWaypoint(null);
  return out;
}

export function trafficCheck() {
  const g = G();
  const { lightState } = g.traffic.constructor;
  let stoppedAtRed = 0, moving = 0;
  for (const c of g.traffic.cars) {
    if (c.speed > 1) moving++;
    if (c.phase === 'lane' && c.to.signal && c.len - c.s < 4 && c.speed < 0.5) stoppedAtRed++;
  }
  return { cars: g.traffic.cars.length, moving, stoppedAtRed, peds: g.npcs.active.length, sitters: g.npcs.sitters.filter(s => s.char).length, statics: g.npcs.statics.length };
}

// economy curve: for each vehicle tier, average $/minute when picking the best 2 of 6 board jobs,
// and minutes needed to afford the next vehicle
export async function balance() {
  const g = G();
  const C = await import('/src/config.js');
  const { rng } = await import('/src/utils.js');
  const saved = JSON.stringify(g.profile);
  const tiers = [
    ['walk', 1, ['downtown']], ['bicycle', 2, ['downtown', 'suburbs']], ['bmx', 3, ['downtown', 'suburbs']],
    ['escooter', 5, ['downtown', 'suburbs', 'shopping']], ['mtb', 6, ['downtown', 'suburbs', 'shopping']],
    ['moped', 8, ['downtown', 'suburbs', 'shopping']], ['motorbike', 11, ['downtown', 'suburbs', 'shopping', 'industrial']],
    ['van_small', 14, ['downtown', 'suburbs', 'shopping', 'industrial', 'airport']], ['van_large', 18, C.DISTRICT_ORDER],
    ['truck', 23, C.DISTRICT_ORDER], ['truck_super', 27, C.DISTRICT_ORDER],
  ];
  const out = [];
  const r = rng(7);
  for (let k = 0; k < tiers.length; k++) {
    const [vid, lv, ds] = tiers[k];
    g.profile.level = lv;
    g.profile.owned = {};
    if (vid !== 'walk') g.profile.owned[vid] = { upgrades: { speed: 2, cargo: 2, accel: 1 }, paint: 'stock', wheels: 'standard', accessories: [] };
    g.profile.districts = Object.fromEntries(ds.map(d => [d, true]));
    const def = C.VEHICLE_BY_ID[vid];
    const st = vid === 'walk' ? { top: 7.8, capacity: 1 } : C.vehicleStats(def, g.profile.owned[vid].upgrades);
    let pay = 0, time = 0, xp = 0, n = 0;
    for (let b = 0; b < 40; b++) {
      const jobs = [];
      for (let i = 0; i < 6; i++) { const j = g.jobs.makeJob(r.pick(ds), r); if (j && j.units <= st.capacity) jobs.push(j); }
      const est = j => 20 + (250 + j.distance) / (st.top * 0.7) + j.drops.length * 8;
      jobs.sort((a, b2) => b2.reward / est(b2) - a.reward / est(a));
      for (const j of jobs.slice(0, 2)) {
        let p = j.reward * (j.type === 'express' || j.type === 'premium' ? 1.25 : 1) * 1.2;   // speed bonus + ~5 streak
        pay += p; time += est(j); xp += j.xp; n++;
      }
    }
    const perMin = pay / (time / 60);
    const next = tiers[k + 1] ? C.VEHICLE_BY_ID[tiers[k + 1][0]] : null;
    out.push({ vid, lv, perJob: Math.round(pay / n), perMin: Math.round(perMin), xpPerMin: Math.round(xp / (time / 60)), next: next ? next.price : null, minutesToNext: next ? +(next.price / perMin).toFixed(1) : null });
  }
  Object.assign(g.profile, JSON.parse(saved));
  return out;
}

// render one frame and save the 3D canvas (no HTML HUD) via tools/shot-server.ps1
export async function shot(name, w = 960) {
  const g = G();
  g.tick(1 / 60);
  const c = g.renderer.domElement;
  const tmp = document.createElement('canvas');
  tmp.width = w; tmp.height = Math.round(w * c.height / c.width);
  tmp.getContext('2d').drawImage(c, 0, 0, tmp.width, tmp.height);
  const url = tmp.toDataURL('image/jpeg', 0.82);
  const bytes = Uint8Array.from(atob(url.split(',')[1]), ch => ch.charCodeAt(0));
  const r = await fetch('http://localhost:8773/' + name + '.jpg', { method: 'PUT', body: bytes });
  return r.status;
}

export function perf() {
  const g = G(), i = g.renderer.info;
  return { calls: i.render.calls, tris: i.render.triangles, geos: i.memory.geometries, tex: i.memory.textures, cars: g.traffic.cars.length, peds: g.npcs.active.length };
}

export async function fps(seconds = 3) {
  const t0 = performance.now();
  let n = 0;
  while (performance.now() - t0 < seconds * 1000) { G().tick(1 / 60); n++; await yieldNow(); }
  return +(n / seconds).toFixed(1);
}
