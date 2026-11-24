// A hírgyűjtő relevancia-promptjának tétel-listája (2026-11-24, user: „igen javítsad!”).
// A HIBA: az agents/rss-scraper checkRelevanceBatch `it.title`-t olvasott, a jelölt viszont
// { feedConfig, item, snippet } alakú → a promptban „Title: undefined” állt (legalább 11-04 óta),
// az AI csak a kivonatot látta. Ingyenes, hálózat nélküli.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { relevanciaLista } from './relevancia-lista.js';

let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };
console.log('\n🧪 relevancia-lista (a hírgyűjtő AI-promptjának tételei)');

// A hírgyűjtő VALÓDI jelölt-alakja (agents/rss-scraper/agent.js candidates.push).
const jelolt = (title, snippet) => ({ feedConfig: { id: 'openai-blog' }, item: { title, link: 'https://example.com/' + title }, snippet });

t('📰 a cím a jelölt item.title-jéből jön — nincs „undefined”', () => {
  const s = relevanciaLista([jelolt('GPT-6 is here', 'A new model.'), jelolt('Gemini update', 'Notebook.')]);
  assert.ok(s.includes('[0] Title: GPT-6 is here'), s);
  assert.ok(s.includes('[1] Title: Gemini update'), s);
  assert.ok(!s.includes('undefined'), s);
});

t('✂️ a kivonat legfeljebb 200 karakter (mint eddig)', () => {
  const s = relevanciaLista([jelolt('A', 'x'.repeat(500))]);
  assert.ok(s.includes('Summary: ' + 'x'.repeat(200)), s);
  assert.ok(!s.includes('x'.repeat(201)), 'hosszabb kivonat ment át');
});

t('🕳️ hiányzó cím/kivonat → üres, nem „undefined”/„null”', () => {
  const s = relevanciaLista([{ feedConfig: {}, item: {}, snippet: undefined }, { item: { title: null } }]);
  assert.ok(!/undefined|null/.test(s), s);
  assert.ok(s.includes('[0] Title: '), s);
  assert.ok(s.includes('[1] Title: '), s);
});

t('🔌 bekötés: a hírgyűjtő ezt a függvényt használja, a régi it.title-es sor nincs benne', () => {
  const kod = readFileSync(new URL('../agents/rss-scraper/agent.js', import.meta.url), 'utf-8');
  assert.ok(/relevanciaLista\(batch\)/.test(kod), 'a checkRelevanceBatch nem a relevanciaLista-t hívja');
  assert.ok(!/Title: \$\{it\.title\}/.test(kod), 'a hibás `Title: ${it.title}` sor még a hírgyűjtőben van');
});

if (hiba) { console.log(`\n❌ ${hiba} hiba`); process.exit(1); }
console.log('\n✅ relevancia-lista: minden rendben');
