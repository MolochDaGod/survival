import React, { useMemo } from 'react';
import { GrudgeStats, STAT_META, STAT_MAX } from '../game/CharacterConfig';

interface StatRadarChartProps {
  stats: GrudgeStats;
  size?: number;
}

const BALANCED_VALUE = 2.5;

function polarToXY(angle: number, radius: number, cx: number, cy: number): [number, number] {
  const a = angle - Math.PI / 2;
  return [cx + radius * Math.cos(a), cy + radius * Math.sin(a)];
}

export const StatRadarChart: React.FC<StatRadarChartProps> = ({ stats, size = 220 }) => {
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * 0.4;
  const n = STAT_META.length;
  const step = (2 * Math.PI) / n;

  const gridLevels = [1, 2, 3, 4, 5, 6];

  const axisPoints = useMemo(
    () => STAT_META.map((_, i) => polarToXY(i * step, maxR, cx, cy)),
    [cx, cy, maxR, step],
  );

  const statPolygon = useMemo(() => {
    return STAT_META.map((sm, i) => {
      const val = stats[sm.key];
      const r = (val / STAT_MAX) * maxR;
      return polarToXY(i * step, r, cx, cy);
    }).map(([x, y]) => `${x},${y}`).join(' ');
  }, [stats, cx, cy, maxR, step]);

  const balancedPolygon = useMemo(() => {
    return STAT_META.map((_, i) => {
      const r = (BALANCED_VALUE / STAT_MAX) * maxR;
      return polarToXY(i * step, r, cx, cy);
    }).map(([x, y]) => `${x},${y}`).join(' ');
  }, [cx, cy, maxR, step]);

  const gradientId = 'radarGrad';

  return (
    <svg
      width={size}
      height={size}
      style={{ overflow: 'visible', filter: 'drop-shadow(0 0 12px rgba(0,200,255,0.12))' }}
    >
      <defs>
        <radialGradient id={gradientId} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="rgba(0,200,255,0.22)" />
          <stop offset="100%" stopColor="rgba(0,200,255,0.04)" />
        </radialGradient>
      </defs>

      {gridLevels.map(lvl => {
        const pts = STAT_META.map((_, i) => {
          const r = (lvl / STAT_MAX) * maxR;
          return polarToXY(i * step, r, cx, cy);
        }).map(([x, y]) => `${x},${y}`).join(' ');
        return (
          <polygon
            key={lvl}
            points={pts}
            fill="none"
            stroke="rgba(255,255,255,0.07)"
            strokeWidth={lvl === 6 ? 1.5 : 1}
          />
        );
      })}

      {STAT_META.map((_, i) => {
        const [ax, ay] = axisPoints[i];
        return (
          <line
            key={i}
            x1={cx} y1={cy}
            x2={ax} y2={ay}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={1}
          />
        );
      })}

      <polygon
        points={balancedPolygon}
        fill="rgba(255,255,255,0.04)"
        stroke="rgba(255,255,255,0.14)"
        strokeWidth={1}
        strokeDasharray="3,3"
      />

      <polygon
        points={statPolygon}
        fill={`url(#${gradientId})`}
        stroke="rgba(0,220,255,0.7)"
        strokeWidth={2}
        style={{ transition: 'all 0.25s ease' }}
      />

      {STAT_META.map((sm, i) => {
        const val = stats[sm.key];
        const r = (val / STAT_MAX) * maxR;
        const [px, py] = polarToXY(i * step, r, cx, cy);
        return (
          <circle
            key={sm.key}
            cx={px} cy={py} r={4}
            fill={sm.color}
            stroke="rgba(0,0,0,0.4)"
            strokeWidth={1.5}
            style={{ transition: 'all 0.25s ease' }}
          />
        );
      })}

      {STAT_META.map((sm, i) => {
        const [ax, ay] = axisPoints[i];
        const labelR = maxR + 18;
        const [lx, ly] = polarToXY(i * step, labelR, cx, cy);
        const val = stats[sm.key];
        return (
          <g key={sm.key}>
            <text
              x={lx} y={ly - 5}
              textAnchor="middle"
              fill={sm.color}
              fontSize={9}
              fontWeight={800}
              fontFamily="'Rajdhani', 'Segoe UI', sans-serif"
              letterSpacing="0.1em"
            >
              {sm.abbr}
            </text>
            <text
              x={lx} y={ly + 7}
              textAnchor="middle"
              fill={val > 0 ? sm.color : 'rgba(255,255,255,0.3)'}
              fontSize={10}
              fontWeight={700}
              fontFamily="monospace"
            >
              {val}
            </text>
          </g>
        );
      })}

      <text
        x={cx} y={cy + 3}
        textAnchor="middle"
        fill="rgba(255,255,255,0.15)"
        fontSize={8}
        fontFamily="monospace"
        letterSpacing="0.12em"
      >
        GRUDGE STATS
      </text>
    </svg>
  );
};
