// Menü + „Kezdd itt” / „Rólunk” összevonás (2026-10-17, user: „a Kezdd itt és a Rólunkat
// nem tudnánk összerakni egybe? így hülyén néz ki! és az első menü legyen a Hírek!” →
// „Rólunk a menü végén”). Forrás-oldali őr: a build helyben NEM futtatható.
// Ingyenes, hálózat nélküli.
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(ROOT, 'website', 'build.js'), 'utf-8');
let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };
const sablon = nev => {
  const i = src.indexOf('function ' + nev + '(');
  assert.ok(i >= 0, 'nincs ' + nev + ' a build.js-ben');
  const vege = src.indexOf('\nfunction ', i + 10);
  return src.slice(i, vege > 0 ? vege : src.length);
};
const menu = () => {
  const m = src.match(/<nav class="navbar__nav" id="navMenu">([\s\S]*?)<\/nav>/);
  assert.ok(m, 'nincs főmenü');
  return m[1].split(/\r?\n/).map(s => s.trim()).filter(Boolean);
};

console.log('\n🧪 menu-rolunk');

t('🧭 a főmenü ELSŐ pontja a Hírek, és nincs külön „Kezdd itt”', () => {
  const sorok = menu();
  assert.match(sorok[0], /href="\$\{homePath\}">\$\{T\.news\}</, 'az első menüpont nem a Hírek: ' + sorok[0]);
  assert.ok(!sorok.some(s => s.includes('startPath') || s.includes('nav--star')), '🔴 maradt külön „Kezdd itt” menüpont');
});

t('🧭 a „Rólunk” a menü VÉGÉN van (a feltételes Ko-fi pontok után)', () => {
  const sorok = menu();
  assert.match(sorok.at(-1), /href="\$\{aboutPath\}">\$\{tr\('aboutNav'\)\}</, 'az utolsó menüpont nem a Rólunk: ' + sorok.at(-1));
  assert.equal(sorok.filter(s => s.includes('aboutPath')).length, 1, 'a Rólunk pontosan egyszer');
});

t('🧭 menü 2 (10-18, user: „nem látom se a Prompt-tárat, se a másikat” → „Mindkettő előre”): Hírek · 🔥 Felkapott · Útmutatók · 📋 Prompt-tár · Eszközök …; Archívum a láblécben', () => {
  const sorok = menu();
  // 2026-10-21: az ingyenes eszközök a Prompt-tár TETEJÉN vannak, nem külön menüpontban (user: „a prompttárral vond össze!”)
  const sorrend = ['${T.news}', "/trending\">🔥 ${tr('trNav')}", '${T.guides}', "/prompts\">📋 ${tr('plNavS')}", '${T.tools}', "${tr('glossNav')}"];
  sorrend.forEach((k, i) => assert.ok(sorok[i] && sorok[i].includes(k), `a(z) ${i + 1}. menüpont nem ez: ${k} (hanem: ${sorok[i]})`));
  assert.ok(!sorok.some(s => s.includes('archivePath')), 'az Archívum még a menüben van');
  assert.match(src, /<a href="\$\{archivePath\}">🗂️ \$\{tr\('archNavS'\)\}<\/a>/, 'az Archívum nincs a láblécben');
  assert.equal((src.match(/plNavS: '/g) || []).length, 3, 'a rövid Prompt-tár menüfelirat nem 3 nyelven');
});

t('📄 a Rólunk oldal TETEJÉN a „Kezdd itt” rész, ALATTA a bizalmi kártyák', () => {
  const s = sablon('buildAboutPage');
  const sorrend = ["tr('startTitle')", "'startS2h'", "'startS3h'", 'href="wizard"', 'href="prompts"', 'startPicks(', "tr('aboutTitle')", '${cards}'];
  assert.ok(s.includes("'aboutTeamH'") && s.includes("'aboutAiH'"), 'eltűnt egy bizalmi kártya');
  const torzs = s.slice(s.indexOf('const body'));
  let elozo = -1;
  for (const k of sorrend) {
    const i = torzs.indexOf(k);
    assert.ok(i >= 0, 'hiányzik a Rólunk oldalról: ' + k);
    assert.ok(i > elozo, 'rossz sorrend: ' + k);
    elozo = i;
  }
});

t('📄 a „Mi ez az oldal?” csak EGYSZER szerepel (aboutWho marad, a startS1 kártya nem)', () => {
  const s = sablon('buildAboutPage');
  assert.ok(s.includes("'aboutWhoH'"), 'eltűnt a „Mi az AI World HQ?” kártya (ebben van a nyelvszám)');
  assert.ok(!s.includes("tr('startS1h')"), '🔴 kétszer kérdezi meg, mi ez az oldal');
});

t('🔗 a Rólunk oldal nem linkel a megszűnt /start-ra', () => {
  assert.ok(!/href="start"/.test(sablon('buildAboutPage')), '🔴 önmagára mutató (átirányított) link maradt');
});

t('🗑️ nincs külön start.html és nincs /start a sitemapban', () => {
  assert.ok(!/function buildStartPage\(/.test(src), 'megmaradt a buildStartPage');
  assert.ok(!/'start\.html'/.test(src), '🔴 még íródik start.html');
  assert.ok(!/\$\{lp\}\/start`/.test(src), '🔴 a /start még a sitemapban van');
});

t('↪️ a régi /start (minden élő nyelven) 301-gyel a Rólunk oldalra visz — a 10-17-i könyvtári levelek erre linkelnek', () => {
  assert.match(src, /const startRules = SITE_LANGS\.map\(l => `\$\{langPrefix\(l\)\}\/start \$\{langPrefix\(l\)\}\/about 301`\)/, 'nincs /start → /about szabály');
  const iras = src.match(/writeFileSync\(join\(OUT_DIR, '_redirects'\), `([^`]*)`/);
  assert.ok(iras && iras[1].includes('${startRules}'), '🔴 a szabály nem kerül be a _redirects-be');
});

t('💬 a chatbot GYIK-ja nem a /start-ra küld', () => {
  assert.ok(!/p: '\/start'/.test(src), "🔴 maradt p: '/start' a kb-ben");
  assert.equal((src.match(/p: '\/about'/g) || []).length >= 3, true, 'a kezdő útmutatós GYIK nem a Rólunk oldalra mutat (3 nyelv)');
});

if (hiba) { console.log(`\n❌ menu-rolunk.test: ${hiba} hiba`); process.exit(1); }
console.log('✅ menu-rolunk.test: mind rendben');
