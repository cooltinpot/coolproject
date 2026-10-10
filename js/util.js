// Core helpers: math, input, audio.
(function () {
  const G = (window.G = window.G || {});
  G.TILE = 40;

  const U = (G.U = {
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    dist: (a, b) => Math.hypot(b.x - a.x, b.y - a.y),
    angTo: (a, b) => Math.atan2(b.y - a.y, b.x - a.x),
    angDiff(a, b) {
      let d = b - a;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      return d;
    },
    rand: (a, b) => a + Math.random() * (b - a),
    randInt: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
    choice: (arr) => arr[Math.floor(Math.random() * arr.length)],
    norm(x, y) {
      const l = Math.hypot(x, y);
      return l > 1e-6 ? { x: x / l, y: y / l } : { x: 0, y: 0 };
    },
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
    fmtTime(s) {
      s = Math.max(0, Math.ceil(s));
      return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    },
    hexA(hex, a) {
      const n = parseInt(hex.slice(1), 16);
      return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
    },
  });

  G.Input = {
    keys: {},
    pressed: {},
    mouse: { x: 0, y: 0, down: false, clicked: false },
    init(canvas) {
      window.addEventListener('keydown', (e) => {
        const k = e.key.toLowerCase();
        if (!this.keys[k]) this.pressed[k] = true;
        this.keys[k] = true;
        if ([' ', 'tab'].includes(k) && G.game) e.preventDefault();
      });
      window.addEventListener('keyup', (e) => {
        this.keys[e.key.toLowerCase()] = false;
      });
      window.addEventListener('blur', () => {
        this.keys = {};
        this.mouse.down = false;
      });
      canvas.addEventListener('mousemove', (e) => {
        const r = canvas.getBoundingClientRect();
        this.mouse.x = e.clientX - r.left;
        this.mouse.y = e.clientY - r.top;
      });
      canvas.addEventListener('mousedown', (e) => {
        if (e.button === 0) {
          this.mouse.down = true;
          this.mouse.clicked = true;
        }
      });
      window.addEventListener('mouseup', (e) => {
        if (e.button === 0) this.mouse.down = false;
      });
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    },
    endFrame() {
      this.pressed = {};
      this.mouse.clicked = false;
    },
  };

  // Tiny synthesized sound kit (no asset files needed).
  G.Audio = {
    ctx: null,
    init() {
      if (this.ctx) return;
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.45;
        this.master.connect(this.ctx.destination);
      } catch (e) {
        this.ctx = null;
      }
    },
    tone(freq, dur, type = 'sine', vol = 0.3, slide = null, delay = 0) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime + delay;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g);
      g.connect(this.master);
      o.start(t);
      o.stop(t + dur + 0.02);
    },
    noise(dur, vol = 0.3, freq = 1200, delay = 0) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime + delay;
      const len = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(f);
      f.connect(g);
      g.connect(this.master);
      src.start(t);
    },
    play(name, vol = 1) {
      if (!this.ctx) return;
      const v = vol;
      switch (name) {
        case 'swing': this.noise(0.12, 0.18 * v, 2500); break;
        case 'hit': this.tone(180, 0.18, 'square', 0.22 * v, 60); this.noise(0.1, 0.25 * v, 900); break;
        case 'stun': this.tone(900, 0.35, 'sawtooth', 0.15 * v, 200); break;
        case 'zap': this.tone(1400, 0.2, 'square', 0.12 * v, 300); this.noise(0.2, 0.15 * v, 4000); break;
        case 'flash': this.noise(0.4, 0.35 * v, 3000); this.tone(2000, 0.3, 'sine', 0.1 * v, 800); break;
        case 'gen': this.tone(520, 0.2, 'triangle', 0.2 * v); this.tone(780, 0.35, 'triangle', 0.2 * v, null, 0.15); break;
        case 'heart': this.tone(60, 0.12, 'sine', 0.5 * v); this.tone(55, 0.12, 'sine', 0.4 * v, null, 0.18); break;
        case 'horn': this.tone(220, 1.2, 'sawtooth', 0.12 * v); this.tone(277, 1.2, 'sawtooth', 0.1 * v); break;
        case 'dash': this.noise(0.25, 0.2 * v, 1500); this.tone(300, 0.2, 'sine', 0.1 * v, 900); break;
        case 'block': this.tone(1200, 0.15, 'square', 0.18 * v, 600); break;
        case 'heal': this.tone(600, 0.3, 'sine', 0.15 * v, 900); break;
        case 'death': this.tone(300, 0.9, 'sawtooth', 0.18 * v, 40); break;
        case 'slam': this.tone(70, 0.5, 'sine', 0.5 * v, 30); this.noise(0.4, 0.3 * v, 400); break;
        case 'roar': this.tone(110, 0.6, 'sawtooth', 0.2 * v, 70); break;
        case 'whoosh': this.noise(0.5, 0.15 * v, 700); break;
        case 'trap': this.tone(400, 0.08, 'square', 0.25 * v, 150); this.noise(0.15, 0.3 * v, 2000); break;
        case 'click': this.tone(800, 0.05, 'square', 0.08 * v); break;
        case 'page': this.noise(0.25, 0.08 * v, 3000); break;
        case 'fire': this.noise(0.6, 0.12 * v, 600); break;
        case 'build': this.tone(300, 0.08, 'square', 0.15 * v); this.tone(380, 0.08, 'square', 0.15 * v, null, 0.1); break;
      }
    },
  };
})();
