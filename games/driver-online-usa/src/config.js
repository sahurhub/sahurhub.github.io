// Driver Online USA - configuration and URL flags.
const q = new URLSearchParams(location.search);
const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);

export const VERSION = '1.0.0';
export const GAME_NAME = 'Driver Online USA';

export const FLAGS = {
  mute: q.has('mute'),                    // no sound at all (always used for tests)
  test: LOCAL && q.has('test'),           // test harness may drive the game (this PC only)
  fps: q.has('fps'),
  quality: q.get('quality'),              // low | medium | high
  testWorld: LOCAL && q.has('testworld'), // flat physics test world instead of the map
  car: LOCAL ? q.get('car') : null,       // start in this car (tests)
  as: LOCAL ? q.get('as') : null,         // test account name (test server only)
  offline: LOCAL && q.has('offline'),     // drive alone without the server (tests)
  dev: LOCAL,
};

// Game server. On this PC the game talks to the TEST copy through an SSH tunnel
// (ssh -N -L 10010:127.0.0.1:10010 -L 10002:127.0.0.1:10002 ...); ?server= only works on localhost
// so a link can never send a chat sign-in anywhere else.
export const SERVER = {
  url: (FLAGS.dev && q.get('server')) || (FLAGS.dev ? 'http://localhost:10010' : 'https://driveronline-79-72-86-205.nip.io'),
  chatUrl: FLAGS.dev ? 'http://localhost:10002' : 'https://chat-79-72-86-205.nip.io',
};

export const BASE = new URL('../', import.meta.url).href; // the game folder (client/)
export const asset = (p) => BASE + 'assets/' + p;
