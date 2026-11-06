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

// ===================================================================
// „NEM ELLENŐRIZHETŐ" VÁLTOZAT (2026-11-06, user: „örülnék, ha nem lenne több ilyen tévedés!")
// ===================================================================
// A fenti minták csak a „kitalált / nem létezik" szavakat ismerték. A bíró
// ugyanezt az elavult tudásból fakadó ítéletet gyakran így mondja: „cannot be
// verified", „unverified model name", „is not in the verified-real list",
// „as of available information there is no…", „OpenAI has never released…".
// Ezek ÁTJUTOTTAK: 11-06-án 825 leckéből ~30 ilyen ment az író promptjába, köztük
// „"Gemini Omni" … does not appear to be a real Google product" (valódi — 11-06-án
// pont egy Gemini Omni-hírt utasított el emiatt a bíró), „Invented product names:
// RTX Spark, Vids, Study Mode" (mind valódi), „Picsart Flow … not on the verified
// list" (valódi), „Kiro … not a verified-real product" (valódi).
//
// KIVÉTEL — ezek MARADNAK:
//   • ÁLTALÁNOS elv („Never invent…", „Always verify…") — nem eseti ítélet;
//   • FORRÁSHOZ mért ítélet („the source does not list…", „SOURCE block only…") —
//     az nem elavult tudás, hanem a cikk és a forrás összevetése.
// A verziószám pontja („Sonnet 4.5", „GPT-Image-2.6") nem mondatvég.
const T2 = '(?:product|model|name|brand|feature|tool|app|service|version|release|program|initiative|integration|acquisition|announcement)s?';
const M2 = '(?:[^.;!?]|\\.(?=\\d))';
const NEM_ELLENORIZHETO = [
  new RegExp(`\\b${T2}\\b${M2}{0,80}\\b(?:cannot|could not|can't|couldn't) be (?:independently )?(?:verified|confirmed)\\b`, 'i'),
  new RegExp(`\\b(?:unverified|unverifiable|unconfirmed) (?:AI |product |model |brand |tool )?${T2}\\b`, 'i'),
  new RegExp(`\\b${T2}\\b${M2}{0,40}\\bis unconfirmed\\b`, 'i'),
  /\bverified[- ]real\b|\bverified (?:product |names? |model )?list\b/i,
  /\bas of (?:available|my|public|current) (?:information|knowledge|data)\b|\bas of current knowledge\b/i,
  /\b(?:does not|doesn't) match (?:any )?known\b/i,
  new RegExp(`\\b(?:is|are) not (?:a |an )?(?:known|verified|recogni[sz]ed)\\b${M2}{0,50}\\b${T2}\\b`, 'i'),
  /\b(?:has|have) never (?:been )?(?:released|announced)\b/i,
  /\bno (?:such )?(?:verified|publicly announced|recogni[sz]ed)\b/i,
  /\bmy training\b|\btraining data\b/i,
  new RegExp(`\\binvented ${T2}\\b`, 'i'),
  /\bverify (?:these|this|that|they) (?:are|is) real\b/i,
  /\bI cannot verify\b/i,
  new RegExp(`\\bclaims? ${M2}{0,50}\\bexists?,? but (?:it |they )?(?:does|do) not\\b`, 'i'),
  /\bnot (?:a )?real (?:\w+ )?(?:product|model|name)\b|\bappear to be a real\b/i
];
const ALTALANOS_ELV = /^(?:Főnöki döntés tanulsága:\s*)?(?:Never|Always|Verify|When)\b/;
const FORRASHOZ_MERT = /\bsource(?: block| excerpt| blog| post| text| material| article)?\b(?: does not| doesn't| only| never)|not supported by the source|\bin the source\b|\bfrom the source\b|\bSOURCE block\b/i;

/** Eseti „ez a név/termék kitalált / nem ellenőrizhető" ítélet-e (→ ne mentsük, ne adjuk promptba)? */
export function nevTagadoLecke(text) {
  const s = String(text || '');
  if (MINTAK.some(rx => rx.test(s))) return true;
  const t = s.replace(/^Hitelesség-kapu blokk:\s*/, '');
  if (ALTALANOS_ELV.test(t) || FORRASHOZ_MERT.test(t)) return false;
  return NEM_ELLENORIZHETO.some(rx => rx.test(t));
}

export default { nevTagadoLecke };
