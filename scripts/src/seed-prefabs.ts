/**
 * Seed the prefabs table with the entities the game already knows about, plus
 * a draft row for every loose GLB/FBX in attached_assets/. Idempotent — re-runs
 * only insert new rows (ON CONFLICT DO NOTHING).
 *
 *   pnpm --filter @workspace/scripts run seed-prefabs
 */
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  db,
  prefabsTable,
  type InsertPrefab,
  type PrefabKind,
} from "@workspace/db";

// ── 1. Carnival enemies (already wired into EnemyManager) ──────────────────
const CARNIVAL: InsertPrefab[] = (
  [
    ["clown", "Clown", 0xe84060],
    ["doctor", "Doctor", 0x80c0ff],
    ["masked", "Masked", 0x222222],
    ["miner", "Miner", 0xaa8855],
    ["scarecrow", "Scarecrow", 0xccaa44],
    ["seaexplorer", "Sea Explorer", 0x3377cc],
  ] as const
).map(
  ([key, label, color]): InsertPrefab => ({
    id: `monster_${key}`,
    kind: "monster",
    name: label,
    description: "Carnival horror enemy.",
    modelPath: `/models/enemies/${key}/${key}.fbx`,
    texturePath: `/models/enemies/${key}/texture.png`,
    scale: 0.014,
    data: {
      legacyKey: key,
      tintColor: color,
      hp: 60,
      damage: 8,
      speed: 3.2,
      attackRange: 1.6,
      aggroRange: 28,
    },
    tags: ["carnival", "spawnable"],
    draft: false,
  }),
);

// ── 2. Player body types (Quaternius silhouettes) ──────────────────────────
type BodyRow = {
  id: string;
  gender: "male" | "female";
  label: string;
  category: string;
  scaleX: number;
  scaleY: number;
  gltfPath: string;
};
const BODY_TYPES: BodyRow[] = [
  { id: "athletic",      gender: "male",   label: "Athletic",      category: "survivor", scaleX: 1.0,  scaleY: 1.0,  gltfPath: "/models/characters/male/athletic.glb" },
  { id: "lean",          gender: "male",   label: "Lean",          category: "survivor", scaleX: 0.96, scaleY: 1.02, gltfPath: "/models/characters/male/lean.glb" },
  { id: "athletic",      gender: "female", label: "Athletic",      category: "survivor", scaleX: 0.97, scaleY: 1.0,  gltfPath: "/models/characters/female/athletic.glb" },
  { id: "lean", gender: "female", label: "Lean", category: "survivor", scaleX: 0.93, scaleY: 1.02, gltfPath: "/models/characters/female/lean.glb" },
  { id: "adventurer",    gender: "male",   label: "Adventurer",    category: "civilian", scaleX: 1.0,  scaleY: 1.0,  gltfPath: "/models/characters/male/adventurer.gltf" },
  { id: "beach",         gender: "male",   label: "Beachgoer",     category: "civilian", scaleX: 1.0,  scaleY: 1.0,  gltfPath: "/models/characters/male/beach.gltf" },
  { id: "casual",        gender: "male",   label: "Casual",        category: "civilian", scaleX: 1.0,  scaleY: 1.0,  gltfPath: "/models/characters/male/casual.gltf" },
  { id: "casual-hoodie", gender: "male",   label: "Casual Hoodie", category: "civilian", scaleX: 1.0,  scaleY: 1.0,  gltfPath: "/models/characters/male/casual-hoodie.gltf" },
  { id: "farmer",        gender: "male",   label: "Farmer",        category: "civilian", scaleX: 1.02, scaleY: 1.0,  gltfPath: "/models/characters/male/farmer.gltf" },
  { id: "king",          gender: "male",   label: "King",          category: "civilian", scaleX: 1.05, scaleY: 1.02, gltfPath: "/models/characters/male/king.gltf" },
  { id: "punk",          gender: "male",   label: "Punk",          category: "civilian", scaleX: 0.98, scaleY: 1.0,  gltfPath: "/models/characters/male/punk.gltf" },
  { id: "spacesuit",     gender: "male",   label: "Spacesuit",     category: "civilian", scaleX: 1.08, scaleY: 1.02, gltfPath: "/models/characters/male/spacesuit.gltf" },
  { id: "suit",          gender: "male",   label: "Business Suit", category: "civilian", scaleX: 1.0,  scaleY: 1.02, gltfPath: "/models/characters/male/suit.gltf" },
  { id: "swat",          gender: "male",   label: "SWAT",          category: "civilian", scaleX: 1.05, scaleY: 1.02, gltfPath: "/models/characters/male/swat.gltf" },
  { id: "worker",        gender: "male",   label: "Worker",        category: "civilian", scaleX: 1.02, scaleY: 1.0,  gltfPath: "/models/characters/male/worker.gltf" },
  { id: "adventurer",    gender: "female", label: "Adventurer",    category: "civilian", scaleX: 0.97, scaleY: 1.0,  gltfPath: "/models/characters/female/adventurer.gltf" },
  { id: "casual",        gender: "female", label: "Casual",        category: "civilian", scaleX: 0.97, scaleY: 1.0,  gltfPath: "/models/characters/female/casual.gltf" },
  { id: "formal",        gender: "female", label: "Formal",        category: "civilian", scaleX: 0.97, scaleY: 1.02, gltfPath: "/models/characters/female/formal.gltf" },
  { id: "medieval",      gender: "female", label: "Medieval",      category: "civilian", scaleX: 0.97, scaleY: 1.02, gltfPath: "/models/characters/female/medieval.gltf" },
  { id: "punk",          gender: "female", label: "Punk",          category: "civilian", scaleX: 0.95, scaleY: 1.0,  gltfPath: "/models/characters/female/punk.gltf" },
  { id: "scifi",         gender: "female", label: "Sci-Fi",        category: "civilian", scaleX: 0.97, scaleY: 1.02, gltfPath: "/models/characters/female/scifi.gltf" },
  { id: "soldier",       gender: "female", label: "Soldier",       category: "civilian", scaleX: 1.0,  scaleY: 1.02, gltfPath: "/models/characters/female/soldier.gltf" },
  { id: "suit",          gender: "female", label: "Business Suit", category: "civilian", scaleX: 0.97, scaleY: 1.02, gltfPath: "/models/characters/female/suit.gltf" },
  { id: "witch",         gender: "female", label: "Witch",         category: "civilian", scaleX: 0.95, scaleY: 1.04, gltfPath: "/models/characters/female/witch.gltf" },
  { id: "worker",        gender: "female", label: "Worker",        category: "civilian", scaleX: 1.0,  scaleY: 1.0,  gltfPath: "/models/characters/female/worker.gltf" },
];

const BODIES: InsertPrefab[] = BODY_TYPES.map(
  (b): InsertPrefab => ({
    id: `body_${b.gender}_${b.id}`,
    kind: "player_body",
    name: `${b.label} (${b.gender})`,
    description: `Quaternius silhouette — ${b.category}.`,
    modelPath: b.gltfPath,
    texturePath: null,
    scale: 1.0,
    data: {
      gender: b.gender,
      bodyTypeId: b.id,
      category: b.category,
      scaleX: b.scaleX,
      scaleY: b.scaleY,
    },
    tags: [b.gender, b.category],
    draft: false,
  }),
);

// ── 3. Loose attached_assets — classify by filename, mark draft ────────────
const ATTACHED_DIR = resolve(process.cwd(), "../attached_assets");

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function classify(filename: string): { kind: PrefabKind; tags: string[] } | null {
  const lower = filename.toLowerCase();
  // Skip player animation files — already used directly by AssetManager.
  if (
    /^(idle|jump|walking|standard_run|left_strafe|right_strafe|left_turn|right_turn|standardsstanding_dodge)/.test(
      lower,
    )
  ) {
    return null;
  }
  // VFX
  if (
    /(explosion|fire_animation|stylized_fire|freeze|meteor|sphere_explosion|stylized_explosion|lighting_pack|anime_fire|trail|technology_aperture|local_warning|fish_hologram|explode_skeleton|floor_smashedexploded)/.test(
      lower,
    )
  ) {
    return { kind: "vfx", tags: ["draft", "attached_assets"] };
  }
  // Items
  if (
    /(free_ammo_set|magic_ring|medical_syringe|fists_2025|survival_guitar_backpack)/.test(
      lower,
    )
  ) {
    return { kind: "item", tags: ["draft", "attached_assets"] };
  }
  // Structures
  if (
    /(buildings_low-poly_pack|chinese_market|low_poly_winter_tree|oak_tree|sci-fi_elevator)/.test(
      lower,
    )
  ) {
    return { kind: "structure", tags: ["draft", "attached_assets"] };
  }
  // Humanoids that read more like NPCs than monsters
  if (/(chicken_gun|neutral_bandit|terrorist)/.test(lower)) {
    return { kind: "npc", tags: ["draft", "attached_assets"] };
  }
  // Default: monster
  return { kind: "monster", tags: ["draft", "attached_assets"] };
}

function scanAttachedAssets(): InsertPrefab[] {
  let entries: string[];
  try {
    entries = readdirSync(ATTACHED_DIR);
  } catch (err) {
    console.warn(`[seed-prefabs] attached_assets not found at ${ATTACHED_DIR}`);
    return [];
  }
  const seen = new Set<string>();
  const out: InsertPrefab[] = [];
  for (const file of entries) {
    if (!/\.(glb|fbx)$/i.test(file)) continue;
    const cls = classify(file);
    if (!cls) continue;
    // Strip the trailing _<digits> timestamp Replit attaches so we get a stable id.
    const slug = slugify(file.replace(/_\d{10,}$/, ""));
    const id = `${cls.kind}_${slug}`;
    if (seen.has(id)) continue; // dedupe siblings (e.g. .fbx + .glb pair)
    seen.add(id);
    out.push({
      id,
      kind: cls.kind,
      name: slug.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      description: `Imported from attached_assets/${file}. Needs review.`,
      modelPath: `/attached_assets/${file}`,
      texturePath: null,
      scale: 1.0,
      data: { sourceFile: file },
      tags: cls.tags,
      draft: true,
    });
  }
  return out;
}

async function main() {
  const rows = [...CARNIVAL, ...BODIES, ...scanAttachedAssets()];
  console.log(
    `[seed-prefabs] inserting ${rows.length} prefab rows ` +
      `(${CARNIVAL.length} carnival, ${BODIES.length} bodies, ${
        rows.length - CARNIVAL.length - BODIES.length
      } draft attached_assets)`,
  );
  // Single statement, ON CONFLICT DO NOTHING for idempotence.
  const result = await db
    .insert(prefabsTable)
    .values(rows)
    .onConflictDoNothing({ target: prefabsTable.id })
    .returning({ id: prefabsTable.id });
  console.log(`[seed-prefabs] inserted ${result.length} new rows (rest already present)`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[seed-prefabs] failed:", err);
    process.exit(1);
  });
