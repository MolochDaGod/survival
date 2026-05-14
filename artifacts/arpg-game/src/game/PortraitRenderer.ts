import * as THREE from 'three';

/**
 * PortraitRenderer — "invisible camera in front of the player".
 *
 * Renders the live game scene from a second camera that stands in front
 * of the player, looking back at them, into an offscreen WebGLRenderTarget.
 * The result is read back into a 2D `<canvas>` element which any UI
 * component (the equipment book) can mount into the DOM.
 *
 * Design notes:
 *   • Reuses the main `WebGLRenderer` so we don't pay a second WebGL
 *     context's worth of memory or shader compilation time. The portrait
 *     render is one extra `renderer.render()` call per *active* frame.
 *   • Active only while the equipment book is open. When inactive the
 *     overhead is zero (the loop hook returns immediately).
 *   • Throttled to ~24 fps so we pay the readback cost (the only really
 *     expensive part — sync GPU→CPU pixel fetch) at most that often.
 *   • Render target is small (320×432, 3:4) — readback is ~550 KB per tick.
 *   • Y-axis is flipped during readback so the 2D canvas matches the
 *     usual screen orientation.
 */

export class PortraitRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;

  private camera: THREE.PerspectiveCamera;
  private target: THREE.WebGLRenderTarget;

  /** Public 2D canvas the UI mounts into the DOM. */
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private imageData: ImageData;
  private pixels: Uint8Array;

  private active = false;
  private lastRenderMs = 0;
  private readonly W = 320;
  private readonly H = 432;
  /** Min ms between successive portrait renders (≈ 24 fps cap). */
  private readonly MIN_INTERVAL_MS = 42;

  /** Lazily-resolved getter for the player object — engine isn't wired
   * in until after the asset boot finishes, but we want to construct the
   * portrait early so the UI canvas reference is stable. */
  private getPlayer: () => {
    playerGroup: THREE.Object3D;
    bodyYaw: number;
  } | null;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    getPlayer: () => { playerGroup: THREE.Object3D; bodyYaw: number } | null,
  ) {
    this.renderer = renderer;
    this.scene = scene;
    this.getPlayer = getPlayer;

    this.camera = new THREE.PerspectiveCamera(34, this.W / this.H, 0.05, 30);

    this.target = new THREE.WebGLRenderTarget(this.W, this.H, {
      // No depth-texture readback needed; just colour into RGBA8.
      depthBuffer: true,
      stencilBuffer: false,
    });

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    // Setting these via CSS lets the parent element control display size.
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('PortraitRenderer: 2D context unavailable');
    this.ctx = ctx;
    this.imageData = this.ctx.createImageData(this.W, this.H);
    this.pixels = new Uint8Array(this.W * this.H * 4);

    // Friendly placeholder before the first render arrives.
    this.ctx.fillStyle = '#1a1410';
    this.ctx.fillRect(0, 0, this.W, this.H);
  }

  /** Toggle the portrait pipeline. Engine calls update() unconditionally
   * each frame; when inactive update() returns immediately. */
  setActive(active: boolean) {
    this.active = active;
  }

  isActive(): boolean {
    return this.active;
  }

  /** Called from the engine render loop AFTER the main scene render.
   * Cheap when inactive; throttled when active. */
  update(timeMs: number) {
    if (!this.active) return;
    if (timeMs - this.lastRenderMs < this.MIN_INTERVAL_MS) return;

    const player = this.getPlayer();
    if (!player) return;

    this.lastRenderMs = timeMs;

    // Position the camera in front of the player at chest height,
    // looking back at the centre of the body. `bodyYaw` rotates the
    // playerGroup; the visible model has its own internal +π flip so
    // its "forward" in world space is (-sin(bodyYaw), 0, -cos(bodyYaw))
    // (matches getForwardDir() in PlayerController).
    const yaw = player.bodyYaw;
    const fwdX = -Math.sin(yaw);
    const fwdZ = -Math.cos(yaw);

    const groupPos = player.playerGroup.position;
    const FRAMING_DIST = 1.9;   // metres in front of the player
    const FRAMING_HEIGHT = 1.5; // camera y above feet
    const TARGET_HEIGHT = 0.9;  // look-at y above feet

    this.camera.position.set(
      groupPos.x + fwdX * FRAMING_DIST,
      groupPos.y + FRAMING_HEIGHT,
      groupPos.z + fwdZ * FRAMING_DIST,
    );
    this.camera.lookAt(groupPos.x, groupPos.y + TARGET_HEIGHT, groupPos.z);

    // Render the live scene into the offscreen target.
    const prevTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.target);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(prevTarget);

    // Sync GPU→CPU pixel readback. Slow per byte but the buffer is small.
    this.renderer.readRenderTargetPixels(
      this.target,
      0, 0,
      this.W, this.H,
      this.pixels,
    );

    // Flip Y while copying into the 2D canvas's ImageData buffer.
    // WebGL readback is bottom-up; canvas ImageData is top-down.
    const data = this.imageData.data;
    const rowBytes = this.W * 4;
    for (let y = 0; y < this.H; y++) {
      const srcOff = (this.H - 1 - y) * rowBytes;
      const dstOff = y * rowBytes;
      // Native subarray copy is much faster than a per-byte JS loop.
      data.set(this.pixels.subarray(srcOff, srcOff + rowBytes), dstOff);
    }
    this.ctx.putImageData(this.imageData, 0, 0);
  }

  dispose() {
    this.target.dispose();
  }
}
