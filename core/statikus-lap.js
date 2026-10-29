// STATIKUS-LAP KAPU (2026-07-28, agents/rss-scraper) — kiemelve és pontosítva 2026-10-29.
// A Google News „site:” keresés (pl. site:deepseek.com) nem csak hírt ad, hanem a weboldal ÁLLANDÓ
// lapjait is: „DeepSeek Platform”, „Connectors - Perplexity”, „What is Perplexity?”. Két jel:
// tipikus menüpont-név, vagy 1–3 szavas cím a „ - Forrás” levágása után.
//
// ⚠️ 2026-10-29: a rövid-cím szabály MINDEN forrásra lefutott, és a Midjourney saját hírcsatornájából
// kiszórta a „Testing Thinking Mode” (3 szó) és az „Alpha Changelog - 10/7/26” bejegyzést (a dátumot
// forrásnévnek nézte, maradt 2 szó). Ezért a rövid-cím jel és a „ - Forrás” levágás CSAK a Google
// News-forrásokra él; a menüpont-név minden forrásnál kizáró.

import { keszulekNev } from './elakadas.js';

const NAV_PAGE = /^(home|about|pricing|contact|careers|docs?|documentation|platform|api|api platform|connectors?|blog|news|products?|features?|enterprise|login|sign ?up|download|help|support|faq|terms|privacy|what is .+\?)$/i;

export const googleNewsForras = feed => /news\.google\.com/i.test(String(feed?.url || ''));

export function isStaticPage(title, { googleNews = false } = {}) {
  const nyers = String(title || '').trim();
  // A Google News a forrás nevét „ - Forrás” alakban fűzi a cím végére.
  const bare = googleNews ? nyers.replace(/\s+-\s+[^-]+$/, '').trim() : nyers;
  if (!bare) return true;
  if (NAV_PAGE.test(bare)) return true;
  // 1–3 szavas cím állítás nélkül = a site:-keresésben szinte biztosan menüpont, nem hír.
  return googleNews && bare.split(/\s+/).length <= 3;
}

// 📵 KÉSZÜLÉK-KAPU (2026-10-29, Amazon Alexa-csatorna): a hivatalos Alexa-hírek fele készülékbemutató
// („Echo Show 16”, „newest lineup of Alexa devices”, „Alexa Photo Frame”). Ezekből nálunk nem lehet cikk
// (user 10-26: készüléknév = megkülönböztetés). A forrás `eszkoz_kapu: true` jelzővel kapja meg; a
// funkcióhírek („Alexa for Shopping adds 100+ new capabilities”) átmennek.
const HARDVER = /\b(devices?|lineup|photo frame|cameras?|speakers?|smart display|displays?|earbuds|headphones|doorbell|thermostat|smart glasses|glasses|ring)\b/i;
export const keszulekBemutato = title => keszulekNev(String(title || '')) || HARDVER.test(String(title || ''));
