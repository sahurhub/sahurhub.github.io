// One shared, configured glTF loader for cars and circuits.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const THREE_VER = '0.170.0';
let loader = null;

export function getGltfLoader() {
  if (loader) return loader;
  const draco = new DRACOLoader();
  draco.setDecoderPath(`https://cdn.jsdelivr.net/npm/three@${THREE_VER}/examples/jsm/libs/draco/gltf/`);
  loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  // Tolerate a texture slot whose image is missing from the file (use the plain colour instead).
  loader.register((parser) => ({
    name: 'SKIP_EMPTY_TEXTURES',
    loadTexture(i) {
      const d = parser.json.textures[i];
      const hasWebp = d.extensions && d.extensions.EXT_texture_webp;
      return d.source === undefined && !hasWebp ? Promise.resolve(null) : null;
    },
  }));
  return loader;
}

export function loadGltf(url, onProgress) {
  return new Promise((res, rej) => getGltfLoader().load(url, res, onProgress, rej));
}
