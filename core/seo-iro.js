// ===================================================================
// SEO-AGENT v2 — tiszta logika (2026-11-25) — spec: docs/superpowers/specs/2026-11-25-kereso-cim-design.md (0.)
// ===================================================================
// User 11-25: „jó lenne optimalizálni az összes mindent amit írtunk! azért volt a seo agent!
// nem azért hogy tippeket adjon!” → az agent a TELJES cikkből (nem 700 karakterből) ír
// keresőcímet + meta-leírást; a kapukat a core/seo-kapuk.js adja. Itt: a prompt, a válasz
// értelmezése és a tömeges átírás sorrendje. Az agents/seo/agent.js csak összeköt.
// ===================================================================

import { CIM_MIN, CIM_MAX, LEIRAS_MIN, LEIRAS_MAX } from './seo-kapuk.js';

const NAP = 86400000;
export const VEDETT_MAX_KOR_NAP = 14;
export const TORZS_MAX = 2500;

const sima = s => String(s || '')
  .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/[*_`#>]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

/** A cikk SEO-szempontból fontos részei a markdownból. */
export function seoBemenet(markdown) {
  const md = String(markdown || '').replace(/\r\n/g, '\n');
  const fm = (md.match(/^---\n([\s\S]*?)\n---\n?/) || [])[1] || '';
  const mezo = k => ((fm.match(new RegExp(`^${k}:\\s*(.*)$`, 'm')) || [])[1] || '').trim().replace(/^["']|["']$/g, '');
  const body = md.replace(/^---\n[\s\S]*?\n---\n?/, '');
  const roviden = sima((body.match(/^>\s*\*\*In short:\*\*\s*(.+)$/m) || [])[1] || '');
  const h2k = [...body.matchAll(/^##\s+(.+)$/gm)].map(m => sima(m[1]));
  const torzs = sima(body.replace(/^#\s+.+$/m, '').replace(/^>\s*\*\*In short:\*\*.*$/m, '')).slice(0, TORZS_MAX);
  return { cim: mezo('title'), alcim: mezo('subtitle'), roviden, h2k, torzs };
}

/** A prompt: a cikk + a szabályok (+ újrapróbánál a kapu-hibák). */
export function seoPrompt(b, { hibak = [], regi = null } = {}) {
  return `You write the search-result title and meta description for one article on AI World HQ (plain-language AI news and how-to guides for everyday people).

RULES (all required):
- Use only facts stated in the article. Do not promise anything the article does not deliver.
- seo_title: ${CIM_MIN}-${CIM_MAX} characters, a natural, grammatical English headline (not a keyword list: "Google's New Gemini Tools for Small Businesses", never "Gemini New Tools for Small Business Owners"). Put the words a searcher would type first (e.g. "Where to Find Google Meet Recordings" rather than "A Practical Guide to..."). No brand suffix — it is added automatically.
- meta_description: ${LEIRAS_MIN}-${LEIRAS_MAX} characters, one or two plain sentences that say what the reader gets.
- no prices, no plan prices, no credit counts, no dollar amounts.
- no comparisons and no superlatives: never "best", "vs", "versus", "better than", "compared", "alternative", "top 5", "#1".
- No clickbait: no exclamation marks, no ALL CAPS words, no "you won't believe", no "secret".
- No self-promotion like "with our guide" or "our step-by-step guide".
- American English spelling.
- keywords: 5-8 realistic search phrases people type.
${hibak.length ? `\nYOUR PREVIOUS ANSWER WAS REJECTED. Fix every problem:\n${hibak.map(h => '- ' + h).join('\n')}\n` : ''}${regi ? `\nCurrent search title: ${regi.cim || '-'}\nCurrent description: ${regi.leiras || '-'}\n` : ''}
ARTICLE
Title: ${b.cim}
Subtitle: ${b.alcim}
In short: ${b.roviden}
Section headings: ${b.h2k.join(' | ')}
Text: ${b.torzs}

Respond ONLY with JSON: {"seo_title": "...", "meta_description": "...", "keywords": ["...", "..."]}`;
}

/** Az AI válasza → objektum; üres / hiányos / nem JSON → null (ez NEM kapu-bukás). */
export function seoValasz(text) {
  if (!text) return null;
  let s = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const a = s.indexOf('{'), z = s.lastIndexOf('}');
  if (a === -1 || z <= a) return null;
  try {
    const j = JSON.parse(s.slice(a, z + 1));
    const seo_title = typeof j.seo_title === 'string' ? j.seo_title.trim() : '';
    const meta_description = typeof j.meta_description === 'string' ? j.meta_description.trim() : '';
    if (!seo_title || !meta_description) return null;
    const keywords = Array.isArray(j.keywords) ? j.keywords.filter(k => typeof k === 'string' && k.trim()).map(k => k.trim()) : [];
    return { seo_title, meta_description, keywords };
  } catch { return null; }
}

/** Az utolsó 30 nap látogatása angol cikkoldalanként (memory/traffic-log.json `days`). */
export function forgalom30(trafficLog, most = Date.now()) {
  const tol = new Date(most - 30 * NAP).toISOString().slice(0, 10);
  const ki = new Map();
  for (const [nap, sorok] of Object.entries(trafficLog?.days || {})) {
    if (nap < tol || !Array.isArray(sorok)) continue;
    for (const r of sorok) {
      const m = /^\/article\/([^/?#]+?)(?:\.html)?$/.exec(String(r?.path || ''));
      if (m) ki.set(m[1], (ki.get(m[1]) || 0) + (Number(r.visits) || 0));
    }
  }
  return ki;
}

/** A tömeges átírás sorrendje: v<2 cikkek a 30 napos látogatás szerint csökkenőn; a védettek külön. */
export function atirasSorrend(cikkek, forgalom, vedett) {
  const jeloltek = (cikkek || []).filter(c => c && c.slug && c.v !== 2);
  const megtartva = jeloltek.filter(c => vedett?.has(c.slug)).map(c => c.slug);
  const sor = jeloltek.filter(c => !vedett?.has(c.slug))
    .sort((x, y) => (forgalom?.get(y.slug) || 0) - (forgalom?.get(x.slug) || 0))
    .map(c => c.slug);
  return { sor, megtartva };
}

/** Friss-e a védett-lista (memory/seo-vedett.json)? Elavult listával a tömeges kör NEM indul. */
export function vedettFriss(vedettJson, most = Date.now()) {
  const at = Date.parse(vedettJson?.at || '');
  return Number.isFinite(at) && (most - at) <= VEDETT_MAX_KOR_NAP * NAP;
}

export default { seoBemenet, seoPrompt, seoValasz, forgalom30, atirasSorrend, vedettFriss };
