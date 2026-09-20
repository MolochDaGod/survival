/**
 * LinearCastRuntime — production skillshot fronts for voxel-era Grudges.
 *
 * Ports the *behaviour* of LinearAbiltyCastingThreeJS (line / arc / zone travel
 * fronts + impact) without shipping the full GLSL editor sandbox.
 *
 * Phases (shared Ability pattern from the sandbox):
 *   TRAVEL → IMPACT → HOLD (optional) → FADE
 */

import * as THREE from 'three';
import { groundY } from '../GroundSampler';
import type { PinataDebrisField } from '../vfx/PinataDebrisField';
import type { ShockwaveVFX } from '../vfx/ShockwaveVFX';
import type { IceShardVFX } from '../vfx/IceShardVFX';
import type { NoiseSphereVFX } from '../NoiseSphereVFX';
import type { SpellFlare, FlareType } from '../vfx/SpellFlare';
import type { ExplosionVFX } from '../ExplosionVFX';
import {
  type LinearAbilityId,
  type LinearVariantId,
  type ResolvedLinearProfile,
  resolveLinearProfile,
} from './linearAbilityCatalog';

export type DamageFn = (damage: number, isAoe: boolean, center: THREE.Vector3, radius: number) => void;

type Phase = 'travel' | 'impact' | 'hold' | 'fade' | 'done';

interface ActiveCast {
  id: string;
  profile: ResolvedLinearProfile;
  phase: Phase;
  origin: THREE.Vector3;
  dir: THREE.Vector3;
  distance: number;
  /** Progress 0..1 along path for line/arc. */
  t: number;
  age: number;
  holdLeft: number;
  front: THREE.Object3D;
  beam?: THREE.Mesh;
  zoneRing?: THREE.Mesh;
  damage: number;
  hitDone: boolean;
}

export interface LinearCastDeps {
  scene: THREE.Scene;
  pinata: PinataDebrisField;
  shockwave?: ShockwaveVFX | null;
  iceShards?: IceShardVFX | null;
  noiseSpheres?: NoiseSphereVFX | null;
  spellFlare?: SpellFlare | null;
  explosions?: ExplosionVFX | null;
  /** Optional telegraph: (origin, radius, duration, colorHex). */
  showZone?: (origin: THREE.Vector3, radius: number, duration: number, color: number) => void;
  showLine?: (origin: THREE.Vector3, dir: THREE.Vector3, range: number, color: number) => void;
}

let _castSeq = 0;

export class LinearCastRuntime {
  private deps: LinearCastDeps;
  private active: ActiveCast[] = [];
  /** Per-ability last-used variant (player preference). */
  private variants = new Map<LinearAbilityId, LinearVariantId>();

  constructor(deps: LinearCastDeps) {
    this.deps = deps;
  }

  setVariant(abilityId: LinearAbilityId, variantId: LinearVariantId): void {
    this.variants.set(abilityId, variantId);
  }

  getVariant(abilityId: LinearAbilityId): LinearVariantId | undefined {
    return this.variants.get(abilityId);
  }

  setShockwave(shockwave: ShockwaveVFX | null | undefined): void {
    this.deps.shockwave = shockwave ?? null;
  }

  /**
   * Spawn a linear skillshot from caster position along unit forward.
   * Returns false if profile missing.
   */
  cast(
    abilityId: LinearAbilityId | string,
    origin: THREE.Vector3,
    forward: THREE.Vector3,
    onDamage: DamageFn,
    variantId?: LinearVariantId,
  ): boolean {
    const vid = variantId ?? this.variants.get(abilityId as LinearAbilityId);
    const profile = resolveLinearProfile(abilityId, vid);
    if (!profile) return false;

    const dir = forward.clone();
    dir.y = 0;
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    dir.normalize();

    const hand = origin.clone().add(new THREE.Vector3(0, 1.35, 0));
    const dist = Math.max(profile.minRange, profile.range);

    // Zone: center is pointAt(1) — far end of aim (sandbox rule).
    let travelOrigin = hand.clone();
    let targetDist = dist;
    if (profile.castShape === 'zone') {
      const center = origin.clone().addScaledVector(dir, dist);
      center.y = groundY(center.x, center.z);
      travelOrigin = hand;
      // Short leash travel then snap zone
      targetDist = dist;
      this.deps.showZone?.(
        center,
        profile.effectiveZoneRadius,
        0.35,
        new THREE.Color(profile.color).getHex(),
      );
    } else {
      this.deps.showLine?.(hand, dir, dist, new THREE.Color(profile.color).getHex());
    }

    const front = this._makeFront(profile, travelOrigin);
    this.deps.scene.add(front);

    const cast: ActiveCast = {
      id: `lin_${++_castSeq}`,
      profile,
      phase: 'travel',
      origin: travelOrigin,
      dir,
      distance: targetDist,
      t: 0,
      age: 0,
      holdLeft: profile.effectiveHold,
      front,
      damage: profile.damage,
      hitDone: false,
    };

    // Nova beam: brief charge then near-instant front + hold
    if (profile.id === 'nova_beam') {
      cast.t = 0;
      this.deps.spellFlare?.trigger(hand, 'arcane' as FlareType, 0.4);
      this.deps.noiseSpheres?.spawn(hand, {
        preset: 'void',
        radius: 0.45,
        lifetime: 0.35,
        fadeIn: 0.05,
      });
    }

    this.active.push(cast);
    // Stash damage callback on userData for update
    (cast as ActiveCast & { _onDamage?: DamageFn })._onDamage = onDamage;
    return true;
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const c = this.active[i] as ActiveCast & { _onDamage?: DamageFn };
      c.age += dt;

      if (c.phase === 'travel') {
        const speed = Math.max(4, c.profile.speed);
        const dTravel = (speed * dt) / Math.max(0.1, c.distance);
        c.t = Math.min(1, c.t + dTravel);

        if (c.profile.castShape === 'arc') {
          // Parabola height at mid
          const h = c.profile.effectiveArc;
          const yLift = 4 * h * c.t * (1 - c.t);
          c.front.position.copy(c.origin).addScaledVector(c.dir, c.distance * c.t);
          c.front.position.y = c.origin.y + yLift;
        } else if (c.profile.castShape === 'zone') {
          // Leash tip races to zone center
          c.front.position.copy(c.origin).addScaledVector(c.dir, c.distance * c.t);
          c.front.position.y = groundY(c.front.position.x, c.front.position.z) + 0.15;
        } else {
          c.front.position.copy(c.origin).addScaledVector(c.dir, c.distance * c.t);
        }

        // Trail sparks while traveling
        if (c.profile.element === 'fire' && Math.random() < 0.4) {
          this.deps.noiseSpheres?.flash(c.front.position.clone(), 'fire', 0.25);
        }
        if (c.profile.element === 'lightning' && Math.random() < 0.35) {
          this.deps.noiseSpheres?.flash(c.front.position.clone(), 'lightning', 0.2);
        }

        if (c.t >= 1) {
          c.phase = 'impact';
          this._impact(c);
        }
      } else if (c.phase === 'impact') {
        c.phase = c.holdLeft > 0 ? 'hold' : 'fade';
      } else if (c.phase === 'hold') {
        c.holdLeft -= dt;
        // Beam / snare ongoing burn
        if (c.profile.id === 'nova_beam' && c.beam) {
          const pulse = 0.9 + Math.sin(c.age * 18) * 0.1;
          c.beam.scale.set(1, 1, pulse);
          (c.beam.material as THREE.MeshBasicMaterial).opacity = 0.35 + pulse * 0.25;
        }
        if (c.profile.id === 'voltaic_snare' && c.zoneRing) {
          const snap = 1 + Math.sin(c.age * 10) * 0.04;
          c.zoneRing.scale.setScalar(snap);
        }
        if (c.holdLeft <= 0) c.phase = 'fade';
      } else if (c.phase === 'fade') {
        this._disposeCast(c);
        this.active.splice(i, 1);
      }
    }
  }

  private _impact(c: ActiveCast & { _onDamage?: DamageFn }): void {
    const impact = c.front.position.clone();
    impact.y = groundY(impact.x, impact.z) + 0.1;
    const color = new THREE.Color(c.profile.color).getHex();
    const aoe =
      c.profile.castShape === 'zone' || c.profile.castShape === 'arc'
        ? c.profile.effectiveZoneRadius
        : c.profile.effectiveAoe;

    // Element VFX
    switch (c.profile.element) {
      case 'ice':
        this.deps.iceShards?.burst(impact, aoe * 1.1, 10, 2.0);
        this.deps.noiseSpheres?.spawn(impact.clone().setY(impact.y + 0.6), {
          preset: 'ice',
          radius: aoe * 0.45,
          lifetime: 0.9,
          fadeIn: 0.05,
        });
        this.deps.spellFlare?.trigger(impact.clone().setY(impact.y + 0.8), 'ice', 0.35);
        // Pinata ice shatter along path
        this.deps.pinata.burstAlongLine(c.origin, c.dir, c.distance, 5, {
          material: 'ice',
          count: 5,
          impulse: 5,
          size: 0.14,
          color,
        });
        this.deps.pinata.burst({
          position: impact,
          material: 'ice',
          count: 14,
          impulse: 7,
          size: 0.16,
          color,
        });
        break;

      case 'lightning':
        this._lightningBolt(impact);
        this.deps.noiseSpheres?.spawn(impact.clone().setY(impact.y + 0.4), {
          preset: 'lightning',
          radius: aoe * 0.4,
          lifetime: 0.7,
          fadeIn: 0.04,
        });
        this.deps.spellFlare?.trigger(impact.clone().setY(impact.y + 1), 'lightning', 0.3);
        this.deps.pinata.burstAlongLine(c.origin, c.dir, c.distance, 4, {
          material: 'scrap',
          count: 3,
          impulse: 4,
          size: 0.1,
          color: 0x444444,
        });
        break;

      case 'fire':
        this.deps.explosions?.burst({
          position: impact,
          radius: aoe * 1.2,
          color,
          particles: 70,
          lifetime: 1.3,
        });
        this.deps.noiseSpheres?.spawn(impact.clone().setY(impact.y + 0.5), {
          preset: 'fire',
          radius: aoe * 0.5,
          lifetime: 1.0,
          fadeIn: 0.05,
        });
        this.deps.pinata.burst({
          position: impact,
          material: 'ember',
          count: c.profile.variantId === 'cluster' ? 22 : 16,
          impulse: 9,
          size: 0.2,
          color,
          upBias: 0.7,
        });
        if (c.profile.variantId === 'cluster') {
          for (let k = 0; k < 3; k++) {
            const off = impact
              .clone()
              .add(
                new THREE.Vector3(
                  (Math.random() - 0.5) * aoe,
                  0.2,
                  (Math.random() - 0.5) * aoe,
                ),
              );
            this.deps.pinata.burst({
              position: off,
              material: 'ember',
              count: 8,
              impulse: 6,
              size: 0.14,
              color,
            });
          }
        }
        break;

      case 'arcane':
        this._spawnBeam(c, impact);
        this.deps.noiseSpheres?.spawn(impact.clone().setY(impact.y + 0.5), {
          preset: 'void',
          radius: aoe * 0.35,
          lifetime: Math.max(0.6, c.profile.effectiveHold),
          fadeIn: 0.05,
        });
        this.deps.spellFlare?.trigger(impact.clone().setY(impact.y + 1.2), 'arcane', 0.45);
        break;

      case 'voltaic':
        this._spawnZoneRing(c, impact, aoe);
        this.deps.noiseSpheres?.spawn(impact.clone().setY(impact.y + 1.2), {
          preset: 'lightning',
          radius: aoe * 0.55,
          lifetime: Math.max(0.8, c.profile.effectiveHold),
          fadeIn: 0.06,
        });
        this.deps.pinata.burst({
          position: impact,
          material: 'scrap',
          count: 10,
          impulse: 5,
          size: 0.12,
          color,
        });
        break;
    }

    this.deps.shockwave?.fire(impact, {
      radius: aoe * 1.4,
      color,
      duration: 0.4,
      opacity: 0.55,
    });

    if (!c.hitDone) {
      c.hitDone = true;
      c._onDamage?.(c.damage, true, impact, aoe);
    }

    // Hide travel front mesh for beam/zone (replaced by hold visuals)
    if (c.beam || c.zoneRing) {
      c.front.visible = false;
    }
  }

  private _makeFront(profile: ResolvedLinearProfile, at: THREE.Vector3): THREE.Object3D {
    const color = new THREE.Color(profile.color);
    const geo = new THREE.SphereGeometry(0.22, 10, 10);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(at);
    mesh.renderOrder = 990;
    // Light so impact reads
    const light = new THREE.PointLight(color.getHex(), 2.5, 8);
    mesh.add(light);
    return mesh;
  }

  private _lightningBolt(impact: THREE.Vector3): void {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 8; i++) {
      const y = 18 - i * 2.2;
      const j = i < 8 ? (Math.random() - 0.5) * 0.9 : 0;
      pts.push(new THREE.Vector3(impact.x + j, y, impact.z + j));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: 0xfff176, transparent: true, opacity: 0.95 }),
    );
    this.deps.scene.add(line);
    setTimeout(() => {
      this.deps.scene.remove(line);
      geo.dispose();
      (line.material as THREE.Material).dispose();
    }, 280);
  }

  private _spawnBeam(c: ActiveCast, impact: THREE.Vector3): void {
    const len = c.distance;
    const geo = new THREE.CylinderGeometry(0.12, 0.22, len, 8, 1, true);
    geo.translate(0, len / 2, 0);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: c.profile.color,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(geo, mat);
    beam.position.copy(c.origin);
    beam.lookAt(impact);
    this.deps.scene.add(beam);
    c.beam = beam;
  }

  private _spawnZoneRing(c: ActiveCast, center: THREE.Vector3, radius: number): void {
    const geo = new THREE.TorusGeometry(radius, 0.08, 6, 48);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: c.profile.color,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.position.copy(center);
    ring.position.y += 0.05;
    this.deps.scene.add(ring);
    c.zoneRing = ring;
    // Snap-out: start larger then settle (sandbox overshoot)
    ring.scale.setScalar(1.25);
  }

  private _disposeCast(c: ActiveCast): void {
    this.deps.scene.remove(c.front);
    c.front.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry?.dispose();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else (o.material as THREE.Material | undefined)?.dispose();
      }
    });
    if (c.beam) {
      this.deps.scene.remove(c.beam);
      c.beam.geometry.dispose();
      (c.beam.material as THREE.Material).dispose();
    }
    if (c.zoneRing) {
      this.deps.scene.remove(c.zoneRing);
      c.zoneRing.geometry.dispose();
      (c.zoneRing.material as THREE.Material).dispose();
    }
  }

  clear(): void {
    for (const c of this.active) this._disposeCast(c);
    this.active = [];
  }

  dispose(): void {
    this.clear();
  }
}
