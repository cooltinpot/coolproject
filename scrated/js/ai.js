// Bots for side-view SCRATED. They walk the jump-simulated nav graph (walk,
// jump, fall, drop, climb) and use their kits the way their class should.
(function () {
  const G = window.G;
  const U = G.U;
  const T = G.TILE;
  const Ent = G.Ent;

  const AI = (G.AI = {
    update(e, game, dt) {
      if (e.dead || e.isPlayer) return;
      if (Ent.has(e, 'dying')) { e.input = { mx: 0 }; return; }
      if (e.team === 'killer') {
        if (game.finale && game.finale.phase !== 'fight') { e.input = { mx: 0 }; return; }
        this.killer(e, game, dt);
      } else this.survivor(e, game, dt);
    },

    // ----------------------------------------------------------- pathing
    graph(e, game) { return game.world.graph(e.team, e.w, e.h); },
    here(e, game) {
      if (!e.grounded && !e.climbing) return null;
      return game.world.nodeAt(this.graph(e, game), e.x, e.y, 2);
    },
    plan(e, game, goal, costFn) {
      const ai = e.ai;
      const from = this.here(e, game);
      ai.pathT = game.time;
      if (!from || !goal) { ai.path = null; return false; }
      ai.path = game.world.findPath(this.graph(e, game), from, goal, costFn);
      ai.from = from;
      ai.edgeT = 0;
      ai.air = false;
      return !!ai.path;
    },
    // Turns the current path edge into button presses.
    follow(e, game, dt) {
      const ai = e.ai;
      const I = { mx: 0, up: false, down: false, jump: false, sprint: !!ai.sprint };
      const path = ai.path;
      if (!path || !path.length) { e.input = I; return true; }
      const edge = path[0];
      const n = edge.node;
      ai.edgeT += dt;
      if (ai.edgeT > 3) { ai.path = null; ai.unstick = 0.4; e.input = I; return true; }
      const advance = () => { ai.from = n; path.shift(); ai.edgeT = 0; ai.air = false; };
      // Finish getting off a ladder before doing anything else.
      if (e.climbing && edge.type !== 'climb') { I.down = true; e.input = I; return false; }
      const P = G.PHYS;
      const walkTo = (x, slow) => { const dx = x - e.x; if (Math.abs(dx) > 4) I.mx = Math.sign(dx) * (slow ? 0.5 : 1); return Math.abs(dx); };
      switch (edge.type) {
        case 'walk': {
          const d = walkTo(n.x);
          if (d < 10 && Math.abs(e.y - n.y) < 8) advance();
          else if (e.grounded && Math.abs(e.y - n.y) > T * 1.5) ai.path = null;
          break;
        }
        case 'climb': {
          const lx = n.tx * T + T / 2;
          if (!e.climbing) {
            const d = walkTo(lx, true);
            if (d <= 7) { I.mx = 0; I.up = n.y < e.y - 2; I.down = n.y > e.y + 2; }
            if (Math.abs(e.y - n.y) < 6 && d < 12 && e.grounded) advance();
          } else {
            I.up = n.y < e.y - 2;
            I.down = n.y > e.y + 2;
            if (Math.abs(e.y - n.y) < 7) advance();
          }
          break;
        }
        case 'jump': {
          const from = ai.from || n;
          if (!ai.air) {
            const d = walkTo(from.x, true);
            if (d <= 6 && e.grounded) {
              I.mx = 0; I.jump = true; ai.air = true; ai.airT = 0;
              e.vx = edge.dir * edge.frac * P.refRun;
            } else if (!e.grounded && !e.climbing) { ai.air = true; ai.airT = 0.2; }
          } else {
            ai.airT += dt;
            const sp = Math.max(1, e.def.walk * Ent.speedMult(e));
            I.mx = U.clamp((edge.dir * edge.frac * P.refRun) / sp, -1, 1);
            I.sprint = false;
            if (ai.airT > 0.1 && e.grounded) { if (Math.abs(e.x - n.x) < T && Math.abs(e.y - n.y) < 8) advance(); else ai.path = null; }
          }
          break;
        }
        case 'fall': {
          if (!ai.air) {
            I.mx = edge.dir * 0.75;
            if (!e.grounded) { ai.air = true; ai.airT = 0; }
          } else {
            ai.airT += dt;
            I.mx = U.clamp((n.x - e.x) / 40, -0.75, 0.75);
            if (ai.airT > 0.05 && e.grounded) { if (Math.abs(e.y - n.y) < 8) advance(); else ai.path = null; }
          }
          break;
        }
        case 'drop': {
          if (!ai.air) {
            const from = ai.from || n;
            const d = walkTo(from.x, true);
            if (d < 10) { I.mx = 0; I.down = true; if (!e.grounded) { ai.air = true; ai.airT = 0; } }
          } else {
            ai.airT += dt;
            if (ai.airT > 0.1 && e.grounded) { if (Math.abs(e.y - n.y) < 8) advance(); else ai.path = null; }
          }
          break;
        }
      }
      e.input = I;
      return false;
    },

    // Is there a flat, gap-free run between two points on the same floor?
    sameFloor(game, a, b) {
      if (Math.abs(a.y - b.y) > 20) return false;
      const W = game.world;
      const ty = Math.floor((a.y - 1) / T);
      const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
      for (let x = x0; x <= x1; x += T / 2) {
        const tx = Math.floor(x / T);
        if (W.solidFor(a.team, tx, ty) || W.solidFor(a.team, tx, ty - 1)) return false;
        if (!(W.solidFor(a.team, tx, ty + 1) || W.isOneWay(tx, ty + 1))) return false;
      }
      return true;
    },
    sees(game, a, b) {
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > 950) return false;
      return game.world.los(a.x, a.y - a.h * 0.6, b.x, b.y - b.h * 0.6);
    },
    skill(game) { return Math.random() < game.diff.skill; },
    ready(e, slot) { return e.cds[slot] <= 0 && !e.cast && !e.action && Ent.canAct(e); },
    cast(e, game, slot, ax, ay) {
      if (ax !== undefined) { e.aim = { x: ax, y: ay }; e.facing = ax >= e.x ? 1 : -1; }
      return Ent.tryCast(e, slot, game);
    },

    // ============================================================ SURVIVORS
    survivor(e, game, dt) {
      const ai = e.ai;
      ai.think -= dt;
      if (ai.think <= 0) { ai.think = game.diff.think * U.rand(0.8, 1.2); this.survivorThink(e, game); }
      if (ai.unstick > 0) {
        ai.unstick -= dt;
        e.input = { mx: ai.unstickDir || 1, jump: Math.random() < 0.1 };
        return;
      }
      if (ai.hold) { e.input = { mx: 0 }; return; }
      if (ai.direct !== undefined && ai.direct !== null) {
        e.input = { mx: ai.direct, sprint: ai.sprint, jump: ai.hop };
        ai.hop = false;
      } else this.follow(e, game, dt);
      // Steer rolls: away from the hacker (or through them when cornered).
      if (e.action && e.action.type === 'roll') e.input.mx = ai.rollDir || e.facing;
    },

    survivorThink(e, game) {
      const ai = e.ai;
      const k = game.killer;
      ai.hold = false;
      ai.direct = null;
      if (k.dead) return;
      // Spotting the hacker (THE CREAKER in disguise fools them for a while).
      const sees = this.sees(game, e, k);
      const d = Math.hypot(k.x - e.x, k.y - e.y);
      let known = sees || d < G.CONFIG.terror * 0.6;
      if (k.disguise) {
        const real = game.survivors.find((s) => s.def.id === k.disguise);
        ai.sus = ai.sus || 0;
        if (sees && d < 220) ai.sus += game.diff.think * 0.35 * game.diff.skill * (k.vx * (e.x - k.x) > 0 ? 1.6 : 0.6);
        if (real && real !== e && this.sees(game, e, real) && sees) ai.sus += game.diff.think * 0.9;
        if (real === e && sees && d < 400) ai.sus = 1;
        if (ai.sus >= 1) { if (!k.identified) game.text(e, '"That\'s not ' + real?.name + '!"', '#ffffff'); k.identified = true; }
        else known = false;
      } else ai.sus = 0;
      if (known) { ai.kx = k.x; ai.ky = k.y; ai.kt = game.time; }
      const recent = ai.kt !== undefined && game.time - ai.kt < 3;

      this.survivorAbilities(e, game, k, d, sees && known);
      if (Ent.has(e, 'deflect') || (e.cast && e.cast.ab && e.cast.ab.moveMult === 0)) { ai.hold = true; return; }

      const threat = recent && Math.hypot(ai.kx - e.x, ai.ky - e.y) < (e.hp < e.maxHp * 0.5 ? 560 : 440);
      ai.sprint = threat && (e.stamina > 20 || d < 220);
      if (threat) return this.flee(e, game, k);
      // Calm: drift around the map, loosely grouped, away from where the hacker was.
      ai.sprint = false;
      if (!ai.path || !ai.path.length || game.time - ai.pathT > 6) {
        const g = this.graph(e, game);
        const nodes = [...g.nodes.values()].filter((n) => n.kind === 'ground');
        let best = null, bs = -Infinity;
        for (let i = 0; i < 20; i++) {
          const n = U.choice(nodes);
          let s = -Math.abs(n.x - e.x) * 0.2 + U.rand(0, 200);
          if (recent) s += Math.min(700, Math.hypot(n.x - ai.kx, n.y - ai.ky));
          for (const o of game.survivors) if (o !== e && !o.dead && Math.hypot(o.x - n.x, o.y - n.y) < 300) s += 120;
          if (s > bs) { bs = s; best = n; }
        }
        this.plan(e, game, best);
      }
    },

    flee(e, game, k) {
      const ai = e.ai;
      const W = game.world;
      // Right next to us on the same floor: just run directly away.
      if (this.sameFloor(game, e, k) && Math.abs(k.x - e.x) < 140) {
        const away = Math.sign(e.x - k.x) || 1;
        const wallAhead = W.solidFor('survivor', Math.floor((e.x + away * T * 2) / T), Math.floor((e.y - 1) / T));
        ai.direct = wallAhead ? -away : away;
        ai.hop = wallAhead && Math.random() < 0.6;
        // Jump over a swing.
        if (k.cast && k.cast.id === 'm1' && e.grounded && Math.random() < game.diff.skill * 0.6) ai.hop = true;
        return;
      }
      if (ai.path && ai.path.length && game.time - ai.pathT < 0.9 && ai.mode === 'flee') return;
      ai.mode = 'flee';
      const g = this.graph(e, game);
      const kn = W.nodeAt(g, k.x, k.y, 4);
      const me = this.here(e, game);
      if (!kn || !me) return;
      const dk = W.distances(g, kn, 60);
      const dm = W.distances(g, me, 26);
      let best = null, bs = -Infinity;
      for (const [key, sd] of dm) {
        const n = g.nodes.get(key);
        if (n.kind !== 'ground') continue;
        const kd = dk.get(key) ?? 70;
        const s = kd - sd * 0.45 + (Math.abs(n.x - k.x) > 200 ? 4 : 0) + Math.random() * 2;
        if (s > bs) { bs = s; best = n; }
      }
      this.plan(e, game, best, (n) => (Math.hypot(n.x - k.x, n.y - k.y) < 170 ? 18 : 0));
    },

    survivorAbilities(e, game, k, d, seen) {
      const sk = this.skill(game);
      const same = this.sameFloor(game, e, k) || Math.abs(k.y - e.y) < 30;
      const coming = (k.vx || 0) * (e.x - k.x) > 0;
      switch (e.def.id) {
        case 'scratchy': {
          if (seen && same && d < 150 && (coming || k.cast) && this.ready(e, 'Q') && sk) {
            const away = Math.sign(e.x - k.x) || 1;
            const cornered = game.world.solidFor('survivor', Math.floor((e.x + away * T * 3) / T), Math.floor((e.y - 1) / T));
            e.ai.rollDir = cornered ? -away : away;
            e.facing = e.ai.rollDir;
            Ent.tryCast(e, 'Q', game);
            return;
          }
          if (this.ready(e, 'E') && d > 420) {
            const hurt = game.survivors.find((s) => s !== e && !s.dead && s.def.id !== 'griffpatch' && s.hp < s.maxHp * 0.75 && Math.hypot(s.x - e.x, s.y - e.y) < 90);
            if (hurt || (e.hp < e.maxHp * 0.7 && d > 460)) Ent.tryCast(e, 'E', game);
          }
          break;
        }
        case 'griffpatch': {
          if (!seen || !this.ready(e, 'Q') || Ent.has(k, 'hot') || Ent.has(k, 'immune') || Ent.has(k, 'invuln')) break;
          const dx = k.x - e.x;
          if (Math.abs(k.y - e.y) < 16 && Math.abs(dx) > 30 && Math.abs(dx) < 330 && sk) {
            const dir = Math.sign(dx);
            // Only slam if there is a wall somewhere behind the hacker.
            const ty = Math.floor((e.y - 10) / T);
            let wall = false;
            for (let x = k.x; Math.abs(x - k.x) < 520; x += dir * T) if (game.world.solidFor('survivor', Math.floor(x / T), ty)) { wall = true; break; }
            if (wall) { e.facing = dir; Ent.tryCast(e, 'Q', game); }
          }
          break;
        }
        case 'nano': {
          if (Ent.has(e, 'parried')) { Ent.tryCast(e, 'E', game); break; }
          const threat = k.cast && (k.cast.id === 'm1' || k.cast.id === 'sc_dash' || k.cast.id === 'p2_dash' || k.cast.id === 'creak_reveal');
          if (seen && d < 140 && (threat || (d < 70 && Math.random() < 0.3)) && this.ready(e, 'Q') && sk) Ent.tryCast(e, 'Q', game);
          break;
        }
      }
    },

    // ============================================================== HACKERS
    killer(e, game, dt) {
      const ai = e.ai;
      ai.think -= dt;
      if (ai.think <= 0) { ai.think = game.diff.think * U.rand(0.7, 1.1); this.killerThink(e, game); }
      if (ai.unstick > 0) { ai.unstick -= dt; e.input = { mx: ai.unstickDir || 1, jump: Math.random() < 0.15 }; return; }
      const t = ai.target;
      if (t && !t.dead && ai.direct) {
        const dx = t.x - e.x;
        e.input = { mx: Math.abs(dx) > 18 ? Math.sign(dx) : 0, sprint: Math.abs(dx) > 90 && e.stamina > 10, jump: t.y < e.y - 40 && e.grounded && Math.abs(dx) < 120 };
        e.facing = dx >= 0 ? 1 : -1;
      } else {
        ai.sprint = ai.mode === 'chase' && e.stamina > 15;
        this.follow(e, game, dt);
      }
      // Melee when in reach.
      if (t && !t.dead && this.ready(e, 'M1') && !e.disguise) {
        const reach = Math.max(...e.def.m1.boxes.map((b) => b[0] + b[2])) - 6;
        const dx = t.x - e.x;
        if (Math.abs(dx) < reach && Math.abs((t.y - t.h / 2) - (e.y - e.h / 2)) < 42) { e.facing = dx >= 0 ? 1 : -1; Ent.tryCast(e, 'M1', game); }
      }
      // Stuck check.
      if (Math.abs(e.vx) < 4 && Math.abs(e.input.mx || 0) > 0.3 && !e.cast && !e.action && Ent.canAct(e)) {
        ai.stuck = (ai.stuck || 0) + dt;
        if (ai.stuck > 0.7) { ai.stuck = 0; ai.path = null; ai.unstick = 0.35; ai.unstickDir = -Math.sign(e.input.mx); }
      } else ai.stuck = 0;
    },

    killerThink(e, game) {
      const ai = e.ai;
      const W = game.world;
      if (!Ent.canAct(e) && !e.action) return;
      let target = null, best = Infinity;
      for (const s of game.targets()) {
        const seen = this.sees(game, e, s) || Math.hypot(s.x - e.x, s.y - e.y) < 260;
        if (!seen) continue;
        let sc = Math.abs(s.x - e.x) + Math.abs(s.y - e.y) * 1.8 + (s.hp / s.maxHp) * 120;
        if (s === ai.target) sc -= 180;
        if (Ent.has(s, 'invuln')) sc += 300;
        if (sc < best) { best = sc; target = s; }
      }
      ai.direct = false;
      if (target) {
        ai.target = target;
        ai.mode = 'chase';
        ai.last = { x: target.x, y: target.y, t: game.time };
        ai.direct = this.sameFloor(game, e, target) && Math.abs(target.x - e.x) < 420;
        if (!ai.direct && (!ai.path || !ai.path.length || game.time - ai.pathT > 0.45)) {
          this.plan(e, game, W.nodeAt(this.graph(e, game), target.x, target.y, 4));
        }
        this.killerAbilities(e, game, target);
      } else {
        ai.target = null;
        if (ai.last && game.time - ai.last.t < 5 && ai.mode !== 'patrol') {
          if (ai.mode !== 'hunt') {
            ai.mode = 'hunt';
            if (!this.plan(e, game, W.nodeAt(this.graph(e, game), ai.last.x, ai.last.y, 4))) ai.last = null;
          } else if (!ai.path || !ai.path.length) ai.last = null;
        } else if (!ai.path || !ai.path.length || game.time - ai.pathT > 7) {
          ai.mode = 'patrol';
          // Wander toward where survivors probably are (they make noise).
          const g = this.graph(e, game);
          const al = game.targets();
          const s = U.choice(al);
          const goal = s && Math.random() < 0.7 ? W.nodeAt(g, s.x + U.rand(-200, 200), s.y, 5) : U.choice([...g.nodes.values()]);
          if (!this.plan(e, game, goal)) this.plan(e, game, U.choice([...g.nodes.values()]));
        }
        this.idleAbilities(e, game);
      }
    },

    idleAbilities(e, game) {
      if (e.def.id === 'creaker' && !e.disguise && this.ready(e, 'Q')) this.cast(e, game, 'Q');
      if (e.def.id === 'burgers' && e.ink >= 100 && this.ready(e, 'Q') && e.grounded && (game.world.ladderAt(e) >= 0 || Math.random() < 0.15)) this.cast(e, game, 'Q');
    },

    // Try to find a wall-bounce angle that brings the hook to the target.
    hookAngle(e, game, t) {
      const W = game.world;
      const sx = e.x, sy = e.y - e.h / 2;
      const tx = t.x, ty = t.y - t.h / 2;
      if (W.los(sx, sy, tx, ty)) return Math.atan2(ty - sy, tx - sx);
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * Math.PI * 2;
        let x = sx, y = sy, vx = Math.cos(a) * 12, vy = Math.sin(a) * 12, b = 0;
        for (let s = 0; s < 120 && b <= 4; s++) {
          if (W.blocksSight(Math.floor((x + vx) / T), Math.floor(y / T))) { vx = -vx; b++; } else x += vx;
          if (W.blocksSight(Math.floor(x / T), Math.floor((y + vy) / T))) { vy = -vy; b++; } else y += vy;
          if (Math.hypot(x - tx, y - ty) < 22) return a;
        }
      }
      return null;
    },

    killerAbilities(e, game, t) {
      const sk = this.skill(game);
      const dx = t.x - e.x, dy = t.y - e.y, d = Math.hypot(dx, dy);
      const level = Math.abs(dy) < 26;
      const facing = Math.sign(dx) || 1;
      const sees = this.sees(game, e, t);
      switch (e.def.id) {
        case 'sc':
          if (e.chainT > 0 && level && Math.abs(dx) < 320) { e.facing = facing; Ent.tryCast(e, 'Q', game); break; }
          if (level && Math.abs(dx) > 90 && Math.abs(dx) < 290 && this.ready(e, 'Q') && sk && this.sameFloor(game, e, t)) { e.facing = facing; Ent.tryCast(e, 'Q', game); break; }
          if (sees && d < 520 && d > 120 && this.ready(e, 'E') && sk) this.cast(e, game, 'E', t.x + t.vx * 0.5, t.y - t.h / 2 + t.vy * 0.2);
          break;
        case 'protocol2':
          if (level && Math.abs(dx) > 60 && Math.abs(dx) < 270 && this.ready(e, 'Q') && sk && this.sameFloor(game, e, t)) { e.facing = facing; Ent.tryCast(e, 'Q', game); break; }
          if (d < 650 && d > 110 && this.ready(e, 'E') && sk) {
            const a = this.hookAngle(e, game, t);
            if (a !== null) this.cast(e, game, 'E', e.x + Math.cos(a) * 100, e.y - e.h / 2 + Math.sin(a) * 100);
          }
          break;
        case 'burgers': {
          const threat = game.survivors.some((s) => !s.dead && ((s.def.id === 'griffpatch' && s.cds.Q <= 0 && Math.abs(s.y - e.y) < 20 && Math.abs(s.x - e.x) < 340) || (s.def.id === 'nano' && Ent.has(s, 'deflect') && Math.abs(s.x - e.x) < 120)));
          if (threat && this.ready(e, 'E') && sk) { Ent.tryCast(e, 'E', game); break; }
          if (e.ink >= 100 && this.ready(e, 'Q') && e.grounded && (game.world.ladderAt(e) >= 0 || Math.abs(dx) > 200)) Ent.tryCast(e, 'Q', game);
          break;
        }
        case 'creaker':
          if (e.disguise) {
            if (d < 420 && this.ready(e, 'E') && !game.clones().length) Ent.tryCast(e, 'E', game);
            if ((d < 110 || (e.identified && d < 260)) && level) { e.facing = facing; Ent.tryCast(e, 'R', game); }
          } else {
            if (d < 280 && this.ready(e, 'E') && sk) Ent.tryCast(e, 'E', game);
            if (!this.sees(game, t, e) && d > 500 && this.ready(e, 'Q')) Ent.tryCast(e, 'Q', game);
          }
          break;
        case 'revengest':
          if (Math.abs(dy) < 34 && Math.abs(dx) > 130 && Math.abs(dx) < 1100 && this.ready(e, 'Q') && sk) { e.facing = facing; this.cast(e, game, 'Q', t.x, t.y); break; }
          if (d < 520 && this.ready(e, 'E') && sk) Ent.tryCast(e, 'E', game);
          break;
      }
    },
  });
})();
