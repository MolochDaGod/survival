import React, { useMemo } from 'react';
import {
  TIER4_BY_STAT,
  TIER5_BY_STAT,
  baseHotkeyFor,
  type ActiveSkillDef,
  type PassivePerkDef,
} from '../game/progression/StatPerkChoices';
import { STAT_META, type GrudgeStats } from '../game/CharacterConfig';

export type ChoiceTier = 4 | 5;

interface LevelUpChoiceModalProps {
  stat: keyof GrudgeStats;
  tier: ChoiceTier;
  /** If true, render in a deferrable mode (Skip button visible). Defaults to true. */
  allowSkip?: boolean;
  onPick: (perkId: string) => void;
  onClose: () => void;
}

interface OptionCardProps {
  meta: { color: string; abbr: string; label: string };
  highlightColor: string;
  title: string;
  subtitle: string;
  description: string;
  icon: string;
  cooldownLabel?: string;
  costLabel?: string;
  onPick: () => void;
}

const OptionCard: React.FC<OptionCardProps> = ({
  meta, highlightColor, title, subtitle, description, icon, cooldownLabel, costLabel, onPick,
}) => (
  <button
    onClick={onPick}
    style={{
      flex: 1,
      minWidth: 200,
      background: 'linear-gradient(160deg, rgba(8,14,28,0.96) 0%, rgba(4,8,18,0.98) 100%)',
      border: `1px solid ${highlightColor}55`,
      borderRadius: 10,
      padding: '14px 14px 16px',
      color: '#e8d8b0',
      cursor: 'pointer',
      textAlign: 'left',
      transition: 'transform 0.12s ease, box-shadow 0.12s ease, border-color 0.12s ease',
      boxShadow: `0 4px 24px rgba(0,0,0,0.6), inset 0 1px 0 ${highlightColor}22`,
      fontFamily: 'inherit',
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.transform = 'translateY(-2px)';
      e.currentTarget.style.borderColor = `${highlightColor}cc`;
      e.currentTarget.style.boxShadow = `0 10px 36px rgba(0,0,0,0.75), 0 0 18px ${highlightColor}44, inset 0 1px 0 ${highlightColor}55`;
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.transform = 'translateY(0)';
      e.currentTarget.style.borderColor = `${highlightColor}55`;
      e.currentTarget.style.boxShadow = `0 4px 24px rgba(0,0,0,0.6), inset 0 1px 0 ${highlightColor}22`;
    }}
  >
    <div style={{
      height: 3,
      background: `linear-gradient(90deg, ${highlightColor}cc, ${highlightColor}33)`,
      borderRadius: 2,
      marginBottom: 12,
    }} />

    <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }}>
      <div style={{
        width: 56, height: 56,
        borderRadius: 8,
        border: `1px solid ${highlightColor}55`,
        background: `radial-gradient(circle at 30% 30%, ${highlightColor}33, ${meta.color}11 80%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 30, flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 800, lineHeight: 1.25,
          color: '#fff8e0', marginBottom: 3,
        }}>{title}</div>
        <div style={{
          fontSize: 9, fontWeight: 700, color: highlightColor,
          letterSpacing: '0.14em', textTransform: 'uppercase',
        }}>{subtitle}</div>
      </div>
    </div>

    <div style={{
      fontSize: 11, color: 'rgba(220,200,170,0.85)',
      lineHeight: 1.55,
      borderTop: `1px solid ${highlightColor}1a`,
      paddingTop: 10, marginBottom: 10,
      minHeight: 64,
    }}>
      {description}
    </div>

    {(cooldownLabel || costLabel) && (
      <div style={{ display: 'flex', gap: 8, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {cooldownLabel && (
          <span style={{
            padding: '3px 7px', borderRadius: 3,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.12)',
            color: '#cfd8dc',
          }}>⏱ {cooldownLabel}</span>
        )}
        {costLabel && (
          <span style={{
            padding: '3px 7px', borderRadius: 3,
            background: `${highlightColor}18`,
            border: `1px solid ${highlightColor}44`,
            color: highlightColor,
          }}>⚡ {costLabel}</span>
        )}
      </div>
    )}
  </button>
);

export const LevelUpChoiceModal: React.FC<LevelUpChoiceModalProps> = ({
  stat, tier, allowSkip = true, onPick, onClose,
}) => {
  const meta = useMemo(() => STAT_META.find(m => m.key === stat), [stat]);

  // Defensive: bail to onClose if an unknown stat key is somehow passed in (race / state desync).
  if (!meta) {
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.warn('[LevelUpChoiceModal] Unknown stat key:', stat);
    }
    onClose();
    return null;
  }

  const options: (ActiveSkillDef | PassivePerkDef)[] = tier === 4
    ? Array.from(TIER4_BY_STAT[stat])
    : Array.from(TIER5_BY_STAT[stat]);

  const tierLabel = tier === 4 ? 'TIER IV — ACTIVE SKILL' : 'TIER V — PASSIVE PERK';
  const tierBlurb = tier === 4
    ? `Choose one active ability. It binds to hotkey ${baseHotkeyFor(stat)} and upgrades automatically when this stat reaches Tier VI.`
    : 'Choose one passive bonus. Always-on; no hotkey.';

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 6000,
        background: 'rgba(0,0,0,0.78)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 32,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'linear-gradient(180deg, #0e1a26 0%, #050c14 100%)',
          border: `1px solid ${meta.color}55`,
          borderRadius: 14,
          maxWidth: 920, width: '100%',
          maxHeight: '90vh', overflowY: 'auto',
          padding: '22px 24px 24px',
          boxShadow: `0 20px 60px rgba(0,0,0,0.7), 0 0 32px ${meta.color}22`,
          color: '#e8d8b0', fontFamily: 'inherit',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: meta.color, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
              {meta.abbr} — {meta.label}
            </div>
            <h2 style={{
              margin: '4px 0 0 0',
              fontSize: 22, fontWeight: 800,
              color: '#fff8e0', letterSpacing: '0.06em',
            }}>{tierLabel}</h2>
          </div>
          {allowSkip && (
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.15)',
                color: 'rgba(255,255,255,0.6)',
                borderRadius: 6, padding: '6px 12px',
                fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Decide later
            </button>
          )}
        </div>

        <p style={{
          margin: '4px 0 18px 0',
          fontSize: 12, color: 'rgba(220,200,170,0.7)', lineHeight: 1.5,
        }}>
          {tierBlurb}
        </p>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {options.map((opt) => {
            const isActive = tier === 4;
            const active = opt as ActiveSkillDef;
            const passive = opt as PassivePerkDef;
            return (
              <OptionCard
                key={opt.id}
                meta={meta}
                highlightColor={isActive ? active.color : meta.color}
                title={opt.name}
                subtitle={isActive ? active.kind.replace(/_/g, ' ') : 'always-on passive'}
                description={opt.description}
                icon={opt.icon}
                cooldownLabel={isActive ? `${active.cooldownS}s CD` : undefined}
                costLabel={isActive && active.energyCost > 0 ? `${active.energyCost} EN` : undefined}
                onPick={() => onPick(opt.id)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};
