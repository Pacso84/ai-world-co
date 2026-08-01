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
// KÜSZÖB 70 → 100 (2026-08-01, user: "csak olyanokat nézz, ami 100 százalékos
// és hasznos számunkra"). Előzmény: a 70-es kapun átment 6 javaslat MIND
// hiteles volt (100/100/100/94/78/70) és MIND haszontalan — a pontszám ugyanis
// azt méri, VALÓDI-e a forrás, nem azt, hogy KELL-e nekünk. A 100 megköveteli
// mind az öt feltételt egyszerre: friss + bő kínálat + hivatalos + a domain
// tényleg a cégé + érvényes RSS. A "hasznos-e" külön szűrő: lásd SCOUT_NICHES.
const MIN_SCORE = parseInt(argVal('--min-score', '100'), 10);
// Ennél régebben néma feed KIZÁRÓ okkal esik ki (pontszámtól függetlenül) — 2026-07-21.
const DEAD_FEED_DAYS = parseInt(argVal('--dead-days', '365'), 10);

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
  // Cégenkénti DARABSZÁM is (2026-08-01) — lásd a kizárásnál: egy cégtől a
  // 2-3. TERMÉK-hírfolyam értékes lehet, csak a végtelen ismétlés nem.
  const brandCount = new Map();
  const bump = b => { if (b) brandCount.set(b, (brandCount.get(b) || 0) + 1); };
  for (const s of config.sources) {
    let label = '';
    try {
      const host = new URL(s.url).hostname.replace(/^www\./, '');
      domains.add(host);
      label = hostFirstLabel(host);
      brands.add(label);
    } catch { /* skip */ }
    for (const t of tokensFromName(s.name)) brands.add(t);
    bump(label);
  }
  return { domains, brands, brandCount };
}

// ===================================================================
// AI: HIVATALOS AI FORRÁSOK JAVASLATA (a már lefedettek KIZÁRVA a kérésből)
// ===================================================================

const SCOUT_SYSTEM_PROMPT = `You are a research assistant finding OFFICIAL primary sources about AI for a news site.

We ONLY want OFFICIAL, first-party sources — a company's / organisation's / research-lab's OWN blog or newsroom.
We do NOT want: news media, magazines, aggregators, anyone reporting on others (TechCrunch, The Verge, VentureBeat, ZDNet, Hacker News, Reddit, Medium, Substack, etc.).

We ALREADY cover the big ones (OpenAI, Google, Anthropic, Microsoft, Meta, Mistral, Alibaba/Qwen, Apple, NVIDIA, Hugging Face, AWS, GitHub, Perplexity, xAI, DeepSeek, Cohere) and many well-known second-tier ones.
=> Suggest GENUINELY DIFFERENT, still reputable organisations with a REAL AI product or research output and an ACTIVE official blog. Focus on the SPECIFIC NICHES the user asks for, and prefer names that are NOT the first ones everyone thinks of — dig deeper into those niches.

For each, give the blog's base domain (https://...), with NO path.

Respond ONLY with a JSON array (no markdown):
[{"name": "Company Official Blog", "domain": "https://example.com", "type": "official", "country": "US", "note": "what they make / cover"}]

Give 15-25 entries. type must be "official". Prefer a global mix (US, EU, Asia, Australia if any). Do NOT include any organisation we already cover.`;

// FORGÓ VADÁSZMEZŐK (2026-07-05, user-jelzés: "nem küld új forrásokat"):
// a fix példa-lista kimerült — futásonként 2 VÉLETLEN fülkéből kérünk
// jelölteket, így mindig új területen kutat, nem ugyanazt a 18 nevet rágja.
// ══ ÚJ VADÁSZMEZŐK (2026-08-01) ══════════════════════════════════════
// User: "csak olyanokat nézz, ami 100 százalékos ÉS HASZNOS SZÁMUNKRA."
//
// MÉRÉS, ami ezt kiváltotta (581 cikk forrásonkénti útmutató-aránya):
//   Google Workspace (termék-frissítések)  29 cikk → 17 útmutató = 59%  🏆
//   AWS ML                                 41 →  12 = 29%
//   Nvidia / Databricks / Apple ML         18 →   2 = 5-11%
//   17 forrás (kutatólab, chip, vállalati) 66 →   0 =  0%
//
// A minta: HÉTKÖZNAPI EMBER ÁLTAL HASZNÁLT TERMÉK frissítés-híréből lesz
// útmutató. Modellről, chipről, kutatásról szóló hírből SOHA.
//
// A RÉGI LISTA 14 mezőjéből 13 pont a 0%-os fajtára célzott (kutatólabok,
// chipgyártók, robotika, szabványügy, vállalati platformok), és futásonként
// csak 2-t húzott véletlenül — ezért hozott hónapokig használhatatlan
// javaslatokat 100/100-as megbízhatósággal. Nem a kapu volt rossz: rossz
// mezőn vadászott. Az EGYETLEN jó sor a régi listából ("consumer app
// companies…") itt több, konkrétabb mezőre bomlik.
//
// AMI SZÁNDÉKOSAN KIMARADT: kutatóintézet, chip/hardver, vállalati-only
// platform, MLOps, robotika, szabvány/policy. Ezek hitelesek, de az
// olvasóinknak nem használhatók. Ha egyszer mégis kellenének, ide vissza.
const SCOUT_NICHES = [
  'note-taking, document and productivity app companies (product release notes)',
  'photo, video and design app companies for non-professionals',
  'consumer AI assistant and chatbot products (consumer-facing update feeds)',
  'education, language-learning and study app companies',
  'smart-home, wearable and consumer-device makers with AI features',
  'chat, email, calendar and video-meeting app companies',
  'personal finance, shopping, travel and everyday-life app companies',
  'writing, music and podcast creation tools for everyday users',
  'photo/file storage, notes and personal-cloud services',
  'web browser, search and mobile-OS makers (consumer feature announcements)',
  'small-business and freelancer software with AI features (invoicing, scheduling, CRM)',
  'health, fitness and cooking app companies with AI features'
];

async function getCandidateOrgs(coverage) {
  const known = [...coverage.brands].filter(b => b.length >= 4).slice(0, 30).join(', ');
  // 2 véletlen fülke — minden futás máshol vadászik
  const niches = [...SCOUT_NICHES].sort(() => Math.random() - 0.5).slice(0, 2);
  console.log(`🎯 Mai vadászmezők: ${niches.join('  +  ')}`);
  // A KÉRÉS IS TERMÉK-KÖZPONTÚ (2026-08-01). Korábban "official blogs/newsrooms"-ot
  // kértünk — arra a cégek KUTATÁSI és SAJTÓ-blogját kaptuk, amiből 0 útmutató lesz.
  // Most kifejezetten a "mi újság a termékben" típusú hírfolyamot kérjük: pontosan
  // ilyen a Google Workspace Updates, a legjobb forrásunk (59% útmutató).
  const prompt = `List 18 official PRODUCT-UPDATE feeds (release notes, changelogs, "what's new" or product newsroom) from: (a) ${niches[0]}, and (b) ${niches[1]}.

HARD REQUIREMENTS:
- First-party official sources only. No news media, no aggregators, no review sites.
- The product must be one ORDINARY, NON-TECHNICAL PEOPLE actually use themselves.
- Prefer feeds announcing new FEATURES users can try, over corporate//research news.
- EXCLUDE: research labs, universities, chip/hardware makers, MLOps and developer
  infrastructure, and enterprise-only platforms an ordinary person never touches.

Do NOT include any of these already-covered feeds: ${known}. Return a complete, valid JSON array only.${skillsBlock('source-scout')}`;
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
      let orgs = JSON.parse(text);
      // JSON-objektum-mód (GLM-4.7) borítékot adhat: {"sources":[...]} → kibontjuk
      if (orgs && typeof orgs === 'object' && !Array.isArray(orgs))
        orgs = Object.values(orgs).find(Array.isArray) || [];
      if (Array.isArray(orgs) && orgs.length > 0) return { orgs, cost: totalCost };
    } catch {
      if (attempt < 3) console.log(`   ↻ AI válasz csonka — újrapróbálom (${attempt}/3)...`);
    }
  }
  console.log('⚠️  3 próba után sem sikerült érvényes listát kapni.');
  // Saját lecke (stabil szöveg — 2026-07-16, "külön memória minden agentnek")
  try { const { remember } = await import('../../core/memory-manager.js'); remember(AGENT_NAME, 'A forrás-lista 3 próbából sem lett érvényes JSON-tömb — kevesebb elemet és szigorú tömb-formát kell kérni.', { tags: ['parse-fail'] }); } catch { /* nem állít meg */ }
  return { orgs: [], cost: totalCost };
}

// ===================================================================
// RSS URL FELFEDEZÉS egy domainhez (a teljes feedet visszaadjuk a vetéshez)
// ===================================================================

async function discoverFeedForDomain(domain) {
  const base = domain.replace(/\/$/, '');
  // PÁRHUZAMOSAN próbáljuk az összes mintát — az első működő nyer.
  // (Sorban 14 minta × 12 mp timeout = percek EGY lassú domainre; így max ~12 mp.)
  const attempts = RSS_PATTERNS.map(async (pattern) => {
    const url = base + pattern;
    const feed = await parser.parseURL(url);
    if (feed.items && feed.items.length > 0) return { url, feed };
    throw new Error('üres feed');
  });
  try { return await Promise.any(attempts); }
  catch { return null; }
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
  // ══ CÉG-SZINTŰ → TERMÉK-SZINTŰ deduplikáció (2026-08-01) ═══════════
  // A régi szabály MINDEN olyan forrást kizárt, aminek a cégét már követtük.
  // Csakhogy egy cégnek több, TELJESEN KÜLÖNBÖZŐ hírfolyama van, és épp a
  // "második" a jó: a Google AI-blogja 29%-nyi útmutatót ad, a Google
  // WORKSPACE-frissítései 59%-ot — ez a LEGJOBB forrásunk. Ha a kereső agent
  // találta volna meg, a saját szabályunk dobta volna ki "duplikátumként".
  // (Ugyanígy esett ki a Microsoft 365 Insider a microsoft-ai mellett.)
  // A pontos domain-egyezés természetesen továbbra is kizáró (fent).
  // Marad viszont a MÉRTÉK: cégenként legfeljebb 3 hírfolyam, hogy egyetlen
  // nagy cég ne nyelje el a forrás-listát.
  const candBrand = hostFirstLabel(hostname);
  const nameToks = tokensFromName(org.name);
  const already = Math.max(
    coverage.brandCount?.get(candBrand) || 0,
    ...nameToks.map(t => coverage.brandCount?.get(t) || 0)
  );
  if (already >= 3) {
    return { ok: false, hardFail: `ettől a cégtől már ${already} hírfolyamot követünk (${candBrand || nameToks[0]})`, score: 0, reasons };
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

  // KIZÁRÓ OK (2026-07-21, user-észrevételből): a halott feed a többi szemponton
  // (hivatalos + HTTPS + sok régi cikk) összeszedheti a 70 pontot és átcsúszhat a
  // kapun — a VinAI 475 NAPJA néma forrás így lett "javaslat". Egy hírportálnak
  // a néma forrás értéktelen: ez pontszámtól FÜGGETLENÜL kiesik.
  if (ageDays !== null && ageDays > DEAD_FEED_DAYS) {
    return {
      ok: false, score, reasons, ageDays, itemCount: items.length,
      hardFail: `halott feed — ${Math.round(ageDays)} napja nincs új cikk (limit: ${DEAD_FEED_DAYS})`
    };
  }

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

  // A user által véglegesen elutasított hostok (a javaslat-fájlból)
  let userRejected = new Set();
  try {
    userRejected = new Set(JSON.parse(readFileSync(OUTPUT_PATH, 'utf-8')).user_rejected_hosts || []);
    if (userRejected.size) console.log(`🚫 Véglegesen elutasítva korábban: ${userRejected.size} forrás\n`);
  } catch { /* nincs korábbi fájl */ }

  for (const org of orgs) {
    checked++;
    if (!org.domain || !org.domain.startsWith('http')) continue;

    let hostname;
    try { hostname = new URL(org.domain).hostname.replace(/^www\./, ''); }
    catch { continue; }

    // Gyors elő-kizárás (AI-hívás nélkül): már követjük / feketelista
    if (coverage.domains.has(hostname)) { console.log(`⏭️  ${org.name} (${hostname}) — már a listában`); continue; }
    // AMIT A USER EGYSZER VISSZADOBOTT, TÖBBÉ NE JÖJJÖN VISSZA (2026-08-01).
    // Enélkül minden futás újra felajánlaná ugyanazokat a 100 pontos, de
    // számunkra haszontalan forrásokat, és a user újra és újra dönthetne
    // ugyanarról. A lista a javaslat-fájlban él, kézzel bővíthető.
    if (userRejected.has(hostname)) { console.log(`🚫 ${org.name} (${hostname}) — a user korábban elutasította`); continue; }

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

  // KORÁBBI, még érvényes javaslatok MEGŐRZÉSE: ami a múltkori kutatásból
  // még nincs se lefedve, se az új listában, azt nem dobjuk el (már átment
  // a megbízhatóság-kapun). Így egy újrafuttatás nem "felejti el" a várólistát.
  try {
    const prevFile = JSON.parse(readFileSync(OUTPUT_PATH, 'utf-8'));
    const prev = prevFile.discovered_sources || [];
    const newHosts = new Set(discovered.map(d => { try { return new URL(d.url).hostname.replace(/^www\./, ''); } catch { return ''; } }));
    for (const p of prev) {
      let host = '';
      try { host = new URL(p.url).hostname.replace(/^www\./, ''); } catch { continue; }
      if (newHosts.has(host) || coverage.domains.has(host)) continue;
      // A KÜSZÖBÖT ÚJRA MÉRJÜK a megőrzöttekre is (2026-08-01). Enélkül a
      // szigorítás csak az ÚJ jelöltekre hatna, a régi, alacsonyabb pontszámmal
      // átcsúszott javaslatok pedig örökre a várólistán maradnának — a user
      // meg olyan listát látna, ami már nem felel meg a saját szabályának.
      if ((p.reliability_score ?? 0) < MIN_SCORE) {
        console.log(`🧹 Elavult javaslat eldobva: ${p.name} [${p.reliability_score} < ${MIN_SCORE}]`);
        continue;
      }
      if ((coverage.brandCount?.get(hostFirstLabel(host)) || 0) >= 3) continue;
      discovered.push(p);
      newHosts.add(host);
      console.log(`♻️  Megőrizve a korábbi kutatásból: ${p.name} [${p.reliability_score}]`);
    }
  } catch { /* nincs korábbi fájl */ }

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
    // ÁT KELL VINNI minden futáson, különben a végleges elutasítás elveszne
    // és a rendszer újra felajánlaná ugyanazokat.
    user_rejected_hosts: [...userRejected].sort(),
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

// EXPLICIT KILÉPÉS: a sok RSS-próbálkozás után lógva maradt kapcsolatok
// életben tarthatják a node-ot (2026-07-01: 6 órás beragadás a felhőben!).
main().then(() => process.exit(0)).catch(error => {
  console.error('💥 KRITIKUS HIBA:', error);
  process.exit(1);
});
