/**
 * GrudgeCharacterService (survival adapter) — Cross-game character sync.
 *
 * Shares the same API contract as the RTS-Grudge version:
 *   PATCH api.grudge-studio.com/characters/:charId/cross-game
 *
 * Auth:
 *   Reads the Grudge JWT from localStorage['grudge.token'] (same key as
 *   GrudgeSession.ts used in RTS-Grudge). Falls back to Puter UUID when no
 *   JWT is present. Guest sessions sync under their guest ID.
 *
 * Identity bridge:
 *   Uses identity.ts getGrudgeId() to obtain the player's grudge-id, which
 *   is the same UUID-based key shared by RTS-Grudge and the crafting app.
 *   The active character ID is persisted in localStorage['grudge.activeCharId']
 *   so that selecting a character in any app is immediately visible here.
 */

import { getGrudgeId } from '../identity';
import { getActiveCharacterId } from '../activeCharacter';

// ─────────────────────────────────────────────────────────────────────────────
// Types (mirrors RTS-Grudge GrudgeCharacterService types)
// ─────────────────────────────────────────────────────────────────────────────

export type SyncSource = 'crafting' | 'rts' | 'survival';

export interface CrossGameProfession {
  level: number;
  xp: number;
  xpNext: number;
  totalCrafts?: number;
  unlockedNodes?: string[];
}

export interface HeroForgeConfig {
  modelPath: string;
  name: string;
  combatClass: string;
  weaponRight: string;
  weaponLeft: string | null;
  faction: string;
  materialColors: Record<string, string | null>;
  bodyMorph?: Record<string, number>;
  scale?: number;
}

export interface SurvivalProgress {
  professions?: Record<string, { level: number; xp: number }>;
  learnedSkills?: string[];
}

export interface CrossGameData {
  professions?: Record<string, CrossGameProfession>;
  craftingInventory?: Record<string, number>;
  heroForge?: HeroForgeConfig;
  survivalProgress?: SurvivalProgress;
  syncSource?: SyncSource;
  syncedAt?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE           = 'https://api.grudge-studio.com';
/** localStorage key for the Grudge JWT — shared with GrudgeSession.ts */
const TOKEN_LS_KEY       = 'grudge.token';
/** localStorage key for the active character ID — shared with RTS + crafting */
const ACTIVE_CHAR_LS_KEY = 'grudge.activeCharId';
const CACHE_LS_PREFIX    = 'grudge.xgame.cache.';
const QUEUE_LS_KEY       = 'grudge.xgame.queue';
const MAX_QUEUE_SIZE     = 20;
const DEFAULT_DEBOUNCE   = 4_000;

// ─────────────────────────────────────────────────────────────────────────────
// Auth / token helpers
// ─────────────────────────────────────────────────────────────────────────────

function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_LS_KEY); } catch { return null; }
}

function buildHeaders(): HeadersInit {
  const token = getToken();
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

// ─────────────────────────────────────────────────────────────────────────────
// Active character ID helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the "cross-game" active character ID.
 * Priority:
 *   1. localStorage['grudge.activeCharId'] — set by any Grudge app
 *   2. getActiveCharacterId() from survival's own activeCharacter module
 */
export function getActiveCharId(): string | null {
  try {
    const shared = localStorage.getItem(ACTIVE_CHAR_LS_KEY);
    if (shared) return shared;
  } catch {}
  return getActiveCharacterId() ?? null;
}

export function setActiveCharId(charId: string | null): void {
  try {
    if (charId) localStorage.setItem(ACTIVE_CHAR_LS_KEY, charId);
    else localStorage.removeItem(ACTIVE_CHAR_LS_KEY);
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Local cache
// ─────────────────────────────────────────────────────────────────────────────

function cacheKey(charId: string): string { return CACHE_LS_PREFIX + charId; }

function readCache(charId: string): CrossGameData | null {
  try {
    const raw = localStorage.getItem(cacheKey(charId));
    return raw ? (JSON.parse(raw) as CrossGameData) : null;
  } catch { return null; }
}

function writeCache(charId: string, data: CrossGameData): void {
  try { localStorage.setItem(cacheKey(charId), JSON.stringify(data)); } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Offline queue
// ─────────────────────────────────────────────────────────────────────────────

interface QueueEntry { charId: string; patch: Partial<CrossGameData>; ts: number; }

function readQueue(): QueueEntry[] {
  try {
    const raw = localStorage.getItem(QUEUE_LS_KEY);
    return raw ? (JSON.parse(raw) as QueueEntry[]) : [];
  } catch { return []; }
}

function writeQueue(q: QueueEntry[]): void {
  try { localStorage.setItem(QUEUE_LS_KEY, JSON.stringify(q.slice(-MAX_QUEUE_SIZE))); } catch {}
}

function enqueue(charId: string, patch: Partial<CrossGameData>): void {
  const q = readQueue();
  q.push({ charId, patch, ts: Date.now() });
  writeQueue(q);
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP helpers
// ─────────────────────────────────────────────────────────────────────────────

async function patchRemote(charId: string, patch: Partial<CrossGameData>): Promise<boolean> {
  try {
    const res = await fetch(
      `${API_BASE}/characters/${encodeURIComponent(charId)}/cross-game`,
      {
        method: 'PATCH',
        headers: buildHeaders(),
        body: JSON.stringify({ ...patch, syncedAt: Date.now() }),
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (res.ok) {
      const cached = readCache(charId) ?? {};
      writeCache(charId, { ...cached, ...patch, syncedAt: Date.now() });
    }
    return res.ok;
  } catch { return false; }
}

async function getRemote(charId: string): Promise<CrossGameData | null> {
  try {
    const res = await fetch(
      `${API_BASE}/characters/${encodeURIComponent(charId)}/cross-game`,
      { headers: buildHeaders(), signal: AbortSignal.timeout(6_000) },
    );
    if (res.ok) {
      const data = await res.json() as CrossGameData;
      writeCache(charId, data);
      return data;
    }
  } catch {}
  return readCache(charId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Debounce
// ─────────────────────────────────────────────────────────────────────────────

const _timers = new Map<string, ReturnType<typeof setTimeout>>();

function debounced(key: string, fn: () => void, ms: number): void {
  const existing = _timers.get(key);
  if (existing) clearTimeout(existing);
  _timers.set(key, setTimeout(() => { _timers.delete(key); fn(); }, ms));
}

// ─────────────────────────────────────────────────────────────────────────────
// Flush offline queue
// ─────────────────────────────────────────────────────────────────────────────

let _flushInFlight = false;

export async function flushQueue(): Promise<void> {
  if (_flushInFlight) return;
  _flushInFlight = true;
  try {
    const q = readQueue();
    if (q.length === 0) return;
    const remaining: QueueEntry[] = [];
    for (const e of q) {
      const ok = await patchRemote(e.charId, e.patch);
      if (!ok) remaining.push(e);
    }
    writeQueue(remaining);
  } finally {
    _flushInFlight = false;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { void flushQueue(); });
  setTimeout(() => { void flushQueue(); }, 3_000);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pull the cross-game envelope for a character.
 * Returns null when neither server nor cache has data.
 */
export async function pullCrossGame(charId: string): Promise<CrossGameData | null> {
  return getRemote(charId);
}

/** Read the locally-cached cross-game data synchronously. */
export function getCachedCrossGame(charId: string): CrossGameData | null {
  return readCache(charId);
}

/**
 * Push a partial update to the cross-game envelope.
 * Writes to local cache immediately; queues for retry when offline.
 */
export function pushCrossGame(
  charId: string,
  patch: Partial<CrossGameData>,
  source: SyncSource,
  debounceMs = DEFAULT_DEBOUNCE,
): void {
  const fullPatch: Partial<CrossGameData> = { ...patch, syncSource: source };
  const cached = readCache(charId) ?? {};
  writeCache(charId, { ...cached, ...fullPatch, syncedAt: Date.now() });

  debounced(`${charId}:${source}`, async () => {
    const ok = await patchRemote(charId, fullPatch);
    if (!ok) enqueue(charId, fullPatch);
  }, debounceMs);
}

/**
 * Push survival profession progress and learned skills.
 * Called by SaveGameService after a successful cloud save.
 */
export function pushSurvivalProgress(
  charId: string,
  progress: SurvivalProgress,
  debounceMs = DEFAULT_DEBOUNCE,
): void {
  pushCrossGame(charId, { survivalProgress: progress }, 'survival', debounceMs);
}

/**
 * Merge cross-game professions from the API into a local professions record.
 * Returns a new merged record (does not mutate input).
 * The survival professions state uses lowercase keys that match WCS profession IDs.
 *
 * Merge rule: cross-game level wins only if it's higher than local (never regress).
 */
export function mergeCrossGameProfessions(
  localProfs: Record<string, { xp: Record<string, number>; learned: string[] }>,
  crossGame: CrossGameData,
): Record<string, { xp: Record<string, number>; learned: string[] }> {
  const remote = crossGame.survivalProgress?.professions ?? {};
  const learnedRemote = crossGame.survivalProgress?.learnedSkills ?? [];
  if (Object.keys(remote).length === 0 && learnedRemote.length === 0) return localProfs;

  const result = { ...localProfs };
  for (const [profId, remoteState] of Object.entries(remote)) {
    const local = result[profId] ?? { xp: {}, learned: [] };
    // Only take remote XP if it represents a higher level (avoid regressing)
    // The survival Professions system uses { xp: { [profId]: number } }
    const localXp = (local.xp?.[profId] ?? 0);
    const remoteXp = remoteState.xp ?? 0;
    result[profId] = {
      ...local,
      xp: { ...local.xp, [profId]: Math.max(localXp, remoteXp) },
    };
  }
  // Merge learned skills without duplicates
  if (learnedRemote.length > 0) {
    const existingLearned = Object.values(result).flatMap(p => p.learned ?? []);
    const merged = Array.from(new Set([...existingLearned, ...learnedRemote]));
    // Spread merged back across professions — survival stores learned in the root
    // ProfessionState.learned array; we merge them into the first available bucket
    // or create a synthetic '_global' entry that ProfessionsService reads.
    if (!result['_global']) result['_global'] = { xp: {}, learned: [] };
    result['_global'].learned = Array.from(new Set([
      ...(result['_global'].learned ?? []),
      ...merged,
    ]));
  }
  return result;
}
