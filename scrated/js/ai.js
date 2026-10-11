// Bot brains for SCRATED. Survivors compile, flee, loop, and support each
// other by class. Hackers hunt, track and combo their kits by class.
(function () {
  const G = window.G;
  const U = G.U;
  const T = G.TILE;
  const Ent = G.Ent;

  const AI = (G.AI = {
    update(e, game, dt) {
      if (e.dead || e.isPlayer) return;
      if (e.decoy) return this.decoy(e, game, dt);
      if (e.team === 'killer') {
        if (game.finale && game.finale.phase !== 'fight') { e.moveInput = { x: 0, y: 0 }; return; }
        this.killer(e, game, dt);
      } else this.survivor(e, game, dt);
    },

    setPath(e, game, x, y, opt = {}) {
      const ai = e.ai;
      opt.team = e.team;
      ai.path = game.world.findPath(e.x, e.y, x, y, opt) || [];
      ai.goal = { x, y };
      ai.pathT = game.time;
    },

    follow(e, game, dt) {
      const ai = e.ai;
      const p = ai.path;
      if (!p || !p.length) { e.moveInput = { x: 0, y: 0 }; return true; }
      while (p.length > 1 && game.world.clearPath(e.x, e.y, p[1].x, p[1].y, e.r) && !this.hazardBetween(game, e, p[1])) p.shift();
      let wp = p[0];
      if (U.dist(e, wp) < 10) {
        p.shift();
        if (!p.length) { e.moveInput = { x: 0, y: 0 }; return true; }
        wp = p[0];
      }
      e.moveInput = U.norm(wp.x - e.x, wp.y - e.y);
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
        if (game.world.hazardCost(Math.floor(x / T), Math.floor(y / T), a.team) > 3) return true;
      }
      return false;
    },
    ready(e, slot) { return e.cds[slot] <= 0 && !e.cast && !e.action && !e.channel; },
    cast(e, game, slot, x, y) {
      e.aim = { x, y };
      return Ent.tryCast(e, slot, game);
    },
    skill(game) { return Math.random() < game.diff.skill; },

    // Clones just run, bouncing off walls.
    decoy(e, game, dt) {
      e.moveInput = { x: Math.cos(e.decoyDir), y: Math.sin(e.decoyDir) };
      e.wantSprint = true;
      e.aim = { x: e.x + e.moveInput.x * 50, y: e.y + e.moveInput.y * 50 };
      if (Math.hypot(e.vx, e.vy) < 40 && e.life < 4.8) e.decoyDir += Math.PI / 2 + U.rand(-0.4, 0.4);
    },

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
      } else if (ai.mode === 'wait') {
        e.moveInput = { x: 0, y: 0 };
        e.wantRepair = false;
      } else {
        e.wantRepair = false;
        this.follow(e, game, dt);
      }
      // Hacked: the controls fight back.
      if (Ent.has(e, 'hacked') && (e.moveInput.x || e.moveInput.y)) {
        const a = Math.atan2(e.moveInput.y, e.moveInput.x) + Math.sin(game.time * 7 + e.id) * 1.6;
        e.moveInput = { x: Math.cos(a), y: Math.sin(a) };
      }
      const k = game.killer;
      if (Ent.has(e, 'shield') && !k.dead) e.aim = { x: k.x, y: k.y };
      else if (!e.cast && (e.moveInput.x || e.moveInput.y) && !e.repairing) e.aim = { x: e.x + e.moveInput.x * 50, y: e.y + e.moveInput.y * 50 };
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
      const heard = k.def.terror > 0 && kdReal < k.def.terror * 0.7;
      if (seen || heard) {
        ai.kx = k.x + (seen ? 0 : U.rand(-40, 40));
        ai.ky = k.y + (seen ? 0 : U.rand(-40, 40));
        ai.kvx = k.vx; ai.kvy = k.vy;
        ai.kt = game.time;
      }
      ai.kSeen = seen;
      ai.kKnown = ai.kt !== undefined && game.time - ai.kt < 3;
      const kd = ai.kKnown ? Math.hypot(ai.kx - e.x, ai.ky - e.y) : Infinity;

      if (game.finale) return this.finaleSurvivor(e, game);

      if (w.dangerAt(e.x, e.y)) {
        const s = w.safeNear(e.x, e.y);
        this.setPath(e, game, s.x, s.y);
        ai.mode = 'hazard';
        return;
      }
      if (w.teleVents.length && seen && kd < 220 && e.ventCd <= 0 && !e.channel) {
        const v = w.teleVents.find((v2) => U.dist(e, v2) < 42 && v2.pair);
        if (v && game.useVent(e)) { ai.mode = 'wait'; return; }
      }

      this.survivorAbilities(e, game, kd, seen);
      if (e.channel) { ai.mode = 'wait'; return; }

      const hpFrac = e.hp / e.maxHp;
      const approaching = ai.kKnown && ((ai.kvx || 0) * (e.x - ai.kx) + (ai.kvy || 0) * (e.y - ai.ky)) > 0;
      let fleeDist = prof.flee * (hpFrac < 0.5 ? 1.35 : 1) * (approaching ? 1.25 : 0.85);
      if (e.def.id === 'nano' && hpFrac > 0.5 && !seen) fleeDist *= 0.7;
      const disabled = Ent.has(k, 'stun') || Ent.has(k, 'charmed');
      const threatened = ai.kKnown && kd < fleeDist && !(disabled && kd > 90);

      if (threatened) return this.flee(e, game, kd);
      if (this.help(e, game, kd)) return;
      if (w.gens.some((g) => !g.done)) return this.repair(e, game, kd);
      return this.evade(e, game);
    },

    flee(e, game, kd) {
      const ai = e.ai;
      const k = game.killer;
      if (ai.kSeen && kd < 90 && k.cast && Math.random() < game.diff.skill) {
        const away = U.norm(e.x - k.x, e.y - k.y);
        const side = Math.random() < 0.5 ? 1 : -1;
        ai.jukeDir = U.norm(away.x * 0.4 - away.y * side, away.y * 0.4 + away.x * side);
        ai.juke = 0.25;
      }
      // Sidestep a charging DESTROY laser or Quickdraw lane.
      if (ai.kSeen && k.cast && ['sc_laser', 'rev_draw', 'creak_lash', 'p2_hack'].includes(k.cast.id) && Math.random() < game.diff.skill) {
        const a = k.cast.facing;
        const rx = e.x - k.x, ry = e.y - k.y;
        const perp = -rx * Math.sin(a) + ry * Math.cos(a);
        const along = rx * Math.cos(a) + ry * Math.sin(a);
        if (along > 0 && Math.abs(perp) < 40) {
          const s = perp >= 0 ? 1 : -1;
          ai.jukeDir = { x: -Math.sin(a) * s, y: Math.cos(a) * s };
          ai.juke = 0.35;
        }
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
        if (ch === 'O' && e.ventCd <= 0) s += 120;
        s -= w.hazardCost(p.tx, p.ty, 'survivor') * 12;
        for (const o of game.survivors) if (o !== e && !o.dead && U.dist(o, p) < 200 && ['nano', 'griffpatch'].includes(o.def.id)) s += 40;
        for (const z of game.zones) if (z.kind === 'rally' && U.dist(z, p) < z.r) s += 120;
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
          // Scratchy likes company (Lesson Plan); the others spread out.
          const crowd = e.def.id === 'scratchy' ? -90 : 200;
          let s = U.dist(e, g) + others * crowd - g.progress * 260;
          if (ai.kKnown) s += Math.max(0, 500 - Math.hypot(g.x - ai.kx, g.y - ai.ky)) * 1.6;
          for (const z of game.zones) if ((z.kind === 'fire' || z.kind === 'vines') && U.dist(z, g) < z.r + 40) s += 400;
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
        if (e.def.id === 'scratchy' && this.ready(e, 'Q')) {
          const mates = game.survivors.filter((s) => s !== e && !s.dead && U.dist(s, e) < 200).length;
          if (mates || Math.random() < 0.15) this.cast(e, game, 'Q', e.x, e.y);
        }
      }
    },

    evade(e, game) {
      const ai = e.ai;
      ai.mode = 'evade';
      if (ai.path.length && game.time - ai.pathT < 5) return;
      const spot = ai.kKnown ? this.pickFleeSpot(e, game) : U.choice(game.world.openTiles);
      this.setPath(e, game, spot.x, spot.y);
    },

    help(e, game, kd) {
      const ai = e.ai;
      const k = game.killer;
      const id = e.def.id;
      ai.urgent = false;
      const allies = game.survivors.filter((s) => s !== e && !s.dead);
      const chased = ai.kKnown ? allies.filter((s) => U.dist(s, { x: ai.kx, y: ai.ky }) < 230) : [];

      if (id === 'nano' && e.hp > e.maxHp * 0.55 && ai.kKnown && !(ai.kSeen && kd < 120 && !this.ready(e, 'Q'))) {
        const ward = chased.filter((s) => U.dist(e, s) < 400).sort((a, b) => a.hp - b.hp)[0];
        if (ward) {
          ai.mode = 'help';
          ai.urgent = true;
          if (U.dist(e, ward) < 120 && this.ready(e, 'E') && this.skill(game)) this.cast(e, game, 'E', e.x, e.y);
          const dir = U.norm(ai.kx - ward.x, ai.ky - ward.y);
          const gx = ward.x + dir.x * 50, gy = ward.y + dir.y * 50;
          if (!ai.path.length || game.time - ai.pathT > 0.4) this.setPath(e, game, gx, gy);
          return true;
        }
      }

      if (id === 'griffpatch' && ai.kKnown && e.hp > e.maxHp * 0.5 && this.ready(e, 'Q') && !Ent.has(k, 'stun')) {
        const ward = chased.find((s) => U.dist(e, s) < 420);
        if (ward && kd > 100) {
          ai.mode = 'help';
          ai.urgent = true;
          if (!ai.path.length || game.time - ai.pathT > 0.4) this.setPath(e, game, ai.kx, ai.ky);
          return true;
        }
      }
      return false;
    },

    survivorAbilities(e, game, kd, seen) {
      const ai = e.ai;
      const k = game.killer;
      if (!ai.kKnown || k.dead || Ent.has(e, 'hacked')) return;
      const approaching = ((k.vx || 0) * (e.x - k.x) + (k.vy || 0) * (e.y - k.y)) > 0;
      const kCasting = !!k.cast;
      const disabled = Ent.has(k, 'stun') || Ent.has(k, 'charmed');
      const sk = this.skill(game);
      switch (e.def.id) {
        case 'scratchy':
          if (seen && kd < 115 && (approaching || kCasting) && !disabled && this.ready(e, 'E') && sk) this.cast(e, game, 'E', k.x + k.vx * 0.1, k.y + k.vy * 0.1);
          else if (seen && kd < 260 && this.ready(e, 'Q') && game.survivors.some((s) => s !== e && !s.dead && U.dist(s, e) < 200)) this.cast(e, game, 'Q', e.x, e.y);
          break;
        case 'griffpatch':
          if (seen && kd < 100 && (approaching || kCasting) && !disabled && this.ready(e, 'Q') && sk) this.cast(e, game, 'Q', k.x + k.vx * 0.15, k.y + k.vy * 0.15);
          else if (seen && kd < 260 && approaching && this.ready(e, 'E') && sk) this.cast(e, game, 'E', k.x, k.y);
          break;
        case 'nano':
          if (seen && kd < 130 && (kCasting || kd < 85) && this.ready(e, 'Q') && sk) this.cast(e, game, 'Q', k.x, k.y);
          else if (seen && kd < 220 && this.ready(e, 'E') && game.survivors.some((s) => s !== e && !s.dead && U.dist(s, e) < 140)) this.cast(e, game, 'E', e.x, e.y);
          break;
      }
    },

    // The last round: the survivors already know how this ends.
    finaleSurvivor(e, game) {
      const ai = e.ai;
      const k = game.killer;
      if (game.finale.phase === 'fight') {
        const kd = U.dist(e, k);
        if (kd < 220) return this.flee(e, game, kd);
        return this.repair(e, game, kd);
      }
      ai.mode = 'watch';
      const d = U.dist(e, k);
      if (d > 160 && (!ai.path.length || game.time - ai.pathT > 1)) this.setPath(e, game, k.x + U.rand(-90, 90), k.y + U.rand(-90, 90));
      else if (d <= 160) { ai.path = []; ai.mode = 'wait'; e.aim = { x: k.x, y: k.y }; }
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

      if (t && !t.dead && ai.mode === 'chase') e.aim = { x: t.x, y: t.y };
      else if (ai.breakTile) e.aim = ai.breakTile;
      else if (e.moveInput.x || e.moveInput.y) e.aim = { x: e.x + e.moveInput.x * 50, y: e.y + e.moveInput.y * 50 };

      const d = t && !t.dead ? U.dist(e, t) : Infinity;
      e.wantSprint = ai.mode === 'chase' ? d > 70 && (e.stamina > 15 || d < 260) : ai.mode === 'hunt' && e.stamina > 50;

      if (ai.mode === 'chase' && t && !t.dead && this.ready(e, 'M1') && Ent.canAct(e)) {
        const m1 = e.def.m1;
        if (d < m1.range + t.r - 4 && game.world.los(e.x, e.y, t.x, t.y)) {
          const err = game.diff.aimErr * U.rand(-1, 1);
          const lead = m1.windup * 0.8;
          const a = U.angTo(e, { x: t.x + t.vx * lead, y: t.y + t.vy * lead }) + err;
          this.cast(e, game, 'M1', e.x + Math.cos(a) * 60, e.y + Math.sin(a) * 60);
        }
      }
      if (ai.breakTile && this.ready(e, 'M1')) this.cast(e, game, 'M1', ai.breakTile.x, ai.breakTile.y);
    },

    targets(game) { return game.targets(); },

    killerThink(e, game) {
      const ai = e.ai;
      const w = game.world;
      ai.breakTile = null;
      ai.direct = false;
      if (Ent.has(e, 'stun')) { ai.lastStun = game.time; return; }
      if (ai.target && ai.target.dead) ai.target = null;

      const visible = game.targets().filter((s) => game.canSee(e, s));
      let target = null, best = Infinity;
      for (const s of visible) {
        let sc = U.dist(e, s) + (s.hp / s.maxHp) * 140;
        if (s === ai.target) sc -= 160;
        if (Ent.has(s, 'shield')) sc += 140;
        if (s.def.id === 'nano') sc += 60;
        if (s.repairing) sc -= 50;
        if (Ent.has(s, 'slow') || Ent.has(s, 'root') || Ent.has(s, 'greased')) sc -= 80;
        if (sc < best) { best = sc; target = s; }
      }

      if (target) {
        if (target !== ai.target) ai.chaseStart = game.time;
        ai.target = target;
        ai.mode = 'chase';
        ai.lastSeen = { x: target.x, y: target.y, vx: target.vx, vy: target.vy, t: game.time };
        const d = U.dist(e, target);
        const px = target.x + target.vx * 0.35, py = target.y + target.vy * 0.35;
        if (d < 260 && (e.flying ? w.los(e.x, e.y, target.x, target.y) : w.clearPath(e.x, e.y, target.x, target.y, e.r)) && !this.hazardBetween(game, e, target)) ai.direct = true;
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
        } else this.patrol(e, game);
        this.idleAbilities(e, game);
      }

      const nxt = ai.path && ai.path[0];
      if (!ai.direct && nxt && w.hasBarricade(nxt.tx, nxt.ty) && U.dist(e, nxt) < 70) ai.breakTile = { x: nxt.x, y: nxt.y };
    },

    patrol(e, game) {
      const ai = e.ai;
      const w = game.world;
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

    lead(e, t, speed, game, extra = 0) {
      const d = U.dist(e, t);
      const tt = d / speed + extra;
      const err = game.diff.aimErr * 40;
      return { x: t.x + t.vx * tt + U.rand(-err, err), y: t.y + t.vy * tt + U.rand(-err, err) };
    },

    // Abilities used while nobody is in sight.
    idleAbilities(e, game) {
      const w = game.world;
      if (e.def.id === 'protocol2' && this.ready(e, 'R') && w.gens.some((g) => !g.done && g.progress > 0.5)) this.cast(e, game, 'R', e.aim.x, e.aim.y);
      if (e.def.id === 'creaker') {
        // Plant vines on terminals that are being worked on.
        if (this.ready(e, 'E')) {
          const g = w.gens.filter((g2) => !g2.done && U.dist(e, g2) < 320 && !game.zones.some((z) => z.kind === 'vines' && U.dist(z, g2) < 110)).sort((a, b) => b.progress - a.progress)[0];
          if (g) this.cast(e, game, 'E', g.x + U.rand(-30, 30), g.y + U.rand(-30, 30));
        }
        // Someone stepped in a far patch: walk through the grief.
        if (this.ready(e, 'R')) {
          for (const s of game.survivors) {
            if (s.dead || !Ent.has(s, 'revealed') || U.dist(e, s) < 450) continue;
            const z = game.zones.find((z2) => z2.kind === 'vines' && z2.owner === e && U.dist(z2, s) < 160);
            if (z) { this.cast(e, game, 'R', z.x, z.y); break; }
          }
        }
      }
    },

    killerAbilities(e, game, t, d) {
      const w = game.world;
      const los = w.los(e.x, e.y, t.x, t.y);
      const sk = this.skill(game);
      switch (e.def.id) {
        case 'sc': {
          if (this.ready(e, 'R') && d < 420 && los && !w.clearPath(e.x, e.y, t.x, t.y, e.r) && sk) { this.cast(e, game, 'R', t.x, t.y); break; }
          if (this.ready(e, 'E') && d > 110 && d < 300 && sk && Math.hypot(t.vx, t.vy) > 60) {
            const p = { x: t.x + t.vx * 0.6, y: t.y + t.vy * 0.6 };
            if (U.dist(e, p) < 300) { this.cast(e, game, 'E', p.x, p.y); break; }
          }
          // Only fire when the target is running down the lane (hard to sidestep) or is pinned.
          if (this.ready(e, 'Q') && d > 150 && d < 560 && los && sk) {
            const dir = U.norm(t.x - e.x, t.y - e.y);
            const sp = Math.hypot(t.vx, t.vy) || 1;
            const along = Math.abs((t.vx * dir.x + t.vy * dir.y) / sp);
            const pinned = Ent.has(t, 'root') || Ent.has(t, 'slow') || t.repairing || sp < 40;
            if (pinned || along > 0.8) {
              const p = { x: t.x + t.vx * 0.35, y: t.y + t.vy * 0.35 };
              if (w.los(e.x, e.y, p.x, p.y)) this.cast(e, game, 'Q', p.x, p.y);
            }
          }
          break;
        }
        case 'protocol2': {
          if (this.ready(e, 'R') && w.gens.some((g) => !g.done && g.progress > 0.55)) { this.cast(e, game, 'R', t.x, t.y); break; }
          if (this.ready(e, 'E') && d > 90 && d < 300 && sk) {
            const p = { x: t.x + t.vx * 0.7, y: t.y + t.vy * 0.7 };
            this.cast(e, game, 'E', p.x, p.y);
            break;
          }
          if (this.ready(e, 'Q') && d > 110 && d < 500 && los && !Ent.has(t, 'hacked') && sk) {
            const p = this.lead(e, t, 760, game, 0.35);
            if (w.clearPath(e.x, e.y, p.x, p.y, 6)) this.cast(e, game, 'Q', p.x, p.y);
          }
          break;
        }
        case 'burgers': {
          const near = game.targets().filter((s) => U.dist(e, s) < 190).length;
          if (this.ready(e, 'Q') && d < 165 && (t.cast || near >= 2 || sk)) { this.cast(e, game, 'Q', t.x, t.y); break; }
          if (this.ready(e, 'R') && d > 130 && d < 280 && Math.hypot(t.vx, t.vy) > 60 && sk) { this.cast(e, game, 'R', t.x + t.vx * 0.8, t.y + t.vy * 0.8); break; }
          if (this.ready(e, 'E') && d > 100 && d < 300 && (Ent.has(t, 'slow') || Ent.has(t, 'greased') || sk)) {
            const p = { x: t.x + t.vx * 0.5, y: t.y + t.vy * 0.5 };
            if (w.clearPath(e.x, e.y, p.x, p.y, e.r)) this.cast(e, game, 'E', p.x, p.y);
          }
          break;
        }
        case 'creaker': {
          if (this.ready(e, 'Q') && d > 90 && d < 400 && los && !Ent.has(t, 'root') && sk) {
            const p = this.lead(e, t, 720, game, 0.45);
            if (w.clearPath(e.x, e.y, p.x, p.y, 8)) { this.cast(e, game, 'Q', p.x, p.y); break; }
          }
          // Plant ahead only when the chase is slipping away.
          if (this.ready(e, 'E') && d > 260 && d < 340 && Math.hypot(t.vx, t.vy) > 60) { this.cast(e, game, 'E', t.x + t.vx * 1.0, t.y + t.vy * 1.0); break; }
          if (this.ready(e, 'R') && d > 450) {
            const z = game.zones.find((z2) => z2.kind === 'vines' && z2.owner === e && U.dist(z2, t) < 200);
            if (z) this.cast(e, game, 'R', z.x, z.y);
          }
          break;
        }
        case 'revengest': {
          const corrupt = Ent.has(e, 'corrupt');
          const fork = game.forks.find((f) => f.owner === e);
          if (fork && !corrupt && U.dist(fork, t) + 80 < d && e.cds.Q <= 0) { this.cast(e, game, 'Q', fork.x, fork.y); break; }
          if (this.ready(e, 'R') && d < 240 && (t.hp < t.maxHp * 0.6 || game.time - (e.ai.chaseStart || game.time) > 5)) { this.cast(e, game, 'R', t.x, t.y); break; }
          if (corrupt) break;
          if (!fork && this.ready(e, 'Q') && d > 200 && d < 540 && los && sk) {
            const dir = U.norm(t.x - e.x, t.y - e.y);
            const p = { x: t.x + t.vx * 0.6 + dir.x * 70, y: t.y + t.vy * 0.6 + dir.y * 70 };
            this.cast(e, game, 'Q', p.x, p.y);
            break;
          }
          if (this.ready(e, 'E') && d > 110 && d < 460 && los && sk) {
            const p = { x: t.x + t.vx * 0.4, y: t.y + t.vy * 0.4 };
            if (w.los(e.x, e.y, p.x, p.y)) this.cast(e, game, 'E', p.x, p.y);
          }
          break;
        }
      }
    },
  });
})();
