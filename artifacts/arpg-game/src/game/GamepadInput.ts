/**
 * Polls the Web Gamepad API and synthesizes KeyboardEvents on `document`,
 * so the existing PlayerController + GameEngine listeners pick them up
 * without any rewrite.
 *
 * Supports the standard Xbox / PlayStation layout. Right stick is left
 * unmapped because the game uses pointer-lock mouse deltas for camera
 * rotation — we can't fake those.
 *
 *   Left stick     → WASD
 *   A / Cross      → Space   (jump)
 *   B / Circle     → Shift   (roll)
 *   X / Square     → Q       (swap weapon)
 *   Y / Triangle   → V       (cycle camera)
 *   D-pad ←/→/↑/↓  → 1 / 2 / I / T (abilities, inv, skill tree)
 *   Start          → Escape  (pause)
 *   RT             → mouse left click (attack)
 *   LT             → mouse right click (block)
 */

const STICK_DEADZONE = 0.25;

interface ButtonMap {
  index: number;      // gamepad button index
  code: string;       // KeyboardEvent.code to dispatch
}

const BUTTONS: ButtonMap[] = [
  { index: 0, code: 'Space' },       // A
  { index: 1, code: 'ShiftLeft' },   // B
  { index: 2, code: 'KeyQ' },        // X
  { index: 3, code: 'KeyV' },        // Y
  { index: 9, code: 'Escape' },      // Start
  { index: 12, code: 'KeyT' },       // D-pad up
  { index: 13, code: 'KeyI' },       // D-pad down
  { index: 14, code: 'Digit1' },     // D-pad left
  { index: 15, code: 'Digit2' },     // D-pad right
];

export class GamepadInput {
  private prevButtons: Map<number, boolean> = new Map();
  /** Per-axis last state so we only fire keydown/up on edges. */
  private axisState: Map<string, boolean> = new Map();
  private canvas: HTMLCanvasElement | null;
  private connected = false;

  constructor(canvas: HTMLCanvasElement | null) {
    this.canvas = canvas;
    window.addEventListener('gamepadconnected', this.onConnect);
    window.addEventListener('gamepaddisconnected', this.onDisconnect);
  }

  private onConnect = (e: GamepadEvent) => {
    this.connected = true;
    console.log(`[gamepad] connected: ${e.gamepad.id}`);
  };

  private onDisconnect = () => {
    this.connected = false;
    // Release any held buttons so we don't get stuck-input.
    for (const [code, down] of this.axisState) if (down) this.dispatchKey(code, false);
    this.axisState.clear();
    for (const [, _] of this.prevButtons) {/* noop */}
    this.prevButtons.clear();
  };

  /** Call from the per-frame update loop. */
  poll() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad: Gamepad | null = null;
    for (const p of pads) if (p && p.connected) { pad = p; break; }
    if (!pad) return;

    // --- Left stick → WASD ---
    const lx = pad.axes[0] ?? 0;
    const ly = pad.axes[1] ?? 0;
    this.setAxisKey('KeyD', lx > STICK_DEADZONE);
    this.setAxisKey('KeyA', lx < -STICK_DEADZONE);
    this.setAxisKey('KeyS', ly > STICK_DEADZONE);
    this.setAxisKey('KeyW', ly < -STICK_DEADZONE);

    // --- Buttons ---
    for (const b of BUTTONS) {
      const btn = pad.buttons[b.index];
      const pressed = !!btn && btn.pressed;
      const wasPressed = this.prevButtons.get(b.index) ?? false;
      if (pressed && !wasPressed) this.dispatchKey(b.code, true);
      else if (!pressed && wasPressed) this.dispatchKey(b.code, false);
      this.prevButtons.set(b.index, pressed);
    }

    // --- Triggers → mouse buttons (LT=block/right, RT=attack/left) ---
    const lt = pad.buttons[6];
    const rt = pad.buttons[7];
    this.setMouseButton(0, !!rt && rt.pressed); // attack
    this.setMouseButton(2, !!lt && lt.pressed); // block
  }

  private setAxisKey(code: string, isDown: boolean) {
    const prev = this.axisState.get(code) ?? false;
    if (isDown === prev) return;
    this.axisState.set(code, isDown);
    this.dispatchKey(code, isDown);
  }

  private dispatchKey(code: string, isDown: boolean) {
    const ev = new KeyboardEvent(isDown ? 'keydown' : 'keyup', {
      code,
      key: code,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(ev);
  }

  /** Mouse-button edge tracking, dispatched on the canvas. */
  private mouseDown: Map<number, boolean> = new Map();
  private setMouseButton(button: number, isDown: boolean) {
    if (!this.canvas) return;
    const prev = this.mouseDown.get(button) ?? false;
    if (isDown === prev) return;
    this.mouseDown.set(button, isDown);
    const ev = new MouseEvent(isDown ? 'mousedown' : 'mouseup', {
      button,
      bubbles: true,
      cancelable: true,
    });
    this.canvas.dispatchEvent(ev);
  }

  isConnected() { return this.connected; }

  dispose() {
    window.removeEventListener('gamepadconnected', this.onConnect);
    window.removeEventListener('gamepaddisconnected', this.onDisconnect);
  }
}
