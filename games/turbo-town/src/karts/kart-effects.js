// TURBO TOWN - per-kart effects: drift sparks (colour shows the charge tier), boost
// flames, off-road dust, landing puffs, splashes, wall sparks and trick sparkles.
import * as THREE from 'three';
import { SURF, SURF_PROPS } from '../shared/surfaces.js';
import { TIER_COLORS } from './kart-visual.js';

const _a = new THREE.Vector3();

export function kartEffects(k, vis, fx, dt, near) {
  if (k.respawnT > 0 && !k.rescue) return;
  const p = fx;
  const lod = near ? 1 : 0.35; // far karts emit fewer particles
  // drift sparks from the outer rear wheel
  if (k.drift.on && k.grounded) {
    const col = TIER_COLORS[k.drift.tier];
    for (const w of vis.anchors.rearWheels) {
      vis.worldPoint(w, _a);
      p.emit({ x: _a.x, y: _a.y + 0.1, z: _a.z, vx: -k.vx * 0.1, vy: 2.5, vz: -k.vz * 0.1, spread: 3.5, color: col, size: k.drift.tier ? 0.28 : 0.16, life: 0.28, gravity: 14, drag: 0.2 }, (k.drift.tier ? 2.2 : 0.9) * lod);
    }
  }
  // boost flames
  if (k.boostT > 0) {
    const kind = k.boostKind;
    // drift boosts show their tier colour; other boosts use the player's boost colour
    const own = vis.boostColors;
    let c1 = kind === 'drift3' ? '#ff5cf0' : kind === 'drift1' ? '#5cf2ff' : own ? own[0] : '#ffb03b';
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
    case 'miniTurbo':
      fx.emit({ x: vis.x, y: vis.y + 0.4, z: vis.z, vy: 1.5, spread: 6, color: TIER_COLORS[e.v], size: 0.4, life: 0.35, drag: 0.2 }, 10 + e.v * 4);
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
