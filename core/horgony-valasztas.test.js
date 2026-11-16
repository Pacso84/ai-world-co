// TESZT — a súgó-horgony kiválasztási ciklusa és állapotfájlja (core/horgony-valasztas.js). Ingyenes, hálózat nélküli.
// A `keres` hamis; a tesztszövegek kitaláltak. Az állapotfájl ideiglenes mappába megy, soha nem a valódi memory/-ba.
import assert from 'assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { horgonyozottValasztas, horgonyAllapotIr } from './horgony-valasztas.js';
import { FUTAS_MAX_PROBA } from './sugo-horgony.js';

let pass = 0, hiba = 0;
const t = (n, f) => { try { f(); pass++; console.log('  ✅ ' + n); } catch (e) { hiba++; console.log('  ❌ ' + n + '\n     ' + String(e.message).split('\n')[0]); } };
const sorban = [];   // aszinkron esetek: egymás után futnak
const ta = (n, f) => sorban.push([n, f]);
console.log('🧪 súgó-horgony kiválasztás\n');

const tmp = mkdtempSync(join(tmpdir(), 'horgony-teszt-'));
const MOST = Date.parse('2026-11-14T10:00:00Z');
// Perplexity / Claude: teljes szint, van súgó-kulcs → horgonyt kér. Az üres eszköz cégfüggetlen → nem kér.
const kudarcT = { id: 'k1', title: 'How to use Perplexity Spaces', tool: 'Perplexity', company: 'Perplexity', status: 'todo' };
const fuggetlenT = { id: 'f1', title: 'How to write a good prompt', tool: '', company: '', status: 'todo' };
const sikerT = { id: 's1', title: 'How to use Claude Projects', tool: 'Claude', company: 'Anthropic', status: 'todo' };
const tovabbiT = { id: 'x1', title: 'How to use Claude Artifacts', tool: 'Claude', company: 'Anthropic', status: 'todo' };
const sikerFriss = { sugo_alapu: true, official_sources: [{ url: 'https://support.claude.com/en/articles/1-projects', title: 'Projects' }], title: 'How to use Projects in Claude' };

// hamis keres: a téma id-ja szerint válaszol, és számolja a hívásokat
function hamisKeres(valaszok) {
  const hivasok = [];
  const f = async tema => {
    hivasok.push(tema.id);
    const v = valaszok[tema.id];
    if (v instanceof Error) throw v;
    return v;
  };
  f.hivasok = hivasok;
  return f;
}
const KUDARC = { ok: false, reason: 'nincs illő súgócikk', jegyzesOk: 'nincs illő súgócikk', cost: 0.01 };
const SIKER = { ok: true, frissites: sikerFriss, reason: 'rendben', cost: 0.02 };

ta('limit 2: kudarc kimarad, cégfüggetlen bekerül, siker másolatként bekerül, a további már nem', async () => {
  const jeloltek = [kudarcT, fuggetlenT, sikerT, tovabbiT];
  const eredeti = JSON.parse(JSON.stringify(jeloltek));
  const keres = hamisKeres({ k1: KUDARC, s1: SIKER });
  const r = await horgonyozottValasztas(jeloltek, 2, { keres, most: MOST });
  assert.deepEqual(r.iras.map(x => x.id), ['f1', 's1']);
  assert.equal(r.iras[1].sugo_alapu, true);
  assert.deepEqual(r.iras[1].official_sources, sikerFriss.official_sources);
  assert.equal(r.iras[1].title, 'How to use Projects in Claude');
  assert.notEqual(r.iras[1], sikerT, 'másolat, nem az eredeti objektum');
  assert.equal(r.probak, 2);
  assert.deepEqual(keres.hivasok, ['k1', 's1']);
  assert.equal(r.jegyzesek.length, 2);
  assert.equal(r.jegyzesek[0].id, 'k1'); assert.equal(r.jegyzesek[0].horgony.ok, false);
  assert.equal(r.jegyzesek[0].horgony.ok_ok, 'nincs illő súgócikk');
  assert.equal(r.jegyzesek[0].frissites, undefined);
  assert.equal(r.jegyzesek[1].id, 's1'); assert.equal(r.jegyzesek[1].horgony.ok, true);
  assert.equal(r.jegyzesek[1].horgony.url, 'https://support.claude.com/en/articles/1-projects');
  assert.deepEqual(r.jegyzesek[1].frissites, sikerFriss);
  assert.deepEqual(jeloltek, eredeti, 'az eredeti jelöltek NEM módosultak');
});

ta('a jegyzés az `at`-ot a megadott `most`-ból veszi', async () => {
  const r = await horgonyozottValasztas([kudarcT], 1, { keres: hamisKeres({ k1: KUDARC }), most: MOST });
  assert.equal(r.jegyzesek[0].horgony.at, new Date(MOST).toISOString());
});

ta('maxProba 1: a második horgonyt kérő kimarad, a cégfüggetlen még bekerül', async () => {
  const keres = hamisKeres({ k1: KUDARC, s1: SIKER });
  const r = await horgonyozottValasztas([kudarcT, sikerT, fuggetlenT], 3, { keres, most: MOST, maxProba: 1 });
  assert.deepEqual(r.iras.map(x => x.id), ['f1']);
  assert.equal(r.probak, 1);
  assert.deepEqual(keres.hivasok, ['k1']);
  assert.equal(r.jegyzesek.length, 1);
});

ta('a már horgonyos téma (sugo_alapu + official_sources) horgony-próba nélkül bekerül', async () => {
  const horgonyos = { ...sikerT, id: 'h1', sugo_alapu: true, official_sources: sikerFriss.official_sources };
  const keres = hamisKeres({});
  const r = await horgonyozottValasztas([horgonyos], 1, { keres, most: MOST });
  assert.deepEqual(r.iras.map(x => x.id), ['h1']);
  assert.deepEqual(keres.hivasok, []);
  assert.equal(r.probak, 0); assert.deepEqual(r.jegyzesek, []);
});

ta('be:false: az első `limit` elem változatlanul, a keres nem hívódik', async () => {
  const keres = hamisKeres({ k1: SIKER });
  const jeloltek = [kudarcT, fuggetlenT, sikerT];
  const r = await horgonyozottValasztas(jeloltek, 2, { keres, most: MOST, be: false });
  assert.deepEqual(r.iras, [kudarcT, fuggetlenT]);
  assert.equal(r.iras[0], kudarcT, 'változatlanul = ugyanaz az objektum');
  assert.deepEqual(keres.hivasok, []);
  assert.equal(r.probak, 0); assert.deepEqual(r.jegyzesek, []);
});

ta('üres lista → üres eredmény', async () => {
  const r = await horgonyozottValasztas([], 2, { keres: hamisKeres({}), most: MOST });
  assert.deepEqual(r, { iras: [], jegyzesek: [], probak: 0 });
});

ta('limit 0 → nincs írás és nincs próba', async () => {
  const keres = hamisKeres({ k1: SIKER });
  const r = await horgonyozottValasztas([kudarcT], 0, { keres, most: MOST });
  assert.deepEqual(r.iras, []); assert.deepEqual(keres.hivasok, []);
});

ta('a keres dob → az a jelölt kimarad (próbának számít), a ciklus megy tovább, a jegyzés rögzített szöveg', async () => {
  const keres = hamisKeres({ k1: new Error('hálózat: titkos belső részlet'), s1: SIKER });
  const r = await horgonyozottValasztas([kudarcT, sikerT], 2, { keres, most: MOST });
  assert.deepEqual(r.iras.map(x => x.id), ['s1']);
  assert.equal(r.probak, 2);
  assert.equal(r.jegyzesek[0].atmeneti, true);   // a dobás átmeneti: nincs `horgony` jegyzés
  assert.ok(!JSON.stringify(r.jegyzesek[0]).includes('titkos'), 'a kivétel szövege nem kerül a jegyzésbe');
});

ta('átmeneti kudarc: próbának számít, a téma kimarad, de NINCS horgony-jegyzés (nincs 14 napos várakozás); a rögzített ok megvan', async () => {
  const ATMENETI = { ok: false, reason: 'szabad AI-szöveg', jegyzesOk: 'a súgó cikklistája nem jött le', atmeneti: true, cost: 0 };
  const keres = hamisKeres({ k1: ATMENETI, s1: SIKER });
  const r = await horgonyozottValasztas([kudarcT, sikerT], 2, { keres, most: MOST });
  assert.deepEqual(r.iras.map(x => x.id), ['s1']);
  assert.equal(r.probak, 2, 'a próba megszámolódik');
  assert.equal(r.jegyzesek.length, 2);
  assert.equal(r.jegyzesek[0].id, 'k1');
  assert.equal(r.jegyzesek[0].horgony, undefined, 'nincs ok:false jegyzés');
  assert.equal(r.jegyzesek[0].atmeneti, true);
  assert.equal(r.jegyzesek[0].ok_ok, 'a súgó cikklistája nem jött le');
  assert.ok(!JSON.stringify(r.jegyzesek[0]).includes('szabad AI-szöveg'));
  // az állapotfájlba bekerül a rögzített magyar okkal
  const fajl = join(tmp, 'atmeneti.json');
  horgonyAllapotIr(r, { fajl, most: MOST });
  const j = JSON.parse(readFileSync(fajl, 'utf-8'));
  assert.equal(j.sikeres, 1);
  assert.deepEqual(j.sikertelen, [{ cim: 'How to use Perplexity Spaces', eszkoz: 'Perplexity', ok: 'a súgó cikklistája nem jött le', atmeneti: true }]);
});

ta('a keres dobása is átmeneti: nincs jegyzés', async () => {
  const r = await horgonyozottValasztas([kudarcT], 1, { keres: hamisKeres({ k1: new Error('x') }), most: MOST });
  assert.equal(r.jegyzesek[0].horgony, undefined); assert.equal(r.jegyzesek[0].atmeneti, true); assert.equal(r.jegyzesek[0].ok_ok, 'hiba');
});

ta('a téma-kudarc (nem átmeneti) továbbra is jegyzést kap a 14 napos várakozáshoz', async () => {
  const r = await horgonyozottValasztas([kudarcT], 1, { keres: hamisKeres({ k1: { ...KUDARC, jegyzesOk: 'a cikkből nem írható útmutató' } }), most: MOST });
  assert.equal(r.jegyzesek[0].horgony.ok, false); assert.equal(r.jegyzesek[0].horgony.ok_ok, 'a cikkből nem írható útmutató');
  assert.equal(r.jegyzesek[0].atmeneti, undefined);
});

ta('alapértelmezett keret: FUTAS_MAX_PROBA próba után a további horgonyt kérő jelölt kimarad', async () => {
  const sok = Array.from({ length: FUTAS_MAX_PROBA + 3 }, (_, i) => ({ ...kudarcT, id: 'm' + i }));
  const keres = hamisKeres(Object.fromEntries(sok.map(x => [x.id, KUDARC])));
  const r = await horgonyozottValasztas(sok, 2, { keres, most: MOST });   // maxProba és be: az alapértelmezett
  assert.equal(r.probak, FUTAS_MAX_PROBA);
  assert.equal(r.iras.length, 0);
});

// ---- horgonyAllapotIr ----

t('horgonyAllapotIr: összegzés a fájlba, súgószöveg és AI-indok nélkül', () => {
  const fajl = join(tmp, 'horgony-allapot.json');
  const titkos = 'SECRET-AI-REASON the article says to click the blue gear icon';
  horgonyAllapotIr({
    probak: 2,
    jegyzesek: [
      { id: 'k1', cim: 'How to use Perplexity Spaces', eszkoz: 'Perplexity', horgony: { at: 'x', ok: false, ok_ok: 'nincs illő súgócikk' }, reason: titkos, jegyzesOk: titkos },
      { id: 's1', cim: 'How to use Claude Projects', eszkoz: 'Claude', horgony: { at: 'x', ok: true, url: 'https://support.claude.com/en/articles/1-projects' }, frissites: sikerFriss, reason: titkos }
    ]
  }, { fajl, most: MOST });
  assert.ok(existsSync(fajl));
  const szoveg = readFileSync(fajl, 'utf-8');
  assert.ok(!szoveg.includes('SECRET'), 'az AI szabad szövege nem kerülhet a (nyilvános) fájlba');
  assert.ok(!szoveg.includes('blue gear'));
  const j = JSON.parse(szoveg);
  assert.equal(j.at, new Date(MOST).toISOString());
  assert.equal(j.probak, 2); assert.equal(j.sikeres, 1);
  assert.deepEqual(j.sikertelen, [{ cim: 'How to use Perplexity Spaces', eszkoz: 'Perplexity', ok: 'nincs illő súgócikk' }]);
});

t('horgonyAllapotIr: üres/hibás bemenetre és írhatatlan útvonalra sem dob', () => {
  horgonyAllapotIr(undefined, { fajl: join(tmp, 'a.json'), most: MOST });
  horgonyAllapotIr(null, { fajl: join(tmp, 'b.json'), most: MOST });
  const j = JSON.parse(readFileSync(join(tmp, 'a.json'), 'utf-8'));
  assert.deepEqual({ probak: j.probak, sikeres: j.sikeres, sikertelen: j.sikertelen }, { probak: 0, sikeres: 0, sikertelen: [] });
  horgonyAllapotIr({ probak: 1, jegyzesek: [] }, { fajl: join(tmp, 'a.json', 'nem-lehet', 'x.json'), most: MOST });   // fájl alá próbál írni → nem dob
});

for (const [n, f] of sorban) {
  try { await f(); pass++; console.log('  ✅ ' + n); } catch (e) { hiba++; console.log('  ❌ ' + n + '\n     ' + String(e.message).split('\n')[0]); }
}
try { rmSync(tmp, { recursive: true, force: true }); } catch { /* a takarítás nem fontos */ }
console.log(`\n${pass} sikeres, ${hiba} hibás`);
if (hiba) process.exit(1);
