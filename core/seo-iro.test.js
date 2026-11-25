// ===================================================================
// TESZT — SEO-agent v2 tiszta logikája (core/seo-iro.js). Ingyenes, hálózat nélkül.
// Az agents/seo/agent.js feltétel nélkül futtatja a main()-t → azt NEM importáljuk.
// ===================================================================
import assert from 'assert/strict';
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { seoBemenet, seoPrompt, seoValasz, atirasSorrend, vedettFriss, forgalom30 } from './seo-iro.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, bukott = 0;
const t = (nev, fn) => {
  try { fn(); pass++; console.log('  ✅ ' + nev); }
  catch (e) { bukott++; console.log('  ❌ ' + nev + '\n     ' + String(e.message).split('\n')[0]); }
};
console.log('🧪 SEO-agent v2 logika\n');

const MEET_SLUG = 'how-to-find-your-google-meet-recordings-transcripts-and-notes';
const meetFajl = readdirSync(join(ROOT, 'content', 'articles')).find(f => {
  try { return JSON.parse(readFileSync(join(ROOT, 'content', 'articles', f), 'utf-8'))._meta?.slug === MEET_SLUG; } catch { return false; }
});
const MD = JSON.parse(readFileSync(join(ROOT, 'content', 'articles', meetFajl), 'utf-8')).article_markdown;

t('seoBemenet: a valódi Meet-cikk részei', () => {
  const b = seoBemenet(MD);
  assert.equal(b.cim, 'How to Find Your Google Meet Recordings, Transcripts and Notes');
  assert.match(b.alcim, /^A practical guide to locating every file/);
  assert.match(b.roviden, /^Google Meet saves recordings, transcripts, and Gemini-written notes/);
  assert.ok(b.h2k.length > 0 && b.h2k.includes('Before you start'));
  assert.ok(b.torzs.length > 500 && b.torzs.length <= 2500);
  assert.ok(!/[*#>]/.test(b.torzs), 'a törzsben ne maradjon markdown-jel');
});
t('seoPrompt: a határok, a tilalmak és csak a cikk tényei', () => {
  const p = seoPrompt(seoBemenet(MD));
  for (const r of [/25.?60/, /120.?158/, /no prices/i, /no comparisons/i, /only facts stated in the article/i, /American English/i, /natural, grammatical/i]) assert.match(p, r);
  assert.match(p, /How to Find Your Google Meet Recordings/);
});
t('seoPrompt: újrapróbánál a kapu-hibák visszamennek', () => {
  const p = seoPrompt(seoBemenet(MD), { hibak: ['CIM_HOSSZ: a cím 64 karakter (25–60 kell)'] });
  assert.match(p, /CIM_HOSSZ: a cím 64 karakter/);
});
t('seoValasz: kódblokkba csomagolt JSON is jó', () => {
  assert.deepEqual(seoValasz('```json\n{"seo_title":"A","meta_description":"B","keywords":["k"]}\n```'), { seo_title: 'A', meta_description: 'B', keywords: ['k'] });
});
t('seoValasz: üres / hiányos / nem JSON → null (NEM kapu-bukás: a következő futás újrapróbálja)', () => {
  assert.equal(seoValasz(''), null);
  assert.equal(seoValasz('{}'), null);
  assert.equal(seoValasz('{"seo_title":"A"}'), null);
  assert.equal(seoValasz('sorry, I cannot'), null);
  assert.equal(seoValasz(null), null);
});
t('forgalom30: az utolsó 30 nap látogatása slugonként (csak angol cikkoldal)', () => {
  const most = Date.parse('2026-11-25T12:00:00Z');
  const log = { days: {
    '2026-11-20': [{ path: '/article/a', visits: 3 }, { path: '/hu/article/a', visits: 9 }, { path: '/', visits: 50 }],
    '2026-11-24': [{ path: '/article/a', visits: 2 }, { path: '/article/b', visits: 1 }],
    '2026-10-01': [{ path: '/article/b', visits: 100 }]
  } };
  const f = forgalom30(log, most);
  assert.equal(f.get('a'), 5);
  assert.equal(f.get('b'), 1);
  assert.equal(f.size, 2);
});
t('atirasSorrend: legolvasottabb elöl, a védett kimarad (megtartva), a v2 nem kerül sorra', () => {
  const r = atirasSorrend(
    [{ slug: 'sok', v: 1 }, { slug: 'vedett', v: 1 }, { slug: 'nulla' }, { slug: 'kesz', v: 2 }],
    new Map([['sok', 50], ['vedett', 5], ['kesz', 999]]),
    new Set(['vedett'])
  );
  assert.deepEqual(r.sor, ['sok', 'nulla']);
  assert.deepEqual(r.megtartva, ['vedett']);
});
t('vedettFriss: 13 nap még friss, 15 már nem, hiányzó nem', () => {
  const most = Date.parse('2026-11-25T12:00:00Z');
  assert.equal(vedettFriss({ at: '2026-11-12T12:00:00Z', vedett: [] }, most), true);
  assert.equal(vedettFriss({ at: '2026-11-10T11:00:00Z', vedett: [] }, most), false);
  assert.equal(vedettFriss(null, most), false);
  assert.equal(vedettFriss({ vedett: [] }, most), false);
});

console.log(`\n${bukott ? '❌' : '✅'} ${pass} rendben, ${bukott} bukott`);
if (bukott) process.exit(1);
