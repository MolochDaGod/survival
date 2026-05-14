/**
 * Client-side prefab registry.
 *
 * On boot the game GETs /api/prefabs and caches the result in localStorage so
 * subsequent loads (and offline play) work without the server. Every gameplay
 * system that needs entity definitions (EnemyManager, AssetManager, the future
 * NPC/item systems) goes through this registry instead of hardcoding lists.
 *
 * The registry never throws — if both the server and the cache fail, callers
 * fall back to the in-game hardcoded constants (ENEMY_DEFS, BODY_TYPES, ...).
 */
export interface Prefab {
  id: string;
  kind: string;
  name: string;
  description: string | null;
  modelPath: string | null;
  texturePath: string | null;
  scale: number;
  data: Record<string, unknown>;
  tags: string[];
  draft: boolean;
  version: number;
}

const CACHE_KEY = "grudge:prefab_cache:v1";
const FETCH_TIMEOUT_MS = 4000;

class PrefabRegistry {
  private prefabs: Map<string, Prefab> = new Map();
  private loaded = false;
  private loading: Promise<void> | null = null;

  /** Idempotent — safe to await from many call sites. */
  ensureLoaded(): Promise<void> {
    if (this.loaded) return Promise.resolve();
    if (this.loading) return this.loading;
    this.loading = this.load().finally(() => {
      this.loading = null;
    });
    return this.loading;
  }

  private async load(): Promise<void> {
    // 1. Server (live + cached).
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
      const res = await fetch("/api/prefabs", { signal: ctl.signal });
      clearTimeout(t);
      if (res.ok) {
        const data = (await res.json()) as Prefab[];
        this.ingest(data);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        } catch {
          /* quota or private mode — ignore */
        }
        console.info(
          `[PrefabRegistry] loaded ${data.length} prefabs from server`,
        );
        return;
      }
      console.warn(`[PrefabRegistry] server returned HTTP ${res.status}`);
    } catch (err) {
      console.warn("[PrefabRegistry] server fetch failed:", err);
    }

    // 2. localStorage cache (offline / first-paint replay).
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const data = JSON.parse(cached) as Prefab[];
        this.ingest(data);
        console.info(
          `[PrefabRegistry] loaded ${data.length} prefabs from cache (offline)`,
        );
        return;
      }
    } catch {
      /* corrupt cache — ignore */
    }

    // 3. Nothing — callers must fall back to hardcoded defaults.
    console.warn(
      "[PrefabRegistry] no prefabs available — game will use hardcoded fallbacks",
    );
  }

  private ingest(rows: Prefab[]) {
    this.prefabs.clear();
    for (const r of rows) this.prefabs.set(r.id, r);
    this.loaded = true;
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  getAll(): Prefab[] {
    return Array.from(this.prefabs.values());
  }

  getByKind(kind: Prefab["kind"]): Prefab[] {
    return this.getAll().filter((p) => p.kind === kind);
  }

  getById(id: string): Prefab | undefined {
    return this.prefabs.get(id);
  }
}

export const prefabRegistry = new PrefabRegistry();
