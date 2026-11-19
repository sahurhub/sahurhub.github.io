// UK Simulator - configuration and URL flags.
const q = new URLSearchParams(location.search);
const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);

export const FLAGS = {
  mute: q.has('mute'),            // no sound (always used for tests)
  test: LOCAL && q.has('test'),   // test harness drives the game (this PC only)
  nosave: q.has('nosave'),        // never write the local save
  debug: q.has('debug'),          // physics overlay on from the start
  fps: q.has('fps'),
  quality: q.get('quality'),      // low | medium | high
  vehicle: LOCAL ? q.get('vehicle') : null,  // start in this vehicle (tests)
  at: LOCAL ? q.get('at') : null,            // start at "x,z" (tests)
  hour: q.get('hour'),
  offline: q.has('offline'),
  dev: LOCAL,
};

// Game server (multiplayer, chat, saves). On localhost the game talks to the TEST copy through
// an SSH tunnel; ?server= only works on localhost so a link can never send a chat sign-in elsewhere.
export const SERVER = {
  url: (FLAGS.dev && q.get('server')) || (FLAGS.dev ? 'http://localhost:10006' : 'https://uksim-79-72-86-205.nip.io'),
  chatUrl: FLAGS.dev ? 'http://localhost:10002' : 'https://chat-79-72-86-205.nip.io',
};

export const BASE = new URL('../', import.meta.url).href; // the game folder (client/)
