# Asset Library Inventory

*Generated: 2026-05-29 — staged library at `attached_assets/_extracted/` (gitignored).*

48 bundles extracted from `attached_assets/` ZIPs, totaling **8,644 files / 3,753 usable 3D files / 2.4 GB**.
Re-run `node scripts/inventory-extracted.mjs` to refresh.

## Staging Convention

Bundles live in `attached_assets/_extracted/<bundle>/` (gitignored, permanent staging library).
Only files referenced by a prefab or asset registry are mirrored to `artifacts/arpg-game/public/models/`.
Use `node scripts/triage-attached-assets.mjs --extract` if the staging dir is wiped.

## Already Staged → `public/`

| Bundle | Public path | Files | Size | Use |
|---|---|---|---|---|
| Animated_Mech_Pack | `models/mechs/animated_pack/` | 4 glTF | 16 MB | 4 rigged mechs (George, Leela, Mike, Stan) with 18–20 clips each |
| Pistol_Handgun_Locomotion_Pack | `models/animations/pistol_locomotion/` | 20 FBX | 4.6 MB | Player pistol-stance locomotion |
| Locomotion_Pack | `models/animations/locomotion/` | 12 FBX | 3.3 MB | Generic humanoid idle/walk/run/strafe/turn/jump |
| MuzzleFlashVFX (PNGs) | `effects/muzzle/` | 17 PNG | 1.7 MB | Sprite-sheet muzzle flashes |
| animations/ (Mixamo combat) | `models/animations/mixamo_combat/` | 18 FBX + 18 GLB | 11.5 MB | Retargetable combat clips (attack, idle, run, walk, sword_combo) |
| HumanCraftingAnimationsFREE | `models/animations/crafting/` (pre-existing) | 74 FBX | 49 MB | Profession animations: Farming, Fishing, Gathering, Hammering, Mining |

## High-Value Unstaged (pull on demand)

| Bundle | Useful files | Size | Likely use |
|---|---|---|---|
| **KayKit_Dungeon_Pack_1.0** | 192 GLB + 208 FBX + 226 OBJ + 202 DAE | 82 MB | Full dungeon kit (rooms, walls, doors, props) |
| **Medieval_Village_MegaKit** | 176 FBX + 176 glTF + 176 OBJ | 166 MB | Settlement buildings, fences, market stalls |
| **Fantasy_Props_MegaKit** | 94 FBX + 94 glTF + 94 OBJ | 155 MB | Tavern, alchemy, library, shrine props |
| **Sci-Fi_Essentials_Kit** | 74 FBX + 37 glTF + 37 OBJ | 175 MB | Cyberpunk / Spire / mech faction environments |
| **Ultimate_Nature_Pack_by_Quaternius** | 150 FBX + 150 OBJ | 95 MB | Trees, rocks, foliage (overlaps with existing `models/nature/`) |
| **battle_monsters** | 187 FBX | 200 MB | Animated monster mesh library |
| **Ultimate_Modular_Men-_Feb_2022** | 72 FBX + 11 glTF | 264 MB | Modular male character system |
| **Ultimate_Modular_Women_-_April_2022** | 66 FBX + 10 glTF | 222 MB | Modular female character system |
| **Universal_Base_Characters** | 26 FBX + 18 glTF | 126 MB | Generic NPC base meshes |
| **Universal_Animation_Library** + `_2` | 3 GLB + 3 FBX | 70 MB | Mixamo-style retargetable animation library |
| **Ultimate_Gun_Pack_by_Quaternius** | 55 FBX + 55 OBJ | 34 MB | Stylized weapon prop pack |
| **Wp-Pack-2** | 88 FBX | 21 MB | Weapon variants |
| **Max'Wp-Pack** | 59 FBX | 21 MB | Weapon variants |
| **Medieval_Weapons_Pack_by_Quaternius** | 24 FBX + 24 OBJ | 24 MB | Stylized medieval weapons |
| **Updated_Modular_Dungeon_-_May_2019** | 48 FBX + 48 OBJ | 33 MB | Dungeon tileset (older Quaternius) |
| **Male_Injured_Pack** | 20 FBX | 6 MB | Wounded animations (idle, limp, stagger, death) |
| **resources** | 152 FBX + 76 glTF | 17 MB | Harvestable resource node meshes |
| **tools** | 98 FBX + 49 glTF + 59 OBJ | 7 MB | Player tools (pickaxe, axe, hammer, etc.) |
| **Farm_Animals_Animated_by_Quaternius** | 7 FBX + 7 OBJ | 15 MB | Cow, horse, llama, pig, etc. (overlaps existing) |
| **Fish_Pack_Animated_by_Quaternius** | 7 FBX + 7 OBJ | 5 MB | Fish for fishing profession |
| **craftpix-net-700077-free-medieval-3d-people-low-poly-models** | 28 FBX | 7 MB | Low-poly medieval villager NPCs |
| **craftpix-908976-environment-props-3d-low-poly-pack** | 23 FBX | 1 MB | Low-poly environment fillers |
| **Easy_Animated_Enemy_Pack_-_Jan_2019** | 6 FBX + 6 OBJ | 12 MB | Small set of animated enemies (Quaternius) |
| **Low_Poly_-_Character_Customization** | 40 FBX + 145 PNG | 14 MB | Hair, beard, helmet, armor parts |
| **Retro_Survivors** | 4 GLB + 4 PNG | 2 MB | Retro pixel-style survivor characters |
| **GLB_Files** | 6 GLB (some sub-zips) | 172 MB | Misc GLB grab-bag (needs sub-inventory) |
| **buildmaterials** | 8 GLB + 8 FBX | 1 MB | Stone, wood, brick building blocks |
| **raft** | 1 GLB + 1 FBX + 1 OBJ | 4 MB | Player raft mesh |
| **(DEMO)_Lords_Of_Pain** | 539 PNG | 7 MB | Old-school isometric tile sprites (2D) |
| **-_Classic_64_Asset_Pack_0.6** | 383 PNG | 98 MB | Classic-64 retro tile pack (2D) |

## Pixel / UI Asset Packs

| Bundle | Files | Use |
|---|---|---|
| wills_pixel_explosions_sample | 361 PNG | Pixel explosion sprite sheets |
| craftpix-net-137102-adventure-fantasy-book-pixel-art | 84 PNG | Pixel-art book / journal UI |
| craftpix-net-767317-bestiary-book-pixel-art-asset-pack | 74 PNG | Bestiary book UI |
| craftpix-net-809047-free-animated-magic-book-pixel-art-asset-p | 152 PNG | Animated magic-book UI |
| MagicProjectilesVFX / magicvfx / portal | Godot `.gdshader` + PNG | Shader source (port to GLSL) + sprites |

## Skipped Junk (auto, by `triage-attached-assets.mjs`)

`ARPG_*_WebGL` (compiled Unity build), `Blend_Files` (`.blend` source not web-loadable), `craftpix-896711-rpg-game-ui` (179 MB mega icon pack — overlaps existing catalog), `*-achievement-rpg-icon*` (5 × 100+ MB achievement-icon packs), `MDA_Hatchery` (Unity package), `TestingOverhead` (Unity), `toonshading` (0 bytes), `horror-game-floor-generator-free` (Unity tool), `VFXFootageExplosion` (193 MB of video footage, not three.js-loadable).

## Notes

- **Animated_Mech_Pack characters** (George/Leela/Mike/Stan) carry full clip sets including `Idle, Walk, Run, Shoot, Punch, Kick, Jump, Death, HitRecieve_1, HitRecieve_2, SwordSlash, Pickup`. They are drop-in replacements / alternatives for `robot_t1.glb` (which has only T-pose clips).
- **`robot_t1.glb`** is staged at `public/models/mechs/robot_t1/` but has no usable clips — needs Mixamo retargeting or use of the `Animated_Mech_Pack` rig as the animation source.
- **`tide_caller.glb`** is staged at `public/models/enemies/tide_caller/` but is a static unrigged sculpt — needs auto-rigging or use as a static set-piece/floating shrine boss.
