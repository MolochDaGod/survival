import * as THREE from 'three';

// ── Re-export shared types from @workspace/game-systems ─────────────────────
// Single source of truth — game client re-exports, never redefines.
export type { WeaponStats, AbilityDef, SkillNode, PlayerStats } from '@workspace/game-systems/types';

export type CameraMode = 'first-person' | 'third-person' | 'arpg';

export interface Enemy {
  mesh: THREE.Group;
  health: number;
  maxHealth: number;
  speed: number;
  damage: number;
  state: 'idle' | 'chase' | 'attack' | 'dead';
  attackCooldown: number;
  attackTimer: number;
  knockback?: THREE.Vector3;
  distanceToPlayer: number;
}

export interface Projectile {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  damage: number;
  lifetime: number;
  owner: 'player' | 'enemy';
}

export interface ParticleEffect {
  particles: THREE.Points;
  lifetime: number;
  maxLifetime: number;
}

export interface GameState {
  paused: boolean;
  mainMenuOpen: boolean;
  skillTreeOpen: boolean;
  inventoryOpen: boolean;
  killCount: number;
  score: number;
  wave: number;
  gameStarted: boolean;
}
