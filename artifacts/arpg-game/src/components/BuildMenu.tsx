import React, { useMemo, useState } from 'react';
import {
  SURVIVAL_ITEMS,
  itemsByCategory,
  SurvivalItemDef,
} from '../game/survival/SurvivalItems';

interface BuildMenuProps {
  /** Player stacks — used to know what's actually placeable right now. */
  stacks: Array<{ itemId: string; count: number }>;
  /** Currently selected blueprint (driven by parent so the engine can ghost-render it). */
  selectedItemId: string | null;
  onSelect: (itemId: string | null) => void;
  onClose: () => void;
}

/** Compact card for a placeable structure. */
const BuildCard: React.FC<{
  def: SurvivalItemDef;
  count: number;
  selected: boolean;
  onClick: () => void;
}> = ({ def, count, selected, onClick }) => {
  const owned = count > 0;
  return (
    <button
      onClick={onClick}
      disabled={!owned}
      style={{
        width: '120px',
        padding: '10px',
        background: selected
          ? 'linear-gradient(180deg, rgba(255,143,0,0.25), rgba(229,81,0,0.15))'
          : owned
            ? 'rgba(20,28,40,0.85)'
            : 'rgba(20,28,40,0.4)',
        border: `1px solid ${selected ? '#ff8f00' : owned ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)'}`,
        borderRadius: '8px',
        cursor: owned ? 'pointer' : 'not-allowed',
        opacity: owned ? 1 : 0.5,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
        color: '#fff',
        transition: 'transform 0.1s',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div style={{ fontSize: '32px' }}>{def.icon}</div>
      <div style={{ fontSize: '12px', fontWeight: 'bold', textAlign: 'center', lineHeight: 1.2 }}>
        {def.name}
      </div>
      <div style={{ fontSize: '10px', color: '#7a8392', fontFamily: 'monospace' }}>
        ×{count}
      </div>
    </button>
  );
};

export const BuildMenu: React.FC<BuildMenuProps> = ({
  stacks,
  selectedItemId,
  onSelect,
  onClose,
}) => {
  const [showAll, setShowAll] = useState(false);

  const buildable = useMemo(() => itemsByCategory('structure'), []);
  const visible = useMemo(
    () => showAll
      ? buildable
      : buildable.filter((def) => (stacks.find((s) => s.itemId === def.id)?.count ?? 0) > 0),
    [buildable, stacks, showAll],
  );

  return (
    <div style={{
      position: 'absolute',
      left: '50%', top: '20px',
      transform: 'translateX(-50%)',
      background: 'linear-gradient(180deg, rgba(10,16,24,0.92), rgba(6,10,14,0.95))',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '10px',
      padding: '12px 16px',
      zIndex: 70,
      backdropFilter: 'blur(6px)',
      maxWidth: '92vw',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '10px',
      }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#fff', letterSpacing: '0.06em' }}>
            BUILD
          </div>
          <div style={{ fontSize: '10px', color: '#7a8392', fontFamily: 'monospace', marginTop: '2px' }}>
            {selectedItemId
              ? `Selected: ${SURVIVAL_ITEMS[selectedItemId]?.name ?? '?'} — left-click to place`
              : 'Pick a structure'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            onClick={() => setShowAll(!showAll)}
            style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
              color: '#cdd2d8', borderRadius: '6px', padding: '5px 10px', cursor: 'pointer',
              fontFamily: 'monospace', fontSize: '10px',
            }}
          >
            {showAll ? 'OWNED' : 'ALL'}
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
              color: '#cdd2d8', borderRadius: '6px', padding: '5px 10px', cursor: 'pointer',
              fontFamily: 'monospace', fontSize: '10px',
            }}
          >
            CLOSE [B]
          </button>
        </div>
      </div>
      <div style={{
        display: 'flex', gap: '8px',
        flexWrap: 'wrap', justifyContent: 'center',
        maxWidth: '780px',
      }}>
        {visible.length === 0 && (
          <div style={{ fontSize: '12px', color: '#7a8392', padding: '12px', fontFamily: 'monospace' }}>
            Nothing buildable. Craft structures first.
          </div>
        )}
        {visible.map((def) => {
          const count = stacks.find((s) => s.itemId === def.id)?.count ?? 0;
          return (
            <BuildCard
              key={def.id}
              def={def}
              count={count}
              selected={selectedItemId === def.id}
              onClick={() => onSelect(selectedItemId === def.id ? null : def.id)}
            />
          );
        })}
      </div>
    </div>
  );
};
