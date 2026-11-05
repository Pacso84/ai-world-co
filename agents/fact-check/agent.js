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
import { nameLockObjection, jegyezNevZar } from '../../core/name-guard.js';
import {
  ellenorzesiSor, forrasAlatamasztja, forrasbanNemSzereplo, frontmatterVissza, HIR_RENDSZER, hirCsereEp,
  UTMUTATO_GYANU_RENDSZER, gyanuDontes, jsonKivesz, atnezveMeta, kihagyasMeta, ertelmezhetetlenMeta, gyanuMeta,
  SKIP_MAX, ERTELMEZHETETLEN_MAX, naploTetel, tenyNaplo, latogatasTerkep
} from '../../core/friss-tenyellenorzes.js';
import { hirForrasa } from '../../core/tenyellenorzo-forras.js';
import { ujTevedesek, tevesLecke } from '../../core/ismert-tevedesek.js';
import { ujArak } from '../../core/ar-tilalom.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const ARTICLES_DIR = join(ROOT, 'content', 'articles');
const DRAFTS_DIR = join(ROOT, 'content', 'drafts');
const SHARED_DIR = join(ROOT, 'shared');
const LOGS_DIR = join(ROOT, 'logs');
const AGENT_NAME = 'fact-check';

function parseArgs() {
  const a = process.argv.slice(2);
  const p = { claim: null, company: null, tool: null, id: null, dry: false, limit: 20, maxPerc: 8 };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--claim' && a[i + 1]) p.claim = a[++i];
    else if (a[i] === '--company' && a[i + 1]) p.company = a[++i];
    else if (a[i] === '--tool' && a[i + 1]) p.tool = a[++i];
    else if (a[i] === '--id' && a[i + 1]) p.id = a[++i];
    else if (a[i] === '--limit' && a[i + 1]) p.limit = parseInt(a[++i], 10) || 20;
    else if (a[i] === '--max-minutes' && a[i + 1]) p.maxPerc = Number(a[++i]) || 8;
    else if (a[i] === '--dry') p.dry = true;
  }
  return p;
}

function loadBrandContext() {
  const parts = [];
  for (const f of ['style-guide.md', 'legal-rules-ai.md']) {
    const path = join(SHARED_DIR, f);
    if (existsSync(path)) parts.push(`=== ${f} ===\n${readFileSync(path, 'utf-8')}`);
  }
  return parts.join('\n\n');
}

// Publikált útmutatók betöltése (szűrve: company/tool/id/claim-cég)
function loadGuides(args) {
  if (!existsSync(ARTICLES_DIR)) return [];
  const guides = [];
  // Automata körben a HÍREK is jönnek (a friss cikkek az elsők), kézi indításnál csak az útmutatók.
  const auto = !args.claim && !args.id && !args.company && !args.tool;
  for (const f of readdirSync(ARTICLES_DIR).filter(x => x.endsWith('.json'))) {
    try {
      const d = JSON.parse(readFileSync(join(ARTICLES_DIR, f), 'utf-8'));
      if (d._meta?.type !== 'guide' && !auto) continue;
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
  // 2026-10-21 (user: „a friss cikkeket nézze át, ne a régieket”): a friss (≤7 napos, még át nem
  // nézett) cikkek ELÖL, utána a 30 napnál régebbi útmutatók. A sorrend a core/friss-tenyellenorzes.js.
  // 2026-11-01 (4. rész): a régi, OLVASOTT hírek is sorra kerülnek — a forgalmi naplóból (CSAK olvassuk; a
  // core/traffic-log.js írja a CI-ben). Ha nincs vagy hibás a napló: a régi viselkedés (friss + régi útmutató).
  if (auto) list = ellenorzesiSor(list, Date.now(), { latogatas: olvasottsag() });
  return list.slice(0, args.limit);
}

function olvasottsag() {
  try {
    const p = join(ROOT, 'memory', 'traffic-log.json');
    if (!existsSync(p)) return undefined;
    const v = latogatasTerkep(JSON.parse(readFileSync(p, 'utf-8')).days);
    console.log(`📈 Olvasottság (30 nap, /hu/ nélkül): ${v.size} cikk`);
    return v;
  } catch (e) {
    console.log(`⚠️  A forgalmi napló nem olvasható (${e.message}) — régi hírek nélkül megy a sor`);
    return undefined;
  }
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

const SYSTEM_PROMPT = `You are the Fact-Check / Freshness agent for AI World HQ Your ONLY job is truthfulness: make sure a published step-by-step guide does not state anything that is no longer true.

A company may have REMOVED or CHANGED a feature after we published a guide about it. Find any claim that is now FALSE, removed, or that you cannot stand behind, and either REMOVE it or SOFTEN it into a conditional ("if it's available, look for…"). Keep everything that is still accurate. NEVER invent new facts. When unsure, SOFTEN rather than assert.

HARD RULE — DO NOT RENAME THE PRODUCT. Keep the product and company names EXACTLY as the guide has them, in the frontmatter (company:, tool:), in the title and in the body. You are NOT asked to check whether a product was renamed or rebranded, and you have no source that could prove it: a rebrand claim from memory is a guess, and a guess here sends our readers searching for a name that does not exist. This is not hypothetical — on 2026-08-31 this agent rewrote the real product name "ChatRTX" to "NVIDIA Chat" on the claim that it "has been rebranded", which was false; the invented name was live in 10 places. If you genuinely believe a name is outdated, DO NOT change it: leave every name untouched and say so in "reason" instead. A name change in fixed_markdown is rejected automatically and the whole fix is thrown away — including the good parts.

If only parts are affected: return the FULL corrected guide (same step-by-step format: YAML frontmatter with category: "guide", "## Before you start", 4-7 "## Step N — …", "## Common mistakes", "## What this means for you", "## Try it now").
If the WHOLE guide teaches a feature that no longer exists at all: verdict "unpublish".
If nothing needs changing: verdict "ok".

Output ONLY JSON (no prose, no code fence):
{"verdict":"ok"|"fix"|"unpublish","removed_claims":["..."],"reason":"one short sentence","reason_hu":"the same reason as one short sentence in Hungarian","fixed_markdown":"full corrected guide markdown, or empty string"}`;

/**
 * Hír átnézése a HIVATALOS FORRÁS szövegéhez mérve (nem a modell emlékezetéhez). Ha a forrás nem
 * olvasható (halott link, JS-oldal), nem ítélünk: `skip` indokkal.
 */
async function auditHir(item) {
  // ÖSSZEVONT HÍR (merged_from): MINDEN forrás kell. 10-21: csak az elsőt töltöttük le, és a Picsart-
  // hírből a másik két forrás helyes adatait („12 Halloween-prompt”, banner/story/négyzet) „kitaláltnak” vette.
  // 2026-11-01: a forrás a core/tenyellenorzo-forras.js-ből jön — előbb a híríró gyorsítótára, utána a közös
  // letöltő (böngésző-fejléc az OpenAI 403 ellen, újrapróba, Blogger-tartalék). Ha akár EGY forrás is hiányzik,
  // nem ítélünk, és a kihagyás oka a HTTP-státuszt is megmondja.
  const { forras, skip, status, via } = await hirForrasa(item.data._meta);
  if (skip) return { response: null, decision: null, skip, status };
  const userPrompt = `OFFICIAL SOURCE TEXT:\n${forras}\n\nPUBLISHED ARTICLE:\n${item.data.article_markdown || ''}\n\nOutput ONLY the JSON.`;
  const response = await ask(userPrompt, { agentName: AGENT_NAME, systemPrompt: HIR_RENDSZER, maxTokens: 4000, jsonMode: true });
  return { response, decision: jsonKivesz(response?.text), forras, forrasVia: via };
}

/**
 * AUTOMATA útmutató-kör (2026-11-01): rövid gyanú-prompt, javított szöveg NÉLKÜL. Forrás nincs, a modell
 * emlékezete régebbi a termékeinknél → élő szöveget úgysem írhat át; a teljes markdown kiírása csak csonka,
 * értelmezhetetlen választ szült (10-21 – 10-31: 7 eset). A márka-/jogi szabálykönyv sem kell hozzá (~7 ezer token).
 */
async function auditGyanu(guide) {
  const meta = guide.data._meta || {};
  const signals = recentSignals(meta.company);
  const userPrompt = `GUIDE TITLE: "${guide.data.original_title || ''}"
TOOL/COMPANY: ${[meta.company, meta.tool].filter(Boolean).join(' — ') || 'general'}
${signals.length ? `RECENT OFFICIAL HEADLINES about this company (context only):\n${signals.map(s => `- ${s}`).join('\n')}\n` : ''}
THE GUIDE:
${guide.data.article_markdown || ''}

Output ONLY the short JSON.`;
  const response = await ask(userPrompt, { agentName: AGENT_NAME, systemPrompt: UTMUTATO_GYANU_RENDSZER, maxTokens: 800, jsonMode: true });
  return { response, decision: gyanuDontes(response?.text), gyanuMod: true };
}

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
  return { response, decision: jsonKivesz(response?.text) };
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

/** Csak a „átnéztem” jelölés mentése (a szöveg nem változott → a „Frissítve” dátum sem). */
function saveGuide(guide) {
  writeFileSync(join(ARTICLES_DIR, guide.file), JSON.stringify(guide.data, null, 2), 'utf-8');
}

/**
 * "unpublish" ítélet: MEGJELÖLÉS, NEM TÖRLÉS.
 * Egy oldal levétele emberi döntés: 404-et okoz, rangsor-erőt veszít, és
 * 301-et kellene hozzá írni. A gép csak JELEZ, a user dönt.
 */
function flagForHuman(guide, reason) {
  // 2026-11-01: `fact_flagged_at`, NEM `fact_checked_at`. A jelölés nem módosítás (a szöveg nem változik); a
  // `fact_checked_at` viszont a valodiModositas() szerint (core/sitemap-lastmod.js) „Frissítve” dátum. Amíg a
  // jelölés kint van, a képlet kihagyja — de ha ember leveszi a jelölést, hamis „Frissítve” lett volna belőle.
  guide.data._meta = {
    ...guide.data._meta,
    fact_check_flag: 'may-be-obsolete',
    fact_check_reason: reason,
    fact_flagged_at: new Date().toISOString()
  };
  writeFileSync(join(ARTICLES_DIR, guide.file), JSON.stringify(guide.data, null, 2), 'utf-8');
}

async function main() {
  const args = parseArgs();
  const auto = !args.claim && !args.id && !args.company && !args.tool;
  console.log('🕵️  TÉNY-ELLENŐRZŐ AGENT (frissesség-őr)');
  console.log('─'.repeat(60));
  if (args.claim) console.log(`📌 Bejelentett változás: "${args.claim}"`);

  // 📒 NAPLÓ MINDIG (2026-11-02, kód-átnézés 8. rész): eddig üres sornál és a CI 10 perces korlátjánál (a folyamatot
  // leállítják) NEM íródott napló → a Telegram hamisan „⚠️ NEM FUTOTT”-at mondott. Most: üres sornál is írunk, a
  // napló MINDEN cikk után mentődik (ugyanabba a fájlba), 8 percnél (a CI-korlát 10) nem kezdünk új cikket, és
  // hibánál is kiíródik, ami addig összegyűlt.
  const kezdet = Date.now();
  const naploAt = new Date(kezdet).toISOString();
  const items = [];
  let cost = 0;
  const naploIr = (extra = {}) => {
    const naplo = { ...tenyNaplo({ items, cost, at: naploAt, claim: args.claim }), ...extra };
    if (!args.dry) {
      if (!existsSync(LOGS_DIR)) mkdirSync(LOGS_DIR, { recursive: true });
      writeFileSync(join(LOGS_DIR, `factcheck_${naploAt.replace(/[:.]/g, '-')}.json`), JSON.stringify(naplo, null, 2), 'utf-8');
    }
    return naplo;
  };
  _naploVeszhelyzet = naploIr;
  // A CI időkorlátja leállítja a folyamatot (akár egy hosszú AI-hívás közben is) → ami addig megvolt, lemezre.
  for (const jel of ['SIGTERM', 'SIGINT']) {
    process.once(jel, () => {
      console.log(`⏱️ ${jel}: leállítás — a napló kiírva (${items.length} cikk), megszakítva.`);
      try { naploIr({ megszakitva: true }); } catch { /* leállás közben nincs mit tenni */ }
      process.exit(1);
    });
  }

  const guides = loadGuides(args);
  if (!guides.length) { console.log('💤 Nincs ellenőrizendő publikált cikk (a szűrőre).'); naploIr(); return; }
  console.log(`🔎 ${guides.length} cikk ellenőrzése${args.dry ? ' (DRY — nem írok semmit)' : ''}\n`);

  // A márka-/jogi szabálykönyv csak a kézi (teljes javító) útmutató-ághoz kell (2026-11-01).
  const brandContext = auto ? '' : loadBrandContext();
  // 📒 NAPLÓ (2026-11-01): cikkenként egy tétel → logs/factcheck_<idő>.json (forma: core/friss-tenyellenorzes.js tenyNaplo).
  let megszakitva = false;

  for (const guide of guides) {
    if (items.length) naploIr();   // az előző cikk eredménye már lemezen — egy CI-leállítás sem viszi el
    if (Date.now() - kezdet > args.maxPerc * 60e3) {
      megszakitva = true;
      console.log(`⏱️ ${args.maxPerc} perc letelt — a maradék ${guides.length - items.length} cikk a következő futásra marad.`);
      break;
    }
    const title = (guide.data.original_title || guide.file).slice(0, 50);
    const hir = guide.data._meta?.type !== 'guide';
    const tetel = (eredmeny, ok_hu, extra = {}) => items.push(naploTetel({ file: guide.file, cim: guide.data.original_title || guide.file, hir, eredmeny, ok_hu, ...extra }));
    // --dry: SEMMIT nem írunk (cikk, memória, ops-üzenet, napló, név-zár jegyzés) — a metaadat csak a memóriában változik.
    const ment = () => { if (!args.dry) saveGuide(guide); };
    const { response, decision, skip, forras, status, gyanuMod } = hir ? await auditHir(guide)
      : auto ? await auditGyanu(guide)
      : await audit(guide, args, brandContext);
    cost += response?.costUsd || 0;

    if (skip) {
      // 2026-11-01: a kihagyás NEM végleges — SKIP_MAX próbáig újra sorra kerül (kesz(), core/friss-tenyellenorzes.js).
      guide.data._meta = kihagyasMeta(guide.data._meta, skip);
      const n = guide.data._meta.fact_check_skip_count;
      console.log(`⏭️  ${title}… — ${skip}, nem ítélek (${n}/${SKIP_MAX}. próba${n >= SKIP_MAX ? ', többet nem próbálom' : ''})`);
      ment();
      tetel('kihagyva', skip, { status });
      continue;
    }
    if (!decision) {
      // 2026-11-01: eddig semmi nem jegyződött → a cikk a következő futásban újra elöl állt. Most számláló, 2 után kész.
      guide.data._meta = ertelmezhetetlenMeta(guide.data._meta);
      const n = guide.data._meta.fact_check_parse_fail_count;
      console.log(`⚠️  ${title}… — döntés nem értelmezhető (${n}/${ERTELMEZHETETLEN_MAX}. alkalom${n >= ERTELMEZHETETLEN_MAX ? ', lezárva' : ', a következő futás újrapróbálja'})`);
      // A gyökérok kereséséhez (11-01-i próba: egy 4 forrású hírnél is előfordult): a válasz hossza és vége.
      const nyers = String(response?.text || '');
      console.log(`   ↳ a válasz ${nyers.length} karakter${nyers ? `, vége: „…${nyers.slice(-120).replace(/\s+/g, ' ')}”` : ' (üres)'}`);
      ment();
      tetel('ertelmezhetetlen', `a modell válasza nem volt értelmezhető (${n}/${ERTELMEZHETETLEN_MAX}. alkalom, ${nyers.length} karakter)`);
      continue;
    }
    const indok = decision.reason_hu || decision.reason || '';

    // ── AUTOMATA ÚTMUTATÓ-KÖR (2026-11-01): csak „ok” vagy GYANÚ — a szöveg nem változik, nincs tanulság ──
    if (gyanuMod) {
      if (decision.verdict === 'ok') {
        guide.data._meta = atnezveMeta(guide.data._meta);
        console.log(`✅ OK: ${title}…`);
        ment();
        tetel('ok', indok || 'rendben');
        continue;
      }
      const allitas = decision.claims.join('; ');
      const gyanu = indok || allitas || 'gyanús állítás (indoklás nélkül)';
      guide.data._meta = gyanuMeta(guide.data._meta, gyanu);
      console.log(`🙋 GYANÚ (emlékezetből, nem megerősített — a szöveg nem változik, tanulság nincs): ${title}… — ${gyanu}`);
      if (!args.dry) {
        saveGuide(guide);
        message('fact-check', 'ceo', 'need', `Gyanú (nem megerősített, a gép emlékezetből ítél): "${title}" — ${gyanu}${allitas ? ` (állítás: ${allitas})` : ''}. Nem nyúltam hozzá; ha valódi, forrással erősítsd meg.`, { ref: guide.file });
      }
      tetel('gyanu', gyanu);
      continue;
    }

    // Átnéztük: a következő körben ez már nem kerül elő (friss cikkek sorrendje); a próba-mezők törlődnek.
    guide.data._meta = atnezveMeta(guide.data._meta);

    if (decision.verdict === 'ok') {
      console.log(`✅ OK: ${title}…`);
      ment();
      tetel('ok', indok || 'rendben');
      continue;
    }

    const claims = (decision.removed_claims || decision.errors || []).slice(0, 3).join('; ');   // hír-ág: errors
    // 🧑 2026-10-29: AUTOMATA KÖRBEN A „TÁRGYTALAN” ÍTÉLET CSAK GYANÚ. A modell a SAJÁT emlékezetéből ítél, az pedig
    // régebbi a termékeinknél: 10-29-én kiderült, hogy a „Le Chat megszűnt”, „a GPT Store bezárt”, „az OpenAI Playground
    // megszűnt”, „az Alexa+ még nincs kint” mind téves volt — a jelölés + a memóriába írt „Do not claim this exists”
    // tanulság (amit az útmutató-író is olvas) hamis ítéletet vitt tovább. Ezért itt NINCS jelölés és NINCS tanulság:
    // a gyanú csak a naplóba/üzenetbe megy, és a cikk „átnézettként” kerül el a sor elejéről (fact_check_suspect).
    // (2026-11-01: az automata útmutató-kör már a rövid gyanú-promptot kapja — ide csak egy szabálytalan hír-válasz jut.)
    if (decision.verdict === 'unpublish' && auto) {
      console.log(`🙋 GYANÚ (emlékezetből, nem megerősített — nem jelölök, nem írok tanulságot): ${title}… — ${indok}`);
      guide.data._meta = gyanuMeta(guide.data._meta, indok);
      if (!args.dry) {
        saveGuide(guide);
        message('fact-check', 'ceo', 'need', `Gyanú (nem megerősített, a gép emlékezetből ítél): "${title}" — ${indok}. Nem nyúltam hozzá; ha valódi, forrással erősítsd meg.`, { ref: guide.file });
      }
      tetel('gyanu', indok);
      continue;
    }
    if (decision.verdict === 'unpublish') {
      // NEM TÖRLÜNK. Egy oldal levétele emberi döntés (404 + elveszett rangsor
      // + 301 kellene hozzá). A gép megjelöl és szól — a user dönt.
      console.log(`🙋 MEGJELÖLVE (levételre javasolt): ${title}… — ${indok}`);
      if (!args.dry) {
        flagForHuman(guide, decision.reason);
        message('fact-check', 'human', 'need', `Ez az útmutató talán tárgytalanná vált: "${title}" — ${indok}. NEM vettem le (az törölné az URL-t is) — dönts róla.`, { ref: guide.file });
        // 2026-11-01: tanulság CSAK bejelentett változásnál (--claim) — az emberi forrás, nem a modell emlékezete.
        if (args.claim) remember('guide', `Do not claim this exists (may be removed): ${decision.reason}`.slice(0, 200), { tags: ['fact-check', 'removed'] });
      }
      tetel('gyanu', `levételre javasolva (megjelölve): ${indok}`, { jelolve: true });
      continue;
    }

    // verdict === 'fix' — HELYBEN javítunk, az URL nem mozdul, az oldal végig él
    // 2026-11-01: ha a modell csak a törzset adta vissza, az EREDETI frontmatter kerül vissza (10-21 – 10-31: 5 jó
    // javítás veszett el „nincs frontmatter” miatt); utána ugyanazon az ellenőrzésen megy át.
    // (a javított szöveg a decision.fixed_markdown-ban marad — a core/name-guard.test.js ezt a bekötést őrzi)
    if (hir && decision.fixed_markdown) decision.fixed_markdown = frontmatterVissza(decision.fixed_markdown, guide.data.article_markdown);
    let why = !decision.fixed_markdown ? 'nincs javított szöveg'
      : hir ? hirCsereEp(decision.fixed_markdown, guide.data.article_markdown)
      : isSafeReplacement(decision.fixed_markdown, guide.data.article_markdown);

    // ── GÉPI BIZTOSÍTÉK (2026-10-21, user: „ezek a hibák ne forduljanak elő többet!”) ──────────
    // 1) Hír: amit a javítás kivenne, azt a KÓD összeveti a forrással; ha a forrás alátámasztja,
    //    a javítás nem mehet ki (10-21: a Picsart-hírből helyes adatot vett ki).
    // 1b) Hír (2026-11-01): amit a javítás BEHOZNA (új/átírt mondat), annak a forrásban kell lennie — különben
    //    a tény-ellenőrző maga vinne be kitalált állítást.
    // 2) Útmutató automata körben: forrás nincs, a modell EMLÉKEZETE régebbi a cikkeinknél → élő
    //    szöveget NEM írhat át, csak jelez. Kézi bejelentéssel (--claim/--id/…) javíthat.
    if (!why && hir) {
      const alatamasztott = forrasAlatamasztja(guide.data.article_markdown, decision.fixed_markdown, forras);
      // 11-05: „a forrás alátámasztja, amit kivenne” → a riportban félreérthető volt, ki mit vesz ki
      if (alatamasztott.length) why = `a javítás törölne egy mondatot, amit a forrás igazol: „${alatamasztott[0].slice(0, 90)}”`;
    }
    if (!why && hir) {
      const ujAllitas = forrasbanNemSzereplo(guide.data.article_markdown, decision.fixed_markdown, forras);
      if (ujAllitas.length) why = `a javítás a forrásban nem szereplő állítást hozna be: „${ujAllitas[0].slice(0, 90)}”`;
    }
    if (!why && !hir && auto) why = 'forrás nélküli (emlékezetből) javítás — élő szöveget nem írhat át, csak jelez';
    // 3) ISMERT TÉVEDÉS (2026-11-01, 4. rész): a javítás nem hozhat be hivatalos forrással CÁFOLT állítást
    //    (core/ismert-tevedesek.js: „Alexa+ fizetős” Prime nélkül, „Mistral Chat”, „iOS 19”, „Le Chat megszűnt”…).
    //    10-29: pont ezeket írta be a tény-ellenőrző a saját elavult emlékezetéből.
    if (!why && decision.fixed_markdown) {
      const tev = ujTevedesek(guide.data.article_markdown, decision.fixed_markdown, 'en');
      if (tev.length) why = `a javítás ismert (cáfolt) tévedést hozna be [${tev[0].id}]: „${tev[0].mondat.slice(0, 90)}”`;
    }
    // 4) ÁR-TILALOM (2026-11-01, user: „árakat nem közlünk!”): a javítás nem hozhat be termékárat,
    //    akkor sem, ha a forrás közli (core/ar-tilalom.js — ugyanaz a felismerő, mint az ellenőrzőé).
    if (!why && decision.fixed_markdown) {
      const ujAr = ujArak(guide.data.article_markdown, decision.fixed_markdown);
      if (ujAr.length) why = `a javítás termékárat hozna be (árat nem közlünk): „${ujAr[0].slice(0, 90)}”`;
    }

    // ── NÉV-ZÁR (2026-09-06) ─────────────────────────────────────────
    // A 08-31-i eset: a tényellenőr a valódi „ChatRTX" nevet átírta a nem
    // létező „NVIDIA Chat"-re, és a hamis név 10 helyen kiment. A név nem
    // ezen agent hatásköre — a döntés a `core/name-guard.js`-ben van
    // (tesztelhető), mert az `agents/` alól semmit nem lehet importálni.
    // A visszautasítás ugyanabba az ágba fut, mint a nem elég ép javítás:
    // A RÉGI CIKK MARAD, az oldalon nincs lyuk.
    if (!why && decision.fixed_markdown) {
      const nevKifogas = nameLockObjection(guide.data.article_markdown, decision.fixed_markdown, guide.data._meta);
      if (nevKifogas) {
        why = nevKifogas.indok;
        console.log(`🔒 NÉV-ZÁR: ${title}… — ${nevKifogas.indok}`);
        if (!args.dry) {
          // A kifogás naplóba → onnan a minőség-őrön át a napi jelentésbe.
          jegyezNevZar({ ...nevKifogas, file: guide.file, reason: String(decision.reason || '').slice(0, 160) });
          // 2026-11-01: tanulság csak kézi, bejelentett változásnál (--claim); automata körben semmilyen.
          if (args.claim) remember('shared', `A tény-ellenőrző NEM nevezhet át terméket: a "${nevKifogas.regi}" nevet akarta "${nevKifogas.uj}"-ra írni, forrás nélkül — visszautasítva.`.slice(0, 200), { tags: ['fact-check', 'name-lock'] });
        }
      }
    }

    if (!why) {
      console.log(`🔧 JAVÍTÁS: ${title}… — eltávolítva/lágyítva: ${claims || indok}`);
      if (!args.dry) {
        applyFix(guide, decision.fixed_markdown, decision.reason, claims);
        message('fact-check', 'team', 'fix', `Valótlanná vált részt javítottam egy publikált cikkben: "${title}" — ${indok || claims}`, { ref: guide.file });
        // 2026-11-01: tanulság CSAK kézi, bejelentett változásnál (--claim). Automata körben semmilyen: a hír-javítás
        // tanulsága eddig a 'guide' scope-ba ment („Avoid stating…”), amit az ÚTMUTATÓ-író kapott — rossz címzett,
        // rossz irány (a forrás egy hír pontosítása volt, nem általános tiltás).
        // 2026-11-01 (4. rész): ha az ismert-tévedés szűrő jelez (a lecke cáfolt állítást hordoz, vagy élő terméket
        // tiltana — „Avoid stating: Le Chat…”), NINCS tanulság. A memory-manager remember() is szűr; itt látszik is.
        const lecke = `Avoid stating (may be removed/false): ${claims}`.slice(0, 200);
        if (claims && args.claim && tevesLecke(lecke)) console.log(`   ↳ tanulság kihagyva: ismert (cáfolt) tévedést hordozna — „${lecke.slice(0, 90)}”`);
        else if (claims && args.claim) remember('guide', lecke, { tags: ['fact-check', 'lesson'] });
      }
      tetel('javitva', indok || claims || 'javítva', claims && indok ? { modell_hu: claims } : {});
    } else if (decision.fixed_markdown) {
      // Van javaslat, de nem elég ép → A RÉGI MARAD. Inkább a régi jó szöveg,
      // mint egy megcsonkított új.
      console.log(`⏭️  ${title}… — a javítás nem mehet ki (${why}), a RÉGI marad`);
      if (!args.dry) saveGuide(guide);
      if (!args.dry) message('fact-check', 'ceo', 'need', `Gyanús állítás, de a javítás nem mehetett ki (${why}): "${title}" — ${indok}`, { ref: guide.file });
      tetel('visszautasitva', why, indok ? { modell_hu: indok } : {});
    } else {
      // Talált gondot, de nincs jó javítás → jelez, nem törlünk vakon
      console.log(`🙋 JELZÉS: ${title}… — gyanús állítás, de nincs biztos javítás: ${indok}`);
      if (!args.dry) saveGuide(guide);
      if (!args.dry) message('fact-check', 'ceo', 'need', `Ellenőrizendő állítás: "${title}" — ${indok}`, { ref: guide.file.replace(/^ARTICLE_/, '') });
      tetel('gyanu', indok || 'gyanús állítás, de nincs biztos javítás');
    }
  }

  const naplo = tenyNaplo({ items, cost, at: naploAt, claim: args.claim });
  const d = naplo.darab;
  console.log('─'.repeat(60));
  console.log(`📊 TÉNY-ELLENŐRZÉS (${naplo.osszes} cikk): ${d.ok} rendben, ${d.javitva} javítva, ${d.visszautasitva} javítás visszautasítva, ${d.gyanu} gyanú, ${d.kihagyva} kihagyva, ${d.ertelmezhetetlen} értelmezhetetlen | költség $${cost.toFixed(4)}`);

  naploIr(megszakitva ? { megszakitva: true } : {});
}

// Hibánál is marad napló (a riport így „hiba” helyett nem mond „nem futott”-at) — a main() állítja be.
let _naploVeszhelyzet = null;
main().catch(e => {
  console.error('💥 TÉNY-ELLENŐRZŐ HIBA:', e);
  try { _naploVeszhelyzet?.({ hiba: String(e?.message || e).slice(0, 200) }); } catch { /* a napló nem fontosabb a hibánál */ }
  process.exit(1);
});
