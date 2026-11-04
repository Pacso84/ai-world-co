// Borítókép-jelenet: kitalált felirat elleni háló (2026-10-19).
// A Flux nem tud írni: ha a jelenetben képernyő, papír, tábla, címke vagy logó
// van, halandzsa betűket rajzol rá („Aleza+”, „Vidde aps day”, „Rtews News”).
// A jelenetíró utasítása tiltja ezeket; ha mégis becsúszik, a designer egyszer
// újraíratja (szovegKockazat), és végső hálóként a jelenet végére odaírja,
// hogy minden képernyő kikapcsolt és üres (szovegMentesJelenet).
//
// MÉRVE (10-19, előnézet): a puszta „no text” toldat NEM elég — ha a jelenet
// „printed headline”-t vagy „open planner”-t kér, a Flux akkor is betűt rajzol.
// Ezért kell az újraíratás: a tárgyat kell kivenni, nem a betűt tiltani.

export const SZOVEGMENTES_TOLDAT = ' Every screen in the scene is switched off and completely blank; there is no writing, lettering, logo or label anywhere.';

// Tárgyak/szavak, amelyekre a Flux feliratot rajzol (képernyő, papír, felirat).
const SZOVEG_KOCKAZAT = /\b(screens?|displays?|displaying|monitors?|laptops?|tablets?|smartphones?|phones?|apps?|interfaces?|UI|dashboards?|websites?|web ?pages?|chat ?windows?|browsers?|logos?|signs?|signboards?|labels?|labell?ed|text|letters?|words?|captions?|documents?|newspapers?|headlines?|checklists?|lists?|notes?|notebooks?|planners?|calendars?|charts?|papers?|pages?|books?|magazines?|posters?|menus?|maps?|receipts?|tickets?|envelopes?|cards?|speech ?bubbles?|thought ?bubbles?|bubbles?|banners?|badges?|stickers?|tags?|whiteboards?|blackboards?|chalkboards?|billboards?|quotes?)\b/i;

/** Az első szó a jelenetben, amiből a Flux feliratot rajzolna — vagy null. Nem dob. */
export function szovegKockazat(jelenet) {
  const m = String(jelenet == null ? '' : jelenet).match(SZOVEG_KOCKAZAT);
  return m ? m[1] : null;
}

/** Újraíró utasítás a jelenetírónak, ha a jelenet feliratos tárgyat kért. */
export function ujrairasKeres(jelenet, szo) {
  return `Your scene: "${jelenet}"\nIt contains "${szo}" — the image model draws gibberish letters on any screen, paper, page, book, speech bubble, sign, label or logo. Rewrite the scene WITHOUT any of those: keep the same subject, using only physical objects with no writing surface. Reply with ONLY the new scene, max 30 words.`;
}

/** A jelenet + szükség esetén a „semmi felirat” toldat. Idempotens, nem dob. */
export function szovegMentesJelenet(jelenet) {
  const s = String(jelenet == null ? '' : jelenet);
  if (s.endsWith(SZOVEGMENTES_TOLDAT) || !SZOVEG_KOCKAZAT.test(s)) return s;
  return s + SZOVEGMENTES_TOLDAT;
}
