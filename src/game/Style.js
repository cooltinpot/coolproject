// Style meter (D -> SSS), combo counter and score. Variety is rewarded:
// repeating the same action yields diminishing style.
export const RANKS = [
  { id: 'D', name: 'DULL', at: 0, color: '#8b93b8' },
  { id: 'C', name: 'CRISP', at: 260, color: '#5ff4ff' },
  { id: 'B', name: 'BOLD', at: 620, color: '#6cff9a' },
  { id: 'A', name: 'AWESOME', at: 1100, color: '#ffe14a' },
  { id: 'S', name: 'SHARP', at: 1750, color: '#ff9a2e' },
  { id: 'SS', name: 'SYNCOPATED', at: 2600, color: '#ff2b8a' },
  { id: 'SSS', name: 'SYMPHONIC', at: 3600, color: '#d27bff' },
];
const MAX = 4800;

export class Style {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  reset() {
    this.meter = 0;
    this.rankIndex = 0;
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.comboTimer = 0;
    this.recent = [];
    this.peakRank = 0;
  }

  get rank() {
    return RANKS[this.rankIndex];
  }

  get progress() {
    const cur = RANKS[this.rankIndex];
    const next = RANKS[this.rankIndex + 1];
    if (!next) return Math.min(1, (this.meter - cur.at) / (MAX - cur.at));
    return (this.meter - cur.at) / (next.at - cur.at);
  }

  add(points, tag) {
    const same = this.recent.filter((t) => t === tag).length;
    const variety = Math.max(0.35, 1 - same * 0.16);
    this.recent.push(tag);
    if (this.recent.length > 8) this.recent.shift();
    const gained = points * variety;
    this.meter = Math.min(MAX, this.meter + gained);
    const waveMult = 1 + Math.max(0, this.game.director.waveIndex) * 0.1;
    this.score += Math.round(points * (1 + this.rankIndex * 0.25) * waveMult);
    if (tag !== 'kill' && tag !== 'evade') {
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.comboTimer = 3.5;
    }
    this._recalc();
  }

  addScore(v) {
    this.score += Math.round(v);
  }

  onDamage() {
    this.meter *= 0.55;
    this.combo = 0;
    this.comboTimer = 0;
    this._recalc();
  }

  _recalc() {
    let r = 0;
    for (let i = 0; i < RANKS.length; i++) if (this.meter >= RANKS[i].at) r = i;
    if (r !== this.rankIndex) {
      const up = r > this.rankIndex;
      this.rankIndex = r;
      this.peakRank = Math.max(this.peakRank, r);
      this.game.hud.onRankChange(RANKS[r], up);
      if (up) this.game.sfx.rankUp(r);
    }
  }

  update(dt, inCombat) {
    if (inCombat) {
      const decay = 45 + this.rankIndex * 32;
      this.meter = Math.max(0, this.meter - decay * dt);
    }
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }
    this._recalc();
  }
}
