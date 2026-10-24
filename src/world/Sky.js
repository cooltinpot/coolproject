// Procedural night sky: gradient atmosphere, twinkling star field, drifting
// nebula, a ringed gas giant, aurora ribbons and a glowing sea of clouds below.
import * as THREE from 'three';

const NOISE_GLSL = /* glsl */ `
  float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  float vnoise(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float a = 0.5, s = 0.0;
    for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
    return s;
  }
`;

export function createSky() {
  const uniforms = {
    uTime: { value: 0 },
    uPulse: { value: 0 },
    uPlanetDir: { value: new THREE.Vector3(0.55, 0.32, -0.77).normalize() },
    uMoonDir: { value: new THREE.Vector3(-0.45, 0.62, 0.64).normalize() },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime, uPulse;
      uniform vec3 uPlanetDir, uMoonDir;
      varying vec3 vDir;
      ${NOISE_GLSL}

      vec3 starField(vec3 d, float scale, float thresh) {
        vec3 p = d * scale;
        vec3 i = floor(p);
        vec3 f = fract(p) - 0.5;
        float h = hash13(i);
        if (h < thresh) return vec3(0.0);
        vec3 off = vec3(hash13(i + 3.1), hash13(i + 7.7), hash13(i + 1.3)) - 0.5;
        float dist = length(f - off * 0.6);
        float tw = 0.6 + 0.4 * sin(uTime * (1.0 + h * 4.0) + h * 40.0);
        float s = smoothstep(0.09, 0.0, dist) * tw;
        vec3 tint = mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.75, 0.6), hash13(i + 9.0));
        return tint * s * (h - thresh) / (1.0 - thresh) * 3.0;
      }

      void main() {
        vec3 d = normalize(vDir);
        float y = d.y;

        // Atmosphere gradient
        vec3 zenith = vec3(0.012, 0.01, 0.045);
        vec3 mid = vec3(0.07, 0.025, 0.16);
        vec3 horizon = vec3(0.55, 0.12, 0.42);
        vec3 col = mix(horizon, mid, smoothstep(-0.02, 0.18, y));
        col = mix(col, zenith, smoothstep(0.15, 0.85, y));
        // Below the horizon: city haze glow
        vec3 below = mix(vec3(0.42, 0.1, 0.32), vec3(0.08, 0.02, 0.1), smoothstep(-0.02, -0.5, y));
        col = mix(below, col, smoothstep(-0.03, 0.02, y));

        // Nebula
        float n = fbm(d * 2.4 + vec3(uTime * 0.004, 0.0, uTime * 0.002));
        float n2 = fbm(d * 5.0 - vec3(0.0, uTime * 0.003, 0.0));
        float band = exp(-pow((d.y - 0.35 + d.x * 0.35) * 2.6, 2.0));
        vec3 neb = mix(vec3(0.35, 0.05, 0.5), vec3(0.0, 0.45, 0.6), n2);
        col += neb * smoothstep(0.45, 0.85, n) * band * 0.55 * smoothstep(0.0, 0.2, y);

        // Stars (two layers), hidden by nebula density and below horizon
        float starMask = smoothstep(0.02, 0.15, y) * (1.0 - smoothstep(0.5, 0.9, n) * band * 0.7);
        col += starField(d, 220.0, 0.965) * starMask;
        col += starField(d, 520.0, 0.985) * starMask * 0.7;

        // Aurora ribbons
        float aur = 0.0;
        for (int i = 0; i < 3; i++) {
          float fi = float(i);
          float wave = sin(d.x * 6.0 + uTime * 0.15 + fi * 2.1) * 0.05 + sin(d.z * 9.0 - uTime * 0.2 + fi) * 0.03;
          float h = 0.28 + fi * 0.07 + wave;
          float a = exp(-pow((y - h) * 28.0, 2.0)) * smoothstep(0.3, 0.7, vnoise(d * 6.0 + vec3(uTime * 0.1 + fi)));
          aur += a;
        }
        col += vec3(0.1, 0.9, 0.7) * aur * 0.18 * (0.8 + uPulse * 0.6) * smoothstep(-0.3, 0.6, d.z);

        // Gas giant with rings
        vec3 pd = uPlanetDir;
        float cosA = dot(d, pd);
        float R = 0.16;
        float ang = acos(clamp(cosA, -1.0, 1.0));
        vec3 pu = normalize(cross(pd, vec3(0.0, 1.0, 0.0)));
        vec3 pv = cross(pu, pd);
        vec2 local = vec2(dot(d - pd * cosA, pu), dot(d - pd * cosA, pv)) / R;
        // Ring plane, tilted
        float tilt = 0.32;
        vec2 rl = vec2(local.x, local.y / tilt + local.x * 0.25);
        float rr = length(rl);
        float ringBands = smoothstep(1.35, 1.4, rr) * (1.0 - smoothstep(2.3, 2.35, rr));
        ringBands *= 0.55 + 0.45 * sin(rr * 40.0) * sin(rr * 13.0 + 1.0);
        bool ringInFront = rl.y < 0.0 || rr > 1.0;
        if (ang < R) {
          float r2 = length(local);
          vec3 nrm = normalize(vec3(local, sqrt(max(0.0, 1.0 - r2 * r2))));
          float bands = fbm(vec3(local.y * 9.0, local.y * 3.0 + uTime * 0.01, 1.0));
          vec3 surf = mix(vec3(0.6, 0.25, 0.45), vec3(0.95, 0.6, 0.45), bands);
          surf = mix(surf, vec3(0.25, 0.08, 0.3), smoothstep(0.4, 0.8, sin(local.y * 14.0 + bands * 4.0) * 0.5 + 0.5) * 0.4);
          float lit = clamp(dot(nrm, normalize(vec3(-0.6, 0.4, 0.7))), 0.0, 1.0);
          float rim = pow(1.0 - nrm.z, 3.0);
          vec3 pc = surf * (0.08 + lit * 0.9) + vec3(1.0, 0.4, 0.7) * rim * 0.8;
          col = mix(col, pc, smoothstep(R, R * 0.97, ang));
          if (ringInFront && rl.y < 0.0) col = mix(col, vec3(0.9, 0.7, 0.8) * 0.8, ringBands * 0.8);
        } else {
          col += vec3(1.0, 0.35, 0.65) * exp(-(ang - R) * 30.0) * 0.35;
          col = mix(col, vec3(0.85, 0.65, 0.8) * 0.7, ringBands * 0.75 * smoothstep(0.0, 0.05, y + 0.1));
        }

        // Small cold moon
        float m = dot(d, uMoonDir);
        float moon = smoothstep(0.99955, 0.9997, m);
        float crater = fbm(d * 400.0);
        col = mix(col, vec3(0.85, 0.9, 1.0) * (0.75 + crater * 0.3), moon);
        col += vec3(0.5, 0.6, 1.0) * pow(max(m, 0.0), 900.0) * 0.6;
        col += vec3(0.3, 0.35, 0.8) * pow(max(m, 0.0), 40.0) * 0.08;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 32), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}

export function createCloudSea() {
  const uniforms = {
    uTime: { value: 0 },
    uPulse: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime, uPulse;
      varying vec3 vW;
      ${NOISE_GLSL}
      void main() {
        vec2 p = vW.xz * 0.006;
        float n = fbm(vec3(p + vec2(uTime * 0.01, uTime * 0.004), uTime * 0.01));
        float n2 = fbm(vec3(p * 3.0 - vec2(uTime * 0.02, 0.0), 2.0));
        float dens = smoothstep(0.35, 0.75, n * 0.75 + n2 * 0.35);
        float r = length(vW.xz);
        // City glow seeping through the clouds
        float glow = fbm(vec3(vW.xz * 0.02, 5.0));
        vec3 lit = mix(vec3(0.25, 0.05, 0.25), vec3(0.95, 0.35, 0.55), dens);
        lit += vec3(1.0, 0.55, 0.2) * smoothstep(0.55, 0.8, glow) * (1.0 - dens) * 0.6;
        lit += vec3(0.3, 0.1, 0.6) * uPulse * 0.15 * dens;
        float fade = smoothstep(900.0, 250.0, r);
        float alpha = (0.35 + dens * 0.6) * fade;
        gl_FragColor = vec4(lit * (0.35 + dens * 0.5), alpha);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000, 1, 1), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -120;
  mesh.renderOrder = -5;
  return { mesh, uniforms };
}

export { NOISE_GLSL };
