import { useState } from 'react';
import { BookOverlay } from './BookOverlay';
import { HeartMark, SwordMark, SparkleMark, HammerMark, CheckGlyph } from './BookIcons';
import { HERO_PERKS, WARRIOR_PERKS, SMARTS_PERKS, MAKER_PERKS, type Perk, type StatTrack } from '../../game/progression/PerkSystem';

interface Props {
  onClose: () => void;
  /** Points already invested per track */
  spentByTrack: Record<StatTrack, number>;
  /** Currently unlocked perk ids */
  unlocked: Set<string>;
  /** Available skill points the player can still spend */
  availablePoints: number;
  /** Try to unlock a perk; returns true if successful */
  onUnlock: (perkId: string, track: StatTrack) => boolean;
  /** Player's base stats summary */
  playerStats: {
    level:    number;
    maxHp:    number;
    maxMana:  number;
    strength: number;
    agility:  number;
    intellect: number;
  };
}

const TRACK_LABELS: Record<StatTrack, { name: string; color: string; Mark: typeof HeartMark }> = {
  hero:    { name: 'Hero',    color: '#d44040', Mark: HeartMark },
  warrior: { name: 'Warrior', color: '#c5a059', Mark: SwordMark },
  smarts:  { name: 'Smarts',  color: '#5a9ad8', Mark: SparkleMark },
  maker:   { name: 'Maker',   color: '#6ec96e', Mark: HammerMark },
};

const ALL_TRACKS: Record<StatTrack, Perk[]> = {
  hero:    HERO_PERKS,
  warrior: WARRIOR_PERKS,
  smarts:  SMARTS_PERKS,
  maker:   MAKER_PERKS,
};

export function PerksBook({ onClose, spentByTrack, unlocked, availablePoints, onUnlock, playerStats }: Props) {
  // Per-track "currently inspected perk", so it survives page turns.
  const [selectedByTrack, setSelectedByTrack] = useState<Partial<Record<StatTrack, Perk>>>({});

  const canUnlock = (perk: Perk) => {
    if (unlocked.has(perk.id)) return false;
    if (availablePoints <= 0)  return false;
    return perk.requires.every(r => (spentByTrack[r.track] ?? 0) >= r.points);
  };

  // ── Overview page (page 1) ──────────────────────────────────────────────
  const renderOverview = () => (
    <>
      <div className="book-page left">
        <h1 className="book-h1">Perks</h1>
        <p className="book-text" style={{ textAlign: 'center', fontSize: 13, opacity: 0.75 }}>
          Available points: <b style={{ color: '#6b2c0a' }}>{availablePoints}</b>
        </p>

        <h2 className="book-h2" style={{ marginTop: 6 }}>Attributes</h2>
        <div className="book-stat-row"><span>Level</span><b>{playerStats.level}</b></div>
        <div className="book-stat-row"><span>Max HP</span><b>{playerStats.maxHp}</b></div>
        <div className="book-stat-row"><span>Max Mana</span><b>{playerStats.maxMana}</b></div>
        <div className="book-stat-row"><span>Strength</span><b>{playerStats.strength}</b></div>
        <div className="book-stat-row"><span>Agility</span><b>{playerStats.agility}</b></div>
        <div className="book-stat-row"><span>Intellect</span><b>{playerStats.intellect}</b></div>

        <h2 className="book-h2" style={{ marginTop: 8 }}>Track Investment</h2>
        {(['hero', 'warrior', 'smarts', 'maker'] as StatTrack[]).map(t => {
          const lbl = TRACK_LABELS[t];
          const Mark = lbl.Mark;
          return (
            <div key={t} className="book-stat-row">
              <span style={{ color: lbl.color, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Mark size={12} color={lbl.color} /> {lbl.name}
              </span>
              <b>{spentByTrack[t] ?? 0} pts · {ALL_TRACKS[t].filter(p => unlocked.has(p.id)).length} perks</b>
            </div>
          );
        })}
      </div>
      <div className="book-page right">
        <h1 className="book-h1">&nbsp;</h1>
        <h2 className="book-h2">Read this book</h2>
        <p className="book-text" style={{ fontSize: 12 }}>
          Use the bookmarks on the right edge to jump straight to a track.
          Each track holds five tiers of perks; spending points in a track
          unlocks higher tiers within it.
        </p>

        <h2 className="book-h2" style={{ marginTop: 10 }}>Perk Totals</h2>
        {(['hero', 'warrior', 'smarts', 'maker'] as StatTrack[]).map(t => {
          const lbl = TRACK_LABELS[t];
          const perks = ALL_TRACKS[t];
          const got = perks.filter(p => unlocked.has(p.id)).length;
          return (
            <div key={t} className="book-stat-row">
              <span style={{ color: lbl.color }}>{lbl.name}</span>
              <b>{got} / {perks.length}</b>
            </div>
          );
        })}

        <div style={{ flex: 1 }} />
        <p className="book-text" style={{ fontSize: 11, opacity: 0.55, fontStyle: 'italic', textAlign: 'right' }}>
          — One spent point in any track unlocks the next tier of that track
        </p>
      </div>
    </>
  );

  // ── Per-track spread (one per track) ────────────────────────────────────
  const renderTrackPage = (track: StatTrack) => () => {
    const lbl = TRACK_LABELS[track];
    const Mark = lbl.Mark;
    const trackPerks = ALL_TRACKS[track];
    const tiers = [1, 2, 3, 4, 5] as const;
    const selected = selectedByTrack[track] ?? null;

    return (
      <>
        <div className="book-page left">
          <h1 className="book-h1" style={{ color: lbl.color, fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Mark size={20} color={lbl.color} /> {lbl.name}
          </h1>
          <div className="book-stat-row"><span>Points spent</span><b>{spentByTrack[track] ?? 0}</b></div>
          <div className="book-stat-row"><span>Perks unlocked</span><b>{trackPerks.filter(p => unlocked.has(p.id)).length} / {trackPerks.length}</b></div>
          <div className="book-stat-row"><span>Available</span><b style={{ color: '#6b2c0a' }}>{availablePoints}</b></div>

          {selected ? (
            <>
              <h2 className="book-h2" style={{ marginTop: 8, color: lbl.color }}>{selected.name}</h2>
              <p className="book-text" style={{ fontSize: 11 }}>{selected.description}</p>
              <p className="book-text" style={{ fontSize: 10, opacity: 0.65, marginTop: 4 }}>
                Tier {selected.tier} · Requires{' '}
                {selected.requires.map((r, i) => (
                  <span key={i}>{i > 0 && ', '}{r.points} {TRACK_LABELS[r.track].name}</span>
                ))}
              </p>

              {selected.passive && Object.keys(selected.passive).length > 0 && (
                <>
                  <h2 className="book-h2" style={{ marginTop: 6, fontSize: 12 }}>Passive Effects</h2>
                  {Object.entries(selected.passive).map(([k, v]) => (
                    <div key={k} className="book-stat-row" style={{ fontSize: 11 }}>
                      <span style={{ textTransform: 'capitalize' }}>
                        {k.replace(/([A-Z])/g, ' $1').toLowerCase()}
                      </span>
                      <b>{typeof v === 'number' && v > 0 ? '+' : ''}{String(v)}</b>
                    </div>
                  ))}
                </>
              )}

              {unlocked.has(selected.id) ? (
                <div style={{
                  textAlign: 'center', color: '#3a8a3a', fontWeight: 700, marginTop: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  fontFamily: 'Cinzel, serif', letterSpacing: 2, fontSize: 13,
                }}>
                  <CheckGlyph size={16} color="#3a8a3a" /> UNLOCKED
                </div>
              ) : canUnlock(selected) ? (
                <button
                  className="page-turn"
                  style={{
                    position: 'static', width: '100%', height: 'auto', transform: 'none',
                    padding: '8px 0', borderRadius: 6, fontSize: 13, marginTop: 8,
                    color: '#fbe9b8', fontWeight: 700,
                  }}
                  onClick={() => { onUnlock(selected.id, track); }}
                >
                  Unlock
                </button>
              ) : (
                <p className="book-text" style={{ textAlign: 'center', color: '#a07060', marginTop: 6, fontSize: 11 }}>
                  {availablePoints <= 0 ? 'No skill points available' : 'Requirements not met'}
                </p>
              )}
            </>
          ) : (
            <p className="book-text" style={{ marginTop: 10, fontSize: 11, opacity: 0.6, fontStyle: 'italic' }}>
              Tap a perk on the right to inspect and unlock it.
            </p>
          )}
        </div>

        <div className="book-page right">
          {tiers.map(tier => {
            const tierPerks = trackPerks.filter(p => p.tier === tier);
            if (tierPerks.length === 0) return null;
            return (
              <div key={tier} className="perk-tier-row">
                <div className="perk-tier-label" style={{ color: lbl.color, fontSize: 11 }}>Tier {tier}</div>
                <div className="book-grid" style={{ gridTemplateColumns: 'repeat(6, 1fr)', gap: 3 }}>
                  {tierPerks.map(p => {
                    const isUnlocked  = unlocked.has(p.id);
                    const isAvailable = canUnlock(p);
                    return (
                      <div
                        key={p.id}
                        className={'book-thumb' + (selected?.id === p.id ? ' selected' : '')}
                        style={{
                          aspectRatio: '1/1',
                          opacity: isUnlocked ? 1 : isAvailable ? 0.95 : 0.45,
                          borderColor: isUnlocked ? '#3a8a3a' : isAvailable ? lbl.color : undefined,
                        }}
                        onClick={() => setSelectedByTrack({ ...selectedByTrack, [track]: p })}
                        title={p.name}
                      >
                        <img
                          src={p.icon}
                          alt={p.name}
                          style={{ width: '70%', height: '70%' }}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                        {isUnlocked && (
                          <span style={{ position: 'absolute', bottom: 1, right: 2, color: '#3a8a3a', display: 'inline-flex' }}>
                            <CheckGlyph size={10} color="#3a8a3a" />
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </>
    );
  };

  const TRACK_ORDER: StatTrack[] = ['hero', 'warrior', 'smarts', 'maker'];

  const pages = [
    { id: 'overview', badge: { color: '#6b2c0a', label: 'Overview' }, render: renderOverview },
    ...TRACK_ORDER.map(t => ({
      id: `track-${t}`,
      badge: { color: TRACK_LABELS[t].color, label: TRACK_LABELS[t].name },
      render: renderTrackPage(t),
    })),
  ];

  return <BookOverlay kind="magic" pages={pages} onClose={onClose} />;
}
