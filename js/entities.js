// Entities: creation, movement, effects, damage, stuns and every ability.
(function () {
  const G = window.G;
  const U = G.U;
  const T = G.TILE;
  let nextId = 1;

  const Ent = (G.Ent = {
    create(defId, x, y, isPlayer) {
      const def = G.CHARS[defId];
      const e = {
        id: nextId++, def, team: def.team, name: def.name, isPlayer: !!isPlayer,
        x, y, vx: 0, vy: 0, r: def.r, facing: 0,
        hp: def.hp || 1, maxHp: def.hp || 1, stamina: 100, dead: false,
        cds: { M1: 0, Q: 0, E: 0, R: 0 },
        cast: null, action: null, channel: null, effects: [],
        moveInput: { x: 0, y: 0 }, wantSprint: false, sprinting: false,
        aim: { x: x + 1, y }, wantRepair: false, repairing: null,
        trail: [], ventCd: 0, anim: Math.random() * 10, lastHit: -99, dotAcc: 0,
        stats: { damage: 0, taken: 0, gens: 0, stuns: 0, heals: 0, blocks: 0, hits: 0 },
        ai: { think: Math.random() * 0.3, path: [], mode: 'idle', mem: {} },
      };
      return e;
    },

    // --------------------------------------------------------------- effects
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
        if (e.def.id === 'blitz' && game.survivors.some((s2) => !s2.dead && Ent.has(s2, 'marked') && U.dist(e, s2) < 700)) s *= 1.08;
      }
      return s;
    },
    canAct(e) { return !e.dead && !Ent.has(e, 'stun') && !Ent.has(e, 'rising'); },

    // ----------------------------------------------------------------- casts
    ability(e, slot) { return slot === 'M1' ? e.def.m1 : e.def.abilities[slot]; },
    tryCast(e, slot, game) {
      const ab = Ent.ability(e, slot);
      if (!ab || !Ent.canAct(e) || e.cds[slot] > 0 || e.cast || e.action || e.channel) return false;
      if (Ent.has(e, 'root') && slot !== 'M1') return false;
      const impl = Abilities[ab.id];
      if (impl.can && !impl.can(e, game, ab)) return false;
      if (e.team === 'killer' && slot !== 'M1' && ab.id !== 'mourn_shade' && Ent.has(e, 'shade')) Ent.remove(e, 'shade');
      e.facing = U.angTo(e, e.aim);
      e.cast = { slot, id: ab.id, ab, t: 0, windup: ab.windup, moveMult: ab.moveMult ?? 0.5, facing: e.facing, ax: e.aim.x, ay: e.aim.y };
      e.cds[slot] = ab.cd;
      e.repairing = null;
      if (impl.start) impl.start(e, game, e.cast);
      if (ab.windup <= 0) Ent.finishCast(e, game);
      return true;
    },
    finishCast(e, game) {
      const c = e.cast;
      e.cast = null;
      const ok = Abilities[c.id].exec(e, game, c);
      if (ok === false) e.cds[c.slot] = Math.min(e.cds[c.slot], 1);
    },

    // --------------------------------------------------------- damage/stuns
    damage(game, t, amt, src, opt = {}) {
      if (t.dead || amt <= 0) return 0;
      if (Ent.has(t, 'invuln')) { game.text(t.x, t.y - 26, 'DODGED', '#fff'); return 0; }
      if (src && src.team === 'killer' && Ent.has(t, 'shield') && !opt.unblockable) {
        const a = U.angTo(t, src);
        if (Math.abs(U.angDiff(t.facing, a)) < 1.2) {
          Ent.remove(t, 'shield');
          game.text(t.x, t.y - 28, 'PARRY!', '#9fd0ff');
          G.Audio.play('block');
          game.fx.push({ type: 'ring', x: t.x, y: t.y, r0: 10, r1: 70, t: 0, dur: 0.35, color: '#9fd0ff' });
          t.stats.blocks++;
          if (Ent.stun(game, src, 1.1, t)) t.stats.stuns++;
          return 0;
        }
      }
      const link = Ent.get(t, 'linked');
      if (link && link.by && !link.by.dead && !opt.noLink) {
        const share = amt * 0.5;
        amt -= share;
        Ent.damage(game, link.by, share, src, { noLink: true, cause: opt.cause });
        game.fx.push({ type: 'beam', x: t.x, y: t.y, x2: link.by.x, y2: link.by.y, t: 0, dur: 0.3, color: '#7fb4ff' });
      }
      t.hp -= amt;
      t.lastHit = game.time;
      t.stats.taken += amt;
      if (src) { src.stats.damage += amt; src.stats.hits++; }
      game.text(t.x + U.rand(-8, 8), t.y - 24, '-' + Math.round(amt), opt.dot ? '#ff9a3c' : '#ff4d4d');
      if (!opt.dot) {
        game.burst(t.x, t.y, '#b3122a', 10);
        G.Audio.play('hit', game.nearPlayer(t.x, t.y, 700) ? 1 : 0.3);
        if (t.isPlayer) game.shake(6);
        if (t.team === 'survivor' && t.hp > 0) Ent.add(t, 'hitboost', 1.6, { mult: 1.4 });
        t.channel = null;
        t.repairing = null;
        if (t.cast && t.team === 'survivor') t.cast = null;
      }
      if (src && src.def.id === 'mournveil' && t.team === 'survivor') Ent.add(t, 'revealed', 3);
      if (t.hp <= 0) Ent.kill(game, t, src, opt.cause);
      return amt;
    },
    kill(game, t, src, cause) {
      t.hp = 0;
      t.dead = true;
      t.cast = t.action = t.channel = null;
      t.repairing = null;
      t.effects = [];
      t.deathT = game.time;
      game.burst(t.x, t.y, '#7a0d1a', 30);
      game.burst(t.x, t.y, t.def.color, 14);
      G.Audio.play('death');
      game.feed(`${t.name} was ${cause ? 'killed by ' + cause : 'slain by ' + (src ? src.name : 'the Hollow')}`, '#ff6b6b');
      if (t.isPlayer) game.onPlayerDeath();
    },
    stun(game, k, dur, src, force) {
      if (k.dead) return false;
      if (!force && Ent.has(k, 'rage')) {
        game.text(k.x, k.y - 34, 'RESISTED', '#ff5a1f');
        return false;
      }
      if (Ent.has(k, 'stunGrace')) dur *= 0.5;
      if (k.def.id === 'gravemaul') dur *= 0.8;
      Ent.add(k, 'stun', dur);
      k.cast = null;
      k.action = null;
      Ent.remove(k, 'shade');
      game.text(k.x, k.y - 34, 'STUNNED', '#e6ff4a');
      G.Audio.play('stun');
      if (src && src.def.id === 'juno') Ent.add(src, 'zap', 1.5, { mult: 1.3 });
      return true;
    },
    heal(game, t, amt, by) {
      if (t.dead) return;
      const h = Math.min(amt, t.maxHp - t.hp);
      t.hp += h;
      if (by) by.stats.heals += h;
      game.text(t.x, t.y - 24, '+' + Math.round(h), '#5dff8f');
      for (let i = 0; i < 10; i++) game.particles.push({ x: t.x + U.rand(-14, 14), y: t.y + U.rand(-10, 10), vx: 0, vy: U.rand(-40, -20), t: 0, dur: 0.9, color: '#5dff8f', size: 4, shape: 'plus' });
      G.Audio.play('heal');
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

      // Trail for cosmetics.
      e.trailT = (e.trailT || 0) - dt;
      if (e.trailT <= 0) {
        e.trailT = 0.04;
        e.trail.unshift({ x: e.x, y: e.y, f: e.facing });
        if (e.trail.length > 12) e.trail.pop();
      }

      const stunned = Ent.has(e, 'stun') || Ent.has(e, 'rising');
      if (e.cast && !stunned) {
        e.cast.t += dt;
        e.facing = e.cast.facing;
        if (e.cast.t >= e.cast.windup) Ent.finishCast(e, game);
      }

      // Channels (Rosa's heal, vent crawling).
      if (e.channel) {
        const ch = e.channel;
        const moving = Math.hypot(e.moveInput.x, e.moveInput.y) > 0.1;
        ch.t += dt;
        if (stunned || moving || (ch.target && (ch.target.dead || U.dist(e, ch.target) > 110))) {
          e.channel = null;
          if (ch.type === 'heal') { e.cds.Q = Math.min(e.cds.Q, 3); game.text(e.x, e.y - 26, 'CANCELLED', '#aaa'); }
        } else if (ch.t >= ch.dur) {
          e.channel = null;
          if (ch.type === 'heal') {
            Ent.heal(game, ch.target, 45, e);
            Ent.remove(ch.target, 'slow');
            Ent.remove(ch.target, 'marked');
          } else if (ch.type === 'vent') {
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
        if (a.t >= a.dur) e.action = null;
      } else if (!stunned && !Ent.has(e, 'root') && !e.channel && !(e.repairing && !moving)) {
        const noDrain = Ent.has(e, 'overdrive') || Ent.has(e, 'burst');
        e.sprinting = e.wantSprint && moving && (e.stamina > 1 || noDrain);
        const sp = Ent.speed(e, game);
        vx = e.moveInput.x * sp;
        vy = e.moveInput.y * sp;
        if (e.sprinting && !noDrain) e.stamina -= dt * (e.team === 'killer' ? 12 : 18) * (e.def.staminaDrain || 1);
      } else e.sprinting = false;
      if (!e.sprinting) e.stamina = Math.min(100, e.stamina + dt * (e.team === 'killer' ? 11 : 12) * (e.def.staminaRegen || 1) * (moving ? 0.7 : 1));
      e.stamina = Math.max(0, e.stamina);

      // Conveyor belts.
      const tile = game.world.atPx(e.x, e.y);
      if (tile === '>') vx += 95;
      else if (tile === '<') vx -= 95;

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

      // Facing.
      if (!e.cast && !stunned) {
        const dx = e.aim.x - e.x, dy = e.aim.y - e.y;
        if (dx * dx + dy * dy > 4) e.facing = Math.atan2(dy, dx);
      }

      // Repair.
      e.repairing = null;
      if (e.team === 'survivor' && e.wantRepair && !moving && !e.cast && !e.channel && !stunned) {
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
      if (c === 'F') {
        const cl = w.fireOf.get(ty * w.w + tx);
        if (cl.state === 'burn') {
          if (e.team === 'survivor') {
            e.dotAcc += dt * 30;
            if (e.dotAcc >= 5) { Ent.damage(game, e, e.dotAcc, null, { dot: true, cause: 'the furnace' }); e.dotAcc = 0; }
          } else Ent.add(e, 'slow', 0.4, { mult: 0.55 });
          Ent.add(e, 'burning', 0.5);
        }
      }
      const trap = w.trapAt(tx, ty);
      if (trap && U.dist(e, trap) < 18) {
        trap.armed = false;
        trap.t = 12;
        G.Audio.play('trap', game.nearPlayer(e.x, e.y, 500) ? 1 : 0.3);
        e.cast = null;
        e.action = null;
        if (e.team === 'survivor') {
          Ent.add(e, 'root', 1.6);
          Ent.damage(game, e, 15, null, { cause: 'a bear trap' });
        } else Ent.add(e, 'root', 1.0);
        game.text(e.x, e.y - 30, 'TRAPPED', '#c9c9c9');
      }
    },

    // Arc hit helper for melee.
    arcHit(game, e, range, arc, dmg, facing, onHit) {
      let n = 0;
      for (const s of game.survivors) {
        if (s.dead) continue;
        const d = U.dist(e, s);
        if (d > range + s.r) continue;
        if (d > e.r + s.r + 4 && Math.abs(U.angDiff(facing, U.angTo(e, s))) > arc / 2) continue;
        if (!game.world.los(e.x, e.y, s.x, s.y)) continue;
        const dealt = Ent.damage(game, s, onHit ? onHit(s, dmg) : dmg, e);
        if (dealt > 0) n++;
      }
      return n;
    },
    hitBarricade(game, e, range, facing, all) {
      const w = game.world;
      for (let d = 20; d <= range; d += 14) {
        const x = e.x + Math.cos(facing) * d, y = e.y + Math.sin(facing) * d;
        const tx = Math.floor(x / T), ty = Math.floor(y / T);
        const k = ty * w.w + tx;
        const b = w.barricades.get(k);
        if (b) {
          b.hp -= all ? 99 : 1;
          game.burst(tx * T + 20, ty * T + 20, '#9c6b3a', 8);
          if (b.hp <= 0) { w.barricades.delete(k); game.text(tx * T + 20, ty * T + 10, 'BROKEN', '#d9a066'); }
          return true;
        }
      }
      return false;
    },
    killerOf(game) { return game.killer; },
  });

  // --------------------------------------------------------- ability bodies
  const Abilities = (G.Abilities = {
    m1: {
      exec(e, game, c) {
        const ab = e.def.m1;
        let dmg = ab.damage * (Ent.has(e, 'rage') ? 1.25 : 1);
        if (Ent.has(e, 'shade')) { dmg += 25; Ent.remove(e, 'shade'); game.text(e.x, e.y - 36, 'AMBUSH', '#b98cff'); }
        game.fx.push({ type: 'swing', x: e.x, y: e.y, a: c.facing, arc: ab.arc, range: ab.range, t: 0, dur: 0.18, color: e.def.color2 });
        G.Audio.play('swing', game.nearPlayer(e.x, e.y, 600) ? 1 : 0.3);
        const n = Ent.arcHit(game, e, ab.range, ab.arc, dmg, c.facing);
        if (!n) Ent.hitBarricade(game, e, ab.range, c.facing);
        if (n) Ent.add(e, 'recover', 1.1, { mult: 0.45 });
      },
    },

    // ---- Blitz
    blitz_dash: {
      exec(e, game, c) {
        const od = Ent.has(e, 'overdrive');
        const dist = od ? 300 : 220, dur = 0.22;
        const dmg = (od ? 28 : 20) * (Ent.has(e, 'rage') ? 1.25 : 1);
        G.Audio.play('dash', game.nearPlayer(e.x, e.y, 700) ? 1 : 0.3);
        e.action = {
          type: 'dash', t: 0, dur, vx: Math.cos(c.facing) * dist / dur, vy: Math.sin(c.facing) * dist / dur,
          onMove(e2, g2, wallHit, moved, expected) {
            for (const s of g2.survivors) {
              if (s.dead || U.dist(e2, s) > e2.r + s.r + 6) continue;
              const dealt = Ent.damage(g2, s, dmg, e2);
              if (dealt > 0) Ent.add(e2, 'recover', 0.9, { mult: 0.5 });
              if (dealt > 0 && Ent.has(s, 'marked')) { e2.cds.Q = 1.2; g2.text(e2.x, e2.y - 36, 'REFUND', '#ffcc33'); }
              e2.action = null;
              return;
            }
            if (wallHit && moved < expected * 0.5 && this.t > 0.04) {
              e2.action = null;
              Ent.add(e2, 'stun', 0.55);
              g2.text(e2.x, e2.y - 34, 'CRASH', '#ffcc33');
              g2.shake(4);
            }
          },
        };
      },
    },
    blitz_overdrive: {
      exec(e, game) {
        Ent.add(e, 'overdrive', 4.5, { mult: 1.25 });
        e.stamina = 100;
        G.Audio.play('whoosh');
        game.fx.push({ type: 'ring', x: e.x, y: e.y, r0: 10, r1: 80, t: 0, dur: 0.4, color: '#ff7a1a' });
      },
    },
    blitz_tracer: {
      exec(e, game, c) {
        const sp = 780;
        game.projectiles.push({ kind: 'tracer', x: e.x, y: e.y, vx: Math.cos(c.facing) * sp, vy: Math.sin(c.facing) * sp, r: 7, range: 680, trav: 0, owner: e, color: '#ffcc33' });
        G.Audio.play('swing');
      },
    },

    // ---- Gravemaul
    grave_cleave: {
      exec(e, game, c) {
        const rage = Ent.has(e, 'rage') ? 1.25 : 1;
        game.fx.push({ type: 'swing', x: e.x, y: e.y, a: c.facing, arc: 2.6, range: 88, t: 0, dur: 0.28, color: '#ff5a1f', wide: true });
        G.Audio.play('slam', 0.6);
        Ent.arcHit(game, e, 88, 2.6, 38 * rage, c.facing, (s, d) => {
          if (Ent.has(s, 'slow')) { game.text(s.x, s.y - 40, 'CRUSHED', '#ff5a1f'); return d * 1.5; }
          return d;
        });
        Ent.hitBarricade(game, e, 88, c.facing, true);
        game.shake(5);
        Ent.add(e, 'recover', 0.8, { mult: 0.5 });
      },
    },
    grave_slam: {
      exec(e, game) {
        const R = 145, rage = Ent.has(e, 'rage') ? 1.25 : 1;
        game.fx.push({ type: 'ring', x: e.x, y: e.y, r0: 20, r1: R, t: 0, dur: 0.45, color: '#ff5a1f', fill: true });
        G.Audio.play('slam');
        game.shake(12);
        for (const s of game.survivors) {
          if (s.dead || U.dist(e, s) > R + s.r) continue;
          if (Ent.damage(game, s, 14 * rage, e, { unblockable: true }) > 0 || !Ent.has(s, 'invuln')) Ent.add(s, 'slow', 2.5, { mult: 0.5 });
        }
        const w = game.world;
        for (const [k] of w.barricades) {
          const bx = (k % w.w) * T + 20, by = ((k / w.w) | 0) * T + 20;
          if (Math.hypot(bx - e.x, by - e.y) < R + 20) { w.barricades.delete(k); game.burst(bx, by, '#9c6b3a', 12); }
        }
        game.mines = game.mines.filter((m) => {
          if (U.dist(m, e) < R) { game.burst(m.x, m.y, '#ff8c1a', 8); return false; }
          return true;
        });
      },
    },
    grave_rage: {
      exec(e, game) {
        Ent.add(e, 'rage', 7, { mult: 1.15 });
        Ent.remove(e, 'stun');
        Ent.remove(e, 'slow');
        G.Audio.play('roar');
        game.shake(8);
        game.fx.push({ type: 'ring', x: e.x, y: e.y, r0: 20, r1: 120, t: 0, dur: 0.5, color: '#ff2020' });
        if (!game.player || game.player.team === 'survivor') game.announce('Gravemaul enters BLOODRAGE', '#ff3b3b');
      },
    },

    // ---- Mournveil
    mourn_shade: {
      exec(e, game) {
        Ent.add(e, 'shade', 5.5, { mult: 1.22 });
        game.burst(e.x, e.y, '#b98cff', 18);
        G.Audio.play('whoosh', 0.6);
      },
    },
    mourn_hook: {
      exec(e, game, c) {
        const sp = 740;
        game.projectiles.push({ kind: 'hook', x: e.x, y: e.y, vx: Math.cos(c.facing) * sp, vy: Math.sin(c.facing) * sp, r: 9, range: 440, trav: 0, owner: e, color: '#b98cff' });
        G.Audio.play('swing');
      },
    },
    mourn_dread: {
      exec(e, game) {
        for (const s of game.survivors) if (!s.dead) Ent.add(s, 'revealed', 5);
        game.fx.push({ type: 'ring', x: e.x, y: e.y, r0: 20, r1: 900, t: 0, dur: 1.0, color: '#b98cff' });
        G.Audio.play('heart');
        if (game.player && game.player.team === 'survivor') game.announce('You feel watched…', '#b98cff');
      },
    },

    // ---- Vex
    vex_burst: {
      exec(e, game) {
        Ent.add(e, 'burst', 2.2, { mult: 1.55 });
        e.stamina = Math.min(100, e.stamina + 20);
        G.Audio.play('dash', game.nearPlayer(e.x, e.y, 500) ? 0.7 : 0.2);
      },
    },
    vex_slide: {
      exec(e, game, c) {
        let d = U.norm(e.moveInput.x, e.moveInput.y);
        if (!d.x && !d.y) d = { x: Math.cos(c.facing), y: Math.sin(c.facing) };
        const dur = 0.3;
        e.action = { type: 'slide', t: 0, dur, vx: d.x * 165 / dur, vy: d.y * 165 / dur };
        Ent.add(e, 'invuln', 0.38);
        G.Audio.play('whoosh', game.nearPlayer(e.x, e.y, 500) ? 0.6 : 0.2);
      },
    },

    // ---- Gorran
    gorran_shield: {
      exec(e, game) {
        Ent.add(e, 'shield', 2.6, { mult: 0.65 });
        G.Audio.play('block', 0.4);
      },
    },
    gorran_link: {
      exec(e, game, c) {
        let best = null, bd = Infinity;
        for (const s of game.survivors) {
          if (s === e || s.dead || U.dist(e, s) > 260) continue;
          const d = Math.hypot(s.x - c.ax, s.y - c.ay);
          if (d < bd) { bd = d; best = s; }
        }
        if (!best) { game.text(e.x, e.y - 26, 'NO ALLY', '#aaa'); return false; }
        Ent.add(best, 'linked', 6, { by: e });
        Ent.add(e, 'guarding', 6, { ally: best });
        game.fx.push({ type: 'beam', x: e.x, y: e.y, x2: best.x, y2: best.y, t: 0, dur: 0.4, color: '#7fb4ff' });
        G.Audio.play('block', 0.3);
      },
    },

    // ---- Juno
    juno_flash: {
      exec(e, game, c) {
        let dx = c.ax - e.x, dy = c.ay - e.y;
        const d = Math.hypot(dx, dy);
        if (d > 330) { dx *= 330 / d; dy *= 330 / d; }
        let tx = e.x + dx, ty = e.y + dy;
        // Stop at walls.
        const n = Math.ceil(Math.hypot(dx, dy) / 10);
        for (let i = 1; i <= n; i++) {
          const x = e.x + (dx * i) / n, y = e.y + (dy * i) / n;
          if (game.world.blocksSight(Math.floor(x / T), Math.floor(y / T))) { tx = e.x + (dx * (i - 1)) / n; ty = e.y + (dy * (i - 1)) / n; break; }
        }
        game.projectiles.push({ kind: 'flash', sx: e.x, sy: e.y, tx, ty, x: e.x, y: e.y, t: 0, flight: 0.3, fuse: 0.35, owner: e, r: 6 });
        G.Audio.play('click');
      },
    },
    juno_taser: {
      exec(e, game, c) {
        const k = game.killer;
        game.fx.push({ type: 'zap', x: e.x, y: e.y, a: c.facing, t: 0, dur: 0.25, range: 80 });
        G.Audio.play('zap');
        if (!k.dead && U.dist(e, k) <= 80 + k.r && Math.abs(U.angDiff(c.facing, U.angTo(e, k))) < 0.95) {
          if (Ent.stun(game, k, 2.3, e)) e.stats.stuns++;
        } else game.text(e.x, e.y - 26, 'MISS', '#aaa');
      },
    },

    // ---- Rosa
    rosa_heal: {
      exec(e, game, c) {
        let best = null, bd = Infinity;
        for (const s of game.survivors) {
          if (s.dead || U.dist(e, s) > 85 || s.hp >= s.maxHp) continue;
          const d = Math.hypot(s.x - c.ax, s.y - c.ay) + (s === e ? 30 : 0);
          if (d < bd) { bd = d; best = s; }
        }
        if (!best) { game.text(e.x, e.y - 26, 'NO ONE HURT', '#aaa'); return false; }
        e.channel = { type: 'heal', target: best, t: 0, dur: 2.4 };
      },
    },
    rosa_shot: {
      exec(e, game, c) {
        let best = e, bd = Math.hypot(e.x - c.ax, e.y - c.ay) + 40;
        for (const s of game.survivors) {
          if (s === e || s.dead || U.dist(e, s) > 320) continue;
          const d = Math.hypot(s.x - c.ax, s.y - c.ay);
          if (d < bd) { bd = d; best = s; }
        }
        Ent.add(best, 'adrenal', 3, { mult: 1.4 });
        best.stamina = Math.min(100, best.stamina + 30);
        if (best !== e) game.fx.push({ type: 'beam', x: e.x, y: e.y, x2: best.x, y2: best.y, t: 0, dur: 0.25, color: '#5dff8f' });
        game.text(best.x, best.y - 28, 'ADRENALINE', '#5dff8f');
        G.Audio.play('heal', 0.6);
      },
    },

    // ---- Bolt
    bolt_barricade: {
      exec(e, game, c) {
        const w = game.world;
        const x = e.x + Math.cos(c.facing) * 46, y = e.y + Math.sin(c.facing) * 46;
        const tx = Math.floor(x / T), ty = Math.floor(y / T);
        const ch = w.at(tx, ty);
        const cx = tx * T + T / 2, cy = ty * T + T / 2;
        const blocked = w.isSolidT(tx, ty) || !['.', ',', '='].includes(ch) ||
          game.ents.some((o) => !o.dead && Math.abs(o.x - cx) < T / 2 + o.r - 2 && Math.abs(o.y - cy) < T / 2 + o.r - 2);
        if (blocked) { game.text(e.x, e.y - 26, 'NO ROOM', '#aaa'); return false; }
        w.barricades.set(ty * w.w + tx, { hp: 3, t: 22, max: 22 });
        game.burst(cx, cy, '#d9a066', 10);
        G.Audio.play('build', game.nearPlayer(e.x, e.y, 600) ? 1 : 0.3);
      },
    },
    bolt_mine: {
      exec(e, game) {
        const mine = game.mines.filter((m) => m.owner === e);
        if (mine.length >= 2) game.mines.splice(game.mines.indexOf(mine[0]), 1);
        game.mines.push({ x: e.x, y: e.y, arm: 0.7, owner: e });
        G.Audio.play('click');
      },
    },
  });
})();
