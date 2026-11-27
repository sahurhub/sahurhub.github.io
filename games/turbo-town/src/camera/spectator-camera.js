// TURBO TOWN - cameras for watching an online race (people who joined the party mid-race).
//   broadcast: TV cameras on poles round the track, like F1 coverage. The one nearest the car
//              you watch follows it and zooms in, cutting to the next camera as it drives on.
//   player:    exactly what that player sees (their chase camera).
//   free:      fly anywhere: W/S forward and back, A/D sideways, arrow keys (or drag with the
//              mouse) to look, Space up, Shift down. It is kept inside the map and below a
//              ceiling, so you can never see past the edge of the world.
// C changes camera, Q/E (or [ and ]) watches the previous / next racer.
import * as THREE from 'three';
import { pointAt } from '../shared/track-math.js';

export const SPECTATE_MODES = ['broadcast', 'player', 'free'];
export const MODE_NAMES = { broadcast: 'Broadcast', player: 'Player', free: 'Free camera' };

const _dir = new THREE.Vector3();

export class SpectatorCam {
  constructor(game) {
    this.game = game;
    this.mode = 'broadcast';
    this.onChange = () => {};
    const track = game.map.track;
    const groundAt = game.map.ctx.groundAt;
    // TV camera spots: every 80 m, on the outside of the bend, up on a pole
    this.tv = [];
    for (let s = 0; s < track.length; s += 80) {
      const p = pointAt(track.main, s);
      const side = p.curv ? -Math.sign(p.curv) : (this.tv.length % 2 ? 1 : -1);
      const off = p.w / 2 + 11;
      const x = p.x + p.rx * off * side, z = p.z + p.rz * off * side;
      const y = Math.max(groundAt(x, z, p.y + 40), p.y) + 7;
      this.tv.push(new THREE.Vector3(x, y, z));
    }
    this.tvIndex = -1;
    this.fov = 40;
    // the free camera's box: the track area plus a little, up to a ceiling
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y1 = -Infinity;
    for (const path of track.paths) for (const p of path.pts) {
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); y1 = Math.max(y1, p.y);
    }
    this.bounds = { x0: x0 - 25, x1: x1 + 25, z0: z0 - 25, z1: z1 + 25, top: y1 + 28 };
    this.free = { x: 0, y: 10, z: 0, yaw: 0, pitch: -0.3 };
    this.keys = new Set();
    const typing = (e) => { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable); };
    this.onDown = (e) => {
      if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      this.keys.add(e.code);
      if (e.repeat) return;
      if (e.code === 'KeyC') this.nextMode();
      else if (e.code === 'KeyQ' || e.code === 'BracketLeft') this.switchFocus(-1);
      else if (e.code === 'KeyE' || e.code === 'BracketRight') this.switchFocus(1);
      if (this.mode === 'free' && /^(Arrow|Space)/.test(e.code)) e.preventDefault();
    };
    this.onUp = (e) => this.keys.delete(e.code);
    this.onBlur = () => this.keys.clear();
    // drag with the mouse to look around in the free camera
    this.onMove = (e) => {
      if (this.mode !== 'free' || !(e.buttons & 1)) return;
      this.free.yaw -= e.movementX * 0.005;
      this.free.pitch = Math.max(-1.35, Math.min(0.25, this.free.pitch - e.movementY * 0.004));
    };
    addEventListener('keydown', this.onDown);
    addEventListener('keyup', this.onUp);
    addEventListener('blur', this.onBlur);
    this.canvas = game.r.renderer.domElement;
    this.canvas.addEventListener('pointermove', this.onMove);
    // start on the leader
    const lead = game.race.racers.reduce((a, r) => (!a || r.place < a.place ? r : a), null);
    game.focus = lead ? lead.index : 0;
  }

  dispose() {
    removeEventListener('keydown', this.onDown);
    removeEventListener('keyup', this.onUp);
    removeEventListener('blur', this.onBlur);
    this.canvas.removeEventListener('pointermove', this.onMove);
  }

  setMode(mode) {
    if (mode === this.mode) return;
    if (mode === 'free') {
      // the free camera starts where the camera is now, looking the same way
      const cam = this.game.r.camera;
      cam.getWorldDirection(_dir);
      Object.assign(this.free, { x: cam.position.x, y: cam.position.y, z: cam.position.z, yaw: Math.atan2(_dir.x, _dir.z), pitch: Math.max(-1.35, Math.min(0.25, Math.asin(_dir.y))) });
    }
    if (mode === 'player') this.game.cam.snap();
    if (mode === 'broadcast') this.tvIndex = -1;
    this.mode = mode;
    this.onChange();
  }

  nextMode() { this.setMode(SPECTATE_MODES[(SPECTATE_MODES.indexOf(this.mode) + 1) % SPECTATE_MODES.length]); }

  switchFocus(d) {
    const n = this.game.race.racers.length;
    this.game.focus = ((this.game.focus || 0) + d + n) % n;
    this.game.cam.snap();
    this.tvIndex = -1;
    this.onChange();
  }

  // after the chase camera has followed the watched car (v = its visual)
  update(dt, v) {
    const cam = this.game.r.camera;
    if (this.mode === 'broadcast') this.broadcast(dt, v, cam);
    else if (this.mode === 'free') this.flyFree(dt, cam);
  }

  broadcast(dt, v, cam) {
    // the nearest TV camera; only cut to another when it is clearly closer (no flicker)
    let best = 0, bd = Infinity;
    this.tv.forEach((c, i) => { const d = (c.x - v.x) ** 2 + (c.z - v.z) ** 2; if (d < bd) { bd = d; best = i; } });
    let cut = false;
    if (this.tvIndex < 0) { this.tvIndex = best; cut = true; } else if (best !== this.tvIndex) {
      const cur = this.tv[this.tvIndex];
      const dc = (cur.x - v.x) ** 2 + (cur.z - v.z) ** 2;
      if (bd < dc * 0.55 || dc > 140 * 140) { this.tvIndex = best; cut = true; }
    }
    const c = this.tv[this.tvIndex];
    cam.position.copy(c);
    cam.lookAt(v.x, v.y + 0.8, v.z);
    // zoom so the car stays a good size on screen
    const dist = Math.max(4, Math.hypot(c.x - v.x, c.y - v.y, c.z - v.z));
    const want = Math.max(14, Math.min(55, 2 * Math.atan(9 / dist) * 180 / Math.PI));
    this.fov = cut ? want : this.fov + (want - this.fov) * (1 - Math.exp(-dt * 4));
    cam.fov = this.fov;
    cam.updateProjectionMatrix();
  }

  flyFree(dt, cam) {
    const f = this.free, k = this.keys, b = this.bounds;
    const turn = 1.7 * dt, look = 1.2 * dt, sp = 30 * dt;
    if (k.has('ArrowLeft')) f.yaw += turn;
    if (k.has('ArrowRight')) f.yaw -= turn;
    if (k.has('ArrowUp')) f.pitch = Math.min(0.25, f.pitch + look);
    if (k.has('ArrowDown')) f.pitch = Math.max(-1.35, f.pitch - look);
    const fx = Math.sin(f.yaw), fz = Math.cos(f.yaw);
    const rx = -fz, rz = fx; // to the right of the way you face
    const fwd = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    const side = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const up = (k.has('Space') ? 1 : 0) - (k.has('ShiftLeft') || k.has('ShiftRight') ? 1 : 0);
    f.x += (fx * fwd + rx * side) * sp;
    f.z += (fz * fwd + rz * side) * sp;
    f.y += up * sp * 0.8;
    // the invisible walls: inside the map, above the ground, under the ceiling
    f.x = Math.max(b.x0, Math.min(b.x1, f.x));
    f.z = Math.max(b.z0, Math.min(b.z1, f.z));
    const g = this.game.map.ctx.groundAt(f.x, f.z, f.y + 50);
    f.y = Math.max(g + 1.5, Math.min(b.top, f.y));
    cam.position.set(f.x, f.y, f.z);
    _dir.set(Math.sin(f.yaw) * Math.cos(f.pitch), Math.sin(f.pitch), Math.cos(f.yaw) * Math.cos(f.pitch));
    cam.lookAt(f.x + _dir.x, f.y + _dir.y, f.z + _dir.z);
    cam.fov = 62;
    cam.updateProjectionMatrix();
  }
}
