// Top-level orchestrator: owns the renderer, scene, systems and game flow.
import * as THREE from 'three';
import { Time } from './core/Time.js';
import { Input } from './core/Input.js';
import { AudioEngine } from './audio/AudioEngine.js';
import { Music } from './audio/Music.js';
import { Sfx } from './audio/Sfx.js';
import { PostFX } from './render/PostFX.js';
import { CameraRig } from './render/CameraRig.js';
import { Arena, ARENA_RADIUS } from './world/Arena.js';
import { Particles } from './fx/Particles.js';
import { Effects } from './fx/Effects.js';
import { Player } from './actors/Player.js';
import { Projectiles } from './combat/Projectiles.js';
import { Director, Rhythm } from './game/Director.js';
import { Style, RANKS } from './game/Style.js';
import { HUD } from './ui/HUD.js';
import { Conductor } from './actors/enemies/Conductor.js';
import { clamp, damp, flatDist } from './core/MathUtil.js';

export const QUALITY = {
  low: { pixelRatio: 0.75, shadows: false, shadowSize: 1024, bloom: false, particles: 0.5 },
  medium: { pixelRatio: 1, shadows: true, shadowSize: 1024, bloom: true, particles: 0.75 },
  high: { pixelRatio: 1.5, shadows: true, shadowSize: 2048, bloom: true, particles: 1 },
  ultra: { pixelRatio: 2, shadows: true, shadowSize: 4096, bloom: true, particles: 1 },
};

export class Game {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.state = 'title';
    this.quality = QUALITY[settings.quality] || QUALITY.high;

    // Renderer
    const r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    r.setPixelRatio(Math.min(window.devicePixelRatio, this.quality.pixelRatio));
    r.setSize(window.innerWidth, window.innerHeight);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = this.quality.shadows;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.info.autoReset = false; // count draw calls across all passes of a frame
    this.renderer = r;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 2500);
    this.camera.position.set(0, 6, 20);

    // Core systems
    this.time = new Time();
    this.input = new Input(canvas);
    this.input.sensitivity = settings.sensitivity;
    this.input.invertY = settings.invertY;
    this.audio = new AudioEngine();
    this.audio.volumes = { master: settings.master, music: settings.music, sfx: settings.sfx };
    this.music = new Music(this.audio);
    this.sfx = new Sfx(this.audio, this.music);
    this.rhythm = new Rhythm(this.music);

    // World & FX
    this.arena = new Arena(this.scene, r, this.quality);
    this.particles = new Particles(this.scene, 5000);
    this.particles.densityScale = this.quality.particles;
    this.effects = new Effects(this.scene, this.particles, this.arena);
    this.fx = { particles: this.particles, effects: this.effects };
    this.post = new PostFX(r, this.scene, this.camera);
    this.post.setBloom(this.quality.bloom);
    this.post.setSize(window.innerWidth, window.innerHeight, r.getPixelRatio());
    this.cameraRig = new CameraRig(this.camera);
    this.cameraRig.attract = true;

    // Gameplay
    this.enemies = [];
    this.hazards = [];
    this.threats = [];
    this.style = new Style(this);
    this.hud = new HUD(this);
    this.hud.showLane = settings.showLane;
    this.director = new Director(this);
    this.player = new Player(this);
    this.projectiles = new Projectiles(this);
    this.player.position.set(0, 0, 0);

    this.deathTimer = 0;
    this.victoryTimer = 0;
    this.lastBeatIndex = 0;
    this.requireLock = true;
    this.unlockedTime = 0;
    this.heartbeatAcc = 0;
    this.callbacks = {};

    window.addEventListener('resize', () => this.onResize());
    this.input.onPointerLockChange = (locked) => {
      if (!locked && this.state === 'playing') this.pause();
    };
    this._clock = performance.now();
  }

  on(name, fn) {
    this.callbacks[name] = fn;
  }

  emit(name, ...args) {
    if (this.callbacks[name]) this.callbacks[name](...args);
  }

  onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.post.setSize(w, h, this.renderer.getPixelRatio());
  }

  // Must be called from a user gesture (click).
  initAudio() {
    this.audio.init();
    this.audio.resume();
    if (!this.music.playing) {
      this.music.start();
      this.music.setIntensity(0);
    }
  }

  applySettings(s) {
    this.settings = s;
    this.input.sensitivity = s.sensitivity;
    this.input.invertY = s.invertY;
    this.audio.setVolumes({ master: s.master, music: s.music, sfx: s.sfx });
    this.hud.showLane = s.showLane;
    this.music.userLatency = (s.latency || 0) / 1000;
  }

  // ------------------------------------------------------------ game flow

  startGame(fromWave = 0) {
    this.clearWorld();
    this.player.reset();
    this.style.reset();
    this.director.reset();
    this.hud.reset();
    this.hud.show(true);
    this.time.targetEnemyScale = 1;
    this.time.enemyScale = 1;
    this.time.paused = false;
    this.cameraRig.attract = false;
    this.cameraRig.yaw = Math.PI;
    this.cameraRig.pitch = 0.22;
    this.cameraRig.lockTarget = null;
    this.cameraRig.cine = null;
    this.camera.fov = 72;
    this.deathTimer = 0;
    this.victoryTimer = 0;
    this.runTime = 0;
    this.music.setMode('normal');
    this.music.setIntensity(1);
    this.state = 'playing';
    this.director.start(fromWave);
    this.input.requestLock();
  }

  clearWorld() {
    for (const e of this.enemies) e.remove();
    this.enemies.length = 0;
    for (const h of this.hazards) h.dispose();
    this.hazards.length = 0;
    this.projectiles.clear();
    this.effects.clear();
    this.particles.clear();
    this.hud.hideBoss();
    this.boss = null;
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.time.paused = true;
    this.pausedAt = this.audio.now;
    this.audio.setMuffle(0.85);
    this.emit('pause');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.time.paused = false;
    this._resyncToBeat(this.audio.now - (this.pausedAt ?? this.audio.now));
    this.input.requestLock();
    this.emit('resume');
  }

  quitToTitle() {
    this.clearWorld();
    this.state = 'title';
    this.time.paused = false;
    this.hud.show(false);
    this.cameraRig.attract = true;
    this.player.reset();
    this.player.position.set(0, 0, 0);
    this.music.setMode('normal');
    this.music.setIntensity(0);
    this.input.exitLock();
  }

  startBoss() {
    const boss = new Conductor(this);
    boss.place(new THREE.Vector3(0, 0, -12));
    this.enemies.push(boss);
    this.boss = boss;
    this.music.setMode('boss');
    this.music.setIntensity(3);
    this.hud.showBoss(boss);
    this.sfx.bossRoar();
    // Intro shot
    const c = boss.position.clone();
    this.cameraRig.cinematic(2.4,
      (k, out) => out.set(c.x + Math.sin(k * 1.2) * 9, 3 + k * 2, c.z + 10 - k * 3),
      (k, out) => out.set(c.x, 3.5, c.z), 50);
    this.time.slowMo(0.6, 1.2, 2);
  }

  // The music kept playing while paused: push every pending attack back so it
  // lands on the beat grid again.
  _resyncToBeat(pausedFor) {
    if (!this.music.playing || pausedFor <= 0) return;
    const spb = this.music.spb;
    const e = (spb - (pausedFor % spb)) % spb;
    if (e < 0.001) return;
    for (const en of this.enemies) {
      const a = en.attack;
      if (!a || a.resolved) continue;
      a.impactIn += e;
      a.total += e;
      if (a.elapsed !== undefined) a.elapsed -= e;
      if (a.shotTimes) a.shotTimes = a.shotTimes.map((t) => t + e);
    }
    for (const p of this.projectiles.list) if (p.arrival !== null && p.team === 'enemy') p.arrival += e;
  }

  onEnemyKilled(e, cause) {
    this.player.stats.kills++;
    this.style.add(cause === 'riposte' ? 120 : cause === 'reflect' ? 100 : 60, 'kill');
    const pts = Math.round(e.score * (1 + this.style.rankIndex * 0.25));
    this.style.addScore(pts);
    this.hud.damageNumber(e.center.clone().setY(e.position.y + (e.height || 2) + 0.4), '+' + pts, 'score');
    // Final kill of a wave: dramatic slow motion.
    const d = this.director;
    const othersAlive = this.enemies.some((x) => x.alive && x !== e);
    if (!e.isBoss && !othersAlive && d.state === 'active' && d.pending.length === 0 && d.spawnQueue.length === 0 && !d.wave.boss) {
      this.time.slowMo(0.2, 0.7, 2.5);
      this.post.kickZoom(0.8);
      this.post.kickAberration(0.6);
      this.cameraRig.kickFov(-8);
    }
    if (this.cameraRig.lockTarget === e) this.cameraRig.lockTarget = null;
  }

  onWaveCleared(n) {
    this.sfx.waveClear();
    const bonus = 500 * n + Math.round(this.player.hp) * 5;
    this.style.addScore(bonus);
    this.hud.popText('WAVE CLEAR', 'beat', `+${bonus.toLocaleString()} · INTEGRITY RESTORED`);
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + 25);
    this.music.setIntensity(1);
    this.arena.addRipple(this.player.position, 2.5, 0x5ff4ff);
    this.effects.shockwave(this.player.position, { color: 0x5ff4ff, radius: 20, duration: 1.2 });
  }

  onBossDefeated(boss) {
    this.director.bossDefeated();
    this.time.slowMo(0.25, 2.5, 1);
    this.post.flash(0xffffff, 1);
    this.cameraRig.addTrauma(1);
    this.style.addScore(boss.score);
    this.hud.hideBoss();
    this.hud.popText('FINALE', 'riposte', 'THE CONDUCTOR IS SILENCED');
    this.music.setMode('normal');
    this.music.setIntensity(2);
    this.victoryTimer = 4.5;
    this.projectiles.clear();
    for (const e of this.enemies) if (e.alive && !e.isBoss) e.die('boss');
    for (const h of this.hazards) h.dead = true;
  }

  onPlayerDeath() {
    this.deathTimer = 2.8;
    this.music.setIntensity(0);
    this.hud.popText('SILENCED', 'block');
    this.cameraRig.lockTarget = null;
  }

  continueEndless() {
    this.state = 'playing';
    this.time.paused = false;
    this.director.continueEndless();
    this.input.requestLock();
  }

  results(victory) {
    const p = this.player;
    const s = p.stats;
    const beatRatio = s.parries ? s.onBeat / s.parries : 0;
    let gi = clamp(Math.round(this.style.peakRank * 0.55 + beatRatio * 2 + (s.hitsTaken < 6 ? 1 : 0) + (victory ? 1 : 0) - 0.5), 0, 6);
    // A run that ended early can't earn the top grades.
    if (!victory) gi = Math.min(gi, 1 + Math.floor(Math.max(0, this.director.waveIndex) / 2));
    this.lastWaveIndex = this.director.endless ? 0 : Math.max(0, this.director.waveIndex);
    return {
      victory,
      waveIndex: this.director.endless ? -1 : this.director.waveIndex,
      grade: RANKS[gi].id,
      gradeColor: RANKS[gi].color,
      stats: [
        ['SCORE', this.style.score.toLocaleString()],
        ['WAVE', this.director.waveNumber],
        ['PARRIES', s.parries],
        ['ON-BEAT', `${s.onBeat} (${Math.round(beatRatio * 100)}%)`],
        ['RIPOSTES', s.ripostes],
        ['REFLECT KILLS', s.reflects],
        ['MAX COMBO', this.style.maxCombo],
        ['PEAK STYLE', RANKS[this.style.peakRank].name],
        ['KILLS', s.kills],
        ['HITS TAKEN', s.hitsTaken],
        ['TIME', fmtTime(this.runTime || 0)],
      ],
    };
  }

  // -------------------------------------------------------------- helpers

  panFor(pos) {
    const r = this.cameraRig.rightFlat;
    const dx = pos.x - this.camera.position.x, dz = pos.z - this.camera.position.z;
    const d = Math.hypot(dx, dz) || 1;
    return clamp((dx * r.x + dz * r.z) / d, -0.9, 0.9);
  }

  worldToScreen(pos) {
    const v = pos.clone().project(this.camera);
    if (v.z > 1) return null;
    return { x: v.x * 0.5 + 0.5, y: v.y * 0.5 + 0.5 };
  }

  collectThreats() {
    return this.threats;
  }

  _gatherThreats() {
    const out = this.threats;
    out.length = 0;
    if (!this.player.alive) return;
    for (const e of this.enemies) {
      const t = e.threat && e.threat();
      if (t) out.push(t);
    }
    this.projectiles.threats(out);
    for (const h of this.hazards) {
      const t = h.threat();
      if (t) out.push(t);
    }
  }

  mostImminentThreat() {
    let best = null;
    for (const t of this.threats) {
      if (t.time < -0.1) continue;
      if (!best || t.time < best.time) best = t;
    }
    return best;
  }

  spawnQuake(pos, opts) {
    this.hazards.push(new Quake(this, pos, opts));
  }

  // ----------------------------------------------------------------- loop

  frame() {
    this.frameCount = (this.frameCount || 0) + 1;
    const now = performance.now();
    const rawDt = Math.min(0.05, (now - this._clock) / 1000);
    this._clock = now;
    this.update(rawDt);
    this.renderer.info.reset();
    this.post.render(rawDt);
    this.input.endFrame();
  }

  // Advance the simulation without rendering (used by automated tests).
  simulate(seconds, step = 1 / 60) {
    const n = Math.round(seconds / step);
    this.simulating = this.audio.fakeNow === undefined;
    for (let i = 0; i < n; i++) {
      this.update(step);
      this.input.endFrame();
    }
    this.simulating = false;
  }

  update(rawDt) {
    if (this.bot) this._botThink();
    this.input.update(this.time.real, rawDt);
    // Attack timers follow the audio clock so impacts stay locked to the music
    // even when the frame rate dips.
    const an = this.audio.now;
    let clockDt = rawDt;
    if (this.audio.running && !this.simulating && this._lastAudio !== undefined) clockDt = clamp(an - this._lastAudio, 0, 0.25);
    this._lastAudio = an;
    this.time.update(rawDt, clockDt);
    const dt = this.time.dt;
    const edt = this.time.enemyDt;

    if (this.state === 'playing' || this.state === 'dead' || this.state === 'victory') {
      this.runTime = (this.runTime || 0) + (this.state === 'playing' ? rawDt : 0);
      // If the pointer lock was refused or lost, pause and ask for a click.
      const inp = this.input;
      inp.freeLook = this.state === 'playing' && !inp.locked && inp.lockFailed;
      if (inp.freeLook && !this._freeLookTipShown) {
        this._freeLookTipShown = true;
        this.hud.showTip('Mouse lock is unavailable here. Aim with the cursor and push it to the screen edge to turn. For the full experience, open the game in its own browser tab.', 8);
      }
      if (this.state === 'playing' && this.requireLock && !this.bot && !inp.locked && !inp.lockFailed) {
        this.unlockedTime += rawDt;
        if (this.unlockedTime > 0.8) {
          this.unlockedTime = 0;
          // Never managed to lock at all: fall back to free-cursor play.
          if (!inp.everLocked) inp.lockFailed = true;
          else this.pause();
        }
      } else this.unlockedTime = 0;
      if (this.state === 'playing') {
        const [dx, dy] = this.input.takeLook();
        if (!this.cameraRig.cine) this.cameraRig.look(dx, dy);
        if (this.input.pressed('lock')) {
          if (this.cameraRig.lockTarget) this.cameraRig.lockTarget = null;
          else this.cameraRig.lockTarget = this.player.findTarget(25);
        }
        if (this.input.pressed('pause')) {
          this.input.exitLock();
          this.pause();
        }
      } else this.input.takeLook();

      this.player.update(dt);
      for (const e of this.enemies) e.update(edt);
      for (let i = this.enemies.length - 1; i >= 0; i--) if (this.enemies[i].removed) this.enemies.splice(i, 1);
      this.projectiles.update(dt, edt);
      for (const h of this.hazards) h.update(edt);
      for (let i = this.hazards.length - 1; i >= 0; i--) if (this.hazards[i].dead) { this.hazards[i].dispose(); this.hazards.splice(i, 1); }
      if (this.state === 'playing') this.director.update(dt);
      this.rhythm.update();
      this._gatherThreats();
      const inCombat = this.enemies.some((e) => e.alive);
      this.style.update(dt, inCombat);
      this._updateMusic(inCombat);

      if (this.deathTimer > 0) {
        this.deathTimer -= rawDt;
        if (this.deathTimer <= 0 && this.state !== 'dead') {
          this.state = 'dead';
          this.input.exitLock();
          this.emit('results', this.results(false));
        }
      }
      if (this.victoryTimer > 0) {
        this.victoryTimer -= rawDt;
        if (this.victoryTimer <= 0 && this.state === 'playing') {
          this.state = 'victory';
          this.input.exitLock();
          this.emit('results', this.results(true));
        }
      }
      // Low-health heartbeat on the beat.
      if (this.player.alive && this.player.hp < 30) {
        const bi = Math.floor(this.music.beatPos / 2);
        if (bi !== this.lastBeatIndex) { this.lastBeatIndex = bi; this.sfx.heartbeat(); }
      }
    } else if (this.state === 'title') {
      // Attract mode: the ronin performs a sword kata in time with the music.
      this.input.takeLook();
      this._titleKata();
      this.player._updateVisuals(rawDt);
    }

    this.effects.update(dt, rawDt, this.camera);
    this.particles.update(dt);
    const kick = this.music.playing ? this.music.kickEnvelope() : 0;
    const snare = this.music.playing ? this.music.snareEnvelope() : 0;
    const spectrum = this.audio.ctx ? this.audio.getSpectrum() : null;
    const danger = this.threats.some((t) => t.unblockable && t.time < 1.2) ? 1 : 0;
    this.arena.update(rawDt, {
      time: this.time.real, beatPhase: this.music.playing ? this.music.beatPhase : (this.time.real * 2.13) % 1,
      kick, snare, spectrum, playerPos: this.player.position, danger, overdrive: this.player.overdriveActive ? 1 : 0, camera: this.camera,
    });
    if (this.state !== 'paused') this.cameraRig.update(rawDt, this.player);
    const slow = this.time.slowAmount;
    this.audio.setMuffle(this.state === 'paused' ? 0.85 : slow * 0.8);
    this.post.update(rawDt, {
      time: this.time.real, slow, lowHp: this.player.alive && this.player.hp < 30 ? 1 : 0,
      overdrive: this.player.overdriveActive ? 1 : 0, death: this.player.dead ? clamp(this.player.stateTime / 1.5, 0, 0.9) : 0,
      pulse: kick, bloomBoost: kick * 0.12,
    });
    if (this.state === 'playing' || this.state === 'dead' || this.state === 'victory' || this.state === 'paused') this.hud.update(rawDt);
  }

  // Simple autoplayer for automated testing: parries imminent parryable
  // threats, jumps unblockable ones and ripostes broken enemies.
  _botThink() {
    const p = this.player;
    if (!p.alive || this.state !== 'playing') return;
    const th = this.mostImminentThreat();
    const inp = this.input;
    if (th && th.time < 0.09 && th.time > -0.02) {
      if (th.parryable && p.parryWindow <= 0 && p.parryCooldown <= 0) inp._press('parry');
      else if (th.unblockable && p.grounded) inp._press('jump');
    } else {
      inp.down.parry = false;
      inp.down.jump = false;
    }
    const rt = p.findTarget(7.5, true);
    const tgt = p.findTarget(30);
    const safe = !th || th.time > 0.6;
    if (rt && Math.random() < 0.2) inp._press('attack');
    else if (this.bot === 'fight' && tgt && safe && flatDist(tgt.position, p.position) < 3.5 && Math.random() < 0.15) inp._press('attack');
    else inp.down.attack = false;
    // Walk toward the nearest enemy (camera-relative input).
    if (this.bot === 'fight' && tgt) {
      this.cameraRig.yaw = Math.atan2(tgt.position.x - p.position.x, tgt.position.z - p.position.z);
      inp.down.up = flatDist(tgt.position, p.position) > 2.8;
    }
  }

  _titleKata() {
    if (!this.music.playing) return;
    const beat = Math.floor(this.music.beatPos);
    if (beat === this._kataBeat || beat % 2) return;
    this._kataBeat = beat;
    const p = this.player;
    const moves = ['attack1', 'attack2', 'attack3', 'parry'];
    const m = moves[(beat / 2) % moves.length];
    p.yaw += 0.6;
    const f = p.forward;
    const pos = p.position.clone().setY(1.1).addScaledVector(f, 0.2);
    if (m === 'parry') {
      p.anim.play('parryHit', 0.4);
      this.particles.sparks(pos.clone().addScaledVector(f, 0.5).setY(1.4), f, { count: 30, color: 0xffd34a, speed: 12, life: 0.4, size: 0.05 });
      this.effects.shockwave(pos.clone().addScaledVector(f, 0.6).setY(1.4), { color: 0xffd34a, radius: 1.6, duration: 0.35, vertical: true });
      this.arena.addRipple(p.position, 1, 0xffd34a);
    } else {
      p.anim.play(m, m === 'attack3' ? 0.6 : 0.42);
      p.trail.emitting = true;
      setTimeout(() => (p.trail.emitting = false), 250);
      const roll = m === 'attack3' ? Math.PI / 2 - 0.15 : m === 'attack2' ? 0.15 : -0.12;
      setTimeout(() => this.effects.slash(pos, p.yaw, { color: 0x5ff4ff, radius: 3, roll, mirror: m === 'attack2', duration: 0.2 }), m === 'attack3' ? 160 : 70);
      if (m === 'attack3') this.arena.addRipple(p.position.clone().addScaledVector(f, 2), 0.8, 0x5ff4ff);
    }
  }

  _updateMusic(inCombat) {
    if (!this.music.playing) return;
    const p = this.player;
    if (p.dead) return;
    if (this.boss && this.boss.alive) {
      this.music.setIntensity(p.overdriveActive || this.boss.phase >= 3 ? 4 : 3);
      return;
    }
    if (p.overdriveActive) { this.music.setIntensity(4); return; }
    if (!inCombat) { this.music.setIntensity(1); return; }
    const n = this.enemies.filter((e) => e.alive).length;
    let I = 2;
    if (this.style.rankIndex >= 3 || n >= 4 || this.director.waveIndex >= 4) I = 3;
    this.music.setIntensity(I);
  }
}

// Expanding shockwave ring that travels along the floor. Jump it.
class Quake {
  constructor(game, pos, { speed = 12, maxR = 18, damage = 16, color = 0xff8a1f } = {}) {
    this.game = game;
    this.pos = pos.clone().setY(0);
    this.r = 0.5;
    this.speed = speed;
    this.maxR = maxR;
    this.damage = damage;
    this.color = color;
    this.dead = false;
    this.hit = false;
    const geo = new THREE.CylinderGeometry(1, 1, 1, 96, 1, true);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uFade: { value: 1 }, uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 uColor; uniform float uFade, uTime; varying vec2 vUv;
        void main(){
          float a = pow(1.0 - vUv.y, 2.0) * uFade;
          a *= 0.75 + 0.25 * sin(vUv.x * 300.0 + uTime * 20.0);
          gl_FragColor = vec4(mix(uColor, vec3(1.0), (1.0 - vUv.y) * 0.4) * a * 2.5, a);
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.copy(this.pos);
    this.mesh.renderOrder = 11;
    game.scene.add(this.mesh);
    this.t = 0;
  }

  update(dt) {
    const g = this.game;
    this.t += dt;
    this.r += this.speed * dt;
    const fade = clamp(1 - (this.r - this.maxR * 0.7) / (this.maxR * 0.3), 0, 1);
    this.mesh.scale.set(this.r, 0.7, this.r);
    this.mesh.material.uniforms.uFade.value = fade;
    this.mesh.material.uniforms.uTime.value = this.t;
    if (Math.random() < 0.8) {
      const a = Math.random() * Math.PI * 2;
      g.particles.emit({ x: this.pos.x + Math.cos(a) * this.r, y: 0.1, z: this.pos.z + Math.sin(a) * this.r, vx: Math.cos(a) * 4, vy: 4 + Math.random() * 4, vz: Math.sin(a) * 4, color: g.particles._c.set(this.color), life: 0.4, size: 0.08, gravity: 14, stretch: 0.06, drag: 1 });
    }
    const p = g.player;
    if (!this.hit && p.alive) {
      const d = flatDist(p.position, this.pos);
      if (Math.abs(d - this.r) < 0.7 && p.position.y < 0.7) {
        const res = p.receiveAttack({ damage: this.damage, unblockable: true, sourcePos: this.pos, knockback: 8, launch: 7 });
        if (res === 'hit') this.hit = true;
      } else if (d < this.r - 0.8 && !this.passed) {
        this.passed = true;
        if (p.position.y >= 0.7) g.style.add(40, 'evade');
      }
    }
    if (this.r > this.maxR || this.r > ARENA_RADIUS + 1) this.dead = true;
  }

  threat() {
    const p = this.game.player;
    const d = flatDist(p.position, this.pos);
    if (d < this.r || this.hit) return null;
    return { time: (d - this.r) / this.speed, parryable: false, unblockable: true, source: this.pos, kind: 'quake' };
  }

  dispose() {
    this.game.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

function fmtTime(s) {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, '0')}`;
}
