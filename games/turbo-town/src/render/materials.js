// TURBO TOWN - shared materials and small procedural textures.
import * as THREE from 'three';

let toonGradient = null;
function gradient() {
  if (toonGradient) return toonGradient;
  // 4 soft bands: keeps shapes readable and cartoony without going dark
  const data = new Uint8Array([150, 200, 235, 255]);
  toonGradient = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);
  toonGradient.minFilter = toonGradient.magFilter = THREE.NearestFilter;
  toonGradient.needsUpdate = true;
  return toonGradient;
}

const cache = new Map();

// Material for vertex-coloured models. toon = cartoon bands (karts, characters, props).
export function vcMaterial({ toon = true, map = null, emissive = null, side = THREE.FrontSide, transparent = false, opacity = 1 } = {}) {
  const key = [toon, map && map.uuid, emissive, side, transparent, opacity].join('|');
  if (cache.has(key)) return cache.get(key);
  const o = { vertexColors: true, side, transparent, opacity };
  if (map) o.map = map;
  if (emissive) { o.emissive = new THREE.Color(emissive); }
  const m = toon ? new THREE.MeshToonMaterial({ ...o, gradientMap: gradient() }) : new THREE.MeshLambertMaterial(o);
  cache.set(key, m);
  return m;
}

export function colorMaterial(color, { toon = true, emissive = null, transparent = false, opacity = 1 } = {}) {
  const key = 'c|' + color + '|' + toon + '|' + emissive + '|' + transparent + '|' + opacity;
  if (cache.has(key)) return cache.get(key);
  const o = { color: new THREE.Color(color), transparent, opacity };
  if (emissive) o.emissive = new THREE.Color(emissive);
  const m = toon ? new THREE.MeshToonMaterial({ ...o, gradientMap: gradient() }) : new THREE.MeshLambertMaterial(o);
  cache.set(key, m);
  return m;
}

// ------------------------------------------------------------------ canvas textures

function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}

// Road surface: soft cobbles / paving in the map's colours (white = no tint, colours
// come from vertex colours so the same texture works on every map).
export function roadTexture(style = 'cobble') {
  const key = 'road|' + style;
  if (cache.has(key)) return cache.get(key);
  const r = rng(7);
  const t = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, w, h);
    if (style === 'cobble') {
      const rows = 8, cols = 6;
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const ox = (y % 2) * (w / cols / 2);
        const cx = x * w / cols + ox + w / cols / 2, cy = y * h / rows + h / rows / 2;
        const v = 225 + Math.floor(r() * 30);
        g.fillStyle = `rgb(${v},${v},${v})`;
        roundRect(g, cx - w / cols / 2 + 3, cy - h / rows / 2 + 3, w / cols - 6, h / rows - 6, 9);
        g.fill();
        if (x === cols - 1) { roundRect(g, cx - w / cols / 2 + 3 - w, cy - h / rows / 2 + 3, w / cols - 6, h / rows - 6, 9); g.fill(); }
      }
    } else if (style === 'smooth') {
      for (let i = 0; i < 900; i++) {
        const v = 220 + Math.floor(r() * 35);
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.fillRect(r() * w, r() * h, 2, 2);
      }
    } else if (style === 'planks') {
      for (let y = 0; y < 8; y++) {
        const v = 215 + Math.floor(r() * 35);
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.fillRect(0, y * h / 8 + 2, w, h / 8 - 4);
        g.fillStyle = 'rgba(0,0,0,0.12)';
        g.fillRect(r() * w, y * h / 8 + 2, 3, h / 8 - 4);
      }
    }
  });
  cache.set(key, t);
  return t;
}

// Grass / ground detail: speckles that break up big flat areas.
export function groundTexture() {
  if (cache.has('ground')) return cache.get('ground');
  const r = rng(11);
  const t = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 500; i++) {
      const v = 210 + Math.floor(r() * 45);
      g.fillStyle = `rgb(${v},${v},${v})`;
      const s = 1 + r() * 3;
      g.fillRect(r() * w, r() * h, s, s);
    }
  });
  cache.set('ground', t);
  return t;
}

// Boost pad arrows (scrolled in the shader by moving the texture offset).
export function boostTexture() {
  if (cache.has('boost')) return cache.get('boost');
  const t = canvasTex(64, 128, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#ff9f1c'); grd.addColorStop(1, '#ffdd00');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff6';
    for (let i = 0; i < 2; i++) {
      const y = i * h / 2;
      g.beginPath(); g.moveTo(8, y + 46); g.lineTo(w / 2, y + 14); g.lineTo(w - 8, y + 46); g.lineTo(w - 8, y + 58); g.lineTo(w / 2, y + 28); g.lineTo(8, y + 58); g.closePath(); g.fill();
    }
  });
  cache.set('boost', t);
  return t;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

export { canvasTex, rng };
