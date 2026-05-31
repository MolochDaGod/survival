import React, { useEffect, useRef } from 'react';
import { PlayerStats } from '../game/types';

// ─── Craftpix Unit Frame asset paths ───────────────────────────────────────────
const UF = '/textures/ui/unit-frames';
const UF_AVATAR_BG      = `${UF}/Avatar/UnitFrame_Avatar_Background.png`;
const UF_AVATAR_BORDER  = `${UF}/Avatar/UnitFrame_Avatar_Border.png`;
const UF_AVATAR_OVERLAY = `${UF}/Avatar/UnitFrame_Avatar_Overlay.png`;
const UF_PB_BG          = `${UF}/Bars/UnitFrame_PB_Background.png`;
const UF_PB_FILL        = `${UF}/Bars/UnitFrame_PB_Fill.png`;
const UF_SB_BG          = `${UF}/Bars/UnitFrame_SB_Background.png`;
const UF_SB_FILL        = `${UF}/Bars/UnitFrame_SB_Fill.png`;
const UF_LVL_BG         = `${UF}/Level Frame/UnitFrame_LevelFrame_Background.png`;
const UF_LVL_BORDER     = `${UF}/Level Frame/UnitFrame_LevelFrame_Border.png`;
const UF_LVL_SKULL      = `${UF}/Level Frame/UnitFrame_LevelFrame_Skull.png`;
const UF_ROLE_BG        = `${UF}/Role Frame/UnitFrame_RoleFrame_Background.png`;
const UF_ROLE_BORDER    = `${UF}/Role Frame/UnitFrame_RoleFrame_Border.png`;
const UF_ROLE_SWORD     = `${UF}/Role Frame/Icons/Sword_Small.png`;
const UF_ROLE_SHIELD    = `${UF}/Role Frame/Icons/Shield_Small.png`;
const UF_ROLE_SPELL     = `${UF}/Role Frame/Icons/Spell_Small.png`;
const UF_COMBO_BG       = `${UF}/Combo Points/UnitFrame_ComboPoints_Background.png`;
const UF_COMBO_FILL     = `${UF}/Combo Points/UnitFrame_ComboPoints_Fill.png`;
const UF_BUFF_FRAME     = `${UF}/UnitFrame_Buff_Frame.png`;
// Mobile (target frame)
const UF_MOB_BORDER     = `${UF}/Mobile_UnitFrame_Border.png`;
const UF_MOB_HP_FILL    = `${UF}/Mobile_UnitFrame_Fill_HP.png`;
const UF_MOB_MP_FILL    = `${UF}/Mobile_UnitFrame_Fill_MP.png`;
const UF_MOB_SKULL      = `${UF}/Mobile_UnitFrame_Skull.png`;

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
  /** Active weapon type for crosshair shape selection. */
  weaponType?: string;
  /** True when the crosshair is hovering over a hostile target. */
  onTarget?: boolean;
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
          transition: 'width 0.1s',
        }} />
      </div>
    </div>
  );
};

const HeartbeatRadar: React.FC<{ health: number; maxHealth: number; mana: number; maxMana: number; level: number }> = ({
  health, maxHealth, mana, maxMana, level,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef  = useRef(0);
  const rafRef    = useRef(0);
  const hpFrac = health / maxHealth;
  const mpFrac = mana / maxMana;

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

  const hpPct = Math.max(0, Math.min(100, (health / maxHealth) * 100));
  const mpPct = Math.max(0, Math.min(100, (mana / maxMana) * 100));

  return (
    <div style={{
      position: 'fixed', bottom: 20, left: 16, zIndex: 100,
      display: 'flex', alignItems: 'flex-end', gap: 0,
    }}>
      {/* Avatar frame area */}
      <div style={{
        width: 72, height: 72, position: 'relative', flexShrink: 0,
        marginRight: -6, zIndex: 2,
      }}>
        <img src={UF_AVATAR_BG} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
        {/* Heartbeat ECG canvas drawn inside avatar circle */}
        <canvas ref={canvasRef} width={60} height={28} style={{
          position: 'absolute', bottom: 8, left: 6, borderRadius: 4,
        }} />
        {/* Heart icon + vitals text */}
        <div style={{
          position: 'absolute', top: 6, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
        }}>
          <svg width="14" height="14" viewBox="0 0 20 20">
            <path d="M10 17L3 10a5 5 0 017-7l0 0a5 5 0 017 7z"
              fill={hpFrac > 0.5 ? '#d45050' : hpFrac > 0.25 ? '#e8a030' : '#ff2222'}
              style={{ filter: hpFrac < 0.25 ? 'drop-shadow(0 0 4px #ff2222)' : 'none' }} />
          </svg>
          <span style={{ ...monoStyle, fontSize: 7, color: hpFrac > 0.5 ? '#6ec96e' : '#d45050' }}>
            {hpFrac > 0.65 ? 'OK' : hpFrac > 0.35 ? '!' : '!!'}
          </span>
        </div>
        <img src={UF_AVATAR_BORDER} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
        <img src={UF_AVATAR_OVERLAY} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity: 0.4 }} />

        {/* Level badge */}
        <div style={{
          position: 'absolute', bottom: -8, right: -8,
          width: 28, height: 28,
        }}>
          <img src={UF_LVL_BG} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
          <img src={UF_LVL_BORDER} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
          <span style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            ...monoStyle, fontSize: 10, fontWeight: 700, color: '#fff',
            textShadow: '0 1px 2px rgba(0,0,0,0.8)',
          }}>{level}</span>
        </div>
      </div>

      {/* Bars panel */}
      <div style={{
        ...panelStyle, padding: '8px 12px 8px 14px',
        minWidth: 170, display: 'flex', flexDirection: 'column', gap: 4,
      }}>
        <Rivet pos="tr" /><Rivet pos="br" />

        {/* HP bar — textured */}
        <div style={{ position: 'relative', height: 16, overflow: 'hidden' }}>
          <img src={UF_PB_BG} alt="" style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill',
          }} />
          <div style={{ position: 'absolute', inset: 0, width: `${hpPct}%`, height: '100%', overflow: 'hidden', transition: 'width 0.12s' }}>
            <img src={UF_PB_FILL} alt="" style={{
              width: '100%', height: '100%', objectFit: 'fill',
              filter: hpFrac < 0.25 ? 'hue-rotate(-20deg) saturate(2)' : 'none',
            }} />
          </div>
          <span style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            ...monoStyle, fontSize: 9, color: '#fff',
            textShadow: '0 1px 2px rgba(0,0,0,0.8)',
          }}>{Math.floor(health)} / {maxHealth}</span>
        </div>

        {/* MP bar — textured */}
        <div style={{ position: 'relative', height: 14, overflow: 'hidden' }}>
          <img src={UF_SB_BG} alt="" style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill',
          }} />
          <div style={{ position: 'absolute', inset: 0, width: `${mpPct}%`, height: '100%', overflow: 'hidden', transition: 'width 0.12s' }}>
            <img src={UF_SB_FILL} alt="" style={{
              width: '100%', height: '100%', objectFit: 'fill',
            }} />
          </div>
          <span style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            ...monoStyle, fontSize: 8, color: '#cce',
            textShadow: '0 1px 2px rgba(0,0,0,0.8)',
          }}>{Math.floor(mana)} / {maxMana}</span>
        </div>

        {/* Role icon */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <div style={{ width: 20, height: 20, position: 'relative', flexShrink: 0 }}>
            <img src={UF_ROLE_BG} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
            <img src={UF_ROLE_SWORD} alt="" style={{ position: 'absolute', inset: 2, width: 16, height: 16 }} />
            <img src={UF_ROLE_BORDER} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
          </div>
          <span style={labelStyle}>Vitals</span>
          <span style={{ ...monoStyle, fontSize: 9, color: hpFrac > 0.5 ? '#6ec96e' : hpFrac > 0.25 ? '#e8a030' : '#d45050', marginLeft: 'auto' }}>
            {hpFrac > 0.65 ? 'STABLE' : hpFrac > 0.35 ? 'CAUTION' : 'CRITICAL'}
          </span>
        </div>

        <RadarDisplay />
      </div>
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

// ── Fortnite-style Dynamic Crosshair ─────────────────────────────────────────
//
// Weapon-aware reticle shapes with spread bloom, ADS collapse, hit markers,
// and target-lock colour feedback. Shapes per weapon type:
//   gun (pistol/smg)  → 4-line cross (classic Fortnite)
//   shotgun           → wide ring with 4 short ticks (spread indicator)
//   bow/crossbow      → chevron (triangle aim point)
//   melee/default     → small dot only
//
// Spread (0-1) drives the gap between lines/ring and the centre.
// Movement, firing, and jumping inflate spread; rest decays it.
// Colour: white normally, GOLD when ADS, red when on-target.

type CrosshairShape = 'cross' | 'shotgun_ring' | 'chevron' | 'dot';

function weaponTypeToShape(weaponType: string | undefined): CrosshairShape {
  switch (weaponType) {
    case 'gun':       return 'cross';        // pistol, rifle
    case 'smg':       return 'cross';
    case 'shotgun':   return 'shotgun_ring';  // spread indicator ring
    case 'bow':       return 'chevron';
    case 'crossbow':  return 'chevron';
    case 'staff':     return 'chevron';       // magic ranged
    case 'wand':      return 'chevron';
    default:          return 'dot';           // melee, unarmed
  }
}

interface CrosshairProps {
  isAiming: boolean;
  spread: number;
  hitMarkerTimer: number;
  weaponType?: string;
  onTarget?: boolean;
}

const DynamicCrosshair: React.FC<CrosshairProps> = ({
  isAiming, spread, hitMarkerTimer, weaponType, onTarget,
}) => {
  const shape = weaponTypeToShape(weaponType);
  const cx = 40;             // SVG centre
  const cy = 40;
  const sz = 80;             // SVG viewport
  const showHitMarker = hitMarkerTimer > 0;

  // Colour: red when on target, gold when ADS, white hip-fire
  const baseColor = onTarget ? '#ff4444' : isAiming ? GOLD : 'white';
  const baseOpacity = isAiming ? 0.92 : 0.78;

  // Spread drives gap for cross/ring reticles
  const gap = isAiming
    ? 2 + spread * 5
    : 4 + spread * 18;
  const lineLen = isAiming ? 6 : 9;

  // Shotgun ring radius
  const ringR = isAiming
    ? 8 + spread * 4
    : 12 + spread * 14;

  return (
    <div style={{
      position: 'fixed', top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
      zIndex: 100, pointerEvents: 'none',
    }}>
      <svg width={sz} height={sz} viewBox={`0 0 ${sz} ${sz}`}>

        {/* ── Cross reticle (pistol / SMG / rifle) ───────────────────── */}
        {shape === 'cross' && (
          <>
            {/* Centre dot */}
            <circle cx={cx} cy={cy} r={isAiming ? 1.2 : 1.8}
              fill={baseColor} opacity={0.9} />

            {/* ADS outer ring */}
            {isAiming && (
              <circle cx={cx} cy={cy} r={14 + spread * 4}
                fill="none" stroke={baseColor} strokeWidth="1" opacity="0.5" />
            )}

            {/* 4-line cross — gap expands with spread */}
            <line x1={cx} y1={cy - gap - lineLen} x2={cx} y2={cy - gap}
              stroke={baseColor} strokeWidth="2" opacity={baseOpacity}
              strokeLinecap="round" />
            <line x1={cx} y1={cy + gap} x2={cx} y2={cy + gap + lineLen}
              stroke={baseColor} strokeWidth="2" opacity={baseOpacity}
              strokeLinecap="round" />
            <line x1={cx - gap - lineLen} y1={cy} x2={cx - gap} y2={cy}
              stroke={baseColor} strokeWidth="2" opacity={baseOpacity}
              strokeLinecap="round" />
            <line x1={cx + gap} y1={cy} x2={cx + gap + lineLen} y2={cy}
              stroke={baseColor} strokeWidth="2" opacity={baseOpacity}
              strokeLinecap="round" />

            {/* Distance ticks (ADS only — small horizontal marks at 1/3 and 2/3 of each arm) */}
            {isAiming && [1/3, 2/3].map((frac, i) => {
              const tickY = cy - gap - lineLen * frac;
              return (
                <line key={i} x1={cx - 1.5} y1={tickY} x2={cx + 1.5} y2={tickY}
                  stroke={baseColor} strokeWidth="0.8" opacity="0.4" />
              );
            })}
          </>
        )}

        {/* ── Shotgun ring reticle ────────────────────────────────── */}
        {shape === 'shotgun_ring' && (
          <>
            {/* Centre dot */}
            <circle cx={cx} cy={cy} r={2} fill={baseColor} opacity={0.85} />

            {/* Spread ring */}
            <circle cx={cx} cy={cy} r={ringR}
              fill="none" stroke={baseColor} strokeWidth="1.5" opacity={baseOpacity}
              strokeDasharray={isAiming ? 'none' : '4 3'} />

            {/* 4 short ticks on the ring at cardinal points */}
            {[0, 90, 180, 270].map((deg) => {
              const rad = deg * Math.PI / 180;
              const x1 = cx + Math.cos(rad) * (ringR - 3);
              const y1 = cy + Math.sin(rad) * (ringR - 3);
              const x2 = cx + Math.cos(rad) * (ringR + 3);
              const y2 = cy + Math.sin(rad) * (ringR + 3);
              return (
                <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={baseColor} strokeWidth="2" opacity={baseOpacity}
                  strokeLinecap="round" />
              );
            })}
          </>
        )}

        {/* ── Chevron reticle (bow / crossbow) ───────────────────── */}
        {shape === 'chevron' && (
          <>
            {/* Chevron point (triangle pointing down) */}
            <polyline
              points={`${cx - 6 - spread * 4},${cy - 4 - spread * 3} ${cx},${cy + 2 + spread * 2} ${cx + 6 + spread * 4},${cy - 4 - spread * 3}`}
              fill="none" stroke={baseColor} strokeWidth="2" opacity={baseOpacity}
              strokeLinecap="round" strokeLinejoin="round" />

            {/* Tiny centre dot */}
            <circle cx={cx} cy={cy} r={1.2}
              fill={baseColor} opacity={0.9} />
          </>
        )}

        {/* ── Dot reticle (melee / default) ──────────────────────── */}
        {shape === 'dot' && (
          <circle cx={cx} cy={cy} r={2.5}
            fill={baseColor} opacity={0.6} />
        )}

        {/* ── Hit marker — 4 angled strokes at 45° ──────────────── */}
        {showHitMarker && (
          <g opacity="0.95">
            <line x1={cx-5} y1={cy-5} x2={cx-11} y2={cy-11} stroke="#ff3333" strokeWidth="2.5" strokeLinecap="round" />
            <line x1={cx+5} y1={cy-5} x2={cx+11} y2={cy-11} stroke="#ff3333" strokeWidth="2.5" strokeLinecap="round" />
            <line x1={cx-5} y1={cy+5} x2={cx-11} y2={cy+11} stroke="#ff3333" strokeWidth="2.5" strokeLinecap="round" />
            <line x1={cx+5} y1={cy+5} x2={cx+11} y2={cy+11} stroke="#ff3333" strokeWidth="2.5" strokeLinecap="round" />
          </g>
        )}
      </svg>
    </div>
  );
};

export const HUD: React.FC<HUDProps> = (props) => {
  const {
    stats, cameraMode, wave, killCount, score,
    weaponName, secondWeaponName, isAiming,
    playerPos, spread = 0, hitMarkerTimer = 0,
    weaponType, onTarget,
  } = props;
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

      {/* Bottom left – unit frame with heartbeat + radar */}
      <HeartbeatRadar health={stats.health} maxHealth={stats.maxHealth} mana={stats.mana} maxMana={stats.maxMana} level={stats.level} />

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
      <DynamicCrosshair
        isAiming={!!isAiming}
        spread={spread}
        hitMarkerTimer={hitMarkerTimer}
        weaponType={weaponType}
        onTarget={onTarget}
      />

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
