// ===================================================================
// I18N-ŐRSZEM — angol maradványok vadászata a NEM-ANGOL oldalakon
// ===================================================================
//
// A user kérése (2026-07-06): "erre is figyeljünk oda" — ne kézzel kelljen
// kiszúrni az angolul maradt felirat-darabokat. A build UTÁN fut:
//
//   1) FELÜLET-SZÖVEG LISTA: ismert angol UI-frázisok, amiknek nem-EN
//      oldalon SOHA nem szabad látszaniuk (címkék, gombok, szekció-címek).
//   2) TARTALOM-SZKEN: minden nem-EN cikk-oldal látható szövegében angol
//      funkciószavakat számol — magas találat = fordítatlan (EN-fallback)
//      tartalom csúszott ki az adott nyelven.
//
// Csak FIGYELMEZTET (exit 0) — a deployt nem dönti el, de a naplóban
// hangosan látszik. FUTTATÁS: node website/check-i18n.js  (build után!)
// ===================================================================

import { readFileSync, readdirSync, existsSync, writeFileSync } from 'fs';
import { chromePhraseHits, decodeEntities } from '../core/ui-phrases.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'public');
const LANGS = ['hu', 'es'];   // 2026-07-31: de/fr kivezetve (0 látogató)

// 1) Tiltott angol UI-frázisok nem-EN oldalon (kisbetűsítve hasonlítjuk).
//    Szándékosan NEM szerepel: márkanevek, "AI", eszköznevek.
const CHROME_PHRASES = [
  // 'beginner/intermediate/advanced' SZÁNDÉKOSAN nincs itt: a "Gemini Advanced"
  // és társai márkanevek — hamis riasztást adnának (a szint-címke tr()-rel megy).
  'step-by-step guide',
  'min read', 'try typing this', 'for everyone', 'coming soon',
  'support us', 'back to all stories', 'everyday guides', 'what this means for you',
  'common mistakes', 'before you start', 'try it now', 'your roadmap',
  'past 7 days', 'yesterday', 'for everyday people', 'read the full guide',
  'want to try it', 'what prompted this guide', 'issue no'
];

// 2) Angol funkciószavak a fordítatlan-tartalom felismeréshez
const EN_RX = /\b(the|and|with|your|you|for|this|that|how to|what|when|from|will|can)\b/gi;
const BODY_THRESHOLD = 30;   // ennyi találat felett szinte biztos EN-fallback

function visibleText(html) {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    // Az IDÉZŐJELEKET meg kell őrizni (decodeEntities már visszaadta őket):
    // enélkül nem dönthető el, hogy egy angol frázis idézett GOMBNÉV-e vagy a
    // mi lefordítatlan feliratunk. 2026-08-11-ig ez a sor minden entitást
    // szóközre cserélt, és a „Try it now&quot; így vesztette el a záróját.
    .replace(/&(?:[a-z]+|#\d+);/gi, ' ');
}

// A FORDÍTATLAN-SZKEN CSAK A SAJÁT PRÓZÁNKAT NÉZHETI (2026-08-01).
// Az útmutatókban a 💬 példadobozok (.g-prompt), a kód- és idézetblokkok
// SZÁNDÉKOSAN angolok: bemásolható promptok, képernyőn megjelenő gomb-
// feliratok ("Try Copilot for free"), README-részletek. Egy prompt attól
// prompt, hogy SZÓ SZERINT az van benne, amit a felhasználó begépel.
//
// MIÉRT SZÜLETETT: az őrszem 4 TÖKÉLETESEN lefordított cikkre riasztott
// (hu ×1, es ×3). Mérve: a próza 0 angol jelet tartalmazott, a találatok
// 100%-a a példadobozokból jött. A javítás NEM a küszöb emelése volt —
// az a valódi EN-fallbackot is elrejtené —, hanem a mérés szűkítése arra,
// amiről a jelzés valójában szól. Egy igazi fallbacknál a próza maga
// angol, ott a 30-as küszöb bőven megmarad (több száz találat).
// HORGONY: <article>…</article>. NEM .article__body — az útmutató-oldalakon
// az az osztály CSAK a CSS-ben létezik, a törzs máshogy épül fel. (Egyszer
// már megvezetett: a nem illeszkedő regex üres stringet ad, abban meg 0 a
// találat — ami "bizonyítéknak" látszik, pedig csak a mérés hibája.)
function proseText(html) {
  const body = (html.match(/<article[\s>][\s\S]*?<\/article>/i) || [])[0] || html;
  return visibleText(
    body
      .replace(/<div class="g-prompt">[\s\S]*?<\/div>/gi, ' ')          // 💬 példadoboz (lapos: csak span-ok)
      .replace(/<(code|pre|blockquote)[^>]*>[\s\S]*?<\/\1>/gi, ' ')     // kód, parancs, idézet
  )
    // IDÉZETT SZÖVEG: „Írd ezt: »Turn these messy notes into…«" — a prompt
    // egy része nem dobozban, hanem a mondaton BELÜL, idézőjelben szerepel.
    // Az idézet definíció szerint szó szerinti, tehát nem fordítandó; egy
    // valódi EN-fallback viszont idézőjeleken KÍVÜL angol, úgyhogy ez a
    // kivétel nem rejt el valódi hibát.
    .replace(/[“”„"«»][^“”„"«»]{10,}[“”„"«»]/g, ' ')
    .toLowerCase();
}

let chromeHits = 0, bodyHits = 0;

// A LELETEK a napi riportnak (2026-08-10). Eddig ez az őrszem CSAK a konzolra
// írt — és 2026-08-09-én pontosan azt látta, amit látnia kellett: a magyar
// heti összefoglaló 161 angol jellel ment ki. A jelzés a CI naplójában maradt,
// oda pedig senki nem néz; a hibát végül a user vette észre az oldalon.
// A többi őrszem (seo-guard, live-guard) régóta állapotfájlt ír, és a riport
// beolvassa — ez az egy maradt ki, épp az, amelyiknek a területe volt.
const problems = [];

for (const lang of LANGS) {
  const base = join(OUT, lang);
  if (!existsSync(base)) continue;

  // --- 1) felület-frázisok a fő oldalakon + cikkeken ---
  const pages = ['index.html', 'guides.html', 'tools.html', 'support.html']
    .map(f => join(base, f)).filter(existsSync);
  const artDir = join(base, 'article');
  const articles = existsSync(artDir) ? readdirSync(artDir).map(f => join(artDir, f)) : [];

  for (const p of [...pages, ...articles]) {
    const raw = readFileSync(p, 'utf-8');
    const text = visibleText(raw).toLowerCase();
    const short = p.replace(OUT, '').replace(/\\/g, '/');

    // A szóhatár-kezelés és az IDÉZETT gombnevek kihagyása: core/ui-phrases.js
    // (2026-08-11: a "Try it now" idézőjelben egy idegen termék gombjának a
    // neve — épp hogy nem szabad lefordítani.)
    for (const phrase of chromePhraseHits(text, CHROME_PHRASES)) {
      console.log(`⚠️  [${lang}] ANGOL FELIRAT: "${phrase}" — ${short}`);
      chromeHits++;
      problems.push({ code: 'ANGOL_FELIRAT', lang, page: short, detail: phrase });
    }

    // --- 2) fordítatlan tartalom (csak cikkeken számoljuk) ---
    if (p.includes('article')) {
      const hits = (proseText(raw).match(EN_RX) || []).length;   // példadobozok NÉLKÜL — lásd proseText()
      if (hits >= BODY_THRESHOLD) {
        console.log(`⚠️  [${lang}] FORDÍTATLAN TARTALOM GYANÚ (${hits} angol jel): ${short}`);
        bodyHits++;
        // Ez a legdrágább lelet: egy TELJES cikk ment ki idegen nyelven.
        problems.push({ code: 'FORDITATLAN_CIKK', lang, page: short, detail: `${hits} angol jel` });
      }
      // --- 2b) MEGSZÓLÍTÁS-VADÁSZ (2026-07-14): a márka-norma hu=tegezés,
      // de=du, es=tú, fr=vous — az ettől eltérő megszólítás stílustörés.
      // Küszöb 2, hogy egy véletlen szóalak ne riasszon. (User szúrta ki a
      // Roosevelt-cikkben; a fordító-prompt azóta előírja, ez a védőháló.)
      const FORMALITY = {
        // 'hozzon létre'/'adja meg' SZÁNDÉKOSAN nincs itt: 3. személyben az
        // AI-ra is vonatkozhat ("kérd meg, hogy hozzon létre...") — álriasztás.
        hu: ['kattintson', 'nyissa meg', 'jelentkezzen be', 'írja be', 'válassza ki', 'nyisson'],
        es: ['haga clic', 'inicie sesión', 'seleccione', 'escriba su', 'abra su', 'pulse '],
      };
      const marks = FORMALITY[lang] || [];
      const mHits = marks.filter(w => text.includes(w)).length;
      if (mHits >= 2) {
        console.log(`⚠️  [${lang}] MEGSZÓLÍTÁS-TÖRÉS GYANÚ (${mHits} jel — norma: hu=tegezés/de=du/es=tú/fr=vous): ${short}`);
        chromeHits++;
        problems.push({ code: 'MEGSZOLITAS_TORES', lang, page: short, detail: `${mHits} jel` });
        // A Fordító SAJÁT leckéje (stabil szöveg nyelvenkénti változatban,
        // ismétlődésnél erősödik — 2026-07-16, "külön memória minden agentnek")
        try {
          const { remember } = await import('../core/memory-manager.js');
          remember('translator', `[${lang}] Megszólítás-törés szökött át a kész oldalra — a norma (hu=tegezés, de=du, es=tú, fr=vous) KÖTELEZŐ, cikken belül keverni tilos.`, { tags: ['formality'] });
        } catch { /* az őrszem hibája nem állítja meg a buildet */ }
      }
    }
  }
}

// 3) MINŐSÉG-ŐR (2026-07-12): chip-szabályok + duplikált hivatalos linkek —
//    a korábban kézzel futtatott ellenőrzések beépítve ("tudja a cégünk").
let qualityHits = 0;
try {
  const { qualityFindings } = await import('../core/quality-guard.js');
  const findings = qualityFindings();
  for (const f of findings) console.log('⚠️  [minőség-őr] ' + f);
  qualityHits = findings.length;
} catch (e) { console.log('⚠️  minőség-őr nem futott: ' + e.message.slice(0, 60)); }

// A LELETEK LEÍRÁSA A NAPI RIPORTNAK (2026-08-10).
// Ugyanaz a szerződés, mint a seo-guard/live-guard esetében: { at, problems }.
// A riport ebből szólal meg — a CI naplója nem jut el senkihez.
try {
  const STATE = join(__dirname, '..', 'memory', 'i18n-guard.json');
  writeFileSync(STATE, JSON.stringify({ at: new Date().toISOString(), problems }, null, 2), 'utf-8');
} catch { /* az őrszem könyvelése ne állítsa meg a pipeline-t */ }

console.log('─'.repeat(60));
if (chromeHits + bodyHits + qualityHits === 0) {
  console.log('✅ i18n-őrszem + minőség-őr: nem találtam hibát (angol maradvány, chip-szabály, duplikált link).');
} else {
  console.log(`🚨 őrszem: ${chromeHits} felület-folt + ${bodyHits} fordítatlan-gyanús + ${qualityHits} minőség-találat — javítandó!`);
}
process.exit(0);   // csak figyelmeztet, a pipeline megy tovább
