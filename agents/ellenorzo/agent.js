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
import { remember } from '../../core/memory-manager.js';
import { truthGate, logGate } from '../../core/truth-gate.js';
import { message, resolveNeed } from '../../core/ops.js';
import { skillsBlock } from '../../core/skills.js';

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
// 2026-07-22 (user-döntés: "kevesebb cikk, de minőségiek!"): 7 → 8.
// 215 valós bírálat eloszlása alapján állítva: 9 pont 111 db, 8 pont 41 db,
// 7 pont mindössze 11 db — vagyis a 8-as küszöb PONTOSAN az "épphogy megfelelt"
// sávot vágja le (a cikkek ~5%-át), a gyártást nem fojtja meg.
const MIN_PASSING_SCORE = 8;

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

function runAutoCheck(articleMarkdown, type) {
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
  // GUIDE-oknál a guide-quality-rules.md 700-1200 szót ír elő — 550 alatt
  // biztosan túl vékony a kezdőknek → ingyen (AI nélkül) buktatjuk.
  if (type === 'guide' && wordCount < 550) {
    issues.push(`GUIDE_TOO_SHORT: Csak ${wordCount} szó — az útmutató-szabály 700-1200 szó (guide-quality-rules.md)`);
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
9. BEGINNER CLARITY — ONLY for step-by-step guides (category "guide"); for news articles skip this and set clarity_score to null. Mentally walk through the steps AS A COMPLETE BEGINNER on a phone. A guide fails this check if ANY of these appear:
   - a vague action ("find the settings", "open the chat") without saying where it is, what the screen looks like, or what happens after;
   - no fallback when the reader's screen may differ ("if you don't see X, look for …");
   - an uncertain UI detail (menu name, button label, price, limit) stated as hard fact;
   - a promise the tool may not keep, or a paid feature not flagged as possibly paid;
   - a prerequisite that first appears mid-guide instead of in "Before you start";
   - steps so thin (a sentence or two) that the reader is left guessing.
   Score it as clarity_score 1-10: could a smart 70-year-old who never used this tool follow EVERY step without help and without being misled?

Respond with ONLY a single JSON object — no markdown fences, no commentary before or after — in EXACTLY this flat shape:
{"overall_score": <integer 1-10>, "clarity_score": <integer 1-10 for guides, null for news>, "decision": "PASS" or "FAIL", "issues": ["short issue", "short issue"], "verdict": "1-2 sentence reasoning"}

STRICT OUTPUT RULES (important for reliability):
- Output the JSON object and NOTHING else. No \`\`\` fences. No explanation.
- "issues" = at most 4 SHORT strings (one phrase each). Use [] if none. Avoid quotes/newlines inside the strings.
- Do NOT add any other fields (no nested "scores", no "praise").
- Keep "verdict" to one or two short sentences on a single line.

PASS rules: overall_score >= 7 AND no prohibited content found AND (for guides) clarity_score >= 7. FAIL otherwise. When a guide fails on clarity, the "issues" must name the SPECIFIC steps/sentences that are vague or misleading, so the writer can fix them.`;

async function aiReview(articleMarkdown, sourceInfo, brandContext, isBrief = false) {
  // FONTOS: a brandContext-et NEM küldjük el teljes egészében!
  // A REVIEWER_SYSTEM_PROMPT már tartalmazza az összes szabályt.
  // A teljes 30k karakteres kontextus összezavarta a modellt (JSON output csonkolt lett).
  // RÖVIDHÍR-TUDATOSSÁG (2026-07-19): az utolsó esélyes rövidhírt NEM a teljes
  // cikk mélységéhez mérjük — őszinteség+érthetőség számít, a rövidség NEM hiba.
  const briefNote = isBrief ? `

NOTE: This is a LAST-RESORT NEWS BRIEF (deliberately short, ~200-250 words). Judge ONLY honesty, clarity and correct structure. Being short and lacking depth is BY DESIGN here — do NOT fail it for brevity or missing detail. Fail it only for dishonesty, confusion or broken structure.` : '';
  const userPrompt = `Review this article for publication.${briefNote}

SOURCE METADATA:
${sourceInfo}

ARTICLE TO REVIEW:
${articleMarkdown}
${skillsBlock('ellenorzo')}

Now provide your judgement as JSON only (the rules are in your instructions).`;

  // RETRY: max 2 próba a JSON parse hibára (az AI néha hibás JSON-t ad)
  let totalCost = 0;
  let lastError = 'unknown';
  let lastRaw = '';

  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await ask(userPrompt, {
      agentName: AGENT_NAME,
      systemPrompt: REVIEWER_SYSTEM_PROMPT,
      maxTokens: 1500,
      jsonMode: true
    });

    if (!response) { lastError = 'AI router null'; continue; }
    totalCost += response.costUsd || 0;
    lastRaw = response.text || '';

    const parsed = parseReview(lastRaw);
    if (parsed) {
      parsed._aiCost = totalCost;
      parsed._provider = response.provider;
      parsed._model = response.model;
      parsed._attempts = attempt;
      if (parsed._salvaged) console.log(`      🛟 Csonka JSON — mentő parserrel kinyerve (${parsed.decision} ${parsed.overall_score}/10)`);
      return parsed;
    }
    lastError = 'JSON parse + salvage failed';
    if (attempt < 2) console.log(`      ↻ JSON parse hiba — újrapróbálom (${attempt}/2)...`);
  }

  // Ha SOHA nem kaptunk választ (minden provider elesett = infrastruktúra-hiba,
  // nem a cikk hibája!) → NEM utasítjuk el, hanem kihagyjuk: a vázlat megmarad,
  // a következő futás újrapróbálja. (2026-07-07: Google-akadozás miatt jó cikk
  // került az elutasítottak közé.)
  if (lastError === 'AI router null' && !lastRaw) {
    console.log('      ⏭️  Minden provider elérhetetlen — a vázlat MARAD, következő körben újra.');
    return null;
  }

  // Mindkét próba elbukott — naplózzuk a NYERS választ a diagnózishoz
  saveParseFailure(lastRaw, lastError);
  return {
    overall_score: 0,
    decision: 'FAIL',
    issues: [`AI response JSON parse error after retries: ${lastError}`],
    verdict: 'Could not parse AI review (2 attempts)',
    _aiCost: totalCost,
    _parseFailed: true
  };
}

// ===================================================================
// ROBUSZTUS REVIEW-PARSER (provider-független)
// ===================================================================
// 1) Szigorú JSON.parse a kinyert {...}-ra.
// 2) Ha az elbukik (pl. Gemini csonka JSON-t adott), MENTŐ regex-kinyerés:
//    a döntéshez elég az overall_score + decision (+ verdict, issues).
// ===================================================================
function parseReview(raw) {
  if (!raw) return null;
  let text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

  // 1) Szigorú próba
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch { /* megy a mentésre */ }
  }

  // 2) Mentő kinyerés — a két DÖNTŐ mező kell: score + decision
  const scoreM = text.match(/"?overall_score"?\s*[:=]\s*(\d{1,2})/i);
  const decM = text.match(/"?decision"?\s*[:=]\s*"?\s*(PASS|FAIL)/i);
  if (!scoreM && !decM) return null; // tényleg semmi értelmezhető

  const score = scoreM ? parseInt(scoreM[1], 10) : null;
  let decision = decM ? decM[1].toUpperCase() : null;
  // Ha csak az egyik van meg, a másikat a szabályból következtetjük
  if (!decision && score !== null) decision = score >= MIN_PASSING_SCORE ? 'PASS' : 'FAIL';
  if (score === null && decision) return null; // döntés pontszám nélkül nem megbízható → bukás-ág

  const verdM = text.match(/"?verdict"?\s*[:=]\s*"([^"]{0,300})/i);
  const issuesM = text.match(/"?issues"?\s*[:=]\s*\[([^\]]*)\]/i);
  const issues = issuesM
    ? issuesM[1].split(',').map(s => s.replace(/^[\s"]+|[\s"]+$/g, '')).filter(Boolean).slice(0, 4)
    : [];
  const clarM = text.match(/"?clarity_score"?\s*[:=]\s*(\d{1,2})/i);

  return {
    overall_score: score,
    clarity_score: clarM ? parseInt(clarM[1], 10) : null,
    decision,
    issues,
    verdict: verdM ? verdM[1].trim() : 'Salvaged from a partial AI response.',
    _salvaged: true
  };
}

// A nem értelmezhető NYERS választ kiírjuk, hogy később megnézhessük
function saveParseFailure(raw, err) {
  try {
    if (!existsSync(LOGS_DIR)) mkdirSync(LOGS_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    writeFileSync(join(LOGS_DIR, `reviewer-parsefail_${ts}.json`),
      JSON.stringify({ error: err, raw_length: (raw || '').length, raw }, null, 2), 'utf-8');
  } catch { /* a naplózás hibája ne döntse el a futást */ }
}

// ===================================================================
// DÖNTÉS ALAPJÁN MOZGATÁS
// ===================================================================

function moveToArticles(writerFilename, writerData, autoCheckResult, aiReviewResult) {
  if (!existsSync(ARTICLES_DIR)) mkdirSync(ARTICLES_DIR, { recursive: true });

  // Új fájlnév: ARTICLE_ prefix (cseréljük a WRITER_-t)
  const articleFilename = writerFilename.replace(/^WRITER_/, 'ARTICLE_');
  const articlePath = join(ARTICLES_DIR, articleFilename);

  // DÁTUM MEGŐRZÉSE: ha ez a cikk MÁR publikálva volt korábban (újra-közzététel,
  // pl. átdolgozás után), tartsuk meg az EREDETI published_at-ot — különben a
  // dátum mindig "mára" ugrana, és a 7 napos archívumban minden egy napnak tűnne.
  let publishedAt = new Date().toISOString();
  try {
    if (existsSync(articlePath)) {
      const prev = JSON.parse(readFileSync(articlePath, 'utf-8'));
      if (prev?._meta?.published_at) publishedAt = prev._meta.published_at;
      // FORDÍTÁS-INVALIDÁLÁS: ha a cikk SZÖVEGE megváltozott (upgrade/rework
      // utáni újra-publikálás), a régi fordítás-cache elavult → töröljük, a
      // fordító a következő körben újrafordítja. (Enélkül a nem-angol oldalak
      // a RÉGI szöveget mutatnák tovább.)
      if (prev?.article_markdown && prev.article_markdown !== writerData.article_markdown) {
        const transPath = join(PROJECT_ROOT, 'content', 'translations', articleFilename);
        if (existsSync(transPath)) {
          unlinkSync(transPath);
          console.log('   🌍 Fordítás-cache törölve (a szöveg változott — újrafordítás jön)');
        }
      }
    }
  } catch { /* marad az új dátum */ }

  // Markdown formátumba mentjük a cikket (a meta + az AI review-val együtt)
  const finalArticle = {
    _meta: {
      ...writerData._meta,
      status: 'published',
      published_at: publishedAt,
      auto_check: autoCheckResult,
      ai_review: aiReviewResult
    },
    article_markdown: writerData.article_markdown,
    original_title: writerData.original_title
  };

  writeFileSync(articlePath, JSON.stringify(finalArticle, null, 2), 'utf-8');

  // Töröljük az eredeti WRITER_ fájlt drafts-ból
  unlinkSync(join(DRAFTS_DIR, writerFilename));

  // KOMMUNIKÁCIÓ: ha átdolgozás után ment át, jelezzük a csapatnak (a kör bezárul),
  // és lezárjuk az ehhez a munkához tartozó nyitott "kell még adat" kéréseket.
  const to = writerData._meta?.type === 'guide' ? 'guide' : 'iro';
  const wasRework = (writerData._meta?.rework_attempts || 0) > 0;
  if (wasRework) {
    message('ellenorzo', to, 'info', `Rendben ✓ átment: "${writerData.original_title}" (${aiReviewResult?.score ?? '?'}/10)`, { ref: baseRef(writerFilename) });
    resolveNeed(baseRef(writerFilename));   // a kör elején nyitott 'need' lezárása
  }

  return articleFilename;
}

// Stabil azonosító a munka teljes életciklusára (REJECTED_/WRITER_/ARTICLE_ → közös alapnév)
function baseRef(filename) {
  return String(filename || '').replace(/^(REJECTED_|WRITER_|ARTICLE_)/, '');
}

// "Hiányos / kell még adat" típusú hibák felismerése a szövegből
function looksIncomplete(text) {
  return /truncat|incomplete|cut[\s-]?off|cuts? off|unfinished|mid-sentence|finish the|complete the (final |last )?section|missing (the )?(section|step|part)|too short|needs? more (detail|info|information|data|context)|add more/i.test(text || '');
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

  // TANULÁS: feljegyezzük a leckét — a TÍPUSNAK megfelelő scope-ra,
  // hogy a megfelelő agent (Író vagy Útmutató) elő tudja hívni.
  recordLesson(aiReviewResult, autoCheckResult, writerData.original_title, writerData._meta?.type);

  // KOMMUNIKÁCIÓ: az Ellenőrző ELMONDJA a producernek (Író/Útmutató) MI A BAJ,
  // és ha a munka HIÁNYOS / KELL MÉG ADAT, azt külön 'need' üzenetként jelzi.
  const to = writerData._meta?.type === 'guide' ? 'guide' : 'iro';
  const title = writerData.original_title || rejectedFilename;
  const issues = [
    ...(autoCheckResult?.issues || []),
    ...(aiReviewResult?.issues || [])
  ];
  const probText = issues.length ? issues.slice(0, 3).join('; ') : (aiReviewResult?.verdict || 'minőségi kifogás');
  message('ellenorzo', to, 'problem', `Visszaadva javításra: "${title}" — mi a baj: ${probText}`, { ref: baseRef(rejectedFilename) });

  const allText = [aiReviewResult?.verdict, ...issues].join(' ');
  if (looksIncomplete(allText)) {
    message('ellenorzo', to, 'need', `Hiányos / kell még adat: "${title}" — egészítsd ki: ${probText}`, { ref: baseRef(rejectedFilename) });
  }

  return rejectedFilename;
}

// ===================================================================
// TANULÁS: lecke feljegyzése (autonóm visszacsatolás)
// ===================================================================
// FONTOS: a guide-ok hibái 'guide' scope-ra, a cikkeké 'iro' scope-ra
// kerülnek — így a guide-agent loadLessons()-je (scope:'guide') tényleg
// LÁTJA a saját korábbi bukásait, és nem ismétli meg őket. (Automatikus
// tanulás: minden elutasítás → lecke → következő íráskor + rework-nél előjön.)
function recordLesson(aiReviewResult, autoCheckResult, title, type) {
  // A konkrét hibák (auto + AI) tömör formában
  const reasons = [];
  if (autoCheckResult?.issues?.length) reasons.push(...autoCheckResult.issues.map(i => i.split(':')[0]));
  if (aiReviewResult?.issues?.length) reasons.push(...aiReviewResult.issues.slice(0, 3));
  if (aiReviewResult?.verdict && reasons.length === 0) reasons.push(aiReviewResult.verdict);

  const scope = type === 'guide' ? 'guide' : 'iro';
  // A rétegzett MEMÓRIÁBA mentjük (az adott agent innen hívja elő) — minden ok külön emlék
  for (const reason of reasons.slice(0, 4)) {
    remember(scope, reason, { tags: ['rejection', 'lesson', type === 'guide' ? 'guide' : 'article'] });
  }
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

    // ZOMBI-VÉDELEM (2026-07-19, SkillOpt-tanulság): LEVETT témájú guide SOHA
    // nem publikálható újra — bármilyen úton került is ide, töröljük.
    try {
      const { isRemovedTopic } = await import('../../core/topic-dedup.js');
      const wTitle = writerData.original_title || ((markdown || '').match(/^title:\s*["']?(.+?)["']?\s*$/m) || [])[1] || '';
      if (writerData._meta?.type === 'guide' && isRemovedTopic(writerData._meta || {}, wTitle)) {
        unlinkSync(writerPath);
        console.log('   🧟 LEVETT TÉMA — nem publikálható, piszkozat törölve.\n');
        stats.removed_topic_dropped = (stats.removed_topic_dropped || 0) + 1;
        continue;
      }
    } catch { /* őr-hiba nem állítja meg az ellenőrzést */ }

    // 4a. Auto check (ingyenes)
    const autoCheckResult = runAutoCheck(markdown, writerData._meta?.type);
    console.log(`   📐 Auto check: ${autoCheckResult.passed ? '✅ OK' : `❌ ${autoCheckResult.issues.length} probléma`}`);
    if (!autoCheckResult.passed) {
      autoCheckResult.issues.slice(0, 3).forEach(i => console.log(`      • ${i}`));
    }

    // Ha az auto check elbukik komoly hibákkal, nem is hívunk AI-t (spórolunk)
    const criticalAutoFailures = autoCheckResult.issues.filter(i =>
      i.startsWith('NO_FRONTMATTER') || i.startsWith('NO_H1') || i.startsWith('MISSING_SECTION') || i.startsWith('GUIDE_TOO_SHORT')
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

    const aiReviewResult = await aiReview(markdown, sourceInfo, brandContext, writerData._meta?.brief_attempt === true);

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

    const clarityInfo = aiReviewResult.clarity_score != null ? `, érthetőség: ${aiReviewResult.clarity_score}/10` : '';
    console.log(`   🤖 AI ítélet: ${aiReviewResult.decision} (score: ${aiReviewResult.overall_score}/10${clarityInfo})`);
    if (aiReviewResult.verdict) console.log(`      💭 ${aiReviewResult.verdict}`);

    // 4c. Döntés alapján mozgatás
    // KEZDŐ-ÉRTHETŐSÉGI KAPU (guide-oknál): a clarity_score is legyen >= 7.
    // Ha a modell nem adott clarity_score-t, NEM buktatunk (parse-variancia
    // ne büntessen) — a fő kapu az overall + decision marad.
    const clarityOk = writerData._meta?.type !== 'guide'
      || aiReviewResult.clarity_score == null
      || aiReviewResult.clarity_score >= MIN_PASSING_SCORE;
    // 2026-07-22 audit: ez eddig CSAK akkor fűzte be az érthetőség-indokot, ha a
    // bíráló nulla egyéb kifogást írt. Csakhogy ez a kapu pont az ELLENTMONDÓ
    // válaszra való (PASS + jó összpontszám, de gyenge clarity) — ilyenkor a bíráló
    // gyakran írt 1-2 apró, MÁS kifogást, így a VALÓDI elutasítási ok (érthetőség)
    // sosem jutott el az átdolgozóhoz: a guide a rossz visszajelzés alapján javított,
    // körbe-körbe, amíg el nem fogytak a próbái. Most mindig befűzzük.
    if (!clarityOk) {
      const clarityIssue = `Beginner clarity too low (${aiReviewResult.clarity_score}/10): steps are vague or could mislead a first-time user`;
      aiReviewResult.issues = [clarityIssue, ...(aiReviewResult.issues || [])];
    }
    const finalPass = aiReviewResult.decision === 'PASS' && aiReviewResult.overall_score >= MIN_PASSING_SCORE && clarityOk;

    // HITELESSÉG-KAPU (2026-07-16, user: "ne legyen hallucináció publikálva"):
    // a minőségben átment cikk UTOLSÓ szűrője — halott/kitalált link vagy az
    // AI-bíró által fogott kitalált állítás = NEM publikálódik. AI-hiba = HOLD:
    // a piszkozat marad, a következő futás újrapróbálja.
    if (finalPass) {
      const gate = await truthGate(writerData, { ask });
      stats.total_cost_usd += gate.cost || 0;
      if (!gate.pass && gate.hold) {
        console.log(`   ⏸️  VISSZATARTVA (hitelesség-bíró nem elérhető): ${gate.blockers[0] || ''}\n`);
        stats.truth_held = (stats.truth_held || 0) + 1;
        logGate({ file: writerFilename, action: 'hold', reasons: gate.blockers });
        continue; // marad a drafts-ban
      }
      if (!gate.pass) {
        aiReviewResult.decision = 'FAIL';
        aiReviewResult.issues = gate.blockers.slice(0, 4);
        aiReviewResult.verdict = 'Hitelesség-kapu blokkolta: ' + (gate.blockers[0] || '').slice(0, 200);
        const rejectedName = moveToRejected(writerFilename, writerData, autoCheckResult, aiReviewResult);
        console.log(`   🛡️  HITELESSÉG-BLOKK: ${rejectedName} — ${gate.blockers[0]?.slice(0, 90)}\n`);
        stats.truth_blocked = (stats.truth_blocked || 0) + 1;
        logGate({ file: writerFilename, action: 'block', reasons: gate.blockers });
        // Lecke a KÖZÖSBE (mindenki lássa) + a SZERZŐ saját rekeszébe STABIL
        // szöveggel (2026-07-16, user: "külön memóriája... ne essenek bele
        // mindig ugyanabba a hibába") — ismétlődéskor erősödik, nem duplikálódik.
        try {
          remember('shared', `Hitelesség-kapu blokk: ${(gate.blockers[0] || '').slice(0, 150)} — kitalált felületet/linket/számot SOHA ne írj le tényként`);
          const authorScope = writerData._meta?.type === 'guide' ? 'guide' : 'iro';
          const isLink = (gate.blockers[0] || '').startsWith('Halott');
          remember(authorScope, isLink
            ? 'Halott vagy kitalált linket írtál cikkbe — linket csak hivatalos, ellenőrzött helyről (tool-links.json) szabad használni.'
            : 'A hitelesség-bíró kitalált állítást fogott (felület/gomb/modellnév/ár) — csak a forrásban igazolt, valóban létező dolgot írj le tényként.',
            { tags: ['truth-gate'] });
        } catch { /* lecke-hiba nem állít meg */ }
        continue;
      }
      if (gate.warnings.length) console.log(`   ⚠️  kapu-figyelmeztetés (nem blokkol): ${gate.warnings[0].slice(0, 90)}`);
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
  if (stats.truth_blocked) console.log(`   🛡️  Hitelesség-blokk: ${stats.truth_blocked}`);
  if (stats.truth_held) console.log(`   ⏸️  Visszatartva (bíró nem elérhető): ${stats.truth_held}`);
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
