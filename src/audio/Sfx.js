// Synthesized sound effects. Everything is built from oscillators and noise,
// panned in stereo relative to the camera. Perfect parries ring out a chime
// harmonized with whatever chord the soundtrack is playing.
import { midiToFreq } from './AudioEngine.js';

export class Sfx {
  constructor(engine, music) {
    this.e = engine;
    this.music = music;
    this.lastPlayed = {};
  }

  get ok() {
    return this.e.ctx && this.e.ctx.state === 'running';
  }

  // Rate-limit identical sounds so crowds don't clip.
  _gate(name, gap) {
    const now = this.e.now;
    if (this.lastPlayed[name] && now - this.lastPlayed[name] < gap) return false;
    this.lastPlayed[name] = now;
    return true;
  }

  _out(pan = 0, vol = 1, reverb = 0.25) {
    const { ctx } = this.e;
    const g = ctx.createGain();
    g.gain.value = vol;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p);
    p.connect(this.e.sfxGain);
    if (reverb > 0) {
      const r = ctx.createGain();
      r.gain.value = reverb;
      p.connect(r);
      r.connect(this.e.sfxReverbSend);
    }
    return g;
  }

  _osc(type, freq, t, dur, dest, gainPeak, attack = 0.002, endFreq = null) {
    const { ctx } = this.e;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    const g = ctx.createGain();
    this.e.env(g.gain, t, attack, gainPeak, dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
    return o;
  }

  _noise(t, dur, dest, peak, type = 'bandpass', f0 = 2000, f1 = null, q = 1, attack = 0.002) {
    const { ctx } = this.e;
    const n = this.e.noiseSource(t, dur + attack);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    this.e.env(g.gain, t, attack, peak, dur);
    n.connect(f); f.connect(g); g.connect(dest);
  }

  // Metallic ring built from inharmonic partials (bell / blade physics).
  _metal(t, base, dest, vol, decay) {
    const ratios = [1, 2.76, 5.4, 8.93, 13.34];
    ratios.forEach((r, i) => {
      this._osc('sine', base * r, t, decay / (1 + i * 0.7), dest, (vol / (1 + i * 0.5)) * 0.5, 0.001);
    });
  }

  // ---------------------------------------------------------------------

  parry({ pan = 0, onBeat = false, chain = 0 } = {}) {
    if (!this.ok) return;
    const t = this.e.now;
    const out = this._out(pan, 1, 0.55);
    // Transient crack
    this._noise(t, 0.05, out, 0.9, 'highpass', 5000, null, 0.7);
    this._noise(t, 0.12, out, 0.5, 'bandpass', 3200, 9000, 2);
    // Low body thump
    this._osc('sine', 180, t, 0.18, out, 0.7, 0.001, 50);
    // Ringing steel, pitched up with parry chains
    const base = 900 * Math.pow(2, Math.min(chain, 6) / 12);
    this._metal(t, base, out, 0.55, 0.9);
    this._metal(t + 0.004, base * 1.007, out, 0.3, 0.7);
    // Shimmer up-sweep
    this._osc('triangle', 2400, t + 0.01, 0.35, out, 0.12, 0.005, 5200);
    if (onBeat) this.chime(pan);
  }

  // Bright arpeggiated chime in the soundtrack's current chord.
  chime(pan = 0) {
    if (!this.ok) return;
    const t = this.e.now;
    const out = this._out(pan * 0.5, 0.9, 0.8);
    const tones = this.music.currentChord().tones;
    tones.forEach((m, i) => {
      const f = midiToFreq(m + 24);
      const tt = t + i * 0.035;
      this._osc('sine', f, tt, 0.9, out, 0.16, 0.002);
      this._osc('triangle', f * 2, tt, 0.4, out, 0.05, 0.002);
    });
  }

  // Raising the guard: a short airy swish with a faint steel tick.
  guard() {
    if (!this.ok || !this._gate('guard', 0.05)) return;
    const t = this.e.now;
    const out = this._out(0, 0.45, 0.1);
    this._noise(t, 0.09, out, 0.35, 'bandpass', 2500, 5500, 1.5, 0.01);
    this._osc('sine', 2600, t + 0.01, 0.06, out, 0.05, 0.001);
  }

  block({ pan = 0 } = {}) {
    if (!this.ok) return;
    const t = this.e.now;
    const out = this._out(pan, 0.9, 0.2);
    this._noise(t, 0.09, out, 0.8, 'bandpass', 1400, 600, 1.2);
    this._osc('square', 220, t, 0.12, out, 0.18, 0.001, 110);
    this._metal(t, 420, out, 0.25, 0.25);
  }

  clash({ pan = 0 } = {}) {
    if (!this.ok || !this._gate('clash', 0.04)) return;
    const t = this.e.now;
    const out = this._out(pan, 0.7, 0.3);
    this._noise(t, 0.06, out, 0.6, 'highpass', 4000);
    this._metal(t, 1300 + Math.random() * 200, out, 0.3, 0.35);
  }

  swing(combo = 0, { heavy = false } = {}) {
    if (!this.ok) return;
    const t = this.e.now;
    const out = this._out((combo % 2 ? 0.25 : -0.25), 0.8, 0.15);
    const f0 = (heavy ? 500 : 900 + combo * 200) * (0.92 + Math.random() * 0.16);
    this._noise(t, heavy ? 0.28 : 0.18, out, heavy ? 0.6 : 0.42, 'bandpass', f0, f0 * 4, 1.6, 0.03);
    this._osc('sine', heavy ? 260 : 420, t, 0.16, out, 0.06, 0.04, heavy ? 120 : 200);
  }

  hit({ pan = 0, heavy = false, crit = false } = {}) {
    if (!this.ok || !this._gate('hit', 0.025)) return;
    const t = this.e.now;
    const out = this._out(pan, heavy ? 1 : 0.8, 0.2);
    const v = 0.9 + Math.random() * 0.2;
    this._noise(t, 0.08, out, 0.9, 'lowpass', 3500 * v, 400, 0.8);
    this._osc('sine', (heavy ? 140 : 190) * v, t, heavy ? 0.25 : 0.14, out, 0.8, 0.001, 45);
    this._osc('sawtooth', 90, t, 0.07, out, 0.15, 0.001, 40);
    if (crit) this._noise(t, 0.3, out, 0.4, 'bandpass', 6000, 2000, 2);
  }

  enemyGuard({ pan = 0 } = {}) {
    if (!this.ok || !this._gate('eguard', 0.05)) return;
    const t = this.e.now;
    const out = this._out(pan, 0.7, 0.3);
    this._noise(t, 0.05, out, 0.6, 'highpass', 3000);
    this._metal(t, 640, out, 0.3, 0.3);
  }

  death({ pan = 0, big = false } = {}) {
    if (!this.ok) return;
    const t = this.e.now;
    const out = this._out(pan, big ? 1.1 : 0.85, 0.5);
    this._noise(t, big ? 1.4 : 0.7, out, 0.9, 'lowpass', 5000, 120, 0.7);
    this._osc('sine', 120, t, big ? 1.2 : 0.6, out, 0.9, 0.002, 26);
    this._osc('square', 1800, t, 0.25, out, 0.08, 0.001, 120);
    // Glassy shatter
    for (let i = 0; i < 6; i++) {
      this._osc('sine', 2500 + Math.random() * 4000, t + Math.random() * 0.12, 0.25, out, 0.04, 0.001);
    }
  }

  dash() {
    if (!this.ok) return;
    const t = this.e.now;
    const out = this._out(0, 0.7, 0.1);
    this._noise(t, 0.25, out, 0.5, 'bandpass', 600, 4000, 1.2, 0.02);
    this._osc('sine', 300, t, 0.2, out, 0.12, 0.01, 900);
  }

  jump(double = false) {
    if (!this.ok) return;
    const t = this.e.now;
    const out = this._out(0, 0.5, 0.1);
    this._noise(t, 0.12, out, 0.35, 'bandpass', 1200, 3000, 1, 0.01);
    if (double) this._osc('triangle', 500, t, 0.18, out, 0.15, 0.005, 1400);
  }

  land(heavy = false) {
    if (!this.ok || !this._gate('land', 0.1)) return;
    const t = this.e.now;
    const out = this._out(0, heavy ? 0.6 : 0.35, 0.05);
    this._osc('sine', 110, t, 0.12, out, 0.6, 0.001, 50);
    this._noise(t, 0.08, out, 0.25, 'lowpass', 1200);
  }

  step() {
    if (!this.ok || !this._gate('step', 0.12)) return;
    const t = this.e.now;
    const out = this._out((Math.random() - 0.5) * 0.2, 0.18, 0);
    this._noise(t, 0.04, out, 0.4, 'bandpass', 900 + Math.random() * 300, null, 2);
    this._osc('sine', 80, t, 0.05, out, 0.3, 0.001, 50);
  }

  shoot({ pan = 0, vol = 1 } = {}) {
    if (!this.ok || !this._gate('shoot', 0.03)) return;
    const t = this.e.now;
    const out = this._out(pan, 0.5 * vol, 0.25);
    this._osc('square', 1400, t, 0.15, out, 0.18, 0.001, 300);
    this._osc('sine', 700, t, 0.2, out, 0.25, 0.001, 200);
  }

  reflect({ pan = 0 } = {}) {
    if (!this.ok) return;
    const t = this.e.now;
    const out = this._out(pan, 0.7, 0.4);
    this._osc('sawtooth', 300, t, 0.25, out, 0.18, 0.001, 2400);
    this._osc('sine', 600, t, 0.3, out, 0.25, 0.001, 3000);
  }

  // Warning cue that an attack is incoming. Unblockable attacks get a harsher sound.
  telegraph({ pan = 0, unblockable = false, vol = 1 } = {}) {
    if (!this.ok || !this._gate(unblockable ? 'tele-u' : 'tele', 0.06)) return;
    const t = this.e.now;
    const out = this._out(pan, 0.55 * vol, 0.4);
    if (unblockable) {
      this._osc('sawtooth', 220, t, 0.32, out, 0.22, 0.01);
      this._osc('sawtooth', 233, t, 0.32, out, 0.22, 0.01);
      this._osc('square', 110, t, 0.32, out, 0.12, 0.01);
    } else {
      // Bright "glint" ting
      this._osc('sine', 3200, t, 0.35, out, 0.22, 0.001);
      this._osc('sine', 4800, t, 0.2, out, 0.1, 0.001);
    }
  }

  hurt() {
    if (!this.ok) return;
    const t = this.e.now;
    const out = this._out(0, 1, 0.2);
    this._noise(t, 0.25, out, 0.9, 'lowpass', 2000, 200, 1);
    this._osc('sawtooth', 160, t, 0.3, out, 0.4, 0.001, 50);
    this._osc('square', 80, t, 0.25, out, 0.2, 0.001, 40);
  }

  riposte() {
    if (!this.ok) return;
    const t = this.e.now;
    const out = this._out(0, 1.2, 0.8);
    // Reverse-swell into a huge strike
    this._noise(t, 0.35, out, 0.5, 'bandpass', 300, 6000, 2, 0.3);
    const t2 = t + 0.32;
    this._noise(t2, 0.5, out, 1, 'lowpass', 8000, 300, 0.7);
    this._osc('sine', 160, t2, 0.9, out, 1, 0.001, 30);
    this._metal(t2, 700, out, 0.6, 1.4);
    this._metal(t2, 1050, out, 0.4, 1.1);
  }

  overdrive() {
    if (!this.ok) return;
    const t = this.e.now;
    const out = this._out(0, 1, 0.8);
    this._noise(t, 0.6, out, 0.5, 'bandpass', 200, 9000, 2, 0.4);
    const t2 = t + 0.6;
    this._osc('sine', 100, t2, 1.2, out, 1, 0.001, 30);
    this._noise(t2, 1, out, 0.6, 'lowpass', 9000, 300);
    this.music.currentChord().tones.forEach((m, i) => {
      this._osc('sawtooth', midiToFreq(m + 12), t2 + i * 0.05, 1.2, out, 0.08, 0.003);
    });
  }

  overdriveEnd() {
    if (!this.ok) return;
    const t = this.e.now;
    const out = this._out(0, 0.6, 0.5);
    this._osc('sawtooth', 900, t, 0.6, out, 0.12, 0.01, 120);
  }

  resonanceFull() {
    if (!this.ok) return;
    const t = this.e.now;
    const out = this._out(0, 0.6, 0.7);
    [0, 7, 12, 19].forEach((s, i) => {
      this._osc('triangle', 587.33 * Math.pow(2, s / 12), t + i * 0.06, 0.5, out, 0.15, 0.003);
    });
  }

  spawn({ pan = 0 } = {}) {
    if (!this.ok || !this._gate('spawn', 0.08)) return;
    const t = this.e.now;
    const out = this._out(pan, 0.45, 0.6);
    this._noise(t, 0.5, out, 0.3, 'bandpass', 4000, 300, 3, 0.1);
    this._osc('sine', 60, t + 0.1, 0.5, out, 0.6, 0.02, 40);
  }

  explosion({ pan = 0, vol = 1 } = {}) {
    if (!this.ok || !this._gate('boom', 0.05)) return;
    const t = this.e.now;
    const out = this._out(pan, vol, 0.5);
    this._noise(t, 0.9, out, 1, 'lowpass', 3000, 90, 0.8);
    this._osc('sine', 90, t, 0.8, out, 0.9, 0.001, 25);
  }

  slam({ pan = 0 } = {}) {
    if (!this.ok) return;
    const t = this.e.now;
    const out = this._out(pan, 1, 0.5);
    this._osc('sine', 70, t, 0.9, out, 1, 0.001, 22);
    this._noise(t, 0.5, out, 0.8, 'lowpass', 1800, 100, 0.5);
  }

  laser({ pan = 0, dur = 1 } = {}) {
    if (!this.ok) return;
    const t = this.e.now;
    const out = this._out(pan, 0.6, 0.4);
    this._osc('sawtooth', 110, t, dur, out, 0.25, 0.05);
    this._osc('sawtooth', 112, t, dur, out, 0.25, 0.05);
    this._noise(t, dur, out, 0.2, 'bandpass', 2400, 1200, 4, 0.05);
  }

  charge({ pan = 0 } = {}) {
    if (!this.ok) return;
    const t = this.e.now;
    const out = this._out(pan, 0.5, 0.3);
    this._osc('sawtooth', 120, t, 0.6, out, 0.2, 0.3, 500);
  }

  bossRoar() {
    if (!this.ok) return;
    const t = this.e.now;
    const out = this._out(0, 1, 0.9);
    for (const f of [55, 82.4, 110, 164.8]) this._osc('sawtooth', f, t, 2.2, out, 0.14, 0.4, f * 0.6);
    this._noise(t, 2, out, 0.4, 'bandpass', 400, 120, 2, 0.4);
  }

  heartbeat() {
    if (!this.ok) return;
    const t = this.e.now;
    const out = this._out(0, 0.7, 0);
    this._osc('sine', 60, t, 0.15, out, 0.8, 0.005, 40);
    this._osc('sine', 55, t + 0.18, 0.18, out, 0.6, 0.005, 38);
  }

  ui(kind = 'click') {
    if (!this.ok) return;
    const t = this.e.now;
    const out = this._out(0, 0.4, 0.1);
    if (kind === 'hover') this._osc('sine', 1800, t, 0.05, out, 0.1, 0.001);
    else this._osc('triangle', 900, t, 0.1, out, 0.25, 0.001, 1600);
  }

  waveStart() {
    if (!this.ok) return;
    const t = this.e.now;
    const out = this._out(0, 0.8, 0.8);
    [0, 5, 7, 12].forEach((s, i) => this._osc('sawtooth', 293.66 * Math.pow(2, s / 12), t + i * 0.08, 0.45, out, 0.08, 0.01));
  }

  waveClear() {
    if (!this.ok) return;
    const t = this.e.now;
    const out = this._out(0, 0.8, 0.8);
    [0, 4, 7, 12, 16].forEach((s, i) => this._osc('triangle', 587.33 * Math.pow(2, s / 12), t + i * 0.07, 0.7, out, 0.12, 0.004));
  }

  rankUp(level) {
    if (!this.ok) return;
    const t = this.e.now;
    const out = this._out(0, 0.5, 0.5);
    const f = 440 * Math.pow(2, level / 6);
    this._osc('square', f, t, 0.12, out, 0.08, 0.002);
    this._osc('square', f * 1.5, t + 0.06, 0.18, out, 0.08, 0.002);
  }
}
