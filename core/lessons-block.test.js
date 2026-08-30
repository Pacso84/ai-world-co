// ===================================================================
// TANULSÁG-BLOKK TESZT — futtatás: node core/lessons-block.test.js
// Nem hív API-t. ⚠️ 2026-08-29-ig az ÉLES memory/store.json-t írta, és csak
// mentés-visszaállítással védekezett — párhuzamos futásnál ez okozta a
// megfigyelt ingadozó bukást. Mostantól saját, ideiglenes táron dolgozik
// (MEMORY_STORE_PATH), tehát az élessel EGYÁLTALÁN nem találkozik.
// ===================================================================
import { strict as assert } from 'assert';
import { readFileSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ELES = join(__dirname, '..', 'memory', 'store.json');
const ELES_ELOTTE = readFileSync(ELES, 'utf-8');

// Saját tár — az élest meg sem nyitjuk íráshoz.
const MUNKA = join(tmpdir(), 'aiworld-lessons-teszt-' + process.pid);
mkdirSync(MUNKA, { recursive: true });
process.env.MEMORY_STORE_PATH = join(MUNKA, 'store.json');

// ⚠️ A MODULT CSAK AZ ENV BEÁLLÍTÁSA UTÁN töltjük be: a STORE_PATH a modul
// betöltésekor dől el. Az első változatom feljebb importált, és emiatt MÉGIS
// az éles tárba írt — a lenti záró ellenőrzés fogta meg.
const { remember, lessonsBlock } = await import('./memory-manager.js');
const STORE = process.env.MEMORY_STORE_PATH;

try {
  remember('shared', 'ZZTESZT-közös: a csempe mindig a legrövidebb hivatalos terméknév');
  remember('zzteszt-agent', 'ZZTESZT-saját: a fordításban a title sosem tükörfordítás');

  // A shared scope-ban ÉLES tanulságok versenyeznek a helyekért (salience) —
  // ezért a konkrét teszt-szöveg helyett a BLOKK-SZERKEZETET ellenőrizzük.
  const block = lessonsBlock('zzteszt-agent');
  assert.ok(block.includes('[cég]'), 'közös (shared) lecke-sor van a blokkban');
  assert.ok(block.includes('ZZTESZT-saját'), 'saját scope lecke benne van');
  assert.ok(block.length < 1600, 'token-sapka tartva');

  // iro/guide: a saját leckéiket maguk töltik (szemantikus) — ide csak a shared jár
  const iroBlock = lessonsBlock('iro');
  assert.ok(!iroBlock.includes('ZZTESZT-saját'), 'iro nem kapja más agent leckéit');
  assert.ok(iroBlock.includes('[cég]') && !iroBlock.includes('[saját]'), 'iro csak közös leckéket kap');

  assert.equal(lessonsBlock(''), '', 'agentName nélkül üres');

  // ISMÉTLÉS-SZÁMLÁLÓ (2026-07-19): ugyanaz a stabil hiba-szöveg újra-remember-elve
  // = a hiba megismétlődött → repeats nő, lastRepeat mai. (Első íráskor NINCS repeats.)
  remember('zzteszt-agent', 'ZZTESZT-ismétlés: ugyanaz a hiba stabil szöveggel.');
  remember('zzteszt-agent', 'ZZTESZT-ismétlés: ugyanaz a hiba stabil szöveggel.');
  const st = JSON.parse(readFileSync(STORE, 'utf-8'));
  const it = st.items.find(i => i.scope === 'zzteszt-agent' && /ZZTESZT-ismétlés/.test(i.text));
  assert.equal(it.repeats, 1, 'második előfordulás = 1 ismétlés');
  assert.ok((it.lastRepeat || '').startsWith(new Date().toISOString().slice(0, 10)), 'lastRepeat mai');
  const first = st.items.find(i => /ZZTESZT-saját/.test(i.text));
  assert.equal(first.repeats, undefined, 'első írásnál nincs repeats mező');

  console.log('✅ lessons-block.test: minden átment');
} finally {
  try { rmSync(MUNKA, { recursive: true, force: true }); } catch { /* */ }
  if (readFileSync(ELES, 'utf-8') !== ELES_ELOTTE) {
    console.log('🔴 A TESZT BELEÍRT AZ ÉLES MEMÓRIATÁRBA!'); process.exit(1);
  }
}
