// ===================================================================
// TESZT — a beágyazás-vektorok túlélik-e a CI-futásokat  (2026-09-06)
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// MIÉRT VAN EZ A FÁJL. 2026-09-06-án derült ki, hogy a memória szemantikus
// keresése SOHA nem működött: a vektorok elkészültek, majd a Házmester
// ugyanabban a futásban letörölte őket. A javítás után a vektorok külön,
// GITIGNORE-OLT fájlokba kerültek — mert a 13,9 MB ↔ 0,3 MB hullámzás
// megsemmisítette a git delta-tömörítést (mérve 165,9 KB/commit a stabil
// 14,3 KB helyett, ~335 MB/év a NYILVÁNOS repó történetében).
//
// 🔑 EZZEL VISZONT A CI MINDEN FUTÁSA HIDEG GYORSÍTÓTÁRRAL INDULT. Mérve:
// 480 emlék (iro 265 + guide 215) SOROS beágyazása ~1 s/hívás → ~8 PERC
// futásonként, plusz a téma-ismétlés-őr 150-400 hívása. Új emlék naponta
// csak ~8 születik, tehát meleg gyorsítótárral a memória-oldal 98%-a
// megspórolható. A megoldás: `actions/cache` a két gyorsítótár-fájlra.
//
// EZ A TESZT NÉGY DOLGOT ŐRIZ, és mind a négy hiányában a hiba NÉMA volna:
//   1. a visszatöltő lépés LÉTEZIK, a HELYES útvonalakra, a beágyazás ELŐTT;
//   2. a kulcs NEM FAGYASZTHATÓ BE (a GitHub egy meglévő kulcsot nem enged
//      felülírni: állandó kulcsnál az első mentés örökre bent ragadna);
//   3. a mentés TÚLÉLI A BUKOTT FUTÁST (`if: always()`) — épp a bukott futás
//      az, amelyik már kifizette a 480 beágyazást;
//   4. a MÉRGEZÉS-VÉDELMET a visszatöltés NEM KERÜLI MEG. Ez az egyetlen
//      valódi veszély: egy régi gyorsítótár MÁS szolgáltató vektoraival
//      hazug hasonlóságokat adna, és a `cosine()` az eltérő teret NÉMÁN
//      0-nak látja („nem hasonló"), pedig a helyes válasz a „nem tudom".
//      Ezt NEM szövegre nézzük: a betöltőket VALÓDI mérgezett fájlokkal
//      futtatjuk le.
//
// ⚠️ AZ ÉLES GYORSÍTÓTÁRAKHOZ NEM NYÚLUNK. Minden eset a saját ideiglenes
// fájljában fut (`MEMORY_EMBED_CACHE_PATH` / `TOPIC_EMBED_CACHE_PATH`), és a
// fájl végén ellenőrizzük, hogy az éles `guides/topic-embeddings.json`
// érintetlen maradt. (A `topic-dedup` esetében ez MÁR MEGTÖRTÉNT egyszer:
// 8 dimenziós ál-vektorok kerültek az éles fájlba.)
// ===================================================================

import assert from 'assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';
import { spawnSync } from 'child_process';
import { tmpdir } from 'os';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { cacheBetolt, cacheOlvas, cacheIr, cacheMent, ujjlenyomat } from './memory-embeddings.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');
const YML_UT = join(REPO, '.github', 'workflows', 'auto.yml');
const YML = readFileSync(YML_UT, 'utf-8');
const GITIGNORE = readFileSync(join(REPO, '.gitignore'), 'utf-8');
const ROUTER = readFileSync(join(REPO, 'core', 'ai-router.js'), 'utf-8');

// Az éles téma-gyorsítótár ujjlenyomata INDULÁSKOR — a fájl végén összevetjük.
const ELO_TOPIC = join(REPO, 'guides', 'topic-embeddings.json');
const lenyomat = ut => {
  try { return createHash('sha1').update(readFileSync(ut)).digest('hex'); } catch { return null; }
};
const TOPIC_EREDETI = lenyomat(ELO_TOPIC);

// ESM-import a próba-processzben: Windowson az abszolút útvonal NEM érvényes
// modul-azonosító (a betűjel és a szóköz is megbukik) — `file://` URL kell.
const TOPIC_URL = JSON.stringify(pathToFileURL(join(REPO, 'core', 'topic-dedup.js')).href);

let pass = 0, bukott = 0;
const t = (n, f) => {
  try { f(); pass++; console.log('  ✅ ' + n); }
  catch (e) { bukott++; console.log('  ❌ ' + n + '\n     ' + String(e.message).split('\n')[0]); }
};

console.log('🧪 CI beágyazás-gyorsítótár\n');

const gyoker = () => mkdtempSync(join(tmpdir(), 'embedcache-'));
const takarit = root => { try { rmSync(root, { recursive: true, force: true }); } catch { /* mindegy */ } };

// A KÉT GYORSÍTÓTÁR-FÁJL. Ha ezek elmozdulnak, a lenti minden állítás
// hazuggá válna — ezért egy helyen élnek.
const CACHE_FAJLOK = ['memory/memory-embeddings.json', 'guides/topic-embeddings.json'];

// ── A MÉRŐESZKÖZ: a YAML lépésekre bontása ──────────────────────────
//
// ⚠️ ELŐBB HITELESÍTJÜK, csak utána mérünk vele (ugyanaz az elv, mint a
// `core/ci-timeouts.test.js`-ben). Ha a workflow szerkezete változik, ez a
// blokk bukjon el elsőként — ne pedig egy hamis „minden rendben".
const SOROK = YML.split(/\r?\n/);

/** Egy lépés a `      - ` sortól a következő `      - ` sorig tart. */
function lepesek() {
  const ki = [];
  let mostani = null;
  for (let i = 0; i < SOROK.length; i++) {
    const sor = SOROK[i];
    if (/^ {6}- /.test(sor)) {
      if (mostani) ki.push(mostani);
      mostani = { index: ki.length, sorszam: i + 1, sorok: [sor] };
    } else if (mostani && (sor.trim() === '' || /^ {6}/.test(sor) || /^ {0,6}#/.test(sor))) {
      // A lépéshez tartozó további sorok (mezők, kommentek, üres sorok).
      // A KOMMENT SZÁNDÉKOSAN benne marad: a `mezo()` alább sor eleji
      // mintát követel, tehát egy kikommentezett mező NEM számít meglévőnek.
      mostani.sorok.push(sor);
    } else if (mostani) {
      ki.push(mostani); mostani = null;
    }
  }
  if (mostani) ki.push(mostani);
  return ki.map(l => ({ ...l, szoveg: l.sorok.join('\n') }));
}

/** Egy skalár mező értéke a lépésen belül (kikommentezve NEM számít). */
function mezo(lepes, nev) {
  const m = lepes.szoveg.match(new RegExp('^ {8,10}' + nev + ':[ \\t]*(.*)$', 'm'));
  return m ? m[1].trim() : null;
}

/** Egy blokk-lista (`path: |` alatti sorok) elemei. */
function blokkLista(lepes, nev) {
  const sorok = lepes.szoveg.split('\n');
  const kezd = sorok.findIndex(s => new RegExp('^ {8,10}' + nev + ':[ \\t]*\\|[ \\t]*$').test(s));
  if (kezd < 0) return [];
  const ki = [];
  for (let i = kezd + 1; i < sorok.length; i++) {
    const s = sorok[i];
    if (!s.trim()) break;
    if (!/^ {12}\S/.test(s)) break;
    ki.push(s.trim());
  }
  return ki;
}

const LEPESEK = lepesek();
const nevvel = re => LEPESEK.find(l => re.test(l.szoveg));
/** A lépés SORSZÁMA (nem a fájlbeli sor): ezzel hasonlítunk sorrendet. */
const hol = re => LEPESEK.findIndex(l => re.test(l.szoveg));

// A `run:` sorokra külön szűrünk: a KOMMENT NEM BIZONYÍTÉK (a `_redirects`
// 2026-08-15-i leckéje) — egy fájlnév egy magyarázó szövegben is szerepelhet.
const futSor = re => LEPESEK.findIndex(l => l.sorok.some(s => /^ {8}run:/.test(s) && re.test(s)));

t('a mérőeszköz lépésekre bontja a munkafolyamatot', () => {
  assert.ok(LEPESEK.length >= 15, 'gyanúsan kevés lépés: ' + LEPESEK.length);
  assert.ok(LEPESEK.some(l => /uses: actions\/checkout/.test(l.szoveg)), 'nem találom a checkout lépést');
  assert.ok(futSor(/agents\/ceo\/agent\.js/) >= 0, 'nem találom a Pipeline lépést — enélkül a sorrend-állítások hazudnának');
});

// ── 1. A VISSZATÖLTŐ LÉPÉS ──────────────────────────────────────────

const VISSZA = nevvel(/uses: actions\/cache(\/restore)?@/);
const MENTO = nevvel(/uses: actions\/cache\/save@/);

t('📥 VAN visszatöltő gyorsítótár-lépés', () => {
  assert.ok(VISSZA, 'nincs actions/cache lépés — minden futás hidegen indul, '
    + 'futásonként ~480 fölösleges beágyazás (~8 perc)');
});

t('📤 VAN mentő gyorsítótár-lépés', () => {
  assert.ok(MENTO, 'nincs mentő lépés — a visszatöltés örökké üresre futna');
});

t('🗂️ a visszatöltés PONTOSAN a két vektorfájlra mutat', () => {
  assert.ok(VISSZA, 'nincs visszatöltő lépés');
  const utak = blokkLista(VISSZA, 'path');
  for (const f of CACHE_FAJLOK) {
    assert.ok(utak.includes(f), `hiányzik a gyorsítótárból: ${f} (a lista: ${utak.join(', ') || '—'})`);
  }
});

t('🗂️ a mentés UGYANAZOKRA az útvonalakra megy', () => {
  assert.ok(MENTO, 'nincs mentő lépés');
  const be = blokkLista(VISSZA, 'path'), ki = blokkLista(MENTO, 'path');
  assert.deepEqual(ki, be, 'a mentett és a visszatöltött útvonalak eltérnek — '
    + 'ami nincs elmentve, azt hiába keresi a visszatöltés');
});

t('🙈 a gyorsítótárazott fájlok TÉNYLEG gitignore-oltak', () => {
  // Ha nem lennének, a `git add -A` visszacommitolná őket, és visszatérne
  // a 13,9 MB-os hullámzás a NYILVÁNOS repó történetébe — pont az a kár,
  // ami miatt a szétválasztás készült.
  for (const f of CACHE_FAJLOK) {
    assert.match(GITIGNORE, new RegExp('^' + f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'm'),
      `${f} NINCS a .gitignore-ban — a CI visszacommitolná a vektorokat`);
  }
});

// ── 2. SORREND ──────────────────────────────────────────────────────

t('⏩ a visszatöltés a BEÁGYAZÁST HASZNÁLÓ lépések ELŐTT fut', () => {
  const vissza = hol(/uses: actions\/cache(\/restore)?@/);
  const pipeline = futSor(/agents\/ceo\/agent\.js/);
  assert.ok(vissza >= 0 && pipeline >= 0, 'nem találom a két lépést');
  assert.ok(vissza < pipeline,
    'a gyorsítótár a Pipeline UTÁN töltődne vissza — akkor már mind a 480 '
    + 'beágyazás kifizetve, a visszatöltés semmit nem spórol');
  // A felújító külön processz, de ugyanabban a munkakönyvtárban dolgozik.
  const felujito = futSor(/agents\/iro\/upgrade-howtos\.js/);
  if (felujito >= 0) assert.ok(vissza < felujito, 'a felújító elé sem kerül oda a gyorsítótár');
});

t('⏪ a mentés a beágyazó lépések UTÁN fut (különben üreset mentene)', () => {
  const mento = hol(/uses: actions\/cache\/save@/);
  const pipeline = futSor(/agents\/ceo\/agent\.js/);
  assert.ok(mento > pipeline, 'a mentés a Pipeline ELŐTT van — a futásban '
    + 'megszületett új vektorok nem kerülnének be');
});

// ── 3. A KULCS — NE FAGYJON BE, DE TALÁLJON IS ──────────────────────

const KULCS = VISSZA ? mezo(VISSZA, 'key') : null;
const ELOTAGOK = VISSZA ? blokkLista(VISSZA, 'restore-keys') : [];

t('🧊 a kulcs NEM FAGYASZTHATÓ BE — futásonként változik', () => {
  // 🔑 A GitHub Actions gyorsítótárát UGYANAZZAL A KULCCSAL NEM LEHET
  // FELÜLÍRNI. Állandó kulcsnál a legelső mentés örökre bent ragadna, és
  // hetek múlva is egy elavult vektorkészletet töltenénk vissza — a hiba
  // NÉMA volna: a gyorsítótár „működik", csak nem tanul.
  assert.ok(KULCS, 'nincs `key` a visszatöltő lépésen');
  assert.match(KULCS, /\$\{\{\s*github\.(run_id|run_number|run_attempt|sha)\s*\}\}/,
    'a kulcs futásonként ÁLLANDÓ — az első mentés után a gyorsítótár befagyna: ' + KULCS);
});

t('🔎 a kulcs NEM a gyorsítótárazott fájlok tartalmából származik (körkörös volna)', () => {
  assert.ok(KULCS, 'nincs kulcs');
  for (const f of CACHE_FAJLOK) {
    assert.doesNotMatch(KULCS, new RegExp(f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      'a kulcs a gyorsítótár SAJÁT tartalmát hasheli: a friss fájl más kulcsot ad, '
      + 'tehát sosem találna vissza a sajátjára');
  }
});

t('🎯 van `restore-keys` ELŐTAG, és a kulcs azzal kezdődik', () => {
  // Egyedi kulcs + előtag = a mentés mindig új bejegyzés, a visszatöltés
  // mindig a LEGUTÓBBIT hozza. Előtag nélkül az egyedi kulcs sosem találna.
  assert.ok(ELOTAGOK.length >= 1, 'nincs restore-keys — az egyedi kulcs SOSEM találna semmit, '
    + 'a gyorsítótár örökké üres maradna');
  assert.ok(KULCS.startsWith(ELOTAGOK[0]),
    `a kulcs (${KULCS}) nem az előtaggal (${ELOTAGOK[0]}) kezdődik — a visszatöltés sosem illeszkedne`);
});

t('🎯 az előtag maga NEM tartalmaz futásonként változó részt', () => {
  // Ha az előtagba is belekerülne a `run_id`, az előző futás bejegyzésére
  // SOSEM illeszkedne — a hiba néma: a lépés lefut, csak mindig üres.
  assert.ok(ELOTAGOK.length >= 1, 'nincs restore-keys');
  for (const e of ELOTAGOK) {
    assert.doesNotMatch(e, /\$\{\{/, 'az előtag futás-specifikus kifejezést tartalmaz: ' + e);
  }
});

t('🔗 a mentés UGYANAZT a kulcsot használja, mint a visszatöltés', () => {
  assert.ok(MENTO, 'nincs mentő lépés');
  assert.equal(mezo(MENTO, 'key'), KULCS,
    'a mentés más kulcs alá tenné a vektorokat, mint amit a visszatöltés keres');
});

// ── 4. TÚLÉLI-E A BUKOTT FUTÁST ─────────────────────────────────────

t('🛟 a mentés `if: always()` — a BUKOTT futás munkája sem vész el', () => {
  // ⚠️ Épp a bukott futás az, amelyik MÁR KIFIZETTE a 480 beágyazást.
  assert.ok(MENTO, 'nincs mentő lépés');
  assert.match(MENTO.szoveg, /^ {8}if: always\(\)$/m,
    'a mentő lépés nincs `if: always()`-szel védve — egy bukott lépés után a '
    + 'GitHub kihagyná, és a futásban megszerzett vektorok elvesznének');
});

t('🚦 a KOMBINÁLT `actions/cache@` NINCS használva (a post-mentése csak sikeres jobnál fut)', () => {
  // Az `actions/cache` post-lépése `post-if: success()` — egy bukott futás
  // után NEM mentene. Ezért kell a szétválasztott restore + save.
  const kombinalt = LEPESEK.filter(l => /uses: actions\/cache@/.test(l.szoveg));
  assert.equal(kombinalt.length, 0,
    'kombinált actions/cache lépés van a fájlban: a mentése `post-if: success()`, '
    + 'tehát pont a bukott futásoknál maradna el');
});

t('🚑 a gyorsítótár hibája NEM buktathatja el a futást', () => {
  assert.ok(MENTO, 'nincs mentő lépés');
  assert.match(MENTO.szoveg, /^ {8}continue-on-error: true$/m,
    'ha egyik gyorsítótár-fájl sem létezik (pl. halott beágyazás), a mentő lépés '
    + 'útvonal-hibát ad — az nem érhet többet, mint a futás egész munkája');
});

t('⏱️ a gyorsítótár-lépések NEM visznek el a job-időkeretből', () => {
  // A `core/ci-timeouts.test.js` a lépés-korlátok ÖSSZEGÉT méri a 145 perces
  // job-plafonhoz, 5 perc tartalékkal. A jelenlegi összeg 136 — egy új,
  // időkorlátos lépés kimeríthetné a maradékot.
  for (const l of [VISSZA, MENTO]) {
    if (!l) continue;
    assert.doesNotMatch(l.szoveg, /^ {8}timeout-minutes:/m,
      'a gyorsítótár-lépésnek időkorlátja van — ez a ci-timeouts.test.js keretét fogyasztja');
  }
});

// ── 5. MÉRGEZÉS — A VISSZATÖLTÉS NEM KERÜLI MEG A VÉDELMET ──────────
//
// 🔑 EZ A LEGFONTOSABB BLOKK. Egy visszatöltött gyorsítótár PONTOSAN ugyanazon
// a betöltőn megy át, mint a lemezen talált — más út nincs. Az alábbi esetek
// ezt VALÓDI mérgezett fájlokkal bizonyítják, nem forrás-szöveggel.

t('☠️ MEMÓRIA: MÁS SZOLGÁLTATÓ fejléce → a betöltő ÜRESET ad', () => {
  const root = gyoker();
  const ut = join(root, 'mem.json');
  const c = { items: {} };
  cacheIr(c, 'a1', 'régi lecke', new Array(768).fill(0.1), 'google');
  cacheMent(c, 'google', 768, ut);
  // Most a Mistral tere aktív (1024) — a google-fájl EGÉSZE tévesztés.
  const be = cacheBetolt('mistral', 1024, ut);
  assert.deepEqual(be.items, {}, 'a más szolgáltatótól származó gyorsítótár átjött — '
    + 'a cosine() az idegen teret NÉMÁN 0-nak látná („nem hasonló"), pedig „nem tudom"');
  takarit(root);
});

t('☠️ MEMÓRIA: MÁS DIMENZIÓ fejléce → a betöltő ÜRESET ad', () => {
  const root = gyoker();
  const ut = join(root, 'mem.json');
  const c = { items: {} };
  cacheIr(c, 'a1', 'lecke', new Array(768).fill(0.1), 'mistral');
  cacheMent(c, 'mistral', 768, ut);
  assert.deepEqual(cacheBetolt('mistral', 1024, ut).items, {},
    'azonos szolgáltató, MÁS dimenzió — ez is másik tér');
  takarit(root);
});

t('☠️ MEMÓRIA: jó fejléc, de MÉRGEZETT bejegyzés → bejegyzésenként is elbukik', () => {
  // Egy kézzel összefércelt (vagy félbeírt) fájl fejléce hazudhat.
  const root = gyoker();
  const ut = join(root, 'mem.json');
  writeFileSync(ut, JSON.stringify({
    _meta: { provider: 'mistral', dim: 1024 },
    items: {
      roviditett: { v: new Array(768).fill(0.1), p: 'mistral', d: 1024, h: ujjlenyomat('szöveg') },
      idegen: { v: new Array(1024).fill(0.1), p: 'google', d: 1024, h: ujjlenyomat('szöveg') },
      hazudo_d: { v: new Array(1024).fill(0.1), p: 'mistral', d: 768, h: ujjlenyomat('szöveg') },
      atirt: { v: new Array(1024).fill(0.1), p: 'mistral', d: 1024, h: ujjlenyomat('MÁS szöveg') },
      jo: { v: new Array(1024).fill(0.1), p: 'mistral', d: 1024, h: ujjlenyomat('szöveg') }
    }
  }), 'utf-8');
  const be = cacheBetolt('mistral', 1024, ut);
  for (const rossz of ['roviditett', 'idegen', 'hazudo_d', 'atirt']) {
    assert.equal(cacheOlvas(be, rossz, 'szöveg', 'mistral', 1024), null,
      'mérgezett bejegyzés átjött: ' + rossz);
  }
  assert.ok(cacheOlvas(be, 'jo', 'szöveg', 'mistral', 1024), 'az ÉP bejegyzést is eldobta — '
    + 'akkor a gyorsítótár semmit nem spórolna (kell út VISSZA is)');
  takarit(root);
});

t('☠️ MEMÓRIA: sérült/hiányzó fájl → üres gyorsítótár, NEM kivétel', () => {
  const root = gyoker();
  writeFileSync(join(root, 'csonka.json'), '{"_meta":{"provider":"mist', 'utf-8');
  assert.deepEqual(cacheBetolt('mistral', 1024, join(root, 'csonka.json')).items, {});
  assert.deepEqual(cacheBetolt('mistral', 1024, join(root, 'nincs-ilyen.json')).items, {});
  takarit(root);
});

t('☠️ TÉMA-ŐR: a mérgezett (768 dimenziós) gyorsítótár-vektort NEM használja fel', () => {
  // ⚠️ KÜLÖN PROCESSZ: a `core/topic-dedup.js` a modul betöltésekor olvassa ki
  // a `TOPIC_EMBED_CACHE_PATH`-t, tehát csak így lehet ideiglenes fájlra
  // terelni — és így garantált, hogy az ÉLES fájlhoz nem nyúlunk.
  // A beágyazó függvény INJEKTÁLT: nincs hálózat, nincs költség.
  const root = gyoker();
  const cacheUt = join(root, 'topic.json');
  const naploUt = join(root, 'log.json');
  // A „Alpha Beta Gamma Delta" cím vektora a RÉGI (768 dimenziós) térből.
  writeFileSync(cacheUt, JSON.stringify({ 'alpha beta gamma delta': new Array(768).fill(0.5) }), 'utf-8');

  const script = join(root, 'proba.mjs');
  writeFileSync(script, `
import { isNearDuplicateTitle } from ${TOPIC_URL};
import { readFileSync } from 'fs';
let hivasok = 0;
// Minden cím UGYANAZT az 1024 dimenziós vektort kapja → ha a mérgezett
// 768-as bejegyzést használná, a cosine() 0-t adna (eltérő hossz), és a
// majdnem azonos címpár ÁTMENNE a kapun.
const embedFn = async () => { hivasok++; return new Array(1024).fill(0.5); };
const r = await isNearDuplicateTitle('Alpha Beta Gamma Epsilon', ['Alpha Beta Gamma Delta'], { embedFn });
const cache = JSON.parse(readFileSync(${JSON.stringify(cacheUt.replace(/\\/g, '/'))}, 'utf-8'));
console.log(JSON.stringify({
  duplicate: r.duplicate,
  by: r.closest && r.closest.by,
  score: r.closest && r.closest.score,
  hivasok,
  cacheDim: (cache['alpha beta gamma delta'] || []).length
}));
`, 'utf-8');

  const fut = spawnSync(process.execPath, [script], {
    encoding: 'utf-8',
    env: { ...process.env, TOPIC_EMBED_CACHE_PATH: cacheUt, TOPIC_DEDUP_LOG_PATH: naploUt }
  });
  assert.equal(fut.status, 0, 'a próba-processz elhasalt: ' + (fut.stderr || '').split('\n')[0]);
  const ki = JSON.parse((fut.stdout || '').trim().split('\n').pop());
  assert.equal(ki.by, 'embedding', 'nem is jutott el a beágyazásig');
  assert.ok(ki.score > 0.99, `a mérgezett 768 dimenziós vektort használta: hasonlóság ${ki.score} `
    + '(a cosine() eltérő hosszra NÉMÁN 0-t ad — így két majdnem azonos cím átmenne a kapun)');
  assert.equal(ki.duplicate, true, 'a majdnem azonos címpárt nem fogta meg');
  assert.equal(ki.cacheDim, 1024, 'a mérgezett bejegyzés bent maradt a gyorsítótárban');
  takarit(root);
});

t('✅ TÉMA-ŐR: az ÉP (azonos dimenziójú) gyorsítótár-vektort viszont HASZNÁLJA', () => {
  // Út VISSZA a nullához: ha minden bejegyzést eldobna, a gyorsítótár nem
  // spórolna semmit — a mérgezés-védelem akkor is „zöldnek" látszana.
  const root = gyoker();
  const cacheUt = join(root, 'topic.json');
  writeFileSync(cacheUt, JSON.stringify({ 'alpha beta gamma delta': new Array(1024).fill(0.5) }), 'utf-8');
  const script = join(root, 'proba.mjs');
  writeFileSync(script, `
import { isNearDuplicateTitle } from ${TOPIC_URL};
let hivasok = 0;
const embedFn = async () => { hivasok++; return new Array(1024).fill(0.5); };
await isNearDuplicateTitle('Alpha Beta Gamma Epsilon', ['Alpha Beta Gamma Delta'], { embedFn });
console.log(JSON.stringify({ hivasok }));
`, 'utf-8');
  const fut = spawnSync(process.execPath, [script], {
    encoding: 'utf-8',
    env: { ...process.env, TOPIC_EMBED_CACHE_PATH: cacheUt, TOPIC_DEDUP_LOG_PATH: join(root, 'log.json') }
  });
  assert.equal(fut.status, 0, 'a próba-processz elhasalt: ' + (fut.stderr || '').split('\n')[0]);
  const ki = JSON.parse((fut.stdout || '').trim().split('\n').pop());
  // 1 hívás = CSAK a jelölt (azt szándékosan mindig frissen ágyazzuk be);
  // a meglévő cím a gyorsítótárból jött. Ez a megspórolt hívás.
  assert.equal(ki.hivasok, 1, `${ki.hivasok} beágyazás történt 1 helyett — `
    + 'a gyorsítótár nem talált vissza a saját ép bejegyzésére');
  takarit(root);
});

// ── 6. TRIPWIRE: SZOLGÁLTATÓ-VÁLTÁS ─────────────────────────────────

t('🚨 a beágyazó-lánc szolgáltatói VÁLTOZATLANOK (google 768 + mistral 1024)', () => {
  // 🔑 A TÉMA-ŐR gyorsítótára (guides/topic-embeddings.json) — a memóriáétól
  // eltérően — NEM tárol szolgáltató-fejlécet: csak a DIMENZIÓ különbözteti
  // meg a tereket. Ma ez elég (768 ≠ 1024). Ha viszont bekerül a láncba egy
  // olyan szolgáltató, aminek a dimenziója EGYEZIK egy meglévőével (pl. a
  // Cohere és a Voyage is 1024), az őr NÉMÁN vakká válik, és a régi
  // gyorsítótár hazug hasonlóságokat adna.
  //
  // A CI-gyorsítótár csak azért biztonságos, mert ez a lista ilyen. Ezért
  // szól ez a teszt AZON A HELYEN, ahol a változás történne.
  const blokk = ROUTER.slice(ROUTER.indexOf('probalSorban('), ROUTER.indexOf('probalSorban(') + 400);
  const nevek = [...blokk.matchAll(/\['([a-z0-9-]+)',\s*embed/gi)].map(m => m[1]);
  assert.deepEqual(nevek, ['google', 'mistral'],
    'MEGVÁLTOZOTT A BEÁGYAZÓ-LÁNC: ' + JSON.stringify(nevek) + '. Ellenőrizd, hogy az új '
    + 'szolgáltató dimenziója KÜLÖNBÖZIK-e a többiétől. Ha nem, a '
    + 'guides/topic-embeddings.json dimenzió-őre vak lesz — ilyenkor a '
    + '.github/workflows/auto.yml `embed-v1-` kulcs-szegmensét `embed-v2-`-re KELL '
    + 'emelni (a régi gyorsítótár így nem töltődik vissza), vagy a téma-gyorsítótár '
    + 'is kapjon szolgáltató-fejlécet a core/memory-embeddings.js mintájára.');
  assert.match(ROUTER, /outputDimensionality:\s*768/, 'a Google beágyazás dimenziója megváltozott');
});

// ── 7. AZ ÉLES FÁJLOK ÉRINTETLENEK ──────────────────────────────────

const mostani = lenyomat(ELO_TOPIC);
if (mostani !== TOPIC_EREDETI) {
  bukott++;
  console.log('  ❌ A TESZT BELEÍRT AZ ÉLES guides/topic-embeddings.json-BA!');
} else {
  pass++;
  console.log('  ✅ 🧪 az éles guides/topic-embeddings.json érintetlen');
}

if (existsSync(join(REPO, 'memory', 'memory-embeddings.json'))) {
  // Nem hiba, csak jelezzük: a teszt SOHA nem hozza létre (mindig temp úton dolgozik).
  console.log('  ℹ️ (a memory/memory-embeddings.json létezik — a teszt nem nyúlt hozzá)');
}

console.log(`\n${bukott === 0 ? '✅' : '❌'} ci-embed-cache.test: ${pass} rendben, ${bukott} bukott`);
process.exit(bukott === 0 ? 0 : 1);
