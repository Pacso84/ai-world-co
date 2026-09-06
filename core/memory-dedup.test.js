// ===================================================================
// TESZT — a lecke-deduplikáció STABIL KULCCSAL
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// MIÉRT VAN EZ A FÁJL (2026-08-29, hibavadászat): a `remember()` a
// `scope + PONTOS SZÖVEG` páron deduplikál. Ha a lecke szövegébe VÁLTOZÓ
// adat kerül (napi darabszám, példa-slug), akkor minden hívás ÚJ emléket
// gyárt a meglévő megerősítése helyett. Élesben mérve a `memory/store.json`-ban:
//
//     12 db · 0 repeats · „Csempe-szabály emlékeztető: … (ma 2 javítás…"
//     11 db · 0 repeats · „Avoid stating (may be removed/false): The …"
//
// A memória tehát HÍZOTT a helyett, hogy ERŐSÖDÖTT volna — és a napi riport
// ♻️ „ismétlődő hiba" sora ezekre SOHA nem tüzelt, pedig pont ezek ismétlődtek.
// A `CLAUDE.md` maga is óv ettől („adj neki ÁLLANDÓ lecke-szöveget… egy
// cikkenként változó szám minden alkalommal ÚJ emléket hozna létre").
//
// A MEGOLDÁS NEM fuzzy hasonlítás — a repó tanulsága szerint a mintaillesztés
// magabiztosan téved. Helyette EXPLICIT, stabil kulcs: a hívó megmondja, hogy
// „ez ugyanaz a lecke, csak friss részlettel".
//
// ⚠️ A VALÓDI memory/store.json-t ez a teszt NEM ÉRINTI (MEMORY_STORE_PATH).
// ===================================================================

import assert from 'assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ELES = join(__dirname, '..', 'memory', 'store.json');
const ELES_ELOTTE = existsSync(ELES) ? readFileSync(ELES, 'utf-8') : null;

const MUNKA = join(tmpdir(), 'aiworld-dedup-teszt-' + process.pid);
mkdirSync(MUNKA, { recursive: true });
const TESZT_STORE = join(MUNKA, 'store.json');
process.env.MEMORY_STORE_PATH = TESZT_STORE;

// ⚠️ CSAK az env beállítása UTÁN — a STORE_PATH a modul betöltésekor dől el.
const { remember, list } = await import('./memory-manager.js');

let pass = 0, bukott = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log('  ✅ ' + name); }
  catch (e) { bukott++; console.log('  ❌ ' + name + '\n     ' + String(e.message).split('\n')[0]); }
};

const urit = () => writeFileSync(TESZT_STORE, JSON.stringify({ _meta: {}, items: [] }, null, 2), 'utf-8');
const tar = () => JSON.parse(readFileSync(TESZT_STORE, 'utf-8'));
const csempeLecke = n => `Csempe-szabály emlékeztető: a tool mindig a legrövidebb hivatalos terméknév (ma ${n} javítás kellett, pl. cikk-${n}).`;

console.log('🧪 lecke-deduplikáció\n');

t('A VALÓDI HIBA: változó szám → 12 külön emlék, 0 megerősítés', () => {
  // Ez a jelenlegi, kulcs NÉLKÜLI viselkedés — szándékosan rögzítjük, mert
  // ez a kiindulópont, és kulcs nélkül ez helyes is (más szöveg = más lecke).
  urit();
  for (let i = 1; i <= 12; i++) remember('shared', csempeLecke(i));
  const s = tar();
  assert.equal(s.items.length, 12, 'nem a mért valóságot reprodukálja');
  assert.equal(s.items.reduce((a, i) => a + (i.repeats || 0), 0), 0, 'lett volna megerősítés');
});

t('🔑 STABIL KULCCSAL: EGY emlék marad, és NŐ a megerősítés', () => {
  urit();
  for (let i = 1; i <= 12; i++) remember('shared', csempeLecke(i), { kulcs: 'csempe-szabaly' });
  const s = tar();
  assert.equal(s.items.length, 1, 'nem egy emlék lett: ' + s.items.length);
  assert.equal(s.items[0].repeats, 11, 'a megerősítés-szám nem a várt: ' + s.items[0].repeats);
  assert.equal(s.items[0].kulcs, 'csempe-szabaly', 'a kulcs nem tárolódott');
});

t('a szöveg a LEGFRISSEBB példát mutatja', () => {
  // A lecke lényege állandó, a példa viszont frissüljön — különben a promptba
  // egy hetekkel ezelőtti eset kerülne.
  urit();
  remember('shared', csempeLecke(1), { kulcs: 'csempe-szabaly' });
  remember('shared', csempeLecke(7), { kulcs: 'csempe-szabaly' });
  assert.ok(tar().items[0].text.includes('ma 7 javítás'), 'a szöveg nem frissült: ' + tar().items[0].text);
});

t('KÜLÖNBÖZŐ kulcs = külön lecke', () => {
  urit();
  remember('shared', 'A', { kulcs: 'egyik' });
  remember('shared', 'B', { kulcs: 'masik' });
  assert.equal(tar().items.length, 2);
});

t('a scope továbbra is elválaszt', () => {
  urit();
  remember('shared', 'X', { kulcs: 'k' });
  remember('iro', 'X', { kulcs: 'k' });
  assert.equal(tar().items.length, 2, 'a kulcs átvágta a scope-határt');
});

t('KULCS NÉLKÜL a régi viselkedés VÁLTOZATLAN', () => {
  // Ez a legfontosabb visszalépés-védelem: 60+ hívóhely használja kulcs nélkül.
  urit();
  remember('shared', 'ugyanaz a szöveg');
  remember('shared', 'ugyanaz a szöveg');
  remember('shared', 'másik szöveg');
  const s = tar();
  assert.equal(s.items.length, 2);
  assert.equal(s.items.find(i => i.text === 'ugyanaz a szöveg').repeats, 1, 'a pontos-szöveg dedup elromlott');
});

t('♻️ RUTIN öntisztítás NEM „ismétlődő hiba" — a saját regresszióm', () => {
  // 2026-08-30, független átnézés találta. A stabil kulcs miatt a
  // quality-guard napi öntisztítása mostantól a MEGLÉVŐ emléket erősíti —
  // ami helyes —, DE ezzel `repeats`-et és `lastRepeat`-et is állít. A napi
  // riport ♻️ sora minden mai `lastRepeat`-re tüzel, és mérve ezt adta:
  //   „♻️ Ismétlődő hiba: 1 típus ma (… 2× 1 nap alatt) — ez sűrű, KEMÉNY
  //    SZABÁLY KELLHET!"
  // 🔑 A sürgetés itt HAMIS: a kemény szabály MÁR LÉTEZIK (a determinisztikus
  // `quality-guard --fix`). A `repeats` jelentése „a lecke ELLENÉRE megint
  // megtörtént" — a rutin, automatikusan javított eset nem ilyen.
  // A `quality-fix-log` szerint ez a nap ~32%-án előfordul: napi zaj lett
  // volna abból a sorból, amit épp NEM szűr a zajszűrő.
  urit();
  remember('shared', csempeLecke(1), { kulcs: 'csempe-szabaly', rutin: true });
  remember('shared', csempeLecke(4), { kulcs: 'csempe-szabaly', rutin: true });
  const it = tar().items[0];
  assert.equal(tar().items.length, 1, 'a kulcs-dedup elromlott');
  assert.ok(it.text.includes('ma 4 javítás'), 'a szöveg nem frissült');
  assert.ok(!it.repeats, 'RUTIN javítás „ismétlődő hibának" számított: repeats=' + it.repeats);
  assert.ok(!it.lastRepeat, 'RUTIN javítás lastRepeat-et állított → a ♻️ sor tüzelne');
});

t('…de a VALÓDI ismétlés továbbra is számít', () => {
  // A megkülönböztetés a lényeg: a kapu által megfogott, ismétlődő hiba
  // ELLENÉRE-a-leckének történt — arra kell a ♻️ sor és a sürgetés.
  urit();
  remember('shared', 'A hitelesség-kapu megint kitalált gombot fogott');
  remember('shared', 'A hitelesség-kapu megint kitalált gombot fogott');
  const it = tar().items[0];
  assert.equal(it.repeats, 1, 'a valódi ismétlés nem számolódott');
  assert.ok(it.lastRepeat, 'a valódi ismétlésnek nincs lastRepeat-je');
});

t('a kulcsos emlék a leckelistába is bekerül', () => {
  urit();
  remember('shared', csempeLecke(3), { kulcs: 'csempe-szabaly' });
  const l = list({ scope: 'shared', limit: 4 });
  assert.ok(l.some(x => x.text.includes('Csempe-szabály')), 'a kulcsos emlék eltűnt a listából');
});

t('hibás bemenetre nem borul', () => {
  urit();
  for (const rossz of [null, undefined, '', '   ']) assert.doesNotThrow(() => remember('shared', rossz, { kulcs: 'k' }));
  assert.doesNotThrow(() => remember('shared', 'jó', { kulcs: null }));
  assert.doesNotThrow(() => remember('shared', 'jó2', {}));
});

// ===================================================================
// A HITELESSÉG-KAPU KÖZÖS LECKÉJE (2026-09-06, mérés a memory/store.json-on)
// ===================================================================
// A 08-29-i stabil-kulcs javítás a `quality-guard` két hívóhelyét rendezte,
// az `ellenorzo` hitelesség-kapuját NEM. Élesben mérve a 130 `shared` emlékből
// **89 (68%) egyetlen hívóhelyről** származó, egyszeri eset-napló volt:
//
//     „Hitelesség-kapu blokk: <az adott cikk konkrét állítása> — kitalált
//      felületet/linket/számot SOHA ne írj le tényként"
//
// A cikk-specifikus rész miatt MINDEN blokk új emléket gyártott. Ez azért
// súlyos, mert a `lessonsBlock()` a `shared` scope-ból csak a LEGFELSŐ NÉGYET
// fűzi MINDEN agent MINDEN promptjába, a rangsor pedig (mérve: 616-ból 2
// inverzió) gyakorlatilag tiszta frissesség. A decay 08-30-i újraélesztése óta
// eltelt 8 napon a négy hely 56%-át (32-ből 18-at) ezek az egyszeri naplók
// vitték el — az utolsó négy napon már 3-at a 4-ből.
//
// 🔑 A hívóhely SAJÁT KOMMENTJE azt állította, hogy „ismétlődéskor erősödik,
// nem duplikálódik". Ez a MÁSODIK (szerzői) hívásra igaz volt, az elsőre nem.
// Megint: a kód saját kommentje nem bizonyíték — a store.json az.
// ===================================================================

const ELLENORZO = join(__dirname, '..', 'agents', 'ellenorzo', 'agent.js');

/**
 * A hitelesség-kapu KÖZÖS (`shared`) `remember(...)` hívása, teljes egészében.
 * Zárójel-egyensúllyal vágjuk ki, hogy a sortörés/formázás ne törje el.
 * @returns {string|null}
 */
function kapuKozosHivas() {
  const src = readFileSync(ELLENORZO, 'utf-8');
  const jel = src.indexOf('Hitelesség-kapu blokk:');
  if (jel < 0) return null;
  const kezd = src.lastIndexOf('remember(', jel);
  if (kezd < 0) return null;
  let mely = 0;
  for (let j = src.indexOf('(', kezd); j < src.length; j++) {
    if (src[j] === '(') mely++;
    else if (src[j] === ')' && --mely === 0) return src.slice(kezd, j + 1);
  }
  return null;
}

t('🛡️ a hitelesség-kapu KÖZÖS leckéje STABIL KULCCSAL megy', () => {
  const hivas = kapuKozosHivas();
  assert.ok(hivas, 'nem találom az ellenorzo „Hitelesség-kapu blokk" remember-hívását');
  assert.ok(hivas.includes("'shared'"), 'a kapu-lecke nem a shared scope-ba megy: ' + hivas.slice(0, 60));
  assert.match(
    hivas, /kulcs:\s*'[a-z0-9-]+'/,
    'a kapu-lecke KULCS NÉLKÜL megy → cikkenként új emléket gyárt, és kiszorítja '
    + 'a közös lecke-blokk mind a négy helyét'
  );
  // ...de NEM `rutin`-ként. A `rutin` a gép által MAGÁTÓL javított esetre való
  // (quality-guard --fix): ott a kemény szabály már létezik, a cikk nem sérült.
  // A hitelesség-kapu ezzel szemben BLOKKOL: a cikk tényleg rosszul született,
  // fizetős újraírási kört vitt el — ez a ♻️ sor pontos jelentése („a lecke
  // ELLENÉRE megint megtörtént"). Mérve: a SZERZŐI lecke ugyanezekre a napokra
  // amúgy is `lastRepeat`-et állít (iro repeats=60, utolsó 2026-09-05), tehát a
  // `rutin` egyetlen zajos napot sem szüntetne meg — csak a számot csonkítaná.
  assert.ok(!/rutin:\s*true/.test(hivas),
    'a kapu-lecke „rutin"-ként megy → a valódi, ismétlődő hiba jelzése elnémul');
});

t('a kapu-lecke a kulccsal EGY emlékbe fut össze, friss példával', () => {
  // Ugyanaz a szöveg-séma, mint élesben: állandó tanulság + változó eset.
  const kapuLecke = eset => `Hitelesség-kapu blokk: ${eset} — kitalált felületet/linket/számot SOHA ne írj le tényként`;
  urit();
  for (const eset of ['NVIDIA acquired Hugging Face', 'Meta Muse in Picsart', 'Qwen Image 3.0 Pro'])
    remember('shared', kapuLecke(eset), { kulcs: 'hitelesseg-kapu' });
  const s = tar();
  assert.equal(s.items.length, 1, 'nem egy emlék lett: ' + s.items.length);
  assert.ok(s.items[0].text.includes('Qwen Image 3.0 Pro'), 'nem a legfrissebb eset került a promptba');
  assert.equal(s.items[0].repeats, 2, 'a valódi ismétlés nem számolódott: ' + s.items[0].repeats);
});

t('🎯 A KÁR: kulcs nélkül a kapu-naplók KISZORÍTJÁK a tartós leckéket', () => {
  const kapuLecke = eset => `Hitelesség-kapu blokk: ${eset} — kitalált felületet/linket/számot SOHA ne írj le tényként`;
  const tartos = ['Csempe-szabály emlékeztető', 'Amerikai helyesírás', 'Főnöki döntés tanulsága'];

  // A MÉRT KIINDULÁS: a napi `decay()` a néhány napnál régebbi emlékeket a 0.05-ös
  // padlóra viszi (élesben 617-ből 534, mind 6,8 napnál idősebb), a mai írások
  // pedig 1.0 közelében állnak. Ezért a `list()` salience-rangsora gyakorlatilag
  // FRISSESSÉG-rangsor — a ma keletkezett kapu-naplók mindig a tartós leckék elé
  // kerülnek. Ezt a fixture állítja elő, hogy ne kelljen napokat várni.
  const magvet = () => writeFileSync(TESZT_STORE, JSON.stringify({
    _meta: {},
    items: tartos.map((szoveg, i) => ({
      id: 'regi' + i, scope: 'shared', text: szoveg, tags: [],
      created: '2026-08-20T02:00:00.000Z', lastAccessed: '2026-08-20T02:00:00.000Z',
      accessCount: 0, salience: 0.05, tier: 'cold'
    }))
  }, null, 2), 'utf-8');

  // (a) A MÉRT ÁLLAPOT: négy mai kapu-blokk, kulcs nélkül → négy külön friss emlék.
  magvet();
  for (const e of ['A', 'B', 'C', 'D']) remember('shared', kapuLecke(e));
  const nelkule = list({ scope: 'shared', limit: 4 });
  assert.equal(nelkule.filter(x => x.text.startsWith('Hitelesség-kapu')).length, 4,
    'a reprodukció nem a mért valóságot adja');
  assert.equal(nelkule.filter(x => tartos.includes(x.text)).length, 0,
    'a tartós leckéknek ki kellett volna szorulniuk');

  // (b) A JAVÍTOTT ÁLLAPOT: ugyanaz a négy blokk, stabil kulccsal → EGY hely.
  magvet();
  for (const e of ['A', 'B', 'C', 'D']) remember('shared', kapuLecke(e), { kulcs: 'hitelesseg-kapu' });
  const kulccsal = list({ scope: 'shared', limit: 4 });
  assert.equal(kulccsal.filter(x => x.text.startsWith('Hitelesség-kapu')).length, 1,
    'a kapu-lecke nem egy helyet foglal');
  assert.equal(kulccsal.filter(x => tartos.includes(x.text)).length, 3,
    'a felszabadult három hely nem a tartós leckéké lett');
});

t('🔒 az ÉLES memory/store.json ÉRINTETLEN maradt', () => {
  const most = existsSync(ELES) ? readFileSync(ELES, 'utf-8') : null;
  assert.equal(most, ELES_ELOTTE, '🔴 A TESZT BELEÍRT AZ ÉLES MEMÓRIATÁRBA!');
});

try { rmSync(MUNKA, { recursive: true, force: true }); } catch { /* */ }
console.log(`\n${bukott === 0 ? '✅' : '❌'} memory-dedup.test: ${pass} rendben, ${bukott} bukott`);
process.exit(bukott === 0 ? 0 : 1);
