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
// ===================================================================
// IDÉZŐJELEK KÖZÖTT ÁLL-E? (2026-09-09)
// ===================================================================
// A korábbi vizsgálat csak a KÖZVETLEN szomszédokat nézte, tehát csak akkor
// fogott, ha a frázis PONTOSAN a két idézőjel közt állt. Élesben viszont ez
// a valódi alak fordult elő egy magyar cikkben:
//
//     az „Improve model for everyone" kapcsolót keresd
//
// A megfogott frázis a „for everyone" — előtte SZÓKÖZ, utána idézőjel, mert
// egy HOSSZABB idézet BELSEJÉBEN van. A cikk teljesen helyes: a ChatGPT
// gombfeliratát idézi, és zárójelben adja a magyar magyarázatot.
//
// ⚠️ AZ ABLAK SZÁNDÉKOSAN SZŰK (60 karakter). Az idézett gombnevek rövidek;
// egy tágabb ablakban két, egymástól távoli idézet közé eső VALÓDI folt is
// elnémulna.
// ⚠️ AZ EGYENES `"` KÉTÉRTELMŰ (nyitó és záró is lehet) — ilyenkor a szűk
// ablak melletti „idézetnek tekintjük" a választás. Ez ismert korlát: a
// hamis riasztás ára itt nagyobb, mert az őr minden futásban kiabálna, és a
// zajban a valódi lelet veszne el.
const ABLAK = 60;
function idezetben(s, kezdet, veg) {
  let nyitva = false;
  for (let i = kezdet - 1; i >= Math.max(0, kezdet - ABLAK); i--) {
    const c = s[i];
    if (NYITO.includes(c) || ZARO.includes(c)) { nyitva = NYITO.includes(c); break; }
  }
  if (!nyitva) return false;
  for (let i = veg; i < Math.min(s.length, veg + ABLAK); i++) {
    const c = s[i];
    if (NYITO.includes(c) || ZARO.includes(c)) return ZARO.includes(c);
  }
  return false;
}

export function chromePhraseHits(text, phrases) {
  const s = entitasMentes(String(text || ''));
  if (!s || !Array.isArray(phrases)) return [];
  const talalt = [];

  for (const phrase of phrases) {
    // A kötőjel/szóköz rugalmas, a szóhatár szigorú: a "#advanced" hashtag
    // és a "tryitnowadays" összetétel nem folt.
    //
    // ⚠️ A KÖTŐJEL IS SZÓHATÁR-TÖRŐ (2026-09-09, élesben 4 téves riasztás).
    // A visszatekintés eddig csak a betűt és a `#`-et zárta ki. A
    // `#ai-for-everyone` CÍMKÉBEN viszont a „for" előtt KÖTŐJEL áll, ami
    // átment rajta — így a hashtag-kizárás csak akkor működött, ha a frázis
    // KÖZVETLENÜL a `#` után kezdődött. Több szavas szlognál nem.
    // A szándék (a fenti két sor) jó volt; a megvalósítás egy karakterrel
    // rövidebb. Egy őr, ami nem-tennivalóra szól, zaj: a hamis riasztásban
    // a valódi lelet vész el.
    const mag = String(phrase).replace(/[-\s]/g, '[-\\s]');
    const rx = new RegExp(`(?<![a-z#-])${mag}(?![a-z])`, 'gi');

    for (const m of s.matchAll(rx)) {
      // IDÉZETT GOMBNÉV: idézőjelek KÖZÖTT áll → nem a mi feliratunk, hanem
      // egy idegen termék gombja, amit épp hogy NEM szabad lefordítani.
      if (idezetben(s, m.index, m.index + m[0].length)) continue;
      talalt.push(phrase);
      break;                       // frázisonként egy jelzés elég
    }
  }
  return talalt;
}

export default { chromePhraseHits, decodeEntities };
