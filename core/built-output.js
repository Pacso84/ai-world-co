// ===================================================================
// A KIÉPÍTETT KIMENET FRISSESSÉGE (2026-09-12)
// ===================================================================
// MIÉRT SZÜLETETT: több teszt a `website/public/` kiépített lapjain ellenőriz
// (paritás-őr, szövegbeli linkek, „In short"-doboz, közép-doboz). Kiderült,
// hogy ezek SEHOL nem láttak friss kimenetet:
//   • a CI-ban a „Tesztek" lépés a BUILD ELŐTT fut, a `website/public/` pedig
//     gitignore-os → a mappa nem létezik → minden kimenet-teszt „kihagyva",
//     és a futás „96/96 zöld"-et jelentett;
//   • helyben a mappa egy 2026-09-09-i, BEFAGYOTT build — a kimenet-tesztek
//     három napos adaton adtak zöldet, miközben a kód azóta többször változott.
// A projekt ismert hibamintája: a „nem látott semmit" és a „minden rendben"
// kívülről egyformán néz ki.
//
// EZ A MODUL egyetlen kérdésre felel: a helyi kimenet tükrözi-e a MAI kódot?
// Ha a kimenetet előállító forrásfájlok bármelyike ÚJABB a kimenetnél, a
// kimenet elavult, és a rajta futó állítás hamis biztonságot adna.
//
// ⚠️ A valódi, friss ellenőrzés NEM itt történik, hanem a CI-ban a build UTÁN:
// `core/output-guard.js` → `memory/output-guard.json` → napi riport.
// ===================================================================

import { existsSync, statSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Mely forrásfájlokból készül a kimenet? A build.js-ből OLVASSUK ki a
 * `../core/*.js` importokat, így a lista magától követi a változást.
 */
export function kimenetForrasai(root) {
  const lista = ['website/build.js', 'website/assets/style.css'];
  try {
    const src = readFileSync(join(root, 'website', 'build.js'), 'utf-8');
    for (const m of src.matchAll(/from '\.\.\/core\/([\w.-]+\.js)'/g)) lista.push('core/' + m[1]);
  } catch { /* a build.js hiánya: a két alapfájl marad */ }
  return [...new Set(lista)];
}

/**
 * Használható-e a helyi kiépített kimenet ellenőrzésre?
 * @param {string} root
 * @param {object} [o]
 * @param {string} [o.pubDir]   kifejezetten megadott mappa (pl. mutációs teszt
 *                              másolata) — ilyenkor a hívó felel a frissességért
 * @param {Function} [o.mtimeFn] injektálható a teszthez
 * @returns {{ hasznalhato: boolean, pub: string, ok: string, ujabb?: string[] }}
 */
export function kimenetAllapot(root, { pubDir = null, mtimeFn = (p) => statSync(p).mtimeMs } = {}) {
  if (pubDir) {
    return existsSync(pubDir)
      ? { hasznalhato: true, pub: pubDir, ok: 'kifejezetten megadott mappa' }
      : { hasznalhato: false, pub: pubDir, ok: 'a megadott mappa nem létezik' };
  }
  const pub = join(root, 'website', 'public', 'article');
  const jel = join(root, 'website', 'public', 'index.html');
  if (!existsSync(pub) || !existsSync(jel)) {
    return { hasznalhato: false, pub, ok: 'nincs kiépített kimenet (a CI-ban a tesztek a build ELŐTT futnak)' };
  }
  let kor;
  try { kor = mtimeFn(jel); } catch { return { hasznalhato: false, pub, ok: 'a kimenet kora nem olvasható' }; }
  const ujabb = kimenetForrasai(root).filter(f => {
    try { return mtimeFn(join(root, f)) > kor; } catch { return false; }
  });
  if (ujabb.length) {
    return {
      hasznalhato: false, pub, ujabb,
      ok: 'a helyi kimenet ELAVULT — azóta változott: ' + ujabb.slice(0, 3).join(', ') + (ujabb.length > 3 ? ' …' : '')
    };
  }
  return { hasznalhato: true, pub, ok: 'friss' };
}
