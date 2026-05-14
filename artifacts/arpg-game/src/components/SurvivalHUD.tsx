import React from 'react';
import { PlayerStats } from '../game/types';

interface SurvivalHUDProps {
  stats: PlayerStats;
}

/** Vitals stack — fixed bottom-right above the ability bar / minimap area. */
const VitalBar: React.FC<{
  icon: string;
  label: string;
  value: number;
  max: number;
  color: string;
  /** When true, the bar pulses red to grab attention (under 25%). */
  warn?: boolean;
}> = ({ icon, label, value, max, color, warn }) => {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const danger = warn ?? pct < 25;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
      <span style={{ fontSize: '14px', width: '18px', textAlign: 'center' }}>{icon}</span>
      <div style={{
        flex: 1, height: '10px', minWidth: '140px',
        background: 'rgba(0,0,0,0.55)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: '5px', overflow: 'hidden',
        position: 'relative',
      }}>
        <div style={{
          width: `${pct}%`, height: '100%',
          background: color,
          boxShadow: `0 0 6px ${color}`,
          transition: 'width 0.25s ease',
          animation: danger ? 'survivalPulse 0.9s ease-in-out infinite' : 'none',
        }} />
      </div>
      <span style={{
        fontFamily: 'monospace', fontSize: '10px',
        color: danger ? '#ff6b6b' : '#cdd2d8',
        minWidth: '52px', textAlign: 'right',
      }}>
        {label} {Math.floor(value)}
      </span>
    </div>
  );
};

export const SurvivalHUD: React.FC<SurvivalHUDProps> = ({ stats }) => {
  // Temperature is normalised to a 0-100 range using a comfort window.
  // 37 °C is the centre, anything outside [33,41] is dangerous.
  const tempPct = Math.max(0, Math.min(100, ((stats.temperature - 30) / 14) * 100));
  const tempColor = stats.temperature < 35
    ? '#4fc3f7'
    : stats.temperature > 39
      ? '#ff6b35'
      : '#86c34a';

  return (
    <>
      {/* Inline animation for the pulse — keeps the component self-contained
          rather than needing a global stylesheet. */}
      <style>{`
        @keyframes survivalPulse {
          0%,100% { opacity: 1; }
          50%     { opacity: 0.45; }
        }
      `}</style>
      <div style={{
        position: 'absolute',
        right: '20px', bottom: '20px',
        background: 'linear-gradient(180deg, rgba(10,16,24,0.85), rgba(6,10,14,0.95))',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '8px',
        padding: '12px 14px',
        minWidth: '240px',
        zIndex: 30,
        backdropFilter: 'blur(4px)',
        fontFamily: 'system-ui, sans-serif',
      }}>
        <div style={{
          fontSize: '10px', letterSpacing: '0.18em',
          color: '#7a8392', marginBottom: '8px',
          textTransform: 'uppercase',
        }}>
          Vitals
        </div>
        <VitalBar icon="❤️" label="HP"   value={stats.health}  max={stats.maxHealth}  color="#e53935" />
        <VitalBar icon="🍗" label="Hung" value={stats.hunger}  max={stats.maxHunger}  color="#ff8f00" />
        <VitalBar icon="💧" label="H₂O"  value={stats.thirst}  max={stats.maxThirst}  color="#29b6f6" />
        <VitalBar icon="⚡" label="Stam" value={stats.stamina} max={stats.maxStamina} color="#ffee58" />
        <VitalBar icon="🌙" label="Rest" value={stats.fatigue} max={stats.maxFatigue} color="#a78bfa" />
        <VitalBar
          icon={stats.temperature < 35 ? '🥶' : stats.temperature > 39 ? '🥵' : '🌡️'}
          label={`${stats.temperature.toFixed(1)}°`}
          value={tempPct}
          max={100}
          color={tempColor}
          warn={stats.temperature < 34 || stats.temperature > 40}
        />
        {(stats.bleeding || stats.infected) && (
          <div style={{
            marginTop: '6px', display: 'flex', gap: '6px',
            fontSize: '10px', fontFamily: 'monospace',
          }}>
            {stats.bleeding && (
              <span style={{ background: '#5a0c0c', color: '#ffb4b4', padding: '2px 6px', borderRadius: '3px' }}>
                🩸 BLEEDING
              </span>
            )}
            {stats.infected && (
              <span style={{ background: '#0c4a2c', color: '#a3f7c4', padding: '2px 6px', borderRadius: '3px' }}>
                🦠 INFECTED
              </span>
            )}
          </div>
        )}
      </div>
    </>
  );
};
