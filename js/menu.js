// Main menu: the Hollowed Codex (lore book), setup, pause and results screens.
(function () {
  const G = window.G;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

  const ROLE_COLORS = { SPEED: '#c7801a', DAMAGE: '#8b1a1a', 'CHASE START': '#5a3f8f', HEALTH: '#2f5f9e', STUNS: '#138a80', SUPPORT: '#b0303b', ENGINEER: '#b3600a' };
  const tag = (role) => `<span class="tag" style="background:${ROLE_COLORS[role] || '#555'}">${role}</span>`;

  // ------------------------------------------------------------- book pages
  function abilityHtml(key, ab) {
    return `<div class="ability">
      <div><span class="key">${key}</span><span class="name">${esc(ab.name)}</span>
        <span class="chip">windup ${ab.windup ? ab.windup + 's' : 'instant'}</span><span class="chip">cooldown ${ab.cd}s</span></div>
      <div>${esc(ab.desc)}</div>
      ${ab.use ? `<div class="how">How to use: ${esc(ab.use)}</div>` : ''}
    </div>`;
  }
  function charLeft(def) {
    return `<div class="portrait-wrap"><canvas class="portrait" width="300" height="300" data-portrait="${def.id}"></canvas>
      <div><h2>${esc(def.name)}</h2><div class="sub">${esc(def.title)}</div><div style="margin-top:6px">${tag(def.role)}<span class="chip">${def.team === 'killer' ? 'Killer' : 'Survivor'}</span></div>
      ${def.hp ? `<div style="margin-top:6px" class="chip">${def.hp} health</div>` : ''}</div></div>
      <div class="rule"></div>
      <p class="dropcap">${esc(def.lore)}</p>
      <h3>Appearance</h3><p>${esc(def.cosmetic)}</p>
      <h3>Passive: ${esc(def.passive.name)}</h3><p>${esc(def.passive.desc)}</p>`;
  }
  function charRight(def) {
    let h = `<h2>Abilities</h2>`;
    if (def.m1) h += abilityHtml('LMB', Object.assign({ desc: `Basic attack: ${def.m1.damage} damage in a short arc in front.`, use: 'Short windup. Aim slightly ahead of a running survivor.' }, def.m1));
    for (const k of Object.keys(def.abilities)) h += abilityHtml(k, def.abilities[k]);
    h += `<div class="note"><b>Synergy.</b> ${esc(def.synergy)}</div>`;
    if (def.counter) h += `<div class="note"><b>How survivors beat ${esc(def.name)}.</b> ${esc(def.counter)}</div>`;
    return h;
  }

  function buildSpreads() {
    const L = G.LORE;
    const s = [];
    s.push({
      chapter: 'Prologue',
      L: `<h2>Prologue</h2><div class="sub">as recorded by an unknown hand</div><div class="rule"></div>` +
        L.prologue.map((p, i) => `<p${i === 0 ? ' class="dropcap"' : ''}>${esc(p)}</p>`).join(''),
      R: `<h2>Rules of the Hollow</h2><div class="rule"></div><table>` +
        L.rules.map(([a, b]) => `<tr><td class="key">${a}</td><td>${esc(b)}</td></tr>`).join('') +
        `</table><div class="note">Each killer and survivor has a <b>playstyle</b>, shown by a coloured seal: Speed, Damage, Chase Start, Health, Stuns, Support, Engineer. Every kit is built to work with its class and with the team.</div>`,
    });
    s.push({
      chapter: 'Controls',
      L: `<h2>As a Survivor</h2><div class="rule"></div><table>` + L.controlsSurvivor.map(([a, b]) => `<tr><td class="key">${a}</td><td>${b}</td></tr>`).join('') +
        `</table><h3>Survival tips</h3><p>Sprint only when chased: stamina is life. Loop around crates and walls; they block the killer but not your view. Getting hit gives a brief burst of speed, so use it to break away.</p>`,
      R: `<h2>As the Killer</h2><div class="rule"></div><table>` + L.controlsKiller.map(([a, b]) => `<tr><td class="key">${a}</td><td>${b}</td></tr>`).join('') +
        `</table><h3>Reading windups</h3><p>Every ability glows on the ground before it fires: red wedges, rings and lanes. Your prey can see them too. Mix your timing, and hold strong abilities until the survivor has burned their escape tools.</p>
        <h3>Hunting</h3><p>Survivors fixing generators make noise. Generators fill with yellow sparks when someone is working on them.</p>`,
    });
    for (const id of Object.keys(G.KILLERS)) {
      const d = G.KILLERS[id];
      s.push({ chapter: 'Killers', L: charLeft(d), R: charRight(d) });
    }
    for (const id of Object.keys(G.SURVIVORS)) {
      const d = G.SURVIVORS[id];
      s.push({ chapter: 'Survivors', L: charLeft(d), R: charRight(d) });
    }
    for (const id of Object.keys(G.MAPS)) {
      const m = G.MAPS[id];
      s.push({
        chapter: 'Realms',
        L: `<h2>${esc(m.name)}</h2><div class="sub">a realm of the Hollow</div><div class="rule"></div><canvas class="mapprev" width="${m.layout[0].length * 6}" height="${m.layout.length * 6}" data-map="${id}"></canvas><p class="dropcap">${esc(m.lore)}</p>`,
        R: `<h2>Hazards &amp; Mechanics</h2><div class="rule"></div>` + m.hazards.map(([a, b]) => `<h3>${esc(a)}</h3><p>${esc(b)}</p>`).join('') +
          `<div class="note">Bots know the hazards too: survivors route around danger, and killers try to drive them into it.</div>`,
      });
    }
    s.push({
      chapter: 'Teamwork',
      L: `<h2>Bound Together</h2><div class="sub">combinations that win the night</div><div class="rule"></div>` +
        L.teamwork.map(([a, b]) => `<h3>${esc(a)}</h3><p>${esc(b)}</p>`).join(''),
      R: `<h2>The Final Page</h2><div class="rule"></div><p class="dropcap">The ink ends here. The rest of the story is yours to write, in stamina and blood and the hum of restored generators.</p>
        <p>Choose a side. Choose a name from these pages. When you are ready, step into the fog.</p>
        <div class="play-cta"><button class="btn play big" data-action="play">▶ PLAY</button></div>`,
    });
    return s;
  }

  function drawMapPreview(cv, id) {
    const m = G.MAPS[id];
    const ctx = cv.getContext('2d');
    const s = 6;
    const colors = { '#': '#1a120c', x: '#7a5530', G: '#ffe14d', ',': '#4f7a3a', F: '#ff6a1a', '>': '#777', '<': '#777', '=': '#555', T: '#ccc', O: '#6fb4ff', S: '#5dd36a', K: '#ff3030' };
    m.layout.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        ctx.fillStyle = colors[row[x]] || '#c9b48a';
        ctx.fillRect(x * s, y * s, s, s);
      }
    });
  }

  const Menu = (G.Menu = {
    spreads: [],
    page: 0,
    cfg: { role: 'survivor', charId: 'vex', opponent: 'random', mapId: 'random', difficulty: 'normal' },

    init() {
      this.spreads = buildSpreads();
      const book = $('book');
      $('cover').addEventListener('click', (e) => {
        if (e.target.closest('[data-action]')) return;
        this.openBook();
      });
      $('nextPage').onclick = () => (book.classList.contains('closed') ? this.openBook() : this.turn(1));
      $('prevPage').onclick = () => this.turn(-1);
      document.addEventListener('click', (e) => {
        const b = e.target.closest('[data-action="play"]');
        if (b) { G.Audio.init(); G.Audio.play('click'); this.showSetup(); }
      });
      document.addEventListener('keydown', (e) => {
        if ($('menu').classList.contains('hidden')) return;
        if (e.key === 'ArrowRight') $('nextPage').click();
        if (e.key === 'ArrowLeft') this.turn(-1);
      });
      // Chapter ribbons.
      const chapters = [...new Set(this.spreads.map((s) => s.chapter))];
      $('chapters').innerHTML = chapters.map((c) => `<button data-ch="${c}">${c}</button>`).join('');
      $('chapters').addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        const idx = this.spreads.findIndex((s) => s.chapter === b.dataset.ch);
        if (book.classList.contains('closed')) { this.openBook(idx); return; }
        this.turn(idx - this.page, true);
      });
      this.renderSpread();
      this.initSetup();
      $('resumeBtn').onclick = () => this.togglePause();
      $('quitBtn').onclick = () => this.toMenu();
      $('menuBtn').onclick = () => this.toMenu();
      $('againBtn').onclick = () => this.start();
    },

    openBook(idx = 0) {
      G.Audio.init();
      G.Audio.play('page');
      const book = $('book');
      this.page = idx;
      this.renderSpread();
      book.classList.remove('closed');
      book.classList.add('open');
    },

    turn(dir, jump) {
      const n = jump ? this.page + dir : this.page + Math.sign(dir);
      if (n < 0 || n >= this.spreads.length || n === this.page) return;
      const flip = $('flip');
      flip.className = 'flip';
      void flip.offsetWidth;
      flip.classList.add(dir > 0 ? 'next' : 'prev');
      G.Audio.play('page');
      this.page = n;
      setTimeout(() => this.renderSpread(), 260);
      setTimeout(() => (flip.className = 'flip'), 560);
    },

    renderSpread() {
      const sp = this.spreads[this.page];
      $('pageL').innerHTML = sp.L;
      $('pageR').innerHTML = sp.R;
      $('pageL').scrollTop = $('pageR').scrollTop = 0;
      $('folioL').textContent = `— ${this.page * 2 + 1} —`;
      $('folioR').textContent = `— ${this.page * 2 + 2} —`;
      document.querySelectorAll('#book canvas[data-portrait]').forEach((c) => G.Render.drawPortrait(c, c.dataset.portrait, { pose: true }));
      document.querySelectorAll('#book canvas[data-map]').forEach((c) => drawMapPreview(c, c.dataset.map));
      document.querySelectorAll('#chapters button').forEach((b) => b.classList.toggle('on', b.dataset.ch === sp.chapter));
      $('prevPage').disabled = this.page === 0;
      $('nextPage').disabled = this.page === this.spreads.length - 1;
    },

    // --------------------------------------------------------------- setup
    initSetup() {
      const seg = (el, items, key, after) => {
        el.innerHTML = items.map(([v, label]) => `<button data-v="${v}">${label}</button>`).join('');
        el.onclick = (e) => {
          const b = e.target.closest('button');
          if (!b) return;
          this.cfg[key] = b.dataset.v;
          G.Audio.play('click');
          if (after) after();
          this.refreshSetup();
        };
      };
      $('roleSeg').onclick = (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        this.cfg.role = b.dataset.role;
        this.cfg.charId = this.cfg.role === 'killer' ? 'blitz' : 'vex';
        G.Audio.play('click');
        this.refreshSetup();
      };
      seg($('oppSeg'), [['random', 'Random'], ...Object.values(G.KILLERS).map((k) => [k.id, k.name])], 'opponent');
      seg($('diffSeg'), Object.entries(G.DIFFICULTY).map(([k, v]) => [k, v.name]), 'difficulty');
      $('mapCards').innerHTML = [['random', 'Random Realm', 'Let the Hollow decide.']]
        .concat(Object.values(G.MAPS).map((m) => [m.id, m.name, m.hazards.map((h) => h[0]).join(' · ')]))
        .map(([id, nm, d]) => `<div class="card" data-map="${id}">${id === 'random' ? '' : `<canvas width="${48 * 4}" height="${32 * 4}" data-mp="${id}"></canvas>`}<div class="nm">${nm}</div><p>${d}</p></div>`)
        .join('');
      $('mapCards').querySelectorAll('canvas[data-mp]').forEach((c) => {
        const tmp = document.createElement('canvas');
        tmp.width = 48 * 6; tmp.height = 32 * 6;
        drawMapPreview(tmp, c.dataset.mp);
        c.getContext('2d').drawImage(tmp, 0, 0, c.width, c.height);
      });
      $('mapCards').onclick = (e) => {
        const c = e.target.closest('.card');
        if (!c) return;
        this.cfg.mapId = c.dataset.map;
        G.Audio.play('click');
        this.refreshSetup();
      };
      $('charCards').onclick = (e) => {
        const c = e.target.closest('.card');
        if (!c) return;
        this.cfg.charId = c.dataset.char;
        G.Audio.play('click');
        this.refreshSetup();
      };
      $('backBtn').onclick = () => { $('setup').classList.add('hidden'); $('menu').classList.remove('hidden'); };
      $('startBtn').onclick = () => this.start();
    },

    refreshSetup() {
      const c = this.cfg;
      document.querySelectorAll('#roleSeg button').forEach((b) => b.classList.toggle('on', b.dataset.role === c.role));
      document.querySelectorAll('#oppSeg button').forEach((b) => b.classList.toggle('on', b.dataset.v === c.opponent));
      document.querySelectorAll('#diffSeg button').forEach((b) => b.classList.toggle('on', b.dataset.v === c.difficulty));
      document.querySelectorAll('#mapCards .card').forEach((b) => b.classList.toggle('on', b.dataset.map === c.mapId));
      $('opponentRow').classList.toggle('hidden', c.role === 'killer');
      const defs = Object.values(c.role === 'killer' ? G.KILLERS : G.SURVIVORS);
      $('charCards').innerHTML = defs.map((d) => `<div class="card ${d.id === c.charId ? 'on' : ''}" data-char="${d.id}">
          <div class="top"><canvas width="128" height="128" data-portrait="${d.id}"></canvas>
          <div><div class="nm">${d.name}</div><div class="ti">${d.title}</div>${tag(d.role)}</div></div>
          <ul>${Object.entries(d.abilities).map(([k, a]) => `<li><b>${k}</b> ${a.name}</li>`).join('')}<li><b>Passive</b> ${d.passive.name}</li></ul></div>`).join('');
      $('charCards').querySelectorAll('canvas[data-portrait]').forEach((cv) => G.Render.drawPortrait(cv, cv.dataset.portrait));
    },

    showSetup() {
      $('menu').classList.add('hidden');
      $('results').classList.add('hidden');
      $('setup').classList.remove('hidden');
      this.refreshSetup();
    },

    start() {
      G.Audio.init();
      $('menu').classList.add('hidden');
      $('setup').classList.add('hidden');
      $('results').classList.add('hidden');
      $('pause').classList.add('hidden');
      G.game = new G.Game(Object.assign({}, this.cfg));
    },

    toMenu() {
      G.game = null;
      $('pause').classList.add('hidden');
      $('results').classList.add('hidden');
      $('setup').classList.add('hidden');
      $('menu').classList.remove('hidden');
    },

    togglePause() {
      const g = G.game;
      if (!g) return;
      g.paused = !g.paused;
      $('pause').classList.toggle('hidden', !g.paused);
      if (g.paused) {
        const p = g.player;
        const ctl = p.team === 'killer' ? G.LORE.controlsKiller : G.LORE.controlsSurvivor;
        const abs = Object.entries(p.def.abilities).map(([k, a]) => `<tr><td class="key">${k}</td><td><b>${a.name}</b>: ${esc(a.use)}</td></tr>`).join('');
        $('pauseInfo').innerHTML = `<table>${ctl.map(([a, b]) => `<tr><td class="key">${a}</td><td>${b}</td></tr>`).join('')}</table><h3 style="font-family:Cinzel,serif;color:#8b1a1a">${p.def.name}</h3><table>${abs}</table>`;
      }
    },

    showResults(g) {
      if (G.game !== g) return;
      const p = g.player;
      const survWin = g.winner === 'survivors';
      let title, sub;
      if (p.team === 'killer') {
        title = survWin ? 'DAWN BREAKS' : 'THE HUNT IS COMPLETE';
        sub = survWin ? `${g.alive.length} survivor(s) escaped your grasp.` : 'No one leaves the Hollow tonight.';
      } else {
        title = survWin ? (p.dead ? 'YOUR TEAM SURVIVED' : 'YOU SURVIVED') : 'CONSUMED BY THE HOLLOW';
        sub = survWin ? `${g.alive.length} of 5 survivors saw the dawn.` : `${g.killer.def.name} claimed every soul.`;
      }
      $('resTitle').textContent = title;
      $('resSub').textContent = sub + `  ·  ${g.mapDef.name}  ·  night lasted ${G.U.fmtTime(g.time)}`;
      const rows = g.survivors.map((s) => `<tr class="${s.isPlayer ? 'me' : ''}"><td style="color:${s.def.color};text-shadow:0 0 1px #000">●</td><td>${s.name}${s.isPlayer ? ' (you)' : ''}</td><td>${s.dead ? 'Dead' : 'Survived'}</td>
        <td>${Math.round(s.stats.gens * 10) / 10}</td><td>${s.stats.stuns}</td><td>${Math.round(s.stats.heals)}</td><td>${s.stats.blocks}</td><td>${Math.round(s.stats.taken)}</td></tr>`).join('');
      const k = g.killer;
      $('resTable').innerHTML = `<tr><th></th><th>Survivor</th><th>Fate</th><th>Gens</th><th>Stuns</th><th>Healed</th><th>Parries</th><th>Dmg taken</th></tr>${rows}
        <tr class="${k.isPlayer ? 'me' : ''}"><td style="color:${k.def.color}">●</td><td>${k.name}${k.isPlayer ? ' (you)' : ''}</td><td>Killer</td><td colspan="5">Kills: ${g.survivors.filter((s) => s.dead).length} · Damage dealt: ${Math.round(k.stats.damage)}</td></tr>`;
      $('results').classList.remove('hidden');
    },
  });

  window.addEventListener('DOMContentLoaded', () => {
    const canvas = $('game');
    G.Input.init(canvas);
    G.Render.init(canvas);
    Menu.init();
    requestAnimationFrame(G.loop);
  });
})();
