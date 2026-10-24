// Third-person over-the-shoulder camera with trauma-based shake, FOV kicks,
// soft lock-on tracking and scripted cinematic shots (ripostes, boss intro).
import * as THREE from 'three';
import { clamp, damp, dampAngle, noise1, yawTo, lerp, easeInOutCubic } from '../core/MathUtil.js';

const UP = new THREE.Vector3(0, 1, 0);

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;
    this.pitch = 0.22;
    this.distance = 5.4;
    this.targetDistance = 5.4;
    this.shoulder = 0.75;
    this.baseFov = 72;
    this.fovKick = 0;
    this.zoomKick = 0;
    this.trauma = 0;
    this.roll = 0;
    this.pivot = new THREE.Vector3(0, 1.6, 0);
    this.smoothPos = new THREE.Vector3(0, 3, -6);
    this.lookAtPos = new THREE.Vector3();
    this.lockTarget = null;
    this.cine = null;
    this.time = 0;
    this.attract = false;
    this._f = new THREE.Vector3();
    this._r = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this._l = new THREE.Vector3();
  }

  get forwardFlat() {
    return this._f.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  get rightFlat() {
    return this._r.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
  }

  addTrauma(a) {
    this.trauma = Math.min(1, this.trauma + a);
  }

  kickFov(a) {
    this.fovKick = Math.max(this.fovKick, a);
  }

  kickZoom(a) {
    this.zoomKick = Math.min(this.zoomKick, -a);
  }

  // Scripted camera move; posFn/lookFn receive normalized progress.
  cinematic(duration, posFn, lookFn, fov = 55) {
    this.cine = { t: 0, duration, posFn, lookFn, fov };
  }

  look(dx, dy) {
    this.yaw -= dx;
    this.pitch = clamp(this.pitch + dy, -0.55, 1.15);
  }

  snapBehind(yaw) {
    this.yaw = yaw;
  }

  update(rawDt, player) {
    this.time += rawDt;
    const cam = this.camera;

    if (this.attract) {
      // Slow orbit for the title screen.
      const t = this.time * 0.08;
      this._p.set(Math.sin(t) * 19, 6.5 + Math.sin(t * 0.7) * 2.5, Math.cos(t) * 19);
      cam.position.lerp(this._p, 1 - Math.exp(-2 * rawDt));
      cam.lookAt(0, 2.2, 0);
      cam.fov = damp(cam.fov, 60, 3, rawDt);
      cam.updateProjectionMatrix();
      return;
    }

    if (this.cine) {
      const c = this.cine;
      c.t += rawDt;
      const k = clamp(c.t / c.duration, 0, 1);
      c.posFn(k, this._p);
      c.lookFn(k, this._l);
      cam.position.copy(this._p);
      cam.lookAt(this._l);
      cam.fov = damp(cam.fov, c.fov, 10, rawDt);
      this._applyShake(rawDt);
      cam.updateProjectionMatrix();
      if (k >= 1) {
        this.cine = null;
        this.smoothPos.copy(cam.position);
      }
      return;
    }

    // Lock-on: steer yaw to keep the target framed.
    if (this.lockTarget && this.lockTarget.alive) {
      const want = yawTo(player.position, this.lockTarget.position);
      this.yaw = dampAngle(this.yaw, want, 7, rawDt);
      const d = Math.hypot(this.lockTarget.position.x - player.position.x, this.lockTarget.position.z - player.position.z);
      const dh = this.lockTarget.position.y + (this.lockTarget.lockHeight || 1) - (player.position.y + 1.6);
      const wantPitch = clamp(0.2 - Math.atan2(dh, Math.max(d, 2)) * 0.7, -0.2, 0.7);
      this.pitch = damp(this.pitch, wantPitch, 4, rawDt);
    } else if (this.lockTarget) {
      this.lockTarget = null;
    }

    // Pivot follows the player with a little vertical lag for weight.
    const p = player.position;
    this.pivot.x = damp(this.pivot.x, p.x, 22, rawDt);
    this.pivot.z = damp(this.pivot.z, p.z, 22, rawDt);
    this.pivot.y = damp(this.pivot.y, p.y + 1.55, 9, rawDt);

    this.distance = damp(this.distance, this.targetDistance + this.zoomKick, 6, rawDt);
    this.zoomKick = damp(this.zoomKick, 0, 4, rawDt);

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const fwd = this._f.set(Math.sin(this.yaw) * cp, -sp, Math.cos(this.yaw) * cp);
    const right = this._r.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    // Pull in when looking up so the camera doesn't sink into the floor.
    const dist = this.distance * (this.pitch < 0 ? lerp(1, 0.6, -this.pitch / 0.55) : 1);
    const pos = this._p.copy(this.pivot).addScaledVector(fwd, -dist).addScaledVector(right, this.shoulder);
    if (pos.y < 0.35) pos.y = 0.35;
    cam.position.copy(pos);
    this.lookAtPos.copy(this.pivot).addScaledVector(right, this.shoulder).addScaledVector(fwd, 10);
    cam.lookAt(this.lookAtPos);

    this.fovKick = damp(this.fovKick, 0, 5, rawDt);
    cam.fov = damp(cam.fov, this.baseFov + this.fovKick, 14, rawDt);
    this._applyShake(rawDt);
    cam.updateProjectionMatrix();
  }

  _applyShake(rawDt) {
    const cam = this.camera;
    this.trauma = Math.max(0, this.trauma - rawDt * 1.6);
    const s = this.trauma * this.trauma;
    if (s > 0.0001) {
      const t = this.time * 28;
      cam.position.x += noise1(t) * s * 0.45;
      cam.position.y += noise1(t + 37) * s * 0.45;
      cam.position.z += noise1(t + 71) * s * 0.45;
      cam.rotateZ(noise1(t + 113) * s * 0.06);
    }
  }
}

// Helpers for building cinematic shots.
export function orbitShot(center, radius, height, yawFrom, yawTo2, lookOffsetY = 1.2) {
  return {
    pos: (k, out) => {
      const e = easeInOutCubic(k);
      const a = lerp(yawFrom, yawTo2, e);
      return out.set(center.x + Math.sin(a) * radius, center.y + height, center.z + Math.cos(a) * radius);
    },
    look: (k, out) => out.set(center.x, center.y + lookOffsetY, center.z),
  };
}

export { UP };
