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
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'fs';
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

// AZ ALSÓ FELIRAT (2026-10-16, user: „a videókból is szeretnék olvasót!"). Mérve (Meta):
// egy Reelt átlagosan 1–2 mp-ig néznek, ezért a záró kártya „aiworldhq.com"-ját szinte
// senki nem látja — a teljes útmutató létét az ELSŐ kockától, minden kártyán kiírjuk.
// Minden platformon igaz (a TikTokon a link nem kattintható, a domain beírható).
export const REEL_MARKA = 'FULL GUIDE: AIWORLDHQ.COM';
export const ALAP_MARKA = 'AIWORLDHQ.COM';
export const MARKA_MERET = 40;     // a régi, rövid felirat mérete — nem változik
export const MARKA_TAV = 5;        // betűköz (letter-spacing)
export const MARKA_ARANY = 0.75;   // nagybetűs félkövér: mért ~0,725 (AIWORLDHQ.COM) → felfelé kerekítve

// ── AZ ÚJ NYITÓKÉP: FÁJDALOM-KÉRDÉS A MEGOLDÁS HELYETT (2026-10-25) ──
//
// MIÉRT. Mérve (2026-10-25): a FB Reels és a TikTok nézői átlagosan 2 mp-ig
// néznek, a 3 mp-et csak ~8% éri el. A 4 poszt, ami 500 megtekintés fölé ment,
// MIND egy FÁJDALOM-kérdéssel / problémával nyitott („Stop rewriting the same
// instructions…", „Need a name for your side project…?"). A régi első kártya
// a MEGOLDÁST írta ki (az útmutató címét, néha csak annyit: „Use Grok"), és
// ALUL, egy papírkártyán — ott, ahol a TikTok/Reels saját felülete takarja.
//
// A user a „B" tervet hagyta jóvá: „B szerintem, a kabala az összesítőnél
// legyen változatlanul!" — tehát ezen a képen NINCS kabala. A terv: a borító
// sötétítve, középen nagy fehér kérdés, a címmel közös szavak sárga
// kiemeléssel, alatta zöld „Fix it in N steps ↓", és egy rövid „pop"
// (nagyítás) az első 0,2 mp-ben.
//
// A KÉRDÉS FORRÁSA a content/social/<slug>.json `facebook` mezője: azt az LLM
// úgy írja, hogy az ELSŐ mondata egy fájdalom-horog („Got a long meeting
// transcript sitting in your inbox?"). Ha nincs használható első mondat, vagy
// nem fér ki, a RÉGI első kártya megy — a HALLGATÁS A BIZTONSÁGOS IRÁNY.
//
// 🔌 KAPCSOLÓ: false → mindig a régi első kártya, akkor is, ha a hívó horgot
// ad. (A config `enabled` mezője NEM kapcsol ki semmit — ezért kód-oldali.)
export const UJ_NYITOKEP_BE = true;

// A biztonságos terület a horog-képen. JOBBRA 170 px: ott ülnek a TikTok/FB
// függőleges gombjai (like, komment, megosztás). ALUL 1190: eddig érhet a zöld
// pirula alja — alatta, a MARKAJEL_Y vonalon a „FULL GUIDE: AIWORLDHQ.COM" sor,
// mint minden más kártyán (a SAV_ALSO alatt már a leírás és a link takar).
// A kérdés a 520-as vonalnál kezdődik — a fejléc-sor alatt.
export const HOROG_X = 90;
export const HOROG_JOBB = 170;
export const HOROG_SZELES = 1080 - HOROG_X - HOROG_JOBB;   // = 820
export const HOROG_TETO = 520;
export const HOROG_ALJA = 1190;
export const HOROG_MAX_MERET = 116;
export const HOROG_MIN_MERET = 84;       // ennél kisebb betű már nem „megállító" — inkább a régi kártya
export const HOROG_MAX_SOR = 5;
export const HOROG_SOR_TAV = 1.12;       // sormagasság a betűméret arányában (a jóváhagyott mintán)
// A márkajel + AI-jel sorának teteje. FÜGGETLEN ÁTNÉZÉS 10-25: a mintán 140 volt, de a
// felső ~250 px-et a Facebook/TikTok fejléce takarja (SAV_FELSO) — az EU AI-jelölés
// eltűnt volna. 270 = ugyanott, ahol a régi kártyák AI-doboza áll.
export const HOROG_FEJ_Y = 270;
export const POP_MP = 0.2;               // ennyi ideig látszik a „pop" kocka
// A POP BEUGRÁS (független átnézés 10-25): eredetileg az egész kép 108%-ra nagyítva —
// így a fejléc a takart sávba, a szöveg a gombsor alá csúszott 0,2 mp-re. Helyette a
// kérdés + pirula 92%-ról ugrik a végleges méretre; a háttér, a fejléc és a márkasor
// áll → semmi nem lép ki a biztonságos sávból.
export const POP_SKALA = 0.92;
// a zöld válasz-pirula méretei (a tördelés is ezzel számol: a pirula aljának is be kell férnie)
const PIR_MERET = 46, PIR_BELSO = 36, PIR_MAG = 100, PIR_TAV = 64;
const horogPirTeto = (meret, sorDb) => HOROG_TETO + meret * 0.92 + (sorDb - 1) * meret * HOROG_SOR_TAV + meret * 0.26 + PIR_TAV;

const HOROG_SARGA = '#f5d547';
const HOROG_MENTA = '#9cc7b2';           // a márkajel pontja

/**
 * A horog a közösségi szöveg ELSŐ mondatából — vagy `null` (→ régi kártya).
 *
 * Szabály (2026-10-25): az első mondat (. ? ! UTÁN, szóköznél vágva — így a
 * „“how do I do this?” calls" belső kérdőjele nem vág), URL és emoji nélkül;
 * 12–95 karakter, és nem maradhat benne „http".
 */
export function horogSzovegbol(szoveg) {
  if (typeof szoveg !== 'string') return null;
  // egybetűs rövidítés („U.S.", „e.g.") pontja nem mondatvég (független átnézés 10-25)
  const elso = (szoveg.trim().split(/(?<=[.?!])(?<!\b\p{L}\.)\s+/u)[0] || '')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}\u{1F3FB}-\u{1F3FF}]/gu, '')
    .replace(/\s+/g, ' ').trim();
  if (elso.length < 12 || elso.length > 95 || /http/i.test(elso)) return null;
  return elso;
}

/**
 * A horog a cikk slugjához: content/social/<slug>.json → horogSzovegbol.
 * SOHA nem dob: hiányzó / hibás fájl → null (és a régi első kártya megy).
 */
export function horogSlugbol(ROOT, slug) {
  const s = String(slug == null ? '' : slug);
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(s)) return null;      // útvonal-trükk („../") nem jut ki
  try {
    const j = JSON.parse(readFileSync(join(ROOT, 'content', 'social', s + '.json'), 'utf-8'));
    return horogSzovegbol(j && j.facebook);
  } catch { return null; }
}

// ── A HOROG SZÉLESSÉG-TÁBLÁJA ───────────────────────────────────────
//
// MIÉRT NEM A BETU_ARANY (0,65). Az a táblák rövid, sokszor nagybetűs soraihoz
// készült FELSŐ becslés. Egy kisbetűs kérdés valódi átlaga ~0,55 — a 0,65-tel
// a „Got a long meeting transcript sitting in your inbox?" sem férne 116 px-en
// 5 sorba, pedig a jóváhagyott mintán befér. Ezért itt KARAKTERENKÉNTI tábla
// van: a becsomagolt betű (shared/fonts/schibsted-grotesk-900.ttf) valódi
// előretolásai ezredekben, FELFELÉ kerekítve (U+0020…U+007E). Alávágást nem
// számol, tehát inkább szélesebbnek lát — ez a jó irány.
//
// 🔑 A teszt (core/short-video.test.js) egy FÜGGETLEN TTF-olvasóval ellenőrzi
// a táblát is, és MINDEN valódi horog minden sorát is. Betűcsere → ott bukik.
const HOROG_ASCII = (
  '176,313,437,771,628,960,703,239,380,380,378,635,314,445,324,507,648,453,616,625,'
  + '662,645,632,598,639,635,324,318,635,635,635,592,951,769,707,729,768,622,604,741,'
  + '780,484,630,779,606,989,798,767,718,767,734,677,725,753,743,1067,801,688,666,403,'
  + '507,403,635,500,500,632,659,608,658,615,393,597,632,318,327,651,327,945,646,623,'
  + '659,659,503,570,412,646,645,935,645,658,573,386,300,385,635').split(',').map(Number);
const HOROG_EGYEB = { '’': 314, '‘': 314, '“': 588, '”': 588, '—': 1000, '–': 500, '…': 902, '↓': 673 };

const horogKarSzeles = ch => {
  const k = ch.codePointAt(0);
  if (k >= 32 && k < 127) return HOROG_ASCII[k - 32];
  return HOROG_EGYEB[ch];                                    // undefined = a tábla nem ismeri
};

/** Becsült szélesség pixelben; ismeretlen karakter 1 em (óvatos). */
export function horogSzeles(szoveg, meret) {
  let e = 0;
  for (const ch of String(szoveg)) e += horogKarSzeles(ch) ?? 1000;
  return e / 1000 * meret;
}

const horogSzavak = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);

/** Mohó tördelés `max` pixeles sorokra, adott betűmérettel. */
function horogMoho(szavak, max, meret) {
  const sorok = [];
  let most = '';
  for (const sz of szavak) {
    if (most && horogSzeles(most + ' ' + sz, meret) <= max) most += ' ' + sz;
    else { if (most) sorok.push(most); most = sz; }
  }
  if (most) sorok.push(most);
  return sorok;
}

/**
 * A kérdés tördelése KÉZZEL (az SVG nem tördel): a legnagyobb betű 116-tól
 * 4-esével lefelé, amivel legfeljebb 5 sorba fér a 820 px-es sávba; a sorokat
 * kiegyensúlyozzuk (a mintán `text-wrap: balance` volt — ne lógjon egy szó
 * egyedül az utolsó sorban, ha nem muszáj).
 *
 * `null`, ha 84 px-szel sem fér, vagy a betű nem ismer egy karaktert (üres
 * téglalap lenne a Reelen) → a hívó a régi első kártyát adja.
 *
 * @returns {{sorok: string[], meret: number}|null}
 */
export function horogTordel(kerdes) {
  const szavak = horogSzavak(kerdes);
  if (!szavak.length) return null;
  if ([...szavak.join(' ')].some(ch => horogKarSzeles(ch) === undefined)) return null;
  for (let meret = HOROG_MAX_MERET; meret >= HOROG_MIN_MERET; meret -= 4) {
    const legszelesebbSzo = Math.max(...szavak.map(sz => horogSzeles(sz, meret)));
    if (legszelesebbSzo > HOROG_SZELES) continue;
    const moho = horogMoho(szavak, HOROG_SZELES, meret);
    if (moho.length > HOROG_MAX_SOR) continue;
    if (horogPirTeto(meret, moho.length) + PIR_MAG > HOROG_ALJA) continue;   // a pirula a márkasorra lógna
    // kiegyensúlyozás: a LEGKESKENYEBB sorhossz, ami mellett a sorok száma nem nő
    let lo = legszelesebbSzo, hi = HOROG_SZELES;
    for (let k = 0; k < 24; k++) {
      const kozep = (lo + hi) / 2;
      if (horogMoho(szavak, kozep, meret).length <= moho.length) hi = kozep; else lo = kozep;
    }
    return { sorok: horogMoho(szavak, hi, meret), meret };
  }
  return null;
}

// Kötőszavak: a kiemelés szakaszát nem kezdhetik/zárhatják, és nem számítanak
// „tartalmas" szónak (az „on", „to" közös egyezése semmit nem mond).
const KOTOSZO = new Set(('a an the and or but nor of to in on at by for with from into onto about as up out off over '
  + 'your you yours my me i we our us they them their it its this that these those is are was were be been am '
  + 'do does did have has had can could will would should just so than then too very how what when where why who '
  + 'which if not no all any every some one').split(' '));

/** Egy szó összevetési alakja: kisbetű, írásjel és birtokos „'s" nélkül. TELJES szóalak — nem előtag. */
const szoNorm = w => String(w).toLowerCase().replace(/’/g, "'")
  .replace(/[^\p{L}\p{N}'-]+/gu, '').replace(/'s$/, '').replace(/'/g, '').replace(/^-+|-+$/g, '');

/**
 * Melyik szavak kapjanak SÁRGA kiemelést: a kérdés leghosszabb olyan
 * összefüggő szakasza, amelynek minden szava a címben is szerepel, a két
 * végéről a kötőszavak levágva, és legalább 2 tartalmas szóval. Ha nincs ilyen
 * → üres tömb (nincs kiemelés).
 *
 * ⚠️ TELJES SZÓALAKRA illeszt (Set), SOHA előtagra — a projektben kétszer
 * fogott meg az előtag-illesztés csapdája („analysis → analyzis").
 *
 * @returns {number[]} szó-indexek a kérdés szóközzel tagolt szavai közt
 */
export function kiemeltSzavak(kerdes, cim) {
  const szavak = horogSzavak(kerdes);
  const cimSzavak = new Set(horogSzavak(cim).map(szoNorm).filter(Boolean));
  if (!szavak.length || !cimSzavak.size) return [];
  const norm = szavak.map(szoNorm);
  let legjobb = [], legjobbTart = 0;
  for (let i = 0; i < norm.length;) {
    if (!norm[i] || !cimSzavak.has(norm[i])) { i++; continue; }
    let j = i;
    while (j < norm.length && norm[j] && cimSzavak.has(norm[j])) j++;
    let a = i, b = j - 1;
    while (a <= b && KOTOSZO.has(norm[a])) a++;
    while (b >= a && KOTOSZO.has(norm[b])) b--;
    const tart = norm.slice(a, b + 1).filter(n => !KOTOSZO.has(n)).length;
    if (tart >= 2 && tart > legjobbTart) {
      legjobbTart = tart;
      legjobb = Array.from({ length: b - a + 1 }, (_, k) => a + k);
    }
    i = j;
  }
  return legjobb;
}

export function cardsFromGuide(md, { maxSteps = LEPES_MAX, horog = null, ujNyitokep = UJ_NYITOKEP_BE } = {}) {
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
  // 🆕 AZ ÚJ NYITÓKÉP (2026-10-25, user: „B szerintem…"): ha van használható
  // fájdalom-kérdés ÉS kifér, az első kártya a kérdés lesz. Minden más esetben
  // a régi kártya megy, BETŰRE ugyanúgy, mint eddig (teszt őrzi).
  const kerdes = (ujNyitokep && typeof horog === 'string') ? horogSzavak(horog).join(' ') : '';
  const lepesSzo = SORSZAM[valasztott.length - 1]?.toLowerCase() || valasztott.length;
  const cards = [(kerdes && horogTordel(kerdes)) ? {
    tipus: 'horog',
    kerdes,
    kiemeles: kiemeltSzavak(kerdes, cim),
    // a zöld válasz számjeggyel (a jóváhagyott mintán így), a hang szóval —
    // ugyanúgy, ahogy a régi kártya is mondta („in four steps"). Kijelentés után
    // („Your home can now run…") a „Fix it" furcsa → „See how" (független átnézés 10-25)
    valasz: `${/\?$/.test(kerdes) ? 'Fix it' : 'See how'} in ${valasztott.length} steps ↓`,
    mond: `${kerdes}${/[.?!]$/.test(kerdes) ? '' : '.'} Here's how, in ${lepesSzo} steps.`,
    marka: REEL_MARKA
  } : {
    cimke: '',
    nagy: tordel(horogCim),
    kicsi: `In ${SORSZAM[valasztott.length - 1]?.toLowerCase() || valasztott.length} steps`,
    mond: `${horogMondat}. In ${SORSZAM[valasztott.length - 1]?.toLowerCase() || valasztott.length} fast steps.`,
    marka: REEL_MARKA
  }];

  valasztott.forEach((l, i) => {
    const { nagy, kicsi } = splitHeading(l);
    cards.push({
      cimke: String(i + 1).padStart(2, '0'),
      nagy: tordel(nagy),
      kicsi,
      // A sorszám kimondva tartja követhetően a menetet.
      mond: `${SORSZAM[i] || i + 1}. ${nagy}${kicsi ? ' ' + kicsi : ''}.`,
      marka: REEL_MARKA
    });
  });

  cards.push({
    cimke: '',
    nagy: 'aiworldhq\n.com',
    kicsi: 'The full step-by-step guide',
    // ⚠️ A felolvasó a pontot nem mondja ki — ezért „dot com".
    mond: 'Full guide at aiworldhq dot com.',
    marka: REEL_MARKA
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
// (hatterekKepbol), az az alap RÁFEKÜDNE a képre és letakarná. A gyártás
// ezért `alap: false`-szal hívja; a tesztek és a kézi hívások a régi,
// önmagában is teljes táblát kapják.
// ⚠️ A `kartya` KAPCSOLÓ (2026-09-23, user: „b+c"). Amikor a háttér a cikk
// ÉLES borítóképe, a szöveg egy papírszínű kártyán ül (KARTYA_*), és a
// halvány, nagy lépésszám (cimke) elmarad: a fotón 30%-os átlátszósággal
// nem látszana, csak zavarna.
// ⚠️ A `marka` (2026-10-16): az alsó felirat a KÁRTYÁRÓL jön — az útmutató-Reel
// „FULL GUIDE: AIWORLDHQ.COM"-ot ír (REEL_MARKA), a csomag-reklám és a napi
// összefoglaló a régi domaint (nem ígérhet útmutatót). A hosszabb felirat
// betűmérete a helyhez igazodik; a régi marad 40.
export function tablaSvg({ cimke, nagy, kicsi, marka }, i, db, { alap = true, kartya = false } = {}) {
  if (kartya) cimke = '';
  const maxSzeles = kartya ? KARTYA_SZOVEG_MAX : SZOVEG_MAX_SZELES;
  const markaSzoveg = marka || ALAP_MARKA;
  const markaHossz = [...markaSzoveg].length;
  const markaMeret = Math.min(MARKA_MERET,
    Math.floor((maxSzeles - MARKA_TAV * (markaHossz - 1)) / (markaHossz * MARKA_ARANY)));
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
  const alapMeret = kartya
    ? KARTYA_MAX_MERET
    : (sorok.length <= 2 ? 138 : 116);
  const leghosszabb = Math.max(1, ...sorok.map(s => s.length));
  const meret = Math.max(kartya ? KARTYA_MIN_MERET : SZOVEG_MIN_MERET,
    Math.min(alapMeret, Math.floor(maxSzeles / (leghosszabb * BETU_ARANY))));
  const sorMagassag = meret * 1.08;

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
    ? Math.floor(maxSzeles / (String(kicsi).length * ALCIM_ARANY))
    : 0;
  const alcimMeret = Math.min(ALCIM_MERET, alcimFer);
  const alcimLatszik = !!kicsi && alcimMeret >= ALCIM_MIN_MERET;

  // A papír-táblán a blokk a 980-as alapvonal körül ül ki: ez a Reels-
  // lejátszó KÖZÉPSŐ, biztosan szabad harmada.
  // ⚠️ KÁRTYA-MÓDBAN ALULRÓL ÉPÜL (2026-09-23, user: „inkább a szöveg
  // legyen alul, a kép meg teljes"). Az utolsó sor a haladásjelző fölé kerül,
  // a többi fölötte, és a kártya CSAK akkora, amekkora a szövegnek kell —
  // fölötte a kép szabadon látszik.
  // ⚠️ A SAV_ALSO ALÁ MEGY — A USER DÖNTÉSE. Első körben a SAV_ALSO-nál
  // (1290) állt meg; a user a Facebook-takarás bemutatása UTÁN kérte, hogy
  // „lent jobb lenne… a szövegre gondoltam". A kártya alja ezért a
  // KARTYA_ALJA, és a jobb oldali gombsor elől beljebb húzódik (KARTYA_JOBB).
  const utolsoAlap = alcimLatszik ? KARTYA_SZOVEG_ALJA - 70 : KARTYA_SZOVEG_ALJA;
  const kezd = kartya
    ? utolsoAlap - (sorok.length - 1) * sorMagassag
    : 980 - (sorok.length - 1) * meret * 0.55;
  const utolsoSor = kezd + (sorok.length - 1) * sorMagassag;
  const kartyaTeteje = Math.round(kezd - meret * 0.8 - KARTYA_BELSO);

  // kártya-módban a szöveg a KÁRTYA közepén áll, nem a vászonén
  const kx = kartya ? (KARTYA_X + (W - KARTYA_JOBB)) / 2 : W / 2;
  const jelzoY = kartya ? KARTYA_JELZO_Y : SAV_JELZO_Y;
  const markaY = kartya ? KARTYA_MARKA_Y : MARKAJEL_Y;

  const szoveg = sorok.map((s, k) =>
    `<text x="${kx}" y="${kezd + k * sorMagassag}" text-anchor="middle" font-size="${meret}"
     font-family="${BETU_CSALAD}" font-weight="900" fill="${TINTA}">${esc(s)}</text>`).join('\n');

  // Haladásjelző: Reelsben ez mutatja, mennyi van hátra — ez tartja bent a
  // nézőt. ⚠️ KÖZÉPRE került (y=1180): a régi helyén, y=1788-on a platform
  // saját leírás-sávja alatt volt, azaz gyakorlatilag láthatatlan.
  const SAV_SZELES = 720, SAV_X = kx - SAV_SZELES / 2, RES = 10;
  const sav = Array.from({ length: db }, (_, k) => {
    const sz = (SAV_SZELES - (db - 1) * RES) / db;
    return `<rect x="${SAV_X + k * (sz + RES)}" y="${jelzoY}" width="${sz}" height="8" rx="4"
      fill="${ZSALYA}" opacity="${k <= i ? '1' : '0.22'}"/>`;
  }).join('\n');

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  ${alap ? `<rect width="${W}" height="${H}" fill="${PAPIR}"/>` : ''}
  ${kartya ? `<rect x="${KARTYA_X}" y="${kartyaTeteje}" width="${W - KARTYA_X - KARTYA_JOBB}" height="${KARTYA_ALJA - kartyaTeteje}" rx="36" fill="${PAPIR}" opacity="${KARTYA_FEDES}"/>` : ''}
  <rect x="0" y="0" width="${W}" height="14" fill="${ZSALYA}"/>
  <rect x="${W - 166}" y="270" width="96" height="56" rx="10" fill="${TINTA}"/>
  <text x="${W - 118}" y="311" text-anchor="middle" font-size="38"
    font-family="${BETU_CSALAD}" font-weight="900" fill="${PAPIR}">AI</text>
  ${cimke ? `<text x="${W / 2}" y="640" text-anchor="middle" font-size="190"
      font-family="${BETU_CSALAD}" font-weight="900" fill="${ZSALYA}" opacity="0.30">${cimke}</text>` : ''}
  ${szoveg}
  ${alcimLatszik ? `<text x="${kx}" y="${utolsoSor + 70}" text-anchor="middle" font-size="${alcimMeret}"
    font-family="${BETU_CSALAD}" fill="${HALVANY}">${esc(kicsi)}</text>` : ''}
  ${sav}
  <text x="${kx}" y="${markaY}" text-anchor="middle" font-size="${markaMeret}" letter-spacing="${MARKA_TAV}"
    font-family="${BETU_CSALAD}" font-weight="bold" fill="${TINTA}" opacity="0.65">${esc(markaSzoveg)}</text>
</svg>`);
}

/**
 * AZ ÚJ NYITÓKÉP rárajzolt rétege (2026-10-25, „B" terv, user-jóváhagyással).
 * A háttér (a borító kivágása) NEM része: azt a renderVideo / horogKep teszi alá.
 *
 * Rétegek: sötétítő függőleges átmenet → márkajel + AI-jelölés felül →
 * a SÁRGA kiemelő téglalapok → a kérdés sorai → a zöld válasz-pirula.
 *
 * ⚠️ ELŐBB AZ ÖSSZES SÁRGA TÉGLALAP, UTÁNA AZ ÖSSZES SZÖVEG. A jóváhagyott
 * HTML-mintán a következő sor kiemelése rálógott a fenti sor betűszáraira
 * (a „long" g-jének alját levágta a „meeting" sárga doboza). SVG-ben a később
 * rajzolt elem van felül — tehát ha minden téglalap előbb jön, egyetlen betűt
 * sem takarhat le. Teszt őrzi a sorrendet.
 *
 * ⚠️ AZ AI-JELÖLÉS MARAD (EU AI Act): ugyanúgy „AI" felirat egy dobozban, mint
 * a többi táblán — itt a minta szerinti világos pirulában, a jobb margón BELÜL
 * (a gombsor alá nem kerülhet szöveg).
 *
 * Minden szöveg balra zárt (text-anchor alapértelmezés), x ≥ 90, és a jobb
 * széle ≤ 1080 − 170 — a valódi betűvel mért teszt ezt MINDEN valódi horogra
 * ellenőrzi. 1500 alá semmi nem kerül.
 */
export function horogSvg(kartya, { W: w = W, H: h = H, skala = 1 } = {}) {
  const kerdes = horogSzavak(kartya && kartya.kerdes).join(' ');
  const t = horogTordel(kerdes);
  if (!t) throw new Error('horogSvg: a kérdés nem fér ki — a cardsFromGuide-nak a régi kártyát kellett volna adnia');
  const { sorok, meret } = t;
  const kiemelt = new Set((kartya && kartya.kiemeles) || []);
  const sorMag = meret * HOROG_SOR_TAV;
  const elsoAlap = HOROG_TETO + meret * 0.92;
  const FEHER = '#ffffff';

  const teglak = [], szovegek = [];
  let szoIdx = 0;
  sorok.forEach((sor, k) => {
    const alap = Math.round(elsoAlap + k * sorMag);
    const szavak = sor.split(' ');
    // Elemek: szó, szóköz, szó, … — mindegyik a saját színével. A szóköz csak
    // akkor sárga, ha MINDKÉT szomszédja kiemelt; így a sárga téglalap pontosan
    // a szavakat fogja, és nem lóg ki egy szóköznyit. Az azonos színű egymás
    // melletti elemek egy <tspan>-ba kerülnek.
    const elemek = [];
    szavak.forEach((sz, n) => {
      const ki = kiemelt.has(szoIdx + n);
      if (n > 0) elemek.push({ ki: ki && kiemelt.has(szoIdx + n - 1), szoveg: ' ' });
      elemek.push({ ki, szoveg: sz });
    });
    const darabok = [];
    let x = HOROG_X;
    for (const e of elemek) {
      const sz = horogSzeles(e.szoveg, meret);
      const el = darabok[darabok.length - 1];
      if (el && el.ki === e.ki) { el.szoveg += e.szoveg; el.vegx = x + sz; }
      else darabok.push({ ki: e.ki, szoveg: e.szoveg, x, vegx: x + sz });
      x += sz;
    }
    for (const d of darabok) {
      if (!d.ki) continue;
      const pad = meret * 0.12;
      teglak.push(`<rect x="${Math.round(d.x - pad)}" y="${Math.round(alap - meret * 0.86)}" `
        + `width="${Math.round(d.vegx - d.x + 2 * pad)}" height="${Math.round(sorMag)}" rx="${Math.round(meret * 0.12)}" fill="${HOROG_SARGA}"/>`);
    }
    // xml:space="preserve": a darabok szélén álló szóközt a renderelő különben eldobná
    szovegek.push(`<text x="${HOROG_X}" y="${alap}" font-size="${meret}" font-family="${BETU_CSALAD}" `
      + `font-weight="900" xml:space="preserve">`
      + darabok.map(d => `<tspan fill="${d.ki ? TINTA : FEHER}">${esc(d.szoveg)}</tspan>`).join('')
      + `</text>`);
    szoIdx += szavak.length;
  });

  // a zöld válasz-pirula a kérdés alatt
  const valasz = String((kartya && kartya.valasz) || '');
  const pirTeto = Math.round(horogPirTeto(meret, sorok.length));
  const pirSzeles = Math.round(horogSzeles(valasz, PIR_MERET) + 2 * PIR_BELSO);

  // a márkasor alul — ugyanaz a felirat és vonal, mint a többi kártyán (REEL_MARKA, MARKAJEL_Y)
  const marka = String((kartya && kartya.marka) || REEL_MARKA);
  const markaHossz = [...marka].length;
  const markaMeret = Math.min(MARKA_MERET,
    Math.floor((HOROG_SZELES - MARKA_TAV * (markaHossz - 1)) / (markaHossz * MARKA_ARANY)));

  // pop: a kérdés + pirula a blokk közepe körül kicsinyítve (a fejléc és a márkasor áll)
  const kx = HOROG_X + HOROG_SZELES / 2, ky = (HOROG_TETO + pirTeto + PIR_MAG) / 2;
  const csoport = skala === 1 ? '<g>'
    : `<g transform="translate(${kx} ${Math.round(ky)}) scale(${skala}) translate(${-kx} ${-Math.round(ky)})">`;

  // a felső sor: márkajel balra, AI-jelölés a jobb margón belül
  const FEJ_MERET = 34, AI_BELSO = 22, AI_MAG = 66;
  const aiSzeles = Math.round(horogSzeles('AI', FEJ_MERET) + 2 * AI_BELSO);
  const aiX = w - HOROG_JOBB - aiSzeles;
  const fejAlap = Math.round(HOROG_FEJ_Y + AI_MAG / 2 + FEJ_MERET * 0.35);

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs><linearGradient id="horogArnyek" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="rgb(20,18,14)" stop-opacity="0.55"/>
    <stop offset="0.38" stop-color="rgb(20,18,14)" stop-opacity="0.78"/>
    <stop offset="0.62" stop-color="rgb(20,18,14)" stop-opacity="0.82"/>
    <stop offset="1" stop-color="rgb(20,18,14)" stop-opacity="0.60"/>
  </linearGradient></defs>
  <rect width="${w}" height="${h}" fill="url(#horogArnyek)"/>
  <rect x="${aiX}" y="${HOROG_FEJ_Y}" width="${aiSzeles}" height="${AI_MAG}" rx="12" fill="${PAPIR}"/>
  <text x="${HOROG_X}" y="${fejAlap}" font-size="${FEJ_MERET}" letter-spacing="0.7" font-family="${BETU_CSALAD}" font-weight="900" fill="${PAPIR}" fill-opacity="0.92">AI WORLD HQ<tspan fill="${HOROG_MENTA}">.</tspan></text>
  <text x="${aiX + AI_BELSO}" y="${fejAlap}" font-size="${FEJ_MERET}" font-family="${BETU_CSALAD}" font-weight="900" fill="${TINTA}">AI</text>
  <text x="${HOROG_X}" y="${MARKAJEL_Y}" font-size="${markaMeret}" letter-spacing="${MARKA_TAV}" font-family="${BETU_CSALAD}" font-weight="bold" fill="${PAPIR}" fill-opacity="0.8">${esc(marka)}</text>
  ${csoport}
  ${teglak.join('\n  ')}
  <rect x="${HOROG_X}" y="${pirTeto}" width="${pirSzeles}" height="${PIR_MAG}" rx="${PIR_MAG / 2}" fill="${ZSALYA}"/>
  ${szovegek.join('\n  ')}
  <text x="${HOROG_X + PIR_BELSO}" y="${Math.round(pirTeto + PIR_MAG / 2 + PIR_MERET * 0.35)}" font-size="${PIR_MERET}" font-family="${BETU_CSALAD}" font-weight="900" fill="#ffffff">${esc(valasz)}</text>
  </g>
</svg>`);
}

/**
 * A horog-kártya KÉT képkockája: a normál és a „pop" (a kérdés + pirula
 * POP_SKALA méretben) változat — mindkettő JPEG. A háttér a borító kivágása
 * (hatterekKepbol) vagy a papírszín.
 *
 * MIÉRT A POP (2026-10-25): a görgetés közben a mozgás állítja meg a szemet;
 * az első 0,2 mp-ben a kérdés „beugrik" a végleges méretére, aztán megáll.
 * Ugyanaz a szöveg, tehát semmi új nem kerül rá, amit ellenőrizni kellene.
 */
export async function horogKep(sharp, kartya, hatter) {
  const kep = await sharp(hatter).composite([{ input: horogSvg(kartya) }]).jpeg({ quality: 92 }).toBuffer();
  const pop = await sharp(hatter).composite([{ input: horogSvg(kartya, { skala: POP_SKALA }) }]).jpeg({ quality: 92 }).toBuffer();
  return { kep, pop };
}

/**
 * Az ffmpeg concat-lista (kepek.txt) szövege. Pop nélkül BETŰRE a régi kimenet.
 * Pop-pal az első kártya KÉT bejegyzés: előbb a pop-kocka (`k0p.jpg`) POP_MP-ig
 * (legfeljebb a kártya felééig), aztán a normál `k0.jpg` a maradék időre — a
 * kettő összege PONTOSAN idok[0], mert a kártya hossza a hanghoz van kötve
 * (lásd a fájl elején: a szünet a HANGBA is kell, különben elcsúszik).
 */
export function kepListaSor(idok, { pop = false } = {}) {
  const sorok = idok.map((d, i) => {
    if (i === 0 && pop) {
      const p = Math.min(POP_MP, d / 2);
      return `file 'k0p.jpg'\nduration ${p.toFixed(3)}\nfile 'k0.jpg'\nduration ${(d - p).toFixed(3)}`;
    }
    return `file 'k${i}.jpg'\nduration ${d.toFixed(3)}`;
  });
  return sorok.join('\n') + `\nfile 'k${idok.length - 1}.jpg'\n`;
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
// ── A HÁTTÉR: A CIKK ÉLES BORÍTÓJA, LÉPÉSENKÉNT MÁSHOVA NÉZVE ────────
// (2026-09-23, user: „nem lehet megkülönböztetni egymástól… egyhangú",
// a bemutatott változatokból a „b+c"-t választotta)
//
// ELŐZMÉNY. 09-21-től a borító 70-es elmosással és 80% papírral fedve ment
// ki, hogy a gépi borítók elírt feliratai ne látsszanak. Az eredmény egy
// halvány színfolt lett: minden Reel ugyanaz a drapp lap. A 09-23-i
// posztereknél a user az ÉLES képet választotta, tudva, hogy a gépi
// borítón néha elírt felirat látszik (ugyanaz a kép élesen kint van a
// cikkoldalon is) — itt ugyanez a döntés.
//
// B — a kép ÉLESEN kitölti a teljes hátteret; a szöveg egy papírszínű
//     KÁRTYÁN ül, így az olvashatóság nem a képen múlik.
// C — lépésenként a kép MÁS RÉSZE látszik (vándorló kivágás): a videó
//     közben is változik, nem egy állókép. A 16:9-es borító a 1920-as
//     magasságra nagyítva ~3400 px széles, ebből vándorol az 1080-as ablak.
//
// OLVASHATÓSÁG — NEM REMÉNY, HANEM HATÁR: a kártyán a kép legfeljebb
// (1 − KARTYA_FEDES) = 6%-ban üt át, tehát teljesen fekete kép mellett is
// ~223/255 világos a szöveg alatti felület. Teszt őrzi, fekete bemenettel.
// A kártya BAL széle és a JOBB oldalon hagyott sáv. A jobb oldalon a
// Facebook függőlegesen sorakozó gombjai (like, komment, megosztás) ülnek —
// a szöveg nem kerülhet alájuk, ezért a kártya onnan beljebb húzódik.
export const KARTYA_X = 90;                 // ⚠️ KÖZÉPEN: bal = jobb (user, 09-23: „legyen középen a szövegdoboz")
export const KARTYA_JOBB = 90;
// A szöveg a kártyán BELÜL 40-40 px levegőt kap. Az első változatban a
// szöveg pontosan akkora volt, mint a kártya — az „Open Gemini" a kártya
// széléig ért. Kártya-módban ezért keskenyebb a keret.
export const KARTYA_SZOVEG_MAX = 1080 - 90 - 90 - 2 * 40;   // = 820
// A legkisebb betű a kártyán: a leghosszabb (21 karakteres) sor is
// beleférjen a 870-es keretbe (21 × 0,65 × 62 = 846). A 1920-as képen
// még bőven olvasható.
export const KARTYA_MIN_MERET = 60;       // 21 × 0,65 × 60 = 819 ≤ 820
// ⚠️ A KÁRTYA ALJA A FACEBOOK-TAKARÁS SÁVJÁBAN VAN — A USER DÖNTÉSE
// (2026-09-23). Első körben a SAV_ALSO-nál (1290) állt meg; a user a
// takarási sávok bemutatása után kérte: „lent jobb lenne… a szövegre
// gondoltam". Az 1640 a leírás (legalsó ~280 px) FÖLÖTT hagyja.
export const KARTYA_ALJA = 1640;
export const KARTYA_JELZO_Y = KARTYA_ALJA - 90;      // a haladásjelző a kártyán
export const KARTYA_MARKA_Y = KARTYA_ALJA - 28;      // a márkajel a kártyán
export const KARTYA_SZOVEG_ALJA = KARTYA_JELZO_Y - 48; // az utolsó sor alapvonala
export const KARTYA_BELSO = 40;            // levegő a szöveg fölött a kártyán
export const KARTYA_MAX_MERET = 100;       // kártyán kisebb a betű → kisebb kártya, több kép
export const KARTYA_FEDES = 0.94;
export const VANDORLAS = [0.2, 0.8];       // a kivágás bal széle a szabad sáv 20→80%-án

/** A kivágás bal szélének aránya az i. kártyánál (0…1). */
export function vandorlasArany(i, db) {
  const [tol, ig] = VANDORLAS;
  return db > 1 ? tol + (ig - tol) * (i / (db - 1)) : (tol + ig) / 2;
}

/**
 * Kártyánként egy-egy ÉLES háttér a borítóból, lépésenként máshova nézve.
 *
 * ⚠️ SOHA NEM DOB. Hiányzó vagy olvashatatlan kép esetén `null`-t ad, és a
 * gyártás a régi, egyszínű papír-táblára esik vissza: egy háttér miatt nem
 * maradhat el a napi Reel.
 *
 * @param {object} sharp a behúzott sharp modul
 * @param {string} kepUt a borítókép útvonala ('' = nincs)
 * @param {number} db a kártyák száma
 * @returns {Promise<Buffer[]|null>}
 */
export async function hatterekKepbol(sharp, kepUt, db) {
  if (!kepUt || !existsSync(kepUt) || !(db > 0)) return null;
  try {
    const { data, info } = await sharp(kepUt).resize({ height: H }).removeAlpha()
      .png().toBuffer({ resolveWithObject: true });
    // álló vagy keskeny kép: nincs hova vándorolni → kitöltjük, egyformán
    if (info.width < W) {
      const egy = await sharp(kepUt).resize(W, H, { fit: 'cover', position: 'attention' }).png().toBuffer();
      return Array.from({ length: db }, () => egy);
    }
    const szabad = info.width - W;
    const ki = [];
    for (let i = 0; i < db; i++) {
      const left = Math.round(szabad * vandorlasArany(i, db));
      ki.push(await sharp(data).extract({ left, top: 0, width: W, height: H }).png().toBuffer());
    }
    return ki;
  } catch (e) {
    console.log('   ⚠️ a borítókép nem használható (' + e.message + ') — papírszín megy helyette');
    return null;
  }
}

/**
 * TÁBLÁNKÉNT KÜLÖN KÉP (2026-09-27): a csomag-reklámnak nincs saját borítója,
 * ezért a RÉGI papír-dizájnnal ment ki (a user: „a régi dizájnnal ment ki!").
 * Itt minden tábla a saját képét kapja (egy-egy illő útmutató borítóját).
 * Ami hiányzik, azt az első használható kép pótolja; ha egy sincs → null (papír).
 */
export async function hatterekKepekbol(sharp, utak) {
  if (!Array.isArray(utak) || !utak.length) return null;
  const ki = [];
  for (const u of utak) ki.push(((await hatterekKepbol(sharp, u, 1)) || [null])[0]);
  const elso = ki.find(Boolean);
  if (!elso) return null;
  return ki.map(k => k || elso);
}

export async function renderVideo(cards, { out, workDir, voice = 'en-US-AvaMultilingualNeural', kepUt = '', kepUtak = null }) {
  const sharp = (await import('sharp')).default;
  const et = await import('./edge-tts.js');
  const { MsEdgeTTS, OUTPUT_FORMAT } = await et.edgeTts();   // új MS-host (10-12)

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

  // 🎨 A HÁTTÉR A CIKK ÉLES BORÍTÓJA, LÉPÉSENKÉNT MÁSHOVA NÉZVE (2026-09-23)
  //
  // Előzmény: 09-17-én a borító kikerült (gépi elírt felirat), 09-21-én
  // színfoltként (70-es elmosás + 80% papír) jött vissza — de abból minden
  // Reel ugyanaz a drapp lap lett. A user 09-23-án a bemutatott változatok
  // közül az éles, teljes hátteret + vándorló kivágást választotta, tudva,
  // hogy a gépi borítón néha elírt felirat látszik. A részletek és az
  // olvashatósági garancia: hatterekKepbol() és a KARTYA_* állandók.
  // Ha nincs kép: `null` → a régi, egyszínű papír-tábla megy.
  // (2026-09-23) A színfolt helyett ÉLES kép, lásd hatterekKepbol().
  const hatterek = (Array.isArray(kepUtak) && kepUtak.length === cards.length)
    ? await hatterekKepekbol(sharp, kepUtak)
    : await hatterekKepbol(sharp, kepUt, cards.length);
  const papir = await sharp({ create: { width: W, height: H, channels: 3, background: PAPIR } }).png().toBuffer();
  // 🆕 AZ ÚJ NYITÓKÉP (2026-10-25): ha az első kártya fájdalom-kérdés, más
  // rétegű képet kap (horogSvg) és egy „pop" kockát elé (kepListaSor).
  const horogKartya = cards[0]?.tipus === 'horog';

  const idok = [];
  for (let i = 0; i < cards.length; i++) {
    const nyers = join(workDir, `n${i}.mp3`), mp3 = join(workDir, `h${i}.mp3`);

    // 10-14: egyetlen 429 az egész gyártást megállította → türelmes újrapróba (core/edge-tts.js).
    writeFileSync(nyers, await et.hangSzintezis({ MsEdgeTTS, OUTPUT_FORMAT }, voice, cards[i].mond));

    // A szünet a HANGBA is bekerül — enélkül a kép elcsúszik a beszédtől.
    execFileSync('ffmpeg', ['-y', '-i', nyers, '-af', `apad=pad_dur=${SZUNET_MP}`,
      '-c:a', 'libmp3lame', mp3], { stdio: 'pipe' });
    idok.push(hossz(mp3));

    if (i === 0 && horogKartya) {
      const { kep, pop } = await horogKep(sharp, cards[0], hatterek ? hatterek[0] : papir);
      writeFileSync(join(workDir, 'k0.jpg'), kep);
      writeFileSync(join(workDir, 'k0p.jpg'), pop);
      continue;
    }

    const tabla = hatterek
      ? tablaSvg(cards[i], i, cards.length, { alap: false, kartya: true })
      : tablaSvg(cards[i], i, cards.length, { alap: false });
    await sharp(hatterek ? hatterek[i] : papir).composite([{ input: tabla }])
      .jpeg({ quality: 92 }).toFile(join(workDir, `k${i}.jpg`));
  }

  writeFileSync(join(workDir, 'kepek.txt'), kepListaSor(idok, { pop: horogKartya }), 'utf-8');
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
  horogSzovegbol, horogSlugbol, kiemeltSzavak, horogTordel, horogSvg, horogKep, kepListaSor,
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
  // A parancssor (a CI „csak_render" gombja, .github/workflows/reel-test.yml)
  // UGYANAZT a nyitóképet kapja, mint az automatika — különben a kézi próba
  // a régi első kártyát mutatná (2026-10-25, ugyanaz a lecke, mint a borítónál).
  const { cards, reason } = cardsFromGuide(a.article_markdown || '', { horog: horogSlugbol(ROOT, slug) });
  if (!cards) { console.log('⏭️  kihagyva — ' + reason); return; }

  console.log('🎬 ' + slug);
  for (const c of cards) console.log('   ' + (c.cimke || (c.tipus === 'horog' ? '❓' : '  ')) + '  «' + c.mond + '»');
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
