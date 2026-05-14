/**
 * MainPanel — unified hub UI bound to the C key. Replaces the standalone
 * crafting modal (folded in here as the Crafting tab). Tabs:
 *   Professions · Stats · Equipment · Quest · Skills/Perks · Crafting
 *   · Friends · Medical
 *
 * Wires to live game systems: PlayerStats, EquippedSet/bag, totalStats,
 * survivalStacks/RECIPES, ProfessionsService, ALL_PERKS, ABILITIES.
 *
 * Aesthetic: dark gothic — Cinzel + Crimson Text + JetBrains Mono, gold
 * #d4a400 on #1a120c panels with #c9950a borders.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { PlayerStats, AbilityDef } from '../game/types';
import {
  ItemStats, InventoryItem, EquipSlot, ItemDef, RARITY_HEX, ITEM_DATABASE,
} from '../game/Items';
import { EquippedSet } from '../game/Inventory';
import { Recipe, RECIPES, CraftingStation } from '../game/survival/Recipes';
import { SURVIVAL_ITEMS } from '../game/survival/SurvivalItems';
import { ProfessionsService } from '../game/progression/ProfessionsService';
import {
  PROFESSIONS, PROFESSION_META, PROFESSION_BRANCHES, PROFESSION_MASTERS,
  type Profession,
} from '../game/progression/Professions';
import { ALL_PERKS, type StatTrack, type Perk } from '../game/progression/PerkSystem';
import {
  STAT_META, STAT_MAX, STAT_COST, STARTING_BUDGET,
  costForNext, computeSpentPoints, STAT_MILESTONE_PERKS,
  type GrudgeStats, DEFAULT_STATS,
} from '../game/CharacterConfig';
import { loadCharacter } from '../game/characterStorage';
import { StatRadarChart } from './StatRadarChart';
import {
  StatProgressionService, WEAPON_XP_PER_POINT,
  type StatProgression,
} from '../game/progression/StatProgressionService';

// PerkSystem tier thresholds (kept in sync with progression/PerkSystem.ts).
const PERK_TIERS: { tier: number; pts: number; name: string }[] = [
  { tier: 1, pts: 3,  name: 'Initiate'  },
  { tier: 2, pts: 5,  name: 'Adept'     },
  { tier: 3, pts: 8,  name: 'Veteran'   },
  { tier: 4, pts: 13, name: 'Master'    },
  { tier: 5, pts: 20, name: 'Paragon'   },
];

// In-game level-up reward, kept in sync with PlayerController.gainExperience().
// Per level you gain: +1 skillPoint, +10 maxHP, +5 maxMP, and the XP cost for
// reaching the next level is `level * 100`.
const LEVEL_HP_GAIN  = 10;
const LEVEL_MP_GAIN  = 5;
const LEVEL_XP_BASE  = 100;
function xpForNextLevel(currentLevel: number): number {
  return currentLevel * LEVEL_XP_BASE;
}

// ─── Props ────────────────────────────────────────────────────────────────
export interface MainPanelProps {
  stats: PlayerStats;
  bag: InventoryItem[];
  bagCap: number;
  equipped: EquippedSet;
  totalStats: ItemStats;
  abilities: AbilityDef[];
  cooldowns: Record<string, number>;
  survivalStacks: Array<{ itemId: string; count: number }>;
  nearbyStations: CraftingStation[];
  perksUnlocked: Set<string>;
  perksSpent: Record<StatTrack, number>;
  onEquip: (uid: string) => void;
  onUnequip: (slot: EquipSlot) => void;
  onDrop: (uid: string) => void;
  onCraft: (recipeId: string) => void;
  onUnlockPerk: (perkId: string, track: StatTrack) => void;
  onClose: () => void;
}

type TabId =
  | 'professions' | 'stats' | 'equipment' | 'quest'
  | 'skills' | 'crafting' | 'friends' | 'medical';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'professions', label: 'Professions', icon: '⚒' },
  { id: 'stats',       label: 'Stats',        icon: '📊' },
  { id: 'equipment',   label: 'Equipment',    icon: '🛡' },
  { id: 'quest',       label: 'Quests',       icon: '📜' },
  { id: 'skills',      label: 'Skills/Perks', icon: '✨' },
  { id: 'crafting',    label: 'Crafting',     icon: '🔨' },
  { id: 'friends',     label: 'Friends',      icon: '👥' },
  { id: 'medical',     label: 'Medical',      icon: '🩹' },
];

// 8 equip slots, mapped to engine EquipSlot ids
const EQUIP_LEFT: { slot: EquipSlot; label: string; icon: string }[] = [
  { slot: 'helm',   label: 'Helmet', icon: '🪖' },
  { slot: 'chest',  label: 'Chest',  icon: '🥋' },
  { slot: 'legs',   label: 'Legs',   icon: '👖' },
  { slot: 'boots',  label: 'Boots',  icon: '🥾' },
];
const EQUIP_RIGHT: { slot: EquipSlot; label: string; icon: string }[] = [
  { slot: 'amulet', label: 'Amulet', icon: '📿' },
  { slot: 'ring',   label: 'Ring',   icon: '💍' },
  { slot: 'offhand',label: 'Off-Hand', icon: '🛡' },
];

const TRACKS: StatTrack[] = ['hero', 'warrior', 'smarts', 'maker'];
const TRACK_COLOR: Record<StatTrack, string> = {
  hero:    '#ff7d87',
  warrior: '#ffb16d',
  smarts:  '#bb95ff',
  maker:   '#49de95',
};

// Sample quest/friend data — no quest/social system yet, but the UI is ready.
const SAMPLE_QUESTS = [
  { title: 'The Iron Grudge',     desc: 'Defeat 15 raiders in the Old Mine.',     progress: 60,  reward: '1200 XP, Ironvow Blade' },
  { title: 'Blood Tribute',       desc: 'Collect 8 Blood Crystals.',              progress: 37,  reward: '800 XP, 500 Gold' },
  { title: "Warlord's Challenge", desc: 'Survive 3 nights without dying.',        progress: 100, reward: '2500 XP, Title' },
];
const SAMPLE_FRIENDS = [
  { name: 'Shadowfang',  level: 38, status: 'In Party',  online: true  },
  { name: 'Ironmaul',    level: 35, status: 'Old Mine',  online: true  },
  { name: 'Emberclaw',   level: 31, status: 'Iron Hills',online: true  },
  { name: 'Duskwhisper', level: 28, status: 'Offline',   online: false },
];

// ─── Component ────────────────────────────────────────────────────────────
export const MainPanel: React.FC<MainPanelProps> = (props) => {
  const {
    stats, bag, bagCap, equipped, totalStats, abilities, cooldowns,
    survivalStacks, nearbyStations, perksUnlocked, perksSpent,
    onEquip, onUnequip, onDrop, onCraft, onUnlockPerk, onClose,
  } = props;

  const [tab, setTab] = useState<TabId>('professions');
  const [rcolMode, setRcolMode] = useState<'inv' | 'skills'>('inv');
  // Re-render on profession state changes.
  const [, force] = useState(0);
  useEffect(() => ProfessionsService.subscribe(() => force((n) => n + 1)), []);

  // The 8 BIO/NEU/KIN/QNT/SYN/CHR/ENT/GRA primary stats are stored on the
  // saved CharacterConfig (chosen at character creation), not on PlayerStats.
  // Read them lazily so the panel always shows the active character's loadout.
  const primaryStats = useMemo<GrudgeStats>(
    () => loadCharacter()?.stats ?? DEFAULT_STATS,
    [],
  );
  // Subscribe to live progression updates (free points, weapon XP, bonuses).
  const [progression, setProgression] = useState<StatProgression>(() => {
    // Catch up the free-point pool to the current character level on first read
    // so existing high-level saves immediately receive their backlog of points.
    StatProgressionService.notifyLevel(stats.level);
    return StatProgressionService.getState();
  });
  useEffect(() => {
    return StatProgressionService.subscribe((s) => setProgression({ ...s }));
  }, []);

  // Esc / C closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key.toLowerCase() === 'c') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true } as any);
  }, [onClose]);

  return (
    <div className="mp-root">
      <style>{MAINPANEL_CSS}</style>

      {/* TOP BAR */}
      <header className="mp-top">
        <div className="mp-logo">
          <h1>⚔ Grudge Nexus</h1>
          <span className="sub">Main Panel</span>
        </div>
        <div className="mp-top-info">
          <ResourceBars stats={stats} />
          <span className="mp-name">Lv.{stats.level} Survivor</span>
          <button className="mp-close" onClick={onClose} title="Close (C / Esc)">✕</button>
        </div>
      </header>

      {/* MAIN BODY */}
      <div className="mp-body">
        {/* LEFT — sidebar stats */}
        <aside className="mp-left">
          <CharPreview stats={stats} totalStats={totalStats} />
          <SidebarStats primaryStats={primaryStats} progression={progression} />
          <SidebarSurvival stats={stats} />
          <SidebarProgression stats={stats} perksSpent={perksSpent} />
        </aside>

        {/* CENTER — tabs */}
        <main className="mp-center">
          <nav className="mp-tabs">
            {TABS.map((t) => (
              <button
                key={t.id}
                className={`mp-tab ${tab === t.id ? 'active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                <span className="mp-tab-icon">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </nav>
          <div className="mp-content">
            {tab === 'professions' && <ProfessionsTab />}
            {tab === 'stats'       && <StatsTab stats={stats} totalStats={totalStats} primaryStats={primaryStats} perksSpent={perksSpent} progression={progression} />}
            {tab === 'equipment'   && <EquipmentTab bag={bag} equipped={equipped} totalStats={totalStats} onEquip={onEquip} onUnequip={onUnequip} onDrop={onDrop} />}
            {tab === 'quest'       && <QuestTab />}
            {tab === 'skills'      && <SkillsTab perksUnlocked={perksUnlocked} perksSpent={perksSpent} onUnlock={onUnlockPerk} skillPoints={stats.skillPoints} />}
            {tab === 'crafting'    && <CraftingTab stacks={survivalStacks} nearbyStations={nearbyStations} onCraft={onCraft} />}
            {tab === 'friends'     && <FriendsTab />}
            {tab === 'medical'     && <MedicalTab stats={stats} stacks={survivalStacks} onCraft={onCraft} />}
          </div>
        </main>

        {/* RIGHT — inventory or skills mode */}
        <aside className="mp-right">
          <div className="mp-rmode">
            <button
              className={`mp-rmode-btn ${rcolMode === 'inv' ? 'active' : ''}`}
              onClick={() => setRcolMode('inv')}
            >
              🎒 Inventory
            </button>
            <button
              className={`mp-rmode-btn ${rcolMode === 'skills' ? 'active' : ''}`}
              onClick={() => setRcolMode('skills')}
            >
              ⚡ Skills
            </button>
          </div>
          {rcolMode === 'inv' ? (
            <RightInventory bag={bag} bagCap={bagCap} onEquip={onEquip} onDrop={onDrop} />
          ) : (
            <RightSkills abilities={abilities} cooldowns={cooldowns} />
          )}
        </aside>
      </div>

      {/* BOTTOM — hotbar */}
      <footer className="mp-bottom">
        <Hotbar abilities={abilities} cooldowns={cooldowns} />
      </footer>
    </div>
  );
};

// ─── Top-bar resource bars ─────────────────────────────────────────────────
const ResourceBars: React.FC<{ stats: PlayerStats }> = ({ stats }) => {
  const hpPct = (stats.health  / Math.max(stats.maxHealth,  1)) * 100;
  const mpPct = (stats.mana    / Math.max(stats.maxMana,    1)) * 100;
  const spPct = (stats.stamina / Math.max(stats.maxStamina, 1)) * 100;
  return (
    <div className="mp-bars">
      <Bar pct={hpPct} fill="hp" label={`HP ${Math.floor(stats.health)}/${stats.maxHealth}`} />
      <Bar pct={mpPct} fill="mp" label={`MP ${Math.floor(stats.mana)}/${stats.maxMana}`} />
      <Bar pct={spPct} fill="sp" label={`SP ${Math.floor(stats.stamina)}/${stats.maxStamina}`} />
    </div>
  );
};
const Bar: React.FC<{ pct: number; fill: string; label: string }> = ({ pct, fill, label }) => (
  <div className="mp-bar"><div className={`mp-bar-fill ${fill}`} style={{ width: `${pct}%` }} /><span className="mp-bar-lbl">{label}</span></div>
);

// ─── Left sidebar pieces ───────────────────────────────────────────────────
const CharPreview: React.FC<{ stats: PlayerStats; totalStats: ItemStats }> = ({ stats }) => (
  <div className="mp-char-preview">
    <div className="mp-char-silhouette">⚔<br/>Warlord</div>
    <div className="mp-char-lvl">Lv.{stats.level}</div>
  </div>
);

const SidebarStats: React.FC<{
  primaryStats: GrudgeStats;
  progression: StatProgression;
}> = ({ primaryStats, progression }) => (
  <div className="mp-stat-section">
    <h3>
      Grudge Stats
      {progression.freePoints > 0 && (
        <span className="mp-stat-pool" title="Unspent free points — allocate in the Stats tab">
          +{progression.freePoints}
        </span>
      )}
    </h3>
    <div className="mp-grudge-strip">
      {STAT_META.map((meta) => {
        const base = primaryStats[meta.key];
        const bonus = progression.bonusStats[meta.key] ?? 0;
        const eff = Math.min(STAT_MAX, base + bonus);
        return (
          <div key={meta.key} className="mp-grudge-cell" title={`${meta.label} — ${meta.desc}`}>
            <span className="abbr" style={{ color: meta.color, borderColor: meta.color }}>
              {meta.abbr}
            </span>
            <span className="val" style={{ color: eff >= STAT_MAX ? meta.color : undefined }}>
              {eff}
              {bonus > 0 && <span className="bonus"> +{bonus}</span>}
            </span>
          </div>
        );
      })}
    </div>
  </div>
);

const SidebarSurvival: React.FC<{ stats: PlayerStats }> = ({ stats }) => (
  <div className="mp-stat-section">
    <h3>Survival</h3>
    <VitalRow icon="🍗" label="Hunger"  value={stats.hunger}      max={stats.maxHunger}  color="#ff8f00" />
    <VitalRow icon="💧" label="Thirst"  value={stats.thirst}      max={stats.maxThirst}  color="#29b6f6" />
    <VitalRow icon="🌙" label="Rest"    value={stats.fatigue}     max={stats.maxFatigue} color="#a78bfa" />
    <VitalRow
      icon={stats.temperature < 35 ? '🥶' : stats.temperature > 39 ? '🥵' : '🌡️'}
      label="Body Temp"
      value={stats.temperature}
      max={42}
      raw={`${stats.temperature.toFixed(1)}°C`}
      color={stats.temperature < 35 ? '#5a9ad8' : stats.temperature > 39 ? '#ef4444' : '#6ec96e'}
    />
    {(stats.bleeding || stats.infected) && (
      <div className="mp-stat-row mp-warn">
        <span className="k">{stats.bleeding ? '🩸 Bleeding' : '☠ Infected'}</span>
        <span className="v" style={{ color: '#ef4444' }}>!</span>
      </div>
    )}
  </div>
);
const VitalRow: React.FC<{ icon: string; label: string; value: number; max: number; color: string; raw?: string }> = ({
  icon, label, value, max, color, raw,
}) => {
  const pct = Math.max(0, Math.min(100, (value / Math.max(max, 1)) * 100));
  return (
    <div className="mp-vital-row" title={`${label} ${raw ?? `${Math.floor(value)}/${max}`}`}>
      <span className="mp-vital-icon" style={{ color }}>{icon}</span>
      <div className="mp-vital-bar"><div style={{ width: `${pct}%`, background: color }} /></div>
      <span className="mp-vital-num">{raw ?? Math.floor(value)}</span>
    </div>
  );
};

const SidebarProgression: React.FC<{ stats: PlayerStats; perksSpent: Record<StatTrack, number> }> = ({ stats, perksSpent }) => {
  const totalSpent = TRACKS.reduce((a, t) => a + (perksSpent[t] || 0), 0);
  return (
    <div className="mp-stat-section">
      <h3>Progression</h3>
      <div className="mp-stat-row"><span className="k">Level</span><span className="v">{stats.level}</span></div>
      <div className="mp-stat-row"><span className="k">XP</span><span className="v">{stats.experience.toLocaleString()}</span></div>
      <div className="mp-stat-row"><span className="k">Skill Pts</span><span className={`v ${stats.skillPoints > 0 ? 'green' : ''}`}>{stats.skillPoints}</span></div>
      <div className="mp-stat-row"><span className="k">Perks</span><span className="v">{totalSpent} spent</span></div>
    </div>
  );
};

// ─── PROFESSIONS TAB (calculator layout) ───────────────────────────────────
// Master box at the TOP, vertical connector down to the branch row, then
// branches as columns with rank-4 at top → rank-1 just above the branch
// title at the bottom. Mirrors attached Profession Calculator mock.
const ProfessionsTab: React.FC = () => {
  const [picked, setPicked] = useState<Profession>('gathering');
  // Force re-render when ProfessionsService mutates (learn/reset).
  const [, forceTick] = useState(0);
  useEffect(() => {
    return ProfessionsService.subscribe(() => forceTick(t => t + 1));
  }, []);

  const branches = PROFESSION_BRANCHES[picked] || [];
  const master = PROFESSION_MASTERS[picked];
  // ProfessionsService.getXp() returns the *spendable balance* (it is
  // decremented when a skill is learned). To show a meaningful "XP earned"
  // total we add the cost of every already-learned skill back on top.
  const xpAvailable = ProfessionsService.getXp(picked);
  const meta = PROFESSION_META[picked];

  // SP-bar totals for the *current* profession.
  const allSkills = branches.flatMap(b => b.skills);
  const learnedHere = allSkills.filter(s => ProfessionsService.isLearned(s.id)).length;
  const xpSpentHere = allSkills
    .filter(s => ProfessionsService.isLearned(s.id))
    .reduce((sum, s) => sum + (s.cost ?? 0), 0)
    + (master && ProfessionsService.isLearned(master.id) ? master.cost : 0);
  const xpEarned = xpAvailable + xpSpentHere;

  return (
    <>
      <div className="mp-section-title">
        Professions
        <span className="mp-section-meta">{meta.label} · {xpEarned.toLocaleString()} XP earned</span>
      </div>

      {/* SP bar */}
      <div className="mp-sp-bar">
        <div className="mp-sp-cell"><div className="lbl">XP Spent</div><div className="val">{xpSpentHere.toLocaleString()}</div></div>
        <div className="mp-sp-cell"><div className="lbl">XP Available</div><div className="val">{xpAvailable.toLocaleString()}</div></div>
        <div className="mp-sp-cell"><div className="lbl">Skills Unlocked</div><div className="val">{learnedHere} / {allSkills.length + (master ? 1 : 0)}</div></div>
      </div>

      {/* Profession tab strip */}
      <div className="mp-prof-tabs">
        {PROFESSIONS.map((p) => {
          const m = PROFESSION_META[p];
          return (
            <button
              key={p}
              className={`mp-prof-tab ${picked === p ? 'active' : ''}`}
              onClick={() => setPicked(p)}
              style={{ '--prof-color': m.color } as React.CSSProperties}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Calculator tree */}
      <div className="mp-prof-tree">
        {/* Master box at the top, full-width across branches */}
        {master && (() => {
          const mLearned = ProfessionsService.isLearned(master.id);
          const mCan = ProfessionsService.canLearn(master.id);
          return (
            <>
              <div className="mp-prof-master-label">MASTER</div>
              <button
                className={`mp-prof-skill master ${mLearned ? 'learned' : mCan ? 'avail' : 'locked'}`}
                style={{ borderColor: mLearned ? meta.color : undefined }}
                disabled={!mCan || mLearned}
                onClick={() => ProfessionsService.learnSkill(master.id)}
                title={master.desc}
              >
                <div className="skill-rank">★ MASTER</div>
                <div className="skill-name" style={{ color: meta.color }}>👑 {master.name}</div>
                <div className="skill-desc">{master.desc}</div>
                <div className="skill-cost">{mLearned ? '✓ Mastered' : `${master.cost.toLocaleString()} XP`}</div>
              </button>
              <div className="mp-prof-master-connector-row">
                {branches.map(b => (
                  <div key={b.id} className="mp-prof-master-connector-cell">
                    <div className="mp-prof-connector-v" />
                  </div>
                ))}
              </div>
            </>
          );
        })()}

        {/* Branch columns: rank-4 at top → rank-1 at bottom, title at bottom */}
        <div className="mp-prof-branches-row">
          {branches.map((branch) => {
            const sorted = [...branch.skills].sort((a, b) => Number(b.rank) - Number(a.rank));
            return (
              <div key={branch.id} className="mp-prof-branch-col">
                {sorted.map((s, i) => {
                  const learned = ProfessionsService.isLearned(s.id);
                  const canLearn = ProfessionsService.canLearn(s.id);
                  return (
                    <React.Fragment key={s.id}>
                      <button
                        className={`mp-prof-skill ${learned ? 'learned' : canLearn ? 'avail' : 'locked'}`}
                        disabled={!canLearn || learned}
                        onClick={() => ProfessionsService.learnSkill(s.id)}
                        title={s.desc || s.name}
                      >
                        <div className="skill-rank">RANK {s.rank}</div>
                        <div className="skill-name">{s.name}</div>
                        <div className="skill-desc">{s.desc}</div>
                        <div className="skill-cost">{learned ? '✓ learned' : `${s.cost} XP`}</div>
                      </button>
                      {i < sorted.length - 1 && <div className="mp-prof-connector-v" />}
                    </React.Fragment>
                  );
                })}
                <div className="mp-prof-branch-title" style={{ color: meta.color }}>
                  {branch.label}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mp-prof-legend">
          Rank 1 (bottom) → Rank 4 (top) → Master. Earn profession XP through gameplay to unlock skills.
        </div>
      </div>
    </>
  );
};

// ─── STATS TAB (derived) ──────────────────────────────────────────────────
const StatsTab: React.FC<{
  stats: PlayerStats;
  totalStats: ItemStats;
  primaryStats: GrudgeStats;
  perksSpent: Record<StatTrack, number>;
  progression: StatProgression;
}> = ({ stats, totalStats, primaryStats, perksSpent, progression }) => {
  // ── Primary (Grudge) stats summary ────────────────────────────────────────
  const spent = computeSpentPoints(primaryStats);
  const budgetLeft = STARTING_BUDGET - spent;
  // Effective stat = creation value + earned bonus pips, capped at STAT_MAX.
  const effectiveStats: GrudgeStats = STAT_META.reduce((acc, m) => {
    acc[m.key] = Math.min(STAT_MAX, primaryStats[m.key] + (progression.bonusStats[m.key] ?? 0));
    return acc;
  }, { ...primaryStats });

  // Weapon-XP allocation dropdown target.
  const [weaponTarget, setWeaponTarget] = useState<keyof GrudgeStats>('bio');

  // ── Derived combat stats (legacy attrs + gear) ────────────────────────────
  const dmg = (totalStats.damage ?? 0) + Math.floor(stats.strength * 1.25);
  const armor = totalStats.armor ?? 0;
  const crit = totalStats.critChance ?? Math.floor(stats.agility * 0.3);
  const hpRegen = Math.floor(stats.endurance * 0.06 * 10) / 10;
  const mpRegen = Math.floor(stats.intelligence * 0.04 * 10) / 10;
  const moveSpd = (totalStats.moveSpeed ?? 0) + stats.agility * 0.15;
  const atkSpd = (totalStats.attackSpeed ?? 0) + stats.agility * 0.2;

  const ehp = stats.maxHealth * (1 + armor / 100);
  const dps = (dmg + 10) * (1 + (crit / 100) * 1.5);
  const cp = Math.floor(ehp * 0.4 + dps * 2.5 + moveSpd * 5);
  const tier = cp > 5400 ? { name: 'Legendary', color: '#89f7fe' }
             : cp > 3600 ? { name: 'Hero',      color: '#3b82f6' }
             : cp > 2000 ? { name: 'Veteran',   color: '#a855f7' }
             :             { name: 'Greenhorn', color: '#9ca3af' };

  const derived = [
    { k: 'Max HP',        v: `${stats.maxHealth}` },
    { k: 'Max MP',        v: `${stats.maxMana}` },
    { k: 'Max Stamina',   v: `${stats.maxStamina}` },
    { k: 'Damage',        v: `${dmg}` },
    { k: 'Armor',         v: `${armor}` },
    { k: 'Crit Chance',   v: `${crit.toFixed(1)}%` },
    { k: 'Move Speed',    v: `${moveSpd.toFixed(1)}%` },
    { k: 'Atk Speed',     v: `${atkSpd.toFixed(1)}%` },
    { k: 'HP Regen/s',    v: `${hpRegen}` },
    { k: 'MP Regen/s',    v: `${mpRegen}` },
  ];

  // ── XP curve ──────────────────────────────────────────────────────────────
  const xpNeeded = xpForNextLevel(stats.level);
  const xpPct = Math.min(100, (stats.experience / xpNeeded) * 100);

  return (
    <>
      {/* PRIMARY STATS — radar + grid */}
      <div className="mp-section-title">
        Primary Stats <span className="mp-section-meta">8 Grudge Stats — set at character creation</span>
      </div>
      <div className="mp-stats-row">
        <div className="mp-radar-wrap">
          <StatRadarChart stats={effectiveStats} size={240} />
        </div>
        <div className="mp-primary-grid">
          {STAT_META.map((meta) => {
            const k = meta.key;
            const base = primaryStats[k];
            const bonus = progression.bonusStats[k] ?? 0;
            const eff = Math.min(STAT_MAX, base + bonus);
            const next = eff >= STAT_MAX ? 0 : costForNext(eff);
            const bank = progression.statBank[k] ?? 0;
            const bankPct = next > 0 ? Math.min(100, (bank / next) * 100) : 100;
            const canAfford = progression.freePoints >= 1 && eff < STAT_MAX;
            // STAT_MILESTONE_PERKS[k] is positional: index 0 unlocks at value 1,
            // so the next milestone for current effective value `eff` is at index eff.
            const milestones = STAT_MILESTONE_PERKS[k] ?? [];
            const nextMilestone = eff < milestones.length ? milestones[eff] : null;
            return (
              <div key={k} className="mp-primary-cell" style={{ borderColor: `${meta.color}55` }}>
                <div className="mp-primary-head">
                  <span className="abbr" style={{ background: meta.color }}>{meta.abbr}</span>
                  <span className="name">{meta.label}</span>
                  <span className="val" style={{ color: eff >= STAT_MAX ? meta.color : '#d4a400' }}>
                    {eff}<span className="cap">/{STAT_MAX}</span>
                    {bonus > 0 && <span className="delta"> (+{bonus})</span>}
                  </span>
                  <button
                    className="mp-primary-plus"
                    disabled={!canAfford}
                    onClick={() => StatProgressionService.spendFreePointOn(primaryStats, k)}
                    title={
                      eff >= STAT_MAX
                        ? 'Maxed'
                        : !canAfford
                          ? 'No free points — earn one per character level-up'
                          : `Spend 1 free point (need ${next} banked to promote)`
                    }
                  >+</button>
                </div>
                <div className="mp-primary-tag">{meta.desc}</div>
                {next > 0 && (
                  <div className="mp-primary-bank" title={`${bank} / ${next} points banked toward next pip`}>
                    <div className="bar"><div style={{ width: `${bankPct}%`, background: meta.color }} /></div>
                    <span>{bank}/{next}</span>
                  </div>
                )}
                <div className="mp-primary-foot">
                  {eff >= STAT_MAX
                    ? <span className="ok">MAXED</span>
                    : <span>Next pip cost: <b>{next}</b> pt{next === 1 ? '' : 's'}</span>}
                  {nextMilestone && (
                    <span className="milestone" title={nextMilestone.perkDesc}>
                      → {nextMilestone.icon} {nextMilestone.perkName} @ {eff + 1}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ALLOCATION — free points + weapon XP */}
      <div className="mp-section-title" style={{ marginTop: 18 }}>
        Stat Allocation <span className="mp-section-meta">spend points · convert weapon XP</span>
      </div>
      <div className="mp-alloc-grid">
        <div className="mp-alloc-card">
          <div className="lbl">Free Points</div>
          <div className="big">{progression.freePoints}</div>
          <div className="sub">+1 per character level (Lv.{stats.level})</div>
          <div className="hint">Click <b>+</b> on any stat above to spend a point. The point goes into that stat's bank — once the bank covers the next pip's cost, the pip auto-promotes.</div>
        </div>
        <div className="mp-alloc-card">
          <div className="lbl">Weapon XP</div>
          <div className="big">{progression.weaponXp}</div>
          <div className="sub">{WEAPON_XP_PER_POINT} XP = 1 banked stat point</div>
          <div className="mp-alloc-row">
            <select
              className="mp-alloc-select"
              value={weaponTarget}
              onChange={(e) => setWeaponTarget(e.target.value as keyof GrudgeStats)}
            >
              {STAT_META.map((m) => (
                <option key={m.key} value={m.key}>{m.abbr} — {m.label}</option>
              ))}
            </select>
            <button
              className="mp-btn"
              disabled={progression.weaponXp < WEAPON_XP_PER_POINT
                || effectiveStats[weaponTarget] >= STAT_MAX}
              onClick={() => StatProgressionService.applyWeaponXpToStat(primaryStats, weaponTarget)}
              title={`Burn ${WEAPON_XP_PER_POINT} weapon XP → +1 banked point on ${STAT_META.find((m) => m.key === weaponTarget)?.abbr}`}
            >Apply {WEAPON_XP_PER_POINT}</button>
            <button
              className="mp-btn ghost"
              disabled={progression.weaponXp < WEAPON_XP_PER_POINT
                || effectiveStats[weaponTarget] >= STAT_MAX}
              onClick={() => StatProgressionService.applyAllWeaponXpToStat(primaryStats, weaponTarget)}
              title="Apply every available 100-XP chunk to the selected stat"
            >Apply All</button>
          </div>
          <div className="hint">Earned passively from kills (basic +10, elite +25, boss +60). Future activities — crafting, harvesting, missions — will award stat-routed XP automatically.</div>
        </div>
      </div>

      {/* COMBAT POWER */}
      <div className="mp-section-title" style={{ marginTop: 18 }}>Combat Power</div>
      <div className="mp-cp-grid">
        <div className="mp-cp-card">
          <div className="lbl">Combat Power</div>
          <div className="big" style={{ color: '#d4a400' }}>{cp.toLocaleString()}</div>
          <div className="sub" style={{ color: tier.color }}>{tier.name}</div>
        </div>
        <div className="mp-cp-card">
          <div className="lbl">Effective HP</div>
          <div className="big">{Math.floor(ehp).toLocaleString()}</div>
          <div className="sub">vs physical</div>
        </div>
        <div className="mp-cp-card">
          <div className="lbl">DPS Estimate</div>
          <div className="big">{Math.floor(dps).toLocaleString()}</div>
          <div className="sub">unarmored target</div>
        </div>
      </div>

      {/* DERIVED COMBAT */}
      <div className="mp-section-title" style={{ marginTop: 18 }}>Derived Combat Stats</div>
      <div className="mp-stat-grid">
        {derived.map((d) => (
          <div key={d.k} className="mp-stat-cell">
            <div className="lbl">{d.k}</div>
            <div className="val">{d.v}</div>
          </div>
        ))}
      </div>

      {/* PROGRESSION */}
      <div className="mp-section-title" style={{ marginTop: 18 }}>
        Progression <span className="mp-section-meta">XP curve, perk thresholds, point budget</span>
      </div>
      <div className="mp-prog-card">
        <div className="mp-prog-head">
          <div>
            <div className="lbl">Survivor Level</div>
            <div className="big">Lv.{stats.level}</div>
          </div>
          <div style={{ flex: 1 }}>
            <div className="mp-prog-xpbar"><div style={{ width: `${xpPct}%` }} /></div>
            <div className="mp-prog-xptext">
              {Math.floor(stats.experience).toLocaleString()} / {xpNeeded.toLocaleString()} XP
              <span className="muted"> (needed for Lv.{stats.level + 1})</span>
            </div>
          </div>
          <div>
            <div className="lbl">Skill Points</div>
            <div className="big">{stats.skillPoints}</div>
          </div>
        </div>
        <div className="mp-prog-note">
          Each level grants <b>+1 skill point</b>, <b>+{LEVEL_HP_GAIN} max HP</b>,
          <b> +{LEVEL_MP_GAIN} max MP</b>. XP needed for the next level scales linearly:
          <code> level × {LEVEL_XP_BASE}</code>.
        </div>

        <div className="mp-prog-sub">Perk Tracks (skill points spent)</div>
        <div className="mp-prog-tracks">
          {(Object.keys(perksSpent) as StatTrack[]).map((t) => {
            const pts = perksSpent[t] ?? 0;
            const nextTier = PERK_TIERS.find((tt) => pts < tt.pts);
            return (
              <div key={t} className="mp-prog-track">
                <span className="name" style={{ color: TRACK_COLOR[t] }}>{t.toUpperCase()}</span>
                <span className="pts">{pts} pts</span>
                <span className="next">
                  {nextTier
                    ? `→ Tier ${nextTier.tier} ${nextTier.name} @ ${nextTier.pts}`
                    : 'all tiers unlocked'}
                </span>
              </div>
            );
          })}
        </div>
        <div className="mp-prog-sub">Tier Thresholds</div>
        <div className="mp-prog-tiers">
          {PERK_TIERS.map((t) => (
            <div key={t.tier} className="mp-prog-tier">
              <span className="t">T{t.tier}</span>
              <span className="n">{t.name}</span>
              <span className="p">{t.pts} pts</span>
            </div>
          ))}
        </div>

        <div className="mp-prog-sub">
          Primary Stat Cost Curve <span className="muted">(used during character creation)</span>
        </div>
        <div className="mp-prog-cost">
          {STAT_COST.map((c, i) => (
            <div key={i} className="mp-prog-cost-cell">
              <div className="lvl">Lv {i}</div>
              <div className="cost">{c}</div>
            </div>
          ))}
        </div>
        <div className="mp-prog-budget">
          Creation budget: <b>{spent}</b> / {STARTING_BUDGET} spent
          {budgetLeft > 0 && <span className="warn"> · {budgetLeft} unspent</span>}
        </div>
      </div>

      {/* LEGACY ATTRIBUTES — fed into combat math until the new system replaces it */}
      <div className="mp-section-title" style={{ marginTop: 18 }}>
        Legacy Combat Attributes <span className="mp-section-meta">drives current weapon math</span>
      </div>
      <div className="mp-stat-grid">
        <div className="mp-stat-cell"><div className="lbl">💪 Strength</div><div className="val">{stats.strength}{totalStats.strength ? ` (+${totalStats.strength})` : ''}</div><div className="sub">+1.25 dmg / pt</div></div>
        <div className="mp-stat-cell"><div className="lbl">⚡ Agility</div><div className="val">{stats.agility}{totalStats.agility ? ` (+${totalStats.agility})` : ''}</div><div className="sub">+0.3% crit, +0.15% mv</div></div>
        <div className="mp-stat-cell"><div className="lbl">🧠 Intelligence</div><div className="val">{stats.intelligence}{totalStats.intelligence ? ` (+${totalStats.intelligence})` : ''}</div><div className="sub">+0.04 MP regen/s</div></div>
        <div className="mp-stat-cell"><div className="lbl">🛡 Endurance</div><div className="val">{stats.endurance}{totalStats.endurance ? ` (+${totalStats.endurance})` : ''}</div><div className="sub">+0.06 HP regen/s</div></div>
      </div>
    </>
  );
};

// ─── EQUIPMENT TAB ────────────────────────────────────────────────────────
const EquipmentTab: React.FC<{
  bag: InventoryItem[]; equipped: EquippedSet; totalStats: ItemStats;
  onEquip: (uid: string) => void; onUnequip: (slot: EquipSlot) => void; onDrop: (uid: string) => void;
}> = ({ bag, equipped, totalStats, onEquip, onUnequip, onDrop }) => {
  const slotCard = (s: { slot: EquipSlot; label: string; icon: string }) => {
    const item = equipped[s.slot];
    const def = item ? ITEM_DATABASE[item.defId] : null;
    return (
      <div
        key={s.slot}
        className="mp-eq-slot"
        style={{ borderColor: def ? RARITY_HEX[def.rarity] : '#3a2a18' }}
        onClick={() => def && onUnequip(s.slot)}
        title={def ? `${def.name} — click to unequip` : s.label}
      >
        <div className="icon">{def?.icon ?? s.icon}</div>
        <div className="cat">{s.label}</div>
        {def && <div className="ename" style={{ color: RARITY_HEX[def.rarity] }}>{def.name}</div>}
      </div>
    );
  };
  const main = equipped.mainhand;
  const mainDef = main ? ITEM_DATABASE[main.defId] : null;

  return (
    <>
      <div className="mp-section-title">Equipment Loadout</div>
      <div className="mp-equip-layout">
        <div className="mp-equip-stack">{EQUIP_LEFT.map(slotCard)}</div>
        <div className="mp-equip-center">
          <div
            className="mp-eq-mainhand"
            onClick={() => main && onUnequip('mainhand')}
            title={mainDef ? `${mainDef.name} — click to unequip` : 'Main Hand'}
            style={{ borderColor: mainDef ? RARITY_HEX[mainDef.rarity] : '#3a2a18' }}
          >
            <div className="icon">{mainDef?.icon ?? '⚔'}</div>
            <div className="cat">Main Hand</div>
            {mainDef && <div className="ename" style={{ color: RARITY_HEX[mainDef.rarity] }}>{mainDef.name}</div>}
          </div>
        </div>
        <div className="mp-equip-stack">{EQUIP_RIGHT.map(slotCard)}</div>
      </div>

      <div className="mp-section-title" style={{ marginTop: 14 }}>Bonuses from Equipped Gear</div>
      <div className="mp-stat-grid">
        {Object.entries(totalStats).filter(([, v]) => (v as number) !== 0).map(([k, v]) => (
          <div key={k} className="mp-stat-cell">
            <div className="lbl">{k}</div>
            <div className="val" style={{ color: '#69f0ae' }}>+{v as number}</div>
          </div>
        ))}
        {Object.values(totalStats).every((v) => !v) && (
          <div className="mp-stat-cell" style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#888' }}>
            No gear equipped — pick something from your bag to the right.
          </div>
        )}
      </div>

      <div className="mp-section-title" style={{ marginTop: 14 }}>Bag — Equippable</div>
      <div className="mp-bag-list">
        {bag.filter((i) => ITEM_DATABASE[i.defId]?.slot).map((i) => {
          const def = ITEM_DATABASE[i.defId]; if (!def) return null;
          return (
            <div key={i.uid} className="mp-bag-row" style={{ borderLeft: `3px solid ${RARITY_HEX[def.rarity]}` }}>
              <span className="ico">{def.icon}</span>
              <span className="name" style={{ color: RARITY_HEX[def.rarity] }}>{def.name}</span>
              <span className="slot">{def.slot}</span>
              <button className="mp-btn" onClick={() => onEquip(i.uid)}>Equip</button>
              <button className="mp-btn ghost" onClick={() => onDrop(i.uid)}>Drop</button>
            </div>
          );
        })}
        {bag.filter((i) => ITEM_DATABASE[i.defId]?.slot).length === 0 && (
          <div className="mp-empty">No equippable items in bag.</div>
        )}
      </div>
    </>
  );
};

// ─── QUEST TAB ────────────────────────────────────────────────────────────
const QuestTab: React.FC = () => (
  <>
    <div className="mp-section-title">Active Quests</div>
    {SAMPLE_QUESTS.map((q, i) => (
      <div key={i} className="mp-quest">
        <div className="head">
          <div className="title">{q.title}</div>
          <div className="pct">{q.progress}%</div>
        </div>
        <div className="desc">{q.desc}</div>
        <div className="bar"><div style={{ width: `${q.progress}%` }} /></div>
        <div className="reward">⚜ {q.reward}</div>
      </div>
    ))}
    <div className="mp-empty" style={{ marginTop: 14 }}>
      Quests coming soon — full questline system is in development.
    </div>
  </>
);

// ─── SKILLS / PERKS TAB ───────────────────────────────────────────────────
const SkillsTab: React.FC<{
  perksUnlocked: Set<string>;
  perksSpent: Record<StatTrack, number>;
  onUnlock: (perkId: string, track: StatTrack) => void;
  skillPoints: number;
}> = ({ perksUnlocked, perksSpent, onUnlock, skillPoints }) => {
  const [track, setTrack] = useState<StatTrack>('hero');
  const perks = ALL_PERKS[track] ?? [];
  const tiers = [1, 2, 3, 4, 5] as const;

  return (
    <>
      <div className="mp-section-title">
        Skills & Perks
        <span className="mp-section-meta">{skillPoints} pts available · {perksSpent[track]} in {track}</span>
      </div>
      <div className="mp-perk-tracks">
        {TRACKS.map((t) => (
          <button
            key={t}
            className={`mp-perk-track ${track === t ? 'active' : ''}`}
            style={{ '--track-color': TRACK_COLOR[t] } as React.CSSProperties}
            onClick={() => setTrack(t)}
          >
            <div className="name">{t.toUpperCase()}</div>
            <div className="pts">{perksSpent[t]} pts</div>
          </button>
        ))}
      </div>
      {tiers.map((tier) => {
        const tperks = perks.filter((p) => p.tier === tier);
        if (tperks.length === 0) return null;
        return (
          <div key={tier} className="mp-perk-tier">
            <div className="mp-perk-tier-name" style={{ color: TRACK_COLOR[track] }}>Tier {tier}</div>
            <div className="mp-perk-grid">
              {tperks.map((p) => {
                const unlocked = perksUnlocked.has(p.id);
                const meets = p.requires.every((r) => (perksSpent[r.track] || 0) >= r.points);
                const canUnlock = !unlocked && meets && skillPoints > 0;
                return (
                  <button
                    key={p.id}
                    className={`mp-perk ${unlocked ? 'unlocked' : meets ? 'avail' : 'locked'}`}
                    disabled={!canUnlock}
                    onClick={() => onUnlock(p.id, p.requires[0].track)}
                    title={p.description}
                    style={{ borderColor: unlocked ? TRACK_COLOR[track] : '#3a2a18' }}
                  >
                    <img src={p.icon} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                    <div className="name">{p.name}</div>
                    <div className="desc">{p.description}</div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
};

// ─── CRAFTING TAB (folded in) ─────────────────────────────────────────────
const CraftingTab: React.FC<{
  stacks: Array<{ itemId: string; count: number }>;
  nearbyStations: CraftingStation[];
  onCraft: (recipeId: string) => void;
}> = ({ stacks, nearbyStations, onCraft }) => {
  const STATIONS: CraftingStation[] = ['none', 'campfire', 'cooking_rack', 'workbench', 'drying_rack'];
  const [filter, setFilter] = useState<'all' | CraftingStation>('all');

  const canMake = (r: Recipe) => {
    for (const i of r.inputs) {
      const have = stacks.find((s) => s.itemId === i.itemId)?.count ?? 0;
      if (i.qty === 0 ? have <= 0 : have < i.qty) return false;
    }
    return true;
  };
  const stationOk = (s: CraftingStation) => s === 'none' || nearbyStations.includes(s);
  const visible = filter === 'all' ? RECIPES : RECIPES.filter((r) => r.station === filter);

  return (
    <>
      <div className="mp-section-title">
        Crafting
        <span className="mp-section-meta">Near: {nearbyStations.length ? nearbyStations.join(', ') : 'nothing'}</span>
      </div>
      <div className="mp-craft-filters">
        <button className={`mp-pill ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>All</button>
        {STATIONS.map((s) => (
          <button
            key={s}
            className={`mp-pill ${filter === s ? 'active' : ''} ${stationOk(s) ? '' : 'dim'}`}
            onClick={() => setFilter(s)}
          >
            {s === 'none' ? 'Hand' : s.replace('_', ' ')}
          </button>
        ))}
      </div>
      <div className="mp-recipes">
        {visible.map((r) => {
          const ok = canMake(r) && stationOk(r.station);
          const iconDef = SURVIVAL_ITEMS[r.iconItemId];
          return (
            <div key={r.id} className="mp-recipe" style={{ opacity: stationOk(r.station) ? 1 : 0.45 }}>
              <div className="ico">{iconDef?.icon ?? '?'}</div>
              <div className="info">
                <div className="name">{r.name}</div>
                <div className="desc">{r.description}</div>
                <div className="inputs">
                  {r.inputs.map((i) => {
                    const def = SURVIVAL_ITEMS[i.itemId];
                    const have = stacks.find((s) => s.itemId === i.itemId)?.count ?? 0;
                    const need = i.qty || 1;
                    const inOk = i.qty === 0 ? have > 0 : have >= i.qty;
                    return (
                      <span key={i.itemId} className={`tag ${inOk ? 'ok' : 'bad'}`}>
                        {def?.icon ?? '·'} {def?.name ?? i.itemId} {have}/{need}
                      </span>
                    );
                  })}
                </div>
              </div>
              <button className="mp-btn primary" disabled={!ok} onClick={() => onCraft(r.id)}>Craft</button>
            </div>
          );
        })}
      </div>
    </>
  );
};

// ─── FRIENDS TAB ──────────────────────────────────────────────────────────
const FriendsTab: React.FC = () => (
  <>
    <div className="mp-section-title">Friends</div>
    <div className="mp-friends">
      {SAMPLE_FRIENDS.map((f) => (
        <div key={f.name} className={`mp-friend ${f.online ? '' : 'offline'}`}>
          <div className="dot" style={{ background: f.online ? '#6ec96e' : '#555' }} />
          <div className="info">
            <div className="name">{f.name}</div>
            <div className="status">{f.online ? f.status : 'Offline'}</div>
          </div>
          <div className="lvl">Lv.{f.level}</div>
          <button className="mp-btn ghost" disabled={!f.online}>Whisper</button>
        </div>
      ))}
    </div>
    <div className="mp-empty" style={{ marginTop: 14 }}>
      Multiplayer not yet enabled — this list is a preview of the upcoming friends system.
    </div>
  </>
);

// ─── MEDICAL TAB ──────────────────────────────────────────────────────────
const MedicalTab: React.FC<{
  stats: PlayerStats;
  stacks: Array<{ itemId: string; count: number }>;
  onCraft: (recipeId: string) => void;
}> = ({ stats, stacks, onCraft }) => {
  const conditions: { label: string; bad: boolean; detail: string; remedy?: string }[] = [
    { label: 'Hunger',    bad: stats.hunger < 30,    detail: `${Math.floor(stats.hunger)}/${stats.maxHunger}`, remedy: 'Eat any food (rations, cooked meat).' },
    { label: 'Thirst',    bad: stats.thirst < 30,    detail: `${Math.floor(stats.thirst)}/${stats.maxThirst}`, remedy: 'Drink water — boil tainted sources first.' },
    { label: 'Body Temp', bad: stats.temperature < 35 || stats.temperature > 39, detail: `${stats.temperature.toFixed(1)}°C`, remedy: 'Warm by fire / cool with shade & water.' },
    { label: 'Fatigue',   bad: stats.fatigue < 30,   detail: `${Math.floor(stats.fatigue)}/${stats.maxFatigue}`, remedy: 'Sleep in a bed or campfire.' },
    { label: 'Bleeding',  bad: stats.bleeding,       detail: stats.bleeding ? 'YES' : 'No',                     remedy: 'Apply a bandage — craft from cloth.' },
    { label: 'Infection', bad: stats.infected,       detail: stats.infected ? 'YES' : 'No',                     remedy: 'Antibiotics or boiled herbal salve.' },
  ];

  // Surface medical-relevant recipes (bandages, salves, cooked food)
  const medRecipes = RECIPES.filter((r) =>
    /bandage|salve|antiseptic|cooked|stew|tea|tonic|broth/i.test(r.name + r.description)
  );

  return (
    <>
      <div className="mp-section-title">Medical</div>
      <div className="mp-stat-grid">
        {conditions.map((c) => (
          <div key={c.label} className={`mp-stat-cell ${c.bad ? 'bad' : ''}`}>
            <div className="lbl">{c.label}</div>
            <div className="val" style={{ color: c.bad ? '#ef4444' : '#69f0ae' }}>{c.detail}</div>
            {c.remedy && <div className="sub">{c.remedy}</div>}
          </div>
        ))}
      </div>
      {medRecipes.length > 0 && (
        <>
          <div className="mp-section-title" style={{ marginTop: 14 }}>Field Medicine — Quick Craft</div>
          <div className="mp-recipes">
            {medRecipes.map((r) => {
              const ok = r.inputs.every((i) => {
                const have = stacks.find((s) => s.itemId === i.itemId)?.count ?? 0;
                return i.qty === 0 ? have > 0 : have >= i.qty;
              });
              const iconDef = SURVIVAL_ITEMS[r.iconItemId];
              return (
                <div key={r.id} className="mp-recipe">
                  <div className="ico">{iconDef?.icon ?? '🧪'}</div>
                  <div className="info">
                    <div className="name">{r.name}</div>
                    <div className="desc">{r.description}</div>
                  </div>
                  <button className="mp-btn primary" disabled={!ok} onClick={() => onCraft(r.id)}>Craft</button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
};

// ─── RIGHT COLUMN ─────────────────────────────────────────────────────────
const RightInventory: React.FC<{
  bag: InventoryItem[]; bagCap: number;
  onEquip: (uid: string) => void; onDrop: (uid: string) => void;
}> = ({ bag, bagCap, onEquip, onDrop }) => {
  const [hover, setHover] = useState<InventoryItem | null>(null);
  const slots = Array.from({ length: bagCap }, (_, i) => bag[i] ?? null);
  return (
    <>
      <div className="mp-inv-head">
        <h3>Inventory</h3>
        <span className="cap">{bag.length}/{bagCap}</span>
      </div>
      <div className="mp-inv-grid">
        {slots.map((it, i) => {
          const def = it ? ITEM_DATABASE[it.defId] : null;
          return (
            <div
              key={i}
              className={`mp-inv-cell ${def ? 'filled' : ''}`}
              style={{ borderColor: def ? RARITY_HEX[def.rarity] : '#2a1a0a' }}
              onClick={() => it && def?.slot && onEquip(it.uid)}
              onMouseEnter={() => setHover(it)}
              onMouseLeave={() => setHover(null)}
              title={def ? `${def.name} — ${def.description}` : ''}
            >
              {def && <span className="ico">{def.icon}</span>}
            </div>
          );
        })}
      </div>
      {hover && ITEM_DATABASE[hover.defId] && (
        <div className="mp-inv-tooltip">
          <div className="name" style={{ color: RARITY_HEX[ITEM_DATABASE[hover.defId].rarity] }}>
            {ITEM_DATABASE[hover.defId].name}
          </div>
          <div className="desc">{ITEM_DATABASE[hover.defId].description}</div>
          {ITEM_DATABASE[hover.defId].slot && (
            <button className="mp-btn ghost" onClick={() => onDrop(hover.uid)} style={{ marginTop: 6 }}>
              Drop
            </button>
          )}
        </div>
      )}
      <div className="mp-trash">🗑 Drop slot — click an item then "Drop"</div>
    </>
  );
};

const RightSkills: React.FC<{ abilities: AbilityDef[]; cooldowns: Record<string, number> }> = ({ abilities, cooldowns }) => (
  <>
    <div className="mp-inv-head"><h3>Active Skills</h3><span className="cap">{abilities.filter((a) => a.unlocked).length}/{abilities.length}</span></div>
    <div className="mp-skill-grid">
      {abilities.map((a, i) => {
        const cd = cooldowns[a.id] || 0;
        return (
          <div
            key={a.id}
            className={`mp-skill-cell ${a.unlocked ? 'on' : 'off'}`}
            title={`${a.name}\n${a.description}\nCD: ${a.cooldown}s · MP: ${a.manaCost}`}
          >
            <span className="num">{i + 1}</span>
            <span className="ico">{a.icon}</span>
            <span className="name">{a.name}</span>
            {cd > 0 && <span className="cd">{cd.toFixed(1)}s</span>}
          </div>
        );
      })}
    </div>
  </>
);

// ─── BOTTOM HOTBAR ────────────────────────────────────────────────────────
const Hotbar: React.FC<{ abilities: AbilityDef[]; cooldowns: Record<string, number> }> = ({ abilities, cooldowns }) => {
  const slots = Array.from({ length: 8 }, (_, i) => abilities[i] ?? null);
  return (
    <div className="mp-hotbar">
      {slots.map((a, i) => {
        const cd = a ? cooldowns[a.id] || 0 : 0;
        return (
          <div key={i} className={`mp-hot ${a?.unlocked ? 'on' : 'off'}`}>
            <span className="key">{i + 1}</span>
            {a && <span className="ico">{a.icon}</span>}
            {a && cd > 0 && <span className="cd">{cd.toFixed(1)}</span>}
          </div>
        );
      })}
    </div>
  );
};

// ─── STYLES ───────────────────────────────────────────────────────────────
const MAINPANEL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Crimson+Text:wght@400;600&family=JetBrains+Mono:wght@400;600&display=swap');

.mp-root {
  position: fixed; inset: 0; z-index: 9999;
  display: flex; flex-direction: column;
  background: radial-gradient(ellipse at center, #1a120c 0%, #0a0604 100%);
  color: #f5e2c1; font-family: 'Crimson Text', serif;
  --gold: #d4a400; --gold-strong: #f5c542; --border: #c9950a;
  --border-dim: #3a2a18; --panel: #1a120c; --panel-2: #221710;
  --muted: #8a7a5e; --dim: #5a4a30; --green: #6ec96e; --red: #d45050;
  --font-display: 'Cinzel', serif; --font-mono: 'JetBrains Mono', monospace;
}

/* TOP BAR */
.mp-top {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 18px; background: linear-gradient(180deg, #2a1a0e, #1a120c);
  border-bottom: 2px solid var(--border); flex-shrink: 0;
}
.mp-logo h1 {
  margin: 0; font-family: var(--font-display); font-size: 22px; font-weight: 700;
  color: var(--gold-strong); letter-spacing: 2px;
  text-shadow: 0 0 10px rgba(212,164,0,0.4);
}
.mp-logo .sub { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 3px; }
.mp-top-info { display: flex; align-items: center; gap: 16px; }
.mp-bars { display: flex; gap: 8px; }
.mp-bar { position: relative; width: 140px; height: 18px;
  background: #0a0604; border: 1px solid var(--border-dim); border-radius: 3px; overflow: hidden; }
.mp-bar-fill { height: 100%; transition: width 0.2s; }
.mp-bar-fill.hp { background: linear-gradient(90deg, #8b1a1a, #d44040); }
.mp-bar-fill.mp { background: linear-gradient(90deg, #1a4a8b, #4080d4); }
.mp-bar-fill.sp { background: linear-gradient(90deg, #8b6a1a, #d4a040); }
.mp-bar-lbl { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font-family: var(--font-mono); font-size: 10px; color: #fff; text-shadow: 0 0 3px #000; }
.mp-name { font-family: var(--font-display); font-size: 12px; color: var(--gold); letter-spacing: 1px; }
.mp-close {
  background: transparent; border: 1px solid var(--border); color: var(--gold);
  width: 32px; height: 32px; cursor: pointer; border-radius: 3px;
  font-size: 16px; transition: 0.15s;
}
.mp-close:hover { background: var(--gold); color: #0a0604; }

/* BODY: 3-column */
.mp-body { flex: 1; display: grid; grid-template-columns: 240px 1fr 280px; gap: 0; min-height: 0; }
.mp-left, .mp-right { background: var(--panel); border-right: 1px solid var(--border-dim); padding: 12px;
  overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
.mp-right { border-right: none; border-left: 1px solid var(--border-dim); }
.mp-center { display: flex; flex-direction: column; min-height: 0; }

/* LEFT */
.mp-char-preview {
  height: 140px; background: linear-gradient(135deg, #2a1a0e, #1a0f08);
  border: 2px solid var(--border-dim); border-radius: 6px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  position: relative; overflow: hidden;
}
.mp-char-silhouette { font-family: var(--font-display); color: var(--gold-strong);
  text-align: center; font-size: 14px; letter-spacing: 2px; }
.mp-char-silhouette::first-line { font-size: 36px; }
.mp-char-lvl { position: absolute; bottom: 6px; right: 8px;
  font-family: var(--font-mono); font-size: 10px; color: var(--gold); }

.mp-stat-section { background: var(--panel-2); border: 1px solid var(--border-dim);
  border-radius: 4px; padding: 10px; }
.mp-stat-section h3 { margin: 0 0 8px; font-family: var(--font-display);
  font-size: 11px; color: var(--gold-strong); text-transform: uppercase;
  letter-spacing: 2px; border-bottom: 1px solid var(--border-dim); padding-bottom: 4px; }
.mp-stat-row { display: flex; justify-content: space-between; align-items: center;
  font-size: 12px; padding: 3px 0; }
.mp-stat-row .k { color: var(--muted); }
.mp-stat-row .v { font-family: var(--font-mono); font-weight: 600; color: var(--gold-strong); }
.mp-stat-row .v.green { color: var(--green); }
.mp-stat-row .v .bonus { color: var(--green); font-size: 10px; margin-left: 3px; }
.mp-stat-row.mp-warn { color: var(--red); animation: pulse 2s infinite; }
@keyframes pulse { 50% { opacity: 0.6; } }

.mp-vital-row { display: flex; align-items: center; gap: 6px; padding: 3px 0; }
.mp-vital-icon { font-size: 14px; width: 18px; text-align: center; }
.mp-vital-bar { flex: 1; height: 8px; background: #0a0604; border: 1px solid var(--border-dim);
  border-radius: 2px; overflow: hidden; }
.mp-vital-bar div { height: 100%; transition: width 0.3s; }
.mp-vital-num { font-family: var(--font-mono); font-size: 10px; color: var(--gold); min-width: 38px; text-align: right; }

/* CENTER — TABS */
.mp-tabs { display: flex; gap: 0; background: var(--panel);
  border-bottom: 2px solid var(--border); flex-shrink: 0; overflow-x: auto; }
.mp-tab { flex: 1; min-width: 100px; padding: 12px 8px; background: transparent;
  border: 0; border-right: 1px solid var(--border-dim); cursor: pointer;
  color: var(--muted); font-family: var(--font-display); font-size: 11px;
  text-transform: uppercase; letter-spacing: 1.2px; transition: 0.15s;
  display: flex; flex-direction: column; align-items: center; gap: 4px;
}
.mp-tab:hover { color: var(--gold-strong); background: rgba(212,164,0,0.05); }
.mp-tab.active { color: var(--gold-strong); background: rgba(212,164,0,0.1);
  border-bottom: 2px solid var(--gold); margin-bottom: -2px; }
.mp-tab-icon { font-size: 16px; }

.mp-content { flex: 1; padding: 18px; overflow-y: auto; min-height: 0;
  background: linear-gradient(180deg, #1a120c 0%, #14090a 100%); }
.mp-section-title { font-family: var(--font-display); font-size: 14px;
  color: var(--gold-strong); text-transform: uppercase; letter-spacing: 2.5px;
  border-bottom: 1px solid var(--border-dim); padding-bottom: 6px; margin-bottom: 12px;
  display: flex; align-items: center; justify-content: space-between; }
.mp-section-meta { font-family: var(--font-mono); font-size: 10px; color: var(--muted); text-transform: none; letter-spacing: 0.5px; }

/* PROFESSIONS — calculator tree (rank-1 bottom → rank-4 top → master) */
.mp-sp-bar { display: flex; gap: 18px; padding: 10px 14px; margin-bottom: 12px;
  background: #0e0c07; border: 1px solid #3a2f10; border-radius: 4px; flex-wrap: wrap; }
.mp-sp-cell .lbl { font-family: var(--font-display); font-size: 9px;
  color: var(--muted); text-transform: uppercase; letter-spacing: 1.5px; }
.mp-sp-cell .val { font-family: var(--font-mono); font-size: 18px;
  color: var(--gold-strong); font-weight: 700; }

.mp-prof-tabs { display: flex; gap: 0; flex-wrap: wrap;
  border-bottom: 1px solid #3a2f10; background: #0e0c07; margin-bottom: 16px; }
.mp-prof-tab { padding: 6px 14px; border: 1px solid #4a3a1a; background: #12100a;
  color: #c8b97a; font-family: var(--font-display); font-size: 10px;
  letter-spacing: 1.5px; text-transform: uppercase; cursor: pointer;
  transition: all .15s; white-space: nowrap; }
.mp-prof-tab:hover { background: #2a1f08; border-color: var(--prof-color, var(--gold));
  color: var(--gold-strong); }
.mp-prof-tab.active { background: #2a1f08; border-color: var(--prof-color, var(--gold));
  color: var(--gold-strong);
  box-shadow: 0 0 6px color-mix(in srgb, var(--prof-color, var(--gold)) 30%, transparent); }

.mp-prof-tree { display: flex; flex-direction: column; align-items: stretch;
  overflow-x: auto; padding: 4px; }
.mp-prof-master-label { font-size: 10px; color: #664422; text-align: center;
  margin-bottom: 4px; font-family: var(--font-display); letter-spacing: 2px; }
.mp-prof-master-connector-row { display: flex; gap: 6px; justify-content: center;
  margin: 0; }
.mp-prof-master-connector-cell { width: 148px; display: flex; justify-content: center;
  flex-shrink: 0; }
.mp-prof-connector-v { width: 2px; height: 12px; background: #3a2f10; flex-shrink: 0; }
.mp-prof-branches-row { display: flex; gap: 6px; justify-content: center; }
.mp-prof-branch-col { display: flex; flex-direction: column; align-items: center;
  width: 148px; flex-shrink: 0; }
.mp-prof-branch-title { background: #1e1608; border: 1px solid #3a2f10;
  padding: 5px 8px; font-family: var(--font-display); font-weight: 700;
  font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase;
  text-align: center; width: 100%; flex-shrink: 0; margin-top: auto; }

/* skill boxes */
.mp-prof-skill { padding: 6px 8px; background: #120f07; border: 1px solid #2a2210;
  cursor: pointer; transition: all .15s; position: relative; font-size: 10px;
  width: 148px; flex-shrink: 0; text-align: left;
  font-family: 'Crimson Text', serif; color: #c8b97a; }
.mp-prof-skill:hover:not(:disabled) { border-color: #c8b97a; background: #1e1608; }
.mp-prof-skill .skill-rank { font-size: 9px; color: #666; font-family: var(--font-mono);
  letter-spacing: 1px; }
.mp-prof-skill .skill-name { font-size: 11px; color: var(--gold-strong);
  font-weight: 700; margin: 1px 0; font-family: var(--font-display); letter-spacing: 0.5px; }
.mp-prof-skill .skill-desc { font-size: 10px; color: #a09060;
  margin: 2px 0; line-height: 1.3; }
.mp-prof-skill .skill-cost { font-size: 10px; color: #60c060; font-family: var(--font-mono); }
.mp-prof-skill.avail { border-color: var(--gold); }
.mp-prof-skill.learned { border-color: #ffe97a; background: #2a1f06;
  box-shadow: 0 0 6px #c8b97a55; }
.mp-prof-skill.learned .skill-cost { color: var(--green); }
.mp-prof-skill.locked { opacity: 0.35; cursor: not-allowed; }
.mp-prof-skill.master { width: 100%; border-color: #aa6600; background: #1a1000;
  text-align: center; padding: 12px; }
.mp-prof-skill.master.learned { border-color: #ffaa00; background: #2a1800;
  box-shadow: 0 0 12px #ffaa0077; }
.mp-prof-skill.master .skill-name { font-size: 14px; }
.mp-prof-skill.master .skill-cost { font-size: 12px; }

.mp-prof-legend { font-size: 10px; color: #443820; text-align: center;
  margin-top: 14px; padding: 8px; font-family: var(--font-mono); }

/* GRUDGE STATS — sidebar 8-stat strip */
.mp-stat-pool { float: right; font-family: var(--font-mono); font-size: 10px;
  color: #0a0604; background: var(--gold-strong); padding: 1px 6px;
  border-radius: 99px; font-weight: 700; letter-spacing: 0.5px;
  text-transform: none; }
.mp-grudge-strip { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px; }
.mp-grudge-cell .val .bonus { color: var(--green); font-size: 10px; margin-left: 2px; }

/* PRIMARY STAT CELL — bank progress + plus button */
.mp-primary-plus { width: 22px; height: 22px; padding: 0;
  background: var(--gold); color: #0a0604; border: 0; border-radius: 3px;
  font-family: var(--font-display); font-size: 16px; font-weight: 700;
  cursor: pointer; line-height: 1; flex-shrink: 0; }
.mp-primary-plus:hover:not(:disabled) { background: var(--gold-strong); transform: scale(1.08); }
.mp-primary-plus:disabled { opacity: 0.25; cursor: not-allowed; }
.mp-primary-head .val .delta { font-size: 10px; color: var(--green); margin-left: 3px; }
.mp-primary-bank { display: flex; align-items: center; gap: 6px;
  margin: 4px 0; font-family: var(--font-mono); font-size: 9px; color: var(--muted); }
.mp-primary-bank .bar { flex: 1; height: 4px; background: #0a0604;
  border: 1px solid var(--border-dim); border-radius: 2px; overflow: hidden; }
.mp-primary-bank .bar div { height: 100%; transition: width .3s; }

/* ALLOCATION CARDS */
.mp-alloc-grid { display: grid; grid-template-columns: 1fr 2fr; gap: 10px; }
.mp-alloc-card { padding: 12px;
  background: linear-gradient(135deg, var(--panel-2), var(--panel));
  border: 1px solid var(--border-dim); border-radius: 6px; }
.mp-alloc-card .lbl { font-family: var(--font-display); font-size: 10px;
  color: var(--muted); text-transform: uppercase; letter-spacing: 1.5px; }
.mp-alloc-card .big { font-family: var(--font-display); font-size: 24px;
  color: var(--gold-strong); font-weight: 700; margin: 2px 0; }
.mp-alloc-card .sub { font-family: var(--font-mono); font-size: 11px;
  color: var(--gold); margin-bottom: 6px; }
.mp-alloc-card .hint { font-size: 11px; color: var(--muted);
  line-height: 1.4; margin-top: 6px; padding-top: 6px;
  border-top: 1px solid var(--border-dim); }
.mp-alloc-row { display: flex; gap: 6px; align-items: center; margin-top: 8px; flex-wrap: wrap; }
.mp-alloc-select { flex: 1; min-width: 140px; padding: 6px 8px;
  background: #0e0c07; border: 1px solid var(--border); color: var(--gold-strong);
  font-family: var(--font-mono); font-size: 11px; border-radius: 3px; cursor: pointer; }
.mp-alloc-select:focus { outline: 1px solid var(--gold); }

/* STATS TAB — radar + primary grid two-column */
.mp-stats-row { display: grid; grid-template-columns: auto 1fr; gap: 14px;
  align-items: start; margin-bottom: 12px; }
.mp-grudge-cell { display: flex; align-items: center; gap: 6px;
  padding: 4px 6px; background: var(--panel-2);
  border: 1px solid var(--border-dim); border-radius: 3px; }
.mp-grudge-cell .abbr { font-family: var(--font-display); font-size: 9px;
  font-weight: 700; letter-spacing: 0.5px; padding: 2px 4px; border: 1px solid;
  border-radius: 2px; min-width: 28px; text-align: center; }
.mp-grudge-cell .val { font-family: var(--font-mono); font-size: 13px;
  color: var(--gold-strong); margin-left: auto; font-weight: 600; }

/* STATS TAB — radar + primary grid two-column */
.mp-stats-row { display: grid; grid-template-columns: auto 1fr; gap: 14px;
  align-items: start; margin-bottom: 12px; }
.mp-radar-wrap { background: linear-gradient(135deg, var(--panel-2), var(--panel));
  border: 1px solid var(--border-dim); border-radius: 6px; padding: 10px;
  display: flex; align-items: center; justify-content: center; }
.mp-primary-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
.mp-primary-cell { padding: 8px 10px; background: var(--panel-2);
  border: 1px solid; border-radius: 4px; }
.mp-primary-head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.mp-primary-head .abbr { font-family: var(--font-display); font-size: 10px;
  font-weight: 700; padding: 3px 6px; border-radius: 3px;
  color: #0a0604; letter-spacing: 0.5px; }
.mp-primary-head .name { font-family: var(--font-display); font-size: 11px;
  color: var(--gold-strong); letter-spacing: 1px; flex: 1; }
.mp-primary-head .val { font-family: var(--font-mono); font-size: 16px; font-weight: 700; }
.mp-primary-head .val .cap { font-size: 10px; color: var(--muted); margin-left: 1px; }
.mp-primary-tag { font-size: 11px; color: var(--muted); font-style: italic;
  margin-bottom: 4px; line-height: 1.3; }
.mp-primary-foot { display: flex; justify-content: space-between; gap: 8px;
  font-family: var(--font-mono); font-size: 10px; color: var(--dim); }
.mp-primary-foot .ok { color: var(--green); font-weight: 700; }
.mp-primary-foot .milestone { color: var(--gold); }

/* PROGRESSION CARD */
.mp-prog-card { padding: 14px; background: linear-gradient(135deg, var(--panel-2), var(--panel));
  border: 1px solid var(--border-dim); border-radius: 6px; }
.mp-prog-head { display: flex; align-items: center; gap: 16px; margin-bottom: 8px; }
.mp-prog-head .lbl { font-family: var(--font-display); font-size: 9px;
  color: var(--muted); text-transform: uppercase; letter-spacing: 1.5px; }
.mp-prog-head .big { font-family: var(--font-display); font-size: 22px;
  color: var(--gold-strong); font-weight: 700; }
.mp-prog-xpbar { height: 10px; background: #0a0604;
  border: 1px solid var(--border-dim); border-radius: 5px; overflow: hidden; }
.mp-prog-xpbar div { height: 100%;
  background: linear-gradient(90deg, var(--gold), var(--gold-strong));
  transition: width .3s; }
.mp-prog-xptext { font-family: var(--font-mono); font-size: 11px;
  color: var(--gold); margin-top: 4px; }
.mp-prog-xptext .muted { color: var(--muted); }
.mp-prog-note { font-size: 11px; color: var(--muted); line-height: 1.5;
  padding: 8px 0; border-top: 1px solid var(--border-dim);
  border-bottom: 1px solid var(--border-dim); }
.mp-prog-note code { font-family: var(--font-mono); color: var(--gold-strong);
  background: rgba(212,164,0,0.08); padding: 1px 4px; border-radius: 2px; }
.mp-prog-sub { font-family: var(--font-display); font-size: 10px;
  color: var(--gold); text-transform: uppercase; letter-spacing: 2px;
  margin: 12px 0 6px; }
.mp-prog-sub .muted { color: var(--muted); letter-spacing: 0.5px; text-transform: none; }
.mp-prog-tracks { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px; }
.mp-prog-track { display: flex; align-items: center; gap: 8px;
  padding: 5px 8px; background: rgba(0,0,0,0.25); border-radius: 3px; }
.mp-prog-track .name { font-family: var(--font-display); font-size: 10px;
  letter-spacing: 1.5px; min-width: 60px; }
.mp-prog-track .pts { font-family: var(--font-mono); font-size: 11px;
  color: var(--gold-strong); min-width: 50px; }
.mp-prog-track .next { font-family: var(--font-mono); font-size: 10px;
  color: var(--muted); flex: 1; text-align: right; }
.mp-prog-tiers { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; }
.mp-prog-tier { padding: 6px 4px; text-align: center;
  background: rgba(0,0,0,0.25); border: 1px solid var(--border-dim); border-radius: 3px; }
.mp-prog-tier .t { display: block; font-family: var(--font-mono); font-size: 9px;
  color: var(--muted); }
.mp-prog-tier .n { display: block; font-family: var(--font-display); font-size: 10px;
  color: var(--gold-strong); letter-spacing: 1px; margin: 1px 0; }
.mp-prog-tier .p { display: block; font-family: var(--font-mono); font-size: 10px;
  color: var(--gold); }
.mp-prog-cost { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; }
.mp-prog-cost-cell { padding: 5px 2px; text-align: center;
  background: rgba(0,0,0,0.25); border: 1px solid var(--border-dim); border-radius: 3px; }
.mp-prog-cost-cell .lvl { font-family: var(--font-mono); font-size: 9px;
  color: var(--muted); }
.mp-prog-cost-cell .cost { font-family: var(--font-mono); font-size: 13px;
  color: var(--gold-strong); font-weight: 700; }
.mp-prog-budget { font-family: var(--font-mono); font-size: 11px;
  color: var(--muted); margin-top: 8px; text-align: right; }
.mp-prog-budget b { color: var(--gold-strong); }
.mp-prog-budget .warn { color: var(--red); margin-left: 4px; }

/* STATS / DERIVED */
.mp-cp-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.mp-cp-card { padding: 14px; text-align: center;
  background: linear-gradient(135deg, var(--panel-2), var(--panel));
  border: 1px solid var(--border-dim); border-radius: 6px; }
.mp-cp-card .lbl { font-family: var(--font-display); font-size: 9px; color: var(--muted);
  text-transform: uppercase; letter-spacing: 1.5px; }
.mp-cp-card .big { font-family: var(--font-display); font-size: 26px;
  font-weight: 700; color: var(--gold-strong); margin: 2px 0; }
.mp-cp-card .sub { font-size: 11px; color: var(--muted); }
.mp-stat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px; }
.mp-stat-cell { padding: 8px 10px; background: var(--panel-2);
  border: 1px solid var(--border-dim); border-radius: 4px; }
.mp-stat-cell .lbl { font-family: var(--font-display); font-size: 9px;
  color: var(--muted); text-transform: uppercase; letter-spacing: 1px; }
.mp-stat-cell .val { font-family: var(--font-mono); font-size: 14px;
  color: var(--gold-strong); font-weight: 600; margin-top: 2px; }
.mp-stat-cell .sub { font-size: 10px; color: var(--dim); margin-top: 2px; }
.mp-stat-cell.bad { border-color: var(--red); }

/* EQUIPMENT */
.mp-equip-layout { display: grid; grid-template-columns: 1fr auto 1fr;
  gap: 16px; align-items: start; padding: 14px;
  background: linear-gradient(135deg, var(--panel-2), var(--panel));
  border: 1px solid var(--border-dim); border-radius: 6px; }
.mp-equip-stack { display: flex; flex-direction: column; gap: 8px; }
.mp-equip-center { display: flex; justify-content: center; }
.mp-eq-slot, .mp-eq-mainhand { background: linear-gradient(135deg, #2a1a0e, #1a0f08);
  border: 2px solid; border-radius: 6px; padding: 8px; cursor: pointer; transition: 0.15s;
  display: flex; flex-direction: column; align-items: center; gap: 4px; min-height: 80px; }
.mp-eq-mainhand { width: 130px; min-height: 130px; }
.mp-eq-slot:hover, .mp-eq-mainhand:hover { transform: scale(1.03); }
.mp-eq-slot .icon, .mp-eq-mainhand .icon { font-size: 28px; }
.mp-eq-mainhand .icon { font-size: 56px; }
.mp-eq-slot .cat, .mp-eq-mainhand .cat { font-family: var(--font-display); font-size: 8px;
  color: var(--muted); text-transform: uppercase; letter-spacing: 1px; }
.mp-eq-slot .ename, .mp-eq-mainhand .ename { font-size: 10px; text-align: center;
  font-family: 'Crimson Text', serif; line-height: 1.2; }

.mp-bag-list { display: flex; flex-direction: column; gap: 4px; }
.mp-bag-row { display: flex; align-items: center; gap: 10px; padding: 6px 10px;
  background: var(--panel-2); border-radius: 3px; }
.mp-bag-row .ico { font-size: 18px; width: 24px; text-align: center; }
.mp-bag-row .name { flex: 1; font-size: 12px; }
.mp-bag-row .slot { font-family: var(--font-mono); font-size: 9px; color: var(--muted);
  text-transform: uppercase; }

.mp-btn { padding: 4px 10px; background: var(--panel); border: 1px solid var(--border);
  color: var(--gold); font-family: var(--font-display); font-size: 10px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 1px; cursor: pointer; border-radius: 3px;
  transition: 0.15s; }
.mp-btn:hover:not(:disabled) { background: var(--gold); color: #0a0604; }
.mp-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.mp-btn.primary { background: var(--gold); color: #0a0604; }
.mp-btn.primary:hover:not(:disabled) { background: var(--gold-strong); }
.mp-btn.ghost { border-color: var(--border-dim); color: var(--muted); }
.mp-btn.ghost:hover:not(:disabled) { color: var(--red); border-color: var(--red); background: transparent; }

.mp-empty { padding: 20px; text-align: center; color: var(--dim); font-style: italic; font-size: 12px; }

/* QUEST */
.mp-quest { padding: 12px; background: linear-gradient(135deg, var(--panel-2), var(--panel));
  border: 1px solid var(--border-dim); border-radius: 6px; margin-bottom: 8px; }
.mp-quest .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.mp-quest .title { font-family: var(--font-display); font-size: 13px; color: var(--gold-strong);
  letter-spacing: 1px; }
.mp-quest .pct { font-family: var(--font-mono); font-size: 11px; color: var(--green); }
.mp-quest .desc { font-size: 12px; color: var(--muted); margin-bottom: 6px; }
.mp-quest .bar { height: 6px; background: #0a0604; border: 1px solid var(--border-dim);
  border-radius: 3px; overflow: hidden; margin-bottom: 6px; }
.mp-quest .bar div { height: 100%; background: linear-gradient(90deg, var(--gold), var(--gold-strong)); transition: width 0.3s; }
.mp-quest .reward { font-family: var(--font-mono); font-size: 10px; color: var(--gold); }

/* PERKS */
.mp-perk-tracks { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 14px; }
.mp-perk-track { padding: 10px; background: var(--panel-2); border: 1px solid var(--border-dim);
  border-radius: 4px; cursor: pointer; transition: 0.15s; text-align: center; }
.mp-perk-track .name { font-family: var(--font-display); font-size: 11px;
  color: var(--track-color); letter-spacing: 1.5px; }
.mp-perk-track .pts { font-family: var(--font-mono); font-size: 10px; color: var(--muted); margin-top: 2px; }
.mp-perk-track.active { border-color: var(--track-color); background: color-mix(in srgb, var(--track-color) 10%, transparent); }
.mp-perk-tier-name { font-family: var(--font-display); font-size: 11px; text-transform: uppercase;
  letter-spacing: 2px; margin: 12px 0 6px; }
.mp-perk-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 6px; }
.mp-perk { padding: 8px; background: var(--panel-2); border: 2px solid;
  border-radius: 4px; text-align: center; cursor: pointer; transition: 0.15s;
  font-family: 'Crimson Text', serif; }
.mp-perk img { width: 36px; height: 36px; object-fit: contain; margin: 0 auto 4px; display: block; }
.mp-perk .name { font-size: 12px; color: var(--gold-strong); margin-bottom: 3px; font-weight: 600; }
.mp-perk .desc { font-size: 10px; color: var(--muted); line-height: 1.3; }
.mp-perk.unlocked { background: rgba(110,201,110,0.06); }
.mp-perk.unlocked .name { color: var(--green); }
.mp-perk.locked { opacity: 0.4; cursor: not-allowed; }
.mp-perk.avail:hover:not(:disabled) { transform: scale(1.04); }

/* CRAFTING */
.mp-craft-filters { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 12px; }
.mp-pill { padding: 4px 10px; background: var(--panel-2); border: 1px solid var(--border-dim);
  color: var(--muted); font-family: var(--font-display); font-size: 10px;
  text-transform: uppercase; letter-spacing: 1px; cursor: pointer; border-radius: 99px;
  transition: 0.15s; }
.mp-pill:hover { color: var(--gold); border-color: var(--gold); }
.mp-pill.active { color: var(--gold-strong); border-color: var(--gold); background: rgba(212,164,0,0.1); }
.mp-pill.dim { opacity: 0.5; }
.mp-recipes { display: flex; flex-direction: column; gap: 6px; }
.mp-recipe { display: flex; align-items: center; gap: 12px; padding: 10px;
  background: var(--panel-2); border: 1px solid var(--border-dim); border-radius: 4px; }
.mp-recipe .ico { width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;
  font-size: 24px; background: rgba(0,0,0,0.3); border-radius: 4px; flex-shrink: 0; }
.mp-recipe .info { flex: 1; min-width: 0; }
.mp-recipe .name { font-family: var(--font-display); font-size: 13px; color: var(--gold-strong); letter-spacing: 1px; }
.mp-recipe .desc { font-size: 11px; color: var(--muted); margin: 2px 0; }
.mp-recipe .inputs { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.mp-recipe .tag { font-family: var(--font-mono); font-size: 10px; padding: 2px 6px;
  background: rgba(0,0,0,0.4); border-radius: 2px; }
.mp-recipe .tag.ok { color: var(--green); }
.mp-recipe .tag.bad { color: var(--red); }

/* FRIENDS */
.mp-friends { display: flex; flex-direction: column; gap: 4px; }
.mp-friend { display: flex; align-items: center; gap: 10px; padding: 8px 12px;
  background: var(--panel-2); border: 1px solid var(--border-dim); border-radius: 4px; }
.mp-friend.offline { opacity: 0.55; }
.mp-friend .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.mp-friend .info { flex: 1; }
.mp-friend .name { font-family: var(--font-display); font-size: 12px; color: var(--gold-strong); letter-spacing: 1px; }
.mp-friend .status { font-size: 10px; color: var(--muted); }
.mp-friend .lvl { font-family: var(--font-mono); font-size: 11px; color: var(--gold); }

/* RIGHT */
.mp-rmode { display: flex; }
.mp-rmode-btn { flex: 1; padding: 8px; background: transparent; border: 0;
  border-bottom: 2px solid transparent; color: var(--muted);
  font-family: var(--font-display); font-size: 10px; text-transform: uppercase;
  letter-spacing: 1px; cursor: pointer; transition: 0.15s; }
.mp-rmode-btn:hover { color: var(--gold-strong); }
.mp-rmode-btn.active { color: var(--gold-strong); border-bottom-color: var(--gold);
  background: rgba(212,164,0,0.05); }
.mp-inv-head { display: flex; justify-content: space-between; align-items: center;
  padding: 8px 4px; }
.mp-inv-head h3 { margin: 0; font-family: var(--font-display); font-size: 12px;
  color: var(--gold-strong); text-transform: uppercase; letter-spacing: 2px; }
.mp-inv-head .cap { font-family: var(--font-mono); font-size: 10px; color: var(--gold); }
.mp-inv-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; }
.mp-inv-cell { aspect-ratio: 1; background: rgba(0,0,0,0.3);
  border: 1px solid var(--border-dim); border-radius: 3px; cursor: pointer;
  display: flex; align-items: center; justify-content: center; font-size: 18px; transition: 0.1s; }
.mp-inv-cell.filled { background: linear-gradient(135deg, #2a1a0e, #1a0f08); }
.mp-inv-cell.filled:hover { transform: scale(1.05); border-color: var(--gold); }
.mp-inv-tooltip { position: absolute; right: 290px; top: 80px; padding: 10px 14px;
  background: rgba(8,5,3,0.98); border: 1px solid var(--gold); border-radius: 4px;
  z-index: 10; max-width: 220px; pointer-events: auto; }
.mp-inv-tooltip .name { font-family: var(--font-display); font-size: 12px; margin-bottom: 4px; }
.mp-inv-tooltip .desc { font-size: 11px; color: var(--muted); font-style: italic; }
.mp-trash { margin-top: 10px; padding: 12px; border: 1px dashed var(--border-dim);
  border-radius: 4px; text-align: center; font-size: 10px; color: var(--dim); }

.mp-skill-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.mp-skill-cell { aspect-ratio: 1; padding: 4px;
  background: linear-gradient(135deg, #1a2808, #122008);
  border: 2px solid #3a5820; border-radius: 6px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  position: relative; gap: 2px; }
.mp-skill-cell.off { background: linear-gradient(135deg, #1a0f08, #0f0805);
  border-color: #2a1a0a; opacity: 0.5; }
.mp-skill-cell .num { position: absolute; top: 2px; left: 4px; font-size: 8px; color: #555;
  font-family: var(--font-mono); }
.mp-skill-cell .ico { font-size: 22px; }
.mp-skill-cell .name { font-family: var(--font-display); font-size: 7px; text-align: center;
  color: var(--muted); text-transform: uppercase; letter-spacing: 0.3px; line-height: 1.2; }
.mp-skill-cell .cd { position: absolute; bottom: 2px; right: 4px;
  font-family: var(--font-mono); font-size: 9px; color: var(--red); }

/* BOTTOM */
.mp-bottom { padding: 10px; background: linear-gradient(180deg, #1a120c, #0a0604);
  border-top: 2px solid var(--border); flex-shrink: 0; }
.mp-hotbar { display: flex; gap: 6px; justify-content: center; }
.mp-hot { width: 60px; height: 60px; background: linear-gradient(135deg, #2a1a0e, #1a0f08);
  border: 2px solid var(--border-dim); border-radius: 6px; position: relative;
  display: flex; align-items: center; justify-content: center; }
.mp-hot.on { border-color: var(--border); }
.mp-hot.off { opacity: 0.45; }
.mp-hot .key { position: absolute; top: 2px; left: 4px; font-family: var(--font-mono);
  font-size: 9px; color: var(--gold); }
.mp-hot .ico { font-size: 28px; }
.mp-hot .cd { position: absolute; bottom: 4px; right: 6px; font-family: var(--font-mono);
  font-size: 11px; color: var(--red); font-weight: 700; }
`;
