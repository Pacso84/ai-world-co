// ===================================================================
// PÉLDA-DOMAIN A FORDÍTÁSBAN — az example.com NEM fordítandó (2026-09-27)
// ===================================================================
//
// MIÉRT: a fordító „honosította" a példa-címeket: example.com → ejemplo.com,
// pelda.hu, pelda.com. Mind a három LÉTEZŐ oldal (nslookup-pal igazolva) —
// a bolti PDF-ben egy csaló link mintája így lett „usps-tracking.ejemplo.com",
// vagyis egy valódi oldalt neveztünk csalásnak. Ugyanaz a hiba, mint 08-18-án
// (auspost-track.com), csak most a FORDÍTÓ hozta be, nem az író.
//
// Szabály (memória: feedback-kitalalt-domain-lehet-valodi): példa-cím CSAK az
// RFC 2606 szerint fenntartott example.com / .net / .org lehet. Ez a $0 javító
// a fordítás mentésekor visszaírja a honosított alakot.
// ===================================================================

const HONOSITOTT = [
  [/(?<![\w-])ejemplo\.(com|org|net)\b/gi, 'example.$1'],
  [/(?<![\w-])p[eé]lda\.(com|org|net)\b/gi, 'example.$1'],
  [/(?<![\w-])p[eé]lda\.hu\b/gi, 'example.com']
];

/** A honosított példa-domainek visszaírása example.*-ra. Aldomain és e-mail cím marad. */
export function peldaDomainJavit(szoveg) {
  if (typeof szoveg !== 'string') return szoveg;
  let s = szoveg;
  for (const [rx, mire] of HONOSITOTT) s = s.replace(rx, mire);
  return s;
}

export default { peldaDomainJavit };
