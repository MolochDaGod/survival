/**
 * MonsterPortrait — renders a real bestiary portrait for an enemy.
 *
 * Source priority (each falls through to the next on load failure):
 *   1. The explicit `portrait` URL on the entry (preferred — small, hand-art).
 *   2. /bestiary/<enemyKey>.png — convention path for shipped portraits.
 *   3. A monogram tile drawn in CSS using the entry's first letter.
 *
 * IMPORTANT: We deliberately **do NOT** fall back to /models/enemies/<key>/
 * texture.png as a CSS background. Those files are the model's full diffuse
 * UV atlas and routinely weigh 1–3 MB each. Decoding six of them on the main
 * thread (one per bestiary entry) when the book is opened can stall the
 * renderer for hundreds of ms and look like a freeze. Always ship a
 * dedicated portrait or fall through to the cheap CSS monogram instead.
 *
 * All <img> elements use `decoding="async"` and `loading="lazy"` so
 * decode work happens off the critical path even when portraits are large.
 */

import { useState } from 'react';
import { assetUrl } from '../../lib/assetUrl';

interface PortraitCrop {
  /** % from left of the source texture. 0..100 */
  x?: number;
  /** % from top of the source texture. 0..100 */
  y?: number;
  /** Zoom (CSS background-size as %). 100 = fit, 200 = 2× zoom. */
  zoom?: number;
}

interface Props {
  enemyKey: string;
  /** Display name — used as the monogram fallback. */
  name: string;
  /** Optional explicit portrait override (full URL). Skips probe entirely. */
  portrait?: string;
  /** Reserved for future texture-atlas crop overrides. Currently unused. */
  crop?: PortraitCrop;
  /** Color to tint the monogram fallback (used as background). */
  fallbackColor?: string;
  /** Pixel size — defaults to 100% of the parent. */
  size?: number;
}

type Stage = 'explicit' | 'bestiary' | 'monogram';

export function MonsterPortrait({ enemyKey, name, portrait, fallbackColor = '#3a1f10', size }: Props) {
  // We start at the most specific source the caller gave us and demote on
  // each error. Once we hit `monogram`, we render the cheap CSS tile and
  // never re-attempt — this keeps load failures from looping.
  const [stage, setStage] = useState<Stage>(portrait ? 'explicit' : 'bestiary');

  if (stage === 'monogram') {
    const initial = name.trim()[0]?.toUpperCase() ?? '?';
    return (
      <div
        className="monster-portrait"
        style={{
          width: size ?? '100%',
          height: size ?? '100%',
          background: `linear-gradient(140deg, ${fallbackColor}cc 0%, #1a0f08 100%)`,
          color: '#fbe9b8',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Cinzel, serif',
          fontWeight: 700,
          fontSize: 'clamp(28px, 28%, 64px)',
          letterSpacing: 4,
          textShadow: '0 2px 6px rgba(0,0,0,0.8)',
        }}
        aria-label={name}
      >
        {initial}
      </div>
    );
  }

  const raw = stage === 'explicit' && portrait ? portrait : `/bestiary/${enemyKey}.png`;
  const url = assetUrl(raw);
  return (
    <img
      className="monster-portrait"
      src={url}
      alt={name}
      decoding="async"
      loading="lazy"
      style={{
        width: size ?? '100%',
        height: size ?? '100%',
        objectFit: 'cover',
        objectPosition: 'center top',
      }}
      onError={() => setStage(stage === 'explicit' ? 'bestiary' : 'monogram')}
    />
  );
}
