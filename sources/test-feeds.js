// ===================================================================
// FEED TESZTELŐ ESZKÖZ
// ===================================================================
// Kipróbál RSS URL-eket és jelzi melyik működik.
// NEM használ AI-t (csak XML letöltés) — kvótát nem fogyaszt!
//
// Futtatás:
//   node sources/test-feeds.js            -- a configban levő feedek tesztje
//   node sources/test-feeds.js --candidates -- alternatív URL-ek tesztje
// ===================================================================

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Parser from 'rss-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const parser = new Parser({
  timeout: 15000,
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AIWorldCo/1.0; +https://aiworld.co)' }
});

// Alternatív URL jelöltek a halott feedekhez
const CANDIDATES = {
  'anthropic-blog': [
    'https://www.anthropic.com/rss.xml',
    'https://www.anthropic.com/news/rss.xml',
    'https://rss.anthropic.com/feed.xml'
  ],
  'meta-ai': [
    'https://ai.meta.com/blog/rss.xml',
    'https://ai.meta.com/blog/feed/',
    'https://about.fb.com/news/category/technology-and-innovation/feed/'
  ],
  'mistral-news': [
    'https://mistral.ai/rss.xml',
    'https://mistral.ai/feed.xml',
    'https://mistral.ai/news/feed'
  ],
  'theverge-ai': [
    'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml',
    'https://www.theverge.com/artificial-intelligence/rss/index.xml',
    'https://www.theverge.com/rss/index.xml'
  ],
  'itnews-au': [
    'https://www.itnews.com.au/rss/feed',
    'https://www.itnews.com.au/rss/rss.ashx',
    'https://www.itnews.com.au/RSS/rss.ashx'
  ],
  'innovation-aus': [
    'https://www.innovationaus.com/feed/',
    'https://www.innovationaus.com/rss'
  ],
  'hackernews-ai': [
    'https://hnrss.org/newest?q=AI+OR+LLM+OR+GPT+OR+Claude',
    'https://hnrss.org/frontpage'
  ],
  // Extra: ausztrál + általános AI források amik gyakran működnek
  'EXTRA-the-conversation-au': [
    'https://theconversation.com/au/technology/articles.atom'
  ],
  'EXTRA-google-ai-blog': [
    'https://blog.google/technology/ai/rss/'
  ],
  'EXTRA-techcrunch-main': [
    'https://techcrunch.com/feed/'
  ]
};

async function testUrl(url) {
  const start = Date.now();
  try {
    const feed = await parser.parseURL(url);
    const ms = Date.now() - start;
    return {
      ok: true,
      itemCount: feed.items?.length || 0,
      title: feed.title || '(no title)',
      ms,
      sampleTitle: feed.items?.[0]?.title?.slice(0, 60) || '(no items)'
    };
  } catch (e) {
    return { ok: false, error: e.message, ms: Date.now() - start };
  }
}

async function main() {
  const mode = process.argv.includes('--candidates') ? 'candidates' : 'config';

  if (mode === 'candidates') {
    console.log('🔍 ALTERNATÍV URL-EK TESZTELÉSE\n');
    console.log('═'.repeat(70));

    for (const [feedId, urls] of Object.entries(CANDIDATES)) {
      console.log(`\n📡 ${feedId}`);
      for (const url of urls) {
        const result = await testUrl(url);
        if (result.ok) {
          console.log(`   ✅ MŰKÖDIK (${result.itemCount} cikk, ${result.ms}ms)`);
          console.log(`      ${url}`);
          console.log(`      Példa: "${result.sampleTitle}..."`);
        } else {
          console.log(`   ❌ ${url}`);
          console.log(`      ${result.error.slice(0, 60)}`);
        }
      }
    }
  } else {
    console.log('🔍 CONFIGBAN LEVŐ FEEDEK TESZTELÉSE\n');
    console.log('═'.repeat(70));

    const feedsPath = join(__dirname, 'rss-feeds.json');
    const config = JSON.parse(readFileSync(feedsPath, 'utf-8'));

    let ok = 0, fail = 0;
    for (const feed of config.sources) {
      if (!feed.enabled) {
        console.log(`⏭️  ${feed.name} (kikapcsolva)`);
        continue;
      }
      const result = await testUrl(feed.url);
      if (result.ok) {
        console.log(`✅ ${feed.name.padEnd(30)} ${result.itemCount} cikk, ${result.ms}ms`);
        ok++;
      } else {
        console.log(`❌ ${feed.name.padEnd(30)} ${result.error.slice(0, 40)}`);
        fail++;
      }
    }
    console.log('\n' + '═'.repeat(70));
    console.log(`Eredmény: ${ok} működik, ${fail} hibás`);
  }
}

main().catch(e => { console.error('HIBA:', e); process.exit(1); });
