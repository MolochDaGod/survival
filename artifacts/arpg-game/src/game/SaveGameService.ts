/**
 * SaveGameService — cloud + local save/load for Grudge Nexus.
 *
 * Strategy:
 *  1. A UUID session-id is generated once and kept in localStorage.
 *  2. `save()` writes to localStorage immediately, then async-pushes
 *     to the API server which stores it in Object Storage (GCS).
 *  3. `load()` first tries the cloud, falls back to localStorage.
 *  4. An auto-save fires every AUTO_SAVE_INTERVAL seconds and on
 *     the `beforeunload` event.
 *
 * The cloud endpoint is /api/savegame/:sessionId (see api-server/src/routes/savegame.ts).
 */

import { PlayerStats } from './types';
import { CharacterConfig } from './CharacterConfig';
import { saveCharacter, loadCharacter } from './characterStorage';
import { getGrudgeId } from './identity';
import { getActiveCharacterId, activeSuffix } from './activeCharacter';

// ─── Constants ────────────────────────────────────────────────────────────────

const SESSION_KEY       = 'grudge_nexus_session_id';
const LOCAL_SAVE_KEY    = 'grudge_nexus_save';
const AUTO_SAVE_INTERVAL = 90; // seconds
const SAVE_VERSION       = 2;
const API_BASE           = '/api';

// ─── Types ────────────────────────────────────────────────────────────────────

import type { ProfessionState } from './progression/Professions';

export interface SaveData {
  version:   number;
  sessionId: string;
  timestamp: number;
  stats:     Partial<PlayerStats>;
  wave:      number;
  score:     number;
  position:  { x: number; z: number };
  character: CharacterConfig | null;
  inventory: InventorySlot[];
  /** v2+ — SWG-style profession XP + learned skills. Optional for back-compat. */
  professions?: ProfessionState;
}

/** Bring older save shapes up to current. Returns the migrated object. */
export function migrateSaveData(data: SaveData): SaveData {
  if (!data) return data;
  // v1 → v2: add empty professions block.
  if (!data.professions || typeof data.professions !== 'object') {
    data.professions = { xp: {}, learned: [] };
  }
  data.version = SAVE_VERSION;
  return data;
}

export interface InventorySlot {
  id:  string;
  qty: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getOrCreateSessionId(): string {
  // Prefer the grudge-id from the identity manager — that's the stable
  // account ID for both Puter-signed-in users (synced across browsers)
  // and guest users (per-browser only). When a character is active we
  // scope the cloud save key to that character so each one gets its own
  // independent stats/inventory/wave state.
  const grudgeId = getGrudgeId();
  const charId = getActiveCharacterId();
  if (grudgeId && charId) return `${grudgeId}__${charId}`;
  if (grudgeId) return grudgeId;

  // Backwards-compat: pre-identity saves used a random UUID under
  // SESSION_KEY. Continue serving those so existing saves don't
  // disappear if a player upgrades without going through the login
  // screen first.
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

// ─── SaveGameService ──────────────────────────────────────────────────────────

export class SaveGameService {
  private sessionId:     string;
  private autoSaveTimer: number = 0;
  private _unloadHandler: (() => void) | null = null;
  private _busy = false;

  /** Fired when a cloud save completes successfully. */
  onSaved:   ((ts: number) => void) | null = null;
  /** Fired when a save fails (cloud). */
  onSaveFail: (() => void) | null = null;
  /** Fired when loaded successfully. */
  onLoaded:  ((data: SaveData) => void) | null = null;
  /** True = last cloud op succeeded */
  cloudOk = false;

  constructor() {
    this.sessionId = getOrCreateSessionId();
  }

  // ── Session ──────────────────────────────────────────────────────────────

  getSessionId(): string { return this.sessionId; }

  /** Start auto-save loop. Call after game begins. */
  startAutoSave(collectFn: () => SaveData): void {
    this.autoSaveTimer = AUTO_SAVE_INTERVAL;

    this._unloadHandler = () => {
      const data = collectFn();
      this._writeLocal(data);
      // Fire-and-forget cloud sync on tab close
      navigator.sendBeacon(`${API_BASE}/savegame/${this.sessionId}`, JSON.stringify(data));
    };
    window.addEventListener('beforeunload', this._unloadHandler);
  }

  /** Call each game frame. collectFn called when timer fires. */
  tick(dt: number, collectFn: () => SaveData): void {
    this.autoSaveTimer -= dt;
    if (this.autoSaveTimer <= 0) {
      this.autoSaveTimer = AUTO_SAVE_INTERVAL;
      void this.save(collectFn());
    }
  }

  stopAutoSave(): void {
    if (this._unloadHandler) {
      window.removeEventListener('beforeunload', this._unloadHandler);
      this._unloadHandler = null;
    }
  }

  // ── Save ─────────────────────────────────────────────────────────────────

  async save(data: SaveData): Promise<void> {
    if (this._busy) return;
    this._busy = true;

    data.sessionId = this.sessionId;
    data.timestamp = Date.now();
    data.version   = SAVE_VERSION;

    // 1. Write to localStorage immediately
    this._writeLocal(data);

    // 2. Persist character config
    if (data.character) saveCharacter(data.character);

    // 3. Push to cloud
    try {
      const res = await fetch(`${API_BASE}/savegame/${this.sessionId}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(data),
      });
      this.cloudOk = res.ok;
      if (res.ok) {
        const json = await res.json() as { savedAt?: string };
        this.onSaved?.(data.timestamp);
      } else {
        this.onSaveFail?.();
      }
    } catch {
      this.cloudOk = false;
      this.onSaveFail?.();
    } finally {
      this._busy = false;
    }
  }

  // ── Load ─────────────────────────────────────────────────────────────────

  /**
   * Try cloud first, fall back to localStorage.
   * Resolves with SaveData or null if no save exists anywhere.
   */
  async load(): Promise<SaveData | null> {
    // Try cloud
    try {
      const res = await fetch(`${API_BASE}/savegame/${this.sessionId}`);
      if (res.ok) {
        const raw = await res.json() as SaveData;
        if (raw?.version) {
          const data = migrateSaveData(raw);
          this.cloudOk = true;
          this._writeLocal(data); // keep local in sync
          this.onLoaded?.(data);
          return data;
        }
      }
    } catch {
      /* fall through to local */
    }

    // Fall back to localStorage
    const local = this._readLocal();
    if (local) {
      const data = migrateSaveData(local);
      this.onLoaded?.(data);
      return data;
    }

    return null;
  }

  /** Delete cloud save and clear localStorage. */
  async deleteSave(): Promise<void> {
    localStorage.removeItem(this._localKey());
    try {
      await fetch(`${API_BASE}/savegame/${this.sessionId}`, { method: 'DELETE' });
    } catch { /* ignore */ }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private _localKey(): string {
    return `${LOCAL_SAVE_KEY}${activeSuffix()}`;
  }

  private _writeLocal(data: SaveData): void {
    try {
      localStorage.setItem(this._localKey(), JSON.stringify(data));
    } catch { /* quota exceeded — ignore */ }
  }

  private _readLocal(): SaveData | null {
    try {
      const raw = localStorage.getItem(this._localKey());
      if (!raw) return null;
      const data = JSON.parse(raw) as SaveData;
      if (!data?.version || !data?.stats) return null;
      // Reject saves that belong to a different identity. Without this,
      // signing into account B would surface account A's local save when
      // the cloud lookup fails (and then overwrite it on the next save).
      if (data.sessionId && data.sessionId !== this.sessionId) return null;
      return data;
    } catch { /* corrupt */ }
    return null;
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _instance: SaveGameService | null = null;
export function getSaveGameService(): SaveGameService {
  if (!_instance) _instance = new SaveGameService();
  return _instance;
}

/**
 * Tear down the singleton so the next `getSaveGameService()` call rebuilds
 * with the currently-active character ID. Call this whenever the player
 * switches characters from the CharacterSelect screen.
 */
export function resetSaveGameService(): void {
  if (_instance) {
    _instance.stopAutoSave();
    _instance = null;
  }
}
