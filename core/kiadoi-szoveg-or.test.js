// ===================================================================
// TESZT — KIADÓI SZÖVEG NEM KERÜL A NYILVÁNOS GITBE (2026-11-02, user: „a kiadók szövegét ne tartalmazza”)
// Ingyenes, hálózat nélküli.
// MIÉRT: a hírgyűjtő (agents/rss-scraper) a vázlatba (content/drafts/*.json — a repó NYILVÁNOS) írta a hírfolyam
// TELJES szövegét (`content_full`; 11-02-én 7 vázlatban, a leghosszabb 28 ezer karakter: Microsoft Research). Most
// a teljes szöveg a git-en kívüli tárba megy (core/forras-cache.js hirfolyamSzovegIr), a vázlatba csak a hossza.
// Ez a teszt őrzi: (a) a követett vázlatokban nincs teljes szöveg, a kivonat ≤ 1500 karakter; (b) a hírgyűjtő
// nem írja vissza; (c) a tár git-en kívül van; (d) az író a tárból is megkapja (különben a hírek gyengülnének).
// ===================================================================
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import {
  HIRFOLYAM_CACHE_DIR, FORRAS_CACHE_DIR, KIVONAT_CACHE_DIR, hirfolyamSzovegIr, hirfolyamSzovegOlvas,
  vazlatKivonatIr, vazlatKivonat, cikkKivonatIr, cikkKivonat
} from './forras-cache.js';
import { vazlatForras } from './iro-forras.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, bukott = 0;
const t = async (nev, fn) => {
  try { await fn(); pass++; console.log('  ✅ ' + nev); }
  catch (e) { bukott++; console.log('  ❌ ' + nev + '\n     ' + String(e && e.message).split('\n').slice(0, 20).join('\n     ')); }
};
console.log('🧪 Kiadói szöveg-őr\n');

const KIVONAT_MAX = 1500;

await t('(a) a vázlatokban és az elutasított vázlatokban nincs teljes kiadói szöveg, a kivonat ≤ 1500 karakter', () => {
  const hibak = [];
  for (const sub of ['content/drafts', 'content/rejected']) {
    const dir = join(ROOT, sub);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter(x => x.endsWith('.json'))) {
      let d; try { d = JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch { continue; }
      if (d && d.content_full) hibak.push(`${sub}/${f}: content_full (${String(d.content_full).length} kar.)`);
      if (typeof d?.content_snippet === 'string' && d.content_snippet.length > KIVONAT_MAX) hibak.push(`${sub}/${f}: content_snippet ${d.content_snippet.length} kar.`);
    }
  }
  assert.equal(hibak.length, 0, hibak.join('\n'));
});

await t('(b) a hírgyűjtő a teljes szöveget a git-en kívüli tárba írja, nem a vázlatba', () => {
  const src = readFileSync(join(ROOT, 'agents', 'rss-scraper', 'agent.js'), 'utf8');
  assert.doesNotMatch(src, /^\s*content_full\s*:/m, 'a vázlat-objektumban nem lehet content_full mező');
  assert.match(src, /hirfolyamSzovegIr\(item\.link, teljesSzoveg\)/);
  // 🔒 11-03: a kivonat is a privát tárba megy, a vázlatba csak a hossza.
  assert.doesNotMatch(src, /^\s*content_snippet\s*:/m, 'a vázlat-objektumban nem lehet content_snippet mező (privát tár)');
  assert.match(src, /vazlatKivonatIr\(item\.link, kivonat\)/);
  assert.match(src, /content_snippet_len: kivonat\.length,/);
  assert.match(src, /const KIVONAT_MAX = 1500;/);
});

await t('(c) a tár git-en kívül van (_forrasok/ a .gitignore-ban — a CI-ban a privát repó)', () => {
  for (const d of [HIRFOLYAM_CACHE_DIR, FORRAS_CACHE_DIR, KIVONAT_CACHE_DIR]) {
    assert.match(relative(ROOT, d).replace(/\\/g, '/'), /^_forrasok\/[a-z]+$/);
  }
  assert.match(readFileSync(join(ROOT, '.gitignore'), 'utf8'), /^_forrasok\/\s*$/m);
});

// ── 🔒 JOGTISZTA FORRÁSOK (2026-11-03) — a kivonat (≤1500 / ≤3000 kar. kiadói összefoglaló) SEM nyilvános ──
await t('(e) a nyilvános gitben követett fájlokban nincs kiadói kivonat (source_snippet / content_snippet) sem', () => {
  let kovetett = [];
  try { kovetett = execFileSync('git', ['ls-files', '-z', '--', 'content', 'logs', 'memory', 'agents'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\0').filter(f => f.endsWith('.json')); }
  catch { return; }   // nincs git (pl. kicsomagolt másolat): ezt az ágat a CI futtatja
  const hibak = [];
  for (const f of kovetett) {
    let szoveg; try { szoveg = readFileSync(join(ROOT, f), 'utf8'); } catch { continue; }
    if (/"(source_snippet|content_snippet|content_full)"\s*:\s*"[^"]/.test(szoveg)) hibak.push(f);
  }
  assert.equal(hibak.length, 0, `${hibak.length} követett fájlban kiadói szöveg: ` + hibak.slice(0, 8).join(', '));
  assert.ok(kovetett.length > 50, 'gyanúsan kevés követett JSON — rossz a git ls-files?');
});

await t('(f) a kivonat a tárból is visszajön (vázlat + cikk); a régi mező elsőbbséget kap', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aiworld-kivonat-'));
  try {
    const link = 'https://openai.com/index/valami/';
    assert.equal(vazlatKivonatIr(link, 'OpenAI announced X.', { dir }), true);
    assert.equal(vazlatKivonat({ link: link + '?utm=1' }, { dir }), 'OpenAI announced X.');
    assert.equal(vazlatKivonat({ link, content_snippet: 'régi' }, { dir }), 'régi');
    // egyhírű cikk: ugyanaz a kulcs, ugyanaz a fájl
    assert.equal(cikkKivonat({ source_link: link }, { dir }), 'OpenAI announced X.');
    const meta = { source_link: link, source_links: [link, 'https://openai.com/index/masik'] };
    assert.equal(cikkKivonat(meta, { dir }), '', 'összevont cikk kulcsa más');
    assert.equal(cikkKivonatIr(meta, 'A\n\n---\n\nB', { dir }), true);
    assert.equal(cikkKivonat(meta, { dir }), 'A\n\n---\n\nB');
    assert.equal(cikkKivonat({ ...meta, source_snippet: 'régi' }, { dir }), 'régi');
    // nincs tár → üres, kivétel nélkül
    assert.equal(cikkKivonat({ source_link: link }, { dir: join(dir, 'nincs') }), '');
    assert.equal(cikkKivonat(null, { dir }), '');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

await t('(g) a CI a futás elején letölti a privát tárat (hibatűrően), a végén visszatolja', () => {
  const yml = readFileSync(join(ROOT, '.github', 'workflows', 'auto.yml'), 'utf8');
  const le = yml.indexOf('repository: Pacso84/ai-world-co-forrasok');
  assert.ok(le > 0, 'nincs privát tár-letöltés');
  const lepes = yml.slice(yml.lastIndexOf('- name:', le), le + 200);
  assert.match(lepes, /id: forrastar/);
  assert.match(lepes, /continue-on-error: true/);
  assert.match(lepes, /path: _forrasok/);
  assert.match(lepes, /ssh-key: \$\{\{ secrets\.FORRAS_TAR_SSH_KEY \}\}/);
  assert.ok(le < yml.indexOf('- name: Pipeline'), 'a tár-letöltésnek a Pipeline előtt kell lennie');
  const ment = yml.indexOf('- name: Forrás-tár mentése');
  assert.ok(ment > yml.indexOf('- name: Generált tartalom megőrzése'), 'a mentés a futás végén legyen');
  assert.match(yml.slice(ment, ment + 400), /if: always\(\) && steps\.forrastar\.outcome == 'success'/);
});

await t('(d) az író a tárból kapja a hírfolyam teljes szövegét (vázlatban már nincs), és nem tölt le', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'aiworld-hirfolyam-'));
  const elozo = process.env.HIRFOLYAM_CACHE_DIR;
  process.env.HIRFOLYAM_CACHE_DIR = dir;
  try {
    const link = 'https://blogs.nvidia.com/blog/x/';
    const teljes = '<p>' + 'NVIDIA announced a new research tool for scientists. '.repeat(40) + '</p>';
    assert.equal(hirfolyamSzovegIr(link, teljes), true);
    assert.equal(hirfolyamSzovegOlvas('  ' + link + '?utm=1 '), teljes, 'a link-kulcs a levágott / query nélküli alakra is ugyanaz');
    let letoltve = 0;
    const r = await vazlatForras({ title: 'x', link, content_snippet: 'rövid' }, { letolto: async () => { letoltve++; return { ok: false }; } });
    assert.equal(r.via, 'hirfolyam');
    assert.match(r.text, /NVIDIA announced a new research tool/);
    assert.equal(letoltve, 0);
    // nincs a tárban (későbbi futás, tiszta gép) → a hivatalos oldal letöltése jön
    const r2 = await vazlatForras({ title: 'y', link: 'https://blogs.nvidia.com/blog/masik/', content_snippet: 'rövid' }, { letolto: async () => { letoltve++; return { ok: false }; } });
    assert.equal(letoltve, 1);
    assert.equal(r2.via, 'kivonat');
  } finally {
    if (elozo === undefined) delete process.env.HIRFOLYAM_CACHE_DIR; else process.env.HIRFOLYAM_CACHE_DIR = elozo;
    rmSync(dir, { recursive: true, force: true });
  }
});

console.log(`\n${bukott ? '❌' : '✅'} ${pass} rendben, ${bukott} hibás`);
if (bukott) process.exit(1);
