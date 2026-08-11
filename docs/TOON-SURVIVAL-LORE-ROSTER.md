# GRUDGES Survival — Toon Soldier Lore Roster (12)

**Host:** [survival.grudge-studio.com](https://survival.grudge-studio.com) · alias of [grudges.grudge-studio.com](https://grudges.grudge-studio.com)  
**Source meshes:** chicken_gun multipack → `models/toon-soldiers/{class}/{class}-{a|b}.glb`  
**Setting:** A century after The Way sealed the orbital elevators. Five factions claw for the surface.

The multipack is **cartoon / toy-soldier** (flat atlas, saturated plastics). Survival needs **weathered, grounded** surface survivors — same silhouettes, different paint story.

---

## The twelve

| # | Mesh | Callsign | Full name | Faction | Role | Short lore hook |
|---|------|----------|-----------|---------|------|-----------------|
| 1 | `scout/scout-a` | **Vex** | Vex “Glassline” Morrow | Tech-Scavengers | Pathfinder / skirmisher | Maps glasslands trade routes; sells paths, not mercy. |
| 2 | `scout/scout-b` | **Nim** | Nim Solari | Keepers of the Old Faith | Green-runner | Scout who still believes green returns if you bleed for it. |
| 3 | `engineer/engineer-a` | **Rivet** | Kael “Rivet” Dorn | Tech-Scavengers | Rigwright | Rebuilds elevators nobody else believes will open. |
| 4 | `engineer/engineer-b` | **Ashcoil** | Sera Ashcoil | The Network | Gridwright | Lawful salvage — tags wrecks, bills the Hollow Lords later. |
| 5 | `gunner/gunner-a` | **Bastion** | Torren Bastion | Hollow Lords | Heavy gun | Shelter walls need teeth; he is the teeth. |
| 6 | `gunner/gunner-b` | **Cinder** | Mava Cinder | The Forgotten | Heavy / ash-guard | Old-faith fire rites turned into belt-fed prayer. |
| 7 | `infantry/infantry-a` | **Brick** | Juno “Brick” Hale | Hollow Lords | Line fighter | Holds doorways until the cold takes the other guy. |
| 8 | `infantry/infantry-b` | **Ledger** | Quin Ledger | The Network | Patrol corporal | Counts ammo like sins; reports up the Network chain. |
| 9 | `medic/medic-a` | **Suture** | Dr. Ilya Suture | Keepers of the Old Faith | Field healer | Moss, stitches, and stubborn hope in a cracked case. |
| 10 | `medic/medic-b` | **Greyvial** | Kest Greyvial | The Forgotten | Bone-tender | Heals with ash-salts and forgotten saints’ names. |
| 11 | `sniper/sniper-a` | **Scope** | Rae “Scope” Venn | The Network | Marksman | One shot per dispute; the Network’s quiet judge. |
| 12 | `sniper/sniper-b` | **Permafrost** | Ysolde Permafrost | The Forgotten | Long-eye | Watches snow peaks for elevators that never come. |

### Faction spread

| Faction | Creed (lore) | Characters |
|---------|--------------|------------|
| **Keepers of the Old Faith** | Heal the land | Nim, Suture |
| **Tech-Scavengers** | The ruins are a market | Vex, Rivet |
| **Hollow Lords** | Shelter is the only currency | Bastion, Brick |
| **The Network** | The closest thing to law | Ashcoil, Ledger, Scope |
| **The Forgotten** | Their gods do not answer to ours | Cinder, Greyvial, Permafrost |

### Suggested starter biomes (spawn / portrait backdrop)

| Character | Biome feel |
|-----------|------------|
| Vex, Rivet | Glasslands / derelict-sprawl |
| Nim, Suture | Grassland edge → forest reclaim |
| Bastion, Brick | Derelict-sprawl fort shells |
| Ashcoil, Ledger, Scope | Outpost / Network radio towers |
| Cinder, Greyvial, Permafrost | Cinder-wastes / permafrost ridgelines |

---

## Texture reality check (what you have now)

- **Atlas:** single shared ~**1024² PNG** per character GLB (body + head materials).
- **Look:** flat cel-shaded blocks, pure primaries, almost no roughness variation.
- **Surfaces:** plastic helmets, candy fabrics, clean metal — toy kit, not post-elevator dirt.

Survival art target: **low-poly readable silhouettes** (keep the mesh) + **mid-poly material story** (dirty PBR-ish atlas).

---

## Color & texture edits — survival pass

### 1. Global grade (all 12)

| From (toon) | To (survival) |
|-------------|----------------|
| Pure white armor | Dirty bone / ash-grey, slight warm or cool cast by faction |
| Neon primaries | Desaturated faction accents (see below) |
| Flat black joints | Grease + dust mid-greys, not pure black |
| Plastic shine (high metal + high roughness mismatch) | **Metal:** dark scrap steel, scratched; **Cloth:** matte canvas/wool; **Rubber:** matte straps |
| Clean UV islands | Same UVs — **paint over**, don’t re-unwrap unless adding wear decals |

**Pipeline suggestion**

1. Extract atlas from each class GLB (or multipack).  
2. In Substance / Photoshop / Meshy retexture: base albedo → dirt AO → edge wear → faction stripe.  
3. Optional second map: roughness/metal packed RGB if you leave unlit path, or true `metalnessRoughnessTexture` for Three PBR.  
4. Re-embed into GLB; keep **same mesh names** so controllers stay valid.  
5. Upload as `models/toon-soldiers/survival/{class}-{variant}.glb` (don’t overwrite arcade/toon CDN keys).

### 2. Faction color systems (accent only — ~15–25% of surface)

| Faction | Accent | Avoid |
|---------|--------|--------|
| Keepers | Moss / sap green, faded olive webbing | Neon lime |
| Scavs | Ember rust, copper scrap, hazard stripe worn half-off | Clean orange plastic |
| Hollow Lords | Dried blood red, brick dust, soot | Bright candy red |
| Network | Cold steel blue, radio-LED cyan (small) | Toy sky-blue full-body |
| Forgotten | Bone, ash, pale gold icons, frost edge | Pure white armor |

### 3. Per-class material notes

| Class | Focus | Realism notes |
|-------|--------|----------------|
| **Scout** | Light kit, hood/scarf | Cloth folds via painted AO; boots mud-caked; optic lenses slightly cloudy |
| **Engineer** | Tools, pack, gauntlets | Grease on hands/forearms; welded plate patches; caution striping faded |
| **Gunner** | Heavy chest, ammo | Heat discoloration near barrel rest; fabric stretched over plates; soot |
| **Infantry** | Balanced armor | Scratches on plates; faded unit stencil; knee pads abraded |
| **Medic** | Soft + case | Stained cloth, faded cross/keeper glyph; leather straps dry-cracked |
| **Sniper** | Cloak / long coat | Weathered fabric, frost dust on shoulders (Permafrost), scope rubber matte |

### 4. Variant A vs B (why both exist in lore)

- **A** = field-issue / faction standard paint.  
- **B** = personal kit — different head, more patchwork, stronger biome weathering (e.g. scout-b more plant-stained; sniper-b ice rim).

Keep **silhouette difference** from the multipack heads; only the **paint story** changes.

### 5. Realism budget (stay playable)

Do **not** push full AAA photo textures on 1024² with toon normals.

| Do | Don’t |
|----|--------|
| Strong AO in albedo corners | 4k multi-set per character |
| Soft dirt gradients, not noise soup | Specular plastic “wet toy” |
| 1–2 faction marks max | Busy logos fighting read |
| Subtle roughness variation | Mirror chrome armor |
| Height ~1.7–1.85 m bake | Leaving Sketchfab scale |

Target: **“readable at 20 m, grim at 2 m.”**

### 6. Recommended output set

```
models/toon-soldiers/survival/
  scout-a.glb          # Vex
  scout-b.glb          # Nim
  engineer-a.glb       # Rivet
  ...
  roster.json          # ids ↔ lore names ↔ faction
```

Catalog fields:

```json
{
  "id": "survival:vex",
  "mesh": "toon:scout",
  "callsign": "Vex",
  "fullName": "Vex “Glassline” Morrow",
  "faction": "scavs",
  "textureSet": "survival-v1"
}
```

### 7. Tooling options (studio)

| Tool | Use |
|------|-----|
| **Meshy retexture** (FBA skill) | Fast dark-fantasy / grime pass on atlas |
| **Photoshop / Krita** | Hand-paint dirt + faction stripes on 1024 atlas |
| **Substance Painter** | Best wear if you export high-quality bake cages later |
| **process-character.mjs** (survival skill) | Bake height to metres after texture swap |

---

## Animation note (already wired)

These twelve already share toon controllers + Mixamo retarget packs (pistol/rifle/shooter/longbow/adventure including **swimming / treading-water / swimming-to-ledge**). Texture survival pass does **not** require re-rigging if bone names stay intact.

---

## ARPG + shooting range (wired)

| Surface | Path |
|---------|------|
| Character creator body types | `BODY_TYPES` category `survivor` (12 callsigns) |
| Default spawn | `toon-brick` (Juno “Brick” Hale) |
| Asset load + Mixamo retarget | `AssetManager` + `src/game/toon/*` |
| Shooting range test | `/shooting-range.html` (12 operators + 6 ninja throwables) |
| Vendor FPS example | `vendor/grudge-control/example/shooting` uses CDN infantry toon |

```bash
# local
pnpm --filter @workspace/arpg-game dev
# open http://localhost:5173/shooting-range.html
# or main game character create → pick Vex / Brick / Scope …
```

## Next implementation steps (when you greenlight)

1. Extract atlases → paint survival set per faction table.  
2. Re-embed + `process-character.mjs --height 1.8` under `models/toon-soldiers/survival/`.  
3. Point `gltfPath` at survival retextures when ready.

---

*Roster for GRUDGES / survival.grudge-studio.com · meshes from chicken_gun toon soldiers · factions from official lore.html*
