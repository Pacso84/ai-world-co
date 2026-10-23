// ===================================================================
// KITÖLTHETŐ PROMPT AZ ÚTMUTATÓKBAN (2026-10-23)
// ===================================================================
//
// MIÉRT: a user a Gemini-elemzés javaslatai közül kérte („az előzőeket is
// csináljuk!”): a 💬 promptok [szögletes] részeibe az olvasó közvetlenül
// beírhassa a saját adatát, és a Másolás már a kitöltött promptot adja.
// Terv: docs/superpowers/specs/2026-10-23-utmutato-segitseg-csomag-design.md (B).
//
// A SZÖVEG NEM VÁLTOZIK: a modul a már escape-elt dobozszövegben cseréli a
// helykitöltőt mezőre. Ahol nincs helykitöltő (mérve 10-23: 369-ből ~329
// prompt), a kimenet bájtra azonos a bemenettel.
//
// ÁLHELYKITÖLTŐ (mérve a 40 érintett útmutatóban): [REDACTED], [=====>],
// [1200, 350, 80] — ezekből NEM lehet mező, szövegként maradnak.
//
// KILL-SWITCH: KITOLTHETO_BE = false → a régi nézet a következő buildtől
// (a config `enabled` mezője önmagában nem kapcsol ki semmit — feedback-szabály).
// A böngészős másoló (website/assets/app.js) a `kitoltottSzoveg` szabályát követi.
// ===================================================================

export const KITOLTHETO_BE = true;

// [x], de nem markdown-link ([x](url))
const MINTA = /\[([^\]\n]{0,60})\](?!\()/g;
// „[email protected]” = a Cloudflare e-mail-elrejtésének maradványa (mérve 10-23), nem helykitöltő
const TILTOTT = /^(REDACTED|PII|email protected)$/i;

/** Igazi helykitöltő-e a zárójelek NÉLKÜLI tartalom? */
export function igaziHelykitolto(belso) {
  const s = String(belso ?? '').trim();
  if (s.length < 2 || s.length > 50) return false;
  if (!/\p{L}/u.test(s)) return false;
  if (TILTOTT.test(s)) return false;
  if (/[=<>]/.test(s)) return false;
  if (/^[\d\s,.\-%$]+$/.test(s)) return false;
  return true;
}

const attr = s => s.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A már escape-elt dobozszövegben az igazi [x]-eket beírható mezőre cseréli. */
export function kitolthetoHtml(escapedSzoveg, be = KITOLTHETO_BE) {
  const s = String(escapedSzoveg ?? '');
  if (!be) return s;
  return s.replace(MINTA, (m, belso) => {
    if (!igaziHelykitolto(belso)) return m;
    const h = attr(belso.trim());
    return `<input class="g-fill" type="text" placeholder="${h}" aria-label="${h}" size="${Math.max(6, belso.trim().length)}" data-h="${h}">`;
  });
}

/** A sablon igazi [x]-eit sorban az értékekre cseréli; üres értéknél [x] marad. */
export function kitoltottSzoveg(sablon, ertekek = []) {
  let i = 0;
  return String(sablon ?? '').replace(MINTA, (m, belso) => {
    if (!igaziHelykitolto(belso)) return m;
    const v = String(ertekek[i++] ?? '').trim();
    return v || m;
  });
}

export default { KITOLTHETO_BE, igaziHelykitolto, kitolthetoHtml, kitoltottSzoveg };
