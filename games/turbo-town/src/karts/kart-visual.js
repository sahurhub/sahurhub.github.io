// TURBO TOWN - kart visuals: model (with its skin), wheels, body lean / bounce, and the effect
// anchors (exhaust, rear wheels) used by sparks, flames and dust.
import * as THREE from 'three';
import { colorMaterial } from '../render/materials.js';
import { BOOSTS } from '../shared/cosmetics.js';

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _n = new THREE.Vector3(), _v = new THREE.Vector3();
const _xAxis = new THREE.Vector3(1, 0, 0), _yAxis = new THREE.Vector3(0, 1, 0);

export const TIER_COLORS = ['#ffffff', '#5cf2ff', '#ffc93c', '#ff5cf0'];

export class KartVisual {
  constructor(kartDef, opts = {}) {
    this.def = kartDef;
    this.root = new THREE.Group();
    this.root.name = 'kart_' + kartDef.id;
    this.tilt = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.tilt);
    this.tilt.add(this.body);
    this.wheels = [];
    this.steerGroups = [];
    this.wheelRadius = 0.32;
    this.anchors = {
      exhaust: [new THREE.Vector3(-0.28, 0.42, -0.95), new THREE.Vector3(0.28, 0.42, -0.95)],
      rearWheels: [new THREE.Vector3(-0.62, 0.05, -0.62), new THREE.Vector3(0.62, 0.05, -0.62)],
    };
    const assets = opts.assets;
    const built = assets ? assets.buildKart(kartDef, opts) : null;
    if (built) {
      Object.assign(this, built.parts);
      this.body.add(built.object); // the car models have their own helmeted driver
    } else this.buildStandIn(kartDef, opts.paint || kartDef.colors);
    this.lookBack = 0;
    const bst = opts.boost && BOOSTS.find((b) => b.id === opts.boost);
    this.boostColors = bst ? bst.colors : null;
    this.bounce = 0; this.bounceV = 0;
    this.wheelSpin = 0;
    this.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    // contact shadow right under the kart (an oval the size of the kart), so it always
    // looks like it is sitting on the road
    const blob = new THREE.Mesh(new THREE.CircleGeometry(1, 20), shadowMaterial());
    blob.rotation.x = -Math.PI / 2;
    blob.scale.set(0.82, 1.15, 1);
    blob.position.y = 0.03;
    blob.renderOrder = 1;
    this.blob = blob;
    this.useBlob = opts.blob !== false;
    this.root.add(blob);
  }

  // Simple stand-in used until the Blender models load (or if one fails to load).
  buildStandIn(def, paint) {
    const [c1, c2] = paint;
    const body = new THREE.Group();
    const m1 = colorMaterial(c1), m2 = colorMaterial(c2), dark = colorMaterial('#3a3f5c'), seat = colorMaterial('#ffffff');
    const tub = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.0, 4, 10), m1);
    tub.rotation.x = Math.PI / 2; tub.scale.set(1.15, 1, 0.55); tub.position.set(0, 0.42, 0);
    body.add(tub);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8), m2);
    nose.scale.set(1.2, 0.6, 1); nose.position.set(0, 0.42, 0.85);
    body.add(nose);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.35, 0.3), m2);
    back.position.set(0, 0.62, -0.85);
    body.add(back);
    const driver = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 10), seat);
    driver.position.set(0, 0.95, -0.15);
    body.add(driver);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), m2);
    helmet.position.set(0, 1.35, -0.1);
    body.add(helmet);
    this.body.add(body);
    const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.3, 14);
    wheelGeo.rotateZ(Math.PI / 2);
    const hubGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.32, 10);
    hubGeo.rotateZ(Math.PI / 2);
    const spots = [[-0.62, 0.32, 0.62, true], [0.62, 0.32, 0.62, true], [-0.62, 0.32, -0.62, false], [0.62, 0.32, -0.62, false]];
    for (const [x, y, z, front] of spots) {
      const steer = new THREE.Group();
      steer.position.set(x, y, z);
      const wheel = new THREE.Group();
      wheel.add(new THREE.Mesh(wheelGeo, dark));
      wheel.add(new THREE.Mesh(hubGeo, m2));
      steer.add(wheel);
      this.body.add(steer);
      this.wheels.push(wheel);
      if (front) this.steerGroups.push(steer);
    }
  }

  // k = physics kart, alpha = interpolation between the last two physics steps
  update(k, alpha, dt) {
    const x = k.px + (k.x - k.px) * alpha, y = k.py + (k.y - k.py) * alpha, z = k.pz + (k.z - k.pz) * alpha;
    let dyaw = k.yaw - k.pyaw;
    if (dyaw > Math.PI) dyaw -= Math.PI * 2; else if (dyaw < -Math.PI) dyaw += Math.PI * 2;
    const yaw = k.pyaw + dyaw * alpha;
    this.root.position.set(x, y, z);
    this.x = x; this.y = y; this.z = z; this.yaw = yaw;
    // align to the (smoothed) ground normal, then turn to the heading
    _n.set(k.snx, k.sny, k.snz).normalize();
    _q.setFromUnitVectors(_up, _n);
    _q2.setFromAxisAngle(_up, yaw + k.driftVis + k.spinAngle + k.trickSpin);
    this.root.quaternion.copy(_q).multiply(_q2);
    // body lean into turns and squash on landing
    const lean = -k.steer * Math.min(1, Math.abs(k.speed) / 15) * 0.09 + (k.drift.on ? k.drift.dir * 0.06 * Math.min(1, (k.drift.ang || 0) / 0.78) : 0);
    this.tilt.rotation.z += (lean - this.tilt.rotation.z) * (1 - Math.exp(-dt * 10));
    const pitch = k.grounded ? 0 : Math.max(-0.25, Math.min(0.25, -k.vy * 0.025));
    this.tilt.rotation.x += (pitch - this.tilt.rotation.x) * (1 - Math.exp(-dt * 6));
    // spring bounce, in small steps: one big step (a slow frame on a weak computer) made the
    // spring swing wider every frame until the kart vanished
    const steps = Math.max(1, Math.ceil(dt / 0.016)), h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.bounceV += (-this.bounce * 160 - this.bounceV * 14) * h;
      this.bounce += this.bounceV * h;
    }
    if (!(Math.abs(this.bounce) < 0.3)) { this.bounce = 0; this.bounceV = 0; }
    const engine = k.frozen ? 0 : Math.sin(k.time * 40) * 0.006 * Math.min(1, Math.abs(k.input.throttle));
    this.body.position.y = this.bounce + engine + (k.rescue ? Math.sin(k.time * 6) * 0.08 : 0);
    this.body.scale.set(1 - this.bounce * 0.6, 1 + this.bounce * 1.2, 1 - this.bounce * 0.6);
    // wheels
    this.wheelSpin += (k.speed / this.wheelRadius) * dt;
    for (const w of this.wheels) w.rotation.x = w.userData.flip ? -this.wheelSpin : this.wheelSpin;
    const steerAngle = -k.steer * 0.42;
    for (const s of this.steerGroups) s.rotation.y = steerAngle;
    if (this.steerWheel) this.steerWheel.quaternion.copy(this.steerWheel.userData.base).multiply(_q3.setFromAxisAngle(_yAxis, -k.steer * 1.4));
    // blob shadow stays on the ground under the kart
    const above = Math.max(0, y - (k.gy ?? y));
    this.blob.visible = this.useBlob && !k.rescue && above < 12;
    this.blob.position.y = 0.03 - above;
    this.blob.material.opacity = Math.max(0.06, 0.42 - above * 0.06);
    // flashing while invulnerable
    this.body.visible = k.invulnT > 0 ? Math.floor(k.time * 14) % 2 === 0 : true;
  }

  land(impact) { this.bounceV -= Math.min(3.2, impact * 0.35); }

  // world position of a local anchor
  worldPoint(local, out = _v) { return out.copy(local).applyMatrix4(this.body.matrixWorld); }

  dispose() { this.root.removeFromParent(); }
}

let _shadowMat = null;
function shadowMaterial() {
  if (_shadowMat) return _shadowMat.clone();
  _shadowMat = new THREE.MeshBasicMaterial({ color: '#1b2a4a', transparent: true, opacity: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  return _shadowMat.clone();
}
