// SCRATED main menu: the story book (with the PLAY button), setup, pause,
// results and the Final Round unlock.
(function () {
  const G = window.G;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

  const ROLE_COLORS = { POWER: '#6b7280', CHAOS: '#2f9e5f', ADAPTIVE: '#c0392b', STEALTH: '#3f7f3a', SPEED: '#d9730d', SUPPORT: '#d98a00', STUNS: '#2a6fd6', HEALTH: '#5b7a3a' };
  const tag = (role) => `<span class="tag" style="background:${ROLE_COLORS[role] || '#555'}">${role}</span>`;
  const roundsPlayed = () => { try { return +localStorage.getItem('scrated_rounds') || 0; } catch (e) { return 0; } };

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
      <div><h2>${esc(def.name)}</h2><div class="sub">${esc(def.title)}</div><div style="margin-top:6px">${tag(def.role)}<span class="chip">${def.team === 'killer' ? 'Hacker' : 'Survivor'}</span></div>
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

  // Split a chapter's paragraphs into pages of roughly equal length.
  function storyPages(ch) {
    const pages = [];
    const LIMIT = 1350;
    let cur = [], len = 0;
    for (const p of ch.paras) {
      if (len + p.length > LIMIT && cur.length) { pages.push(cur); cur = []; len = 0; }
      cur.push(p);
      len += p.length + 60;
    }
    if (cur.length) pages.push(cur);
    if (pages.length % 2) pages.push(null);
    return pages;
  }
  const isShout = (p) => p.length < 40 && p === p.toUpperCase() && /[A-Z]/.test(p);

  function buildSpreads() {
    const S = G.STORY;
    const L = G.LORE;
    const s = [];
    s.push({
      chapter: 'Prologue',
      L: `<div class="titlepage"><h1>${esc(S.intro[0])}</h1><div class="sub">${esc(S.intro[1])}</div><div class="rule"></div>
          <p class="epigraph">${esc(S.intro[2])}</p><p class="byline">${esc(S.intro[3])}</p></div>`,
      R: `<h2>Rules of the Realm</h2><div class="sub">SC's game, as it has run for five hundred years</div><div class="rule"></div><table>` +
        L.rules.map(([a, b]) => `<tr><td class="key">${a}</td><td>${esc(b)}</td></tr>`).join('') +
        `</table><div class="note">Three survivors were stolen from heaven. Five hackers were pulled from broken dimensions. Every one of them has a <b>playstyle</b> (shown by the coloured seal), and every kit is built around it.</div>`,
    });
    s.push({
      chapter: 'Controls',
      L: `<h2>As a Survivor</h2><div class="rule"></div><table>` + L.controlsSurvivor.map(([a, b]) => `<tr><td class="key">${a}</td><td>${b}</td></tr>`).join('') +
        `</table><h3>Surviving the round</h3><p>Compile Code Terminals to bring the reset closer. Sprint only when chased. Getting hit gives you a burst of speed, so use it to break away. Read the glowing windups and step out of them.</p>`,
      R: `<h2>As a Hacker</h2><div class="rule"></div><table>` + L.controlsKiller.map(([a, b]) => `<tr><td class="key">${a}</td><td>${b}</td></tr>`).join('') +
        `</table><h3>Hunting</h3><p>Survivors compiling terminals make noise, and terminals throw coloured blocks when someone works on them. Your windups glow on the ground and your prey can see them, so mix your timing.</p>`,
    });
    for (const ch of S.chapters) {
      const pages = storyPages(ch);
      for (let i = 0; i < pages.length; i += 2) {
        const page = (ps, first) => {
          if (!ps) return `<div class="endmark">❖</div>`;
          let h = first ? `<div class="chapnum">${ch.num ? 'Chapter ' + ch.num : ''}</div><h2>${esc(ch.title)}</h2><div class="rule"></div>` : '';
          ps.forEach((p, j) => {
            if (isShout(p)) h += `<p class="shout">${esc(p)}</p>`;
            else h += `<p${first && j === 0 ? ' class="dropcap"' : ''}>${esc(p)}</p>`;
          });
          return h;
        };
        s.push({ chapter: 'The Story', story: true, L: page(pages[i], i === 0), R: page(pages[i + 1], false) });
      }
    }
    for (const d of Object.values(G.KILLERS)) s.push({ chapter: 'Hackers', L: charLeft(d), R: charRight(d) });
    for (const d of Object.values(G.SURVIVORS)) s.push({ chapter: 'Survivors', L: charLeft(d), R: charRight(d) });
    for (const [id, m] of Object.entries(G.MAPS)) {
      s.push({
        chapter: 'Realms',
        L: `<h2>${esc(m.name)}</h2><div class="sub">a copy kept in SC's realm</div><div class="rule"></div><canvas class="mapprev" width="${m.layout[0].length * 6}" height="${m.layout.length * 6}" data-map="${id}"></canvas><p class="dropcap">${esc(m.lore)}</p>`,
        R: `<h2>Hazards &amp; Mechanics</h2><div class="rule"></div>` + m.hazards.map(([a, b]) => `<h3>${esc(a)}</h3><p>${esc(b)}</p>`).join('') +
          `<div class="note">The bots know the realm too: survivors route around danger, and hackers use it.</div>`,
      });
    }
    s.push({
      chapter: 'Between Rounds',
      L: `<h2>Between Rounds</h2><div class="sub">They live in it.</div><div class="rule"></div>` +
        G.LORE.betweenRounds.slice(0, 6).map((b) => `<p>• ${esc(b)}</p>`).join(''),
      R: `<h2>Teamwork</h2><div class="rule"></div>` + L.teamwork.map(([a, b]) => `<h3>${esc(a)}</h3><p>${esc(b)}</p>`).join('') +
        `<div class="play-cta"><button class="btn play big" data-action="play">▶ PLAY</button></div>`,
    });
    return s;
  }

  function drawMapPreview(cv, id) {
    const m = G.MAPS[id];
    const ctx = cv.getContext('2d');
    const s = 6;
    const colors = { '#': '#15121c', x: '#7a5530', G: '#ffbf00', '~': '#2a6fb0', f: '#9aa3b5', n: '#8a6a3a', h: '#000', O: '#6fb4ff', b: '#d9cfb8', D: '#b3122a', S: '#5dd36a', K: '#ff3030' };
    m.layout.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        ctx.fillStyle = colors[row[x]] || '#a9a2b8';
        ctx.fillRect(x * s, y * s, s, s);
      }
    });
  }

  const Menu = (G.Menu = {
    spreads: [],
    page: 0,
    cfg: { role: 'survivor', charId: 'scratchy', opponent: 'random', mapId: 'random', difficulty: 'normal' },

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
      $('finaleBtn').onclick = () => this.startFinale();
    },

    openBook(idx = 0) {
      G.Audio.init();
      G.Audio.play('page');
      this.page = idx;
      this.renderSpread();
      $('book').classList.remove('closed');
      $('book').classList.add('open');
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
      $('book').classList.toggle('story', !!sp.story);
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
      const seg = (el, items, key) => {
        el.innerHTML = items.map(([v, label]) => `<button data-v="${v}">${label}</button>`).join('');
        el.onclick = (e) => {
          const b = e.target.closest('button');
          if (!b) return;
          this.cfg[key] = b.dataset.v;
          G.Audio.play('click');
          this.refreshSetup();
        };
      };
      $('roleSeg').onclick = (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        this.cfg.role = b.dataset.role;
        this.cfg.charId = this.cfg.role === 'killer' ? 'sc' : 'scratchy';
        G.Audio.play('click');
        this.refreshSetup();
      };
      seg($('oppSeg'), [['random', 'Random'], ...Object.values(G.KILLERS).map((k) => [k.id, k.name])], 'opponent');
      seg($('diffSeg'), Object.entries(G.DIFFICULTY).map(([k, v]) => [k, v.name]), 'difficulty');
      $('mapCards').innerHTML = [['random', 'Random Realm', 'Let SC decide.']]
        .concat(Object.values(G.MAPS).map((m) => [m.id, m.name, m.hazards.map((h) => h[0]).join(' · ')]))
        .map(([id, nm, d]) => `<div class="card" data-map="${id}">${id === 'random' ? '<div class="randblock">?</div>' : `<canvas width="${48 * 4}" height="${32 * 4}" data-mp="${id}"></canvas>`}<div class="nm">${nm}</div><p>${d}</p></div>`)
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
      const unlocked = roundsPlayed() >= 1;
      $('finaleBtn').disabled = !unlocked;
      $('finaleNote').textContent = unlocked
        ? 'Five hundred years later, SC is done. Play GRIFFPATCH in the last round. (Spoilers for the story\'s ending.)'
        : 'Locked: finish any round to unlock the last one.';
    },

    showSetup() {
      $('menu').classList.add('hidden');
      $('results').classList.add('hidden');
      $('setup').classList.remove('hidden');
      this.refreshSetup();
    },

    hideAll() {
      for (const id of ['menu', 'setup', 'results', 'pause']) $(id).classList.add('hidden');
    },
    start() {
      G.Audio.init();
      this.hideAll();
      G.game = new G.Game(Object.assign({}, this.cfg));
    },
    startFinale() {
      G.Audio.init();
      this.hideAll();
      G.game = new G.Game({ role: 'survivor', charId: 'griffpatch', opponent: 'sc', mapId: 'forums', difficulty: 'normal', mode: 'finale' });
    },

    toMenu() {
      G.game = null;
      this.hideAll();
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
        $('pauseInfo').innerHTML = `<table>${ctl.map(([a, b]) => `<tr><td class="key">${a}</td><td>${b}</td></tr>`).join('')}</table><h3 class="ph">${p.def.name}</h3><table>${abs}</table>`;
      }
    },

    showResults(g) {
      if (G.game !== g) return;
      const p = g.player;
      const survWin = g.winner === 'survivors';
      let title, sub;
      if (p.team === 'killer') {
        title = survWin ? 'SC RESETS THE ROUND' : 'EVERYONE DELETED';
        sub = survWin ? `${g.alive.length} survivor(s) made it to the reset.` : 'Nobody made it to the reset.';
      } else {
        title = survWin ? (p.dead ? 'YOUR TEAM MADE IT' : 'YOU SURVIVED THE ROUND') : 'DELETED';
        sub = survWin ? `${g.alive.length} of ${g.survivors.length} survivors made it to the reset.` : `${g.killer.def.name} deleted everyone.`;
      }
      $('resTitle').textContent = title;
      $('resSub').textContent = sub + `  ·  ${g.mapDef.name}  ·  round lasted ${G.U.fmtTime(g.time)}`;
      const rows = g.survivors.map((s) => `<tr class="${s.isPlayer ? 'me' : ''}"><td style="color:${s.def.color}">●</td><td>${s.name}${s.isPlayer ? ' (you)' : ''}</td><td>${s.dead ? 'Deleted' : 'Survived'}</td>
        <td>${Math.round(s.stats.gens * 10) / 10}</td><td>${s.stats.stuns}</td><td>${s.stats.blocks}</td><td>${Math.round(s.stats.taken)}</td></tr>`).join('');
      const k = g.killer;
      $('resTable').innerHTML = `<tr><th></th><th>Survivor</th><th>Fate</th><th>Terminals</th><th>Stuns</th><th>Parries</th><th>Dmg taken</th></tr>${rows}
        <tr class="${k.isPlayer ? 'me' : ''}"><td style="color:${k.def.color}">●</td><td>${k.name}${k.isPlayer ? ' (you)' : ''}</td><td>Hacker</td><td colspan="4">Deleted: ${g.survivors.filter((s) => s.dead).length} · Damage dealt: ${Math.round(k.stats.damage)}</td></tr>`;
      $('resBetween').textContent = G.U.choice(G.LORE.betweenRounds);
      $('resUnlock').classList.toggle('hidden', roundsPlayed() !== 1);
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
