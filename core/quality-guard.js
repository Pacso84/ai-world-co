// ===================================================================
// MINŐSÉG-ŐR — a kézi ellenőrzések gépesítve (user 2026-07-12:
// "ezeket is tudja a cégünk, építsd be")
// ===================================================================
//
// Három ellenőrzés, amit addig kézzel futtattunk:
//   1) CHIP-SZABÁLY: a guide-ok tool mezője csak tiszta terméknév lehet
//      (szabálykönyv 7. szakasz) — generikus kifejezés / zárójel / lista /
//      cégnév-duplázás / két-néven-ugyanaz következetlenség = találat.
//   2) DUPLIKÁLT LINK: a tools-oldalak "Hivatalos oldalak" soraiban egy
//      webcím csak egyszer szerepelhet (build utáni HTML-ből).
//   3) A hivatalos-link hiányt a napi jelentés már figyeli (tool-links.json).
//
// Használat:  import { qualityFindings } from '../core/quality-guard.js';
//   → string-lista; üres = minden rendben. CSAK jelez, semmit nem módosít.
// A check-i18n (minden build után) kiírja, a napi Telegram-jelentés összegzi.
// ===================================================================

import { readFileSync, readdirSync, existsSync, writeFileSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { toUS } from './us-spelling.js';
import { slugUtkozesek } from './slug-collisions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ARTICLES_DIR = join(ROOT, 'content', 'articles');
const PUBLIC_DIR = join(ROOT, 'website', 'public');

// Teljes-alakú hivatalos nevek (szabálykönyv 7. szakasz kivétel-listája):
// ezek NEM cégnév-duplázások / nem rövidítendők.
export const FULLFORM_OK = new Set([
  'GitHub Copilot', 'Meta AI', 'Apple Intelligence', 'Alibaba Cloud',
  'Mistral AI', 'Le Chat', 'Hugging Face', 'Project Genie', 'NotebookLM',
  'Google Photos',
  // 🔑 2026-09-06. Ez a név 08-30, 09-01 és 09-06 napi jelentésében is
  // „cégnév-duplázás"-ként szerepelt — HAMISAN. A „Microsoft 365 Copilot" a
  // termék hivatalos, teljes alakú neve; rövidíteni csak úgy lehetne, hogy
  // KITALÁLUNK egy nem létező terméket.
  // ⚠️ ÉS EZ MÁR MEGTÖRTÉNT: 2026-08-30-án három élő útmutatóból javítottuk ki
  // a kitalált „365 Copilot" nevet. A figyelmeztetés tehát pontosan azt a hibát
  // ajánlotta vissza, amit egyszer már megszüntettünk — egy tanács, amit nem
  // lehet helyesen követni, rosszabb a semminél.
  'Microsoft 365 Copilot'
]);
// Generikus (nem-termék) szavak a chipben → találat
const GENERIC_RX = /\(|,| in |powered|capacit|resolution|assistant|chatbot|workspace|feature| api\b|projects?$| chat$|models?$| llm\b| ai$/i;

/**
 * Kifogásolható-e ez a chip? Tiszta függvény — lemez és hálózat nélkül tesztelhető.
 *
 * 🔑 MIÉRT KÜLÖN FÜGGVÉNY (2026-09-06). A szabály korábban a `qualityFindings()`
 * belsejében élt, és csak a VALÓDI cikkeken lehetett mérni. Emiatt a tesztje
 * egyetlen irányra volt élezhető („ne legyen hamis riasztás") — a mutációs próba
 * viszont megmutatta, hogy ez ELÉGTELEN: ha a szabályt teljesen kitörlöm, a teszt
 * ZÖLD MARAD, mert találat akkor sincs. A projekt kemény szabálya:
 * **minden mérce IRÁNYA számít** — a valódi hibát is el KELL kapni.
 *
 * @returns {'generikus'|'cegnev-dupla'|null}
 */
export function chipKifogas(tool, company) {
  const t = String(tool || '').trim();
  if (!t) return null;
  // A hivatalos, teljes alakú nevek nem rövidítendők — lásd a FULLFORM_OK-ot.
  if (FULLFORM_OK.has(t)) return null;
  if (GENERIC_RX.test(t)) return 'generikus';
  const c = String(company || '').trim();
  // ⚠️ SZÓHATÁRON, nem puszta előtagként: a „Meta" nem előtagja a „Metaphor"-nak.
  if (c && t.toLowerCase().startsWith(c.toLowerCase() + ' ')) return 'cegnev-dupla';
  return null;
}

function strip(s) { return (s || '').trim().replace(/^["']+|["']+$/g, '').trim(); }

// GÉPI KANONIZÁLÁS (2026-07-13): a csempe-nevet KÓD teszi rendbe, nem prompt —
// a párosító AI a kérés ellenére is írt "NVIDIA ChatRTX"-et. Rétegek sorban:
//   1) páros-térkép (cég+eszköz): a "Copilot" a GitHub szekcióban = GitHub Copilot
//   2) név-térkép: a 2026-07-12-i nagytakarítás ismert döntései
//   3) FULLFORM-csonkolás: "Hugging Face Spaces" → "Hugging Face" (jövőállóan)
//   4) cégnév-előtag levágása — DE generikus maradék ("LLM", "AI") esetén nem
const PAIR_ALIAS = { 'github|copilot': 'GitHub Copilot' };
const NAME_ALIAS = {
  'nvidia chatrtx': 'ChatRTX', 'microsoft copilot': 'Copilot',
  'qwen chat': 'Qwen', 'claude projects': 'Claude',
  'deepseek chat': 'DeepSeek', 'deepseek llm': 'DeepSeek',
  'amazon alexa': 'Alexa+', 'amazon alexa+': 'Alexa+', 'alexa': 'Alexa+',
  'google gemini': 'Gemini', 'openai chatgpt': 'ChatGPT',
  'alibaba cloud ai': 'Alibaba Cloud'
};
const GENERIC_REST_RX = /^(ai|llm|chat|app|api|bot|cloud|cloud ai|assistant|studio|models?)$/i;
export function canonicalChip(tool, company) {
  tool = strip(tool); company = strip(company);
  if (!tool) return tool;
  const pair = PAIR_ALIAS[(company + '|' + tool).toLowerCase()];
  if (pair) return pair;
  const alias = NAME_ALIAS[tool.toLowerCase()];
  if (alias) return alias;
  if (FULLFORM_OK.has(tool)) return tool;
  for (const full of FULLFORM_OK)
    if (tool.toLowerCase().startsWith(full.toLowerCase() + ' ')) return full;
  if (company && tool.toLowerCase().startsWith(company.toLowerCase() + ' ')) {
    const rest = tool.slice(company.length + 1).trim();
    // ⚠️ SZÁMMAL KEZDŐDŐ MARADÉK NEM TERMÉKNÉV (2026-08-29, élő hiba volt).
    // A "Microsoft 365 Copilot" cégnév-levágásból **„365 Copilot"** lett, és
    // ez a KITALÁLT név 6 helyen kint volt az olvasónál (a cikkben és a
    // /tools oldalon). A szabály a "NVIDIA ChatRTX"→"ChatRTX" esetre készült;
    // a termék-számot (365, 3.5, 4o) viszont nem szabad leszakítani a névről.
    // Ugyanaz a lecke, mint a helyesírás-védelemnél: az ELŐTAG-ILLESZTÉS
    // magabiztosan gyárt nem létező szóalakokat.
    if (rest.length >= 3 && !GENERIC_REST_RX.test(rest) && !/^\d/.test(rest)) return rest;
  }
  return tool;   // amit nem értünk, azt NEM bántjuk — majd az őr jelzi
}

function loadGuideChips() {
  const rows = [];
  if (!existsSync(ARTICLES_DIR)) return rows;
  for (const f of readdirSync(ARTICLES_DIR).filter(x => x.endsWith('.json'))) {
    try {
      const d = JSON.parse(readFileSync(join(ARTICLES_DIR, f), 'utf-8'));
      if (d._meta?.type !== 'guide') continue;
      const md = d.article_markdown || '';
      // A frontmatter az elsődleges (az író VÉGSŐ döntése — ezt mutatja az oldal),
      // a _meta (a párosító terve) csak tartalék; az eltérésüket külön jelezzük.
      const fmCompany = strip((md.match(/^company:\s*(.*)$/m) || [])[1]);
      const company = fmCompany || strip(d._meta?.company);
      // Kanonizált értékeket hasonlítunk — a megjelenítés is ezt mutatja
      const fmTool = canonicalChip((md.match(/^tool:\s*(.*)$/m) || [])[1], company);
      const metaTool = canonicalChip(d._meta?.tool, company);
      const tool = fmTool || metaTool;
      if (tool) rows.push({ tool, company, fmTool, metaTool, file: f });
    } catch { /* skip */ }
  }
  return rows;
}

function checkChips() {
  const out = [];
  const rows = loadGuideChips();
  const tools = new Set(rows.map(r => r.tool));
  for (const { tool, company, fmTool, metaTool, file } of rows) {
    // Terv ↔ kész cikk eltérés: a párosító mást tervezett, mint amiről az író írt
    if (fmTool && metaTool && fmTool !== metaTool)
      out.push(`CHIP terv≠cikk: _meta "${metaTool}" de a cikk "${fmTool}" (${file.slice(0, 50)})`);
    const kifogas = chipKifogas(tool, company);
    if (kifogas === 'generikus') out.push(`CHIP generikus/toldalékos: "${tool}" (${file.slice(0, 50)})`);
    else if (kifogas === 'cegnev-dupla')
      out.push(`CHIP cégnév-duplázás: "${tool}" a(z) ${company} szekcióban (${file.slice(0, 50)})`);
  }
  // Két néven ugyanaz: az egyik tool a másik előtagja (Qwen vs "Qwen Chat")
  for (const a of tools) for (const b of tools) {
    if (a !== b && b.toLowerCase().startsWith(a.toLowerCase() + ' ') && !FULLFORM_OK.has(b))
      out.push(`CHIP következetlenség: "${a}" ÉS "${b}" egyszerre létezik — egységesíteni`);
  }
  return [...new Set(out)];
}

function checkDupLinks() {
  const out = [];
  for (const lang of ['', 'hu', 'es']) {
    const p = join(PUBLIC_DIR, lang, 'tools.html');
    if (!existsSync(p)) continue;
    const h = readFileSync(p, 'utf-8');
    const rows = [...h.matchAll(/official-row__l">([^<]+)<\/span>([\s\S]*?)<\/p>/g)];
    rows.forEach((r) => {
      const urls = [...r[2].matchAll(/href="([^"]+)"/g)].map(m => m[1].replace(/\/+$/, '').toLowerCase());
      if (new Set(urls).size !== urls.length)
        out.push(`DUPLIKÁLT hivatalos link (${lang || 'en'}/tools.html): ${urls.join(', ').slice(0, 90)}`);
    });
  }
  return out;
}

// SLUG-ÜTKÖZÉS-ŐR (2026-07-16): ha két cikk ugyanarra az URL-re kerül, a build
// EGYMÁSRA ÍRJA őket (a Together-hír és a belőle párosított guide azonos
// címet kapott → nyelvenként hol az egyik, hol a másik látszott). Nem javítható
// gépi biztonsággal (címet AI-nak/embernek kell adnia) → őr-találat, Telegramra.
//
// ⚠️ 2026-09-12: a kulcs a BUILD kulcsa — `_meta.slug`, tartalékként a cím.
// Eddig a CÍMBŐL képzett slugot néztük, ami 961 cikkből 81-nél NEM az URL:
// két azonos `_meta.slug` valódi ütközését nem láttuk volna. A döntés és a
// mérés: core/slug-collisions.js (a tesztje a build.js forrásával veti össze).
// A mappa a bekötés-teszthez felülírható (hívásonként olvassuk, mint a
// NAME_GUARD_PATH-t); élesben sosem állítja senki.
function checkSlugCollisions() {
  const dir = process.env.SLUG_GUARD_ARTICLES_DIR || ARTICLES_DIR;
  const bejegyzesek = [];
  for (const f of readdirSync(dir).filter(x => x.endsWith('.json'))) {
    try { bejegyzesek.push({ file: f, data: JSON.parse(readFileSync(join(dir, f), 'utf-8')) }); }
    catch { /* hibás fájl nem az őr dolga — a build is átugorja */ }
  }
  return slugUtkozesek(bejegyzesek);
}

// NÉV-ZÁR-KIFOGÁSOK (2026-09-06) — a tény-ellenőrző átnevezési kísérletei.
// A `core/name-guard.js` naplózza őket; ide azért kerülnek, mert a napi
// Telegram-jelentés EZT a függvényt hívja (`daily-report.js`: „🧹 Minőség-őr").
// Egy őrszem, ami csak a CI-naplóba ír, senkihez nem jut el.
//
// ⚠️ MIÉRT `fs`-SEL, ÉS NEM IMPORTTAL. A `name-guard.js` innen importál
// (`canonicalChip`), tehát a visszafelé mutató import KÖRKÖRÖS lenne:
// quality-guard → name-guard → tool-kinds → quality-guard. A `qualityFindings()`
// szinkron, dinamikus importot sem tehet. Ez a pár sor a napló olvasása;
// a két oldal összetartozását a `core/name-guard.test.js` utolsó esete
// méri le — az ITT betöltött modullal.
function checkNameLock() {
  try {
    // Hívásonként olvassuk a felülírást: a teszt a modul betöltése UTÁN állítja.
    const ut = process.env.NAME_GUARD_PATH || join(ROOT, 'memory', 'name-guard.json');
    const log = JSON.parse(readFileSync(ut, 'utf-8'));
    const ma = new Date().toISOString().slice(0, 10);
    return (log?.entries || [])
      .filter(e => String(e?.at || '').slice(0, 10) === ma)
      .map(e => `NÉV-ZÁR: ${e.indok}`
        + (e.file ? ` (${String(e.file).replace(/^ARTICLE_(GUIDE_)?/, '').replace(/\.json$/, '').slice(0, 45)})` : ''));
  } catch { return []; }   // nincs napló = nem volt átnevezési kísérlet
}

export function qualityFindings() {
  try { return [...checkChips(), ...checkDupLinks(), ...checkSlugCollisions(), ...checkNameLock()]; }
  catch (e) { return ['MINŐSÉG-ŐR HIBA: ' + e.message.slice(0, 80)]; }
}

// ===================================================================
// MINŐSÉG-ÖNJAVÍTÓ (2026-07-13, user: "ne csak szóljon, javítsa is") —
// amit determinisztikusan lehet, azt KIJAVÍTJA, nem csak jelzi:
//   • csempe-kanonizálás a témalistában (innen öröklődik minden új guide-ba)
//   • cikkek/piszkozatok _meta.tool/company szinkron a frontmatterrel
//   • kanonizálás után is generikus csempe → ÜRESRE (szabálykönyv: nincs
//     egyértelmű termék → nincs chip)
// A javítások a memory/quality-fix-log.json-ba kerülnek → a napi Telegram-
// jelentés "ennyit javítottam magamtól" sort ír belőle. Ami nem javítható
// gépi biztonsággal, az marad az őr találatának (ember/AI dönt).
// Futtatás a pipeline-ban a build ELŐTT:  node core/quality-guard.js --fix
// ===================================================================
const TOPICS_PATH = join(ROOT, 'guides', 'guide-topics.json');
const FIXLOG_PATH = join(ROOT, 'memory', 'quality-fix-log.json');

function fixedChip(tool, company) {
  const c = canonicalChip(tool, company);
  // ha kanonizálva is generikus maradt → nincs chip (üres)
  if (c && !FULLFORM_OK.has(c) && GENERIC_RX.test(c)) return '';
  return c;
}

function logFixes(fixes) {
  if (!fixes.length) return;
  let log = {};
  try { log = JSON.parse(readFileSync(FIXLOG_PATH, 'utf-8')); } catch { /* első futás */ }
  const day = new Date().toISOString().slice(0, 10);
  log[day] = [...(log[day] || []), ...fixes];
  // 14 napnál régebbi bejegyzések ki
  const keep = Object.keys(log).sort().slice(-14);
  writeFileSync(FIXLOG_PATH, JSON.stringify(Object.fromEntries(keep.map(k => [k, log[k]])), null, 2), 'utf-8');
}

export async function applyQualityFixes() {
  const fixes = [];
  // 1) témalista — a forrás, ahonnan az író örökli a _meta-t
  try {
    const topics = JSON.parse(readFileSync(TOPICS_PATH, 'utf-8'));
    let dirty = false;
    for (const t of topics.topics || []) {
      const want = fixedChip(t.tool, t.company);
      if (want !== strip(t.tool)) {
        fixes.push(`téma ${String(t.id).slice(0, 40)}: "${t.tool}" → "${want || '(nincs chip)'}"`);
        t.tool = want; dirty = true;
      }
    }
    if (dirty) writeFileSync(TOPICS_PATH, JSON.stringify(topics, null, 2), 'utf-8');
  } catch { /* nincs témalista */ }
  // 2) cikkek + piszkozatok — _meta szinkron a kész cikk frontmatterével
  //    + AMERIKAI HELYESÍRÁS (2026-08-03): ez MINDEN cikkre vonatkozik, nem
  //    csak az útmutatókra, ezért a guide-szűrő beljebb került egy ággal.
  for (const dir of [ARTICLES_DIR, join(ROOT, 'content', 'drafts')]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter(x => x.endsWith('.json'))) {
      try {
        const p = join(dir, f);
        const d = JSON.parse(readFileSync(p, 'utf-8'));
        let dirty = false;

        // 2a) HELYESÍRÁS — hírre és útmutatóra egyaránt, AI nélkül, $0.
        // A cím is a markdownban van, tehát az is javul; az URL-t a rögzített
        // _meta.slug védi, így a javítás SOHA nem költöztet el egy oldalt.
        // A fordításokat nem érinti: a gyorsítótár fájl+nyelv kulcsú (nem
        // tartalom-lenyomat), és a colour/color magyarul úgyis ugyanaz a szó.
        const spelled = toUS(d.article_markdown || '');
        if (spelled.fixed.length) {
          d.article_markdown = spelled.text;
          fixes.push(`helyesírás ${f.slice(14, 50)}: ${spelled.fixed.join(', ')}`);
          dirty = true;
        }

        // 2b) CSEMPE-SZABÁLY — csak útmutatóra értelmes
        if (d._meta?.type === 'guide' && d._meta?.tool) {
          const md = d.article_markdown || '';
          const fmCompany = strip((md.match(/^company:\s*(.*)$/m) || [])[1]);
          const fmTool = strip((md.match(/^tool:\s*(.*)$/m) || [])[1]);
          const wantCompany = fmCompany || strip(d._meta.company);
          const wantTool = fixedChip(fmTool || d._meta.tool, wantCompany);
          if (wantTool !== strip(d._meta.tool)) {
            fixes.push(`cikk ${f.slice(14, 55)}: tool "${d._meta.tool}" → "${wantTool || '(nincs chip)'}"`);
            d._meta.tool = wantTool; dirty = true;
          }
          if (wantCompany && wantCompany !== strip(d._meta.company)) {
            fixes.push(`cikk ${f.slice(14, 55)}: company "${d._meta.company}" → "${wantCompany}"`);
            d._meta.company = wantCompany; dirty = true;
          }
        }

        if (dirty) writeFileSync(p, JSON.stringify(d, null, 2), 'utf-8');
      } catch { /* sérült fájl — az őr úgyis jelzi */ }
    }
  }
  // Tanulság a közös könyvbe (2026-07-13): ha javítani kellett, arról a cég
  // MINDEN munkatársa tanul (a router minden promptba befűzi).
  // KÉT KÜLÖN TANULSÁG (2026-08-03): a csempe- és a helyesírás-javítás más
  // hibából jön, ezért külön is kell tanulni belőlük. Ha egybemosnánk, a
  // promptba olyan mondat kerülne, hogy "csempe-szabály… pl. colour→color",
  // ami félrevezeti az írót.
  const chipFixes = fixes.filter(x => !x.startsWith('helyesírás '));
  const spellFixes = fixes.filter(x => x.startsWith('helyesírás '));
  try {
    const { remember } = await import('./memory-manager.js');
    // ⚠️ STABIL KULCS (2026-08-29). A lecke szövegében VÁLTOZÓ adat van (napi
    // darabszám + példa), a dedup viszont a pontos szövegre ment — ezért ez a
    // két lecke naponta ÚJ emléket gyártott a meglévő megerősítése helyett.
    // Élesben mérve: 12 db „Csempe-szabály emlékeztető", ÖSSZESEN 0 repeats.
    // A memória hízott, a ♻️ „ismétlődő hiba" riport-sor pedig SOHA nem tüzelt
    // rájuk — pedig pont ezek ismétlődtek. A kulccsal egy emlék marad, a
    // szövege frissül, és a `repeats` végre a valóságot mutatja.
    if (chipFixes.length) {
      remember('shared', `Csempe-szabály emlékeztető: a tool mindig a legrövidebb hivatalos terméknév (ma ${chipFixes.length} javítás kellett, pl. ${chipFixes[0].slice(0, 60)}).`,
        { kulcs: 'csempe-szabaly', rutin: true });
    }
    if (spellFixes.length) {
      remember('shared', `Amerikai helyesírás: ma ${spellFixes.length} cikkben kellett gépi javítás (color, organize, center — NEM colour/organise/centre). Írás közben mindjárt amerikaiul írd.`,
        { kulcs: 'amerikai-helyesiras', rutin: true });
    }
  } catch { /* tanulság nélkül is megy */ }
  logFixes(fixes);
  return fixes;
}

// Közvetlen futtatás:  node core/quality-guard.js --fix
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--fix')) {
    const fixes = await applyQualityFixes();
    for (const x of fixes) console.log('🔧 ' + x);
    console.log(fixes.length ? `🔧 önjavító: ${fixes.length} hiba KIJAVÍTVA` : '✅ önjavító: nincs javítanivaló');
  }
  const left = qualityFindings();
  for (const x of left) console.log('⚠️  ' + x);
  console.log(left.length ? `⚠️  ${left.length} találat maradt — ehhez ember/AI kell` : '✅ minőség-őr: minden tiszta');
  process.exit(0);
}
