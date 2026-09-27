// ===================================================================
// ÍGÉRET-FEDEZET FELÚJÍTÓ (upgrade-howtos) — 2026-07-27
// ===================================================================
//
// MIÉRT: a user elolvasta az "Így próbáld ki az AI-videóavatárt a telefonodon
// öt perc alatt" cikket, és jelezte, hogy csak nagyvonalakban ír róla. Kiderült,
// hogy 76 KINT LÉVŐ cikkünk ígér a címében utasítást, de hírként íródott, ezért
// nem vonatkozott rá az útmutató-szabálykönyv (rövid, egyetlen összevont
// bekezdés, másolható példák nélkül). Az agents/iro 4b szabálya + az ellenőrző
// ÍGÉRET-FEDEZET kapuja a JÖVŐBELI cikkeket rendezi — ez a szkript a MÁR
// MEGJELENTEKET újítja fel, FUTÁSONKÉNT KETTŐT (user-döntés: fokozatosan).
//
// BIZTONSÁG — a régi verzió mindig kint marad, amíg az új nem bizonyít:
//   1. új változat íratása (ugyanaz a 4b szabály, mint az írónál)
//   2. az új változat átesik UGYANAZON az ígéret-fedezet ellenőrzésen
//   3. csak SIKER esetén cseréljük le a cikket
//   4. bukásnál a régi marad, a próbálkozás számlálódik (3 után békén hagyjuk)
// Így az oldalon soha nincs lyuk, és rossz csere sem történhet.
//
// ===================================================================
// ⚠️ MI HIÁNYZOTT INNEN (feltárva és javítva 2026-09-08)
// ===================================================================
// Ez a szkript ÉLŐ, publikált cikkeket ír át, naponta háromszor kettőt —
// 79 cikket írt már át, legutóbb ma. A csere feltétele viszont NÉGY
// SZERKEZETI ellenőrzés volt: ép frontmatter, van `title:`, elég szó és
// lépés, megvan a brand-szekció. Mind azt kérdezi, hogy MEGVAN-E A FORMA.
// EGYIK SEM azt, hogy IGAZ-E.
//
// A prompt KÉRI a modelltől, hogy ne találjon ki menüt („NEVER invent a menu
// name") — de semmi nem ELLENŐRIZTE. Márpedig a projekt legdrágább leckéi
// épp ezek: 321 útmutatóból 321 forrás nélkül íródott, 48% konkrét gombot is
// megnevez; és a hitelesség-kapu VALÓDI naplójában ilyen blokkok állnak:
// „a 'Settings → Extensions → Google apps' menüútvonal KITALÁLT".
//
// A kapuk két rétegben, olcsóságuk sorrendjében:
//   1. INGYENES — `core/upgrade-gate.js` `felujitasKifogas()`. Ott lakik, és
//      nem itt, mert az agentbe zárt logika SOHA nem tesztelhető (az
//      `agents/` alól importálni tilos). Tartalma: a négy régi szerkezeti
//      ellenőrzés + CSONKA-ŐR + NÉV-ZÁR. A modul saját fejléce indokolja
//      mindegyiket; a mérések is ott vannak.
//   2. FIZETŐS — `truthGate()`: halott link ($0) + AI-bíró. Ezen a cikken
//      SEMMI más nem ellenőrzi az igazságot: a lánc többi kapuja (Ellenőrző,
//      truth-gate) csak az ÚJ cikkekre fut, erre nem.
//
// ⚠️ NINCS `logGate()` HÍVÁS, SZÁNDÉKOSAN. A hitelesség-kapu naplója a
// FORRÁS-BIZONYÍTVÁNYT táplálja (`core/source-report-card.js`), az pedig a
// fájlnévből fejti vissza a hírforrást. Egy FELÚJÍTÁSI bukás nem a forrás
// hibája — ha ide naplóznánk, a forrás kapná a rovást. Pontosan az a hiba,
// amit 2026-09-08-án javítottunk ki.
//
// ⚠️ A `hold` NEM BUKÁS. Ha az AI-bíró elérhetetlen, az a MI hibánk, nem a
// szövegé — ilyenkor a próbálkozás-számlálót NEM növeljük, különben három
// hálózati hiba örökre kizárná a cikket a felújításból.
// ===================================================================
//
// FORDÍTÁSOK: sikeres csere után a cikk fordítás-gyorsítótárát TÖRÖLJÜK, hogy a
// fordító a következő futásban az ÚJ szöveget vigye ki mind a 4 nyelvre.
//
// FUTTATÁS:
//   node agents/iro/upgrade-howtos.js              -- 2 cikk (alap)
//   node agents/iro/upgrade-howtos.js --limit 5
//   node agents/iro/upgrade-howtos.js --dry        -- csak listáz, nem ír
// ===================================================================

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ask } from '../../core/ai-router.js';
import { HOWTO_RANGE } from '../../core/article-length.js';
// ── KAPUK (2026-09-08) — lásd a „MI HIÁNYZOTT INNEN" szakaszt lentebb ──
import { truthGate } from '../../core/truth-gate.js';
import { felujitasKifogas } from '../../core/upgrade-gate.js';
// ── FRISSÍTÉS, HA AZ ESZKÖZ VÁLTOZIK (2026-09-27) — core/guide-freshness.js ──
import { frissitendok, nincsValtozas } from '../../core/guide-freshness.js';
import { hirekBetolt, hirBlokk } from '../../core/guide-sources.js';
import { utmutatoE } from '../../core/guide-kind.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const ARTICLES_DIR = join(ROOT, 'content', 'articles');
const TRANS_DIR = join(ROOT, 'content', 'translations');
const SHARED_DIR = join(ROOT, 'shared');
const AGENT_NAME = 'iro';
const MAX_ATTEMPTS = 3;

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const li = args.indexOf('--limit');
const LIMIT = li !== -1 && args[li + 1] ? parseInt(args[li + 1], 10) || 2 : 2;

// ── Ígéret-fedezet: UGYANAZ a szabály, mint az ellenőrzőben ──────────
// (Szándékosan másolat és nem import: az ellenőrző runAutoCheck-je nincs
// exportálva, és ez a néhány sor önmagában is olvasható. Ha a szabály
// változik, MINDKÉT helyen javítani kell — ezt a megjegyzés rögzíti.)
export function promisesSteps(titleLine) {
  const t = String(titleLine || '').trim();
  return /^(how to|your first|setting up|set up|step-by-step)\b/i.test(t)
    || /\bin (five|5|four|4|three|3|ten|10) minutes\b/i.test(t)
    || /\bstep[- ]by[- ]step\b/i.test(t);
}
export function stepCount(md) {
  return (String(md || '').match(/^#{2,3}\s+(step\s*\d|\d+[.)]\s)/gim) || []).length;
}
export function coversPromise(md) {
  const title = (String(md).match(/^title:\s*"?([^"\n]+)/m) || [])[1] || '';
  if (!promisesSteps(title)) return true;              // nem ígér — nincs mit fedezni
  return String(md).split(/\s+/).length >= 600 && stepCount(md) >= 3;
}

function loadBrandContext() {
  const parts = [];
  for (const f of ['company-info.md', 'style-guide.md', 'legal-rules-ai.md']) {   // a PROMPT-változat (09-26; előtte a 13 KB-os magyar teljes szabálykönyv ment be)
    const p = join(SHARED_DIR, f);
    if (existsSync(p)) parts.push(`=== ${f} ===\n${readFileSync(p, 'utf-8')}`);
  }
  return parts.join('\n\n');
}

const SYSTEM = `You are the Writer Agent for AI World HQ, a site that teaches everyday people how to use AI in daily life. (Primary audience: the United States — but written so ANYONE, anywhere can read it; never address readers by nationality and never say "here in <country>".) You write in warm, plain US English and explain every technical term at first use.`;

function upgradePrompt(md, brandContext) {
  return `This article of ours PROMISES instructions in its title, but only describes the topic in general terms. Readers told us it is not detailed enough. Rewrite it so it DELIVERS what the title promises.

MANDATORY for this rewrite:
- 4-7 separate numbered step sections ("## Step 1 — …"), NOT one merged "step-by-step" paragraph.
- Each step 60-140 words and self-contained: what to tap or click and WHERE to find it, what the reader will SEE after doing it, and one concrete 💬 example line they can copy (a prompt, a setting name, a menu path) wherever it applies.
- End each step with a plain success check ("You'll know it worked when…").
- Name any requirement (account, app, paid plan, phone version) BEFORE the first step — never as a surprise at step 4.
- A "## Common mistakes" section with at least 3 entries, each naming the mistake AND the fix.
- Keep the mandatory "## What this means for you" section.
- ${HOWTO_RANGE} words total.

HONESTY (most important): only describe steps, menus and screens you are genuinely confident are real. NEVER invent a menu name, a button label or a screen. If you cannot write real, verifiable steps for this tool, then keep it as an explainer and CHANGE THE TITLE so it promises only what you deliver (e.g. "What X is and who it's for") — that is a perfectly good outcome, not a failure.

KEEP: the same topic, the same YAML frontmatter fields (update title/subtitle/read_time_minutes if you retitle), US English, no external links, no "Source:" line, no comparisons or rankings between companies' products (not better, not worse, not "the best"); a company's self-claims only attributed ("X says…").

BRAND CONTEXT (must follow):
${brandContext}

THE ARTICLE TO REWRITE:
${md}

Output the full rewritten article as markdown only — starting with the YAML frontmatter (---). No commentary.`;
}

// ===================================================================
// FRISSÍTÉS (2026-09-27, user: „oké") — ha új HÍR jött egy eszközről, a róla
// szóló régi útmutató az új tényekkel frissül. UGYANAZOK a kapuk (ingyenes +
// hitelesség-bíró), bukásnál a régi marad. Naponta legfeljebb 1 (költség).
// A hír-összevonó (cluster) MÁST csinál: több ÚJ hírből EGY új hírcikket ír —
// a meglévő útmutatókhoz nem nyúl. Ez a rés az, amit ez a lépés betölt.
// ===================================================================
function frissitoPrompt(md, hirSzoveg, brandContext) {
  return `Below is one of our published step-by-step guides, and our own VERIFIED NEWS about the same tool that appeared AFTER the guide was written.

DECIDE FIRST: does the news make anything in the guide OUTDATED or WRONG (a renamed feature, a new requirement, changed availability or plan, a step that now works differently), or add a capability that directly belongs in THIS guide's task?
- If NOT, output exactly: NO_CHANGE
- If YES, output the full guide, updated: change only what the news changes, keep everything else as it is (same structure, same YAML frontmatter fields, same title unless the news makes it wrong). Facts only from the news; never invent menus, buttons or screens; a company's claims about itself only attributed ("Google says…"); no comparisons between companies; no links, no "Source:" line.
${hirSzoveg}

BRAND CONTEXT (must follow):
${brandContext}

THE GUIDE:
${md}

Output either NO_CHANGE or the full updated guide as markdown (starting with ---). No commentary.`;
}

async function frissites(brandContext) {
  const fm = (md, k) => ((String(md || '').split('\n').find(l => l.startsWith(k + ':')) || '').slice(k.length + 1).trim().replace(/^["']|["']$/g, ''));
  const utmutatok = [];
  for (const f of readdirSync(ARTICLES_DIR).filter(x => x.startsWith('ARTICLE_') && x.endsWith('.json'))) {
    let d; try { d = JSON.parse(readFileSync(join(ARTICLES_DIR, f), 'utf-8')); } catch { continue; }
    if (!utmutatoE(f, d)) continue;
    const md = d.article_markdown || '';
    utmutatok.push({ file: f, title: fm(md, 'title'), tool: d._meta?.tool || fm(md, 'tool'), company: d._meta?.company || fm(md, 'company'), meta: d._meta || {}, data: d, md });
  }
  const hirek = hirekBetolt({ dir: ARTICLES_DIR, fs: { readdirSync, readFileSync }, join, utmutatoE });
  const jeloltek = frissitendok(utmutatok, hirek);
  console.log(`\n🔄 FRISSÍTÉS (új hír az eszközről): ${jeloltek.length ? jeloltek.length + ' jelölt' : 'nincs teendő ma'}`);
  let cost = 0;
  for (const { utmutato: u, hirek: v } of jeloltek) {
    console.log(`   📰 ${u.title.slice(0, 55)} ← ${v[0].title.slice(0, 50)}`);
    if (DRY) continue;
    const r = await ask(frissitoPrompt(u.md, hirBlokk(v), brandContext), { agentName: AGENT_NAME, systemPrompt: SYSTEM, maxTokens: 10000 });
    cost += (r && r.costUsd) || 0;
    let text = (r && r.text || '').trim();
    if (!text) { console.log('   ⏸️  nincs AI-válasz — jövő futáskor újra'); continue; }
    if (nincsValtozas(text)) {
      // A hír nem tett semmit elavulttá → megjelöljük, hogy ELLENŐRIZVE (ugyanerre a hírre többé nem kérdezünk rá).
      u.data._meta = { ...u.data._meta, fresh_checked_at: new Date().toISOString() };
      writeFileSync(join(ARTICLES_DIR, u.file), JSON.stringify(u.data, null, 2), 'utf-8');
      console.log('   ✅ a hír nem változtat az útmutatón — érintetlen (ellenőrizve)');
      continue;
    }
    if (/^---(?!\r?\n)/.test(text)) text = text.replace(/^---(?!\r?\n)/, '---\n');
    const kifogas = felujitasKifogas({ regiMd: u.md, ujMd: text, fedez: coversPromise(text), fedezIndok: `${text.split(/\s+/).length} szó / ${stepCount(text)} lépés` });
    let why = kifogas ? kifogas.indok : null;
    if (!why) {
      const gate = await truthGate({ ...u.data, article_markdown: text }, { ask });
      cost += gate.cost || 0;
      if (!gate.pass && gate.hold) { console.log('   ⏸️  hitelesség-bíró nem elérhető — jövő futáskor újra'); continue; }
      if (!gate.pass) why = `🛡️ IGAZSÁG-KAPU: ${(gate.blockers[0] || 'kitalált állítás').slice(0, 110)}`;
    }
    if (why) {
      // Bukásnál a RÉGI marad; ellenőrzöttnek jelöljük, hogy ne égessük a pénzt ugyanerre újra.
      u.data._meta = { ...u.data._meta, fresh_checked_at: new Date().toISOString() };
      writeFileSync(join(ARTICLES_DIR, u.file), JSON.stringify(u.data, null, 2), 'utf-8');
      console.log(`   ❌ a frissítés nem ment át (${why}) — a RÉGI marad`);
      continue;
    }
    u.data.article_markdown = text;
    u.data._meta = { ...u.data._meta, fresh_updated_at: new Date().toISOString(), fresh_from: v.map(h => h.file) };
    writeFileSync(join(ARTICLES_DIR, u.file), JSON.stringify(u.data, null, 2), 'utf-8');
    const tp = join(TRANS_DIR, u.file);
    if (existsSync(tp)) { try { unlinkSync(tp); } catch { /* a fordító úgyis újraírja */ } }
    console.log('   ✅ frissítve az új hír alapján (fordítás újrakérve)');
  }
  if (jeloltek.length) console.log(`   💰 frissítés költsége: $${cost.toFixed(4)}`);
}

function candidates() {
  const out = [];
  for (const f of readdirSync(ARTICLES_DIR).filter(x => x.endsWith('.json'))) {
    let j; try { j = JSON.parse(readFileSync(join(ARTICLES_DIR, f), 'utf-8')); } catch { continue; }
    const md = j.article_markdown || '';
    if (!md || coversPromise(md)) continue;
    if ((j._meta?.howto_upgrade_attempts || 0) >= MAX_ATTEMPTS) continue;
    out.push({ file: f, data: j, md });
  }
  // A LEGVÉKONYABB elöl — a legfájóbb eseteket javítjuk először.
  out.sort((a, b) => a.md.split(/\s+/).length - b.md.split(/\s+/).length);
  return out;
}

async function main() {
  console.log('🔧 ÍGÉRET-FEDEZET FELÚJÍTÓ');
  console.log('─'.repeat(60));
  const all = candidates();
  const batch = all.slice(0, LIMIT);
  console.log(`   📋 Felújítandó: ${all.length} | most: ${batch.length}${DRY ? ' (PRÓBA)' : ''}\n`);
  const brandContext = loadBrandContext();
  if (!batch.length) { console.log('   ✅ Nincs több hiányos "hogyan"-cikk.'); await frissites(brandContext); return; }
  let fixed = 0, failed = 0, cost = 0;

  for (const c of batch) {
    const title = (c.md.match(/^title:\s*"?([^"\n]+)/m) || [])[1] || c.file;
    const wasWords = c.md.split(/\s+/).length;
    console.log(`🔧 ${title.slice(0, 58)}… (${wasWords} szó, ${stepCount(c.md)} lépés)`);
    if (DRY) continue;

    const r = await ask(upgradePrompt(c.md, brandContext), { agentName: AGENT_NAME, systemPrompt: SYSTEM, maxTokens: 10000 });
    let text = (r && r.text || '').trim();   // let: a frontmatter-javítás átírja
    cost += (r && r.costUsd) || 0;

    // FRONTMATTER-JAVÍTÁS (2026-07-28): a modell néha sortörés NÉLKÜL írja a
    // nyitó határolót ("---title: ..." egy sorban). Ez apró, de végzetes: a
    // frontmatter-értelmezők (fordító, build) nem találják a mezőket, ezért a
    // cikk MIND A 4 nyelven bukott, a címe pedig "undefined" lett. Kiszámítható
    // elgépelés → kódból pótoljuk, nem az AI-ra bízzuk. (Ugyanaz az elv, mint a
    // digest repairDigest()-jénél: a hosszú pontos szövegeket az AI
    // megbízhatatlanul másolja, azt garanciával kell kikényszeríteni.)
    if (/^---(?!\r?\n)/.test(text)) text = text.replace(/^---(?!\r?\n)/, '---\n');

    // A régi verzió CSAK akkor cserélődik, ha az új tényleg fedezi az ígéretet
    // ÉS megvan a kötelező brand-szekció. Bukásnál marad a régi.
    // ÉP FRONTMATTER (2026-07-28): a korábbi startsWith('---') NEM volt elég —
    // a "---title:" alak átment rajta, ráadásul a coversPromise ilyenkor NEM
    // találta meg a címet, így "nincs ígéret → nincs mit fedezni" alapon
    // TÉVESEN átengedte. Most nyitó ÉS záró határolót követelünk, saját sorban.
    // ── 1. INGYENES KAPUK — hálózat és AI nélkül, ezért ezek futnak ELŐBB.
    // A döntés a `core/upgrade-gate.js`-ben lakik, mert az agentbe zárt logika
    // SOHA nem tesztelhető (az `agents/` alól importálni tilos).
    const kifogas = felujitasKifogas({
      regiMd: c.md,
      ujMd: text,
      fedez: coversPromise(text),
      fedezIndok: `${text.split(/\s+/).length} szó / ${stepCount(text)} lépés`
    });
    let why = kifogas ? kifogas.indok : null;

    // ── 2. FIZETŐS KAPU — csak ha az ingyenesek átengedték ──
    // A sorrend nem ízlés kérdése: egy szerkezetileg rossz szövegre kifizetni
    // az AI-bírót tiszta veszteség lenne. (Ugyanaz az elv, mint a
    // `truthGate()`-en belül: előbb a $0-s link-vadász, aztán a bíró.)
    let gate = null;
    if (!why) {
      gate = await truthGate({ ...c.data, article_markdown: text }, { ask });
      cost += gate.cost || 0;
      // ⚠️ A `hold` NEM a szöveg hibája: az AI-bíró volt elérhetetlen. Ilyenkor
      // NEM növeljük a próbálkozás-számlálót, különben három hálózati akadás
      // ÖRÖKRE kizárná a cikket a felújításból — némán, indoklás nélkül.
      if (!gate.pass && gate.hold) {
        console.log(`   ⏸️  visszatartva: ${(gate.blockers[0] || 'AI-bíró nem elérhető').slice(0, 90)}`);
        console.log('       (a próbálkozás NEM számít bele — a következő futás újrapróbálja)\n');
        continue;
      }
      if (!gate.pass) why = `🛡️ IGAZSÁG-KAPU: ${(gate.blockers[0] || 'kitalált állítás').slice(0, 110)}`;
    }

    if (why) {
      failed++;
      c.data._meta = c.data._meta || {};
      c.data._meta.howto_upgrade_attempts = (c.data._meta.howto_upgrade_attempts || 0) + 1;
      writeFileSync(join(ARTICLES_DIR, c.file), JSON.stringify(c.data, null, 2), 'utf-8');
      console.log(`   ❌ nem felelt meg (${why}) — a RÉGI marad, próbálkozás ${c.data._meta.howto_upgrade_attempts}/${MAX_ATTEMPTS}\n`);
      continue;
    }

    c.data.article_markdown = text;
    c.data._meta = c.data._meta || {};
    c.data._meta.howto_upgraded_at = new Date().toISOString();
    c.data._meta.howto_upgrade_attempts = (c.data._meta.howto_upgrade_attempts || 0) + 1;
    writeFileSync(join(ARTICLES_DIR, c.file), JSON.stringify(c.data, null, 2), 'utf-8');

    // A fordítás a RÉGI szövegé — törölni kell, hogy a fordító újra elkészítse.
    const tp = join(TRANS_DIR, c.file);
    if (existsSync(tp)) { try { unlinkSync(tp); } catch { /* a következő futás úgyis újraírja */ } }

    fixed++;
    console.log(`   ✅ felújítva: ${text.split(/\s+/).length} szó, ${stepCount(text)} lépés (fordítás újrakérve)\n`);
  }

  console.log('─'.repeat(60));
  console.log(`📊 FELÚJÍTÓ: ${fixed} kész | ${failed} sikertelen | maradt: ${Math.max(0, all.length - fixed)} | költség ${cost.toFixed(4)}`);
  await frissites(brandContext);
}

main().catch(e => { console.error('💥 FELÚJÍTÓ HIBA:', e); process.exit(1); });
