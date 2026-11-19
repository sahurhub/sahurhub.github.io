// UK Simulator - start-up: renderer, data, physics, textures, town, then the game loop.
import * as THREE from 'three';
import { FLAGS, BASE } from './config.js';
import { Physics } from './physics/physics.js';
import { Materials } from './world/materials.js';
import { World } from './world/world.js';
import { Weather, makeFar } from './world/sky.js';
import { loadModelConfig } from './vehicles/models.js';
import { loadGraph } from './shared/route.js';
import { Game } from './game/game.js';

const $ = (id) => document.getElementById(id);
const progress = (frac, text) => { $('load-fill').style.width = Math.round(frac * 100) + '%'; if (text) $('load-text').textContent = text; };

async function gz(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Could not load ' + url);
  return new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).json();
}

function pickQuality() {
  if (FLAGS.quality) return FLAGS.quality;
  try { const s = JSON.parse(localStorage.getItem('uksim.settings') || '{}'); if (s.quality) return s.quality; } catch (e) { /* */ }
  const mobile = matchMedia('(pointer: coarse)').matches;
  return mobile || (navigator.hardwareConcurrency || 4) <= 4 ? 'low' : 'medium';
}

async function boot() {
  const cv = document.createElement('canvas');
  if (!cv.getContext('webgl2')) { progress(0, 'Sorry - this opsec needs WebGL 2 (try an up-to-date Chrome, Edge, Firefox or Safari).'); return; }
  if (!('DecompressionStream' in window)) { progress(0, 'Sorry - this browser is too old for UK Simulator. Please update it.'); return; }
  const quality = pickQuality();
  const renderer = new THREE.WebGLRenderer({ antialias: quality !== 'low', powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, quality === 'high' ? 2 : quality === 'low' ? 1 : 1.25));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = quality === 'low' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  $('view').appendChild(renderer.domElement);
  if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 5000);
  addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

  progress(0.03, 'Reading the town map...');
  const [manifest, missions, graphJson] = await Promise.all([
    fetch(BASE + 'data/manifest.json').then((r) => r.json()),
    fetch(BASE + 'data/missions.json').then((r) => r.json()),
    gz(BASE + 'data/graph.json.gz'),
  ]);
  const graph = loadGraph(graphJson);
  progress(0.1, 'Starting the physics engine...');
  const physics = new Physics();
  await physics.init();
  progress(0.16, 'Loading brick, render, roof and road textures...');
  const materials = new Materials();
  await materials.load(BASE, (f) => progress(0.16 + f * 0.24));
  progress(0.42, 'Setting up the sky...');
  const weather = new Weather(renderer, scene, quality);
  const far = await makeFar(BASE, manifest);
  scene.add(far.mesh);
  await loadModelConfig(BASE);
  const world = new World({ scene, physics, materials, manifest, base: BASE, quality });
  world.farHeight = far.heightAt;
  weather.farLimit = world.loadRadius + 150;
  const game = new Game({ renderer, scene, camera, physics, materials, world, weather, manifest, missions, graph, base: BASE, quality });
  const spawn = await game.init();
  progress(0.46, 'Building Leighton Buzzard...');
  await world.preload(spawn.x, spawn.z, quality === 'low' ? 380 : 520, (f) => progress(0.46 + f * 0.5, `Building Leighton Buzzard... ${Math.round(f * 100)}%`));
  progress(0.97, 'Getting the keys...');
  await game.start();
  // compile shaders before the first frame so the start does not stutter
  renderer.compile(scene, camera);
  progress(1, 'Ready');
  $('loading').hidden = true;
  $('hud').hidden = false;
  window.UKSIM = game; // handy for testing in the console
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    game.frame(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  };
  if (!FLAGS.test) requestAnimationFrame(loop);
  else window.UKSIM_LOOP = loop;
}

boot().catch((e) => { console.error(e); progress(0, 'Something went wrong while loading: ' + e.message); });
