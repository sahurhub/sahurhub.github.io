// TURBO TOWN - entry point.
// The game is online-only: you sign in with your SahurHub Chat account and everything is
// saved on the Turbo Town server. On this PC (localhost) the game starts in a test mode
// with a stand-in profile unless ?online is added (then it uses the test server).
import { Game } from './game.js';
import { App } from './app.js';
import { UI, setSfx } from './ui/ui.js';
import { loadSettings } from './save/settings.js';
import { assets } from './render/assets.js';
import { DevProfile, ServerProfile } from './progression/profile.js';
import { Net, chatSession } from './net/net.js';
import { Online } from './net/online.js';
import { SignIn } from './ui/screens/online.js';
import { setResultSfx } from './ui/screens/race.js';
import { FLAGS } from './config.js';

const settings = loadSettings();
const fill = document.getElementById('loading-fill');
const what = document.getElementById('loading-what');
const params = new URLSearchParams(location.search);
const testMode = FLAGS.dev && !params.has('online');

async function boot() {
  what.textContent = 'Polishing the karts';
  await assets.loadAll(['karts.glb', 'skins.glb', 'common.glb', 'items.glb'], (f) => { fill.style.width = (f * 80).toFixed(0) + '%'; });
  const game = new Game({ container: document.getElementById('game'), hudRoot: document.getElementById('hud'), settings, assets });
  const ui = new UI(document.getElementById('ui'));
  const app = new App({ game, ui, profile: null, assets });
  window.TT = { game, app, ui, FLAGS, assets };
  game.onFrame = (dt) => app.tick(dt);
  setSfx((name) => game.sfx.play(name));
  setResultSfx((name) => game.sfx.play(name));
  fill.style.width = '100%';
  if (testMode) {
    app.profile = new DevProfile();
    if (FLAGS.map) await app.startRace({ mode: 'single', map: FLAGS.map, kart: FLAGS.kart || undefined, aiCount: Number(params.get('ai') ?? 7), difficulty: 'normal' });
    else app.menu();
  } else {
    await onlineBoot(app, game, ui);
  }
  document.getElementById('loading').classList.add('hidden');
  if (!FLAGS.test) game.start();
}

async function onlineBoot(app, game, ui) {
  const net = new Net();
  app.net = net;
  game.setView('showroom');
  game.showroom.showParade([{ kart: 'starter' }, { kart: 'drifter', cosmetics: { skin: 'skin_mp425' } }, { kart: 'rocket' }, { kart: 'breeze', cosmetics: { skin: 'skin_mp425_sponsor' } }]);
  const go = async () => {
    const session = chatSession();
    if (!session) { ui.show(SignIn, { onSignedIn: go }, { replace: true }); return; }
    try {
      what.textContent = 'Connecting to Turbo Town';
      const welcome = await net.connect(session);
      app.profile = new ServerProfile(net, welcome.profile, welcome.admin);
      if (!app.online) app.online = new Online(app, net);
      app.menu();
    } catch (e) {
      ui.show(SignIn, { onSignedIn: go, message: e.message }, { replace: true });
    }
  };
  net.on('status', (m) => {
    if (m.status === 'signedout' && app.profile) { app.profile = null; ui.show(SignIn, { onSignedIn: go, message: m.detail || 'Please sign in again.' }, { replace: true }); }
  });
  await go();
}

boot().catch((e) => {
  console.error(e);
  what.textContent = 'Something went wrong: ' + e.message;
});
