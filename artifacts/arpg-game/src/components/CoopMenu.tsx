/**
 * CoopMenu — small in-game overlay for hosting/joining co-op sessions.
 *
 * Sits in the lower-right corner of the canvas. Collapsed by default; one
 * click expands to show the room code, peer list, host/join inputs, and
 * latency. Drives the `MultiplayerSystem` singleton — no other module
 * touches the websocket directly.
 */
import { useEffect, useRef, useState } from 'react';
import { MultiplayerSystem, type MultiplayerSnapshot } from '@/game/net/MultiplayerSystem';

interface CoopMenuProps {
  /** Display name to broadcast to peers (defaults to "Wanderer"). */
  playerName: string;
}

export function CoopMenu({ playerName }: CoopMenuProps) {
  const [snap, setSnap] = useState<MultiplayerSnapshot>(MultiplayerSystem.getSnapshot());
  const [open, setOpen] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const connectedRef = useRef(false);

  useEffect(() => MultiplayerSystem.subscribe(setSnap), []);

  const connectIfNeeded = () => {
    if (connectedRef.current) return;
    connectedRef.current = true;
    MultiplayerSystem.connect(playerName);
  };

  const handleHost = () => {
    connectIfNeeded();
    MultiplayerSystem.host();
  };

  const handleJoin = () => {
    if (!codeInput.trim()) return;
    connectIfNeeded();
    MultiplayerSystem.join(codeInput);
  };

  const dotColor =
    snap.status === 'open' ? '#6ec96e' :
    snap.status === 'connecting' || snap.status === 'reconnecting' ? '#d4a400' :
    snap.status === 'closed' ? '#777' : '#888';

  return (
    <div style={panelStyle}>
      <button onClick={() => setOpen(o => !o)} style={headerStyle} aria-label="Co-op menu">
        <span style={{ ...dotStyle, background: dotColor }} />
        <span>CO-OP</span>
        {snap.roomCode && <span style={codeBadgeStyle}>{snap.roomCode}</span>}
        {snap.latencyMs != null && snap.status === 'open' && (
          <span style={pingStyle}>{snap.latencyMs}ms</span>
        )}
        <span style={{ marginLeft: 'auto', opacity: 0.6 }}>{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div style={bodyStyle}>
          {!snap.roomCode ? (
            <>
              <button onClick={handleHost} style={btnPrimaryStyle}>Host New Room</button>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <input
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                  placeholder="ROOM CODE"
                  maxLength={8}
                  style={inputStyle}
                />
                <button onClick={handleJoin} style={btnSecondaryStyle} disabled={!codeInput.trim()}>
                  Join
                </button>
              </div>
              <p style={hintStyle}>Up to 4 players. Position-only sync this build.</p>
            </>
          ) : (
            <>
              <div style={rowStyle}>
                <span style={labelStyle}>Room</span>
                <code style={codeMonoStyle}>{snap.roomCode}</code>
              </div>
              <div style={rowStyle}>
                <span style={labelStyle}>Status</span>
                <span style={{ color: dotColor }}>{snap.status}</span>
              </div>
              <div style={{ marginTop: 6 }}>
                <div style={labelStyle}>Peers ({snap.peers.length})</div>
                {snap.peers.length === 0 ? (
                  <div style={hintStyle}>Waiting for friends to join…</div>
                ) : (
                  <ul style={peerListStyle}>
                    {snap.peers.map(p => (
                      <li key={p.peerId} style={peerItemStyle}>
                        <span style={{ ...dotStyle, background: '#5588ff' }} />
                        {p.name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button onClick={() => MultiplayerSystem.leave()} style={btnDangerStyle}>
                Leave Room
              </button>
            </>
          )}
          {snap.errors.length > 0 && (
            <div style={errorStyle}>{snap.errors[snap.errors.length - 1]}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Styles (inline to avoid touching MainPanel.tsx CSS island) ─────────────

const panelStyle: React.CSSProperties = {
  position: 'fixed', right: 16, bottom: 16, zIndex: 50,
  width: 256, fontFamily: "'Cinzel', serif",
  background: 'rgba(14,12,7,0.92)', border: '1px solid #3a2f10',
  borderRadius: 6, color: '#c8b97a',
  boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
  backdropFilter: 'blur(6px)',
};
const headerStyle: React.CSSProperties = {
  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
  background: 'transparent', border: 0, color: 'inherit',
  padding: '8px 12px', cursor: 'pointer',
  fontSize: 11, letterSpacing: 2, textTransform: 'uppercase',
};
const dotStyle: React.CSSProperties = {
  width: 8, height: 8, borderRadius: '50%', display: 'inline-block',
};
const codeBadgeStyle: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
  color: '#f5c542', marginLeft: 4, letterSpacing: 1,
};
const pingStyle: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
  color: '#8a7a5e', marginLeft: 6,
};
const bodyStyle: React.CSSProperties = {
  borderTop: '1px solid #2a2210', padding: 12, fontSize: 12,
};
const rowStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '3px 0', fontSize: 11,
};
const labelStyle: React.CSSProperties = {
  color: '#8a7a5e', fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase',
};
const codeMonoStyle: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace", fontSize: 14,
  color: '#f5c542', letterSpacing: 2,
};
const inputStyle: React.CSSProperties = {
  flex: 1, background: '#12100a', border: '1px solid #3a2f10',
  borderRadius: 3, padding: '6px 8px', color: '#f5c542',
  fontFamily: "'JetBrains Mono', monospace", fontSize: 12, letterSpacing: 1,
  textTransform: 'uppercase',
};
const btnBase: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: '1px solid',
  background: 'transparent', cursor: 'pointer',
  fontFamily: "'Cinzel', serif", fontSize: 11, letterSpacing: 1.5,
  textTransform: 'uppercase',
};
const btnPrimaryStyle: React.CSSProperties = {
  ...btnBase, borderColor: '#d4a400', color: '#f5c542',
  background: 'rgba(212,164,0,0.08)',
};
const btnSecondaryStyle: React.CSSProperties = {
  ...btnBase, width: 'auto', borderColor: '#5588ff', color: '#88aaff',
};
const btnDangerStyle: React.CSSProperties = {
  ...btnBase, marginTop: 10, borderColor: '#a04040', color: '#d45050',
};
const peerListStyle: React.CSSProperties = {
  listStyle: 'none', padding: 0, margin: '4px 0 0', maxHeight: 80, overflowY: 'auto',
};
const peerItemStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0', fontSize: 11,
};
const hintStyle: React.CSSProperties = {
  marginTop: 8, fontSize: 10, color: '#665a3a', lineHeight: 1.4,
};
const errorStyle: React.CSSProperties = {
  marginTop: 8, padding: '6px 8px', fontSize: 10, color: '#d45050',
  background: 'rgba(212,80,80,0.08)', border: '1px solid #4a2020', borderRadius: 3,
};
