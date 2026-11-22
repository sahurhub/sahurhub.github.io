// LAWN MOWING SIMULATOR - start-up: loading screen with progress, then the game.
// Kept tiny so the loading bar moves while the rest downloads.
const fill = document.getElementById('load-fill');
const text = document.getElementById('load-text');
const setP = (f, msg) => { fill.style.width = Math.round(Math.max(3, Math.min(100, f * 100))) + '%'; if (msg) text.textContent = msg; };
const TIPS = ['Tip: mow in straight lines for a better neatness score.', 'Tip: stop at the compost bin to empty the grass catcher.', 'Tip: watch out for gnomes!',
  'Tip: rain makes the grass slippery.', 'Tip: press C to change the camera.', 'Tip: the daily challenge gives bonus money every day.'];

function hasWebGL2() {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch (e) { return false; }
}

async function boot() {
  if (!hasWebGL2()) {
    setP(1, 'Sorry, this browser cannot show 3D (WebGL 2 is missing). Try Chrome, or turn on hardware acceleration.');
    return;
  }
  setP(0.05, 'Starting the engine...');
  const tip = TIPS[Math.floor(Math.random() * TIPS.length)];
  try {
    const [{ App }, { loadAssets }] = await Promise.all([import('./app.js'), import('./render/assets.js')]);
    setP(0.25, 'Loading mowers and gardens...');
    const app = new App(document.getElementById('game'));
    await loadAssets((f) => setP(0.25 + f * 0.6, tip));
    setP(0.9, 'Growing the grass...');
    await new Promise((r) => setTimeout(r, 20));
    await app.start();
    setP(1, 'Ready!');
    const ld = document.getElementById('loading');
    ld.classList.add('done');
    setTimeout(() => ld.remove(), 700);
  } catch (e) {
    console.error(e);
    setP(1, 'Sorry, the game could not start: ' + (e && e.message ? e.message : e) + '. Try reloading the page.');
  }
}

boot();
