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

// ⚠️ A WORKER TESZTJEI IS IDE TARTOZNAK (2026-08-28, független átnézés
// találta): a `telegram-worker/test/` fájljai ingyenesek és hálózat nélküliek
// — de EDDIG SEHOL NEM FUTOTTAK. Sem az `npm test` nem vitte őket (ez a
// futtató csak a `core/`-t olvasta), sem a CI. Egy teszt, amit senki nem
// futtat, pontosan annyit ér, mint egy őrszem, ami a CI-naplóba ír.
const WORKER_TESZT = join(__dirname, '..', 'telegram-worker', 'test');

const beolvas = (dir, cimke) => {
  try {
    return readdirSync(dir).filter(f => f.endsWith('.test.js')).sort()
      .map(f => ({ nev: cimke + f, ut: join(dir, f) }));
  } catch { return []; }   // a mappa hiánya nem hiba
};

const files = [...beolvas(__dirname, ''), ...beolvas(WORKER_TESZT, 'telegram-worker/test/')];

console.log('🧪 TESZTEK — ' + files.length + ' fájl (ingyenes, hálózat nélkül)\n');

let failed = 0;
const broken = [];

for (const f of files) {
  const r = spawnSync(process.execPath, [f.ut], { encoding: 'utf-8' });
  if (r.status === 0) {
    console.log('  ✅ ' + f.nev);
  } else {
    failed++;
    broken.push(f.nev);
    console.log('  ❌ ' + f.nev);
    // Csak a lényeg: az utolsó pár sor mondja meg, mi bukott.
    const out = ((r.stderr || '') + (r.stdout || '')).trim().split(/\r?\n/);
    for (const line of out.slice(-6)) console.log('       ' + line);
  }
}

console.log('\n' + (failed === 0
  ? '✅ MIND A ' + files.length + ' TESZT RENDBEN'
  : '❌ ' + failed + ' BUKOTT: ' + broken.join(', ')));

process.exit(failed === 0 ? 0 : 1);
