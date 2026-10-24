// Global clock with hit-stop (freeze frames) and slow motion.
// Player and enemies can run at different speeds (Overdrive slows enemies only).
import { damp } from './MathUtil.js';

export class Time {
  constructor() {
    this.rawDt = 0;
    this.dt = 0;           // scaled delta for the player / world
    this.enemyDt = 0;      // additionally scaled for enemies (Overdrive)
    this.elapsed = 0;      // scaled time
    this.real = 0;         // unscaled time
    this.scale = 1;
    this.enemyScale = 1;
    this.targetEnemyScale = 1;
    this.hitstop = 0;
    this.slowTimer = 0;
    this.slowScale = 1;
    this.slowRecover = 8;
    this.paused = false;
  }

  hitStop(duration) {
    this.hitstop = Math.max(this.hitstop, duration);
  }

  // Briefly slow everything down; recovers smoothly when the timer ends.
  slowMo(scale, duration, recover = 8) {
    if (this.slowTimer > 0 && scale > this.slowScale) {
      this.slowTimer = Math.max(this.slowTimer, duration * 0.5);
      return;
    }
    this.slowScale = scale;
    this.slowTimer = duration;
    this.slowRecover = recover;
    this.scale = Math.min(this.scale, scale);
  }

  get slowAmount() {
    return 1 - this.scale;
  }

  update(rawDt) {
    rawDt = Math.min(rawDt, 1 / 20);
    this.rawDt = rawDt;
    this.real += rawDt;
    if (this.paused) {
      this.dt = 0;
      this.enemyDt = 0;
      return;
    }
    let target = 1;
    if (this.slowTimer > 0) {
      this.slowTimer -= rawDt;
      target = this.slowScale;
      this.scale = damp(this.scale, target, 30, rawDt);
    } else {
      this.scale = damp(this.scale, target, this.slowRecover, rawDt);
      if (this.scale > 0.995) this.scale = 1;
    }
    let s = this.scale;
    if (this.hitstop > 0) {
      this.hitstop -= rawDt;
      s *= 0.04;
    }
    this.enemyScale = damp(this.enemyScale, this.targetEnemyScale, 6, rawDt);
    this.dt = rawDt * s;
    this.enemyDt = this.dt * this.enemyScale;
    this.elapsed += this.dt;
  }
}
