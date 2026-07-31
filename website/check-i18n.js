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

import { readFileSync, readdirSync, existsSync } from 'fs';
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
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ');
}

let chromeHits = 0, bodyHits = 0;

for (const lang of LANGS) {
  const base = join(OUT, lang);
  if (!existsSync(base)) continue;

  // --- 1) felület-frázisok a fő oldalakon + cikkeken ---
  const pages = ['index.html', 'guides.html', 'tools.html', 'support.html']
    .map(f => join(base, f)).filter(existsSync);
  const artDir = join(base, 'article');
  const articles = existsSync(artDir) ? readdirSync(artDir).map(f => join(artDir, f)) : [];

  for (const p of [...pages, ...articles]) {
    const text = visibleText(readFileSync(p, 'utf-8')).toLowerCase();
    const short = p.replace(OUT, '').replace(/\\/g, '/');

    for (const phrase of CHROME_PHRASES) {
      // szóhatárral, hogy pl. a német "advanced..." összetételekre ne ugorjon rá
      // (?<![a-z#]) — a #hashtag-címkék (pl. #advanced) nem számítanak feliratnak
      const rx = new RegExp('(?<![a-z#])' + phrase.replace(/[-\s]/g, '[-\\s]') + '(?![a-z])', 'i');
      if (rx.test(text)) {
        console.log(`⚠️  [${lang}] ANGOL FELIRAT: "${phrase}" — ${short}`);
        chromeHits++;
      }
    }

    // --- 2) fordítatlan tartalom (csak cikkeken számoljuk) ---
    if (p.includes('article')) {
      const hits = (text.match(EN_RX) || []).length;
      if (hits >= BODY_THRESHOLD) {
        console.log(`⚠️  [${lang}] FORDÍTATLAN TARTALOM GYANÚ (${hits} angol jel): ${short}`);
        bodyHits++;
      }
      // --- 2b) MEGSZÓLÍTÁS-VADÁSZ (2026-07-14): a márka-norma hu=tegezés,
      // de=du, es=tú, fr=vous — az ettől eltérő megszólítás stílustörés.
      // Küszöb 2, hogy egy véletlen szóalak ne riasszon. (User szúrta ki a
      // Roosevelt-cikkben; a fordító-prompt azóta előírja, ez a védőháló.)
      const FORMALITY = {
        // 'hozzon létre'/'adja meg' SZÁNDÉKOSAN nincs itt: 3. személyben az
        // AI-ra is vonatkozhat ("kérd meg, hogy hozzon létre...") — álriasztás.
        hu: ['kattintson', 'nyissa meg', 'jelentkezzen be', 'írja be', 'válassza ki', 'nyisson'],
        de: ['klicken sie', 'öffnen sie', 'geben sie', 'erstellen sie', 'wählen sie', 'melden sie sich', 'tippen sie'],
        es: ['haga clic', 'inicie sesión', 'seleccione', 'escriba su', 'abra su', 'pulse '],
        fr: ['tu peux', 'ton compte', 'clique sur', 'ta première']
      };
      const marks = FORMALITY[lang] || [];
      const mHits = marks.filter(w => text.includes(w)).length;
      if (mHits >= 2) {
        console.log(`⚠️  [${lang}] MEGSZÓLÍTÁS-TÖRÉS GYANÚ (${mHits} jel — norma: hu=tegezés/de=du/es=tú/fr=vous): ${short}`);
        chromeHits++;
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

console.log('─'.repeat(60));
if (chromeHits + bodyHits + qualityHits === 0) {
  console.log('✅ i18n-őrszem + minőség-őr: nem találtam hibát (angol maradvány, chip-szabály, duplikált link).');
} else {
  console.log(`🚨 őrszem: ${chromeHits} felület-folt + ${bodyHits} fordítatlan-gyanús + ${qualityHits} minőség-találat — javítandó!`);
}
process.exit(0);   // csak figyelmeztet, a pipeline megy tovább
