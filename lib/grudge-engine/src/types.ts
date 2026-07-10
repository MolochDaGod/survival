import { z } from "zod";

/** World units: metres (1 Three.js unit = 1 m). */
export const ENGINE_UNIT = "metres" as const;

export const scriptedRoleSchema = z.enum([
  "enemy",
  "npc",
  "player",
  "item",
  "building",
  "vehicle",
  "projectile",
  "fx",
  "trigger",
]);

export type ScriptedRole = z.infer<typeof scriptedRoleSchema>;

export const textureProfileSchema = z.object({
  colorSpace: z.enum(["srgb", "linear"]).default("srgb"),
  anisotropy: z.boolean().default(true),
  repeat: z.number().optional(),
  wrap: z.enum(["clamp", "repeat", "mirror"]).default("repeat"),
});

export const animationClipRefSchema = z.object({
  /** Engine semantic name (Idle, Walk, Run, Attack, …). */
  name: z.string(),
  /** Source clip name inside GLB or path to companion pack. */
  source: z.string(),
  loop: z.boolean().default(true),
  rootMotion: z.boolean().default(false),
});

export const animationLibrarySchema = z.object({
  id: z.string(),
  label: z.string(),
  /** Primary rig family — drives retarget/companion clip selection. */
  rig: z.enum(["quaternius", "mixamo", "unreal-mannequin", "custom"]),
  companionPacks: z.array(z.string()).default([]),
  clipMap: z.record(z.string(), z.string()).default({}),
  clips: z.array(animationClipRefSchema).default([]),
});

export const cameraProfileSchema = z.object({
  id: z.string(),
  label: z.string(),
  mode: z.enum(["first-person", "third-person", "arpg", "orbit", "vehicle"]),
  minDistance: z.number(),
  maxDistance: z.number(),
  lookAtHeightRatio: z.number().default(0.72),
  shoulderOffset: z.number().default(0.35),
  fov: z.number().default(60),
  mouseSensitivity: z.number().default(4),
  springCamera: z.boolean().default(true),
  springTime: z.number().default(0.08),
});

export const controllerProfileSchema = z.object({
  id: z.string(),
  label: z.string(),
  /** grudge-control | legacy | vehicle */
  driver: z.enum(["grudge-control", "legacy", "vehicle"]),
  /**
   * grudge-control uses cm internally — bridge to metre world.
   * Physics/camera values in manifest are in metres; multiply by 1/worldScale for init.
   */
  worldScale: z.number().default(0.01),
  targetHeightM: z.number().default(1.8),
  gravity: z.number().default(-22),
  jumpHeight: z.number().default(5.5),
  speed: z.number().default(8),
  flySpeed: z.number().default(14),
  acceleration: z.number().default(18),
  deceleration: z.number().default(18),
  headBoneName: z.string().default("mixamorigHead"),
  rotateY: z.number().default(Math.PI),
  animationLibraryId: z.string(),
});

export const assetPipelineSchema = z.object({
  cdnBase: z.string(),
  importScripts: z.object({
    character: z.string(),
    map: z.string(),
    inspect: z.string(),
  }),
  defaultCharacterHeightM: z.number().default(1.8),
  enemyScaleMixamo: z.number().default(0.014),
  enemyScaleGlbAutoFitMaxM: z.number().default(3),
});

export const engineManifestSchema = z.object({
  version: z.number().int().default(1),
  era: z.string().default("nexus"),
  unit: z.literal("metres"),
  updatedAt: z.string(),
  controllers: z.array(controllerProfileSchema),
  cameras: z.array(cameraProfileSchema),
  animationLibraries: z.array(animationLibrarySchema),
  textures: z.object({
    default: textureProfileSchema,
    terrain: textureProfileSchema,
    character: textureProfileSchema,
  }),
  pipeline: assetPipelineSchema,
  libraries: z.object({
    grudgeControl: z.string(),
    threejs: z.string(),
    rapier: z.string(),
    forge: z.string().optional(),
    assetStudio: z.string().optional(),
  }),
  /** Registered titles in this engine era (Flare Boss Arena, etc.). */
  games: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        route: z.string(),
        deployUrl: z.string().optional(),
        package: z.string(),
        modes: z.array(z.string()).optional(),
        playLoop: z.array(z.string()).optional(),
      }),
    )
    .optional(),
});

export type EngineManifest = z.infer<typeof engineManifestSchema>;
export type ControllerProfile = z.infer<typeof controllerProfileSchema>;
export type CameraProfile = z.infer<typeof cameraProfileSchema>;
export type AnimationLibrary = z.infer<typeof animationLibrarySchema>;
export type TextureProfile = z.infer<typeof textureProfileSchema>;