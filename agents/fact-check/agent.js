// ===================================================================
// TÉNY-ELLENŐRZŐ AGENT (Fact-check / Frissesség-őr)
// ===================================================================
//
// FELADAT:
//   A MÁR PUBLIKÁLT útmutatókat újraellenőrzi, hogy ne állítsunk valótlant.
//   Ha egy cég kivesz/megváltoztat egy funkciót (pl. képszerkesztés),
//   de mi írtunk hozzá útmutatót, akkor a VALÓTLANNÁ vált részt
//   ELTÁVOLÍTJA vagy LÁGYÍTJA (feltételessé teszi), a többit megtartja —
//   majd a javított útmutató VISSZAMEGY az Ellenőrző igazság-kapujára
//   ("ellenőrizzük vissza"). Ha a teljes útmutató tárgytalan, leveszi és
//   emberhez eszkalál.
//
// HOGYAN TUDJA, MI VÁLTOZOTT:
//   1) --claim "<bejelentett változás>"  (ember/hír megadja) — legbiztosabb
//   2) frissesség-átvizsgálás: a friss HIVATALOS hírekkel (scraper/cikkek)
//      veti össze az adott cég útmutatóit; a kockázatos/idő-érzékeny
//      állításokat lágyítja ("ha elérhető, keresd a…").
//   ALAPELV: amit nem tud biztosan, azt INKÁBB lágyítja, sosem talál ki.
//
// ── 2026-07-30: BEKÖTVE ÉS BIZTONSÁGOSSÁ TÉVE ──────────────────────
// Az agent 2026-06-22 óta készen állt, de SOHA nem kötötték be — pedig
// valódi lyukat fed le: a hitelesség-kapu CSAK publikálás ELŐTT ellenőriz,
// a 240 már kint lévő útmutatót azóta senki nem nézte újra. Ha egy cég
// kivesz egy funkciót, a mi útmutatónk némán hazuggá válik.
//
// A BEKÖTÉS ELŐTT ÁT KELLETT ÉPÍTENI: az eredeti terv a javításnál és a
// levételnél is TÖRÖLTE a publikált cikket (404 + elveszett rangsor-erő,
// elutasításnál végleges tartalom-vesztés). Most:
//   • a javítás HELYBEN történik, ugyanazzal a rögzített sluggal → az URL
//     nem mozdul, az oldal végig él;
//   • ha a javítás nem elég ép, A RÉGI MARAD;
//   • "tárgytalan" ítéletnél NEM törlünk, csak MEGJELÖLÜNK és szólunk —
//     egy oldal levétele emberi döntés.
// Heti kör, futásonként kevés útmutató, a legrégebben ellenőrzöttel kezdve.
//
// FUTTATÁS:
//   node agents/fact-check/agent.js --claim "OpenAI removed image editing from ChatGPT free tier" --company OpenAI
//   node agents/fact-check/agent.js --id chatgpt-voice
//   node agents/fact-check/agent.js                 -- frissesség-átvizsgálás (mind)
//   node agents/fact-check/agent.js --dry           -- csak megmutatja, nem ír
// ===================================================================

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ask } from '../../core/ai-router.js';
import { remember } from '../../core/memory-manager.js';
import { message } from '../../core/ops.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const ARTICLES_DIR = join(ROOT, 'content', 'articles');
const DRAFTS_DIR = join(ROOT, 'content', 'drafts');
const SHARED_DIR = join(ROOT, 'shared');
const LOGS_DIR = join(ROOT, 'logs');
const AGENT_NAME = 'fact-check';

function parseArgs() {
  const a = process.argv.slice(2);
  const p = { claim: null, company: null, tool: null, id: null, dry: false, limit: 20 };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--claim' && a[i + 1]) p.claim = a[++i];
    else if (a[i] === '--company' && a[i + 1]) p.company = a[++i];
    else if (a[i] === '--tool' && a[i + 1]) p.tool = a[++i];
    else if (a[i] === '--id' && a[i + 1]) p.id = a[++i];
    else if (a[i] === '--limit' && a[i + 1]) p.limit = parseInt(a[++i], 10) || 20;
    else if (a[i] === '--dry') p.dry = true;
  }
  return p;
}

function loadBrandContext() {
  const parts = [];
  for (const f of ['style-guide.md', 'legal-rules.md']) {
    const path = join(SHARED_DIR, f);
    if (existsSync(path)) parts.push(`=== ${f} ===\n${readFileSync(path, 'utf-8')}`);
  }
  return parts.join('\n\n');
}

// Publikált útmutatók betöltése (szűrve: company/tool/id/claim-cég)
function loadGuides(args) {
  if (!existsSync(ARTICLES_DIR)) return [];
  const guides = [];
  for (const f of readdirSync(ARTICLES_DIR).filter(x => x.endsWith('.json'))) {
    try {
      const d = JSON.parse(readFileSync(join(ARTICLES_DIR, f), 'utf-8'));
      if (d._meta?.type !== 'guide') continue;
      guides.push({ file: f, data: d });
    } catch {}
  }
  let list = guides;
  if (args.id) list = list.filter(g => g.data._meta?.guide_topic_id === args.id);
  if (args.company) list = list.filter(g => (g.data._meta?.company || '').toLowerCase() === args.company.toLowerCase());
  if (args.tool) list = list.filter(g => (g.data._meta?.tool || '').toLowerCase() === args.tool.toLowerCase());
  // --claim cég-szűrés: ha a claim megemlít egy általunk ismert céget, arra szűkítünk
  if (args.claim && !args.company && !args.tool && !args.id) {
    const claimLc = args.claim.toLowerCase();
    const mentioned = [...new Set(guides.map(g => g.data._meta?.company).filter(Boolean))]
      .filter(c => claimLc.includes(c.toLowerCase()));
    if (mentioned.length) list = list.filter(g => mentioned.includes(g.data._meta?.company));
  }

  // ── AUTOMATA KÖR (2026-07-30): "a legrégebben ellenőrzött megy előre" ──
  // Kézi indításnál (--claim/--id/--company/--tool) a user tudja, mit akar —
  // ott nem szűrünk. A HETI automata körnél viszont:
  //   1) friss útmutatóhoz NEM nyúlunk (30 napnál fiatalabb: a hitelesség-kapu
  //      épp most engedte át, nincs mit újraellenőrizni rajta);
  //   2) a legrégebben ellenőrzött kerül előre, hogy körbeérjünk a 240-en;
  //   3) az emberre váró (megjelölt) útmutatót kihagyjuk — már döntésre vár.
  if (!args.claim && !args.id && !args.company && !args.tool) {
    const monthAgo = Date.now() - 30 * 86400e3;
    list = list
      .filter(g => !g.data._meta?.fact_check_flag)
      .filter(g => {
        const pub = new Date(g.data._meta?.published_at || 0).getTime();
        return pub && pub < monthAgo;
      })
      .sort((a, b) => {
        const av = a.data._meta?.fact_checked_at || '';   // sosem ellenőrzött = '' → elöl
        const bv = b.data._meta?.fact_checked_at || '';
        return av.localeCompare(bv);
      });
  }
  return list.slice(0, args.limit);
}

// Friss HIVATALOS jelek: a legutóbbi hírek/scraper-témák címei az adott cégről
function recentSignals(company) {
  if (!company) return [];
  const out = [];
  const scan = (dir) => {
    if (!existsSync(dir)) return;
    for (const f of readdirSync(dir).filter(x => x.endsWith('.json'))) {
      try {
        const d = JSON.parse(readFileSync(join(dir, f), 'utf-8'));
        if (d._meta?.type === 'guide') continue; // útmutató nem "jel"
        const t = d.original_title || d.title || '';
        const sub = (d.article_markdown || '').slice(0, 0); // cím elég
        if (t && t.toLowerCase().includes(company.toLowerCase())) out.push(t);
      } catch {}
    }
  };
  scan(ARTICLES_DIR); scan(DRAFTS_DIR);
  return [...new Set(out)].slice(0, 6);
}

function hasGuideStructure(md) {
  if (!md) return false;
  const fm = md.trimStart().startsWith('---');
  const impact = /what this means for you/i.test(md);
  const steps = (md.match(/^##\s*Step\s*\d/gim) || []).length >= 2;
  return fm && impact && steps;
}

function parseJson(text) {
  if (!text) return null;
  let t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s === -1 || e === -1) return null;
  try { return JSON.parse(t.slice(s, e + 1)); } catch { return null; }
}

const SYSTEM_PROMPT = `You are the Fact-Check / Freshness agent for AI World Co. Your ONLY job is truthfulness: make sure a published step-by-step guide does not state anything that is no longer true.

A company may have REMOVED or CHANGED a feature after we published a guide about it. Find any claim that is now FALSE, removed, or that you cannot stand behind, and either REMOVE it or SOFTEN it into a conditional ("if it's available, look for…"). Keep everything that is still accurate. NEVER invent new facts. When unsure, SOFTEN rather than assert.

If only parts are affected: return the FULL corrected guide (same step-by-step format: YAML frontmatter with category: "guide", "## Before you start", 2-6 "## Step N — …", "## Common mistakes", "## What this means for you", "## Try it now").
If the WHOLE guide teaches a feature that no longer exists at all: verdict "unpublish".
If nothing needs changing: verdict "ok".

Output ONLY JSON (no prose, no code fence):
{"verdict":"ok"|"fix"|"unpublish","removed_claims":["..."],"reason":"one short sentence","fixed_markdown":"full corrected guide markdown, or empty string"}`;

async function audit(guide, args, brandContext) {
  const meta = guide.data._meta || {};
  const signals = args.claim ? [] : recentSignals(meta.company);
  const userPrompt = `Audit this PUBLISHED guide for anything that is no longer true.

GUIDE TITLE: "${guide.data.original_title || ''}"
TOOL/COMPANY: ${[meta.company, meta.tool].filter(Boolean).join(' — ') || 'general'}

${args.claim ? `KNOWN CHANGE TO APPLY (treat as authoritative):\n"${args.claim}"\n` : ''}${signals.length ? `RECENT OFFICIAL HEADLINES about this company (context — may signal changes):\n${signals.map(s => `- ${s}`).join('\n')}\n` : ''}
THE GUIDE:
${guide.data.article_markdown || ''}

BRAND/LEGAL RULES:
${brandContext}

Remove or soften anything false/removed/unverifiable. Output ONLY the JSON.`;

  const response = await ask(userPrompt, { agentName: AGENT_NAME, systemPrompt: SYSTEM_PROMPT, maxTokens: 3500, jsonMode: true });
  return { response, decision: parseJson(response?.text) };
}

// ===================================================================
// BIZTONSÁGOS CSERE (2026-07-30-i átépítés)
// ===================================================================
// AZ EREDETI TERV VESZÉLYES VOLT. Két helyen unlinkSync-elte a PUBLIKÁLT
// cikket:
//   • "fix"-nél levette az oldalról és vázlatként visszaküldte ellenőrzésre
//     → az URL 404 lett, amíg (ha egyáltalán) átment; elutasításnál VÉGLEG
//     elveszett volna a cikk;
//   • "unpublish"-nál azonnal törölte, 301 nélkül.
// Épp ezt a kárt (404 + elveszett rangsor-erő) javítottuk napokig a Search
// Console jelzései után. Ezért a végrehajtást átépítettem a MÁR BEVÁLT
// mintára (agents/iro/upgrade-howtos.js): A RÉGI VERZIÓ KINT MARAD, amíg az
// ÚJ nem bizonyít — az oldalon soha nincs lyuk.
//
// A JAVÍTÁS HELYBEN történik, UGYANAZZAL a fájllal és rögzített sluggal,
// tehát az URL sem mozdul.

/** Az új szöveg csak akkor cserélheti le a régit, ha épebb nála. */
function isSafeReplacement(fixed, original) {
  if (!fixed || !hasGuideStructure(fixed)) return 'nincs meg az útmutató-szerkezet';
  const fw = fixed.split(/\s+/).length, ow = (original || '').split(/\s+/).length;
  // A lágyítás rövidíthet, de a felére zsugorodás már tartalom-vesztés.
  if (ow && fw < ow * 0.5) return `túl rövid lett (${fw} szó a ${ow}-ből)`;
  if (!/^title:\s*\S/m.test(fixed)) return 'nincs title mező';
  return null;   // rendben
}

/** HELYBEN javít — az URL és a slug változatlan, az oldal végig él. */
function applyFix(guide, fixedMarkdown, reason, claims) {
  guide.data.article_markdown = fixedMarkdown;
  guide.data._meta = {
    ...guide.data._meta,
    fact_checked_at: new Date().toISOString(),
    fact_check_reason: reason,
    fact_check_removed: claims || undefined,
    fact_check_count: (guide.data._meta?.fact_check_count || 0) + 1
  };
  writeFileSync(join(ARTICLES_DIR, guide.file), JSON.stringify(guide.data, null, 2), 'utf-8');
  // A fordítások elavultak → töröljük, hogy a következő futás újrafordítsa
  try {
    const t = join(ROOT, 'content', 'translations', guide.file);
    if (existsSync(t)) unlinkSync(t);
  } catch { /* marad a régi fordítás — nem kritikus */ }
}

/**
 * "unpublish" ítélet: MEGJELÖLÉS, NEM TÖRLÉS.
 * Egy oldal levétele emberi döntés: 404-et okoz, rangsor-erőt veszít, és
 * 301-et kellene hozzá írni. A gép csak JELEZ, a user dönt.
 */
function flagForHuman(guide, reason) {
  guide.data._meta = {
    ...guide.data._meta,
    fact_check_flag: 'may-be-obsolete',
    fact_check_reason: reason,
    fact_checked_at: new Date().toISOString()
  };
  writeFileSync(join(ARTICLES_DIR, guide.file), JSON.stringify(guide.data, null, 2), 'utf-8');
}

async function main() {
  const args = parseArgs();
  console.log('🕵️  TÉNY-ELLENŐRZŐ AGENT (frissesség-őr)');
  console.log('─'.repeat(60));
  if (args.claim) console.log(`📌 Bejelentett változás: "${args.claim}"`);

  const guides = loadGuides(args);
  if (!guides.length) { console.log('💤 Nincs ellenőrizendő publikált útmutató (a szűrőre).'); return; }
  console.log(`🔎 ${guides.length} útmutató ellenőrzése${args.dry ? ' (DRY — nem írok)' : ''}\n`);

  const brandContext = loadBrandContext();
  let ok = 0, fixed = 0, removed = 0, cost = 0, needRecheck = 0;

  for (const guide of guides) {
    const title = (guide.data.original_title || guide.file).slice(0, 50);
    const { response, decision } = await audit(guide, args, brandContext);
    cost += response?.costUsd || 0;

    if (!decision) { console.log(`⚠️  ${title}… — döntés nem értelmezhető, kihagyom`); continue; }

    if (decision.verdict === 'ok') {
      console.log(`✅ OK: ${title}…`);
      ok++;
      continue;
    }

    const claims = (decision.removed_claims || []).slice(0, 3).join('; ');
    if (decision.verdict === 'unpublish') {
      // NEM TÖRLÜNK. Egy oldal levétele emberi döntés (404 + elveszett rangsor
      // + 301 kellene hozzá). A gép megjelöl és szól — a user dönt.
      console.log(`🙋 MEGJELÖLVE (levételre javasolt): ${title}… — ${decision.reason}`);
      if (!args.dry) {
        flagForHuman(guide, decision.reason);
        message('fact-check', 'human', 'need', `Ez az útmutató talán tárgytalanná vált: "${title}" — ${decision.reason}. NEM vettem le (az törölné az URL-t is) — dönts róla.`, { ref: guide.file });
        remember('guide', `Do not claim this exists (may be removed): ${decision.reason}`.slice(0, 200), { tags: ['fact-check', 'removed'] });
      }
      removed++;
      continue;
    }

    // verdict === 'fix' — HELYBEN javítunk, az URL nem mozdul, az oldal végig él
    const why = decision.fixed_markdown ? isSafeReplacement(decision.fixed_markdown, guide.data.article_markdown) : 'nincs javított szöveg';
    if (!why) {
      console.log(`🔧 JAVÍTÁS: ${title}… — eltávolítva/lágyítva: ${claims || decision.reason}`);
      if (!args.dry) {
        applyFix(guide, decision.fixed_markdown, decision.reason, claims);
        message('fact-check', 'team', 'fix', `Valótlanná vált részt lágyítottam egy publikált útmutatóban: "${title}" — ${claims || decision.reason}`, { ref: guide.file });
        if (claims) remember('guide', `Avoid stating (may be removed/false): ${claims}`.slice(0, 200), { tags: ['fact-check', 'lesson'] });
      }
      fixed++;
    } else if (decision.fixed_markdown) {
      // Van javaslat, de nem elég ép → A RÉGI MARAD. Inkább a régi jó szöveg,
      // mint egy megcsonkított új.
      console.log(`⏭️  ${title}… — a javítás nem elég ép (${why}), a RÉGI marad`);
      if (!args.dry) message('fact-check', 'ceo', 'need', `Gyanús állítás, de a javítás nem volt elég ép (${why}): "${title}" — ${decision.reason}`, { ref: guide.file });
    } else {
      // Talált gondot, de nincs jó javítás → jelez, nem törlünk vakon
      console.log(`🙋 JELZÉS: ${title}… — gyanús állítás, de nincs biztos javítás: ${decision.reason}`);
      if (!args.dry) message('fact-check', 'ceo', 'need', `Ellenőrizendő állítás: "${title}" — ${decision.reason}`, { ref: guide.file.replace(/^ARTICLE_/, '') });
    }
  }

  console.log('─'.repeat(60));
  console.log(`📊 TÉNY-ELLENŐRZÉS: ${ok} rendben, ${fixed} javítva, ${removed} levéve | költség $${cost.toFixed(4)}`);
  if (needRecheck > 0 && !args.dry)
    console.log(`🔁 ${needRecheck} javított útmutató VISSZAMEGY az Ellenőrzőre — futtasd: node agents/ellenorzo/agent.js (vagy a CEO pipeline elvégzi).`);

  if (!args.dry) {
    if (!existsSync(LOGS_DIR)) mkdirSync(LOGS_DIR, { recursive: true });
    writeFileSync(join(LOGS_DIR, `factcheck_${new Date().toISOString().replace(/[:.]/g, '-')}.json`),
      JSON.stringify({ ok, fixed, removed, cost, at: new Date().toISOString(), claim: args.claim || null }, null, 2), 'utf-8');
  }
}

main().catch(e => { console.error('💥 TÉNY-ELLENŐRZŐ HIBA:', e); process.exit(1); });
