import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '../public/icons/perks/stat-tiers');

mkdirSync(OUT_DIR, { recursive: true });

const STATS = {
  bio: { color: '#4caf50', glow: '#81c784', dark: '#1b2e1c', perks: [
    { name: 'iron-constitution',     shape: 'drop',       label: 'I'  },
    { name: 'cellular-regen',        shape: 'cycle',      label: 'II' },
    { name: 'augment-compat',        shape: 'hex-bolt',   label: 'III'},
    { name: 'nanoflesh-matrix',      shape: 'dna',        label: 'IV' },
    { name: 'apex-physiology',       shape: 'fist',       label: 'V'  },
    { name: 'undying-protocol',      shape: 'skull',      label: 'VI' },
  ]},
  neu: { color: '#00bcd4', glow: '#4dd0e1', dark: '#0d2126', perks: [
    { name: 'signal-clarity',        shape: 'signal',     label: 'I'  },
    { name: 'neural-firewall',       shape: 'firewall',   label: 'II' },
    { name: 'deep-focus',            shape: 'crosshair',  label: 'III'},
    { name: 'synaptic-overdrive',    shape: 'synapse',    label: 'IV' },
    { name: 'transcendent-logic',    shape: 'globe',      label: 'V'  },
    { name: 'enlightened-arch',      shape: 'neural',     label: 'VI' },
  ]},
  kin: { color: '#ff9800', glow: '#ffb74d', dark: '#261b0d', perks: [
    { name: 'fleet-footed',          shape: 'speed',      label: 'I'  },
    { name: 'combat-cadence',        shape: 'sword',      label: 'II' },
    { name: 'zero-g-trained',        shape: 'rocket',     label: 'III'},
    { name: 'kinetic-amplifier',     shape: 'burst',      label: 'IV' },
    { name: 'apex-predator',         shape: 'claw',       label: 'V'  },
    { name: 'unstoppable-force',     shape: 'tornado',    label: 'VI' },
  ]},
  qnt: { color: '#9c27b0', glow: '#ce93d8', dark: '#1a0d22', perks: [
    { name: 'tech-intuition',        shape: 'telescope',  label: 'I'  },
    { name: 'probability-sense',     shape: 'dice',       label: 'II' },
    { name: 'field-theorist',        shape: 'flask',      label: 'III'},
    { name: 'phase-manipulator',     shape: 'vortex',     label: 'IV' },
    { name: 'reality-weaver',        shape: 'web',        label: 'V'  },
    { name: 'quantum-sovereign',     shape: 'hourglass',  label: 'VI' },
  ]},
  syn: { color: '#2196f3', glow: '#64b5f6', dark: '#0d1a26', perks: [
    { name: 'network-aware',         shape: 'wifi',       label: 'I'  },
    { name: 'ghost-protocol',        shape: 'ghost',      label: 'II' },
    { name: 'swarm-link',            shape: 'swarm',      label: 'III'},
    { name: 'neural-mesh',           shape: 'circuit',    label: 'IV' },
    { name: 'hive-mind',             shape: 'hive',       label: 'V'  },
    { name: 'synthetic-ascension',   shape: 'crystal',    label: 'VI' },
  ]},
  chr: { color: '#ffeb3b', glow: '#fff176', dark: '#262200', perks: [
    { name: 'temporal-grounding',    shape: 'clock',      label: 'I'  },
    { name: 'echo-perception',       shape: 'eye-future', label: 'II' },
    { name: 'phase-anchor',          shape: 'anchor',     label: 'III'},
    { name: 'paradox-engine',        shape: 'prism',      label: 'IV' },
    { name: 'timeline-bender',       shape: 'wave',       label: 'V'  },
    { name: 'eternal-observer',      shape: 'infinity',   label: 'VI' },
  ]},
  ent: { color: '#f44336', glow: '#ef9a9a', dark: '#261010', perks: [
    { name: 'hardy-materials',       shape: 'rock',       label: 'I'  },
    { name: 'decay-shield',          shape: 'shield',     label: 'II' },
    { name: 'reclamation-expert',    shape: 'recycle',    label: 'III'},
    { name: 'entropy-sink',          shape: 'drain',      label: 'IV' },
    { name: 'void-preservation',     shape: 'jar',        label: 'V'  },
    { name: 'eternal-engine',        shape: 'gear',       label: 'VI' },
  ]},
  gra: { color: '#009688', glow: '#4db6ac', dark: '#0d2220', perks: [
    { name: 'light-footed',          shape: 'feather',    label: 'I'  },
    { name: 'grav-adapted',          shape: 'moon',       label: 'II' },
    { name: 'force-sense',           shape: 'grav-ring',  label: 'III'},
    { name: 'orbital-mastery',       shape: 'orbit',      label: 'IV' },
    { name: 'graviton-weave',        shape: 'galaxy',     label: 'V'  },
    { name: 'event-horizon',         shape: 'singularity',label: 'VI' },
  ]},
};

function tierDots(tier, color, glow) {
  const count = tier + 1;
  const spacing = 8;
  const total = (count - 1) * spacing;
  const startX = 40 - total / 2;
  let dots = '';
  for (let i = 0; i < count; i++) {
    const cx = startX + i * spacing;
    const isLast = i === count - 1;
    dots += `<circle cx="${cx}" cy="71" r="${isLast ? 2.2 : 1.6}" fill="${isLast ? glow : color}" opacity="${isLast ? 1 : 0.5}"/>`;
  }
  return dots;
}

function tierCorners(color, opacity = 0.6) {
  const c = color;
  const o = opacity;
  return `
    <line x1="4" y1="4" x2="12" y2="4" stroke="${c}" stroke-width="1.5" opacity="${o}"/>
    <line x1="4" y1="4" x2="4" y2="12" stroke="${c}" stroke-width="1.5" opacity="${o}"/>
    <line x1="76" y1="4" x2="68" y2="4" stroke="${c}" stroke-width="1.5" opacity="${o}"/>
    <line x1="76" y1="4" x2="76" y2="12" stroke="${c}" stroke-width="1.5" opacity="${o}"/>
    <line x1="4" y1="76" x2="12" y2="76" stroke="${c}" stroke-width="1.5" opacity="${o}"/>
    <line x1="4" y1="76" x2="4" y2="68" stroke="${c}" stroke-width="1.5" opacity="${o}"/>
    <line x1="76" y1="76" x2="68" y2="76" stroke="${c}" stroke-width="1.5" opacity="${o}"/>
    <line x1="76" y1="76" x2="76" y2="68" stroke="${c}" stroke-width="1.5" opacity="${o}"/>
  `;
}

const SHAPE_DEFS = {
  drop: (c, g) => `
    <ellipse cx="40" cy="42" rx="10" ry="6" fill="${c}" opacity="0.18"/>
    <path d="M40 20 Q48 30 48 38 A8 8 0 1 1 32 38 Q32 30 40 20Z" fill="${c}" opacity="0.85"/>
    <path d="M40 24 Q46 32 46 38 A6 6 0 1 1 34 38 Q34 32 40 24Z" fill="${g}" opacity="0.35"/>
    <line x1="40" y1="42" x2="40" y2="50" stroke="${c}" stroke-width="1" opacity="0.4"/>
  `,
  cycle: (c, g) => `
    <circle cx="40" cy="38" r="14" fill="none" stroke="${c}" stroke-width="2.5" opacity="0.7" stroke-dasharray="22 10"/>
    <circle cx="40" cy="38" r="8" fill="${c}" opacity="0.2"/>
    <circle cx="40" cy="38" r="4" fill="${g}" opacity="0.9"/>
    <path d="M40 24 L42 20 L44 24Z" fill="${g}" opacity="0.9"/>
    <path d="M40 52 L38 56 L36 52Z" fill="${c}" opacity="0.7"/>
  `,
  'hex-bolt': (c, g) => `
    <polygon points="40,22 52,29 52,43 40,50 28,43 28,29" fill="${c}" opacity="0.18" stroke="${c}" stroke-width="1.5"/>
    <polygon points="40,26 49,31 49,41 40,46 31,41 31,31" fill="${c}" opacity="0.1"/>
    <path d="M43 29 L37 38 L42 38 L37 47 L45 36 L40 36 L43 29Z" fill="${g}" opacity="0.95"/>
  `,
  dna: (c, g) => `
    <path d="M34 20 Q46 26 34 32 Q22 38 34 44 Q46 50 34 56" fill="none" stroke="${c}" stroke-width="2" opacity="0.8"/>
    <path d="M46 20 Q34 26 46 32 Q58 38 46 44 Q34 50 46 56" fill="none" stroke="${g}" stroke-width="2" opacity="0.8"/>
    <line x1="34" y1="26" x2="46" y2="26" stroke="${c}" stroke-width="1.2" opacity="0.6"/>
    <line x1="34" y1="32" x2="46" y2="32" stroke="${g}" stroke-width="1.2" opacity="0.6"/>
    <line x1="34" y1="38" x2="46" y2="38" stroke="${c}" stroke-width="1.2" opacity="0.6"/>
    <line x1="34" y1="44" x2="46" y2="44" stroke="${g}" stroke-width="1.2" opacity="0.6"/>
    <line x1="34" y1="50" x2="46" y2="50" stroke="${c}" stroke-width="1.2" opacity="0.6"/>
  `,
  fist: (c, g) => `
    <rect x="30" y="32" width="20" height="16" rx="4" fill="${c}" opacity="0.8"/>
    <rect x="30" y="26" width="5" height="10" rx="2" fill="${c}" opacity="0.7"/>
    <rect x="36" y="24" width="5" height="10" rx="2" fill="${c}" opacity="0.75"/>
    <rect x="42" y="25" width="5" height="10" rx="2" fill="${c}" opacity="0.7"/>
    <rect x="47" y="27" width="4" height="9" rx="2" fill="${c}" opacity="0.65"/>
    <rect x="26" y="33" width="6" height="8" rx="2" fill="${g}" opacity="0.8"/>
    <rect x="30" y="32" width="20" height="6" rx="2" fill="${g}" opacity="0.25"/>
  `,
  skull: (c, g) => `
    <ellipse cx="40" cy="34" rx="14" ry="13" fill="${c}" opacity="0.75"/>
    <rect x="33" y="44" width="14" height="8" rx="2" fill="${c}" opacity="0.6"/>
    <circle cx="34" cy="32" r="4" fill="black" opacity="0.7"/>
    <circle cx="46" cy="32" r="4" fill="black" opacity="0.7"/>
    <line x1="37" y1="48" x2="37" y2="52" stroke="black" stroke-width="2" opacity="0.5"/>
    <line x1="40" y1="46" x2="40" y2="52" stroke="black" stroke-width="2" opacity="0.5"/>
    <line x1="43" y1="48" x2="43" y2="52" stroke="black" stroke-width="2" opacity="0.5"/>
    <path d="M30 40 Q40 44 50 40" fill="none" stroke="${g}" stroke-width="1" opacity="0.4"/>
  `,
  signal: (c, g) => `
    <circle cx="40" cy="42" r="3" fill="${g}" opacity="0.95"/>
    <path d="M33 35 Q40 28 47 35" fill="none" stroke="${c}" stroke-width="2" opacity="0.7"/>
    <path d="M28 30 Q40 20 52 30" fill="none" stroke="${c}" stroke-width="2" opacity="0.5"/>
    <path d="M23 25 Q40 12 57 25" fill="none" stroke="${c}" stroke-width="1.5" opacity="0.3"/>
    <line x1="40" y1="42" x2="40" y2="55" stroke="${c}" stroke-width="2" opacity="0.6"/>
    <line x1="33" y1="55" x2="47" y2="55" stroke="${c}" stroke-width="1.5" opacity="0.5"/>
  `,
  firewall: (c, g) => `
    <rect x="24" y="24" width="32" height="6" rx="1" fill="${c}" opacity="0.6"/>
    <rect x="24" y="32" width="32" height="6" rx="1" fill="${c}" opacity="0.45"/>
    <rect x="24" y="40" width="32" height="6" rx="1" fill="${c}" opacity="0.3"/>
    <rect x="22" y="22" width="36" height="32" rx="2" fill="none" stroke="${g}" stroke-width="1.5" opacity="0.7"/>
    <path d="M38 18 L42 18 L40 22Z" fill="${g}" opacity="0.8"/>
    <path d="M34 18 L38 22 M42 18 L46 22" stroke="${c}" stroke-width="1" opacity="0.5"/>
  `,
  crosshair: (c, g) => `
    <circle cx="40" cy="38" r="14" fill="none" stroke="${c}" stroke-width="1.5" opacity="0.5"/>
    <circle cx="40" cy="38" r="8" fill="none" stroke="${c}" stroke-width="1.2" opacity="0.6"/>
    <circle cx="40" cy="38" r="3" fill="${g}" opacity="0.95"/>
    <line x1="24" y1="38" x2="32" y2="38" stroke="${c}" stroke-width="1.5" opacity="0.7"/>
    <line x1="48" y1="38" x2="56" y2="38" stroke="${c}" stroke-width="1.5" opacity="0.7"/>
    <line x1="40" y1="22" x2="40" y2="30" stroke="${c}" stroke-width="1.5" opacity="0.7"/>
    <line x1="40" y1="46" x2="40" y2="54" stroke="${c}" stroke-width="1.5" opacity="0.7"/>
  `,
  synapse: (c, g) => `
    <circle cx="40" cy="38" r="6" fill="${c}" opacity="0.8"/>
    <circle cx="26" cy="28" r="4" fill="${c}" opacity="0.6"/>
    <circle cx="54" cy="28" r="4" fill="${c}" opacity="0.6"/>
    <circle cx="26" cy="48" r="4" fill="${c}" opacity="0.5"/>
    <circle cx="54" cy="48" r="4" fill="${c}" opacity="0.5"/>
    <line x1="34" y1="36" x2="30" y2="30" stroke="${g}" stroke-width="1.5" opacity="0.7"/>
    <line x1="46" y1="36" x2="50" y2="30" stroke="${g}" stroke-width="1.5" opacity="0.7"/>
    <line x1="34" y1="40" x2="30" y2="46" stroke="${g}" stroke-width="1.5" opacity="0.7"/>
    <line x1="46" y1="40" x2="50" y2="46" stroke="${g}" stroke-width="1.5" opacity="0.7"/>
    <path d="M38 30 L42 26 L44 30 L40 28Z" fill="${g}" opacity="0.9"/>
  `,
  globe: (c, g) => `
    <circle cx="40" cy="38" r="16" fill="none" stroke="${c}" stroke-width="1.5" opacity="0.6"/>
    <ellipse cx="40" cy="38" rx="8" ry="16" fill="none" stroke="${c}" stroke-width="1" opacity="0.4"/>
    <line x1="24" y1="38" x2="56" y2="38" stroke="${c}" stroke-width="1" opacity="0.4"/>
    <line x1="26" y1="30" x2="54" y2="30" stroke="${c}" stroke-width="1" opacity="0.3"/>
    <line x1="26" y1="46" x2="54" y2="46" stroke="${c}" stroke-width="1" opacity="0.3"/>
    <circle cx="40" cy="38" r="4" fill="${g}" opacity="0.7"/>
  `,
  neural: (c, g) => `
    <ellipse cx="40" cy="36" rx="14" ry="12" fill="${c}" opacity="0.2"/>
    <path d="M40 24 Q32 28 30 36 Q32 44 40 48 Q48 44 50 36 Q48 28 40 24Z" fill="${c}" opacity="0.5"/>
    <path d="M34 30 Q36 34 40 34 Q44 34 46 30" fill="none" stroke="${g}" stroke-width="1.2" opacity="0.6"/>
    <path d="M34 42 Q36 38 40 38 Q44 38 46 42" fill="none" stroke="${g}" stroke-width="1.2" opacity="0.6"/>
    <circle cx="40" cy="36" r="4" fill="${g}" opacity="0.9"/>
    <line x1="40" y1="24" x2="40" y2="20" stroke="${c}" stroke-width="1.5" opacity="0.5"/>
    <line x1="40" y1="48" x2="40" y2="52" stroke="${c}" stroke-width="1.5" opacity="0.5"/>
  `,
  speed: (c, g) => `
    <path d="M20 40 L34 34 L28 38 L50 30 L38 40 L55 36 L36 48Z" fill="${c}" opacity="0.7"/>
    <path d="M20 40 L34 34 L28 38 L50 30 L38 40 L55 36 L36 48Z" fill="${g}" opacity="0.3"/>
    <line x1="22" y1="44" x2="34" y2="44" stroke="${c}" stroke-width="1.2" opacity="0.4"/>
    <line x1="18" y1="48" x2="30" y2="48" stroke="${c}" stroke-width="1" opacity="0.3"/>
  `,
  sword: (c, g) => `
    <path d="M40 18 L43 44 L40 48 L37 44Z" fill="${c}" opacity="0.85"/>
    <path d="M40 18 L41.5 44 L40 48 L38.5 44Z" fill="${g}" opacity="0.5"/>
    <line x1="32" y1="40" x2="48" y2="40" stroke="${c}" stroke-width="2.5" opacity="0.7"/>
    <circle cx="40" cy="48" r="3" fill="${c}" opacity="0.6"/>
    <line x1="40" y1="51" x2="40" y2="57" stroke="${c}" stroke-width="2" opacity="0.5"/>
  `,
  rocket: (c, g) => `
    <path d="M40 18 Q46 24 46 36 L46 48 L40 52 L34 48 L34 36 Q34 24 40 18Z" fill="${c}" opacity="0.75"/>
    <path d="M40 20 Q44 26 44 36 L40 38Z" fill="${g}" opacity="0.4"/>
    <ellipse cx="40" cy="42" rx="6" ry="4" fill="none" stroke="${c}" stroke-width="1" opacity="0.4"/>
    <path d="M34 44 Q30 50 32 54 L38 50" fill="${c}" opacity="0.5"/>
    <path d="M46 44 Q50 50 48 54 L42 50" fill="${c}" opacity="0.5"/>
    <path d="M37 50 Q40 56 43 50" fill="${g}" opacity="0.8"/>
  `,
  burst: (c, g) => `
    <circle cx="40" cy="38" r="5" fill="${g}" opacity="0.9"/>
    <path d="M40 20 L41 33 L40 33Z" fill="${c}" opacity="0.7"/>
    <path d="M40 56 L39 43 L40 43Z" fill="${c}" opacity="0.7"/>
    <path d="M22 38 L35 39 L35 38Z" fill="${c}" opacity="0.7"/>
    <path d="M58 38 L45 37 L45 38Z" fill="${c}" opacity="0.7"/>
    <path d="M26 24 L35 34" stroke="${c}" stroke-width="2" opacity="0.6"/>
    <path d="M54 52 L45 42" stroke="${c}" stroke-width="2" opacity="0.6"/>
    <path d="M54 24 L45 34" stroke="${c}" stroke-width="2" opacity="0.6"/>
    <path d="M26 52 L35 42" stroke="${c}" stroke-width="2" opacity="0.6"/>
    <circle cx="40" cy="38" r="12" fill="none" stroke="${c}" stroke-width="1" opacity="0.25"/>
  `,
  claw: (c, g) => `
    <path d="M32 20 Q28 32 34 42" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round" opacity="0.85"/>
    <path d="M40 18 Q40 32 40 44" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round" opacity="0.85"/>
    <path d="M48 20 Q52 32 46 42" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round" opacity="0.85"/>
    <path d="M30 42 Q34 52 32 58" fill="none" stroke="${g}" stroke-width="2" stroke-linecap="round" opacity="0.7"/>
    <path d="M40 44 L40 58" fill="none" stroke="${g}" stroke-width="2" stroke-linecap="round" opacity="0.7"/>
    <path d="M50 42 Q46 52 48 58" fill="none" stroke="${g}" stroke-width="2" stroke-linecap="round" opacity="0.7"/>
  `,
  tornado: (c, g) => `
    <ellipse cx="40" cy="24" rx="14" ry="5" fill="${c}" opacity="0.4"/>
    <ellipse cx="40" cy="24" rx="14" ry="5" fill="none" stroke="${c}" stroke-width="1.5" opacity="0.7"/>
    <path d="M26 24 Q32 36 36 48 L44 48 Q48 36 54 24" fill="${c}" opacity="0.2"/>
    <path d="M28 30 L52 30" stroke="${c}" stroke-width="1" opacity="0.3"/>
    <path d="M31 36 L49 36" stroke="${c}" stroke-width="1" opacity="0.3"/>
    <path d="M34 42 L46 42" stroke="${c}" stroke-width="1" opacity="0.3"/>
    <ellipse cx="40" cy="48" rx="5" ry="2" fill="${g}" opacity="0.7"/>
  `,
  telescope: (c, g) => `
    <rect x="24" y="34" width="28" height="8" rx="3" fill="${c}" opacity="0.6"/>
    <rect x="26" y="30" width="6" height="16" rx="2" fill="${c}" opacity="0.5"/>
    <circle cx="52" cy="38" r="8" fill="none" stroke="${g}" stroke-width="2" opacity="0.8"/>
    <circle cx="52" cy="38" r="4" fill="${g}" opacity="0.3"/>
    <circle cx="52" cy="38" r="2" fill="${g}" opacity="0.8"/>
    <line x1="24" y1="42" x2="20" y2="52" stroke="${c}" stroke-width="2" opacity="0.5"/>
  `,
  dice: (c, g) => `
    <rect x="26" y="26" width="28" height="28" rx="5" fill="${c}" opacity="0.35" stroke="${c}" stroke-width="1.5"/>
    <circle cx="34" cy="34" r="2.5" fill="${g}" opacity="0.9"/>
    <circle cx="46" cy="34" r="2.5" fill="${g}" opacity="0.9"/>
    <circle cx="34" cy="46" r="2.5" fill="${g}" opacity="0.9"/>
    <circle cx="46" cy="46" r="2.5" fill="${g}" opacity="0.9"/>
    <circle cx="40" cy="40" r="2.5" fill="${g}" opacity="0.9"/>
  `,
  flask: (c, g) => `
    <path d="M35 20 L35 34 L24 52 Q22 58 26 60 L54 60 Q58 58 56 52 L45 34 L45 20Z" fill="${c}" opacity="0.35" stroke="${c}" stroke-width="1.5"/>
    <path d="M35 20 L45 20" stroke="${c}" stroke-width="2" opacity="0.7"/>
    <path d="M26 50 L54 50" stroke="${c}" stroke-width="1" opacity="0.4"/>
    <circle cx="35" cy="52" r="2" fill="${g}" opacity="0.8"/>
    <circle cx="44" cy="56" r="1.5" fill="${g}" opacity="0.7"/>
    <circle cx="38" cy="57" r="1.2" fill="${g}" opacity="0.6"/>
  `,
  vortex: (c, g) => `
    <circle cx="40" cy="38" r="14" fill="none" stroke="${c}" stroke-width="1.5" opacity="0.4" stroke-dasharray="8 4"/>
    <circle cx="40" cy="38" r="9" fill="none" stroke="${c}" stroke-width="1.5" opacity="0.5" stroke-dasharray="6 3"/>
    <circle cx="40" cy="38" r="5" fill="none" stroke="${g}" stroke-width="1.5" opacity="0.7" stroke-dasharray="4 2"/>
    <circle cx="40" cy="38" r="2" fill="${g}" opacity="0.95"/>
    <path d="M40 24 Q54 32 52 46 Q46 56 32 52 Q22 44 26 30 Q32 20 46 22" fill="none" stroke="${c}" stroke-width="1.5" opacity="0.5"/>
  `,
  web: (c, g) => `
    <line x1="40" y1="22" x2="40" y2="54" stroke="${c}" stroke-width="1" opacity="0.5"/>
    <line x1="22" y1="38" x2="58" y2="38" stroke="${c}" stroke-width="1" opacity="0.5"/>
    <line x1="26" y1="24" x2="54" y2="52" stroke="${c}" stroke-width="1" opacity="0.4"/>
    <line x1="54" y1="24" x2="26" y2="52" stroke="${c}" stroke-width="1" opacity="0.4"/>
    <circle cx="40" cy="38" r="6" fill="none" stroke="${c}" stroke-width="1.2" opacity="0.6"/>
    <circle cx="40" cy="38" r="12" fill="none" stroke="${c}" stroke-width="1" opacity="0.4"/>
    <circle cx="40" cy="38" r="3" fill="${g}" opacity="0.9"/>
  `,
  hourglass: (c, g) => `
    <path d="M28 20 L52 20 L40 38 L52 56 L28 56 L40 38Z" fill="${c}" opacity="0.35" stroke="${c}" stroke-width="1.5"/>
    <path d="M28 20 L52 20 L40 36Z" fill="${c}" opacity="0.5"/>
    <path d="M40 40 L28 56 L52 56Z" fill="${g}" opacity="0.4"/>
    <line x1="26" y1="20" x2="54" y2="20" stroke="${g}" stroke-width="2" opacity="0.7"/>
    <line x1="26" y1="56" x2="54" y2="56" stroke="${g}" stroke-width="2" opacity="0.7"/>
    <circle cx="40" cy="38" r="2" fill="${g}" opacity="0.9"/>
  `,
  wifi: (c, g) => `
    <circle cx="40" cy="50" r="3.5" fill="${g}" opacity="0.95"/>
    <path d="M32 42 Q40 34 48 42" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" opacity="0.8"/>
    <path d="M26 36 Q40 24 54 36" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" opacity="0.6"/>
    <path d="M20 30 Q40 14 60 30" fill="none" stroke="${c}" stroke-width="1.5" stroke-linecap="round" opacity="0.4"/>
    <line x1="40" y1="50" x2="40" y2="57" stroke="${c}" stroke-width="1.5" opacity="0.5"/>
    <line x1="35" y1="57" x2="45" y2="57" stroke="${c}" stroke-width="1.5" opacity="0.4"/>
  `,
  ghost: (c, g) => `
    <path d="M28 38 Q28 22 40 22 Q52 22 52 38 L52 56 L47 52 L42 56 L40 54 L38 56 L33 52 L28 56Z" fill="${c}" opacity="0.5"/>
    <path d="M28 38 Q28 22 40 22 Q52 22 52 38 L52 50 L47 46 L42 50 L40 48 L38 50 L33 46 L28 50Z" fill="${c}" opacity="0.3"/>
    <circle cx="35" cy="36" r="3" fill="${g}" opacity="0.8"/>
    <circle cx="45" cy="36" r="3" fill="${g}" opacity="0.8"/>
    <circle cx="35" cy="36" r="1.5" fill="black" opacity="0.7"/>
    <circle cx="45" cy="36" r="1.5" fill="black" opacity="0.7"/>
  `,
  swarm: (c, g) => `
    <circle cx="40" cy="38" r="5" fill="${c}" opacity="0.6"/>
    <circle cx="28" cy="30" r="3.5" fill="${c}" opacity="0.7"/>
    <circle cx="52" cy="30" r="3.5" fill="${c}" opacity="0.7"/>
    <circle cx="28" cy="46" r="3.5" fill="${c}" opacity="0.65"/>
    <circle cx="52" cy="46" r="3.5" fill="${c}" opacity="0.65"/>
    <circle cx="40" cy="24" r="3" fill="${g}" opacity="0.8"/>
    <circle cx="40" cy="52" r="3" fill="${g}" opacity="0.8"/>
    <line x1="34" y1="36" x2="31" y2="32" stroke="${c}" stroke-width="1" opacity="0.4"/>
    <line x1="46" y1="36" x2="49" y2="32" stroke="${c}" stroke-width="1" opacity="0.4"/>
    <line x1="34" y1="40" x2="31" y2="44" stroke="${c}" stroke-width="1" opacity="0.4"/>
    <line x1="46" y1="40" x2="49" y2="44" stroke="${c}" stroke-width="1" opacity="0.4"/>
  `,
  circuit: (c, g) => `
    <rect x="30" y="30" width="20" height="16" rx="2" fill="${c}" opacity="0.25" stroke="${c}" stroke-width="1"/>
    <line x1="22" y1="34" x2="30" y2="34" stroke="${c}" stroke-width="1.5" opacity="0.6"/>
    <line x1="22" y1="42" x2="30" y2="42" stroke="${c}" stroke-width="1.5" opacity="0.6"/>
    <line x1="50" y1="34" x2="58" y2="34" stroke="${c}" stroke-width="1.5" opacity="0.6"/>
    <line x1="50" y1="42" x2="58" y2="42" stroke="${c}" stroke-width="1.5" opacity="0.6"/>
    <line x1="36" y1="22" x2="36" y2="30" stroke="${c}" stroke-width="1.5" opacity="0.5"/>
    <line x1="44" y1="22" x2="44" y2="30" stroke="${c}" stroke-width="1.5" opacity="0.5"/>
    <line x1="36" y1="46" x2="36" y2="54" stroke="${c}" stroke-width="1.5" opacity="0.5"/>
    <line x1="44" y1="46" x2="44" y2="54" stroke="${c}" stroke-width="1.5" opacity="0.5"/>
    <circle cx="40" cy="38" r="4" fill="${g}" opacity="0.8"/>
  `,
  hive: (c, g) => `
    <polygon points="40,22 47,26 47,34 40,38 33,34 33,26" fill="${c}" opacity="0.5" stroke="${c}" stroke-width="1"/>
    <polygon points="47,34 54,38 54,46 47,50 40,46 40,38" fill="${c}" opacity="0.4" stroke="${c}" stroke-width="1"/>
    <polygon points="33,34 40,38 40,46 33,50 26,46 26,38" fill="${c}" opacity="0.35" stroke="${c}" stroke-width="1"/>
    <circle cx="40" cy="30" r="3" fill="${g}" opacity="0.9"/>
    <circle cx="47" cy="42" r="2.5" fill="${g}" opacity="0.7"/>
    <circle cx="33" cy="42" r="2.5" fill="${g}" opacity="0.7"/>
  `,
  crystal: (c, g) => `
    <polygon points="40,18 50,32 46,52 34,52 30,32" fill="${c}" opacity="0.35" stroke="${c}" stroke-width="1.5"/>
    <polygon points="40,22 48,34 44,50 36,50 32,34" fill="${g}" opacity="0.12"/>
    <line x1="40" y1="22" x2="36" y2="50" stroke="${g}" stroke-width="1" opacity="0.4"/>
    <line x1="40" y1="22" x2="44" y2="50" stroke="${g}" stroke-width="1" opacity="0.4"/>
    <line x1="32" y1="34" x2="48" y2="34" stroke="${g}" stroke-width="1" opacity="0.4"/>
    <circle cx="40" cy="30" r="3" fill="${g}" opacity="0.9"/>
  `,
  clock: (c, g) => `
    <circle cx="40" cy="38" r="16" fill="${c}" opacity="0.15" stroke="${c}" stroke-width="2"/>
    <circle cx="40" cy="38" r="2" fill="${g}" opacity="0.9"/>
    <line x1="40" y1="38" x2="40" y2="26" stroke="${g}" stroke-width="2" stroke-linecap="round"/>
    <line x1="40" y1="38" x2="50" y2="42" stroke="${c}" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="40" y1="22" x2="40" y2="24" stroke="${c}" stroke-width="2" opacity="0.5"/>
    <line x1="40" y1="52" x2="40" y2="54" stroke="${c}" stroke-width="2" opacity="0.5"/>
    <line x1="24" y1="38" x2="26" y2="38" stroke="${c}" stroke-width="2" opacity="0.5"/>
    <line x1="54" y1="38" x2="56" y2="38" stroke="${c}" stroke-width="2" opacity="0.5"/>
  `,
  'eye-future': (c, g) => `
    <path d="M22 38 Q31 24 40 24 Q49 24 58 38 Q49 52 40 52 Q31 52 22 38Z" fill="${c}" opacity="0.2" stroke="${c}" stroke-width="1.5"/>
    <circle cx="40" cy="38" r="7" fill="${c}" opacity="0.4"/>
    <circle cx="40" cy="38" r="4" fill="${g}" opacity="0.85"/>
    <circle cx="40" cy="38" r="2" fill="black" opacity="0.7"/>
    <path d="M44 24 L50 18 L56 20 L54 26" stroke="${c}" stroke-width="1.2" fill="none" opacity="0.5"/>
    <path d="M50 28 L56 20" stroke="${g}" stroke-width="1" opacity="0.5"/>
  `,
  anchor: (c, g) => `
    <circle cx="40" cy="26" r="5" fill="none" stroke="${c}" stroke-width="2.5"/>
    <line x1="40" y1="31" x2="40" y2="54" stroke="${c}" stroke-width="2.5"/>
    <path d="M28 38 Q28 54 40 54 Q52 54 52 38" fill="none" stroke="${c}" stroke-width="2.5"/>
    <line x1="28" y1="38" x2="36" y2="38" stroke="${c}" stroke-width="2" opacity="0.6"/>
    <line x1="44" y1="38" x2="52" y2="38" stroke="${c}" stroke-width="2" opacity="0.6"/>
    <circle cx="40" cy="26" r="2" fill="${g}" opacity="0.9"/>
  `,
  prism: (c, g) => `
    <path d="M40 18 L58 52 L22 52Z" fill="${c}" opacity="0.3" stroke="${c}" stroke-width="1.5"/>
    <path d="M40 22 L56 52 L24 52Z" fill="${g}" opacity="0.08"/>
    <line x1="40" y1="22" x2="30" y2="52" stroke="${g}" stroke-width="1" opacity="0.5"/>
    <line x1="40" y1="22" x2="40" y2="52" stroke="${g}" stroke-width="1" opacity="0.4"/>
    <path d="M56 52 L70 38" stroke="${c}" stroke-width="1.5" opacity="0.5"/>
    <path d="M52 44 L64 32" stroke="${g}" stroke-width="1.5" opacity="0.4"/>
    <circle cx="40" cy="26" r="2.5" fill="${g}" opacity="0.9"/>
  `,
  wave: (c, g) => `
    <path d="M18 30 Q26 22 34 30 Q42 38 50 30 Q58 22 62 30" fill="none" stroke="${c}" stroke-width="2.5" opacity="0.7"/>
    <path d="M18 40 Q26 32 34 40 Q42 48 50 40 Q58 32 62 40" fill="none" stroke="${g}" stroke-width="2" opacity="0.7"/>
    <path d="M18 50 Q26 42 34 50 Q42 58 50 50 Q58 42 62 50" fill="none" stroke="${c}" stroke-width="1.5" opacity="0.4"/>
    <circle cx="18" cy="40" r="2" fill="${g}" opacity="0.7"/>
    <circle cx="62" cy="40" r="2" fill="${g}" opacity="0.7"/>
  `,
  infinity: (c, g) => `
    <path d="M40 38 Q40 26 30 26 Q20 26 20 38 Q20 50 30 50 Q36 50 40 42 Q44 50 50 50 Q60 50 60 38 Q60 26 50 26 Q40 26 40 38Z" fill="none" stroke="${c}" stroke-width="2.5" opacity="0.8"/>
    <path d="M34 38 Q36 32 40 38 Q44 44 46 38" fill="none" stroke="${g}" stroke-width="1.5" opacity="0.7"/>
    <circle cx="30" cy="38" r="4" fill="${c}" opacity="0.3"/>
    <circle cx="50" cy="38" r="4" fill="${c}" opacity="0.3"/>
    <circle cx="40" cy="38" r="2.5" fill="${g}" opacity="0.9"/>
  `,
  rock: (c, g) => `
    <path d="M30 50 L24 42 L28 30 L38 22 L50 24 L56 34 L52 50Z" fill="${c}" opacity="0.5" stroke="${c}" stroke-width="1.5"/>
    <path d="M32 48 L26 40 L30 30 L38 24 L48 26 L54 36 L50 48Z" fill="${c}" opacity="0.2"/>
    <line x1="38" y1="22" x2="36" y2="32" stroke="${g}" stroke-width="1.2" opacity="0.5"/>
    <line x1="50" y1="24" x2="46" y2="34" stroke="${g}" stroke-width="1.2" opacity="0.4"/>
    <line x1="56" y1="34" x2="50" y2="40" stroke="${g}" stroke-width="1.2" opacity="0.4"/>
  `,
  shield: (c, g) => `
    <path d="M40 20 L56 28 L56 42 Q56 54 40 60 Q24 54 24 42 L24 28Z" fill="${c}" opacity="0.35" stroke="${c}" stroke-width="1.5"/>
    <path d="M40 24 L52 31 L52 42 Q52 51 40 56 Q28 51 28 42 L28 31Z" fill="${c}" opacity="0.15"/>
    <path d="M34 36 L39 42 L50 30" stroke="${g}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>
  `,
  recycle: (c, g) => `
    <path d="M40 20 L46 30 L34 30Z" fill="${c}" opacity="0.8"/>
    <path d="M34 30 L22 50 L34 50 L34 44 L46 44 L46 50 L58 50 L46 30Z" fill="${c}" opacity="0.4"/>
    <path d="M22 50 L34 50 L34 44" fill="${c}" opacity="0.6" stroke="${c}" stroke-width="1"/>
    <path d="M46 44 L46 50 L58 50" fill="${c}" opacity="0.6" stroke="${c}" stroke-width="1"/>
    <circle cx="40" cy="40" r="4" fill="${g}" opacity="0.8"/>
  `,
  drain: (c, g) => `
    <circle cx="40" cy="38" r="14" fill="${c}" opacity="0.15" stroke="${c}" stroke-width="1.5"/>
    <circle cx="40" cy="38" r="9" fill="${c}" opacity="0.12" stroke="${c}" stroke-width="1" stroke-dasharray="6 3"/>
    <circle cx="40" cy="38" r="4" fill="${c}" opacity="0.3"/>
    <path d="M40 24 Q44 28 52 26 Q56 34 52 40" stroke="${c}" stroke-width="1.5" fill="none" opacity="0.5"/>
    <path d="M28 52 Q24 44 28 36" stroke="${c}" stroke-width="1.5" fill="none" opacity="0.4"/>
    <circle cx="40" cy="38" r="2" fill="${g}" opacity="0.9"/>
  `,
  jar: (c, g) => `
    <rect x="30" y="26" width="20" height="28" rx="4" fill="${c}" opacity="0.25" stroke="${c}" stroke-width="1.5"/>
    <rect x="32" y="22" width="16" height="6" rx="2" fill="${c}" opacity="0.5"/>
    <ellipse cx="40" cy="40" rx="8" ry="6" fill="${g}" opacity="0.2"/>
    <path d="M34 36 Q40 42 46 36" fill="none" stroke="${g}" stroke-width="1.5" opacity="0.6"/>
    <path d="M33 42 Q40 48 47 42" fill="none" stroke="${g}" stroke-width="1.2" opacity="0.5"/>
    <circle cx="40" cy="38" r="2.5" fill="${g}" opacity="0.8"/>
  `,
  gear: (c, g) => `
    <circle cx="40" cy="38" r="8" fill="${c}" opacity="0.3" stroke="${c}" stroke-width="1.5"/>
    <circle cx="40" cy="38" r="4" fill="${g}" opacity="0.7"/>
    <rect x="36" y="20" width="8" height="6" rx="2" fill="${c}" opacity="0.7"/>
    <rect x="36" y="50" width="8" height="6" rx="2" fill="${c}" opacity="0.7"/>
    <rect x="20" y="34" width="6" height="8" rx="2" fill="${c}" opacity="0.7"/>
    <rect x="54" y="34" width="6" height="8" rx="2" fill="${c}" opacity="0.7"/>
    <rect x="23" y="23" width="6" height="6" rx="1" transform="rotate(45 26 26)" fill="${c}" opacity="0.6"/>
    <rect x="51" y="23" width="6" height="6" rx="1" transform="rotate(45 54 26)" fill="${c}" opacity="0.6"/>
    <rect x="23" y="49" width="6" height="6" rx="1" transform="rotate(45 26 52)" fill="${c}" opacity="0.6"/>
    <rect x="51" y="49" width="6" height="6" rx="1" transform="rotate(45 54 52)" fill="${c}" opacity="0.6"/>
  `,
  feather: (c, g) => `
    <path d="M40 18 Q54 26 52 42 Q50 54 40 58 Q40 48 36 40 Q34 34 40 18Z" fill="${c}" opacity="0.5"/>
    <path d="M40 18 Q40 32 40 58" stroke="${g}" stroke-width="1.5" fill="none"/>
    <path d="M46 28 Q40 32 34 30" stroke="${c}" stroke-width="1" fill="none" opacity="0.5"/>
    <path d="M50 36 Q40 40 32 36" stroke="${c}" stroke-width="1" fill="none" opacity="0.4"/>
    <path d="M50 44 Q40 48 32 44" stroke="${c}" stroke-width="1" fill="none" opacity="0.3"/>
  `,
  moon: (c, g) => `
    <path d="M40 22 Q30 26 26 36 Q22 46 28 54 Q34 60 44 58 Q34 54 32 44 Q30 32 40 22Z" fill="${c}" opacity="0.7"/>
    <path d="M40 22 Q30 26 26 36 Q22 46 28 54 Q34 60 44 58" fill="${c}" opacity="0.3"/>
    <circle cx="46" cy="30" r="3" fill="${g}" opacity="0.6"/>
    <circle cx="50" cy="42" r="2" fill="${g}" opacity="0.4"/>
    <circle cx="44" cy="22" r="1.5" fill="${g}" opacity="0.5"/>
  `,
  'grav-ring': (c, g) => `
    <circle cx="40" cy="38" r="14" fill="none" stroke="${c}" stroke-width="2" opacity="0.6"/>
    <ellipse cx="40" cy="38" rx="14" ry="5" fill="none" stroke="${g}" stroke-width="1.5" opacity="0.7"/>
    <circle cx="40" cy="38" r="4" fill="${c}" opacity="0.5"/>
    <circle cx="54" cy="38" r="3" fill="${g}" opacity="0.8"/>
    <line x1="40" y1="24" x2="40" y2="32" stroke="${c}" stroke-width="1.5" opacity="0.5"/>
    <line x1="40" y1="44" x2="40" y2="52" stroke="${c}" stroke-width="1.5" opacity="0.5"/>
  `,
  orbit: (c, g) => `
    <circle cx="40" cy="38" r="6" fill="${c}" opacity="0.5"/>
    <circle cx="40" cy="38" r="3" fill="${g}" opacity="0.9"/>
    <ellipse cx="40" cy="38" rx="18" ry="6" fill="none" stroke="${c}" stroke-width="1.5" opacity="0.6" transform="rotate(-30 40 38)"/>
    <ellipse cx="40" cy="38" rx="18" ry="6" fill="none" stroke="${c}" stroke-width="1.5" opacity="0.4" transform="rotate(30 40 38)"/>
    <circle cx="56" cy="33" r="3" fill="${g}" opacity="0.8"/>
    <circle cx="24" cy="43" r="2.5" fill="${c}" opacity="0.6"/>
  `,
  galaxy: (c, g) => `
    <path d="M40 38 Q46 28 56 26 Q58 32 52 38 Q46 44 50 52 Q42 52 38 46 Q32 48 26 42 Q28 34 36 32 Q40 30 40 38Z" fill="${c}" opacity="0.35"/>
    <circle cx="40" cy="38" r="4" fill="${g}" opacity="0.8"/>
    <circle cx="52" cy="28" r="2" fill="${g}" opacity="0.5"/>
    <circle cx="28" cy="42" r="1.5" fill="${g}" opacity="0.4"/>
    <circle cx="50" cy="50" r="1.5" fill="${c}" opacity="0.5"/>
    <circle cx="40" cy="38" r="14" fill="none" stroke="${c}" stroke-width="0.8" opacity="0.3" stroke-dasharray="4 4"/>
  `,
  singularity: (c, g) => `
    <circle cx="40" cy="38" r="6" fill="black" opacity="0.9"/>
    <circle cx="40" cy="38" r="9" fill="none" stroke="${g}" stroke-width="2" opacity="0.8"/>
    <circle cx="40" cy="38" r="13" fill="none" stroke="${c}" stroke-width="1.5" opacity="0.6"/>
    <circle cx="40" cy="38" r="17" fill="none" stroke="${c}" stroke-width="1" opacity="0.3"/>
    <path d="M40 21 Q44 30 40 38 Q36 30 40 21" fill="${c}" opacity="0.5"/>
    <path d="M57 38 Q48 42 40 38 Q48 34 57 38" fill="${c}" opacity="0.5"/>
  `,
};

function makeSvg(statKey, tier, stat, perk) {
  const { color: c, glow: g, dark } = stat;
  const shapeFn = SHAPE_DEFS[perk.shape];
  const shapeContent = shapeFn ? shapeFn(c, g) : `<circle cx="40" cy="38" r="12" fill="${c}" opacity="0.5"/>`;
  const dots = tierDots(tier, c, g);
  const corners = tierCorners(c, 0.5 + tier * 0.08);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="80" height="80">
  <defs>
    <radialGradient id="bg${statKey}${tier}" cx="50%" cy="45%" r="60%">
      <stop offset="0%" stop-color="${c}" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="${dark}" stop-opacity="1"/>
    </radialGradient>
    <radialGradient id="glow${statKey}${tier}" cx="50%" cy="45%" r="40%">
      <stop offset="0%" stop-color="${g}" stop-opacity="${0.06 + tier * 0.02}"/>
      <stop offset="100%" stop-color="${g}" stop-opacity="0"/>
    </radialGradient>
    <filter id="blur${statKey}${tier}">
      <feGaussianBlur stdDeviation="2.5"/>
    </filter>
  </defs>
  <rect width="80" height="80" rx="6" fill="url(#bg${statKey}${tier})"/>
  <rect width="80" height="80" rx="6" fill="url(#glow${statKey}${tier})"/>
  <rect width="80" height="80" rx="6" fill="none" stroke="${c}" stroke-width="0.8" opacity="${0.25 + tier * 0.04}"/>
  ${corners}
  ${shapeContent}
  ${dots}
</svg>`;
}

let count = 0;
for (const [statKey, stat] of Object.entries(STATS)) {
  for (let i = 0; i < stat.perks.length; i++) {
    const perk = stat.perks[i];
    const tier = i + 1;
    const filename = `${statKey}-t${tier}.svg`;
    const svg = makeSvg(statKey, tier, stat, perk);
    writeFileSync(join(OUT_DIR, filename), svg);
    count++;
  }
}

console.log(`Generated ${count} perk tier SVG icons in ${OUT_DIR}`);
