/**
 * ProfessionsBook — SWG-style profession + skill-tree UI.
 *
 * Multi-page layout:
 *   1. Overview page — every profession with current XP, learned count,
 *      blurb. Bookmark on each profession in the sidebar jumps to its
 *      detail spread.
 *   2..N. One detail spread per profession — left page shows the
 *      currently-selected skill (description, prereqs, learn CTA), right
 *      page shows the branches as a grid of tiles. Click a tile to update
 *      the left-page detail.
 *
 * Spends per-profession XP (NOT the level-up skill points used by the
 * existing PerksBook system — they coexist intentionally).
 *
 * No emoji — the "learned" mark uses the CheckGlyph SVG component.
 */

import { useEffect, useState } from 'react';
import { BookOverlay } from './BookOverlay';
import { CheckGlyph } from './BookIcons';
import {
  PROFESSIONS,
  PROFESSION_META,
  PROFESSION_BRANCHES,
  PROFESSION_MASTERS,
  type Profession,
  type ProfessionSkill,
} from '../../game/progression/Professions';
import { ProfessionsService } from '../../game/progression/ProfessionsService';

interface Props {
  onClose: () => void;
}

/**
 * Total skill count for a profession, including its master skill so the
 * "learned/total" UI can never display learned > total once the master
 * skill has been picked up.
 */
function totalSkillsFor(prof: Profession): number {
  const branchTotal = PROFESSION_BRANCHES[prof].reduce((s, b) => s + b.skills.length, 0);
  return branchTotal + (PROFESSION_MASTERS[prof] ? 1 : 0);
}

export function ProfessionsBook({ onClose }: Props) {
  const [tick, setTick] = useState(0);
  // Per-profession "currently inspected skill" — keeps detail across page turns.
  const [selectedByProf, setSelectedByProf] = useState<Partial<Record<Profession, ProfessionSkill>>>({});

  useEffect(() => ProfessionsService.subscribe(() => setTick(t => t + 1)), []);
  void tick;

  // Page 1 — overview
  const renderOverview = () => (
    <>
      <div className="book-page left">
        <h1 className="book-h1">Professions</h1>
        <p className="book-text" style={{ textAlign: 'center', fontStyle: 'italic', fontSize: 12 }}>
          Seven callings, each with its own XP pool. Skills you learn here grant
          permanent passives and stack with level-up perks.
        </p>

        <h2 className="book-h2" style={{ marginTop: 10 }}>Total Investment</h2>
        {PROFESSIONS.slice(0, 3).map(p => {
          const m = PROFESSION_META[p];
          const px = ProfessionsService.getXp(p);
          const learned = ProfessionsService.getState().learned.filter(id => id.startsWith(p + '.')).length;
          const total = totalSkillsFor(p);
          return (
            <div key={p} className="book-stat-row" style={{ borderBottom: `1px dashed ${m.color}55` }}>
              <span style={{ color: m.color, fontWeight: 700 }}>{m.label}</span>
              <b>{px} xp · {learned}/{total}</b>
            </div>
          );
        })}
      </div>
      <div className="book-page right">
        <h1 className="book-h1">&nbsp;</h1>
        <h2 className="book-h2" style={{ marginTop: 4 }}>Pick a profession</h2>
        <p className="book-text" style={{ fontSize: 11, opacity: 0.75 }}>
          Use the bookmark tabs on the right edge of the book — each one jumps
          straight to a profession's tree. Skills there cost the matching
          profession's own XP, earned by doing the work.
        </p>

        <h2 className="book-h2" style={{ marginTop: 10 }}>Other Callings</h2>
        {PROFESSIONS.slice(3).map(p => {
          const m = PROFESSION_META[p];
          const px = ProfessionsService.getXp(p);
          const learned = ProfessionsService.getState().learned.filter(id => id.startsWith(p + '.')).length;
          const total = totalSkillsFor(p);
          return (
            <div key={p} className="book-stat-row" style={{ borderBottom: `1px dashed ${m.color}55` }}>
              <span style={{ color: m.color, fontWeight: 700 }}>{m.label}</span>
              <b>{px} xp · {learned}/{total}</b>
            </div>
          );
        })}

        <div style={{ flex: 1 }} />
        <p className="book-text" style={{ fontSize: 10, opacity: 0.55, fontStyle: 'italic', textAlign: 'right' }}>
          — Star-Wars-Galaxies-style trees · stack with level-up perks
        </p>
      </div>
    </>
  );

  const renderProfessionPage = (prof: Profession) => () => {
    const meta = PROFESSION_META[prof];
    const branches = PROFESSION_BRANCHES[prof];
    const master = PROFESSION_MASTERS[prof];
    const xp = ProfessionsService.getXp(prof);
    const learnedCount = ProfessionsService.getState().learned.filter(id => id.startsWith(prof + '.')).length;
    const total = branches.reduce((s, b) => s + b.skills.length, 0) + (master ? 1 : 0);
    const selected = selectedByProf[prof] ?? null;
    const branchLabel = (id: string) => (id === 'master' ? 'Master' : branches.find(b => b.id === id)?.label ?? id);

    return (
      <>
        <div className="book-page left">
          <h1 className="book-h1" style={{ color: meta.color, fontSize: 22 }}>{meta.label}</h1>
          <p className="book-text" style={{ fontSize: 11, opacity: 0.75, textAlign: 'center', padding: '0 6px' }}>
            {meta.blurb}
          </p>

          <h2 className="book-h2" style={{ marginTop: 8 }}>Progress</h2>
          <div className="book-stat-row"><span>XP available</span><b style={{ color: meta.color }}>{xp}</b></div>
          <div className="book-stat-row"><span>Skills learned</span><b>{learnedCount} / {total}</b></div>

          {selected ? (
            <>
              <h2 className="book-h2" style={{ marginTop: 10 }}>{selected.name}</h2>
              <p className="book-text" style={{ fontSize: 11 }}>{selected.desc}</p>
              <p className="book-text" style={{ fontSize: 10, opacity: 0.65, marginTop: 4 }}>
                Branch: {branchLabel(selected.branch)} · Rank {selected.rank} · Cost {selected.cost} XP
              </p>
              {selected.signature && (
                <p className="book-text" style={{ fontSize: 10, opacity: 0.65 }}>
                  Signature item: <i>{selected.signature}</i>
                </p>
              )}
              {selected.recipes.length > 0 && (
                <p className="book-text" style={{ fontSize: 10, opacity: 0.65 }}>
                  Recipes: <i>{selected.recipes.join(', ')}</i>
                </p>
              )}
              {selected.prereq.length > 0 && (
                <p className="book-text" style={{ fontSize: 10, opacity: 0.65 }}>
                  Requires: <i>{selected.prereq.map(p => p.split('.').slice(-2).join(' rk ')).join(', ')}</i>
                </p>
              )}
              {ProfessionsService.isLearned(selected.id) ? (
                <div style={{
                  textAlign: 'center', color: '#3a8a3a', fontWeight: 700, marginTop: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  fontFamily: 'Cinzel, serif', letterSpacing: 2, fontSize: 13,
                }}>
                  <CheckGlyph size={16} color="#3a8a3a" /> LEARNED
                </div>
              ) : ProfessionsService.canLearn(selected.id) ? (
                <button
                  className="page-turn"
                  style={{
                    position: 'static', width: '100%', height: 'auto', transform: 'none',
                    padding: '8px 0', borderRadius: 6, fontSize: 13, marginTop: 8,
                    color: '#fbe9b8', fontWeight: 700,
                  }}
                  onClick={() => {
                    if (ProfessionsService.learnSkill(selected.id)) {
                      setSelectedByProf({ ...selectedByProf, [prof]: { ...selected } });
                    }
                  }}
                >
                  Learn — {selected.cost} XP
                </button>
              ) : (
                <p className="book-text" style={{ textAlign: 'center', color: '#a07060', marginTop: 6, fontSize: 11 }}>
                  {ProfessionsService.getXp(selected.prof) < selected.cost
                    ? `Need ${selected.cost - ProfessionsService.getXp(selected.prof)} more ${meta.label} XP`
                    : 'Locked — learn the prior rank first'}
                </p>
              )}
            </>
          ) : (
            <p className="book-text" style={{ marginTop: 10, fontSize: 11, opacity: 0.6, fontStyle: 'italic' }}>
              Tap a skill on the right to see its description, requirements, and learn it.
            </p>
          )}
        </div>

        <div className="book-page right">
          {branches.map(branch => (
            <div key={branch.id} className="perk-tier-row">
              <div className="perk-tier-label" style={{ color: meta.color, fontSize: 11 }}>{branch.label}</div>
              <div className="book-grid" style={{ gridTemplateColumns: `repeat(${branch.skills.length}, 1fr)`, gap: 3 }}>
                {branch.skills.map(skill => {
                  const isLearned = ProfessionsService.isLearned(skill.id);
                  const isAvailable = ProfessionsService.canLearn(skill.id);
                  return (
                    <div
                      key={skill.id}
                      className={'book-thumb' + (selected?.id === skill.id ? ' selected' : '')}
                      style={{
                        aspectRatio: '1/1',
                        opacity: isLearned ? 1 : isAvailable ? 0.95 : 0.5,
                        borderColor: isLearned ? '#3a8a3a' : isAvailable ? meta.color : undefined,
                      }}
                      onClick={() => setSelectedByProf({ ...selectedByProf, [prof]: skill })}
                      title={skill.name}
                    >
                      <img
                        src={skill.icon}
                        alt={skill.name}
                        style={{ width: '70%', height: '70%' }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                      {isLearned && (
                        <span style={{
                          position: 'absolute', bottom: 1, right: 2,
                          color: '#3a8a3a', display: 'inline-flex',
                        }}>
                          <CheckGlyph size={11} color="#3a8a3a" />
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {master && (() => {
            const isLearned = ProfessionsService.isLearned(master.id);
            const isAvailable = ProfessionsService.canLearn(master.id);
            return (
              <div className="perk-tier-row" style={{ marginTop: 4, borderTop: `1px dashed ${meta.color}55`, paddingTop: 4 }}>
                <div className="perk-tier-label" style={{ color: meta.color, fontSize: 11, fontWeight: 700 }}>
                  Master · {master.name}
                </div>
                <div
                  className={'book-thumb' + (selected?.id === master.id ? ' selected' : '')}
                  style={{
                    width: 36, height: 36, aspectRatio: '1/1',
                    opacity: isLearned ? 1 : isAvailable ? 0.95 : 0.5,
                    borderColor: isLearned ? '#3a8a3a' : isAvailable ? meta.color : undefined,
                    borderWidth: 2,
                  }}
                  onClick={() => setSelectedByProf({ ...selectedByProf, [prof]: master })}
                  title={master.name}
                >
                  <img
                    src={master.icon}
                    alt={master.name}
                    style={{ width: '70%', height: '70%' }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                  {isLearned && (
                    <span style={{ position: 'absolute', bottom: 1, right: 2, color: '#3a8a3a', display: 'inline-flex' }}>
                      <CheckGlyph size={11} color="#3a8a3a" />
                    </span>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      </>
    );
  };

  const pages = [
    { id: 'overview', badge: { color: '#6b2c0a', label: 'Overview' }, render: renderOverview },
    ...PROFESSIONS.map(p => ({
      id: `prof-${p}`,
      badge: { color: PROFESSION_META[p].color, label: PROFESSION_META[p].label },
      render: renderProfessionPage(p),
    })),
  ];

  return <BookOverlay kind="magic" pages={pages} onClose={onClose} />;
}
