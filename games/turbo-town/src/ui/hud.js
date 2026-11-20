// TURBO TOWN - in-race HUD: big place number (bottom right), laps and time (bottom left),
// item slot (top left), outline minimap with the drivers on it (right), small buttons
// (sound, fullscreen, pause), name tags over the other karts, banners and toasts.
import * as THREE from 'three';
import { itemIcon, ICON_IDS } from './item-icons.js';
import { icon } from './icons.js';

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// the minimap is drawn small and shown big, so it looks pixelated like the game
const MAP_W = 120, MS = MAP_W / 180;
// game speed (m/s, flat out about 30) to the km/h shown: about 300 km/h like a real F1 car
const SPEED_TO_KMH = 10;
const _v = new THREE.Vector3();

function esc(s) { return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

export function fmtTime(t) {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60), s = t - m * 60;
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(3);
}

export class Hud {
  constructor(root) {
    this.root = root;
    root.innerHTML = `
      <div class="hud-tags"></div>
      <div class="hud-item hidden"><div class="hud-item-box"><div class="hud-item-icon"></div></div><div class="hud-item-key">SPACE</div></div>
      <div class="hud-buttons">
        <button type="button" data-b="sound" title="Sound">${icon('sound')}</button>
        <button type="button" data-b="full" title="Fullscreen">${icon('fullscreen')}</button>
        <button type="button" data-b="pause" title="Pause">${icon('pause')}</button>
      </div>
      <canvas class="hud-map" width="${MAP_W}" height="${MAP_W}"></canvas>
      <div class="hud-lapbox"><div class="hud-laps"></div><div class="hud-time">0:00.000</div><div class="hud-lap"><b>1</b><span>/3</span></div></div>
      <div class="hud-pos"><span class="hud-pos-n">1</span><span class="hud-pos-s">ST</span></div>
      <div class="hud-banner"></div>
      <div class="hud-notices"></div>
      <div class="hud-toasts"></div>
      <div class="hud-wrong hidden">WRONG WAY!</div>
      <div class="hud-speed"><b>0</b><span>KM/H</span></div>
      <div class="hud-fps hidden"></div>`;
    const $ = (s) => root.querySelector(s);
    this.el = {
      posN: $('.hud-pos-n'), posS: $('.hud-pos-s'), pos: $('.hud-pos'),
      lap: $('.hud-lap b'), lapOf: $('.hud-lap span'), time: $('.hud-time'), laps: $('.hud-laps'),
      banner: $('.hud-banner'), toasts: $('.hud-toasts'), wrong: $('.hud-wrong'), map: $('.hud-map'), fps: $('.hud-fps'),
      item: $('.hud-item'), itemIcon: $('.hud-item-icon'), itemKey: $('.hud-item-key'), tags: $('.hud-tags'), buttons: $('.hud-buttons'),
      notices: $('.hud-notices'), speed: $('.hud-speed b'),
    };
    this.shownSpeed = -1;
    this.mapCtx = this.el.map.getContext('2d');
    this.lastPlace = 0;
    this.bannerT = 0;
    this.tagEls = [];
    this.onButton = () => {};
    this.el.buttons.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) { b.blur(); this.onButton(b.dataset.b); }
    });
  }

  show(on) { this.root.classList.toggle('hidden', !on); }

  // free roam: only the speedometer, the minimap and the buttons
  setRoam(on) { this.root.classList.toggle('roam', on); }

  // the sound button shows whether sound is on
  setSound(on) { this.el.buttons.querySelector('[data-b="sound"]').innerHTML = icon(on ? 'sound' : 'mute'); }

  setupMap(track) {
    const city = track.def && track.def.city;
    if (city) { this.setupCityMap(city); return; }
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of track.main.pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
    const W = MAP_W, pad = 10 * MS;
    const sc = Math.min((W - pad * 2) / (x1 - x0), (W - pad * 2) / (z1 - z0));
    const ox = (W - (x1 - x0) * sc) / 2, oz = (W - (z1 - z0) * sc) / 2;
    this.mapTf = (x, z) => [ox + (x - x0) * sc, oz + (z - z0) * sc];
    const bg = document.createElement('canvas');
    bg.width = bg.height = W;
    const g = bg.getContext('2d');
    g.lineJoin = 'round'; g.lineCap = 'round';
    const draw = (path, width, color) => {
      g.beginPath();
      path.pts.forEach((p, i) => { const [x, z] = this.mapTf(p.x, p.z); i ? g.lineTo(x, z) : g.moveTo(x, z); });
      if (path.closed) g.closePath();
      g.strokeStyle = color; g.lineWidth = width; g.stroke();
    };
    // an outline of the road: dark edge, light road (shortcuts thinner)
    for (const path of track.paths) if (!path.hidden) draw(path, path.id === 'main' ? 7 : 4, 'rgba(43,37,96,0.75)');
    for (const path of track.paths) if (!path.hidden) draw(path, path.id === 'main' ? 4.5 : 2, 'rgba(240,240,250,0.95)');
    const [sx, sz] = this.mapTf(track.main.pts[0].x, track.main.pts[0].z);
    const p0 = track.main.pts[0];
    g.strokeStyle = '#2b2560'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(sx - p0.rx * 4, sz - p0.rz * 4); g.lineTo(sx + p0.rx * 4, sz + p0.rz * 4); g.stroke();
    this.mapBg = bg;
  }

  // a city map: its streets from above (blocks dark, roads light)
  setupCityMap(city) {
    const [x0, z0, x1, z1] = city.bounds;
    const W = MAP_W, pad = 6 * MS;
    const sc = Math.min((W - pad * 2) / (x1 - x0), (W - pad * 2) / (z1 - z0));
    const ox = (W - (x1 - x0) * sc) / 2, oz = (W - (z1 - z0) * sc) / 2;
    // drawn the way you see the city when you start (facing north = up the map)
    this.mapTf = (x, z) => [ox + (x1 - x) * sc, oz + (z1 - z) * sc];
    const bg = document.createElement('canvas');
    bg.width = bg.height = W;
    const g = bg.getContext('2d');
    const rect = (r, color, grow = 0) => {
      const [ax, az] = this.mapTf(r[0], r[1]);
      const [bx, bz] = this.mapTf(r[2], r[3]);
      const sx = Math.min(ax, bx), sz = Math.min(az, bz);
      g.fillStyle = color; g.fillRect(sx - grow, sz - grow, Math.abs(bx - ax) + grow * 2, Math.abs(bz - az) + grow * 2);
    };
    rect(city.bounds, 'rgba(43,37,96,0.75)', 2 * MS);
    for (const r of city.roads || []) rect(r, 'rgba(240,240,250,0.95)');
    for (const b of city.boxes || []) if (b[5] > 3) rect([b[0] - b[2], b[1] - b[3], b[0] + b[2], b[1] + b[3]], 'rgba(150,140,210,0.9)');
    this.mapBg = bg;
  }

  // r: player racer, race: Race
  update(race, r, dt, colors) {
    const e = this.el;
    if (!r) return;
    // speedometer: the cars are small arcade versions of F1 cars, so speed is shown on an
    // F1-like scale (about 300 km/h flat out) rather than the tiny cars' true speed
    const kmh = Math.round(Math.abs(r.kart.speed) * SPEED_TO_KMH);
    if (kmh !== this.shownSpeed) { this.shownSpeed = kmh; e.speed.textContent = kmh; }
    if (r.place !== this.lastPlace) {
      e.posN.textContent = r.place;
      e.posS.textContent = ordinal(r.place).replace(/^\d+/, '').toUpperCase();
      e.pos.dataset.place = Math.min(4, r.place);
      e.pos.classList.remove('pop'); void e.pos.offsetWidth; e.pos.classList.add('pop');
      this.lastPlace = r.place;
    }
    e.pos.classList.toggle('hidden', race.racers.length < 2);
    const lap = Math.min(race.laps, Math.max(1, (race.online && r.serverLap != null ? r.serverLap : r.progress.lap) + 1));
    e.lap.textContent = r.finished ? race.laps : lap;
    e.lapOf.textContent = '/' + race.laps;
    const t = r.finished ? r.finishTime : race.state === 'countdown' ? 0 : race.time;
    e.time.textContent = fmtTime(t);
    e.wrong.classList.toggle('hidden', !(r.wrongT > 1.2) || r.finished);
    // item slot: roulette spin, then the item (with a count for multi-use items)
    const showSlot = !!race.items;
    e.item.classList.toggle('hidden', !showSlot);
    if (showSlot) {
      let key = 'empty';
      if (r.roulette > 0) key = 'spin:' + ICON_IDS[Math.floor(performance.now() / 70) % ICON_IDS.length];
      else if (r.item) key = r.item + ':' + r.itemCharges;
      if (key !== this.lastItemKey) {
        this.lastItemKey = key;
        e.item.classList.toggle('ready', key !== 'empty' && !key.startsWith('spin'));
        if (key === 'empty') e.itemIcon.innerHTML = '';
        else {
          const id = key.startsWith('spin') ? key.split(':')[1] : key.split(':')[0];
          e.itemIcon.innerHTML = itemIcon(id) + (r.itemCharges > 1 && !key.startsWith('spin') ? `<b class="hud-item-count">x${r.itemCharges}</b>` : '');
          e.item.classList.toggle('spinning', key.startsWith('spin'));
          if (!key.startsWith('spin')) { e.item.classList.remove('got'); void e.item.offsetWidth; e.item.classList.add('got'); }
        }
      }
    }
    // banner timeout and the countdown
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) e.banner.className = 'hud-banner'; }
    if (race.state === 'countdown') {
      const n = Math.ceil(race.countdown);
      if (n <= 3) { if (e.banner.textContent !== String(n)) this.banner(String(n), 'count n' + n, 1.2); }
      else if (race.online && race.countdown > 8 && e.banner.textContent !== 'WAITING...') this.banner('WAITING...', 'wait', 999);
    } else if (e.banner.textContent === 'WAITING...') e.banner.className = 'hud-banner';
    this.drawMap(race, r, colors);
  }

  // name tags over the other karts: place number and name
  tags(race, me, visuals, camera) {
    const box = this.el.tags;
    const list = race.racers.filter((x) => x !== me);
    while (this.tagEls.length < list.length) {
      const d = document.createElement('div');
      d.className = 'hud-tag';
      d.innerHTML = '<b></b><span></span>';
      box.appendChild(d);
      this.tagEls.push({ el: d, n: d.firstChild, name: d.lastChild, key: '' });
    }
    const W = innerWidth, H = innerHeight;
    this.tagEls.forEach((t, i) => {
      const r = list[i];
      const v = r && visuals[r.index];
      let show = false;
      if (r && v && !r.kart.respawnT && me) {
        const dx = v.x - me.kart.x, dz = v.z - me.kart.z;
        if (dx * dx + dz * dz < 75 * 75) {
          _v.set(v.x, v.y + 1.9, v.z).project(camera);
          if (_v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1) {
            show = true;
            t.el.style.transform = `translate(${((_v.x + 1) / 2 * W).toFixed(0)}px, ${((1 - _v.y) / 2 * H).toFixed(0)}px) translate(-50%, -100%)`;
            const key = r.place + ':' + r.name;
            if (key !== t.key) { t.key = key; t.n.textContent = r.place; t.name.textContent = String(r.name || '').toUpperCase(); }
          }
        }
      }
      t.el.style.display = show ? '' : 'none';
    });
  }

  lapList(r) {
    this.el.laps.innerHTML = r.lapTimes.map((t, i) => `<div>L${i + 1} ${fmtTime(t)}${t === r.bestLap && r.lapTimes.length > 1 ? ' <b>BEST</b>' : ''}</div>`).join('');
  }

  banner(text, kind = '', seconds = 1.6) {
    const b = this.el.banner;
    b.textContent = text;
    b.className = 'hud-banner';
    void b.offsetWidth;
    b.className = 'hud-banner show ' + kind;
    this.bannerT = seconds;
  }

  // messages at the top of the screen (hits, pause requests). key replaces an older
  // notice with the same key instead of stacking a new one.
  notice(text, kind = '', seconds = 3.2, key = null) {
    const box = this.el.notices;
    if (key) { const old = box.querySelector(`[data-key="${key}"]`); if (old) old.remove(); }
    const d = document.createElement('div');
    d.className = 'hud-notice ' + kind;
    if (key) d.dataset.key = key;
    d.textContent = text;
    d.style.animationDuration = seconds + 's';
    box.appendChild(d);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => d.remove(), seconds * 1000);
  }

  toast(text, kind = '') {
    const d = document.createElement('div');
    d.className = 'hud-toast ' + kind;
    d.textContent = text;
    this.el.toasts.appendChild(d);
    setTimeout(() => d.remove(), 2200);
  }

  drawMap(race, me, colors) {
    if (!this.mapBg) return;
    const g = this.mapCtx;
    g.clearRect(0, 0, MAP_W, MAP_W);
    g.drawImage(this.mapBg, 0, 0);
    // the other drivers: round tokens in their kart colour with their first letter
    g.font = '8px "Bungee", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const r of race.racers) {
      if (r === me) continue;
      const [x, z] = this.mapTf(r.kart.x, r.kart.z);
      g.fillStyle = '#2b2560'; g.beginPath(); g.arc(x, z, 5.5, 0, 7); g.fill();
      g.fillStyle = (colors && colors[r.index]) || '#ffffff'; g.beginPath(); g.arc(x, z, 4.3, 0, 7); g.fill();
      g.fillStyle = '#ffffff'; g.fillText(String(r.name || '?')[0].toUpperCase(), x, z + 0.5);
    }
    // you: a bigger token with a bright ring
    const [x, z] = this.mapTf(me.kart.x, me.kart.z);
    g.fillStyle = '#2b2560'; g.beginPath(); g.arc(x, z, 7.5, 0, 7); g.fill();
    g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(x, z, 6.3, 0, 7); g.fill();
    g.fillStyle = (colors && colors[me.index]) || '#ff4f9a'; g.beginPath(); g.arc(x, z, 4.6, 0, 7); g.fill();
    g.fillStyle = '#ffffff'; g.fillText(String(me.name || 'Y')[0].toUpperCase(), x, z + 0.5);
  }

  fps(text) {
    this.el.fps.classList.toggle('hidden', text == null);
    if (text != null) this.el.fps.textContent = text;
  }
}
