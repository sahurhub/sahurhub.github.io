// UK Simulator - materials: texture arrays (ambientCG, CC0), the ground shader (land types from
// OpenStreetMap + road surfaces from a distance field), the building shader (brick / render /
// cladding textures with procedural windows and shopfronts, lit windows at night), water,
// road markings and foliage.
import * as THREE from 'three';
import { TEXTURES, TEX_SIZE, LAYER } from '../shared/textures.js';

const S = TEX_SIZE;
export const LAMPS = 20;

async function loadPixels(url) {
  const blob = await (await fetch(url)).blob();
  const bm = await createImageBitmap(blob, { colorSpaceConversion: 'none' });
  const cv = new OffscreenCanvas(S, S);
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(bm, 0, 0, S, S);
  return g.getImageData(0, 0, S, S).data;
}

export class Materials {
  async load(base, onProgress) {
    const n = TEXTURES.length;
    const alb = new Uint8Array(S * S * 4 * n), nrm = new Uint8Array(S * S * 4 * n);
    let done = 0;
    await Promise.all(TEXTURES.map(async (t, i) => {
      const [c, nn] = await Promise.all([loadPixels(`${base}textures/${t.key}_c.jpg`), loadPixels(`${base}textures/${t.key}_n.jpg`)]);
      alb.set(c, i * S * S * 4); nrm.set(nn, i * S * S * 4);
      onProgress && onProgress(++done / n);
    }));
    const mk = (data, srgb) => {
      const tex = new THREE.DataArrayTexture(data, S, S, n);
      tex.format = THREE.RGBAFormat; tex.type = THREE.UnsignedByteType;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = true; tex.anisotropy = 4;
      if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      return tex;
    };
    this.alb = mk(alb, true);
    this.nrm = mk(nrm, false);
    this.scales = TEXTURES.map((t) => 1 / t.size);
    while (this.scales.length < 64) this.scales.push(0.5);
    this.noise = makeNoise();
    this.shared = {
      uAlb: { value: this.alb }, uNrm: { value: this.nrm }, uScale: { value: this.scales }, uNoise: { value: this.noise },
      uWet: { value: 0 }, uNight: { value: 0 }, uTime: { value: 0 },
      // the nearest street lamps (x, y, z of the lamp head), for pools of light at night
      uLamps: { value: Array.from({ length: LAMPS }, () => new THREE.Vector3(0, -1000, 0)) },
    };
    this.building = this.makeBuilding();
    this.marks = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.water = this.makeWater();
    this.leaves = makeLeafMaterial(false);
    this.needles = makeLeafMaterial(true);
    this.bark = new THREE.MeshStandardMaterial({ color: 0x5a4a3c, roughness: 0.95 });
  }

  // ---------------------------------------------------------------- ground
  // per chunk: classTex (128 x 128 land types, 2 m), sdfTex (256 x 256 road distance field, 1 m)
  terrain(classTex, sdfTex, x0, z0) {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
    const u = { ...this.shared, uClass: { value: classTex }, uSdf: { value: sdfTex }, uChunk: { value: new THREE.Vector2(x0, z0) }, uLUT: { value: LAND_LUT } };
    m.onBeforeCompile = function (sh) { Object.assign(sh.uniforms, u); terrainShader(sh); };
    m.customProgramCacheKey = () => 'uk-terrain-1';
    m.userData.u = u;
    return m;
  }

  // ---------------------------------------------------------------- buildings and other structures
  makeBuilding() {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, side: THREE.FrontSide });
    const u = this.shared;
    m.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, u); buildingShader(sh); };
    m.customProgramCacheKey = () => 'uk-building-1';
    const roof = m.clone();
    roof.side = THREE.DoubleSide;
    roof.onBeforeCompile = m.onBeforeCompile; roof.customProgramCacheKey = () => 'uk-building-1d';
    return m;
  }

  makeWater() {
    const m = new THREE.MeshStandardMaterial({ color: 0x2c4640, roughness: 0.06, metalness: 0.05, transparent: true, opacity: 0.92 });
    const u = this.shared;
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform sampler2D uNoise;\nuniform float uTime;')
        .replace('#include <normal_fragment_maps>', `
          vec2 q = vWPos.xz;
          vec2 n1 = texture2D(uNoise, q * 0.08 + vec2(uTime * 0.01, uTime * 0.006)).rg - 0.5;
          vec2 n2 = texture2D(uNoise, q * 0.23 - vec2(uTime * 0.017, -uTime * 0.012)).rg - 0.5;
          vec3 wn = normalize(vec3((n1.x + n2.x) * 0.35, 1.0, (n1.y + n2.y) * 0.35));
          normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);`);
    };
    m.customProgramCacheKey = () => 'uk-water-1';
    return m;
  }
}

// land type -> texture layer + tint (see tools/build/features.js LAND)
const L = LAYER;
const LAND_LUT = [
  [L.rough, 0.92, 0.95, 0.85], // 0 rough grass
  [L.lawn, 0.95, 1.0, 0.9],    // 1 lawn / park
  [L.meadow, 1.0, 1.0, 0.95],  // 2 meadow
  [L.meadow, 0.95, 1.05, 0.8], // 3 crops (winter wheat)
  [L.soil, 1.0, 1.0, 1.0],     // 4 ploughed
  [L.forest, 0.95, 0.95, 0.9], // 5 forest floor
  [L.sand, 1.05, 0.98, 0.85],  // 6 sand (Leighton Buzzard sand pits)
  [L.soil, 1.1, 1.05, 0.95],   // 7 dirt
  [L.concrete, 1.0, 1.0, 1.0], // 8 concrete yards
  [L.asphalt2, 0.95, 0.95, 0.95], // 9 car parks
  [L.paving, 1.0, 1.0, 1.0],   // 10 paved
  [L.gravel, 1.0, 1.0, 1.0],   // 11 gravel
  [L.mud, 0.8, 0.8, 0.75],     // 12 river / canal bed
  [L.lawn, 0.9, 1.05, 0.85],   // 13 sports pitch
  [L.lawn, 0.92, 0.98, 0.88],  // 14 cemetery
  [L.lawn, 1.0, 1.0, 0.92],    // 15 gardens
  [L.gravel, 0.75, 0.72, 0.68], // 16 railway ballast
  [L.lawn, 0.9, 1.08, 0.85],   // 17 golf
  [L.rough, 0.85, 0.95, 0.75], // 18 scrub
  [L.soil, 0.95, 1.0, 0.9],    // 19 allotments
].map((a) => new THREE.Vector4(...a));
while (LAND_LUT.length < 32) LAND_LUT.push(new THREE.Vector4(L.rough, 1, 1, 1));

const COMMON_GLSL = `
precision highp sampler2DArray;
uniform sampler2DArray uAlb;
uniform sampler2DArray uNrm;
uniform float uScale[64];
uniform sampler2D uNoise;
uniform float uWet;
uniform float uNight;
uniform float uTime;
varying vec3 vWPos;
varying vec3 vWNormal;
uniform vec3 uLamps[${LAMPS}];
float nz(vec2 p) { return texture2D(uNoise, p).r; }
// warm pools of light under street lamps (night only)
vec3 lampGlow(vec3 p, vec3 n) {
  vec3 sum = vec3(0.0);
  for (int i = 0; i < ${LAMPS}; i++) {
    vec3 d = uLamps[i] - p;
    float r2 = dot(d, d);
    if (r2 > 2500.0) continue;
    float facing = 0.35 + 0.65 * max(0.0, dot(n, normalize(d)));
    sum += vec3(1.0, 0.82, 0.55) * facing * 160.0 / (r2 + 20.0) * smoothstep(2500.0, 700.0, r2);
  }
  return sum;
}
// one texture layer: colour, tangent-space normal, roughness; two scales mixed to hide tiling
void layerSample(float layer, vec2 p, out vec3 col, out vec3 tn, out float rough) {
  float s = uScale[int(layer + 0.5)];
  vec2 uv = p * s;
  vec4 c1 = texture(uAlb, vec3(uv, layer));
  vec4 n1 = texture(uNrm, vec3(uv, layer));
  vec2 uv2 = mat2(0.8, -0.6, 0.6, 0.8) * p * s * 0.31 + 0.37;
  vec4 c2 = texture(uAlb, vec3(uv2, layer));
  float m = smoothstep(0.35, 0.65, nz(p * 0.013));
  col = mix(c1.rgb, c2.rgb, m * 0.5);
  vec2 nxy = n1.rg * 2.0 - 1.0;
  tn = vec3(nxy, sqrt(max(0.0, 1.0 - dot(nxy, nxy))));
  rough = n1.b;
}
`;

function terrainShader(sh) {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNormal;')
    .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNormal = normalize(mat3(modelMatrix) * objectNormal);');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>
${COMMON_GLSL}
uniform sampler2D uClass;
uniform sampler2D uSdf;
uniform vec2 uChunk;
uniform vec4 uLUT[32];
vec3 gCol; vec3 gTn; float gRough; float gWetness;
`)
    .replace('#include <map_fragment>', `
    {
      vec2 wp = vWPos.xz;
      vec2 lc = (wp - uChunk) * 0.5;
      vec2 wob = vec2(nz(wp * 0.031), nz(wp * 0.031 + 0.5)) - 0.5;
      vec2 wob2 = vec2(nz(wp * 0.11 + 0.21), nz(wp * 0.11 + 0.71)) - 0.5;
      ivec2 ci = clamp(ivec2(floor(lc + wob * 1.6 + wob2 * 0.8)), ivec2(0), ivec2(127));
      int cls = int(texelFetch(uClass, ci, 0).r * 255.0 + 0.5);
      vec4 lut = uLUT[cls];
      vec3 col; vec3 tn; float rough;
      layerSample(lut.x, wp, col, tn, rough);
      col *= lut.yzw;
      // gardens: patches of paving and soil; pitches: mowing stripes
      if (cls == 15) {
        float g = nz(wp * 0.07);
        if (g > 0.66) { vec3 c2; vec3 t2; float r2; layerSample(1.0, wp, c2, t2, r2); float k = smoothstep(0.66, 0.7, g); col = mix(col, c2, k); tn = mix(tn, t2, k); rough = mix(rough, r2, k); }
      }
      if (cls == 13 || cls == 17) col *= 0.92 + 0.08 * step(0.5, fract(wp.x * 0.1));
      // large-scale colour variation
      float mv = nz(wp * 0.0021) * 0.6 + nz(wp * 0.009) * 0.4;
      col *= 0.82 + 0.36 * mv;
      // road surfaces from the distance field (metres: positive outside)
      vec4 sd = texture2D(uSdf, (wp - uChunk) / 256.0);
      float aa = 0.04 + length(fwidth(wp)) * 0.6;
      float edgeN = (nz(wp * 0.6) - 0.5) * 0.12;
      float dU = (128.0 - sd.b * 255.0) / 32.0 + edgeN * 2.0;
      float dG = (128.0 - sd.g * 255.0) / 32.0;
      float dR = (128.0 - sd.r * 255.0) / 32.0 + edgeN;
      float wU = 1.0 - smoothstep(-aa - 0.15, aa + 0.15, dU);
      float wG = 1.0 - smoothstep(-aa, aa, dG);
      float wR = 1.0 - smoothstep(-aa, aa, dR);
      if (wU > 0.001) { vec3 c2; vec3 t2; float r2; layerSample(${L.gravel}.0, wp, c2, t2, r2); c2 *= vec3(1.0, 0.95, 0.85); col = mix(col, c2, wU); tn = mix(tn, t2, wU); rough = mix(rough, r2, wU); }
      if (wG > 0.001) { vec3 c2; vec3 t2; float r2; layerSample(${L.asphalt2}.0, wp, c2, t2, r2); c2 *= 1.25; col = mix(col, c2, wG); tn = mix(tn, t2, wG); rough = mix(rough, r2, wG); }
      if (wR > 0.001) {
        vec3 c2; vec3 t2; float r2; layerSample(${L.asphalt}.0, wp, c2, t2, r2);
        c2 *= 0.9 + 0.2 * nz(wp * 0.04);
        // darker worn wheel tracks a little in from the edge
        col = mix(col, c2, wR); tn = mix(tn, t2, wR); rough = mix(rough, r2, wR);
      }
      float hard = max(max(wR, wG), cls == 9 || cls == 10 || cls == 8 ? 1.0 : 0.0);
      gWetness = uWet * mix(0.45, 1.0, hard) * (0.7 + 0.3 * nz(wp * 0.05));
      col *= 1.0 - gWetness * 0.35;
      rough = mix(rough, 0.12, gWetness * hard);
      gCol = col; gTn = tn; gRough = rough;
      diffuseColor.rgb *= gCol;
    }`)
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nif (uNight > 0.01) totalEmissiveRadiance += gCol * lampGlow(vWPos, normalize(vWNormal)) * uNight;')
    .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp(gRough, 0.05, 1.0);')
    .replace('#include <normal_fragment_maps>', `
      {
        vec3 Nw = normalize(vWNormal);
        vec3 T = normalize(vec3(1.0, 0.0, 0.0) - Nw * Nw.x);
        vec3 B = cross(T, Nw);
        vec3 tn = normalize(mix(vec3(0.0, 0.0, 1.0), gTn, 0.8 * (1.0 - gWetness * 0.6)));
        vec3 pw = normalize(T * tn.x - B * tn.y + Nw * tn.z);
        normal = normalize((viewMatrix * vec4(pw, 0.0)).xyz);
      }`);
}

function buildingShader(sh) {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec3 tint;\nattribute float mat;\nattribute vec4 info;\nvarying vec3 vTint;\nvarying float vMat;\nvarying vec4 vInfo;\nvarying vec2 vUv2;\nvarying vec3 vWPos;\nvarying vec3 vWNormal;')
    .replace('#include <uv_vertex>', '#include <uv_vertex>\nvUv2 = uv;\nvTint = tint; vMat = mat; vInfo = info;')
    .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNormal = normalize(mat3(modelMatrix) * objectNormal);');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>
${COMMON_GLSL}
varying vec3 vTint;
varying float vMat;
varying vec4 vInfo;
varying vec2 vUv2;
vec3 gTn; float gRough; vec3 gEmit; float gMetal;
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
`)
    .replace('#include <map_fragment>', `
    {
      float flagsF = floor(vInfo.w);
      int flags = int(flagsF + 0.5);
      float seed = fract(vInfo.w);
      vec3 Nw = normalize(vWNormal);
      vec3 col; vec3 tn; float rough;
      gEmit = vec3(0.0); gMetal = 0.0;
      bool glass = vMat > 62.5;
      if (glass) { col = vec3(0.16, 0.2, 0.22); tn = vec3(0.0, 0.0, 1.0); rough = 0.08; }
      else {
        vec2 uvw = vUv2;
        // brick-coloured layers get a per-building texture offset so neighbours differ
        uvw += vec2(seed * 7.0, seed * 3.0);
        layerSample(vMat, uvw, col, tn, rough);
      }
      col *= vTint;
      // weathering: darker near the ground, grimy streaks on walls
      bool isWall = abs(Nw.y) < 0.5;
      if (isWall) {
        float grime = smoothstep(1.2, 0.0, vUv2.y) * 0.25 + nz(vec2(vUv2.x * 0.3, vUv2.y * 0.05) + seed) * 0.12;
        col *= 1.0 - grime * (0.5 + seed);
      }
      // windows on walls
      bool winWall = isWall && (flags & 1) != 0 && (flags & 512) == 0 && vInfo.x > 1.6 && vInfo.y < 50.0;
      if (winWall || (isWall && (flags & 16) != 0 && vInfo.x > 2.4)) {
        float wallLen = vInfo.x, floorH = vInfo.y, eaveH = vInfo.z;
        float h = vUv2.y;
        bool shop = (flags & 2) != 0;
        bool ind = (flags & 4) != 0;
        bool church = (flags & 8) != 0;
        float floorIdx = floor(h / floorH);
        float fy = fract(h / floorH);
        float spacing = ind ? 6.0 : shop && floorIdx < 0.5 ? 3.2 : 2.4 + seed * 0.9;
        float n = max(1.0, floor((wallLen - 0.6) / spacing));
        float cellW = wallLen / n;
        float cx = vUv2.x / cellW;
        float cell = floor(cx);
        float fx = fract(cx);
        float ww = clamp((ind ? 2.4 : church ? 0.9 : 1.15 + seed * 0.4) / cellW, 0.18, 0.8);
        float x0 = 0.5 - ww * 0.5, x1 = 0.5 + ww * 0.5;
        float y0 = ind ? 0.62 : church ? 0.2 : 0.32, y1 = ind ? 0.82 : church ? 0.9 : 0.84;
        bool ground = floorIdx < 0.5;
        if (shop && ground) { x0 = 0.06; x1 = 0.94; y0 = 0.12; y1 = 0.78; }
        bool garage = (flags & 16) != 0;
        if (garage) { x0 = 0.12; x1 = 0.88; y0 = 0.0; y1 = 0.78; floorIdx = 0.0; }
        bool belowTop = h < eaveH - 0.35 && h > 0.25;
        float lastFloor = floor((eaveH - 0.4) / floorH);
        bool okFloor = floorIdx <= lastFloor - (fy > y1 ? 0.0 : 0.0);
        // front door instead of a window on some ground-floor cells of houses
        bool door = ground && !shop && !ind && !garage && (hash12(vec2(cell, seed * 91.0)) < 0.22);
        if (door) { x0 = 0.32; x1 = 0.68; y0 = 0.0; y1 = 0.78; }
        if (belowTop && okFloor || garage) {
          float fw = 0.06 / cellW, fh = 0.06 / floorH;
          if (fx > x0 && fx < x1 && fy > y0 && fy < y1) {
            bool frame = fx < x0 + fw || fx > x1 - fw || fy < y0 + fh || fy > y1 - fh || (!shop && !ind && abs(fx - 0.5) < fw * 0.5);
            if (garage) { col = vec3(0.78, 0.78, 0.76) * (0.85 + 0.15 * step(0.5, fract(fy * 9.0))); rough = 0.5; tn = vec3(0.0, 0.0, 1.0); }
            else if (door) { col = frame ? vec3(0.9) : mix(vec3(0.15, 0.2, 0.32), vec3(0.45, 0.1, 0.1), step(0.5, seed)); rough = 0.5; tn = vec3(0.0, 0.0, 1.0); }
            else if (frame) { col = vec3(0.92, 0.92, 0.9); rough = 0.5; tn = vec3(0.0, 0.0, 1.0); }
            else {
              float r = hash12(vec2(cell + seed * 37.0, floorIdx + seed * 11.0));
              col = mix(vec3(0.05, 0.06, 0.08), vec3(0.32, 0.36, 0.4), r * 0.35);
              // curtains / blinds variation
              if (r > 0.75 && !shop) col = mix(col, vec3(0.55, 0.5, 0.42), 0.35 * step(0.5, fy));
              rough = 0.06; tn = vec3(0.0, 0.0, 1.0); gMetal = 0.0;
              float lit = step(r, shop && ground ? 0.85 : 0.38) * uNight;
              gEmit = lit * (shop && ground ? vec3(1.0, 0.92, 0.75) * 1.2 : vec3(1.0, 0.78, 0.48) * (0.6 + 0.6 * r));
            }
          }
          // window sill
          else if (!shop && !ind && !garage && !door && fx > x0 - 0.02 && fx < x1 + 0.02 && fy > y0 - 0.05 && fy < y0) { col = vec3(0.85, 0.84, 0.8); rough = 0.6; }
          // shop fascia band above the shop window
          else if (shop && ground && fy > 0.8 && fy < 0.96) { col = mix(vec3(0.12, 0.2, 0.16), vec3(0.15, 0.15, 0.3), seed) ; rough = 0.4; }
        }
      }
      gTn = tn; gRough = rough;
      // wet: darker, shinier
      if (uWet > 0.0) { float w = uWet * (Nw.y > 0.5 ? 1.0 : 0.4); col *= 1.0 - w * 0.25; gRough = mix(gRough, 0.2, w * 0.6); }
      if (uNight > 0.01) gEmit += col * lampGlow(vWPos, Nw) * uNight;
      diffuseColor.rgb *= col;
    }`)
    .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp(gRough, 0.04, 1.0);')
    .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = gMetal;')
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += gEmit;')
    .replace('#include <normal_fragment_maps>', `
      {
        vec3 Nw = normalize(vWNormal);
        vec3 up = abs(Nw.y) > 0.98 ? vec3(0.0, 0.0, -1.0) : vec3(0.0, 1.0, 0.0);
        vec3 T = normalize(cross(Nw, up));
        vec3 B = normalize(cross(T, Nw));
        if (abs(Nw.y) > 0.98) { T = vec3(1.0, 0.0, 0.0); B = vec3(0.0, 0.0, 1.0); }
        vec3 tn = normalize(mix(vec3(0.0, 0.0, 1.0), gTn, 0.85));
        vec3 pw = normalize(T * tn.x + B * tn.y + Nw * tn.z);
        normal = normalize((viewMatrix * vec4(pw, 0.0)).xyz);
      }`);
}

function makeNoise() {
  const n = 256, data = new Uint8Array(n * n * 4);
  // smooth value noise, tileable, two independent channels
  const grid = (sz, seed) => { const g = new Float32Array(sz * sz); let s = seed; for (let i = 0; i < g.length; i++) { s = (s * 1664525 + 1013904223) >>> 0; g[i] = s / 4294967296; } return g; };
  const octaves = [[8, 0.5, 11], [16, 0.25, 23], [32, 0.15, 37], [64, 0.1, 51]];
  const octB = [[8, 0.5, 71], [16, 0.25, 83], [32, 0.15, 97], [64, 0.1, 101]];
  const val = (oct, x, y) => {
    let v = 0;
    for (const [sz, amp, seed] of oct) {
      const g = oct._g?.[seed] || ((oct._g = oct._g || {})[seed] = grid(sz, seed));
      const fx = x / n * sz, fy = y / n * sz, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const a = g[(iy % sz) * sz + (ix % sz)], b = g[(iy % sz) * sz + ((ix + 1) % sz)], c = g[((iy + 1) % sz) * sz + (ix % sz)], d = g[((iy + 1) % sz) * sz + ((ix + 1) % sz)];
      v += amp * ((a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy);
    }
    return v;
  };
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = (y * n + x) * 4;
    data[i] = Math.round(val(octaves, x, y) * 255 / 1.0);
    data[i + 1] = Math.round(val(octB, x, y) * 255 / 1.0);
    data[i + 2] = 128; data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

// leaf cluster texture drawn on a canvas (alpha cut-out)
function makeLeafMaterial(needles) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  let s = needles ? 99 : 7;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let k = 0; k < (needles ? 900 : 520); k++) {
    // denser in the middle of the card
    const ang = rnd() * Math.PI * 2, rad = Math.sqrt(rnd()) * 118;
    const x = 128 + Math.cos(ang) * rad, y = 128 + Math.sin(ang) * rad;
    const l = needles ? 0.16 + rnd() * 0.12 : 0.22 + rnd() * 0.22;
    const hue = needles ? 120 + rnd() * 30 : 75 + rnd() * 45;
    g.fillStyle = `hsl(${hue}, ${needles ? 35 : 40 + rnd() * 20}%, ${l * 100}%)`;
    g.save(); g.translate(x, y); g.rotate(rnd() * Math.PI);
    g.beginPath();
    if (needles) g.ellipse(0, 0, 9 + rnd() * 6, 1.4, 0, 0, Math.PI * 2);
    else g.ellipse(0, 0, 6 + rnd() * 5, 3 + rnd() * 2.5, 0, 0, Math.PI * 2);
    g.fill(); g.restore();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const m = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, metalness: 0, vertexColors: false });
  return m;
}
