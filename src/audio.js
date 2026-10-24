// Procedural WebAudio sound effects and ambient music. No audio files.

const MATERIAL_SOUND = {
  stone: { type: 'bandpass', f: 1400, q: 1.2, dur: 0.09, vol: 0.5 },
  wood: { type: 'bandpass', f: 420, q: 3, dur: 0.1, vol: 0.7, tone: 180 },
  grass: { type: 'highpass', f: 2500, q: 0.5, dur: 0.12, vol: 0.35 },
  gravel: { type: 'bandpass', f: 900, q: 0.6, dur: 0.12, vol: 0.5 },
  sand: { type: 'lowpass', f: 2600, q: 0.5, dur: 0.12, vol: 0.35 },
  snow: { type: 'lowpass', f: 1800, q: 0.4, dur: 0.12, vol: 0.3 },
  cloth: { type: 'lowpass', f: 700, q: 0.4, dur: 0.12, vol: 0.4 },
  glass: { type: 'highpass', f: 3500, q: 2, dur: 0.15, vol: 0.4, tone: 2400 },
  metal: { type: 'bandpass', f: 2200, q: 6, dur: 0.15, vol: 0.4, tone: 1300 },
};

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.volume = 0.6;
    this.musicVolume = 0.35;
    this.listener = { x: 0, y: 0, z: 0 };
    this.nextNote = 30;
    this.musicTime = 0;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicVolume;
      this.musicGain.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { this.ctx = null; }
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
  setMusicVolume(v) { this.musicVolume = v; if (this.musicGain) this.musicGain.gain.value = v; }

  attenuate(pos) {
    if (!pos) return 1;
    const dx = pos.x - this.listener.x, dy = pos.y - this.listener.y, dz = pos.z - this.listener.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return Math.max(0, 1 - d / 24);
  }

  noise(dur, filterType, freq, q, vol, when = 0, pitchMod = 1) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = pitchMod;
    const f = c.createBiquadFilter();
    f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    const t = c.currentTime + when;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }

  tone(freq, dur, type = 'sine', vol = 0.3, when = 0, slideTo = null, dest = null) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    const t = c.currentTime + when;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(dest || this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  block(kind, material, pos) {
    if (!this.ctx) return;
    const m = MATERIAL_SOUND[material] || MATERIAL_SOUND.stone;
    const a = this.attenuate(pos);
    if (a <= 0) return;
    const scale = kind === 'step' ? 0.35 : kind === 'hit' ? 0.3 : 1;
    const dur = kind === 'break' ? m.dur * 1.6 : m.dur;
    const pm = 0.8 + Math.random() * 0.4;
    this.noise(dur, m.type, m.f * pm, m.q, m.vol * scale * a, 0, pm);
    if (m.tone && kind !== 'step') this.tone(m.tone * pm, dur * 0.8, 'triangle', 0.15 * scale * a);
    if (material === 'glass' && kind === 'break') {
      for (let i = 0; i < 4; i++) this.tone(2000 + Math.random() * 2500, 0.2, 'sine', 0.08 * a, i * 0.03);
    }
  }

  play(name, pos) {
    if (!this.ctx) return;
    const a = this.attenuate(pos);
    if (a <= 0) return;
    switch (name) {
      case 'hurt': this.tone(320, 0.18, 'square', 0.12 * a, 0, 160); this.noise(0.1, 'lowpass', 900, 1, 0.2 * a); break;
      case 'pop': this.tone(600 + Math.random() * 400, 0.08, 'sine', 0.18 * a, 0, 1400); break;
      case 'click': this.tone(900, 0.04, 'square', 0.06); break;
      case 'explode':
        this.noise(1.6, 'lowpass', 500, 0.7, 1.0 * a, 0, 0.5);
        this.noise(0.6, 'lowpass', 1600, 0.7, 0.6 * a, 0, 0.8);
        this.tone(60, 1.0, 'sine', 0.6 * a, 0, 25);
        break;
      case 'fizz': this.noise(0.5, 'highpass', 3000, 0.6, 0.3 * a); break;
      case 'eat': for (let i = 0; i < 3; i++) this.noise(0.07, 'bandpass', 1800 + Math.random() * 600, 1, 0.3, i * 0.11); break;
      case 'burp': this.tone(140, 0.25, 'sawtooth', 0.12, 0, 90); break;
      case 'splash': this.noise(0.5, 'lowpass', 1500, 0.5, 0.4 * a); break;
      case 'fuse': this.noise(1.2, 'highpass', 4000, 0.4, 0.25 * a); break;
      case 'pig': this.tone(180 + Math.random() * 40, 0.18, 'sawtooth', 0.1 * a, 0, 120); this.tone(200, 0.12, 'sawtooth', 0.08 * a, 0.2, 140); break;
      case 'cow': this.tone(110, 0.8, 'sawtooth', 0.12 * a, 0, 85); break;
      case 'sheep': { for (let i = 0; i < 5; i++) this.tone(380 + (i % 2) * 30, 0.08, 'sawtooth', 0.07 * a, i * 0.07); break; }
      case 'zombie': this.tone(90, 0.9, 'sawtooth', 0.1 * a, 0, 70); this.noise(0.8, 'lowpass', 400, 1, 0.12 * a); break;
      case 'creeper_hiss': this.noise(1.4, 'highpass', 2500, 0.3, 0.35 * a); break;
      case 'chicken': this.tone(1200, 0.06, 'square', 0.05 * a, 0, 900); this.tone(1100, 0.06, 'square', 0.05 * a, 0.1, 800); break;
      case 'skeleton': for (let i = 0; i < 3; i++) this.noise(0.05, 'bandpass', 2500, 4, 0.2 * a, i * 0.07); break;
      case 'bow': this.noise(0.25, 'bandpass', 600, 1, 0.35 * a, 0, 1.4); break;
      case 'arrow_hit': this.noise(0.08, 'bandpass', 1600, 2, 0.3 * a); break;
      case 'thunder':
        this.noise(3.5, 'lowpass', 300, 0.6, 0.9, 0, 0.35);
        this.noise(1.2, 'lowpass', 900, 0.5, 0.5, 0.05, 0.6);
        this.tone(45, 2.5, 'sine', 0.4, 0, 30);
        break;
      case 'mob_hurt': this.tone(260, 0.15, 'sawtooth', 0.12 * a, 0, 140); break;
      case 'death': this.tone(220, 0.5, 'sawtooth', 0.12 * a, 0, 60); break;
      case 'door': this.noise(0.15, 'bandpass', 500, 2, 0.4 * a); break;
      case 'levelup': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.15, i * 0.08)); break;
      case 'ignite': this.noise(0.2, 'highpass', 2000, 1, 0.3 * a); this.tone(1800, 0.05, 'square', 0.05 * a); break;
      case 'bucket': this.noise(0.25, 'bandpass', 700, 2, 0.35 * a); break;
    }
  }

  // Continuous rain noise; level 0..1
  rain(level) {
    if (!this.ctx) return;
    if (!this.rainSrc && level > 0.01) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf; src.loop = true;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400;
      const f2 = this.ctx.createBiquadFilter(); f2.type = 'highpass'; f2.frequency.value = 300;
      this.rainGain = this.ctx.createGain(); this.rainGain.gain.value = 0;
      src.connect(f); f.connect(f2); f2.connect(this.rainGain); this.rainGain.connect(this.master);
      src.start();
      this.rainSrc = src;
    }
    if (this.rainGain) this.rainGain.gain.setTargetAtTime(level * 0.18, this.ctx.currentTime, 0.3);
  }

  // Sparse, calm generative piano.
  updateMusic(dt) {
    if (!this.ctx || this.musicVolume <= 0) return;
    this.musicTime += dt;
    if (this.musicTime < this.nextNote) return;
    const scale = [261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3, 659.3];
    const root = [0, 3, 4, 2][Math.floor(Math.random() * 4)];
    const phrase = 6 + Math.floor(Math.random() * 10);
    let when = 0;
    for (let i = 0; i < phrase; i++) {
      const n = scale[(root + Math.floor(Math.random() * 5)) % scale.length] * (Math.random() < 0.2 ? 0.5 : 1);
      this.tone(n, 2.5, 'sine', 0.12, when, null, this.musicGain);
      this.tone(n * 2, 1.2, 'triangle', 0.03, when, null, this.musicGain);
      if (Math.random() < 0.3) this.tone(n * 0.5, 3, 'sine', 0.08, when, null, this.musicGain);
      when += 0.45 + Math.random() * 0.9;
    }
    this.musicTime = 0;
    this.nextNote = when + 60 + Math.random() * 120;
  }
}

export const audio = new GameAudio();
