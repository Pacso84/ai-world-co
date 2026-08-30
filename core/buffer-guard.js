// ===================================================================
// BUFFER-ŐRSZEM — látszik-e, ha a Threads/Instagram elhallgat? (2026-08-30)
// ===================================================================
//
// MI A BAJ. A Threads és az Instagram a Bufferen megy
// (`agents/social/buffer-poster.js`). Az a modul három sebből vérzett:
//
//   1. a fájl végi `main().catch(...)` ÖSSZEOMLÁSKOR IS `process.exit(0)`-t
//      hívott — szemben a `poster.js`-szel és a `reel-post.js`-szel, amik
//      1-gyel lépnek ki. A GitHub Actions így ZÖLD maradt egy ki nem ment
//      posztra;
//   2. semmilyen `memory/*-guard.json`-t nem írt, pedig a Reel pontosan ilyen
//      mintát használ (`memory/reel-guard.json`), és a napi riport olvassa is;
//   3. a `core/daily-report.js` egész fájljában egyetlen „buffer" szó sem volt.
//
// KÖVETKEZMÉNY: ha lejár a BUFFER_ACCESS_TOKEN, leválik egy csatorna, vagy a
// `createPost` hibát ad, a posztolás NÉMÁN áll le — csak a CI naplójába írva,
// ahová senki nem néz. 2026 nyarán volt már egy 9 napos néma Facebook-leállás
// pontosan ebből a mintából.
//
// ⚠️ MIÉRT ITT VAN A DÖNTÉS, ÉS NEM A POSZTERBEN. Sem a `buffer-poster.js`,
// sem a `daily-report.js` NEM IMPORTÁLHATÓ: mindkettő feltétel nélkül elindul
// a fájl végén (a poszter VALÓDI posztot küldene, a riport valódi Telegram-
// üzenetet). Egy tesztelhetetlen őrszem előbb-utóbb némán elromlik — ugyanaz a
// szétválasztás, mint a `report-window.js`-nél és a `guard-freshness.js`-nél.
//
// ⚠️ AMIT EZ A MODUL NEM VÁLLAL. Azt, hogy a poszt MEG IS JELENT. A Buffer
// „siker" válasza csak annyit jelent: „átvettem" (ugyanaz a lecke, mint a Make
// webhookjának 200-asa). Ez az őrszem a LÁNC MINKETI VÉGÉT méri: elindult-e a
// poszter, volt-e tokenje, élt-e a csatorna, elfogadta-e a Buffer a posztot.
// ===================================================================

import { writeFileSync, mkdirSync } from 'fs';

/** A `memory/` alatti fájlnév — EGY helyen, mert a riport is hivatkozik rá. */
export const GUARD_FAJL = 'buffer-guard.json';

const rovid = (x, n = 140) => String(x == null ? '' : x).slice(0, n);

/**
 * Mi számít gondnak EGY buffer-poszter futásban?
 *
 * @param {object} allapot  a poszter futásáról:
 *   osszeomlas       {string}   kivétel üzenete, ha a main() elszállt
 *   tokenVan         {boolean}  volt-e BUFFER_ACCESS_TOKEN
 *   socialMappa      {boolean}  megvolt-e a content/social mappa
 *   csatornaLekerdezes {'ok'|'bukott'|'kihagyva'}
 *   csatornaHiba     {string}   miért bukott a lekérdezés (a Buffer üzenete)
 *   csatornak        {Array}    a Buffer NYERS csatorna-listája (szűretlen)
 *   ismertCsatornak  {string[]} amikre ténylegesen dolgozunk
 *   hibak            {Array<{csatorna, slug, hiba}>}  bukott createPost-ok
 *   kikuldve         {number}
 * @returns {Array<{code: string, detail: string}>}
 */
export function bufferProblemak(allapot = {}) {
  const a = (allapot && typeof allapot === 'object' && !Array.isArray(allapot)) ? allapot : {};
  const ki = [];

  // ⚠️ ÖSSZEOMLÁSKOR CSAK EZ AZ EGY LELET. A többi mező ilyenkor hiányzik (a
  // main() el sem jutott odáig) — ha a hiányukat is gondnak vennénk, a riport
  // négy KITALÁLT hibát írna ki egy valódi helyett, és az igazi ok elveszne.
  if (a.osszeomlas) {
    return [{ code: 'BUFFER_OSSZEOMLAS', detail: 'a poszter összeomlott — ' + rovid(a.osszeomlas, 160) }];
  }

  // A leggyakoribb néma leállás: lejár vagy törlődik a token.
  if (a.tokenVan === false) {
    ki.push({ code: 'NINCS_TOKEN', detail: 'nincs BUFFER_ACCESS_TOKEN — a Threads és az Instagram NÉMA' });
  }

  if (a.socialMappa === false) {
    ki.push({ code: 'NINCS_SOCIAL_MAPPA', detail: 'nincs content/social mappa — a poszter némán visszafordult' });
  }

  // A lejárt token élesben ÍGY néz ki: a csatorna-lekérdezés UNAUTHENTICATED-et
  // ad. Az OKOT is kiírjuk — a puszta „nem sikerült" nem cselekvésre hívó.
  if (a.csatornaLekerdezes === 'bukott') {
    ki.push({
      code: 'CSATORNA_LEKERDEZES_BUKOTT',
      detail: 'a csatornákat nem sikerült lekérdezni — ' + (rovid(a.csatornaHiba) || 'ismeretlen ok')
    });
  }

  // LEVÁLT VAGY ZÁROLT CSATORNA. Ezt maga a Buffer jelenti (isDisconnected /
  // isLocked), a poszter pedig eddig NÉMÁN kiszűrte a listából — vagyis a
  // csatorna eltűnése és a „nincs mit posztolni" egyformán nézett ki.
  if (Array.isArray(a.csatornak)) {
    for (const c of a.csatornak) {
      if (!c || (!c.isDisconnected && !c.isLocked)) continue;
      ki.push({
        code: 'CSATORNA_LEVALT',
        detail: `${rovid(c.service, 20) || '?'} (${rovid(c.name, 30) || '?'}) `
          + (c.isDisconnected ? 'LEVÁLASZTVA' : 'ZÁROLVA') + ' — újra be kell kötni a Bufferben'
      });
    }
  }

  if (a.csatornaLekerdezes === 'ok' && Array.isArray(a.ismertCsatornak) && a.ismertCsatornak.length === 0) {
    ki.push({ code: 'NINCS_HASZNALHATO_CSATORNA', detail: 'egy használható csatorna sem maradt a Bufferben' });
  }

  if (Array.isArray(a.hibak)) {
    for (const h of a.hibak) {
      if (!h) continue;
      ki.push({
        code: 'POSZT_BUKOTT',
        detail: `${rovid(h.csatorna, 20) || '?'}: ${rovid(h.hiba) || 'ismeretlen hiba'}`
      });
    }
  }

  return ki;
}

/**
 * Egyetlen riport-sor a Buffer-csatornákról.
 *
 * ⚠️ ⚠️-vel KEZDŐDIK, és ez nem díszítés: a `core/report-noise.js`
 * vészjelzés-mintája (`VESZ_RX`) erre illeszkedik, tehát a zajszűrő SOSEM
 * némíthatja el. Egy néma leállás napokig UGYANAZT a mondatot adná — pont az
 * a szöveg, amit egy „csak ha változott" szabály másnapra elhallgattatna.
 *
 * GOND NÉLKÜL NINCS SOR. A csendes napok maradjanak csendesek; hogy a poszter
 * egyáltalán FUTOTT-e, azt a fájl `at` bélyege bizonyítja (a riport
 * frissesség-őre nézi, `core/guard-freshness.js`).
 */
export function bufferSor(guard) {
  const p = guard && Array.isArray(guard.problems) ? guard.problems : [];
  if (!p.length) return '';
  const MUTAT = 3;
  const reszek = p.slice(0, MUTAT).map(x => rovid(x?.detail || x?.code, 90));
  return `⚠️ BUFFER-ŐRSZEM (Threads · Instagram): ${p.length} gond — `
    + reszek.join(' · ') + (p.length > MUTAT ? ' …' : '');
}

/**
 * Feljegyzi, mi történt — a napi riport ebből olvas.
 *
 * SOHA NEM DOB: az állapot-írás hibája nem ronthatja el magát a posztolást
 * (ugyanaz a szabály, mint a `reelAllapot()`-nál).
 *
 * 🔑 SIKERES FUTÁSNÁL IS ÍR, üres `problems`-szel. Enélkül a „ma nem volt
 * dolga" és a „el sem indult" kívülről EGYFORMÁN nézne ki — ez a hiba a
 * témaismétlés-őrnél hónapokig rejtve maradt.
 */
export function irBufferGuard(ROOT, join, allapot = {}) {
  try {
    const dir = join(ROOT, 'memory');
    mkdirSync(dir, { recursive: true });
    const rec = {
      at: new Date().toISOString(),
      kikuldve: Number.isFinite(allapot?.kikuldve) ? allapot.kikuldve : 0,
      keres: Number.isFinite(allapot?.keres) ? allapot.keres : 0,
      csatornak: Array.isArray(allapot?.ismertCsatornak) ? allapot.ismertCsatornak : [],
      problems: bufferProblemak(allapot)
    };
    writeFileSync(join(dir, GUARD_FAJL), JSON.stringify(rec, null, 2), 'utf-8');
    return rec;
  } catch (e) {
    console.error('⚠️ a Buffer-őrszem írása nem sikerült:', rovid(e?.message, 100));
    return null;
  }
}

/**
 * A poszter futtatása ÚGY, hogy a kimenetele MINDIG bekerüljön az őr-fájlba —
 * sikerkor és bukáskor is.
 *
 * ⚠️ A SORREND A LÉNYEG, ÉS EZ ÉLES LECKE (reel-post.js, 2026-08-30): ott a
 * hibaágon `process.exit(1)` állt a hívó try/catch-e ELŐTT. A `process.exit()`
 * AZONNAL megöli a folyamatot, tehát az őrszem-írás SOSEM futott le: a
 * guard-fájlban az előző futás `ok:true`-ja maradt, a riport pedig hallgatott.
 * Itt ezért ELŐBB az őr-fájl, és a hiba csak UTÁNA megy tovább — a kilépőkódot
 * a hívó adja, a fájl végén.
 *
 * A hibát TOVÁBBADJA. A nem nulla kilépőkód a CI-nak szól, az őr-fájl a napi
 * riportnak — a kettő nem helyettesíti egymást (a workflow `|| true`-ja miatt
 * a CI-napló amúgy sem jut el senkihez).
 *
 * @param {object} p
 * @param {boolean} [p.eles]  próba/séma-ellenőrző módban FALSE: egy helyi
 *   `--dry` futás különben friss `at`-ot és üres `problems`-et hagyna, vagyis
 *   épp azt hazudná a riportnak, hogy az ÉLES poszter rendben lefutott.
 */
export async function futtatBuffer({ ROOT, join, fn, eles = true }) {
  try {
    const allapot = await fn();
    if (eles) irBufferGuard(ROOT, join, allapot || {});
    return allapot;
  } catch (e) {
    if (eles) irBufferGuard(ROOT, join, { osszeomlas: String(e?.message || e) });
    throw e;
  }
}
