/**
 * Unified engine asset facade — single entry for scriptable systems.
 *
 * Industry pattern: data-driven manifest (controllers/cameras/animations/textures)
 * + registry facades (prefabs, UUID catalog) behind one loader.
 */
import {
  getDefaultEngineManifest,
  parseEngineManifest,
  getControllerProfile,
  getCameraProfile,
  getAnimationLibrary,
  kindToScriptedRole,
  type EngineManifest,
} from "@workspace/grudge-engine";
import { AssetRegistry } from "./AssetRegistry";
import { prefabRegistry, type Prefab } from "./PrefabRegistry";
import { assetUrl } from "@/lib/assetUrl";

const MANIFEST_CACHE_KEY = "grudge:engine_manifest:v1";

class EngineAssetsService {
  private manifest: EngineManifest = getDefaultEngineManifest();
  private manifestLoaded = false;

  /** Boot manifest — server override with bundled defaults fallback. */
  async ensureManifest(): Promise<EngineManifest> {
    if (this.manifestLoaded) return this.manifest;
    try {
      const res = await fetch("/api/engine/manifest");
      if (res.ok) {
        this.manifest = parseEngineManifest(await res.json());
        try {
          localStorage.setItem(MANIFEST_CACHE_KEY, JSON.stringify(this.manifest));
        } catch {
          /* ignore */
        }
      }
    } catch {
      try {
        const cached = localStorage.getItem(MANIFEST_CACHE_KEY);
        if (cached) this.manifest = parseEngineManifest(JSON.parse(cached));
      } catch {
        /* use defaults */
      }
    }
    this.manifestLoaded = true;
    return this.manifest;
  }

  getManifest(): EngineManifest {
    return this.manifest;
  }

  async ensurePrefabs(): Promise<void> {
    await prefabRegistry.ensureLoaded();
  }

  /** Resolve model path → CDN URL via assetUrl + optional UUID catalog. */
  resolveModelPath(path: string): string {
    const entry = AssetRegistry.getByPath(path);
    if (entry?.remoteUrl) return entry.remoteUrl;
    return assetUrl(path);
  }

  getController(id: string) {
    return getControllerProfile(this.manifest, id);
  }

  getCameraForMode(mode: string) {
    return getCameraProfile(this.manifest, mode);
  }

  getAnimLibrary(id: string) {
    return getAnimationLibrary(this.manifest, id);
  }

  getTextureProfile(role: keyof EngineManifest['textures']) {
    return this.manifest.textures[role];
  }

  enrichPrefabRow(row: Record<string, unknown>): Prefab {
    const kind = String(row.kind ?? "prop");
    const data = (row.data ?? {}) as Record<string, unknown>;
    return {
      ...(row as unknown as Prefab),
      scriptedRole:
        (row.scriptedRole as Prefab["scriptedRole"]) ??
        (data.scriptedRole as Prefab["scriptedRole"]) ??
        kindToScriptedRole(kind),
      animations:
        (row.animations as Prefab["animations"]) ??
        (data.animations as Prefab["animations"]),
      textures:
        (row.textures as Prefab["textures"]) ??
        (data.textures as Prefab["textures"]),
      collider:
        (row.collider as Prefab["collider"]) ??
        (data.collider as Prefab["collider"]),
      aiHints:
        (row.aiHints as Prefab["aiHints"]) ??
        (data.aiHints as Prefab["aiHints"]),
      spawnRules:
        (row.spawnRules as Prefab["spawnRules"]) ??
        (data.spawnRules as Prefab["spawnRules"]),
    };
  }

  /** Pre-warm boot dependencies in parallel. */
  async boot(): Promise<void> {
    await Promise.all([
      this.ensureManifest(),
      prefabRegistry.ensureLoaded(),
    ]);
    console.info(
      `[EngineAssets] Nexus manifest v${this.manifest.version} · ` +
        `${this.manifest.controllers.length} controllers · ` +
        `${this.manifest.animationLibraries.length} anim libraries`,
    );
  }
}

export const engineAssets = new EngineAssetsService();