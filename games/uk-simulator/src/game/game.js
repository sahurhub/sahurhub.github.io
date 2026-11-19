// UK Simulator - the game: player on foot or in a vehicle, controls, camera, events, money,
// menus, multiplayer. main.js calls init(), start(), then frame(dt) every animation frame.
import * as THREE from 'three';
import { FLAGS } from '../config.js';
import { Input } from '../core/input.js';
import { CameraRig } from '../core/camera.js';
import { Vehicle } from '../vehicles/vehicle.js';
import { Character } from '../vehicles/character.js';
import { VEHICLES } from '../shared/vehicles.js';
import { PAINTS, vehicleClass } from '../shared/rules.js';
import { nearestNode } from '../shared/route.js';
import { Profile } from './profile.js';
import { Events } from './events.js';
import { Hud } from '../ui/hud.js';
import { Menu } from '../ui/menu.js';
import { BigMap } from '../ui/bigmap.js';
import { DebugOverlay } from '../ui/debug.js';
import { Tuning } from '../ui/tuning.js';
import { Audio } from '../audio/audio.js';
import { Net } from '../net/net.js';
import { Remotes } from '../net/remote.js';
import { SURFACE } from '../physics/tyre.js';

export class Game {
  constructor(ctx) {
    Object.assign(this, ctx);
    this.input = new Input(ctx.renderer.domElement);
    this.rig = new CameraRig(ctx.camera, ctx.physics);
    this.vehicle = null;      // the vehicle the player is in (or null on foot)
    this.myVehicle = null;    // the player's own vehicle in the world
    this.character = null;
    this.paused = false;
    this.time = 0;
    this.saveTimer = 0;
    this.lastPos = null;
    this.crashTimer = 0;
  }

  async init() {
    this.profile = new Profile(this);
    await this.profile.load();
    const s = this.profile.settings;
    if (s.timeMode) this.weather.mode = s.timeMode;
    this.weather.setHour(FLAGS.hour ? Number(FLAGS.hour) : s.hour ?? 12.5);
    if (s.weather === 'rain') this.weather.rainTarget = 1;
    this.audio = new Audio(this);
    this.hud = new Hud(this);
    this.events = new Events(this);
    this.menu = new Menu(this);
    this.bigmap = new BigMap(this);
    this.debug = new DebugOverlay(this);
    this.tuning = new Tuning(this);
    this.net = new Net(this);
    this.remotes = new Remotes(this);
    let x = this.missions.spawn.x, z = this.missions.spawn.z;
    if (FLAGS.at) { const [a, b] = FLAGS.at.split(',').map(Number); if (!Number.isNaN(a) && !Number.isNaN(b)) { x = a; z = b; } }
    this.spawnPoint = { x, z };
    return { x, z };
  }

  async start() {
    const { x, z } = this.spawnPoint;
    const y = this.world.heightAt(x, z);
    this.character = new Character(this, x + 3, y, z, 0);
    const id = FLAGS.vehicle && VEHICLES[FLAGS.vehicle] ? FLAGS.vehicle : this.profile.data.current;
    await this.spawnVehicle(id, x, z, this.clearHeading(x, z));
    this.enter(this.myVehicle);
    this.hud.toast(`Welcome to Leighton Buzzard! ${this.input.touch ? 'Use the stick and buttons to drive.' : 'W A S D to drive, F to get in or out, Esc for the menu.'}`);
    this.net.start();
    this.hud.refresh();
  }

  // the direction with the most open space in front (so you never start facing a wall or fence)
  clearHeading(x, z) {
    this.physics.world.step(this.physics.events); // make newly loaded colliders visible to rays
    const g0 = this.world.heightAt(x, z);
    let best = 0, bestD = -1;
    for (let k = 0; k < 24; k++) {
      const a = k / 24 * Math.PI * 2;
      // low walls and kerbs count too, so look at several heights
      let d = 60;
      for (const hh of [0.15, 0.4, 0.9]) { const hit = this.physics.castRay(x, g0 + hh, z, Math.sin(a), 0, Math.cos(a), 60); if (hit) d = Math.min(d, hit.dist); }
      if (d > bestD + 0.5) { bestD = d; best = a; }
    }
    return best;
  }

  // ------------------------------------------------------------------ vehicles
  async spawnVehicle(id, x, z, heading) {
    if (this.myVehicle) { if (this.vehicle === this.myVehicle) this.exit(true); this.myVehicle.destroy(); this.myVehicle = null; }
    const own = this.profile.vehicle(id);
    const paint = PAINTS.find((p) => p.id === (own ? own.paint : 'blue')) || PAINTS[0];
    const spec = VEHICLES[id];
    const y = this.world.heightAt(x, z) + (spec.wheels[0].r * 0.3);
    const v = await Vehicle.create(id, this, { x, y, z, heading }, { colour: paint.hex, upgrades: own ? own.upgrades : {}, tune: this.profile.tuneFor(id) });
    if (own && own.damage > 0.3) v.phys.damage.total = own.damage;
    this.myVehicle = v;
    this.profile.data.current = id;
    this.profile.save();
    return v;
  }

  // bring the chosen vehicle next to the player (Garage menu)
  async summon(id) {
    const p = this.playerPos();
    const head = this.vehicle ? Math.atan2(this.vehicle.phys.fwd[0], this.vehicle.phys.fwd[2]) : this.character.heading;
    const wasIn = !!this.vehicle;
    const x = p.x + Math.sin(head) * (wasIn ? 0 : 4), z = p.z + Math.cos(head) * (wasIn ? 0 : 4);
    const v = await this.spawnVehicle(id, x, z, head);
    if (wasIn) this.enter(v);
    this.hud.toast(`${VEHICLES[id].name} is ready.`);
  }

  enter(v) {
    if (!v) return;
    this.vehicle = v;
    v.setDriver('player');
    this.character.setVisible(false);
    this.rig.first = true;
    this.audio.setVehicle(v);
    this.hud.refresh();
  }

  exit(silent = false) {
    const v = this.vehicle;
    if (!v) return;
    if (!silent && Math.abs(v.speed) > 3) { this.hud.toast('Slow down to get out.'); return; }
    // step out on the right (driver's side in a right-hand-drive UK car)
    const r = v.phys.right, p = v.phys.pos;
    const side = v.isCar ? v.spec.dims.width / 2 + 0.7 : 0.8;
    const x = p[0] + r[0] * side, z = p[2] + r[2] * side;
    this.character.teleport(x, this.world.heightAt(x, z), z);
    this.character.heading = Math.atan2(v.phys.fwd[0], v.phys.fwd[2]);
    this.character.setVisible(true);
    v.setDriver(null);
    this.vehicle = null;
    this.events.onExit();
    this.audio.setVehicle(null);
    this.rig.yaw = this.character.heading;
    this.hud.refresh();
  }

  tryEnter() {
    const v = this.myVehicle;
    if (!v) return;
    const c = this.character.pos, p = v.phys.pos;
    if (Math.hypot(c.x - p[0], c.z - p[2]) < Math.max(3.5, v.spec.dims.length * 0.75)) this.enter(v);
    else this.hud.toast('Walk up to your vehicle first (or call it from the Garage).');
  }

  playerPos() { if (this.vehicle) { const p = this.vehicle.phys.pos; return { x: p[0], y: p[1], z: p[2] }; } return { x: this.character.pos.x, y: this.character.pos.y, z: this.character.pos.z }; }

  resetVehicle() {
    const v = this.vehicle;
    if (!v) return;
    const p = v.phys.pos;
    const head = Math.atan2(v.phys.fwd[0], v.phys.fwd[2]);
    let x = p[0], z = p[2];
    if (v.phys.drowned || this.world.surfaceAt(x, z).water > 0.3) {
      // back onto the nearest road
      const n = nearestNode(this.graph, x, z, v.isCar ? 'car' : 'bike');
      if (n >= 0) { x = this.graph.n[2 * n]; z = this.graph.n[2 * n + 1]; }
    }
    const y = this.world.heightAt(x, z) + 0.6;
    if (v.phys.recover) v.phys.recover(x, y, z, head); else v.phys.reset(x, y, z, head);
    v.capture(); v.capture();
    v.setDriver('player');
    this.events.onReset();
  }

  // ------------------------------------------------------------------ per frame
  frame(dt) {
    this.time += dt;
    const inp = this.input.update(dt);
    const take = (a) => this.input.take(a);
    if (take('menu')) { if (this.bigmap.open) this.bigmap.toggle(false); else if (this.tuning.open) this.tuning.toggle(false); else this.menu.toggle(); }
    if (take('map')) this.bigmap.toggle();
    if (take('debug')) this.debug.toggle();
    if (take('tuning')) this.tuning.toggle();
    if (take('chat')) this.hud.openChat();
    const blocked = this.menu.open || this.bigmap.open || this.tuning.open;
    this.paused = this.menu.open && !this.net.online;
    if (!blocked) {
      if (take('camera')) this.rig.toggle();
      if (take('enter')) { if (this.vehicle) this.exit(); else this.tryEnter(); }
      if (take('reset')) this.resetVehicle();
      if (take('lights') && this.vehicle) this.vehicle.lightsOn = !this.vehicle.lightsOn;
      if (take('mode') && this.vehicle && this.vehicle.phys.motor) { const m = this.vehicle.phys.motor; m.mode = m.mode % 3 + 1; this.hud.toast(`Speed mode ${m.mode}`); }
    }
    const shiftUp = take('shiftUp'), shiftDown = take('shiftDown'), hop = take('handbrakePress') || (this.input.keys.has('Space') && !this.hopHeld);
    this.hopHeld = this.input.keys.has('Space');
    // on foot: camera turns with A/D or the mouse
    if (!this.vehicle && !blocked) { this.rig.turn(inp.steer * dt * 2.4 + inp.lookX * 0.004); inp.lookX = 0; }
    const ctl = blocked || this.paused ? null : this.vehicleControls(inp, shiftUp, shiftDown, hop);
    const frozen = this.events.frozen;
    if (!this.paused) {
      this.physics.update(dt, (h) => {
        if (this.myVehicle) this.myVehicle.step(h, this.vehicle === this.myVehicle && !frozen ? ctl : null);
        if (!this.vehicle && this.character) {
          const fwd = (blocked ? 0 : inp.throttle - inp.brake) + (inp.walkY ? -inp.walkY : 0);
          const yaw = this.rig.yaw;
          this.character.step(h, { x: Math.sin(yaw) * fwd + (inp.walkX ? Math.cos(yaw) * -inp.walkX : 0), z: Math.cos(yaw) * fwd + (inp.walkX ? -Math.sin(yaw) * -inp.walkX : 0) }, inp.sprint, !blocked && this.input.keys.has('Space'));
        }
      }, () => { if (this.myVehicle) this.myVehicle.capture(); });
    }
    const alpha = this.physics.alpha;
    if (this.myVehicle) this.myVehicle.sync(alpha);
    if (this.character) this.character.sync(alpha);
    // crashes: rider off, then back on after a moment
    const v = this.vehicle;
    if (v && v.phys.crashed) {
      this.crashTimer += dt;
      if (v.rider) v.rider.visible = false;
      if (this.crashTimer > 2.6) { this.crashTimer = 0; this.resetVehicle(); }
    } else this.crashTimer = 0;
    if (v && v.phys.drowned) { this.hud.toast('Splash! Back to the road.', 'bad'); this.resetVehicle(); }
    // camera
    const target = v ? { pos: v.root.position, quat: v.root.quaternion, speed: v.speed, spec: v.spec, kind: v.spec.kind, onFoot: false, vel: new THREE.Vector3(...v.phys.lin), body: v.phys.body, groundAt: (x, z) => this.world.heightAt(x, z) }
      : { pos: this.character.root.position, quat: this.character.root.quaternion, speed: this.character.speed, spec: null, onFoot: true, groundAt: (x, z) => this.world.heightAt(x, z) };
    this.rig.update(dt, target, blocked ? null : inp);
    // world streaming around the player (ahead of the camera when moving)
    const pp = this.playerPos();
    this.world.wetness = this.weather.wet;
    this.world.night = this.weather.night;
    this.world.update(pp.x, pp.z, this.time);
    this.weather.update(dt, new THREE.Vector3(pp.x, pp.y, pp.z));
    this.materials.shared.uWet.value = this.weather.wet;
    this.materials.shared.uNight.value = this.weather.night;
    this.materials.shared.uTime.value = this.time;
    this.checkBounds();
    this.trackStats(dt);
    this.events.update(dt);
    this.remotes.update(dt);
    this.net.update(dt);
    this.audio.update(dt);
    this.hud.update(dt);
    this.debug.update(dt);
    this.saveTimer += dt;
    if (this.saveTimer > 20) { this.saveTimer = 0; this.profile.saveSoon(); }
  }

  vehicleControls(inp, shiftUp, shiftDown, hop) {
    const v = this.vehicle;
    if (!v) return null;
    if (v.isCar) return { throttle: inp.throttle, brake: inp.brake, steer: inp.steer, handbrake: inp.handbrake, shiftUp, shiftDown };
    return { throttle: inp.throttle, brake: inp.brake, steer: inp.steer, rearBrake: inp.rearBrake, leanBack: inp.leanBack, leanFwd: inp.leanFwd, hop, sprint: inp.sprint };
  }

  checkBounds() {
    const p = this.playerPos(), a = this.manifest.area, m = 25;
    if (p.x > a.x0 + m && p.x < a.x1 - m && p.z > a.z0 + m && p.z < a.z1 - m) return;
    const x = Math.max(a.x0 + 60, Math.min(a.x1 - 60, p.x)), z = Math.max(a.z0 + 60, Math.min(a.z1 - 60, p.z));
    this.hud.toast("That's the edge of the map - turning you round.");
    if (this.vehicle) {
      const head = Math.atan2(this.vehicle.phys.fwd[0], this.vehicle.phys.fwd[2]) + Math.PI;
      this.vehicle.phys.reset(x, this.world.heightAt(x, z) + 0.8, z, head); this.vehicle.capture(); this.vehicle.capture();
    } else this.character.teleport(x, this.world.heightAt(x, z), z);
  }

  trackStats(dt) {
    const p = this.playerPos();
    if (this.lastPos) {
      const d = Math.hypot(p.x - this.lastPos.x, p.z - this.lastPos.z);
      if (d < 60 && this.vehicle && d > 0.01) {
        const st = this.profile.data.stats;
        st.distance += d;
        const cls = vehicleClass(this.vehicle.id);
        const kind = cls === 'car' ? 'car' : cls === 'escooter' ? 'escooter' : this.vehicle.spec.pedal ? 'bike' : 'other';
        this.profile.addDaily('distance:' + kind, d);
        const w = this.vehicle.phys.wheels[this.vehicle.phys.wheels.length - 1];
        if (w && w.surf && [SURFACE.grass, SURFACE.mud, SURFACE.sand, SURFACE.dirt, SURFACE.gravel, SURFACE.forest].includes(w.surf.surface)) this.profile.addDaily('distance:offroad', d);
        const kmh = Math.abs(this.vehicle.speed) * 3.6;
        if (kmh > st.topSpeed) st.topSpeed = kmh;
      }
    }
    this.lastPos = p;
  }
}
