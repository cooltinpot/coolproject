// SCRATED menus: the Bible book with the PLAY button, setup, badge book,
// results, downtime between rounds, pause, and the Final Round unlock.
(function () {
  const G = window.G;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const ROLE_COLORS = { POWER: '#c47a00', CHAOS: '#a24a1a', BRUTE: '#202020', DECEPTION: '#3a2a5c', RANGED: '#d9733a', SUPPORT: '#d9730d', STUNNER: '#2a6fd6', DEFENDER: '#4a6b2a' };
  const tag = (role) => `<span class="tag" style="background:${ROLE_COLORS[role] || '#555'}">${role}</span>`;
  const section = (title) => G.BIBLE.sections.find((s) => s.title === title);
  const CHAR_SECTION = { protocol2: 'PROTOCOL2', burgers: 'BURGERS', creaker: 'THE CREAKER', revengest: 'THE REVENGEST', scratchy: 'SCRATCHY', griffpatch: 'GRIFFPATCH', nano: 'NANO' };

  function paginate(paras, limit = 1250) {
    const pages = [];
    let cur = [], len = 0;
    for (const p of paras) {
      if (len + p.length > limit && cur.length) { pages.push(cur); cur = []; len = 0; }
      cur.push(p);
      len += p.length + 60;
    }
    if (cur.length) pages.push(cur);
    return pages;
  }
  const paraHtml = (p, first) => {
    if (/^".*"$/.test(p)) return `<p class="epithet">${esc(p)}</p>`;
    if (p.length < 26 && p === p.toUpperCase() && /[A-Z]/.test(p)) return `<p class="shout">${esc(p)}</p>`;
    if (/^In game:|^Passive/.test(p)) return `<p class="ingame">${esc(p)}</p>`;
    return `<p${first ? ' class="dropcap"' : ''}>${esc(p)}</p>`;
  };
  function abilityHtml(key, ab) {
    return `<div class="ability"><div><span class="key">${key}</span><span class="name">${esc(ab.name)}</span>
      <span class="chip">windup ${ab.windup ? ab.windup + 's' : 'instant'}</span>${ab.cd ? `<span class="chip">cooldown ${ab.cd}s</span>` : ''}</div>
      <div>${esc(ab.desc)}</div>${ab.use ? `<div class="how">How to use: ${esc(ab.use)}</div>` : ''}</div>`;
  }
  function kitPage(def) {
    let h = `<h2>In the Round</h2><div class="sub">${esc(def.passive.name)}: ${esc(def.passive.desc)}</div><div class="rule"></div>`;
    if (def.m1) h += abilityHtml('LMB', Object.assign({ use: 'Hitboxes come out over a short windup. Land them all.' }, def.m1));
    for (const k of Object.keys(def.abilities)) h += abilityHtml(k === 'R' && def.id === 'creaker' ? 'R / N' : k, def.abilities[k]);
    return h;
  }

  function buildSpreads() {
    const B = G.BIBLE;
    const s = [];
    s.push({
      chapter: 'Bible',
      L: `<div class="titlepage"><h1>SCRATED</h1><div class="sub">THE SCRATED BIBLE · A Complete Mythology</div><div class="rule"></div>
        <p class="epigraph">Five hackers pulled from broken dimensions. Three souls stolen from heaven. One block that was never just a block.</p><p class="byline">by peppinospaletti</p></div>`,
      R: `<h2>How a Round Works</h2><div class="rule"></div><table>
        <tr><td class="key">Survivors</td><td>escape if anyone is still standing when the round timer hits zero.</td></tr>
        <tr><td class="key">The hacker</td><td>wins by deleting every survivor. Drop a hacker to 0 HP and they are deleted instead.</td></tr>
        <tr><td class="key">Overtime</td><td>The last minute of the round. You will hear it.</td></tr>
        <tr><td class="key">LMS</td><td>When one survivor is left: Last Man Standing. The clock drops and the music changes.</td></tr>
        <tr><td class="key">Hitboxes</td><td>Every attack is a set of timed hitboxes with a windup. Read them, jump them, parry them.</td></tr>
        <tr><td class="key">Effects</td><td>Slowness I–IV and Speed I–II, GLITCHED and CORRUPTED damage over time.</td></tr></table>`,
    });
    s.push({
      chapter: 'Controls',
      L: `<h2>Survivor</h2><div class="rule"></div><table>
        <tr><td class="key">A / D</td><td>Move</td></tr><tr><td class="key">W / Space</td><td>Jump · W climbs ladders</td></tr>
        <tr><td class="key">S</td><td>Climb down · drop through catwalks</td></tr><tr><td class="key">Shift</td><td>Sprint (stamina)</td></tr>
        <tr><td class="key">Q / E</td><td>Abilities (they fire the way you face)</td></tr><tr><td class="key">F</td><td>Inspect things you find</td></tr>
        <tr><td class="key">Tab</td><td>Spectate when deleted</td></tr><tr><td class="key">Esc</td><td>Pause</td></tr></table>
        <p class="ingame">Scratchy steers SCRATCHING ROLL! with A / D. NANO's counter punch is E right after a parry.</p>`,
      R: `<h2>Hacker</h2><div class="rule"></div><table>
        <tr><td class="key">A / D · W · S</td><td>Move · jump/climb · drop</td></tr><tr><td class="key">Shift</td><td>Sprint</td></tr>
        <tr><td class="key">Left Click (or J)</td><td>Basic attack</td></tr><tr><td class="key">Q / E / R</td><td>Abilities (aimed ones follow the mouse)</td></tr>
        <tr><td class="key">N</td><td>THE CREAKER's reveal (same as R)</td></tr><tr><td class="key">Esc</td><td>Pause</td></tr></table>
        <p class="ingame">Hackers can phase through the hacker-only wall in D.M.</p>`,
    });
    const story = ['THE WORLD', 'THE ENTITY — THE END', 'PART ONE: THE APARTMENT', 'PART TWO: THE FOUNTAIN', 'PART THREE: THE CAVE', 'PART FOUR: THE ANNIVERSARY', 'PART FIVE: NINE YEARS'];
    const pagesFor = (title, chapter, extra) => {
      const sec = section(title);
      const pages = paginate(sec.paras);
      const out = [];
      pages.forEach((ps, i) => out.push({ title, html: (i === 0 ? `<div class="chapnum">${chapter}</div><h2>${esc(title)}</h2><div class="rule"></div>` : '') + ps.map((p, j) => paraHtml(p, i === 0 && j === 0)).join('') }));
      return out;
    };
    let pageList = [];
    for (const t of story) pageList.push(...pagesFor(t, 'The Story'));
    for (let i = 0; i < pageList.length; i += 2) s.push({ chapter: 'The Story', lore: [pageList[i].title, pageList[i + 1] && pageList[i + 1].title], L: pageList[i].html, R: pageList[i + 1] ? pageList[i + 1].html : '<div class="endmark">❖</div>' });

    const charSpread = (def, chapter) => {
      const title = CHAR_SECTION[def.id];
      const paras = title ? section(title).paras.filter((p) => !/^In game:|^Passive/.test(p)) : [def.lore];
      const lore = paras.map((p, i) => paraHtml(p, i === 1)).join('');
      s.push({
        chapter, lore: [title || 'PART THREE: THE CAVE'],
        L: `<div class="portrait-wrap"><canvas class="portrait" width="300" height="300" data-portrait="${def.id}"></canvas>
          <div><h2>${esc(def.name)}</h2><div class="sub">${esc(def.title)}</div><div style="margin-top:6px">${tag(def.role)}<span class="chip">${def.team === 'killer' ? 'Hacker · ' + def.hp + ' HP' : 'Survivor · ' + (def.id === 'scratchy' ? '80-90' : def.hp) + ' HP'}</span></div></div></div>
          <div class="rule"></div><div class="lore">${lore}</div>`,
        R: kitPage(def),
      });
    };
    for (const d of Object.values(G.KILLERS)) charSpread(d, 'Hackers');
    for (const d of Object.values(G.SURVIVORS)) charSpread(d, 'Survivors');
    const maps = section('THE MAPS').paras;
    Object.values(G.MAPS).forEach((m, i) => {
      s.push({
        chapter: 'Maps',
        L: `<h2>${esc(m.name)}</h2><div class="sub">${esc(m.sub)}</div><div class="rule"></div><canvas class="mapprev" width="${m.layout[0].length * 5}" height="${m.layout.length * 5}" data-map="${m.id}"></canvas>`,
        R: `<p class="dropcap">${esc(maps[i] || m.lore)}</p>`,
      });
    });
    const dt = pagesFor('THE DOWNTIME', 'Between Rounds');
    s.push({ chapter: 'Downtime', lore: ['THE DOWNTIME'], L: dt[0].html, R: dt[1] ? dt[1].html : `<h3>Tonight</h3><p>${esc(G.U.choice(G.DOWNTIME).text)}</p>` });
    const secret = pagesFor('THE SECRET — THE END\'S ENDGAME', 'Spoilers');
    const arg = pagesFor('THE ARG', 'For those who go looking');
    s.push({ chapter: 'Secrets', secret: true, lore: ['THE SECRET — THE END\'S ENDGAME'], L: `<div class="spoiler">${secret[0].html}</div>`, R: `<div class="spoiler">${(secret[1] || arg[0]).html}</div>` });
    if (secret[1]) s.push({ chapter: 'Secrets', secret: true, L: `<div class="spoiler">${arg[0].html}</div>`, R: arg[1] ? `<div class="spoiler">${arg[1].html}</div>` : '<div class="endmark">❖</div>' });
    s.push({
      chapter: 'Play',
      L: `<h2>The Last Page</h2><div class="rule"></div><p class="dropcap">${esc(G.BIBLE.credit)}</p><p>Pick a side. Pick a name from these pages. SC is waiting.</p>`,
      R: `<div class="play-cta"><button class="btn play big" data-action="play">▶ PLAY</button><br><br><button class="btn ghost" data-action="badges">★ Badge Book</button></div>`,
    });
    return s;
  }

  function drawMapPreview(cv, id) {
    const m = G.MAPS[id];
    const ctx = cv.getContext('2d');
    const s = cv.width / m.layout[0].length;
    const colors = { '#': '#2a2620', '=': '#c9a24a', H: '#6fb4ff', X: '#8a5ad8', b: '#b07a3a', h: '#3f7a28', p: '#5a2d8c', S: '#5dd36a', K: '#ff3030' };
    m.layout.forEach((row, y) => { for (let x = 0; x < row.length; x++) { ctx.fillStyle = colors[row[x]] || m.sky[1]; ctx.fillRect(x * s, y * s, s, s); } });
  }

  const Menu = (G.Menu = {
    spreads: [],
    page: 0,
    cfg: { role: 'survivor', charId: 'scratchy', opponent: 'random', mapId: 'random', difficulty: 'normal', survivors: 3 },

    init() {
      this.spreads = buildSpreads();
      $('cover').addEventListener('click', (e) => { if (!e.target.closest('[data-action]')) this.openBook(); });
      $('nextPage').onclick = () => ($('book').classList.contains('closed') ? this.openBook() : this.turn(1));
      $('prevPage').onclick = () => this.turn(-1);
      document.addEventListener('click', (e) => {
        const b = e.target.closest('[data-action]');
        if (!b) return;
        G.Audio.init();
        if (b.dataset.action === 'play') this.showSetup();
        if (b.dataset.action === 'badges') this.showBadges();
        if (b.dataset.action === 'spoiler') b.closest('.spoiler').classList.add('open');
      });
      document.addEventListener('keydown', (e) => {
        if ($('menu').classList.contains('hidden')) return;
        if (e.key === 'ArrowRight') $('nextPage').click();
        if (e.key === 'ArrowLeft') this.turn(-1);
      });
      const chapters = [...new Set(this.spreads.map((s) => s.chapter))];
      $('chapters').innerHTML = chapters.map((c) => `<button data-ch="${c}">${c}</button>`).join('') + '<button data-badges="1">★ Badges</button>';
      $('chapters').addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.badges) return this.showBadges();
        const idx = this.spreads.findIndex((s) => s.chapter === b.dataset.ch);
        if ($('book').classList.contains('closed')) return this.openBook(idx);
        this.turn(idx - this.page, true);
      });
      this.renderSpread();
      this.initSetup();
      $('resumeBtn').onclick = () => this.togglePause();
      $('quitBtn').onclick = () => this.toMenu();
      $('menuBtn').onclick = () => this.toMenu();
      $('downtimeBtn').onclick = () => this.showDowntime();
      $('nextRoundBtn').onclick = () => this.start();
      $('dtMenuBtn').onclick = () => this.toMenu();
      $('badgeClose').onclick = () => $('badgebook').classList.add('hidden');
      $('finaleBtn').onclick = () => this.startFinale();
      this.renderCover();
    },
    renderCover() {
      const c = $('coverArt');
      if (!c || !G.Render.ready) return;
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, c.width, c.height);
      const ids = ['protocol2', 'burgers', 'sc', 'creaker', 'revengest'];
      ids.forEach((id, i) => {
        const cv = document.createElement('canvas'); cv.width = 220; cv.height = 240;
        G.Render.drawPortrait(cv, id);
        const big = id === 'sc';
        const w = big ? 240 : 170, h = big ? 262 : 186;
        ctx.globalAlpha = big ? 1 : 0.85;
        ctx.drawImage(cv, 40 + i * 150 - (big ? 35 : 0), big ? 10 : 70, w, h);
      });
      ctx.globalAlpha = 1;
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
      $('pageL').scrollTop = $('pageR').scrollTop = 0;
      $('folioL').textContent = `— ${this.page * 2 + 1} —`;
      $('folioR').textContent = `— ${this.page * 2 + 2} —`;
      document.querySelectorAll('#book canvas[data-portrait]').forEach((c) => G.Render.drawPortrait(c, c.dataset.portrait));
      document.querySelectorAll('#book canvas[data-map]').forEach((c) => drawMapPreview(c, c.dataset.map));
      document.querySelectorAll('#book .spoiler').forEach((d) => { if (!d.querySelector('.spoil-btn')) d.insertAdjacentHTML('afterbegin', '<button class="btn ghost spoil-btn" data-action="spoiler">Reveal: spoils the ending</button>'); });
      document.querySelectorAll('#chapters button').forEach((b) => b.classList.toggle('on', b.dataset.ch === sp.chapter));
      $('prevPage').disabled = this.page === 0;
      $('nextPage').disabled = this.page === this.spreads.length - 1;
      if (sp.lore && !$('book').classList.contains('closed')) for (const t of sp.lore) if (t) G.Badges.readLore(t);
    },

    // ---------------------------------------------------------------- setup
    initSetup() {
      const seg = (el, items, key) => {
        el.innerHTML = items.map(([v, label]) => `<button data-v="${v}">${label}</button>`).join('');
        el.onclick = (e) => {
          const b = e.target.closest('button');
          if (!b) return;
          this.cfg[key] = isNaN(+b.dataset.v) ? b.dataset.v : +b.dataset.v;
          G.Audio.play('click');
          this.refreshSetup();
        };
      };
      $('roleSeg').onclick = (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        this.cfg.role = b.dataset.role;
        this.cfg.charId = this.cfg.role === 'killer' ? 'sc' : 'scratchy';
        this.refreshSetup();
      };
      seg($('oppSeg'), [['random', 'Random'], ...Object.values(G.KILLERS).map((k) => [k.id, k.name])], 'opponent');
      seg($('diffSeg'), Object.entries(G.DIFFICULTY).map(([k, v]) => [k, v.name]), 'difficulty');
      seg($('countSeg'), [[3, '3 survivors'], [2, '2 survivors']], 'survivors');
      $('mapCards').innerHTML = [['random', 'Random', 'Let SC decide.']]
        .concat(Object.values(G.MAPS).map((m) => [m.id, m.name, m.sub]))
        .map(([id, nm, d]) => `<div class="card" data-map="${id}">${id === 'random' ? '<div class="randblock">?</div>' : `<canvas width="${74 * 3}" height="${30 * 3}" data-mp="${id}"></canvas>`}<div class="nm">${nm}</div><p>${d}</p></div>`).join('');
      $('mapCards').querySelectorAll('canvas[data-mp]').forEach((c) => drawMapPreview(c, c.dataset.mp));
      $('mapCards').onclick = (e) => { const c = e.target.closest('.card'); if (c) { this.cfg.mapId = c.dataset.map; this.refreshSetup(); } };
      $('charCards').onclick = (e) => { const c = e.target.closest('.card'); if (c) { this.cfg.charId = c.dataset.char; this.refreshSetup(); } };
      $('backBtn').onclick = () => { $('setup').classList.add('hidden'); $('menu').classList.remove('hidden'); };
      $('startBtn').onclick = () => this.start();
    },
    refreshSetup() {
      const c = this.cfg;
      document.querySelectorAll('#roleSeg button').forEach((b) => b.classList.toggle('on', b.dataset.role === c.role));
      document.querySelectorAll('#oppSeg button').forEach((b) => b.classList.toggle('on', b.dataset.v === c.opponent));
      document.querySelectorAll('#diffSeg button').forEach((b) => b.classList.toggle('on', b.dataset.v === c.difficulty));
      document.querySelectorAll('#countSeg button').forEach((b) => b.classList.toggle('on', +b.dataset.v === c.survivors));
      document.querySelectorAll('#mapCards .card').forEach((b) => b.classList.toggle('on', b.dataset.map === c.mapId));
      $('opponentRow').classList.toggle('hidden', c.role === 'killer');
      const defs = Object.values(c.role === 'killer' ? G.KILLERS : G.SURVIVORS);
      $('charCards').innerHTML = defs.map((d) => {
        const ms = d.team === 'killer' ? G.Badges.milestone(d.id) : -1;
        return `<div class="card ${d.id === c.charId ? 'on' : ''}" data-char="${d.id}">
          <div class="top"><canvas width="140" height="150" data-portrait="${d.id}"></canvas>
          <div><div class="nm">${d.name}</div><div class="ti">${d.title}</div>${tag(d.role)}${ms >= 0 ? `<div class="ms">Milestone ${['I', 'II', 'III', 'IV'][ms]}</div>` : ''}</div></div>
          <ul>${d.m1 ? `<li><b>LMB</b> ${d.m1.name}</li>` : ''}${Object.entries(d.abilities).map(([k, a]) => `<li><b>${k}</b> ${a.name}</li>`).join('')}<li><b>Passive</b> ${d.passive.name}</li></ul></div>`;
      }).join('');
      $('charCards').querySelectorAll('canvas[data-portrait]').forEach((cv) => G.Render.drawPortrait(cv, cv.dataset.portrait));
      const unlocked = G.Badges.get('rounds') >= 1;
      $('finaleBtn').disabled = !unlocked;
      $('finaleNote').textContent = unlocked ? 'Five hundred years later, SC is done. Play GRIFFPATCH in the last round. (Spoils the ending.)' : 'Locked: finish any round to unlock it.';
    },
    showSetup() {
      this.hideAll();
      $('setup').classList.remove('hidden');
      this.refreshSetup();
    },
    hideAll() { for (const id of ['menu', 'setup', 'results', 'pause', 'downtime', 'badgebook']) $(id).classList.add('hidden'); },
    start() {
      G.Audio.init();
      this.hideAll();
      G.game = new G.Game(Object.assign({}, this.cfg));
    },
    startFinale() {
      G.Audio.init();
      this.hideAll();
      G.game = new G.Game({ role: 'survivor', charId: 'griffpatch', opponent: 'sc', mapId: 'mit', difficulty: 'normal', mode: 'finale', survivors: 3 });
    },
    toMenu() {
      G.game = null;
      this.streak = 0;
      G.Music.stop();
      this.hideAll();
      $('menu').classList.remove('hidden');
      this.renderCover();
    },
    togglePause() {
      const g = G.game;
      if (!g) return;
      g.paused = !g.paused;
      $('pause').classList.toggle('hidden', !g.paused);
      if (g.paused) {
        const p = g.player;
        $('pauseInfo').innerHTML = `<h3 class="ph">${p.def.name}</h3>` + kitPage(p.def);
        G.Music.tracks[G.Music.current] && G.Music.tracks[G.Music.current].pause();
      } else if (G.Music.current) G.Music.tracks[G.Music.current].play().catch(() => {});
    },

    // ------------------------------------------------------- badges / toast
    badgeToast(b) {
      const el = document.createElement('div');
      el.className = 'badge-toast';
      el.innerHTML = `<b>★ ${esc(b.name)}</b><span>${esc(b.desc)}</span>`;
      $('toasts').appendChild(el);
      setTimeout(() => el.classList.add('out'), 3800);
      setTimeout(() => el.remove(), 4400);
    },
    showBadges() {
      const d = G.Badges.load();
      const n = G.Badges.count();
      $('badgeCount').textContent = `${n} / 200`;
      $('badgeList').innerHTML = G.BADGE_SECTIONS.map((sec) => `<h3>${esc(sec)}</h3><div class="badges">` +
        G.BADGES.filter((b) => b.section === sec).map((b) => {
          const got = !!d.earned[b.id];
          const hidden = /Hidden/.test(b.tag) && !got;
          return `<div class="bdg ${got ? 'got' : ''}"><span class="bn">${b.id}. ${esc(hidden ? '???' : b.name)}</span><span class="bd">${esc(hidden ? 'Hidden badge.' : b.desc)}</span>${b.tag ? `<span class="bt">${esc(b.tag)}</span>` : ''}</div>`;
        }).join('') + '</div>').join('');
      $('badgebook').classList.remove('hidden');
    },

    // ------------------------------------------------------ results / downtime
    showResults(g) {
      if (G.game !== g) return;
      this.lastGame = g;
      const p = g.player;
      const survWin = g.winner === 'survivors';
      let title, sub;
      if (p.team === 'killer') {
        title = survWin ? (g.killer.dead ? 'YOU WERE DELETED' : 'THEY ESCAPED') : 'EVERYONE DELETED';
        sub = survWin ? `${g.alive.length} survivor(s) made it out.` : 'Nobody made it to the reset.';
      } else {
        title = survWin ? (p.dead ? 'YOUR TEAM ESCAPED' : 'YOU ESCAPED') : 'DELETED';
        sub = survWin ? `${g.alive.length} of ${g.survivors.length} survivors made it.` : `${g.killer.def.name} deleted everyone.`;
      }
      $('resTitle').textContent = title;
      $('resSub').textContent = `${sub}  ·  ${g.mapDef.name}  ·  ${G.U.fmtTime(g.time)}`;
      const rows = g.survivors.map((s) => `<tr class="${s.isPlayer ? 'me' : ''}"><td>${s.name}${s.isPlayer ? ' (you)' : ''}</td><td>${s.dead ? 'Deleted' : 'Escaped'}</td><td>${Math.round(s.stats.taken)}</td><td>${s.stats.stuns + s.stats.parries}</td></tr>`).join('');
      const k = g.killer;
      $('resTable').innerHTML = `<tr><th>Survivor</th><th>Fate</th><th>Damage taken</th><th>Stuns / parries</th></tr>${rows}
        <tr class="${k.isPlayer ? 'me' : ''}"><td>${k.name}${k.isPlayer ? ' (you)' : ''}</td><td>Hacker</td><td colspan="2">Deleted ${g.survivors.filter((s) => s.dead).length} · dealt ${Math.round(k.stats.damage)} · HP left ${Math.max(0, Math.round(k.hp))}</td></tr>`;
      const got = g.roundBadges.map((id) => G.BADGES.find((b) => b.id === id)).filter(Boolean);
      $('resBadges').innerHTML = got.length ? `<div class="label">Badges this round</div>` + got.map((b) => `<span class="mini-badge">★ ${esc(b.name)}</span>`).join('') : '';
      $('resUnlock').classList.toggle('hidden', G.Badges.get('rounds') !== 1);
      $('results').classList.remove('hidden');
    },
    showDowntime() {
      $('results').classList.add('hidden');
      const today = new Date().getDay();
      let pool = G.DOWNTIME.slice();
      if (today === 5 || today === 0) pool = pool.filter((d) => d.id === 'sonic');
      const ev = G.U.choice(pool);
      G.Badges.award(ev.badge);
      if (ev.extra) G.Badges.award(ev.extra);
      if (ev.id === 'sonic') { G.Badges.award(128); if (today === 5) G.Badges.award(108); }
      if (ev.who.length >= 2 && ev.who.some((w) => G.KILLERS[w]) && ev.who.some((w) => G.SURVIVORS[w])) G.Badges.award(188);
      $('dtText').textContent = ev.text;
      $('dtDay').textContent = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][today];
      const cv = $('dtScene');
      const ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, cv.width, cv.height);
      // Two rooms: hackers on the left, survivors on the right.
      ctx.fillStyle = '#1a1424'; ctx.fillRect(0, 0, cv.width / 2 - 4, cv.height);
      ctx.fillStyle = '#241a14'; ctx.fillRect(cv.width / 2 + 4, 0, cv.width / 2 - 4, cv.height);
      ctx.fillStyle = '#ffab19'; ctx.font = 'bold 14px Rubik, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText("HACKERS' ROOM", cv.width / 4, 22); ctx.fillText("SURVIVORS' ROOM", cv.width * 0.75, 22);
      const draw = (id, x, h) => {
        const tmp = document.createElement('canvas'); tmp.width = 160; tmp.height = 170;
        G.Render.drawPortrait(tmp, id);
        ctx.drawImage(tmp, x - 60, cv.height - 20 - h, 120, h);
      };
      const ks = ev.who.filter((w) => G.KILLERS[w]), ss = ev.who.filter((w) => G.SURVIVORS[w]);
      ks.forEach((id, i) => draw(id, cv.width / 4 + (i - (ks.length - 1) / 2) * 110, 150));
      ss.forEach((id, i) => draw(id, cv.width * 0.75 + (i - (ss.length - 1) / 2) * 110, 140));
      if (ev.id === 'sonic') { ctx.fillStyle = '#111'; ctx.fillRect(cv.width / 2 - 50, cv.height - 110, 100, 70); ctx.fillStyle = '#2a6fd6'; ctx.fillRect(cv.width / 2 - 44, cv.height - 104, 88, 50); ctx.fillStyle = '#fff'; ctx.font = 'bold 10px monospace'; ctx.fillText('SONIC 3', cv.width / 2, cv.height - 76); }
      $('downtime').classList.remove('hidden');
    },
  });

  window.addEventListener('DOMContentLoaded', () => {
    const canvas = $('game');
    G.Input.init(canvas);
    G.Render.init(canvas);
    G.Render.load().then(() => { Menu.renderSpread(); Menu.renderCover(); });
    Menu.init();
    requestAnimationFrame(G.loop);
  });
})();
