import React, { useMemo, useState } from 'react';
import {
  EquipSlot,
  ITEM_DATABASE,
  ItemDef,
  ItemStats,
  RARITY_HEX,
} from '../game/Items';
import { EquippedSet, ALL_SLOTS } from '../game/Inventory';
import { InventoryItem } from '../game/Items';
import GameIcon from './ui/GameIcon';

interface EquipmentPanelProps {
  bag: InventoryItem[];
  bagCap: number;
  equipped: EquippedSet;
  totalStats: ItemStats;
  onEquip: (uid: string) => void;
  onUnequip: (slot: EquipSlot) => void;
  onDrop: (uid: string) => void;
  onClose: () => void;
}

const SLOT_LAYOUT: { slot: EquipSlot; label: string; icon: string }[] = [
  { slot: 'helm', label: 'Helm', icon: '🪖' },
  { slot: 'amulet', label: 'Amulet', icon: '📿' },
  { slot: 'chest', label: 'Chest', icon: '🛡️' },
  { slot: 'mainhand', label: 'Main Hand', icon: '⚔️' },
  { slot: 'offhand', label: 'Off Hand', icon: '🛡️' },
  { slot: 'legs', label: 'Legs', icon: '🦵' },
  { slot: 'boots', label: 'Boots', icon: '👞' },
  { slot: 'ring', label: 'Ring', icon: '💍' },
];

const formatStat = (key: string, value: number): { label: string; sign: string } => {
  const labels: Record<string, string> = {
    damage: 'Damage', armor: 'Armor', health: 'Max HP', mana: 'Max MP',
    moveSpeed: 'Move Spd', attackSpeed: 'Atk Spd', critChance: 'Crit',
    strength: 'STR', agility: 'AGI', intelligence: 'INT', endurance: 'END',
  };
  const isPct = key === 'moveSpeed' || key === 'attackSpeed' || key === 'critChance';
  return {
    label: labels[key] ?? key,
    sign: `+${value}${isPct ? '%' : ''}`,
  };
};

const ItemTooltip: React.FC<{ def: ItemDef }> = ({ def }) => (
  <div style={{
    position: 'absolute', left: '100%', top: 0, marginLeft: '10px',
    background: 'rgba(8,12,20,0.97)',
    border: `2px solid ${RARITY_HEX[def.rarity]}`,
    borderRadius: '8px', padding: '12px',
    minWidth: '200px', zIndex: 1000,
    fontFamily: 'monospace', pointerEvents: 'none',
    boxShadow: `0 0 20px ${RARITY_HEX[def.rarity]}66`,
  }}>
    <div style={{ fontSize: '13px', fontWeight: 'bold', color: RARITY_HEX[def.rarity], marginBottom: '4px' }}>
      {def.name}
    </div>
    <div style={{ fontSize: '9px', color: '#888', textTransform: 'uppercase', marginBottom: '8px' }}>
      {def.rarity} • {def.slot}
    </div>
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '6px', marginBottom: '6px' }}>
      {Object.entries(def.stats).map(([k, v]) => {
        const f = formatStat(k, v as number);
        return (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '2px' }}>
            <span style={{ color: '#aaa' }}>{f.label}</span>
            <span style={{ color: '#69f0ae' }}>{f.sign}</span>
          </div>
        );
      })}
    </div>
    <div style={{ fontSize: '10px', color: '#777', fontStyle: 'italic', marginTop: '4px' }}>
      "{def.description}"
    </div>
  </div>
);

const SlotCell: React.FC<{
  slot: EquipSlot;
  label: string;
  icon: string;
  item?: InventoryItem;
  onClick: () => void;
}> = ({ slot: _slot, label, icon, item, onClick }) => {
  const [hover, setHover] = useState(false);
  const def = item ? ITEM_DATABASE[item.defId] : null;
  return (
    <div
      onClick={item ? onClick : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        width: '64px', height: '64px',
        background: 'rgba(0,0,0,0.5)',
        border: `2px solid ${def ? RARITY_HEX[def.rarity] : 'rgba(255,255,255,0.12)'}`,
        borderRadius: '8px',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        cursor: item ? 'pointer' : 'default',
        boxShadow: def ? `0 0 8px ${RARITY_HEX[def.rarity]}44` : 'none',
        transition: 'transform 0.1s',
        transform: hover && item ? 'scale(1.06)' : 'scale(1)',
      }}
    >
      {def ? (
        <GameIcon icon={def.icon} size={36} alt={def.name} />
      ) : (
        <>
          <GameIcon icon={icon} size={18} style={{ opacity: 0.25 }} />
          <div style={{ fontSize: '7px', color: '#444', marginTop: '2px', textTransform: 'uppercase' }}>{label}</div>
        </>
      )}
      {hover && def && <ItemTooltip def={def} />}
    </div>
  );
};

const BagCell: React.FC<{
  item?: InventoryItem;
  onLeft: () => void;
  onRight: () => void;
}> = ({ item, onLeft, onRight }) => {
  const [hover, setHover] = useState(false);
  const def = item ? ITEM_DATABASE[item.defId] : null;
  return (
    <div
      onClick={item ? onLeft : undefined}
      onContextMenu={(e) => {
        e.preventDefault();
        if (item) onRight();
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        width: '52px', height: '52px',
        background: 'rgba(0,0,0,0.4)',
        border: `1.5px solid ${def ? RARITY_HEX[def.rarity] : 'rgba(255,255,255,0.08)'}`,
        borderRadius: '6px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: item ? 'pointer' : 'default',
        boxShadow: def ? `inset 0 0 12px ${RARITY_HEX[def.rarity]}33` : 'none',
        transition: 'transform 0.1s',
        transform: hover && item ? 'scale(1.06)' : 'scale(1)',
      }}
    >
      {def && <GameIcon icon={def.icon} size={32} alt={def.name} />}
      {hover && def && <ItemTooltip def={def} />}
    </div>
  );
};

export const EquipmentPanel: React.FC<EquipmentPanelProps> = ({
  bag, bagCap, equipped, totalStats, onEquip, onUnequip, onDrop, onClose,
}) => {
  const slotMap = useMemo(() => {
    const m: Record<EquipSlot, typeof SLOT_LAYOUT[0]> = {} as any;
    for (const e of SLOT_LAYOUT) m[e.slot] = e;
    for (const s of ALL_SLOTS) {
      if (!m[s]) m[s] = { slot: s, label: s, icon: '·' };
    }
    return m;
  }, []);

  const statRows = Object.entries(totalStats).filter(([, v]) => (v as number) > 0);
  const bagWithEmpty: (InventoryItem | undefined)[] = [...bag];
  while (bagWithEmpty.length < bagCap) bagWithEmpty.push(undefined);

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'radial-gradient(ellipse at 50% 0%, rgba(13,27,42,0.95) 0%, rgba(3,8,16,0.97) 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 250, fontFamily: 'monospace',
    }}>
      <div style={{
        background: 'rgba(10,15,25,0.98)',
        border: '1px solid rgba(79,195,247,0.2)',
        borderRadius: '16px',
        padding: '24px',
        width: '780px', maxWidth: '95vw',
        maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 20px 80px rgba(0,0,0,0.7)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <div style={{ fontSize: '11px', color: '#4fc3f7', letterSpacing: '4px', textTransform: 'uppercase' }}>
              ◆ Inventory ◆
            </div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ff6b35', letterSpacing: '2px', marginTop: '2px' }}>
              EQUIPMENT
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,107,53,0.1)',
              border: '1px solid rgba(255,107,53,0.4)',
              borderRadius: '6px',
              color: '#ff6b35',
              padding: '8px 14px',
              cursor: 'pointer',
              fontFamily: 'monospace',
              fontSize: '11px',
            }}
          >
            ✕ CLOSE [I]
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          {/* LEFT: Equipment slots layout */}
          <div style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '12px',
            padding: '20px',
          }}>
            <div style={{ fontSize: '10px', color: '#888', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '16px' }}>
              Equipped Gear
            </div>

            {/* paper-doll layout */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
              {/* Head row */}
              <div style={{ display: 'flex', gap: '40px' }}>
                <div style={{ width: '64px' }} />
                <SlotCell {...slotMap.helm} item={equipped.helm} onClick={() => onUnequip('helm')} />
                <SlotCell {...slotMap.amulet} item={equipped.amulet} onClick={() => onUnequip('amulet')} />
              </div>
              {/* Chest row */}
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <SlotCell {...slotMap.mainhand} item={equipped.mainhand} onClick={() => onUnequip('mainhand')} />
                <SlotCell {...slotMap.chest} item={equipped.chest} onClick={() => onUnequip('chest')} />
                <SlotCell {...slotMap.offhand} item={equipped.offhand} onClick={() => onUnequip('offhand')} />
              </div>
              {/* Legs row */}
              <div style={{ display: 'flex', gap: '40px' }}>
                <SlotCell {...slotMap.ring} item={equipped.ring} onClick={() => onUnequip('ring')} />
                <SlotCell {...slotMap.legs} item={equipped.legs} onClick={() => onUnequip('legs')} />
                <div style={{ width: '64px' }} />
              </div>
              {/* Feet row */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <SlotCell {...slotMap.boots} item={equipped.boots} onClick={() => onUnequip('boots')} />
              </div>
            </div>

            {/* Aggregated stats */}
            <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: '10px', color: '#888', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '10px' }}>
                Total Bonuses
              </div>
              {statRows.length === 0 ? (
                <div style={{ fontSize: '11px', color: '#555', fontStyle: 'italic' }}>No equipment bonuses</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px' }}>
                  {statRows.map(([k, v]) => {
                    const f = formatStat(k, v as number);
                    return (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                        <span style={{ color: '#888' }}>{f.label}</span>
                        <span style={{ color: '#69f0ae', fontWeight: 'bold' }}>{f.sign}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: Bag */}
          <div style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '12px',
            padding: '20px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ fontSize: '10px', color: '#888', letterSpacing: '2px', textTransform: 'uppercase' }}>
                Bag
              </div>
              <div style={{ fontSize: '10px', color: '#666' }}>
                {bag.length} / {bagCap}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '6px' }}>
              {bagWithEmpty.map((it, i) => (
                <BagCell
                  key={it?.uid ?? `e${i}`}
                  item={it}
                  onLeft={() => it && onEquip(it.uid)}
                  onRight={() => it && onDrop(it.uid)}
                />
              ))}
            </div>

            <div style={{ marginTop: '14px', fontSize: '9px', color: '#555', lineHeight: 1.6 }}>
              • Click bag item to equip<br />
              • Right-click bag item to drop<br />
              • Click equipped slot to unequip<br />
              • Hover for full item details<br />
              • Walk over loot orbs to collect
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
