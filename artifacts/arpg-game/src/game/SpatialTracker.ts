/**
 * SpatialTracker — 2D grid-based spatial partitioning for all world entities.
 *
 * Tracks players, NPCs, props, and locations on a flat XZ plane.
 * Does NOT track Y (height) — queries are 2D cylinder tests.
 *
 * Design principles:
 *  • O(1) insert / remove per entity
 *  • O(k) radius query where k = entities in nearby cells
 *  • Cell size tuned to max render radius (100 m) — 2×2 cells per query
 *  • No physics — purely a lookup cache; entities update their own cells
 *
 * Usage:
 *   const tracker = new SpatialTracker(50); // 50m cells
 *   tracker.add(npc);
 *   const nearby = tracker.query(player.position, 100);
 *   tracker.move(npc, newPos);
 *   tracker.remove(npc);
 */

export interface TrackedEntity {
  readonly trackId: string;         // unique UUID
  readonly trackType: EntityType;
  position: { x: number; z: number };
  /** Set to false to prevent the entity from being returned in queries */
  active: boolean;
}

export const enum EntityType {
  PLAYER  = 'player',
  NPC     = 'npc',
  ENEMY   = 'enemy',
  PROP    = 'prop',
  VEHICLE = 'vehicle',
  CAMP    = 'camp',
  BUILDING= 'building',
}

interface CellKey { cx: number; cz: number }

export class SpatialTracker {
  private readonly cellSize: number;
  /** Map from "cx:cz" → Set of entities in that cell */
  private readonly cells = new Map<string, Set<TrackedEntity>>();
  /** Map from trackId → entity's current cell key */
  private readonly entityCell = new Map<string, CellKey>();
  /** All registered entities */
  private readonly entities   = new Map<string, TrackedEntity>();

  constructor(cellSize = 50) {
    this.cellSize = cellSize;
  }

  // ── Registration ─────────────────────────────────────────────────────────

  add(entity: TrackedEntity): void {
    if (this.entities.has(entity.trackId)) return;
    this.entities.set(entity.trackId, entity);
    this._insertIntoCell(entity);
  }

  remove(entity: TrackedEntity): void {
    this._removeFromCurrentCell(entity);
    this.entities.delete(entity.trackId);
    this.entityCell.delete(entity.trackId);
  }

  /** Call after updating entity.position */
  move(entity: TrackedEntity): void {
    const prev = this.entityCell.get(entity.trackId);
    const next = this._cellOf(entity.position.x, entity.position.z);
    if (prev && prev.cx === next.cx && prev.cz === next.cz) return; // same cell
    this._removeFromCurrentCell(entity);
    this._insertIntoCell(entity);
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  /**
   * Return all active entities within `radius` metres of (x, z).
   * Optionally filter by entity type.
   */
  query(
    x: number, z: number,
    radius: number,
    filter?: EntityType | EntityType[],
  ): TrackedEntity[] {
    const r2      = radius * radius;
    const cellR   = Math.ceil(radius / this.cellSize);
    const cx0     = Math.floor(x / this.cellSize);
    const cz0     = Math.floor(z / this.cellSize);
    const results : TrackedEntity[] = [];
    const seen    = new Set<string>();

    const types = filter
      ? (Array.isArray(filter) ? filter : [filter])
      : null;

    for (let dcx = -cellR; dcx <= cellR; dcx++) {
      for (let dcz = -cellR; dcz <= cellR; dcz++) {
        const key  = this._key(cx0 + dcx, cz0 + dcz);
        const cell = this.cells.get(key);
        if (!cell) continue;

        for (const e of cell) {
          if (!e.active)              continue;
          if (seen.has(e.trackId))    continue;
          if (types && !types.includes(e.trackType)) continue;

          const ex  = e.position.x - x;
          const ez  = e.position.z - z;
          if (ex * ex + ez * ez <= r2) {
            results.push(e);
            seen.add(e.trackId);
          }
        }
      }
    }
    return results;
  }

  /** All entities of a given type in the entire world */
  queryAll(filter?: EntityType | EntityType[]): TrackedEntity[] {
    const types = filter
      ? (Array.isArray(filter) ? filter : [filter])
      : null;

    const out: TrackedEntity[] = [];
    for (const e of this.entities.values()) {
      if (!e.active) continue;
      if (types && !types.includes(e.trackType)) continue;
      out.push(e);
    }
    return out;
  }

  get(id: string): TrackedEntity | undefined {
    return this.entities.get(id);
  }

  get count(): number { return this.entities.size; }

  // ── Internals ─────────────────────────────────────────────────────────────

  private _cellOf(x: number, z: number): CellKey {
    return {
      cx: Math.floor(x / this.cellSize),
      cz: Math.floor(z / this.cellSize),
    };
  }

  private _key(cx: number, cz: number): string {
    return `${cx}:${cz}`;
  }

  private _insertIntoCell(entity: TrackedEntity): void {
    const ck  = this._cellOf(entity.position.x, entity.position.z);
    const key = this._key(ck.cx, ck.cz);
    let cell  = this.cells.get(key);
    if (!cell) { cell = new Set(); this.cells.set(key, cell); }
    cell.add(entity);
    this.entityCell.set(entity.trackId, ck);
  }

  private _removeFromCurrentCell(entity: TrackedEntity): void {
    const prev = this.entityCell.get(entity.trackId);
    if (!prev) return;
    const cell = this.cells.get(this._key(prev.cx, prev.cz));
    cell?.delete(entity);
  }
}

// ── Singleton factory (one tracker per scene) ─────────────────────────────────

let _instance: SpatialTracker | null = null;
export function getSpatialTracker(): SpatialTracker {
  if (!_instance) _instance = new SpatialTracker(50);
  return _instance;
}
export function resetSpatialTracker(): void { _instance = null; }
