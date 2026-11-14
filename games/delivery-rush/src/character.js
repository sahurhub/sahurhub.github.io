// Blocky courier character: GLB skinned model + animation mixer, per-instance colours,
// cosmetic accessories and a carried parcel. Falls back to a procedural box figure.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { assets, findNode } from './assets.js';
import { COSMETICS } from './config.js';

const ACC_BONE = { hat: 'head', face: 'head', back: 'torso' };
const LOOPS = { jump: false, cheer: true };

// The courier GLB has one primitive per material (10 draw calls per person). Merge them once
// into a single skinned mesh whose UVs point into a 16x1 colour palette, so every character is
// one draw call and recolouring just rewrites a few palette pixels.
const PALETTE = ['skin', 'shirt', 'shirt_trim', 'pants', 'shoes', 'hair', 'eyes', 'eye_white', 'belt', 'mouth'];
let paletteDefaults = null;
function prepareTemplate() {
  if (paletteDefaults) return true;
  const g = assets.get('characters/courier');
  if (!g) return false;
  const skinned = [];
  g.scene.traverse(o => { if (o.isSkinnedMesh) skinned.push(o); });
  if (!skinned.length) return false;
  paletteDefaults = PALETTE.map(() => '#888888');
  const geos = skinned.map(sm => {
    const geo = sm.geometry.clone();
    let idx = PALETTE.indexOf(sm.material.name);
    if (idx < 0) idx = 1;
    paletteDefaults[idx] = '#' + sm.material.color.getHexString(THREE.SRGBColorSpace);
    const n = geo.attributes.position.count;
    const uv = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { uv[i * 2] = (idx + 0.5) / 16; uv[i * 2 + 1] = 0.5; }
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'skinIndex', 'skinWeight'].includes(k)) geo.deleteAttribute(k);
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return geo;
  });
  const merged = mergeGeometries(geos.map(x => (x.index ? x : x)), false);
  const first = skinned[0];
  const mesh = new THREE.SkinnedMesh(merged, new THREE.MeshStandardMaterial({ roughness: 0.65 }));
  mesh.name = 'courier_body_merged';
  mesh.position.copy(first.position); mesh.quaternion.copy(first.quaternion); mesh.scale.copy(first.scale);
  first.parent.add(mesh);
  mesh.bind(first.skeleton, first.bindMatrix);
  for (const sm of skinned) sm.removeFromParent();
  return true;
}

export class CharacterModel {
  constructor(look = {}) {
    this.root = new THREE.Group();
    this.root.name = 'character';
    this.current = null;
    this.accessories = {};
    this.look = { shirt: '#ff7a1f', pants: '#2f3f5c', skin: '#f2c79b', hair: '#4a3020', shoes: '#262a33', ...look };
    this.fallback = !assets.has('characters/courier');
    if (!this.fallback) this.buildFromGlb();
    else this.buildFallback();
    this.setColors(this.look);
    this.carryBox = null;
    this.t = 0;
  }

  buildFromGlb() {
    prepareTemplate();
    const obj = assets.clone('characters/courier', false);
    this.model = obj;
    this.root.add(obj);
    this.mats = {};
    // own palette texture per character
    this.palCanvas = document.createElement('canvas');
    this.palCanvas.width = 16; this.palCanvas.height = 1;
    this.palCtx = this.palCanvas.getContext('2d');
    (paletteDefaults || []).forEach((c, i) => { this.palCtx.fillStyle = c; this.palCtx.fillRect(i, 0, 1, 1); });
    this.palTex = new THREE.CanvasTexture(this.palCanvas);
    this.palTex.magFilter = this.palTex.minFilter = THREE.NearestFilter;
    this.palTex.colorSpace = THREE.SRGBColorSpace;
    this.palTex.generateMipmaps = false;
    const mat = new THREE.MeshStandardMaterial({ map: this.palTex, roughness: 0.65 });
    obj.traverse(o => {
      if (o.isMesh || o.isSkinnedMesh) {
        o.castShadow = true;
        o.receiveShadow = false;
        o.frustumCulled = false;     // skinned bounds do not follow the animation
        if (o.isSkinnedMesh) { this.skinned = o; o.material = mat; }
      }
    });
    this.bones = {};
    for (const n of ['head', 'torso', 'hips', 'arm_L', 'arm_R', 'leg_L', 'leg_R']) this.bones[n] = findNode(obj, n);
    this.mixer = new THREE.AnimationMixer(obj);
    this.actions = {};
    for (const clip of assets.animations('characters/courier')) {
      const a = this.mixer.clipAction(clip);
      if (LOOPS[clip.name] === false) { a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; }
      this.actions[clip.name] = a;
    }
  }

  buildFallback() {
    this.mats = {
      shirt: new THREE.MeshStandardMaterial({ name: 'shirt' }), pants: new THREE.MeshStandardMaterial({ name: 'pants' }),
      skin: new THREE.MeshStandardMaterial({ name: 'skin' }), hair: new THREE.MeshStandardMaterial({ name: 'hair' }),
      shoes: new THREE.MeshStandardMaterial({ name: 'shoes' }),
    };
    const part = (w, h, d, mat, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d).translate(0, y, 0), mat); m.castShadow = true; return m; };
    const hips = new THREE.Group(); hips.position.y = 0.72;
    const torso = new THREE.Group(); hips.add(torso);
    torso.add(part(0.74, 0.62, 0.38, this.mats.shirt, 0.33));
    const head = new THREE.Group(); head.position.y = 0.66; torso.add(head);
    head.add(part(0.5, 0.46, 0.48, this.mats.skin, 0.26));
    head.add(part(0.54, 0.12, 0.5, this.mats.hair, 0.5));
    const arm = side => { const g = new THREE.Group(); g.position.set(0.53 * side, 0.58, 0); g.add(part(0.28, 0.6, 0.3, this.mats.shirt, -0.3)); torso.add(g); return g; };
    const leg = side => { const g = new THREE.Group(); g.position.set(0.17 * side, 0, 0); g.add(part(0.31, 0.72, 0.34, this.mats.pants, -0.36)); hips.add(g); return g; };
    this.fb = { hips, torso, head, armL: arm(1), armR: arm(-1), legL: leg(1), legR: leg(-1) };
    this.root.add(hips);
    this.bones = { head, torso, hips };
  }

  setColors(look) {
    Object.assign(this.look, look);
    if (this.palCtx) {
      for (const [k, v] of Object.entries({ skin: this.look.skin, shirt: this.look.shirt, pants: this.look.pants, hair: this.look.hair, shoes: this.look.shoes })) {
        const i = PALETTE.indexOf(k);
        if (i >= 0 && v) { this.palCtx.fillStyle = v; this.palCtx.fillRect(i, 0, 1, 1); }
      }
      this.palTex.needsUpdate = true;
      return;
    }
    const set = (name, col) => { if (this.mats[name] && col) this.mats[name].color.set(col); };
    set('shirt', this.look.shirt);
    set('pants', this.look.pants);
    set('skin', this.look.skin);
    set('hair', this.look.hair);
    set('shoes', this.look.shoes);
  }

  // slot: hat | face | back ; id from COSMETICS or null
  setAccessory(slot, id) {
    if (this.accessories[slot]) {
      this.accessories[slot].removeFromParent();
      this.accessories[slot] = null;
    }
    if (!id) return;
    const def = COSMETICS.find(c => c.id === id);
    if (!def) return;
    const key = def.model.replace('.glb', '');
    const acc = assets.clone(key, true);
    if (!acc) return;
    acc.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    const bone = this.bones[ACC_BONE[slot]];
    if (!bone) return;
    this.attachRest(acc, bone);
    this.accessories[slot] = acc;
  }

  // attach an object modelled in character space to a bone, using the rest pose
  // (obj's own position / rotation are read as character-space values)
  attachRest(obj, bone) {
    const parent = this.root.parent;
    const pos = this.root.position.clone(), quat = this.root.quaternion.clone(), scl = this.root.scale.clone();
    if (parent) parent.remove(this.root);
    this.root.position.set(0, 0, 0); this.root.quaternion.identity(); this.root.scale.set(1, 1, 1);
    if (this.skinned) this.skinned.skeleton.pose();
    this.root.updateMatrixWorld(true);
    this.root.add(obj);
    this.root.updateMatrixWorld(true);
    bone.attach(obj);
    this.root.position.copy(pos); this.root.quaternion.copy(quat); this.root.scale.copy(scl);
    if (parent) parent.add(this.root);
    this.root.updateMatrixWorld(true);
  }

  setCarry(color) {
    if (!color) {
      if (this.carryBox) this.carryBox.visible = false;
      return;
    }
    if (!this.carryBox) {
      const pk = assets.clone('props/package', true);
      const box = pk || new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5).translate(0, 0.25, 0), new THREE.MeshStandardMaterial({ name: 'box' }));
      box.scale.setScalar(0.9);
      box.traverse(o => { if (o.isMesh) o.castShadow = true; });
      const holder = new THREE.Group();
      holder.add(box);
      box.position.set(0, -0.22, 0);
      holder.position.set(0, 1.12, 0.5);
      if (this.bones.torso) this.attachRest(holder, this.bones.torso);
      else this.root.add(holder);
      this.carryBox = holder;
      this.carryMats = [];
      holder.traverse(o => { if (o.isMesh && (o.material.name === 'box' || o.material.name === '')) this.carryMats.push(o.material); });
    }
    this.carryBox.visible = true;
    for (const m of this.carryMats) m.color.set(color);
  }

  play(name, fade = 0.2, timeScale = 1) {
    if (this.fallback) { this.current = name; this.timeScale = timeScale; return; }
    const a = this.actions[name] || this.actions.idle;
    if (!a) return;
    a.timeScale = timeScale;
    if (this.current === a) return;
    a.reset();
    a.enabled = true;
    a.setEffectiveWeight(1);
    if (this.current) a.crossFadeFrom(this.current, fade, false);
    a.play();
    this.current = a;
  }
  setSpeed(ts) { if (this.current && !this.fallback) this.current.timeScale = ts; else this.timeScale = ts; }
  currentName() { return this.fallback ? this.current : (this.current && this.current.getClip().name); }

  update(dt) {
    this.t += dt;
    if (this.mixer) { this.mixer.update(dt); return; }
    // procedural animation for the fallback figure
    const f = this.fb, n = this.current || 'idle', t = this.t * (this.timeScale || 1);
    const sit = ['drive', 'ride', 'moto', 'sit'].includes(n);
    const swing = n === 'run' || n === 'carry_run' ? 0.9 : (n === 'walk' || n === 'carry_walk') ? 0.5 : 0;
    const s = Math.sin(t * (n.includes('run') ? 11 : 7)) * swing;
    f.legL.rotation.x = sit ? -1.4 : s; f.legR.rotation.x = sit ? -1.4 : -s;
    const carry = n.startsWith('carry');
    f.armL.rotation.x = carry || sit ? -1.2 : -s; f.armR.rotation.x = carry || sit ? -1.2 : s;
    f.armR.rotation.z = n === 'wave' ? 2.4 + Math.sin(t * 9) * 0.3 : 0;
    f.hips.position.y = 0.72 + Math.abs(s) * 0.05;
  }
}
