# Game Systems — Modes, Cinema, AFK, Engagement

**Era:** Survival / GRUDGES only  
**Hosts:** survival.grudge-studio.com · grudges.grudge-studio.com

## Architecture

| System | Path | Role |
|--------|------|------|
| **GameModeController** | `src/game/mode/GameModeController.ts` | Single authority for free / combat / harvest / build / cinema / afk / ui |
| **CinemaDirector** | `src/game/cinema/CinemaDirector.ts` | Camera rails + MediaRecorder WebM |
| **AfkController** | `src/game/ai/AfkController.ts` | defend / harvest / camp / patrol scripts |
| **EngagementRewards** | `src/game/progression/EngagementRewards.ts` | Session milestones, streaks, mode mastery |
| **Wire-up** | `GameEngine.wireGameModesAndSystems` | Focus RMB, hotkeys, gates |

## Play modes

| Mode | LMB | RMB | Dodge | Harvest | Combat |
|------|-----|-----|-------|---------|--------|
| **Free** | Attack | ADS focus | ✓ | ✓ | ✓ |
| **Combat** | Attack | ADS (ranged) / **Block** (melee) | ✓ | ✗ | ✓ |
| **Harvest** | Swing tools | ADS focus | ✓ | ✓ | ✓ (defend) |
| **Build** | Place (capture) | Cancel blueprint | ✗ | ✗ | ✗ |
| **Cinema** | frozen | frozen | ✗ | ✗ | ✗ |
| **AFK** | scripted | frozen | ✗ | script | script |
| **UI** | frozen | frozen | ✗ | ✗ | ✗ |

Cycle play modes with **M** (while pointer-locked).

## Focus RMB

`GameModeController.resolveFocusRmb(weaponIsRanged)`:

- Combat + ranged → ADS  
- Combat + melee → Block  
- Harvest / free → ADS  
- Build → clear blueprint  

**B** always starts/stops block independently.

## Dodge / climb / swim (existing + polish)

| Action | System | Notes |
|--------|--------|--------|
| Dodge | `PlayerController.startRoll` | **i-frames** while `isRolling` |
| Wall climb | `ClimbController` | BVH edge-aware vertical |
| Ledge mantle | `LedgeClimbController` + Rapier `LedgeProbe` | 1 m edge climb |
| Swim | `SwimController` + water surface | loco swim blend |
| Scale (height) | Asset import + PlayerController fit | 1.8 m target |

## Cinema & record

| Hotkey | Action |
|--------|--------|
| **F10** | Orbit cinema around player |
| **Esc** | Exit cinema |
| **F11** | Toggle WebM recording of canvas |

API: `engine.playCinemaOrbit()`, `playCinemaArrival()`, `exitCinema()`, `cinema.toggleRecording()`.

## AFK scripts

| Hotkey | Action |
|--------|--------|
| **F9** | Toggle AFK defend |

API: `engine.setAfkScript('defend'|'harvest'|'camp'|'patrol')`.

AFK awards small Survival/Township XP per minute (does not outpace active play).

## Engagement rewards

- Session milestones: 2 / 5 / 10 / 20 / 30 min  
- Kill streak every 5  
- Harvest streak every 8  
- Mode mastery every 3 min in combat/harvest/build  
- First claim / first recruit bonuses  

Toasts surface via `engine.onEngagementToast`.

## Panels

| Panel | Hotkey | Mode side-effect |
|-------|--------|------------------|
| Survival inv | I | `enterUiMode` |
| Build menu | B | UI + set play mode **build** |
| Main panel | C | Camp / equipment / professions / quests |
| Equipment | MainPanel tab + EquipmentPanel | Inventory mainhand → hand bones |

## Rapier / bullets / VFX (unchanged spine)

- Player capsule + map trimeshes: `PhysicsWorld`, `MapColliders`  
- Projectiles: `ProjectileSystem` + muzzle/impact VFX  
- Melee: slash VFX + harvest chip on same hit window  

## Hotkeys summary

```
M     cycle Free → Combat → Harvest → Build
F9    AFK defend on/off
F10   cinema orbit
F11   record WebM
Esc   exit cinema (when active)
B     block
Shift dodge (i-frames)
RMB   mode-aware focus
LMB   attack / harvest / build place
```
