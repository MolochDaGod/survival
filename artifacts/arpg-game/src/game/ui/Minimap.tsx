/**
 * Minimap — circular Canvas2D HUD showing the 100m player bubble.
 *
 * Layers (bottom to top):
 *   1. Terrain color (biome-tinted flat fill per cell — pre-baked image)
 *   2. Fog-of-war mask (from FogOfWar.getMinimapCanvas)
 *   3. Resource icons (only if cell is revealed)
 *   4. Building squares
 *   5. NPC dots — drawn using craftpix Unit marker sprites
 *   6. Player dot (white, always center)
 *   7. Circular clip + gloom vignette
 *
 * The map rotates with the player's yaw so forward is always up.
 * Runs at 10 fps to stay cheap (canvas redraw is not free).
 *
 * Visual frame uses craftpix RPG-MMO-UI textures:
 *   Minimap_MenuBorder, Minimap_Glow, Minimap_Shadow for the frame,
 *   Unit_Green / Red / Orange / Purple + Boss_Alive / Boss_Dead for markers,
 *   BML/BMS button backgrounds + icon PNGs for minimap action buttons.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { getSpatialTracker, EntityType } from '../SpatialTracker';
import { getFogOfWar } from '../world/FogOfWar';

// ─── Constants ────────────────────────────────────────────────────────────────

const SIZE          = 180;           // canvas px (circular, so diameter)
const RADIUS        = SIZE / 2;
const WORLD_TO_PX   = SIZE / 200;    // 200 m = full minimap width
const UPDATE_MS     = 100;           // 10 fps
const MARKER_SIZE   = 10;            // px size to draw marker sprites

// ─── Asset paths (served from public/textures/ui/minimap) ─────────────────────
const UI = '/textures/ui/minimap';
const FRAME_BORDER = `${UI}/Minimap_MenuBorder.png`;
const FRAME_GLOW   = `${UI}/Minimap_Glow.png`;
const FRAME_SHADOW = `${UI}/Minimap_Shadow.png`;

const MARKER_IMGS: Record<string, string> = {
  friendly: `${UI}/Markers/Unit_Green.png`,
  neutral:  `${UI}/Markers/Unit_Orange.png`,
  hostile:  `${UI}/Markers/Unit_Red.png`,
  unknown:  `${UI}/Markers/Unit_Purple.png`,
  boss:     `${UI}/Markers/Boss_Alive.png`,
  bossDead: `${UI}/Markers/Boss_Dead.png`,
};

// Icon buttons around the minimap ring
const MINIMAP_BUTTONS: { icon: string; label: string; action: string }[] = [
  { icon: `${UI}/Buttons/Icons/Menu.png`,      label: 'Menu',      action: 'menu' },
  { icon: `${UI}/Buttons/Icons/Profile.png`,   label: 'Profile',   action: 'profile' },
  { icon: `${UI}/Buttons/Icons/Spellbook.png`, label: 'Spellbook', action: 'spellbook' },
  { icon: `${UI}/Buttons/Icons/Talents.png`,   label: 'Talents',   action: 'talents' },
  { icon: `${UI}/Buttons/Icons/Settings.png`,  label: 'Settings',  action: 'settings' },
];
const BTN_BG   = `${UI}/Buttons/Minimap_BMS_Background.png`;
const BTN_BRDR = `${UI}/Buttons/Minimap_BMS_Border.png`;

// Faction colors (fallback when marker image not yet loaded)
const FACTION_COLOR: Record<string, string> = {
  friendly: '#44ff88',
  neutral:  '#ffdd44',
  hostile:  '#ff4444',
  unknown:  '#aaaaaa',
};

// EntityType colors (fallback)
const TYPE_COLOR: Record<string, string> = {
  [EntityType.NPC]:      '#44ff88',
  [EntityType.ENEMY]:    '#ff4444',
  [EntityType.PLAYER]:   '#ffffff',
  [EntityType.BUILDING]: '#bbaa66',
  [EntityType.PROP]:     '#66ccff',
  [EntityType.CAMP]:     '#ff8844',
};

// Pre-load marker images once so ctx.drawImage can use them.
const markerCache: Record<string, HTMLImageElement> = {};
function getMarkerImg(key: string): HTMLImageElement | null {
  if (markerCache[key]) return markerCache[key].complete ? markerCache[key] : null;
  const src = MARKER_IMGS[key];
  if (!src) return null;
  const img = new Image();
  img.src = src;
  markerCache[key] = img;
  return null; // not yet loaded
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface MinimapProps {
  /** Player world-space X */
  playerX: number;
  /** Player world-space Z */
  playerZ: number;
  /** Player yaw in radians (0 = south, increases clockwise) */
  playerYaw: number;
  /** Gloom level 0–1 from FogSystem */
  gloom?: number;
  /** CSS className for the wrapper */
  className?: string;
}

// ─── Minimap component ────────────────────────────────────────────────────────

export const Minimap: React.FC<MinimapProps> = ({
  playerX, playerZ, playerYaw, gloom = 0, className,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);
  const lastDrawRef = useRef<number>(0);

  // Capture latest props in a ref so the draw loop always sees fresh values
  const propsRef = useRef({ playerX, playerZ, playerYaw, gloom });
  useEffect(() => {
    propsRef.current = { playerX, playerZ, playerYaw, gloom };
  });

  const draw = useCallback(() => {
    const now = performance.now();
    if (now - lastDrawRef.current < UPDATE_MS) {
      rafRef.current = requestAnimationFrame(draw);
      return;
    }
    lastDrawRef.current = now;

    const canvas = canvasRef.current;
    if (!canvas) { rafRef.current = requestAnimationFrame(draw); return; }

    const ctx = canvas.getContext('2d');
    if (!ctx)  { rafRef.current = requestAnimationFrame(draw); return; }

    const { playerX: px, playerZ: pz, playerYaw: yaw, gloom: gl } = propsRef.current;
    const fow     = getFogOfWar();
    const tracker = getSpatialTracker();

    ctx.clearRect(0, 0, SIZE, SIZE);

    // ── 1. Background (dark fog) ────────────────────────────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.arc(RADIUS, RADIUS, RADIUS, 0, Math.PI * 2);
    ctx.clip();

    const bg = ctx.createRadialGradient(RADIUS, RADIUS, 0, RADIUS, RADIUS, RADIUS);
    bg.addColorStop(0,   `rgba(10, 14, 22, ${0.55 + gl * 0.25})`);
    bg.addColorStop(0.7, `rgba(6,  9,  18, ${0.70 + gl * 0.20})`);
    bg.addColorStop(1,   `rgba(4,  6,  14, 0.92)`);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // ── 2. Rotate canvas to player yaw (forward = up) ──────────────────────
    ctx.translate(RADIUS, RADIUS);
    // Three.js yaw: 0 = looking at -Z, positive = clockwise when viewed from above.
    // Minimap convention: top = player forward = -Z.
    ctx.rotate(-yaw);   // rotate map so player's forward direction points up
    ctx.translate(-RADIUS, -RADIUS);

    // ── 3. Fog-of-war overlay ───────────────────────────────────────────────
    // We draw the fog tile that covers the visible area around the player.
    // The FoW canvas covers the full world; we need to sample the region
    // [px-100, pz-100] to [px+100, pz+100] mapped to the minimap square.
    const worldWindow = 100;   // metres shown each side
    const fowCanvas   = fow.getMinimapCanvas(512); // full-world fog canvas

    // Source rect in fog canvas: fraction of world covered by minimap
    const WORLD_SIZE = 6400;
    const GRID_SIZE  = 512;
    // World [px-100, pz-100] → [px+100, pz+100]
    const sx = ((px - worldWindow + WORLD_SIZE * 0.5) / WORLD_SIZE) * GRID_SIZE;
    const sy = ((pz - worldWindow + WORLD_SIZE * 0.5) / WORLD_SIZE) * GRID_SIZE;
    const sw = (worldWindow * 2 / WORLD_SIZE) * GRID_SIZE;

    ctx.globalAlpha = 0.85;
    try {
      ctx.drawImage(fowCanvas as CanvasImageSource, sx, sy, sw, sw, 0, 0, SIZE, SIZE);
    } catch { /* canvas not ready */ }
    ctx.globalAlpha = 1.0;

    // ── 4. Resource dots (only revealed cells) ──────────────────────────────
    const nearby = tracker.query(px, pz, worldWindow, [EntityType.PROP]);
    for (const e of nearby) {
      if (!fow.isRevealed(e.position.x, e.position.z)) continue;
      const sx2 = (e.position.x - px) * WORLD_TO_PX + RADIUS;
      const sy2 = (e.position.z - pz) * WORLD_TO_PX + RADIUS;
      ctx.beginPath();
      ctx.arc(sx2, sy2, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = TYPE_COLOR[EntityType.PROP];
      ctx.fill();
    }

    // ── 5. Buildings ────────────────────────────────────────────────────────
    const buildings = tracker.query(px, pz, worldWindow, EntityType.BUILDING);
    for (const b of buildings) {
      if (!fow.isRevealed(b.position.x, b.position.z)) continue;
      const bx = (b.position.x - px) * WORLD_TO_PX + RADIUS;
      const bz = (b.position.z - pz) * WORLD_TO_PX + RADIUS;
      ctx.fillStyle = TYPE_COLOR[EntityType.BUILDING];
      ctx.fillRect(bx - 3, bz - 3, 6, 6);
    }

    // ── 6. NPC dots — use craftpix marker sprites ─────────────────────────
    const npcs = tracker.query(px, pz, worldWindow, [EntityType.NPC, EntityType.ENEMY]);
    for (const npc of npcs) {
      if (!fow.isRevealed(npc.position.x, npc.position.z)) continue;
      const nx = (npc.position.x - px) * WORLD_TO_PX + RADIUS;
      const nz = (npc.position.z - pz) * WORLD_TO_PX + RADIUS;

      // Determine marker key
      const isBoss = !!(npc as any).isBoss;
      const faction = (npc as any).faction as string | undefined;
      const markerKey = isBoss
        ? 'boss'
        : faction && MARKER_IMGS[faction]
          ? faction
          : npc.trackType === EntityType.ENEMY ? 'hostile' : 'friendly';

      const markerImg = getMarkerImg(markerKey);
      if (markerImg) {
        const ms = isBoss ? MARKER_SIZE * 1.5 : MARKER_SIZE;
        ctx.drawImage(markerImg, nx - ms / 2, nz - ms / 2, ms, ms);
      } else {
        // Fallback: colored dot while image loads
        const col = faction
          ? FACTION_COLOR[faction] ?? FACTION_COLOR.unknown
          : TYPE_COLOR[npc.trackType] ?? '#aaa';
        ctx.beginPath();
        ctx.arc(nx, nz, 2.8, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.fill();
      }
    }

    // ── Undo rotation before drawing player dot (always at center) ─────────
    ctx.translate(RADIUS, RADIUS);
    ctx.rotate(yaw);
    ctx.translate(-RADIUS, -RADIUS);

    // ── 7. Player dot (white triangle pointing up) ─────────────────────────
    const ph = 7;
    ctx.beginPath();
    ctx.moveTo(RADIUS, RADIUS - ph);
    ctx.lineTo(RADIUS - ph * 0.55, RADIUS + ph * 0.6);
    ctx.lineTo(RADIUS + ph * 0.55, RADIUS + ph * 0.6);
    ctx.closePath();
    ctx.fillStyle   = '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth   = 1.5;
    ctx.fill();
    ctx.stroke();

    // ── 8. Edge vignette (gloom ring) ──────────────────────────────────────
    const vig = ctx.createRadialGradient(RADIUS, RADIUS, RADIUS * 0.55, RADIUS, RADIUS, RADIUS);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, `rgba(0,0,0,${0.35 + gl * 0.45})`);
    ctx.fillStyle = vig;
    ctx.beginPath();
    ctx.arc(RADIUS, RADIUS, RADIUS, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // ── 9. Compass ring ────────────────────────────────────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.arc(RADIUS, RADIUS, RADIUS - 1, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(120,140,180,${0.35 + gl * 0.2})`;
    ctx.lineWidth   = 2;
    ctx.stroke();
    ctx.restore();

    rafRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  // Button click handler (pointer events only on buttons)
  const handleBtnClick = useCallback((action: string) => {
    window.dispatchEvent(new CustomEvent('minimap-action', { detail: action }));
  }, []);

  // Frame size is slightly larger than canvas to allow border overlap
  const FRAME_PAD = 14;
  const FRAME_SIZE = SIZE + FRAME_PAD * 2;

  return (
    <div
      className={className}
      style={{
        position: 'absolute',
        top:      8,
        right:    8,
        width:    FRAME_SIZE,
        height:   FRAME_SIZE,
        userSelect: 'none',
      }}
    >
      {/* Glow layer behind everything */}
      <img
        src={FRAME_GLOW}
        alt=""
        style={{
          position: 'absolute', inset: -8,
          width: FRAME_SIZE + 16, height: FRAME_SIZE + 16,
          pointerEvents: 'none', opacity: 0.6,
        }}
      />

      {/* Canvas (circular clip) */}
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        style={{
          display: 'block',
          position: 'absolute',
          top: FRAME_PAD, left: FRAME_PAD,
          borderRadius: '50%',
          overflow: 'hidden',
        }}
      />

      {/* Inner shadow overlay */}
      <img
        src={FRAME_SHADOW}
        alt=""
        style={{
          position: 'absolute',
          top: FRAME_PAD, left: FRAME_PAD,
          width: SIZE, height: SIZE,
          borderRadius: '50%',
          pointerEvents: 'none', opacity: 0.7,
        }}
      />

      {/* Decorative border frame */}
      <img
        src={FRAME_BORDER}
        alt=""
        style={{
          position: 'absolute', inset: 0,
          width: FRAME_SIZE, height: FRAME_SIZE,
          pointerEvents: 'none',
        }}
      />

      {/* Icon buttons arranged around the bottom-right arc */}
      <div style={{
        position: 'absolute',
        bottom: -6, right: -6,
        display: 'flex', gap: 2,
        pointerEvents: 'auto',
      }}>
        {MINIMAP_BUTTONS.map((btn) => (
          <button
            key={btn.action}
            onClick={() => handleBtnClick(btn.action)}
            title={btn.label}
            style={{
              width: 28, height: 28, padding: 0,
              border: 'none', cursor: 'pointer',
              background: `url(${BTN_BG}) center/contain no-repeat`,
              position: 'relative',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.6))',
              transition: 'transform 0.12s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.15)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            {/* Border overlay */}
            <img
              src={BTN_BRDR}
              alt=""
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
            />
            {/* Icon */}
            <img
              src={btn.icon}
              alt={btn.label}
              style={{ width: 16, height: 16, position: 'relative', zIndex: 1, pointerEvents: 'none' }}
            />
          </button>
        ))}
      </div>
    </div>
  );
};

export default Minimap;
