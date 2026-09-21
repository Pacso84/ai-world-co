// ===================================================================
// TESZT — A REEL HÁTTERE A CIKK BORÍTÓKÉPÉBŐL (2026-09-21)
// ===================================================================
// INGYENES, hálózat nélküli. A próbaképet MAGA GYÁRTJA (sharp), tehát
// nem függ attól, milyen cikkek vannak épp a repóban.
//
// MIÉRT VAN EZ A TESZT.
//
// 2026-09-17-én KIVETTÜK a borítóképet a Reelből, mert az AI-generált
// borítókon hibás felirat lehet („perrplexity", két r-rel), és a 9-es
// sugarú elmosás alól kilátszott. A user 09-21-én azt kérte, hogy minden
// Reel nézzen ki másképp — és erre a cikk saját képe a jó válasz, DE
// csak akkor, ha a rajta lévő betűkből semmi nem marad olvasható.
//
// Ez a teszt nem hisz a beállításoknak, hanem MEGMÉRI a kimenetet:
//   1. egy ismert, ÉLES mintából marad-e éles átmenet a feldolgozás után
//   2. elég világos-e a háttér ahhoz, hogy a tinta-fekete szöveg olvasható
//      maradjon — a LEGSÖTÉTEBB lehetséges bemenetnél is
//
// 🔑 A MÉRŐ HITELESÍTVE VAN. Élesben egyszer már pont ez bukott el: az
// első él-mérőm a NYERS képre is nullát mondott, vagyis a zöldje a
// semmiből jött. Ezért itt a nyers mintát is megmérjük — ha arra nem ad
// magas értéket, a teszt SAJÁT MAGÁT jelenti hibásnak.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  hatterKepbol, tablaSvg, W, H, SAV_FELSO, SAV_ALSO,
  HATTER_ELMOSAS, HATTER_PAPIR_FEDES
} from './short-video.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sharp = (await import('sharp')).default;

let pass = 0, bukott = 0;
const t = async (nev, fn) => {
  try { await fn(); pass++; console.log('  ✅ ' + nev); }
  catch (e) { bukott++; console.log('  ❌ ' + nev + '\n     ' + String(e.message).split('\n')[0]); }
};

console.log('🧪 a Reel háttere — marad-e olvasható betű?\n');

/**
 * Éles átmenetek aránya. A szomszéd-különbséget SZÁNDÉKOSAN kézzel
 * számoljuk: az első változat a sharp convolve-jára bízta, és az a nyers
 * képre is nullát adott — a mérő némán vak volt.
 */
async function elSuruseg(png, kuszob = 12) {
  const { data, info } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;
  let n = 0, ossz = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      ossz++;
      if (Math.abs(data[i + 1] - data[i - 1]) + Math.abs(data[i + w] - data[i - w]) > kuszob) n++;
    }
  }
  return n / ossz * 100;
}

/** Ismert, NAGYON éles minta: fekete-fehér csíkok — mint a betűk élei. */
async function probaKep(csikSzeles = 6) {
  const px = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = (Math.floor(x / csikSzeles) + Math.floor(y / csikSzeles)) % 2 ? 255 : 0;
      const i = (y * W + x) * 3;
      px[i] = px[i + 1] = px[i + 2] = v;
    }
  }
  return sharp(px, { raw: { width: W, height: H, channels: 3 } }).jpeg().toBuffer();
}

const PROBA = join(ROOT, '.reel-hatter-proba.jpg');
const { writeFileSync, rmSync } = await import('fs');
writeFileSync(PROBA, await probaKep());

// ── 1. A MÉRŐ HITELESÍTÉSE ──────────────────────────────────────────
let nyersEl = 0;
await t('🔬 [hitelesítés] a mérő LÁTJA az éles mintát (különben a nullája semmit nem ér)', async () => {
  nyersEl = await elSuruseg(readFileSync(PROBA));
  assert.ok(nyersEl > 5, 'a nyers sakktábla-minta csak ' + nyersEl.toFixed(2) + '% — a mérő vak');
});

// ── 2. A FELDOLGOZÁS UTÁN NEM MARAD OLVASHATÓ RÉSZLET ───────────────
await t('🔑 a feldolgozott háttéren nem marad éles átmenet (nem látszik ki felirat)', async () => {
  const el = await elSuruseg(await hatterKepbol(sharp, PROBA));
  assert.ok(el < 0.5, 'maradt éles részlet: ' + el.toFixed(4) + '% — a hibás felirat kilátszhat');
  assert.ok(nyersEl / Math.max(el, 0.0001) > 20,
    'a visszaesés gyanúsan kicsi (' + nyersEl.toFixed(2) + '% → ' + el.toFixed(4) + '%)');
});

// ── 3. VILÁGOSSÁG-GARANCIA ──────────────────────────────────────────
await t('🔑 a LEGSÖTÉTEBB lehetséges kép mellett is olvasható marad a szöveg', async () => {
  // Nem „általában" mérünk: teljesen FEKETE bemenetet adunk, vagyis a
  // lehető legrosszabb esetet. A keverés miatt a kimenet nem lehet
  // sötétebb, mint 0,8 × papír — ezt ellenőrizzük a kész képen.
  const fekete = await sharp({ create: { width: W, height: H, channels: 3, background: '#000000' } })
    .jpeg().toBuffer();
  const FEKETE_UT = join(ROOT, '.reel-hatter-fekete.jpg');
  writeFileSync(FEKETE_UT, fekete);
  const h = await hatterKepbol(sharp, FEKETE_UT);
  const sav = await sharp(h)
    .extract({ left: 0, top: SAV_FELSO, width: W, height: SAV_ALSO - SAV_FELSO })
    .greyscale().stats();
  rmSync(FEKETE_UT, { force: true });
  // A tinta #1c1a16 ≈ 27/255. A háttérnek bőven e fölött kell lennie.
  assert.ok(sav.channels[0].min > 150,
    'a szövegsáv legsötétebb pontja ' + sav.channels[0].min + '/255 — a fekete szöveg elveszne');
});

await t('a két szabályozó nem gyengíthető észrevétlenül', async () => {
  // Az ELMOSAS és a PAPIR_FEDES együtt adja a fenti két garanciát. Ha
  // valaki „csak egy kicsit" enged rajtuk, a felirat újra kilátszhat.
  assert.ok(HATTER_ELMOSAS >= 50, 'túl gyenge elmosás: ' + HATTER_ELMOSAS);
  assert.ok(HATTER_PAPIR_FEDES >= 0.7, 'túl kevés papír-keverés: ' + HATTER_PAPIR_FEDES);
});

// ── 4. KÉP NÉLKÜL IS MŰKÖDIK ────────────────────────────────────────
await t('hiányzó kép esetén papírszín megy, nem összeomlás', async () => {
  for (const rossz of ['', join(ROOT, 'nincs-ilyen-fajl.jpg')]) {
    const h = await hatterKepbol(sharp, rossz);
    const m = await sharp(h).metadata();
    assert.equal(m.width, W);
    assert.equal(m.height, H);
  }
});

await t('sérült képfájl esetén sem dől el a gyártás', async () => {
  const SERULT = join(ROOT, '.reel-hatter-serult.jpg');
  writeFileSync(SERULT, Buffer.from('ez nem kép, csak szöveg'));
  const h = await hatterKepbol(sharp, SERULT);
  rmSync(SERULT, { force: true });
  const m = await sharp(h).metadata();
  assert.equal(m.width, W, 'sérült képnél nem a papír-tartalékot adta');
});

// ── 5. A TÁBLA NEM TAKARJA LE A KÉPET ───────────────────────────────
await t('🔑 a gyártás `alap: false`-szal hívja a táblát — különben a kép letakarva', async () => {
  // Ez a FELTÉTELE annak, hogy a háttér egyáltalán látszódjon. Enélkül a
  // feldolgozás lefutna, a videó elkészülne, és minden maradna papírszín:
  // a „megcsinálva, de nem ér célba" alakzat.
  const forras = readFileSync(join(ROOT, 'core', 'short-video.js'), 'utf-8')
    .split('\n').filter(s => !s.trim().startsWith('//')).join('\n');
  assert.ok(/tablaSvg\(cards\[i\], i, cards\.length, \{ alap: false \}\)/.test(forras),
    'a renderVideo nem alap:false-szal hívja a tablaSvg-t');
  const vanAlap = String(tablaSvg({ cimke: '', nagy: 'Teszt', kicsi: 'x' }, 0, 3));
  const nincsAlap = String(tablaSvg({ cimke: '', nagy: 'Teszt', kicsi: 'x' }, 0, 3, { alap: false }));
  assert.ok(vanAlap.includes('fill="#f2ede4"'), 'az alapértelmezett tábla nem festi a papírt');
  assert.ok(!nincsAlap.includes('width="1080" height="1920" fill="#f2ede4"'),
    'az alap:false tábla MÉGIS lefesti a teljes hátteret');
});

await t('🔑 a gyártás TÉNYLEG megkapja a borítókép útvonalát', async () => {
  // A feature akkor is „kész" lenne, ha a hívó sosem adná át a képet —
  // ez a projekt visszatérő hibája (a javítás, ami nem ér célba).
  const rp = readFileSync(join(ROOT, 'core', 'reel-post.js'), 'utf-8')
    .split('\n').filter(s => !s.trim().startsWith('//')).join('\n');
  const db = (rp.match(/kepUt: boritoUt\(/g) || []).length;
  assert.equal(db, 2, 'a reel-post ' + db + ' helyen adja át a borítót (2 kellene: fő ág + újragyártás)');
  assert.ok(/website['"], ['"]assets['"], ['"]images['"]/.test(rp), 'a boritoUt nem a képek mappájára mutat');
});

rmSync(PROBA, { force: true });
console.log(`\n${bukott ? '❌' : '✅'} ${pass} sikeres, ${bukott} bukott`);
process.exit(bukott ? 1 : 0);
