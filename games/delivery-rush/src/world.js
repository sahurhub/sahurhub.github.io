// Builds the 3D city from the layout data: merged ground/road geometry, instanced props and
// modular buildings, procedural towers with night-glow facades, sky, lighting and day/night.
import * as THREE from 'three';
import { CITY, DISTRICTS, DAY_LENGTH } from './config.js';
import { assets, buildInstanced, fallbackParts, worldTintMaterial } from './assets.js';
import { TEX, buildSignAtlas, textTexture } from './textures.js';
import { clamp, lerp, rng } from './utils.js';
import { districtAtCell, gx } from './cityLayout.js';

// ------------------------------------------------------------------ geometry builder
class Geo {
  constructor(color = false) { this.p = []; this.n = []; this.uv = []; this.c = color ? [] : null; this.i = []; }
  quad(a, b, c, d, uv, nrm, col) {
    const base = this.p.length / 3;
    for (const v of [a, b, c, d]) this.p.push(v[0], v[1], v[2]);
    for (let k = 0; k < 4; k++) this.n.push(nrm[0], nrm[1], nrm[2]);
    this.uv.push(...uv);
    if (this.c) for (let k = 0; k < 4; k++) this.c.push(col.r, col.g, col.b);
    this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  // horizontal rect, top facing; uvFn(x,z) -> [u,v]
  flat(x0, x1, z0, z1, y, uvFn, col) {
    const uv = [...uvFn(x0, z1), ...uvFn(x1, z1), ...uvFn(x1, z0), ...uvFn(x0, z0)];
    this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], uv, [0, 1, 0], col);
  }
  // axis-aligned box sides (+top if roof geo given). uvScale = metres per texture tile
  box(x0, x1, y0, y1, z0, z1, col, tile = 16, uo = 0, top = true) {
    const vy0 = y0 / tile, vy1 = y1 / tile;
    const ux = (x1 - x0) / tile, uz = (z1 - z0) / tile;
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [uo, vy0, uo + ux, vy0, uo + ux, vy1, uo, vy1], [0, 0, 1], col);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [uo, vy0, uo + ux, vy0, uo + ux, vy1, uo, vy1], [0, 0, -1], col);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [uo, vy0, uo + uz, vy0, uo + uz, vy1, uo, vy1], [1, 0, 0], col);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [uo, vy0, uo + uz, vy0, uo + uz, vy1, uo, vy1], [-1, 0, 0], col);
    if (top) this.flat(x0, x1, z0, z1, y1, (x, z) => [x / 8, z / 8], col);
  }
  // vertical quad facing direction ry (model +Z rotated), centred at (x,y,z)
  billboard(x, y, z, ry, w, h, uv, col) {
    const cs = Math.cos(ry), sn = Math.sin(ry);
    const rx = cs, rz = -sn;          // local +X in world
    const hw = w / 2, hh = h / 2;
    const a = [x - rx * hw, y - hh, z - rz * hw], b = [x + rx * hw, y - hh, z + rz * hw];
    const c = [x + rx * hw, y + hh, z + rz * hw], d = [x - rx * hw, y + hh, z - rz * hw];
    this.quad(a, b, c, d, [uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3]], [sn, 0, cs], col);
  }
  cylinder(x, z, r, y0, y1, seg, col) {
    for (let k = 0; k < seg; k++) {
      const a0 = k / seg * Math.PI * 2, a1 = (k + 1) / seg * Math.PI * 2;
      const p0 = [x + Math.sin(a0) * r, z + Math.cos(a0) * r], p1 = [x + Math.sin(a1) * r, z + Math.cos(a1) * r];
      const nm = [Math.sin((a0 + a1) / 2), 0, Math.cos((a0 + a1) / 2)];
      this.quad([p0[0], y0, p0[1]], [p1[0], y0, p1[1]], [p1[0], y1, p1[1]], [p0[0], y1, p0[1]], [0, 0, 1, 0, 1, 1, 0, 1], nm, col);
    }
  }
  empty() { return this.i.length === 0; }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.c) g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i);
    g.computeBoundingSphere();
    return g;
  }
}
const WHITE = new THREE.Color(1, 1, 1);

// chunks for culling / LOD (big chunks keep the number of draw calls low)
const CHUNK = 400;
const chunkKey = (x, z) => Math.floor((x + 700) / CHUNK) + ',' + Math.floor((z + 700) / CHUNK);

export class World {
  constructor(scene, layout, settings) {
    this.scene = scene;
    this.L = layout;
    this.settings = settings;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.chunks = new Map();          // key -> {group, cx, cz}
    this.mats = {};
    this.nightMats = [];               // {mat, base, color}
    this.time = 9;                     // hours
    this.night = 0;
    this.buildingsById = layout.buildings;
    this.barrier = null;
    this.signAtlas = null;
  }

  chunkGroup(x, z) {
    const k = chunkKey(x, z);
    let c = this.chunks.get(k);
    if (!c) {
      const [cx, cz] = k.split(',').map(Number);
      c = { group: new THREE.Group(), x: -700 + (cx + 0.5) * CHUNK, z: -700 + (cz + 0.5) * CHUNK };
      c.group.name = 'chunk_' + k;
      this.root.add(c.group);
      this.chunks.set(k, c);
    }
    return c.group;
  }

  build(onStep = () => {}) {
    this.buildSkyAndLights();
    onStep('Paving roads');
    this.buildGround();
    onStep('Raising buildings');
    this.buildSigns();
    this.buildProceduralBuildings();
    this.buildModularBuildings();
    onStep('Planting trees');
    this.buildProps();
    this.buildPOIs();
    this.prepareGlbMaterials();
    this.setTime(this.time);
  }

  // ---------------------------------------------------------------- sky + lights
  buildSkyAndLights() {
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight(0xcfe8ff, 0x6a8f4e, 0.9);
    s.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.4);
    this.sun.castShadow = true;
    const sh = this.sun.shadow;
    sh.mapSize.set(2048, 2048);
    sh.camera.left = -70; sh.camera.right = 70; sh.camera.top = 70; sh.camera.bottom = -70;
    sh.camera.near = 1; sh.camera.far = 400;
    sh.bias = -0.0004;
    sh.normalBias = 0.04;
    s.add(this.sun);
    s.add(this.sun.target);

    const skyGeo = new THREE.SphereGeometry(1400, 24, 12);
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color('#4aa3ff') }, horizon: { value: new THREE.Color('#d6ecff') },
        sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunColor: { value: new THREE.Color('#fff4d6') }, stars: { value: 0 },
      },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }',
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor; uniform float stars; varying vec3 vDir;
        float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164)))*43758.5453); }
        void main(){
          float y = clamp(vDir.y, -0.2, 1.0);
          vec3 c = mix(horizon, top, pow(max(y,0.0), 0.55));
          float sd = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
          c += sunColor * (pow(sd, 600.0) * 3.0 + pow(sd, 12.0) * 0.25);
          vec3 q = floor(vDir * 300.0);
          float st = step(0.997, h(q)) * stars * smoothstep(0.05, 0.3, y);
          c += vec3(st);
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(skyGeo, this.skyMat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    s.add(this.sky);
    s.fog = new THREE.Fog(0xd6ecff, 220, 760);
  }

  // ---------------------------------------------------------------- ground, roads, sidewalks
  buildGround() {
    const L = this.L;
    const RH = CITY.roadHalf, curb = CITY.curb;
    const mat = (map, opts = {}) => new THREE.MeshStandardMaterial({ map, roughness: 0.92, metalness: 0, ...opts });
    // base asphalt plane under everything + outskirts grass
    const base = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), mat(TEX.asphalt.clone()));
    base.material.map.repeat.set(300, 300);
    base.rotation.x = -Math.PI / 2;
    base.position.y = -0.02;
    base.receiveShadow = true;
    this.root.add(base);

    const outskirts = new Geo();
    const W = CITY.worldHalf + 600, E = 500 + RH;
    const uvG = (x, z) => [x / 8, z / 8];
    outskirts.flat(-W, W, -W, -E, curb, uvG);
    outskirts.flat(-W, W, E, W, curb, uvG);
    outskirts.flat(-W, -E, -E, E, curb, uvG);
    outskirts.flat(E, W, -E, E, curb, uvG);
    // curb faces at the outer ring
    const curbGeo = new Geo();
    const addCurb = (ax, az, bx, bz, nx, nz) => curbGeo.quad([ax, 0, az], [bx, 0, bz], [bx, curb, bz], [ax, curb, az], [0, 0, 1, 0, 1, 1, 0, 1], [nx, 0, nz], WHITE);
    addCurb(-E, -E, E, -E, 0, 1); addCurb(E, E, -E, E, 0, -1); addCurb(E, -E, E, E, -1, 0); addCurb(-E, E, -E, -E, 1, 0);
    this.addMesh(outskirts.build(), mat(TEX.grass), false, true);

    // roads
    const road = new Geo(), inter = new Geo();
    for (const s of L.segments) {
      const a = L.nodes[s.a], b = L.nodes[s.b];
      if (s.horizontal) {
        const x0 = a.x + RH, x1 = b.x - RH, z = a.z;
        road.quad([x0, 0.005, z + RH], [x1, 0.005, z + RH], [x1, 0.005, z - RH], [x0, 0.005, z - RH],
          [1, x0 / 12, 1, x1 / 12, 0, x1 / 12, 0, x0 / 12], [0, 1, 0], WHITE);
      } else {
        const z0 = a.z + RH, z1 = b.z - RH, x = a.x;
        road.quad([x - RH, 0.005, z1], [x + RH, 0.005, z1], [x + RH, 0.005, z0], [x - RH, 0.005, z0],
          [0, z1 / 12, 1, z1 / 12, 1, z0 / 12, 0, z0 / 12], [0, 1, 0], WHITE);
      }
    }
    for (const n of L.nodes) inter.flat(n.x - RH, n.x + RH, n.z - RH, n.z + RH, 0.004, (x, z) => [x / 10, z / 10]);
    this.addMesh(road.build(), mat(TEX.road), false, true);
    this.addMesh(inter.build(), mat(TEX.asphalt), false, true);

    // sidewalk blocks (raised 0.15 with curb sides)
    const side = new Geo();
    const uvS = (x, z) => [x / 4, z / 4];
    for (const sw of L.sidewalks) {
      const o = sw.outer;
      side.flat(o.x0, o.x1, o.z0, o.z1, curb, uvS);
      side.quad([o.x0, 0, o.z1], [o.x1, 0, o.z1], [o.x1, curb, o.z1], [o.x0, curb, o.z1], [0, 0, 1, 0, 1, 0.04, 0, 0.04], [0, 0, 1], WHITE);
      side.quad([o.x1, 0, o.z0], [o.x0, 0, o.z0], [o.x0, curb, o.z0], [o.x1, curb, o.z0], [0, 0, 1, 0, 1, 0.04, 0, 0.04], [0, 0, -1], WHITE);
      side.quad([o.x1, 0, o.z1], [o.x1, 0, o.z0], [o.x1, curb, o.z0], [o.x1, curb, o.z1], [0, 0, 1, 0, 1, 0.04, 0, 0.04], [1, 0, 0], WHITE);
      side.quad([o.x0, 0, o.z0], [o.x0, 0, o.z1], [o.x0, curb, o.z1], [o.x0, curb, o.z0], [0, 0, 1, 0, 1, 0.04, 0, 0.04], [-1, 0, 0], WHITE);
    }
    this.addMesh(side.build(), mat(TEX.sidewalk), false, true);
    this.addMesh(curbGeo.build(), mat(TEX.sidewalk), false, true);

    // lot grounds by kind
    const kinds = { grass: TEX.grass, plaza: TEX.plaza, concrete: TEX.concrete, asphalt: TEX.asphalt, runway: TEX.runway };
    const geos = {};
    for (const g of L.grounds) {
      const k = g.kind;
      const geo = geos[k] || (geos[k] = new Geo());
      const y = curb + (k === 'runway' || k === 'asphalt' ? 0.012 : 0.006);
      if (k === 'runway') {
        geo.quad([g.x0, y, g.z1], [g.x1, y, g.z1], [g.x1, y, g.z0], [g.x0, y, g.z0],
          [1, g.x0 / 30, 1, g.x1 / 30, 0, g.x1 / 30, 0, g.x0 / 30], [0, 1, 0], WHITE);
      } else geo.flat(g.x0, g.x1, g.z0, g.z1, y, k === 'plaza' ? (x, z) => [x / 4, z / 4] : (x, z) => [x / 8, z / 8]);
    }
    for (const [k, geo] of Object.entries(geos)) this.addMesh(geo.build(), mat(kinds[k]), false, true);

    // decals: crosswalks, parking stalls, paths, ponds
    const cw = new Geo(), stalls = new Geo(), paths = new Geo();
    for (const d of L.decals) {
      if (d.kind === 'crosswalk') {
        if (d.horizontal) cw.quad([d.x - 1.5, 0.012, d.z + RH], [d.x + 1.5, 0.012, d.z + RH], [d.x + 1.5, 0.012, d.z - RH], [d.x - 1.5, 0.012, d.z - RH], [1, 0, 1, 1, 0, 1, 0, 0], [0, 1, 0], WHITE);
        else cw.quad([d.x - RH, 0.012, d.z + 1.5], [d.x + RH, 0.012, d.z + 1.5], [d.x + RH, 0.012, d.z - 1.5], [d.x - RH, 0.012, d.z - 1.5], [0, 0, 1, 0, 1, 1, 0, 1], [0, 1, 0], WHITE);
      } else if (d.kind === 'stall') {
        stalls.flat(d.x - 0.07, d.x + 0.07, d.z - 5.2, d.z + 5.2, curb + 0.02, () => [0.5, 0.5]);
      } else if (d.kind === 'path') {
        paths.flat(d.x0, d.x1, d.z0, d.z1, curb + 0.012, (x, z) => [x / 4, z / 4]);
      } else if (d.kind === 'pond') {
        const water = new THREE.Mesh(new THREE.CircleGeometry(d.r, 28), new THREE.MeshStandardMaterial({ color: 0x3fa7e0, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.92 }));
        water.rotation.x = -Math.PI / 2;
        water.position.set(d.x, curb + 0.05, d.z);
        this.chunkGroup(d.x, d.z).add(water);
        const rim = new THREE.Mesh(new THREE.RingGeometry(d.r, d.r + 1.2, 28), new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.9 }));
        rim.rotation.x = -Math.PI / 2;
        rim.position.set(d.x, curb + 0.07, d.z);
        rim.receiveShadow = true;
        this.chunkGroup(d.x, d.z).add(rim);
      }
    }
    if (!cw.empty()) {
      const m = new THREE.MeshStandardMaterial({ map: TEX.crosswalk, transparent: true, roughness: 0.8, depthWrite: false });
      this.addMesh(cw.build(), m, false, true);
    }
    if (!stalls.empty()) this.addMesh(stalls.build(), new THREE.MeshBasicMaterial({ color: 0xf4f1ea }), false, false);
    if (!paths.empty()) this.addMesh(paths.build(), mat(TEX.plaza), false, true);
  }

  addMesh(geo, material, cast, receive, parent = this.root) {
    const m = new THREE.Mesh(geo, material);
    m.castShadow = cast; m.receiveShadow = receive;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    parent.add(m);
    return m;
  }

  // ---------------------------------------------------------------- signs
  buildSigns() {
    const names = [];
    const pal = ['#e5383b', '#2b7de9', '#ff7a1f', '#27ae60', '#8f4bd6', '#ff70a6', '#14213d', '#0f9d8a', '#e8b923'];
    const r = rng(77);
    for (const b of this.L.buildings) {
      if (b.sign || b.bigSign) {
        b.signIndex = names.length;
        const text = b.signText || b.name;
        names.push({ text, bg: b.type === 'garage' ? '#ff7a1f' : b.type === 'dealership' ? '#2b7de9' : r.pick(pal), fg: '#ffffff' });
      }
    }
    this.L.signs.forEach(s => {
      s.signIndex = names.length;
      names.push({ text: DISTRICTS[s.district].name.toUpperCase(), bg: DISTRICTS[s.district].color, fg: '#ffffff' });
    });
    this.signAtlas = buildSignAtlas(names);
    this.signGeo = new Geo();
  }

  // ---------------------------------------------------------------- procedural buildings
  buildProceduralBuildings() {
    const byChunkStyle = new Map();
    const roofs = new Map();
    const extras = new Map();
    const get = (map, key, color = true) => { let g = map.get(key); if (!g) map.set(key, g = new Geo(color)); return g; };
    const col = new THREE.Color();
    const r = rng(9);
    for (const b of this.L.buildings) {
      if (!b.proc) continue;
      const ck = chunkKey(b.x, b.z);
      const style = b.style || 0;
      const g = get(byChunkStyle, ck + '|' + style);
      const roof = get(roofs, ck);
      const ex = get(extras, ck);
      col.set(b.tint || '#ffffff');
      const y0 = CITY.curb;
      const uo = r.int(0, 3) * 0.25;
      let x0 = b.x - b.sx / 2, x1 = b.x + b.sx / 2, z0 = b.z - b.sz / 2, z1 = b.z + b.sz / 2;
      g.box(x0, x1, y0, y0 + b.h, z0, z1, col, 16, uo, false);
      const roofCol = new THREE.Color(b.type === 'mall' || b.type === 'supermarket' ? '#d8dde3' : '#8c939c');
      roof.flat(x0, x1, z0, z1, y0 + b.h, (x, z) => [x / 8, z / 8], roofCol);
      // parapet
      ex.box(x0 - 0.2, x1 + 0.2, y0 + b.h, y0 + b.h + 0.6, z0 - 0.2, z0 + 0.3, roofCol, 8, 0, true);
      ex.box(x0 - 0.2, x1 + 0.2, y0 + b.h, y0 + b.h + 0.6, z1 - 0.3, z1 + 0.2, roofCol, 8, 0, true);
      ex.box(x0 - 0.2, x0 + 0.3, y0 + b.h, y0 + b.h + 0.6, z0, z1, roofCol, 8, 0, true);
      ex.box(x1 - 0.3, x1 + 0.2, y0 + b.h, y0 + b.h + 0.6, z0, z1, roofCol, 8, 0, true);
      let top = y0 + b.h;
      for (const t of (b.tiers || [])) {
        const hx = t.w / 2, hz = t.d / 2;
        g.box(b.x - hx, b.x + hx, top, top + t.h, b.z - hz, b.z + hz, col, 16, uo, false);
        roof.flat(b.x - hx, b.x + hx, b.z - hz, b.z + hz, top + t.h, (x, z) => [x / 8, z / 8], roofCol);
        top += t.h;
      }
      // rooftop details
      if (b.type === 'tower' || b.type === 'office' || b.type === 'apartment') {
        const ac = new THREE.Color('#b9c0c8');
        for (let k = 0; k < 2; k++) {
          const ax = b.x + r.range(-b.sx * 0.25, b.sx * 0.25), az = b.z + r.range(-b.sz * 0.25, b.sz * 0.25);
          ex.box(ax - 1.4, ax + 1.4, top, top + 1.6, az - 1, az + 1, ac, 4, 0, true);
        }
        if (b.type === 'tower' && b.h > 70) ex.cylinder(b.x, b.z, 0.25, top, top + 12, 6, ac);
        if (b.type === 'apartment') ex.cylinder(b.x + b.sx * 0.3, b.z, 1.8, top, top + 3.5, 10, new THREE.Color('#9c7a5b'));
      }
      // entrances: canopies + glass doors on the front
      const fr = frontFrame(b);
      if (b.type === 'mall' || b.type === 'supermarket' || b.type === 'terminal') {
        const cw = Math.min(b.sx, b.sz) * 0.45;
        const cp = fr.at(0, b.type === 'mall' ? 5.5 : 4.5, 2.5);
        const canopyW = b.type === 'mall' ? 22 : 14;
        boxFacing(ex, cp, fr, canopyW, 0.5, 5, new THREE.Color(b.type === 'mall' ? '#ff7a1f' : b.type === 'terminal' ? '#2b7de9' : '#27ae60'));
        const door = fr.at(0, 1.6, 0.06);
        boxFacing(ex, door, fr, canopyW * 0.6, 3.2, 0.12, new THREE.Color('#3e6d93'));
        if (b.signIndex !== undefined) this.signGeo.billboard(...fr.atArr(0, b.h - 2.6, 0.12), fr.ry, Math.min(cw * 1.8, 26), 3.4, this.signAtlas.uv(b.signIndex), WHITE);
        if (b.type === 'terminal') {
          for (let k = -1; k <= 1; k += 2) boxFacing(ex, fr.at(k * b.sx * 0.3, 2.9, 0.08), fr, 6, 5.6, 0.16, new THREE.Color('#9aa3ad'));
        }
      } else if (b.type === 'tower' || b.type === 'office' || b.type === 'apartment' || b.type === 'factory') {
        const door = fr.at(0, 1.5, 0.06);
        boxFacing(ex, door, fr, b.type === 'factory' ? 6 : 3.2, b.type === 'factory' ? 5 : 2.9, 0.14, new THREE.Color(b.type === 'factory' ? '#9aa3ad' : '#2d3e50'));
        if (b.type !== 'factory') boxFacing(ex, fr.at(0, 3.4, 1.2), fr, 6, 0.3, 2.4, new THREE.Color('#e9e4da'));
      }
      if (b.chimneys) {
        for (const c of b.chimneys) {
          ex.cylinder(c.x, c.z, c.r, CITY.curb, CITY.curb + c.h, 10, new THREE.Color('#a8584a'));
          ex.cylinder(c.x, c.z, c.r * 1.1, CITY.curb + c.h - 2, CITY.curb + c.h, 10, new THREE.Color('#e9e4da'));
        }
      }
    }
    // materials (shared per facade style)
    this.facadeMats = TEX.facade.map((t, i) => {
      const m = new THREE.MeshStandardMaterial({ map: t, vertexColors: true, roughness: 0.75, metalness: i === 0 ? 0.15 : 0,
        emissive: 0xffffff, emissiveMap: TEX.facadeLit[i], emissiveIntensity: 0 });
      this.nightMats.push({ mat: m, max: 0.95 });
      return m;
    });
    const roofMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, map: TEX.concrete });
    const exMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
    for (const [key, g] of byChunkStyle) {
      const [ck, style] = key.split('|');
      const [cx, cz] = ck.split(',').map(Number);
      const grp = this.chunkGroup(-700 + (cx + 0.5) * CHUNK, -700 + (cz + 0.5) * CHUNK);
      this.addMesh(g.build(), this.facadeMats[+style], true, true, grp);
    }
    for (const [ck, g] of roofs) {
      const [cx, cz] = ck.split(',').map(Number);
      this.addMesh(g.build(), roofMat, false, true, this.chunkGroup(-700 + (cx + 0.5) * CHUNK, -700 + (cz + 0.5) * CHUNK));
    }
    for (const [ck, g] of extras) {
      if (g.empty()) continue;
      const [cx, cz] = ck.split(',').map(Number);
      this.addMesh(g.build(), exMat, true, true, this.chunkGroup(-700 + (cx + 0.5) * CHUNK, -700 + (cz + 0.5) * CHUNK));
    }
  }

  // ---------------------------------------------------------------- modular (GLB) buildings
  buildModularBuildings() {
    const byModel = new Map();
    for (const b of this.L.buildings) {
      if (!b.model) continue;
      const k = b.model + '|' + chunkKey(b.x, b.z);
      if (!byModel.has(k)) byModel.set(k, []);
      byModel.get(k).push({ x: b.x, y: CITY.curb, z: b.z, ry: b.ry, tint: b.tint, tint2: b.tint2, b });
      // sign text on the shop / garage / dealership sign board
      if (b.signIndex !== undefined && b.sign) {
        const local = { 'buildings/shop': [0, 4.55, 5.2, 8.4, 1.0], 'buildings/restaurant': [0, 4.55, 5.2, 8.4, 1.0],
          'buildings/garage': [0, 6.0, 8.32, 13.6, 1.25], 'buildings/dealership': [0, 9.2, 9.27, 13.6, 1.25] }[b.model];
        if (local) {
          const [lx, ly, lz, w, h] = local;
          const cs = Math.cos(b.ry), sn = Math.sin(b.ry);
          const wx = b.x + lx * cs + lz * sn, wz = b.z - lx * sn + lz * cs;
          this.signGeo.billboard(wx, CITY.curb + ly, wz, b.ry, w, h, this.signAtlas.uv(b.signIndex), WHITE);
        }
      }
    }
    const fallbackFor = m => () => fallbackParts(m.includes('house') ? 'house' : 'building');
    for (const [k, items] of byModel) {
      const [model] = k.split('|');
      const grp = buildInstanced(model, items, { fallback: fallbackFor(model) });
      this.chunkGroup(items[0].x, items[0].z).add(grp);
    }
    // district gateway signs (two posts + board)
    const posts = new Geo(true);
    for (const s of this.L.signs) {
      const cs = Math.cos(s.ry), sn = Math.sin(s.ry);
      for (const off of [-4.2, 4.2]) {
        const px = s.x + off * cs, pz = s.z - off * sn;
        posts.box(px - 0.18, px + 0.18, CITY.curb, CITY.curb + 5.4, pz - 0.18, pz + 0.18, new THREE.Color('#3b4250'), 4, 0, true);
      }
      this.signGeo.billboard(s.x + sn * 0.05, CITY.curb + 4.4, s.z + cs * 0.05, s.ry, 9, 2.25, this.signAtlas.uv(s.signIndex), WHITE);
      this.signGeo.billboard(s.x - sn * 0.05, CITY.curb + 4.4, s.z - cs * 0.05, s.ry + Math.PI, 9, 2.25, this.signAtlas.uv(s.signIndex), WHITE);
      this.L.colliders.push({ t: 'c', x: s.x + 4.2 * cs, z: s.z - 4.2 * sn, r: 0.25, top: 6 }, { t: 'c', x: s.x - 4.2 * cs, z: s.z + 4.2 * sn, r: 0.25, top: 6 });
    }
    this.addMesh(posts.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.5 }), true, true);
    const signMat = new THREE.MeshStandardMaterial({ map: this.signAtlas.texture, roughness: 0.6, emissive: 0xffffff, emissiveMap: this.signAtlas.texture, emissiveIntensity: 0.15, side: THREE.DoubleSide });
    this.nightMats.push({ mat: signMat, max: 0.9, min: 0.15 });
    this.addMesh(this.signGeo.build(), signMat, false, false);
  }

  // ---------------------------------------------------------------- props
  buildProps() {
    const P = this.L.props;
    const fb = { tree_round: 'tree', tree_pine: 'tree', tree_palm: 'tree', tree_bush: 'tree', streetlight: 'lamp', bench: 'bench' };
    const simple = ['streetlight', 'bench', 'tree_round', 'tree_pine', 'tree_palm', 'tree_bush', 'bin', 'hydrant', 'mailbox', 'crates', 'fence', 'fence_metal', 'cafe_table', 'container', 'signpost', 'cone'];
    const noShadow = new Set(['fence', 'fence_metal', 'bin', 'hydrant', 'mailbox', 'tree_bush', 'crates']);
    const umbrella = ['#e94f4f', '#2b7de9', '#27ae60', '#ffd23f', '#8f4bd6'];
    for (const name of simple) {
      const items = P[name];
      if (!items || !items.length) continue;
      if (name === 'streetlight') items.forEach(i => (i.glowA = 3.2));
      if (name === 'cafe_table') items.forEach((i, k) => (i.tint = umbrella[k % umbrella.length]));
      this.instancedByChunk('props/' + name, items, { fallback: () => fallbackParts(fb[name] || 'default'), castShadow: !noShadow.has(name) });
    }
    // parked cars (per model, paint tinted, lights off)
    const byModel = {};
    for (const p of (P.parked || [])) (byModel[p.model] ||= []).push(p);
    for (const [model, items] of Object.entries(byModel)) {
      items.forEach(i => { if (model === 'taxi') i.tint = '#ffd23f'; i.glowA = 0; i.glowB = 0; });
      this.instancedByChunk('vehicles/car_' + model, items, { fallback: () => [{ geometry: new THREE.BoxGeometry(1.8, 1.4, 4.2).translate(0, 0.7, 0), material: new THREE.MeshStandardMaterial({ color: 0xffffff }), name: 'paint', matName: 'paint' }] });
    }
    // planes
    if (P.planes && P.planes.length) this.root.add(buildInstanced('vehicles/airplane', P.planes, {}));
    this.buildTrafficLights();
    this.buildLightPools();
    this.buildTaxiPlane();
  }

  instancedByChunk(key, items, opts) {
    const byChunk = new Map();
    for (const it of items) {
      const k = chunkKey(it.x, it.z);
      if (!byChunk.has(k)) byChunk.set(k, []);
      byChunk.get(k).push(it);
    }
    for (const list of byChunk.values()) {
      const grp = buildInstanced(key, list, opts);
      grp.userData.prop = true;
      this.chunkGroup(list[0].x, list[0].z).add(grp);
    }
  }

  buildTrafficLights() {
    const items = this.L.props.trafficlights;
    if (!items.length) return;
    // poles: one merged instanced mesh (lamps left out, drawn below)
    const all = assets.parts('props/trafficlight') || [];
    this.root.add(buildInstanced('props/trafficlight', items, { exclude: ['tl_red', 'tl_amber', 'tl_green'] }));
    // lamps: unlit materials with per-instance colour (bright = on, dark = off)
    this.tlLamps = {};
    const lampParts = all.filter(p => p.matName.startsWith('tl_'));
    for (const part of lampParts) {
      const im = new THREE.InstancedMesh(part.geometry, new THREE.MeshBasicMaterial({ color: 0xffffff }), items.length);
      items.forEach((it, i) => { im.setMatrixAt(i, matrixOf(it)); im.setColorAt(i, new THREE.Color(0x222222)); });
      im.computeBoundingSphere();
      this.root.add(im);
      this.tlLamps[part.matName] = im;
    }
    this.tlColors = { tl_red: new THREE.Color('#ff3b30'), tl_amber: new THREE.Color('#ffb300'), tl_green: new THREE.Color('#2ee66b') };
    this.tlOff = new THREE.Color('#2a2a2a');
  }

  // states: array (per traffic light item) of 'red'|'amber'|'green'
  setTrafficLights(stateFn) {
    if (!this.tlLamps || !this.tlLamps.tl_red) return;
    const items = this.L.props.trafficlights;
    for (let i = 0; i < items.length; i++) {
      const st = stateFn(items[i]);
      this.tlLamps.tl_red.setColorAt(i, st === 'red' ? this.tlColors.tl_red : this.tlOff);
      this.tlLamps.tl_amber.setColorAt(i, st === 'amber' ? this.tlColors.tl_amber : this.tlOff);
      this.tlLamps.tl_green.setColorAt(i, st === 'green' ? this.tlColors.tl_green : this.tlOff);
    }
    for (const im of Object.values(this.tlLamps)) im.instanceColor.needsUpdate = true;
  }

  buildLightPools() {
    const lamps = this.L.props.streetlight || [];
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 4, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,220,150,0.9)');
    g.addColorStop(1, 'rgba(255,220,150,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    this.poolMat = new THREE.MeshBasicMaterial({ map: t, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, fog: true });
    const geo = new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2);
    const im = new THREE.InstancedMesh(geo, this.poolMat, lamps.length);
    const m = new THREE.Matrix4();
    lamps.forEach((l, i) => {
      const fx = Math.sin(l.ry), fz = Math.cos(l.ry);
      m.makeTranslation(l.x + fx * 1.5, 0.03, l.z + fz * 1.5);
      im.setMatrixAt(i, m);
    });
    im.computeBoundingSphere();
    im.renderOrder = 2;
    im.visible = false;
    this.pools = im;
    this.root.add(im);
  }

  buildTaxiPlane() {
    const tp = this.L.airport && this.L.airport.taxiPlane;
    if (!tp) return;
    const obj = assets.clone('vehicles/airplane');
    if (!obj) return;
    obj.position.set(tp.x0, CITY.curb, tp.z);
    obj.rotation.y = Math.PI / 2;
    this.taxiPlane = { obj, t: 0, state: 'wait', tp };
    this.root.add(obj);
  }

  updateTaxiPlane(dt) {
    const p = this.taxiPlane;
    if (!p) return;
    p.t += dt;
    const tp = p.tp;
    const o = p.obj;
    if (p.state === 'wait' && p.t > 20) { p.state = 'roll'; p.t = 0; p.v = 0; }
    if (p.state === 'roll') {
      p.v = Math.min(p.v + 4.5 * dt, 75);
      o.position.x += p.v * dt;
      if (o.position.x > tp.x0 + 330) {
        o.position.y += (p.v * 0.22) * dt;
        o.rotation.z = -Math.min(0.18, (o.position.y - CITY.curb) * 0.02);
      }
      if (o.position.x > tp.x1 + 600) {
        p.state = 'wait'; p.t = 0;
        o.position.set(tp.x0, CITY.curb, tp.z);
        o.rotation.z = 0;
      }
    }
  }

  buildPOIs() {
    // job boards (cloned models with emissive screens) and showroom display vehicles
    this.jobBoards = [];
    for (const jb of this.L.pois.jobBoards) {
      const obj = assets.clone('props/jobboard') || fallbackMesh(2.6, 3, 0.6, 0xff8a1f);
      obj.position.set(jb.x, CITY.curb, jb.z);
      obj.rotation.y = jb.ry;
      this.root.add(obj);
      this.jobBoards.push(obj);
    }
  }

  // material post-processing: emissive behaviour by material name
  prepareGlbMaterials() {
    const seen = new Set();
    const visit = root => root.traverse(o => {
      if (!o.isMesh) return;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) {
        if (seen.has(m)) continue;
        seen.add(m);
        applyMaterialRules(m, this.nightMats);
      }
    });
    visit(this.root);
  }

  // ---------------------------------------------------------------- district barriers
  setBarriers(isUnlocked) {
    if (this.barrier) { this.root.remove(this.barrier); this.barrier.geometry.dispose(); this.barrier = null; }
    const g = new Geo();
    const N = CITY.cells, inset = CITY.roadHalf + 0.5, H = 7;
    const locked = (c, r) => { const d = districtAtCell(c, r); return d && !isUnlocked(d); };
    const open = (c, r) => !locked(c, r);
    const wall = (ax, az, bx, bz) => {
      const len = Math.hypot(bx - ax, bz - az);
      const nx = -(bz - az) / len, nz = (bx - ax) / len;
      g.quad([ax, 0, az], [bx, 0, bz], [bx, H, bz], [ax, H, az], [0, 0, len / 6, 0, len / 6, 1, 0, 1], [nx, 0, nz], WHITE);
      g.quad([bx, 0, bz], [ax, 0, az], [ax, H, az], [bx, H, bz], [0, 0, len / 6, 0, len / 6, 1, 0, 1], [-nx, 0, -nz], WHITE);
    };
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      if (!locked(c, r)) continue;
      const x0 = gx(c), x1 = gx(c + 1), z0 = gx(r), z1 = gx(r + 1);
      if (r > 0 && open(c, r - 1)) wall(x0, z0 + inset, x1, z0 + inset);
      if (r < N - 1 && open(c, r + 1)) wall(x0, z1 - inset, x1, z1 - inset);
      if (c > 0 && open(c - 1, r)) wall(x0 + inset, z0, x0 + inset, z1);
      if (c < N - 1 && open(c + 1, r)) wall(x1 - inset, z0, x1 - inset, z1);
    }
    if (g.empty()) return;
    if (!this.barrierMat) {
      this.barrierMat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        uniforms: { time: { value: 0 }, color: { value: new THREE.Color('#ff3d6e') } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `uniform float time; uniform vec3 color; varying vec2 vUv;
          void main(){
            float stripe = step(0.5, fract((vUv.x * 6.0 + vUv.y * 2.0) - time * 0.4));
            float fade = (1.0 - vUv.y) * 0.75 + 0.1;
            float edge = smoothstep(0.92, 1.0, 1.0 - vUv.y) * 0.6;
            gl_FragColor = vec4(color, (0.18 + stripe * 0.22) * fade + edge);
          }`,
      });
    }
    this.barrier = new THREE.Mesh(g.build(), this.barrierMat);
    this.barrier.renderOrder = 3;
    this.root.add(this.barrier);
  }

  // ---------------------------------------------------------------- day / night
  setTime(h) {
    this.time = ((h % 24) + 24) % 24;
    const ang = (this.time - 6) / 24 * Math.PI * 2;
    const elev = Math.sin(ang);
    this.sunElev = elev;
    const day = clamp((elev + 0.08) / 0.35, 0, 1);
    const dusk = clamp(1 - Math.abs(elev) / 0.3, 0, 1);
    this.night = 1 - day;
    const top = new THREE.Color('#070b1a').lerp(new THREE.Color('#3c8ff0'), day);
    const hor = new THREE.Color('#1a2442').lerp(new THREE.Color('#cfe7ff'), day).lerp(new THREE.Color('#ffae73'), dusk * 0.55);
    this.skyMat.uniforms.top.value.copy(top);
    this.skyMat.uniforms.horizon.value.copy(hor);
    this.skyMat.uniforms.stars.value = this.night;
    this.scene.fog.color.copy(hor);
    const sunDir = new THREE.Vector3(Math.cos(ang) * 0.8, Math.max(elev, 0.15 - 0.1 * this.night), 0.35).normalize();
    if (elev < 0) sunDir.set(-Math.cos(ang) * 0.6, 0.6, -0.3).normalize();      // moonlight
    this.sunDir = sunDir;
    this.skyMat.uniforms.sunDir.value.copy(elev > -0.1 ? sunDir : new THREE.Vector3(0, -1, 0));
    this.sun.intensity = lerp(0.22, 2.5, day);
    this.sun.color.set(elev < 0 ? '#9fb7ff' : '#ffffff').lerp(new THREE.Color('#ffb070'), dusk * 0.6 * day);
    this.hemi.intensity = lerp(0.2, 0.95, day);
    this.scene.environmentIntensity = lerp(0.07, 0.45, day);
    this.hemi.color.set('#cfe8ff').lerp(new THREE.Color('#5a6aa0'), this.night);
    for (const nm of this.nightMats) nm.mat.emissiveIntensity = lerp(nm.min || 0, nm.max, this.night);
    worldTintMaterial().userData.uniforms.uGlowScale.value = this.night * 0.85;
    if (this.poolMat) { this.poolMat.opacity = this.night * 0.6; this.pools.visible = this.night > 0.05; }
  }

  update(dt, focus, camera) {
    // time of day
    const mode = this.settings.timeMode || 'cycle';
    if (mode === 'cycle') this.setTime(this.time + dt * 24 / DAY_LENGTH);
    else if (mode === 'day' && Math.abs(this.time - 13) > 0.01) this.setTime(13);
    else if (mode === 'night' && Math.abs(this.time - 23) > 0.01) this.setTime(23);
    // shadows follow the focus point
    const d = this.sunDir || new THREE.Vector3(0.5, 1, 0.3);
    const snap = 4;
    const fx = Math.round(focus.x / snap) * snap, fz = Math.round(focus.z / snap) * snap;
    this.sun.position.set(fx + d.x * 160, d.y * 160, fz + d.z * 160);
    this.sun.target.position.set(fx, 0, fz);
    this.sky.position.copy(camera.position);
    // chunk LOD: props hidden far away
    const viewDist = this.settings.viewDist || 520;
    for (const c of this.chunks.values()) {
      const dd = Math.hypot(c.x - camera.position.x, c.z - camera.position.z);
      c.group.visible = dd < viewDist + CHUNK * 0.75;
      for (const ch of c.group.children) if (ch.userData.prop) ch.visible = dd < viewDist * 0.7 + CHUNK * 0.5;
    }
    if (this.barrierMat) this.barrierMat.uniforms.time.value += dt;
    this.updateTaxiPlane(dt);
  }
}

// ------------------------------------------------------------------ helpers
function matrixOf(it) {
  const m = new THREE.Matrix4();
  m.compose(new THREE.Vector3(it.x, it.y || 0, it.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.ry || 0), new THREE.Vector3(1, 1, 1));
  return m;
}
function fallbackMesh(w, h, d, color) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), new THREE.MeshStandardMaterial({ color }));
  m.castShadow = true;
  return m;
}
// frame for the front of a building: at(along, height, out) -> Vector3
function frontFrame(b) {
  const cs = Math.cos(b.ry), sn = Math.sin(b.ry);
  const half = (b.ry === 0 || Math.abs(b.ry - Math.PI) < 0.01) ? b.sz / 2 : b.sx / 2;
  const fx = sn, fz = cs, rx = cs, rz = -sn;
  return {
    ry: b.ry,
    at(along, y, out) { return new THREE.Vector3(b.x + fx * (half + out) + rx * along, CITY.curb + y, b.z + fz * (half + out) + rz * along); },
    atArr(along, y, out) { const v = this.at(along, y, out); return [v.x, v.y, v.z]; },
    alongX: Math.abs(fz) > 0.5,
  };
}
function boxFacing(geo, p, fr, w, h, d, col) {
  const hw = fr.alongX ? w / 2 : d / 2, hd = fr.alongX ? d / 2 : w / 2;
  geo.box(p.x - hw, p.x + hw, p.y - h / 2, p.y + h / 2, p.z - hd, p.z + hd, col, 4, 0, true);
}

// emissive rules shared by world props and vehicles (by material name)
export function applyMaterialRules(m, nightMats) {
  const n = (m.name || '').toLowerCase();
  if (n === 'window') { m.emissive = new THREE.Color('#ffcf7a'); m.emissiveIntensity = 0; nightMats && nightMats.push({ mat: m, max: 0.75 }); }
  else if (n === 'lamp') { m.emissive = new THREE.Color('#ffe7a0'); m.emissiveIntensity = 0; nightMats && nightMats.push({ mat: m, max: 3.0, min: 0.0 }); }
  else if (n === 'screen') { m.emissive = new THREE.Color('#4fd1ff'); m.emissiveIntensity = 1.3; }
  else if (n === 'beacon') { m.emissive = new THREE.Color('#ff3b30'); m.emissiveIntensity = 2; }
  else if (n === 'taxi_sign') { m.emissive = new THREE.Color('#ffe680'); m.emissiveIntensity = 0.6; }
  else if (n === 'signboard') { m.color = new THREE.Color('#f4f1ea'); }
  else if (n === 'glass') { m.roughness = 0.08; m.metalness = 0.4; }
  else if (n === 'acc_flame') { m.emissive = new THREE.Color('#ff8a1f'); m.emissiveIntensity = 1.6; }
  else if (n === 'acc_gem') { m.emissive = new THREE.Color('#e0245e'); m.emissiveIntensity = 0.5; }
  else if (n === 'chainlink') { m.transparent = true; m.opacity = 0.5; m.depthWrite = false; }
}
