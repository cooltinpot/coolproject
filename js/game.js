// Round state, player control, projectiles, generators and the main loop.
(function () {
  const G = window.G;
  const U = G.U;
  const T = G.TILE;
  const Ent = G.Ent;

  class Game {
    constructor(cfg) {
      this.cfg = cfg;
      this.diff = G.DIFFICULTY[cfg.difficulty] || G.DIFFICULTY.normal;
      const mapId = cfg.mapId === 'random' ? U.choice(Object.keys(G.MAPS)) : cfg.mapId;
      this.world = new G.World(G.MAPS[mapId]);
      this.mapDef = G.MAPS[mapId];
      this.ents = [];
      this.projectiles = [];
      this.fx = [];
      this.particles = [];
      this.texts = [];
      this.feedList = [];
      this.mines = [];
      this.banner = null;
      this.time = 0;
      this.timer = G.CONFIG.roundTime;
      this.over = false;
      this.paused = false;
      this.shakeAmt = 0;
      this.flashT = 0;
      this.heartT = 0;
      this.vw = window.innerWidth;
      this.vh = window.innerHeight;

      const killerId = cfg.role === 'killer' ? cfg.charId : cfg.opponent === 'random' || !cfg.opponent ? U.choice(Object.keys(G.KILLERS)) : cfg.opponent;
      const ks = this.world.spawnK;
      this.killer = Ent.create(killerId, ks.x, ks.y, cfg.role === 'killer');
      this.ents.push(this.killer);
      G.Ent.add(this.killer, 'rising', 5);
      const spawns = U.shuffle(this.world.spawnsS.slice());
      const ids = Object.keys(G.SURVIVORS);
      this.survivors = ids.map((id, i) => {
        const s = Ent.create(id, spawns[i % spawns.length].x, spawns[i % spawns.length].y, cfg.role === 'survivor' && id === cfg.charId);
        this.ents.push(s);
        return s;
      });
      this.player = this.ents.find((e) => e.isPlayer);
      this.spectate = this.player;
      this.cam = { x: this.player.x, y: this.player.y, zoom: 1 };
      this.announce(`${this.mapDef.name}`, '#fff', 2.5, `${this.killer.def.name}, ${this.killer.def.title}, hunts tonight`);
    }

    // ---------------------------------------------------------------- helpers
    get alive() { return this.survivors.filter((s) => !s.dead); }
    get visionRadius() {
      const bo = this.world.blackout;
      return bo && bo.on ? 170 : this.mapDef.vision;
    }
    canSee(obs, t) {
      if (t.dead || obs.dead) return false;
      if (obs.team === t.team) return true;
      if (obs.team === 'killer' && (Ent.has(t, 'revealed') || Ent.has(t, 'marked'))) return true;
      if (obs.team === 'survivor' && Ent.has(t, 'revealed')) return true;
      const d = U.dist(obs, t);
      if (d > this.visionRadius) return false;
      if (Ent.has(t, 'shade') && d > 90) return false;
      if (t.team === 'survivor' && this.world.atPx(t.x, t.y) === ',' && d > 110 && !t.sprinting) return false;
      return this.world.los(obs.x, obs.y, t.x, t.y);
    }
    nearPlayer(x, y, r) {
      const p = this.spectate || this.player;
      return p && Math.hypot(p.x - x, p.y - y) < r;
    }
    text(x, y, s, color) { this.texts.push({ x, y, s, color, t: 0, dur: 1.0 }); }
    burst(x, y, color, n) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, sp = U.rand(30, 180);
        this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, dur: U.rand(0.3, 0.8), color, size: U.rand(2, 4) });
      }
    }
    shake(n) { this.shakeAmt = Math.max(this.shakeAmt, n); }
    feed(s, color) { this.feedList.unshift({ s, color, t: 6 }); if (this.feedList.length > 5) this.feedList.pop(); }
    announce(s, color, dur = 2.2, sub = '') { this.banner = { s, color, t: dur, dur, sub }; }

    useVent(e) {
      if (e.team !== 'survivor' || e.ventCd > 0 || e.channel || e.cast) return false;
      const v = this.world.teleVents.find((v2) => U.dist(e, v2) < 42 && v2.pair);
      if (!v) return false;
      e.channel = { type: 'vent', vent: v, t: 0, dur: 0.6 };
      e.moveInput = { x: 0, y: 0 };
      return true;
    }

    onPlayerDeath() {
      this.announce('YOU DIED', '#ff3b3b', 3, this.alive.length ? 'Spectating your team. Press Tab to switch.' : '');
      const next = this.alive[0];
      if (next) this.spectate = next;
    }

    screenToWorld(sx, sy) {
      const c = this.cam;
      return { x: (sx - this.vw / 2) / c.zoom + c.x, y: (sy - this.vh / 2) / c.zoom + c.y };
    }

    // ---------------------------------------------------------------- player
    controlPlayer(dt) {
      const p = this.player;
      const I = G.Input;
      if (p.dead) {
        p.moveInput = { x: 0, y: 0 };
        if (I.pressed.tab || !this.spectate || this.spectate.dead) {
          const al = this.alive;
          if (al.length) this.spectate = al[(al.indexOf(this.spectate) + 1) % al.length];
        }
        return;
      }
      const k = I.keys;
      const mx = (k.d || k.arrowright ? 1 : 0) - (k.a || k.arrowleft ? 1 : 0);
      const my = (k.s || k.arrowdown ? 1 : 0) - (k.w || k.arrowup ? 1 : 0);
      p.moveInput = U.norm(mx, my);
      p.wantSprint = !!k.shift;
      p.aim = this.screenToWorld(I.mouse.x, I.mouse.y);
      if (p.team === 'killer') {
        if (I.mouse.down) Ent.tryCast(p, 'M1', this);
        for (const s of ['Q', 'E', 'R']) if (I.pressed[s.toLowerCase()]) Ent.tryCast(p, s, this);
      } else {
        for (const s of ['Q', 'E']) if (I.pressed[s.toLowerCase()]) Ent.tryCast(p, s, this);
        if (I.pressed.f && this.world.teleVents.length) this.useVent(p);
        p.wantRepair = !!k.f;
      }
    }

    // ---------------------------------------------------------------- update
    update(dt) {
      if (this.over || this.paused) return;
      this.time += dt;
      this.timer -= dt;
      this.world.update(dt, this);
      this.controlPlayer(dt);
      for (const e of this.ents) G.AI.update(e, this, dt);
      for (const e of this.ents) Ent.update(e, this, dt);
      this.separate();
      this.updateProjectiles(dt);
      this.updateMines(dt);
      this.updateGens(dt);
      this.updateFx(dt);
      this.updateAudio(dt);
      if (this.banner && (this.banner.t -= dt) <= 0) this.banner = null;
      for (const f of this.feedList) f.t -= dt;
      this.feedList = this.feedList.filter((f) => f.t > 0);
      if (this.flashT > 0) this.flashT -= dt;
      this.shakeAmt *= Math.pow(0.02, dt);

      if (!this.alive.length) this.end('killer');
      else if (this.timer <= 0) this.end('survivors');
    }

    separate() {
      const es = this.ents.filter((e) => !e.dead);
      for (let i = 0; i < es.length; i++) {
        for (let j = i + 1; j < es.length; j++) {
          const a = es[i], b = es[j];
          const d = U.dist(a, b), min = a.r + b.r;
          if (d >= min || d < 1e-4) continue;
          const push = (min - d) / 2;
          const nx = (b.x - a.x) / d, ny = (b.y - a.y) / d;
          // Gravemaul's Juggernaut shoves survivors aside.
          let wa = 1, wb = 1;
          if (a.def.id === 'gravemaul') { wa = 0.2; wb = 1.8; }
          if (b.def.id === 'gravemaul') { wa = 1.8; wb = 0.2; }
          if (a.team === b.team) { wa *= 0.5; wb *= 0.5; }
          a.x -= nx * push * wa; a.y -= ny * push * wa;
          b.x += nx * push * wb; b.y += ny * push * wb;
          this.world.collide(a);
          this.world.collide(b);
        }
      }
    }

    updateProjectiles(dt) {
      const w = this.world;
      for (const p of this.projectiles) {
        if (p.kind === 'flash') {
          p.t += dt;
          if (p.t < p.flight) {
            const f = p.t / p.flight;
            p.x = U.lerp(p.sx, p.tx, f);
            p.y = U.lerp(p.sy, p.ty, f);
            p.h = Math.sin(f * Math.PI) * 40;
          } else {
            p.x = p.tx; p.y = p.ty; p.h = 0;
            if (p.t >= p.flight + p.fuse) {
              p.dead = true;
              this.fx.push({ type: 'ring', x: p.x, y: p.y, r0: 10, r1: 115, t: 0, dur: 0.35, color: '#ffffff', fill: true });
              G.Audio.play('flash', this.nearPlayer(p.x, p.y, 700) ? 1 : 0.3);
              const k = this.killer;
              if (!k.dead && U.dist(k, p) < 115 + k.r && w.los(p.x, p.y, k.x, k.y)) {
                if (Ent.stun(this, k, 1.7, p.owner)) p.owner.stats.stuns++;
                if (k.isPlayer) this.flashT = 1.2;
              }
              const pl = this.spectate;
              if (pl && pl.team === 'survivor' && U.dist(pl, p) < 90) this.flashT = Math.max(this.flashT, 0.3);
            }
          }
          continue;
        }
        const step = Math.hypot(p.vx, p.vy) * dt;
        const n = Math.max(1, Math.ceil(step / 8));
        for (let i = 0; i < n && !p.dead; i++) {
          p.x += (p.vx * dt) / n;
          p.y += (p.vy * dt) / n;
          p.trav += step / n;
          const tx = Math.floor(p.x / T), ty = Math.floor(p.y / T);
          if (w.blocksSight(tx, ty) || w.hasBarricade(tx, ty) || p.trav > p.range) { p.dead = true; this.burst(p.x, p.y, p.color, 6); break; }
          for (const s of this.survivors) {
            if (s.dead || U.dist(s, p) > s.r + p.r) continue;
            p.dead = true;
            this.projectileHit(p, s);
            break;
          }
        }
      }
      this.projectiles = this.projectiles.filter((p) => !p.dead);
    }
    projectileHit(p, s) {
      const k = p.owner;
      if (Ent.has(s, 'invuln')) { this.text(s.x, s.y - 26, 'DODGED', '#fff'); return; }
      if (Ent.has(s, 'shield') && Math.abs(U.angDiff(s.facing, U.angTo(s, p))) < 1.2) {
        this.text(s.x, s.y - 26, 'BLOCKED', '#9fd0ff');
        G.Audio.play('block');
        return;
      }
      if (p.kind === 'tracer') {
        Ent.add(s, 'marked', 5);
        this.text(s.x, s.y - 28, 'MARKED', '#ffcc33');
        G.Audio.play('zap', 0.5);
        if (s.isPlayer) this.announce('You have been MARKED', '#ffcc33', 1.6);
      } else if (p.kind === 'hook') {
        Ent.damage(this, s, 15, k);
        if (s.dead) return;
        const d = U.dist(s, k);
        const pull = Math.min(170, Math.max(0, d - (k.r + s.r + 20)));
        const dir = U.norm(k.x - s.x, k.y - s.y);
        s.action = { type: 'pulled', t: 0, dur: 0.22, vx: (dir.x * pull) / 0.22, vy: (dir.y * pull) / 0.22 };
        s.channel = null;
        s.cast = null;
        Ent.add(s, 'slow', 1.2, { mult: 0.6 });
        this.fx.push({ type: 'beam', x: k.x, y: k.y, x2: s.x, y2: s.y, t: 0, dur: 0.3, color: '#b98cff' });
        this.text(s.x, s.y - 28, 'HOOKED', '#b98cff');
      }
    }

    updateMines(dt) {
      const k = this.killer;
      this.mines = this.mines.filter((m) => {
        m.arm -= dt;
        if (m.arm > 0 || k.dead || U.dist(m, k) > 24) return true;
        Ent.add(k, 'slow', 2.2, { mult: 0.5 });
        Ent.add(k, 'revealed', 4);
        this.burst(m.x, m.y, '#ff8c1a', 20);
        G.Audio.play('trap');
        this.text(k.x, k.y - 34, 'SNARED', '#ff8c1a');
        if (this.player.team === 'survivor') this.announce('Snare triggered: killer revealed!', '#ff8c1a', 1.8);
        else this.announce('You stepped on a SNARE MINE', '#ff8c1a', 1.5);
        m.owner.stats.stuns++;
        return false;
      });
    }

    updateGens(dt) {
      for (const g of this.world.gens) {
        if (g.done) continue;
        const reps = this.survivors.filter((s) => !s.dead && s.repairing === g);
        g.repairers = reps.length;
        if (!reps.length) continue;
        let rate = 0;
        reps.forEach((s, i) => (rate += (s.def.repairMult || 1) * (i === 0 ? 1 : 0.8)));
        g.progress += (rate * dt) / G.CONFIG.genTime;
        g.spark -= dt;
        if (g.spark <= 0) { g.spark = 0.25; this.particles.push({ x: g.x + U.rand(-12, 12), y: g.y - 10, vx: U.rand(-40, 40), vy: U.rand(-90, -40), t: 0, dur: 0.5, color: '#ffe14d', size: 2 }); }
        if (g.progress >= 1) {
          g.progress = 1;
          g.done = true;
          for (const s of reps) s.stats.gens++;
          this.timer = Math.max(8, this.timer - G.CONFIG.genTimeCut);
          const left = this.world.gens.filter((x) => !x.done).length;
          this.feed(`Generator restored (${this.world.gens.length - left}/${this.world.gens.length})`, '#ffe14d');
          this.announce(left ? 'GENERATOR RESTORED' : 'ALL GENERATORS RESTORED', '#ffe14d', 1.8, `-${G.CONFIG.genTimeCut}s until dawn`);
          G.Audio.play('gen');
          this.burst(g.x, g.y, '#ffe14d', 25);
        }
      }
    }

    updateFx(dt) {
      for (const f of this.fx) f.t += dt;
      this.fx = this.fx.filter((f) => f.t < f.dur);
      for (const p of this.particles) {
        p.t += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.92;
        p.vy *= 0.92;
      }
      this.particles = this.particles.filter((p) => p.t < p.dur);
      if (this.particles.length > 600) this.particles.splice(0, this.particles.length - 600);
      for (const t of this.texts) { t.t += dt; t.y -= 30 * dt; }
      this.texts = this.texts.filter((t) => t.t < t.dur);
      // Cosmetic emitters.
      for (const e of this.ents) {
        if (e.dead) continue;
        if (Ent.has(e, 'overdrive') && Math.random() < 0.8) this.particles.push({ x: e.x + U.rand(-6, 6), y: e.y + U.rand(-6, 6), vx: U.rand(-20, 20), vy: U.rand(-20, 20), t: 0, dur: 0.6, color: U.choice(['#ff7a1a', '#ffcc33', '#d8323c']), size: U.rand(3, 5) });
        if (e.def.id === 'mournveil' && Math.random() < 0.3 && !Ent.has(e, 'shade')) this.particles.push({ x: e.x + U.rand(-12, 12), y: e.y + U.rand(-12, 12), vx: U.rand(-10, 10), vy: U.rand(-25, -5), t: 0, dur: 1.1, color: '#7d5cc4', size: U.rand(3, 6), soft: true });
        if (e.def.id === 'vex' && e.sprinting && Math.random() < 0.5) this.particles.push({ x: e.x, y: e.y, vx: -e.vx * 0.2, vy: -e.vy * 0.2, t: 0, dur: 0.35, color: '#ffb347', size: 2 });
        if (e.def.id === 'juno' && Math.random() < 0.06) this.fx.push({ type: 'arc', x: e.x, y: e.y, t: 0, dur: 0.12, seed: Math.random() });
        if (e.hp < e.maxHp * 0.5 && e.team === 'survivor' && Math.random() < 0.08) this.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, t: 0, dur: 3, color: '#7a0d1a', size: 3, floor: true });
      }
    }

    updateAudio(dt) {
      const p = this.spectate;
      if (!p || p.team !== 'survivor' || p.dead) return;
      const k = this.killer;
      const d = U.dist(p, k);
      if (Ent.has(k, 'shade') || d > k.def.terror) return;
      this.heartT -= dt;
      if (this.heartT <= 0) {
        const f = d / k.def.terror;
        this.heartT = 0.35 + f * 0.9;
        G.Audio.play('heart', 1 - f * 0.6);
      }
    }

    end(winner) {
      if (this.over) return;
      this.over = true;
      this.winner = winner;
      G.Audio.play(winner === 'survivors' ? 'gen' : 'death');
      setTimeout(() => G.Menu.showResults(this), 1200);
    }
  }

  G.Game = Game;

  // ------------------------------------------------------------- main loop
  let last = 0;
  G.loop = function (ts) {
    const dt = Math.min(0.05, (ts - last) / 1000 || 0.016);
    last = ts;
    const g = G.game;
    if (g) {
      if (G.Input.pressed.escape && !g.over) G.Menu.togglePause();
      const scale = G.debugTimeScale || 1;
      for (let i = 0; i < scale; i++) g.update(dt);
      G.Render.frame(g);
    }
    G.Input.endFrame();
    requestAnimationFrame(G.loop);
  };
})();
