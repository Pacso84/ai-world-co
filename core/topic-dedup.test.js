// ===================================================================
// KÖZELI-TÉMA-ŐR TESZT — futtatás: node core/topic-dedup.test.js
// Offline: injektált ál-embedText (nincs hálózat/AI). $0.
// ===================================================================
import { strict as assert } from 'assert';
import { tmpdir } from 'os';
import { join as pjoin } from "path";
import { fileURLToPath } from "url";
import { existsSync, rmSync, readFileSync as rfs } from 'fs';

// ===================================================================
// 🔒 A TESZT NEM ÍRHAT AZ ÉLES BEÁGYAZÁS-CACHE-BE (2026-09-06)
// ===================================================================
// A lenti ál-embedFn 8 DIMENZIÓS vektorokat ad. Ezek eddig a valódi
// `guides/topic-embeddings.json`-be íródtak (mérve: 2 ilyen bejegyzés volt
// benne). Önmagában ártalmatlan — a dimenzió-őr tévesztésnek veszi és
// újraszámolja —, de 2026-09-06 óta a CI is futtatja a teszteket, tehát a
// szemét mostantól MINDEN futásnál keletkezne.
//
// ⚠️ AZ ÉRTÉKADÁS AZ IMPORT ELŐTT KELL. A statikus `import` felülemelkedik a
// kódon, tehát a modul a régi úttal töltődne be — ezért DINAMIKUS az import
// alább. (Ez a csapda egyszer már megfogott egy másik teszten.)
// ⚠️ `fileURLToPath`, NEM `.pathname`: Windowson az utóbbi „/C:/AI%20work/…"-et
// ad (vezető perjel + URL-kódolt szóköz), amitől az `existsSync` némán hamisat
// mond — és a záró őr úgy hallgatna, mintha minden rendben lenne.
const ELES_CACHE = fileURLToPath(new URL('../guides/topic-embeddings.json', import.meta.url));
const ELES_ELOTTE = existsSync(ELES_CACHE) ? rfs(ELES_CACHE, 'utf-8') : null;
process.env.TOPIC_EMBED_CACHE_PATH = pjoin(tmpdir(), 'topic-embed-teszt-' + process.pid + '.json');

// Ugyanez a napló-fájlra (2026-09-06): a `logDedup` az ÉLES
// `memory/topic-dedup-log.json`-ba írna, ami a CI-ban git-ütközést készítene elő.
const ELES_LOG = fileURLToPath(new URL('../memory/topic-dedup-log.json', import.meta.url));
const ELES_LOG_ELOTTE = existsSync(ELES_LOG) ? rfs(ELES_LOG, 'utf-8') : null;
process.env.TOPIC_DEDUP_LOG_PATH = pjoin(tmpdir(), 'topic-dedup-log-teszt-' + process.pid + '.json');

const { isNearDuplicateTitle, normTitle, dedupBejegyzes, logDedup } = await import('./topic-dedup.js');

// Ál-embedFn: determinisztikus "jelentés-vektor" néhány kulcsszóra.
// A "meeting/notes/action" témák EGY irányba mutatnak → magas koszinusz.
const fakeEmbed = async (title) => {
  const t = title.toLowerCase();
  const dims = ['meeting', 'notes', 'action', 'email', 'photo', 'budget', 'recipe'];
  const v = dims.map(d => (t.includes(d) ? 1 : 0));
  // kis alapzaj, hogy a normálás ne osszon nullával
  v.push(0.01);
  return v;
};

const EXISTING = [
  'How to Turn Your Meeting Notes into Action Plans with AI',
  'Write a Polite Complaint Email with ChatGPT',
  'Clean Up Blurry Photos with Apple Intelligence'
];

// 1) JELENTÉSBEN KÖZELI (más szavak, ugyanaz a téma) → duplikátum
const d1 = await isNearDuplicateTitle('How to Turn Meeting Notes into Clear Action Plans', EXISTING, { embedFn: fakeEmbed });
assert.equal(d1.duplicate, true, 'közeli meeting-notes téma = duplikátum');
assert.ok(d1.closest.title.includes('Meeting Notes'), 'a legközelebbi a meeting-notes téma');

// 2) KÜLÖNBÖZŐ téma → NEM duplikátum
const d2 = await isNearDuplicateTitle('How to Plan a Weekly Budget with AI', EXISTING, { embedFn: fakeEmbed });
assert.equal(d2.duplicate, false, 'budget-téma nem duplikátum');

// 3) SZÓ SZERINT azonos (normalizálva) → duplikátum, embedding nélkül is
const d3 = await isNearDuplicateTitle('write a polite complaint email with chatgpt', EXISTING, { embedFn: null });
assert.equal(d3.duplicate, true, 'normalizálva azonos cím = duplikátum (exact)');
assert.equal(d3.closest.by, 'exact', 'exact ágon fogja');

// 4) EMBEDDING NÉLKÜL, Jaccard-tartalék: sok közös szó → duplikátum
const d4 = await isNearDuplicateTitle('Turn Your Meeting Notes into Action Plans', EXISTING, { embedFn: null });
assert.equal(d4.duplicate, true, 'Jaccard-tartalék fogja a majdnem-azonost');
assert.equal(d4.closest.by, 'jaccard', 'jaccard ágon');

// 5) ÜRES meglévő-lista → sosem duplikátum
const d5 = await isNearDuplicateTitle('Anything at all', [], { embedFn: fakeEmbed });
assert.equal(d5.duplicate, false, 'üres referencia = nincs duplikátum');

// 6) normTitle helyes
assert.equal(normTitle('How to  DO-it!! Now'), 'how to do it now', 'normTitle összevon és tisztít');

// --- 7. LEVETT TÉMA őr (SkillOpt-zombi tanulsága): id- ÉS cím-egyezésre fog ---
// ⚠️ EZ AZ IMPORT IS DINAMIKUS, ÉS EZ NEM ÍZLÉS KÉRDÉSE (2026-09-06).
// Statikusan írva a saját fenti figyelmeztetésünkbe futottunk bele: a statikus
// `import` FELÜLEMELKEDIK a fájl törzsén, tehát a `topic-dedup.js` már a
// 33. sori értékadás ELŐTT betöltődött volna — az ÉLES úttal. A 2026-09-06-i
// javítás így NEM MŰKÖDÖTT: a `guides/topic-embeddings.json`-ban ma is ott a
// két 8 dimenziós ál-vektor, amit ez a teszt tett bele
// („how to turn meeting notes into clear action plans" = [1,1,1,0,0,0,0,0.01]).
// A záró bájt-őr azért hallgatott, mert a teszt UGYANAZT írta vissza, ami már
// bent volt — a kár már megtörtént, tehát „nem változott".
// 🔑 Az őrszem, ami a saját kárát MÁR BEÁGYAZVA találja, némának látszik.
const { isRemovedTopic } = await import('./topic-dedup.js');
const { readFileSync: rf2 } = await import('fs');
const topicsNow = JSON.parse(rf2('guides/guide-topics.json', 'utf-8'));
const removedNow = (topicsNow.topics || []).find(x => x.status === 'removed');
if (removedNow) {
  assert.equal(isRemovedTopic({ guide_topic_id: removedNow.id }, ''), true, 'levett téma id-ról felismerve');
  assert.equal(isRemovedTopic({}, removedNow.title), true, 'levett téma címről felismerve');
}
assert.equal(isRemovedTopic({ guide_topic_id: 'no-such-topic-xyz' }, 'Totally Fresh Topic'), false, 'élő téma nem jelez');

// ===================================================================
// 8–11. A NAPLÓ MONDJA MEG, MIVEL DÖNTÖTT (2026-09-06)
// ===================================================================
// A projekt egyik legdrágább leckéje: „a beágyazás HÓNAPOKIG halott volt, az
// őr némán Jaccardra váltott — 15 ismétlésből 1-et fogott, és ZÖLDNEK látszott."
// Az `isNearDuplicateTitle` KISZÁMOLJA, melyik módszer döntött (`closest.by`),
// és hány gyanús maradt beágyazatlan (`unresolved`) — a három hívóhely mégis
// ELDOBTA mindkettőt. Egy korábbi vizsgálatnak ezért 37 döntést kellett
// VISSZASZÁMOLNIA, hogy kiderüljön: működött-e egyáltalán a beágyazás.
// A `by` mező ingyen van, és KÖZVETLEN bizonyíték.

// --- 8. a döntés MÓDJA kimegy — végig a valódi úton (nem kézzel gyártott alak)
const nearEmbed = await isNearDuplicateTitle(
  'How to Turn Meeting Notes into Clear Action Plans', EXISTING, { embedFn: fakeEmbed });
const be = dedupBejegyzes('guide-ideas', 'How to Turn Meeting Notes into Clear Action Plans', nearEmbed);
assert.equal(be.by, 'embedding', 'a beágyazásos döntés nem látszik a naplóban: ' + JSON.stringify(be));
assert.equal(be.source, 'guide-ideas');
assert.ok(be.closest.includes('Meeting Notes'), 'a legközelebbi cím elveszett');
assert.equal(typeof be.score, 'number');
assert.equal(be.unresolved, 0, 'a beágyazott ágon a 0 is adat — hiányzik');

// --- 9. a VESZÉLYES eset: beágyazás nélküli, Jaccardra visszaesett döntés
const nearJac = await isNearDuplicateTitle(
  'Turn Your Meeting Notes into Action Plans', EXISTING, { embedFn: null });
const beJac = dedupBejegyzes('pairing', 'Turn Your Meeting Notes into Action Plans', nearJac);
assert.equal(beJac.by, 'jaccard', '🔴 a Jaccard-tartalékos döntés ugyanúgy néz ki, mint a beágyazásos');
assert.equal('unresolved' in beJac, false, 'a Jaccard-ágon nem volt beágyazás — a 0 ott hazugság volna');

// --- 9b. a `by` MINDIG kimegy, akkor is, ha nem tudjuk (a hiány ne látsszon egészségnek)
assert.equal(dedupBejegyzes('guide-balance', 'x', null).by, null, 'ismeretlen döntésnél a `by` kulcs eltűnt');

// --- 10. A VALÓDI NAPLÓ ALAKJA (a projekt leckéje: a kézzel gyártott minta
//         az ALAKOT ellenőrzi, nem a valóságot). Minden mező, ami ma élesben
//         a naplóban van, az új bejegyzésben is legyen meg.
if (ELES_LOG_ELOTTE) {
  const elesNaplo = JSON.parse(ELES_LOG_ELOTTE);
  const valodiak = Object.values(elesNaplo).flat();
  assert.ok(valodiak.length > 0, 'az éles napló üres — nincs mihez mérni az alakot');
  const valodiKulcsok = new Set(valodiak.flatMap(e => Object.keys(e)));
  valodiKulcsok.delete('at');                       // azt a logDedup teszi hozzá
  for (const k of valodiKulcsok) {
    assert.ok(k in be, `🔴 az ÉLES naplóban van "${k}" mező, az új bejegyzésből hiányzik`);
  }
  // 🔔 EZ A SOR IDŐZÍTETT JELZÉS VOLT, ÉS 2026-09-11-ÉN ELSÜLT.
  // Amíg a `by` mező nem volt kint élesben, a fenti alak-hurok nem tudta
  // ellenőrizni, ezért itt egy `!valodiKulcsok.has('by')` őr állt, ami
  // SZÓLT, amikor a mező megérkezik. Megérkezett: aznap 11 bejegyzés,
  // mind `by:"embedding"`. A helyére POZITÍV, erősebb állítás kerül —
  // ha egy jövőbeli változtatás visszavenné a mezőt, az ITT bukjon el,
  // ne élesben, némán. (A beágyazás ÉLETBEN létét nem itt őrizzük:
  // az a memory/embed-guard.json és a napi riport dolga.)
  assert.ok(valodiKulcsok.has('by'),
    '🔴 a `by` mező ELTŰNT az éles naplóból — a dedup-döntés indoka megint láthatatlan');
  const elesBy = new Set(valodiak.map(e => e.by).filter(Boolean));
  for (const b of elesBy) assert.ok(['embedding', 'jaccard'].includes(b),
    '🔴 ismeretlen `by` érték az éles naplóban: ' + b);
}

// --- 11. VÉGIG A LEMEZIG: a `by` tényleg beleíródik a napló-fájlba
logDedup(be);
const irt = JSON.parse(rfs(process.env.TOPIC_DEDUP_LOG_PATH, 'utf-8'));
const napok = Object.keys(irt);
assert.equal(napok.length, 1, 'a napló nem nap-kulcsos maradt: ' + JSON.stringify(napok));
const sor = irt[napok[0]][0];
assert.ok(sor.at, 'a `logDedup` időbélyege elveszett');
assert.equal(sor.by, 'embedding', '🔴 a `by` nem jutott el a lemezig: ' + JSON.stringify(sor));
assert.equal(sor.source, 'guide-ideas');

// --- 12. 🔌 BEKÖTÉS-ŐR: mind a HÁROM hívóhely a közös alakot használja
// Az `agents/` alatti fájlokat FUTTATNI/IMPORTÁLNI TILOS (pénzt költenek és
// publikálnak), ezért forrásszinten nézzük meg. A mező hiába megy ki a
// `core`-ból, ha a hívó megint kézzel gyártja a bejegyzést — pontosan ez volt
// az eredeti hiba: a `by` KISZÁMOLÓDOTT, csak épp mindhárom hívó eldobta.
const HIVOK = ['../agents/guide/agent.js', '../agents/pairing/agent.js'];
let hivasok = 0;
for (const rel of HIVOK) {
  const src = rfs(fileURLToPath(new URL(rel, import.meta.url)), 'utf-8');
  for (const m of src.matchAll(/logDedup\(([^\n]*)/g)) {
    hivasok++;
    assert.match(m[1], /^dedupBejegyzes\(/,
      `🔴 ${rel}: a logDedup megint kézzel gyártott bejegyzést kap — a \`by\` elveszik: ${m[1].slice(0, 70)}`);
  }
  assert.match(src, /dedupBejegyzes[^\n]*from|dedupBejegyzes\s*}\s*=|dedupBejegyzes,/,
    `🔴 ${rel}: nem importálja a dedupBejegyzes-t`);
}
assert.equal(hivasok, 3, `3 naplózó hívóhelyet vártunk, ${hivasok} van — nézd át az újat is`);

console.log('✅ topic-dedup.test: mind a 12 blokk átment');

// 🔒 ZÁRÓ ŐR: az éles cache bájtra változatlan maradt-e?
if (ELES_ELOTTE !== null) {
  const most = existsSync(ELES_CACHE) ? rfs(ELES_CACHE, 'utf-8') : null;
  assert.equal(most, ELES_ELOTTE, '🔴 A TESZT BELEÍRT AZ ÉLES BEÁGYAZÁS-CACHE-BE!');
  console.log('  ✅ az éles topic-embeddings.json érintetlen');
}
if (ELES_LOG_ELOTTE !== null) {
  const most = existsSync(ELES_LOG) ? rfs(ELES_LOG, 'utf-8') : null;
  assert.equal(most, ELES_LOG_ELOTTE, '🔴 A TESZT BELEÍRT AZ ÉLES DEDUP-NAPLÓBA!');
  console.log('  ✅ az éles topic-dedup-log.json érintetlen');
}
try { rmSync(process.env.TOPIC_EMBED_CACHE_PATH, { force: true }); } catch { /* */ }
try { rmSync(process.env.TOPIC_DEDUP_LOG_PATH, { force: true }); } catch { /* */ }
