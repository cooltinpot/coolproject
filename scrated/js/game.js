// Round state for side-view SCRATED: player control, hitboxes, projectiles,
// clones, minions, traps, LMS / OVERTIME, badges hooks and the Final Round.
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
      this.mapDef = G.MAPS[mapId];
      this.world = new G.World(this.mapDef);
      this.ents = [];
      this.projectiles = [];
      this.hitboxes = [];
      this.swings = [];
      this.traps = [];
      this.fx = [];
      this.particles = [];
      this.texts = [];
      this.feedList = [];
      this.banner = null;
      this.toast = null;
      this.time = 0;
      this.timer = G.CONFIG.roundTime;
      this.phase = 'intro';
      this.introT = 3;
      this.over = false;
      this.paused = false;
      this.shakeAmt = 0;
      this.heartT = 0;
      this.roundBadges = [];
      this.finale = cfg.mode === 'finale' ? { phase: 'fight', t: 0 } : null;
      this.vw = window.innerWidth;
      this.vh = window.innerHeight;

      const killerId = cfg.role === 'killer' ? cfg.charId : cfg.opponent === 'random' || !cfg.opponent ? U.choice(Object.keys(G.KILLERS)) : cfg.opponent;
      const ks = this.world.spawnK;
      this.killer = Ent.create(killerId, ks.x, ks.y, cfg.role === 'killer');
      this.ents.push(this.killer);
      Ent.add(this.killer, 'rising', this.finale ? 2 : 4);
      let ids = Object.keys(G.SURVIVORS);
      const count = cfg.survivors === 2 ? 2 : 3;
      if (cfg.role === 'survivor') ids = [cfg.charId, ...U.shuffle(ids.filter((i) => i !== cfg.charId))];
      ids = ids.slice(0, count);
      this.survivors = ids.map((id, i) => {
        const sp = this.world.spawnsS[i % this.world.spawnsS.length];
        const s = Ent.create(id, sp.x, sp.y, cfg.role === 'survivor' && id === cfg.charId);
        s.facing = 1;
        this.ents.push(s);
        return s;
      });
      this.player = this.ents.find((e) => e.isPlayer);
      this.spectate = this.player;
      this.cam = { x: this.player.x, y: this.player.y - 60, zoom: 1 };
      if (this.mapDef.id === 'castle' && !this.finale) {
        // The hacker breaks in through the top wall.
        this.killer.y -= T * 3;
        this.breakIn = { t: 0, x: this.killer.x, y: (13) * T };
      }
      if (this.player.def.id === 'scratchy' && this.player.hp === 90) this.badge(135, this.player);
      if (this.player.def.id === 'scratchy' && this.player.hp >= 85) G.Badges.bump('bandaged85');
      if (this.finale) this.announce('ROUND 500', '#ffd23f', 4, 'Five hundred years passed.');
      else this.announce(this.mapDef.name, '#ffffff', 3, `${this.killer.def.name} is hunting this round`);
      G.Music.stop();
    }

    // ------------------------------------------------------------- helpers
    get alive() { return this.survivors.filter((s) => !s.dead && !Ent.has(s, 'dying')); }
    targets() { return this.survivors.filter((s) => !s.dead && !Ent.has(s, 'dying')); }
    clones() { return this.ents.filter((e) => e.clone && !e.dead); }
    text(e, s, color) { this.texts.push({ x: e.x, y: e.y - e.h - 12, s, color, t: 0, dur: 1 }); }
    burst(x, y, color, n) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, sp = U.rand(40, 220);
        this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, t: 0, dur: U.rand(0.3, 0.8), color, size: U.rand(2, 4), grav: true });
      }
    }
    shake(n) { this.shakeAmt = Math.max(this.shakeAmt, n); }
    feed(s, color) { this.feedList.unshift({ s, color, t: 6 }); if (this.feedList.length > 5) this.feedList.pop(); }
    announce(s, color, dur = 2.2, sub = '') { this.banner = { s, color, t: dur, dur, sub }; }
    sound(name, e, vol = 1) {
      const p = this.spectate || this.player;
      const d = e ? Math.hypot(e.x - p.x, e.y - p.y) : 0;
      if (d > 1100) return;
      G.Sfx.play(name, vol * (1 - d / 1300));
    }
    badge(id, e) {
      if (e && !e.isPlayer) return;
      if (G.Badges.award(id)) this.roundBadges.push(id);
    }
    screenToWorld(sx, sy) {
      const c = this.cam;
      return { x: (sx - this.vw / 2) / c.zoom + c.x, y: (sy - this.vh / 2) / c.zoom + c.y };
    }

    // ----------------------------------------------------------- spawning
    spawnClone(owner, i) {
      const c = { id: 'c' + Math.random(), clone: true, def: G.CHARS[owner.disguise], team: 'killer', skin: owner.disguise, name: G.CHARS[owner.disguise].name,
        x: owner.x + U.rand(-30, 30), y: owner.y, w: 26, h: 44, vx: 0, vy: -300, facing: owner.facing, hp: 1, maxHp: 1, dead: false, life: 25,
        off: (i % 2 ? 1 : -1) * (40 + i * 30), effects: [], anim: { name: 'idle', t: 0 }, grounded: false, fakeHp: owner.fakeHp, input: {} };
      this.ents.push(c);
      return c;
    }
    spawnMinion(owner, i) {
      const m = { id: 'm' + Math.random(), minion: true, team: 'minion', owner, x: owner.x + (i - 1) * 24, y: owner.y, w: 20, h: 20,
        vx: (Math.random() < 0.5 ? -1 : 1) * 150, vy: -350, hp: 25, dur: 5, bounces: 0, life: 25, dead: false, hitT: new Map(), track: null, hits: 0, anim: { t: 0 }, effects: [] };
      this.ents.push(m);
    }

    // ------------------------------------------------------------- player
    controlPlayer() {
      const p = this.player;
      const I = G.Input;
      const k = I.keys;
      if (p.dead || Ent.has(p, 'dying')) {
        p.input = { mx: 0 };
        if (I.pressed.tab || !this.spectate || this.spectate.dead) {
          const al = this.alive;
          if (al.length) this.spectate = al[(al.indexOf(this.spectate) + 1) % al.length];
        }
        return;
      }
      const atLadder = this.world.ladderAt(p) >= 0 || this.world.ladderBelow(p) >= 0 || p.climbing;
      const upP = I.pressed.w || I.pressed.arrowup;
      p.input = {
        mx: (k.d || k.arrowright ? 1 : 0) - (k.a || k.arrowleft ? 1 : 0),
        up: !!(k.w || k.arrowup),
        down: !!(k.s || k.arrowdown),
        jump: !!(I.pressed[' '] || (upP && !atLadder)),
        sprint: !!k.shift,
      };
      p.aim = this.screenToWorld(I.mouse.x, I.mouse.y);
      if (p.team === 'killer') {
        if (I.mouse.down || k.j) Ent.tryCast(p, 'M1', this);
        for (const s of ['Q', 'E', 'R']) if (I.pressed[s.toLowerCase()]) Ent.tryCast(p, s, this);
        if (I.pressed.n) Ent.tryCast(p, 'R', this);
      } else {
        for (const s of ['Q', 'E']) if (I.pressed[s.toLowerCase()]) Ent.tryCast(p, s, this);
        if (p.def.id === 'scratchy' || p.def.id === 'griffpatch') {
          // Abilities fire the way you face; the mouse picks the side.
          if (!p.action && Math.abs(p.input.mx) < 0.1 && (I.pressed.q || I.pressed.e)) p.facing = p.aim.x >= p.x ? 1 : -1;
        }
      }
      if (I.pressed.f) this.interact(p);
    }

    interact(p) {
      if (this.finale) return this.finaleInteract();
      for (const egg of this.world.eggs) {
        if (egg.found || Math.abs(egg.x - p.x) > 40 || Math.abs(egg.y - p.y) > 50) continue;
        egg.found = true;
        const info = G.EGGS[egg.kind];
        this.toast = { title: info.name, text: info.text, t: 5 };
        this.badge(info.badge, p);
        if (egg.kind === 'B') this.badge(66, p);
        G.Sfx.play('sc_surprised', 0.5);
      }
    }

    // ------------------------------------------------------------- update
    update(dt) {
      if (this.over || this.paused) return;
      this.time += dt;
      if (this.phase === 'intro') {
        this.introT -= dt;
        if (this.breakIn) this.updateBreakIn(dt);
        if (this.introT <= 0) { this.phase = 'play'; }
      } else if (!this.finale) this.timer -= dt;

      this.controlPlayer();
      for (const e of this.ents) if (!e.clone && !e.minion) G.AI.update(e, this, dt);
      for (const e of this.ents) if (!e.clone && !e.minion) Ent.update(e, this, dt);
      const k0 = this.killer, sp0 = this.world.spawnK;
      if (this.phase === 'play') k0.maxRoam = Math.max(k0.maxRoam || 0, Math.hypot(k0.x - sp0.x, k0.y - sp0.y));
      this.updateClones(dt);
      this.updateMinions(dt);
      this.updateHitboxes(dt);
      this.updateProjectiles(dt);
      this.updateTraps(dt);
      this.updateFx(dt);
      this.updateAudio(dt);
      this.ents = this.ents.filter((e) => !(e.dead && (e.clone || e.minion)));
      if (this.finale) this.updateFinale(dt);
      if (this.banner && (this.banner.t -= dt) <= 0) this.banner = null;
      if (this.toast && (this.toast.t -= dt) <= 0) this.toast = null;
      for (const f of this.feedList) f.t -= dt;
      this.feedList = this.feedList.filter((f) => f.t > 0);
      this.shakeAmt *= Math.pow(0.02, dt);
      if (this.finale || this.phase === 'intro') return;

      // LMS / OVERTIME.
      const alive = this.alive.length;
      if (alive === 1 && !this.lms && this.survivors.length > 1) {
        this.lms = true;
        this.timer = Math.min(this.timer, G.CONFIG.lmsTime);
        this.announce('LAST MAN STANDING', '#ff3b3b', 3, `${this.alive[0].name} is the last one left`);
        G.Music.play('lms');
      } else if (!this.lms && this.timer <= G.CONFIG.overtimeAt && !this.overtime) {
        this.overtime = true;
        this.announce('OVERTIME', '#ffd23f', 2.5, 'One minute left');
        G.Music.play('overtime');
      }
      if (!this.alive.length && !this.survivors.some((s) => Ent.has(s, 'dying'))) this.end('killer');
      else if (this.timer <= 0) this.end('survivors');
    }

    updateBreakIn(dt) {
      const b = this.breakIn;
      b.t += dt;
      if (!b.done) { this.killer.x = b.x; this.killer.y = b.y - 4; this.killer.vy = 0; }
      if (b.t > 1.4 && !b.done) {
        b.done = true;
        Ent.remove(this.killer, 'rising');
        Ent.add(this.killer, 'rising', 1.2);
        this.killer.vy = 300;
        for (let i = 0; i < 30; i++) this.particles.push({ x: b.x + U.rand(-50, 50), y: b.y + U.rand(-10, 10), vx: U.rand(-160, 160), vy: U.rand(-100, 200), t: 0, dur: U.rand(0.6, 1.4), color: U.choice(['#2a2a2e', '#555', '#8a7a4a']), size: U.rand(3, 7), grav: true });
        this.shake(14);
        const style = { sc: 'SC flies through the ceiling, block blazing.', protocol2: 'PROTOCOL2 kicks the stone in with a sweep of his cape.', burgers: 'BURGERS rams straight through, roaring.', creaker: 'Vines crack the wall apart. THE CREAKER steps through.', revengest: 'A fork-slash splits the wall. THE REVENGEST drops in.' }[this.killer.def.id];
        this.announce('THE CASTLE', '#ffd23f', 2.5, style);
        this.sound('slam', this.killer);
      }
    }

    updateClones(dt) {
      const owner = this.killer;
      for (const c of this.clones()) {
        c.life -= dt;
        if (c.life <= 0 || !owner.disguise) { c.dead = true; this.burst(c.x, c.y - 20, '#5a3f8f', 8); continue; }
        const tx = owner.x + c.off;
        const dx = tx - c.x;
        c.vx += U.clamp((Math.abs(dx) > 20 ? Math.sign(dx) * 190 : 0) - c.vx, -1800 * dt, 1800 * dt);
        if (c.vx) c.facing = c.vx > 0 ? 1 : -1;
        c.vy = Math.min(G.PHYS.maxFall, c.vy + G.PHYS.gravity * dt);
        const r = this.world.move(c, dt);
        c.grounded = this.world.onGround(c);
        if (c.grounded && (r.hitX || owner.y < c.y - 50 || Math.random() < 0.004)) c.vy = -G.PHYS.jump;
        c.anim.t += dt;
        c.anim.name = Math.abs(c.vx) > 25 ? 'walk' : 'idle';
        for (const s of this.targets()) {
          if (!Ent.overlap(c, s)) continue;
          c.dead = true;
          Ent.damage(this, s, 5, owner, { cause: 'a clone' });
          this.text(c, 'NOT REAL', '#b98cff');
          this.burst(c.x, c.y - 20, '#5a3f8f', 14);
          this.badge(79, owner);
          break;
        }
      }
    }

    updateMinions(dt) {
      for (const m of this.ents) {
        if (!m.minion || m.dead) continue;
        m.life -= dt;
        m.anim.t += dt;
        if (m.life <= 0 || m.dur <= 0) {
          m.dead = true;
          this.burst(m.x, m.y - 10, '#1a1020', 10);
          if (!m.hits && m.owner.isPlayer) this.badge(103, m.owner);
          continue;
        }
        if (m.track) {
          const dx = m.track.x - m.x;
          if (Math.abs(dx) > 8) m.vx = Math.sign(dx) * 170;
          else m.track = null;
        }
        m.vy = Math.min(G.PHYS.maxFall, m.vy + G.PHYS.gravity * dt);
        const r = this.world.move(m, dt);
        const g = this.world.onGround(m);
        if (r.hitX) {
          m.vx = -m.vx || 150;
          m.dur--;
          m.bounces++;
          if (m.bounces >= 5 && m.owner.isPlayer) m.bouncy = true;
        }
        if (g && Math.random() < 0.02) m.vy = -U.rand(300, 520);
        for (const s of this.targets()) {
          if (!Ent.overlap(m, s)) continue;
          if (this.time - (m.hitT.get(s) || -9) < 1) continue;
          m.hitT.set(s, this.time);
          if (Ent.damage(this, s, 5, m.owner, { cause: 'a minion' }) > 0) {
            m.hits++;
            m.track = { x: s.x };
            m.owner.omenHits = m.owner.omenHits || new Set();
            m.owner.omenHits.add(m.id);
            if (m.owner.omenHits.size >= 3) this.badge(101, m.owner);
            if (m.bouncy) this.badge(102, m.owner);
          }
        }
      }
    }

    updateHitboxes(dt) {
      for (const hb of this.hitboxes) {
        hb.delay -= dt;
        if (hb.delay > 0) continue;
        const o = hb.owner;
        hb.x = o.x + hb.facing * hb.dx;
        hb.y = o.y - o.h / 2 + hb.dy;
        hb.life -= dt;
        hb.active = true;
        for (const s of this.targets()) {
          if (hb.hit.has(s) || !Ent.circleHits(hb.x, hb.y, hb.r, s)) continue;
          hb.hit.add(s);
          const dealt = Ent.damage(this, s, hb.dmg, o);
          if (dealt > 0) hb.swing.targets.set(s, (hb.swing.targets.get(s) || 0) + 1);
        }
        for (const c of this.clones()) if (o.team === 'survivor' && Ent.circleHits(hb.x, hb.y, hb.r, c)) c.dead = true;
      }
      this.hitboxes = this.hitboxes.filter((h) => h.life > 0);
      for (const sw of this.swings) {
        if (!this.hitboxes.some((h) => h.swing === sw)) { sw.done = true; if (sw.onDone) sw.onDone(sw); }
      }
      this.swings = this.swings.filter((s) => !s.done);
    }

    updateProjectiles(dt) {
      const W = this.world;
      for (const p of this.projectiles) {
        p.t += dt;
        if (p.t > p.life) { p.dead = true; continue; }
        if (p.kind === 'vision') {
          p.x += p.vx * dt; p.y += p.vy * dt;
          p.r = 18 + (100 - 18) * Math.min(1, p.t / p.life);
          if (W.solidFor('killer', Math.floor(p.x / T), Math.floor(p.y / T))) {
            p.dead = true;
            Ent.remove(p.owner, 'immune');
            Ent.slow(p.owner, 1, 2);
            this.text(p.owner, 'NO IMMUNITY', '#bbbbbb');
            p.owner.whiffT = this.time;
            this.burst(p.x, p.y, '#9a9a9a', 20);
            continue;
          }
          for (const s of this.targets()) {
            if (p.hit.has(s) || !Ent.circleHits(p.x, p.y, p.r, s)) continue;
            p.hit.add(s);
            if (Ent.damage(this, s, 15, p.owner) > 0) {
              Ent.add(s, 'distorted', 3.5);
              Ent.slow(s, 2, 3.5);
              this.badge(32, p.owner);
            }
          }
        } else if (p.kind === 'hook') {
          const n = 4;
          for (let i = 0; i < n && !p.dead; i++) {
            const nx = p.x + (p.vx * dt) / n, ny = p.y + (p.vy * dt) / n;
            let bounced = false;
            if (W.blocksSight(Math.floor(nx / T), Math.floor(p.y / T))) { p.vx = -p.vx; bounced = true; }
            else p.x = nx;
            if (W.blocksSight(Math.floor(p.x / T), Math.floor(ny / T))) { p.vy = -p.vy; bounced = true; }
            else p.y = ny;
            if (bounced) {
              p.bounces++;
              p.vx *= 1.12; p.vy *= 1.12;
              this.burst(p.x, p.y, '#c0c0c0', 4);
              if (p.bounces > 10) { p.dead = true; break; }
            }
            for (const s of this.targets()) {
              if (!Ent.circleHits(p.x, p.y, p.r, s)) continue;
              p.dead = true;
              const parry = Ent.has(s, 'deflect');
              const dealt = Ent.damage(this, s, 6 + 2 * p.bounces, p.owner);
              if (!parry && dealt > 0) {
                const dir = Math.sign(p.owner.x - s.x) || 1;
                s.action = { type: 'thrown', t: 0, dur: 0.45, vx: dir * 520, vy: 0, nograv: false, anim: 'stun' };
                s.vy = -280;
                Ent.slow(s, 1, 1.5);
                this.text(s, 'HOOKED', '#c0c0c0');
                p.owner.hookHits = (p.owner.hookHits || 0) + 1;
                if (p.owner.hookHits >= 3) this.badge(54, p.owner);
                if (p.bounces >= 5) this.badge(48, p.owner);
                if (p.bounces >= 10) this.badge(49, p.owner);
              }
              break;
            }
          }
        } else if (p.kind === 'slinger') {
          p.x += p.vx * dt;
          if (p.x < -60 || p.x > W.pw + 60) { p.dead = true; continue; }
          const dir = Math.sign(p.vx);
          for (const b of p.boxes) {
            const bx = p.x + dir * b.dx, by = p.y + b.dy;
            for (const s of this.targets()) {
              if (b.hit.has(s) || !Ent.circleHits(bx, by, p.r, s)) continue;
              b.hit.add(s);
              if (Ent.damage(this, s, 5, p.owner) > 0) {
                s.slingHits = (s.slingHits || 0) + 1;
                if (s.slingHits >= 6) this.badge(99, p.owner);
                if (Math.abs(p.x - p.sx) > W.pw * 0.6) this.badge(100, p.owner);
              }
            }
          }
        } else if (p.kind === 'grabber') {
          const t = p.target;
          if (!t || t.dead) { p.dead = true; continue; }
          const a = Math.atan2(t.y - t.h / 2 - p.y, t.x - p.x);
          p.vx = Math.cos(a) * 620; p.vy = Math.sin(a) * 620;
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (Ent.circleHits(p.x, p.y, p.r, t)) {
            p.dead = true;
            const out = U.randInt(0, 2);
            const own = p.owner;
            own.faceOutcomes = own.faceOutcomes || new Set();
            own.faceOutcomes.add(out);
            if (own.faceOutcomes.size >= 3) this.badge(83, own);
            if (Ent.has(t, 'invuln')) { this.text(t, 'IMMUNE', '#fff'); continue; }
            if (out === 0) { Ent.slow(t, 4, 2.5); Ent.add(t, 'root', 0.8); this.text(t, 'GRABBED', '#b98cff'); this.badge(97, own); }
            else if (out === 1) { Ent.add(t, 'corrupted', 5, { dps: 4, src: own }); this.text(t, 'CORRUPTED', '#ff3b1a'); this.badge(96, own); }
            else {
              Ent.damage(this, t, 15, own, { cause: 'FACE THY SELF' });
              t.vy = -360; t.vx = Math.sign(t.x - own.x) * 300;
              this.fx.push({ type: 'ring', x: p.x, y: p.y, r0: 10, r1: 70, t: 0, dur: 0.35, color: '#ff8a3a' });
              this.badge(95, own);
            }
            this.burst(p.x, p.y, '#5a3f8f', 16);
          }
        }
      }
      this.projectiles = this.projectiles.filter((p) => !p.dead);
    }

    updateTraps(dt) {
      for (const tr of this.traps) {
        tr.t += dt;
        if (tr.t < tr.arm) continue;
        for (const s of this.targets()) {
          if (Math.abs(s.x - tr.x) > 22 || Math.abs(s.y - tr.y) > 14) continue;
          tr.dead = true;
          Ent.slow(s, 1, 4);
          Ent.add(s, 'glitched', 6, { dps: 2, src: tr.owner });
          this.text(s, 'GLITCHED I', '#ff3b5c');
          this.sound('burg_spike', s);
          this.fx.push({ type: 'spike', x: tr.x, y: tr.y, t: 0, dur: 0.5 });
          tr.owner.trapHits = (tr.owner.trapHits || 0) + 1;
          if (tr.owner.trapHits >= 3) this.badge(61, tr.owner);
          this.badge(62, tr.owner);
          break;
        }
      }
      this.traps = this.traps.filter((t) => !t.dead);
    }

    updateFx(dt) {
      for (const f of this.fx) f.t += dt;
      this.fx = this.fx.filter((f) => f.t < f.dur);
      for (const p of this.particles) {
        p.t += dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.grav) p.vy += 700 * dt;
        p.vx *= 0.97;
      }
      this.particles = this.particles.filter((p) => p.t < p.dur);
      if (this.particles.length > 700) this.particles.splice(0, this.particles.length - 700);
      for (const t of this.texts) { t.t += dt; t.y -= 30 * dt; }
      this.texts = this.texts.filter((t) => t.t < t.dur);
      // Corruption on hackers (milestones), glitch on BURGERS.
      const k = this.killer;
      const ms = G.Badges.milestone(k.def.id);
      if (!k.dead && Math.random() < 0.05 + ms * 0.08) this.particles.push({ x: k.x + U.rand(-k.w, k.w) * 0.6, y: k.y - U.rand(0, k.h), vx: 0, vy: -20, t: 0, dur: 0.9, color: '#ff1a3a', size: 8, shape: 'code' });
    }

    updateAudio(dt) {
      const p = this.spectate;
      if (!p || p.team !== 'survivor' || p.dead) return;
      const k = this.killer;
      if (k.disguise) return;
      const d = Math.hypot(p.x - k.x, p.y - k.y);
      if (d > G.CONFIG.terror) return;
      this.heartT -= dt;
      if (this.heartT <= 0) {
        const f = d / G.CONFIG.terror;
        this.heartT = 0.35 + f * 0.9;
        G.Audio.play('heart', 1 - f * 0.6);
      }
    }

    // ---------------------------------------------------------- outcomes
    onDeath(t, src) {
      if (t.isPlayer) {
        this.announce('DELETED', '#ff3b3b', 3, this.alive.length ? 'Spectating. Press Tab to switch.' : '');
        const next = this.alive[0];
        if (next) this.spectate = next;
      }
      if (src && src.isPlayer) {
        G.Badges.bump('kills_' + src.def.id);
        const firstKill = { sc: 38, protocol2: 58, burgers: 71, creaker: 93, revengest: 114 }[src.def.id];
        this.badge(firstKill, src);
        if (src.def.id === 'sc' && t.def.id === 'scratchy') this.badge(22, src);
        if (src.def.id === 'sc' && G.Badges.milestone('sc') >= 3) this.badge(37, src);
        if (src.def.id === 'protocol2' && this.time < 34) this.badge(45, src);
        if (src.def.id === 'protocol2' && src.missT && this.time - src.missT < 10) this.badge(51, src);
      }
    }
    hackerDeleted(k, src) {
      if (this.over) return;
      k.dead = true;
      this.burst(k.x, k.y - k.h / 2, '#ffd23f', 40);
      this.feed(`${k.name} was DELETED by ${src ? src.name : 'the survivors'}`, '#ffd23f');
      this.announce('HACKER DELETED', '#ffd23f', 3);
      this.end('survivors');
    }

    end(winner) {
      if (this.over) return;
      this.over = true;
      this.winner = winner;
      G.Music.stop();
      G.Badges.roundEnd(this);
      G.Audio.play(winner === 'survivors' ? 'gen' : 'death');
      setTimeout(() => G.Menu.showResults(this), 1400);
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
        this.hitboxes = [];
        this.announce('SC stops.', '#c9ccd1', 5, 'Even grief has a bottom. Even fury runs out of fuel.');
        G.Sfx.play('sc_breath', 0.8);
        f.hintT = 5;
      }
      if (f.phase === 'stopped') {
        k.input = { mx: 0 };
        k.anim = { name: 'weak', t: k.anim.name === 'weak' ? k.anim.t : 0, lock: 1 };
        f.hintT -= dt;
        if (f.hintT <= 0 && !this.banner) this.announce('He lowers the block.', '#c9ccd1', 3.5, 'Walk up to SC. Press [F], or SLAM him.');
        const p = this.player;
        if (p.action && p.action.type === 'slam' && Ent.overlap(p, k, 6)) { p.action = null; this.finaleStrike(); }
      }
      if (f.phase === 'down') {
        k.anim = { name: 'dead', t: Math.min(k.anim.t, 2.1), lock: 1 };
        if (!this.banner) this.announce('He let it happen.', '#c9ccd1', 3.5, 'Pick up the DESTROY block and press [F] to crush it.');
      }
    }
    finaleInteract() {
      const f = this.finale;
      const p = this.player;
      if (f.phase === 'stopped' && Math.abs(p.x - this.killer.x) < 90 && Math.abs(p.y - this.killer.y) < 60) this.finaleStrike();
      else if (f.phase === 'down' && f.block && Math.abs(p.x - f.block.x) < 60 && Math.abs(p.y - f.block.y) < 60) {
        f.phase = 'crush';
        G.Sfx.play('sc_wall', 1);
        G.Audio.play('crush');
        this.shake(20);
        this.burst(f.block.x, f.block.y - 10, '#8e9094', 40);
        G.Cutscene.start(this);
      }
    }
    finaleStrike() {
      const f = this.finale;
      const k = this.killer;
      f.phase = 'down';
      k.anim = { name: 'dead', t: 0, lock: 99 };
      G.Sfx.play('slam', 1);
      this.shake(14);
      this.burst(k.x, k.y - 20, '#c9ccd1', 24);
      f.block = { x: k.x + (this.player.x < k.x ? -30 : 30), y: k.y };
      this.banner = null;
      this.text(k, 'GRIFFPATCH hit him into the ground.', '#ffffff');
    }
  }

  G.Game = Game;

  let last = 0;
  G.loop = function (ts) {
    const dt = Math.min(0.033, (ts - last) / 1000 || 0.016);
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
