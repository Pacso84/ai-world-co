// ===================================================================
// ELLENŐRZŐ AGENT (Reviewer Agent)
// ===================================================================
//
// FELADAT:
//   1. Felveszi a WRITER_* fájlokat (Író által megírt cikkek)
//   2. KÉT lépésben ellenőrzi:
//      a) AUTOMATA: struktúra, frontmatter, kötelező szekciók
//      b) AI ÍTÉLET: tartalom, brand, tényellenőrzés (Gemini Pro)
//   3. Döntés:
//      ✅ PASS → mozgatás content/articles/ (publikálható)
//      ❌ FAIL → mozgatás content/rejected/ (vissza Íróhoz)
//
// FUTTATÁS:
//   node agents/ellenorzo/agent.js                     -- mind feldolgozandó
//   node agents/ellenorzo/agent.js --limit 3           -- csak 3
//   node agents/ellenorzo/agent.js --file <filename>   -- konkrét
//
// FŐ ELV:
//   "Inkább elutasít egy gyengét, mint hogy publikáljon."
//   Az olvasói bizalom mindennél fontosabb.
// ===================================================================

import 'dotenv/config';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, renameSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ask } from '../../core/ai-router.js';

// ===================================================================
// SETUP
// ===================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');

const DRAFTS_DIR = join(PROJECT_ROOT, 'content', 'drafts');
const ARTICLES_DIR = join(PROJECT_ROOT, 'content', 'articles');
const REJECTED_DIR = join(PROJECT_ROOT, 'content', 'rejected');
const LOGS_DIR = join(PROJECT_ROOT, 'logs');
const SHARED_DIR = join(PROJECT_ROOT, 'shared');
// TANULÁS: az Ellenőrző ide írja a leckéket, az Író ezeket olvassa
const LESSONS_PATH = join(PROJECT_ROOT, 'agents', 'iro', 'lessons.json');

const AGENT_NAME = 'ellenorzo';

// Minimum elfogadható összpontszám (1-10)
const MIN_PASSING_SCORE = 7;

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
// BRAND TUDÁS BETÖLTÉS
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
// WRITER FÁJLOK LISTÁZÁSA
// ===================================================================

function listAwaitingReview(filter = null) {
  if (!existsSync(DRAFTS_DIR)) return [];
  const allFiles = readdirSync(DRAFTS_DIR);
  const writers = allFiles.filter(f => f.startsWith('WRITER_') && f.endsWith('.json'));
  if (filter) return writers.filter(f => f === filter);
  return writers.sort();
}

// ===================================================================
// 1. SZINT: AUTOMATA STRUKTÚRA ELLENŐRZÉS (ingyenes!)
// ===================================================================

function runAutoCheck(articleMarkdown) {
  const issues = [];

  // Van YAML frontmatter?
  if (!articleMarkdown.startsWith('---')) {
    issues.push('NO_FRONTMATTER: A cikk nem YAML frontmatter-rel kezdődik');
  }

  // Kötelező frontmatter mezők
  const frontmatterMatch = articleMarkdown.match(/^---\n([\s\S]*?)\n---/);
  if (frontmatterMatch) {
    const fm = frontmatterMatch[1];
    const required = ['title:', 'subtitle:', 'category:', 'read_time_minutes:', 'tags:'];
    for (const field of required) {
      if (!fm.includes(field)) {
        issues.push(`MISSING_FIELD: Frontmatter hiányzó mező: ${field.replace(':', '')}`);
      }
    }
  }

  // "What this means for you" szekció KÖTELEZŐ (brand szabály!)
  const hasWhatThisMeans = /what this means for you/i.test(articleMarkdown);
  if (!hasWhatThisMeans) {
    issues.push('MISSING_SECTION: Hiányzik a "What this means for you" szekció (brand szabály!)');
  }

  // Van H1 cím?
  if (!articleMarkdown.match(/^#\s+.+$/m)) {
    issues.push('NO_H1: Nincs H1 (# Cím) a cikkben');
  }

  // Hossz check
  const wordCount = articleMarkdown.split(/\s+/).length;
  if (wordCount < 150) {
    issues.push(`TOO_SHORT: Csak ${wordCount} szó (minimum 200 javasolt)`);
  }
  if (wordCount > 2500) {
    issues.push(`TOO_LONG: ${wordCount} szó — talán szét kéne bontani`);
  }

  // Amerikai angol szavak detektálása (popular ones)
  const americanWords = [
    { am: /\bcolor\b/g, au: 'colour' },
    { am: /\borganization\b/g, au: 'organisation' },
    { am: /\brealize\b/g, au: 'realise' },
    { am: /\banalyze\b/g, au: 'analyse' },
    { am: /\bcenter\b/g, au: 'centre' },
    { am: /\bbehavior\b/g, au: 'behaviour' }
  ];
  for (const { am, au } of americanWords) {
    if (am.test(articleMarkdown)) {
      issues.push(`AMERICAN_SPELLING: "${am.source.replace(/\\b/g, '')}" — Ausztrál: ${au}`);
    }
  }

  // Click-bait klisé szavak
  const clichesForbidden = [
    "you won't believe",
    "game changer",
    "game-changer",
    "in today's fast-paced world",
    "are you ready to",
    "it's no secret"
  ];
  for (const cliche of clichesForbidden) {
    if (articleMarkdown.toLowerCase().includes(cliche)) {
      issues.push(`CLICHE: Tiltott klisé találva: "${cliche}"`);
    }
  }

  return { passed: issues.length === 0, issues, wordCount };
}

// ===================================================================
// 2. SZINT: AI ÍTÉLET (Gemini 2.5 Pro - INGYENES 50/nap!)
// ===================================================================

const REVIEWER_SYSTEM_PROMPT = `You are the Reviewer Agent for AI World Co., an Australian AI news portal for everyday people.

You are the QUALITY GATE. Your job is to decide if an article is good enough to publish.

YOU MUST CHECK:

1. BRAND VOICE: Is it teaching + friendly + explanatory? Does it explain technical terms?
2. AUDIENCE FIT: Is this for everyday people (not developers)? Is the language accessible?
3. AUSTRALIAN ENGLISH: Are spellings correct (colour, organisation, centre)?
4. NO PROHIBITED CONTENT: No politics, medical/financial advice, celebrities, gambling, military, comparisons that put down competitors.
5. STRUCTURE: Is there a hook, main content, "What this means for you" section, and wrap-up?
6. FACTUAL ACCURACY: Are claims backed by sources? Any obvious hallucinations or invented facts/quotes?
7. NO CLICHÉS: Is the writing fresh? No "game changer", "in today's fast-paced world", etc.
8. RESPECT: Does it avoid putting anyone down? Is it kind and non-judgmental?

Respond ONLY in this exact JSON format (no markdown, no extra text):
{
  "overall_score": 1-10,
  "decision": "PASS" | "FAIL",
  "scores": {
    "brand_voice": 1-10,
    "audience_fit": 1-10,
    "australian_english": 1-10,
    "no_prohibited": 1-10,
    "structure": 1-10,
    "factual": 1-10,
    "no_cliches": 1-10,
    "respect": 1-10
  },
  "issues": ["specific issue 1", "specific issue 2"],
  "praise": ["what works well"],
  "verdict": "1-2 sentence reasoning"
}

PASS rules: overall_score >= 7 AND no individual score < 5 AND no prohibited content found.
FAIL otherwise.`;

async function aiReview(articleMarkdown, sourceInfo, brandContext) {
  // FONTOS: a brandContext-et NEM küldjük el teljes egészében!
  // A REVIEWER_SYSTEM_PROMPT már tartalmazza az összes szabályt.
  // A teljes 30k karakteres kontextus összezavarta a modellt (JSON output csonkolt lett).
  const userPrompt = `Review this article for publication.

SOURCE METADATA:
${sourceInfo}

ARTICLE TO REVIEW:
${articleMarkdown}

Now provide your judgement as JSON only (the rules are in your instructions).`;

  // RETRY: max 2 próba a JSON parse hibára (az AI néha hibás JSON-t ad)
  let totalCost = 0;
  let lastError = 'unknown';

  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await ask(userPrompt, {
      agentName: AGENT_NAME,
      systemPrompt: REVIEWER_SYSTEM_PROMPT,
      maxTokens: 1500,
      jsonMode: true
    });

    if (!response) { lastError = 'AI router null'; continue; }
    totalCost += response.costUsd || 0;

    try {
      let text = response.text.trim();
      text = text.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start !== -1 && end !== -1 && end > start) text = text.slice(start, end + 1);
      const parsed = JSON.parse(text);
      parsed._aiCost = totalCost;
      parsed._provider = response.provider;
      parsed._model = response.model;
      parsed._attempts = attempt;
      return parsed;
    } catch (e) {
      lastError = e.message;
      if (attempt < 2) console.log(`      ↻ JSON parse hiba — újrapróbálom (${attempt}/2)...`);
    }
  }

  // Mindkét próba elbukott
  return {
    overall_score: 0,
    decision: 'FAIL',
    issues: [`AI response JSON parse error after retries: ${lastError}`],
    verdict: 'Could not parse AI review (2 attempts)',
    _aiCost: totalCost
  };
}

// ===================================================================
// DÖNTÉS ALAPJÁN MOZGATÁS
// ===================================================================

function moveToArticles(writerFilename, writerData, autoCheckResult, aiReviewResult) {
  if (!existsSync(ARTICLES_DIR)) mkdirSync(ARTICLES_DIR, { recursive: true });

  // Új fájlnév: ARTICLE_ prefix (cseréljük a WRITER_-t)
  const articleFilename = writerFilename.replace(/^WRITER_/, 'ARTICLE_');
  const articlePath = join(ARTICLES_DIR, articleFilename);

  // Markdown formátumba mentjük a cikket (a meta + az AI review-val együtt)
  const finalArticle = {
    _meta: {
      ...writerData._meta,
      status: 'published',
      published_at: new Date().toISOString(),
      auto_check: autoCheckResult,
      ai_review: aiReviewResult
    },
    article_markdown: writerData.article_markdown,
    original_title: writerData.original_title
  };

  writeFileSync(articlePath, JSON.stringify(finalArticle, null, 2), 'utf-8');

  // Töröljük az eredeti WRITER_ fájlt drafts-ból
  unlinkSync(join(DRAFTS_DIR, writerFilename));

  return articleFilename;
}

function moveToRejected(writerFilename, writerData, autoCheckResult, aiReviewResult) {
  if (!existsSync(REJECTED_DIR)) mkdirSync(REJECTED_DIR, { recursive: true });

  const rejectedFilename = writerFilename.replace(/^WRITER_/, 'REJECTED_');
  const rejectedPath = join(REJECTED_DIR, rejectedFilename);

  const rejectedRecord = {
    _meta: {
      ...writerData._meta,
      status: 'rejected',
      rejected_at: new Date().toISOString(),
      auto_check: autoCheckResult,
      ai_review: aiReviewResult,
      reason: aiReviewResult?.verdict || 'Auto-check failed',
      can_retry: true  // Az Író-agent később újra megpróbálhatja
    },
    article_markdown: writerData.article_markdown,
    original_title: writerData.original_title
  };

  writeFileSync(rejectedPath, JSON.stringify(rejectedRecord, null, 2), 'utf-8');
  unlinkSync(join(DRAFTS_DIR, writerFilename));

  // TANULÁS: feljegyezzük a leckét az Írónak
  recordLesson(aiReviewResult, autoCheckResult, writerData.original_title);

  return rejectedFilename;
}

// ===================================================================
// TANULÁS: lecke feljegyzése az Írónak (autonóm visszacsatolás)
// ===================================================================
function recordLesson(aiReviewResult, autoCheckResult, title) {
  let store = { _meta: { note: 'Az Ellenorzo elutasitasaibol tanult leckek. Az Iro figyelembe veszi iras elott.' }, lessons: [] };
  if (existsSync(LESSONS_PATH)) {
    try { store = JSON.parse(readFileSync(LESSONS_PATH, 'utf-8')); } catch { /* friss */ }
  }
  if (!Array.isArray(store.lessons)) store.lessons = [];

  // A lecke: a konkrét hibák (auto + AI) tömör formában
  const reasons = [];
  if (autoCheckResult?.issues?.length) reasons.push(...autoCheckResult.issues.map(i => i.split(':')[0]));
  if (aiReviewResult?.issues?.length) reasons.push(...aiReviewResult.issues.slice(0, 3));
  if (aiReviewResult?.verdict && reasons.length === 0) reasons.push(aiReviewResult.verdict);

  store.lessons.push({
    date: new Date().toISOString().slice(0, 10),
    title: (title || '').slice(0, 60),
    reasons: reasons.slice(0, 4)
  });

  // Csak az utolsó 20 leckét tartjuk
  if (store.lessons.length > 20) store.lessons = store.lessons.slice(-20);
  store._meta.updated = new Date().toISOString();
  writeFileSync(LESSONS_PATH, JSON.stringify(store, null, 2), 'utf-8');
}

// ===================================================================
// LOG MENTÉS
// ===================================================================

function saveRunLog(stats) {
  if (!existsSync(LOGS_DIR)) mkdirSync(LOGS_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logfile = join(LOGS_DIR, `reviewer_${timestamp}.json`);
  writeFileSync(logfile, JSON.stringify(stats, null, 2), 'utf-8');
}

// ===================================================================
// FŐ FUTTATÁS
// ===================================================================

async function main() {
  const args = parseArgs();

  console.log('👁️  ELLENŐRZŐ AGENT INDUL');
  console.log('─'.repeat(60));

  // 1. Brand kontextus
  const brandContext = loadBrandContext();
  console.log(`📚 Brand kontextus betöltve (${brandContext.length} karakter)`);

  // 2. Cikkek listázása amik várnak
  const writers = listAwaitingReview(args.file);

  if (writers.length === 0) {
    console.log('💤 Nincs WRITER_* fájl ami várja az ellenőrzést.');
    console.log('   (Futtasd először az Írót: node agents/iro/agent.js)');
    return;
  }

  const toReview = args.limit ? writers.slice(0, args.limit) : writers;
  console.log(`📋 ${writers.length} cikk vár ellenőrzésre`);
  console.log(`🎯 Most ellenőrzendő: ${toReview.length}\n`);

  // 3. Statisztika
  const stats = {
    started_at: new Date().toISOString(),
    total: toReview.length,
    passed: 0,
    failed: 0,
    auto_check_failed: 0,
    ai_review_failed: 0,
    total_cost_usd: 0,
    by_article: []
  };

  // 4. Egyenként ellenőrizzük
  for (const writerFilename of toReview) {
    console.log(`🔍 Ellenőrzés: ${writerFilename.slice(0, 60)}...`);

    const writerPath = join(DRAFTS_DIR, writerFilename);
    const writerData = JSON.parse(readFileSync(writerPath, 'utf-8'));
    const markdown = writerData.article_markdown;

    // 4a. Auto check (ingyenes)
    const autoCheckResult = runAutoCheck(markdown);
    console.log(`   📐 Auto check: ${autoCheckResult.passed ? '✅ OK' : `❌ ${autoCheckResult.issues.length} probléma`}`);
    if (!autoCheckResult.passed) {
      autoCheckResult.issues.slice(0, 3).forEach(i => console.log(`      • ${i}`));
    }

    // Ha az auto check elbukik komoly hibákkal, nem is hívunk AI-t (spórolunk)
    const criticalAutoFailures = autoCheckResult.issues.filter(i =>
      i.startsWith('NO_FRONTMATTER') || i.startsWith('NO_H1') || i.startsWith('MISSING_SECTION')
    );

    if (criticalAutoFailures.length > 0) {
      // Azonnal elutasítjuk, nem hívunk AI-t
      const rejectedName = moveToRejected(writerFilename, writerData, autoCheckResult, {
        decision: 'FAIL',
        verdict: 'Critical auto-check failures: ' + criticalAutoFailures.join('; '),
        skipped_ai: true
      });
      console.log(`   ❌ ELUTASÍTVA (auto): ${rejectedName}\n`);
      stats.failed++;
      stats.auto_check_failed++;
      stats.by_article.push({
        writer: writerFilename,
        decision: 'FAIL',
        reason: 'auto-check critical',
        skipped_ai: true
      });
      continue;
    }

    // 4b. AI review (Gemini Pro ingyenes 50/nap)
    const sourceInfo = `
Source: ${writerData._meta.source_name} (${writerData._meta.source_id})
URL: ${writerData._meta.source_link}
Original title: ${writerData.original_title}
`;

    const aiReviewResult = await aiReview(markdown, sourceInfo, brandContext);

    if (!aiReviewResult) {
      console.log(`   ⚠️  AI review failed — megőrizzük újra próbáláshoz\n`);
      stats.ai_review_failed++;
      stats.by_article.push({
        writer: writerFilename,
        decision: 'SKIPPED',
        reason: 'AI router returned null'
      });
      continue;
    }

    stats.total_cost_usd += aiReviewResult._aiCost || 0;

    console.log(`   🤖 AI ítélet: ${aiReviewResult.decision} (score: ${aiReviewResult.overall_score}/10)`);
    if (aiReviewResult.verdict) console.log(`      💭 ${aiReviewResult.verdict}`);

    // 4c. Döntés alapján mozgatás
    const finalPass = aiReviewResult.decision === 'PASS' && aiReviewResult.overall_score >= MIN_PASSING_SCORE;

    if (finalPass) {
      const articleName = moveToArticles(writerFilename, writerData, autoCheckResult, aiReviewResult);
      console.log(`   ✅ PUBLIKÁLVA: ${articleName}\n`);
      stats.passed++;
      stats.by_article.push({
        writer: writerFilename,
        article: articleName,
        decision: 'PASS',
        score: aiReviewResult.overall_score,
        cost_usd: aiReviewResult._aiCost
      });
    } else {
      const rejectedName = moveToRejected(writerFilename, writerData, autoCheckResult, aiReviewResult);
      console.log(`   ❌ ELUTASÍTVA: ${rejectedName}\n`);
      stats.failed++;
      stats.by_article.push({
        writer: writerFilename,
        rejected: rejectedName,
        decision: 'FAIL',
        score: aiReviewResult.overall_score,
        cost_usd: aiReviewResult._aiCost
      });
    }
  }

  // 5. Log mentés
  stats.finished_at = new Date().toISOString();
  stats.duration_seconds = (new Date(stats.finished_at) - new Date(stats.started_at)) / 1000;
  saveRunLog(stats);

  // 6. Összefoglaló
  console.log('─'.repeat(60));
  console.log('📊 ÖSSZEFOGLALÓ:');
  console.log(`   Ellenőrzött: ${stats.total}`);
  console.log(`   ✅ Publikálva: ${stats.passed}`);
  console.log(`   ❌ Elutasítva: ${stats.failed}`);
  console.log(`      • Auto-check fail: ${stats.auto_check_failed}`);
  console.log(`      • AI fail: ${stats.failed - stats.auto_check_failed}`);
  console.log(`   AI költség: $${stats.total_cost_usd.toFixed(4)}`);
  console.log(`   Időtartam: ${stats.duration_seconds.toFixed(1)}s`);
  console.log('─'.repeat(60));

  const passRate = stats.total > 0 ? ((stats.passed / stats.total) * 100).toFixed(0) : 0;
  console.log(`\n📈 Sikerességi arány: ${passRate}% (cél: 70-90%)`);

  if (stats.passed > 0) {
    console.log(`✨ ${stats.passed} cikk vár publikálásra a content/articles/-ban`);
  }
  if (stats.failed > 0) {
    console.log(`📝 ${stats.failed} cikk visszakerült rejected/-be (újraírható)`);
  }
}

// ===================================================================
// INDÍTÁS
// ===================================================================

main().catch(error => {
  console.error('💥 KRITIKUS HIBA:', error);
  process.exit(1);
});
