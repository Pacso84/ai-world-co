// ===================================================================
// TESZT — A REEL HÁTTERE: A CIKK ÉLES BORÍTÓJA, VÁNDORLÓ KIVÁGÁSSAL
// ===================================================================
// INGYENES, hálózat nélküli. A próbaképeket MAGA GYÁRTJA (sharp), tehát
// nem függ attól, milyen cikkek vannak épp a repóban.
//
// ELŐZMÉNY. 09-21-től a borító 70-es elmosással + 80% papírral ment ki,
// hogy a gépi borítók elírt feliratai ne látsszanak — ezt őrizte ez a
// teszt. Az eredmény egy halvány színfolt lett, és a user 09-23-án jelezte:
// „nem lehet megkülönböztetni egymástól… egyhangú". A bemutatott
// változatokból a „b+c"-t választotta: ÉLES teljes háttér + lépésenként
// vándorló kivágás, a szöveg papírszínű kártyán.
//
// A teszt MOST ezt őrzi — és nem a beállításoknak hisz, hanem a kimenetet
// MÉRI:
//   1. éles-e a háttér (ne csússzon vissza észrevétlenül az elmosás)
//   2. lépésenként TÉNYLEG más részt mutat-e (különben nincs „C")
//   3. a kártyán a LEGSÖTÉTEBB képnél is olvasható-e a szöveg
//
// 🔑 A MÉRŐ HITELESÍTVE VAN: a nyers mintát is megmérjük, és egy elmosott
// változatot is — ha a kettőt nem választja szét, a teszt SAJÁT MAGÁT
// jelenti hibásnak. (Élesben egyszer már egy vak mérő adott zöldet.)
// ===================================================================

import assert from 'assert/strict';
import { readFileSync, writeFileSync, rmSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  hatterekKepbol, vandorlasArany, tablaSvg, W, H, SAV_FELSO, SAV_ALSO,
  KARTYA_X, KARTYA_JOBB, KARTYA_ALJA, KARTYA_JELZO_Y, KARTYA_MARKA_Y, KARTYA_FEDES, VANDORLAS
} from './short-video.js';

/** A papír-kártya teteje és alja a kész SVG-ből (a kártya az egyetlen rx="36"-os téglalap). */
const kartyaRect = svg => String(svg).match(/<rect\b[^>]*\by="([\d.]+)"[^>]*\bheight="([\d.]+)"[^>]*rx="36"/);
const kartyaTeteje = svg => { const m = kartyaRect(svg); assert.ok(m, 'nincs kártya az SVG-ben'); return Number(m[1]); };
const kartyaAlja = svg => { const m = kartyaRect(svg); return Number(m[1]) + Number(m[2]); };

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sharp = (await import('sharp')).default;

let pass = 0, bukott = 0;
const t = async (nev, fn) => {
  try { await fn(); pass++; console.log('  ✅ ' + nev); }
  catch (e) { bukott++; console.log('  ❌ ' + nev + '\n     ' + String(e.message).split('\n')[0]); }
};

console.log('🧪 a Reel háttere — éles, vándorol, és olvasható marad?\n');

/** Éles átmenetek aránya — a szomszéd-különbséget kézzel számoljuk. */
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

/** 16:9-es próbakép: fekete-fehér sakktábla (éles), balról jobbra sötétedve. */
async function probaKep() {
  const w = 1280, h = 720, px = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const alap = (Math.floor(x / 6) + Math.floor(y / 6)) % 2 ? 255 : 0;
      const v = Math.round(alap * (1 - 0.8 * x / w));   // jobbra sötétebb → a vándorlás MÉRHETŐ
      const i = (y * w + x) * 3;
      px[i] = px[i + 1] = px[i + 2] = v;
    }
  }
  return sharp(px, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
}

const PROBA = join(ROOT, '.reel-hatter-proba.jpg');
writeFileSync(PROBA, await probaKep());
const atlag = async png => (await sharp(png).greyscale().stats()).channels[0].mean;

// ── 1. A MÉRŐ HITELESÍTÉSE ──────────────────────────────────────────
let nyersEl = 0;
await t('🔬 [hitelesítés] a mérő SZÉTVÁLASZTJA az éles és az elmosott képet', async () => {
  const kivagott = await sharp(PROBA).resize({ height: H }).extract({ left: 0, top: 0, width: W, height: H }).png().toBuffer();
  nyersEl = await elSuruseg(kivagott);
  const elmosott = await elSuruseg(await sharp(kivagott).blur(20).png().toBuffer());
  assert.ok(nyersEl > 5, 'az éles minta csak ' + nyersEl.toFixed(2) + '% — a mérő vak');
  assert.ok(elmosott < nyersEl / 10, 'az elmosottat nem választja szét (' + elmosott.toFixed(2) + '%) — a mérő vak');
});

// ── 2. ÉLES ─────────────────────────────────────────────────────────
await t('🔑 a háttér ÉLES — az elmosás nem csúszhat vissza észrevétlenül', async () => {
  const h = await hatterekKepbol(sharp, PROBA, 5);
  assert.ok(Array.isArray(h) && h.length === 5, 'nem kártyánként egy háttér jött');
  const el = await elSuruseg(h[0]);
  assert.ok(el > nyersEl * 0.5, 'a háttér tompább a nyersnél: ' + el.toFixed(2) + '% vs ' + nyersEl.toFixed(2) + '%');
});

// ── 3. VÁNDORLÁS (a „C") ────────────────────────────────────────────
await t('🔑 lépésenként a kép MÁS RÉSZE látszik (különben állókép marad)', async () => {
  const h = await hatterekKepbol(sharp, PROBA, 6);
  const elso = await atlag(h[0]), utolso = await atlag(h[5]);
  // a próbakép jobbra sötétedik → az ablak jobbra vándorol → sötétebb
  assert.ok(elso - utolso > 10, 'az első és az utolsó háttér gyakorlatilag ugyanaz (' + elso.toFixed(1) + ' → ' + utolso.toFixed(1) + ')');
  for (const b of h) {
    const m = await sharp(b).metadata();
    assert.equal(m.width, W); assert.equal(m.height, H);
  }
});

await t('a vándorlás tartománya értelmes és monoton', async () => {
  assert.ok(VANDORLAS[0] >= 0 && VANDORLAS[1] <= 1 && VANDORLAS[0] < VANDORLAS[1], 'rossz tartomány: ' + VANDORLAS);
  for (let i = 1; i < 6; i++) assert.ok(vandorlasArany(i, 6) > vandorlasArany(i - 1, 6), 'nem monoton');
  assert.equal(vandorlasArany(0, 1), (VANDORLAS[0] + VANDORLAS[1]) / 2, 'egyetlen kártya: középre');
});

// ── 4. OLVASHATÓSÁG A KÁRTYÁN ───────────────────────────────────────
await t('🔑 a LEGSÖTÉTEBB lehetséges képnél is világos marad a kártya', async () => {
  // Nem „általában" mérünk: teljesen FEKETE hátteret adunk, a lehető
  // legrosszabb esetet. A kártya alatt a kép legfeljebb 6%-ban üt át.
  const fekete = await sharp({ create: { width: W, height: H, channels: 3, background: '#000000' } }).png().toBuffer();
  // három sor + alcím: a LEGMAGASABB kártya — a szöveget szóközzel pótoljuk,
  // hogy csak a kártya felületét mérjük, a betűket ne
  const svg = tablaSvg({ cimke: '03', nagy: ' \n \n ', kicsi: ' ' }, 0, 5, { alap: false, kartya: true });
  const kesz = await sharp(fekete).composite([{ input: svg }]).png().toBuffer();
  const teteje = kartyaTeteje(svg);
  // a kártya belseje, a haladásjelző és a márkajel FÖLÖTT (azok maguk is tinták)
  const belso = await sharp(kesz).extract({ left: KARTYA_X + 30, top: teteje + 30, width: W - KARTYA_X - KARTYA_JOBB - 60, height: KARTYA_JELZO_Y - 30 - teteje - 30 })
    .png().toBuffer();
  const st = await sharp(belso).greyscale().stats();
  // A tinta #1c1a16 ≈ 27/255 — a kártyának bőven e fölött kell lennie.
  assert.ok(st.channels[0].min > 200, 'a kártya legsötétebb pontja ' + st.channels[0].min + '/255 — a szöveg elveszhet');
  assert.ok(KARTYA_FEDES >= 0.9, 'túl átlátszó kártya: ' + KARTYA_FEDES);
});

await t('📐 a kártya a Reels biztonságos sávjában marad, és minden sor rajta van', async () => {
  for (const [nagy, kicsi] of [['Decide what\nto do next\nright away', 'and keep it short'], ['Egy sor', ''], ['Két\nsor', 'alcím']]) {
    const svg = String(tablaSvg({ cimke: '', nagy, kicsi }, 5, 6, { alap: false, kartya: true }));
    const teteje = kartyaTeteje(svg), alja = kartyaAlja(svg);
    assert.ok(teteje >= SAV_FELSO, 'a kártya teteje a platform fejléce alá lóg: ' + teteje);
    assert.equal(alja, KARTYA_ALJA, 'a kártya alja nem a megbeszélt helyen van: ' + alja);
    // a jobb oldali Facebook-gombok alá nem lóghat
    const jobbSzel = Number((svg.match(/<rect\b[^>]*\bx="([\d.]+)"[^>]*\bwidth="([\d.]+)"[^>]*rx="36"/) || [])[1])
      + Number((svg.match(/<rect\b[^>]*\bx="([\d.]+)"[^>]*\bwidth="([\d.]+)"[^>]*rx="36"/) || [])[2]);
    assert.ok(jobbSzel <= W - KARTYA_JOBB, 'a kártya a jobb oldali gombok alá lóg: ' + jobbSzel);
    for (const m of svg.matchAll(/<text\b[^>]*\sy="([-\d.]+)"[^>]*font-size="(\d+)"/g)) {
      const y = parseFloat(m[1]), meret = Number(m[2]);
      if (y < 400) continue;                                 // az AI-jel a kártyán kívül, szándékosan
      assert.ok(y - meret * 0.8 >= teteje, 'szöveg a kártya fölé lóg: y=' + y + ', méret=' + meret);
      assert.ok(y <= alja, 'szöveg a kártya alá lóg: y=' + y);
    }
  }
});

await t('🔑 a szöveg ALUL van — egyetlen élő kártyán sem takarja a kép felső részét', async () => {
  // User, 09-23: „inkább a szöveg legyen alul, a kép meg teljes". Az első
  // B+C-változatban a kártya 690-nél kezdődött, a látható rész felénél.
  // Mérce: a kártya teteje SOHA nem ér az 1050-es vonal fölé — fölötte
  // mindig a kép látszik (a látható rész több mint fele).
  const { readdirSync } = await import('fs');
  const { cardsFromGuide } = await import('./short-video.js');
  const { utmutatoE } = await import('./guide-kind.js');
  const HATAR = 1050;
  const ALSO_SOR_MIN = KARTYA_JELZO_Y - 120;                    // az utolsó sor legfeljebb ennyivel a jelző fölött
  const AD = join(ROOT, 'content', 'articles');
  let db = 0, legmagasabb = SAV_ALSO; const rossz = [];
  for (const f of readdirSync(AD).filter(x => x.startsWith('ARTICLE_') && x.endsWith('.json'))) {
    let d; try { d = JSON.parse(readFileSync(join(AD, f), 'utf-8')); } catch { continue; }
    if (!utmutatoE(f, d)) continue;
    const { cards } = cardsFromGuide(d.article_markdown || '');
    for (const [i, k] of (cards || []).entries()) {
      db++;
      const svg = String(tablaSvg(k, i, cards.length, { alap: false, kartya: true }));
      const teteje = kartyaTeteje(svg);
      legmagasabb = Math.min(legmagasabb, teteje);
      if (teteje < HATAR) rossz.push(`${d._meta?.slug?.slice(0, 30)} #${i}: kártya ${teteje}`);
      // ⚠️ A „nem ér túl magasra" NEM ugyanaz, mint a „lent van": az első
      // változata ennek a tesztnek akkor is átment, amikor a szöveget
      // visszaraktam KÖZÉPRE (a kisebb betű miatt a kártya így is a határ
      // alatt maradt). A valódi mérce: az utolsó sor a haladásjelző fölött ül.
      const sorokY = [...svg.matchAll(/<text\b[^>]*\sy="([-\d.]+)"/g)].map(m => parseFloat(m[1]))
        .filter(y => y > 400 && y < KARTYA_MARKA_Y - 20);          // az AI-jel és a márkajel nélkül
      const also = Math.max(...sorokY);
      if (also < ALSO_SOR_MIN) rossz.push(`${d._meta?.slug?.slice(0, 30)} #${i}: utolsó sor ${Math.round(also)}`);
    }
  }
  assert.ok(db > 1000, 'gyanúsan kevés kártya (' + db + ')');
  assert.equal(rossz.length, 0, rossz.length + ' kártya ér a kép felső részébe (' + HATAR + ' fölé), pl. ' + rossz.slice(0, 3).join(' · '));
  console.log('     (a legmagasabb kártya teteje: ' + legmagasabb + ' px — fölötte csak kép)');
});

await t('🔑 egyetlen élő útmutató egyetlen kártyáján sem ér a szöveg a kártya széléig', async () => {
  // Élesben látott hiba (09-23, az első változat mintáján): az „Open
  // Gemini" a kártya széléig ért, mert a szövegkeret (1000 px) pontosan
  // akkora volt, mint a kártya. A becslés a FELFELÉ kerekített 0,65-ös
  // betűaránnyal számol (mért maximum 0,637), tehát szigorúbb a valóságnál.
  const { readdirSync } = await import('fs');
  const { cardsFromGuide } = await import('./short-video.js');
  const { utmutatoE } = await import('./guide-kind.js');
  const { BETU_ARANY, ALCIM_ARANY } = await import('./short-video.js');
  const AD = join(ROOT, 'content', 'articles');
  const belso = W - KARTYA_X - KARTYA_JOBB;       // a kártya teljes szélessége
  let kartyaDb = 0; const kint = [];
  for (const f of readdirSync(AD).filter(x => x.startsWith('ARTICLE_') && x.endsWith('.json'))) {
    let d; try { d = JSON.parse(readFileSync(join(AD, f), 'utf-8')); } catch { continue; }
    if (!utmutatoE(f, d)) continue;
    const { cards } = cardsFromGuide(d.article_markdown || '');
    for (const [i, k] of (cards || []).entries()) {
      kartyaDb++;
      const svg = String(tablaSvg(k, i, cards.length, { alap: false, kartya: true }));
      for (const m of svg.matchAll(/<text\b[^>]*font-size="(\d+)"[^>]*>([^<]*)</g)) {
        const meret = Number(m[1]), szoveg = m[2].replace(/&amp;/g, '&').replace(/&[a-z]+;/g, 'x');
        if (meret < 45 || !szoveg.trim() || szoveg === 'AI') continue;  // a márkajel/AI-jel fix, kicsi
        const arany = meret >= 72 ? BETU_ARANY : ALCIM_ARANY;
        const szeles = szoveg.length * arany * meret;
        if (szeles > belso - 2 * 30) kint.push(`${d._meta?.slug?.slice(0, 30)} #${i}: „${szoveg}" ~${Math.round(szeles)} px`);
      }
    }
  }
  assert.ok(kartyaDb > 1000, 'gyanúsan kevés kártya (' + kartyaDb + ') — a minta kiürült?');
  assert.equal(kint.length, 0, kint.length + ' szöveg ér a kártya széléig (30 px-en belül), pl. ' + kint.slice(0, 3).join(' · '));
});

await t('🔑 a szövegdoboz KÖZÉPEN van (user, 09-23: „kicsit balra helyezkedik el")', async () => {
  const svg = String(tablaSvg({ cimke: '', nagy: 'Két\nsor', kicsi: 'alcím' }, 1, 5, { alap: false, kartya: true }));
  const m = svg.match(/<rect\b[^>]*\bx="([\d.]+)"[^>]*\bwidth="([\d.]+)"[^>]*rx="36"/);
  assert.ok(m, 'nincs kártya');
  const kozep = Number(m[1]) + Number(m[2]) / 2;
  assert.equal(kozep, W / 2, 'a kártya közepe ' + kozep + ', nem ' + W / 2);
  for (const x of svg.matchAll(/<text\b[^>]*\bx="([\d.]+)"[^>]*text-anchor="middle"[^>]*>(?!AI<)/g)) {
    assert.equal(Number(x[1]), W / 2, 'egy szöveg nem középen áll: x=' + x[1]);
  }
});

await t('kártya-módban a halvány lépésszám elmarad (a fotón úgysem látszana)', async () => {
  const van = String(tablaSvg({ cimke: '03', nagy: 'X', kicsi: '' }, 2, 5));
  const nincs = String(tablaSvg({ cimke: '03', nagy: 'X', kicsi: '' }, 2, 5, { alap: false, kartya: true }));
  assert.ok(/>03</.test(van), 'a papír-táblán a lépésszámnak látszania kell');
  assert.ok(!/>03</.test(nincs), 'a kártya-módban a lépésszám mégis kirajzolódik');
});

// ── 5. KÉP NÉLKÜL IS MŰKÖDIK ────────────────────────────────────────
await t('hiányzó kép esetén `null` → a papír-tábla megy, nem összeomlás', async () => {
  for (const rossz of ['', join(ROOT, 'nincs-ilyen-fajl.jpg')]) {
    assert.equal(await hatterekKepbol(sharp, rossz, 5), null);
  }
});

await t('sérült képfájl esetén sem dől el a gyártás', async () => {
  const SERULT = join(ROOT, '.reel-hatter-serult.jpg');
  writeFileSync(SERULT, Buffer.from('ez nem kép, csak szöveg'));
  const h = await hatterekKepbol(sharp, SERULT, 5);
  rmSync(SERULT, { force: true });
  assert.equal(h, null, 'sérült képnél nem a papír-tartalékot jelezte');
});

await t('álló (keskeny) kép esetén is teljes méretű hátteret ad', async () => {
  const ALLO = join(ROOT, '.reel-hatter-allo.jpg');
  writeFileSync(ALLO, await sharp({ create: { width: 400, height: 900, channels: 3, background: '#336699' } }).jpeg().toBuffer());
  const h = await hatterekKepbol(sharp, ALLO, 3);
  rmSync(ALLO, { force: true });
  assert.equal(h.length, 3);
  const m = await sharp(h[0]).metadata();
  assert.equal(m.width, W); assert.equal(m.height, H);
});

// ── 6. A GYÁRTÁS TÉNYLEG EZT HASZNÁLJA ──────────────────────────────
await t('🔑 a gyártás a kártya-módot és a kártyánkénti hátteret használja', async () => {
  // A „megcsinálva, de nem ér célba" alakzat ellen: a függvények létezése
  // semmit nem bizonyít, ha a renderVideo nem őket hívja.
  const forras = readFileSync(join(ROOT, 'core', 'short-video.js'), 'utf-8')
    .split('\n').filter(s => !s.trim().startsWith('//')).join('\n');
  assert.ok(/hatterekKepbol\(sharp, kepUt, cards\.length\)/.test(forras), 'a renderVideo nem kér kártyánkénti hátteret');
  assert.ok(/\{ alap: false, kartya: true \}/.test(forras), 'a renderVideo nem kártya-módban rajzolja a táblát');
  assert.ok(/hatterek\[i\]/.test(forras), 'a renderVideo nem az i. kártya saját hátterét használja');
});

await t('🔑 a gyártás TÉNYLEG megkapja a borítókép útvonalát', async () => {
  const rp = readFileSync(join(ROOT, 'core', 'reel-post.js'), 'utf-8')
    .split('\n').filter(s => !s.trim().startsWith('//')).join('\n');
  const db = (rp.match(/kepUt: boritoUt\(/g) || []).length;
  assert.equal(db, 2, 'a reel-post ' + db + ' helyen adja át a borítót (2 kellene: fő ág + újragyártás)');
  assert.ok(/website['"], ['"]assets['"], ['"]images['"]/.test(rp), 'a boritoUt nem a képek mappájára mutat');
});

rmSync(PROBA, { force: true });
console.log(`\n${bukott ? '❌' : '✅'} ${pass} sikeres, ${bukott} bukott`);
process.exit(bukott ? 1 : 0);
