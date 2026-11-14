// 3D preview stage for the dealership, garage and wardrobe. Rendered by the main renderer
// (instead of the city) while one of those menus is open, framed into the free screen area.
import * as THREE from 'three';
import { createVehicleModel } from './vehicles.js';
import { CharacterModel } from './character.js';

export class Preview {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#1d2333');
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
    const hemi = new THREE.HemisphereLight(0xdfeaff, 0x3a3f4f, 1.1);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(5, 8, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const sc = key.shadow.camera; sc.left = sc.bottom = -8; sc.right = sc.top = 8;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fc7ff, 1.2);
    rim.position.set(-6, 4, -6);
    this.scene.add(rim);
    // turntable
    const table = new THREE.Mesh(new THREE.CylinderGeometry(6, 6.2, 0.3, 48), new THREE.MeshStandardMaterial({ color: '#2b3245', roughness: 0.4, metalness: 0.3 }));
    table.position.y = -0.15;
    table.receiveShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(6.05, 0.06, 8, 64).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff7a1f' }));
    this.table = new THREE.Group();
    this.table.add(table, ring);
    this.scene.add(this.table);
    this.turn = new THREE.Group();
    this.scene.add(this.turn);
    this.subject = null;
    this.active = false;
    this.angle = 0.6;
    this.dragging = false;
    this.autoSpin = true;
    this.zoom = 1;
  }

  clear() {
    if (this.subject) {
      this.turn.remove(this.subject.root || this.subject);
      this.subject = null;
    }
    this.char = null;
  }

  showVehicle(def, custom) {
    this.clear();
    if (!def || def.id === 'walk') return this.showCharacter(this.lastLook || {});
    const M = createVehicleModel(def, custom || {});
    M.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
    for (const m of M.mats.headlight || []) m.emissiveIntensity = 1.6;
    this.subject = M;
    this.turn.add(M.root);
    const size = M.size;
    M.root.position.set(0, 0, -M.center.z);
    this.frame(Math.max(size.x, size.z, size.y * 1.4), size.y);
  }

  showCharacter(look, equipped = {}) {
    this.clear();
    this.lastLook = look;
    const ch = new CharacterModel(look);
    for (const slot of ['hat', 'face', 'back']) ch.setAccessory(slot, equipped[slot] || null);
    ch.play('idle');
    this.char = ch;
    this.subject = ch;
    this.turn.add(ch.root);
    this.frame(2.4, 1.9);
  }

  frame(span, height) {
    this.span = span;
    this.height = height;
    // turntable sized to the subject (radius ~0.7 x its longest side)
    const s = Math.max(0.3, span * 0.7 / 6);
    this.table.scale.set(s, 1, s);
  }

  // rect: the free area of the screen (px) where the subject should appear
  render(renderer, dt, rect) {
    if (this.autoSpin && !this.dragging) this.angle += dt * 0.35;
    this.turn.rotation.y = this.angle;
    if (this.char) this.char.update(dt);
    const W = renderer.domElement.clientWidth, H = renderer.domElement.clientHeight;
    this.camera.aspect = W / H;
    // distance so the subject (plus margin) fits inside the free rect, not the whole canvas
    const span = (this.span || 4) * this.zoom, hgt = (this.height || 1.5) * this.zoom;
    const tv = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const th = tv * this.camera.aspect;
    const fw = Math.max(0.15, rect.w / W), fh = Math.max(0.15, rect.h / H);
    const dist = Math.max(span * 0.6 / (th * fw), hgt * 0.75 / (tv * fh), 2.5) + span * 0.3;
    const dir = new THREE.Vector3(0.72, 0.36, 0.72).normalize();
    this.camera.position.set(dir.x * dist, (this.height || 1.5) * 0.45 + dir.y * dist, dir.z * dist);
    this.camera.lookAt(0, (this.height || 1.5) * 0.45, 0);
    // shift the image so the subject is centred inside rect
    const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
    this.camera.setViewOffset(W, H, W / 2 - cx, H / 2 - cy, W, H);
    this.camera.updateProjectionMatrix();
    renderer.render(this.scene, this.camera);
  }

  drag(dx) { this.angle += dx * 0.01; }
}
