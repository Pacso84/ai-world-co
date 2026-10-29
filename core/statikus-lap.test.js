// Statikus-lap kapu (2026-10-29: a Midjourney saját hírcsatornájából is kiszórta a rövid című híreket). Ingyenes.
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { isStaticPage, googleNewsForras, keszulekBemutato } from './statikus-lap.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };

console.log('\n🧪 statikus-lap');

t('🎯 a valódi eset: a Midjourney saját hírcsatornájának rövid című hírei átmennek', () => {
  for (const c of ['Testing Thinking Mode', 'Alpha Changelog - 10/7/26', 'Edit Model for V8']) assert.equal(isStaticPage(c), false, c);
});

t('🧭 Google News site:-forrásnál a menüpontok és a rövid lapcímek továbbra is kiesnek', () => {
  for (const c of ['DeepSeek', 'DeepSeek Platform - DeepSeek', 'Connectors - Perplexity', 'API Platform', 'What is Perplexity?'])
    assert.equal(isStaticPage(c, { googleNews: true }), true, c);
  for (const c of ['DeepSeek V4 Preview Release - DeepSeek', 'Personal Computer is now available on Windows - Perplexity'])
    assert.equal(isStaticPage(c, { googleNews: true }), false, c);
});

t('🚪 menüpont-név és üres cím MINDEN forrásnál kizáró', () => {
  for (const c of ['Pricing', 'Blog', 'What is Midjourney?', '', '   ']) assert.equal(isStaticPage(c), true, JSON.stringify(c));
});

t('🔎 Google News-forrás felismerése az URL-ből', () => {
  assert.equal(googleNewsForras({ url: 'https://news.google.com/rss/search?q=site:x.ai' }), true);
  assert.equal(googleNewsForras({ url: 'https://updates.midjourney.com/rss/' }), false);
  assert.equal(googleNewsForras(null), false);
});

t('🔌 az rss-scraper a forrás típusával hívja (nem a régi, mindenre érvényes változatot)', () => {
  const src = readFileSync(join(ROOT, 'agents', 'rss-scraper', 'agent.js'), 'utf-8').replace(/^\s*\/\/.*$/gm, '');
  assert.match(src, /isStaticPage\(item\.title \|\| '', \{ googleNews: googleNewsForras\(feedConfig\) \}\)/);
  assert.match(src, /import \{ isStaticPage, googleNewsForras[^}]*\} from '\.\.\/\.\.\/core\/statikus-lap\.js'/);
  assert.doesNotMatch(src, /function isStaticPage\(/, 'a régi helyi változat maradt');
});

t('📵 készülék-kapu (Amazon Alexa-csatorna, valódi címek 10-29)', () => {
  for (const c of ['Amazon unveils its newest lineup of Alexa devices', 'Amazon introduces Alexa Photo Frame—the smartest way to bring your photos into the home',
    'Amazon introduces the all-new Echo Show 16—our most advanced, versatile smart display yet', 'Introducing the new Echo Dot and all-new Echo Studio with Home Camera',
    'Apple unveils new iMac with M6', 'Apple gives iPad mini its biggest update ever', 'iPhone Duo arrives at Apple Store locations worldwide'])
    assert.equal(keszulekBemutato(c), true, c);
  for (const c of ['Alexa for Shopping adds 100+ new capabilities to make shopping even faster and easier', 'Meet Alexa Home Map, an interactive 3D map that lets you see and control your home',
    'Siri AI is available in more languages starting today', 'Apple Creator Studio adds powerful new AI features and even more creative tools'])
    assert.equal(keszulekBemutato(c), false, c);
  const src = readFileSync(join(ROOT, 'agents', 'rss-scraper', 'agent.js'), 'utf-8').replace(/^\s*\/\/.*$/gm, '');
  const i = src.indexOf('feedConfig.eszkoz_kapu && keszulekBemutato(item.title');
  assert.ok(i > 0, 'nincs bekötve');
  assert.match(src.slice(i, i + 200), /seen\[feedConfig\.id\]\.push\(item\.link\)/);
  const F = JSON.parse(readFileSync(join(ROOT, 'sources', 'rss-feeds.json'), 'utf-8'));
  const amazon = F.sources.find(s => s.id === 'amazon-alexa');
  assert.ok(amazon && amazon.eszkoz_kapu === true, 'az Amazon Alexa-forrás készülék-kapu nélkül');
});

if (hiba) { console.log(`\n❌ statikus-lap.test: ${hiba} hiba`); process.exit(1); }
console.log('✅ statikus-lap.test: mind rendben');
