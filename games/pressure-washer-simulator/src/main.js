// PRESSURE WASHER SIMULATOR - start-up: loading screen with progress, then the game.
// Kept tiny so the loading bar moves while the rest downloads.
const fill = document.getElementById('load-fill');
const text = document.getElementById('load-text');
const setP = (f, msg) => { fill.style.width = Math.round(Math.max(3, Math.min(100, f * 100))) + '%'; if (msg) text.textContent = msg; };
const TIPS = ['Tip: the wide nozzle covers more, the narrow one cleans faster.', 'Tip: hold Q to see the bits you missed.',
  'Tip: hold E at the tap to refill the tank.', 'Tip: moss, oil and graffiti need detergent or more pressure.',
  'Tip: beat the par time for a speed bonus.', 'Tip: clean every last bit for the No Missed Spots bonus.'];

function hasWebGL2() {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch (e) { return false; }
}

async function boot() {
  if (!hasWebGL2()) {
    setP(1, 'Sorry, this browser cannot show 3D (WebGL 2 is missing). Try Chrome, or turn on hardware acceleration.');
    return;
  }
  setP(0.05, 'Unrolling the hose...');
  const tip = TIPS[Math.floor(Math.random() * TIPS.length)];
  try {
    const { App } = await import('./app.js');
    setP(0.2, tip);
    const app = new App(document.getElementById('game'));
    await app.boot((f) => setP(0.2 + f * 0.75, tip));
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
