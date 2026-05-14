import Stats from 'stats.js';

/**
 * Toggleable FPS / MS / MB overlay (stats.js).
 * Press F8 to cycle panels (FPS → MS → MB → hidden → FPS).
 * (F1/F2/F3 are reserved for camera-mode switching.)
 */
export class PerfMonitor {
  private stats: Stats;
  private mode: number = -1; // -1 = hidden
  private container: HTMLDivElement;

  constructor() {
    this.stats = new Stats();
    this.container = document.createElement('div');
    this.container.style.position = 'fixed';
    this.container.style.left = '8px';
    this.container.style.bottom = '8px';
    this.container.style.zIndex = '9999';
    this.container.style.display = 'none';
    this.container.appendChild(this.stats.dom);
    // stats.js applies its own absolute positioning; reset so it sits inline
    this.stats.dom.style.position = 'relative';
    this.stats.dom.style.left = '0';
    this.stats.dom.style.top = '0';
    document.body.appendChild(this.container);

    document.addEventListener('keydown', this.onKey);
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.code !== 'F8') return;
    e.preventDefault();
    this.mode = (this.mode + 1) % 4;
    if (this.mode === 3) {
      this.container.style.display = 'none';
    } else {
      this.container.style.display = 'block';
      this.stats.showPanel(this.mode);
    }
  };

  begin() { this.stats.begin(); }
  end()   { this.stats.end(); }

  dispose() {
    document.removeEventListener('keydown', this.onKey);
    this.container.remove();
  }
}
