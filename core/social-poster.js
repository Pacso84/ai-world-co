// ===================================================================
// INFOGRAFIKA A KÖZÖSSÉGI POSZTHOZ (2026-09-21, user-kérés)
// ===================================================================
//
// A user olyan posztokat mutatott, amik most mennek a Facebookon:
// szerkesztett infografikák — fejléc, számozott dobozok, záró sáv.
// „ez megy a facebookon, nem amit mi csinálunk."
//
// AMIT ÁTVESZÜNK ÉS AMIT NEM:
//   ✅ a szerkesztett, olvasható szerkezet
//   ❌ a „kommentelj a csomagért" mechanika — a Meta bünteti az
//      elköteleződés-csalit, és nekünk nincs listánk, amit építsünk
//   ❌ a teljes tartalom kirakása. A mutatott posztok listát építenek,
//      NEKÜNK KATTINTÁS KELL. A mi átkattintásunk 21,2% (FB-átlag 1–3%)
//      épp azért, mert a poszt ÍZELÍTŐ. Ezért látszik 5 lépés, a többi
//      „+N more step in the full guide".
//
// ⚠️ MINDEN SZÖVEG KÓDDAL KÉSZÜL, NEM KÉPGENERÁTORRAL. Egy AI-val
// rajzolt infografikán egyetlen elgépelt szó is nyilvános lenne — a Reel
// borítóján élesben ott volt a „perrplexity", két r-rel. Kóddal írt
// szöveg nem tud elgépelődni, és nulla forintba kerül.
//
// ⚠️ A SŰRŰSÉG SZÁNDÉKOSAN KISEBB, mint a mutatott példáké. Azok telefonon,
// hírfolyam-méretben koppintás nélkül olvashatatlanok. Nekünk a KOPPINTÁST
// kell megnyerni, nem a képernyőt megtölteni.
// ===================================================================

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
    kiemel: '#5f8a76', chipSzoveg: '#ffffff', kepAtl: 0.16
  },
  sotet: {
    hatter: '#0f1720', lap: '#16212c', tinta: '#ffffff', halvany: '#9fb0be',
    kiemel: '#2fb3c9', chipSzoveg: '#0f1720', kepAtl: 0.22
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

// A lógó kötőszavak. Ezekkel egy sor SOHA nem végződhet: a „Connect your
// Gmail, Drive, and…" hibának látszik, nem rövidítésnek.
const LOGO_SZO = /\s+\b(and|or|the|a|an|of|to|for|with|in|on|from|by|into)$/i;

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
 *
 * @param {string} lepes a nyers „Step N — …" fejléc szövege
 * @param {(c:string)=>{nagy:string}} splitFn a core/short-video.js splitHeading-je
 */
export function lepesSzoveg(lepes, splitFn) {
  const t = String(lepes || '').trim();
  if (!t) return '';
  if (t.length <= LEPES_MAX_KAR) return t;

  if (typeof splitFn === 'function') {
    const fele = String((splitFn(t) || {}).nagy || '').trim();
    if (fele && fele.length <= LEPES_MAX_KAR
        && !/[,;:\-–—]$/.test(fele) && !LOGO_SZO.test(' ' + fele)) return fele;
  }

  let v = t.slice(0, LEPES_MAX_KAR - 1);
  const szokoz = v.lastIndexOf(' ');
  if (szokoz > 12) v = v.slice(0, szokoz);
  // A vágás UTÁN is takarítunk: a szóhatár pont egy kötőszó után is állhat.
  for (let i = 0; i < 3; i++) v = v.replace(/[\s,;:.\-–—]+$/, '').replace(LOGO_SZO, '');
  return v.replace(/[\s,;:.\-–—]+$/, '') + '…';
}

/** Hány lépés fér a képre. Ötnél több már olvashatatlan hírfolyam-méretben. */
export const LEPES_MAX_DB = 5;

/**
 * Az infografika SVG-je.
 *
 * @param {object} o
 * @param {string} o.cim a cikk címe
 * @param {string[]} o.lepesek a nyers lépéscímek
 * @param {object} o.stilus a STILUS egyik bejegyzése
 * @param {Function} o.splitFn splitHeading
 */
export function poszterSvg({ cim, lepesek, stilus, splitFn }) {
  const sz = stilus;
  // A „How to" lekerül: a cím így rövidebb, és a fejléc úgyis kimondja,
  // hogy lépésről lépésre szóló útmutatóról van szó.
  const cimSorok = tordel(String(cim || '').replace(/^How to\s+/i, ''), 24, 3);
  const CIM_M = cimSorok.length >= 3 ? 62 : 70;
  const CIM_SOR = Math.round(CIM_M * 1.1);
  const PAD = 60;

  const lathato = (lepesek || []).slice(0, LEPES_MAX_DB);
  const marad = Math.max(0, (lepesek || []).length - lathato.length);

  const cimY = 116;
  const fejMagas = 62 + cimSorok.length * CIM_SOR + 64;
  const cimSvg = cimSorok.map((l, i) =>
    `<tspan x="${PAD}" y="${cimY + i * CIM_SOR}">${xmlEsc(l)}</tspan>`).join('');

  const DOBOZ_M = 118, DOBOZ_KOZ = 14;
  const listaTeteje = fejMagas + 26;
  const dobozok = lathato.map((l, i) => {
    const y = listaTeteje + i * (DOBOZ_M + DOBOZ_KOZ);
    const sorok = tordel(lepesSzoveg(l, splitFn), 30, 2);
    const kezd = sorok.length === 2 ? y + 46 : y + 70;
    const szovegSvg = sorok.map((s, k) =>
      `<tspan x="${PAD + 122}" y="${kezd + k * 44}">${xmlEsc(s)}</tspan>`).join('');
    return `<rect x="${PAD}" y="${y}" width="${W - 2 * PAD}" height="${DOBOZ_M}" rx="16" fill="${sz.lap}"/>
  <rect x="${PAD + 26}" y="${y + 29}" width="60" height="60" rx="14" fill="${sz.kiemel}"/>
  <text x="${PAD + 56}" y="${y + 71}" text-anchor="middle" font-family="${BETU}" font-size="34" font-weight="800" fill="${sz.chipSzoveg}">${i + 1}</text>
  <text font-family="${BETU}" font-size="36" font-weight="600" fill="${sz.tinta}">${szovegSvg}</text>`;
  }).join('\n  ');

  const listaAlja = listaTeteje + lathato.length * (DOBOZ_M + DOBOZ_KOZ);
  const zaroY = H - 150;
  const zaro = marad > 0
    ? `+ ${marad} more step${marad > 1 ? 's' : ''} in the full guide`
    : 'The full guide is free to read';

  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${W}" height="10" fill="${sz.kiemel}"/>
  <text font-family="${BETU}" font-size="${CIM_M}" font-weight="800" fill="${sz.tinta}">${cimSvg}</text>
  <text x="${PAD}" y="${cimY + (cimSorok.length - 1) * CIM_SOR + 52}" font-family="${BETU}" font-size="30" font-weight="700" fill="${sz.kiemel}">STEP BY STEP · FREE GUIDE</text>
  <rect x="${W - 150}" y="46" width="88" height="44" rx="10" fill="${sz.kiemel}"/>
  <text x="${W - 106}" y="78" text-anchor="middle" font-family="${BETU}" font-size="26" font-weight="800" fill="${sz.chipSzoveg}">AI</text>
  ${dobozok}
  <text x="${PAD}" y="${listaAlja + 46}" font-family="${BETU}" font-size="34" font-weight="700" fill="${sz.kiemel}">${xmlEsc(zaro)} →</text>
  <rect x="0" y="${zaroY}" width="${W}" height="${H - zaroY}" fill="${sz.kiemel}"/>
  <text x="${PAD}" y="${zaroY + 62}" font-family="${BETU}" font-size="42" font-weight="800" fill="${sz.chipSzoveg}">AIWORLDHQ.COM</text>
  <text x="${PAD}" y="${zaroY + 110}" font-family="${BETU}" font-size="28" fill="${sz.chipSzoveg}" opacity="0.85">Plain-English AI guides · written by AI, labeled that way</text>
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
