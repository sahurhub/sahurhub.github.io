// TURBO TOWN - ground surfaces (shared, pure data).
// speed: top speed multiplier, accel: acceleration multiplier, grip: sideways grip
// multiplier, handling: steering multiplier. offroad surfaces are softened by a kart's
// off-road stat; slippery ones by its grip stat.
export const SURF = {
  ROAD: 0, GRASS: 1, MUD: 2, ICE: 3, SAND: 4, WATER: 5, BOOST: 6, BOUNCE: 7, RAMP: 8,
  SNOW: 9, WOOD: 10, DIRT: 11, DEEP: 12, CANDY: 13, SLIDE: 14, LEAVES: 15,
};

export const SURF_NAME = Object.fromEntries(Object.entries(SURF).map(([k, v]) => [v, k.toLowerCase()]));

export const SURF_PROPS = [
  /* ROAD   */ { speed: 1, accel: 1, grip: 1, handling: 1 },
  /* GRASS  */ { speed: 0.5, accel: 0.6, grip: 0.85, handling: 0.9, offroad: true, dust: '#7ccf4a' },
  /* MUD    */ { speed: 0.5, accel: 0.4, grip: 0.7, handling: 0.6, offroad: true, dust: '#8a5a2b' },
  /* ICE    */ { speed: 1, accel: 0.75, grip: 0.22, handling: 0.8, slippery: true },
  /* SAND   */ { speed: 0.62, accel: 0.75, grip: 0.8, handling: 0.9, offroad: true, dust: '#f3d28b' },
  /* WATER  */ { speed: 0.72, accel: 0.7, grip: 0.5, handling: 0.72, slippery: true, splash: true },
  /* BOOST  */ { speed: 1, accel: 1, grip: 1, handling: 1, boost: true },
  /* BOUNCE */ { speed: 1, accel: 1, grip: 1, handling: 1, bounce: true },
  /* RAMP   */ { speed: 1, accel: 1, grip: 1, handling: 1, ramp: true },
  /* SNOW   */ { speed: 0.62, accel: 0.7, grip: 0.7, handling: 0.85, offroad: true, dust: '#ffffff' },
  /* WOOD   */ { speed: 1, accel: 1, grip: 1, handling: 1 },
  /* DIRT   */ { speed: 0.78, accel: 0.82, grip: 0.9, handling: 0.95, offroad: true, dust: '#c8a06a' },
  /* DEEP   */ { speed: 0.5, accel: 0.5, grip: 0.5, handling: 0.5, kill: true },
  /* CANDY  */ { speed: 1, accel: 1, grip: 1, handling: 1 },
  /* SLIDE  */ { speed: 1.18, accel: 1.2, grip: 0.65, handling: 0.85, splash: true, slide: true },
  /* LEAVES */ { speed: 0.9, accel: 0.9, grip: 0.9, handling: 0.95, offroad: true, dust: '#ff9a3c' },
];

export function surfaceId(name) {
  const v = SURF[String(name || 'road').toUpperCase()];
  return v == null ? SURF.ROAD : v;
}
