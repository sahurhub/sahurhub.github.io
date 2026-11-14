// Boot: load fonts, textures and models (with progress), build the city, load the save,
// show the title screen, then start the game.
import { Game } from './game.js';
import { assets } from './assets.js';
import { buildTextures } from './textures.js';
import { UI, TIPS } from './ui.js';

const fill = document.getElementById('loading-fill');
const what = document.getElementById('loading-what');
const tip = document.getElementById('loading-tip');
const setProgress = (f, text) => { fill.style.width = Math.round(f * 100) + '%'; if (text) what.textContent = text; };
tip.textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
// yield to the browser so the loading bar can paint (setTimeout fallback: rAF is paused in hidden tabs)
const nextFrame = () => new Promise(r => { let done = false; const f = () => { if (!done) { done = true; r(); } }; requestAnimationFrame(f); setTimeout(f, 60); });

async function boot() {
  const game = new Game(document.getElementById('game'));
  window.__game = game;               // handy for testing from the console
  game.initRenderer();
  await game.loadSettings();
  setProgress(0.03, 'Loading fonts');
  try { await Promise.race([document.fonts.load('700 32px "Fredoka"'), new Promise(r => setTimeout(r, 2500))]); } catch (e) { /* fallback font */ }
  setProgress(0.06, 'Drawing textures');
  buildTextures();
  await nextFrame();
  const failed = await assets.loadAll((f, path) => setProgress(0.06 + f * 0.64, 'Loading models: ' + path.split('/').pop()));
  if (failed.length) console.warn('[boot] using fallbacks for', failed.length, 'model(s):', failed.join(', '));
  setProgress(0.72, 'Building the city');
  await nextFrame();
  game.buildWorld(step => setProgress(0.75, step));
  setProgress(0.9, 'Loading your save');
  await game.loadProfile();
  game.startSystems();
  game.ui = new UI(game);
  game.ui.init();
  setProgress(1, 'Ready!');
  await nextFrame();
  document.getElementById('loading').classList.add('hidden');
  game.runTitle();
  game.ui.showTitle(() => {
    document.getElementById('hud').classList.remove('hidden');
    game.start();
    game.cam.first = true;
    if (game.progress.canClaimLogin()) {
      setTimeout(() => game.ui.toast(`Daily reward ready: ${'$' + game.progress.loginReward().toLocaleString('en-US')}. Open Missions > Daily to claim it.`, 'gold', 'Welcome back'), 1500);
    }
  });
}

boot().catch(err => {
  console.error(err);
  what.textContent = 'Something went wrong while loading. Please reload the page.';
  tip.textContent = String(err && err.message ? err.message : err);
});
