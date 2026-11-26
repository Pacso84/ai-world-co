// ===================================================================
// SEO-AGENT v2 — tiszta logika (2026-11-25) — spec: docs/superpowers/specs/2026-11-25-kereso-cim-design.md (0.)
// ===================================================================
// User 11-25: „jó lenne optimalizálni az összes mindent amit írtunk! azért volt a seo agent!
// nem azért hogy tippeket adjon!” → az agent a TELJES cikkből (nem 700 karakterből) ír
// keresőcímet + meta-leírást; a kapukat a core/seo-kapuk.js adja. Itt: a prompt, a válasz
// értelmezése és a tömeges átírás sorrendje. Az agents/seo/agent.js csak összeköt.
// ===================================================================

import { CIM_MIN, CIM_MAX, LEIRAS_MIN, LEIRAS_MAX } from './seo-kapuk.js';
import { normal, szavak, OSSZEHASONLITAS_RX, TENY_RX, TILTOTT_RX } from './trend-kutato.js';

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

// ── GOOGLE-KERESŐJAVASLATOK (user 11-25: „de a google trends is kéne. nem?” → „igen”) ──
// A Trends API zárt alfa → helyette a Google automatikus kiegészítése (suggestqueries), amit a
// core/trend-kutato.js googleJavaslatok() már ingyen használ. Cikkenként 1–2 rövid „mag” megy ki,
// a visszajött valódi keresésekből CSAK az marad, amit a cikk TÉNYLEG lefed (minden tartalmas
// szava benne van a cikkben) — különben a cím olyat ígérne, amit a szöveg nem ad (style-guide §3b).
export const MAG_MAX_SZO = 4;
export const KERESES_MAX = 8;

/** Cikkenként legfeljebb 2 lekérdezés-mag: a 2 legrövidebb régi kulcsszó (≤4 szó), ennek híján a cím eleje. */
export function javaslatMagok({ keywords = [], cim = '' } = {}) {
  const lat = new Set(), ki = [];
  for (const k of (Array.isArray(keywords) ? keywords : []).map(normal).filter(Boolean)) {
    if (k.split(' ').length > MAG_MAX_SZO || lat.has(k)) continue;
    lat.add(k); ki.push(k);
  }
  ki.sort((a, b) => a.length - b.length);
  if (ki.length) return ki.slice(0, 2);
  const c = normal(String(cim).replace(/^\s*how\s+to\s+/i, '')).replace(/[^a-z0-9+\-' ]+/g, ' ').replace(/\s+/g, ' ').trim();
  return c ? [c.split(' ').slice(0, MAG_MAX_SZO).join(' ')] : [];
}

// Navigációs / helyi keresés (letöltés, belépés, „near me”, egyetlen betűpár mint az „lm”): nem a cikk
// témája, a címbe nem való. 11-26 mintában mérve: „qwen chat download”, „weekend getaways near me”, „gemini notes lm”.
export const NAVIGACIO_RX = /\b(download\w*|apk|log ?in|sign ?(in|up)|near me)\b|\s(?!(ai|go|do|me|up|in|on|to|it|is|us|tv|pc|my|of|or|an|as|at|be|by|no|so|we|uk|id|os)$)[a-z]{2}$/i;

/** Egy szó szerepel-e a cikk szóhalmazában (egyes/többes szám tűréssel). */
const lefedett = (w, h) => h.has(w) || h.has(w + 's') || h.has(w + 'es')
  || (w.endsWith('es') && h.has(w.slice(0, -2))) || (w.endsWith('s') && h.has(w.slice(0, -1)));

/** A Google-javaslatokból a cikkhez illő valódi keresések: lefedett, nem ár/összehasonlítás/tiltott, ismétlés nélkül, max 8. */
export function hasznosKeresesek(talalat, cikkSzoveg, max = KERESES_MAX) {
  const h = new Set(normal(cikkSzoveg).replace(/[^a-z0-9 ]+/g, ' ').split(' ').filter(Boolean));
  const lat = new Set(), ki = [];
  for (const t of talalat || []) {
    const k = normal(t?.kifejezes);
    if (!k || lat.has(k)) continue;
    lat.add(k);
    if (OSSZEHASONLITAS_RX.test(k) || TENY_RX.test(k) || TILTOTT_RX.test(k) || NAVIGACIO_RX.test(k)) continue;
    const sz = [...szavak(k)];
    if (!sz.length || !sz.every(w => lefedett(w, h))) continue;
    ki.push(k);
    if (ki.length >= max) break;
  }
  return ki;
}

/** A prompt: a cikk + a szabályok (+ újrapróbánál a kapu-hibák; + a valódi Google-keresések, ha vannak). */
export function seoPrompt(b, { hibak = [], regi = null, keresesek = [] } = {}) {
  return `You write the search-result title and meta description for one article on AI World HQ (plain-language AI news and how-to guides for everyday people).

RULES (all required):
- Use only facts stated in the article. Do not promise anything the article does not deliver.
- seo_title: ${CIM_MIN}-${CIM_MAX} characters, a natural, grammatical English headline (not a keyword list: "Google's New Gemini Tools for Small Businesses", never "Gemini New Tools for Small Business Owners"). Put the words a searcher would type first (e.g. "Where to Find Google Meet Recordings" rather than "A Practical Guide to..."). No brand suffix — it is added automatically.
- Keep every product or tool name from the article title in seo_title (for example "Hugging Face", "Qwen", "GitHub Copilot") — people search for the name.
- meta_description: ${LEIRAS_MIN}-${LEIRAS_MAX} characters, one or two plain sentences that say what the reader gets.
- no prices, no plan prices, no credit counts, no dollar amounts.
- no comparisons and no superlatives: never "best", "vs", "versus", "better than", "compared", "alternative", "top 5", "#1".
- No clickbait: no exclamation marks, no ALL CAPS words, no "you won't believe", no "secret".
- No self-promotion like "with our guide" or "our step-by-step guide".
- American English spelling.
- keywords: 5-8 realistic search phrases people type.
${keresesek.length ? `\nWhat people type into Google (real autocomplete searches). Use these words in the title or description only if the article covers them; never add a topic the article does not explain:\n${keresesek.map(k => '- ' + k).join('\n')}\n` : ''}${hibak.length ? `\nYOUR PREVIOUS ANSWER WAS REJECTED. Fix every problem:\n${hibak.map(h => '- ' + h).join('\n')}\n` : ''}${regi ? `\nCurrent search title: ${regi.cim || '-'}\nCurrent description: ${regi.leiras || '-'}\n` : ''}
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

// ── TÖMEGES KÖR ŐRSZEME (11-26) — „feltételes ágban ülő lépés = néma halál”: a CI-lépés MINDEN
// futásban ír (memory/seo-tomeges.json), a napi riport ebből mondja meg, halad-e a kör. ──

/** Az őrszem új állapota: ugyanazon a napon a számok összeadódnak, új napon újraindulnak. */
export function seoOrszem(regi, f, at = new Date().toISOString()) {
  const uj = regi && regi.nap === f.nap && !regi.kikapcsolva;
  const n = k => (uj ? Number(regi[k]) || 0 : 0) + (Number(f[k]) || 0);
  if (f.kikapcsolva) return { at, nap: f.nap, kikapcsolva: true };
  return { at, nap: f.nap, kesz: n('kesz'), bukott: n('bukott'), hiba: n('hiba'), maradt: Number(f.maradt) || 0,
    futas: (uj ? Number(regi.futas) || 0 : 0) + 1, javaslatHiba: f.javaslatHiba || '' };
}

/** A napi Telegram-riport sora ('' = nincs mit mondani: a kör kész, és ma nem volt munka). */
export function seoRiportSor(e, ma) {
  if (!e) return '';
  if (e.kikapcsolva) return '🔎 SEO tömeges kör: kikapcsolva (core/seo-kapuk.js SEO_ELES_BE=false)';
  if (e.nap !== ma) return (Number(e.maradt) || 0) > 0 ? `⚠️ 🔎 SEO tömeges kör: ma nem futott (utolsó: ${e.nap}, hátra ${e.maradt} régi cikk)` : '';
  const kesz = Number(e.kesz) || 0, bukott = Number(e.bukott) || 0, hiba = Number(e.hiba) || 0;
  if (!kesz && !bukott && !hiba) return '';
  return `🔎 SEO: ma ${kesz} régi cikk új keresőcímet kapott` + (bukott ? ` · ${bukott} kapun elbukott (a régi marad)` : '')
    + (hiba ? ` · ${hiba} válasz nélkül` : '') + ` · hátra ${Number(e.maradt) || 0}`
    + (e.javaslatHiba ? ` · ⚠️ Google-javaslat kiesett: ${String(e.javaslatHiba).slice(0, 60)}` : '');
}

export default { seoBemenet, seoPrompt, seoValasz, forgalom30, atirasSorrend, vedettFriss, javaslatMagok, hasznosKeresesek, seoOrszem, seoRiportSor };
