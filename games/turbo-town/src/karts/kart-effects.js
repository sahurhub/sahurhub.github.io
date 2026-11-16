// TURBO TOWN - per-kart effects: drift smoke, sparks and skid marks, boost flames,
// off-road dust, landing puffs, splashes, wall sparks and trick sparkles.
import * as THREE from 'three';
import { SURF, SURF_PROPS } from '../shared/surfaces.js';

const _a = new THREE.Vector3();

export function kartEffects(k, vis, fx, dt, near, skids) {
  if (k.respawnT > 0 && !k.rescue) { if (skids) for (let i = 0; i < 2; i++) skids.wheel(k.id + ':' + i, 0, 0, 0, false); return; }
  const p = fx;
  const lod = near ? 1 : 0.35; // far karts emit fewer particles
  // drifting: tyre smoke, small blue-white sparks and skid marks from the rear wheels
  const drifting = k.drift.on && k.grounded && Math.abs(k.speed) > 6;
  vis.anchors.rearWheels.forEach((w, i) => {
    vis.worldPoint(w, _a);
    if (skids) skids.wheel(k.id + ':' + i, _a.x, (k.gy ?? _a.y), _a.z, drifting && !k.inWater);
    if (!drifting) return;
    p.emit({ x: _a.x, y: _a.y + 0.2, z: _a.z, vx: -k.vx * 0.12, vy: 1.2, vz: -k.vz * 0.12, spread: 1.6, color: '#ffffff', size: 0.55, life: 0.45, gravity: -1, drag: 0.6, alpha: 0.75 }, 1.3 * lod);
    p.emit({ x: _a.x, y: _a.y + 0.1, z: _a.z, vx: -k.vx * 0.1, vy: 2.2, vz: -k.vz * 0.1, spread: 3.5, color: '#bfe9ff', size: 0.14, life: 0.22, gravity: 14, drag: 0.2 }, 0.8 * lod);
  });
  // boost flames
  if (k.boostT > 0) {
    const kind = k.boostKind;
    // boosts (pads, items, rocket starts, tricks) use the player's boost colour
    const own = vis.boostColors;
    void kind;
    let c1 = own ? own[0] : '#ffb03b';
    if (c1 === 'rainbow') c1 = '#' + new THREE.Color().setHSL((k.time * 1.5) % 1, 1, 0.6).getHexString();
    for (const e of vis.anchors.exhaust) {
      vis.worldPoint(e, _a);
      const bx = -Math.sin(vis.yaw) * 6, bz = -Math.cos(vis.yaw) * 6;
      p.emit({ x: _a.x, y: _a.y, z: _a.z, vx: k.vx * 0.7 + bx, vy: 0.6, vz: k.vz * 0.7 + bz, spread: 1.2, color: c1, size: 0.5, life: 0.18, drag: 0.1 }, 1.6 * lod);
      p.emit({ x: _a.x, y: _a.y, z: _a.z, vx: k.vx * 0.8 + bx * 0.5, vy: 0.4, vz: k.vz * 0.8 + bz * 0.5, spread: 0.6, color: '#fff6a8', size: 0.3, life: 0.12, drag: 0.1 }, 1 * lod);
    }
  }
  // dust / snow / sand on soft ground
  const sp = SURF_PROPS[k.surf];
  if (k.grounded && sp && sp.dust && Math.abs(k.speed) > 6) {
    for (const w of vis.anchors.rearWheels) {
      vis.worldPoint(w, _a);
      p.emit({ x: _a.x, y: _a.y + 0.15, z: _a.z, vx: -k.vx * 0.15, vy: 1.4, vz: -k.vz * 0.15, spread: 2, color: sp.dust, size: 0.32, life: 0.4, gravity: 2, drag: 0.3, alpha: 0.55, colorVar: 0.15 }, 0.5 * lod);
    }
  }
  // water spray
  if (k.inWater && Math.abs(k.speed) > 4) {
    for (const w of vis.anchors.rearWheels) {
      vis.worldPoint(w, _a);
      p.emit({ x: _a.x, y: _a.y + 0.2, z: _a.z, vx: -k.vx * 0.1, vy: 3.2, vz: -k.vz * 0.1, spread: 3, color: '#dff6ff', size: 0.35, life: 0.45, gravity: 12, drag: 0.5 }, 1.4 * lod);
    }
  }
  // trick sparkles
  if (k.trickT > 0) {
    p.emit({ x: vis.x, y: vis.y + 0.8, z: vis.z, vx: k.vx * 0.5, vy: 1, vz: k.vz * 0.5, spread: 5, color: '#fff36b', size: 0.3, life: 0.4, drag: 0.2, colorVar: 0.6 }, 2 * lod);
  }
}

// one-off bursts for physics events
export function kartEventFx(e, k, vis, fx, cam, isPlayer) {
  switch (e.type) {
    case 'land':
      vis.land(e.v);
      fx.emit({ x: vis.x, y: vis.y + 0.1, z: vis.z, vy: 1.2, spread: 5, color: '#ffffff', size: 0.6, life: 0.4, drag: 0.1, alpha: 0.7 }, Math.min(14, 4 + e.v));
      if (isPlayer && e.v > 6) cam.bump(0.25);
      break;
    case 'wall': case 'bonk':
      fx.emit({ x: vis.x, y: vis.y + 0.5, z: vis.z, vy: 2, spread: 6, color: '#fff3a0', size: 0.25, life: 0.3, gravity: 10 }, 8);
      if (isPlayer) cam.bump(Math.min(0.5, e.v * 0.04));
      break;
    case 'bump':
      fx.emit({ x: vis.x, y: vis.y + 0.6, z: vis.z, vy: 2, spread: 5, color: '#ffffff', size: 0.3, life: 0.3, gravity: 6 }, 5);
      if (isPlayer) cam.bump(0.2);
      break;
    case 'splash':
      fx.emit({ x: vis.x, y: vis.y + 0.2, z: vis.z, vy: 5, spread: 6, color: '#e3f8ff', size: 0.5, life: 0.6, gravity: 14 }, 20);
      break;
    case 'boostPad':
      if (isPlayer) cam.bump(0.1);
      break;
    case 'hop':
      vis.bounceV += 0.8;
      break;
    case 'rescue':
      fx.emit({ x: vis.x, y: vis.y + 1, z: vis.z, vy: 1, spread: 4, color: '#ffffff', size: 0.7, life: 0.6, drag: 0.2, alpha: 0.8 }, 16);
      break;
    default: break;
  }
}

export { SURF };
