# Faction banners (claim / map identity)

**Source:** Imgur album [factions](https://imgur.com/a/LwyAQ3J)  
**Process:** `scripts/process-faction-banners.py` (flood-fill dark vignette → transparent PNG)

## Files

| Faction id | Full banner | Map icon |
|------------|-------------|----------|
| `keepers` | `/icons/factions/banners/keepers.png` | `/icons/factions/banner_keepers.png` |
| `tech_scavengers` | `…/tech_scavengers.png` (+ `scavengers.png`) | `banner_tech_scavengers.png` |
| `hollow_lords` | `…/hollow_lords.png` (+ `hollow.png`) | `banner_hollow_lords.png` |
| `network` | `…/network.png` | `banner_network.png` |
| `forgotten` | `…/forgotten.png` | `banner_forgotten.png` |

Mirrored under:

- `artifacts/website/public/icons/factions/`
- `artifacts/arpg-game/public/icons/factions/`

## SSOT

`artifacts/arpg-game/src/data/factions.ts` — `bannerPath` + `mapIconPath` on each `FactionDef`.

## Runtime use

| Surface | How |
|---------|-----|
| **World map (M)** | `WorldMapOverlay` draws `mapIconPath` on claimed camps / towns / outposts |
| **In-world poles** | `FactionBannerFlag.placeFactionBannerFlag` at towns, camps, outposts with `factionId` |
| **Website lore / home** | crest images → full transparent banners |
| **Map starter** | faction panel uses `*_banner.png` on grudges.grudge-studio.com |

## Re-run after new art

1. Drop raw PNGs in `public/icons/factions/banners/raw/`
2. `py -3 scripts/process-faction-banners.py`
3. Redeploy website + arpg-game static assets
