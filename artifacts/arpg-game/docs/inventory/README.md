# Grudges Inventory — Master Index

This folder is the **single source of truth** for all design tables and asset registries in Grudges.
Nothing here is loaded by runtime code yet (zero `*.csv` references in `src/`); it is consumed by **humans and AI agents** during development.

**When asked to add or change game content, read this file first.** Then open the specific CSV(s) listed below. Every CSV uses comma separation, a single header row, and quotes any cell containing a comma.

---

## File Map

| File | Rows | Domain | Primary Key | Read When… |
|---|---:|---|---|---|
| `professions.csv` | 147 | **Design table** — all 7 professions × 5 branches × 4 ranks + Master capstones | `Skill ID` (e.g. `combat.blades.3`) | Adding/editing perks, ranks, signature items, or skill point costs. |
| `perks.csv` | 147 | **Derived view** of `professions.csv` — perk name, how to unlock it, what it does, recipes granted, signature item. Read-only spreadsheet for designers and players. | `Skill ID` | Browsing/exporting all perks. **Do not edit directly — regenerate from `professions.csv`.** |
| `recipes.csv` | 150 | **Design table** — every craftable: weapons, armour, ammo, food, potions, building parts | `Recipe ID` (e.g. `craft_iron_sword`) | Adding/editing recipes, station requirements, recipe unlock gating. |
| `xp-sources.csv` | 36 | **Design table** — every XP-granting trigger and the profession it feeds | `Activity` (free-text label) | Adding/editing XP rewards, balancing progression speed, wiring NPC XP. |
| `npc-hires.csv` | 15 | **Design table** — recruitable NPC roles (Woodcutter, Sentry, Captain, etc.) | `Hire ID` (e.g. `hire_woodcutter`) | Adding hire archetypes, dialog requirements, behaviors. |
| `factions.csv` | 5 | **Design table** — the five surface factions: territory, alliance matrix, AI doctrine, signature gear | `Faction ID` (e.g. `keepers`) | Adding/editing faction relations, territorial AI behavior, signature gear, pledge rewards. |
| `faction-reputation-tiers.csv` | 8 | **Design table** — the -100 to +100 reputation ladder and what each tier means | `Tier` (Hated → Hero) | Adjusting tier thresholds, NPC behaviors per tier, player privileges per tier. |
| `creatures.csv` | 39 | **Asset registry** — animal, enemy, mech, NPC models on disk | `Name` (within `Role` group) | Wiring a new creature into spawning, AI, or loot. |
| `weapons.csv` | 45 | **Asset registry** — weapon models on disk (melee, ranged, attachments) | `Path` | Wiring a new weapon mesh into the equip system. |
| `gear.csv` | 20 | **Asset registry** — armour set meshes + textures on disk | `Slot + Set + Gender` | Wiring a new armour set into the gear system. |
| `character-parts.csv` | 26 | **Asset registry** — base character mesh + customization parts | `Slot + Name` | Adding a customization part (hair, head variant, etc.). |
| `harvestables.csv` | 26 | **Asset registry** — trees, rocks, plants, scrap nodes | `Resource Type` | Adding a harvestable; cross-check `Drops` column lines up with `recipes.csv` inputs. |
| `environment.csv` | 21 | **Asset registry** — modular building / dungeon / nature kits | `Kit` | Picking a tile to use in level design or camp building. |
| `animations.csv` | 15 | **Asset registry** — animation clips and what they're wired to | `Clip Name` | Adding a new animation; **idle.glb is the authoritative skeleton — first file loaded.** |

Lore lives at `public/lore/grudges-compendium.md` (single canonical file, loaded by `src/game/ai/LoreLibrary.ts`). It is **not** a CSV.

---

## Cross-Reference Rules

These three files reference each other and **must stay consistent**. When you edit one, check the others.

### `professions.csv` ↔ `recipes.csv`

- Every `Recipe ID` listed in the `Recipes Granted` column of professions.csv must appear in recipes.csv.
- Every `Unlocked By Skill` in recipes.csv must be a real `Skill ID` from professions.csv (or `(default)` for baseline recipes).
- Last verified clean: see prior sessions.

### `professions.csv` ↔ `xp-sources.csv`

- The `Profession Awarded` and `Side-Grant Profession` columns in xp-sources.csv must match a real `Profession` row in professions.csv (case-insensitive).
- The `Modifier (Effect Key)` column should match an effect key referenced by some perk in professions.csv (or be a flagged `(needs wiring)` placeholder).

### `harvestables.csv` ↔ `recipes.csv`

- Items in the `Drops` column of harvestables.csv become `Inputs` in recipes.csv. Names must match exactly (e.g. `wood_log`, `iron_ore`, `mineral_crystal`).

### `creatures.csv` ↔ `recipes.csv`

- Items in the `Drops / Loot` column of creatures.csv become `Inputs` in recipes.csv (e.g. `meat_beef`, `leather`, `bone`).

### `weapons.csv` / `gear.csv` ↔ `recipes.csv`

- Every craftable weapon/armour in recipes.csv should resolve to a model in weapons.csv or gear.csv via the `Output Asset Path` column.

### `npc-hires.csv` ↔ `professions.csv` (DESIGN PILLAR)

- **Every NPC runs the same systems the player does.** See `info.html` → "Living NPCs" section.
- Hires, wandering NPCs, and faction enemies all have the full profession tree available and gain XP from the same triggers (see the `NPC autonomous gain` row in xp-sources.csv).
- The `Starting Stats` column in npc-hires.csv is just the starting template; NPCs level up from there using the same XP table.

### `npc-hires.csv` ↔ `recipes.csv` — recruitment requires camp infrastructure

- **No hire costs gold.** Recruitment is dialog (per `Recruit Method` column) + camp prerequisites (per `Camp Requirement` column).
- Every camp that hosts hires must have these baseline recipes built: `build_campfire`, `build_storage_crate`, `craft_claim_flag`, plus one `build_tent_personal` per recruited NPC.
- Role-specific buildings (e.g. `build_logging_camp` for Woodcutter) are listed in the `Camp Requirement` column on top of the baseline four.
- The `craft_claim_flag` recipe doubles as the guild logo — it's also what enables raid spawning on the camp's 80m radius.

### `factions.csv` ↔ `faction-reputation-tiers.csv` ↔ `xp-sources.csv` — the faction system

- **Every actor (NPCs and players) carries a 5-element reputation vector**, one number per faction in the range -100 to +100. See `info.html` → "Guilds & Factions" section.
- The `Natural Enemies` column in factions.csv defines the 2 factions that drop to Hostile when you pledge. The relationship is symmetric — if Keepers list Scavengers as a natural enemy, Scavengers must list Keepers back. Verify symmetry when editing.
- The `Workable Relations` column lists the 2 factions that stay Neutral or shift slightly down on pledge. Each faction must list 2 enemies + 2 workable = 4 (the fifth slot is itself).
- The 8 tiers in faction-reputation-tiers.csv are the canonical rep thresholds. Any system that reads reputation (combat AI, dialog gates, trade prices, raid timers) must use this table — do not invent new tier names elsewhere.
- xp-sources.csv has 4 faction-related rows: pledge (one-time, +40), positive tier-up (+25 per tier crossing), negative tier recovery (+15 per recovery crossing), and complete faction contract (+20 to faction's signature profession + 5 township).

### `factions.csv` ↔ `npc-hires.csv` ↔ `professions.csv` — factions are AI players (DESIGN PILLAR)

- **Factions run the same systems the player does**, including recruitment. A Keeper camp uses `build_campfire`, `build_storage_crate`, `craft_claim_flag` (their flag is the faction sigil), and one `build_tent_personal` per Keeper NPC.
- The `AI Doctrine` column in factions.csv specifies which professions each faction prioritizes for its NPCs. Stay consistent when balancing professions — buffing Combat/Hammers also buffs Keeper paladins and Hollow Lord warlords.
- Faction-aligned hires (Diplomat Envoy, Bazaar Merchant, Mercenary at Friendly+, etc.) reference rep tiers in their `Recruit Method` column. Keep the tier names in sync with faction-reputation-tiers.csv.

---

## Column Conventions

To minimize cognitive load, these columns mean the same thing across files:

- **`Path`** — relative to `artifacts/arpg-game/`, always starts with `public/` or `src/`.
- **`Notes`** — free-text, last column, may contain commas (so it's quoted).
- **`Tier`** — integer 0–5; 0 = baseline / always-available, 5 = endgame.
- **`(needs wiring)`** — marker in `Source File` column meaning the design exists but no engine code reads it yet. Search for this string to find the implementation backlog.
- **`—`** — em-dash means "intentionally empty / not applicable" (vs. an empty cell which is "TBD").

---

## How AI Agents Should Use This Folder

1. **Read this README first.** Don't guess which file owns what.
2. **For "add a new X" tasks**, identify the domain from the File Map table, then read just that one CSV. Don't load all 11.
3. **For "balance / nerf / buff" tasks**, the design tables (`professions.csv`, `recipes.csv`, `xp-sources.csv`, `npc-hires.csv`) are the targets — never the asset registries.
4. **For "wire X into the engine" tasks**, search `src/` for the relevant system (e.g. `GameEngine.ts`, `AssetManager.ts`) — the CSV is the spec, not the implementation.
5. **When you add a new row, also update any cross-referenced file** per the rules above. A recipe with no profession unlock or a perk granting a non-existent recipe is a bug.
6. **Append, don't reorder.** The `xp-sources.csv` file ends with a special `SIGNATURE WEAPON RULE` row that must stay last; new XP rows go *before* it. Other files have no special tail rows.

---

## What's Intentionally NOT Here

- **Runtime data** (saves, world state, player progress) — lives in IndexedDB / localStorage at runtime.
- **Lore prose** — `public/lore/grudges-compendium.md`, loaded by `LoreLibrary.ts`.
- **Effect keys / engine constants** — defined in `src/game/` source code; the CSVs only reference them by string.
- **Texture / shader / sound asset listings** — not catalogued; assumed discoverable via `public/` directory walks.

If you find yourself wanting to create a new CSV here, first check whether an existing one can absorb the data with an extra column. Most domain growth in Grudges is **vertical** (more rows) not **horizontal** (more files).
