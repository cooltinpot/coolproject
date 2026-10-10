// Drawing: map, characters (with class cosmetics), telegraphs, fog and HUD.
(function () {
  const G = window.G;
  const U = G.U;
  const T = G.TILE;
  const Ent = G.Ent;
  const TAU = Math.PI * 2;

  const R = (G.Render = {
    canvas: null,
    ctx: null,
    init(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.dark = document.createElement('canvas');
    },

    // --------------------------------------------------------------- frame
    frame(g) {
      const c = this.canvas, ctx = this.ctx;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = window.innerWidth, H = window.innerHeight;
      if (c.width !== Math.floor(W * dpr) || c.height !== Math.floor(H * dpr)) {
        c.width = Math.floor(W * dpr);
        c.height = Math.floor(H * dpr);
        c.style.width = W + 'px';
        c.style.height = H + 'px';
      }
      g.vw = W; g.vh = H;
      const focus = g.spectate || g.player;
      const cam = g.cam;
      cam.zoom = U.clamp(Math.min(W / 1300, H / 780), 0.55, 1.25);
      cam.x = U.lerp(cam.x, focus.x, 0.15);
      cam.y = U.lerp(cam.y, focus.y, 0.15);
      // Keep the camera inside the map so we never stare into the void.
      const hw = W / 2 / cam.zoom, hh = H / 2 / cam.zoom, w = g.world;
      cam.x = w.pw > hw * 2 ? U.clamp(cam.x, hw, w.pw - hw) : w.pw / 2;
      cam.y = w.ph > hh * 2 ? U.clamp(cam.y, hh - 90 / cam.zoom, w.ph - hh + 110 / cam.zoom) : w.ph / 2;
      const sh = g.shakeAmt;
      const sx = sh > 0.3 ? U.rand(-sh, sh) : 0, sy = sh > 0.3 ? U.rand(-sh, sh) : 0;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.translate(W / 2 + sx, H / 2 + sy);
      ctx.scale(cam.zoom, cam.zoom);
      ctx.translate(-cam.x, -cam.y);
      const view = { x0: cam.x - W / 2 / cam.zoom - T, y0: cam.y - H / 2 / cam.zoom - T, x1: cam.x + W / 2 / cam.zoom + T, y1: cam.y + H / 2 / cam.zoom + T };

      this.drawWorld(ctx, g, view);
      this.drawEntities(ctx, g, view, focus);
      this.drawProjectiles(ctx, g);
      this.drawFx(ctx, g);
      ctx.restore();

      this.drawDarkness(ctx, g, focus, W, H, dpr);

      // Things that pierce the fog: revealed outlines and floating text.
      ctx.save();
      ctx.translate(W / 2 + sx, H / 2 + sy);
      ctx.scale(cam.zoom, cam.zoom);
      ctx.translate(-cam.x, -cam.y);
      this.drawReveals(ctx, g, focus);
      for (const t of g.texts) {
        ctx.globalAlpha = 1 - t.t / t.dur;
        ctx.font = 'bold 15px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#000';
        ctx.strokeText(t.s, t.x, t.y);
        ctx.fillStyle = t.color;
        ctx.fillText(t.s, t.x, t.y);
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      this.drawHUD(ctx, g, W, H, focus);
    },

    // ---------------------------------------------------------------- world
    staticLayer(world) {
      if (world._layer) return world._layer;
      const cv = document.createElement('canvas');
      cv.width = world.pw;
      cv.height = world.ph;
      const ctx = cv.getContext('2d');
      const P = world.def.palette;
      const rnd = mulberry(world.def.id.length * 977);
      for (let ty = 0; ty < world.h; ty++) {
        for (let tx = 0; tx < world.w; tx++) {
          const ch = world.at(tx, ty);
          const x = tx * T, y = ty * T;
          ctx.fillStyle = (tx + ty) % 2 ? P.floor : P.floor2;
          ctx.fillRect(x, y, T, T);
          // grit
          for (let i = 0; i < 3; i++) {
            ctx.fillStyle = `rgba(0,0,0,${0.08 + rnd() * 0.1})`;
            ctx.fillRect(x + rnd() * T, y + rnd() * T, 2 + rnd() * 3, 2 + rnd() * 3);
          }
          if (ch === ',') {
            ctx.fillStyle = '#24401f';
            ctx.fillRect(x, y, T, T);
            ctx.strokeStyle = '#3d6b2f';
            ctx.lineWidth = 2;
            for (let i = 0; i < 9; i++) {
              const bx = x + rnd() * T, by = y + rnd() * T;
              ctx.beginPath();
              ctx.moveTo(bx, by + 6);
              ctx.lineTo(bx + rnd() * 6 - 3, by - 6);
              ctx.stroke();
            }
          } else if (ch === '=') {
            ctx.fillStyle = '#2b2622';
            ctx.fillRect(x, y, T, T);
            ctx.fillStyle = '#4a3a2c';
            for (let i = 0; i < 4; i++) ctx.fillRect(x + i * 10 + 2, y + 2, 5, T - 4);
            ctx.fillStyle = '#8f949c';
            ctx.fillRect(x, y + 9, T, 3);
            ctx.fillRect(x, y + T - 12, T, 3);
          } else if (ch === '>' || ch === '<') {
            ctx.fillStyle = '#2c2c2c';
            ctx.fillRect(x, y + 3, T, T - 6);
            ctx.fillStyle = '#444';
            ctx.fillRect(x, y + 3, T, 3);
            ctx.fillRect(x, y + T - 6, T, 3);
          } else if (ch === 'F') {
            ctx.fillStyle = '#1a1210';
            ctx.fillRect(x + 1, y + 1, T - 2, T - 2);
            ctx.fillStyle = '#4a3226';
            for (let i = 0; i < 5; i++) ctx.fillRect(x + 4 + i * 7, y + 3, 3, T - 6);
          } else if (ch === 'O') {
            ctx.fillStyle = '#1b1e24';
            ctx.fillRect(x + 4, y + 4, T - 8, T - 8);
            ctx.strokeStyle = '#6b7383';
            ctx.lineWidth = 2;
            ctx.strokeRect(x + 4, y + 4, T - 8, T - 8);
            for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x + 8, y + 10 + i * 6); ctx.lineTo(x + T - 8, y + 10 + i * 6); ctx.stroke(); }
          }
        }
      }
      // Walls & crates with shadows.
      for (let ty = 0; ty < world.h; ty++) {
        for (let tx = 0; tx < world.w; tx++) {
          const ch = world.at(tx, ty);
          const x = tx * T, y = ty * T;
          if (ch === '#') {
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            ctx.fillRect(x + 6, y + 6, T, T);
          }
        }
      }
      for (let ty = 0; ty < world.h; ty++) {
        for (let tx = 0; tx < world.w; tx++) {
          const ch = world.at(tx, ty);
          const x = tx * T, y = ty * T;
          if (ch === '#') {
            if (world.def.id === 'woods' && tx > 0 && ty > 0 && tx < world.w - 1 && ty < world.h - 1) {
              // Trees.
              ctx.fillStyle = P.wall;
              ctx.fillRect(x, y, T, T);
              const gr = ctx.createRadialGradient(x + 16, y + 16, 3, x + 20, y + 20, 26);
              gr.addColorStop(0, '#3f6a34');
              gr.addColorStop(1, '#16260f');
              ctx.fillStyle = gr;
              ctx.beginPath();
              ctx.arc(x + 20, y + 20, 23, 0, TAU);
              ctx.fill();
            } else {
              // Solid masonry: continuous top surface, front face where floor is below.
              const isW = (ax, ay) => world.at(ax, ay) === '#';
              ctx.fillStyle = P.wallTop;
              ctx.fillRect(x, y, T, T);
              ctx.fillStyle = 'rgba(0,0,0,0.12)';
              for (let i = 1; i < 4; i++) ctx.fillRect(x, y + i * 10, T, 1);
              ctx.fillRect(x + ((ty % 2) ? 10 : 30), y, 1, T);
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
            }
          } else if (ch === 'x') {
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fillRect(x + 5, y + 5, T - 4, T - 4);
            ctx.fillStyle = P.crate;
            ctx.fillRect(x + 3, y + 3, T - 6, T - 6);
            ctx.strokeStyle = 'rgba(0,0,0,0.45)';
            ctx.lineWidth = 2;
            ctx.strokeRect(x + 4, y + 4, T - 8, T - 8);
            ctx.beginPath();
            ctx.moveTo(x + 4, y + 4); ctx.lineTo(x + T - 4, y + T - 4);
            ctx.moveTo(x + T - 4, y + 4); ctx.lineTo(x + 4, y + T - 4);
            ctx.stroke();
          }
        }
      }
      world._layer = cv;
      return cv;
    },

    drawWorld(ctx, g, v) {
      const w = g.world;
      ctx.drawImage(this.staticLayer(w), 0, 0);
      const t = g.time;
      const P = w.def.palette;
      const tx0 = Math.max(0, Math.floor(v.x0 / T)), tx1 = Math.min(w.w - 1, Math.floor(v.x1 / T));
      const ty0 = Math.max(0, Math.floor(v.y0 / T)), ty1 = Math.min(w.h - 1, Math.floor(v.y1 / T));
      for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          const ch = w.at(tx, ty);
          const x = tx * T, y = ty * T;
          if (ch === '>' || ch === '<') {
            const dir = ch === '>' ? 1 : -1;
            const off = ((t * 95 * dir) % 20 + 20) % 20;
            ctx.strokeStyle = 'rgba(255,200,80,0.35)';
            ctx.lineWidth = 3;
            for (let i = -1; i < 2; i++) {
              const cx = x + off + i * 20;
              if (cx < x - 2 || cx > x + T + 2) continue;
              ctx.beginPath();
              ctx.moveTo(cx - 5 * dir, y + 12);
              ctx.lineTo(cx + 3 * dir, y + 20);
              ctx.lineTo(cx - 5 * dir, y + 28);
              ctx.stroke();
            }
          } else if (ch === 'F') {
            const cl = w.fireOf.get(ty * w.w + tx);
            if (cl.state === 'warn') {
              ctx.fillStyle = `rgba(255,${120 + Math.sin(t * 20) * 40},20,${0.25 + 0.25 * Math.sin(t * 18)})`;
              ctx.fillRect(x, y, T, T);
            } else if (cl.state === 'burn') {
              ctx.fillStyle = 'rgba(255,90,10,0.55)';
              ctx.fillRect(x, y, T, T);
              for (let i = 0; i < 4; i++) {
                const fx = x + 6 + Math.random() * (T - 12), fy = y + 6 + Math.random() * (T - 12);
                ctx.fillStyle = U.choice(['#ffd23f', '#ff7a1a', '#ff3b1a']);
                ctx.beginPath();
                ctx.arc(fx, fy, 4 + Math.random() * 7, 0, TAU);
                ctx.fill();
              }
            } else if (cl.t < 2.5) {
              ctx.fillStyle = 'rgba(255,90,10,0.12)';
              ctx.fillRect(x, y, T, T);
            }
          } else if (ch === 'O') {
            const show = g.player.team === 'survivor';
            if (show) {
              ctx.strokeStyle = `rgba(143,200,255,${0.4 + 0.2 * Math.sin(t * 3)})`;
              ctx.lineWidth = 2;
              ctx.strokeRect(x + 2, y + 2, T - 4, T - 4);
            }
          }
        }
      }
      // Floor decals (blood drops).
      for (const p of g.particles) {
        if (!p.floor) continue;
        ctx.globalAlpha = 0.6 * (1 - p.t / p.dur);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      // Traps.
      for (const tr of w.traps) {
        ctx.strokeStyle = tr.armed ? 'rgba(200,200,200,0.55)' : 'rgba(120,120,120,0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(tr.x, tr.y, 10, 0, TAU);
        ctx.stroke();
        if (tr.armed) {
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * TAU;
            ctx.beginPath();
            ctx.moveTo(tr.x + Math.cos(a) * 10, tr.y + Math.sin(a) * 10);
            ctx.lineTo(tr.x + Math.cos(a) * 14, tr.y + Math.sin(a) * 14);
            ctx.stroke();
          }
          if (Math.sin(t * 2 + tr.x) > 0.95) { ctx.fillStyle = '#fff'; ctx.fillRect(tr.x - 1, tr.y - 1, 2, 2); }
        }
      }
      // Generators.
      for (const gen of w.gens) this.drawGen(ctx, gen, t);
      // Barricades.
      for (const [k, b] of w.barricades) {
        const x = (k % w.w) * T, y = ((k / w.w) | 0) * T;
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(x + 4, y + 4, T, T);
        ctx.fillStyle = '#8a5a2b';
        for (let i = 0; i < 3; i++) ctx.fillRect(x + 2, y + 4 + i * 12, T - 4, 9);
        ctx.fillStyle = '#5c3a1a';
        ctx.fillRect(x + 8, y + 2, 5, T - 4);
        ctx.fillRect(x + T - 13, y + 2, 5, T - 4);
        ctx.fillStyle = '#c9c9c9';
        for (let i = 0; i < 3; i++) { ctx.fillRect(x + 9, y + 7 + i * 12, 3, 3); ctx.fillRect(x + T - 12, y + 7 + i * 12, 3, 3); }
        ctx.fillStyle = '#ff8c1a';
        ctx.fillRect(x + 4, y + T - 4, ((T - 8) * b.hp) / 3, 3);
      }
      // Mines (survivors only).
      if (g.player.team === 'survivor') {
        for (const m of g.mines) {
          ctx.fillStyle = '#3a2a1a';
          ctx.beginPath();
          ctx.arc(m.x, m.y, 9, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = '#ff8c1a';
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.fillStyle = m.arm > 0 ? '#888' : Math.sin(t * 8) > 0 ? '#ff3b1a' : '#661010';
          ctx.beginPath();
          ctx.arc(m.x, m.y, 3, 0, TAU);
          ctx.fill();
        }
      }
      // Train.
      const tr = w.train;
      if (tr) {
        if (tr.state === 'warn' || (tr.state === 'idle' && tr.t < 1.2)) {
          const on = Math.sin(t * 16) > 0;
          ctx.fillStyle = on ? 'rgba(255,40,40,0.18)' : 'rgba(255,200,40,0.08)';
          ctx.fillRect(0, tr.y0, w.pw, tr.y1 - tr.y0);
          for (let x = T; x < w.pw; x += T * 4) {
            ctx.fillStyle = on ? '#ff3030' : '#551010';
            ctx.beginPath(); ctx.arc(x, tr.y0 - 4, 5, 0, TAU); ctx.fill();
            ctx.beginPath(); ctx.arc(x, tr.y1 + 4, 5, 0, TAU); ctx.fill();
          }
        }
        if (tr.state === 'run') {
          const y = tr.y0 + 4, h = tr.y1 - tr.y0 - 8;
          ctx.fillStyle = 'rgba(0,0,0,0.4)';
          ctx.fillRect(tr.x + 8, y + 8, tr.len, h);
          const cars = 4, cl = tr.len / cars;
          for (let i = 0; i < cars; i++) {
            const cx = tr.x + i * cl;
            ctx.fillStyle = i === (tr.dir > 0 ? cars - 1 : 0) ? '#8b1c1c' : '#5d6470';
            ctx.fillRect(cx + 3, y, cl - 6, h);
            ctx.fillStyle = '#ffe9a8';
            for (let j = 0; j < 6; j++) ctx.fillRect(cx + 14 + j * ((cl - 28) / 6), y + 8, 12, 10);
            ctx.fillStyle = '#2b2f36';
            ctx.fillRect(cx + 3, y + h / 2 - 2, cl - 6, 4);
          }
          const front = tr.dir > 0 ? tr.x + tr.len : tr.x;
          const gr = ctx.createRadialGradient(front, y + h / 2, 5, front, y + h / 2, 200);
          gr.addColorStop(0, 'rgba(255,240,180,0.6)');
          gr.addColorStop(1, 'rgba(255,240,180,0)');
          ctx.fillStyle = gr;
          ctx.fillRect(front - 200, y - 150, 400, h + 300);
        }
      }
    },

    drawGen(ctx, gen, t) {
      const x = gen.x, y = gen.y;
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(x - 15, y - 11, 34, 30);
      ctx.fillStyle = gen.done ? '#3c5a3c' : '#4a4f57';
      ctx.fillRect(x - 17, y - 15, 34, 30);
      ctx.fillStyle = gen.done ? '#59a85a' : '#6b7280';
      ctx.fillRect(x - 15, y - 13, 30, 8);
      ctx.fillStyle = '#222';
      for (let i = 0; i < 4; i++) ctx.fillRect(x - 13 + i * 7, y - 2, 4, 12);
      const lit = gen.done || (gen.repairers > 0 && Math.sin(t * 20) > 0);
      ctx.fillStyle = gen.done ? '#7dff8a' : lit ? '#ffe14d' : '#5c4a1a';
      ctx.beginPath();
      ctx.arc(x + 11, y - 9, 3, 0, TAU);
      ctx.fill();
      if (gen.done) {
        const gr = ctx.createRadialGradient(x, y, 5, x, y, 70);
        gr.addColorStop(0, 'rgba(125,255,138,0.25)');
        gr.addColorStop(1, 'rgba(125,255,138,0)');
        ctx.fillStyle = gr;
        ctx.fillRect(x - 70, y - 70, 140, 140);
      } else if (gen.progress > 0) {
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(x, y, 26, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = '#ffe14d';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, 26, -Math.PI / 2, -Math.PI / 2 + TAU * gen.progress);
        ctx.stroke();
      }
    },

    // ------------------------------------------------------------- entities
    visibleTo(g, viewer, e) {
      if (e === viewer || e.team === viewer.team) return true;
      return g.canSee(viewer, e);
    },
    drawEntities(ctx, g, v, focus) {
      // Guardian links.
      for (const e of g.survivors) {
        const l = Ent.get(e, 'linked');
        if (l && l.by && !l.by.dead && !e.dead && (focus.team === 'survivor' || g.canSee(focus, e))) {
          ctx.strokeStyle = `rgba(127,180,255,${0.4 + 0.2 * Math.sin(g.time * 8)})`;
          ctx.lineWidth = 3;
          ctx.setLineDash([6, 6]);
          ctx.beginPath();
          ctx.moveTo(e.x, e.y);
          ctx.lineTo(l.by.x, l.by.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      const list = g.ents.slice().sort((a, b) => a.y - b.y);
      // Dead survivors first (bodies).
      for (const e of list) {
        if (!e.dead) continue;
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#5a0c14';
        ctx.beginPath();
        ctx.ellipse(e.x, e.y, 20, 13, 0.4, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 0.35;
        this.drawChar(ctx, e.def, e.x, e.y, 1.2, { ent: null, t: 0, scale: 0.9 });
        ctx.globalAlpha = 1;
      }
      for (const e of list) {
        if (e.dead || e.x < v.x0 || e.x > v.x1 || e.y < v.y0 || e.y > v.y1) continue;
        if (!this.visibleTo(g, focus, e)) continue;
        let alpha = 1;
        if (Ent.has(e, 'shade')) alpha = e.team === focus.team ? 0.35 : 0.22;
        if (e.team === 'survivor' && g.world.atPx(e.x, e.y) === ',') alpha = Math.min(alpha, 0.65);
        this.drawTelegraph(ctx, g, e);
        ctx.globalAlpha = alpha;
        this.drawChar(ctx, e.def, e.x, e.y, e.facing, { ent: e, t: e.anim, g });
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
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.arc(e.x, e.y, range, a - arc / 2, a + arc / 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.arc(e.x, e.y, range * f, a - arc / 2, a + arc / 2);
        ctx.closePath();
        ctx.fillStyle = `rgba(${col},0.5)`;
        ctx.fill();
      };
      const line = (len, w) => {
        ctx.translate(e.x, e.y);
        ctx.rotate(a);
        ctx.fillRect(0, -w / 2, len, w);
        ctx.strokeRect(0, -w / 2, len, w);
        ctx.fillStyle = `rgba(${col},0.5)`;
        ctx.fillRect(0, -w / 2, len * f, w);
      };
      switch (c.id) {
        case 'm1': wedge(e.def.m1.range, e.def.m1.arc); break;
        case 'grave_cleave': wedge(88, 2.6); break;
        case 'grave_slam':
          ctx.beginPath(); ctx.arc(e.x, e.y, 145, 0, TAU); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.arc(e.x, e.y, 145 * f, 0, TAU); ctx.fillStyle = `rgba(${col},0.45)`; ctx.fill();
          break;
        case 'blitz_dash': line(Ent.has(e, 'overdrive') ? 300 : 220, 34); break;
        case 'blitz_tracer': line(680, 6); break;
        case 'mourn_hook': line(440, 14); break;
        case 'juno_taser': wedge(80, 1.9); break;
        case 'juno_flash': {
          let dx = c.ax - e.x, dy = c.ay - e.y;
          const d = Math.hypot(dx, dy);
          if (d > 330) { dx *= 330 / d; dy *= 330 / d; }
          ctx.setLineDash([5, 5]);
          ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + dx, e.y + dy); ctx.stroke();
          ctx.setLineDash([]);
          ctx.beginPath(); ctx.arc(e.x + dx, e.y + dy, 115, 0, TAU); ctx.stroke();
          break;
        }
        case 'bolt_barricade': {
          const x = Math.floor((e.x + Math.cos(a) * 46) / T) * T, y = Math.floor((e.y + Math.sin(a) * 46) / T) * T;
          ctx.strokeRect(x + 2, y + 2, T - 4, T - 4);
          ctx.fillRect(x + 2, y + T - 2 - (T - 4) * f, T - 4, (T - 4) * f);
          break;
        }
        case 'grave_rage':
        case 'mourn_dread':
          ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 8 + f * 30, 0, TAU); ctx.stroke();
          break;
      }
      ctx.restore();
      // Windup ring around the caster.
      ctx.strokeStyle = e.team === 'killer' ? '#ff4040' : '#7ad7ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r + 6, -Math.PI / 2, -Math.PI / 2 + TAU * f);
      ctx.stroke();
    },

    drawStatus(ctx, g, e, focus) {
      const t = g.time;
      const top = e.y - e.r - 16;
      // Name + HP.
      ctx.font = 'bold 11px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = e.team === 'killer' ? '#ff8080' : e.isPlayer ? '#ffffff' : '#d8d8d8';
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.lineWidth = 3;
      ctx.strokeText(e.name, e.x, top - 6);
      ctx.fillText(e.name, e.x, top - 6);
      if (e.team === 'survivor') {
        const w = 34;
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(e.x - w / 2 - 1, top - 2, w + 2, 6);
        const f = e.hp / e.maxHp;
        ctx.fillStyle = f > 0.6 ? '#5dd36a' : f > 0.3 ? '#ffc23f' : '#ff4040';
        ctx.fillRect(e.x - w / 2, top - 1, w * f, 4);
      }
      // Channel / repair bar.
      const bar = (f, col) => {
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(e.x - 21, e.y + e.r + 6, 42, 6);
        ctx.fillStyle = col;
        ctx.fillRect(e.x - 20, e.y + e.r + 7, 40 * f, 4);
      };
      if (e.channel) bar(e.channel.t / e.channel.dur, e.channel.type === 'heal' ? '#5dff8f' : '#8fc8ff');
      else if (e.repairing) bar(e.repairing.progress, '#ffe14d');
      // Effects.
      if (Ent.has(e, 'stun')) {
        for (let i = 0; i < 3; i++) {
          const a = t * 6 + (i * TAU) / 3;
          this.star(ctx, e.x + Math.cos(a) * (e.r + 4), e.y - e.r - 2 + Math.sin(a) * 5, 4, '#e6ff4a');
        }
      }
      if (Ent.has(e, 'marked')) {
        const y = top - 22 + Math.sin(t * 6) * 2;
        ctx.fillStyle = '#ffcc33';
        ctx.beginPath();
        ctx.moveTo(e.x, y - 7); ctx.lineTo(e.x + 6, y); ctx.lineTo(e.x, y + 7); ctx.lineTo(e.x - 6, y);
        ctx.closePath();
        ctx.fill();
      }
      if (Ent.has(e, 'slow')) {
        ctx.strokeStyle = 'rgba(120,170,255,0.8)';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r + 3, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (Ent.has(e, 'root')) {
        ctx.strokeStyle = '#c9c9c9';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(e.x, e.y + e.r * 0.4, e.r * 0.8, 0, Math.PI);
        ctx.stroke();
      }
      if (Ent.has(e, 'burning') && Math.random() < 0.6) g.particles.push({ x: e.x + U.rand(-8, 8), y: e.y, vx: 0, vy: -60, t: 0, dur: 0.4, color: '#ff7a1a', size: 3 });
      if (Ent.has(e, 'rage')) {
        ctx.strokeStyle = `rgba(255,30,30,${0.5 + 0.3 * Math.sin(t * 12)})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r + 7 + Math.sin(t * 12) * 2, 0, TAU);
        ctx.stroke();
      }
      if (Ent.has(e, 'adrenal') || Ent.has(e, 'burst') || Ent.has(e, 'hitboost')) {
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
        if (e.dead || e.team === focus.team) continue;
        const rev = Ent.has(e, 'revealed') || (focus.team === 'killer' && Ent.has(e, 'marked'));
        if (!rev) continue;
        const col = Ent.has(e, 'marked') && focus.team === 'killer' ? '#ffcc33' : e.team === 'killer' ? '#ff8c1a' : '#b98cff';
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = col;
        ctx.shadowColor = col;
        ctx.shadowBlur = 12;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r + 3, 0, TAU);
        ctx.stroke();
        ctx.font = 'bold 11px Georgia, serif';
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
    // Top-down, local +x is "forward".
    drawChar(ctx, def, x, y, facing, o = {}) {
      const e = o.ent;
      const t = o.t || 0;
      const r = def.r * (o.scale || 1);
      const base = ctx.globalAlpha;
      const moving = e ? Math.hypot(e.vx, e.vy) > 20 : false;

      // Trails behind the body (world-space).
      if (e && def.id === 'blitz') {
        const od = Ent.has(e, 'overdrive');
        for (let i = 2; i < e.trail.length; i += 2) {
          const p = e.trail[i];
          ctx.globalAlpha = base * (od ? 0.45 : 0.22) * (1 - i / e.trail.length);
          ctx.fillStyle = od ? '#ff7a1a' : '#d8323c';
          ctx.beginPath();
          ctx.arc(p.x, p.y, r * (1 - i / 30), 0, TAU);
          ctx.fill();
        }
        ctx.globalAlpha = base;
      }
      if (e && def.id === 'vex' && e.sprinting) {
        for (let i = 1; i < e.trail.length; i += 2) {
          const p = e.trail[i];
          ctx.globalAlpha = base * 0.25 * (1 - i / e.trail.length);
          ctx.fillStyle = '#ffb347';
          ctx.beginPath();
          ctx.arc(p.x, p.y, r * 0.5, 0, TAU);
          ctx.fill();
        }
        ctx.globalAlpha = base;
      }

      ctx.save();
      ctx.translate(x, y);
      // Shadow.
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(3, 5, r * 1.05, r * 0.85, 0, 0, TAU);
      ctx.fill();
      ctx.rotate(facing);
      const bob = moving ? Math.sin(t * 16) * 1.2 : 0;

      const body = (col, col2) => {
        const gr = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
        gr.addColorStop(0, col2);
        gr.addColorStop(1, col);
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();
      };
      const hands = (col, spread = 0.75) => {
        ctx.fillStyle = col;
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(r * 0.65 + (s > 0 ? bob : -bob), s * r * spread, r * 0.28, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.5)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      };

      switch (def.id) {
        case 'blitz': {
          // Lean sprinter body with gold lightning stripe.
          body('#8f1820', '#e2454e');
          ctx.strokeStyle = '#ffcc33';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(-r * 0.8, -r * 0.3); ctx.lineTo(-r * 0.2, r * 0.15); ctx.lineTo(-r * 0.1, -r * 0.2); ctx.lineTo(r * 0.5, r * 0.35);
          ctx.stroke();
          hands('#c22a33', 0.7);
          // Head + headband with whipping tails.
          ctx.fillStyle = '#2a1414';
          ctx.beginPath(); ctx.arc(r * 0.1, 0, r * 0.55, 0, TAU); ctx.fill();
          ctx.strokeStyle = '#ff2a35';
          ctx.lineWidth = 4;
          ctx.beginPath(); ctx.arc(r * 0.1, 0, r * 0.55, 0, TAU); ctx.stroke();
          const wave = Math.sin(t * 14) * 4;
          ctx.lineWidth = 3.5;
          for (const s of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(-r * 0.4, s * 2);
            ctx.quadraticCurveTo(-r * 1.3, s * 6 + wave, -r * 2.1, s * 4 - wave * 1.5 + (moving ? 0 : 6 * s));
            ctx.stroke();
          }
          // Visor eyes.
          ctx.fillStyle = '#ffdd55';
          ctx.fillRect(r * 0.45, -r * 0.3, 3, r * 0.2);
          ctx.fillRect(r * 0.45, r * 0.1, 3, r * 0.2);
          break;
        }
        case 'gravemaul': {
          const rage = e && Ent.has(e, 'rage');
          body('#2e3138', '#6b707c');
          // Molten seams.
          ctx.strokeStyle = rage ? '#ff2020' : '#ff5a1f';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-r * 0.7, 0); ctx.lineTo(r * 0.2, 0);
          ctx.moveTo(-r * 0.3, -r * 0.6); ctx.lineTo(-r * 0.3, r * 0.6);
          ctx.stroke();
          // Spiked pauldrons.
          for (const s of [-1, 1]) {
            ctx.fillStyle = '#454953';
            ctx.beginPath(); ctx.arc(-r * 0.05, s * r * 0.82, r * 0.42, 0, TAU); ctx.fill();
            ctx.strokeStyle = '#1b1d22'; ctx.lineWidth = 2; ctx.stroke();
            ctx.fillStyle = '#c8c8c8';
            for (let i = -1; i <= 1; i++) {
              const a = s * Math.PI / 2 + i * 0.6;
              const cx = -r * 0.05, cy = s * r * 0.82;
              ctx.beginPath();
              ctx.moveTo(cx + Math.cos(a - 0.25) * r * 0.38, cy + Math.sin(a - 0.25) * r * 0.38);
              ctx.lineTo(cx + Math.cos(a) * r * 0.75, cy + Math.sin(a) * r * 0.75);
              ctx.lineTo(cx + Math.cos(a + 0.25) * r * 0.38, cy + Math.sin(a + 0.25) * r * 0.38);
              ctx.fill();
            }
          }
          // Maul (raised during windups).
          const raising = e && e.cast && ['grave_cleave', 'grave_slam', 'm1'].includes(e.cast.id);
          const mf = raising ? e.cast.t / e.cast.windup : 0;
          ctx.save();
          ctx.translate(r * 0.4, r * 0.75);
          ctx.rotate(raising ? -0.4 - mf * 1.8 : 0.15);
          ctx.fillStyle = '#5a3a1e';
          ctx.fillRect(0, -2.5, r * 1.5, 5);
          ctx.fillStyle = '#3d4049';
          ctx.fillRect(r * 1.3, -r * 0.45, r * 0.55, r * 0.9);
          ctx.strokeStyle = rage ? '#ff2020' : '#ff5a1f';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(r * 1.3, -r * 0.45, r * 0.55, r * 0.9);
          ctx.restore();
          // Helm & horns.
          ctx.fillStyle = '#23252b';
          ctx.beginPath(); ctx.arc(r * 0.2, 0, r * 0.45, 0, TAU); ctx.fill();
          ctx.fillStyle = '#e8dcc0';
          for (const s of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(r * 0.3, s * r * 0.3);
            ctx.quadraticCurveTo(r * 0.9, s * r * 0.75, r * 1.25, s * r * 0.35);
            ctx.lineTo(r * 0.45, s * r * 0.12);
            ctx.closePath();
            ctx.fill();
          }
          ctx.fillStyle = rage ? '#ff2020' : '#ff8c1a';
          ctx.fillRect(r * 0.5, -r * 0.18, 3, 3);
          ctx.fillRect(r * 0.5, r * 0.08, 3, 3);
          break;
        }
        case 'mournveil': {
          // Trailing hood/cloak teardrop.
          const sway = Math.sin(t * 3) * 3;
          ctx.fillStyle = '#21173a';
          ctx.beginPath();
          ctx.moveTo(r * 0.9, 0);
          ctx.quadraticCurveTo(r * 0.6, -r * 1.2, -r * 0.6, -r * 0.9);
          ctx.quadraticCurveTo(-r * 2.0, sway, -r * 0.6, r * 0.9);
          ctx.quadraticCurveTo(r * 0.6, r * 1.2, r * 0.9, 0);
          ctx.fill();
          ctx.strokeStyle = 'rgba(185,140,255,0.45)';
          ctx.lineWidth = 2;
          ctx.stroke();
          body('#2b1d4a', '#5a3f8f');
          // Hood opening & eyes.
          ctx.fillStyle = '#0b0614';
          ctx.beginPath(); ctx.ellipse(r * 0.4, 0, r * 0.45, r * 0.5, 0, 0, TAU); ctx.fill();
          ctx.save();
          ctx.shadowColor = '#d9c2ff';
          ctx.shadowBlur = 10;
          ctx.fillStyle = '#efe4ff';
          ctx.beginPath(); ctx.arc(r * 0.6, -r * 0.18, 2.4, 0, TAU); ctx.fill();
          ctx.beginPath(); ctx.arc(r * 0.6, r * 0.18, 2.4, 0, TAU); ctx.fill();
          ctx.restore();
          // Claws.
          ctx.strokeStyle = '#c9b8e8';
          ctx.lineWidth = 1.5;
          for (const s of [-1, 1]) {
            for (let i = 0; i < 3; i++) {
              ctx.beginPath();
              ctx.moveTo(r * 0.7, s * (r * 0.8 + i * 2));
              ctx.lineTo(r * 1.15 + bob, s * (r * 0.7 + i * 3));
              ctx.stroke();
            }
          }
          break;
        }
        case 'vex': {
          // Glowing sneakers.
          ctx.save();
          ctx.shadowColor = '#ff7b00';
          ctx.shadowBlur = 8;
          ctx.fillStyle = '#ff9a2a';
          const step = moving ? Math.sin(t * 18) * 4 : 0;
          ctx.beginPath(); ctx.ellipse(-r * 0.1 + step, -r * 0.45, r * 0.38, r * 0.18, 0, 0, TAU); ctx.fill();
          ctx.beginPath(); ctx.ellipse(-r * 0.1 - step, r * 0.45, r * 0.38, r * 0.18, 0, 0, TAU); ctx.fill();
          ctx.restore();
          body('#d9a300', '#ffe680');
          // Jacket stripes.
          ctx.strokeStyle = '#1d1d1d';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(-r * 0.6, -r * 0.65); ctx.lineTo(r * 0.3, -r * 0.65); ctx.moveTo(-r * 0.6, r * 0.65); ctx.lineTo(r * 0.3, r * 0.65); ctx.stroke();
          hands('#c98b5a', 0.7);
          // Backwards cap.
          ctx.fillStyle = '#ff7b00';
          ctx.beginPath(); ctx.arc(r * 0.05, 0, r * 0.52, 0, TAU); ctx.fill();
          ctx.fillStyle = '#c45500';
          ctx.beginPath(); ctx.ellipse(-r * 0.55, 0, r * 0.3, r * 0.42, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = '#ffd23f';
          ctx.beginPath(); ctx.arc(r * 0.05, 0, 2, 0, TAU); ctx.fill();
          break;
        }
        case 'gorran': {
          body('#25508f', '#7fa7e6');
          // Plate lines.
          ctx.strokeStyle = 'rgba(255,255,255,0.25)';
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(0, 0, r * 0.75, 0, TAU); ctx.stroke();
          hands('#9aa5b3', 0.78);
          // Helmet with visor slit.
          ctx.fillStyle = '#b8c3d1';
          ctx.beginPath(); ctx.arc(r * 0.1, 0, r * 0.5, 0, TAU); ctx.fill();
          ctx.strokeStyle = '#4b5563'; ctx.lineWidth = 1.5; ctx.stroke();
          ctx.fillStyle = '#111';
          ctx.fillRect(r * 0.38, -r * 0.32, 3, r * 0.64);
          ctx.fillStyle = '#3d7bd9';
          ctx.fillRect(-r * 0.4, -1.5, r * 0.7, 3);
          // Tower shield.
          const sh = e && Ent.has(e, 'shield');
          ctx.save();
          if (sh) { ctx.shadowColor = '#9fd0ff'; ctx.shadowBlur = 16; }
          ctx.fillStyle = sh ? '#cfe6ff' : '#6c87ad';
          ctx.strokeStyle = sh ? '#ffffff' : '#2b3d57';
          ctx.lineWidth = 2;
          const sw = sh ? r * 2.3 : r * 1.4, sx = sh ? r * 1.15 : r * 0.95;
          ctx.beginPath();
          ctx.ellipse(sx, 0, 5, sw / 2, 0, 0, TAU);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
          if (sh) {
            ctx.strokeStyle = 'rgba(159,208,255,0.5)';
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(0, 0, r * 1.9, -1.2, 1.2); ctx.stroke();
          }
          break;
        }
        case 'juno': {
          // Battery pack on back.
          ctx.fillStyle = '#2f3a3a';
          ctx.fillRect(-r * 1.15, -r * 0.5, r * 0.6, r);
          ctx.fillStyle = Math.sin(t * 6) > 0 ? '#e6ff4a' : '#6f7d1a';
          ctx.fillRect(-r * 1.05, -r * 0.15, 3, 3);
          body('#118a80', '#5ff2e4');
          hands('#c98b5a', 0.72);
          // Head + flash goggles.
          ctx.fillStyle = '#3b2a1e';
          ctx.beginPath(); ctx.arc(r * 0.1, 0, r * 0.5, 0, TAU); ctx.fill();
          ctx.strokeStyle = '#222'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(r * 0.5, -r * 0.3); ctx.lineTo(r * 0.5, r * 0.3); ctx.stroke();
          ctx.save();
          ctx.shadowColor = '#e6ff4a';
          ctx.shadowBlur = 6;
          ctx.fillStyle = '#e6ff4a';
          ctx.beginPath(); ctx.arc(r * 0.5, -r * 0.24, r * 0.17, 0, TAU); ctx.fill();
          ctx.beginPath(); ctx.arc(r * 0.5, r * 0.24, r * 0.17, 0, TAU); ctx.fill();
          ctx.restore();
          // Taser in right hand.
          ctx.fillStyle = '#e6ff4a';
          ctx.fillRect(r * 0.8, r * 0.6, r * 0.5, 3);
          break;
        }
        case 'rosa': {
          // Satchel.
          ctx.fillStyle = '#7a4a2a';
          ctx.fillRect(-r * 0.5, r * 0.55, r * 0.7, r * 0.5);
          body('#c9c9c9', '#ffffff');
          hands('#d9a07a', 0.72);
          // Armband.
          ctx.fillStyle = '#e0313b';
          ctx.fillRect(r * 0.35, -r * 0.95, r * 0.25, r * 0.25);
          // Head with nurse cap + red cross.
          ctx.fillStyle = '#5a3221';
          ctx.beginPath(); ctx.arc(r * 0.05, 0, r * 0.5, 0, TAU); ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(-r * 0.05, 0, r * 0.36, 0, TAU); ctx.fill();
          ctx.fillStyle = '#e0313b';
          ctx.fillRect(-r * 0.05 - r * 0.25, -r * 0.08, r * 0.5, r * 0.16);
          ctx.fillRect(-r * 0.05 - r * 0.08, -r * 0.25, r * 0.16, r * 0.5);
          break;
        }
        case 'bolt': {
          // Tool belt & wrench.
          body('#c96a0a', '#ffb060');
          ctx.fillStyle = '#4a3020';
          ctx.fillRect(-r * 0.15, -r, r * 0.3, r * 2);
          hands('#c98b5a', 0.74);
          ctx.save();
          ctx.translate(r * 0.7, r * 0.75);
          ctx.rotate(e && e.repairing ? Math.sin(t * 14) * 0.6 : 0.3);
          ctx.fillStyle = '#9aa1ab';
          ctx.fillRect(0, -2, r * 0.9, 4);
          ctx.beginPath(); ctx.arc(r * 0.95, 0, 4.5, 0, TAU); ctx.fill();
          ctx.fillStyle = '#c96a0a';
          ctx.beginPath(); ctx.arc(r * 1.05, 0, 2, 0, TAU); ctx.fill();
          ctx.restore();
          // Hard hat with lamp.
          ctx.fillStyle = '#e0b800';
          ctx.beginPath(); ctx.arc(r * 0.05, 0, r * 0.62, 0, TAU); ctx.fill();
          ctx.fillStyle = '#ffe14d';
          ctx.beginPath(); ctx.arc(r * 0.05, 0, r * 0.48, 0, TAU); ctx.fill();
          ctx.strokeStyle = '#c9a000'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(-r * 0.4, 0); ctx.lineTo(r * 0.5, 0); ctx.stroke();
          ctx.fillStyle = '#fffbe0';
          ctx.beginPath(); ctx.arc(r * 0.55, 0, 3, 0, TAU); ctx.fill();
          if (o.g) {
            const gr = ctx.createRadialGradient(r * 0.6, 0, 2, r * 2.5, 0, r * 3);
            gr.addColorStop(0, 'rgba(255,250,200,0.35)');
            gr.addColorStop(1, 'rgba(255,250,200,0)');
            ctx.fillStyle = gr;
            ctx.beginPath(); ctx.moveTo(r * 0.6, 0); ctx.arc(r * 0.6, 0, r * 4, -0.35, 0.35); ctx.closePath(); ctx.fill();
          }
          break;
        }
      }
      ctx.restore();
    },

    // ---------------------------------------------------- projectiles & fx
    drawProjectiles(ctx, g) {
      for (const p of g.projectiles) {
        if (p.kind === 'flash') {
          const h = p.h || 0;
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, TAU); ctx.fill();
          ctx.fillStyle = '#d6dde0';
          ctx.beginPath(); ctx.arc(p.x, p.y - h, 6, 0, TAU); ctx.fill();
          if (p.t > p.flight) {
            const f = (p.t - p.flight) / p.fuse;
            ctx.strokeStyle = `rgba(255,255,255,${0.3 + f * 0.6})`;
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(p.x, p.y, 115 * f, 0, TAU); ctx.stroke();
            ctx.fillStyle = Math.sin(p.t * 40) > 0 ? '#ff4040' : '#fff';
            ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, TAU); ctx.fill();
          }
          continue;
        }
        if (p.kind === 'hook') {
          ctx.strokeStyle = 'rgba(185,140,255,0.8)';
          ctx.lineWidth = 3;
          ctx.setLineDash([6, 4]);
          ctx.beginPath(); ctx.moveTo(p.owner.x, p.owner.y); ctx.lineTo(p.x, p.y); ctx.stroke();
          ctx.setLineDash([]);
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
        if (p.floor) continue;
        const f = p.t / p.dur;
        ctx.globalAlpha = (p.soft ? 0.4 : 1) * (1 - f);
        ctx.fillStyle = p.color;
        if (p.shape === 'plus') {
          ctx.fillRect(p.x - p.size, p.y - 1, p.size * 2, 2);
          ctx.fillRect(p.x - 1, p.y - p.size, 2, p.size * 2);
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (p.soft ? 1 + f : 1), 0, TAU);
          ctx.fill();
        }
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
        } else if (f.type === 'swing') {
          ctx.strokeStyle = f.color;
          ctx.lineWidth = f.wide ? 10 : 6;
          ctx.beginPath();
          const a0 = f.a - f.arc / 2, a1 = f.a + f.arc / 2;
          ctx.arc(f.x, f.y, f.range * 0.85, a0 + (a1 - a0) * Math.max(0, k - 0.3), a0 + (a1 - a0) * Math.min(1, k * 2 + 0.2));
          ctx.stroke();
        } else if (f.type === 'beam') {
          ctx.strokeStyle = f.color;
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x2, f.y2); ctx.stroke();
        } else if (f.type === 'zap' || f.type === 'arc') {
          const ent = f.type === 'arc';
          ctx.strokeStyle = ent ? '#e6ff4a' : '#f4ffb0';
          ctx.lineWidth = ent ? 1.5 : 3;
          const n = ent ? 1 : 5;
          for (let j = 0; j < n; j++) {
            const a = ent ? f.seed * TAU : f.a + (j - 2) * 0.22;
            const len = ent ? 20 : f.range;
            ctx.beginPath();
            ctx.moveTo(f.x, f.y);
            for (let i = 1; i <= 5; i++) {
              const d = (len * i) / 5;
              ctx.lineTo(f.x + Math.cos(a) * d + U.rand(-5, 5), f.y + Math.sin(a) * d + U.rand(-5, 5));
            }
            ctx.stroke();
          }
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
      const bo = g.world.blackout && g.world.blackout.on;
      dc.fillStyle = `rgba(2,2,6,${bo ? 0.94 : g.mapDef.dark})`;
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
      // Restored generators light the area around them.
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
      // Terror vignette.
      if (focus.team === 'survivor' && !focus.dead && !Ent.has(k, 'shade')) {
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
        ctx.strokeStyle = `rgba(185,140,255,${0.3 + 0.2 * Math.sin(g.time * 6)})`;
        ctx.lineWidth = 12;
        ctx.strokeRect(0, 0, W, H);
      }
      if (g.flashT > 0) {
        ctx.fillStyle = `rgba(255,255,255,${Math.min(1, g.flashT)})`;
        ctx.fillRect(0, 0, W, H);
      }

      // Timer + gens.
      ctx.textAlign = 'center';
      this.panel(ctx, W / 2 - 110, 10, 220, 74);
      ctx.fillStyle = g.timer < 30 ? '#ffcf5a' : '#f2e6c9';
      ctx.font = 'bold 30px Georgia, serif';
      ctx.fillText(U.fmtTime(g.timer), W / 2, 44);
      ctx.font = '10px Georgia, serif';
      ctx.fillStyle = '#a8977a';
      ctx.fillText('UNTIL DAWN', W / 2, 57);
      const gens = g.world.gens;
      const gw = 26;
      gens.forEach((gen, i) => {
        const x = W / 2 - (gens.length * gw) / 2 + i * gw + 4, y = 63;
        ctx.fillStyle = '#222';
        ctx.fillRect(x, y, gw - 8, 13);
        ctx.fillStyle = gen.done ? '#7dff8a' : '#ffe14d';
        ctx.fillRect(x, y + 13 - 13 * gen.progress, gw - 8, 13 * gen.progress);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, gw - 8, 13);
      });

      // Team list.
      ctx.textAlign = 'left';
      this.panel(ctx, 10, 10, 210, 26 + g.survivors.length * 30);
      ctx.font = 'bold 11px Georgia, serif';
      ctx.fillStyle = '#a8977a';
      ctx.fillText('SURVIVORS', 20, 28);
      g.survivors.forEach((s, i) => {
        const y = 40 + i * 30;
        ctx.fillStyle = s.dead ? '#444' : s.def.color;
        ctx.beginPath(); ctx.arc(28, y + 8, 8, 0, TAU); ctx.fill();
        ctx.font = (s.isPlayer ? 'bold ' : '') + '12px Georgia, serif';
        ctx.fillStyle = s.dead ? '#777' : '#eee';
        ctx.fillText(s.name + (s.isPlayer ? ' (you)' : ''), 42, y + 6);
        ctx.font = '9px Georgia, serif';
        ctx.fillStyle = '#9a8f80';
        ctx.fillText(s.def.role, 150, y + 6);
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

      // Feed.
      ctx.textAlign = 'right';
      g.feedList.forEach((f, i) => {
        ctx.globalAlpha = Math.min(1, f.t);
        ctx.font = '13px Georgia, serif';
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        const tw = ctx.measureText(f.s).width;
        ctx.fillRect(W - tw - 26, 12 + i * 24, tw + 16, 20);
        ctx.fillStyle = f.color;
        ctx.fillText(f.s, W - 18, 27 + i * 24);
      });
      ctx.globalAlpha = 1;

      // Banner.
      if (g.banner) {
        const b = g.banner;
        const a = Math.min(1, b.t * 2, (b.dur - b.t) * 4 + 0.2);
        ctx.globalAlpha = a;
        ctx.textAlign = 'center';
        ctx.font = 'bold 36px Georgia, serif';
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#000';
        ctx.strokeText(b.s, W / 2, H * 0.28);
        ctx.fillStyle = b.color;
        ctx.fillText(b.s, W / 2, H * 0.28);
        if (b.sub) {
          ctx.font = 'italic 16px Georgia, serif';
          ctx.strokeText(b.sub, W / 2, H * 0.28 + 28);
          ctx.fillStyle = '#ddd';
          ctx.fillText(b.sub, W / 2, H * 0.28 + 28);
        }
        ctx.globalAlpha = 1;
      }

      if (p.dead) {
        ctx.textAlign = 'center';
        ctx.font = 'bold 16px Georgia, serif';
        ctx.fillStyle = '#ff8080';
        ctx.fillText(`SPECTATING ${focus.name.toUpperCase()}   [Tab] next`, W / 2, H - 30);
      } else {
        this.drawAbilityBar(ctx, g, p, W, H);
        this.drawVitals(ctx, g, p, W, H);
        this.drawPrompt(ctx, g, p, W, H);
      }
      this.drawMinimap(ctx, g, focus, W, H);
    },

    panel(ctx, x, y, w, h) {
      ctx.fillStyle = 'rgba(12,9,7,0.72)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(168,151,122,0.45)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    },

    drawAbilityBar(ctx, g, p, W, H) {
      const slots = p.team === 'killer' ? ['M1', 'Q', 'E', 'R'] : ['Q', 'E'];
      const S = 62, gap = 10;
      const total = slots.length * (S + gap) - gap + (p.team === 'survivor' ? S + gap : 0);
      let x = W / 2 - total / 2;
      const y = H - S - 34;
      for (const slot of slots) {
        const ab = Ent.ability(p, slot);
        this.panel(ctx, x, y, S, S);
        const cd = p.cds[slot];
        const casting = p.cast && p.cast.slot === slot;
        ctx.fillStyle = casting ? 'rgba(255,80,80,0.35)' : U.hexA(p.def.color, 0.28);
        ctx.fillRect(x + 2, y + 2, S - 4, S - 4);
        this.abilityIcon(ctx, ab.id, x + S / 2, y + S / 2 - 4, p.def);
        if (cd > 0) {
          const f = cd / ab.cd;
          ctx.fillStyle = 'rgba(0,0,0,0.65)';
          ctx.save();
          ctx.beginPath();
          ctx.rect(x, y, S, S);
          ctx.clip();
          ctx.beginPath();
          ctx.moveTo(x + S / 2, y + S / 2);
          ctx.arc(x + S / 2, y + S / 2, S * 0.75, -Math.PI / 2, -Math.PI / 2 + TAU * f);
          ctx.fill();
          ctx.restore();
          if (cd > 0.3) {
            ctx.font = 'bold 18px Georgia, serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#fff';
            ctx.fillText(cd >= 1 ? Math.ceil(cd) : cd.toFixed(1), x + S / 2, y + S / 2 + 6);
          }
        }
        if (casting) {
          ctx.fillStyle = '#ff5050';
          ctx.fillRect(x, y + S - 4, S * (p.cast.t / Math.max(0.01, p.cast.windup)), 4);
        }
        ctx.font = 'bold 12px Georgia, serif';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffe9b0';
        ctx.fillText(slot === 'M1' ? 'LMB' : slot, x + 4, y + 13);
        ctx.font = '10px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#d8ccb4';
        ctx.fillText(ab.name, x + S / 2, y + S + 13);
        x += S + gap;
      }
      if (p.team === 'survivor') {
        this.panel(ctx, x, y, S, S);
        ctx.fillStyle = 'rgba(255,225,77,0.12)';
        ctx.fillRect(x + 2, y + 2, S - 4, S - 4);
        ctx.textAlign = 'center';
        ctx.font = 'bold 22px Georgia, serif';
        ctx.fillStyle = '#ffe14d';
        ctx.fillText('★', x + S / 2, y + S / 2 + 6);
        ctx.font = '10px Georgia, serif';
        ctx.fillStyle = '#d8ccb4';
        ctx.fillText(p.def.passive.name, x + S / 2, y + S + 13);
        ctx.font = 'bold 9px Georgia, serif';
        ctx.fillStyle = '#a8977a';
        ctx.fillText('PASSIVE', x + S / 2, y + 12);
      }
    },

    abilityIcon(ctx, id, x, y, def) {
      ctx.save();
      ctx.translate(x, y);
      ctx.strokeStyle = def.color2;
      ctx.fillStyle = def.color2;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      const L = (pts) => { ctx.beginPath(); pts.forEach(([a, b], i) => (i ? ctx.lineTo(a, b) : ctx.moveTo(a, b))); ctx.stroke(); };
      switch (id) {
        case 'm1': L([[-12, 10], [12, -10]]); L([[-6, 12], [14, -4]]); break;
        case 'blitz_dash': L([[-14, 0], [10, 0]]); L([[4, -7], [12, 0], [4, 7]]); L([[-14, -8], [-4, -8]]); L([[-14, 8], [-4, 8]]); break;
        case 'blitz_overdrive': L([[2, -14], [-6, 2], [4, 2], [-2, 14]]); break;
        case 'blitz_tracer': ctx.beginPath(); ctx.arc(0, 0, 10, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fill(); break;
        case 'grave_cleave': ctx.beginPath(); ctx.arc(0, 6, 14, -2.6, -0.5); ctx.stroke(); L([[0, 6], [8, -6]]); break;
        case 'grave_slam': ctx.beginPath(); ctx.arc(0, 4, 6, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 4, 13, Math.PI, TAU); ctx.stroke(); L([[0, -14], [0, -4]]); break;
        case 'grave_rage': L([[-10, 10], [-4, -10], [0, 2], [4, -10], [10, 10]]); break;
        case 'mourn_shade': ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(-4, -2, 2, 0, TAU); ctx.arc(4, -2, 2, 0, TAU); ctx.fill(); break;
        case 'mourn_hook': L([[-12, 10], [6, -8]]); ctx.beginPath(); ctx.arc(8, -2, 6, -2.4, 1.2); ctx.stroke(); break;
        case 'mourn_dread': ctx.beginPath(); ctx.ellipse(0, 0, 13, 7, 0, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, TAU); ctx.fill(); break;
        case 'vex_burst': L([[-12, 6], [-2, -2], [2, 4], [12, -6]]); L([[6, -7], [12, -6], [11, 0]]); break;
        case 'vex_slide': L([[-14, 8], [12, 8]]); ctx.beginPath(); ctx.arc(-4, -2, 5, 0, TAU); ctx.stroke(); break;
        case 'gorran_shield': ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(11, -8); ctx.lineTo(9, 6); ctx.lineTo(0, 13); ctx.lineTo(-9, 6); ctx.lineTo(-11, -8); ctx.closePath(); ctx.stroke(); break;
        case 'gorran_link': ctx.beginPath(); ctx.arc(-6, 0, 6, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(6, 0, 6, 0, TAU); ctx.stroke(); break;
        case 'juno_flash': ctx.beginPath(); ctx.arc(0, 2, 8, 0, TAU); ctx.stroke(); L([[0, -6], [0, -13]]); L([[-12, -10], [-8, -6]]); L([[12, -10], [8, -6]]); break;
        case 'juno_taser': L([[-3, -13], [-8, 1], [2, 1], [-3, 13]]); L([[6, -6], [12, -10]]); L([[6, 6], [12, 10]]); break;
        case 'rosa_heal': ctx.fillRect(-3.5, -12, 7, 24); ctx.fillRect(-12, -3.5, 24, 7); break;
        case 'rosa_shot': L([[-12, 12], [8, -8]]); L([[4, -12], [12, -4]]); L([[-12, 12], [-8, 8]]); break;
        case 'bolt_barricade': for (let i = 0; i < 3; i++) L([[-12, -8 + i * 8], [12, -8 + i * 8]]); L([[-6, -12], [-6, 12]]); L([[6, -12], [6, 12]]); break;
        case 'bolt_mine': ctx.beginPath(); ctx.arc(0, 2, 9, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 2, 3, 0, TAU); ctx.fill(); L([[-12, -10], [-7, -5]]); L([[12, -10], [7, -5]]); break;
      }
      ctx.restore();
    },

    drawVitals(ctx, g, p, W, H) {
      const x = 16, y = H - 92;
      this.panel(ctx, x - 6, y - 24, 250, 86);
      ctx.textAlign = 'left';
      ctx.font = 'bold 15px Georgia, serif';
      ctx.fillStyle = p.def.color;
      ctx.fillText(p.def.name, x, y - 6);
      const nw = ctx.measureText(p.def.name).width;
      ctx.font = 'italic 11px Georgia, serif';
      ctx.fillStyle = '#a8977a';
      ctx.fillText(p.def.title + ' · ' + p.def.role, x + nw + 10, y - 6);
      let yy = y + 4;
      if (p.team === 'survivor') {
        ctx.fillStyle = '#222';
        ctx.fillRect(x, yy, 230, 14);
        const f = p.hp / p.maxHp;
        ctx.fillStyle = f > 0.6 ? '#5dd36a' : f > 0.3 ? '#ffc23f' : '#ff4040';
        ctx.fillRect(x, yy, 230 * f, 14);
        ctx.font = 'bold 11px Georgia, serif';
        ctx.fillStyle = '#fff';
        ctx.fillText(`${Math.ceil(p.hp)} / ${p.maxHp}`, x + 6, yy + 11);
        yy += 20;
      }
      ctx.fillStyle = '#222';
      ctx.fillRect(x, yy, 230, 8);
      ctx.fillStyle = '#7ad7ff';
      ctx.fillRect(x, yy, 230 * (p.stamina / 100), 8);
      yy += 22;
      // Active effects.
      const names = { stun: 'Stunned', slow: 'Slowed', marked: 'Marked', revealed: 'Revealed', shield: 'Shield up', linked: 'Guarded', guarding: 'Guarding', burst: 'Sprint Burst', adrenal: 'Adrenaline', hitboost: 'Adrenaline rush', recover: 'Recovering', rising: 'Rising from the fog', overdrive: 'Overdrive', rage: 'Bloodrage', shade: 'Shade Walk', root: 'Trapped', zap: 'Wired', invuln: 'Invulnerable' };
      const list = p.effects.filter((f) => names[f.type]).map((f) => `${names[f.type]} ${f.t.toFixed(1)}s`);
      ctx.font = '11px Georgia, serif';
      ctx.fillStyle = '#e8dcc0';
      ctx.fillText(list.join('  ·  '), x, yy);
    },

    drawPrompt(ctx, g, p, W, H) {
      if (p.team !== 'survivor') return;
      let msg = null;
      const gen = g.world.gens.find((gn) => !gn.done && U.dist(p, gn) < 64);
      if (p.repairing) msg = `Repairing… ${Math.floor(p.repairing.progress * 100)}%`;
      else if (gen) msg = 'Hold [F] to repair (stand still)';
      const v = g.world.teleVents.find((vv) => U.dist(p, vv) < 42);
      if (v && !p.repairing) msg = p.ventCd > 0 ? `Vent cooling down ${p.ventCd.toFixed(1)}s` : 'Press [F] to crawl through the vent';
      if (!msg) return;
      ctx.font = 'bold 15px Georgia, serif';
      ctx.textAlign = 'center';
      const tw = ctx.measureText(msg).width;
      this.panel(ctx, W / 2 - tw / 2 - 12, H - 150, tw + 24, 28);
      ctx.fillStyle = '#ffe9b0';
      ctx.fillText(msg, W / 2, H - 131);
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
        for (let ty = 0; ty < w.h; ty++) for (let tx = 0; tx < w.w; tx++) {
          const ch = w.at(tx, ty);
          c2.fillStyle = ch === '#' ? '#000' : ch === 'x' ? '#4a3a2a' : ch === ',' ? '#1f3a1a' : ch === 'F' ? '#5a2a10' : ch === '=' ? '#3a3a3a' : '#1c1a18';
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
        ctx.fillStyle = gen.done ? '#7dff8a' : '#ffe14d';
        ctx.fillRect(x + gen.x * k - 2.5, y + gen.y * k - 2.5, 5, 5);
      }
      for (const e of g.ents) {
        if (e.dead) continue;
        if (e !== focus && !(e.team === focus.team) && !g.canSee(focus, e)) continue;
        ctx.fillStyle = e.team === 'killer' ? '#ff3030' : e === focus ? '#ffffff' : e.def.color;
        ctx.beginPath();
        ctx.arc(x + e.x * k, y + e.y * k, e === focus ? 3.5 : 2.5, 0, TAU);
        ctx.fill();
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
      const sc = (Math.min(W, H) * 0.3) / def.r;
      ctx.save();
      ctx.translate(W / 2 + (def.id === 'blitz' || def.id === 'mournveil' ? W * 0.06 : 0), H / 2);
      ctx.scale(sc, sc);
      // Fake entity so state cosmetics (shield, trails) show in the book.
      const fake = {
        vx: 0, vy: 0, trail: [], effects: [], cast: null, repairing: null, sprinting: false,
      };
      if (opts.pose) {
        if (def.id === 'gorran') fake.effects.push({ type: 'shield', t: 1 });
        if (def.id === 'gravemaul') fake.effects.push({ type: 'rage', t: 1 });
      }
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
})();
