import * as THREE from 'three';
import { AbilityDef, Projectile, ParticleEffect } from './types';
import { ABILITIES } from './constants';
import { ExplosionVFX } from './ExplosionVFX';
import { NoiseSphereVFX, NoiseSpherePreset } from './NoiseSphereVFX';
import { SpellFlare, FlareType } from './vfx/SpellFlare';
import { IceShardVFX } from './vfx/IceShardVFX';
import { FireBillboardVFX } from './vfx/FireBillboardVFX';
import type { CombatVfxBridge } from './CombatVfxBridge';

export class AbilitySystem {
  scene: THREE.Scene;
  camera: THREE.Camera;
  abilities: AbilityDef[];
  cooldowns: Record<string, number> = {};
  projectiles: Projectile[] = [];
  particles: ParticleEffect[] = [];
  explosions: ExplosionVFX;
  noiseSpheres: NoiseSphereVFX;
  spellFlare: SpellFlare;
  iceShards: IceShardVFX;
  fireBillboards: FireBillboardVFX;
  /** Maps fireball projectile mesh → its fire billboard mesh for cleanup. */
  private _fireballBillboards = new Map<THREE.Mesh, THREE.Mesh>();

  onAbilityUsed: ((id: string, remaining: number) => void) | null = null;
  /** Albion-style telegraph + spline spells — set by GameEngine after boot. */
  vfxBridge: CombatVfxBridge | null = null;

  constructor(scene: THREE.Scene, camera: THREE.Camera) {
    this.scene  = scene;
    this.camera = camera;
    this.abilities = ABILITIES.map(a => ({ ...a }));
    this.abilities.forEach(a => { this.cooldowns[a.id] = 0; });
    this.explosions = new ExplosionVFX(scene);
    this.noiseSpheres = new NoiseSphereVFX(scene);
    this.spellFlare = new SpellFlare(scene);
    this.iceShards = new IceShardVFX(scene);
    this.fireBillboards = new FireBillboardVFX(scene);
  }

  /**
   * Spawn a noise sphere at a world position.
   * Returns the mesh — callers can reposition it (e.g. attach to a projectile).
   */
  spawnNoiseSphere(
    pos: THREE.Vector3,
    preset: NoiseSpherePreset,
    radius = 1.0,
    lifetime = 1.5,
  ): THREE.Mesh {
    return this.noiseSpheres.spawn(pos, { preset, radius, lifetime });
  }

  /**
   * Immediately remove a noise sphere mesh from the scene and free its GPU
   * resources. Call when a projectile hits before its natural lifetime ends.
   */
  killNoiseSphere(mesh: THREE.Mesh): void {
    this.noiseSpheres.kill(mesh);
  }

  /** Spawn a brief flash at a world position — damage hits, impacts, etc. */
  flashNoiseSphere(pos: THREE.Vector3, preset: NoiseSpherePreset, radius = 0.8): void {
    this.noiseSpheres.flash(pos, preset, radius);
  }

  unlockAbility(abilityId: string) {
    const ability = this.abilities.find(a => a.id === abilityId);
    if (ability) ability.unlocked = true;
  }

  canUse(abilityId: string, mana: number): boolean {
    const ability = this.abilities.find(a => a.id === abilityId);
    if (!ability) return false;
    return ability.unlocked && this.cooldowns[abilityId] <= 0 && mana >= ability.manaCost;
  }

  use(
    abilityId: string,
    playerPos: THREE.Vector3,
    playerFwd: THREE.Vector3,
    currentMana: number,
    onDamage: (damage: number, isAoe: boolean) => void,
    onManaUse: (amount: number) => void,
    onBerserker: () => void
  ) {
    if (!this.canUse(abilityId, currentMana)) return;
    const ability = this.abilities.find(a => a.id === abilityId);
    if (!ability) return;

    onManaUse(ability.manaCost);
    this.cooldowns[abilityId] = ability.cooldown;
    this.onAbilityUsed?.(abilityId, ability.cooldown);

    // Lens flare on cast — colour keyed to ability type
    const flareMap: Record<string, FlareType> = {
      fireball: 'fire',
      lightning_strike: 'lightning',
      ice_spike: 'ice',
      berserker_rage: 'fire',
      whirlwind: 'arcane',
      shield_bash: 'default',
    };
    this.spellFlare.trigger(
      playerPos.clone().add(new THREE.Vector3(0, 1.4, 0)),
      flareMap[abilityId] ?? 'default',
    );

    switch (abilityId) {
      case 'whirlwind':
        this.doWhirlwind(playerPos, ability.damage, onDamage);
        break;
      case 'fireball':
        this.doFireball(playerPos, playerFwd, ability.damage, onDamage);
        break;
      case 'shield_bash':
        this.doShieldBash(playerPos, playerFwd, ability.damage, onDamage);
        break;
      case 'berserker_rage':
        onBerserker();
        this.doBerserkerEffect(playerPos);
        break;
      case 'lightning_strike':
        this.doLightningStrike(playerPos, playerFwd, ability.damage, onDamage);
        break;
      case 'ice_spike':
        this.doIceSpike(playerPos, playerFwd, ability.damage, onDamage);
        break;
    }
  }

  private doWhirlwind(pos: THREE.Vector3, damage: number, onDamage: (d: number, aoe: boolean) => void) {
    // AOE spin effect
    this.createSpinEffect(pos, 0x4fc3f7);
    onDamage(damage, true);
  }

  private doFireball(pos: THREE.Vector3, fwd: THREE.Vector3, damage: number, onDamage: (d: number, aoe: boolean) => void) {
    const spawnPos = pos.clone().add(new THREE.Vector3(0, 1.4, 0));
    const targetPos = pos.clone().add(fwd.clone().multiplyScalar(14)).add(new THREE.Vector3(0, 0.5, 0));

    if (this.vfxBridge) {
      this.vfxBridge.showCircleTelegraph(targetPos, 2.8, 0.55);
      this.vfxBridge.spawnSplineSpell(spawnPos, targetPos, {
        damage,
        speed: 22,
        color: this.vfxBridge.getMagicColor(),
      });
      setTimeout(() => onDamage(damage, true), 520);
      return;
    }

    // Shader fire sphere billboard — the projectile mesh IS the noise sphere
    const mesh = this.noiseSpheres.spawn(spawnPos, {
      preset:   'fire',
      radius:   0.55,
      lifetime: 4.0,
      fadeIn:   0.08,
    });

    // Environmental light cast by the fireball
    const light = new THREE.PointLight(0xff6622, 4, 10);
    mesh.add(light);

    this.scene.add(mesh);   // ensure in scene (spawn already adds it)

    const vel = fwd.clone().multiplyScalar(18).add(new THREE.Vector3(0, 1, 0));
    const projectile: Projectile = {
      mesh,
      velocity: vel,
      damage,
      lifetime: 3,
      owner: 'player',
    };
    this.projectiles.push(projectile);

    // FBM fire billboard attached to the fireball mesh
    const billboard = this.fireBillboards.attachTo(mesh, {
      colour: 'fire', width: 1.2, height: 1.6,
      offset: new THREE.Vector3(0, 0.4, 0),
    });
    this._fireballBillboards.set(mesh, billboard);

    // Trail — small fire flashes every 60 ms
    const interval = setInterval(() => {
      if (!this.scene.children.includes(mesh)) { clearInterval(interval); return; }
      this.noiseSpheres.flash(mesh.position.clone(), 'fire', 0.3);
    }, 60);
    setTimeout(() => clearInterval(interval), 3100);
  }

  private doShieldBash(pos: THREE.Vector3, fwd: THREE.Vector3, damage: number, onDamage: (d: number, aoe: boolean) => void) {
    const impactPos = pos.clone().add(fwd.clone().multiplyScalar(2)).add(new THREE.Vector3(0, 1, 0));
    this.createImpactEffect(impactPos, 0x69f0ae);
    // Noise sphere impact flash
    this.noiseSpheres.flash(impactPos, 'impact', 0.9);
    onDamage(damage, false);
  }

  private doBerserkerEffect(pos: THREE.Vector3) {
    this.createSpinEffect(pos, 0xef5350);
    // Large fire sphere burst around the player
    this.noiseSpheres.spawn(pos.clone().add(new THREE.Vector3(0, 1, 0)), {
      preset: 'damage', radius: 1.4, lifetime: 1.2, fadeIn: 0.06,
    });
    // Red flame particles rising up
    const particleCount = 50;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3]     = pos.x + (Math.random() - 0.5);
      positions[i * 3 + 1] = pos.y + Math.random() * 3;
      positions[i * 3 + 2] = pos.z + (Math.random() - 0.5);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xff2222, size: 0.15 });
    const points = new THREE.Points(geo, mat);
    this.scene.add(points);
    this.particles.push({ particles: points, lifetime: 1.5, maxLifetime: 1.5 });
  }

  private doIceSpike(pos: THREE.Vector3, fwd: THREE.Vector3, damage: number, onDamage: (d: number, aoe: boolean) => void) {
    const impactPos = pos.clone().add(fwd.clone().multiplyScalar(6));
    impactPos.y = Math.max(pos.y - 0.5, 0.0);
    if (this.vfxBridge) {
      this.vfxBridge.showCircleTelegraph(impactPos, 2.4, 0.45);
    }

    // Ice shard burst (8 spikes + Voronoi frost disc)
    this.iceShards.burst(impactPos, 2.6, 8, 2.0);

    // Noise-sphere ice flash at impact centre
    this.noiseSpheres.spawn(impactPos.clone().add(new THREE.Vector3(0, 0.8, 0)), {
      preset: 'ice', radius: 1.0, lifetime: 0.9, fadeIn: 0.05,
    });

    // Spawn a secondary flare at the impact site
    this.spellFlare.trigger(impactPos.clone().add(new THREE.Vector3(0, 1, 0)), 'ice', 0.3);

    this.createImpactEffect(impactPos, 0x66ccff);
    onDamage(damage, false);
  }

  private doLightningStrike(pos: THREE.Vector3, fwd: THREE.Vector3, damage: number, onDamage: (d: number, aoe: boolean) => void) {
    const strikePos = pos.clone().add(fwd.clone().multiplyScalar(8));
    if (this.vfxBridge) {
      this.vfxBridge.showCircleTelegraph(strikePos, 3.2, 0.4);
    }

    // Lightning bolt visual
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const y = 20 - i * 2.5;
      const jitter = i < 8 ? (Math.random() - 0.5) * 0.8 : 0;
      pts.push(new THREE.Vector3(strikePos.x + jitter, y, strikePos.z + jitter));
    }
    const geo  = new THREE.BufferGeometry().setFromPoints(pts);
    const lmat = new THREE.LineBasicMaterial({ color: 0xfff176, linewidth: 3 });
    const bolt = new THREE.Line(geo, lmat);
    this.scene.add(bolt);

    const light = new THREE.PointLight(0xfff176, 5, 20);
    light.position.copy(strikePos).setY(5);
    this.scene.add(light);

    // Lightning noise sphere at impact
    this.noiseSpheres.spawn(strikePos.clone().add(new THREE.Vector3(0, 0.5, 0)), {
      preset: 'lightning', radius: 1.1, lifetime: 0.8, fadeIn: 0.04,
    });
    this.createImpactEffect(strikePos, 0xfff176);
    onDamage(damage, false);

    setTimeout(() => {
      this.scene.remove(bolt);
      this.scene.remove(light);
    }, 300);
  }

  private createSpinEffect(pos: THREE.Vector3, color: number) {
    const particleCount = 60;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2;
      const r = 2 + Math.random() * 2;
      positions[i * 3] = pos.x + Math.cos(angle) * r;
      positions[i * 3 + 1] = pos.y + 1 + Math.random() * 2;
      positions[i * 3 + 2] = pos.z + Math.sin(angle) * r;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color, size: 0.18 });
    const points = new THREE.Points(geo, mat);
    this.scene.add(points);
    this.particles.push({ particles: points, lifetime: 0.8, maxLifetime: 0.8 });
  }

  private createImpactEffect(pos: THREE.Vector3, color: number) {
    const particleCount = 30;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * 2;
      positions[i * 3] = pos.x + Math.cos(angle) * r;
      positions[i * 3 + 1] = pos.y + Math.random() * 2;
      positions[i * 3 + 2] = pos.z + Math.sin(angle) * r;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color, size: 0.15 });
    const pts = new THREE.Points(geo, mat);
    this.scene.add(pts);
    this.particles.push({ particles: pts, lifetime: 0.6, maxLifetime: 0.6 });
  }

  private createTrail(mesh: THREE.Mesh, color: number) {
    // Animate trail following projectile
    const interval = setInterval(() => {
      if (!this.scene.children.includes(mesh)) {
        clearInterval(interval);
        return;
      }
      const geo = new THREE.SphereGeometry(0.1, 4, 4);
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6 });
      const trail = new THREE.Mesh(geo, mat);
      trail.position.copy(mesh.position);
      this.scene.add(trail);
      setTimeout(() => this.scene.remove(trail), 300);
    }, 50);

    setTimeout(() => clearInterval(interval), 3000);
  }

  update(dt: number) {
    // Update cooldowns
    for (const id in this.cooldowns) {
      if (this.cooldowns[id] > 0) this.cooldowns[id] -= dt;
    }

    // Update projectiles
    this.projectiles = this.projectiles.filter(proj => {
      proj.mesh.position.add(proj.velocity.clone().multiplyScalar(dt));
      proj.lifetime -= dt;

      // Gravity for arcing projectiles
      proj.velocity.y -= 2 * dt;

      if (proj.lifetime <= 0 || proj.mesh.position.y < 0) {
        // Detonate fireball-style projectiles on expiry/ground impact
        this.explosions.burst({
          position: proj.mesh.position.clone(),
          radius: 3.2,
          color: 0xff6a22,
          particles: 80,
          lifetime: 1.4,
        });
        // Detach fire billboard if one was attached to this projectile
        const fb = this._fireballBillboards.get(proj.mesh);
        if (fb) { this.fireBillboards.detach(fb); this._fireballBillboards.delete(proj.mesh); }
        // Burst fire at impact
        this.fireBillboards.burstAt(proj.mesh.position.clone(), { colour: 'fire', width: 2.0, height: 2.5, lifetime: 0.9 });
        // If the projectile mesh was a noise sphere, kill it cleanly
        this.noiseSpheres.kill(proj.mesh);
        this.scene.remove(proj.mesh);
        return false;
      }
      return true;
    });

    this.explosions.update(dt);
    this.noiseSpheres.update(dt, this.camera);
    this.iceShards.update(dt);
    this.fireBillboards.update(dt, this.camera);
    this.spellFlare.update(dt, this.camera);

    // Update particles
    this.particles = this.particles.filter(p => {
      p.lifetime -= dt;
      const alpha = p.lifetime / p.maxLifetime;
      (p.particles.material as THREE.PointsMaterial).opacity = alpha;
      (p.particles.material as THREE.PointsMaterial).transparent = true;

      if (p.lifetime <= 0) {
        this.scene.remove(p.particles);
        return false;
      }
      return true;
    });
  }

  checkProjectileHits(
    enemyPositions: THREE.Vector3[],
    onHit: (index: number, damage: number) => void
  ) {
    this.projectiles.forEach((proj, pi) => {
      for (let i = 0; i < enemyPositions.length; i++) {
        const dist = proj.mesh.position.distanceTo(enemyPositions[i]);
        if (dist < 1.5 && proj.owner === 'player') {
          onHit(i, proj.damage);
          this.explosions.burst({
            position: proj.mesh.position.clone(),
            radius: 3.5,
            color: 0xff7a22,
            particles: 100,
            lifetime: 1.4,
          });
          // Detach fire billboard if one was attached
          const fb = this._fireballBillboards.get(proj.mesh);
          if (fb) { this.fireBillboards.detach(fb); this._fireballBillboards.delete(proj.mesh); }
          this.fireBillboards.burstAt(proj.mesh.position.clone(), { colour: 'fire', width: 2.0, height: 2.5, lifetime: 0.9 });
          // Kill any noise-sphere that IS this projectile's mesh
          this.noiseSpheres.kill(proj.mesh);
          this.scene.remove(proj.mesh);
          this.projectiles.splice(pi, 1);
          break;
        }
      }
    });
  }

  getCooldown(id: string): number {
    return this.cooldowns[id] || 0;
  }

  dispose() {
    for (const proj of this.projectiles) {
      this.noiseSpheres.kill(proj.mesh);
      this.scene.remove(proj.mesh);
    }
    for (const p of this.particles) this.scene.remove(p.particles);
    this.explosions.dispose();
    this.noiseSpheres.dispose();
    this.spellFlare.dispose();
    this.iceShards.dispose();
    this.fireBillboards.dispose();
    this._fireballBillboards.clear();
  }
}
