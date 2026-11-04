// ===================================================================
// TESZT-ŐRSZEM — pirosak-e a kapuink, és tud-e róla a user? (2026-09-06)
// ===================================================================
//
// MI A BAJ VOLT. 2026-08-31-én a tény-ellenőrző agent egy ÉLŐ cikkben átírta a
// valódi „ChatRTX" terméknevet a nem létező „NVIDIA Chat"-re. A
// `core/tool-kinds.test.js` EZT PONTOSAN ELKAPTA („BESOROLATLAN CÉG: NVIDIA
// Chat") — vagyis a védelem jól van megtervezve, és időben tüzelt.
//
// 🔑 CSAK ÉPPEN SENKI NEM HALLOTTA. A `.github/workflows/auto.yml` NEM
// futtatott teszteket, `npm test` pedig csak akkor fut, ha egy ember leül a
// géphez. A teszt öt napig pirosan állt, és a kitalált terméknév öt napig kint
// volt élesben, HÁROM NYELVEN. Ugyanígy a `core/budget.test.js` is szeptember
// 1-je óta piros volt (naptári határon romlott el) — szintén észrevétlenül.
//
// Ez a projekt saját, kimondott szabálya: „AZ ŐRSZEM CSAK AKKOR ŐR, HA ODASZÓL,
// AHOL A USER NÉZ." A CI-naplóba írni annyi, mintha senkinek nem szólnál — a
// user a napi Telegram-riportot nézi.
//
// ── A TERVEZÉSI KÖTÖTTSÉG ───────────────────────────────────────────
// A TESZTBUKÁS NEM ÁLLÍTHATJA MEG A PIPELINE-T. Egy elromlott teszt miatt
// leállítani a cég működését sokkal drágább, mint a hiba maga: a tartalomnak
// akkor is mennie kell. A CI-lépés ezért `|| true`-val fut — a láthatóságot
// NEM a kilépőkód adja, hanem ez az őr-fájl + a napi riport.
//
// ⚠️ MIÉRT ITT VAN A DÖNTÉS, ÉS NEM A FUTTATÓBAN. A `core/daily-report.js` NEM
// IMPORTÁLHATÓ (a fájl végén feltétel nélkül hívja a main()-t → valódi
// Telegram-üzenetet küld és pénzt költ), a `core/run-tests.js` pedig egy
// tesztből indítva ÖNMAGÁT futtatná újra, végtelen ciklusban. Egy tesztelhetetlen
// őrszem előbb-utóbb némán elromlik — ugyanaz a szétválasztás, mint a
// `buffer-guard.js`-nél és a `guard-freshness.js`-nél.
//
// ⚠️ AMIT EZ A MODUL NEM VÁLLAL. Azt, hogy a tesztek JÓK. Csak azt méri, hogy
// LEFUTOTTAK-E és ZÖLDEK-E. Egy nem létező teszt hiánya továbbra is néma marad
// — az egyetlen ellenszer a `NINCS_TESZTFAJL` lelet, ami a védőháló TELJES
// eltűnését fogja meg.
// ===================================================================

import { writeFileSync, mkdirSync } from 'fs';

/** A `memory/` alatti fájlnév — EGY helyen, mert a riport is hivatkozik rá. */
export const GUARD_FAJL = 'test-guard.json';

/** Ennyi bukott fájlnevet írunk ki; a DARABSZÁM ettől függetlenül pontos. */
const MUTAT = 6;

const rovid = (x, n = 60) => String(x == null ? '' : x).slice(0, n);

/**
 * A „nem tudjuk" mondat. SZÁNDÉKOSAN nem néma:
 *
 * 🔑 A hiányzó állapotfájlt csendnek venni PONT az a hiba, ami miatt a
 * tool-kinds teszt öt napig pirosan állhatott. A „nincs adat" és a „minden
 * rendben" kívülről egyformán néz ki — ezért itt kimondjuk a különbséget.
 * (Ugyanaz a lecke, mint a témaismétlés-őrnél és a `guard-freshness.js`-nél:
 * ha egy számláló bukást jelent, kell út VISSZA a nullához is — de a hiányzó
 * mérés nem nulla, hanem ismeretlen.)
 */
const NEM_TUDOM = '⚠️ TESZT-ŐRSZEM: NEM TUDOM, zöldek-e a tesztek — hiányzik vagy '
  + 'olvashatatlan a memory/' + GUARD_FAJL + '. Ez NEM azt jelenti, hogy rendben van.';

/**
 * Mi számít gondnak EGY teszt-futtatásban?
 *
 * @param {object} allapot  a `core/run-tests.js` futásáról:
 *   osszeomlas {string}    kivétel üzenete, ha maga a futtató szállt el
 *   osszes     {number}    hány tesztfájlt talált
 *   bukottak   {string[]}  a bukott fájlok nevei
 * @returns {Array<{code: string, detail: string}>}
 */
export function tesztProblemak(allapot = {}) {
  const a = (allapot && typeof allapot === 'object' && !Array.isArray(allapot)) ? allapot : {};

  // ⚠️ ÖSSZEOMLÁSKOR CSAK EZ AZ EGY LELET. A többi mező ilyenkor hiányzik (a
  // futtató el sem jutott odáig) — ha a hiányukat is gondnak vennénk, a riport
  // KITALÁLT hibákat írna ki egy valódi helyett, és az igazi ok elveszne.
  // (Ugyanez a szabály a `core/buffer-guard.js`-ben.)
  if (a.osszeomlas) {
    return [{ code: 'TESZT_FUTTATO_OSSZEOMLAS', detail: 'a teszt-futtató elszállt — ' + rovid(a.osszeomlas, 160) }];
  }

  // 🕳️ A VÉDŐHÁLÓ ELTŰNÉSE ugyanúgy néz ki, mint a tökéletes futás: 0 bukott.
  // Ha a mappa elköltözik vagy a szűrő elromlik, ez a lelet választja szét a
  // kettőt — enélkül a riport diadalmasan hallgatna egy üres tesztkészletre.
  if (Number.isFinite(a.osszes) && a.osszes === 0) {
    return [{ code: 'NINCS_TESZTFAJL', detail: 'egyetlen *.test.js fájlt sem találtam — a védőháló nincs a helyén' }];
  }

  const bukottak = Array.isArray(a.bukottak) ? a.bukottak : [];
  return bukottak
    .filter(Boolean)
    .map(nev => ({ code: 'TESZT_BUKOTT', detail: rovid(nev, 60) }));
}

/**
 * Egyetlen riport-sor a tesztek állapotáról.
 *
 * ⚠️ ⚠️-vel KEZDŐDIK, és ez nem díszítés: a `core/report-noise.js`
 * vészjelzés-mintája (`VESZ_RX`) erre illeszkedik, tehát a zajszűrő SOSEM
 * némíthatja el. Egy napokig változatlan piros teszt pont az a szöveg, amit
 * egy „csak ha változott" szabály másnapra elhallgattatna — márpedig itt a
 * KITARTÓ pirosság maga a hír.
 *
 * MINDEN ZÖLD → ÜRES SOR. A csendes napok maradjanak csendesek; hogy a
 * futtató egyáltalán LEFUTOTT-e, azt a fájl `at` bélyege bizonyítja (a
 * riport frissesség-őre nézi, `core/guard-freshness.js`).
 *
 * @param {object|null} guard  a beolvasott memory/test-guard.json (vagy null)
 */
export function tesztSor(guard) {
  // Hiányzó / sérült / félbevágott állapotfájl: ISMERETLEN, nem „rendben".
  if (!guard || typeof guard !== 'object' || Array.isArray(guard) || !Array.isArray(guard.problems)) {
    return NEM_TUDOM;
  }

  const p = guard.problems.filter(Boolean);
  if (!p.length) return '';

  const osszeomlas = p.find(x => x.code === 'TESZT_FUTTATO_OSSZEOMLAS');
  if (osszeomlas) {
    return '⚠️ TESZT-ŐRSZEM: a teszt-futtató összeomlott — ' + rovid(osszeomlas.detail, 160)
      + '. A kapuk állapota ISMERETLEN.';
  }

  if (p.some(x => x.code === 'NINCS_TESZTFAJL')) {
    return '⚠️ TESZT-ŐRSZEM: egyetlen tesztfájlt sem találtam — a védőháló nincs a helyén.';
  }

  const bukottak = p.filter(x => x.code === 'TESZT_BUKOTT').map(x => rovid(x.detail, 60));
  if (!bukottak.length) {
    // Ismeretlen kód: inkább nyers felsorolás, mint néma átsiklás.
    return '⚠️ TESZT-ŐRSZEM: ' + p.length + ' ismeretlen lelet — '
      + p.slice(0, 3).map(x => rovid(x.code, 40)).join(', ');
  }

  const nevek = bukottak.slice(0, MUTAT).join(', ') + (bukottak.length > MUTAT ? ' …' : '');
  // A NEVEZŐ nélkül nem derül ki, mekkora a baj (1 bukott 71-ből ≠ 60 bukott
  // 71-ből). Ha hiányzik, inkább elhagyjuk, mint hogy kitaláljuk.
  const nevezo = Number.isFinite(guard.osszes) && guard.osszes > 0 ? ' / ' + guard.osszes : '';
  return `⚠️ TESZT PIROS: ${nevek} (${bukottak.length} bukott${nevezo})`;
}

/**
 * Feljegyzi, mi történt — a napi riport ebből olvas.
 *
 * SOHA NEM DOB: az állapot-írás hibája nem ronthatja el magát a teszt-futást
 * (ugyanaz a szabály, mint az `irBufferGuard()`-nál és a `reelAllapot()`-nál).
 *
 * 🔑 SIKERES FUTÁSNÁL IS ÍR, üres `problems`-szel. Enélkül a „ma minden zöld
 * volt" és a „el sem indult a lépés" kívülről EGYFORMÁN nézne ki — ez a hiba a
 * témaismétlés-őrnél hónapokig rejtve maradt.
 *
 * ⚠️ CSAK A CI HÍVJA (`node core/run-tests.js --guard`). A helyi `npm test`
 * szándékosan NEM ír: különben minden fejlesztői futás módosítaná a
 * `memory/`-t, és git-ütközést okozna a következő pull-nál — ugyanaz a
 * szabály, mint a `core/traffic-log.js`-nél.
 */
export function irTesztGuard(ROOT, join, allapot = {}) {
  try {
    const dir = join(ROOT, 'memory');
    mkdirSync(dir, { recursive: true });
    const rec = {
      at: new Date().toISOString(),
      osszes: Number.isFinite(allapot?.osszes) ? allapot.osszes : 0,
      // Csak a NEVEK — a teszt-kimenet nyers hibadumpja SOHA nem kerülhet
      // állapotfájlba (MACHINE_NOISE lecke: egy JSON-hibaüzenet 305× olvasódott
      // vissza az író promptjába).
      bukottak: Array.isArray(allapot?.bukottak) ? allapot.bukottak.slice(0, 40).map(x => rovid(x, 60)) : [],
      problems: tesztProblemak(allapot)
    };
    writeFileSync(join(dir, GUARD_FAJL), JSON.stringify(rec, null, 2), 'utf-8');
    return rec;
  } catch (e) {
    console.error('⚠️ a teszt-őrszem írása nem sikerült:', rovid(e?.message, 100));
    return null;
  }
}
