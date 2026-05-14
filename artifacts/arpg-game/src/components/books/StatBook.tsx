/**
 * StatBook — per-stat detail book.
 *
 * Renders the full progression of a single Grudge stat: the tier 1-3
 * auto-milestones, the tier 4 active choices, the tier 5 passive choices,
 * and the tier 6 upgrade form of whichever active was picked.
 *
 * Multi-page layout:
 *   1. Overview spread — stat description, current level, what each tier
 *      grants at a glance.
 *   2. Milestones spread — tiers 1-3 with their auto-perks (and which
 *      have been unlocked given the current stat level).
 *   3. Choices spread — tier 4 actives + tier 5 passives + tier 6 upgrades
 *      with the player's current pick highlighted.
 *
 * Mounted from CharacterCreation summary and from PerksBook attribute rows
 * — opens in front of either, closes back to the original surface.
 */

import { BookOverlay } from './BookOverlay';
import { CheckGlyph } from './BookIcons';
import {
  STAT_META,
  STAT_MILESTONE_PERKS,
  STAT_MAX,
  type GrudgeStats,
} from '../../game/CharacterConfig';
import {
  TIER4_BY_STAT,
  TIER5_BY_STAT,
  TIER6_BY_BASE_ID,
  baseHotkeyFor,
  upgradeHotkeyFor,
} from '../../game/progression/StatPerkChoices';

interface Props {
  /** Which stat to display. */
  statKey: keyof GrudgeStats;
  /** Current level (0..STAT_MAX) for displaying unlocked vs upcoming. */
  currentLevel: number;
  /** Optional: which tier-4 active the player has picked (drives tier-6). */
  pickedActiveId?: string;
  /** Optional: which tier-5 passive the player has picked. */
  pickedPassiveId?: string;
  onClose: () => void;
}

export function StatBook({ statKey, currentLevel, pickedActiveId, pickedPassiveId, onClose }: Props) {
  const meta = STAT_META.find(s => s.key === statKey)!;
  const milestones = STAT_MILESTONE_PERKS[statKey];
  const tier4Choices = TIER4_BY_STAT[statKey];
  const tier5Choices = TIER5_BY_STAT[statKey];
  const tier6 = pickedActiveId ? TIER6_BY_BASE_ID[pickedActiveId] : undefined;

  // ── Page 1: Overview ────────────────────────────────────────────────────
  const renderOverview = () => (
    <>
      <div className="book-page left">
        <h1 className="book-h1" style={{ color: meta.color }}>{meta.label}</h1>
        <p className="book-text" style={{ textAlign: 'center', fontSize: 12, opacity: 0.85 }}>
          {meta.abbr} · {meta.desc}
        </p>

        <h2 className="book-h2" style={{ marginTop: 10 }}>Current</h2>
        <div className="book-stat-row">
          <span>Level</span>
          <b style={{ color: meta.color }}>{currentLevel} / {STAT_MAX}</b>
        </div>
        <div className="book-stat-row">
          <span>Active hotkey</span>
          <b>{baseHotkeyFor(statKey)}</b>
        </div>
        <div className="book-stat-row">
          <span>Upgrade hotkey</span>
          <b>{upgradeHotkeyFor(statKey)}</b>
        </div>

        <h2 className="book-h2" style={{ marginTop: 10 }}>Tier Map</h2>
        <p className="book-text" style={{ fontSize: 11, opacity: 0.75 }}>
          Tiers 1-3 grant a milestone perk automatically. Tier 4 lets you
          pick 1-of-3 active skills (bound to hotkey {baseHotkeyFor(statKey)}).
          Tier 5 picks a passive. Tier 6 upgrades your tier-4 active.
        </p>
      </div>

      <div className="book-page right">
        <h1 className="book-h1">&nbsp;</h1>
        <h2 className="book-h2">Spend XP</h2>
        <p className="book-text" style={{ fontSize: 12 }}>
          During Character Creation, points spent on {meta.abbr} climb the
          tier ladder for this stat. After creation, level-up rewards from
          stat-bound milestones unlock at every tier breakpoint.
        </p>

        <h2 className="book-h2" style={{ marginTop: 10 }}>Hotkey Order</h2>
        <p className="book-text" style={{ fontSize: 12 }}>
          The eight stats fire in their canonical order: BIO=1, NEU=2,
          KIN=3, QNT=4, SYN=5, CHR=6, ENT=7, GRA=8. Holding Shift triggers
          the tier-6 upgraded form when unlocked.
        </p>

        <div style={{ flex: 1 }} />
        <p className="book-text" style={{ fontSize: 11, opacity: 0.55, fontStyle: 'italic', textAlign: 'right' }}>
          — Use the bookmarks to view milestones and choices
        </p>
      </div>
    </>
  );

  // ── Page 2: Milestones (tiers 1-3 + a peek at 4-6) ──────────────────────
  const renderMilestones = () => (
    <>
      <div className="book-page left">
        <h1 className="book-h1" style={{ color: meta.color, fontSize: 22 }}>Milestones</h1>
        <p className="book-text" style={{ textAlign: 'center', fontSize: 11, opacity: 0.7 }}>
          Auto-granted at each tier. Green entries are already unlocked.
        </p>

        {milestones.slice(0, 3).map((m, i) => {
          const tier = i + 1;
          const unlocked = currentLevel >= tier;
          return (
            <div key={tier} className={'stat-book-tier' + (unlocked ? ' unlocked' : '')}>
              <div className="stat-book-tier-num">{tier}</div>
              <div className="stat-book-tier-body">
                <div className="stat-book-tier-name">{m.perkName}</div>
                <div>{m.perkDesc}</div>
              </div>
              {unlocked && <CheckGlyph size={14} color="#3a8a3a" />}
            </div>
          );
        })}
      </div>

      <div className="book-page right">
        <h1 className="book-h1" style={{ fontSize: 22 }}>Endgame</h1>
        <p className="book-text" style={{ textAlign: 'center', fontSize: 11, opacity: 0.7 }}>
          Higher-tier perks. The fixed entries shown at tier 4-6 are the
          baseline — picking is on the next page.
        </p>

        {milestones.slice(3, 6).map((m, i) => {
          const tier = i + 4;
          const unlocked = currentLevel >= tier;
          return (
            <div key={tier} className={'stat-book-tier' + (unlocked ? ' unlocked' : '')}>
              <div className="stat-book-tier-num">{tier}</div>
              <div className="stat-book-tier-body">
                <div className="stat-book-tier-name">{m.perkName}</div>
                <div>{m.perkDesc}</div>
              </div>
              {unlocked && <CheckGlyph size={14} color="#3a8a3a" />}
            </div>
          );
        })}
      </div>
    </>
  );

  // ── Page 3: Choices (tier 4 actives + tier 5 passives + tier 6 upgrade) ─
  const renderChoices = () => (
    <>
      <div className="book-page left">
        <h1 className="book-h1" style={{ color: meta.color, fontSize: 20 }}>Tier 4 Actives</h1>
        <p className="book-text" style={{ textAlign: 'center', fontSize: 11, opacity: 0.7 }}>
          Pick 1 of 3 — bound to hotkey {baseHotkeyFor(statKey)}.
        </p>
        <div className="stat-book-choice-grid">
          {tier4Choices.map(c => (
            <div key={c.id} className={'stat-book-choice' + (pickedActiveId === c.id ? ' chosen' : '')}>
              <b>{c.name}</b>
              {c.description}
              <div style={{ marginTop: 2, opacity: 0.65, fontSize: 10 }}>
                CD {c.cooldownS}s · {c.energyCost} en
              </div>
            </div>
          ))}
        </div>

        <h2 className="book-h2" style={{ marginTop: 10, fontSize: 13 }}>Tier 6 Upgrade</h2>
        {tier6 ? (
          <div className="stat-book-choice chosen">
            <b>{tier6.name}</b>
            {tier6.description}
            <div style={{ marginTop: 2, opacity: 0.65, fontSize: 10 }}>
              {upgradeHotkeyFor(statKey)} · CD {tier6.cooldownS}s · {tier6.energyCost} en
            </div>
          </div>
        ) : (
          <p className="book-text" style={{ fontSize: 11, opacity: 0.55, fontStyle: 'italic' }}>
            Pick a tier-4 active first — its upgraded form fires on {upgradeHotkeyFor(statKey)} once {meta.abbr} reaches tier 6.
          </p>
        )}
      </div>

      <div className="book-page right">
        <h1 className="book-h1" style={{ color: meta.color, fontSize: 20 }}>Tier 5 Passives</h1>
        <p className="book-text" style={{ textAlign: 'center', fontSize: 11, opacity: 0.7 }}>
          Pick 1 of 3 — always-on bonus.
        </p>
        <div className="stat-book-choice-grid">
          {tier5Choices.map(p => (
            <div key={p.id} className={'stat-book-choice' + (pickedPassiveId === p.id ? ' chosen' : '')}>
              <b>{p.name}</b>
              {p.description}
            </div>
          ))}
        </div>

        <div style={{ flex: 1 }} />
        <p className="book-text" style={{ fontSize: 11, opacity: 0.55, fontStyle: 'italic', textAlign: 'right' }}>
          — Picks lock in at the moment you reach the tier
        </p>
      </div>
    </>
  );

  const pages = [
    { id: 'overview',   render: renderOverview,   badge: { color: meta.color, label: 'Overview' } },
    { id: 'milestones', render: renderMilestones, badge: { color: meta.color, label: 'Milestones' } },
    { id: 'choices',    render: renderChoices,    badge: { color: meta.color, label: 'Choices' } },
  ];

  return <BookOverlay kind="magic" pages={pages} onClose={onClose} />;
}
