/**
 * Generates artifacts/website/public/data/bestiary.json from the canonical
 * arpg-game bestiary + creature registries.
 *
 * Single source of truth: artifacts/arpg-game/src/data/bestiary.ts +
 *                         artifacts/arpg-game/src/data/creatures.ts
 *
 * The website bestiary.html fetches the JSON this emits — it has no
 * direct TypeScript import path into the game package so this script
 * bridges the two.
 *
 * Run via:  pnpm exec tsx scripts/gen-bestiary-data.ts
 * Wired into:  artifacts/website/package.json scripts.prebuild
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  getAllBestiaryEntries,
  BESTIARY,
} from '../artifacts/arpg-game/src/data/bestiary.ts';
import { CREATURE_BY_KEY } from '../artifacts/arpg-game/src/data/creatures.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outFile = resolve(
  __dirname,
  '..',
  'artifacts/website/public/data/bestiary.json',
);

const entries = getAllBestiaryEntries().map((e) => {
  const def = CREATURE_BY_KEY.get(e.enemyKey);
  return {
    ...e,
    role: def?.role ?? null,
    ai:   def?.ai ?? null,
    isCurated: BESTIARY.some((c) => c.enemyKey === e.enemyKey),
  };
});

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(
  outFile,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      source: 'artifacts/arpg-game/src/data/{bestiary,creatures}.ts',
      count: entries.length,
      curatedCount: entries.filter((e) => e.isCurated).length,
      entries,
    },
    null,
    2,
  ),
);

console.log(
  `[gen-bestiary-data] wrote ${entries.length} entries ` +
  `(${entries.filter((e) => e.isCurated).length} curated, ` +
  `${entries.filter((e) => !e.isCurated).length} synthesized) → ${outFile}`,
);
