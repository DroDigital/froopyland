// Unified keyboard + mouse + gamepad input, polled once per frame.

const DEAD = 0.16;
const dz = (v) => (Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD));

// Standard gamepad mapping button indices
export const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseDX = 0; this.mouseDY = 0;
    this.wheel = 0;
    this.dragging = false;
    this.locked = false;
    this.padPrev = [];
    this.padPressed = new Set();
    this.padIndex = -1;
    this.padName = '';
    this.lastDevice = 'keyboard';
    this.enabled = true;

    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      this.lastDevice = 'keyboard';
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0 || e.button === 2) this.dragging = true;
      if (e.button === 2) this.pressed.add('Mouse2');
      if (e.button === 0) this.pressed.add('Mouse0');
    });
    window.addEventListener('mouseup', () => { this.dragging = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (this.locked || this.dragging) {
        this.mouseDX += e.movementX || 0;
        this.mouseDY += e.movementY || 0;
        this.lastDevice = 'keyboard';
      }
    });
    canvas.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
    window.addEventListener('gamepadconnected', (e) => { this.padIndex = e.gamepad.index; this.padName = e.gamepad.id; this.onPad?.(true, e.gamepad.id); });
    window.addEventListener('gamepaddisconnected', (e) => { if (e.gamepad.index === this.padIndex) { this.padIndex = -1; this.onPad?.(false, e.gamepad.id); } });
  }

  requestLock() {
    if (!this.locked && this.canvas.requestPointerLock) {
      try { const p = this.canvas.requestPointerLock(); p?.catch?.(() => {}); } catch { /* ignore */ }
    }
  }
  releaseLock() { if (this.locked) document.exitPointerLock(); }

  getPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    if (this.padIndex >= 0 && pads[this.padIndex]) return pads[this.padIndex];
    for (const p of pads) if (p && p.connected) { this.padIndex = p.index; this.padName = p.id; return p; }
    return null;
  }

  /** Called once per frame; builds the action state. */
  poll() {
    const k = this.keys;
    const pad = this.getPad();
    this.padPressed.clear();
    let px = 0, py = 0, lx = 0, ly = 0, padJump = false, padSprint = false, padZoom = 0;
    if (pad) {
      const b = (i) => !!(pad.buttons[i] && (pad.buttons[i].pressed || pad.buttons[i].value > 0.5));
      for (let i = 0; i < pad.buttons.length; i++) {
        const now = b(i);
        if (now && !this.padPrev[i]) { this.padPressed.add(i); this.lastDevice = 'gamepad'; }
        this.padPrev[i] = now;
      }
      px = dz(pad.axes[0] || 0); py = -dz(pad.axes[1] || 0);
      lx = dz(pad.axes[2] || 0); ly = dz(pad.axes[3] || 0);
      if (px || py || lx || ly) this.lastDevice = 'gamepad';
      padJump = b(PAD.A);
      padSprint = b(PAD.RB) || b(PAD.LS);
      padZoom = (b(PAD.LT) ? 1 : 0) - (b(PAD.RT) ? 1 : 0);
    }
    const P = (code) => this.pressed.has(code);
    const pp = (i) => this.padPressed.has(i);
    let kx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let ky = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const st = {
      moveX: kx + px,
      moveY: ky + py,
      lookX: this.mouseDX,
      lookY: this.mouseDY,
      padLookX: lx,
      padLookY: ly,
      zoom: this.wheel * 0.8 + padZoom * 0.25,
      sprint: k.has('ShiftLeft') || k.has('ShiftRight') || padSprint,
      jumpHeld: k.has('Space') || padJump,
      jumpPressed: P('Space') || pp(PAD.A),
      interact: P('KeyE') || pp(PAD.X),
      observe: P('KeyQ') || P('Mouse2') || pp(PAD.Y),
      whistle: P('KeyR') || pp(PAD.LB),
      toggleView: P('KeyV') || pp(PAD.RS),
      map: P('KeyM') || pp(PAD.BACK),
      journal: P('KeyJ') || pp(PAD.UP),
      creator: P('KeyP') || P('Tab') || pp(PAD.START),
      help: P('KeyH') || P('F1') || pp(PAD.DOWN),
      close: P('Escape') || pp(PAD.B),
      padB: pp(PAD.B),
      padX: pp(PAD.X), padY: pp(PAD.Y), padLeft: pp(PAD.LEFT), padRight: pp(PAD.RIGHT), padA: pp(PAD.A),
      stats: P('F3') || P('Backquote'),
      mute: P('KeyN'),
      save: P('F5') && false,
      device: this.lastDevice,
      hasPad: !!pad,
    };
    this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0;
    this.pressed.clear();
    return st;
  }
}
