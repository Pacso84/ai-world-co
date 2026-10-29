// 🕰️ RÉGI BEJEGYZÉS AZ RSS-BEN (2026-10-29, Telegram-riport: „ELAVULT forrásból írunk: Sony AI —
// a feed 120 napja néma, mégis 1 »friss« cikket írtunk belőle”). Az rss-scraper eddig csak azt nézte,
// LÁTTUK-E már a linket, azt nem, hogy MIKORI a bejegyzés: a Sony júniusi összefoglalója új linkként
// bukkant fel, és 10-21-én hírként ment ki. A sitemap-forrásoknak már volt korhatára
// (core/sitemap-feed.js, `max_age_days`, alapból 21 nap) — most az RSS is ugyanazt a szabályt kapja.
// Dátum nélküli vagy értelmezhetetlen dátumú bejegyzést NEM dobunk el (arról nem tudjuk, hogy régi).

export const ALAP_MAX_NAP = 21;   // egyezik a sitemap-forrásokéval

/** A bejegyzés dátuma ms-ban (pubDate / isoDate), vagy NaN, ha nincs vagy értelmezhetetlen. */
export function tetelDatum(item) {
  const nyers = item?.isoDate || item?.pubDate || item?.published || null;
  return nyers ? Date.parse(nyers) : NaN;
}

/** Túl régi-e a bejegyzés? `forras.max_age_days` felülírja az alapot. */
export function tulRegiTetel(item, { forras = {}, most = Date.now() } = {}) {
  const t = tetelDatum(item);
  if (!Number.isFinite(t)) return false;
  const maxNap = Number(forras.max_age_days) > 0 ? Number(forras.max_age_days) : ALAP_MAX_NAP;
  return most - t > maxNap * 864e5;
}
