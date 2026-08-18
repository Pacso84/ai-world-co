// ===================================================================
// FŐNÖK-ASZTAL (2026-07-13) — "beragadt ügyek": MINDEN futásban AZONNAL
// döntés születik, nem határidő (user: "döntés szülessen... pénzt emészt
// és fontos hír maradhat le"). Elv: MENTSD, NE DOBD (olvasó-védelem:
// "nehogy másnál olvassák el ugyanazt a cikket").
//
// Spec: docs/superpowers/specs/2026-07-13-ceg-hierarchia-visszaadas-tanulas-design.md
// Minta: agents/ceo/escalate-guides.js (a guide-okra ez már működik).
//
// Bemenet:  eszkalált visszaadások + kimerült/lejárt bukott HÍREK +
//           2x bukott heti feladatok (digest/compare).
// Kimenet (fontossági sorrendben):
//   a) kiadás kis javítással (fix-only)  b) újraírás más szögből (régi
//   hírnél "mit jelent ez neked" magyarázó)  c) elvetés — CSAK duplikátum/
//   okafogyott/2 főnöki kör után. Minden döntés tanulság + asztal-napló.
//
// Futtatás:  node agents/ceo/desk.js [--test-verdict '<json>']
//   --test-verdict: negatív teszthez — AI-hívás nélkül kényszerített ítélet.
// A hibája SOSEM dönti be a pipeline-t (exit 0 mindig).
// ===================================================================
import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ask } from '../../core/ai-router.js';
import { remember } from '../../core/memory-manager.js';
import { message } from '../../core/ops.js';
import { escalateStale, listEscalated, closeCase } from '../../core/handback.js';
import { publishedSourceKeys, isAlreadyWritten } from '../../core/source-lock.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const REJECTED_DIR = join(ROOT, 'content', 'rejected');
const ARTICLES_DIR = join(ROOT, 'content', 'articles');
const DRAFTS_DIR = join(ROOT, 'content', 'drafts');
const DESK_LOG = join(ROOT, 'memory', 'ceo-desk-log.json');
const MAX_REWORK_ATTEMPTS = 2;      // az Íróéval azonos (agents/iro/agent.js)
const MAX_CEO_ROUNDS = 2;           // ennyi főnöki újraindítás után: végleges döntés

const testVerdictArg = process.argv.indexOf('--test-verdict');
const TEST_VERDICT = testVerdictArg >= 0 ? JSON.parse(process.argv[testVerdictArg + 1]) : null;
// --test-brief '<markdown>': a rövidhír-mentőöv ág AI-hívás nélküli tesztje
const testBriefArg = process.argv.indexOf('--test-brief');
const TEST_BRIEF = testBriefArg >= 0 ? process.argv[testBriefArg + 1] : null;

// ===================================================================
// RÖVIDHÍR-MENTŐÖV (2026-07-19, user: "kéne megoldás ha nem megy ki egy
// cikk hiába két kör után") — a végleges lezárás ELŐTTI utolsó esély:
// a hír MAGVA őszinte rövidhírként még kijuthat. A NORMÁL úton megy
// (Ellenőrző + hitelesség-kapu), nincs kiskapu. Ha az is bukik →
// brief_attempt jelöléssel VÉGLEG zárul (nincs kör).
// Spec: docs/superpowers/specs/2026-07-19-rovidhir-mentoov-design.md
// ===================================================================
const BRIEF_SYSTEM = `You are the editor-in-chief of AI World Co. A full article failed every editing round. As a LAST RESORT, write a SHORT, honest news brief so readers still learn the news.

STRICT FORMAT (the automated checks require ALL of these):
---
title: "<clear news-style title>"
subtitle: "<one honest sentence on what happened>"
category: "news"
company: ""
tool: ""
read_time_minutes: 1
tags: ["news-brief"]
---

# <same title>

<3-5 plain sentences: WHAT happened, WHO announced it, WHY it matters. ONLY facts you can verify from the given title/source/core facts. If a detail is uncertain, LEAVE IT OUT.>

## What this means for you

<2-3 plain sentences for everyday readers.>

Source: <source name> — <source link>

STRICT RULES: 200-250 words total. FORBIDDEN: step-by-step instructions, UI elements/buttons/menus, prices/discounts/percentages not in the source title, invented product or model names, marketing fluff. NEVER mention the editorial process — no "failed rounds", "this brief", "last resort" or similar kitchen-talk anywhere (title, subtitle or body): the reader only sees a normal short news item. Plain English. Output ONLY the markdown.`;

async function writeBrief(d) {
  if (TEST_BRIEF) return { text: TEST_BRIEF, costUsd: 0 };
  const m = d._meta || {};
  const failedCore = (d.article_markdown || '').replace(/^---[\s\S]*?---/, '').trim().slice(0, 1500);
  const prompt = `NEWS TITLE: ${d.original_title || ''}
SOURCE: ${m.source_name || ''} — ${m.source_link || ''}

CORE FACTS from the failed draft (extract ONLY the verifiable what/who/why — DROP every how-to step, UI detail and number you cannot verify):
${failedCore}

Write the news brief now.`;
  return await ask(prompt, { agentName: 'rework', systemPrompt: BRIEF_SYSTEM, maxTokens: 6000 });
}

// Minimál-érvényesség: frontmatter + H1 + kötelező szekció + értelmes hossz
function briefLooksValid(md) {
  const t = (md || '').trim();
  return t.startsWith('---') && /^#\s+.+$/m.test(t) && /what this means for you/i.test(t) && t.length > 700;
}

function deskLog(text) {
  let log = {}; try { log = JSON.parse(readFileSync(DESK_LOG, 'utf-8')); } catch { /* első futás */ }
  const day = new Date().toISOString().slice(0, 10);
  log[day] = [...(log[day] || []), text];
  const keep = Object.keys(log).sort().slice(-14);
  writeFileSync(DESK_LOG, JSON.stringify(Object.fromEntries(keep.map(k => [k, log[k]])), null, 2), 'utf-8');
  console.log('👔 ' + text);
}

// A beragadt bukott HÍREK: kimerült javító-körök VAGY lejárt 72 órás ablak
// (ezeket az Író némán átugorja) — amikről még nem született végleges döntés.
function stuckNews() {
  if (!existsSync(REJECTED_DIR)) return [];
  return readdirSync(REJECTED_DIR)
    .filter(f => f.startsWith('REJECTED_') && f.endsWith('.json'))
    .map(f => { try { return { f, d: JSON.parse(readFileSync(join(REJECTED_DIR, f), 'utf-8')) }; } catch { return null; } })
    .filter(x => x && x.d._meta?.type !== 'guide' && x.d._meta?.can_retry !== false)
    .filter(x => {
      const m = x.d._meta;
      const age = Date.now() - new Date(m.rejected_at || m.written_at || 0).getTime();
      const exhausted = (m.rework_attempts || 0) >= MAX_REWORK_ATTEMPTS;
      const expired = age > 72 * 3600e3;
      return (exhausted || expired) && (m.ceo_rounds || 0) <= MAX_CEO_ROUNDS;
    });
}

// A duplikátum-fogalom EGY helyen él: core/source-lock.js (2026-08-18).
// Korábban itt volt egy saját változat, ami szó szerint (===) hasonlított,
// tehát a „https://x.com/a" és a „https://x.com/a/" különbözőnek látszott.
// Két, egymástól eltérően normalizáló duplikátum-fogalom rosszabb, mint egy.
//
// ⚠️ SZÁNDÉKOSAN NINCS GYORSÍTÓTÁR: a desk futása közben ÚJ cikk publikálódhat,
// és a következő hívásnak azt is látnia kell. Az eredeti változat is minden
// híváskor frissen olvasott — a sebességért nem cserélünk helyességet.
function isDuplicate(d) {
  if (!existsSync(ARTICLES_DIR)) return false;
  const cikkek = [];
  for (const f of readdirSync(ARTICLES_DIR).filter(x => x.endsWith('.json'))) {
    try { cikkek.push(JSON.parse(readFileSync(join(ARTICLES_DIR, f), 'utf-8'))); } catch { /* skip */ }
  }
  return isAlreadyWritten(d, publishedSourceKeys(cikkek));
}

async function verdictFor(d, context) {
  if (TEST_VERDICT) return TEST_VERDICT;   // negatív teszt: nincs AI-hívás
  const issues = [...(d._meta?.auto_check?.issues || []), ...(d._meta?.ai_review?.issues || [])].slice(0, 6);
  const prompt = `You are the CEO of a small AI-news company. A news article is STUCK (${context}).
Title: ${d.original_title || '(unknown)'}
Known issues: ${issues.join('; ') || 'none recorded'}
Article start: ${String(d.article_markdown || '').slice(0, 1200)}

Our rule: SAVE, DON'T DROP — readers should read this story on OUR site, not elsewhere.
Reply ONLY JSON: {"action":"fix-only"|"rewrite-explainer"|"drop","hint":"<one concrete instruction to the writer>","lesson":"<one generalisable lesson for the company>"}
"drop" is allowed ONLY if the story is factually dead (retracted/wrong) or truly unsalvageable.`;
  // maxTokens 300 → 2000 (2026-07-21): a MiniMax-váltás után a főnök-asztal is
  // gondolkodó modellre került; 300 tokenen a modell mindent elgondolkodott és
  // ÜRES választ adott → a desk némán "rewrite-explainer"-re esett minden esetnél.
  const r = await ask(prompt, { agentName: 'ceo', maxTokens: 2000, jsonMode: true });
  try {
    const t = r.text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
  } catch {
    // Ha az ítélet nem értelmezhető: a biztonságos alap a MENTÉS (újraírás)
    return { action: 'rewrite-explainer', hint: 'Rewrite as a clear explainer: what happened and what it means for everyday readers.', lesson: '' };
  }
}

async function decideNews(x) {
  const { f, d } = x;
  const m = d._meta;
  const rounds = m.ceo_rounds || 0;

  if (isDuplicate(d)) {
    m.can_retry = false; m.ceo_decision = 'duplicate';
    writeFileSync(join(REJECTED_DIR, f), JSON.stringify(d, null, 2), 'utf-8');
    closeCase(f.replace(/^REJECTED_/, 'ARTICLE_'));
    remember('shared', 'Főnöki döntés: duplikált témát nem írunk újra — előbb ellenőrizzük, van-e már cikkünk róla.');
    deskLog(`Duplikátum lezárva: "${(d.original_title || f).slice(0, 60)}"`);
    return;
  }
  if (rounds >= MAX_CEO_ROUNDS) {
    // RÖVIDHÍR-MENTŐÖV: végleges lezárás ELŐTT egy utolsó, rövid formátumú
    // esély — a hír magva kijuthat lépések/felület-részletek nélkül.
    if (!m.brief_attempt) {
      const r = await writeBrief(d);
      if (r === null) {
        // AI nem elérhető (hard cap / üzemzavar) → NEM zárunk le, következő futás újrapróbálja
        deskLog(`Rövidhír-mentőöv elhalasztva (AI nem elérhető): "${(d.original_title || f).slice(0, 60)}"`);
        return;
      }
      if (briefLooksValid(r.text)) {
        const writerName = f.replace(/^REJECTED_/, 'WRITER_');
        const out = {
          _meta: {
            ...m,
            brief_attempt: true,
            // MAX-ra állítva: az Író rework-je NE fogja meg — ha a rövidhír is
            // bukik, egyenesen az asztalra jön vissza, és VÉGLEG zárul.
            rework_attempts: MAX_REWORK_ATTEMPTS,
            can_retry: true,
            status: 'draft',
            briefed_at: new Date().toISOString()
          },
          original_title: d.original_title,
          article_markdown: r.text.trim()
        };
        delete out._meta.ceo_hint;
        delete out._meta.ceo_decision;
        writeFileSync(join(DRAFTS_DIR, writerName), JSON.stringify(out, null, 2), 'utf-8');
        unlinkSync(join(REJECTED_DIR, f));
        remember('shared', 'Rövidhír-mentőöv: ha a teljes cikk minden kört elbukik, a hír magva őszinte rövidhírként még kijuthat — lépések és felület-részletek nélkül.');
        deskLog(`Rövidhírként mentve (utolsó esély): "${(d.original_title || f).slice(0, 60)}" → Ellenőrzőre`);
        return;
      }
      // formátum-hibás mentőöv-kísérlet → jelöljük, és átesünk a végleges lezárásba
      m.brief_attempt = true;
    }
    m.can_retry = false; m.ceo_decision = 'unsalvageable';
    writeFileSync(join(REJECTED_DIR, f), JSON.stringify(d, null, 2), 'utf-8');
    remember('shared', `Főnöki döntés: "${(d.original_title || '').slice(0, 50)}" ${MAX_CEO_ROUNDS} főnöki kör után sem ment át — az ilyen témához korábban kell jobb forrást választani.`);
    // Az ÍRÓ saját rekeszébe is, STABIL szöveggel (ismétlődésnél erősödik — 2026-07-16)
    remember(d._meta?.type === 'guide' ? 'guide' : 'iro', 'Egy cikk az összes újraírási és főnöki kört elbukta — ha a forrás sovány vagy zavaros, már az ELSŐ vázlatnál jelezd vissza, ne told tovább.', { tags: ['desk'] });
    deskLog(`Menthetetlen (${m.brief_attempt ? 'rövidhír-próba után' : MAX_CEO_ROUNDS + ' főnöki kör után'}), lezárva: "${(d.original_title || f).slice(0, 60)}"`);
    return;
  }

  const age = Date.now() - new Date(m.rejected_at || m.written_at || 0).getTime();
  const context = age > 72 * 3600e3 ? 'older than 72h, the normal rework window expired' : 'rework attempts exhausted';
  const v = await verdictFor(d, context);

  if (v.action === 'drop') {
    m.can_retry = false; m.ceo_decision = 'dropped';
    writeFileSync(join(REJECTED_DIR, f), JSON.stringify(d, null, 2), 'utf-8');
    remember('shared', v.lesson || `Főnöki döntés: "${(d.original_title || '').slice(0, 50)}" okafogyott — elvetve.`);
    deskLog(`Elvetve (okafogyott): "${(d.original_title || f).slice(0, 60)}"`);
    return;
  }

  // MENTSD, NE DOBD: újraindítás friss ablakkal + konkrét főnöki utasítással
  m.rework_attempts = 0;
  m.rejected_at = new Date().toISOString();
  m.ceo_rounds = rounds + 1;
  m.ceo_hint = v.action === 'fix-only'
    ? `CEO instruction (fix ONLY the flaws listed, keep everything else): ${v.hint}`
    : `CEO instruction (REWRITE as an explainer — "what happened and what it means for you"; the news is a few days old, so context beats speed): ${v.hint} HONESTY RULE: name the REAL products/places/organizations from the source; NEVER invent generic UI steps ("most platforms", fictional menu names). If you add a "try it yourself" section, use typed example prompts only (2026-07-14 reader complaint lesson).`;
  writeFileSync(join(REJECTED_DIR, f), JSON.stringify(d, null, 2), 'utf-8');
  if (v.lesson) remember('shared', `Főnöki döntés tanulsága: ${v.lesson}`);
  message('ceo', 'iro', 'problem', `Főnöki újraindítás: "${(d.original_title || '').slice(0, 60)}" — ${v.action}`, { ref: f.replace(/^REJECTED_/, '') });
  deskLog(`Újraindítva (${v.action}, ${m.ceo_rounds}. főnöki kör): "${(d.original_title || f).slice(0, 60)}"`);
}

// 2x bukott heti feladatok (digest/compare) — láthatóság + tanulság
// (maguktól újrapróbálnak jövő héten; a lényeg: ne haljon el némán)
function checkWeekly() {
  for (const name of ['digest', 'compare']) {
    try {
      const st = JSON.parse(readFileSync(join(ROOT, 'memory', `${name}-state.json`), 'utf-8'));
      if ((st.consecutive_failures || 0) >= 2) {
        deskLog(`Figyelem: a heti ${name} ${st.consecutive_failures}x egymás után bukott — a következő futás kiemelten figyelendő.`);
        remember(name, `A heti feladat ${st.consecutive_failures}x bukott egymás után — az önellenőrzés okait (H1, kötelező szerkezet) már az első vázlatban kezelni kell.`);
      }
    } catch { /* nincs state — nem baj */ }
  }
}

async function main() {
  console.log('👔 FŐNÖK-ASZTAL — beragadt ügyek');
  console.log('─'.repeat(60));

  // 1) Kézbesítetlenül maradt visszaadások az előző futásból → asztalra
  const stale = escalateStale();
  if (stale.length) deskLog(`${stale.length} kézbesítetlen visszaadás az előző futásból az asztalra került.`);

  // 2) Eszkalált visszaadások: a hivatkozott cikk sorsáról a hír-asztal dönt
  //    (ugyanaz a REJECTED-fájl) — a tételt lezárjuk, hogy ne pörögjön tovább.
  for (const it of listEscalated()) {
    deskLog(`Eszkalált visszaadás lezárva (${it.from}→${it.to}): ${it.ref} — a cikk sorsa a hír-asztalon dől el.`);
    closeCase(it.ref);
  }

  // 3) Beragadt hírek: azonnali döntés mindegyikről
  const stuck = stuckNews();
  if (!stuck.length) console.log('✓ Nincs beragadt hír az asztalon.');
  for (const x of stuck) await decideNews(x);

  // 4) Heti feladatok egészsége
  checkWeekly();
  console.log('👔 Asztal üres, döntések meghozva.');
}

main().then(() => process.exit(0)).catch(e => { console.error('💥 FŐNÖK-ASZTAL HIBA (a pipeline megy tovább):', e.message); process.exit(0); });
