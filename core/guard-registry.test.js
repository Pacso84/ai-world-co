// ===================================================================
// TESZT — őrszem-nyilvántartás: minden őrszem-fájlnak van OLVASÓJA és
// FRISSESSÉG-ŐRE (2026-09-15)
// ===================================================================
// INGYENES, hálózat nélküli. Csak SZÖVEGET olvas — a projektből semmit nem
// importál (az `agents/` és a `core/daily-report.js` puszta importja pénzt
// költene és publikálna).
//
// MI A RÉS, AMIT ZÁR. Egy őrszem három, egymástól független lépésből áll:
//   (a) valami ÍRJA a `memory/<nev>.json`-t,
//   (b) a `core/daily-report.js` BEOLVASSA, és riport-sort csinál belőle,
//   (c) ott van a riport frissesség-térképében (`const nevek = {`), hogy a
//       NÉMÁN leállt őrszem az `at` bélyegből kiderüljön.
// Eddig semmi nem kötötte össze a hármat. Mért precedens: a
// `memory/guide-coverage-guard.json`-t a build HETEKIG írta, és senki nem
// olvasta. A 09-12-i audit 15 író → 12 riport-blokk → 11 frissesség-bejegyzés
// lépcsőt mért; a `link-guard.json` és a `housekeeping.json` minden futásban
// íródott (a git-történet szerint mindhárom napi commitban ott van), a
// frissesség-térképből mégis hiányzott.
//
// A SZABÁLY — MINDKÉT IRÁNYBAN (a mérce iránya számít):
//   1. minden őrszem-fájlt olvas a riport, VAGY indokolt kivétel;
//   2. minden futásban írt őrszem-fájl a frissesség-térképben van, VAGY
//      indokolt kivétel („csak gondnál íródik" — ott a régi `at` normális);
//   3. a kivételként NEM minden futásban írt fájl NEM lehet a térképben
//      (különben napi hamis riasztás — és a hamis riasztás megeszi az igazit);
//   4. a kivétel-listák nem rohadhatnak: ami mögött nincs író, az bukik;
//   5. minden MÁS memória-író is be van sorolva, így egy nem `-guard.json`
//      nevű új őrszem sem csúszhat át észrevétlenül.
//
// ⚠️ AMIT NEM LÁT (a statikus olvasás határa):
//   • hogy egy fájl TÉNYLEG minden futásban íródik-e — ezt a kivétel-lista
//     mondja ki, emberi ítélettel. Az alapértelmezés a SZIGORÚBB irány: új
//     őrszem → kell a térképbe, amíg valaki meg nem indokolja, miért nem;
//   • hogy a beolvasásból tényleg riport-SOR lesz-e (azt az egyes őrszemek
//     saját tesztjei nézik, pl. buffer-guard.test.js, output-guard.test.js);
//   • az azonosítók hatókörét: egy fájlon belül az azonos nevű változókat
//     egynek veszi (a leltár ezért kézzel átnézve indult, lásd `--leltar`);
//   • a más fájlban definiált író-segédfüggvényt. Fájlon belül, egy szinten
//     látja (pl. a `core/budget.js` `atomiIras()`-a → `renameSync`).
//
// Kézi leltár: node core/guard-registry.test.js --leltar
// ===================================================================

import assert from 'assert/strict';
import { readFileSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, relative } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');
const LELTAR = process.argv.includes('--leltar');

let pass = 0, bukott = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log('  ✅ ' + name); }
  catch (e) { bukott++; console.log('  ❌ ' + name + '\n     ' + String(e.message).split('\n').join('\n     ')); }
};

console.log('🧪 őrszem-nyilvántartás — író · riport-olvasás · frissesség-térkép\n');

// ===================================================================
// KIVÉTELEK — mindegyik mellé legalább 40 karakteres INDOKLÁS kell.
// Egy kivétel, ami mögött már nincs író, a tesztet BUKTATJA (töröld).
// ===================================================================

/** Őrszem-kimenet, bár a neve nem `-guard.json` — ugyanazok a szabályok vonatkoznak rá. */
const EGYEB_ORSZEM = {
  'housekeeping.json': 'a Házmester beépített hízás-őre (watchGrowth) ide írja a figyelmeztetést, a napi riport ebből szól'
};

/**
 * Őrszem-fájl, amit a riport NEM közvetlenül olvas.
 * `atvevo`: a modul, ami beolvassa · `hivas`: a függvény, amit a riport meghív belőle.
 * Mindkettőt ELLENŐRIZZÜK — a kivétel indoka nem maradhat meg papíron.
 */
const RIPORT_KIVETEL = {
  'name-guard.json': {
    ok: 'napló, nem állapot: a riport KÖZVETVE olvassa — a qualityFindings() checkNameLock() ága teszi a Minőség-őr sorba',
    atvevo: 'core/quality-guard.js',
    hivas: 'qualityFindings'
  }
};

/** Őrszem-fájl, ami NEM minden futásban íródik — a frissesség-térképben hamis riasztás lenne. */
const FRISSESSEG_KIVETEL = {
  'budget-guard.json': 'csak GOND esetén íródik (core/budget.js jeletHagy) — élesben a fájl nem is létezik',
  'semantic-guard.json': 'naponta csak az ELSŐ szemantikus keresés írja, és csak ha az Író/Útmutató dolgozott — üres napon nincs keresés, a régi `at` normális',
  'name-guard.json': 'csak NÉV-ZÁR-kifogásnál íródik (core/name-guard.js jegyezNevZar), és nincs felső szintű `at` mezője'
};

/** Memória-író, ami NEM őrszem-kimenet. Új állapotfájl → ide, egy mondat indoklással. */
const NEM_ORSZEM = {
  'ceo-desk-log.json': 'a CEO-asztal napi döntés-naplója (agents/ceo/desk.js) — a riport statisztikát olvas belőle, nem lelet',
  'chat-history.json': 'a Telegram-bot beszélgetés-előzménye (core/telegram.js) — munkaanyag, nincs benne ellenőrzés',
  'compare-state.json': 'a heti összehasonlító agent futás-kapuja (last_week, hibaszámláló) — ismétlés-védelem',
  'daily-report-state.json': 'a napi riport SAJÁT küldés- és zajszűrő-állapota (last_sent, orszem) — nem őrszem-kimenet',
  'digest-state.json': 'a heti összefoglaló agent futás-kapuja (last_week, hibaszámláló) — ismétlés-védelem',
  'emergency-fallback-state.json': 'a vészháló-riasztás napi dedup-kulcsa (core/ai-router.js) — a riasztás maga Telegramra megy',
  'handbacks.json': 'a visszaküldött cikkek postafiókja (core/handback.js) — munkasor, nem ellenőrzési eredmény',
  'hu-word-verdicts.json': 'a magyar helyesírás-bíró szó-ítéleteinek tára (core/hu-review.js) — gyorsítótár, nem lelet',
  'memory-embeddings.json': 'a beágyazás-vektorok gitignore-olt gyorsítótára — adat; a beágyazó életét az embed-guard.json őrzi',
  'ops.json': 'feladat- és értesítés-tár (core/ops.js) — működési adat; a hízását a Házmester hízás-őre figyeli',
  'quality-fix-log.json': 'a minőség-önjavító javítás-naplója (mit javított magától) — eseménynapló, nem lelet-állapot',
  'reel-pending.json': 'a Reel két fázisa közti átadó fájl (--prepare → --send) — munkaanyag; a bukást a reel-guard.json jelzi',
  'search-report-state.json': 'a heti kereső-riport küldés-dedupja (last_week) — ismétlés-védelem, nem ellenőrzési eredmény',
  'store.json': 'a memória szövegtára (leckék) — adat; a méretét a Házmester hízás-őre figyeli (600 KB-os határ)',
  'topic-dedup-log.json': 'a témaismétlés-szűrő döntés-naplója — eseménynapló; az őr ÉLETÉT az embed-guard.json méri',
  'traffic-log.json': 'a cikkenkénti forgalom-napló (KIZÁRÓLAG a CI írja) — mérési adat, nem őrszem-lelet',
  'translation-cost.json': 'a fordítás futásonkénti költség-átlaga — becsléshez használt mérőszám, nem ellenőrzés',
  'translation-failures.json': 'a fordító újrapróba-számlálója (a sokszor bukó fájl kihagyásához) — belső vezérlés',
  'truth-gate-log.json': 'a hitelesség-kapu döntés-naplója — a riport és a forrás-bizonyítvány összesít belőle; napló',
  'video-state.json': 'az Orbit heti videó futás-kapuja (last_week) — a funkció ki van kapcsolva; ismétlés-védelem'
};

// ===================================================================
// A SZKENNER — statikus, szöveg alapú
// ===================================================================

const AZON = '[A-Za-z_$][\\w$]*';

/** CRLF → LF, a TELJES SOROS kommentek üres sorra cserélve (a sorszám marad). */
function kodSorok(forras) {
  return String(forras).replace(/\r\n/g, '\n').split('\n')
    .map(l => (/^\s*(\/\/|\/\*|\*)/.test(l) ? '' : l)).join('\n');
}

/** A karakterlánc záró idézőjele (sima idézőjelnél ugyanazon a soron); -1, ha nincs. */
function zaroIdezojel(src, i) {
  const q = src[i];
  const plafon = q === '`' ? i + 400 : src.length;
  for (let j = i + 1; j < src.length && j < plafon; j++) {
    if (src[j] === '\\') { j++; continue; }
    if (src[j] === q) return j;
    if (src[j] === '\n' && q !== '`') return -1;
  }
  return -1;
}

const FOLYTATAS_RX = /^(\|\||\?\?|\?|:|&&|\+|\.)/;

/**
 * Egy kifejezés végéig lép, zárójel-mélységet és karakterláncot követve.
 *   'arg'      → felső szintű `,` vagy a záró `)`
 *   'utasitas' → `;`, vagy sorvég, ha a következő sor nem folytatás (`||`, `?`, …)
 *   'blokk'    → csak a párját vesztett záró zárójel
 * ⚠️ A páratlan idézőjelet (pl. egy `/["']/` regex-literálban) NEM veszi
 * karakterlánc-kezdetnek — különben a fájl maradéka elcsúszna.
 */
function kifejezesVege(src, kezd, mod, plafon = 1500) {
  let melyseg = 0;
  const vegso = Math.min(src.length, kezd + plafon);
  for (let i = kezd; i < vegso; i++) {
    const c = src[i];
    if (c === "'" || c === '"' || c === '`') {
      const z = zaroIdezojel(src, i);
      if (z > i) i = z;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {          // sorvégi komment
      const nl = src.indexOf('\n', i);
      if (nl < 0) return src.length;
      i = nl - 1;
      continue;
    }
    if (c === '(' || c === '[' || c === '{') { melyseg++; continue; }
    if (c === ')' || c === ']' || c === '}') {
      if (melyseg === 0) return i;
      melyseg--;
      continue;
    }
    if (melyseg > 0 || mod === 'blokk') continue;
    if (mod === 'arg' && c === ',') return i;
    if (mod === 'utasitas' && c === ';') return i;
    if (mod === 'utasitas' && c === '\n' && src.slice(kezd, i).trim()) {
      const kov = src.slice(i + 1).match(/^\s*(\S\S?)/);
      if (!kov || !FOLYTATAS_RX.test(kov[1])) return i;
    }
  }
  return vegso;
}

/** Egy hívás (vagy paraméterlista) elemei a nyitó `(` indexétől. */
function argumentumok(src, nyito) {
  const args = [];
  let i = nyito + 1;
  for (;;) {
    const v = kifejezesVege(src, i, 'arg');
    const a = src.slice(i, v).trim();
    if (a) args.push(a);
    if (src[v] !== ',') return { args, vege: v };
    i = v + 1;
  }
}

/** Azonosító → a hozzá kötött kifejezés(ek), fájlon belül (hatókör nélkül). */
function kotesek(kod) {
  const k = new Map();
  const add = (nev, kif) => { if (!k.has(nev)) k.set(nev, []); k.get(nev).push(kif.trim()); };
  for (const m of kod.matchAll(new RegExp(`\\b(?:const|let|var)\\s+(${AZON})\\s*=(?![=>])`, 'g'))) {
    const kezd = m.index + m[0].length;
    add(m[1], kod.slice(kezd, kifejezesVege(kod, kezd, 'utasitas')));
  }
  for (const m of kod.matchAll(new RegExp(`\\bfunction\\s*(${AZON})?\\s*\\(`, 'g'))) {
    const { args, vege } = argumentumok(kod, m.index + m[0].length - 1);
    // paraméter-alapérték: function jegyez(x, ut = GUARD_PATH)
    for (const a of args) {
      const d = a.match(new RegExp(`^(${AZON})\\s*=([\\s\\S]+)$`));
      if (d) add(d[1], d[2]);
    }
    // visszatérési érték: function nevZarUt() { return … }
    const r = kod.slice(vege + 1).match(/^\s*\{\s*return\b/);
    if (m[1] && r) {
      const kezd = vege + 1 + r[0].length;
      add(m[1], kod.slice(kezd, kifejezesVege(kod, kezd, 'utasitas')));
    }
  }
  return k;
}

/**
 * Egy útvonal-kifejezés: mely `memory/*.json` fájl(ok)ra mutat (`nevek`), és
 * egyáltalán a memória-mappába mutat-e (`memoria`). Ha a második igaz, de
 * fájlnév nincs, az statikusan eldönthetetlen (dinamikus) írás.
 */
function feloldas(kif, kot, latott = new Set()) {
  const nevek = new Set();
  let memoria = false;
  const szovegErtek = id => (kot.get(id) || [])
    .map(x => x.match(/^['"`]([^'"`]*)['"`]$/)).filter(Boolean).map(m => m[1]);
  const memoriaMappa = id => (kot.get(id) || [])
    .some(x => /['"`]memory['"`]\s*\)$/.test(x) || /^['"`](?:\.{1,2}\/)*memory\/?['"`]$/.test(x));
  const fajl = nev => { memoria = true; if (/^[\w.-]+\.json$/.test(nev)) nevek.add(nev); };

  // 1) join(…, 'memory', 'x.json')
  for (const m of kif.matchAll(/['"`]memory['"`]\s*,\s*['"`]([^'"`]*)['"`]/g)) fajl(m[1]);
  // 2) join(…, 'memory', KONSTANS)
  for (const m of kif.matchAll(new RegExp(`['"\`]memory['"\`]\\s*,\\s*(${AZON})\\s*[,)]`, 'g'))) {
    memoria = true;
    szovegErtek(m[1]).forEach(fajl);
  }
  // 3) '…memory/x.json' egy karakterláncban (sablon-karakterláncban is)
  for (const m of kif.matchAll(/['"`][^'"`\n]*?\bmemory\/([^'"`\s]*)['"`]/g)) fajl(m[1]);
  // 4) join(MAPPA, 'x.json' | KONSTANS), ahol MAPPA = join(…, 'memory')
  const mappasJoin = new RegExp(`\\b(?:join|resolve)\\(\\s*(${AZON})\\s*,\\s*(?:['"\`]([^'"\`]*)['"\`]|(${AZON}))\\s*\\)`, 'g');
  for (const m of kif.matchAll(mappasJoin)) {
    if (!memoriaMappa(m[1])) continue;
    memoria = true;
    if (m[2] !== undefined) fajl(m[2]); else szovegErtek(m[3]).forEach(fajl);
  }
  // 5) maga a memória-mappa, fájlnév nélkül
  if (/['"`]memory['"`]\s*\)/.test(kif)) memoria = true;
  // 6) tranzitív: a kifejezés saját azonosítói (karakterlánc és tulajdonság-elérés nélkül)
  const csupasz = kif.replace(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`[^`]*`/g, '""');
  for (const m of csupasz.matchAll(new RegExp(`(?<![\\w$.])(${AZON})`, 'g'))) {
    const id = m[1];
    if (!kot.has(id) || latott.has(id)) continue;
    latott.add(id);
    for (const k of kot.get(id)) {
      const r = feloldas(k, kot, latott);
      r.nevek.forEach(n => nevek.add(n));
      if (r.memoria) memoria = true;
    }
  }
  return { nevek, memoria };
}

/** Írás-primitívek: név → a CÉL-útvonal argumentumának indexe. */
const ALAP_IROK = { writeFileSync: 0, appendFileSync: 0, writeFile: 0, renameSync: 1 };

/** A megadott nevű hívások (a függvény-DEFINÍCIÓ kivételével), a cél-argumentummal. */
function hivasok(kod, irok) {
  const ki = [];
  const nevek = Object.keys(irok).map(n => n.replace(/\$/g, '\\$')).join('|');
  for (const m of kod.matchAll(new RegExp(`(?<!function\\s*)(?<![\\w$])(${nevek})\\s*\\(`, 'g'))) {
    const { args } = argumentumok(kod, m.index + m[0].length - 1);
    ki.push({ nev: m[1], cel: args[irok[m[1]]], index: m.index });
  }
  return ki;
}

/**
 * Fájlon belüli író-segédfüggvények (0. oszlopos `function`), amelyek egy
 * PARAMÉTERÜKBE írnak: `function atomiIras(ut, s) { … renameSync(tmp, ut) }`.
 */
function segedIrok(kod) {
  const irok = { ...ALAP_IROK };
  for (let kor = 0; kor < 2; kor++) {
    for (const m of kod.matchAll(new RegExp(`^(?:export\\s+)?(?:async\\s+)?function\\s+(${AZON})\\s*\\(`, 'gm'))) {
      if (Object.hasOwn(irok, m[1])) continue;
      const { args, vege } = argumentumok(kod, m.index + m[0].length - 1);
      const parameterek = args.map(a => (a.match(new RegExp(`^${AZON}`)) || [''])[0]);
      const zaro = kod.indexOf('\n}', vege);
      const torzs = kod.slice(vege, zaro < 0 ? kod.length : zaro);
      for (const h of hivasok(torzs, irok)) {
        const idx = parameterek.indexOf((h.cel || '').trim());
        if (idx >= 0) { irok[m[1]] = idx; break; }
      }
    }
  }
  return irok;
}

/** Egy forrásfájl memória-írásai: `{ irasok: [{nev, sor}], dinamikus: [{sor, cel}] }`. */
function memoriaIrasok(forras) {
  const kod = kodSorok(forras);
  const kot = kotesek(kod);
  const irasok = [], dinamikus = [];
  for (const h of hivasok(kod, segedIrok(kod))) {
    if (!h.cel) continue;
    const { nevek, memoria } = feloldas(h.cel, kot);
    const sor = kod.slice(0, h.index).split('\n').length;
    if (nevek.size) for (const nev of nevek) irasok.push({ nev, sor });
    else if (memoria) dinamikus.push({ sor, cel: h.cel.replace(/\s+/g, ' ').slice(0, 80) });
  }
  return { irasok, dinamikus };
}

/** A forrás által `readFileSync`-kel beolvasott `memory/*.json` fájlok. */
function memoriaOlvasasok(forras) {
  const kod = kodSorok(forras);
  const kot = kotesek(kod);
  const nevek = new Set();
  for (const h of hivasok(kod, { readFileSync: 0 })) {
    if (h.cel) feloldas(h.cel, kot).nevek.forEach(n => nevek.add(n));
  }
  return nevek;
}

/**
 * A riport frissesség-térképe: a kulcsok, és hogy a térkép TÉNYLEG be van-e
 * kötve (beolvassa a fájlokat, és az `elavultOrszemek()`-be adja). Egy
 * bekötetlen térkép dísz — minden kulcsa „rendben" lenne, miközben semmit nem néz.
 */
function frissessegTerkep(forras) {
  const kod = kodSorok(forras);
  const i = kod.indexOf('const nevek = {');
  if (i < 0) return null;
  const nyito = kod.indexOf('{', i);
  const zaro = kifejezesVege(kod, nyito + 1, 'blokk', 20000);
  const torzs = kod.slice(nyito + 1, zaro);
  const utana = kod.slice(zaro, zaro + 800);
  return {
    kulcsok: [...torzs.matchAll(/['"`]([\w.-]+\.json)['"`]\s*:/g)].map(m => m[1]),
    bekotve: /Object\.entries\(\s*nevek\s*\)/.test(utana)
      && /readFileSync\(\s*join\(\s*ROOT\s*,\s*['"]memory['"]\s*,\s*f\s*\)/.test(utana)
      && /elavultOrszemek\(\s*beolvasott\s*\)/.test(utana)
  };
}

function orszemFajl(nev) {
  return /-guard\.json$/.test(nev) || Object.hasOwn(EGYEB_ORSZEM, nev);
}

const GYOKEREK = ['core', 'website', 'agents', 'telegram-worker'];
const KIHAGY = new Set(['node_modules', 'public', '.wrangler', '.git']);
const rel = p => relative(REPO, p).replace(/\\/g, '/');

function forrasFajlok() {
  const ki = [];
  const jar = (dir) => {
    let bejegyzesek;
    try { bejegyzesek = readdirSync(dir); } catch { return; }   // a mappa hiánya nem hiba
    for (const e of bejegyzesek) {
      if (KIHAGY.has(e)) continue;
      const p = join(dir, e);
      let st;
      try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) jar(p);
      // A tesztek nem írók: a valódi memory/-útvonalat csak ŐRZIK (érintetlen-e).
      else if (/\.m?js$/.test(e) && !/\.test\.m?js$/.test(e)) ki.push(p);
    }
  };
  for (const g of GYOKEREK) jar(join(REPO, g));
  return ki;
}

function leltar() {
  const irok = new Map();
  const dinamikus = [];
  const fajlok = forrasFajlok();
  for (const p of fajlok) {
    const r = memoriaIrasok(readFileSync(p, 'utf-8'));
    for (const { nev, sor } of r.irasok) {
      if (!irok.has(nev)) irok.set(nev, new Set());
      irok.get(nev).add(`${rel(p)}:${sor}`);
    }
    for (const d of r.dinamikus) dinamikus.push(`${rel(p)}:${d.sor} — ${d.cel}`);
  }
  const riport = readFileSync(join(REPO, 'core', 'daily-report.js'), 'utf-8');
  const terkep = frissessegTerkep(riport);
  return {
    fajlSzam: fajlok.length, irok, dinamikus, riport, terkep,
    olvas: memoriaOlvasasok(riport),
    terkepNevek: new Set(terkep ? terkep.kulcsok : []),
    orszemek: [...irok.keys()].filter(orszemFajl).sort()
  };
}

const honnan = (L, nev) => [...(L.irok.get(nev) || [])].join(', ');

// ===================================================================
// 1) A MŰSZER HITELESÍTÉSE — ismert alakokon, a valódi fájlok előtt
// ===================================================================

const irtNevek = (forras) => [...new Set(memoriaIrasok(forras).irasok.map(x => x.nev))].sort();
const sorok = (...s) => s.join('\n');

t('🔬 a szkenner az ISMERT író-alakokat mind felismeri (a mérce hitelesítése)', () => {
  assert.deepEqual(irtNevek("writeFileSync(join(ROOT, 'memory', 'a-guard.json'), '{}', 'utf-8');"),
    ['a-guard.json'], 'közvetlen join (image-guard.js alak)');

  const CRLF = String.fromCharCode(13, 10);
  assert.deepEqual(irtNevek([
    'const P = process.env.X_PATH',
    "  || join(__dirname, '..', 'memory', 'b-guard.json');",
    "function f() { writeFileSync(P, '{}'); }"
  ].join(CRLF)), ['b-guard.json'], 'többsoros konstans, CRLF sorvéggel (embed-guard.js alak)');

  assert.deepEqual(irtNevek(sorok(
    "export const FAJL = 'c-guard.json';",
    'export function ir(ROOT) {',
    "  const dir = join(ROOT, 'memory');",
    "  writeFileSync(join(dir, FAJL), '{}', 'utf-8');",
    '}')), ['c-guard.json'], 'mappa-változó + fájlnév-konstans (test-guard.js alak)');

  assert.deepEqual(irtNevek(sorok(
    'export function hova() {',
    "  return process.env.Y_PATH || join(__dirname, '..', 'memory', 'd-guard.json');",
    '}',
    'export function jegyez(x, ut = hova()) {',
    '  writeFileSync(ut, x);',
    '}')), ['d-guard.json'], 'paraméter-alapérték + visszatérési érték (name-guard.js alak)');

  assert.deepEqual(irtNevek(sorok(
    'function atomi(cel, szoveg) {',
    "  writeFileSync(cel + '.tmp', szoveg);",
    "  renameSync(cel + '.tmp', cel);",
    '}',
    "const G = process.env.Z_PATH ? join(dirname(S), 'e-guard.json') : join(__dirname, '..', 'memory', 'e-guard.json');",
    "atomi(G, '{}');")), ['e-guard.json'], 'író-segédfüggvény + feltételes útvonal (budget.js alak)');

  assert.deepEqual(irtNevek(sorok(
    "const p = join(ROOT, 'memory', 'f-guard.json');",
    'fs.writeFileSync(p, JSON.stringify({ at: 1 }));')), ['f-guard.json'], 'fs.-előtagos hívás');
});

t('🔬 kommentet, olvasást és regex-literált NEM vesz írásnak', () => {
  assert.deepEqual(irtNevek(sorok(
    "// writeFileSync(join(ROOT, 'memory', 'x-guard.json'), '{}');",
    " * writeFileSync(join(ROOT, 'memory', 'y-guard.json'), '{}');",
    "/* writeFileSync(join(ROOT, 'memory', 'z-guard.json'), '{}'); */",
    "const g = JSON.parse(readFileSync(join(ROOT, 'memory', 'olvasott-guard.json'), 'utf-8'));",
    "writeFileSync(join(OUT, 'nem-memoria.json'), '{}');")), [],
    'kommentet, olvasást vagy nem-memória útvonalat írásnak vett');

  assert.ok(memoriaOlvasasok("const g = JSON.parse(readFileSync(join(ROOT, 'memory', 'olvasott-guard.json'), 'utf-8'));")
    .has('olvasott-guard.json'), 'a valódi beolvasást nem látja');
  assert.ok(!memoriaOlvasasok("  // const g = readFileSync(join(ROOT, 'memory', 'kommentben-guard.json'));")
    .has('kommentben-guard.json'), 'a kikommentelt beolvasást olvasásnak veszi — egy őr már zöld maradt így');

  // Páratlan idézőjel egy regex-literálban (name-guard.js `strip`) ne csúsztassa el a fájl maradékát.
  assert.deepEqual(irtNevek(sorok(
    "const strip = (s) => s.replace(/^[\"']+|[\"']+$/g, '');",
    "const tisztit = (s) => s.replace(/[']/g, '');",
    "writeFileSync(join(ROOT, 'memory', 'utana-guard.json'), '{}');")), ['utana-guard.json'],
    'a regex-literál idézőjele elcsúsztatta a szkennert');
});

t('🎲 a dinamikus (statikusan eldönthetetlen) fájlnevet KÜLÖN jelzi, nem nyeli el', () => {
  const r = memoriaIrasok("writeFileSync(join(ROOT, 'memory', `${nev}-guard.json`), '{}');");
  assert.equal(r.irasok.length, 0, 'kitalált egy fájlnevet');
  assert.equal(r.dinamikus.length, 1, 'a dinamikus memória-írás némán eltűnt');
});

t('🔬 a frissesség-térkép kulcsait kommentek nélkül olvassa, és a bekötést is látja', () => {
  const minta = sorok(
    'const nevek = {',
    "  'a-guard.json': 'A', // megjegyzés",
    "  // 'b-guard.json': 'B',",
    "  'c-guard.json': 'C'",
    '};',
    'const beolvasott = {};',
    'for (const [f, nev] of Object.entries(nevek)) {',
    "  try { beolvasott[nev] = JSON.parse(readFileSync(join(ROOT, 'memory', f), 'utf-8')); } catch { /* nincs */ }",
    '}',
    'const sor = frissessegSor(elavultOrszemek(beolvasott));');
  const r = frissessegTerkep(minta);
  assert.deepEqual(r.kulcsok, ['a-guard.json', 'c-guard.json'], 'rossz kulcsok: ' + JSON.stringify(r.kulcsok));
  assert.equal(r.bekotve, true, 'a bekötött térképet bekötetlennek látja');
  assert.equal(frissessegTerkep(minta.replace('elavultOrszemek(beolvasott)', 'elavultOrszemek({})')).bekotve, false,
    'a bekötetlen térképet is bekötöttnek látja');
});

// ===================================================================
// 2) A VALÓDI FORRÁSFA
// ===================================================================

let L = null;
t('📂 a valódi forrásfa átvizsgálható', () => { L = leltar(); });
const kell = () => assert.ok(L, 'nincs leltár — a szkenner elszállt (lásd fent)');

t('⚠️ a szkenner TÉNYLEG lát írókat, olvasást és térképet (különben a zöld semmit nem ér)', () => {
  kell();
  // Kimérve 2026-09-15-én: 132 forrásfájl · 37 memória-író · 17 őrszem-fájl ·
  // 12 térkép-kulcs. A küszöbök jóval alatta vannak, hogy egy-egy őrszem jogos
  // megszűnése ne buktassa el — a minta elromlása viszont a nulla felé vinné.
  assert.ok(L.fajlSzam >= 100, `csak ${L.fajlSzam} forrásfájl — rossz a gyökér?`);
  assert.ok(L.irok.size >= 25, `csak ${L.irok.size} memória-fájlnak talált írót — romlott a minta`);
  assert.ok(L.orszemek.length >= 12, `csak ${L.orszemek.length} őrszem-fájl — romlott a minta`);
  assert.ok(L.olvas.size >= 15, `a riportban csak ${L.olvas.size} memória-olvasást látott — romlott a minta`);
  assert.ok(L.terkep, 'nincs `const nevek = {` a riportban — átnevezték a frissesség-térképet?');
  assert.ok(L.terkep.kulcsok.length >= 10, `a frissesség-térképben csak ${L.terkep.kulcsok.length} kulcs`);
});

t('🔌 a frissesség-térkép BE VAN KÖTVE (beolvassa a fájlokat, és az elavultOrszemek()-be adja)', () => {
  kell();
  assert.ok(L.terkep && L.terkep.bekotve,
    'a `const nevek = {` után nem ez áll: Object.entries(nevek) → readFileSync(join(ROOT, \'memory\', f)) → '
    + 'elavultOrszemek(beolvasott). Egy bekötetlen térkép dísz: minden kulcsa „rendben", miközben semmit nem néz.');
});

t('🔑 minden őrszem-fájlt OLVAS a napi riport (vagy indokolt kivétel)', () => {
  kell();
  const hiany = L.orszemek.filter(n => !L.olvas.has(n) && !Object.hasOwn(RIPORT_KIVETEL, n));
  assert.deepEqual(hiany, [],
    'őrszem-fájl, amit a core/daily-report.js nem olvas — a guide-coverage-guard.json hetekig így élt, senkihez nem szólt:\n'
    + hiany.map(n => `${n}  ← ${honnan(L, n)}`).join('\n'));
});

t('🕰️ minden futásban író őrszem ott van a frissesség-térképben (vagy indokolt kivétel)', () => {
  kell();
  const hiany = L.orszemek.filter(n => !L.terkepNevek.has(n) && !Object.hasOwn(FRISSESSEG_KIVETEL, n));
  assert.deepEqual(hiany, [],
    'őrszem-fájl a frissesség-térkép (daily-report.js `const nevek = {`) nélkül — ha leáll, az előző futás '
    + '„minden rendben"-je marad a lemezen. Vedd fel a térképbe, vagy ha CSAK GONDNÁL íródik, a '
    + 'FRISSESSEG_KIVETEL-be indoklással:\n' + hiany.map(n => `${n}  ← ${honnan(L, n)}`).join('\n'));
});

t('🔕 a NEM minden futásban író őrszem NINCS a térképben (különben napi hamis riasztás)', () => {
  kell();
  const ellent = Object.keys(FRISSESSEG_KIVETEL).filter(n => L.terkepNevek.has(n));
  assert.deepEqual(ellent, [],
    'a kivétel szerint nem minden futásban íródik, a frissesség-térkép mégis figyeli — a régi `at` napi '
    + '„LEFAGYOTT ŐRSZEM" riasztást adna. Egyiket töröld:\n' + ellent.join('\n'));
});

t('👻 a frissesség-térkép minden bejegyzése mögött van író', () => {
  kell();
  const arva = [...L.terkepNevek].filter(n => !L.irok.has(n));
  assert.deepEqual(arva, [],
    'a térkép olyan fájlt figyel, amit semmi nem ír (megszűnt vagy átnevezett őrszem):\n' + arva.join('\n'));
});

t('🔗 a közvetett olvasó TÉNYLEG olvassa a fájlt, és a riport TÉNYLEG hívja', () => {
  kell();
  const riportKod = kodSorok(L.riport);
  for (const [nev, k] of Object.entries(RIPORT_KIVETEL)) {
    if (!k.atvevo) continue;
    let forras;
    try { forras = readFileSync(join(REPO, k.atvevo), 'utf-8'); }
    catch { assert.fail(`RIPORT_KIVETEL ${nev}: a közvetítő modul nem létezik: ${k.atvevo}`); }
    assert.ok(memoriaOlvasasok(forras).has(nev),
      `RIPORT_KIVETEL ${nev}: a ${k.atvevo} már NEM olvassa — a kivétel indoka megszűnt, a fájl senkihez nem jut el`);
    const modul = './' + relative(join(REPO, 'core'), join(REPO, k.atvevo)).replace(/\\/g, '/');
    const esc = modul.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    assert.ok(new RegExp(`(?:from\\s*|import\\(\\s*)['"]${esc}['"]`).test(riportKod),
      `RIPORT_KIVETEL ${nev}: a daily-report.js nem importálja: ${modul}`);
    assert.ok(new RegExp(`(?<![\\w$])${k.hivas}\\s*\\(`).test(riportKod),
      `RIPORT_KIVETEL ${nev}: a daily-report.js nem hívja: ${k.hivas}()`);
  }
});

t('🗂️ minden MÁS memória-író is be van sorolva (őrszem-e vagy sem)', () => {
  kell();
  const besorolatlan = [...L.irok.keys()].filter(n => !orszemFajl(n) && !Object.hasOwn(NEM_ORSZEM, n)).sort();
  assert.deepEqual(besorolatlan, [],
    'új memory/*.json író, besorolás nélkül. Ha őrszem-kimenet: nevezd `-guard.json`-nak (vagy EGYEB_ORSZEM), '
    + 'és kösd be a riportba; ha nem: NEM_ORSZEM, egy mondat indoklással:\n'
    + besorolatlan.map(n => `${n}  ← ${honnan(L, n)}`).join('\n'));
});

t('🧹 a kivétel-listák nem rohadnak: minden bejegyzés mögött VALÓDI író van', () => {
  kell();
  const elavult = [];
  for (const [lista, obj] of Object.entries({ EGYEB_ORSZEM, RIPORT_KIVETEL, FRISSESSEG_KIVETEL, NEM_ORSZEM })) {
    for (const nev of Object.keys(obj)) if (!L.irok.has(nev)) elavult.push(`${lista}: ${nev}`);
  }
  assert.deepEqual(elavult, [], 'elavult kivétel — nincs mögötte író, töröld a listából:\n' + elavult.join('\n'));
});

t('📝 minden kivétel mellett legalább 40 karakteres indoklás áll', () => {
  const rovid = [];
  for (const [lista, obj] of Object.entries({ EGYEB_ORSZEM, RIPORT_KIVETEL, FRISSESSEG_KIVETEL, NEM_ORSZEM })) {
    for (const [nev, v] of Object.entries(obj)) {
      const ok = typeof v === 'string' ? v : v?.ok;
      if (typeof ok !== 'string' || ok.trim().length < 40) rovid.push(`${lista}: ${nev} (${String(ok ?? '').trim().length} kar.)`);
    }
  }
  assert.deepEqual(rovid, [], 'indoklás nélküli vagy túl rövid kivétel:\n' + rovid.join('\n'));
});

t('⚖️ a kivételek nem mondanak ellent a valóságnak', () => {
  kell();
  const baj = [];
  for (const nev of Object.keys(RIPORT_KIVETEL)) {
    if (L.olvas.has(nev)) baj.push(`RIPORT_KIVETEL ${nev}: a riport már KÖZVETLENÜL olvassa — felesleges kivétel`);
    if (!orszemFajl(nev)) baj.push(`RIPORT_KIVETEL ${nev}: nem őrszem-fájl — rossz listán`);
  }
  for (const nev of Object.keys(FRISSESSEG_KIVETEL)) {
    if (!orszemFajl(nev)) baj.push(`FRISSESSEG_KIVETEL ${nev}: nem őrszem-fájl — rossz listán`);
  }
  for (const nev of Object.keys(NEM_ORSZEM)) {
    if (orszemFajl(nev)) baj.push(`NEM_ORSZEM ${nev}: a neve/besorolása szerint ŐRSZEM — nem bújhat ki a szabály alól`);
  }
  for (const nev of Object.keys(EGYEB_ORSZEM)) {
    if (/-guard\.json$/.test(nev)) baj.push(`EGYEB_ORSZEM ${nev}: -guard.json, magától is őrszem — felesleges`);
  }
  assert.deepEqual(baj, [], baj.join('\n'));
});

t('🎲 nincs statikusan eldönthetetlen nevű memória-írás', () => {
  kell();
  assert.deepEqual(L.dinamikus, [],
    'memory/-írás, aminek a fájlnevét a szkenner nem tudja megállapítani — így egyik szabály sem érné el. '
    + 'Tedd a nevet konstansba:\n' + L.dinamikus.join('\n'));
});

if (LELTAR && L) {
  console.log('\n📋 LELTÁR — memory/*.json írók');
  for (const nev of [...L.irok.keys()].sort()) {
    console.log(`  ${orszemFajl(nev) ? 'ŐRSZEM' : 'egyéb '} ${nev.padEnd(30)} `
      + `riport:${L.olvas.has(nev) ? 'olvassa' : '-------'} térkép:${L.terkepNevek.has(nev) ? 'igen' : '----'}  ← ${honnan(L, nev)}`);
  }
  if (L.dinamikus.length) console.log('  dinamikus: ' + L.dinamikus.join(' · '));
}

console.log(`\n${bukott === 0 ? '✅' : '❌'} guard-registry.test: ${pass} rendben, ${bukott} bukott`);
process.exit(bukott === 0 ? 0 : 1);
