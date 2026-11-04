// ===================================================================
// TESZT — CI: kap-e minden lépés annyi kulcsot, amennyit a kódja olvas?
// ===================================================================
// INGYENES, hálózat nélküli. Csak SZÖVEGET olvas: az `auto.yml`-t és a
// belépési pontok forrását. Semmit nem importál és nem futtat.
//
// MIÉRT LÉTEZIK (2026-09-06, 12 napos kiesés gyökéroka):
// A Házmester CI-lépésének NEM VOLT `env:` blokkja. A `core/housekeeping.js`
// viszont beágyazás-próbát futtatott — az kulcs híján MINDIG elhasalt —, és
// ebből azt a következtetést vonta le, hogy „a szolgáltatás halott", majd
// LETÖRÖLTE az összes vektort. Ugyanabban a futásban, amelyik létrehozta
// őket. Napi háromszor, 12 napon át.
//
// 🔑 A TANULSÁG ÁLTALÁNOS: egy lépés, amelynek a kódja olyan kulcsot olvas,
// amit a lépés nem ad meg, ÚGY VISELKEDIK, MINTHA AZ EGÉSZ KÜLSŐ
// SZOLGÁLTATÁS HALOTT VOLNA. És mivel helyben a `dotenv` betölti a `.env`-et,
// ez a hiba KIZÁRÓLAG a CI-ban jelentkezik — ahol senki nem nézi.
//
// ⚠️ EZ AZ ŐR CSAK A KÖZVETLEN OLVASÁSOKAT LÁTJA (`process.env.X` a belépési
// pont saját fájljában). Az importlánc mélyén lévő olvasásokat NEM — azokat
// csak átnézéssel lehet megtalálni. A hiányzó fedezet bevallva jobb, mint egy
// őr, amiről azt hisszük, mindent lát.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ⚠️ `fileURLToPath`, NEM `.pathname` — Windowson az utóbbi „/C:/AI%20work/…"
// alakot ad, és az `existsSync` némán hamisat mondana rá.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const YML = join(ROOT, '.github', 'workflows', 'auto.yml');

let pass = 0, bukott = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log('  ✅ ' + name); }
  catch (e) { bukott++; console.log('  ❌ ' + name + '\n     ' + String(e.message).split('\n')[0]); }
};

console.log('🧪 CI env-fedezet — kap-e minden lépés annyi kulcsot, amennyit olvas\n');

// ===================================================================
// SZÁNDÉKOS KIVÉTELEK — a parancs TELJES szövegére kulcsolva
// ===================================================================
// Azért a parancsra és nem a fájlra, mert ugyanaz a fájl két lépésben más
// szerepet játszik: a `reel-post.js --send` KAPJA a webhookot, a `--prepare`
// nem kapja, és ez így helyes. Fájlra kulcsolt kivétel mindkettőt legyengítené.
const KIVETELEK = {
  'node core/reel-post.js --prepare': {
    MAKE_REEL_WEBHOOK_URL:
      'a --prepare csak előkészít, nem küld; a webhook a --send lépésé. '
      + 'A modul maga is így dönt (core/reel-post.js:138-142).'
  },
  'node core/quality-guard.js --fix': {
    NAME_GUARD_PATH:
      'TESZT-útvonal felülírás, hogy a tesztek ne az ÉLES memory/name-guard.json-t '
      + 'írják. Élesben szándékosan üres — az alapértelmezés a helyes.',
    SLUG_GUARD_ARTICLES_DIR:
      'TESZT-mappa felülírás a slug-ütközés-őr bekötés-tesztjéhez '
      + '(core/slug-collisions.test.js). Élesben szándékosan üres — az őr a '
      + 'content/articles-t nézi, ahogy kell.'
  },
  'node agents/designer/agent.js --refresh 8': {
    GOOGLE_API_KEY:
      'HOLT ÁG: a Gemini-képgyártót a user 2026-07-22-én kivezette („nem fizetek '
      + 'a Geminiért"), a viaGemini nincs benne az IMAGE_BACKENDS-ben. A helyes '
      + 'javítás a kód törlése, nem a titok hozzáadása.'
  }
};

/** Az `auto.yml` lépései: név, a futtatott parancs, és a megadott env-kulcsok. */
function lepesek() {
  const sorok = readFileSync(YML, 'utf-8').split(/\r?\n/);
  const hatarok = [];
  for (let i = 0; i < sorok.length; i++) if (/^ {6}- name:/.test(sorok[i])) hatarok.push(i);
  hatarok.push(sorok.length);

  const ki = [];
  for (let k = 0; k < hatarok.length - 1; k++) {
    const blokk = sorok.slice(hatarok[k], hatarok[k + 1]);
    const szoveg = blokk.join('\n');
    const fut = szoveg.match(/run:\s*(.+)/);
    if (!fut) continue;
    // A `|| true` és a sortörés nem része a parancsnak.
    const parancs = fut[1].replace(/\s*\|\|\s*true\s*$/, '').trim();
    ki.push({
      nev: blokk[0].replace(/^ {6}- name:\s*/, '').trim(),
      parancs,
      // Csak a nagybetűs kulcsok jönnek szóba; ezek kizárólag env-blokkban élnek.
      env: new Set((szoveg.match(/^\s+([A-Z_][A-Z0-9_]*):/gm) || [])
        .map(x => x.trim().replace(':', '')))
    });
  }
  return ki;
}

/** A belépési pont SAJÁT fájljában olvasott env-változók. */
function olvasottKulcsok(parancs) {
  const m = parancs.match(/node\s+([\w./-]+\.js)/);
  if (!m) return null;
  const ut = join(ROOT, m[1]);
  if (!existsSync(ut)) return null;
  // ⚠️ `fs`-sel olvassuk. Importálni TILOS: 25 agentből 21 a fájl végén
  // feltétel nélkül hívja a `main()`-t — a puszta import pénzt költ és publikál.
  const forras = readFileSync(ut, 'utf-8');
  return [...new Set((forras.match(/process\.env\.[A-Z_][A-Z0-9_]*/g) || [])
    .map(x => x.slice('process.env.'.length)))];
}

// ===================================================================
t('🔑 minden lépés megkapja a saját kódja által olvasott kulcsokat', () => {
  const hianyok = [];
  for (const l of lepesek()) {
    const olvas = olvasottKulcsok(l.parancs);
    if (!olvas) continue;
    const mentes = KIVETELEK[l.parancs] || {};
    for (const v of olvas) {
      if (l.env.has(v) || mentes[v]) continue;
      hianyok.push(`${l.nev}  →  ${v}`);
    }
  }
  assert.deepEqual(hianyok, [],
    'CI-lépés olvas olyan kulcsot, amit nem kap meg — a kód így úgy viselkedik, '
    + 'mintha a szolgáltatás halott lenne:\n     ' + hianyok.join('\n     '));
});

t('⚠️ a mérőeszköz TÉNYLEG lát lépéseket (különben a zöld semmit nem ér)', () => {
  // Ha az `auto.yml` formázása megváltozik, a fenti minta 0 lépést találhat,
  // és a teszt ATTÓL lenne zöld, hogy nem nézett meg semmit. Ez pontosan az
  // a hiba, amit a projekt „a mérést előbb gyanúsítsd" szabálya üldöz.
  const mind = lepesek();
  assert.ok(mind.length >= 25, 'csak ' + mind.length + ' lépést talált — romlott a minta');
  const kodot = mind.filter(l => olvasottKulcsok(l.parancs));
  assert.ok(kodot.length >= 15,
    'csak ' + kodot.length + ' lépéshez talált forrást — romlott a minta');
  // KIMÉRVE 2026-09-07-én: 7 lépés olvas KÖZVETLENÜL env-et. A küszöb eggyel
  // alatta van, hogy egy lépés jogos megszűnése ne buktassa el a tesztet —
  // a minta elromlása viszont 0-ra vinné, és azt elkapja.
  const kulcsot = kodot.filter(l => olvasottKulcsok(l.parancs).length > 0);
  assert.ok(kulcsot.length >= 6,
    'csak ' + kulcsot.length + ' lépés olvas env-et — romlott a minta');
});

t('a kivétel-lista minden tétele VALÓDI lépésre és VALÓDI olvasásra mutat', () => {
  // Egy kivétel, ami már nem illik semmire, néma engedély marad a jövőnek.
  const parancsok = new Set(lepesek().map(l => l.parancs));
  for (const [parancs, vars] of Object.entries(KIVETELEK)) {
    assert.ok(parancsok.has(parancs), 'elavult kivétel — nincs ilyen lépés: ' + parancs);
    const olvas = olvasottKulcsok(parancs) || [];
    for (const v of Object.keys(vars)) {
      assert.ok(olvas.includes(v),
        `elavult kivétel: a(z) ${parancs} már nem olvassa a ${v}-t`);
    }
  }
});

t('🔑 a napi jelentés megkapja az ügyfélszolgálati kulcsot', () => {
  // Értéket rögzítő teszt. A fenti általános szabály önmagában eltűnne, ha
  // valaki kivételt írna rá — EZ a sor a SZÁNDÉKOT őrzi: a „kézbesítetlen
  // kapcsolat-üzenet" riasztás (2026-08-29) pontosan azért készült, hogy egy
  // elveszett látogatói üzenet ne maradhasson láthatatlan. 2026-09-07-ig
  // NÉMA VOLT, mert a kulcs csak a HETI riport lépésére került rá.
  const l = lepesek().find(x => x.parancs.includes('core/daily-report.js'));
  assert.ok(l, 'nincs napi jelentés lépés');
  assert.ok(l.env.has('FEEDBACK_EXPORT_KEY'),
    'a napi jelentés nem kapja meg a FEEDBACK_EXPORT_KEY-t — az ügyfélszolgálati '
    + 'számok ÉS a kézbesítetlen üzenetek riasztása némán kimarad');
});

console.log(`\n${bukott === 0 ? '✅' : '❌'} ci-env-guard.test: ${pass} rendben, ${bukott} bukott`);
process.exit(bukott === 0 ? 0 : 1);
