// ===================================================================
// HETI ÖSSZEFOGLALÓ AGENT — "This Week in AI" cikk vasárnaponként
// ===================================================================
//
// User-ötlet (2026-07-08): a hét 5 legfontosabb saját hírünkből a cég
// magától ír egy összefoglaló cikket — ez a legmegoszthatóbb tartalom,
// és a Google is szereti a rendszeres heti összefoglalókat.
//
// MŰKÖDÉS: vasárnap (UTC) fut, heti dedup-pal. A saját, 7 napon belüli
// híreinkből (útmutatók és korábbi összefoglalók NÉLKÜL) az AI kiválasztja
// az 5 legfontosabbat, és BELSŐ linkekkel megírja a heti körképet.
// A kimenet sima WRITER_ vázlat → a normál Ellenőrző-kapun megy át,
// a fordító + a social posztoló automatikusan viszi tovább.
//
// FUTTATÁS:  node agents/digest/agent.js [--force] [--dry]
// ===================================================================

import 'dotenv/config';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ask } from '../../core/ai-router.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const ARTICLES_DIR = join(ROOT, 'content', 'articles');
const DRAFTS_DIR = join(ROOT, 'content', 'drafts');
const STATE_PATH = join(ROOT, 'memory', 'digest-state.json');
const AGENT_NAME = 'digest';

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const DRY = args.includes('--dry');

let SITE_URL = 'https://aiworldhq.com';
try { SITE_URL = (JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf-8')).company.website_url || SITE_URL).replace(/\/$/, ''); } catch { /* marad az alap */ }

function slugify(t) { return (t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70); }

function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return t.getUTCFullYear() + '-W' + String(Math.ceil((((t - y) / 86400000) + 1) / 7)).padStart(2, '0');
}

function guard() {
  if (FORCE) return true;
  if (new Date().getUTCDay() !== 0) { console.log('⏭️  Heti összefoglaló: nem vasárnap van — kihagyom.'); return false; }
  try {
    const s = JSON.parse(readFileSync(STATE_PATH, 'utf-8'));
    if (s.last_week === isoWeek()) { console.log('⏭️  Heti összefoglaló: ezen a héten már készült.'); return false; }
  } catch { /* első futás */ }
  return true;
}

// A hét saját hírei (7 nap, hír-típus, korábbi összefoglalók nélkül)
function collectWeek() {
  const now = Date.now();
  const items = [];
  if (!existsSync(ARTICLES_DIR)) return items;
  for (const f of readdirSync(ARTICLES_DIR).filter(x => x.startsWith('ARTICLE_') && x.endsWith('.json'))) {
    try {
      const d = JSON.parse(readFileSync(join(ARTICLES_DIR, f), 'utf-8'));
      if (d._meta?.type === 'guide') continue;
      const pub = new Date(d._meta?.published_at || 0).getTime();
      if (now - pub > 7 * 24 * 3600e3) continue;
      const md = d.article_markdown || '';
      if (/weekly-digest/.test(md.slice(0, 600))) continue;         // ne önmagából főzzön
      const title = (md.match(/^title:\s*["']?(.+?)["']?\s*$/m) || [])[1] || d.original_title || '';
      const subtitle = (md.match(/^subtitle:\s*["']?(.+?)["']?\s*$/m) || [])[1] || '';
      if (!title) continue;
      items.push({
        title, subtitle,
        url: `${SITE_URL}/article/${slugify(title)}.html`,
        source: d._meta?.source_name || '',
        publishedAt: d._meta?.published_at || ''
      });
    } catch { /* kihagyjuk */ }
  }
  items.sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
  return items.slice(0, 12);
}

const SYSTEM_PROMPT = `You are the Weekly Digest Writer for AI World HQ (aiworldhq.com), a site that explains AI news for everyday people. (Primary audience: Australia — but written so ANYONE can read it; do not address "Australians" explicitly.) Plain, warm, jargon-free English. Every technical word explained on first use. Honest: never invent facts beyond the summaries you are given.`;

// HITELESSÉG-JAVÍTÓ (2026-07-26): az AI néha elrontja a SAJÁT domainünket a
// belső linkekben (pl. "aiworldhq..com", "aiworldhq. com") — a slug/útvonal
// HELYES, csak a domain sérül. Ezt a hitelesség-kapu tévesen "kitalált linknek"
// veszi és a KÉSZ heti összefoglalót örökre a rejected-be dobja. Itt a sérült
// domaint visszaállítjuk a helyes SITE_URL-re, és biztosítjuk a read_time_minutes
// mezőt (az AI néha kihagyja) — hogy a valóban jó összefoglaló ne akadjon el.
function repairDigest(md) {
  if (!md) return md;
  let out = md.replace(/https?:\/\/aiworldhq[.\s]+com/gi, SITE_URL);   // domain-typo javítás
  const fm = out.match(/^---\n([\s\S]*?)\n---/);
  if (fm && !/^\s*read_time_minutes:/m.test(fm[1])) {
    out = out.replace(/^(category:.*)$/m, '$1\nread_time_minutes: 4');
  }
  return out;
}

function buildPrompt(items, exactTitle, dateStr) {
  const list = items.map((it, i) => `${i + 1}. "${it.title}" — ${it.subtitle} (source: ${it.source}) [link: ${it.url}]`).join('\n');
  return `Below are this week's articles from our own site. Pick the FIVE most important for everyday readers (variety matters: different companies/topics), then write our weekly roundup article.

THIS WEEK'S ARTICLES:
${list}

REQUIREMENTS:
- Start with YAML frontmatter EXACTLY like this (keep the exact title):
---
title: "${exactTitle}"
subtitle: "<one friendly sentence: what this week brought in AI, for normal people>"
category: "ai-news"
audience: "both"
read_time_minutes: 4
tags: ["weekly-digest"]
---
- Immediately after the closing "---" of the frontmatter, repeat the title as an H1 markdown heading on its own line: # ${exactTitle}
- Then a warm 2-3 sentence intro (what kind of week it was).
- Then the 5 picks, each as a "## <short catchy heading>" section with 2-4 sentences: WHAT happened and WHY a normal person should care. End each section with a markdown link to OUR article, exactly in this form: [Read the full story](<the link I gave you>).
- Use ONLY the links I provided above — never invent URLs.
- Finish with a "## What this means for you" section (3-4 sentences, practical takeaway for the week).
- 700-1000 words total. Output the markdown only — no commentary.
- Today's date for context: ${dateStr}.`;
}

function selfCheck(text) {
  if (!text) return false;
  const hasFm = text.trimStart().startsWith('---');
  const hasH1 = /^#\s+.+$/m.test(text);              // az Ellenőrző auto-check NO_H1 kapuja!
  const hasImpact = /what this means for you/i.test(text);
  const internalLinks = (text.match(/\]\((https?:\/\/[^)]*\/article\/[^)]+)\)/g) || []).length;
  return hasFm && hasH1 && hasImpact && internalLinks >= 3;
}

async function main() {
  console.log('🗞️  HETI ÖSSZEFOGLALÓ AGENT INDUL');
  console.log('─'.repeat(60));
  if (!guard()) return;

  const items = collectWeek();
  if (items.length < 4) { console.log(`⏭️  Csak ${items.length} friss hír van — összefoglalóhoz kevés (min 4). Kihagyom.`); return; }
  console.log(`   📋 A hét hírei: ${items.length} cikk — az AI 5-öt választ.`);

  const d = new Date();
  const dateStr = d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const exactTitle = `This Week in AI: The 5 Stories That Matter (${dateStr})`;
  const prompt = buildPrompt(items, exactTitle, dateStr);

  let response = await ask(prompt, { agentName: AGENT_NAME, systemPrompt: SYSTEM_PROMPT, maxTokens: 3000 });
  if (response) response.text = repairDigest(response.text);   // sérült belső linkek + hiányzó mezők javítása
  if (response && !selfCheck(response.text)) {
    console.log('   ↻ Hiányos szerkezet (frontmatter / záró szekció / belső linkek) — újrapróbálom nyomatékkal...');
    const retry = await ask(prompt + `\n\n⚠️ CRITICAL: You MUST include (1) the YAML frontmatter, (2) an H1 heading line "# ${exactTitle}" right after the frontmatter, (3) at least 5 [Read the full story](...) links from the provided list, and (4) a "## What this means for you" H2 section. Write the complete article again.`,
      { agentName: AGENT_NAME, systemPrompt: SYSTEM_PROMPT, maxTokens: 3000 });
    if (retry) retry.text = repairDigest(retry.text);
    if (retry && selfCheck(retry.text)) { retry.costUsd += response.costUsd; response = retry; }
  }
  if (!response || !selfCheck(response.text)) {
    console.log('💥 Nem sikerült jó összefoglalót írni — marad jövő hétre.');
    // Bukás-számláló (2026-07-13): 2 egymást követő bukás a Főnök-asztalra kerül
    try {
      let st = {}; try { st = JSON.parse(readFileSync(STATE_PATH, 'utf-8')); } catch { /* első futás */ }
      st.consecutive_failures = (st.consecutive_failures || 0) + 1;
      writeFileSync(STATE_PATH, JSON.stringify(st, null, 2), 'utf-8');
      const { remember } = await import('../../core/memory-manager.js');
      remember(AGENT_NAME, 'A heti összefoglaló önellenőrzésen bukott — a H1-et és a kötelező szekciókat már az első vázlatban ki kell kényszeríteni.');
    } catch { /* a számláló nem kritikus */ }
    return;
  }

  if (DRY) {
    console.log('\n===== PRÓBA (nem mentem el) =====\n' + response.text.slice(0, 1500) + '\n... (levágva)');
    console.log(`\n💰 Költség: $${response.costUsd.toFixed(4)} | ${response.provider}/${response.model}`);
    return;
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `WRITER_${ts}_aiworld-editorial_This_Week_in_AI.json`;
  const out = {
    _meta: {
      written_at: new Date().toISOString(),
      writer_provider: response.provider,
      writer_model: response.model,
      writer_cost_usd: response.costUsd,
      original_draft: null,
      source_id: 'aiworld-editorial',
      source_name: 'AI World HQ Editorial',
      source_link: SITE_URL,
      status: 'awaiting-review'
    },
    article_markdown: response.text,
    original_title: exactTitle
  };
  writeFileSync(join(DRAFTS_DIR, filename), JSON.stringify(out, null, 2), 'utf-8');
  try { writeFileSync(STATE_PATH, JSON.stringify({ last_week: isoWeek(), created_at: new Date().toISOString(), consecutive_failures: 0 }, null, 2), 'utf-8'); } catch { /* nem kritikus */ }
  console.log(`✅ Heti összefoglaló vázlat kész → ${filename} (az Ellenőrző kapuja következik) | $${response.costUsd.toFixed(4)}`);
}

main().then(() => process.exit(0)).catch(e => { console.error('💥 DIGEST HIBA:', e); process.exit(1); });
