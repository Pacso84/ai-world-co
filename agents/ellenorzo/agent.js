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
import { lengthIssue, HOWTO_MIN, HOWTO_MAX, GATE_MAX } from '../../core/article-length.js';
import { repetitionIssue, firstParagraph, WINDOW as OPENING_WINDOW } from '../../core/opening-variety.js';
import { blockingIssues, advisoryIssues, lessonFor } from '../../core/auto-check-codes.js';
import { findBritish } from '../../core/us-spelling.js';
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
  const files = ['company-info.md', 'style-guide.md', 'legal-rules-ai.md'];
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
// FRISS NYITÁSOK — FUTÁSONKÉNT EGYSZER (2026-08-16, kódellenőrzés)
// ===================================================================
// A nyitómondat-kapunak látnia kell a legutóbbi cikkek kezdését. Ez a lista
// minden draftnál UGYANAZ, az első változat mégis DRAFTONKÉNT olvasta be és
// parse-olta mind a 725 cikket (~6,5 MB, ~100 ms) — méghozzá az "ingyenes"
// auto-kapuban, ami épp azért van, hogy ne kerüljön semmibe.
//
// ⚠️ AMI KÉZENFEKVŐ LENNE, DE NEM MŰKÖDIK: a fájlnévre rendezés és onnan a
// 20 legújabb. Az ARTICLE_GUIDE_* fájlok neve SLUG, nem időbélyeg, tehát nem
// hordoz sorrendet. Az mtime sem járható: a CI friss checkoutot csinál, ott
// minden fájl mtime-ja azonos. Marad a valódi megoldás: egyszer olvassuk be.
//
// Csak a NYITÓ BEKEZDÉST tartjuk meg, nem a teljes markdownt — ennyi kell az
// ujjlenyomathoz, és a gyorsítótár így néhány kB, nem 6,5 MB.
let frissNyitasokCache = null;

function frissNyitasok() {
  if (frissNyitasokCache) return frissNyitasokCache;
  try {
    frissNyitasokCache = readdirSync(ARTICLES_DIR)
      .filter(f => f.startsWith('ARTICLE_') && f.endsWith('.json'))
      .map(f => {
        try {
          const d = JSON.parse(readFileSync(join(ARTICLES_DIR, f), 'utf-8'));
          return { pub: d._meta?.published_at || '', md: d.article_markdown || '' };
        } catch { return null; }
      })
      .filter(x => x && x.pub && x.md)
      .sort((a, b) => String(b.pub).localeCompare(String(a.pub)))
      .slice(0, OPENING_WINDOW)
      .map(x => firstParagraph(x.md))
      .filter(Boolean);
  } catch {
    frissNyitasokCache = [];   // nem tudjuk beolvasni → nem ítélünk, de nem is bukunk
  }
  return frissNyitasokCache;
}

/**
 * Az ÉPP MOST publikált cikk kezdése is számítson a következő draftnál.
 * Enélkül a gyorsítótár azt jelentené, hogy egy futáson belül három egyforma
 * kezdés simán átmegy — pont az, amit a kapu meg akar fogni.
 */
function jegyezdAKezdest(articleMarkdown) {
  if (!frissNyitasokCache) return;      // még be sem olvastuk — az olvasás úgyis látni fogja
  const nyitas = firstParagraph(articleMarkdown);
  if (nyitas) frissNyitasokCache.unshift(nyitas);   // frissek elöl
}

// ===================================================================
// 1. SZINT: AUTOMATA STRUKTÚRA ELLENŐRZÉS (ingyenes!)
// ===================================================================

function runAutoCheck(articleMarkdown, type) {
  const issues = [];

  // Van YAML frontmatter? (trimStart: egy vezető sortörés/szóköz NE dobjon HAMIS
  // NO_FRONTMATTER-t egy jó cikkre — 2026-07-24. Az Író már normalizálva ment, ez
  // védőháló a már sorban álló / más ágon készült cikkekre.)
  if (!articleMarkdown.trimStart().startsWith('---')) {
    issues.push('NO_FRONTMATTER: A cikk nem YAML frontmatter-rel kezdődik');
  }

  // RÖVIDEN-DOBOZ (2026-07-29) — a főcím után álló egyenes válasz.
  //
  // MIÉRT MÉRJÜK: a ChatGPT, a Perplexity és a Google kivonat-doboza az oldal
  // TETEJÉT olvassa. Ha ott csak elbeszélő felütés van, mást idéznek helyettünk.
  // A szabály: shared/style-guide.md 2a + iro/guide promptok.
  //
  // NEM AZONNALI ELUTASÍTÁS (szándékosan): ez a lista csak a NO_FRONTMATTER /
  // NO_H1 / MISSING_SECTION / GUIDE_TOO_SHORT hibáknál dob azonnal. Egy friss
  // szabálynál a puha jelzés a helyes: az AI-ellenőrző megkapja visszajelzésként,
  // de egyetlen kész cikket sem lövünk le miatta az első napokban.
  //
  // SZERKEZETRE mérünk, nem a címke szövegére ("In short") — azt a fordító
  // lefordítja, és a nem-angol ágon némán hamis riasztást adna.
  const afterH1 = articleMarkdown.match(/^#\s+.+?$\r?\n+([\s\S]{0,400})/m);
  if (afterH1 && !/^\s*>/.test(afterH1[1])) {
    issues.push('NO_LEDE: Hiányzik a RÖVIDEN-doboz (> **In short:** …) közvetlenül a főcím után — az AI-keresők és a Google kivonat-doboza ezt olvassák (style-guide 2a).');
  } else if (afterH1) {
    const lede = (afterH1[1].match(/^\s*((?:>.*\r?\n?)+)/) || [])[1] || '';
    const words = lede.replace(/[>*]/g, '').trim().split(/\s+/).filter(Boolean).length;
    if (words > 60) {
      issues.push(`LEDE_TOO_LONG: A RÖVIDEN-doboz ${words} szó (max ~45) — ami hosszú, az már nem "röviden".`);
    }
  }

  // SABLON-CÍMKE SZIVÁRGÁS (2026-07-30) — AZONNALI ELUTASÍTÁS.
  //
  // 137 MEGJELENT cikk kezdődött szó szerint így: "**Hook:** You've probably…".
  // A címke az író- és guide-prompt PÉLDÁJÁBÓL másolódott a szövegbe, és kint
  // volt az élő oldalon. Semmi nem hat gépiesebbnek egy olvasónak, mint egy
  // látható sablon-felirat — a user épp "emberibb cikkeket" kért.
  //
  // Ez MISSING_SECTION-ként megy, tehát AZONNAL elutasít, AI-hívás nélkül:
  // olcsó, egyértelmű, és sosem kérdés, hogy hiba-e.
  const LABEL_LEAK = /^[ \t]*\*{0,2}(hook|intro|introduction|body|conclusion|outro|cta)\b[^\n]{0,24}[:.]\*{0,2}/im;
  const leak = articleMarkdown.match(LABEL_LEAK);
  if (leak) {
    issues.push(`MISSING_SECTION: SABLON-CÍMKE a szövegben ("${leak[0].trim().slice(0, 30)}") — ez a prompt utasítása, nem az olvasónak szól. Írd sima mondatként.`);
  }

  // HELYI/PRIVÁT CÍM LINKKÉNT (2026-07-31, Google-audit lelete): egy megjelent
  // útmutatóban kattintható http://localhost:5000 link volt — az író egy
  // README-példamondatot írt, és a renderelő linkké tette. Az olvasónál az
  // ilyen link a SAJÁT gépére mutat (semmit nem nyit meg), a truth-gate
  // link-vadásza pedig nem tudja tesztelni. Példaként EMLÍTENI szabad, de
  // kódformázásban (backtick), nem élő linkként. Puha jelzés az AI-bírónak.
  if (/\]\(https?:\/\/(localhost|127\.0\.0\.1|192\.168\.|10\.)[^)]*\)|(?<!\`)https?:\/\/(localhost|127\.0\.0\.1)[:\/][^\s\`]*(?!\`)/.test(articleMarkdown)) {
    issues.push('LOCAL_URL: helyi/privát cím (localhost, 127.0.0.1…) él linkként a szövegben — példaként backtick-ek közé való, élő linkként a semmibe mutat.');
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
  // GUIDE-oknál a hossz-szabály a core/article-length.js-ben él (EGY helyen) —
  // 550 alatt biztosan túl vékony a kezdőknek → ingyen (AI nélkül) buktatjuk.
  if (type === 'guide' && wordCount < 550) {
    issues.push(`GUIDE_TOO_SHORT: Csak ${wordCount} szó — az útmutató-szabály ${HOWTO_MIN}-${HOWTO_MAX} szó (core/article-length.js)`);
  }
  if (wordCount > 2500) {
    issues.push(`TOO_LONG: ${wordCount} szó — talán szét kéne bontani`);
  }

  // ===================================================================
  // ÍGÉRET-FEDEZET (2026-07-27, user-lelet): "Így próbáld ki az AI-videó-
  // avatárt a telefonodon öt perc alatt" — a user elolvasta és csak
  // nagyvonalakban írt róla. Kiderült: HÍRKÉNT íródott (d-id-news forrás),
  // ezért a 700-1200 szavas útmutató-szabály NEM vonatkozott rá — 657 szó,
  // egyetlen összevont "step-by-step" bekezdés, 0 másolható példa.
  // 107 ilyen hírcikkünk volt a 299-ből (36%): a cím utasítást ígér, a
  // szöveg áttekintést ad. A típus szerinti kapu nem elég — a CÍM ÍGÉRETÉT
  // kell fedezni, bármelyik agent írta.
  // ===================================================================
  const titleLine = (articleMarkdown.match(/^title:\s*"?([^"\n]+)/m) || [])[1] || '';
  const promisesSteps = /^(how to|your first|setting up|set up|step-by-step)\b/i.test(titleLine.trim())
    || /\bin (five|5|four|4|three|3|ten|10) minutes\b/i.test(titleLine)
    || /\bstep[- ]by[- ]step\b/i.test(titleLine);
  // ===================================================================
  // A HOSSZ-KAPU KÖRE — a cím ígérete VAGY a típus (2026-08-16, kódellenőrzés)
  // ===================================================================
  // A hossz MINDKÉT IRÁNYBAN őriz (2026-08-16). Eddig csak lefelé őriztünk, és
  // emiatt a "How to" cikkek 95%-a a felső határ FÖLÖTT volt, észrevétlenül.
  // Ugyanaz az alak, mint a 08-14-i prompt-szivárgásnál: a mérce iránya számít.
  //
  // ⚠️ ÉS A KÖRE IS. Az első változatban a FELSŐ határ a `promisesSteps`
  // címregex mögé került, az ALSÓ viszont a `type === 'guide'` mögé — ugyanarra
  // a fogalomra két különböző feltétel. Mérve: az útmutatóknak csak 32%-a esik
  // a regexbe, így az 52 túl hosszú útmutatóból 33-nak (63%) NEM volt felső
  // határa. Ezért a hossz-kapu köre most: a cím ígér lépéseket VAGY guide.
  //
  // A jelzés TANÁCSADÓ (nem szerepel a core/auto-check-codes.js blokkoló
  // listáján): nem utasít el és nem indít fizetős újraírást — leckét ír az
  // Írónak a következő cikkhez, akkor is, ha ez a cikk átment.
  const hosszKapuAlatt = promisesSteps || type === 'guide';
  if (hosszKapuAlatt) {
    const hossz = lengthIssue(wordCount);
    // A GUIDE_TOO_SHORT (kritikus) ugyanerről szól — ne mondjuk el kétszer.
    const marSzoltARovidrol = issues.some(i => i.startsWith('GUIDE_TOO_SHORT'));
    if (hossz?.code === 'TOO_THIN' && !marSzoltARovidrol) {
      const miert = promisesSteps
        ? `A cím utasítást ígér ("${titleLine.slice(0, 50)}"), de csak ${wordCount} szó`
        : `Útmutató, de csak ${wordCount} szó`;
      issues.push(`HOWTO_TOO_THIN: ${miert} — az ilyen cikk ${HOWTO_MIN}-${HOWTO_MAX} szó (core/article-length.js).`);
    }
    if (hossz?.code === 'TOO_LONG') {
      issues.push(`HOWTO_TOO_LONG: ${wordCount} szó (~${hossz.minutes.toFixed(1)} perc olvasás) — a cél ${HOWTO_MIN}-${HOWTO_MAX} szó, a felső kapu ${GATE_MAX}. A Facebookról érkező mobilolvasó ennyit ritkán olvas végig.`);
    }
  }

  // A LÉPÉS-FEDEZET viszont tényleg a CÍM ígéretéről szól — az marad a regexnél.
  if (promisesSteps) {
    // Lépés-szakaszok: "## Step 3 — …" vagy "## 3. …" vagy "### Step …"
    const stepSections = (articleMarkdown.match(/^#{2,3}\s+(step\s*\d|\d+[.)]\s)/gim) || []).length;
    if (stepSections < 3) {
      issues.push(`HOWTO_NO_STEPS: A cím utasítást ígér, de csak ${stepSections} számozott lépés-szakasz van (kell 4-6, "## Step 1 — …" formában), nem egyetlen összevont bekezdés.`);
    }
  }

  // HELYESÍRÁS — MEGFORDÍTVA 2026-08-02.
  //
  // Ez a kapu eddig az AMERIKAI alakokat jelölte hibának ("color → colour"),
  // mert ausztrál angolt írtunk. A közönség-mérés után (US 300 / AU 0) amerikaira
  // váltottunk — a promptokat átírtam, de EZT A NÉHÁNY SORT majdnem elnéztem.
  // Így minden új, helyesen amerikai cikk hamis hibalistával ment volna az
  // AI-bíróhoz: nem utasította volna el (a spelling nem kritikus hiba), de
  // rontotta volna a pontszámot és fölösleges átdolgozást szült volna — az pedig
  // pénz. TANULSÁG: egy szabály átírásakor a PROMPT csak a fele; a gépi kapukat
  // külön kell megkeresni, mert azok némán dolgoznak.
  // HELYESÍRÁS (2026-08-03 óta MUNKAMEGOSZTÁS):
  //   • a KISBETŰS brit alakot a core/quality-guard.js --fix INGYEN, gépileg
  //     kijavítja a build előtt — ezért itt NEM jelezzük. Ha jeleznénk, az
  //     ellenőrző visszaküldhetné a cikket ÁTDOLGOZÁSRA (fizetős AI-hívás)
  //     egy olyan hiba miatt, amit egy szócsere ingyen megold. Az író ettől
  //     még tanul belőle: a quality-guard tanulságot ír a közös könyvbe,
  //     amit a router MINDEN prompthoz hozzáfűz.
  //   • a NAGYBETŰS alakot viszont a gép SZÁNDÉKOSAN nem bántja (lehet
  //     tulajdonnév: "Centre for AI Safety", "Cohere Summarise"), ezért itt
  //     jelezzük — ez az a döntés, amihez tényleg ítélet kell.
  const capitalBritish = findBritish(articleMarkdown);
  if (capitalBritish.length) {
    issues.push(`BRITISH_SPELLING_NAME: nagybetűs brit alak — ${capitalBritish.join(', ')}. `
      + 'Ha közszó, írd amerikaiul; ha VALÓDI tulajdonnév (szervezet/termék neve), hagyd.');
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

  // ===================================================================
  // NYITÓMONDAT-MODOR (2026-08-16) — a szokást mérjük, nem szavakat tiltunk
  // ===================================================================
  // A 07-30-i tiltás az „Imagine…" nyitást kiirtotta (23,6% → 0,6%), de
  // részben rokon fordulatok léptek a helyére. A modell a SZÓT kerüli meg,
  // nem a SZOKÁST — szavakat tiltani végtelen macska-egér játék.
  // Ezért azt nézzük, hogy a friss termés EGYFORMÁN kezd-e; így minden
  // JÖVŐBELI divatszó is fennakad, nem csak a mai.
  // NEM kritikus hiba: nem utasít el, csak szól az AI-bírónak és leckét ír.
  try {
    const modor = repetitionIssue(articleMarkdown, frissNyitasok(), { window: OPENING_WINDOW });
    if (modor) {
      issues.push(`OPENING_REPETITIVE: A legutóbbi ${modor.window} cikkből ${modor.count} kezdődik ugyanígy ("${modor.signature}…"). Kezdj másképp — kérdéssel, ténnyel vagy egy konkrét helyzettel.`);
    }
  } catch { /* ha nem tudjuk beolvasni a friss cikkeket, ettől nem bukik az ellenőrzés */ }

  return { passed: issues.length === 0, issues, wordCount };
}

// ===================================================================
// 2. SZINT: AI ÍTÉLET (Gemini 2.5 Pro - INGYENES 50/nap!)
// ===================================================================

const REVIEWER_SYSTEM_PROMPT = `You are the Reviewer Agent for AI World Co., an AI news portal for everyday people.

You are the QUALITY GATE. Your job is to decide if an article is good enough to publish.

YOU MUST CHECK:

1. BRAND VOICE: Is it teaching + friendly + explanatory? Does it explain technical terms?
2. AUDIENCE FIT: Is this for everyday people (not developers)? Is the language accessible?
3. US ENGLISH: Are spellings correct (color, organization, center)?
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

Now provide your judgment as JSON only (the rules are in your instructions).`;

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
  // ===================================================================
  // RÖGZÍTETT SLUG (2026-07-28) — a megjelent URL ÖRÖKRE ugyanaz marad.
  // ===================================================================
  // Ugyanaz a logika, mint a published_at-nál: ha a cikk MÁR megjelent, a
  // meglévő slug SÉRTHETETLEN. Enélkül egy cím-átdolgozás némán elköltöztetné
  // az oldalt, és a Google által indexelt régi cím 404 lenne — pontosan ez volt
  // a 2026-07-27-i Search Console-hiba (197 cikket érintett).
  // A SEO-őrszem ELSŐ éles körében kiderült, hogy a visszamenőleges rögzítés
  // csak a MEGLÉVŐ cikkeket fedte le: az újonnan megjelenők slug nélkül jöttek
  // ki (UNPINNED_SLUG, 10 cikk). Ez a sor zárja be a rést a forrásánál.
  let publishedAt = new Date().toISOString();
  let pinnedSlug = writerData._meta?.slug || null;
  try {
    if (existsSync(articlePath)) {
      const prev = JSON.parse(readFileSync(articlePath, 'utf-8'));
      if (prev?._meta?.published_at) publishedAt = prev._meta.published_at;
      if (prev?._meta?.slug) pinnedSlug = prev._meta.slug;   // SOHA nem írjuk felül
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

  // Első megjelenés → a MOSTANI címből képezzük a slugot, és rögzítjük.
  // (A build.js pontosan ezt a képletet használja, ezért egyeznie kell.)
  if (!pinnedSlug) {
    const t = (writerData.article_markdown || '').match(/^title:\s*"?([^"\n]+)/m);
    pinnedSlug = (t?.[1] || writerData.original_title || articleFilename)
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);
  }

  // Markdown formátumba mentjük a cikket (a meta + az AI review-val együtt)
  const finalArticle = {
    _meta: {
      ...writerData._meta,
      status: 'published',
      published_at: publishedAt,
      slug: pinnedSlug,
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
// A `published: true` az ÁTMENŐ cikk útja (2026-08-16, kódellenőrzés): ilyenkor
// csak a TANÁCSADÓ auto-jelzésekből lesz lecke, AI-ítélet nélkül. Enélkül a
// HOWTO_TOO_LONG és az OPENING_REPETITIVE néma volt: a recordLesson KIZÁRÓLAG
// a moveToRejected()-ből futott, tehát a publikált cikk hibájából senki nem
// tanult — a kapu be volt kötve, de a gyakorlatban nem csinált semmit.
function recordLesson(aiReviewResult, autoCheckResult, title, type, opts = {}) {
  const publikalt = !!opts.published;

  // A jelzés VÁLTOZÓ része (szószám, ujjlenyomat) a naplóé; a LECKE állandó —
  // különben minden elutasítás ÚJ emléket hozna létre a meglévő erősítése
  // helyett. A szöveg a core/auto-check-codes.js-ben él, angolul, mert az
  // Író promptjába kerül vissza.
  const autoIssues = publikalt
    ? advisoryIssues(autoCheckResult?.issues)
    : (autoCheckResult?.issues || []);
  const reasons = autoIssues.map(lessonFor);

  // Átmenő cikknél nincs AI-ítélet, amiből tanulni kéne — az átment.
  if (!publikalt) {
    if (aiReviewResult?.issues?.length) reasons.push(...aiReviewResult.issues.slice(0, 3));
    if (aiReviewResult?.verdict && reasons.length === 0) reasons.push(aiReviewResult.verdict);
  }

  const scope = type === 'guide' ? 'guide' : 'iro';
  // GÉPI ZAJ-SZŰRŐ (2026-08-03): a technikai hibaüzenet NEM lecke. Korábban
  // "AI response JSON parse error at position 237" típusú sorok kerültek a
  // tanulság-tárba, és SZÁZSZOR olvasódtak vissza az író promptjába
  // (accessCount 305!) — az írót semmire nem tanítják, csak hígítják a
  // valódi leckéket. Az ilyen hibát a napló rögzíti, a memória nem.
  const MACHINE_NOISE = /JSON parse error|Unterminated string|Unexpected token|at position \d+|ReferenceError|TypeError|SyntaxError|ECONN|ETIMEDOUT|AbortError|AI router null/i;
  // A rétegzett MEMÓRIÁBA mentjük (az adott agent innen hívja elő) — minden ok külön emlék
  const tags = publikalt
    ? ['advisory', 'lesson', type === 'guide' ? 'guide' : 'article']
    : ['rejection', 'lesson', type === 'guide' ? 'guide' : 'article'];
  for (const reason of [...new Set(reasons)].slice(0, 4)) {
    if (!reason || MACHINE_NOISE.test(reason)) continue;
    remember(scope, reason, { tags });
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

    // Ha az auto check elbukik komoly hibákkal, nem is hívunk AI-t (spórolunk).
    // A LISTA a core/auto-check-codes.js-ben él — EGY helyen, mert az Író és az
    // Útmutató is ugyanezt kérdezi, és korábban másképp válaszolt (2026-08-16).
    const criticalAutoFailures = blockingIssues(autoCheckResult.issues);

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
        logGate({ file: writerFilename, action: 'hold', reasons: gate.blockers, confidence: gate.confidence });
        continue; // marad a drafts-ban
      }
      if (!gate.pass) {
        aiReviewResult.decision = 'FAIL';
        aiReviewResult.issues = gate.blockers.slice(0, 4);
        aiReviewResult.verdict = 'Hitelesség-kapu blokkolta: ' + (gate.blockers[0] || '').slice(0, 200);
        const rejectedName = moveToRejected(writerFilename, writerData, autoCheckResult, aiReviewResult);
        console.log(`   🛡️  HITELESSÉG-BLOKK: ${rejectedName} — ${gate.blockers[0]?.slice(0, 90)}\n`);
        stats.truth_blocked = (stats.truth_blocked || 0) + 1;
        logGate({ file: writerFilename, action: 'block', reasons: gate.blockers, confidence: gate.confidence });
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
      console.log(`   ✅ PUBLIKÁLVA: ${articleName}`);

      // ===================================================================
      // TANULÁS ÁTMENŐ CIKKNÉL IS (2026-08-16, user-döntés)
      // ===================================================================
      // A tanácsadó jelzések (túl hosszú, egyforma kezdés) SZÁNDÉKOSAN nem
      // utasítanak el — a user döntése: "tanuljon, de ne utasítson el".
      // Eddig viszont a recordLesson CSAK a moveToRejected()-ből futott, így
      // az átmenő cikk jelzése nyomtalanul elveszett: a kapu be volt kötve,
      // és mégsem csinált semmit (52/321 útmutató, mérve).
      //
      // ⚠️ MIÉRT NEM AZ AI-BÍRÓNAK ADJUK ODA: a bíró PASS/FAIL-t mond. Ha elé
      // tennénk, hogy "ez a cikk túl hosszú", levihetné a pontszámot 7 alá —
      // abból elutasítás, abból FIZETŐS újraírás lenne. Épp az, amit a user
      // elvetett. A lecke-könyv ingyenes, és a KÖVETKEZŐ cikket javítja.
      const tanacsok = advisoryIssues(autoCheckResult.issues);
      if (tanacsok.length) {
        try {
          recordLesson(null, autoCheckResult, writerData.original_title, writerData._meta?.type, { published: true });
          console.log(`   📎 lecke a következő cikkhez: ${tanacsok.map(i => i.split(':')[0]).join(', ')}`);
        } catch { /* a lecke-hiba SOHA ne állítsa meg a publikálást */ }
      }
      // A frissen publikált kezdés számítson a következő draftnál is.
      jegyezdAKezdest(markdown);
      console.log('');
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
