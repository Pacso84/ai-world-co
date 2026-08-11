// ===================================================================
// FELÜLET-FRÁZISOK — angol UI-szöveg a nem-angol oldalakon
// ===================================================================
//
// A website/check-i18n.js 2026-07-06 óta keresi az angolul maradt felirat-
// darabokat a magyar/spanyol oldalakon. A mérce eddig egyszerű volt: ha a
// frázis szerepel a látható szövegben, az folt.
//
// 2026-08-11 — az őrszem első éjszakája, amikor a leletei eljutottak a napi
// riportig — rögtön két HAMIS RIASZTÁST adott. A Cohere-útmutató ezt írja:
//
//   click the item labeled "Playground" (it may also be called "Try it now")
//
// A "Try it now" itt egy IDEGEN TERMÉK GOMBJÁNAK a neve, idézőjelben. Épp
// hogy NEM szabad lefordítani: a magyar olvasó az angol felületen fogja
// keresni, és ha a cikk lefordítja, nem találja meg. Az útmutatóink tele
// vannak ilyen idézett gombnevekkel — enélkül a szűrő nélkül a napi riport
// minden nap zajt küldene, a user szabálya viszont: "ne küldjön valótlan
// adatokat" (2026-08-06).
//
// A MÉRCE: idézőjelben álló frázis = idézett gombnév, nem a mi feliratunk.
// ===================================================================

// Nyitó és záró idézőjelek — magyar („"), spanyol («»), angol ("" ' ') és
// az egyenes változatok. A cikkeink mindhárom nyelven készülnek.
const NYITO = '"\'„“‘«›';
const ZARO = '"\'”“’»‹';

// ⚠️ A KÉSZ OLDALON az idézőjel HTML-ENTITÁS is lehet: a 2026-08-11-i lelet
// szó szerint így állt: „Try it now&quot;. Az első javításom ezért NEM fogta
// meg — a kitalált tesztszöveg átment, az éles nem. A látható szöveget tehát
// előbb entitás-mentesíteni kell.
const ENTITASOK = {
  '&quot;': '"', '&apos;': "'", '&#34;': '"', '&#39;': "'",
  '&laquo;': '«', '&raquo;': '»', '&ldquo;': '“', '&rdquo;': '”',
  '&lsquo;': '‘', '&rsquo;': '’', '&#8222;': '„', '&#8221;': '”',
  '&#8220;': '“', '&#171;': '«', '&#187;': '»', '&nbsp;': ' '
};

/**
 * A HTML-entitásokat visszaalakítja karakterré. Az idézőjeleket MEG KELL
 * őrizni: a nélkülük a "gombnév vagy a mi feliratunk?" kérdés eldönthetetlen.
 * @param {string} s
 */
export function decodeEntities(s) {
  return String(s || '').replace(/&(?:[a-z]+|#\d+);/gi, e => ENTITASOK[e.toLowerCase()] ?? e);
}
const entitasMentes = decodeEntities;

/**
 * Megkeresi az angol felület-frázisokat, de kihagyja az idézett gombneveket.
 *
 * @param {string} text     a látható szöveg (kisbetűsítve is jöhet)
 * @param {string[]} phrases  a tiltott frázisok listája
 * @returns {string[]} a ténylegesen foltnak számító frázisok, egyszer-egyszer
 */
export function chromePhraseHits(text, phrases) {
  const s = entitasMentes(String(text || ''));
  if (!s || !Array.isArray(phrases)) return [];
  const talalt = [];

  for (const phrase of phrases) {
    // A kötőjel/szóköz rugalmas, a szóhatár szigorú: a "#advanced" hashtag
    // és a "tryitnowadays" összetétel nem folt.
    const mag = String(phrase).replace(/[-\s]/g, '[-\\s]');
    const rx = new RegExp(`(?<![a-z#])${mag}(?![a-z])`, 'gi');

    for (const m of s.matchAll(rx)) {
      const elotte = s[m.index - 1] || '';
      const utana = s[m.index + m[0].length] || '';
      // IDÉZETT GOMBNÉV: közvetlenül idézőjelek közt áll → nem a mi feliratunk.
      if (NYITO.includes(elotte) && ZARO.includes(utana)) continue;
      talalt.push(phrase);
      break;                       // frázisonként egy jelzés elég
    }
  }
  return talalt;
}

export default { chromePhraseHits, decodeEntities };
