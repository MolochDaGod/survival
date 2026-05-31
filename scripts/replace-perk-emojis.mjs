import fs from 'fs';
const FILE = 'F:/GitHub/survival/artifacts/arpg-game/src/game/progression/StatPerkChoices.ts';
let src = fs.readFileSync(FILE, 'utf8');

const replacements = [
  // BIO
  ["icon: '\uD83D\uDC89'", "icon: '/icons/genetics/Icon11_08.png'"],
  ["icon: '\u2623\uFE0F'", "icon: '/icons/genetics/Icon11_05.png'"],
  // BIO cellular lockdown (shield emoji, unique context)
  ["icon: '\uD83D\uDEE1\uFE0F', kind: 'self_buff', cooldownS: 35", "icon: '/icons/genetics/Icon11_10.png', kind: 'self_buff', cooldownS: 35"],
  // NEU
  ["icon: '\uD83E\uDDE0'", "icon: '/icons/genetics/Icon11_03.png'"],
  ["icon: '\u26A1', kind: 'self_buff'", "icon: '/icons/genetics/Icon11_16.png', kind: 'self_buff'"],
  ["icon: '\uD83D\uDD35'", "icon: '/icons/genetics/Icon11_23.png'"],
  // KIN
  ["icon: '\uD83C\uDFC3'", "icon: '/icons/cyberpunk-weapons/Icon1_05.png'"],
  ["icon: '\uD83D\uDCA5'", "icon: '/icons/cyberpunk-weapons/Icon1_01.png'"],
  ["icon: '\uD83C\uDF00', kind: 'self_buff'", "icon: '/icons/cyberpunk-artifacts/Icon22_09.png', kind: 'self_buff'"],
  // QNT
  ["icon: '\uD83E\uDDE8'", "icon: '/icons/cyberpunk-weapons/Icon1_06.png'"],
  ["icon: '\uD83D\uDC7B'", "icon: '/icons/genetics/Icon11_30.png'"],
  ["icon: '\uD83E\uDEE7'", "icon: '/icons/genetics/Icon11_19.png'"],
  // SYN
  ["icon: '\uD83E\uDD16'", "icon: '/icons/genetics/Icon11_17.png'"],
  ["icon: '\uD83D\uDCE1'", "icon: '/icons/cyberpunk-weapons/Icon1_07.png'"],
  ["icon: '\uD83D\uDD79\uFE0F'", "icon: '/icons/genetics/Icon11_21.png'"],
  // CHR
  ["icon: '\u231B'", "icon: '/icons/cyberpunk-artifacts/Icon22_07.png'"],
  ["icon: '\u23EA'", "icon: '/icons/genetics/Icon11_35.png'"],
  ["icon: '\uD83D\uDD04'", "icon: '/icons/genetics/Icon11_14.png'"],
  // ENT
  ["icon: '\uD83C\uDF0C'", "icon: '/icons/cyberpunk-artifacts/Icon22_12.png'"],
  ["icon: '\u2693'", "icon: '/icons/cyberpunk-artifacts/Icon22_13.png'"],
  ["icon: '\uD83D\uDC80'", "icon: '/icons/genetics/Icon11_02.png'"],
  // GRA
  ["icon: '\uD83E\uDD73'", "icon: '/icons/cyberpunk-artifacts/Icon22_11.png'"],
  ["icon: '\uD83E\uDE82'", "icon: '/icons/genetics/Icon11_04.png'"],
  ["icon: '\u26AB'", "icon: '/icons/cyberpunk-artifacts/Icon22_14.png'"],
  // Passives — common emojis
  ["icon: '\uD83D\uDC9A'", "icon: '/icons/genetics/Icon11_25.png'"],
  ["icon: '\uD83E\uDDAE'", "icon: '/icons/genetics/Icon11_26.png'"],
  ["icon: '\uD83D\uDC9B'", "icon: '/icons/genetics/Icon11_27.png'"],
  ["icon: '\uD83D\uDCA0'", "icon: '/icons/genetics/Icon11_28.png'"],
  ["icon: '\uD83D\uDD39'", "icon: '/icons/genetics/Icon11_29.png'"],
  ["icon: '\uD83D\uDFE2'", "icon: '/icons/genetics/Icon11_31.png'"],
  ["icon: '\uD83D\uDFE1'", "icon: '/icons/genetics/Icon11_32.png'"],
  ["icon: '\uD83D\uDFE3'", "icon: '/icons/genetics/Icon11_33.png'"],
  ["icon: '\uD83D\uDD36'", "icon: '/icons/genetics/Icon11_34.png'"],
  ["icon: '\uD83D\uDD37'", "icon: '/icons/genetics/Icon11_36.png'"],
  ["icon: '\u2B50'", "icon: '/icons/genetics/Icon11_37.png'"],
  ["icon: '\uD83D\uDCA7'", "icon: '/icons/genetics/Icon11_38.png'"],
  ["icon: '\uD83D\uDD25'", "icon: '/icons/genetics/Icon11_39.png'"],
  ["icon: '\u2744\uFE0F'", "icon: '/icons/genetics/Icon11_40.png'"],
  ["icon: '\uD83C\uDF29\uFE0F'", "icon: '/icons/cyberpunk-artifacts/Icon22_16.png'"],
  ["icon: '\uD83D\uDEE1\uFE0F'", "icon: '/icons/cyberpunk-artifacts/Icon22_17.png'"],
  ["icon: '\uD83C\uDF0A'", "icon: '/icons/genetics/Icon11_06.png'"],
  ["icon: '\u26A1'", "icon: '/icons/cyberpunk-artifacts/Icon22_18.png'"],
  ["icon: '\uD83C\uDF00'", "icon: '/icons/cyberpunk-artifacts/Icon22_19.png'"],
  ["icon: '\uD83D\uDC99'", "icon: '/icons/genetics/Icon11_07.png'"],
  ["icon: '\uD83D\uDD2E'", "icon: '/icons/genetics/Icon11_12.png'"],
  ["icon: '\uD83E\uDDEC'", "icon: '/icons/genetics/Icon11_13.png'"],
  ["icon: '\uD83E\uDDE9'", "icon: '/icons/genetics/Icon11_18.png'"],
  ["icon: '\uD83E\uDE78'", "icon: '/icons/genetics/Icon11_24.png'"],
];

let count = 0;
for (const [from, to] of replacements) {
  if (src.includes(from)) {
    src = src.replaceAll(from, to);
    count++;
  }
}

fs.writeFileSync(FILE, src, 'utf8');
console.log(`Replaced ${count} emoji icon patterns in StatPerkChoices.ts`);
