// Wave director: spawns enemies in beat-timed groups, hands out attack tokens
// (so fights stay readable), reserves beat slots for attack impacts, and runs
// the wave -> intermission -> boss flow, then endless mode.
import * as THREE from 'three';
import { Drone } from '../actors/enemies/Drone.js';
import { Duelist, Brute, Lancer } from '../actors/enemies/Humanoids.js';
import { Conductor } from '../actors/enemies/Conductor.js';
import { randomEdgePosition } from '../actors/enemies/Enemy.js';
import { rand, pick, flatDist } from '../core/MathUtil.js';

// Each wave: list of groups. Group = [delayBeatsFromWaveStart, [types...]]
export const WAVES = [
  {
    name: 'OVERTURE', tip: 'Orbs arrive ON THE BEAT. Press [RMB] / [F] as one reaches you to PARRY it back.',
    groups: [[0, ['drone']], [10, ['drone']]], level: 1, tokens: { melee: 1, ranged: 1, heavy: 1 },
  },
  {
    name: 'FIRST MOVEMENT', tip: 'Duelists guard your swings. PARRY their strikes to break posture, then [LMB] to RIPOSTE.',
    groups: [[0, ['duelist']], [12, ['duelist', 'drone']]], level: 1, tokens: { melee: 1, ranged: 1, heavy: 1 },
  },
  {
    name: 'CROSSFIRE', tip: 'Gold lines = parryable charge. A parried Lancer is instantly broken.',
    groups: [[0, ['lancer', 'drone']], [8, ['duelist', 'drone']], [20, ['lancer']]], level: 2, tokens: { melee: 2, ranged: 1, heavy: 1 },
  },
  {
    name: 'HEAVY METAL', tip: 'RED attacks cannot be parried. JUMP [Space] the sweep and quake, or DASH [Shift] through.',
    groups: [[0, ['brute']], [10, ['duelist', 'drone']], [22, ['drone', 'drone']]], level: 2, tokens: { melee: 2, ranged: 2, heavy: 1 },
  },
  {
    name: 'SYNCOPATION', tip: 'Fill Resonance with on-beat parries, then press [Q] for OVERDRIVE.',
    groups: [[0, ['duelist', 'duelist']], [8, ['lancer', 'drone', 'drone']], [20, ['brute', 'duelist']]], level: 3, tokens: { melee: 2, ranged: 2, heavy: 1 },
  },
  {
    name: 'FORTISSIMO', tip: null,
    groups: [[0, ['brute', 'lancer']], [8, ['duelist', 'drone', 'drone']], [18, ['duelist', 'lancer', 'drone']], [30, ['brute']]], level: 3, tokens: { melee: 2, ranged: 2, heavy: 2 },
  },
  {
    name: 'CACOPHONY', tip: null,
    groups: [[0, ['duelist', 'duelist', 'drone']], [8, ['lancer', 'lancer', 'drone']], [16, ['brute', 'drone', 'drone']], [28, ['duelist', 'brute', 'lancer']]], level: 4, tokens: { melee: 3, ranged: 2, heavy: 2 },
  },
  { name: 'THE CONDUCTOR', boss: true, tip: 'Parry the Blade Sonata back on the beat. Jump the laser.', groups: [], level: 4, tokens: { melee: 2, ranged: 2, heavy: 1 } },
];

const CTORS = { drone: Drone, duelist: Duelist, brute: Brute, lancer: Lancer };

export class Director {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  reset() {
    this.waveIndex = -1;
    this.state = 'idle';
    this.timer = 0;
    this.pending = [];
    this.spawnQueue = [];
    this.tokens = new Map();
    this.limits = { melee: 1, ranged: 1, heavy: 1 };
    this.endless = false;
    this.waveTime = 0;
    this.waveKills = 0;
    this.boss = null;
  }

  get wave() {
    return this.endless ? this._endlessWave : WAVES[this.waveIndex];
  }

  get waveNumber() {
    return this.waveIndex + 1;
  }

  start(fromWave = 0) {
    this.waveIndex = fromWave - 1;
    this._intermission(1.5);
  }

  _intermission(t) {
    this.state = 'intermission';
    this.timer = t;
  }

  _beginWave() {
    const g = this.game;
    this.waveIndex++;
    let wave;
    if (this.waveIndex >= WAVES.length) {
      this.endless = true;
      wave = this._makeEndless(this.waveIndex - WAVES.length + 1);
      this._endlessWave = wave;
    } else wave = WAVES[this.waveIndex];
    this.state = 'active';
    this.waveTime = 0;
    this.waveKills = 0;
    this.limits = { ...wave.tokens };
    const spb = g.music.spb;
    this.pending = wave.groups.map(([beats, types]) => ({ t: beats * spb + 0.3, types })).sort((a, b) => a.t - b.t);
    this.spawnQueue = [];
    g.music.queueFill();
    g.sfx.waveStart();
    g.hud.showWave(this.waveNumber, wave.name, wave.tip, !!wave.boss);
    if (wave.boss) {
      g.startBoss();
    } else {
      g.music.setMode('normal');
      g.music.setIntensity(this.waveIndex >= 4 ? 3 : 2);
    }
  }

  _makeEndless(n) {
    const types = ['drone', 'duelist', 'lancer', 'brute'];
    const groups = [];
    const count = 3 + Math.min(6, n);
    for (let i = 0; i < count; i++) {
      const g = [];
      for (let k = 0; k < 2 + Math.floor(n / 3); k++) g.push(pick(types));
      groups.push([i * 8, g]);
    }
    return { name: `ENCORE ${n}`, groups, level: 4 + Math.floor(n / 2), tokens: { melee: 3, ranged: 3, heavy: 2 }, tip: null };
  }

  spawn(type, pos) {
    const g = this.game;
    const E = CTORS[type];
    const e = new E(g, this.wave ? this.wave.level : 1);
    e.place(pos || randomEdgePosition(13, 25, g.player.position, 9));
    g.enemies.push(e);
    return e;
  }

  summonForBoss(phase) {
    const types = phase >= 3 ? ['duelist', 'lancer', 'drone'] : ['duelist', 'drone'];
    for (const t of types) this.spawn(t);
  }

  // ---------------------------------------------------------------- tokens

  requestToken(enemy, kind) {
    if (this.tokens.has(enemy)) return true;
    let n = 0;
    for (const k of this.tokens.values()) if (k === kind) n++;
    const lim = this.limits[kind] ?? 1;
    if (n >= lim) return false;
    this.tokens.set(enemy, kind);
    return true;
  }

  releaseToken(enemy) {
    this.tokens.delete(enemy);
  }

  // ---------------------------------------------------------------- update

  update(dt) {
    const g = this.game;
    // Purge tokens held by dead enemies.
    for (const e of this.tokens.keys()) if (!e.alive) this.tokens.delete(e);

    if (this.state === 'intermission') {
      this.timer -= dt;
      if (this.timer <= 0) this._beginWave();
      return;
    }
    if (this.state !== 'active') return;
    this.waveTime += dt;
    // Groups are released in order; spawn early if the arena is empty so pacing never stalls.
    const aliveCount = g.enemies.filter((e) => e.alive).length;
    if (this.pending.length) {
      const p = this.pending[0];
      if (this.waveTime >= p.t || (aliveCount === 0 && this.spawnQueue.length === 0 && this.waveTime > 1.2)) {
        this.pending.shift();
        p.types.forEach((t, k) => this.spawnQueue.push({ t: this.waveTime + k * g.music.spb * 0.5, type: t }));
      }
    }
    for (let i = this.spawnQueue.length - 1; i >= 0; i--) {
      if (this.waveTime >= this.spawnQueue[i].t) {
        this.spawn(this.spawnQueue[i].type);
        this.spawnQueue.splice(i, 1);
      }
    }
    if (aliveCount === 0 && this.pending.length === 0 && this.spawnQueue.length === 0 && !this.wave.boss && this.waveTime > 2) {
      this._waveCleared();
    }
  }

  _waveCleared() {
    const g = this.game;
    this.state = 'cleared';
    g.onWaveCleared(this.waveNumber);
    this._intermission(4.2);
  }

  bossDefeated() {
    this.state = 'victory';
  }

  continueEndless() {
    this._intermission(3);
  }
}

// Beat-slot reservation so attack impacts line up with the music and don't pile up.
export class Rhythm {
  constructor(music) {
    this.music = music;
    this.slots = new Map();
  }

  reserve(minDelay, subdiv = 1, maxPer = 2) {
    const m = this.music;
    let delay = m.timeToBeat(minDelay, subdiv);
    for (let i = 0; i < 8; i++) {
      const key = Math.round((m.beatPos + delay / m.spb) * 4);
      const n = this.slots.get(key) || 0;
      if (n < maxPer) {
        this.slots.set(key, n + 1);
        return delay;
      }
      delay += m.spb * subdiv;
    }
    return delay;
  }

  update() {
    const now = Math.round(this.music.beatPos * 4);
    for (const k of this.slots.keys()) if (k < now - 8) this.slots.delete(k);
  }
}
