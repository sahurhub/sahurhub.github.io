// TURBO TOWN - configuration and URL flags.
const q = new URLSearchParams(location.search);
const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);

export const FLAGS = {
  mute: q.has('mute'),          // no sound (always used for tests)
  fps: q.has('fps'),            // show FPS counter regardless of settings
  quick: q.has('quick'),        // skip intro animations (tests)
  map: q.get('map'),            // jump straight into a race on this map (dev)
  kart: q.get('kart'),
  test: LOCAL && q.has('test'), // test harness drives the game; no auto loop (this PC only)
  dev: LOCAL,
};

// Online server. The game is online-only: everything needs a SahurHub Chat account.
// On localhost the game talks to the test copies through an SSH tunnel. The ?server= flag
// only works on localhost: on the real site a link must never be able to send a player's
// chat sign-in to some other server.
export const SERVER = {
  url: (FLAGS.dev && q.get('server')) || (FLAGS.dev ? 'http://localhost:10004' : 'https://turbotown-79-72-86-205.nip.io'),
  chatUrl: FLAGS.dev ? 'http://localhost:10002' : 'https://chat-79-72-86-205.nip.io',
};

export const PHYSICS_DT = 1 / 60;
