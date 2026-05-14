/**
 * FogSystem — manages the player's 100m fog aura + gloom atmosphere.
 *
 * The fog bubble has two jobs:
 *   1. Visual atmosphere — dark, moody gloom that makes the world feel alive.
 *      Color shifts by biome, time of day, and weather.
 *   2. Technical cover — everything beyond 100m is hidden by opaque fog so the
 *      render-culling budget stays tight with no visible pop-in.
 *
 * Systems updated:
 *   • THREE.FogExp2 on the scene  — affects ALL materials with `fog: true`
 *   • BiomeTerrainMaterial uniforms (uPlayerPos, uFogColor, uFogGloom)
 *     which drive the radial fog dome in the terrain GLSL.
 */

import * as THREE from 'three';
import { updateTerrainUniforms } from './BiomeTerrainMaterial';

// ─── Biome fog palettes ───────────────────────────────────────────────────────
// Each biome has a [day, night] fog color pair.
// FogSystem lerps between them based on dayCycle (0 = midnight, 1 = noon).

interface FogPalette {
  day:   THREE.Color;
  night: THREE.Color;
  gloom: number;       // how much gloom this biome adds on top of time-of-day
}

const BIOME_PALETTES: Record<string, FogPalette> = {
  default: {
    day:   new THREE.Color(0.55, 0.62, 0.75),
    night: new THREE.Color(0.04, 0.05, 0.12),
    gloom: 0.0,
  },
  tundra: {
    day:   new THREE.Color(0.68, 0.76, 0.90),
    night: new THREE.Color(0.05, 0.07, 0.18),
    gloom: 0.18,
  },
  forest: {
    day:   new THREE.Color(0.22, 0.38, 0.28),
    night: new THREE.Color(0.02, 0.06, 0.03),
    gloom: 0.25,
  },
  highland: {
    day:   new THREE.Color(0.48, 0.52, 0.62),
    night: new THREE.Color(0.04, 0.04, 0.10),
    gloom: 0.10,
  },
  desert: {
    day:   new THREE.Color(0.82, 0.68, 0.44),
    night: new THREE.Color(0.10, 0.07, 0.03),
    gloom: 0.05,
  },
  swamp: {
    day:   new THREE.Color(0.18, 0.24, 0.14),
    night: new THREE.Color(0.02, 0.04, 0.02),
    gloom: 0.45,
  },
};

// ─── Constants ────────────────────────────────────────────────────────────────

/** THREE.js scene fog density — tuned so objects vanish at ~100m */
const BASE_FOG_DENSITY = 0.032;
/** Gloom adds extra density (max night + storm multiplier) */
const GLOOM_FOG_MULT   = 1.8;

// ─── FogSystem ────────────────────────────────────────────────────────────────

export class FogSystem {
  private scene:        THREE.Scene;
  private sceneFog:     THREE.FogExp2;

  /** 0 = midnight, 0.5 = dawn/dusk, 1 = noon */
  dayCycle  = 0.75;
  /** 0 = clear, 1 = full storm */
  stormLevel = 0.0;
  /** Current biome key — set by WorldGen biome sampler each frame */
  biome      = 'default';

  private _fogColor = new THREE.Color();
  private _gloom    = 0.0;

  constructor(scene: THREE.Scene) {
    this.scene    = scene;
    this.sceneFog = new THREE.FogExp2(0x0a0c14, BASE_FOG_DENSITY);
    scene.fog     = this.sceneFog;
  }

  // ── Main update (call once per frame from GameEngine.update) ───────────────

  /**
   * @param dt          Delta time seconds
   * @param playerPos   World-space player position
   * @param cameraPos   World-space camera position
   * @param time        Elapsed time seconds (for shader animations)
   */
  update(
    dt: number,
    playerPos: THREE.Vector3,
    cameraPos: THREE.Vector3,
    time: number,
  ): void {
    const pal = BIOME_PALETTES[this.biome] ?? BIOME_PALETTES.default;

    // Day/night fog color
    const t = Math.max(0, Math.min(1, this.dayCycle));
    this._fogColor.lerpColors(pal.night, pal.day, t);

    // Storm tint — desaturate toward grey-white
    if (this.stormLevel > 0) {
      const stormColor = new THREE.Color(0.72, 0.76, 0.82);
      this._fogColor.lerp(stormColor, this.stormLevel * 0.6);
    }

    // Gloom = biome base + night darkness + storm
    const nightGloom  = 1 - t;                           // 0 at noon, 1 at midnight
    this._gloom = Math.min(1, pal.gloom + nightGloom * 0.7 + this.stormLevel * 0.3);

    // Fog density: denser at night + storm
    const density = BASE_FOG_DENSITY * (1 + this._gloom * (GLOOM_FOG_MULT - 1));
    this.sceneFog.color.copy(this._fogColor);
    this.sceneFog.density = density;

    // Update scene background to match fog horizon
    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.copy(this._fogColor);
    }

    // Push to terrain material uniforms (radial dome)
    updateTerrainUniforms(
      time,
      cameraPos,
      undefined,
      undefined,
      this._fogColor,
      playerPos,
      this._gloom,
    );
  }

  // ── API ───────────────────────────────────────────────────────────────────

  /** Call when the player enters a new biome zone */
  setBiome(biome: string): void {
    this.biome = BIOME_PALETTES[biome] ? biome : 'default';
  }

  /** Animate toward a storm (0–1). Call each frame with target value. */
  setStorm(level: number, dt: number): void {
    this.stormLevel += (level - this.stormLevel) * Math.min(1, dt * 0.5);
  }

  /** Smoothly advance the day cycle. Pass normalised time 0–1 each frame. */
  setDayCycle(t: number): void {
    this.dayCycle = Math.max(0, Math.min(1, t));
  }

  /** Current fog color (for minimap / UI use) */
  get color(): THREE.Color { return this._fogColor; }
  /** Current gloom level 0–1 */
  get gloom(): number { return this._gloom; }
}
