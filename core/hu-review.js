// ===================================================================
// MAGYAR HELYESÍRÁS-ÁTVIZSGÁLÁS — a két lépcső összekötése
// ===================================================================
//
// FUTTATÁS:
//   node core/hu-review.js                   MINDEN magyar fordítás átnézése
//   node core/hu-review.js --dry             csak a jelöltek száma, $0
//   node core/hu-review.js --limit=5         legfeljebb 5 köteg (5×40 szó) AI-ba
//   node core/hu-review.js --rejudge         az emberi listát is újraítéli
//   node core/hu-review.js --fix             a MEGÍTÉLT hibák javítása, $0
//   node core/hu-review.js --report          a tár állapota, $0
//
// ⚠️ EZ A FÁJL AZ IMPORTRA NEM INDUL EL. 25-ből 21 agent a fájl végén
// feltétel nélkül hívja a main()-t → a puszta import pénzt költ és publikál
// (2026-08-06). A core/daily-report.js is ilyen (2026-08-19). Itt őrszem van.
// ===================================================================

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadHuChecker } from './hu-dictionaries.js';
import { extractCandidates } from './hu-spellcheck.js';
import { judgeWords, applyVerdicts, applyFixes, needsReview, emptyStore, BATCH } from './hu-proofread.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TRANS_DIR = join(ROOT, 'content', 'translations');
export const STORE_PATH = join(ROOT, 'memory', 'hu-word-verdicts.json');

// ⚠️ A `scan` BÉLYEGNEK MINDKÉT IRÁNYBAN ÁT KELL JUTNIA (2026-08-21).
// Elsőre csak a mentést kötöttem be, az olvasás viszont `{ok, fix, review}`-ra
// normalizált — a bélyeg némán elveszett volna, a riport pedig visszaesett
// volna a régi, szám nélküli sorra. Tesztelhetőség miatt az útvonal kívülről
// is megadható: a teszt így nem nyúl az éles tárhoz.
export function loadStore(path = STORE_PATH) {
  try {
    const s = JSON.parse(readFileSync(path, 'utf-8'));
    return { ...s, ok: s.ok || [], fix: s.fix || {}, review: s.review || {} };
  } catch { return emptyStore(); }
}
export function saveStore(s, path = STORE_PATH) {
  // A `scan` bélyeg (mit néztünk át legutóbb) a napi riport LEFEDETTSÉG-sorát
  // táplálja — enélkül a néma vakság ugyanúgy néz ki, mint a néma siker.
  const ki = { ...s, ok: [...s.ok].sort(), fix: s.fix, review: s.review };
  writeFileSync(path, JSON.stringify(ki, null, 2), 'utf-8');
}

/** A config vészkapcsolója. Config-hiba esetén BEKAPCSOLVA maradunk. */
export function proofreadEnabled() {
  try {
    const cfg = JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf-8'));
    return cfg.agents?.proofread?.enabled !== false;
  } catch { return true; }
}

const magyarFajlok = () => existsSync(TRANS_DIR)
  ? readdirSync(TRANS_DIR).filter(f => f.endsWith('.json')) : [];
const olvas = f => { try { return JSON.parse(readFileSync(join(TRANS_DIR, f), 'utf-8')); } catch { return null; } };

/** A megítélt hibák javítása MINDEN magyar fordításban. $0, idempotens. */
function javit(store) {
  let erintett = 0, csere = 0;
  for (const f of magyarFajlok()) {
    const d = olvas(f);
    if (!d?.hu) continue;
    const r = applyFixes(d.hu, store);
    if (!r.fixed.length) continue;
    d.hu = r.text;
    writeFileSync(join(TRANS_DIR, f), JSON.stringify(d, null, 2), 'utf-8');
    erintett++; csere += r.fixed.length;
    console.log('   🔧 ' + f.slice(30, 70) + ' — ' + r.fixed.map(x => x.word + '→' + x.correct).join(', '));
  }
  console.log('\n✅ ' + erintett + ' cikk javítva, ' + csere + ' szóalak. Költség: $0');
}

async function main() {
  const args = process.argv.slice(2);
  const store = loadStore();

  if (args.includes('--report')) {
    console.log('📋 döntés-tár: ' + store.ok.length + ' rendben · '
      + Object.keys(store.fix).length + ' auto-javítható · '
      + Object.keys(store.review).length + ' emberi szem kell');
    for (const [w, d] of Object.entries(store.fix)) console.log('   🔧 ' + w + ' → ' + d.correct + '  (' + d.at + ')');
    for (const x of needsReview(store)) console.log('   👀 ' + x.word + ' → ' + x.correct);
    return;
  }
  if (args.includes('--fix')) { javit(store); return; }

  const limitBol = args.find(a => a.startsWith('--limit='));
  const limit = Number((limitBol || '').split('=')[1]) || Infinity;
  const dry = args.includes('--dry');
  // ÚJRAÍTÉLÉS: az emberi listán ülő szavakat is megkérdezzük megint. Azért
  // kell, mert a mondat-bizonyíték (2026-08-21) előtt ítélt szavakhoz nincs
  // mondatunk eltéve — nélküle egyik sem válhatna automatikussá.
  const ujra = args.includes('--rejudge');
  const { isKnownWord } = await loadHuChecker();

  // A jelöltek a TELJES halmazon egyszer: ugyanaz a szó több cikkben is
  // előfordul, a bírót ne fizessük ki érte többször.
  // ⚠️ MINDIG MINDEN CIKKET PÁSZTÁZUNK — és ez nem pazarlás, hanem a javítás.
  //
  // ELŐTTE (2026-08-20 … 08-21) itt `magyarFajlok().slice(-12)` állt, „a 12
  // legfrissebb" szándékával. A readdirSync viszont NÉVSORRENDET ad, nem
  // időrendet: mérve 0/12 volt az átfedés a valóban legfrissebb 12-vel. Az
  // őrszem minden futásban ugyanazt a 12, „v"/„w" betűs cikket nézte — azokat
  // már megítéltük —, ezért büszkén jelentett „0 megítélendő szóalak"-ot,
  // miközben SOHA nem látott friss cikket. 404 szóalak gyűlt fel így.
  //
  // Időrendre javítani csábító, de zsákutca: a CI-ban az mtime a CHECKOUT
  // ideje (lásd a hír-megőrzés ugyanezt a leckét). A rendezés helyes iránya
  // tehát az, hogy ne kelljen rendezni. A hunspell ingyenes és hálózat nélküli
  // (mérve: 773 cikk = 12 másodperc), a döntés-tár pedig kiszűri, amit már
  // megítéltünk — így AI-hívás CSAK tényleg új szóalakra megy.
  const fajlok = magyarFajlok();
  const jeloltek = new Map();
  for (const f of fajlok) {
    const d = olvas(f);
    if (!d?.hu) continue;
    for (const c of extractCandidates(d.hu, { isKnownWord, allowlist: new Set(store.ok) })) {
      const k = c.word.toLowerCase();
      if (store.fix[k] || jeloltek.has(k)) continue;
      // Az emberi listás szót csak --rejudge mellett kérdezzük újra, és akkor
      // is CSAK EGYSZER: amit már mondat-bizonyítékkal ítéltünk (`mondattal`),
      // azt hiába kérdeznénk megint — ugyanazt a választ fizetnénk ki újra.
      if (store.review[k] && (!ujra || store.review[k].mondattal)) continue;
      jeloltek.set(k, c);
    }
  }
  const lista = [...jeloltek.values()];
  console.log('🔎 ' + fajlok.length + ' magyar cikk · ' + lista.length + ' megítélendő szóalak');

  // A --dry SZÁNDÉKOSAN nem ír semmit: próba, nem futás. (A tárat a CI is
  // írja, egy helyi mellékhatás git-ütközést okozna.)
  if (dry) { console.log('   (--dry: itt megállunk, AI-hívás nem volt)'); return; }

  // A bélyeg még az AI-hívás ELŐTT mentődik: ha a bíró elhasal, a riport akkor
  // is meg tudja mondani, hogy a pásztázás lefutott és mekkora volt. Ez a
  // különbség a „nem volt hiba" és a „nem is néztünk oda" között.
  store.scan = { at: new Date().toISOString().slice(0, 10), files: fajlok.length, candidates: lista.length };
  saveStore(store);
  if (!lista.length) { console.log('✅ nincs új megítélendő szó.'); return; }
  if (!proofreadEnabled()) { console.log('⏸️  Helyesírás-bíró: KIKAPCSOLVA (config) — kihagyom.'); return; }

  const { ask } = await import('./ai-router.js');
  let s = store, koltseg = 0, megitelt = 0, ujFix = 0, ujReview = 0;
  for (let i = 0; i < lista.length && i / BATCH < limit; i += BATCH) {
    // A szótár ITT kapcsolódik be: a bíró javaslatát is megméri vele, mielőtt
    // bármit automatikusnak minősítenénk („biokra → biogra" nem is szó).
    const r = await judgeWords({ candidates: lista.slice(i, i + BATCH), ask, enabled: true, isKnownWord });
    koltseg += r.costUsd; megitelt += r.verdicts.length;
    for (const v of r.verdicts) {
      if (v.ok) continue;
      if (v.fixable) { ujFix++; console.log('   🔧 ' + v.word + ' → ' + v.correct); }
      else { ujReview++; console.log('   👀 ' + v.word + ' → ' + String(v.correct).slice(0, 50)); }
    }
    s = applyVerdicts(s, r.verdicts);
    saveStore(s);                    // menet közben mentünk: a félbeszakadt futás sem vész kárba
    console.log('   …' + Math.min(i + BATCH, lista.length) + '/' + lista.length + ' · $' + koltseg.toFixed(4));
  }
  console.log('\n✅ ' + megitelt + ' ítélet · ' + ujFix + ' auto-javítható · ' + ujReview
    + ' emberi szem kell · összesen $' + koltseg.toFixed(4));
  console.log('📋 tár: ' + s.ok.length + ' rendben · ' + Object.keys(s.fix).length + ' fix · '
    + Object.keys(s.review).length + ' review');
}

const kozvetlen = process.argv[1] && process.argv[1].endsWith('hu-review.js');
if (kozvetlen) main().catch(e => { console.error('💥 hu-review hiba:', e.message); process.exit(1); });
