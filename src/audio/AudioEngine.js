// Web Audio graph: separate music / sfx buses, shared reverb, master compressor,
// a low-pass "muffle" on the music used during slow motion, and an analyser for
// visuals that dance to the soundtrack.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.volumes = { master: 0.8, music: 0.7, sfx: 0.85 };
    this._perfStart = performance.now();
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.volumes.master;

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.knee.value = 10;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.18;

    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -2;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.08;

    this.master.connect(this.comp);
    this.comp.connect(this.limiter);
    this.limiter.connect(ctx.destination);

    // Music: instruments -> musicIn -> muffle filter -> music gain -> master
    this.musicIn = ctx.createGain();
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 20000;
    this.musicFilter.Q.value = 0.9;
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = this.volumes.music;
    this.musicIn.connect(this.musicFilter);
    this.musicFilter.connect(this.musicGain);
    this.musicGain.connect(this.master);

    // Ducked sub-bus for bass and pads (sidechained by the kick).
    this.duck = ctx.createGain();
    this.duck.connect(this.musicIn);

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.72;
    this.musicGain.connect(this.analyser);
    this.freqData = new Uint8Array(this.analyser.frequencyBinCount);

    // SFX bus
    this.sfxGain = ctx.createGain();
    this.sfxGain.gain.value = this.volumes.sfx;
    this.sfxGain.connect(this.master);

    // Reverb (generated impulse response)
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._makeImpulse(2.6, 2.4);
    this.reverbMusic = ctx.createGain();
    this.reverbMusic.gain.value = 0.9;
    this.reverbSfx = ctx.createGain();
    this.reverbSfx.gain.value = 0.9;
    const revFilter = ctx.createBiquadFilter();
    revFilter.type = 'highpass';
    revFilter.frequency.value = 220;
    this.reverbSend = ctx.createGain();
    this.reverbSend.connect(revFilter);
    revFilter.connect(this.reverb);
    this.reverb.connect(this.reverbMusic);
    this.reverbMusic.connect(this.musicIn);
    this.sfxReverbSend = ctx.createGain();
    const sfxRev = ctx.createConvolver();
    sfxRev.buffer = this._makeImpulse(1.8, 3);
    this.sfxReverbSend.connect(sfxRev);
    sfxRev.connect(this.reverbSfx);
    this.reverbSfx.connect(this.sfxGain);

    // Tempo-synced ping-pong delay for arps and leads.
    this.delaySend = ctx.createGain();
    const dl = ctx.createDelay(2), dr = ctx.createDelay(2);
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const dFilter = ctx.createBiquadFilter();
    dFilter.type = 'bandpass';
    dFilter.frequency.value = 2200;
    dFilter.Q.value = 0.6;
    const merger = ctx.createChannelMerger(2);
    this.delayL = dl;
    this.delayR = dr;
    this.delaySend.connect(dFilter);
    dFilter.connect(dl);
    dl.connect(dr);
    dr.connect(fb);
    fb.connect(dl);
    dl.connect(merger, 0, 0);
    dr.connect(merger, 0, 1);
    const dOut = ctx.createGain();
    dOut.gain.value = 0.55;
    merger.connect(dOut);
    dOut.connect(this.musicIn);

    this.noise = this._makeNoise(2);
    this.ready = true;
  }

  setDelayTime(sec) {
    if (!this.ctx) return;
    this.delayL.delayTime.value = sec;
    this.delayR.delayTime.value = sec;
  }

  resume() {
    if (this.ctx && this.ctx.state !== 'running') this.ctx.resume();
  }

  get running() {
    return this.ctx && this.ctx.state === 'running';
  }

  // Audio clock (falls back to performance clock if audio is unavailable).
  get now() {
    if (this.fakeNow !== undefined) return this.fakeNow; // deterministic tests
    if (this.ctx) return this.ctx.currentTime;
    return (performance.now() - this._perfStart) / 1000;
  }

  get latency() {
    if (!this.ctx) return 0;
    return (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0);
  }

  setVolumes(v) {
    Object.assign(this.volumes, v);
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.master, t, 0.05);
    this.musicGain.gain.setTargetAtTime(this.volumes.music, t, 0.05);
    this.sfxGain.gain.setTargetAtTime(this.volumes.sfx, t, 0.05);
  }

  // 0 = clear, 1 = heavily muffled (used for slow motion and pause).
  setMuffle(amount) {
    if (!this.ctx) return;
    const f = 20000 * Math.pow(500 / 20000, Math.min(1, Math.max(0, amount)));
    this.musicFilter.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.03);
  }

  getSpectrum() {
    if (!this.ctx) return null;
    this.analyser.getByteFrequencyData(this.freqData);
    return this.freqData;
  }

  _makeNoise(seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _makeImpulse(seconds, decay) {
    const ctx = this.ctx;
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // Early reflections then a smooth exponential tail.
        const early = i < rate * 0.08 && Math.random() < 0.012 ? (Math.random() * 2 - 1) * 0.9 : 0;
        d[i] = ((Math.random() * 2 - 1) * Math.pow(1 - t, decay) + early) * (i < 64 ? i / 64 : 1);
      }
    }
    return buf;
  }

  // --- helpers shared by music and sfx ---

  noiseSource(t, dur, rate = 1) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = rate;
    const off = Math.random() * 1.5;
    src.start(t, off, dur + 0.05);
    return src;
  }

  env(param, t, attack, peak, decay, sustain = 0.0001) {
    param.cancelScheduledValues(t);
    param.setValueAtTime(0.0001, t);
    param.linearRampToValueAtTime(peak, t + attack);
    param.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t + attack + decay);
  }
}

export const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
