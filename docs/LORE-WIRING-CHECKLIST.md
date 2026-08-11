# Lore → Runtime Wiring Checklist

Sources: [lore.html](https://grudges.grudge-studio.com/lore.html), [info.html](https://grudges.grudge-studio.com/info.html), remake intro cinema.

| Statement | Status | Code |
|-----------|--------|------|
| TPS ARPG + optional FPS aim | **Wired** | PlayerController, SurvivalRemakeBootstrap |
| Survive alone first | **Wired** | LoreGameLoop stage `alone` |
| Claim flag 80m | **Wired** | CampClaimSystem |
| Unarmed race guardian | **Wired** | CampClaimSystem.spawnUnarmedGuardian |
| Recruit (dialog + infra) | **Wired** | RecruitRequirements + CitySpawner |
| Flag + fire + crate + tent | **Wired** | evaluateRecruitGate |
| Settlement Camp→Tribe→Village→Town | **Wired** | TownshipSystem + SettlementBuffs |
| Tribe cooking pot regen | **Wired** | SettlementBuffs.campRegenPerSec |
| Tribe +10% hire damage | **Wired** | hireDamageMult + AllyCombatSystem |
| Village trade gold | **Wired** | tradeGoldPerTick / caravan production |
| Town banner rep bonus | **Partial** | bannerRepBonus field (apply on diplomat) |
| Hire roster 15 roles | **Wired** | TownshipSystem.NPC_ROLES + production |
| Harvesters produce / flee combat | **Wired** | CampProductionTick + AllyCombat |
| Fighters engage hostiles | **Wired** | AllyCombatSystem |
| Five factions + matrix | **Wired** | factions.ts + ReputationService.pledge |
| Rep ladder 8 tiers | **Wired** | ReputationService + REP_TIERS |
| Pledge / renounce | **Wired** | pledgeFaction / renounceFaction |
| Network does not raid | **Wired** | FactionAiDirector |
| Faction AI pressure events | **Wired** | FactionAiDirector world events |
| Raids at tribe+ | **Wired** | SurvivorSpawner |
| Smooth Talker heal | **Wired** | SettlementBuffs + LoreGameLoop |
| Sector roads / quests | **Wired** | EncampmentIntro + sectorCanon |
| Faction pledge quests | **Wired** | createFactionPledgeQuests |
| Toon operators cast | **Wired** | ToonSurvivalRoster + hub NPCs |
| Hybrid 20km map | **Wired** | SceneBuilder + sectors |
| Tools on hand bones | **Wired** | WeaponAttachment + HandToolCatalog |
| Modes combat/harvest/build | **Wired** | GameModeController |
| Cinema intro | **Wired** | CinemaDirector.playArrival |
| Engagement rewards | **Wired** | EngagementRewards |

## Player APIs (console / UI)

```js
engine.pledgeFaction('keepers' | 'tech_scavengers' | 'hollow_lords' | 'network' | 'forgotten')
engine.renounceFaction()
engine.getReputationSnapshot()
engine.getLoreStage()
engine.getRecruitGateMessage()
```

## Still design-complete / deeper work

- Full Guild charter + Meeting Hall building (Diplomacy 2) UI
- Per-NPC Nexus sheets (BIO/NEU/…) mirrored on hires
- Faction champion hire at Hero tier
- Auto-turret fire system (gunner role buffs only)
- Bazaar rotating vendors UI
- Compendium codex + intro title cards — **wired** (`LoreCodex`, cinema HUD)
- Full CDN video file stream — pending (attach `.webm` when available; title cards cover intro beats)
