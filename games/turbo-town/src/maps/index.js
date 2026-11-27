// TURBO TOWN - map registry. Only the selected map's files are downloaded.
export const MAPS = [
  { id: 'blossom-valley', name: 'Blossom Valley', season: 'spring' },
  { id: 'mushroom-meadow', name: 'Mushroom Meadow', season: 'spring' },
  { id: 'tropical-splash', name: 'Tropical Splash', season: 'summer' },
  { id: 'sunburst-speedway', name: 'Sunburst Speedway', season: 'summer' },
  { id: 'pumpkin-patch', name: 'Pumpkin Patch', season: 'autumn' },
  { id: 'haunted-hollow', name: 'Haunted Hollow', season: 'autumn' },
  { id: 'frostbite-falls', name: 'Frostbite Falls', season: 'winter' },
  { id: 'candy-cane-kingdom', name: 'Candy Cane Kingdom', season: 'winter' },
  { id: 'dusty-canyon', name: 'Dusty Canyon', season: 'explorer' },
  { id: 'jungle-ruins', name: 'Jungle Ruins', season: 'explorer' },
  { id: 'lava-peak', name: 'Lava Peak', season: 'explorer' },
  { id: 'harbour-rush', name: 'Harbour Rush', season: 'explorer' },
  { id: 'neon-nights', name: 'Neon Nights', season: 'thrill' },
  { id: 'grand-prix-circuit', name: 'Grand Prix Circuit', season: 'thrill' },
  { id: 'sky-islands', name: 'Sky Islands', season: 'thrill' },
  { id: 'amazon-rainforest', name: 'Amazon Rainforest', season: 'thrill' },
  { id: 'practice-arena', name: 'Practice Park', season: 'spring', practice: true },
  { id: 'turbo-city', name: 'Turbo City', season: 'summer', practice: true, city: true },
];

export const MAP_BY_ID = Object.fromEntries(MAPS.map((m) => [m.id, m]));

export async function loadMap(id) {
  const [shared, look] = await Promise.all([
    import(`../shared/maps/${id}.js`),
    import(`./${id}.js`),
  ]);
  // copy the layout so building it (which resolves places in place) never touches the module
  const def = JSON.parse(JSON.stringify(shared.default));
  return { def, vis: look.vis, decorate: look.decorate };
}
