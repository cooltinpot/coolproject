// Bot brains. Survivors repair, flee, loop, and use their kit to support each
// other by class. Killers hunt, track, and combo their abilities by class.
(function () {
  const G = window.G;
  const U = G.U;
  const T = G.TILE;
  const Ent = G.Ent;

  const AI = (G.AI = {
    update(e, game, dt) {
      if (e.dead || e.isPlayer) return;
      if (e.team === 'killer') this.killer(e, game, dt);
      else this.survivor(e, game, dt);
    },

    setPath(e, game, x, y, opt) {
      const ai = e.ai;
      ai.path = game.world.findPath(e.x, e.y, x, y, opt) || [];
      ai.goal = { x, y };
      ai.pathT = game.time;
    },

    // Steer along the path; returns true when it is finished.
    follow(e, game, dt) {
      const ai = e.ai;
      const p = ai.path;
      if (!p || !p.length) { e.moveInput = { x: 0, y: 0 }; return true; }
      // Skip ahead when the next-next waypoint is in a straight clear line.
      while (p.length > 1 && game.world.clearPath(e.x, e.y, p[1].x, p[1].y, e.r) && !this.hazardBetween(game, e, p[1])) p.shift();
      let wp = p[0];
      if (U.dist(e, wp) < 10) {
        p.shift();
        if (!p.length) { e.moveInput = { x: 0, y: 0 }; return true; }
        wp = p[0];
      }
      e.moveInput = U.norm(wp.x - e.x, wp.y - e.y);
      // Stuck detection.
      const moved = Math.hypot(e.vx, e.vy);
      if (moved < 15 && !e.cast && !e.action && !Ent.has(e, 'stun') && !Ent.has(e, 'root')) {
        ai.stuck = (ai.stuck || 0) + dt;
        if (ai.stuck > 0.5) {
          ai.stuck = 0;
          ai.path = [];
          ai.nudge = 0.3;
          ai.nudgeDir = U.norm(U.rand(-1, 1), U.rand(-1, 1));
        }
      } else ai.stuck = 0;
      return false;
    },
    hazardBetween(game, a, b) {
      const n = Math.ceil(U.dist(a, b) / 20);
      for (let i = 1; i <= n; i++) {
        const x = a.x + ((b.x - a.x) * i) / n, y = a.y + ((b.y - a.y) * i) / n;
        if (game.world.hazardCost(Math.floor(x / T), Math.floor(y / T)) > 3) return true;
      }
      return false;
    },
    ready(e, slot) { return e.cds[slot] <= 0 && !e.cast && !e.action && !e.channel; },
    cast(e, game, slot, x, y) {
      e.aim = { x, y };
      return Ent.tryCast(e, slot, game);
    },
    skill(game) { return Math.random() < game.diff.skill; },

    // ================================================================ SURVIVOR
    survivor(e, game, dt) {
      const ai = e.ai;
      ai.think -= dt;
      if (ai.think <= 0) {
        ai.think = game.diff.think * U.rand(0.8, 1.25);
        this.survivorThink(e, game);
      }
      if (ai.nudge > 0) {
        ai.nudge -= dt;
        e.moveInput = ai.nudgeDir;
        e.wantRepair = false;
        return;
      }
      if (ai.juke > 0) {
        ai.juke -= dt;
        e.moveInput = ai.jukeDir;
        e.wantRepair = false;
      } else if (ai.mode === 'repair' && ai.gen && U.dist(e, ai.gen) < 58) {
        e.moveInput = { x: 0, y: 0 };
        e.wantRepair = true;
        e.aim = { x: ai.gen.x, y: ai.gen.y };
      } else if (ai.mode === 'wait' || ai.mode === 'healing') {
        e.moveInput = { x: 0, y: 0 };
        e.wantRepair = false;
      } else {
        e.wantRepair = false;
        this.follow(e, game, dt);
      }
      // Face movement unless an ability or shield needs us to face the killer.
      const k = game.killer;
      if (Ent.has(e, 'shield') && !k.dead) e.aim = { x: k.x, y: k.y };
      else if (!e.cast && e.moveInput && (e.moveInput.x || e.moveInput.y) && !e.repairing) e.aim = { x: e.x + e.moveInput.x * 50, y: e.y + e.moveInput.y * 50 };
      const kd = ai.kKnown ? U.dist(e, { x: ai.kx, y: ai.ky }) : Infinity;
      e.wantSprint = (ai.mode === 'flee' && (e.stamina > 25 || kd < 200)) || (ai.mode === 'help' && ai.urgent && e.stamina > 40);
    },

    survivorThink(e, game) {
      const ai = e.ai;
      const k = game.killer;
      const w = game.world;
      const prof = e.def.ai;
      const seen = game.canSee(e, k);
      const kdReal = U.dist(e, k);
      const heard = !Ent.has(k, 'shade') && kdReal < k.def.terror * 0.7;
      if (seen || heard) {
        ai.kx = k.x + (seen ? 0 : U.rand(-40, 40));
        ai.ky = k.y + (seen ? 0 : U.rand(-40, 40));
        ai.kvx = k.vx; ai.kvy = k.vy;
        ai.kt = game.time;
      }
      ai.kSeen = seen;
      ai.kKnown = ai.kt !== undefined && game.time - ai.kt < 3;
      const kd = ai.kKnown ? Math.hypot(ai.kx - e.x, ai.ky - e.y) : Infinity;

      // Being healed: hold still unless the killer shows up.
      const healer = game.survivors.find((s) => s.channel && s.channel.target === e && s !== e);
      if (healer && kd > 260) { ai.mode = 'healing'; return; }

      // Hazards take priority.
      if (w.dangerAt(e.x, e.y)) {
        const s = w.safeNear(e.x, e.y);
        this.setPath(e, game, s.x, s.y);
        ai.mode = 'hazard';
        return;
      }

      // Vents (Station): dive into one if the killer is close.
      if (w.teleVents.length && seen && kd < 220 && e.ventCd <= 0 && !e.channel) {
        const v = w.teleVents.find((v2) => U.dist(e, v2) < 42 && v2.pair);
        if (v && game.useVent(e)) { ai.mode = 'wait'; return; }
      }

      this.survivorAbilities(e, game, kd, seen);
      if (e.channel) { ai.mode = 'wait'; return; }

      const hpFrac = e.hp / e.maxHp;
      const approaching = ai.kKnown && ((ai.kvx || 0) * (e.x - ai.kx) + (ai.kvy || 0) * (e.y - ai.ky)) > 0;
      let fleeDist = prof.flee * (hpFrac < 0.5 ? 1.35 : 1) * (approaching ? 1.25 : 0.85);
      if (e.def.id === 'gorran' && hpFrac > 0.5 && !seen) fleeDist *= 0.7;
      const threatened = ai.kKnown && kd < fleeDist && !(Ent.has(k, 'stun') && kd > 90);

      if (threatened) return this.flee(e, game, kd);
      if (this.help(e, game, kd)) return;
      if (w.gens.some((g) => !g.done)) return this.repair(e, game, kd);
      return this.evade(e, game);
    },

    flee(e, game, kd) {
      const ai = e.ai;
      const k = game.killer;
      // Juke a telegraphed swing at close range.
      if (ai.kSeen && kd < 90 && k.cast && Math.random() < game.diff.skill) {
        const away = U.norm(e.x - k.x, e.y - k.y);
        const side = Math.random() < 0.5 ? 1 : -1;
        ai.jukeDir = U.norm(away.x * 0.4 - away.y * side, away.y * 0.4 + away.x * side);
        ai.juke = 0.25;
      }
      if (ai.mode !== 'flee' || game.time - (ai.fleeT || 0) > 0.75 || !ai.path.length) {
        ai.mode = 'flee';
        ai.fleeT = game.time;
        const spot = this.pickFleeSpot(e, game);
        const kx = ai.kx, ky = ai.ky;
        this.setPath(e, game, spot.x, spot.y, {
          costFn: (tx, ty) => {
            const d = Math.hypot(tx * T + 20 - kx, ty * T + 20 - ky);
            return d < 280 ? (280 - d) / 14 : 0;
          },
        });
      }
    },

    pickFleeSpot(e, game) {
      const ai = e.ai;
      const w = game.world;
      const k = { x: ai.kx, y: ai.ky };
      const toK = U.norm(k.x - e.x, k.y - e.y);
      let best = null, bs = -Infinity;
      for (let i = 0; i < 36; i++) {
        const p = U.choice(w.openTiles);
        const dS = U.dist(e, p);
        if (dS < 140 || dS > 620) continue;
        const dK = U.dist(p, k);
        const dir = U.norm(p.x - e.x, p.y - e.y);
        let s = dK - dS * 0.35 - (dir.x * toK.x + dir.y * toK.y) * 240;
        if (!w.los(p.x, p.y, k.x, k.y)) s += 110;
        const ch = w.at(p.tx, p.ty);
        if (ch === ',') s += 90;
        if (ch === 'O' && e.ventCd <= 0) s += 120;
        s -= w.hazardCost(p.tx, p.ty) * 12;
        // Friends nearby help (Gorran / Juno can cover), but not someone already being chased.
        for (const o of game.survivors) if (o !== e && !o.dead && U.dist(o, p) < 200 && ['gorran', 'juno'].includes(o.def.id)) s += 40;
        if (s > bs) { bs = s; best = p; }
      }
      return best || { x: e.x - toK.x * 200, y: e.y - toK.y * 200 };
    },

    repair(e, game, kd) {
      const ai = e.ai;
      const gens = game.world.gens.filter((g) => !g.done);
      if (!ai.gen || ai.gen.done || game.time - (ai.genT || -99) > 9) {
        let best = null, bs = Infinity;
        for (const g of gens) {
          const others = game.survivors.filter((s) => s !== e && !s.dead && s.ai.gen === g).length;
          let s = U.dist(e, g) + others * (e.def.id === 'bolt' ? 120 : 220) - g.progress * 260;
          if (ai.kKnown) s += Math.max(0, 500 - Math.hypot(g.x - ai.kx, g.y - ai.ky)) * 1.6;
          if (s < bs) { bs = s; best = g; }
        }
        ai.gen = best;
        ai.genT = game.time;
      }
      if (!ai.gen) return;
      ai.mode = 'repair';
      if (U.dist(e, ai.gen) > 56) {
        if (!ai.path.length || game.time - ai.pathT > 2.5) this.setPath(e, game, ai.gen.x, ai.gen.y);
      } else {
        ai.path = [];
        // Bolt mines the approach to his generator.
        if (e.def.id === 'bolt' && this.ready(e, 'E') && !game.mines.some((m) => U.dist(m, ai.gen) < 120) && kd > 400) this.cast(e, game, 'E', e.x, e.y);
      }
    },

    evade(e, game) {
      const ai = e.ai;
      ai.mode = 'evade';
      if (ai.path.length && game.time - ai.pathT < 5) return;
      const spot = ai.kKnown ? this.pickFleeSpot(e, game) : U.choice(game.world.openTiles);
      this.setPath(e, game, spot.x, spot.y);
    },

    // Class support behaviors. Returns true if it took control this tick.
    help(e, game, kd) {
      const ai = e.ai;
      const k = game.killer;
      const id = e.def.id;
      ai.urgent = false;
      const allies = game.survivors.filter((s) => s !== e && !s.dead);
      const chased = ai.kKnown ? allies.filter((s) => U.dist(s, { x: ai.kx, y: ai.ky }) < 230) : [];

      if (id === 'rosa') {
        // Rescue dart for a chased ally.
        const victim = chased.sort((a, b) => a.hp - b.hp)[0];
        if (victim && U.dist(e, victim) < 300 && this.ready(e, 'E') && this.skill(game)) this.cast(e, game, 'E', victim.x, victim.y);
        // Heal the most hurt ally away from the killer.
        const safe = (s) => !ai.kKnown || Math.hypot(s.x - ai.kx, s.y - ai.ky) > 300;
        const hurt = [e, ...allies].filter((s) => s.hp < s.maxHp * 0.72 && safe(s)).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
        if (hurt && (e.cds.Q < 1.5)) {
          if (hurt === e || U.dist(e, hurt) < 70) {
            if (this.ready(e, 'Q')) { this.cast(e, game, 'Q', hurt.x, hurt.y); ai.mode = 'wait'; ai.path = []; return true; }
          } else if (U.dist(e, hurt) < 900) {
            ai.mode = 'help';
            if (!ai.path.length || game.time - ai.pathT > 0.8) this.setPath(e, game, hurt.x, hurt.y);
            return true;
          }
        }
      }

      if (id === 'gorran' && e.hp > e.maxHp * 0.6 && ai.kKnown && !(ai.kSeen && kd < 120 && !this.ready(e, 'Q'))) {
        const ward = chased.filter((s) => U.dist(e, s) < 380).sort((a, b) => a.hp - b.hp)[0];
        if (ward) {
          ai.mode = 'help';
          ai.urgent = true;
          if (U.dist(e, ward) < 240 && this.ready(e, 'E') && !Ent.has(ward, 'linked')) this.cast(e, game, 'E', ward.x, ward.y);
          // Stand between the killer and the ward.
          const dir = U.norm(ai.kx - ward.x, ai.ky - ward.y);
          const gx = ward.x + dir.x * 50, gy = ward.y + dir.y * 50;
          if (!ai.path.length || game.time - ai.pathT > 0.4) this.setPath(e, game, gx, gy);
          return true;
        }
      }

      if (id === 'juno' && ai.kKnown && (this.ready(e, 'Q') || this.ready(e, 'E')) && !Ent.has(k, 'rage') && !Ent.has(k, 'stun')) {
        const ward = chased.find((s) => U.dist(e, s) < 500);
        if (ward && kd > 120) {
          ai.mode = 'help';
          ai.urgent = true;
          // Approach to throwing range without walking into the killer's face.
          const dir = U.norm(e.x - ai.kx, e.y - ai.ky);
          const gx = ai.kx + dir.x * 220, gy = ai.ky + dir.y * 220;
          if (!ai.path.length || game.time - ai.pathT > 0.5) this.setPath(e, game, gx, gy);
          return true;
        }
      }

      if (id === 'vex' && ai.kKnown && e.hp > e.maxHp * 0.6) {
        // Bait: pull the killer off a badly hurt ally.
        const victim = chased.find((s) => s.hp < s.maxHp * 0.45 && U.dist(e, s) < 450);
        if (victim && kd > 160) {
          ai.mode = 'help';
          ai.urgent = true;
          if (!ai.path.length || game.time - ai.pathT > 0.5) this.setPath(e, game, ai.kx, ai.ky);
          return true;
        }
      }
      return false;
    },

    // Reactive kit usage with proper respect for windups.
    survivorAbilities(e, game, kd, seen) {
      const ai = e.ai;
      const k = game.killer;
      if (!ai.kKnown || k.dead) return;
      const approaching = ((k.vx || 0) * (e.x - k.x) + (k.vy || 0) * (e.y - k.y)) > 0;
      const kCasting = !!k.cast;
      const kStunned = Ent.has(k, 'stun');
      const kRage = Ent.has(k, 'rage');
      const sk = this.skill(game);
      switch (e.def.id) {
        case 'vex':
          if (seen && kd < 120 && kCasting && this.ready(e, 'E') && sk) {
            const away = U.norm(e.x - k.x, e.y - k.y);
            const side = Math.random() < 0.5 ? 1 : -1;
            e.moveInput = U.norm(away.x * 0.5 - away.y * side, away.y * 0.5 + away.x * side);
            this.cast(e, game, 'E', e.x + e.moveInput.x * 50, e.y + e.moveInput.y * 50);
          } else if (seen && kd < 160 && approaching && this.ready(e, 'Q') && !kStunned) this.cast(e, game, 'Q', e.aim.x, e.aim.y);
          break;
        case 'gorran':
          if (seen && kd < 130 && (kCasting || kd < 85) && this.ready(e, 'Q') && !kRage && sk) this.cast(e, game, 'Q', k.x, k.y);
          break;
        case 'juno':
          if (kStunned || kRage) break;
          if (seen && kd < 95 && approaching && this.ready(e, 'E') && sk) this.cast(e, game, 'E', k.x + k.vx * 0.15, k.y + k.vy * 0.15);
          else if ((seen || Ent.has(k, 'revealed')) && kd > 100 && kd < 340 && this.ready(e, 'Q') && sk) {
            const err = (1 - game.diff.skill) * 60;
            this.cast(e, game, 'Q', k.x + k.vx * 0.8 + U.rand(-err, err), k.y + k.vy * 0.8 + U.rand(-err, err));
          }
          break;
        case 'rosa':
          if (seen && kd < 170 && e.hp < e.maxHp * 0.6 && this.ready(e, 'E')) this.cast(e, game, 'E', e.x, e.y);
          break;
        case 'bolt':
          if (seen && kd > 110 && kd < 250 && approaching && this.ready(e, 'Q') && sk) this.cast(e, game, 'Q', k.x, k.y);
          else if (seen && kd > 120 && kd < 330 && approaching && this.ready(e, 'E')) this.cast(e, game, 'E', e.x, e.y);
          break;
      }
    },

    // ================================================================== KILLER
    killer(e, game, dt) {
      const ai = e.ai;
      ai.think -= dt;
      if (ai.think <= 0) {
        ai.think = game.diff.think * U.rand(0.7, 1.1);
        this.killerThink(e, game);
      }
      const t = ai.target;
      if (ai.nudge > 0) {
        ai.nudge -= dt;
        e.moveInput = ai.nudgeDir;
      } else if (ai.breakTile) {
        e.moveInput = { x: 0, y: 0 };
      } else if (ai.direct && t && !t.dead) {
        const px = t.x + t.vx * 0.25, py = t.y + t.vy * 0.25;
        e.moveInput = U.norm(px - e.x, py - e.y);
        if (U.dist(e, t) < e.r + t.r + 2) e.moveInput = { x: 0, y: 0 };
      } else this.follow(e, game, dt);

      // Aim.
      if (t && !t.dead && ai.mode === 'chase') e.aim = { x: t.x, y: t.y };
      else if (ai.breakTile) e.aim = ai.breakTile;
      else if (e.moveInput.x || e.moveInput.y) e.aim = { x: e.x + e.moveInput.x * 50, y: e.y + e.moveInput.y * 50 };

      const d = t && !t.dead ? U.dist(e, t) : Infinity;
      e.wantSprint = ai.mode === 'chase' ? d > 70 && (e.stamina > 15 || d < 260) : ai.mode === 'hunt' && e.stamina > 50;

      // Fast-reaction melee.
      if (ai.mode === 'chase' && t && !t.dead && this.ready(e, 'M1') && !Ent.has(e, 'stun')) {
        const m1 = e.def.m1;
        if (d < m1.range + t.r - 4 && game.world.los(e.x, e.y, t.x, t.y)) {
          if (e.def.id === 'gravemaul' && this.ready(e, 'Q') && d < 84 && (Ent.has(t, 'slow') || Ent.has(t, 'root'))) {
            this.cast(e, game, 'Q', t.x, t.y);
          } else {
            const err = game.diff.aimErr * U.rand(-1, 1);
            const lead = m1.windup * 0.8;
            const a = U.angTo(e, { x: t.x + t.vx * lead, y: t.y + t.vy * lead }) + err;
            this.cast(e, game, 'M1', e.x + Math.cos(a) * 60, e.y + Math.sin(a) * 60);
          }
        }
      }
      if (ai.breakTile && this.ready(e, 'M1')) {
        if (e.def.id === 'gravemaul' && this.ready(e, 'E')) this.cast(e, game, 'E', ai.breakTile.x, ai.breakTile.y);
        else this.cast(e, game, 'M1', ai.breakTile.x, ai.breakTile.y);
      }
    },

    killerThink(e, game) {
      const ai = e.ai;
      const w = game.world;
      ai.breakTile = null;
      ai.direct = false;
      if (Ent.has(e, 'stun')) { ai.lastStun = game.time; return; }

      const visible = game.survivors.filter((s) => !s.dead && game.canSee(e, s));
      for (const s of visible) ai.mem[s.id] = { x: s.x, y: s.y, vx: s.vx, vy: s.vy, t: game.time };

      // Target selection with stickiness.
      let target = null, best = Infinity;
      for (const s of visible) {
        let sc = U.dist(e, s) + (s.hp / s.maxHp) * 140;
        if (s === ai.target) sc -= 160;
        if (Ent.has(s, 'shield')) sc += 140;
        if (s.def.id === 'gorran') sc += 60;
        if (Ent.has(s, 'marked')) sc -= 90;
        if (s.repairing) sc -= 50;
        if (Ent.has(s, 'slow') || Ent.has(s, 'root')) sc -= 80;
        if (sc < best) { best = sc; target = s; }
      }

      if (target) {
        if (target !== ai.target) ai.chaseStart = game.time;
        ai.target = target;
        ai.mode = 'chase';
        ai.lastSeen = { x: target.x, y: target.y, vx: target.vx, vy: target.vy, t: game.time };
        const d = U.dist(e, target);
        const px = target.x + target.vx * 0.35, py = target.y + target.vy * 0.35;
        if (d < 260 && w.clearPath(e.x, e.y, target.x, target.y, e.r) && !this.hazardBetween(game, e, target)) ai.direct = true;
        else if (!ai.path.length || game.time - ai.pathT > 0.35) this.setPath(e, game, px, py, { breakable: true, hazardScale: 0.6 });
        this.killerAbilities(e, game, target, d);
      } else {
        ai.target = null;
        const ls = ai.lastSeen;
        if (ls && game.time - ls.t < 4.5) {
          if (ai.mode !== 'hunt') {
            ai.mode = 'hunt';
            const gx = U.clamp(ls.x + ls.vx * 1.2, 40, w.pw - 40), gy = U.clamp(ls.y + ls.vy * 1.2, 40, w.ph - 40);
            this.setPath(e, game, gx, gy, { breakable: true });
          } else if (!ai.path.length) {
            const p = U.choice(w.openTiles.filter((o) => U.dist(o, ls) < 260)) || U.choice(w.openTiles);
            this.setPath(e, game, p.x, p.y, { breakable: true });
          }
        } else {
          this.patrol(e, game);
        }
        // Mournveil: reveal everyone when the trail goes cold.
        if (e.def.id === 'mournveil' && this.ready(e, 'R') && (!ls || game.time - ls.t > 3)) this.cast(e, game, 'R', e.aim.x, e.aim.y);
      }

      // Barricade in the way?
      const nxt = ai.path && ai.path[0];
      if (!ai.direct && nxt && w.hasBarricade(nxt.tx, nxt.ty) && U.dist(e, nxt) < 70) ai.breakTile = { x: nxt.x, y: nxt.y };
      if (ai.direct && target) {
        const a = U.angTo(e, target);
        const tx = Math.floor((e.x + Math.cos(a) * 40) / T), ty = Math.floor((e.y + Math.sin(a) * 40) / T);
        if (w.hasBarricade(tx, ty)) ai.breakTile = { x: tx * T + 20, y: ty * T + 20 };
      }
    },

    patrol(e, game) {
      const ai = e.ai;
      const w = game.world;
      // Listen for generators being repaired.
      let noise = null, nd = Infinity;
      for (const s of game.survivors) {
        if (s.dead) continue;
        const d = U.dist(e, s);
        const loud = (s.repairing && d < 700) || (s.hp < s.maxHp * 0.5 && d < 280) || (s.sprinting && d < 220);
        if (loud && d < nd) { nd = d; noise = s.repairing ? s.repairing : { x: s.x, y: s.y }; }
      }
      if (noise) {
        if (ai.mode !== 'investigate' || !ai.path.length || U.dist(ai.goal || noise, noise) > 80) {
          ai.mode = 'investigate';
          this.setPath(e, game, noise.x, noise.y, { breakable: true });
        }
        return;
      }
      if (ai.mode === 'patrol' && ai.path.length) return;
      ai.mode = 'patrol';
      ai.visited = ai.visited || {};
      const gens = w.gens.filter((g) => !g.done);
      let goal = null, bs = -Infinity;
      for (const g of gens) {
        const s = g.progress * 400 - U.dist(e, g) * 0.4 - (game.time - (ai.visited[g.id] ?? -99) < 18 ? 500 : 0) + U.rand(0, 120);
        if (s > bs) { bs = s; goal = g; }
      }
      if (goal && bs > -300) {
        ai.visited[goal.id] = game.time;
        this.setPath(e, game, goal.x, goal.y, { breakable: true });
      } else {
        const p = U.choice(w.openTiles);
        this.setPath(e, game, p.x, p.y, { breakable: true });
      }
    },

    lead(e, t, speed, game) {
      const d = U.dist(e, t);
      const tt = d / speed;
      const err = game.diff.aimErr * 40;
      return { x: t.x + t.vx * tt + U.rand(-err, err), y: t.y + t.vy * tt + U.rand(-err, err) };
    },

    killerAbilities(e, game, t, d) {
      const w = game.world;
      const los = w.los(e.x, e.y, t.x, t.y);
      const sk = this.skill(game);
      switch (e.def.id) {
        case 'blitz': {
          const od = Ent.has(e, 'overdrive');
          if (d > 300 && d < 660 && los && !Ent.has(t, 'marked') && this.ready(e, 'R') && sk) {
            const p = this.lead(e, t, 780, game);
            if (w.clearPath(e.x, e.y, p.x, p.y, 6)) { this.cast(e, game, 'R', p.x, p.y); break; }
          }
          if (d > 170 && this.ready(e, 'E') && !od) { this.cast(e, game, 'E', t.x, t.y); break; }
          const range = od ? 300 : 220;
          if (d > 90 && d < range * 0.95 && this.ready(e, 'Q') && sk) {
            const p = { x: t.x + t.vx * 0.35, y: t.y + t.vy * 0.35 };
            if (w.clearPath(e.x, e.y, p.x, p.y, e.r)) this.cast(e, game, 'Q', p.x, p.y);
          }
          break;
        }
        case 'gravemaul': {
          const supportNear = game.survivors.some((s) => !s.dead && ['juno', 'gorran'].includes(s.def.id) && U.dist(e, s) < 320);
          const recentlyStunned = game.time - (e.ai.lastStun || -99) < 5;
          const longChase = game.time - (e.ai.chaseStart || game.time) > 4;
          if (this.ready(e, 'R') && d < 300 && (supportNear || recentlyStunned || longChase || t.def.id === 'gorran')) { this.cast(e, game, 'R', t.x, t.y); break; }
          const near = game.survivors.filter((s) => !s.dead && U.dist(e, s) < 135).length;
          if (this.ready(e, 'E') && (near >= 2 || (d < 115 && !Ent.has(t, 'slow') && sk))) { this.cast(e, game, 'E', t.x, t.y); break; }
          if (this.ready(e, 'Q') && d < 84 && (Ent.has(t, 'slow') || Ent.has(t, 'root') || (sk && Math.random() < 0.3))) this.cast(e, game, 'Q', t.x + t.vx * 0.3, t.y + t.vy * 0.3);
          break;
        }
        case 'mournveil': {
          const shaded = Ent.has(e, 'shade');
          if (!shaded && d > 240 && this.ready(e, 'Q') && !game.canSee(t, e)) { this.cast(e, game, 'Q', t.x, t.y); break; }
          if (!shaded && d > 110 && d < 430 && los && this.ready(e, 'E') && sk) {
            const p = this.lead(e, t, 740, game);
            if (w.clearPath(e.x, e.y, p.x, p.y, 8)) this.cast(e, game, 'E', p.x, p.y);
          }
          if (!shaded && d > 240 && this.ready(e, 'Q')) this.cast(e, game, 'Q', t.x, t.y);
          break;
        }
      }
    },
  });
})();
