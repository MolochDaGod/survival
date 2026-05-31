/**
 * AnimationRegistry
 *
 * Single source of truth for every player-facing animation clip shipped
 * by Quaternius' Universal Animation Library (UAL1_Standard.glb +
 * UAL2_Standard.glb) — 88 unique clips after dropping the duplicate
 * A_TPose hold.
 *
 * `clipName` is the EXACT name as serialized in the source GLB (TitleCase
 * with underscores; spaces are NOT used in the GLB). The only renamed
 * clips are the locomotion six (Idle_Loop → Idle, Walk_Loop → Walk,
 * Jog_Fwd_Loop → Run, Sprint_Loop → Sprint, Jump_Start → Jump,
 * Jump_Loop → JumpLoop, Jump_Land → JumpLand) — those go through
 * AssetManager's ANIM_MAP rename so LocomotionAnimator can find them
 * under their semantic names. Everything else passes through unmodified.
 *
 * Usage:
 *   const def = ANIM.byClip.get('Sword_Regular_A');     // exact clip name
 *   const def = ANIM.byKey.get('sword_attack_a');       // game-logic key
 *   const clips = getAnimsForWeapon('sword', 'combat_sword');
 */

export type AnimLoopMode = 'loop' | 'once';
export type AnimCategory =
  | 'locomotion'
  | 'idle_variant'
  | 'combat_unarmed'
  | 'combat_sword'
  | 'combat_shield'
  | 'combat_throw'
  | 'combat_ranged'
  | 'combat_spell'
  | 'combat_2h'
  | 'traversal'
  | 'survival'
  | 'interaction'
  | 'social'
  | 'hit_react'
  | 'enemy';

export interface AnimDef {
  /** Exact clip name as it appears in the source GLB (post-ANIM_MAP rename for locomotion six). */
  clipName: string;
  /** Stable engine-side key for code lookups. */
  key: string;
  category: AnimCategory;
  loop: AnimLoopMode;
  /** Approximate duration in seconds (for one-shot scheduling). */
  duration: number;
  /** Optional follow-up clip to chain after this one ends. */
  recovery?: string;
  /** Weapon types this clip is appropriate for, if any. */
  weaponTypes?: string[];
  /** Source pack — UAL1 and UAL2 are loaded together for Unreal-mannequin rigs. */
  source: 'UAL1' | 'UAL2';
  description: string;
}

const define = (d: AnimDef): AnimDef => d;

export const ALL_ANIMS: AnimDef[] = [
  // ── LOCOMOTION (UAL1; clipName reflects the engine-side rename) ─────────
  define({ clipName: 'Idle',              key: 'idle',           category: 'locomotion',   loop: 'loop', duration: 1.6, source: 'UAL1', description: 'Default standing idle (renamed from Idle_Loop).' }),
  define({ clipName: 'Walk',              key: 'walk',           category: 'locomotion',   loop: 'loop', duration: 1.2, source: 'UAL1', description: 'Forward walk (renamed from Walk_Loop).' }),
  define({ clipName: 'Run',               key: 'run',            category: 'locomotion',   loop: 'loop', duration: 0.8, source: 'UAL1', description: 'Forward jog (renamed from Jog_Fwd_Loop).' }),
  define({ clipName: 'Sprint',            key: 'sprint',         category: 'locomotion',   loop: 'loop', duration: 0.7, source: 'UAL1', description: 'Forward sprint (renamed from Sprint_Loop).' }),
  define({ clipName: 'Walk_Formal_Loop',  key: 'walk_formal',    category: 'locomotion',   loop: 'loop', duration: 1.2, source: 'UAL1', description: 'Slow formal/inspection walk — usable for crouch-walk or aim-walk fallbacks.' }),
  define({ clipName: 'Walk_Carry_Loop',   key: 'walk_carry',     category: 'locomotion',   loop: 'loop', duration: 1.2, source: 'UAL2', description: 'Walking while carrying a large item — replaces Walk when hands are full.' }),
  define({ clipName: 'Crouch_Idle_Loop',  key: 'crouch_idle',    category: 'locomotion',   loop: 'loop', duration: 1.6, source: 'UAL1', description: 'Crouched stationary idle.' }),
  define({ clipName: 'Crouch_Fwd_Loop',   key: 'crouch_walk',    category: 'locomotion',   loop: 'loop', duration: 1.2, source: 'UAL1', description: 'Crouched forward locomotion.' }),
  define({ clipName: 'Swim_Idle_Loop',    key: 'swim_idle',      category: 'locomotion',   loop: 'loop', duration: 1.4, source: 'UAL1', description: 'Treading water — driven by SwimController when stationary in water.' }),
  define({ clipName: 'Swim_Fwd_Loop',     key: 'swim_fwd',       category: 'locomotion',   loop: 'loop', duration: 1.2, source: 'UAL1', description: 'Forward swim stroke — driven by SwimController on input while swimming.' }),
  define({ clipName: 'Push_Loop',         key: 'push',           category: 'locomotion',   loop: 'loop', duration: 1.4, source: 'UAL1', description: 'Pushing a heavy object forward.' }),

  // ── IDLE VARIANTS (UAL1 + UAL2) ─────────────────────────────────────────
  define({ clipName: 'Idle_FoldArms_Loop',     key: 'idle_arms_folded', category: 'idle_variant', loop: 'loop', duration: 2.0, source: 'UAL2', description: 'Standing with arms crossed.' }),
  define({ clipName: 'Idle_Lantern_Loop',      key: 'idle_lantern',     category: 'idle_variant', loop: 'loop', duration: 2.0, weaponTypes: ['lantern'], source: 'UAL2', description: 'Idle with lantern held — auto-play when lantern equipped.' }),
  define({ clipName: 'Idle_Torch_Loop',        key: 'idle_torch',       category: 'idle_variant', loop: 'loop', duration: 2.0, weaponTypes: ['torch'], source: 'UAL1', description: 'Idle with torch raised — auto-play when torch equipped.' }),
  define({ clipName: 'Idle_No_Loop',           key: 'idle_no',          category: 'idle_variant', loop: 'loop', duration: 1.1, source: 'UAL2', description: 'Head-shake "no" — dialogue / NPC.' }),
  define({ clipName: 'Idle_Rail_Loop',         key: 'idle_rail',        category: 'idle_variant', loop: 'loop', duration: 2.0, source: 'UAL2', description: 'Leaning casually on a rail.' }),
  define({ clipName: 'Idle_Rail_Call',         key: 'idle_rail_call',   category: 'idle_variant', loop: 'loop', duration: 2.0, source: 'UAL2', description: 'Calling/hailing while leaning on rail.' }),
  define({ clipName: 'Idle_TalkingPhone_Loop', key: 'idle_phone',       category: 'idle_variant', loop: 'loop', duration: 2.0, source: 'UAL2', description: 'Talking on phone — NPC flavor.' }),
  define({ clipName: 'Idle_Talking_Loop',      key: 'idle_talking',     category: 'idle_variant', loop: 'loop', duration: 2.0, source: 'UAL1', description: 'Generic talking gesture loop.' }),
  define({ clipName: 'Yes',                    key: 'idle_yes',         category: 'idle_variant', loop: 'once', duration: 1.0, source: 'UAL2', description: 'Nodding "yes" — dialogue accept.' }),
  define({ clipName: 'LayToIdle',              key: 'lay_to_idle',      category: 'idle_variant', loop: 'once', duration: 1.2, source: 'UAL2', description: 'Get-up from prone — knockdown recovery.' }),
  define({ clipName: 'Dance_Loop',             key: 'dance',            category: 'idle_variant', loop: 'loop', duration: 2.0, source: 'UAL1', description: 'Dance emote.' }),
  define({ clipName: 'Sitting_Enter',          key: 'sit_enter',        category: 'idle_variant', loop: 'once', duration: 0.9, source: 'UAL1', description: 'Sit down on object.' }),
  define({ clipName: 'Sitting_Idle_Loop',      key: 'sit_idle',         category: 'idle_variant', loop: 'loop', duration: 2.0, source: 'UAL1', description: 'Seated idle.' }),
  define({ clipName: 'Sitting_Talking_Loop',   key: 'sit_talking',      category: 'idle_variant', loop: 'loop', duration: 2.0, source: 'UAL1', description: 'Seated talking gesture.' }),
  define({ clipName: 'Sitting_Exit',           key: 'sit_exit',         category: 'idle_variant', loop: 'once', duration: 0.9, source: 'UAL1', description: 'Stand up from sit.' }),
  define({ clipName: 'Driving_Loop',           key: 'driving',          category: 'idle_variant', loop: 'loop', duration: 1.6, source: 'UAL1', description: 'Holding steering wheel — boat/vehicle pilot pose.' }),

  // ── COMBAT : UNARMED (UAL2) ─────────────────────────────────────────────
  define({ clipName: 'Melee_Hook',     key: 'unarmed_hook',          category: 'combat_unarmed', loop: 'once', duration: 0.50, recovery: 'Melee_Hook_Rec', weaponTypes: ['unarmed', 'fists', 'gloves'], source: 'UAL2', description: 'Left-hook punch — primary unarmed strike.' }),
  define({ clipName: 'Melee_Hook_Rec', key: 'unarmed_hook_recovery', category: 'combat_unarmed', loop: 'once', duration: 0.30, weaponTypes: ['unarmed', 'fists', 'gloves'], source: 'UAL2', description: 'Recovery after Melee_Hook.' }),
  define({ clipName: 'Punch_Cross',    key: 'unarmed_cross',         category: 'combat_unarmed', loop: 'once', duration: 0.45, weaponTypes: ['unarmed', 'fists', 'gloves'], source: 'UAL1', description: 'Right-hand cross punch — combo step B.' }),
  define({ clipName: 'Punch_Jab',      key: 'unarmed_jab',           category: 'combat_unarmed', loop: 'once', duration: 0.35, weaponTypes: ['unarmed', 'fists', 'gloves'], source: 'UAL1', description: 'Quick jab — combo step A.' }),

  // ── HIT REACTIONS (UAL1 + UAL2) ─────────────────────────────────────────
  define({ clipName: 'Hit_Knockback',    key: 'hit_knockback',          category: 'hit_react', loop: 'once', duration: 0.40, recovery: 'Hit_Knockback_RM', source: 'UAL2', description: 'Heavy knockback — plays on big hits / parried attacks.' }),
  define({ clipName: 'Hit_Knockback_RM', key: 'hit_knockback_recovery', category: 'hit_react', loop: 'once', duration: 0.28, source: 'UAL2', description: 'Get-up after knockback.' }),
  define({ clipName: 'Hit_Chest',        key: 'hit_chest',              category: 'hit_react', loop: 'once', duration: 0.30, source: 'UAL1', description: 'Chest-impact flinch — small/medium damage.' }),
  define({ clipName: 'Hit_Head',         key: 'hit_head',               category: 'hit_react', loop: 'once', duration: 0.30, source: 'UAL1', description: 'Head-impact flinch — small/medium damage.' }),
  define({ clipName: 'Death01',          key: 'death',                  category: 'hit_react', loop: 'once', duration: 1.40, source: 'UAL1', description: 'Death fall — plays on health-zero.' }),

  // ── COMBAT : SWORD (UAL1 simple + UAL2 combo) ──────────────────────────
  define({ clipName: 'Sword_Attack',         key: 'sword_attack_simple',     category: 'combat_sword', loop: 'once', duration: 0.55, recovery: 'Sword_Attack_RM', weaponTypes: ['sword', 'dagger', 'knife', 'sword_shield'], source: 'UAL1', description: 'Single-step sword attack (simpler UAL1 set).' }),
  define({ clipName: 'Sword_Attack_RM',      key: 'sword_attack_simple_rec', category: 'combat_sword', loop: 'once', duration: 0.30, weaponTypes: ['sword', 'dagger', 'knife', 'sword_shield'], source: 'UAL1', description: 'Recovery after Sword_Attack.' }),
  define({ clipName: 'Sword_Idle',           key: 'sword_idle',              category: 'combat_sword', loop: 'loop', duration: 1.6, weaponTypes: ['sword', 'dagger', 'knife', 'sword_shield'], source: 'UAL1', description: 'Sword combat-ready idle stance.' }),
  define({ clipName: 'Sword_Regular_A',      key: 'sword_attack_a',          category: 'combat_sword', loop: 'once', duration: 0.58, recovery: 'Sword_Regular_A_Rec', weaponTypes: ['sword', 'dagger', 'knife', 'sword_shield'], source: 'UAL2', description: 'Sword slash A — combo step 0.' }),
  define({ clipName: 'Sword_Regular_A_Rec',  key: 'sword_attack_a_recovery', category: 'combat_sword', loop: 'once', duration: 0.28, weaponTypes: ['sword', 'dagger', 'knife', 'sword_shield'], source: 'UAL2', description: 'Recovery after slash A.' }),
  define({ clipName: 'Sword_Regular_B',      key: 'sword_attack_b',          category: 'combat_sword', loop: 'once', duration: 0.55, recovery: 'Sword_Regular_B_Rec', weaponTypes: ['sword', 'dagger', 'knife', 'sword_shield'], source: 'UAL2', description: 'Sword slash B — combo step 1.' }),
  define({ clipName: 'Sword_Regular_B_Rec',  key: 'sword_attack_b_recovery', category: 'combat_sword', loop: 'once', duration: 0.28, weaponTypes: ['sword', 'dagger', 'knife', 'sword_shield'], source: 'UAL2', description: 'Recovery after slash B.' }),
  define({ clipName: 'Sword_Regular_C',      key: 'sword_attack_c',          category: 'combat_sword', loop: 'once', duration: 0.60, weaponTypes: ['sword', 'dagger', 'knife', 'sword_shield'], source: 'UAL2', description: 'Sword slash C — combo step 2.' }),
  define({ clipName: 'Sword_Regular_Combo', key: 'sword_combo_finisher',    category: 'combat_sword', loop: 'once', duration: 1.00, weaponTypes: ['sword', 'dagger', 'knife', 'sword_shield'], source: 'UAL2', description: 'Combo finisher after A→B→C chain.' }),
  define({ clipName: 'Sword_Block',          key: 'sword_block',             category: 'combat_sword', loop: 'once', duration: 0.50, weaponTypes: ['sword', 'sword_shield', 'dagger'], source: 'UAL2', description: 'Sword parry/block stance.' }),
  define({ clipName: 'Sword_Dash_RM',        key: 'sword_dash',              category: 'combat_sword', loop: 'once', duration: 0.55, weaponTypes: ['sword', 'dagger', 'knife'], source: 'UAL2', description: 'Lunging dash attack with sword — Sprint + LMB.' }),

  // ── COMBAT : SHIELD (UAL2) ──────────────────────────────────────────────
  define({ clipName: 'Idle_Shield_Loop',  key: 'idle_shield',  category: 'combat_shield', loop: 'loop', duration: 1.5, weaponTypes: ['shield', 'sword_shield'], source: 'UAL2', description: 'Active block stance with shield raised.' }),
  define({ clipName: 'Idle_Shield_Break', key: 'shield_break', category: 'combat_shield', loop: 'once', duration: 0.6, weaponTypes: ['shield', 'sword_shield'], source: 'UAL2', description: 'Shield shatter / guard-broken reaction.' }),
  define({ clipName: 'Shield_OneShot',    key: 'shield_bash',  category: 'combat_shield', loop: 'once', duration: 0.6, weaponTypes: ['shield', 'sword_shield'], source: 'UAL2', description: 'Shield-bash stagger attack.' }),
  define({ clipName: 'Shield_Dash_RM',    key: 'shield_dash',  category: 'combat_shield', loop: 'once', duration: 0.55, weaponTypes: ['shield', 'sword_shield'], source: 'UAL2', description: 'Shield-bash dash — Sprint + LMB with shield.' }),

  // ── COMBAT : RANGED / THROW (UAL1 + UAL2) ───────────────────────────────
  define({ clipName: 'OverhandThrow',       key: 'throw_overhand',  category: 'combat_throw',  loop: 'once', duration: 0.70, weaponTypes: ['throwable', 'javelin', 'grenade', 'spear'], source: 'UAL2', description: 'Overhand throw — spears, grenades, rocks.' }),
  define({ clipName: 'Pistol_Idle_Loop',    key: 'pistol_idle',     category: 'combat_ranged', loop: 'loop', duration: 1.6, weaponTypes: ['pistol', 'gun'], source: 'UAL1', description: 'Pistol stowed-but-ready idle.' }),
  define({ clipName: 'Pistol_Aim_Neutral',  key: 'pistol_aim',      category: 'combat_ranged', loop: 'loop', duration: 1.0, weaponTypes: ['pistol', 'gun'], source: 'UAL1', description: 'Pistol aim-down-sights neutral pose.' }),
  define({ clipName: 'Pistol_Aim_Up',       key: 'pistol_aim_up',   category: 'combat_ranged', loop: 'loop', duration: 1.0, weaponTypes: ['pistol', 'gun'], source: 'UAL1', description: 'Pistol aim raised — upward target.' }),
  define({ clipName: 'Pistol_Aim_Down',     key: 'pistol_aim_down', category: 'combat_ranged', loop: 'loop', duration: 1.0, weaponTypes: ['pistol', 'gun'], source: 'UAL1', description: 'Pistol aim lowered — downward target.' }),
  define({ clipName: 'Pistol_Shoot',        key: 'pistol_shoot',    category: 'combat_ranged', loop: 'once', duration: 0.30, weaponTypes: ['pistol', 'gun'], source: 'UAL1', description: 'Pistol fire — primary attack on ranged.' }),
  define({ clipName: 'Pistol_Reload',       key: 'pistol_reload',   category: 'combat_ranged', loop: 'once', duration: 1.40, weaponTypes: ['pistol', 'gun'], source: 'UAL1', description: 'Pistol reload — R key with ranged equipped.' }),

  // ── COMBAT : SPELL (UAL1) ───────────────────────────────────────────────
  define({ clipName: 'Spell_Simple_Enter',     key: 'spell_enter',     category: 'combat_spell', loop: 'once', duration: 0.60, weaponTypes: ['staff', 'wand', 'tome'], source: 'UAL1', description: 'Begin channelling — staff/wand raise.' }),
  define({ clipName: 'Spell_Simple_Idle_Loop', key: 'spell_charge',    category: 'combat_spell', loop: 'loop', duration: 1.20, weaponTypes: ['staff', 'wand', 'tome'], source: 'UAL1', description: 'Hold-channel idle — building spell power.' }),
  define({ clipName: 'Spell_Simple_Shoot',     key: 'spell_release',   category: 'combat_spell', loop: 'once', duration: 0.55, weaponTypes: ['staff', 'wand', 'tome'], source: 'UAL1', description: 'Release the held spell — projectile cast.' }),
  define({ clipName: 'Spell_Simple_Exit',      key: 'spell_exit',      category: 'combat_spell', loop: 'once', duration: 0.50, weaponTypes: ['staff', 'wand', 'tome'], source: 'UAL1', description: 'Lower casting arm — exit channelling.' }),

  // ── TRAVERSAL (UAL1 + UAL2) ─────────────────────────────────────────────
  define({ clipName: 'Jump',                 key: 'jump_start',       category: 'traversal', loop: 'once', duration: 0.40, source: 'UAL1', description: 'Jump launch (renamed from Jump_Start).' }),
  define({ clipName: 'JumpLoop',             key: 'jump_loop',        category: 'traversal', loop: 'loop', duration: 0.60, source: 'UAL1', description: 'Mid-air falling loop (renamed from Jump_Loop).' }),
  define({ clipName: 'JumpLand',             key: 'jump_land',        category: 'traversal', loop: 'once', duration: 0.45, source: 'UAL1', description: 'Landing recovery (renamed from Jump_Land).' }),
  define({ clipName: 'Roll',                 key: 'roll',             category: 'traversal', loop: 'once', duration: 0.55, recovery: 'Roll_RM', source: 'UAL1', description: 'Forward roll — wired to dodge (Left Shift).' }),
  define({ clipName: 'Roll_RM',              key: 'roll_recovery',    category: 'traversal', loop: 'once', duration: 0.30, source: 'UAL1', description: 'Roll get-up recovery.' }),
  define({ clipName: 'ClimbUp_1m_RM',        key: 'climbup_1m',       category: 'traversal', loop: 'once', duration: 1.20, source: 'UAL2', description: '1-meter ledge mantle — vault on short obstacles.' }),
  define({ clipName: 'NinjaJump_Start',      key: 'wall_jump_start',  category: 'traversal', loop: 'once', duration: 0.32, source: 'UAL2', description: 'Wall-run kickoff start.' }),
  define({ clipName: 'NinjaJump_Idle_Loop',  key: 'wall_hang_idle',   category: 'traversal', loop: 'loop', duration: 1.00, source: 'UAL2', description: 'Mid-air wall contact hover.' }),
  define({ clipName: 'NinjaJump_Land',       key: 'wall_jump_land',   category: 'traversal', loop: 'once', duration: 0.45, source: 'UAL2', description: 'Wall-jump / high-fall landing.' }),
  define({ clipName: 'Slide_Start',          key: 'slide_start',      category: 'traversal', loop: 'once', duration: 0.30, source: 'UAL2', description: 'Slide enter — Sprint + Crouch.' }),
  define({ clipName: 'Slide_Loop',           key: 'slide_loop',       category: 'traversal', loop: 'loop', duration: 0.80, source: 'UAL2', description: 'Sustained sliding loop.' }),
  define({ clipName: 'Slide_Exit',           key: 'slide_exit',       category: 'traversal', loop: 'once', duration: 0.38, source: 'UAL2', description: 'Slide exit recovery.' }),

  // ── SURVIVAL (UAL1 + UAL2) ──────────────────────────────────────────────
  define({ clipName: 'Consume',           key: 'consume',     category: 'survival', loop: 'once', duration: 1.80, source: 'UAL2', description: 'Eat / drink — inventory use on consumable.' }),
  define({ clipName: 'Farm_Harvest',      key: 'harvest',     category: 'survival', loop: 'once', duration: 1.50, weaponTypes: ['unarmed', 'knife', 'dagger', 'scythe'], source: 'UAL2', description: 'Harvest plant/berry node — E on plant_node.' }),
  define({ clipName: 'Farm_PlantSeed',    key: 'plant_seed',  category: 'survival', loop: 'once', duration: 2.00, source: 'UAL2', description: 'Plant a seed in soil — E on soil_plot.' }),
  define({ clipName: 'Farm_Watering',     key: 'watering',    category: 'survival', loop: 'once', duration: 1.80, weaponTypes: ['watering_can'], source: 'UAL2', description: 'Water a crop — E on crop with watering can.' }),
  define({ clipName: 'TreeChopping_Loop', key: 'chop_tree',   category: 'survival', loop: 'loop', duration: 1.30, weaponTypes: ['axe', 'hatchet'], source: 'UAL2', description: 'Axe-swing loop on tree — primary attack with axe equipped.' }),
  define({ clipName: 'PickUp_Table',      key: 'pickup',      category: 'survival', loop: 'once', duration: 0.90, source: 'UAL1', description: 'Bend down to pick up an item — loot pickup flourish.' }),

  // ── INTERACTION / SOCIAL (UAL1 + UAL2) ──────────────────────────────────
  define({ clipName: 'Chest_Open',     key: 'open_chest',   category: 'interaction', loop: 'once', duration: 1.50, source: 'UAL2', description: 'Open chest — E on Chest_Wood / container.' }),
  define({ clipName: 'Interact',       key: 'interact',     category: 'interaction', loop: 'once', duration: 0.80, source: 'UAL1', description: 'Generic interact reach — switches, levers, buttons.' }),
  define({ clipName: 'Fixing_Kneeling', key: 'repair',      category: 'interaction', loop: 'loop', duration: 1.80, source: 'UAL1', description: 'Kneeling repair gesture — workbench / item repair.' }),

  // ── COMBAT : RIFLE / SHOTGUN (Mixamo pack — loaded from /models/animations/) ─
  define({ clipName: 'Rifle_Idle_Loop',      key: 'rifle_idle',       category: 'combat_ranged', loop: 'loop', duration: 1.6,  weaponTypes: ['rifle', 'shotgun', 'crossbow', 'smg'], source: 'UAL1', description: 'Rifle held at low ready — default idle with long gun.' }),
  define({ clipName: 'Rifle_Aim_Neutral',    key: 'rifle_aim',        category: 'combat_ranged', loop: 'loop', duration: 1.0,  weaponTypes: ['rifle', 'shotgun', 'crossbow', 'smg'], source: 'UAL1', description: 'Rifle aim-down-sights neutral.' }),
  define({ clipName: 'Rifle_Aim_Up',         key: 'rifle_aim_up',     category: 'combat_ranged', loop: 'loop', duration: 1.0,  weaponTypes: ['rifle', 'shotgun', 'crossbow', 'smg'], source: 'UAL1', description: 'Rifle aim raised.' }),
  define({ clipName: 'Rifle_Aim_Down',       key: 'rifle_aim_down',   category: 'combat_ranged', loop: 'loop', duration: 1.0,  weaponTypes: ['rifle', 'shotgun', 'crossbow', 'smg'], source: 'UAL1', description: 'Rifle aim lowered.' }),
  define({ clipName: 'Rifle_Shoot',          key: 'rifle_shoot',      category: 'combat_ranged', loop: 'once', duration: 0.25, weaponTypes: ['rifle', 'shotgun', 'crossbow', 'smg'], source: 'UAL1', description: 'Rifle fire — heavier recoil than pistol.' }),
  define({ clipName: 'Rifle_Reload',         key: 'rifle_reload',     category: 'combat_ranged', loop: 'once', duration: 2.20, weaponTypes: ['rifle', 'shotgun', 'crossbow', 'smg'], source: 'UAL1', description: 'Rifle magazine swap — longer than pistol.' }),
  define({ clipName: 'Rifle_Walk_Fwd',       key: 'rifle_walk',       category: 'combat_ranged', loop: 'loop', duration: 1.1,  weaponTypes: ['rifle', 'shotgun', 'crossbow', 'smg'], source: 'UAL1', description: 'Walking with rifle at low ready.' }),
  define({ clipName: 'Rifle_Run_Fwd',        key: 'rifle_run',        category: 'combat_ranged', loop: 'loop', duration: 0.8,  weaponTypes: ['rifle', 'shotgun', 'crossbow', 'smg'], source: 'UAL1', description: 'Running with rifle.' }),
  define({ clipName: 'Shotgun_Pump',         key: 'shotgun_pump',     category: 'combat_ranged', loop: 'once', duration: 0.60, weaponTypes: ['shotgun'], source: 'UAL1', description: 'Pump-action rack between shots.' }),

  // ── COMBAT : 2H MELEE (greatsword, greataxe, hammer, spear) ─────────────
  define({ clipName: '2H_Idle_Loop',         key: '2h_idle',          category: 'combat_2h',    loop: 'loop', duration: 1.6,  weaponTypes: ['greatsword', 'greataxe', 'hammer', 'spear', 'mace'], source: 'UAL2', description: '2-handed weapon ready stance.' }),
  define({ clipName: '2H_Swing_A',           key: '2h_swing_a',       category: 'combat_2h',    loop: 'once', duration: 0.70, recovery: '2H_Swing_A_Rec', weaponTypes: ['greatsword', 'greataxe', 'hammer', 'spear', 'mace'], source: 'UAL2', description: 'Heavy horizontal swing — combo step 0.' }),
  define({ clipName: '2H_Swing_A_Rec',       key: '2h_swing_a_rec',   category: 'combat_2h',    loop: 'once', duration: 0.35, weaponTypes: ['greatsword', 'greataxe', 'hammer', 'spear', 'mace'], source: 'UAL2', description: 'Recovery after heavy swing A.' }),
  define({ clipName: '2H_Swing_B',           key: '2h_swing_b',       category: 'combat_2h',    loop: 'once', duration: 0.75, recovery: '2H_Swing_B_Rec', weaponTypes: ['greatsword', 'greataxe', 'hammer', 'spear', 'mace'], source: 'UAL2', description: 'Heavy diagonal swing — combo step 1.' }),
  define({ clipName: '2H_Swing_B_Rec',       key: '2h_swing_b_rec',   category: 'combat_2h',    loop: 'once', duration: 0.35, weaponTypes: ['greatsword', 'greataxe', 'hammer', 'spear', 'mace'], source: 'UAL2', description: 'Recovery after heavy swing B.' }),
  define({ clipName: '2H_Slam',              key: '2h_slam',          category: 'combat_2h',    loop: 'once', duration: 0.90, weaponTypes: ['greatsword', 'greataxe', 'hammer', 'mace'], source: 'UAL2', description: 'Overhead slam — finisher / heavy attack.' }),
  define({ clipName: '2H_Spin',              key: '2h_spin',          category: 'combat_2h',    loop: 'once', duration: 0.85, weaponTypes: ['greatsword', 'greataxe', 'spear'], source: 'UAL2', description: '360° spin attack — AoE clear.' }),
  define({ clipName: '2H_Block',             key: '2h_block',         category: 'combat_2h',    loop: 'once', duration: 0.50, weaponTypes: ['greatsword', 'greataxe', 'hammer', 'spear', 'mace'], source: 'UAL2', description: '2H weapon parry stance.' }),
  define({ clipName: '2H_Thrust',            key: '2h_thrust',        category: 'combat_2h',    loop: 'once', duration: 0.60, weaponTypes: ['spear', 'greatsword'], source: 'UAL2', description: 'Forward thrust — spear primary, greatsword alt.' }),

  // ── COMBAT : BOW / CROSSBOW ─────────────────────────────────────────────
  define({ clipName: 'Bow_Idle_Loop',        key: 'bow_idle',         category: 'combat_ranged', loop: 'loop', duration: 1.6,  weaponTypes: ['bow', 'crossbow'], source: 'UAL1', description: 'Bow held at side — idle stance.' }),
  define({ clipName: 'Bow_Draw',             key: 'bow_draw',         category: 'combat_ranged', loop: 'once', duration: 0.40, weaponTypes: ['bow', 'crossbow'], source: 'UAL1', description: 'Draw bowstring — hold for aim.' }),
  define({ clipName: 'Bow_Aim_Loop',         key: 'bow_aim',          category: 'combat_ranged', loop: 'loop', duration: 1.0,  weaponTypes: ['bow', 'crossbow'], source: 'UAL1', description: 'Held aim pose with drawn bow.' }),
  define({ clipName: 'Bow_Release',          key: 'bow_release',      category: 'combat_ranged', loop: 'once', duration: 0.30, weaponTypes: ['bow', 'crossbow'], source: 'UAL1', description: 'Release arrow — fire shot.' }),
  define({ clipName: 'Bow_Reload',           key: 'bow_reload',       category: 'combat_ranged', loop: 'once', duration: 0.80, weaponTypes: ['bow', 'crossbow'], source: 'UAL1', description: 'Nock new arrow.' }),

  // ── COMBAT : KNIFE / STEALTH ─────────────────────────────────────────────
  define({ clipName: 'Knife_Stab',           key: 'knife_stab',       category: 'combat_sword',  loop: 'once', duration: 0.40, weaponTypes: ['knife', 'dagger'], source: 'UAL2', description: 'Quick forward stab — faster than sword slash.' }),
  define({ clipName: 'Knife_Slash',          key: 'knife_slash',      category: 'combat_sword',  loop: 'once', duration: 0.35, weaponTypes: ['knife', 'dagger'], source: 'UAL2', description: 'Horizontal knife slash — combo step B.' }),
  define({ clipName: 'Backstab',             key: 'backstab',         category: 'combat_sword',  loop: 'once', duration: 0.80, weaponTypes: ['knife', 'dagger'], source: 'UAL2', description: 'Stealth backstab kill — from behind unaware target.' }),

  // ── DEPLOY / MECHANICAL ──────────────────────────────────────────────────
  define({ clipName: 'Deploy_Place',         key: 'deploy_place',     category: 'interaction',   loop: 'once', duration: 1.20, source: 'UAL2', description: 'Place deployable (turret, drone, trap) on ground.' }),
  define({ clipName: 'Deploy_Activate',      key: 'deploy_activate',  category: 'interaction',   loop: 'once', duration: 0.60, source: 'UAL2', description: 'Activate deployed device — press button.' }),
  define({ clipName: 'Deploy_Recall',        key: 'deploy_recall',    category: 'interaction',   loop: 'once', duration: 0.80, source: 'UAL2', description: 'Recall deployed device back to inventory.' }),

  // ── ALLY / SOCIAL (companion NPC commands) ────────────────────────────────
  define({ clipName: 'Wave',                 key: 'wave',             category: 'social',        loop: 'once', duration: 1.20, source: 'UAL1', description: 'Wave greeting — player emote + NPC follow acknowledge.' }),
  define({ clipName: 'Salute',               key: 'salute',           category: 'social',        loop: 'once', duration: 1.00, source: 'UAL2', description: 'Military salute — NPC recruited acknowledge.' }),
  define({ clipName: 'PointForward',         key: 'point_forward',    category: 'social',        loop: 'once', duration: 0.80, source: 'UAL2', description: 'Point forward — command ally to move to position.' }),
  define({ clipName: 'StopSignal',           key: 'stop_signal',      category: 'social',        loop: 'once', duration: 0.60, source: 'UAL2', description: 'Hold-position hand signal — command ally to stay.' }),
  define({ clipName: 'Cheer',                key: 'cheer',            category: 'social',        loop: 'once', duration: 1.40, source: 'UAL2', description: 'Victory cheer — post-combat celebration.' }),

  // ── ENEMY (UAL2 — used by zombie-style enemies on the same rig) ─────────
  define({ clipName: 'Zombie_Idle_Loop',     key: 'enemy_zombie_idle',   category: 'enemy', loop: 'loop', duration: 2.00, source: 'UAL2', description: 'Zombie idle — used on undead enemy type.' }),
  define({ clipName: 'Zombie_Scratch',       key: 'enemy_zombie_attack', category: 'enemy', loop: 'once', duration: 0.90, source: 'UAL2', description: 'Zombie swipe attack.' }),
  define({ clipName: 'Zombie_Walk_Fwd_Loop', key: 'enemy_zombie_walk',   category: 'enemy', loop: 'loop', duration: 1.20, source: 'UAL2', description: 'Zombie shuffle locomotion.' }),
];

// ── Lookup maps (built once at module load) ─────────────────────────────────

export const ANIM = (() => {
  const byClip = new Map<string, AnimDef>();
  const byKey = new Map<string, AnimDef>();
  const byCategory = new Map<AnimCategory, AnimDef[]>();
  const byWeapon = new Map<string, AnimDef[]>();

  for (const def of ALL_ANIMS) {
    byClip.set(def.clipName, def);
    byKey.set(def.key, def);

    if (!byCategory.has(def.category)) byCategory.set(def.category, []);
    byCategory.get(def.category)!.push(def);

    for (const wt of def.weaponTypes ?? []) {
      if (!byWeapon.has(wt)) byWeapon.set(wt, []);
      byWeapon.get(wt)!.push(def);
    }
  }

  return { byClip, byKey, byCategory, byWeapon } as const;
})();

/**
 * Return all AnimDefs for a given weapon type (e.g. 'sword', 'axe', 'shield').
 * Optionally filter by category (e.g. 'combat_sword').
 */
export function getAnimsForWeapon(
  weaponType: string,
  category?: AnimCategory,
): AnimDef[] {
  const all = ANIM.byWeapon.get(weaponType) ?? [];
  return category ? all.filter(a => a.category === category) : all;
}

/**
 * Return all AnimDefs for a category.
 */
export function getAnimsByCategory(category: AnimCategory): AnimDef[] {
  return ANIM.byCategory.get(category) ?? [];
}

// ── Combo chain definition ──────────────────────────────────────────────────

export interface ComboChain {
  weaponType: string;
  steps: Array<{
    clipName: string;
    windowMs: number;
    /** Normalized clip time (0-1) where damage window starts. */
    hitFrameStart: number;
    /** Normalized clip time (0-1) where damage window ends. */
    hitFrameEnd: number;
  }>;
  finisher: string;
}

/**
 * Sword combo: A → B → C → finisher. windowMs is how long after a step ends
 * the player can press attack to continue the chain.
 */
export const SWORD_COMBO: ComboChain = {
  weaponType: 'sword',
  steps: [
    { clipName: 'Sword_Regular_A', windowMs: 600, hitFrameStart: 0.25, hitFrameEnd: 0.65 },
    { clipName: 'Sword_Regular_B', windowMs: 650, hitFrameStart: 0.22, hitFrameEnd: 0.62 },
    { clipName: 'Sword_Regular_C', windowMs: 700, hitFrameStart: 0.20, hitFrameEnd: 0.70 },
  ],
  finisher: 'Sword_Regular_Combo',
};

export const KNIFE_COMBO: ComboChain = {
  weaponType: 'knife',
  steps: [
    { clipName: 'Knife_Stab',  windowMs: 400, hitFrameStart: 0.30, hitFrameEnd: 0.70 },
    { clipName: 'Knife_Slash', windowMs: 450, hitFrameStart: 0.25, hitFrameEnd: 0.65 },
    { clipName: 'Knife_Stab',  windowMs: 400, hitFrameStart: 0.30, hitFrameEnd: 0.70 },
  ],
  finisher: 'Backstab',
};

export const HEAVY_2H_COMBO: ComboChain = {
  weaponType: 'greatsword',
  steps: [
    { clipName: '2H_Swing_A', windowMs: 800, hitFrameStart: 0.30, hitFrameEnd: 0.75 },
    { clipName: '2H_Swing_B', windowMs: 850, hitFrameStart: 0.28, hitFrameEnd: 0.72 },
  ],
  finisher: '2H_Slam',
};

/** Lookup combo chain by weapon type. Falls back to sword combo for unmapped types. */
export function getComboChain(weaponType: string): ComboChain {
  switch (weaponType) {
    case 'knife': case 'dagger': return KNIFE_COMBO;
    case 'greatsword': case 'greataxe': case 'hammer': case 'mace': case 'spear': return HEAVY_2H_COMBO;
    default: return SWORD_COMBO;
  }
}

/** Reload clip per weapon type — R key. */
export const RELOAD_CLIP: Record<string, string> = {
  pistol:   'Pistol_Reload',
  gun:      'Pistol_Reload',
  rifle:    'Rifle_Reload',
  shotgun:  'Rifle_Reload',
  smg:      'Rifle_Reload',
  crossbow: 'Bow_Reload',
  bow:      'Bow_Reload',
};

/** ADS aim clip per weapon type — held while RMB is down. */
export const AIM_CLIP: Record<string, string> = {
  pistol:   'Pistol_Aim_Neutral',
  gun:      'Pistol_Aim_Neutral',
  rifle:    'Rifle_Aim_Neutral',
  shotgun:  'Rifle_Aim_Neutral',
  smg:      'Rifle_Aim_Neutral',
  crossbow: 'Rifle_Aim_Neutral',
  bow:      'Bow_Aim_Loop',
};

// ── Slide state machine ────────────────────────────────────────────────────

export const SLIDE_TRANSITIONS = {
  enter: 'Slide_Start',
  loop:  'Slide_Loop',
  exit:  'Slide_Exit',
} as const;

// ── Weapon → primary attack clip (LMB) ─────────────────────────────────────

export const PRIMARY_ATTACK_CLIP: Record<string, string> = {
  // Unarmed
  unarmed:      'Melee_Hook',
  fists:        'Melee_Hook',
  gloves:       'Melee_Hook',
  // 1H melee
  sword:        'Sword_Regular_A',
  dagger:       'Knife_Stab',
  knife:        'Knife_Stab',
  sword_shield: 'Sword_Regular_A',
  // 2H melee
  axe:          '2H_Swing_A',
  hatchet:      'TreeChopping_Loop',
  greatsword:   '2H_Swing_A',
  greataxe:     '2H_Swing_A',
  hammer:       '2H_Slam',
  mace:         '2H_Swing_A',
  spear:        '2H_Thrust',
  // Thrown
  throwable:    'OverhandThrow',
  javelin:      'OverhandThrow',
  grenade:      'OverhandThrow',
  // Shield
  shield:       'Shield_OneShot',
  // Ranged — pistol
  pistol:       'Pistol_Shoot',
  gun:          'Pistol_Shoot',
  // Ranged — rifle / shotgun / SMG
  rifle:        'Rifle_Shoot',
  shotgun:      'Rifle_Shoot',
  crossbow:     'Bow_Release',
  smg:          'Rifle_Shoot',
  // Ranged — bow
  bow:          'Bow_Release',
  // Magic
  staff:        'Spell_Simple_Shoot',
  wand:         'Spell_Simple_Shoot',
  tome:         'Spell_Simple_Shoot',
  // Tools
  scythe:       'Farm_Harvest',
};

// ── Weapon → block clip (right-click) ──────────────────────────────────────

export const BLOCK_CLIP: Record<string, string> = {
  // 1H melee
  sword:        'Sword_Block',
  sword_shield: 'Sword_Block',
  shield:       'Idle_Shield_Loop',
  dagger:       'Sword_Block',
  knife:        'Sword_Block',
  // 2H melee
  greatsword:   '2H_Block',
  greataxe:     '2H_Block',
  hammer:       '2H_Block',
  mace:         '2H_Block',
  spear:        '2H_Block',
  axe:          '2H_Block',
  // Ranged (RMB = ADS, not block — handled by PlayerController.startAiming)
  // No block clip for ranged weapons — ADS is the default RMB behavior
};

// ── Sprint + LMB → dash attack ─────────────────────────────────────────────

export const DASH_ATTACK_CLIP: Record<string, string> = {
  sword:        'Sword_Dash_RM',
  dagger:       'Sword_Dash_RM',
  knife:        'Sword_Dash_RM',
  sword_shield: 'Sword_Dash_RM',
  shield:       'Shield_Dash_RM',
  greatsword:   '2H_Spin',
  greataxe:     '2H_Spin',
  spear:        '2H_Thrust',
};

// ── Equipment-driven idle override ─────────────────────────────────────────

export const IDLE_OVERRIDE_CLIP: Record<string, string> = {
  lantern:      'Idle_Lantern_Loop',
  torch:        'Idle_Torch_Loop',
  shield:       'Idle_Shield_Loop',
  sword_shield: 'Idle_Shield_Loop',
  sword:        'Sword_Idle',
  dagger:       'Sword_Idle',
  knife:        'Sword_Idle',
  pistol:       'Pistol_Idle_Loop',
  gun:          'Pistol_Idle_Loop',
  rifle:        'Rifle_Idle_Loop',
  shotgun:      'Rifle_Idle_Loop',
  smg:          'Rifle_Idle_Loop',
  crossbow:     'Rifle_Idle_Loop',
  bow:          'Bow_Idle_Loop',
  greatsword:   '2H_Idle_Loop',
  greataxe:     '2H_Idle_Loop',
  hammer:       '2H_Idle_Loop',
  mace:         '2H_Idle_Loop',
  spear:        '2H_Idle_Loop',
};

// ── E-interact → clip per prop/node type ───────────────────────────────────

export const INTERACT_CLIP: Record<string, string> = {
  chest:         'Chest_Open',
  tree:          'TreeChopping_Loop',
  plant_node:    'Farm_Harvest',
  crop_watering: 'Farm_Watering',
  soil_plot:     'Farm_PlantSeed',
  consumable:    'Consume',
  climbup:       'ClimbUp_1m_RM',
  pickup:        'PickUp_Table',
  workbench:     'Fixing_Kneeling',
  generic:       'Interact',
};

// ── Hit reaction picker — by incoming damage magnitude ─────────────────────

/**
 * Pick the appropriate hit-react clip for an incoming damage amount.
 * Heavy hits (>= 30% maxHp) trigger the full Hit_Knockback knockdown;
 * smaller hits play a chest/head flinch.
 */
export function pickHitReactClip(damageFraction: number, headshot = false): string {
  if (damageFraction >= 0.30) return 'Hit_Knockback';
  return headshot ? 'Hit_Head' : 'Hit_Chest';
}
