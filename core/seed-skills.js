// ===================================================================
// SEED-SKILLS — alap készségek betöltése a skills.json-ba
// ===================================================================
// A skills/default-skills.json részletes, agentenkénti alap-készségeket
// tartalmaz. Ez a script betölti őket az ÉLŐ skills/skills.json-ba, de
// CSAK a hiányzókat — a már meglévő (kézzel módosított) készségeket
// érintetlenül hagyja. Bármikor újrafuttatható (új default felvétele után).
//
// FUTTATÁS:  node core/seed-skills.js
// ===================================================================

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { seedDefaults, listSkills } from './skills.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULTS_PATH = join(__dirname, '..', 'skills', 'default-skills.json');

function main() {
  if (!existsSync(DEFAULTS_PATH)) {
    console.error('❌ Nincs skills/default-skills.json');
    process.exit(1);
  }
  const defaults = JSON.parse(readFileSync(DEFAULTS_PATH, 'utf-8')).skills || [];
  console.log('🌱 SEED-SKILLS — alap készségek betöltése');
  console.log('─'.repeat(60));
  const added = seedDefaults(defaults);
  console.log(`✅ ${added} új alap-készség betöltve (a meglévőket nem írtuk felül).`);

  // Áttekintés agentenként
  const byScope = {};
  for (const k of listSkills()) byScope[k.scope] = (byScope[k.scope] || 0) + 1;
  console.log('\n📋 Készségek scope szerint:');
  for (const [scope, n] of Object.entries(byScope).sort()) console.log(`   ${scope.padEnd(14)} ${n}`);
  console.log(`\n💡 Szerkeszthető: skills/skills.json (élő) vagy skills/default-skills.json (alap, majd újra-seed).`);
}

main();
