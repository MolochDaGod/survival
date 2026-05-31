import * as THREE from 'three';
import * as YUKA from 'yuka';
import { Enemy } from './types';
import { AssetManager, ENEMY_DEFS } from './AssetManager';
import { sampleTerrainHeight } from './TerrainBuilder';
import { groundY as groundFloor } from './GroundSampler';
import { EnemyBrain, EnemyRole, CombatState } from './ai/EnemyBrain';
import { tickAIMantle, aiMantleIsActive, clearAIMantle } from './ai/AILedgeMantle';

/**
 * Enemy defs/keys come from `assetManager.enemyDefs` after AssetManager.loadAll()
 * resolves them from the PrefabRegistry (or the hardcoded fallback). Don't
 * inline ENEMY_DEFS here — it would freeze the list at module-load time and
 * skip any new monster prefabs the admin panel adds.
 */

/** Simple projectile fired by ranged enemies. */
interface EnemyProjectile {
  mesh:     THREE.Mesh;
  velocity: THREE.Vector3;
  age:      number;
}

/** Separation radius — enemies push each other away inside this distance. */
const SEP_RADIUS   = 2.8;
const SEP_RADIUS_SQ = SEP_RADIUS * SEP_RADIUS;
const SEP_FORCE    = 6;

/** Animation-clip slot per enemy mesh. Filled lazily by `pickEnemyClips`. */
interface EnemyClipSet {
  idle:   THREE.AnimationAction | null;
  walk:   THREE.AnimationAction | null;
  attack: THREE.AnimationAction | null;
  death:  THREE.AnimationAction | null;
}

/**
 * Fuzzy clip matcher — different rigs name the same animation differently
 * (Idle / idle / Stand / Armature|Idle, Run / Walk / Move, Attack / Punch /
 * Slash, Death / Die / Dead). Returns the first clip whose name contains
 * any of the candidate substrings (case-insensitive). Falls back to
 * `THREE.AnimationClip.findByName` for exact matches first.
 */
function findClipFuzzy(
  animations: THREE.AnimationClip[],
  ...candidates: string[]
): THREE.AnimationClip | null {
  for (const c of candidates) {
    const exact = THREE.AnimationClip.findByName(animations, c);
    if (exact) return exact;
  }
  for (const c of candidates) {
    const needle = c.toLowerCase();
    const fuzzy  = animations.find(a => a.name.toLowerCase().includes(needle));
    if (fuzzy) return fuzzy;
  }
  return null;
}

/** Build an EnemyClipSet from a mixer + animations list. */
function buildEnemyClips(
  mixer: THREE.AnimationMixer,
  animations: THREE.AnimationClip[],
): EnemyClipSet {
  const mk = (clip: THREE.AnimationClip | null, loop: boolean) => {
    if (!clip) return null;
    const action = mixer.clipAction(clip);
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    if (!loop) action.clampWhenFinished = true;
    return action;
  };
  const idleClip   = findClipFuzzy(animations, 'Idle',   'idle',   'Stand', 'Breath');
  const walkClip   = findClipFuzzy(animations, 'Walk',   'walk',   'Run',   'run',   'Move');
  const attackClip = findClipFuzzy(animations, 'Attack', 'attack', 'Punch', 'Slash', 'Kick', 'Bite');
  const deathClip  = findClipFuzzy(animations, 'Death',  'death',  'Die',   'Dead');
  return {
    idle:   mk(idleClip,   true),
    walk:   mk(walkClip,   true),
    attack: mk(attackClip, true),
    death:  mk(deathClip,  false),
  };
}

export class EnemyManager {
  scene:   THREE.Scene;
  enemies: Enemy[] = [];

  private assetManager:    AssetManager | null = null;
  private spawnTimer:      number = 2;
  private spawnInterval:   number = 4;
  private maxEnemies:      number = 5;
  private wave:            number = 1;
  private enemiesKilled:   number = 0;

  /**
   * Spawn anchor — the player's starting point in world space, set by the
   * GameEngine right after `getStarterSpawn()` resolves. We refuse to drop
   * any enemy inside `SPAWN_SAFE_RADIUS` of this point so the encampment
   * itself stays a no-spawn zone (otherwise YUKA can sample a position
   * inside a building or right on top of the player on session start).
   */
  private spawnAnchor: THREE.Vector3 | null = null;
  private static readonly SPAWN_SAFE_RADIUS = 22; // metres — covers the encampment footprint
  private static readonly MIN_PLAYER_DIST   = 22; // never spawn within this distance of the live player

  /**
   * Intro grace — countdown set by `setIntroGrace(s)` immediately after
   * `startGameplay()`. While >0 we suppress both the trickle and any
   * `spawnWave()` call, so the player has a quiet window to get oriented.
   *
   * Any wave triggered during grace is *deferred* (not dropped) — we record
   * it in `pendingWave` and release it on the frame grace expires.
   */
  private introGrace:  number = 0;
  private pendingWave: number | null = null;

  private mixers: Map<Enemy, THREE.AnimationMixer> = new Map();

  // ── YUKA ──────────────────────────────────────────────────────────────────
  /** One EntityManager drives all enemy vehicles. */
  private yukaEM       = new YUKA.EntityManager();
  /**
   * Proxy vehicle whose position is kept in sync with the real player mesh.
   * PursuitBehavior uses this to predict the player's future position.
   * NOT added to yukaEM — we just read from it.
   */
  private playerProxy  = new YUKA.Vehicle();

  /** Brain per enemy (only alive enemies have a brain). */
  private brains: Map<Enemy, EnemyBrain> = new Map();

  // ── Ranged projectiles ─────────────────────────────────────────────────────
  private enemyShots: EnemyProjectile[] = [];
  private _shotGeo = new THREE.SphereGeometry(0.18, 6, 6);
  private _shotMat = new THREE.MeshBasicMaterial({ color: 0xff6600 });

  onEnemyKilled:   ((exp: number) => void) | null = null;
  onEnemyKilledAt: ((exp: number, position: THREE.Vector3, tier: 'basic' | 'elite' | 'boss') => void) | null = null;
  onEnemyDamaged:  ((position: THREE.Vector3, amount: number) => void) | null = null;
  /** Called when an enemy projectile hits the player. */
  onEnemyShotHit:  ((damage: number) => void) | null = null;

  private sharedHpBgGeo: THREE.PlaneGeometry;
  private sharedHpBgMat: THREE.MeshBasicMaterial;
  private sharedHpMat:   THREE.MeshBasicMaterial;

  constructor(scene: THREE.Scene, assetManager?: AssetManager) {
    this.scene        = scene;
    this.assetManager = assetManager ?? null;

    this.sharedHpBgGeo = new THREE.PlaneGeometry(0.8, 0.08);
    this.sharedHpBgMat = new THREE.MeshBasicMaterial({ color: 0x333333, side: THREE.DoubleSide });
    this.sharedHpMat   = new THREE.MeshBasicMaterial({ color: 0xff2244, side: THREE.DoubleSide, depthTest: false });
  }

  /** Latest player position — captured each frame by `update()` so spawn-time
   *  candidate sampling can reject points too close to the player. */
  private lastPlayerPos = new THREE.Vector3();

  /**
   * Tell the manager where the player spawned in the world. Enemies are
   * forbidden from spawning inside `SPAWN_SAFE_RADIUS` of this point so the
   * encampment / town hub stays peaceful.
   */
  setSpawnAnchor(anchor: THREE.Vector3) {
    this.spawnAnchor = anchor.clone();
  }

  /**
   * Open a no-spawn window of `seconds` after a fresh entry into the world.
   * While this window is open, both `spawnWave()` and the per-frame trickle
   * are suppressed.
   */
  setIntroGrace(seconds: number) {
    this.introGrace = Math.max(this.introGrace, seconds);
  }

  /** True while the intro grace window is open. Read by GameEngine to
   *  freeze the wave timer so wave-ups don't quietly tick during grace. */
  isInIntroGrace(): boolean {
    return this.introGrace > 0;
  }

  spawnWave(wave: number) {
    this.wave = wave;
    // During intro grace, defer the wave instead of dropping it. We keep
    // the highest pending wave so the player still gets the right tier
    // when grace ends, even if multiple were queued.
    if (this.introGrace > 0) {
      this.pendingWave = this.pendingWave === null
        ? wave
        : Math.max(this.pendingWave, wave);
      return;
    }
    // Wave size scales gently — first wave drops 2 enemies, capped by
    // maxEnemies so the world never feels overrun. The previous formula
    // (3 + wave*2, cap 14) felt swarm-y; with 5 simultaneous max alive
    // and 2-base growth the early game stays readable and the later
    // waves still ramp into a real threat.
    const count = Math.min(2 + Math.floor(wave * 0.7), this.maxEnemies);
    for (let i = 0; i < count; i++) {
      setTimeout(() => this.spawnEnemy(), i * 600);
    }
  }

  spawnEnemy() {
    if (this.enemies.filter(e => e.state !== 'dead').length >= this.maxEnemies) return;

    // Sample a candidate position in a 18-32m ring around the origin, then
    // resample up to N times if the candidate is too close to the spawn
    // anchor (the encampment safe zone) or to the live player. After N
    // attempts we accept whatever we have — better an occasional bad spawn
    // than no spawn at all if the safe zones cover most of the ring.
    let x = 0, z = 0;
    const MAX_TRIES = 6;
    const safeR2  = EnemyManager.SPAWN_SAFE_RADIUS * EnemyManager.SPAWN_SAFE_RADIUS;
    const playerR2 = EnemyManager.MIN_PLAYER_DIST * EnemyManager.MIN_PLAYER_DIST;
    for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist  = 24 + Math.random() * 14; // pushed out a touch (was 18-32)
      x = Math.cos(angle) * dist;
      z = Math.sin(angle) * dist;
      // Candidates start centred on the origin; offset toward the spawn
      // anchor so the ring follows the player's hub instead of (0,0).
      if (this.spawnAnchor) {
        x += this.spawnAnchor.x;
        z += this.spawnAnchor.z;
      }
      const dxA = this.spawnAnchor ? x - this.spawnAnchor.x : x;
      const dzA = this.spawnAnchor ? z - this.spawnAnchor.z : z;
      if (dxA * dxA + dzA * dzA < safeR2) continue;
      const dxP = x - this.lastPlayerPos.x;
      const dzP = z - this.lastPlayerPos.z;
      if (dxP * dxP + dzP * dzP < playerR2) continue;
      break; // candidate passed both checks
    }
    const y = groundFloor(x, z);

    // ~25% of enemies are ranged (increases slightly with wave)
    const rangedChance = Math.min(0.25 + this.wave * 0.03, 0.45);
    const isRanged     = Math.random() < rangedChance;
    const role         = isRanged ? EnemyRole.RANGED : EnemyRole.MELEE;

    const defs = this.assetManager?.enemyDefs ?? ENEMY_DEFS;
    const enemyTypeKey = defs[Math.floor(Math.random() * defs.length)].key;
    const group        = new THREE.Group();
    group.position.set(x, y, z);

    const loaded = this.assetManager?.cloneEnemyTemplate(enemyTypeKey);

    if (loaded) {
      const { group: modelGroup, mixer, animations, footOffsetY } = loaded;
      modelGroup.position.y = footOffsetY;
      group.add(modelGroup);

      // Measure the actual rendered height after foot-offset so the health
      // bar sits just above the model's head, regardless of scale/origin.
      modelGroup.updateMatrixWorld(true);
      const hpBox = new THREE.Box3().setFromObject(modelGroup);
      const modelTop = isFinite(hpBox.max.y) ? hpBox.max.y : 2.0;
      group.userData.hpBarY = modelTop + 0.35;

      // Pre-create one action per logical state (idle/walk/attack/death) so
      // the per-frame `updateEnemyAnimState` call can crossfade between them
      // without hitting `mixer.clipAction()` in the hot loop. If a rig is
      // missing a clip we fall back to whatever IS available so something
      // always plays — otherwise the model would T-pose between transitions.
      let clips: EnemyClipSet | null = null;
      if (mixer && animations.length > 0) {
        clips = buildEnemyClips(mixer, animations);
        if (!clips.idle) {
          // No idle clip — promote the first animation so the model isn't
          // frozen at rest. Mirrors the pre-crossfade fallback behaviour.
          const fallbackClip = animations[0];
          const action       = mixer.clipAction(fallbackClip);
          action.setLoop(THREE.LoopRepeat, Infinity);
          clips.idle = action;
        }
        clips.idle.play();
      }

      group.userData.enemyTypeKey  = enemyTypeKey;
      group.userData.modelGroup    = modelGroup;
      group.userData.mixer         = mixer;
      group.userData.animations    = animations;
      group.userData.clips         = clips;
      group.userData.currentClip   = clips?.idle ?? null;
      group.userData.hasRealModel  = true;
    } else {
      this.buildProceduralEnemy(group, enemyTypeKey, isRanged);
      group.userData.hasRealModel = false;
    }

    // Tint ranged enemies with a subtle blue glow on eyes
    if (isRanged) group.userData.isRanged = true;

    this.addHealthBar(group);
    this.scene.add(group);

    const health = 50 + this.wave * 20;
    const spd    = isRanged
      ? (2.5 + this.wave * 0.3 + Math.random())   // ranged a bit slower
      : (3   + this.wave * 0.5 + Math.random() * 1.5);

    const enemy: Enemy = {
      mesh:             group,
      health,
      maxHealth:        health,
      speed:            spd,
      damage:           isRanged ? 6 + this.wave * 2 : 8 + this.wave * 3,
      state:            'idle',
      attackCooldown:   isRanged ? 2.5 : 1.2,
      attackTimer:      0,
      distanceToPlayer: 999,
    };

    if (loaded?.mixer) this.mixers.set(enemy, loaded.mixer);

    // Create YUKA brain
    const brain = new EnemyBrain({
      role,
      x: x, y: y, z: z,
      speed:         spd,
      playerProxy:   this.playerProxy,
      entityManager: this.yukaEM,
    });
    this.brains.set(enemy, brain);

    this.enemies.push(enemy);
  }

  // ── Main update ──────────────────────────────────────────────────────────

  update(dt: number, playerPos: THREE.Vector3, wave: number) {
    this.wave = wave;
    this.lastPlayerPos.copy(playerPos);

    // Intro grace — silence the world for the first few seconds after the
    // player drops in. The trickle and any pending wave are gated on this.
    // On the frame grace transitions from open → closed, release any wave
    // queued during the window so wave 1 (or whatever the player has earned)
    // actually plays out, and reset the trickle timer for deterministic
    // post-grace pacing.
    if (this.introGrace > 0) {
      this.introGrace = Math.max(0, this.introGrace - dt);
      if (this.introGrace === 0) {
        this.spawnTimer = this.spawnInterval;
        if (this.pendingWave !== null) {
          const w = this.pendingWave;
          this.pendingWave = null;
          this.spawnWave(w);
        }
      }
    }

    // Spawn trickle
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = this.spawnInterval;
      if (this.introGrace <= 0 && this.enemies.filter(e => e.state !== 'dead').length < this.maxEnemies) {
        this.spawnEnemy();
      }
    }

    // Keep player proxy in sync (velocity estimated from movement)
    const prevPPX = this.playerProxy.position.x;
    const prevPPZ = this.playerProxy.position.z;
    this.playerProxy.position.set(playerPos.x, playerPos.y, playerPos.z);
    if (dt > 0) {
      this.playerProxy.velocity.set(
        (playerPos.x - prevPPX) / dt,
        0,
        (playerPos.z - prevPPZ) / dt,
      );
    }

    // ── Step 1: per-enemy brain logic (sets behavior weights) ─────────────
    const aliveEnemies = this.enemies.filter(e => e.state !== 'dead');
    for (const enemy of aliveEnemies) {
      const brain = this.brains.get(enemy);
      if (!brain) continue;
      brain.update(dt, playerPos, enemy.health / enemy.maxHealth);
    }

    // ── Step 2: YUKA physics integration (moves vehicles) ─────────────────
    this.yukaEM.update(dt);

    // ── Step 3: Separation — push overlapping enemies apart ────────────────
    for (let i = 0; i < aliveEnemies.length; i++) {
      const bi = this.brains.get(aliveEnemies[i]);
      if (!bi) continue;
      // Mantling enemies own their own translation — letting separation
      // shove them off the lerp would corrupt the climb endpoint.
      if (aiMantleIsActive(aliveEnemies[i])) continue;
      for (let j = i + 1; j < aliveEnemies.length; j++) {
        const bj = this.brains.get(aliveEnemies[j]);
        if (!bj) continue;
        if (aiMantleIsActive(aliveEnemies[j])) continue;
        const dx = bi.vehicle.position.x - bj.vehicle.position.x;
        const dz = bi.vehicle.position.z - bj.vehicle.position.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < SEP_RADIUS_SQ && d2 > 0.0001) {
          const d      = Math.sqrt(d2);
          const push   = ((SEP_RADIUS - d) / SEP_RADIUS) * SEP_FORCE * dt;
          const nx = dx / d, nz = dz / d;
          bi.vehicle.position.x += nx * push * 0.5;
          bi.vehicle.position.z += nz * push * 0.5;
          bj.vehicle.position.x -= nx * push * 0.5;
          bj.vehicle.position.z -= nz * push * 0.5;
        }
      }
    }

    // ── Step 4: sync mesh → vehicle, handle shots, animations ─────────────
    const time = Date.now() * 0.001;

    for (const enemy of this.enemies) {
      // Mixer ticks first so even dead enemies finish their death animation
      // (the rest of the per-frame logic — AI, separation, hp bars — is
      // skipped for dead enemies since they're being removed shortly).
      const mixer = this.mixers.get(enemy);
      if (mixer) mixer.update(dt);

      if (enemy.state === 'dead') continue;

      const brain = this.brains.get(enemy);

      // ── Position / facing ───────────────────────────────────────────────
      if (brain) {
        // Run the ledge-climb tick first. If the enemy is stuck against a
        // ~1 m rise while pursuing, this writes its own position+vehicle
        // lerp; we skip the YUKA→mesh sync and the ground-snap so the
        // climb lifts cleanly above the wall instead of being yanked
        // back to the lower surface.
        const isPursuing =
          brain.state === CombatState.PURSUE || brain.state === CombatState.COMBAT;
        const mantling = tickAIMantle(enemy, brain.vehicle, playerPos, isPursuing, dt);

        const vp = brain.vehicle.position;
        const pos = enemy.mesh.position;
        if (!mantling) {
          pos.x = vp.x;
          pos.z = vp.z;
          // Ground-snap (overrides YUKA y)
          if (enemy.mesh.userData.deathTimer == null) {
            pos.y = groundFloor(vp.x, vp.z);
          }
        }
        // Update distanceToPlayer
        const dx2 = playerPos.x - pos.x;
        const dz2 = playerPos.z - pos.z;
        enemy.distanceToPlayer = Math.sqrt(dx2 * dx2 + dz2 * dz2);

        // Face player (ranged always faces player while strafing)
        enemy.mesh.lookAt(new THREE.Vector3(playerPos.x, pos.y, playerPos.z));

        // Map brain CombatState → legacy Enemy state
        switch (brain.state) {
          case CombatState.IDLE:
            enemy.state = 'idle';  break;
          case CombatState.PURSUE:
            enemy.state = 'chase'; break;
          case CombatState.COMBAT:
          case CombatState.FLEE:
            enemy.state = enemy.distanceToPlayer < 2.8 ? 'attack' : 'chase';
            break;
        }

        // ── Ranged shot ───────────────────────────────────────────────────
        if (brain.pendingShot) {
          brain.pendingShot = false;
          this.spawnEnemyShot(enemy, playerPos);
        }
      } else {
        // Fallback (no brain) — original simple logic
        const pos = enemy.mesh.position;
        const toPlayer = playerPos.clone().sub(pos);
        toPlayer.y = 0;
        enemy.distanceToPlayer = toPlayer.length();
        enemy.state = enemy.distanceToPlayer < 30 ? 'chase' : 'idle';
        if (enemy.distanceToPlayer < 2.2) enemy.state = 'attack';
        if (enemy.state === 'chase') {
          const dir = toPlayer.normalize();
          pos.x += dir.x * enemy.speed * dt;
          pos.z += dir.z * enemy.speed * dt;
          enemy.mesh.lookAt(new THREE.Vector3(playerPos.x, pos.y, playerPos.z));
        }
        if (enemy.mesh.userData.deathTimer == null) {
          pos.y = groundFloor(pos.x, pos.z);
        }
      }

      // ── Knockback ────────────────────────────────────────────────────────
      // Skipped during a mantle so the scripted lerp can't be pushed off
      // its rails by leftover knockback impulse.
      if (enemy.knockback && enemy.knockback.lengthSq() > 0.0001 && !aiMantleIsActive(enemy)) {
        const pos = enemy.mesh.position;
        pos.x += enemy.knockback.x * dt;
        pos.z += enemy.knockback.z * dt;
        enemy.knockback.multiplyScalar(Math.exp(-5 * dt));
        // keep brain vehicle in sync with knockback
        if (brain) {
          brain.vehicle.position.x = pos.x;
          brain.vehicle.position.z = pos.z;
        }
      }

      // ── Melee attack timer ───────────────────────────────────────────────
      if (enemy.state === 'attack') {
        enemy.attackTimer -= dt;
        if (enemy.attackTimer <= 0) {
          enemy.attackTimer = enemy.attackCooldown;
        }
      }

      // ── Procedural animation ─────────────────────────────────────────────
      if (!enemy.mesh.userData.hasRealModel) {
        this.animateProceduralEnemy(enemy, time);
      } else if (!aiMantleIsActive(enemy)) {
        // Real FBX rig — crossfade between idle / walk / attack based on
        // the legacy state we just computed above. Skipped while mantling
        // because AILedgeMantle already drove the rig onto a one-shot
        // climb clip and we don't want to crossfade back to walk before
        // the climb finishes.
        this.updateEnemyAnimState(enemy);
      }

      // ── Health bar billboarding ──────────────────────────────────────────
      enemy.mesh.traverse(child => {
        if (child.userData.isHpBg || child.userData.isHpBar) {
          child.lookAt(new THREE.Vector3(
            playerPos.x,
            child.getWorldPosition(new THREE.Vector3()).y,
            playerPos.z,
          ));
        }
        if (child.userData.isHpBar) {
          const ratio = enemy.health / enemy.maxHealth;
          child.scale.x = Math.max(0, ratio);
          (child as THREE.Mesh).position.x = (ratio - 1) * 0.39;
        }
      });
    }

    // ── Step 5: update enemy projectiles ──────────────────────────────────
    this.updateEnemyShots(dt, playerPos);

    // ── Step 6: remove dead enemies ───────────────────────────────────────
    this.enemies = this.enemies.filter(e => {
      if (e.state === 'dead' && e.mesh.userData.deathTimer <= 0) {
        this.mixers.delete(e);
        this.scene.remove(e.mesh);
        clearAIMantle(e);
        const brain = this.brains.get(e);
        if (brain) { brain.dispose(this.yukaEM); this.brains.delete(e); }
        return false;
      }
      return true;
    });
  }

  // ── Enemy projectiles ──────────────────────────────────────────────────────

  private spawnEnemyShot(enemy: Enemy, playerPos: THREE.Vector3) {
    const from  = enemy.mesh.position.clone();
    from.y     += 1.4; // chest height
    const dir   = playerPos.clone().sub(from).normalize();
    dir.y       = 0.05; // slight arc

    const mesh  = new THREE.Mesh(this._shotGeo, this._shotMat);
    mesh.position.copy(from);
    this.scene.add(mesh);

    this.enemyShots.push({
      mesh,
      velocity: dir.multiplyScalar(14),
      age:      0,
    });
  }

  private updateEnemyShots(dt: number, playerPos: THREE.Vector3) {
    const toRemove: EnemyProjectile[] = [];

    for (const shot of this.enemyShots) {
      shot.age += dt;
      shot.mesh.position.addScaledVector(shot.velocity, dt);
      shot.velocity.y -= 9.8 * dt * 0.4; // gentle gravity

      // Hit test against player
      const dx = shot.mesh.position.x - playerPos.x;
      const dz = shot.mesh.position.z - playerPos.z;
      const dy = shot.mesh.position.y - (playerPos.y + 1);
      if (dx * dx + dy * dy + dz * dz < 1.6 * 1.6) {
        this.onEnemyShotHit?.(8 + this.wave * 2);
        toRemove.push(shot);
        continue;
      }

      if (shot.age > 4) toRemove.push(shot);
    }

    for (const shot of toRemove) {
      this.scene.remove(shot.mesh);
      this.enemyShots = this.enemyShots.filter(s => s !== shot);
    }
  }

  // ── Enemy mesh builders ────────────────────────────────────────────────────

  private buildProceduralEnemy(group: THREE.Group, typeKey: string, isRanged: boolean) {
    const def       = (this.assetManager?.enemyDefs ?? ENEMY_DEFS).find(d => d.key === typeKey);
    const bodyColor = def?.color ?? 0x2d5a1b;
    const accentCol = isRanged ? 0x0055ff : bodyColor;

    const bodyGeo  = new THREE.BoxGeometry(0.55, 0.8, 0.25);
    const bodyMesh = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.8, metalness: 0.1 }));
    bodyMesh.position.y = 1.0;
    bodyMesh.castShadow = true;
    group.add(bodyMesh);

    const headGeo  = new THREE.BoxGeometry(0.38, 0.38, 0.32);
    const headMesh = new THREE.Mesh(headGeo, new THREE.MeshStandardMaterial({ color: 0xc8a882, roughness: 0.9 }));
    headMesh.position.y = 1.65;
    headMesh.castShadow = true;
    group.add(headMesh);

    const eyeGeo = new THREE.BoxGeometry(0.08, 0.06, 0.33);
    const eyeMat = new THREE.MeshBasicMaterial({ color: isRanged ? 0x00aaff : 0xff0000 });
    [-0.1, 0.1].forEach(ox => {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(ox, 1.68, 0);
      group.add(eye);
    });

    const armGeo = new THREE.BoxGeometry(0.16, 0.55, 0.16);
    const armMat = new THREE.MeshStandardMaterial({ color: accentCol, roughness: 0.8 });
    [-0.38, 0.38].forEach((ox, i) => {
      const arm = new THREE.Mesh(armGeo, armMat);
      arm.position.set(ox, 0.95, 0);
      arm.userData.isArm  = true;
      arm.userData.isLeft = i === 0;
      group.add(arm);
    });

    const legGeo = new THREE.BoxGeometry(0.2, 0.5, 0.2);
    const legMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.8 });
    [-0.16, 0.16].forEach((ox, i) => {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(ox, 0.35, 0);
      leg.userData.isLeg  = true;
      leg.userData.isLeft = i === 0;
      group.add(leg);
    });

    // Ranged enemies carry a small "orb" as a weapon
    if (isRanged) {
      const orbGeo = new THREE.SphereGeometry(0.12, 6, 6);
      const orbMat = new THREE.MeshBasicMaterial({ color: 0x0088ff });
      const orb    = new THREE.Mesh(orbGeo, orbMat);
      orb.position.set(0.38, 1.05, 0.15);
      group.add(orb);
    }
  }

  private addHealthBar(group: THREE.Group) {
    // Use per-creature height when available (set during spawn after
    // auto-scale + foot-offset), or fall back to the legacy 2.6 m.
    const barY = group.userData.hpBarY ?? 2.6;

    const hbarBg = new THREE.Mesh(this.sharedHpBgGeo, this.sharedHpBgMat);
    hbarBg.position.y       = barY;
    hbarBg.userData.isHpBg  = true;
    group.add(hbarBg);

    const hbarGeo = new THREE.PlaneGeometry(0.78, 0.06);
    const hbarMat = this.sharedHpMat.clone();
    const hbar    = new THREE.Mesh(hbarGeo, hbarMat);
    hbar.position.set(0, barY, 0.01);
    hbar.userData.isHpBar = true;
    group.add(hbar);
  }

  // ── Real-rig animation crossfade ──────────────────────────────────────────
  /**
   * Pick the right action for the enemy's current state and crossfade to it
   * if it isn't already playing. No-op when the rig is missing the relevant
   * clip — the previously-playing action just keeps looping, which beats
   * snapping to a T-pose.
   *
   * Crossfade duration is short (0.18s) so combat reads crisply; idle ↔ walk
   * transitions feel natural without overshooting into noticeable lag.
   */
  private updateEnemyAnimState(enemy: Enemy) {
    const ud    = enemy.mesh.userData;
    const clips = ud.clips as EnemyClipSet | null | undefined;
    if (!clips) return;

    let target: THREE.AnimationAction | null = null;
    switch (enemy.state) {
      case 'attack': target = clips.attack ?? clips.walk ?? clips.idle; break;
      case 'chase':  target = clips.walk   ?? clips.idle;               break;
      case 'idle':
      default:       target = clips.idle;                               break;
    }
    if (!target) return;

    const current = ud.currentClip as THREE.AnimationAction | null | undefined;
    if (current === target) return;

    target.reset();
    target.setEffectiveWeight(1);
    target.play();
    if (current && current !== target) {
      current.crossFadeTo(target, 0.18, false);
    }
    ud.currentClip = target;
  }

  // ── Procedural animation ──────────────────────────────────────────────────

  private animateProceduralEnemy(enemy: Enemy, time: number) {
    const walkPhase = time * enemy.speed * 1.5;
    const idleSway  = Math.sin(time * 1.2) * 0.05;
    enemy.mesh.traverse(child => {
      if (child.userData.isLeg) {
        const sign = child.userData.isLeft ? 1 : -1;
        child.rotation.x = enemy.state === 'chase'
          ? Math.sin(walkPhase * sign) * 0.5
          : Math.sin(time * 1.2 + sign) * 0.06;
      }
      if (child.userData.isArm) {
        child.rotation.x = enemy.state === 'attack'
          ? Math.sin(time * 6) * 0.6 - 1
          : (enemy.state === 'chase' ? Math.sin(walkPhase) * 0.3 : idleSway);
      }
    });
  }

  // ── Player attack detection ───────────────────────────────────────────────

  checkPlayerAttack(
    playerPos:     THREE.Vector3,
    playerFwd:     THREE.Vector3,
    range:         number,
    damage:        number,
    isAoe:         boolean = false,
    knockbackForce: number = 0,
    arcDot:        number = 0.3,
  ): number {
    let hits = 0;
    for (const enemy of this.enemies) {
      if (enemy.state === 'dead') continue;
      const toEnemy = enemy.mesh.position.clone().sub(playerPos);
      toEnemy.y = 0;
      const dist  = toEnemy.length();
      const dir   = toEnemy.clone().normalize();

      const inRange = isAoe
        ? dist < range + 3
        : dist < range && dir.dot(playerFwd) > arcDot;

      if (inRange) {
        enemy.health -= damage;
        hits++;
        this.createHitFlash(enemy);
        if (knockbackForce > 0) {
          if (!enemy.knockback) enemy.knockback = new THREE.Vector3();
          enemy.knockback.add(dir.multiplyScalar(knockbackForce));
        }
        this.onEnemyDamaged?.(enemy.mesh.position, damage);
        if (enemy.health <= 0) this.killEnemy(enemy);
      }
    }
    return hits;
  }

  private createHitFlash(enemy: Enemy) {
    const origMats = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    enemy.mesh.traverse(child => {
      if (child instanceof THREE.Mesh && !child.userData.isHpBg && !child.userData.isHpBar) {
        origMats.set(child, child.material);
        const flash = Array.isArray(child.material)
          ? child.material.map(() => new THREE.MeshBasicMaterial({ color: 0xffffff }))
          : new THREE.MeshBasicMaterial({ color: 0xffffff });
        child.material = flash as any;
      }
    });
    setTimeout(() => {
      enemy.mesh.traverse(child => {
        if (child instanceof THREE.Mesh) {
          const orig = origMats.get(child);
          if (orig !== undefined) child.material = orig as any;
        }
      });
    }, 80);
  }

  killEnemy(enemy: Enemy) {
    enemy.state = 'dead';
    enemy.mesh.userData.deathTimer = 0.5;
    this.enemiesKilled++;

    // Dispose brain immediately so vehicle stops steering
    const brain = this.brains.get(enemy);
    if (brain) { brain.dispose(this.yukaEM); this.brains.delete(enemy); }

    // If the rig has a real death clip, crossfade to it so the skeleton
    // plays the death pose while the group still does the procedural
    // fall + sink. Both layers compose: bones animate the body, the
    // group transform tips the whole mesh over and pushes it underground.
    const ud    = enemy.mesh.userData;
    const clips = ud.clips as EnemyClipSet | null | undefined;
    if (clips?.death) {
      const target  = clips.death;
      const current = ud.currentClip as THREE.AnimationAction | null | undefined;
      target.reset();
      target.setEffectiveWeight(1);
      target.play();
      if (current && current !== target) {
        current.crossFadeTo(target, 0.15, false);
      }
      ud.currentClip = target;
    }

    const duration = 500;
    const start    = Date.now();
    const startRZ  = enemy.mesh.rotation.z;
    const startY = enemy.mesh.position.y;
    const iv = setInterval(() => {
      const t = Math.min((Date.now() - start) / duration, 1);
      enemy.mesh.rotation.z          = startRZ + t * Math.PI / 2;
      enemy.mesh.position.y = startY - t * 1.5;
      enemy.mesh.userData.deathTimer = (1 - t) * 0.5;
      if (t >= 1) { clearInterval(iv); enemy.mesh.userData.deathTimer = 0; }
    }, 16);

    const exp  = 20 + this.wave * 10;
    this.onEnemyKilled?.(exp);

    const tier: 'basic' | 'elite' | 'boss' =
      this.wave >= 8 ? 'boss' : this.wave >= 4 ? 'elite' : 'basic';
    const dropPos = enemy.mesh.position.clone();
    dropPos.y = 0;
    this.onEnemyKilledAt?.(exp, dropPos, tier);
  }

  getEnemyCount(): number {
    return this.enemies.filter(e => e.state !== 'dead').length;
  }

  checkEnemyAttack(playerPos: THREE.Vector3): number {
    let total = 0;
    for (const enemy of this.enemies) {
      if (enemy.state === 'attack' && enemy.attackTimer <= 0.05) {
        total += enemy.damage;
      }
    }
    return total;
  }

  dispose() {
    for (const enemy of this.enemies) {
      this.scene.remove(enemy.mesh);
      const brain = this.brains.get(enemy);
      if (brain) brain.dispose(this.yukaEM);
    }
    for (const shot of this.enemyShots) {
      this.scene.remove(shot.mesh);
    }
    this.brains.clear();
    this.mixers.clear();
    this.enemies    = [];
    this.enemyShots = [];
    this._shotGeo.dispose();
    this._shotMat.dispose();
    this.sharedHpBgGeo.dispose();
    this.sharedHpBgMat.dispose();
    this.sharedHpMat.dispose();
  }
}
