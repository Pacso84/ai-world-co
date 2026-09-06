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
import { irTesztGuard } from './test-guard.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 🚨 --guard: ÍRJ ŐRSZEM-FÁJLT (2026-09-06). CSAK a CI adja meg.
//
// MIÉRT KELL: 2026-08-31-én a tény-ellenőrző agent kitalált terméknevet írt egy
// élő cikkbe, a `tool-kinds.test.js` el is kapta — de a munkafolyamat nem
// futtatott teszteket, így a teszt ÖT NAPIG pirosan állt, és senki nem hallotta.
// A kilépőkód a CI-nak szól, az őr-fájl a napi Telegram-riportnak: a kettő nem
// helyettesíti egymást (a CI-naplóhoz senki nem nyúl).
//
// MIÉRT KAPCSOLÓRA: a helyi `npm test` így NEM módosítja a `memory/`-t —
// különben minden fejlesztői futás git-ütközést készítene elő a következő
// pull-nál (ugyanaz a szabály, mint a `core/traffic-log.js`-nél).
const IR_GUARD = process.argv.includes('--guard');

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
let osszeomlas = null;

try {
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
} catch (e) {
  // A futtató SAJÁT összeomlása (pl. EMFILE) eddig néma halál lett volna:
  // fájl nélkül a riport nem tudná, hogy egyáltalán próbálkoztunk.
  osszeomlas = String(e?.message || e);
  console.log('\n💥 A TESZT-FUTTATÓ ELSZÁLLT: ' + osszeomlas);
}

console.log('\n' + (failed === 0 && !osszeomlas
  ? '✅ MIND A ' + files.length + ' TESZT RENDBEN'
  : '❌ ' + failed + ' BUKOTT: ' + broken.join(', ')));

// ── ŐRSZEM-JEL A NAPI RIPORTNAK ──────────────────────────────────────
// ⚠️ A KILÉPÉS ELŐTT. Élő lecke a `reel-post.js`-ből (2026-08-30): ott a
// `process.exit(1)` MEGELŐZTE az őrszem-írást, tehát a bukás sosem került a
// guard-fájlba, és a riport hallgatott. A `process.exit()` azonnal megöli a
// folyamatot — ami utána van, az nem létezik.
if (IR_GUARD) {
  irTesztGuard(join(__dirname, '..'), join, { osszes: files.length, bukottak: broken, osszeomlas });
}

process.exit(failed === 0 && !osszeomlas ? 0 : 1);
