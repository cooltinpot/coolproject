// Keyboard + mouse (pointer lock) + gamepad, mapped to abstract actions.
// Presses are timestamped so gameplay can buffer them (e.g. queue the next combo hit).

const KEY_MAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Space: 'jump',
  ShiftLeft: 'dash', ShiftRight: 'dash',
  KeyF: 'parry', KeyK: 'parry',
  KeyJ: 'attack',
  KeyQ: 'overdrive',
  KeyE: 'lock', Tab: 'lock',
  Escape: 'pause', KeyP: 'pause',
};

const PAD_MAP = {
  0: 'jump', 1: 'dash', 2: 'attack', 3: 'overdrive',
  4: 'parry', 5: 'parry', 6: 'dash', 7: 'parry',
  9: 'pause', 11: 'lock',
};

const ACTIONS = ['up', 'down', 'left', 'right', 'jump', 'dash', 'parry', 'attack', 'overdrive', 'lock', 'pause'];

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = {};
    this.pressTime = {};
    this.consumed = {};
    this.pressedThisFrame = {};
    this.lookDX = 0;
    this.lookDY = 0;
    this.sensitivity = 1;
    this.invertY = false;
    this.locked = false;
    // Free-cursor fallback for frames that refuse pointer lock: the cursor
    // stays visible, mouse motion still aims, and pushing it to the screen
    // edge keeps turning the camera.
    this.lockFailed = false;
    this.everLocked = false;
    this.freeLook = false;
    this.cursorNX = 0.5;
    this.enabled = true;
    this.now = 0;
    this.usingPad = false;
    this.padPrev = {};
    this.moveX = 0;
    this.moveY = 0;
    this.onPointerLockChange = null;
    for (const a of ACTIONS) {
      this.down[a] = false;
      this.pressTime[a] = -10;
      this.consumed[a] = true;
    }

    window.addEventListener('keydown', (e) => {
      const a = KEY_MAP[e.code];
      if (!a) return;
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      if (e.repeat) return;
      this.usingPad = false;
      this._press(a);
    });
    window.addEventListener('keyup', (e) => {
      const a = KEY_MAP[e.code];
      if (a) this.down[a] = false;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked && !this.freeLook) return;
      this.usingPad = false;
      if (e.button === 0) this._press('attack');
      else if (e.button === 2) this._press('parry');
      else if (e.button === 1) { e.preventDefault(); this._press('lock'); }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.down.attack = false;
      else if (e.button === 2) this.down.parry = false;
      else if (e.button === 1) this.down.lock = false;
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      this.cursorNX = e.clientX / Math.max(1, window.innerWidth);
      if (!this.locked) {
        if (this.freeLook && Math.abs(e.movementX) < 200 && Math.abs(e.movementY) < 200) {
          this.lookDX += e.movementX * 0.8;
          this.lookDY += e.movementY * 0.8;
        }
        return;
      }
      // Chrome occasionally reports a huge spurious jump right after locking.
      if (Math.abs(e.movementX) > 350 || Math.abs(e.movementY) > 350) return;
      this.lookDX += e.movementX;
      this.lookDY += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (this.locked) { this.everLocked = true; this.lockFailed = false; }
      if (!this.locked) {
        for (const a of ACTIONS) this.down[a] = false;
      }
      if (this.onPointerLockChange) this.onPointerLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => { if (!this.everLocked) this.lockFailed = true; });
    window.addEventListener('blur', () => {
      for (const a of ACTIONS) this.down[a] = false;
    });
  }

  requestLock() {
    if (this.locked) return;
    const fallback = () => {
      try {
        const p2 = this.canvas.requestPointerLock();
        if (p2 && p2.catch) p2.catch(() => { if (!this.everLocked) this.lockFailed = true; });
      } catch (_) {
        if (!this.everLocked) this.lockFailed = true;
      }
    };
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(fallback);
    } catch (_) {
      fallback();
    }
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  _press(a) {
    if (!this.down[a]) {
      this.pressTime[a] = this.now;
      this.consumed[a] = false;
      this.pressedThisFrame[a] = true;
    }
    this.down[a] = true;
  }

  // True if the action was pressed within `window` seconds and not yet consumed.
  buffered(a, window = 0.15) {
    return !this.consumed[a] && this.now - this.pressTime[a] <= window;
  }

  consume(a) {
    this.consumed[a] = true;
  }

  pressed(a) {
    return !!this.pressedThisFrame[a];
  }

  held(a) {
    return !!this.down[a];
  }

  // Poll gamepads and accumulate look deltas. Call once per frame before gameplay.
  update(now, rawDt) {
    this.now = now;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let padMoveX = 0, padMoveY = 0;
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      const dz = (v) => (Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85);
      padMoveX = dz(pad.axes[0] || 0);
      padMoveY = -dz(pad.axes[1] || 0);
      const lx = dz(pad.axes[2] || 0), ly = dz(pad.axes[3] || 0);
      if (lx || ly || padMoveX || padMoveY) this.usingPad = true;
      this.lookDX += Math.sign(lx) * lx * lx * 900 * rawDt;
      this.lookDY += Math.sign(ly) * ly * ly * 650 * rawDt;
      for (const [idx, a] of Object.entries(PAD_MAP)) {
        const b = pad.buttons[idx];
        const isDown = !!(b && (b.pressed || b.value > 0.5));
        const key = pad.index + ':' + idx;
        if (isDown && !this.padPrev[key]) { this.usingPad = true; this._press(a); }
        if (!isDown && this.padPrev[key]) this.down[a] = false;
        this.padPrev[key] = isDown;
      }
      break;
    }
    if (this.freeLook && !this.locked) {
      const edge = 0.07;
      if (this.cursorNX < edge) this.lookDX -= ((edge - this.cursorNX) / edge) * 900 * rawDt;
      else if (this.cursorNX > 1 - edge) this.lookDX += ((this.cursorNX - 1 + edge) / edge) * 900 * rawDt;
    }
    let kx = (this.down.right ? 1 : 0) - (this.down.left ? 1 : 0);
    let ky = (this.down.up ? 1 : 0) - (this.down.down ? 1 : 0);
    if (padMoveX || padMoveY) { kx = padMoveX; ky = padMoveY; }
    const len = Math.hypot(kx, ky);
    if (len > 1) { kx /= len; ky /= len; }
    this.moveX = kx;
    this.moveY = ky;
  }

  takeLook() {
    const s = 0.0022 * this.sensitivity;
    const dx = this.lookDX * s;
    const dy = this.lookDY * s * (this.invertY ? -1 : 1);
    this.lookDX = 0;
    this.lookDY = 0;
    return [dx, dy];
  }

  endFrame() {
    this.pressedThisFrame = {};
  }
}
