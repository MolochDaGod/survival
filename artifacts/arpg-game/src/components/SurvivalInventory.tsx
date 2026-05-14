import React, { useMemo, useState } from 'react';
import {
  SURVIVAL_ITEMS,
  SurvivalCategory,
  SurvivalItemDef,
} from '../game/survival/SurvivalItems';

/** Tab definition — keeps the labels next to the icons so a designer
 *  tweaking copy doesn't have to hunt through render code. */
const CATEGORY_TABS: Array<{ key: 'all' | SurvivalCategory; label: string; icon: string }> = [
  { key: 'all',                 label: 'All',        icon: '📦' },
  { key: 'food',                label: 'Food',       icon: '🍗' },
  { key: 'water',               label: 'Water',      icon: '💧' },
  { key: 'medical',             label: 'Medical',    icon: '🩹' },
  { key: 'tool',                label: 'Tools',      icon: '🛠️' },
  { key: 'weapon_melee',        label: 'Melee',      icon: '🗡️' },
  { key: 'weapon_pistol',       label: 'Pistols',    icon: '🔫' },
  { key: 'weapon_rifle',        label: 'Rifles',     icon: '🎯' },
  { key: 'weapon_shotgun',      label: 'Shotguns',   icon: '💥' },
  { key: 'ammo',                label: 'Ammo',       icon: '🟫' },
  { key: 'material',            label: 'Materials',  icon: '🪵' },
  { key: 'clothing',            label: 'Clothing',   icon: '🎒' },
  { key: 'structure',           label: 'Structures', icon: '🛖' },
];

/** A single inventory slot — stack count, weight, hover tooltip. */
const Slot: React.FC<{
  def: SurvivalItemDef | null;
  count: number;
  onClick?: () => void;
}> = ({ def, count, onClick }) => {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        width: '60px', height: '60px',
        background: def
          ? 'linear-gradient(180deg, rgba(40,52,68,0.95), rgba(20,28,40,0.95))'
          : 'rgba(20,28,40,0.4)',
        border: `1px solid ${def ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)'}`,
        borderRadius: '6px',
        cursor: def ? 'pointer' : 'default',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '26px',
        userSelect: 'none',
        transition: 'transform 0.1s, border-color 0.1s',
        transform: hover && def ? 'scale(1.05)' : 'none',
      }}
    >
      {def?.icon ?? ''}
      {def && count > 1 && (
        <div style={{
          position: 'absolute', right: 3, bottom: 1,
          fontSize: '11px', fontFamily: 'monospace',
          color: '#fff',
          textShadow: '0 1px 2px #000',
        }}>
          {count}
        </div>
      )}
      {hover && def && (
        <div style={{
          position: 'absolute',
          left: '70px', top: 0,
          minWidth: '180px',
          background: 'rgba(8,12,18,0.96)',
          border: '1px solid rgba(255,255,255,0.18)',
          borderRadius: '6px',
          padding: '8px 10px',
          zIndex: 50,
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'left',
          pointerEvents: 'none',
        }}>
          <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#fff', marginBottom: '4px' }}>
            {def.name}
          </div>
          <div style={{ fontSize: '11px', color: '#7a8392', marginBottom: '6px', textTransform: 'capitalize' }}>
            {def.category.replace('_', ' ')} · {def.weight}kg
          </div>
          <div style={{ fontSize: '11px', color: '#cdd2d8', lineHeight: 1.4 }}>
            {def.description}
          </div>
          {def.damage !== undefined && (
            <div style={{ marginTop: '6px', fontSize: '11px', color: '#ff8f6b', fontFamily: 'monospace' }}>
              DMG {def.damage}{def.range ? ` · ${def.range}m` : ''}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface SurvivalInventoryProps {
  /** Player's stack list, e.g. [{itemId:'apple', count:3}, ...]. */
  stacks: Array<{ itemId: string; count: number }>;
  /** Total slots in the bag (visible grid will pad with empty slots). */
  capacity: number;
  /** Called when the player clicks a stack — engine decides what to do. */
  onUse?: (itemId: string) => void;
  onClose: () => void;
}

export const SurvivalInventory: React.FC<SurvivalInventoryProps> = ({
  stacks,
  capacity,
  onUse,
  onClose,
}) => {
  const [tab, setTab] = useState<'all' | SurvivalCategory>('all');

  const filtered = useMemo(() => {
    if (tab === 'all') return stacks;
    return stacks.filter((s) => SURVIVAL_ITEMS[s.itemId]?.category === tab);
  }, [stacks, tab]);

  const totalWeight = useMemo(
    () => stacks.reduce((sum, s) => {
      const def = SURVIVAL_ITEMS[s.itemId];
      return sum + (def ? def.weight * s.count : 0);
    }, 0),
    [stacks],
  );

  // Pad to a 6-wide grid that always has at least `capacity` slots visible.
  const padded: Array<{ itemId: string; count: number } | null> = [...filtered];
  while (padded.length < Math.max(capacity, 24)) padded.push(null);

  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 80,
      backdropFilter: 'blur(6px)',
    }}>
      <div style={{
        width: '720px', maxWidth: '92vw', maxHeight: '88vh',
        background: 'linear-gradient(180deg, #121823, #0a0f17)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '12px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#fff', letterSpacing: '0.06em' }}>
              INVENTORY
            </div>
            <div style={{ fontSize: '11px', color: '#7a8392', fontFamily: 'monospace', marginTop: '2px' }}>
              {filtered.length}/{capacity} slots · {totalWeight.toFixed(1)} kg
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
              color: '#cdd2d8', borderRadius: '6px', padding: '6px 12px', cursor: 'pointer',
              fontFamily: 'monospace', fontSize: '12px',
            }}
          >
            CLOSE [TAB]
          </button>
        </div>

        {/* Category tabs */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: '4px',
          padding: '10px 18px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          {CATEGORY_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                background: tab === t.key ? 'rgba(255,143,0,0.18)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${tab === t.key ? '#ff8f00' : 'rgba(255,255,255,0.08)'}`,
                color: tab === t.key ? '#ffd180' : '#9ca3af',
                borderRadius: '4px',
                padding: '5px 10px',
                fontSize: '11px', fontFamily: 'system-ui, sans-serif',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '4px',
              }}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {/* Slot grid */}
        <div style={{
          padding: '16px',
          overflowY: 'auto',
          flex: 1,
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(8, 60px)',
            gap: '8px',
            justifyContent: 'center',
          }}>
            {padded.map((stack, i) => (
              <Slot
                key={i}
                def={stack ? SURVIVAL_ITEMS[stack.itemId] ?? null : null}
                count={stack?.count ?? 0}
                onClick={stack ? () => onUse?.(stack.itemId) : undefined}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
