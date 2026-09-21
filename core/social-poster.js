// ===================================================================
// INFOGRAFIKA A KÖZÖSSÉGI POSZTHOZ (2026-09-21, user-kérés)
// ===================================================================
//
// A user olyan posztokat mutatott, amik most mennek a Facebookon:
// szerkesztett infografikák — fejléc, ikonok, számozott dobozok, záró sáv.
// „ez megy a facebookon, nem amit mi csinálunk."
//
// ⚠️ AZ ELSŐ VÁLTOZATOM CSAK SZÖVEG-DOBOZOKAT RAJZOLT, és a user egy
// mondattal elintézte: „nincs a háttérben semmilyen grafika! nézd meg a
// mintákat!" Igaza volt. A mutatott posztok attól élnek, hogy MINDEN
// soruk mellett van egy jel. Azóta: lépésenként kulcsszóval választott
// vonalas ikon (core/social-icons.js), pont-rács a fejléc mögött, és
// ahol van, a cikk témájához tartozó VALÓDI márkalogó.
//
// AMIT ÁTVESZÜNK A MINTÁKBÓL: a szerkesztett, jelekkel tagolt szerkezet.
// AMIT NEM:
//   ❌ a „kommentelj a csomagért" mechanika — a Meta bünteti az
//      elköteleződés-csalit, és nincs listánk, amit építsünk
//   ❌ a teljes tartalom kirakása. A mutatott posztok LISTÁT építenek,
//      NEKÜNK KATTINTÁS KELL. A mi átkattintásunk 21,2% (FB-átlag 1–3%)
//      épp azért, mert a poszt ÍZELÍTŐ — ezért látszik 5 lépés, a többi
//      „+N more step in the full guide".
//
// ⚠️ MINDEN SZÖVEG ÉS MINDEN VONAL KÓDBÓL JÖN, nem képgenerátorból. Egy
// AI-val rajzolt infografikán egyetlen elgépelt szó is nyilvános lenne —
// a Reel borítóján élesben ott volt a „perrplexity", két r-rel.
//
// ⚠️ A SŰRŰSÉG SZÁNDÉKOSAN KISEBB, mint a mutatott példáké. Azok telefonon,
// hírfolyam-méretben koppintás nélkül olvashatatlanok. Nekünk a KOPPINTÁST
// kell megnyerni, nem a képernyőt megtölteni.
// ===================================================================

import { ikonokHoz, ikonSvg } from './social-icons.js';
// A „How to" levágása után nagybetűvel kell kezdődnie a címnek — a
// `nagybetusHorog` ugyanezt a munkát végzi a Reel nyitótábláján, és
// ismeri a VÉDETT neveket (xAI, iPhone, iOS, eBay…), amiket TILOS
// nagybetűsíteni. Egy második, saját nagybetűsítő pont az a párhuzamos
// megvalósítás lenne, ami ellen ez a projekt külön tesztet tart.
import { nagybetusHorog } from './short-video.js';

export const W = 1080, H = 1350;

const BETU = "Arial, Helvetica, 'DejaVu Sans', sans-serif";

/**
 * A három mérési kar. A `foto` a mostani (fotó + cím-sáv), a másik kettő
 * az infografika két színvilága. A user döntése (09-21): mind a hármat
 * kipróbáljuk, és a számok döntsenek.
 */
export const KAROK = ['foto', 'vilagos', 'sotet'];

export const STILUS = {
  vilagos: {
    hatter: '#f2ede4', lap: '#ffffff', tinta: '#1c1a16', halvany: '#5c5850',
    kiemel: '#3f6b57', chipSzoveg: '#ffffff', keret: 'rgba(0,0,0,0.08)', kepAtl: 0.14
  },
  sotet: {
    hatter: '#0f1720', lap: '#16212c', tinta: '#ffffff', halvany: '#9fb0be',
    kiemel: '#2fb3c9', chipSzoveg: '#0f1720', keret: 'rgba(255,255,255,0.10)', kepAtl: 0.20
  }
};

/**
 * Melyik karba tartozik ez a cikk?
 *
 * 🔑 SZÁMOLT, NEM TÁROLT. Egy külön nyilvántartás elcsúszhatna a
 * valóságtól (és a `memory/*.json`-t sem akarjuk hizlalni); így viszont az
 * elemzés BÁRMIKOR visszafejti, melyik poszt melyik karba esett — a slugból.
 * Determinisztikus: ugyanaz a cikk mindig ugyanazt a képet kapja, tehát egy
 * újraküldés nem keveri össze a mérést.
 */
export function kar(slug) {
  const s = String(slug || '');
  if (!s) return KAROK[0];
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return KAROK[h % KAROK.length];
}

const xmlEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Sortörés karakterszám szerint. */
export function tordel(s, maxKar, maxSor) {
  const szavak = String(s).trim().split(/\s+/);
  const sorok = [];
  let m = '';
  for (const sz of szavak) {
    if (!m) { m = sz; continue; }
    if ((m + ' ' + sz).length <= maxKar) m += ' ' + sz;
    else { sorok.push(m); m = sz; }
  }
  if (m) sorok.push(m);
  return sorok.slice(0, maxSor);
}

export const LEPES_MAX_KAR = 34;

// A lógó szavak. Ezekkel egy sor SOHA nem végződhet: a „Connect your
// Gmail, Drive, and…" hibának látszik, nem rövidítésnek.
//
// ⚠️ A NÉVMÁSOK ÉS A LÉTIGE KÉSŐBB KERÜLTEK IDE (2026-09-21, átvizsgálás):
// az első lista csak névelőket és elöljárókat ismert, így átengedte a
// „Tell Copilot what your…" és a „Verify that nothing sensitive is…"
// alakot. Az is összeomlásnak látszik, nem rövidítésnek.
const LOGO_SZO = /\s+\b(and|or|the|a|an|of|to|for|with|in|on|from|by|into|your|you|my|our|their|its|is|are|was|were|that|what|which|this|these)$/i;

/**
 * Kiegyensúlyozottak-e az idézőjelek és a zárójelek?
 *
 * ⚠️ VALÓDI LELET: egy poszteren ez állt: `Ask "what questions should I ask`
 * — a nyitó idézőjel soha nem záródott, és a sor mégis „teljesnek"
 * látszott, mert nem volt „…" a végén. Öt képet érintett.
 */
export function kiegyensulyozott(s) {
  const t = String(s || '');
  if ((t.match(/"/g) || []).length % 2 !== 0) return false;
  if ((t.match(/“/g) || []).length !== (t.match(/”/g) || []).length) return false;
  if ((t.match(/\(/g) || []).length !== (t.match(/\)/g) || []).length) return false;
  return true;
}

// Ennyi karakternél rövidebb „természetes fél" nem önálló utasítás.
//
// ⚠️ MIÉRT KELL: az „Ask the AI to draft a condolence message" felezve
// „Ask the AI" lett — nyelvtanilag hibátlan, tartalmilag ÜRES, és épp egy
// gyászolóknak szóló útmutató negyedik lépéseként.
//
// ⚠️ ELŐSZÖR ARÁNYT HASZNÁLTAM (55%), és az TÚL SZIGORÚ volt: a „Pick the
// right model" (20 karakter az 54-ből, 37%) is elbukott rajta, pedig az
// tökéletesen önálló utasítás. A hossz jobban elválasztja a kettőt, mint
// az arány: 10 karakter vs. 20.
export const FELE_MIN_KAR = 16;

/**
 * Egy lépés szövege a dobozba — három lépcsőben, mindegyik jobb az utána
 * következőnél:
 *   1. a TELJES lépéscím, ha kifér
 *   2. a természetes fele (splitHeading), ha ÖNMAGÁBAN egész
 *   3. szóhatáron vágva, „…"-tal, ami MEGMONDJA, hogy folytatódik
 *
 * ⚠️ MIÉRT ENNYI GONDOSSÁG EGY SORÉRT. Mérve a 2241 élő lépés-soron: az
 * első változatom 279-et vágott le, és közülük több „…, and"-del vagy
 * vesszővel végződött. A FÉLBEHAGYOTT mondat rosszabb, mint a rövid: az
 * olvasó nem rövidítést lát, hanem hibát — és a gépi tartalomgyár jelét.
 */
export function lepesSzoveg(lepes, splitFn) {
  // ⚠️ AZ IDÉZŐJELEK LEKERÜLNEK, MIELŐTT BÁRMIT VÁGNÁNK.
  //
  // Öt élő lépéscím idézőjelet tartalmazott („Add a »summarize into bullet
  // points« prompt"), és a vágás vagy NYITVA hagyta az idézőjelet a képen,
  // vagy — miután visszavágtam a nyitó jel elé — egy lógó névelő maradt:
  // „Add a…". Egy poszter-soron az idézőjel alig hordoz jelentést, a
  // félbehagyott mondat viszont HIBÁNAK látszik. Ezért inkább elhagyjuk
  // a jeleket, és így több szó is kifér.
  const t = String(lepes || '').replace(/["“”]/g, '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  if (t.length <= LEPES_MAX_KAR) return t;

  if (typeof splitFn === 'function') {
    const fele = String((splitFn(t) || {}).nagy || '').trim();
    // A „természetes fele" CSAK akkor mehet jelölés nélkül, ha tényleg
    // önálló utasítás marad: elég hosszú, tisztán zár, és nem hagy
    // nyitva zárójelet.
    if (fele && fele.length <= LEPES_MAX_KAR && fele.length >= FELE_MIN_KAR
        && !/[,;:\-–—]$/.test(fele) && !LOGO_SZO.test(' ' + fele)
        && kiegyensulyozott(fele)) return fele;
  }

  let v = t.slice(0, LEPES_MAX_KAR - 1);
  const szokoz = v.lastIndexOf(' ');
  if (szokoz > 12) v = v.slice(0, szokoz);
  // A vágás UTÁN is takarítunk: a szóhatár pont egy kötőszó után is állhat.
  for (let i = 0; i < 3; i++) v = v.replace(/[\s,;:.\-–—]+$/, '').replace(LOGO_SZO, '');
  v = v.replace(/[\s,;:.\-–—]+$/, '');
  // Nyitva maradt zárójel: levágjuk a nyitó jelig — majd ÚJRA takarítunk,
  // mert a vágás után ott maradhat egy lógó névelő („Add a…").
  while (v && !kiegyensulyozott(v)) {
    const i = v.lastIndexOf('(');
    if (i <= 0) break;
    v = v.slice(0, i);
    for (let k = 0; k < 3; k++) v = v.replace(/[\s,;:.\-–—]+$/, '').replace(LOGO_SZO, '');
  }
  return v.replace(/[\s,;:.\-–—]+$/, '') + '…';
}

/** Hány lépés fér a képre. Ötnél több már olvashatatlan hírfolyam-méretben. */
export const LEPES_MAX_DB = 5;

// A fejléc-csík. A szélessége SZÁMOLT, nem beírt szám: az első
// változatomban fix 372 px állt itt, és a felirat kilógott belőle minden
// egyes képen. A 0,60 a nagybetűs Arial mért átlagos karakterszélessége
// ennél a méretnél, felfelé kerekítve.
export const CSIK_SZOVEG = 'STEP BY STEP · FREE GUIDE';
const CSIK_BETU = 26;
export const CSIK_SZELES = Math.round(CSIK_SZOVEG.length * CSIK_BETU * 0.60) + 40;

/**
 * Egy márkalogó beágyazása. A `logoBelso` a `website/assets/logos/*.svg`
 * fájl BELSŐ tartalma (a path-ok), amit a hívó olvas be a lemezről.
 * KITALÁLT LOGÓ SOHA — csak az megy ki, ami letöltve ott van.
 */
function logoSvg(logoBelso, { x, y, meret, szin }) {
  if (!logoBelso) return '';
  const m = (meret / 24).toFixed(4);
  return `<g transform="translate(${x} ${y}) scale(${m})" fill="${szin}">${logoBelso}</g>`;
}

/**
 * Az infografika SVG-je.
 *
 * @param {object} o
 * @param {string} o.cim a cikk címe
 * @param {string[]} o.lepesek a nyers lépéscímek
 * @param {object} o.stilus a STILUS egyik bejegyzése
 * @param {Function} o.splitFn splitHeading
 * @param {string} [o.logoBelso] a márkalogó SVG-jének belseje ('' = nincs)
 */
export function poszterSvg({ cim, lepesek, stilus, splitFn, logoBelso = '' }) {
  const sz = stilus;
  const PAD = 56;

  // ── A CÍM ─────────────────────────────────────────────────────────
  //
  // A „How to" lekerül: a fejléc-csík úgyis kimondja, hogy lépésről
  // lépésre szóló útmutatóról van szó, és így hosszabb cím is elfér.
  //
  // ⚠️ KÉT HIBA VOLT ITT, MINDKETTŐ ISMERŐS ALAK (2026-09-21):
  //
  // 1. KISBETŰVEL KEZDŐDÖTT. A „How to brainstorm gift ideas…" címből
  //    „brainstorm gift ideas…" lett — a kép tetején, 66 pixeles betűvel.
  //    UGYANAZ a hiba, amit a Reel nyitótáblájánál 09-19-én javítottunk;
  //    ezért most UGYANAZ a függvény javítja (nagybetusHorog), nem egy
  //    második példány.
  //
  // 2. A HÁROM SOR UTÁN EGYSZERŰEN LEVÁGTA a maradékot: „explain the
  //    confusing parts of a lease or" — kötőszóval a végén. Most a
  //    sorhosszt engedjük (és vele a betűt kicsinyítjük), amíg belefér;
  //    ha úgy sem, jelöljük a „…"-tal, hogy folytatódik.
  const cimNyers = nagybetusHorog(String(cim || '').replace(/^How to\s+/i, '').trim());
  let cimSorok = tordel(cimNyers, 26, 3);
  let cimKar = 26;
  // Ameddig kilóg, szélesítjük a sort — a betűméret ehhez igazodik lentebb.
  while (cimSorok.join(' ').length < cimNyers.length && cimKar < 40) {
    cimKar += 2;
    cimSorok = tordel(cimNyers, cimKar, 3);
  }
  if (cimSorok.join(' ').length < cimNyers.length) {
    // Még így sem fér ki: a „…" MEGMONDJA, hogy van folytatás — de lógó
    // kötőszó és írásjel nem maradhat előtte.
    let u = cimSorok[cimSorok.length - 1];
    for (let i = 0; i < 3; i++) u = u.replace(/[\s,;:.\-–—]+$/, '').replace(LOGO_SZO, '');
    cimSorok[cimSorok.length - 1] = u.replace(/[\s,;:.\-–—]+$/, '') + '…';
  }
  const leghosszabbCim = Math.max(1, ...cimSorok.map(s => s.length));
  // ⚠️ A CÍM BEFUTOTT A SAROK-CSEMPE ALÁ (2026-09-21, átvizsgálás): a
  // jobb felső logó/„AI" jel az x 920–1028 sávot foglalja, a cím
  // szélességét viszont semmi nem korlátozta — 12 poszteren átfedték
  // egymást, a legrosszabbnál 82 px-en. A cím ezért a CSEMPE BAL
  // SZÉLÉIG kaphat helyet, nem a lap széléig.
  const CIM_MAX_SZELES = 900 - PAD;         // a csempe bal széle mínusz margó
  const BETU_ARANY = 0.60;                  // mért nagybetűs Arial-arány
  // 26 karakternél 66 px fért ki kényelmesen; efölött arányosan kisebb.
  const CIM_M = Math.max(40, Math.min(cimSorok.length >= 3 ? 58 : 66,
    Math.round(26 * 66 / leghosszabbCim),
    Math.floor(CIM_MAX_SZELES / (leghosszabbCim * BETU_ARANY))));
  const CIM_SOR = Math.round(CIM_M * 1.12);

  const lathato = (lepesek || []).slice(0, LEPES_MAX_DB);
  const marad = Math.max(0, (lepesek || []).length - lathato.length);

  // ── FEJLÉC ────────────────────────────────────────────────────────
  const cimY = 132;
  const csikY = cimY + (cimSorok.length - 1) * CIM_SOR + 58;
  const fejMagas = csikY + 34;
  const cimSvg = cimSorok.map((l, i) =>
    `<tspan x="${PAD}" y="${cimY + i * CIM_SOR}">${xmlEsc(l)}</tspan>`).join('');

  // Pont-rács a fejléc mögé — ettől lesz „megtervezett" a felület, és
  // szabályos minta lévén a videó/JPEG tömörítés is jól bírja.
  const racs = `<defs><pattern id="r" width="34" height="34" patternUnits="userSpaceOnUse">
      <circle cx="17" cy="17" r="2" fill="${sz.kiemel}" opacity="0.20"/></pattern></defs>
  <rect x="0" y="0" width="${W}" height="${fejMagas}" fill="url(#r)"/>`;

  // ── LÉPÉS-DOBOZOK ─────────────────────────────────────────────────
  // ⚠️ A KÖZÖK SZÁMOLTAK, NEM FIXEK. Az első változatban a doboz-köz fix
  // 16 px volt, a záró sáv viszont a kép aljához rögzítve — így egy
  // 4 lépéses útmutatónál 228 px ÜRES CSÍK maradt a lista alatt, a
  // kártya negyede. Három lépésnél 362 px lett volna. Most a hely
  // szétosztódik a dobozok között, tehát a lap mindig „teleírtnak" látszik.
  const DOBOZ_M = 118;
  const listaTeteje = fejMagas + 22;
  const CTA_HELY = 96;                        // a „+N more step" sornak
  const hely = (H - 158) - listaTeteje - CTA_HELY;
  const DOBOZ_KOZ = lathato.length > 1
    ? Math.max(14, Math.min(46, Math.round((hely - lathato.length * DOBOZ_M) / (lathato.length - 1))))
    : 16;

  // A megjelenő szöveget EGYSZER számoljuk ki, mert az ikont is ANNAK
  // kell választania. Az első változatom a NYERS fejlécből választott, és
  // emiatt a „Save the budget" pipát kapott (a láthatatlan „check" szóra),
  // a „Paste the code" pedig könyvjelzőt (a láthatatlan „save"-re).
  const megjelenő = lathato.map(l => lepesSzoveg(l, splitFn));
  const ikonok = ikonokHoz(megjelenő);

  const dobozok = lathato.map((l, i) => {
    const y = listaTeteje + i * (DOBOZ_M + DOBOZ_KOZ);
    const szovegSorok = tordel(megjelenő[i], 27, 2);
    const kezd = szovegSorok.length === 2 ? y + 48 : y + 72;
    const szovegSvg = szovegSorok.map((s, k) =>
      `<tspan x="${PAD + 148}" y="${kezd + k * 44}">${xmlEsc(s)}</tspan>`).join('');
    return `<rect x="${PAD}" y="${y}" width="${W - 2 * PAD}" height="${DOBOZ_M}" rx="18" fill="${sz.lap}" stroke="${sz.keret}" stroke-width="1"/>
  <rect x="${PAD + 20}" y="${y + 19}" width="80" height="80" rx="20" fill="${sz.kiemel}"/>
  ${ikonSvg(ikonok[i], { x: PAD + 42, y: y + 41, meret: 36, szin: sz.chipSzoveg, vastag: 2.1 })}
  <circle cx="${PAD + 104}" cy="${y + 26}" r="19" fill="${sz.tinta}"/>
  <text x="${PAD + 104}" y="${y + 34}" text-anchor="middle" font-family="${BETU}" font-size="22" font-weight="800" fill="${sz.lap}">${i + 1}</text>
  <text font-family="${BETU}" font-size="34" font-weight="600" fill="${sz.tinta}">${szovegSvg}</text>`;
  }).join('\n  ');

  const listaAlja = listaTeteje + lathato.length * DOBOZ_M + (lathato.length - 1) * DOBOZ_KOZ;

  // ── ZÁRÓ SÁV ──────────────────────────────────────────────────────
  const zaroY = H - 158;
  const zaro = marad > 0
    ? `+ ${marad} more step${marad > 1 ? 's' : ''} in the full guide`
    : 'The full guide is free to read';

  // A jobb felső sarok: ahol van márkalogó, az megy; ahol nincs, az
  // „AI" jelölés. Az AI-jelölés a ZÁRÓ SÁVBAN MINDIG ott van, tehát a
  // logó nem szorítja ki (EU AI Act).
  const sarok = logoBelso
    ? `<rect x="${W - 160}" y="54" width="108" height="108" rx="26" fill="${sz.lap}"/>
  ${logoSvg(logoBelso, { x: W - 133, y: 81, meret: 54, szin: sz.tinta })}`
    : `<rect x="${W - 150}" y="60" width="88" height="46" rx="12" fill="${sz.kiemel}"/>
  <text x="${W - 106}" y="93" text-anchor="middle" font-family="${BETU}" font-size="27" font-weight="800" fill="${sz.chipSzoveg}">AI</text>`;

  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  ${racs}
  <rect x="0" y="0" width="${W}" height="12" fill="${sz.kiemel}"/>
  ${sarok}
  <text font-family="${BETU}" font-size="${CIM_M}" font-weight="800" fill="${sz.tinta}">${cimSvg}</text>
  <rect x="${PAD}" y="${csikY - 32}" width="${CSIK_SZELES}" height="46" rx="12" fill="${sz.kiemel}"/>
  <text x="${PAD + 20}" y="${csikY}" font-family="${BETU}" font-size="26" font-weight="800" fill="${sz.chipSzoveg}">${CSIK_SZOVEG}</text>
  ${dobozok}
  ${ikonSvg('szikra', { x: PAD + 2, y: listaAlja + 16, meret: 30, szin: sz.kiemel, vastag: 2.2 })}
  <text x="${PAD + 46}" y="${listaAlja + 42}" font-family="${BETU}" font-size="32" font-weight="700" fill="${sz.kiemel}">${xmlEsc(zaro)} →</text>
  <rect x="0" y="${zaroY}" width="${W}" height="${H - zaroY}" fill="${sz.kiemel}"/>
  <rect x="${W - 138}" y="${zaroY + 46}" width="86" height="46" rx="12" fill="${sz.chipSzoveg}" opacity="0.9"/>
  <text x="${W - 95}" y="${zaroY + 79}" text-anchor="middle" font-family="${BETU}" font-size="27" font-weight="800" fill="${sz.kiemel}">AI</text>
  <text x="${PAD}" y="${zaroY + 68}" font-family="${BETU}" font-size="42" font-weight="800" fill="${sz.chipSzoveg}">AIWORLDHQ.COM</text>
  <text x="${PAD}" y="${zaroY + 116}" font-family="${BETU}" font-size="27" fill="${sz.chipSzoveg}" opacity="0.88">Plain-English AI guides · written by AI, labeled that way</text>
</svg>`;
}

/** A cikk lépéscímei a markdownból — ugyanaz a forrás, amiből a Reel dolgozik. */
export function lepesekMdbol(md) {
  return [...String(md || '').matchAll(/^##\s*Step\s*\d+\s*[—–-]\s*(.+)$/gim)]
    .map(m => m[1].trim());
}

/** Alkalmas-e a cikk infografikára? Kevés lépésből nincs mit mutatni. */
export const MIN_LEPES = 3;
export function alkalmas(md) { return lepesekMdbol(md).length >= MIN_LEPES; }

export default { kar, KAROK, STILUS, poszterSvg, lepesSzoveg, lepesekMdbol, alkalmas, W, H };
