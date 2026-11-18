// ===================================================================
// HIVATALOS SÚGÓK CIKKLISTÁJA — a „🔧 Ha elakadsz” dobozhoz (2026-10-24)
// ===================================================================
//
// MIÉRT: a user: „de a megoldást az útmutatókba rakjuk! … a súgóoldalakat használni az jó ötlet!”
// A doboz minden tétele egy HIVATALOS súgócikkre hivatkozik — ehhez kell tudni, milyen cikkek vannak.
// Terv: docs/superpowers/specs/2026-10-23-utmutato-segitseg-csomag-design.md (D) ·
//       docs/superpowers/plans/2026-10-24-ha-elakadsz-2a-meres.md
//
// ENGEDÉLYLISTA: csak a user által 10-23-án jóváhagyott súgók. Új előtag CSAK user-jóváhagyással
// (11-12: 13 új súgó jóváhagyva, spec 4.1).
// 11-14: a CI-próba (futás 43634082156) szerint mind a 20 új forrás-kulcs letölthető, a Perplexity is (korábban 403).
// Élőben 10-24: az Amazon (gépi lekérésre üres oldal) NEM tölthető le → nincs
// doboz; az Apple cikklistája még nincs kiépítve (2b). A cikkek SZÖVEGÉT nem tároljuk, csak URL + cím.
// ===================================================================

export const ENGEDELY = [
  'https://help.openai.com/',
  'https://support.claude.com/', 'https://support.anthropic.com/',
  'https://support.google.com/gemini/', 'https://support.google.com/notebooklm/', 'https://support.google.com/photos/',
  // 11-05: a Google 2026-07-16-án a NotebookLM-et Gemini Notebookra nevezte át (blog.google: „NotebookLM is now
  // Gemini Notebook”); a jóváhagyott support.google.com/notebooklm/ cím azóta IDE irányít — ugyanaz a hivatalos súgó.
  'https://support.google.com/gemininotebook/',
  'https://support.microsoft.com/',
  'https://support.apple.com/',
  'https://help.mistral.ai/',
  'https://www.amazon.com/gp/help/',
  // 11-12 (spec 4.1, user-jóváhagyás): 13 új hivatalos súgó
  'https://www.perplexity.ai/help-center/',
  'https://docs.x.ai/grok/', 'https://docs.x.ai/x-subscription/',
  'https://docs.github.com/en/copilot/',
  'https://huggingface.co/docs/',
  'https://docs.cohere.com/',
  'https://duckduckgo.com/duckduckgo-help-pages/',
  // a proton.me/support/ tágabb a jóváhagyott …/support/lumo-nál — ezért az engedelyezett() a cikk útvonalát a
  // Lumóra szűkíti (SZUKITES, LUMO_UT); a Proton többi súgója (Pass, VPN, Mail…) NINCS jóváhagyva
  'https://proton.me/support/',
  'https://docs.z.ai/',
  'https://elevenlabs.io/docs/',
  'https://api-docs.deepseek.com/',
  'https://platform.kimi.ai/docs/',
  'https://platform.minimax.io/docs/',
  'https://brave.com/leo/'
];

// Szűkítés: az a jóváhagyott előtag, amely a spec-nél tágabb, csak az itt megadott útvonalmintára illő cikket engedi.
// Proton (11-14 záró átnézés): csak a Lumo — a slug a „lumo” / „lumos” szót KÖTŐJEL-határon tartalmazza
// (lumo, lumo-memory, apertus-lumo, custom-lumos), a „columbus”-féle részszó, a nyelvi mappa és az alkönyvtár nem.
// Ugyanezt használja a Lumo-index mintája is (FORRASOK.lumo) — egy szabály, egy helyen.
export const LUMO_UT = /^\/support\/(?:[a-z0-9]+-)*lumos?(?:-[a-z0-9]+)*$/;
const SZUKITES = { 'https://proton.me/support/': LUMO_UT };

/** Jóváhagyott forrás-e (pontos előtag, https)? */
export function engedelyezett(url) {
  const u = String(url || '');
  if (!ENGEDELY.some(p => u.startsWith(p))) return false;
  // NORMALIZÁLVA (független átnézés 10-24): a „..” / „%2e%2e” szakasz kiléphetne az engedélyezett előtagból;
  // port és felhasználónév nem lehet a hivatalos súgó címében
  if (/(^|\/)(\.|%2e){1,2}(\/|$|\?|#)/i.test(u.replace(/^https:\/\/[^/]+/, ''))) return false;
  try {
    const p = new URL(u);
    if (!(p.protocol === 'https:' && !p.port && !p.username && !p.password && ENGEDELY.some(e => p.href.startsWith(e)))) return false;
    // tágabb előtag → a cikk útvonalának illeszkednie kell a szűkítő mintára (pl. proton.me/support/ → csak Lumo)
    return Object.entries(SZUKITES).every(([elotag, minta]) => !p.href.startsWith(elotag) || minta.test(p.pathname));
  } catch { return false; }
}

// HTML-entitások a címekben (független átnézés 10-24: eddig csak &amp; és &#39;)
const ENTITAS = { '&amp;': '&', '&quot;': '"', '&#8217;': '’', '&rsquo;': '’', '&lsquo;': '‘', '&nbsp;': ' ', '&#x27;': "'", '&#39;': "'", '&ldquo;': '“', '&rdquo;': '”' };
const entitasMentes = s => String(s).replace(/&(?:amp|quot|#8217|rsquo|lsquo|nbsp|#x27|#39|ldquo|rdquo);/g, m => ENTITAS[m]);
const szovegbol = h => entitasMentes(String(h).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
// A gyűjtőlapok leírása tipikusan ilyen igével kezdődik („… ChatGPT Upload documents…”, „… overview Learn about…”)
const LEIRAS_KEZDET = /^(Learn|Use|Upload|Understand|Find|Get|See|Manage|Discover|Explore|How|This|Set|Create|Turn|Read|Check|Access|Connect|Ask|Start|Share|Control|Review|Customize|View|Delete|Download|Change|Choose|Add|Remove|Try|Keep)$/;
const GENERIKUS = /^(learn more( about this)?|read more|here|more|details|see more|click here|more info)$/i;

/** A horgony belső HTML-jéből a cím: címsor > legbelső blokk > hosszú szövegnél a leírás előtti rész. */
function horgonyCim(belso) {
  const cimsor = String(belso).match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
  if (cimsor) return szovegbol(cimsor[1]);
  const blokk = String(belso).match(/<(div|p)\b[^>]*>([^<]+)<\/\1>/i);   // a <span> szövegközi, nem blokk
  if (blokk && szovegbol(blokk[2]).length >= 4) return szovegbol(blokk[2]);
  const t = szovegbol(belso);
  if (t.length <= 80) return t;
  const szavak = t.split(' ');
  for (let i = 3; i < szavak.length; i++) if (LEIRAS_KEZDET.test(szavak[i])) return szavak.slice(0, i).join(' ');
  return t.slice(0, 120);
}

/** Melyik súgó(k) illenek az útmutató eszközéhez? Üres = nincs doboz. */
export function szolgaltatok(tool, company) {
  const t = String(tool || '').toLowerCase().trim(), c = String(company || '').toLowerCase().trim();
  if (!t && !c) return ['openai', 'gemini', 'claude'];
  if (t === 'chatgpt' || (c === 'openai' && !t)) return ['openai'];
  if (t === 'claude') return ['claude'];
  if (t === 'gemini') return ['gemini'];
  if (t === 'notebooklm' || t === 'gemini notebook') return ['notebooklm'];   // 2026-07-16 óta Gemini Notebook
  if (t === 'google photos') return ['photos'];
  if (c === 'microsoft' && /copilot/.test(t)) return ['microsoft'];
  if (t === 'le chat' || c === 'mistral') return ['mistral'];
  return [];
}

/** A cikk URL-jének utolsó része olvasható címmé („8555545-uploading-files” → „Uploading files”). */
export function slugCim(url) {
  const utolso = String(url || '').split('?')[0].replace(/\/+$/, '').split('/').pop() || '';
  // a Microsoft-cikkek végén álló GUID nem a cím része (független átnézés 10-24)
  const s = utolso.replace(/-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, '')
    .replace(/^\d+-/, '').replace(/-/g, ' ').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : '';
}

/** Sitemap-XML → a mintára illő (és a kizáró mintára NEM illő), engedélyezett, egyedi cikkek. */
export function sitemapCikkek(xml, minta, kizar) {
  const ki = [], latott = new Set();
  for (const m of String(xml || '').matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    const url = m[1].split('?')[0];
    if (!minta.test(url) || (kizar && kizar.test(url)) || !engedelyezett(url) || latott.has(url)) continue;
    latott.add(url);
    ki.push({ url, cim: slugCim(url) });
  }
  return ki;
}

/** HTML-linkek → a mintára illő (relatív útvonalra), egyedi cikkek; a cím a link szövege. */
export function linkCikkek(html, alap, minta, kizar) {
  const ki = [], latott = new Set();
  for (const m of String(html || '').matchAll(/<a\b[^>]*\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    let href = m[1].replace(/&amp;/g, '&');
    if (href.startsWith(alap)) href = href.slice(alap.length);
    if (!href.startsWith('/')) continue;                    // külső vagy javascript-link
    const ut = href.split('?')[0].split('#')[0];
    if (!minta.test(ut) || (kizar && kizar.test(ut))) continue;
    const url = alap + ut;
    if (!engedelyezett(url)) continue;
    const cim = horgonyCim(m[2]);
    if (cim.length < 4 && !GENERIKUS.test(cim)) continue;
    if (latott.has(url)) {
      // az általános első szöveget („Learn more”) a később jövő valódi cím felülírja — a sorrend marad
      const regi = ki.find(x => x.url === url);
      if (regi && GENERIKUS.test(regi.cim) && !GENERIKUS.test(cim) && cim.length >= 4) regi.cim = cim;
      continue;
    }
    latott.add(url);
    ki.push({ url, cim });
  }
  return ki.filter(x => !GENERIKUS.test(x.cim));   // valódi cím nélkül nem jelölt
}

/** Útvonal-lista (soronként egy „/”-rel kezdődő útvonal, pl. a GitHub pagelist) → engedélyezett, egyedi cikkek. */
export function listaCikkek(szoveg, alap, minta, kizar) {
  const ki = [], latott = new Set();
  for (const sor of String(szoveg || '').split(/\r?\n/)) {
    const ut = sor.trim().split('?')[0].split('#')[0];
    if (!ut.startsWith('/') || !minta.test(ut) || (kizar && kizar.test(ut))) continue;
    const url = alap + ut;
    if (!engedelyezett(url) || latott.has(url)) continue;
    latott.add(url);
    ki.push({ url, cim: slugCim(url) });
  }
  return ki;
}

// Duck.ai: csak AI-témájú súgócikkek (11-14 mérés a sitemapból): az AI-funkciók és a „duckai” / „duck-ai” mappák,
// plusz néhány gyökérben álló, AI-ról szóló cikk és az AI-alapú válaszok cikke.
const DUCKAI_MINTA = new RegExp('/duckduckgo-help-pages/(?:' + [
  'ai-features/', 'duckai(?:/|$)', 'privacy-pro/duck-ai/', 'privacy-pro/duckai$',
  'choosing-the-best-model-for-my-duckai-chat$', 'optional-ai$', 'what-information-does-duckai-share-with-model-providers$',
  'how-does-duckduckgo-run-duckai-experiments-while-protecting-my-privacy$', 'results/ai-assisted-answers$'
].join('|') + ')');

// Szolgáltatónkénti forrás — élőben ellenőrizve 10-24 (darabszám akkor).
export const FORRASOK = {
  claude: [{ sitemap: 'https://support.claude.com/sitemap.xml', minta: /\/en\/articles\// }],                    // 364
  mistral: [{ sitemap: 'https://help.mistral.ai/sitemap.xml', minta: /\/en\/articles\// }],                        // 43
  openai: [{ lap: 'https://help.openai.com/en/collections/3742473-chatgpt', alap: 'https://help.openai.com', minta: /^\/en\/articles\/\d+/ }], // 197
  gemini: [{ lap: 'https://support.google.com/gemini/?hl=en', alap: 'https://support.google.com', minta: /^\/gemini\/answer\/\d+$/ }],          // 102
  photos: [{ lap: 'https://support.google.com/photos/?hl=en', alap: 'https://support.google.com', minta: /^\/photos\/answer\/\d+$/ }],          // 77
  // 11-05: EDDIG HIÁNYZOTT — a szolgaltatok() 'notebooklm'-et adott, de itt nem volt sora → üres lista, és a riport
  // naponta „kimaradt: index ×3”-at írt (mindhárom NotebookLM-útmutató). A súgó 07-16 óta a gemininotebook/ alatt van.
  notebooklm: [{ lap: 'https://support.google.com/gemininotebook/?hl=en', alap: 'https://support.google.com', minta: /^\/gemininotebook\/answer\/\d+$/ }],
  microsoft: [
    { sitemap: 'https://support.microsoft.com/_sitemaps/microsoft-copilot_en-us_1.xml', minta: /\/en-us\// },        // 10
    { sitemap: 'https://support.microsoft.com/_sitemaps/microsoft-365-copilot_en-us_1.xml', minta: /\/en-us\// }     // 220
  ],
  // 11-12 (spec 4.1) — a darabszám a 11-14-i helyi mérés; a CI-próba igazolja
  perplexity: [{ sitemap: 'https://www.perplexity.ai/help-center/sitemap.xml', minta: /\/help-center\/en\/articles\// }],      // 232
  grok: [{ sitemap: 'https://docs.x.ai/sitemap.xml', minta: /docs\.x\.ai\/(grok|x-subscription)\// }],                         // 42
  githubcopilot: [{ lista: 'https://docs.github.com/api/pagelist/en/free-pro-team@latest', alap: 'https://docs.github.com', minta: /^\/en\/copilot\// }], // 571
  huggingface: [{ lap: 'https://huggingface.co/docs', alap: 'https://huggingface.co', minta: /^\/docs\/[a-z0-9-]+$/ }],         // 31 gyűjtőlap
  cohere: [{ sitemap: 'https://docs.cohere.com/sitemap.xml', minta: /docs\.cohere\.com\/docs\//, kizar: /\/reference\// }],
  // 11-14 mérés: a régi minta (ai-features|duck-ai) csak 2 cikket talált, mert a Duck.ai-cikkek több helyen laknak:
  // duckai/…, privacy-pro/duck-ai/… és néhány gyökér-cikk. Az új minta csak az AI-témájúakat engedi át (11-14 mért: 32 cikk);
  // a VPN/adatvédelem/e-mail cikkek, a duckassistbot és az AI-képek szűrése kimarad.
  duckai: [{ sitemap: 'https://duckduckgo.com/duckduckgo-help-pages/sitemap.xml', minta: DUCKAI_MINTA }],
  // 11-14 mérés: a proton.me/support/lumo lap csak a saját nyelvi változatait linkeli (cikklistát nem) → a proton.me/support
  // sitemapjából szűrünk: csak a gyökér-szintű, a „lumo” szót kötőjel-határon tartalmazó angol cikkek (LUMO_UT) (11-14 mért: 18 cikk; nyelvi változat és más termék nem).
  lumo: [{ sitemap: 'https://proton.me/support/sitemap.xml', minta: new RegExp('^https://proton\\.me' + LUMO_UT.source.slice(1)) }],
  zai: [{ sitemap: 'https://docs.z.ai/sitemap.xml', minta: /docs\.z\.ai\//, kizar: /\/api-reference\// }],
  elevenlabs: [{ sitemap: 'https://elevenlabs.io/docs/sitemap-en.xml', minta: /elevenlabs\.io\/docs\//, kizar: /\/docs\/(api-reference|developers|cookbooks?|sdks?)\// }],
  deepseek: [{ sitemap: 'https://api-docs.deepseek.com/sitemap.xml', minta: /api-docs\.deepseek\.com\//, kizar: /\/api\// }],
  kimi: [{ lap: 'https://platform.kimi.ai/docs', alap: 'https://platform.kimi.ai', minta: /^\/docs\/[a-z0-9\/-]+$/, kizar: /\/(_mintlify|mintlify-assets|api)\// }],
  minimax: [{ lap: 'https://platform.minimax.io/docs', alap: 'https://platform.minimax.io', minta: /^\/docs\/[a-z0-9\/-]+$/, kizar: /\/api-reference\// }], // helyben 0 — a CI-próba dönt
  braveleo: [{ egy: 'https://brave.com/leo/', cim: 'Brave Leo', minta: /./ }]    // egyetlen lap, letöltés nélkül
};
export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

/** Egy szolgáltató cikklistája. Hibánál üres lista (a futás nem áll meg). */
export async function indexLetolt(szolg, fetchFn = fetch) {
  const ki = [];
  for (const f of FORRASOK[szolg] || []) {
    // egy-lapos forrás: nincs mit letölteni. `termekoldal: true` = a lap a TERMÉK bemutatója, nem súgócikk: csak azt igazolja, hogy a funkció
    // létezik, használati esetet nem (core/sugo-horgony.js: ilyen forrásból csak „Getting started with …” bevezető horgonyozható; 11-17 mérés)
    if (f.egy) { ki.push({ url: f.egy, cim: f.cim, termekoldal: true }); continue; }
    try {
      const r = await fetchFn(f.sitemap || f.lap || f.lista, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' }, signal: AbortSignal.timeout(30000) });
      if (!r.ok) continue;
      const t = await r.text();
      ki.push(...(f.sitemap ? sitemapCikkek(t, f.minta, f.kizar)
        : f.lista ? listaCikkek(t, f.alap, f.minta, f.kizar)
        : linkCikkek(t, f.alap, f.minta, f.kizar)));
    } catch { /* a következő forrás még mehet */ }
  }
  return ki;
}

export default { ENGEDELY, engedelyezett, szolgaltatok, slugCim, sitemapCikkek, linkCikkek, listaCikkek, indexLetolt };
