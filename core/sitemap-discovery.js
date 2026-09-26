// ===================================================================
// SITEMAP-HÍRFOLYAM FELFEDEZÉSE egy domainhez (2026-09-26)
// ===================================================================
//
// MIÉRT: a forrás-kutató eddig CSAK RSS-mintákat próbált. 09-26-án 18
// jelöltből 16 „nincs működő RSS"-sel esett ki, miközben nálunk a
// SITEMAP-forrás már hónapok óta működik (Anthropic, Cohere) — és a
// DeepSeek hírei is kézzel így lettek meg. A user: „ne csak RSS-t nézzen,
// olyanokat keressen, amiket be tudunk kötni!"
//
// Amit a hírgyűjtő be tud kötni: `type:'rss'` VAGY `type:'sitemap'` +
// `path_include`. Ez a modul az utóbbit keresi meg: a sitemapben a
// hír-szerű útvonal-csoportot (/news/<slug>, /blog/<slug>, /changelog/…),
// és pontosan azt a konfigurációt adja vissza, amit a rss-feeds.json vár.
//
// Hálózat: CSAK a `fetchFn`-en át (tesztben hamis). Soha nem dob.
// ===================================================================
import { parseSitemapXml, fetchSitemapFeed } from './sitemap-feed.js';

// Hír-szerű szakasz, opcionális nyelvi előtaggal (/en/news/…, /blog/…).
const HIR_SZAKASZ = /^(\/(?:[a-z]{2}(?:-[a-z]{2,4})?\/)?(?:news|blog|blogs|changelog|updates|release-notes|releases|whats-new|newsroom|announcements|press|press-releases|stories)\/)[^/?#]+\/?$/i;
const MIN_BEJEGYZES = 3;

const regexEscape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A sitemap-bejegyzésekből a legjobb hír-csoport (tiszta függvény).
 * @returns {{ prefix: string, path_include: string, count: number } | null}
 */
export function legjobbHirCsoport(entries) {
  const csoport = new Map();
  for (const e of entries || []) {
    if (!e || !e.lastmod) continue;                 // a hírgyűjtő lastmod nélkül nem lát semmit
    let ut;
    try { ut = new URL(e.loc).pathname; } catch { continue; }
    const m = ut.match(HIR_SZAKASZ);
    if (!m) continue;
    const p = m[1].toLowerCase();
    csoport.set(p, (csoport.get(p) || 0) + 1);
  }
  let best = null;
  for (const [prefix, count] of csoport) {
    if (count < MIN_BEJEGYZES) continue;
    const angol = /^\/en(-[a-z]+)?\//.test(prefix);
    const jobb = !best || count > best.count || (count === best.count && angol && !best.angol);
    if (jobb) best = { prefix, count, angol };
  }
  if (!best) return null;
  return { prefix: best.prefix, path_include: regexEscape(best.prefix) + '[^/]+/?$', count: best.count };
}

/** A címek hányad része nem-latin írású (CJK / hangul / kana)? */
export function nemLatinArany(items) {
  const lista = (items || []).filter(i => i && i.title);
  if (!lista.length) return 0;
  const cjk = lista.filter(i => /[぀-ヿ㐀-鿿가-힯]/.test(i.title)).length;
  return cjk / lista.length;
}

async function szoveg(url, fetchFn) {
  const r = await fetchFn(url, {
    signal: AbortSignal.timeout(15000),
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AIWorldBot/1.0; +https://aiworldhq.com)' }
  });
  if (!r || !r.ok) throw new Error('HTTP ' + (r && r.status));
  return r.text();
}

/**
 * Megkeresi a domain sitemap-alapú hírfolyamát.
 * @returns {Promise<null | { type:'sitemap', url, path_include, feed:{ title, link, items[] } }>}
 */
export async function discoverSitemapFeed(domain, { fetchFn = fetch, maxAgeDays = 365, limit = 8 } = {}) {
  try {
    const base = String(domain || '').replace(/\/+$/, '');
    if (!/^https:\/\//.test(base)) return null;
    // A robots.txt „Sitemap:" sorai + a szokásos hely.
    const jeloltek = new Set([base + '/sitemap.xml']);
    try {
      const robots = await szoveg(base + '/robots.txt', fetchFn);
      for (const m of robots.matchAll(/^\s*sitemap:\s*(\S+)/gim)) jeloltek.add(m[1].trim());
    } catch { /* nincs robots.txt */ }

    for (const smUrl of [...jeloltek].slice(0, 3)) {
      let entries;
      try {
        const elso = parseSitemapXml(await szoveg(smUrl, fetchFn));
        entries = elso.entries;
        if (elso.isIndex) {
          entries = [];
          for (const s of elso.entries.slice(0, 8)) {
            try { entries.push(...parseSitemapXml(await szoveg(s.loc, fetchFn)).entries); } catch { /* egy al-sitemap hibája nem állít meg */ }
          }
        }
      } catch { continue; }

      const cs = legjobbHirCsoport(entries);
      if (!cs) continue;
      // Ugyanazzal az olvasóval próbáljuk ki, amelyik élesben is futni fog:
      // cím + leírás + VALÓDI dátum az oldalakról.
      const r = await fetchSitemapFeed({ id: 'scout', url: smUrl, path_include: cs.path_include, max_age_days: maxAgeDays }, { fetchFn, limit });
      if (!r.ok || r.items.length < MIN_BEJEGYZES) continue;
      // Angolul írunk: a nem-latin betűs (kínai/japán/koreai) hírfolyam nem
      // nekünk való (09-26: a Kimi hírei CSAK kínaiul vannak).
      if (nemLatinArany(r.items) >= 0.5) continue;
      return {
        type: 'sitemap',
        url: smUrl,
        path_include: cs.path_include,
        feed: {
          title: base.replace(/^https:\/\//, ''),
          link: base,
          items: r.items.map(i => ({ title: i.title, contentSnippet: i.contentSnippet, isoDate: i.pubDate, link: i.link }))
        }
      };
    }
    return null;
  } catch {
    return null;
  }
}
