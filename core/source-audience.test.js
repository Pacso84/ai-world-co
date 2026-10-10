// core/source-audience.js — forrás-közönség-kapu (2026-10-10). Hálózat nélkül.
// Kalibráció (10-10, élő feedeken): a 31 bekapcsolt RSS-forrásunk MIND átment,
// a HubSpot-marketingblog (b2b 78%) kiesett — a minták alább ezekből valók.
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { kozonsegKapu, kozonsegArany, atiranyitas, KUSZOB } from './source-audience.js';

let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };
console.log('\n🧪 source-audience');
const tetel = l => l.map(title => ({ title }));

const HUBSPOT = tetel([
  'AEO for digital PR: How to build earned media presence that shows up in AI results',
  'AEO for marketing agencies: How to deliver measurable AI visibility results for every client',
  'Enterprise AEO: How to manage brand visibility at scale across products, segments, and markets',
  'AEO for marketing operations: How to build scalable processes that connect AEO to revenue',
  'AEO for demand generation teams: How to generate qualified pipeline as AI reshapes buyer discovery',
  'The best enterprise email marketing software in 2026'
]);
const JO = tetel([
  'Gemini in Google Docs can now draft a full outline from your notes',
  'New in Google Meet: take notes for me now works in more languages',
  'Create a custom GPT for your weekly meal plan',
  'Introducing image editing in the ChatGPT app',
  'Notion AI can now fill in your database for you'
]);

t('🔴 a HubSpot-eset (élő, 10-10) kiesik: vállalati/marketinges tartalom', () => {
  const v = kozonsegKapu(HUBSPOT);
  assert.equal(v.ok, false);
  assert.match(v.okok.join(' '), /vállalati\/marketinges/);
  assert.equal(v.mintak.length, 3, 'a user minta-címeket lát');
});

t('egy hétköznapi termékfrissítő forrás átmegy', () => {
  const v = kozonsegKapu(JO);
  assert.equal(v.ok, true, v.okok.join('; '));
  assert.equal(v.figyelmeztetesek.length, 0);
});

t('„best X" címek: kevés → figyelmeztetés (nem kizárás); többség → kizárás', () => {
  const nehany = tetel(['Best AI tools for students', 'Zapier + ChatGPT: automate your inbox', 'New: Zapier Agents', 'How to use Zapier Tables', 'Zapier vs. Make for beginners', 'Automate meeting notes']);
  const v = kozonsegKapu(nehany);
  assert.equal(v.ok, true, 'a Zapier-szerű forrás (élőben 52%) jó — a scraper cikkenként szűr');
  assert.match(v.figyelmeztetesek.join(' '), /legjobb X/);
  const tobbseg = tetel(['Best AI writers', 'Top 10 AI apps', 'ChatGPT vs Claude', 'Best note apps 2026', 'Gemini alternatives', 'One normal post']);
  assert.equal(kozonsegKapu(tobbseg).ok, false);
});

t('fejlesztői forrás kiesik', () => {
  const dev = tetel(['Fine-tuning Llama with our SDK', 'Inference latency benchmarks', 'Deploy endpoints with Terraform', 'New API rate limits', 'Kubernetes autoscaling for MLOps']);
  assert.equal(kozonsegKapu(dev).ok, false);
});

t('kevés cím (<3) → nem ez a kapu dönt', () => {
  assert.equal(kozonsegKapu(tetel(['Enterprise ROI at scale'])).ok, true);
  assert.equal(kozonsegArany([]).n, 0);
});

t('átirányítás-jelzés: más host vagy más fő-útvonal', () => {
  assert.deepEqual(atiranyitas('https://hubspot.com/feed/', 'https://blog.hubspot.com/marketing/rss.xml'),
    { atiranyit: true, leiras: 'átirányít: hubspot.com/feed/ → blog.hubspot.com/marketing/rss.xml' });
  assert.equal(atiranyitas('https://www.x.com/blog/feed', 'https://x.com/blog/feed/').atiranyit, false);
  assert.equal(atiranyitas('nem url', 'https://x.com').atiranyit, false);
});

t('a küszöbök a kalibráció szerint (b2b 0,5 · dev 0,4 · lista 0,6 / jelzés 0,15)', () => {
  assert.deepEqual(KUSZOB, { b2b: 0.5, dev: 0.4, lista: 0.6, listaJelez: 0.15 });
});

t('🔌 a forráskutató tényleg használja: kapu, átirányítás, minta-címek a Telegramban, középhaladó mező', () => {
  const a = readFileSync(new URL('../agents/source-scout/agent.js', import.meta.url), 'utf-8');
  assert.match(a, /from '\.\.\/\.\.\/core\/source-audience\.js'/);
  assert.match(a, /const kozonseg = kozonsegKapu\(found\.feed\?\.items \|\| \[\]\);/);
  assert.match(a, /if \(!kozonseg\.ok\) \{/);
  assert.match(a, /atiranyitas\(found\.url, vegsoUrl\)/);
  assert.match(a, /minta_cimek: kozonseg\.mintak/);
  assert.match(a, /Legutóbbi cikkek:/);
  assert.match(a, /const niches = \[LLM_NICHE, .*KOZEP_NICHE\]/);
  assert.match(a, /\(c\) \$\{niches\[2\]\}/);
});

if (hiba) { console.log(`\n❌ source-audience.test: ${hiba} hiba`); process.exit(1); }
console.log('\n✅ source-audience.test: mind rendben');
