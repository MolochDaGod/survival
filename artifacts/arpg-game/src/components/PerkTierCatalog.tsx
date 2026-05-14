import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { STAT_META, STAT_MILESTONE_PERKS, GrudgeStats, DEFAULT_STATS, MilestonePerk, StatMeta, PerkChoices } from '../game/CharacterConfig';
import {
  TIER4_BY_STAT,
  TIER5_BY_STAT,
  TIER6_BY_BASE_ID,
  type ActiveSkillDef,
  type PassivePerkDef,
} from '../game/progression/StatPerkChoices';
import { LevelUpChoiceModal, type ChoiceTier } from './LevelUpChoiceModal';

interface PerkTierCatalogProps {
  compact?: boolean;
  stats?: GrudgeStats;
  /** Optional. If omitted, tier-4/5/6 cells render in a read-only locked state. */
  perkChoices?: PerkChoices;
  /** Called when the player picks a tier-4 active or tier-5 passive option. */
  onChoosePerk?: (stat: keyof GrudgeStats, tier: ChoiceTier, perkId: string) => void;
}

interface ChoiceCellPayload {
  stat: keyof GrudgeStats;
  tier: ChoiceTier;
}

/** Adapt a chosen ActiveSkillDef / PassivePerkDef into the MilestonePerk shape used by hover card. */
function activeAsMilestone(active: ActiveSkillDef): MilestonePerk {
  return {
    perkName: active.name,
    perkDesc: `${active.description}  •  ${active.cooldownS}s CD${active.energyCost > 0 ? `, ${active.energyCost} EN` : ''}`,
    icon: active.icon,
  };
}
function passiveAsMilestone(passive: PassivePerkDef): MilestonePerk {
  return {
    perkName: passive.name,
    perkDesc: passive.description,
    icon: passive.icon,
  };
}

const TIER_LABELS = ['TIER I', 'TIER II', 'TIER III', 'TIER IV', 'TIER V', 'TIER VI'];

function perkIconPath(statKey: string, tier: number): string {
  return `/icons/perks/stat-tiers/${statKey}-t${tier}.svg`;
}

interface HoveredPerk {
  perk: MilestonePerk;
  sm: StatMeta;
  tierIndex: number;
  isUnlocked: boolean;
  tileEl: HTMLElement;
  imgSrc: string;
}

interface PerkHoverCardProps {
  hovered: HoveredPerk;
}

const CARD_WIDTH = 220;
const MOBILE_BREAKPOINT = 480;
const GAP = 8;

function findScrollableAncestors(el: HTMLElement): HTMLElement[] {
  const result: HTMLElement[] = [];
  let node: HTMLElement | null = el.parentElement;
  while (node && node !== document.body && node !== document.documentElement) {
    const cs = window.getComputedStyle(node);
    const overflow = `${cs.overflow} ${cs.overflowX} ${cs.overflowY}`;
    if (/(auto|scroll|overlay)/.test(overflow)) {
      result.push(node);
    }
    node = node.parentElement;
  }
  return result;
}

const PerkHoverCard: React.FC<PerkHoverCardProps & { pinned?: boolean }> = ({ hovered, pinned }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const { tileEl } = hovered;

  const computePos = () => {
    const vpW = window.innerWidth;
    const vpH = window.innerHeight;
    const cardH = cardRef.current?.getBoundingClientRect().height ?? 200;
    const isMobile = vpW < MOBILE_BREAKPOINT;
    const tileRect = tileEl.getBoundingClientRect();

    let left: number;
    let top: number;

    if (isMobile) {
      left = Math.max(GAP, Math.min((vpW - CARD_WIDTH) / 2, vpW - CARD_WIDTH - GAP));
      const spaceBelow = vpH - tileRect.bottom - GAP;
      const spaceAbove = tileRect.top - GAP;
      if (spaceBelow >= cardH || spaceBelow >= spaceAbove) {
        top = tileRect.bottom + GAP;
      } else {
        top = tileRect.top - cardH - GAP;
      }
    } else {
      if (tileRect.right + GAP + CARD_WIDTH <= vpW - GAP) {
        left = tileRect.right + GAP;
      } else {
        left = tileRect.left - CARD_WIDTH - GAP;
      }
      if (left < GAP) left = GAP;
      top = tileRect.top;
    }

    if (top + cardH > vpH - GAP) top = vpH - cardH - GAP;
    if (top < GAP) top = GAP;

    return { left, top };
  };

  const [pos, setPos] = useState(() => {
    const r = tileEl.getBoundingClientRect();
    return { left: r.right + GAP, top: r.top };
  });

  useEffect(() => {
    setPos(computePos());

    const handleReposition = () => setPos(computePos());
    const scrollables = findScrollableAncestors(tileEl);

    window.addEventListener('resize', handleReposition, { passive: true });
    window.addEventListener('scroll', handleReposition, { passive: true });
    scrollables.forEach((s) => {
      s.addEventListener('scroll', handleReposition, { passive: true });
    });
    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition);
      scrollables.forEach((s) => {
        s.removeEventListener('scroll', handleReposition);
      });
    };
  }, [tileEl]);

  const { perk, sm, tierIndex, isUnlocked, imgSrc } = hovered;
  const tierLabel = TIER_LABELS[tierIndex];
  const requirementLevel = tierIndex + 1;

  return (
    <div
      ref={cardRef}
      id={pinned ? 'perk-hover-card-pinned' : undefined}
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        zIndex: 9999,
        width: 220,
        background: 'linear-gradient(145deg, rgba(4,10,20,0.97) 0%, rgba(8,16,32,0.97) 100%)',
        border: `1px solid ${sm.color}55`,
        borderRadius: 8,
        boxShadow: `0 8px 32px rgba(0,0,0,0.7), 0 0 16px ${sm.color}22, inset 0 1px 0 ${sm.color}20`,
        pointerEvents: pinned ? 'auto' : 'none',
        overflow: 'hidden',
      }}
    >
      <div style={{
        height: 4,
        background: `linear-gradient(90deg, ${sm.color}cc, ${sm.color}33)`,
      }} />

      <div style={{ padding: '10px 12px 12px' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
          <div style={{
            width: 88,
            height: 88,
            flexShrink: 0,
            borderRadius: 6,
            border: `1px solid ${sm.color}44`,
            background: isUnlocked
              ? `linear-gradient(135deg, ${sm.color}22, ${sm.color}0c)`
              : 'rgba(4,8,16,0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            position: 'relative',
          }}>
            <img
              src={imgSrc}
              alt={perk.perkName}
              draggable={false}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
                const fb = e.currentTarget.nextElementSibling as HTMLElement | null;
                if (fb) fb.style.display = 'flex';
              }}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                filter: isUnlocked ? 'none' : 'grayscale(100%) brightness(0.35)',
              }}
            />
            <span style={{
              display: 'none',
              fontSize: 28,
              position: 'absolute',
              inset: 0,
              alignItems: 'center',
              justifyContent: 'center',
              filter: isUnlocked ? 'none' : 'grayscale(100%) opacity(0.4)',
            }}>
              {perk.icon}
            </span>
            {!isUnlocked && (
              <div style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
                background: 'rgba(0,0,0,0.3)',
              }}>
                🔒
              </div>
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 11,
              fontWeight: 800,
              color: isUnlocked ? '#e8d8b0' : 'rgba(255,255,255,0.4)',
              lineHeight: 1.3,
              marginBottom: 4,
              wordBreak: 'break-word',
            }}>
              {perk.perkName}
            </div>
            <div style={{
              fontSize: 9,
              fontWeight: 700,
              color: sm.color,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              marginBottom: 2,
            }}>
              {tierLabel}
            </div>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 9,
              fontWeight: 600,
              padding: '2px 6px',
              borderRadius: 3,
              background: isUnlocked ? `${sm.color}22` : 'rgba(255,255,255,0.06)',
              border: `1px solid ${isUnlocked ? sm.color + '44' : 'rgba(255,255,255,0.1)'}`,
              color: isUnlocked ? sm.color : 'rgba(255,255,255,0.3)',
            }}>
              <span style={{ opacity: 0.8 }}>Requires</span>
              <span style={{ fontWeight: 800 }}>{sm.abbr} {requirementLevel}</span>
              {isUnlocked && <span>✓</span>}
            </div>
          </div>
        </div>

        <div style={{
          fontSize: 10,
          color: isUnlocked ? 'rgba(220,200,170,0.85)' : 'rgba(255,255,255,0.28)',
          lineHeight: 1.55,
          borderTop: `1px solid ${sm.color}1a`,
          paddingTop: 8,
        }}>
          {perk.perkDesc}
        </div>
      </div>
    </div>
  );
};

type FilterMode = 'all' | 'unlocked' | 'locked' | 'next-unlock';

const FILTER_OPTIONS: { mode: FilterMode; label: string }[] = [
  { mode: 'all', label: 'All' },
  { mode: 'unlocked', label: 'Unlocked' },
  { mode: 'locked', label: 'Locked' },
  { mode: 'next-unlock', label: 'Next Unlock' },
];

const FILTER_STORAGE_KEY = 'perkTierCatalog.filterMode';
const TAP_HINT_DISMISSED_KEY = 'perkTierCatalog.tapHintDismissed';
const VALID_FILTER_MODES: FilterMode[] = ['all', 'unlocked', 'locked', 'next-unlock'];

function detectTouchCapable(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'ontouchstart' in window ||
    (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) ||
    (typeof window.matchMedia === 'function' && window.matchMedia('(hover: none) and (pointer: coarse)').matches)
  );
}

function loadTapHintDismissed(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(TAP_HINT_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

function loadStoredFilterMode(): FilterMode {
  if (typeof window === 'undefined') return 'all';
  try {
    const stored = window.localStorage.getItem(FILTER_STORAGE_KEY);
    if (stored && (VALID_FILTER_MODES as string[]).includes(stored)) {
      return stored as FilterMode;
    }
  } catch {
    // ignore storage access errors (e.g. disabled localStorage)
  }
  return 'all';
}

export const PerkTierCatalog: React.FC<PerkTierCatalogProps> = ({
  compact = false,
  stats = DEFAULT_STATS,
  perkChoices,
  onChoosePerk,
}) => {
  const [hoveredPerk, setHoveredPerk] = useState<HoveredPerk | null>(null);
  const [pinnedPerk, setPinnedPerk] = useState<HoveredPerk | null>(null);
  const [pinnedTileKey, setPinnedTileKey] = useState<string | null>(null);
  const [openChoice, setOpenChoice] = useState<ChoiceCellPayload | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>(loadStoredFilterMode);
  const [isTouchDevice, setIsTouchDevice] = useState<boolean>(detectTouchCapable);
  const [tapHintDismissed, setTapHintDismissed] = useState<boolean>(loadTapHintDismissed);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = () => setIsTouchDevice(detectTouchCapable());
    update();
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(hover: none) and (pointer: coarse)');
    const listener = () => update();
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', listener);
      return () => mql.removeEventListener('change', listener);
    }
    mql.addListener(listener);
    return () => mql.removeListener(listener);
  }, []);

  const dismissTapHint = useCallback(() => {
    setTapHintDismissed(true);
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(TAP_HINT_DISMISSED_KEY, '1');
    } catch {
      // ignore storage write errors
    }
  }, []);

  const showTapHintBanner = isTouchDevice && !tapHintDismissed;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(FILTER_STORAGE_KEY, filterMode);
    } catch {
      // ignore storage write errors
    }
  }, [filterMode]);

  const filterCounts = useMemo<Record<FilterMode, number>>(() => {
    const counts: Record<FilterMode, number> = {
      'all': 0,
      'unlocked': 0,
      'locked': 0,
      'next-unlock': 0,
    };
    for (const sm of STAT_META) {
      const statLevel = stats[sm.key];
      for (let i = 0; i < TIER_LABELS.length; i++) {
        const tierNumber = i + 1;
        const isUnlocked = statLevel >= tierNumber;
        const isNextUnlock = statLevel === i;
        counts.all += 1;
        if (isUnlocked) counts.unlocked += 1;
        else counts.locked += 1;
        if (isNextUnlock) counts['next-unlock'] += 1;
      }
    }
    return counts;
  }, [stats]);

  /**
   * Resolve the perk that should appear in a given cell, taking choice picks
   * into account for tiers 4-6. Returns the default milestone perk for 1-3.
   */
  const perkForCell = useCallback((sm: StatMeta, tierNumber: number): {
    perk: MilestonePerk | undefined;
    pickable: boolean;        // true if tier-4/5 unlocked but no choice yet
    awaitingPick: boolean;    // true if tier-6 unlocked but no tier-4 picked
  } => {
    const statLevel = stats[sm.key];
    if (tierNumber <= 3) {
      return { perk: STAT_MILESTONE_PERKS[sm.key][tierNumber - 1], pickable: false, awaitingPick: false };
    }
    if (tierNumber === 4) {
      const picked = perkChoices?.tier4?.[sm.key];
      if (picked) {
        const def = TIER4_BY_STAT[sm.key].find(a => a.id === picked);
        return { perk: def ? activeAsMilestone(def) : undefined, pickable: false, awaitingPick: false };
      }
      const unlocked = statLevel >= 4;
      return { perk: undefined, pickable: unlocked && !!onChoosePerk, awaitingPick: false };
    }
    if (tierNumber === 5) {
      const picked = perkChoices?.tier5?.[sm.key];
      if (picked) {
        const def = TIER5_BY_STAT[sm.key].find(p => p.id === picked);
        return { perk: def ? passiveAsMilestone(def) : undefined, pickable: false, awaitingPick: false };
      }
      const unlocked = statLevel >= 5;
      return { perk: undefined, pickable: unlocked && !!onChoosePerk, awaitingPick: false };
    }
    // tier 6: derive upgraded form from picked tier-4
    const pickedT4 = perkChoices?.tier4?.[sm.key];
    if (!pickedT4) {
      return { perk: undefined, pickable: false, awaitingPick: statLevel >= 6 };
    }
    const upgrade = TIER6_BY_BASE_ID[pickedT4];
    return { perk: upgrade ? activeAsMilestone(upgrade) : undefined, pickable: false, awaitingPick: false };
  }, [stats, perkChoices, onChoosePerk]);

  const handleMouseEnter = useCallback((
    e: React.MouseEvent,
    perk: MilestonePerk,
    sm: StatMeta,
    tierIndex: number,
    isUnlocked: boolean,
    imgSrc: string,
  ) => {
    if (pinnedPerk) return;
    const tileEl = e.currentTarget as HTMLElement;
    setHoveredPerk({ perk, sm, tierIndex, isUnlocked, imgSrc, tileEl });
  }, [pinnedPerk]);

  const handleMouseLeave = useCallback(() => {
    if (pinnedPerk) return;
    setHoveredPerk(null);
  }, [pinnedPerk]);

  const touchOriginRef = useRef<{ x: number; y: number; key: string } | null>(null);

  const handleTileTouchStart = useCallback((
    e: React.TouchEvent,
    tileKey: string,
  ) => {
    const t = e.touches[0];
    touchOriginRef.current = { x: t.clientX, y: t.clientY, key: tileKey };
  }, []);

  const handleTileTouchEnd = useCallback((
    e: React.TouchEvent,
    perk: MilestonePerk,
    sm: StatMeta,
    tierIndex: number,
    isUnlocked: boolean,
    imgSrc: string,
    tileKey: string,
  ) => {
    const origin = touchOriginRef.current;
    touchOriginRef.current = null;
    if (!origin || origin.key !== tileKey) return;
    const t = e.changedTouches[0];
    const dx = Math.abs(t.clientX - origin.x);
    const dy = Math.abs(t.clientY - origin.y);
    if (dx > 8 || dy > 8) return;
    e.preventDefault();
    if (pinnedTileKey === tileKey) {
      setPinnedPerk(null);
      setPinnedTileKey(null);
    } else {
      const tileEl = e.currentTarget as HTMLElement;
      setPinnedPerk({ perk, sm, tierIndex, isUnlocked, imgSrc, tileEl });
      setPinnedTileKey(tileKey);
    }
  }, [pinnedTileKey]);

  useEffect(() => {
    if (!pinnedPerk) return;
    const dismiss = (e: TouchEvent) => {
      const card = document.getElementById('perk-hover-card-pinned');
      if (card && card.contains(e.target as Node)) return;
      setPinnedPerk(null);
      setPinnedTileKey(null);
    };
    document.addEventListener('touchstart', dismiss, { passive: true });
    return () => document.removeEventListener('touchstart', dismiss);
  }, [pinnedPerk]);

  return (
    <>
      <div style={{
        background: 'rgba(4,8,16,0.92)',
        border: '1px solid rgba(180,130,60,0.18)',
        borderRadius: 8,
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '8px 12px',
          borderBottom: '1px solid rgba(180,130,60,0.15)',
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 12 }}>🖼️</span>
          <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#c87820', marginRight: 4 }}>
            Perk Tier Catalog
          </span>
          <div style={{ display: 'flex', gap: 3, marginLeft: 'auto' }}>
            {FILTER_OPTIONS.map(({ mode, label }) => {
              const active = filterMode === mode;
              const count = filterCounts[mode];
              return (
                <button
                  key={mode}
                  onClick={() => setFilterMode(mode)}
                  style={{
                    fontSize: 8,
                    fontWeight: 700,
                    letterSpacing: '0.10em',
                    textTransform: 'uppercase',
                    padding: '3px 7px',
                    borderRadius: 3,
                    border: active ? '1px solid #c8782066' : '1px solid rgba(255,255,255,0.1)',
                    background: active ? 'rgba(200,120,32,0.2)' : 'rgba(255,255,255,0.04)',
                    color: active ? '#c87820' : 'rgba(255,255,255,0.4)',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  <span>{label}</span>
                  <span
                    aria-label={`${count} ${label} perks`}
                    style={{
                      fontSize: 8,
                      fontWeight: 800,
                      letterSpacing: '0.04em',
                      padding: '1px 5px',
                      borderRadius: 8,
                      minWidth: 14,
                      textAlign: 'center',
                      background: active ? 'rgba(200,120,32,0.28)' : 'rgba(255,255,255,0.08)',
                      color: active ? '#ffd28a' : 'rgba(255,255,255,0.55)',
                      border: active ? '1px solid #c8782055' : '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {showTapHintBanner && (
          <div
            role="status"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 10px',
              background: 'linear-gradient(90deg, rgba(200,120,32,0.18), rgba(200,120,32,0.06))',
              borderBottom: '1px solid rgba(200,120,32,0.25)',
              fontSize: 10,
              color: '#ffd28a',
              letterSpacing: '0.04em',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: 'rgba(4,8,16,0.6)',
                border: '1px solid #c8782099',
                color: '#ffd28a',
                fontSize: 10,
                fontWeight: 800,
                fontFamily: 'serif',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              i
            </span>
            <span style={{ flex: 1, fontWeight: 600 }}>Tap a perk for details</span>
            <button
              type="button"
              onClick={dismissTapHint}
              aria-label="Dismiss tap hint"
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                padding: '3px 8px',
                borderRadius: 3,
                border: '1px solid rgba(200,120,32,0.4)',
                background: 'rgba(200,120,32,0.16)',
                color: '#ffd28a',
                cursor: 'pointer',
              }}
            >
              Got it
            </button>
          </div>
        )}

        <div style={{ overflowY: 'auto', maxHeight: compact ? 200 : 340 }}>
          {(() => {
            const rows = STAT_META.map(sm => {
            const statLevel = stats[sm.key];

            const tileMatchesFilter = (tierIndex: number): boolean => {
              const tierNumber = tierIndex + 1;
              const isUnlocked = statLevel >= tierNumber;
              const isNextUnlock = statLevel === tierIndex;
              if (filterMode === 'all') return true;
              if (filterMode === 'unlocked') return isUnlocked;
              if (filterMode === 'locked') return !isUnlocked;
              if (filterMode === 'next-unlock') return isNextUnlock;
              return true;
            };

            const visibleTiers = TIER_LABELS.filter((_, i) => tileMatchesFilter(i));
            if (visibleTiers.length === 0) return null;

            return (
              <div key={sm.key} style={{
                padding: '8px 12px',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
              }}>
                <div style={{
                  fontSize: 9, fontWeight: 700, color: sm.color,
                  letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6,
                }}>
                  {sm.abbr} — {sm.label}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {TIER_LABELS.map((tier, i) => {
                    if (!tileMatchesFilter(i)) return null;
                    const tierNumber = i + 1;
                    const cell = perkForCell(sm, tierNumber);
                    const perk = cell.perk;
                    const imgSrc = perkIconPath(sm.key, tierNumber);
                    const isUnlocked = statLevel >= tierNumber;
                    const isNextUnlock = statLevel === i;
                    const isPickable = cell.pickable;
                    const isAwaitingPick = cell.awaitingPick;
                    const onClickCell = isPickable && (tierNumber === 4 || tierNumber === 5)
                      ? () => setOpenChoice({ stat: sm.key, tier: tierNumber as ChoiceTier })
                      : undefined;

                    const tileKey = `${sm.key}-${i}`;
                    return (
                      <div
                        key={tier}
                        onClick={onClickCell}
                        onMouseEnter={perk ? (e) => handleMouseEnter(e, perk, sm, i, isUnlocked, imgSrc) : undefined}
                        onMouseLeave={perk ? handleMouseLeave : undefined}
                        onTouchStart={perk ? (e) => handleTileTouchStart(e, tileKey) : undefined}
                        onTouchEnd={perk ? (e) => handleTileTouchEnd(e, perk, sm, i, isUnlocked, imgSrc, tileKey) : undefined}
                        title={
                          isPickable ? `Choose your ${tierNumber === 4 ? 'active skill' : 'passive perk'}` :
                          isAwaitingPick ? 'Pick your Tier IV active first' :
                          undefined
                        }
                        style={{
                          width: 'calc(16.666% - 3.5px)',
                          aspectRatio: '1',
                          borderRadius: 4,
                          border: isPickable
                            ? `2px dashed ${sm.color}cc`
                            : isNextUnlock
                              ? `1.5px solid ${sm.color}cc`
                              : isUnlocked
                                ? `1px solid ${sm.color}66`
                                : `1px solid ${sm.color}22`,
                          background: isPickable
                            ? `linear-gradient(135deg, ${sm.color}28, ${sm.color}10)`
                            : isUnlocked
                              ? `linear-gradient(135deg, ${sm.color}18, ${sm.color}0c)`
                              : `linear-gradient(135deg, rgba(4,8,16,0.9), rgba(4,8,16,0.8))`,
                          display: 'flex', flexDirection: 'column',
                          alignItems: 'center', justifyContent: 'flex-start',
                          gap: 0,
                          cursor: onClickCell ? 'pointer' : 'default',
                          position: 'relative', overflow: 'hidden',
                          boxShadow: isPickable
                            ? `0 0 10px ${sm.color}66, inset 0 0 10px ${sm.color}22`
                            : isNextUnlock
                              ? `0 0 6px ${sm.color}44, inset 0 0 6px ${sm.color}18`
                              : 'none',
                          animation: isPickable ? 'perkPulse 1.6s ease-in-out infinite' : undefined,
                        }}
                      >
                        <img
                          src={imgSrc}
                          alt={perk?.perkName ?? tier}
                          draggable={false}
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                            const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
                            if (fallback) fallback.style.display = 'flex';
                          }}
                          style={{
                            width: '100%',
                            height: compact ? 28 : 44,
                            objectFit: 'cover',
                            borderRadius: '3px 3px 0 0',
                            display: 'block',
                            filter: isUnlocked ? 'none' : 'grayscale(100%) brightness(0.3)',
                            transition: 'filter 0.2s',
                          }}
                        />
                        <span
                          style={{
                            display: 'none',
                            fontSize: compact ? 10 : 14,
                            position: 'absolute',
                            top: compact ? 2 : 6,
                            left: 0, right: 0,
                            justifyContent: 'center',
                            filter: isUnlocked ? 'none' : 'grayscale(100%) opacity(0.3)',
                          }}
                        >
                          {perk?.icon ?? '□'}
                        </span>

                        {!isUnlocked && (
                          <div style={{
                            position: 'absolute',
                            top: 0, left: 0, right: 0,
                            height: compact ? 28 : 44,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 2,
                            pointerEvents: 'none',
                          }}>
                            <span style={{
                              fontSize: compact ? 9 : 12,
                              opacity: 0.55,
                              lineHeight: 1,
                            }}>🔒</span>
                          </div>
                        )}

                        {isPickable && (
                          <div style={{
                            position: 'absolute',
                            top: 0, left: 0, right: 0,
                            height: compact ? 28 : 44,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            zIndex: 2, pointerEvents: 'none',
                          }}>
                            <span style={{
                              fontSize: compact ? 8 : 10, fontWeight: 800,
                              color: sm.color, letterSpacing: '0.14em',
                              textShadow: `0 0 6px ${sm.color}`,
                            }}>PICK</span>
                          </div>
                        )}

                        {isTouchDevice && perk && !isPickable && !isAwaitingPick && (
                          <div
                            aria-hidden="true"
                            style={{
                              position: 'absolute',
                              top: 2,
                              right: 2,
                              width: 12,
                              height: 12,
                              borderRadius: '50%',
                              background: 'rgba(4,8,16,0.78)',
                              border: `1px solid ${sm.color}88`,
                              color: isUnlocked ? `${sm.color}` : 'rgba(255,255,255,0.55)',
                              fontSize: 9,
                              fontWeight: 800,
                              fontFamily: 'serif',
                              lineHeight: 1,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              zIndex: 3,
                              pointerEvents: 'none',
                              boxShadow: `0 0 4px ${sm.color}55`,
                            }}
                          >
                            i
                          </div>
                        )}

                        {isAwaitingPick && (
                          <div style={{
                            position: 'absolute',
                            top: 0, left: 0, right: 0,
                            height: compact ? 28 : 44,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            zIndex: 2, pointerEvents: 'none',
                          }}>
                            <span style={{
                              fontSize: compact ? 9 : 11,
                              opacity: 0.75,
                              lineHeight: 1,
                              color: sm.color,
                            }}>⤴</span>
                          </div>
                        )}

                        <span style={{
                          fontSize: 6, fontWeight: 700,
                          color: isUnlocked ? `${sm.color}cc` : 'rgba(255,255,255,0.25)',
                          letterSpacing: '0.06em', textTransform: 'uppercase',
                          padding: '1px 0 2px',
                          position: 'relative', zIndex: 1,
                          flexShrink: 0,
                        }}>
                          {tier.replace('TIER ', 'T')}
                        </span>
                        {!compact && perk && (
                          <span style={{
                            fontSize: 7,
                            color: isUnlocked ? `${sm.color}99` : 'rgba(255,255,255,0.18)',
                            textAlign: 'center', lineHeight: 1.2,
                            maxWidth: '90%', overflow: 'hidden',
                            whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                            position: 'relative', zIndex: 1,
                            paddingBottom: 2,
                          }}>
                            {perk.perkName}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
            });
            const hasContent = rows.some(r => r !== null);
            if (!hasContent) {
              return (
                <div style={{
                  padding: '24px 12px',
                  textAlign: 'center',
                  fontSize: 10,
                  color: 'rgba(255,255,255,0.3)',
                  fontWeight: 600,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                }}>
                  No perks match this filter
                </div>
              );
            }
            return rows;
          })()}
        </div>
      </div>

      {(pinnedPerk ?? hoveredPerk) && (
        <PerkHoverCard hovered={(pinnedPerk ?? hoveredPerk)!} pinned={!!pinnedPerk} />
      )}

      {openChoice && onChoosePerk && (
        <LevelUpChoiceModal
          stat={openChoice.stat}
          tier={openChoice.tier}
          onPick={(perkId) => {
            onChoosePerk(openChoice.stat, openChoice.tier, perkId);
            setOpenChoice(null);
          }}
          onClose={() => setOpenChoice(null)}
        />
      )}

      <style>{`
        @keyframes perkPulse {
          0%, 100% { filter: brightness(1); }
          50%      { filter: brightness(1.35); }
        }
      `}</style>
    </>
  );
};
