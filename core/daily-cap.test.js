// ===================================================================
// TESZT — a napi kiadási keret (hír + útmutató)
// ===================================================================
// INGYENES, hálózat nélküli: csak a `config.json`-t és a `core/`-t olvassa.
//
// MIÉRT VAN EZ A FÁJL (2026-09-08, user-döntés)
// ─────────────────────────────────────────────
// A user vette észre, hogy se a Google-től, se a Bingről nincs kattintás.
// A mérés pontos napot adott: a Bing **2026-08-21-én** napi 38-76
// megjelenésről PONTOSAN nullára esett, és azóta ott is maradt — miközben az
// indexe 785-ről 1415-re NŐTT és a feltérképezés zavartalan (napi 113 oldal,
// 0 robots-tiltás). Vagyis a Bing indexel, de NEM SZOLGÁL KI.
//
// Bizonyítva: négy oldal, amit a Bing MAGA hozott a 4-8. helyen három héttel
// korábban, ma egyik sem jön vissza a SAJÁT, szó szerinti mondatára — pedig a
// kontroll (egy Wikipédia-mondat) visszahozza a Wikipédiát, tehát a mérőeszköz
// működik. A Google ugyanezt lassabban csinálja: 2067 „feltérképezve — nincs
// indexelve", NÖVEKVŐ trenddel.
//
// A technikai réteg TISZTA (robots, canonical, hreflang, 200-as válaszok,
// nincs cloaking) — ez nem kóddal javítható hiba. A legvalószínűbb ok a
// tömeges gépi tartalom egy 3 bejövő linkes domainen: napi 10,2 új cikk,
// mindegyik két nyelvre fordítva → napi ~30 új URL, összesen 2808 beküldve.
//
// A USER DÖNTÉSE: kevesebb új cikk naponta.
//
// ⚠️ AMIÉRT EZ BIZTONSÁGOS — KIMÉRVE, NEM FELTÉTELEZVE
// A forgalom 82%-a Facebookról jön, tehát a félelem jogos: nem esik-e vissza
// a posztolás? NEM. A `selectSocialBatch()` NÉGY szinten tölt fel, és a 3-4.
// lépés kimondottan azért van ott, hogy „maradék hely ne veszhessen el": ha
// kevés a friss, a 424 ÖRÖKZÖLD ÚTMUTATÓ tölti be a helyeket. Egyetlen kör
// sem megy ki félig üresen. Ráadásul már 2026-08-04-én kimértük, hogy TÖBB
// POSZT ≠ TÖBB LÁTOGATÓ (a korreláció 0,30, a minta fordított).
// ===================================================================

import assert from 'assert/strict';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { selectSocialBatch, DRAIN_SLOT_FROM } from './social-queue.js';

// ⚠️ `fileURLToPath`, NEM `.pathname` — Windowson az utóbbi „/C:/AI%20work/…"
// alakot ad, és az `existsSync`/`readFileSync` némán elhasalna rajta.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf-8'));

let pass = 0, bukott = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log('  ✅ ' + name); }
  catch (e) { bukott++; console.log('  ❌ ' + name + '\n     ' + String(e.message).split('\n')[0]); }
};

console.log('🧪 napi kiadási keret — a 2026-09-08-i visszavétel\n');

/** A keretek a config fájában bárhol lehetnek — megkeressük őket név szerint. */
function keret(nev) {
  let talalt;
  (function jar(o) {
    if (!o || typeof o !== 'object' || talalt !== undefined) return;
    if (Object.prototype.hasOwnProperty.call(o, nev)) { talalt = o[nev]; return; }
    for (const v of Object.values(o)) jar(v);
  })(cfg);
  return talalt;
}

t('🔑 a HÍR napi kerete 4 (a korábbi 8 feleződött)', () => {
  assert.equal(keret('daily_articles_max'), 4,
    'a hír-keret elmozdult a 2026-09-08-i user-döntéstől');
});

t('🔑 az ÚTMUTATÓ napi kerete 2 (a korábbi 4 feleződött)', () => {
  assert.equal(keret('daily_guides_max'), 2,
    'az útmutató-keret elmozdult a 2026-09-08-i user-döntéstől');
});

t('a kettő EGYÜTT legfeljebb napi 6 új oldal', () => {
  // Ez a szám a lényeg, nem a két tag külön: három nyelven ez napi ~18 új URL
  // a korábbi ~30 helyett. Ha valaki az egyiket emeli, itt bukik el.
  const ossz = keret('daily_articles_max') + keret('daily_guides_max');
  assert.ok(ossz <= 6, 'a napi össz-keret ' + ossz + ' — a visszavétel elolvadt');
});

t('⚠️ a keret nem csúszhat vissza észrevétlenül FELFELÉ', () => {
  // Irány-őr. A projekt kemény tanulsága: „minden mérce IRÁNYA számít."
  // Lefelé szabad mozdulni (az a döntés szellemében van), felfelé nem.
  assert.ok(keret('daily_articles_max') <= 4 && keret('daily_guides_max') <= 2,
    'valaki MEGEMELTE a napi keretet — ez user-döntés volt, ne írd felül');
});

// ===================================================================
// A BIZTONSÁGI FELTÉTEL: a Facebook-posztolás NEM eshet vissza
// ===================================================================
// Enélkül a fenti visszavétel vakrepülés lenne: a forgalom 82%-a Facebook.
t('🔑 kevés friss cikknél az ÖRÖKZÖLD hátralék tölti fel a posztkeretet', () => {
  // 2 friss cikk, 9 hely — a maradék 7 helyre a régi útmutatóknak KELL jönniük.
  const friss = [
    { pubAt: '2026-09-08T10:00:00Z', isGuide: false, isFresh: true },
    { pubAt: '2026-09-08T09:00:00Z', isGuide: true, isFresh: true }
  ];
  const regi = Array.from({ length: 40 }, (_, i) => ({
    pubAt: '2026-0' + (1 + (i % 7)) + '-1' + (i % 9) + 'T08:00:00Z',
    isGuide: true, isFresh: false
  }));
  const kimegy = selectSocialBatch([...friss, ...regi], 9);
  assert.equal(kimegy.length, 9,
    'a kör FÉLIG ÜRESEN ment ki — a kevesebb cikk így tényleg kevesebb posztot jelentene');
  assert.ok(kimegy.filter(x => !x.isFresh).length >= 7,
    'nem a hátralék töltötte fel a helyeket');
});

t('a friss ettől még ELÖL marad (a user szabálya nem sérül)', () => {
  const items = [
    { pubAt: '2026-09-08T10:00:00Z', isGuide: false, isFresh: true },
    ...Array.from({ length: 10 }, (_, i) => ({
      pubAt: '2026-07-0' + (i % 9) + 'T08:00:00Z', isGuide: true, isFresh: false
    }))
  ];
  const kimegy = selectSocialBatch(items, 5);
  assert.equal(kimegy[0].isFresh, true, 'nem a friss ment ki elsőnek');
});

t('a hátralék-hely küszöbe változatlan (a két szabály össze van kötve)', () => {
  assert.equal(DRAIN_SLOT_FROM, 3);
});

console.log(`\n${bukott === 0 ? '✅' : '❌'} daily-cap.test: ${pass} rendben, ${bukott} bukott`);
process.exit(bukott === 0 ? 0 : 1);
