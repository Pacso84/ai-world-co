// ===================================================================
// TESZT — cikkhossz: a szabály EGY helyen éljen, és mindkét irányba őrizzen
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// MIÉRT (2026-08-16, mérve): a hosszúság-előírás TÍZ élő helyen szerepelt, KÉT
// különböző értékkel (700-1100 és 700-1200), és a rendszer egyiket sem tartotta:
// a "How to" cikkek 95%-a a felső határ fölött volt, medián 1475 szó.
//
// Az ok nem az író volt: ugyanaz a szabálygyűjtemény kért 700-1200 szót ÉS 5-7
// perc olvasást (= 1000-1400 szó). A két cél nem fér össze; az író az olvasási
// időt teljesítette. És senki nem vette észre, mert A KAPU CSAK LEFELÉ ŐRZÖTT.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  lengthIssue, readingMinutes, HOWTO_MIN, HOWTO_MAX,
  GATE_MIN, GATE_MAX, HOWTO_RANGE, WORDS_PER_MINUTE
} from './article-length.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

console.log('🧪 cikkhossz\n');

t('a túl rövidet jelzi', () => {
  const r = lengthIssue(GATE_MIN - 50);
  assert.equal(r.code, 'TOO_THIN');
});

t('⚠️ a túl HOSSZÚT is jelzi — ez hiányzott', () => {
  // Ez a lelet lényege: eddig csak lefelé őriztünk, és a cikkek 95%-a
  // észrevétlenül a felső határ fölé csúszott.
  const r = lengthIssue(GATE_MAX + 100);
  assert.equal(r.code, 'TOO_LONG');
  assert.ok(r.minutes > 8, 'a perc is kijön, hogy érthető legyen a kifogás');
});

t('a tartományon belül csendes', () => {
  assert.equal(lengthIssue(HOWTO_MIN), null);
  assert.equal(lengthIssue(HOWTO_MAX), null);
  assert.equal(lengthIssue(GATE_MIN), null);
  assert.equal(lengthIssue(GATE_MAX), null);
});

t('értelmezhetetlen bemenetre NEM állítunk semmit', () => {
  assert.equal(lengthIssue(0), null);
  assert.equal(lengthIssue(-5), null);
  assert.equal(lengthIssue(null), null);
  assert.equal(lengthIssue('sok'), null);
  assert.equal(lengthIssue(), null);
});

t('a kapu LAZÁBB, mint a cél', () => {
  // Szándékos, a meglévő minta szerint: a cél az írónak szól, a kapu csak a
  // kirívót fogja. Ha a kapu a célon lenne, minden apró eltérés zajt csinálna.
  assert.ok(GATE_MIN < HOWTO_MIN, 'lefelé van tűrés');
  assert.ok(GATE_MAX > HOWTO_MAX, 'felfelé is van tűrés');
});

t('a szószám és az olvasási idő NEM mondhat ellent egymásnak', () => {
  // EZ A LELET MAGVA. A régi szabály 700-1200 szót kért ÉS 5-7 percet —
  // de 700 szó 3,5 perc. A két cél összeegyeztethetetlen volt, és az író
  // az olvasási időt választotta. Ez a teszt őrzi, hogy ne térhessenek szét.
  assert.equal(Math.round(readingMinutes(HOWTO_MIN)), 5, 'az alsó határ ≈5 perc');
  assert.equal(Math.round(readingMinutes(HOWTO_MAX)), 7, 'a felső határ ≈7 perc');
  assert.equal(readingMinutes(WORDS_PER_MINUTE), 1);
  assert.equal(readingMinutes(0), 0);

  // A guide-quality-rules.md read_time_minutes előírása ugyanez legyen.
  const doc = readFileSync(join(ROOT, 'shared', 'guide-quality-rules.md'), 'utf-8');
  assert.ok(/read_time_minutes.*5.{0,3}7/s.test(doc),
    'a dokumentum 5-7 percet ír elő — ha ezt átírod, a szószámot is át kell');
});

// A LÉNYEGI VÉDELEM. 2026-08-16-ig a tartomány tíz helyen szerepelt kézzel, KÉT
// különböző értékkel. A két fájltípust MÁSKÉNT kell védeni:
//   • PROMPT (.js) → gépnek megy, ott a konstans a helyes: szám TILOS
//   • DOKUMENTUM (.md) → embernek szól, ott a szám KELL — de EGYEZZEN
// Csak a "How to" tartományt nézzük; a 400-700 (hír) és a 450-800 (történeti
// utalás) más szabály, azokhoz nincs közünk.
const TARTOMANY = /\b(\d{3,4})\s*[-–]\s*(\d{3,4})\s+(?:words|szó)\b/gi;
const howtoJeloltE = (a, b) => a >= 600 && b >= 1000;

t('🔒 a PROMPTOKBAN nincs kézzel beírt tartomány', () => {
  const talalat = [];
  for (const f of ['agents/iro/agent.js', 'agents/guide/agent.js',
    'agents/iro/upgrade-howtos.js', 'agents/ellenorzo/agent.js']) {
    let s; try { s = readFileSync(join(ROOT, f), 'utf-8'); } catch { continue; }
    for (const m of s.matchAll(TARTOMANY)) {
      if (howtoJeloltE(+m[1], +m[2])) talalat.push(f + ': "' + m[0] + '"');
    }
  }
  assert.deepEqual(talalat, [],
    'promptban a HOWTO_RANGE konstans használandó, nem konkrét szám');
});

t('🔒 a DOKUMENTUMOKBAN a szám EGYEZIK a konstanssal', () => {
  // A dokumentum embereknek szól, ott kell a konkrét szám — de ha valaki
  // átírja a konstanst és a dokumentumot nem (vagy fordítva), ez elbukik.
  let vizsgalt = 0;
  for (const f of ['shared/style-guide.md', 'shared/guide-quality-rules.md']) {
    let s; try { s = readFileSync(join(ROOT, f), 'utf-8'); } catch { continue; }
    for (const m of s.matchAll(TARTOMANY)) {
      if (!howtoJeloltE(+m[1], +m[2])) continue;
      vizsgalt++;
      assert.equal(+m[1], HOWTO_MIN, f + ': az alsó határ nem egyezik a konstanssal');
      assert.equal(+m[2], HOWTO_MAX, f + ': a felső határ nem egyezik a konstanssal');
    }
  }
  assert.ok(vizsgalt >= 1, 'legalább egy dokumentum kimondja a tartományt — ne tűnjön el');
});

t('a promptba illeszthető szöveg ép', () => {
  assert.equal(HOWTO_RANGE, HOWTO_MIN + '-' + HOWTO_MAX);
  assert.ok(/^\d+-\d+$/.test(HOWTO_RANGE), 'sima "min-max" alak, prompt-barát');
});

console.log('\n✅ article-length.test: mind a ' + pass + ' eset rendben');
