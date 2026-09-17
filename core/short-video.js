// ===================================================================
// ÁLLÓ RÖVIDVIDEÓ (1080x1920) EGY ÚTMUTATÓBÓL — teljesen ingyen
// ===================================================================
//
// MIÉRT KÜLÖN MODUL, és miért nem a meglévő Orbit-lánc. A
// `core/video-compose.js` 1280x720 FEKVŐ, és a felbontás átírása nem elég:
// a kártya SVG-je abszolút pixelkoordinátákkal dolgozik, az ASS-stílus
// margói pedig a fekvő elrendezés jobb oldali dobozához vannak igazítva.
// Az a lánc ráadásul EGYETLEN bemenetet ismer (a heti digest fix
// weekly.json+mp3 párosát), és a hangját csak a fizetős agent tudja
// legyártani. Ez itt önálló, paraméterezhető és $0.
//
// MIÉRT NEM KELL AI A SZÖVEGHEZ. Mérve (2026-08-23): a 352 útmutató
// MINDEGYIKE legalább 3 lépéses, és mind a 2026 lépés-cím ugyanabban a
// formában áll: „Step N — <cím>". A videó szövegét tehát a cikk saját
// szerkezete adja. Hang: msedge-tts (ingyen). Kép: sharp. Összerakás:
// ffmpeg. A teljes lánc nulla forint.
//
// ⚠️ A SZÜNET A HANGBA IS KELL, nem csak a kép hosszába. Az első
// változatban csak a képekhez adtam +0,45 mp levegőt — tábláként fél
// másodperc csúszás halmozódott, a hatodiknál már 2,25 mp, és a záró
// tábla ki is esett, mert a `-shortest` a rövidebb hanghoz vágott.
// ===================================================================

import { execFileSync } from 'child_process';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fm, findArticleBySlug } from './frontmatter.js';
import { BETU_CSALAD, betuRendben } from './video-font.js';

export const W = 1080, H = 1920;

// ── A BIZTONSÁGOS SÁV (2026-09-17) ─────────────────────────────────
//
// MIÉRT VAN. A tábla 1080x1920, de a Reels-lejátszóban ennek a széle NEM
// a miénk: a Facebook/Instagram a felső ~14%-ra a saját fejlécét teszi
// (profilnév, hang, „…"), az alsó ~35%-ra a leírást, a linket és a
// jobb oldali gombsort. A régi tábla haladásjelzője y=1788-on állt (a
// magasság 93%-a), a márkajel y=1854-en — tehát jó eséllyel SENKI nem
// látta egyiket sem. A nagy szöveg y=960 körül volt, az egyetlen elem,
// ami biztosan látszott.
//
// Innentől MINDEN látható elem ebbe a sávba kerül. Kivétel csak a
// háttér és a felső vonal: azok szándékosan futnak ki a szélig, mert
// nem hordoznak információt.
//
// 🔑 Azért KONSTANS és azért EXPORTÁLT, mert a teszt ezekre hivatkozik:
// ha valaki később elmozdít egy elemet a sávon kívülre, elbukik — nem
// kell észben tartani, melyik y hol van.
export const SAV_FELSO = 250;
export const SAV_ALSO = 1290;

// ── A „PAPÍR" PALETTA ──────────────────────────────────────────────
// Ugyanaz a három szín, mint a honlapon: így a Reelről a cikkre érkező
// olvasó ugyanazt a felületet látja. A régi tábla sötét volt, mert az
// elmosott borítóképre kellett írni — borítókép nélkül erre nincs ok.
const PAPIR = '#f2ede4';    // a lap alapszíne
const TINTA = '#1c1a16';    // a szöveg
const ZSALYA = '#5f8a76';   // a kiemelés (vonal, lépésszám, haladásjelző)
const HALVANY = '#5c5850';  // az alcím

/** Ennél kevesebb lépésből nem lesz videó — egy helyen, hogy ne csússzon szét. */
export const MIN_LEPES = 3;

/** Ennyi levegő marad a tábla végén, hogy a felirat elolvasható legyen. */
export const SZUNET_MP = 0.45;

/** A felolvasás mért tempója — a hossz-becsléshez, nem a vágáshoz. */
export const SZO_PER_MP = 2.6;

const SORSZAM = ['One', 'Two', 'Three', 'Four', 'Five', 'Six'];

// Ahol egy angol lépés-cím természetesen kettétörik. A vágás után a maradék
// alcímként megy a nagy szöveg alá.
const TORES = /^(for|with|to|in|on|from|before|after|that|and|using|so|without|into|about|as|at|by|when|while)$/i;

/** A nagy szöveg ideális hossza a kártyán — ehhez a legközelebbi törést keressük. */
const CEL_HOSSZ = 18;

/**
 * Egy lépés-cím kettévágása: NAGY szöveg + alcím.
 *
 * A kézzel írt mintában a „Watch the face for small glitches" ebből lett:
 * nagy „Watch the face", kicsi „for small glitches". Ez nem ötlet volt,
 * hanem a mondat természetes törése — és gépiesíthető.
 *
 * ⚠️ NEM az ELSŐ töréspontnál vágunk. A „Listen to the voice for flat
 * delivery" első törése a „to", ami után egyetlen szó maradna („Listen").
 * Azt a törést keressük, ahol a nagy szöveg a CEL_HOSSZ-hoz legközelebb van.
 */
export function splitHeading(cim) {
  // A zárójeles kiegészítés se a kártyára, se a hangba nem való.
  const t = String(cim == null ? '' : cim).replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  if (!t) return { nagy: '', kicsi: '' };

  const szavak = t.split(' ');
  let legjobb = -1, legjobbTav = Infinity;
  for (let i = 1; i < szavak.length; i++) {
    if (!TORES.test(szavak[i])) continue;
    if (i < 2) continue;                      // egyszavas nagy szöveg nem kártya
    const hossz = szavak.slice(0, i).join(' ').length;
    const tav = Math.abs(hossz - CEL_HOSSZ);
    if (tav < legjobbTav) { legjobbTav = tav; legjobb = i; }
  }
  // Rövid cím egyben marad: a darabolás csak akkor segít, ha van mit darabolni.
  if (legjobb < 0 || t.length <= 26) return { nagy: t, kicsi: '' };
  return { nagy: szavak.slice(0, legjobb).join(' '), kicsi: szavak.slice(legjobb).join(' ') };
}

// A frontmatter-olvasó a core/frontmatter.js-be költözött (2026-08-24),
// amikor a core/reel-post.js is kérni kezdte. Egy példány van belőle.

// ── AZ ÁLTALÁNOS FELVEZETŐK — amit a HOROG elől le kell vágni ───────
//
// ÉLES LELET (2026-09-17). A nyitótábla nagy szövege eddig a címből
// készült úgy, hogy CSAK a „how to" került le róla. A
// „Getting started with Perplexity for answers that show their sources"
// címből így pontosan az a két szó lett a horog, ami SEMMIT nem mond:
// „Getting started". A szó, ami megállítaná a görgetést — „Perplexity" —
// kimaradt. Ez a videó ki is ment.
//
// MÉRVE a 443 élő útmutató címén (2026-09-17, mind a 443 videóképes):
//   • ELŐTTE 15 horog-szöveg volt pontosan egy általános fordulat:
//       „getting started" 13× · „get started" 1× · „a beginner's guide" 1×
//   • UTÁNA 0.
//   • A 443-ból 15 horog változik meg, a többi 428 SZÓ SZERINT ugyanaz
//     marad (a 133 „How to…" cím eredménye azonos, mert azt a régi kód
//     is levágta) — a beavatkozás hatóköre tehát mért és szűk.
//   • Üresre vagy egyetlen szóra vágott horog: 0.
//
// A címkezdet-statisztika (mért, >=13×) mutatja, hogy ez a LISTA fedi a
// valódi mintát: „how to" 133×, „getting started with" 13×, a maradék
// élmező („turn a" 15×, „plan a" 19×, „build a" 17×) MÁR KONKRÉT, azt
// nem szabad levágni.
//
// ⚠️ MIÉRT TELJES, KIÍRT FORDULATOKRA ILLESZTÜNK, és miért nem
// szótöredékre. A projektben KÉTSZER fogott meg az előtag-illesztés
// csapdája (az „analysis → analyzis" eset a magyar/US-helyesírás
// szótárban): aki előtagra illeszt, az előbb-utóbb egy szó BELSEJÉT
// találja meg. Ezért minden elem egy egész fordulat, a minta a sor
// elejéhez van kötve (`^`), a végén `\b` áll (hogy a „how to" a „How
// together…" címre NE illeszkedjen), és kis/nagybetű-érzéketlen.
//
// A HOSSZABB VÁLTOZAT ELŐBB áll: az alternáció az első illeszkedőt
// választja, tehát ha az „introduction" előbb jönne, az „introduction
// to" `to`-ja ott maradna a horgon.
const FELVEZETOK = [
  'how to',
  'getting started with', 'getting started in', 'getting started',
  'get started with', 'get started in', 'get started',
  "a beginner(?:'|’)s guide to", "the beginner(?:'|’)s guide to",
  "a beginner(?:'|’)s guide", "the beginner(?:'|’)s guide",
  'an introduction to', 'a quick introduction to', 'introduction to', 'introduction',
  'an overview of', 'overview of', 'overview',
  'the basics of', 'the basics', 'basics of',
  'a complete guide to', 'the complete guide to', 'a complete guide', 'the complete guide',
  'a quick guide to', 'the quick guide to', 'a quick guide',
  'a simple guide to', 'a simple guide',
  'a practical guide to', 'a practical guide',
  'a step(?:-| )by(?:-| )step guide to', 'a step(?:-| )by(?:-| )step guide',
  'the ultimate guide to', 'the ultimate guide',
  'a hands(?:-| )on guide to', 'a hands(?:-| )on guide',
  'your guide to', 'a guide to', 'the guide to',
  'a first look at', 'first steps with', 'first steps in',
  'everything you need to know about', 'everything you need to know',
  'what you need to know about', 'what you need to know',
  'the easy way to'
];

/** A felvezető + a mögötte álló írásjel (kettőspont, vessző, gondolatjel). */
const FELVEZETO_RX = new RegExp(
  String.raw`^(?:` + FELVEZETOK.join('|') + String.raw`)\b[\s:,—–-]*`, 'i');

/**
 * A cím megtisztítása a HOROGHOZ: az általános felvezetők lekerülnek.
 *
 * ⚠️ TÖBBSZÖR IS VÁG (max 3 kör), mert a felvezetők egymásra rakódnak:
 * a „How to get started with X" cím KÉT felvezetőt hordoz. De csak addig,
 * amíg legalább KÉT szó marad — egy szóból nem lesz kártya, és a
 * „HALLGATÁS A BIZTONSÁGOS IRÁNY" elve szerint inkább a suta felvezető
 * maradjon bent, mint hogy üres horgot tegyünk ki. Kimérve: a 443 valódi
 * címből EGY sem esik ebbe a védelembe.
 */
export function horogCimbol(cim) {
  let t = String(cim == null ? '' : cim).replace(/\s+/g, ' ').trim();
  for (let k = 0; k < 3; k++) {
    const u = t.replace(FELVEZETO_RX, '').trim();
    if (u === t || u.split(' ').filter(Boolean).length < 2) break;
    t = u;
  }
  return t;
}

/** A nagy szöveg tördelése a kártyán — kézzel, mert az SVG nem tördel. */
function tordel(s, maxSor = 13) {
  const szavak = String(s).split(' ');
  const sorok = [];
  let mostani = '';
  for (const sz of szavak) {
    if (!mostani) { mostani = sz; continue; }
    if ((mostani + ' ' + sz).length <= maxSor) mostani += ' ' + sz;
    else { sorok.push(mostani); mostani = sz; }
  }
  if (mostani) sorok.push(mostani);
  return sorok.slice(0, 3).join('\n');
}

/**
 * A videó kártyái egy útmutató markdownjából.
 *
 * A HALLGATÁS A BIZTONSÁGOS IRÁNY: ha a cikk nem alkalmas (kevés lépés,
 * nincs cím), `cards: null`-t adunk vissza az OKKAL együtt — rossz videót
 * kitenni rosszabb, mint nem kitenni semmit.
 *
 * @returns {{cards: object[]|null, reason: string}}
 */
// Hány lépés fér a videóba. 4 → 6 (2026-08-24), MÉRÉS alapján:
//
//   maxSteps   átlagos hossz   leghosszabb   a cikket TELJESEN lefedi
//      4          18,9 mp        25,0 mp          13 / 358   (4%)
//      5          21,5 mp        29,2 mp         121 / 358  (34%)
//      6          23,4 mp        31,9 mp         314 / 358  (88%)
//
// A lépésszám-eloszlás: 4→13, 5→108, 6→193, 7→43, 11→1 cikk. Négy lépéssel
// a videó a cikkek 96%-ánál elhallgatta a tartalom egy részét, miközben az
// átlagos hossz csak 4,5 másodperccel rövidebb. A Reels 15–30 mp körül a
// legerősebb — 23,4 mp bőven ebben a sávban van.
//
// AZ OK, AMIÉRT KIDERÜLT: egy kiküldött Reel alatt a szöveg „Five quick
// checks"-et ígért, a videó viszont négy lépést mutatott. A user vette észre
// („nem tudok angolul" — ezért soronként lefordítottam neki, és így tűnt fel).
export const LEPES_MAX = 6;

export function cardsFromGuide(md, { maxSteps = LEPES_MAX } = {}) {
  if (typeof md !== 'string' || !md.trim()) return { cards: null, reason: 'nincs szöveg' };

  const cim = fm(md, 'title');
  if (!cim) return { cards: null, reason: 'nincs cím a frontmatterben' };

  // ⚠️ CSAK a „Step N — …" alakú fejlécek lépések. A „Before you start" és a
  // „Common mistakes" ugyanúgy `##`, de nem tartozik a menetbe.
  const lepesek = [...md.matchAll(/^##\s*Step\s*\d+\s*[—–-]\s*(.+)$/gim)].map(m => m[1].trim());
  if (lepesek.length < MIN_LEPES) {
    return { cards: null, reason: `csak ${lepesek.length} lépés (legalább ${MIN_LEPES} kell)` };
  }

  const valasztott = lepesek.slice(0, Math.max(MIN_LEPES, maxSteps));
  // A HOROG a megtisztított címből jön: az általános felvezető nem hír.
  const horogCim = splitHeading(horogCimbol(cim)).nagy;

  // ⚠️ A KIMONDOTT mondat SZÁNDÉKOSAN a teljes címet hozza, csak a „how to"
  // nélkül — ott a felvezető nem baj, mert a hang tovább mondja a lényeget.
  // A horog-KÉPEN viszont a nagy szöveg minden, amit az első másodpercben
  // látni lehet, ezért ott vágunk (horogCimbol).
  //
  // A HOROG. Reelsben az első két másodperc dönt, ezért FELSZÓLÍTÓ mondat,
  // nem körülírás: a „How to Spot a Deepfake…" címből „Spot a Deepfake…" lesz.
  // Az első változat „Here is how to Spot a…"-t mondott — hosszabb és sutább.
  const horogMondat = cim.replace(/^how to\s+/i, '').replace(/[.:]\s*$/, '');
  const cards = [{
    cimke: '',
    nagy: tordel(horogCim),
    kicsi: `In ${SORSZAM[valasztott.length - 1]?.toLowerCase() || valasztott.length} steps`,
    mond: `${horogMondat}. In ${SORSZAM[valasztott.length - 1]?.toLowerCase() || valasztott.length} fast steps.`
  }];

  valasztott.forEach((l, i) => {
    const { nagy, kicsi } = splitHeading(l);
    cards.push({
      cimke: String(i + 1).padStart(2, '0'),
      nagy: tordel(nagy),
      kicsi,
      // A sorszám kimondva tartja követhetően a menetet.
      mond: `${SORSZAM[i] || i + 1}. ${nagy}${kicsi ? ' ' + kicsi : ''}.`
    });
  });

  cards.push({
    cimke: '',
    nagy: 'aiworldhq\n.com',
    kicsi: 'Daily AI tips, in plain English',
    // ⚠️ A felolvasó a pontot nem mondja ki — ezért „dot com".
    mond: 'Full guide at aiworldhq dot com.'
  });

  return { cards, reason: '' };
}

/** Becsült hossz másodpercben — a kapuhoz, nem a vágáshoz. */
export function becsultHossz(cards) {
  const szavak = (cards || []).map(c => c.mond).join(' ').trim().split(/\s+/).length;
  return szavak / SZO_PER_MP + (cards || []).length * SZUNET_MP;
}

// ── A RENDERELÉS (ffmpeg + sharp + msedge-tts) ──────────────────────
// Innentől I/O van: a tesztek a fenti tiszta függvényeket nézik.

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Egy álló tábla SVG-ben — „PAPÍR" dizájn (2026-09-17, user jóváhagyta).
 *
 * MI VÁLTOZOTT ÉS MIÉRT. A régi tábla sötét volt (#14120f 80%-os
 * fedéssel) és fehér szöveget írt az ELMOSOTT BORÍTÓKÉPRE. Két baja volt:
 *
 *  1. A BORÍTÓKÉP AI-VAL GENERÁLT, ÉS HIBÁS FELIRATOT TARTALMAZHAT.
 *     Kimérve 2026-09-17-én: a Perplexity-útmutató borítóján „perrplexity"
 *     állt, két r-rel. Elmosva ez nem tűnt fel — élesen kitéve a
 *     hitelességünkbe kerülne. Ezért a háttér ma EGYBEFÜGGŐ PAPÍRSZÍN,
 *     kép nélkül (lásd renderVideo: a `cover` opció megszűnt).
 *  2. A LÁTHATÓ ELEMEK A SÁVON KÍVÜL VOLTAK — lásd SAV_FELSO/SAV_ALSO.
 *
 * ⚠️ MINDEN y-koordináta a SAV_FELSO…SAV_ALSO sávba esik, a háttéren és a
 * felső vonalon kívül. Teszt őrzi, regexszel — nem felsorolással, hogy egy
 * későbbi elmozdítás is elbukjon.
 */
export function tablaSvg({ cimke, nagy, kicsi }, i, db) {
  const sorok = String(nagy).split('\n').slice(0, 3);
  // A méret a SORSZÁMTÓL függ, nem a sorok hosszától: három sornál a
  // 138-as magasság a blokkot a sávból lógatná ki.
  const meret = sorok.length <= 2 ? 138 : 116;
  const sorMagassag = meret * 1.08;
  // A blokk a 980-as alapvonal körül ül ki: ez a Reels-lejátszó
  // KÖZÉPSŐ, biztosan szabad harmada.
  const kezd = 980 - (sorok.length - 1) * meret * 0.55;
  const utolsoSor = kezd + (sorok.length - 1) * sorMagassag;
  const szoveg = sorok.map((s, k) =>
    `<text x="${W / 2}" y="${kezd + k * sorMagassag}" text-anchor="middle" font-size="${meret}"
     font-family="${BETU_CSALAD}" font-weight="900" fill="${TINTA}">${esc(s)}</text>`).join('\n');

  // Haladásjelző: Reelsben ez mutatja, mennyi van hátra — ez tartja bent a
  // nézőt. ⚠️ KÖZÉPRE került (y=1180): a régi helyén, y=1788-on a platform
  // saját leírás-sávja alatt volt, azaz gyakorlatilag láthatatlan.
  const SAV_SZELES = 720, SAV_X = (W - SAV_SZELES) / 2, RES = 10;
  const sav = Array.from({ length: db }, (_, k) => {
    const sz = (SAV_SZELES - (db - 1) * RES) / db;
    return `<rect x="${SAV_X + k * (sz + RES)}" y="1180" width="${sz}" height="8" rx="4"
      fill="${ZSALYA}" opacity="${k <= i ? '1' : '0.22'}"/>`;
  }).join('\n');

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="${PAPIR}"/>
  <rect x="0" y="0" width="${W}" height="14" fill="${ZSALYA}"/>
  <rect x="${W - 166}" y="270" width="96" height="56" rx="10" fill="${TINTA}"/>
  <text x="${W - 118}" y="311" text-anchor="middle" font-size="38"
    font-family="${BETU_CSALAD}" font-weight="900" fill="${PAPIR}">AI</text>
  ${cimke ? `<text x="${W / 2}" y="640" text-anchor="middle" font-size="190"
      font-family="${BETU_CSALAD}" font-weight="900" fill="${ZSALYA}" opacity="0.30">${cimke}</text>` : ''}
  ${szoveg}
  ${kicsi ? `<text x="${W / 2}" y="${utolsoSor + 70}" text-anchor="middle" font-size="52"
    font-family="${BETU_CSALAD}" fill="${HALVANY}">${esc(kicsi)}</text>` : ''}
  ${sav}
  <text x="${W / 2}" y="1262" text-anchor="middle" font-size="40" letter-spacing="5"
    font-family="${BETU_CSALAD}" font-weight="bold" fill="${TINTA}" opacity="0.65">AIWORLDHQ.COM</text>
</svg>`);
}

const hossz = f => parseFloat(execFileSync('ffprobe',
  ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim());

/**
 * A VÉGSŐ ffmpeg-hívás argumentumai. Külön függvény, mert a Facebook
 * követelményei ITT dőlnek el, és így teszt őrizheti őket — a kész fájl
 * ellenőrzéséhez ffmpeg és hálózat kellene, ami a npm test-be nem fér bele.
 *
 * ⚠️ A `format=yuv420p` A SZŰRŐLÁNC VÉGÉN KELL, nem a -pix_fmt kapcsolóval
 * (2026-08-23, mérve). A JPEG-bemenet TELJES színtartományú, és ezt az ffmpeg
 * végig magával viszi: a kimenet `yuvj420p` lett, hiába állítottam a -pix_fmt-
 * et. A Facebook az ilyet vagy újrakódolja (romlik a minőség), vagy fakó, túl
 * kontrasztos színekkel adja vissza — és nem derült volna ki, miért. Az
 * `out_range=tv` a skálázónak mondja ugyanezt.
 *
 * A `+faststart` sem dísz: enélkül a moov atom a fájl VÉGÉRE kerül, és a
 * letöltőnek az egész fájlt le kell húznia, mielőtt bármit kezdene vele.
 */
export function videoArgs({ kepek, hang, out }) {
  return ['-y',
    '-f', 'concat', '-safe', '0', '-i', kepek,
    '-i', hang,
    '-c:v', 'libx264', '-r', '30', '-preset', 'veryfast', '-crf', '26',
    '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart',
    '-vf', `scale=${W}:${H}:out_range=tv,format=yuv420p`,
    '-color_range', 'tv', out];
}

/**
 * A videó legyártása. Külön függvény, hogy a szkript-logika tesztelhető
 * maradjon nélküle.
 *
 * @returns {Promise<{file: string, seconds: number, betu: object}>}
 */
export async function renderVideo(cards, { out, workDir, voice = 'en-US-AvaMultilingualNeural' }) {
  const sharp = (await import('sharp')).default;
  const { MsEdgeTTS, OUTPUT_FORMAT } = await import('msedge-tts');

  // 🔤 MEGKAPTUK-E A KÉRT BETŰT? (2026-09-17) A táblák csak KÉRIK a
  // betűcsaládot; ha a gépen nincs telepítve, a betűmotor némán egy
  // alapbetűvel rajzol, és a gyártás ugyanúgy „sikerül". Három hétig, 24
  // kiküldött Reelen át pontosan ez történt. Ezért a gyártás LEMÉRI a
  // saját eredményét, a lelet a visszatérési értékben utazik, és a hívón
  // keresztül a napi Telegram-jelentésbe jut (core/reel-post.js →
  // memory/reel-guard.json → core/daily-report.js).
  //
  // ⚠️ A MÉRÉS NEM AKADÁLY: a rossz betűvel készült videó is jobb, mint a
  // semmi, és a döntés nem a gépé. A mérés csak SZÓL.
  const betu = await betuRendben(sharp);
  console.log('   betű: ' + (betu.ok === true ? '✅ ' + betu.nev
    : betu.ok === false ? '⚠️ NEM a kért betű — ' + betu.reason
      : '⚠️ ' + betu.reason));

  rmSync(workDir, { recursive: true, force: true });
  mkdirSync(workDir, { recursive: true });

  // ⛔ A BORÍTÓKÉP KIMARADT (2026-09-17) — a `cover` opció megszűnt.
  //
  // MIÉRT. A háttér eddig a cikk borítóképe volt, 9-es sugárral elmosva.
  // A borítók AI-val generált képek, és amikor élesen látszanak, kiderül,
  // hogy HIBÁS FELIRATOT tartalmaznak: a 2026-09-17-i mérésben a
  // Perplexity-útmutató borítóján „perrplexity" állt, két r-rel. Elmosva
  // nem tűnt fel — élesen kitéve a hitelességünkbe kerülne. A takarást
  // nem lehet „elég erősre" hangolni: ami annyira el van mosva, hogy a
  // hibát elfedi, az már csak színes zaj, azaz nem ad semmit.
  //
  // A helye egybefüggő papírszín. Ez EGYBEN A PAPÍR-DIZÁJN ALAPJA is
  // (lásd tablaSvg), és mellékesen gyorsabb: nincs lemezről olvasás,
  // nincs átméretezés, nincs elmosás táblánként.
  const hatter = await sharp({
    create: { width: W, height: H, channels: 3, background: PAPIR }
  }).png().toBuffer();

  const idok = [];
  for (let i = 0; i < cards.length; i++) {
    const nyers = join(workDir, `n${i}.mp3`), mp3 = join(workDir, `h${i}.mp3`);

    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(cards[i].mond);
    const d = [];
    audioStream.on('data', x => d.push(x));
    await new Promise(r => audioStream.on('close', r));
    writeFileSync(nyers, Buffer.concat(d));

    // A szünet a HANGBA is bekerül — enélkül a kép elcsúszik a beszédtől.
    execFileSync('ffmpeg', ['-y', '-i', nyers, '-af', `apad=pad_dur=${SZUNET_MP}`,
      '-c:a', 'libmp3lame', mp3], { stdio: 'pipe' });
    idok.push(hossz(mp3));

    await sharp(hatter).composite([{ input: tablaSvg(cards[i], i, cards.length) }])
      .jpeg({ quality: 92 }).toFile(join(workDir, `k${i}.jpg`));
  }

  writeFileSync(join(workDir, 'kepek.txt'),
    cards.map((_, i) => `file 'k${i}.jpg'\nduration ${idok[i].toFixed(3)}`).join('\n')
    + `\nfile 'k${cards.length - 1}.jpg'\n`, 'utf-8');
  writeFileSync(join(workDir, 'hangok.txt'), cards.map((_, i) => `file 'h${i}.mp3'`).join('\n'), 'utf-8');

  execFileSync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', join(workDir, 'hangok.txt'),
    '-c', 'copy', join(workDir, 'teljes.mp3')], { stdio: 'pipe' });

  execFileSync('ffmpeg', videoArgs({
    kepek: join(workDir, 'kepek.txt'), hang: join(workDir, 'teljes.mp3'), out
  }), { stdio: 'pipe' });

  return { file: out, seconds: idok.reduce((a, b) => a + b, 0), betu };
}

export default {
  cardsFromGuide, splitHeading, horogCimbol, becsultHossz, renderVideo, tablaSvg,
  MIN_LEPES, W, H, SAV_FELSO, SAV_ALSO
};

// ── CLI ─────────────────────────────────────────────────────────────
//
//   node core/short-video.js <slug|fájlnév>     egy videó legyártása
//   node core/short-video.js <...> --dry        csak a szkript, $0, ffmpeg nélkül
//
// ⚠️ EZ A FÁJL AZ IMPORTRA NEM INDUL EL. 25 agentből 21 a fájl végén
// feltétel nélkül hívja a main()-t → a puszta import pénzt költ és publikál
// (2026-08-06). A core/daily-report.js és a core/video-compose.js is ilyen.
// Itt őrszem van.

async function main() {
  const { readFileSync, readdirSync } = await import('fs');
  const { fileURLToPath } = await import('url');
  const { dirname } = await import('path');
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const kulcs = args.find(a => !a.startsWith('--'));
  if (!kulcs) { console.log('Használat: node core/short-video.js <slug> [--dry]'); return; }

  // SLUG SZERINT keres, nem fájlnév szerint — a kettő a cikkek ~11%-ánál
  // eltér, és ez élesben meg is fogott: erre a videóra a saját slugjával
  // NEM talált rá. Részletek: core/frontmatter.js findArticleBySlug().
  const DIR = join(ROOT, 'content', 'articles');
  const talalt = findArticleBySlug(DIR, kulcs);
  if (!talalt) { console.log('❌ nincs ilyen cikk: ' + kulcs); process.exit(1); }

  const a = talalt.article;
  const slug = a._meta?.slug || kulcs;
  const { cards, reason } = cardsFromGuide(a.article_markdown || '');
  if (!cards) { console.log('⏭️  kihagyva — ' + reason); return; }

  console.log('🎬 ' + slug);
  for (const c of cards) console.log('   ' + (c.cimke || '  ') + '  «' + c.mond + '»');
  console.log('   becsült hossz: ' + becsultHossz(cards).toFixed(1) + ' mp');
  if (dry) { console.log('   (--dry: itt megállunk)'); return; }

  // A videó a FORRÁS-oldalon él, nem a public/-ban: a build ÜRÍTI a public/-ot
  // (lásd a deploy-receptet), tehát ami oda kerül, az a következő buildnél
  // eltűnne. A build innen másolja ki (website/build.js, shorts/).
  const kiDir = join(ROOT, 'website', 'assets', 'video', 'shorts');
  mkdirSync(kiDir, { recursive: true });

  const r = await renderVideo(cards, {
    out: join(kiDir, slug + '.mp4'),
    workDir: join(ROOT, '.video-munka')
  });
  rmSync(join(ROOT, '.video-munka'), { recursive: true, force: true });
  console.log('✅ ' + r.file + ' — ' + r.seconds.toFixed(1) + ' mp, ' + W + 'x' + H);
}

const kozvetlen = process.argv[1] && process.argv[1].endsWith('short-video.js');
if (kozvetlen) main().catch(e => { console.error('💥 short-video hiba:', e.message); process.exit(1); });
