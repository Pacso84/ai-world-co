// ===================================================================
// AI-KÉSLELTETÉS-ŐR — mennyi ideig lógtak a hívások? (2026-09-16)
// ===================================================================
//
// A MÉRT ESET. A 2026-09-16 02:13 UTC-s CI-futás „Pipeline" lépése 45,5 percig
// tartott, miközben az átlag 8,9 perc és az addigi csúcs 21,9 volt. A napi
// költés viszont csak $0,23 — vagyis a 45 perc NEM MUNKÁVAL telt. A napló
// időréseiből: két hívás PONTOSAN 8,0 percig lógott, majd elhasalt
// („The operation was aborted due to timeout"), 0+0 tokennel:
//     [designer] minimax-m2.5   ·   [seo] minimax-m2.5
// További lassú hívások: 4,7 perc (seo, SIKERES), 3,0 perc (designer, sikeres),
// 2,4 és 2,3 perc. 60 mp-nél hosszabb rés összesen 10 db, együtt 35,1 perc.
//
// 🔴 A BAJ NEM A LASSÚSÁG VOLT, HANEM A NÉMASÁG. A beragadt hívásról EGYETLEN
// jel sem jutott ki: a `logCall()` csak a konzolra ír, az pedig a CI naplója,
// „ahová senki nem néz". A projekt kemény szabálya: AZ ŐRSZEM CSAK AKKOR ŐR,
// HA ODASZÓL, AHOL A USER NÉZ — vagyis a napi Telegram-jelentésben.
//
// ⚠️ EZ A MODUL NEM HANGOL SEMMIT. A 8 perces türelem (`AI_CALL_TIMEOUT_MS`,
// `core/ai-router.js`) és a modell-besorolás (user-döntés 2026-07-24)
// ÉRINTETLEN. Ez itt MÉRŐESZKÖZ, nem szabályozó: az adatot gyűjti, amiből
// KÉSŐBB lehet dönteni. Ugyanez a szétválasztás, mint a `buffer-guard.js`-nél
// és a `semantic-guard.js`-nél: a döntés (mi a gond, mit mondunk a usernek)
// tiszta függvényként tesztelhető, a mérés marad a routerben.
//
// 🧹 NAPI TISZTA LAP. A bejegyzés EGY NAPRA szól: az első másnapi hívás nulláz.
// Enélkül a számláló örökre pirosan ragadna — „ha egy számláló N bukást
// jelent, kell út VISSZA a nullához is" (a témaismétlés-őr leckéje).
//
// ⚠️ ÍRÁS-GYAKORISÁG — SZÁNDÉKOSAN MINDEN HÍVÁSNÁL. Az `embed-guard.js`-nél a
// „csak változáskor" takarékosság volt; itt MINDEN hívás új adat (a számláló
// nő), tehát a kettő egybeesik. Kihagyni azért nem szabad, mert nem tudjuk
// előre, melyik írás lesz a futás UTOLSÓ ÁLLAPOTA — és épp azt olvassa a
// riport. A fájl 1 KB alatti, a mért hívás másodpercekig tart: az írás ára
// mérhetetlen. (A `frissit()` visszaadja az ELŐZŐ objektumot, ha az esemény
// használhatatlan — olyankor nincs írás.)
//
// ⚠️ EGY FOLYAMATON BELÜL ATOMI. A beolvasás→összefűzés→írás egyetlen
// szinkron blokk (nincs benne `await`), tehát a fordító 5 sávja (egy processz,
// Promise-alapú párhuzam) nem tud egymásra írni. A CI lépései EGYMÁS UTÁN
// futnak, tehát processzek között sincs verseny.
// ===================================================================

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** A `memory/` alatti fájlnév — EGY helyen, mert a riport is hivatkozik rá. */
export const GUARD_FAJL = 'ai-latency-guard.json';

// ⚠️ TESZT-FELÜLÍRÁS, élesben nincs beállítva — ugyanaz a minta, mint az
// `EMBED_GUARD_PATH`-nál és a `SEMANTIC_GUARD_PATH`-nál. A teszt SOHA nem
// írhat az éles őrszem-fájlba.
export const GUARD_PATH = process.env.AI_LATENCY_GUARD_PATH
  || join(__dirname, '..', 'memory', GUARD_FAJL);

/**
 * Ennél hosszabb hívás már „a türelem-plafon közelében" jár.
 *
 * SZÁRMAZTATÁS: a routerbeli türelem 8 perc (480 mp), ennek a 75%-a 360 mp.
 * A kód kommentje szerint a leghosszabb JOGOS hívás 377 mp volt — vagyis ez a
 * küszöb azt jelenti: „ma olyan hívásunk volt, ami a valaha mért leghosszabb
 * jogos hívás környékén járt". A 09-16-i nap leglassabb SIKERES hívása 282 mp
 * volt, tehát ez a küszöb NEM napi zaj.
 *
 * ⚠️ A 480 mp NINCS IDE MÁSOLVA. Egy szám, ami két helyen van, elcsúszik (a
 * munkafolyamat „9,5 óra" kommentje pont így hazudott 7 napig). A kapcsolatot
 * a `core/ai-latency-guard.test.js` őrzi: a router forrásából kiolvassa az
 * `AI_CALL_TIMEOUT_MS`-t, és összeméri ezzel.
 */
export const LASSU_MP = 360;

/** Ennyi agent/modell-párnál többet nem tartunk el az időtúllépés-listában. */
export const IDOTULLEPESEK_MAX = 12;

const szam = (x) => (Number.isFinite(Number(x)) ? Number(x) : null);
const kerek = (x) => Math.round(x * 10) / 10;
const cimke = (x, n) => String(x == null || x === '' ? '?' : x).slice(0, n);
const percSzoveg = (mp) => (mp / 60).toFixed(1).replace('.', ',');

/**
 * IDŐTÚLLÉPÉS-E a hiba?
 *
 * ⚠️ EXPLICIT ALAKOK, NEM SZÓ-ILLESZTÉS (a repó kemény szabálya: az
 * előtag-illesztés magabiztosan téved — analysis→analyzis, kétszer is). Ezek a
 * konkrét üzenetek, amiket a mi utunkon KAPUNK:
 *   • `AbortSignal.timeout()` → „TimeoutError: The operation was aborted due to
 *     timeout" — ez a 09-16-i két beragadt hívás szó szerinti üzenete;
 *   • Node hálózati hibák: ETIMEDOUT / ESOCKETTIMEDOUT;
 *   • a szolgáltató saját időtúllépése: „request timed out", „Gateway Timeout".
 *
 * A mért MÁSODPERC ettől függetlenül rögzül — ha egy üzenet mégis kicsúszna a
 * mintából, a `leglassabb` mező akkor is elárulja a beragadást.
 */
export function idotullepesE(hiba) {
  const m = String(hiba == null ? '' : (hiba.message || hiba)).toLowerCase();
  if (!m) return false;
  return m.includes('aborted due to timeout')
    || m.includes('timeouterror')
    || m.includes('etimedout')
    || m.includes('esockettimedout')
    || m.includes('timed out')
    || m.includes('gateway timeout');
}

/**
 * „Ebben a lépésben nincs is beállítva kulcs" — ez NEM HÍVÁS.
 *
 * A `getClient()` és a `makeOpenAICaller()` a kulcs hiányában AZONNAL dob, egy
 * bájt kérés nélkül. Ha ezt hívásnak vennénk, a kulcs nélküli CI-lépések (pl.
 * a Házmester) naponta több száz 0 mp-es „hívást" hamisítanának a napi
 * statisztikába — és a „ma 400 hívás volt" szám elveszítené a jelentését.
 *
 * ⚠️ EXPLICIT MINTA, az `embed-guard.js KONFIG_HIANY_RX`-ének mása: csak a
 * konkrét „nincs VALAMI_API_KEY" alakra illeszkedik. Egy valódi hibaüzenet
 * (HTTP 429, kvóta, hálózat) SOHA nem eshet ide.
 */
const KULCS_HIANY_RX = /\bnincs\s+[A-Z][A-Z0-9_]*_API_KEY\b/;
export function kulcsHianyE(hiba) {
  return KULCS_HIANY_RX.test(String(hiba == null ? '' : (hiba.message || hiba)));
}

/** Egy nap üres lapja. */
export function ujNap(nap) {
  return {
    at: null,
    nap,
    hivasok: 0,
    bukott: 0,
    osszMp: 0,
    veszettMp: 0,
    leglassabb: null,
    idotullepesek: [],
    problems: []
  };
}

/**
 * Mi számít gondnak EGY nap hívásaiban?
 *
 * 🔑 NINCS „ELHANYAGOLHATÓ" IDŐTÚLLÉPÉS. Egy beragadt hívás 8 percet és egy
 * teljes fizetős kört visz el úgy, hogy nulla tokent ad — és a 09-16-i eset
 * megmutatta, hogy KETTŐ belőle már a futás felét megeszi. A küszöb pont azt a
 * csendes romlást engedné vissza, ami ellen ez az egész készült.
 *
 * ⚠️ EGY HÍVÁS = EGY LELET. A beragadt hívás per definitionem a plafonig ér,
 * tehát a `leglassabb` is ő — ha mindkét lelet elsülne, UGYANAZT a 8 percet
 * mondanánk el kétszer, más szavakkal. Az `AI_LASSU_HIVAS` nem az
 * időtúllépés ismétlése: azt méri, hogy a NEM abortált hívások közelítenek-e
 * a plafonhoz (a 09-16-i nap leglassabb SIKERES hívása 282 mp volt). Ezért a
 * `leglassabb.tullepes` zászlóra hallgat.
 *
 * 🔑 A ZÁSZLÓ NEM „BUKOTT-E", HANEM „IDŐTÚLLÉPÉS-E". Egy 400 mp után HTTP
 * 500-zal elhasaló hívás nincs az `idotullepesek` listán, tehát senki nem
 * mondaná el helyettünk — az ilyen MARAD lelet. Ugyanez véd akkor is, ha egy
 * időtúllépés-üzenet kicsúszik az `idotullepesE()` mintájából: `tullepes`
 * hamis, a lassú-lelet elsül, és a beragadás mégsem marad néma.
 *
 * @param {object} allapot a napi bejegyzés
 * @returns {Array<{code: string, detail: string}>}
 */
export function latenciaProblemak(allapot = {}) {
  const a = (allapot && typeof allapot === 'object' && !Array.isArray(allapot)) ? allapot : {};
  const ki = [];

  const lista = (Array.isArray(a.idotullepesek) ? a.idotullepesek : []).filter(x => x && typeof x === 'object');
  if (lista.length) {
    const db = lista.reduce((s, x) => s + (szam(x.db) ?? 0), 0);
    const mp = lista.reduce((s, x) => s + (szam(x.mp) ?? 0), 0);
    const MUTAT = 3;
    const reszek = lista.slice(0, MUTAT).map(x => `${cimke(x.agent, 24)}/${cimke(x.model, 30)} ×${szam(x.db) ?? 0}`);
    ki.push({
      code: 'AI_IDOTULLEPES',
      detail: `${db} AI-hívás lógott bele a türelem-plafonba (`
        + reszek.join(' · ') + (lista.length > MUTAT ? ' …' : '')
        + `) — ${percSzoveg(mp)} perc veszett el, nulla tokenért`
    });
  }

  const l = (a.leglassabb && typeof a.leglassabb === 'object' && !Array.isArray(a.leglassabb)) ? a.leglassabb : null;
  const lmp = szam(l?.mp);
  if (lmp !== null && lmp >= LASSU_MP && l.tullepes !== true) {
    ki.push({
      code: 'AI_LASSU_HIVAS',
      detail: `a leglassabb hívás ${Math.round(lmp)} mp volt (${cimke(l.agent, 24)}/${cimke(l.model, 30)}`
        + `${l.ok === false ? ', el is hasalt' : ''}) — a türelem-plafon közelében`
    });
  }

  return ki;
}

/**
 * Egy hívás hozzáfűzése a NAPI bejegyzéshez. TISZTA FÜGGVÉNY — nem olvas és
 * nem ír lemezt, így a napi tiszta lap és az összefűzés hálózat nélkül mérhető.
 *
 * 🧹 NAPI TISZTA LAP: ha az előző bejegyzés MÁS napról való, üres lappal
 * kezdünk. A nap az esemény `at` bélyegének UTC-napja (a CI is UTC-ben fut).
 *
 * @param {object|null} elozo  a lemezről beolvasott bejegyzés (vagy null)
 * @param {{at:string, agent?:string, provider?:string, model?:string,
 *          mp:number, ok?:boolean, hiba?:any}} esemeny
 * @returns {object|null} az ÚJ bejegyzés — vagy VÁLTOZATLANUL az `elozo`, ha az
 *          esemény használhatatlan (akkor a hívó nem ír lemezre)
 */
export function frissit(elozo, esemeny) {
  const e = (esemeny && typeof esemeny === 'object' && !Array.isArray(esemeny)) ? esemeny : null;
  const valtozatlan = (elozo && typeof elozo === 'object' && !Array.isArray(elozo)) ? elozo : null;
  if (!e) return valtozatlan;

  const at = String(e.at || '');
  const mp = szam(e.mp);
  // ⚠️ SE NÉMA JÓVÁHAGYÁS, SE KITALÁLT ADAT: értelmezhetetlen bélyeg vagy idő
  // esetén nem találgatunk, hanem érintetlenül hagyjuk a bejegyzést.
  if (!/^\d{4}-\d{2}-\d{2}T/.test(at) || mp === null || mp < 0) return valtozatlan;
  const nap = at.slice(0, 10);

  const alap = (valtozatlan && valtozatlan.nap === nap) ? valtozatlan : ujNap(nap);

  const agent = cimke(e.agent, 24);
  const model = cimke(e.model, 30);
  const provider = cimke(e.provider, 20);
  // `ok` akkor hamis, ha a hívó ezt mondja, VAGY ha hibát adott át.
  const ok = e.ok !== false && !e.hiba;
  // EGYSZER döntjük el, és KÉT helyen használjuk (időtúllépés-lista +
  // `leglassabb.tullepes`) — hogy a lista és a zászló ne mondhasson mást.
  const tullepes = !ok && idotullepesE(e.hiba);

  const regi = (alap.leglassabb && typeof alap.leglassabb === 'object' && !Array.isArray(alap.leglassabb))
    ? alap.leglassabb : null;
  const regiMp = szam(regi?.mp);

  const lista = (Array.isArray(alap.idotullepesek) ? alap.idotullepesek : [])
    .filter(x => x && typeof x === 'object' && !Array.isArray(x))
    .map(x => ({ agent: cimke(x.agent, 24), model: cimke(x.model, 30), db: szam(x.db) ?? 0, mp: kerek(szam(x.mp) ?? 0) }));
  if (tullepes) {
    const meglevo = lista.find(x => x.agent === agent && x.model === model);
    if (meglevo) { meglevo.db += 1; meglevo.mp = kerek(meglevo.mp + mp); }
    else lista.push({ agent, model, db: 1, mp: kerek(mp) });
  }
  lista.sort((x, y) => (y.db - x.db) || (y.mp - x.mp));

  const rec = {
    at,
    nap,
    hivasok: (szam(alap.hivasok) ?? 0) + 1,
    bukott: (szam(alap.bukott) ?? 0) + (ok ? 0 : 1),
    osszMp: kerek((szam(alap.osszMp) ?? 0) + mp),
    // A bukásra ment idő KÜLÖN: ez az, ami tisztán elveszett (a 09-16-i
    // futásban 16 perc két hívásból, nulla tokenért).
    veszettMp: kerek((szam(alap.veszettMp) ?? 0) + (ok ? 0 : mp)),
    leglassabb: (regiMp === null || mp > regiMp) ? { agent, provider, model, mp: kerek(mp), ok, tullepes } : regi,
    idotullepesek: lista.slice(0, IDOTULLEPESEK_MAX),
    problems: []
  };
  rec.problems = latenciaProblemak(rec);
  return rec;
}

/**
 * Egy hívás feljegyzése. SOHA NEM DOB, és sosem akaszt meg egy AI-hívást —
 * ugyanaz a szabály, mint a `jegyezSzemantikus()`-nál és a `jegyezEmbed()`-nél.
 *
 * @param {object} esemeny lásd `frissit()`
 * @param {string} [ut]
 * @returns {boolean} írt-e lemezre
 */
export function jegyezLatencia(esemeny, ut = GUARD_PATH) {
  try {
    if (!esemeny || typeof esemeny !== 'object' || Array.isArray(esemeny)) return false;
    // A kulcs hiánya nem hívás — lásd `kulcsHianyE()`.
    if (kulcsHianyE(esemeny.hiba)) return false;

    let elozo = null;
    try { elozo = JSON.parse(readFileSync(ut, 'utf-8')); } catch { /* első alkalom */ }
    if (!elozo || typeof elozo !== 'object' || Array.isArray(elozo)) elozo = null;

    const uj = frissit(elozo, { ...esemeny, at: esemeny.at || new Date().toISOString() });
    if (!uj || uj === elozo) return false;

    mkdirSync(dirname(ut), { recursive: true });
    writeFileSync(ut, JSON.stringify(uj, null, 2), 'utf-8');
    return true;
  } catch { return false; }
}

/**
 * A napi riport sora. ÜRES, ha nem volt sem időtúllépés, sem a plafon
 * közelébe érő hívás — a csendes nap maradjon csendes.
 *
 * ⚠️ A sor ⚠️-vel KEZDŐDIK, és ez nem díszítés: a `core/report-noise.js`
 * vészjelzés-mintája (`VESZ_RX`) erre illeszkedik, tehát a zajszűrő SOSEM
 * némíthatja el. Egy napokig VÁLTOZATLAN lassulás pont az a szöveg, amit egy
 * „csak ha változott" szabály másnapra elhallgattatna — márpedig itt a KITARTÓ
 * beragadás maga a hír.
 *
 * ⚠️ A NAP IS KIMEGY. Ha valamiért megállna az írás (pl. a havi keret betelte
 * miatt egyetlen hívás sem indul), a riport egy TEGNAPI dátumot mutatna —
 * vagyis a pangás magán a soron látszik, nem kell hozzá külön őr.
 *
 * ⚠️ HIÁNYZÓ FÁJLRA HALLGATUNK, szándékosan: a havi keret betelte (user-döntés:
 * teljes szünet hónapfordulóig) valódi, nem hibás állapot — ott egy „nem tudom"
 * sor napi hamis riasztás lenne, és a hamis riasztás megeszi az igazit is.
 *
 * @param {object|null} guard a beolvasott memory/ai-latency-guard.json
 */
export function latenciaSor(guard) {
  if (!guard || typeof guard !== 'object' || Array.isArray(guard)) return '';
  const p = (Array.isArray(guard.problems) ? guard.problems.filter(Boolean) : latenciaProblemak(guard))
    .map(x => String(x?.detail || x?.code || '')).filter(Boolean);
  if (!p.length) return '';
  const nap = /^\d{4}-\d{2}-\d{2}$/.test(String(guard.nap)) ? guard.nap : String(guard.at || '').slice(0, 10);
  const hivasok = szam(guard.hivasok);
  // A NEVEZŐ ELÖL: „2 időtúllépés 15 hívásból" MÁS hír, mint „2 a 2-ből" —
  // enélkül a szám nagysága nem ítélhető meg.
  return `⚠️ AI-LASSULÁS${nap ? ` (${nap})` : ''} — ${hivasok === null ? '?' : hivasok} hívásból: `
    + p.join(' · ')
    + '. A beragadt hívás IDŐT éget, nem pénzt: a futásidő nem a munkától nőtt.';
}

export default {
  GUARD_FAJL, GUARD_PATH, LASSU_MP, IDOTULLEPESEK_MAX,
  idotullepesE, kulcsHianyE, ujNap, latenciaProblemak, frissit, jegyezLatencia, latenciaSor
};
