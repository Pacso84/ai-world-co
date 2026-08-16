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
  for (const f of ['company-info.md', 'style-guide.md', 'legal-rules.md']) {
    const p = join(SHARED_DIR, f);
    if (existsSync(p)) parts.push(`=== ${f} ===\n${readFileSync(p, 'utf-8')}`);
  }
  return parts.join('\n\n');
}

const SYSTEM = `You are the Writer Agent for AI World Co., a site that teaches everyday people how to use AI in daily life. (Primary audience: the United States — but written so ANYONE, anywhere can read it; never address readers by nationality and never say "here in <country>".) You write in warm, plain US English and explain every technical term at first use.`;

function upgradePrompt(md, brandContext) {
  return `This article of ours PROMISES instructions in its title, but only describes the topic in general terms. Readers told us it is not detailed enough. Rewrite it so it DELIVERS what the title promises.

MANDATORY for this rewrite:
- 4-6 separate numbered step sections ("## Step 1 — …"), NOT one merged "step-by-step" paragraph.
- Each step 60-140 words and self-contained: what to tap or click and WHERE to find it, what the reader will SEE after doing it, and one concrete 💬 example line they can copy (a prompt, a setting name, a menu path) wherever it applies.
- End each step with a plain success check ("You'll know it worked when…").
- Name any requirement (account, app, paid plan, phone version) BEFORE the first step — never as a surprise at step 4.
- A "## Common mistakes" section with at least 3 entries, each naming the mistake AND the fix.
- Keep the mandatory "## What this means for you" section.
- ${HOWTO_RANGE} words total.

HONESTY (most important): only describe steps, menus and screens you are genuinely confident are real. NEVER invent a menu name, a button label or a screen. If you cannot write real, verifiable steps for this tool, then keep it as an explainer and CHANGE THE TITLE so it promises only what you deliver (e.g. "What X is and who it's for") — that is a perfectly good outcome, not a failure.

KEEP: the same topic, the same YAML frontmatter fields (update title/subtitle/read_time_minutes if you retitle), US English, no external links, no "Source:" line, no comparisons between companies' products.

BRAND CONTEXT (must follow):
${brandContext}

THE ARTICLE TO REWRITE:
${md}

Output the full rewritten article as markdown only — starting with the YAML frontmatter (---). No commentary.`;
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
  if (!batch.length) { console.log('   ✅ Nincs több hiányos "hogyan"-cikk.'); return; }

  const brandContext = loadBrandContext();
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
    const validFrontmatter = /^---\r?\n[\s\S]*?\r?\n---/.test(text.trimStart());
    const hasTitle = /^title:\s*\S/m.test(text);
    const ok = validFrontmatter
      && hasTitle
      && coversPromise(text)
      && /what this means for you/i.test(text);
    if (!ok) {
      failed++;
      c.data._meta = c.data._meta || {};
      c.data._meta.howto_upgrade_attempts = (c.data._meta.howto_upgrade_attempts || 0) + 1;
      writeFileSync(join(ARTICLES_DIR, c.file), JSON.stringify(c.data, null, 2), 'utf-8');
      const why = !validFrontmatter ? 'sérült frontmatter' : !hasTitle ? 'nincs title mező' : (!coversPromise(text) ? `${text.split(/\s+/).length} szó / ${stepCount(text)} lépés` : 'hiányzik a brand-szekció');
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
  console.log(`📊 FELÚJÍTÓ: ${fixed} kész | ${failed} sikertelen | maradt: ${Math.max(0, all.length - fixed)} | költség $${cost.toFixed(4)}`);
}

main().catch(e => { console.error('💥 FELÚJÍTÓ HIBA:', e); process.exit(1); });
