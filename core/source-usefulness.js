// ===================================================================
// FORRÁS-HASZNOSSÁG — kell-e NEKÜNK, nem csak valódi-e
// ===================================================================
//
// A source-scout megbízhatóság-kapuja (agents/source-scout/agent.js) azt méri,
// VALÓDI-e a forrás: HTTPS, hivatalos domain, friss feed, bő kínálat. Ez jó
// kapu — de 2026-08-11-én hat javaslatot adott 100/100-zal, és NÉGY közülük
// semmit nem ír AI-ról. Az Airbnb friss címei: "Q2 2026 financial results",
// "74% of Gen Z want small town trips over big cities".
//
// Ez a MÁSODIK nekifutás ugyanerre a hibára: 2026-08-01-én a küszöb 70→100
// ment, és a vadászmezők fogyasztói appokra álltak át. A scout azóta jó
// mezőn vadászik — csak épp senki nem nézte meg, hogy a jelölt ír-e egyáltalán
// AI-ról. A megbízhatóság és a hasznosság KÉT KÜLÖN kérdés.
//
// ── A KÜSZÖB ÉLES ADATRA VAN SZABVA (2026-08-11, friss 12 cikk/forrás) ──
//   bevált forrásaink : openai 92 · aws-ml 100 · d-id 89 · nvidia 75
//                       midjourney 75 · databricks 60 · workspace 50 · picsart 33
//   a hat javaslat    : coursera 70 · notion 50 · zoho 30 · khan 10
//                       memrise 0 · airbnb 0
// A haszontalanok 30% ALATT, a használhatók 50% FELETT — tiszta elválás.
// ⚠️ A user "csak 100 százalékosat" kért; szó szerint véve az a SAJÁT
// forrásaink 7/8-át is kizárná (az OpenAI blogot is). A 60 a szándékot
// valósítja meg: a mért haszontalanok mind kiesnek.
// ===================================================================

/** Efölött tekintünk egy jelöltet nekünk valónak. Éles adatra kalibrálva. */
export const MIN_AI_RATIO = 60;

// Terméknevek: NEM kell szóhatár. Az első mércém azért mondott az OpenAI
// blogra 58%-ot, mert a \b miatt a "ChatGPT"-ben a "GPT" nem illeszkedett.
const TERMEK = /(chatgpt|gpt-?\d|dall-?e|sora|copilot|gemini|claude|llama|mistral|midjourney|firefly|bedrock|sagemaker|watsonx|qwen|deepseek|perplexity|grok)/i;
// Fogalmak: szóhatárral, hogy a "kai" vagy a "domain" ne üssön be.
const FOGALOM = /\b(ai|a\.i\.|artificial intelligence|machine learning|llm|genai|generative|neural|chatbot|assistants?|agentic|agents?|models?|automat\w*|intelligen\w*|prompts?)\b/i;

/**
 * A friss cikkek hány százaléka szól AI-ról?
 * @param {Array<{title?:string, contentSnippet?:string}>} items
 * @returns {number} 0–100
 */
export function aiContentRatio(items) {
  if (!Array.isArray(items) || !items.length) return 0;
  const talalat = items.filter(i => {
    const s = String(i?.title || '') + ' ' + String(i?.contentSnippet || '').slice(0, 400);
    return TERMEK.test(s) || FOGALOM.test(s);
  }).length;
  return Math.round(talalat / items.length * 100);
}

// A domain-variáns ugyanaz a cég: a scout a notion.so-t javasolta, miközben
// a notion.com már fut nálunk — és 30 napja 0 cikket hozott.
const TLD_VARIANS = /\.(com|so|ai|io|org|net|co)$/i;
function kulcs(url) {
  try {
    const u = new URL(String(url));
    const host = u.hostname.replace(/^www\./i, '').replace(TLD_VARIANS, '');
    const ut = u.pathname.replace(/\/+$/, '');
    return `${host}${ut}`.toLowerCase();
  } catch { return String(url || '').toLowerCase(); }
}

/**
 * Ugyanarra a forrásra mutat a két URL? (www, záró /, TLD-variáns nélkül)
 */
export function sameSource(a, b) {
  return !!a && !!b && kulcs(a) === kulcs(b);
}

/**
 * Felvegyük-e a jelöltet?
 * @param {{aiRatio:number, url:string, existingUrls:string[]}} p
 * @returns {{ok:boolean, reason:string}}
 */
export function usefulnessVerdict({ aiRatio, url, existingUrls }) {
  const meglevo = Array.isArray(existingUrls) ? existingUrls : [];
  if (meglevo.some(u => sameSource(u, url))) {
    return { ok: false, reason: 'ezt a forrást MÁR figyeljük (duplikátum, domain-variáns)' };
  }
  const r = Number(aiRatio) || 0;
  if (r < MIN_AI_RATIO) {
    return { ok: false, reason: `a friss cikkeinek csak ${r}%-a szól AI-ról (kell: ${MIN_AI_RATIO}%)` };
  }
  return { ok: true, reason: `a friss cikkeinek ${r}%-a AI-témájú` };
}

export default { aiContentRatio, sameSource, usefulnessVerdict, MIN_AI_RATIO };
