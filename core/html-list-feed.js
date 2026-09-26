// ===================================================================
// LISTAOLDAL-FORRÁS (`type: 'html-list'`) — 2026-09-26
// ===================================================================
//
// MIÉRT: a MiniMax és a Kimi angol blogja se RSS-t, se hír-sitemapet nem
// ad, de a hivatalos listaoldalukon (minimax.io/blog, kimi.com/blog) a
// bejegyzések linkjei ott vannak a HTML-ben. User: „olyanokat keressen,
// amiket be tudunk kötni" — ÉS: „kell, hogy a forrás hiteles legyen".
//
// HITELESSÉG (a user feltétele):
//   • CSAK a listaoldallal AZONOS domainre mutató link jöhet szóba — más
//     oldalra (hírportál, közösségi média, másik cég) mutatót eldobunk.
//   • A cím/leírás/dátum a cég SAJÁT oldaláról jön (extractPageMeta).
//   • Utána a megszokott út: kulcsszó → AI-relevancia → író → hitelesség-kapu.
//
// DÁTUM: ha az oldalon van valódi dátum, az dönt (a régi kiesik). Ha nincs
// (a Kiminél nincs), akkor az számít újnak, ami ELŐSZÖR jelenik meg a
// listán — ezért az ELSŐ futáskor a dátum nélküli bejegyzéseket csak
// „látottnak" jelöljük (`elsoFutas`), különben a teljes archívum bezúdulna.
//
// Hálózat: CSAK a `fetchFn`-en át. Soha nem dob.
// ===================================================================
import { extractPageMeta, titleFromUrl } from './sitemap-feed.js';
import { nemLatinArany } from './sitemap-discovery.js';

const DAY = 24 * 60 * 60 * 1000;
const host = u => { try { return new URL(u).hostname.replace(/^www\./i, '').toLowerCase(); } catch { return ''; } };

/** A listaoldal HTML-jéből az AZONOS domainű, mintára illő linkek (sorrendtartó, egyedi). */
export function listaLinkek(html, listUrl, pathInclude) {
  const rx = pathInclude ? new RegExp(pathInclude, 'i') : null;
  const sajat = host(listUrl);
  const lista = String(listUrl || '').replace(/[?#].*$/, '').replace(/\/+$/, '');
  const ki = [];
  const volt = new Set();
  for (const m of String(html || '').matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"'#]+)["']/gi)) {
    let abs;
    try { abs = new URL(m[1], listUrl).href.replace(/[?#].*$/, ''); } catch { continue; }
    if (host(abs) !== sajat) continue;                    // CSAK a cég saját domainje
    if (abs.replace(/\/+$/, '') === lista) continue;       // maga a listaoldal nem hír
    if (rx && !rx.test(abs)) continue;
    const kulcs = abs.replace(/\/+$/, '');
    if (volt.has(kulcs)) continue;
    volt.add(kulcs);
    ki.push(abs);
  }
  return ki;
}

async function szoveg(url, fetchFn) {
  const r = await fetchFn(url, {
    signal: AbortSignal.timeout(20000),
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AIWorldBot/1.0; +https://aiworldhq.com)' }
  });
  if (!r || !r.ok) throw new Error('HTTP ' + (r && r.status));
  return r.text();
}

/**
 * A hírgyűjtő belépője: RSS-szerű elemek a listaoldalról.
 * @returns {Promise<{ok:boolean, items:Array<{title,link,contentSnippet,pubDate}>, stale:number, error?:string}>}
 */
export async function fetchHtmlListFeed(source, { fetchFn = fetch, limit = 10 } = {}) {
  try {
    const linkek = listaLinkek(await szoveg(source.url, fetchFn), source.url, source.path_include);
    if (!linkek.length) return { ok: false, items: [], stale: 0, error: 'a listaoldalon nincs illeszkedő link' };
    const cutoff = Date.now() - (source.max_age_days ?? 30) * DAY;
    const items = [];
    let stale = 0;
    for (let i = 0; i < linkek.length && i < limit * 2 && items.length < limit; i += 4) {
      const metas = await Promise.all(linkek.slice(i, i + 4).map(async (link) => {
        try { return { link, meta: extractPageMeta(await szoveg(link, fetchFn)) }; }
        catch { return { link, meta: null }; }
      }));
      for (const { link, meta } of metas) {
        if (items.length >= limit || !meta) continue;
        const d = meta.date || null;
        if (d && Date.parse(d) < cutoff) { stale++; continue; }
        items.push({ title: meta.title || titleFromUrl(link), link, contentSnippet: meta.snippet || '', pubDate: d });
      }
    }
    return { ok: true, items, stale };
  } catch (e) {
    return { ok: false, items: [], stale: 0, error: String((e && e.message) || e).slice(0, 120) };
  }
}

/**
 * Első futás: a DÁTUM NÉLKÜLI bejegyzések csak alapállapotnak számítanak
 * (látottnak jelöljük, nem lesz belőlük cikk). Utána minden új link hír.
 * @returns {{ uj: Array, alap: Array }}
 */
export function elsoFutas(items, seenLinks) {
  const lista = items || [];
  if (seenLinks && seenLinks.size > 0) return { uj: lista, alap: [] };
  return { uj: lista.filter(i => i.pubDate), alap: lista.filter(i => !i.pubDate) };
}

/**
 * A forrás-kutatónak: van-e a domainnek beköthető listaoldala (/blog, /news)?
 * Csak DÁTUMOS bejegyzésekkel ad javaslatot — a frissességet mérni kell.
 */
export async function discoverHtmlListFeed(domain, { fetchFn = fetch, maxAgeDays = 365, limit = 8 } = {}) {
  try {
    const base = String(domain || '').replace(/\/+$/, '');
    if (!/^https:\/\//.test(base)) return null;
    const h = host(base).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const ut of ['/blog', '/news', '/newsroom', '/updates']) {
      const path_include = `${h}/${ut.slice(1)}/[^/?#]+/?$`;
      const r = await fetchHtmlListFeed({ url: base + ut, path_include, max_age_days: maxAgeDays }, { fetchFn, limit });
      if (!r.ok) continue;
      const datumos = r.items.filter(i => i.pubDate);
      if (datumos.length < 3) continue;
      if (nemLatinArany(datumos) >= 0.5) continue;        // angolul írunk (09-26: kimi.com/news csak kínai)
      return {
        type: 'html-list',
        url: base + ut,
        path_include,
        feed: { title: host(base), link: base, items: datumos.map(i => ({ title: i.title, contentSnippet: i.contentSnippet, isoDate: i.pubDate, link: i.link })) }
      };
    }
    return null;
  } catch {
    return null;
  }
}
