// Pedestrians walking the sidewalks, people sitting on park benches, and the shop owners /
// customers that appear for the active job. Characters are pooled and recycled.
import { CharacterModel } from './character.js';
import { CITY } from './config.js';
import { rng, smoothAngle, clamp } from './utils.js';

const SKIN = ['#f2c79b', '#e0ac7e', '#c68642', '#8d5524', '#ffdbac', '#d9a066'];
const HAIR = ['#4a3020', '#1f1a17', '#c9a15b', '#8a3b1d', '#e8e1d4', '#2e2b5f'];
const SHIRT = ['#e5383b', '#2b7de9', '#52d6a3', '#ffd60a', '#8f4bd6', '#ff70a6', '#f5f7fa', '#22252e', '#14b8a6', '#f2994a', '#9bf01f'];
const PANTS = ['#2f3f5c', '#22252e', '#6b4f3a', '#3a5a40', '#7a7f8a', '#1f6feb', '#c2b280'];
const HATS = [null, null, null, 'beanie', 'cap', 'headphones', 'tophat', null];
const LINES = ['Hey, watch it!', 'Whoa!', 'Careful!', 'Slow down!', 'Eek!', 'Not cool!'];

export class NPCSystem {
  constructor(game, max) {
    this.g = game;
    this.L = game.layout;
    this.max = max;
    this.pool = [];
    this.active = [];
    this.statics = [];
    this.sitters = [];
    this.r = rng(4242);
    this.timer = 0;
    this.benches = (this.L.props.bench || []).filter(b => b.sit);
  }

  setMax(n) { this.max = n; }

  obtain() {
    let n = this.pool.pop();
    if (!n) {
      const ch = new CharacterModel();
      n = { char: ch, obj: ch.root };
    }
    const r = this.r;
    n.char.setColors({ skin: r.pick(SKIN), hair: r.pick(HAIR), shirt: r.pick(SHIRT), pants: r.pick(PANTS) });
    n.char.setAccessory('hat', r.pick(HATS));
    n.char.setAccessory('back', null);
    n.char.setCarry(null);
    n.obj.visible = true;
    this.g.scene.add(n.obj);
    return n;
  }
  free(n) {
    n.obj.removeFromParent();
    n.obj.visible = false;
    this.pool.push(n);
  }

  // ---------------------------------------------------------------- static NPCs for jobs
  spawnStatic(role, x, z, ry, anim = 'idle') {
    const n = this.obtain();
    if (role === 'owner') { n.char.setColors({ shirt: '#f5f7fa', pants: '#22252e' }); n.char.setAccessory('hat', this.r.chance(0.5) ? 'cap' : null); }
    const y = this.L.heightAt(x, z);
    n.obj.position.set(x, y, z);
    n.obj.rotation.set(0, ry, 0);
    n.static = true; n.role = role; n.anim = anim; n.leaving = 0;
    n.char.play(anim, 0.2);
    this.statics.push(n);
    return n;
  }
  setAnim(n, anim) { if (n) { n.anim = anim; n.char.play(anim, 0.15); } }
  release(n, walkInside = false) {
    if (!n) return;
    if (walkInside) { n.leaving = 1.6; n.char.play('walk', 0.2); n.obj.rotation.y += Math.PI; return; }
    this.statics = this.statics.filter(s => s !== n);
    this.free(n);
  }

  // ---------------------------------------------------------------- pedestrians
  spawnPedestrian(near) {
    const loops = this.L.walkLoops.filter(l => {
      const cx = (l.x0 + l.x1) / 2, cz = (l.z0 + l.z1) / 2;
      const d = Math.hypot(cx - near.x, cz - near.z);
      return d < 170 && d > 20 && this.g.eco.isUnlocked(l.district);
    });
    if (!loops.length) return;
    const loop = this.r.pick(loops);
    const n = this.obtain();
    n.static = false;
    n.loop = loop;
    n.per = 2 * ((loop.x1 - loop.x0) + (loop.z1 - loop.z0));
    n.t = this.r() * n.per;
    n.dir = this.r() < 0.5 ? 1 : -1;
    n.speed = this.r.range(1.1, 1.7);
    n.side = 0; n.sideV = 0; n.wait = 0; n.dodge = 0;
    n.lane = this.r.range(-0.9, 0.9);
    n.heading = 0;
    n.char.play('walk', 0.1, n.speed / 1.4);
    this.active.push(n);
    this.placeOnLoop(n, 0);
  }
  loopPoint(n, t) {
    const l = n.loop;
    const w = l.x1 - l.x0, h = l.z1 - l.z0;
    t = ((t % n.per) + n.per) % n.per;
    if (t < w) return { x: l.x0 + t, z: l.z0, dx: 1, dz: 0 };
    t -= w;
    if (t < h) return { x: l.x1, z: l.z0 + t, dx: 0, dz: 1 };
    t -= h;
    if (t < w) return { x: l.x1 - t, z: l.z1, dx: -1, dz: 0 };
    t -= w;
    return { x: l.x0, z: l.z1 - t, dx: 0, dz: -1 };
  }
  placeOnLoop(n, dt) {
    const p = this.loopPoint(n, n.t);
    const dx = p.dx * n.dir, dz = p.dz * n.dir;
    // sideways offset (lane on the sidewalk + dodge)
    const rx = -dz, rz = dx;
    const off = n.lane + n.side;
    const x = p.x + rx * off, z = p.z + rz * off;
    n.obj.position.set(x, CITY.curb, z);
    n.heading = smoothAngle(n.heading, Math.atan2(dx, dz), 10, dt || 1);
    n.obj.rotation.set(0, n.heading, 0);
    n.x = x; n.z = z;
  }

  spawnSitters(near) {
    // keep people on the closest park benches
    const want = this.benches.filter(b => Math.hypot(b.x - near.x, b.z - near.z) < 90).slice(0, 4);
    this.sitters = this.sitters.filter(s => {
      if (!want.includes(s.bench)) { if (!s.empty) this.free(s); return false; }
      return true;
    });
    for (const b of want) {
      if (this.sitters.some(s => s.bench === b)) continue;
      if (this.r() < 0.4) { this.sitters.push({ bench: b, obj: null, char: null, empty: true }); continue; }
      const n = this.obtain();
      n.bench = b;
      // hips (0.72 above the feet in the rig) just above the 0.47 m seat
      n.obj.position.set(b.x, b.y + 0.55 - 0.72, b.z);
      n.obj.rotation.set(0, b.ry, 0);
      n.char.play('sit', 0.1);
      this.sitters.push(n);
    }
  }

  update(dt) {
    const g = this.g;
    const focus = g.player.vehicle ? { x: g.player.vehicle.x, z: g.player.vehicle.z } : g.player.pos;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0.5;
      // despawn far pedestrians, spawn new ones near the player
      this.active = this.active.filter(n => {
        if (Math.hypot(n.x - focus.x, n.z - focus.z) > 210) { this.free(n); return false; }
        return true;
      });
      let spawns = 3;
      while (this.active.length < this.max && spawns-- > 0) this.spawnPedestrian(focus);
      this.spawnSitters(focus);
    }
    const veh = g.player.vehicle;
    const pp = g.player.pos;
    for (const n of this.active) {
      // look ahead for the player / vehicle and wait or dodge
      const p = this.loopPoint(n, n.t);
      const dx = p.dx * n.dir, dz = p.dz * n.dir;
      let blocked = false;
      if (veh) {
        const d = Math.hypot(veh.x - n.x, veh.z - n.z);
        const sp = veh.speed();
        if (d < veh.radius + 1.3 && sp > 2.5 && n.dodge <= 0) {
          // dodge away from the vehicle with a hop
          const ax = n.x - veh.x, az = n.z - veh.z;
          const rx = -dz, rz = dx;
          n.sideV = Math.sign(ax * rx + az * rz || 1) * 7;
          n.dodge = 1.2;
          n.char.play('jump', 0.05);
          g.events.emit('npc:say', { x: n.x, y: 2.4, z: n.z, text: this.r.pick(LINES) });
          if (d < veh.radius + 0.7) {
            const l = Math.max(0.1, d);
            veh.push((veh.x - n.x) / l, (veh.z - n.z) / l, 0.2);
            g.onVehicleImpact(Math.min(sp, 4), 'person');
          }
        } else if (d < veh.radius + 3 && ((veh.x - n.x) * dx + (veh.z - n.z) * dz) > 0 && sp < 2.5) blocked = true;
      } else {
        const d = Math.hypot(pp.x - n.x, pp.z - n.z);
        if (d < 1.4 && ((pp.x - n.x) * dx + (pp.z - n.z) * dz) > 0) blocked = true;
        if (d < 0.75) { const l = Math.max(0.05, d); g.player.pos.x += (pp.x - n.x) / l * 0.03; g.player.pos.z += (pp.z - n.z) / l * 0.03; }
      }
      if (n.dodge > 0) {
        n.dodge -= dt;
        n.side += n.sideV * dt;
        n.sideV *= Math.exp(-5 * dt);
        n.side = clamp(n.side, -2.6, 2.6);
        if (n.dodge <= 0) n.char.play('walk', 0.2, n.speed / 1.4);
      } else n.side *= Math.exp(-0.8 * dt);
      if (!blocked) n.t += n.dir * n.speed * dt;
      if (blocked && n.char.currentName() !== 'idle') n.char.play('idle', 0.2);
      else if (!blocked && n.dodge <= 0 && n.char.currentName() !== 'walk') n.char.play('walk', 0.2, n.speed / 1.4);
      this.placeOnLoop(n, dt);
      const far = Math.hypot(n.x - focus.x, n.z - focus.z) > 90;
      n.char.update(far ? dt * (this.g.frame % 2 === 0 ? 2 : 0) : dt);
    }
    for (const s of this.statics) {
      if (s.leaving > 0) {
        s.leaving -= dt;
        const fx = Math.sin(s.obj.rotation.y), fz = Math.cos(s.obj.rotation.y);
        s.obj.position.x += fx * 1.3 * dt; s.obj.position.z += fz * 1.3 * dt;
        if (s.leaving <= 0) { this.statics = this.statics.filter(x => x !== s); this.free(s); continue; }
      }
      // face the player while waiting
      if (!s.leaving) {
        const tx = focus.x - s.obj.position.x, tz = focus.z - s.obj.position.z;
        if (Math.hypot(tx, tz) < 25) s.obj.rotation.y = smoothAngle(s.obj.rotation.y, Math.atan2(tx, tz), 4, dt);
      }
      s.char.update(dt);
    }
    for (const s of this.sitters) if (s.char) s.char.update(dt);
  }

  // used by traffic to avoid driving into people
  nearPoint(x, z, r) {
    for (const n of this.active) if (Math.hypot(n.x - x, n.z - z) < r) return true;
    return false;
  }
}

export const NPC_COLORS = { SKIN, SHIRT };
