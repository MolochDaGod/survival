import React, { useEffect, useRef } from 'react';
import { PlayerStats } from '../game/types';

interface HUDProps {
  stats: PlayerStats;
  abilities: unknown[];
  cooldowns: Record<string, number>;
  cameraMode: string;
  wave: number;
  killCount: number;
  score: number;
  weaponName: string;
  secondWeaponName: string;
  isBlocking: boolean;
  isAiming?: boolean;
  playerPos?: { x: number; y: number; z: number };
  worldSize?: number;
  arenaRadius?: number;
  /** Crosshair spread 0 (tight) → 1 (max bloom). Driven by PlayerController. */
  spread?: number;
  /** >0 while a hit marker should be visible. Counts down in ms. */
  hitMarkerTimer?: number;
}

const GOLD  = '#c9950a';
const GOLD2 = '#8a6620';
const PANEL = 'rgba(18,9,4,0.88)';
const BORDER = `1px solid ${GOLD2}`;

const panelStyle: React.CSSProperties = {
  background: PANEL,
  border: `1px solid ${GOLD}`,
  borderRadius: 8,
  backdropFilter: 'blur(6px)',
  boxShadow: `0 0 18px rgba(0,0,0,0.7), inset 0 0 12px rgba(0,0,0,0.5), 0 0 6px rgba(201,149,10,0.15)`,
  position: 'relative',
};

const labelStyle: React.CSSProperties = {
  fontFamily: '"Cinzel", serif',
  fontSize: 9,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: GOLD,
};

const monoStyle: React.CSSProperties = {
  fontFamily: '"JetBrains Mono", monospace',
};

const Rivet: React.FC<{ pos: 'tl' | 'tr' | 'bl' | 'br' }> = ({ pos }) => {
  const s: React.CSSProperties = {
    position: 'absolute', width: 5, height: 5, borderRadius: '50%',
    background: GOLD, border: '1px solid #fff4',
    boxShadow: '0 0 4px gold',
    zIndex: 2,
    ...(pos === 'tl' ? { top: 3, left: 3 } : {}),
    ...(pos === 'tr' ? { top: 3, right: 3 } : {}),
    ...(pos === 'bl' ? { bottom: 3, left: 3 } : {}),
    ...(pos === 'br' ? { bottom: 3, right: 3 } : {}),
  };
  return <div style={s} />;
};

const StatBar: React.FC<{ value: number; max: number; color: string; label: string; width?: number }> = ({
  value, max, color, label, width = 140,
}) => {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div style={{ marginBottom: 5 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
        <span style={{ ...labelStyle, fontSize: 8 }}>{label}</span>
        <span style={{ ...monoStyle, fontSize: 9, color: '#ddd' }}>{Math.floor(value)}</span>
      </div>
      <div style={{
        width, height: 6,
        background: 'rgba(0,0,0,0.7)',
        border: `1px solid ${GOLD2}`,
        borderRadius: 3, overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`, height: '100%',
          background: `linear-gradient(90deg, ${color}88, ${color})`,
          borderRadius: 3,
          boxShadow: `0 0 6px ${color}66`,
          transition: 'width 0.2s',
        }} />
      </div>
    </div>
  );
};

const HeartbeatRadar: React.FC<{ health: number; maxHealth: number }> = ({ health, maxHealth }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef  = useRef(0);
  const rafRef    = useRef(0);
  const hpFrac = health / maxHealth;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    let t = 0;

    function drawECG() {
      ctx!.clearRect(0, 0, W, H);

      const speed = hpFrac > 0.5 ? 0.8 : hpFrac > 0.25 ? 1.4 : 2.2;
      t += speed / 60;
      phaseRef.current = t;

      ctx!.strokeStyle = hpFrac > 0.5 ? '#6ec96e' : hpFrac > 0.25 ? '#e8a030' : '#d45050';
      ctx!.lineWidth = 1.5;
      ctx!.shadowColor = ctx!.strokeStyle;
      ctx!.shadowBlur = 6;
      ctx!.beginPath();

      const steps = W;
      for (let i = 0; i < steps; i++) {
        const x = i;
        const phase = (i / steps + t) % 1;
        let y = H / 2;

        const beatPhase = phase % 0.4;
        if (beatPhase < 0.05) y -= Math.sin(beatPhase / 0.05 * Math.PI) * (H * 0.15);
        else if (beatPhase < 0.09) y += Math.sin((beatPhase - 0.05) / 0.04 * Math.PI) * (H * 0.4);
        else if (beatPhase < 0.14) y -= Math.sin((beatPhase - 0.09) / 0.05 * Math.PI) * (H * 0.2);

        if (i === 0) ctx!.moveTo(x, y);
        else ctx!.lineTo(x, y);
      }
      ctx!.stroke();

      rafRef.current = requestAnimationFrame(drawECG);
    }

    drawECG();
    return () => cancelAnimationFrame(rafRef.current);
  }, [hpFrac]);

  return (
    <div style={{ ...panelStyle, padding: '10px 12px', width: 200, position: 'fixed', bottom: 20, left: 16, zIndex: 100 }}>
      <Rivet pos="tl" /><Rivet pos="tr" /><Rivet pos="bl" /><Rivet pos="br" />

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
        <svg width="10" height="10" viewBox="0 0 20 20">
          <path d="M10 17L3 10a5 5 0 017-7l0 0a5 5 0 017 7z"
            fill={hpFrac > 0.5 ? '#d45050' : hpFrac > 0.25 ? '#e8a030' : '#ff2222'}
            style={{ filter: hpFrac < 0.25 ? 'drop-shadow(0 0 4px #ff2222)' : 'none' }} />
        </svg>
        <span style={labelStyle}>Vitals</span>
        <span style={{ ...monoStyle, fontSize: 9, color: hpFrac > 0.5 ? '#6ec96e' : hpFrac > 0.25 ? '#e8a030' : '#d45050', marginLeft: 'auto' }}>
          {hpFrac > 0.65 ? 'STABLE' : hpFrac > 0.35 ? 'CAUTION' : 'CRITICAL'}
        </span>
      </div>

      <canvas ref={canvasRef} width={176} height={32} style={{ display: 'block', marginBottom: 8 }} />

      <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 6 }}>
        <div style={{
          flex: 1, height: 4, borderRadius: 2, overflow: 'hidden',
          background: 'rgba(0,0,0,0.5)', border: `1px solid ${GOLD2}`,
        }}>
          <div style={{
            width: `${(health / maxHealth) * 100}%`, height: '100%',
            background: 'linear-gradient(90deg,#8b2020,#d44040)',
            transition: 'width 0.3s',
          }} />
        </div>
        <span style={{ ...monoStyle, fontSize: 9, color: '#d44040', minWidth: 28, textAlign: 'right' }}>
          {Math.floor(health)}
        </span>
      </div>

      <RadarDisplay />
    </div>
  );
};

const RadarDisplay: React.FC = () => {
  const SIZE = 70;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ position: 'relative', width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ position: 'absolute', inset: 0 }}>
          <circle cx={SIZE/2} cy={SIZE/2} r={SIZE/2 - 1} fill="rgba(0,0,0,0.6)" stroke={GOLD2} strokeWidth="1" />
          <circle cx={SIZE/2} cy={SIZE/2} r={SIZE/3} fill="none" stroke={GOLD2} strokeWidth="0.5" strokeDasharray="2 3" opacity="0.4" />
          <circle cx={SIZE/2} cy={SIZE/2} r={SIZE/6} fill="none" stroke={GOLD2} strokeWidth="0.5" strokeDasharray="2 3" opacity="0.4" />
          <line x1={SIZE/2} y1="2" x2={SIZE/2} y2={SIZE-2} stroke={GOLD2} strokeWidth="0.5" opacity="0.3" />
          <line x1="2" y1={SIZE/2} x2={SIZE-2} y2={SIZE/2} stroke={GOLD2} strokeWidth="0.5" opacity="0.3" />
          <circle cx={SIZE/2} cy={SIZE/2} r="3" fill={GOLD} />
          <circle cx={SIZE/2} cy={SIZE/2} r="3" fill={GOLD} opacity="0.5">
            <animate attributeName="r" values="3;7;3" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.5;0;0.5" dur="2s" repeatCount="indefinite" />
          </circle>
        </svg>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ ...labelStyle, fontSize: 8, marginBottom: 4 }}>Radar</div>
        <div style={{ ...monoStyle, fontSize: 9, color: '#667' }}>No hostiles</div>
        <div style={{ ...monoStyle, fontSize: 8, color: '#445', marginTop: 2 }}>r = 80m</div>
      </div>
    </div>
  );
};

// ── Dynamic Crosshair ────────────────────────────────────────────────────────
//
// Spread-responsive crosshair with hit markers. The four lines expand/contract
// based on `spread` (0–1). ADS collapses to a tight circle + dot. Hit markers
// flash 4 angled strokes for 150ms when hitMarkerTimer > 0.

const DynamicCrosshair: React.FC<{ isAiming: boolean; spread: number; hitMarkerTimer: number }> = ({
  isAiming, spread, hitMarkerTimer,
}) => {
  // Spread drives the gap between each line and the centre dot.
  // At spread=0 the gap is 3px (tight); at spread=1 the gap is 18px (max bloom).
  const gap = isAiming
    ? 2 + spread * 4           // ADS: very tight, minimal bloom
    : 3 + spread * 15;         // Hip-fire: full bloom range
  const lineLen = isAiming ? 5 : 7;
  const cx = 32;               // SVG centre
  const cy = 32;
  const sz = 64;               // SVG viewport
  const lineColor = isAiming ? GOLD : 'white';
  const lineOpacity = isAiming ? 0.9 : 0.75;
  const showHitMarker = hitMarkerTimer > 0;

  return (
    <div style={{
      position: 'fixed', top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
      zIndex: 100, pointerEvents: 'none',
    }}>
      <svg width={sz} height={sz} viewBox={`0 0 ${sz} ${sz}`}>
        {/* Centre dot */}
        <circle cx={cx} cy={cy} r={isAiming ? 1.5 : 2}
          fill={lineColor} opacity={isAiming ? 0.95 : 0.7} />

        {/* ADS outer ring */}
        {isAiming && (
          <circle cx={cx} cy={cy} r={12 + spread * 3}
            fill="none" stroke={GOLD} strokeWidth="1" opacity="0.7" />
        )}

        {/* Top line */}
        <line x1={cx} y1={cy - gap - lineLen} x2={cx} y2={cy - gap}
          stroke={lineColor} strokeWidth="1.5" opacity={lineOpacity} />
        {/* Bottom line */}
        <line x1={cx} y1={cy + gap} x2={cx} y2={cy + gap + lineLen}
          stroke={lineColor} strokeWidth="1.5" opacity={lineOpacity} />
        {/* Left line */}
        <line x1={cx - gap - lineLen} y1={cy} x2={cx - gap} y2={cy}
          stroke={lineColor} strokeWidth="1.5" opacity={lineOpacity} />
        {/* Right line */}
        <line x1={cx + gap} y1={cy} x2={cx + gap + lineLen} y2={cy}
          stroke={lineColor} strokeWidth="1.5" opacity={lineOpacity} />

        {/* Hit marker — 4 angled strokes at 45° */}
        {showHitMarker && (
          <g opacity="0.9">
            <line x1={cx-4} y1={cy-4} x2={cx-9} y2={cy-9} stroke="#ff3333" strokeWidth="2" />
            <line x1={cx+4} y1={cy-4} x2={cx+9} y2={cy-9} stroke="#ff3333" strokeWidth="2" />
            <line x1={cx-4} y1={cy+4} x2={cx-9} y2={cy+9} stroke="#ff3333" strokeWidth="2" />
            <line x1={cx+4} y1={cy+4} x2={cx+9} y2={cy+9} stroke="#ff3333" strokeWidth="2" />
          </g>
        )}
      </svg>
    </div>
  );
};

export const HUD: React.FC<HUDProps> = ({
  stats, cameraMode, wave, killCount, score,
  weaponName, secondWeaponName, isAiming,
  playerPos, spread = 0, hitMarkerTimer = 0,
}) => {
  const hpFrac = stats.health / stats.maxHealth;

  return (
    <>
      {/* Top center – minimal mission info */}
      <div style={{
        position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 12, alignItems: 'center',
        ...panelStyle, padding: '6px 20px', zIndex: 100,
      }}>
        <Rivet pos="tl" /><Rivet pos="tr" />
        <InfoChip label="Wave" value={String(wave)} color="#ff6b35" />
        <Divider />
        <InfoChip label="Kills" value={String(killCount)} color="#6ec96e" />
        <Divider />
        <InfoChip label="Score" value={String(score)} color="#fff176" />
      </div>

      {/* Top right – camera mode + level */}
      <div style={{
        position: 'fixed', top: 12, right: 14,
        ...panelStyle, padding: '7px 13px', zIndex: 100, minWidth: 148,
      }}>
        <Rivet pos="tl" /><Rivet pos="tr" />
        <div style={{ ...labelStyle, fontSize: 8, marginBottom: 4 }}>
          {cameraMode === 'first-person' ? '👁 First Person'
            : cameraMode === 'third-person' ? '🎥 Third Person'
            : '⚔ ARPG View'}
        </div>
        <div style={{ ...monoStyle, fontSize: 12, color: '#fff176', fontWeight: 700 }}>
          LVL {stats.level}
        </div>
        <div style={{ ...monoStyle, fontSize: 9, color: '#667' }}>
          F1/F2/F3 · V cycle
        </div>
      </div>

      {/* Top left – position */}
      {playerPos && (
        <div style={{
          position: 'fixed', top: 12, left: 14,
          ...panelStyle, padding: '6px 10px', zIndex: 100,
        }}>
          <div style={{ ...monoStyle, fontSize: 10, color: '#6ec96e' }}>
            {playerPos.x.toFixed(0)} / {playerPos.z.toFixed(0)}
          </div>
          <div style={{ ...monoStyle, fontSize: 9, color: '#445' }}>
            Y: {playerPos.y.toFixed(1)}
          </div>
        </div>
      )}

      {/* Bottom left – heartbeat + radar */}
      <HeartbeatRadar health={stats.health} maxHealth={stats.maxHealth} />

      {/* Bottom right – weapon */}
      <div style={{
        position: 'fixed', bottom: 20, right: 14,
        ...panelStyle, padding: '10px 14px', zIndex: 100, minWidth: 160, textAlign: 'right',
      }}>
        <Rivet pos="tl" /><Rivet pos="tr" /><Rivet pos="bl" /><Rivet pos="br" />
        <div style={{ ...labelStyle, fontSize: 8, marginBottom: 4 }}>Equipped</div>
        <div style={{ ...monoStyle, fontSize: 14, color: '#f5e2c1', fontWeight: 700, marginBottom: 2 }}>
          ⚔ {weaponName}
        </div>
        <div style={{ ...monoStyle, fontSize: 11, color: '#6b5535' }}>{secondWeaponName}</div>
        <div style={{ ...labelStyle, fontSize: 8, color: '#5a4020', marginTop: 4 }}>
          {isAiming ? '🔴 AIMING' : 'Q · Swap'}
        </div>
      </div>

      {/* Dynamic Crosshair */}
      <DynamicCrosshair isAiming={!!isAiming} spread={spread} hitMarkerTimer={hitMarkerTimer} />

      {/* Bottom center – stamina + mana slim bars */}
      <div style={{
        position: 'fixed', bottom: 14, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center',
        zIndex: 100,
      }}>
        <SlimBar value={stats.stamina} max={stats.maxStamina ?? 100} color="#ff9800" width={220} />
        <SlimBar value={stats.mana} max={stats.maxMana} color="#3a7ad8" width={180} />
      </div>

      {/* Low health vignette */}
      {hpFrac < 0.3 && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 99, pointerEvents: 'none',
          background: `radial-gradient(ellipse at center, transparent 40%, rgba(200,20,20,${0.25 - hpFrac * 0.5}) 100%)`,
          animation: hpFrac < 0.15 ? 'pulseRed 1s ease-in-out infinite' : 'none',
        }} />
      )}

      <style>{`
        @keyframes pulseRed {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
      `}</style>
    </>
  );
};

const SlimBar: React.FC<{ value: number; max: number; color: string; width: number }> = ({ value, max, color, width }) => (
  <div style={{
    width, height: 3, borderRadius: 2, overflow: 'hidden',
    background: 'rgba(0,0,0,0.5)',
    border: '1px solid rgba(255,255,255,0.07)',
  }}>
    <div style={{
      width: `${Math.max(0, Math.min(100, (value / max) * 100))}%`,
      height: '100%',
      background: color,
      boxShadow: `0 0 4px ${color}`,
      transition: 'width 0.2s',
    }} />
  </div>
);

const InfoChip: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => (
  <div style={{ textAlign: 'center' }}>
    <div style={{ ...labelStyle, fontSize: 8, marginBottom: 1 }}>{label}</div>
    <div style={{ ...monoStyle, fontSize: 16, fontWeight: 700, color }}>{value}</div>
  </div>
);

const Divider: React.FC = () => (
  <div style={{ width: 1, height: 26, background: GOLD2 }} />
);
