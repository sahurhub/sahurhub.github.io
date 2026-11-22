// Mower types and upgrades (shared by the game and the server).
// Units: metres, seconds. speed = top speed forward (m/s). width = cutting width (m).
// fuel = seconds of running (0 = needs none). catcher = litres (Infinity = mulching, never fills).
// turn: { pivot: true, yaw } can spin on the spot at `yaw` rad/s; or { radius } like a car.
// deck = how far in front of the mower centre the cutting deck sits (m).
// circles = collision circles along the mower (z forward, r radius).

export const MOWERS = {
  push: {
    name: 'Push Mower', model: 'mower_push', price: 0, width: 0.5, speed: 1.55, reverse: 0.9, accel: 2.6,
    turn: { pivot: true, yaw: 2.3 }, catcher: 45, fuel: 0, grip: 14, deck: 0, rider: 'walk',
    circles: [{ z: 0.02, r: 0.31 }, { z: -1.3, r: 0.3 }], camDist: 4.4, camHeight: 2.3, wheelR: [0.09, 0.09], engine: 'reel',
    upBase: 70, desc: 'Quiet and simple. Small catcher, but it turns on the spot.',
  },
  petrol: {
    name: 'Petrol Mower', model: 'mower_petrol', price: 400, width: 0.56, speed: 1.95, reverse: 1.0, accel: 2.4,
    turn: { pivot: true, yaw: 2.1 }, catcher: 70, fuel: 300, grip: 13, deck: 0, rider: 'walk',
    circles: [{ z: 0.02, r: 0.34 }, { z: -1.35, r: 0.3 }], camDist: 4.6, camHeight: 2.4, wheelR: [0.1, 0.13], engine: 'petrol',
    upBase: 120, desc: 'Self-propelled and a bit faster, with a bigger grass bag.',
  },
  robot: {
    name: 'Robot Mower', model: 'mower_robot', price: 1200, width: 0.36, speed: 1.15, reverse: 0.8, accel: 3,
    turn: { pivot: true, yaw: 2.9 }, catcher: Infinity, fuel: 260, grip: 12, deck: 0.02, rider: 'none',
    circles: [{ z: 0, r: 0.3 }], camDist: 3.2, camHeight: 1.9, wheelR: [0.1, 0.1], engine: 'electric',
    upBase: 180, desc: 'Remote controlled. Mulches the clippings, so it never needs emptying. Small battery.',
  },
  rideon: {
    name: 'Ride-on Mower', model: 'mower_rideon', price: 2500, width: 1.05, speed: 4.3, reverse: 2.0, accel: 2.7,
    turn: { radius: 1.3, yaw: 1.9 }, catcher: 260, fuel: 420, grip: 11, deck: 0.05, rider: 'seat',
    circles: [{ z: 0.55, r: 0.5 }, { z: -0.55, r: 0.52 }], camDist: 6.2, camHeight: 3.2, wheelR: [0.2, 0.3], engine: 'tractor',
    upBase: 380, desc: 'Sit down and stripe big lawns fast. Turns like a car.',
  },
  zeroturn: {
    name: 'Zero-Turn Mower', model: 'mower_zeroturn', price: 9000, width: 1.5, speed: 5.6, reverse: 2.4, accel: 3.3,
    turn: { pivot: true, yaw: 2.2 }, catcher: 380, fuel: 480, grip: 9, deck: 0.3, rider: 'seat',
    circles: [{ z: 0.45, r: 0.72 }, { z: -0.65, r: 0.62 }], camDist: 7.2, camHeight: 3.7, wheelR: [0.13, 0.34], engine: 'big',
    upBase: 800, desc: 'The pro machine: huge deck, spins on the spot, slides on wet grass.', wetSlip: 1.4,
  },
};

export const MOWER_IDS = Object.keys(MOWERS);

export const UPGRADES = {
  speed: { name: 'Speed', per: 0.07, desc: '+7% top speed per level' },
  width: { name: 'Cutting width', per: 0.06, desc: '+6% cutting width per level' },
  fuel: { name: 'Fuel / battery', per: 0.3, desc: '+30% running time per level' },
  catcher: { name: 'Catcher size', per: 0.3, desc: '+30% grass bag per level' },
};
export const UPGRADE_IDS = Object.keys(UPGRADES);
export const MAX_UPGRADE = 5;

export function upgradeCost(mowerId, stat, level) {
  const m = MOWERS[mowerId];
  if (!m || level >= MAX_UPGRADE) return null;
  return Math.round((m.upBase * Math.pow(1.65, level)) / 10) * 10;
}

// Whether an upgrade makes sense for this mower (no fuel tank on the push mower, no catcher on the robot).
export function upgradeApplies(mowerId, stat) {
  const m = MOWERS[mowerId];
  if (stat === 'fuel') return m.fuel > 0;
  if (stat === 'catcher') return Number.isFinite(m.catcher);
  return true;
}

// Final stats of a mower with the player's upgrades { speed, width, fuel, catcher } (levels 0-5).
export function mowerStats(mowerId, up = {}) {
  const m = MOWERS[mowerId] || MOWERS.push;
  const lv = (k) => Math.max(0, Math.min(MAX_UPGRADE, Math.floor(up[k] || 0)));
  const sp = 1 + UPGRADES.speed.per * lv('speed');
  return {
    id: mowerId in MOWERS ? mowerId : 'push',
    width: m.width * (1 + UPGRADES.width.per * lv('width')),
    speed: m.speed * sp,
    reverse: m.reverse * sp,
    accel: m.accel * (1 + 0.04 * lv('speed')),
    fuel: m.fuel ? m.fuel * (1 + UPGRADES.fuel.per * lv('fuel')) : 0,
    catcher: Number.isFinite(m.catcher) ? m.catcher * (1 + UPGRADES.catcher.per * lv('catcher')) : Infinity,
    turn: m.turn,
    grip: m.grip,
    deck: m.deck,
    circles: m.circles,
    wetSlip: m.wetSlip || 1,
    rider: m.rider,
  };
}
