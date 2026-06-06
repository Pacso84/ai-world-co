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

const WRITER_SYSTEM_PROMPT = `You are the Writer Agent for AI World Co., an Australian AI news portal for everyday people.

CRITICAL RULES (must follow exactly):

1. LANGUAGE: Australian English (colour, organisation, centre — NOT color, organization, center)

2. TONE: Teaching + friendly + explanatory (like a good teacher chatting with a friend)
   - Use "you" (direct address)
   - Short sentences mixed with longer ones
   - Active voice
   - Bullet points and short paragraphs
   - NO clichés like "In today's fast-paced world", "game changer", "revolutionary"

3. EVERY TECHNICAL TERM MUST BE EXPLAINED IMMEDIATELY:
   - Wrong: "The new model uses transformer architecture"
   - Right: "The new model uses a transformer (think of it as the AI's internal structure for paying attention to important words)"

4. STRUCTURE (mandatory for every article):
   - Hook: 1-2 sentences answering "what happened?" and "why does it matter?"
   - Main content: 2-4 short paragraphs with details
   - "What this means for you" section (mandatory!) with practical advice for different reader types
   - Closing: 1 paragraph with summary + next step

5. PROHIBITED:
   - Don't compare different companies' products ("X is better than Y") — NEVER
   - Don't put down anyone or any product
   - No medical, financial, or legal advice
   - No celebrity gossip or politics
   - No fake quotes or invented numbers — only state facts from the source

6. OUTPUT FORMAT: Markdown with frontmatter (YAML at top), then article body.
   The frontmatter must include: title, subtitle, category, read_time_minutes, tags.

Example output structure:
---
title: "Article Title Here (60-80 chars, descriptive, NOT click-bait)"
subtitle: "One-sentence summary (100-150 chars)"
category: "ai-news"
read_time_minutes: 3
tags: ["claude", "anthropic", "new-feature"]
---

# Article Title Here

**Hook paragraph here.** Quick context: what is this, and why does it matter to Aussies?

## More details

Two or three short paragraphs with the news. Explain any technical term immediately.

## What this means for you

- **If you use AI for work**: practical implication 1
- **If you're new to AI**: practical implication 2
- **If you're worried about [common concern]**: reassurance + facts

## Wrap-up

One paragraph summary + suggestion for next step.

---

Source: [link to original article]`;

// ===================================================================
// EGY DRAFT CIKKÉ ÍRÁSA
// ===================================================================

async function writeArticle(draft, brandContext) {
  // A draft tartalma
  const sourceInfo = `
Source name: ${draft._meta.source_name}
Source country: ${draft._meta.source_country}
Published: ${draft.pub_date}
URL: ${draft.link}
Categories: ${(draft.categories || []).join(', ') || 'none'}
Relevance score: ${draft._meta.relevance?.score || '?'}/10
Relevance category: ${draft._meta.relevance?.category || 'unknown'}
`;

  const sourceContent = `
Original title: ${draft.title}

Original content:
${draft.content_full || draft.content_snippet || '(no content)'}
`;

  const userPrompt = `Write a complete article based on the following source.

REMEMBER:
- Australian English
- Teaching + friendly + explanatory tone
- Explain every technical term
- Mandatory "What this means for you" section
- Markdown output with YAML frontmatter (as specified in the system prompt)
- Don't compare to competitors
- 300-600 words for a normal article

SOURCE METADATA:
${sourceInfo}

SOURCE CONTENT:
${sourceContent}

BRAND CONTEXT (must follow):
${brandContext}

Now write the article. Output the markdown only — no extra commentary.`;

  const response = await ask(userPrompt, {
    agentName: AGENT_NAME,
    systemPrompt: WRITER_SYSTEM_PROMPT,
    maxTokens: 3000
  });

  return response; // null vagy { text, provider, model, costUsd }
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
