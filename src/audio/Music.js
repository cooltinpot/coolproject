// Procedural, adaptive soundtrack. A look-ahead step sequencer schedules
// synthesized drums, bass, arps, pads and leads on the Web Audio clock.
// Enemy attacks are quantized to this beat grid, so the music is also the
// game's timing reference: parry on the beat for bonus Resonance.
import { midiToFreq } from './AudioEngine.js';

const BPM = 128;

// Chord = bass root + voice-led triad.
const PROGRESSIONS = {
  normal: [
    { root: 38, tones: [62, 65, 69] }, // Dm
    { root: 34, tones: [62, 65, 70] }, // Bb
    { root: 41, tones: [60, 65, 69] }, // F
    { root: 36, tones: [60, 64, 67] }, // C
  ],
  boss: [
    { root: 38, tones: [62, 65, 69] }, // Dm
    { root: 43, tones: [62, 67, 70] }, // Gm
    { root: 34, tones: [62, 65, 70] }, // Bb
    { root: 33, tones: [61, 64, 69] }, // A
  ],
};

// [step, midi, lengthInSteps] per bar.
const LEADS = {
  normal: [
    [[0, 74, 2], [2, 77, 2], [4, 81, 3], [7, 79, 1], [8, 77, 2], [10, 76, 2], [12, 74, 4]],
    [[0, 74, 2], [2, 77, 2], [4, 82, 3], [7, 81, 1], [8, 79, 2], [10, 77, 2], [12, 77, 2], [14, 79, 2]],
    [[0, 81, 3], [3, 79, 1], [4, 77, 2], [6, 76, 2], [8, 77, 2], [10, 81, 2], [12, 84, 4]],
    [[0, 84, 2], [2, 82, 2], [4, 81, 2], [6, 79, 2], [8, 76, 4], [12, 79, 2], [14, 81, 2]],
  ],
  boss: [
    [[0, 74, 1], [1, 74, 1], [2, 86, 2], [4, 84, 1], [5, 81, 1], [6, 77, 2], [8, 74, 1], [9, 74, 1], [10, 81, 2], [12, 79, 2], [14, 77, 2]],
    [[0, 79, 1], [1, 79, 1], [2, 86, 2], [4, 84, 1], [5, 82, 1], [6, 79, 2], [8, 74, 2], [10, 82, 2], [12, 81, 2], [14, 79, 2]],
    [[0, 82, 2], [2, 81, 2], [4, 77, 2], [6, 74, 2], [8, 77, 1], [9, 79, 1], [10, 81, 2], [12, 82, 4]],
    [[0, 81, 2], [2, 73, 2], [4, 76, 2], [6, 81, 2], [8, 85, 4], [12, 88, 2], [14, 85, 2]],
  ],
};

const ARP_PATTERNS = [
  [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1, 2, 3],
  [0, 2, 1, 3, 2, 4, 3, 5, 4, 3, 2, 1, 0, 2, 1, 3],
];

export class Music {
  constructor(engine) {
    this.e = engine;
    this.bpm = BPM;
    this.spb = 60 / BPM;
    this.stepDur = this.spb / 4;
    this.playing = false;
    this.mode = 'normal';
    this.pendingMode = 'normal';
    this.intensity = 0;
    this.pendingIntensity = 0;
    this.step = 0;
    this.kickTimes = [];
    this.snareTimes = [];
    this.fillQueued = false;
    this.riserQueued = false;
    this.stopping = false;
    this.lastBar = 0;
    this._timer = null;
    this.userLatency = 0;
  }

  start() {
    if (this.playing || !this.e.ctx) return;
    this.playing = true;
    this.e.setDelayTime(this.spb * 0.75);
    this.startTime = this.e.now + 0.12;
    this.nextStepTime = this.startTime;
    this.step = 0;
    this._timer = setInterval(() => this._schedule(), 25);
    this._schedule();
  }

  setIntensity(i) {
    this.pendingIntensity = Math.max(0, Math.min(4, Math.round(i)));
  }

  setMode(mode) {
    this.pendingMode = mode;
  }

  // Snare roll + noise riser into the next bar (used before waves).
  queueFill() {
    this.fillQueued = true;
  }

  // --- beat clock --------------------------------------------------------

  // The musical position the player is hearing right now, in beats.
  get beatPos() {
    if (!this.playing) return 0;
    return (this.e.now - this.e.latency - this.userLatency - this.startTime) / this.spb;
  }

  // Seconds until the next grid line (in beats) that is at least minDelay away.
  timeToBeat(minDelay, subdiv = 1) {
    if (!this.playing) return Math.max(minDelay, this.spb);
    const pos = this.beatPos + minDelay / this.spb;
    const target = Math.ceil(pos / subdiv - 1e-4) * subdiv;
    return (target - this.beatPos) * this.spb;
  }

  // Absolute beat index for an event `delay` seconds from now.
  beatIndexIn(delay, subdiv = 1) {
    return Math.round((this.beatPos + delay / this.spb) / subdiv) * subdiv;
  }

  // Signed offset (seconds) from the nearest beat. 0 = exactly on the beat.
  beatOffset() {
    const p = this.beatPos;
    return (p - Math.round(p)) * this.spb;
  }

  get beatPhase() {
    const p = this.beatPos;
    return p - Math.floor(p);
  }

  // 1 right on a kick, decaying quickly afterwards: drives visuals.
  kickEnvelope() {
    const now = this.e.now - this.e.latency;
    let last = -10;
    for (const t of this.kickTimes) if (t <= now && t > last) last = t;
    const d = now - last;
    return d < 0 ? 0 : Math.exp(-d * 7);
  }

  snareEnvelope() {
    const now = this.e.now - this.e.latency;
    let last = -10;
    for (const t of this.snareTimes) if (t <= now && t > last) last = t;
    const d = now - last;
    return d < 0 ? 0 : Math.exp(-d * 9);
  }

  currentChord() {
    const prog = PROGRESSIONS[this.mode];
    const bar = Math.floor(Math.max(0, this.beatPos) / 4);
    return prog[bar % prog.length];
  }

  // --- sequencer ----------------------------------------------------------

  _schedule() {
    const ctx = this.e.ctx;
    if (!ctx || ctx.state !== 'running') {
      // Keep the grid anchored while suspended.
      if (ctx && this.nextStepTime < ctx.currentTime) {
        const behind = Math.ceil((ctx.currentTime - this.nextStepTime) / this.stepDur);
        this.nextStepTime += behind * this.stepDur;
        this.step += behind;
      }
      return;
    }
    // Recover if the tab was backgrounded.
    if (this.nextStepTime < ctx.currentTime - 0.2) {
      const behind = Math.ceil((ctx.currentTime - this.nextStepTime) / this.stepDur);
      this.nextStepTime += behind * this.stepDur;
      this.step += behind;
    }
    while (this.nextStepTime < ctx.currentTime + 0.12) {
      this._playStep(this.step, this.nextStepTime);
      this.nextStepTime += this.stepDur;
      this.step++;
    }
    const cutoff = ctx.currentTime - 2;
    this.kickTimes = this.kickTimes.filter((t) => t > cutoff);
    this.snareTimes = this.snareTimes.filter((t) => t > cutoff);
  }

  _playStep(step, t) {
    const s = step % 16;
    const bar = Math.floor(step / 16);
    if (s === 0) {
      this.intensity = this.pendingIntensity;
      this.mode = this.pendingMode;
      this.lastBar = bar;
    }
    const I = this.intensity;
    const boss = this.mode === 'boss';
    const prog = PROGRESSIONS[this.mode];
    const chord = prog[bar % prog.length];
    const barInPhrase = bar % 4;
    const fillBar = this.fillQueued && s >= 8;

    // ---- drums ----
    if (I >= 1) {
      if (s % 4 === 0 && !(fillBar && s >= 12)) this.kick(t, 1);
      if (boss && I >= 3 && (s === 14 || s === 7) && barInPhrase % 2 === 1) this.kick(t, 0.75);
    } else if (s === 0) {
      this.kick(t, 0.55);
    }
    if (I >= 2 && (s === 4 || s === 12)) {
      this.snare(t, 1);
      if (I >= 3) this.clap(t, 0.7);
    }
    if (I >= 3 && barInPhrase === 3 && (s === 13 || s === 15)) this.snare(t, 0.35);
    if (fillBar) {
      const v = 0.3 + ((s - 8) / 8) * 0.7;
      this.snare(t, v);
      if (s >= 12) this.snare(t + this.stepDur / 2, v * 0.8);
    }
    if (I >= 1) {
      if (s % 4 === 2) this.hat(t, 0.55, false);
      if (I >= 2 && s % 2 === 1) this.hat(t, 0.22, false);
      if (I >= 2 && s % 4 === 0) this.hat(t, 0.3, false);
      if (I >= 3 && (s === 6 || s === 14)) this.hat(t, 0.4, true);
      if (I >= 4 && s % 2 === 0) this.shaker(t, 0.3);
    }
    if (s === 0 && barInPhrase === 0 && I >= 2) this.crash(t, I >= 3 ? 0.5 : 0.3);

    // ---- bass ----
    if (I >= 1) {
      if (boss) {
        // Galloping offbeat bass.
        if (s % 4 !== 0) this.bass(t, chord.root + (s % 4 === 2 ? 12 : 0), this.stepDur * 0.9, I);
      } else {
        const pat = [1, 0, 1, 1, 0, 0, 1, 0, 1, 0, 1, 1, 0, 0, 1, 0];
        if (pat[s]) {
          const oct = s === 3 || s === 11 ? 12 : 0;
          this.bass(t, chord.root + oct, this.stepDur * (pat[s + 1] ? 0.9 : 1.6), I);
        }
      }
    } else if (s === 0) {
      this.bass(t, chord.root, this.spb * 3.5, 0, 0.6);
    }

    // ---- pad ----
    if (s === 0 && I <= 3) this.pad(t, chord.tones, this.spb * 4, I === 0 ? 0.11 : 0.075);

    // ---- arp ----
    const arpEvery = I >= 2 ? 1 : 2;
    if (s % arpEvery === 0) {
      const pat = ARP_PATTERNS[boss ? 1 : 0];
      const idx = pat[s];
      const tones = chord.tones;
      const note = tones[idx % 3] + 12 * Math.floor(idx / 3) + (I >= 3 ? 12 : 0);
      this.pluck(t, note, I === 0 ? 0.05 : 0.07, I);
    }

    // ---- lead ----
    if (I >= 3) {
      const phrase = LEADS[this.mode][barInPhrase];
      for (const [st, m, len] of phrase) {
        if (st === s) this.lead(t, m, len * this.stepDur, boss ? 0.085 : 0.075);
      }
    }

    // ---- stabs (overdrive / boss climax) ----
    if (I >= 4 && (s === 0 || s === 3 || s === 6 || s === 10)) {
      this.stab(t, chord.tones, 0.06);
    }

    if (s === 15 && this.fillQueued) {
      this.fillQueued = false;
      this.impact(t + this.stepDur);
    }
    if (s === 0 && this.fillQueued) this.riser(t, this.spb * 4);
  }

  // --- instruments ---------------------------------------------------------

  kick(t, vel) {
    const { ctx } = this.e;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.11);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.4);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.95 * vel, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    const sh = ctx.createWaveShaper();
    sh.curve = SOFT_CLIP;
    o.connect(g);
    g.connect(sh);
    sh.connect(this.e.musicIn);
    o.start(t);
    o.stop(t + 0.45);
    // Click transient
    const n = this.e.noiseSource(t, 0.02);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3000;
    const ng = ctx.createGain();
    this.e.env(ng.gain, t, 0.001, 0.25 * vel, 0.015);
    n.connect(hp); hp.connect(ng); ng.connect(this.e.musicIn);
    // Sidechain duck
    const d = this.e.duck.gain;
    d.cancelScheduledValues(t);
    d.setValueAtTime(1, t);
    d.linearRampToValueAtTime(0.28, t + 0.01);
    d.linearRampToValueAtTime(1, t + this.spb * 0.55);
    this.kickTimes.push(t);
  }

  snare(t, vel) {
    const { ctx } = this.e;
    const n = this.e.noiseSource(t, 0.25);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1900;
    bp.Q.value = 0.7;
    const g = ctx.createGain();
    this.e.env(g.gain, t, 0.001, 0.42 * vel, 0.19);
    n.connect(bp); bp.connect(g); g.connect(this.e.musicIn);
    g.connect(this.e.reverbSend);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    const og = ctx.createGain();
    this.e.env(og.gain, t, 0.001, 0.35 * vel, 0.1);
    o.connect(og); og.connect(this.e.musicIn);
    o.start(t); o.stop(t + 0.15);
    if (vel > 0.6) this.snareTimes.push(t);
  }

  clap(t, vel) {
    const { ctx } = this.e;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1300;
    bp.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.011;
      g.gain.setValueAtTime(0.32 * vel, tt);
      g.gain.exponentialRampToValueAtTime(0.03, tt + 0.009);
    }
    g.gain.setValueAtTime(0.25 * vel, t + 0.034);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    const n = this.e.noiseSource(t, 0.25);
    n.connect(bp); bp.connect(g); g.connect(this.e.musicIn);
    g.connect(this.e.reverbSend);
  }

  hat(t, vel, open) {
    const { ctx } = this.e;
    const n = this.e.noiseSource(t, open ? 0.3 : 0.06);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = open ? 6500 : 8000;
    const g = ctx.createGain();
    this.e.env(g.gain, t, 0.001, 0.34 * vel, open ? 0.24 : 0.045);
    const p = ctx.createStereoPanner();
    p.pan.value = open ? 0.2 : -0.25;
    n.connect(hp); hp.connect(g); g.connect(p); p.connect(this.e.musicIn);
  }

  shaker(t, vel) {
    const { ctx } = this.e;
    const n = this.e.noiseSource(t, 0.08);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 10000;
    bp.Q.value = 1.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.2 * vel, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    const p = ctx.createStereoPanner();
    p.pan.value = 0.4;
    n.connect(bp); bp.connect(g); g.connect(p); p.connect(this.e.musicIn);
  }

  crash(t, vel) {
    const { ctx } = this.e;
    const n = this.e.noiseSource(t, 1.6, 0.9);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 4500;
    const g = ctx.createGain();
    this.e.env(g.gain, t, 0.002, 0.22 * vel, 1.5);
    n.connect(hp); hp.connect(g); g.connect(this.e.musicIn);
    g.connect(this.e.reverbSend);
  }

  bass(t, midi, dur, I, level = 1) {
    const { ctx } = this.e;
    const f = midiToFreq(midi);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 7;
    const peak = 300 + I * 420;
    lp.frequency.setValueAtTime(140, t);
    lp.frequency.exponentialRampToValueAtTime(peak, t + 0.012);
    lp.frequency.exponentialRampToValueAtTime(150, t + Math.min(dur, 0.25));
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.25 * level, t + 0.006);
    g.gain.setValueAtTime(0.21 * level, t + dur * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    for (const det of [-9, 9]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(lp);
      o.start(t); o.stop(t + dur + 0.1);
    }
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = f / 2;
    const sg = ctx.createGain();
    sg.gain.value = 0.55;
    sub.connect(sg); sg.connect(g);
    sub.start(t); sub.stop(t + dur + 0.1);
    lp.connect(g);
    g.connect(this.e.duck);
  }

  pad(t, tones, dur, vol) {
    const { ctx } = this.e;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1100, t);
    lp.frequency.linearRampToValueAtTime(3200, t + dur * 0.5);
    lp.frequency.linearRampToValueAtTime(1500, t + dur);
    lp.Q.value = 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.35);
    g.gain.setValueAtTime(vol, t + dur - 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.6);
    for (const m of tones) {
      for (const det of [-14, 0, 13]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = midiToFreq(m - 12);
        o.detune.value = det + (Math.random() - 0.5) * 4;
        o.connect(lp);
        o.start(t); o.stop(t + dur + 0.7);
      }
    }
    lp.connect(g);
    g.connect(this.e.duck);
    const rs = ctx.createGain();
    rs.gain.value = 0.6;
    g.connect(rs); rs.connect(this.e.reverbSend);
  }

  pluck(t, midi, vol, I) {
    const { ctx } = this.e;
    const o = ctx.createOscillator();
    o.type = I >= 2 ? 'sawtooth' : 'square';
    o.frequency.value = midiToFreq(midi);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 4;
    lp.frequency.setValueAtTime(2200 + I * 1200, t);
    lp.frequency.exponentialRampToValueAtTime(500, t + 0.18);
    const g = ctx.createGain();
    this.e.env(g.gain, t, 0.002, vol, 0.2);
    const p = ctx.createStereoPanner();
    p.pan.value = Math.sin(t * 3.1) * 0.5;
    o.connect(lp); lp.connect(g); g.connect(p); p.connect(this.e.musicIn);
    const ds = ctx.createGain();
    ds.gain.value = 0.45;
    g.connect(ds); ds.connect(this.e.delaySend);
    o.start(t); o.stop(t + 0.25);
  }

  lead(t, midi, dur, vol) {
    const { ctx } = this.e;
    const f = midiToFreq(midi);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 2;
    lp.frequency.setValueAtTime(5000, t);
    lp.frequency.exponentialRampToValueAtTime(1800, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.setValueAtTime(vol * 0.8, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.5;
    const vg = ctx.createGain();
    vg.gain.setValueAtTime(0, t);
    vg.gain.linearRampToValueAtTime(dur > 0.2 ? 12 : 0, t + dur);
    vib.connect(vg);
    for (const [type, det] of [['sawtooth', -6], ['square', 6], ['sawtooth', 1200]]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = det;
      vg.connect(o.detune);
      const og = ctx.createGain();
      og.gain.value = det === 1200 ? 0.25 : 0.5;
      o.connect(og); og.connect(lp);
      o.start(t); o.stop(t + dur + 0.1);
    }
    vib.start(t); vib.stop(t + dur + 0.1);
    lp.connect(g);
    g.connect(this.e.musicIn);
    const ds = ctx.createGain();
    ds.gain.value = 0.5;
    g.connect(ds); ds.connect(this.e.delaySend);
    const rs = ctx.createGain();
    rs.gain.value = 0.35;
    g.connect(rs); rs.connect(this.e.reverbSend);
  }

  stab(t, tones, vol) {
    const { ctx } = this.e;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(6000, t);
    lp.frequency.exponentialRampToValueAtTime(600, t + 0.2);
    const g = ctx.createGain();
    this.e.env(g.gain, t, 0.003, vol, 0.22);
    for (const m of tones) {
      for (const det of [-20, 0, 20]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = midiToFreq(m);
        o.detune.value = det;
        o.connect(lp);
        o.start(t); o.stop(t + 0.3);
      }
    }
    lp.connect(g); g.connect(this.e.musicIn);
    g.connect(this.e.reverbSend);
  }

  riser(t, dur) {
    const { ctx } = this.e;
    const n = this.e.noiseSource(t, dur);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 3;
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(9000, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + dur);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.02);
    n.connect(bp); bp.connect(g); g.connect(this.e.musicIn);
  }

  impact(t) {
    const { ctx } = this.e;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(28, t + 1.2);
    const g = ctx.createGain();
    this.e.env(g.gain, t, 0.005, 0.7, 1.3);
    o.connect(g); g.connect(this.e.musicIn);
    o.start(t); o.stop(t + 1.4);
    this.crash(t, 1);
  }
}

const SOFT_CLIP = (() => {
  const n = 1024;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(x * 1.6) / Math.tanh(1.6);
  }
  return c;
})();
