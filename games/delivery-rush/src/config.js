// DELIVERY RUSH - game data tables. Pure data, no three.js, so a server could share it.

export const GAME_VERSION = '1.0.0';
export const SAVE_VERSION = 1;

// ------------------------------------------------------------------ city
export const CITY = {
  cells: 10,          // 10 x 10 blocks
  cell: 100,          // metres between road centre lines
  origin: -500,       // world coordinate of the first road line
  roadHalf: 7,        // road half width (one lane each way + parking strip)
  laneOffset: 3.4,    // lane centre from road centre
  sidewalk: 4,
  curb: 0.15,         // sidewalk / lot height above the road
  worldHalf: 620,     // hard edge of the playable world
};

// district letter map, row 0 = north (negative z), col 0 = west (negative x)
export const DISTRICT_MAP = [
  'SSSSAAAAAA',
  'SSSSAAAAAA',
  'SSSSAAAAAA',
  'SSDDDDDIII',
  'SSDDDDDIII',
  'SSDDDDDIII',
  'SSDDDDDIII',
  'MMMMMMIIII',
  'MMMMMMIIII',
  'MMMMMMIIII',
];

export const DISTRICTS = {
  downtown:   { id: 'downtown',   letter: 'D', name: 'Downtown',   color: '#ff8a3d', mult: 1.0,  level: 1,  cost: 0,
                desc: 'Towers, offices, shops and restaurants. Your HQ is here.' },
  suburbs:    { id: 'suburbs',    letter: 'S', name: 'Suburbs',    color: '#59c26b', mult: 1.15, level: 2,  cost: 600,
                desc: 'Quiet streets of houses and gardens. Lots of home deliveries.' },
  shopping:   { id: 'shopping',   letter: 'M', name: 'Shopping',   color: '#d45cff', mult: 1.4,  level: 5,  cost: 5000,
                desc: 'Malls and supermarkets with bulk orders.' },
  industrial: { id: 'industrial', letter: 'I', name: 'Industrial', color: '#ffc93c', mult: 1.9,  level: 9,  cost: 25000,
                desc: 'Warehouses, factories and depots. Heavy cargo pays well.' },
  airport:    { id: 'airport',    letter: 'A', name: 'Airport',    color: '#4cc9f0', mult: 2.8,  level: 14, cost: 90000,
                desc: 'Cargo terminals with high value air freight.' },
};
export const DISTRICT_BY_LETTER = Object.fromEntries(Object.values(DISTRICTS).map(d => [d.letter, d.id]));
export const DISTRICT_ORDER = ['downtown', 'suburbs', 'shopping', 'industrial', 'airport'];

// ------------------------------------------------------------------ vehicles
// speeds in m/s, accel in m/s^2, brake in m/s^2. handling scales steering and grip.
export const VEHICLES = [
  { id: 'walk', name: 'On Foot', price: 0, level: 1, kind: 'foot', capacity: 1,
    desc: 'Free and reliable. Sprint with Shift.' },
  { id: 'bicycle', name: 'Bicycle', price: 500, level: 1, kind: 'pedal', model: 'vehicles/bicycle.glb',
    top: 10, accel: 3.2, handling: 0.95, brake: 7, capacity: 2, color: '#2ec4b6', rider: 'ride', sound: 'pedal',
    twoWheel: true, camDist: 5.6, radius: 0.45, desc: 'Your first set of wheels. Cheap, quiet, dependable.' },
  { id: 'bmx', name: 'BMX', price: 1500, level: 2, kind: 'pedal', model: 'vehicles/bmx.glb',
    top: 11, accel: 4.4, handling: 1.1, brake: 8, capacity: 2, color: '#ff3d7f', rider: 'ride', sound: 'pedal',
    twoWheel: true, camDist: 5.4, radius: 0.42, desc: 'Snappy and agile. Great for tight city corners.' },
  { id: 'escooter', name: 'Electric Scooter', price: 4000, level: 4, kind: 'electric', model: 'vehicles/escooter.glb',
    top: 13, accel: 4.8, handling: 0.95, brake: 7.5, capacity: 3, color: '#7bd389', rider: 'scoot', sound: 'electric',
    twoWheel: true, camDist: 5.4, radius: 0.4, desc: 'Silent electric zip with a rear rack.' },
  { id: 'mtb', name: 'Mountain Bike', price: 7500, level: 5, kind: 'pedal', model: 'vehicles/mtb.glb',
    top: 13.5, accel: 4.9, handling: 1.0, brake: 9, capacity: 3, color: '#3a86ff', rider: 'ride', sound: 'pedal',
    twoWheel: true, camDist: 5.8, radius: 0.45, curbProof: true, desc: 'Knobbly tyres and panniers. Curbs are no problem.' },
  { id: 'moped', name: 'Moped', price: 15000, level: 7, kind: 'motor', model: 'vehicles/moped.glb',
    top: 16.5, accel: 5.2, handling: 0.9, brake: 9, capacity: 4, color: '#ffb703', rider: 'moto', sound: 'moped',
    twoWheel: true, camDist: 6.0, radius: 0.5, desc: 'The classic city courier ride with a top box.' },
  { id: 'motorbike', name: 'Motorbike', price: 30000, level: 10, kind: 'motor', model: 'vehicles/motorbike.glb',
    top: 24, accel: 8.0, handling: 0.95, brake: 12, capacity: 5, color: '#e63946', rider: 'moto', sound: 'motorbike',
    twoWheel: true, camDist: 6.4, radius: 0.55, desc: 'Fast and nimble. Express jobs love it.' },
  { id: 'van_small', name: 'Small Delivery Van', price: 60000, level: 12, kind: 'van', model: 'vehicles/van_small.glb',
    top: 22, accel: 5.6, handling: 0.72, brake: 10, capacity: 10, color: '#f4f1ea', rider: 'drive', sound: 'van',
    camDist: 9, radius: 0.95, desc: 'A real delivery van with a roof rack for ten parcels.' },
  { id: 'van_large', name: 'Large Delivery Van', price: 125000, level: 16, kind: 'van', model: 'vehicles/van_large.glb',
    top: 23, accel: 5.2, handling: 0.64, brake: 10, capacity: 16, color: '#ffd23f', rider: 'drive', sound: 'van',
    camDist: 10.5, radius: 1.05, desc: 'More room, more parcels, more money.' },
  { id: 'truck', name: 'Delivery Truck', price: 300000, level: 20, kind: 'truck', model: 'vehicles/truck.glb',
    top: 24, accel: 4.6, handling: 0.56, brake: 9.5, capacity: 28, color: '#2a9d8f', rider: 'drive', sound: 'truck',
    camDist: 13, radius: 1.2, desc: 'Flatbed hauler for heavy, bulky cargo.' },
  { id: 'truck_super', name: 'Super Delivery Truck', price: 750000, level: 25, kind: 'truck', model: 'vehicles/truck_super.glb',
    top: 30, accel: 6.2, handling: 0.62, brake: 12, capacity: 40, color: '#7b2cbf', rider: 'drive', sound: 'supertruck',
    camDist: 15.5, radius: 1.3, desc: 'The king of the road. Huge capacity, surprising pace.' },
];
export const VEHICLE_BY_ID = Object.fromEntries(VEHICLES.map(v => [v.id, v]));

export const UPGRADE_STATS = [
  { id: 'speed',    name: 'Speed',        desc: '+6% top speed per level' },
  { id: 'accel',    name: 'Acceleration', desc: '+10% acceleration per level' },
  { id: 'handling', name: 'Handling',     desc: '+7% steering and grip per level' },
  { id: 'braking',  name: 'Braking',      desc: '+14% brake power per level' },
  { id: 'cargo',    name: 'Cargo',        desc: 'More parcel capacity per level' },
];
export const UPGRADE_MAX = 5;
export const UPGRADE_FREE_MAX = 3;     // levels 4-5 need the Tuning Lab
export const UPGRADE_COST_STEPS = [1, 1.8, 3, 4.8, 7];

export function upgradeCost(vehicle, level) {
  const base = Math.max(60, vehicle.price * 0.06);
  return Math.round(base * UPGRADE_COST_STEPS[level] / 10) * 10;
}

export function cargoBonus(vehicle, level) {
  return level * Math.max(1, Math.round(vehicle.capacity * 0.15));
}

// effective stats for a vehicle with upgrades
export function vehicleStats(def, up = {}) {
  const u = k => up[k] || 0;
  return {
    top: def.top * (1 + 0.06 * u('speed')),
    accel: def.accel * (1 + 0.10 * u('accel')),
    handling: def.handling * (1 + 0.07 * u('handling')),
    brake: def.brake * (1 + 0.14 * u('braking')),
    capacity: def.capacity + cargoBonus(def, u('cargo')),
  };
}

export const PAINTS = [
  { id: 'stock', name: 'Factory', color: null, price: 0 },
  { id: 'sunset', name: 'Sunset Orange', color: '#ff7a1f', price: 250 },
  { id: 'cherry', name: 'Cherry Red', color: '#e5383b', price: 250 },
  { id: 'lemon', name: 'Lemon', color: '#ffd60a', price: 250 },
  { id: 'mint', name: 'Mint', color: '#52d6a3', price: 250 },
  { id: 'ocean', name: 'Ocean Blue', color: '#2b7de9', price: 250 },
  { id: 'grape', name: 'Grape', color: '#8f4bd6', price: 400 },
  { id: 'bubblegum', name: 'Bubblegum', color: '#ff70a6', price: 400 },
  { id: 'snow', name: 'Snow White', color: '#f5f7fa', price: 400 },
  { id: 'midnight', name: 'Midnight', color: '#22252e', price: 600 },
  { id: 'lime', name: 'Toxic Lime', color: '#9bf01f', price: 600 },
  { id: 'gold', name: 'Liquid Gold', color: '#e8b923', price: 5000, metal: true },
];
export const WHEELS = [
  { id: 'standard', name: 'Standard', rim: '#c9ced6', price: 0 },
  { id: 'sport', name: 'Sport Red', rim: '#e5383b', price: 400 },
  { id: 'black', name: 'Stealth Black', rim: '#2a2d34', price: 400 },
  { id: 'chrome', name: 'Chrome', rim: '#f2f5f8', price: 1200, metal: true },
  { id: 'gold', name: 'Gold', rim: '#e8b923', price: 4000, metal: true },
  { id: 'neon', name: 'Neon Blue', rim: '#29d3ff', price: 6000, glow: true },
];
export const ACCESSORIES = [
  { id: 'lightbar', name: 'Light Bar', price: 1500, desc: 'Flashing amber roof lights.' },
  { id: 'flag', name: 'Courier Flag', price: 800, desc: 'A tall orange safety flag.' },
  { id: 'underglow', name: 'Underglow', price: 3500, desc: 'Neon light under your ride.' },
  { id: 'sign', name: 'Rush Sign', price: 2500, desc: 'A glowing DELIVERY RUSH roof sign.' },
  { id: 'horn', name: 'Party Horn', price: 1200, desc: 'A much louder, happier horn (H).' },
];

// ------------------------------------------------------------------ deliveries
export const RARITIES = [
  { id: 'common',    name: 'Common',    color: '#b07a45', glow: 0,   mult: 1.0, xp: 0,  weight: 62 },
  { id: 'uncommon',  name: 'Uncommon',  color: '#4caf50', glow: 0,   mult: 1.35, xp: 6, weight: 24 },
  { id: 'rare',      name: 'Rare',      color: '#2f80ed', glow: 0.25, mult: 1.8, xp: 14, weight: 10 },
  { id: 'epic',      name: 'Epic',      color: '#9b51e0', glow: 0.5, mult: 2.6, xp: 30, weight: 3.4 },
  { id: 'legendary', name: 'Legendary', color: '#f2c94c', glow: 0.9, mult: 4.0, xp: 60, weight: 0.6 },
];
export const RARITY_BY_ID = Object.fromEntries(RARITIES.map((r, i) => [r.id, { ...r, index: i }]));

export const JOB_TYPES = {
  standard: { id: 'standard', name: 'Standard', color: '#8a94a6', level: 1, mult: 1.0, xp: 0,
              desc: 'A normal delivery. Arriving late costs 25% of the pay.' },
  express:  { id: 'express', name: 'Express', color: '#ff5d5d', level: 2, mult: 1.3, xp: 8,
              desc: 'Tight timer. Up to +50% bonus for arriving early. Fails if late.' },
  fragile:  { id: 'fragile', name: 'Fragile', color: '#56ccf2', level: 4, mult: 1.6, xp: 10,
              desc: 'Bumps and crashes damage the package. Pay scales with its condition.' },
  multi:    { id: 'multi', name: 'Multi-stop', color: '#f2994a', level: 6, mult: 1.25, xp: 6,
              desc: 'One pickup, several drop-offs.' },
  heavy:    { id: 'heavy', name: 'Heavy', color: '#a0785a', level: 8, mult: 1.0, xp: 4,
              desc: 'Bulky cargo. Needs enough cargo capacity.' },
  longhaul: { id: 'longhaul', name: 'Long Haul', color: '#27ae60', level: 10, mult: 1.6, xp: 20,
              desc: 'Cross-district run over a long distance.' },
  premium:  { id: 'premium', name: 'Premium', color: '#f2c94c', level: 13, mult: 2.4, xp: 30,
              desc: 'VIP client. Rare or better package, big pay. Fails if late.' },
};

export const PACKAGE_NAMES = {
  restaurant: ['Hot Pizza', 'Burger Meal', 'Noodle Box', 'Sushi Platter', 'Taco Bag', 'Birthday Cake'],
  shop: ['Parcel', 'New Sneakers', 'Board Game', 'Headphones', 'Book Bundle', 'Phone Case'],
  office: ['Documents', 'Office Supplies', 'Printer Ink', 'Contract Folder'],
  mall: ['Shopping Bags', 'Flat-screen TV', 'Game Console', 'Kitchen Mixer', 'Winter Coats'],
  supermarket: ['Groceries', 'Fruit Crate', 'Water Pack', 'Snack Box'],
  warehouse: ['Machine Parts', 'Flat-pack Shelf', 'Tool Kit', 'Pallet Goods', 'Paint Tins'],
  factory: ['Steel Fittings', 'Engine Parts', 'Spare Gears', 'Cable Drums'],
  terminal: ['Air Freight', 'Medical Supplies', 'Luxury Watch', 'Rare Orchids', 'Satellite Part'],
  fragile: ['Glassware', 'Antique Vase', 'Wedding Cake', 'Crystal Lamp', 'Aquarium'],
  heavy: ['Fridge', 'Sofa', 'Piano Parts', 'Gym Weights', 'Washing Machine'],
};

// global pay tuning (set from the balance check in tools/balance.html)
export const PAY = { base: 30, perMeter: 0.14, unitExtra: 0.62, levelBonus: 0.04, global: 1.3 };
export const STREAK_BONUS = 0.04;       // per delivery in a row
export const STREAK_MAX = 10;

// ------------------------------------------------------------------ levels
export function xpForLevel(level) {           // xp needed to go from level to level + 1
  return Math.round(50 + 25 * Math.pow(level, 1.5));
}
export const MAX_LEVEL = 50;
export function levelUpReward(level) { return 60 * level + 20 * level * level; }

// ------------------------------------------------------------------ shop
export const COSMETICS = [
  { id: 'cap', slot: 'hat', name: 'Courier Cap', price: 0, level: 1, model: 'characters/acc_cap.glb' },
  { id: 'beanie', slot: 'hat', name: 'Cosy Beanie', price: 300, level: 1, model: 'characters/acc_beanie.glb' },
  { id: 'helmet', slot: 'hat', name: 'Safety Helmet', price: 800, level: 2, model: 'characters/acc_helmet.glb' },
  { id: 'headphones', slot: 'hat', name: 'Headphones', price: 1200, level: 3, model: 'characters/acc_headphones.glb' },
  { id: 'tophat', slot: 'hat', name: 'Top Hat', price: 2500, level: 6, model: 'characters/acc_tophat.glb' },
  { id: 'crown', slot: 'hat', name: 'Royal Crown', price: 25000, level: 15, model: 'characters/acc_crown.glb' },
  { id: 'shades', slot: 'face', name: 'Cool Shades', price: 400, level: 1, model: 'characters/acc_shades.glb' },
  { id: 'bag', slot: 'back', name: 'Delivery Backpack', price: 600, level: 1, model: 'characters/acc_bag.glb' },
  { id: 'jetpack', slot: 'back', name: 'Jetpack (cosmetic)', price: 15000, level: 12, model: 'characters/acc_jetpack.glb' },
];
export const SHIRT_COLORS = ['#ff7a1f', '#e5383b', '#2b7de9', '#52d6a3', '#8f4bd6', '#ffd60a', '#f5f7fa', '#22252e', '#ff70a6', '#9bf01f'];
export const PANTS_COLORS = ['#2f3f5c', '#22252e', '#6b4f3a', '#3a5a40', '#7a7f8a', '#1f6feb'];
export const COLOR_PRICE = 150;

export const EQUIPMENT = [
  { id: 'shoes', name: 'Running Shoes', price: 400, level: 1, desc: '+15% speed on foot.' },
  { id: 'courierbag', name: 'Courier Bag', price: 900, level: 2, desc: 'Carry 2 parcels on foot instead of 1.' },
  { id: 'gps', name: 'GPS Pro', price: 1500, level: 3, desc: 'Shows your route as arrows on the road.' },
  { id: 'bubblewrap', name: 'Bubble Wrap', price: 2500, level: 4, desc: 'Fragile packages take 35% less damage.' },
  { id: 'watch', name: 'Smart Watch', price: 6000, level: 6, desc: '+15% time on every job.' },
  { id: 'sneakers', name: 'Pro Sneakers', price: 8000, level: 7, desc: '+30% speed on foot and higher jumps.' },
  { id: 'charm', name: 'Lucky Charm', price: 12000, level: 8, desc: 'Better odds of rare packages.' },
  { id: 'badge', name: 'Negotiator Badge', price: 40000, level: 12, desc: '+10% pay on every delivery.' },
  { id: 'clipboard', name: 'Golden Clipboard', price: 150000, level: 18, desc: '+15% XP from deliveries.' },
];

export const GARAGE_UPGRADES = [
  { id: 'paintbooth', name: 'Paint Booth', price: 1000, level: 2, desc: 'Unlocks paint jobs in the garage.' },
  { id: 'wheelbay', name: 'Wheel Bay', price: 3000, level: 4, desc: 'Unlocks custom wheels.' },
  { id: 'expresscall', name: 'Express Call', price: 5000, level: 5, desc: 'Call your vehicle with no cooldown.' },
  { id: 'workshop', name: 'Accessory Workshop', price: 8000, level: 6, desc: 'Unlocks vehicle accessories.' },
  { id: 'tuninglab', name: 'Tuning Lab', price: 20000, level: 9, desc: 'Unlocks upgrade levels 4 and 5.' },
];

// ------------------------------------------------------------------ progression
// stat keys used: deliveries, earned, level, vehiclesOwned, districts, legendary, epicPlus,
// perfectFragile, expressFast, bestStreak, distance (m), upgrades, maxedStat, trialsGold,
// specials, events, heavy, multi, premium, cosmetics
export const ACHIEVEMENTS = [
  { id: 'first', name: 'First Drop', desc: 'Complete your first delivery.', stat: 'deliveries', goal: 1, reward: 100 },
  { id: 'd10', name: 'Getting Started', desc: 'Complete 10 deliveries.', stat: 'deliveries', goal: 10, reward: 400 },
  { id: 'd50', name: 'Regular Courier', desc: 'Complete 50 deliveries.', stat: 'deliveries', goal: 50, reward: 2500 },
  { id: 'd150', name: 'Road Veteran', desc: 'Complete 150 deliveries.', stat: 'deliveries', goal: 150, reward: 12000 },
  { id: 'd400', name: 'Delivery Legend', desc: 'Complete 400 deliveries.', stat: 'deliveries', goal: 400, reward: 60000 },
  { id: 'e5k', name: 'Pocket Money', desc: 'Earn $5,000 in total.', stat: 'earned', goal: 5000, reward: 500 },
  { id: 'e100k', name: 'Big Earner', desc: 'Earn $100,000 in total.', stat: 'earned', goal: 100000, reward: 8000 },
  { id: 'e1m', name: 'Millionaire Mover', desc: 'Earn $1,000,000 in total.', stat: 'earned', goal: 1000000, reward: 50000 },
  { id: 'wheels', name: 'Wheels!', desc: 'Buy your first vehicle.', stat: 'vehiclesOwned', goal: 1, reward: 150 },
  { id: 'fleet5', name: 'Small Fleet', desc: 'Own 5 vehicles.', stat: 'vehiclesOwned', goal: 5, reward: 6000 },
  { id: 'fleet10', name: 'Full Garage', desc: 'Own all 10 vehicles.', stat: 'vehiclesOwned', goal: 10, reward: 100000 },
  { id: 'dist2', name: 'Explorer', desc: 'Unlock a new district.', stat: 'districts', goal: 2, reward: 300 },
  { id: 'dist5', name: 'Key to the City', desc: 'Unlock all five districts.', stat: 'districts', goal: 5, reward: 40000 },
  { id: 'lv10', name: 'Level 10', desc: 'Reach level 10.', stat: 'level', goal: 10, reward: 5000 },
  { id: 'lv25', name: 'Level 25', desc: 'Reach level 25.', stat: 'level', goal: 25, reward: 50000 },
  { id: 'epic', name: 'Shiny!', desc: 'Deliver an Epic or Legendary package.', stat: 'epicPlus', goal: 1, reward: 800 },
  { id: 'legend', name: 'Golden Touch', desc: 'Deliver a Legendary package.', stat: 'legendary', goal: 1, reward: 3000 },
  { id: 'fragile', name: 'Steady Hands', desc: 'Deliver a Fragile package with no damage.', stat: 'perfectFragile', goal: 1, reward: 1000 },
  { id: 'express', name: 'Speed Demon', desc: 'Finish an Express job with half the time left.', stat: 'expressFast', goal: 1, reward: 1000 },
  { id: 'streak5', name: 'On a Roll', desc: 'Reach a 5 delivery streak.', stat: 'bestStreak', goal: 5, reward: 600 },
  { id: 'streak15', name: 'Unstoppable', desc: 'Reach a 15 delivery streak.', stat: 'bestStreak', goal: 15, reward: 6000 },
  { id: 'km25', name: 'Road Tripper', desc: 'Travel 25 km.', stat: 'distance', goal: 25000, reward: 2000 },
  { id: 'tuner', name: 'Tuner', desc: 'Buy 10 vehicle upgrades.', stat: 'upgrades', goal: 10, reward: 1500 },
  { id: 'maxed', name: 'Maxed Out', desc: 'Max out any upgrade.', stat: 'maxedStat', goal: 1, reward: 5000 },
  { id: 'gold', name: 'Gold Medal', desc: 'Win gold in a time trial.', stat: 'trialsGold', goal: 1, reward: 2000 },
  { id: 'event', name: 'Treasure Hunter', desc: 'Deliver a Golden Drop event package.', stat: 'events', goal: 1, reward: 2500 },
  { id: 'special', name: 'Story Time', desc: 'Complete a special mission.', stat: 'specials', goal: 1, reward: 1000 },
];

export const DAILY_TEMPLATES = [
  { id: 'deliver', text: n => `Complete ${n} deliveries`, stat: 'deliveries', goal: lv => 4 + Math.floor(lv / 4) },
  { id: 'rare', text: n => `Deliver ${n} Rare or better packages`, stat: 'rarePlus', goal: lv => 1 + Math.floor(lv / 10) },
  { id: 'express', text: n => `Finish ${n} Express jobs`, stat: 'express', goal: () => 2, level: 2 },
  { id: 'fragile', text: n => `Finish ${n} Fragile jobs`, stat: 'fragile', goal: () => 2, level: 4 },
  { id: 'distance', text: n => `Travel ${(n / 1000).toFixed(0)} km`, stat: 'distance', goal: lv => 3000 + lv * 200 },
  { id: 'earn', text: n => `Earn $${n.toLocaleString()}`, stat: 'earned', goal: lv => Math.round((400 + lv * lv * 120) / 100) * 100 },
  { id: 'streak', text: n => `Reach a ${n} delivery streak`, stat: 'streakNow', goal: () => 4, max: true },
  { id: 'heavy', text: n => `Finish ${n} Heavy jobs`, stat: 'heavy', goal: () => 2, level: 8 },
];
export function dailyReward(level) { return { money: 250 + level * level * 40, xp: 40 + level * 12 }; }
export const LOGIN_REWARDS = [1, 1.2, 1.5, 1.8, 2.2, 2.6, 4];   // x (150 + 30*level) per streak day

// time trials: routes through grid intersections [col, row]; times in seconds for medals
export const TIME_TRIALS = [
  { id: 'dash', name: 'Downtown Dash', district: 'downtown', nodes: [[4, 5], [5, 5], [5, 4], [3, 4], [3, 6], [6, 6], [6, 3], [4, 3]],
    level: 1, reward: [400, 250, 120] },
  { id: 'loop', name: 'Suburban Loop', district: 'suburbs', nodes: [[2, 3], [2, 1], [0, 1], [0, 6], [2, 6], [2, 3]],
    level: 2, reward: [900, 550, 250] },
  { id: 'mall', name: 'Mall Run', district: 'shopping', nodes: [[1, 7], [5, 7], [5, 10], [1, 10], [1, 8], [3, 8]],
    level: 5, reward: [2500, 1500, 700] },
  { id: 'docks', name: 'Depot Sprint', district: 'industrial', nodes: [[7, 3], [10, 3], [10, 10], [6, 10], [6, 7], [8, 7], [8, 5]],
    level: 9, reward: [6000, 3500, 1800] },
  { id: 'runway', name: 'Runway Rush', district: 'airport', nodes: [[4, 3], [4, 0], [10, 0], [10, 3], [7, 3]],
    level: 14, reward: [15000, 9000, 4500] },
];

// special one-time missions; pickup / drop resolved from building roles in that district
export const SPECIAL_MISSIONS = [
  { id: 'opening', name: 'Grand Opening', level: 2, desc: 'A new cafe needs its first batch of cups. Do not break them!',
    type: 'fragile', rarity: 'rare', from: { district: 'downtown', role: 'shop' }, to: { district: 'downtown', role: 'restaurant' },
    units: 1, reward: 900, xp: 150, time: 150 },
  { id: 'mayor', name: 'The Mayor\'s Lunch', level: 4, desc: 'The mayor ordered lunch. It must arrive hot and fast.',
    type: 'express', rarity: 'epic', from: { district: 'downtown', role: 'restaurant' }, to: { district: 'suburbs', role: 'house' },
    units: 1, reward: 2200, xp: 260, time: 110 },
  { id: 'housewarming', name: 'Housewarming', level: 7, desc: 'Deliver gifts to three new neighbours.',
    type: 'multi', rarity: 'uncommon', from: { district: 'shopping', role: 'mall' }, to: { district: 'suburbs', role: 'house', count: 3 },
    units: 3, reward: 6000, xp: 420, time: 360 },
  { id: 'bigmove', name: 'The Big Move', level: 11, desc: 'A family is moving house. Bring all their furniture.',
    type: 'heavy', rarity: 'rare', from: { district: 'industrial', role: 'warehouse' }, to: { district: 'suburbs', role: 'house' },
    units: 9, reward: 18000, xp: 700, time: 420 },
  { id: 'vip', name: 'VIP Cargo', level: 15, desc: 'A priceless satellite part landed at the airport. Rush it downtown.',
    type: 'premium', rarity: 'legendary', from: { district: 'airport', role: 'terminal' }, to: { district: 'downtown', role: 'office' },
    units: 2, reward: 60000, xp: 1500, time: 260 },
  { id: 'citywide', name: 'City Tour', level: 21, desc: 'One truck, five districts, five deliveries.',
    type: 'multi', rarity: 'epic', from: { district: 'airport', role: 'terminal' }, to: { district: 'any', role: 'any', count: 5 },
    units: 20, reward: 160000, xp: 3000, time: 900 },
];

export const EVENT = { interval: [300, 480], duration: 240, rewardMult: 3.5 };
export const JOBS_PER_DISTRICT = 6;
export const JOB_REFRESH = 150;          // seconds between job board refreshes
export const CALL_COOLDOWN = 30;
export const START_MONEY = 150;
export const DAY_LENGTH = 16 * 60;       // real seconds per in-game day
