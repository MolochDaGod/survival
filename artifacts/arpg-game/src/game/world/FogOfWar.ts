/**
 * FogOfWar — exploration grid for the minimap.
 *
 * Maintains a compact Uint8Array grid covering the entire 6 400×6 400 m world.
 * Each cell is one byte: 0 = unexplored, 1 = explored.
 *
 * Grid specs:
 *   World size:   6400 × 6400 m  (–3200 to +3200 on each axis)
 *   Grid size:    512  × 512 cells
 *   Cell size:    6400 / 512 ≈ 12.5 m per cell
 *   Memory:       512 × 512 = 262 144 bytes = 256 KB
 *
 * Persistence: serialised to/from localStorage as a base64 string.
 */

import { WORLD_HALF } from './WorldGen';

// ─── Constants ────────────────────────────────────────────────────────────────

const GRID = 512;
const WORLD = WORLD_HALF * 2;          // 6400
const CELL  = WORLD / GRID;            // 12.5 m

/** Player reveals this many metres of fog per movement step */
const REVEAL_RADIUS_M = 45;            // metres
const REVEAL_RADIUS_C = Math.ceil(REVEAL_RADIUS_M / CELL); // in cells

const LS_KEY = 'gn_fog_of_war_v1';

// ─── FogOfWar ─────────────────────────────────────────────────────────────────

export class FogOfWar {
  /** 512×512 explored cells.  Row-major: index = row * GRID + col */
  readonly grid: Uint8Array;

  /** Pre-baked circle mask for the reveal stamp */
  private readonly _stamp: { dc: number; dr: number }[];

  /** Cached minimap canvas for the fog overlay — rebuilt on reveal */
  private _dirty = true;
  private _canvas: OffscreenCanvas | null = null;
  private _ctx:    OffscreenCanvasRenderingContext2D | null = null;

  constructor() {
    this.grid   = new Uint8Array(GRID * GRID);
    this._stamp = this._buildStamp(REVEAL_RADIUS_C);
    this._tryLoad();
  }

  // ── World → grid coordinate helpers ──────────────────────────────────────

  worldToCell(worldX: number, worldZ: number): { col: number; row: number } {
    const col = Math.floor((worldX + WORLD_HALF) / CELL);
    const row = Math.floor((worldZ + WORLD_HALF) / CELL);
    return {
      col: Math.max(0, Math.min(GRID - 1, col)),
      row: Math.max(0, Math.min(GRID - 1, row)),
    };
  }

  cellToWorld(col: number, row: number): { x: number; z: number } {
    return {
      x: col * CELL - WORLD_HALF + CELL * 0.5,
      z: row * CELL - WORLD_HALF + CELL * 0.5,
    };
  }

  // ── Reveal ────────────────────────────────────────────────────────────────

  /** Call each time the player moves — marks a circle of cells as explored. */
  reveal(worldX: number, worldZ: number): void {
    const { col: cc, row: cr } = this.worldToCell(worldX, worldZ);
    let changed = false;

    for (const { dc, dr } of this._stamp) {
      const c = cc + dc;
      const r = cr + dr;
      if (c < 0 || c >= GRID || r < 0 || r >= GRID) continue;
      const idx = r * GRID + c;
      if (this.grid[idx] === 0) {
        this.grid[idx] = 1;
        changed = true;
      }
    }

    if (changed) {
      this._dirty = true;
      this._scheduleSave();
    }
  }

  /** Returns true if the world position has been explored */
  isRevealed(worldX: number, worldZ: number): boolean {
    const { col, row } = this.worldToCell(worldX, worldZ);
    return this.grid[row * GRID + col] === 1;
  }

  /** Fraction of the world that has been explored (0–1) */
  get exploredFraction(): number {
    let count = 0;
    for (let i = 0; i < this.grid.length; i++) if (this.grid[i]) count++;
    return count / this.grid.length;
  }

  // ── Minimap fog texture ───────────────────────────────────────────────────

  /**
   * Returns a canvas drawn from the fog grid, sized to `px × px` pixels.
   * Each grid cell maps to a block of pixels.
   * Unexplored = dark semi-opaque, explored = transparent.
   *
   * The minimap renderer composites this over the terrain image.
   */
  getMinimapCanvas(px: number): OffscreenCanvas | HTMLCanvasElement {
    if (!this._canvas || this._canvas.width !== px) {
      if (typeof OffscreenCanvas !== 'undefined') {
        this._canvas = new OffscreenCanvas(px, px);
        this._ctx    = this._canvas.getContext('2d')!;
      } else {
        // Fallback for environments without OffscreenCanvas
        const c = document.createElement('canvas');
        c.width = c.height = px;
        this._canvas = c as unknown as OffscreenCanvas;
        this._ctx    = c.getContext('2d') as unknown as OffscreenCanvasRenderingContext2D;
      }
      this._dirty = true;
    }

    if (this._dirty && this._ctx) {
      this._rebuildCanvas(px);
      this._dirty = false;
    }

    return this._canvas!;
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  save(): void {
    try {
      // Compress as base64 run-length encoded string
      const b64 = btoa(String.fromCharCode(...this.grid));
      localStorage.setItem(LS_KEY, b64);
    } catch { /* storage quota */ }
  }

  private _saveTimer: ReturnType<typeof setTimeout> | null = null;
  private _scheduleSave(): void {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this.save();
      this._saveTimer = null;
    }, 5000); // debounce saves
  }

  private _tryLoad(): void {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const bytes = Uint8Array.from(atob(raw), c => c.charCodeAt(0));
      if (bytes.length === this.grid.length) this.grid.set(bytes);
    } catch { /* corrupted or missing */ }
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private _buildStamp(radius: number): { dc: number; dr: number }[] {
    const out: { dc: number; dr: number }[] = [];
    const r2 = radius * radius;
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        if (dc * dc + dr * dr <= r2) out.push({ dc, dr });
      }
    }
    return out;
  }

  private _rebuildCanvas(px: number): void {
    if (!this._ctx) return;
    const ctx  = this._ctx;
    const scale = px / GRID;         // pixels per cell

    ctx.clearRect(0, 0, px, px);
    ctx.fillStyle = 'rgba(8, 8, 16, 0.92)';
    ctx.fillRect(0, 0, px, px);

    // Erase explored cells (composite = destination-out removes the fog)
    ctx.globalCompositeOperation = 'destination-out';
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if (this.grid[r * GRID + c]) {
          ctx.fillStyle = 'rgba(255,255,255,1)';
          ctx.fillRect(
            Math.floor(c * scale), Math.floor(r * scale),
            Math.ceil(scale) + 1,  Math.ceil(scale) + 1,
          );
        }
      }
    }

    ctx.globalCompositeOperation = 'source-over';
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _fow: FogOfWar | null = null;
export function getFogOfWar(): FogOfWar {
  if (!_fow) _fow = new FogOfWar();
  return _fow;
}
export function resetFogOfWar(): void { _fow = null; }
