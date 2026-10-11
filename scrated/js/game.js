// Round state, player control, projectiles, zones, terminals, the Final Round
// and the main loop.
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
      this.zones = [];
      this.forks = [];
      this.fx = [];
      this.particles = [];
      this.texts = [];
      this.feedList = [];
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
      this.finale = cfg.mode === 'finale' ? { phase: 'fight', t: 0 } : null;

      const killerId = cfg.role === 'killer' ? cfg.charId : cfg.opponent === 'random' || !cfg.opponent ? U.choice(Object.keys(G.KILLERS)) : cfg.opponent;
      const ks = this.world.spawnK;
      this.killer = Ent.create(killerId, ks.x, ks.y, cfg.role === 'killer');
      this.ents.push(this.killer);
      Ent.add(this.killer, 'rising', this.finale ? 3 : 5);
      const spawns = U.shuffle(this.world.spawnsS.slice());
      this.survivors = Object.keys(G.SURVIVORS).map((id, i) => {
        const sp = spawns[i % spawns.length];
        const s = Ent.create(id, sp.x, sp.y, cfg.role === 'survivor' && id === cfg.charId);
        this.ents.push(s);
        return s;
      });
      this.player = this.ents.find((e) => e.isPlayer);
      this.spectate = this.player;
      this.cam = { x: this.player.x, y: this.player.y, zoom: 1 };
      if (this.finale) this.announce('ROUND 500', '#ffd23f', 4, 'Five hundred years passed.');
      else this.announce(this.mapDef.name, '#fff', 2.5, `${this.killer.def.name}, ${this.killer.def.title}, is hunting this round`);
    }

    // ---------------------------------------------------------------- helpers
    get alive() { return this.survivors.filter((s) => !s.dead); }
    targets() { return this.ents.filter((e) => e.team === 'survivor' && !e.dead); }
    get visionRadius() {
      const dim = this.world.dim;
      return dim && dim.on ? 160 : this.mapDef.vision;
    }
    canSee(obs, t) {
      if (t.dead || obs.dead) return false;
      if (obs.team === t.team) return true;
      if (Ent.has(t, 'revealed')) return true;
      const d = U.dist(obs, t);
      if (d > this.visionRadius) return false;
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
      this.announce('DELETED', '#ff3b3b', 3, this.alive.length ? 'Spectating your team. Press Tab to switch.' : '');
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
      let mx = (k.d || k.arrowright ? 1 : 0) - (k.a || k.arrowleft ? 1 : 0);
      let my = (k.s || k.arrowdown ? 1 : 0) - (k.w || k.arrowup ? 1 : 0);
      if (Ent.has(p, 'hacked')) { mx = -mx; my = -my; }
      p.moveInput = U.norm(mx, my);
      p.wantSprint = !!k.shift;
      p.aim = this.screenToWorld(I.mouse.x, I.mouse.y);
      if (p.team === 'killer') {
        if (I.mouse.down) Ent.tryCast(p, 'M1', this);
        for (const s of ['Q', 'E', 'R']) if (I.pressed[s.toLowerCase()]) Ent.tryCast(p, s, this);
      } else {
        for (const s of ['Q', 'E']) if (I.pressed[s.toLowerCase()]) Ent.tryCast(p, s, this);
        if (I.pressed.f) {
          if (this.finale) this.finaleInteract();
          else if (this.world.teleVents.length) this.useVent(p);
        }
        p.wantRepair = !!k.f;
      }
    }

    // ---------------------------------------------------------------- update
    update(dt) {
      if (this.over || this.paused) return;
      this.time += dt;
      if (!this.finale) this.timer -= dt;
      this.world.update(dt, this);
      this.controlPlayer(dt);
      for (const e of this.ents) G.AI.update(e, this, dt);
      for (const e of this.ents) Ent.update(e, this, dt);
      this.ents = this.ents.filter((e) => !e.gone);
      this.separate();
      this.updateZones(dt);
      this.updateProjectiles(dt);
      this.updateForks(dt);
      this.updateGens(dt);
      this.updateFx(dt);
      this.updateAudio(dt);
      if (this.finale) this.updateFinale(dt);
      if (this.banner && (this.banner.t -= dt) <= 0) this.banner = null;
      for (const f of this.feedList) f.t -= dt;
      this.feedList = this.feedList.filter((f) => f.t > 0);
      if (this.flashT > 0) this.flashT -= dt;
      this.shakeAmt *= Math.pow(0.02, dt);

      if (this.finale) return;
      if (!this.alive.length) this.end('killer');
      else if (this.timer <= 0) this.end('survivors');
    }

    separate() {
      const es = this.ents.filter((e) => !e.dead && !e.flying);
      for (let i = 0; i < es.length; i++) {
        for (let j = i + 1; j < es.length; j++) {
          const a = es[i], b = es[j];
          if (a.decoy || b.decoy) continue;
          const d = U.dist(a, b), min = a.r + b.r;
          if (d >= min || d < 1e-4) continue;
          const push = (min - d) / 2;
          const nx = (b.x - a.x) / d, ny = (b.y - a.y) / d;
          let wa = 1, wb = 1;
          if (a.def.id === 'burgers') { wa = 0.3; wb = 1.7; }
          if (b.def.id === 'burgers') { wa = 1.7; wb = 0.3; }
          if (a.team === b.team) { wa *= 0.5; wb *= 0.5; }
          a.x -= nx * push * wa; a.y -= ny * push * wa;
          b.x += nx * push * wb; b.y += ny * push * wb;
          this.world.collide(a);
          this.world.collide(b);
        }
      }
    }

    updateZones(dt) {
      for (const z of this.zones) {
        z.t -= dt;
        for (const e of this.ents) {
          if (e.dead || U.dist(e, z) > z.r) continue;
          if (z.kind === 'fire') {
            if (e.team !== 'survivor' || e.decoy) continue;
            e.dotAcc += dt * 16;
            Ent.add(e, 'burning', 0.4);
            if (e.dotAcc >= 5) { Ent.damage(this, e, e.dotAcc, z.owner, { dot: true, cause: 'Arson' }); e.dotAcc = 0; }
          } else if (z.kind === 'grease') {
            if (e.team === 'survivor') Ent.add(e, 'greased', 0.25, { mult: 0.6 });
            else if (e.def.id === 'burgers') Ent.add(e, 'skate', 0.25, { mult: 1.25 });
          } else if (z.kind === 'vines') {
            if (e.team !== 'survivor' || e.decoy) continue;
            Ent.add(e, 'tangled', 0.25, { mult: 0.6 });
            if (!Ent.has(e, 'revealed')) { Ent.add(e, 'revealed', 4); this.text(e.x, e.y - 30, 'SEEN', '#7dff9a'); }
          } else if (z.kind === 'rally') {
            if (e.team === 'survivor') Ent.add(e, 'rallied', 0.25);
          }
        }
        if (z.kind === 'fire' && Math.random() < 0.6) {
          const a = Math.random() * Math.PI * 2, r = Math.random() * z.r;
          this.particles.push({ x: z.x + Math.cos(a) * r, y: z.y + Math.sin(a) * r, vx: 0, vy: U.rand(-60, -20), t: 0, dur: 0.6, color: U.choice(['#ff7a1a', '#ffd23f', '#ff3b1a']), size: U.rand(3, 6) });
        }
      }
      this.zones = this.zones.filter((z) => z.t > 0);
    }

    updateProjectiles(dt) {
      const w = this.world;
      for (const p of this.projectiles) {
        if (p.kind === 'lob') {
          p.t += dt;
          const f = Math.min(1, p.t / p.flight);
          p.x = U.lerp(p.sx, p.tx, f);
          p.y = U.lerp(p.sy, p.ty, f);
          p.h = Math.sin(f * Math.PI) * 40;
          if (f >= 1) {
            p.dead = true;
            if (p.sub === 'fire') {
              this.zones.push({ kind: 'fire', x: p.x, y: p.y, r: 85, t: 6, max: 6, owner: p.owner });
              G.Audio.play('fire', this.nearPlayer(p.x, p.y, 700) ? 1 : 0.3);
            } else {
              this.zones.push({ kind: 'grease', x: p.x, y: p.y, r: 95, t: 8, max: 8, owner: p.owner });
              G.Audio.play('sizzle', this.nearPlayer(p.x, p.y, 700) ? 1 : 0.3);
            }
            this.burst(p.x, p.y, p.color, 14);
          }
          continue;
        }
        const step = Math.hypot(p.vx, p.vy) * dt;
        const n = Math.max(1, Math.ceil(step / 8));
        for (let i = 0; i < n && !p.dead; i++) {
          const px = p.x, py = p.y;
          p.x += (p.vx * dt) / n;
          p.y += (p.vy * dt) / n;
          p.trav += step / n;
          const tx = Math.floor(p.x / T), ty = Math.floor(p.y / T);
          if (w.blocksSight(tx, ty) || w.hasBarricade(tx, ty) || p.trav > p.range) {
            p.dead = true;
            this.burst(p.x, p.y, p.color, 6);
            if (p.kind === 'fork') this.dropFork(p, px, py);
            break;
          }
          for (const s of this.targets()) {
            if (U.dist(s, p) > s.r + p.r) continue;
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
      if (s.decoy) { Ent.kill(this, s, k); if (p.kind === 'fork') this.dropFork(p, s.x, s.y); return; }
      if (Ent.has(s, 'shield') && Math.abs(U.angDiff(s.facing, U.angTo(s, p))) < 1.2) {
        this.text(s.x, s.y - 26, 'BLOCKED', '#d9c27a');
        G.Audio.play('block');
        if (p.kind === 'fork') this.dropFork(p, p.x, p.y);
        return;
      }
      if (p.kind === 'hack') {
        Ent.damage(this, s, 8, k);
        Ent.add(s, 'hacked', 3);
        s.cast = null;
        this.text(s.x, s.y - 28, 'HACKED', '#39ff88');
        G.Audio.play('glitch');
        if (s.isPlayer) this.announce('ACCOUNT HACKED: controls reversed', '#39ff88', 1.6);
      } else if (p.kind === 'vine') {
        Ent.damage(this, s, 12, k);
        Ent.add(s, 'root', 2.0);
        s.cast = null;
        this.text(s.x, s.y - 28, 'ROOTED', '#7dff9a');
      } else if (p.kind === 'fork') {
        Ent.damage(this, s, 18 * Ent.dmgMult(k), k);
        this.dropFork(p, s.x, s.y);
      }
    }
    dropFork(p, x, y) {
      this.forks = this.forks.filter((f) => f.owner !== p.owner);
      this.forks.push({ x, y, t: 4, owner: p.owner, a: Math.atan2(p.vy, p.vx) });
    }
    updateForks(dt) {
      for (const f of this.forks) {
        f.t -= dt;
        if (f.t <= 0) f.owner.cds.Q = Math.max(f.owner.cds.Q, 6);
      }
      this.forks = this.forks.filter((f) => f.t > 0);
    }

    updateGens(dt) {
      for (const g of this.world.gens) {
        if (g.done) continue;
        const reps = this.survivors.filter((s) => !s.dead && s.repairing === g);
        g.repairers = reps.length;
        if (!reps.length) continue;
        let rate = 0;
        reps.forEach((s, i) => (rate += (s.def.repairMult || 1) * (Ent.has(s, 'lesson') ? 1.35 : 1) * (i === 0 ? 1 : 0.8)));
        g.progress += (rate * dt) / G.CONFIG.genTime;
        g.spark -= dt;
        if (g.spark <= 0) {
          g.spark = 0.25;
          this.particles.push({ x: g.x + U.rand(-12, 12), y: g.y - 10, vx: U.rand(-40, 40), vy: U.rand(-90, -40), t: 0, dur: 0.5, color: U.choice(['#4c97ff', '#9966ff', '#ffbf00', '#59c059']), size: 3, shape: 'block' });
        }
        if (g.progress >= 1) {
          g.progress = 1;
          g.done = true;
          for (const s of reps) s.stats.gens++;
          if (!this.finale) this.timer = Math.max(8, this.timer - G.CONFIG.genTimeCut);
          const left = this.world.gens.filter((x) => !x.done).length;
          this.feed(`Terminal compiled (${this.world.gens.length - left}/${this.world.gens.length})`, '#59c059');
          this.announce(left ? 'TERMINAL COMPILED' : 'ALL TERMINALS COMPILED', '#59c059', 1.8, this.finale ? '' : `-${G.CONFIG.genTimeCut}s until the reset`);
          G.Audio.play('compile');
          this.burst(g.x, g.y, '#59c059', 25);
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
      if (this.particles.length > 700) this.particles.splice(0, this.particles.length - 700);
      for (const t of this.texts) { t.t += dt; t.y -= 30 * dt; }
      this.texts = this.texts.filter((t) => t.t < t.dur);
      // Snow on the Forums (it is always the night of the anniversary).
      if (this.mapDef.id === 'forums') {
        const c = this.cam;
        for (let i = 0; i < 2; i++) this.particles.push({ x: c.x + U.rand(-800, 800), y: c.y + U.rand(-500, 400), vx: U.rand(-10, 10), vy: U.rand(25, 45), t: 0, dur: U.rand(2, 4), color: '#ffffff', size: U.rand(1, 2.5), snow: true });
      }
      for (const e of this.ents) {
        if (e.dead) continue;
        const id = e.def.id;
        if (id === 'creaker' && Math.random() < 0.08) this.particles.push({ x: e.x + U.rand(-14, 14), y: e.y + U.rand(-14, 14), vx: 0, vy: 0, t: 0, dur: 1.5, color: '#3f8f3a', size: 2, shape: 'leaf' });
        if (id === 'revengest' && Math.random() < 0.3) this.particles.push({ x: e.x + U.rand(-8, 8), y: e.y + U.rand(-8, 8), vx: U.rand(-15, 15), vy: U.rand(-30, -10), t: 0, dur: 0.6, color: Ent.has(e, 'corrupt') ? '#ff3b1a' : '#ffb347', size: U.rand(2, 3.5) });
        if (id === 'sc' && Math.random() < 0.15) this.particles.push({ x: e.x + U.rand(-10, 10), y: e.y + U.rand(-10, 10), vx: 0, vy: -15, t: 0, dur: 0.9, color: '#c9ccd1', size: 2, shape: 'block' });
        if (id === 'protocol2' && Math.random() < 0.12) this.particles.push({ x: e.x + U.rand(-12, 12), y: e.y + U.rand(-12, 12), vx: 0, vy: 25, t: 0, dur: 0.8, color: '#39ff88', size: 7, shape: 'code' });
        if (e.team === 'survivor' && !e.decoy && e.hp < e.maxHp * 0.5 && Math.random() < 0.08) this.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, t: 0, dur: 3, color: '#ff3b5c', size: 2.5, floor: true, shape: 'block' });
      }
    }

    updateAudio(dt) {
      const p = this.spectate;
      if (!p || p.team !== 'survivor' || p.dead) return;
      const k = this.killer;
      const d = U.dist(p, k);
      if (!k.def.terror || d > k.def.terror) return;
      this.heartT -= dt;
      if (this.heartT <= 0) {
        const f = d / k.def.terror;
        this.heartT = 0.35 + f * 0.9;
        G.Audio.play('heart', 1 - f * 0.6);
      }
    }

    // ------------------------------------------------------------ finale
    updateFinale(dt) {
      const f = this.finale;
      f.t += dt;
      const k = this.killer;
      if (f.phase === 'fight' && f.t > 32) {
        f.phase = 'stopped';
        k.cast = null;
        k.action = null;
        k.effects = [];
        this.projectiles = [];
        this.announce('SC stops.', '#c9ccd1', 5, 'Even grief has a bottom. Even fury runs out of fuel.');
        G.Audio.play('creak');
        f.hintT = 5;
      }
      if (f.phase === 'stopped' || f.phase === 'down') Ent.add(k, 'revealed', 0.5);
      if (f.phase === 'stopped') {
        k.moveInput = { x: 0, y: 0 };
        f.hintT -= dt;
        if (f.hintT <= 0 && !this.banner) this.announce('He lowers the block.', '#c9ccd1', 3.5, 'Walk up to SC. Press [F] or swing Showstopper [Q].');
      }
      if (f.phase === 'down' && !this.banner) this.announce('He let it happen.', '#c9ccd1', 3.5, 'Pick up the DESTROY block and press [F] to crush it.');
    }
    finaleInteract() {
      const f = this.finale;
      const p = this.player;
      if (f.phase === 'stopped' && U.dist(p, this.killer) < 90) this.finaleStrike();
      else if (f.phase === 'down' && f.block && U.dist(p, f.block) < 60) {
        f.phase = 'crush';
        G.Audio.play('crush');
        this.shake(20);
        this.burst(f.block.x, f.block.y, '#9a9a9a', 40);
        G.Cutscene.start(this);
      }
    }
    finaleStrike() {
      const f = this.finale;
      const k = this.killer;
      f.phase = 'down';
      Ent.add(k, 'downed', 9999);
      G.Audio.play('slam');
      this.shake(14);
      this.burst(k.x, k.y, '#c9ccd1', 24);
      const a = U.angTo(this.player, k);
      const b = { x: k.x + Math.cos(a) * 40, y: k.y + Math.sin(a) * 40, r: 10 };
      this.world.collide(b);
      f.block = b;
      this.banner = null;
      this.text(k.x, k.y - 40, 'GRIFFPATCH hit him into the ground.', '#ffffff');
    }

    end(winner) {
      if (this.over) return;
      this.over = true;
      this.winner = winner;
      try { localStorage.setItem('scrated_rounds', String((+localStorage.getItem('scrated_rounds') || 0) + 1)); } catch (e) { /* storage blocked */ }
      G.Audio.play(winner === 'survivors' ? 'compile' : 'death');
      setTimeout(() => G.Menu.showResults(this), 1200);
    }
  }

  G.Game = Game;

  let last = 0;
  G.loop = function (ts) {
    const dt = Math.min(0.05, (ts - last) / 1000 || 0.016);
    last = ts;
    const g = G.game;
    if (G.Cutscene && G.Cutscene.active) {
      if (G.Input.pressed.escape) G.Cutscene.skip();
      G.Cutscene.frame(dt);
    } else if (g) {
      if (G.Input.pressed.escape && !g.over) G.Menu.togglePause();
      const scale = G.debugTimeScale || 1;
      for (let i = 0; i < scale; i++) g.update(dt);
      G.Render.frame(g);
    }
    G.Input.endFrame();
    requestAnimationFrame(G.loop);
  };
})();
