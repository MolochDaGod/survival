/**
 * The "active" character for this browser tab — the character whose save
 * keys (LOCAL_SAVE_KEY, character config) get read/written by the rest of
 * the game.
 *
 * Set when a player picks a row on the CharacterSelect screen (or finishes
 * creating a new character). When unset, the storage modules fall back to
 * the legacy unscoped keys so single-character pre-MMO saves still load.
 */
const KEY = "grudge_nexus_active_character";

let _cached: string | null | undefined;

export function getActiveCharacterId(): string | null {
  if (_cached !== undefined) return _cached;
  try {
    _cached = localStorage.getItem(KEY);
  } catch {
    _cached = null;
  }
  return _cached;
}

export function setActiveCharacterId(id: string | null): void {
  _cached = id;
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    /* quota — ignore */
  }
}

/** Suffix helper for save keys. Returns `__<charId>` or empty when unset. */
export function activeSuffix(): string {
  const id = getActiveCharacterId();
  return id ? `__${id}` : "";
}
