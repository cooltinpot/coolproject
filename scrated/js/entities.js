// Entities for side-view SCRATED: physics, status effects, damage, hitboxes
// and every hacker / survivor ability from the SCRATED Bible.
(function () {
  const G = window.G;
  const U = G.U;
  const T = G.TILE;
  const P = G.PHYS;
  let nextId = 1;

  const SLOW = G.TIERS.slow, SPEED = G.TIERS.speed;

  const Ent = (G.Ent = {
    create(defId, x, y, isPlayer) {
      const def = G.CHARS[defId];
      const e = {
        id: nextId++, def, team: def.team, name: def.name, isPlayer: !!isPlayer,
        x, y, w: def.w, h: def.h, vx: 0, vy: 0, facing: 1,
        hp: def.hp, maxHp: def.maxHp || def.hp, stamina: 100, dead: false,
        grounded: false, climbing: false, drop: 0, coyote: 0,
        input: { mx: 0, up: false, down: false, jump: false, sprint: false },
        aim: { x: x + 100, y: y - 30 },
        cds: { M1: 0, Q: 0, E: 0, R: 0 },
        cast: null, action: null, effects: [],
        anim: { name: 'idle', t: 0, lock: 0 }, flash: 0, idleT: 0,
        stats: { damage: 0, taken: 0, hits: 0, stuns: 0, kills: 0, parries: 0 },
        ai: { think: Math.random() * 0.3, path: null, mode: 'idle' },
        armor: 0, ink: 0, disguise: null, chainT: 0,
      };
      if (defId === 'scratchy') { e.maxHp = 100; e.hp = U.randInt(80, 90); }
      e.startHp = e.hp;
      return e;
    },

    // ----------------------------------------------------------- effects
    add(e, type, t, data = {}) {
      const ex = e.effects.find((f) => f.type === type);
      if (ex) {
        Object.assign(ex, data);
        ex.t = Math.max(ex.t, t);
        ex.max = Math.max(ex.max || 0, t);
        return ex;
      }
      const f = Object.assign({ type, t, max: t }, data);
      e.effects.push(f);
      return f;
    },
    has(e, type) { return e.effects.some((f) => f.type === type); },
    get(e, type) { return e.effects.find((f) => f.type === type); },
    remove(e, type) { e.effects = e.effects.filter((f) => f.type !== type); },
    // Slowness I-IV / Speed I-II: the strongest of each applies.
    slow(e, lvl, t) { const f = Ent.get(e, 'slow' + lvl); return Ent.add(e, 'slow' + lvl, t, { lvl, kind: 'slow' }) || f; },
    fast(e, lvl, t) { return Ent.add(e, 'speed' + lvl, t, { lvl, kind: 'speed' }); },
    speedMult(e) {
      let s = 1, f = 1;
      for (const x of e.effects) {
        if (x.kind === 'slow') s = Math.min(s, SLOW[x.lvl]);
        if (x.kind === 'speed') f = Math.max(f, SPEED[x.lvl]);
      }
      return s * f;
    },
    stunned(e) { return Ent.has(e, 'stun') || Ent.has(e, 'stub') || Ent.has(e, 'rising') || Ent.has(e, 'dying'); },
    canAct(e) { return !e.dead && !Ent.stunned(e) && !Ent.has(e, 'carried'); },

    center(e) { return { x: e.x, y: e.y - e.h / 2 }; },
    box(e) { return { x0: e.x - e.w / 2, x1: e.x + e.w / 2, y0: e.y - e.h, y1: e.y }; },
    circleHits(cx, cy, r, e) {
      const b = Ent.box(e);
      const nx = U.clamp(cx, b.x0, b.x1), ny = U.clamp(cy, b.y0, b.y1);
      return (cx - nx) ** 2 + (cy - ny) ** 2 <= r * r;
    },
    overlap(a, b, pad = 0) {
      return Math.abs(a.x - b.x) < (a.w + b.w) / 2 + pad && a.y - a.h < b.y + pad && b.y - b.h < a.y + pad;
    },

    // ------------------------------------------------------------- casting
    ability(e, slot) { return slot === 'M1' ? e.def.m1 : e.def.abilities[slot]; },
    tryCast(e, slot, game) {
      // SC: chain a second CORRUPTED DASH after a hit.
      if (slot === 'Q' && e.def.id === 'sc' && e.chainT > 0 && !e.action && Ent.canAct(e)) {
        e.chainT = 0;
        e.cast = { slot, id: 'sc_dash', ab: e.def.abilities.Q, t: 0, windup: 0.06, moveMult: 0.3, chain: true };
        game.sound('sc_charge', e, 0.6);
        return true;
      }
      // NANO: the counter punch only exists right after a parry.
      if (slot === 'E' && e.def.id === 'nano') {
        if (!Ent.has(e, 'parried')) return false;
        return Abilities.nano_punch.exec(e, game) !== false;
      }
      // THE CREAKER: R (or N) reveals only while disguised.
      if (slot === 'R' && e.def.id === 'creaker' && !e.disguise) return false;
      const ab = Ent.ability(e, slot);
      if (!ab || !Ent.canAct(e) || e.cast || e.action || e.cds[slot] > 0) return false;
      if (Ent.has(e, 'hot') && slot !== 'M1') return false;
      if (game.finale && e.team === 'killer' && game.finale.phase !== 'fight') return false;
      const impl = Abilities[ab.id];
      if (impl.can && !impl.can(e, game)) return false;
      e.cast = { slot, id: ab.id, ab, t: 0, windup: ab.windup, moveMult: ab.moveMult ?? 0.5 };
      e.cds[slot] = ab.cd;
      if (impl.start) impl.start(e, game, e.cast);
      if (e.cast && e.cast.windup <= 0) Ent.finishCast(e, game);
      return true;
    },
    finishCast(e, game) {
      const c = e.cast;
      e.cast = null;
      if (Abilities[c.id].exec(e, game, c) === false) e.cds[c.slot] = Math.min(e.cds[c.slot], 1);
    },

    // ------------------------------------------------------------- damage
    damage(game, t, amt, src, opt = {}) {
      if (t.dead || amt <= 0 || Ent.has(t, 'dying')) return 0;
      if (t.minion || t.clone) { t.hp -= amt; if (t.hp <= 0) t.dead = true; return amt; }
      if (Ent.has(t, 'invuln') && !opt.dot) { game.text(t, 'IMMUNE', '#ffffff'); return 0; }
      // BURGERS: IMPROVED HOTSPOT absorbs survivor attacks.
      if (t.team === 'killer' && src && src.team === 'survivor' && Ent.has(t, 'hot')) { Abilities.burg_hotspot.punish(t, game, src); return 0; }
      // NANO: DEFLECT parries any hacker hit in the first 0.7s.
      const dfl = Ent.get(t, 'deflect');
      if (dfl && src && src.team === 'killer' && dfl.max - dfl.t <= 0.7 && !opt.dot) {
        Abilities.nano_deflect.parry(t, game, src, dfl);
        return 0;
      }
      if (t.team === 'killer' && Ent.has(t, 'exposed')) amt *= 1.5;
      if (src && src.def.id === 'protocol2' && src.hp < 200) amt *= 1.15;
      // NANO: ARMOR absorbs damage before HP.
      if (t.armor > 0) {
        const a = Math.min(t.armor, amt);
        t.armor -= a;
        amt -= a;
        game.text(t, 'ARMOR -' + Math.round(a), '#c9d6e8');
        if (amt <= 0) { game.badge(122, t); return 0; }
      }
      t.hp -= amt;
      t.stats.taken += amt;
      t.flash = 0.15;
      if (src) { src.stats.damage += amt; src.stats.hits++; if (src.def.id === 'burgers') src.ink = Math.min(100, src.ink + amt * 2); }
      game.text(t, '-' + Math.round(amt), opt.dot ? '#ff9a3c' : '#ff4d4d');
      if (!opt.dot) {
        game.burst(t.x, t.y - t.h / 2, t.team === 'killer' ? '#ffd23f' : '#ff3b5c', 10);
        if (t.team === 'survivor') { Ent.fast(t, 1, 1.6); t.cast = null; }
        if (t.isPlayer || (src && src.isPlayer)) game.shake(5);
      }
      if (t.team === 'killer' && t.def.id === 'protocol2' && t.hp < 200 && !t.raged) {
        t.raged = true;
        t.ragedAt = game.time;
        game.announce('MIDPOINT: RAGE MODE', '#ff3b1a', 1.8);
        game.sound('p2_rage', t);
        game.badge(46, t);
      }
      if (t.hp <= 0) Ent.kill(game, t, src, opt.cause);
      return amt;
    },
    heal(game, t, amt, by) {
      if (t.dead) return 0;
      if (by && by.def.id === 'protocol2' && by.hp < 200) amt *= 1.25;
      const h = Math.min(amt, t.maxHp - t.hp);
      t.hp += h;
      return h;
    },
    kill(game, t, src, cause) {
      if (t.team === 'killer') {
        t.hp = 0;
        game.hackerDeleted(t, src);
        return;
      }
      t.hp = 0;
      t.cast = t.action = null;
      t.effects = t.effects.filter((f) => f.type === 'dying');
      // Scratchy: TAKING A LEAVE (five seconds of fighting back).
      if (t.def.id === 'scratchy' && !t.leaving) {
        t.leaving = true;
        Ent.add(t, 'dying', 5);
        game.feed('Scratchy is TAKING A LEAVE…', '#ffab19');
        t.killer = src;
        return;
      }
      Ent.finalDeath(game, t, src || t.killer, cause);
    },
    finalDeath(game, t, src, cause) {
      t.dead = true;
      t.deathT = game.time;
      game.burst(t.x, t.y - t.h / 2, '#ff3b5c', 30);
      game.feed(`${t.name} was deleted${src ? ' by ' + src.name : cause ? ' by ' + cause : ''}`, '#ff6b6b');
      if (src && src.team === 'killer') {
        src.stats.kills++;
        if (src.def.id === 'sc') {
          src.anim = { name: 'kill', t: 0, lock: 1.8 };
          Ent.add(src, 'stub', 1.6);
          game.sound(t.def.id === 'griffpatch' ? 'sc_kill_griff' : 'sc_kill', src);
        }
      }
      game.onDeath(t, src);
    },
    stun(game, k, dur, src) {
      if (k.dead) return false;
      if (src && src.team === 'survivor' && Ent.has(k, 'hot')) { Abilities.burg_hotspot.punish(k, game, src); return false; }
      if (Ent.has(k, 'immune') || Ent.has(k, 'invuln')) { game.text(k, 'IMMUNE', '#ffffff'); return false; }
      Ent.add(k, 'stun', dur);
      k.everStunned = true;
      k.cast = null;
      if (k.action && k.action.type !== 'carried') k.action = null;
      game.text(k, 'STUNNED', '#e6ff4a');
      game.sound(k.def.id === 'protocol2' ? 'p2_stun' : 'wobble', k, 0.7);
      return true;
    },

    // Hitbox set for basic attacks (Forsaken-style: several timed circles).
    spawnHitboxes(game, e, spec, opts = {}) {
      const swing = { owner: e, targets: new Map(), boxes: spec.boxes.length, dmg: spec.dmg, opts };
      for (const [dx, dy, r, delay] of spec.boxes) {
        game.hitboxes.push({ owner: e, swing, dx, dy, r, delay, life: 0.1, dmg: spec.dmg, facing: e.facing, hit: new Set() });
      }
      game.swings.push(swing);
      return swing;
    },

    // --------------------------------------------------------------- update
    update(e, game, dt) {
      e.anim.t += dt;
      if (e.anim.lock > 0) e.anim.lock -= dt;
      if (e.flash > 0) e.flash -= dt;
      for (const k in e.cds) if (e.cds[k] > 0) e.cds[k] = Math.max(0, e.cds[k] - dt);
      if (e.chainT > 0) e.chainT -= dt;
      for (const f of e.effects) f.t -= dt;
      const ended = e.effects.filter((f) => f.t <= 0);
      if (ended.length) {
        e.effects = e.effects.filter((f) => f.t > 0);
        for (const f of ended) Ent.effectEnded(e, game, f);
      }
      if (e.dead) return;
      Ent.passives(e, game, dt);

      const I = e.input;
      const stunned = Ent.stunned(e) || Ent.has(e, 'carried');
      if (e.cast && !stunned) {
        e.cast.t += dt;
        if (e.cast.t >= e.cast.windup) Ent.finishCast(e, game);
      } else if (stunned) e.cast = null;

      const W = game.world;
      if (e.drop > 0) e.drop -= dt;

      if (e.action) {
        const a = e.action;
        a.t += dt;
        if (a.update) a.update(e, game, dt);
        if (e.action === a) {
          e.vx = a.vx;
          if (a.nograv) e.vy = a.vy || 0;
          else e.vy = Math.min(P.maxFall, e.vy + P.gravity * dt);
          const r = W.move(e, dt);
          e.grounded = W.onGround(e);
          if (a.onMove) a.onMove(e, game, r);
          if (e.action === a && (a.t >= a.dur || (a.untilGround && e.grounded && a.t > 0.1))) {
            e.action = null;
            if (a.onEnd) a.onEnd(e, game);
          }
        }
        if (!e.action) e.vx *= 0.3;
      } else {
        // Ladders.
        const onLadder = W.ladderAt(e);
        if (!e.climbing && !stunned) {
          if (onLadder >= 0 && (I.up || (I.down && !e.grounded))) e.climbing = true;
          else if (I.down && e.grounded && W.ladderBelow(e) >= 0) { e.climbing = true; e.y += 3; }
        }
        if (e.climbing) {
          const lx = W.ladderAt(e);
          if (lx < 0 || stunned) e.climbing = false;
          else {
            e.x = U.lerp(e.x, lx * T + T / 2, Math.min(1, dt * 14));
            e.vx = 0;
            e.vy = ((I.down ? 1 : 0) - (I.up ? 1 : 0)) * 170 * Ent.speedMult(e);
            if (I.jump) { e.climbing = false; e.vy = -P.jump * 0.75; e.vx = I.mx * 150; }
            const r = W.move(e, dt);
            // Reached the top: step off onto the ladder top.
            if (I.up && W.ladderAt(e) < 0) { e.climbing = false; e.y = Math.floor(e.y / T) * T; }
            if (r.landed && I.down) e.climbing = false;
            // Standing on real ground at the foot of a ladder: step off.
            const footing = W.onGround({ x: e.x, y: e.y, w: 18, h: e.h, team: e.team, drop: 0 });
            if (e.climbing && footing && !I.up && (!I.down || Math.abs(I.mx) > 0.1)) {
              const tx = Math.floor(e.x / T), below = Math.floor((e.y + 1) / T);
              if (!W.isLadder(tx, below)) e.climbing = false;
            }
          }
        }
        if (!e.climbing) {
          const can = !stunned && !Ent.has(e, 'root') && !Ent.has(e, 'deflect');
          const moving = can && Math.abs(I.mx) > 0.1;
          e.sprinting = can && I.sprint && moving && e.stamina > 1;
          let sp = (e.sprinting ? e.def.sprint : e.def.walk) * Ent.speedMult(e);
          if (e.cast) sp *= e.cast.moveMult;
          if (e.team === 'killer' && !e.isPlayer) sp *= game.diff.speed;
          if (e.disguise) sp = Math.min(sp, (e.sprinting ? 290 : 195) * Ent.speedMult(e));
          const target = moving ? I.mx * sp : 0;
          const acc = e.grounded ? 2600 : 1500;
          e.vx += U.clamp(target - e.vx, -acc * dt, acc * dt);
          if (e.sprinting) e.stamina -= dt * (e.team === 'killer' ? 11 : 25);
          if (moving) e.facing = I.mx > 0 ? 1 : -1;
          // Jump / drop.
          if (can && I.jump && (e.grounded || e.coyote > 0)) {
            if (I.down && W.isOneWay(Math.floor(e.x / T), Math.floor((e.y + 2) / T))) { e.drop = 0.25; }
            else { e.vy = -P.jump; e.coyote = 0; game.sound('step1', e, 0.25); }
          } else if (can && I.down && e.grounded && (W.at(Math.floor(e.x / T), Math.floor((e.y + 2) / T)) === '=' || (e.team !== 'survivor' && W.at(Math.floor(e.x / T), Math.floor((e.y + 2) / T)) === 'X'))) {
            e.drop = 0.25;
          }
          e.vy = Math.min(P.maxFall, e.vy + P.gravity * dt);
          const r = W.move(e, dt);
          if (r.hitX) e.vx = 0;
        }
        const wasGround = e.grounded;
        e.grounded = W.onGround(e) && !e.climbing;
        e.coyote = e.grounded ? 0.1 : Math.max(0, e.coyote - dt);
        if (!wasGround && e.grounded && e.vy >= 0) e.vy = 0;
      }
      if (!e.sprinting) e.stamina = Math.min(100, e.stamina + dt * (e.team === 'killer' ? 16 : 12) * (Math.abs(e.vx) > 20 ? 0.6 : 1));
      e.stamina = Math.max(0, e.stamina);
      // Facing for aimed abilities (players aim with the mouse while casting).
      if (e.cast && e.cast.aimFace !== false && e.isPlayer) e.facing = e.aim.x >= e.x ? 1 : -1;
      Ent.animate(e, game, dt);
    },

    effectEnded(e, game, f) {
      if (f.type === 'dying') { Ent.finalDeath(game, e, e.killer, null); game.badge(140, e); }
      if (f.type === 'hot') e.anim.lock = 0;
    },

    passives(e, game, dt) {
      const id = e.def.id;
      // Damage over time: GLITCHED I and CORRUPTED fire.
      for (const f of e.effects) {
        if (f.dps) {
          f.acc = (f.acc || 0) + f.dps * dt;
          if (f.acc >= 2) { Ent.damage(game, e, f.acc, f.src, { dot: true, cause: f.type }); f.acc = 0; }
        }
        if (f.hps) Ent.heal(game, e, f.hps * dt, f.src);
      }
      if (id === 'burgers') e.ink = Math.min(100, e.ink + 2.5 * dt);
      if (id === 'griffpatch') {
        const nearScratchy = game.survivors.some((s) => s.def.id === 'scratchy' && !s.dead && U.dist(s, e) < 160);
        e.regenT = (e.regenT || 0) + dt;
        if (e.regenT >= (nearScratchy ? 2 : 4)) {
          e.regenT = 0;
          Ent.heal(game, e, 0.2, e);
          if (nearScratchy) game.badge(155, e);
          if (e.hp >= 115) game.badge(153, e);
        }
      }
      if (e.team === 'killer') {
        const still = Math.abs(e.vx) < 5 && !e.cast && !e.action;
        e.idleT = still ? e.idleT + dt : 0;
        if (id === 'revengest' && e.idleT > 6 && e.isPlayer) game.badge(117, e);
      }
    },

    // Picks the animation for the sprite renderer.
    animate(e, game, dt) {
      if (e.anim.lock > 0) return;
      let a = 'idle';
      const moving = Math.abs(e.vx) > 25;
      if (Ent.stunned(e) || Ent.has(e, 'carried')) a = Ent.has(e, 'stub') && e.def.id === 'sc' ? 'skid' : 'stun';
      else if (e.action) a = e.action.anim || (moving ? 'walk' : 'idle');
      else if (e.cast) a = e.cast.anim || (e.cast.id === 'm1' ? (moving ? 'walkslash' : 'slash') : 'idle');
      else if (Ent.has(e, 'hot')) a = 'block';
      else if (moving || !e.grounded) a = 'walk';
      if (e.anim.name !== a) e.anim = { name: a, t: 0, lock: 0 };
    },

    // Push a box out of solid tiles horizontally (after being carried, etc.).
    unstick(game, e) {
      const W = game.world;
      const blocked = (x) => {
        const b = { x, y: e.y, w: e.w, h: e.h };
        const l = Math.floor((b.x - b.w / 2) / T), r = Math.floor((b.x + b.w / 2) / T);
        for (let ty = Math.floor((e.y - e.h + 1) / T); ty <= Math.floor((e.y - 1) / T); ty++) for (let tx = l; tx <= r; tx++) if (W.solidFor(e.team, tx, ty)) return true;
        return false;
      };
      if (!blocked(e.x)) return;
      for (let d = 4; d < T * 3; d += 4) {
        if (!blocked(e.x + d)) { e.x += d; return; }
        if (!blocked(e.x - d)) { e.x -= d; return; }
      }
    },
  });

  // =================================================================== KITS
  const dash = (e, game, speed, dur, anim, opts) => Object.assign({ type: 'dash', t: 0, dur, vx: e.facing * speed, vy: 0, nograv: true, anim, hit: new Set() }, opts);

  const Abilities = (G.Abilities = {
    m1: {
      start(e, game, c) {
        if (e.def.id === 'protocol2') game.sound(Math.random() < 0.5 ? 'p2_m1a' : 'p2_m1b', e, 0.7);
        if (e.def.id === 'burgers') game.sound('burg_m1', e, 0.7);
        if (e.def.id === 'revengest') game.sound(Math.random() < 0.5 ? 'rev_m1a' : 'rev_m1b', e, 0.7);
        if (e.def.id === 'sc' || e.def.id === 'creaker') game.sound('sc_hit', e, 0.5);
      },
      exec(e, game) {
        const sw = Ent.spawnHitboxes(game, e, e.def.m1);
        sw.onDone = (s) => {
          if (s.targets.size) Ent.slow(e, 3, 0.9); // endlag after a hit
          for (const [t, n] of s.targets) if (n === s.boxes && e.def.id === 'sc') game.badge(29, e);
        };
      },
    },

    // ------------------------------------------------------------------ SC
    sc_dash: {
      start(e, game, c) { c.anim = 'dashwind'; game.sound('sc_charge', e, 0.6); },
      exec(e, game, c) {
        const chained = !!c.chain;
        e.action = dash(e, game, 930, 0.3, 'dash', {
          chained,
          update(e2, g2) {
            for (const s of g2.targets()) {
              if (this.hit.has(s) || !Ent.overlap(e2, s, 4)) continue;
              this.hit.add(s);
              const dealt = Ent.damage(g2, s, 18, e2);
              if (dealt > 0 || s.clone) {
                e2.action = null;
                e2.vx = 0;
                if (chained) {
                  Ent.add(e2, 'stub', 0.9);
                  e2.anim = { name: 'skid', t: 0, lock: 0.9 };
                  g2.badge(35, e2);
                  if (e2.firstDashVictim && e2.firstDashVictim !== s) g2.badge(34, e2);
                  g2.badge(30, e2);
                } else {
                  e2.chainT = 1.2;
                  e2.firstDashVictim = s;
                  g2.text(e2, 'CHAIN!', '#ffab19');
                }
                return;
              }
            }
          },
          onMove(e2, g2, r) {
            if (r.hitX && e2.action) {
              e2.action = null;
              e2.selfHits = (e2.selfHits || 0) + 1;
              if (e2.selfHits >= 2) g2.badge(31, e2);
              Ent.add(e2, 'stun', 1.2);
              e2.anim = { name: 'crash', t: 0, lock: 1.2 };
              e2.hp -= 10;
              g2.text(e2, 'CRASH', '#ffab19');
              g2.sound('sc_wall', e2);
              g2.shake(6);
            }
          },
        });
        game.sound('sc_fullcharge', e, 0.6);
      },
    },
    sc_vision: {
      start(e, game, c) { c.anim = 'vision'; game.sound('sc_vision', e, 0.6); },
      exec(e, game) {
        const c = Ent.center(e);
        const a = Math.atan2(e.aim.y - c.y, e.aim.x - c.x);
        const proj = { kind: 'vision', owner: e, x: c.x + Math.cos(a) * 20, y: c.y + Math.sin(a) * 20, vx: Math.cos(a) * 380, vy: Math.sin(a) * 380, r: 18, t: 0, life: 1.5, hit: new Set() };
        game.projectiles.push(proj);
        Ent.add(e, 'immune', 1.5);
        e.visionProj = proj;
      },
    },

    // ----------------------------------------------------------- PROTOCOL2
    p2_dash: {
      start(e, game, c) { c.anim = 'dash'; },
      exec(e, game) {
        game.sound('p2_dash', e);
        e.action = dash(e, game, 950, 0.28, 'dash', {
          update(e2, g2) {
            for (const s of g2.targets()) {
              if (this.hit.has(s) || !Ent.overlap(e2, s, 4)) continue;
              this.hit.add(s);
              const dealt = Ent.damage(g2, s, 15, e2);
              const healed = Ent.heal(g2, e2, dealt, e2);
              if (healed > 0) { g2.text(e2, '+' + Math.round(healed), '#5dff8f'); if (e2.hp >= e2.maxHp) g2.badge(50, e2); }
            }
          },
          onMove(e2, g2, r) { if (r.hitX && e2.action) { e2.action.t = e2.action.dur; } },
          onEnd(e2, g2) {
            if (!this.hit.size) { Ent.slow(e2, 2, 2); g2.text(e2, 'MISSED', '#aaaaaa'); g2.sound('p2_miss', e2); e2.missT = g2.time; }
          },
        });
      },
    },
    p2_hook: {
      start(e, game, c) { c.anim = 'throw'; },
      exec(e, game) {
        const c = Ent.center(e);
        const a = Math.atan2(e.aim.y - c.y, e.aim.x - c.x);
        game.projectiles.push({ kind: 'hook', owner: e, x: c.x, y: c.y, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520, r: 8, t: 0, life: 4, bounces: 0, hit: new Set() });
        e.anim = { name: 'hold', t: 0, lock: 0.5 };
        game.sound('slide', e, 0.5);
      },
    },

    // ------------------------------------------------------------- BURGERS
    burg_foot: {
      can(e) { return e.ink >= 100 && e.grounded; },
      start(e, game, c) { c.anim = 'stomp'; },
      exec(e, game) {
        const mine = game.traps.filter((t) => t.owner === e);
        if (mine.length >= 3) game.traps.splice(game.traps.indexOf(mine[0]), 1);
        game.traps.push({ owner: e, x: e.x, y: e.y, arm: 0.5, t: 0 });
        e.ink = 0;
        game.sound('burg_ink', e);
        game.burst(e.x, e.y, '#101010', 16);
      },
    },
    burg_hotspot: {
      exec(e, game) {
        Ent.add(e, 'hot', 5);
        Ent.slow(e, 4, 5);
        e.anim = { name: 'prep', t: 0, lock: 0.4 };
        game.sound('burg_prep', e);
      },
      punish(e, game, src) {
        Ent.remove(e, 'hot');
        Ent.remove(e, 'slow4');
        e.hotspots = (e.hotspots || 0) + 1;
        game.badge(59, e);
        if (e.hotspots >= 5) game.badge(72, e);
        if (src) {
          e.learned = e.learned || new Map();
          const n = (e.learned.get(src) || 0) + 1;
          e.learned.set(src, n);
          if (n >= 2) game.badge(68, e);
        }
        game.text(e, 'DEFLECTED!', '#ff3b3b');
        game.sound('burg_deflected', e);
        game.shake(10);
        e.anim = { name: 'yell', t: 0, lock: 0.9 };
        Ent.spawnHitboxes(game, e, { dmg: 5, boxes: [[0, 0, 150, 0], [0, 0, 150, 0.15], [0, 0, 150, 0.3]] }, { area: true });
        game.fx.push({ type: 'ring', x: e.x, y: e.y - e.h / 2, r0: 20, r1: 150, t: 0, dur: 0.5, color: '#ff3b3b' });
        Ent.fast(e, 2, 4);
        Ent.add(e, 'invuln', 5);
        Ent.add(e, 'immune', 5);
        if (src && src.action) { src.action = null; src.vx = -src.facing * 300; src.vy = -250; }
      },
    },

    // --------------------------------------------------------- THE CREAKER
    creak_deceive: {
      exec(e, game) {
        if (e.disguise) return Abilities.creak_deceive.undo(e, game, false);
        const pool = game.survivors.filter((s) => !s.dead);
        const skin = U.choice(pool.length ? pool : game.survivors);
        e.disguise = skin.def.id;
        e.name = skin.name;
        e.w = 26; e.h = 44;
        e.fakeHp = skin.hp / skin.maxHp;
        game.burst(e.x, e.y - 30, '#5a3f8f', 18);
        game.sound('wobble', e, 0.5);
      },
      undo(e, game, revealing) {
        e.disguise = null;
        e.name = e.def.name;
        e.w = e.def.w; e.h = e.def.h;
        Ent.unstick(game, e);
        for (const c of game.clones()) c.dead = true;
        if (!revealing) e.cds.Q = 8;
        game.burst(e.x, e.y - 30, '#5a3f8f', 18);
      },
    },
    creak_construct: {
      exec(e, game) {
        if (e.disguise) {
          const n = U.randInt(5, 8);
          if (n === 8) game.badge(84, e);
          if (n === 5) game.badge(91, e);
          e.constructs = (e.constructs || 0) + 1;
          for (let i = 0; i < n; i++) game.spawnClone(e, i);
          game.sound('wobble', e);
          return;
        }
        // FACE THY SELF: a clone grabs a nearby survivor.
        let best = null, bd = 300;
        for (const s of game.survivors) if (!s.dead && U.dist(s, e) < bd) { bd = U.dist(s, e); best = s; }
        if (!best) { game.text(e, 'NOBODY NEAR', '#aaaaaa'); return false; }
        game.projectiles.push({ kind: 'grabber', owner: e, target: best, x: e.x, y: e.y - 22, vx: 0, vy: 0, r: 14, t: 0, life: 1.6, skin: U.choice(game.survivors).def.id });
      },
    },
    creak_reveal: {
      exec(e, game) {
        Abilities.creak_deceive.undo(e, game, true);
        e.cds.Q = 10;
        Ent.add(e, 'exposed', 3);
        game.sound('slam', e);
        e.action = dash(e, game, 1000, 0.25, 'walk', {
          update(e2, g2) {
            for (const s of g2.survivors) {
              if (s.dead || this.hit.has(s) || !Ent.overlap(e2, s, 6)) continue;
              this.hit.add(s);
              if (Ent.damage(g2, s, 20, e2) > 0) {
                s.action = { type: 'thrown', t: 0, dur: 2, vx: e2.facing * 640, vy: -540, untilGround: true, anim: 'stun',
                  onMove(s2, g3, r) { if (r.hitX && !this.bumped) { this.bumped = true; Ent.damage(g3, s2, U.randInt(1, 5), e2); this.vx *= -0.3; } },
                  onEnd(s2, g3) { if (!this.bumped) Ent.damage(g3, s2, U.randInt(1, 5), e2); } };
                g2.badge(85, e2);
              }
              e2.action = null;
              return;
            }
          },
          onEnd(e2, g2) { if (!this.hit.size) { Ent.slow(e2, 3, 2); g2.text(e2, 'MISSED', '#aaaaaa'); } },
        });
      },
    },

    // ------------------------------------------------------- THE REVENGEST
    rev_slinger: {
      start(e, game, c) { c.anim = 'charge'; c.aimFace = true; game.sound('rev_slinger', e, 0.8); },
      exec(e, game) {
        const boxes = [];
        for (const dx of [0, 26]) for (const dy of [-34, -10, 14]) boxes.push({ dx, dy, hit: new Set() });
        game.projectiles.push({ kind: 'slinger', owner: e, x: e.x + e.facing * 10, y: e.y - e.h / 2, vx: e.facing * 650, vy: 0, r: 16, t: 0, life: 9, boxes, sx: e.x });
        game.shake(4);
      },
    },
    rev_omen: {
      start(e, game, c) { c.anim = 'summon'; },
      exec(e, game) {
        for (let i = 0; i < 3; i++) game.spawnMinion(e, i);
        e.usedOmen = true;
        game.sound('rev_omen', e);
      },
    },

    // ------------------------------------------------------------ Scratchy
    scr_roll: {
      exec(e, game) {
        Ent.add(e, 'invuln', 3);
        game.sound('slide', e);
        e.action = { type: 'roll', t: 0, dur: 3, vx: e.facing * 340, vy: 0, anim: 'roll', pinned: false, phased: false,
          update(e2, g2) {
            if (!this.pinned && Math.abs(e2.input.mx) > 0.1) e2.facing = e2.input.mx > 0 ? 1 : -1;
            this.vx = this.pinned ? 0 : e2.facing * 340;
            const k = g2.killer;
            if (!k.dead && Ent.overlap(e2, k) && !this.phased) { this.phased = true; g2.badge(141, e2); }
          },
          onMove(e2, g2, r) { if (r.hitX && !this.pinned) { this.pinned = true; g2.text(e2, 'PINNED', '#ffab19'); } },
          onEnd(e2, g2) {
            Ent.remove(e2, 'invuln');
            if (!this.pinned) { Ent.fast(e2, 2, 3); g2.badge(136, e2); }
            else e2.pinnedRound = true;
          } };
      },
    },
    scr_paw: {
      exec(e, game) {
        let ally = null, bd = 95;
        for (const s of game.survivors) {
          if (s === e || s.dead || s.def.id === 'griffpatch' || s.hp >= s.maxHp) continue;
          const d = U.dist(s, e);
          if (d < bd) { bd = d; ally = s; }
        }
        if (ally) {
          Ent.add(ally, 'paw', 3, { hps: 35 / 3, src: e });
          game.text(ally, 'TAKE A PAW', '#5dff8f');
          e.pawHeals = (e.pawHeals || 0) + 1;
          if (e.pawHeals >= 3) game.badge(138, e);
          if (U.dist(game.killer, e) < 300) game.badge(148, e);
          return;
        }
        if (U.dist(game.killer, e) > 400 || game.killer.dead) {
          Ent.add(e, 'bandage', 5, { hps: 6, src: e });
          game.text(e, 'BANDAGED', '#5dff8f');
          game.badge(139, e);
          return;
        }
        game.text(e, 'NOT ALONE', '#aaaaaa');
        return false;
      },
    },

    // ---------------------------------------------------------- GRIFFPATCH
    griff_slam: {
      exec(e, game) {
        game.sound('slam', e, 0.6);
        e.action = { type: 'slam', t: 0, dur: 3, vx: e.facing * 800, vy: 0, nograv: true, anim: 'roll', carry: null,
          update(e2, g2) {
            const k = g2.killer;
            if (!this.carry && !k.dead && Ent.overlap(e2, k, 2)) {
              if (Ent.has(k, 'hot')) { Abilities.burg_hotspot.punish(k, g2, e2); e2.action = null; return; }
              if (Ent.has(k, 'immune') || Ent.has(k, 'invuln')) { g2.text(k, 'IMMUNE', '#fff'); e2.action = null; e2.vx = -e2.facing * 200; return; }
              this.carry = k;
              k.action = { type: 'carried', t: 0, dur: 3.2, vx: 0, vy: 0, nograv: true, anim: 'stun' };
              Ent.add(k, 'carried', 3.2);
              k.cast = null;
              g2.badge(162, e2);
            }
            if (this.carry) { const k2 = this.carry; k2.x = e2.x + e2.facing * (e2.w / 2 + k2.w / 2 - 6); k2.y = e2.y; }
          },
          onMove(e2, g2, r) {
            if (!r.hitX) return;
            const k = this.carry;
            e2.action = null;
            if (k) {
              k.action = null;
              Ent.remove(k, 'carried');
              Ent.unstick(g2, k);
              Ent.damage(g2, k, 35, e2);
              Ent.stun(g2, k, 6, null);
              const before = e2.hp;
              e2.hp = Math.min(115, e2.hp + 15);
              if (e2.hp > before) g2.text(e2, '+15', '#5dff8f');
              e2.stats.stuns++;
              g2.badge(151, e2); g2.badge(152, e2);
              g2.shake(14);
              g2.sound('slam', e2);
              if (e2.hp >= 115) g2.badge(153, e2);
            } else {
              Ent.damage(g2, e2, 15, null, { cause: 'a wall' });
              e2.vx = -e2.facing * 320; e2.vy = -260;
              g2.text(e2, 'OOF', '#ff9a3c');
              g2.sound('sc_wall', e2, 0.5);
            }
          },
          onEnd(e2, g2) {
            if (this.carry) { const k = this.carry; k.action = null; Ent.remove(k, 'carried'); Ent.unstick(g2, k); }
          } };
      },
    },

    // ---------------------------------------------------------------- NANO
    nano_deflect: {
      exec(e, game) {
        Ent.add(e, 'deflect', 1.0);
        e.deflects = (e.deflects || 0) + 1;
        e.vx = 0;
        game.sound('burg_prep', e, 0.5);
      },
      parry(e, game, src, dfl) {
        Ent.remove(e, 'deflect');
        Ent.heal(game, e, 25, e);
        Ent.fast(e, 1, 3);
        e.armor += 15;
        e.stats.parries++;
        Ent.add(e, 'parried', 0.3, { foe: src });
        game.text(e, 'DEFLECT!', '#d9c27a');
        game.sound('burg_deflected', e, 0.5);
        game.fx.push({ type: 'ring', x: e.x, y: e.y - e.h / 2, r0: 8, r1: 60, t: 0, dur: 0.3, color: '#d9c27a' });
        if (dfl.max - dfl.t <= 0.2) game.badge(119, e);
        game.badge(130, e);
        if (e.stats.parries >= 5) game.badge(123, e);
        if (e.armor >= 50) game.badge(131, e);
        if (e.armor >= 100) game.badge(121, e);
        if (src && src.cast) src.cast = null;
      },
    },
    nano_punch: {
      exec(e, game) {
        const p = Ent.get(e, 'parried');
        const k = (p && p.foe) || game.killer;
        Ent.remove(e, 'parried');
        if (!k || k.dead || U.dist(k, e) > 95) { game.text(e, 'TOO FAR', '#aaaaaa'); return false; }
        e.facing = k.x > e.x ? 1 : -1;
        e.anim = { name: 'punch', t: 0, lock: 0.3 };
        if (Ent.has(k, 'hot')) { Abilities.burg_hotspot.punish(k, game, e); return; }
        Ent.damage(game, k, 25, e);
        if (Ent.stun(game, k, 2, null)) e.stats.stuns++;
        e.punches = (e.punches || 0) + 1;
        game.badge(120, e);
        if (e.punches >= 3) game.badge(133, e);
        game.shake(8);
        game.sound('sc_hit', e);
      },
    },
  });
})();
