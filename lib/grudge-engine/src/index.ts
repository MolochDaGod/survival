export * from "./types";
export * from "./kind-map";
export * from "./nexus-defaults";
export * from "./armada-defaults";
export { engineManifestSchema } from "./types";

import { engineManifestSchema, type EngineManifest } from "./types";
import { NEXUS_ENGINE_MANIFEST } from "./nexus-defaults";
import { ARMADA_ENGINE_MANIFEST } from "./armada-defaults";

export type EngineEra = "nexus" | "armada";

export function getDefaultEngineManifest(): EngineManifest {
  return NEXUS_ENGINE_MANIFEST;
}

export function getManifestForEra(era: EngineEra | string): EngineManifest {
  if (era === "armada") return ARMADA_ENGINE_MANIFEST;
  return NEXUS_ENGINE_MANIFEST;
}

export function parseEngineManifest(raw: unknown): EngineManifest {
  return engineManifestSchema.parse(raw);
}

/** Scale metre-world values for grudge-control init (cm bridge). */
export function toGrudgeControlUnits(metres: number, worldScale: number): number {
  return metres / worldScale;
}

export function getControllerProfile(
  manifest: EngineManifest,
  id: string,
) {
  return manifest.controllers.find((c) => c.id === id);
}

export function getCameraProfile(
  manifest: EngineManifest,
  mode: string,
) {
  return manifest.cameras.find((c) => c.mode === mode);
}

export function getAnimationLibrary(
  manifest: EngineManifest,
  id: string,
) {
  return manifest.animationLibraries.find((a) => a.id === id);
}

/** GLTF/FBX source clip name → engine semantic name (LocomotionAnimator contract). */
export function buildAnimClipMap(
  manifest: EngineManifest,
  libraryId = manifest.controllers[0]?.animationLibraryId,
): Record<string, string> {
  const lib = libraryId ? getAnimationLibrary(manifest, libraryId) : manifest.animationLibraries[0];
  return { ...(lib?.clipMap ?? {}) };
}

export function getCompanionPackPaths(
  manifest: EngineManifest,
  libraryId: string,
): string[] {
  return getAnimationLibrary(manifest, libraryId)?.companionPacks ?? [];
}