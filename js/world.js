// Tile map, collision, line of sight, A* pathfinding and map hazards.
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
      this.traps = [];
      this.teleVents = [];
      this.barricades = new Map();
      this.fireOf = new Map();
      this.fireClusters = [];
      for (let y = 0; y < this.h; y++) {
        for (let x = 0; x < this.w; x++) {
          let ch = rows[y][x] || '.';
          if (x === 0 || y === 0 || x === this.w - 1 || y === this.h - 1) ch = '#';
          const cx = x * T + T / 2, cy = y * T + T / 2;
          if (ch === 'G') this.gens.push({ id: this.gens.length, tx: x, ty: y, x: cx, y: cy, progress: 0, done: false, repairers: 0, spark: 0 });
          else if (ch === 'S') { this.spawnsS.push({ x: cx, y: cy }); ch = '.'; }
          else if (ch === 'K') { this.spawnK = { x: cx, y: cy }; ch = '.'; }
          else if (ch === 'T') { this.traps.push({ tx: x, ty: y, x: cx, y: cy, armed: true, t: 0 }); ch = '.'; }
          else if (ch === 'O') this.teleVents.push({ tx: x, ty: y, x: cx, y: cy });
          this.grid[y * this.w + x] = ch;
        }
      }
      // Pair vents: first half <-> second half (crosses the map).
      const half = Math.floor(this.teleVents.length / 2);
      for (let i = 0; i < half; i++) {
        this.teleVents[i].pair = this.teleVents[i + half];
        this.teleVents[i + half].pair = this.teleVents[i];
      }
      // Fire vent clusters (flood fill of 'F').
      for (let i = 0; i < this.grid.length; i++) {
        if (this.grid[i] !== 'F' || this.fireOf.has(i)) continue;
        const cl = { tiles: [], state: 'idle', t: U.rand(3, 9) };
        const stack = [i];
        this.fireOf.set(i, cl);
        while (stack.length) {
          const c = stack.pop();
          cl.tiles.push(c);
          const cx = c % this.w, cy = (c / this.w) | 0;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const n = (cy + dy) * this.w + cx + dx;
            if (this.grid[n] === 'F' && !this.fireOf.has(n)) { this.fireOf.set(n, cl); stack.push(n); }
          }
        }
        let sx = 0, sy = 0;
        for (const c of cl.tiles) { sx += (c % this.w) * T + T / 2; sy += ((c / this.w) | 0) * T + T / 2; }
        cl.x = sx / cl.tiles.length; cl.y = sy / cl.tiles.length;
        this.fireClusters.push(cl);
      }
      // Train tracks.
      let tMin = Infinity, tMax = -1;
      for (let y = 0; y < this.h; y++) if (rows[y].includes('=')) { tMin = Math.min(tMin, y); tMax = Math.max(tMax, y); }
      if (tMax >= 0) {
        this.train = { state: 'idle', t: U.rand(18, 24), x: 0, len: 720, y0: tMin * T, y1: (tMax + 1) * T, hit: new Set(), dir: 1 };
        this.blackout = { on: false, t: U.rand(35, 45) };
      }
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
      const c = this.at(tx, ty);
      return c === '#' || c === 'x' || c === 'G' || this.barricades.has(ty * this.w + tx);
    }
    isSolidPx(x, y) { return this.isSolidT(Math.floor(x / T), Math.floor(y / T)); }
    blocksSight(tx, ty) { return this.at(tx, ty) === '#'; }

    los(ax, ay, bx, by) {
      const d = Math.hypot(bx - ax, by - ay);
      const n = Math.ceil(d / 10);
      for (let i = 1; i < n; i++) {
        const x = ax + ((bx - ax) * i) / n, y = ay + ((by - ay) * i) / n;
        if (this.blocksSight(Math.floor(x / T), Math.floor(y / T))) return false;
      }
      return true;
    }
    // Can a circle of radius r travel in a straight line from a to b?
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
      const tx0 = Math.floor((e.x - r) / T), tx1 = Math.floor((e.x + r) / T);
      const ty0 = Math.floor((e.y - r) / T), ty1 = Math.floor((e.y + r) / T);
      let hit = false;
      for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          if (!this.isSolidT(tx, ty)) continue;
          const rx = tx * T, ry = ty * T;
          const cx = U.clamp(e.x, rx, rx + T), cy = U.clamp(e.y, ry, ry + T);
          let dx = e.x - cx, dy = e.y - cy;
          const d = Math.hypot(dx, dy);
          if (d < r) {
            hit = true;
            if (d < 1e-4) {
              // Center inside the tile: push out along the shallowest axis.
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

    // Is this tile dangerous right now (for AI avoidance)?
    hazardCost(tx, ty) {
      const c = this.at(tx, ty);
      if (c === 'F') {
        const cl = this.fireOf.get(ty * this.w + tx);
        return cl.state === 'idle' ? (cl.t < 2.5 ? 25 : 2) : 60;
      }
      if (c === '=' && this.train) return this.train.state === 'idle' ? (this.train.t < 4 ? 40 : 2) : 80;
      if (this.trapAt(tx, ty)) return 30;
      return 0;
    }
    trapAt(tx, ty) {
      for (const tr of this.traps) if (tr.armed && tr.tx === tx && tr.ty === ty) return tr;
      return null;
    }
    dangerAt(x, y) {
      const tx = Math.floor(x / T), ty = Math.floor(y / T);
      const c = this.at(tx, ty);
      if (c === 'F') {
        const cl = this.fireOf.get(ty * this.w + tx);
        return cl.state !== 'idle' || cl.t < 1.2;
      }
      if (c === '=' && this.train) return this.train.state !== 'idle' || this.train.t < 3;
      return false;
    }
    safeNear(x, y) {
      const sx = Math.floor(x / T), sy = Math.floor(y / T);
      for (let rad = 1; rad < 8; rad++) {
        let best = null, bd = Infinity;
        for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
          const tx = sx + dx, ty = sy + dy;
          if (this.isSolidT(tx, ty) || this.hazardCost(tx, ty) > 3) continue;
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
        return !!opt.breakable && this.hasBarricade(tx, ty);
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
      if (start === goal) return [{ x: exactGoal ? gx : gtx * T + T / 2, y: exactGoal ? gy : gty * T + T / 2 }];
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
          let cost = c + this.hazardCost(nx, ny) * (opt.hazardScale ?? 1);
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
      for (const cl of this.fireClusters) {
        cl.t -= dt;
        if (cl.t > 0) continue;
        if (cl.state === 'idle') { cl.state = 'warn'; cl.t = 1.3; }
        else if (cl.state === 'warn') {
          cl.state = 'burn'; cl.t = 1.8;
          if (game.nearPlayer(cl.x, cl.y, 600)) G.Audio.play('fire', 0.8);
        } else { cl.state = 'idle'; cl.t = U.rand(5, 9.5); }
      }
      for (const tr of this.traps) if (!tr.armed && (tr.t -= dt) <= 0) tr.armed = true;
      for (const [k, b] of this.barricades) if ((b.t -= dt) <= 0) this.barricades.delete(k);

      const tr = this.train;
      if (tr) {
        tr.t -= dt;
        if (tr.state === 'idle' && tr.t <= 0) {
          tr.state = 'warn'; tr.t = 2.6; tr.dir = Math.random() < 0.5 ? 1 : -1;
          game.announce('⚠ TRAIN INCOMING', '#ffd23f');
          G.Audio.play('horn');
        } else if (tr.state === 'warn' && tr.t <= 0) {
          tr.state = 'run'; tr.hit.clear();
          tr.x = tr.dir > 0 ? -tr.len : this.pw;
        } else if (tr.state === 'run') {
          tr.x += tr.dir * 1500 * dt;
          for (const e of game.ents) {
            if (e.dead || tr.hit.has(e) || e.y < tr.y0 - e.r || e.y > tr.y1 + e.r) continue;
            if (e.x + e.r < tr.x || e.x - e.r > tr.x + tr.len) continue;
            tr.hit.add(e);
            const mid = (tr.y0 + tr.y1) / 2;
            e.y = e.y < mid ? tr.y0 - e.r - 2 : tr.y1 + e.r + 2;
            if (e.team === 'survivor') G.Ent.damage(game, e, 60, null, { cause: 'the train' });
            else G.Ent.stun(game, e, 2.5, null, true);
            game.shake(10);
          }
          if ((tr.dir > 0 && tr.x > this.pw + 50) || (tr.dir < 0 && tr.x + tr.len < -50)) { tr.state = 'idle'; tr.t = U.rand(22, 30); }
        }
        const bo = this.blackout;
        bo.t -= dt;
        if (bo.t <= 0) {
          bo.on = !bo.on;
          bo.t = bo.on ? 6 : U.rand(38, 50);
          if (bo.on) { game.announce('BLACKOUT', '#8fa3c7'); G.Audio.play('whoosh'); }
        }
      }
    }
  }

  G.World = World;
})();
