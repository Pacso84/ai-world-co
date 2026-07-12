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
  'Mistral AI', 'Le Chat', 'Hugging Face', 'Project Genie', 'NotebookLM'
]);
// Generikus (nem-termék) szavak a chipben → találat
const GENERIC_RX = /\(|,| in |powered|capacit|resolution|assistant|chatbot|workspace|feature| api\b|projects?$| chat$|models?$/i;

function strip(s) { return (s || '').trim().replace(/^["']+|["']+$/g, '').trim(); }

function loadGuideChips() {
  const rows = [];
  if (!existsSync(ARTICLES_DIR)) return rows;
  for (const f of readdirSync(ARTICLES_DIR).filter(x => x.endsWith('.json'))) {
    try {
      const d = JSON.parse(readFileSync(join(ARTICLES_DIR, f), 'utf-8'));
      if (d._meta?.type !== 'guide') continue;
      const md = d.article_markdown || '';
      const tool = strip(d._meta?.tool ?? (md.match(/^tool:\s*(.*)$/m) || [])[1]);
      const company = strip(d._meta?.company ?? (md.match(/^company:\s*(.*)$/m) || [])[1]);
      if (tool) rows.push({ tool, company, file: f });
    } catch { /* skip */ }
  }
  return rows;
}

function checkChips() {
  const out = [];
  const rows = loadGuideChips();
  const tools = new Set(rows.map(r => r.tool));
  for (const { tool, company, file } of rows) {
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
