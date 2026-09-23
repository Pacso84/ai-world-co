// ===================================================================
// TESZT — INFOGRAFIKÁS KÖZÖSSÉGI KÉP (2026-09-21)
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// A user olyan posztokat mutatott, amik most mennek a Facebookon, és azt
// kérte, csináljunk ilyet. Három kar megy egyszerre (mostani fotó /
// világos infografika / sötét infografika), és a számok döntenek.
//
// AMIT EZ A TESZT ŐRIZ, ÉS MIÉRT:
//
// 1) A MÉRÉS ÉRVÉNYESSÉGE. A kar a slugból SZÁMOLÓDIK, nincs külön
//    nyilvántartás. Ha ez elcsúszna vagy véletlenszerű lenne, ugyanaz a
//    cikk hol ilyen, hol olyan képet kapna — és a háromhetes mérésből
//    semmit nem lehetne kiolvasni.
//
// 2) A FÉLBEHAGYOTT MONDAT. Az első változatom „Connect your Gmail,
//    Drive," és „…Drive, and…" sorokat írt a képre. Ez a projekt
//    visszatérő hibája (a Reel tördelője ugyanezt csinálta tegnapig):
//    a félbehagyott szöveg nem rövidítésnek látszik, hanem HIBÁNAK — és
//    épp azt a „gépi tartalomgyár" benyomást erősíti, ami miatt a
//    keresők leminősítettek minket.
//
// 3) AZ ÍZELÍTŐ-ELV. A mutatott minták listát építenek („kommentelj a
//    csomagért"); NEKÜNK KATTINTÁS KELL. Ha a kép egyszer elkezdené az
//    ÖSSZES lépést kirakni, elveszne az ok, amiért valaki átjön.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  kar, KAROK, STILUS, poszterSvg, lepesSzoveg, lepesekMdbol, alkalmas,
  LEPES_MAX_DB, LEPES_MAX_KAR, W, H, HATTER_ELMOSAS, HATTER_TELITETTSEG
} from './social-poster.js';
import { splitHeading } from './short-video.js';
import { utmutatoE } from './guide-kind.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CIKK_DIR = join(ROOT, 'content', 'articles');

let pass = 0, bukott = 0;
const t = (nev, fn) => {
  try { fn(); pass++; console.log('  ✅ ' + nev); }
  catch (e) { bukott++; console.log('  ❌ ' + nev + '\n     ' + String(e.message).split('\n')[0]); }
};

console.log('🧪 infografikás közösségi kép\n');

// A valódi útmutatók — a fésű ezen fut, nem kitalált mintán.
const UTMUTATOK = (() => {
  const ki = [];
  for (const f of readdirSync(CIKK_DIR).filter(x => x.endsWith('.json'))) {
    let j; try { j = JSON.parse(readFileSync(join(CIKK_DIR, f), 'utf-8')); } catch { continue; }
    const slug = j._meta && j._meta.slug;
    const md = j.article_markdown || '';
    if (!slug || !utmutatoE(f, j) || !alkalmas(md)) continue;
    const cim = (md.match(/^title:\s*["']?(.+?)["']?\s*$/m) || [])[1] || j.original_title || '';
    ki.push({ slug, cim, lepesek: lepesekMdbol(md) });
  }
  return ki;
})();

t('a minta nem ürült ki (a „0 hiba" a semmiből is kijön)', () => {
  assert.ok(UTMUTATOK.length >= 300, 'csak ' + UTMUTATOK.length + ' útmutatót lát — romlott a minta');
});

// ===================================================================
// 1. A MÉRÉS ÉRVÉNYESSÉGE — a kar-osztás
// ===================================================================
t('🔑 a kar DETERMINISZTIKUS — ugyanaz a cikk mindig ugyanazt a képet kapja', () => {
  for (const u of UTMUTATOK.slice(0, 50)) assert.equal(kar(u.slug), kar(u.slug));
  assert.equal(kar('valami-slug'), kar('valami-slug'));
});

t('🔑 a három kar nagyjából egyformán oszlik el (különben a mérés torz)', () => {
  const db = Object.fromEntries(KAROK.map(k => [k, 0]));
  for (const u of UTMUTATOK) db[kar(u.slug)]++;
  const varhato = UTMUTATOK.length / KAROK.length;
  for (const k of KAROK) {
    const elteres = Math.abs(db[k] - varhato) / varhato;
    assert.ok(elteres < 0.25,
      k + ': ' + db[k] + ' cikk a várt ~' + Math.round(varhato) + ' helyett (' + (elteres * 100).toFixed(0) + '% eltérés)');
  }
});

t('ismeretlen vagy üres slug a mostani (fotós) karba esik', () => {
  assert.equal(kar(''), 'foto');
  assert.equal(kar(null), 'foto');
});

// ===================================================================
// 2. NINCS FÉLBEHAGYOTT MONDAT A KÉPEN
// ===================================================================
const LOGO_VEG = /(\s\b(and|or|the|a|an|of|to|for|with|from|by|into)|[,;:])…$/i;

t('🔑 EGYETLEN lépés-sor sem végződik lógó kötőszóval vagy írásjellel', () => {
  const rossz = [];
  let sorok = 0;
  for (const u of UTMUTATOK) {
    for (const l of u.lepesek.slice(0, LEPES_MAX_DB)) {
      sorok++;
      const s = lepesSzoveg(l, splitHeading);
      if (LOGO_VEG.test(s) || /[,;:]$/.test(s)) rossz.push(l + '  →  ' + s);
    }
  }
  assert.ok(sorok >= 1500, 'csak ' + sorok + ' sort mért — romlott a minta');
  assert.deepEqual(rossz.slice(0, 5), [], rossz.length + ' sor végződik félbehagyva');
});

t('🔬 [hitelesítés] a szabály MINDKÉT irányba jól dönt', () => {
  // Ismert esetek, hogy a fenti „0 hiba" ne a semmiből jöjjön.
  const r = (s) => lepesSzoveg(s, splitHeading);
  // 1. kifér egészben → változatlanul megy
  assert.equal(r('Open Gemini and sign in'), 'Open Gemini and sign in');
  // 2. a természetes fele tisztán zár → azt használjuk
  const fele = r('Pick the right model for planning your next big project');
  // A doboz tagitasa ervenytelenitette a regi varakozast: 52 karakterrel
  // a „…”-os valtozat TOBB jelentest tart meg, mint a tiszta fel.
  assert.ok(fele.length <= LEPES_MAX_KAR, "tul hosszu: " + fele);
  assert.ok(fele.length >= 30, "kiurult a sor: " + fele);
  // 3. a lógó kötőszó NEM maradhat bent
  const vagott = r('Connect your Gmail, Drive, and Calendar to the assistant');
  // Idézőjeles lépéscím: a jelek lekerülnek, félbehagyott idézet nem maradhat.
  const idezet = r('Add a "summarize into bullet points" prompt');
  assert.ok(!/["“”]/.test(idezet), 'idézőjel maradt a soron: ' + idezet);
  assert.ok(!LOGO_VEG.test(idezet), 'lógó szóval végződik: ' + idezet);
  assert.ok(!LOGO_VEG.test(vagott) && !/[,;:]$/.test(vagott), 'lógó véget hagyott: ' + vagott);
  // 4. és a mérce tényleg FOG: egy szándékosan rossz sorra igent mond
  assert.ok(LOGO_VEG.test('Connect your Gmail, Drive, and…'), 'a mérce vak — nem fogja meg a rossz alakot');
  assert.ok(LOGO_VEG.test('Open the menu,…'), 'a mérce a vesszős alakot sem fogja');
});

t('minden lépés-sor belefér a keretbe', () => {
  for (const u of UTMUTATOK) {
    for (const l of u.lepesek.slice(0, LEPES_MAX_DB)) {
      assert.ok(lepesSzoveg(l, splitHeading).length <= LEPES_MAX_KAR + 1,
        'túl hosszú sor: ' + lepesSzoveg(l, splitHeading));
    }
  }
});

// ===================================================================
// 3. AZ ÍZELÍTŐ-ELV ÉS A KÖTELEZŐ ELEMEK
// ===================================================================
t('🔑 a kép SOHA nem rak ki ötnél több lépést (ízelítő marad, nem a teljes cikk)', () => {
  const sok = UTMUTATOK.filter(u => u.lepesek.length > LEPES_MAX_DB);
  assert.ok(sok.length > 0, 'nincs elég hosszú útmutató a próbához');
  for (const u of sok.slice(0, 40)) {
    const svg = poszterSvg({ cim: u.cim, lepesek: u.lepesek, stilus: STILUS.vilagos, splitFn: splitHeading });
    const chipek = (svg.match(/text-anchor="middle"[^>]*font-size="34"/g) || []).length;
    assert.ok(chipek <= LEPES_MAX_DB, u.slug + ': ' + chipek + ' lépés került ki');
    assert.ok(/more step/.test(svg), u.slug + ': nincs „+N more step" hívás — elveszne a kattintás oka');
  }
});

t('🔑 minden képen ott az AI-jelölés és a saját címünk', () => {
  for (const nev of ['vilagos', 'sotet']) {
    const svg = poszterSvg({ cim: 'How to test things', lepesek: ['Open the app', 'Click save', 'Check it worked'], stilus: STILUS[nev], splitFn: splitHeading });
    assert.ok(/>AI</.test(svg), nev + ': hiányzik az AI-jelölés (EU AI Act)');
    // KISBETU-ERZEKETLEN: a proba szandeka az, hogy OTT VAN-E a cim es a
    // jeloles — nem az, hogy milyen betuvel. A 09-22-i dizajn szandekosan
    // kisbetus cimet ir (a csupa nagybetu a gepi munka egyik jegye).
    assert.ok(/aiworldhq.com/i.test(svg), nev + ": hianyzik a sajat cimunk");
    assert.ok(/written by ai/i.test(svg), nev + ": hianyzik az AI-irta kozles");
    assert.ok(svg.includes(`width="${W}"`) && svg.includes(`height="${H}"`), nev + ': rossz méret');
  }
});

t('a „How to" lekerül a címről (rövidebb fejléc, ugyanaz a jelentés)', () => {
  const svg = poszterSvg({ cim: 'How to Open Gemini', lepesek: ['A', 'B', 'C'], stilus: STILUS.vilagos, splitFn: splitHeading });
  assert.ok(!/How to Open/.test(svg), 'bent maradt a „How to"');
  assert.ok(/Open Gemini/.test(svg), 'eltűnt a cím érdemi része');
});

// ===================================================================
// 4. A BEKÖTÉS — csak útmutató kap infografikát
// ===================================================================
t('🔑 hír SOHA nem kap infografikát (nincsenek lépései)', () => {
  const forras = readFileSync(join(ROOT, 'core', 'share-images.js'), 'utf-8')
    .split('\n').filter(s => !s.trim().startsWith('//')).join('\n');
  assert.ok(/utmutatoE\(f, d\)/.test(forras), 'a share-images nem kérdezi meg, útmutató-e');
  assert.ok(/alkalmas\(d\.article_markdown/.test(forras), 'nem nézi meg, van-e elég lépés');
  assert.ok(/infoKar !== 'foto'/.test(forras), 'a kar nem kapuzza az infografikát');
  assert.ok(/fmt\.key === 'fb'/.test(forras), 'az infografika nem csak a Facebook-formátumra megy');
});

t('a hír-cikkek tényleg kimaradnak a mintából', () => {
  // A nem-útmutatók közül egy se legyen a listánkban.
  let hir = 0;
  for (const f of readdirSync(CIKK_DIR).filter(x => x.endsWith('.json')).slice(0, 200)) {
    let j; try { j = JSON.parse(readFileSync(join(CIKK_DIR, f), 'utf-8')); } catch { continue; }
    if (!utmutatoE(f, j)) hir++;
  }
  assert.ok(hir > 0, 'nincs hír a mintában — a próba nem bizonyít semmit');
});

// ===================================================================
// 5. A HÁTTÉRKÉP ÉLES — ÉS A CÍM MÉGIS OLVASHATÓ
// ===================================================================
t('🔑 a háttérkép éles marad', () => {
  // Régen elmostuk, mert a gépi borítókon néha zagyva felirat van
  // („perrplexity", két r-rel). Az indok MEGDŐLT: ugyanez a fájl élesen
  // megy ki a cikkoldalon (build.js <img src="/assets/images/...">) és a
  // mostani fotó-poszton is — az elmosás tehát semmit nem takart.
  // ⚠️ A Reel háttere MÁS eset (short-video.js): ott a szöveg a TELJES
  // képen fut végig, ezért ott az elmosás MARAD. Ne vidd át ezt a döntést.
  assert.equal(HATTER_ELMOSAS, 0, 'a képnek élesnek kell lennie: ' + HATTER_ELMOSAS);
  assert.ok(HATTER_TELITETTSEG <= 1.5, 'túlzott telítettség: ' + HATTER_TELITETTSEG);
});

t('🔑 minden fehér szöveg alatt ott a sötét glória', () => {
  // 60 valódi borítón mérve: éles képen, glória NÉLKÜL a legrosszabb
  // borító 1,3:1 kontrasztot adott a fehér címnek — a nagy betű alsó
  // határa 3:1, tehát 60-ból 55 olvashatatlan lett volna. Erősebb fátyol
  // elvenné a képet; a glória viszont a KÉPTŐL FÜGGETLENÜL garantál sötét
  // keretet minden betű köré. Ez a poszter egyetlen olvashatóság-védelme.
  const svg = poszterSvg({
    cim: 'How to keep your notes tidy with an AI assistant',
    lepesek: ['Open the app and sign in', 'Paste your notes into the box'],
    kellenek: ['A free account'], hibak: ['People skip the first step'],
    stilus: STILUS.vilagos, splitFn: x => [x], logoBelso: ''
  });
  // a glória: fekete kitöltés + vastag fekete vonal, UGYANAZZAL a szöveggel
  const glorias = (svg.match(/<text [^>]*stroke="#000000"[^>]*>/g) || []).length;
  const fehér = (svg.match(/<text [^>]*fill="#FFFFFF"[^>]*>/g) || []).length;
  assert.ok(fehér >= 3, 'kevesebb fehér szöveg, mint várt: ' + fehér);
  assert.equal(glorias, fehér, 'nem minden fehér szöveg kapott glóriát: '
    + fehér + ' fehér, ' + glorias + ' glória');
  // ⚠️ `paint-order` SZÁNDÉKOSAN nincs: a régebbi librsvg nem ismeri, és
  // NÉMÁN a vonalat rajzolná a kitöltés FÖLÉ — a betű felfalná magát.
  assert.ok(!/paint-order/.test(svg), 'paint-order került a posztersbe');
});

t('🔑 a lap tartalma SOHA nem lóg bele a fotósávba', () => {
  // A fotósáv MINIMÁLIS magassága 520 px (panelY). A sötét betű ott a
  // fényképen ülne, olvashatatlanul. Ez élesben megtörtént: ha a cikkből
  // nem jött „You'll need" tétel, a lépések a CÍM aljához igazodtak, és
  // rövid címnél 330 px-en kezdődtek, a kép közepén.
  // ⚠️ Elmosott háttéren ez ALIG látszott, a mérőszámok átengedték. A
  // hibát az fogta meg, hogy valaki RÁNÉZETT a kész képre.
  const PANEL_MIN = 520;
  for (const kellenek of [[], ['A free account'], ['A free account', 'Ten minutes']]) {
    const svg = poszterSvg({
      cim: 'Short title',                    // rövid cím = a legrosszabb eset
      lepesek: ['Open the app and sign in', 'Paste your notes in', 'Ask for a summary'],
      kellenek, hibak: ['People skip the first step'],
      stilus: STILUS.vilagos, splitFn: x => [x], logoBelso: ''
    });
    const eset = kellenek.length + ' tétel';
    // ⚠️ A SZÁMLÁLÓ KÖTELEZŐ. Ennek a tesztnek az első változatában a
    // shell megette a backslash-eket: \d helyett „d", \b helyett egy
    // láthatatlan backspace-karakter került a mintába. A minta SEMMIRE nem
    // illeszkedett, a ciklus egyszer sem futott, és a teszt a HIBÁS kódon
    // is zölden ment át. Egy üres ciklusban lévő assert nem ellenőriz semmit.
    let vonal = 0, szoveg = 0;
    // a sötét tintával írt szövegek (a FEHÉR cím és fejléc ülhet a fotón)
    for (const m of svg.matchAll(/<text\s[^>]*\by="(\d+)"[^>]*fill="(#[0-9A-Fa-f]{6})"[^>]*>([^<]*)</g)) {
      if (m[2].toUpperCase() === '#FFFFFF' || m[2] === '#000000') continue;
      if (m[3] === 'AI') continue;             // a fejléc AI-címkéje SAJÁT fehér dobozon ül
      szoveg++;
      assert.ok(Number(m[1]) >= PANEL_MIN,
        eset + ': sötét szöveg a fotósávban, y=' + m[1] + ' (' + m[2] + ' „' + m[3] + '")');
    }
    // a vonalak (hajszálvonal, lépés-vezérvonal) sem mehetnek a képre.
    // <line\s és NEM <line: az utóbbi a <linearGradient>-re is illeszkedik.
    for (const m of svg.matchAll(/<line\s[^>]*\by1="(\d+)"/g)) {
      vonal++;
      assert.ok(Number(m[1]) >= PANEL_MIN, eset + ': vonal a fotósávban, y1=' + m[1]);
    }
    assert.ok(vonal >= 2, eset + ': a teszt nem talált vonalat, a minta vak (' + vonal + ')');
    assert.ok(szoveg >= 3, eset + ': a teszt nem talált sötét szöveget, a minta vak (' + szoveg + ')');
  }
});

console.log(`\n${bukott ? '❌' : '✅'} ${pass} sikeres, ${bukott} bukott`);
process.exit(bukott ? 1 : 0);
