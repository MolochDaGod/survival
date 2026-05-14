import React, { useEffect, useRef } from 'react';
import { GrudgeStats } from '../game/CharacterConfig';

interface BiometricReadoutProps {
  stats: GrudgeStats;
}

function computeVitals(stats: GrudgeStats) {
  return {
    projectedHP:        100 + stats.bio * 15,
    staminaReserve:     80  + stats.kin * 12,
    reactionIndex:      (stats.kin * 8  + stats.neu * 6).toFixed(1),
    neuralCoherence:    (stats.neu * 14 + stats.qnt * 8).toFixed(1),
    entropicDurability: (stats.ent * 16 + stats.gra * 4).toFixed(1),
    graviticTolerance:  (stats.gra * 14 + stats.kin * 4).toFixed(1),
  };
}

const ECG_PATH =
  'M0,16 L10,16 L14,4 L18,28 L22,4 L26,28 L30,16 L36,16 L38,10 L40,22 L42,16 L60,16 L64,4 L68,28 L72,4 L76,28 L80,16 L90,16 L92,12 L94,20 L96,16 L120,16';

const VitalRow: React.FC<{ label: string; value: string | number; unit: string; color: string; pct: number }> =
  ({ label, value, unit, color, pct }) => (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
        <span style={{ fontSize: 9, color: '#5a7a8a', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color, fontFamily: 'monospace' }}>
          {value}<span style={{ fontSize: 9, color: '#4a6a7a', marginLeft: 2 }}>{unit}</span>
        </span>
      </div>
      <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
        <div style={{
          height: '100%', borderRadius: 2,
          width: `${Math.min(100, pct)}%`,
          background: `linear-gradient(90deg, ${color}88, ${color})`,
          boxShadow: `0 0 6px ${color}66`,
          transition: 'width 0.35s ease',
        }} />
      </div>
    </div>
  );

export const BiometricReadout: React.FC<BiometricReadoutProps> = ({ stats }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offsetRef = useRef(0);
  const rafRef    = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const pts: number[] = [];

    for (let x = 0; x < w * 2; x++) {
      const base = Math.sin(x * 0.05) * 2;
      const spike1 = Math.exp(-Math.pow((x % 120 - 20), 2) / 8) * 14;
      const spike2 = -Math.exp(-Math.pow((x % 120 - 28), 2) / 5) * 28;
      const spike3 = Math.exp(-Math.pow((x % 120 - 36), 2) / 5) * 28;
      const spike4 = -Math.exp(-Math.pow((x % 120 - 44), 2) / 8) * 8;
      pts.push(h / 2 + base + spike1 + spike2 + spike3 + spike4);
    }

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);

      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, 'rgba(0,255,150,0)');
      grad.addColorStop(0.3, 'rgba(0,255,150,0.8)');
      grad.addColorStop(0.7, 'rgba(0,255,150,0.8)');
      grad.addColorStop(1, 'rgba(0,255,150,0)');

      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.5;
      ctx.shadowColor = '#00ff96';
      ctx.shadowBlur = 6;

      ctx.beginPath();
      const off = Math.floor(offsetRef.current) % w;
      for (let x = 0; x < w; x++) {
        const idx = (x + off) % (w * 2);
        const y = pts[idx];
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      offsetRef.current += 0.8;
      rafRef.current = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const v = computeVitals(stats);
  const totalStats = Object.values(stats).reduce((s, x) => s + x, 0);
  const maxTotal = 48;

  return (
    <div style={{
      background: 'rgba(4,10,18,0.92)',
      border: '1px solid rgba(0,200,150,0.25)',
      borderRadius: 8,
      padding: '10px 12px',
      backdropFilter: 'blur(8px)',
    }}>
      <div style={{
        fontSize: 8, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase',
        color: '#00c896', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <div style={{
          width: 6, height: 6, borderRadius: '50%',
          background: '#00ff96',
          boxShadow: '0 0 8px #00ff96',
          animation: 'biomPulse 1.4s ease-in-out infinite',
        }} />
        Biometric Readout
        <div style={{ flex: 1, height: 1, background: 'rgba(0,200,150,0.2)' }} />
      </div>

      <canvas
        ref={canvasRef}
        width={230}
        height={36}
        style={{ width: '100%', height: 36, marginBottom: 8, display: 'block' }}
      />

      <VitalRow label="Projected HP"        value={v.projectedHP}       unit="pts"  color="#4caf50" pct={(v.projectedHP / 190) * 100} />
      <VitalRow label="Stamina Reserve"     value={v.staminaReserve}    unit="pts"  color="#ff9800" pct={(v.staminaReserve / 152) * 100} />
      <VitalRow label="Reaction Index"      value={v.reactionIndex}     unit="ms⁻¹" color="#00bcd4" pct={(parseFloat(v.reactionIndex) / 112) * 100} />
      <VitalRow label="Neural Coherence"    value={v.neuralCoherence}   unit="σ"    color="#9c27b0" pct={(parseFloat(v.neuralCoherence) / 168) * 100} />
      <VitalRow label="Entropic Durability" value={v.entropicDurability} unit="τ"   color="#f44336" pct={(parseFloat(v.entropicDurability) / 120) * 100} />
      <VitalRow label="Gravitic Tolerance"  value={v.graviticTolerance} unit="g"    color="#009688" pct={(parseFloat(v.graviticTolerance) / 108) * 100} />

      <div style={{
        marginTop: 8, paddingTop: 7,
        borderTop: '1px solid rgba(0,200,150,0.12)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: 9, color: '#4a6a7a', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Allocation
        </span>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#00c896', fontFamily: 'monospace' }}>
          {totalStats} / {maxTotal} pts
        </span>
      </div>

      <style>{`
        @keyframes biomPulse {
          0%,100% { opacity: 1; }
          50% { opacity: 0.2; }
        }
      `}</style>
    </div>
  );
};
