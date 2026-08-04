// ===================================================================
// FORDÍTÓ AGENT (translator) — a publikált cikkek/útmutatók fordítása
// ===================================================================
//
// Minden publikált ARTICLE_* markdownját lefordítja a cél-nyelvekre, és
// GYORSÍTÓTÁRAZZA (content/translations/<ARTICLE...>.json = { hu:"md", es:"md", ... }).
// Idempotens: csak a HIÁNYZÓ (még le nem fordított) párokat fordítja, ezért
// minden futáskor az új cikkekkel halad. A build.js innen veszi a fordításokat;
// ami még nincs lefordítva, ott angol fallback megy.
//
// FUTTATÁS:
//   node agents/translator/agent.js               -- max LIMIT pár/futás
//   node agents/translator/agent.js --limit 30
//   node agents/translator/agent.js --lang hu     -- csak egy nyelv
//   node agents/translator/agent.js --force       -- meglévőket is újrafordít
//   node agents/translator/agent.js --concurrency 4  -- egyszerre hány cikk (alap: 4)
//
// CÉL-NYELVEK: magyar + nagy világnyelvek (angol a FORRÁS, azt nem fordítjuk).
// ===================================================================

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ask } from '../../core/ai-router.js';
import { titleLooksUntranslated } from '../../core/translation-guard.js';
import { fileHandback, sourceDefect } from '../../core/handback.js';
import { remember } from '../../core/memory-manager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const ARTICLES_DIR = join(ROOT, 'content', 'articles');
const TRANS_DIR = join(ROOT, 'content', 'translations');
const AGENT_NAME = 'translator';

// Bukás-számláló (2026-07-13, cég-hierarchia): ne próbálkozzunk némán a
// végtelenségig — 2 bukás UGYANARRA a (cikk, nyelv) párra ÉS hibás forrás
// → visszaadás az Írónak (a modell-hiba NEM ok, az magától rendeződik).
const FAILS_PATH = join(ROOT, 'memory', 'translation-failures.json');
function loadFails() { try { return JSON.parse(readFileSync(FAILS_PATH, 'utf-8')); } catch { return {}; } }
function saveFails(f) { writeFileSync(FAILS_PATH, JSON.stringify(f, null, 2), 'utf-8'); }

// Cél-nyelvek (kód → emberi név az LLM-promptnak). Az 'en' a forrás.
// 2026-07-31: a NÉMET és a FRANCIA kivezetve. Nyolc hét alatt NULLA látogató
// jött róluk, miközben együtt 1158 oldalt jelentettek — a honlap 40%-át —, és
// terhelték a Google feltérképezési keretét (1546 oldalunk "feltérképezve, de
// nincs indexelve"). A meglévő fordítások a lemezen MARADNAK, csak újat nem
// gyártunk: a döntés visszafordítható, elég ide visszaírni a két nyelvet.
// Megtakarítás: a fordítási költség fele, kb. 11 dollár havonta.
export const LANGS = {
  hu: 'Hungarian',
  es: 'Spanish'
};

function parseArgs() {
  const a = process.argv.slice(2);
  // maxMinutes: FALI-ÓRA keret. A darabszám-limit (80) mellé kell, mert egy nagy
  // backfillnél a 80 pár átlépheti a CI 12 perces plafonját (fizetős→ingyenes
  // esésnél lassabb a fordítás) → timeout → piros X → részleges fordítás → gyűlik.
  // 9 perc: a fordító tiszta kilépéssel megáll, marad ~3 perc egy lassú utolsó
  // fordításnak is a 12-es plafonig; a maradékot a következő futás viszi.
  // concurrency: hány cikken dolgozunk EGYSZERRE (2026-07-27). 4 sáv a mért
  // ~30-80 mp/fordítás mellett ~4x átbocsátást ad, így egy futás friss termése
  // (36-52 fordítás) belefér az időkeretbe — nem csúszik át a következő futásra.
  const p = { limit: 16, force: false, lang: null, maxMinutes: 9, concurrency: 4 };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--limit' && a[i + 1]) p.limit = parseInt(a[++i], 10) || 16;
    else if (a[i] === '--force') p.force = true;
    else if (a[i] === '--lang' && a[i + 1]) p.lang = a[++i];
    else if (a[i] === '--max-minutes' && a[i + 1]) p.maxMinutes = parseFloat(a[++i]) || 9;
    else if (a[i] === '--concurrency' && a[i + 1]) p.concurrency = Math.max(1, parseInt(a[++i], 10) || 4);
  }
  return p;
}

function loadCache(file) {
  const p = join(TRANS_DIR, file);
  if (!existsSync(p)) return {};
  try { return JSON.parse(readFileSync(p, 'utf-8')); } catch { return {}; }
}
function saveCache(file, data) {
  if (!existsSync(TRANS_DIR)) mkdirSync(TRANS_DIR, { recursive: true });
  writeFileSync(join(TRANS_DIR, file), JSON.stringify(data, null, 2), 'utf-8');
}

const SYSTEM = `You are a professional translator for a friendly AI-news + how-to website for everyday people. Translate faithfully and naturally (warm, clear — not robotic). Do NOT translate brand/product names (ChatGPT, Gemini, Claude, Copilot, etc.) or REAL program code (commands, code with actual syntax, API endpoints, JSON keys, file names). HOWEVER: example prompts and messages that a user would TYPE TO AN AI ASSISTANT are human text — ALWAYS translate them, even when they appear inside quotes, after a 💬 marker, or inside backticks/code fences. In the BODY keep all Markdown intact (## headings, lists, **bold**, emojis, line breaks) and translate only the human text.

THE "IN SHORT" BOX (2026-07-29): every article now opens with a blockquote right
after the # title, like "> **In short:** …". TRANSLATE BOTH THE LABEL AND THE
SENTENCE — the label is human text, not a brand name. Keep the "> " and the bold
markers exactly as they are. Natural local equivalents:
  Hungarian "**Röviden:**" · Spanish "**En resumen:**" · German "**Kurz gesagt:**"
  · French "**En bref:**"
Never leave "In short" in English on a non-English page.

TITLES AND SUBTITLES: never translate word-for-word. Rewrite them as a NATIVE headline a local journalist would write — natural word order, correct grammar, instantly understandable. Watch out for English "your X" in generic statements: in many languages the natural form is the plain definite noun, not a possessive (e.g. Hungarian: "Your Cloud Services" → "a felhőszolgáltatások", NOT "felhőszolgáltatásaid(at)"). If a literal translation sounds odd or ambiguous, rephrase the meaning instead.

READER ADDRESS — MANDATORY, SITE-WIDE CONVENTION (2026-07-14, never mix within one article):
- Hungarian: INFORMAL (tegeződés) throughout — "kattints", "nyisd meg", "hozd létre". NEVER "Ön", "kattintson", "nyissa meg".
- German: INFORMAL "du/dein" throughout — NEVER "Sie/Ihre".
- Spanish: INFORMAL "tú" throughout — never "usted".
- French: polite "vous" throughout.
PLAIN WORDS over jargon: prefer common local words everyday readers know (e.g. Hungarian: "platform" → "oldal/szolgáltatás", "avatár" → "digitális másolat" where natural). Keep brand names as-is.

Output EXACTLY this format, nothing else (keep the three labels in English, each on its own line):
TITLE: <translated title>
SUBTITLE: <translated subtitle>
BODY:
<the full translated body in Markdown>`;

// Frontmatter szétválasztás + érték-kiolvasás
function splitFrontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  return m ? { fm: m[1], body: m[2] } : null;
}
function fmValue(fm, key) {
  const m = fm.match(new RegExp('^' + key + ':\\s*(.*)$', 'm'));
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
}

// Egy cikk fordítása: cím+alcím+törzs LLM-mel, de a FRONTMATTERT MI állítjuk
// össze (az angolból, lecserélt title/subtitle-lel) → a záró --- mindig megvan,
// így a build mindig ki tudja olvasni a fordított címet.
async function translateMarkdown(markdown, langName) {
  const parts = splitFrontmatter(markdown);
  if (!parts) return null;
  const enTitle = fmValue(parts.fm, 'title');
  const enSub = fmValue(parts.fm, 'subtitle');

  const prompt = `Translate the following into ${langName}. Use the exact output format (TITLE / SUBTITLE / BODY).\n\nTITLE: ${enTitle}\nSUBTITLE: ${enSub}\nBODY:\n${parts.body}`;
  // 16000: a gemini-2.5-flash "gondolkodási" tokenjei IS ebbe a keretbe számítanak —
  // 6000-nél a hosszú (1200 szavas) útmutatóknál a látható fordítás csonkult (2026-07-03).
  const r = await ask(prompt, { agentName: AGENT_NAME, systemPrompt: SYSTEM, maxTokens: 16000 });
  if (!r || !r.text) return null;

  const t = r.text;
  const tm = t.match(/TITLE:\s*(.+)/);
  const sm = t.match(/SUBTITLE:\s*(.+)/);
  const bm = t.match(/BODY:\s*\n?([\s\S]*)$/);
  const title = (tm ? tm[1] : enTitle).trim().replace(/^["']|["']$/g, '');
  const sub = (sm ? sm[1] : enSub).trim().replace(/^["']|["']$/g, '');
  const body = (bm ? bm[1] : '').trim();
  if (body.length < 80) return null;
  // CSONKULÁS-VÉDELEM: ha a fordítás gyanúsan rövidebb az angolnál (kifutott
  // a token-keretből), NE mentsük el félbevágva — inkább következő körben újra.
  if (body.length < parts.body.length * 0.35) return null;
  // NEM-FORDÍTÁS VÉDELEM (2026-07-25): a modell néha visszaadja az ANGOLT (nem
  // fordít) → angol csúszna a fordítás-slotba (10 ilyen es/fr cikk volt). Az angol
  // funkciószó-sűrűség jól elválik: JÓ fordítás ≤0.016, ANGOLUL-MARADT ~0.16 → a
  // 0.06 küszöb bőven biztonságos. Ilyenkor NEM mentünk (null → következő futás
  // újrapróbálja). A célnyelv itt mindig nem-angol (hu/es/de/fr).
  const enWords = (body.match(/\b(the|and|with|your|you|for|this|that|what|when|from|will|can|how|are)\b/gi) || []).length;
  if (enWords / (body.split(/\s+/).length || 1) > 0.06) return null;
  // UGYANEZ A CÍMRE (2026-08-04): a fenti védelem csak a TÖRZSET nézte, a cím
  // viszont külön úton jön (TITLE: sor), és ha az hiányzik a válaszból, a
  // fenti `tm ? tm[1] : enTitle` NÉMÁN az angolt menti. Élesben 3 spanyol cím
  // maradt így angolul — és egy ilyen cím a kapcsolódó-cikk dobozokon
  // keresztül 47 spanyol oldalra ült ki. A törzzsel azonos kezelés: nem
  // mentünk, a következő futás újrapróbálja.
  if (titleLooksUntranslated(enTitle, title)) return null;

  const fm = parts.fm
    .replace(/^title:\s*.*$/m, `title: "${title.replace(/"/g, '')}"`)
    .replace(/^subtitle:\s*.*$/m, `subtitle: "${sub.replace(/"/g, '')}"`);
  return { text: `---\n${fm}\n---\n\n${body}`, cost: r.costUsd || 0 };
}

function looksValid(md) {
  // Kötelező: nyitó ÉS záró frontmatter delimiter + értelmes hossz
  return md && /^---\n[\s\S]*?\n---/.test(md.trimStart()) && md.length > 160;
}

async function main() {
  const args = parseArgs();
  const targetLangs = args.lang ? [args.lang] : Object.keys(LANGS);
  console.log('🌍 FORDÍTÓ AGENT — nyelvek:', targetLangs.join(', '));
  console.log('─'.repeat(60));

  if (!existsSync(ARTICLES_DIR)) { console.log('Nincs cikk.'); return; }
  // PRIORITÁS: a published_at szerint LEGFRISSEBB tartalom fordul először —
  // így a címlapon lévő friss HÍREK minden nyelven hamar megjelennek.
  // (A korábbi fájlnév-rendezés az ARTICLE_GUIDE_* fájlokat vette mindig előre
  // — 'G' > '2026' — ezért a hírek SOSEM kerültek sorra. 2026-07-01 tanulság.)
  const files = readdirSync(ARTICLES_DIR)
    .filter(f => f.startsWith('ARTICLE_') && f.endsWith('.json'))
    .map(f => {
      let pub = '';
      try { pub = JSON.parse(readFileSync(join(ARTICLES_DIR, f), 'utf-8'))._meta?.published_at || ''; } catch { /* skip */ }
      return { f, pub };
    })
    .sort((a, b) => (b.pub || '').localeCompare(a.pub || ''))
    .map(x => x.f);

  let done = 0, cost = 0, skipped = 0, failed = 0;
  const startedAt = Date.now();
  const maxMs = args.maxMinutes * 60 * 1000;
  let stopReason = null;   // 'limit' | 'time' — az első dolgozó állítja be, a többi látja

  // ===================================================================
  // PÁRHUZAMOS FELDOLGOZÁS (2026-07-27) — a friss cikkek fordítása 8-14 órát
  // késett. Ok: egy futás 9-13 cikket ad ki (= 36-52 fordítás), a soros fordító
  // viszont ~30-80 mp/darab tempóval 27 perc alatt csak ~20-at ért el; a maradék
  // a KÖVETKEZŐ futásra (8 óra!) csúszott, és addig a build angol fallbackot
  // tett ki a hu/es/de/fr oldalakra. A hívások SZÁMA (és a költség) változatlan,
  // csak nem várnak egymásra.
  //
  // MIÉRT FÁJLONKÉNT osztunk, nem (fájl, nyelv) páronként: a fordítás-gyorsítótár
  // fájlonként EGY json ({hu,es,de,fr}), amit a nyelvek között olvasunk-írunk.
  // Ha két dolgozó ugyanannak a cikknek két nyelvét vinné, mindkettő a saját
  // memóriabeli másolatát mentené vissza — a később végző FELÜLÍRNÁ a másik
  // eredményét. Egy fájl = egy dolgozó → a cache-objektum sosem osztott.
  // (A recordSpend és a bukás-számláló ezzel szemben szinkron olvas-ír await
  // nélkül, tehát a Node egyszálú ciklusában oszthatatlan — azok biztonságosak.)
  // ===================================================================
  let cursor = 0;

  async function processFile(file) {
    let data; try { data = JSON.parse(readFileSync(join(ARTICLES_DIR, file), 'utf-8')); } catch { return; }
    const md = data.article_markdown;
    if (!md) return;
    const cache = loadCache(file);

    for (const code of targetLangs) {
      if (!LANGS[code]) continue;
      if (cache[code] && !args.force) { skipped++; continue; }
      if (stopReason) return;
      if (done >= args.limit) { stopReason = 'limit'; return; }
      // IDŐ-KERET: sose kezdjünk új fordítást, ha már túlléptük a keretet — így a
      // lépés a CI plafonja alatt marad, a maradék a következő futásé.
      if (Date.now() - startedAt >= maxMs) { stopReason = 'time'; return; }

      // EGY SOR / fordítás: párhuzamosan a régi "write … majd console.log" páros
      // összekeveredne a dolgozók között, olvashatatlan naplót adva.
      const res = await translateMarkdown(md, LANGS[code]);
      if (res && looksValid(res.text)) {
        cache[code] = res.text.trim();
        saveCache(file, cache);
        cost += res.cost; done++;
        // sikerült → a bukás-számláló törlődik erre a párra
        const fails = loadFails();
        if (fails[`${file}|${code}`]) { delete fails[`${file}|${code}`]; saveFails(fails); }
        console.log(`🔤 ${code} ← ${file.slice(0, 48)}… ✅ ($${res.cost.toFixed(4)})`);
      } else {
        failed++;
        const fails = loadFails();
        const key = `${file}|${code}`;
        fails[key] = (fails[key] || 0) + 1;
        saveFails(fails);
        const defect = sourceDefect(md);
        if (fails[key] >= 2 && defect) {
          // Hibás FORRÁS: nem a modell hibája — visszaadás az Írónak, hogy ne
          // égessünk pénzt reménytelen újrapróbákra (user 2026-07-13).
          const r = fileHandback({ from: AGENT_NAME, to: 'iro', ref: file, reason: `fordítás 2x bukott (${code}) — forrás-hiba: ${defect}`, hint: 'Javítsd a cikk szerkezetét (H1 főcím + teljes törzs), a tartalmi mondanivalót őrizd meg.' });
          if (r.ok) {
            remember(AGENT_NAME, `Ha a forrás-cikk hibás (${defect}), NEM újrapróbálni kell, hanem visszaadni az Írónak.`);
            delete fails[key]; saveFails(fails);
            console.log(`🔤 ${code} ← ${file.slice(0, 48)}… ↩️  visszaadva az Írónak (${defect})`);
          } else { console.log(`🔤 ${code} ← ${file.slice(0, 48)}… ❌ (sikertelen / érvénytelen)`); }
        } else {
          console.log(`🔤 ${code} ← ${file.slice(0, 48)}… ❌ (sikertelen / érvénytelen)`);
        }
      }
    }
  }

  async function worker() {
    while (!stopReason) {
      const file = files[cursor++];
      if (!file) return;
      await processFile(file);
    }
  }

  const lanes = Math.max(1, Math.min(args.concurrency, files.length || 1));
  console.log(`⚙️  párhuzamos sávok: ${lanes} | limit: ${args.limit} | időkeret: ${args.maxMinutes} perc`);
  await Promise.all(Array.from({ length: lanes }, () => worker()));

  if (stopReason === 'limit') console.log(`\n⏸️  Elértem a futás-limitet (${args.limit}). A többit a következő futás fordítja.`);
  if (stopReason === 'time') console.log(`\n⏱️  Elértem az idő-keretet (${args.maxMinutes} perc). A többit a következő futás fordítja.`);

  console.log('\n' + '─'.repeat(60));
  console.log(`📊 Fordítva: ${done} | már megvolt: ${skipped} | sikertelen: ${failed} | költség $${cost.toFixed(4)}`);

  // ── EGY FORDÍTÁS ÁRA — gördülő átlag (2026-08-01) ─────────────────
  // MIÉRT: a user kérdezte, miért ugrott a napi költés $0,60-ról $2,51-re.
  // Ok: egy tömeges cikkjavítás (137 szivárgó sablon-címke) TÖRÖLTE 136 cikk
  // fordítás-gyorsítótárát — helyesen, mert az angol szöveg megváltozott —,
  // ezzel 544 újrafordítást indítva. SEMMI nem jelezte ezt előre.
  // Ez a fájl teszi lehetővé, hogy a napi riport a hátralékból ELŐRE
  // megmondja a várható költséget. Mért érték: ~$0,004/fordítás.
  // Miért gördülő átlag és nem beégetett szám: a modell-árak és a cikkhossz
  // változnak; egy beégetett konstans némán elavulna, és pont akkor
  // hazudna, amikor számítana. (Lásd a havi keret esetét ugyanezen a napon.)
  if (done > 0) {
    try {
      const P = join(__dirname, '..', '..', 'memory', 'translation-cost.json');
      let s = { runs: [] };
      try { s = JSON.parse(readFileSync(P, 'utf-8')); } catch { /* első futás */ }
      s.runs.push({ at: new Date().toISOString(), n: done, usd: Number(cost.toFixed(6)) });
      s.runs = s.runs.slice(-20);                       // csak a legutóbbi 20 futás
      const n = s.runs.reduce((a, r) => a + r.n, 0);
      const u = s.runs.reduce((a, r) => a + r.usd, 0);
      s.avg_usd_per_translation = n ? Number((u / n).toFixed(6)) : null;
      s._comment = 'Gördülő átlag egy fordítás árára (utolsó 20 futás). A core/daily-report.js ebből jelzi előre a hátralék várható költségét.';
      writeFileSync(P, JSON.stringify(s, null, 2), 'utf-8');
      console.log(`   💵 egy fordítás átlagos ára: $${s.avg_usd_per_translation.toFixed(5)} (utolsó ${s.runs.length} futás)`);
    } catch { /* a könyvelés hibája ne állítsa meg a fordítást */ }
  }
}

main().catch(e => { console.error('💥 FORDÍTÓ HIBA:', e); process.exit(1); });
