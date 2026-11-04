// ===================================================================
// TESZT — a forrásszöveg git-en KÍVÜLI gyorsítótára (core/forras-cache.js)
// ===================================================================
// INGYENES, hálózat nélküli; ideiglenes mappába ír. Fut: node core/run-tests.js
//
// MIÉRT VAN (2026-11-01): a híríró a hivatalos forrás teljes szövegéből ír, és a bíró ugyanazt kapja.
// A szöveg NEM kerülhet a content/ alá (a repó NYILVÁNOS — szerzői jogi kockázat), ezért az
// agents/iro/cache/forras/ mappába megy. Ha a mappa egyszer kikerülne a .gitignore-ból, vagy a kulcs
// elcsúszna az író és a bíró között, a bíró csendben a rövid kivonatra esne vissza — kívülről nem látszana.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync, mkdtempSync, rmSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { FORRAS_CACHE_DIR, forrasKulcs, forrasCacheIr, forrasCacheOlvas, cikkForrasSzovege } from './forras-cache.js';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
let pass = 0, bukott = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log('  ✅ ' + name); }
  catch (e) { bukott++; console.log('  ❌ ' + name + '\n     ' + String(e.message).split('\n')[0]); }
};
const dir = mkdtempSync(join(tmpdir(), 'forras-cache-'));

// 🔒 2026-11-03 (JOGTISZTA FORRÁSOK): az alapmappa a PRIVÁT FORRÁS-TÁR (_forrasok/forras) — a CI-ban a privát repó.
t('🔒 az alapmappa a _forrasok/ privát tár alatt van, és a .gitignore kizárja (_forrasok/)', () => {
  assert.equal(relative(ROOT, FORRAS_CACHE_DIR).replace(/\\/g, '/'), '_forrasok/forras');
  const sorok = readFileSync(join(ROOT, '.gitignore'), 'utf-8').split(/\r?\n/).map(s => s.trim());
  assert.ok(sorok.includes('_forrasok/'), 'a .gitignore-ból kikerült a _forrasok/ — a forrásszöveg a nyilvános gitbe menne');
});

t('kulcs: 16 hexa; levágott / http-s / záró perjeles link ugyanazt adja', () => {
  const k = forrasKulcs(['https://openai.com/index/x']);
  assert.match(k, /^[0-9a-f]{16}$/);
  assert.equal(forrasKulcs(['  https://openai.com/index/x ']), k);
  assert.equal(forrasKulcs('https://openai.com/index/x'), k);
  assert.equal(forrasKulcs(['http://openai.com/index/x/']), k);
});

t('kulcs: a sorrend és a további forrás számít; link nélkül null', () => {
  const a = 'https://openai.com/index/a', b = 'https://openai.com/index/b';
  assert.notEqual(forrasKulcs([a, b]), forrasKulcs([b, a]));
  assert.notEqual(forrasKulcs([a, b]), forrasKulcs([a]));
  assert.equal(forrasKulcs([]), null);
  assert.equal(forrasKulcs(['', null]), null);
});

t('írás → olvasás ugyanazzal a kulccsal', () => {
  const k = forrasKulcs(['https://openai.com/index/x']);
  assert.equal(forrasCacheIr(k, 'teljes forrásszöveg', { dir }), true);
  assert.equal(forrasCacheOlvas(k, { dir }), 'teljes forrásszöveg');
});

t('🛡️ rossz kulcs (pl. „../" a JSON-ból) nem ír és nem olvas; üres szöveget nem ír', () => {
  assert.equal(forrasCacheIr('../../content/x', 'szöveg', { dir }), false);
  assert.equal(forrasCacheIr('ABCDEF0123456789', 'szöveg', { dir }), false);
  assert.equal(forrasCacheOlvas('../../package', { dir }), '');
  assert.equal(forrasCacheIr(forrasKulcs(['https://x.com/ures']), '   ', { dir }), false);
  assert.ok(readdirSync(dir).every(f => /^[0-9a-f]{16}\.txt$/.test(f)));
});

t('hiányzó fájl / nem létező mappa → üres szöveg, kivétel nélkül', () => {
  assert.equal(forrasCacheOlvas(forrasKulcs(['https://openai.com/index/nincs']), { dir }), '');
  assert.equal(forrasCacheOlvas(forrasKulcs(['https://openai.com/index/x']), { dir: join(dir, 'nincs-ilyen') }), '');
});

t('cikkForrasSzovege: tárolt kulccsal, kulcs nélkül a linkekből; összevont cikknél a source_links számít', () => {
  const a = 'https://openai.com/index/a', b = 'https://openai.com/index/b';
  forrasCacheIr(forrasKulcs([a, b]), 'két hír szövege', { dir });
  assert.equal(cikkForrasSzovege({ source_text_key: forrasKulcs([a, b]) }, { dir }), 'két hír szövege');
  assert.equal(cikkForrasSzovege({ source_link: a, source_links: [a, b] }, { dir }), 'két hír szövege');
  assert.equal(cikkForrasSzovege({ source_link: 'https://openai.com/index/x' }, { dir }), 'teljes forrásszöveg');
  assert.equal(cikkForrasSzovege({ source_link: 'https://openai.com/index/nincs' }, { dir }), '');
  assert.equal(cikkForrasSzovege(null, { dir }), '');
  assert.equal(cikkForrasSzovege({ source_text_key: '../x' }, { dir }), '');
});

rmSync(dir, { recursive: true, force: true });
console.log(`\n${bukott === 0 ? '✅' : '❌'} forras-cache.test: ${pass} rendben, ${bukott} bukott`);
process.exit(bukott === 0 ? 0 : 1);
