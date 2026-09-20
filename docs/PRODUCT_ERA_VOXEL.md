# Grudges product era — Voxel (hard decision)

**Date locked:** 2026-08-10 (session)

## Decision

**Grudges is voxel-era only.** It is the **lead and main game** for the voxel era.

| Was (deprecated framing) | Now |
|--------------------------|-----|
| Grudges = “Nexus era” surface ARPG separate from voxel | **Grudges = voxel-era survival MMO** |
| `era=nexus` for Grudges characters | **`era=voxel`** for Grudges play roster |
| Voxel = only Mine-Loader / GRUDOX | Voxel stack: **Grudges (main play)** + Mine-Loader (worlds/codex) + GRUDOX (launcher/cabinets) |

**Nexus (product brand / separate era)** — decide later. Do **not** ship Grudges as `era=nexus` without a new product decision.

## What “Nexus” still means (do not purge)

| Term | Keep? | Meaning |
|------|-------|---------|
| **Nexus attributes** BIO…GRA | **Yes** | Stat system name inside Grudges (`@workspace/game-systems`) |
| **Nexus API** shared endpoints | **Yes** | Fleet character/catalog APIs used by Grudges |
| **era=nexus** character roster | **No for Grudges** | Reserved / TBD later — not Grudges default |

## Fleet roles (voxel era)

| Surface | Role |
|---------|------|
| **grudges.grudge-studio.com** | Marketing + systems docs + **play client** (`/arpg-game/`) |
| **Mine-Loader** | Worlds, codex, prefabs, harvest — supports voxel play |
| **GRUDOX** | Launcher / cabinets — entry to voxel products |
| **Foundry create** | Create with `era=voxel` for Grudges heroes |

## Agent rules

1. New Grudges characters → **`era=voxel`** (not nexus, not warlords).
2. Do not invent a second “Grudges nexus” product path.
3. Keep BIO…GRA (“Nexus stats”) as the attribute SSOT.
4. Voxel avatars, Owl Form / land mounts, camp/township = Grudges main loop.

## Related

- `docs/AI_WORKER_DEPLOY_GRUDGES.md`
- Mine-Loader `docs/CHARACTER_ERAS.md` (update when wiring create/play handoff)
- Website systems catalog `aiWorker.deploy.eras`
