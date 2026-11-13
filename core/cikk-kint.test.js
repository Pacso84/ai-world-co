// core/cikk-kint.js — poszt csak élő cikkre (2026-11-13: FB-poszt ment ki egy 404-es cikkre)
import assert from 'assert';
import { readFileSync } from 'fs';
import { cikkKint, friss } from './cikk-kint.js';

let hiba = 0;
const t = async (nev, fn) => { try { await fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };

await t('200 → kint; 404 / 503 / hálózati hiba / rossz URL → NINCS kint', async () => {
  const valasz = st => async () => ({ status: st });
  assert.equal(await cikkKint('https://aiworldhq.com/article/x', valasz(200)), true);
  assert.equal(await cikkKint('https://aiworldhq.com/article/x', valasz(404)), false, '🔴 404-re is posztolna');
  assert.equal(await cikkKint('https://aiworldhq.com/article/x', valasz(503)), false);
  assert.equal(await cikkKint('https://aiworldhq.com/article/x', async () => { throw new Error('timeout'); }), false);
  assert.equal(await cikkKint('', valasz(200)), false);
  assert.equal(await cikkKint(undefined, valasz(200)), false);
});

await t('gyorsítótár-kerülő paraméterrel, HEAD-del kérdez', async () => {
  let kert = null, opt = null;
  await cikkKint('https://aiworldhq.com/article/x', async (u, o) => { kert = u; opt = o; return { status: 200 }; });
  assert.match(kert, /^https:\/\/aiworldhq\.com\/article\/x\?elo=\d+$/);
  assert.equal(opt.method, 'HEAD');
  assert.match(friss('https://a.b/c?x=1'), /\?x=1&elo=\d+$/);
});

await t('🔌 a FB-poszter küldés ELŐTT ellenőriz, és nem jelöli kiküldöttnek', async () => {
  const p = readFileSync(new URL('../agents/social/poster.js', import.meta.url), 'utf-8');
  const ell = p.indexOf('await cikkKint(post.url)'), kuld = p.indexOf('await fetch(hook');
  assert.ok(ell > 0, '🔴 a FB-poszter nem nézi, kint van-e a cikk');
  assert.ok(ell < kuld, '🔴 az ellenőrzés a küldés UTÁN van');
  assert.match(p.slice(ell, kuld), /continue;/, '🔴 nem kint lévő cikknél sem ugrik tovább');
});

await t('🔌 a workflow: deploy-újrapróba + a kimenetel a riportnak', async () => {
  const y = readFileSync(new URL('../.github/workflows/auto.yml', import.meta.url), 'utf-8').replace(/\r\n/g, '\n');
  assert.match(y, /id: deploy\n/, 'a deploy lépésnek nincs id-ja');
  assert.match(y, /for i in 1 2 3; do\n\s*npx --yes wrangler pages deploy/, '🔴 nincs deploy-újrapróba');
  assert.ok((y.match(/DEPLOY_OUTCOME: \$\{\{ steps\.deploy\.outcome \}\}/g) || []).length >= 2, 'a riport/poszter nem kapja meg a deploy kimenetelét');
});

if (hiba) { console.log(`\n❌ cikk-kint.test: ${hiba} hiba`); process.exit(1); }
console.log('\n✅ cikk-kint.test: minden rendben');
