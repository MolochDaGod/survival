# GRUDGES Survival Remake

**Live:** https://grudges.grudge-studio.com/arpg-game/  
**Package:** `artifacts/arpg-game`  
**Scale:** 1 unit = 1 metre · world ±10 km · player 1.8 m

## What “remake” means

A cohesive third-person **survival shooter ARPG** on a real hybrid world — not a separate prototype. All systems share one boot path.

### World (real map + terrain)

| Layer | Source |
|-------|--------|
| Starting city | `StarterMap` → `locations/encampment.glb` + BVH/Rapier colliders |
| Middle camp | `MiddleCampBootstrap` claim pad + benches |
| 9 sectors | Chicken-gun / town3f terrain patches (`SectorWorldBootstrap`) |
| Open world | Procedural 20 km heightfield stream past 250 m |
| Islands / docks | Island dock + deploy gate bootstrap |

### Characters

- Default body: **toon-brick** (Hollow Lords infantry) + 12 toon operators
- Hub NPCs: Ledger, Rivet, Ashcoil, Bastion, Brick (CDN toons)
- Mixamo retarget packs: pistol / rifle / adventure / swim
- Weapons on hand bones (`WeaponAttachment` + `HandToolCatalog`)

### TPS best practices

- Default camera: **third-person** (not ARPG)
- Over-the-shoulder offset + occlusion ray
- ADS: shoulder widen, dolly-in, FOV 58→42
- Shoulder swap: **T**
- Recoil kick on hip/ADS fire
- Dodge roll with **i-frames**
- Mode-aware **RMB** focus (ADS / block)

### Game modes

`M` cycles Free → Combat → Harvest → Build  
`F9` AFK · `F10` cinema · `F11` record

### Camp / allies / AI

| System | Behavior |
|--------|----------|
| CampClaim | Flag, guardian, benches, building buffs |
| Township | Recruit cap, roles, tiers |
| CitySpawner | Ambient + recruit (F) |
| **AllyCombatSystem** | Followers engage hostiles; harvesters flee |
| EnemyCamp | Sector AI camps grow / raid |
| AfkController | defend / harvest / camp / patrol scripts |

### Building & deployment

- Modular build kit (B) + profession benches
- Deploy gate boat + sector roads (Pilgrim, Scrap, Descent, Rail, Tidal)
- Sector deployment fog/VFX beats

### Lore loop (info.html)

Survive alone → claim flag → recruit → build walls → grow Camp→Tribe→Village→Town → defend raids → pledge faction.

## Boot sequence

1. Physics + SceneBuilder hybrid world  
2. Player (toon + weapons)  
3. `wireGameModesAndSystems`  
4. Early `runSurvivalRemakeBootstrap` (TPS tuning)  
5. Camp claim + middle pad + NPCs  
6. `startGameplay` → arrival cinema + sector lore toast  

## Key files

```
src/game/remake/SurvivalRemakeConfig.ts
src/game/remake/SurvivalRemakeBootstrap.ts
src/game/ai/AllyCombatSystem.ts
src/game/mode/GameModeController.ts
src/game/cinema/CinemaDirector.ts
src/game/SceneBuilder.ts
src/game/ThirdPersonCamera.ts
```

## Deploy

```bash
cd repos/survival
pnpm --filter @workspace/arpg-game build
# ship dist to grudges.grudge-studio.com/arpg-game/
```
