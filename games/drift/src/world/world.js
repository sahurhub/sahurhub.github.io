// Drift! - the map: ground, sea, roads, buildings, props and their collision.
// Files (made by tools/blender/do_map.py):
//   assets/map/layout.json  roads, spawns, prop positions, colliders, minimap data
//   assets/map/heights.bin  ground heights (uint16 grid) for collision and height lookups
//   assets/map/map.glb      everything you see that isn't repeated (meshopt compressed)
//   assets/map/props.glb    one model per repeated prop (trees, lamps, signs...), drawn with instancing
//   assets/map/tex/*.webp   shared ground / road textures
// Materials named MAT_TERRAIN, MAT_ROAD, MAT_CONCRETE, MAT_DIRT, MAT_WATER are replaced in the game.
import * as THREE from 'three';
import { loadGLB, loadJSON, fetchBytes, loadTexture } from '../core/assets.js';
import { asset, FLAGS } from '../config.js';
import { patchMaterial, weatherUniforms } from './weather-mat.js';

export class World {
  constructor(scene, physics, quality) {
    this.scene = scene;
    this.ph = physics;
    this.quality = quality;
    this.root = new THREE.Group();
    this.root.name = 'world';
    scene.add(this.root);
    this.layout = null;
    this.props = [];      // { type, lods: [InstancedMesh[]], items: [[x,y,z,r,s]], dist }
    this.propTimer = 0;
    this.maxAniso = 4;
  }

  async load(onProgress, renderer) {
    this.maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    if (FLAGS.testWorld) { this.buildTestWorld(); onProgress && onProgress(1); return; }
    const prog = { layout: 0, h: 0, map: 0, props: 0, tex: 0 };
    const report = () => onProgress && onProgress(prog.layout * 0.03 + prog.h * 0.07 + prog.map * 0.6 + prog.props * 0.15 + prog.tex * 0.15);
    const layoutP = loadJSON(asset('map/layout.json')).then((l) => { prog.layout = 1; report(); return l; });
    const heightsP = fetchBytes(asset('map/heights.bin'), (a, b) => { prog.h = b ? a / b : 0.5; report(); });
    const mapP = loadGLB(asset('map/map.glb'), (a, b) => { prog.map = b ? a / b : 0.5; report(); });
    const propsP = loadGLB(asset('map/props.glb'), (a, b) => { prog.props = b ? a / b : 0.5; report(); }).catch((e) => { console.warn('props', e); return null; });
    const texP = this.loadTextures().then((t) => { prog.tex = 1; report(); return t; });
    const surfP = fetchBytes(asset('map/surface.bin')).catch(() => null);
    const [layout, heights, map, props, tex, surf] = await Promise.all([layoutP, heightsP, mapP, propsP, texP, surfP]);
    this.layout = layout;
    this.setupHeights(heights);
    this.setupSurface(surf);
    this.tex = tex;
    this.buildMap(map.scene);
    if (props) this.buildProps(props.scene);
    this.buildColliders();
  }

  // ---- textures and materials --------------------------------------------------------
  async loadTextures() {
    const names = ['grass', 'sand', 'rock', 'dirt', 'asphalt', 'concrete', 'gravel', 'markings'];
    const out = {};
    await Promise.all(names.map(async (n) => {
      try {
        const t = await loadTexture(asset(`map/tex/${n}.webp`), { repeat: true });
        t.anisotropy = this.maxAniso;
        if (n === 'markings') { t.wrapS = THREE.ClampToEdgeWrapping; }
        out[n] = t;
      } catch (e) { console.warn('texture', n, e.message); }
    }));
    return out;
  }

  /** Ground: four textures blended by the vertex colours (r grass, g sand, b rock, rest dirt; a = baked shade). */
  terrainMaterial() {
    const t = this.tex;
    const m = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
    m.userData.extraKey = 'terrain';
    m.onBeforeCompile = (sh) => {
      sh.uniforms.tGrass = { value: t.grass || null }; sh.uniforms.tSand = { value: t.sand || null };
      sh.uniforms.tRock = { value: t.rock || null }; sh.uniforms.tDirt = { value: t.dirt || null };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 color;\nvarying vec4 vSplat;\nvarying vec3 vTP;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSplat = color;\nvTP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D tGrass, tSand, tRock, tDirt;\nvarying vec4 vSplat;\nvarying vec3 vTP;')
        .replace('#include <map_fragment>', `
          // the reference look: bright, simple colours with only a hint of texture detail
          // (detail = the texture's brightness compared with its own average, so any photo works)
          vec2 tuv = vTP.xz / 3.2;
          vec2 tuv2 = vTP.xz / 23.0;
          #define LUM(c) dot(c, vec3(0.3, 0.55, 0.15))
          #define DETAIL(t, uv) clamp(LUM(texture(t, uv).rgb) / max(LUM(texture(t, uv, 12.0).rgb), 0.02), 0.5, 1.6)
          float gv = 0.5 + 0.5 * sin(vTP.x * 0.013 + sin(vTP.z * 0.011) * 2.0);
          vec3 cg = mix(vec3(0.15, 0.36, 0.05), vec3(0.21, 0.43, 0.07), gv) * mix(1.0, DETAIL(tGrass, tuv) * DETAIL(tGrass, tuv2), 0.28);
          vec3 cf = vec3(0.66, 0.55, 0.36) * mix(1.0, DETAIL(tSand, vTP.xz / 11.0), 0.22);
          vec3 cr = vec3(0.33, 0.32, 0.30) * mix(1.0, DETAIL(tRock, tuv * 0.6), 0.45);
          vec3 cd = vec3(0.30, 0.21, 0.12) * mix(1.0, DETAIL(tDirt, tuv), 0.35);          vec3 w = clamp(vSplat.rgb, 0.0, 1.0);
          float wd = clamp(1.0 - w.r - w.g - w.b, 0.0, 1.0);
          vec3 tcol = (cg * w.r + cf * w.g + cr * w.b + cd * wd) / max(0.001, w.r + w.g + w.b + wd);
          diffuseColor.rgb *= tcol * (0.35 + 0.65 * vSplat.a);
        `);
    };
    return patchMaterial(m, 'ground');
  }

  /** Material using a texture laid out in world space (no stretching along curvy roads). */
  worldUVMaterial(tex, scale, opts = {}) {
    const m = new THREE.MeshStandardMaterial({ roughness: opts.roughness ?? 0.9, metalness: 0, color: opts.color || 0xffffff });
    // roads, lots and paths lie right on the ground: draw them a hair closer so the grass never flickers through
    m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -6;
    m.userData.extraKey = 'wuv' + scale + (opts.markings ? 'm' : '') + (opts.vcolor ? 'v' : '') + (opts.flat ? 'f' + opts.flat.join('_') : '');
    const marks = opts.markings ? this.tex.markings : null;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.tBase = { value: tex || null };
      sh.uniforms.tMarks = { value: marks };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWP;\nvarying vec2 vRoadUv;' + (opts.vcolor ? '\nattribute vec4 color;\nvarying float vShade;' : ''))
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvRoadUv = uv;' + (opts.vcolor ? '\nvShade = color.a;' : ''));
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D tBase;\nuniform sampler2D tMarks;\nvarying vec3 vWP;\nvarying vec2 vRoadUv;' + (opts.vcolor ? '\nvarying float vShade;' : ''))
        .replace('#include <map_fragment>', `
          vec3 base = mix(texture2D(tBase, vWP.xz / ${scale.toFixed(1)}).rgb, texture2D(tBase, vWP.xz / ${(scale * 4.3).toFixed(1)}).rgb, 0.3);
          ${opts.flat ? `{ float bl = dot(base, vec3(0.3, 0.55, 0.15)) / max(dot(texture(tBase, vWP.xz / ${scale.toFixed(1)}, 12.0).rgb, vec3(0.3, 0.55, 0.15)), 0.02);
            base = vec3(${opts.flat.map((v) => v.toFixed(3)).join(', ')}) * mix(1.0, clamp(bl, 0.5, 1.6), ${(opts.detail ?? 0.3).toFixed(2)}); }` : ''}
          diffuseColor.rgb *= base;
          ${marks ? 'vec4 mk = texture2D(tMarks, vRoadUv); diffuseColor.rgb = mix(diffuseColor.rgb, mk.rgb, mk.a * 0.92);' : ''}
          ${opts.vcolor ? 'diffuseColor.rgb *= 0.4 + 0.6 * vShade;' : ''}
        `);
    };
    return patchMaterial(m, opts.kind || 'road');
  }

  waterMaterial() {
    // the sea: bright blue like a sunny day on the coast (a little lighter where it is shallow is drawn by the sand)
    const m = new THREE.MeshStandardMaterial({ color: 0x1d5f9e, roughness: 0.12, metalness: 0.1, envMapIntensity: 1.2 });
    m.userData.extraKey = 'water';
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = weatherUniforms.uTime;
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          {
            vec3 wp = vViewPosition;
            float t = uTime * 0.6;
            vec2 q = gl_FragCoord.xy * 0.0;
            normal = normalize(normal + vec3(sin(wp.x * 0.9 + t) * 0.04 + sin(wp.y * 1.7 - t * 1.3) * 0.03, 0.0, cos(wp.y * 1.1 + t) * 0.04));
          }`);
    };
    return m;
  }

  buildMap(scene) {
    const mats = {
      MAT_TERRAIN: this.terrainMaterial(),
      // smooth light-grey roads, light concrete and pale gravel, like the reference
      MAT_ROAD: this.worldUVMaterial(this.tex.asphalt, 3.2, { markings: true, roughness: 0.85, kind: 'road', flat: [0.15, 0.155, 0.165], detail: 0.22 }),
      MAT_CONCRETE: this.worldUVMaterial(this.tex.concrete, 1.9, { roughness: 0.9, kind: 'road', flat: [0.45, 0.45, 0.43], detail: 0.3 }),
      MAT_DIRT: this.worldUVMaterial(this.tex.gravel, 2.4, { roughness: 1, kind: 'ground', flat: [0.36, 0.3, 0.22], detail: 0.35 }),
      MAT_WATER: this.waterMaterial(),
    };
    const shadows = this.quality.shadows;
    // roads and lots are painted onto the ground (no separate collision: the car drives on the ground)
    const isCollider = (o) => /^COL_/.test(o.name) || /^COL_/.test(o.parent && o.parent.name);
    // side walls under road, lot and sidewalk edges: plain concrete (the ground-projected road
    // textures would smear into streaks on a vertical face)
    const skirtMat = patchMaterial(new THREE.MeshStandardMaterial({ color: 0x8c8983, roughness: 0.95, metalness: 0, side: THREE.DoubleSide }), 'object');
    scene.traverse((o) => {
      if (!o.isMesh) return;
      if (/^COL_/.test(o.name) || /^COL_/.test(o.parent && o.parent.name)) { o.visible = false; return; }
      if (/^SKIRT_/.test(o.name) || /^SKIRT_/.test(o.parent && o.parent.name)) {
        o.material = skirtMat; o.receiveShadow = shadows; o.castShadow = false;
        o.matrixAutoUpdate = false; o.updateMatrix();
        return;
      }
      const name = (o.material && o.material.name || '').replace(/\.\d+$/, '');
      const base = Object.keys(mats).find((k) => name.startsWith(k));
      if (base) o.material = mats[base];
      else {
        const list = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of list) {
          if (!m) continue;
          if (m.map) m.map.anisotropy = this.maxAniso;
          patchMaterial(m, /ROOF|GROUND|GRASS/i.test(m.name) ? 'ground' : 'object');
        }
      }
      o.receiveShadow = shadows && base !== 'MAT_WATER';
      o.castShadow = shadows && !base && !/^TERRAIN/.test(o.name);
      o.matrixAutoUpdate = false;
      o.updateMatrix();
    });
    this.map = scene;
    this.root.add(scene);
    scene.updateMatrixWorld(true);
    // road surfaces (incl. bridges and ramps), sidewalks and parking lots are also the collision
    this.colMeshes = [];
    scene.traverse((o) => { if (o.isMesh && isCollider(o)) this.colMeshes.push(o); });
  }

  // ---- heights ----------------------------------------------------------------------------
  setupHeights(bytes) {
    const t = this.layout.terrain;
    const n = t.n, size = t.size;
    const u16 = new Uint16Array(bytes.buffer, bytes.byteOffset, n * n);
    const h = new Float32Array(n * n);
    const k = (t.max - t.min) / 65535;
    for (let i = 0; i < n * n; i++) h[i] = t.min + u16[i] * k;
    this.hgrid = { n, size, h, cell: size / (n - 1), x0: -size / 2, z0: -size / 2 };
  }

  /** Ground height (not counting roads on bridges) at x, z. */
  heightAt(x, z) {
    const g = this.hgrid;
    if (!g) return 0;
    const fx = Math.max(0, Math.min(g.n - 1.001, (x - g.x0) / g.cell)), fz = Math.max(0, Math.min(g.n - 1.001, (z - g.z0) / g.cell));
    const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
    const a = g.h[iz * g.n + ix], b = g.h[iz * g.n + ix + 1], c = g.h[(iz + 1) * g.n + ix], d = g.h[(iz + 1) * g.n + ix + 1];
    // the same two triangles per square as the physics and the visible ground (b-c diagonal)
    return tx + tz <= 1 ? a + tx * (b - a) + tz * (c - a) : d + (1 - tx) * (c - d) + (1 - tz) * (b - d);
  }

  // ---- what the car is driving on (for grip) -------------------------------------------------
  /** Road segments in a 16 m grid, lots as polygons, and the ground kinds from surface.bin. */
  setupSurface(bytes) {
    const L = this.layout, C = 16;
    this.surf = { C, cells: new Map(), pads: [], grid: bytes ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) : null, kinds: ['ground', 'sand', 'dirt', 'rock'] };
    const S = this.surf;
    for (const r of L.roads || []) {
      const p = r.p, half = r.w / 2 + 0.3, kind = r.kind === 'track' ? 'dirt' : 'road';
      for (let i = 0; i + 5 < p.length; i += 3) {
        const seg = { ax: p[i], az: p[i + 2], bx: p[i + 3], bz: p[i + 5], h2: half * half, kind };
        const x0 = Math.floor((Math.min(seg.ax, seg.bx) - half) / C), x1 = Math.floor((Math.max(seg.ax, seg.bx) + half) / C);
        const z0 = Math.floor((Math.min(seg.az, seg.bz) - half) / C), z1 = Math.floor((Math.max(seg.az, seg.bz) + half) / C);
        for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
          const k = cx * 100003 + cz;
          if (!S.cells.has(k)) S.cells.set(k, []);
          S.cells.get(k).push(seg);
        }
      }
    }
    for (const pd of L.pads || []) {
      const xs = pd.p.map((q) => q[0]), zs = pd.p.map((q) => q[1]);
      S.pads.push({ poly: pd.p, kind: pd.mat === 'dirt' ? 'dirt' : 'road', minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) });
    }
  }

  /** 'road' | 'dirt' | 'sand' | 'rock' | 'ground' (grass) at x, z. */
  surfaceKind(x, z) {
    const S = this.surf;
    if (FLAGS.testWorld) return 'road';           // the flat test world is a test track
    if (!S) return 'ground';
    for (const pd of S.pads) {
      if (x < pd.minX || x > pd.maxX || z < pd.minZ || z > pd.maxZ) continue;
      if (pointInPoly(x, z, pd.poly)) return pd.kind;
    }
    const list = S.cells.get(Math.floor(x / S.C) * 100003 + Math.floor(z / S.C));
    if (list) {
      for (const s of list) {
        const dx = s.bx - s.ax, dz = s.bz - s.az, L2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / L2));
        const ex = s.ax + dx * t - x, ez = s.az + dz * t - z;
        if (ex * ex + ez * ez < s.h2) return s.kind;
      }
    }
    const g = this.hgrid;
    if (S.grid && g && S.grid.length === g.n * g.n) {
      const ix = Math.round((x - g.x0) / g.cell), iz = Math.round((z - g.z0) / g.cell);
      if (ix >= 0 && iz >= 0 && ix < g.n && iz < g.n) return S.kinds[S.grid[iz * g.n + ix]] || 'ground';
    }
    return 'ground';
  }

  /** Highest surface (ground, road, bridge) under x, z, using the physics world. */
  surfaceAt(x, z) {
    const top = 400;
    const d = this.ph.castRay(x, top, z, 0, -1, 0, 800);
    return d >= 0 ? top - d : this.heightAt(x, z);
  }

  // ---- collision ----------------------------------------------------------------------------
  buildColliders() {
    const g = this.hgrid;
    // the heightfield wants column-major heights
    const n = g.n, cm = new Float32Array(n * n);
    for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) cm[iz + ix * n] = g.h[iz * n + ix];
    this.ph.addHeightfield(n, n, cm, g.size, g.size, 0, 0);
    for (const m of this.colMeshes) {
      const geo = m.geometry;
      const pos = geo.attributes.position;
      const v = new Float32Array(pos.count * 3);
      const p = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) { p.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); v[i * 3] = p.x; v[i * 3 + 1] = p.y; v[i * 3 + 2] = p.z; }
      const idx = geo.index ? new Uint32Array(geo.index.array) : Uint32Array.from({ length: pos.count }, (_, i) => i);
      this.ph.addTrimesh(v, idx, /DIRT/.test(m.name) ? 'dirt' : 'road');
    }
    const c = this.layout.colliders || {};
    for (const b of c.boxes || []) this.ph.addBox(b[0], b[1], b[2], b[3], b[4], b[5], b[6] || 0);
    for (const cy of c.cylinders || []) this.ph.addCylinder(cy[0], cy[1], cy[2], cy[3], cy[4]);
    // invisible walls at the edge of the world
    const half = g.size / 2;
    for (const [x, z, hx, hz] of [[0, -half, half, 2], [0, half, half, 2], [-half, 0, 2, half], [half, 0, 2, half]]) this.ph.addBox(x, 60, z, hx, 120, hz, 0, 'edge');
  }

  // ---- instanced props --------------------------------------------------------------------
  buildProps(scene) {
    const placements = this.layout.props || {};
    const shadows = this.quality.shadows;
    for (const [type, items] of Object.entries(placements)) {
      // Blender may add ".001" to names and the loader drops the dot ("PROP_bench_LOD0001")
      const find = (root, base) => {
        let hit = root.getObjectByName(base);
        if (!hit) root.traverse((o) => { if (!hit && o.name.startsWith(base) && /^\d*$/.test(o.name.slice(base.length))) hit = o; });
        return hit;
      };
      const node = find(scene, 'PROP_' + type);
      if (!node || !items.length) continue;
      const lodNodes = [0, 1].map((i) => find(node, `PROP_${type}_LOD${i}`)).filter(Boolean);
      if (!lodNodes.length) lodNodes.push(node);
      const lods = lodNodes.map((ln) => {
        const meshes = [];
        ln.updateMatrixWorld(true);
        const nodeInv = new THREE.Matrix4().copy(node.matrixWorld).invert();
        ln.traverse((o) => {
          if (!o.isMesh) return;
          const local = new THREE.Matrix4().multiplyMatrices(nodeInv, o.matrixWorld);
          const geo = o.geometry.clone().applyMatrix4(local);
          let mat = o.material;
          if (mat.isMeshBasicMaterial) {
            // unlit models (the tree pack) get normal lighting so they darken in storms and fog
            const cache = this.litCache || (this.litCache = new Map());
            if (!cache.has(mat)) {
              cache.set(mat, new THREE.MeshStandardMaterial({
                name: mat.name, map: mat.map, color: mat.color, alphaTest: mat.alphaTest, side: mat.side,
                transparent: mat.transparent, vertexColors: mat.vertexColors, roughness: 0.92, metalness: 0,
              }));
            }
            mat = cache.get(mat);
          }
          if (mat.map) mat.map.anisotropy = this.maxAniso;
          const leafy = /^(tree|bush|hedge|fern)/.test(type);
          if (leafy) { treeNormals(geo); foliageMaterial(mat); }
          patchMaterial(mat, 'object');
          if (leafy || /LEAF|LEAVES|FOLIAGE|pine|birch|oak|spruce|tree/i.test(mat.name) || mat.alphaTest > 0 || mat.transparent) {
            mat.alphaTest = Math.max(0.4, mat.alphaTest || 0); mat.side = THREE.DoubleSide; mat.transparent = false; mat.depthWrite = true;
          }
          const im = new THREE.InstancedMesh(geo, mat, items.length);
          im.count = 0;
          im.castShadow = shadows && !/sign|marker/i.test(type);
          im.receiveShadow = false;
          im.frustumCulled = false;
          meshes.push(im);
          this.root.add(im);
        });
        return meshes;
      });
      const r = this.layout.propInfo && this.layout.propInfo[type];
      this.props.push({ type, lods, items, dist: (r && r.dist) || 450, lod1: (r && r.lod1) || 120 });
    }
    this.updateProps(new THREE.Vector3(), true);
  }

  updateProps(cam, force) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const k = this.quality.propDistance || 1;
    for (const pr of this.props) {
      const far2 = (pr.dist * k) ** 2, l1 = (pr.lod1 * k) ** 2;
      const counts = pr.lods.map(() => 0);
      for (const it of pr.items) {
        const dx = it[0] - cam.x, dz = it[2] - cam.z, d2 = dx * dx + dz * dz;
        if (d2 > far2) continue;
        const li = d2 < l1 || pr.lods.length === 1 ? 0 : 1;
        p.set(it[0], it[1], it[2]); q.setFromAxisAngle(up, it[3] || 0); s.setScalar(it[4] || 1);
        m.compose(p, q, s);
        for (const im of pr.lods[li]) im.setMatrixAt(counts[li], m);
        counts[li]++;
      }
      pr.lods.forEach((meshes, li) => { for (const im of meshes) { im.count = counts[li]; im.instanceMatrix.needsUpdate = true; } });
    }
    void force;
  }

  // ---- roads -------------------------------------------------------------------------------
  /** Nearest point on a road (on the right-hand lane), facing along the road. */
  nearestRoad(x, z, heading) {
    let best = null, bd = 1e18;
    for (const r of this.layout.roads || []) {
      const p = r.p;
      for (let i = 0; i < p.length - 3; i += 3) {
        const ax = p[i], az = p[i + 2], bx = p[i + 3], bz = p[i + 5];
        const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
        const px = ax + dx * t, pz = az + dz * t, d = (px - x) ** 2 + (pz - z) ** 2;
        if (d < bd) { bd = d; best = { r, ax, az, dx, dz, px, pz, py: p[i + 1] + (p[i + 4] - p[i + 1]) * t }; }
      }
    }
    if (!best) return { x: 0, y: 2, z: 0, h: 0 };
    let h = Math.atan2(-best.dx, -best.dz);
    // keep the direction closest to the way the car was facing
    if (heading !== undefined && Math.abs(Math.atan2(Math.sin(h - heading), Math.cos(h - heading))) > Math.PI / 2) h += Math.PI;
    const fx = -Math.sin(h), fz = -Math.cos(h);
    const lane = best.r.oneway ? 0 : Math.min(best.r.w / 4, 2.2);
    // right of the centre line: right = (-fz, fx)
    const x2 = best.px - fz * lane, z2 = best.pz + fx * lane;
    return { x: x2, y: this.surfaceAt(x2, z2) + 0.6, z: z2, h };
  }

  spawnPoint(i) {
    const list = (this.layout && this.layout.spawns) || [{ x: 0, y: 1, z: 0, h: 0 }];
    const s = list[((i % list.length) + list.length) % list.length];
    return { x: s.x, y: s.y + 0.6, z: s.z, h: s.h };
  }

  update(dt, cam, serverMs) {
    weatherUniforms.uTime.value += dt;
    this.propTimer -= dt;
    if (this.propTimer <= 0) { this.propTimer = 0.4; this.updateProps(cam); }
    void serverMs;
  }

  // ---- flat test world (?testworld) ----------------------------------------------------------
  buildTestWorld() {
    const size = 1200;
    this.layout = {
      size, terrain: { n: 2, size, min: 0, max: 0 },
      spawns: [{ x: 0, y: 0, z: 0, h: 0 }, { x: 6, y: 0, z: 0, h: 0 }, { x: -6, y: 0, z: 0, h: 0 }],
      roads: [{ id: 'loop', kind: 'main', w: 12, p: loopPoints(180, 0) }], gasStations: [{ name: 'Test', x: 0, z: 10 }], landmarks: [],
    };
    this.hgrid = { n: 2, size, h: new Float32Array(4), cell: size, x0: -size / 2, z0: -size / 2 };
    const tex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const g = c.getContext('2d'); g.fillStyle = '#5d6b56'; g.fillRect(0, 0, 256, 256);
      g.strokeStyle = '#4b5747'; g.lineWidth = 2; for (let i = 0; i <= 256; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(size / 16, size / 16); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = this.maxAniso; return t;
    })();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), patchMaterial(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }), 'ground'));
    ground.receiveShadow = true;
    this.root.add(ground);
    this.ph.addHeightfield(2, 2, new Float32Array(4), size, size);
    // a road loop to drive on
    const roadMat = patchMaterial(new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.8 }), 'road');
    const pts = this.layout.roads[0].p;
    const rv = [], ri = [];
    const n = pts.length / 3;
    for (let i = 0; i < n; i++) {
      const a = i, b = (i + 1) % n;
      const dx = pts[b * 3] - pts[a * 3], dz = pts[b * 3 + 2] - pts[a * 3 + 2], L = Math.hypot(dx, dz) || 1;
      const nx = -dz / L * 6, nz = dx / L * 6;
      rv.push(pts[a * 3] + nx, 0.03, pts[a * 3 + 2] + nz, pts[a * 3] - nx, 0.03, pts[a * 3 + 2] - nz);
      const j = i * 2, k = ((i + 1) % n) * 2;
      ri.push(j, k, j + 1, j + 1, k, k + 1);
    }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rv, 3)); rg.setIndex(ri); rg.computeVertexNormals();
    const road = new THREE.Mesh(rg, roadMat); road.receiveShadow = true; this.root.add(road);
    // boxes, ramps and poles to crash into and jump off
    const boxMat = patchMaterial(new THREE.MeshStandardMaterial({ color: 0x9aa4b4, roughness: 0.7 }), 'object');
    const R = this.ph;
    const addBox = (x, y, z, sx, sy, sz, rx = 0, ry = 0) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), boxMat);
      mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, 0, 'YXZ');
      mesh.castShadow = mesh.receiveShadow = true;
      this.root.add(mesh);
      R.addBoxQ(x, y, z, sx / 2, sy / 2, sz / 2, mesh.quaternion);
    };
    addBox(30, 1, -40, 4, 2, 4);
    addBox(-30, 1.5, -60, 10, 3, 2);
    addBox(60, 4, 20, 20, 8, 20);
    addBox(0, 0.9, -90, 8, 1, 16, 0.16);       // small jump
    addBox(-40, 1.6, -120, 10, 1, 24, 0.22);   // bigger jump
    for (let i = 0; i < 12; i++) {
      const x = -60 + i * 10, z = 40;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4, 8), boxMat); pole.position.set(x, 2, z); pole.castShadow = true; this.root.add(pole);
      R.addCylinder(x, 2, z, 0.12, 2);
    }
    for (const [x, z, hx, hz] of [[0, -size / 2, size / 2, 2], [0, size / 2, size / 2, 2], [-size / 2, 0, 2, size / 2], [size / 2, 0, 2, size / 2]]) R.addBox(x, 20, z, hx, 40, hz, 0, 'edge');
  }
}

/**
 * Trees: the tree pack was made unlit, so its normals point every which way and pines came out
 * black under real light. Point every normal out from the middle of the crown (tilted up a little):
 * the whole tree then shades like one leafy ball, light on the sunny side, darker on the other.
 */
function treeNormals(geo) {
  geo.computeBoundingBox();
  const b = geo.boundingBox, h = b.max.y - b.min.y;
  const cx = (b.min.x + b.max.x) / 2, cy = b.min.y + h * 0.45, cz = (b.min.z + b.max.z) / 2;
  const p = geo.attributes.position, n = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i) - cx, y = (p.getY(i) - cy) * 0.7 + h * 0.18, z = p.getZ(i) - cz;
    const l = Math.hypot(x, y, z) || 1;
    n[i * 3] = x / l; n[i * 3 + 1] = y / l; n[i * 3 + 2] = z / l;
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(n, 3));
}

/** Leaf cards are seen from both sides: keep the outward normals on the back too (no flip). */
function foliageMaterial(mat) {
  if (mat.userData.foliage) return;
  mat.userData.foliage = true;
  mat.userData.extraKey = (mat.userData.extraKey || '') + 'fol';
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>',
      THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''))
      // far away the leaf texture's smaller (mip) versions get see-through and trees look bare:
      // make leaves more solid with distance so far trees keep their leaves
      .replace('#include <alphatest_fragment>', 'diffuseColor.a *= 1.0 + clamp((length(vViewPosition) - 12.0) / 35.0, 0.0, 2.2);\n#include <alphatest_fragment>');
  };
  mat.needsUpdate = true;
}

function loopPoints(r, y) {
  const out = [];
  for (let i = 0; i < 64; i++) { const a = (i / 64) * Math.PI * 2; out.push(Math.cos(a) * r * 1.4, y, Math.sin(a) * r); }
  return out;
}

function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
