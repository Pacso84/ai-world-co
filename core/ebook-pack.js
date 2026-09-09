// ===================================================================
// FIZETŐS CSOMAG — „The Everyday AI Starter Pack" (2026-09-09)
// ===================================================================
//
// USER-DÖNTÉS (2026-09-09): PDF-csomag · angolul · Ko-fi · $9 · vegyes téma.
// Előzmény: a 2026-07-31-i „csináljunk pénzért anyagot" terv, ami sosem
// indult el. A tartalom KÉSZ — 414 örökzöld útmutató megy át egy szigorú
// minőségi mércén (≥4 lépés, ≥900 szó, „Common mistakes", brand-szekció).
//
// ⚠️ ELLENŐRIZVE, MIELŐTT BÁRMIT KÉRTÜNK VOLNA A USERTŐL:
//   • Ko-fi Shop ÁRUL digitális letöltést, a bolt INGYENES, a jutalék 5%
//     (+ kártyadíj), és NEM kell hozzá Ko-fi Gold. (Saját lekérdezés.)
//   • A PDF-lánc működik: markdown → `marked` → HTML → fejetlen Chrome.
//     Bizonyítva: valódi `%PDF-1.4` fájl, új függőség nélkül, $0.
//
// ⚠️ EZ NEM CI-LÉPÉS. Egyszeri gyártás a fejlesztő gépén; a CI-ban nincs
// Chrome, és nincs is rá szükség. A csomag ritkán változik.
//
// ── HÁROM SZABÁLY, AMI NEM ALKU TÁRGYA ────────────────────────────
//
// 1. A TARTALOM INGYEN KINT VAN A HONLAPON. Aki fizet, VÁLOGATÁST,
//    offline/nyomtatható formát és hirdetésmentességet vesz — nem titkos
//    tudást. A csomag szövege ezt MONDJA KI, nem kerülgeti.
// 2. AZ AI-SZERZŐSÉG KIMEGY. A cikkeink alján ott a nyilatkozat; a PDF-be
//    is bekerül. Épp keresői büntetésben vagyunk gépi tartalom miatt —
//    egy eltitkolt szerzőség ennél sokkal drágább lenne.
// 3. MINDEN ÚTMUTATÓ A HONLAPRÓL VAN, VÁLTOZTATÁS NÉLKÜL. Nem írjuk át
//    AI-val „termékké": az új szöveg új kockázat, és a meglévő már átment
//    az összes kapunkon.
//
// ── A VÁLOGATÁS SZABÁLYA ──────────────────────────────────────────
// Öt élet-terület, területenként öt útmutató. A rangsor a RÉSZLETESSÉG
// (lépésszám, majd hossz), DE változatossággal:
//
// 🔑 UGYANAZ A LECKE, MINT A REEL-SORNÁL (2026-09-09, ugyanaznap): ha csak
// „a legrészletesebb ötöt" venném, könnyen öt „Getting started with…"
// kerülne egymás mellé, mert a tartalmunk KÖTEGEKBEN készült. A csomagon
// BELÜL is kell változatosság — eszközre és cím-kezdetre.
// ===================================================================

import { TEMAK, temaOf } from './topics.js';

/** A minőségi mérce: mi kerülhet EGYÁLTALÁN fizetős csomagba. */
export const MIN_LEPES = 4;
export const MIN_SZO = 900;

/**
 * Az öt élet-terület. A minta SZIGORÚ, és ennek oka van: az első,
 * lazább változatom a „**Safely** Rename a Batch of Photos" címet
 * biztonsági útmutatónak vette — pedig fotó-átnevezésről szól.
 * Egy laza minta itt nem zaj, hanem ROSSZ TERMÉK.
 */
// ⚠️ A TÉMA-BESOROLÁS 2026-09-10 óta a KÖZÖS `core/topics.js`-ben lakik,
// mert két dolog használja: ez a csomag ÉS a téma-hub oldalak. Amíg itt
// volt, a mintái nem tűrték a többes számot (`email` nem illeszkedik az
// "emails"-re), és ezért a 424 útmutatóból 255 BESOROLATLAN volt — vagyis ez
// a válogatás is szűkebb halmazból dolgozott, mint kellett volna.
export const TERULETEK = TEMAK;

export const DB_TERULETENKENT = 5;

/**
 * KÜLÖNLEGES HARDVERT/ELŐFIZETÉST IGÉNYLŐ ESZKÖZÖK — ezek NEM valók egy
 * „hétköznapi embereknek" szóló $9-es kezdő csomagba.
 *
 * ⚠️ EZ EGY VALÓDI LELETBŐL SZÜLETETT: az első válogatásom élére egy
 * „home-assistant chatbot NVIDIA ChatRTX-szel" került, mert az volt a
 * legrészletesebb. Csakhogy ahhoz RTX VIDEOKÁRTYA kell. 🔑 A LEGRÉSZLETESEBB
 * NEM AZONOS A LEGHASZNÁLHATÓBBAL — a rangsor a mélységet méri, a vevő
 * viszont azt kérdezi: „ezt én meg tudom csinálni?".
 *
 * EXPLICIT LISTA, sosem előtag-illesztés (a projekt szótár-elve: az
 * `analysis → analyzis` csapda kétszer megfogott).
 */
export const SZUK_ESZKOZ = ['chatrtx', 'image playground', 'apple intelligence'];

/** A cím a markdown frontmatteréből. */
export function cimBol(md) {
  return (String(md || '').match(/^title:\s*"?([^"\n]+?)"?\s*$/m) || [])[1] || '';
}

/** Lépések száma — ugyanaz a minta, amit az ígéret-fedezet használ. */
export function lepesSzam(md) {
  return (String(md || '').match(/^#{2,3}\s+(step\s*\d|\d+[.)]\s)/gim) || []).length;
}

/** Alkalmas-e EGYÁLTALÁN fizetős csomagba? */
export function alkalmas(c) {
  const md = String(c?.md || '');
  if (!md) return false;
  if (lepesSzam(md) < MIN_LEPES) return false;
  if (md.split(/\s+/).length < MIN_SZO) return false;
  // A két kötelező szekció: enélkül a csomag nem egyenletes.
  if (!/##\s*Common mistakes/i.test(md)) return false;
  if (!/what this means for you/i.test(md)) return false;
  // Különleges hardver/előfizetés → nem hétköznapi olvasónak való.
  if (SZUK_ESZKOZ.includes(String(c?.tool || '').trim().toLowerCase())) return false;
  return !!cimBol(md);
}

/**
 * Melyik ÉLET-TERÜLETRE tartozik? Az ELSŐ illeszkedő nyer, a TERULETEK
 * sorrendjében.
 *
 * ⚠️ EZÉRT KÜLÖN LÉPÉS, ÉS EZT EGY VALÓDI HIBA TANÍTOTTA MEG: az első
 * változatom területenként a TELJES készletből válogatott, ezért ami a
 * Home top-5-jéből kimaradt, ÁTSZIVÁRGOTT a következő területre. Így lett
 * a „Money & admin" öt cikkéből három étkezés-tervezés és nyaralás.
 * Előbb BESOROLUNK, aztán rangsorolunk a területen BELÜL.
 */
export function teruletOf(c) {
  return temaOf(cimBol(c?.md));
}

/** A „forma": mitől néz ki két útmutató egyformának EGY CSOMAGON BELÜL. */
export function forma(c) {
  const szavak = cimBol(c?.md).toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(Boolean);
  return { eszkoz: String(c?.tool || '').trim().toLowerCase(), kezdet: szavak.slice(0, 3).join(' ') };
}

/**
 * A csomag tartalma: öt terület, területenként öt útmutató.
 *
 * @param {Array<{slug:string, tool:string, md:string}>} cikkek
 * @returns {Array<{id:string, cim:string, cikkek:Array}>}
 */
export function valogat(cikkek, { dbTeruletenkent = DB_TERULETENKENT } = {}) {
  const jo = (Array.isArray(cikkek) ? cikkek : []).filter(alkalmas);
  // A RÉSZLETESEBB elöl: több lépés, majd hosszabb szöveg.
  jo.sort((a, b) => lepesSzam(b.md) - lepesSzam(a.md) || b.md.length - a.md.length);

  // 1) BESOROLÁS — minden útmutató PONTOSAN egy területre (első illeszkedő).
  const szerint = new Map(TERULETEK.map(t => [t.id, []]));
  for (const c of jo) {
    const t = teruletOf(c);
    if (t) szerint.get(t).push(c);
  }

  // 2) RANGSOR A TERÜLETEN BELÜL, változatossággal.
  const ki = [];
  for (const ter of TERULETEK) {
    const mezony = szerint.get(ter.id) || [];
    const valasztott = [];
    const voltEszkoz = new Set(), voltKezdet = new Set();
    // KÉT KÖR: előbb csak változatosat veszünk, aztán — ha nem telt ki —
    // feltöltjük. Így a csomag SOSEM lesz hiányos a változatosság miatt.
    for (const csakValtozatos of [true, false]) {
      for (const c of mezony) {
        if (valasztott.length >= dbTeruletenkent) break;
        if (valasztott.includes(c)) continue;
        const f = forma(c);
        if (csakValtozatos) {
          if (f.eszkoz && voltEszkoz.has(f.eszkoz)) continue;
          if (f.kezdet && voltKezdet.has(f.kezdet)) continue;
        }
        valasztott.push(c);
        if (f.eszkoz) voltEszkoz.add(f.eszkoz);
        if (f.kezdet) voltKezdet.add(f.kezdet);
      }
    }
    ki.push({ id: ter.id, cim: ter.cim, cikkek: valasztott });
  }
  return ki;
}

export default { valogat, alkalmas, forma, teruletOf, cimBol, lepesSzam, TERULETEK, SZUK_ESZKOZ, MIN_LEPES, MIN_SZO, DB_TERULETENKENT };
