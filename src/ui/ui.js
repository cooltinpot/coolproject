// HUD and menu screens.
import { ITEMS } from '../blocks.js';
import { ICONS, buildHudIcons } from './icons.js';
import { renderStack } from './container.js';
import { tileCanvases } from '../textures.js';
import { listWorlds, createWorld, deleteWorld, loadSettings, saveSettings } from '../save.js';
import { audio } from '../audio.js';

const $ = (id) => document.getElementById(id);

const SPLASHES = ['Now in JavaScript!', '100% procedural!', 'No assets required!', 'Also try Terraria!', 'Punch trees!', 'Creeper? Aw man!',
  'Made of cubes!', 'Infinite worlds!', 'Diamonds!', 'Watch out for lava!', 'Ssssss...', 'Open source!', 'Now with farming!'];

export class UI {
  constructor() {
    buildHudIcons();
    this.settings = Object.assign({ renderDist: 6, fov: 75, sensitivity: 1, volume: 0.6, music: 0.35, bobbing: true, showFps: true, gamma: 0.5 }, loadSettings());
    this.screen = null;
    this.chatOpen = false;
    this.messages = [];
    this.game = null;
    this.hotbarEls = [];
    this.lastHeld = -1;
    this.heldNameTimer = 0;
    this.buildHud();
    this.bindMenus();
    const dirt = tileCanvases.dirt;
    if (dirt) {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(dirt, 0, 0, 64, 64);
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, 0, 64, 64);
      document.documentElement.style.setProperty('--dirt-bg', `url(${c.toDataURL()})`);
    }
  }

  // ---------- HUD ----------
  buildHud() {
    const hb = $('hotbar');
    hb.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const s = document.createElement('div');
      s.className = 'slot hb-slot';
      hb.appendChild(s);
      this.hotbarEls.push(s);
    }
    const mkRow = (id, n, cls) => {
      const r = $(id);
      r.innerHTML = '';
      const els = [];
      for (let i = 0; i < n; i++) { const im = document.createElement('img'); im.className = cls; r.appendChild(im); els.push(im); }
      return els;
    };
    this.heartEls = mkRow('hearts', 10, 'hud-icon');
    this.foodEls = mkRow('food', 10, 'hud-icon');
    this.airEls = mkRow('air', 10, 'hud-icon');
    this.armorEls = mkRow('armorrow', 10, 'hud-icon');
  }

  updateHud(game, dt) {
    const p = game.player;
    const inv = p.inventory;
    for (let i = 0; i < 9; i++) {
      const e = this.hotbarEls[i];
      const s = inv.slots[i];
      const sig = s ? `${s.id}:${s.count}:${s.dmg}` : '';
      if (e.dataset.sig !== sig) { renderStack(e, s); e.dataset.sig = sig; }
      e.classList.toggle('selected', i === inv.selected);
    }
    const survival = !p.creative;
    $('stats').style.display = survival ? 'flex' : 'none';
    $('xpbar').style.display = survival ? 'block' : 'none';
    if (survival) {
      const hp = Math.ceil(p.health);
      const shake = hp <= 4;
      this.heartEls.forEach((im, i) => {
        const v = hp - i * 2;
        const src = v >= 2 ? ICONS.heartFull : v === 1 ? ICONS.heartHalf : ICONS.heartEmpty;
        if (im.src !== src) im.src = src;
        im.style.transform = shake ? `translateY(${(Math.random() - 0.5) * 3}px)` : '';
        im.classList.toggle('flash', p.invuln > 0.25);
      });
      this.foodEls.forEach((im, i) => {
        const v = p.food - i * 2;
        const src = v >= 2 ? ICONS.foodFull : v === 1 ? ICONS.foodHalf : ICONS.foodEmpty;
        if (im.src !== src) im.src = src;
      });
      const ap = inv.armorPoints();
      this.armorEls.forEach((im, i) => {
        const v = ap - i * 2;
        const src = v >= 2 ? ICONS.armorFull : v === 1 ? ICONS.armorHalf : ICONS.armorEmpty;
        if (im.src !== src) im.src = src;
        im.style.visibility = ap > 0 ? 'visible' : 'hidden';
      });
      const showAir = p.headInWater || p.air < 15;
      const bubbles = Math.ceil((p.air / 15) * 10);
      this.airEls.forEach((im, i) => {
        if (im.src !== ICONS.bubble) im.src = ICONS.bubble;
        im.style.visibility = showAir && i < bubbles ? 'visible' : 'hidden';
      });
      const { level, progress } = game.xpInfo();
      $('xpfill').style.width = `${progress * 100}%`;
      $('xplevel').textContent = level > 0 ? level : '';
    }
    // held item name
    if (inv.selected !== this.lastHeld || (inv.held && inv.held.id) !== this.lastHeldId) {
      this.lastHeld = inv.selected;
      this.lastHeldId = inv.held && inv.held.id;
      this.heldNameTimer = inv.held ? 2.5 : 0;
      $('heldname').textContent = inv.held ? ITEMS[inv.held.id].display : '';
    }
    this.heldNameTimer -= dt;
    $('heldname').style.opacity = Math.max(0, Math.min(1, this.heldNameTimer));
    // overlays
    const ov = $('overlay');
    let bg = '';
    if (p.headInWater) bg = 'rgba(20,50,140,0.35)';
    if (game.cameraInLava) bg = 'rgba(220,80,10,0.7)';
    ov.style.background = bg;
    $('fire').style.display = p.burning > 0 && !p.creative ? 'block' : 'none';
    $('hurt').style.opacity = p.hurtTilt * 0.6;
    $('sleep').style.opacity = game.sleepFade || 0;
    // messages
    const now = performance.now();
    const log = $('chatlog');
    const visible = this.messages.filter((m) => this.chatOpen || now - m.t < 8000).slice(-10);
    const sig = visible.map((m) => m.t).join(',') + this.chatOpen;
    if (log.dataset.sig !== sig) {
      log.dataset.sig = sig;
      log.innerHTML = '';
      for (const m of visible) { const d = document.createElement('div'); d.textContent = m.text; d.style.color = m.color || '#fff'; log.appendChild(d); }
    }
  }

  message(text, color) {
    this.messages.push({ text, color, t: performance.now() });
    if (this.messages.length > 100) this.messages.shift();
  }

  setDebug(text) {
    const d = $('debug');
    d.style.display = text ? 'block' : 'none';
    if (text) d.textContent = text;
  }

  setFps(text) { $('fps').textContent = this.settings.showFps ? text : ''; }

  // ---------- chat ----------
  openChat(prefix = '') {
    this.chatOpen = true;
    const box = $('chatinput');
    box.style.display = 'block';
    box.value = prefix;
    setTimeout(() => box.focus(), 0);
  }
  closeChat() {
    this.chatOpen = false;
    const box = $('chatinput');
    box.style.display = 'none';
    box.blur();
  }

  // ---------- screens ----------
  show(name) {
    for (const s of document.querySelectorAll('.screen')) s.classList.remove('show');
    this.screen = name;
    if (name) $(name).classList.add('show');
    document.body.classList.toggle('menu-open', !!name);
  }

  bindMenus() {
    const click = (id, fn) => $(id).addEventListener('click', () => { audio.init(); audio.play('click'); fn(); });
    $('splash').textContent = SPLASHES[Math.floor(Math.random() * SPLASHES.length)];
    click('btn-singleplayer', () => { this.refreshWorlds(); this.show('worlds'); });
    click('btn-options-title', () => { this.optionsBack = 'title'; this.showOptions(); });
    click('btn-controls-title', () => { this.controlsBack = 'title'; this.show('controls'); });
    click('btn-worlds-back', () => this.show('title'));
    click('btn-create', () => {
      $('new-name').value = 'New World';
      $('new-seed').value = '';
      this.newMode = 'survival';
      $('btn-mode').textContent = 'Game Mode: Survival';
      this.show('create');
    });
    click('btn-mode', () => {
      this.newMode = this.newMode === 'survival' ? 'creative' : 'survival';
      $('btn-mode').textContent = `Game Mode: ${this.newMode === 'survival' ? 'Survival' : 'Creative'}`;
    });
    click('btn-create-cancel', () => this.show('worlds'));
    click('btn-create-go', () => {
      const name = $('new-name').value.trim() || 'New World';
      let seedStr = $('new-seed').value.trim();
      let seed;
      if (!seedStr) seed = Math.floor(Math.random() * 2147483647);
      else if (/^-?\d+$/.test(seedStr)) seed = parseInt(seedStr, 10) | 0;
      else { let h = 0; for (const ch of seedStr) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0; seed = h; }
      const id = createWorld(name, seed, this.newMode);
      this.onPlay && this.onPlay(id);
    });
    click('btn-resume', () => this.onResume && this.onResume());
    click('btn-options-pause', () => { this.optionsBack = 'pause'; this.showOptions(); });
    click('btn-controls-pause', () => { this.controlsBack = 'pause'; this.show('controls'); });
    click('btn-quit', () => this.onQuit && this.onQuit());
    click('btn-respawn', () => this.onRespawn && this.onRespawn());
    click('btn-death-title', () => this.onQuit && this.onQuit());
    click('btn-options-done', () => { saveSettings(this.settings); this.show(this.optionsBack); });
    click('btn-controls-done', () => this.show(this.controlsBack));
    for (const s of document.querySelectorAll('.screen')) s.addEventListener('keydown', (e) => e.stopPropagation());
    $('chatinput').addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const v = $('chatinput').value.trim();
        this.closeChat();
        if (v && this.onChat) this.onChat(v);
        this.onResume && this.onResume();
      } else if (e.key === 'Escape') {
        this.closeChat();
        this.onResume && this.onResume();
      }
    });
  }

  refreshWorlds() {
    const list = $('world-list');
    list.innerHTML = '';
    const worlds = listWorlds();
    if (!worlds.length) { list.innerHTML = '<div class="empty">No worlds yet. Create one!</div>'; }
    for (const w of worlds) {
      const row = document.createElement('div');
      row.className = 'world-row';
      const d = new Date(w.lastPlayed);
      row.innerHTML = `<div class="wname"></div><div class="winfo"></div>`;
      row.querySelector('.wname').textContent = w.name;
      row.querySelector('.winfo').textContent = `${w.mode === 'creative' ? 'Creative' : 'Survival'} · Seed ${w.seed} · ${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
      const play = document.createElement('button');
      play.className = 'btn small'; play.textContent = 'Play';
      play.addEventListener('click', () => { audio.init(); audio.play('click'); this.onPlay && this.onPlay(w.id); });
      const del = document.createElement('button');
      del.className = 'btn small danger'; del.textContent = 'Delete';
      del.addEventListener('click', () => {
        if (del.dataset.confirm) { deleteWorld(w.id); this.refreshWorlds(); }
        else { del.dataset.confirm = '1'; del.textContent = 'Confirm?'; }
      });
      const btns = document.createElement('div');
      btns.className = 'wbtns';
      btns.append(play, del);
      row.appendChild(btns);
      row.addEventListener('dblclick', () => this.onPlay && this.onPlay(w.id));
      list.appendChild(row);
    }
  }

  showOptions() {
    const s = this.settings;
    const box = $('options-list');
    box.innerHTML = '';
    const slider = (label, key, min, max, step, fmt) => {
      const row = document.createElement('label');
      row.className = 'opt';
      const span = document.createElement('span');
      const input = document.createElement('input');
      input.type = 'range'; input.min = min; input.max = max; input.step = step; input.value = s[key];
      const upd = () => { span.textContent = `${label}: ${fmt(Number(input.value))}`; };
      input.addEventListener('input', () => { s[key] = Number(input.value); upd(); this.onSettings && this.onSettings(s); });
      upd();
      row.append(span, input);
      box.appendChild(row);
    };
    const toggle = (label, key) => {
      const b = document.createElement('button');
      b.className = 'btn';
      const upd = () => { b.textContent = `${label}: ${s[key] ? 'ON' : 'OFF'}`; };
      b.addEventListener('click', () => { s[key] = !s[key]; upd(); audio.play('click'); this.onSettings && this.onSettings(s); });
      upd();
      box.appendChild(b);
    };
    slider('Render Distance', 'renderDist', 2, 16, 1, (v) => `${v} chunks`);
    slider('FOV', 'fov', 50, 110, 1, (v) => `${v}`);
    slider('Mouse Sensitivity', 'sensitivity', 0.2, 3, 0.05, (v) => `${Math.round(v * 100)}%`);
    slider('Brightness', 'gamma', 0, 1, 0.05, (v) => (v === 0 ? 'Moody' : v >= 1 ? 'Bright' : `${Math.round(v * 100)}%`));
    slider('Sound Volume', 'volume', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`);
    slider('Music Volume', 'music', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`);
    toggle('View Bobbing', 'bobbing');
    toggle('Show FPS', 'showFps');
    this.show('options');
  }

  setLoading(text, progress) {
    $('loading-text').textContent = text;
    $('loading-fill').style.width = `${Math.round(progress * 100)}%`;
  }
}
