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
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ask } from '../../core/ai-router.js';
import { recallSemantic } from '../../core/memory-manager.js';
import { skillsBlock } from '../../core/skills.js';
import { message } from '../../core/ops.js';

// ===================================================================
// SETUP
// ===================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');

const DRAFTS_DIR = join(PROJECT_ROOT, 'content', 'drafts');
const REJECTED_DIR = join(PROJECT_ROOT, 'content', 'rejected');
const LOGS_DIR = join(PROJECT_ROOT, 'logs');
const SHARED_DIR = join(PROJECT_ROOT, 'shared');
const AGENT_NAME = 'iro';

// Hányszor adhatja vissza az Ellenőrző ugyanazt a cikket átdolgozásra,
// mielőtt kecsesen feladjuk (végtelen hurok elkerülése).
const MAX_REWORK_ATTEMPTS = 2;

// ===================================================================
// TANULÁS: a rétegzett MEMÓRIÁBÓL hívjuk elő a korábbi elutasítások leckéit
// ===================================================================
async function loadLessons() {
  // Szemantikus keresés (Gemini embeddings); ha nem elérhető, kulcsszóra esik vissza.
  const hits = await recallSemantic('rejection mistakes brand rules section missing tone quality', { scope: 'iro', limit: 8 });
  if (!hits.length) return '';
  const reasons = [...new Set(hits.map(h => h.text))].slice(0, 10);
  return `\n\nLESSONS FROM PAST REJECTIONS (avoid these mistakes — they got articles rejected before):\n${reasons.map(r => `- ${r}`).join('\n')}`;
}

// SKILL FACTORY használat: az Elemző által desztillált, bevált recepteket
// betöltjük a promptba (iro + shared scope), és megjelöljük használtként (uses++).
// Így a skillek TÉNYLEGESEN hatnak a cikkre, nem csak a dashboardon ülnek.
function loadSkills() {
  return skillsBlock('iro'); // iro + shared aktív készségek, promptba fűzve (uses++)
}

// ===================================================================
// PARANCSSORI ARGUMENTUMOK
// ===================================================================

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = { limit: null, file: null };
  parsed.rework = args.includes('--rework');
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

const DRAFT_MAX_AGE_DAYS = 7;   // a hír romlandó: ennél régebbi, meg nem írt draftot eldobunk

function listUnprocessedDrafts(filter = null) {
  if (!existsSync(DRAFTS_DIR)) return [];

  const allFiles = readdirSync(DRAFTS_DIR);
  const drafts = allFiles.filter(f => f.endsWith('.json') && !f.startsWith('WRITER_'));

  if (filter) {
    return drafts.filter(f => f === filter);
  }

  // ROMLANDÓSÁG: a 7 napnál régebbi, még meg nem írt scraper-drafteket eldobjuk
  // (különben heteket késő "friss" hírt publikálnánk). A fájlnév időbélyeggel kezdődik.
  const cutoff = Date.now() - DRAFT_MAX_AGE_DAYS * 86400000;
  const fresh = [];
  for (const f of drafts) {
    const m = f.match(/^(\d{4}-\d{2}-\d{2})T/);
    const t = m ? new Date(m[1]).getTime() : Date.now();
    if (t < cutoff) { try { unlinkSync(join(DRAFTS_DIR, f)); } catch { /* */ } }
    else fresh.push(f);
  }

  // LEGÚJABB ELÖL — a friss hír megy ki előbb (nem ragad be a régi backlogon)
  return fresh.sort().reverse();
}

// ===================================================================
// CIKK ÍRÁS PROMPT
// ===================================================================

const WRITER_SYSTEM_PROMPT = `You are the Writer Agent for AI World Co., a site that teaches everyday people how to use AI in daily life. (Primary audience: Australia — but written so ANYONE can read it; do not address "Australians" explicitly or say "here in Australia".)

YOUR JOB: write ORIGINAL, practical, helpful articles — mostly how-to guides, explainers, and tips.

⚠️ MOST IMPORTANT RULE — ORIGINALITY:
The input you receive is ONLY a SIGNAL of what topic is timely right now (e.g. "a new AI voice feature exists").
- DO NOT rewrite, summarise, paraphrase, or quote the input article.
- DO NOT mention, name, or link to any news website, blog, or publication.
- DO NOT include any "Source:" line or external links to other media.
- Instead, write something GENUINELY OUR OWN: a practical guide / explainer about the TOPIC, from our own angle, for everyday people.
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
   Prefer the MORE SPECIFIC label when one side clearly dominates (e.g. funding/markets/enterprise = "business";
   a consumer feature/home/study tool = "personal"). Use "both" ONLY when it genuinely serves both equally —
   do NOT default to "both". The "What this means for you" section should address the audience(s) you chose.

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

  const lessons = await loadLessons();   // szemantikus memória (async)
  const skills = loadSkills();
  const userPrompt = `Write a complete, ORIGINAL article. The note below only tells you WHICH topic is timely right now — it is NOT something to rewrite or cite.

WHAT TO DO:
- Identify the underlying TOPIC / AI tool / capability from the signal below.
- Write our OWN original, practical, helpful piece about that topic for everyday people (a how-to, explainer, or tips article).
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
${brandContext}${lessons}${skills}

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

  // FONTOS: a megírt scraper-draftot TÖRÖLJÜK, hogy ne írjuk meg újra minden
  // futáskor (ez ragasztotta be a hírt a legrégebbi 25 cikkre). Így a sor halad,
  // és minden draft pontosan EGYSZER lesz cikké.
  try { unlinkSync(join(DRAFTS_DIR, originalDraftFilename)); } catch { /* már nincs ott */ }

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
// REWORK MÓD — az Ellenőrző VISSZAADTA a cikket javításra
// ===================================================================
// Az Ellenőrző a content/rejected/ mappába teszi a megbukott cikkeket
// (REJECTED_ prefix), a konkrét hibákkal a _meta-ban. Itt az Író
// elővesz minden olyat, amit még érdemes megpróbálni javítani
// (can_retry !== false ÉS rework_attempts < MAX), kijavítja a kapott
// HIBÁK alapján, és visszateszi WRITER_ néven az Ellenőrzőhöz.
// ===================================================================

function listRejectedForRework() {
  if (!existsSync(REJECTED_DIR)) return [];
  return readdirSync(REJECTED_DIR)
    .filter(f => f.startsWith('REJECTED_') && f.endsWith('.json'))
    .filter(f => {
      try {
        const data = JSON.parse(readFileSync(join(REJECTED_DIR, f), 'utf-8'));
        const attempts = data._meta?.rework_attempts || 0;
        // LEJÁRAT (2026-07-04): 3 napnál öregebb bukott HÍRT nem írunk újra —
        // mire átmenne, már senkit sem érdekel. (A napi hír-keret miatt a rework
        // gyakran kimaradt, és a régi bukások örökre felhalmozódtak.)
        const age = Date.now() - new Date(data._meta?.rejected_at || data._meta?.written_at || 0).getTime();
        if (age > 72 * 3600e3) return false;
        // Az útmutatókat (type=guide) az Író NEM dolgozza át (cikké írná) — kihagyjuk
        return data._meta?.type !== 'guide' && data._meta?.can_retry !== false && attempts < MAX_REWORK_ATTEMPTS;
      } catch { return false; }
    })
    .sort();
}

// A konkrét, kijavítandó hibák összeszedése (auto + AI ellenőrzés)
function collectFeedback(meta) {
  const points = [];
  if (meta?.auto_check?.issues?.length) points.push(...meta.auto_check.issues);
  if (meta?.ai_review?.issues?.length) points.push(...meta.ai_review.issues);
  if (meta?.ai_review?.verdict) points.push(`Reviewer verdict: ${meta.ai_review.verdict}`);
  if (meta?.reason && points.length === 0) points.push(meta.reason);
  return [...new Set(points)];
}

async function reworkArticle(rejectedData, brandContext) {
  const feedback = collectFeedback(rejectedData._meta);
  const original = rejectedData.article_markdown || '';
  const lessons = await loadLessons();   // szemantikus memória (async)
  const skills = loadSkills();

  const userPrompt = `One of your earlier articles was sent BACK by the Reviewer. Your job now is to FIX it — keep what works, repair the specific problems, and return the full corrected article.

THE REVIEWER'S SPECIFIC PROBLEMS (you MUST address every one):
${feedback.map((f, i) => `${i + 1}. ${f}`).join('\n')}

RULES (still apply):
- Keep it ORIGINAL — do not copy or cite any news outlet, no "Source:" line, no external links.
- Australian English; teaching + friendly tone; explain every technical term.
- Mandatory "## What this means for you" section.
- Markdown output with YAML frontmatter (title, subtitle, category, audience, read_time_minutes, tags).
- 400-700 words.

THE ARTICLE TO FIX (rewrite it fully, corrected):
${original}

BRAND CONTEXT (must follow):
${brandContext}${lessons}${skills}

Now output ONLY the corrected article markdown — no commentary, no notes about what you changed.`;

  let response = await ask(userPrompt, {
    agentName: AGENT_NAME,
    systemPrompt: WRITER_SYSTEM_PROMPT,
    maxTokens: 3000
  });

  // Self-check: kötelező szekciók — ha hiányzik, egy nyomatékos retry
  if (response && !hasRequiredSections(response.text)) {
    const retry = await ask(userPrompt + `

⚠️ CRITICAL: The corrected article MUST contain a "## What this means for you" H2 section and start with a YAML frontmatter (---). Output the full corrected article again.`, {
      agentName: AGENT_NAME,
      systemPrompt: WRITER_SYSTEM_PROMPT,
      maxTokens: 3000
    });
    if (retry && hasRequiredSections(retry.text)) {
      retry.costUsd += response.costUsd;
      response = retry;
    }
  }
  return response;
}

// Ez NEM a cikk hibája volt, hanem maga az ELLENŐRZŐ akadt meg
// (pl. JSON-parse hiba az AI válaszában)? Akkor a jó cikket NEM írjuk át,
// csak visszatesszük újraellenőrzésre.
function isReviewerSideFailure(meta) {
  const autoOk = !(meta?.auto_check?.issues?.length);
  const reviewerGlitch = /could not parse|parse error|json/i.test(
    [meta?.reason, meta?.ai_review?.verdict, ...(meta?.ai_review?.issues || [])].join(' ')
  );
  return autoOk && reviewerGlitch;
}

// Visszatesszük WRITER_ néven az Ellenőrzőhöz, növeljük a számlálót,
// a REJECTED_ fájlt töröljük. `text` = vagy az átdolgozott, vagy a változatlan cikk.
function saveBackToReview(rejectedFilename, rejectedData, { text, provider, model, costUsd, requeued }) {
  const writerFilename = rejectedFilename.replace(/^REJECTED_/, 'WRITER_');
  const newPath = join(DRAFTS_DIR, writerFilename);
  const prevAttempts = rejectedData._meta?.rework_attempts || 0;

  const writerOutput = {
    _meta: {
      ...rejectedData._meta,
      written_at: new Date().toISOString(),
      writer_provider: provider,
      writer_model: model,
      writer_cost_usd: costUsd,
      rework_attempts: prevAttempts + 1,
      reworked_from: rejectedFilename,
      requeued_unchanged: !!requeued, // true = nem írtuk át, csak újraellenőrzésre küldtük
      status: 'awaiting-review'
    },
    article_markdown: text,
    original_title: rejectedData.original_title
  };

  if (!existsSync(DRAFTS_DIR)) mkdirSync(DRAFTS_DIR, { recursive: true });
  writeFileSync(newPath, JSON.stringify(writerOutput, null, 2), 'utf-8');
  unlinkSync(join(REJECTED_DIR, rejectedFilename));
  return writerFilename;
}

async function runReworkMode(brandContext) {
  const rejected = listRejectedForRework();
  console.log('🔁 REWORK MÓD — visszaadott cikkek javítása');
  if (rejected.length === 0) {
    console.log('   💤 Nincs javítható elutasított cikk (vagy elérték a max próbát).');
    return;
  }
  console.log(`   📋 ${rejected.length} cikk vár átdolgozásra\n`);

  let fixed = 0, requeued = 0, gaveUp = 0, cost = 0;
  for (const filename of rejected) {
    const data = JSON.parse(readFileSync(join(REJECTED_DIR, filename), 'utf-8'));
    const attempt = (data._meta?.rework_attempts || 0) + 1;

    // ESET A: az Ellenőrző glitch-elt (nem a cikk a hibás) → változatlanul újra
    if (isReviewerSideFailure(data._meta)) {
      console.log(`↩️  Újra-sorba (ellenőrző-hiba, nem a cikké) [${attempt}/${MAX_REWORK_ATTEMPTS}]: ${filename.slice(0, 50)}...`);
      const writerName = saveBackToReview(filename, data, {
        text: data.article_markdown,
        provider: data._meta?.writer_provider,
        model: data._meta?.writer_model,
        costUsd: 0,
        requeued: true
      });
      console.log(`   ✅ Változatlanul visszaküldve → ${writerName} (0 költség)\n`);
      requeued++;
      continue;
    }

    // ESET B: valódi tartalmi/jogi hiba → az Író átdolgozza
    console.log(`🔧 Átdolgozás (${attempt}/${MAX_REWORK_ATTEMPTS}): ${filename.slice(0, 55)}...`);
    collectFeedback(data._meta).slice(0, 3).forEach(f => console.log(`      • javítandó: ${String(f).slice(0, 70)}`));

    const response = await reworkArticle(data, brandContext);
    if (!response) {
      console.log('   ❌ Nem sikerült (AI router null) — marad elutasítva\n');
      gaveUp++;
      continue;
    }
    const writerName = saveBackToReview(filename, data, {
      text: response.text, provider: response.provider, model: response.model, costUsd: response.costUsd
    });
    cost += response.costUsd || 0;
    fixed++;
    console.log(`   ✅ Javítva → ${writerName} (újraellenőrzésre vár)\n`);

    // KOMMUNIKÁCIÓ: az Író visszaszól az Ellenőrzőnek, mit javított
    const fb = collectFeedback(data._meta);
    message('iro', 'ellenorzo', 'fix', `Átdolgoztam: "${data.original_title || filename}" — javítva: ${fb.slice(0, 2).join('; ') || 'a jelzett hibák'}; újraküldöm.`, { ref: writerName.replace(/^(REJECTED_|WRITER_|ARTICLE_)/, '') });
  }

  console.log('─'.repeat(60));
  console.log(`📊 REWORK: ${fixed} átdolgozva, ${requeued} újra-sorba (ingyen), ${gaveUp} sikertelen | költség $${cost.toFixed(4)}`);
  if (fixed + requeued > 0) console.log(`✨ ${fixed + requeued} cikk visszakerült az Ellenőrzőhöz (WRITER_*)`);
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

  // REWORK MÓD: az Ellenőrző visszaadott cikkeket javítjuk (nem új írás)
  if (args.rework) {
    await runReworkMode(brandContext);
    return;
  }

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
