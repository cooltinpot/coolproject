// Drawing for SCRATED: realms, characters (with class cosmetics), telegraphs,
// zones, fog and HUD.
(function () {
  const G = window.G;
  const U = G.U;
  const T = G.TILE;
  const Ent = G.Ent;
  const TAU = Math.PI * 2;
  const BLOCK_COLORS = ['#4c97ff', '#9966ff', '#cf63cf', '#ffbf00', '#ffab19', '#5cb1d6', '#59c059', '#ff8c1a'];

  const R = (G.Render = {
    canvas: null,
    ctx: null,
    init(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.dark = document.createElement('canvas');
    },

    setup(W, H) {
      const c = this.canvas;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (c.width !== Math.floor(W * dpr) || c.height !== Math.floor(H * dpr)) {
        c.width = Math.floor(W * dpr);
        c.height = Math.floor(H * dpr);
        c.style.width = W + 'px';
        c.style.height = H + 'px';
      }
      return dpr;
    },

    frame(g) {
      const ctx = this.ctx;
      const W = window.innerWidth, H = window.innerHeight;
      const dpr = this.setup(W, H);
      g.vw = W; g.vh = H;
      const focus = g.spectate || g.player;
      const cam = g.cam;
      cam.zoom = U.clamp(Math.min(W / 1300, H / 780), 0.55, 1.25);
      cam.x = U.lerp(cam.x, focus.x, 0.15);
      cam.y = U.lerp(cam.y, focus.y, 0.15);
      const hw = W / 2 / cam.zoom, hh = H / 2 / cam.zoom, w = g.world;
      cam.x = w.pw > hw * 2 ? U.clamp(cam.x, hw, w.pw - hw) : w.pw / 2;
      cam.y = w.ph > hh * 2 ? U.clamp(cam.y, hh - 90 / cam.zoom, w.ph - hh + 110 / cam.zoom) : w.ph / 2;
      const sh = g.shakeAmt;
      const sx = sh > 0.3 ? U.rand(-sh, sh) : 0, sy = sh > 0.3 ? U.rand(-sh, sh) : 0;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#050508';
      ctx.fillRect(0, 0, W, H);
      const enter = () => {
        ctx.save();
        ctx.translate(W / 2 + sx, H / 2 + sy);
        ctx.scale(cam.zoom, cam.zoom);
        ctx.translate(-cam.x, -cam.y);
      };
      enter();
      const view = { x0: cam.x - hw - T, y0: cam.y - hh - T, x1: cam.x + hw + T, y1: cam.y + hh + T };
      this.drawWorld(ctx, g, view, focus);
      this.drawEntities(ctx, g, view, focus);
      this.drawProjectiles(ctx, g);
      this.drawFx(ctx, g);
      ctx.restore();

      this.drawDarkness(ctx, g, focus, W, H, dpr);

      enter();
      this.drawReveals(ctx, g, focus);
      for (const p of g.particles) {
        if (!p.snow) continue;
        ctx.globalAlpha = 0.8 * (1 - p.t / p.dur);
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
      for (const t of g.texts) {
        ctx.globalAlpha = 1 - t.t / t.dur;
        ctx.font = 'bold 15px "Trebuchet MS", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#000';
        ctx.strokeText(t.s, t.x, t.y);
        ctx.fillStyle = t.color;
        ctx.fillText(t.s, t.x, t.y);
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      if (!(G.Cutscene && G.Cutscene.active)) this.drawHUD(ctx, g, W, H, focus);
    },

    // ---------------------------------------------------------------- world
    staticLayer(world) {
      if (world._layer) return world._layer;
      const cv = document.createElement('canvas');
      cv.width = world.pw;
      cv.height = world.ph;
      const ctx = cv.getContext('2d');
      const P = world.def.palette;
      const rnd = mulberry(world.def.id.length * 977 + 13);
      const isW = (ax, ay) => world.at(ax, ay) === '#';
      for (let ty = 0; ty < world.h; ty++) {
        for (let tx = 0; tx < world.w; tx++) {
          const ch = world.at(tx, ty);
          const x = tx * T, y = ty * T;
          ctx.fillStyle = (tx + ty) % 2 ? P.floor : P.floor2;
          ctx.fillRect(x, y, T, T);
          if (world.def.id === 'forums') {
            // Cobblestones.
            ctx.strokeStyle = 'rgba(0,0,0,0.18)';
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 1, y + 1, 19, 19); ctx.strokeRect(x + 20, y + 1, 19, 19);
            ctx.strokeRect(x + 10, y + 20, 19, 19);
          } else if (world.def.id === 'mit') {
            ctx.strokeStyle = 'rgba(255,255,255,0.05)';
            ctx.strokeRect(x + 0.5, y + 0.5, T - 1, T - 1);
          }
          for (let i = 0; i < 3; i++) {
            ctx.fillStyle = `rgba(0,0,0,${0.06 + rnd() * 0.1})`;
            ctx.fillRect(x + rnd() * T, y + rnd() * T, 2 + rnd() * 3, 2 + rnd() * 3);
          }
          if (ch === 'b') {
            ctx.strokeStyle = '#d9cfb8';
            ctx.lineCap = 'round';
            ctx.lineWidth = 3;
            for (let i = 0; i < 3; i++) {
              const bx = x + 8 + rnd() * 24, by = y + 8 + rnd() * 24, a = rnd() * TAU, l = 6 + rnd() * 6;
              ctx.beginPath(); ctx.moveTo(bx - Math.cos(a) * l, by - Math.sin(a) * l); ctx.lineTo(bx + Math.cos(a) * l, by + Math.sin(a) * l); ctx.stroke();
            }
            ctx.fillStyle = '#e8e0cc';
            ctx.beginPath(); ctx.arc(x + 20, y + 20, 5, 0, TAU); ctx.fill();
            ctx.fillStyle = '#2a2420';
            ctx.fillRect(x + 17, y + 18, 2, 2); ctx.fillRect(x + 21, y + 18, 2, 2);
            ctx.lineCap = 'butt';
          } else if (ch === 'O') {
            ctx.fillStyle = '#2a2f38';
            ctx.fillRect(x + 3, y + 3, T - 6, T - 6);
            ctx.fillStyle = '#8f99a8';
            ctx.fillRect(x + 5, y + 5, 14, T - 10);
            ctx.fillRect(x + 21, y + 5, 14, T - 10);
            ctx.fillStyle = '#1a1d22';
            ctx.fillRect(x + 19, y + 5, 2, T - 10);
          } else if (ch === 'h') {
            ctx.fillStyle = '#050505';
            ctx.beginPath();
            for (let i = 0; i < 10; i++) {
              const a = (i / 10) * TAU, rr = 14 + rnd() * 6;
              ctx.lineTo(x + 20 + Math.cos(a) * rr, y + 20 + Math.sin(a) * rr);
            }
            ctx.closePath(); ctx.fill();
            ctx.strokeStyle = '#ff5050';
            ctx.globalAlpha = 0.25;
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }
      }
      for (let ty = 0; ty < world.h; ty++) for (let tx = 0; tx < world.w; tx++) {
        if (world.at(tx, ty) === '#') { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(tx * T + 6, ty * T + 6, T, T); }
      }
      for (let ty = 0; ty < world.h; ty++) {
        for (let tx = 0; tx < world.w; tx++) {
          const ch = world.at(tx, ty);
          const x = tx * T, y = ty * T;
          if (ch === '#') {
            ctx.fillStyle = P.wallTop;
            ctx.fillRect(x, y, T, T);
            ctx.fillStyle = 'rgba(0,0,0,0.12)';
            if (world.def.id === 'cave') {
              for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x + rnd() * T, y + rnd() * T, 4 + rnd() * 8, 0, TAU); ctx.fill(); }
            } else if (world.def.id === 'mit') {
              ctx.fillStyle = 'rgba(160,200,255,0.10)';
              ctx.fillRect(x + 4, y + 4, 14, 12); ctx.fillRect(x + 22, y + 4, 14, 12);
            } else {
              for (let i = 1; i < 4; i++) ctx.fillRect(x, y + i * 10, T, 1);
              ctx.fillRect(x + ((ty % 2) ? 10 : 30), y, 1, T);
            }
            ctx.fillStyle = 'rgba(255,255,255,0.09)';
            if (!isW(tx, ty - 1)) ctx.fillRect(x, y, T, 3);
            if (!isW(tx - 1, ty)) ctx.fillRect(x, y, 2, T);
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            if (!isW(tx + 1, ty)) ctx.fillRect(x + T - 2, y, 2, T);
            if (!isW(tx, ty + 1)) {
              ctx.fillStyle = P.wall;
              ctx.fillRect(x, y + T - 11, T, 11);
              ctx.fillStyle = 'rgba(0,0,0,0.25)';
              ctx.fillRect(x, y + T - 11, T, 2);
            }
          } else if (ch === 'x') {
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fillRect(x + 5, y + 5, T - 4, T - 4);
            if (world.def.id === 'forums') {
              // Park bench.
              ctx.fillStyle = P.crate;
              for (let i = 0; i < 3; i++) ctx.fillRect(x + 4, y + 8 + i * 9, T - 8, 6);
              ctx.fillStyle = '#222';
              ctx.fillRect(x + 6, y + 6, 3, T - 12); ctx.fillRect(x + T - 9, y + 6, 3, T - 12);
            } else if (world.def.id === 'cave') {
              ctx.fillStyle = P.crate;
              ctx.beginPath(); ctx.arc(x + 20, y + 21, 17, 0, TAU); ctx.fill();
              ctx.fillStyle = 'rgba(255,255,255,0.08)';
              ctx.beginPath(); ctx.arc(x + 15, y + 15, 7, 0, TAU); ctx.fill();
            } else {
              // Office debris: a broken desk.
              ctx.fillStyle = P.crate;
              ctx.fillRect(x + 3, y + 6, T - 6, T - 12);
              ctx.fillStyle = '#2a2d33';
              ctx.fillRect(x + 8, y + 10, 12, 9);
              ctx.strokeStyle = 'rgba(0,0,0,0.5)';
              ctx.beginPath(); ctx.moveTo(x + 6, y + 30); ctx.lineTo(x + 26, y + 12); ctx.stroke();
            }
          } else if (ch === 'n') {
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fillRect(x + 6, y + 6, T - 6, T - 6);
            ctx.fillStyle = '#6b4a2a';
            ctx.fillRect(x + 3, y + 4, T - 6, T - 10);
            ctx.fillStyle = '#f2ead7';
            ctx.fillRect(x + 6, y + 7, 12, 14); ctx.fillRect(x + 21, y + 9, 13, 11);
            ctx.fillStyle = '#ffab19';
            ctx.fillRect(x + 8, y + 9, 8, 3);
            ctx.fillStyle = '#c33';
            ctx.beginPath(); ctx.arc(x + 12, y + 8, 1.5, 0, TAU); ctx.fill();
          } else if (ch === 'D') {
            ctx.fillStyle = '#4a4038';
            ctx.fillRect(x + 4, y + 2, T - 8, T - 4);
            ctx.strokeStyle = '#2a221c';
            ctx.lineWidth = 2;
            ctx.strokeRect(x + 4, y + 2, T - 8, T - 4);
          }
        }
      }
      // Decals (painted warnings, signs).
      for (const [dx, dy, text, col, size, alpha] of world.def.decals || []) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = col;
        ctx.font = `bold ${size}px "Trebuchet MS", Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, dx * T, dy * T);
        ctx.restore();
      }
      world._layer = cv;
      return cv;
    },

    drawWorld(ctx, g, v, focus) {
      const w = g.world;
      ctx.drawImage(this.staticLayer(w), 0, 0);
      const t = g.time;
      const tx0 = Math.max(0, Math.floor(v.x0 / T)), tx1 = Math.min(w.w - 1, Math.floor(v.x1 / T));
      const ty0 = Math.max(0, Math.floor(v.y0 / T)), ty1 = Math.min(w.h - 1, Math.floor(v.y1 / T));
      for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          const ch = w.at(tx, ty);
          const x = tx * T, y = ty * T;
          if (ch === '~') {
            ctx.fillStyle = '#1f4f8a';
            ctx.fillRect(x, y, T, T);
            ctx.strokeStyle = 'rgba(160,210,255,0.35)';
            ctx.lineWidth = 2;
            for (let i = 0; i < 2; i++) {
              const off = (t * 20 + i * 20 + tx * 7) % T;
              ctx.beginPath();
              ctx.moveTo(x + 4, y + off); ctx.quadraticCurveTo(x + 20, y + off - 4, x + 36, y + off);
              ctx.stroke();
            }
          } else if (ch === 'f') {
            ctx.fillStyle = '#1f4f8a';
            ctx.fillRect(x, y, T, T);
          } else if (ch === 'O' && focus.team === 'survivor') {
            ctx.strokeStyle = `rgba(143,200,255,${0.4 + 0.2 * Math.sin(t * 3)})`;
            ctx.lineWidth = 2;
            ctx.strokeRect(x + 2, y + 2, T - 4, T - 4);
          } else if (ch === 'D') {
            ctx.fillStyle = `rgba(179,18,42,${0.15 + 0.1 * Math.sin(t * 2)})`;
            ctx.fillRect(x, y, T, T);
          }
        }
      }
      // Fountain statue (a Scratch cat on a pillar, spouting water).
      if (w.def.id === 'forums') {
        const cx = 24 * T, cy = 16 * T;
        ctx.fillStyle = '#8b93a6';
        ctx.beginPath(); ctx.arc(cx, cy, 34, 0, TAU); ctx.fill();
        ctx.fillStyle = '#6b7385';
        ctx.beginPath(); ctx.arc(cx, cy, 24, 0, TAU); ctx.fill();
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(-Math.PI / 2); this.drawCat(ctx, 13, '#aeb6c6', '#c9d0dc', 0, false); ctx.restore();
        for (let i = 0; i < 3; i++) {
          const a = t * 2 + (i * TAU) / 3;
          ctx.fillStyle = 'rgba(180,220,255,0.6)';
          ctx.beginPath(); ctx.arc(cx + Math.cos(a) * 30, cy + Math.sin(a) * 30, 3, 0, TAU); ctx.fill();
        }
      }
      // Blood/glitch decals.
      for (const p of g.particles) {
        if (!p.floor) continue;
        ctx.globalAlpha = 0.6 * (1 - p.t / p.dur);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
      }
      ctx.globalAlpha = 1;
      // Zones.
      for (const z of g.zones) this.drawZone(ctx, g, z, focus);
      // Debris shadows.
      for (const d of w.debris) {
        const f = 1 - d.t / d.max;
        ctx.fillStyle = `rgba(0,0,0,${0.25 + f * 0.4})`;
        ctx.beginPath(); ctx.arc(d.x, d.y, d.r * (0.4 + f * 0.6), 0, TAU); ctx.fill();
        ctx.strokeStyle = `rgba(255,80,80,${0.4 + 0.4 * Math.sin(t * 20)})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, TAU); ctx.stroke();
      }
      // Terminals.
      for (const gen of w.gens) this.drawTerminal(ctx, gen, t);
      // Barricades (SC's code walls).
      for (const [k, b] of w.barricades) {
        const x = (k % w.w) * T, y = ((k / w.w) | 0) * T;
        const fade = Math.min(1, b.t / 0.5);
        ctx.globalAlpha = 0.85 * fade;
        ctx.fillStyle = '#7d838c';
        ctx.fillRect(x + 1, y + 1, T - 2, T - 2);
        ctx.fillStyle = '#a3a9b0';
        for (let i = 0; i < 4; i++) ctx.fillRect(x + 4, y + 5 + i * 9, 10 + ((i * 7 + k) % 18), 5);
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(x + U.rand(0, 30), y + U.rand(0, 36), U.rand(4, 14), 2);
        ctx.globalAlpha = 1;
      }
      // Forks stuck in the ground.
      for (const f of g.forks) {
        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.strokeStyle = 'rgba(255,138,31,0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 14, -Math.PI / 2, -Math.PI / 2 + TAU * (f.t / 4)); ctx.stroke();
        ctx.rotate(f.a);
        this.drawFork(ctx, 0.9);
        ctx.restore();
      }
      // The DESTROY block, dropped (Final Round).
      if (g.finale && g.finale.block && g.finale.phase === 'down') {
        const b = g.finale.block;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.shadowColor = '#b3122a';
        ctx.shadowBlur = 16 + Math.sin(t * 4) * 6;
        this.drawBlock(ctx, 20);
        ctx.restore();
      }
    },

    drawZone(ctx, g, z, focus) {
      const fade = Math.min(1, z.t / 0.6);
      ctx.save();
      ctx.globalAlpha = fade;
      if (z.kind === 'fire') {
        const gr = ctx.createRadialGradient(z.x, z.y, 5, z.x, z.y, z.r);
        gr.addColorStop(0, 'rgba(255,200,60,0.55)');
        gr.addColorStop(0.7, 'rgba(255,90,20,0.4)');
        gr.addColorStop(1, 'rgba(255,60,20,0)');
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU); ctx.fill();
      } else if (z.kind === 'grease') {
        ctx.fillStyle = 'rgba(200,160,40,0.32)';
        ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r, z.r * 0.85, 0.3, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,240,180,0.25)';
        ctx.beginPath(); ctx.ellipse(z.x - z.r * 0.3, z.y - z.r * 0.25, z.r * 0.3, z.r * 0.15, 0.3, 0, TAU); ctx.fill();
      } else if (z.kind === 'vines') {
        // Survivors notice vines only up close; the Creaker always sees its own.
        if (focus.team === 'survivor' && U.dist(focus, z) > 260) ctx.globalAlpha = fade * 0.45;
        const rnd = mulberry(Math.floor(z.seed));
        ctx.strokeStyle = '#3f8f3a';
        ctx.lineWidth = 3;
        for (let i = 0; i < 9; i++) {
          const a = rnd() * TAU, r1 = rnd() * z.r * 0.4, r2 = z.r * (0.6 + rnd() * 0.4);
          ctx.beginPath();
          ctx.moveTo(z.x + Math.cos(a) * r1, z.y + Math.sin(a) * r1);
          ctx.quadraticCurveTo(z.x + Math.cos(a + 0.6) * r2 * 0.7, z.y + Math.sin(a + 0.6) * r2 * 0.7, z.x + Math.cos(a + 0.2) * r2, z.y + Math.sin(a + 0.2) * r2);
          ctx.stroke();
        }
        ctx.fillStyle = '#5fbf4a';
        for (let i = 0; i < 10; i++) {
          const a = rnd() * TAU, r = rnd() * z.r;
          ctx.beginPath(); ctx.ellipse(z.x + Math.cos(a) * r, z.y + Math.sin(a) * r, 4, 2, a, 0, TAU); ctx.fill();
        }
      } else if (z.kind === 'rally') {
        ctx.fillStyle = 'rgba(217,194,122,0.12)';
        ctx.strokeStyle = 'rgba(217,194,122,0.6)';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#4a3a22';
        ctx.fillRect(z.x - 2, z.y - 34, 4, 38);
        const wave = Math.sin(g.time * 6) * 3;
        ctx.fillStyle = '#ffab19';
        ctx.beginPath(); ctx.moveTo(z.x + 2, z.y - 34); ctx.lineTo(z.x + 26, z.y - 28 + wave); ctx.lineTo(z.x + 2, z.y - 18); ctx.fill();
      }
      ctx.restore();
    },

    drawTerminal(ctx, gen, t) {
      const x = gen.x, y = gen.y;
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(x - 15, y - 11, 34, 30);
      ctx.fillStyle = '#20232b';
      ctx.fillRect(x - 17, y - 16, 34, 32);
      ctx.strokeStyle = gen.done ? '#59c059' : '#4c97ff';
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 17, y - 16, 34, 32);
      // Scratch blocks snapping together as it compiles.
      const n = gen.done ? 4 : Math.floor(gen.progress * 4.999);
      for (let i = 0; i < 4; i++) {
        const by = y - 12 + i * 7;
        ctx.fillStyle = i < n ? BLOCK_COLORS[(i * 3 + gen.id) % BLOCK_COLORS.length] : 'rgba(255,255,255,0.08)';
        ctx.fillRect(x - 12 + (i % 2) * 3, by, 20 - (i % 2) * 3, 5);
        if (i < n) ctx.fillRect(x - 8 + (i % 2) * 3, by + 5, 4, 1.5);
      }
      if (gen.done) {
        ctx.fillStyle = '#59c059';
        ctx.fillRect(x + 9, y - 13, 2, 14);
        ctx.beginPath(); ctx.moveTo(x + 11, y - 13); ctx.lineTo(x + 17, y - 10); ctx.lineTo(x + 11, y - 7); ctx.fill();
        const gr = ctx.createRadialGradient(x, y, 5, x, y, 70);
        gr.addColorStop(0, 'rgba(89,192,89,0.25)');
        gr.addColorStop(1, 'rgba(89,192,89,0)');
        ctx.fillStyle = gr;
        ctx.fillRect(x - 70, y - 70, 140, 140);
      } else if (gen.progress > 0) {
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(x, y, 27, 0, TAU); ctx.stroke();
        ctx.strokeStyle = gen.repairers > 0 && Math.sin(t * 16) > 0 ? '#ffffff' : '#ffbf00';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y, 27, -Math.PI / 2, -Math.PI / 2 + TAU * gen.progress); ctx.stroke();
      }
    },

    drawBlock(ctx, s) {
      ctx.fillStyle = '#8e9094';
      ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(-s / 2, -s / 2, s, s * 0.2);
      ctx.strokeStyle = '#3e4044';
      ctx.lineWidth = Math.max(1, s / 14);
      ctx.strokeRect(-s / 2, -s / 2, s, s);
      ctx.fillStyle = '#b3122a';
      ctx.font = `bold ${Math.max(4, s * 0.2)}px Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('DESTROY', 0, 1);
    },
    drawFork(ctx, sc) {
      ctx.save();
      ctx.scale(sc, sc);
      ctx.shadowColor = '#ffb347';
      ctx.shadowBlur = 8;
      ctx.strokeStyle = '#ffd27a';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(6, 0); ctx.stroke();
      ctx.lineWidth = 2;
      for (const o of [-4, 0, 4]) { ctx.beginPath(); ctx.moveTo(6, o * 0.6); ctx.lineTo(14, o); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(6, -2.4); ctx.lineTo(6, 2.4); ctx.stroke();
      ctx.restore();
    },

    // ------------------------------------------------------------- entities
    visibleTo(g, viewer, e) {
      if (e === viewer || e.team === viewer.team) return true;
      return g.canSee(viewer, e);
    },
    drawEntities(ctx, g, v, focus) {
      const list = g.ents.slice().sort((a, b) => a.y - b.y);
      for (const e of list) {
        if (!e.dead || e.decoy) continue;
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = '#ff3b5c';
        for (let i = 0; i < 8; i++) ctx.fillRect(e.x - 18 + ((i * 13) % 36), e.y - 10 + ((i * 7) % 20), 4, 4);
        ctx.globalAlpha = 0.3;
        this.drawChar(ctx, e.def, e.x, e.y, 1.2, { ent: null, t: 0, scale: 0.9 });
        ctx.globalAlpha = 1;
      }
      for (const e of list) {
        if (e.dead || e.x < v.x0 || e.x > v.x1 || e.y < v.y0 || e.y > v.y1) continue;
        if (!this.visibleTo(g, focus, e)) continue;
        // Survivors can tell their own teammates' clones apart.
        let alpha = e.decoy && focus.team === 'survivor' ? 0.55 : 1;
        if (e.flying) {
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.beginPath(); ctx.ellipse(e.x + 10, e.y + 18, e.r, e.r * 0.6, 0, 0, TAU); ctx.fill();
        }
        this.drawTelegraph(ctx, g, e);
        ctx.globalAlpha = alpha;
        const lift = e.flying ? -10 : 0;
        this.drawChar(ctx, e.def, e.x, e.y + lift, e.facing, { ent: e, t: e.anim, g, scale: e.flying ? 1.12 : 1 });
        ctx.globalAlpha = 1;
        this.drawStatus(ctx, g, e, focus);
      }
    },

    drawTelegraph(ctx, g, e) {
      const c = e.cast;
      if (!c) return;
      const f = U.clamp(c.t / Math.max(0.01, c.windup), 0, 1);
      const a = c.facing;
      const col = e.team === 'killer' ? '255,60,60' : '120,220,255';
      ctx.save();
      ctx.globalAlpha = 0.25 + f * 0.35;
      ctx.fillStyle = `rgba(${col},0.35)`;
      ctx.strokeStyle = `rgba(${col},0.9)`;
      ctx.lineWidth = 2;
      const wedge = (range, arc) => {
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.arc(e.x, e.y, range, a - arc / 2, a + arc / 2); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.arc(e.x, e.y, range * f, a - arc / 2, a + arc / 2); ctx.closePath();
        ctx.fillStyle = `rgba(${col},0.5)`; ctx.fill();
      };
      const line = (len, w) => {
        ctx.translate(e.x, e.y); ctx.rotate(a);
        ctx.fillRect(0, -w / 2, len, w); ctx.strokeRect(0, -w / 2, len, w);
        ctx.fillStyle = `rgba(${col},0.5)`; ctx.fillRect(0, -w / 2, len * f, w);
      };
      const circleAt = (x, y, r) => {
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, r * f, 0, TAU); ctx.fillStyle = `rgba(${col},0.45)`; ctx.fill();
      };
      const lobAt = (max) => Ent.lob(e, c, max);
      switch (c.id) {
        case 'm1': wedge(e.def.m1.range, e.def.m1.arc); break;
        case 'sc_laser': line(720, 30); break;
        case 'sc_reshape': {
          const p = lobAt(300);
          const s = a + Math.PI / 2;
          for (const k of [-1, 0, 1]) {
            const tx = Math.floor((p.x + Math.cos(s) * k * T) / T) * T, ty = Math.floor((p.y + Math.sin(s) * k * T) / T) * T;
            ctx.strokeRect(tx + 2, ty + 2, T - 4, T - 4);
            ctx.fillRect(tx + 2, ty + T - 2 - (T - 4) * f, T - 4, (T - 4) * f);
          }
          break;
        }
        case 'p2_hack': line(520, 10); break;
        case 'p2_arson': { const p = lobAt(300); circleAt(p.x, p.y, 85); break; }
        case 'burg_grease': { const p = lobAt(280); circleAt(p.x, p.y, 95); break; }
        case 'creak_vines': { const p = lobAt(320); circleAt(p.x, p.y, 70); break; }
        case 'burg_roar': circleAt(e.x, e.y, 180); break;
        case 'burg_dive': line(320, 40); break;
        case 'creak_lash': line(420, 14); break;
        case 'rev_fork': if (!c.warp) line(560, 8); break;
        case 'rev_draw': line(480, 14); break;
        case 'griff_stop': wedge(85, 1.9); break;
        case 'scr_charm': wedge(130, 1.75); break;
        case 'scr_lesson': circleAt(e.x, e.y, 220); break;
        case 'nano_rally': circleAt(e.x, e.y, 130); break;
        default:
          ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 8 + f * 30, 0, TAU); ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = e.team === 'killer' ? '#ff4040' : '#7ad7ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r + 6, -Math.PI / 2, -Math.PI / 2 + TAU * f);
      ctx.stroke();
    },

    drawStatus(ctx, g, e, focus) {
      const t = g.time;
      const top = e.y - e.r - 16 - (e.flying ? 10 : 0);
      ctx.font = 'bold 11px "Trebuchet MS", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = e.team === 'killer' ? '#ff8080' : e.isPlayer ? '#ffffff' : '#d8d8d8';
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.lineWidth = 3;
      ctx.strokeText(e.name, e.x, top - 6);
      ctx.fillText(e.name, e.x, top - 6);
      if (e.team === 'survivor') {
        const w = 34;
        const hp = e.decoy ? e.hpShown : e.hp;
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(e.x - w / 2 - 1, top - 2, w + 2, 6);
        const f = hp / e.maxHp;
        ctx.fillStyle = f > 0.6 ? '#5dd36a' : f > 0.3 ? '#ffc23f' : '#ff4040';
        ctx.fillRect(e.x - w / 2, top - 1, w * f, 4);
      }
      if (e.team === 'killer' && e.def.id === 'burgers' && e.adapt) {
        for (let i = 0; i < e.adapt; i++) { ctx.fillStyle = '#ff4b2b'; ctx.fillRect(e.x - 14 + i * 6, top + 2, 4, 4); }
      }
      const bar = (f, col) => {
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(e.x - 21, e.y + e.r + 6, 42, 6);
        ctx.fillStyle = col;
        ctx.fillRect(e.x - 20, e.y + e.r + 7, 40 * f, 4);
      };
      if (e.channel) bar(e.channel.t / e.channel.dur, '#8fc8ff');
      else if (e.repairing) bar(e.repairing.progress, '#ffbf00');
      if (Ent.has(e, 'stun') || Ent.has(e, 'charmed')) {
        const ch = Ent.has(e, 'charmed');
        for (let i = 0; i < 3; i++) {
          const a2 = t * 6 + (i * TAU) / 3;
          const px = e.x + Math.cos(a2) * (e.r + 4), py = e.y - e.r - 2 + Math.sin(a2) * 5;
          if (ch) { ctx.fillStyle = '#ff6fa8'; ctx.font = '12px Arial'; ctx.fillText('♥', px, py + 4); }
          else this.star(ctx, px, py, 4, '#e6ff4a');
        }
      }
      if (Ent.has(e, 'hacked')) {
        ctx.fillStyle = '#39ff88';
        ctx.font = 'bold 10px monospace';
        ctx.fillText(Math.random() < 0.5 ? '01101' : '10010', e.x + U.rand(-4, 4), top - 20);
      }
      if (Ent.has(e, 'slow') || Ent.has(e, 'tangled') || Ent.has(e, 'greased')) {
        ctx.strokeStyle = Ent.has(e, 'tangled') ? 'rgba(95,191,74,0.9)' : 'rgba(120,170,255,0.8)';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 3, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
      }
      if (Ent.has(e, 'root')) {
        ctx.strokeStyle = '#3f8f3a';
        ctx.lineWidth = 3;
        for (let i = 0; i < 4; i++) {
          const a2 = (i / 4) * TAU + t;
          ctx.beginPath(); ctx.arc(e.x + Math.cos(a2) * e.r * 0.7, e.y + Math.sin(a2) * e.r * 0.7, 5, 0, Math.PI); ctx.stroke();
        }
      }
      if (Ent.has(e, 'burning') && Math.random() < 0.6) g.particles.push({ x: e.x + U.rand(-8, 8), y: e.y, vx: 0, vy: -60, t: 0, dur: 0.4, color: '#ff7a1a', size: 3 });
      if (Ent.has(e, 'corrupt')) {
        ctx.strokeStyle = `rgba(255,60,20,${0.5 + 0.3 * Math.sin(t * 14)})`;
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 7 + Math.sin(t * 14) * 2, 0, TAU); ctx.stroke();
      }
      if (Ent.has(e, 'lesson')) {
        ctx.fillStyle = '#ffab19';
        ctx.font = 'bold 10px Arial';
        ctx.fillText('✎', e.x + e.r + 4, top + 4);
      }
      if (Ent.has(e, 'hitboost') || Ent.has(e, 'loyal') || Ent.has(e, 'decree')) {
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 2;
        const b = U.norm(-e.vx, -e.vy);
        for (let i = -1; i <= 1; i++) {
          const ox = -b.y * i * 7, oy = b.x * i * 7;
          ctx.beginPath();
          ctx.moveTo(e.x + b.x * e.r + ox, e.y + b.y * e.r + oy);
          ctx.lineTo(e.x + b.x * (e.r + 18) + ox, e.y + b.y * (e.r + 18) + oy);
          ctx.stroke();
        }
      }
    },

    drawReveals(ctx, g, focus) {
      for (const e of g.ents) {
        if (e.dead || e.team === focus.team || !Ent.has(e, 'revealed')) continue;
        const col = e.team === 'killer' ? '#ffab19' : '#ff4b5c';
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = col;
        ctx.shadowColor = col;
        ctx.shadowBlur = 12;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 3, 0, TAU); ctx.stroke();
        ctx.font = 'bold 11px "Trebuchet MS", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = col;
        ctx.fillText(e.name, e.x, e.y - e.r - 10);
        ctx.restore();
      }
    },

    star(ctx, x, y, r, col) {
      ctx.fillStyle = col;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU - Math.PI / 2, rr = i % 2 ? r * 0.45 : r;
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
    },

    // ----------------------------------------------------- character art
    // A top-down Scratch cat. Local +x is forward.
    drawCat(ctx, r, col, belly, t, moving, eyeCol = '#222', opts = {}) {
      // Tail.
      ctx.strokeStyle = col;
      ctx.lineWidth = r * 0.32;
      ctx.lineCap = 'round';
      const wag = Math.sin(t * (moving ? 10 : 3)) * r * 0.35;
      ctx.beginPath();
      ctx.moveTo(-r * 0.7, 0);
      ctx.quadraticCurveTo(-r * 1.4, wag, -r * 1.65, -r * 0.5 + wag * 0.5);
      ctx.stroke();
      ctx.lineCap = 'butt';
      // Body.
      ctx.fillStyle = opts.suit || col;
      ctx.beginPath(); ctx.ellipse(-r * 0.15, 0, r * 0.85, r * 0.75, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 2;
      ctx.stroke();
      if (!opts.suit) {
        ctx.fillStyle = belly;
        ctx.beginPath(); ctx.ellipse(-r * 0.1, 0, r * 0.45, r * 0.4, 0, 0, TAU); ctx.fill();
      }
      // Paws.
      const step = moving ? Math.sin(t * 16) * r * 0.15 : 0;
      ctx.fillStyle = col;
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.arc(r * 0.45 + step * s, s * r * 0.62, r * 0.22, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
      }
      // Head and ears.
      const hx = r * 0.55;
      ctx.fillStyle = col;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(hx - r * 0.15, s * r * 0.25);
        ctx.lineTo(hx - r * 0.05, s * r * 0.95);
        ctx.lineTo(hx + r * 0.35, s * r * 0.4);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 1.5; ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(hx, 0, r * 0.58, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = belly;
      ctx.beginPath(); ctx.ellipse(hx + r * 0.3, 0, r * 0.22, r * 0.3, 0, 0, TAU); ctx.fill();
      // Eyes.
      ctx.fillStyle = eyeCol;
      if (opts.eyeGlow) { ctx.shadowColor = opts.eyeGlow; ctx.shadowBlur = 10; }
      ctx.beginPath(); ctx.arc(hx + r * 0.32, -r * 0.2, r * 0.1, 0, TAU); ctx.arc(hx + r * 0.32, r * 0.2, r * 0.1, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#e88aa0';
      ctx.beginPath(); ctx.arc(hx + r * 0.52, 0, r * 0.07, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1;
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(hx + r * 0.45, s * r * 0.12); ctx.lineTo(hx + r * 0.85, s * r * 0.4); ctx.stroke();
      }
    },

    drawChar(ctx, def, x, y, facing, o = {}) {
      const e = o.ent;
      const t = o.t || 0;
      const r = def.r * (o.scale || 1);
      const has = (k) => e && e.effects && Ent.has(e, k);
      const moving = e ? Math.hypot(e.vx, e.vy) > 20 : false;
      const bob = moving ? Math.sin(t * 16) * 1.2 : 0;

      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(3, 5, r * 1.05, r * 0.85, 0, 0, TAU); ctx.fill();
      if (has('downed')) { ctx.rotate(1.3); ctx.globalAlpha *= 0.85; }
      ctx.rotate(facing);

      const roundBody = (col, col2) => {
        const gr = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
        gr.addColorStop(0, col2);
        gr.addColorStop(1, col);
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();
      };
      const hands = (col, spread = 0.75) => {
        ctx.fillStyle = col;
        for (const s of [-1, 1]) {
          ctx.beginPath(); ctx.arc(r * 0.65 + (s > 0 ? bob : -bob), s * r * spread, r * 0.26, 0, TAU); ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
        }
      };
      const crown = (cx, rr, col, jewel) => {
        ctx.fillStyle = col;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * TAU, k = i % 2 ? rr * 0.75 : rr * 1.15;
          ctx.lineTo(cx + Math.cos(a) * k, Math.sin(a) * k);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = jewel;
        ctx.beginPath(); ctx.arc(cx, 0, rr * 0.3, 0, TAU); ctx.fill();
      };

      switch (def.id) {
        case 'sc': {
          // 0.4, lightened: pale grey, burning grey eyes, a crown, the block.
          ctx.save();
          ctx.globalAlpha *= 0.35;
          ctx.fillStyle = '#000';
          ctx.beginPath(); ctx.arc(0, 0, r * 1.35, 0, TAU); ctx.fill();
          ctx.restore();
          this.drawCat(ctx, r, '#c9ccd1', '#e8eaed', t, moving, '#f5f5f5', { eyeGlow: '#ffffff' });
          ctx.save();
          ctx.translate(r * 0.55, 0);
          crown(0, r * 0.38, '#ffd23f', '#b3122a');
          ctx.restore();
          if (!(o.g && o.g.finale && o.g.finale.phase !== 'fight' && o.g.finale.phase !== 'stopped')) {
            ctx.save();
            ctx.translate(r * 0.95, r * 0.75);
            const charging = e && e.cast && e.cast.id === 'sc_laser';
            if (charging) { ctx.shadowColor = '#ff2040'; ctx.shadowBlur = 20; }
            ctx.rotate(-facing);
            this.drawBlock(ctx, r * 0.75);
            ctx.restore();
          }
          break;
        }
        case 'protocol2': {
          // Cape.
          const sway = Math.sin(t * 4) * 3;
          ctx.fillStyle = '#1f2a7a';
          ctx.beginPath();
          ctx.moveTo(r * 0.2, -r * 0.95);
          ctx.quadraticCurveTo(-r * 1.6, -r * 1.1 + sway, -r * 1.75, sway);
          ctx.quadraticCurveTo(-r * 1.6, r * 1.1 + sway, r * 0.2, r * 0.95);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 1.5; ctx.stroke();
          roundBody('#2a3592', '#5a6ad8');
          hands('#c9d0dc', 0.75);
          // Scepter.
          ctx.strokeStyle = '#c9ccd1'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(r * 0.6, r * 0.75); ctx.lineTo(r * 1.6, r * 0.6); ctx.stroke();
          ctx.fillStyle = '#39ff88';
          ctx.shadowColor = '#39ff88'; ctx.shadowBlur = 10;
          ctx.beginPath(); ctx.arc(r * 1.65, r * 0.6, 3.5, 0, TAU); ctx.fill();
          ctx.shadowBlur = 0;
          // Head, visor and silver crown.
          ctx.fillStyle = '#1a1f3a';
          ctx.beginPath(); ctx.arc(r * 0.15, 0, r * 0.52, 0, TAU); ctx.fill();
          ctx.fillStyle = '#0a2a14';
          ctx.fillRect(r * 0.4, -r * 0.4, r * 0.22, r * 0.8);
          ctx.fillStyle = '#39ff88';
          for (let i = 0; i < 4; i++) ctx.fillRect(r * 0.42, -r * 0.36 + ((t * 30 + i * 6) % (r * 0.72)), r * 0.18, 1.5);
          ctx.save(); ctx.translate(r * 0.05, 0); crown(0, r * 0.3, '#d6dae0', '#39ff88'); ctx.restore();
          break;
        }
        case 'burgers': {
          // Boxy robot with a chef hat and a spatula.
          ctx.fillStyle = '#5c6470';
          ctx.fillRect(-r * 0.95, -r * 0.95, r * 1.9, r * 1.9);
          const gr = ctx.createLinearGradient(-r, -r, r, r);
          gr.addColorStop(0, '#a9b2bf'); gr.addColorStop(1, '#6b7380');
          ctx.fillStyle = gr;
          ctx.fillRect(-r * 0.85, -r * 0.85, r * 1.7, r * 1.7);
          ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 2;
          ctx.strokeRect(-r * 0.85, -r * 0.85, r * 1.7, r * 1.7);
          ctx.fillStyle = '#3d434c';
          for (const [px, py] of [[-0.65, -0.65], [0.65, -0.65], [-0.65, 0.65], [0.65, 0.65]]) { ctx.beginPath(); ctx.arc(px * r, py * r, 2, 0, TAU); ctx.fill(); }
          ctx.fillStyle = '#b3122a';
          ctx.beginPath(); ctx.arc(-r * 0.4, r * 0.35, r * 0.15, 0, TAU); ctx.fill();
          // Arms + spatula.
          ctx.fillStyle = '#7d8796';
          ctx.fillRect(r * 0.5, -r * 1.15, r * 0.6, r * 0.35);
          ctx.fillRect(r * 0.5 + bob, r * 0.8, r * 0.6, r * 0.35);
          ctx.fillStyle = '#5a3a1e';
          ctx.fillRect(r * 1.0, r * 0.9, r * 0.7, 3);
          ctx.fillStyle = '#d6dae0';
          ctx.fillRect(r * 1.6, r * 0.68, r * 0.45, r * 0.55);
          // Optic.
          ctx.fillStyle = '#220';
          ctx.fillRect(r * 0.6, -r * 0.3, r * 0.28, r * 0.6);
          ctx.fillStyle = '#ff2b2b';
          ctx.shadowColor = '#ff2b2b'; ctx.shadowBlur = 12;
          ctx.beginPath(); ctx.arc(r * 0.74, 0, r * 0.16, 0, TAU); ctx.fill();
          ctx.shadowBlur = 0;
          // Chef hat.
          ctx.fillStyle = '#ffffff';
          for (const [px, py, pr] of [[-0.15, 0, 0.42], [-0.35, -0.3, 0.3], [-0.35, 0.3, 0.3], [0.08, -0.28, 0.28], [0.08, 0.28, 0.28]]) {
            ctx.beginPath(); ctx.arc(px * r, py * r, pr * r, 0, TAU); ctx.fill();
          }
          ctx.strokeStyle = '#cfd4da'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(-r * 0.15, 0, r * 0.42, 0, TAU); ctx.stroke();
          break;
        }
        case 'creaker': {
          // Rusted, vine-wrapped prototype with a cracked, glowing face.
          ctx.fillStyle = '#4d5848';
          ctx.fillRect(-r * 0.9, -r * 0.85, r * 1.7, r * 1.7);
          ctx.fillStyle = '#6a7563';
          ctx.fillRect(-r * 0.75, -r * 0.7, r * 1.4, r * 1.4);
          ctx.fillStyle = 'rgba(140,80,40,0.5)';
          ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.4, r * 0.25, 0, TAU); ctx.fill();
          ctx.beginPath(); ctx.arc(r * 0.2, r * 0.45, r * 0.2, 0, TAU); ctx.fill();
          hands('#4d5848', 0.85);
          // Face plate with crack.
          ctx.fillStyle = '#8a947f';
          ctx.fillRect(r * 0.35, -r * 0.5, r * 0.5, r * 1.0);
          ctx.save();
          ctx.shadowColor = '#bfe9ff'; ctx.shadowBlur = 14;
          ctx.strokeStyle = '#dff4ff'; ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(r * 0.4, -r * 0.45); ctx.lineTo(r * 0.6, -r * 0.1); ctx.lineTo(r * 0.5, r * 0.1); ctx.lineTo(r * 0.75, r * 0.45);
          ctx.stroke();
          ctx.fillStyle = '#dff4ff';
          ctx.beginPath(); ctx.arc(r * 0.65, -r * 0.22, 2, 0, TAU); ctx.fill();
          ctx.restore();
          // Vines wrapping the body.
          ctx.strokeStyle = '#3f8f3a'; ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(-r * 0.9, -r * 0.6); ctx.bezierCurveTo(-r * 0.2, -r * 1.0, r * 0.1, r * 0.2, -r * 0.6, r * 0.9);
          ctx.moveTo(-r * 0.1, -r * 0.85); ctx.bezierCurveTo(r * 0.3, -r * 0.2, -r * 0.6, r * 0.2, r * 0.2, r * 0.85);
          ctx.stroke();
          ctx.fillStyle = '#5fbf4a';
          for (const [px, py] of [[-0.5, -0.75], [0.1, 0.1], [-0.4, 0.6], [0.25, -0.5]]) { ctx.beginPath(); ctx.ellipse(px * r, py * r, 4, 2, px * 3, 0, TAU); ctx.fill(); }
          break;
        }
        case 'revengest': {
          const corrupt = has('corrupt');
          // Father's scarf tails trailing behind.
          const wave = Math.sin(t * 12) * 4;
          ctx.strokeStyle = '#8a2a22';
          ctx.lineWidth = 4;
          for (const s of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(-r * 0.3, s * 3);
            ctx.quadraticCurveTo(-r * 1.2, s * 6 + wave, -r * 1.9, s * 3 - wave + (moving ? 0 : s * 5));
            ctx.stroke();
          }
          // Distorted glowing limbs.
          ctx.strokeStyle = corrupt ? '#ff3b1a' : '#ff9a2a';
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          for (const s of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(0, s * r * 0.6);
            ctx.quadraticCurveTo(r * 0.3, s * r * 1.5 + bob * s, r * 1.0, s * r * 1.05);
            ctx.lineTo(r * 1.25, s * r * 0.75);
            ctx.stroke();
          }
          ctx.lineCap = 'butt';
          ctx.save();
          ctx.shadowColor = corrupt ? '#ff2a00' : '#ff8a1f';
          ctx.shadowBlur = 16;
          const gr = ctx.createRadialGradient(-r * 0.2, -r * 0.2, 2, 0, 0, r);
          gr.addColorStop(0, '#fff1a8');
          gr.addColorStop(1, corrupt ? '#d43a10' : '#ff8a1f');
          ctx.fillStyle = gr;
          ctx.beginPath();
          for (let i = 0; i < 12; i++) {
            const a = (i / 12) * TAU, k = r * (0.92 + 0.12 * Math.sin(i * 2.7 + t * 6));
            ctx.lineTo(Math.cos(a) * k, Math.sin(a) * k);
          }
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          // Scarf wrap.
          ctx.strokeStyle = '#8a2a22'; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.arc(0, 0, r * 0.62, Math.PI * 0.55, Math.PI * 1.45); ctx.stroke();
          // Sheriff hat: wide brim + crown.
          ctx.fillStyle = '#6b4423';
          ctx.beginPath(); ctx.ellipse(r * 0.1, 0, r * 0.75, r * 0.85, 0, 0, TAU); ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
          ctx.fillStyle = '#4a2e15';
          ctx.beginPath(); ctx.ellipse(r * 0.1, 0, r * 0.42, r * 0.5, 0, 0, TAU); ctx.fill();
          // Star badge.
          this.star(ctx, -r * 0.35, r * 0.5, r * 0.22, '#ffd23f');
          // Fork in hand.
          if (!(o.g && o.g.forks.some((f) => f.owner === e)) && !(o.g && o.g.projectiles.some((p) => p.kind === 'fork' && p.owner === e))) {
            ctx.save(); ctx.translate(r * 1.25, r * 0.75); this.drawFork(ctx, 0.75); ctx.restore();
          }
          break;
        }
        case 'scratchy': {
          this.drawCat(ctx, r, '#ffab19', '#fff3d6', t, moving, '#222', { suit: '#2b2f3a' });
          // White collar and the red tie of MIT's mascot, on the suit behind the head.
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.moveTo(-r * 0.02, -r * 0.42); ctx.lineTo(-r * 0.3, 0); ctx.lineTo(-r * 0.02, r * 0.42); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#d42a2a';
          ctx.beginPath(); ctx.moveTo(-r * 0.05, 0); ctx.lineTo(-r * 0.4, -r * 0.11); ctx.lineTo(-r * 0.75, 0); ctx.lineTo(-r * 0.4, r * 0.11); ctx.closePath(); ctx.fill();
          break;
        }
        case 'griffpatch': {
          roundBody('#2a6fd6', '#7fb0ff');
          hands('#f0c9a0', 0.75);
          ctx.fillStyle = '#3a2a1e';
          ctx.beginPath(); ctx.arc(r * 0.12, 0, r * 0.55, 0, TAU); ctx.fill();
          // Headset band + mic.
          ctx.strokeStyle = '#1b1d22'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(r * 0.12, 0, r * 0.58, -Math.PI * 0.6, Math.PI * 0.6, true); ctx.stroke();
          ctx.fillStyle = '#1b1d22';
          ctx.fillRect(r * 0.0, -r * 0.75, r * 0.3, r * 0.22);
          ctx.fillRect(r * 0.0, r * 0.53, r * 0.3, r * 0.22);
          ctx.strokeStyle = '#1b1d22'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(r * 0.25, r * 0.65); ctx.quadraticCurveTo(r * 0.8, r * 0.6, r * 0.75, r * 0.2); ctx.stroke();
          ctx.fillStyle = '#ff4b5c';
          ctx.beginPath(); ctx.arc(r * 0.75, r * 0.2, 2.5, 0, TAU); ctx.fill();
          // Follower star, always shining.
          ctx.save();
          ctx.shadowColor = '#ffd23f'; ctx.shadowBlur = 10;
          this.star(ctx, -r * 0.55, -r * 0.55, r * 0.32, '#ffd23f');
          ctx.restore();
          break;
        }
        case 'nano': {
          roundBody('#45602b', '#7fa05a');
          // Epaulettes.
          ctx.fillStyle = '#d9c27a';
          for (const s of [-1, 1]) {
            ctx.fillRect(-r * 0.35, s * r * 0.75 - r * 0.15, r * 0.5, r * 0.3);
            ctx.strokeStyle = '#8a7a3a'; ctx.lineWidth = 1;
            for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-r * 0.3 + i * r * 0.15, s * r * 0.75 + r * 0.15); ctx.lineTo(-r * 0.3 + i * r * 0.15, s * r * 0.75 + r * 0.3 * s); ctx.stroke(); }
          }
          hands('#e0b48a', 0.78);
          // Dog tags.
          ctx.fillStyle = '#c9ccd1';
          ctx.fillRect(r * 0.45, -r * 0.08, 4, 6);
          // Head + beret.
          ctx.fillStyle = '#e0b48a';
          ctx.beginPath(); ctx.arc(r * 0.1, 0, r * 0.45, 0, TAU); ctx.fill();
          ctx.fillStyle = '#2f4a1e';
          ctx.beginPath(); ctx.ellipse(-r * 0.02, -r * 0.1, r * 0.48, r * 0.42, 0.3, 0, TAU); ctx.fill();
          ctx.fillStyle = '#d9c27a';
          ctx.beginPath(); ctx.arc(r * 0.2, -r * 0.18, 2.2, 0, TAU); ctx.fill();
          // Round shield.
          const sh = has('shield');
          ctx.save();
          if (sh) { ctx.shadowColor = '#d9c27a'; ctx.shadowBlur = 16; }
          ctx.fillStyle = sh ? '#f5e3a8' : '#8a7a4a';
          ctx.strokeStyle = sh ? '#ffffff' : '#4a3e22';
          ctx.lineWidth = 2;
          const sr = sh ? r * 0.95 : r * 0.6, sxp = sh ? r * 1.1 : r * 0.7, syp = sh ? 0 : -r * 0.75;
          ctx.beginPath(); ctx.ellipse(sxp, syp, sr * 0.35, sr, 0, 0, TAU); ctx.fill(); ctx.stroke();
          ctx.restore();
          if (sh) {
            ctx.strokeStyle = 'rgba(217,194,122,0.5)'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(0, 0, r * 1.9, -1.2, 1.2); ctx.stroke();
          }
          break;
        }
      }
      ctx.restore();
    },

    // ---------------------------------------------------- projectiles & fx
    drawProjectiles(ctx, g) {
      for (const p of g.projectiles) {
        if (p.kind === 'lob') {
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, TAU); ctx.fill();
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y - (p.h || 0), 7, 0, TAU); ctx.fill();
          continue;
        }
        if (p.kind === 'vine') {
          ctx.strokeStyle = '#3f8f3a';
          ctx.lineWidth = 4;
          ctx.beginPath(); ctx.moveTo(p.owner.x, p.owner.y);
          const mx = (p.owner.x + p.x) / 2 + Math.sin(g.time * 30) * 6, my = (p.owner.y + p.y) / 2 + Math.cos(g.time * 30) * 6;
          ctx.quadraticCurveTo(mx, my, p.x, p.y); ctx.stroke();
        }
        if (p.kind === 'fork') {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); this.drawFork(ctx, 1); ctx.restore();
          continue;
        }
        if (p.kind === 'hack') {
          ctx.fillStyle = '#39ff88';
          ctx.font = 'bold 12px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('</>', p.x, p.y + 4);
          continue;
        }
        ctx.save();
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 12;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
        ctx.restore();
      }
    },

    drawFx(ctx, g) {
      for (const p of g.particles) {
        if (p.floor || p.snow) continue;
        const f = p.t / p.dur;
        ctx.globalAlpha = 1 - f;
        ctx.fillStyle = p.color;
        if (p.shape === 'block') ctx.fillRect(p.x - p.size, p.y - p.size * 0.6, p.size * 2, p.size * 1.2);
        else if (p.shape === 'code') { ctx.font = 'bold 9px monospace'; ctx.fillText(Math.random() < 0.5 ? '0' : '1', p.x, p.y); }
        else if (p.shape === 'leaf') { ctx.beginPath(); ctx.ellipse(p.x, p.y, 3, 1.5, p.t * 3, 0, TAU); ctx.fill(); }
        else { ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill(); }
      }
      ctx.globalAlpha = 1;
      for (const f of g.fx) {
        const k = f.t / f.dur;
        ctx.globalAlpha = 1 - k;
        if (f.type === 'ring') {
          const r = U.lerp(f.r0, f.r1, Math.sqrt(k));
          if (f.fill) { ctx.fillStyle = U.hexA(f.color, 0.25 * (1 - k)); ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, TAU); ctx.fill(); }
          ctx.strokeStyle = f.color;
          ctx.lineWidth = 4;
          ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, TAU); ctx.stroke();
        } else if (f.type === 'swing' || f.type === 'cone') {
          ctx.strokeStyle = f.color;
          ctx.lineWidth = f.wide ? 10 : 6;
          ctx.beginPath();
          const a0 = f.a - f.arc / 2, a1 = f.a + f.arc / 2;
          ctx.arc(f.x, f.y, f.range * 0.85, a0 + (a1 - a0) * Math.max(0, k - 0.3), a0 + (a1 - a0) * Math.min(1, k * 2 + 0.2));
          ctx.stroke();
          if (f.type === 'cone') {
            ctx.fillStyle = '#ff6fa8';
            ctx.font = '14px Arial';
            for (let i = 0; i < 4; i++) {
              const a = f.a + (i - 1.5) * 0.35;
              ctx.fillText('♥', f.x + Math.cos(a) * f.range * k, f.y + Math.sin(a) * f.range * k);
            }
          }
        } else if (f.type === 'beam') {
          ctx.strokeStyle = f.color;
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x2, f.y2); ctx.stroke();
        } else if (f.type === 'laser' || f.type === 'bolt') {
          const laser = f.type === 'laser';
          ctx.save();
          ctx.translate(f.x, f.y);
          ctx.rotate(f.a);
          ctx.shadowColor = laser ? '#ff2040' : '#ff8a1f';
          ctx.shadowBlur = 24;
          ctx.fillStyle = laser ? '#ff3050' : '#ffb347';
          const w = (laser ? 30 : 8) * (1 - k * 0.6);
          ctx.fillRect(0, -w / 2, f.len, w);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, -w / 6, f.len, w / 3);
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
    },

    // ------------------------------------------------------------- darkness
    drawDarkness(ctx, g, focus, W, H, dpr) {
      const d = this.dark;
      if (d.width !== ctx.canvas.width || d.height !== ctx.canvas.height) { d.width = ctx.canvas.width; d.height = ctx.canvas.height; }
      const dc = d.getContext('2d');
      dc.setTransform(dpr, 0, 0, dpr, 0, 0);
      dc.globalCompositeOperation = 'source-over';
      dc.clearRect(0, 0, W, H);
      const dim = g.world.dim && g.world.dim.on;
      dc.fillStyle = `rgba(3,2,8,${dim ? 0.95 : g.mapDef.dark})`;
      dc.fillRect(0, 0, W, H);
      dc.globalCompositeOperation = 'destination-out';
      const cam = g.cam;
      const px = (focus.x - cam.x) * cam.zoom + W / 2, py = (focus.y - cam.y) * cam.zoom + H / 2;
      const vr = g.visionRadius * cam.zoom;
      const gr = dc.createRadialGradient(px, py, vr * 0.35, px, py, vr);
      gr.addColorStop(0, 'rgba(0,0,0,1)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      dc.fillStyle = gr;
      dc.fillRect(0, 0, W, H);
      for (const gen of g.world.gens) {
        if (!gen.done) continue;
        const gx = (gen.x - cam.x) * cam.zoom + W / 2, gy = (gen.y - cam.y) * cam.zoom + H / 2;
        const rr = 140 * cam.zoom;
        if (gx < -rr || gy < -rr || gx > W + rr || gy > H + rr) continue;
        const g2 = dc.createRadialGradient(gx, gy, 0, gx, gy, rr);
        g2.addColorStop(0, 'rgba(0,0,0,0.8)');
        g2.addColorStop(1, 'rgba(0,0,0,0)');
        dc.fillStyle = g2;
        dc.fillRect(gx - rr, gy - rr, rr * 2, rr * 2);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(d, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    },

    // ------------------------------------------------------------------ HUD
    drawHUD(ctx, g, W, H, focus) {
      const p = g.player;
      const k = g.killer;
      const F = '"Trebuchet MS", Arial, sans-serif';
      if (focus.team === 'survivor' && !focus.dead && k.def.terror) {
        const d = U.dist(focus, k);
        if (d < k.def.terror) {
          const f = 1 - d / k.def.terror;
          const pulse = 0.6 + 0.4 * Math.sin(g.time * (4 + f * 8));
          const gr = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
          gr.addColorStop(0, 'rgba(120,0,0,0)');
          gr.addColorStop(1, `rgba(150,0,0,${0.45 * f * pulse})`);
          ctx.fillStyle = gr;
          ctx.fillRect(0, 0, W, H);
        }
      }
      if (focus.team === 'survivor' && Ent.has(focus, 'revealed')) {
        ctx.strokeStyle = `rgba(255,75,92,${0.3 + 0.2 * Math.sin(g.time * 6)})`;
        ctx.lineWidth = 12;
        ctx.strokeRect(0, 0, W, H);
      }
      if (focus.isPlayer && Ent.has(focus, 'hacked')) {
        ctx.fillStyle = 'rgba(57,255,136,0.08)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = 'rgba(57,255,136,0.5)';
        ctx.font = 'bold 12px monospace';
        for (let i = 0; i < 12; i++) ctx.fillText(Math.random().toString(2).slice(2, 12), U.rand(0, W), U.rand(0, H));
      }

      // Timer + terminals.
      ctx.textAlign = 'center';
      this.panel(ctx, W / 2 - 110, 10, 220, 74);
      if (g.finale) {
        ctx.fillStyle = '#ffd23f';
        ctx.font = `bold 26px ${F}`;
        ctx.fillText('ROUND 500', W / 2, 42);
        ctx.font = `10px ${F}`;
        ctx.fillStyle = '#a8a2b8';
        ctx.fillText('THE LAST ONE', W / 2, 57);
      } else {
        ctx.fillStyle = g.timer < 30 ? '#ffcf5a' : '#f2eefc';
        ctx.font = `bold 30px ${F}`;
        ctx.fillText(U.fmtTime(g.timer), W / 2, 44);
        ctx.font = `10px ${F}`;
        ctx.fillStyle = '#a8a2b8';
        ctx.fillText('UNTIL SC RESETS THE ROUND', W / 2, 57);
      }
      const gens = g.world.gens;
      const gw = 30;
      gens.forEach((gen, i) => {
        const x = W / 2 - (gens.length * gw) / 2 + i * gw + 4, y = 63;
        ctx.fillStyle = '#222';
        ctx.fillRect(x, y, gw - 8, 13);
        ctx.fillStyle = gen.done ? '#59c059' : '#ffbf00';
        ctx.fillRect(x, y + 13 - 13 * gen.progress, gw - 8, 13 * gen.progress);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, gw - 8, 13);
      });

      ctx.textAlign = 'left';
      this.panel(ctx, 10, 10, 210, 26 + g.survivors.length * 30);
      ctx.font = `bold 11px ${F}`;
      ctx.fillStyle = '#a8a2b8';
      ctx.fillText('SURVIVORS', 20, 28);
      g.survivors.forEach((s, i) => {
        const y = 40 + i * 30;
        ctx.fillStyle = s.dead ? '#444' : s.def.color;
        ctx.beginPath(); ctx.arc(28, y + 8, 8, 0, TAU); ctx.fill();
        ctx.font = (s.isPlayer ? 'bold ' : '') + `12px ${F}`;
        ctx.fillStyle = s.dead ? '#777' : '#eee';
        ctx.fillText(s.name + (s.isPlayer ? ' (you)' : ''), 42, y + 6);
        ctx.font = `9px ${F}`;
        ctx.fillStyle = '#9a90b0';
        ctx.fillText(s.def.role, 160, y + 6);
        if (s.dead) {
          ctx.strokeStyle = '#ff4040';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(22, y + 2); ctx.lineTo(34, y + 14); ctx.moveTo(34, y + 2); ctx.lineTo(22, y + 14); ctx.stroke();
        } else {
          ctx.fillStyle = '#222';
          ctx.fillRect(42, y + 10, 160, 5);
          const f = s.hp / s.maxHp;
          ctx.fillStyle = f > 0.6 ? '#5dd36a' : f > 0.3 ? '#ffc23f' : '#ff4040';
          ctx.fillRect(42, y + 10, 160 * f, 5);
        }
      });

      ctx.textAlign = 'right';
      g.feedList.forEach((f, i) => {
        ctx.globalAlpha = Math.min(1, f.t);
        ctx.font = `13px ${F}`;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        const tw = ctx.measureText(f.s).width;
        ctx.fillRect(W - tw - 26, 12 + i * 24, tw + 16, 20);
        ctx.fillStyle = f.color;
        ctx.fillText(f.s, W - 18, 27 + i * 24);
      });
      ctx.globalAlpha = 1;

      if (g.banner) {
        const b = g.banner;
        const a = Math.min(1, b.t * 2, (b.dur - b.t) * 4 + 0.2);
        ctx.globalAlpha = a;
        ctx.textAlign = 'center';
        ctx.font = `bold 36px ${F}`;
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#000';
        ctx.strokeText(b.s, W / 2, H * 0.28);
        ctx.fillStyle = b.color;
        ctx.fillText(b.s, W / 2, H * 0.28);
        if (b.sub) {
          ctx.font = `italic 16px ${F}`;
          ctx.strokeText(b.sub, W / 2, H * 0.28 + 28);
          ctx.fillStyle = '#ddd';
          ctx.fillText(b.sub, W / 2, H * 0.28 + 28);
        }
        ctx.globalAlpha = 1;
      }

      if (p.dead) {
        ctx.textAlign = 'center';
        ctx.font = `bold 16px ${F}`;
        ctx.fillStyle = '#ff8080';
        ctx.fillText(`SPECTATING ${focus.name.toUpperCase()}   [Tab] next`, W / 2, H - 30);
      } else {
        this.drawAbilityBar(ctx, g, p, W, H);
        this.drawVitals(ctx, g, p, W, H);
        this.drawStamina(ctx, g, p, W, H);
        this.drawPrompt(ctx, g, p, W, H);
      }
      this.drawMinimap(ctx, g, focus, W, H);
    },

    panel(ctx, x, y, w, h) {
      ctx.fillStyle = 'rgba(14,10,24,0.75)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(163,169,176,0.45)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    },

    drawAbilityBar(ctx, g, p, W, H) {
      const F = '"Trebuchet MS", Arial, sans-serif';
      const slots = p.team === 'killer' ? ['M1', 'Q', 'E', 'R'] : ['Q', 'E'];
      const S = 62, gap = 22;
      const total = slots.length * (S + gap) - gap + S + gap;
      let x = W / 2 - total / 2;
      const y = H - S - 34;
      for (const slot of slots) {
        const ab = Ent.ability(p, slot);
        this.panel(ctx, x, y, S, S);
        const cd = p.cds[slot];
        const casting = p.cast && p.cast.slot === slot;
        const locked = (Ent.has(p, 'corrupt') && (slot === 'Q' || slot === 'E')) || Ent.has(p, 'hacked') || Ent.has(p, 'charmed');
        ctx.fillStyle = casting ? 'rgba(255,80,80,0.35)' : U.hexA(p.def.color, 0.3);
        ctx.fillRect(x + 2, y + 2, S - 4, S - 4);
        this.abilityIcon(ctx, ab.id, x + S / 2, y + S / 2 - 4, p.def);
        // Revengest: show "WARP" when the fork is out.
        if (ab.id === 'rev_fork' && g.forks.some((f) => f.owner === p)) {
          ctx.fillStyle = 'rgba(255,138,31,0.35)';
          ctx.fillRect(x + 2, y + 2, S - 4, S - 4);
          ctx.font = `bold 11px ${F}`; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
          ctx.fillText('WARP', x + S / 2, y + S - 8);
        }
        if (cd > 0) {
          const f = Math.min(1, cd / ab.cd);
          ctx.fillStyle = 'rgba(0,0,0,0.65)';
          ctx.save();
          ctx.beginPath(); ctx.rect(x, y, S, S); ctx.clip();
          ctx.beginPath();
          ctx.moveTo(x + S / 2, y + S / 2);
          ctx.arc(x + S / 2, y + S / 2, S * 0.75, -Math.PI / 2, -Math.PI / 2 + TAU * f);
          ctx.fill();
          ctx.restore();
          if (cd > 0.3) {
            ctx.font = `bold 18px ${F}`;
            ctx.textAlign = 'center';
            ctx.fillStyle = '#fff';
            ctx.fillText(cd >= 1 ? Math.ceil(cd) : cd.toFixed(1), x + S / 2, y + S / 2 + 6);
          }
        }
        if (locked) {
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          ctx.fillRect(x, y, S, S);
          ctx.font = `bold 11px ${F}`; ctx.textAlign = 'center'; ctx.fillStyle = '#ff8080';
          ctx.fillText('LOCKED', x + S / 2, y + S / 2 + 4);
        }
        if (casting) {
          ctx.fillStyle = '#ff5050';
          ctx.fillRect(x, y + S - 4, S * (p.cast.t / Math.max(0.01, p.cast.windup)), 4);
        }
        ctx.font = `bold 12px ${F}`;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffe9b0';
        ctx.fillText(slot === 'M1' ? 'LMB' : slot, x + 4, y + 13);
        ctx.font = `10px ${F}`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#d8d0e8';
        ctx.fillText(ab.name, x + S / 2, y + S + 13);
        x += S + gap;
      }
      this.panel(ctx, x, y, S, S);
      ctx.fillStyle = 'rgba(255,191,0,0.12)';
      ctx.fillRect(x + 2, y + 2, S - 4, S - 4);
      ctx.textAlign = 'center';
      ctx.font = `bold 22px ${F}`;
      ctx.fillStyle = '#ffbf00';
      const extra = p.def.id === 'burgers' ? `×${p.adapt}` : p.def.id === 'protocol2' ? `+${Math.round(Math.min(15, p.boredT))}%` : '★';
      ctx.fillText(extra, x + S / 2, y + S / 2 + 8);
      ctx.font = `10px ${F}`;
      ctx.fillStyle = '#d8d0e8';
      ctx.fillText(p.def.passive.name, x + S / 2, y + S + 13);
      ctx.font = `bold 9px ${F}`;
      ctx.fillStyle = '#a8a2b8';
      ctx.fillText('PASSIVE', x + S / 2, y + 12);
    },

    abilityIcon(ctx, id, x, y, def) {
      ctx.save();
      ctx.translate(x, y);
      ctx.strokeStyle = def.color2 === '#2b2f3a' ? '#ffffff' : def.color2;
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      const L = (pts) => { ctx.beginPath(); pts.forEach(([a, b], i) => (i ? ctx.lineTo(a, b) : ctx.moveTo(a, b))); ctx.stroke(); };
      switch (id) {
        case 'm1': L([[-12, 10], [12, -10]]); L([[-6, 12], [14, -4]]); break;
        case 'sc_laser': this.drawBlock(ctx, 14); ctx.fillStyle = '#ff3050'; ctx.fillRect(7, -2, 10, 4); ctx.translate(-6, 0); break;
        case 'sc_reshape': for (let i = -1; i <= 1; i++) ctx.strokeRect(-5, i * 9 - 4, 10, 8); break;
        case 'sc_flight': L([[-12, 6], [0, -8], [12, 6]]); L([[-6, 12], [0, 4], [6, 12]]); break;
        case 'p2_hack': ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center'; ctx.fillText('</>', 0, 5); break;
        case 'p2_arson': ctx.beginPath(); ctx.moveTo(0, -13); ctx.quadraticCurveTo(12, 0, 0, 12); ctx.quadraticCurveTo(-12, 0, 0, -13); ctx.stroke(); break;
        case 'p2_decree': ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU, k = i % 2 ? 7 : 12; ctx.lineTo(Math.cos(a) * k, Math.sin(a) * k); } ctx.closePath(); ctx.stroke(); break;
        case 'burg_roar': for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.arc(-8, 0, i * 6, -0.8, 0.8); ctx.stroke(); } break;
        case 'burg_dive': L([[-14, 0], [10, 0]]); L([[4, -7], [12, 0], [4, 7]]); break;
        case 'burg_grease': ctx.beginPath(); ctx.ellipse(0, 4, 13, 7, 0, 0, TAU); ctx.stroke(); L([[-4, -12], [-2, -4]]); L([[4, -12], [2, -4]]); break;
        case 'creak_lash': ctx.beginPath(); ctx.moveTo(-12, 10); ctx.bezierCurveTo(-4, -14, 4, 14, 12, -10); ctx.stroke(); break;
        case 'creak_vines': for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-6 + i * 6, 0, 6, Math.PI, 0); ctx.stroke(); } break;
        case 'creak_echo': ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(-5, 0, 8, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(6, 0, 8, 0, TAU); ctx.stroke(); break;
        case 'rev_fork': this.drawFork(ctx, 1); break;
        case 'rev_draw': L([[-12, 4], [10, 4]]); L([[-12, 4], [-12, 10]]); L([[6, -6], [14, -6]]); break;
        case 'rev_corrupt': ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.stroke(); L([[-6, -6], [6, 6]]); L([[6, -6], [-6, 6]]); break;
        case 'scr_lesson': ctx.strokeRect(-11, -8, 22, 15); L([[-7, -3], [7, -3]]); L([[-7, 2], [3, 2]]); break;
        case 'scr_charm': ctx.font = '22px Arial'; ctx.textAlign = 'center'; ctx.fillText('♥', 0, 8); break;
        case 'griff_stop': L([[-10, 10], [8, -8]]); this.star(ctx, 9, -9, 6, '#ffd23f'); break;
        case 'griff_clone': ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(-6, 0, 6, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(6, 0, 6, 0, TAU); ctx.stroke(); break;
        case 'nano_guard': ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill(); break;
        case 'nano_rally': L([[-6, 13], [-6, -12]]); ctx.beginPath(); ctx.moveTo(-6, -12); ctx.lineTo(10, -7); ctx.lineTo(-6, -2); ctx.fill(); break;
      }
      ctx.restore();
    },

    drawVitals(ctx, g, p, W, H) {
      const F = '"Trebuchet MS", Arial, sans-serif';
      const x = 16, y = H - 92;
      this.panel(ctx, x - 6, y - 24, 300, 86);
      ctx.textAlign = 'left';
      ctx.font = `bold 15px ${F}`;
      ctx.fillStyle = p.def.color;
      ctx.fillText(p.def.name, x, y - 6);
      const nw = ctx.measureText(p.def.name).width;
      ctx.font = `italic 11px ${F}`;
      ctx.fillStyle = '#a8a2b8';
      ctx.fillText(p.def.title + ' · ' + p.def.role, x + nw + 10, y - 6);
      let yy = y + 4;
      if (p.team === 'survivor') {
        ctx.fillStyle = '#222';
        ctx.fillRect(x, yy, 230, 14);
        const f = p.hp / p.maxHp;
        ctx.fillStyle = f > 0.6 ? '#5dd36a' : f > 0.3 ? '#ffc23f' : '#ff4040';
        ctx.fillRect(x, yy, 230 * f, 14);
        ctx.font = `bold 11px ${F}`;
        ctx.fillStyle = '#fff';
        ctx.fillText(`${Math.ceil(p.hp)} / ${p.maxHp}`, x + 6, yy + 11);
        yy += 20;
      }
      ctx.fillStyle = '#222';
      ctx.fillRect(x, yy, 230, 8);
      ctx.fillStyle = '#7ad7ff';
      ctx.fillRect(x, yy, 230 * (p.stamina / 100), 8);
      yy += 22;
      const names = { stun: 'Stunned', slow: 'Slowed', revealed: 'Revealed', shield: 'Guard up', hacked: 'Hacked', charmed: 'Charmed', root: 'Rooted', lesson: 'Lesson', rallied: 'Rallied', greased: 'Greased', tangled: 'Tangled', burning: 'Burning', hitboost: 'Adrenaline', loyal: 'Became Better', corrupt: 'Corruption', flight: 'Flight', decree: 'Decree', skate: 'Skating', recover: 'Recovering', rising: 'Entering the round', wading: 'Wading' };
      const list = p.effects.filter((f) => names[f.type]).map((f) => `${names[f.type]} ${f.t.toFixed(1)}s`);
      ctx.font = `11px ${F}`;
      ctx.fillStyle = '#e8e0f4';
      ctx.fillText(list.join('  ·  '), x, yy);
    },

    drawPrompt(ctx, g, p, W, H) {
      if (p.team !== 'survivor') return;
      let msg = null;
      if (g.finale) {
        const f = g.finale;
        if (f.phase === 'stopped' && U.dist(p, g.killer) < 90) msg = 'Press [F] to hit SC into the ground';
        else if (f.phase === 'down' && f.block && U.dist(p, f.block) < 60) msg = 'Press [F] to CRUSH the DESTROY block';
      }
      if (!msg) {
        const gen = g.world.gens.find((gn) => !gn.done && U.dist(p, gn) < 64);
        if (p.repairing) msg = `Compiling… ${Math.floor(p.repairing.progress * 100)}%`;
        else if (gen) msg = 'Hold [F] to compile (stand still)';
        const v = g.world.teleVents.find((vv) => U.dist(p, vv) < 42);
        if (v && !p.repairing) msg = p.ventCd > 0 ? `Elevator cooling down ${p.ventCd.toFixed(1)}s` : 'Press [F] to ride the service elevator';
      }
      if (!msg) return;
      ctx.font = 'bold 15px "Trebuchet MS", Arial, sans-serif';
      ctx.textAlign = 'center';
      const tw = ctx.measureText(msg).width;
      this.panel(ctx, W / 2 - tw / 2 - 12, H - 178, tw + 24, 28);
      ctx.fillStyle = '#ffe9b0';
      ctx.fillText(msg, W / 2, H - 159);
    },

    // Big, centered stamina readout plus a ring around the player.
    drawStamina(ctx, g, p, W, H) {
      const F = '"Trebuchet MS", Arial, sans-serif';
      const st = p.stamina / 100;
      const low = st < 0.25;
      const empty = p.stamina < 1;
      const flash = empty && Math.sin(g.time * 14) > 0;
      const col = empty ? (flash ? '#ff3b3b' : '#7a1a1a') : low ? '#ff9a3c' : p.sprinting ? '#7ad7ff' : '#4fb8e8';

      // Ring around the player's character.
      if (st < 0.999 || p.sprinting) {
        const cam = g.cam;
        const sx = (p.x - cam.x) * cam.zoom + W / 2, sy = (p.y - cam.y) * cam.zoom + H / 2;
        const rr = (p.r + 13) * cam.zoom;
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.beginPath(); ctx.arc(sx, sy, rr, 0, TAU); ctx.stroke();
        ctx.strokeStyle = col;
        ctx.beginPath(); ctx.arc(sx, sy, rr, -Math.PI / 2, -Math.PI / 2 + TAU * st); ctx.stroke();
      }

      // Bar centered above the ability bar.
      const bw = Math.min(320, W * 0.4), bh = 14;
      const x = W / 2 - bw / 2, y = H - 128;
      this.panel(ctx, x - 4, y - 4, bw + 8, bh + 8);
      ctx.fillStyle = '#1a1622';
      ctx.fillRect(x, y, bw, bh);
      ctx.fillStyle = col;
      ctx.fillRect(x, y, bw * st, bh);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(x, y, bw * st, bh / 3);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      for (let i = 1; i < 4; i++) ctx.fillRect(x + (bw * i) / 4 - 1, y, 2, bh);
      ctx.font = `bold 11px ${F}`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000';
      const label = empty ? 'OUT OF STAMINA' : `STAMINA ${Math.round(p.stamina)}${p.sprinting ? '  ▶▶' : ''}`;
      ctx.strokeText(label, W / 2, y + 11);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, W / 2, y + 11);
    },

    drawMinimap(ctx, g, focus, W, H) {
      const w = g.world;
      const s = W < 900 ? 2.4 : 3.6;
      const mw = w.w * s, mh = w.h * s;
      const x = W - mw - 14, y = H - mh - 14;
      if (!w._mini || w._miniS !== s) {
        const cv = document.createElement('canvas');
        cv.width = mw; cv.height = mh;
        const c2 = cv.getContext('2d');
        const col = { '#': '#000', x: '#4a3a2a', '~': '#1f4f8a', f: '#6b7385', n: '#6b4a2a', h: '#300', b: '#5a5246', O: '#3a4a6a', D: '#5a1020' };
        for (let ty = 0; ty < w.h; ty++) for (let tx = 0; tx < w.w; tx++) {
          c2.fillStyle = col[w.at(tx, ty)] || '#1c1a24';
          c2.fillRect(tx * s, ty * s, s, s);
        }
        w._mini = cv; w._miniS = s;
      }
      ctx.globalAlpha = 0.85;
      this.panel(ctx, x - 4, y - 4, mw + 8, mh + 8);
      ctx.drawImage(w._mini, x, y);
      ctx.globalAlpha = 1;
      const k = s / T;
      for (const gen of w.gens) {
        ctx.fillStyle = gen.done ? '#59c059' : '#ffbf00';
        ctx.fillRect(x + gen.x * k - 2.5, y + gen.y * k - 2.5, 5, 5);
      }
      for (const e of g.ents) {
        if (e.dead) continue;
        if (e !== focus && e.team !== focus.team && !g.canSee(focus, e)) continue;
        ctx.fillStyle = e.team === 'killer' ? '#ff3030' : e === focus ? '#ffffff' : e.def.color;
        ctx.beginPath(); ctx.arc(x + e.x * k, y + e.y * k, e === focus ? 3.5 : 2.5, 0, TAU); ctx.fill();
      }
    },

    // ---------------------------------------------------------- portraits
    drawPortrait(canvas, defId, opts = {}) {
      const def = G.CHARS[defId];
      const ctx = canvas.getContext('2d');
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      const gr = ctx.createRadialGradient(W / 2, H / 2, 5, W / 2, H / 2, W * 0.6);
      gr.addColorStop(0, U.hexA(def.color, 0.55));
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, W, H);
      const sc = (Math.min(W, H) * 0.28) / def.r;
      ctx.save();
      ctx.translate(W / 2, H / 2 + H * 0.04);
      ctx.scale(sc, sc);
      const fake = { vx: 0, vy: 0, trail: [], effects: [], cast: null, repairing: null, sprinting: false, adapt: 0 };
      if (opts.pose && def.id === 'nano') fake.effects.push({ type: 'shield', t: 1 });
      if (opts.corrupt) fake.effects.push({ type: 'corrupt', t: 1 });
      this.drawChar(ctx, def, 0, 0, opts.facing ?? -Math.PI / 2 + 0.0001, { ent: fake, t: opts.t || 0.3, scale: 1 });
      ctx.restore();
    },
  });

  function mulberry(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  R.mulberry = mulberry;
})();
