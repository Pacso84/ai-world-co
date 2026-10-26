// Heti MI-híradó (2026-10-19, user: „azt mondtuk a heti összefoglaló videó lesz! de nem így
// sikerült!" → „ez így jó!" = a 10-11-i forma marad). A tiszta részek tesztje; a videógyártás
// (Hugging Face + ffmpeg) csak a .github/workflows/heti-hirado.yml-ben fut. Ingyenes, hálózat nélküli.
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  hetiOsszefoglalo, focimek, rovidCim, szakaszok, datumCimbol, boritoValaszt, hiradoJson, MAX_SZO, JAVITOTT_KEP_OTA
} from './heti-hirado.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };

const HETI_MD = `---
title: "This Week in AI: 5 Headlines to Follow (October 18, 2026)"
---
# This Week in AI
## 1. Gmail AI Updates for Paid Workspace Users
text
## 2. NVIDIA's New Line of AI-Capable Laptops
text
## 3. AI in Banking
`;

console.log('\n🧪 heti-hirado');

t('📰 a legfrissebb heti összefoglalót választja, de csak ha 3 napon belül jelent meg', () => {
  const cikkek = [
    { slug: 'this-week-in-ai-the-5-stories-that-matter-october-11-2026', published_at: '2026-10-11T14:31:36Z' },
    { slug: 'this-week-in-ai-5-headlines-to-follow-october-18-2026', published_at: '2026-10-19T15:12:51Z' },
    { slug: 'some-guide', published_at: '2026-10-19T16:00:00Z' }
  ];
  assert.equal(hetiOsszefoglalo(cikkek, '2026-10-19T17:00:00Z').slug, 'this-week-in-ai-5-headlines-to-follow-october-18-2026');
  assert.equal(hetiOsszefoglalo(cikkek, '2026-10-25T16:00:00Z'), null, 'egy hetes cikkből gyártott volna');
  assert.equal(hetiOsszefoglalo([], '2026-10-19T17:00:00Z'), null);
});

t('🗞️ a hírek címe a számozott alcímekből jön (szó szerint, semmit nem talál ki)', () => {
  assert.deepEqual(focimek(HETI_MD, 2), ['Gmail AI Updates for Paid Workspace Users', "NVIDIA's New Line of AI-Capable Laptops"]);
  assert.deepEqual(focimek('# nincs számozott alcím', 2), []);
  // 10-26: a 10-25-i heti cikk számozás nélkül jött → a sima alcímek, a záró részek nélkül
  const SZAMOZATLAN = '# This Week in AI: The 5 Stories That Matter (October 25, 2026)\n## Meeting Recaps Show Up in Google Chat\ntext\n' +
    '## Google Meet Translates Speech in 63 Languages\ntext\n## What This Means for You\ntext\n## Wrap-up\ntext';
  assert.deepEqual(focimek(SZAMOZATLAN, 2), ['Meeting Recaps Show Up in Google Chat', 'Google Meet Translates Speech in 63 Languages']);
  assert.deepEqual(focimek('# Cím\n## What This Means for You\n## Wrap-up', 2), [], 'csak záró rész → nincs hír');
  assert.deepEqual(focimek(HETI_MD + '\n## Wrap-up', 5).includes('Wrap-up'), false, 'számozottnál a záró rész nem kerül be');
});

t('✂️ a hosszú cím szóhatáron rövidül, a rövid változatlan', () => {
  assert.equal(rovidCim('AI in Banking', 58), 'AI in Banking');
  const r = rovidCim('A very long headline about an AI announcement that goes on and on and on forever', 40);
  assert.ok(r.length <= 41 && r.endsWith('…') && !r.includes('  '), r);
});

t('🎙️ a szöveg: bevezető + „First up" + „Also this week" — mind belefér a 10 mp-be', () => {
  const s = szakaszok(['Gmail AI Updates for Paid Workspace Users', "NVIDIA's New Line of AI-Capable Laptops"]);
  assert.equal(s.length, 3);
  assert.match(s[0], /this week's AI news from AI World HQ/);
  assert.equal(s[1], 'First up: Gmail AI Updates for Paid Workspace Users.');
  assert.equal(s[2], "Also this week: NVIDIA's New Line of AI-Capable Laptops.");
  for (const x of s) assert.ok(x.split(/\s+/).length <= MAX_SZO, 'túl hosszú a 10 mp-hez: ' + x);
  assert.equal(szakaszok(['Only one']).length, 2, 'egy hírből is legyen híradó');
  assert.equal(szakaszok([]).length, 0, 'hír nélkül ne legyen híradó');
});

t('📅 a dátum a címből: „(October 18, 2026)" → October 18, 2026 / 2026-10-18', () => {
  assert.deepEqual(datumCimbol('This Week in AI: 5 Headlines to Follow (October 18, 2026)'), { szoveg: 'October 18, 2026', iso: '2026-10-18' });
  assert.equal(datumCimbol('nincs dátum'), null);
});

t('🖼️ borító: a hírhez tartozó cikk képe CSAK ha a felirat-javítás után készült; különben a heti cikk képe', () => {
  const hirek = [
    { slug: 'google-adds-two-ai-features-to-paid-gmail-here-s-what-they-do', cim: 'Google Adds Two AI Features to Paid Gmail', image: 'g.jpg', image_at: '2026-10-16T02:00:00Z' },
    { slug: 'rtx-spark-laptops-are-here', cim: 'RTX Spark Laptops Are Here: Local AI Power', image: 'n.jpg', image_at: '2026-10-20T02:00:00Z' }
  ];
  const tartalek = 'heti.jpg';
  assert.equal(boritoValaszt('Gmail AI Updates for Paid Workspace Users', hirek, tartalek), 'heti.jpg', 'régi (halandzsás) képet választott');
  assert.equal(boritoValaszt("NVIDIA's New Line of AI-Capable Laptops — local AI laptops", hirek, tartalek), 'n.jpg');
  assert.equal(boritoValaszt('Something unrelated', hirek, tartalek), 'heti.jpg');
  assert.ok(JAVITOTT_KEP_OTA <= '2026-10-19T09:00:00Z');
});

t('🧾 a kiküldő modul (core/hirado-kuldes.js) által várt json', () => {
  const j = hiradoJson({ datum: '2026-10-18', cikkSlug: 'this-week-in-ai-x', cimek: ['Gmail AI Updates', 'NVIDIA laptops'] });
  assert.equal(j.datum, '2026-10-18');
  assert.equal(j.video_slug, 'this-week-in-ai-2026-10-18');
  assert.equal(j.cikk_slug, 'this-week-in-ai-x');
  assert.match(j.szoveg, /Gmail AI Updates/); assert.match(j.szoveg, /AI news host/);
  assert.ok(!('posted_fb' in j), 'jelölés nélkül induljon');
});

t('🔌 a CI hetente futtatja (vasárnap + hétfő pótlás), HF-kulccsal, ffmpeg-gel; a gyártó lépés maga NEM posztol (azt az auto.yml teszi a deploy után)', () => {
  const yml = readFileSync(join(ROOT, '.github', 'workflows', 'heti-hirado.yml'), 'utf-8');
  assert.match(yml, /cron: '[^']+ \* \* 0'/, 'nincs vasárnapi időzítés');
  assert.match(yml, /cron: '[^']+ \* \* 1'/, 'nincs hétfői pótlás');
  assert.match(yml, /HF_TOKEN: \$\{\{ secrets\.HF_TOKEN \}\}/);
  assert.match(yml, /apt-get install -y -qq ffmpeg/);
  assert.match(yml, /node core\/heti-hirado\.js --gyart/);
  assert.ok(!/run: node core\/hirado-kuldes/.test(yml), 'a gyártó küldené ki — a videó a deploy előtt még nem élne');
  assert.match(yml, /group: aiworld-auto/, 'ütközne az auto.yml visszacommitjával');
});

t('🌐 a HONLAPON is kint van (user 10-19: „de a honlapon is legyen kint!"): a heti cikk tetején álló lejátszó, 3 nyelvű felirattal', () => {
  const b = readFileSync(join(ROOT, 'website', 'build.js'), 'utf-8');
  assert.match(b, /join\(__dirname, '\.\.', 'content', 'hirado'\)/, 'a build nem olvassa a híradó-jelölőket');
  const vb = b.slice(b.indexOf('function videoBlock('), b.indexOf('function videoBlock(') + 1600);
  assert.match(vb, /HIRADOK\.get\(a\.slug\)/, 'a cikkhez tartozó híradót nem keresi');
  assert.match(vb, /<video [^>]*controls[^>]*playsinline/, 'nem lejátszható / iPhone-on teljes képernyőre ugrana');
  assert.match(vb, /\/assets\/video\/shorts\/\$\{h\.video_slug\}\.mp4/);
  assert.match(vb, /tr\('hirNote'\)/);
  for (const ny of ['en', 'hu', 'es']) assert.ok(new RegExp(`${ny}: \\{[^}]*hirNote:`).test(b), ny + ': nincs hirNote felirat');
  assert.match(b, /existsSync\(join\(__dirname, 'assets', 'video', 'shorts', `\$\{j\.video_slug\}\.mp4`\)\)/, 'videó nélküli jelölőre is lejátszót rakna');
});

if (hiba) { console.log(`\n❌ heti-hirado.test: ${hiba} hiba`); process.exit(1); }
console.log('✅ heti-hirado.test: mind rendben');
