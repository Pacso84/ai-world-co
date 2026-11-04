// ===================================================================
// TESZT — betöltődött-e VALÓBAN a videó betűtípusa (core/video-font.js)
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// A MIÉRT: a `short-video.js` „Arial Black"-et kért, a GitHub-futtatón
// ez nincs, a betűmotor némán visszaesett — három hétig, 24 videón, és
// a gyártás közben MINDEN „sikeres" volt. A mérés maga viszont pont
// olyan eszköz, ami könnyen vakon zöld: ha az összehasonlító SEMMIT nem
// lát, minden összehasonlítás egyezést ad, és a teszt attól is zöld.
//
// 🔑 EZÉRT A MÉRŐESZKÖZT MINDKÉT IRÁNYBAN HITELESÍTJÜK, és a futtató
// gépről SEMMIT nem teszünk fel (arról, hogy ezen a gépen melyik betű
// van telepítve, nem tudunk semmit — a teszt Windowson és ubuntu-latest
// futtatón is ugyanígy zöld):
//   · ISMERT NEGATÍV: két, EGYARÁNT nem létező családnév képe azonos
//   · ISMERT POZITÍV: ugyanaz a szöveg két betűMÉRETTEL eltér
// A logika minden ága HAMIS BETŰMOTORRAL megy végig — így a „nincs
// telepítve" és a „betöltődött" ág is bizonyított, nem csak az egyik.
// ===================================================================

import assert from 'assert/strict';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  betuRendben, probaKep,
  BETU_CSALAD, BETU_NEV, BETU_FAJL, PROBA_SZOVEG, NINCS_ILYEN_BETU
} from './video-font.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, bukott = 0;
const t = async (name, fn) => {
  try { await fn(); pass++; console.log('  ✅ ' + name); }
  catch (e) { bukott++; console.log('  ❌ ' + name + '\n     ' + String(e.message).split('\n')[0]); }
};
console.log('🧪 videó-betű: valóban betöltődött-e\n');

// ── HAMIS BETŰMOTOR ────────────────────────────────────────────────
// Kiolvassa az SVG-ből a kért családot és a betűméretet, majd úgy
// viselkedik, mint egy betűmotor: az ismeretlen családnév EGYETLEN
// alapbetűre esik vissza. Így a mérés mindkét kimenete előállítható a
// futtató gép betűkészletétől függetlenül.
const jel = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = (h * 16777619) >>> 0; } return h; };

function hamisSharp({ telepitve = [], uresCsalad = null, rovidCsalad = null, vak = false, dob = null } = {}) {
  return (buf) => {
    const svg = buf.toString('utf-8');
    const csalad = (svg.match(/font-family="([^"]*)"/) || [])[1] || '';
    const meret = Number((svg.match(/font-size="(\d+)"/) || [])[1] || 0);
    const w = Number((svg.match(/width="(\d+)"/) || [])[1] || 0);
    const h = Number((svg.match(/height="(\d+)"/) || [])[1] || 0);
    // A visszaesés: az első TELEPÍTETT család nyer, különben az alapbetű.
    const keresett = csalad.split(',').map(s => s.trim().replace(/^['"]|['"]$/g, ''));
    const megoldott = keresett.find(n => telepitve.includes(n)) || 'ALAPBETU';
    return {
      raw: () => ({
        toBuffer: async () => {
          if (dob) throw new Error(dob);
          const hossz = w * h * 4;
          if (rovidCsalad && keresett.includes(rovidCsalad)) return Buffer.alloc(hossz - 40, 0xff);
          const kep = Buffer.alloc(hossz, 0xff);
          if (uresCsalad && keresett.includes(uresCsalad)) return kep;   // egy glifát sem rajzol
          // A „vak" motor a betűMÉRETET sem veszi figyelembe — ilyenkor a
          // mérés önhitelesítése kell, hogy elbukjon.
          kep[4000] = 0x00;                                              // legyen tinta a képen
          kep.writeUInt32LE(jel(megoldott + ':' + (vak ? '' : meret)), 4004);
          return kep;
        }
      })
    };
  };
}

// ── A PRÓBASZÖVEG ──────────────────────────────────────────────────

await t('a próbaszöveg alkalmas a mérésre (nem „iiii"-szerű)', () => {
  assert.ok(PROBA_SZOVEG.length >= 6, 'túl rövid próbaszöveg: ' + PROBA_SZOVEG.length + ' karakter');
  // Széles ÉS keskeny betű is kell: a csupa egyforma szélességű szöveg
  // két különböző betűvel is majdnem ugyanazt a képet adja, és a mérés
  // épp azt a különbséget keresi.
  assert.match(PROBA_SZOVEG, /[WMGQOwm@]/, 'nincs benne SZÉLES betű: ' + PROBA_SZOVEG);
  assert.match(PROBA_SZOVEG, /[il1jtrf.,:'-]/, 'nincs benne KESKENY betű: ' + PROBA_SZOVEG);
  assert.ok(new Set(PROBA_SZOVEG.replace(/\s/g, '')).size >= 4, 'túl kevés különböző karakter');
});

await t('🔑 a nem létező családnévben NINCS SZÁM (a szám betűméretnek számít)', () => {
  // Kimérve: a névbe írt szám a librsvg/pango számára betű-LEÍRÁS mérete,
  // így a „…4711" végű név MÁS képet ad, mint egy közönséges ismeretlen
  // betű — a mérés ettől ÖRÖK ZÖLD lett volna.
  assert.doesNotMatch(NINCS_ILYEN_BETU, /\d/, 'szám van a kontroll-névben: ' + NINCS_ILYEN_BETU);
  assert.doesNotMatch(NINCS_ILYEN_BETU, /\b(bold|italic|oblique|light|condensed|black|regular)\b/i,
    'stílus-szó van a kontroll-névben (azt is a betű-leírás nyeli el): ' + NINCS_ILYEN_BETU);
  assert.ok(!BETU_CSALAD.toLowerCase().includes(NINCS_ILYEN_BETU.toLowerCase()),
    'a kontroll-név szerepel a kért betűcsaládban');
});

await t('a repóval utazó betűfájl tényleg ott van, ahová a hibaüzenet küld', () => {
  assert.ok(existsSync(join(ROOT, BETU_FAJL)), 'nincs meg: ' + BETU_FAJL);
});

// ── A LOGIKA MINDEN ÁGA — HAMIS BETŰMOTORRAL ───────────────────────

await t('telepített betű → ok: true, és a reason ÜRES', async () => {
  const r = await betuRendben(hamisSharp({ telepitve: [BETU_NEV] }));
  assert.equal(r.ok, true, 'reason: ' + r.reason);
  assert.equal(r.reason, '');
  assert.equal(r.nev, BETU_NEV);
});

await t('🔑 NEM telepített betű → ok: false, és megmondja, mi megy helyette', async () => {
  const r = await betuRendben(hamisSharp({ telepitve: ['Liberation Sans'] }));
  assert.equal(r.ok, false, 'reason: ' + r.reason);
  assert.match(r.reason, /NINCS TELEPÍTVE/);
  assert.match(r.reason, /Liberation Sans/, 'nem mondja meg, mi megy helyette: ' + r.reason);
  assert.match(r.reason, /schibsted-grotesk-900\.ttf/, 'nem mondja meg, mit telepítsünk');
});

await t('🔑 VAK összehasonlító → ok: null (nem zöld ÉS nem piros)', async () => {
  // A betűmérettel sem változó kép azt jelenti, hogy a renderelő nem rajzol
  // szöveget. Ilyenkor a „minden egyezik" NEM azt bizonyítja, hogy hiányzik
  // a betű — ez a vakon zöld/vakon piros teszt csapdája.
  const hiany = await betuRendben(hamisSharp({ telepitve: [], vak: true }));
  assert.equal(hiany.ok, null, 'vak motornál PIROSAT adott: ' + hiany.reason);
  assert.match(hiany.reason, /betűMÉRET/);
  const megvan = await betuRendben(hamisSharp({ telepitve: [BETU_NEV], vak: true }));
  assert.equal(megvan.ok, null, 'vak motornál ZÖLDET adott: ' + megvan.reason);
});

await t('betöltődött, de egy glifát sem rajzol → ok: false (nem zöld)', async () => {
  // Az „eltér az alapbetűtől" önmagában nem bizonyítja, hogy a szöveg látszik:
  // egy csonka betűfájl ÜRES táblát ad, ami szintén eltér.
  const r = await betuRendben(hamisSharp({ telepitve: [BETU_NEV], uresCsalad: BETU_NEV }));
  assert.equal(r.ok, false, 'reason: ' + r.reason);
  assert.match(r.reason, /ÜRES/);
});

await t('eltérő méretű próbaképek → ok: null (a különbség nem a betűtől van)', async () => {
  const r = await betuRendben(hamisSharp({ telepitve: [BETU_NEV], rovidCsalad: BETU_NEV }));
  assert.equal(r.ok, null, 'reason: ' + r.reason);
  assert.match(r.reason, /mérete eltér/);
});

await t('🔑 dobó sharp → ok: null, és a reason TARTALMAZZA a hiba okát', async () => {
  const r = await betuRendben(hamisSharp({ dob: 'vips: libvips csunyan elszallt' }));
  assert.equal(r.ok, null, 'a dobást nem null-ra fordította');
  assert.match(r.reason, /libvips csunyan elszallt/, 'elnyelte a hiba okát: ' + r.reason);
});

await t('🔑 hiányzó sharp → ok: null (SOHA nem false), a reason megmondja, miért', async () => {
  for (const nincs of [undefined, null, {}, 'sharp', 42]) {
    const r = await betuRendben(nincs);
    assert.equal(r.ok, null, 'ok !== null erre: ' + String(nincs));
    assert.ok(r.reason.length > 10, 'indoklás nélküli null erre: ' + String(nincs));
    assert.match(r.reason, /sharp/);
  }
});

await t('a visszatérési érték PONTOSAN { ok, reason, nev }, és a null mindig indokolt', async () => {
  const esetek = [
    await betuRendben(hamisSharp({ telepitve: [BETU_NEV] })),
    await betuRendben(hamisSharp({ telepitve: [] })),
    await betuRendben(hamisSharp({ dob: 'x' })),
    await betuRendben(undefined)
  ];
  for (const r of esetek) {
    assert.deepEqual(Object.keys(r).sort(), ['nev', 'ok', 'reason']);
    assert.ok(r.ok === true || r.ok === false || r.ok === null, 'harmadik érték: ' + r.ok);
    if (r.ok === true) assert.equal(r.reason, '');
    else assert.ok(r.reason.length > 10, 'néma nem-zöld: ' + JSON.stringify(r));
  }
});

await t('a mérés SOHA nem dob — akkor sem, ha a sharp maga dobja el a hívást', async () => {
  const orult = () => { throw new Error('mar a sharp() hivas is dob'); };
  const r = await betuRendben(orult);
  assert.equal(r.ok, null);
  assert.match(r.reason, /mar a sharp\(\) hivas is dob/);
  // A `raw()`/`toBuffer()` hiánya sem dobhat ki a függvényből.
  const felkesz = () => ({ raw: () => ({}) });
  assert.equal((await betuRendben(felkesz)).ok, null);
});

// ── A MÉRŐESZKÖZ HITELESÍTÉSE VALÓDI sharp-PAL ─────────────────────
// A `sharp` a repó függősége, ingyenes és hálózat nélküli. Ha mégsem
// tölthető be ezen a gépen, a teszt NEM bukhat el hamisan: akkor a
// „nem tudom" ágat kell igazolni, és ezt ki is írjuk.

let sharp = null, sharpHiba = null;
try { sharp = (await import('sharp')).default; }
catch (e) { sharpHiba = String(e?.message || e).split('\n')[0]; }

if (!sharp) {
  console.log('\n  ⚠️ a sharp NEM tölthető be ezen a gépen: ' + sharpHiba);
  console.log('     → a valódi rendereléses hitelesítés kimarad, a „nem tudom" ágat igazoljuk');
  await t('sharp nélkül a mérés ok: null (és nem téved se zöldbe, se pirosba)', async () => {
    const r = await betuRendben(null);
    assert.equal(r.ok, null);
    assert.ok(r.reason.includes('sharp'));
  });
} else {
  const KIS = { szeles: 300, magas: 120, meret: 44 };

  await t('🔑 ISMERT NEGATÍV: két nem létező betű képe PIXELRE AZONOS', async () => {
    // Ez igazolja, hogy az összehasonlító képes EGYEZÉST látni — enélkül a
    // „nincs telepítve" eset sosem sülne el.
    const a = await probaKep(sharp, NINCS_ILYEN_BETU, KIS);
    const b = await probaKep(sharp, 'Qqzzy Sohasemvolt', KIS);
    assert.ok(Buffer.isBuffer(a) && a.length > 0, 'nem jött nyers pixel');
    assert.ok(a.equals(b), 'két nem létező betű MÁS képet adott — a kontroll-név nem semleges '
      + '(szám vagy stílus-szó van benne?)');
  });

  await t('🔑 ISMERT POZITÍV: ugyanaz a szöveg két betűMÉRETTEL KÜLÖNBÖZIK', async () => {
    // Ez zárja ki a vak tesztet: ha minden összehasonlítás egyezést adna,
    // a fenti negatív teszt is zöld lenne, és semmit nem érne.
    const a = await probaKep(sharp, NINCS_ILYEN_BETU, KIS);
    const b = await probaKep(sharp, NINCS_ILYEN_BETU, { ...KIS, meret: 28 });
    assert.equal(a.length, b.length, 'a képméret nem maradt állandó');
    assert.ok(!a.equals(b), 'a betűméret változása sem látszik a képen — az összehasonlító VAK');
  });

  await t('a próbaszöveg a választott méretben tényleg RAJZOL is valamit', async () => {
    const kep = await probaKep(sharp, NINCS_ILYEN_BETU, KIS);
    const elso = kep.subarray(0, 4);
    let tinta = 0;
    for (let i = 0; i < kep.length; i += 4) if (!kep.subarray(i, i + 4).equals(elso)) tinta++;
    assert.ok(tinta > 200, 'alig van tinta a próbaképen (' + tinta + ' képpont) — a szöveg nem látszik');
    console.log('     📏 ' + tinta + ' tintás képpont a ' + KIS.szeles + 'x' + KIS.magas + ' próbaképen');
  });

  await t('valódi sharp: a mérés lefut, a szerződést tartja, és MEGMÉRJÜK, mennyi ideig', async () => {
    const t0 = Date.now();
    const r = await betuRendben(sharp);
    const ms = Date.now() - t0;
    assert.deepEqual(Object.keys(r).sort(), ['nev', 'ok', 'reason']);
    assert.ok(r.ok === true || r.ok === false || r.ok === null, 'harmadik érték: ' + r.ok);
    if (r.ok === true) assert.equal(r.reason, '');
    else assert.ok(r.reason.length > 10, 'néma nem-zöld: ' + JSON.stringify(r));
    // SEMMIT nem állítunk arról, MI a válasz: a futtató gép betűkészletét nem
    // ismerjük — épp ez a mérés értelme.
    const t1 = Date.now();
    await betuRendben(sharp);
    console.log('     📏 a mérés ' + ms + ' ms (második futás: ' + (Date.now() - t1)
      + ' ms) · ezen a gépen: ok=' + r.ok);
    console.log('     📏 ' + (r.reason || 'a kért betű betöltődött'));
  });

  await t('egy MÁSIK, ismeretlen családnév kérve biztosan ok: false', async () => {
    // Ez az EGYETLEN irány, amit a környezet ismerete nélkül is ki lehet
    // kényszeríteni valódi rendereléssel: ami biztosan nincs telepítve, arra
    // a mérés pirosat AD — tehát nem ragadt zöldben.
    const r = await betuRendben(sharp, { nev: 'Wwvvu Semmilyen Betu' });
    assert.equal(r.ok, false, 'egy biztosan nem létező betűt is rendben talált: ' + r.reason);
    assert.match(r.reason, /NINCS TELEPÍTVE/);
  });
}

console.log(`\n${bukott === 0 ? '✅' : '❌'} video-font.test: ${pass} rendben, ${bukott} bukott`);
process.exit(bukott === 0 ? 0 : 1);
