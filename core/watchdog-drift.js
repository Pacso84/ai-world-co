// ===================================================================
// ŐRKUTYA-SODRÓDÁS (2026-09-07) — az ÉLŐ Worker régi kódot futtat-e?
// ===================================================================
// MI TÖRTÉNT: 2026-09-06-án a `TURELEM_ORA` 9,5 → 14 lett. A commit
// bement, a tesztje zöld volt, a napi jelentés hallgatott. Csakhogy ezt a
// döntést nem a repó futtatja, hanem a Cloudflare Worker — az pedig a
// `wrangler deploy` pillanatában befagyasztott bundle-ből dolgozik, és a
// Worker-telepítés NINCS a CI-ban. Utolsó deploy akkor: 2026-08-30.
//
// A javítás tehát 7 napig PAPÍRON volt meg. A számla, kimérve:
//     09-01 · 09-02 · 09-03 · 09-04 · 09-07 — mind fölösleges pótfutás,
//     mindegyik után 12-99 percen belül megjött az ütemezett futás magától.
//
// 🔑 A LELET ALAKJA: nem a kód volt rossz, hanem a JAVÍTÁS NEM ÉRT CÉLBA.
// Egy forrást olvasó teszt ezt SOHA nem látja — a forrásban minden rendben.
// Ezért ez a modul nem kódot mér, hanem a KÜLVILÁG VISELKEDÉSÉT:
//
//     ha egy pótfutás a türelem-küszöbnél KISEBB résnél sült el,
//     az cáfolhatatlan bizonyíték, hogy az élő kód nem a repóé.
//
// A logika azért ITT él és nem a jelentésben, mert így hálózat nélkül,
// ingyen tesztelhető — ugyanaz az elv, mint a `pipeline-watchdog.js`-nél.
//
// ⚠️ AMIT EZ AZ ŐR NEM LÁT (tudott vakfolt): a FORDÍTOTT sodródást, amikor
// az élő kód TÜRELMESEBB a repóénál. Az úgy nézne ki, hogy egy jogos
// pótfutás ELMARAD — csakhogy a pipeline magától is felépül, így nincs
// megbízható nyoma. Az itteni irány az, amelyik PÉNZBE kerül.
// ===================================================================

import { TURELEM_ORA } from './pipeline-watchdog.js';

/**
 * A pótfutás felismerése.
 *
 * ⚠️ AZ ESEMÉNY ÖNMAGÁBAN KEVÉS, ÉS EZ A HAMIS RIASZTÁS FŐ FORRÁSA.
 * A `repository_dispatch` KÉT dolgot takar nálunk (élesben mérve):
 *     display_title: "pipeline-catchup"  → az őrkutya
 *     display_title: "telegram-command"  → a user parancsa a botban
 * A user bármikor indíthat futást a telefonjáról, akár percekkel az előző
 * után. Puszta eseményre szűrve minden gombnyomása „sodródás" lenne.
 */
export const CATCHUP_CIM = 'pipeline-catchup';

/**
 * Meddig nézünk vissza.
 *
 * 🔑 30 ÓRA, MERT A NAPI JELENTÉS NAPONTA EGYSZER MEGY KI (a dedup miatt).
 * 24 óránál rövidebb ablaknál egy kicsit később kiküldött jelentés
 * kihagyhatná a tegnapi leletet — a hiba némán elveszne. Tágabb ablak
 * viszont napokig ismételné a MÁR MEGJAVÍTOTT esetet; a jelentésben a zaj
 * ugyanolyan kártékony, mint a hallgatás.
 */
export const ABLAK_ORA = 30;

const ORA = 3600e3;

/**
 * Sodródik-e az élő őrkutya?
 *
 * @param {Array<{created_at:string, event:string, display_title:string}>} futasok
 *        a GitHub Actions futáslistája (tetszőleges sorrendben)
 * @param {object} [opts]
 * @param {number} [opts.turelemOra]  a repó szerinti türelem
 * @param {number} [opts.most]
 * @param {number} [opts.ablakOra]
 * @returns {{sodrodik:boolean, ismeretlen:boolean, esetek:Array<{at:string,resOra:number}>, turelemOra:number}}
 */
export function sodrodasVizsgalat(futasok, opts = {}) {
  const {
    turelemOra = TURELEM_ORA,
    most = Date.now(),
    ablakOra = ABLAK_ORA
  } = opts || {};

  // ⚠️ A „NEM TUDOM" NEM „RENDBEN". Ez a `shouldTrigger()` saját precedense:
  // adathiánynál nem állítunk semmit. Egy őr, ami üres kézzel „minden
  // rendben"-t mond, pontosan akkor hallgat, amikor a legnagyobb szükség
  // lenne rá — és a hallgatása utólag bizonyítéknak látszik.
  const ures = { sodrodik: false, ismeretlen: true, esetek: [], turelemOra };

  const mostMs = typeof most === 'number' && Number.isFinite(most) ? most : Date.parse(most);
  if (!Number.isFinite(mostMs)) return ures;
  if (!Array.isArray(futasok) || futasok.length === 0) return ures;

  // A GitHub a legfrissebbet adja elöl; a résszámoláshoz IDŐRENDBEN kell.
  // A bemenet sorrendjére sosem támaszkodunk.
  const lista = futasok
    .map(f => ({ ms: Date.parse(f?.created_at), at: f?.created_at, cim: f?.display_title }))
    .filter(x => Number.isFinite(x.ms))
    .sort((a, b) => a.ms - b.ms);

  if (lista.length === 0) return ures;

  const esetek = [];
  let merhetetlen = 0;

  for (let i = 0; i < lista.length; i++) {
    const f = lista[i];
    if (f.cim !== CATCHUP_CIM) continue;
    if ((mostMs - f.ms) / ORA > ablakOra) continue;   // már nem aktuális
    if ((mostMs - f.ms) < 0) continue;                // jövőbeli időbélyeg

    // Nincs mihez mérni: a rés kiszámíthatatlan. NEM mondjuk rá, hogy rendben.
    if (i === 0) { merhetetlen++; continue; }

    // 🔑 A RÉS A KÖZVETLENÜL ELŐZŐ FUTÁSHOZ MÉRENDŐ, AKÁRMI INDÍTOTTA.
    // A Worker a `runs?per_page=1` végpontot kérdezi: a legfrissebb futást,
    // eseménytől függetlenül. Ha itt csak az ütemezetteket néznénk, nagyobb
    // rést kapnánk, mint amit a Worker LÁTOTT — és egy valódi sodródást
    // „rendben"-nek minősítenénk.
    const resOra = (f.ms - lista[i - 1].ms) / ORA;
    if (resOra < turelemOra) esetek.push({ at: f.at, resOra });
  }

  // A mi mérésünk a pótfutás INDULÁSÁHOZ képest számol, a Worker viszont a
  // ~fél perccel korábbi őrjárathoz — vagyis a mi résünk MINDIG kicsivel
  // nagyobb. A tévedés iránya tehát a hallgatás felé visz, nem a hamis
  // riasztás felé: ha nálunk a rés a küszöb alatt van, a Workeré is az volt.
  if (esetek.length > 0) return { sodrodik: true, ismeretlen: false, esetek, turelemOra };
  if (merhetetlen > 0) return ures;
  return { sodrodik: false, ismeretlen: false, esetek: [], turelemOra };
}

/**
 * A napi jelentés sora — `null`, ha nincs mondanivaló.
 *
 * A projekt bevett alakja (`keretSor`, `embedSor`): az őr HALLGAT, amíg
 * minden rendben. Adathiánynál is hallgat: abból nem csinálunk riasztást,
 * hogy egy lekérdezés nem sikerült — az a jelentés zaja lenne, nem a jele.
 */
export function sodrodasSor(eredmeny) {
  const e = eredmeny || {};
  if (!e.sodrodik || !Array.isArray(e.esetek) || e.esetek.length === 0) return null;

  const legfrissebb = e.esetek[e.esetek.length - 1];
  const res = legfrissebb.resOra.toFixed(1).replace('.', ',');
  const tur = String(e.turelemOra ?? TURELEM_ORA).replace('.', ',');
  const tobb = e.esetek.length > 1
    ? ` (${e.esetek.length} ilyen eset az elmúlt ${ABLAK_ORA} órában)` : '';

  // A tünet ÉS a teendő egy sorban — a user nem tudja kikeresni a megoldást.
  return `🕰️ ŐRKUTYA-SODRÓDÁS: pótfutás indult ${res} órás résnél, pedig a `
    + `türelem ${tur} óra${tobb} — az ÉLŐ Worker RÉGI kódot futtat. `
    + `Teendő: \`npx wrangler deploy\` a telegram-worker/ mappából.`;
}

/**
 * Ugyanaz a munkafolyamat, amit az őrkutya figyel. Ha ez elcsúszik, az őr
 * egy MÁSIK naptárat mérne, mint amit a Worker néz.
 */
const WORKFLOW = 'auto.yml';

/**
 * A futáslista lekérdezése — `null`, ha NEM SIKERÜLT.
 *
 * 🔑 A KÜLÖNBSÉG A `null` ÉS A `[]` KÖZÖTT ITT A LÉNYEG. Az üres lista azt
 * állítja: „megnéztem, nincs pótfutás" — vagyis minden rendben. Egy HTTP 500
 * viszont annyit jelent: „nem tudom". A két állapotot összemosni pontosan az
 * a hiba, amiért ez az egész modul készült, csak egy réteggel kijjebb: a
 * tiszta függvény hibátlan lehet, miközben a köré tekert I/O a kudarcból
 * megnyugtató választ gyárt.
 *
 * Hitelesítve kérdezünk, mert a hitelesítetlen GitHub-keret 60/óra ÉS
 * IP-CÍMENKÉNT számol — a futtatók osztott IP-t használnak (ezt az őrkutya
 * 2026-08-28-án a saját bőrén mérte ki: 7 lehetőségből 5-öt kihagyott).
 *
 * @param {object} [p]
 * @param {string} [p.repo]     „tulaj/repó" — a CI-ban a `GITHUB_REPOSITORY`
 * @param {string} [p.token]
 * @param {number} [p.darab]
 * @param {Function} [p.fetchFn] tesztben befecskendezve — SOHA nincs valódi hívás
 * @returns {Promise<Array|null>}
 */
export async function futasokLekerdez({
  repo = process.env.GITHUB_REPOSITORY || '',
  token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '',
  darab = 30,
  fetchFn = fetch
} = {}) {
  const r = String(repo || '').trim();
  // Hiányzó/rossz alakú repónál meg sem próbáljuk: a kérés úgyis 404 lenne,
  // csak elhasználná a keretet és zajt csinálna a naplóban.
  if (!/^[\w.-]+\/[\w.-]+$/.test(r)) return null;

  const url = `https://api.github.com/repos/${r}/actions/workflows/${WORKFLOW}`
    + `/runs?per_page=${darab}`;
  const fejlec = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'aiworld-watchdog-drift'
  };
  if (token) fejlec.Authorization = `Bearer ${token}`;

  try {
    const v = await fetchFn(url, { headers: fejlec, signal: AbortSignal.timeout(15000) });
    if (!v?.ok) return null;
    const j = await v.json();
    // Idegen alakú válasz sem „rendben" — inkább ne tudjunk semmit.
    return Array.isArray(j?.workflow_runs) ? j.workflow_runs : null;
  } catch {
    return null;   // ⚠️ a hibaüzenet SEM kerül naplóba: fejlécet tartalmazhat
  }
}
