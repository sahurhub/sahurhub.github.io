// Race HUD: position, lap, lap timer with sector colours, timing tower with gaps, track map,
// speed / gear / rpm with shift lights, pedals, hybrid battery, tyre temperatures and wear,
// status badges, race messages and the five start lights.
import { fmtTime, clamp } from '../core/math.js';

const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };


function tempColor(T, opt) {
  const x = T - opt;
  if (x < -28) return '#3b7bd6';
  if (x < -14) return '#3fb7c9';
  if (x < 16) return '#2bbf5d';
  if (x < 32) return '#e0b21c';
  return '#e2362b';
}

export class Hud {
  constructor(root, session, opts = {}) {
    this.root = root;
    this.ses = session;
    this.race = session.mode === 'race';
    root.innerHTML = '';
    root.classList.remove('hidden');
    const title = this.race ? (opts.title || 'Grand Prix') : session.mode === 'practice' ? 'Practice' : 'Time Trial';
    root.append(
      (this.top = el(`<div class="h-box h-top">
        <div class="h-pos"><div class="lbl">${this.race ? 'Position' : title}</div><div class="big"><span data-k="pos">-</span><small data-k="posOf"></small></div></div>
        <div class="h-lap${this.race ? ' hidden' : ''}"><div class="lbl">Lap</div><div class="big"><span data-k="lap">1</span><small data-k="lapOf"></small></div></div></div>`)),
      (this.time = el(`<div class="h-box h-time"><div class="cur" data-k="cur">0:00.000</div>
        <div class="row"><span>Last <b data-k="last">-</b></span><span>Best <b data-k="best">-</b></span></div>
        <div class="h-secs"><span data-k="s0">S1</span><span data-k="s1">S2</span><span data-k="s2">S3</span></div></div>`)),
      (this.tower = el(`<div class="tw ${this.race ? '' : 'hidden'}"><div class="tw-head"><div class="tw-event">${title}</div><div class="tw-lap">LAP <b data-k="twLap">1</b> / ${session.laps}</div></div><div class="tw-rows" data-k="rows"></div></div>`)),
      (this.bannerEl = el(`<div class="bn"><div class="bn-pos" data-k="bnPos"></div><div class="bn-mid"><div class="bn-first" data-k="bnFirst"></div><div class="bn-last" data-k="bnLast"></div><div class="bn-team" data-k="bnTeam"></div></div><div class="bn-num" data-k="bnNum"></div></div>`)),
      (this.mapBox = el(`<div class="h-box h-map"><canvas width="170" height="170"></canvas></div>`)),
      (this.dash = el(`<div class="h-box h-dash">
        <div class="h-leds">${'<i></i>'.repeat(12)}</div>
        <div class="h-main"><div class="h-speed"><div class="v" data-k="kph">0</div><div class="u">km/h</div></div>
          <div class="h-gear" data-k="gear">N</div>
          <div class="h-rpm"><div class="v" data-k="rpm">0</div><div class="u">rpm</div></div></div>
        <div class="h-pedals"><i class="b"><b data-k="brk"></b></i><i class="t"><b data-k="thr"></b></i></div>
        <div class="h-ers"><span data-k="ersMode">Medium</span><i><b data-k="ers"></b></i><span class="st" data-k="ersSt"></span></div>
        <div class="h-badges"><span data-k="bAero">Straight mode</span><span data-k="bBoost">Boost</span><span data-k="bTc">TC</span><span data-k="bEsc">ESC</span><span data-k="bAbs">ABS</span></div></div>`)),
      (this.tyres = el(`<div class="h-box h-tyres"><div class="hd"><span class="cmp" data-k="cmp">S</span><span data-k="cmpName">Soft</span></div>
        <div class="h-tgrid">${[0, 1, 2, 3].map((i) => `<div class="h-tyre" data-k="t${i}"><div><div class="w">100%</div><div class="tp">80&deg;</div></div></div>`).join('')}</div></div>`)),
      (this.msg = el(`<div class="h-box h-msg"></div>`)),
      (this.lights = el(`<div class="h-lights hidden">${'<i></i>'.repeat(5)}</div>`)),
      (this.cam = el(`<div class="h-box h-cam"></div>`)),
      (this.wrong = el(`<div class="h-wrong hidden">Wrong way</div>`)),
      (this.fps = el(`<div class="h-box h-fps hidden"></div>`)),
    );
    this.k = {};
    root.querySelectorAll('[data-k]').forEach((n) => (this.k[n.dataset.k] = n));
    this.leds = [...this.dash.querySelectorAll('.h-leds i')];
    this.lightEls = [...this.lights.querySelectorAll('i')];
    this.tyreEls = [0, 1, 2, 3].map((i) => this.k['t' + i]);
    this.cache = {};
    this.slow = 0;
    this.evSeen = session.events.length;
    this.msgT = 0;
    this._mapInit();
    const cd = session.player.veh.p.compoundData;
    this.k.cmp.textContent = cd.label[0];
    this.k.cmp.style.setProperty('--cc', cd.color);
    this.k.cmpName.textContent = cd.label + ' tyres';
    if (!session.player.veh.p.engine.batteryMj) this.dash.querySelector('.h-ers').classList.add('hidden');
    if (!session.player.veh.p.aero.straight) this.k.bAero.classList.add('hidden');
  }

  set(key, value) {
    if (this.cache[key] !== value) { this.cache[key] = value; this.k[key].textContent = value; }
  }

  cls(node, name, on) { if (node.classList.contains(name) !== on) node.classList.toggle(name, on); }

  _mapInit() {
    const tr = this.ses.track, cv = this.mapBox.querySelector('canvas');
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (let i = 0; i < tr.n; i += 4) { minX = Math.min(minX, tr.x[i]); maxX = Math.max(maxX, tr.x[i]); minZ = Math.min(minZ, tr.z[i]); maxZ = Math.max(maxZ, tr.z[i]); }
    const pad = 12, sc = Math.min((cv.width - pad * 2) / (maxX - minX), (cv.height - pad * 2) / (maxZ - minZ));
    const ox = (cv.width - (maxX - minX) * sc) / 2 - minX * sc, oz = (cv.height - (maxZ - minZ) * sc) / 2 - minZ * sc;
    this.mapT = { sc, ox, oz };
    const base = document.createElement('canvas');
    base.width = cv.width; base.height = cv.height;
    const g = base.getContext('2d');
    g.lineJoin = 'round';
    const path = () => { g.beginPath(); for (let i = 0; i <= tr.n; i += 3) { const j = i % tr.n; const X = tr.x[j] * sc + ox, Z = tr.z[j] * sc + oz; i ? g.lineTo(X, Z) : g.moveTo(X, Z); } g.closePath(); };
    path(); g.strokeStyle = 'rgba(0,0,0,.8)'; g.lineWidth = 6; g.stroke();
    path(); g.strokeStyle = '#e8e8ee'; g.lineWidth = 2.6; g.stroke();
    g.fillStyle = '#e10600'; g.fillRect(tr.x[0] * sc + ox - 4, tr.z[0] * sc + oz - 1.5, 8, 3);
    this.mapBase = base;
    this.mapCtx = cv.getContext('2d');
  }

  _map() {
    const g = this.mapCtx, { sc, ox, oz } = this.mapT, ses = this.ses;
    g.clearRect(0, 0, 170, 170);
    g.drawImage(this.mapBase, 0, 0);
    for (const car of ses.cars) {
      if (car.isPlayer) continue;
      g.fillStyle = car.team.color;
      g.beginPath(); g.arc(car.veh.x * sc + ox, car.veh.z * sc + oz, 2.6, 0, 6.3); g.fill();
    }
    const p = ses.player.veh;
    g.fillStyle = '#fff'; g.strokeStyle = '#e10600'; g.lineWidth = 2;
    g.beginPath(); g.arc(p.x * sc + ox, p.z * sc + oz, 4.2, 0, 6.3); g.fill(); g.stroke();
  }

  /** Broadcast-style timing tower: position, team colour, driver code, interval, tyre compound. */
  _tower() {
    const ses = this.ses, ord = ses.order, me = ses.player;
    const avail = window.innerHeight - 92 - 58 - 250;   // top offset, header, widgets below
    const rh = clamp(Math.floor(avail / ord.length), 21, 29);
    const maxRows = clamp(Math.floor(avail / rh), 5, ord.length);
    if (this.cache.rh !== rh) { this.cache.rh = rh; this.tower.style.setProperty('--rh', rh + 'px'); }
    let list = ord, skipAt = -1;
    if (ord.length > maxRows) {
      // not enough room for everyone: always the leader, then the cars around the player
      const mi = ord.indexOf(me);
      const a = clamp(mi - Math.floor(maxRows / 2), 1, ord.length - (maxRows - 1));
      list = [ord[0], ...ord.slice(a, a + maxRows - 1)];
      if (a > 1) skipAt = ord[a].pos;
    }
    let html = '';
    for (const car of list) {
      let gap;
      if (car.pos === 1) gap = 'Interval';
      else if (car.lapsDown > 0 && car.gapAhead == null) gap = `+${car.lapsDown} LAP`;
      else gap = car.gapAhead == null ? '' : '+' + Math.max(0, car.gapAhead).toFixed(1);
      const cd = car.veh.p.compoundData;
      html += `<div class="tw-row${car === me ? ' me' : ''}${car.pos === 1 ? ' lead' : ''}${car.pos === skipAt ? ' skip' : ''}"><span class="tw-pos">${car.pos}</span><span class="tw-chip" style="background:${car.team.color}"></span><span class="tw-name">${car.driver.short}</span><span class="tw-gap">${gap}</span><span class="tw-tyre" style="color:${cd.color}">${cd.label[0]}</span></div>`;
    }
    if (html !== this.cache.tower) { this.cache.tower = html; this.k.rows.innerHTML = html; }
    this.set('twLap', String(clamp(ord[0].lapsDone + 1, 1, ses.laps)));
  }

  /** Driver name banner (position, name, team, car number), shown for a few seconds. */
  banner(car, secs = 5) {
    const parts = car.driver.name.split(' ');
    this.set('bnPos', String(car.pos));
    this.set('bnFirst', parts.slice(0, -1).join(' '));
    this.set('bnLast', parts[parts.length - 1]);
    this.set('bnTeam', car.team.name);
    this.set('bnNum', String(car.driver.number));
    this.bannerEl.style.setProperty('--tc', car.team.color);
    this.bannerEl.classList.add('show');
    this.bnT = secs;
  }

  message(text, type = 'info', secs = 3) {
    this.msg.textContent = text;
    this.msg.className = `h-box h-msg show ${type}`;
    this.msgT = secs;
  }

  update(dt, info = {}) {
    const ses = this.ses, car = ses.player, veh = car.veh, p = veh.p, eng = p.engine;
    // in the Halo cameras the speed / gear / ERS graphics are drawn on the halo itself (3D)
    const halo = !!info.haloHud;
    if (this.cache.haloOn !== halo) { this.cache.haloOn = halo; this.dash.classList.toggle('hidden', halo); }
    // --- every frame: the dashboard
    this.set('kph', Math.round(veh.kph));
    this.set('gear', veh.gear > 0 ? String(veh.gear) : veh.gear < 0 ? 'R' : 'N');
    this.set('rpm', String(Math.round(veh.rpm / 50) * 50));
    this.k.thr.style.width = (veh.throttle * 100).toFixed(0) + '%';
    this.k.brk.style.width = (veh.brake * 100).toFixed(0) + '%';
    const f = clamp((veh.rpm - eng.shiftRpm * 0.74) / (eng.shiftRpm * 0.26), 0, 1.05);
    const lit = Math.round(f * 12), over = f >= 1 && Math.floor(performance.now() / 70) % 2 === 0;
    if (lit !== this.cache.lit || over !== this.cache.over) {
      this.cache.lit = lit; this.cache.over = over;
      this.leds.forEach((n, i) => { n.className = over ? 'b' : i < lit ? (i < 5 ? 'g' : i < 9 ? 'r' : 'b') : ''; });
    }
    if (eng.batteryMj) {
      this.k.ers.style.width = ((veh.battery / (eng.batteryMj * 1e6)) * 100).toFixed(0) + '%';
      this.set('ersMode', ['ERS Harvest', 'ERS Medium', 'ERS Hotlap'][veh.ersMode] || 'ERS');
      const st = veh.deployKw > 25 ? 'Deploy' : veh.harvestKw > 25 ? 'Harvest' : '';
      if (st !== this.cache.ersSt) { this.cache.ersSt = st; this.k.ersSt.textContent = st; this.k.ersSt.className = 'st ' + (st === 'Deploy' ? 'dep' : 'har'); }
    }
    this.cls(this.k.bAero, 'on', veh.aeroK > 0.5);
    this.cls(this.k.bBoost, 'boost', !!veh.boosting);
    this.cls(this.k.bTc, 'warn', veh.tcActive);
    this.cls(this.k.bEsc, 'warn', !!veh.escActive);
    this.cls(this.k.bAbs, 'warn', veh.absActive);
    // current lap time
    const running = ses.state !== 'grid' && (car.crossed || this.race);
    const cur = running && !car.finished ? ses.time - car.lapStart : 0;
    this.set('cur', fmtTime(cur));
    this.cls(this.k.cur, 'bad', car.lapInvalid);

    // --- a few times a second: everything else
    this.slow -= dt;
    if (this.slow <= 0) {
      this.slow = 0.2;
      if (this.race) {
        this.set('pos', String(car.pos)); this.set('posOf', '/' + ses.cars.length);
        this.set('lap', String(clamp(car.lapsDone + 1, 1, ses.laps))); this.set('lapOf', '/' + ses.laps);
        this._tower();
        // name banner at the start and whenever the player gains or loses a place
        if (ses.state === 'racing' && this.lastPos !== car.pos) {
          if (this.lastPos == null || ses.time > 3) this.banner(car, this.lastPos == null ? 6 : 4);
          this.lastPos = car.pos;
        }
      } else {
        this.set('pos', car.bestLap ? fmtTime(car.bestLap) : '--');
        this.set('lap', String(car.lapsDone + 1));
      }
      this.set('last', car.lastLap ? fmtTime(car.lastLap) + (car.lastValid === false ? ' *' : '') : '-');
      this.set('best', car.bestLap ? fmtTime(car.bestLap) : '-');
      for (let k = 0; k < 3; k++) {
        const v = car.curSectors[k] != null ? car.curSectors[k] : car.sector === 0 && car.lastSectors[k] != null && k >= car.sector ? car.lastSectors[k] : null;
        const node = this.k['s' + k];
        let c = '';
        if (v != null) {
          let overall = Infinity;
          for (const o of ses.cars) if (o.bestSectors[k] != null && o.bestSectors[k] < overall) overall = o.bestSectors[k];
          c = v <= overall + 1e-6 ? 'p' : car.bestSectors[k] != null && v <= car.bestSectors[k] + 1e-6 ? 'g' : 'y';
        }
        const txt = v != null ? v.toFixed(3) : 'S' + (k + 1);
        if (this.cache['sx' + k] !== txt + c) { this.cache['sx' + k] = txt + c; node.textContent = txt; node.className = c; }
      }
      const cd = p.compoundData;
      for (let i = 0; i < 4; i++) {
        const n = this.tyreEls[i], T = veh.temp[i] + Math.min(veh.flash[i], 40) * 0.5;
        const key = `${Math.round((1 - veh.wear[i]) * 100)}|${Math.round(T)}`;
        if (this.cache['ty' + i] !== key) {
          this.cache['ty' + i] = key;
          n.style.borderColor = tempColor(T, cd.optTemp);
          n.style.background = tempColor(T, cd.optTemp) + '55';
          n.firstChild.innerHTML = `<div class="w">${Math.round((1 - veh.wear[i]) * 100)}%</div><div class="tp">${Math.round(T)}&deg;</div>`;
        }
      }
      this._map();
      if (info.camera && info.camera !== this.cache.cam) { this.cache.cam = info.camera; this.cam.textContent = 'Camera: ' + info.camera + '  [C]'; }
      this.cls(this.wrong, 'hidden', !info.wrongWay);
      if (info.fps != null) { this.fps.classList.remove('hidden'); this.fps.textContent = info.fps + ' fps'; }
    }
    // --- messages and lights
    while (this.evSeen < ses.events.length) { const e = ses.events[this.evSeen++]; this.message(e.text, e.type); }
    if (this.msgT > 0) { this.msgT -= dt; if (this.msgT <= 0) this.msg.classList.remove('show'); }
    if (this.bnT > 0) { this.bnT -= dt; if (this.bnT <= 0) this.bannerEl.classList.remove('show'); }
    const showLights = ses.state === 'grid' && ses.lights > 0;
    this.cls(this.lights, 'hidden', !showLights);
    if (showLights && this.cache.lights !== ses.lights) {
      this.cache.lights = ses.lights;
      this.lightEls.forEach((n, i) => n.classList.toggle('on', i < ses.lights));
    }
  }

  destroy() { this.root.innerHTML = ''; this.root.classList.add('hidden'); }
}
