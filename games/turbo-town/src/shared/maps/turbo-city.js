// Turbo City: the free roam map (and the party lobby). A grid of streets with buildings,
// parks, a plaza with a fountain, a stunt park with ramps, a parking deck and a drift pad.
// No race on it: you drive anywhere inside the city wall. The layout comes from the Blender
// script that builds the model (tools/blender/build_city.py), see turbo-city-layout.js.
import layout from './turbo-city-layout.js';

export default {
  id: 'turbo-city',
  name: 'Turbo City',
  season: 'summer',
  laps: 99,
  margin: 6,
  killY: -8,
  // the ring road round the city (the minimap, respawns and the race code use it)
  path: layout.loop.map(([x, z]) => [x, 0, z, 16]),
  shortcuts: [],
  zones: [],
  bridges: [],
  gaps: [],
  ramps: [],
  boostPads: [],
  patches: [],
  tunnels: [],
  water: [],
  itemBoxes: [],
  obstacles: [],
  movers: [],
  city: layout,
};
