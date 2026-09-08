// ===================================================================
// NEM INDEXELENDŐ NYELVEK (2026-09-08, user-döntés)
// ===================================================================
//
// A LELET, ami kiváltotta. 2026-08-21-én a Bing lépcsőfüggvényként
// kikapcsolt minket: napi 38-76 megjelenésről PONTOSAN nullára, és azóta
// végig. Közben az indexe 785 → 1415-re NŐTT, a feltérképezés napi 113,
// robots-tiltás 0 — vagyis INDEXEL, DE NEM SZOLGÁL KI. Bizonyítva: négy
// oldal, amit a Bing maga hozott a 4-8. helyen, ma egyik sem jön vissza a
// saját, szó szerinti mondatára (a kontroll — egy Wikipédia-mondat — igen).
// A Google ugyanezt lassabban: 90 nap alatt 16 kattintás, és 2067
// „feltérképezve – nincs indexelve", NÖVEKVŐ trenddel.
//
// A technikai réteg TISZTA (robots, canonical, hreflang, 200-ak, nincs
// cloaking). A legvalószínűbb ok: TÖMEGES GÉPI TARTALOM egy fiatal, 3
// bejövő linkes domainen — mindkét kereső irányelve nevesíti ezt.
//
// ── AMIT EZ A MODUL CSINÁL ────────────────────────────────────────
// Kevesebb gépi oldalt mutatunk a keresőknek. A magyar ág mérlege
// (saját forgalmi napló, 37 nap, 2026-08-02 … 09-07):
//
//     nyelv   beküldött oldal        látogató
//     angol   2822  (60%)      1733  (95,4%)
//     /hu/     940  (20%)        13  ( 0,7%)   ← 0,35 látogató NAPONTA
//     /es/     940  (20%)        70  ( 3,9%)   ← és NŐ: 14 napon 6,8%
//
// A magyar a beküldött címek ötöde, és a látogatók 0,7%-át hozza — ráadásul
// egy AMERIKAI közönségre épített oldalon. A spanyol NEM ugyanaz az eset:
// az javul, ezért marad indexelve.
//
// 🔑 EZ NEM TÖRLÉS. A fájlok, az URL-ek és a nyelvváltó MARADNAK: aki a
// linket megkapja, ugyanúgy elolvassa. Csak azt kérjük a keresőktől, hogy
// ne vegyék be az indexükbe. Egyetlen sor visszavonja — szemben a DE/FR
// törléssel (2026-08-25), ami VÉGLEGES volt, mert újrafordítás kellene.
//
// ⚠️ MIÉRT META-CÍMKE, ÉS NEM robots.txt. Egy `Disallow: /hu/` szabály
// megtiltaná a feltérképezést — akkor viszont a kereső EL SEM OLVASNÁ a
// noindexet, és a már bent lévő címek bent ragadnának, örökre. A tiltás és
// a kivezetés nem ugyanaz.
//
// ⚠️ MIÉRT VAN EGY HELYEN. A szabály öt ponton hat (robots-meta, hreflang,
// sitemap, seo-őrszem, IndexNow). „Egy szám, ami több helyre van kimásolva,
// matematikai biztonsággal szétcsúszik" — ezért importálja mind az öt
// innen, és ezért van rá teszt.
//
// HA VISSZA KELL VONNI: `NOINDEX_LANGS = []`. Ennyi. A következő build
// mindenhonnan leveszi a címkét, és visszateszi a címeket a sitemapbe.
// ===================================================================

/**
 * Azok a nyelvi ágak, amelyeket NEM akarunk a keresők indexében.
 * ⚠️ Ez NEM azonos a `core/retired-langs.js` listájával: az a VÉGLEG TÖRÖLT
 * nyelveké (de, fr — azok 301-et kapnak). Ezek a lapok ÉLNEK és elérhetők.
 */
export const NOINDEX_LANGS = ['hu'];

/** Ki van-e zárva ez a nyelv az indexelésből? */
export function noindexNyelv(lang) {
  return NOINDEX_LANGS.includes(String(lang == null ? '' : lang).trim().toLowerCase());
}

/**
 * A `<meta name="robots">` tartalma egy adott nyelvhez.
 *
 * ⚠️ A `max-image-preview:large` MINDIG BENNE MARAD, a noindexes ágon is.
 * Két okból: (1) a `core/seo-guard.js` `NO_DISCOVER_META` szabálya minden
 * mintavett oldalon megköveteli, és e nélkül minden futásban hamisan
 * riasztana; (2) ha a döntést visszavonjuk, a Discover-beállítás magától a
 * helyén van — nem kell rá emlékezni.
 *
 * A `follow` szándékos: a lap NE kerüljön az indexbe, de a rajta lévő
 * linkeket a kereső KÖVESSE — így az angol cikkekre mutató belső
 * hivatkozások értéke nem vész el.
 */
export function robotsTartalom(lang) {
  const alap = 'max-image-preview:large, max-snippet:-1, max-video-preview:-1';
  return noindexNyelv(lang) ? `noindex, follow, ${alap}` : alap;
}

/**
 * A megadott nyelvek közül azok, amelyeket HIRDETHETÜNK a keresőknek
 * (hreflang, sitemap, IndexNow).
 *
 * ⚠️ Egy noindexelt lapra mutató hreflang ellentmondás: azt állítanánk, hogy
 * „ez ugyanez a tartalom magyarul", miközben megkérjük a keresőt, hogy ne
 * vegye fel. A látogató nyelvváltója ettől FÜGGETLEN — az a `SITE_LANGS`-ból
 * épül, és minden nyelvet mutat.
 */
export function indexelhetoNyelvek(langs) {
  return (Array.isArray(langs) ? langs : []).filter(l => !noindexNyelv(l));
}

/**
 * A `core/seo-guard.js` noindex-ellenőrzése — ITT, mert ott NEM TESZTELHETŐ.
 *
 * ⚠️ MIÉRT KÖLTÖZÖTT IDE. A `seo-guard.js` a fájl végén feltétel nélkül hívja
 * a `main()`-t, tehát a puszta importja lefuttatná az egész őrjáratot, és
 * felülírná a `memory/seo-guard.json` élő állapotfájlt. Az ott lakó logikát
 * ezért SOHA nem lehetne tesztelni — és mutációval ki is derült: amikor
 * kísérletként visszaállítottam a régi, hibás feltételt, minden teszt ZÖLD
 * MARADT. Márpedig az a hiba minden futásban hamisan riasztana, és a zajban
 * a valódi SEO-lelet veszne el.
 *
 * 🔑 MINDKÉT IRÁNYT NÉZI. „Minden mérce IRÁNYA számít": a noindexnek nem
 * szabad ott lennie, ahol nem kértük — és OTT KELL lennie, ahol kértük. Ha
 * csak az egyik irányt néznénk, a címke néma eltűnése (pl. egy build-átírás
 * után) észrevétlen maradna, és a 940 magyar lap visszaszivárogna az indexbe.
 *
 * @param {string} rel a lap útja a kimeneten belül (pl. `/hu/index.html`)
 * @param {string} html a lap forrása
 * @returns {null|{kod:string, uzenet:string}}
 */
export function noindexKifogas(rel, html) {
  const ut = String(rel == null ? '' : rel).replace(/\\/g, '/').replace(/^\//, '');
  const nyelv = ut.split('/')[0];
  const van = /name="robots"[^>]*noindex|noindex[^>]*name="robots"/i.test(String(html || ''));
  const kell = noindexNyelv(nyelv);
  if (van && !kell) return { kod: 'NOINDEX', uzenet: `noindex címke egy indexelendő oldalon: /${ut}` };
  if (!van && kell) return { kod: 'NOINDEX_HIANYZIK', uzenet: `a noindex ELTŰNT egy kivezetett nyelvi oldalról: /${ut}` };
  return null;
}

export default { NOINDEX_LANGS, noindexNyelv, robotsTartalom, indexelhetoNyelvek, noindexKifogas };
