// ===================================================================
// HIVATALOS SÚGÓK CIKKLISTÁJA — a „🔧 Ha elakadsz” dobozhoz (2026-10-24)
// ===================================================================
//
// MIÉRT: a user: „de a megoldást az útmutatókba rakjuk! … a súgóoldalakat használni az jó ötlet!”
// A doboz minden tétele egy HIVATALOS súgócikkre hivatkozik — ehhez kell tudni, milyen cikkek vannak.
// Terv: docs/superpowers/specs/2026-10-23-utmutato-segitseg-csomag-design.md (D) ·
//       docs/superpowers/plans/2026-10-24-ha-elakadsz-2a-meres.md
//
// ENGEDÉLYLISTA: csak a user által 10-23-án jóváhagyott súgók. Új előtag CSAK user-jóváhagyással.
// Élőben 10-24: a Perplexity (403) és az Amazon (gépi lekérésre üres oldal) NEM tölthető le → nincs
// doboz; az Apple cikklistája még nincs kiépítve (2b). A cikkek SZÖVEGÉT nem tároljuk, csak URL + cím.
// ===================================================================

export const ENGEDELY = [
  'https://help.openai.com/',
  'https://support.claude.com/', 'https://support.anthropic.com/',
  'https://support.google.com/gemini/', 'https://support.google.com/notebooklm/', 'https://support.google.com/photos/',
  'https://support.microsoft.com/',
  'https://support.apple.com/',
  'https://help.mistral.ai/',
  'https://www.amazon.com/gp/help/'
];

/** Jóváhagyott forrás-e (pontos előtag, https)? */
export function engedelyezett(url) {
  const u = String(url || '');
  return ENGEDELY.some(p => u.startsWith(p));
}

/** Melyik súgó(k) illenek az útmutató eszközéhez? Üres = nincs doboz. */
export function szolgaltatok(tool, company) {
  const t = String(tool || '').toLowerCase().trim(), c = String(company || '').toLowerCase().trim();
  if (!t && !c) return ['openai', 'gemini', 'claude'];
  if (t === 'chatgpt' || (c === 'openai' && !t)) return ['openai'];
  if (t === 'claude') return ['claude'];
  if (t === 'gemini') return ['gemini'];
  if (t === 'notebooklm') return ['notebooklm'];
  if (t === 'google photos') return ['photos'];
  if (c === 'microsoft' && /copilot/.test(t)) return ['microsoft'];
  if (t === 'le chat' || c === 'mistral') return ['mistral'];
  return [];
}

/** A cikk URL-jének utolsó része olvasható címmé („8555545-uploading-files” → „Uploading files”). */
export function slugCim(url) {
  const utolso = String(url || '').split('?')[0].replace(/\/+$/, '').split('/').pop() || '';
  const s = utolso.replace(/^\d+-/, '').replace(/-/g, ' ').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : '';
}

/** Sitemap-XML → a mintára illő, engedélyezett, egyedi cikkek. */
export function sitemapCikkek(xml, minta) {
  const ki = [], latott = new Set();
  for (const m of String(xml || '').matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    const url = m[1].split('?')[0];
    if (!minta.test(url) || !engedelyezett(url) || latott.has(url)) continue;
    latott.add(url);
    ki.push({ url, cim: slugCim(url) });
  }
  return ki;
}

/** HTML-linkek → a mintára illő (relatív útvonalra), egyedi cikkek; a cím a link szövege. */
export function linkCikkek(html, alap, minta) {
  const ki = [], latott = new Set();
  for (const m of String(html || '').matchAll(/<a\b[^>]*\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    let href = m[1].replace(/&amp;/g, '&');
    if (href.startsWith(alap)) href = href.slice(alap.length);
    if (!href.startsWith('/')) continue;                    // külső vagy javascript-link
    const ut = href.split('?')[0].split('#')[0];
    if (!minta.test(ut)) continue;
    const url = alap + ut;
    if (!engedelyezett(url) || latott.has(url)) continue;
    const cim = m[2].replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&#x27;/g, "'").replace(/\s+/g, ' ').trim();
    if (cim.length < 4) continue;
    latott.add(url);
    ki.push({ url, cim });
  }
  return ki;
}

// Szolgáltatónkénti forrás — élőben ellenőrizve 10-24 (darabszám akkor).
const FORRASOK = {
  claude: [{ sitemap: 'https://support.claude.com/sitemap.xml', minta: /\/en\/articles\// }],                    // 364
  mistral: [{ sitemap: 'https://help.mistral.ai/sitemap.xml', minta: /\/en\/articles\// }],                        // 43
  openai: [{ lap: 'https://help.openai.com/en/collections/3742473-chatgpt', alap: 'https://help.openai.com', minta: /^\/en\/articles\/\d+/ }], // 197
  gemini: [{ lap: 'https://support.google.com/gemini/?hl=en', alap: 'https://support.google.com', minta: /^\/gemini\/answer\/\d+$/ }],          // 102
  photos: [{ lap: 'https://support.google.com/photos/?hl=en', alap: 'https://support.google.com', minta: /^\/photos\/answer\/\d+$/ }],          // 77
  microsoft: [
    { sitemap: 'https://support.microsoft.com/_sitemaps/microsoft-copilot_en-us_1.xml', minta: /\/en-us\// },        // 10
    { sitemap: 'https://support.microsoft.com/_sitemaps/microsoft-365-copilot_en-us_1.xml', minta: /\/en-us\// }     // 220
  ]
};
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

/** Egy szolgáltató cikklistája. Hibánál üres lista (a futás nem áll meg). */
export async function indexLetolt(szolg, fetchFn = fetch) {
  const ki = [];
  for (const f of FORRASOK[szolg] || []) {
    try {
      const r = await fetchFn(f.sitemap || f.lap, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' }, signal: AbortSignal.timeout(30000) });
      if (!r.ok) continue;
      const t = await r.text();
      ki.push(...(f.sitemap ? sitemapCikkek(t, f.minta) : linkCikkek(t, f.alap, f.minta)));
    } catch { /* a következő forrás még mehet */ }
  }
  return ki;
}

export default { ENGEDELY, engedelyezett, szolgaltatok, slugCim, sitemapCikkek, linkCikkek, indexLetolt };
