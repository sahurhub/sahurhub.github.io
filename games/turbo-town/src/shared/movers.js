// TURBO TOWN - moving obstacles. Position is a pure function of the race clock, so every
// player (and the server) sees the same thing at the same moment.
// kinds:
//   slide  { s, lat0, lat1, period, phase }        goes back and forth across the road
//   roll   { from, to, lat, period, phase }        rolls along the road (against traffic
//                                                  when from > to), then starts again
//   swing  { s, amp, period, phase }               swings side to side like a pendulum
//   orbit  { s, lat, radius, period, phase }       circles around a point
import { pointAt } from './track-math.js';

export function moverPos(m, t, track, out = {}) {
  const path = m.path ? track.paths.find((p) => p.id === m.path) : track.main;
  const ph = (t / m.period + (m.phase || 0)) % 1;
  let s, lat;
  switch (m.kind) {
    case 'slide': {
      const u = 0.5 - 0.5 * Math.cos(ph * Math.PI * 2);
      s = m.s; lat = m.lat0 + (m.lat1 - m.lat0) * u;
      break;
    }
    case 'roll': {
      let len = m.to - m.from;
      if (path.closed && Math.abs(len) > track.length / 2) len -= Math.sign(len) * track.length;
      s = m.from + len * ph; lat = m.lat || 0;
      break;
    }
    case 'swing': {
      s = m.s; lat = Math.sin(ph * Math.PI * 2) * m.amp;
      break;
    }
    default: { // orbit
      const p0 = pointAt(path, m.s);
      const a = ph * Math.PI * 2;
      out.x = p0.x + p0.rx * (m.lat || 0) + Math.cos(a) * m.radius;
      out.z = p0.z + p0.rz * (m.lat || 0) + Math.sin(a) * m.radius;
      out.y = p0.y; out.heading = a; out.ph = ph;
      return out;
    }
  }
  const p = pointAt(path, s);
  out.x = p.x + p.rx * lat; out.z = p.z + p.rz * lat; out.y = p.y; out.heading = p.heading; out.ph = ph;
  return out;
}
