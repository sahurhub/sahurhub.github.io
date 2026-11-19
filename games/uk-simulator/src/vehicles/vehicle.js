// UK Simulator - a vehicle in the world: physics (car.js / bike.js) + model + lights + rider,
// with smooth movement between physics steps.
import * as THREE from 'three';
import { VEHICLES } from '../shared/vehicles.js';
import { Car, defaultTune } from '../physics/car.js';
import { Bike, defaultBikeTune } from '../physics/bike.js';
import { buildModel, applyOverrides, dent } from './models.js';

export class Vehicle {
  static async create(id, ctx, pose, opts = {}) {
    const spec = applyOverrides(id, VEHICLES[id]);
    const v = new Vehicle(id, spec, ctx, pose, opts);
    v.model = await buildModel(id, spec, ctx.base, opts.colour);
    v.root.add(v.model.root);
    if (v.model.rider) { v.rider = v.model.rider; v.model.root.add(v.rider); v.rider.visible = false; }
    v.model.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    ctx.scene.add(v.root);
    v.sync(1);
    return v;
  }

  constructor(id, spec, ctx, pose, opts) {
    this.id = id; this.spec = spec; this.ctx = ctx;
    const isCar = spec.kind === 'car';
    this.tune = opts.tune || (isCar ? defaultTune(spec) : defaultBikeTune(spec));
    this.upgrades = opts.upgrades || {};
    this.phys = isCar ? new Car(spec, ctx.physics, ctx.world, pose, this.tune, this.upgrades) : new Bike(spec, ctx.physics, ctx.world, pose, this.tune, this.upgrades);
    this.phys.owner = this;
    this.phys.onDamage = (zone, amount, local) => { if (this.model && amount > 0.02) dent(this.model, impactPoint(spec, local), amount); this.lastHit = { zone, amount, t: performance.now() }; ctx.onVehicleHit && ctx.onVehicleHit(this, zone, amount); };
    if (!isCar) this.phys.onCrash = (reason) => ctx.onCrash && ctx.onCrash(this, reason);
    this.root = new THREE.Group();
    this.root.name = 'vehicle ' + id;
    this.prev = { p: new THREE.Vector3(), q: new THREE.Quaternion() };
    this.curr = { p: new THREE.Vector3(), q: new THREE.Quaternion() };
    this.lightsOn = false;
    this.driver = null;
    this.capture();
    this.prev.p.copy(this.curr.p); this.prev.q.copy(this.curr.q);
  }

  get isCar() { return this.spec.kind === 'car'; }
  get speed() { return this.phys.speed; }

  capture() {
    const t = this.phys.body.translation(), q = this.phys.body.rotation();
    this.prev.p.copy(this.curr.p); this.prev.q.copy(this.curr.q);
    this.curr.p.set(t.x, t.y, t.z); this.curr.q.set(q.x, q.y, q.z, q.w);
  }

  step(dt, controls) {
    this.phys.step(dt, controls || IDLE);
  }

  // place the model between the last two physics states
  sync(alpha) {
    this.root.position.lerpVectors(this.prev.p, this.curr.p, alpha);
    this.root.quaternion.slerpQuaternions(this.prev.q, this.curr.q, alpha);
    const m = this.model;
    if (!m) return;
    const ph = this.phys;
    ph.wheels.forEach((w, k) => {
      const mw = m.wheels[k];
      if (!mw) return;
      const len = w.contact ? w.len : w.travel;
      if (this.isCar || this.model.glb) {
        mw.holder.position.set(w.mount[0], w.mount[1] - len, w.mount[2]);
        mw.holder.rotation.y = w.steer || 0;
      } else if (w.front) {
        // front wheel sits in the steering group (fork)
        mw.holder.position.set(0, (w.mount[1] - len) - w.def.pos[1], 0);
      } else mw.holder.position.set(0, w.mount[1] - len, w.def.pos[2]);
      mw.spinner.rotation.x = w.spin;
    });
    if (!this.isCar && m.root.userData.steer) m.root.userData.steer.rotation.y = ph.steer;
    // lights: brake lights always, headlights at night or on demand
    const night = this.ctx.weather ? this.ctx.weather.night : 0;
    const on = this.lightsOn || night > 0.5;
    if (m.lights) {
      m.lights.tail.emissiveIntensity = 0.25 + (on ? 0.6 : 0) + ph.brakeLight * 2.2;
      m.lights.head.emissiveIntensity = on ? 3 : 0.15;
      m.lights.spot.intensity = on && this.driver === 'player' ? 60 : 0;
    }
    // rider leans with weight shift and puts a foot down when stopped
    if (this.rider && this.rider.visible && !this.isCar) {
      const p = this.rider.userData.parts;
      const wgt = ph.weight || 0;
      this.rider.position.z = -wgt * 0.15;
      this.rider.rotation.x = -wgt * 0.15;
      p.legR.rotation.z = ph.footDown ? -0.35 : 0;
      p.legR.position.x = ph.footDown ? -0.24 : -0.14;
      if (this.spec.pedal && ph.rider) { const a = ph.wheels[1].spin * 0.5; p.legL.rotation.x = 0.4 + Math.sin(a) * 0.35; p.legR.rotation.x = 0.4 - Math.sin(a) * 0.35; }
    }
  }

  setDriver(who) {
    this.driver = who;
    if (this.rider) this.rider.visible = !!who && !(this.phys.crashed);
  }

  destroy() {
    this.ctx.scene.remove(this.root);
    this.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.phys.destroy();
  }
}

const IDLE = { throttle: 0, brake: 0, steer: 0, handbrake: 0.3, leanBack: 0, leanFwd: 0, rearBrake: 0.4 };

function impactPoint(spec, local) {
  const d = spec.dims;
  // the force pushes away from where we were hit, so the dent is on the opposite side
  const l = Math.hypot(local[0], local[2]) || 1;
  return [-local[0] / l * d.width * 0.5, (spec.wheels[0].r + d.height) * 0.5, -local[2] / l * d.length * 0.5];
}
