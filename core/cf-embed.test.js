// ===================================================================
// TESZT — Cloudflare-beágyazás tiszta logikája (core/cf-embed.js). Ingyenes, hálózat nélkül.
// ===================================================================
import assert from 'assert/strict';
import { CF_DIM, CF_ELOTAG, cfVektor, terKuszob, KALIBRACIO } from './cf-embed.js';

let pass = 0, bukott = 0;
const t = (nev, fn) => {
  try { fn(); pass++; console.log('  ✅ ' + nev); }
  catch (e) { bukott++; console.log('  ❌ ' + nev + '\n     ' + String(e.message).split('\n')[0]); }
};
console.log('🧪 Cloudflare-beágyazás (EmbeddingGemma, 512 dimenzió)\n');

t('CF_DIM = 512: egyik régi tér méretével sem ütközik (Google 768, Mistral 1024)', () => {
  assert.equal(CF_DIM, 512);
  assert.ok(![768, 1024].includes(CF_DIM));
});
t('a feladat-előtag a hasonlóság-mérésé (a kalibráció ezzel készült)', () => assert.equal(CF_ELOTAG, 'task: sentence similarity | query: '));
t('cfVektor: 768 → első 512 elem, egységnyi hosszra normálva', () => {
  const nyers = Array.from({ length: 768 }, (_, i) => (i < 512 ? 2 : 100));
  const v = cfVektor(nyers);
  assert.equal(v.length, 512);
  assert.ok(Math.abs(Math.hypot(...v) - 1) < 1e-9);
  assert.ok(Math.abs(v[0] - 1 / Math.sqrt(512)) < 1e-12, 'a 512 utáni elemek nem számíthatnak bele');
});
t('cfVektor: rövid / üres / nem tömb / csupa nulla → null (a „nem tudom” nem „nem hasonló”)', () => {
  assert.equal(cfVektor(Array(100).fill(1)), null);
  assert.equal(cfVektor(null), null);
  assert.equal(cfVektor('x'), null);
  assert.equal(cfVektor(Array(768).fill(0)), null);
});
t('terKuszob: a mért pontokon pontos (Mistral 0,88 → 0,821; 0,92 → 0,888)', () => {
  assert.equal(terKuszob(0.88, 512), 0.821);
  assert.equal(terKuszob(0.92, 512), 0.888);
});
t('terKuszob: két pont között lineáris, a széleken a szélső szakasz meredekségével', () => {
  const k = terKuszob(0.89, 512);
  assert.ok(k > 0.821 && k < 0.855, String(k));
  assert.ok(terKuszob(0.96, 512) > 0.904 && terKuszob(0.96, 512) < 1);
  assert.ok(terKuszob(0.80, 512) < 0.773);
});
t('terKuszob: más dimenziónál (Google 768, Mistral 1024) VÁLTOZATLAN', () => {
  assert.equal(terKuszob(0.88, 1024), 0.88);
  assert.equal(terKuszob(0.92, 768), 0.92);
});
t('KALIBRACIO: növekvő, mindkét tengelyen szigorúan monoton', () => {
  for (let i = 1; i < KALIBRACIO.length; i++) {
    assert.ok(KALIBRACIO[i][0] > KALIBRACIO[i - 1][0] && KALIBRACIO[i][1] > KALIBRACIO[i - 1][1]);
  }
});

console.log(`\n${bukott ? '❌' : '✅'} ${pass} rendben, ${bukott} bukott`);
if (bukott) process.exit(1);
