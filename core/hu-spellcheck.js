// ===================================================================
// MAGYAR HELYESÍRÁS — 1. LÉPCSŐ: melyik szót érdemes megnézetni?
// ===================================================================
//
// MIÉRT LÉTEZIK (2026-08-20): a user egy ÉLŐ oldalon vette észre a
// „többiünknek" alakot. Ugyanabban a cikkben még két hiba volt („hetodból",
// „bízasz") — egyiket sem vette észre senki. A kérés: „olyan megoldás kell,
// ami működik, nem csak részben".
//
// MIÉRT KÉT LÉPCSŐ. Egyik eszköz sem elég önmagában, MÉRVE:
//   • A hunspell magyar szótára a 2325 szavas cikkből 4 szót emel ki — de
//     köztük a „refaktorálás" is, ami helyes. Egyedül tehát jó fordításokat
//     buktatna el, és angol szöveg maradna kint a magyar oldalon.
//   • Az AI-bíró a TELJES cikkre drága és megbízhatatlan.
// Együtt viszont: ez a lépcső ingyen szűkít 2325 → ~4 szóra, a bíró pedig
// már csak ezt a néhányat nézi, mondat-környezettel, pár száz tokenből.
//
// EZ A MODUL NEM DÖNT HELYESSÉGRŐL. Csak azt mondja meg, mit érdemes
// megkérdezni. A szótárak kívülről jönnek (`isKnownWord`), ezért a teszt
// hálózat és pénz nélkül végigjárható.
//
// ⚠️ SZÁNDÉKOSAN NINCS gyakoriság-alapú szűrés. Kézenfekvő lenne azt mondani,
// hogy „ami sokszor előfordul nálunk, az biztosan helyes" — de ha a fordító
// UGYANAZT a hibát ismételgeti, az pont láthatatlanná válna. Minden mérce
// IRÁNYA számít (2026-08-14, prompt-szivárgás). Helyette engedélylista van:
// a szó csak azután kerül ki a látókörből, hogy egyszer MEGÍTÉLTÉK.
// ===================================================================

const BETU = 'A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű';
// ⚠️ A KÖTŐJELES ÖSSZETÉTEL EGY SZÓ (2026-08-20, éles lelet): kötőjelnél vágva
// a „PDF-jéből"-ből „jéből" töredék lett, a bíró arra ítélt, és a javítás
// „PDF-PDF-ből"-t csinált volna. Belső kötőjel megengedett, záró nem.
const SZO = new RegExp(`[${BETU}]+(?:-[${BETU}]+)*`, 'g');
const NAGYBETUVEL = /^[A-ZÁÉÍÓÖŐÚÜŰ]/;

/** Ennél rövidebb szót nem nézünk: a kötőszavak zaja elnyomná a jelet. */
export const MIN_SZO_HOSSZ = 4;

/**
 * Markdown → vizsgálható próza.
 * A CÍM BENNE MARAD: az a legláthatóbb szöveg — a user is ott vette észre a
 * hibát. A frontmatter többi mezője (kulcsszavak, kategória) viszont nem próza.
 */
export function toProse(md) {
  let t = String(md == null ? '' : md);

  // A frontmatter helyére a cím szövege kerül.
  const fm = t.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (fm) {
    const cim = fm[1].match(/^title:\s*["']?(.*?)["']?\s*$/m);
    t = (cim ? cim[1] + '.\n\n' : '') + t.slice(fm[0].length);
  }

  return t
    .replace(/```[\s\S]*?```/g, ' ')            // kódblokk
    .replace(/`[^`]*`/g, ' ')                   // soron belüli kód
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, ' ')    // kép: az alt-szöveg sem próza
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')    // link: a SZÖVEGE próza, az URL nem
    .replace(/https?:\/\/\S+/g, ' ')            // csupasz URL
    .replace(/^[>#\s]*#{1,6}\s*/gm, '')         // fejléc-jelölő
    .replace(/[*_~>#|]/g, ' ');                 // kiemelés-jelölők
}

/** A szót tartalmazó mondat — ennyi kell a bírónak a döntéshez. */
function mondat(proza, szo) {
  const i = proza.toLowerCase().indexOf(szo.toLowerCase());
  if (i < 0) return szo;
  const eleje = Math.max(0, proza.lastIndexOf('.', i) + 1);
  let vege = proza.indexOf('.', i + szo.length);
  if (vege < 0) vege = proza.length;
  return proza.slice(eleje, vege + 1).replace(/\s+/g, ' ').trim();
}

/**
 * A megnézendő szavak a szövegből.
 *
 * @param {string} md a magyar fordítás markdownja
 * @param {object} o
 * @param {(w:string)=>boolean} o.isKnownWord  ismeri-e valamelyik szótár? KÖTELEZŐ
 * @param {Set<string>} [o.allowlist]  amit a bíró már rendben talált (kisbetűs)
 * @returns {{word: string, context: string}[]}  szavanként EGYSZER
 */
export function extractCandidates(md, o = {}) {
  // Szótár nélkül NEM tippelünk: az „mindent gyanúsnak" vagy a „semmit sem"
  // egyaránt rosszabb a hallgatásnál.
  if (typeof o.isKnownWord !== 'function') return [];

  const proza = toProse(md);
  const enged = o.allowlist instanceof Set
    ? new Set([...o.allowlist].map(w => String(w).toLowerCase()))
    : new Set();

  const latott = new Set();
  const out = [];
  for (const m of proza.matchAll(SZO)) {
    const w = m[0];
    if (w.length < MIN_SZO_HOSSZ) continue;
    if (NAGYBETUVEL.test(w)) continue;          // márkanév, tulajdonnév, mondatkezdet
    const kulcs = w.toLowerCase();
    if (latott.has(kulcs)) continue;            // a bírót ne fizessük ki kétszer
    latott.add(kulcs);
    if (enged.has(kulcs)) continue;
    if (o.isKnownWord(w)) continue;
    out.push({ word: w, context: mondat(proza, w) });
  }
  return out;
}

export default { toProse, extractCandidates, MIN_SZO_HOSSZ };
