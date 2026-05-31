/**
 * iconMap.ts — Semantic mapping of icon filenames to game concepts.
 *
 * Based on visual inspection of each icon pack:
 *   genetics    (Icon11_*) — DNA, test tubes, microscopes, scanners, biotech
 *   cyberpunk-food (Icon3_*) — neon food, drinks, consumables
 *   cyberpunk-weapons (Icon1_*) — ammo, grenades, guns, blades, crates, tech
 *   cyberpunk-artifacts (Icon22_*) — relics, cubes, pyramids, orbs, implants
 *   scifi-items (1-20.png) — full-size sci-fi weapon illustrations
 *   scifi-misc  (1-20.png) — full-size misc sci-fi item illustrations
 *   rpg-gui     — UI frames, buttons, bars, panels, avatars, icons
 *
 * Local paths use the Vite BASE_URL prefix automatically.
 */

const I = (cat: string, file: string) => `/icons/${cat}/${file}`;

// ── Shortcut helpers ──────────────────────────────────────────────────────
const GEN  = (n: string) => I('genetics', n);
const FOOD = (n: string) => I('cyberpunk-food', n);
const WEAP = (n: string) => I('cyberpunk-weapons', n);
const ART  = (n: string) => I('cyberpunk-artifacts', n);
const SCI  = (n: string) => I('scifi-items', n);
const MISC = (n: string) => I('scifi-misc', n);
const GUI  = (n: string) => I('rpg-gui', n);

// ═══════════════════════════════════════════════════════════════════════════
// ITEM ICONS (Items.ts ITEM_DATABASE)
// ═══════════════════════════════════════════════════════════════════════════
export const ITEM_ICONS: Record<string, string> = {
  // Helms
  leather_cap:         WEAP('Icon1_09.png'),   // blue tech helmet crate
  iron_helm:           WEAP('Icon1_15.png'),   // orange ammo crate / armor
  shadow_hood:         ART('Icon22_05.png'),   // dark pyramid artifact
  dragon_crown:        ART('Icon22_01.png'),   // glowing orb relic
  // Chest
  cloth_tunic:         WEAP('Icon1_14.png'),   // brown armor crate
  iron_breastplate:    WEAP('Icon1_11.png'),   // blue crate (heavy)
  mage_robe:           ART('Icon22_10.png'),   // energy cube
  void_plate:          ART('Icon22_20.png'),   // green tech artifact
  // Legs
  leather_pants:       WEAP('Icon1_12.png'),   // teal ammo crate
  iron_greaves:        WEAP('Icon1_13.png'),   // blue gear crate
  shadowsilk_pants:    ART('Icon22_08.png'),   // dark relic
  // Boots
  leather_boots:       WEAP('Icon1_17.png'),   // small dark component
  swift_treads:        WEAP('Icon1_25.png'),   // metallic cylinder
  warlords_sabatons:   ART('Icon22_15.png'),   // red dome artifact
  // Offhand
  wooden_shield:       WEAP('Icon1_19.png'),   // dark tech block
  iron_shield:         WEAP('Icon1_20.png'),   // dark armor piece
  arcane_focus:        ART('Icon22_03.png'),   // crystal orb
  // Rings
  copper_ring:         GEN('Icon11_22.png'),   // DNA double helix
  ring_of_might:       ART('Icon22_06.png'),   // glowing ring artifact
  ring_of_swiftness:   GEN('Icon11_20.png'),   // molecule scatter
  band_of_kings:       ART('Icon22_04.png'),   // rare artifact
  // Amulets
  bone_charm:          GEN('Icon11_01.png'),   // DNA strand
  amulet_of_focus:     GEN('Icon11_15.png'),   // scanning display
  heartstone_pendant:  ART('Icon22_02.png'),   // energy crystal
};

// ═══════════════════════════════════════════════════════════════════════════
// WEAPON ICONS (constants.ts WEAPONS)
// ═══════════════════════════════════════════════════════════════════════════
export const WEAPON_ICONS: Record<string, string> = {
  iron_sword:        WEAP('Icon1_18.png'),   // energy blade
  fire_axe:          WEAP('Icon1_40.png'),   // cyan blade / axe
  shadow_dagger:     WEAP('Icon1_04.png'),   // bullet/dagger
  thunder_mace:      WEAP('Icon1_07.png'),   // energy device
  iron_pistol:       WEAP('Icon1_16.png'),   // cyberpunk pistol
  hellfire_shotgun:  WEAP('Icon1_08.png'),   // heavy red device
};

// ═══════════════════════════════════════════════════════════════════════════
// ABILITY ICONS (constants.ts ABILITIES)
// ═══════════════════════════════════════════════════════════════════════════
export const ABILITY_ICONS: Record<string, string> = {
  whirlwind:         ART('Icon22_09.png'),   // swirl artifact
  fireball:          WEAP('Icon1_01.png'),   // red explosive ammo
  shield_bash:       WEAP('Icon1_21.png'),   // green tech device
  berserker_rage:    WEAP('Icon1_22.png'),   // red detonator
  lightning_strike:  WEAP('Icon1_10.png'),   // energy pistol
  ice_spike:         GEN('Icon11_09.png'),   // blue flask
};

// ═══════════════════════════════════════════════════════════════════════════
// STAT PERK ICONS (StatPerkChoices.ts TIER4_BY_STAT actives)
// ═══════════════════════════════════════════════════════════════════════════
export const PERK_ICONS: Record<string, string> = {
  // BIO
  bio_adrenaline_surge:   GEN('Icon11_08.png'),   // syringe/wand
  bio_toxic_counter:      GEN('Icon11_05.png'),   // test tubes
  bio_cellular_lockdown:  GEN('Icon11_10.png'),    // microscope
  // NEU
  neu_mind_spike:         GEN('Icon11_03.png'),   // molecule
  neu_neural_overclock:   GEN('Icon11_16.png'),   // flashlight
  neu_psionic_shield:     GEN('Icon11_23.png'),   // purple tech
  // KIN
  kin_phase_dash:         WEAP('Icon1_05.png'),   // bullet
  kin_ground_pound:       WEAP('Icon1_01.png'),   // red explosive
  kin_combat_dance:       ART('Icon22_09.png'),    // swirl
  // QNT
  qnt_quantum_grenade:    WEAP('Icon1_06.png'),   // grenade canister
  qnt_phase_step:         GEN('Icon11_30.png'),   // cube wireframe
  qnt_probability_bubble: GEN('Icon11_19.png'),   // liquid bottle
  // SYN
  syn_combat_drone:       GEN('Icon11_17.png'),   // device/monitor
  syn_emp_burst:          WEAP('Icon1_07.png'),    // energy device
  syn_override_protocol:  GEN('Icon11_21.png'),    // magnifier
  // CHR
  chr_time_slip:          ART('Icon22_07.png'),    // artifact
  chr_rewind:             GEN('Icon11_35.png'),    // tablet device
  chr_temporal_echo:      GEN('Icon11_14.png'),    // microscope
  // ENT
  ent_entropy_field:      ART('Icon22_12.png'),    // artifact
  ent_reality_anchor:     ART('Icon22_13.png'),    // artifact
  ent_decay_pulse:        GEN('Icon11_02.png'),    // flask
  // GRA
  gra_gravity_well:       ART('Icon22_11.png'),    // dark tech
  gra_zero_g_burst:       GEN('Icon11_04.png'),    // molecule hex
  gra_singularity:        ART('Icon22_14.png'),    // artifact
};

// ═══════════════════════════════════════════════════════════════════════════
// CONSUMABLE ICONS (survival food/drink/meds)
// ═══════════════════════════════════════════════════════════════════════════
export const CONSUMABLE_ICONS = {
  food:      FOOD('Icon3_01.png'),
  drink:     FOOD('Icon3_10.png'),
  potion:    GEN('Icon11_09.png'),
  medkit:    GEN('Icon11_08.png'),
  stimpack:  GEN('Icon11_11.png'),
};

// ═══════════════════════════════════════════════════════════════════════════
// RPG GUI FRAME ASSETS
// ═══════════════════════════════════════════════════════════════════════════
export const GUI_FRAMES = {
  /** Inventory slot background frame */
  inventorySlot:    GUI('Inventory_Inventory PNG_1.png'),
  inventoryPanel:   GUI('Inventory_Inventory PNG_2.png'),
  /** HP/Mana bar frames */
  hpBarFrame:       GUI('HP-Mana_HP-Mana PNG_1.png'),
  manaBarFrame:     GUI('HP-Mana_HP-Mana PNG_2.png'),
  /** Skill bar */
  skillPanel:       GUI('Skills_Skills PNG_1.png'),
  /** Hero portrait frame */
  heroFrame:        GUI('Hero_Hero PNG_1.png'),
  /** Action buttons */
  btnNormal:        GUI('Buttons1_Buttons1-2 PNG_1.png'),
  btnPressed:       GUI('Buttons1_Buttons1-2 PNG_2.png'),
  /** Chat bubble */
  chatBubble:       GUI('Chat_Chat PNG_1.png'),
  /** Background panels */
  panelDark:        GUI('bg1.png'),
  panelLight:       GUI('bg2.png'),
};
