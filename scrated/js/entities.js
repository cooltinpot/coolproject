// Entities: creation, movement, effects, damage, stuns and every ability.
(function () {
  const G = window.G;
  const U = G.U;
  const T = G.TILE;
  let nextId = 1;

  const Ent = (G.Ent = {
    create(defId, x, y, isPlayer) {
      const def = G.CHARS[defId];
      return {
        id: nextId++, def, team: def.team, name: def.name, isPlayer: !!isPlayer,
        x, y, vx: 0, vy: 0, r: def.r, facing: 0,
        hp: def.hp || 1, maxHp: def.hp || 1, stamina: 100, dead: false,
        cds: { M1: 0, Q: 0, E: 0, R: 0 },
        cast: null, action: null, channel: null, effects: [],
        moveInput: { x: 0, y: 0 }, wantSprint: false, sprinting: false,
        aim: { x: x + 1, y }, wantRepair: false, repairing: null,
        trail: [], ventCd: 0, anim: Math.random() * 10, lastHit: -99, dotAcc: 0,
        adapt: 0, boredT: 0,
        stats: { damage: 0, taken: 0, gens: 0, stuns: 0, heals: 0, blocks: 0, hits: 0 },
        ai: { think: Math.random() * 0.3, path: [], mode: 'idle', mem: {} },
      };
    },

    // GRIFFPATCH's clones: look identical, run away, pop when hit.
    spawnDecoy(game, owner, dir) {
      const d = Ent.create(owner.def.id, owner.x, owner.y, false);
      d.decoy = true;
      d.owner = owner;
      d.life = 5;
      d.hp = d.maxHp = owner.maxHp;
      d.hpShown = owner.hp;
      d.stamina = 100;
      d.decoyDir = dir;
      game.ents.push(d);
      return d;
    },

    // ---------------------------------------------------------- effects
    add(e, type, t, data = {}) {
      const ex = e.effects.find((f) => f.type === type);
      if (ex) { Object.assign(ex, data); ex.t = Math.max(ex.t, t); ex.max = Math.max(ex.max, t); return ex; }
      const f = Object.assign({ type, t, max: t }, data);
      e.effects.push(f);
      return f;
    },
    has(e, type) { return e.effects.some((f) => f.type === type); },
    get(e, type) { return e.effects.find((f) => f.type === type); },
    remove(e, type) { e.effects = e.effects.filter((f) => f.type !== type); },

    speed(e, game) {
      let s = e.sprinting ? e.def.sprint : e.def.walk;
      for (const f of e.effects) if (f.mult) s *= f.mult;
      if (e.cast) s *= e.cast.moveMult;
      if (e.team === 'killer') {
        if (!e.isPlayer) s *= game.diff.killerSpeed;
        if (e.def.id === 'burgers') s *= 1 + e.adapt * 0.03;
        if (e.def.id === 'protocol2') s *= 1 + Math.min(0.15, e.boredT * 0.01);
      }
      return s;
    },
    canAct(e) { return !e.dead && !Ent.has(e, 'stun') && !Ent.has(e, 'rising'); },

    // ---------------------------------------------------------------- casts
    ability(e, slot) { return slot === 'M1' ? e.def.m1 : e.def.abilities[slot]; },
    tryCast(e, slot, game) {
      const ab = Ent.ability(e, slot);
      if (!ab || !Ent.canAct(e) || e.cast || e.action || e.channel) return false;
      if (e.cds[slot] > 0) return false;
      if (Ent.has(e, 'root') && slot !== 'M1') return false;
      if (Ent.has(e, 'charmed')) return false;
      if (Ent.has(e, 'hacked')) { game.text(e.x, e.y - 26, 'HACKED', '#39ff88'); return false; }
      if (Ent.has(e, 'corrupt') && (slot === 'Q' || slot === 'E')) { game.text(e.x, e.y - 30, 'LOCKED', '#ff8a1f'); return false; }
      if (game.finale && e.team === 'killer' && game.finale.phase !== 'fight') return false;
      const impl = Abilities[ab.id];
      if (impl.can && !impl.can(e, game, ab)) return false;
      e.facing = U.angTo(e, e.aim);
      e.cast = { slot, id: ab.id, ab, t: 0, windup: ab.windup, moveMult: ab.moveMult ?? 0.5, facing: e.facing, ax: e.aim.x, ay: e.aim.y };
      e.cds[slot] = ab.cd;
      e.repairing = null;
      if (impl.start) impl.start(e, game, e.cast);
      if (e.cast && e.cast.windup <= 0) Ent.finishCast(e, game);
      return true;
    },
    finishCast(e, game) {
      const c = e.cast;
      e.cast = null;
      const ok = Abilities[c.id].exec(e, game, c);
      if (ok === false) e.cds[c.slot] = Math.min(e.cds[c.slot], 1);
    },

    // -------------------------------------------------------- damage/stuns
    damage(game, t, amt, src, opt = {}) {
      if (t.dead || amt <= 0) return 0;
      if (t.decoy) {
        Ent.kill(game, t, src);
        return 0;
      }
      if (game.finale && t.team === 'survivor') amt *= 0.5;
      if (Ent.has(t, 'invuln')) { game.text(t.x, t.y - 26, 'DODGED', '#fff'); return 0; }
      if (src && src.team === 'killer' && Ent.has(t, 'shield') && !opt.unblockable) {
        const a = U.angTo(t, src);
        if (Math.abs(U.angDiff(t.facing, a)) < 1.2) {
          Ent.remove(t, 'shield');
          game.text(t.x, t.y - 28, 'PARRY!', '#d9c27a');
          G.Audio.play('block');
          game.fx.push({ type: 'ring', x: t.x, y: t.y, r0: 10, r1: 70, t: 0, dur: 0.35, color: '#d9c27a' });
          t.stats.blocks++;
          if (Ent.stun(game, src, 1.1, t)) t.stats.stuns++;
          return 0;
        }
      }
      // Rally Banner protection.
      if (t.team === 'survivor' && game.zones.some((z) => z.kind === 'rally' && U.dist(z, t) < z.r)) amt *= 0.65;
      // THE REVENGEST's conscience.
      if (src && src.def.id === 'revengest' && t.hp - amt <= 0 && !Ent.has(src, 'corrupt') && Math.random() < 0.25) {
        game.text(src.x, src.y - 40, 'THE SCARF HOLDS…', '#fff1a8');
        Ent.add(src, 'recover', 0.8, { mult: 0.4 });
        return 0;
      }
      t.hp -= amt;
      t.lastHit = game.time;
      t.stats.taken += amt;
      if (src) {
        src.stats.damage += amt;
        src.stats.hits++;
        if (src.def.id === 'sc') for (const k of ['Q', 'E', 'R']) src.cds[k] = Math.max(0, src.cds[k] - 2);
        if (src.def.id === 'protocol2') src.boredT = 0;
      }
      game.text(t.x + U.rand(-8, 8), t.y - 24, '-' + Math.round(amt), opt.dot ? '#ff9a3c' : '#ff4d4d');
      if (!opt.dot) {
        game.burst(t.x, t.y, '#ff3b5c', 10);
        G.Audio.play('hit', game.nearPlayer(t.x, t.y, 700) ? 1 : 0.3);
        if (t.isPlayer) game.shake(6);
        if (t.team === 'survivor' && t.hp > 0) Ent.add(t, 'hitboost', 2.0, { mult: 1.45 });
        t.channel = null;
        t.repairing = null;
        if (t.cast && t.team === 'survivor') t.cast = null;
        // NANO: Became Better.
        for (const n of game.survivors) if (n !== t && !n.dead && n.def.id === 'nano' && U.dist(n, t) < 300) Ent.add(n, 'loyal', 2, { mult: 1.3 });
      }
      if (game.finale && t.team === 'survivor' && t.hp < 1) t.hp = 1;
      if (t.hp <= 0) Ent.kill(game, t, src, opt.cause);
      return amt;
    },
    kill(game, t, src, cause) {
      if (t.decoy) {
        t.dead = true;
        t.gone = true;
        game.burst(t.x, t.y, '#3d8bff', 16);
        game.text(t.x, t.y - 26, 'CLONE!', '#9cc4ff');
        G.Audio.play('glitch', 0.5);
        return;
      }
      t.hp = 0;
      t.dead = true;
      t.cast = t.action = t.channel = null;
      t.repairing = null;
      t.effects = [];
      t.deathT = game.time;
      game.burst(t.x, t.y, '#ff3b5c', 26);
      game.burst(t.x, t.y, t.def.color, 14);
      G.Audio.play('death');
      G.Audio.play('glitch');
      game.feed(`${t.name} was deleted by ${cause || (src ? src.name : 'the realm')}`, '#ff6b6b');
      if (t.isPlayer) game.onPlayerDeath();
    },
    stun(game, k, dur, src, force) {
      if (k.dead) return false;
      if (k.def.id === 'burgers') {
        dur *= 1 - k.adapt * 0.12;
        if (k.adapt < 5) { k.adapt++; game.text(k.x, k.y - 48, `ADAPTED ×${k.adapt}`, '#ff4b2b'); }
      }
      if (Ent.has(k, 'stunGrace')) dur *= 0.5;
      Ent.add(k, 'stun', dur);
      k.cast = null;
      k.action = null;
      Ent.remove(k, 'flight');
      game.text(k.x, k.y - 34, 'STUNNED', '#e6ff4a');
      G.Audio.play('stun');
      return true;
    },
    heal(game, t, amt, by) {
      if (t.dead) return;
      const h = Math.min(amt, t.maxHp - t.hp);
      t.hp += h;
      if (by) by.stats.heals += h;
    },

    // ---------------------------------------------------------------- update
    update(e, game, dt) {
      e.anim += dt;
      for (const k in e.cds) if (e.cds[k] > 0) e.cds[k] = Math.max(0, e.cds[k] - dt);
      if (e.ventCd > 0) e.ventCd -= dt;
      for (const f of e.effects) f.t -= dt;
      const expired = e.effects.filter((f) => f.t <= 0);
      if (expired.length) {
        e.effects = e.effects.filter((f) => f.t > 0);
        for (const f of expired) if (f.type === 'stun' && e.team === 'killer') Ent.add(e, 'stunGrace', 2.5);
      }
      if (e.dead) return;
      if (e.decoy) {
        e.life -= dt;
        if (e.life <= 0) { e.dead = true; e.gone = true; game.burst(e.x, e.y, '#3d8bff', 8); return; }
      }
      if (e.team === 'killer') e.boredT += dt;
      e.flying = Ent.has(e, 'flight');

      // GRIFFPATCH: Quiet Regen.
      if (e.def.id === 'griffpatch' && !e.decoy && game.time - e.lastHit > 7 && e.hp < e.maxHp) Ent.heal(game, e, 3 * dt, e);

      e.trailT = (e.trailT || 0) - dt;
      if (e.trailT <= 0) {
        e.trailT = 0.04;
        e.trail.unshift({ x: e.x, y: e.y, f: e.facing });
        if (e.trail.length > 12) e.trail.pop();
      }

      const stunned = Ent.has(e, 'stun') || Ent.has(e, 'rising') || Ent.has(e, 'downed');
      if (e.cast && !stunned) {
        e.cast.t += dt;
        e.facing = e.cast.facing;
        if (e.cast.t >= e.cast.windup) Ent.finishCast(e, game);
      }

      if (e.channel) {
        const ch = e.channel;
        const moving = Math.hypot(e.moveInput.x, e.moveInput.y) > 0.1;
        ch.t += dt;
        if (stunned || moving) e.channel = null;
        else if (ch.t >= ch.dur) {
          e.channel = null;
          if (ch.type === 'vent') {
            const to = ch.vent.pair;
            e.x = to.x; e.y = to.y + 0.1;
            game.world.collide(e);
            e.ventCd = 4;
            game.burst(to.x, to.y, '#8a8f99', 12);
            G.Audio.play('whoosh', 0.6);
          }
        }
      }

      // Movement.
      let vx = 0, vy = 0;
      const moving = Math.hypot(e.moveInput.x, e.moveInput.y) > 0.1;
      if (e.action) {
        const a = e.action;
        a.t += dt;
        vx = a.vx; vy = a.vy;
        if (a.t >= a.dur) { e.action = null; if (a.onEnd) a.onEnd(e, game); }
      } else if (!stunned && !Ent.has(e, 'root') && !e.channel && !(e.repairing && !moving)) {
        const noSprint = Ent.has(e, 'greased');
        e.sprinting = e.wantSprint && moving && e.stamina > 1 && !noSprint;
        const sp = Ent.speed(e, game);
        vx = e.moveInput.x * sp;
        vy = e.moveInput.y * sp;
        if (e.sprinting) e.stamina -= dt * (e.team === 'killer' ? 12 : 15) * (e.def.staminaDrain || 1);
      } else e.sprinting = false;
      if (!e.sprinting) {
        const rally = Ent.has(e, 'rallied') ? 3 : 1;
        e.stamina = Math.min(100, e.stamina + dt * (e.team === 'killer' ? 11 : 12) * (e.def.staminaRegen || 1) * (moving ? 0.7 : 1) * rally);
      }
      e.stamina = Math.max(0, e.stamina);

      const ox = e.x, oy = e.y;
      const steps = Math.max(1, Math.ceil((Math.hypot(vx, vy) * dt) / 6));
      let wallHit = false;
      for (let i = 0; i < steps; i++) {
        e.x += (vx * dt) / steps;
        e.y += (vy * dt) / steps;
        if (game.world.collide(e)) wallHit = true;
      }
      e.vx = (e.x - ox) / dt;
      e.vy = (e.y - oy) / dt;
      if (e.action && e.action.onMove) e.action.onMove(e, game, wallHit, Math.hypot(e.x - ox, e.y - oy), Math.hypot(vx, vy) * dt);

      if (!e.cast && !stunned) {
        const dx = e.aim.x - e.x, dy = e.aim.y - e.y;
        if (dx * dx + dy * dy > 4) e.facing = Math.atan2(dy, dx);
      }

      e.repairing = null;
      if (e.team === 'survivor' && !e.decoy && e.wantRepair && !moving && !e.cast && !e.channel && !stunned) {
        let best = null, bd = 64;
        for (const g of game.world.gens) {
          if (g.done) continue;
          const d = U.dist(e, g);
          if (d < bd) { bd = d; best = g; }
        }
        if (best) { e.repairing = best; e.facing = U.angTo(e, best); }
      }

      Ent.hazards(e, game, dt);
    },

    hazards(e, game, dt) {
      const w = game.world;
      const tx = Math.floor(e.x / T), ty = Math.floor(e.y / T);
      const c = w.at(tx, ty);
      if (c === '~' && !e.flying) Ent.add(e, 'wading', 0.15, { mult: 0.6 });
      if (c === 'b' && e.team === 'survivor' && !e.decoy) {
        const b = w.bones.get(ty * w.w + tx);
        if (b && b.cd <= 0) {
          b.cd = 3;
          Ent.add(e, 'revealed', 2.5);
          game.text(e.x, e.y - 30, 'CRACK', '#d9c9a8');
          G.Audio.play('trap', game.nearPlayer(e.x, e.y, 500) ? 0.6 : 0.2);
        }
      }
    },

    arcHit(game, e, range, arc, dmg, facing, onHit) {
      let n = 0;
      for (const s of game.targets()) {
        const d = U.dist(e, s);
        if (d > range + s.r) continue;
        if (d > e.r + s.r + 4 && Math.abs(U.angDiff(facing, U.angTo(e, s))) > arc / 2) continue;
        if (!game.world.los(e.x, e.y, s.x, s.y)) continue;
        const dealt = Ent.damage(game, s, onHit ? onHit(s, dmg) : dmg, e);
        if (dealt > 0 || s.decoy) n++;
      }
      return n;
    },
    // First survivor along a line (stops at walls). Returns hits in order.
    lineHits(game, e, a, len, width, pierce) {
      const hits = [];
      let end = len;
      for (let d = 10; d <= len; d += 8) {
        const x = e.x + Math.cos(a) * d, y = e.y + Math.sin(a) * d;
        if (game.world.blocksSight(Math.floor(x / T), Math.floor(y / T))) { end = d; break; }
      }
      const cs = Math.cos(a), sn = Math.sin(a);
      for (const s of game.targets()) {
        const rx = s.x - e.x, ry = s.y - e.y;
        const along = rx * cs + ry * sn;
        const perp = Math.abs(-rx * sn + ry * cs);
        if (along > 0 && along < end && perp < width / 2 + s.r) hits.push({ s, along });
      }
      hits.sort((p, q) => p.along - q.along);
      return { hits: pierce ? hits.map((h) => h.s) : hits.slice(0, 1).map((h) => h.s), end };
    },
    hitBarricade(game, e, range, facing) {
      const w = game.world;
      for (let d = 20; d <= range; d += 14) {
        const x = e.x + Math.cos(facing) * d, y = e.y + Math.sin(facing) * d;
        const tx = Math.floor(x / T), ty = Math.floor(y / T);
        const k = ty * w.w + tx;
        const b = w.barricades.get(k);
        if (b && !b.unbreakable) {
          b.hp -= 1;
          if (b.hp <= 0) w.barricades.delete(k);
          return true;
        }
      }
      return false;
    },
    lob(e, c, max) {
      let dx = c.ax - e.x, dy = c.ay - e.y;
      const d = Math.hypot(dx, dy);
      if (d > max) { dx *= max / d; dy *= max / d; }
      return { x: e.x + dx, y: e.y + dy };
    },
    dmgMult(e) {
      let m = 1;
      if (Ent.has(e, 'corrupt')) m *= 1.2;
      return m;
    },
  });

  // ---------------------------------------------------------- ability bodies
  const Abilities = (G.Abilities = {
    m1: {
      start(e, game, c) {
        if (Ent.has(e, 'corrupt')) e.cds.M1 = e.def.m1.cd * 0.5;
      },
      exec(e, game, c) {
        const ab = e.def.m1;
        const dmg = ab.damage * Ent.dmgMult(e);
        game.fx.push({ type: 'swing', x: e.x, y: e.y, a: c.facing, arc: ab.arc, range: ab.range, t: 0, dur: 0.18, color: e.def.color2 });
        G.Audio.play('swing', game.nearPlayer(e.x, e.y, 600) ? 1 : 0.3);
        const n = Ent.arcHit(game, e, ab.range, ab.arc, dmg, c.facing);
        if (!n) Ent.hitBarricade(game, e, ab.range, c.facing);
        if (n) Ent.add(e, 'recover', 1.3, { mult: 0.45 });
      },
    },

    // ------------------------------------------------------------- SC
    sc_laser: {
      start(e, game) { G.Audio.play('charge', game.nearPlayer(e.x, e.y, 800) ? 1 : 0.3); },
      exec(e, game, c) {
        const { hits, end } = Ent.lineHits(game, e, c.facing, 720, 30, true);
        game.fx.push({ type: 'laser', x: e.x, y: e.y, a: c.facing, len: end, t: 0, dur: 0.45 });
        G.Audio.play('laser', game.nearPlayer(e.x, e.y, 900) ? 1 : 0.4);
        game.shake(8);
        for (const s of hits) Ent.damage(game, s, 42, e, { unblockable: true });
        if (hits.some((s) => !s.decoy)) Ent.add(e, 'recover', 0.6, { mult: 0.5 });
      },
    },
    sc_reshape: {
      exec(e, game, c) {
        const w = game.world;
        const p = Ent.lob(e, c, 300);
        const side = c.facing + Math.PI / 2;
        let placed = 0;
        for (const k of [-1, 0, 1]) {
          const x = p.x + Math.cos(side) * k * T, y = p.y + Math.sin(side) * k * T;
          const tx = Math.floor(x / T), ty = Math.floor(y / T);
          if (w.isSolidT(tx, ty)) continue;
          const cx = tx * T + T / 2, cy = ty * T + T / 2;
          if (game.ents.some((o) => !o.dead && Math.abs(o.x - cx) < T / 2 + o.r - 2 && Math.abs(o.y - cy) < T / 2 + o.r - 2)) continue;
          w.barricades.set(ty * w.w + tx, { hp: 99, t: 6, max: 6, unbreakable: true, kind: 'code' });
          game.burst(cx, cy, '#a3a9b0', 8);
          placed++;
        }
        if (!placed) { game.text(e.x, e.y - 30, 'NO ROOM', '#aaa'); return false; }
        G.Audio.play('glitch', game.nearPlayer(e.x, e.y, 700) ? 1 : 0.3);
      },
    },
    sc_flight: {
      exec(e, game) {
        Ent.add(e, 'flight', 4, { mult: 1.18 });
        game.burst(e.x, e.y, '#ffd23f', 14);
        G.Audio.play('crown', game.nearPlayer(e.x, e.y, 700) ? 1 : 0.3);
      },
    },

    // ------------------------------------------------------- PROTOCOL2
    p2_hack: {
      exec(e, game, c) {
        const sp = 760;
        game.projectiles.push({ kind: 'hack', x: e.x, y: e.y, vx: Math.cos(c.facing) * sp, vy: Math.sin(c.facing) * sp, r: 8, range: 520, trav: 0, owner: e, color: '#39ff88' });
        G.Audio.play('glitch', game.nearPlayer(e.x, e.y, 700) ? 1 : 0.3);
      },
    },
    p2_arson: {
      exec(e, game, c) {
        const p = Ent.lob(e, c, 300);
        game.projectiles.push({ kind: 'lob', sub: 'fire', sx: e.x, sy: e.y, tx: p.x, ty: p.y, x: e.x, y: e.y, t: 0, flight: 0.35, owner: e, r: 7, color: '#ff7a1a' });
        G.Audio.play('swing');
      },
    },
    p2_decree: {
      exec(e, game) {
        for (const g of game.world.gens) if (!g.done) g.progress = Math.max(0, g.progress - 0.15);
        for (const s of game.survivors) if (!s.dead && s.repairing) Ent.add(s, 'revealed', 5);
        Ent.add(e, 'decree', 4, { mult: 1.2 });
        game.announce('ROYAL DECREE: terminals sabotaged', '#39ff88', 1.8);
        G.Audio.play('crown');
        game.fx.push({ type: 'ring', x: e.x, y: e.y, r0: 20, r1: 260, t: 0, dur: 0.6, color: '#39ff88' });
      },
    },

    // --------------------------------------------------------- BURGERS
    burg_roar: {
      exec(e, game) {
        G.Audio.play('robo');
        game.shake(8);
        game.fx.push({ type: 'ring', x: e.x, y: e.y, r0: 20, r1: 180, t: 0, dur: 0.45, color: '#ff4b2b' });
        for (const s of game.targets()) {
          if (U.dist(e, s) > 180 + s.r) continue;
          if (s.decoy) { Ent.kill(game, s, e); continue; }
          Ent.add(s, 'slow', 2, { mult: 0.6 });
          Ent.add(s, 'revealed', 3);
          if (s.cast) { s.cast = null; game.text(s.x, s.y - 30, 'INTERRUPTED', '#ff4b2b'); }
          game.text(s.x, s.y - 40, 'TERRIFIED', '#ff4b2b');
        }
      },
    },
    burg_dive: {
      exec(e, game, c) {
        const dist = 320, dur = 0.26;
        const dmg = 26 * Ent.dmgMult(e);
        G.Audio.play('dash', game.nearPlayer(e.x, e.y, 700) ? 1 : 0.3);
        e.action = {
          type: 'dash', t: 0, dur, vx: Math.cos(c.facing) * dist / dur, vy: Math.sin(c.facing) * dist / dur,
          onMove(e2, g2, wallHit, moved, expected) {
            for (const s of g2.targets()) {
              if (U.dist(e2, s) > e2.r + s.r + 6) continue;
              const dealt = Ent.damage(g2, s, dmg, e2);
              if (dealt > 0 && !s.dead) {
                const k = U.norm(s.x - e2.x, s.y - e2.y);
                s.action = { type: 'knock', t: 0, dur: 0.18, vx: k.x * 500, vy: k.y * 500 };
                Ent.add(e2, 'recover', 0.9, { mult: 0.5 });
              }
              e2.action = null;
              return;
            }
            if (wallHit && moved < expected * 0.5 && this.t > 0.04) {
              e2.action = null;
              g2.text(e2.x, e2.y - 34, 'CRASH', '#ff4b2b');
              Ent.stun(g2, e2, 0.8, null, true);
              g2.shake(4);
            }
          },
          // Only reached if the dive whiffed: he learns from it.
          onEnd(e2, g2) {
            if (e2.adapt < 5) { e2.adapt++; g2.text(e2.x, e2.y - 48, `ADAPTED ×${e2.adapt}`, '#ff4b2b'); }
          },
        };
      },
    },
    burg_grease: {
      exec(e, game, c) {
        const p = Ent.lob(e, c, 280);
        game.projectiles.push({ kind: 'lob', sub: 'grease', sx: e.x, sy: e.y, tx: p.x, ty: p.y, x: e.x, y: e.y, t: 0, flight: 0.3, owner: e, r: 9, color: '#e8c547' });
        G.Audio.play('sizzle', game.nearPlayer(e.x, e.y, 700) ? 1 : 0.3);
      },
    },

    // ----------------------------------------------------- THE CREAKER
    creak_lash: {
      exec(e, game, c) {
        const sp = 720;
        game.projectiles.push({ kind: 'vine', x: e.x, y: e.y, vx: Math.cos(c.facing) * sp, vy: Math.sin(c.facing) * sp, r: 9, range: 420, trav: 0, owner: e, color: '#3f8f3a' });
        G.Audio.play('creak', game.nearPlayer(e.x, e.y, 700) ? 0.8 : 0.2);
      },
    },
    creak_vines: {
      exec(e, game, c) {
        const p = Ent.lob(e, c, 320);
        const mine = game.zones.filter((z) => z.kind === 'vines' && z.owner === e);
        if (mine.length >= 3) game.zones.splice(game.zones.indexOf(mine[0]), 1);
        game.zones.push({ kind: 'vines', x: p.x, y: p.y, r: 70, t: 45, max: 45, owner: e, seed: Math.random() * 1000 });
        game.burst(p.x, p.y, '#3f8f3a', 14);
      },
    },
    creak_echo: {
      can(e, game) { return game.zones.some((z) => z.kind === 'vines' && z.owner === e); },
      start(e, game) { G.Audio.play('creak'); },
      exec(e, game, c) {
        let best = null, bd = Infinity;
        for (const z of game.zones) {
          if (z.kind !== 'vines' || z.owner !== e) continue;
          const d = Math.hypot(z.x - c.ax, z.y - c.ay);
          if (d < bd) { bd = d; best = z; }
        }
        if (!best) return false;
        game.burst(e.x, e.y, '#bfe9ff', 20);
        e.x = best.x; e.y = best.y;
        game.world.collide(e);
        game.burst(e.x, e.y, '#bfe9ff', 20);
        Ent.add(e, 'recover', 0.4, { mult: 0.6 });
        G.Audio.play('whoosh');
      },
    },

    // --------------------------------------------------- THE REVENGEST
    rev_fork: {
      start(e, game, c) {
        const f = game.forks.find((k) => k.owner === e);
        if (f) {
          c.warp = f;
          c.windup = 0.15;
        } else {
          e.cds.Q = 0.4; // allows the recast warp
        }
      },
      exec(e, game, c) {
        if (c.warp) {
          const f = c.warp;
          game.forks = game.forks.filter((k) => k !== f);
          game.burst(e.x, e.y, '#ff8a1f', 14);
          e.x = f.x; e.y = f.y;
          game.world.collide(e);
          game.burst(e.x, e.y, '#ff8a1f', 18);
          e.cds.Q = e.def.abilities.Q.cd;
          G.Audio.play('whoosh');
          return;
        }
        const sp = 820;
        game.projectiles.push({ kind: 'fork', x: e.x, y: e.y, vx: Math.cos(c.facing) * sp, vy: Math.sin(c.facing) * sp, r: 7, range: 560, trav: 0, owner: e, color: '#ff8a1f', a: c.facing });
        G.Audio.play('swing');
      },
    },
    rev_draw: {
      exec(e, game, c) {
        const { hits, end } = Ent.lineHits(game, e, c.facing, 480, 14, false);
        game.fx.push({ type: 'bolt', x: e.x, y: e.y, a: c.facing, len: hits[0] ? U.dist(e, hits[0]) : end, t: 0, dur: 0.25 });
        G.Audio.play('gunshot', game.nearPlayer(e.x, e.y, 900) ? 1 : 0.4);
        for (const s of hits) {
          if (Ent.damage(game, s, 26 * Ent.dmgMult(e), e) > 0) Ent.add(s, 'slow', 1.2, { mult: 0.6 });
        }
      },
    },
    rev_corrupt: {
      exec(e, game) {
        Ent.add(e, 'corrupt', 6, { mult: 1.22 });
        e.cds.M1 = 0;
        G.Audio.play('glitch');
        game.fx.push({ type: 'ring', x: e.x, y: e.y, r0: 10, r1: 110, t: 0, dur: 0.45, color: '#ff8a1f' });
        game.text(e.x, e.y - 40, 'CORRUPTION', '#ff8a1f');
      },
    },

    // -------------------------------------------------------- Scratchy
    scr_lesson: {
      exec(e, game) {
        for (const s of game.survivors) {
          if (s.dead || U.dist(e, s) > 220) continue;
          Ent.add(s, 'lesson', 8, { mult: 1.12 });
          game.text(s.x, s.y - 30, 'LESSON LEARNED', '#ffab19');
        }
        game.fx.push({ type: 'ring', x: e.x, y: e.y, r0: 10, r1: 220, t: 0, dur: 0.5, color: '#ffab19' });
        G.Audio.play('crown', 0.7);
      },
    },
    scr_charm: {
      exec(e, game, c) {
        const k = game.killer;
        game.fx.push({ type: 'cone', x: e.x, y: e.y, a: c.facing, arc: 1.75, range: 130, t: 0, dur: 0.35, color: '#ffab19' });
        G.Audio.play('heal');
        if (!k.dead && U.dist(e, k) <= 130 + k.r && Math.abs(U.angDiff(c.facing, U.angTo(e, k))) < 0.9 && game.world.los(e.x, e.y, k.x, k.y)) {
          let dur = 2.2;
          if (k.def.id === 'burgers') dur *= 1 - k.adapt * 0.12;
          Ent.add(k, 'charmed', dur, { mult: 0.55 });
          k.cast = null;
          game.text(k.x, k.y - 36, 'CHARMED', '#ffab19');
          e.stats.stuns++;
        } else game.text(e.x, e.y - 26, 'MISS', '#aaa');
      },
    },

    // ------------------------------------------------------ GRIFFPATCH
    griff_stop: {
      exec(e, game, c) {
        const k = game.killer;
        game.fx.push({ type: 'swing', x: e.x, y: e.y, a: c.facing, arc: 1.9, range: 85, t: 0, dur: 0.22, color: '#ffd23f', wide: true });
        G.Audio.play('slam', 0.5);
        if (!k.dead && U.dist(e, k) <= 85 + k.r && Math.abs(U.angDiff(c.facing, U.angTo(e, k))) < 0.95) {
          if (game.finale && game.finale.phase === 'stopped') { game.finaleStrike(); return; }
          if (Ent.stun(game, k, 2.0, e)) e.stats.stuns++;
        } else game.text(e.x, e.y - 26, 'MISS', '#aaa');
      },
    },
    griff_clone: {
      exec(e, game, c) {
        const base = c.facing;
        for (const off of [-0.9, 0.9]) Ent.spawnDecoy(game, e, base + Math.PI + off + U.rand(-0.3, 0.3));
        game.burst(e.x, e.y, '#3d8bff', 16);
        G.Audio.play('glitch', 0.6);
      },
    },

    // ------------------------------------------------------------ NANO
    nano_guard: {
      exec(e) { Ent.add(e, 'shield', 2.5, { mult: 0.65 }); G.Audio.play('block', 0.4); },
    },
    nano_rally: {
      exec(e, game) {
        game.zones.push({ kind: 'rally', x: e.x, y: e.y, r: 130, t: 7, max: 7, owner: e });
        G.Audio.play('crown', 0.6);
        game.text(e.x, e.y - 30, 'RALLY!', '#d9c27a');
      },
    },
  });
})();
