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
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs';
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

// ── A VÍZSZINTES KERET (2026-09-18) ────────────────────────────────
// A sáv-őr eddig CSAK függőleges volt, és emiatt átengedett egy csonka
// táblát (lásd a tablaSvg méret-számítását). Ez a három szám a
// vízszintes védelem: a szöveg legfeljebb ennyi pixel széles lehet, a
// betűszélesség-arány ebből számol méretet, és ennél kisebbre nem
// megyünk — egy 40 pixeles felirat már olvashatatlan a telefonon.
export const SZOVEG_MAX_SZELES = 1000;   // 1080 vászon − 2 × 40 margó
export const BETU_ARANY = 0.65;          // mért: ~0,62; felfelé kerekítve
export const SZOVEG_MIN_MERET = 72;

// Az alcím mérete és alsó határa. 40 px alatt a telefon képernyőjén már
// nem olvasható — ott inkább elhagyjuk (lásd tablaSvg).
//
// ⚠️ AZ ARÁNY UGYANAZ, MINT A NAGY SZÖVEGÉ, és ez nem elírás. Az első
// változatban 0,60 állt itt azzal az indoklással, hogy „az alcím normál
// vastagságú, tehát keskenyebb". Ez TÉVEDÉS volt: a `shared/fonts/`
// EGYETLEN vágatot tartalmaz (a betű neve „Schibsted Grotesk Black"), az
// alcím `<text>`-je pedig nem kér külön vastagságot — vagyis ugyanazokkal
// a karakterszélességekkel rajzolódik. Kimérve a 2226 élő alcímen: a
// tényleges arány mediánja 0,49, a MAXIMUMA 0,6374 — a 0,60 tehát
// átengedett volna egy szélesebb glifájú, 32 karakteres alcímet (1061 px
// az 1000-es kereten túl). Nem hiba történt, hanem szerencse volt.
export const ALCIM_MERET = 52;
export const ALCIM_MIN_MERET = 40;
export const ALCIM_ARANY = 0.65;

// ── AZ ALSÓ HÁROM ELEM HELYE (2026-09-18) ──────────────────────────
// A haladásjelző eredetileg y=1180-on állt, és ez ELÉGTELEN volt: egy
// háromsoros tábla alcíme az alapvonal-számításból mindig 1173-ra esik,
// a betűk alja 1182-re — vagyis a zsálya sáv KERESZTÜLMENT az alcímen.
// Determinisztikus hiba, nem véletlen: a 3385 valódi kártyából 492-t
// érintett (14,5%), köztük a nyitótáblák „In five steps" sorát.
// A két szám azért konstans, mert a teszt a KÖZTÜK LÉVŐ TÁVOLSÁGOT őrzi.
export const SAV_JELZO_Y = 1208;
export const MARKAJEL_Y = 1270;

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

// ── A HOROG NAGYBETŰVEL KEZDŐDIK (2026-09-19) ───────────────────────
//
// ÉLES LELET. A ma kiküldött Reel nyitótáblájára ez ment ki nagy betűvel:
// „create images" — kisbetűvel, mert a cím „How to create images with AI…"
// volt, és a felvezető-vágás („how to") után egy mondatKÖZÉPI ige maradt
// elöl. A címben ez helyes volt; a táblán viszont ez a szöveg nem mondat
// közepe, hanem minden, amit a néző az első másodpercben lát.
//
// MÉRVE (2026-09-19, a 447 videóképes útmutató MINDEGYIKÉN): 49 horog
// (11,0%) kezdődött kisbetűvel. Az első szavak: „use" 14× · „plan" 5× ·
// „write" 5× · „build" 3× · „create" 3× · „turn" 3× · „translate" 2×, plusz
// 13 egyszeri ige (analyze, brainstorm, check, get, organize, practice,
// quickly, read, rehearse, run, set, study, upload) — ÉS „xAI's Grok", ami
// NEM ige, hanem szándékosan kisbetűs márkanév.
//
// A BEAVATKOZÁS HATÓKÖRE is mért: a 447 horogból 48 kap nagy kezdőbetűt, 1
// marad kisbetűs (az xAI-os), a többi 399 SZÓ SZERINT ugyanaz.
//
// 🔑 EZÉRT NEM ELÉG EGY toUpperCase(). Kétféle kisbetű van a horgok elején:
// a levágott mondatközépi ige (ezt javítani kell) és a név, amit a gyártó ír
// kisbetűvel (ezt elrontaná). A 447-ből ma EGY ilyen név van (xAI) — de a
// kettő KARAKTERSZINTEN teljesen egyformán néz ki, tehát a különbséget
// tudásból kell hozni, nem a szövegből.
//
// ⚠️ MIÉRT CSAK A HOROG-KÁRTYÁN. A ZÁRÓ tábla nagy szövege „aiworldhq\n.com"
// — abból SOHA nem lehet „Aiworldhq.com". A lépés-táblák szövegét pedig a
// cikk saját fejléce adja, nagybetűvel. Ezért a beavatkozás EGYETLEN ponton
// áll (a `cardsFromGuide` első kártyáján), és nem a `tordel`-ben vagy a
// `tablaSvg`-ben: ott MINDEN táblát érintene, a zárót is.
//
// A kimondott mondat (`mond`) SZÁNDÉKOSAN változatlan: a felolvasó a
// kis/nagybetűt nem hallja, a mondat pedig a teljes címből épül.
export const VEDETT_ELSO_SZAVAK = [
  // MÉRVE az 1005 élő cikk szövegében (2026-09-19), előfordulással. A saját
  // kanonikus névjegyzékünk (website/tool-links.json, 26 eszköz + 19 cég)
  // EGYETLEN kisbetűs nevet tart: az xAI-t — és pont az fordul elő horog
  // elején is („xAI's Grok"). A lista tehát nem ötlet, hanem lelet.
  'iPhone',      // 217×
  'iOS',         // 179×
  'iPad',        //  83×
  'xAI',         //  65×  ← ez az egyetlen, ami ma HOROG elején is áll
  'macOS',       //  43×
  'iCloud',      //  15×
  'iPadOS',      //  14×
  'iMessage',    //   4×
  'iPod',        //   3×
  'eBay',        //   3×
  'iMovie',      //   1×
  'nano-banana', //   1×
  'n8n',         //   1×
  // JÖVŐBELI VÉDELEM: ma 0 előfordulás, de ugyanabból a névcsaládból valók,
  // és egy új cikk bármikor behozhatja őket. Nulla a költségük.
  'watchOS', 'tvOS', 'visionOS', 'iTunes', 'iWork', 'iBooks', 'eSIM'
];

/**
 * A szándékosan kisbetűs nevek kisbetűsítve — a kis/nagybetű-érzéketlen
 * összevetéshez.
 *
 * ⚠️ TELJES SZÓALAKRA ILLESZTÜNK, SOHA NEM ELŐTAGRA. A projektben KÉTSZER
 * fogott meg az előtag-illesztés csapdája (a helyesírás-szótárban az
 * „analysis → analyzis"): aki előtagra illeszt, az előbb-utóbb egy szó
 * BELSEJÉT találja meg. Egy Set és teljes szóalak — így az „iOS" az „iOS"-ra
 * illeszkedik, az „iOSomething"-re nem, a „set"-re pedig semmiképp.
 */
const VEDETT = new Set(VEDETT_ELSO_SZAVAK.map(s => s.toLowerCase()));

/**
 * A horog-szöveg első szava NAGYBETŰVEL — kivéve, ha védett név.
 *
 * A birtokos-farkat és a záró írásjelet az ÖSSZEVETÉS előtt vágjuk le
 * („xAI's" → „xAI", „iPhone:" → „iPhone"), mert azok nem részei a névnek.
 * A KIMENETET ez nem írja át: ott pontosan egy karakter változhat.
 */
export function nagybetusHorog(s) {
  const t = String(s == null ? '' : s);
  const m = t.match(/^(\s*)(\S+)/);
  if (!m) return t;                              // üres vagy csak térköz
  const eleje = m[1].length, szo = m[2];
  if (!/^\p{Ll}/u.test(szo)) return t;           // már nagybetű, szám vagy jel
  const mag = szo.replace(/['’]s$/i, '').replace(/[^\p{L}\p{N}]+$/u, '');
  if (VEDETT.has(mag.toLowerCase())) return t;
  return t.slice(0, eleje) + t[eleje].toUpperCase() + t.slice(eleje + 1);
}

/** A nagy szöveg tördelése a kártyán — kézzel, mert az SVG nem tördel. */
// Exportálva 2026-09-20: a csomag-reklám Reel (core/packs-reel.js) UGYANEZZEL
// tördel. Ha saját tördelőt kapna, a két videó máshogy nézne ki, és a
// szélesség-fésű (core/short-video.test.js) csak az egyiket védené.
// ⚠️ EZ A FÜGGVÉNY SZAVAKAT NYELT EL (2026-09-21, éles képkockán látszott).
//
// A régi változat FIX 13 karakteres sorokkal tördelt, majd a 3. sor után
// egyszerűen VÁGOTT. Kimérve mind a 3448 élő kártyán: 194 (5,6%) végződött
// csonkán — a táblán „Install the GitHub Copilot" állt, a felolvasó meg azt
// mondta, „…GitHub Copilot extension." Egy 7 táblás Reelnél ez nagyjából
// minden harmadik videót érintett.
//
// 🔑 A KÉP ÉS A HANG ELVÁLÁSA A LEGROSSZABB FAJTA HIBA: külön-külön
// mindkettő hibátlannak látszik, együtt viszont hibásnak — és a gyártás
// ettől még ugyanúgy „sikerül". Ugyanaz az alak, mint a Reel-alcím
// lépésszám-ütközésénél (2026-08-24).
//
// A JAVÍTÁS: nem vágunk, hanem SZÉLESÍTJÜK a sorokat, amíg minden szó
// belefér három sorba. A betűméretet a tablaSvg úgyis a leghosszabb sorhoz
// igazítja, tehát a szélesebb sor automatikusan kisebb betűt kap.
// A felső határ 21 karakter: a legkisebb megengedett betűvel (72 px) ennyi
// fér az 1000 pixeles keretbe (1000 / (72 × 0,65) ≈ 21,4). Efölött már a
// vászonról futna le a szöveg — azt a szélesség-fésű külön őrzi.
export const TORDEL_MAX_KAR = 21;

export function tordel(s, maxSor = 13) {
  const szavak = String(s).split(' ');
  const egySor = (max) => {
    const sorok = [];
    let mostani = '';
    for (const sz of szavak) {
      if (!mostani) { mostani = sz; continue; }
      if ((mostani + ' ' + sz).length <= max) mostani += ' ' + sz;
      else { sorok.push(mostani); mostani = sz; }
    }
    if (mostani) sorok.push(mostani);
    return sorok;
  };
  let sorok = egySor(maxSor);
  // Ameddig nem fér bele háromba, engedünk a sorhosszon — de csak addig,
  // ameddig a betű még olvasható méretben elfér a vásznon.
  for (let max = maxSor + 1; sorok.length > 3 && max <= TORDEL_MAX_KAR; max++) {
    sorok = egySor(max);
  }
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
  // A kezdő nagybetűt a nagybetusHorog adja — CSAK ennek az EGY kártyának.
  const horogCim = nagybetusHorog(splitHeading(horogCimbol(cim)).nagy);

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

// ⚠️ A NEM TÖRHETŐ KÖTŐJEL ÜRES TÉGLALAP LESZ (2026-09-18, mérve). A
// becsomagolt Schibsted Grotesk `cmap`-jában nincs U+2011, és a cikkeink
// címei használják (`day‑by‑day`, `energy‑monitoring`) — 26 élő táblán.
// A betűmotor ilyenkor vagy más betűből pótolja (más alakú kötőjel), vagy
// tofut rajzol. Közönséges kötőjelre cseréljük: a tábla szövegében a
// „nem törhető" tulajdonságnak semmi szerepe (mi tördelünk, nem a motor).
const esc = s => String(s).replace(/‑/g, '-')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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
// ⚠️ AZ `alap` KAPCSOLÓ (2026-09-21). A tábla eddig MAGA festette a
// papírszínű alapot. Amióta a háttér a cikk elmosott borítóképe
// (hatterKepbol), az az alap RÁFEKÜDNE a képre és letakarná. A gyártás
// ezért `alap: false`-szal hívja; a tesztek és a kézi hívások a régi,
// önmagában is teljes táblát kapják.
export function tablaSvg({ cimke, nagy, kicsi }, i, db, { alap = true } = {}) {
  const sorok = String(nagy).split('\n').slice(0, 3);
  // A méret a SORSZÁMTÓL függ, nem a sorok hosszától: három sornál a
  // 138-as magasság a blokkot a sávból lógatná ki.
  // ⚠️ A MÉRET NEM CSAK A SORSZÁMTÓL FÜGG (2026-09-18, éles lelet).
  //
  // Az első papír-változatban a méretet CSAK a sorok száma szabta meg
  // (≤2 sor → 138). A régi, sötét tábla ezzel szemben a sor HOSSZÁT nézte
  // (>11 karakter → 118). A csere iránya csendben rossz volt: az „Open
  // DeepSeek" (13 karakter) 138 pixelen 1111 px széles lett az 1080-as
  // vásznon, tehát a szó SZÉLE LEVÁGÓDOTT. Végigmérve a 443 élő
  // útmutatón: 27 sor futott volna ki, azaz nagyjából minden 16. Reelen
  // lett volna egy csonka tábla. A függőleges sáv-őr ezt nem látta —
  // egydimenziós volt.
  //
  // Ezért a méret a LEGHOSSZABB SOR-hoz igazodik: a becsült szélesség
  // `karakterszám × ARANY × méret`, és ennek a 40-40 pixeles margón
  // belül kell maradnia. Az ARANY = 0,65 MÉRT érték a becsomagolt
  // Schibsted Groteskre (a „recommendation" és az „Open DeepSeek" valódi
  // rendereléséből 0,616 jött ki — felfelé kerekítve, hogy a nagybetűs
  // sorok se szaladjanak ki). A pontos védelmet a teszt adja, ami a
  // betűfájl VALÓDI karakterszélességeivel számol minden élő cikkre.
  const alapMeret = sorok.length <= 2 ? 138 : 116;
  const leghosszabb = Math.max(1, ...sorok.map(s => s.length));
  const meret = Math.max(SZOVEG_MIN_MERET,
    Math.min(alapMeret, Math.floor(SZOVEG_MAX_SZELES / (leghosszabb * BETU_ARANY))));
  const sorMagassag = meret * 1.08;
  // A blokk a 980-as alapvonal körül ül ki: ez a Reels-lejátszó
  // KÖZÉPSŐ, biztosan szabad harmada.
  const kezd = 980 - (sorok.length - 1) * meret * 0.55;
  const utolsoSor = kezd + (sorok.length - 1) * sorMagassag;

  // ── AZ ALCÍM IS KIFUTHAT (2026-09-18, mérve) ─────────────────────
  // A nagy szöveget tördeljük és méretezzük, az alcímet eddig SEM: a
  // 2226 élő alcímből 45 (2,0%) szélesebb lett a vászonnál, a legrosszabb
  // 1801 px az 1080-ból — vagyis a fele lelógott. Az alcím a lépés-cím
  // levágott farka, tehát hosszú is lehet.
  //
  // A szabály KÉTLÉPCSŐS, és szándékosan NEM vág szöveget (a projektben
  // az elvágott mondatok külön fejezet): előbb kicsinyítünk, ameddig még
  // olvasható marad; ha annyival sem fér be, akkor az alcím LEMARAD a
  // tábláról. Nem vész el: a felolvasott mondat (`mond`) VÁLTOZATLANUL
  // tartalmazza — tehát a néző hallja azt, amit nem lát.
  const alcimFer = kicsi
    ? Math.floor(SZOVEG_MAX_SZELES / (String(kicsi).length * ALCIM_ARANY))
    : 0;
  const alcimMeret = Math.min(ALCIM_MERET, alcimFer);
  const alcimLatszik = !!kicsi && alcimMeret >= ALCIM_MIN_MERET;
  const szoveg = sorok.map((s, k) =>
    `<text x="${W / 2}" y="${kezd + k * sorMagassag}" text-anchor="middle" font-size="${meret}"
     font-family="${BETU_CSALAD}" font-weight="900" fill="${TINTA}">${esc(s)}</text>`).join('\n');

  // Haladásjelző: Reelsben ez mutatja, mennyi van hátra — ez tartja bent a
  // nézőt. ⚠️ KÖZÉPRE került (y=1180): a régi helyén, y=1788-on a platform
  // saját leírás-sávja alatt volt, azaz gyakorlatilag láthatatlan.
  const SAV_SZELES = 720, SAV_X = (W - SAV_SZELES) / 2, RES = 10;
  const sav = Array.from({ length: db }, (_, k) => {
    const sz = (SAV_SZELES - (db - 1) * RES) / db;
    return `<rect x="${SAV_X + k * (sz + RES)}" y="${SAV_JELZO_Y}" width="${sz}" height="8" rx="4"
      fill="${ZSALYA}" opacity="${k <= i ? '1' : '0.22'}"/>`;
  }).join('\n');

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  ${alap ? `<rect width="${W}" height="${H}" fill="${PAPIR}"/>` : ''}
  <rect x="0" y="0" width="${W}" height="14" fill="${ZSALYA}"/>
  <rect x="${W - 166}" y="270" width="96" height="56" rx="10" fill="${TINTA}"/>
  <text x="${W - 118}" y="311" text-anchor="middle" font-size="38"
    font-family="${BETU_CSALAD}" font-weight="900" fill="${PAPIR}">AI</text>
  ${cimke ? `<text x="${W / 2}" y="640" text-anchor="middle" font-size="190"
      font-family="${BETU_CSALAD}" font-weight="900" fill="${ZSALYA}" opacity="0.30">${cimke}</text>` : ''}
  ${szoveg}
  ${alcimLatszik ? `<text x="${W / 2}" y="${utolsoSor + 70}" text-anchor="middle" font-size="${alcimMeret}"
    font-family="${BETU_CSALAD}" fill="${HALVANY}">${esc(kicsi)}</text>` : ''}
  ${sav}
  <text x="${W / 2}" y="${MARKAJEL_Y}" text-anchor="middle" font-size="40" letter-spacing="5"
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
// ── A HÁTTÉR-SZÍNFOLT (2026-09-21) ──────────────────────────────────
//
// Az ELMOSAS és a PAPIR_FEDES együtt dönti el, mennyi marad a képből.
// Nem szabad „ízlés szerint" állítani rajtuk: a 70/0,80 pároshoz tartozik
// a mérés (0,0000% éles átmenet 25 borítón) ÉS a világosság-garancia
// (0,2 × kép + 0,8 × papír → legsötétebb ~189/255). Ha valaki gyengíti
// őket, a hibás felirat újra kilátszhat — ezért a teszt mindkettőt őrzi.
export const HATTER_ELMOSAS = 70;
export const HATTER_PAPIR_FEDES = 0.80;
const PAPIR_RGB = { r: 0xf2, g: 0xed, b: 0xe4 };

/**
 * A tábla háttere: a cikk borítóképéből elmosott színfolt, vagy — ha
 * nincs kép — egybefüggő papírszín.
 *
 * ⚠️ SOHA NEM DOB. Hiányzó vagy olvashatatlan kép esetén a papírszínre
 * esik vissza: egy háttér miatt nem maradhat el a napi Reel.
 *
 * @param {object} sharp a behúzott sharp modul
 * @param {string} kepUt a borítókép útvonala ('' = nincs)
 */
export async function hatterKepbol(sharp, kepUt) {
  const sima = () => sharp({ create: { width: W, height: H, channels: 3, background: PAPIR } })
    .png().toBuffer();
  if (!kepUt || !existsSync(kepUt)) return sima();
  try {
    const nyers = await sharp(kepUt)
      .resize(W, H, { fit: 'cover', position: 'attention' })
      .blur(HATTER_ELMOSAS)
      .modulate({ saturation: 0.75 })
      .removeAlpha()
      .raw().toBuffer({ resolveWithObject: true });
    const px = nyers.data;
    const f = HATTER_PAPIR_FEDES;
    for (let i = 0; i < px.length; i += 3) {
      px[i]     = Math.round(px[i]     * (1 - f) + PAPIR_RGB.r * f);
      px[i + 1] = Math.round(px[i + 1] * (1 - f) + PAPIR_RGB.g * f);
      px[i + 2] = Math.round(px[i + 2] * (1 - f) + PAPIR_RGB.b * f);
    }
    return await sharp(px, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
  } catch (e) {
    console.log('   ⚠️ a borítókép nem használható (' + e.message + ') — papírszín megy helyette');
    return sima();
  }
}

export async function renderVideo(cards, { out, workDir, voice = 'en-US-AvaMultilingualNeural', kepUt = '' }) {
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

  // 🎨 A HÁTTÉR A CIKK SAJÁT KÉPÉBŐL — SZÍNFOLTKÉNT (2026-09-21, user-kérés)
  //
  // ELŐZMÉNY. 09-17-én kivettük a borítóképet, mert az AI-generált borítók
  // HIBÁS FELIRATOT tartalmazhatnak („perrplexity", két r-rel), és a 9-es
  // sugarú elmosás alól az kilátszott. Az akkori indoklásom azt írta: „a
  // takarást nem lehet elég erősre hangolni; ami annyira el van mosva,
  // hogy a hibát elfedi, az már csak színes zaj, azaz nem ad semmit."
  //
  // 🔑 AZ AKKORI CÉL MÁS VOLT. Akkor azt akartuk, hogy LÁTSZÓDJON a kép.
  // A user mai kérése más: azt akarja, hogy minden Reel MÁSKÉPP nézzen ki.
  // Ahhoz a „színes zaj" épp elég — a cikk saját színeit hozza, és attól
  // lesz a napi videó mindig más. Ugyanaz a technika, másik kérdésre.
  //
  // AMIT MÉRTÜNK (2026-09-21, 25 valódi borítón; a mérő HITELESÍTVE, mert
  // a nyers képre 11,62%-ot ad, tehát tényleg lát):
  //   nyers kép ......................... 11,62% éles átmenet
  //   + papír-keverés ................... 1,73%
  //   + 70-es elmosás (ez megy ki) ...... 0,0000%   ← sehol nem marad betű
  //
  // ⚠️ AZ ELSŐ MÉRŐM VAK VOLT, és a hitelesítő eset fogta meg: a nyers
  // képre is nullát mondott. Nem a képlet volt rossz, hanem a HITELESÍTŐ
  // ág is átment a papír-keverésen — rosszul izoláltam a változót.
  //
  // OLVASHATÓSÁG — NEM REMÉNY, HANEM HATÁR. A kimenet
  // `0,2 × kép + 0,8 × papír`, tehát a LEGSÖTÉTEBB lehetséges háttér is
  // ~189/255 világos. Nincs az a borítókép, amitől a tinta-fekete szöveg
  // olvashatatlanná válna. Teszt őrzi (core/short-video.test.js).
  const hatter = await hatterKepbol(sharp, kepUt);

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

    await sharp(hatter).composite([{ input: tablaSvg(cards[i], i, cards.length, { alap: false }) }])
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
  cardsFromGuide, splitHeading, horogCimbol, nagybetusHorog, becsultHossz, renderVideo, tablaSvg,
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
    // ⚠️ A PARANCSSOR IS KAPJA MEG A BORÍTÓT (2026-09-21). Enélkül a
    // kézi próba és a CI „csak_render" gombja a RÉGI, papírszínű
    // táblát mutatná, miközben az automatika már a képes hátteret
    // gyártja — vagyis pont az ellenőrzés nézne mellé.
    kepUt: join(ROOT, 'website', 'assets', 'images', slug + '.jpg'),
    workDir: join(ROOT, '.video-munka')
  });
  rmSync(join(ROOT, '.video-munka'), { recursive: true, force: true });
  console.log('✅ ' + r.file + ' — ' + r.seconds.toFixed(1) + ' mp, ' + W + 'x' + H);
}

const kozvetlen = process.argv[1] && process.argv[1].endsWith('short-video.js');
if (kozvetlen) main().catch(e => { console.error('💥 short-video hiba:', e.message); process.exit(1); });
