// UK Simulator - map coordinates.
// OpenStreetMap uses GPS latitude/longitude (WGS84). The Environment Agency LiDAR uses the
// British National Grid (OSGB36, metres east/north). The game world uses metres from a fixed
// point in the town centre: x = east, z = south (so north is -z), y = height above sea level.
// The WGS84 -> OSGB36 step is the standard 7-parameter Helmert transform (good to a few metres);
// the town builder then measures the remaining offset against the LiDAR and stores it.

const RAD = Math.PI / 180;

// world origin (British National Grid metres) - near Leighton Buzzard market cross
export const ORIGIN_E = 492000;
export const ORIGIN_N = 225000;

function toCartesian(lat, lon, h, a, b) {
  const e2 = (a * a - b * b) / (a * a);
  const sl = Math.sin(lat), cl = Math.cos(lat);
  const nu = a / Math.sqrt(1 - e2 * sl * sl);
  return [(nu + h) * cl * Math.cos(lon), (nu + h) * cl * Math.sin(lon), ((1 - e2) * nu + h) * sl];
}

function toLatLon(x, y, z, a, b) {
  const e2 = (a * a - b * b) / (a * a);
  const p = Math.sqrt(x * x + y * y);
  let lat = Math.atan2(z, p * (1 - e2));
  for (let i = 0; i < 10; i++) {
    const nu = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
    const next = Math.atan2(z + e2 * nu * Math.sin(lat), p);
    if (Math.abs(next - lat) < 1e-12) { lat = next; break; }
    lat = next;
  }
  return [lat, Math.atan2(y, x)];
}

// WGS84 latitude/longitude (degrees) -> British National Grid [easting, northing]
export function wgs84ToBng(latDeg, lonDeg) {
  // 1. GPS coordinates to 3D cartesian (GRS80 ellipsoid)
  const [x1, y1, z1] = toCartesian(latDeg * RAD, lonDeg * RAD, 0, 6378137.0, 6356752.314245);
  // 2. Helmert transform WGS84 -> OSGB36
  const tx = -446.448, ty = 125.157, tz = -542.060;
  const s = 20.4894e-6;
  const rx = (-0.1502 / 3600) * RAD, ry = (-0.2470 / 3600) * RAD, rz = (-0.8421 / 3600) * RAD;
  const x2 = tx + (1 + s) * x1 - rz * y1 + ry * z1;
  const y2 = ty + rz * x1 + (1 + s) * y1 - rx * z1;
  const z2 = tz - ry * x1 + rx * y1 + (1 + s) * z1;
  // 3. back to latitude/longitude on the Airy 1830 ellipsoid
  const a = 6377563.396, b = 6356256.909;
  const [lat, lon] = toLatLon(x2, y2, z2, a, b);
  // 4. Transverse Mercator projection (National Grid)
  const F0 = 0.9996012717, lat0 = 49 * RAD, lon0 = -2 * RAD, E0 = 400000, N0 = -100000;
  const e2 = 1 - (b * b) / (a * a), n = (a - b) / (a + b);
  const sl = Math.sin(lat), cl = Math.cos(lat), tl = Math.tan(lat);
  const nu = a * F0 / Math.sqrt(1 - e2 * sl * sl);
  const rho = a * F0 * (1 - e2) / Math.pow(1 - e2 * sl * sl, 1.5);
  const eta2 = nu / rho - 1;
  const dl = lat - lat0, sm = lat + lat0;
  const M = b * F0 * (
    (1 + n + (5 / 4) * n * n + (5 / 4) * n ** 3) * dl
    - (3 * n + 3 * n * n + (21 / 8) * n ** 3) * Math.sin(dl) * Math.cos(sm)
    + ((15 / 8) * n * n + (15 / 8) * n ** 3) * Math.sin(2 * dl) * Math.cos(2 * sm)
    - (35 / 24) * n ** 3 * Math.sin(3 * dl) * Math.cos(3 * sm));
  const I = M + N0;
  const II = (nu / 2) * sl * cl;
  const III = (nu / 24) * sl * cl ** 3 * (5 - tl * tl + 9 * eta2);
  const IIIA = (nu / 720) * sl * cl ** 5 * (61 - 58 * tl * tl + tl ** 4);
  const IV = nu * cl;
  const V = (nu / 6) * cl ** 3 * (nu / rho - tl * tl);
  const VI = (nu / 120) * cl ** 5 * (5 - 18 * tl * tl + tl ** 4 + 14 * eta2 - 58 * tl * tl * eta2);
  const L = lon - lon0;
  const N = I + II * L ** 2 + III * L ** 4 + IIIA * L ** 6;
  const E = E0 + IV * L + V * L ** 3 + VI * L ** 5;
  return [E, N];
}

// British National Grid -> game world (x east, z south)
export function bngToWorld(E, N) { return [E - ORIGIN_E, ORIGIN_N - N]; }
export function worldToBng(x, z) { return [x + ORIGIN_E, ORIGIN_N - z]; }
