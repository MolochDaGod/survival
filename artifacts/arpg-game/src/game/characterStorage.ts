import { CharacterConfig } from './CharacterConfig';
import { activeSuffix } from './activeCharacter';

const STORAGE_KEY = 'grudge_nexus_character';

/** Returns the per-character storage key, or the legacy unscoped key when no
 *  character has been picked yet (preserves single-character pre-MMO saves). */
function storageKey(): string {
  return `${STORAGE_KEY}${activeSuffix()}`;
}

export function saveCharacter(config: CharacterConfig): void {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(config));
  } catch {
  }
}

export function loadCharacter(): CharacterConfig | null {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CharacterConfig;
    if (!parsed.name || !parsed.gender || !parsed.stats) return null;
    // The legacy outfit overlay (Quaternius mesh layered on top of the survivor
    // base) is deprecated — Quaternius models are now full body-type silhouettes
    // and equippable clothing/armor will live in the future per-slot gear system.
    // Force every loaded character back to 'none' so stale saved outfit ids do
    // not trigger the old hide-everything-but-skin-mesh path that left people
    // looking like floating hair.
    parsed.outfitId = 'none';
    // The body-type roster is the Quaternius animated character pack —
    // every id in BODY_TYPES maps to a clothed `<gender>/<id>.gltf` mesh
    // with 24 baked clips. Older saves may carry retired ids ('athletic',
    // 'lean', 'civilian', 'superhero', 'teen', 'regular'); coerce any id
    // that no longer resolves back to 'adventurer' (the canonical default
    // present for both genders) so BODY_TYPES.find() always succeeds.
    const KNOWN_BODY_IDS = new Set([
      'adventurer', 'beach', 'casual', 'casual-hoodie', 'farmer', 'king',
      'punk', 'spacesuit', 'suit', 'swat', 'worker',
    ]);
    if (!parsed.bodyProportion || !KNOWN_BODY_IDS.has(parsed.bodyProportion)) {
      parsed.bodyProportion = 'adventurer';
    }
    // Map orphaned hair-style ids (the old roster had 15 alias entries that
    // pointed at the same 6 source GLTFs under fake labels) onto the closest
    // surviving real style.
    const HAIR_ALIAS_MIGRATION: Record<string, string> = {
      Hair_Mohawk:     'Hair_Buzzed',
      Hair_FauxHawk:   'Hair_Buzzed',
      Hair_Military:   'Hair_Buzzed',
      Hair_Undercut:   'Hair_SimpleParted',
      Hair_Cornrows:   'Hair_SimpleParted',
      Hair_Slick:      'Hair_SimpleParted',
      Hair_Ponytail:   'Hair_Long',
      Hair_Dreadlocks: 'Hair_Long',
      Hair_Braids:     'Hair_Long',
      Hair_Topknot:    'Hair_Buns',
      Hair_CurlyAfro:  'Hair_Buns',
      Hair_Pixie:      'Hair_BuzzedFemale',
      Hair_BobCut:     'Hair_BuzzedFemale',
    };
    if (parsed.hairStyleId && HAIR_ALIAS_MIGRATION[parsed.hairStyleId]) {
      parsed.hairStyleId = HAIR_ALIAS_MIGRATION[parsed.hairStyleId];
    }
    // Backfill perk choices for older saves.
    if (!parsed.perkChoices) parsed.perkChoices = { tier4: {}, tier5: {} };
    if (!parsed.perkChoices.tier4) parsed.perkChoices.tier4 = {};
    if (!parsed.perkChoices.tier5) parsed.perkChoices.tier5 = {};
    return parsed;
  } catch {
    return null;
  }
}

export function clearCharacter(): void {
  try {
    localStorage.removeItem(storageKey());
  } catch {
  }
}
