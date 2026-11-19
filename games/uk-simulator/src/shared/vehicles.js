// UK Simulator - every vehicle's real-world specs and physics setup.
// Used by the game (physics), the shop and the server (price checks and speed limits).
// Units: metres, kilograms, seconds, newtons, newton-metres, watts, watt-hours, radians.
// Local vehicle axes follow glTF models: z = forward, y = up, x = LEFT (so a right-hand-drive
// driver's seat has negative x). Wheel positions are wheel centres at ride height relative to
// the vehicle origin (ground level under the middle of the wheelbase).
// `real` holds the published figures the physics is tuned against (see docs/VEHICLES.md).

const MPH = 0.44704, KMH = 1 / 3.6;

// tyre presets: grip (peak friction on dry tarmac), how well they cope off-road (0..1)
const TYRE = {
  road: { mu: 1.0, offroad: 0.1, stiffX: 1.0, stiffY: 1.0 },
  sport: { mu: 1.12, offroad: 0.0, stiffX: 1.1, stiffY: 1.15 },
  allTerrain: { mu: 0.95, offroad: 0.65, stiffX: 0.9, stiffY: 0.85 },
  knobbly: { mu: 0.85, offroad: 1.0, stiffX: 0.8, stiffY: 0.75 },
  bicycle: { mu: 0.95, offroad: 0.35, stiffX: 0.9, stiffY: 0.9 },
  scooterRoad: { mu: 0.85, offroad: 0.15, stiffX: 0.9, stiffY: 0.85 },
  scooterOffroad: { mu: 0.9, offroad: 0.6, stiffX: 0.85, stiffY: 0.8 },
};

function car4(o) {
  // four wheels from wheelbase / tracks
  const { wheelbase, trackF, trackR, rF, rR, wF, wR, axleH = null } = o;
  const zF = wheelbase / 2, zR = -wheelbase / 2;
  return [
    { pos: [trackF / 2, axleH ?? rF, zF], r: rF, w: wF, front: true, left: true },
    { pos: [-trackF / 2, axleH ?? rF, zF], r: rF, w: wF, front: true, left: false },
    { pos: [trackR / 2, axleH ?? rR, zR], r: rR, w: wR, front: false, left: true },
    { pos: [-trackR / 2, axleH ?? rR, zR], r: rR, w: wR, front: false, left: false },
  ];
}

export const VEHICLES = {
  // ------------------------------------------------------------------ cars
  hatch: {
    name: 'Ford Fiesta 1.0 EcoBoost', short: 'Small car', kind: 'car', model: 'models/hatch.glb', price: 6500, level: 1,
    real: { year: 2019, power: '100 PS (74 kW) at 6,000 rpm', torque: '170 Nm at 1,400-4,000 rpm', mass: '1,148 kg', top: 183 * KMH, zeroTo60: 10.2, drive: 'FWD, 6-speed manual' },
    dims: { length: 4.04, width: 1.735, height: 1.476 },
    mass: 1148 + 75, com: [0, 0.52, 0.28], inertiaScale: [1.05, 1.1, 1.0],
    wheels: car4({ wheelbase: 2.493, trackF: 1.476, trackR: 1.459, rF: 0.3065, rR: 0.3065, wF: 0.195, wR: 0.195 }),
    susp: { front: { k: 30000, bump: 2600, rebound: 3600, travel: 0.17, rest: 0.13, arb: 14000, rollCentre: 0.08 }, rear: { k: 26000, bump: 2300, rebound: 3200, travel: 0.17, rest: 0.13, arb: 6000, rollCentre: 0.2 } },
    steer: { max: 0.62, speedFalloff: 0.012, rate: 3.0, ackermann: 0.9 },
    tyre: TYRE.road,
    engine: { kind: 'ice', idle: 850, redline: 6500, limiter: 6600, peakPower: 74000, torque: [[800, 95], [1400, 170], [4000, 170], [5000, 150], [6000, 118], [6600, 100]], inertia: 0.14, friction: 0.012, brakeTorque: 28 },
    gearbox: { ratios: [3.727, 2.048, 1.357, 1.032, 0.821, 0.690], reverse: 3.5, final: 4.059, shiftTime: 0.35, auto: true, efficiency: 0.92 },
    drive: { layout: 'FWD', diff: 'open', lock: 0.0 },
    brakes: { torque: 4300, bias: 0.7, handbrake: 1500, abs: true, tc: true },
    aero: { cd: 0.34, area: 2.2, clF: 0.0, clR: 0.0 },
    camera: { dist: 6.0, height: 1.9, fp: [-0.37, 1.16, -0.15] },
    road: true,
  },
  sports: {
    name: 'Porsche 911 Carrera (992)', short: 'Sports car', kind: 'car', model: 'models/sports.glb', price: 48000, level: 8,
    real: { year: 2019, power: '385 PS (283 kW) at 6,500 rpm', torque: '450 Nm at 1,950-5,000 rpm', mass: '1,505 kg', top: 293 * KMH, zeroTo60: 4.0, drive: 'RWD, rear engine, 8-speed PDK' },
    dims: { length: 4.519, width: 1.852, height: 1.300 },
    mass: 1505 + 75, com: [0, 0.46, -0.32], inertiaScale: [1.0, 1.05, 1.0],
    wheels: car4({ wheelbase: 2.450, trackF: 1.589, trackR: 1.557, rF: 0.335, rR: 0.357, wF: 0.235, wR: 0.295 }),
    susp: { front: { k: 42000, bump: 3600, rebound: 5200, travel: 0.13, rest: 0.11, arb: 26000, rollCentre: 0.06 }, rear: { k: 62000, bump: 4800, rebound: 7000, travel: 0.13, rest: 0.11, arb: 18000, rollCentre: 0.14 } },
    steer: { max: 0.58, speedFalloff: 0.010, rate: 3.6, ackermann: 0.8 },
    tyre: TYRE.sport,
    engine: { kind: 'ice', idle: 800, redline: 7400, limiter: 7500, peakPower: 283000, torque: [[800, 250], [1950, 450], [5000, 450], [6500, 415], [7500, 360]], inertia: 0.2, friction: 0.014, brakeTorque: 45 },
    gearbox: { ratios: [3.91, 2.29, 1.58, 1.18, 0.94, 0.79, 0.67, 0.55], reverse: 3.55, final: 3.44, shiftTime: 0.1, auto: true, efficiency: 0.93 },
    drive: { layout: 'RWD', diff: 'lsd', lock: 0.35 },
    brakes: { torque: 7800, bias: 0.62, handbrake: 1800, abs: true, tc: true },
    aero: { cd: 0.36, area: 2.1, clF: 0.04, clR: 0.10 },
    camera: { dist: 6.0, height: 1.7, fp: [-0.37, 0.98, -0.35] },
    road: true,
  },
  truck: {
    name: 'Toyota Hilux 2.8 D-4D', short: 'Off-road truck', kind: 'car', model: 'models/truck.glb', price: 26000, level: 5,
    real: { year: 2020, power: '204 PS (150 kW) at 3,400 rpm', torque: '500 Nm at 1,600-2,800 rpm', mass: '2,140 kg', top: 175 * KMH, zeroTo60: 10.2, drive: '4x4 (selectable), 6-speed automatic, rear diff lock' },
    dims: { length: 5.325, width: 1.855, height: 1.815 },
    mass: 2140 + 75, com: [0, 0.92, 0.25], inertiaScale: [1.1, 1.1, 1.05],
    wheels: car4({ wheelbase: 3.085, trackF: 1.535, trackR: 1.550, rF: 0.388, rR: 0.388, wF: 0.265, wR: 0.265 }),
    susp: { front: { k: 52000, bump: 4400, rebound: 6000, travel: 0.26, rest: 0.22, arb: 15000, rollCentre: 0.25 }, rear: { k: 60000, bump: 4800, rebound: 6500, travel: 0.28, rest: 0.22, arb: 6000, rollCentre: 0.45 } },
    steer: { max: 0.6, speedFalloff: 0.011, rate: 2.6, ackermann: 0.9 },
    tyre: TYRE.allTerrain,
    engine: { kind: 'ice', idle: 750, redline: 3800, limiter: 4000, peakPower: 150000, torque: [[750, 260], [1600, 500], [2800, 500], [3400, 420], [4000, 330]], inertia: 0.35, friction: 0.02, brakeTorque: 70 },
    gearbox: { ratios: [3.6, 2.09, 1.488, 1.0, 0.687, 0.58], reverse: 3.732, final: 3.909, shiftTime: 0.4, auto: true, efficiency: 0.88, low: 2.566 },
    drive: { layout: 'AWD', split: 0.5, centre: 'locked', diff: 'open', rearLock: true, lock: 0.0 },
    brakes: { torque: 7600, bias: 0.66, handbrake: 1800, abs: true, tc: true },
    aero: { cd: 0.55, area: 3.1, clF: 0, clR: 0 },
    camera: { dist: 7.5, height: 2.6, fp: [-0.4, 1.55, -0.1] },
    road: false,
  },
  quad: {
    name: 'Yamaha YFZ450R', short: 'Quad bike', kind: 'car', handlebar: true, model: 'models/quad.glb', price: 7800, level: 3,
    real: { year: 2021, power: 'about 44 hp (33 kW)', torque: 'about 40 Nm', mass: '186 kg', top: 120 * KMH, zeroTo60: 5.0, drive: 'RWD, solid rear axle, 5-speed' },
    dims: { length: 1.73, width: 1.19, height: 1.11 },
    mass: 186 + 75, com: [0, 0.72, -0.05], inertiaScale: [1.1, 1.0, 1.1],
    wheels: car4({ wheelbase: 1.245, trackF: 0.98, trackR: 0.93, rF: 0.27, rR: 0.255, wF: 0.2, wR: 0.25 }),
    susp: { front: { k: 9000, bump: 650, rebound: 900, travel: 0.25, rest: 0.18, arb: 0, rollCentre: 0.18 }, rear: { k: 11000, bump: 750, rebound: 1000, travel: 0.28, rest: 0.18, arb: 0, rollCentre: 0.32, solidAxle: true } },
    steer: { max: 0.62, speedFalloff: 0.008, rate: 4.0, ackermann: 0.6 },
    tyre: TYRE.knobbly,
    engine: { kind: 'ice', idle: 1700, redline: 10500, limiter: 10800, peakPower: 33000, torque: [[1700, 18], [5000, 34], [8000, 40], [9500, 34], [10800, 26]], inertia: 0.03, friction: 0.01, brakeTorque: 8 },
    gearbox: { ratios: [2.385, 1.75, 1.4, 1.136, 0.95], reverse: 2.4, final: 2.13 * 2.733, shiftTime: 0.2, auto: true, efficiency: 0.9 },
    drive: { layout: 'RWD', diff: 'spool', lock: 1.0 },
    brakes: { torque: 1500, bias: 0.6, handbrake: 600, abs: false, tc: false },
    aero: { cd: 0.9, area: 1.0, clF: 0, clR: 0 },
    camera: { dist: 4.6, height: 1.9, fp: [0, 1.45, -0.15] },
    road: false,
  },

  // ------------------------------------------------------------------ two-wheelers
  pushbike: {
    name: 'Hybrid bike', short: 'Pushbike', kind: 'bike', pedal: true, model: 'models/pushbike.glb', price: 0, level: 1,
    real: { year: 2024, power: 'rider: about 180 W steady, 900 W sprint', mass: '11 kg bike + 75 kg rider', top: 40 * KMH, zeroTo60: null, drive: '2 x 10 gears' },
    dims: { length: 1.75, width: 0.62, height: 1.1 },
    mass: 11 + 75, com: [0, 1.0, -0.06], inertiaScale: [1, 1, 1],
    wheelbase: 1.07, wheels: [{ pos: [0, 0.35, 0.535], r: 0.35, w: 0.04, front: true }, { pos: [0, 0.35, -0.535], r: 0.35, w: 0.04, front: false }],
    susp: { front: { k: 60000, bump: 1200, rebound: 1200, travel: 0.02, rest: 0.015 }, rear: { k: 70000, bump: 1400, rebound: 1400, travel: 0.02, rest: 0.015 } },
    steer: { max: 0.75, rate: 5 }, rake: 0.3,
    tyre: TYRE.bicycle,
    rider: { mass: 75, standing: false, sustainW: 180, sprintW: 900, maxForce: 290 },
    brakes: { front: 160, rear: 120, abs: false },
    aero: { cd: 0.9, area: 0.5 },
    balance: { maxLean: 0.85, wobble: null },
    camera: { dist: 3.6, height: 1.9, fp: [0, 1.65, -0.2] },
    road: false, cyclePaths: true,
  },
  ebike: {
    name: 'City e-bike (250 W hub motor)', short: 'E-bike', kind: 'bike', pedal: true, electric: true, model: 'models/ebike.glb', price: 1400, level: 1,
    real: { year: 2024, power: '250 W rated (UK legal), 500 W peak, assist to 15.5 mph', battery: '36 V 14 Ah (504 Wh)', mass: '24 kg bike + 75 kg rider', top: 25 * KMH, range: '60-90 km', drive: 'rear hub motor with regen' },
    dims: { length: 1.85, width: 0.65, height: 1.12 },
    mass: 24 + 75, com: [0, 0.98, -0.06], inertiaScale: [1, 1, 1],
    wheelbase: 1.12, wheels: [{ pos: [0, 0.35, 0.56], r: 0.35, w: 0.055, front: true }, { pos: [0, 0.35, -0.56], r: 0.35, w: 0.055, front: false }],
    susp: { front: { k: 22000, bump: 1400, rebound: 1600, travel: 0.063, rest: 0.03 }, rear: { k: 70000, bump: 1400, rebound: 1400, travel: 0.02, rest: 0.015 } },
    steer: { max: 0.75, rate: 5 }, rake: 0.3,
    tyre: TYRE.bicycle,
    rider: { mass: 75, standing: false, sustainW: 150, sprintW: 800, maxForce: 290 },
    motor: { ratedW: 250, peakW: 500, torque: 45, assist: 2.0, cutoff: 25 * KMH, wheel: 'rear', regen: 0.25, efficiency: 0.8 },
    battery: { wh: 504, volts: 36 },
    brakes: { front: 180, rear: 140, abs: false },
    aero: { cd: 0.9, area: 0.52 },
    balance: { maxLean: 0.8, wobble: null },
    camera: { dist: 3.6, height: 1.9, fp: [0, 1.65, -0.2] },
    road: false, cyclePaths: true,
  },
  kukirinG2: {
    name: 'Kukirin G2', short: 'E-scooter G2', kind: 'escooter', electric: true, model: 'models/kukirin-g2.glb', price: 650, level: 1,
    real: { year: 2025, power: '800 W rear hub motor', battery: '48 V 15 Ah (720 Wh)', mass: '26 kg', top: 45 * KMH, range: 'up to 55 km', tyres: '10 inch tubeless', suspension: 'front and rear spring shocks', brakes: 'front and rear disc' },
    dims: { length: 1.18, width: 0.6, height: 1.24 },
    mass: 26 + 75, com: [0, 0.98, -0.02], inertiaScale: [1, 1, 1],
    wheelbase: 0.96, wheels: [{ pos: [0, 0.127, 0.48], r: 0.127, w: 0.07, front: true }, { pos: [0, 0.127, -0.48], r: 0.127, w: 0.07, front: false }],
    susp: { front: { k: 26000, bump: 900, rebound: 1100, travel: 0.04, rest: 0.025 }, rear: { k: 30000, bump: 1000, rebound: 1200, travel: 0.035, rest: 0.022 } },
    steer: { max: 0.65, rate: 5 }, rake: 0.25,
    tyre: TYRE.scooterRoad,
    rider: { mass: 75, standing: true },
    motor: { ratedW: 800, peakW: 1000, torque: 32, cutoff: 45 * KMH, wheel: 'rear', regen: 0.3, efficiency: 0.82 },
    battery: { wh: 720, volts: 48 },
    brakes: { front: 70, rear: 60, abs: false },
    aero: { cd: 1.0, area: 0.55 },
    balance: { maxLean: 0.65, wobble: { speed: 36 * KMH, gain: 1.0 } },
    camera: { dist: 3.4, height: 2.0, fp: [0, 1.75, -0.05] },
    road: false, cyclePaths: true,
  },
  kukirinG2Master: {
    name: 'Kukirin G2 Master', short: 'E-scooter G2 Master', kind: 'escooter', electric: true, model: 'models/kukirin-g2-master.glb', price: 1150, level: 3,
    real: { year: 2025, power: '2 x 1000 W hub motors (1200 W peak each)', battery: '52 V 20.8 Ah (1081 Wh)', mass: '34 kg', top: 60 * KMH, range: 'up to 70 km', tyres: '10 inch off-road', suspension: 'front and rear hydraulic', brakes: 'front and rear disc' },
    dims: { length: 1.24, width: 0.62, height: 1.26 },
    mass: 34 + 75, com: [0, 0.97, 0], inertiaScale: [1, 1, 1],
    wheelbase: 1.0, wheels: [{ pos: [0, 0.13, 0.5], r: 0.13, w: 0.08, front: true }, { pos: [0, 0.13, -0.5], r: 0.13, w: 0.08, front: false }],
    susp: { front: { k: 24000, bump: 1300, rebound: 1600, travel: 0.06, rest: 0.035 }, rear: { k: 28000, bump: 1400, rebound: 1700, travel: 0.055, rest: 0.032 } },
    steer: { max: 0.65, rate: 5 }, rake: 0.25,
    tyre: TYRE.scooterOffroad,
    rider: { mass: 75, standing: true },
    motor: { ratedW: 2000, peakW: 2400, torque: 2 * 35, cutoff: 60 * KMH, wheel: 'both', regen: 0.3, efficiency: 0.83 },
    battery: { wh: 1081, volts: 52 },
    brakes: { front: 90, rear: 80, abs: false },
    aero: { cd: 1.0, area: 0.52 },
    balance: { maxLean: 0.7, wobble: { speed: 50 * KMH, gain: 0.8 } },
    camera: { dist: 3.4, height: 2.0, fp: [0, 1.75, -0.05] },
    road: false, cyclePaths: true,
  },
  kukirinG4: {
    name: 'Kukirin G4', short: 'E-scooter G4', kind: 'escooter', electric: true, model: 'models/kukirin-g4.glb', price: 1300, level: 4,
    real: { year: 2025, power: '2000 W rear hub motor (2400 W peak)', battery: '60 V 20 Ah (1200 Wh)', mass: '37 kg', top: 70 * KMH, range: 'up to 75 km', tyres: '11 inch off-road tubeless', suspension: 'front and rear (four-link) shocks', brakes: 'front and rear hydraulic disc' },
    dims: { length: 1.3, width: 0.64, height: 1.3 },
    mass: 37 + 75, com: [0, 0.98, -0.02], inertiaScale: [1, 1, 1],
    wheelbase: 1.06, wheels: [{ pos: [0, 0.14, 0.53], r: 0.14, w: 0.09, front: true }, { pos: [0, 0.14, -0.53], r: 0.14, w: 0.09, front: false }],
    susp: { front: { k: 26000, bump: 1400, rebound: 1800, travel: 0.07, rest: 0.04 }, rear: { k: 30000, bump: 1500, rebound: 1900, travel: 0.065, rest: 0.038 } },
    steer: { max: 0.62, rate: 5 }, rake: 0.25,
    tyre: TYRE.scooterOffroad,
    rider: { mass: 75, standing: true },
    motor: { ratedW: 2000, peakW: 2400, torque: 75, cutoff: 70 * KMH, wheel: 'rear', regen: 0.3, efficiency: 0.84 },
    battery: { wh: 1200, volts: 60 },
    brakes: { front: 120, rear: 100, abs: false },
    aero: { cd: 1.0, area: 0.5 },
    balance: { maxLean: 0.72, wobble: { speed: 58 * KMH, gain: 0.7 } },
    camera: { dist: 3.5, height: 2.0, fp: [0, 1.78, -0.05] },
    road: false, cyclePaths: true,
  },
  scooter: {
    name: 'Honda PCX125', short: 'Scooter', kind: 'bike', model: 'models/scooter.glb', price: 3400, level: 2,
    real: { year: 2021, power: '12.3 PS (9.0 kW) at 8,750 rpm', torque: '11.8 Nm at 6,500 rpm', mass: '130 kg', top: 105 * KMH, zeroTo60: null, drive: 'CVT automatic' },
    dims: { length: 1.935, width: 0.74, height: 1.105 },
    mass: 130 + 75, com: [0, 0.68, -0.08], inertiaScale: [1, 1, 1],
    wheelbase: 1.313, wheels: [{ pos: [0, 0.29, 0.6565], r: 0.29, w: 0.11, front: true }, { pos: [0, 0.27, -0.6565], r: 0.27, w: 0.13, front: false }],
    susp: { front: { k: 18000, bump: 1300, rebound: 1600, travel: 0.1, rest: 0.05 }, rear: { k: 26000, bump: 1700, rebound: 2100, travel: 0.085, rest: 0.045 } },
    steer: { max: 0.6, rate: 4 }, rake: 0.47,
    tyre: TYRE.scooterRoad,
    rider: { mass: 75, standing: false },
    engine: { kind: 'cvt', idle: 1700, redline: 9500, limiter: 9800, peakPower: 9000, torque: [[1700, 6], [4000, 10], [6500, 11.8], [8750, 9.8], [9800, 8]], inertia: 0.02, cvtLow: 2.6 * 10.0, cvtHigh: 0.82 * 10.0, clutchIn: 3200, efficiency: 0.85 },
    brakes: { front: 300, rear: 220, abs: true },
    aero: { cd: 0.75, area: 0.62 },
    balance: { maxLean: 0.85, wobble: null },
    camera: { dist: 4.0, height: 1.9, fp: [0, 1.5, -0.25] },
    road: true,
  },
  dirtbike: {
    name: 'Honda CRF450R', short: 'Dirt bike', kind: 'bike', model: 'models/dirtbike.glb', price: 9500, level: 6,
    real: { year: 2023, power: 'about 55 hp (41 kW) at 9,500 rpm', torque: 'about 48 Nm at 7,500 rpm', mass: '111 kg', top: 140 * KMH, zeroTo60: 3.6, drive: '5-speed manual, chain', suspension: '310 mm front, 318 mm rear travel' },
    dims: { length: 2.18, width: 0.83, height: 1.27 },
    mass: 111 + 75, com: [0, 0.92, 0.0], inertiaScale: [1, 1, 1],
    wheelbase: 1.482, wheels: [{ pos: [0, 0.345, 0.741], r: 0.345, w: 0.08, front: true }, { pos: [0, 0.33, -0.741], r: 0.33, w: 0.11, front: false }],
    susp: { front: { k: 9500, bump: 900, rebound: 1200, travel: 0.31, rest: 0.1 }, rear: { k: 13000, bump: 1200, rebound: 1500, travel: 0.318, rest: 0.11 } },
    steer: { max: 0.6, rate: 4.5 }, rake: 0.47,
    tyre: TYRE.knobbly,
    rider: { mass: 75, standing: false },
    engine: { kind: 'ice', idle: 1800, redline: 11000, limiter: 11300, peakPower: 41000, torque: [[1800, 22], [5000, 40], [7500, 48], [9500, 42], [11300, 32]], inertia: 0.025, friction: 0.012, brakeTorque: 9 },
    gearbox: { ratios: [2.2, 1.75, 1.4, 1.15, 0.96], reverse: 0, final: 10.4, shiftTime: 0.12, auto: true, efficiency: 0.9 },
    brakes: { front: 420, rear: 260, abs: false },
    aero: { cd: 0.75, area: 0.62 },
    balance: { maxLean: 0.95, wobble: null },
    camera: { dist: 4.0, height: 2.0, fp: [0, 1.62, -0.2] },
    road: false,
  },
};

export const VEHICLE_ORDER = ['pushbike', 'ebike', 'kukirinG2', 'kukirinG2Master', 'kukirinG4', 'scooter', 'dirtbike', 'quad', 'hatch', 'sports', 'truck'];
export const STARTER_VEHICLES = ['pushbike', 'kukirinG2'];

// the fastest a vehicle can possibly go (with every upgrade), used by the server's speed checks
export function maxLegitSpeed(id, upgrades = {}) {
  const v = VEHICLES[id];
  if (!v) return 0;
  const lvl = upgrades.speed || 0;
  return v.real.top * (1 + 0.05 * lvl) * 1.18 + 4; // + downhill / slipstream margin
}

export { MPH, KMH };
