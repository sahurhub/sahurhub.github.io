// Procedural canvas textures: roads, ground, facades (with night glow maps), sign atlas, icons.
import * as THREE from 'three';
import { rng } from './utils.js';

const FONT = '"Fredoka", "Trebuchet MS", sans-serif';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function tex(c, repeat = true, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}
function noise(ctx, w, h, base, amp, n, seed) {
  const r = rng(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    const v = Math.floor((r() - 0.5) * amp);
    ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v / 255})` : `rgba(0,0,0,${-v / 255})`;
    const s = 1 + r() * 2.5;
    ctx.fillRect(r() * w, r() * h, s, s);
  }
}

export const TEX = {};

export function buildTextures() {
  // asphalt
  let [c, x] = canvas(256, 256);
  noise(x, 256, 256, '#4a4f58', 26, 5000, 1);
  TEX.asphalt = tex(c);

  // road straight: u across the 14 m road, v along (one tile = 12 m)
  [c, x] = canvas(256, 256);
  noise(x, 256, 256, '#4a4f58', 26, 5000, 2);
  const U = m => (m / 14 + 0.5) * 256;
  x.fillStyle = '#f4f1ea';
  x.fillRect(U(-5.6) - 2, 0, 4, 256);
  x.fillRect(U(5.6) - 2, 0, 4, 256);
  x.fillStyle = '#ffd23f';
  for (let i = 0; i < 2; i++) x.fillRect(U(0) - 3, i * 128 + 20, 6, 70);
  TEX.road = tex(c);

  // crosswalk stripes (u across road, v = 3 m deep)
  [c, x] = canvas(256, 64);
  x.clearRect(0, 0, 256, 64);
  x.fillStyle = 'rgba(244,241,234,0.95)';
  for (let i = 0; i < 9; i++) x.fillRect(8 + i * 28, 4, 16, 56);
  TEX.crosswalk = tex(c, false);

  // sidewalk tiles (1 tile = 4 m)
  [c, x] = canvas(128, 128);
  noise(x, 128, 128, '#c9c4bb', 18, 900, 3);
  x.strokeStyle = 'rgba(0,0,0,0.13)';
  x.lineWidth = 2;
  for (let i = 0; i <= 2; i++) {
    x.beginPath(); x.moveTo(i * 64, 0); x.lineTo(i * 64, 128); x.stroke();
    x.beginPath(); x.moveTo(0, i * 64); x.lineTo(128, i * 64); x.stroke();
  }
  TEX.sidewalk = tex(c);

  // grass
  [c, x] = canvas(256, 256);
  noise(x, 256, 256, '#6cc24a', 30, 7000, 4);
  TEX.grass = tex(c);

  // concrete slabs (industrial / airport)
  [c, x] = canvas(256, 256);
  noise(x, 256, 256, '#a7a9ad', 20, 4000, 5);
  x.strokeStyle = 'rgba(0,0,0,0.12)';
  x.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    x.beginPath(); x.moveTo(i * 64, 0); x.lineTo(i * 64, 256); x.stroke();
    x.beginPath(); x.moveTo(0, i * 64); x.lineTo(256, i * 64); x.stroke();
  }
  TEX.concrete = tex(c);

  // plaza paving
  [c, x] = canvas(128, 128);
  noise(x, 128, 128, '#d9cbb3', 16, 900, 6);
  x.strokeStyle = 'rgba(120,90,60,0.18)';
  for (let i = 0; i <= 4; i++) {
    x.beginPath(); x.moveTo(i * 32, 0); x.lineTo(i * 32, 128); x.stroke();
    x.beginPath(); x.moveTo(0, i * 32); x.lineTo(128, i * 32); x.stroke();
  }
  TEX.plaza = tex(c);

  // runway (u across 40 m, v along 30 m tile)
  [c, x] = canvas(256, 256);
  noise(x, 256, 256, '#3d4148', 20, 4000, 7);
  x.fillStyle = '#f4f1ea';
  x.fillRect(6, 0, 5, 256); x.fillRect(245, 0, 5, 256);
  x.fillRect(124, 30, 8, 110);
  TEX.runway = tex(c);

  buildFacades();
  TEX.icons = buildIcons();
  return TEX;
}

// ------------------------------------------------------------------ facades
// Each style is a 512 px texture covering 16 x 16 m (4 floors x 4 bays). The "lit" texture is the
// emissive map: random windows glow at night.
function buildFacades() {
  const styles = [
    { name: 'glass', wall: '#9fb6c9', frame: '#55697c', glass: '#3e6d93', bay: 'full' },
    { name: 'office', wall: '#e7e1d6', frame: '#b9b0a2', glass: '#46698a', bay: 'punched' },
    { name: 'ribbon', wall: '#f2efe9', frame: '#c8c2b8', glass: '#33536f', bay: 'ribbon' },
    { name: 'brick', wall: '#b9644a', frame: '#7d3f2e', glass: '#3a556e', bay: 'punched2' },
  ];
  TEX.facade = [];
  TEX.facadeLit = [];
  styles.forEach((st, si) => {
    const [c, x] = canvas(512, 512);
    const [cl, xl] = canvas(512, 512);
    const r = rng(100 + si);
    x.fillStyle = st.wall;
    x.fillRect(0, 0, 512, 512);
    noise(x, 512, 512, st.wall, 14, 3000, 200 + si);
    xl.fillStyle = '#000';
    xl.fillRect(0, 0, 512, 512);
    const cell = 128;   // 4 m
    for (let fy = 0; fy < 4; fy++) {
      for (let bx = 0; bx < 4; bx++) {
        let wx, wy, ww, wh;
        if (st.bay === 'full') { wx = 4; wy = 10; ww = 120; wh = 104; }
        else if (st.bay === 'ribbon') { wx = 0; wy = 30; ww = 128; wh = 60; }
        else if (st.bay === 'punched') { wx = 22; wy = 24; ww = 84; wh = 74; }
        else { wx = 30; wy = 20; ww = 68; wh = 82; }
        const px = bx * cell + wx, py = fy * cell + wy;
        x.fillStyle = st.frame;
        x.fillRect(px - 4, py - 4, ww + 8, wh + 8);
        const g = x.createLinearGradient(px, py, px + ww, py + wh);
        g.addColorStop(0, st.glass);
        g.addColorStop(1, shade(st.glass, 0.25));
        x.fillStyle = g;
        x.fillRect(px, py, ww, wh);
        x.fillStyle = 'rgba(255,255,255,0.18)';
        x.fillRect(px + 6, py + 6, ww * 0.25, wh - 12);
        x.fillStyle = st.frame;
        if (st.bay !== 'ribbon') x.fillRect(px + ww / 2 - 2, py, 4, wh);
        else for (let k = 1; k < 4; k++) x.fillRect(px + k * 32 - 2, py, 4, wh);
        // night glow
        if (r() < 0.42) {
          const warm = r() < 0.8;
          xl.fillStyle = warm ? `rgba(255,${200 + Math.floor(r() * 40)},${110 + Math.floor(r() * 60)},1)` : 'rgba(170,215,255,1)';
          xl.fillRect(px, py, ww, wh);
        }
      }
      if (st.bay === 'office' || st.bay === 'punched') {
        x.fillStyle = shade(st.wall, 0.12);
        x.fillRect(0, fy * cell + 120, 512, 8);
      }
    }
    TEX.facade.push(tex(c));
    TEX.facadeLit.push(tex(cl));
  });
}

function shade(hex, k) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(1 - k);
  return '#' + c.getHexString();
}

// ------------------------------------------------------------------ sign atlas
// names: array of {text, bg, fg}. Returns {texture, uv(i) -> [u0, v0, u1, v1]}
export function buildSignAtlas(names) {
  const cols = 8, cw = 256, ch = 64;
  const rows = Math.max(1, Math.ceil(names.length / cols));
  const H = Math.min(4096, THREE.MathUtils.ceilPowerOfTwo(rows * ch));
  const [c, x] = canvas(cols * cw, H);
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  names.forEach((n, i) => {
    const cx = (i % cols) * cw, cy = Math.floor(i / cols) * ch;
    x.fillStyle = n.bg;
    roundRect(x, cx + 2, cy + 2, cw - 4, ch - 4, 12);
    x.fill();
    x.fillStyle = n.fg;
    let size = 34;
    x.font = `700 ${size}px ${FONT}`;
    while (x.measureText(n.text).width > cw - 22 && size > 14) {
      size -= 2;
      x.font = `700 ${size}px ${FONT}`;
    }
    x.fillText(n.text, cx + cw / 2, cy + ch / 2 + 2);
  });
  const t = tex(c, false);
  t.flipY = true;
  return {
    texture: t,
    uv(i) {
      const cx = (i % cols) * cw, cy = Math.floor(i / cols) * ch;
      return [cx / c.width, 1 - (cy + ch) / H, (cx + cw) / c.width, 1 - cy / H];
    },
  };
}

export function textTexture(text, { w = 512, h = 128, bg = '#ff7a1f', fg = '#ffffff', size = 72, radius = 24 } = {}) {
  const [c, x] = canvas(w, h);
  x.fillStyle = bg;
  roundRect(x, 0, 0, w, h, radius);
  x.fill();
  x.fillStyle = fg;
  x.font = `700 ${size}px ${FONT}`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  let s = size;
  while (x.measureText(text).width > w - 30 && s > 12) { s -= 4; x.font = `700 ${s}px ${FONT}`; }
  x.fillText(text, w / 2, h / 2 + 4);
  return tex(c, false);
}

export function roundRect(x, px, py, w, h, r) {
  x.beginPath();
  x.moveTo(px + r, py);
  x.arcTo(px + w, py, px + w, py + h, r);
  x.arcTo(px + w, py + h, px, py + h, r);
  x.arcTo(px, py + h, px, py, r);
  x.arcTo(px, py, px + w, py, r);
  x.closePath();
}

// ------------------------------------------------------------------ marker icons
function buildIcons() {
  const icons = {};
  const draw = (name, bg, fn) => {
    const [c, x] = canvas(128, 128);
    x.fillStyle = bg;
    x.beginPath(); x.arc(64, 64, 58, 0, Math.PI * 2); x.fill();
    x.lineWidth = 8; x.strokeStyle = '#ffffff'; x.stroke();
    x.fillStyle = '#ffffff'; x.strokeStyle = '#ffffff';
    fn(x);
    icons[name] = tex(c, false);
    icons[name + '_canvas'] = c;
  };
  draw('pickup', '#2f80ed', x => {           // box with up arrow
    x.fillRect(36, 58, 56, 40);
    x.beginPath(); x.moveTo(64, 22); x.lineTo(86, 48); x.lineTo(42, 48); x.closePath(); x.fill();
  });
  draw('drop', '#27ae60', x => {             // house
    x.beginPath(); x.moveTo(64, 26); x.lineTo(98, 58); x.lineTo(30, 58); x.closePath(); x.fill();
    x.fillRect(40, 58, 48, 38);
    x.fillStyle = '#27ae60'; x.fillRect(58, 72, 14, 24);
  });
  draw('job', '#ff7a1f', x => {              // clipboard
    x.fillRect(40, 30, 48, 66);
    x.fillStyle = '#ff7a1f';
    for (let i = 0; i < 3; i++) x.fillRect(48, 46 + i * 14, 32, 6);
  });
  draw('garage', '#8f4bd6', x => {           // wrench-ish
    x.lineWidth = 12; x.lineCap = 'round';
    x.beginPath(); x.moveTo(44, 86); x.lineTo(80, 50); x.stroke();
    x.beginPath(); x.arc(84, 44, 14, 0, Math.PI * 2); x.stroke();
  });
  draw('dealer', '#2b7de9', x => {           // car
    x.fillRect(30, 60, 68, 22);
    x.fillRect(44, 44, 40, 20);
    x.fillStyle = '#2b7de9';
    x.beginPath(); x.arc(46, 84, 9, 0, Math.PI * 2); x.arc(82, 84, 9, 0, Math.PI * 2); x.fill();
  });
  draw('trial', '#e5383b', x => {            // flag
    x.fillRect(40, 28, 7, 72);
    x.fillRect(47, 30, 42, 28);
  });
  draw('event', '#f2c94c', x => {            // star
    star(x, 64, 64, 34, 15);
  });
  draw('waypoint', '#e94f9a', x => {
    x.beginPath(); x.arc(64, 54, 18, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.moveTo(46, 60); x.lineTo(82, 60); x.lineTo(64, 98); x.closePath(); x.fill();
  });
  return icons;
}

export function star(x, cx, cy, R, r) {
  x.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const rr = i % 2 ? r : R;
    x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  x.closePath();
  x.fill();
}
