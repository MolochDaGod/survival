import { useState } from 'react';
import { BookOverlay, type PageNavApi } from './BookOverlay';
import { getAllBestiaryEntries, BestiaryEntry } from '../../data/bestiary';
import { MonsterPortrait } from './MonsterPortrait';
import { ThreatPips } from './BookIcons';

interface Props { onClose: () => void; }

/**
 * BestiaryBook — multi-page compendium.
 *
 * Page layout:
 *   1. Index — grid of every entry with portrait + threat pips. Click an
 *      entry to jump to its statblock; the bookmark sidebar mirrors the
 *      same entries down the right edge of the book for fast navigation.
 *   2..N+1. One statblock per entry — left page shows portrait + combat
 *      values + weakness/resist tags, right page shows lore, behaviour,
 *      abilities, tactics, and known loot. Each entry's bookmark colour
 *      matches its accentColor.
 *
 * No emoji — threat ratings render via the SVG ThreatPips component and
 * portraits resolve via MonsterPortrait. BookOverlay only mounts the
 * currently-active page, so even with rich per-entry content the book
 * never instantiates more than one entry-page worth of DOM at once —
 * combined with `decoding="async"` on portraits this keeps the book
 * from stalling the game loop on open.
 */
export function BestiaryBook({ onClose }: Props) {
  const [, setVersion] = useState(0); // forces re-render after click-jumps if needed

  // Curated lore entries first, synthesized stubs for everything else in
  // creatures.ts. Computed once per open — the registry is static.
  const BESTIARY = getAllBestiaryEntries();

  const renderIndexPages = (nav: PageNavApi) => (
    <>
      <div className="book-page left">
        <h1 className="book-h1">Bestiary</h1>
        <p className="book-text" style={{ textAlign: 'center', fontStyle: 'italic', fontSize: 13 }}>
          Compendium of the rift-touched
        </p>
        <div className="book-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', marginTop: 6, gap: 4 }}>
          {BESTIARY.slice(0, Math.ceil(BESTIARY.length / 2)).map(e => (
            <BestiaryThumb key={e.enemyKey} entry={e} onSelect={() => nav.goTo(`entry-${e.enemyKey}`)} />
          ))}
        </div>
      </div>
      <div className="book-page right">
        <h1 className="book-h1">&nbsp;</h1>
        <p className="book-text" style={{ textAlign: 'center', fontSize: 12, opacity: 0.65 }}>
          {BESTIARY.length} entries · click any to jump
        </p>
        <div className="book-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', marginTop: 6, gap: 4 }}>
          {BESTIARY.slice(Math.ceil(BESTIARY.length / 2)).map(e => (
            <BestiaryThumb key={e.enemyKey} entry={e} onSelect={() => nav.goTo(`entry-${e.enemyKey}`)} />
          ))}
        </div>
      </div>
    </>
  );

  const renderEntryPage = (e: BestiaryEntry) => () => (
    <>
      <div className="book-page left">
        <h2 className="book-h1" style={{ fontSize: 22, color: e.accentColor }}>{e.name}</h2>
        <div className="bestiary-portrait" style={{ aspectRatio: '1/1', maxHeight: 180 }}>
          <MonsterPortrait
            enemyKey={e.enemyKey}
            name={e.name}
            portrait={e.portrait}
            crop={e.portraitCrop}
            fallbackColor={e.accentColor}
          />
        </div>
        <p className="book-text" style={{ textAlign: 'center', fontSize: 12, opacity: 0.7, margin: '0 0 4px' }}>
          {e.classification}
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', margin: '0 0 6px' }}>
          <ThreatPips level={e.threatLevel} />
        </div>

        <div className="book-stat-row"><span>HP</span><b>{e.hp}</b></div>
        <div className="book-stat-row"><span>Damage</span><b>{e.damage}</b></div>
        <div className="book-stat-row"><span>Speed</span><b>{e.speed === 0 ? 'static' : `${e.speed} m/s`}</b></div>

        <h2 className="book-h2" style={{ marginTop: 4, fontSize: 13 }}>Weakness</h2>
        <div>{e.weaknesses.map(w => <span key={w} className="weakness-tag">{w}</span>)}</div>

        <h2 className="book-h2" style={{ marginTop: 2, fontSize: 13 }}>Resists</h2>
        <div>{e.resistances.map(r => <span key={r} className="resist-tag">{r}</span>)}</div>
      </div>

      <div className="book-page right">
        <h2 className="book-h2" style={{ color: e.accentColor }}>Lore</h2>
        <p className="book-text" style={{ fontSize: 12 }}>{e.lore}</p>

        <h2 className="book-h2" style={{ marginTop: 6 }}>Habitat</h2>
        <p className="book-text" style={{ fontSize: 11, opacity: 0.85 }}>{e.habitat}</p>

        <h2 className="book-h2" style={{ marginTop: 6 }}>Behaviour</h2>
        <p className="book-text" style={{ fontSize: 11 }}>{e.behaviour}</p>

        <h2 className="book-h2" style={{ marginTop: 6 }}>Abilities</h2>
        <ul style={{ margin: 0, padding: '0 0 0 16px' }}>
          {e.abilities.map(a => (
            <li key={a} className="book-text" style={{ margin: '1px 0', fontSize: 11 }}>{a}</li>
          ))}
        </ul>

        <h2 className="book-h2" style={{ marginTop: 6 }}>Combat Notes</h2>
        <p className="book-text" style={{ fontSize: 11 }}>{e.tips}</p>

        <h2 className="book-h2" style={{ marginTop: 6 }}>Known Loot</h2>
        <div>
          {e.loot.map(l => <span key={l} className="loot-tag">{l}</span>)}
        </div>

        <div style={{ flex: 1 }} />
        <p className="book-text" style={{ fontSize: 10, opacity: 0.55, fontStyle: 'italic', textAlign: 'right', marginTop: 4 }}>
          First sighted: {e.firstSighted}
        </p>
        <p className="book-text" style={{ fontSize: 10, opacity: 0.5, fontStyle: 'italic', textAlign: 'right', margin: 0 }}>
          — Survivor Field Notes, vol. {String.fromCharCode(73 + BESTIARY.indexOf(e))}
        </p>
      </div>
    </>
  );

  // Page 0 = index spread; pages 1..N = one entry each.
  const pages = [
    { id: 'index', badge: { color: '#6b2c0a', label: 'Index' }, render: renderIndexPages },
    ...BESTIARY.map(e => ({
      id: `entry-${e.enemyKey}`,
      badge: { color: e.accentColor, label: e.name },
      render: renderEntryPage(e),
    })),
  ];

  // Re-render hook for ad-hoc state nudges (kept for future filters)
  void setVersion;

  return <BookOverlay kind="bestiary" pages={pages} onClose={onClose} />;
}

/** Single grid thumbnail for the index page. Pure portrait + name + pips. */
function BestiaryThumb({ entry, onSelect }: { entry: BestiaryEntry; onSelect?: () => void }) {
  return (
    <div
      className="book-thumb"
      style={{ aspectRatio: '2/1', flexDirection: 'row', padding: 4, gap: 6, cursor: onSelect ? 'pointer' : 'default' }}
      title={`${entry.name} — open entry`}
      onClick={onSelect}
    >
      <div style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 3, overflow: 'hidden', border: `1px solid ${entry.accentColor}` }}>
        <MonsterPortrait
          enemyKey={entry.enemyKey}
          name={entry.name}
          portrait={entry.portrait}
          crop={entry.portraitCrop}
          fallbackColor={entry.accentColor}
        />
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: 11, fontWeight: 700, color: '#3a1f10', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {entry.name}
        </div>
        <ThreatPips level={entry.threatLevel} size={6} />
      </div>
    </div>
  );
}
