/**
 * Bestiary entries — the data that drives the Bestiary book pages.
 *
 * Designed for easy scripted entry: add a new BestiaryEntry, drop a
 * portrait image into /public/bestiary/, and it appears in-book.
 *
 * `enemyKey` MUST match the key in AssetManager.ENEMY_DEFS for the link
 * between in-game enemies and their bestiary entries.
 *
 * Portraits resolve in this order (see MonsterPortrait.tsx):
 *   1. The optional explicit `portrait` URL on the entry.
 *   2. /bestiary/<enemyKey>.png if shipped.
 *   3. A monogram tile in `accentColor`.
 *
 * Keep the entries lore-led — they're the player's only window into
 * each enemy outside of combat, so write them like field notes.
 */

export interface PortraitCrop {
  /** % from left of the source texture. 0..100 */
  x?: number;
  /** % from top of the source texture. 0..100 */
  y?: number;
  /** Zoom (CSS background-size as %). 100 = fit, 200 = 2× zoom. */
  zoom?: number;
}

export interface BestiaryEntry {
  enemyKey:    string;            // links to AssetManager ENEMY_DEFS key
  name:        string;
  threatLevel: 1 | 2 | 3 | 4 | 5;
  classification: string;         // "humanoid", "abomination", "construct", etc.
  habitat:     string;
  hp:          number;
  damage:      number;
  speed:       number;
  weaknesses:  string[];          // ["fire", "blunt", "headshots"]
  resistances: string[];          // ["cold", "ranged"]
  loot:        string[];
  /** Lore — flavor text that appears on the right page */
  lore:        string;
  /** Combat tips — short tactical hints */
  tips:        string;
  /** Behavioural notes — how the AI acts in the field */
  behaviour:   string;
  /** Known abilities / signature attacks */
  abilities:   string[];
  /** First confirmed sighting / where survivors first encountered them */
  firstSighted: string;
  /** Optional explicit portrait override path (skips probe). */
  portrait?:   string;
  /** Optional UV crop applied to the model's diffuse texture fallback. */
  portraitCrop?: PortraitCrop;
  /** Accent color for headers + monogram fallback. */
  accentColor: string;
}

export const BESTIARY: BestiaryEntry[] = [
  {
    enemyKey: 'clown',
    name: 'Hollow Jester',
    threatLevel: 3,
    classification: 'Abomination · Humanoid',
    habitat: 'Abandoned carnivals · Urban ruins · Underground tunnels',
    hp: 120,
    damage: 18,
    speed: 4.2,
    weaknesses: ['fire', 'headshots', 'blunt trauma'],
    resistances: ['fear', 'cold'],
    loot: ['Bell shard', 'Tattered cloth', 'Brass coin', 'Carnival token'],
    lore: 'Once entertainers in a forgotten carnival, the Jesters were the first to be touched by the rift. Their painted grins are now seared into the bone, and their laughter precedes them by several seconds — a delayed echo from somewhere just on the wrong side of reality. Survivors who hear the laugh and see no jester are advised to assume one is already behind them.',
    tips: 'Do not be fooled by their stagger. They lunge from a crouch with twice the reach of any survivor weapon. Keep moving, and never reload while one is within ten metres.',
    behaviour: 'Hunts in groups of 2–3. Will mirror a survivor\'s movement for several seconds before committing to a lunge. Drops to all fours when wounded and accelerates.',
    abilities: ['Delayed-echo laugh (lures)', 'Crouching lunge (8 m reach)', 'Bell-shard throw (short ranged)'],
    firstSighted: 'The Big Top, Year One — three days after the rift opened.',
    accentColor: '#e84060',
    portrait: '/bestiary/clown.png',
  },
  {
    enemyKey: 'doctor',
    name: 'Frost Surgeon',
    threatLevel: 4,
    classification: 'Ranged · Construct',
    habitat: 'Hospital ruins · Snowfields · Quarantine zones',
    hp: 95,
    damage: 24,
    speed: 3.8,
    weaknesses: ['fire', 'electric', 'piercing'],
    resistances: ['cold', 'bleed'],
    loot: ['Surgical scalpel', 'Antiseptic', 'Frozen vial', 'Cryo-coil'],
    lore: 'The Frost Surgeons have one purpose left in their machinery: to operate. They will pursue any wounded survivor across miles of terrain to "complete the procedure" — and the outcome is never in the patient\'s favour. Recovered logs from St. Aldred\'s Hospital suggest at least nine were active before the wing fell silent.',
    tips: 'Their orb projectile arcs slightly. Strafe perpendicular and close the distance fast — they fold in melee. Burn the cryo-coil on the back of their neck to disable freeze attacks.',
    behaviour: 'Maintains a 12 m engagement distance. Tracks bleeding targets preferentially — survivors with active wound debuffs are prioritised over healthy ones.',
    abilities: ['Cryo-orb (arcing projectile)', 'Frostbite scalpel (melee)', 'Operating-table summon (zone denial)'],
    firstSighted: 'St. Aldred\'s Hospital, third quarantine wing.',
    accentColor: '#80c0ff',
    portrait: '/bestiary/doctor.png',
  },
  {
    enemyKey: 'masked',
    name: 'Veil Stalker',
    threatLevel: 4,
    classification: 'Stealth · Humanoid',
    habitat: 'Forests at dusk · Rooftops · Sewer networks',
    hp: 80,
    damage: 30,
    speed: 5.5,
    weaknesses: ['light sources', 'shotgun', 'flares'],
    resistances: ['ranged at distance', 'sound'],
    loot: ['Black mask', 'Garrote wire', 'Silenced round', 'Veil fragment'],
    lore: 'No one has seen the face beneath the mask. Survivors who claim to have lifted it are never seen again. The Veil Stalkers do not roar; they whisper your name from a direction you can never quite locate. Field analysis suggests their masks are not worn — they have grown into the bone.',
    tips: 'They flank. If one is in front of you, two more are behind. Light up the area with a flare or torch and they break engagement immediately.',
    behaviour: 'Pack hunters that operate in triangular formation. Will not engage a target carrying an active light source unless they outnumber 3-to-1. Disappear into shadow if line of sight is broken for more than 2 s.',
    abilities: ['Whispered lure (false audio cue)', 'Garrote choke (rear grapple)', 'Shadow-step (short blink in low light)'],
    firstSighted: 'Greyfen Pine forest, north ridge — first reported by Ranger Hale.',
    accentColor: '#666666',
    portrait: '/bestiary/masked.png',
  },
  {
    enemyKey: 'miner',
    name: 'Tunnel Wretch',
    threatLevel: 2,
    classification: 'Brute · Mutated',
    habitat: 'Caves · Mineshafts · Collapsed buildings',
    hp: 220,
    damage: 22,
    speed: 2.8,
    weaknesses: ['light', 'fire', 'aimed shots to glowing eyes'],
    resistances: ['blunt', 'fall damage'],
    loot: ['Pickaxe head', 'Iron ore', 'Glowing crystal', 'Dust-caked lantern'],
    lore: 'Buried alive when the rift opened, these miners adapted. Their lungs no longer require air — only the dark wet smell of stone. They are slow, but the tunnels they dig are everywhere. Some survivors swear they can hear the distant tap of pickaxes through bedrock from over a kilometre away.',
    tips: 'Slow but tanky. Kite them in a circle and pump rifle rounds into the back of their head. Their amber eyes are weak points — three clean shots will down one even at full HP.',
    behaviour: 'Solitary or in mining-team trios. Will tunnel through soft terrain to reach a target if blocked. Becomes enraged and ignores armour when reduced below 30% HP.',
    abilities: ['Pickaxe overhead (heavy stagger)', 'Burrow + flank', 'Cave-in slam (AoE knockback)'],
    firstSighted: 'Blackvein Colliery, shaft 7-B.',
    accentColor: '#aa8855',
    portrait: '/bestiary/miner.png',
  },
  {
    enemyKey: 'scarecrow',
    name: 'Husk Watcher',
    threatLevel: 3,
    classification: 'Sentinel · Construct',
    habitat: 'Cornfields · Farmsteads · Crossroads at night',
    hp: 140,
    damage: 28,
    speed: 0,
    weaknesses: ['fire', 'explosives'],
    resistances: ['piercing', 'cold', 'movement debuffs'],
    loot: ['Straw bundle', 'Crow feather', 'Burlap sack', 'Bound twine charm'],
    lore: 'Stand perfectly still and the Husk Watcher will not move. Look away and turn back, and it has somehow taken three steps closer. They never blink. They never need to. The crows that ring their fields do not eat the grain — they sing for the watcher when prey approaches.',
    tips: 'Statues. They cannot chase you, but they will gut you if you walk past unaware. Burn them from range, or never break eye contact while passing.',
    behaviour: 'Quantum sentinel — only animates while not under direct observation. Will reposition behind cover if all witnesses are blinded or look away. Treats fire as the only credible threat.',
    abilities: ['Sickle reach (2 m sudden swipe)', 'Position-shift (when unobserved)', 'Crow-call summon (alerts nearby Husks)'],
    firstSighted: 'Halloway Farm, harvest season — a survey team returned with two dead.',
    accentColor: '#ccaa44',
    portrait: '/bestiary/scarecrow.png',
  },
  {
    enemyKey: 'seaexplorer',
    name: 'Drowned Diver',
    threatLevel: 3,
    classification: 'Aquatic · Ranged',
    habitat: 'Coastlines · Flooded basements · Old docks',
    hp: 160,
    damage: 20,
    speed: 3.2,
    weaknesses: ['electric', 'salt-iron rounds'],
    resistances: ['drowning', 'cold', 'crush damage'],
    loot: ['Brass helmet', 'Air hose', 'Pearl shard', 'Pressurised brine'],
    lore: 'Their suits are still pressurised from the dive that killed them. Inside, the water remembers. The helmets emit a steady ping at exactly 28 Hz — the same frequency the rift gave off the night it opened. Marine salvage crews report the divers walk along the seabed for miles before surfacing in unexpected places.',
    tips: 'Wet ground means they can swap positions. Stay on dry land. Aim for the helmet seal — one cracked porthole and the pressure inside does most of the work for you.',
    behaviour: 'Surfaces from any standing water within 50 m of a target. Maintains medium range, lobbing pressurised brine projectiles. Will re-submerge to reposition rather than fight in melee.',
    abilities: ['Brine lob (arcing splash damage)', 'Tidal blink (water-to-water teleport)', 'Helmet ping (slow + reveal)'],
    firstSighted: 'Pier 14, Old Harbour — washed ashore on the third night.',
    accentColor: '#3377cc',
    portrait: '/bestiary/seaexplorer.png',
  },
  {
    enemyKey: 'lizard_mule',
    name: 'Lizard Mule',
    threatLevel: 3,
    classification: 'Beast · Reptilian',
    habitat: 'Anomaly fields · Cinder wastes · Open glasslands',
    hp: 240,
    damage: 22,
    speed: 3.6,
    weaknesses: ['cold', 'piercing under the jaw'],
    resistances: ['heat', 'blunt'],
    loot: ['Hide, scaled', 'Bone, long', 'Pack strap', 'Anomaly bile'],
    lore: 'Bred in the anomaly fields from a strain that didn\'t quite finish dying, the lizard mule carries cargo through air the colonies wouldn\'t breathe. They are calm in train and lethal in defence — a wounded mule will gore the thing that hit it long after the rest of the pack has fled. Surface caravans budget one mule for every two survivors; survivors who lose theirs do not return.',
    tips: 'Heavy hide deflects ranged fire. Lead them in a wide circle to draw the two-strike combo, then dump into the soft throat between charges. Never reload inside their reach — the tail counter alone kills unarmoured survivors in one swing.',
    behaviour: 'Solitary or paired. Idles at rest until line-of-sight is closed under 14 m, then enters a heavy stomp-and-charge pattern. Roots in place on hit and counter-swings within 0.4 s. Flees only when reduced below 15% HP.',
    abilities: ['Charge stomp (heavy stagger)', 'Tail counter (rear-arc swipe)', 'Pack-roar (alerts other mules within 60 m)'],
    firstSighted: 'Salt-Pan Corridor, Year Three — three caravans walked in, none came out.',
    accentColor: '#6a8a4a',
    portrait: '/bestiary/lizard_mule.png',
  },
  {
    enemyKey: 'skeleton_swordman',
    name: 'Skeleton Swordsman',
    threatLevel: 2,
    classification: 'Undead · Humanoid',
    habitat: 'Cathedral ruins · Sunken graveyards · Anomaly tombs',
    hp: 90,
    damage: 16,
    speed: 3.2,
    weaknesses: ['blunt', 'holy', 'fire'],
    resistances: ['piercing', 'bleed', 'cold'],
    loot: ['Bone, long', 'Rusted blade', 'Tattered cloth', 'Grave token'],
    lore: 'Field analysts insist the skeletons of the Ruined Cathedral are not undead in the strict sense — only metal and bone re-knitted by something in the rift that finds the shape of a swordsman aesthetically agreeable. The blade is bonded to the wrist. The wrist is not happy about it.',
    tips: 'Their guard is brittle. Two clean blunt strikes to the ribcage will fold the rig. Avoid trading swings — the bonded blade ignores parries.',
    behaviour: 'Idles in formation around graves or altars. Wakes when a survivor enters a 10 m radius and walks directly toward them, swinging on contact.',
    abilities: ['Bonded slash (no parry)', 'Re-form (returns to idle if not killed cleanly)'],
    firstSighted: 'Ruined Cathedral, transept floor.',
    accentColor: '#b8b0a0',
    portrait: '/bestiary/skeleton_swordman.png',
  },
  {
    enemyKey: 'skeleton_axe',
    name: 'Skeleton Axe-Bearer',
    threatLevel: 2,
    classification: 'Undead · Humanoid',
    habitat: 'Cathedral ruins · Anomaly tombs · Old battlefields',
    hp: 130,
    damage: 24,
    speed: 2.6,
    weaknesses: ['blunt', 'holy', 'fire'],
    resistances: ['piercing', 'bleed', 'cold'],
    loot: ['Bone, long', 'Rusted axe', 'Tattered cloth', 'Grave token'],
    lore: 'The axe-bearers are the older skeletons, the ones the cathedral kept after the battles ended. Their swings start slow and end somewhere on the other side of you. Survivors describe the impact as "less like being hit and more like the floor deciding to stop existing."',
    tips: 'Heavier hits, slower wind-up. Sidestep the overhead and counter into the spine. Two clean blunt strikes still fold the rig.',
    behaviour: 'Idles like the swordsman; engages with a single heavy overhead chop on a 2.4 s cadence. Will not chase past its anchor altar.',
    abilities: ['Overhead chop (heavy stagger + ground crack)', 'Re-form (returns to anchor if not killed cleanly)'],
    firstSighted: 'Ruined Cathedral, side chapel.',
    accentColor: '#a89888',
    portrait: '/bestiary/skeleton_axe.png',
  },
  {
    enemyKey: 'tide_caller',
    name: 'Tide Caller',
    threatLevel: 4,
    classification: 'Shrine Boss · Aquatic',
    habitat: 'Sunken shrines · Pier ruins · Flooded basilicas',
    hp: 520,
    damage: 38,
    speed: 0,
    weaknesses: ['electric', 'salt-iron rounds', 'holy'],
    resistances: ['water', 'cold', 'physical at range'],
    loot: ['Tide sigil', 'Pearl shard, large', 'Pressurised brine', 'Coral charm'],
    lore: 'She does not move. The water moves. Pilgrims who reached the shrine and returned describe a tall figure in green-grey robes whose face is always angled away — and a tide that follows their gaze. The 28 Hz ping the Drowned Divers emit is louder near her. Three salvage teams have died standing perfectly still.',
    tips: 'Static target. Bring electric or salt-iron. Do not stand in standing water — that\'s how she lands the tidal pulse. The pulse telegraphs ~1.5 s with a low hum; break line of sight or run for a dry plinth.',
    behaviour: 'Stationary. Emits a 12 m radius tidal pulse every 6 s that staggers anyone in contact with standing water. Summons a Drowned Diver pair at 75% and 25% HP.',
    abilities: ['Tidal pulse (AoE, water-only)', 'Diver summon (per HP threshold)', '28 Hz lull (slow + reveal in 20 m)'],
    firstSighted: 'The Drowned Basilica, low tide — a single salvor returned, refused to speak of the figure.',
    accentColor: '#3a7080',
    portrait: '/bestiary/tide_caller.png',
  },
];

export function getBestiaryEntry(key: string): BestiaryEntry | undefined {
  return BESTIARY.find(e => e.enemyKey === key);
}

/**
 * Synthesize a stub bestiary entry from the canonical creature registry
 * for any key not in the curated `BESTIARY` array above. Lets the
 * Bestiary book auto-list every spawnable creature without requiring
 * 30+ hand-written lore blocks up front — curated entries override the
 * stub when present, and unknown creatures still get a usable "Field
 * Report Pending" page.
 *
 * Threat-level fields and habitat are sourced from `creatures.ts`; HP /
 * damage / speed are placeholder defaults until per-creature combat
 * tuning lands. The stub clearly marks itself with the lore line
 * "Field report pending." so designers know which entries still need
 * authored content.
 */
import { CREATURE_BY_KEY, type CreatureDef } from './creatures';

const ROLE_CLASSIFICATION: Record<CreatureDef['role'], string> = {
  'hostile-easy':   'Beast · Vermin',
  'hostile-scifi':  'Construct · Sci-Fi',
  'hostile-mech':   'Construct · Mech',
  'hostile-other':  'Hostile · Anomalous',
  'huntable-farm':  'Beast · Domesticated',
  'huntable-fish':  'Beast · Aquatic',
};

const ROLE_ACCENT: Record<CreatureDef['role'], string> = {
  'hostile-easy':   '#7a8a4a',
  'hostile-scifi':  '#ff5555',
  'hostile-mech':   '#8090a0',
  'hostile-other':  '#aa6655',
  'huntable-farm':  '#b08060',
  'huntable-fish':  '#3377cc',
};

function biomesToHabitat(biomes: CreatureDef['biomes']): string {
  const labels: Record<CreatureDef['biomes'][number], string> = {
    'permafrost':       'Permafrost',
    'glasslands':       'Glasslands',
    'derelict-sprawl':  'Derelict Sprawl',
    'anomaly-field':    'Anomaly Field',
    'cinder-wastes':    'Cinder Wastes',
    'water':            'Open water',
    'settlement':       'Outposts',
  };
  return biomes.map((b) => labels[b]).join(' · ') || 'Quest-only';
}

function synthesizeBestiaryEntry(c: CreatureDef): BestiaryEntry {
  // Placeholder combat numbers scaled by threatLevel until per-creature
  // balance ships. Designers replace these by adding a curated entry to
  // the BESTIARY array above — the curated one wins.
  const t = c.threatLevel;
  return {
    enemyKey:       c.key,
    name:           c.displayName,
    threatLevel:    t,
    classification: ROLE_CLASSIFICATION[c.role],
    habitat:        biomesToHabitat(c.biomes),
    hp:             40 * t,
    damage:         8 * t,
    speed:          c.role === 'huntable-farm' ? 5.0
                  : c.role === 'huntable-fish' ? 4.0
                  : 3.5,
    weaknesses:     [],
    resistances:    [],
    loot:           c.drops.slice(),
    lore:           'Field report pending. ' + (c.notes || ''),
    tips:           'No tactical analysis on file. Engage with caution.',
    behaviour:      `Default ${c.ai} archetype.`,
    abilities:      [],
    firstSighted:   'Unlogged.',
    accentColor:    ROLE_ACCENT[c.role],
  };
}

/**
 * Resolve a bestiary entry — curated first, synthesized stub otherwise.
 * Returns null when no creature with that key exists.
 */
export function getOrSynthesizeBestiaryEntry(key: string): BestiaryEntry | null {
  const curated = getBestiaryEntry(key);
  if (curated) return curated;
  const def = CREATURE_BY_KEY.get(key);
  if (!def) return null;
  return synthesizeBestiaryEntry(def);
}

/**
 * Full list of bestiary entries — curated overrides + synthesized stubs
 * for everything else in the creature registry. Used by BestiaryBook.tsx
 * so the book auto-grows when new creatures are added to creatures.ts.
 */
export function getAllBestiaryEntries(): BestiaryEntry[] {
  const out: BestiaryEntry[] = [];
  const seen = new Set<string>();
  for (const curated of BESTIARY) {
    out.push(curated);
    seen.add(curated.enemyKey);
  }
  for (const c of CREATURE_BY_KEY.values()) {
    if (seen.has(c.key)) continue;
    out.push(synthesizeBestiaryEntry(c));
  }
  return out;
}
