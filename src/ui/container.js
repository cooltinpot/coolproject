// Inventory / crafting / furnace / chest screens with Minecraft-style slot handling.
import { ITEMS, CREATIVE_ITEMS, maxStack } from '../blocks.js';
import { matchRecipe, sameItem, cloneStack, SMELTING } from '../inventory.js';
import { iconUrls } from '../textures.js';
import { audio } from '../audio.js';

function el(tag, cls, parent) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (parent) parent.appendChild(e);
  return e;
}

export function renderStack(slotEl, s) {
  slotEl.innerHTML = '';
  if (!s) return;
  const img = el('img', 'icon', slotEl);
  img.src = iconUrls[s.id] || '';
  img.draggable = false;
  if (s.count > 1) { const c = el('span', 'count', slotEl); c.textContent = s.count; }
  const def = ITEMS[s.id];
  if (def && def.durability && s.dmg > 0) {
    const bar = el('div', 'dura', slotEl);
    const f = 1 - s.dmg / def.durability;
    const fill = el('div', 'dura-fill', bar);
    fill.style.width = `${Math.max(0, f) * 100}%`;
    fill.style.background = `hsl(${f * 120}, 90%, 45%)`;
  }
}

export class ContainerScreen {
  constructor(root, game) {
    this.root = root;
    this.game = game;
    this.cursor = null;
    this.open = false;
    this.type = null;
    this.craftGrid = null;
    this.hover = null;
    this.cursorEl = el('div', 'slot cursor-stack', document.body);
    this.tooltip = el('div', 'tooltip', document.body);
    window.addEventListener('mousemove', (e) => {
      this.cursorEl.style.left = `${e.clientX - 18}px`;
      this.cursorEl.style.top = `${e.clientY - 18}px`;
      this.tooltip.style.left = `${e.clientX + 14}px`;
      this.tooltip.style.top = `${e.clientY - 28}px`;
    });
    root.addEventListener('mousedown', (e) => {
      if (e.target === root && this.cursor) {
        // click outside panel -> drop
        const drop = e.button === 2 ? { ...this.cursor, count: 1 } : this.cursor;
        this.game.dropStack(cloneStack(drop));
        if (e.button === 2) { this.cursor.count--; if (this.cursor.count <= 0) this.cursor = null; } else this.cursor = null;
        this.refresh();
      }
    });
    root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  get player() { return this.game.player; }
  get inv() { return this.game.player.inventory; }

  show(type, te = null) {
    this.type = type;
    this.te = te;
    this.open = true;
    this.creativeScroll = 0;
    this.creativeFilter = '';
    const size = type === 'crafting' ? 9 : type === 'inventory' ? 4 : 0;
    this.craftGrid = new Array(size).fill(null);
    this.craftW = type === 'crafting' ? 3 : 2;
    this.build();
    this.root.classList.add('show');
  }

  close() {
    if (!this.open) return;
    this.open = false;
    // return items
    const back = [...(this.craftGrid || [])];
    if (this.cursor) back.push(this.cursor);
    for (const s of back) {
      if (!s) continue;
      const left = this.inv.add(s);
      if (left > 0) this.game.dropStack({ ...s, count: left });
    }
    this.cursor = null;
    this.craftGrid = null;
    this.root.classList.remove('show');
    this.root.innerHTML = '';
    this.cursorEl.innerHTML = '';
    this.tooltip.style.display = 'none';
  }

  // ---------- slot model ----------
  slotsFor(section) {
    const inv = this.inv;
    const te = this.te;
    switch (section) {
      case 'hotbar': return Array.from({ length: 9 }, (_, i) => this.invSlot(i));
      case 'main': return Array.from({ length: 27 }, (_, i) => this.invSlot(9 + i));
      case 'craft': return this.craftGrid.map((_, i) => ({
        get: () => this.craftGrid[i], set: (s) => { this.craftGrid[i] = s; }, section: 'craft',
      }));
      case 'armor': return [0, 1, 2, 3].map((i) => ({
        get: () => inv.armor[i], set: (s) => { inv.armor[i] = s; inv.changed(); }, section: 'armor',
        accepts: (s) => !!(ITEMS[s.id].armor && ITEMS[s.id].armor.slot === i) && s.count === 1,
      }));
      case 'chest': return te.slots.map((_, i) => ({ get: () => te.slots[i], set: (s) => { te.slots[i] = s; }, section: 'chest' }));
      case 'furnace': return [0, 1, 2].map((i) => ({
        get: () => te.slots[i], set: (s) => { te.slots[i] = s; }, section: 'furnace', output: i === 2,
        accepts: i === 0 ? (s) => SMELTING[s.id] !== undefined : i === 1 ? (s) => !!ITEMS[s.id].fuel : () => false,
      }));
    }
    void inv;
    return [];
  }

  invSlot(i) {
    return { get: () => this.inv.slots[i], set: (s) => { this.inv.slots[i] = s; this.inv.changed(); }, section: i < 9 ? 'hotbar' : 'main', index: i };
  }

  craftResult() {
    if (!this.craftGrid) return null;
    return matchRecipe(this.craftGrid, this.craftW, this.craftGrid.length / this.craftW);
  }

  // ---------- building ----------
  build() {
    const root = this.root;
    root.innerHTML = '';
    const panel = el('div', 'panel container-panel', root);
    this.panel = panel;
    this.slotEls = [];
    const title = el('div', 'panel-title', panel);
    const mkGrid = (slots, cols, parent, cls = '') => {
      const g = el('div', 'slot-grid ' + cls, parent);
      g.style.gridTemplateColumns = `repeat(${cols}, 36px)`;
      for (const s of slots) this.makeSlot(s, g);
      return g;
    };
    const t = this.type;
    if (t === 'inventory' && this.player.creative) {
      title.textContent = 'Creative Inventory';
      const search = el('input', 'creative-search', panel);
      search.placeholder = 'Search items...';
      search.addEventListener('input', () => { this.creativeFilter = search.value.toLowerCase(); this.buildCreativeGrid(); });
      search.addEventListener('keydown', (e) => e.stopPropagation());
      this.creativeWrap = el('div', 'creative-wrap', panel);
      this.buildCreativeGrid();
      el('div', 'panel-sub', panel).textContent = 'Hotbar';
      mkGrid(this.slotsFor('hotbar'), 9, panel);
      const trash = el('div', 'slot trash', panel);
      trash.title = 'Destroy item';
      trash.textContent = '✕';
      trash.addEventListener('mousedown', (e) => { e.preventDefault(); if (e.shiftKey) { this.inv.slots.fill(null); this.inv.changed(); } this.cursor = null; this.refresh(); });
      this.refresh();
      return;
    }
    if (t === 'inventory' || t === 'crafting') {
      title.textContent = t === 'crafting' ? 'Crafting' : 'Inventory';
      const row = el('div', 'craft-row', panel);
      if (t === 'inventory') {
        const armorCol = el('div', 'armor-col', row);
        for (const s of this.slotsFor('armor')) this.makeSlot(s, armorCol, 'armor-slot');
        const pv = el('div', 'player-preview', row);
        pv.innerHTML = `<div class="pp-stats">❤ ${Math.ceil(this.player.health)} / 20<br>🍗 ${this.player.food} / 20<br>Level ${this.game.xpLevel()}</div>`;
      }
      mkGrid(this.slotsFor('craft'), this.craftW, row, 'craft-grid');
      el('div', 'arrow', row).textContent = '➜';
      const out = { get: () => this.craftResult(), set: () => {}, section: 'output', output: true, craft: true };
      this.makeSlot(out, row, 'big');
    } else if (t === 'furnace') {
      title.textContent = 'Furnace';
      const row = el('div', 'furnace-row', panel);
      const [inp, fuel, out] = this.slotsFor('furnace');
      const col = el('div', 'furnace-col', row);
      this.makeSlot(inp, col);
      this.flameEl = el('div', 'flame', col);
      this.makeSlot(fuel, col);
      this.arrowEl = el('div', 'progress-arrow', row);
      el('div', 'progress-fill', this.arrowEl);
      this.makeSlot(out, row, 'big');
    } else if (t === 'chest') {
      title.textContent = 'Chest';
      mkGrid(this.slotsFor('chest'), 9, panel);
    }
    el('div', 'panel-sub', panel).textContent = 'Inventory';
    mkGrid(this.slotsFor('main'), 9, panel);
    el('div', 'gap', panel);
    mkGrid(this.slotsFor('hotbar'), 9, panel);
    this.refresh();
  }

  buildCreativeGrid() {
    const wrap = this.creativeWrap;
    wrap.innerHTML = '';
    const g = el('div', 'slot-grid creative-grid', wrap);
    g.style.gridTemplateColumns = 'repeat(9, 36px)';
    const items = CREATIVE_ITEMS.filter((id) => !this.creativeFilter || ITEMS[id].display.toLowerCase().includes(this.creativeFilter));
    for (const id of items) {
      const s = el('div', 'slot', g);
      renderStack(s, { id, count: 1 });
      s.addEventListener('mouseenter', () => this.showTip(ITEMS[id].display));
      s.addEventListener('mouseleave', () => this.showTip(null));
      s.addEventListener('mousedown', (e) => {
        e.preventDefault();
        audio.play('click');
        if (this.cursor && !e.shiftKey) { this.cursor = null; }
        else if (e.shiftKey) this.inv.add({ id, count: maxStack(id), dmg: 0 });
        else this.cursor = { id, count: e.button === 2 ? 1 : maxStack(id), dmg: 0 };
        this.refresh();
      });
    }
  }

  makeSlot(slot, parent, extra = '') {
    const e = el('div', 'slot ' + extra, parent);
    this.slotEls.push([e, slot]);
    e.addEventListener('mousedown', (ev) => { ev.preventDefault(); ev.stopPropagation(); this.clickSlot(slot, ev.button, ev.shiftKey); });
    e.addEventListener('mouseenter', () => { this.hover = slot; const s = slot.get(); this.showTip(s ? ITEMS[s.id].display : null); });
    e.addEventListener('mouseleave', () => { if (this.hover === slot) this.hover = null; this.showTip(null); });
    return e;
  }

  showTip(text) {
    if (!text) { this.tooltip.style.display = 'none'; return; }
    this.tooltip.textContent = text;
    this.tooltip.style.display = 'block';
  }

  refresh() {
    if (!this.open) return;
    for (const [e, slot] of this.slotEls) renderStack(e, slot.get());
    renderStack(this.cursorEl, this.cursor);
    this.cursorEl.style.display = this.cursor ? 'block' : 'none';
    if (this.type === 'furnace' && this.te) {
      const te = this.te;
      const f = te.burnMax ? te.burn / te.burnMax : 0;
      this.flameEl.style.setProperty('--f', f.toFixed(3));
      this.arrowEl.firstChild.style.width = `${(te.cook / 10) * 100}%`;
    }
  }

  // ---------- interaction ----------
  takeCraft(shift) {
    const res = this.craftResult();
    if (!res) return;
    const consume = () => {
      for (let i = 0; i < this.craftGrid.length; i++) {
        const s = this.craftGrid[i];
        if (!s) continue;
        s.count--;
        if (s.count <= 0) this.craftGrid[i] = null;
        if (ITEMS[s.id].food && ITEMS[s.id].food.returns) { /* no-op */ }
        if (s.id === 272 || s.id === 273) this.craftGrid[i] = { id: 271, count: 1, dmg: 0 };
      }
    };
    if (shift) {
      let guard = 64;
      while (guard-- > 0) {
        const r = this.craftResult();
        if (!r || r.id !== res.id) break;
        const left = this.inv.add(r);
        if (left > 0) { if (left < r.count) consume(); break; }
        consume();
      }
    } else {
      if (!this.cursor) this.cursor = res;
      else if (sameItem(this.cursor, res) && this.cursor.count + res.count <= maxStack(res.id)) this.cursor.count += res.count;
      else return;
      consume();
    }
    audio.play('click');
  }

  clickSlot(slot, button, shift) {
    if (slot.craft) { this.takeCraft(shift); this.refresh(); return; }
    const cur = slot.get();
    if (shift && cur) { this.quickMove(slot); this.refresh(); return; }
    if (slot.output) {
      if (!cur) return;
      if (!this.cursor) { this.cursor = cur; slot.set(null); }
      else if (sameItem(this.cursor, cur) && this.cursor.count + cur.count <= maxStack(cur.id)) { this.cursor.count += cur.count; slot.set(null); }
      this.game.player.xp += 1;
      this.refresh();
      return;
    }
    const accepts = (s) => !slot.accepts || slot.accepts(s);
    if (button === 0) {
      if (!this.cursor) { if (cur) { this.cursor = cur; slot.set(null); } }
      else if (!cur) { if (accepts(this.cursor)) { slot.set(this.cursor); this.cursor = null; } }
      else if (sameItem(cur, this.cursor)) {
        const n = Math.min(this.cursor.count, maxStack(cur.id) - cur.count);
        cur.count += n; this.cursor.count -= n;
        if (this.cursor.count <= 0) this.cursor = null;
        slot.set(cur);
      } else if (accepts(this.cursor)) { slot.set(this.cursor); this.cursor = cur; }
    } else if (button === 2) {
      if (!this.cursor) {
        if (cur) {
          const half = Math.ceil(cur.count / 2);
          this.cursor = { ...cur, count: half };
          cur.count -= half;
          slot.set(cur.count > 0 ? cur : null);
        }
      } else if (!cur) {
        if (accepts(this.cursor)) { slot.set({ ...this.cursor, count: 1 }); this.cursor.count--; }
      } else if (sameItem(cur, this.cursor) && cur.count < maxStack(cur.id)) {
        cur.count++; this.cursor.count--; slot.set(cur);
      }
      if (this.cursor && this.cursor.count <= 0) this.cursor = null;
    }
    this.refresh();
  }

  addToSlots(slots, s) {
    // merge then empty
    for (const sl of slots) {
      const c = sl.get();
      if (c && sameItem(c, s) && c.count < maxStack(c.id)) {
        const n = Math.min(s.count, maxStack(c.id) - c.count);
        c.count += n; s.count -= n; sl.set(c);
        if (s.count <= 0) return 0;
      }
    }
    for (const sl of slots) {
      if (!sl.get() && (!sl.accepts || sl.accepts(s))) { sl.set({ ...s }); s.count = 0; return 0; }
    }
    return s.count;
  }

  quickMove(slot) {
    const s = slot.get();
    if (!s) return;
    let targets;
    const sec = slot.section;
    if (this.type === 'chest') targets = sec === 'chest' ? [...this.slotsFor('hotbar').reverse(), ...this.slotsFor('main').reverse()] : this.slotsFor('chest');
    else if (this.type === 'furnace') {
      if (sec === 'furnace') targets = [...this.slotsFor('main'), ...this.slotsFor('hotbar')];
      else {
        const [inp, fuel] = this.slotsFor('furnace');
        targets = SMELTING[s.id] !== undefined ? [inp] : ITEMS[s.id].fuel ? [fuel] : (sec === 'hotbar' ? this.slotsFor('main') : this.slotsFor('hotbar'));
      }
    } else if (sec === 'craft' || sec === 'armor') targets = [...this.slotsFor('main'), ...this.slotsFor('hotbar')];
    else if (ITEMS[s.id].armor && this.type === 'inventory' && !this.inv.armor[ITEMS[s.id].armor.slot]) targets = this.slotsFor('armor');
    else targets = sec === 'hotbar' ? this.slotsFor('main') : this.slotsFor('hotbar');
    const copy = { ...s };
    const left = this.addToSlots(targets, copy);
    slot.set(left > 0 ? { ...s, count: left } : null);
  }

  // number key swaps hovered slot with hotbar slot
  hotkey(n) {
    if (!this.hover || this.hover.craft) return;
    const hb = this.invSlot(n);
    if (hb === this.hover) return;
    const a = this.hover.get(), b = hb.get();
    if (this.hover.output && b) return;
    this.hover.set(b); hb.set(a);
    this.refresh();
  }

  dropHovered(all) {
    if (!this.hover || this.hover.craft) return;
    const s = this.hover.get();
    if (!s) return;
    const n = all ? s.count : 1;
    this.game.dropStack({ ...s, count: n });
    s.count -= n;
    this.hover.set(s.count > 0 ? s : null);
    this.refresh();
  }
}
