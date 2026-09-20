# Voxel-era linear casts + pinata destruction

**Product:** Grudges (`era=voxel`) · **Client:** `artifacts/arpg-game`  
**Upstream lab:** [LinearAbiltyCastingThreeJS](https://github.com/MolochDaGod/LinearAbiltyCastingThreeJS)  
**Not a fork:** production uses profiles + pooled Three.js VFX inside existing `AbilitySystem`. Full GLSL editor stays in the sandbox repo.

---

## Ability map

| Key | Id | Shape | Element | Sandbox |
|-----|-----|-------|---------|---------|
| **6** | `frost_lance` | line | ice | Q Frost Lance |
| **7** | `storm_lance` | line | lightning | E Storm Lance |
| **8** | `cinder_fall` | arc | fire | R Cinder Fall |
| **9** | `nova_beam` | line + hold | arcane | F Nova Beam |
| **0** | `voltaic_snare` | zone | voltaic | V Voltaic Snare |

Classic abilities remain **1–5** (whirlwind … lightning).

**Variants:** press **[** / **]** after casting a linear ability to cycle that family’s variants (console logs active variant). Catalog: `linearAbilityCatalog.ts`.

---

## Variants (all families)

| Ability | Variants |
|---------|----------|
| Frost Lance | fracture · glacier · needle · rime |
| Storm Lance | bolt · chain · overcharge · static |
| Cinder Fall | meteor · cluster · slag · ember_rain |
| Nova Beam | column · pierce · flare · pulse |
| Voltaic Snare | snare · root · cage · pulse_ring |

---

## Runtime modules (extend SSOT only)

| Module | Role |
|--------|------|
| `abilities/linearAbilityCatalog.ts` | Profiles, ranges, variants, AbilityDef export |
| `abilities/LinearCastRuntime.ts` | TRAVEL → IMPACT → HOLD → FADE fronts |
| `vfx/PinataDebrisField.ts` | Valheim-style debris pool + gravity |
| `world/BreakableWallSystem.ts` | Tagged wall break (existing) |
| `AbilitySystem` | Merges linear defs, CD/mana, pinata, update |
| `GameEngine.handleAbilityKey` | Digit6–0 + wall hit on impact |

**Physics:** player/world remain **one Rapier world** (`PhysicsWorld`). Debris uses simple gravity + `groundY` (same as wall fragments) — **not** a second physics engine, **not** ConvexObjectBreaker.

---

## Pinata / destruction

| Source | Behaviour |
|--------|-----------|
| Cinder Fall impact | Ember pinata burst + optional cluster secondary |
| Frost Lance | Ice chunks along line + impact shatter |
| Storm / snare | Scrap chips + scorched feel |
| Any linear AoE hit | Extra pinata + `BreakableWallSystem.checkHit` |

---

## Agent rules

1. Do **not** vendor the whole LinearAbility GLSL sandbox into survival.  
2. New skillshot = new profile row + runtime case if needed.  
3. Destructibles = pinata pool + existing breakable walls.  
4. SI metres; human ~1.8 m yardstick.  
5. One `AbilitySystem` / one mixer on the hero — VFX is not a second combat controller.

---

## Related

- `docs/COMBAT_POWER_SSOT.md`  
- `docs/PRODUCT_ERA_VOXEL.md`  
- Casting Warlords lab (Toon residual) — separate brand stack  
- Skill: `threejs-helpers-physics-terrain` (pinata vs breaker)
