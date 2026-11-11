// ===================================================================
// HÍR–ÚTMUTATÓ PÁROSÍTÓ AGENT (Pairing)
// ===================================================================
//
// FELADAT:
//   Eldönti, hogy egy PUBLIKÁLT hír "útmutatható"-e — azaz egy ÚJ,
//   hétköznapi ember által HASZNÁLHATÓ funkció/képesség/eszköz/mód —
//   és CSAK akkor készít hozzá útmutató-témát + kereszthivatkozást.
//
//   FONTOS (megbeszélt szabály): NEM minden hírhez való útmutató!
//   NEM útmutatható (kihagyjuk): cégek közti szövetség/partnerség,
//   tőzsdére lépés (IPO) / részvény / befektetés / cégérték, felvásárlás,
//   vezető-/szervezeti változás, jogi/szabályozási/üzletpolitikai hír,
//   tisztán kutatás/benchmark, üzleti esettanulmány, hír-összefoglaló.
//
// EREDMÉNY:
//   - útmutatható → új téma a guides/guide-topics.json-ba (status 'todo',
//     source_news a forrás-hírrel), a hír _meta-ja megkapja a related_guide_topic-ot.
//     (Az Útmutató-agent ezután megírja; a build kereszthivatkozza őket.)
//   - nem útmutatható → a hír _meta: pairing_checked + guide_worthy:false + indok.
//
// FUTTATÁS:
//   node agents/pairing/agent.js              -- a még nem vizsgált hírek
//   node agents/pairing/agent.js --recheck    -- mindet újraértékeli
//   node agents/pairing/agent.js --dry        -- csak megmutatja
// ===================================================================

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ask } from '../../core/ai-router.js';
import { message } from '../../core/ops.js';
import { canonicalChip } from '../../core/quality-guard.js';
// 📘 HÍR-ELSŐBBSÉG 3. RÉSZ (2026-11-11): elutasított LLM-termékhír → második esély a HIVATALOS súgóból.
import {
  masodikEselyKell, napiMaradek, sugoSzolgaltatok, valasztoPrompt, valasztoValasz, ellenorzoPrompt, ellenorzoValasz,
  meglevoTema, FUTAS_MAX as SUGO_FUTAS_MAX, MIN_SUGO_SZOVEG
} from '../../core/sugo-parositas.js';
import { indexLetolt } from '../../core/sugo-index.js';
import { cikkSzoveg } from '../../core/elakadas-gen.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const ARTICLES_DIR = join(ROOT, 'content', 'articles');
const TOPICS_PATH = join(ROOT, 'guides', 'guide-topics.json');
const LOGS_DIR = join(ROOT, 'logs');
const AGENT_NAME = 'pairing';

function parseArgs() {
  const a = process.argv.slice(2);
  return { recheck: a.includes('--recheck'), dry: a.includes('--dry'), limit: (() => {
    const i = a.indexOf('--limit'); return i >= 0 && a[i + 1] ? parseInt(a[i + 1], 10) : 50;
  })() };
}

function slugify(t) {
  return (t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

// Publikált HÍR-cikkek (nem útmutató), amiket még nem vizsgáltunk
function loadNews(args) {
  if (!existsSync(ARTICLES_DIR)) return [];
  const out = [];
  for (const file of readdirSync(ARTICLES_DIR).filter(f => f.startsWith('ARTICLE_') && f.endsWith('.json'))) {
    try {
      const data = JSON.parse(readFileSync(join(ARTICLES_DIR, file), 'utf-8'));
      if (data._meta?.type === 'guide') continue;
      if (!args.recheck && data._meta?.pairing_checked) continue;
      out.push({ file, data });
    } catch {}
  }
  return out.slice(0, args.limit);
}

function loadTopics() { return JSON.parse(readFileSync(TOPICS_PATH, 'utf-8')); }
function saveTopics(t) { writeFileSync(TOPICS_PATH, JSON.stringify(t, null, 2), 'utf-8'); }

function uniqueId(base, topics) {
  let id = base || ('news-guide-' + Date.now()); let n = 1;
  while (topics.some(t => t.id === id)) { n++; id = `${base}-${n}`; }
  return id;
}

// (11-11: a „van-e már ilyen téma” egyezés a core/sugo-parositas.js meglevoTema-jába költözött — a régi
// változat 2 közös általános szóra idegen eszközű témához is kötött.)

const SYSTEM_PROMPT = `You decide whether a published AI NEWS article should get a paired step-by-step GUIDE for everyday people. Be STRICT — most news does NOT deserve a guide.

Say guide_worthy = TRUE only if ALL of these hold:
1. The article introduces ONE specific, NAMED feature / tool / mode / setting (e.g. "ChatGPT Voice", "Gemini in Gmail", "image editing").
2. An ordinary person could go and USE that exact thing today — there is a concrete action to take.
3. The guide would be ABOUT that specific named thing, not a generic skill you had to infer.

Say guide_worthy = FALSE (there is nothing for a normal user to "do") for:
- news ROUNDUPS / recaps / "what we announced in <month>" / lists of multiple updates (always false)
- a company/customer STORY about how some business uses or built AI — false. STRONG signal: a headline like "How <CompanyName> ..." describing that company's OWN approach/transformation is a case study → false, even if it mentions AI agents/tools.
- a GENERIC topic you had to infer (e.g. "how to use AI agents", "how to use AI for software/work") that is NOT a specific named product introduced IN THIS article → false
- partnerships / alliances / deals; IPO / stock / funding / valuation / market or financial analysis
- acquisitions / mergers; executive or org changes / hiring
- legal / regulation / policy / governance; pure research / benchmarks / model cards
- anything where you would have to INVENT or GENERALISE a feature that the article does not concretely describe.

If unsure, choose FALSE. Output ONLY JSON (no prose, no code fence):
{"guide_worthy":true|false,"reason":"one short sentence","title":"How to ... (only if worthy)","company":"OpenAI or empty","tool":"ChatGPT or empty","angle":"one sentence on what to focus on","audience":"personal|business|both","level":"beginner|intermediate"}
IMPORTANT about "tool": it must be the CORE OFFICIAL PRODUCT NAME users recognize, in its SHORTEST form (ChatGPT, Copilot, Gemini, Claude, Le Chat, Alexa+, Hugging Face). NEVER: generic feature/technology phrases ("Reserved Capacity", "AI-powered assistants"), sub-feature suffixes ("Claude Projects" → "Claude"; "Gemini in Workspace" → "Gemini"; "ChatGPT API" → "ChatGPT"), parentheses ("Le Chat (Mistral)" → "Le Chat"), or comma lists. If there is no single clear product, leave "tool" EMPTY. (The site shows this as a brand chip on translated pages — anything beyond a pure brand name looks like an untranslated leftover. 2026-07-12)`;

async function classify(news) {
  const md = news.data.article_markdown || '';
  const userPrompt = `NEWS TITLE: "${news.data.original_title || ''}"

NEWS ARTICLE (our own write-up):
${md.slice(0, 4000)}

Decide if it deserves a paired how-to guide. Output ONLY the JSON.`;
  const response = await ask(userPrompt, { agentName: AGENT_NAME, systemPrompt: SYSTEM_PROMPT, maxTokens: 400, jsonMode: true });
  let parsed = null;
  if (response?.text) {
    let t = response.text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const s = t.indexOf('{'), e = t.lastIndexOf('}');
    if (s >= 0 && e >= 0) { try { parsed = JSON.parse(t.slice(s, e + 1)); } catch {} }
  }
  // Saját lecke, ha VOLT válasz, de értelmezhetetlen (stabil szöveg — 2026-07-16)
  if (response?.text && !parsed) {
    try { const { remember } = await import('../../core/memory-manager.js'); remember(AGENT_NAME, 'A párosító-válasz JSON-ja értelmezhetetlen volt — szigorúan a kért {"worthy":...} sémát kell kérni, felesleges szöveg nélkül.', { tags: ['parse-fail'] }); } catch { /* nem állít meg */ }
  }
  // GÉPI kanonizálás: a prompt-szabályt az AI néha átlépi ("NVIDIA ChatRTX",
  // 2026-07-13) — a cégnév-előtagot kód vágja le, kivétel-listával.
  if (parsed?.tool) parsed.tool = canonicalChip(parsed.tool, parsed.company);
  return { response, parsed };
}

/**
 * MÁSODIK ESÉLY A SÚGÓBÓL (core/sugo-parositas.js): a súgó cikklistájából az AI kiválaszt EGY cikket, letöltjük,
 * és az AI eldönti, hogy abból írható-e hétköznapi útmutató. Kitalálni tilos — ha nincs illő súgócikk, nincs téma.
 * @returns {{ok:boolean, reason:string, cost:number, url?:string, sugoCim?:string, title?:string, tool?:string,
 *   company?:string, angle?:string, level?:string, audience?:string}}
 */
async function sugoMasodikEsely(n, indexek) {
  const m = n.data._meta || {};
  const hir = {
    cim: n.data.original_title || '',
    kivonat: m.seo?.meta_description || String(n.data.article_markdown || '').replace(/[#*>`_[\]]/g, ' ').slice(0, 700)
  };
  const index = [];
  for (const s of sugoSzolgaltatok(m.source_id)) index.push(...(indexek[s] ||= await indexLetolt(s)));
  if (!index.length) return { ok: false, reason: 'a súgó cikklistája nem érhető el', cost: 0 };

  const p1 = valasztoPrompt(hir, index);
  const r1 = await ask(p1.felhasznalo, { agentName: AGENT_NAME, systemPrompt: p1.rendszer, maxTokens: 200, jsonMode: true });
  let cost = r1?.costUsd || 0;
  const cikk = valasztoValasz(r1?.text, index);
  if (!cikk) return { ok: false, reason: 'nincs illő súgócikk', cost };

  const sz = await cikkSzoveg(cikk.url);
  if (!sz || String(sz.szoveg || '').length < MIN_SUGO_SZOVEG) return { ok: false, reason: 'a súgócikk nem tölthető le: ' + cikk.url, cost };
  const sugoCim = sz.cim || cikk.cim;
  const p2 = ellenorzoPrompt(hir, { url: cikk.url, cim: sugoCim, szoveg: sz.szoveg });
  const r2 = await ask(p2.felhasznalo, { agentName: AGENT_NAME, systemPrompt: p2.rendszer, maxTokens: 400, jsonMode: true });
  cost += r2?.costUsd || 0;
  const v = ellenorzoValasz(r2?.text);
  if (!v.ok) return { ok: false, reason: `${v.reason} (${cikk.url})`, cost };
  if (v.tool) v.tool = canonicalChip(v.tool, v.company);
  return { ...v, url: cikk.url, sugoCim, cost };
}

function markNews(news, patch) {
  const data = news.data;
  data._meta = { ...data._meta, pairing_checked: true, pairing_checked_at: new Date().toISOString(), ...patch };
  writeFileSync(join(ARTICLES_DIR, news.file), JSON.stringify(data, null, 2), 'utf-8');
}

// A MÁR PUBLIKÁLT útmutató _meta-jába is beírjuk a forrás-hírt (visszafelé link),
// ha még nincs. (A téma frissítése csak a jövőbeli újraíráskor hatna.)
function patchPublishedGuideSource(topicId, news) {
  if (!existsSync(ARTICLES_DIR)) return;
  for (const f of readdirSync(ARTICLES_DIR).filter(x => x.startsWith('ARTICLE_') && x.endsWith('.json'))) {
    try {
      const d = JSON.parse(readFileSync(join(ARTICLES_DIR, f), 'utf-8'));
      if (d._meta?.type === 'guide' && d._meta?.guide_topic_id === topicId && !d._meta?.source_news) {
        d._meta.source_news = { file: news.file, title: news.data.original_title || '' };
        writeFileSync(join(ARTICLES_DIR, f), JSON.stringify(d, null, 2), 'utf-8');
        return f;
      }
    } catch {}
  }
  return null;
}

async function main() {
  const args = parseArgs();
  console.log('🔗 HÍR–ÚTMUTATÓ PÁROSÍTÓ AGENT');
  console.log('─'.repeat(60));

  const news = loadNews(args);
  if (!news.length) { console.log('💤 Nincs vizsgálandó hír (vagy mind ellenőrizve). --recheck az újraértékeléshez.'); return; }
  console.log(`🔎 ${news.length} hír osztályozása${args.dry ? ' (DRY)' : ''}\n`);

  const topics = loadTopics();
  // KÖZELI-TÉMA-ŐR referencia: a témalista + a KÉSZ guide-ok címei (2026-07-18)
  const { isNearDuplicateTitle, allExistingGuideTitles, logDedup, dedupBejegyzes } = await import('../../core/topic-dedup.js');
  const existingTitles = allExistingGuideTitles();
  let worthy = 0, linked = 0, skip = 0, cost = 0, nearDup = 0, sugoProba = 0, sugoTema = 0;
  const sugoIndexek = {};   // szolgáltatónként egyszer töltjük le a súgó cikklistáját

  for (const n of news) {
    const title = (n.data.original_title || n.file).slice(0, 55);
    let { response, parsed } = await classify(n);
    cost += response?.costUsd || 0;
    if (!parsed) { console.log(`⚠️  ${title}… — osztályozás nem értelmezhető, kihagyom`); continue; }

    // 📘 MÁSODIK ESÉLY A HIVATALOS SÚGÓBÓL (2026-11-11) — csak elutasított LLM-termékhírnek, napi keretben.
    let sugo = null;
    if (masodikEselyKell({ sourceId: n.data._meta?.source_id, cim: n.data.original_title, parsed })
        && sugoProba < SUGO_FUTAS_MAX && napiMaradek(topics.topics) > 0) {
      sugoProba++;
      const s = await sugoMasodikEsely(n, sugoIndexek);
      cost += s.cost || 0;
      if (s.ok) {
        console.log(`📘 SÚGÓBÓL ÚTMUTATHATÓ: ${title}…\n     → ${s.sugoCim} (${s.url})`);
        sugo = s;
        parsed = { ...parsed, guide_worthy: true, title: s.title, tool: s.tool || parsed.tool, company: s.company || parsed.company,
          angle: s.angle, level: s.level, audience: s.audience };
      } else {
        console.log(`   📘 súgó-próba: ${title}… → nincs útmutató (${String(s.reason).slice(0, 140)})`);
        parsed = { ...parsed, reason: `${parsed.reason || ''} · súgó: ${s.reason}`.slice(0, 300) };
      }
    }

    if (!parsed.guide_worthy) {
      console.log(`⛔ NEM útmutatható: ${title}…\n     → ${parsed.reason}`);
      if (!args.dry) markNews(n, { guide_worthy: false, pairing_reason: parsed.reason });
      skip++;
      continue;
    }

    // Útmutatható → de van-e MÁR ilyen útmutató? (ne duplikáljunk)
    // 11-11: idegen eszközű témához SOHA (core/sugo-parositas.js meglevoTema — a régi findExistingTopic
    // 2 közös általános szóra a MiniMax-képhírt a Gemini-képes útmutatóhoz kötötte).
    const existing = meglevoTema(parsed, topics.topics);
    if (existing) {
      console.log(`📎 ÚTMUTATHATÓ, de MÁR VAN guide: ${title}…\n     → kereszthivatkozás a meglévőre: "${existing.title.slice(0, 50)}" [${existing.id}]`);
      if (!args.dry) {
        markNews(n, { guide_worthy: true, related_guide_topic: existing.id });
        // a meglévő téma + a MÁR PUBLIKÁLT guide kapja meg a forrás-hírt (visszafelé link)
        if (!existing.source_news) existing.source_news = { file: n.file, title: n.data.original_title || '' };
        patchPublishedGuideSource(existing.id, n);
        message('pairing', 'guide', 'info', `A "${title}" hír a meglévő útmutatóra mutat: ${existing.id}`, { ref: existing.id });
      }
      linked++;
      continue;
    }

    // KÖZELI-TÉMA-ŐR (2026-07-18): a szó szerinti egyezésen túl a JELENTÉSBEN
    // közeli témát is kiszűrjük ("Clear Action Plans" ≈ "Action Plans") — a hír
    // a legközelebbi meglévő guide-ra mutat, NEM születik ismétlődő téma.
    const near = await isNearDuplicateTitle(parsed.title || n.data.original_title || '', existingTitles);
    if (near.duplicate) {
      console.log(`🔁 KÖZELI TÉMA már van, nem duplikálok: ${title}…\n     → hasonló: "${near.closest?.title?.slice(0, 50)}" (${(near.closest?.score || 0).toFixed(2)})`);
      if (!args.dry) {
        markNews(n, { guide_worthy: true, pairing_reason: `near-duplicate of: ${near.closest?.title || ''}`.slice(0, 120) });
        // `by` + `unresolved` is a naplóba (2026-09-06) — lásd core/topic-dedup.js:
        // a beágyazásos és a Jaccard-tartalékos döntés eddig egyformán nézett ki.
        logDedup(dedupBejegyzes('pairing', parsed.title || '', near));
      }
      nearDup++;
      continue;
    }

    // Útmutatható, ÚJ → új téma + kereszthivatkozás
    const id = uniqueId(slugify(parsed.title || n.data.original_title), topics.topics);
    console.log(`📘 ÚTMUTATHATÓ (új): ${title}…\n     → új téma: "${(parsed.title || '').slice(0, 60)}" [${id}]`);
    if (!args.dry) {
      topics.topics.push({
        id,
        company: parsed.company || '',
        tool: parsed.tool || '',
        title: parsed.title || `How to use ${n.data.original_title}`,
        audience: ['personal', 'business', 'both'].includes(parsed.audience) ? parsed.audience : 'both',
        level: parsed.level === 'intermediate' ? 'intermediate' : 'beginner',
        angle: parsed.angle || '',
        status: 'todo',
        icon: '🆕',
        source_news: { file: n.file, title: n.data.original_title || '' },
        created_at: new Date().toISOString(),
        // 📘 súgó-alapú téma: az útmutató-író CSAK ebből a hivatalos súgócikkből írhat (core/sugo-parositas.js)
        ...(sugo ? { sugo_alapu: true, official_sources: [{ url: sugo.url, title: sugo.sugoCim || '' }] } : {})
      });
      if (sugo) sugoTema++;
      markNews(n, { guide_worthy: true, related_guide_topic: id });
      message('pairing', 'guide', 'need', `Új funkció-hír → kéne hozzá útmutató: "${parsed.title}"`, { ref: id });
    }
    worthy++;
  }

  if (!args.dry) saveTopics(topics);

  console.log('─'.repeat(60));
  console.log(`📊 PÁROSÍTÁS: ${worthy} új téma (ebből súgóból: ${sugoTema}), ${linked} meglévőre kötve, ${nearDup} közeli-ismétlés kiszűrve, ${skip} nem útmutatható | 📘 súgó-próba: ${sugoProba} | költség $${cost.toFixed(4)}`);
  if (worthy > 0 && !args.dry) console.log(`✨ ${worthy} új téma a guide-topics.json-ban — az Útmutató-agent megírja: node agents/guide/agent.js --limit ${worthy}`);

  if (!args.dry) {
    if (!existsSync(LOGS_DIR)) mkdirSync(LOGS_DIR, { recursive: true });
    writeFileSync(join(LOGS_DIR, `pairing_${new Date().toISOString().replace(/[:.]/g, '-')}.json`),
      JSON.stringify({ worthy, linked, skip, nearDup, cost, at: new Date().toISOString() }, null, 2), 'utf-8');
  }
}

main().catch(e => { console.error('💥 PÁROSÍTÓ HIBA:', e); process.exit(1); });
