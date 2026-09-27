// ===================================================================
// TESZT — havi link-ellenőrzés az útmutatókban (core/guide-links.js).
// Ingyenes, hálózat nélkül (hamis link-próba).
// ===================================================================
import assert from 'assert/strict';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { vanKulsoLink, linkEllenorzendok, halottLinkTorles, megerositettHalottak, LINK_KOTEG } from './guide-links.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, bukott = 0;
const vegeztek = [];
const t = (nev, fn) => {
  const p = (async () => { try { await fn(); pass++; console.log('  ✅ ' + nev); }
    catch (e) { bukott++; console.log('  ❌ ' + nev + '\n     ' + String(e.message).split('\n')[0]); } })();
  vegeztek.push(p);
};
console.log('🧪 Havi link-ellenőrzés\n');

const MOST = Date.parse('2026-09-27T12:00:00Z');
const nap = n => new Date(MOST - n * 864e5).toISOString();

t('🔑 a halott link kiesik, a SZÖVEG marad; az élő és a puszta URL érintetlen', () => {
  const md = 'Open [the ChatGPT site](https://dead.example.com/x) or [Gemini](https://gemini.google.com). Raw: https://dead.example.com/x';
  const r = halottLinkTorles(md, ['https://dead.example.com/x']);
  assert.equal(r.db, 1);
  assert.equal(r.md, 'Open the ChatGPT site or [Gemini](https://gemini.google.com). Raw: https://dead.example.com/x');
});

t('csak a külső markdown linket tartalmazó útmutató kerül sorra', () => {
  assert.ok(vanKulsoLink('see [x](https://a.example.com)'));
  assert.ok(!vanKulsoLink('see https://a.example.com and [y](/article/abc)'));
});

t('30 naponta egyszer, a legrégebben ellenőrzött elöl, legfeljebb a köteg', () => {
  const u = (file, chk) => ({ file, md: '[a](https://a.example.com)', meta: chk ? { links_checked_at: chk } : {} });
  const lista = [u('friss', nap(5)), u('regi', nap(40)), u('soha', null), ...Array.from({ length: 20 }, (_, i) => u('x' + i, nap(60)))];
  const k = linkEllenorzendok(lista, MOST);
  assert.equal(k.length, LINK_KOTEG);
  assert.ok(!k.some(x => x.file === 'friss'), 'a 5 napja ellenőrzöttet újra nézi');
  assert.equal(k[0].file, 'soha', 'nem a soha nem ellenőrzött áll elöl');
});

t('🔑 halott CSAK az, ami a robot-próbán ÉS a böngészős második véleményen is halott', async () => {
  // 09-27, élesben: az account.microsoft.com robotnak 404, böngészőnek 200 → ÉL
  const probe = async (u) => ({ status: /halott|robotnak-404/.test(u) ? 'dead' : 'ok' });
  const masodik = async (u) => (u.includes('halott') ? 'dead' : 'ok');
  const r = await megerositettHalottak(['https://halott.example.com', 'https://robotnak-404.example.com', 'https://el.example.com'], probe, masodik);
  assert.deepEqual(r, ['https://halott.example.com']);
});

t('a felújító TÉNYLEG futtatja, a fordításban is kiveszi, és jelöli az ellenőrzést', () => {
  const src = readFileSync(join(ROOT, 'agents', 'iro', 'upgrade-howtos.js'), 'utf-8');
  assert.equal((src.match(/await linkEllenorzes\(\)/g) || []).length, 2, 'nem fut le mindkét ágon');
  assert.match(src, /links_checked_at: new Date\(\)\.toISOString\(\)/);
  assert.match(src, /tr\[ny\] = halottLinkTorles\(tr\[ny\], halottak\)\.md/);
});

await Promise.all(vegeztek);
console.log(`\n${bukott ? '❌' : '✅'} ${pass} sikeres, ${bukott} bukott`);
process.exit(bukott ? 1 : 0);
