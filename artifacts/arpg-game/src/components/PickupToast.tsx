import React, { useEffect, useState } from 'react';
import { ItemDef, RARITY_HEX } from '../game/Items';

interface Toast {
  id: number;
  def: ItemDef;
  ts: number;
}

interface Props {
  pickups: ItemDef[];
}

let _id = 0;

export const PickupToast: React.FC<Props> = ({ pickups }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    if (pickups.length === 0) return;
    const last = pickups[pickups.length - 1];
    const t: Toast = { id: ++_id, def: last, ts: Date.now() };
    setToasts((prev) => [...prev, t]);
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== t.id));
    }, 3000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickups.length]);

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      right: '20px',
      bottom: '180px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      zIndex: 100,
      pointerEvents: 'none',
      fontFamily: 'monospace',
    }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            background: 'rgba(8,12,20,0.92)',
            border: `2px solid ${RARITY_HEX[t.def.rarity]}`,
            borderRadius: '8px',
            padding: '8px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            boxShadow: `0 0 16px ${RARITY_HEX[t.def.rarity]}66`,
            animation: 'pickupSlideIn 0.3s ease-out',
            minWidth: '200px',
          }}
        >
          <div style={{ fontSize: '24px' }}>{t.def.icon}</div>
          <div>
            <div style={{ fontSize: '9px', color: '#888', letterSpacing: '1px' }}>+ PICKED UP</div>
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: RARITY_HEX[t.def.rarity] }}>
              {t.def.name}
            </div>
            <div style={{ fontSize: '9px', color: '#666', textTransform: 'uppercase' }}>
              {t.def.rarity} • {t.def.slot}
            </div>
          </div>
        </div>
      ))}
      <style>{`
        @keyframes pickupSlideIn {
          from { transform: translateX(40px); opacity: 0; }
          to   { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
};
