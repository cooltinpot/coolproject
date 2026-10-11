// Side-view tile world: solids, one-way catwalks, ladders, the hacker-only
// wall, physics for boxes, line of sight, and the bot navigation graph.
(function () {
  const G = window.G;
  const T = (G.TILE = 32);
  const U = G.U;

  G.PHYS = { gravity: 2100, maxFall: 1100, jump: 740, refRun: 220 };

  // Tiles that block everyone.
  const SOLID = new Set(['#', 'b', 'h', 'p']);

  class World {
    constructor(def) {
      this.def = def;
      const rows = def.layout;
      this.h = rows.length;
      this.w = rows[0].length;
      this.pw = this.w * T;
      this.ph = this.h * T;
      this.grid = [];
      this.spawnsS = [];
      this.spawnK = null;
      this.eggs = [];
      for (let y = 0; y < this.h; y++) {
        for (let x = 0; x < this.w; x++) {
          let c = rows[y][x] || '.';
          if (c === 'S') { this.spawnsS.push({ x: x * T + T / 2, y: (y + 1) * T }); c = '.'; }
          else if (c === 'K') { this.spawnK = { x: x * T + T / 2, y: (y + 1) * T }; c = '.'; }
          else if ('CBLPUYM'.includes(c)) { this.eggs.push({ kind: c, x: x * T + T / 2, y: (y + 1) * T, found: false }); c = '.'; }
          this.grid.push(c);
        }
      }
      this.graphs = {};
    }
    at(tx, ty) {
      if (tx < 0 || tx >= this.w || ty < 0 || ty >= this.h) return '#';
      return this.grid[ty * this.w + tx];
    }
    solidFor(team, tx, ty) {
      const c = this.at(tx, ty);
      return SOLID.has(c) || (c === 'X' && team === 'survivor');
    }
    blocksSight(tx, ty) { return SOLID.has(this.at(tx, ty)); }
    isLadder(tx, ty) { return this.at(tx, ty) === 'H'; }
    // Catwalks, and the top rung of a ladder, hold you up from above.
    isOneWay(tx, ty) {
      const c = this.at(tx, ty);
      if (c === '=') return true;
      return c === 'H' && this.at(tx, ty - 1) !== 'H' && !SOLID.has(this.at(tx, ty - 1));
    }
    los(ax, ay, bx, by) {
      const d = Math.hypot(bx - ax, by - ay);
      const n = Math.ceil(d / 12);
      for (let i = 1; i < n; i++) {
        const x = ax + ((bx - ax) * i) / n, y = ay + ((by - ay) * i) / n;
        if (this.blocksSight(Math.floor(x / T), Math.floor(y / T))) return false;
      }
      return true;
    }

    // ---------------------------------------------------------------- physics
    // b: {x (center), y (feet), w, h, vx, vy, team, drop, climbing, flying}
    // Moves the box by its velocity, resolving tiles. Returns {hitX, hitY}.
    move(b, dt) {
      const res = { hitX: false, hitY: false, landed: false };
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(b.vx), Math.abs(b.vy)) * dt / 8));
      const sdt = dt / steps;
      for (let i = 0; i < steps; i++) {
        // Horizontal.
        if (b.vx) {
          b.x += b.vx * sdt;
          const top = Math.floor((b.y - b.h + 1) / T), bot = Math.floor((b.y - 1) / T);
          if (b.vx > 0) {
            const tx = Math.floor((b.x + b.w / 2) / T);
            for (let ty = top; ty <= bot; ty++) if (this.solidFor(b.team, tx, ty) && !b.ghost) { b.x = tx * T - b.w / 2 - 0.01; res.hitX = true; break; }
          } else {
            const tx = Math.floor((b.x - b.w / 2) / T);
            for (let ty = top; ty <= bot; ty++) if (this.solidFor(b.team, tx, ty) && !b.ghost) { b.x = (tx + 1) * T + b.w / 2 + 0.01; res.hitX = true; break; }
          }
        }
        // Vertical.
        if (b.vy) {
          const oldY = b.y;
          b.y += b.vy * sdt;
          const l = Math.floor((b.x - b.w / 2 + 1) / T), r = Math.floor((b.x + b.w / 2 - 1) / T);
          if (b.vy > 0) {
            const ty = Math.floor(b.y / T);
            for (let tx = l; tx <= r; tx++) {
              const solid = this.solidFor(b.team, tx, ty) && !b.ghost;
              const plat = !b.drop && !b.climbing && this.isOneWay(tx, ty) && oldY <= ty * T + 0.5;
              if (solid || plat) { b.y = ty * T; b.vy = 0; res.hitY = true; res.landed = true; break; }
            }
          } else {
            const ty = Math.floor((b.y - b.h) / T);
            for (let tx = l; tx <= r; tx++) {
              if (this.solidFor(b.team, tx, ty) && !b.ghost) { b.y = (ty + 1) * T + b.h; b.vy = 0; res.hitY = true; break; }
            }
          }
        }
      }
      b.x = U.clamp(b.x, T + b.w / 2, this.pw - T - b.w / 2);
      return res;
    }
    onGround(b) {
      const ty = Math.floor((b.y + 1) / T);
      if (Math.abs(b.y - ty * T) > 1.5) return false;
      const l = Math.floor((b.x - b.w / 2 + 1) / T), r = Math.floor((b.x + b.w / 2 - 1) / T);
      for (let tx = l; tx <= r; tx++) {
        if (this.solidFor(b.team, tx, ty)) return true;
        if (!b.drop && this.isOneWay(tx, ty)) return true;
      }
      return false;
    }
    ladderAt(b) {
      const tx = Math.floor(b.x / T);
      const t1 = Math.floor((b.y - 2) / T), t2 = Math.floor((b.y - b.h / 2) / T);
      if (this.isLadder(tx, t1) || this.isLadder(tx, t2)) return tx;
      return -1;
    }
    // Is the ladder continuing below the feet (to climb down from a ladder top)?
    ladderBelow(b) {
      const tx = Math.floor(b.x / T);
      return this.isLadder(tx, Math.floor((b.y + 2) / T)) ? tx : -1;
    }

    // ------------------------------------------------------ navigation graph
    // One graph per (team, box size). Nodes are tile cells where feet can rest.
    graph(team, w, h) {
      const key = team + w + 'x' + h;
      if (!this.graphs[key]) this.graphs[key] = this.buildGraph(team, w, h);
      return this.graphs[key];
    }
    clear(team, tx, ty, h) {
      const rows = Math.ceil(h / T);
      for (let i = 0; i < rows; i++) if (this.solidFor(team, tx, ty - i)) return false;
      return true;
    }
    standable(team, tx, ty, h) {
      if (!this.clear(team, tx, ty, h)) return false;
      return this.solidFor(team, tx, ty + 1) || this.isOneWay(tx, ty + 1);
    }
    buildGraph(team, w, h) {
      const W = this.w;
      const nodes = new Map();
      const add = (tx, ty, kind) => {
        const k = ty * W + tx;
        if (!nodes.has(k)) nodes.set(k, { k, tx, ty, x: tx * T + T / 2, y: (ty + 1) * T, kind, edges: [] });
        return nodes.get(k);
      };
      for (let ty = 1; ty < this.h - 1; ty++) for (let tx = 1; tx < W - 1; tx++) {
        if (this.standable(team, tx, ty, h)) add(tx, ty, 'ground');
        else if (this.isLadder(tx, ty) && this.clear(team, tx, ty, h)) add(tx, ty, 'ladder');
      }
      const get = (tx, ty) => nodes.get(ty * W + tx);
      const link = (a, b, type, cost, extra) => { if (a && b && a !== b) a.edges.push(Object.assign({ to: b.k, type, cost }, extra)); };
      for (const n of nodes.values()) {
        // Walking.
        if (n.kind === 'ground') {
          for (const d of [-1, 1]) {
            const m = get(n.tx + d, n.ty);
            if (m && m.kind === 'ground') link(n, m, 'walk', 1);
          }
        }
        // Ladders: climb between vertically adjacent ladder-ish nodes.
        if (this.isLadder(n.tx, n.ty) || this.isLadder(n.tx, n.ty - 1)) link(n, get(n.tx, n.ty - 1), 'climb', 1.3);
        if (this.isLadder(n.tx, n.ty) || this.isLadder(n.tx, n.ty + 1)) link(n, get(n.tx, n.ty + 1), 'climb', 1.1);
      }
      // Jumps, falls and drops, found by simulating the real physics.
      const P = G.PHYS;
      const sim = (sx, sy, vx, vy, drop) => {
        const b = { x: sx, y: sy, w, h, vx, vy, team, drop: drop ? 0.25 : 0, climbing: false };
        let t = 0, left = false;
        for (let i = 0; i < 150; i++) {
          const dt = 1 / 60;
          t += dt;
          b.vy = Math.min(P.maxFall, b.vy + P.gravity * dt);
          if (b.drop) { b.drop = Math.max(0, b.drop - dt); }
          const r = this.move(b, dt);
          if (r.hitX) b.vx = 0;
          if (b.y - sy < -2 || Math.abs(b.y - sy) > 2 || Math.abs(b.x - sx) > T) left = true;
          if (r.landed && left && t > 0.05) {
            const tx = Math.floor(b.x / T), ty = Math.floor((b.y - 1) / T);
            return { node: get(tx, ty), t };
          }
        }
        return null;
      };
      for (const n of nodes.values()) {
        if (n.kind !== 'ground') continue;
        for (const dir of [-1, 1]) {
          for (const frac of [0.3, 0.6, 1.0]) {
            const r = sim(n.x, n.y, dir * frac * P.refRun, -P.jump, false);
            if (r && r.node && r.node !== n && r.node.kind === 'ground') link(n, r.node, 'jump', 2 + r.t * 3, { dir, frac });
          }
          const side = get(n.tx + dir, n.ty);
          if (!side && !this.solidFor(team, n.tx + dir, n.ty) && this.clear(team, n.tx + dir, n.ty, h)) {
            const r = sim(n.x + dir * T * 0.6, n.y, dir * 150, 0, false);
            if (r && r.node && r.node !== n) link(n, r.node, 'fall', 1 + r.t * 2, { dir });
          }
        }
        const up = sim(n.x, n.y, 0, -P.jump, false);
        if (up && up.node && up.node !== n && up.node.kind === 'ground') link(n, up.node, 'jump', 2 + up.t * 3, { dir: 0, frac: 0 });
        if (this.at(n.tx, n.ty + 1) === '=') {
          const r = sim(n.x, n.y + 2, 0, 50, true);
          if (r && r.node && r.node !== n) link(n, r.node, 'drop', 1 + r.t * 2);
        }
      }
      return { nodes, team, w, h };
    }

    nodeAt(graph, x, y, maxR = 4) {
      const tx = Math.floor(x / T), ty = Math.floor((y - 1) / T);
      const n = graph.nodes.get(ty * this.w + tx);
      if (n) return n;
      let best = null, bd = Infinity;
      for (let r = 1; r <= maxR && !best; r++) {
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          const m = graph.nodes.get((ty + dy) * this.w + tx + dx);
          if (!m) continue;
          const d = Math.abs(dx) + Math.abs(dy) * 1.5 + (dy < 0 ? 1 : 0);
          if (d < bd) { bd = d; best = m; }
        }
      }
      return best;
    }

    // Dijkstra from a node: distance map (used for fleeing and hunting).
    distances(graph, start, limit = 9999) {
      const dist = new Map([[start.k, 0]]);
      const open = [[0, start.k]];
      while (open.length) {
        let bi = 0;
        for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
        const [d, k] = open.splice(bi, 1)[0];
        if (d > (dist.get(k) ?? Infinity) || d > limit) continue;
        for (const e of graph.nodes.get(k).edges) {
          const nd = d + e.cost;
          if (nd < (dist.get(e.to) ?? Infinity)) { dist.set(e.to, nd); open.push([nd, e.to]); }
        }
      }
      return dist;
    }

    findPath(graph, from, to, costFn) {
      if (!from || !to) return null;
      if (from === to) return [];
      const g = new Map([[from.k, 0]]);
      const came = new Map();
      const hf = (n) => (Math.abs(n.tx - to.tx) + Math.abs(n.ty - to.ty)) * 0.9;
      const open = [[hf(from), from.k]];
      const closed = new Set();
      let iter = 0;
      while (open.length && iter++ < 5000) {
        let bi = 0;
        for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
        const k = open.splice(bi, 1)[0][1];
        if (k === to.k) break;
        if (closed.has(k)) continue;
        closed.add(k);
        const n = graph.nodes.get(k);
        for (const e of n.edges) {
          const m = graph.nodes.get(e.to);
          const ng = g.get(k) + e.cost + (costFn ? costFn(m) : 0);
          if (ng < (g.get(e.to) ?? Infinity)) {
            g.set(e.to, ng);
            came.set(e.to, { from: k, edge: e });
            open.push([ng + hf(m), e.to]);
          }
        }
      }
      if (!came.has(to.k)) return null;
      const path = [];
      let k = to.k;
      while (k !== from.k) {
        const c = came.get(k);
        path.push(Object.assign({ node: graph.nodes.get(k) }, c.edge));
        k = c.from;
      }
      return path.reverse();
    }
  }

  G.World = World;
})();
