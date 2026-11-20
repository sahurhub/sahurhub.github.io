// TURBO TOWN - builds the collision world for a city map (Turbo City, the free roam map).
// A city has no race track to follow: you can drive anywhere inside its edge. Everything
// comes from the layout file the Blender script writes next to the model
// (shared/maps/turbo-city-layout.js), so the walls match what you see:
//   bounds  [x0, z0, x1, z1]               the drivable area (a wall all round)
//   ground  [[x0, z0, x1, z1, y, surface]]  flat areas that are not plain road (grass, boost)
//   slopes  [[ax, ay, az, bx, by, bz, cx, cy, cz, surface]]  ramps and the parking deck
//   boxes   [[x, z, hx, hz, y0, y1]]        buildings and walls (hx, hz = half width, depth)
//   posts   [[x, z, r, top]]                lamp posts, trees, the fountain
//   spawns  [[x, z, yaw]]                   where cars start
// The map still has a track (the ring road) so the minimap, respawns and the race code work.
import * as THREE from 'three';
import { CollisionWorld } from '../physics/collision.js';
import { SURF, surfaceId } from '../shared/surfaces.js';

export function buildCityWorld(track, vis) {
  const def = track.def, L = def.city;
  const world = new CollisionWorld(track);
  world.killY = def.killY ?? -10;
  const [bx0, bz0, bx1, bz1] = L.bounds;
  world.rects = [{ x0: bx0, z0: bz0, x1: bx1, z1: bz1 }];
  const quad = (x0, z0, x1, z1, y, surf) => {
    world.addTri(x0, y, z0, x1, y, z0, x1, y, z1, surf);
    world.addTri(x0, y, z0, x1, y, z1, x0, y, z1, surf);
  };
  // plain road under everything (so the ground never has a hole), then the special areas
  // (they sit a few millimetres higher, so they win where they overlap)
  quad(bx0 - 30, bz0 - 30, bx1 + 30, bz1 + 30, 0, SURF.ROAD);
  for (const g of L.ground || []) quad(g[0], g[1], g[2], g[3], g[4], surfaceId(g[5]));
  for (const t of L.slopes || []) world.addTri(t[0], t[1], t[2], t[3], t[4], t[5], t[6], t[7], t[8], surfaceId(t[9]));
  for (const b of L.boxes || []) world.addBox({ x: b[0], z: b[1], hx: b[2], hz: b[3], y0: b[4], y1: b[5], kind: 'building' });
  for (const p of L.posts || []) world.addCircle({ x: p[0], z: p[1], r: p[2], y0: -1, y1: p[3], kind: 'post' });

  const group = new THREE.Group();
  group.name = 'city';
  const updaters = [];
  const ctx = { track, def, vis, world, group, updaters, city: L };
  ctx.heightAt = () => 0;
  ctx.groundAt = (x, z, yTop = 200) => { const g = world.ground(x, yTop, z); return g ? g.y : 0; };
  ctx.edgeDecor = () => [];
  ctx.grid = (L.spawns || [[0, 0, 0]]).map(([x, z, yaw]) => ({ x, y: ctx.groundAt(x, z, 1), z, yaw, s: 0 }));
  ctx.update = (dt, t) => { for (const u of updaters) u(dt, t); };
  return ctx;
}
