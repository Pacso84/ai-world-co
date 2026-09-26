// ===================================================================
// TANULSÁG-SZŰRŐ: a „ez a név KITALÁLT" típusú eseti ítéletek (2026-09-26)
// ===================================================================
//
// MIÉRT: a bíró tudása ~2026 januári (lásd truth-gate.js, 09-23). Amikor
// egy valódi, de számára új terméket kitaláltnak ítélt, az ítélet
// TANULSÁGKÉNT elmentődött, és azóta minden író-promptba visszakerül —
// 09-26-án 728 tanulságból 170 ilyen volt, köztük:
//   „The product name "Alexa+" is invented" (valódi; 19 útmutatónk szól róla)
//   „Claude Opus 5 … invented", „Midjourney V8.1 … latest is V6".
// A modell így a VALÓDI neveket kezdte kerülni.
//
// Az ÁLTALÁNOS elv („ne találj ki nevet, gombot, URL-t") a szabályfájlokban
// él (legal-rules-ai.md) — az eseti ítéletre nincs szükség, és ártalmas,
// mert gyakran téved. Ezért ezek NEM mentődnek, és NEM kerülnek promptba.
// ===================================================================

const TARGY = '(?:product|model|name|brand|feature|initiative|tool|app|service|version|toggle|setting|button|menu|mode|url|domain|link|announcement|program|project)';
const ITELET = '(?:invented|fabricated|fictional|fictitious|made[- ]up|non-?existent|not (?:a )?real|fake|hallucinated)';

const MINTAK = [
  // Egy konkrét dologról ÁLLÍTJA, hogy nem létezik: „"Alexa+" is invented",
  // „Midjourney V8.1 is fabricated", „OpenAI Presence is not a real OpenAI
  // product", „"Claude Opus 5" appears to be an invented or incorrectly named model".
  // (Az általános „presents invented dashboard steps" NEM ilyen — az megmarad.)
  new RegExp(`\\b(?:is|are|was|were|appears?(?: to be)?|seems?(?: to be)?|looks?(?: like)?)\\s+(?:likely |probably |entirely |completely |clearly )?(?:an? )?(?:${ITELET}|incorrectly named)\\b`, 'i'),
  // „… product … invented" közbeékelt szóval is („the model name here is likely invented")
  new RegExp(`\\b${TARGY}\\b[^.]{0,60}\\b${ITELET}\\b`, 'i'),
  // „does not exist", „does not appear to exist", „there is no official product named …"
  /\b(?:does|do|did) not (?:actually |appear to |seem to )?exist\b/i,
  /\binvented (?:model|product) name\b/i,
  /\bnot (?:a )?real (?:\w+ )?(?:model|product|feature|service)\b/i,
  // a bíró SAJÁT tudására hivatkozik („I'm not aware", „not on the verified list")
  /\bI(?:'m| am) not (?:reasonably |fully )?(?:sure|aware|certain)\b/i,
  /\bnot on the verified/i,
  /\bas of (?:my|public) knowledge\b/i,
  /\bthere is no (?:official |such )?(?:product|model|announcement|feature|version|tool)\b/i,
  // elavult tudásból: „latest is V6", „uses a future date"
  /\blatest (?:version |model )?is\b/i,
  /\bfuture date\b/i
];

/** Eseti „ez a név/termék kitalált" ítélet-e (→ ne mentsük, ne adjuk promptba)? */
export function nevTagadoLecke(text) {
  const s = String(text || '');
  return MINTAK.some(rx => rx.test(s));
}

export default { nevTagadoLecke };
