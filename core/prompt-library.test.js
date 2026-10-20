// core/prompt-library.js — a Prompt-tár (2026-10-16, user: „jó lenne ilyen extrával rendelkezni,
// mint a nagyobb oldalak” → „ezt inkább a trendeknél kéne megnézni”). Ingyenes, hálózat nélküli.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { promptokCikkbol, promptTar, promptTarHtml, KIEMELT_MAX, CIKKENKENT_MAX } from './prompt-library.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };
console.log('\n🧪 prompt-library');

const MD = `## Step 1 — Open the app
💬 Example: don't type anything yet — just make sure the chat is open and empty.

## Step 2 — Paste the prompt
💬 Example (copy the whole block):

\`\`\`
Look at the attached selfie. Generate a new image of me as a professional
LinkedIn headshot. Keep my face the same.
\`\`\`

## Step 3 — Ask for an email
💬 Example: "Write a polite email asking my manager for a one-hour meeting next week to discuss project updates."

## Step 4 — Give the details
💬 Example: "Theme: dinosaur dig. Budget total $200. Food $80, decor and activities $90, surprises $30."

\`\`\`
Pantry: rice, tomatoes, pesto — a code block WITHOUT the 💬 example line before it
\`\`\`

💬 Example: "Too short to be a prompt."
💬 Example: **"Can you turn these meeting notes into a checklist with three columns: decision, owner, deadline?"**
💬 Example: "Write a polite email asking my manager for a one-hour meeting next week to discuss project updates."
`;

t('🔎 kinyeri a „💬 Example” utáni kódblokkot és a hosszú, idézőjeles példát; a többit nem', () => {
  const p = promptokCikkbol(MD);
  assert.equal(p.length, 3, JSON.stringify(p, null, 1));
  assert.match(p[0], /^Look at the attached selfie\. Generate a new image/);
  assert.ok(p[0].includes('professional LinkedIn headshot'), 'a kódblokk MONDATKÖZI tördelése összefűzve (élő előnézetben „Generate a new / image of me”)');
  assert.ok(!p[0].includes('\n'));
  assert.equal(p[1], 'Write a polite email asking my manager for a one-hour meeting next week to discuss project updates.');
  assert.match(p[2], /^Can you turn these meeting notes/, 'a **kiemelés** és az idézőjel lekerül');
  assert.ok(!p.some(x => /^Theme:/.test(x)), 'a példa-ADAT („Theme: …”) nem prompt');
  assert.ok(!p.some(x => /Pantry/.test(x)), '💬 nélküli kódblokk nem prompt');
  assert.ok(!p.some(x => /don't type/.test(x)), 'az „ne írj semmit” példa nem prompt');
});

t('🔎 hangparancs-előtag (Alexa, …) után is felszólítás vagy kérdés kell; üres bemenet → üres lista', () => {
  assert.deepEqual(promptokCikkbol('💬 Example: "Alexa, what should I wear today if it rains and I have a long walk to the office?"'),
    ['Alexa, what should I wear today if it rains and I have a long walk to the office?']);
  assert.deepEqual(promptokCikkbol('💬 Example: "Alexa, kitchen lights are on the left side of the counter near the window."'), []);
  assert.deepEqual(promptokCikkbol(''), []);
  assert.deepEqual(promptokCikkbol(null), []);
});

t('🔎 10-16 előnézet, 2. kör: kijelentés, kész szöveg, levélfejléc és ÖSSZEHASONLÍTÁS nem kerül a tárba', () => {
  for (const nem of [
    "I'll paste the plan into my calendar as 20-minute events on weekdays, and a 60-minute block on Saturday.",
    'I keep thinking about how he always had the right tool in his truck and a coffee in his hand.',
    'When you described how the marketing team rebuilt the volunteer newsletter last spring, that stayed with me.',
    'From: Amazon Support — Dear customer, your account has been suspended. Click here to verify, please respond.',
    'What does Stripe do, who are its main customers, and how is it different from PayPal and Adyen?',
    'Which is better for a beginner, ChatGPT vs Gemini, if I only want to write short emails each week?'
  ]) assert.deepEqual(promptokCikkbol(`💬 Example: "${nem}"`), [], nem);
  assert.equal(promptokCikkbol('💬 Example: "I\'m uploading a contract. Please don\'t analyze it yet — I\'ll ask my questions one at a time."').length, 1);
  assert.equal(promptokCikkbol('💬 Example: "What types of personal information should I never share with you when I use an AI chat?"').length, 1);
});

t('🔎 10-16 előnézet: az „I have / I\'m …” háttér-mondat KÉRÉS vagy kérdőjel nélkül nem prompt; a felsorolás sorai megmaradnak', () => {
  assert.deepEqual(promptokCikkbol('💬 Example: "I have meetings until 3 p.m., then I\'m picking up the kids. I\'m usually in business casual."'), []);
  assert.equal(promptokCikkbol('💬 Example: "I have some leftover roast pumpkin and spinach in the fridge. What is a quick lunch I can make?"').length, 1);
  assert.equal(promptokCikkbol('💬 Example: "I\'d like to practice a salary conversation. Please play the role of my manager the whole time."').length, 1);
  const lista = promptokCikkbol('💬 Example (copy):\n\n```\nWrite a packing list for a beach weekend with these sections:\n- clothes\n- toiletries\n- snacks for the car\n```');
  assert.equal(lista[0], 'Write a packing list for a beach weekend with these sections:\n- clothes\n- toiletries\n- snacks for the car');
});

const NAP = 864e5, MOST = Date.parse('2026-10-16T12:00:00Z');
const cikk = (slug, korNap, { trend = false, cim = 'How to plan a trip', promptok = 1 } = {}) => ({
  slug, title: cim, titleEn: cim, tool: 'Gemini', trend, publishedAt: new Date(MOST - korNap * NAP).toISOString(),
  md: Array.from({ length: promptok }, (_, i) => `💬 Example: "Write a short packing list for a ${slug} weekend trip, version ${i}, grouped by bag."`).join('\n')
});

t('⭐ kiemelt: a TREND-útmutatók elöl, utána a friss (≤14 nap) — a régi nem; a kiemelt a témák közt nem ismétlődik', () => {
  const tar = promptTar([cikk('regi', 60), cikk('friss', 3), cikk('trend', 1, { trend: true }), cikk('trend-regi', 40, { trend: true })], { now: MOST });
  assert.deepEqual(tar.kiemelt.map(e => e.slug), ['trend', 'trend-regi', 'friss']);
  const temakban = [...tar.temak.flatMap(x => x.lista), ...tar.egyeb].map(e => e.slug);
  assert.deepEqual(temakban, ['regi'], 'a kiemelt nem ismétlődik lent');
  assert.equal(tar.ossz, 4);
  const sokPromptos = promptTar([cikk('t3', 1, { trend: true, promptok: 3 }), cikk('f', 2)], { now: MOST });
  assert.deepEqual(sokPromptos.kiemelt.map(e => e.slug), ['t3', 'f'], '🔴 a kiemelt sorban útmutatónként EGY (előnézet: egy útmutató 3 kártyát foglalt)');
  assert.equal([...sokPromptos.temak.flatMap(x => x.lista), ...sokPromptos.egyeb].filter(e => e.slug === 't3').length, 2, 'a többi a témák közé kerül');
  const folytatas = { ...cikk('fo', 1), md: '💬 Example: "Now give me a stronger version with a clearer opening line and a shorter ending."\n💬 Example: "Write a short packing list for a beach weekend trip, grouped by bag, with snacks."' };
  const k = promptTar([folytatas], { now: MOST }).kiemelt;
  assert.equal(k.length, 1);
  assert.match(k[0].szoveg, /^Write a short packing list/, '🔴 a kirakatba előzmény nélküli folytatás („Now give me…”) került');
});

t('⚖️ útmutatónként legfeljebb CIKKENKENT_MAX prompt, és a kiemelt sor legfeljebb KIEMELT_MAX hosszú; azonos szöveg csak egyszer', () => {
  const tar = promptTar([cikk('sok', 50, { promptok: 7 })], { now: MOST });
  assert.equal(tar.ossz, CIKKENKENT_MAX);
  const sokFriss = Array.from({ length: 20 }, (_, i) => cikk('f' + i, 2));
  assert.equal(promptTar(sokFriss, { now: MOST }).kiemelt.length, KIEMELT_MAX);
  const dupla = { ...cikk('a', 50), md: cikk('x', 50).md }, dupla2 = { ...cikk('b', 50), md: cikk('x', 50).md };
  assert.equal(promptTar([dupla, dupla2], { now: MOST }).ossz, 1, 'két útmutató azonos promptja egyszer');
});

t('🗂️ témák: a core/topics.js szerint (az ANGOL címből), ismeretlen téma → „egyéb”', () => {
  const tar = promptTar([cikk('ut', 50, { cim: 'Plan a weekend trip with Gemini' }), cikk('ism', 50, { cim: 'Zorbify the quux' })], { now: MOST });
  assert.ok(tar.temak.some(x => x.id === 'home' && x.lista[0].slug === 'ut'), JSON.stringify(tar.temak.map(x => x.id)));
  assert.equal(tar.egyeb[0].slug, 'ism');
});

const SZ = { kicker: 'Prompts', cim: 'AI Prompt Library', tag: 'Copy-ready prompts.', kiemeltCim: 'Trending & new', egyebCim: 'More prompts',
  masol: 'Copy', masolva: 'Copied!', utmutato: 'Full guide', db: n => `${n} prompts`, kereses: 'Search prompts…' };

t('🧱 HTML: minden kártyán másolás-gomb, eszköz és link a teljes útmutatóra; a szöveg ESCAPE-elve; a [kitöltendő] kiemelve', () => {
  const tar = promptTar([{ ...cikk('ut', 2), md: '💬 Example: "Write a polite <b>complaint</b> email. Facts: [paste your five facts here]. Keep it under 150 words."' }], { now: MOST });
  const h = promptTarHtml(tar, { sz: SZ, temaNev: id => id, nyelvTipp: '' });
  // 10-20 új megjelenés: ikon + felirat a gombban (a szkript a .pl-copy-l feliratot cseréli)
  assert.match(h, /<button class="pl-copy" type="button" data-copied="Copied!"><svg[^>]*class="pl-copy-i"|<button class="pl-copy" type="button" data-copied="Copied!"><svg class="pl-copy-i"/);
  assert.match(h, /<span class="pl-copy-l">Copy<\/span><\/button>/);
  assert.match(h, /<h3 class="pl-goal"><a href="article\/ut">/, 'a kártya fölött, mire jó (az útmutató címe)');
  assert.match(h, /href="article\/ut"/);
  assert.ok(h.includes('&lt;b&gt;complaint&lt;/b&gt;') && !h.includes('<b>complaint'), 'a prompt HTML-je nem futhat le');
  assert.match(h, /<span class="pl-fill">\[paste your five facts here\]<\/span>/);
  assert.match(h, />1 prompts</);
  assert.equal((h.match(/<script>/g) || []).length, 1, 'egy közös szkript (másolás + keresés)');
  assert.ok(!h.includes('pl-tip'), 'tipp nélkül nincs tipp-sor');
  assert.match(promptTarHtml(tar, { sz: SZ, temaNev: id => id, nyelvTipp: 'Tipp: <x>' }), /<p class="pl-tip">Tipp: &lt;x&gt;<\/p>/);
});

t('📊 VALÓDI útmutatókon: útmutatónként legalább 0,85 prompt (mérve 10-16: 431/428, 10-18: 375/382), és egyik sem példa-adat („Theme: …”, „Pantry: …”)', () => {
  const DIR = join(ROOT, 'content', 'articles');
  const cikkek = readdirSync(DIR).filter(f => f.startsWith('ARTICLE_GUIDE_')).map(f => {
    const j = JSON.parse(readFileSync(join(DIR, f), 'utf-8'));
    return { slug: j._meta?.slug || f, title: 'x', titleEn: 'x', tool: '', trend: !!j._meta?.trend, publishedAt: j._meta?.published_at || '', md: j.article_markdown || '' };
  });
  const tar = promptTar(cikkek, { now: MOST });
  const mind = [...tar.kiemelt, ...tar.temak.flatMap(x => x.lista), ...tar.egyeb];
  const adat = mind.filter(e => /^(Theme|Pantry|Fridge|Freezer|Name|Budget|Me|Facts|Notes|Subject|Date|Day \d+|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Out of)\b[^.\n]{0,24}:/i.test(e.szoveg));
  const kesz = mind.filter(e => /^(thanks|thank you|hi|hello|dear)\b/i.test(e.szoveg));
  console.log(`     ${tar.ossz} prompt ${cikkek.length} útmutatóból · kiemelt ${tar.kiemelt.length}`);
  // ARÁNY, nem darabszám: a napi útmutató-törlés (core/guide-prune.js) a darabszámot csökkenti —
  // a rögzített „≥ 400” 10-18-án így bukott el, pedig a kinyerés ép volt.
  assert.ok(tar.ossz >= 0.85 * cikkek.length, `túl kevés (elromlott a kinyerés?): ${tar.ossz} / ${cikkek.length} útmutató`);
  assert.deepEqual(kesz.map(e => e.szoveg.slice(0, 50)), [], 'kész levél/üdvözlés csúszott át');
  assert.deepEqual(adat.map(e => e.szoveg.slice(0, 50)), [], 'példa-adat csúszott át');
});

t('🔌 build.js: az oldal minden nyelven elkészül, a webhelytérképben van, a lábléc, a „Kezdd itt” és az útmutató-oldal linkel rá', () => {
  const b = readFileSync(join(ROOT, 'website', 'build.js'), 'utf-8');
  assert.match(b, /import \{ promptTar, promptTarHtml \} from '\.\.\/core\/prompt-library\.js';/);
  assert.match(b, /writeFileSync\(join\(outBase, 'prompts\.html'\), buildPromptsPage\(articles, loc\)/, 'a nyelvi ciklusban kell — különben a nyelvváltó halott linkre mutat');
  assert.match(b, /sitemapUrls\.push\(\{ loc: `\$\{SITE\.url\}\$\{lp\}\/prompts`/);
  assert.match(b, /<a href="\$\{LP\}\/prompts">📋 \$\{tr\('plNav'\)\}<\/a>/, 'lábléc-link');
  assert.equal((b.match(/<a href="prompts">📋 \$\{escapeHtml\(tr\('plBanner'\)\)\}<\/a>/g) || []).length, 2, '„Kezdd itt” + útmutató-oldal');
  assert.match(b, /trend: !!data\._meta\?\.trend,/, 'a trend-jelölés nélkül a kiemelt sor csak a frisseket mutatná');
  const ui = b.slice(b.indexOf('const UI_PROMPTS = {'), b.indexOf('for (const l of SITE_LANGS) Object.assign(UI[l], UI_PROMPTS'));
  for (const k of ['plNav', 'plTitle', 'plTag', 'plTrending', 'plMore', 'plCopy', 'plCopied', 'plGuide', 'plCount', 'plSearch', 'plTip', 'plBanner']) {
    assert.equal((ui.match(new RegExp('\\b' + k + ':', 'g')) || []).length, 3, k + ' nincs meg mind a 3 nyelven');
  }
});

t('🎨 stílus: a kártya, a másolás-gomb és a kereső megvan a style.css-ben', () => {
  const css = readFileSync(join(ROOT, 'website', 'assets', 'style.css'), 'utf-8');
  for (const s of ['.pl-card', '.pl-copy', '.pl-search', '.pl-grid', '.pl-fill', '.pl-tip']) assert.ok(css.includes(s + ' {'), s + ' hiányzik');
});

if (hiba) { console.log(`\n❌ prompt-library.test: ${hiba} hiba`); process.exit(1); }
console.log('\n✅ prompt-library.test: mind rendben');
