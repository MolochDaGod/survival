import React, { useEffect, useState } from 'react';

interface Binding {
  keys: string[];
  action: string;
}

interface Group {
  name: string;
  bindings: Binding[];
}

const GROUPS: Group[] = [
  {
    name: 'Movement',
    bindings: [
      { keys: ['W', 'A', 'S', 'D'], action: 'Move' },
      { keys: ['Space'], action: 'Jump' },
      { keys: ['Shift'], action: 'Roll / dodge' },
      { keys: ['Mouse'], action: 'Aim / look' },
    ],
  },
  {
    name: 'Combat',
    bindings: [
      { keys: ['LMB'], action: 'Attack / fire' },
      { keys: ['RMB'], action: 'Block / parry' },
      { keys: ['Q'], action: 'Swap weapon' },
    ],
  },
  {
    name: 'Active Skills',
    bindings: [
      { keys: ['1'], action: 'BIO active' },
      { keys: ['2'], action: 'NEU active' },
      { keys: ['3'], action: 'KIN active' },
      { keys: ['4'], action: 'QNT active' },
      { keys: ['5'], action: 'SYN active' },
      { keys: ['6'], action: 'CHR active' },
      { keys: ['7'], action: 'ENT active' },
      { keys: ['8'], action: 'GRA active' },
      { keys: ['Shift', '1-8'], action: 'Upgraded form (T6)' },
    ],
  },
  {
    name: 'Camera',
    bindings: [
      { keys: ['F1'], action: 'First-person' },
      { keys: ['F2'], action: 'Third-person' },
      { keys: ['F3'], action: 'ARPG view' },
      { keys: ['V'], action: 'Cycle camera' },
    ],
  },
  {
    name: 'UI',
    bindings: [
      { keys: ['T'], action: 'Skill tree' },
      { keys: ['I'], action: 'Inventory' },
      { keys: ['Esc'], action: 'Pause / menu' },
      { keys: ['H'], action: 'This help' },
    ],
  },
  {
    name: 'Debug',
    bindings: [
      { keys: ['F8'], action: 'Performance overlay' },
      { keys: ['`'], action: 'Debug tuning panel' },
    ],
  },
  {
    name: 'Gamepad',
    bindings: [
      { keys: ['LStick'], action: 'Move' },
      { keys: ['A'], action: 'Jump' },
      { keys: ['B'], action: 'Roll' },
      { keys: ['X'], action: 'Swap weapon' },
      { keys: ['Y'], action: 'Cycle camera' },
      { keys: ['LT', 'RT'], action: 'Block / Attack' },
      { keys: ['DPad'], action: 'Abilities / Inv / Skills' },
      { keys: ['Start'], action: 'Pause' },
    ],
  },
];

const Key: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd style={{
    display: 'inline-block',
    minWidth: '22px',
    padding: '2px 6px',
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.18)',
    borderRadius: '4px',
    fontFamily: 'monospace',
    fontSize: '11px',
    color: '#fff176',
    textAlign: 'center',
    marginRight: '3px',
  }}>{children}</kbd>
);

export const HotkeyHelp: React.FC = () => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Window + capture-phase listener so this overlay can take Escape
    // ownership when it's the topmost modal. BookOverlay also uses
    // window+capture+stopImmediatePropagation, so a `document`-bound
    // listener would lose the race and Escape would close the book
    // beneath us instead of this help screen.
    //
    // We bind the listener UNCONDITIONALLY (so KeyH always toggles), but
    // only call stopImmediatePropagation for events we actually consume,
    // so non-Help hotkeys still reach the rest of the app normally.
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (e.code === 'KeyH' && !e.repeat) {
        setOpen((v) => !v);
        e.preventDefault();
        e.stopImmediatePropagation();
      } else if (e.code === 'Escape' && open) {
        setOpen(false);
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [open]);

  if (!open) return null;

  return (
    <div
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.78)',
        backdropFilter: 'blur(6px)',
        // Above BookOverlay (9000) so opening Help while a book is up
        // doesn't render the help BEHIND the book. Below PerfMonitor
        // (9999) so the perf HUD always remains visible on top.
        zIndex: 9500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'linear-gradient(180deg, #0e1a26 0%, #050c14 100%)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: '12px',
          padding: '24px 28px',
          maxWidth: '880px',
          width: '100%',
          maxHeight: '85vh',
          overflowY: 'auto',
          color: '#fff',
          fontFamily: 'monospace',
          boxShadow: '0 12px 48px rgba(0,0,0,0.6)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '18px' }}>
          <h2 style={{ margin: 0, fontSize: '20px', color: '#ff6b35', letterSpacing: '0.05em' }}>CONTROLS</h2>
          <span style={{ fontSize: '11px', color: '#8899aa' }}>Press <Key>H</Key> or <Key>Esc</Key> to close</span>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '20px',
        }}>
          {GROUPS.map((g) => (
            <div key={g.name}>
              <div style={{
                fontSize: '11px',
                color: '#69f0ae',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                marginBottom: '8px',
                borderBottom: '1px solid rgba(105,240,174,0.25)',
                paddingBottom: '4px',
              }}>{g.name}</div>
              {g.bindings.map((b, i) => (
                <div key={i} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '4px 0',
                  fontSize: '12px',
                }}>
                  <span style={{ color: '#cfd8dc' }}>{b.action}</span>
                  <span>{b.keys.map((k, j) => <Key key={j}>{k}</Key>)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
