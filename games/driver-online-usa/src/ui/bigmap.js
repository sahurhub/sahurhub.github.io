// Driver Online USA - full-screen map (M). Drag to move, mouse wheel to zoom, M or Esc to close.
import { el } from '../core/util.js';
import { colorFor } from './hud.js';

export class BigMap {
  constructor(game) {
    this.g = game;
    this.node = el('div#bigmap', { hidden: true });
    this.canvas = el('canvas');
    this.node.append(this.canvas, el('div.hint', { text: 'Drag to move - mouse wheel to zoom - M to close' }));
    document.body.append(this.node);
    this.zoom = 0.45; this.cx = 0; this.cz = 0;
    let drag = null;
    this.canvas.addEventListener('mousedown', (e) => { drag = { x: e.clientX, y: e.clientY, cx: this.cx, cz: this.cz }; });
    window.addEventListener('mouseup', () => { drag = null; });
    window.addEventListener('mousemove', (e) => { if (!drag) return; this.cx = drag.cx - (e.clientX - drag.x) / this.zoom; this.cz = drag.cz - (e.clientY - drag.y) / this.zoom; });
    this.canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom = Math.max(0.2, Math.min(4, this.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); }, { passive: false });
  }

  get visible() { return !this.node.hidden; }
  toggle() { if (this.visible) this.close(); else this.open(); }
  open() {
    const p = this.g.focusPos();
    this.cx = p.x; this.cz = p.z;
    this.node.hidden = false;
    this.g.onUIChange && this.g.onUIChange();
  }
  close() { this.node.hidden = true; this.g.onUIChange && this.g.onUIChange(); }

  draw() {
    if (!this.visible) return;
    const c = this.canvas, dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(c.clientWidth * dpr), H = Math.round(c.clientHeight * dpr);
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const x = c.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = W / dpr, h = H / dpr;
    x.fillStyle = '#060b18'; x.fillRect(0, 0, w, h);
    const hud = this.g.hud;
    const toS = (wx, wz) => [w / 2 + (wx - this.cx) * this.zoom, h / 2 + (wz - this.cz) * this.zoom];
    if (hud.mapImg) {
      const [sx, sy] = toS(-hud.mapSize / 2, -hud.mapSize / 2);
      x.imageSmoothingEnabled = true;
      x.drawImage(hud.mapImg, sx, sy, hud.mapSize * this.zoom, hud.mapSize * this.zoom);
    }
    const layout = this.g.world.layout || {};
    x.font = '700 12px Inter, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    for (const gs of layout.gasStations || []) {
      const [sx, sy] = toS(gs.x, gs.z);
      x.fillStyle = '#36d399'; x.beginPath(); x.arc(sx, sy, 8, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#04140c'; x.fillText('G', sx, sy + 1);
      x.fillStyle = '#c9f5e2'; x.fillText(gs.name, sx, sy + 18);
    }
    for (const lm of layout.landmarks || []) {
      const [sx, sy] = toS(lm.x, lm.z);
      x.fillStyle = '#ffd25a'; x.beginPath(); x.arc(sx, sy, 5, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#ffe9a8'; x.fillText(lm.name, sx, sy + 15);
    }
    const drawArrow = (p, color, name, big) => {
      const [sx, sy] = toS(p.x, p.z);
      x.save(); x.translate(sx, sy); x.rotate(-p.h);
      x.fillStyle = color; x.strokeStyle = '#000'; x.lineWidth = 2;
      const s = big ? 1.3 : 1;
      x.beginPath(); x.moveTo(0, -11 * s); x.lineTo(8 * s, 8 * s); x.lineTo(0, 4 * s); x.lineTo(-8 * s, 8 * s); x.closePath(); x.stroke(); x.fill(); x.restore();
      x.fillStyle = '#fff'; x.font = '800 12px Inter, sans-serif'; x.fillText(name, sx, sy - 18);
    };
    for (const p of this.g.minimapPlayers()) drawArrow(p, p.color, p.name, false);
    const me = this.g.focusPos();
    drawArrow(me, '#ffffff', 'You', true);
    void colorFor;
  }
}
