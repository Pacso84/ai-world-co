// ===================================================================
// TESZT — ELADÓ OLDAL (/packs) ÉS A CSOMAG-ADATOK (2026-09-20)
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// MIÉRT VAN EZ A TESZT.
//
// 1) KÉT TÚLÍGÉRÉST MÁR KIVÁGTUNK EBBŐL A TERMÉKBŐL, ÉS AZ EGYIK
//    VISSZANŐTT. A PDF-generátorban 09-19-én javítottuk a „no ads and no
//    cookie banner" mondatot, teszt is őrzi — de a BOLTI szöveg a másik
//    ág volt, és ott 09-20-ig bent maradt, tíz helyen. Vagyis pontosan
//    az a mintázat, amit ebben a projektben már kétszer megtanultunk:
//    „ha ilyet találsz, keresd meg a többit." Ez a teszt a HONLAPI ágat
//    őrzi, hogy ne legyen harmadik példány.
//
// 2) A SZÁM NEM BECSÜLT. A régi 600-szó/oldal képlet 40%-ot tévedett
//    (a pénz-csomagnál 16 vs 27 valódi oldal), ezért a honlapon hirdetett
//    oldalszám CSAK a legyártott PDF-ből jöhet. A `website/packs.json`
//    gépi fájl; ez a teszt őrzi, hogy teljes és hihető maradjon.
//
// 3) A FORDÍTÁS MEGLÉTÉT NEM MÉRJÜK A KULCS LÉTEZÉSÉVEL. A `tr()` némán
//    angolra esik, ha egy kulcs hiányzik — a téma-oldalaknál épp ez tette
//    16 élő lapot angollá úgy, hogy semmi nem jelzett. Ezért itt a próba
//    az, hogy a magyar és a spanyol szöveg ELTÉR-E az angoltól.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { CSOMAG_SZOVEG, PACKS_UI, csomagSzoveg } from './packs-text.js';
import { CSOMAG_IDK, NAGY_ID, ARAK, arOf, hianyok, BOLTI_SORREND } from './packs-data.js';
import { TEMAK } from './topics.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NYELVEK = ['en', 'hu', 'es'];

let pass = 0, bukott = 0;
const t = (nev, fn) => {
  try { fn(); pass++; console.log('  ✅ ' + nev); }
  catch (e) { bukott++; console.log('  ❌ ' + nev + '\n     ' + String(e.message).split('\n')[0]); }
};

console.log('🧪 eladó oldal — az ígéret fedezete\n');

// A forrás komment NÉLKÜL: a fájl fejléce maga is LEÍRJA a tiltott
// mondatokat (hogy egy olvasó értse, mit nem szabad) — ha a komment is
// beleszámítana, a tiltás-próba ÖRÖKRE pirosan állna, és kiherélnénk.
const nyersSzoveg = readFileSync(join(ROOT, 'core', 'packs-text.js'), 'utf-8');
const szovegKod = nyersSzoveg.split('\n').filter(s => !s.trim().startsWith('//')).join('\n');
const packsUt = join(ROOT, 'website', 'packs.json');
const nyersBuild = readFileSync(join(ROOT, 'website', 'build.js'), 'utf-8');
const build = nyersBuild.split('\n').filter(s => !s.trim().startsWith('//')).join('\n');

// ===================================================================
// 1. A KIVÁGOTT TÚLÍGÉRÉSEK NEM JÖHETNEK VISSZA
// ===================================================================
// ⚠️ A MINTA IRÁNYA SZÁMÍT — EZ ELSŐ FUTÁSRA MEGFOGOTT ENGEM (09-20).
// Az első változatom a puszta „human editor reviews" szövegrészt tiltotta,
// és ezzel a SAJÁT BECSÜLETES mondatunkra ugrott rá:
//     „…but NO human editor reviews the text."
// Vagyis a kapu épp azt a mondatot verte volna ki, ami miatt az egész
// termék tisztességes. Ugyanaz az alak, mint a 09-16-i keresésnél, ahol a
// tagadó alakú hívókat engedte át a minta — csak tükörből.
// Ezért minden tiltás ÁLLÍTÓ értelműre van élezve: a „no"/„sin"/„nem"
// előtag kizárja a találatot.
const TILTOTT = [
  // 1) NINCS emberi átnézés — az állító alak hazugság lenne.
  { minta: /(?<!\bno\s)(?<!\bnem\s)reviewed for accuracy/i, mit: 'emberi pontossági átnézés' },
  { minta: /(?<!\bno\s)reviewed by a human/i, mit: 'emberi átnézés' },
  { minta: /(?<!\bno\s)human editor (?:reviews|reads|checks)/i, mit: 'emberi szerkesztő átnézi' },
  { minta: /(?<!\bningún\s)(?<!\bsin\s)editor humano (?:revisa|lee)/i, mit: 'emberi átnézés (es)' },
  { minta: /(?<!\bnem\s)emberi szerkesztő (?:átnézi|elolvassa)/i, mit: 'emberi átnézés (hu)' },
  // 2) Az INGYENES honlapon sincs reklám és süti-sáv → fizetős előnyként hazugság.
  { minta: /no ads and no cookie banners?/i, mit: 'reklám/süti-sáv mint fizetős előny' },
  { minta: /sin anuncios y sin (?:banner|aviso) de cookies/i, mit: 'reklám/süti-sáv (es)' },
  { minta: /nincs reklám és nincs süti/i, mit: 'reklám/süti-sáv (hu)' },
  // 3) Eredmény-ígéret — sosem volt bent, de olcsó megelőzni.
  { minta: /guaranteed to (?:make|save) you/i, mit: 'eredmény-garancia' }
];

const tiltottTalalat = (s) => TILTOTT.filter(x => x.minta.test(s)).map(x => x.mit);

t('🔑 egyetlen kivágott túlígérés sem szivárgott vissza az eladó oldal szövegébe', () => {
  const talalt = tiltottTalalat(szovegKod);
  assert.deepEqual(talalt, [], 'tiltott állítás a core/packs-text.js-ben: ' + talalt.join(' | '));
});

t('🔬 [hitelesítés] a tiltás-kereső MINDKÉT irányba jól dönt', () => {
  // Enélkül egy elrontott kapu (üres forrás, rossz regex) minden bemenetre
  // zöldet adna, és a fenti lépés díszlet lenne. Házszabály: ismert esettel,
  // MINDKÉT irányból.
  const FOGNIA_KELL = [
    'Every guide is reviewed for accuracy and clarity before it ships.',
    'A human editor reads the text before publication.',
    'One searchable PDF with no ads and no cookie banners.'
  ];
  const ÁT_KELL_ENGEDNIE = [
    'No human editor reviews the text.',            // a mi valódi mondatunk
    'no human editor reads the text',               // ugyanez az AI-szakaszból
    'Automated quality gates check every piece before it goes out.',
    'Ningún editor humano revisa el texto.'
  ];
  for (const s of FOGNIA_KELL) {
    assert.ok(tiltottTalalat(s).length > 0, 'a kapu ÁTENGEDTE: ' + s);
  }
  for (const s of ÁT_KELL_ENGEDNIE) {
    assert.deepEqual(tiltottTalalat(s), [], 'a kapu HAMISAN fogta meg: ' + s);
  }
  // És a valódi szövegünkben tényleg ott van a becsületes, tagadó alak:
  assert.ok(/no human editor (?:reads|reviews)/i.test(szovegKod),
    'eltűnt a „no human editor…" mondat — enélkül a termék többet állít magáról');
});

t('NINCS visszatérítési ígéret — a vásárlás végleges (user-döntés 09-25)', () => {
  // 09-20-án 30 napos, kérdés nélküli visszatérítést ígértünk; a user 09-25-én
  // úgy döntött, hogy NINCS visszatérítés. Ami ezen az oldalon áll, az ránk
  // nézve kötelező — egy visszacsúszó ígéret olyat vállalna, amit nem akarunk.
  // A Ko-fi „Your Terms" mezője ugyanezt mondja (a user tölti ki).
  const IGERET = /refund within|30[- ]day|no[- ]questions|we will refund|visszatérítjük|kérdés nélkül|napos,? kérdés|te devolvemos|sin preguntas|reembolso sin/i;
  for (const ny of NYELVEK) {
    const a3 = PACKS_UI[ny].packsA3;
    assert.ok(/^(No|Nem)\b/.test(a3), ny + ': a válasz nem „nem"-mel kezdődik: ' + a3);
    assert.ok(!IGERET.test(a3), ny + ': visszatérítést ígér: ' + a3);
    assert.ok(/support@aiworldhq\.com/.test(a3), ny + ': eltűnt a kérdés-cím');
    for (const [k, v] of Object.entries(PACKS_UI[ny])) {
      assert.ok(!IGERET.test(String(v)), ny + '.' + k + ': visszatérítést ígér');
    }
  }
  // A honlap GYIK-je (build.js) sem ígérhet — ott is volt, mindhárom nyelven.
  const build = readFileSync(join(ROOT, 'website', 'build.js'), 'utf-8');
  const faq = build.split('\n').filter(s => /\{ q: .*packs/.test(s)).join('\n');
  assert.ok(faq.length > 0, 'nem találom a csomagos GYIK-sorokat');
  assert.ok(!IGERET.test(faq), 'a GYIK visszatérítést ígér');
});

t('az ár a Ko-fi pénznemében (USD) — nincs kódba égetett „$" (09-25)', () => {
  // 09-25: a Ko-fi euróban volt, a honlap és a leírások dollárt írtak → a user
  // a Ko-fit dollárra állította (a 18 leírás „$3"-at ír). Ha a Ko-fi pénzneme
  // változik, ITT és a packs.json-ban is át kell írni — különben két árat lát a vevő.
  const pj = JSON.parse(readFileSync(join(ROOT, 'website', 'packs.json'), 'utf-8'));
  assert.equal(pj.currency, 'USD', 'a packs.json pénzneme nem a Ko-fié');
  const build = readFileSync(join(ROOT, 'website', 'build.js'), 'utf-8');
  assert.ok(!/[$][$]\{p\.price\}/.test(build), 'a build.js újra kódba égetett „$"-t ír az ár elé');
  assert.ok(/packAr\(p\)/.test(build), 'az árcímke nem a packAr()-on át készül');
});

t('minden csomag gombja a SAJÁT Ko-fi termékére visz (en + es, 18 különböző link)', () => {
  const pj = JSON.parse(readFileSync(join(ROOT, 'website', 'packs.json'), 'utf-8'));
  const linkek = [];
  for (const p of pj.packs) {
    for (const ny of ['en', 'es']) {
      const u = (p.urls || {})[ny] || '';
      assert.match(u, /^https:\/\/ko-fi\.com\/s\/[0-9a-f]{10}$/, p.id + '-' + ny + ': rossz vagy hiányzó link: ' + u);
      linkek.push(u);
    }
  }
  assert.equal(new Set(linkek).size, 18, 'két csomag ugyanarra a termékre visz');
});

t('a kézbesítés-válasz nem állítja, hogy NEM kell fiók', () => {
  // A Ko-fi saját boltoldala szerint a be nem jelentkezett vevőt
  // fiókregisztráció FOGADHATJA. Ezt nem tagadhatjuk le.
  for (const ny of NYELVEK) {
    const a2 = PACKS_UI[ny].packsA2.toLowerCase();
    assert.ok(!/no account|sin cuenta|nincs sz[üu]ks[ée]g fi[óo]kra|nem kell fi[óo]k/.test(a2),
      ny + ': azt ígéri, hogy nem kell fiók — ezt a Ko-fi nem garantálja');
  }
});

// ===================================================================
// 2. TELJESSÉG — 9 CSOMAG × 3 NYELV, ÉS A FORDÍTÁS TÉNYLEG FORDÍTÁS
// ===================================================================
t('mind a 9 csomagnak van neve és ígérete mind a 3 nyelven', () => {
  for (const id of CSOMAG_IDK) {
    for (const ny of NYELVEK) {
      const s = CSOMAG_SZOVEG[id] && CSOMAG_SZOVEG[id][ny];
      assert.ok(s && s.cim && s.igeret, id + '/' + ny + ': hiányzó név vagy ígéret');
    }
  }
});

t('🔑 a magyar és a spanyol csomagnév ELTÉR az angoltól (nem néma angolra esés)', () => {
  for (const id of CSOMAG_IDK) {
    const en = CSOMAG_SZOVEG[id].en;
    for (const ny of ['hu', 'es']) {
      const x = CSOMAG_SZOVEG[id][ny];
      assert.notEqual(x.cim, en.cim, id + '/' + ny + ': a név angolul maradt');
      assert.notEqual(x.igeret, en.igeret, id + '/' + ny + ': az ígéret angolul maradt');
    }
  }
});

t('minden felület-kulcs megvan mind a 3 nyelven', () => {
  const kulcsok = Object.keys(PACKS_UI.en);
  assert.ok(kulcsok.length >= 25, 'gyanúsan kevés kulcs: ' + kulcsok.length);
  for (const ny of NYELVEK) {
    for (const k of kulcsok) {
      assert.ok(PACKS_UI[ny] && String(PACKS_UI[ny][k] || '').trim(),
        'hiányzó kulcs: ' + ny + '.' + k);
    }
  }
});

t('🔑 az öt GY.I.K.-válasz magyarul és spanyolul sem maradt angol', () => {
  // A GY.I.K. hordozza a KÖTELEZETTSÉGEKET. Ha ez esik vissza angolra, a
  // magyar és spanyol vevő nem érti, mit ígértünk neki.
  for (const i of [1, 2, 3, 4, 5]) {
    for (const ny of ['hu', 'es']) {
      assert.notEqual(PACKS_UI[ny]['packsQ' + i], PACKS_UI.en['packsQ' + i], ny + ': Q' + i + ' angol');
      assert.notEqual(PACKS_UI[ny]['packsA' + i], PACKS_UI.en['packsA' + i], ny + ': A' + i + ' angol');
    }
  }
});

t('🔑 a GY.I.K. nem mond MENNYISÉGET a téma-csomagról (a kártya írja ki a pontosat)', () => {
  // VALÓDI HIBA VOLT, MIND A 3 NYELVEN (09-20): a válasz „kb. egy tucat"
  // útmutatót ígért, miközben a pénz-csomagban HAT van, a biztonságiban
  // kilenc. Kimérve a packs.json-ból: 6, 9, 10, 12, 12, 12, 12, 12.
  // A javítás nem pontosabb szám, hanem SEMMILYEN szám — így nem tud
  // elavulni akkor sem, ha egy csomag mérete változik.
  const j = JSON.parse(readFileSync(packsUt, 'utf-8'));
  const mini = j.packs.filter(p => p.id !== NAGY_ID).map(p => p.en.guides);
  const szoras = Math.max(...mini) - Math.min(...mini);
  assert.ok(szoras > 0, 'ha minden mini-csomag egyforma lenne, ez a lépés fölösleges');
  const MENNYISEG = /a dozen|egy tucat|una docena|\b(six|twelve|hat|tizenkét|seis|doce)\b\s+(guides|útmutató|guías)/i;
  for (const ny of NYELVEK) {
    assert.ok(!MENNYISEG.test(PACKS_UI[ny].packsA1),
      ny + ': a GY.I.K. mennyiséget ígér, pedig a csomagok ' + Math.min(...mini) + '–' + Math.max(...mini) + ' útmutatót tartalmaznak');
  }
});

t('a magyar oldal kimondja, hogy a fájlok angolul és spanyolul vannak', () => {
  // Magyar csomag NINCS. Ha a magyar lap ezt elhallgatná, a magyar vevő
  // magyar PDF-et várna.
  const hu = PACKS_UI.hu.packsLangs.toLowerCase();
  assert.ok(hu.includes('angol') && hu.includes('spanyol'),
    'a magyar oldal nem mondja meg, milyen nyelvű a fájl: ' + PACKS_UI.hu.packsLangs);
});

// ===================================================================
// 3. A MÉRT ADAT — packs.json
// ===================================================================
t('🔑 a bolti sorrend PONTOSAN a 8 témát fedi le — új téma nem eshet ki a boltból', () => {
  // ZÁRÓLÉPÉS-ŐR. A bolti sorrend szerkesztői döntés, ezért kézzel írt
  // lista — és a kézzel írt lista az, ami lemarad, ha valaki új témát vesz
  // fel a TEMAK-ba. Ilyenkor a téma-oldal elkészülne, a csomagja viszont
  // némán hiányozna az eladó oldalról. Ugyanaz az alak, mint a Pinterest
  // leállításánál: a mechanizmus megszűnt, a feltétel bent maradt.
  const temak = TEMAK.map(t => t.id);
  assert.deepEqual([...BOLTI_SORREND].sort(), [...temak].sort(),
    'a bolti sorrend és a témák listája elvált egymástól');
  assert.ok(!BOLTI_SORREND.includes(NAGY_ID), 'a gyűjtemény nem mini-csomag');
  assert.equal(CSOMAG_IDK[CSOMAG_IDK.length - 1], NAGY_ID, 'a gyűjteménynek az utolsó helyen kell állnia');
});

t('a legvékonyabb csomag nem az első kettő között van', () => {
  // A hiba, ami miatt a sorrend egyáltalán szerkesztői döntés lett:
  // a TEMAK sorrendje a 6 útmutatós pénz-csomagot tette a 2. helyre.
  const j = JSON.parse(readFileSync(packsUt, 'utf-8'));
  const meret = new Map(j.packs.map(p => [p.id, p.en.guides]));
  const minik = BOLTI_SORREND.map(id => meret.get(id));
  const legkisebb = Math.min(...minik);
  assert.ok(!minik.slice(0, 2).includes(legkisebb),
    'a legvékonyabb csomag (' + legkisebb + ' útmutató) az első kettő között áll');
});

t('a packs.json létezik, és pontosan a 9 ismert tételt tartalmazza', () => {
  assert.ok(existsSync(packsUt), 'nincs website/packs.json — futtasd: node core/packs-data.js --write');
  const j = JSON.parse(readFileSync(packsUt, 'utf-8'));
  const idk = (j.packs || []).map(p => p.id);
  assert.deepEqual([...idk].sort(), [...CSOMAG_IDK].sort(), 'a packs.json tételei eltérnek a névjegyzéktől');
});

t('🔑 minden tételnek van MÉRT oldal- és útmutató-száma (en + es)', () => {
  const j = JSON.parse(readFileSync(packsUt, 'utf-8'));
  const baj = hianyok(j);
  assert.deepEqual(baj, [], 'hiányzó mérés: ' + baj.join(' | '));
});

t('az ár egy helyen él: a packs.json ára = arOf(id)', () => {
  const j = JSON.parse(readFileSync(packsUt, 'utf-8'));
  for (const p of j.packs) {
    assert.equal(p.price, arOf(p.id), p.id + ': a packs.json ára elvált a core/packs-data.js-től');
  }
  assert.equal(arOf(NAGY_ID), ARAK.nagy);
  assert.ok(ARAK.nagy < ARAK.mini * 8, 'a gyűjtemény nem olcsóbb, mint a 8 mini külön — akkor nincs értelme');
});

t('az oldalszámok hihetők (a spanyol nem rövidebb jelentősen, a gyűjtemény a legnagyobb)', () => {
  const j = JSON.parse(readFileSync(packsUt, 'utf-8'));
  const nagy = j.packs.find(p => p.id === NAGY_ID);
  for (const p of j.packs) {
    if (p.id === NAGY_ID) continue;
    assert.ok(p.en.pages < nagy.en.pages, p.id + ': nagyobb, mint a teljes gyűjtemény — valamit rosszul mértünk');
    assert.ok(p.en.pages >= 10, p.id + ': gyanúsan vékony (' + p.en.pages + ' oldal)');
  }
  assert.ok(nagy.en.guides >= 100, 'a gyűjtemény útmutató-száma gyanúsan alacsony');
});

// ===================================================================
// 4. A BEKÖTÉS — ahol a kód és a szándék elválhat
// ===================================================================
t('🔑 az eladó oldal CSAK akkor épül meg, ha van adat (nincs üres boltba mutató gomb)', () => {
  assert.ok(/if \(PACKS\.enabled\) writeFileSync\([^)]*'packs\.html'/.test(build),
    'a packs.html írása nincs PACKS.enabled mögé zárva');
  assert.ok(/if \(PACKS\.enabled\) sitemapUrls\.push/.test(build),
    'a sitemap-sor nincs PACKS.enabled mögé zárva');
});

t('🔑 a csomag-sor CSAK a Reellel népszerűsített útmutatók alá kerül (user-döntés)', () => {
  // A user szűk kísérletet kért: ~27 cikk, nem mind a 449. Ha valaki a
  // feltételt kiveszi, ez a lépés szól.
  assert.ok(/a\.reelAt \? packLine\(/.test(build),
    'a csomag-sor nincs a reelAt feltételhez kötve');
  // …és a HÍR-lábléc nem kapja meg: a hír nem örökzöld, a csomag igen.
  const hirLab = (build.match(/disclosureNews[\s\S]{0,300}?back-link/) || [''])[0];
  assert.ok(!hirLab.includes('packLine'), 'a csomag-sor a hír-láblécbe is bekerült');
});

t('🔑 a csomag-sor NEM a support-foot osztályt viseli', () => {
  // A core/support-line.test.js a `support-foot` előfordulásait SZÁMOLJA.
  // Ha ez a sor is azt az osztályt viselné, a másik teszt mérője csendben
  // mást kezdene mérni, mint amit a neve mond.
  const fv = (build.match(/function packLine\([\s\S]*?\n}/) || [''])[0];
  assert.ok(fv.includes('pack-foot'), 'a packLine nem a pack-foot osztályt adja');
  assert.ok(!fv.includes('support-foot'), 'a packLine a support-foot osztályt használja');
});

t('a csomag-sor és a bolt-gomb a packs.json bolt-címére mutat, nem beégetett URL-re', () => {
  const fv = (build.match(/function packGomb\([\s\S]*?\n}/) || [''])[0];
  assert.ok(fv.includes('PACKS.shopUrl'), 'a gomb nem a packs.json bolt-címét használja');
  assert.ok(!/https:\/\/ko-fi\.com/.test(build.replace(/support_url/g, '')),
    'beégetett Ko-fi cím a build.js-ben — a bolt címe a packs.json-ban lakik');
});

t('a csevegő GY.I.K. ismeri a /packs oldalt mind a 3 nyelven', () => {
  // A chat-motor CSAK a kb.json-ban szereplő címre linkelhet; enélkül a
  // „árultok valamit?" kérdésre nem tudna hova mutatni.
  const db = (build.match(/p: '\/packs'/g) || []).length;
  assert.equal(db, 3, '/packs csak ' + db + ' nyelv GY.I.K.-jében van (3 kellene)');
});

// ===================================================================
// 5. KIMENET — ha van friss build, a számok tényleg kikerültek
// ===================================================================
// ⚠️ A KAPCSOLÓ ÁLLÁSÁT KI KELL MONDANI. Ha a live:false miatt kimaradó
// kimenet-próbák ugyanúgy néznének ki, mint egy elfelejtett build, akkor
// egy néma kihagyás fedné el, hogy az oldal egyáltalán nem épül meg.
const ELO = (() => { try { return JSON.parse(readFileSync(packsUt,'utf-8')).live === true; } catch { return false; } })();

t('a live kapcsoló létezik és logikai érték', () => {
  const j = JSON.parse(readFileSync(packsUt, 'utf-8'));
  assert.equal(typeof j.live, 'boolean', 'a packs.json live mezője hiányzik vagy nem true/false');
});

t('🔑 a kapcsoló TÉNYLEG kapcsol: az oldal a live mögé van zárva', () => {
  assert.ok(/rawPacks.live === true/.test(build),
    'a PACKS.enabled nem a live mezőtől függ — a kapcsoló díszlet lenne');
});

const kimenet = join(ROOT, 'website', 'public', 'packs.html');
if (!ELO) {
  console.log('  ⏸️  AZ ELADÓ OLDAL SZÁNDÉKOSAN KI VAN KAPCSOLVA (packs.json live:false).');
  console.log('      A bolt feltöltése után: live:true → a következő build élesíti.');
  if (existsSync(kimenet)) { bukott++; console.log('  ❌ mégis van kiépített packs.html — a kapcsoló nem fog'); }
} else if (existsSync(kimenet)) {
  const html = readFileSync(kimenet, 'utf-8');
  t('[kimenet] az eladó oldalon nem maradt kitöltetlen helyőrző', () => {
    assert.ok(!/\{OLDAL\}|\{DB\}|\bundefined\b|NaN/.test(html), 'helyőrző vagy undefined a kész lapon');
  });
  t('[kimenet] mind a 9 tétel ára kint van, és a 9. a gyűjtemény ára', () => {
    const j = JSON.parse(readFileSync(packsUt, 'utf-8'));
    const arak = (html.match(/class="packs__price">\$(\d+)</g) || []).length;
    assert.equal(arak, j.packs.length, 'a lapon ' + arak + ' ár van, ' + j.packs.length + ' helyett');
    assert.ok(html.includes('$' + ARAK.nagy), 'a gyűjtemény ára nincs kint');
  });
} else {
  console.log('  ⏭️  [kimenet] él, de nincs friss build — a kimenet-próbák kimaradnak');
}

console.log(`\n${bukott ? '❌' : '✅'} ${pass} sikeres, ${bukott} bukott`);
process.exit(bukott ? 1 : 0);
