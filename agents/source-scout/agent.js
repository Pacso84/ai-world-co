// ===================================================================
// FORRÁS-KUTATÓ AGENT (Source Scout)
// ===================================================================
//
// FELADAT:
//   Új HIVATALOS AI források felfedezése automatikusan.
//   1. Az AI-tól kér AI cég/szervezet listát + blog domaineket
//   2. Minden domainre kipróbál gyakori RSS URL-mintákat
//   3. Teszteli melyik ad valódi RSS-t
//   4. Kiszűri a már meglévőket ÉS a nem-hivatalosakat (hírmédia)
//   5. JAVASLATOT ír (NEM ad hozzá automatikusan!) — az ember dönt
//
//   => agents/source-scout/discovered-sources.json
//
// FUTTATÁS:
//   node agents/source-scout/agent.js
//
// ELV (felhasználó döntése): önfejlesztésre JAVASLAT, de a felhasználó
// dönti el mit adunk a forrásokhoz. Csak HIVATALOS forrás (nem magazin).
// ===================================================================

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Parser from 'rss-parser';
import { ask } from '../../core/ai-router.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const FEEDS_PATH = join(PROJECT_ROOT, 'sources', 'rss-feeds.json');
const OUTPUT_PATH = join(__dirname, 'discovered-sources.json');

const AGENT_NAME = 'source-scout';

const parser = new Parser({
  timeout: 12000,
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AIWorldCo/1.0; +https://aiworld.co)' }
});

// Gyakori RSS URL-minták egy domainhez
const RSS_PATTERNS = [
  '/feed/', '/rss.xml', '/feed.xml', '/rss/', '/blog/feed/',
  '/blog/rss.xml', '/blog/rss/', '/news/feed/', '/news/rss.xml',
  '/blog/feed.xml', '/feeds/posts/default'
];

// ===================================================================
// MEGLÉVŐ FORRÁSOK (domain alapú deduplikáció)
// ===================================================================

function getExistingDomains() {
  const config = JSON.parse(readFileSync(FEEDS_PATH, 'utf-8'));
  const domains = new Set();
  for (const s of config.sources) {
    try { domains.add(new URL(s.url).hostname.replace(/^www\./, '')); }
    catch { /* skip */ }
  }
  return domains;
}

// ===================================================================
// AI: HIVATALOS AI FORRÁSOK JAVASLATA
// ===================================================================

const SCOUT_SYSTEM_PROMPT = `You are a research assistant finding OFFICIAL primary sources about AI for a news site.

We ONLY want OFFICIAL sources — first-party company/organisation/research-lab blogs and newsrooms.
We do NOT want: news media, magazines, aggregators, blogs that report on others (TechCrunch, The Verge, VentureBeat, Hacker News, Reddit, etc.).

List well-known AI companies, AI labs, and big tech companies with significant AI products that publish an official blog.
For each, give the blog's base domain (https://...), with NO path.

Respond ONLY with a JSON array (no markdown):
[{"name": "Company AI Blog", "domain": "https://example.com", "type": "official", "note": "what they cover"}]

Give 15-25 entries. type must be "official". Include a global mix (US, EU, Asia, Australia if any).`;

async function getCandidateOrgs() {
  const prompt = `List 15 official AI/tech company and research-lab blogs (first-party only, no news media). Return a complete, valid JSON array only.`;
  let totalCost = 0;

  // RETRY: max 3 próba (az AI néha csonka JSON-t ad)
  for (let attempt = 1; attempt <= 3; attempt++) {
    const response = await ask(prompt, {
      agentName: AGENT_NAME,
      systemPrompt: SCOUT_SYSTEM_PROMPT,
      maxTokens: 3000,
      jsonMode: true
    });
    if (!response) continue;
    totalCost += response.costUsd || 0;

    try {
      let text = response.text.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
      const start = text.indexOf('[');
      const end = text.lastIndexOf(']');
      if (start !== -1 && end !== -1) text = text.slice(start, end + 1);
      const orgs = JSON.parse(text);
      if (Array.isArray(orgs) && orgs.length > 0) return { orgs, cost: totalCost };
    } catch (e) {
      if (attempt < 3) console.log(`   ↻ AI válasz csonka — újrapróbálom (${attempt}/3)...`);
    }
  }
  console.log('⚠️  3 próba után sem sikerült érvényes listát kapni.');
  return { orgs: [], cost: totalCost };
}

// ===================================================================
// RSS URL FELFEDEZÉS egy domainhez
// ===================================================================

async function discoverFeedForDomain(domain) {
  const base = domain.replace(/\/$/, '');
  for (const pattern of RSS_PATTERNS) {
    const url = base + pattern;
    try {
      const feed = await parser.parseURL(url);
      if (feed.items && feed.items.length > 0) {
        return { url, itemCount: feed.items.length, title: feed.title || '' };
      }
    } catch { /* próbáljuk a következő mintát */ }
  }
  return null;
}

// ===================================================================
// FŐ FUTTATÁS
// ===================================================================

async function main() {
  console.log('🔭 FORRÁS-KUTATÓ AGENT INDUL');
  console.log('─'.repeat(60));

  const existingDomains = getExistingDomains();
  console.log(`📋 ${existingDomains.size} domain már a forráslistában (ezeket kihagyjuk)\n`);

  // 1. AI javaslatok
  console.log('🤖 AI-tól hivatalos forrás-jelöltek kérése...');
  const { orgs, cost } = await getCandidateOrgs();
  console.log(`   ${orgs.length} jelölt szervezet érkezett (AI költség: $${(cost||0).toFixed(4)})\n`);

  if (orgs.length === 0) {
    console.log('💤 Nincs jelölt. Vége.');
    return;
  }

  // 2. RSS felfedezés + szűrés
  console.log('🔍 RSS feed-ek keresése domainenként...\n');
  const discovered = [];
  let checked = 0;

  for (const org of orgs) {
    checked++;
    if (org.type !== 'official') continue;
    if (!org.domain || !org.domain.startsWith('http')) continue;

    let hostname;
    try { hostname = new URL(org.domain).hostname.replace(/^www\./, ''); }
    catch { continue; }

    // Már megvan?
    if (existingDomains.has(hostname)) {
      console.log(`⏭️  ${org.name} (${hostname}) — már a listában`);
      continue;
    }

    const feed = await discoverFeedForDomain(org.domain);
    if (feed) {
      console.log(`✅ ÚJ: ${org.name} — ${feed.url} (${feed.itemCount} cikk)`);
      discovered.push({
        suggested_id: hostname.split('.')[0],
        name: org.name + ' (hivatalos)',
        url: feed.url,
        category: 'ai-company-official',
        priority: 3,
        language: 'en',
        country: org.country || '?',
        comment: `JAVASLAT (source-scout): ${org.note || 'hivatalos forrás'}. Felhasználói jóváhagyás kell!`,
        enabled: false,
        item_count_at_discovery: feed.itemCount
      });
    } else {
      console.log(`❌ ${org.name} (${hostname}) — nincs működő RSS`);
    }
  }

  // 3. Javaslat mentése
  const output = {
    _meta: {
      generated_at: new Date().toISOString(),
      generated_by: 'source-scout agent',
      note: 'JAVASLATOK új hivatalos forrásokra. A felhasználó dönti el melyiket adjuk a sources/rss-feeds.json-hoz (enabled:true-val).',
      checked_orgs: checked,
      newly_discovered: discovered.length
    },
    discovered_sources: discovered
  };
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf-8');

  // 4. Összefoglaló
  console.log('\n' + '─'.repeat(60));
  console.log('📊 ÖSSZEFOGLALÓ:');
  console.log(`   Ellenőrzött szervezet: ${checked}`);
  console.log(`   🆕 Új működő forrás találva: ${discovered.length}`);
  console.log(`   💰 AI költség: $${(cost||0).toFixed(4)}`);
  console.log('─'.repeat(60));

  if (discovered.length > 0) {
    console.log(`\n✨ ${discovered.length} javaslat a fájlban:`);
    console.log(`   agents/source-scout/discovered-sources.json`);
    console.log(`   Nézd át, és amit jónak látsz, azt átmásoljuk a forrásokhoz!`);
  } else {
    console.log('\n💤 Nem találtunk új forrást (a meglévők már jók).');
  }
}

main().catch(error => {
  console.error('💥 KRITIKUS HIBA:', error);
  process.exit(1);
});
