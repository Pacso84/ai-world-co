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

import { readFileSync, readdirSync, existsSync, writeFileSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
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

// ===================================================================
// MINŐSÉG-ÖNJAVÍTÓ (2026-07-13, user: "ne csak szóljon, javítsa is") —
// amit determinisztikusan lehet, azt KIJAVÍTJA, nem csak jelzi:
//   • csempe-kanonizálás a témalistában (innen öröklődik minden új guide-ba)
//   • cikkek/piszkozatok _meta.tool/company szinkron a frontmatterrel
//   • kanonizálás után is generikus csempe → ÜRESRE (szabálykönyv: nincs
//     egyértelmű termék → nincs chip)
// A javítások a memory/quality-fix-log.json-ba kerülnek → a napi Telegram-
// jelentés "ennyit javítottam magamtól" sort ír belőle. Ami nem javítható
// gépi biztonsággal, az marad az őr találatának (ember/AI dönt).
// Futtatás a pipeline-ban a build ELŐTT:  node core/quality-guard.js --fix
// ===================================================================
const TOPICS_PATH = join(ROOT, 'guides', 'guide-topics.json');
const FIXLOG_PATH = join(ROOT, 'memory', 'quality-fix-log.json');

function fixedChip(tool, company) {
  const c = canonicalChip(tool, company);
  // ha kanonizálva is generikus maradt → nincs chip (üres)
  if (c && !FULLFORM_OK.has(c) && GENERIC_RX.test(c)) return '';
  return c;
}

function logFixes(fixes) {
  if (!fixes.length) return;
  let log = {};
  try { log = JSON.parse(readFileSync(FIXLOG_PATH, 'utf-8')); } catch { /* első futás */ }
  const day = new Date().toISOString().slice(0, 10);
  log[day] = [...(log[day] || []), ...fixes];
  // 14 napnál régebbi bejegyzések ki
  const keep = Object.keys(log).sort().slice(-14);
  writeFileSync(FIXLOG_PATH, JSON.stringify(Object.fromEntries(keep.map(k => [k, log[k]])), null, 2), 'utf-8');
}

export function applyQualityFixes() {
  const fixes = [];
  // 1) témalista — a forrás, ahonnan az író örökli a _meta-t
  try {
    const topics = JSON.parse(readFileSync(TOPICS_PATH, 'utf-8'));
    let dirty = false;
    for (const t of topics.topics || []) {
      const want = fixedChip(t.tool, t.company);
      if (want !== strip(t.tool)) {
        fixes.push(`téma ${String(t.id).slice(0, 40)}: "${t.tool}" → "${want || '(nincs chip)'}"`);
        t.tool = want; dirty = true;
      }
    }
    if (dirty) writeFileSync(TOPICS_PATH, JSON.stringify(topics, null, 2), 'utf-8');
  } catch { /* nincs témalista */ }
  // 2) cikkek + piszkozatok — _meta szinkron a kész cikk frontmatterével
  for (const dir of [ARTICLES_DIR, join(ROOT, 'content', 'drafts')]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter(x => x.endsWith('.json'))) {
      try {
        const p = join(dir, f);
        const d = JSON.parse(readFileSync(p, 'utf-8'));
        if (d._meta?.type !== 'guide' || !d._meta?.tool) continue;
        const md = d.article_markdown || '';
        const fmCompany = strip((md.match(/^company:\s*(.*)$/m) || [])[1]);
        const fmTool = strip((md.match(/^tool:\s*(.*)$/m) || [])[1]);
        const wantCompany = fmCompany || strip(d._meta.company);
        const wantTool = fixedChip(fmTool || d._meta.tool, wantCompany);
        let dirty = false;
        if (wantTool !== strip(d._meta.tool)) {
          fixes.push(`cikk ${f.slice(14, 55)}: tool "${d._meta.tool}" → "${wantTool || '(nincs chip)'}"`);
          d._meta.tool = wantTool; dirty = true;
        }
        if (wantCompany && wantCompany !== strip(d._meta.company)) {
          fixes.push(`cikk ${f.slice(14, 55)}: company "${d._meta.company}" → "${wantCompany}"`);
          d._meta.company = wantCompany; dirty = true;
        }
        if (dirty) writeFileSync(p, JSON.stringify(d, null, 2), 'utf-8');
      } catch { /* sérült fájl — az őr úgyis jelzi */ }
    }
  }
  logFixes(fixes);
  return fixes;
}

// Közvetlen futtatás:  node core/quality-guard.js --fix
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--fix')) {
    const fixes = applyQualityFixes();
    for (const x of fixes) console.log('🔧 ' + x);
    console.log(fixes.length ? `🔧 önjavító: ${fixes.length} hiba KIJAVÍTVA` : '✅ önjavító: nincs javítanivaló');
  }
  const left = qualityFindings();
  for (const x of left) console.log('⚠️  ' + x);
  console.log(left.length ? `⚠️  ${left.length} találat maradt — ehhez ember/AI kell` : '✅ minőség-őr: minden tiszta');
  process.exit(0);
}
