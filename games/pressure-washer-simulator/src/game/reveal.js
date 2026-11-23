// End of a job: the camera flies out and orbits the job while a wipe shows BEFORE (dirty) on one side and
// AFTER (clean) on the other, then "Sparkling!" with a shower of sparkles. Click to skip.
import * as THREE from 'three';
import { el, $ui } from '../ui/ui.js';
import { washGlobal } from '../render/washmat.js';
import { sfx } from '../core/audio.js';

const FLY = 1.0, HOLD = 0.6, WIPE = 2.4, SPARK = 2.2;
const _v = new THREE.Vector3();

export class Reveal {
  constructor(app) { this.app = app; this.active = false; }

  start(job, onDone) {
    const a = this.app, cam = a.R.camera;
    this.job = job; this.onDone = onDone;
    this.t = 0; this.active = true; this.sparked = false;
    const c = job.centre();
    this.c = new THREE.Vector3(c.x, c.y, c.z);
    this.r = c.r;
    this.from = cam.position.clone();
    this.fromQ = cam.quaternion.clone();
    // start the orbit on the side the player was standing
    this.a0 = Math.atan2(cam.position.z - c.z, cam.position.x - c.x);
    for (const s of job.surfaces) s.showBefore(true);
    washGlobal.uWipe.value = 1e6;
    this.ui = el('div', { class: 'reveal' });
    this.ui.innerHTML = `<div class="line hidden"></div><div class="lab before hidden">BEFORE</div><div class="lab after hidden">AFTER</div><div class="skip">Click to skip</div>`;
    this.line = this.ui.querySelector('.line'); this.lb = this.ui.querySelector('.before'); this.la = this.ui.querySelector('.after');
    this.ui.addEventListener('click', () => this.finish());
    $ui().appendChild(this.ui);
  }

  orbitPos(t, out) {
    const ang = this.a0 + t * 0.32;
    const h = 2.6 + this.r * 0.32;
    return out.set(this.c.x + Math.cos(ang) * this.r, this.c.y + h, this.c.z + Math.sin(ang) * this.r);
  }

  update(dt) {
    if (!this.active) return;
    const a = this.app, cam = a.R.camera;
    this.t += dt;
    const t = this.t;
    const target = this.orbitPos(t, _v);
    if (t < FLY) {
      const k = t / FLY, e = k * k * (3 - 2 * k);
      cam.position.lerpVectors(this.from, target, e);
      const look = new THREE.Matrix4().lookAt(cam.position, this.c, new THREE.Vector3(0, 1, 0));
      const q = new THREE.Quaternion().setFromRotationMatrix(look);
      cam.quaternion.slerpQuaternions(this.fromQ, q, e);
    } else {
      cam.position.copy(target);
      cam.lookAt(this.c);
    }
    cam.updateMatrixWorld();
    // the wipe: BEFORE on the left of the line, AFTER on the right; the line runs right to left
    const w0 = FLY + HOLD, w1 = w0 + WIPE;
    const W = a.R.r.domElement.width;
    if (t >= FLY && !this.sparked) {
      const k = Math.min(1, Math.max(0, (t - w0) / WIPE));
      const f = 1 - k * k * (3 - 2 * k);
      washGlobal.uWipe.value = f * W;
      this.line.classList.toggle('hidden', !(k > 0 && k < 1));
      this.line.style.left = (f * 100).toFixed(2) + '%';
      this.lb.classList.toggle('hidden', f < 0.12);
      this.la.classList.toggle('hidden', f > 0.88);
      this.lb.style.left = Math.max(8, f * 50) + '%';
      this.la.style.left = Math.min(92, 50 + f * 50) + '%';
    }
    if (t >= w1 && !this.sparked) {
      this.sparked = true;
      washGlobal.uWipe.value = -1;
      for (const s of this.job.surfaces) s.showBefore(false);
      this.line.classList.add('hidden'); this.lb.classList.add('hidden'); this.la.classList.add('hidden');
      const sp = el('div', { class: 'sparkle' }, 'Sparkling!<small>' + this.job.def.name + '</small>');
      this.ui.appendChild(sp);
      sfx.fanfare(); sfx.sparkle();
      this.burst(90);
    }
    if (this.sparked) this.burst(Math.random() < 0.6 ? 2 : 1);
    if (t >= w1 + SPARK) this.finish();
  }

  // sparkles on random spots of the cleaned objects
  burst(n) {
    const parts = this.app.parts, S = this.job.surfaces;
    if (!parts || !S.length) return;
    for (let i = 0; i < n; i++) {
      const s = S[(Math.random() * S.length) | 0];
      if (!s.count) continue;
      const k = (Math.random() * s.count) | 0;
      parts.sparkle(s.pos[k * 3], s.pos[k * 3 + 1] + 0.05, s.pos[k * 3 + 2]);
    }
  }

  finish() {
    if (!this.active) return;
    this.active = false;
    washGlobal.uWipe.value = -1;
    for (const s of this.job.surfaces) s.showBefore(false);
    if (this.ui) this.ui.remove();
    this.ui = null;
    const cb = this.onDone; this.onDone = null;
    if (cb) cb();
  }
}
