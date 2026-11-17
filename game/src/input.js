// EMBERLINE — input.js
// Keyboard + mouse state, pointer-lock look, and an edge-triggered action
// queue. The simulation reads `keys` for held movement and drains `pressed`
// once per fixed step for one-shot actions (shoot is held; reload, plant,
// grenade and weapon swaps are edges).

export class Input {
  constructor(domElement) {
    this.el = domElement;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseDown = false;
    this.mousePressed = false;
    this.yaw = 0;            // radians, 0 faces -Z
    this.pitch = 0;          // radians, clamped to ±1.45
    this.sensitivity = 0.0022;
    this.locked = false;
    this.enabled = true;     // shot mode / menus turn this off

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouseDown = false; });

    domElement.addEventListener('mousedown', (e) => {
      if (!this.locked || !this.enabled) return;
      if (e.button === 0) { this.mouseDown = true; this.mousePressed = true; }
      if (e.button === 2) this.keys.add('MouseRight');
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.keys.delete('MouseRight');
    });
    domElement.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === domElement;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked || !this.enabled) return;
      this.yaw -= e.movementX * this.sensitivity;
      this.pitch -= e.movementY * this.sensitivity;
      const lim = 1.45;
      this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
    });
  }

  lock() { this.el.requestPointerLock?.(); }
  unlock() { if (this.locked) document.exitPointerLock?.(); }

  held(code) { return this.keys.has(code); }
  /** True once per physical press; consumes the edge. */
  take(code) {
    if (this.pressed.has(code)) { this.pressed.delete(code); return true; }
    return false;
  }
  takeMouse() {
    if (this.mousePressed) { this.mousePressed = false; return true; }
    return false;
  }
  /** Movement wish in local space: x = strafe right, z = forward. */
  moveAxis() {
    let x = 0, z = 0;
    if (this.held('KeyW') || this.held('ArrowUp')) z += 1;
    if (this.held('KeyS') || this.held('ArrowDown')) z -= 1;
    if (this.held('KeyD') || this.held('ArrowRight')) x += 1;
    if (this.held('KeyA') || this.held('ArrowLeft')) x -= 1;
    const len = Math.hypot(x, z);
    if (len > 1) { x /= len; z /= len; }
    return { x, z };
  }
  endStep() { this.pressed.clear(); this.mousePressed = false; }
}
