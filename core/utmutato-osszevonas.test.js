// Útmutató-összevonás AUTOMATA (2026-10-19, user: „de ne csak a híreket vonja össze hanem az
// útmutatókat is!" → „Magától, utána szóljon"). A 10-19-i kézi összevonás szabályai gépesítve.
// Ingyenes, hálózat nélküli — a fő folyamat itt NEM fut.
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { hasonlo, kizarva, megtartott, osszevonasiTerv, esedekes, MAX_HETI, HET_NAP } from './utmutato-osszevonas.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };
const u = (slug, cim, tool = '', olv = 0, torzs = '') => ({ slug, cim, tool, olv, torzs: torzs || cim, f: `ARTICLE_GUIDE_${slug}.json`, pub: '2026-09-01' });

const PANASZ = 'Write a short polite complaint email to a company about a broken product. Explain the problem, ask for a refund or replacement, keep a calm firm tone, give an order number and a deadline for a reply.';
const OSSZEF = 'Paste a long article or report into the chat and ask for a short summary with key points and bullet lists, then check the summary against the original for missing facts.';

console.log('\n🧪 utmutato-osszevonas');

t('🔎 a 10-19-i kézi esetek ismétlésnek számítanak', () => {
  assert.ok(hasonlo(u('a', 'Summarize Any Long Document or Article with AI', '', 8, OSSZEF), u('b', 'How to Summarize a Long Article or Report in 5 Minutes', '', 3, OSSZEF)));
  assert.ok(hasonlo(u('c', 'How to write a polite but firm complaint email that actually gets a reply', '', 2, PANASZ), u('d', 'Write a Polite Complaint Email With Grok That Actually Gets Results', 'Grok', 5, PANASZ)));
});

t('🙅 különböző feladat nem ismétlés', () => {
  assert.ok(!hasonlo(u('a', 'Write a polite refund request email in 2 minutes with ChatGPT', 'ChatGPT', 1, 'Ask for money back politely for a late delivery.'), u('b', 'Plan a week of family dinners', '', 3, 'Make a weekly meal plan and grocery list.')));
});

t('🛠️ két KÜLÖNBÖZŐ eszköz változata SOHA nem vonódik össze (user 10-19); általános + eszközös igen', () => {
  assert.equal(kizarva(u('a', 'x', 'Grok'), u('b', 'x', 'DeepSeek')), true);
  assert.equal(kizarva(u('a', 'x', 'Grok'), u('b', 'x', 'grok')), false, 'ugyanaz az eszköz kis/nagybetűvel');
  assert.equal(kizarva(u('a', 'x', ''), u('b', 'x', 'Claude')), false, 'az általános + eszközös páros összevonható');
  assert.equal(kizarva(u('this-week-in-ai-x', 'x'), u('b', 'x')), true, 'heti összefoglaló sosem');
});

t('🏆 a megtartott: az általános változat; ha nincs, a legtöbbet olvasott', () => {
  assert.equal(megtartott([u('g', 'x', 'Grok', 5), u('a', 'x', '', 2), u('d', 'x', 'DeepSeek', 2)]).slug, 'a');
  assert.equal(megtartott([u('q', 'x', 'Qwen', 9), u('m', 'x', 'Qwen', 3)]).slug, 'q');
});

t('📋 a terv: csak megengedett párok, a megtartott sosem tűnik el, heti plafon', () => {
  const lista = [
    u('gen', 'How to write a polite but firm complaint email that actually gets a reply', '', 2, PANASZ),
    u('grok', 'Write a Polite Complaint Email With Grok That Actually Gets Results', 'Grok', 5, PANASZ),
    u('ds', 'Write a Polite Complaint Email to a Company with DeepSeek', 'DeepSeek', 2, PANASZ),
    u('s1', 'Summarize Any Long Document or Article with AI', '', 8, OSSZEF),
    u('s2', 'How to Summarize a Long Article or Report in 5 Minutes', '', 3, OSSZEF),
    u('qa', 'Practice Job Interview Questions with Qwen', 'Qwen', 9, 'Practice interview questions and get feedback on your answers.'),
    u('lc', 'Practice a Job Interview With Le Chat', 'Le Chat', 7, 'Practice interview questions and get feedback on your answers.')
  ];
  const terv = osszevonasiTerv(lista);
  const par = Object.fromEntries(terv.map(x => [x.from.slug, x.to.slug]));
  assert.deepEqual(par, { grok: 'gen', ds: 'gen', s2: 's1' });
  assert.ok(!terv.some(x => x.from.slug === x.to.slug));
  const celok = new Set(terv.map(x => x.to.slug));
  assert.ok(!terv.some(x => celok.has(x.from.slug)), 'lánc: egy megtartott maga is eltűnne');
  const sok = Array.from({ length: 8 }, (_, i) => [u(`a${i}`, `Summarize Any Long Document Report ${i}`, '', 5, OSSZEF + ' z' + i), u(`b${i}`, `How to Summarize a Long Report Document ${i}`, '', 1, OSSZEF + ' z' + i)]).flat();
  assert.ok(osszevonasiTerv(sok).length <= MAX_HETI, 'túllépte a heti plafont');
});

t('📅 hetente egyszer fut (az utolsó futás után ' + 6 + ' nappal)', () => {
  assert.equal(esedekes(null, '2026-10-20T02:00:00Z'), true);
  assert.equal(esedekes('2026-10-18T02:00:00Z', '2026-10-20T02:00:00Z'), false);
  assert.equal(esedekes('2026-10-13T02:00:00Z', '2026-10-20T02:00:00Z'), true);
  assert.ok(HET_NAP === 6 && MAX_HETI === 5);
});

t('🔌 az auto.yml a BUILD ELŐTT futtatja (a törölt oldal ne épüljön meg), Telegram-kulccsal', () => {
  const yml = readFileSync(join(ROOT, '.github', 'workflows', 'auto.yml'), 'utf-8');
  const i = yml.indexOf('node core/utmutato-osszevonas.js --auto');
  assert.ok(i > 0, 'nincs CI-lépés');
  assert.ok(i < yml.indexOf('node website/build.js'), 'a build UTÁN futna — a törölt útmutató még kimenne');
  const lepes = yml.slice(yml.lastIndexOf('- name:', i), i);
  assert.ok(lepes.includes('TELEGRAM_BOT_TOKEN'), 'nem tud szólni');
  const src = readFileSync(join(ROOT, 'core', 'utmutato-osszevonas.js'), 'utf-8');
  assert.match(src, /slug-history\.json/, 'átirányítás nélkül törölne (404)');
  assert.match(src, /process\.argv\[1\] && process\.argv\[1\]\.endsWith\('utmutato-osszevonas\.js'\)/);
});

if (hiba) { console.log(`\n❌ utmutato-osszevonas.test: ${hiba} hiba`); process.exit(1); }
console.log('✅ utmutato-osszevonas.test: mind rendben');
