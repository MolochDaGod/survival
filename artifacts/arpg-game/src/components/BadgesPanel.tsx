import React, { useState } from 'react';
import { GrudgeStats, STAT_META, getBadgesEarned, getBadgesPreview, Badge } from '../game/CharacterConfig';

interface BadgesPanelProps {
  stats: GrudgeStats;
}

interface HexBadgeProps {
  badge: Badge;
  earned: boolean;
  color: string;
}

const HexBadge: React.FC<HexBadgeProps> = ({ badge, earned, color }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{
        width: 42, height: 42,
        clipPath: 'polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)',
        background: earned
          ? `linear-gradient(135deg, ${color}40, ${color}18)`
          : 'rgba(255,255,255,0.03)',
        border: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'default',
        boxShadow: earned ? `0 0 12px ${color}44` : 'none',
        outline: earned ? `1.5px solid ${color}66` : '1.5px solid rgba(255,255,255,0.08)',
        outlineOffset: -1,
        transition: 'all 0.2s ease',
        filter: earned ? 'none' : 'grayscale(1) opacity(0.35)',
      }}>
        <span style={{ fontSize: 16, filter: earned ? `drop-shadow(0 0 4px ${color})` : 'none' }}>
          {badge.icon}
        </span>
      </div>
      {earned && (
        <div style={{
          position: 'absolute', bottom: -3, left: '50%', transform: 'translateX(-50%)',
          width: 8, height: 8, borderRadius: '50%',
          background: color,
          boxShadow: `0 0 6px ${color}`,
        }} />
      )}

      {hovered && (
        <div style={{
          position: 'absolute', bottom: '110%', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(4,10,18,0.97)',
          border: `1px solid ${color}66`,
          borderRadius: 6, padding: '7px 10px',
          minWidth: 150, maxWidth: 200,
          zIndex: 100,
          pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color, marginBottom: 3 }}>
            {earned ? '' : '🔒 '}{badge.perkName}
          </div>
          <div style={{ fontSize: 10, color: '#8899aa', lineHeight: 1.4 }}>
            {badge.perkDesc}
          </div>
          {!earned && (
            <div style={{ fontSize: 9, color: '#556677', marginTop: 4 }}>
              Reach {badge.statKey.toUpperCase()} {badge.milestone} to unlock
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const BadgesPanel: React.FC<BadgesPanelProps> = ({ stats }) => {
  const earned  = getBadgesEarned(stats);
  const preview = getBadgesPreview(stats);
  const earnedCount = earned.length;

  const isEarned = (badge: Badge) =>
    earned.some(e => e.statKey === badge.statKey && e.milestone === badge.milestone);

  return (
    <div style={{
      background: 'rgba(4,8,16,0.9)',
      border: '1px solid rgba(180,130,60,0.2)',
      borderRadius: 8,
      padding: '10px 12px',
      backdropFilter: 'blur(8px)',
    }}>
      <div style={{
        fontSize: 8, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase',
        color: '#c87820', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span>⬡</span>
        Badges & Perks
        <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: earnedCount > 0 ? '#e8a030' : '#445566' }}>
          {earnedCount} earned
        </span>
      </div>

      {STAT_META.map(sm => {
        const allBadges: Badge[] = Array.from({ length: 6 }, (_, i) => ({
          statKey: sm.key,
          milestone: i + 1,
          perkName: '',
          perkDesc: '',
          icon: '',
        }));
        const earnedForStat  = earned.filter(b => b.statKey === sm.key);
        const previewForStat = preview.filter(b => b.statKey === sm.key);

        const badges = allBadges.map((_, i) => {
          const m = i + 1;
          const e = earnedForStat.find(b => b.milestone === m);
          const p = previewForStat.find(b => b.milestone === m);
          return e || p || null;
        });

        const hasSomething = earnedForStat.length > 0 || previewForStat.length > 0;
        if (!hasSomething && stats[sm.key] === 0) return null;

        return (
          <div key={sm.key} style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 9, color: sm.color, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 5 }}>
              {sm.abbr} — {sm.label}
            </div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {badges.map((badge, i) => badge ? (
                <HexBadge
                  key={i}
                  badge={badge}
                  earned={isEarned(badge)}
                  color={sm.color}
                />
              ) : (
                <div
                  key={i}
                  style={{
                    width: 42, height: 42,
                    clipPath: 'polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)',
                    background: 'rgba(255,255,255,0.015)',
                    outline: '1.5px solid rgba(255,255,255,0.04)',
                    outlineOffset: -1,
                  }}
                />
              ))}
            </div>
          </div>
        );
      })}

      {earnedCount === 0 && (
        <div style={{ fontSize: 10, color: '#334455', textAlign: 'center', paddingTop: 8, lineHeight: 1.6 }}>
          Assign stat points to earn badges<br />and unlock perks
        </div>
      )}
    </div>
  );
};
