// Post-processing stack: bloom -> tone mapping -> a custom "impact" pass that
// does chromatic aberration, radial zoom blur, slow-motion grading, damage
// vignette, flashes, film grain and scanline shimmer.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { damp } from '../core/MathUtil.js';

const ImpactShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uAberration: { value: 0 },
    uZoomBlur: { value: 0 },
    uCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uSlow: { value: 0 },
    uDamage: { value: 0 },
    uLowHp: { value: 0 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 1, 1) },
    uOverdrive: { value: 0 },
    uGrain: { value: 0.05 },
    uVignette: { value: 0.35 },
    uDeath: { value: 0 },
    uPulse: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uAberration, uZoomBlur, uSlow, uDamage, uLowHp, uFlash, uOverdrive, uGrain, uVignette, uDeath, uPulse;
    uniform vec2 uRes, uCenter;
    uniform vec3 uFlashColor;
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

    vec3 sampleCA(vec2 uv, float amt) {
      vec2 dir = uv - uCenter;
      float r = texture2D(tDiffuse, uv + dir * amt).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv - dir * amt).b;
      return vec3(r, g, b);
    }

    void main() {
      vec2 uv = vUv;
      vec2 toC = uv - uCenter;
      float dist = length((uv - 0.5) * vec2(uRes.x / uRes.y, 1.0));

      // Base chromatic aberration grows towards the edges.
      float ca = 0.0025 + uAberration * 0.035 + uSlow * 0.004;
      ca *= smoothstep(0.0, 0.9, dist + 0.2);
      vec3 col = sampleCA(uv, ca);

      // Radial zoom blur (dash, parry, riposte)
      if (uZoomBlur > 0.001) {
        vec3 acc = col;
        float tot = 1.0;
        for (int i = 1; i <= 10; i++) {
          float s = 1.0 - float(i) * 0.012 * uZoomBlur;
          float w = 1.0 - float(i) / 11.0;
          acc += sampleCA(uCenter + toC * s, ca) * w;
          tot += w;
        }
        col = acc / tot;
      }

      float luma = dot(col, vec3(0.299, 0.587, 0.114));

      // Slow-motion: cool desaturated grade with crushed shadows.
      vec3 slowCol = mix(vec3(luma), col, 0.35) * vec3(0.85, 0.95, 1.15);
      col = mix(col, slowCol, uSlow * 0.75);

      // Overdrive: hot magenta/gold split-tone.
      vec3 od = mix(vec3(0.9, 0.2, 0.7) * luma * 1.4, vec3(1.0, 0.85, 0.4) * luma * 1.6, smoothstep(0.2, 0.8, luma));
      col = mix(col, max(col, od), uOverdrive * 0.55);

      // Death: drain colour.
      col = mix(col, vec3(luma) * vec3(1.1, 0.85, 0.85), uDeath);

      // Vignette, damage and low-health pulse.
      float vig = smoothstep(0.35, 1.05, dist);
      col *= 1.0 - vig * (uVignette + uSlow * 0.35 + uDeath * 0.4);
      float lowHp = uLowHp * (0.55 + 0.45 * sin(uTime * 7.0));
      col = mix(col, vec3(0.8, 0.0, 0.05), vig * clamp(uDamage * 0.9 + lowHp * 0.6, 0.0, 0.9));

      // Beat pulse gently lifts the edges.
      col += vec3(0.25, 0.1, 0.5) * vig * uPulse * 0.12;

      // Flash
      col = mix(col, uFlashColor, clamp(uFlash, 0.0, 1.0) * 0.85);

      // Scanline shimmer + grain.
      float scan = sin(uv.y * uRes.y * 1.5 + uTime * 30.0) * 0.012 * (0.4 + uAberration);
      col += scan;
      float n = hash(uv * uRes + fract(uTime * 13.7) * 100.0) - 0.5;
      col += n * uGrain;

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.composer = new EffectComposer(renderer);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.75, 0.5, 0.7);
    this.composer.addPass(this.bloom);
    this.output = new OutputPass();
    this.composer.addPass(this.output);
    this.impact = new ShaderPass(ImpactShader);
    this.composer.addPass(this.impact);

    this.state = {
      aberration: 0, zoomBlur: 0, flash: 0, damage: 0, pulse: 0,
    };
    this.flashColor = new THREE.Color();
    this.u = this.impact.uniforms;
    this.bloomEnabled = true;
    this.baseBloom = 0.75;
  }

  setSize(w, h, pr) {
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.u.uRes.value.set(w * pr, h * pr);
  }

  setBloom(enabled) {
    this.bloomEnabled = enabled;
    this.bloom.enabled = enabled;
  }

  // --- event kicks ---
  kickAberration(a) { this.state.aberration = Math.max(this.state.aberration, a); }
  kickZoom(z) { this.state.zoomBlur = Math.max(this.state.zoomBlur, z); }
  flash(color, amount) {
    this.flashColor.set(color);
    this.u.uFlashColor.value.copy(this.flashColor);
    this.state.flash = Math.max(this.state.flash, amount);
  }
  hurt(amount) { this.state.damage = Math.min(1.2, this.state.damage + amount); }

  setCenter(x, y) { this.u.uCenter.value.set(x, y); }

  update(rawDt, { time, slow, lowHp, overdrive, death, pulse, bloomBoost }) {
    const s = this.state;
    s.aberration = damp(s.aberration, 0, 7, rawDt);
    s.zoomBlur = damp(s.zoomBlur, 0, 6, rawDt);
    s.flash = damp(s.flash, 0, 14, rawDt);
    s.damage = damp(s.damage, 0, 2.5, rawDt);
    const u = this.u;
    u.uTime.value = time;
    u.uAberration.value = s.aberration;
    u.uZoomBlur.value = s.zoomBlur;
    u.uFlash.value = s.flash;
    u.uDamage.value = s.damage;
    u.uSlow.value = slow;
    u.uLowHp.value = lowHp;
    u.uOverdrive.value = overdrive;
    u.uDeath.value = death;
    u.uPulse.value = pulse;
    u.uCenter.value.x = damp(u.uCenter.value.x, 0.5, 3, rawDt);
    u.uCenter.value.y = damp(u.uCenter.value.y, 0.5, 3, rawDt);
    this.bloom.strength = this.baseBloom + bloomBoost + overdrive * 0.35 + s.flash * 0.6;
  }

  render(dt) {
    this.composer.render(dt);
  }
}
