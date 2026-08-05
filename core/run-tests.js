// ===================================================================
// TESZT-FUTTATÓ  —  `npm test`
// ===================================================================
//
// Lefuttat MINDEN core/*.test.js fájlt, és összesíti az eredményt.
//
// SZERZŐDÉS: ami itt lefut, az INGYENES és HÁLÓZAT NÉLKÜLI.
// Ha egy teszt valódi API-t hívna, nem `.test.js` a neve — lásd
// core/ai-router.smoke.js (`npm run router-smoke`), ami fizetős
// füst-teszt, és ezért SZÁNDÉKOSAN kimarad innen.
//
// Miért külön: 2026-08-05-ig az ai-router füst-teszt `.test.js`-re
// végződött, így belekerült minden "futtasd a teszteket" körbe.
// Futásonként ~$0.0005-t költött, és beleírt a core/budget-state.json
// éles költség-nyilvántartásba — ami git-ütközést okozott a következő
// `git pull`-nál. A kár nem ott jelentkezett, ahol keletkezett.
// ===================================================================

import { readdirSync } from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const files = readdirSync(__dirname)
  .filter(f => f.endsWith('.test.js'))
  .sort();

console.log('🧪 TESZTEK — ' + files.length + ' fájl (ingyenes, hálózat nélkül)\n');

let failed = 0;
const broken = [];

for (const f of files) {
  const r = spawnSync(process.execPath, [join(__dirname, f)], { encoding: 'utf-8' });
  if (r.status === 0) {
    console.log('  ✅ ' + f);
  } else {
    failed++;
    broken.push(f);
    console.log('  ❌ ' + f);
    // Csak a lényeg: az utolsó pár sor mondja meg, mi bukott.
    const out = ((r.stderr || '') + (r.stdout || '')).trim().split(/\r?\n/);
    for (const line of out.slice(-6)) console.log('       ' + line);
  }
}

console.log('\n' + (failed === 0
  ? '✅ MIND A ' + files.length + ' TESZT RENDBEN'
  : '❌ ' + failed + ' BUKOTT: ' + broken.join(', ')));

process.exit(failed === 0 ? 0 : 1);
