// ===================================================================
// FORRÁS-KUTATÓ AGENT (Source Scout) — v3.0 "MEGBÍZHATÓSÁG-KAPU"
// ===================================================================
//
// FELADAT:
//   Új, MEGBÍZHATÓ, HIVATALOS AI források felfedezése automatikusan.
//   1. Az AI-tól kér AI cég/szervezet listát + blog domaineket
//      (a már lefedett cégeket KIHAGYJA — tényleg ÚJ orgokra fókuszál)
//   2. Minden domainre kipróbál gyakori RSS URL-mintákat
//   3. MEGBÍZHATÓSÁG-KAPU minden találatra (több jel, pontozva):
//        • média/aggregátor feketelista  → AZONNAL kizár
//        • már lefedett cég (domain VAGY márkanév) → kizár
//        • él-e + friss-e (van új cikk?)  → frissesség-pont
//        • elég sok cikk (folyamatos-e?)  → mennyiség-pont
//        • a domain tényleg a cégé-e?     → hitelesség-pont
//        • HTTPS + valódi RSS             → alap-pont
//      Csak a KÜSZÖB feletti pontszám marad — minden jelölt MEGINDOKOLVA.
//   4. JAVASLATOT ír (NEM ad hozzá automatikusan!) — az ember/főnök dönt
//
//   => agents/source-scout/discovered-sources.json
//
// FUTTATÁS:
//   node agents/source-scout/agent.js                 -- normál kutatás
//   node agents/source-scout/agent.js --force         -- akkor is, ha friss
//   node agents/source-scout/agent.js --if-stale 3    -- csak ha 3+ napja nem futott
//   node agents/source-scout/agent.js --min-score 60  -- küszöb állítás (alap: 70)
//
// ELV (felhasználó döntése): önfejlesztésre JAVASLAT, de a felhasználó
// dönti el mit adunk a forrásokhoz. CSAK megbízható, HIVATALOS forrás.
// ===================================================================

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Parser from 'rss-parser';
import { ask } from '../../core/ai-router.js';
import { skillsBlock } from '../../core/skills.js';
import { notify } from '../../core/ops.js';
import { sendMessage } from '../../core/telegram.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const FEEDS_PATH = join(PROJECT_ROOT, 'sources', 'rss-feeds.json');
const OUTPUT_PATH = join(__dirname, 'discovered-sources.json');

const AGENT_NAME = 'source-scout';

// ---- Parancssori beállítások ----
const ARGV = process.argv.slice(2);
const FORCE = ARGV.includes('--force');
function argVal(flag, def) { const i = ARGV.indexOf(flag); return (i !== -1 && ARGV[i + 1]) ? ARGV[i + 1] : def; }
const IF_STALE_DAYS = ARGV.includes('--if-stale') ? parseFloat(argVal('--if-stale', '3')) : null;
const MIN_SCORE = parseInt(argVal('--min-score', '70'), 10);

const parser = new Parser({
  timeout: 12000,
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AIWorldCo/1.0; +https://aiworld.co)' }
});

// Gyakori RSS URL-minták egy domainhez
const RSS_PATTERNS = [
  '/feed/', '/rss.xml', '/feed.xml', '/rss/', '/blog/feed/',
  '/blog/rss.xml', '/blog/rss/', '/news/feed/', '/news/rss.xml',
  '/blog/feed.xml', '/feeds/posts/default', '/index.xml', '/atom.xml', '/blog/index.xml'
];

// ===================================================================
// MEGBÍZHATÓSÁG: MÉDIA / AGGREGÁTOR FEKETELISTA (azonnali kizárás)
// ===================================================================
// Ezek NEM elsődleges források — más tartalmára mutatnak / hírmagazin /
// közösség. A brand szabálya: CSAK hivatalos, első-kézből való forrás.
const MEDIA_DENYLIST = [
  'techcrunch', 'theverge', 'verge', 'wired', 'venturebeat', 'arstechnica',
  'engadget', 'mashable', 'gizmodo', 'zdnet', 'cnet', 'forbes', 'businessinsider',
  'nytimes', 'theguardian', 'guardian', 'bloomberg', 'reuters', 'cnbc', 'bbc',
  'reddit', 'ycombinator', 'hnrss', 'news.google', 'medium.com', 'substack.com',
  'wordpress.com', 'blogspot.com', 'tumblr.com', 'quora', 'wikipedia',
  'yahoo', 'bing', 'msn.com', 'huffpost', 'vice.com', 'wsj.com', 'ft.com',
  'analyticsindiamag', 'towardsdatascience', 'kdnuggets', 'thenextweb', 'tnw',
  'digitaltrends', 'techradar', 'gadgets360', 'siliconangle', 'protocol',
  'axios', 'politico', 'theinformation', 'semafor', 'restofworld'
];

// ===================================================================
// MEGLÉVŐ LEFEDETTSÉG (domain ÉS márkanév szerint)
// ===================================================================

const STOPWORDS = new Set([
  'hivatalos', 'official', 'blog', 'news', 'newsroom', 'updates', 'update',
  'ai', 'ml', 'machine', 'learning', 'research', 'the', 'inc', 'llc', 'co',
  'labs', 'lab', 'team', 'group', 'technology', 'tech', 'intelligence',
  'artificial', 'platform', 'feed', 'rss', 'and', 'of', 'for'
]);

function tokensFromName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')          // (hivatalos) zárójeles rész el
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3 && !STOPWORDS.has(t));
}

function hostFirstLabel(hostname) {
  // pl. "deepmind.google" -> "deepmind", "blogs.nvidia.com" -> "nvidia"
  const parts = (hostname || '').replace(/^www\./, '').split('.').filter(Boolean);
  if (parts.length <= 1) return parts[0] || '';
  // a "blogs/news/about/research" előtag-aldomaineket átugorjuk
  const skip = new Set(['blogs', 'blog', 'news', 'about', 'research', 'developer', 'developers', 'api', 'docs', 'www']);
  let i = 0; while (i < parts.length - 2 && skip.has(parts[i])) i++;
  return parts[i] || parts[0];
}

// A már lefedett cégek "márka-kulcsai" (domain-címke + a név jelentős szavai)
function getCoverage() {
  const config = JSON.parse(readFileSync(FEEDS_PATH, 'utf-8'));
  const domains = new Set();
  const brands = new Set();
  for (const s of config.sources) {
    try {
      const host = new URL(s.url).hostname.replace(/^www\./, '');
      domains.add(host);
      brands.add(hostFirstLabel(host));
    } catch { /* skip */ }
    for (const t of tokensFromName(s.name)) brands.add(t);
  }
  return { domains, brands };
}

// ===================================================================
// AI: HIVATALOS AI FORRÁSOK JAVASLATA (a már lefedettek KIZÁRVA a kérésből)
// ===================================================================

const SCOUT_SYSTEM_PROMPT = `You are a research assistant finding OFFICIAL primary sources about AI for a news site.

We ONLY want OFFICIAL, first-party sources — a company's / organisation's / research-lab's OWN blog or newsroom.
We do NOT want: news media, magazines, aggregators, anyone reporting on others (TechCrunch, The Verge, VentureBeat, ZDNet, Hacker News, Reddit, Medium, Substack, etc.).

We ALREADY cover the big ones (OpenAI, Google, Anthropic, Microsoft, Meta, Mistral, Alibaba/Qwen, Apple, NVIDIA, Hugging Face, AWS, GitHub, Perplexity, xAI, DeepSeek, Cohere).
=> Suggest GENUINELY DIFFERENT, still reputable organisations with a REAL AI product or research output and an ACTIVE official blog. Good examples to consider: Stability AI, Runway, ElevenLabs, Adobe (Firefly), IBM Research, Salesforce AI, SAP, ServiceNow, Databricks, Snowflake, Qualcomm AI, Samsung Research, Baidu Research, Tencent AI, Naver, Together AI, AssemblyAI, Replicate, Pinecone, Weights & Biases, Scale AI, Character.AI, Midjourney, Suno, etc. (only if they truly publish an official blog).

For each, give the blog's base domain (https://...), with NO path.

Respond ONLY with a JSON array (no markdown):
[{"name": "Company Official Blog", "domain": "https://example.com", "type": "official", "country": "US", "note": "what they make / cover"}]

Give 15-25 entries. type must be "official". Prefer a global mix (US, EU, Asia, Australia if any). Do NOT include any organisation we already cover.`;

async function getCandidateOrgs(coverage) {
  const known = [...coverage.brands].filter(b => b.length >= 4).slice(0, 30).join(', ');
  const prompt = `List 18 official AI/tech company and research-lab blogs (first-party only, no news media). Do NOT include any of these already-covered orgs: ${known}. Return a complete, valid JSON array only.${skillsBlock('source-scout')}`;
  let totalCost = 0;

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
    } catch {
      if (attempt < 3) console.log(`   ↻ AI válasz csonka — újrapróbálom (${attempt}/3)...`);
    }
  }
  console.log('⚠️  3 próba után sem sikerült érvényes listát kapni.');
  return { orgs: [], cost: totalCost };
}

// ===================================================================
// RSS URL FELFEDEZÉS egy domainhez (a teljes feedet visszaadjuk a vetéshez)
// ===================================================================

async function discoverFeedForDomain(domain) {
  const base = domain.replace(/\/$/, '');
  for (const pattern of RSS_PATTERNS) {
    const url = base + pattern;
    try {
      const feed = await parser.parseURL(url);
      if (feed.items && feed.items.length > 0) {
        return { url, feed };
      }
    } catch { /* próbáljuk a következő mintát */ }
  }
  return null;
}

// ===================================================================
// MEGBÍZHATÓSÁG-KAPU — több jel, pontozva (0–100). Indoklással.
// ===================================================================

const DAY = 24 * 60 * 60 * 1000;

function newestItemAgeDays(items) {
  let newest = 0;
  for (const it of items) {
    const d = Date.parse(it.isoDate || it.pubDate || it.date || '');
    if (!isNaN(d) && d > newest) newest = d;
  }
  if (!newest) return null;               // nincs értékelhető dátum
  return Math.max(0, (Date.now() - newest) / DAY);
}

// Visszaad: { ok, score, reasons[], hardFail }
function reliabilityCheck(org, hostname, feed, coverage) {
  const reasons = [];
  const items = feed.items || [];

  // ---- KEMÉNY KIZÁRÁSOK ----
  if (!org.domain || !org.domain.startsWith('https://')) {
    return { ok: false, hardFail: 'nem HTTPS', score: 0, reasons };
  }
  if (/\d+\.\d+\.\d+\.\d+/.test(hostname) || !hostname.includes('.')) {
    return { ok: false, hardFail: 'gyanús/IP host', score: 0, reasons };
  }
  const hay = `${hostname} ${org.domain}`.toLowerCase();
  const media = MEDIA_DENYLIST.find(m => hay.includes(m));
  if (media) return { ok: false, hardFail: `média/aggregátor (${media})`, score: 0, reasons };

  if (coverage.domains.has(hostname)) {
    return { ok: false, hardFail: 'ezt a domaint már követjük', score: 0, reasons };
  }
  // CÉG-SZINTŰ deduplikáció: ha a domain-címke vagy a név egy MÁR követett cégre utal
  const candBrand = hostFirstLabel(hostname);
  const nameToks = tokensFromName(org.name);
  if (coverage.brands.has(candBrand) || nameToks.some(t => coverage.brands.has(t))) {
    return { ok: false, hardFail: `ezt a céget már lefedjük (${candBrand || nameToks[0]})`, score: 0, reasons };
  }
  if (items.length < 3) {
    return { ok: false, hardFail: `túl kevés cikk (${items.length}) — nem folyamatos forrás`, score: 0, reasons };
  }

  // ---- PONTOZÁS ----
  let score = 0;

  // (1) Frissesség — él-e a blog?
  const ageDays = newestItemAgeDays(items);
  if (ageDays === null) {
    reasons.push('⚠️ nincs olvasható dátum a cikkeken');
  } else if (ageDays <= 90) { score += 30; reasons.push(`friss (utolsó cikk ${Math.round(ageDays)} napja)`); }
  else if (ageDays <= 180) { score += 18; reasons.push(`mérsékelten friss (${Math.round(ageDays)} napja)`); }
  else if (ageDays <= 365) { score += 8; reasons.push(`lassú (${Math.round(ageDays)} napja)`); }
  else { reasons.push(`⚠️ halottnak tűnik (${Math.round(ageDays)} napja nincs új cikk)`); }

  // (2) Mennyiség — folyamatos forrás-e?
  if (items.length >= 10) { score += 20; reasons.push(`bő kínálat (${items.length} cikk)`); }
  else if (items.length >= 5) { score += 14; reasons.push(`rendszeres (${items.length} cikk)`); }
  else { score += 8; reasons.push(`van tartalom (${items.length} cikk)`); }

  // (3) Hivatalos / első-kézből (az AI besorolása; a feketelistát fent már szűrtük)
  if (org.type === 'official') { score += 25; reasons.push('hivatalos forrásként jelölve'); }
  else { reasons.push('⚠️ nincs hivatalosként jelölve'); }

  // (4) Hitelesség — a domain TÉNYLEG a cégé-e? (név↔domain↔feed-cím egyezés)
  const feedTitle = (feed.title || '').toLowerCase();
  const feedHost = (() => { try { return new URL(feed.link || org.domain).hostname.replace(/^www\./, ''); } catch { return ''; } })();
  const nameInDomain = nameToks.some(t => hostname.includes(t));
  const nameInTitle = nameToks.some(t => feedTitle.includes(t));
  const hostMatches = feedHost && (feedHost === hostname || feedHost.endsWith('.' + hostname) || hostname.endsWith('.' + feedHost));
  if (nameInDomain || nameInTitle || hostMatches) {
    score += 15;
    reasons.push('a domain/feed egyezik a cég nevével');
  } else {
    reasons.push('⚠️ a domain nem egyértelműen a cégé');
  }

  // (5) Alap: idáig eljutott = HTTPS + valódi, parse-olható RSS
  score += 10; reasons.push('HTTPS + érvényes RSS');

  return { ok: score >= MIN_SCORE, score, reasons, ageDays, itemCount: items.length };
}

// ===================================================================
// THROTTLE — csak ha elég régen futott (--if-stale N nap)
// ===================================================================
function lastRunAgeDays() {
  if (!existsSync(OUTPUT_PATH)) return Infinity;
  try {
    const prev = JSON.parse(readFileSync(OUTPUT_PATH, 'utf-8'));
    const t = Date.parse(prev?._meta?.generated_at || '');
    if (isNaN(t)) return Infinity;
    return (Date.now() - t) / DAY;
  } catch { return Infinity; }
}

// ===================================================================
// FŐ FUTTATÁS
// ===================================================================

async function main() {
  console.log('🔭 FORRÁS-KUTATÓ AGENT v3.0 (megbízhatóság-kapu) INDUL');
  console.log('─'.repeat(60));

  // Throttle: a pipeline minden futáskor hívhatja, de csak N naponta dolgozik.
  if (IF_STALE_DAYS !== null && !FORCE) {
    const age = lastRunAgeDays();
    if (age < IF_STALE_DAYS) {
      console.log(`⏭️  Legutóbb ${age.toFixed(1)} napja futott (< ${IF_STALE_DAYS}). Kihagyom (--if-stale).`);
      return;
    }
  }

  const coverage = getCoverage();
  console.log(`📋 Már lefedve: ${coverage.domains.size} domain, ${coverage.brands.size} márka-kulcs`);
  console.log(`🎯 Megbízhatósági küszöb: ${MIN_SCORE}/100\n`);

  // 1. AI javaslatok (a lefedett cégek kizárva a kérésből)
  console.log('🤖 AI-tól ÚJ, megbízható forrás-jelöltek kérése...');
  const { orgs, cost } = await getCandidateOrgs(coverage);
  console.log(`   ${orgs.length} jelölt szervezet érkezett (AI költség: $${(cost || 0).toFixed(4)})\n`);

  if (orgs.length === 0) {
    console.log('💤 Nincs jelölt. Vége.');
    return;
  }

  // 2. RSS felfedezés + MEGBÍZHATÓSÁG-KAPU
  console.log('🔍 RSS keresés + megbízhatóság-vetés domainenként...\n');
  const discovered = [];
  const rejected = [];
  let checked = 0;

  for (const org of orgs) {
    checked++;
    if (!org.domain || !org.domain.startsWith('http')) continue;

    let hostname;
    try { hostname = new URL(org.domain).hostname.replace(/^www\./, ''); }
    catch { continue; }

    // Gyors elő-kizárás (AI-hívás nélkül): már követjük / feketelista
    if (coverage.domains.has(hostname)) { console.log(`⏭️  ${org.name} (${hostname}) — már a listában`); continue; }

    const found = await discoverFeedForDomain(org.domain);
    if (!found) { console.log(`❌ ${org.name} (${hostname}) — nincs működő RSS`); continue; }

    const verdict = reliabilityCheck(org, hostname, found.feed, coverage);
    if (!verdict.ok) {
      const why = verdict.hardFail || `pont ${verdict.score} < ${MIN_SCORE}`;
      console.log(`🚫 ${org.name} (${hostname}) — KIZÁRVA: ${why}`);
      rejected.push({ name: org.name, host: hostname, reason: why, score: verdict.score });
      continue;
    }

    console.log(`✅ MEGBÍZHATÓ [${verdict.score}/100]: ${org.name} — ${found.url}`);
    console.log(`     ↳ ${verdict.reasons.join(' · ')}`);
    discovered.push({
      suggested_id: hostFirstLabel(hostname),
      name: org.name + ' (hivatalos)',
      url: found.url,
      category: 'ai-company-official',
      priority: 3,
      language: 'en',
      country: org.country || '?',
      reliability_score: verdict.score,
      reliability_reasons: verdict.reasons,
      item_count_at_discovery: verdict.itemCount,
      last_post_age_days: verdict.ageDays != null ? Math.round(verdict.ageDays) : null,
      comment: `JAVASLAT (source-scout, megbízhatóság ${verdict.score}/100): ${org.note || 'hivatalos forrás'}. Felhasználói jóváhagyás kell!`,
      enabled: false
    });
  }

  // Legmegbízhatóbb elöl
  discovered.sort((a, b) => b.reliability_score - a.reliability_score);

  // 3. Javaslat mentése
  const output = {
    _meta: {
      generated_at: new Date().toISOString(),
      generated_by: 'source-scout agent v3.0 (megbízhatóság-kapu)',
      note: 'JAVASLATOK új, MEGBÍZHATÓ hivatalos forrásokra. A felhasználó/főnök dönti el, melyiket adjuk a sources/rss-feeds.json-hoz (enabled:true-val). Minden jelölt megbízhatósági pontszámmal + indoklással.',
      min_score: MIN_SCORE,
      checked_orgs: checked,
      newly_discovered: discovered.length,
      rejected_count: rejected.length,
      rejected_examples: rejected.slice(0, 8)
    },
    discovered_sources: discovered
  };
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf-8');

  // 4. Összefoglaló
  console.log('\n' + '─'.repeat(60));
  console.log('📊 ÖSSZEFOGLALÓ:');
  console.log(`   Ellenőrzött szervezet: ${checked}`);
  console.log(`   🚫 Megbízhatóságon elbukott: ${rejected.length}`);
  console.log(`   🆕 MEGBÍZHATÓ új forrás: ${discovered.length}`);
  console.log(`   💰 AI költség: $${(cost || 0).toFixed(4)}`);
  console.log('─'.repeat(60));

  if (discovered.length > 0) {
    console.log(`\n✨ ${discovered.length} megbízható javaslat a fájlban:`);
    console.log(`   agents/source-scout/discovered-sources.json`);
    discovered.slice(0, 5).forEach(d => console.log(`   • [${d.reliability_score}] ${d.name} — ${d.url}`));
    console.log(`   Nézd át/hagyd jóvá, és amit jónak látsz, átemeljük a forrásokhoz!`);

    // Heartbeat (vezérlőpult-napló) + VALÓDI Telegram-üzenet a főnöknek,
    // hogy egy szóval jóvá tudja hagyni.
    const topLog = discovered.slice(0, 5).map(d => `• [${d.reliability_score}] ${d.name}`).join('\n');
    notify('info', `🧭 Forráskutató: ${discovered.length} ÚJ megbízható forrás-javaslat (küszöb ${MIN_SCORE}).\n${topLog}\nJóváhagyod valamelyiket?`, { agent: 'source-scout' });

    const tg = discovered.slice(0, 6).map(d => {
      const clean = d.name.replace(/\s*\(hivatalos\)$/, '');
      const age = d.last_post_age_days != null ? `, utolsó cikk ${d.last_post_age_days} napja` : '';
      return `• *${clean}* — megbízhatóság ${d.reliability_score}/100${age}`;
    }).join('\n');
    const firstName = discovered[0].name.replace(/\s*\(hivatalos\)$/, '');
    try {
      await sendMessage(
        `🧭 *Forráskutató* itt! Találtam ${discovered.length} ÚJ, megbízható hivatalos AI-forrást (csak elsődleges, ellenőrzött):\n\n${tg}\n\n` +
        `Egyiket sem kapcsoltam be magamtól. Ha jónak látod, írd vissza pl.:\n„*vedd fel a(z) ${firstName}*" — és élesítem. ✅`
      );
    } catch (e) { console.log('⚠️ Telegram értesítés kihagyva:', e.message); }
  } else {
    console.log('\n💤 Nem találtunk a küszöböt elérő új forrást (a meglévők már jók).');
  }
}

main().catch(error => {
  console.error('💥 KRITIKUS HIBA:', error);
  process.exit(1);
});
