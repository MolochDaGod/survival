/**
 * LoreLibrary — runtime access to the canonical Grudges Compendium.
 *
 * The compendium is a single markdown document staged at
 * `${BASE_URL}lore/grudges-compendium.md` (see public/lore/). This
 * module is the typed entry point that every AI subsystem
 * (NPCBrain, EnemyBrain, dialogue, faction reactions, future LLM
 * prompt context, etc.) should use to pull lore — never fetch the
 * file directly so we have a single cache + a single index.
 *
 * Loaded once on first call and cached for the lifetime of the page.
 */

export interface LoreSection {
  /** Heading text after the leading `#`s, e.g. "Chapter 5: The Stratocolonies". */
  title: string;
  /** Heading depth (1 = `#`, 2 = `##`, 3 = `###`). */
  depth: number;
  /** Body text under this heading, up to the next heading at the same or shallower depth. */
  body: string;
}

export interface LoreDocument {
  /** Raw markdown source — useful for prompt context dumps. */
  raw: string;
  /** Flat list of every heading encountered, in document order. */
  sections: LoreSection[];
  /** title → section, lowercased & trimmed for forgiving lookup. */
  byTitle: Map<string, LoreSection>;
}

const COMPENDIUM_PATH = 'lore/grudges-compendium.md';

let cached: Promise<LoreDocument> | null = null;

/** Async load + parse the compendium. Subsequent calls return the same Promise. */
export function loadLore(): Promise<LoreDocument> {
  if (cached) return cached;
  const base = import.meta.env.BASE_URL ?? '/';
  const url = `${base}${COMPENDIUM_PATH}`;
  cached = fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`[LoreLibrary] ${url} → ${r.status}`);
      return r.text();
    })
    .then((raw) => parse(raw))
    .catch((err) => {
      cached = null;
      throw err;
    });
  return cached;
}

/** Convenience: pull one section by (case-insensitive, trimmed) title. */
export async function getLoreSection(title: string): Promise<LoreSection | undefined> {
  const doc = await loadLore();
  return doc.byTitle.get(title.trim().toLowerCase());
}

function parse(raw: string): LoreDocument {
  const lines = raw.split(/\r?\n/);
  const sections: LoreSection[] = [];
  const byTitle = new Map<string, LoreSection>();
  let current: LoreSection | null = null;
  const buf: string[] = [];

  const flush = () => {
    if (!current) return;
    current.body = buf.join('\n').trim();
    sections.push(current);
    byTitle.set(current.title.trim().toLowerCase(), current);
    buf.length = 0;
  };

  for (const line of lines) {
    const m = /^(#{1,6})\s+(.*)$/.exec(line);
    if (m) {
      flush();
      current = { title: m[2].trim(), depth: m[1].length, body: '' };
    } else if (current) {
      buf.push(line);
    }
  }
  flush();
  return { raw, sections, byTitle };
}
