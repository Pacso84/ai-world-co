// ===================================================================
// MEMÓRIA-KEZELŐ (Marveen-stílusú, projektünkhöz szabva)
// ===================================================================
//
// Rétegzett, kereshető, idővel halványuló (salience decay) memória.
//   - HOT / WARM / COLD rétegek (salience alapján)
//   - salience: használatkor erősödik, idővel halványul
//   - SOHA nem töröl (a cold réteg örökre megmarad)
//   - keresés: kulcsszó-alapú (később Gemini embeddings = szemantikus)
//
// HASZNÁLAT (agentekben):
//   import { remember, recall, decay, stats } from '../core/memory-manager.js';
//   remember('iro', 'Article rejected: missing section', { tags:['rejection'] });
//   const hits = recall('rejection mistakes', { scope:'iro', limit:8 });
//
// Tárolás: memory/store.json — TISZTA SZÖVEGTÁR (~0,3 MB), git-követett.
//   ⚠️ A beágyazás-vektorok 2026-09-06 óta NEM ide kerülnek, hanem a
//   gitignore-olt `memory/memory-embeddings.json`-ba (lásd
//   `core/memory-embeddings.js` fejléce: a vektorok minden CI-futásban
//   megszülettek és minden futásban törlődtek, ~335 MB/év a NYILVÁNOS
//   repó történetében).
// ===================================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { cacheBetolt, cacheOlvas, cacheIr, cacheMent } from './memory-embeddings.js';
import { jegyezSzemantikus } from './semantic-guard.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MEMORY_DIR = join(__dirname, '..', 'memory');
// ⚠️ A `MEMORY_STORE_PATH` KIZÁRÓLAG a teszté (2026-08-29). Enélkül minden
// teszt az ÉLES memóriatárba írt, és a régi `lessons-block.test.js` csak
// mentés-visszaállítással védekezett — párhuzamos futásnál ez okozta a
// megfigyelt ingadozó bukást. Élesben a változó nincs beállítva.
const STORE_PATH = process.env.MEMORY_STORE_PATH || join(MEMORY_DIR, 'store.json');

// Réteg-küszöbök (salience 0..1)
const TIER = { HOT: 0.6, WARM: 0.3 };           // >=0.6 hot, >=0.3 warm, else cold
const ACCESS_BOOST = 0.15;                        // mennyit erősödik használatkor
const DECAY_PER_DAY = 0.04;                       // naponta ennyit halványul

// ---------- tárolás ----------
function load() {
  if (!existsSync(STORE_PATH)) return { _meta: { note: 'AI World rétegzett memória (hot/warm/cold, salience decay).' }, items: [] };
  try { return JSON.parse(readFileSync(STORE_PATH, 'utf-8')); }
  catch { return { _meta: {}, items: [] }; }
}
function save(store) {
  if (!existsSync(MEMORY_DIR)) mkdirSync(MEMORY_DIR, { recursive: true });
  // 🧹 A VEKTOR NEM VALÓ IDE (2026-09-06). A szemantikus keresés 2026-08-25 óta
  // az `it.embedding` mezőbe cache-elt, a Házmester meg minden futásban
  // letörölte — a store.json így 13,9 MB ↔ 0,3 MB között hullámzott, és minden
  // hullám EGY ÚJ TELJES PÉLDÁNY a NYILVÁNOS git-történetben (mérve:
  // 165,9 KB/commit a stabil 14,3 KB helyett). A vektorok azóta a
  // `memory/memory-embeddings.json` gitignore-olt gyorsítótárban laknak.
  //
  // EZ ITT A VÉGSŐ ZÁR, nem udvariasság: bárhonnan is kerülne vissza egy
  // `embedding` mező (régi adat a lemezről, más ág kódja), a szövegtár írásakor
  // lemarad. A régi vektorok kitakarítása ezért MAGÁTÓL megtörténik az első
  // mentésnél — lásd még `purgeStoreEmbeddings()`.
  for (const it of store.items || []) if ('embedding' in it) delete it.embedding;
  store._meta = store._meta || {};
  store._meta.updated = new Date().toISOString();
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
}

/**
 * A store.json-ban RAGADT régi vektorok egyszeri kitakarítása.
 *
 * 🔑 NINCS BENNE „ÉL-E A SZOLGÁLTATÁS" KÉRDÉS — és épp ez a lényeg. A régi
 * `core/housekeeping.js stripEmbeddings()` az `embedText('ping')`-gel kérdezte
 * meg, halott-e a beágyazás, és kulcs nélkül törölt. A Házmester CI-lépésének
 * viszont NINCS `env:` blokkja, tehát ott a válasz MINDIG „halott" volt: a
 * próba nem azt mérte, hogy halott-e a szolgáltatás, hanem hogy „én, itt, most,
 * tudok-e beágyazni". (Ugyanez az alak volt az `embed-guard.js`-ben is.)
 *
 * Most a kérdés fel sem merül: a szövegtárban a vektornak SEMMILYEN
 * körülmények között nincs helye, mert a helye máshol van. Determinisztikus,
 * hálózat nélküli, $0.
 *
 * @returns {{n:number, elotte:number, utana:number}} hány elemről, mekkora fájlból mekkorára
 */
export function purgeStoreEmbeddings() {
  const store = load();
  const n = (store.items || []).filter(it => it.embedding !== undefined && it.embedding !== null).length;
  const meret = () => { try { return statSync(STORE_PATH).size; } catch { return 0; } };
  if (!n) return { n: 0, elotte: meret(), utana: meret() };
  const elotte = meret();
  save(store);                       // a `save()` maga szedi le a mezőket
  return { n, elotte, utana: meret() };
}

function tierOf(salience) {
  if (salience >= TIER.HOT) return 'hot';
  if (salience >= TIER.WARM) return 'warm';
  return 'cold';
}

function daysSince(iso) {
  return (Date.now() - new Date(iso).getTime()) / 86400000;
}

// ---------- REMEMBER ----------
// Új emlék mentése. Ha (scope+text) már létezik, csak erősíti (nem duplikál).
export function remember(scope, text, opts = {}) {
  const store = load();
  const norm = (text || '').trim();
  if (!norm) return;

  // 🔑 STABIL KULCS (2026-08-29, hibavadászat). A dedup alapból a PONTOS
  // SZÖVEGRE megy — ezért minden lecke, amibe változó adat kerül (napi
  // darabszám, példa-slug), ÚJ emléket gyártott a meglévő megerősítése
  // helyett. Élesben mérve: 12 db „Csempe-szabály emlékeztető", 0 repeats;
  // 11 db „Avoid stating…", 0 repeats. A memória HÍZOTT, nem ERŐSÖDÖTT, és a
  // napi riport ♻️ sora pont ezekre SOHA nem tüzelt.
  //
  // A megoldás NEM fuzzy hasonlítás (a mintaillesztés magabiztosan téved),
  // hanem hogy a hívó EXPLICIT megmondja: „ez ugyanaz a lecke, friss
  // részlettel". Kulcs nélkül minden marad a régiben.
  const kulcs = opts.kulcs ? String(opts.kulcs) : null;
  const existing = kulcs
    ? store.items.find(it => it.scope === scope && it.kulcs === kulcs)
    : store.items.find(it => it.scope === scope && it.text === norm);
  if (existing) {
    // A SZÖVEG FRISSÜL: a lecke lényege állandó, de a példa ne legyen hetekkel
    // ezelőtti — az kerül be minden AI-hívás promptjába.
    if (kulcs) { existing.text = norm; existing.kulcs = kulcs; }
    existing.salience = Math.min(1, existing.salience + ACCESS_BOOST);
    existing.lastAccessed = new Date().toISOString();
    existing.accessCount++;
    // ISMÉTLÉS-SZÁMLÁLÓ (2026-07-19, user: "minden hiba ne forduljon elő még
    // egyszer — nem költséghatékony"): a hibapontok STABIL szöveggel írnak,
    // így az újra-remember = UGYANAZ A HIBA ÚJRA megtörtént, a lecke ellenére.
    // Ezt CSAK itt számoljuk (a recall-olvasás nem ismétlés!) — a napi riport
    // ♻️ sora ebből jelzi: puha lecke helyett kemény kód-szabály kell.
    // ♻️ RUTIN ÖNTISZTÍTÁS NEM ISMÉTLŐDŐ HIBA (2026-08-30, független átnézés).
    // A stabil kulcs bevezetése után a `quality-guard` napi öntisztítása is ide
    // futott be — és ezzel `repeats`-et állított. A napi riport ♻️ sora minden
    // mai `lastRepeat`-re tüzel, tehát mérve ezt adta volna:
    //   „♻️ Ismétlődő hiba: 1 típus ma (… 2× 1 nap alatt) — ez sűrű, KEMÉNY
    //    SZABÁLY KELLHET!"
    // 🔑 A sürgetés HAMIS: a kemény szabály MÁR LÉTEZIK (a determinisztikus
    // `quality-guard --fix`). A `repeats` jelentése az, hogy „a lecke ELLENÉRE
    // megint megtörtént" — a gép által automatikusan javított, rutin eset nem
    // ilyen. A `quality-fix-log` szerint ez a napok ~32%-án előfordul: napi zaj
    // lett volna épp abból a sorból, amit a zajszűrő NEM fed le.
    if (!opts.rutin) {
      existing.repeats = (existing.repeats || 0) + 1;
      existing.lastRepeat = new Date().toISOString();
    }
    existing.tier = tierOf(existing.salience);
  } else {
    const now = new Date().toISOString();
    store.items.push({
      id: 'm' + Date.now() + Math.floor(Math.random() * 1000),
      scope,                               // pl. 'iro', 'shared'
      text: norm,
      ...(kulcs ? { kulcs } : {}),         // stabil dedup-kulcs, ha a hívó adott
      tags: opts.tags || [],
      created: now,
      lastAccessed: now,
      accessCount: 0,
      salience: 1.0,
      tier: 'hot'
    });
  }
  save(store);
}

// ---------- RECALL (kulcsszó-keresés + salience) ----------
export function recall(query, opts = {}) {
  const store = load();
  const { scope = null, limit = 8 } = opts;
  const terms = (query || '').toLowerCase().split(/\W+/).filter(t => t.length > 2);

  let candidates = store.items.filter(it => !scope || it.scope === scope);

  const scored = candidates.map(it => {
    const hay = (it.text + ' ' + (it.tags || []).join(' ')).toLowerCase();
    const overlap = terms.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0);
    // relevancia = kulcsszó-egyezés * salience (+ kis recency bónusz)
    const recency = 1 / (1 + daysSince(it.lastAccessed));
    const score = overlap * 2 + it.salience + recency * 0.5;
    return { it, score, overlap };
  }).filter(s => s.overlap > 0 || !query)   // ha nincs query, mindent visszaadhat
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  // Visszahívott emlékek erősödnek
  const now = new Date().toISOString();
  for (const s of scored) {
    s.it.accessCount++;
    s.it.lastAccessed = now;
    s.it.salience = Math.min(1, s.it.salience + ACCESS_BOOST);
    s.it.tier = tierOf(s.it.salience);
  }
  if (scored.length) save(store);

  return scored.map(s => ({ text: s.it.text, tags: s.it.tags, tier: s.it.tier, scope: s.it.scope }));
}

// ---------- SZEMANTIKUS RECALL (Gemini embeddings + salience) ----------
// Jelentés alapján keres, nem csak szó szerinti egyezésre. Ha az embedding
// nem érhető el (nincs Google kulcs / hálózati hiba), átáll a kulcsszavas
// recall()-ra — így sosem bukik el.
function cosineSim(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return (na && nb) ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

// A LEGUTÓBBI SZEMANTIKUS FUTÁS MÉRLEGE — lásd a `kihagyott` mezőt lejjebb.
let _szemantikus = { at: null, provider: null, dim: 0, osszes: 0, cache: 0, beagyazva: 0, kihagyott: 0, tartalek: null };

/**
 * Mi történt a LEGUTÓBBI `recallSemantic()`-ban? (diagnózishoz)
 *
 * ⚠️ FOLYAMAT-LOKÁLIS, tehát ezt CSAK ugyanabban a processzben lehet
 * kiolvasni, ahol a keresés futott. Ez ma az `agents/iro` és `agents/guide`,
 * NEM a külön processzben futó `core/daily-report.js`.
 *
 * 🔑 2026-09-06-IG EZ VOLT A TELJES IGAZSÁG, ÉS EZ VOLT A BAJ. A komment maga
 * mondta ki, hogy a lelet „EGYELŐRE A CI-NAPLÓIG JUT EL" — vagyis senkihez.
 * Pontosan az az alak, ami az `embedStatus()`-t megbuktatta 2026-08-30-ig
 * („a komment szerint a riport kiírja, csak épp nulla hívója volt"), és
 * pontosan az, amit a projekt kemény szabálya tilt: az őrszem csak akkor őr,
 * ha odaszól, AHOL A USER NÉZ.
 *
 * AZÓTA a `recallSemantic()` LEMEZRE is teszi a mérleget
 * (`memory/semantic-guard.json`, `core/semantic-guard.js`), a napi Telegram-
 * riport pedig beolvassa. Ez a függvény maradt, ami volt: a MOSTANI processz
 * diagnózisa (teszt + naplózás). Ha új mezőt veszel fel ide, kérdezd meg,
 * kell-e a lemezre is — különben újra egy néma számláló születik.
 */
export function szemantikusAllapot() { return { ..._szemantikus }; }

/**
 * @param {string} query
 * @param {{scope?:string|null, limit?:number, embedFn?:Function|null, provider?:string}} opts
 *   `embedFn`: a HÍVÓ SZÁNDÉKA számít (a `topic-dedup.js` mintája) —
 *   `undefined` = töltsd be az éles routert; `null` = NINCS beágyazás
 *   (kulcsszavas tartalék), így a teszt tisztán offline maradhat.
 */
export async function recallSemantic(query, opts = {}) {
  const { scope = null, limit = 8 } = opts;

  // ⚠️ A MÉRLEG MINDIG A MOSTANI HÍVÁSRÓL SZÓLJON. Ha csak a sikeres ágon
  // írnánk, egy tartalékra futó hívás után az ELŐZŐ futás számai maradnának
  // bent, és úgy néznének ki, mintha ezt a hívást írnák le — pontosan az a
  // fajta csendes hazugság, ami ellen ez az egész javítás készült.
  _szemantikus = {
    at: new Date().toISOString(), provider: null, dim: 0,
    osszes: 0, cache: 0, beagyazva: 0, kihagyott: 0, tartalek: null
  };

  // Embedding-függvény lazy betöltése (ne terhelje a dashboardot, ami csak stats-ot hív)
  let embedText = opts.embedFn;
  let statusFn = null;
  if (embedText === undefined) {
    try {
      const router = await import('./ai-router.js');
      embedText = router.embedText;
      if (typeof router.embedStatus === 'function') statusFn = router.embedStatus;
    } catch { embedText = null; /* nincs router */ }
  }

  const qVec = embedText ? await embedText(query) : null;
  // ⚠️ A KÉRDÉS VEKTORÁT MINDIG FRISSEN KÉRJÜK, gyorsítótár nélkül: az ő
  // hossza mondja meg, MI A MOSTANI szolgáltató tere — és csak ehhez szabad
  // mérni a többit. (A `topic-dedup.js` első javítása pont ezt hagyta ki, és
  // két majdnem azonos cím kapott 0.000 hasonlóságot.)
  if (!Array.isArray(qVec) || !qVec.length) {
    _szemantikus.tartalek = 'nincs kérdés-vektor';
    return recall(query, opts);                    // nincs embedding → kulcsszó-fallback
  }

  const store = load();
  const candidates = store.items.filter(it => !scope || it.scope === scope);
  if (!candidates.length) { _szemantikus.tartalek = 'nincs jelölt emlék'; return []; }

  const dim = qVec.length;
  const provider = opts.provider
    || (statusFn ? (statusFn().provider || 'ismeretlen') : 'ismeretlen');

  // ── A VEKTOROK A KÜLÖN GYORSÍTÓTÁRBÓL JÖNNEK (2026-09-06) ──────────
  // Régen `it.embedding`-be írtuk, vagyis a szövegtárba — és a Házmester
  // minden futásban letörölte. Lásd `core/memory-embeddings.js` fejléce.
  const cache = cacheBetolt(provider, dim);
  const vektorok = new Map();
  let talalat = 0, ujra = 0, kihagyott = 0;
  for (const it of candidates) {
    const c = cacheOlvas(cache, it.id, it.text, provider, dim);
    if (c) { vektorok.set(it.id, c); talalat++; continue; }
    const v = await embedText(it.text);
    // A MÉRETET IS ELLENŐRIZZÜK: ha a szolgáltató menet közben váltott, a
    // rövidebb/hosszabb vektor nem összemérhető a kérdésével — ez „nem tudom".
    if (Array.isArray(v) && v.length === dim) {
      cacheIr(cache, it.id, it.text, v, provider);
      vektorok.set(it.id, v);
      ujra++;
    } else {
      kihagyott++;
    }
  }
  if (ujra) cacheMent(cache, provider, dim);

  _szemantikus = {
    at: new Date().toISOString(), provider, dim,
    osszes: candidates.length, cache: talalat, beagyazva: ujra, kihagyott, tartalek: null
  };
  // 🔊 „A NEM TUDOM NEM RENDBEN VAN." A régi kód `if (v)`-vel elnyelte az egyes
  // elemek beágyazási hibáját, a `filter(Array.isArray)` pedig kiszűrte őket —
  // így egy emlék KIMARADHATOTT a keresésből anélkül, hogy bárhol nyoma lett
  // volna. Egy sebességkorlátos (429) körben ez a memória felét is jelentheti.
  if (kihagyott) {
    console.warn(`   ⚠️ szemantikus memória: ${kihagyott}/${candidates.length} emlék beágyazása NEM sikerült `
      + `— ezek KIMARADTAK a keresésből (a „nem tudom" nem „nem hasonló"). Szolgáltató: ${provider}.`);
  }

  // 🔑 ÉS LEMEZRE IS (2026-09-07). A fenti `console.warn` a CI-naplóig jut el —
  // vagyis senkihez. A `recallSemantic()` az `agents/iro` és `agents/guide`
  // PROCESSZÉBEN fut, a napi riport egy MÁSIKBAN: folyamat-lokális változóból
  // az sosem láthatná. Pontosan ez az alak buktatta meg az `embedStatus()`-t
  // 2026-08-30-ig. A `jegyezSzemantikus()` SOHA nem dob, és csak változáskor ír.
  jegyezSzemantikus({
    at: _szemantikus.at, provider, dim,
    osszes: candidates.length, kihagyott
  });

  const scored = candidates
    .filter(it => vektorok.has(it.id))
    .map(it => {
      const recency = 1 / (1 + daysSince(it.lastAccessed));
      return { it, score: cosineSim(qVec, vektorok.get(it.id)) * (0.5 + 0.5 * it.salience) + recency * 0.1 };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (!scored.length) { _szemantikus.tartalek = 'nincs pontozott találat'; return recall(query, opts); }

  // Visszahívott emlékek erősödnek (mint a kulcsszavas recall-nál)
  const now = new Date().toISOString();
  for (const s of scored) {
    s.it.accessCount++;
    s.it.lastAccessed = now;
    s.it.salience = Math.min(1, s.it.salience + ACCESS_BOOST);
    s.it.tier = tierOf(s.it.salience);
  }
  save(store);
  return scored.map(s => ({ text: s.it.text, tags: s.it.tags, tier: s.it.tier, scope: s.it.scope, _semantic: true }));
}

// ---------- DECAY (időszakos halványítás, soha nem töröl) ----------
/**
 * A memória halványítása — NAPONTA LEGFELJEBB EGYSZER.
 *
 * ⚠️ 2026-07-30 és 08-29 között EGYÁLTALÁN NEM FUTOTT: az egyetlen hívója az
 * `agents/analyst/agent.js` volt, azt pedig kivezettük. Élesben mérve: 556
 * emlék, MIND 1.000-en, MIND „hot". A `lessonsBlock()` a salience-rendezésből
 * dolgozik — csupa döntetlennél a stabil rendezés a BESZÚRÁSI SORREND első
 * négyét adja, tehát hat hete ugyanaz a négy 07-13/14-i lecke ment minden
 * AI-hívásba, és a 119 megosztott leckéből 115 SOHA nem jutott promptba.
 *
 * ⚠️ MIÉRT KELL A NAPI KAPU: a levonás `DECAY_PER_DAY * daysSince(lastAccessed)`,
 * és ez a függvény NEM frissíti a `lastAccessed`-et. Ugyanazon a napon
 * kétszer hívva tehát KÉTSZER von le. A hívó (`core/housekeeping.js`) a CI
 * minden futásában megy, vagyis naponta háromszor — a kapu nélkül
 * háromszoros ütemben halványítanánk. Ez helyességi feltétel, nem kényelem.
 *
 * 📏 MÉRVE (2026-09-06) — A LEVONÁS NAPONTA ÖSSZEADÓDIK, NEM ÁLLANDÓ.
 * Mivel a levonás alapja `daysSince(lastAccessed)`, és ez a függvény a
 * `lastAccessed`-et nem frissíti, N nap alatt a teljes veszteség nem
 * `0,04·N`, hanem `0,02·N·(N+1)`. Vagyis a 0,05-ös padlót NEM 24 nap alatt
 * éri el egy emlék, hanem 7 alatt. Élesben: 617 emlékből 534 (86,5%)
 * pontosan 0,05-ön áll, és mind 6,8 napnál régebbi.
 *
 * 🔑 EZ NEM RONTJA EL A LECKE-VÁLASZTÁST, és ezért maradt így: a salience
 * mindkét ütemben SZIGORÚAN CSÖKKENŐ a kor függvényében, tehát a `list()`
 * sorrendje ugyanaz (mérve: 616 szomszédos párból 2 inverzió). A gyakorlati
 * jelentése viszont fontos: a salience nem „hasznosság", hanem ~7 napos
 * FRISSESSÉG-ÓRA — a rangsor ennél régebbi emlékek között nem különböztet.
 * Ha valaha tartós fontosságot kell rangsorolni, azt a `repeats` adja, nem ez.
 *
 * @returns {{total:number, moved:number, skipped?:boolean}}
 */
export function decay() {
  const store = load();
  const ma = new Date().toISOString().slice(0, 10);
  if (store.lastDecay === ma) {
    return { total: (store.items || []).length, moved: 0, skipped: true };
  }

  let moved = 0;
  for (const it of store.items || []) {
    const days = daysSince(it.lastAccessed);
    if (!Number.isFinite(days) || !Number.isFinite(it.salience)) continue;   // hiányos elem: kihagyjuk
    const before = it.tier;
    it.salience = Math.max(0.05, it.salience - DECAY_PER_DAY * days);
    it.tier = tierOf(it.salience);
    if (it.tier !== before) moved++;
  }
  store.lastDecay = ma;
  save(store);
  return { total: (store.items || []).length, moved };
}

// ---------- LIST (dashboardhoz — emlékek listája salience szerint) ----------
export function list(opts = {}) {
  const store = load();
  const { limit = 12, scope = null } = opts;
  return store.items
    .filter(it => !scope || it.scope === scope)
    .sort((a, b) => b.salience - a.salience)
    .slice(0, limit)
    .map(it => ({ text: it.text, tier: it.tier, scope: it.scope, tags: it.tags, salience: Math.round(it.salience * 100) }));
}

// ---------- STATS (dashboardhoz) ----------
export function stats() {
  const store = load();
  const s = { total: store.items.length, hot: 0, warm: 0, cold: 0, byScope: {} };
  for (const it of store.items) {
    s[it.tier]++;
    s.byScope[it.scope] = (s.byScope[it.scope] || 0) + 1;
  }
  return s;
}

// ---------- TANULSÁG-BLOKK (2026-07-13, cég-hierarchia) ----------
// Minden AI-hívás promptja elé kerül (core/ai-router.ask): a cég KÖZÖS
// tanulságai ('shared' scope) + az agent SAJÁT leckéi — "tudjanak egymás
// hibáiból tanulni". Kivétel: az iro és a guide a saját scope-ját maga tölti
// szemantikusan (loadLessons) — nekik itt csak a shared jár, hogy ne
// duplázzunk. Determinisztikus és $0 (nincs API-hívás).
const SELF_LOADING = new Set(['iro', 'guide']);
export function lessonsBlock(agentName) {
  if (!agentName) return '';
  try {
    const shared = list({ scope: 'shared', limit: 4 });
    const own = SELF_LOADING.has(agentName) ? [] : list({ scope: agentName, limit: 4 });
    if (!shared.length && !own.length) return '';
    const lines = [
      ...shared.map(x => `- [cég] ${x.text}`),
      ...own.map(x => `- [saját] ${x.text}`)
    ].slice(0, 8);
    return `\n\nCOMPANY LESSONS (learned from past mistakes — apply them):\n${lines.join('\n')}`.slice(0, 1500);
  } catch { return ''; }
}

export default { remember, recall, recallSemantic, szemantikusAllapot, purgeStoreEmbeddings, decay, stats, lessonsBlock };
