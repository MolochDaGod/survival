import fs from 'fs';
const FILE = 'F:/GitHub/survival/artifacts/website/stats-guide.html';
let src = fs.readFileSync(FILE, 'utf8');

// 1. Replace CHR affinityEffects from empty to populated
src = src.replace(
  `"description":"Temporal anomaly resistance, time perception, causality protection \u2014 content reserved for chronal perks.","archetype":"Chrono-Operative / Echo Reader","affinityEffects":[]`,
  `"description":"Temporal anomaly resistance, time perception, causality protection \u2014 drives time-slip actives and echo-strike combos.","archetype":"Chrono-Operative / Echo Reader","affinityEffects":["timeSlowDuration","rewindWindowS","echoStrikeMult","chronalSicknessResist","causalityShieldHp","temporalDodgeChance","phaseAnchorRadius","paradoxDuplicateDuration","timelineRewindRange","chronoGearUnlock"]`
);

// 2. Replace ENT affinityEffects
src = src.replace(
  `"description":"Equipment durability, resource preservation, decay resistance \u2014 content reserved for entropy perks.","archetype":"Reclaimer / Preserver","affinityEffects":[]`,
  `"description":"Equipment durability, resource preservation, decay resistance \u2014 drives decay-wave actives and salvage perks.","archetype":"Reclaimer / Preserver","affinityEffects":["gearDurabilityBonus","salvageYieldBonus","resourceSpoilageReduction","corrosionResist","decayWaveDamage","armorCorrodePct","entropicShroudResist","repairCostReduction","gearMinDurability","passiveEntropyHeal"]`
);

// 3. Replace GRA affinityEffects
src = src.replace(
  `"description":"Fall damage reduction, zero-G adaptation, spatial force manipulation \u2014 content reserved for gravitic perks.","archetype":"Orbital Specialist","affinityEffects":[]`,
  `"description":"Fall damage reduction, zero-G adaptation, spatial force manipulation \u2014 drives grav-pulse actives and levitation.","archetype":"Orbital Specialist","affinityEffects":["fallDamageReduction","zeroGStability","gravPulseKnockback","levitateDuration","airMoveSpeedBonus","groundHazardImmunity","anchorSlamDamage","anchorPinDuration","wallRunDuration","gravityFieldRadius"]`
);

// 4. Add CHR/ENT/GRA effects to EMBEDDED_EFFECTS (prepend to existing effects array)
const chrEntGraEffects = [
  '{"key":"timeSlowDuration","domain":"chr","label":"Time Slow Duration","kind":"pct"}',
  '{"key":"rewindWindowS","domain":"chr","label":"Rewind Window","kind":"flat"}',
  '{"key":"echoStrikeMult","domain":"chr","label":"Echo Strike Multiplier","kind":"pct"}',
  '{"key":"chronalSicknessResist","domain":"chr","label":"Chronal Sickness Resist","kind":"pct"}',
  '{"key":"causalityShieldHp","domain":"chr","label":"Causality Shield HP","kind":"flat"}',
  '{"key":"temporalDodgeChance","domain":"chr","label":"Temporal Dodge Chance","kind":"pct"}',
  '{"key":"phaseAnchorRadius","domain":"chr","label":"Phase Anchor Radius","kind":"flat"}',
  '{"key":"paradoxDuplicateDuration","domain":"chr","label":"Paradox Duplicate Duration","kind":"flat"}',
  '{"key":"timelineRewindRange","domain":"chr","label":"Timeline Rewind Range","kind":"flat"}',
  '{"key":"chronoGearUnlock","domain":"chr","label":"Chrono Gear Unlock","kind":"flat"}',
  '{"key":"gearDurabilityBonus","domain":"ent","label":"Gear Durability Bonus","kind":"pct"}',
  '{"key":"entSalvageYieldBonus","domain":"ent","label":"Salvage Yield Bonus","kind":"pct"}',
  '{"key":"resourceSpoilageReduction","domain":"ent","label":"Resource Spoilage Reduction","kind":"pct"}',
  '{"key":"corrosionResist","domain":"ent","label":"Corrosion Resist","kind":"pct"}',
  '{"key":"decayWaveDamage","domain":"ent","label":"Decay Wave Damage","kind":"flat"}',
  '{"key":"armorCorrodePct","domain":"ent","label":"Armor Corrode %","kind":"pct"}',
  '{"key":"entropicShroudResist","domain":"ent","label":"Entropic Shroud Resist","kind":"pct"}',
  '{"key":"repairCostReduction","domain":"ent","label":"Repair Cost Reduction","kind":"pct"}',
  '{"key":"gearMinDurability","domain":"ent","label":"Gear Min Durability","kind":"pct"}',
  '{"key":"passiveEntropyHeal","domain":"ent","label":"Passive Entropy Heal","kind":"flat"}',
  '{"key":"fallDamageReduction","domain":"gra","label":"Fall Damage Reduction","kind":"pct"}',
  '{"key":"zeroGStability","domain":"gra","label":"Zero-G Stability","kind":"pct"}',
  '{"key":"gravPulseKnockback","domain":"gra","label":"Grav Pulse Knockback","kind":"flat"}',
  '{"key":"levitateDuration","domain":"gra","label":"Levitate Duration","kind":"flat"}',
  '{"key":"airMoveSpeedBonus","domain":"gra","label":"Air Move Speed Bonus","kind":"pct"}',
  '{"key":"groundHazardImmunity","domain":"gra","label":"Ground Hazard Immunity","kind":"flat"}',
  '{"key":"anchorSlamDamage","domain":"gra","label":"Anchor Slam Damage","kind":"flat"}',
  '{"key":"anchorPinDuration","domain":"gra","label":"Anchor Pin Duration","kind":"flat"}',
  '{"key":"wallRunDuration","domain":"gra","label":"Wall Run Duration","kind":"flat"}',
  '{"key":"gravityFieldRadius","domain":"gra","label":"Gravity Field Radius","kind":"flat"}',
].join(',');

src = src.replace(
  'const EMBEDDED_EFFECTS = {"effects":[{"key":"maxHpBonus"',
  `const EMBEDDED_EFFECTS = {"effects":[${chrEntGraEffects},{"key":"maxHpBonus"`
);

// 5. Update perk section header
src = src.replace(
  'Four parallel trees, one perk point per level (60 total). Every tree has gateway perks that unlock at certain attribute thresholds',
  'Seven perk trees \u2014 four combat archetypes plus three Nexus-stat specializations (CHR, ENT, GRA). Every tree has gateway perks gated by stat thresholds'
);

// 6. Add 3 new perk cards after the Maker card
const newPerkCards = `
      <div class="perk">
        <div class="perk-head">
          <img src="icons/stats/chr.png" alt="" />
          <div>
            <h3>Chrono-Operative</h3>
            <div class="role">Chronal Stability (CHR)</div>
          </div>
        </div>
        <p>Masters of temporal manipulation. Slow time, rewind mistakes, and strike twice from echoes of futures that never happened.</p>
        <ul>
          <li><b>Time Slip</b> \u2014 slow the world to 50% for 4s while you move at full speed.</li>
          <li><b>Rewind</b> \u2014 teleport back to your location 3s ago; restore HP to that point.</li>
          <li><b>Echo Strike</b> <i>(gateway)</i> \u2014 next 3 attacks repeat 1s later for 50% damage.</li>
          <li><b>Eternal Observer</b> \u2014 survive one lethal blow per mission (outside the timeline).</li>
        </ul>
      </div>

      <div class="perk">
        <div class="perk-head">
          <img src="icons/stats/ent.png" alt="" />
          <div>
            <h3>Reclaimer</h3>
            <div class="role">Entropic Resistance (ENT)</div>
          </div>
        </div>
        <p>Entropy benders who turn decay into advantage. Corrode enemy armor, shrug off corrosion, and keep gear running when everyone else\u2019s breaks.</p>
        <ul>
          <li><b>Decay Wave</b> \u2014 cone attack dealing 40 damage; corrodes enemy armor 30% for 6s.</li>
          <li><b>Entropic Shroud</b> \u2014 50% damage resistance and 5 HP/s regen for 6s.</li>
          <li><b>Salvage Burst</b> <i>(gateway)</i> \u2014 instantly repair all equipped gear by 30%.</li>
          <li><b>Eternal Engine</b> \u2014 gear is indestructible; entropy absorption heals 1 HP/s passively.</li>
        </ul>
      </div>

      <div class="perk">
        <div class="perk-head">
          <img src="icons/stats/gra.png" alt="" />
          <div>
            <h3>Orbital Specialist</h3>
            <div class="role">Gravitic Harmony (GRA)</div>
          </div>
        </div>
        <p>Gravity manipulators who push, pin, and float. Immune to fall damage at high tiers, and capable of reversing gravity itself.</p>
        <ul>
          <li><b>Grav Pulse</b> \u2014 push enemies in 6m radius back 5m; 25 damage on contact.</li>
          <li><b>Levitate</b> \u2014 float for 5s, immune to ground hazards, +40% air move speed.</li>
          <li><b>Anchor Slam</b> <i>(gateway)</i> \u2014 pin a target enemy to the ground for 3s; 50 damage.</li>
          <li><b>Event Horizon Body</b> \u2014 micro singularity ability; total fall immunity; gravity reversal field.</li>
        </ul>
      </div>`;

src = src.replace(
  `        </ul>
      </div>

    </div>
  </section>

</main>`,
  `        </ul>
      </div>
${newPerkCards}

    </div>
  </section>

</main>`
);

fs.writeFileSync(FILE, src, 'utf8');
console.log('stats-guide.html patched successfully');
