// ===================================================================
// MINŐSÉG-ŐR — a kézi ellenőrzések gépesítve (user 2026-07-12:
// "ezeket is tudja a cégünk, építsd be")
// ===================================================================
//
// Három ellenőrzés, amit addig kézzel futtattunk:
//   1) CHIP-SZABÁLY: a guide-ok tool mezője csak tiszta terméknév lehet
//      (szabálykönyv 7. szakasz) — generikus kifejezés / zárójel / lista /
//      cégnév-duplázás / két-néven-ugyanaz következetlenség = találat.
//   2) DUPLIKÁLT LINK: a tools-oldalak "Hivatalos oldalak" soraiban egy
//      webcím csak egyszer szerepelhet (build utáni HTML-ből).
//   3) A hivatalos-link hiányt a napi jelentés már figyeli (tool-links.json).
//
// Használat:  import { qualityFindings } from '../core/quality-guard.js';
//   → string-lista; üres = minden rendben. CSAK jelez, semmit nem módosít.
// A check-i18n (minden build után) kiírja, a napi Telegram-jelentés összegzi.
// ===================================================================

import { readFileSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ARTICLES_DIR = join(ROOT, 'content', 'articles');
const PUBLIC_DIR = join(ROOT, 'website', 'public');

// Teljes-alakú hivatalos nevek (szabálykönyv 7. szakasz kivétel-listája):
// ezek NEM cégnév-duplázások / nem rövidítendők.
const FULLFORM_OK = new Set([
  'GitHub Copilot', 'Meta AI', 'Apple Intelligence', 'Alibaba Cloud',
  'Mistral AI', 'Le Chat', 'Hugging Face', 'Project Genie', 'NotebookLM',
  'Google Photos'
]);
// Generikus (nem-termék) szavak a chipben → találat
const GENERIC_RX = /\(|,| in |powered|capacit|resolution|assistant|chatbot|workspace|feature| api\b|projects?$| chat$|models?$| llm\b| ai$/i;

function strip(s) { return (s || '').trim().replace(/^["']+|["']+$/g, '').trim(); }

// GÉPI KANONIZÁLÁS (2026-07-13): a csempe-nevet KÓD teszi rendbe, nem prompt —
// a párosító AI a kérés ellenére is írt "NVIDIA ChatRTX"-et. Rétegek sorban:
//   1) páros-térkép (cég+eszköz): a "Copilot" a GitHub szekcióban = GitHub Copilot
//   2) név-térkép: a 2026-07-12-i nagytakarítás ismert döntései
//   3) FULLFORM-csonkolás: "Hugging Face Spaces" → "Hugging Face" (jövőállóan)
//   4) cégnév-előtag levágása — DE generikus maradék ("LLM", "AI") esetén nem
const PAIR_ALIAS = { 'github|copilot': 'GitHub Copilot' };
const NAME_ALIAS = {
  'nvidia chatrtx': 'ChatRTX', 'microsoft copilot': 'Copilot',
  'qwen chat': 'Qwen', 'claude projects': 'Claude',
  'deepseek chat': 'DeepSeek', 'deepseek llm': 'DeepSeek',
  'amazon alexa': 'Alexa+', 'amazon alexa+': 'Alexa+', 'alexa': 'Alexa+',
  'google gemini': 'Gemini', 'openai chatgpt': 'ChatGPT',
  'alibaba cloud ai': 'Alibaba Cloud'
};
const GENERIC_REST_RX = /^(ai|llm|chat|app|api|bot|cloud|cloud ai|assistant|studio|models?)$/i;
export function canonicalChip(tool, company) {
  tool = strip(tool); company = strip(company);
  if (!tool) return tool;
  const pair = PAIR_ALIAS[(company + '|' + tool).toLowerCase()];
  if (pair) return pair;
  const alias = NAME_ALIAS[tool.toLowerCase()];
  if (alias) return alias;
  if (FULLFORM_OK.has(tool)) return tool;
  for (const full of FULLFORM_OK)
    if (tool.toLowerCase().startsWith(full.toLowerCase() + ' ')) return full;
  if (company && tool.toLowerCase().startsWith(company.toLowerCase() + ' ')) {
    const rest = tool.slice(company.length + 1).trim();
    if (rest.length >= 3 && !GENERIC_REST_RX.test(rest)) return rest;   // "NVIDIA ChatRTX"→"ChatRTX"
  }
  return tool;   // amit nem értünk, azt NEM bántjuk — majd az őr jelzi
}

function loadGuideChips() {
  const rows = [];
  if (!existsSync(ARTICLES_DIR)) return rows;
  for (const f of readdirSync(ARTICLES_DIR).filter(x => x.endsWith('.json'))) {
    try {
      const d = JSON.parse(readFileSync(join(ARTICLES_DIR, f), 'utf-8'));
      if (d._meta?.type !== 'guide') continue;
      const md = d.article_markdown || '';
      // A frontmatter az elsődleges (az író VÉGSŐ döntése — ezt mutatja az oldal),
      // a _meta (a párosító terve) csak tartalék; az eltérésüket külön jelezzük.
      const fmCompany = strip((md.match(/^company:\s*(.*)$/m) || [])[1]);
      const company = fmCompany || strip(d._meta?.company);
      // Kanonizált értékeket hasonlítunk — a megjelenítés is ezt mutatja
      const fmTool = canonicalChip((md.match(/^tool:\s*(.*)$/m) || [])[1], company);
      const metaTool = canonicalChip(d._meta?.tool, company);
      const tool = fmTool || metaTool;
      if (tool) rows.push({ tool, company, fmTool, metaTool, file: f });
    } catch { /* skip */ }
  }
  return rows;
}

function checkChips() {
  const out = [];
  const rows = loadGuideChips();
  const tools = new Set(rows.map(r => r.tool));
  for (const { tool, company, fmTool, metaTool, file } of rows) {
    // Terv ↔ kész cikk eltérés: a párosító mást tervezett, mint amiről az író írt
    if (fmTool && metaTool && fmTool !== metaTool)
      out.push(`CHIP terv≠cikk: _meta "${metaTool}" de a cikk "${fmTool}" (${file.slice(0, 50)})`);
    if (FULLFORM_OK.has(tool)) continue;
    if (GENERIC_RX.test(tool)) out.push(`CHIP generikus/toldalékos: "${tool}" (${file.slice(0, 50)})`);
    else if (company && tool.toLowerCase().startsWith(company.toLowerCase() + ' '))
      out.push(`CHIP cégnév-duplázás: "${tool}" a(z) ${company} szekcióban (${file.slice(0, 50)})`);
  }
  // Két néven ugyanaz: az egyik tool a másik előtagja (Qwen vs "Qwen Chat")
  for (const a of tools) for (const b of tools) {
    if (a !== b && b.toLowerCase().startsWith(a.toLowerCase() + ' ') && !FULLFORM_OK.has(b))
      out.push(`CHIP következetlenség: "${a}" ÉS "${b}" egyszerre létezik — egységesíteni`);
  }
  return [...new Set(out)];
}

function checkDupLinks() {
  const out = [];
  for (const lang of ['', 'hu', 'es', 'de', 'fr']) {
    const p = join(PUBLIC_DIR, lang, 'tools.html');
    if (!existsSync(p)) continue;
    const h = readFileSync(p, 'utf-8');
    const rows = [...h.matchAll(/official-row__l">([^<]+)<\/span>([\s\S]*?)<\/p>/g)];
    rows.forEach((r) => {
      const urls = [...r[2].matchAll(/href="([^"]+)"/g)].map(m => m[1].replace(/\/+$/, '').toLowerCase());
      if (new Set(urls).size !== urls.length)
        out.push(`DUPLIKÁLT hivatalos link (${lang || 'en'}/tools.html): ${urls.join(', ').slice(0, 90)}`);
    });
  }
  return out;
}

export function qualityFindings() {
  try { return [...checkChips(), ...checkDupLinks()]; }
  catch (e) { return ['MINŐSÉG-ŐR HIBA: ' + e.message.slice(0, 80)]; }
}
