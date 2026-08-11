# Survival Camp Claim System (GRUDGES / Nexus)

**Era:** `survival` only  
**Hosts:** survival.grudge-studio.com · grudges.grudge-studio.com  
**Code:** `artifacts/arpg-game/src/game/survival/camp/CampClaimSystem.ts`

## Not Warlords

| | Survival (this system) | Warlords |
|--|------------------------|----------|
| Claim | Claim Flag / Faction Banner → 80m camp | Home island / home-block |
| Race spawn | Unarmed variant of **player body / toon race** at flag | Race kits on island spawn |
| Benches | Profession XP + craft tiers at camp | Crafting suite / WCS |
| Buildings | AI ability mult + harvest profession rate | Bench / building multipacks on CDN |
| Package path | `src/game/survival/camp/*` | `grudge-builder` fleet / island3d |

**Do not import** `CampClaimSystem` into `grudge-builder` or any Warlords-era package.

## Claim Flag

Recipes: `craft_claim_flag` (item `claim_flag`) and legacy `build_flag` (`orc_flag`).

When placed via modular / structure placement:

1. Camp center set (80m radius).
2. **Unarmed guardian** spawns — same `bodyProportion` as the player (toon Brick/Vex/… or Quaternius body). Weapon meshes hidden; Idle locomotion only.
3. Raid / hire design docs treat flag as camp authority (`docs/inventory/README.md`).

## Benches

Placing a **workbench**, campfire, cauldron, etc. inside the claim:

| Bench family | Profession | Craft tier | XP / craft (base) |
|--------------|------------|------------|-------------------|
| workbench / forge / anvil | crafting | 3 | 12 |
| campfire / cauldron / cooking | chemistry | 3 | 10 |
| drying rack | survival | 2 | 8 |
| storage barrel | gathering | 2 | 8 |

Crafting in claim radius awards bonus profession XP via `GameEngine.onCampCraftComplete` (wired from GameCanvas craft complete).

## Buildings

Walls, foundations, storage, drums, tents, etc. stack:

- **Harvest rate** → multiplies camp production ticks (`SurvivorSpawner` → `computeProduction(..., campHarvestMult)`)
- **AI ability** → `getAiAbilityMultiplier()` for hirelings / followers (consumers can read `getCampBuffs()`)

Caps: harvest ≤ 2.5×, AI ≤ 2.0×.

## Runtime API

```ts
engine.campClaim?.onStructurePlaced(itemId, position, group);
engine.getCampBuffs(); // HUD
engine.onCampCraftComplete('crafting');
engine.restoreCampClaim(save.campClaim);
// save includes campClaim snapshot (era: 'survival')
```

## Flow

```
Craft claim flag → Place → CampClaimSystem.claimAt
  → spawn unarmed race guardian
  → enable bench registration + building buffs
Place workbench in 80m → profession crafting boost
Place walls/storage → harvest + AI mult for camp NPCs
```
