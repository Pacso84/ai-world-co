// TÖRZS-H1 (2026-11-05, Bing Recommendations „Az oldalon több <h1> van”, magas súlyosság).
// A cikkoldal H1-e a SABLON fejlécében van (article__title). A markdown-törzs „# Cím” sorát a build
// eddig csak akkor vette le, ha a törzs LEGELEJÉN állt (stripLeadH1, 2026-07-31). Ha elé került a
// „> **In short:**” idézet (vagy a fordító ilyen sorrendben adta vissza), a cím másodszor is H1 lett:
// 11-05-én 20 lap (en 3 · hu 10 · es 7), pl. how-to-run-stable-diffusion-on-your-computer-….
// Szabály: a törzsben NINCS H1. A legelső H1 és a címmel azonos H1 kimarad; minden más H1 → H2
// (szöveg nem vész el). Csak a megjelenítés változik, a cikk-fájl nem.

const norm = s => String(s || '')
  .replace(/<[^>]+>/g, '')
  .replace(/&[a-z#0-9]+;/gi, ' ')
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim();

/** Egy cikkrész (útmutató-bevezető, lépés, doboz) HTML-je: itt a címet a hívó már levette
 *  (parseGuideSections), tehát MINDEN megmaradt H1 tévedés → H2 (szöveg nem vész el). */
export function nincsH1(html) {
  return String(html || '').replace(/<h1(\s[^>]*)?>([\s\S]*?)<\/h1>/gi, (m, attr, belso) => `<h2${attr || ''}>${belso}</h2>`);
}

export function torzsH1(html, cim) {
  let out = String(html || '').replace(/^\s*<h1[^>]*>[\s\S]*?<\/h1>\s*/, '');
  const c = norm(cim);
  // az első H2 ELŐTT álló H1 a cím helyén van (pl. a „Röviden” idézet után) → kimarad, akkor is,
  // ha a fordításban csak hasonlít a címre (11-05: 6 hu/es lap ilyen volt)
  const elsoH2 = out.search(/<h2[\s>]/i);
  out = out.replace(/<h1([^>]*)>([\s\S]*?)<\/h1>\s*/gi, (teljes, attr, belso, hol) =>
    ((c && norm(belso) === c) || elsoH2 < 0 || hol < elsoH2) ? '' : `<h2${attr}>${belso}</h2>\n`);
  return out;
}
