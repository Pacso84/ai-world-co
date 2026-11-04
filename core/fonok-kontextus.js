// ===================================================================
// 👔 FŐNÖK-BOT ÉLŐ ADATAI — látogatószám + valóban függő forrás-javaslatok
// ===================================================================
// MIÉRT (2026-11-04, user: „a telegramnál nincs minden rendben — a jelentésnél
// 200 valamennyi látogató van, a bot 500 valamennyit ír! ez ellentmond!”):
// a Telegram-bot (agents/ceo/instruct.js) „élő adatai” között NEM VOLT
// látogatószám. A nyelvi modell ezért a beszélgetés-előzményből (az utolsó 10
// üzenet) halászott: a 11-02-i napi jelentés „Tegnap: 518”-át mondta 11-04-én
// „tegnapi”-nak, miközben a friss jelentés 203-at írt. Ugyanígy az ElevenLabs
// forrást „jóváhagyásra várónak” mondta, pedig 11-03 óta élesben megy — a
// javaslat-lista (discovered-sources.json) a felvétel után nem ürült.
//
// A javítás: a bot UGYANAZT a számot kapja, ugyanazzal a függvénnyel, mint a
// napi jelentés (core/report-lines.js visitorLine), és a javaslatok közül
// kimarad, ami már bent van a sources/rss-feeds.json-ban.
// ===================================================================

import { visitorLine } from './report-lines.js';

/** Az URL összevetéshez: kisbetű, protokoll, www. és záró / nélkül. */
export function urlKulcs(u) {
  return String(u || '').trim().toLowerCase()
    .replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
}

/**
 * A látogató-sor a botnak — PONTOSAN az, amit a napi jelentés is mond.
 * @param {object} days  memory/traffic-log.json → days
 * @param {string} today YYYY-MM-DD (UTC)
 * @returns {string} pl. "👥 Tegnap: 203 látogató (7 napos átlag: 260)", vagy üres
 */
export function latogatoKontextus(days, today) {
  return visitorLine(days, today) || '';
}

/**
 * Valóban függő forrás-javaslatok: ami már a hírforrások között van
 * (azonos URL vagy azonos id), az NEM vár jóváhagyásra.
 * @param {Array} javaslatok discovered-sources.json → discovered_sources
 * @param {Array} forrasok   rss-feeds.json → sources
 */
export function fuggoJavaslatok(javaslatok, forrasok) {
  const bentUrl = new Set((forrasok || []).map(s => urlKulcs(s?.url)).filter(Boolean));
  const bentId = new Set((forrasok || []).map(s => s?.id).filter(Boolean));
  return (javaslatok || []).filter(j =>
    j && !bentUrl.has(urlKulcs(j.url)) && !(j.suggested_id && bentId.has(j.suggested_id)));
}
