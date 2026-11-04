// 🗣️ Megszólítás-vadász pontosítása (2026-10-29: 53 jelzés 17 nap alatt, szinte mind téves). Ingyenes.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { megszolitasJelek } from './megszolitas.js';
import { chromePhraseHits } from './ui-phrases.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };

console.log('\n🧪 megszolitas');

t('🎯 a valódi téves riasztás (Alexa-útmutató) már nem jelez', () => {
  const hu = JSON.parse(readFileSync(join(ROOT, 'content', 'translations', 'ARTICLE_GUIDE_how-to-set-up-a-shared-family-grocery-list-in-alexa-anyone-c.json'), 'utf-8')).hu;
  assert.ok(megszolitasJelek(hu.toLowerCase(), 'hu').length < 2, 'még mindig riaszt: ' + megszolitasJelek(hu.toLowerCase(), 'hu'));
});

t('🙅 harmadik személy („hogy nyissa meg”) és szórészlet („megnyisson”) nem számít', () => {
  assert.deepEqual(megszolitasJelek('kérj meg egy családtagot, hogy nyissa meg az appot, és senkinek nem kell megnyisson semmit', 'hu'), []);
  assert.deepEqual(megszolitasJelek('pídele que seleccione la opción', 'es'), []);
});

t('🚨 a valódi magázás továbbra is jelez (2 jel = riasztás)', () => {
  assert.deepEqual(megszolitasJelek('Kattintson a gombra, majd válassza ki a fájlt.', 'hu'), ['kattintson', 'válassza ki']);
  assert.equal(megszolitasJelek('Haga clic en el botón y seleccione el archivo.', 'es').length, 2);
  assert.deepEqual(megszolitasJelek('Kattints a gombra, majd válaszd ki a fájlt.', 'hu'), [], 'a tegezés nem jelez');
});

t('📚 a VALÓDI fordításokban jelenleg egyik sem éri el a riasztási küszöböt', () => {
  const d = join(ROOT, 'content', 'translations');
  const rossz = [];
  for (const f of readdirSync(d).filter(x => x.endsWith('.json'))) {
    let tr; try { tr = JSON.parse(readFileSync(join(d, f), 'utf-8')); } catch { continue; }
    for (const l of ['hu', 'es']) if (typeof tr[l] === 'string' && megszolitasJelek(tr[l].toLowerCase(), l).length >= 2) rossz.push(`${l} ${f}`);
  }
  assert.deepEqual(rossz, []);
});

t('🔌 a website/check-i18n.js ezt a modult használja (nem a régi includes-számlálást)', () => {
  const src = readFileSync(join(ROOT, 'website', 'check-i18n.js'), 'utf-8');
  assert.match(src, /megszolitasJelek\(text, lang\)\.length/);
  assert.doesNotMatch(src, /marks\.filter\(w => text\.includes\(w\)\)/);
});

t('🔘 félkövér idegen gombnév (**Try it now**) idézettnek számít az i18n-őrben, nem angol feliratnak', () => {
  const src = readFileSync(join(ROOT, 'website', 'check-i18n.js'), 'utf-8');
  assert.ok(src.includes(".replace(/<strong>([^<]{1,40})<\\/strong>/gi, '“$1”')"), 'nincs félkövér→idézőjel csere a visibleText-ben');
  const rx = /<strong>([^<]{1,40})<\/strong>/gi;   // ugyanaz, mint a check-i18n.js-ben (a fenti sor őrzi)
  const szoveg = 'keresd a <strong>Playground</strong> vagy <strong>Try it now</strong> (Próbáld ki) feliratú részt'.replace(rx, '“$1”').replace(/<[^>]+>/g, ' ');
  assert.deepEqual(chromePhraseHits(szoveg.toLowerCase(), ['try it now']), [], 'a félkövér gombnév még mindig riaszt');
  assert.deepEqual(chromePhraseHits('nyomd meg: try it now', ['try it now']), ['try it now'], 'a valódi angol felirat ne tűnjön el');
});

if (hiba) { console.log(`\n❌ megszolitas.test: ${hiba} hiba`); process.exit(1); }
console.log('✅ megszolitas.test: mind rendben');
