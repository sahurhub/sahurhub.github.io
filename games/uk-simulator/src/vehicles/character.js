// UK Simulator - walking around on foot (Rapier character controller) with a simple person model.
import * as THREE from 'three';
import { makeRider } from './models.js';
import { GROUPS } from '../physics/physics.js';

export class Character {
  constructor(ctx, x, y, z, heading = 0) {
    this.ctx = ctx;
    const R = ctx.physics.R, W = ctx.physics.world;
    this.body = W.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y + 1, z));
    this.col = W.createCollider(R.ColliderDesc.capsule(0.55, 0.3).setCollisionGroups(((GROUPS.rider << 16) | (GROUPS.world | GROUPS.ground | GROUPS.prop | GROUPS.vehicle)) >>> 0), this.body);
    ctx.physics.tag(this.col, 'person', this);
    this.cc = W.createCharacterController(0.03);
    this.cc.enableAutostep(0.35, 0.25, true);
    this.cc.enableSnapToGround(0.4);
    this.cc.setMaxSlopeClimbAngle(50 * Math.PI / 180);
    this.cc.setApplyImpulsesToDynamicBodies(true);
    this.vy = 0; this.heading = heading; this.speed = 0; this.walkPhase = 0;
    this.model = makeRider({ kind: 'person', rider: { standing: true } }, 0x7a2f2f);
    const p = this.model.userData.parts;
    p.hel.visible = false;
    this.model.position.set(0, -0.85, 0);
    this.root = new THREE.Group(); this.root.add(this.model);
    ctx.scene.add(this.root);
    this.prev = new THREE.Vector3(x, y + 1, z); this.curr = this.prev.clone();
  }

  get pos() { return this.curr; }

  // move: { x, z } wanted direction in the world (length 0..1), run, jump
  step(dt, move, run, jump) {
    const t = this.body.translation();
    this.prev.copy(this.curr);
    const sp = (run ? 6.2 : 2.6) * Math.min(1, Math.hypot(move.x, move.z));
    this.speed += (sp - this.speed) * Math.min(1, dt * 8);
    if (Math.hypot(move.x, move.z) > 0.05) {
      const want = Math.atan2(move.x, move.z);
      let d = want - this.heading; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.heading += d * Math.min(1, dt * 10);
    }
    const grounded = this.cc.computedGrounded ? this.cc.computedGrounded() : true;
    if (grounded && this.vy <= 0) { this.vy = -1; if (jump) this.vy = 5; }
    this.vy -= 9.81 * dt;
    const dx = Math.sin(this.heading) * this.speed * dt, dz = Math.cos(this.heading) * this.speed * dt;
    this.cc.computeColliderMovement(this.col, { x: dx, y: this.vy * dt, z: dz });
    const mv = this.cc.computedMovement();
    // fall-back: never sink below the ground mesh (if the height field is not loaded yet)
    let ny = t.y + mv.y;
    const g = this.ctx.world.heightAt(t.x + mv.x, t.z + mv.z) + 0.85;
    if (ny < g) { ny = g; this.vy = Math.max(this.vy, 0); }
    this.body.setNextKinematicTranslation({ x: t.x + mv.x, y: ny, z: t.z + mv.z });
    this.curr.set(t.x + mv.x, ny, t.z + mv.z);
    this.walkPhase += this.speed * dt * 2.2;
  }

  sync(alpha) {
    this.root.position.lerpVectors(this.prev, this.curr, alpha);
    this.root.rotation.y = this.heading;
    const p = this.model.userData.parts, s = Math.sin(this.walkPhase), k = Math.min(1, this.speed / 3);
    p.legL.rotation.x = s * 0.6 * k; p.legR.rotation.x = -s * 0.6 * k;
    p.armL.rotation.x = -s * 0.5 * k; p.armR.rotation.x = s * 0.5 * k;
    p.legL.position.set(0.1, 0.62, 0); p.legR.position.set(-0.1, 0.62, 0);
    p.armL.position.set(0.24, 1.3, 0); p.armR.position.set(-0.24, 1.3, 0);
    p.torso.position.set(0, 1.32, 0); p.torso.rotation.x = 0.05 * k;
    p.head.position.set(0, 1.78, 0.02);
  }

  teleport(x, y, z) {
    this.body.setTranslation({ x, y: y + 1, z }, true);
    this.curr.set(x, y + 1, z); this.prev.copy(this.curr); this.vy = 0;
  }

  setVisible(v) { this.root.visible = v; this.col.setEnabled(v); }

  destroy() { this.ctx.scene.remove(this.root); this.ctx.physics.world.removeRigidBody(this.body); }
}
