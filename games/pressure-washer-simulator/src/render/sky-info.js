// Sun direction from tools/blender/build_textures.py (brightest pixel of the Poly Haven HDRI sunflowers_puresky, 1K;
// three.js: u = atan(z, x), v = asin(y)). The light colours were then made warmer and brighter by hand
// (user's request 2026-11-23: bright, cheerful, saturated look).
export const SKY = {
  sunAz: 0.6289,
  sunEl: 0.7517,
  sunColor: '#fff0d2',
  sun: 2.5,
  skyColor: '#d2ebff',
  groundColor: '#b6d08a',
  hemi: 1.85,
  fogColor: '#c4e2ff',
};
