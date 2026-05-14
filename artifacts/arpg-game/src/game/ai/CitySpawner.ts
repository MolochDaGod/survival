/**
 * CitySpawner — populates the city with rigged, AI-driven ambient NPCs.
 *
 * Reuses the same FBX rig system as enemies (loaded by AssetManager) but
 * drives them through NPCManager's NEUTRAL faction so they wander, idle,
 * and react to events instead of attacking. Hostility only kicks in when
 * the player attacks them — the NPCBrain.onPlayerAngered hook handles that.
 *
 * Each spawned NPC:
 *   • Gets a real rigged mesh (cloned via SkeletonUtils so animations don't
 *     conflict between siblings).
 *   • Plays the prefab's idle/walk animation tied to YUKA-driven speed.
 *   • Wanders around a home position (pushGoal WANDER from NPCBrain).
 *   • Carries a short, randomly-chosen barker line that surfaces when the
 *     player gets close (consumed by HUD via onTalkPrompt).
 */

import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { NPCManager } from './NPCManager';
import { NPCFaction } from './NPCBrain';
import type { AssetManager } from '../AssetManager';

interface CityNPCRecord {
  brainId: string;
  mesh: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  idleAction?: THREE.AnimationAction;
  walkAction?: THREE.AnimationAction;
  talkLine: string;
  homePos: THREE.Vector3;
}

const TALK_LINES = [
  '“The grudge runs deep here. Watch your back.”',
  '“Heard the bells last night? Something\'s coming.”',
  '“You lookin\' for trade? Try the square.”',
  '“The old church hasn\'t opened its doors in years.”',
  '“Storm\'s coming. Best find shelter before sundown.”',
  '“Don\'t go past the river after dark. Things wander out there.”',
  '“We pay our respects to the old gods. You should too.”',
  '“My son was a guard. The Nexus took him.”',
  '“If you\'re building, the corner shop sells lumber cheap.”',
  '“Stay out of the back alleys. That\'s all I\'ll say.”',
];

const TALK_PROMPT_RANGE = 4;          // metres
const TALK_HIDE_RANGE   = 5.5;        // metres (hysteresis)

export class CitySpawner {
  private npcs: CityNPCRecord[] = [];
  private nearestId: string | null = null;
  /** UI consumes this to render the floating talk hint. */
  onTalkPrompt: ((text: string | null) => void) | null = null;

  constructor(
    private scene: THREE.Scene,
    private npcManager: NPCManager,
    private assetManager: AssetManager,
  ) {}

  /**
   * Spawn `count` ambient NPCs around `centre`. Picks from the available
   * enemy meshes (which are already rigged + animated FBX files) and
   * reuses them as friendlies — there's no civilian-only mesh in the
   * project yet but rigged is rigged.
   */
  populate(centre: THREE.Vector3, count: number, radius: number = 30): void {
    // Use whatever enemy templates the AssetManager actually loaded — these
    // ship as rigged FBX with idle/walk/attack/death clips already attached
    // to the template's `animations` array.
    const usable: string[] = [];
    for (const key of this.assetManager.enemyTemplates.keys()) usable.push(key);
    if (usable.length === 0) {
      console.warn('[CitySpawner] no enemy templates loaded, skipping populate');
      return;
    }

    for (let i = 0; i < count; i++) {
      const key = usable[i % usable.length];
      this._spawnOne(centre, radius, key, i);
    }
    console.log(`[CitySpawner] spawned ${this.npcs.length} ambient NPCs around (${centre.x.toFixed(0)}, ${centre.z.toFixed(0)})`);
  }

  private _spawnOne(centre: THREE.Vector3, radius: number, meshKey: string, idx: number): void {
    const tpl = this.assetManager.enemyTemplates.get(meshKey);
    if (!tpl) return;

    // Random position inside disc around centre.
    const angle = Math.random() * Math.PI * 2;
    const r     = Math.sqrt(Math.random()) * radius;
    const home  = new THREE.Vector3(
      centre.x + Math.cos(angle) * r,
      centre.y,
      centre.z + Math.sin(angle) * r,
    );

    // Cloning a skinned mesh requires SkeletonUtils so the bones aren't
    // shared between siblings. Without this, every NPC's animation drives
    // every other NPC's pose simultaneously.
    const inner = skeletonClone(tpl.group) as THREE.Object3D;
    inner.scale.setScalar(tpl.scale);
    inner.position.y = tpl.footOffsetY;
    inner.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });

    // Wrapper group is what YUKA drives — NPCBrain.tick() overwrites
    // brain.mesh.matrix with the YUKA worldMatrix, so any scale/y-offset
    // applied to brain.mesh would be lost every frame. The wrapper carries
    // the YUKA transform; the inner skinned mesh keeps its rig scale.
    const mesh = new THREE.Group();
    mesh.name = `city-npc-mesh-${meshKey}-${idx}`;
    mesh.position.copy(home);
    mesh.add(inner);
    this.scene.add(mesh);

    // Animation rig — pull idle/walk from the template's clip list.
    // Mixer drives the INNER skinned mesh (the one with the actual rig).
    const mixer = new THREE.AnimationMixer(inner);
    const clips = tpl.animations;
    const findClip = (re: RegExp) => clips.find(c => re.test(c.name));
    const idleClip = findClip(/idle|stand|breath/i) ?? clips[0];
    const walkClip = findClip(/walk|move|run/i);
    const idleAction = idleClip ? mixer.clipAction(idleClip) : undefined;
    const walkAction = walkClip ? mixer.clipAction(walkClip) : undefined;
    idleAction?.play();
    if (walkAction) {
      walkAction.weight = 0;
      walkAction.play();
    }

    const id = `city-npc-${idx}-${meshKey}`;
    const brain = this.npcManager.spawn({
      id,
      faction: NPCFaction.NEUTRAL,
      walkSpeed: 1.2 + Math.random() * 0.6,
      runSpeed:  3.5,
      visionRange: 28,
      homePosition: home.clone(),
    });
    // Attach the visible mesh so NPCManager.update will sync YUKA matrix → mesh.
    brain.mesh = mesh;
    brain.setPosition(home.x, home.y, home.z);
    // Default behavior in NPCBrain.tick() is gentle wander + brief IDLE goals,
    // so we don't need to push anything — they'll start strolling immediately.
    brain.enableWander();

    this.npcs.push({
      brainId: id,
      mesh,
      mixer,
      idleAction,
      walkAction,
      talkLine: TALK_LINES[Math.floor(Math.random() * TALK_LINES.length)],
      homePos: home,
    });
  }

  /**
   * Per-frame: tick mixers, pick the nearest NPC for the talk prompt.
   * Also crossfades idle ↔ walk animation based on YUKA velocity.
   */
  update(dt: number, playerPos: THREE.Vector3): void {
    let bestRec: CityNPCRecord | null = null;
    let bestDist2 = TALK_PROMPT_RANGE * TALK_PROMPT_RANGE;

    for (const rec of this.npcs) {
      rec.mixer.update(dt);

      // Crossfade idle ↔ walk. NPCManager doesn't expose velocity, so we
      // approximate with last-frame mesh position delta (cheap, accurate
      // enough for animation gating).
      const prev = (rec.mesh.userData._prevPos as THREE.Vector3) || rec.mesh.position.clone();
      const speed = prev.distanceTo(rec.mesh.position) / Math.max(dt, 0.001);
      rec.mesh.userData._prevPos = rec.mesh.position.clone();
      if (rec.idleAction && rec.walkAction) {
        const moving = speed > 0.4;
        const targetWalkW = moving ? 1 : 0;
        const targetIdleW = moving ? 0 : 1;
        rec.walkAction.weight = THREE.MathUtils.lerp(rec.walkAction.weight, targetWalkW, dt * 6);
        rec.idleAction.weight = THREE.MathUtils.lerp(rec.idleAction.weight, targetIdleW, dt * 6);
        if (moving && !rec.walkAction.isRunning()) rec.walkAction.play();
      }

      const dx = playerPos.x - rec.mesh.position.x;
      const dz = playerPos.z - rec.mesh.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestDist2) {
        bestDist2 = d2;
        bestRec = rec;
      }
    }

    // Hysteresis so the prompt doesn't flicker at the boundary.
    if (this.nearestId && bestRec?.brainId !== this.nearestId) {
      const prev = this.npcs.find(n => n.brainId === this.nearestId);
      if (prev) {
        const dx = playerPos.x - prev.mesh.position.x;
        const dz = playerPos.z - prev.mesh.position.z;
        if (Math.sqrt(dx*dx + dz*dz) < TALK_HIDE_RANGE) {
          // Stay sticky.
          return;
        }
      }
    }

    if (bestRec) {
      if (bestRec.brainId !== this.nearestId) {
        this.nearestId = bestRec.brainId;
        this.onTalkPrompt?.(`Press T  ${bestRec.talkLine}`);
      }
    } else if (this.nearestId) {
      this.nearestId = null;
      this.onTalkPrompt?.(null);
    }
  }

  dispose(): void {
    for (const rec of this.npcs) {
      rec.mixer.stopAllAction();
      // Uncache the root so the mixer's internal action/clip cache for this
      // skeleton is released; without this we leak a small map per spawn
      // across long sessions with multiple level reloads.
      rec.mixer.uncacheRoot(rec.mesh);
      this.scene.remove(rec.mesh);
      this.npcManager.despawn(rec.brainId);
    }
    this.npcs = [];
    this.nearestId = null;
    this.onTalkPrompt = null;
  }
}
