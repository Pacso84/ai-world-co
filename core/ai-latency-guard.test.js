// ===================================================================
// TESZT — AI-késleltetés-őr (2026-09-16)
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// MIÉRT VAN EZ A FÁJL. A 2026-09-16 02:13 UTC-s CI-futás „Pipeline" lépése
// 45,5 percig tartott (átlag 8,9 perc, addigi csúcs 21,9), miközben a napi
// költés $0,23 maradt — vagyis a 45 perc NEM munkával telt. A naplóból: két
// hívás PONTOSAN 8,0 percig lógott, majd „The operation was aborted due to
// timeout"-tal elhasalt, 0+0 tokennel ([designer] és [seo], mindkettő
// minimax-m2.5). És mindez TELJESEN NÉMA volt: a router `logCall()`-ja mindent
// kiír, csak IDŐT nem, a konzol pedig a CI naplója — „ahová senki nem néz".
//
// 🔑 AMIT EZ A TESZT ŐRIZ, három külön dolog (a lánc VÉGÉT mérjük):
//   (a) a mérés HELYES (napi tiszta lap, összefűzés, időtúllépés-felismerés);
//   (b) a mérés SOHA nem akaszthat meg egy AI-hívást (nem dob);
//   (c) a lelet TÉNYLEG ELJUT a userhez: a router meghívja a jegyzőt, a napi
//       riport beolvassa a fájlt és kiírja a sort. Enélkül az egész munka a
//       CI-naplóig érne — pontosan az a hiba, amit javítani hivatott.
//
// ⚠️ SEM A ROUTERT, SEM A RIPORTOT NEM IMPORTÁLJUK: a `core/daily-report.js`
// a fájl végén feltétel nélkül hívja a `main()`-t (valódi Telegram-üzenet), a
// `core/ai-router.js` importja pedig SDK-kat és kulcsokat rántana be. Ezért a
// bekötést a FORRÁS SZÖVEGÉBŐL igazoljuk — ugyanaz a minta, mint a
// semantic-guard, buffer-guard és test-guard tesztjében.
//
// ⚠️ AZ ÉLES `memory/`-t ez a teszt NEM ÉRINTI: az útvonal környezeti
// változóval felül van írva, és a fájl végén BÁJTRA igazoljuk.
// ⚠️ AZ ÉRTÉKADÁS AZ IMPORT ELŐTT KELL — a statikus `import` felülemelkedik a
// kódon, ezért DINAMIKUS minden import alább.
// ⚠️ `fileURLToPath`, NEM `.pathname`: Windowson az utóbbi „/C:/AI%20work/…"-et
// ad, amitől az `existsSync` némán hamisat mond — és a záró őr hallgatna.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { fileURLToPath } from 'url';
import { join } from 'path';
import { tmpdir } from 'os';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const ELES_GUARD = join(REPO, 'memory', 'ai-latency-guard.json');
// Bájtra: Bufferként olvasunk, hogy a sorvég se csúszhasson el észrevétlenül.
const ELOTTE = existsSync(ELES_GUARD) ? readFileSync(ELES_GUARD) : null;

const MUNKA = join(tmpdir(), 'aiworld-latencia-teszt-' + process.pid);
mkdirSync(MUNKA, { recursive: true });
const TESZT_GUARD = join(MUNKA, 'ai-latency-guard.json');
process.env.AI_LATENCY_GUARD_PATH = TESZT_GUARD;

const {
  GUARD_FAJL, GUARD_PATH, LASSU_MP, IDOTULLEPESEK_MAX,
  idotullepesE, kulcsHianyE, ujNap, latenciaProblemak, frissit, jegyezLatencia, latenciaSor
} = await import('./ai-latency-guard.js');

let pass = 0, bukott = 0;
const t = async (nev, fn) => {
  try { await fn(); pass++; console.log('  ✅ ' + nev); }
  catch (e) { bukott++; console.log('  ❌ ' + nev + '\n     ' + String(e && e.message).split('\n').join('\n     ')); }
};

const guardOlvas = () => JSON.parse(readFileSync(TESZT_GUARD, 'utf-8'));
const guardTorol = () => { try { rmSync(TESZT_GUARD, { force: true }); } catch { /* */ } };

// ── A 2026-09-16-i ÉLES ESET, adatként ──────────────────────────────
const ABORT = 'The operation was aborted due to timeout';
const NAP = '2026-09-16';
const ido = (perc) => `${NAP}T02:${String(perc).padStart(2, '0')}:00.000Z`;
const hivas = (x) => ({ at: ido(10), agent: 'iro', provider: 'openrouter', model: 'minimax/minimax-m3', mp: 12, ...x });

/** CRLF → LF, a TELJES SOROS `//` kommentek üres sorra cserélve (a sorszám marad). */
function kodSorok(forras) {
  return String(forras).replace(/\r\n/g, '\n').split('\n')
    .map(l => (/^\s*(\/\/|\/\*|\*)/.test(l) ? '' : l)).join('\n');
}
const ROUTER = kodSorok(readFileSync(join(REPO, 'core', 'ai-router.js'), 'utf-8'));
const RIPORT = kodSorok(readFileSync(join(REPO, 'core', 'daily-report.js'), 'utf-8'));

console.log('🧪 AI-késleltetés-őr\n');

// ───────────────────────────────────────────────────────────────────
// 1) A RIPORT-SOR — a lelet ELJUT a userhez, és nem némítható el
// ───────────────────────────────────────────────────────────────────
await t('1a) A VALÓDI ESET: a két beragadt hívás megjelenik a riport-sorban', async () => {
  // A 09-16-i nap, ahogy a routerből jönne: két 8,0 perces abortált hívás,
  // egy 4,7 perces SIKERES, és sok gyors.
  let rec = null;
  rec = frissit(rec, hivas({ at: ido(13), agent: 'designer', model: 'minimax-m2.5', mp: 480.2, hiba: ABORT }));
  rec = frissit(rec, hivas({ at: ido(22), agent: 'seo', model: 'minimax-m2.5', mp: 480.1, hiba: ABORT }));
  rec = frissit(rec, hivas({ at: ido(30), agent: 'seo', model: 'minimax-m2.5', mp: 282 }));
  for (let i = 0; i < 12; i++) rec = frissit(rec, hivas({ at: ido(40) }));

  const sor = latenciaSor(rec);
  assert.ok(sor.startsWith('⚠️'), 'nem vészjelzés-mintás, a zajszűrő elnémíthatná: ' + sor);
  assert.ok(sor.includes('designer'), 'nem mondja meg, MELYIK agent ragadt be: ' + sor);
  assert.ok(sor.includes('seo'), 'a második beragadt agent hiányzik: ' + sor);
  assert.ok(sor.includes('minimax-m2.5'), 'nem mondja meg, MELYIK modellnél: ' + sor);
  assert.ok(sor.includes('16,0 perc'), 'nem mondja meg, MENNYI idő veszett el: ' + sor);
  assert.ok(sor.includes('15 hívásból'), 'nincs NEVEZŐ — 2 időtúllépés 15-ből MÁS, mint 2 a 2-ből: ' + sor);
  assert.ok(sor.includes(NAP), 'nincs benne a NAP — egy beragadt (nem frissülő) fájl így észrevétlen maradna: ' + sor);
});

await t('1b) a sort a riport-zajszűrő SEM némíthatja el — két egymást követő napon', async () => {
  const { szurZajt, dontes } = await import('./report-noise.js');
  const sor = latenciaSor(frissit(null, hivas({ agent: 'designer', model: 'minimax-m2.5', mp: 480, hiba: ABORT })));
  assert.ok(sor, 'nincs is sor, amit szűrni lehetne');

  // (1) MA: a szűrő egyetlen szabálya sem illeszkedik erre a sorra, tehát
  // érintetlenül megy tovább — a MÁSODIK napon is, VÁLTOZATLAN szöveggel.
  const elso = szurZajt([sor], {});
  assert.ok(elso.sorok.includes(sor), 'már az első napon elnyelte');
  const masodik = szurZajt([sor], elso.allapot);
  assert.ok(masodik.sorok.includes(sor), '🔴 a zajszűrő a MÁSODIK napon elnyelte a beragadás-jelzést');
  assert.ok(!masodik.csendes.length, 'a „csendben rendben" listára került, vagyis szabály alá esett');

  // (2) ⚠️ ÉS AKKOR SEM, HA HOLNAP VALAKI SZABÁLYT ÍR RÁ. Ez az igazi tét: a
  // fenti zöld MA azon múlik, hogy nincs illeszkedő szabály — ez pedig egyetlen
  // sorral megszűnhet a SZABALYOK tömbben. A 'valtozas' mód a napokig
  // VÁLTOZATLAN sort másodszorra elnémítaná, márpedig itt a KITARTÓ beragadás
  // MAGA a hír. A ⚠️ a `VESZ_RX` vész-kivételt nyitja, ami minden módot felülír.
  const szabaly = { kulcs: 'probaLatencia', minta: 'AI-LASSULÁS', mod: 'valtozas', nev: 'próba' };
  assert.equal(dontes(szabaly, sor, sor).mutasd, true,
    '🔴 egy VÁLTOZATLAN beragadás-sor elnémulna, ha valaha szabály kerül rá');

  // 🔬 MŰSZER-HITELESÍTÉS ISMERT ESETTEL: ugyanez a szabály egy ⚠️ NÉLKÜLI,
  // változatlan sort TÉNYLEG elnémít. Enélkül a fenti állítás bármit „igazolna".
  assert.equal(dontes(szabaly, 'AI-LASSULÁS: minden rendben', 'AI-LASSULÁS: minden rendben').mutasd, false,
    'a mérőeszköz hibás: a ⚠️ nélküli változatlan sort sem némítja el — akkor a fenti zöld semmit nem ér');
});

await t('1c) hibátlan napon CSENDBEN marad (a csendes nap maradjon csendes)', async () => {
  let rec = null;
  for (const mp of [3, 12, 44, 90, 180, 282]) rec = frissit(rec, hivas({ mp }));
  assert.equal(latenciaSor(rec), '',
    '🔴 zajongott egy NORMÁLIS napra (a 09-16-i leglassabb SIKERES hívás is 282 mp volt)');
});

await t('1d) hiányzó/sérült fájlra NEM kiált farkast', async () => {
  // ⚠️ SZÁNDÉKOS: ha a HAVI keret betelt (user-döntés — minden agent paid-only,
  // az `ask()` hívás nélkül null-t ad), egyetlen hívás sem indul, tehát nincs
  // mit feljegyezni. Egy „nem tudom" sor ilyenkor NAPI hamis riasztás lenne —
  // és a hamis riasztás megeszi az igazit is.
  for (const rossz of [null, undefined, 'hopp', 42, [], {}]) {
    assert.equal(latenciaSor(rossz), '', 'zajongott erre: ' + JSON.stringify(rossz));
  }
});

// ───────────────────────────────────────────────────────────────────
// 2) A LELET — mit tekintünk gondnak?
// ───────────────────────────────────────────────────────────────────
await t('2a) EGY időtúllépés is lelet (nincs „elhanyagolható" küszöb)', async () => {
  const p = latenciaProblemak(frissit(null, hivas({ agent: 'seo', model: 'minimax-m2.5', mp: 480, hiba: ABORT })));
  assert.equal(p.length, 1, 'rossz leletszám: ' + JSON.stringify(p));
  assert.equal(p[0].code, 'AI_IDOTULLEPES');
  assert.ok(p[0].detail.includes('seo/minimax-m2.5 ×1'), 'nem hordozza az agentet/modellt: ' + p[0].detail);
  assert.ok(p[0].detail.includes('8,0 perc'), 'nem hordozza az elveszett időt: ' + p[0].detail);
});

await t('2b) a türelem-plafon közelébe érő SIKERES hívás is lelet', async () => {
  const alatta = frissit(null, hivas({ mp: LASSU_MP - 1 }));
  assert.deepEqual(latenciaProblemak(alatta), [], 'a küszöb ALATT is zajongott');
  const felette = frissit(null, hivas({ agent: 'iro', model: 'minimax/minimax-m3', mp: LASSU_MP + 17 }));
  const p = latenciaProblemak(felette);
  assert.equal(p.length, 1, 'a plafon közeli hívás nem lett lelet: ' + JSON.stringify(p));
  assert.equal(p[0].code, 'AI_LASSU_HIVAS');
  assert.ok(p[0].detail.includes('iro'), 'nem mondja meg, KI volt lassú: ' + p[0].detail);
});

await t('2c) a beragadt hívást NEM mondjuk el kétszer, de a lassú BUKÁS nem vész el', async () => {
  // Egy időtúllépés per definitionem a plafonig ér, tehát ő a `leglassabb` is.
  // Ha mindkét lelet elsülne, ugyanaz a 8 perc menne ki kétszer, más szavakkal.
  const tullepett = frissit(null, hivas({ agent: 'seo', model: 'minimax-m2.5', mp: 480, hiba: ABORT }));
  assert.equal(tullepett.leglassabb.tullepes, true, 'nincs zászló a leglassabb hívásra');
  assert.deepEqual(latenciaProblemak(tullepett).map(x => x.code), ['AI_IDOTULLEPES'],
    'ugyanazt a hívást kétszer jelentette');

  // 🔑 DE A ZÁSZLÓ „IDŐTÚLLÉPÉS-E", NEM „BUKOTT-E". Egy 400 mp után HTTP
  // 500-zal elhasaló hívás nincs az időtúllépés-listán — helyette senki nem
  // szólna, tehát MARAD lelet.
  const mashogy = frissit(null, hivas({ agent: 'iro', model: 'minimax/minimax-m3', mp: 400, hiba: 'openrouter HTTP 500' }));
  assert.equal(mashogy.leglassabb.tullepes, false);
  assert.deepEqual(latenciaProblemak(mashogy).map(x => x.code), ['AI_LASSU_HIVAS'],
    '🔴 a lassan elhasaló (nem abortált) hívás NÉMA maradt');

  // Ugyanez a háló véd, ha egy időtúllépés-üzenet kicsúszik a mintából.
  const ismeretlen = frissit(null, hivas({ agent: 'seo', model: 'minimax-m2.5', mp: 479, hiba: 'valami vadonatúj üzenet' }));
  assert.ok(latenciaProblemak(ismeretlen).length, '🔴 a mintából kicsúszó beragadás teljesen néma lett');
});

await t('2d) 🔗 a LASSU_MP tényleg a router türelem-plafonja ALATT van (a két szám nem csúszhat el)', async () => {
  // A 480 mp SZÁNDÉKOSAN nincs átmásolva az őrszembe: „egy szám, ami két
  // helyen van, elcsúszik" (a munkafolyamat „9,5 óra" kommentje 7 napig
  // hazudott). Itt a ROUTER FORRÁSÁBÓL olvassuk ki a valódi értéket.
  const m = ROUTER.match(/AI_CALL_TIMEOUT_MS\s*=\s*([^;]+);/);
  assert.ok(m, 'nincs AI_CALL_TIMEOUT_MS a routerben — átnevezték?');
  const turelemMp = Number(new Function('return (' + m[1] + ')')()) / 1000;
  assert.ok(Number.isFinite(turelemMp) && turelemMp > 0, 'nem szám a türelem: ' + m[1]);
  assert.ok(LASSU_MP < turelemMp,
    `a LASSU_MP (${LASSU_MP}) nem kisebb a router türelménél (${turelemMp} mp) — a „lassú" lelet sosem sülne el`);
  assert.ok(LASSU_MP >= turelemMp * 0.5,
    `a LASSU_MP (${LASSU_MP}) a türelem felénél is kisebb (${turelemMp} mp) — napi zajt gyártana`);
});

await t('2e) értelmezhetetlen bemenetre üres lista, nem kitalált lelet', async () => {
  for (const rossz of [null, undefined, 'hopp', 42, []]) {
    assert.deepEqual(latenciaProblemak(rossz), [], 'kitalált leletet gyártott erre: ' + JSON.stringify(rossz));
  }
  assert.deepEqual(latenciaProblemak({ idotullepesek: 'nem tömb', leglassabb: 'nem objektum' }), [],
    'szemétből is leletet csinált');
});

// ───────────────────────────────────────────────────────────────────
// 3) AZ IDŐTÚLLÉPÉS FELISMERÉSE — explicit alakok, nem szó-illesztés
// ───────────────────────────────────────────────────────────────────
await t('3a) a VALÓDI abort-üzenetet felismeri', async () => {
  assert.equal(idotullepesE(ABORT), true, '🔴 a 09-16-i két beragadt hívás üzenetét NEM ismeri fel');
  assert.equal(idotullepesE(new Error('TimeoutError: ' + ABORT)), true, 'Error-objektumból sem olvassa ki');
  for (const m of ['connect ETIMEDOUT 1.2.3.4:443', 'ESOCKETTIMEDOUT', 'openrouter HTTP 504: Gateway Timeout', 'upstream request timed out']) {
    assert.equal(idotullepesE(m), true, 'nem ismerte fel: ' + m);
  }
});

await t('3b) a NEM időtúllépés hibákat nem sorolja ide', async () => {
  for (const m of [null, undefined, '', 'openrouter HTTP 429: rate limit', 'Üres válasz',
    'openrouter HTTP 402: insufficient credits', 'fetch failed']) {
    assert.equal(idotullepesE(m), false, 'tévesen időtúllépésnek vette: ' + JSON.stringify(m));
  }
});

await t('3c) a „nincs kulcs" NEM hívás — nem hamisítja a napi statisztikát', async () => {
  // A `getClient()` és a `makeOpenAICaller()` a kulcs hiányában AZONNAL dob, egy
  // bájt kérés nélkül. Kulcs nélküli CI-lépésekben ez naponta több száz 0 mp-es
  // „hívás" lenne — a „ma N hívás volt" szám elveszítené a jelentését.
  assert.equal(kulcsHianyE('OPENROUTER_API_KEY nincs a .env fájlban!'), false,
    'a valódi üzenet alakja fordított — ellenőrizd a mintát');
  assert.equal(kulcsHianyE('nincs GOOGLE_API_KEY'), true);
  assert.equal(kulcsHianyE('openrouter HTTP 429: quota'), false, 'valódi hibát nyelt el konfig-hiányként');
  guardTorol();
  assert.equal(jegyezLatencia(hivas({ mp: 0.001, hiba: 'nincs MISTRAL_API_KEY' })), false,
    '🔴 a kulcs nélküli lépés beleszámolt a napi hívás-statisztikába');
  assert.equal(existsSync(TESZT_GUARD), false, 'fájlt is írt egy meg sem történt hívásról');
});

// ───────────────────────────────────────────────────────────────────
// 4) 🧹 NAPI TISZTA LAP — kell ÚT VISSZA A NULLÁHOZ
//    „Ha egy számláló N bukást jelent, kell út vissza a nullához is."
// ───────────────────────────────────────────────────────────────────
await t('4a) ugyanazon a napon ÖSSZEFŰZ (a kár nem tűnhet el egy későbbi jó hívástól)', async () => {
  let rec = frissit(null, hivas({ agent: 'seo', model: 'minimax-m2.5', mp: 480, hiba: ABORT }));
  rec = frissit(rec, hivas({ at: ido(40), mp: 5 }));
  assert.equal(rec.hivasok, 2);
  assert.equal(rec.bukott, 1);
  assert.equal(rec.idotullepesek.length, 1, '🔴 a későbbi jó hívás letörölte a nap bizonyítékát');
  assert.ok(latenciaSor(rec), 'a lelet eltűnt a riport-sorból');
});

await t('4b) ÚJ NAPON nulláról indul (út vissza a nullához)', async () => {
  const tegnap = frissit(null, hivas({ agent: 'seo', model: 'minimax-m2.5', mp: 480, hiba: ABORT }));
  const ma = frissit(tegnap, hivas({ at: '2026-09-17T02:10:00.000Z', mp: 5 }));
  assert.equal(ma.nap, '2026-09-17');
  assert.equal(ma.hivasok, 1, '🔴 átvitte a tegnapi hívás-számot: ' + ma.hivasok);
  assert.equal(ma.bukott, 0);
  assert.equal(ma.osszMp, 5);
  assert.equal(ma.veszettMp, 0);
  assert.deepEqual(ma.idotullepesek, [], '🔴 a tegnapi időtúllépés örökre pirosan ragadt');
  assert.equal(ma.leglassabb.mp, 5, 'a tegnapi csúcs átcsúszott a mai napra');
  assert.equal(latenciaSor(ma), '', '🔴 a riport MA is a TEGNAPI beragadást jelentené');
});

await t('4c) ismeretlen alakú/hiányzó napú előzményből is tiszta lapot csinál', async () => {
  for (const rossz of [{ hivasok: 99 }, { nap: null, idotullepesek: [{ agent: 'x', db: 7 }] }, { nap: 'tegnap' }]) {
    const r = frissit(rossz, hivas({ mp: 5 }));
    assert.equal(r.hivasok, 1, 'régi/sérült alakból hozott át adatot: ' + JSON.stringify(rossz));
    assert.deepEqual(r.idotullepesek, [], 'sérült listát is átvett: ' + JSON.stringify(rossz));
  }
});

await t('4d) ugyanaz az agent+modell EGY sorba számolódik, a lista nem nő a végtelenbe', async () => {
  let rec = null;
  for (let i = 0; i < 3; i++) rec = frissit(rec, hivas({ agent: 'seo', model: 'minimax-m2.5', mp: 480, hiba: ABORT }));
  assert.equal(rec.idotullepesek.length, 1, 'agentenként-modellenként EGY sor kellene');
  assert.equal(rec.idotullepesek[0].db, 3, 'nem számolta össze: ' + JSON.stringify(rec.idotullepesek));
  for (let i = 0; i < IDOTULLEPESEK_MAX + 5; i++) {
    rec = frissit(rec, hivas({ agent: 'a' + i, model: 'm' + i, mp: 480, hiba: ABORT }));
  }
  assert.ok(rec.idotullepesek.length <= IDOTULLEPESEK_MAX,
    'a lista korlátlanul nőtt: ' + rec.idotullepesek.length);
  assert.ok(latenciaProblemak(rec)[0].detail.includes('×3'),
    'a plafon levágta a LEGGYAKORIBB beragadót: ' + latenciaProblemak(rec)[0].detail);
});

await t('4e) az `ujNap()` alakja illeszkedik az őrszem-mintához', async () => {
  const u = ujNap(NAP);
  assert.equal(u.nap, NAP);
  assert.equal(u.hivasok, 0);
  assert.ok(Array.isArray(u.problems) && u.problems.length === 0);
  assert.ok(Array.isArray(u.idotullepesek) && u.idotullepesek.length === 0);
});

// ───────────────────────────────────────────────────────────────────
// 5) A LEMEZRE ÍRÁS — őrszem-minta, robusztusság, és SOHA NEM DOB
// ───────────────────────────────────────────────────────────────────
await t('5a) a lemezre írt alak illeszkedik az őrszem-mintához ({at, problems})', async () => {
  guardTorol();
  assert.equal(jegyezLatencia(hivas({ agent: 'designer', model: 'minimax-m2.5', mp: 480.2, hiba: ABORT })), true);
  const g = guardOlvas();
  assert.ok(g.at, 'nincs `at` — semmilyen frissesség-vizsgálat nem látná');
  assert.ok(Array.isArray(g.problems) && g.problems.length === 1, 'nincs `problems` tömb: ' + JSON.stringify(g));
  assert.equal(g.nap, NAP);
  assert.equal(g.hivasok, 1);
  assert.equal(g.leglassabb.agent, 'designer', 'a leglassabb hívás nem jutott el a lemezre');
  assert.equal(Math.round(g.leglassabb.mp), 480);
  assert.ok(latenciaSor(g).includes('designer'), 'a riport-sor nem áll össze a LEMEZRE ÍRT alakból: ' + latenciaSor(g));
});

await t('5b) a lemezen ÖSSZEADÓDIK a több hívás (folyamatok között is átér)', async () => {
  guardTorol();
  jegyezLatencia(hivas({ at: ido(13), agent: 'designer', model: 'minimax-m2.5', mp: 480.2, hiba: ABORT }));
  jegyezLatencia(hivas({ at: ido(22), agent: 'seo', model: 'minimax-m2.5', mp: 480.1, hiba: ABORT }));
  jegyezLatencia(hivas({ at: ido(30), agent: 'seo', model: 'minimax-m2.5', mp: 282 }));
  const g = guardOlvas();
  assert.equal(g.hivasok, 3);
  assert.equal(g.bukott, 2);
  assert.equal(g.idotullepesek.length, 2);
  assert.equal(Math.round(g.veszettMp), 960, 'a veszett idő nem stimmel: ' + g.veszettMp);
  assert.ok(latenciaSor(g).includes('16,0 perc'), 'a riport-sor nem hozza a veszett időt: ' + latenciaSor(g));
});

await t('5c) a fájlnév és az útvonal EGY helyen él (a riport is erre hivatkozik)', async () => {
  assert.equal(GUARD_FAJL, 'ai-latency-guard.json');
  assert.equal(GUARD_PATH, TESZT_GUARD, 'a környezeti felülírás nem hatott — a teszt az ÉLES fájlba írna!');
});

await t('5d) SOHA nem dob — egy őrszem nem akaszthat meg egy AI-hívást', async () => {
  // ⚠️ EZ AZ ÚT KORÁBBAN (másik tesztben) 'Z:/nincs/ilyen/ut/x.json' VOLT, és
  // élesben elsült: Windowson nem létező meghajtó, LINUXON viszont közönséges
  // RELATÍV mappa — a CI létrehozta a repóban, és becommitolta. Egy LÉTEZŐ
  // FÁJL alá mutató út mindkét rendszeren ENOTDIR-t ad (kimérve).
  const IRHATATLAN = join(fileURLToPath(import.meta.url), 'nem-mappa', 'x.json');
  assert.doesNotThrow(() => jegyezLatencia(hivas({ mp: 5 }), IRHATATLAN));
  assert.equal(jegyezLatencia(hivas({ mp: 5 }), IRHATATLAN), false, 'sikert hazudott egy írhatatlan útra');
  for (const rossz of [null, undefined, 'hopp', 42, [], {}, { at: 'nem-dátum', mp: 5 }, { at: ido(10), mp: 'sok' }, { at: ido(10), mp: -3 }]) {
    assert.doesNotThrow(() => jegyezLatencia(rossz, TESZT_GUARD), 'dobott erre: ' + JSON.stringify(rossz));
  }
});

await t('5e) a sérült fájl nem szennyezi be az új bejegyzést', async () => {
  guardTorol();
  writeFileSync(TESZT_GUARD, '{ ez nem json', 'utf-8');
  assert.equal(jegyezLatencia(hivas({ mp: 7 })), true, 'sérült fájl után nem írt újat');
  assert.equal(guardOlvas().hivasok, 1);
});

await t('5f) a használhatatlan eseménytől a MEGLÉVŐ bejegyzés érintetlen marad', async () => {
  guardTorol();
  jegyezLatencia(hivas({ agent: 'seo', model: 'minimax-m2.5', mp: 480, hiba: ABORT }));
  const elotte = readFileSync(TESZT_GUARD, 'utf-8');
  assert.equal(jegyezLatencia({ at: 'hopp', mp: 5 }), false, 'használhatatlan eseményre írt');
  assert.equal(readFileSync(TESZT_GUARD, 'utf-8'), elotte, '🔴 egy szemét-esemény felülírta a nap bizonyítékát');
});

// ───────────────────────────────────────────────────────────────────
// 6) 🔌 BEKÖTÉS-ŐR — a lánc VÉGÉT mérjük
//    „Sikeres válasz ≠ elvégzett munka": egy tökéletes őrszem, amit senki nem
//    hív meg és senki nem olvas, pontosan annyit ér, mint a CI-napló.
// ───────────────────────────────────────────────────────────────────
await t('6a) a ROUTER importálja a jegyzőt', async () => {
  assert.match(ROUTER, /import\s*\{[^}]*jegyezLatencia[^}]*\}\s*from\s*'\.\/ai-latency-guard\.js'/,
    '🔴 a core/ai-router.js nem importálja a jegyezLatencia()-t — semmi nem mérne');
});

await t('6b) a router MÉRŐJE tényleg a jegyezLatencia()-t hívja, és nem dobhat', async () => {
  const m = ROUTER.match(/function\s+merHivas\s*\([\s\S]{0,900}?\n\}/);
  assert.ok(m, '🔴 nincs merHivas() a routerben — átnevezték vagy törölték');
  assert.match(m[0], /jegyezLatencia\s*\(/, '🔴 a merHivas() nem hívja a jegyezLatencia()-t (dísz lett)');
  assert.match(m[0], /try\s*\{[\s\S]*\}\s*catch/,
    '🔴 a merHivas() nincs try/catch-ben — egy mérési hiba API-hibának látszana, és fölösleges fallbackot indítana');
});

await t('6c) 🔑 a SIKERES hívás mérve van — a stopper a hálózati hívás ELŐTT indul', async () => {
  const i = ROUTER.indexOf('await caller(prompt, model');
  assert.ok(i > 0, 'nem találom a szolgáltató-hívást a routerben — átírták?');
  const elotte = ROUTER.slice(Math.max(0, i - 500), i);
  assert.match(elotte, /const\s+merKezdet\s*=\s*Date\.now\(\)/,
    '🔴 a stopper NEM a hívás előtt indul — a beragadás ideje nem mérhető');
  const utana = ROUTER.slice(i, i + 700);
  assert.match(utana, /merHivas\(\s*agentName\s*,\s*provider\s*,\s*model\s*,\s*merKezdet\s*,\s*null\s*\)/,
    '🔴 a SIKERES hívás nincs megmérve — a „leglassabb hívás" mindig üres lenne');
});

await t('6d) 🔑 a BUKOTT (abortált) hívás is mérve van — ez volt az EGÉSZ lelet', async () => {
  const i = ROUTER.indexOf('} catch (error) {');
  assert.ok(i > 0, 'nem találom a hiba-ágat a routerben');
  const utana = ROUTER.slice(i, i + 700);
  assert.match(utana, /merHivas\(\s*agentName\s*,\s*provider\s*,\s*model\s*,\s*merKezdet\s*,\s*error\s*\)/,
    '🔴 a bukott hívás ideje nincs megmérve — pont a 8 percig lógó, 0+0 tokenes hívás maradna néma');
});

await t('6e) 🔑 EGY KÖR = EGY FELJEGYZÉS — a sikeres hívás nem könyvelődik kétszer', async () => {
  // A `caller()` UTÁN még sok minden fut ugyanabban a `try`-ban (biztonsági
  // szűrő, költség-könyvelés, vészháló-riasztás). Ha ott dobna valami, a
  // `catch` MÁSODSZOR is feljegyezné ugyanazt a hálózati kört — egyszer
  // sikeresként, egyszer bukottként —, és a napi „N hívásból" nevező hazudna.
  assert.match(ROUTER, /let\s+merKesz\s*=\s*false\s*;/,
    '🔴 nincs kör-zászló a routerben: egy helyi hiba kétszer könyvelné ugyanazt a hívást');
  const i = ROUTER.indexOf('await caller(prompt, model');
  assert.ok(i > 0, 'nem találom a szolgáltató-hívást a routerben');
  assert.match(ROUTER.slice(i, i + 700), /merKesz\s*=\s*true\s*;/,
    '🔴 a sikeres kör nem jelöli magát elkönyveltnek');
  const c = ROUTER.indexOf('} catch (error) {');
  assert.match(ROUTER.slice(c, c + 700), /if\s*\(\s*!merKesz\s*\)\s*merHivas\(/,
    '🔴 a hiba-ág zászló nélkül jegyez — a már megmért kör másodszor is beleszámol');
});

await t('6f) a NAPI RIPORT beolvassa a fájlt ÉS kiírja a sort', async () => {
  assert.match(RIPORT, /from\s*'\.\/ai-latency-guard\.js'/, '🔴 a riport nem importálja az ai-latency-guard.js-t');
  assert.match(RIPORT, /readFileSync\(join\(ROOT, 'memory', 'ai-latency-guard\.json'\)/,
    '🔴 a riport nem olvassa a memory/ai-latency-guard.json-t');
  const i = RIPORT.indexOf('latenciaSor(');
  const hivasHely = RIPORT.indexOf('const sor = latenciaSor(');
  assert.ok(hivasHely > 0, '🔴 a riport nem hívja a latenciaSor()-t: ' + i);
  assert.match(RIPORT.slice(hivasHely, hivasHely + 200), /if\s*\(sor\)\s*lines\.push\(sor\)/,
    '🔴 a riport meghívja a latenciaSor()-t, de az eredményét NEM teszi be a jelentésbe');
});

await t('6g) a riport-blokk NEM hívja el a főjelentést, ha a fájl hiányzik', async () => {
  const i = RIPORT.indexOf("readFileSync(join(ROOT, 'memory', 'ai-latency-guard.json')");
  const blokk = RIPORT.slice(Math.max(0, i - 200), i + 400);
  assert.match(blokk, /\}\s*catch\s*\{/,
    '🔴 a beolvasás nincs try/catch-ben — egy hiányzó fájl megölné az EGÉSZ napi jelentést');
});

// ───────────────────────────────────────────────────────────────────
// 7) AZ ÉLES ÁLLAPOTFÁJL ÉRINTETLEN
//    ⚠️ Ez CSAK AKKOR bizonyíték, ha a kiindulás is tiszta volt: ezért
//    Bufferrel, bájtra hasonlítunk, és a NEM LÉTEZÉST is ellenőrizzük
//    (a `null` is érvényes kiindulás).
// ───────────────────────────────────────────────────────────────────
{
  const mostani = existsSync(ELES_GUARD) ? readFileSync(ELES_GUARD) : null;
  const egyezik = (mostani === null && ELOTTE === null)
    || (mostani !== null && ELOTTE !== null && Buffer.compare(mostani, ELOTTE) === 0);
  if (egyezik) { pass++; console.log('  ✅ 🔒 az éles memory/ai-latency-guard.json érintetlen'); }
  else {
    bukott++;
    console.log('  ❌ 🔴 A TESZT BELEÍRT AZ ÉLES memory/ai-latency-guard.json-BA — visszaállítom.');
    try {
      if (ELOTTE === null) rmSync(ELES_GUARD, { force: true });
      else writeFileSync(ELES_GUARD, ELOTTE);
    } catch { /* mindegy */ }
  }
}

try { rmSync(MUNKA, { recursive: true, force: true }); } catch { /* */ }
console.log(`\n${bukott === 0 ? '✅' : '❌'} ai-latency-guard.test: ${pass} rendben, ${bukott} bukott`);
process.exit(bukott === 0 ? 0 : 1);
