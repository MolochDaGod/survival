/**
 * Generate procedural SVG icons for every monster / npc / player_body prefab
 * that doesn't already have one, push them through the live asset upload
 * pipeline (POST /api/assets/upload → PUT to R2), and patch each prefab's
 * `data.iconUrl` so the game and admin can render the icon.
 *
 *   pnpm --filter @workspace/scripts run generate-prefab-icons
 *
 * Idempotent: prefabs whose `data.iconUrl` is already set are skipped.
 *
 * Required env: ADMIN_TOKEN (admin bearer used for /api/assets/upload and
 * /api/prefabs PUT). The script targets http://localhost:80 by default; set
 * API_BASE to override (e.g. for the deployed environment).
 */
import { db, eq, prefabsTable, type Prefab } from "@workspace/db";

type IconKind = "monster" | "npc" | "player_body";
const TARGET_KINDS: IconKind[] = ["monster", "npc", "player_body"];

const API_BASE = process.env.API_BASE ?? "http://localhost:80";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
if (!ADMIN_TOKEN) {
  console.error("[generate-prefab-icons] ADMIN_TOKEN env var is required");
  process.exit(1);
}

// ── 1. Procedural SVG ────────────────────────────────────────────────────────

const KIND_PALETTE: Record<IconKind, { bg: [string, string]; fg: string }> = {
  monster:     { bg: ["#3b0a0a", "#7c1d1d"], fg: "#fecaca" },
  npc:         { bg: ["#0a2540", "#1e40af"], fg: "#bfdbfe" },
  player_body: { bg: ["#052e2b", "#047857"], fg: "#a7f3d0" },
};

function monogram(name: string): string {
  const cleaned = name.replace(/\(.*?\)/g, " ").trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function hashHue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

function svgFor(prefab: { id: string; name: string; kind: IconKind }): string {
  const palette = KIND_PALETTE[prefab.kind];
  const hue = hashHue(prefab.id);
  const accent = `hsl(${hue}, 70%, 60%)`;
  const initials = monogram(prefab.name);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">',
    '<defs>',
    `<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">`,
    `<stop offset="0%" stop-color="${palette.bg[0]}"/>`,
    `<stop offset="100%" stop-color="${palette.bg[1]}"/>`,
    `</linearGradient>`,
    '</defs>',
    `<rect width="128" height="128" rx="20" fill="url(#bg)"/>`,
    `<circle cx="64" cy="64" r="44" fill="none" stroke="${accent}" stroke-width="4" opacity="0.55"/>`,
    `<text x="64" y="74" text-anchor="middle" font-family="Inter,Helvetica,Arial,sans-serif" font-size="42" font-weight="700" fill="${palette.fg}" letter-spacing="2">${initials}</text>`,
    `<text x="64" y="116" text-anchor="middle" font-family="Inter,Helvetica,Arial,sans-serif" font-size="10" fill="${palette.fg}" opacity="0.55">${prefab.kind.toUpperCase()}</text>`,
    '</svg>',
  ].join('');
}

// ── 2. Asset pipeline calls ──────────────────────────────────────────────────

async function presignPut(key: string): Promise<{ url: string; publicUrlHint?: string }> {
  const res = await fetch(`${API_BASE}/api/assets/upload`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ADMIN_TOKEN}`,
    },
    body: JSON.stringify({
      key,
      contentType: "image/svg+xml",
      bucket: "assets",
      ttlSeconds: 600,
    }),
  });
  if (!res.ok) {
    throw new Error(`presign failed: ${res.status} ${await res.text().catch(() => "")}`);
  }
  return (await res.json()) as { url: string; publicUrlHint?: string };
}

async function putSvg(presignedUrl: string, body: string): Promise<void> {
  const res = await fetch(presignedUrl, {
    method: "PUT",
    headers: { "content-type": "image/svg+xml" },
    body,
  });
  if (!res.ok) {
    throw new Error(`PUT to R2 failed: ${res.status} ${await res.text().catch(() => "")}`);
  }
}

function publicUrlFor(key: string): string | null {
  const base =
    process.env.OBJECT_STORAGE_PUBLIC_URL ?? process.env.OBJECT_STORAGE_PUBLIC_R2_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/${key
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

// ── 3. Drive ─────────────────────────────────────────────────────────────────

type IconablePrefab = Prefab & { kind: IconKind };

function isIconable(p: Prefab): p is IconablePrefab {
  return (TARGET_KINDS as readonly string[]).includes(p.kind);
}

async function main(): Promise<void> {
  const all = await db.select().from(prefabsTable);
  const targets: IconablePrefab[] = all.filter(isIconable).filter((p) => {
    const data = (p.data as Record<string, unknown> | null) ?? {};
    return typeof data.iconUrl !== "string";
  });

  console.log(
    `[generate-prefab-icons] ${targets.length} prefabs need icons ` +
      `(of ${all.length} total)`,
  );

  let ok = 0;
  let fail = 0;
  for (const prefab of targets) {
    const key = `icons/${prefab.kind}/${prefab.id}.svg`;
    const svg = svgFor({ id: prefab.id, name: prefab.name, kind: prefab.kind });
    try {
      const { url } = await presignPut(key);
      await putSvg(url, svg);
      const iconUrl = publicUrlFor(key);
      if (!iconUrl) {
        throw new Error(
          "No OBJECT_STORAGE_PUBLIC_URL/OBJECT_STORAGE_PUBLIC_R2_URL set; can't compute public icon URL",
        );
      }
      const baseData = (prefab.data as Record<string, unknown> | null) ?? {};
      await db
        .update(prefabsTable)
        .set({
          data: { ...baseData, iconUrl, iconKey: key },
          updatedAt: new Date(),
        })
        .where(eq(prefabsTable.id, prefab.id));
      ok++;
      if (ok % 10 === 0 || ok === targets.length) {
        console.log(`[generate-prefab-icons] ${ok}/${targets.length}`);
      }
    } catch (err) {
      fail++;
      console.warn(
        `[generate-prefab-icons] ${prefab.id} FAILED: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
  console.log(`[generate-prefab-icons] done: ${ok} ok, ${fail} failed`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[generate-prefab-icons] fatal:", err);
    process.exit(1);
  });
