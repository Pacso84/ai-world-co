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

const BETU = "'Liberation Sans', Arial, Helvetica, sans-serif";
// A betű MÉRT átlagos karakterszélessége (nagybetűs szövegre felfelé
// kerekítve) — ugyanaz az arány, amivel a Reel táblái számolnak.
export const BETU_ARANY = 0.62;

/**
 * A három mérési kar. A `foto` a mostani (fotó + cím-sáv), a másik kettő
 * az infografika két színvilága. A user döntése (09-21): mind a hármat
 * kipróbáljuk, és a számok döntsenek.
 */
export const KAROK = ['foto', 'vilagos', 'sotet'];

// ── A PALETTA: UTASÍTÁS-LAP ────────────────────────────────────────
//
// A tárgy nem szoftver, hanem UTASÍTÁS. Ezért nem „márkaszín + semleges
// szürkék", hanem három szerepet játszó szín: a TINTA (amit olvasol), a
// GO (a haladás: sorszámok, felső él) és a WARN (ahol elrontják).
// A hajszálvonal a szerkezet — kártyák helyett vonalak tagolnak.
export const STILUS = {
  vilagos: {
    hatter: '#EFE9DC', lap: '#FFFFFF', tinta: '#14120F', halvany: '#5A5447',
    go: '#265C40', warn: '#993A14', hajszal: '#C3B9A4', kepAtl: 0.62,
    panel: '#FBF8F2', panelAtl: 0.90
  },
  sotet: {
    hatter: '#121417', lap: '#1C2127', tinta: '#EDEAE3', halvany: '#A3ACB6',
    go: '#3FC191', warn: '#F0894A', hajszal: '#2E343C', kepAtl: 0.52,
    panel: '#0F1318', panelAtl: 0.90
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

export const LEPES_MAX_KAR = 52;   // KÉT sor × 27 karakter fér a dobozba

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
// A „természetes fél" a jelentés nagy részét tartsa meg — enélkül az
// „Ask the AI to draft a condolence message" → „Ask the AI" alak is átment.
export const FELE_MIN_ARANY = 0.65;

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
    if (fele && fele.length <= LEPES_MAX_KAR && fele.length >= FELE_MIN_KAR && fele.length >= t.length * 0.65
        && !/[,;:\-–—]$/.test(fele) && !LOGO_SZO.test(' ' + fele)
        && kiegyensulyozott(fele)) return fele;
  }

  let v = t.slice(0, LEPES_MAX_KAR - 1);
  const szokoz = v.lastIndexOf(' ');
  if (szokoz > 12) v = v.slice(0, szokoz);
  // A vágás UTÁN is takarítunk: a szóhatár pont egy kötőszó után is állhat.
  // ⚠️ AMÍG NEM VÁLTOZIK, NEM ÁLL MEG. A régi változat háromszor futott,
  // majd EGY UTOLSÓ írásjel-levágás következett — és az újra kitette a
  // lógó szót: az „…agreeing to — and what" sorból a záró gondolatjel
  // levágása után „…agreeing to" maradt, kötőszóval a végén. Három élő
  // poszteren látszott. A megállási feltétel az, hogy ne változzon.
  for (let i = 0; i < 8; i++) {
    const elozo = v;
    v = v.replace(/[\s,;:.\-–—]+$/, '').replace(LOGO_SZO, '');
    if (v === elozo) break;
  }
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
/**
 * Egy márkalogó beágyazása. A `logoBelso` a `website/assets/logos/*.svg`
 * fájl BELSŐ tartalma, 24 egységre normalizálva (a hívó végzi, mert a
 * 20 logóból három más viewBox-szal érkezett).
 * KITALÁLT LOGÓ SOHA — csak az megy ki, ami letöltve ott van.
 */
function logoSvg(logoBelso, { x, y, meret, szin }) {
  if (!logoBelso) return '';
  const m = (meret / 24).toFixed(4);
  return `<g transform="translate(${x} ${y}) scale(${m})" fill="${szin}">${logoBelso}</g>`;
}

/**
 * A cikk szakaszai a poszterhez.
 *
 * 🔑 A CIKKEINK GAZDAGABBAK, MINT AMIT AZ ELSŐ POSZTER HASZNÁLT. Mérve
 * mind a 451 útmutatón: 100%-ukban van „Before you start" ÉS „Common
 * mistakes" szakasz is, nem csak lépések. Mindkettő felsorolás,
 * `- **Félkövér címke:** magyarázat` alakban — a félkövér címke kész,
 * rövid panel-elem. Az első változatom csak a lépéseket vette, és ezért
 * lett belőle lista egy infografika helyett.
 */
export function szakaszok(md) {
  const sz = String(md || '');
  const kiszed = (cim) => {
    const i = sz.indexOf('## ' + cim);
    if (i < 0) return [];
    const veg = sz.indexOf('\n## ', i + 3);
    const test = sz.slice(i, veg < 0 ? undefined : veg);
    // ⚠️ KÉT ALAK VAN, ÉS AZ ELSŐ VÁLTOZATOM CSAK AZ EGYIKET ISMERTE.
    // Mérve 509 cikken: félkövér címkével (`- **Account:** …`) csak 43%
    // írja; a többi sima felsorolás (`- A phone or computer…`). Ha csak
    // a félkövéret néznénk, a cikkek több mint felén elmaradna a sáv —
    // és kívülről ez pont úgy nézne ki, mintha „nem lenne mit kiírni".
    const felkover = [...test.matchAll(/^[-*]\s+\*\*(.+?)\*\*/gm)].map(m => m[1]);
    const sima = [...test.matchAll(/^[-*][ \t]+(?!\*\*)(.+)$/gm)].map(m => m[1]);
    return (felkover.length ? felkover : sima)
      // Egy részük „Mistake: …" előtaggal ír — az a szakasz CÍMÉT
      // ismétli, a poszteren fölösleges. A zárójeles kiegészítés is.
      .map(x => String(x).replace(/^(mistake|tip|note)\s*[:\u2014-]\s*/i, '')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[\[\]]/g, '')
        .replace(/\*\*/g, '').replace(/\s*\([^)]*\)/g, '')
        .replace(/[:\uff1a]\s*$/, '').trim())
      .filter(Boolean);
  };
  return {
    kellenek: kiszed('Before you start'),
    hibak: kiszed('Common mistakes'),
    lepesek: lepesekMdbol(sz)
  };
}

/**
 * Egy leltár-tétel lényege: névelő nélkül, az ELSŐ tagmondatig.
 *
 * Mérve 1436 tételen: teljes mondatként 53%-uk nem fért volna ki 30
 * karakterbe, vagyis minden második sor „…"-tal végződött volna — az
 * pedig pont úgy néz ki, mintha elromlott volna.
 */
function leltarTetel(x) {
  let t = String(x || '').replace(/^(you(\u2019|')?ll need|you need)\s*:?\s*/i, '')
    .replace(/^(a|an|the)\s+/i, '').trim();
  // A névelő levágása kisbetűvel kezdheti a sort — vissza kell nagyítani.
  if (t) t = t[0].toUpperCase() + t.slice(1);
  const vag = t.search(/,|;|\s\u2014\s|\s-\s|\s\(|\sand\s|\sor\s|\sso\s|\sthat\s|\swith\s/i);
  if (vag > 8) t = t.slice(0, vag);
  return t.replace(/[\s,;:.]+$/, '');
}

/** Rövidítés adott karakterszámra, lógó szó és írásjel nélkül. */
function rovid(s, max) {
  const t = String(s || '').replace(/["“”]/g, '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  let v = t.slice(0, max - 1);
  const sz = v.lastIndexOf(' ');
  if (sz > 8) v = v.slice(0, sz);
  // ⚠️ AMÍG NEM VÁLTOZIK, NEM ÁLL MEG. A régi változat háromszor futott,
  // majd EGY UTOLSÓ írásjel-levágás következett — és az újra kitette a
  // lógó szót: az „…agreeing to — and what" sorból a záró gondolatjel
  // levágása után „…agreeing to" maradt, kötőszóval a végén. Három élő
  // poszteren látszott. A megállási feltétel az, hogy ne változzon.
  for (let i = 0; i < 8; i++) {
    const elozo = v;
    v = v.replace(/[\s,;:.\-–—]+$/, '').replace(LOGO_SZO, '');
    if (v === elozo) break;
  }
  return v.replace(/[\s,;:.\-–—]+$/, '') + '…';
}

/**
 * Az infografika SVG-je — UTASÍTÁS-LAP, nem kártyalista.
 *
 * ⚠️ AZ ELSŐ VÁLTOZAT MEGBUKOTT A USERNÉL: „ez szar nem hasonlit a
 * mintára!" Igaza volt. Amit építettem, az cím + öt egyforma lekerekített
 * kártya + lábléc volt — vagyis LISTA. Ráadásul négy olyan jegyet viselt,
 * amit a dizájn-útmutató kifejezetten a gépi munka árulkodó jeleként
 * sorol fel: csupa nagybetűs címke, középpontokkal fűzött metasor
 * („A · B · C"), nyíl a link végén, és minden azonos lekerekítésű
 * kártyába vágva.
 *
 * AZ ÚJ IRÁNY A TÁRGYBÓL JÖN. Amit árulunk, az nem szoftver, hanem
 * UTASÍTÁS — ennek saját vizuális hagyománya van: az összeszerelési lap,
 * a repülős biztonsági kártya, a készülék gyors-útmutatója. Vastag
 * sorszámok, erős vonalak, „mi kell hozzá" sáv, külön figyelmeztető rész.
 * Ezért: nincsenek dobozok, a szerkezetet VONALAK és SZÁMOK adják.
 *
 * A számozás itt indokolt (a dizájn-útmutató szerint csak akkor szabad,
 * ha a tartalom tényleg sorrend): a lépések tényleg sorrendben vannak.
 */
export function poszterSvg({ cim, lepesek, stilus, splitFn, logoBelso = '', kellenek = [], hibak = [] }) {
  const sz = stilus;
  const M = 60;                       // oldalmargó (a panelen belül)
  const JOBB = W - M;

  // ── CÍM ───────────────────────────────────────────────────────────
  const cimNyers = nagybetusHorog(String(cim || '').replace(/^How to\s+/i, '').trim());
  let cimSorok = tordel(cimNyers, 24, 3);
  let kar = 24;
  while (cimSorok.join(' ').length < cimNyers.length && kar < 38) {
    kar += 2;
    cimSorok = tordel(cimNyers, kar, 3);
  }
  if (cimSorok.join(' ').length < cimNyers.length) {
    cimSorok[cimSorok.length - 1] = rovid(cimSorok[cimSorok.length - 1] + ' x', 999);
  }
  const leghosszabb = Math.max(1, ...cimSorok.map(s => s.length));
  const CIM_M = Math.max(44, Math.min(76, Math.floor(816 / (leghosszabb * BETU_ARANY))));
  const CIM_SOR = Math.round(CIM_M * 1.06);

  const fejY = 74;                    // a fejléc alapvonala
  const cimTeteje = fejY + 86;
  const cimAlja = cimTeteje + (cimSorok.length - 1) * CIM_SOR;

  // ── „MI KELL HOZZÁ" SÁV ───────────────────────────────────────────
  const kellLista = (kellenek || []).slice(0, 3)
    // A névelő nem hordoz információt egy leltár-sorban, viszont elvisz
    // 2–4 karaktert a keretből — emiatt lett MINDHÁROM tétel „…"-os.
    // Csak az ELSŐ TAGMONDAT kell: a tételek gyakran egész mondatok.
    .map(x => rovid(leltarTetel(x), 30))
    .filter(Boolean);
  const kellY = cimAlja + 74;
  const kellVan = kellLista.length > 0;
  // ⚠️ EZ A SOR KORÁBBAN A FÁJL VÉGÉN ÁLLT, a lepesTeteje MÖGÖTT, ami
  // használja — így a poszterSvg MINDEN infografikás cikknél kivételt
  // dobott. A képgyártó elkapta, figyelmeztetést írt, és a RÉGI fájlt
  // hagyta a helyén: kívülről úgy nézett ki, mintha semmi nem változna.
  const kellAlja = kellVan ? kellY + (kellLista.length - 1) * 38 : cimAlja;

  // ── LÉPÉSEK ───────────────────────────────────────────────────────
  const lathato = (lepesek || []).slice(0, LEPES_MAX_DB);
  const marad = Math.max(0, (lepesek || []).length - lathato.length);
  const megjelenő = lathato.map(l => lepesSzoveg(l, splitFn));
  const ikonok = ikonokHoz(megjelenő);

  // ── FIGYELMEZTETÉS ────────────────────────────────────────────────
  const hiba = (hibak || [])[0] ? rovid(hibak[0], 44) : '';
  const labY = H - 136;               // a záró sáv teteje
  const hibaMagas = hiba ? 80 : 0;
  const hibaY = labY - 26 - hibaMagas;

  const lepesTeteje = (kellVan ? kellAlja + 72 : cimAlja + 94);
  const lepesHely = hibaY - 26 - lepesTeteje;
  const SOR = Math.max(72, Math.min(146, Math.floor(lepesHely / Math.max(1, lathato.length))));

  const SZAM_X = M + 60;              // a sorszám jobb széle
  const VONAL_X = M + 82;             // a függőleges hajszálvonal
  const SZOVEG_X = VONAL_X + 34;

  const lepesSvg = lathato.map((l, i) => {
    const y = lepesTeteje + i * SOR;
    const sorok = tordel(megjelenő[i], 30, 2);
    const alap = y + (sorok.length === 2 ? SOR / 2 - 14 : SOR / 2 + 10);
    const szovegSvg = sorok.map((s, k) =>
      `<tspan x="${SZOVEG_X}" y="${alap + k * 42}">${xmlEsc(s)}</tspan>`).join('');
    return `${i > 0 ? `<line x1="${M}" y1="${y}" x2="${JOBB}" y2="${y}" stroke="${sz.hajszal}" stroke-width="1"/>` : ''}
  <text x="${SZAM_X}" y="${y + SOR / 2 + 20}" text-anchor="end" font-family="${BETU}" font-size="58" font-weight="900" fill="${sz.go}">${i + 1}</text>
  ${ikonSvg(ikonok[i], { x: JOBB - 46, y: y + SOR / 2 - 23, meret: 46, szin: sz.halvany, vastag: 1.9 })}
  <text font-family="${BETU}" font-size="34" font-weight="700" fill="${sz.tinta}">${szovegSvg}</text>`;
  }).join('\n  ');

  const lepesAlja = lepesTeteje + lathato.length * SOR;

  // ── ÖSSZERAKÁS ────────────────────────────────────────────────────
  const kellSvg = kellVan ? `
  <text x="${M}" y="${kellY}" font-family="${BETU}" font-size="30" font-weight="900" fill="${sz.go}">You'll need</text>
  ${kellLista.map((x, i) => `<text x="${M + 196}" y="${kellY + i * 38 - (kellLista.length - 1) * 0}" font-family="${BETU}" font-size="28" font-weight="600" fill="${sz.tinta}">${xmlEsc(x)}</text>`).join('\n  ')}` : '';


  const panelY = cimAlja + 34;   // a cím alatti vastag vonal vonala
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${W}" height="${panelY}" fill="${sz.hatter}" opacity="0.30"/>
  <rect x="22" y="${panelY}" width="${W - 44}" height="${labY - panelY - 18}" rx="28" fill="${sz.panel}" opacity="${sz.panelAtl}"/>
  <rect x="0" y="0" width="${W}" height="10" fill="${sz.go}"/>

  <text x="${M}" y="${fejY}" font-family="${BETU}" font-size="30" font-weight="900" fill="${sz.tinta}" letter-spacing="1">aiworldhq.com</text>
  <text x="${M + Math.round(13 * 30 * BETU_ARANY) + 24}" y="${fejY}" font-family="${BETU}" font-size="28" font-weight="600" fill="${sz.halvany}">step-by-step, free to read</text>
  ${logoBelso
    ? `<rect x="${JOBB - 92}" y="${fejY - 58}" width="92" height="92" rx="20" fill="${sz.lap}"/>
  ${logoSvg(logoBelso, { x: JOBB - 70, y: fejY - 36, meret: 48, szin: sz.tinta })}`
    : `<rect x="${JOBB - 84}" y="${fejY - 46}" width="84" height="52" rx="10" fill="${sz.tinta}"/>
  <text x="${JOBB - 42}" y="${fejY - 8}" text-anchor="middle" font-family="${BETU}" font-size="28" font-weight="900" fill="${sz.hatter}">AI</text>`}

  <text font-family="${BETU}" font-size="${CIM_M}" font-weight="900" fill="${sz.tinta}">${cimSorok.map((l, i) => `<tspan x="${M}" y="${cimTeteje + i * CIM_SOR}">${xmlEsc(l)}</tspan>`).join('')}</text>

  <rect x="${M}" y="${cimAlja + 34}" width="${JOBB - M}" height="6" fill="${sz.tinta}"/>
  ${kellSvg}
  <line x1="${M}" y1="${kellAlja + 32}" x2="${JOBB}" y2="${kellAlja + 32}" stroke="${sz.hajszal}" stroke-width="1"/>

  <line x1="${VONAL_X}" y1="${lepesTeteje}" x2="${VONAL_X}" y2="${lepesAlja}" stroke="${sz.hajszal}" stroke-width="1"/>
  ${lepesSvg}

  ${hiba ? `<rect x="${M}" y="${hibaY}" width="6" height="${hibaMagas}" fill="${sz.warn}"/>
  <text x="${M + 26}" y="${hibaY + 36}" font-family="${BETU}" font-size="28" font-weight="900" fill="${sz.warn}">Where people slip up</text>
  ${tordel(hiba, 44, 2).map((s, k) => `<text x="${M + 26}" y="${hibaY + 74 + k * 34}" font-family="${BETU}" font-size="27" font-weight="600" fill="${sz.tinta}">${xmlEsc(s)}</text>`).join('\n  ')}` : ''}

  <rect x="0" y="${labY}" width="${W}" height="${H - labY}" fill="${sz.tinta}"/>
  <text x="${M}" y="${labY + 58}" font-family="${BETU}" font-size="38" font-weight="900" fill="${sz.hatter}">${marad > 0 ? `${marad} more step${marad > 1 ? 's' : ''} in the full guide` : 'Read the full guide'}</text>
  <text x="${M}" y="${labY + 102}" font-family="${BETU}" font-size="26" font-weight="600" fill="${sz.hatter}" opacity="0.75">Written by AI. We label every piece that way.</text>
  <rect x="${JOBB - 76}" y="${labY + 44}" width="76" height="48" rx="10" fill="${sz.go}"/>
  <text x="${JOBB - 38}" y="${labY + 79}" text-anchor="middle" font-family="${BETU}" font-size="27" font-weight="900" fill="${sz.hatter}">AI</text>
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
