// ===================================================================
// FORRÁS-KÖZÖNSÉG-KAPU — kinek szól, és milyen jellegű a forrás? (2026-10-10)
// ===================================================================
// Élő eset 10-10: a forráskutató 100/100-zal javasolta a „HubSpot Product
// Updates"-et. A megbízhatóság-kapu (valódi-e?) és a hasznosság-kapu (MI-ről
// szól-e?) átengedte — de a hubspot.com/feed/ a MARKETING-blogra irányít át
// (blog.hubspot.com/marketing), a címek: „Enterprise AEO: How to manage brand
// visibility at scale…", „The best enterprise email marketing software in 2026".
// Szakmai B2B-tartalom marketingeseknek + „legjobb X" összehasonlítás (tiltott).
// User: „csinálj valamit, hogy a forráskutató profibb legyen!"
//
// EZ A KAPU a harmadik kérdés: KINEK SZÓL? A cikkcímekből, $0, determinisztikusan:
//   • B2B / vállalati / marketinges szakszó aránya  → nem az átlagembernek
//   • fejlesztői szakszó aránya                      → nem az átlagembernek
//   • „best X / X vs Y / top N" címek aránya         → összehasonlítás (tiltott)
//   • átirányítás más részre/hostra                  → jelzés + a valódi URL
// A küszöböket a MEGLÉVŐ, jó forrásainkon kalibráltuk (lásd a teszt fejlécét):
// egy kapu, ami a jó forrásokat is kidobná, rosszabb a semminél.
// ===================================================================

// Vállalati / B2B / marketinges szakszavak (a cím szintjén).
const B2B = /\b(enterprise|b2b|saas|aeo|seo|sem|ppc|pipeline|demand gen\w*|lead gen\w*|go-to-market|gtm|revenue|roi|kpis?|stakeholders?|agenc(?:y|ies)|marketers?|marketing (?:teams?|ops|operations|leaders?)|sales (?:teams?|reps?|leaders?)|crm|customer success|account-based|abm|procurement|compliance|governance|at scale|workforce|cios?|ctos?|cfos?|it leaders?|webinar|whitepaper|case study|earnings|quarterly results|fiscal)\b/i;
// Fejlesztői szakszavak.
const DEV = /\b(apis?|sdks?|cli|kubernetes|k8s|docker|devops|mlops|benchmarks?|fine-?tun\w*|inference|latency|throughput|endpoints?|deploy\w*|repos?|github actions|open-source model|weights|tokens? per|vector databases?|rag pipeline|terraform|serverless|microservices?)\b/i;
// MI-MODELLGYÁRTÓ JELEI (2026-10-10, user: „ha jön egy új LLM-cég, mi lemaradunk
// róla! pedig jó lenne időben publikálni"). Egy modell-bejelentő blog címeiben
// TERMÉSZETES a fejlesztői/vállalati szó (API, benchmark, inference, „for
// enterprise") — ilyenkor a b2b/dev szűrő NEM zár ki, csak jelez.
const LLM_JEL = /\b(introducing|announcing|launch\w*|releas\w*|models?|llms?|large language|reasoning|multimodal|open[- ]?weights?|open[- ]?source model|chatbot|chat app|assistants?|agents?|gpt|tokens?|context window|frontier)\b/i;
export const LLM_GYARTO_ARANY = 0.3;

// Összehasonlító / listás címek (a user tiltja: 09-26).
const LISTA = /\b(best|top \d+|\d+ best|vs\.?|versus|alternatives?|compar\w+|ranked|ranking)\b/i;

// KALIBRÁLVA 10-10 a 31 bekapcsolt RSS-forrásunkon + a HubSpot-mintán:
//   HubSpot b2b 78% · lista 20%   |   a mieink: b2b ≤ 37% (SAP), dev ≤ 30% (together)
//   lista: Zapier 52%, Picsart 22%, D-ID 22% — ezek JÓ források (a cikkenkénti
//   listicle-szűrő a scraperben kiszedi a „best X" tételeiket) → a lista-arány
//   csak 60% fölött kizáró, 15% fölött FIGYELMEZTETÉS (a user látja az üzenetben).
export const KUSZOB = {
  b2b: 0.5,       // a címek több mint fele vállalati/marketinges → nem nekünk
  dev: 0.4,       // fejlesztői
  lista: 0.6,     // „best X / vs" — a forrás java összehasonlító SEO-tartalom
  listaJelez: 0.15
};

/** Címek kinyerése a hírfolyam tételeiből. */
export function cimek(items) {
  return (Array.isArray(items) ? items : []).map(it => String((it && (it.title || it.name)) || '').trim()).filter(Boolean).slice(0, 40);
}

/** Arányok (0–1) a címekre. */
export function kozonsegArany(items) {
  const c = cimek(items);
  const n = c.length || 1;
  const db = re => c.filter(t => re.test(t)).length;
  return { n: c.length, b2b: db(B2B) / n, dev: db(DEV) / n, lista: db(LISTA) / n, llm: db(LLM_JEL) / n };
}

/**
 * Átirányítás-jelzés: a beadott hírfolyam-cím és a ténylegesen elért cím.
 * Más host vagy más fő-útvonal → { atiranyit: true, leiras }.
 */
export function atiranyitas(kertUrl, valosUrl) {
  try {
    const a = new URL(kertUrl), b = new URL(valosUrl);
    const host = h => h.replace(/^www\./, '');
    const elsoSzint = u => (u.pathname.split('/').filter(Boolean)[0] || '');
    if (host(a.hostname) !== host(b.hostname) || elsoSzint(a) !== elsoSzint(b)) {
      return { atiranyit: true, leiras: `átirányít: ${host(a.hostname)}${a.pathname} → ${host(b.hostname)}${b.pathname}` };
    }
  } catch { /* érvénytelen URL: nincs mit mondani */ }
  return { atiranyit: false, leiras: '' };
}

/**
 * A kapu döntése. { ok, okok[], arany, mintak[] }
 * @param {Array} items  hírfolyam-tételek
 */
export function kozonsegKapu(items) {
  const arany = kozonsegArany(items);
  const okok = [], figyelmeztetesek = [];
  const mintak = cimek(items).slice(0, 3);
  if (arany.n < 3) return { ok: true, okok, figyelmeztetesek, arany, mintak };   // kevés adat: nem ez a kapu dönt
  const pct = x => Math.round(x * 100) + '%';
  // MI-modellgyártó: a b2b/dev szó természetes → csak FIGYELMEZTETÉS, nem kizárás.
  const llmGyarto = arany.llm >= LLM_GYARTO_ARANY;
  const ide = llmGyarto ? figyelmeztetesek : okok;
  const megj = llmGyarto ? ' (MI-modellgyártónak tűnik, ezért NEM zártam ki)' : ' — nem az átlagembernek';
  if (arany.b2b > KUSZOB.b2b) ide.push(`vállalati/marketinges tartalom (${pct(arany.b2b)} a címekből)${megj}`);
  if (arany.dev > KUSZOB.dev) ide.push(`fejlesztői tartalom (${pct(arany.dev)})${megj}`);
  if (arany.lista > KUSZOB.lista) okok.push(`„legjobb X / X vs Y" összehasonlító címek (${pct(arany.lista)}) — tiltott műfaj`);
  else if (arany.lista > KUSZOB.listaJelez) figyelmeztetesek.push(`sok „legjobb X / X vs Y" cím (${pct(arany.lista)}) — ezeket a cikkíró kiszűri`);
  return { ok: okok.length === 0, okok, figyelmeztetesek, arany, mintak };
}

export default { KUSZOB, LLM_GYARTO_ARANY, cimek, kozonsegArany, atiranyitas, kozonsegKapu };
