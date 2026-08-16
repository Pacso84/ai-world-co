// ===================================================================
// NYITÓMONDAT-VÁLTOZATOSSÁG — a szokást mérjük, nem a szavakat tiltjuk
// ===================================================================
//
// ELŐZMÉNY (2026-08-16, mérve): a 07-30-i stílusszabály betiltotta az
// „Imagine…" nyitást, és ez MŰKÖDÖTT — 23,6%-ról 0,6%-ra esett. De a helyére
// részben rokon fordulatok léptek:
//     „Picture this…"     3,2% → 4,1%
//     „If you've ever…"   1,1% → 2,4%
//     „You've been/got…"  0,9% → 3,5%
// A 23 pontnyi „Imagine"-ből ~5 pont helyettesítés lett, a többi valódi
// változatosság — vagyis a tiltás nagyrészt bevált, de a MINTA látszik:
// a modell megkerüli a SZÓT, nem a SZOKÁST.
//
// EBBŐL A TANULSÁG: szavakat tiltani végtelen macska-egér játék. Amit mérni
// akarunk, az nem egy konkrét fordulat, hanem hogy a cikkek EGYFORMÁN
// kezdenek-e. Ez a modul azt méri — és így minden JÖVŐBELI divatszót elkap,
// nem csak a maiakat.
//
// ⚠️ A NYITÓMONDAT NEM A CÍMSOR. Az első mérésemben a `# How to…` H1-et
// számoltam nyitómondatnak, és „55× how to" jött ki — értelmetlen eredmény.
// A `firstParagraph()` ezért kihagy minden címsort, idézetet (Röviden-doboz),
// listát, képet és táblázatot: azt adja vissza, amit az olvasó elsőként OLVAS.
// ===================================================================

/** Ennyi legutóbbi cikket nézünk vissza. */
export const WINDOW = 20;
/** Ennyi szóból képezzük a „kezdés" ujjlenyomatát. */
export const SIGNATURE_WORDS = 3;

// ===================================================================
// KETTŐS HÁLÓ — 60 ÉLES CIKKEN KALIBRÁLVA (2026-08-16)
// ===================================================================
// A 3 szavas ujjlenyomat pontos, de kicsúszhat alóla az a modor, aminek a
// HARMADIK szava változik: „Picture this: it's…" és „Picture this: you've…"
// két külön ujjlenyomat, mégis EGY szokás. (Ez a tesztírásnál fogott meg.)
//
// A 2 szavas viszont összemos: a „by the" egyszerre fedi a „by the end"-et és
// a „by the time"-ot — abból hamis riasztás lenne.
//
// Ezért mindkettőt nézzük, KÜLÖN küszöbbel. A számok mérésből jönnek, nem
// tippből — a legutóbbi 20 cikkben:
//     3 szavas: legfeljebb 3× ugyanaz  („by the end" — ez a MAI modrunk)
//     2 szavas: legfeljebb 3× ugyanaz  („by the", „you know")
// A küszöb ennél eggyel megengedőbb, hogy csak a KIRÍVÓ akadjon fenn.
//
// ⚠️ AZ ELSŐ VÁLTOZAT ELRONTOTTA (2026-08-16, kódellenőrzés): MAX_SAME = 2 volt,
// vagyis 3 egyezésnél már riasztott — pontosan annyinál, amennyi a MÉRT
// maximum a változatlan élő anyagon. A modul tehát a saját kalibrációjának
// mondott ellent: az első futásától kezdve riasztott volna olyasmire, amit a
// mérés még normálisnak talált. A "eggyel megengedőbb" mindkét hálóra 3.
export const MAX_SAME = 3;        // 3 szavas egyezésből ennyi fér bele (4-nél szól)
export const MAX_SAME_LOOSE = 3;  // 2 szavas egyezésből ennyi fér bele (4-nél szól)

/**
 * A cikk ELSŐ VALÓDI BEKEZDÉSE — amit az olvasó elsőként olvas.
 * Kihagyja: címsor (#), idézet/Röviden-doboz (>), lista, kép, táblázat,
 * önálló félkövér sor.
 */
export function firstParagraph(markdown) {
  // A frontmattert le kell vágni: önmagában 400+ karakter lehet.
  const nyers = String(markdown == null ? '' : markdown);
  const m = nyers.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
  const body = m ? m[1] : nyers;

  for (const blokk of body.split(/\n\s*\n/)) {
    // A VEZETŐ vízszintes vonalat levágjuk: üres sor nélkül gyakran a
    // bekezdéshez tapad, olyankor a blokk `---\nA bekezdés…` alakú, és sem
    // az önálló-vonal, sem a lista-minta nem fogná meg.
    const s = blokk.trim().replace(/^(?:([-*_])\1{2,}[ \t]*\n)+/, '').trim();
    if (!s) continue;
    if (/^#{1,6}\s/.test(s)) continue;          // címsor
    if (/^>/.test(s)) continue;                 // idézet / Röviden-doboz
    // VÍZSZINTES VONAL (2026-08-16, kódellenőrzés): a házi sablon `---`-t tesz
    // a Röviden-doboz és a nyitó bekezdés közé. A lista-minta ezt NEM fogta
    // (nincs utána szóköz), így 725-ből 6 cikknél a "nyitómondat" `---` lett —
    // ott a mérés NÉMÁN kikapcsolt. Egy őr, ami csendben nem őriz, rosszabb a
    // semminél, mert azt hisszük, hogy véd.
    if (/^([-*_])\1{2,}$/.test(s)) continue;    // ---, ***, ___
    if (/^[-*+]\s|^\d+[.)]\s/.test(s)) continue; // lista
    if (/^!\[|^\|/.test(s)) continue;           // kép, táblázat
    if (/^\*\*[^*]+\*\*\s*$/.test(s)) continue; // önálló félkövér sor
    return s.replace(/[*_`]/g, '').trim();
  }
  return '';
}

/**
 * A kezdés ujjlenyomata: az első néhány szó, kisbetűsítve, írásjel nélkül.
 * Üres, ha nincs értelmezhető nyitás — olyankor nem ítélünk.
 */
export function openingSignature(markdownOrText, words = SIGNATURE_WORDS) {
  const s = /^---\n|\n#{1,6}\s|\n\n/.test(String(markdownOrText || ''))
    ? firstParagraph(markdownOrText)
    : String(markdownOrText || '');
  const szavak = s.toLowerCase().replace(/[^a-z0-9'\s]/g, ' ').split(/\s+/).filter(Boolean);
  const n = Math.max(1, Number(words) || SIGNATURE_WORDS);
  if (szavak.length < n) return '';
  return szavak.slice(0, n).join(' ');
}

/**
 * Túl gyakran kezdünk-e így?
 *
 * @param {string} candidate  a most vizsgált cikk markdownja (vagy nyitómondata)
 * @param {string[]} recent   a legutóbbi cikkek markdownjai/nyitómondatai, frissek elöl
 * @param {object} [opts]     { window, maxSame }
 * @returns {{signature:string, count:number, window:number}|null}
 *          null = rendben; egyébként a talált ismétlődés adatai
 */
export function repetitionIssue(candidate, recent, opts = {}) {
  const win = Number(opts.window) || WINDOW;
  const max = Number.isFinite(opts.maxSame) ? opts.maxSame : MAX_SAME;
  const maxLaza = Number.isFinite(opts.maxSameLoose) ? opts.maxSameLoose : MAX_SAME_LOOSE;
  const lista = Array.isArray(recent) ? recent.slice(0, win) : [];

  // Szoros háló: pontos, a 3 szavas egyezésre.
  const sig = openingSignature(candidate, SIGNATURE_WORDS);
  if (sig) {
    let n = 0;
    for (const r of lista) if (openingSignature(r, SIGNATURE_WORDS) === sig) n++;
    if (n > max) return { signature: sig, count: n, window: lista.length, loose: false };
  }

  // Laza háló: azt fogja, aminek a HARMADIK szava változik
  // („Picture this: it's…" / „Picture this: you've…" = egy szokás).
  const sig2 = openingSignature(candidate, 2);
  if (sig2) {
    let n = 0;
    for (const r of lista) if (openingSignature(r, 2) === sig2) n++;
    if (n > maxLaza) return { signature: sig2, count: n, window: lista.length, loose: true };
  }

  return null;   // rendben
}

export default {
  firstParagraph, openingSignature, repetitionIssue,
  WINDOW, MAX_SAME, MAX_SAME_LOOSE, SIGNATURE_WORDS
};
