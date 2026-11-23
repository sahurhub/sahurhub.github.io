// PRESSURE WASHER SIMULATOR - configuration and URL flags.
const q = new URLSearchParams(location.search);
const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);

export const FLAGS = {
  mute: q.has('mute'),            // no sound (always used for tests)
  fps: q.has('fps'),              // show the FPS counter from the start
  test: LOCAL && q.has('test'),   // tools/test.js drives the frames and fakes pointer lock (this PC only)
  nosave: q.has('nosave'),        // save kept in memory only (tests)
  fresh: q.has('fresh'),          // ignore the saved game (tests)
  quality: q.get('q'),            // force low | medium | high
  job: LOCAL ? q.get('job') : null,
  rich: LOCAL && q.has('rich'),   // test money
  dev: LOCAL,
};

export const VERSION = '1.0.0';
export const SAVE_KEY = 'pws.save.v1';
export const SETTINGS_KEY = 'pws.settings.v1';
