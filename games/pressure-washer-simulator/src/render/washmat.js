// Material for washable surfaces: the clean Poly Haven texture, with a Poly Haven dirt texture on top
// where the mask says so (R = grime), plus an optional stubborn layer (G = moss / oil / graffiti).
// The dirt is drawn with a hard threshold against the dirt texture's own pattern, so it erodes in a
// natural way and the edges of clean streaks stay crisp even though the mask is low-res.
import * as THREE from 'three';
import { texture, TEX, keyColor } from './assets.js';

export const LAYER = { none: 0, moss: 1, oil: 2, graffiti: 3 };

// shared by every washable material
export const washGlobal = {
  uFind: { value: 0 },        // Q held: dirt glows orange
  uWipe: { value: -1 },       // before/after reveal: fragments left of this x (pixels) show the "before" mask
  uTime: { value: 0 },
  uNoise: { value: new THREE.Vector2(0.066, 0.112) }, // dirt texture luminance range (linear) used as the erosion pattern
};

export const GRAFFITI = ['#1b1b2a', '#ff3fa4', '#2fd5ff', '#ffd23f', '#7cff4f', '#ff7a1f', '#9b5dff', '#ffffff'];
const palette = GRAFFITI.map((h) => new THREE.Color(h));

const VERT_HEAD = `#include <common>
attribute vec2 aMaskUv;
varying vec2 vMaskUv;
varying vec2 vWUv;`;
const VERT_BODY = `#include <begin_vertex>
vMaskUv = aMaskUv;
vWUv = uv;`;

const FRAG_HEAD = `#include <common>
uniform sampler2D uMask;
uniform sampler2D uBefore;
uniform sampler2D uDirt;
uniform sampler2D uLayerTex;
uniform sampler2D uInfo;
uniform vec3 uDirtTint;
uniform vec3 uLayerTint;
uniform vec3 uPal[8];
uniform vec2 uNoise;
uniform float uFind;
uniform float uWipe;
uniform float uFlash;
uniform float uTime;
varying vec2 vMaskUv;
varying vec2 vWUv;`;

const FRAG_BODY = `#include <color_fragment>
vec2 pwM = texture2D( uMask, vMaskUv ).rg;
if ( gl_FragCoord.x < uWipe ) pwM = texture2D( uBefore, vMaskUv ).rg;
vec3 pwDirtTex = texture2D( uDirt, vWUv * ${(1 / TEX.dirt).toFixed(4)} ).rgb;
float pwN = smoothstep( uNoise.x, uNoise.y, dot( pwDirtTex, vec3( 0.3333 ) ) );
float pwCov = smoothstep( -0.035, 0.035, pwM.r - ( pwN * 0.88 + 0.06 ) );
vec3 pwDirtCol = uDirtTint * ( pwDirtTex / vec3( 0.1256, 0.0852, 0.0491 ) ) * ( 1.5 - 0.45 * smoothstep( 0.6, 1.0, pwM.r ) );
diffuseColor.rgb = mix( diffuseColor.rgb, pwDirtCol, pwCov * 0.95 );
// stubborn layers sit on top of the grime (graffiti sprayed on a dirty van, oil on a dirty drive)
float pwCov2 = 0.0;
#if PW_LAYER == 1
  vec3 pwL = texture2D( uLayerTex, vWUv * ${(1 / TEX.moss).toFixed(4)} ).rgb / vec3( 0.0985, 0.0968, 0.0137 ) * uLayerTint;
  pwCov2 = smoothstep( -0.05, 0.05, pwM.g - ( ( 1.0 - pwN ) * 0.8 + 0.1 ) );
  diffuseColor.rgb = mix( diffuseColor.rgb, pwL, pwCov2 );
#elif PW_LAYER == 2
  pwCov2 = smoothstep( -0.04, 0.04, pwM.g - ( ( 1.0 - pwN ) * 0.55 + 0.12 ) );
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.022, 0.019, 0.016 ) + pwDirtTex * 0.08, pwCov2 * 0.92 );
#elif PW_LAYER == 3
  int pwI = int( texture2D( uInfo, vMaskUv ).r * 7.99 );
  pwCov2 = smoothstep( 0.3, 0.42, pwM.g );
  diffuseColor.rgb = mix( diffuseColor.rgb, uPal[ pwI ], pwCov2 );
#endif
float pwLeft = max( pwCov, pwCov2 );`;

const FRAG_EMIT = `#include <emissivemap_fragment>
totalEmissiveRadiance += vec3( 1.0, 0.42, 0.05 ) * uFind * pwLeft * ( 0.75 + 0.25 * sin( uTime * 7.0 ) );
totalEmissiveRadiance += vec3( 0.7, 0.95, 1.0 ) * uFlash;`;

// S = per-surface uniforms (shared by all materials of one washable object)
export function makeWashMaterial(key, S, layerKind = 0) {
  const m = new THREE.MeshLambertMaterial({ map: texture(key), vertexColors: true });
  keyColor(key, m.color);
  m.name = 'wash_' + key;
  m.defines = { PW_LAYER: layerKind };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uMask = S.uMask;
    sh.uniforms.uBefore = S.uBefore;
    sh.uniforms.uInfo = S.uInfo;
    sh.uniforms.uFlash = S.uFlash;
    sh.uniforms.uDirtTint = S.uDirtTint;
    sh.uniforms.uLayerTint = S.uLayerTint;
    sh.uniforms.uDirt = { value: texture('dirt') };
    sh.uniforms.uLayerTex = { value: texture('moss') };
    sh.uniforms.uPal = { value: palette };
    sh.uniforms.uFind = washGlobal.uFind;
    sh.uniforms.uWipe = washGlobal.uWipe;
    sh.uniforms.uTime = washGlobal.uTime;
    sh.uniforms.uNoise = washGlobal.uNoise;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', VERT_HEAD).replace('#include <begin_vertex>', VERT_BODY);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', FRAG_HEAD)
      .replace('#include <color_fragment>', FRAG_BODY)
      .replace('#include <emissivemap_fragment>', FRAG_EMIT);
  };
  m.customProgramCacheKey = () => 'pw-wash';
  return m;
}
