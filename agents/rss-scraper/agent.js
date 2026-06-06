// ===================================================================
// RSS SCRAPER AGENT
// ===================================================================
//
// FELADAT:
//   1. Beolvassa az engedélyezett RSS forrásokat (sources/rss-feeds.json)
//   2. Letölti minden forrásból a friss cikkeket
//   3. AI-jal (Gemini Flash) eldönti melyik RELEVÁNS nekünk
//   4. Lementi a releváns cikkeket nyers formában (content/drafts/)
//   5. Naplózza mi történt (logs/)
//
// FUTTATÁS:
//   node agents/rss-scraper/agent.js
//
// FŐ ELV (a brand-ből):
//   "Nem erőltetjük a cikkeket" — ha nincs jó hír, nem írunk.
//   A Scraper SOK hírt gyűjt, de szigorúan SZŰR.
// ===================================================================

import 'dotenv/config';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Parser from 'rss-parser';
import { ask } from '../../core/ai-router.js';

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

const parser = new Parser({
  timeout: 15000,
  headers: { 'User-Agent': 'AIWorldCo-RSS-Scraper/1.0' }
});

// ===================================================================
// "SEEN ITEMS" KEZELÉS — már látott cikkek nyilvántartása
// ===================================================================
// Hogy ne dolgozzuk fel ugyanazt a cikket többször!
// Egyszerű JSON: { "feed-id": ["link1", "link2", ...] }

function loadSeenItems() {
  if (!existsSync(SEEN_ITEMS_PATH)) return {};
  try {
    return JSON.parse(readFileSync(SEEN_ITEMS_PATH, 'utf-8'));
  } catch (e) {
    console.warn(`⚠️  seen-items.json olvasási hiba: ${e.message} — ürességgel kezdünk`);
    return {};
  }
}

function saveSeenItems(seen) {
  writeFileSync(SEEN_ITEMS_PATH, JSON.stringify(seen, null, 2), 'utf-8');
}

// Csak az utolsó 200 elemet tartjuk feed-enként (memória takarékosság)
function trimSeen(seen, feedId) {
  if (seen[feedId] && seen[feedId].length > 200) {
    seen[feedId] = seen[feedId].slice(-200);
  }
}

// ===================================================================
// RSS FEED LETÖLTÉS
// ===================================================================

async function fetchFeed(feedConfig) {
  try {
    const feed = await parser.parseURL(feedConfig.url);
    return {
      ok: true,
      items: feed.items || [],
      title: feed.title
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
      items: []
    };
  }
}

// ===================================================================
// AI RELEVANCIA SZŰRŐ (Gemini Flash INGYEN!)
// ===================================================================

const RELEVANCE_SYSTEM_PROMPT = `You are a content curator for AI World Co., an Australian AI news portal for everyday people (not developers).

The portal covers:
- AI company news (OpenAI, Anthropic, Google, Meta, Mistral, etc.)
- New AI features and how to use them in daily life
- AI and work, AI and learning, AI and safety
- Practical, everyday-usage angles

The portal does NOT cover:
- Politics, gambling, adult content, military, medical advice
- Celebrity gossip, comparisons that put down competitors
- Pure academic research without practical implications
- Anything not related to AI

For each article, decide if it's RELEVANT for our portal.
Respond ONLY in this exact JSON format (no markdown, no extra text):
{"relevant": true|false, "score": 1-10, "reason": "brief reason in English", "category": "ai-news|how-to|business|work|creative|other"}`;

async function checkRelevance(item) {
  const prompt = `Article title: "${item.title}"
Article summary: "${(item.contentSnippet || item.content || '').slice(0, 500)}"
Published: ${item.pubDate || 'unknown'}

Is this relevant for our portal? Respond with JSON only.`;

  const response = await ask(prompt, {
    agentName: AGENT_NAME,
    systemPrompt: RELEVANCE_SYSTEM_PROMPT,
    maxTokens: 200
  });

  if (!response) return { relevant: false, reason: 'AI router failed', score: 0 };

  // Próbáljuk parse-olni a JSON-t (az AI néha markdown-ba teszi)
  try {
    let text = response.text.trim();
    // Markdown ``` blokkok eltávolítása ha vannak
    text = text.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(text);
    parsed._aiCost = response.costUsd;
    return parsed;
  } catch (e) {
    return {
      relevant: false,
      reason: `JSON parse error: ${e.message}`,
      score: 0,
      _aiCost: response.costUsd
    };
  }
}

// ===================================================================
// DRAFT MENTÉS
// ===================================================================

function saveDraft(item, feedConfig, relevance) {
  if (!existsSync(DRAFTS_DIR)) mkdirSync(DRAFTS_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeTitle = (item.title || 'untitled').slice(0, 60).replace(/[^a-z0-9-]/gi, '_');
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

// ===================================================================
// LOG MENTÉS (összegzés egy futtatásról)
// ===================================================================

function saveRunLog(stats) {
  if (!existsSync(LOGS_DIR)) mkdirSync(LOGS_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logfile = join(LOGS_DIR, `scrape_${timestamp}.json`);
  writeFileSync(logfile, JSON.stringify(stats, null, 2), 'utf-8');
}

// ===================================================================
// FŐ FUTTATÁS
// ===================================================================

async function main() {
  console.log('🕵️  RSS SCRAPER AGENT INDUL');
  console.log('─'.repeat(60));

  // 1. Konfig betöltés
  const feedsConfig = JSON.parse(readFileSync(FEEDS_PATH, 'utf-8'));
  const enabledFeeds = feedsConfig.sources.filter(f => f.enabled);
  console.log(`📋 ${enabledFeeds.length} aktív RSS forrás beolvasva\n`);

  // 2. Seen items betöltés
  const seen = loadSeenItems();

  // 3. Statisztika
  const stats = {
    started_at: new Date().toISOString(),
    feeds_total: enabledFeeds.length,
    feeds_ok: 0,
    feeds_failed: 0,
    items_total: 0,
    items_new: 0,
    items_relevant: 0,
    items_saved: 0,
    ai_cost_usd: 0,
    by_feed: {}
  };

  // 4. Minden feed feldolgozása
  for (const feedConfig of enabledFeeds) {
    console.log(`📡 ${feedConfig.name} (${feedConfig.id})...`);

    const feedStats = { ok: false, items_total: 0, items_new: 0, items_relevant: 0, items_saved: 0 };
    stats.by_feed[feedConfig.id] = feedStats;

    const result = await fetchFeed(feedConfig);
    if (!result.ok) {
      console.log(`   ❌ Hiba: ${result.error}\n`);
      stats.feeds_failed++;
      feedStats.error = result.error;
      continue;
    }

    stats.feeds_ok++;
    feedStats.ok = true;
    feedStats.items_total = result.items.length;
    stats.items_total += result.items.length;

    // Új cikkek szűrése (még nem láttuk)
    if (!seen[feedConfig.id]) seen[feedConfig.id] = [];
    const seenLinks = new Set(seen[feedConfig.id]);

    const newItems = result.items.filter(item => item.link && !seenLinks.has(item.link));
    feedStats.items_new = newItems.length;
    stats.items_new += newItems.length;

    if (newItems.length === 0) {
      console.log(`   ⚪ ${result.items.length} cikk, mind már látott\n`);
      continue;
    }

    console.log(`   🆕 ${newItems.length} új cikk találva (${result.items.length}-ből)`);

    // AI relevancia szűrés minden új cikkre
    for (const item of newItems) {
      const relevance = await checkRelevance(item);
      stats.ai_cost_usd += relevance._aiCost || 0;

      // Megjelöljük látottként (akár releváns akár nem)
      seen[feedConfig.id].push(item.link);

      if (relevance.relevant && relevance.score >= 6) {
        const filename = saveDraft(item, feedConfig, relevance);
        feedStats.items_relevant++;
        feedStats.items_saved++;
        stats.items_relevant++;
        stats.items_saved++;
        console.log(`      ✅ ${item.title?.slice(0, 70)}... (score: ${relevance.score})`);
      } else {
        console.log(`      ⏭️  ${item.title?.slice(0, 50)}... (score: ${relevance.score || 0} - ${relevance.reason?.slice(0, 50)})`);
      }
    }

    trimSeen(seen, feedConfig.id);
    console.log();
  }

  // 5. Seen items mentés
  saveSeenItems(seen);

  // 6. Statisztika
  stats.finished_at = new Date().toISOString();
  stats.duration_seconds = (new Date(stats.finished_at) - new Date(stats.started_at)) / 1000;
  saveRunLog(stats);

  // 7. Összefoglaló
  console.log('─'.repeat(60));
  console.log('📊 ÖSSZEFOGLALÓ:');
  console.log(`   Forrás OK / FAIL: ${stats.feeds_ok} / ${stats.feeds_failed}`);
  console.log(`   Cikk összesen: ${stats.items_total}`);
  console.log(`   Új cikk: ${stats.items_new}`);
  console.log(`   Releváns: ${stats.items_relevant}`);
  console.log(`   Mentve draft-ba: ${stats.items_saved}`);
  console.log(`   AI költség: $${stats.ai_cost_usd.toFixed(4)}`);
  console.log(`   Időtartam: ${stats.duration_seconds.toFixed(1)}s`);
  console.log('─'.repeat(60));

  if (stats.items_saved === 0) {
    console.log('💤 Nem találtunk releváns új cikket — ma nem írunk semmit.');
    console.log('   ("Üres nap jobb mint gyenge nap" — brand szabály)');
  } else {
    console.log(`✨ ${stats.items_saved} draft várja az Író-Agentet a content/drafts/-ban`);
  }
}

// ===================================================================
// INDÍTÁS
// ===================================================================

main().catch(error => {
  console.error('💥 KRITIKUS HIBA:', error);
  process.exit(1);
});
