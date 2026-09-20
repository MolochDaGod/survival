# Combat power SSOT — not “crafting for allies”

## What is **not** the product filter

| Misread | Reality |
|---------|---------|
| “Crafting filter for allies” | **Does not exist.** `/crafting` filters recipes by **station** (forge, workbench, campfire, …) so UI only shows crafts you can do at that bench. |
| Settlement table “allies: 1–4” | **Camp population / recruit count**, not a craft job filter. |
| Ally roles | **Four families:** harvester · vendor · **fighter** · diplomacy — fighters are combat companions, not crafters. |

**Crafting** = camp economy (stations, recipes, gear tiers, enchant oil).  
**Combat power** = how you (and fighter allies) win fights.

---

## Production combat pillars (must ship as real systems)

| Pillar | What “real & powerful” means | Current SSOT |
|--------|------------------------------|--------------|
| **Weapons** | Weapon types, combos, packs, hand sockets, residual slash | `WEAPONS`, `AnimationRegistry` combos, `WeaponAttachment`, `SlashWaveField` |
| **Upgrades** | Attribute milestones + track perks + gear tiers | `CharacterConfig` milestones, `StatPerkChoices`, craft gear T1–T8 |
| **Mobility** | Dodge/roll, slide, sprint, climb, swim, focus strafe | `PlayerController` roll/slide, `ClimbController`, `SwimController`, focus mode |
| **Effects / VFX** | Projectiles, impact, residual, telegraph, **linear skillshots** | `AbilitySystem`, `LinearCastRuntime`, `CombatVfxBridge`, pinata debris, NoiseSphere, SpellFlare, ice/fire |
| **Destruction** | Pinata chunks + breakable walls on ability/melee hits | `PinataDebrisField`, `BreakableWallSystem` (not ConvexObjectBreaker) |
| **Procs** | On-hit / on-crit / gadget crit from trees | Profession passives (`gadgetCrit*`, damage bonuses); expand via game-systems bags |
| **Defensives** | Block/parry, i-frames on roll, armor passives, HP/stamina | Block clips, `isBlocking`/`isParrying`, ENT/BIO milestones, armor recipes |
| **Allies (fighters)** | Mercenary / captain / sentry / gunner — **combat** AI, not craft | `TownshipSystem` `family: 'fighter'`, `CitySpawner.assignRole` follow/guard modes |

---

## Ally families (explicit)

| Family | Role ids | Job |
|--------|----------|-----|
| **Fighter** | sentry, gate_guard, gunner, captain, **mercenary** | Defend / party combat |
| Harvester | woodcutter, miner, farmer, forager, trapper | Gather (not craft filter) |
| Vendor | stall, caravan, fence, bazaar | Economy |
| Diplomacy | diplomat | Rep |

Mercenary uses **follower slots** and close-combat follow — not crafting.

---

## Player combat loop (production)

1. **Focus** (RMB toggle) — look / strafe; harvest RMB only on resource nodes.  
2. **LMB** attack — weapon combo + residual finisher slash waves.  
3. **Block / parry** — weapon-type block clips.  
4. **Mobility** — roll, slide, climb, swim.  
5. **Abilities** — `AbilitySystem` + mana/CD; keys **6–0** linear skillshots (see `docs/VOXEL_LINEAR_CAST_SSOT.md`).  
6. **Perks** — BIO…GRA milestones + hero/warrior/smarts/maker tracks.  
7. **Profession combat** — `combat` tree + craft-master **weapon damage** passives when earned.

Crafting feeds **weapons/armor** into that loop; it is not the ally filter.

---

## Gaps (honest, next work — extend SSOT only)

| Gap | Direction |
|-----|-----------|
| Ally weapon equip + attack AI | Wire fighter roles to player weapon packs / simple attack on threat |
| Explicit proc table | game-systems `onHit` / `onCrit` bag read by GameEngine |
| T0 weapon skill bar 1–4 | Fleet WEAPON_SKILLS → hotbar (Casting lab parity) |
| Public **Combat** page | Catalog `combatPower` → `/combat` like `/crafting` |
| Full GLSL LinearAbility editor | Stay in sandbox repo; production = profiles + pooled VFX |

---

## Related

- Linear casts: `docs/VOXEL_LINEAR_CAST_SSOT.md` · https://github.com/MolochDaGod/LinearAbiltyCastingThreeJS  
- Camp / hires: `info.html#camp`, `TownshipSystem.ts`  
- Craft economy: `Recipes.ts`, `/crafting`  
- Perks: `/perks`, `CharacterConfig`  
- Mobility / focus: `PlayerController`, `docs/PRODUCTION_SSOT.md`
