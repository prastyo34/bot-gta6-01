// Keyboard + mouse input. WASD/arrows move, mouse drag orbits the camera, click
// (pointer lock) aims and fires. Tracks pressed keys and edge-triggered presses.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set(); // edge-triggered, consumed by endFrame()
    this.mouseDX = 0; this.mouseDY = 0;
    this.mouseDown = false;
    this.mouseClicked = false;
    this.locked = false;
    this.canvas = canvas;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseDown = false; });
    canvas.addEventListener('mousedown', (e) => {
      this.mouseDown = true; this.mouseClicked = true;
      if (e.button === 0 && !this.locked) canvas.requestPointerLock?.();
    });
    window.addEventListener('mouseup', () => { this.mouseDown = false; });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (e) => {
      if (this.locked) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; }
      else if (this.mouseDown) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; }
    });
  }
  down(code) { return this.keys.has(code); }
  hit(code) { return this.pressed.has(code); }
  axis() {
    let x = 0, z = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) z -= 1;
    if (this.down('KeyS') || this.down('ArrowDown')) z += 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    return { x, z };
  }
  endFrame() { this.pressed.clear(); this.mouseDX = 0; this.mouseDY = 0; this.mouseClicked = false; }
}
