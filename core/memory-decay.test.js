// ===================================================================
// TESZT — a memória halványulása (decay)
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// MIÉRT VAN EZ A FÁJL (2026-08-29, hibavadászat): a `decay()` egyetlen
// hívója az `agents/analyst/agent.js` volt, azt viszont 2026-07-30-án
// KIVEZETTÜK. Azóta a salience SOHA nem csökkent: élesben mérve
// **556 emlék, MIND 1.000-en, MIND „hot"**. A `lessonsBlock()` a
// salience-rendezésből dolgozik — csupa döntetlen, tehát a stabil rendezés
// a BESZÚRÁSI SORREND első négyét adja vissza. Hat hete minden AI-hívás
// ugyanazt a négy, 2026-07-13/14-i leckét kapta, és a 119 megosztott
// leckéből 115 SOHA nem jutott promptba.
//
// ⚠️ A `decay()` NEM frissíti a `lastAccessed`-et, és a levonás
// `DECAY_PER_DAY * daysSince(lastAccessed)` — vagyis EGY NAPON BELÜL
// TÖBBSZÖR hívva TÖBBSZÖRÖSEN von le. A CI naponta háromszor fut, tehát a
// napi kapu nem kényelem, hanem helyességi feltétel.
//
// ⚠️ A VALÓDI `memory/store.json`-t ez a teszt NEM ÉRINTI: a modul
// `MEMORY_STORE_PATH` környezeti változóval ideiglenes útra állítható.
// (A régi `lessons-block.test.js` az éles fájlt mentette-állította vissza —
// párhuzamos futásnál ez okozta a megfigyelt ingadozást.)
// ===================================================================

import assert from 'assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ELES_STORE = join(__dirname, '..', 'memory', 'store.json');
const ELES_ELOTTE = existsSync(ELES_STORE) ? readFileSync(ELES_STORE, 'utf-8') : null;

const MUNKA = join(tmpdir(), 'aiworld-decay-teszt-' + process.pid);
mkdirSync(MUNKA, { recursive: true });
const TESZT_STORE = join(MUNKA, 'store.json');
process.env.MEMORY_STORE_PATH = TESZT_STORE;

const { decay, lessonsBlock } = await import('./memory-manager.js');

let pass = 0, bukott = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log('  ✅ ' + name); }
  catch (e) { bukott++; console.log('  ❌ ' + name + '\n     ' + String(e.message).split('\n')[0]); }
};

const napokkalEzelott = n => new Date(Date.now() - n * 86400e3).toISOString();

/** Az ÉLES állapot mása: minden emlék 1.000-en, „hot"-ban. */
function tarBeallit(items) {
  writeFileSync(TESZT_STORE, JSON.stringify({ _meta: {}, items }, null, 2), 'utf-8');
}
const olvas = () => JSON.parse(readFileSync(TESZT_STORE, 'utf-8'));

const emlek = (id, napja, text) => ({
  id, text, scope: 'shared', salience: 1, tier: 'hot',
  createdAt: napokkalEzelott(napja), lastAccessed: napokkalEzelott(napja), repeats: 0
});

console.log('🧪 memória-halványulás\n');

t('A VALÓDI ÁLLAPOT: minden emlék 1.000-en → a régiek lehűlnek', () => {
  // Élesben mérve: 556 emlék, mind salience 1, mind hot.
  tarBeallit([
    emlek('regi-1', 47, 'egy 2026-07-13-i lecke'),
    emlek('regi-2', 46, 'egy másik régi lecke'),
    emlek('friss', 1, 'egy tegnapi lecke')
  ]);
  const r = decay();
  const s = olvas();
  const byId = Object.fromEntries(s.items.map(i => [i.id, i]));

  // 47 nap × 0,04 = 1,88 → a padlóra (0,05) esik, tehát „cold"
  assert.equal(byId['regi-1'].tier, 'cold', 'a 47 napja nem használt lecke HOT maradt');
  // 1 nap × 0,04 = 0,04 → 0,96, marad hot
  assert.equal(byId['friss'].tier, 'hot', 'a tegnapi lecke lehűlt');
  assert.ok(r.moved >= 2, 'a jelentés szerint semmi nem mozdult: ' + JSON.stringify(r));
});

t('🔑 A USER-LÁTHATÓ HATÁS: a promptba MÁS lecke kerül', () => {
  // Ez a lényeg. Döntetlen salience-nél a beszúrási sorrend dönt, tehát a
  // legrégebbi négy ragadt be — hat hétre.
  // ⚠️ A blokk NÉGY megosztott leckét kér (`list({limit:4})`), ezért a minta
  // 4 régi + 4 friss. Az első változatom 4 régi + 2 frisset használt — ott két
  // régi SZÜKSÉGSZERŰEN befért, és a teszt a saját mintája miatt bukott, nem a
  // kód miatt. (A mérőeszközt a mérendő dologhoz kell szabni.)
  tarBeallit([
    emlek('regi-1', 47, 'REGI-A'), emlek('regi-2', 47, 'REGI-B'),
    emlek('regi-3', 47, 'REGI-C'), emlek('regi-4', 47, 'REGI-D'),
    emlek('uj-1', 1, 'UJ-A'), emlek('uj-2', 1, 'UJ-B'),
    emlek('uj-3', 1, 'UJ-C'), emlek('uj-4', 1, 'UJ-D')
  ]);
  const elotte = lessonsBlock('iro');
  assert.ok(elotte.includes('REGI-A'), 'a kiinduló állapot nem a várt — döntetlennél a beszúrási sorrend dönt');

  decay();
  const utana = lessonsBlock('iro');
  for (const uj of ['UJ-A', 'UJ-B', 'UJ-C', 'UJ-D']) {
    assert.ok(utana.includes(uj), 'a friss lecke NEM került be: ' + uj);
  }
  for (const regi of ['REGI-A', 'REGI-B', 'REGI-C', 'REGI-D']) {
    assert.ok(!utana.includes(regi), 'a 47 napos lecke MÉG MINDIG a promptban van: ' + regi);
  }
});

t('⚠️ NAPI KAPU: egy napon belül a második hívás NEM von le újra', () => {
  // A CI naponta HÁROMSZOR fut. A `decay()` nem frissíti a lastAccessed-et,
  // tehát kapu nélkül háromszoros ütemben halványítana.
  tarBeallit([emlek('a', 5, 'öt napja')]);          // 5 × 0,04 = 0,2 → 0,8
  decay();
  const elso = olvas().items[0].salience;
  assert.ok(Math.abs(elso - 0.8) < 1e-9, 'az első halványulás nem a várt: ' + elso);

  const masodik = decay();
  assert.equal(olvas().items[0].salience, elso, 'ugyanaznap MÁSODSZOR is levont');
  assert.ok(masodik.skipped, 'nem jelezte, hogy kihagyta: ' + JSON.stringify(masodik));
});

t('…de MÁSNAP újra halványít', () => {
  tarBeallit([emlek('a', 5, 'öt napja')]);
  decay();
  const s = olvas();
  s.lastDecay = '2020-01-01';                        // mintha tegnap futott volna
  writeFileSync(TESZT_STORE, JSON.stringify(s, null, 2), 'utf-8');
  const r = decay();
  assert.ok(!r.skipped, 'másnap is kihagyta');
  assert.ok(olvas().items[0].salience < 0.8, 'másnap nem halványított');
});

t('a salience SOHA nem megy a padló alá', () => {
  tarBeallit([emlek('nagyon-regi', 400, 'ősrégi')]);
  decay();
  assert.equal(olvas().items[0].salience, 0.05, 'átment a 0,05-ös padlón');
});

t('üres tárra és hibás elemre sem borul', () => {
  tarBeallit([]);
  assert.doesNotThrow(() => decay());
  tarBeallit([{ id: 'x' }]);                          // hiányzó mezők
  assert.doesNotThrow(() => decay());
});

// ── A LEGFONTOSABB ZÁRÓ ELLENŐRZÉS ─────────────────────────────────
t('🔒 az ÉLES memory/store.json ÉRINTETLEN maradt', () => {
  const most = existsSync(ELES_STORE) ? readFileSync(ELES_STORE, 'utf-8') : null;
  assert.equal(most, ELES_ELOTTE, '🔴 A TESZT BELEÍRT AZ ÉLES MEMÓRIATÁRBA!');
});

try { rmSync(MUNKA, { recursive: true, force: true }); } catch { /* */ }
console.log(`\n${bukott === 0 ? '✅' : '❌'} memory-decay.test: ${pass} rendben, ${bukott} bukott`);
process.exit(bukott === 0 ? 0 : 1);
