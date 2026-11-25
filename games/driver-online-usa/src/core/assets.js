// Driver Online USA - loading GLB models, textures and JSON with progress.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const gltfLoader = new GLTFLoader();
gltfLoader.setMeshoptDecoder(MeshoptDecoder);
const texLoader = new THREE.TextureLoader();
const cache = new Map();

/** Fetch with progress: onProgress(loaded, total) */
export async function fetchBytes(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url.split('/').pop()} (${res.status})`);
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body || !onProgress) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const parts = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value); loaded += value.length;
    onProgress(loaded, total);
  }
  const out = new Uint8Array(loaded);
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export async function loadJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url.split('/').pop()} (${res.status})`);
  return res.json();
}

/** Load a GLB (cached by url). Returns the parsed gltf. */
export function loadGLB(url, onProgress) {
  if (cache.has(url)) return cache.get(url);
  const p = (async () => {
    const bytes = await fetchBytes(url, onProgress);
    return new Promise((resolve, reject) => gltfLoader.parse(bytes.buffer, url.slice(0, url.lastIndexOf('/') + 1), resolve, reject));
  })();
  cache.set(url, p);
  p.catch(() => cache.delete(url));
  return p;
}

export function loadTexture(url, { srgb = true, repeat = false } = {}) {
  return new Promise((resolve, reject) => {
    texLoader.load(url, (t) => {
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
      resolve(t);
    }, undefined, () => reject(new Error(`Could not load ${url.split('/').pop()}`)));
  });
}

/** Progress of several downloads at once, reported as 0..1. */
export class Progress {
  constructor(onChange) { this.parts = new Map(); this.onChange = onChange; }
  part(name, weight = 1) {
    this.parts.set(name, { w: weight, f: 0 });
    return (loaded, total) => { const p = this.parts.get(name); p.f = total ? Math.min(1, loaded / total) : Math.min(0.95, p.f + 0.02); this.report(); };
  }
  done(name) { const p = this.parts.get(name); if (p) { p.f = 1; this.report(); } }
  report() {
    let w = 0, f = 0; for (const p of this.parts.values()) { w += p.w; f += p.f * p.w; }
    if (this.onChange) this.onChange(w ? f / w : 0);
  }
}
