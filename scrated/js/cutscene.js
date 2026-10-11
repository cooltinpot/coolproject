// The ending of SCRATED: GRIFFPATCH crushes the block, and THE END erupts.
(function () {
  const G = window.G;
  const U = G.U;
  const TAU = Math.PI * 2;
  const CREDITS_AT = 35;

  const LINES = [
    [0.4, 3.6, 'GRIFFPATCH grabbed the DESTROY block and crushed it.'],
    [2.0, 3.6, 'He thought he was winning.'],
    [3.8, 9, 'THE END erupted.'],
    [5.8, 9, 'Vast. Ancient. Furious beyond any scale SC had ever reached.'],
    [9.2, 13, 'Hackers returned to their places. Survivors corrupted, one by one.'],
    [11, 13, 'Five hundred years of SC\'s work, undone in moments.'],
    [13.2, 15.6, 'With one final look at what was left of 0.4…'],
    [14.4, 15.6, 'THE END let him faint.'],
    [23.6, 29, 'Scratch didn\'t die a fourth time.'],
    [25.4, 29, 'It was colonized.'],
    [29.2, 35, 'THE END was never the block. THE END was never SC.'],
    [31.4, 35, 'It was the thing that found 0.4 at his lowest, and made sure he knew where the mountain was.'],
  ];
  const FACES = ['sc', 'protocol2', 'burgers', 'creaker', 'revengest', 'scratchy', 'griffpatch', 'nano'];

  const C = (G.Cutscene = {
    active: false,
    t: 0,
    start(game) {
      this.game = game;
      this.active = true;
      this.t = 0;
      this.cues = {};
      this.roots = [];
      for (let i = 0; i < 26; i++) this.roots.push({ a: U.rand(0, TAU), seed: Math.random() * 1000, len: U.rand(0.6, 1.2) });
      this.portraits = {};
      for (const id of FACES) {
        const cv = document.createElement('canvas');
        cv.width = cv.height = 260;
        G.Render.drawPortrait(cv, id, { corrupt: id === 'revengest' });
        this.portraits[id] = cv;
      }
      const end = () => {
        if (this.t >= CREDITS_AT + 1.5) this.finish();
      };
      this.onKey = end;
      window.addEventListener('keydown', this.onKey);
      window.addEventListener('mousedown', this.onKey);
      try { localStorage.setItem('scrated_seen_end', '1'); } catch (e) { /* ignore */ }
    },
    skip() {
      if (this.t < CREDITS_AT) this.t = CREDITS_AT;
      else this.finish();
    },
    finish() {
      this.active = false;
      window.removeEventListener('keydown', this.onKey);
      window.removeEventListener('mousedown', this.onKey);
      G.Menu.toMenu();
    },
    cue(name, at, fn) {
      if (this.t >= at && !this.cues[name]) { this.cues[name] = true; fn(); }
    },

    frame(dt) {
      this.t += dt;
      const t = this.t;
      const R = G.Render;
      const W = window.innerWidth, H = window.innerHeight;
      const dpr = R.setup(W, H);
      const ctx = R.ctx;
      const g = this.game;

      this.cue('rumble', 3.6, () => G.Audio.play('rumble'));
      this.cue('g1', 9.3, () => G.Audio.play('glitch'));
      this.cue('g2', 10.4, () => G.Audio.play('glitch'));
      this.cue('g3', 11.6, () => G.Audio.play('glitch'));
      this.cue('crack', 18.2, () => G.Audio.play('crush'));
      this.cue('laugh', 19.6, () => { G.Audio.play('laugh'); setTimeout(() => this.active && G.Audio.play('laugh', 0.8), 900); });
      this.cue('throne', 23.4, () => G.Audio.play('rumble', 0.6));

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (t < 15.6) {
        // The game world, frozen, with THE END over it.
        g.shakeAmt = t < 3.6 ? 10 : t < 9 ? 6 * Math.random() : 2;
        g.banner = null;
        g.updateFx(dt);
        R.frame(g);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const sp = (e) => ({ x: (e.x - g.cam.x) * g.cam.zoom + W / 2, y: (e.y - g.cam.y) * g.cam.zoom + H / 2 });
        const blk = g.finale.block ? sp(g.finale.block) : { x: W / 2, y: H / 2 };
        // Cracks spreading from the block.
        const crackF = U.clamp(t / 3, 0, 1);
        ctx.strokeStyle = '#ff1a3a';
        ctx.shadowColor = '#ff1a3a';
        ctx.shadowBlur = 12;
        ctx.lineWidth = 3;
        const rnd = G.Render.mulberry(7);
        for (let i = 0; i < 14; i++) {
          let x = blk.x, y = blk.y, a = rnd() * TAU;
          ctx.beginPath(); ctx.moveTo(x, y);
          const steps = 10;
          for (let s = 0; s < steps * crackF; s++) {
            a += (rnd() - 0.5) * 1.2;
            x += Math.cos(a) * (W / 40);
            y += Math.sin(a) * (W / 40);
            ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
        if (t > 3.6) {
          ctx.fillStyle = `rgba(40,0,6,${U.clamp((t - 3.6) / 3, 0, 0.55)})`;
          ctx.fillRect(0, 0, W, H);
          const open = U.clamp((t - 3.8) / 1.5, 0, 1);
          const ex = W / 2, ey = H * 0.24, es = Math.min(W, H) * 0.22;
          // Strings from the eye to everyone it owns.
          const sc = sp(g.killer);
          let look = { x: ex + Math.sin(t * 1.3) * 60, y: ey + 80 };
          if (t > 13.2) look = sc;
          ctx.lineWidth = 2;
          g.ents.forEach((e, i) => {
            if (e.dead || e.decoy) return;
            const p = sp(e);
            const f = U.clamp((t - 5 - i * 0.25) / 1.2, 0, 1);
            if (f <= 0) return;
            ctx.strokeStyle = `rgba(255,30,60,${0.4 + 0.3 * Math.sin(t * 8 + i)})`;
            ctx.beginPath();
            ctx.moveTo(ex, ey);
            const mx = (ex + p.x) / 2 + Math.sin(t * 2 + i) * 40, my = (ey + p.y) / 2 - 60;
            ctx.quadraticCurveTo(mx, my, U.lerp(ex, p.x, f), U.lerp(ey, p.y, f));
            ctx.stroke();
            // Corruption bleeding through survivors, one at a time.
            const cf = U.clamp((t - 9.3 - i * 0.6) / 0.8, 0, 1);
            if (cf > 0 && e.team === 'survivor') {
              ctx.fillStyle = `rgba(255,20,50,${0.5 * cf})`;
              for (let k = 0; k < 6; k++) ctx.fillRect(p.x - 18 + Math.random() * 36, p.y - 18 + Math.random() * 36, U.rand(4, 18), 3);
            }
          });
          this.eye(ctx, ex, ey, es, open, look);
        }
        if (t > 14.6) {
          ctx.fillStyle = `rgba(0,0,0,${U.clamp((t - 14.6) / 1, 0, 1)})`;
          ctx.fillRect(0, 0, W, H);
        }
      } else if (t < 18) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
      } else if (t < 23.4) {
        // THE END breaks through the screen.
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
        const f = U.clamp((t - 18) / 1.2, 0, 1);
        const cx = W / 2, cy = H * 0.42;
        ctx.strokeStyle = '#d9d9d9';
        ctx.lineWidth = 2;
        const rnd = G.Render.mulberry(31);
        for (let i = 0; i < 18; i++) {
          const a = rnd() * TAU;
          let x = cx, y = cy;
          ctx.beginPath(); ctx.moveTo(x, y);
          for (let s = 0; s < 8 * f; s++) { x += Math.cos(a + (rnd() - 0.5)) * W / 22; y += Math.sin(a + (rnd() - 0.5)) * W / 22; ctx.lineTo(x, y); }
          ctx.stroke();
        }
        const es = Math.min(W, H) * (0.12 + 0.2 * U.clamp((t - 18.6) / 1.2, 0, 1));
        // A hole in the black.
        ctx.fillStyle = '#1a0006';
        ctx.beginPath();
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * TAU, rr = es * 1.45 * (0.85 + rnd() * 0.3) * f;
          ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        }
        ctx.closePath(); ctx.fill();
        this.eye(ctx, cx, cy, es, U.clamp((t - 18.6) / 0.8, 0, 1), { x: W / 2, y: H });
        // SC, dangling from a string.
        if (t > 19.2) {
          const sw = Math.sin(t * 2.2) * 0.25;
          const ax = cx, ay = cy + es * 0.9;
          const len = H * 0.28;
          const px = ax + Math.sin(sw) * len, py = ay + Math.cos(sw) * len;
          ctx.strokeStyle = '#ff1a3a'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(px, py); ctx.stroke();
          ctx.save(); ctx.globalAlpha = 0.9;
          ctx.drawImage(this.portraits.sc, px - 50, py - 10, 100, 100);
          ctx.restore();
        }
        if (t > 19.6) {
          const size = Math.min(W / 7, 120);
          ctx.textAlign = 'center';
          ctx.font = `900 ${size}px "Rubik Glitch", Impact, sans-serif`;
          const jit = () => U.rand(-4, 4);
          ctx.fillStyle = '#00e5ff'; ctx.fillText('THE— END.', W / 2 + jit() - 4, H * 0.86 + jit());
          ctx.fillStyle = '#ff1a3a'; ctx.fillText('THE— END.', W / 2 + jit() + 4, H * 0.86 + jit());
          ctx.fillStyle = '#ffffff'; ctx.fillText('THE— END.', W / 2, H * 0.86);
        }
      } else if (t < 29) {
        this.throne(ctx, W, H, t - 23.4);
      } else if (t < CREDITS_AT) {
        this.faces(ctx, W, H, t - 29);
      } else {
        this.credits(ctx, W, H, t - CREDITS_AT);
      }

      // Narration.
      for (const [a, b, s] of LINES) {
        if (t < a || t > b) continue;
        const al = Math.min(1, (t - a) * 2, (b - t) * 2);
        const idx = LINES.filter((l) => t >= l[0] && t <= l[1]).indexOf(LINES.find((l) => l[2] === s));
        ctx.globalAlpha = al;
        ctx.textAlign = 'center';
        ctx.font = `italic ${Math.min(26, W / 30)}px "Crimson Pro", Georgia, serif`;
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#000';
        const y = H - 90 + idx * 34;
        ctx.strokeText(s, W / 2, y);
        ctx.fillStyle = '#f2e6e6';
        ctx.fillText(s, W / 2, y);
        ctx.globalAlpha = 1;
      }
      if (t < CREDITS_AT) {
        ctx.font = '12px "Trebuchet MS", Arial, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillText('Esc to skip', W - 14, H - 12);
      }
    },

    eye(ctx, x, y, s, open, look) {
      ctx.save();
      ctx.translate(x, y);
      // Eye shape (lids).
      const h = s * 0.55 * open;
      ctx.beginPath();
      ctx.moveTo(-s, 0);
      ctx.quadraticCurveTo(0, -h * 2, s, 0);
      ctx.quadraticCurveTo(0, h * 2, -s, 0);
      ctx.closePath();
      ctx.shadowColor = '#ff1a3a';
      ctx.shadowBlur = 40;
      ctx.fillStyle = '#f0e6d8';
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.save();
      ctx.clip();
      // Bloodshot veins.
      ctx.strokeStyle = 'rgba(200,20,40,0.6)';
      ctx.lineWidth = 1.5;
      const rnd = G.Render.mulberry(5);
      for (let i = 0; i < 16; i++) {
        const a = rnd() * TAU;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * s, Math.sin(a) * s * 0.6);
        ctx.quadraticCurveTo(Math.cos(a + 0.3) * s * 0.7, Math.sin(a + 0.3) * s * 0.5, Math.cos(a) * s * 0.4, Math.sin(a) * s * 0.3);
        ctx.stroke();
      }
      const lx = U.clamp((look.x - x) / 6, -s * 0.35, s * 0.35), ly = U.clamp((look.y - y) / 10, -s * 0.15, s * 0.15);
      const ir = s * 0.42;
      const gr = ctx.createRadialGradient(lx, ly, ir * 0.1, lx, ly, ir);
      gr.addColorStop(0, '#ffcc33');
      gr.addColorStop(0.35, '#ff3b1a');
      gr.addColorStop(1, '#5a0010');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(lx, ly, ir, 0, TAU); ctx.fill();
      ctx.fillStyle = '#050000';
      ctx.beginPath(); ctx.ellipse(lx, ly, ir * 0.14, ir * 0.82, 0, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = '#2a0006';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-s, 0);
      ctx.quadraticCurveTo(0, -h * 2, s, 0);
      ctx.quadraticCurveTo(0, h * 2, -s, 0);
      ctx.stroke();
      ctx.restore();
    },

    throne(ctx, W, H, t) {
      const gr = ctx.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, '#1a0006');
      gr.addColorStop(1, '#3a0610');
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, W, H);
      const cx = W / 2, cy = H * 0.42;
      // Roots / strings spreading over every world it owns.
      const grow = U.clamp(t / 4, 0, 1);
      ctx.strokeStyle = 'rgba(255,40,70,0.55)';
      ctx.lineWidth = 2;
      for (const r of this.roots) {
        const rnd = G.Render.mulberry(Math.floor(r.seed));
        let x = cx, y = cy + H * 0.12, a = r.a;
        ctx.beginPath(); ctx.moveTo(x, y);
        const n = Math.floor(14 * grow * r.len);
        for (let i = 0; i < n; i++) {
          a += (rnd() - 0.5) * 0.9;
          x += Math.cos(a) * W / 28;
          y += Math.sin(a) * H / 22;
          ctx.lineTo(x, y);
          if (rnd() < 0.2) { ctx.moveTo(x, y); ctx.arc(x, y, 3 + rnd() * 5, 0, TAU); ctx.moveTo(x, y); }
        }
        ctx.stroke();
      }
      // Bowing worlds: rows of hunched figures and little MIT towers.
      for (let row = 0; row < 3; row++) {
        const y = H * (0.72 + row * 0.08);
        const n = 7 + row * 3;
        for (let i = 0; i < n; i++) {
          const x = (W / (n + 1)) * (i + 1);
          if (Math.abs(x - cx) < W * 0.1 && row === 0) continue;
          const s = 10 + row * 4;
          ctx.fillStyle = `rgba(8,0,2,${0.8 + row * 0.07})`;
          ctx.beginPath(); ctx.ellipse(x, y, s * 1.1, s * 0.6, 0, 0, TAU); ctx.fill();
          ctx.beginPath(); ctx.arc(x + (x < cx ? s : -s) * 0.7, y - s * 0.1, s * 0.45, 0, TAU); ctx.fill();
        }
      }
      for (let i = 0; i < 6; i++) {
        const x = (W / 7) * (i + 1), h = H * (0.18 + (i % 3) * 0.05);
        ctx.fillStyle = 'rgba(10,0,4,0.7)';
        ctx.fillRect(x - 12, H * 0.62 - h, 24, h);
        ctx.save(); ctx.translate(x, H * 0.62 - h); ctx.rotate((x < cx ? 1 : -1) * 0.15); ctx.fillRect(-14, -8, 28, 8); ctx.restore();
      }
      // God's throne.
      ctx.fillStyle = '#0a0003';
      ctx.beginPath();
      ctx.moveTo(cx - W * 0.09, cy + H * 0.2);
      ctx.lineTo(cx - W * 0.08, cy - H * 0.2);
      ctx.lineTo(cx - W * 0.03, cy - H * 0.28);
      ctx.lineTo(cx, cy - H * 0.22);
      ctx.lineTo(cx + W * 0.03, cy - H * 0.28);
      ctx.lineTo(cx + W * 0.08, cy - H * 0.2);
      ctx.lineTo(cx + W * 0.09, cy + H * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 2; ctx.stroke();
      // THE END, seated.
      ctx.fillStyle = '#120006';
      ctx.beginPath(); ctx.ellipse(cx, cy + H * 0.08, W * 0.05, H * 0.12, 0, 0, TAU); ctx.fill();
      this.eye(ctx, cx, cy - H * 0.06, Math.min(W, H) * 0.07, 1, { x: cx + Math.sin(t) * 200, y: cy + 100 });
      // A crown, taken from God.
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      const cw = Math.min(W, H) * 0.08, cyy = cy - H * 0.13;
      ctx.moveTo(cx - cw, cyy); ctx.lineTo(cx - cw * 0.6, cyy - cw * 0.7); ctx.lineTo(cx - cw * 0.2, cyy - cw * 0.25);
      ctx.lineTo(cx, cyy - cw * 0.9); ctx.lineTo(cx + cw * 0.2, cyy - cw * 0.25); ctx.lineTo(cx + cw * 0.6, cyy - cw * 0.7); ctx.lineTo(cx + cw, cyy);
      ctx.closePath(); ctx.fill();
    },

    faces(ctx, W, H, t) {
      ctx.fillStyle = '#050003';
      ctx.fillRect(0, 0, W, H);
      const idx = Math.min(FACES.length - 1, Math.floor(t / 0.7));
      const id = FACES[idx];
      const def = G.CHARS[id];
      const s = Math.min(W, H) * 0.5;
      const x = W / 2 - s / 2, y = H * 0.38 - s / 2;
      ctx.drawImage(this.portraits[id], x, y, s, s);
      // Red code bleeding through, overwriting them from the inside.
      const f = (t % 0.7) / 0.7;
      ctx.fillStyle = `rgba(255,20,50,${0.25 + f * 0.5})`;
      for (let i = 0; i < 40 * f + 10; i++) ctx.fillRect(x + Math.random() * s, y + Math.random() * s, U.rand(2, 30), U.rand(2, 5));
      ctx.font = '12px monospace';
      ctx.fillStyle = '#ff1a3a';
      for (let i = 0; i < 30; i++) ctx.fillText(Math.random() < 0.5 ? 'THE END' : Math.random().toString(16).slice(2, 8), x + Math.random() * s, y + Math.random() * s);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (let yy = 0; yy < H; yy += 4) ctx.fillRect(0, yy, W, 1);
      ctx.textAlign = 'center';
      ctx.font = `bold ${Math.min(42, W / 16)}px "Rubik", "Trebuchet MS", sans-serif`;
      ctx.fillStyle = '#f2e6e6';
      ctx.fillText(def.name, W / 2, H * 0.38 + s / 2 + 44);
    },

    credits(ctx, W, H, t) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      const a = U.clamp(t / 1.5, 0, 1);
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      const S = G.STORY;
      ctx.font = `900 ${Math.min(96, W / 8)}px "Rubik Glitch", Impact, sans-serif`;
      ctx.fillStyle = '#e8e8e8';
      ctx.fillText('SCRATED', W / 2, H * 0.3);
      ctx.font = `italic ${Math.min(24, W / 30)}px "Crimson Pro", Georgia, serif`;
      ctx.fillStyle = '#b8a8a8';
      ctx.fillText('A Mythological Story', W / 2, H * 0.3 + 40);
      const ep = S.chapters[S.chapters.length - 1].paras[0];
      this.wrap(ctx, ep, W / 2, H * 0.48, Math.min(W * 0.8, 760), 28);
      ctx.font = `${Math.min(20, W / 34)}px "Crimson Pro", Georgia, serif`;
      ctx.fillStyle = '#d9d0d0';
      ctx.fillText(S.credits[1], W / 2, H * 0.72);
      ctx.fillText(S.credits[2], W / 2, H * 0.72 + 30);
      if (t > 1.5) {
        ctx.font = '14px "Trebuchet MS", Arial, sans-serif';
        ctx.fillStyle = `rgba(255,255,255,${0.4 + 0.3 * Math.sin(t * 3)})`;
        ctx.fillText('Click or press any key to return', W / 2, H - 40);
      }
      ctx.globalAlpha = 1;
    },
    wrap(ctx, text, x, y, maxW, lh) {
      ctx.font = `italic ${Math.min(20, window.innerWidth / 34)}px "Crimson Pro", Georgia, serif`;
      ctx.fillStyle = '#cfc4c4';
      const words = text.split(' ');
      let line = '', yy = y;
      for (const w of words) {
        const test = line ? line + ' ' + w : w;
        if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, yy); line = w; yy += lh; } else line = test;
      }
      if (line) ctx.fillText(line, x, yy);
    },
  });
})();
