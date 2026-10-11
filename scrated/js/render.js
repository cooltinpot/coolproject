// Side-view renderer for SCRATED: map art, sprite animation from the
// killer atlases, telegraphs, hitboxes, projectiles, screen effects and HUD.
(function () {
  const G = window.G;
  const U = G.U;
  const T = G.TILE;
  const Ent = G.Ent;
  const TAU = Math.PI * 2;
  const F = '"Rubik", "Trebuchet MS", Arial, sans-serif';

  // How tall each character stands on screen (world px).
  const HEIGHT = { sc: 92, protocol2: 92, burgers: 104, creaker: 122, revengest: 96, scratchy: 76, griffpatch: 76, nano: 74 };
  const SURV_FACE = { scratchy: 1, griffpatch: -1, nano: -1 };
  const FPS = { idle: 7, walk: 12, slash: 0, walkslash: 0, dash: 14, dashwind: 0, crash: 10, vision: 0, kill: 13, weak: 6, weakwalk: 10, dead: 12, stomp: 0, prep: 6, yell: 14, charge: 0, summon: 0, spike: 12 };

  const R = (G.Render = {
    images: {},
    ready: false,
    init(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
    },
    load() {
      const srcs = [...Object.keys(G.ATLAS), 'scratchy', 'griffpatch', 'nano'];
      return Promise.all(srcs.map((s) => new Promise((res) => {
        const img = new Image();
        img.onload = () => res();
        img.onerror = () => res();
        img.src = 'assets/sprites/' + s + '.png';
        this.images[s] = img;
      }))).then(() => { this.ready = true; });
    },
    setup(W, H) {
      const c = this.canvas;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (c.width !== Math.floor(W * dpr) || c.height !== Math.floor(H * dpr)) {
        c.width = Math.floor(W * dpr); c.height = Math.floor(H * dpr);
        c.style.width = W + 'px'; c.style.height = H + 'px';
      }
      return dpr;
    },

    // --------------------------------------------------------------- sprites
    // Returns {img, sx, sy, sw, sh, ax, ay, s, base, face} for an entity pose.
    pose(defId, anim, t, ent) {
      const A = G.ATLAS[defId];
      if (!A) {
        const img = this.images[defId];
        if (!img || !img.width) return null;
        const s = (HEIGHT[defId] || 76) / img.height;
        return { img, sx: 0, sy: 0, sw: img.width, sh: img.height, ax: img.width * 0.5, ay: img.height, s, base: 0, face: SURV_FACE[defId] || 1 };
      }
      let frames = A.anims[anim];
      if (!frames || !frames.length) frames = A.anims.idle;
      let i;
      const fps = FPS[anim];
      if (fps === 0 && ent && ent.cast) i = Math.floor(U.clamp(ent.cast.t / Math.max(0.05, ent.cast.windup), 0, 0.999) * frames.length);
      else if (fps === 0) i = Math.min(frames.length - 1, Math.floor(t * 14));
      else if (anim === 'kill' || anim === 'dead' || anim === 'crash') i = Math.min(frames.length - 1, Math.floor(t * (fps || 10)));
      else i = Math.floor(t * (fps || 10)) % frames.length;
      const f = A.frames[frames[i]];
      const idle = A.frames[A.anims.idle[0]];
      const s = (HEIGHT[defId] || 92) / idle[3];
      return { img: this.images[defId], sx: f[0], sy: f[1], sw: f[2], sh: f[3], ax: f[4], ay: f[5], s, base: A.baseline, face: 1 };
    },
    drawPose(ctx, p, x, y, facing, opts = {}) {
      if (!p || !p.img) return;
      ctx.save();
      ctx.translate(x, y);
      if (opts.rot) { ctx.translate(0, -opts.pivot || 0); ctx.rotate(opts.rot); ctx.translate(0, opts.pivot || 0); }
      if (facing !== p.face) ctx.scale(-1, 1);
      const s = p.s * (opts.scale || 1);
      ctx.scale(s, s);
      if (opts.filter) ctx.filter = opts.filter;
      ctx.drawImage(p.img, p.sx, p.sy, p.sw, p.sh, -p.ax, -p.base - p.ay, p.sw, p.sh);
      ctx.restore();
    },

    // ---------------------------------------------------------------- frame
    frame(g) {
      const ctx = this.ctx;
      const W = window.innerWidth, H = window.innerHeight;
      const dpr = this.setup(W, H);
      g.vw = W; g.vh = H;
      const focus = g.spectate || g.player;
      const cam = g.cam;
      cam.zoom = U.clamp(Math.min(W / 1180, H / 700), 0.55, 1.5);
      const lead = (focus.vx || 0) * 0.25;
      cam.x = U.lerp(cam.x, focus.x + lead, 0.12);
      cam.y = U.lerp(cam.y, focus.y - 70, 0.12);
      const hw = W / 2 / cam.zoom, hh = H / 2 / cam.zoom, w = g.world;
      cam.x = w.pw > hw * 2 ? U.clamp(cam.x, hw, w.pw - hw) : w.pw / 2;
      cam.y = w.ph > hh * 2 ? U.clamp(cam.y, hh, w.ph - hh) : w.ph / 2;
      const sh = g.shakeAmt;
      const sx = sh > 0.3 ? U.rand(-sh, sh) : 0, sy = sh > 0.3 ? U.rand(-sh, sh) : 0;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.drawBackground(ctx, g, W, H);
      ctx.save();
      ctx.translate(W / 2 + sx, H / 2 + sy);
      ctx.scale(cam.zoom, cam.zoom);
      ctx.translate(-cam.x, -cam.y);
      ctx.drawImage(this.tileLayer(w), 0, 0);
      this.drawDynamicTiles(ctx, g);
      this.drawTelegraphs(ctx, g);
      this.drawEntities(ctx, g, focus);
      this.drawProjectiles(ctx, g);
      this.drawFx(ctx, g);
      for (const t of g.texts) {
        ctx.globalAlpha = 1 - t.t / t.dur;
        ctx.font = `bold 14px ${F}`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 3; ctx.strokeStyle = '#000';
        ctx.strokeText(t.s, t.x, t.y);
        ctx.fillStyle = t.color;
        ctx.fillText(t.s, t.x, t.y);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      this.drawScreenFx(ctx, g, W, H, focus);
      if (!(G.Cutscene && G.Cutscene.active)) this.drawHUD(ctx, g, W, H, focus);
    },

    // ----------------------------------------------------------- background
    drawBackground(ctx, g, W, H) {
      const m = g.mapDef;
      const gr = ctx.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, m.sky[0]); gr.addColorStop(0.6, m.sky[1]); gr.addColorStop(1, m.sky[2]);
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, W, H);
      const px = g.cam.x / g.world.pw;
      const t = g.time;
      if (m.id === 'mit') {
        // The village and the broken ten-thousand-foot tower against the red sky.
        ctx.fillStyle = 'rgba(40,6,8,0.55)';
        const rnd = R.mulberry(4);
        for (let i = 0; i < 30; i++) {
          const x = ((i * 90 - px * 300) % (W + 200)) - 100, h = 30 + rnd() * 90;
          ctx.fillRect(x, H - h - 40, 50 + rnd() * 40, h + 40);
        }
        ctx.fillStyle = 'rgba(25,3,5,0.75)';
        const tx = W * 0.65 - px * 160;
        ctx.beginPath();
        ctx.moveTo(tx, H); ctx.lineTo(tx, H * 0.35); ctx.lineTo(tx + 30, H * 0.3); ctx.lineTo(tx + 55, H * 0.42); ctx.lineTo(tx + 80, H * 0.28); ctx.lineTo(tx + 110, H * 0.36); ctx.lineTo(tx + 110, H);
        ctx.fill();
        for (let i = 0; i < 25; i++) {
          const x = (i * 137 + t * 12) % W, y = (i * 59 + t * 20) % H;
          ctx.fillStyle = 'rgba(30,10,10,0.5)';
          ctx.fillRect(x, y, 2, 2);
        }
      } else if (m.id === 'dm') {
        // Stage backdrop: curtains, spotlights.
        ctx.fillStyle = 'rgba(90,20,60,0.35)';
        for (let i = 0; i < 16; i++) { const x = (i / 16) * W; ctx.fillRect(x, 0, W / 32, H * 0.25 + Math.sin(i) * 20); }
        for (let i = 0; i < 3; i++) {
          const x = W * (0.25 + i * 0.25) + Math.sin(t * 0.5 + i) * 60;
          const sg = ctx.createLinearGradient(x, 0, x, H);
          sg.addColorStop(0, 'rgba(200,160,255,0.18)'); sg.addColorStop(1, 'rgba(200,160,255,0)');
          ctx.fillStyle = sg;
          ctx.beginPath(); ctx.moveTo(x - 10, 0); ctx.lineTo(x + 10, 0); ctx.lineTo(x + 140, H); ctx.lineTo(x - 140, H); ctx.fill();
        }
      } else {
        // Castle stonework.
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 1;
        const off = -(g.cam.x * 0.3) % 60;
        for (let y = 0; y < H; y += 30) for (let x = off + ((y / 30) % 2) * 30 - 60; x < W; x += 60) ctx.strokeRect(x, y, 60, 30);
      }
    },

    // ------------------------------------------------------------- tiles
    tileLayer(world) {
      if (world._layer) return world._layer;
      const cv = document.createElement('canvas');
      cv.width = world.pw; cv.height = world.ph;
      const ctx = cv.getContext('2d');
      const m = world.def;
      const rnd = R.mulberry(world.w * 31 + world.h);
      const at = (x, y) => world.at(x, y);
      const solid = (c) => '#bhp'.includes(c);
      for (let ty = 0; ty < world.h; ty++) for (let tx = 0; tx < world.w; tx++) {
        const c = at(tx, ty), x = tx * T, y = ty * T;
        if (c === '#') {
          if (ty === 0 || tx === 0 || tx === world.w - 1) {
            ctx.fillStyle = m.solid2; ctx.fillRect(x, y, T, T);
            continue;
          }
          const top = !solid(at(tx, ty - 1));
          if (m.id === 'castle') {
            const floor = ty >= world.h - 3;
            if (floor && top) {
              // Checkered floor with red carpet along the bottom.
              ctx.fillStyle = (tx % 2) ? '#e8e8e8' : '#141414'; ctx.fillRect(x, y, T, T / 2);
              ctx.fillStyle = (tx % 2) ? '#141414' : '#e8e8e8'; ctx.fillRect(x, y + T / 2, T, T / 2);
              ctx.fillStyle = '#8b0f1a'; ctx.fillRect(x, y, T, 7);
              ctx.fillStyle = '#d4a017'; ctx.fillRect(x, y + 7, T, 2);
            } else {
              ctx.fillStyle = floor ? '#0a0a0a' : m.solid; ctx.fillRect(x, y, T, T);
              ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.strokeRect(x + 0.5, y + 0.5, T - 1, T - 1);
              const corner = (tx < 4 || tx > world.w - 5) && (ty < 4 || (ty > 12 && ty < 17));
              if (corner) { ctx.strokeStyle = 'rgba(200,200,200,0.25)'; ctx.beginPath(); ctx.moveTo(x + 4, y + 6); ctx.lineTo(x + 16, y + 18); ctx.lineTo(x + 12, y + 28); ctx.stroke(); }
            }
          } else if (m.id === 'mit') {
            const outside = tx < 31 && ty >= world.h - 3;
            ctx.fillStyle = outside ? '#3a2416' : (ty % 2 ? m.solid : '#666c78');
            ctx.fillRect(x, y, T, T);
            if (outside && top) { ctx.fillStyle = '#4e3a1c'; ctx.fillRect(x, y, T, 6); }
            else if (top) { ctx.fillStyle = '#8e95a2'; ctx.fillRect(x, y, T, 4); }
            ctx.fillStyle = 'rgba(0,0,0,0.18)';
            for (let i = 0; i < 2; i++) ctx.fillRect(x + rnd() * 28, y + rnd() * 28, 3, 3);
            if (!solid(at(tx, ty + 1)) && rnd() < 0.5) { ctx.strokeStyle = '#3e2f22'; ctx.beginPath(); ctx.moveTo(x + 8, y + T); ctx.lineTo(x + 10, y + T + 6); ctx.stroke(); }
          } else {
            ctx.fillStyle = m.solid; ctx.fillRect(x, y, T, T);
            ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x, y + T - 3, T, 3);
            ctx.fillStyle = 'rgba(255,255,255,0.06)'; for (let i = 0; i < 3; i++) ctx.fillRect(x, y + 4 + i * 10, T, 1);
            if (top) { ctx.fillStyle = '#6b4a2a'; ctx.fillRect(x, y, T, 4); }
          }
        } else if (c === 'p') {
          // Cracked purple speakers.
          ctx.fillStyle = '#3a1d5c'; ctx.fillRect(x, y, T, T);
          ctx.strokeStyle = '#1a0a2c'; ctx.strokeRect(x + 0.5, y + 0.5, T - 1, T - 1);
        } else if (c === 'h') {
          ctx.fillStyle = '#2e5a1e';
          ctx.beginPath(); ctx.arc(x + 16, y + 18, 18, 0, TAU); ctx.fill();
          ctx.fillStyle = '#3f7a28';
          ctx.beginPath(); ctx.arc(x + 10, y + 12, 9, 0, TAU); ctx.arc(x + 22, y + 10, 8, 0, TAU); ctx.fill();
        } else if (c === 'b') {
          ctx.fillStyle = '#b07a3a'; ctx.fillRect(x + 1, y + 1, T - 2, T - 2);
          ctx.strokeStyle = '#6b4520'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, T - 2, T - 2);
          ctx.fillStyle = '#d9b070'; ctx.fillRect(x + 12, y + 1, 8, T - 2);
          ctx.lineWidth = 1;
        } else if (c === 'X') {
          ctx.fillStyle = '#24132f'; ctx.fillRect(x, y, T, T);
          ctx.fillStyle = 'rgba(185,140,255,0.18)'; ctx.fillRect(x + 4, y + 4, T - 8, T - 8);
          if (at(tx, ty - 1) !== 'X') { ctx.fillStyle = '#6a4a9a'; ctx.fillRect(x, y, T, 4); }
        } else if (c === '=') {
          const col = m.id === 'castle' ? '#101012' : m.id === 'dm' ? '#5a4a3a' : '#8e95a2';
          ctx.fillStyle = col; ctx.fillRect(x, y, T, 8);
          ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x, y + 8, T, 2);
          if (m.id !== 'castle') { ctx.fillStyle = 'rgba(0,0,0,0.4)'; for (let i = 2; i < T; i += 6) ctx.fillRect(x + i, y + 2, 2, 4); }
        } else if (c === 'H') {
          ctx.fillStyle = m.id === 'castle' ? '#5a3a1a' : '#9aa1ab';
          ctx.fillRect(x + 6, y, 4, T); ctx.fillRect(x + T - 10, y, 4, T);
          for (let i = 4; i < T; i += 10) ctx.fillRect(x + 6, y + i, T - 12, 3);
        } else if (c === 'g') {
          ctx.fillStyle = 'rgba(200,230,255,0.5)';
          for (let i = 0; i < 4; i++) { const gx = x + rnd() * 28, gy = y + 24 + rnd() * 8; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + 6, gy + 2); ctx.lineTo(gx + 2, gy - 5); ctx.fill(); }
        } else if (c === 'k') {
          ctx.strokeStyle = '#555b66'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(x + 16, y - 4); ctx.lineTo(x + 16, y + 34); ctx.stroke();
          ctx.beginPath(); ctx.arc(x + 12, y + 36, 6, -0.5, Math.PI); ctx.stroke();
          ctx.lineWidth = 1;
        } else if (c === 'w') {
          ctx.fillStyle = '#3a2a0a'; ctx.fillRect(x - 6, y - 14, T + 12, T + 28);
          const wg = ctx.createLinearGradient(x, y - 10, x, y + T + 10);
          wg.addColorStop(0, '#ffe08a'); wg.addColorStop(1, '#d48a10');
          ctx.fillStyle = wg;
          ctx.beginPath(); ctx.moveTo(x - 2, y + T + 10); ctx.lineTo(x - 2, y); ctx.arc(x + 16, y, 18, Math.PI, 0); ctx.lineTo(x + 34, y + T + 10); ctx.fill();
          ctx.fillStyle = '#3a2a0a'; ctx.fillRect(x + 14, y - 16, 3, T + 26); ctx.fillRect(x - 2, y + 10, T + 4, 3);
        } else if (c === 'r') {
          ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(x, y + 8); ctx.quadraticCurveTo(x + 16, y + 20 + rnd() * 10, x + T, y + 8); ctx.stroke();
          ctx.lineWidth = 1;
        }
      }
      // Speaker cones over the speaker blocks (D.M.).
      if (m.id === 'dm') {
        for (const sx of [4, 67]) for (const sy of [13, 20]) {
          const cx = sx * T, cy = sy * T;
          ctx.fillStyle = '#1a0a2c'; ctx.beginPath(); ctx.arc(cx, cy, 70, 0, TAU); ctx.fill();
          ctx.fillStyle = '#5a2d8c'; ctx.beginPath(); ctx.arc(cx, cy, 58, 0, TAU); ctx.fill();
          ctx.fillStyle = '#24113a'; ctx.beginPath(); ctx.arc(cx, cy, 22, 0, TAU); ctx.fill();
          ctx.strokeStyle = '#0a0410'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(cx - 40, cy - 50); ctx.lineTo(cx - 10, cy - 10); ctx.lineTo(cx - 25, cy + 30); ctx.stroke();
          ctx.lineWidth = 1;
        }
      }
      // Castle carpet along the left wall.
      if (m.id === 'castle') { ctx.fillStyle = '#8b0f1a'; ctx.fillRect(T, 14 * T, 8, 15 * T); ctx.fillStyle = '#d4a017'; ctx.fillRect(T + 8, 14 * T, 2, 15 * T); }
      world._layer = cv;
      return cv;
    },

    drawDynamicTiles(ctx, g) {
      const t = g.time;
      // Window light shafts in the castle.
      if (g.mapDef.id === 'castle') {
        for (let ty = 0; ty < g.world.h; ty++) for (let tx = 0; tx < g.world.w; tx++) {
          if (g.world.at(tx, ty) !== 'w') continue;
          const x = tx * T + 16, y = ty * T + 10;
          const sg = ctx.createLinearGradient(x, y, x + 60, y + 260);
          sg.addColorStop(0, 'rgba(255,210,100,0.22)'); sg.addColorStop(1, 'rgba(255,210,100,0)');
          ctx.fillStyle = sg;
          ctx.beginPath(); ctx.moveTo(x - 16, y); ctx.lineTo(x + 16, y); ctx.lineTo(x + 120, y + 260); ctx.lineTo(x + 40, y + 260); ctx.fill();
        }
      }
      // Easter eggs.
      for (const egg of g.world.eggs) {
        if (egg.found) continue;
        this.drawEgg(ctx, egg.kind, egg.x, egg.y, t);
      }
      // Ink traps (BURGERS): survivors only see them up close.
      const viewer = g.spectate || g.player;
      for (const tr of g.traps) {
        const near = viewer.team === 'killer' || Math.abs(viewer.x - tr.x) < 160;
        ctx.globalAlpha = near ? 0.9 : 0.25;
        ctx.fillStyle = '#0a0a0a';
        ctx.beginPath(); ctx.ellipse(tr.x, tr.y - 2, 22, 5, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ff1a3a';
        ctx.font = 'bold 7px monospace'; ctx.textAlign = 'center';
        ctx.fillText('0101', tr.x, tr.y - 1);
        ctx.globalAlpha = 1;
      }
    },
    drawEgg(ctx, kind, x, y, t) {
      const b = Math.sin(t * 3) * 2;
      ctx.save();
      ctx.translate(x, y - 12 + b);
      ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 8 + Math.sin(t * 4) * 4;
      switch (kind) {
        case 'C': ctx.fillStyle = '#c2183a'; ctx.fillRect(-5, -9, 10, 16); ctx.fillStyle = '#ddd'; ctx.fillRect(-5, -10, 10, 2); break;
        case 'P': ctx.fillStyle = '#2fa84a'; ctx.fillRect(-4, -12, 8, 20); ctx.fillStyle = '#1a6a2a'; ctx.fillRect(-2, -15, 4, 4); ctx.fillStyle = '#ffe14d'; ctx.fillRect(-4, -4, 8, 4); break;
        case 'B': ctx.fillStyle = '#8a3a1a'; ctx.fillRect(-9, -7, 18, 13); ctx.fillStyle = '#f2ead7'; ctx.fillRect(-7, -5, 14, 2); break;
        case 'L': ctx.fillStyle = '#5a4630'; ctx.fillRect(-12, -26, 24, 34); ctx.fillStyle = '#c9a24a'; ctx.beginPath(); ctx.arc(7, -8, 2, 0, TAU); ctx.fill(); break;
        case 'U': ctx.fillStyle = '#f2ead7'; ctx.fillRect(-9, -6, 18, 12); ctx.strokeStyle = '#8a7a5a'; ctx.beginPath(); ctx.moveTo(-9, -6); ctx.lineTo(0, 1); ctx.lineTo(9, -6); ctx.stroke(); break;
        case 'Y': ctx.fillStyle = '#3d8bff'; ctx.fillRect(-7, -9, 14, 18); ctx.fillStyle = '#fff'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'; ctx.fillText('?', 0, 4); break;
        case 'M': ctx.fillStyle = '#5a3a1a'; ctx.fillRect(-16, -30, 32, 40); ctx.fillStyle = '#4c97ff'; ctx.fillRect(-12, -26, 24, 32); ctx.fillStyle = '#ddd'; ctx.fillRect(-3, -24, 6, 28); break;
      }
      ctx.restore();
    },

    // ----------------------------------------------------------- telegraphs
    drawTelegraphs(ctx, g) {
      const k = g.killer;
      const c = k.cast;
      if (c && !k.dead) {
        const f = U.clamp(c.t / Math.max(0.01, c.windup), 0, 1);
        const cy = k.y - k.h / 2;
        ctx.save();
        ctx.globalAlpha = 0.18 + f * 0.3;
        ctx.fillStyle = '#ff2a3a';
        if (c.id === 'rev_slinger') ctx.fillRect(k.facing > 0 ? k.x : 0, cy - 46, k.facing > 0 ? g.world.pw : k.x, 92);
        else if (c.id === 'sc_dash' || c.id === 'p2_dash' || c.id === 'creak_reveal') ctx.fillRect(k.facing > 0 ? k.x : k.x - 280, cy - 22, 280, 44);
        else if (c.id === 'sc_vision' || c.id === 'p2_hook') {
          ctx.strokeStyle = '#ff2a3a'; ctx.setLineDash([8, 6]); ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(k.x, cy); ctx.lineTo(k.aim.x, k.aim.y); ctx.stroke();
        }
        ctx.restore();
      }
      // Active hitboxes (Forsaken-style red bubbles).
      for (const hb of g.hitboxes) {
        if (!hb.active) continue;
        ctx.fillStyle = 'rgba(255,40,60,0.28)';
        ctx.strokeStyle = 'rgba(255,40,60,0.7)';
        ctx.beginPath(); ctx.arc(hb.x, hb.y, hb.r, 0, TAU); ctx.fill(); ctx.stroke();
      }
    },

    // ------------------------------------------------------------- entities
    drawEntities(ctx, g, focus) {
      const t = g.time;
      // Corpses fade.
      for (const s of g.survivors) {
        if (!s.dead) continue;
        const a = Math.max(0, 1 - (t - s.deathT) / 4);
        if (a <= 0) continue;
        ctx.globalAlpha = a * 0.6;
        this.drawPose(ctx, this.pose(s.def.id, 'idle', 0), s.x, s.y, s.facing, { rot: Math.PI / 2 * s.facing, pivot: 10, filter: 'grayscale(1) brightness(0.6)' });
        ctx.globalAlpha = 1;
      }
      for (const e of g.ents) {
        if (e.minion) { this.drawMinion(ctx, e, t); continue; }
        if (e.dead) continue;
        if (e.clone) { this.drawPose(ctx, this.pose(e.skin, 'idle', e.anim.t), e.x, e.y + Math.abs(Math.sin(e.anim.t * 12)) * (Math.abs(e.vx) > 20 ? -2 : 0), e.facing); this.nameTag(ctx, e, e.name, '#e8e8e8', e.fakeHp); continue; }
        this.drawEntity(ctx, g, e, focus);
      }
    },
    drawEntity(ctx, g, e, focus) {
      const t = g.time;
      let opts = {};
      const a = e.action;
      if (a && a.type === 'roll') opts = { rot: a.t * 14 * e.facing, pivot: 22 };
      if (a && a.type === 'slam') opts = { rot: 0.35 * e.facing, pivot: 10 };
      if (a && a.type === 'thrown') opts = { rot: a.t * 10 * Math.sign(a.vx || 1), pivot: 22 };
      if (Ent.has(e, 'dying')) opts = { rot: Math.sin(t * 30) * 0.15, pivot: 20, filter: 'sepia(1) hue-rotate(-40deg) saturate(3)' };
      if (e.flash > 0) opts.filter = 'brightness(2.5)';
      let alpha = 1;
      if (Ent.has(e, 'invuln') && e.team === 'survivor') alpha = 0.55 + 0.35 * Math.sin(t * 30);
      ctx.save();
      // Auras.
      if (Ent.has(e, 'hot')) { ctx.strokeStyle = `rgba(255,120,30,${0.5 + 0.3 * Math.sin(t * 10)})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(e.x, e.y - e.h / 2, 40, 54, 0, 0, TAU); ctx.stroke(); }
      if (e.def.id === 'protocol2' && e.hp < 200 && !e.dead) { ctx.fillStyle = `rgba(255,30,20,${0.18 + 0.1 * Math.sin(t * 12)})`; ctx.beginPath(); ctx.ellipse(e.x, e.y - e.h / 2, 44, 58, 0, 0, TAU); ctx.fill(); }
      if (Ent.has(e, 'exposed')) { ctx.strokeStyle = 'rgba(255,60,60,0.7)'; ctx.lineWidth = 3; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.ellipse(e.x, e.y - e.h / 2, 36, 52, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
      if (Ent.has(e, 'distorted')) { ctx.fillStyle = `rgba(150,120,200,${0.25 + 0.1 * Math.sin(t * 20)})`; ctx.beginPath(); ctx.arc(e.x + Math.sin(t * 23) * 3, e.y - e.h / 2, 30, 0, TAU); ctx.fill(); }
      const dfl = Ent.get(e, 'deflect');
      if (dfl) {
        const open = dfl.max - dfl.t <= 0.7;
        ctx.strokeStyle = open ? 'rgba(217,194,122,0.95)' : 'rgba(217,194,122,0.35)';
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(e.x, e.y - e.h / 2, 34, -1.1 + (e.facing < 0 ? Math.PI : 0), 1.1 + (e.facing < 0 ? Math.PI : 0)); ctx.stroke();
      }
      ctx.globalAlpha = alpha;
      // THE CREAKER in disguise: survivors see the survivor; the hacker sees a ghost of it.
      let defId = e.def.id, anim = e.anim.name, at = e.anim.t;
      if (e.disguise) {
        defId = e.disguise;
        if (focus.team === 'killer') opts.filter = 'drop-shadow(0 0 4px #b98cff) saturate(0.7)';
      }
      if (e.team === 'survivor' && Math.abs(e.vx) > 20 && e.grounded && !a) opts.bob = true;
      const bobY = opts.bob ? -Math.abs(Math.sin(t * 14)) * 3 : 0;
      this.drawPose(ctx, this.pose(defId, anim, at, e), e.x, e.y + bobY, e.facing, opts);
      ctx.restore();
      // Stun stars.
      if (Ent.stunned(e) && !Ent.has(e, 'rising') && !Ent.has(e, 'dying')) {
        for (let i = 0; i < 3; i++) {
          const ang = t * 6 + (i * TAU) / 3;
          this.star(ctx, e.x + Math.cos(ang) * 18, e.y - HEIGHT[e.def.id] - 4 + Math.sin(ang) * 4, 5, '#e6ff4a');
        }
      }
      // Milestone corruption glow on hackers.
      if (e.team === 'killer') {
        const ms = G.Badges.milestone(e.def.id);
        if (ms) { ctx.fillStyle = `rgba(255,20,50,${0.05 * ms + 0.04 * Math.sin(t * 6)})`; ctx.beginPath(); ctx.ellipse(e.x, e.y - e.h / 2, 46, 60, 0, 0, TAU); ctx.fill(); }
      }
      // Name tag + HP.
      if (e.team === 'survivor') this.nameTag(ctx, e, e.name + (e.armor > 0 ? ` ⛨${Math.round(e.armor)}` : ''), e.isPlayer ? '#ffffff' : '#d8d8d8', e.hp / e.maxHp, HEIGHT[e.def.id]);
      else if (e.disguise && focus.team === 'survivor') this.nameTag(ctx, e, e.name, '#d8d8d8', e.fakeHp, HEIGHT[e.disguise]);
      else if (e.disguise) this.nameTag(ctx, e, 'THE CREAKER (disguised as ' + e.name + ')', '#b98cff', e.hp / e.maxHp, HEIGHT[e.disguise]);
      else this.nameTag(ctx, e, e.name, '#ff8080', e.hp / e.maxHp, HEIGHT[e.def.id], true);
    },
    nameTag(ctx, e, name, color, frac, height = 76, hacker) {
      const top = e.y - height - 8;
      ctx.font = `bold 11px ${F}`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(name, e.x, top - 6);
      ctx.fillStyle = color;
      ctx.fillText(name, e.x, top - 6);
      const w = hacker ? 50 : 36;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(e.x - w / 2 - 1, top - 1, w + 2, 6);
      ctx.fillStyle = hacker ? '#ff4b5c' : frac > 0.6 ? '#5dd36a' : frac > 0.3 ? '#ffc23f' : '#ff4040';
      ctx.fillRect(e.x - w / 2, top, w * U.clamp(frac, 0, 1), 4);
    },
    drawMinion(ctx, m, t) {
      if (m.dead) return;
      const hop = m.vy < -10 ? 0.15 : 0;
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.fillStyle = '#1a0a14';
      ctx.beginPath(); ctx.ellipse(0, -11, 12, 11 + hop * 10, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ff8a3a';
      ctx.beginPath(); ctx.arc(-4 * Math.sign(m.vx || 1) + 2, -14, 2.5, 0, TAU); ctx.arc(4 * Math.sign(m.vx || 1) + 2, -14, 2.5, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#c9c9c9'; ctx.lineWidth = 1.5;
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * 4, -22); ctx.lineTo(i * 5, -29); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(-8, 2, 16 * (m.dur / 5), 2);
      ctx.restore();
    },

    // ----------------------------------------------------- projectiles / fx
    drawProjectiles(ctx, g) {
      const t = g.time;
      for (const p of g.projectiles) {
        if (p.kind === 'vision') {
          const gr = ctx.createRadialGradient(p.x, p.y, p.r * 0.2, p.x, p.y, p.r);
          gr.addColorStop(0, 'rgba(40,30,60,0.0)'); gr.addColorStop(0.7, 'rgba(160,150,190,0.35)'); gr.addColorStop(1, 'rgba(230,230,255,0.7)');
          ctx.fillStyle = gr;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.5)';
          for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.4 + i * 0.2) + Math.sin(t * 10 + i) * 3, 0, TAU); ctx.stroke(); }
        } else if (p.kind === 'hook') {
          ctx.strokeStyle = '#8e9094'; ctx.lineWidth = 3; ctx.setLineDash([6, 4]);
          ctx.beginPath(); ctx.moveTo(p.owner.x, p.owner.y - p.owner.h / 2); ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.setLineDash([]);
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.vy, p.vx));
          ctx.strokeStyle = '#d0d4da'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(0, 4, 8, -Math.PI / 2, Math.PI * 0.8); ctx.stroke();
          ctx.restore();
          ctx.lineWidth = 1;
          ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
          if (p.bounces) ctx.fillText('×' + p.bounces, p.x, p.y - 14);
        } else if (p.kind === 'slinger') {
          const pose = this.pose('revengest', 'proj', 0);
          if (pose) {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(Math.sign(p.vx) * Math.PI / 2);
            const s = 120 / pose.sh;
            ctx.globalAlpha = 0.9;
            ctx.drawImage(pose.img, pose.sx, pose.sy, pose.sw, pose.sh, -pose.sw * s / 2, -pose.sh * s / 2, pose.sw * s, pose.sh * s);
            ctx.restore();
          }
          ctx.fillStyle = 'rgba(255,40,60,0.18)';
          for (const b of p.boxes) { ctx.beginPath(); ctx.arc(p.x + Math.sign(p.vx) * b.dx, p.y + b.dy, p.r, 0, TAU); ctx.fill(); }
        } else if (p.kind === 'grabber') {
          ctx.globalAlpha = 0.75;
          this.drawPose(ctx, this.pose(p.skin, 'idle', 0), p.x, p.y + 30, p.vx >= 0 ? 1 : -1, { filter: 'hue-rotate(220deg) brightness(0.7)' });
          ctx.globalAlpha = 1;
        }
      }
    },
    drawFx(ctx, g) {
      for (const p of g.particles) {
        const f = p.t / p.dur;
        ctx.globalAlpha = 1 - f;
        ctx.fillStyle = p.color;
        if (p.shape === 'code') { ctx.font = 'bold 9px monospace'; ctx.fillText(Math.random() < 0.5 ? '0' : '1', p.x, p.y); }
        else ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.globalAlpha = 1;
      for (const f of g.fx) {
        const k = f.t / f.dur;
        ctx.globalAlpha = 1 - k;
        if (f.type === 'ring') {
          ctx.strokeStyle = f.color; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.arc(f.x, f.y, U.lerp(f.r0, f.r1, Math.sqrt(k)), 0, TAU); ctx.stroke();
        } else if (f.type === 'spike') {
          const pose = this.pose('burgers', 'spike', f.t);
          if (pose) this.drawPose(ctx, pose, f.x, f.y, 1, { scale: 0.7 });
        }
      }
      ctx.globalAlpha = 1;
      // Castle break-in dust.
      if (g.breakIn && !g.breakIn.done) {
        const b = g.breakIn;
        ctx.fillStyle = `rgba(200,180,120,${0.3 + 0.3 * Math.sin(g.time * 30)})`;
        ctx.fillRect(b.x - 60, b.y - 4, 120, 8);
      }
      // Dropped DESTROY block (Final Round).
      if (g.finale && g.finale.block && g.finale.phase === 'down') {
        const b = g.finale.block;
        ctx.save();
        ctx.translate(b.x, b.y - 12);
        ctx.shadowColor = '#ff1a3a'; ctx.shadowBlur = 14 + Math.sin(g.time * 4) * 6;
        this.block(ctx, 22);
        ctx.restore();
      }
    },
    block(ctx, s) {
      ctx.fillStyle = '#7e93a8'; ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(-s / 2, -s / 2, s, s * 0.22);
      ctx.strokeStyle = '#3e4a58'; ctx.lineWidth = Math.max(1, s / 14); ctx.strokeRect(-s / 2, -s / 2, s, s);
      ctx.fillStyle = '#2a2a2a'; ctx.font = `bold ${Math.max(4, s * 0.2)}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('DESTROY', 0, 1);
      ctx.textBaseline = 'alphabetic';
    },
    star(ctx, x, y, r, col) {
      ctx.fillStyle = col;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      ctx.closePath(); ctx.fill();
    },

    // ---------------------------------------------------------- screen fx
    drawScreenFx(ctx, g, W, H, focus) {
      const k = g.killer;
      const t = g.time;
      if (focus.team === 'survivor' && !focus.dead && !k.dead && !k.disguise) {
        const d = Math.hypot(focus.x - k.x, focus.y - k.y);
        if (d < G.CONFIG.terror) {
          const f = 1 - d / G.CONFIG.terror;
          const pulse = 0.6 + 0.4 * Math.sin(t * (4 + f * 8));
          const gr = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
          gr.addColorStop(0, 'rgba(120,0,0,0)');
          gr.addColorStop(1, `rgba(150,0,0,${0.45 * f * pulse})`);
          ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
        }
      }
      if (focus.isPlayer && Ent.has(focus, 'distorted')) {
        // DISTORTED VISION: the world warps and shrinks.
        const gr = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, Math.max(W, H) * 0.5);
        gr.addColorStop(0, 'rgba(20,10,30,0)'); gr.addColorStop(1, 'rgba(20,10,30,0.92)');
        ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = 'rgba(160,140,220,0.08)';
        for (let i = 0; i < 12; i++) ctx.fillRect(0, (t * 300 + i * 70) % H, W, 6);
      }
      if (g.lms && !g.over) {
        ctx.strokeStyle = `rgba(255,30,40,${0.25 + 0.15 * Math.sin(t * 4)})`;
        ctx.lineWidth = 10; ctx.strokeRect(0, 0, W, H);
      }
    },

    // ------------------------------------------------------------------ HUD
    panel(ctx, x, y, w, h) {
      ctx.fillStyle = 'rgba(12,8,18,0.78)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(255,171,25,0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    },
    drawHUD(ctx, g, W, H, focus) {
      const p = g.player;
      const k = g.killer;
      // Timer.
      ctx.textAlign = 'center';
      this.panel(ctx, W / 2 - 120, 10, 240, 78);
      if (g.finale) {
        ctx.fillStyle = '#ffd23f'; ctx.font = `bold 26px ${F}`; ctx.fillText('ROUND 500', W / 2, 44);
      } else {
        ctx.fillStyle = g.lms ? '#ff4b4b' : g.overtime ? '#ffd23f' : '#ffffff';
        ctx.font = `bold 30px ${F}`;
        ctx.fillText(g.phase === 'intro' ? 'GET READY' : U.fmtTime(g.timer), W / 2, 44);
      }
      ctx.font = `bold 10px ${F}`;
      ctx.fillStyle = '#b8b0c8';
      ctx.fillText(g.finale ? 'THE LAST ONE' : g.lms ? 'LAST MAN STANDING' : g.overtime ? 'OVERTIME' : g.player.team === 'killer' ? 'DELETE THEM ALL' : 'SURVIVE THE ROUND', W / 2, 58);
      // Hacker HP.
      ctx.fillStyle = '#222'; ctx.fillRect(W / 2 - 100, 66, 200, 10);
      ctx.fillStyle = k.def.id === 'protocol2' && k.hp < 200 ? '#ff3b1a' : '#ff4b5c';
      ctx.fillRect(W / 2 - 100, 66, 200 * U.clamp(k.hp / k.maxHp, 0, 1), 10);
      ctx.font = `bold 9px ${F}`; ctx.fillStyle = '#fff';
      ctx.fillText(`${k.def.name}  ${Math.max(0, Math.round(k.hp))} HP`, W / 2, 75);

      // Survivors.
      ctx.textAlign = 'left';
      this.panel(ctx, 10, 10, 220, 24 + g.survivors.length * 34);
      ctx.font = `bold 11px ${F}`; ctx.fillStyle = '#b8b0c8';
      ctx.fillText('SURVIVORS', 20, 27);
      g.survivors.forEach((s, i) => {
        const y = 36 + i * 34;
        const pz = this.pose(s.def.id, 'idle', 0);
        if (pz) {
          ctx.save(); ctx.beginPath(); ctx.rect(16, y, 28, 28); ctx.clip();
          ctx.globalAlpha = s.dead ? 0.35 : 1;
          ctx.drawImage(pz.img, 0, 0, pz.sw, pz.sh * 0.45, 16, y, 28, 28 * (pz.sh * 0.45) / pz.sw);
          ctx.restore(); ctx.globalAlpha = 1;
        }
        ctx.font = (s.isPlayer ? 'bold ' : '') + `12px ${F}`;
        ctx.fillStyle = s.dead ? '#777' : '#eee';
        ctx.fillText(s.name + (s.isPlayer ? ' (you)' : ''), 50, y + 11);
        if (s.dead) { ctx.fillStyle = '#ff4040'; ctx.fillText('DELETED', 160, y + 11); }
        else {
          ctx.fillStyle = '#222'; ctx.fillRect(50, y + 16, 168, 6);
          const f = s.hp / s.maxHp;
          ctx.fillStyle = Ent.has(s, 'dying') ? '#ff4040' : f > 0.6 ? '#5dd36a' : f > 0.3 ? '#ffc23f' : '#ff4040';
          ctx.fillRect(50, y + 16, 168 * U.clamp(f, 0, 1), 6);
          if (s.armor > 0) { ctx.fillStyle = '#c9d6e8'; ctx.fillRect(50, y + 23, Math.min(168, s.armor * 1.68), 3); }
        }
      });

      // Feed.
      ctx.textAlign = 'right';
      g.feedList.forEach((f, i) => {
        ctx.globalAlpha = Math.min(1, f.t);
        ctx.font = `13px ${F}`;
        const tw = ctx.measureText(f.s).width;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(W - tw - 26, 12 + i * 24, tw + 16, 20);
        ctx.fillStyle = f.color;
        ctx.fillText(f.s, W - 18, 27 + i * 24);
      });
      ctx.globalAlpha = 1;

      // Banner.
      if (g.banner) {
        const b = g.banner;
        ctx.globalAlpha = Math.min(1, b.t * 2, (b.dur - b.t) * 4 + 0.2);
        ctx.textAlign = 'center';
        ctx.font = `900 38px ${F}`;
        ctx.lineWidth = 6; ctx.strokeStyle = '#000';
        ctx.strokeText(b.s, W / 2, H * 0.27);
        ctx.fillStyle = b.color; ctx.fillText(b.s, W / 2, H * 0.27);
        if (b.sub) {
          ctx.font = `italic 16px ${F}`;
          ctx.strokeText(b.sub, W / 2, H * 0.27 + 28);
          ctx.fillStyle = '#ddd'; ctx.fillText(b.sub, W / 2, H * 0.27 + 28);
        }
        ctx.globalAlpha = 1;
      }
      // Toast (easter eggs / badges).
      if (g.toast) {
        const tw = Math.min(460, W - 40);
        ctx.globalAlpha = Math.min(1, g.toast.t);
        this.panel(ctx, W / 2 - tw / 2, H * 0.36, tw, 58);
        ctx.textAlign = 'center';
        ctx.font = `bold 14px ${F}`; ctx.fillStyle = '#ffd23f';
        ctx.fillText('FOUND: ' + g.toast.title, W / 2, H * 0.36 + 22);
        ctx.font = `italic 12px ${F}`; ctx.fillStyle = '#ddd';
        ctx.fillText(g.toast.text.slice(0, 80), W / 2, H * 0.36 + 42);
        ctx.globalAlpha = 1;
      }

      if (p.dead) {
        ctx.textAlign = 'center';
        ctx.font = `bold 16px ${F}`; ctx.fillStyle = '#ff8080';
        ctx.fillText(`SPECTATING ${focus.name.toUpperCase()}   [Tab] next`, W / 2, H - 30);
      } else {
        this.drawAbilityBar(ctx, g, p, W, H);
        this.drawStamina(ctx, g, p, W, H);
        this.drawPrompt(ctx, g, p, W, H);
      }
      this.drawMinimap(ctx, g, focus, W, H);
    },

    drawAbilityBar(ctx, g, p, W, H) {
      const slots = p.team === 'killer' ? ['M1', 'Q', 'E', 'R'].filter((s) => Ent.ability(p, s)) : ['Q', 'E'].filter((s) => Ent.ability(p, s));
      const S = 60, gap = 20;
      const total = (slots.length + 1) * (S + gap) - gap;
      let x = W / 2 - total / 2;
      const y = H - S - 32;
      for (const slot of slots) {
        const ab = Ent.ability(p, slot);
        this.panel(ctx, x, y, S, S);
        const casting = p.cast && p.cast.slot === slot;
        ctx.fillStyle = casting ? 'rgba(255,80,80,0.35)' : 'rgba(255,171,25,0.15)';
        ctx.fillRect(x + 2, y + 2, S - 4, S - 4);
        let label = ab.name;
        let ready = p.cds[slot] <= 0;
        if (p.def.id === 'sc' && slot === 'Q' && p.chainT > 0) { label = 'CHAIN!'; ready = true; ctx.fillStyle = 'rgba(255,171,25,0.6)'; ctx.fillRect(x + 2, y + 2, S - 4, S - 4); }
        if (p.def.id === 'nano' && slot === 'E') { ready = Ent.has(p, 'parried'); if (ready) { ctx.fillStyle = 'rgba(217,194,122,0.7)'; ctx.fillRect(x + 2, y + 2, S - 4, S - 4); } }
        if (p.def.id === 'burgers' && slot === 'Q') ready = p.ink >= 100 && p.cds.Q <= 0;
        if (p.def.id === 'creaker' && slot === 'R') ready = !!p.disguise;
        if (p.def.id === 'creaker' && slot === 'E') label = p.disguise ? 'CONSTRUCT' : 'FACE THY SELF';
        if (p.def.id === 'creaker' && slot === 'Q' && p.disguise) label = 'UNDISGUISE';
        ctx.textAlign = 'center';
        ctx.font = `900 13px ${F}`;
        ctx.fillStyle = ready ? '#fff' : '#777';
        const words = label.split(' ');
        const widest = Math.max(...words.map((w2) => ctx.measureText(w2).width));
        if (widest > S - 6) ctx.font = `900 ${Math.max(8, Math.floor(13 * (S - 6) / widest))}px ${F}`;
        words.forEach((w2, i) => ctx.fillText(w2, x + S / 2, y + S / 2 - (words.length - 1) * 7 + i * 14 + 4));
        const cd = p.cds[slot];
        if (cd > 0) {
          const f = Math.min(1, cd / Math.max(0.1, ab.cd));
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.fillRect(x, y + S * (1 - f), S, S * f);
          ctx.font = `bold 18px ${F}`; ctx.fillStyle = '#fff';
          if (cd > 0.3) ctx.fillText(cd >= 1 ? Math.ceil(cd) : cd.toFixed(1), x + S / 2, y + S / 2 + 6);
        }
        if (casting) { ctx.fillStyle = '#ff5050'; ctx.fillRect(x, y + S - 4, S * U.clamp(p.cast.t / Math.max(0.01, p.cast.windup), 0, 1), 4); }
        ctx.font = `bold 12px ${F}`; ctx.textAlign = 'left'; ctx.fillStyle = '#ffd23f';
        ctx.fillText(slot === 'M1' ? 'LMB' : slot === 'R' && p.def.id === 'creaker' ? 'R/N' : slot, x + 4, y + 13);
        x += S + gap;
      }
      // Passive box with live state.
      this.panel(ctx, x, y, S, S);
      ctx.textAlign = 'center';
      let big = '★', small = 'PASSIVE';
      if (p.def.id === 'burgers') { big = Math.floor(p.ink) + '%'; small = 'INK'; ctx.fillStyle = '#111'; ctx.fillRect(x + 4, y + S - 12, (S - 8) * p.ink / 100, 6); }
      if (p.def.id === 'nano') { big = Math.round(p.armor); small = 'ARMOR'; }
      if (p.def.id === 'protocol2') { big = p.hp < 200 ? 'RAGE' : 'KING'; small = p.hp < 200 ? 'MIDPOINT' : 'KINGLY'; }
      if (p.def.id === 'sc') { big = ['I', 'II', 'III', 'IV'][G.Badges.milestone('sc')]; small = 'MILESTONE'; }
      if (p.def.id === 'creaker') { big = p.disguise ? '?' : '!'; small = p.disguise ? 'DISGUISED' : 'SO TALL'; }
      if (p.def.id === 'griffpatch') { big = Math.floor(p.hp); small = 'CAP 115'; }
      if (p.def.id === 'scratchy') { big = '+'; small = 'BANDAGED'; }
      if (p.def.id === 'revengest') { big = '∞'; small = 'SCARF'; }
      ctx.font = `900 18px ${F}`; ctx.fillStyle = '#ffd23f';
      ctx.fillText(big, x + S / 2, y + S / 2 + 4);
      ctx.font = `bold 9px ${F}`; ctx.fillStyle = '#b8b0c8';
      ctx.fillText(small, x + S / 2, y + S - 16);
    },

    drawStamina(ctx, g, p, W, H) {
      const st = p.stamina / 100;
      const empty = p.stamina < 1;
      const flash = empty && Math.sin(g.time * 14) > 0;
      const col = empty ? (flash ? '#ff3b3b' : '#7a1a1a') : st < 0.25 ? '#ff9a3c' : p.sprinting ? '#7ad7ff' : '#4fb8e8';
      const bw = Math.min(320, W * 0.4), bh = 14;
      const x = W / 2 - bw / 2, y = H - 124;
      this.panel(ctx, x - 4, y - 4, bw + 8, bh + 8);
      ctx.fillStyle = '#1a1622'; ctx.fillRect(x, y, bw, bh);
      ctx.fillStyle = col; ctx.fillRect(x, y, bw * st, bh);
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x, y, bw * st, bh / 3);
      ctx.font = `bold 11px ${F}`; ctx.textAlign = 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = '#000';
      const label = empty ? 'OUT OF STAMINA' : `STAMINA ${Math.round(p.stamina)}${p.sprinting ? '  ▶▶' : ''}`;
      ctx.strokeText(label, W / 2, y + 11);
      ctx.fillStyle = '#fff'; ctx.fillText(label, W / 2, y + 11);
      // HP for survivors, right under the stamina.
      if (p.team === 'survivor') {
        ctx.fillStyle = '#222'; ctx.fillRect(x, y - 16, bw, 8);
        const f = p.hp / p.maxHp;
        ctx.fillStyle = f > 0.6 ? '#5dd36a' : f > 0.3 ? '#ffc23f' : '#ff4040';
        ctx.fillRect(x, y - 16, bw * U.clamp(f, 0, 1), 8);
        ctx.font = `bold 9px ${F}`; ctx.fillStyle = '#fff';
        ctx.fillText(`${Math.ceil(p.hp)} HP${p.armor ? ` + ${Math.round(p.armor)} ARMOR` : ''}`, W / 2, y - 9);
      }
    },

    drawPrompt(ctx, g, p, W, H) {
      let msg = null;
      if (g.finale) {
        const f = g.finale;
        if (f.phase === 'stopped' && Math.abs(p.x - g.killer.x) < 90) msg = 'Press [F] to hit SC into the ground';
        else if (f.phase === 'down' && f.block && Math.abs(p.x - f.block.x) < 60) msg = 'Press [F] to CRUSH the DESTROY block';
      } else {
        const egg = g.world.eggs.find((e) => !e.found && Math.abs(e.x - p.x) < 40 && Math.abs(e.y - p.y) < 50);
        if (egg) msg = 'Press [F] to inspect';
      }
      if (!msg) return;
      ctx.font = `bold 15px ${F}`; ctx.textAlign = 'center';
      const tw = ctx.measureText(msg).width;
      this.panel(ctx, W / 2 - tw / 2 - 12, H - 176, tw + 24, 28);
      ctx.fillStyle = '#ffe9b0'; ctx.fillText(msg, W / 2, H - 157);
    },

    drawMinimap(ctx, g, focus, W, H) {
      const w = g.world;
      const s = W < 900 ? 2 : 3;
      const mw = w.w * s, mh = w.h * s;
      const x = W - mw - 12, y = H - mh - 12;
      if (!w._mini || w._miniS !== s) {
        const cv = document.createElement('canvas');
        cv.width = mw; cv.height = mh;
        const c2 = cv.getContext('2d');
        for (let ty = 0; ty < w.h; ty++) for (let tx = 0; tx < w.w; tx++) {
          const c = w.at(tx, ty);
          c2.fillStyle = '#bhp#'.includes(c) && c !== '.' ? 'rgba(200,200,210,0.55)' : c === '=' ? 'rgba(255,200,120,0.5)' : c === 'H' ? 'rgba(160,200,255,0.5)' : c === 'X' ? 'rgba(185,140,255,0.4)' : 'rgba(0,0,0,0.3)';
          c2.fillRect(tx * s, ty * s, s, s);
        }
        w._mini = cv; w._miniS = s;
      }
      this.panel(ctx, x - 3, y - 3, mw + 6, mh + 6);
      ctx.drawImage(w._mini, x, y);
      const k = s / T;
      for (const e of g.ents) {
        if (e.dead || e.minion || e.clone) continue;
        if (e.team === 'killer' && focus.team === 'survivor' && !G.AI.sees(g, focus, e)) continue;
        ctx.fillStyle = e.team === 'killer' ? (e.disguise && focus.team === 'survivor' ? '#5dd36a' : '#ff3030') : e === focus ? '#ffffff' : '#5dd36a';
        ctx.beginPath(); ctx.arc(x + e.x * k, y + (e.y - e.h / 2) * k, e === focus ? 3 : 2.2, 0, TAU); ctx.fill();
      }
    },

    // ---------------------------------------------------------- portraits
    drawPortrait(canvas, defId, anim = 'idle') {
      const ctx = canvas.getContext('2d');
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      const p = this.pose(defId, anim, 0);
      if (!p || !p.img || !p.img.width) return;
      const s = Math.min((W * 0.9) / p.sw, (H * 0.92) / p.sh);
      ctx.drawImage(p.img, p.sx, p.sy, p.sw, p.sh, (W - p.sw * s) / 2, H - p.sh * s - H * 0.03, p.sw * s, p.sh * s);
    },
  });

  R.mulberry = function (a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
})();
