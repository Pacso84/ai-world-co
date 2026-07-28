// ===================================================================
// RSS SCRAPER AGENT (v2.0 - éles teszt után optimalizálva)
// ===================================================================
//
// FELADAT:
//   1. Beolvassa az engedélyezett RSS forrásokat (sources/rss-feeds.json)
//   2. Feedenként CSAK a legújabb N cikket nézi (max_items_per_feed)
//   3. INGYENES kulcsszó-előszűrő: nyilvánvaló nem-AI cikkek kiszűrése
//   4. A maradékot KÖTEGELVE (batch) küldi az AI-nak (kvóta spórolás!)
//   5. Releváns cikkeket lement (content/drafts/)
//
// FUTTATÁS:
//   node agents/rss-scraper/agent.js
//   node agents/rss-scraper/agent.js --max-ai-calls 3   (kvóta limit)
//
// v2.0 VÁLTOZÁSOK (éles teszt tanulságai):
//   - Limit feedenként (volt: 992 cikk egy feedből!)
//   - Kulcsszó előszűrő (ingyenes)
//   - Batch AI hívás (volt: 1 hívás/cikk -> kvóta azonnal elfogyott)
//   - Seen bug fix: csak sikeres AI döntés után jelöl "látottnak"
// ===================================================================

import 'dotenv/config';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Parser from 'rss-parser';
import { ask } from '../../core/ai-router.js';
import { skillsBlock } from '../../core/skills.js';

// ===================================================================
// SETUP
// ===================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');

const FEEDS_PATH = join(PROJECT_ROOT, 'sources', 'rss-feeds.json');
const DRAFTS_DIR = join(PROJECT_ROOT, 'content', 'drafts');
const LOGS_DIR = join(PROJECT_ROOT, 'logs');
const SEEN_ITEMS_PATH = join(__dirname, 'seen-items.json');

const AGENT_NAME = 'rss-scraper';

// Mennyi cikket küldjünk egy AI hívásba (batch méret)
const BATCH_SIZE = 10;
// Hány új cikknél magasabb relevancia-pont kell a mentéshez
const MIN_SCORE = 6;

const parser = new Parser({
  timeout: 15000,
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AIWorldCo/1.0; +https://aiworld.co)' }
});

// ===================================================================
// PARANCSSORI ARGUMENTUMOK
// ===================================================================

function parseArgs() {
  const args = process.argv.slice(2);
  let maxAiCalls = Infinity;
  const idx = args.indexOf('--max-ai-calls');
  if (idx !== -1 && args[idx + 1]) maxAiCalls = parseInt(args[idx + 1], 10);
  return { maxAiCalls };
}

// ===================================================================
// KULCSSZÓ ELŐSZŰRŐ (INGYENES - nem hív AI-t!)
// ===================================================================
// Ha a cikk címében/leírásában van AI-kapcsolódó szó, átengedi.
// Így a nyilvánvaló nem-AI cikkeket ingyen kiszűrjük.
// ===================================================================

const AI_KEYWORDS = [
  'ai', 'a.i.', 'artificial intelligence', 'machine learning', 'deep learning',
  'llm', 'large language model', 'neural', 'gpt', 'chatgpt', 'openai',
  'claude', 'anthropic', 'gemini', 'deepmind', 'mistral', 'llama', 'meta ai',
  'copilot', 'midjourney', 'dall-e', 'dalle', 'sora', 'stable diffusion',
  'generative', 'chatbot', 'agent', 'automation', 'algorithm', 'model',
  'hugging face', 'nvidia', 'transformer', 'prompt', 'fine-tun', 'inference',
  'robot', 'autonomous', 'multimodal'
];


// ===================================================================
// KÖZÖNSÉG-KAPU (2026-07-28) — csak az audience_gate:"everyday" forrásokra.
// ===================================================================
// A vállalati/fejlesztői források (AWS ML, Snowflake, Databricks, SAP…)
// bőven termelnek, de a hírek nagy része a MI olvasónknak nem szól.
// Két mintacsoport a FORRÁS EREDETI CÍMÉN:
//   DEV_MARKERS  — fejlesztői/üzemeltetői anyag (Bedrock, SageMaker, pipeline,
//                  deployment, enterprise, compliance…)
//   CORP_MARKERS — céges sajtóközlemény (partnerség, felvásárlás, milliárdos
//                  beruházás, "Hogyan építette fel az X csapatunk…")
// MÉRVE 107 megjelent, vállalati forrású cikken: 46%-ot fogott volna ki, és a
// 41 tisztán üzletiből 23-at. Amit "tévesen" fogott, az mérés szerint szintén
// fejlesztői anyag volt, csak az író rosszul címkézte hétköznapinak.
// Ingyenes: nincs AI-hívás.
// ===================================================================
const DEV_MARKERS = /\b(bedrock|sagemaker|cortex|dataiku|kubernetes|terraform|vpc|iam|sdk|api|etl|mlops|llmops|pipeline|inference|endpoint|cluster|warehouse|lakehouse|orchestrat|deployment|deploy|provisioned|throughput|quantiz|fine-tun|embedding model|vector (database|store)|observability|multi-account|entitlement|governance|compliance|production-grade|at scale|enterprise|benchmark|latency|serverless|microservice|data lake|feature store|agentcore|langgraph|langchain|llamaindex|strands|mcp|guardrail|knowledge base|distillation|batch inference|prompt caching|spec|rag|nemotron|gpt oss)\b/i;
const CORP_MARKERS = /\b(marketplace|partners? earn|strategic (multi-year )?agreement|q[1-4] (results|earnings)|acquisition|appoints?|names? new|summit \d{4}|deepens? commitment|new data:|case study|customer story|middle managers|(marketing|finance|sales|hr) teams?|is transforming|built an ai-native|inside the .*strateg|reclaimed .*hours|forecasting at the speed)\b|\$\d+([.,]\d+)? ?(billion|million|bn|m)\b|\bannounc\w+ .* on (snowflake|aws|azure|bedrock)\b/i;

// ÖSSZEHASONLÍTÓ-LISTA KAPU (2026-07-28) — MINDEN forrásra, nem csak a
// vállalatiakra. A cégblogok SEO-listákat gyártanak ("10 Best Sora
// Alternatives", "5 Best Tavus Alternatives") — ezek versenytárs-összevetések,
// amiket a márkaszabályunk KIFEJEZETTEN tilt ("No comparisons between different
// companies' products"). Ha ilyen jut az Íróhoz, vagy megszegi a szabályt, vagy
// kínlódva kerülgeti — jobb be sem engedni. A "N módszer/tipp" alakot NEM
// fogja, csak a rangsorolót és az alternatíva-listát.
const LISTICLE_MARKERS = /\b(\d+\s+best|best\s+\d+|top\s+\d+|\d+\s+top)\b|\bthe\s+(best|top)\b|\balternatives?\b|\bvs\.?\b|\bcomparison\b/i;

export function isListicle(title) {
  return LISTICLE_MARKERS.test(String(title || ''));
}

function everydayRelevant(title) {
  const t = String(title || '');
  return !DEV_MARKERS.test(t) && !CORP_MARKERS.test(t);
}

function keywordPrefilter(item) {
  const haystack = `${item.title || ''} ${item.contentSnippet || item.content || ''}`.toLowerCase();
  return AI_KEYWORDS.some(kw => haystack.includes(kw));
}

// ===================================================================
// SEEN ITEMS
// ===================================================================

function loadSeenItems() {
  if (!existsSync(SEEN_ITEMS_PATH)) return {};
  try {
    return JSON.parse(readFileSync(SEEN_ITEMS_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function saveSeenItems(seen) {
  for (const id of Object.keys(seen)) {
    if (seen[id].length > 300) seen[id] = seen[id].slice(-300);
  }
  writeFileSync(SEEN_ITEMS_PATH, JSON.stringify(seen, null, 2), 'utf-8');
}

// ===================================================================
// RSS FEED LETÖLTÉS
// ===================================================================

async function fetchFeed(feedConfig) {
  // SITEMAP-FORRÁS (2026-07-22): néhány nagy cég (Anthropic, Cohere) nem ad RSS-t,
  // de a hivatalos sitemap.xml-jéből ugyanúgy előállítható a hírfolyam. Innentől
  // a cikk a MEGSZOKOTT úton megy tovább (kulcsszó → AI relevancia → író → kapu).
  if (feedConfig.type === 'sitemap') {
    const { fetchSitemapFeed } = await import('../../core/sitemap-feed.js');
    return fetchSitemapFeed(feedConfig, { limit: 10 });
  }
  try {
    const feed = await parser.parseURL(feedConfig.url);
    return { ok: true, items: feed.items || [] };
  } catch (error) {
    // TARTALÉK: nyers XML letöltése + hibás entitások javítása, majd parseString.
    // (Pl. Apple feed: escape-eletlen & -> "Invalid character in entity name".)
    try {
      const r = await fetch(feedConfig.url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AIWorldCo/1.0)' }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      let xml = await r.text();
      xml = xml.replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;');
      const feed = await parser.parseString(xml);
      return { ok: true, items: feed.items || [], recovered: true };
    } catch (e2) {
      return { ok: false, error: error.message, items: [] };
    }
  }
}

// ===================================================================
// ROBOSZTUS JSON TÖMB KINYERÉS
// ===================================================================
// Az AI néha markdown-ba teszi (```json), néha szöveget ír köré.
// Ez kinyeri az első [ és utolsó ] közti részt és parse-olja.
// ===================================================================

function extractJsonArray(text) {
  let t = text.trim();
  // Markdown ``` blokkok eltávolítása
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  // Első [ és utolsó ] közti rész
  const start = t.indexOf('[');
  const end = t.lastIndexOf(']');
  if (start !== -1 && end !== -1 && end > start) {
    t = t.slice(start, end + 1);
  }
  const parsed = JSON.parse(t);
  if (Array.isArray(parsed)) return parsed;
  // JSON-objektum-mód (Cerebras/GLM-4.7) legfelül objektumot kényszerít:
  // {"decisions":[...]} borítékból vagy egyetlen döntés-objektumból is
  // ki kell tudni szedni a tömböt (2026-07-16: "results is not iterable").
  if (parsed && typeof parsed === 'object') {
    for (const v of Object.values(parsed)) if (Array.isArray(v)) return v;
    if ('index' in parsed) return [parsed];
  }
  throw new Error('A válaszban nincs JSON-tömb');
}

// ===================================================================
// BATCH RELEVANCIA ELLENŐRZÉS (több cikk EGY AI hívásban!)
// ===================================================================

const RELEVANCE_SYSTEM_PROMPT = `You are a content curator for AI World Co., an Australian AI news portal for everyday people (not developers).

RELEVANT topics: AI company news (OpenAI, Anthropic, Google, Meta, etc.), new AI features and how to use them, AI in daily life, AI and work/learning/safety, practical AI usage.

NOT RELEVANT: politics, gambling, adult content, military, medical advice, celebrity gossip, comparisons that put down competitors, pure academic research with no practical angle, anything not AI-related.

You will receive a NUMBERED LIST of articles. For EACH article decide relevance.
Respond ONLY with a JSON object (no markdown, no extra text) holding one entry per article — do NOT stop until EVERY listed index has an entry:
{"decisions": [{"index": 0, "relevant": true, "score": 8, "category": "ai-news", "reason": "brief"}, {"index": 1, "relevant": false, "score": 2, "category": "other", "reason": "brief"}]}

Categories: ai-news, how-to, business, work, creative, other.
Score 1-10 (how well it fits our portal).`;

async function checkRelevanceBatch(batch) {
  // batch: [{ globalIndex, title, snippet }]
  const list = batch.map((it, i) =>
    `[${i}] Title: ${it.title}\n    Summary: ${(it.snippet || '').slice(0, 200)}`
  ).join('\n\n');

  const prompt = `Evaluate these ${batch.length} articles. Respond with {"decisions": [...]} containing exactly ${batch.length} objects (index 0 to ${batch.length - 1}).

${list}
${skillsBlock('rss-scraper')}`;

  const response = await ask(prompt, {
    agentName: AGENT_NAME,
    systemPrompt: RELEVANCE_SYSTEM_PROMPT,
    maxTokens: 4000,
    jsonMode: true
  });

  if (!response) return { ok: false, results: null, cost: 0 };

  try {
    const parsed = extractJsonArray(response.text);
    return { ok: true, results: parsed, cost: response.costUsd };
  } catch (e) {
    return { ok: false, results: null, cost: response.costUsd, error: e.message };
  }
}

// ===================================================================
// DRAFT MENTÉS
// ===================================================================

function saveDraft(item, feedConfig, relevance) {
  if (!existsSync(DRAFTS_DIR)) mkdirSync(DRAFTS_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeTitle = (item.title || 'untitled').slice(0, 50).replace(/[^a-z0-9-]/gi, '_');
  const filename = `${timestamp}_${feedConfig.id}_${safeTitle}.json`;
  const filepath = join(DRAFTS_DIR, filename);

  const draft = {
    _meta: {
      scraped_at: new Date().toISOString(),
      source_id: feedConfig.id,
      source_name: feedConfig.name,
      source_country: feedConfig.country,
      relevance: relevance
    },
    title: item.title,
    link: item.link,
    pub_date: item.pubDate,
    author: item.creator || item.author || null,
    content_snippet: item.contentSnippet || item.content || '',
    content_full: item['content:encoded'] || item.content || null,
    categories: item.categories || []
  };

  writeFileSync(filepath, JSON.stringify(draft, null, 2), 'utf-8');
  return filename;
}

function saveRunLog(stats) {
  if (!existsSync(LOGS_DIR)) mkdirSync(LOGS_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  writeFileSync(join(LOGS_DIR, `scrape_${timestamp}.json`), JSON.stringify(stats, null, 2), 'utf-8');
}

// ===================================================================
// FŐ FUTTATÁS
// ===================================================================

async function main() {
  const args = parseArgs();

  console.log('🕵️  RSS SCRAPER AGENT v2.0 INDUL');
  console.log('─'.repeat(60));

  const feedsConfig = JSON.parse(readFileSync(FEEDS_PATH, 'utf-8'));
  const enabledFeeds = feedsConfig.sources.filter(f => f.enabled);
  const maxPerFeed = feedsConfig._meta.max_items_per_feed || 5;
  console.log(`📋 ${enabledFeeds.length} aktív forrás | max ${maxPerFeed} cikk/feed | batch méret: ${BATCH_SIZE}`);
  if (args.maxAiCalls !== Infinity) console.log(`⚠️  AI hívás limit: ${args.maxAiCalls}`);
  console.log();

  const seen = loadSeenItems();

  const stats = {
    started_at: new Date().toISOString(),
    feeds_total: enabledFeeds.length,
    feeds_ok: 0,
    feeds_failed: 0,
    items_seen_before: 0,
    items_keyword_filtered: 0,
    candidates_for_ai: 0,
    ai_calls: 0,
    items_relevant: 0,
    items_saved: 0,
    ai_cost_usd: 0,
    failed_feeds: []
  };

  // ===== 1. FÁZIS: Letöltés + előszűrés (INGYENES) =====
  console.log('━━━ 1. FÁZIS: Letöltés + kulcsszó előszűrés (ingyenes) ━━━\n');

  const candidates = []; // { feedConfig, item, snippet }

  for (const feedConfig of enabledFeeds) {
    if (!seen[feedConfig.id]) seen[feedConfig.id] = [];
    const seenLinks = new Set(seen[feedConfig.id]);

    const result = await fetchFeed(feedConfig);
    if (!result.ok) {
      console.log(`❌ ${feedConfig.name}: ${result.error.slice(0, 40)}`);
      stats.feeds_failed++;
      stats.failed_feeds.push({ id: feedConfig.id, error: result.error });
      continue;
    }
    stats.feeds_ok++;

    // CSAK a legújabb N cikk!
    const recent = result.items.slice(0, maxPerFeed);

    let newCount = 0, kwFiltered = 0, alreadySeen = 0, audFiltered = 0;
    for (const item of recent) {
      if (!item.link) continue;
      if (seenLinks.has(item.link)) { alreadySeen++; continue; }

      if (!keywordPrefilter(item)) {
        // Nem AI téma - ingyen kiszűrjük ÉS megjelöljük látottként
        kwFiltered++;
        seen[feedConfig.id].push(item.link);
        continue;
      }

      // KÖZÖNSÉG-KAPU (2026-07-28): a vállalati/fejlesztői forrásoknál (AWS ML,
      // Snowflake, Databricks, SAP…) a hírek nagy része a MI olvasónknak
      // semmit nem mond — SageMaker-telepítés, Bedrock-jogosultságok, céges
      // sajtóközlemény. Ezek a források a hírek 37%-át adták, és a legtöbbet
      // termelő forrásunk (aws-ml, 41 cikk) is közéjük tartozik.
      // A forrást NEM kapcsoljuk ki (user-döntés: "szűrés, ne kikapcsolás") —
      // az igazán érdekes híreik (pl. "új Claude-modell elérhető") így is
      // bejönnek. A kapu a FORRÁS EREDETI CÍMÉRE néz, mert az író utólagos
      // közönség-címkéje megbízhatatlan: mért eset szerint a "Build an agentic
      // healthcare claims pipeline with Bedrock" is "hétköznapi" címkét kapott.
      // Ingyenes, AI nélküli szűrés. Mérve 107 megjelent cikken: 46%-ot fogott
      // ki, és a 41 tisztán üzletiből 23-at.
      if (feedConfig.audience_gate === 'everyday' && !everydayRelevant(item.title || '')) {
        audFiltered++;
        seen[feedConfig.id].push(item.link);
        continue;
      }

      // Versenytárs-összehasonlító lista → a márkaszabály tiltja (MINDEN forrás).
      if (isListicle(item.title || '')) {
        audFiltered++;
        seen[feedConfig.id].push(item.link);
        continue;
      }

      candidates.push({
        feedConfig,
        item,
        snippet: item.contentSnippet || item.content || ''
      });
      newCount++;
    }

    stats.items_seen_before += alreadySeen;
    stats.items_keyword_filtered += kwFiltered;
    console.log(`✅ ${feedConfig.name.padEnd(28)} ${newCount} jelölt | ${kwFiltered} kiszűrve${audFiltered ? ` | ${audFiltered} közönség-kapu` : ''} | ${alreadySeen} régi`);
  }

  stats.candidates_for_ai = candidates.length;
  console.log(`\n📊 Összesen ${candidates.length} cikk megy AI ellenőrzésre (kötegelve)\n`);

  // ===== 2. FÁZIS: Batch AI ellenőrzés =====
  console.log('━━━ 2. FÁZIS: Batch AI relevancia ellenőrzés ━━━\n');

  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    if (stats.ai_calls >= args.maxAiCalls) {
      console.log(`⚠️  Elértük az AI hívás limitet (${args.maxAiCalls}). Maradék cikkek később.`);
      break;
    }

    const batch = candidates.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(candidates.length / BATCH_SIZE);
    console.log(`🤖 Batch ${batchNum}/${totalBatches} (${batch.length} cikk)...`);

    const { ok, results, cost, error } = await checkRelevanceBatch(batch);
    stats.ai_calls++;
    stats.ai_cost_usd += cost || 0;

    if (!ok || !Array.isArray(results)) {
      console.log(`   ❌ Batch hiba: ${error || 'AI router elesett vagy nem tömböt adott'} — ezek a cikkek később újra`);
      // Saját lecke STABIL szöveggel (ismétlődéskor erősödik) — 2026-07-16
      try { const { remember } = await import('../../core/memory-manager.js'); remember(AGENT_NAME, 'A relevancia-válasz nem volt tömbként értelmezhető és a köteg kimaradt — a {"decisions":[...]} boríték-formátumot kell kérni és kikényszeríteni.', { tags: ['parse-fail'] }); } catch { /* lecke-hiba nem állít meg */ }
      // NEM jelöljük látottnak -> legközelebb újra próbáljuk
      continue;
    }

    // Eredmények alkalmazása
    for (const decision of results) {
      const candidate = batch[decision.index];
      if (!candidate) continue;

      // MOST jelöljük látottnak (sikeres döntés után!)
      seen[candidate.feedConfig.id].push(candidate.item.link);

      if (decision.relevant && decision.score >= MIN_SCORE) {
        saveDraft(candidate.item, candidate.feedConfig, decision);
        stats.items_relevant++;
        stats.items_saved++;
        console.log(`   ✅ [${decision.score}] ${candidate.item.title?.slice(0, 60)}`);
      }
    }
  }

  // ===== Mentés =====
  saveSeenItems(seen);
  stats.finished_at = new Date().toISOString();
  stats.duration_seconds = (new Date(stats.finished_at) - new Date(stats.started_at)) / 1000;
  saveRunLog(stats);

  // ===== Összefoglaló =====
  console.log('\n' + '─'.repeat(60));
  console.log('📊 ÖSSZEFOGLALÓ:');
  console.log(`   Forrás OK / FAIL: ${stats.feeds_ok} / ${stats.feeds_failed}`);
  console.log(`   Kulcsszó-szűrt (ingyen): ${stats.items_keyword_filtered}`);
  console.log(`   AI-hoz jelölt: ${stats.candidates_for_ai}`);
  console.log(`   AI hívások: ${stats.ai_calls}`);
  console.log(`   ✅ Releváns + mentve: ${stats.items_saved}`);
  console.log(`   💰 AI költség: $${stats.ai_cost_usd.toFixed(4)}`);
  console.log(`   ⏱️  ${stats.duration_seconds.toFixed(1)}s`);
  console.log('─'.repeat(60));

  if (stats.items_saved === 0) {
    console.log('💤 Nem találtunk releváns új cikket. ("Üres nap jobb mint gyenge nap")');
  } else {
    console.log(`✨ ${stats.items_saved} draft vár az Író-Agentre`);
  }
}

// EXPLICIT KILÉPÉS: egy válasz nélkül lógó RSS-kapcsolat életben tartja a
// node-ot a main() után is (2026-07-01: 6 órás beragadás a felhőben!).
main().then(() => process.exit(0)).catch(error => {
  console.error('💥 KRITIKUS HIBA:', error);
  process.exit(1);
});
