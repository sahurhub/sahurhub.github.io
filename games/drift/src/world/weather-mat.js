// Drift! - weather on materials: wet roads (darker, shinier) and snow cover
// (white on surfaces that face up). Every map material is patched once; the weather system
// only changes these shared numbers, so it costs almost nothing per frame.
import * as THREE from 'three';

export const weatherUniforms = {
  uWet: { value: 0 },        // 0..1 how wet the world is
  uSnow: { value: 0 },       // 0..1 how much snow lies on the ground
  uSnowColor: { value: new THREE.Color(0.92, 0.94, 0.98) },
  uTime: { value: 0 },
};

/**
 * kind: 'road' (gets wet and shiny, keeps dark tyre tracks in snow), 'ground' (snow covers it),
 * 'object' (snow on top faces only, a little wet), 'none'.
 */
export function patchMaterial(mat, kind = 'object') {
  if (!mat || mat.userData.weatherPatched || kind === 'none') return mat;
  if (!mat.isMeshStandardMaterial) return mat; // the shader changes need a lit (standard) material
  mat.userData.weatherPatched = true;
  const wetK = kind === 'road' ? 1 : kind === 'ground' ? 0.45 : 0.35;
  const snowK = kind === 'road' ? 0.55 : kind === 'ground' ? 1 : 0.9;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    Object.assign(shader.uniforms, weatherUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldN;\nvarying vec3 vWorldP;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
{
  vec4 wP = vec4(transformed, 1.0);
  vec3 wN = objectNormal;
#ifdef USE_INSTANCING
  wP = instanceMatrix * wP;
  wN = mat3(instanceMatrix) * wN;
#endif
  vWorldN = normalize(mat3(modelMatrix) * wN);
  vWorldP = (modelMatrix * wP).xyz;
}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uWet; uniform float uSnow; uniform vec3 uSnowColor; uniform float uTime;
varying vec3 vWorldN; varying vec3 vWorldP;
float wHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float wNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wHash(i), wHash(i + vec2(1, 0)), f.x), mix(wHash(i + vec2(0, 1)), wHash(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
float wetAmt = uWet * ${wetK.toFixed(2)};
roughnessFactor = mix(roughnessFactor, 0.12, wetAmt * 0.85);`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float up = smoothstep(0.55, 0.9, vWorldN.y);
  float n = wNoise(vWorldP.xz * 0.35) * 0.6 + wNoise(vWorldP.xz * 2.1) * 0.4;
  float snowAmt = uSnow * ${snowK.toFixed(2)} * up * smoothstep(0.25, 0.55, n + uSnow * 0.45);
  ${kind === 'road' ? 'snowAmt *= 1.0 - 0.75 * smoothstep(0.3, 0.7, wNoise(vWorldP.xz * vec2(0.6, 0.6) + 3.0));' : ''}
  diffuseColor.rgb = mix(diffuseColor.rgb, uSnowColor, clamp(snowAmt, 0.0, 1.0));
  diffuseColor.rgb *= 1.0 - uWet * ${wetK.toFixed(2)} * 0.38 * (1.0 - snowAmt);
}`);
  };
  mat.customProgramCacheKey = () => 'wx-' + kind + (mat.userData.extraKey || '');
  mat.needsUpdate = true;
  return mat;
}
