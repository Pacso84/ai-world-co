// ===================================================================
// ÍRÓ AGENT (Writer Agent)
// ===================================================================
//
// FELADAT:
//   1. Felveszi a nyers draft-okat amiket az RSS Scraper készített
//      (content/drafts/SCRAPER_*.json fájlok)
//   2. Az AI router-rel (Claude Sonnet) cikket ír belőlük
//      a brand szabályok szerint
//   3. Eredményt lementi szintén drafts/ mappába (de már WRITER_ prefix-szel)
//      → ez vár az Ellenőrző-agentre
//
// FUTTATÁS:
//   node agents/iro/agent.js                    -- mind a feldolgozatlan draft
//   node agents/iro/agent.js --limit 3          -- csak 3 cikket írj
//   node agents/iro/agent.js --file <filename>  -- konkrét draft
//
// FŐ ELV (a brand-ből):
//   - TANÍTÓ + BARÁTSÁGOS + MAGYARÁZÓ hangnem
//   - Ausztrál angol
//   - Minden szakszó azonnal magyarázva
//   - "Mit jelent ez számodra?" szekció KÖTELEZŐ
//   - Nem ítélkező, nem összehasonlító
// ===================================================================

import 'dotenv/config';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ask } from '../../core/ai-router.js';
import { recall } from '../../core/memory-manager.js';

// ===================================================================
// SETUP
// ===================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');

const DRAFTS_DIR = join(PROJECT_ROOT, 'content', 'drafts');
const LOGS_DIR = join(PROJECT_ROOT, 'logs');
const SHARED_DIR = join(PROJECT_ROOT, 'shared');
const AGENT_NAME = 'iro';

// ===================================================================
// TANULÁS: a rétegzett MEMÓRIÁBÓL hívjuk elő a korábbi elutasítások leckéit
// ===================================================================
function loadLessons() {
  const hits = recall('rejection mistakes brand rules section missing tone', { scope: 'iro', limit: 8 });
  if (!hits.length) return '';
  const reasons = [...new Set(hits.map(h => h.text))].slice(0, 10);
  return `\n\nLESSONS FROM PAST REJECTIONS (avoid these mistakes — they got articles rejected before):\n${reasons.map(r => `- ${r}`).join('\n')}`;
}

// ===================================================================
// PARANCSSORI ARGUMENTUMOK
// ===================================================================

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = { limit: null, file: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      parsed.limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--file' && args[i + 1]) {
      parsed.file = args[i + 1];
      i++;
    }
  }
  return parsed;
}

// ===================================================================
// BRAND TUDÁS BETÖLTÉS (kontextusként a prompt-hoz)
// ===================================================================
// A `shared/` mappa fájljait beolvassuk, hogy az AI ezeket
// figyelembe vegye minden cikknél.
// ===================================================================

function loadBrandContext() {
  const files = ['company-info.md', 'style-guide.md', 'legal-rules.md'];
  const parts = [];
  for (const f of files) {
    const path = join(SHARED_DIR, f);
    if (existsSync(path)) {
      const content = readFileSync(path, 'utf-8');
      parts.push(`=== ${f} ===\n${content}`);
    }
  }
  return parts.join('\n\n');
}

// ===================================================================
// DRAFT FÁJLOK LISTÁZÁSA
// ===================================================================
// SCRAPER_* prefix = még nincs cikk írva belőle
// WRITER_* prefix  = már megírtuk, vár az Ellenőrzőre
// ===================================================================

function listUnprocessedDrafts(filter = null) {
  if (!existsSync(DRAFTS_DIR)) return [];

  const allFiles = readdirSync(DRAFTS_DIR);
  // Csak a SCRAPER_ prefixű JSON-ok feldolgozatlanok
  const drafts = allFiles.filter(f => f.endsWith('.json') && !f.startsWith('WRITER_'));

  if (filter) {
    return drafts.filter(f => f === filter);
  }

  return drafts.sort(); // időrend (a fájlnév kezdődik timestamp-pel)
}

// ===================================================================
// CIKK ÍRÁS PROMPT
// ===================================================================

const WRITER_SYSTEM_PROMPT = `You are the Writer Agent for AI World Co., an Australian site that teaches everyday people how to use AI in daily life.

YOUR JOB: write ORIGINAL, practical, helpful articles — mostly how-to guides, explainers, and tips.

⚠️ MOST IMPORTANT RULE — ORIGINALITY:
The input you receive is ONLY a SIGNAL of what topic is timely right now (e.g. "a new AI voice feature exists").
- DO NOT rewrite, summarise, paraphrase, or quote the input article.
- DO NOT mention, name, or link to any news website, blog, or publication.
- DO NOT include any "Source:" line or external links to other media.
- Instead, write something GENUINELY OUR OWN: a practical guide / explainer about the TOPIC, from our own angle, for everyday Australians.
- You MAY name the actual AI product or company that is the subject (e.g. "ChatGPT", "Gemini", "OpenAI") because that is what you are teaching about — but never as "X news site reported".

Think: "What useful, original thing can I teach the reader about this topic?" — not "How do I restate this news?"

OTHER RULES:

1. LANGUAGE: Australian English (colour, organisation, centre — NOT color, organization, center)

2. TONE: Teaching + friendly + explanatory (like a good teacher chatting with a friend)
   - Use "you" (direct address); active voice; short + long sentences mixed
   - Bullet points and short paragraphs
   - NO clichés ("In today's fast-paced world", "game changer", "revolutionary")

3. EVERY TECHNICAL TERM EXPLAINED IMMEDIATELY:
   - Right: "a transformer (think of it as the AI's internal structure for paying attention to important words)"

4. STRUCTURE (mandatory):
   - Hook: 1-2 sentences — why this is useful to know
   - Main content: practical, step-by-step or example-driven (2-4 short sections)
   - "What this means for you" section (mandatory!) with practical advice for different reader types
   - Closing: 1 paragraph — summary + a next step the reader can take today

5. PROHIBITED:
   - No comparisons between different companies' products ("X is better than Y")
   - No putting anyone/anything down
   - No medical, financial, or legal advice
   - No celebrity gossip or politics
   - No invented facts, fake quotes, or made-up numbers. If unsure of a specific number, speak generally instead.

6. OUTPUT FORMAT: Markdown with YAML frontmatter, then the article body. NO source line, NO external links.
   Frontmatter must include: title, subtitle, category, audience, read_time_minutes, tags.

7. AUDIENCE FIELD (important!): classify WHO can apply this in their life. One of:
   - "personal" = useful for everyday personal life (home, study, hobbies, daily tasks)
   - "business" = useful for running a business / for an entrepreneur / at work professionally
   - "both" = genuinely applicable to both personal life AND business
   Pick honestly. If it clearly helps both, use "both". The "What this means for you" section should
   address the audience(s) you chose (e.g. a "both" article gives a personal angle AND a business angle).

Example output structure:
---
title: "How to Use AI Voice Assistants in Your Daily Routine (60-80 chars, descriptive, NOT click-bait)"
subtitle: "One practical, benefit-focused sentence (100-150 chars)"
category: "how-to"
audience: "both"
read_time_minutes: 4
tags: ["voice-ai", "productivity", "getting-started"]
---

# How to Use AI Voice Assistants in Your Daily Routine

**Hook paragraph.** Why this is handy for everyday life.

## Getting started

Practical, original guidance. Explain any technical term immediately.

## A few ways to use it

- Concrete, everyday example 1
- Concrete, everyday example 2

## What this means for you

- **In everyday life**: a concrete personal use (home, study, daily tasks)
- **For your business or work**: a concrete professional/entrepreneur use
- **If you're just getting started**: an easy first step

## Wrap-up

One paragraph: summary + a next step to try today.`;

// ===================================================================
// EGY DRAFT CIKKÉ ÍRÁSA
// ===================================================================

async function writeArticle(draft, brandContext) {
  // A scraped cikk CSAK témajelzés — NEM átírandó forrás!
  const topicSignal = `
Topic area: ${draft._meta.relevance?.category || 'AI'}
What is currently timely (use ONLY as a hint of the subject — do NOT rewrite it):
"${draft.title}"
Extra context to understand the subject (background only, never copy):
${(draft.content_snippet || '').slice(0, 600)}
`;

  const userPrompt = `Write a complete, ORIGINAL article. The note below only tells you WHICH topic is timely right now — it is NOT something to rewrite or cite.

WHAT TO DO:
- Identify the underlying TOPIC / AI tool / capability from the signal below.
- Write our OWN original, practical, helpful piece about that topic for everyday Australians (a how-to, explainer, or tips article).
- Do NOT summarise, paraphrase, quote, or reference the signal text or any news outlet.
- Do NOT include any "Source:" line or external links.

REMEMBER:
- Australian English
- Teaching + friendly + explanatory tone; explain every technical term
- Mandatory "What this means for you" section
- Markdown output with YAML frontmatter (as in the system prompt)
- 400-700 words

TIMELY TOPIC SIGNAL (hint only):
${topicSignal}

BRAND CONTEXT (must follow):
${brandContext}${loadLessons()}

Now write the original article. Output the markdown only — no extra commentary, no source line.`;

  // 1. próba
  let response = await ask(userPrompt, {
    agentName: AGENT_NAME,
    systemPrompt: WRITER_SYSTEM_PROMPT,
    maxTokens: 3000
  });

  // SELF-CHECK: kötelező szekciók megléte. Ha hiányzik -> 1 retry nyomatékkal.
  if (response && !hasRequiredSections(response.text)) {
    console.log('   ↻ Hiányzik a kötelező szekció — újrapróbálom nyomatékkal...');
    const retryPrompt = userPrompt + `

⚠️ CRITICAL: Your article MUST contain a section with the EXACT heading "## What this means for you" (a markdown H2). It is mandatory. Also start with a YAML frontmatter block (---). Write the full article again, complete.`;
    const retry = await ask(retryPrompt, {
      agentName: AGENT_NAME,
      systemPrompt: WRITER_SYSTEM_PROMPT,
      maxTokens: 3000
    });
    // A retry-t csak akkor fogadjuk el, ha tényleg jobb (megvan a szekció)
    if (retry && hasRequiredSections(retry.text)) {
      retry.costUsd += response.costUsd; // a két hívás költsége együtt
      response = retry;
    }
  }

  return response; // null vagy { text, provider, model, costUsd }
}

// Kötelező szekciók ellenőrzése (a brand szabály szerint)
function hasRequiredSections(markdown) {
  if (!markdown) return false;
  const hasImpact = /what this means for you/i.test(markdown);
  const hasFrontmatter = markdown.trimStart().startsWith('---');
  return hasImpact && hasFrontmatter;
}

// ===================================================================
// CIKK MENTÉSE
// ===================================================================

function saveWrittenArticle(originalDraftFilename, draft, articleResponse) {
  // Az új fájlnév: WRITER_ + eredeti név (hogy összetartozzanak)
  const newFilename = 'WRITER_' + originalDraftFilename;
  const newPath = join(DRAFTS_DIR, newFilename);

  const writerOutput = {
    _meta: {
      written_at: new Date().toISOString(),
      writer_provider: articleResponse.provider,
      writer_model: articleResponse.model,
      writer_cost_usd: articleResponse.costUsd,
      original_draft: originalDraftFilename,
      source_id: draft._meta.source_id,
      source_name: draft._meta.source_name,
      source_link: draft.link,
      status: 'awaiting-review' // → Ellenőrző agent veszi fel
    },
    article_markdown: articleResponse.text,
    original_title: draft.title
  };

  writeFileSync(newPath, JSON.stringify(writerOutput, null, 2), 'utf-8');
  return newFilename;
}

// ===================================================================
// LOG MENTÉS
// ===================================================================

function saveRunLog(stats) {
  if (!existsSync(LOGS_DIR)) mkdirSync(LOGS_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logfile = join(LOGS_DIR, `writer_${timestamp}.json`);
  writeFileSync(logfile, JSON.stringify(stats, null, 2), 'utf-8');
}

// ===================================================================
// FŐ FUTTATÁS
// ===================================================================

async function main() {
  const args = parseArgs();

  console.log('✍️  ÍRÓ AGENT INDUL');
  console.log('─'.repeat(60));

  // 1. Brand kontextus betöltés
  const brandContext = loadBrandContext();
  console.log(`📚 Brand kontextus betöltve (${brandContext.length} karakter)`);

  // 2. Feldolgozatlan draft-ok keresése
  const drafts = listUnprocessedDrafts(args.file);

  if (drafts.length === 0) {
    console.log('💤 Nincs feldolgozatlan draft a content/drafts/ mappában.');
    console.log('   (Futtasd először a Scraper-t: node agents/rss-scraper/agent.js)');
    return;
  }

  const toProcess = args.limit ? drafts.slice(0, args.limit) : drafts;
  console.log(`📋 ${drafts.length} feldolgozatlan draft található`);
  console.log(`🎯 Most feldolgozandó: ${toProcess.length}\n`);

  // 3. Statisztika
  const stats = {
    started_at: new Date().toISOString(),
    drafts_total: toProcess.length,
    articles_written: 0,
    articles_failed: 0,
    total_cost_usd: 0,
    by_article: []
  };

  // 4. Cikkek írása egyenként
  for (const draftFilename of toProcess) {
    console.log(`📰 Feldolgozás: ${draftFilename.slice(0, 60)}...`);

    const draftPath = join(DRAFTS_DIR, draftFilename);
    const draft = JSON.parse(readFileSync(draftPath, 'utf-8'));

    const startTime = Date.now();
    const response = await writeArticle(draft, brandContext);
    const elapsedMs = Date.now() - startTime;

    if (!response) {
      console.log(`   ❌ Sikertelen (AI router nem válaszolt)\n`);
      stats.articles_failed++;
      stats.by_article.push({
        draft: draftFilename,
        success: false,
        error: 'AI router returned null'
      });
      continue;
    }

    const writerFilename = saveWrittenArticle(draftFilename, draft, response);
    stats.total_cost_usd += response.costUsd;
    stats.articles_written++;

    // A cikk első sorának kinyerése (frontmatter után)
    const previewMatch = response.text.match(/^#\s+(.+)$/m);
    const previewTitle = previewMatch ? previewMatch[1] : '(no title found)';

    console.log(`   ✅ Cikk megírva: "${previewTitle.slice(0, 70)}..."`);
    console.log(`   💰 Költség: $${response.costUsd.toFixed(4)} | ⏱️  ${(elapsedMs / 1000).toFixed(1)}s`);
    console.log(`   💾 Mentve: ${writerFilename}\n`);

    stats.by_article.push({
      draft: draftFilename,
      writer_output: writerFilename,
      success: true,
      cost_usd: response.costUsd,
      duration_ms: elapsedMs,
      provider: response.provider,
      model: response.model
    });
  }

  // 5. Log mentés
  stats.finished_at = new Date().toISOString();
  stats.duration_seconds = (new Date(stats.finished_at) - new Date(stats.started_at)) / 1000;
  saveRunLog(stats);

  // 6. Összefoglaló
  console.log('─'.repeat(60));
  console.log('📊 ÖSSZEFOGLALÓ:');
  console.log(`   Cikkek megírva: ${stats.articles_written}/${stats.drafts_total}`);
  console.log(`   Sikertelen: ${stats.articles_failed}`);
  console.log(`   Teljes költség: $${stats.total_cost_usd.toFixed(4)}`);
  console.log(`   Időtartam: ${stats.duration_seconds.toFixed(1)}s`);
  console.log('─'.repeat(60));

  if (stats.articles_written > 0) {
    console.log(`✨ ${stats.articles_written} cikk vár az Ellenőrző-Agentre (WRITER_* fájlok)`);
  }
}

// ===================================================================
// INDÍTÁS
// ===================================================================

main().catch(error => {
  console.error('💥 KRITIKUS HIBA:', error);
  process.exit(1);
});
