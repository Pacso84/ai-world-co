// ===================================================================
// A VIDEÓ BETŰTÍPUSA — és annak ellenőrzése, hogy valóban megjött-e
// ===================================================================
//
// ⚠️ EZ A FÁJL EGY ÉLES HIBÁBÓL SZÜLETETT (2026-09-17). A
// `core/short-video.js` a táblák szövegét `font-family="Arial Black,
// Arial, sans-serif"` névvel kérte. Arial Black a fejlesztői Windowson
// VAN, a GitHub ubuntu-latest futtatóján NINCS — ott a betűmotor némán
// egy vékonyabb alapbetűre esett vissza. Három hétig (24 kiküldött Reel)
// NEM az a videó ment ki, amit terveztünk, és ezt semmi nem jelezte:
// a gyártás sikeres volt, a fájl megszületett, a poszt kiment.
//
// 🔑 A LECKE: a betűtípus NEVE KÉRÉS, NEM GARANCIA. Ugyanaz a csapda,
// mint a `feedback-a-config-enabled-mezo-nem-kapcsol-ki` esetében: a
// kód saját kérése nem bizonyíték arra, hogy meg is történt.
//
// Ezért a betű mostantól UTAZIK A REPÓVAL (shared/fonts/), a CI
// telepíti a futtató gépre, ÉS a gyártás minden alkalommal LEMÉRI,
// hogy tényleg azt a betűt kapta-e. A mérés a napi jelentésbe jut,
// nem a CI-naplóba — az őrszem csak akkor őr, ha odaszól, ahol a user
// nézi (`munkamodszer-tanulsagok.md`).
// ===================================================================

/**
 * A kért betűcsalád — SVG `font-family` értékként.
 *
 * A sorrend szándékos: a saját becsomagolt betűnk, aztán az Arialnak
 * méret-kompatibilis Liberation Sans (ubuntun a `fonts-liberation`
 * csomagból szinte mindig ott van), végül a rendszer alapbetűje. A
 * visszaesés így is visszaesés — csak nem olvashatatlan.
 */
export const BETU_CSALAD = "'Schibsted Grotesk', 'Liberation Sans', Arial, sans-serif";

/** A becsomagolt betű CSALÁDNEVE — ezt kell a betűmotornak ismernie. */
export const BETU_NEV = 'Schibsted Grotesk';

/** A betűfájl helye a repó gyökerétől. A CI innen telepíti. */
export const BETU_FAJL = 'shared/fonts/schibsted-grotesk-900.ttf';

// A próbaszöveg, amin a mérés történik. Rövid, de betűnként eltérő
// szélességű — az „iiii" például majdnem minden betűvel egyforma lenne.
export const PROBA_SZOVEG = 'Waggon 01';

/**
 * Egy biztosan NEM LÉTEZŐ családnév. A mérés ezzel hitelesíti magát:
 * ha a kért betű képe ugyanaz, mint ennek a képe, akkor a kért betű
 * nem töltődött be — mindkettő az alapbetűre esett vissza.
 *
 * ⚠️ NEM LEHET BENNE SZÁM (kimérve 2026-09-17, ezen a gépen). A fájl
 * első változatában „ZZ Nincs Ilyen Betu 4711" állt itt, és ez az EGÉSZ
 * MÉRÉST ELRONTOTTA VOLNA: a szám a librsvg/pango számára nem a
 * családnév része, hanem egy betű-LEÍRÁS mérete (Family Style Size),
 * így ez a név MÁS képet ad, mint egy közönséges ismeretlen betű.
 * Kimérve: a „Zzqqx Noone 4711" és a „ZZ Nincs Ilyen Betu 4711" képe
 * pixelre azonos EGYMÁSSAL, de MINDKETTŐ eltér attól, amit a szám
 * nélküli ismeretlen nevek adnak — vagyis a mérés SOHA nem talált
 * volna egyezést, és a betű hiányát ÖRÖK ZÖLDNEK látta volna. Pont az
 * a vak zöld, ami miatt ez a fájl egyáltalán létezik.
 *
 * Amit a szám nélküli nevekről KIMÉRTEM: a „Zzqqx Noone", a
 * „Qqzzy Nobody", a „Wwvvu Semmi", a „sans-serif", a „Grotesk" és a
 * (nem telepített) „Schibsted Grotesk" képe MIND pixelre azonos —
 * tehát az ismeretlen családnév tényleg egyetlen alapbetűre esik.
 * Stílus-szó (Bold, Italic, Light, Condensed) sem kerülhet ide:
 * azokat is a betű-leírás nyeli el.
 */
export const NINCS_ILYEN_BETU = 'Zzqqx Nincsilyenbetu';

// ── A MÉRÉS ────────────────────────────────────────────────────────
//
// A próbakép mérete és betűmérete. 300x120-nál a `PROBA_SZOVEG` 44
// pixeles betűvel HIÁNY NÉLKÜL BEFÉR (kimérve: a tinta x:8-264,
// y:52-92) — ez fontos, mert a levágott szöveg a különbségek felét
// eldobná, és a mérés érzéketlenebb lenne.
//
// ⚠️ AMI NEM MŰKÖDIK (kimérve 2026-09-17): az SVG-be írt
// `@font-face { src: url(...ttf) }` a librsvg-t HIDEGEN HAGYJA — a kép
// pixelre azonos a betű nélkülivel. A betűt tehát TELEPÍTENI kell a
// futtató gépre (fontconfig), az SVG-be beágyazni NEM elég. Részben
// ezért kell egyáltalán mérni a gyártás közben.
const KEP = { szeles: 300, magas: 120, meret: 44 };

/** Attribútumba/szövegbe kerülő karakterlánc — a próbaszöveget a hívó adja. */
const xmlBiztos = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/**
 * Egy próbakép NYERS PIXELEI: a `PROBA_SZOVEG` kirenderelve a kért
 * betűcsaláddal. Dobhat (a hívó dolga elkapni) — a `betuRendben` a
 * dobást „nem tudom"-ra fordítja.
 *
 * Miért külön exportált: a mérőeszközt ISMERT ESETTEL kell hitelesíteni
 * (házszabály). A teszt ezzel tudja igazolni, hogy az összehasonlító
 * MINDKÉT irányt látja — egyezést és eltérést is.
 *
 * @param {Function} sharpModul a `sharp` — a HÍVÓ adja be (lásd lent)
 * @param {string} csaladNev SVG `font-family` érték
 * @returns {Promise<Buffer>} nyers (RGBA) pixelek
 */
export async function probaKep(sharpModul, csaladNev, opts = {}) {
  const {
    szeles = KEP.szeles, magas = KEP.magas,
    meret = KEP.meret, szoveg = PROBA_SZOVEG
  } = opts;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${szeles}" height="${magas}">`
    + `<rect width="${szeles}" height="${magas}" fill="#ffffff"/>`
    + `<text x="8" y="${Math.round(magas * 0.7)}" font-size="${meret}"`
    + ` font-family="${xmlBiztos(csaladNev)}" font-weight="900" fill="#000000">`
    + `${xmlBiztos(szoveg)}</text></svg>`;
  return await sharpModul(Buffer.from(svg)).raw().toBuffer();
}

/**
 * Van-e egyáltalán TINTA a képen: eltér-e bármelyik képpont az elsőtől?
 * `null` = a puffer hossza nem illik a képmérethez, tehát nem tudom.
 *
 * MIÉRT KELL: ha a kért betű betöltődik, de egyetlen glifát sem rajzol
 * (csonka vagy hibás betűfájl), a kép ELTÉR az alapbetűtől — a puszta
 * „különbözik" tehát ZÖLDET adna egy ÜRES táblára. Az eltérés nem
 * bizonyíték arra, hogy a szöveg LÁTSZIK is.
 */
function tintaAllapot(buf, szeles, magas) {
  if (!Buffer.isBuffer(buf) || buf.length === 0) return null;
  const cs = buf.length / (szeles * magas);
  if (!Number.isInteger(cs) || cs < 1 || cs > 4) return null;
  for (let i = cs; i < buf.length; i++) if (buf[i] !== buf[i % cs]) return true;
  return false;
}

/** Mi megy a kért betű HELYETT, ha nincs telepítve. */
const tartalekLista = (nev) => BETU_CSALAD.split(',')
  .map(s => s.trim())
  .filter(s => s.replace(/^['"]|['"]$/g, '').toLowerCase() !== String(nev).toLowerCase())
  .join(', ');

/**
 * VALÓBAN betöltődött-e a kért betű, vagy a betűmotor némán visszaesett?
 *
 * A mérés: ugyanaz a próbaszöveg KÉT kis SVG-be — egyszer a kért
 * családdal, egyszer a biztosan nem létező `NINCS_ILYEN_BETU`-val —, és
 * a két kép NYERS PIXELEIT hasonlítjuk össze. Azonos kép = a kért betű
 * is az alapbetűre esett vissza. Nincs ehhez jobb kapaszkodó: a
 * betűmotor NEM SZÓL, ha nem találta meg, amit kértünk.
 *
 * A HARMADIK renderelés a mérőeszköz ÖNHITELESÍTÉSE — a futtató gépen,
 * minden alkalommal: ugyanaz a nem létező család MÁS betűmérettel.
 * Ennek KÜLÖNBÖZNIE kell. Ha nem különbözik, akkor az összehasonlító
 * vak (a renderelő nem rajzol szöveget), és ilyenkor a zöld ÉS a piros
 * is hamis lenne — ezért `null`. A ház visszatérő hibája pont ez: egy
 * mérce, amelyik minden bemenetre ugyanazt mondja, zöldnek látszik.
 *
 * ⚠️ AMIT EZ A MÉRÉS NEM TUD: általános CSALÁD-KULCSSZÓT (`sans-serif`,
 * `serif`) ellenőrizni — arra `ok: false` jön, hiszen épp az alapbetűvel
 * azonos a képe. A kérdés, amire válaszol, ez: „mást kaptam-e, mint a
 * néma visszaesés". Konkrét betűNÉVRE való — nekünk épp az kell.
 *
 * ⚠️ A `sharp`-ot a HÍVÓ adja be. Kettős okból: (1) a teszt így be tud
 * adni hamis betűmotort, és MINDEN ágat deterministán végig tud járni,
 * (2) a modul betöltése nem húz be egy nagy natív könyvtárat — egy
 * diagnosztikai `import` se rendereljen.
 *
 * SOHA NEM DOB. Három kimenet:
 *   ok: true  → a kért betű betöltődött (`reason: ''`)
 *   ok: false → nincs telepítve, vagy semmit nem rajzol — a `reason` megmondja
 *   ok: null  → NEM SIKERÜLT MEGMÉRNI; a „nem tudom" se nem zöld, se nem piros
 *
 * @returns {Promise<{ok: (boolean|null), reason: string, nev: string}>}
 */
export async function betuRendben(sharpModul, opts = {}) {
  const nev = opts.nev || BETU_NEV;
  const szeles = opts.szeles ?? KEP.szeles;
  const magas = opts.magas ?? KEP.magas;
  const meret = opts.meret ?? KEP.meret;
  // A „nem tudom" mindig elmondja az OKÁT is: egy indoklás nélküli null
  // ugyanolyan használhatatlan, mint egy néma bukás.
  const nemTudom = (miert) => ({ ok: null, reason: 'a betű nem mérhető meg: ' + miert, nev });

  if (typeof sharpModul !== 'function') {
    return nemTudom('a hívó nem adott be sharp modult ('
      + (sharpModul === undefined ? 'undefined' : sharpModul === null ? 'null' : 'typeof ' + typeof sharpModul)
      + ')');
  }

  try {
    // A kontroll-méret szándékosan jóval kisebb: a 0,65-szörös betű
    // minden betűmotorral másképp fest — ha egyáltalán fest valamit.
    const kontrollMeret = Math.max(8, Math.round(meret * 0.65));
    const kepOpts = { szeles, magas, meret, szoveg: opts.szoveg ?? PROBA_SZOVEG };

    const kert = await probaKep(sharpModul, nev, kepOpts);
    const alap = await probaKep(sharpModul, NINCS_ILYEN_BETU, kepOpts);
    const kontroll = await probaKep(sharpModul, NINCS_ILYEN_BETU, { ...kepOpts, meret: kontrollMeret });

    if (!Buffer.isBuffer(kert) || !Buffer.isBuffer(alap) || !Buffer.isBuffer(kontroll)) {
      return nemTudom('a renderelés nem puffert adott vissza');
    }
    if (kert.length === 0 || alap.length === 0) return nemTudom('a próbakép üres puffer');
    // Egyforma SVG-méretből egyforma pixelszám jön. Ha mégsem, akkor a
    // „különbözik" nem a betűről szól — és a zöld hamis lenne.
    if (kert.length !== alap.length) {
      return nemTudom('a két próbakép mérete eltér (' + kert.length + ' vs ' + alap.length
        + ' bájt), így a különbség nem a betűtől van');
    }
    if (kontroll.length !== alap.length) {
      return nemTudom('a kontroll-kép mérete eltér (' + kontroll.length + ' vs ' + alap.length + ' bájt)');
    }
    // 🔑 ÖNHITELESÍTÉS: lát-e az összehasonlító EGYÁLTALÁN eltérést?
    if (alap.equals(kontroll)) {
      return nemTudom('az összehasonlító a betűMÉRET változását sem látja (a ' + meret + ' és a '
        + kontrollMeret + ' képpontos szöveg azonos képet ad) — a renderelő valószínűleg nem rajzol '
        + 'szöveget, így se a zöld, se a piros nem lenne igaz');
    }

    const tinta = tintaAllapot(kert, szeles, magas);
    if (tinta === null) {
      return nemTudom('a próbakép pixelei nem értelmezhetők (' + kert.length
        + ' bájt / ' + szeles + 'x' + magas + ')');
    }
    if (tinta === false) {
      return {
        ok: false, nev,
        reason: 'a(z) „' + nev + '" betűvel a próbaszöveg TELJESEN ÜRES képet ad — a betűmotor nem rajzol '
          + 'vele glifát (csonka vagy hibás betűfájl?), a videó táblái szöveg nélkül mennének ki. '
          + 'Ellenőrizd ezt a fájlt: ' + BETU_FAJL
      };
    }

    if (kert.equals(alap)) {
      return {
        ok: false, nev,
        reason: 'a(z) „' + nev + '" betű NINCS TELEPÍTVE ezen a gépen — a próbakép pixelre azonos a nem '
          + 'létező „' + NINCS_ILYEN_BETU + '" családnév képével, tehát mindkettő ugyanarra az alapbetűre '
          + 'esett vissza. Helyette ez megy: ' + tartalekLista(nev) + ' — a videó szövege vékonyabb és más '
          + 'szélességű lesz a tervezettnél. Telepítsd a repóval utazó betűt: ' + BETU_FAJL
      };
    }

    return { ok: true, reason: '', nev };
  } catch (e) {
    // A hiba OKA nélkül a null csak annyit mondana: „valami baj van".
    return nemTudom('a renderelés hibára futott: ' + String(e?.message || e).split('\n')[0]);
  }
}
