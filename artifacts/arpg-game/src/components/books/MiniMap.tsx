import { useState, useMemo } from 'react';

export type MarkerKind = 'player' | 'enemy' | 'resource' | 'trader' | 'town' | 'dungeon' | 'industry';

export interface MapMarker {
  id: string;
  kind: MarkerKind;
  x: number;          // world X
  z: number;          // world Z
  label: string;
  detail?: string;    // shown in tooltip
  /** Optional PNG icon — when set the marker renders as an <img> instead of a coloured dot. */
  iconUrl?: string;
}

interface Props {
  player: { x: number; z: number };
  markers: MapMarker[];
  /** Initial view radius around player (meters). Slider adjusts within [50, 500]. */
  initialRadius?: number;
}

const LEGEND: Array<[MarkerKind, string]> = [
  ['player',   'You'],
  ['enemy',    'Hostiles'],
  ['resource', 'Resources'],
  ['trader',   'Traders'],
  ['town',     'Settlements'],
  ['dungeon',  'Dungeons'],
];

export function MiniMap({ player, markers, initialRadius = 150 }: Props) {
  const [radius, setRadius] = useState(initialRadius);
  const [hovered, setHovered] = useState<MapMarker | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const visible = useMemo(() => {
    return markers.filter(m => {
      const dx = m.x - player.x;
      const dz = m.z - player.z;
      return Math.sqrt(dx * dx + dz * dz) <= radius;
    });
  }, [markers, player.x, player.z, radius]);

  const toLocal = (m: { x: number; z: number }) => ({
    left: 50 + ((m.x - player.x) / radius) * 50,
    top:  50 + ((m.z - player.z) / radius) * 50,
  });

  return (
    <div>
      <div
        className="minimap"
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setHoverPos({ x: e.clientX - r.left, y: e.clientY - r.top });
        }}
        onMouseLeave={() => setHovered(null)}
      >
        <div className="minimap-grid" />

        {/* Player at center */}
        <div
          className="minimap-marker player"
          style={{ left: '50%', top: '50%' }}
          onMouseEnter={() => setHovered({ id: 'self', kind: 'player', x: player.x, z: player.z, label: 'You', detail: 'Current position' })}
          onMouseLeave={() => setHovered(null)}
        />

        {visible.map(m => {
          const pos = toLocal(m);
          if (m.iconUrl) {
            return (
              <img
                key={m.id}
                className={`minimap-marker ${m.kind} icon`}
                src={m.iconUrl}
                alt={m.label}
                draggable={false}
                style={{ left: `${pos.left}%`, top: `${pos.top}%` }}
                onMouseEnter={() => setHovered(m)}
                onMouseLeave={() => setHovered(null)}
              />
            );
          }
          return (
            <div
              key={m.id}
              className={`minimap-marker ${m.kind}`}
              style={{ left: `${pos.left}%`, top: `${pos.top}%` }}
              onMouseEnter={() => setHovered(m)}
              onMouseLeave={() => setHovered(null)}
            />
          );
        })}

        {hovered && (
          <div
            className="minimap-tooltip"
            style={{ left: hoverPos.x, top: hoverPos.y }}
          >
            <div style={{ fontWeight: 700 }}>{hovered.label}</div>
            {hovered.detail && (
              <div style={{ fontSize: 9, opacity: 0.8, marginTop: 2 }}>{hovered.detail}</div>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#3a1f10' }}>
        <span style={{ fontFamily: 'Cinzel, serif', textTransform: 'uppercase', letterSpacing: 1 }}>Zoom</span>
        <input
          className="minimap-zoom"
          type="range"
          min={50}
          max={500}
          step={10}
          value={radius}
          onChange={(e) => setRadius(Number(e.target.value))}
        />
        <span style={{ fontFamily: 'monospace', minWidth: 36, textAlign: 'right' }}>{radius}m</span>
      </div>

      <div className="minimap-legend">
        {LEGEND.map(([kind, label]) => (
          <div key={kind}>
            <span className={`minimap-legend-dot`} style={{ background: dotColor(kind) }} />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

function dotColor(kind: MarkerKind): string {
  switch (kind) {
    case 'player':   return '#6ec96e';
    case 'enemy':    return '#d44040';
    case 'resource': return '#c5a059';
    case 'trader':   return '#5a9ad8';
    case 'town':     return '#f0d088';
    case 'dungeon':  return '#6a3a8a';
    case 'industry': return '#b08840';
  }
}
