import * as THREE from 'three';

const chunkVert = /* glsl */`
in float aLayer;
in vec3 aColor;
in vec2 aLight;
out vec2 vUv;
flat out float vLayer;
out vec3 vColor;
out vec2 vLight;
out float vDist;
uniform float uWave;
uniform float uTime;
void main() {
  vUv = uv;
  vLayer = aLayer;
  vColor = aColor;
  vLight = aLight;
  vec3 p = position;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const chunkFrag = /* glsl */`
precision highp sampler2DArray;
uniform sampler2DArray map;
uniform float daylight;
uniform float alphaTest;
uniform float opacity;
uniform float fogNear;
uniform float fogFar;
uniform vec3 fogColor;
uniform float uTime;
uniform float uAnimLayer;
uniform float uGamma;
in vec2 vUv;
flat in float vLayer;
in vec3 vColor;
in vec2 vLight;
in float vDist;
out highp vec4 pc_fragColor;
void main() {
  vec2 uv = vUv;
  if (abs(vLayer - uAnimLayer) < 0.5) uv += vec2(uTime * 0.03, uTime * 0.05);
  vec4 t = texture(map, vec3(uv, vLayer));
  if (t.a < alphaTest) discard;
  float sky = vLight.x * daylight;
  float bl = vLight.y;
  float l = max(sky, bl);
  float b = pow(0.8, (1.0 - l) * 15.0);
  b = mix(b, sqrt(b), uGamma);
  b = max(b, 0.035);
  vec3 tint = mix(vec3(1.0), vec3(1.0, 0.9, 0.75), clamp((bl - sky) * 1.5, 0.0, 1.0) * 0.8);
  vec3 col = t.rgb * vColor * b * tint;
  float f = smoothstep(fogNear, fogFar, vDist);
  pc_fragColor = vec4(mix(col, fogColor, f), t.a * opacity);
}`;

export function createChunkMaterials(atlas) {
  const shared = {
    map: { value: atlas },
    daylight: { value: 1 },
    fogNear: { value: 60 },
    fogFar: { value: 90 },
    fogColor: { value: new THREE.Color(0x9cc8ff) },
    uTime: { value: 0 },
    uAnimLayer: { value: -10 },
    uGamma: { value: 0.3 },
    uWave: { value: 0 },
  };
  const mk = (alphaTest, opacity, transparent, side) => new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: { ...shared, alphaTest: { value: alphaTest }, opacity: { value: opacity } },
    vertexShader: chunkVert,
    fragmentShader: chunkFrag,
    transparent,
    side,
    depthWrite: !transparent,
  });
  const solid = mk(0.5, 1, false, THREE.FrontSide);
  const trans = mk(0.02, 1, true, THREE.FrontSide);
  trans.depthWrite = true;
  return { solid, trans, shared };
}

// Material for entity cubes built from block faces (dropped items, held block, falling sand)
const entVert = /* glsl */`
in float aLayer;
in vec3 aColor;
out vec2 vUv;
flat out float vLayer;
out vec3 vColor;
out float vDist;
void main() {
  vUv = uv; vLayer = aLayer; vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const entFrag = /* glsl */`
precision highp sampler2DArray;
uniform sampler2DArray map;
uniform float brightness;
uniform float fogNear;
uniform float fogFar;
uniform vec3 fogColor;
uniform vec3 flash;
in vec2 vUv;
flat in float vLayer;
in vec3 vColor;
in float vDist;
out highp vec4 pc_fragColor;
void main() {
  vec4 t = texture(map, vec3(vUv, vLayer));
  if (t.a < 0.5) discard;
  vec3 col = t.rgb * vColor * brightness + flash;
  float f = smoothstep(fogNear, fogFar, vDist);
  pc_fragColor = vec4(mix(col, fogColor, f), 1.0);
}`;

export function createEntityBlockMaterial(atlas, shared) {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: {
      map: { value: atlas }, brightness: { value: 1 }, flash: { value: new THREE.Vector3() },
      fogNear: shared.fogNear, fogFar: shared.fogFar, fogColor: shared.fogColor,
    },
    vertexShader: entVert,
    fragmentShader: entFrag,
  });
}

export function lightToBrightness(packed, daylight) {
  const sky = (packed >> 4) / 15 * daylight;
  const bl = (packed & 15) / 15;
  const l = Math.max(sky, bl);
  const b = Math.pow(0.8, (1 - l) * 15);
  return Math.max(0.06, b * 0.7 + Math.sqrt(b) * 0.3);
}
