// LAWN MOWING SIMULATOR - configuration and URL flags.
const q = new URLSearchParams(location.search);
const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);

export const FLAGS = {
  mute: q.has('mute'),            // no sound (always used for tests)
  fps: q.has('fps'),              // show the FPS counter
  test: LOCAL && q.has('test'),   // test harness drives the frames (this PC only)
  nosave: q.has('nosave'),        // guest save kept in memory only (tests)
  fresh: q.has('fresh'),          // start with a new guest save (tests)
  quality: q.get('q'),            // force low | medium | high
  level: LOCAL ? q.get('level') : null,
  dev: LOCAL,
};
// No game server: the game is offline only and saves in this browser (user's choice 2026-11-22).

export const PHYS_DT = 1 / 60;
export const VERSION = '1.0.0';
