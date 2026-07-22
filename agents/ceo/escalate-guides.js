// ===================================================================
// CEO ESZKALÁCIÓ — "a főnök tegyen rendet" (útmutatók végső döntése)
// ===================================================================
//
// MIKOR FUT:
//   Ha egy útmutató GUIDE_MAX_REWORK (=4) körön át sem ment át az
//   Ellenőrzőn, az ügy a FŐNÖK (CEO) elé kerül. A felhasználó kérése:
//   "ha negyedik próbálkozásra sem egyeznek meg, akkor a főnök
//    ellenőrizzen és tegyen rendet, és utána [mehet tovább]".
//
// MIT CSINÁL A FŐNÖK (LLM-döntés):
//   • APPROVE → az Ellenőrző túl szigorú volt / a guide valójában jó:
//     a főnök FELÜLBÍRÁL, opcionálisan maga is rendet rak benne (végső
//     javítás), és PUBLIKÁLJA (content/articles/ARTICLE_GUIDE_*.json).
//   • HOLD   → valódi probléma (veszélyes tanács, másolt tartalom,
//     téves tény, hiányos szerkezet): NEM publikál, megjelöli emberi
//     döntésre (ceo_decision:'hold', can_retry:false), és a jelentésben
//     felszínre kerül. (Standing szabály: az ember a végső döntéshozó.)
//
// AUTOMATIKUS TANULÁS:
//   Minden döntés indokát + egy általánosítható leckét elmentünk a
//   'guide' scope-ú memóriába → a következő íráskor/rework-nél előjön.
// ===================================================================

import 'dotenv/config';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ask } from '../../core/ai-router.js';
import { remember } from '../../core/memory-manager.js';
import { message } from '../../core/ops.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const REJECTED_DIR = join(ROOT, 'content', 'rejected');
const ARTICLES_DIR = join(ROOT, 'content', 'articles');
const SHARED_DIR = join(ROOT, 'shared');
const GUIDE_MAX_REWORK = 4;
const AGENT_NAME = 'ceo';

function loadBrandContext() {
  const parts = [];
  for (const f of ['company-info.md', 'style-guide.md', 'legal-rules.md']) {
    const p = join(SHARED_DIR, f);
    if (existsSync(p)) parts.push(`=== ${f} ===\n${readFileSync(p, 'utf-8')}`);
  }
  return parts.join('\n\n');
}

// Mely guide-ok kerülnek a főnök elé? (4 kört kimerített, még nincs CEO-döntés)
function listGuidesForEscalation() {
  if (!existsSync(REJECTED_DIR)) return [];
  return readdirSync(REJECTED_DIR)
    .filter(f => f.startsWith('REJECTED_') && f.endsWith('.json'))
    .filter(f => {
      try {
        const d = JSON.parse(readFileSync(join(REJECTED_DIR, f), 'utf-8'));
        return d._meta?.type === 'guide' && !d._meta?.ceo_decision
          && (d._meta?.rework_attempts || 0) >= GUIDE_MAX_REWORK;
      } catch { return false; }
    })
    .sort();
}

function collectFeedback(meta) {
  const points = [];
  if (meta?.auto_check?.issues?.length) points.push(...meta.auto_check.issues);
  if (meta?.ai_review?.issues?.length) points.push(...meta.ai_review.issues);
  if (meta?.ai_review?.verdict) points.push(`Reviewer verdict: ${meta.ai_review.verdict}`);
  if (meta?.reason) points.push(meta.reason);
  return [...new Set(points)];
}

// Kötelező guide-szerkezet megléte (a publikáláshoz)
function hasGuideStructure(md) {
  if (!md) return false;
  const fm = md.trimStart().startsWith('---');
  const impact = /what this means for you/i.test(md);
  const steps = (md.match(/^##\s*Step\s*\d/gim) || []).length >= 2;
  return fm && impact && steps;
}

function parseDecision(text) {
  if (!text) return null;
  let t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s === -1 || e === -1) return null;
  try { return JSON.parse(t.slice(s, e + 1)); } catch { return null; }
}

const BOSS_SYSTEM_PROMPT = `You are the CEO of AI World Co., a site that teaches everyday people how to use AI in plain language. A step-by-step guide failed the Reviewer ${GUIDE_MAX_REWORK} times in a row. The Writer and Reviewer cannot agree, so the decision is now YOURS — you are the final authority.

Be pragmatic and decisive. The Reviewer is sometimes TOO strict about subjective or minor things (style nitpicks, tone, "could be clearer"). Do not let perfect be the enemy of good: if the guide is genuinely safe, original, accurate and useful to a beginner, APPROVE it (overrule the Reviewer).

Only HOLD it for a human if there is a REAL problem you must not publish: unsafe advice (medical/financial/legal), copied/plagiarised text, a clearly false factual claim, missing core structure, or a legal/brand risk.

If you APPROVE and can quickly tidy it up yourself, return the full corrected guide in "fixed_markdown" (same step-by-step format: YAML frontmatter with category: "guide", "## Before you start", 3-6 "## Step N — …", "## Common mistakes", "## What this means for you", "## Try it now"). If it's already fine, leave "fixed_markdown" empty.

Respond with ONLY this JSON (no prose, no code fence):
{
  "decision": "approve" | "hold",
  "reason": "one short sentence — your executive rationale",
  "lesson": "one short, general, imperative lesson for future guides (e.g. 'Define every technical term on first use.')",
  "fixed_markdown": "full corrected guide markdown, or empty string"
}`;

async function bossDecide(data, brandContext) {
  const feedback = collectFeedback(data._meta);
  const guide = data.article_markdown || '';
  const userPrompt = `GUIDE TITLE: "${data.original_title || ''}"

THE REVIEWER'S REPEATED OBJECTIONS (after ${GUIDE_MAX_REWORK} rewrites):
${feedback.map((f, i) => `${i + 1}. ${f}`).join('\n')}

THE GUIDE IN QUESTION:
${guide}

BRAND CONTEXT (must follow):
${brandContext}

Make the call. Output ONLY the JSON.`;

  const response = await ask(userPrompt, { agentName: AGENT_NAME, systemPrompt: BOSS_SYSTEM_PROMPT, maxTokens: 3500, jsonMode: true });
  return { response, decision: parseDecision(response?.text) };
}

function publishGuide(rejectedFilename, data, markdown, reason, decisionMeta) {
  if (!existsSync(ARTICLES_DIR)) mkdirSync(ARTICLES_DIR, { recursive: true });
  const articleFilename = rejectedFilename.replace(/^REJECTED_/, 'ARTICLE_');
  const out = {
    _meta: {
      ...data._meta,
      status: 'published',
      published_at: new Date().toISOString(),
      ceo_decision: 'approve',
      ceo_override: true,        // a főnök felülbírálta az Ellenőrzőt
      ceo_reason: reason,
      ceo_decided_at: new Date().toISOString(),
      ...decisionMeta,
      can_retry: false
    },
    article_markdown: markdown,
    original_title: data.original_title
  };
  writeFileSync(join(ARTICLES_DIR, articleFilename), JSON.stringify(out, null, 2), 'utf-8');
  unlinkSync(join(REJECTED_DIR, rejectedFilename));
  return articleFilename;
}

function holdGuide(rejectedFilename, data, reason) {
  const out = {
    _meta: {
      ...data._meta,
      ceo_decision: 'hold',          // emberre vár — a pipeline nem nyúl hozzá többé
      ceo_reason: reason,
      ceo_decided_at: new Date().toISOString(),
      can_retry: false,
      needs_human: true
    },
    article_markdown: data.article_markdown,
    original_title: data.original_title
  };
  writeFileSync(join(REJECTED_DIR, rejectedFilename), JSON.stringify(out, null, 2), 'utf-8');
  return rejectedFilename;
}

// AUTOMATIKUS TANULÁS: a főnök döntéséből is leckét vonunk le (scope:'guide')
function recordLesson(data, decision) {
  const tags = ['ceo', 'escalation', decision.decision === 'hold' ? 'hold' : 'override'];
  if (decision.lesson) remember('guide', String(decision.lesson).slice(0, 200), { tags });
  if (decision.decision === 'hold' && decision.reason)
    remember('guide', `Avoid (CEO hold): ${String(decision.reason).slice(0, 160)}`, { tags });
}

async function main() {
  console.log('👔 CEO ESZKALÁCIÓ — útmutatók végső döntése (a 4. próba után)');
  console.log('─'.repeat(60));

  const items = listGuidesForEscalation();
  if (items.length === 0) {
    console.log('   ✓ Nincs a főnök elé váró útmutató.');
    return;
  }
  console.log(`   ⚖️  ${items.length} útmutató vár a főnök döntésére\n`);

  const brandContext = loadBrandContext();
  let approved = 0, held = 0, cost = 0;

  for (const filename of items) {
    const data = JSON.parse(readFileSync(join(REJECTED_DIR, filename), 'utf-8'));
    console.log(`👔 Döntés: ${filename.slice(0, 55)}...`);

    const { response, decision } = await bossDecide(data, brandContext);
    cost += response?.costUsd || 0;

    const title = data.original_title || filename;

    // ÜZEMZAVAR ≠ ROSSZ VÁLASZ (2026-07-22 audit): ha az ask() NULL-t adott, akkor
    // nem hibás LLM-válasz volt, hanem NEM VOLT válasz — havi keret-stop vagy teljes
    // szolgáltató-kiesés. Ilyenkor TILOS véglegesen lezárni: a guide maradjon
    // érintetlenül a rejected-ben, és a következő futás újrapróbálja.
    // (A desk.js és minden más hívási hely is így kezeli a null-t.)
    if (response === null) {
      console.log('   ⏸️  Nincs AI-válasz (keret-stop vagy üzemzavar) → ÉRINTETLENÜL hagyom, jövő futáskor újra.\n');
      continue;
    }

    if (!decision) {
      // Ha a főnök válaszát nem tudjuk értelmezni: óvatosság → emberre bízzuk
      const reason = 'CEO döntés nem értelmezhető (LLM válasz hibás) — emberi ellenőrzés kell.';
      holdGuide(filename, data, reason);
      message('ceo', 'human', 'need', `Emberi döntés kell: "${title}" — ${reason}`, { ref: filename });
      console.log(`   ⚠️  Döntés nem értelmezhető → HOLD (emberre vár)\n`);
      held++;
      continue;
    }

    recordLesson(data, decision);

    if (decision.decision === 'approve') {
      const fixed = decision.fixed_markdown && hasGuideStructure(decision.fixed_markdown)
        ? decision.fixed_markdown : data.article_markdown;
      const usedFix = fixed !== data.article_markdown;
      const out = publishGuide(filename, data, fixed, decision.reason || 'CEO jóváhagyás', {
        ceo_fixed: usedFix, writer_provider: response?.provider, writer_model: response?.model
      });
      message('ceo', 'team', 'decision', `Jóváhagytam (felülbíráltam az Ellenőrzőt)${usedFix ? ' + rendet raktam benne' : ''}: "${title}" — ${decision.reason || ''}`, { ref: out });
      console.log(`   ✅ JÓVÁHAGYVA${usedFix ? ' + főnök javította' : ' (felülbírálás)'} → ${out}`);
      console.log(`      indok: ${String(decision.reason || '').slice(0, 80)}\n`);
      approved++;
    } else {
      holdGuide(filename, data, decision.reason || 'CEO: emberi döntés szükséges');
      message('ceo', 'team', 'decision', `Visszatartottam emberi döntésre: "${title}" — ${decision.reason || ''}`, { ref: filename });
      message('ceo', 'human', 'need', `Emberi döntés kell: "${title}" — ${decision.reason || ''}`, { ref: filename });
      console.log(`   ⛔ VISSZATARTVA (emberre vár): ${String(decision.reason || '').slice(0, 80)}\n`);
      held++;
    }
  }

  console.log('─'.repeat(60));
  console.log(`📊 CEO DÖNTÉS: ${approved} jóváhagyva/publikálva, ${held} emberre vár | költség $${cost.toFixed(4)}`);
  if (held > 0) console.log(`   🙋 ${held} útmutató EMBERI döntésre vár (content/rejected, ceo_decision:'hold').`);
}

main().catch(e => { console.error('💥 CEO ESZKALÁCIÓ HIBA:', e); process.exit(1); });
