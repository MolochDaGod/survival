import React, { useEffect, useRef, useState } from 'react';
import { worldHeight, getBiome, getBiomeColor, getSettlements, WORLD_HALF } from '../game/world/WorldGen';
import { SECTORS, TRAVEL_ROUTES, getAllPOIs } from '../data/sectors';
import { FACTIONS } from '../data/factions';
import { WORLD_GRID_SECTORS, GRID_SECTOR_SPAN_M } from '../data/worldGridSectors';

// ─── Map generation (lazy, cached after first render) ────────────────────────

const MAP_RES = 256; // pixels — each pixel covers (WORLD_HALF*2/MAP_RES) metres
let _cachedImageData: ImageData | null = null;

function buildTerrainImageData(): ImageData {
    if (_cachedImageData) return _cachedImageData;
    const offscreen = document.createElement('canvas');
    offscreen.width = MAP_RES;
    offscreen.height = MAP_RES;
    const ctx = offscreen.getContext('2d')!;
    const img = ctx.createImageData(MAP_RES, MAP_RES);
    const d = img.data;
    const step = (WORLD_HALF * 2) / MAP_RES;
    for (let row = 0; row < MAP_RES; row++) {
        for (let col = 0; col < MAP_RES; col++) {
            const wx = -WORLD_HALF + col * step + step * 0.5;
            const wz = -WORLD_HALF + row * step + step * 0.5;
            const h = worldHeight(wx, wz);
            const biome = getBiome(h);
            const [r, g, b] = getBiomeColor(biome);
            const i = (row * MAP_RES + col) * 4;
            d[i] = Math.round(r * 255);
            d[i + 1] = Math.round(g * 255);
            d[i + 2] = Math.round(b * 255);
            d[i + 3] = 255;
        }
    }
    ctx.putImageData(img, 0, 0);
    _cachedImageData = img;
    return img;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function worldToFrac(w: number): number {
    // Convert a world coord (-WORLD_HALF … +WORLD_HALF) to 0…1
    return (w + WORLD_HALF) / (WORLD_HALF * 2);
}

const SETTLEMENT_ICON: Record<string, string> = {
    town: '🏘',
    camp: '⛺',
    cave: '⛏',
    outpost: '🔭',
};
const SETTLEMENT_COLOR: Record<string, string> = {
    town: '#f0d080',
    camp: '#80c870',
    cave: '#c07060',
    outpost: '#60c0c8',
};

// ─── Component ────────────────────────────────────────────────────────────────

export interface WorldMapOverlayProps {
    player: { x: number; z: number };
    onClose: () => void;
}

export function WorldMapOverlay({ player, onClose }: WorldMapOverlayProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [ready, setReady] = useState(false);
    const [hovered, setHovered] = useState<string | null>(null);

    const settlements = getSettlements();

    // Render terrain + overlays
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Build terrain (heavy — runs once, result cached)
        const img = buildTerrainImageData();
        const offscreen = document.createElement('canvas');
        offscreen.width = MAP_RES;
        offscreen.height = MAP_RES;
        offscreen.getContext('2d')!.putImageData(img, 0, 0);

        const SIZE = canvas.width; // displayed canvas size

        // Draw terrain stretched to canvas size
        ctx.clearRect(0, 0, SIZE, SIZE);
        ctx.drawImage(offscreen, 0, 0, SIZE, SIZE);

        // Vignette
        const vignette = ctx.createRadialGradient(SIZE / 2, SIZE / 2, SIZE * 0.3, SIZE / 2, SIZE / 2, SIZE * 0.72);
        vignette.addColorStop(0, 'rgba(0,0,0,0)');
        vignette.addColorStop(1, 'rgba(0,0,0,0.55)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, SIZE, SIZE);

        const worldToPx = (w: number) => (w + WORLD_HALF) / (WORLD_HALF * 2) * SIZE;
        const radiusToPx = (r: number) => r / (WORLD_HALF * 2) * SIZE;

        // 9-sector macro grid (island-3d layout)
        const gridSpanPx = GRID_SECTOR_SPAN_M / (WORLD_HALF * 2) * SIZE;
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        for (let col = 0; col <= 3; col++) {
          const x = worldToPx(-WORLD_HALF + col * GRID_SECTOR_SPAN_M);
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, SIZE);
          ctx.stroke();
        }
        for (let row = 0; row <= 3; row++) {
          const y = worldToPx(-WORLD_HALF + row * GRID_SECTOR_SPAN_M);
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(SIZE, y);
          ctx.stroke();
        }
        WORLD_GRID_SECTORS.forEach(cell => {
          const cx = worldToPx(cell.center.x);
          const cy = worldToPx(cell.center.z);
          const color = cell.owner ? FACTIONS[cell.owner].color : '#ffd700';
          ctx.font = '500 8px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = 'rgba(0,0,0,0.65)';
          ctx.fillText(cell.name, cx + 1, cy - gridSpanPx * 0.38 + 1);
          ctx.fillStyle = cell.isSafeZone ? '#ffd700' : color;
          ctx.fillText(cell.name, cx, cy - gridSpanPx * 0.38);
        });

        // Faction territory discs (rendered under markers and labels)
        SECTORS.forEach(sector => {
            const cx = worldToPx(sector.center.x);
            const cy = worldToPx(sector.center.z);
            const rp = radiusToPx(sector.radius);
            const color = FACTIONS[sector.owner].color;
            // Soft fill
            const fillGrad = ctx.createRadialGradient(cx, cy, rp * 0.1, cx, cy, rp);
            fillGrad.addColorStop(0, color + '38'); // ~22% alpha at centre
            fillGrad.addColorStop(1, color + '08'); // ~3% alpha at edge
            ctx.beginPath();
            ctx.arc(cx, cy, rp, 0, Math.PI * 2);
            ctx.fillStyle = fillGrad;
            ctx.fill();
            // Dashed border
            ctx.beginPath();
            ctx.arc(cx, cy, rp, 0, Math.PI * 2);
            ctx.setLineDash([6, 5]);
            ctx.strokeStyle = color + 'aa';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.setLineDash([]);
            // Territory label
            ctx.font = '600 11px Cinzel, serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillText(sector.name, cx + 1, cy - rp * 0.55 + 1);
            ctx.fillStyle = color;
            ctx.fillText(sector.name, cx, cy - rp * 0.55);
        });

        // Travel routes (drawn before markers so routes are behind dots)
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        TRAVEL_ROUTES.forEach(route => {
            if (route.waypoints.length < 2) return;
            ctx.beginPath();
            const w0 = route.waypoints[0];
            ctx.moveTo(worldToPx(w0.x), worldToPx(w0.z));
            for (let i = 1; i < route.waypoints.length; i++) {
                ctx.lineTo(worldToPx(route.waypoints[i].x), worldToPx(route.waypoints[i].z));
            }
            ctx.strokeStyle = 'rgba(200,180,120,0.35)';
            ctx.stroke();
        });
        ctx.setLineDash([]);

        // POI markers (sector-specific points of interest)
        const POI_ICON: Record<string, string> = {
            vendor: '🛒', dungeon: '💀', boss: '👹', harvest: '⛏',
            camp: '⛺', landmark: '🏛', gate: '🚧',
        };
        const allPois = getAllPOIs();
        allPois.forEach(poi => {
            const px2 = worldToPx(poi.worldX);
            const py2 = worldToPx(poi.worldZ);
            const factionColor = FACTIONS[poi.factionId].color;
            // Small dot
            ctx.beginPath();
            ctx.arc(px2, py2, 3.5, 0, Math.PI * 2);
            ctx.fillStyle = factionColor + 'cc';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.3)';
            ctx.lineWidth = 0.5;
            ctx.stroke();
        });

        // Settlement markers
        settlements.forEach(s => {
            const fx = worldToFrac(s.x) * SIZE;
            const fy = worldToFrac(s.z) * SIZE;
            const r = s.type === 'town' ? 7 : 5;
            ctx.beginPath();
            ctx.arc(fx, fy, r + 2, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(fx, fy, r, 0, Math.PI * 2);
            ctx.fillStyle = SETTLEMENT_COLOR[s.type] ?? '#ffffff';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.55)';
            ctx.lineWidth = 1;
            ctx.stroke();
        });

        // Encampment marker (world origin — safe zone)
        const encX = worldToPx(0);
        const encY = worldToPx(0);
        ctx.beginPath();
        ctx.arc(encX, encY, 8, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,215,0,0.2)';
        ctx.fill();
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.font = '600 9px Cinzel, serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffd700';
        ctx.fillText('ENCAMPMENT', encX, encY + 16);

        // Player dot (white pulsing glow — static here)
        const px = worldToFrac(player.x) * SIZE;
        const pz = worldToFrac(player.z) * SIZE;
        const glow = ctx.createRadialGradient(px, pz, 0, px, pz, 14);
        glow.addColorStop(0, 'rgba(255,255,255,0.5)');
        glow.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.beginPath();
        ctx.arc(px, pz, 14, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(px, pz, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#c87820';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Compass rose (top-right)
        const cx = SIZE - 28;
        const cy = 28;
        ctx.font = 'bold 11px Cinzel, serif';
        ctx.fillStyle = '#e8d5b0';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('N', cx, cy - 14);
        ctx.fillText('S', cx, cy + 14);
        ctx.fillText('W', cx - 14, cy);
        ctx.fillText('E', cx + 14, cy);
        ctx.beginPath();
        ctx.arc(cx, cy, 8, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(232,213,176,0.4)';
        ctx.lineWidth = 1;
        ctx.stroke();

        setReady(true);
    }, [player.x, player.z]); // eslint-disable-line react-hooks/exhaustive-deps

    // Close on Esc
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' || e.key === 'm' || e.key === 'M') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const CANVAS_SIZE = 540;

    return (
        <div
      style= {{
        position: 'fixed', inset: 0, zIndex: 2000,
            background: 'rgba(8,12,16,0.88)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backdropFilter: 'blur(6px)',
      }
}
onClick = { onClose }
    >
    {/* Map panel — stops click-through */ }
    < div
style = {{
    position: 'relative',
        background: 'linear-gradient(160deg,#1a1008 0%,#0e0a04 100%)',
            border: '2px solid rgba(200,120,40,0.5)',
                borderRadius: 14,
                    padding: 20,
                        boxShadow: '0 0 60px rgba(200,120,40,0.18), 0 8px 40px rgba(0,0,0,0.7)',
                            userSelect: 'none',
        }}
onClick = { e => e.stopPropagation() }
    >
    {/* Title bar */ }
    < div style = {{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12,
        }}>
    <div style={ { display: 'flex', alignItems: 'center', gap: 10 } }>
        <span style={ { fontSize: 18 } }>🗺</span>
            < span style = {{
    fontFamily: 'Cinzel, serif', fontSize: 14, fontWeight: 700,
        letterSpacing: '0.12em', textTransform: 'uppercase',
            color: '#c87820',
            }}>
    World Map
        </span>
        </div>
        < button
onClick = { onClose }
style = {{
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 6, color: '#8899aa', cursor: 'pointer', fontSize: 16,
            width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                lineHeight: 1, fontFamily: 'inherit',
            }}
          >
            ×
</button>
    </div>

{/* Canvas */ }
<div style={ { position: 'relative' } }>
    <canvas
            ref={ canvasRef }
width = { CANVAS_SIZE }
height = { CANVAS_SIZE }
style = {{
    display: 'block',
        borderRadius: 8,
            border: '1px solid rgba(200,120,40,0.35)',
                opacity: ready ? 1 : 0,
                    transition: 'opacity 0.3s ease',
                        imageRendering: 'pixelated',
            }}
          />
{
    !ready && (
        <div style={
            {
                position: 'absolute', inset: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#c87820', fontFamily: 'Cinzel, serif', fontSize: 13,
                            letterSpacing: '0.1em',
            }
    }>
        Charting the world…
    </div>
          )
}

{/* Tooltip-like settlement hover labels */ }
{
    ready && settlements.map(s => {
        const fx = worldToFrac(s.x) * CANVAS_SIZE;
        const fy = worldToFrac(s.z) * CANVAS_SIZE;
        const isHov = hovered === s.name;
        return (
            <div
                key= { s.name }
        onMouseEnter = {() => setHovered(s.name)
    }
                onMouseLeave = {() => setHovered(null)}
style = {{
    position: 'absolute',
        left: fx,
            top: fy,
                transform: 'translate(-50%, -50%)',
                    width: s.type === 'town' ? 20 : 14,
                        height: s.type === 'town' ? 20 : 14,
                            cursor: 'default',
                                zIndex: 10,
                }}
              >
    { isHov && (
        <div style={
            {
                position: 'absolute', bottom: '120%', left: '50%',
                    transform: 'translateX(-50%)',
                        background: 'rgba(10,8,4,0.92)',
                            border: '1px solid rgba(200,120,40,0.5)',
                                borderRadius: 5, padding: '4px 8px',
                                    pointerEvents: 'none', whiteSpace: 'nowrap',
                                        zIndex: 20,
                  }
}>
    <div style={ { fontSize: 10, fontWeight: 700, color: SETTLEMENT_COLOR[s.type], fontFamily: 'Cinzel, serif' } }>
        { SETTLEMENT_ICON[s.type]} { s.name }
</div>
    < div style = {{ fontSize: 9, color: '#8899aa', marginTop: 2, textTransform: 'capitalize' }}>
        { s.type } · { Math.round(Math.sqrt(s.x * s.x + s.z * s.z)) }m from centre
            </div>
            </div>
                )}
</div>
            );
          })}

{/* Player tooltip */ }
{
    ready && (() => {
        const fx = worldToFrac(player.x) * CANVAS_SIZE;
        const fy = worldToFrac(player.z) * CANVAS_SIZE;
        return (
            <div
                style= {{
            position: 'absolute',
                left: fx,
                    top: fy,
                        transform: 'translate(-50%, -50%)',
                            width: 16, height: 16,
                                cursor: 'default', zIndex: 11,
                }
    }
                title = {`You (${Math.round(player.x)}, ${Math.round(player.z)})`
}
              />
            );
          }) ()}
</div>

{/* Legend */ }
<div style={
    {
        marginTop: 12,
            display: 'flex', alignItems: 'center', gap: 16,
                flexWrap: 'wrap',
        }
}>
{
    Object.entries(SETTLEMENT_ICON).map(([type, icon]) => (
        <div key= { type } style = {{ display: 'flex', alignItems: 'center', gap: 5 }} >
    <div style={
        {
            width: 10, height: 10, borderRadius: '50%',
                background: SETTLEMENT_COLOR[type],
                    border: '1px solid rgba(255,255,255,0.3)',
              }
} />
    < span style = {{ fontSize: 10, color: '#8899aa', textTransform: 'capitalize' }}>
        { icon } { type }
</span>
    </div>
          ))}
<div style={ { display: 'flex', alignItems: 'center', gap: 5 } }>
    <div style={
        {
            width: 10, height: 10, borderRadius: '50%',
                background: '#ffffff', border: '2px solid #c87820',
            }
} />
    < span style = {{ fontSize: 10, color: '#8899aa' }}> You </span>
        </div>
        < div style = {{ marginLeft: 'auto', fontSize: 10, color: '#445566', fontStyle: 'italic' }}>
            Press M or Esc to close
                </div>
                </div>

{/* Scale bar */ }
<div style={
    {
        marginTop: 8, display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 9, color: '#556677', fontFamily: 'monospace',
        }
}>
    <div style={ { width: Math.round(CANVAS_SIZE / 20), height: 3, background: '#e8d5b0', borderRadius: 1 } } />
        < span > 1 000 m </span>
            </div>
            </div>
            </div>
  );
}
