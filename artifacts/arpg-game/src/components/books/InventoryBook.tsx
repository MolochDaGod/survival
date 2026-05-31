import * as React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { BookOverlay } from './BookOverlay';
import { assetUrl } from '../../lib/assetUrl';
import { Minimap } from '../../game/ui/Minimap';
import type { MapMarker } from './MiniMap';
import {
  HelmGlyph, ChestplateGlyph, LegsGlyph, BootsGlyph,
  AmuletGlyph, RingGlyph, ShieldGlyph, MainhandGlyph,
  BoxGlyph, PersonGlyph,
} from './BookIcons';
import type { InventoryItem, ItemStats, EquipSlot, ItemDef } from '../../game/Items';
import type { EquippedSet } from '../../game/Inventory';

interface Props {
  onClose: () => void;
  bag: InventoryItem[];
  equipped: EquippedSet;
  totalStats: ItemStats;
  bagCap: number;
  player: { x: number; z: number; yaw: number };
  mapMarkers: MapMarker[];
  getDef: (item: InventoryItem | undefined) => ItemDef | null;
  onEquip: (uid: string) => void;
  onUnequip: (slot: EquipSlot) => void;
  onDrop: (uid: string) => void;
  /** Live "paperdoll" canvas owned by the engine's PortraitRenderer.
   * When provided, it is mounted into the Survivor portrait box so the
   * player sees a real-time render of themselves from a camera standing
   * in front of them. Falls back to the silhouette glyph when null. */
  portraitCanvas?: HTMLCanvasElement | null;
  /** Toggle the engine's portrait pass on/off so we don't pay the
   * extra render + GPU readback when nobody is looking. */
  setPortraitActive?: (active: boolean) => void;
}

type SlotIcon = (props: { size?: number; color?: string }) => React.ReactElement;

const EQUIP_SLOTS: { slot: EquipSlot; label: string; Icon: SlotIcon }[] = [
  { slot: 'mainhand', label: 'Main Hand', Icon: MainhandGlyph },
  { slot: 'offhand',  label: 'Off Hand',  Icon: ShieldGlyph },
  { slot: 'helm',     label: 'Helm',      Icon: HelmGlyph },
  { slot: 'chest',    label: 'Chest',     Icon: ChestplateGlyph },
  { slot: 'legs',     label: 'Legs',      Icon: LegsGlyph },
  { slot: 'boots',    label: 'Boots',     Icon: BootsGlyph },
  { slot: 'amulet',   label: 'Amulet',    Icon: AmuletGlyph },
  { slot: 'ring',     label: 'Ring',      Icon: RingGlyph },
];

/**
 * Render a definition's icon. Item icons in `Items.ts` were originally
 * emoji string literals; per the no-emoji-in-books rule we now treat any
 * string starting with `/` as an image path and everything else as the
 * fallback box glyph. When the icon pack is uploaded later, swapping the
 * Items.ts strings to `/icons/items/...` paths will Just Work.
 */
function ItemIcon({ icon, size = 26 }: { icon?: string; size?: number }) {
  if (icon && icon.startsWith('/')) {
    return <img src={assetUrl(icon)} alt="" style={{ width: size, height: size, imageRendering: 'pixelated' }} />;
  }
  return <BoxGlyph size={size} color="#6b3e1c" />;
}

export function InventoryBook(props: Props) {
  const { onClose, bag, equipped, totalStats, bagCap, player, mapMarkers, getDef, onEquip, onUnequip, onDrop, portraitCanvas, setPortraitActive } = props;
  const [selected, setSelected] = useState<InventoryItem | null>(bag[0] ?? null);

  // Ref callback — runs every time the equipment-page host node mounts /
  // unmounts. Because BookOverlay rebuilds page DOM on each page turn,
  // a useEffect keyed on `[portraitCanvas]` would not re-fire when the
  // user leaves and returns to the Equipment page. The ref callback
  // *does* re-fire, so the canvas re-attaches reliably.
  const portraitMountCallback = useCallback((host: HTMLDivElement | null) => {
    if (!portraitCanvas) return;
    if (host) {
      host.innerHTML = '';
      host.appendChild(portraitCanvas);
    }
  }, [portraitCanvas]);

  // Toggle the engine's portrait-render pass on while this overlay is
  // mounted. Detach the canvas from any DOM parent on close so the next
  // open is a fresh mount.
  useEffect(() => {
    if (!portraitCanvas) return;
    setPortraitActive?.(true);
    return () => {
      setPortraitActive?.(false);
      if (portraitCanvas.parentElement) {
        portraitCanvas.parentElement.removeChild(portraitCanvas);
      }
    };
  }, [portraitCanvas, setPortraitActive]);

  // ── Page 1: Character + Equipment ─────────────────────────────────────────
  const renderEquipPage = () => (
    <>
      <div className="book-page left">
        <h1 className="book-h1">Survivor</h1>
        <div className="bestiary-portrait" style={{ aspectRatio: '3/4', overflow: 'hidden' }}>
          {portraitCanvas ? (
            <div
              ref={portraitMountCallback}
              style={{ width: '100%', height: '100%' }}
            />
          ) : (
            <PersonGlyph size={120} color="#6b3e1c" />
          )}
        </div>

        <h2 className="book-h2" style={{ marginTop: 6 }}>Stats</h2>
        {Object.entries(totalStats)
          .filter(([, v]) => Math.abs(v as number) > 0.01)
          .slice(0, 8)
          .map(([k, v]) => (
            <div key={k} className="book-stat-row">
              <span style={{ textTransform: 'capitalize' }}>{k.replace(/([A-Z])/g, ' $1').toLowerCase()}</span>
              <b>{(v as number).toFixed((v as number) < 1 ? 2 : 0)}</b>
            </div>
          ))}
        {Object.values(totalStats).every(v => Math.abs(v as number) < 0.01) && (
          <p className="book-text" style={{ opacity: 0.6 }}>No equipped bonuses yet.</p>
        )}
      </div>

      <div className="book-page right">
        <h1 className="book-h1">Equipment</h1>
        <div className="book-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', marginTop: 4 }}>
          {EQUIP_SLOTS.map(({ slot, label, Icon }) => {
            const item = equipped[slot];
            const def = getDef(item);
            return (
              <div
                key={slot}
                className={'book-thumb' + (item ? ' selected' : '')}
                style={{ aspectRatio: '3/1', flexDirection: 'row', justifyContent: 'flex-start', padding: '0 6px', gap: 6 }}
                onClick={() => item && onUnequip(slot)}
                title={def ? `${def.name} (click to unequip)` : `Empty ${label} slot`}
              >
                <Icon size={28} color="#6b3e1c" />
                <div style={{ textAlign: 'left', overflow: 'hidden' }}>
                  <div style={{ fontSize: 11, color: '#8a6a3a', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: def ? '#3a1f10' : '#aa9a6a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {def ? def.name : '— empty —'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );

  // ── Page 2: Inventory bag ─────────────────────────────────────────────────
  const renderBagPage = () => (
    <>
      <div className="book-page left">
        <h1 className="book-h1">Pack</h1>
        <p className="book-text" style={{ textAlign: 'center', fontSize: 13, opacity: 0.7 }}>
          {bag.length} / {bagCap} items
        </p>
        <div className="book-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)', marginTop: 4 }}>
          {Array.from({ length: bagCap }, (_, i) => bag[i]).map((item, i) => {
            const def = getDef(item);
            return (
              <div
                key={i}
                className={'book-thumb' + (selected?.uid === item?.uid ? ' selected' : '')}
                style={{ aspectRatio: '1/1' }}
                onClick={() => item && setSelected(item)}
                title={def?.name ?? 'Empty'}
              >
                {def ? <ItemIcon icon={def.icon} /> : <span style={{ opacity: 0.2 }}>·</span>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="book-page right">
        <h1 className="book-h1">Item Detail</h1>
        {selected ? (() => {
          const def = getDef(selected);
          if (!def) return <p className="book-text">Item data missing.</p>;
          return (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <ItemIcon icon={def.icon} size={48} />
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#6b2c0a' }}>{def.name}</div>
                  <div style={{ fontSize: 11, color: '#8a6a3a', textTransform: 'uppercase', letterSpacing: 1 }}>
                    {def.rarity ?? 'common'} · {def.slot ?? 'misc'}
                  </div>
                </div>
              </div>
              {def.description && <p className="book-text" style={{ fontStyle: 'italic', fontSize: 12 }}>{def.description}</p>}

              {def.stats && Object.keys(def.stats).length > 0 && (
                <>
                  <h2 className="book-h2" style={{ marginTop: 6 }}>Bonuses</h2>
                  {Object.entries(def.stats).map(([k, v]) => (
                    <div key={k} className="book-stat-row">
                      <span style={{ textTransform: 'capitalize' }}>{k.replace(/([A-Z])/g, ' $1').toLowerCase()}</span>
                      <b>{(v as number) >= 0 ? '+' : ''}{v as number}</b>
                    </div>
                  ))}
                </>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                {def.slot && (
                  <button className="page-turn" style={{ position: 'static', width: 'auto', height: 'auto', transform: 'none', padding: '6px 16px', borderRadius: 6, fontSize: 13, color: '#fbe9b8' }}
                    onClick={() => onEquip(selected.uid)}>Equip</button>
                )}
                <button className="page-turn" style={{ position: 'static', width: 'auto', height: 'auto', transform: 'none', padding: '6px 16px', borderRadius: 6, fontSize: 13, color: '#fbe9b8', background: 'linear-gradient(150deg, #5a1818 0%, #2a0808 100%)', borderColor: '#c54040' }}
                  onClick={() => { onDrop(selected.uid); setSelected(null); }}>Drop</button>
              </div>
            </>
          );
        })() : (
          <p className="book-text" style={{ opacity: 0.6 }}>Select an item from the pack to inspect.</p>
        )}
      </div>
    </>
  );

  // ── Page 3: Map ───────────────────────────────────────────────────────────
  const renderMapPage = () => (
    <>
      <div className="book-page left">
        <h1 className="book-h1">Region Map</h1>
        <div style={{ width: 240, height: 240, margin: '0 auto' }}>
          <Minimap playerX={player.x} playerZ={player.z} playerYaw={player.yaw} />
        </div>
      </div>
      <div className="book-page right">
        <h1 className="book-h1">Notes</h1>
        <p className="book-text" style={{ fontSize: 12 }}>
          Hover any marker on the map to see what lies there. Use the slider to expand or focus your view.
        </p>
        <h2 className="book-h2" style={{ marginTop: 6 }}>Visible</h2>
        <div className="book-stat-row"><span>Hostiles</span><b>{mapMarkers.filter(m => m.kind === 'enemy').length}</b></div>
        <div className="book-stat-row"><span>Resources</span><b>{mapMarkers.filter(m => m.kind === 'resource').length}</b></div>
        <div className="book-stat-row"><span>Settlements</span><b>{mapMarkers.filter(m => m.kind === 'town').length}</b></div>
        <div className="book-stat-row"><span>Traders</span><b>{mapMarkers.filter(m => m.kind === 'trader').length}</b></div>
        <div className="book-stat-row"><span>Dungeons</span><b>{mapMarkers.filter(m => m.kind === 'dungeon').length}</b></div>

        <p className="book-text" style={{ marginTop: 14, fontSize: 13, fontStyle: 'italic', opacity: 0.7 }}>
          Heading: {Math.round((player.yaw * 180) / Math.PI)}°
        </p>
      </div>
    </>
  );

  const pages = [
    { id: 'equip', badge: { color: '#c5a059', label: 'Equipment' }, render: renderEquipPage },
    { id: 'bag',   badge: { color: '#6b3e1c', label: 'Pack' },      render: renderBagPage },
    { id: 'map',   badge: { color: '#3a6e8a', label: 'Map' },       render: renderMapPage },
  ];

  return <BookOverlay kind="adventure" pages={pages} onClose={onClose} />;
}
