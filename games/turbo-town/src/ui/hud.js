// TURBO TOWN - in-race HUD: place, lap, race time, drift charge meter, item slot,
// big centre banners, small toasts and a minimap.
import { TIER_AT } from '../physics/kart-physics.js';
import { TIER_COLORS } from '../karts/kart-visual.js';
import { itemIcon, ICON_IDS } from './item-icons.js';

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// the minimap is drawn small and shown big, so it looks pixelated like the game
const MAP_W = 96, MS = MAP_W / 180;

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
      <div class="hud-pos"><span class="hud-pos-n">1</span><span class="hud-pos-s">st</span><span class="hud-pos-of">/1</span></div>
      <div class="hud-right">
        <div class="hud-lap">LAP <b>1</b>/3</div>
        <div class="hud-time">0:00.000</div>
        <div class="hud-laps"></div>
      </div>
      <div class="hud-item hidden"><div class="hud-item-box"><div class="hud-item-icon"></div></div><div class="hud-item-key">SPACE</div></div>
      <div class="hud-drift"><div class="hud-drift-label">DRIFT</div><div class="hud-drift-bar"><div class="hud-drift-fill"></div><i style="left:${(TIER_AT[1] / TIER_AT[3]) * 100}%"></i><i style="left:${(TIER_AT[2] / TIER_AT[3]) * 100}%"></i></div></div>
      <canvas class="hud-map" width="${MAP_W}" height="${MAP_W}"></canvas>
      <div class="hud-board"></div>
      <div class="hud-banner"></div>
      <div class="hud-toasts"></div>
      <div class="hud-wrong hidden">WRONG WAY!</div>
      <div class="hud-fps hidden"></div>`;
    const $ = (s) => root.querySelector(s);
    this.el = {
      posN: $('.hud-pos-n'), posS: $('.hud-pos-s'), posOf: $('.hud-pos-of'), pos: $('.hud-pos'),
      lap: $('.hud-lap b'), lapOf: $('.hud-lap'), time: $('.hud-time'), laps: $('.hud-laps'),
      driftFill: $('.hud-drift-fill'), drift: $('.hud-drift'), banner: $('.hud-banner'), toasts: $('.hud-toasts'),
      wrong: $('.hud-wrong'), map: $('.hud-map'), fps: $('.hud-fps'), item: $('.hud-item'), itemIcon: $('.hud-item-icon'), board: $('.hud-board'),
    };
    this.boardT = 0;
    this.mapCtx = this.el.map.getContext('2d');
    this.lastPlace = 0;
    this.bannerT = 0;
  }

  show(on) { this.root.classList.toggle('hidden', !on); }

  setupMap(track) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of track.main.pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
    const W = MAP_W, pad = 12 * MS;
    const sc = Math.min((W - pad * 2) / (x1 - x0), (W - pad * 2) / (z1 - z0));
    const ox = (W - (x1 - x0) * sc) / 2, oz = (W - (z1 - z0) * sc) / 2;
    this.mapTf = (x, z) => [ox + (x - x0) * sc, oz + (z - z0) * sc];
    const bg = document.createElement('canvas');
    bg.width = bg.height = W;
    const g = bg.getContext('2d');
    g.lineJoin = 'miter'; g.lineCap = 'square';
    const draw = (path, width, color) => {
      g.beginPath();
      path.pts.forEach((p, i) => { const [x, z] = this.mapTf(p.x, p.z); i ? g.lineTo(x, z) : g.moveTo(x, z); });
      if (path.closed) g.closePath();
      g.strokeStyle = color; g.lineWidth = width; g.stroke();
    };
    for (const path of track.paths) if (!path.hidden) draw(path, path.id === 'main' ? 6 : 4, '#2b2560');
    for (const path of track.paths) if (!path.hidden) draw(path, path.id === 'main' ? 4 : 2, '#ffffff');
    const [sx, sz] = this.mapTf(track.main.pts[0].x, track.main.pts[0].z);
    g.fillStyle = '#ff4f9a'; g.fillRect(Math.round(sx) - 2, Math.round(sz) - 2, 4, 4);
    this.mapBg = bg;
  }

  // r: player racer, race: Race, extra: { fps }
  update(race, r, dt, colors) {
    const e = this.el;
    if (!r) return;
    const k = r.kart;
    if (r.place !== this.lastPlace) {
      e.posN.textContent = r.place;
      e.posS.textContent = ordinal(r.place).replace(/^\d+/, '');
      e.pos.dataset.place = Math.min(4, r.place);
      e.pos.classList.remove('pop'); void e.pos.offsetWidth; e.pos.classList.add('pop');
      this.lastPlace = r.place;
    }
    e.posOf.textContent = '/' + race.racers.length;
    const lap = Math.min(race.laps, Math.max(1, (race.online && r.serverLap != null ? r.serverLap : r.progress.lap) + 1));
    e.lap.textContent = r.finished ? race.laps : lap;
    e.lapOf.lastChild.textContent = '/' + race.laps;
    const t = r.finished ? r.finishTime : race.state === 'countdown' ? 0 : race.time;
    e.time.textContent = fmtTime(t);
    // drift meter
    const d = k.drift;
    const f = d.on ? Math.min(1, d.charge / TIER_AT[3]) : 0;
    e.driftFill.style.width = (f * 100).toFixed(1) + '%';
    e.driftFill.style.background = TIER_COLORS[d.tier] === '#ffffff' ? '#ffffffcc' : TIER_COLORS[d.tier];
    e.drift.classList.toggle('on', d.on);
    e.drift.dataset.tier = d.tier;
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
        if (key === 'empty') e.itemIcon.innerHTML = '';
        else {
          const id = key.split(':')[1] && key.startsWith('spin') ? key.split(':')[1] : key.split(':')[0];
          e.itemIcon.innerHTML = itemIcon(id) + (r.itemCharges > 1 && !key.startsWith('spin') ? `<b class="hud-item-count">x${r.itemCharges}</b>` : '');
          e.item.classList.toggle('spinning', key.startsWith('spin'));
          if (!key.startsWith('spin')) { e.item.classList.remove('got'); void e.item.offsetWidth; e.item.classList.add('got'); }
        }
      }
    }
    // banner timeout
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) e.banner.className = 'hud-banner'; }
    if (race.state === 'countdown') {
      const n = Math.ceil(race.countdown);
      if (e.banner.textContent !== String(n)) this.banner(String(n), 'count', 1.2);
    }
    this.drawMap(race, r, colors);
    // standings: everyone's place, name and lap (refreshed a few times a second)
    this.boardT -= dt;
    if (this.boardT <= 0 && race.racers.length > 1) {
      this.boardT = 0.25;
      const rows = race.standings().map((x) => {
        const lapN = race.online && x.serverLap != null ? x.serverLap : x.progress.lap;
        const lapTxt = x.finished ? 'done' : 'L' + Math.min(race.laps, lapN + 1);
        return `<div class="hb${x === r ? ' me' : ''}"><b>${x.place}</b><i style="background:${(colors && colors[x.index]) || '#fff'}"></i><span>${esc(x.name)}</span><em>${lapTxt}</em></div>`;
      });
      e.board.innerHTML = rows.join('');
    }
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
    // other racers: small square blocks with a dark border
    for (const r of race.racers) {
      if (r === me) continue;
      const [x, z] = this.mapTf(r.kart.x, r.kart.z);
      const px = Math.round(x), pz = Math.round(z);
      g.fillStyle = '#2b2560'; g.fillRect(px - 3, pz - 3, 6, 6);
      g.fillStyle = (colors && colors[r.index]) || '#ffffff'; g.fillRect(px - 2, pz - 2, 4, 4);
    }
    const [x, z] = this.mapTf(me.kart.x, me.kart.z);
    g.save();
    g.translate(Math.round(x), Math.round(z));
    g.rotate(-me.kart.yaw + Math.PI);
    g.fillStyle = '#ff3d71'; g.strokeStyle = '#2b2560'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, -5); g.lineTo(4, 4); g.lineTo(0, 2); g.lineTo(-4, 4); g.closePath(); g.fill(); g.stroke();
    g.restore();
  }

  fps(text) {
    this.el.fps.classList.toggle('hidden', text == null);
    if (text != null) this.el.fps.textContent = text;
  }
}
