// Tile map, collision, line of sight, A* pathfinding and realm hazards.
(function () {
  const G = window.G;
  const T = G.TILE;
  const U = G.U;

  class Heap {
    constructor() { this.a = []; }
    get size() { return this.a.length; }
    push(item, pri) {
      const a = this.a;
      a.push([pri, item]);
      let i = a.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (a[p][0] <= a[i][0]) break;
        [a[p], a[i]] = [a[i], a[p]];
        i = p;
      }
    }
    pop() {
      const a = this.a;
      const top = a[0];
      const last = a.pop();
      if (a.length) {
        a[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1;
          let m = i;
          if (l < a.length && a[l][0] < a[m][0]) m = l;
          if (r < a.length && a[r][0] < a[m][0]) m = r;
          if (m === i) break;
          [a[m], a[i]] = [a[i], a[m]];
          i = m;
        }
      }
      return top[1];
    }
  }

  const SOLID = new Set(['#', 'x', 'G', 'n', 'f', 'h', 'D']);

  class World {
    constructor(def) {
      this.def = def;
      const rows = def.layout;
      this.h = rows.length;
      this.w = Math.max(...rows.map((r) => r.length));
      this.pw = this.w * T;
      this.ph = this.h * T;
      this.grid = new Array(this.w * this.h);
      this.gens = [];
      this.spawnsS = [];
      this.spawnK = null;
      this.teleVents = [];
      this.bones = new Map();
      this.barricades = new Map();
      this.debris = [];
      this.zones = [];
      for (let y = 0; y < this.h; y++) {
        for (let x = 0; x < this.w; x++) {
          let ch = rows[y][x] || '.';
          if (x === 0 || y === 0 || x === this.w - 1 || y === this.h - 1) ch = '#';
          const cx = x * T + T / 2, cy = y * T + T / 2;
          if (ch === 'G') this.gens.push({ id: this.gens.length, tx: x, ty: y, x: cx, y: cy, progress: 0, done: false, repairers: 0, spark: 0 });
          else if (ch === 'S') { this.spawnsS.push({ x: cx, y: cy }); ch = '.'; }
          else if (ch === 'K') { this.spawnK = { x: cx, y: cy }; ch = '.'; }
          else if (ch === 'O') this.teleVents.push({ tx: x, ty: y, x: cx, y: cy });
          else if (ch === 'b') this.bones.set(y * this.w + x, { x: cx, y: cy, cd: 0 });
          else if (ch === 'D') this.pedestal = this.pedestal || { x: cx, y: cy + T / 2 };
          this.grid[y * this.w + x] = ch;
        }
      }
      const half = Math.floor(this.teleVents.length / 2);
      for (let i = 0; i < half; i++) {
        this.teleVents[i].pair = this.teleVents[i + half];
        this.teleVents[i + half].pair = this.teleVents[i];
      }
      if (def.id === 'cave') this.dim = { on: false, t: U.rand(30, 40) };
      if (def.id === 'forums') this.post = { t: U.rand(25, 35) };
      if (def.id === 'mit') this.debrisT = U.rand(4, 7);
      this.openTiles = [];
      for (let i = 0; i < this.grid.length; i++) {
        const x = i % this.w, y = (i / this.w) | 0;
        if (!this.isSolidT(x, y)) this.openTiles.push({ tx: x, ty: y, x: x * T + T / 2, y: y * T + T / 2 });
      }
    }

    at(tx, ty) {
      if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return '#';
      return this.grid[ty * this.w + tx];
    }
    atPx(x, y) { return this.at(Math.floor(x / T), Math.floor(y / T)); }
    hasBarricade(tx, ty) { return this.barricades.has(ty * this.w + tx); }
    isSolidT(tx, ty) {
      return SOLID.has(this.at(tx, ty)) || this.barricades.has(ty * this.w + tx);
    }
    isSolidPx(x, y) { return this.isSolidT(Math.floor(x / T), Math.floor(y / T)); }
    blocksSight(tx, ty) { return this.at(tx, ty) === '#' || !!(this.barricades.get(ty * this.w + tx) || {}).opaque; }

    los(ax, ay, bx, by) {
      const d = Math.hypot(bx - ax, by - ay);
      const n = Math.ceil(d / 10);
      for (let i = 1; i < n; i++) {
        const x = ax + ((bx - ax) * i) / n, y = ay + ((by - ay) * i) / n;
        if (this.blocksSight(Math.floor(x / T), Math.floor(y / T))) return false;
      }
      return true;
    }
    clearPath(ax, ay, bx, by, r = 12) {
      const d = Math.hypot(bx - ax, by - ay);
      const n = Math.ceil(d / 8);
      const o = r * 0.8;
      for (let i = 1; i <= n; i++) {
        const x = ax + ((bx - ax) * i) / n, y = ay + ((by - ay) * i) / n;
        if (this.isSolidPx(x - o, y - o) || this.isSolidPx(x + o, y - o) || this.isSolidPx(x - o, y + o) || this.isSolidPx(x + o, y + o)) return false;
      }
      return true;
    }

    collide(e) {
      const r = e.r;
      const solid = e.flying ? (tx, ty) => this.at(tx, ty) === '#' : (tx, ty) => this.isSolidT(tx, ty);
      const tx0 = Math.floor((e.x - r) / T), tx1 = Math.floor((e.x + r) / T);
      const ty0 = Math.floor((e.y - r) / T), ty1 = Math.floor((e.y + r) / T);
      let hit = false;
      for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          if (!solid(tx, ty)) continue;
          const rx = tx * T, ry = ty * T;
          const cx = U.clamp(e.x, rx, rx + T), cy = U.clamp(e.y, ry, ry + T);
          const dx = e.x - cx, dy = e.y - cy;
          const d = Math.hypot(dx, dy);
          if (d < r) {
            hit = true;
            if (d < 1e-4) {
              const l = e.x - rx, rr = rx + T - e.x, t = e.y - ry, b = ry + T - e.y;
              const m = Math.min(l, rr, t, b);
              if (m === l) e.x = rx - r; else if (m === rr) e.x = rx + T + r; else if (m === t) e.y = ry - r; else e.y = ry + T + r;
            } else {
              e.x = cx + (dx / d) * r;
              e.y = cy + (dy / d) * r;
            }
          }
        }
      }
      return hit;
    }

    // Cost of walking a tile right now (bots avoid danger).
    hazardCost(tx, ty, team) {
      const c = this.at(tx, ty);
      let cost = 0;
      if (c === '~') cost += 3;
      if (c === 'b' && team === 'survivor') cost += 2;
      const x = tx * T + T / 2, y = ty * T + T / 2;
      for (const d of this.debris) if (Math.hypot(d.x - x, d.y - y) < d.r + 20) cost += 50;
      if (team === 'survivor') {
        for (const z of this.zones) {
          if (Math.hypot(z.x - x, z.y - y) > z.r + 10) continue;
          if (z.kind === 'fire') cost += 60;
          else if (z.kind === 'grease') cost += 12;
          else if (z.kind === 'vines') cost += 10;
        }
      }
      return cost;
    }
    dangerAt(x, y) {
      for (const d of this.debris) if (Math.hypot(d.x - x, d.y - y) < d.r + 16) return true;
      for (const z of this.zones) if (z.kind === 'fire' && Math.hypot(z.x - x, z.y - y) < z.r + 10) return true;
      return false;
    }
    safeNear(x, y) {
      const sx = Math.floor(x / T), sy = Math.floor(y / T);
      for (let rad = 1; rad < 8; rad++) {
        let best = null, bd = Infinity;
        for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
          const tx = sx + dx, ty = sy + dy;
          if (this.isSolidT(tx, ty) || this.hazardCost(tx, ty, 'survivor') > 3) continue;
          const d = dx * dx + dy * dy;
          if (d < bd) { bd = d; best = { x: tx * T + T / 2, y: ty * T + T / 2 }; }
        }
        if (best) return best;
      }
      return { x, y };
    }

    findPath(sx, sy, gx, gy, opt = {}) {
      const w = this.w, h = this.h;
      const pass = (tx, ty) => {
        if (tx < 0 || ty < 0 || tx >= w || ty >= h) return false;
        if (!this.isSolidT(tx, ty)) return true;
        const b = this.barricades.get(ty * w + tx);
        return !!opt.breakable && !!b && !b.unbreakable && !SOLID.has(this.at(tx, ty));
      };
      let stx = Math.floor(sx / T), sty = Math.floor(sy / T);
      let gtx = Math.floor(gx / T), gty = Math.floor(gy / T);
      if (!pass(stx, sty)) {
        const n = this.nearestPass(stx, sty, pass);
        if (!n) return null;
        [stx, sty] = n;
      }
      let exactGoal = true;
      if (!pass(gtx, gty)) {
        const n = this.nearestPass(gtx, gty, pass, sx, sy);
        if (!n) return null;
        [gtx, gty] = n;
        exactGoal = false;
      }
      const start = sty * w + stx, goal = gty * w + gtx;
      if (start === goal) return [{ x: exactGoal ? gx : gtx * T + T / 2, y: exactGoal ? gy : gty * T + T / 2, tx: gtx, ty: gty }];
      const gs = new Float32Array(w * h).fill(Infinity);
      const came = new Int32Array(w * h).fill(-1);
      const closed = new Uint8Array(w * h);
      const heap = new Heap();
      gs[start] = 0;
      heap.push(start, 0);
      const hfn = (i) => {
        const dx = Math.abs((i % w) - gtx), dy = Math.abs(((i / w) | 0) - gty);
        return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
      };
      let iter = 0, found = false;
      const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
      while (heap.size && iter++ < 6000) {
        const cur = heap.pop();
        if (cur === goal) { found = true; break; }
        if (closed[cur]) continue;
        closed[cur] = 1;
        const cx = cur % w, cy = (cur / w) | 0;
        for (const [dx, dy, c] of dirs) {
          const nx = cx + dx, ny = cy + dy;
          if (!pass(nx, ny)) continue;
          if (dx && dy && (!pass(cx + dx, cy) || !pass(cx, cy + dy))) continue;
          const ni = ny * w + nx;
          if (closed[ni]) continue;
          let cost = c + this.hazardCost(nx, ny, opt.team) * (opt.hazardScale ?? 1);
          if (opt.breakable && this.hasBarricade(nx, ny)) cost += 6;
          if (opt.costFn) cost += opt.costFn(nx, ny);
          const ng = gs[cur] + cost;
          if (ng < gs[ni]) {
            gs[ni] = ng;
            came[ni] = cur;
            heap.push(ni, ng + hfn(ni));
          }
        }
      }
      if (!found) return null;
      const pts = [];
      let c = goal;
      while (c !== -1 && c !== start) {
        pts.push({ x: (c % w) * T + T / 2, y: ((c / w) | 0) * T + T / 2, tx: c % w, ty: (c / w) | 0 });
        c = came[c];
      }
      pts.reverse();
      if (exactGoal && pts.length) { pts[pts.length - 1].x = gx; pts[pts.length - 1].y = gy; }
      return pts;
    }
    nearestPass(tx, ty, pass, fromX, fromY) {
      let best = null, bd = Infinity;
      for (let rad = 1; rad < 6 && !best; rad++) {
        for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue;
          if (!pass(tx + dx, ty + dy)) continue;
          let d = dx * dx + dy * dy;
          if (fromX !== undefined) d += Math.hypot((tx + dx) * T + 20 - fromX, (ty + dy) * T + 20 - fromY) / 400;
          if (d < bd) { bd = d; best = [tx + dx, ty + dy]; }
        }
      }
      return best;
    }

    update(dt, game) {
      this.zones = game.zones;
      for (const [k, b] of this.barricades) if ((b.t -= dt) <= 0) this.barricades.delete(k);
      for (const b of this.bones.values()) if (b.cd > 0) b.cd -= dt;

      // MIT: falling debris.
      if (this.debrisT !== undefined && !game.finale) {
        this.debrisT -= dt;
        if (this.debrisT <= 0) {
          this.debrisT = U.rand(3.5, 6.5);
          // Prefer spots near people so it matters.
          const near = U.choice(game.ents.filter((e) => !e.dead));
          const pool = this.openTiles.filter((o) => near && U.dist(o, near) < 260);
          const p = U.choice(pool.length ? pool : this.openTiles);
          this.debris.push({ x: p.x + U.rand(-10, 10), y: p.y + U.rand(-10, 10), r: 55, t: 1.6, max: 1.6 });
        }
        for (const d of this.debris) {
          d.t -= dt;
          if (d.t > 0) continue;
          d.done = true;
          game.burst(d.x, d.y, '#7a8494', 22);
          game.fx.push({ type: 'ring', x: d.x, y: d.y, r0: 10, r1: d.r, t: 0, dur: 0.3, color: '#c9d6e8', fill: true });
          if (game.nearPlayer(d.x, d.y, 600)) { G.Audio.play('slam', 0.6); game.shake(5); }
          for (const e of game.ents) {
            if (e.dead || e.decoy || U.dist(e, d) > d.r + e.r * 0.5) continue;
            if (e.team === 'survivor') G.Ent.damage(game, e, 35, null, { cause: 'falling debris' });
            else G.Ent.stun(game, e, 1.5, null, true);
          }
        }
        this.debris = this.debris.filter((d) => !d.done);
      }

      // Forums: a new post goes up and everyone's position is announced.
      if (this.post && !game.finale) {
        this.post.t -= dt;
        if (this.post.t <= 0) {
          this.post.t = U.rand(28, 40);
          for (const s of game.survivors) if (!s.dead) G.Ent.add(s, 'revealed', 3);
          game.announce('📢 NEW FORUM POST', '#ffbf00', 2, 'Every survivor\'s location was announced');
          G.Audio.play('crown', 0.6);
        }
      }

      // Cave: THE END whispers and the dark closes in.
      if (this.dim && !game.finale) {
        this.dim.t -= dt;
        if (this.dim.t <= 0) {
          this.dim.on = !this.dim.on;
          this.dim.t = this.dim.on ? 6 : U.rand(35, 48);
          if (this.dim.on) { game.announce('THE END whispers…', '#b3122a', 2.2); G.Audio.play('creak'); }
        }
      }
    }
  }

  G.World = World;
})();
