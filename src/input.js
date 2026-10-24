export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = { dx: 0, dy: 0, buttons: new Set(), clicked: new Set(), wheel: 0 };
    this.locked = false;
    this.enabled = true;
    this.onKeyDown = null;
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (this.onKeyDown) this.onKeyDown(e);
      if (this.locked && ['Space', 'Tab', 'F3', 'F5', 'Slash', 'KeyT', 'Quote'].includes(e.code)) e.preventDefault();
      if (e.code.startsWith('F') && e.code.length <= 3 && this.locked) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.buttons.clear(); });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      this.mouse.buttons.add(e.button);
      this.mouse.clicked.add(e.button);
      e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => { this.mouse.buttons.delete(e.button); });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouse.dx += e.movementX || 0;
      this.mouse.dy += e.movementY || 0;
    });
    window.addEventListener('wheel', (e) => { if (this.locked) this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) { this.keys.clear(); this.mouse.buttons.clear(); }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  }
  lock() {
    const plain = () => {
      try { const q = this.canvas.requestPointerLock(); if (q && q.catch) q.catch(() => {}); } catch (e) { /* ignore */ }
    };
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch((e) => { if (e && e.name === 'NotSupportedError') plain(); });
    } catch (e) { plain(); }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  key(c) { return this.enabled && this.keys.has(c); }
  keyPressed(c) { return this.enabled && this.pressed.has(c); }
  button(b) { return this.enabled && this.mouse.buttons.has(b); }
  clicked(b) { return this.enabled && this.mouse.clicked.has(b); }
  endFrame() {
    this.pressed.clear();
    this.mouse.clicked.clear();
    this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.wheel = 0;
  }
}
