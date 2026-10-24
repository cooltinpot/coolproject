// DOM/Canvas HUD: vitals, Resonance, style rank, combo, wave banners, boss bar,
// floating damage numbers, enemy posture bars, riposte prompts, off-screen
// threat arrows and the THREAT LANE, a rhythm-game strip where beats and
// incoming attacks slide toward a central strike zone in time with the music.
import * as THREE from 'three';
import { clamp, damp } from '../core/MathUtil.js';
import { PARRY_WINDOW } from '../actors/Player.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(game) {
    this.game = game;
    this.root = $('hud');
    this.el = {
      hpBar: $('hp-bar'), hpFill: document.querySelector('#hp-bar .fill'), hpGhost: document.querySelector('#hp-bar .ghost'), hpNum: $('hp-num'),
      resBar: $('res-bar'), resFill: document.querySelector('#res-bar .fill'), resHint: $('res-hint'),
      pips: [...document.querySelectorAll('#dash-pips .pip')],
      waveNum: $('wave-num'), waveName: $('wave-name'), enemyCount: $('enemy-count'),
      boss: $('boss'), bossName: $('boss-name'), bossFill: document.querySelector('#boss-bar .fill'), bossGhost: document.querySelector('#boss-bar .ghost'), bossPosture: document.querySelector('#boss-bar .posture'), bossPhase: $('boss-phase'),
      score: $('score'), rankLetter: $('rank-letter'), rankName: $('rank-name'), rankFill: document.querySelector('#rank-bar .fill'), rankBar: $('rank-bar'), combo: $('combo'),
      popups: $('popups'), dmg: $('damage-layer'), enemyLayer: $('enemy-layer'), arrows: $('arrows'),
      target: $('target-marker'), banner: $('banner'), bannerSmall: $('banner-small'), bannerBig: $('banner-big'), bannerTip: $('banner-tip'), tip: $('tip'),
      lane: $('lane'), laneWrap: $('lane-wrap'),
    };
    this.ctx = this.el.lane.getContext('2d');
    this.hpGhost = 1;
    this.bossGhost = 1;
    this.dmgNums = [];
    this.ebars = new Map();
    this.arrowPool = [];
    this.laneFlashes = [];
    this.scoreShown = 0;
    this._v = new THREE.Vector3();
    this.showLane = true;
    this.tipTimer = 0;
  }

  show(v) {
    this.root.classList.toggle('hidden', !v);
  }

  reset() {
    this.hpGhost = 1;
    this.bossGhost = 1;
    this.scoreShown = 0;
    for (const d of this.dmgNums) d.el.remove();
    this.dmgNums = [];
    for (const b of this.ebars.values()) b.el.remove();
    this.ebars.clear();
    this.el.popups.innerHTML = '';
    this.el.boss.classList.add('hidden');
    this.el.tip.classList.add('hidden');
    this.el.banner.classList.add('hidden');
    this.laneFlashes = [];
    this.onRankChange({ id: 'D', name: 'DULL', color: '#8b93b8' }, false);
  }

  // ---------------------------------------------------------------- events

  popText(text, kind = 'parry', sub = '') {
    const d = document.createElement('div');
    d.className = 'pop ' + kind;
    d.innerHTML = text + (sub ? `<span class="sub">${sub}</span>` : '');
    this.el.popups.appendChild(d);
    while (this.el.popups.children.length > 3) this.el.popups.firstChild.remove();
    setTimeout(() => d.remove(), 950);
  }

  onParry(onBeat, chain, offset) {
    const ms = Math.round(offset * 1000);
    const timing = `${ms >= 0 ? '+' : ''}${ms}ms`;
    if (onBeat) this.popText('PERFECT', 'beat', `ON BEAT ${timing}${chain > 1 ? ' · CHAIN ×' + chain : ''}`);
    else this.popText('PARRY', 'parry', `${timing}${chain > 1 ? ' · CHAIN ×' + chain : ''}`);
    this.laneFlashes.push({ t: 0, color: onBeat ? '#ffd34a' : '#5ff4ff' });
  }

  onPlayerHit() {
    this.laneFlashes.push({ t: 0, color: '#ff3050' });
  }

  postureHit(enemy) {
    const b = this.ebars.get(enemy);
    if (b) b.lastShown = performance.now();
  }

  onRankChange(rank, up) {
    const L = this.el.rankLetter;
    L.textContent = rank.id;
    L.style.color = rank.color;
    this.el.rankName.textContent = rank.name;
    this.el.rankBar.style.color = rank.color;
    if (up) {
      L.classList.remove('bump');
      void L.offsetWidth;
      L.classList.add('bump');
    }
  }

  showWave(num, name, tip, boss) {
    const b = this.el.banner;
    b.classList.remove('hidden', 'boss');
    if (boss) b.classList.add('boss');
    b.style.animation = 'none';
    void b.offsetWidth;
    b.style.animation = '';
    this.el.bannerSmall.textContent = boss ? 'FINAL MOVEMENT' : this.game.director.endless ? 'ENCORE' : `WAVE ${num}`;
    this.el.bannerBig.textContent = name;
    this.el.bannerTip.textContent = '';
    this.el.waveNum.textContent = num;
    this.el.waveName.textContent = name;
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => b.classList.add('hidden'), 3300);
    if (tip) this.showTip(tip, 9);
  }

  showTip(text, seconds = 6) {
    this.el.tip.textContent = text;
    this.el.tip.classList.remove('hidden');
    this.tipTimer = seconds;
  }

  showBoss(boss) {
    this.el.boss.classList.remove('hidden');
    this.el.bossName.textContent = boss.name;
    this.bossGhost = 1;
  }

  hideBoss() {
    this.el.boss.classList.add('hidden');
  }

  damageNumber(pos, value, kind = 'enemy') {
    const el = document.createElement('div');
    el.className = 'dmg ' + kind;
    el.textContent = typeof value === 'number' ? (value % 1 ? value.toFixed(1) : value) : value;
    this.el.dmg.appendChild(el);
    this.dmgNums.push({ el, pos: pos.clone(), t: 0, vx: (Math.random() - 0.5) * 60, vy: -90 - Math.random() * 40 });
    if (this.dmgNums.length > 30) this.dmgNums.shift().el.remove();
  }

  // ---------------------------------------------------------------- update

  project(pos, out) {
    const cam = this.game.camera;
    this._v.copy(pos).project(cam);
    const w = window.innerWidth, h = window.innerHeight;
    out.x = (this._v.x * 0.5 + 0.5) * w;
    out.y = (-this._v.y * 0.5 + 0.5) * h;
    out.behind = this._v.z > 1;
    out.inView = !out.behind && this._v.x > -1 && this._v.x < 1 && this._v.y > -1 && this._v.y < 1;
    out.nx = this._v.x;
    out.ny = this._v.y;
    return out;
  }

  update(rawDt) {
    const g = this.game;
    const p = g.player;
    const e = this.el;
    this.tipTimer -= rawDt;
    if (this.tipTimer <= 0) e.tip.classList.add('hidden');

    // Vitals
    const hpF = clamp(p.hp / p.maxHp, 0, 1);
    this.hpGhost = this.hpGhost > hpF ? damp(this.hpGhost, hpF, 3, rawDt) : hpF;
    e.hpFill.style.transform = `scaleX(${hpF})`;
    e.hpGhost.style.transform = `scaleX(${this.hpGhost})`;
    e.hpNum.textContent = Math.ceil(p.hp);
    e.hpBar.classList.toggle('low', hpF < 0.3);
    const resF = p.resonance / 100;
    e.resFill.style.transform = `scaleX(${resF})`;
    e.resBar.classList.toggle('full', resF >= 1 && !p.overdriveActive);
    e.resBar.classList.toggle('overdrive', p.overdriveActive);
    e.resHint.classList.toggle('ready', resF >= 1 && !p.overdriveActive);
    e.pips.forEach((pip, i) => pip.classList.toggle('on', i < p.dashCharges));

    // Score (rolling counter), rank, combo
    this.scoreShown = damp(this.scoreShown, g.style.score, 10, rawDt);
    if (Math.abs(this.scoreShown - g.style.score) < 1) this.scoreShown = g.style.score;
    e.score.textContent = Math.round(this.scoreShown).toLocaleString();
    e.rankFill.style.transform = `scaleX(${clamp(g.style.progress, 0, 1)})`;
    e.combo.innerHTML = `<b>${g.style.combo}</b> COMBO`;
    e.combo.classList.toggle('hot', g.style.combo >= 10);
    e.combo.style.opacity = g.style.combo > 0 ? 1 : 0.35;

    const alive = g.enemies.filter((x) => x.alive && !x.isBoss).length;
    e.enemyCount.textContent = alive > 0 ? `${alive} HOSTILE${alive > 1 ? 'S' : ''}` : '';

    // Boss bar
    const boss = g.enemies.find((x) => x.isBoss && x.alive);
    if (boss) {
      const f = clamp(boss.hp / boss.maxHp, 0, 1);
      this.bossGhost = this.bossGhost > f ? damp(this.bossGhost, f, 2, rawDt) : f;
      e.bossFill.style.transform = `scaleX(${f})`;
      e.bossGhost.style.transform = `scaleX(${this.bossGhost})`;
      e.bossPosture.style.transform = `scaleX(${clamp(boss.posture / boss.maxPosture, 0, 1)})`;
      e.bossPhase.textContent = boss.staggered ? '— FALTERING —' : `MOVEMENT ${['I', 'II', 'III'][boss.phase - 1]}`;
    }

    this._updateDamageNumbers(rawDt);
    this._updateEnemyBars();
    this._updateTarget();
    const threats = g.collectThreats();
    this._updateArrows(threats);
    if (this.showLane) this._drawLane(rawDt, threats);
    e.laneWrap.style.display = this.showLane ? '' : 'none';
  }

  _updateDamageNumbers(dt) {
    const s = {};
    for (let i = this.dmgNums.length - 1; i >= 0; i--) {
      const d = this.dmgNums[i];
      d.t += dt;
      if (d.t > 0.9) {
        d.el.remove();
        this.dmgNums.splice(i, 1);
        continue;
      }
      this.project(d.pos, s);
      if (s.behind) { d.el.style.opacity = 0; continue; }
      const k = d.t;
      const x = s.x + d.vx * k;
      const y = s.y + d.vy * k + 160 * k * k;
      const sc = k < 0.1 ? 1.6 - k * 6 : 1;
      d.el.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${sc})`;
      d.el.style.left = '0px';
      d.el.style.top = '0px';
      d.el.style.opacity = k > 0.6 ? 1 - (k - 0.6) / 0.3 : 1;
    }
  }

  _updateEnemyBars() {
    const g = this.game;
    const now = performance.now();
    const s = {};
    const seen = new Set();
    for (const en of g.enemies) {
      if (!en.alive || en.isBoss || en.state === 'spawn') continue;
      const recently = now - (en._lastBarShow || 0) < 3500;
      if (en.lastHitTime > en.time - 0.05) en._lastBarShow = now;
      if (!(recently || en.staggered || en.posture > 1 || en.hp < en.maxHp)) continue;
      let b = this.ebars.get(en);
      if (!b) {
        const el = document.createElement('div');
        el.className = 'ebar';
        el.innerHTML = '<div class="hp"><div></div></div><div class="po"><div></div></div><div class="rip hidden">RIPOSTE</div>';
        this.el.enemyLayer.appendChild(el);
        b = { el, hp: el.querySelector('.hp div'), po: el.querySelector('.po div'), rip: el.querySelector('.rip') };
        this.ebars.set(en, b);
      }
      seen.add(en);
      const head = this._v.set(en.position.x, en.position.y + (en.type === 'drone' ? 1.1 : en.height * (en.rig ? en.rig.scale : 1) + 0.35), en.position.z);
      this.project(head.clone(), s);
      if (!s.inView) { b.el.style.display = 'none'; continue; }
      b.el.style.display = '';
      b.el.style.left = s.x + 'px';
      b.el.style.top = s.y + 'px';
      b.hp.style.transform = `scaleX(${clamp(en.hp / en.maxHp, 0, 1)})`;
      const pf = en.maxPosture >= 999 ? 0 : clamp(en.posture / en.maxPosture, 0, 1);
      b.po.style.width = pf * 100 + '%';
      b.rip.classList.toggle('hidden', !en.staggered);
    }
    for (const [en, b] of this.ebars) {
      if (!seen.has(en)) {
        b.el.remove();
        this.ebars.delete(en);
      }
    }
  }

  _updateTarget() {
    const g = this.game;
    const t = g.cameraRig.lockTarget && g.cameraRig.lockTarget.alive ? g.cameraRig.lockTarget : g.player.findTarget(9);
    const m = this.el.target;
    if (!t || !g.player.alive) { m.classList.add('hidden'); return; }
    const s = {};
    this.project(this._v.set(t.position.x, t.position.y + (t.lockHeight ?? 1.2), t.position.z).clone(), s);
    if (!s.inView) { m.classList.add('hidden'); return; }
    m.classList.remove('hidden');
    m.classList.toggle('locked', t === g.cameraRig.lockTarget);
    m.style.left = s.x + 'px';
    m.style.top = s.y + 'px';
  }

  _updateArrows(threats) {
    let n = 0;
    const s = {};
    const w = window.innerWidth, h = window.innerHeight;
    for (const th of threats) {
      if (th.time > 1.3 || th.time < 0) continue;
      this.project(this._v.copy(th.source).setY(th.source.y + 1).clone(), s);
      if (s.inView) continue;
      let nx = s.nx, ny = s.ny;
      if (s.behind) { nx = -nx; ny = -ny; }
      const ang = Math.atan2(-ny, nx);
      const len = Math.max(Math.abs(Math.cos(ang)) / (0.46), Math.abs(Math.sin(ang)) / (0.42));
      const x = w / 2 + (Math.cos(ang) / len) * w * 0.5;
      const y = h / 2 + (Math.sin(ang) / len) * h * 0.5;
      let a = this.arrowPool[n];
      if (!a) {
        a = document.createElement('div');
        a.className = 'arrow';
        this.el.arrows.appendChild(a);
        this.arrowPool.push(a);
      }
      a.style.display = '';
      a.classList.toggle('red', th.unblockable);
      const urgency = 1 - th.time / 1.3;
      a.style.transform = `translate(${x - 14}px, ${y - 13}px) rotate(${ang + Math.PI / 2}rad) scale(${0.8 + urgency * 0.7})`;
      a.style.opacity = 0.4 + urgency * 0.6;
      n++;
      if (n >= 8) break;
    }
    for (let i = n; i < this.arrowPool.length; i++) this.arrowPool[i].style.display = 'none';
  }

  // The rhythm lane. Beats and threats move inward from both edges and meet
  // in the centre on impact; the side tells you where the attack comes from.
  _drawLane(dt, threats) {
    const g = this.game;
    const c = this.ctx;
    const W = this.el.lane.width, H = this.el.lane.height;
    const cx = W / 2, cy = H / 2 + 4;
    const half = W / 2 - 20;
    const horizon = 1.6; // seconds shown
    c.clearRect(0, 0, W, H);

    // Body
    const grad = c.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, 'rgba(95,244,255,0)');
    grad.addColorStop(0.5, 'rgba(20,14,48,0.75)');
    grad.addColorStop(1, 'rgba(255,43,138,0)');
    c.fillStyle = grad;
    c.fillRect(0, cy - 20, W, 40);
    c.strokeStyle = 'rgba(255,255,255,0.08)';
    c.beginPath();
    c.moveTo(20, cy); c.lineTo(W - 20, cy);
    c.stroke();

    // Beats
    const m = g.music;
    const beatPos = m.beatPos;
    const spb = m.spb;
    const firstBeat = Math.ceil(beatPos - 0.05);
    for (let b = firstBeat; b < beatPos + horizon / spb + 1; b++) {
      const t = (b - beatPos) * spb;
      if (t > horizon) break;
      const off = (t / horizon) * half;
      const down = b % 4 === 0;
      const a = clamp(1 - t / horizon, 0, 1);
      c.strokeStyle = down ? `rgba(255,43,138,${0.35 + a * 0.6})` : `rgba(95,244,255,${0.2 + a * 0.5})`;
      c.lineWidth = down ? 3 : 2;
      const hh = down ? 16 : 10;
      for (const sgn of [-1, 1]) {
        c.beginPath();
        c.moveTo(cx + sgn * off, cy - hh);
        c.lineTo(cx + sgn * off, cy + hh);
        c.stroke();
      }
    }

    // Strike zone (width = parry window)
    const zone = (PARRY_WINDOW / horizon) * half;
    const kick = m.kickEnvelope();
    c.fillStyle = `rgba(255,211,74,${0.12 + kick * 0.25})`;
    c.fillRect(cx - zone, cy - 26, zone * 2, 52);
    c.strokeStyle = `rgba(255,255,255,${0.6 + kick * 0.4})`;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(cx, cy - 30); c.lineTo(cx, cy + 30);
    c.stroke();
    // Parry window indicator for the player
    const p = g.player;
    if (p.parryWindow > 0 || p.blocking) {
      c.strokeStyle = p.parryWindow > 0 ? 'rgba(220,255,255,0.95)' : 'rgba(255,160,64,0.8)';
      c.lineWidth = 3;
      c.strokeRect(cx - zone - 4, cy - 30, zone * 2 + 8, 60);
    } else if (p.parryCooldown > 0) {
      c.fillStyle = 'rgba(255,48,80,0.25)';
      c.fillRect(cx - zone, cy - 26, zone * 2, 52);
    }

    // Threats
    const camRight = g.cameraRig.rightFlat;
    for (const th of threats) {
      if (th.time > horizon || th.time < -0.15) continue;
      const rel = (th.source.x - p.position.x) * camRight.x + (th.source.z - p.position.z) * camRight.z;
      const sgn = rel >= 0 ? 1 : -1;
      const x = cx + sgn * Math.max(0, th.time / horizon) * half;
      const near = clamp(1 - th.time / 0.4, 0, 1);
      const size = 9 + near * 6;
      c.save();
      c.translate(x, cy);
      if (th.unblockable) {
        c.strokeStyle = '#ff3050';
        c.shadowColor = '#ff3050';
        c.shadowBlur = 12;
        c.lineWidth = 4;
        c.beginPath();
        c.moveTo(-size, -size); c.lineTo(size, size);
        c.moveTo(size, -size); c.lineTo(-size, size);
        c.stroke();
      } else if (th.kind === 'projectile') {
        c.fillStyle = '#5ff4ff';
        c.shadowColor = '#5ff4ff';
        c.shadowBlur = 12;
        c.beginPath();
        c.arc(0, 0, size * 0.75, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#fff';
        c.beginPath();
        c.arc(0, 0, size * 0.35, 0, Math.PI * 2);
        c.fill();
      } else {
        c.fillStyle = '#ffd34a';
        c.shadowColor = '#ffd34a';
        c.shadowBlur = 14;
        c.rotate(Math.PI / 4);
        c.fillRect(-size * 0.75, -size * 0.75, size * 1.5, size * 1.5);
        c.fillStyle = '#fff';
        c.fillRect(-size * 0.3, -size * 0.3, size * 0.6, size * 0.6);
      }
      c.restore();
    }

    // Result flashes
    for (let i = this.laneFlashes.length - 1; i >= 0; i--) {
      const f = this.laneFlashes[i];
      f.t += dt;
      if (f.t > 0.4) { this.laneFlashes.splice(i, 1); continue; }
      const k = f.t / 0.4;
      c.strokeStyle = f.color;
      c.globalAlpha = 1 - k;
      c.lineWidth = 4;
      c.beginPath();
      c.arc(cx, cy, 10 + k * 40, 0, Math.PI * 2);
      c.stroke();
      c.globalAlpha = 1;
    }
  }
}
