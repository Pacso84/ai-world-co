// ===================================================================
// TÉNY-ELLENŐRZŐ AGENT (Fact-check / Frissesség-őr)
// ===================================================================
//
// FELADAT:
//   A MÁR PUBLIKÁLT útmutatókat újraellenőrzi, hogy ne állítsunk valótlant.
//   Ha egy cég kivesz/megváltoztat egy funkciót (pl. képszerkesztés),
//   de mi írtunk hozzá útmutatót, akkor a VALÓTLANNÁ vált részt
//   ELTÁVOLÍTJA vagy LÁGYÍTJA (feltételessé teszi), a többit megtartja —
//   majd a javított útmutató VISSZAMEGY az Ellenőrző igazság-kapujára
//   ("ellenőrizzük vissza"). Ha a teljes útmutató tárgytalan, leveszi és
//   emberhez eszkalál.
//
// HOGYAN TUDJA, MI VÁLTOZOTT:
//   1) --claim "<bejelentett változás>"  (ember/hír megadja) — legbiztosabb
//   2) frissesség-átvizsgálás: a friss HIVATALOS hírekkel (scraper/cikkek)
//      veti össze az adott cég útmutatóit; a kockázatos/idő-érzékeny
//      állításokat lágyítja ("ha elérhető, keresd a…").
//   ALAPELV: amit nem tud biztosan, azt INKÁBB lágyítja, sosem talál ki.
//
// FUTTATÁS:
//   node agents/fact-check/agent.js --claim "OpenAI removed image editing from ChatGPT free tier" --company OpenAI
//   node agents/fact-check/agent.js --id chatgpt-voice
//   node agents/fact-check/agent.js                 -- frissesség-átvizsgálás (mind)
//   node agents/fact-check/agent.js --dry           -- csak megmutatja, nem ír
// ===================================================================

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ask } from '../../core/ai-router.js';
import { remember } from '../../core/memory-manager.js';
import { message } from '../../core/ops.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const ARTICLES_DIR = join(ROOT, 'content', 'articles');
const DRAFTS_DIR = join(ROOT, 'content', 'drafts');
const SHARED_DIR = join(ROOT, 'shared');
const LOGS_DIR = join(ROOT, 'logs');
const AGENT_NAME = 'fact-check';

function parseArgs() {
  const a = process.argv.slice(2);
  const p = { claim: null, company: null, tool: null, id: null, dry: false, limit: 20 };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--claim' && a[i + 1]) p.claim = a[++i];
    else if (a[i] === '--company' && a[i + 1]) p.company = a[++i];
    else if (a[i] === '--tool' && a[i + 1]) p.tool = a[++i];
    else if (a[i] === '--id' && a[i + 1]) p.id = a[++i];
    else if (a[i] === '--limit' && a[i + 1]) p.limit = parseInt(a[++i], 10) || 20;
    else if (a[i] === '--dry') p.dry = true;
  }
  return p;
}

function loadBrandContext() {
  const parts = [];
  for (const f of ['style-guide.md', 'legal-rules.md']) {
    const path = join(SHARED_DIR, f);
    if (existsSync(path)) parts.push(`=== ${f} ===\n${readFileSync(path, 'utf-8')}`);
  }
  return parts.join('\n\n');
}

// Publikált útmutatók betöltése (szűrve: company/tool/id/claim-cég)
function loadGuides(args) {
  if (!existsSync(ARTICLES_DIR)) return [];
  const guides = [];
  for (const f of readdirSync(ARTICLES_DIR).filter(x => x.endsWith('.json'))) {
    try {
      const d = JSON.parse(readFileSync(join(ARTICLES_DIR, f), 'utf-8'));
      if (d._meta?.type !== 'guide') continue;
      guides.push({ file: f, data: d });
    } catch {}
  }
  let list = guides;
  if (args.id) list = list.filter(g => g.data._meta?.guide_topic_id === args.id);
  if (args.company) list = list.filter(g => (g.data._meta?.company || '').toLowerCase() === args.company.toLowerCase());
  if (args.tool) list = list.filter(g => (g.data._meta?.tool || '').toLowerCase() === args.tool.toLowerCase());
  // --claim cég-szűrés: ha a claim megemlít egy általunk ismert céget, arra szűkítünk
  if (args.claim && !args.company && !args.tool && !args.id) {
    const claimLc = args.claim.toLowerCase();
    const mentioned = [...new Set(guides.map(g => g.data._meta?.company).filter(Boolean))]
      .filter(c => claimLc.includes(c.toLowerCase()));
    if (mentioned.length) list = list.filter(g => mentioned.includes(g.data._meta?.company));
  }
  return list.slice(0, args.limit);
}

// Friss HIVATALOS jelek: a legutóbbi hírek/scraper-témák címei az adott cégről
function recentSignals(company) {
  if (!company) return [];
  const out = [];
  const scan = (dir) => {
    if (!existsSync(dir)) return;
    for (const f of readdirSync(dir).filter(x => x.endsWith('.json'))) {
      try {
        const d = JSON.parse(readFileSync(join(dir, f), 'utf-8'));
        if (d._meta?.type === 'guide') continue; // útmutató nem "jel"
        const t = d.original_title || d.title || '';
        const sub = (d.article_markdown || '').slice(0, 0); // cím elég
        if (t && t.toLowerCase().includes(company.toLowerCase())) out.push(t);
      } catch {}
    }
  };
  scan(ARTICLES_DIR); scan(DRAFTS_DIR);
  return [...new Set(out)].slice(0, 6);
}

function hasGuideStructure(md) {
  if (!md) return false;
  const fm = md.trimStart().startsWith('---');
  const impact = /what this means for you/i.test(md);
  const steps = (md.match(/^##\s*Step\s*\d/gim) || []).length >= 2;
  return fm && impact && steps;
}

function parseJson(text) {
  if (!text) return null;
  let t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s === -1 || e === -1) return null;
  try { return JSON.parse(t.slice(s, e + 1)); } catch { return null; }
}

const SYSTEM_PROMPT = `You are the Fact-Check / Freshness agent for AI World Co. Your ONLY job is truthfulness: make sure a published step-by-step guide does not state anything that is no longer true.

A company may have REMOVED or CHANGED a feature after we published a guide about it. Find any claim that is now FALSE, removed, or that you cannot stand behind, and either REMOVE it or SOFTEN it into a conditional ("if it's available, look for…"). Keep everything that is still accurate. NEVER invent new facts. When unsure, SOFTEN rather than assert.

If only parts are affected: return the FULL corrected guide (same step-by-step format: YAML frontmatter with category: "guide", "## Before you start", 2-6 "## Step N — …", "## Common mistakes", "## What this means for you", "## Try it now").
If the WHOLE guide teaches a feature that no longer exists at all: verdict "unpublish".
If nothing needs changing: verdict "ok".

Output ONLY JSON (no prose, no code fence):
{"verdict":"ok"|"fix"|"unpublish","removed_claims":["..."],"reason":"one short sentence","fixed_markdown":"full corrected guide markdown, or empty string"}`;

async function audit(guide, args, brandContext) {
  const meta = guide.data._meta || {};
  const signals = args.claim ? [] : recentSignals(meta.company);
  const userPrompt = `Audit this PUBLISHED guide for anything that is no longer true.

GUIDE TITLE: "${guide.data.original_title || ''}"
TOOL/COMPANY: ${[meta.company, meta.tool].filter(Boolean).join(' — ') || 'general'}

${args.claim ? `KNOWN CHANGE TO APPLY (treat as authoritative):\n"${args.claim}"\n` : ''}${signals.length ? `RECENT OFFICIAL HEADLINES about this company (context — may signal changes):\n${signals.map(s => `- ${s}`).join('\n')}\n` : ''}
THE GUIDE:
${guide.data.article_markdown || ''}

BRAND/LEGAL RULES:
${brandContext}

Remove or soften anything false/removed/unverifiable. Output ONLY the JSON.`;

  const response = await ask(userPrompt, { agentName: AGENT_NAME, systemPrompt: SYSTEM_PROMPT, maxTokens: 3500, jsonMode: true });
  return { response, decision: parseJson(response?.text) };
}

// Javított útmutató VISSZA a drafts-ba (Ellenőrzőre vár), a régi publikált TÖRÖLVE
function sendBackForRecheck(guide, fixedMarkdown, reason) {
  const writerFile = guide.file.replace(/^ARTICLE_/, 'WRITER_');
  const out = {
    _meta: {
      ...guide.data._meta,
      status: 'awaiting-review',
      fact_checked: true,
      fact_check_reason: reason,
      fact_checked_at: new Date().toISOString(),
      rework_attempts: 0,
      can_retry: true,
      ceo_decision: undefined
    },
    article_markdown: fixedMarkdown,
    original_title: guide.data.original_title
  };
  if (!existsSync(DRAFTS_DIR)) mkdirSync(DRAFTS_DIR, { recursive: true });
  writeFileSync(join(DRAFTS_DIR, writerFile), JSON.stringify(out, null, 2), 'utf-8');
  unlinkSync(join(ARTICLES_DIR, guide.file)); // a valótlan verziót LEVESSZÜK az oldalról
  return writerFile;
}

function unpublish(guide, reason) {
  unlinkSync(join(ARTICLES_DIR, guide.file));
}

async function main() {
  const args = parseArgs();
  console.log('🕵️  TÉNY-ELLENŐRZŐ AGENT (frissesség-őr)');
  console.log('─'.repeat(60));
  if (args.claim) console.log(`📌 Bejelentett változás: "${args.claim}"`);

  const guides = loadGuides(args);
  if (!guides.length) { console.log('💤 Nincs ellenőrizendő publikált útmutató (a szűrőre).'); return; }
  console.log(`🔎 ${guides.length} útmutató ellenőrzése${args.dry ? ' (DRY — nem írok)' : ''}\n`);

  const brandContext = loadBrandContext();
  let ok = 0, fixed = 0, removed = 0, cost = 0, needRecheck = 0;

  for (const guide of guides) {
    const title = (guide.data.original_title || guide.file).slice(0, 50);
    const { response, decision } = await audit(guide, args, brandContext);
    cost += response?.costUsd || 0;

    if (!decision) { console.log(`⚠️  ${title}… — döntés nem értelmezhető, kihagyom`); continue; }

    if (decision.verdict === 'ok') {
      console.log(`✅ OK: ${title}…`);
      ok++;
      continue;
    }

    const claims = (decision.removed_claims || []).slice(0, 3).join('; ');
    if (decision.verdict === 'unpublish') {
      console.log(`⛔ LEVÉTEL: ${title}… — ${decision.reason}`);
      if (!args.dry) {
        unpublish(guide, decision.reason);
        message('fact-check', 'team', 'decision', `Levettem (tárgytalan): "${title}" — ${decision.reason}`, { ref: guide.file });
        message('fact-check', 'human', 'need', `Útmutató levéve, mert valótlanná vált: "${title}" — ${decision.reason}. Dönts a sorsáról.`, { ref: guide.file });
        remember('guide', `Do not claim this exists (removed): ${decision.reason}`.slice(0, 200), { tags: ['fact-check', 'removed'] });
      }
      removed++;
      continue;
    }

    // verdict === 'fix'
    if (decision.fixed_markdown && hasGuideStructure(decision.fixed_markdown)) {
      console.log(`🔧 JAVÍTÁS: ${title}… — eltávolítva/lágyítva: ${claims || decision.reason}`);
      if (!args.dry) {
        const w = sendBackForRecheck(guide, decision.fixed_markdown, decision.reason);
        message('fact-check', 'ellenorzo', 'problem', `Valótlan rész egy publikált útmutatóban: "${title}" — ${claims || decision.reason}`, { ref: guide.file.replace(/^ARTICLE_/, '') });
        message('fact-check', 'ellenorzo', 'fix', `Eltávolítottam/lágyítottam a valótlan részt: "${title}" → visszaküldöm igazság-ellenőrzésre.`, { ref: w.replace(/^WRITER_/, '') });
        if (claims) remember('guide', `Avoid stating (may be removed/false): ${claims}`.slice(0, 200), { tags: ['fact-check', 'lesson'] });
      }
      fixed++; needRecheck++;
    } else {
      // Talált gondot, de nincs jó javítás → jelez, nem törlünk vakon
      console.log(`🙋 JELZÉS: ${title}… — gyanús állítás, de nincs biztos javítás: ${decision.reason}`);
      if (!args.dry) message('fact-check', 'ceo', 'need', `Ellenőrizendő állítás: "${title}" — ${decision.reason}`, { ref: guide.file.replace(/^ARTICLE_/, '') });
    }
  }

  console.log('─'.repeat(60));
  console.log(`📊 TÉNY-ELLENŐRZÉS: ${ok} rendben, ${fixed} javítva, ${removed} levéve | költség $${cost.toFixed(4)}`);
  if (needRecheck > 0 && !args.dry)
    console.log(`🔁 ${needRecheck} javított útmutató VISSZAMEGY az Ellenőrzőre — futtasd: node agents/ellenorzo/agent.js (vagy a CEO pipeline elvégzi).`);

  if (!args.dry) {
    if (!existsSync(LOGS_DIR)) mkdirSync(LOGS_DIR, { recursive: true });
    writeFileSync(join(LOGS_DIR, `factcheck_${new Date().toISOString().replace(/[:.]/g, '-')}.json`),
      JSON.stringify({ ok, fixed, removed, cost, at: new Date().toISOString(), claim: args.claim || null }, null, 2), 'utf-8');
  }
}

main().catch(e => { console.error('💥 TÉNY-ELLENŐRZŐ HIBA:', e); process.exit(1); });
