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
// A rangsor a RÉSZLETESSÉG (lépésszám, majd hossz), DE változatossággal:
//
// 🔑 UGYANAZ A LECKE, MINT A REEL-SORNÁL (2026-09-09, ugyanaznap): ha csak
// „a legrészletesebb ötöt" venném, könnyen öt „Getting started with…"
// kerülne egymás mellé, mert a tartalmunk KÖTEGEKBEN készült. A csomagon
// BELÜL is kell változatosság — eszközre és cím-kezdetre.
//
// ===================================================================
// A TERMÉKSZERKEZET (user-döntés, 2026-09-18): 8 MINI + 1 NAGY, 2 NYELVEN
// ===================================================================
// 8 mini-csomag, témánként egy (`core/topics.js` TEMAK), célméret 12 útmutató,
// plusz 1 nagy gyűjtemény (`all`). Mindkét nyelven: `en` + `es`.
//
// ⚠️ A NAGY CSOMAG SZÁNDÉKOSAN TARTALMAZZA A NYOLC KICSIT — MARADÉKTALANUL.
// Ez nem véletlen és nem lustaság, hanem MAGA A TERMÉKÍGÉRET: aki előbb a
// „Work & email" minit veszi meg, majd a gyűjteményt is, ne fedezzen fel egy
// átfedést, amit nem jelentettünk be. Két rossz alternatíva volt:
//   a) a nagy KIHAGYJA a minik cikkeit → a gyűjtemény pont a legjobb 85
//      útmutatót nem tartalmazza, vagyis a drágább termék a gyengébb;
//   b) a nagy MÁSHOGY válogat ugyanabból → véletlenszerű, kimagyarázhatatlan
//      átfedés, amit se mi, se a vevő nem tud előre kiszámolni.
// Ezért a nagy csomag témánként UGYANAZZAL a rangsorral indul, és csak
// utána mélyít. A szerkezetet TESZT őrzi (`ebook-pack.test.js`) — mert ha
// egyszer elcsúszik, az a VEVŐNEK tűnik fel, nem nekünk.
//
// 🚫 NINCS TERMÉK 3 CIKK ALATT (MIN_CSOMAG). Ugyanaz az elv, mint a heti
// videónál: inkább NE legyen termék, mint rossz termék. A `csomag()` ilyenkor
// nem üres fájlt gyárt, hanem visszaad egy OKOT, amit a hívó kiír.
//
// 🌐 A SPANYOL ÁG NEM KERÜL PÉNZBE: mind a 399 alkalmas útmutatónak KÉSZ a
// fordítása a `content/translations/`-ban (kimérve 2026-09-18) — itt sem AI-t
// nem hívunk, sem fordítót. ⚠️ ÉS SOHA NEM ESÜNK VISSZA NÉMÁN AZ ANGOLRA:
// ez a projekt visszatérő hibája (2026-08-04, `core/translation-guard.js`),
// amikor a fordító TITLE-sor híján az angolt mentette spanyol cikként, és 3
// cím 47 oldalra ült ki. Fizetős terméknél ez visszatérítés.
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

/** Egy MINI csomag célmérete. Ahol ennyi nincs, annyi lesz, amennyi van. */
export const DB_MINI = 12;

/**
 * A NAGY gyűjtemény felső határa — cikkben, nem oldalban, mert a cikkszám az,
 * amit a válogatás ténylegesen szabályoz.
 *
 * MÉRVE (2026-09-18, 399 alkalmas útmutató): átlag 1496 szó/útmutató, és
 * 600 szó/oldal → 150 útmutató ≈ 374 oldal. Ez már egy vaskos gyűjtemény;
 * feljebb a PDF mérete és a letöltés lesz a vevő problémája.
 *
 * ⚠️ A BESOROLATLAN ÚTMUTATÓK SZÁNDÉKOSAN KIMARADNAK a nagy csomagból is.
 * Mérve: 399 alkalmasból 276 kap témát, 123 nem. A gyűjtemény SZERKEZETE
 * maga a téma-beosztás; egy „Egyebek" fejezet töltelék lenne, névvel, amit
 * három nyelven kellene kitalálni. És nincs is rá szükség: a 276 besorolt
 * MAGÁBAN több, mint a plafon (150) — nem a készlet szűk.
 */
export const DB_NAGY = 150;

/** Ennél kevesebb útmutatóból NEM gyártunk terméket. */
export const MIN_CSOMAG = 3;

/**
 * Szó/oldal — MÉRVE, nem tippelve (2026-09-09): az első becslésem 380 volt,
 * a legyártott PDF 600-at adott, a 104 oldalas jóslatból 66 lett. Egy jóslat,
 * amit nem hitelesítünk a kimeneten, marketing-szám.
 *
 * ⚠️ 2026-09-18-án ÚJRA HITELESÍTVE, 6 legyártott PDF valódi oldalszámán:
 *     starter-pack 101 oldal (633 szó/oldal) · work-en 34 (604) ·
 *     work-es 39 (568) · all-en 340 (679) · money-en 27 (346) · money-es 28 (356)
 * Az arány a NAGY csomagokra jó (0–12% eltérés), a MONEY csomagra viszont
 * ~40%-kal ALÁBECSÜL — mindkét nyelven, tehát nem a fordítás az ok, hanem
 * maga a tartalom: a pénzügyi útmutatók táblázat- és listasűrűek, azok pedig
 * több függőleges helyet esznek ugyanannyi szóra. A 600 MARAD (ez a mért
 * átlag), de amit a BOLTBAN kiírunk oldalszámnak, azt a legyártott PDF-ből
 * vegyük, ne ebből a becslésből. A becslés tervezésre való, nem ígéretnek.
 */
export const SZO_PER_OLDAL = 600;

/** A csomag nyelvei. A `hu` KIMARAD: az egész honlap `/hu/` ága NOINDEX. */
export const NYELVEK = ['en', 'es'];

/**
 * A SPANYOL SZÖVEG MINIMÁLIS HOSSZ-ARÁNYA az angolhoz képest.
 * MÉRVE (2026-09-18, 399 cikk): a medián arány 1,10 (a spanyol HOSSZABB), az
 * alsó 5% is 1,00 — a mérce alatt mindössze 7 cikk van, mind a 2026-08-26-án
 * dokumentált CSONKA fordítások közül (0,38–0,57). A user döntése szerint a
 * meglévő csonkák az oldalon MARADNAK; egy FIZETŐS csomagba viszont nem
 * valók, ezért itt kiesnek.
 */
export const ES_MIN_ARANY = 0.6;

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

/**
 * A csomagba KERÜLŐ szöveg az adott nyelven — vagy `null`, ha nincs.
 *
 * 🔴 A `null` ITT A LÉNYEG. A kézenfekvő megoldás (`c.es || c.md`) pontosan
 * azt a hibát írná újra, ami 2026-08-04-én élesben megtörtént: a fordító
 * TITLE-sor nélkül NÉMÁN az angolt mentette spanyol cikknek, és a hiba a
 * kapcsolódó-dobozokon át 47 oldalra terjedt. A néma visszaesés azért
 * veszélyes, mert SIKERNEK LÁTSZIK. Inkább essen ki a cikk a spanyol
 * csomagból — a hívó látja a különbséget a darabszámon.
 *
 * Három jel, mind egy VALÓDI hibára válasz:
 *   1. van egyáltalán szöveg,
 *   2. van benne `title:` (ez hiányzott a 2026-08-04-i esetben),
 *   3. a cím NEM szó szerint az angol (ez maga a néma visszaesés), és
 *      a szöveg nem CSONKA (lásd ES_MIN_ARANY).
 */
export function szovegNyelven(c, nyelv = 'en') {
  const en = String(c?.md || '');
  if (nyelv !== 'es') return en || null;
  const es = String(c?.es || '').trim();
  if (!es) return null;
  const esCim = cimBol(es);
  if (!esCim || esCim === cimBol(en)) return null;
  if (es.length < en.length * ES_MIN_ARANY) return null;
  return es;
}

/** Szószám — ugyanaz a mérce, amit a minőségi kapu is használ. */
export function szoSzam(s) {
  return String(s || '').split(/\s+/).filter(Boolean).length;
}

/** Becsült oldalszám a MÉRT 600 szó/oldal arányból. */
export function oldalSzam(szo) {
  return Math.max(1, Math.round(szo / SZO_PER_OLDAL));
}

/** A „forma": mitől néz ki két útmutató egyformának EGY CSOMAGON BELÜL. */
export function forma(c) {
  const szavak = cimBol(c?.md).toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(Boolean);
  return { eszkoz: String(c?.tool || '').trim().toLowerCase(), kezdet: szavak.slice(0, 3).join(' ') };
}

/**
 * EGY terület TELJES sorrendje: rangsor + változatosság, felső határ nélkül.
 *
 * ⚠️ MIÉRT A TELJES SORREND, ÉS NEM „A LEGJOBB N": mert a nagy gyűjteménynek
 * a mini-csomag cikkeivel KELL kezdődnie (lásd a fejlécben a termékígéretet).
 * Ha a kettő külön hívással, külön határral válogatna, a két lista idővel
 * szétcsúszna — ugyanaz a „két példány" csapda, ami a cikk-sablonoknál
 * NÉGYSZER ütött be. Egy sorrend van; a mini az ELEJE, a nagy a HOSSZABB
 * eleje. A tulajdonság így SZERKEZETI, nem a jóindulaton múlik.
 *
 * KÉT KÖR: előbb csak változatosat veszünk (eszköz + cím-kezdet), aztán a
 * maradékot rangsor szerint. Így a csomag SOSEM lesz hiányos a
 * változatosság miatt — a vevőnek a DARABSZÁM az ígéret.
 */
export function sorrend(mezony) {
  const valasztott = [], mar = new Set();
  const voltEszkoz = new Set(), voltKezdet = new Set();
  for (const csakValtozatos of [true, false]) {
    for (const c of mezony) {
      if (mar.has(c)) continue;
      const f = forma(c);
      if (csakValtozatos) {
        if (f.eszkoz && voltEszkoz.has(f.eszkoz)) continue;
        if (f.kezdet && voltKezdet.has(f.kezdet)) continue;
      }
      valasztott.push(c); mar.add(c);
      if (f.eszkoz) voltEszkoz.add(f.eszkoz);
      if (f.kezdet) voltKezdet.add(f.kezdet);
    }
  }
  return valasztott;
}

/**
 * A csomag tartalma témánként.
 *
 * @param {Array<{slug:string, tool:string, md:string, es?:string}>} cikkek
 * @param {{dbTeruletenkent?:number, tema?:string|null, nyelv?:string,
 *          dbMini?:number, dbNagy?:number}} opt
 *   `tema`: `null` → a RÉGI viselkedés (mind a 8 terület, területenként 5 —
 *   ezt gyártja a paraméter nélküli CLI, és ezt őrzik a régi tesztek);
 *   egy téma-azonosító → egyetlen szakasz, `dbMini` cikkel;
 *   `'all'` → mind a 8 szakasz, a minikkel kezdve, a plafonig mélyítve.
 * @returns {Array<{id:string, cim:string, cikkek:Array}>}
 */
export function valogat(cikkek, {
  dbTeruletenkent = DB_TERULETENKENT, tema = null, nyelv = 'en',
  dbMini = DB_MINI, dbNagy = DB_NAGY
} = {}) {
  // A minőségi mérce MINDIG az angol eredetin fut: a `topics.js` mintái angol
  // szavak, és a lépés-számláló is angol („## Step 1"). A nyelv csak azt
  // szűri, KÉSZ-e a fordítás — így a spanyol csomag ugyanabból a rangsorból
  // dolgozik, nem egy másikból.
  const jo = (Array.isArray(cikkek) ? cikkek : [])
    .filter(c => alkalmas(c) && szovegNyelven(c, nyelv) !== null);
  // A RÉSZLETESEBB elöl: több lépés, majd hosszabb szöveg.
  jo.sort((a, b) => lepesSzam(b.md) - lepesSzam(a.md) || b.md.length - a.md.length);

  // 1) BESOROLÁS — minden útmutató PONTOSAN egy területre (első illeszkedő).
  const szerint = new Map(TERULETEK.map(t => [t.id, []]));
  for (const c of jo) {
    const t = teruletOf(c);
    if (t) szerint.get(t).push(c);
  }
  // 2) RANGSOR A TERÜLETEN BELÜL, változatossággal — területenként EGYSZER.
  const teljes = new Map(TERULETEK.map(t => [t.id, sorrend(szerint.get(t.id) || [])]));
  const szakasz = (t, db) => ({ id: t.id, cim: t.cim, cikkek: teljes.get(t.id).slice(0, db) });

  if (!tema) return TERULETEK.map(t => szakasz(t, dbTeruletenkent));

  if (tema !== 'all') {
    const t = TERULETEK.find(x => x.id === tema);
    return t ? [szakasz(t, dbMini)] : [];
  }

  // 3) A NAGY GYŰJTEMÉNY: a nyolc mini, majd KÖRBE-KÖRBE mélyítés a plafonig.
  // ⚠️ MIÉRT KÖRBE-KÖRBE, ÉS NEM „a legjobb 150": mert a készlet erősen
  // aránytalan (mérve: work 98, money 6). A puszta rangsor a gyűjtemény
  // kétharmadát munkahelyi útmutatóvá tenné, holott a termék ígérete a
  // HÉTKÖZNAPI ÉLET egésze. A mélyítés így minden területet egyszerre visz.
  const szakaszok = TERULETEK.map(t => szakasz(t, dbMini));
  let db = szakaszok.reduce((s, x) => s + x.cikkek.length, 0);
  for (let haladt = true; haladt && db < dbNagy;) {
    haladt = false;
    for (const sz of szakaszok) {
      if (db >= dbNagy) break;
      const sor = teljes.get(sz.id);
      if (sz.cikkek.length >= sor.length) continue;
      sz.cikkek.push(sor[sz.cikkek.length]);
      db++; haladt = true;
    }
  }
  return szakaszok;
}

/**
 * EGY KIADHATÓ CSOMAG — vagy egy OK, hogy miért nincs.
 *
 * 🚫 Ugyanaz az elv, mint a heti videónál: inkább NE legyen termék, mint
 * rossz termék. Egy 2 cikkes „csomag" a Ko-fi boltban nem szépséghiba,
 * hanem panasz. A hívó dolga kiírni az okot — a néma üres fájl a rosszabb.
 *
 * A számok MÉRTEK, nem becsültek: a szószám azon a szövegen fut, ami
 * TÉNYLEGESEN a csomagba kerül (spanyolnál a spanyolon).
 */
export function csomag(cikkek, { tema = 'all', nyelv = 'en', dbMini = DB_MINI, dbNagy = DB_NAGY } = {}) {
  if (!NYELVEK.includes(nyelv)) {
    return { ok: false, indok: `ismeretlen nyelv: „${nyelv}" (${NYELVEK.join(', ')})`, db: 0 };
  }
  if (tema !== 'all' && !TERULETEK.some(t => t.id === tema)) {
    return { ok: false, indok: `ismeretlen téma: „${tema}" (all, ${TERULETEK.map(t => t.id).join(', ')})`, db: 0 };
  }
  const szakaszok = valogat(cikkek, { tema, nyelv, dbMini, dbNagy });
  const mind = szakaszok.flatMap(sz => sz.cikkek);
  if (mind.length < MIN_CSOMAG) {
    return {
      ok: false, db: mind.length,
      indok: `csak ${mind.length} alkalmas útmutató van (a mérce ${MIN_CSOMAG}) — `
        + 'inkább ne legyen termék, mint rossz termék'
    };
  }
  const szo = mind.reduce((s, c) => s + szoSzam(szovegNyelven(c, nyelv)), 0);
  return { ok: true, tema, nyelv, szakaszok, db: mind.length, szo, oldal: oldalSzam(szo) };
}

export default {
  valogat, csomag, sorrend, alkalmas, forma, teruletOf, cimBol, lepesSzam,
  szovegNyelven, szoSzam, oldalSzam,
  TERULETEK, SZUK_ESZKOZ, NYELVEK, MIN_LEPES, MIN_SZO,
  DB_TERULETENKENT, DB_MINI, DB_NAGY, MIN_CSOMAG, SZO_PER_OLDAL
};
