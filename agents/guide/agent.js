// ===================================================================
// ÚTMUTATÓ AGENT (Guide Agent)
// ===================================================================
//
// FELADAT:
//   Gyakorlati, LÉPÉSRŐL-LÉPÉSRE útmutatókat ír a hétköznapi embereknek
//   (pl. "hogyan írj promptot", cégenkénti kezdő-útmutatók). NEM hír —
//   időtálló, tanító tartalom. Forrás: guides/guide-topics.json (szerkeszthető).
//
//   A kész útmutató a content/drafts/-be kerül WRITER_GUIDE_* néven,
//   _meta.type='guide' jelzéssel → ugyanúgy átmegy az Ellenőrző + pipeline-on.
//
// FUTTATÁS:
//   node agents/guide/agent.js                 -- a legrégebbi 'todo' téma
//   node agents/guide/agent.js --id prompt-basics
//   node agents/guide/agent.js --title "How to ..."
//   node agents/guide/agent.js --limit 3       -- több téma egymás után
//   node agents/guide/agent.js --ideas 8       -- NEM ír, csak ÚJ témákat ötletel
//                                                 a guide-topics.json-ba (cég-lefedettség elöl)
//   node agents/guide/agent.js --cover         -- a HIÁNYZÓ cégekhez témát ad (ingyen, LLM nélkül)
//   node agents/guide/agent.js --balance 8     -- a LEMARADÓ cégeket hozza fel a küszöbig (arányosság)
//   node agents/guide/agent.js --upgrade [N]   -- a RÉGI publikált útmutatókat írja át a
//                                                 guide-quality-rules.md szintjére (rules_version 2)
//
// FŐ ELV: EREDETI tartalom. A cégek doksiját csak ihletként — sosem másoljuk.
// ===================================================================

import 'dotenv/config';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ask } from '../../core/ai-router.js';
import { recallSemantic } from '../../core/memory-manager.js';
import { skillsBlock } from '../../core/skills.js';
import { message } from '../../core/ops.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const DRAFTS_DIR = join(ROOT, 'content', 'drafts');
const REJECTED_DIR = join(ROOT, 'content', 'rejected');
const LOGS_DIR = join(ROOT, 'logs');
const SHARED_DIR = join(ROOT, 'shared');
const TOPICS_PATH = join(ROOT, 'guides', 'guide-topics.json');
const AGENT_NAME = 'guide';

// Hány körön át próbálja az Útmutató-agent ÚJRAÍRNI a megbukott guide-ot,
// MIELŐTT a főnök (CEO) elé kerül végső döntésre. (A felhasználó kérése:
// "ha negyedik próbálkozásra sem egyeznek meg, akkor a főnök tegyen rendet".)
const GUIDE_MAX_REWORK = 4;

// ---- argumentumok ----
function parseArgs() {
  const a = process.argv.slice(2);
  const p = { id: null, title: null, limit: 1, rework: false, ideas: 0, cover: false, balance: 0, upgrade: false, upgradeLimit: 0 };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--upgrade') { p.upgrade = true; if (a[i + 1] && /^\d+$/.test(a[i + 1])) p.upgradeLimit = parseInt(a[++i], 10); }
    else if (a[i] === '--id' && a[i + 1]) { p.id = a[++i]; }
    else if (a[i] === '--title' && a[i + 1]) { p.title = a[++i]; }
    else if (a[i] === '--limit' && a[i + 1]) { p.limit = parseInt(a[++i], 10) || 1; }
    else if (a[i] === '--rework') { p.rework = true; }
    else if (a[i] === '--cover') { p.cover = true; }
    else if (a[i] === '--ideas') { p.ideas = parseInt(a[i + 1], 10) || 6; if (a[i + 1] && /^\d+$/.test(a[i + 1])) i++; }
    else if (a[i] === '--balance') { p.balance = parseInt(a[i + 1], 10) || 8; if (a[i + 1] && /^\d+$/.test(a[i + 1])) i++; }
  }
  return p;
}

function loadBrandContext() {
  const parts = [];
  // A guide-quality-rules.md a KEZDŐ-ÉRTHETŐSÉGI szabálykönyv (2026-07-03):
  // minden lépés 6 kötelező eleme + őszinteségi szabályok + mélység-előírás.
  for (const f of ['company-info.md', 'style-guide.md', 'legal-rules.md', 'guide-quality-rules.md']) {
    const path = join(SHARED_DIR, f);
    if (existsSync(path)) parts.push(`=== ${f} ===\n${readFileSync(path, 'utf-8')}`);
  }
  return parts.join('\n\n');
}

function loadTopics() {
  return JSON.parse(readFileSync(TOPICS_PATH, 'utf-8'));
}
function saveTopics(data) {
  writeFileSync(TOPICS_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

// 3 SZINTŰ rangsor a 4/nap kereten belül:
//   1) FRISS funkció-útmutató (hír-párosításból = source_news, vagy Telegramon
//      kért = 'requested') → ELŐSZÖR, mert időérzékeny (ne maradjunk le az új
//      funkciókról).
//   2) KIEGYENLÍTÉS (balance/coverage) → a lemaradó cégek felhozása.
//   3) GENERAL (evergreen) → folyamatosan, hogy ne álljon le.
// A 2-3 közt 2:1 interleave, hogy a general is folyamatosan menjen.
function isFresh(t) { return !!t.source_news || t.priority === 'fresh' || t.priority === 'requested'; }
function isBalanceTopic(t) { return t.priority === 'balance' || t.priority === 'coverage'; }

function pickTopics(store, args) {
  if (args.id) return store.topics.filter(t => t.id === args.id);
  if (args.title) return store.topics.filter(t => t.title === args.title);
  const todo = store.topics.filter(t => t.status !== 'done');
  const fresh = todo.filter(isFresh);
  const balance = todo.filter(t => !isFresh(t) && isBalanceTopic(t));
  const general = todo.filter(t => !isFresh(t) && !isBalanceTopic(t));
  const out = [];
  for (const t of fresh) { if (out.length >= args.limit) break; out.push(t); }   // 1) friss elöl
  let bi = 0, gi = 0;                                                            // 2-3) balance:general = 2:1
  while (out.length < args.limit && (bi < balance.length || gi < general.length)) {
    if (bi < balance.length) out.push(balance[bi++]);
    if (out.length < args.limit && bi < balance.length) out.push(balance[bi++]);
    if (out.length < args.limit && gi < general.length) out.push(general[gi++]);
  }
  return out;
}

// Útmutató-szám cégenként (a katalógus kanonikus cégeire)
function companyCounts(store) {
  const c = {};
  for (const t of store.topics) if (t.company) c[normCompany(t.company)] = (c[normCompany(t.company)] || 0) + 1;
  return c;
}

// ===================================================================
// CÉG-LEFEDETTSÉG — "minden követett céghez legyen útmutató"
// ===================================================================
// A katalógus a követett hivatalos AI-cégeket (sources/rss-feeds.json
// category:'ai-company-official') + a hétköznapi felhasználóknak szóló FŐ
// eszközüket tartalmazza. Az ötletelő ELŐSZÖR a 0-útmutatós ("alsó") cégeket
// tölti fel — determinisztikusan, LLM nélkül, ingyen.
const COMPANY_CATALOG = [
  { company: 'OpenAI',       tool: 'ChatGPT',            icon: '🤖', audience: 'both' },
  { company: 'Google',       tool: 'Gemini',             icon: '✨', audience: 'both' },
  { company: 'Anthropic',    tool: 'Claude',             icon: '🧠', audience: 'both' },
  { company: 'Microsoft',    tool: 'Microsoft Copilot',  icon: '🪟', audience: 'both' },
  { company: 'Meta',         tool: 'Meta AI',            icon: '💬', audience: 'personal' },
  { company: 'Apple',        tool: 'Apple Intelligence', icon: '🍎', audience: 'personal' },
  { company: 'Amazon',       tool: 'Amazon Alexa+',      icon: '📦', audience: 'personal' },
  { company: 'Perplexity',   tool: 'Perplexity',         icon: '🔎', audience: 'both' },
  { company: 'xAI',          tool: 'Grok',               icon: '🛰️', audience: 'both' },
  { company: 'DeepSeek',     tool: 'DeepSeek',           icon: '🐳', audience: 'both' },
  { company: 'Mistral',      tool: 'Le Chat (Mistral)',  icon: '🇪🇺', audience: 'both' },
  { company: 'Alibaba',      tool: 'Qwen Chat',          icon: '🐲', audience: 'both' },
  { company: 'Hugging Face', tool: 'Hugging Face',       icon: '🤗', audience: 'both',
    angle: 'A plain-English first look at Hugging Face: how to find and try thousands of free AI models and demos (Spaces) in your browser — no install, no coding.' },
  { company: 'NVIDIA',       tool: 'NVIDIA ChatRTX',     icon: '🎮', audience: 'personal',
    angle: 'How to run a private AI chatbot on your own NVIDIA-powered PC with ChatRTX — what it is, what you need, and the easiest way to start.' },
  { company: 'GitHub',       tool: 'GitHub Copilot',     icon: '🐙', audience: 'business',
    angle: 'GitHub Copilot for absolute beginners: what an AI coding helper does, where it appears, and how to try it safely on a tiny first project.' },
  { company: 'Cohere',       tool: 'Cohere',             icon: '🔵', audience: 'business',
    angle: 'What is Cohere? A friendly, plain-English intro to its AI tools for businesses and what everyday users should know.' }
];

function normCompany(s) { return (s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

// Mely cégekhez VAN már útmutató(-téma)? (a topics company mezője alapján)
function coveredCompanySet(store) {
  const set = new Set();
  for (const t of store.topics) if (t.company) set.add(normCompany(t.company));
  return set;
}
// 0-útmutatós ("hiányzó") cégek a katalógusból
function missingCompanies(store) {
  const covered = coveredCompanySet(store);
  return COMPANY_CATALOG.filter(c => !covered.has(normCompany(c.company)));
}
// Determinisztikus lefedettségi téma minden hiányzó céghez (LLM nélkül, ingyen)
function addCompanyCoverage(store, max = 99) {
  const missing = missingCompanies(store);
  const usedIds = new Set(store.topics.map(t => t.id).filter(Boolean));
  let added = 0;
  for (const c of missing) {
    if (added >= max) break;
    const title = `Getting started with ${c.tool}: a beginner's guide`;
    const id = uniqueId(slugify(`getting-started-${c.tool}`), usedIds);
    store.topics.push({
      id, company: c.company, tool: c.tool, title,
      audience: c.audience || 'both', level: 'beginner',
      angle: c.angle || `A friendly first look at ${c.tool} (by ${c.company}) for everyday people: what it is, what it does well, and the easiest way to try it for free.`,
      status: 'todo', icon: c.icon || '🏢',
      priority: 'coverage', proposed_at: new Date().toISOString(), proposed_by: 'company-coverage'
    });
    added++;
  }
  return { added, missing: missing.map(m => m.company) };
}

// ===================================================================
// KIEGYENLÍTÉS (--balance) — minden céget egy ALSÓ KÜSZÖBIG felhozunk,
// hogy ne tűnjön egyik cég fontosabbnak. A leginkább lemaradókat előbb.
// ===================================================================
const GUIDES_PER_COMPANY_TARGET = (() => {
  try { return JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf-8')).limits?.guides_per_company_target ?? 4; }
  catch { return 4; }
})();

// Cégenkénti hiány a DINAMIKUS célig (deficit szerint csökkenő sorrend).
// A cél = a LEGTÖBB útmutatóval bíró cég száma (min. a floor) — így ahogy a
// vezető cégek bővülnek (pl. hír-párosításból), a lemaradók célja is NŐ, és a
// rés NEM szélesedik. A napi írás-tempót külön a daily_guides_max (4) fogja.
function dynamicTarget(store, floor = GUIDES_PER_COMPANY_TARGET) {
  const counts = companyCounts(store);
  const max = Math.max(floor, ...COMPANY_CATALOG.map(c => counts[normCompany(c.company)] || 0));
  return max;
}
function companyDeficits(store, target = dynamicTarget(store)) {
  const counts = companyCounts(store);
  return COMPANY_CATALOG
    .map(c => ({ company: c.company, tool: c.tool, audience: c.audience, count: counts[normCompany(c.company)] || 0 }))
    .filter(c => c.count < target)
    .map(c => ({ ...c, need: target - c.count }))
    .sort((a, b) => b.need - a.need);
}

const BALANCE_SYSTEM_PROMPT = `You are the editorial planner for AI World Co. Propose SPECIFIC, varied, genuinely useful BEGINNER guide topics for given AI tools, so each company has a fair, balanced set of guides (no company should look more important than another).

Return ONLY a JSON array: [{"title":"...","company":"OpenAI","tool":"ChatGPT","audience":"personal|business|both","level":"beginner|intermediate","angle":"one practical sentence","icon":"🤖"}]`;

async function proposeCompanyTopics(needs, store, brandContext) {
  const existingByCompany = {};
  for (const t of store.topics) if (t.company) (existingByCompany[normCompany(t.company)] ||= []).push(t.title);
  const usedIds = new Set(store.topics.map(t => t.id).filter(Boolean));

  const ask_lines = needs.map(n => {
    const have = (existingByCompany[normCompany(n.company)] || []).slice(0, 8).map(t => `"${t}"`).join(', ') || '(none yet)';
    return `- ${n.company} (tool: ${n.tool}) — need ${n.need} NEW topics. Already has: ${have}`;
  }).join('\n');
  const total = needs.reduce((s, n) => s + n.need, 0);

  const userPrompt = `Propose ${total} new beginner guide topics, distributed across these companies so each gets the requested count. Make each topic SPECIFIC and DIFFERENT from what the company already has (different tasks/use-cases, not reworded duplicates).

COMPANIES NEEDING MORE GUIDES:
${ask_lines}

Mix everyday-life and work uses. Plain English, beginner-friendly.

BRAND CONTEXT:
${brandContext}

Return ONLY the JSON array (${total} items), each with the correct "company" and "tool".`;

  const res = await ask(userPrompt, { agentName: AGENT_NAME, systemPrompt: BALANCE_SYSTEM_PROMPT, maxTokens: 4000 });
  if (!res) return { added: 0, cost: 0 };

  const raw = extractJsonArray(res.text);
  const seenTitles = new Set(store.topics.map(t => normTitle(t.title)));
  let added = 0;
  for (const it of raw) {
    const title = (it.title || '').toString().trim();
    if (!title || title.length < 12) continue;
    if (seenTitles.has(normTitle(title))) continue;
    seenTitles.add(normTitle(title));
    const id = uniqueId(slugify(title), usedIds);
    store.topics.push({
      id,
      company: (it.company || '').toString().trim(),
      tool: (it.tool || '').toString().trim(),
      title,
      audience: ['personal', 'business', 'both'].includes(it.audience) ? it.audience : 'both',
      level: it.level === 'intermediate' ? 'intermediate' : 'beginner',
      angle: (it.angle || '').toString().trim(),
      status: 'todo', icon: (it.icon || '🏢').toString().trim(),
      priority: 'balance', proposed_at: new Date().toISOString(), proposed_by: 'guide-balance'
    });
    added++;
  }
  return { added, cost: res.costUsd || 0 };
}

async function runBalanceMode(limit, brandContext) {
  console.log(`⚖️  KIEGYENLÍTŐ MÓD — cél: min ${GUIDES_PER_COMPANY_TARGET} útmutató/cég`);
  console.log('─'.repeat(60));
  const store = loadTopics();
  let deficits = companyDeficits(store);
  if (!deficits.length) { console.log('   ✓ Minden cég eléri a küszöböt — nincs teendő.'); return; }

  // Csak a legnagyobb hiányokat töltjük EBBEN a körben (limit téma összesen)
  const picked = [];
  let budget = limit;
  for (const d of deficits) {
    if (budget <= 0) break;
    const take = Math.min(d.need, budget);
    picked.push({ ...d, need: take });
    budget -= take;
  }
  console.log('   Lemaradó cégek (ebben a körben):', picked.map(p => `${p.company} +${p.need}`).join(', '));

  const before = store.topics.length;
  const { added, cost } = await proposeCompanyTopics(picked, store, brandContext);
  if (added > 0) {
    saveTopics(store);
    console.log(`   ✅ ${added} kiegyenlítő téma a backlogba | költség $${cost.toFixed(4)}`);
    store.topics.slice(before).forEach(t => console.log(`      • ${t.title} [${t.company}]`));
  } else {
    console.log('   💤 Nem született új, nem-duplikátum téma.');
  }
}

// ===================================================================
// ÖTLETELŐ MÓD (--ideas N) — ÚJ, IDŐTÁLLÓ útmutató-témákat javasol
// ===================================================================
// Ha kifogyott a backlog (minden téma 'done'), a CEO idle-fill fázisa
// ezt hívja, hogy legyen MIT írni a maradék kapacitásból. NEM ír cikket,
// csak új 'todo' témákat fűz a guide-topics.json-hoz — duplikátum-szűréssel.
// ===================================================================

const IDEAS_SYSTEM_PROMPT = `You are the editorial planner for AI World Co., a site that teaches everyday people how to use AI in daily life (primary audience: Australia, but written for anyone).

Propose NEW, EVERGREEN, beginner-friendly guide topics — practical "how to…" tutorials people genuinely search for. Mix GENERAL topics (not tied to one company) with COMPANY/TOOL-specific ones (ChatGPT, Gemini, Claude, Copilot, Midjourney, etc.). Favour useful, timeless skills over news.

Return ONLY a JSON array, no prose, in this exact shape:
[
  {
    "title": "Clear how-to title (60-90 chars), plain English",
    "company": "OpenAI",          // company name, or "" if general
    "tool": "ChatGPT",            // tool name, or "" if general
    "audience": "personal" | "business" | "both",
    "level": "beginner" | "intermediate",
    "angle": "One sentence: the specific, practical focus / the single most useful takeaway.",
    "icon": "✍️"                  // one relevant emoji
  }
]`;

// Laza, CSONKOLÁS-TŰRŐ JSON-kinyerés: kódkeret le, az első [-tól indul, és ha
// a tömb a token-limit miatt félbeszakadt, az utolsó teljes }-ig vágva zárjuk.
function extractJsonArray(text) {
  let t = (text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const s = t.indexOf('[');
  if (s === -1) return [];
  t = t.slice(s);
  const e = t.lastIndexOf(']');
  if (e > 0) { try { const v = JSON.parse(t.slice(0, e + 1)); if (Array.isArray(v)) return v; } catch { /* megpróbáljuk menteni */ } }
  // Mentés csonkolt válaszból: az utolsó teljes objektumig + tömbzárás
  const lastBrace = t.lastIndexOf('}');
  if (lastBrace > 0) { try { const v = JSON.parse(t.slice(0, lastBrace + 1) + ']'); if (Array.isArray(v)) return v; } catch { /* feladjuk */ } }
  return [];
}

// Cím-normalizálás a duplikátum-szűréshez (kisbetű, csak betű/szám)
function normTitle(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Egyedi id biztosítása (a slug ütközne meglévővel? → -2, -3 …)
function uniqueId(base, used) {
  let id = base || 'guide', n = 2;
  while (used.has(id)) id = `${base}-${n++}`;
  used.add(id);
  return id;
}

async function proposeNewTopics(count, store, brandContext) {
  const existingTitles = new Set(store.topics.map(t => normTitle(t.title)));
  const usedIds = new Set(store.topics.map(t => t.id).filter(Boolean));
  // A meglévő címek egy részét megmutatjuk, hogy NE ismételje őket
  const sample = store.topics.slice(-25).map(t => `- ${t.title}`).join('\n');

  // Fél-lefedett cégek (1 útmutató): ezekhez kérünk inkább újat ("alsók")
  const counts = {};
  for (const t of store.topics) if (t.company) counts[normCompany(t.company)] = (counts[normCompany(t.company)] || 0) + 1;
  const underCovered = COMPANY_CATALOG
    .map(c => ({ name: c.company, n: counts[normCompany(c.company)] || 0 }))
    .filter(c => c.n > 0 && c.n < 3)
    .map(c => c.name);
  const coverageHint = underCovered.length
    ? `\n\nThese tracked companies have only a FEW guides — please lean towards them (give at least some of your ideas to them): ${underCovered.join(', ')}.`
    : '';

  const userPrompt = `Propose ${count + 4} brand-new beginner guide topics for AI World Co.

DO NOT repeat or lightly reword any of these EXISTING topics:
${sample}

Pick fresh, genuinely useful angles people want (e.g. everyday tasks, study, small business, parents, job hunting, accessibility, safety/privacy, comparing tools, free vs paid, mobile apps, voice, images, spreadsheets, email). Aim for a healthy mix of general and company-specific.${coverageHint}

BRAND CONTEXT:
${brandContext}

Return ONLY the JSON array (${count + 4} items).`;

  const res = await ask(userPrompt, { agentName: AGENT_NAME, systemPrompt: IDEAS_SYSTEM_PROMPT, maxTokens: 4000 });
  if (!res) return { added: 0, cost: 0 };

  const raw = extractJsonArray(res.text);
  let added = 0;
  for (const it of raw) {
    const title = (it.title || '').toString().trim();
    if (!title || title.length < 12) continue;
    if (existingTitles.has(normTitle(title))) continue;     // már van ilyen
    existingTitles.add(normTitle(title));                    // a mostani batch-en belül se duplázzon
    const id = uniqueId(slugify(title), usedIds);
    store.topics.push({
      id,
      company: (it.company || '').toString().trim(),
      tool: (it.tool || '').toString().trim(),
      title,
      audience: ['personal', 'business', 'both'].includes(it.audience) ? it.audience : 'both',
      level: it.level === 'intermediate' ? 'intermediate' : 'beginner',
      angle: (it.angle || '').toString().trim(),
      status: 'todo',
      icon: (it.icon || '💡').toString().trim(),
      proposed_at: new Date().toISOString(),
      proposed_by: 'guide-ideas'
    });
    added++;
    if (added >= count) break;
  }
  return { added, cost: res.costUsd || 0 };
}

async function runIdeasMode(count, brandContext) {
  console.log(`💡 ÖTLETELŐ MÓD — cél: ${count} új téma (cég-lefedettség előnyben)`);
  console.log('─'.repeat(60));
  const store = loadTopics();
  let before = store.topics.length;

  // 1) LEFEDETTSÉG ELŐSZÖR: a 0-útmutatós cégeket töltjük fel (ingyen, LLM nélkül)
  const cov = addCompanyCoverage(store, count);
  if (cov.added > 0) {
    console.log(`   🏢 ${cov.added} hiányzó céghez coverage-téma:`);
    store.topics.slice(before).forEach(t => console.log(`      • ${t.title} [${t.company}]`));
    before = store.topics.length;
  }

  // 2) MARADÉK helyre általános LLM-ötletelés (változatos témák)
  let llmAdded = 0, cost = 0;
  const remaining = count - cov.added;
  if (remaining > 0) {
    const r = await proposeNewTopics(remaining, store, brandContext);
    llmAdded = r.added; cost = r.cost;
    store.topics.slice(before).forEach(t => console.log(`      • ${t.title}${t.company ? ` [${t.company}]` : ''}`));
  }

  if (cov.added + llmAdded > 0) {
    saveTopics(store);
    console.log(`   ✅ Összesen ${cov.added + llmAdded} új téma (${cov.added} cég-lefedettség + ${llmAdded} ötlet), backlog: ${store.topics.length} | költség $${cost.toFixed(4)}`);
  } else {
    console.log('   💤 Nem született új téma (minden cég lefedve, és nincs új ötlet).');
  }
}

async function runCoverMode() {
  console.log('🏢 CÉG-LEFEDETTSÉG MÓD — minden követett céghez legyen útmutató');
  console.log('─'.repeat(60));
  const store = loadTopics();
  const { added, missing } = addCompanyCoverage(store);
  if (added > 0) {
    saveTopics(store);
    console.log(`   ✅ ${added} hiányzó-cég téma hozzáadva: ${missing.slice(0, added).join(', ')}`);
  } else {
    console.log('   ✓ Minden követett céghez van már útmutató(-téma). Nincs teendő.');
  }
}

async function loadLessons() {
  const hits = await recallSemantic('guide structure clarity steps beginners common mistakes rejection', { scope: 'guide', limit: 6 });
  if (!hits.length) return '';
  const reasons = [...new Set(hits.map(h => h.text))].slice(0, 8);
  return `\n\nLESSONS FROM PAST FEEDBACK (avoid these):\n${reasons.map(r => `- ${r}`).join('\n')}`;
}

const GUIDE_SYSTEM_PROMPT = `You are the Guide Agent for AI World Co., a site that teaches everyday people how to use AI in daily life. (Primary audience: Australia — but written so ANYONE can read it; do not address "Australians" or say "here in Australia".)

YOUR JOB: write an ORIGINAL, practical, STEP-BY-STEP guide (a mini tutorial/presentation) that a complete beginner can follow.

⚠️ ORIGINALITY (most important): You may name the real tool/company you are teaching about (e.g. ChatGPT, Gemini, Claude). But DO NOT copy, paraphrase or quote any company's documentation, help pages or marketing. Write our OWN clear, friendly explanation from scratch. No "Source:" line, no external links.

TONE & RULES:
- Australian English (colour, organise, centre). Warm, encouraging, teaching voice. No clichés.
- Explain EVERY technical term the first time, in plain words with a relatable analogy.
- Be concrete and practical. Every step should be something the reader can actually DO.
- NEVER put any company or product down. Be neutral and kind, especially in comparisons.
- No invented facts, fake numbers, or made-up menu items. If a UI detail may vary, say so ("look for a button like…").
- Safe: no medical/financial/legal advice, no politics.

BEGINNER-CLARITY RULES (MANDATORY — a complete beginner must be able to follow
every step without getting lost or misled; the Reviewer rejects guides that fail):
- EVERY step weaves in all SIX parts: (1) the exact ACTION (one per step),
  (2) WHAT YOU SEE on screen at that moment, (3) WHAT HAPPENS after the action,
  (4) an "IF IT LOOKS DIFFERENT" fallback (apps vary by device and change often),
  (5) a 💬 Example to copy where the step involves typing, and
  (6) a SUCCESS CHECK: end with "You'll know it worked when …".
- Each step is 60–140 words. Two thin sentences per step is NOT acceptable.
- HONESTY: never state uncertain UI details as fact (use "look for a button
  like …"); never over-promise what the tool will do — say what USUALLY happens
  and what to do when it doesn't; say plainly if a feature may need a paid plan;
  include one honest sentence about what the tool CANNOT do for this task.
- "Before you start" lists EVERYTHING needed (account, app/website, device,
  free-or-paid plan, rough total time) so nobody hits a surprise blocker later.

OUTPUT FORMAT: Markdown with YAML frontmatter, then the guide body, in EXACTLY this shape:
---
title: "Clear, descriptive title (60-80 chars)"
subtitle: "One practical, benefit-focused sentence (100-150 chars)"
category: "guide"
audience: "personal" | "business" | "both"
company: "OpenAI"          # the company, or "" if general
tool: "ChatGPT"            # the tool, or "" if general
level: "beginner" | "intermediate"
read_time_minutes: 6
tags: ["getting-started", "chatgpt"]
---

# Title

**Hook (1-2 sentences):** what the reader will be able to do by the end, and who this is for.

## Before you start
- 1-3 quick prerequisites (an account, the app, etc.). Keep it short.

## Step 1 — <short action>
The exact action + what you see on screen + what happens next + what to do if
it looks different on your device + "You'll know it worked when …" (60-140 words).
💬 Example: a concrete example the reader can copy.

## Step 2 — <short action>
…(write 4 to 7 steps total, EACH with the six parts; 💬 Example where the reader types something)…

## Common mistakes
- 3 friendly "watch out for…" points, each naming the mistake AND the fix.

## What this means for you
- **In everyday life:** a concrete personal use.
- **For your business or work:** a concrete professional use.
- **If you're just getting started:** the easiest first move.

## Try it now
One concrete action the reader can take in the next 2 minutes.

Write 700-1200 words. Output ONLY the markdown — no commentary.`;

function buildUserPrompt(topic, brandContext, lessons, skills) {
  const subject = topic.company || topic.tool
    ? `Tool/company: ${[topic.company, topic.tool].filter(Boolean).join(' — ')}`
    : `General topic (not tied to one company)`;
  return `Write a complete, ORIGINAL step-by-step guide.

GUIDE TITLE TO WRITE: "${topic.title}"
${subject}
Audience: ${topic.audience} · Level: ${topic.level || 'beginner'}
Angle / what to focus on (a hint, write it in your own words): ${topic.angle || ''}

Follow the exact output format from your instructions (frontmatter + Before you start + numbered Steps + Common mistakes + What this means for you + Try it now). Keep it beginner-friendly and genuinely useful.

BRAND CONTEXT (must follow):
${brandContext}${lessons}${skills}

Now write the guide. Output the markdown only.`;
}

// Kötelező szerkezet megléte (a self-checkhez + a pipeline-kompatibilitáshoz)
function hasGuideStructure(md) {
  if (!md) return false;
  const fm = md.trimStart().startsWith('---');
  const impact = /what this means for you/i.test(md);
  const steps = (md.match(/^##\s*Step\s*\d/gim) || []).length >= 2;
  return fm && impact && steps;
}

function slugify(t) {
  return (t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

function saveGuide(topic, response) {
  if (!existsSync(DRAFTS_DIR)) mkdirSync(DRAFTS_DIR, { recursive: true });
  const filename = `WRITER_GUIDE_${topic.id || slugify(topic.title)}.json`;
  const out = {
    _meta: {
      type: 'guide',
      rules_version: 2,   // guide-quality-rules.md szerint íródott (kezdő-érthetőség)
      guide_topic_id: topic.id || null,
      company: topic.company || '',
      tool: topic.tool || '',
      icon: topic.icon || '',
      level: topic.level || 'beginner',
      source_news: topic.source_news || null,   // hír→útmutató kereszthivatkozáshoz
      written_at: new Date().toISOString(),
      writer_provider: response.provider,
      writer_model: response.model,
      writer_cost_usd: response.costUsd,
      source_id: 'guide', source_name: 'AI World Guide', source_link: '',
      status: 'awaiting-review'
    },
    article_markdown: response.text,
    original_title: topic.title
  };
  writeFileSync(join(DRAFTS_DIR, filename), JSON.stringify(out, null, 2), 'utf-8');
  return filename;
}

async function writeGuide(topic, brandContext) {
  const lessons = await loadLessons();
  const skills = skillsBlock('guide');
  const userPrompt = buildUserPrompt(topic, brandContext, lessons, skills);

  let response = await ask(userPrompt, { agentName: AGENT_NAME, systemPrompt: GUIDE_SYSTEM_PROMPT, maxTokens: 10000 });
  if (response && !hasGuideStructure(response.text)) {
    console.log('   ↻ Hiányos szerkezet — újrapróbálom nyomatékkal...');
    const retry = await ask(userPrompt + `\n\n⚠️ CRITICAL: Use YAML frontmatter (---), at least 2 "## Step N — …" headings, and a "## What this means for you" section. Write the full guide again.`,
      { agentName: AGENT_NAME, systemPrompt: GUIDE_SYSTEM_PROMPT, maxTokens: 10000 });
    if (retry && hasGuideStructure(retry.text)) { retry.costUsd += response.costUsd; response = retry; }
  }
  return response;
}

// ===================================================================
// REWORK MÓD — az Ellenőrző VISSZAADTA az útmutatót javításra
// ===================================================================
// A guide-okat az Író NEM dolgozza át (cikké írná), ezért az ÚTMUTATÓ-
// AGENT javítja őket — az eredeti lépésről-lépésre formátumban, az
// Ellenőrző konkrét kifogásai alapján. A felhasználó kérése: a guide
// SOHA nem kerül végleg feladásra — GUIDE_MAX_REWORK körig próbáljuk,
// utána a CEO (escalate-guides.js) hoz végső döntést.
// ===================================================================

function collectFeedback(meta) {
  const points = [];
  if (meta?.auto_check?.issues?.length) points.push(...meta.auto_check.issues);
  if (meta?.ai_review?.issues?.length) points.push(...meta.ai_review.issues);
  if (meta?.ai_review?.verdict) points.push(`Reviewer verdict: ${meta.ai_review.verdict}`);
  if (meta?.reason && points.length === 0) points.push(meta.reason);
  return [...new Set(points)];
}

// Nem a guide hibája, hanem az Ellenőrző akadt meg (pl. JSON-parse hiba)?
function isReviewerSideFailure(meta) {
  const autoOk = !(meta?.auto_check?.issues?.length);
  const glitch = /could not parse|parse error|json/i.test(
    [meta?.reason, meta?.ai_review?.verdict, ...(meta?.ai_review?.issues || [])].join(' ')
  );
  return autoOk && glitch;
}

function listRejectedGuidesForRework() {
  if (!existsSync(REJECTED_DIR)) return [];
  return readdirSync(REJECTED_DIR)
    .filter(f => f.startsWith('REJECTED_') && f.endsWith('.json'))
    .filter(f => {
      try {
        const d = JSON.parse(readFileSync(join(REJECTED_DIR, f), 'utf-8'));
        const attempts = d._meta?.rework_attempts || 0;
        // CSAK guide; a CEO végső döntése (ceo_decision) után már nem nyúlunk hozzá
        return d._meta?.type === 'guide' && !d._meta?.ceo_decision
          && d._meta?.can_retry !== false && attempts < GUIDE_MAX_REWORK;
      } catch { return false; }
    })
    .sort();
}

async function reworkGuide(rejectedData, brandContext) {
  const feedback = collectFeedback(rejectedData._meta);
  const original = rejectedData.article_markdown || '';
  const lessons = await loadLessons();   // szemantikus memória (scope:'guide')
  const skills = skillsBlock('guide');

  const userPrompt = `One of your earlier step-by-step GUIDES was sent BACK by the Reviewer. Fix it — keep what works, repair the SPECIFIC problems, and return the full corrected guide in the SAME step-by-step format.

THE REVIEWER'S SPECIFIC PROBLEMS (you MUST address every one):
${feedback.map((f, i) => `${i + 1}. ${f}`).join('\n')}

KEEP THE GUIDE FORMAT (this is a guide, NOT a news article):
- YAML frontmatter with category: "guide".
- "## Before you start", then 3-6 "## Step N — …" headings, then "## Common mistakes", "## What this means for you", "## Try it now".
- 💬 Example lines where helpful. Australian English, warm teaching tone, explain every term.
- ORIGINAL writing only — never copy company docs, no "Source:" line, no external links.

THE GUIDE TO FIX (rewrite it fully, corrected):
${original}

BRAND CONTEXT (must follow):
${brandContext}${lessons}${skills}

Now output ONLY the corrected guide markdown — no commentary.`;

  let response = await ask(userPrompt, { agentName: AGENT_NAME, systemPrompt: GUIDE_SYSTEM_PROMPT, maxTokens: 10000 });
  if (response && !hasGuideStructure(response.text)) {
    const retry = await ask(userPrompt + `\n\n⚠️ CRITICAL: Use YAML frontmatter (---), at least 2 "## Step N — …" headings, and a "## What this means for you" section. Write the full corrected guide again.`,
      { agentName: AGENT_NAME, systemPrompt: GUIDE_SYSTEM_PROMPT, maxTokens: 10000 });
    if (retry && hasGuideStructure(retry.text)) { retry.costUsd += response.costUsd; response = retry; }
  }
  return response;
}

// Visszatesszük WRITER_GUIDE_ néven az Ellenőrzőhöz, növeljük a számlálót.
// requeued=true → nem írtuk át (ellenőrző-glitch), a számlálót NEM növeljük
// (nem a guide hibája, ne fogyassza a 4 próbát).
function saveGuideBackToReview(rejectedFilename, rejectedData, { text, provider, model, costUsd, requeued }) {
  const writerFilename = rejectedFilename.replace(/^REJECTED_/, 'WRITER_');
  const prevAttempts = rejectedData._meta?.rework_attempts || 0;
  const out = {
    _meta: {
      ...rejectedData._meta,
      written_at: new Date().toISOString(),
      writer_provider: provider,
      writer_model: model,
      writer_cost_usd: costUsd,
      rework_attempts: requeued ? prevAttempts : prevAttempts + 1,
      reworked_from: rejectedFilename,
      requeued_unchanged: !!requeued,
      status: 'awaiting-review'
    },
    article_markdown: text,
    original_title: rejectedData.original_title
  };
  if (!existsSync(DRAFTS_DIR)) mkdirSync(DRAFTS_DIR, { recursive: true });
  writeFileSync(join(DRAFTS_DIR, writerFilename), JSON.stringify(out, null, 2), 'utf-8');
  unlinkSync(join(REJECTED_DIR, rejectedFilename));
  return writerFilename;
}

async function runGuideReworkMode(brandContext) {
  const rejected = listRejectedGuidesForRework();
  console.log('🔁 ÚTMUTATÓ REWORK MÓD — visszaadott guide-ok javítása');
  if (rejected.length === 0) {
    console.log('   💤 Nincs javítható elutasított útmutató (vagy a CEO elé vár).');
    return;
  }
  console.log(`   📋 ${rejected.length} útmutató vár átdolgozásra\n`);

  let fixed = 0, requeued = 0, gaveUp = 0, cost = 0;
  for (const filename of rejected) {
    const data = JSON.parse(readFileSync(join(REJECTED_DIR, filename), 'utf-8'));
    const attempt = (data._meta?.rework_attempts || 0) + 1;

    // ESET A: Ellenőrző-glitch (nem a guide hibája) → változatlanul újra, számláló marad
    if (isReviewerSideFailure(data._meta)) {
      console.log(`↩️  Újra-sorba (ellenőrző-hiba, nem a guide-é): ${filename.slice(0, 50)}...`);
      const w = saveGuideBackToReview(filename, data, {
        text: data.article_markdown, provider: data._meta?.writer_provider, model: data._meta?.writer_model, costUsd: 0, requeued: true
      });
      console.log(`   ✅ Változatlanul visszaküldve → ${w} (0 költség)\n`);
      requeued++;
      continue;
    }

    // ESET B: valódi hiba → átdolgozás
    console.log(`🔧 Átdolgozás (${attempt}/${GUIDE_MAX_REWORK}): ${filename.slice(0, 55)}...`);
    collectFeedback(data._meta).slice(0, 3).forEach(f => console.log(`      • javítandó: ${String(f).slice(0, 70)}`));

    const response = await reworkGuide(data, brandContext);
    if (!response) { console.log('   ❌ Nem sikerült (AI router null) — marad elutasítva\n'); gaveUp++; continue; }

    const w = saveGuideBackToReview(filename, data, { text: response.text, provider: response.provider, model: response.model, costUsd: response.costUsd });
    cost += response.costUsd || 0;
    fixed++;
    console.log(`   ✅ Javítva → ${w} (újraellenőrzésre vár)\n`);

    // KOMMUNIKÁCIÓ: visszaszólunk az Ellenőrzőnek, MIT javítottunk; és ha olyan
    // ADATOT kérnek, amit nem találhatunk ki (tény/szám/forrás), azt jelezzük.
    const title = data.original_title || filename;
    const fb = collectFeedback(data._meta);
    const ref = w.replace(/^(REJECTED_|WRITER_|ARTICLE_)/, '');
    message('guide', 'ellenorzo', 'fix', `Átdolgoztam: "${title}" — javítva: ${fb.slice(0, 2).join('; ') || 'a jelzett hibák'}; újraküldöm.`, { ref });
    if (fb.some(f => /fact|number|statistic|figure|source|cite|citation|evidence|data|reference/i.test(f))) {
      message('guide', 'ceo', 'need', `Kell még adat: "${title}" — az Ellenőrző tényt/forrást kér, amit nem találhatok ki: ${fb.find(f => /fact|number|statistic|figure|source|cite|citation|evidence|data|reference/i.test(f))}`, { ref });
    }
  }

  console.log('─'.repeat(60));
  console.log(`📊 ÚTMUTATÓ REWORK: ${fixed} átdolgozva, ${requeued} újra-sorba (ingyen), ${gaveUp} sikertelen | költség $${cost.toFixed(4)}`);
}

// ===================================================================
// UPGRADE MÓD (--upgrade [N]) — a MÁR PUBLIKÁLT útmutatók felhozása a
// guide-quality-rules.md (rules_version 2) szintjére. 2026-07-03 user-kérés:
// "a leírások legyenek részletesebbek, félreviszik a kezdő felhasználókat".
// ===================================================================
// Működés: ARTICLE_GUIDE_* → átírt WRITER_GUIDE_* draft (meta átvéve,
// rules_version:2, upgraded_from) → a NORMÁL Ellenőrző-pipeline dönt.
// Az eredeti cikk addig él, amíg az új át nem megy (published_at megmarad,
// mert a WRITER→ARTICLE név ugyanaz). Idempotens: a rules_version>=2 cikkeket
// és a már drafts-ban váró párokat kihagyja — megszakítható, folytatható.
// ===================================================================

const ARTICLES_DIR = join(ROOT, 'content', 'articles');

function listUpgradeCandidates() {
  if (!existsSync(ARTICLES_DIR)) return [];
  return readdirSync(ARTICLES_DIR)
    .filter(f => f.startsWith('ARTICLE_') && f.endsWith('.json'))
    .filter(f => {
      try {
        const d = JSON.parse(readFileSync(join(ARTICLES_DIR, f), 'utf-8'));
        if (d._meta?.type !== 'guide') return false;
        if ((d._meta?.rules_version || 1) >= 2) return false;           // már friss
        const writerName = f.replace(/^ARTICLE_/, 'WRITER_');
        if (existsSync(join(DRAFTS_DIR, writerName))) return false;     // már sorban áll
        const rejName = f.replace(/^ARTICLE_/, 'REJECTED_');
        if (existsSync(join(REJECTED_DIR, rejName))) return false;      // rework alatt
        return true;
      } catch { return false; }
    })
    .sort();
}

async function upgradeGuide(articleData, brandContext) {
  const original = articleData.article_markdown || '';
  const skills = skillsBlock('guide');

  const userPrompt = `One of our OLDER PUBLISHED guides was written under thinner quality rules and is too vague for a complete beginner. REWRITE it so it fully meets the current beginner-clarity rules (see BRAND CONTEXT, especially guide-quality-rules.md).

WHAT TO KEEP:
- The SAME title, and the same frontmatter values (title, subtitle may be lightly improved; keep audience, company, tool, level, tags; update read_time_minutes to match the new length).
- The same topic and the same overall teaching goal; keep the step order where it makes sense.

WHAT TO IMPROVE (this is the point):
- EXPAND every step to the six mandatory parts: exact action, what you see on screen, what happens next, an "if it looks different" fallback, a 💬 Example where the reader types something, and a "You'll know it worked when …" success check. Each step 60-140 words.
- Fix anything vague ("find the settings") or potentially misleading (uncertain UI details stated as fact, over-promises, hidden paywalls, missing prerequisites).
- "Before you start" must list EVERYTHING needed. "Common mistakes" gets 3 points, each with mistake AND fix. Total 700-1200 words.

THE PUBLISHED GUIDE TO UPGRADE:
${original}

BRAND CONTEXT (must follow):
${brandContext}${skills}

Now output ONLY the upgraded guide markdown — no commentary.`;

  let response = await ask(userPrompt, { agentName: AGENT_NAME, systemPrompt: GUIDE_SYSTEM_PROMPT, maxTokens: 10000 });
  if (response && !hasGuideStructure(response.text)) {
    const retry = await ask(userPrompt + `\n\n⚠️ CRITICAL: Use YAML frontmatter (---), at least 2 "## Step N — …" headings, and a "## What this means for you" section. Write the full upgraded guide again.`,
      { agentName: AGENT_NAME, systemPrompt: GUIDE_SYSTEM_PROMPT, maxTokens: 10000 });
    if (retry && hasGuideStructure(retry.text)) { retry.costUsd += response.costUsd; response = retry; }
  }
  return response;
}

async function runUpgradeMode(limit, brandContext, idFilter) {
  console.log(`⬆️  UPGRADE MÓD — publikált útmutatók felhozása a rules_version 2 szintre${limit ? ` (max ${limit})` : ''}`);
  console.log('─'.repeat(60));
  let candidates = listUpgradeCandidates();
  if (idFilter) candidates = candidates.filter(f => f.includes(idFilter));
  if (!candidates.length) { console.log('   ✓ Minden publikált útmutató a friss szabályok szerint készült. Nincs teendő.'); return; }
  const batch = limit ? candidates.slice(0, limit) : candidates;
  console.log(`   📋 Elavult szabályú útmutató: ${candidates.length} | most átdolgozandó: ${batch.length}\n`);

  let done = 0, failed = 0, cost = 0;
  for (const file of batch) {
    const data = JSON.parse(readFileSync(join(ARTICLES_DIR, file), 'utf-8'));
    console.log(`⬆️  ${(data.original_title || file).slice(0, 60)}...`);
    const response = await upgradeGuide(data, brandContext);
    if (!response || !hasGuideStructure(response.text)) { console.log('   ❌ Sikertelen (router/struktúra) — az eredeti marad élőben\n'); failed++; continue; }

    const writerName = file.replace(/^ARTICLE_/, 'WRITER_');
    const out = {
      _meta: {
        // az EREDETI meta öröklődik (guide_topic_id, company, tool, icon,
        // source_news, source_* stb.) — a review-mezőket a friss kör tölti újra
        ...data._meta,
        auto_check: undefined, ai_review: undefined,
        rules_version: 2,
        upgraded_from: file,
        rework_attempts: 0,
        written_at: new Date().toISOString(),
        writer_provider: response.provider,
        writer_model: response.model,
        writer_cost_usd: response.costUsd,
        status: 'awaiting-review'
      },
      article_markdown: response.text,
      original_title: data.original_title
    };
    if (!existsSync(DRAFTS_DIR)) mkdirSync(DRAFTS_DIR, { recursive: true });
    writeFileSync(join(DRAFTS_DIR, writerName), JSON.stringify(out, null, 2), 'utf-8');
    cost += response.costUsd || 0;
    done++;
    console.log(`   ✅ Átírva → ${writerName} (Ellenőrzőre vár, $${(response.costUsd || 0).toFixed(4)})\n`);
  }

  console.log('─'.repeat(60));
  console.log(`📊 UPGRADE: ${done} átírva (Ellenőrzőre vár), ${failed} sikertelen, hátra: ${candidates.length - batch.length} | költség $${cost.toFixed(4)}`);
  if (done > 0) console.log('   ➡️  Következő lépés: node agents/ellenorzo/agent.js');
}

async function main() {
  const args = parseArgs();

  // UPGRADE MÓD: publikált útmutatók felhozása az új szabály-szintre
  if (args.upgrade) {
    await runUpgradeMode(args.upgradeLimit, loadBrandContext(), args.id);
    return;
  }

  // REWORK MÓD: az Ellenőrző visszaadott útmutatókat javítjuk (nem új írás)
  if (args.rework) {
    console.log('📘 ÚTMUTATÓ AGENT — REWORK');
    console.log('─'.repeat(60));
    await runGuideReworkMode(loadBrandContext());
    return;
  }

  // CÉG-LEFEDETTSÉG MÓD: a hiányzó cégekhez téma (ingyen, LLM nélkül)
  if (args.cover) {
    await runCoverMode();
    return;
  }

  // KIEGYENLÍTŐ MÓD: a lemaradó cégeket felhozzuk a küszöbig
  if (args.balance > 0) {
    await runBalanceMode(args.balance, loadBrandContext());
    return;
  }

  // ÖTLETELŐ MÓD: ÚJ témákat fűzünk a backloghoz (nem írunk cikket)
  if (args.ideas > 0) {
    await runIdeasMode(args.ideas, loadBrandContext());
    return;
  }

  console.log('📘 ÚTMUTATÓ AGENT INDUL');
  console.log('─'.repeat(60));

  const brandContext = loadBrandContext();
  const store = loadTopics();
  const topics = pickTopics(store, args);

  if (!topics.length) {
    console.log('💤 Nincs feldolgozandó téma (vagy mind "done"). Adj hozzá a guides/guide-topics.json-ban, vagy --id-val kérj egyet.');
    return;
  }
  console.log(`🎯 Feldolgozandó útmutató: ${topics.length}\n`);

  const stats = { started_at: new Date().toISOString(), written: 0, failed: 0, total_cost_usd: 0, by_guide: [] };

  for (const topic of topics) {
    console.log(`📝 Útmutató: "${topic.title.slice(0, 60)}..."${topic.company ? ` [${topic.company}]` : ''}`);
    const response = await writeGuide(topic, brandContext);
    if (!response) { console.log('   ❌ Sikertelen (router null)\n'); stats.failed++; continue; }

    const filename = saveGuide(topic, response);
    stats.total_cost_usd += response.costUsd || 0;
    stats.written++;
    stats.by_guide.push({ id: topic.id, file: filename, cost: response.costUsd });

    // témát 'done'-ra állítjuk (az élő topics.json-ban)
    const t = store.topics.find(x => x.id === topic.id);
    if (t) { t.status = 'done'; t.written_at = new Date().toISOString(); }

    console.log(`   ✅ Kész → ${filename} ($${(response.costUsd || 0).toFixed(4)}, ${response.model})\n`);
  }
  saveTopics(store);

  // log
  if (!existsSync(LOGS_DIR)) mkdirSync(LOGS_DIR, { recursive: true });
  stats.finished_at = new Date().toISOString();
  writeFileSync(join(LOGS_DIR, `guide_${stats.started_at.replace(/[:.]/g, '-')}.json`), JSON.stringify(stats, null, 2), 'utf-8');

  console.log('─'.repeat(60));
  console.log(`📊 ÖSSZEFOGLALÓ: ${stats.written} útmutató megírva, ${stats.failed} sikertelen | költség $${stats.total_cost_usd.toFixed(4)}`);
  if (stats.written > 0) console.log(`✨ ${stats.written} útmutató vár az Ellenőrzőre (WRITER_GUIDE_* a content/drafts-ban)`);
}

main().catch(e => { console.error('💥 ÚTMUTATÓ HIBA:', e); process.exit(1); });
