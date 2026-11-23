// Upgrades and the washer stats they give. Prices in pounds.
export const UPGRADES = {
  tank: { name: 'Bigger tank', icon: 'tank', desc: 'Spray for longer before you need the tap.', prices: [120, 260, 480], values: [30, 45, 65, 90], unit: 'L' },
  pressure: { name: 'Stronger pressure', icon: 'pressure', desc: 'Cleans faster and reaches further. Level 2 shifts moss, oil and graffiti.', prices: [160, 340, 620], values: [1, 1.3, 1.65, 2.0], range: [5.5, 6.5, 7.5, 8.5] },
  nozzle: { name: 'Wider nozzle', icon: 'nozzle', desc: 'The wide fan covers more per sweep.', prices: [140, 320], values: [14, 19, 24], unit: '°' },
  hose: { name: 'Longer hose', icon: 'hose', desc: 'Walk further from the washer before the hose pulls tight.', prices: [80, 180, 340], values: [9, 13, 18, 25], unit: 'm' },
  surface: { name: 'Surface cleaner', icon: 'surface', desc: 'A spinning disc that whizzes across floors. Press 3 to fit it.', prices: [450], values: [0, 1] },
  detergent: { name: 'Detergent', icon: 'detergent', desc: 'Soapy mix that eats stubborn moss, oil and graffiti.', prices: [300], values: [0, 1] },
};
export const UPGRADE_ORDER = ['tank', 'pressure', 'nozzle', 'hose', 'surface', 'detergent'];

export const COLORS = [
  { id: 'blue', name: 'Seaside', hex: '#1e7bff', price: 0 },
  { id: 'yellow', name: 'Sunshine', hex: '#ffc21a', price: 60 },
  { id: 'red', name: 'Pillar Box', hex: '#e8322e', price: 60 },
  { id: 'green', name: 'Racing Green', hex: '#1f7a3e', price: 80 },
  { id: 'orange', name: 'Tango', hex: '#ff8a1f', price: 80 },
  { id: 'pink', name: 'Bubblegum', hex: '#ff6fb5', price: 100 },
  { id: 'purple', name: 'Royal', hex: '#7b4bd6', price: 100 },
  { id: 'black', name: 'Stealth', hex: '#30333b', price: 150 },
  { id: 'gold', name: 'Gold Plated', hex: '#e8b530', price: 400 },
];
export const colorHex = (id) => (COLORS.find((c) => c.id === id) || COLORS[0]).hex;

// nozzle shapes: tanA = half-angle along the fan, tanB = across it; rate = grime removed per second
const T = (deg) => Math.tan((deg * Math.PI) / 180);
export function washerStats(up) {
  const lv = (k) => Math.min(up[k] || 0, UPGRADES[k].values.length - 1);
  const p = lv('pressure');
  return {
    tank: UPGRADES.tank.values[lv('tank')],
    pressure: UPGRADES.pressure.values[p],
    pressureLvl: p,
    range: UPGRADES.pressure.range[p],
    wideDeg: UPGRADES.nozzle.values[lv('nozzle')],
    hose: UPGRADES.hose.values[lv('hose')],
    surface: lv('surface') > 0,
    detergent: lv('detergent') > 0,
    narrow: { tanA: T(2.4), tanB: T(2.4), rate: 9.0, use: 0.7 },
    wide: { tanA: T(UPGRADES.nozzle.values[lv('nozzle')]), tanB: T(1.8), rate: 3.6, use: 0.8 },
    disc: { r: 0.34, rate: 7.5, use: 1.0, reach: 2.5 },
    // stubborn layers: share of the normal cleaning speed
    stub: lv('detergent') > 0 ? 0.9 : p >= 2 ? 0.55 : 0.35,
  };
}
