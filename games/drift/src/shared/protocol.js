// Drift! - things the game and the server must agree on.
// This folder (src/shared) is copied into the server by tools/deploy-server.ps1, so keep it
// plain JavaScript with no browser-only or Node-only code.

export const PROTOCOL_VERSION = 1;

export const LIMITS = {
  maxPlayers: 20,          // biggest "max players" a room can have
  minPlayers: 2,
  maxRooms: 15,            // rooms on the whole server
  roomName: [3, 24],       // characters
  password: [0, 24],
  chatLength: 150,
  chatBurst: 3,            // messages ...
  chatWindowMs: 5000,      // ... per 5 seconds
  chatRepeatMs: 10000,     // the same message can't be sent twice within 10 s
  chatHistory: 20,         // what new joiners see
  dentsKept: 24,           // dents remembered per car (for people who join later)
  sendHz: 15,              // car states per second (both ways)
};

// Quick chat lines (number keys 1-8 while driving). Sent as normal chat messages.
export const QUICK_CHAT = ['Nice drift!', 'Tandem? Follow me', 'Follow you', 'Wait for me', 'Sorry!', 'Thanks!', 'GG', 'Meet at the petrol station'];

export const WEATHERS = ['sunny', 'cloudy', 'rain', 'storm', 'fog', 'snow', 'dynamic'];
export const WEATHER_NAMES = { sunny: 'Sunny', cloudy: 'Cloudy', rain: 'Rain', storm: 'Storm', fog: 'Fog', snow: 'Snow', dynamic: 'Dynamic' };

// ---- binary messages -------------------------------------------------------
// Everything else is JSON. Car states are binary to keep them small.
export const BIN = { STATE: 1, SNAPSHOT: 2 };

// State flags (byte 1)
export const F = { BRAKE: 1, HANDBRAKE: 2, LIGHTS: 4, IND_L: 8, IND_R: 16, HAZARD: 32, HORN: 64, REVERSE: 128 };
// Flags byte 2
export const F2 = { GHOST: 1, SPECTATING: 2, LOOKBACK: 4 };

export const STATE_BYTES = 36;
const Q = 32767;

// s = { flags, flags2, gear, x, y, z, qx, qy, qz, qw, vx, vy, vz, rpm, steer, throttle, panels, seq }
// panels = one bit per loose body panel (see PANELS), so everyone sees hanging doors and bonnets.
export function writeState(view, o, s) {
  view.setUint8(o + 1, s.flags & 255);
  view.setUint8(o + 2, s.flags2 & 255);
  view.setInt8(o + 3, clampInt(s.gear, -1, 12));
  view.setFloat32(o + 4, s.x, true);
  view.setFloat32(o + 8, s.y, true);
  view.setFloat32(o + 12, s.z, true);
  view.setInt16(o + 16, clampInt(s.qx * Q, -Q, Q), true);
  view.setInt16(o + 18, clampInt(s.qy * Q, -Q, Q), true);
  view.setInt16(o + 20, clampInt(s.qz * Q, -Q, Q), true);
  view.setInt16(o + 22, clampInt(s.qw * Q, -Q, Q), true);
  view.setInt16(o + 24, clampInt(s.vx * 100, -32767, 32767), true);
  view.setInt16(o + 26, clampInt(s.vy * 100, -32767, 32767), true);
  view.setInt16(o + 28, clampInt(s.vz * 100, -32767, 32767), true);
  view.setUint8(o + 30, clampInt(s.rpm / 40, 0, 255));
  view.setInt8(o + 31, clampInt(s.steer * 127, -127, 127));
  view.setUint8(o + 32, clampInt(s.throttle * 255, 0, 255));
  view.setUint8(o + 33, (s.panels || 0) & 255);
  view.setUint16(o + 34, s.seq & 0xffff, true);
}

export function readState(view, o, s = {}) {
  s.flags = view.getUint8(o + 1);
  s.flags2 = view.getUint8(o + 2);
  s.gear = view.getInt8(o + 3);
  s.x = view.getFloat32(o + 4, true);
  s.y = view.getFloat32(o + 8, true);
  s.z = view.getFloat32(o + 12, true);
  s.qx = view.getInt16(o + 16, true) / Q;
  s.qy = view.getInt16(o + 18, true) / Q;
  s.qz = view.getInt16(o + 20, true) / Q;
  s.qw = view.getInt16(o + 22, true) / Q;
  const n = Math.hypot(s.qx, s.qy, s.qz, s.qw) || 1;
  s.qx /= n; s.qy /= n; s.qz /= n; s.qw /= n;
  s.vx = view.getInt16(o + 24, true) / 100;
  s.vy = view.getInt16(o + 26, true) / 100;
  s.vz = view.getInt16(o + 28, true) / 100;
  s.rpm = view.getUint8(o + 30) * 40;
  s.steer = view.getInt8(o + 31) / 127;
  s.throttle = view.getUint8(o + 32) / 255;
  s.panels = view.getUint8(o + 33);
  s.seq = view.getUint16(o + 34, true);
  return s;
}

/** A state message from a client: STATE_BYTES long, byte 0 = BIN.STATE. */
export function encodeState(s) {
  const buf = new ArrayBuffer(STATE_BYTES);
  const view = new DataView(buf);
  view.setUint8(0, BIN.STATE);
  writeState(view, 0, s);
  return buf;
}

/** Checks a state message is sane (finite numbers, inside the world). Returns true if OK. */
export function stateLooksValid(view, o = 0) {
  for (const k of [4, 8, 12]) {
    const v = view.getFloat32(o + k, true);
    if (!Number.isFinite(v) || Math.abs(v) > 5000) return false;
  }
  return true;
}

// Snapshot from the server: [u8 type][u8 count][u32 serverTime ms] then per player
// [u16 pid][STATE_BYTES - 1 bytes of state, i.e. bytes 1..35].
export const SNAP_HEADER = 6;
export const SNAP_ENTRY = 2 + STATE_BYTES - 1;

// Loose body panels: the bit for each part in the state's panels byte.
export const PANELS = ['hood', 'trunk', 'doorFL', 'doorFR', 'doorRL', 'doorRR', 'bumperF', 'bumperR'];

export function clampInt(v, lo, hi) {
  v = Math.round(Number(v) || 0);
  return v < lo ? lo : v > hi ? hi : v;
}

// ---- names -----------------------------------------------------------------
export function cleanRoomName(s) {
  return String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim();
}
export function roomKey(name) {
  return cleanRoomName(name).toLowerCase();
}
export function validCarId(id) {
  return typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,39}$/.test(id);
}
