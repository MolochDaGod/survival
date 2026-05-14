import React, { useState } from 'react';
import { SkillNode, PlayerStats } from '../game/types';
import { SKILL_TREE } from '../game/constants';

interface SkillTreeProps {
  stats: PlayerStats;
  onSkillUpgrade: (nodeId: string) => void;
  onClose: () => void;
}

const STAT_COLORS: Record<string, string> = {
  strength: '#ff6b35',
  agility: '#69f0ae',
  intelligence: '#4fc3f7',
  endurance: '#fff176',
  ability: '#ce93d8',
};

const STAT_ICONS: Record<string, string> = {
  strength: '⚔️',
  agility: '💨',
  intelligence: '🔮',
  endurance: '🛡️',
  ability: '✨',
};

const NODE_W = 110;
const NODE_H = 80;
const GRID_X = 160;
const GRID_Y = 110;
const PAD_X = 60;
const PAD_Y = 40;

export const SkillTree: React.FC<SkillTreeProps> = ({ stats, onSkillUpgrade, onClose }) => {
  const [nodes, setNodes] = useState<SkillNode[]>(SKILL_TREE.map(n => ({ ...n })));
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [localSkillPoints, setLocalSkillPoints] = useState(stats.skillPoints);

  const canUpgrade = (node: SkillNode): boolean => {
    if (node.currentLevel >= node.maxLevel) return false;
    if (localSkillPoints <= 0) return false;
    if (!node.requires) return true;
    return node.requires.every(reqId => {
      const req = nodes.find(n => n.id === reqId);
      return req && req.currentLevel > 0;
    });
  };

  const upgradeNode = (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node || !canUpgrade(node)) return;

    setNodes(prev => prev.map(n =>
      n.id === nodeId ? { ...n, currentLevel: n.currentLevel + 1 } : n
    ));
    setLocalSkillPoints(p => p - 1);
    onSkillUpgrade(nodeId);
  };

  const maxX = Math.max(...nodes.map(n => n.x));
  const maxY = Math.max(...nodes.map(n => n.y));
  const svgW = (maxX + 1) * GRID_X + PAD_X * 2;
  const svgH = (maxY + 1) * GRID_Y + PAD_Y * 2;

  const nodePos = (node: SkillNode) => ({
    x: node.x * GRID_X + PAD_X + NODE_W / 2,
    y: node.y * GRID_Y + PAD_Y + NODE_H / 2,
  });

  const hovered = hoveredNode ? nodes.find(n => n.id === hoveredNode) : null;

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.88)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 200,
    }}>
      {/* Header */}
      <div style={{
        position: 'absolute', top: '16px', left: 0, right: 0,
        display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '24px',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#fff176', fontFamily: 'monospace' }}>
            SKILL TREE
          </div>
          <div style={{ fontSize: '13px', color: '#aaa', fontFamily: 'monospace' }}>
            Skill Points: <span style={{ color: localSkillPoints > 0 ? '#69f0ae' : '#ff4444', fontWeight: 'bold' }}>{localSkillPoints}</span>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div style={{
        position: 'absolute', top: '70px', left: 0, right: 0,
        display: 'flex', justifyContent: 'center', gap: '24px',
      }}>
        {(['strength', 'agility', 'intelligence', 'endurance'] as const).map(stat => (
          <div key={stat} style={{
            background: 'rgba(0,0,0,0.5)',
            border: `1px solid ${STAT_COLORS[stat]}44`,
            borderRadius: '8px', padding: '6px 14px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '14px' }}>{STAT_ICONS[stat]}</div>
            <div style={{ fontSize: '11px', color: STAT_COLORS[stat], fontFamily: 'monospace', textTransform: 'capitalize' }}>
              {stat}
            </div>
            <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#fff', fontFamily: 'monospace' }}>
              {(stats as any)[stat]}
            </div>
          </div>
        ))}
      </div>

      {/* Scrollable SVG Tree */}
      <div style={{
        marginTop: '130px',
        overflowX: 'auto',
        overflowY: 'auto',
        maxWidth: '90vw',
        maxHeight: '60vh',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '12px',
        background: 'rgba(0,0,0,0.4)',
        padding: '10px',
      }}>
        <svg width={svgW} height={svgH} style={{ display: 'block' }}>
          {/* Connection lines */}
          {nodes.map(node =>
            (node.requires || []).map(reqId => {
              const reqNode = nodes.find(n => n.id === reqId);
              if (!reqNode) return null;
              const from = nodePos(reqNode);
              const to = nodePos(node);
              const connected = reqNode.currentLevel > 0;
              return (
                <line
                  key={`${reqId}-${node.id}`}
                  x1={from.x} y1={from.y}
                  x2={to.x} y2={to.y}
                  stroke={connected ? STAT_COLORS[node.stat] + 'aa' : '#333'}
                  strokeWidth={connected ? 2.5 : 1.5}
                  strokeDasharray={connected ? 'none' : '5,4'}
                />
              );
            })
          )}

          {/* Nodes */}
          {nodes.map(node => {
            const pos = nodePos(node);
            const nx = pos.x - NODE_W / 2;
            const ny = pos.y - NODE_H / 2;
            const color = STAT_COLORS[node.stat];
            const isMax = node.currentLevel >= node.maxLevel;
            const canUp = canUpgrade(node);
            const isHov = hoveredNode === node.id;

            return (
              <g
                key={node.id}
                style={{ cursor: canUp ? 'pointer' : 'default' }}
                onClick={() => upgradeNode(node.id)}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
              >
                {/* Glow */}
                {(isMax || canUp) && (
                  <rect
                    x={nx - 3} y={ny - 3}
                    width={NODE_W + 6} height={NODE_H + 6}
                    rx="10" ry="10"
                    fill="none"
                    stroke={color}
                    strokeWidth={isHov ? 3 : 1.5}
                    opacity={isHov ? 0.8 : 0.35}
                  />
                )}

                {/* Background */}
                <rect
                  x={nx} y={ny}
                  width={NODE_W} height={NODE_H}
                  rx="8" ry="8"
                  fill={isMax ? color + '33' : canUp ? '#222' : '#111'}
                  stroke={isMax ? color : canUp ? color + '88' : '#333'}
                  strokeWidth={isHov ? 2 : 1.5}
                />

                {/* Icon + Name */}
                <text x={pos.x} y={ny + 20} textAnchor="middle" fill={color} fontSize="16">{STAT_ICONS[node.stat]}</text>
                <text x={pos.x} y={ny + 38} textAnchor="middle" fill={isMax ? color : '#ddd'} fontSize="11" fontFamily="monospace" fontWeight="bold">
                  {node.name.length > 12 ? node.name.slice(0, 11) + '…' : node.name}
                </text>

                {/* Level dots */}
                <g>
                  {Array.from({ length: node.maxLevel }).map((_, i) => (
                    <circle
                      key={i}
                      cx={pos.x - (node.maxLevel - 1) * 7 + i * 14}
                      cy={ny + 58}
                      r={5}
                      fill={i < node.currentLevel ? color : '#333'}
                      stroke={color + '66'}
                      strokeWidth={1}
                    />
                  ))}
                </g>

                {/* Ability tag */}
                {node.stat === 'ability' && node.currentLevel > 0 && (
                  <text x={pos.x} y={ny + NODE_H - 5} textAnchor="middle" fill={color} fontSize="10" fontFamily="monospace">
                    UNLOCKED
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Hover tooltip */}
      {hovered && (
        <div style={{
          position: 'absolute', bottom: '80px',
          background: 'rgba(0,0,0,0.92)',
          border: `1px solid ${STAT_COLORS[hovered.stat]}`,
          borderRadius: '10px', padding: '12px 18px',
          maxWidth: '300px', textAlign: 'center',
        }}>
          <div style={{ fontSize: '14px', fontWeight: 'bold', color: STAT_COLORS[hovered.stat], fontFamily: 'monospace' }}>
            {STAT_ICONS[hovered.stat]} {hovered.name}
          </div>
          <div style={{ fontSize: '12px', color: '#ccc', fontFamily: 'monospace', marginTop: '6px' }}>
            {hovered.description}
          </div>
          <div style={{ fontSize: '11px', color: '#888', fontFamily: 'monospace', marginTop: '6px' }}>
            Level {hovered.currentLevel}/{hovered.maxLevel}
            {canUpgrade(hovered) ? ' • Click to upgrade (1 SP)' : hovered.currentLevel >= hovered.maxLevel ? ' • MAXED' : ' • Requirements not met'}
          </div>
        </div>
      )}

      <button
        onClick={onClose}
        style={{
          position: 'absolute', bottom: '20px', right: '20px',
          background: 'rgba(255,255,255,0.1)',
          border: '1px solid rgba(255,255,255,0.3)',
          borderRadius: '8px', padding: '10px 20px',
          color: '#fff', cursor: 'pointer',
          fontFamily: 'monospace', fontSize: '13px',
        }}
      >
        Close [T / Esc]
      </button>
    </div>
  );
};
