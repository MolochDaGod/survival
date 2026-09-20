# Weapon skills — Mixamo pack + Monkey King + bounce physics

**Date:** 2026-07-28  
**Live ARPG:** https://deploy-survival.vercel.app/arpg-game/

## Intent

1. **Consider** the staged Mixamo FBX combat pack (user Documents).
2. **Weapon skills** use **Monkey King** retargeted clips for staff / 2H.
3. **Intuitive MM** (Mixamo locomotion + knock feel) and **bounce physics** shared across all weapons and skills.

## Staged FBX (source)

| File | Skill / anim key | Role |
|------|------------------|------|
| `Pull Heavy Object.fbx` | `pull_heavy` | 2H drag / yank skill |
| `Cross Jumps Rotation.fbx` | `cross_jumps_rotation` | Aerial skill / unarmed leap |
| `fromstomachStand Up.fbx` | `getup_from_stomach` | Knockdown recovery |
| `Pistol Whip.fbx` | `pistol_whip` | Sidearm melee |
| `hitbyStumbling.fbx` | `hit_stumble` | Hit reaction |
| `Block With Rifle.fbx` | `rifle_block` | Rifle stock block |
| `shieldthrow.fbx` | `shield_throw` | Shield throw (multi-bounce) |
| `mainhandThrow.fbx` | `mainhand_throw` | Weapon / javelin throw |
| `stabspear.fbx` | `spear_stab` | Spear primary |
| `spearThrust Slash.fbx` | `spear_thrust_slash` | Spear skill |

**Paths:**

- Bake stage: `Character-Animator-two/.../public/anims/uploads_2026_07/combat/*.fbx`
- Survival: `artifacts/arpg-game/public/assets/survival/anims/incoming/*.fbx`

**Bake next:** from character-viewer  
`node tools/bake-anims.mjs uploads_2026_07` → then set `baked:` on `ANIM_LIBRARY` keys → `extract-anim-manifest` → `pnpm run validate`.

## Monkey King (staff / 2H skills)

Baked SSOT: `anims/baked/monkey_staff/**` (Bip001 rotation-only).

| Skill | Anim key | Clip |
|-------|----------|------|
| Staff LMB A/B/C | `monkey_staff_attack_a/b/c` | combat/attack-a…c |
| Skill 1 / Nova | `monkey_staff_skill_1` | combat/skill-1 |
| Skill 3 / Lance | `monkey_staff_skill_3` | combat/skill-3 |
| Spin clear | `monkey_staff_spin` | combat/spin |
| Axe / hammer lights | `monkey_staff_attack_a` | same set |

Catalog: `lib/game-content/src/weaponSkills.ts` + `animations.ts` `WEAPON_ATTACK_ANIM`.

## Bounce physics (all weapons)

| Family | maxBounces | knockImpulse | Used by |
|--------|------------|--------------|---------|
| melee_1h | 0 | 9 | sword, dagger, pistol whip |
| melee_2h | 0 | 12 | axe, hammer, pull heavy |
| spear | 1 | 10 | stab, thrust, javelin |
| staff | 0 | 11 | Monkey skills |
| shield | 3 | 14 | bash, throw |
| throwable | 3 | 10 | mainhand throw |
| bullet | 1 | 4 | rifles (ricochet optional) |
| magic | 2 | 9 | fireball / bolts |
| arrow | 0 | 6 | bows |

**Code:**

- Character-Animator: `lib/game-content/src/bouncePhysics.ts`
- Survival: `src/game/combat/bouncePhysics.ts` + `ProjectileSystem` (`weaponType` / `bounceProfile`)
- Pipeline: `weaponSkillsContract.js` `SKILL_BOUNCE` + skill scripts

Spawn example:

```ts
proj.spawn({
  …,
  weaponType: 'throwable', // or 'shield' / 'spear'
  bounce: true,
  trajectory: 'ballistic',
});
```

## Intuitive MM

- Motion profiles already prefer **Mixamo (MM) forward loco** (`motionProfile.ts`).
- Shield smash / skill knock use high **MM impulse** (`animDefaults` SHIELD_SMASH_KNOCK).
- Skills that throw or slam inherit the shared bounce/knock tables so feel is consistent.

## Next steps

1. Bake `uploads_2026_07` → Bip001 JSON; fill `baked:` paths.
2. Wire `ProjectileSystem` spawns for shield throw / javelin from GameEngine skill hotkeys.
3. Optionally register Monkey staff GLB on survival `AssetManager` for non-UAL heroes.
