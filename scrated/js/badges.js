// Badge tracking for the 200 SCRATED badges. Progress is saved in this
// browser (localStorage).
(function () {
  const G = window.G;
  const KEY = 'scrated_save_v2';

  const LORE = {
    'PART ONE: THE APARTMENT': [168, 185],
    'PART TWO: THE FOUNTAIN': [167, 146],
    'PART THREE: THE CAVE': [169, 170, 21],
    'PART FOUR: THE ANNIVERSARY': [171, 172, 143, 165, 193],
    'PART FIVE: NINE YEARS': [173, 174, 40, 192],
    PROTOCOL2: [52, 56],
    BURGERS: [65, 69, 70, 77, 182],
    'THE CREAKER': [86, 88, 89, 90, 92],
    'THE REVENGEST': [106, 107, 111, 112, 113],
    SCRATCHY: [],
    GRIFFPATCH: [158, 161],
    NANO: [125, 126, 129],
    'THE DOWNTIME': [178, 179, 180, 181, 189],
    'THE ENTITY — THE END': [],
    'THE SECRET — THE END\'S ENDGAME': [],
  };
  const ROSTER_PAGES = ['PART THREE: THE CAVE', 'PROTOCOL2', 'BURGERS', 'THE CREAKER', 'THE REVENGEST', 'SCRATCHY', 'GRIFFPATCH', 'NANO'];

  const B = (G.Badges = {
    data: null,
    load() {
      if (this.data) return this.data;
      try { this.data = JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { this.data = null; }
      if (!this.data) this.data = { earned: {}, stats: {}, seen: {} };
      return this.data;
    },
    save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* storage blocked */ } },
    has(id) { return !!this.load().earned[id]; },
    count() { return Object.keys(this.load().earned).length; },
    get(k) { return this.load().stats[k] || 0; },
    bump(k, n = 1) { const d = this.load(); d.stats[k] = (d.stats[k] || 0) + n; this.save(); return d.stats[k]; },
    award(id) {
      if (!id) return false;
      const d = this.load();
      if (d.earned[id]) return false;
      d.earned[id] = Date.now();
      this.save();
      const b = G.BADGES.find((x) => x.id === id);
      if (b) G.Menu && G.Menu.badgeToast(b);
      const n = this.count();
      if (n >= 50) this.award(18);
      if (n >= 100) this.award(19);
      if (n >= 199 && !d.earned[200]) this.award(200);
      if (n >= 199 && !d.earned[20]) this.award(20);
      return true;
    },
    milestone(hackerId) {
      const k = this.get('kills_' + hackerId);
      const M = G.MILESTONES;
      return k >= M[3] ? 3 : k >= M[2] ? 2 : k >= M[1] ? 1 : 0;
    },
    readLore(title) {
      const d = this.load();
      d.seen[title] = 1;
      this.save();
      for (const id of LORE[title] || []) this.award(id);
      if (ROSTER_PAGES.every((t) => d.seen[t])) { this.award(17); this.award(190); }
      if (['PROTOCOL2', 'BURGERS', 'THE CREAKER', 'THE REVENGEST'].every((t) => d.seen[t])) this.award(196);
      if (Object.keys(LORE).every((t) => d.seen[t])) this.award(197);
    },

    // Evaluated once per round, for the player's character.
    roundEnd(g) {
      const p = g.player;
      const id = p.def.id;
      const surv = p.team === 'survivor';
      const win = surv ? g.winner === 'survivors' : g.winner === 'killer';
      const escaped = surv && win && !p.dead;
      const playTime = g.time - 3;
      this.award(1);
      if (g.survivors.length === 3) this.award(2);
      const rounds = this.bump('rounds');
      if (rounds >= 50) this.award(6);
      if (rounds >= 100) this.award(11);
      if (rounds >= 250) this.award(199);
      G.Menu.streak = (G.Menu.streak || 0) + 1;
      if (G.Menu.streak >= 5) this.award(12);
      this.bump('played_' + id);
      if (Object.keys(G.CHARS).every((c) => this.get('played_' + c) > 0)) this.award(5);
      if (g.mapDef.id === 'mit') this.award(195);
      if (win && playTime < 60) this.award(3);
      if (!surv && win && g.timer <= 10) this.award(4);
      if (!surv && win && p.stats.taken > p.stats.damage) this.award(13);
      if (g.killer.maxRoam !== undefined && g.killer.maxRoam < 220 && surv && escaped) this.award(187);

      if (surv) {
        if (p.dead) { if (this.bump('deaths') >= 10) this.award(8); }
        if (p.dead && g.winner === 'survivors') this.award(14);
        if (escaped) {
          const esc = this.bump('escapes');
          const mine = this.bump('escapes_' + id);
          if (esc >= 10) this.award(7);
          if (playTime < 90) this.award(15);
          if (!g.lms) this.award(16);
          if (g.lms) this.award(10);
          if (g.survivors.length === 2 && g.survivors.every((s) => !s.dead)) {
            this.award(9);
            if (this.bump('duo_streak') >= 3) this.award(198);
          } else if (g.survivors.length === 2) this.data.stats.duo_streak = 0;
          if (id === 'nano') { if (mine >= 25) this.award(134); if ((p.deflects || 0) >= 4) this.award(132); if (p.stats.parries && p.armor > 0) this.award(124); }
          if (id === 'scratchy') { if (mine >= 25) this.award(149); if (p.pinnedRound) this.award(137); if (g.killer.def.id === 'sc') this.award(142); }
          if (id === 'griffpatch') {
            if (mine >= 15) this.award(159);
            if (mine >= 30) this.award(166);
            this.award(154); this.award(163);
            if (p.hp > 100) this.award(157);
          }
        }
        if (id === 'scratchy' && p.startHp >= 85 && this.bump('bandaged85') >= 10) this.award(147);
      } else {
        const ms = this.milestone(id);
        if (id === 'sc') { if (ms >= 1) this.award(24); if (ms >= 2) this.award(25); if (ms >= 3) this.award(26); }
        if (['sc', 'protocol2', 'burgers', 'creaker', 'revengest'].every((h) => this.milestone(h) >= 3)) this.award(191);
        if (win) {
          const wins = this.bump('wins_' + id);
          if (id === 'sc') {
            if (wins >= 100) this.award(27);
            if (g.survivors.length === 2) this.award(36);
            if (g.survivors.some((s) => s.def.id === 'scratchy') && this.bump('sc_vs_scratchy') >= 10) this.award(39);
          }
          if (id === 'protocol2') {
            if (wins >= 25) this.award(43);
            if (wins >= 50) this.award(57);
            if (p.raged) this.award(42);
            if (p.hp >= 500 && !p.stats.taken) this.award(47);
            if (p.ragedAt !== undefined && p.ragedAt <= g.time - 60) this.award(53);
          }
          if (id === 'burgers') { if (wins >= 25) this.award(74); if (!p.everStunned) this.award(67); if (playTime < 120) this.award(75); }
          if (id === 'creaker') { if (wins >= 25) this.award(98); if (!p.identified) this.award(87); if ((p.constructs || 0) >= 3) this.award(94); }
          if (id === 'revengest') { if (wins >= 25) this.award(118); if (!p.usedOmen) this.award(116); }
        }
      }
    },
  });
})();
