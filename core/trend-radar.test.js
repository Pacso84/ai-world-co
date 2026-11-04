// core/trend-radar.js — a heti trend-radar (/trending, 2026-10-18; user: „igen” a heti trend-radarra).
// Ingyenes, hálózat nélküli.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { rovidOsszefoglalo, trendRadar, trendRadarHtml, ujraFelkapott, hirdetesHely, HET_NAP } from './trend-radar.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAP = 864e5;
const MOST = Date.parse('2026-10-18T12:00:00Z');
let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };
const SZ = { cim: 'What people are asking AI this week', tag: 'Tag', het: 'This week', ujra: 'Trending again',
  kerestek: 'People searched:', ures: 'Check back tomorrow.', masol: 'Copy', masolva: 'Copied!', utmutato: 'Open the guide',
  db: n => 'Answered this week: ' + n };
const AD = '<aside class="ad-slot">AD</aside>';
const nap = n => new Date(MOST - n * NAP).toISOString();
const cikk = (n, extra = {}) => ({ slug: 'g' + n, title: 'Guide ' + n, kifejezes: 'phrase ' + n, tool: 'Gemini', publishedAt: nap(n),
  md: '# Guide\n\n> **In short:** Short answer ' + n + '.\n\n## Step 1', mdEn: '', ...extra });

console.log('\n🧪 trend-radar');

t('📝 az összefoglaló a cikk ELSŐ idézet-blokkja — a címke nyelvétől függetlenül (a fordító lefordítja)', () => {
  assert.equal(rovidOsszefoglalo('# Cím\n\n> **In short:** Gemini can do it.\n\nText'), 'Gemini can do it.');
  assert.equal(rovidOsszefoglalo('> **Röviden:** A Gemini meg tudja csinálni.\n\nSzöveg'), 'A Gemini meg tudja csinálni.');
  assert.equal(rovidOsszefoglalo('# T\n\n> **En resumen:** Sí.\n> Segunda línea.'), 'Sí. Segunda línea.');
  assert.equal(rovidOsszefoglalo('# T\n\nNo quote here.'), '');
  assert.equal(rovidOsszefoglalo(null), '');
  assert.ok(rovidOsszefoglalo('> **In short:** ' + 'word '.repeat(120)).length <= 201, 'hosszú összefoglaló vágva');
});

t('📝 a kártyán az ELSŐ mondat elég, ha önmagában értelmes (10-18 előnézet: 3 mondat túl hosszú kártyát adott)', () => {
  const a = 'Gemini can turn a casual selfie into a clean professional headshot with one prompt.';
  assert.equal(rovidOsszefoglalo(`> **In short:** ${a} The result is AI-generated, so treat it as a starting point.`), a);
  assert.equal(rovidOsszefoglalo('> **In short:** Yes. You can.'), 'Yes. You can.', 'túl rövid első mondatnál marad az egész');
});

t('📅 CSAK A HÉT (user 10-18: „ha letelik a hét, kerüljön le végleg”): a 7 naptári nap tételei, legújabb elöl; régebbi NEM látszik', () => {
  const r = trendRadar([cikk(9), cikk(1), cikk(5), cikk(30), cikk(3, { kifejezes: '' }), cikk(7)], { now: MOST });
  assert.deepEqual(r.het.map(x => x.slug), ['g1', 'g5'], '1 és 5 napos látszik, újabb elöl; 7+ napos és kifejezés nélküli nem');
  assert.equal(r.korabbi, undefined, 'nincs „korábbi trendek” rész');
  assert.equal(r.het[0].rovid, 'Short answer 1.');
  assert.equal(HET_NAP, 7);
});

t('🔁 „ha megint trend lesz, visszakerül”: a régi útmutató a MAI trendlista alapján a mai napnál, jelölve', () => {
  const regi = cikk(20, { kifejezes: 'gemini prompt for professional headshot' });
  const masik = cikk(25, { kifejezes: 'chatgpt resume bullet points' });
  const r = trendRadar([cikk(2), regi, masik], { now: MOST, mai: ['gemini prompt for professional photo headshot', 'ai trends'] });
  assert.deepEqual(r.het.map(x => x.slug), ['g20', 'g2'], 'az újra felkapott a mai napnál, elöl; a nem felkapott régi nem látszik');
  assert.equal(r.het[0].ujra, true); assert.equal(r.het[0].nap, '2026-10-18');
  assert.equal(r.napok.at(-1).slug, 'g20', 'a mai pötty is telik');
  assert.equal(trendRadar([regi], { now: MOST }).het.length, 0, 'mai lista nélkül nem kerül vissza');
  const h = trendRadarHtml(r, { sz: SZ });
  assert.ok(h.includes('<p class="tr-again">Trending again</p>'), 'látszik, hogy újra felkapott');
});

t('🔁 újra-felkapott szabály: szó szerint, vagy rokon + legalább 2 közös tartalmas szó (egy szó kevés)', () => {
  assert.equal(ujraFelkapott('Can AI help me write a book', 'can ai help me write a book'), true);
  assert.equal(ujraFelkapott('gemini prompt for professional photo', 'gemini prompt for professional headshot'), true);
  assert.equal(ujraFelkapott('ai trends', 'google photo trends for girls'), false, 'egy közös szó („trends”) nem elég');
  assert.equal(ujraFelkapott('chatgpt paraphrase', 'chatgpt resume bullet points'), false);
});

t('📋 prompt: az ANGOL szövegből az első ÖNÁLLÓ prompt (folytatás nem); ha nincs, null', () => {
  const md = '💬 Example: "Now make it shorter and add a closing line for the whole team please."\n\n'
    + '💬 Example:\n\n```\nWrite a short, friendly status update for my team about the website redesign.\n```';
  const r = trendRadar([cikk(1, { mdEn: md }), cikk(2)], { now: MOST });
  assert.equal(r.het[0].prompt, 'Write a short, friendly status update for my team about the website redesign.');
  assert.equal(r.het[1].prompt, null);
});

t('🧱 HTML: kereső-kifejezés, cím, link, összefoglaló; Copy gomb CSAK ha van prompt; minden escape-elve', () => {
  const r = trendRadar([cikk(1, { kifejezes: 'ai <b>photo</b> trends', mdEn: '💬 Example:\n\n```\nWrite a polite email asking my landlord to fix the heating this week.\n```' }), cikk(2)], { now: MOST });
  const h = trendRadarHtml(r, { sz: SZ, datum: s => s.slice(0, 10) });
  assert.ok(h.includes('ai &lt;b&gt;photo&lt;/b&gt; trends') && !h.includes('<b>photo'), 'a kereső-kifejezés escape-elve');
  assert.ok(h.includes('href="article/g1"') && h.includes('Guide 1'));
  assert.ok(h.includes('Short answer 1.'));
  assert.equal((h.match(/class="pl-copy"/g) || []).length, 1, 'egy prompt → egy Copy gomb');
  assert.ok(h.includes('This week'));
});

t('🎨 dizájn (10-18): fent a HÉT 7 NAPJA (nem keresőmező — user: „a kereső minek, egy hetet ölel át!”), alatta a napló', () => {
  const r = trendRadar([cikk(1, { kifejezes: 'Can AI Help Me Write A Book' }), cikk(3), cikk(10)], { now: MOST });
  const h = trendRadarHtml(r, { sz: SZ, datum: s => s.slice(5, 10), hetnap: () => 'Sunday' });
  assert.ok(!/tr-field|trType|<input/.test(h), '🔴 keresésnek látszó mező (nem lehet benne keresni)');
  assert.equal(r.napok.length, 7, 'a sáv 7 napot mutat');
  assert.equal(r.napok.at(-1).kulcs, '2026-10-18', 'az utolsó nap a mai');
  assert.equal((h.match(/<li class="tr-w7">/g) || []).length, 5, '5 nap trend-útmutató nélkül');
  assert.equal((h.match(/<li class="tr-w7 tr-w7--van"><a href="#d-2026-10-1[57]">/g) || []).length, 2, 'a 2 trendes nap linkel a napló-sorra');
  assert.ok(h.includes('id="d-2026-10-17"') && h.includes('id="d-2026-10-15"'), 'a napló-soroknak van horgonya');
  assert.ok(h.includes('10-12 – 10-18'), 'a hét dátumtartománya');
  assert.ok(h.includes('>can ai help me write a book</span>'), 'a keresés kisbetűvel, ahogy beírják');
  assert.equal((h.match(/<li class="tr-day"/g) || []).length, 2, 'a héten 2 napló-sor (a 10 napos nem)');
  assert.ok(h.includes('Answered this week: 2'));
  assert.ok(h.includes('Sunday'), 'a hét napja a napló-sorban');
});

t('🖼️ képek (10-18, user: „nézzük meg képekkel”): borítókép a napló-sorban; kép nélkül nincs üres keret', () => {
  const r = trendRadar([cikk(1, { kep: '/assets/images/g1.jpg' }), cikk(2)], { now: MOST });
  const h = trendRadarHtml(r, { sz: SZ });
  assert.match(h, /<a class="tr-img" href="article\/g1" tabindex="-1" aria-hidden="true"><img src="\/assets\/images\/g1\.jpg" alt="" width="1280" height="720" loading="lazy" decoding="async"><\/a>/,
    'a kép link (a cím mellett ugyanoda visz → a felolvasónak nem ismételjük), lusta betöltéssel, méretezve');
  assert.equal((h.match(/class="tr-img"/g) || []).length, 1, 'a kép nélküli tételnél nincs üres keret');
  assert.equal(r.het[0].kep, '/assets/images/g1.jpg');
});

t('📢 hirdetés (user 10-18: „ide is rakjunk hirdetést!”): EGY, két napló-sor KÖZÉ a ~40%-nál; egy sornál a lista alá', () => {
  assert.deepEqual([0, 1, 2, 3, 5, 7].map(hirdetesHely), [0, 0, 1, 1, 2, 3]);
  const h3 = trendRadarHtml(trendRadar([cikk(1), cikk(2), cikk(3)], { now: MOST }), { sz: SZ, hirdetes: AD });
  assert.equal(h3.split(AD).length - 1, 1, 'pontosan egy hirdetés');
  const i = h3.indexOf(AD);
  assert.ok(i > h3.indexOf('href="article/g1"') && i < h3.indexOf('href="article/g2"'), 'az 1. és a 2. sor között');
  assert.ok(h3.includes(`<li class="tr-ad">${AD}</li>`), 'a listában saját sorban (nem egy tételen belül)');
  const h1 = trendRadarHtml(trendRadar([cikk(1)], { now: MOST }), { sz: SZ, hirdetes: AD });
  assert.equal(h1.split(AD).length - 1, 1); assert.ok(h1.indexOf(AD) > h1.indexOf('</ol>'), 'egy sornál a lista alatt');
  assert.ok(!trendRadarHtml(trendRadar([], { now: MOST }), { sz: SZ, hirdetes: AD }).includes(AD), 'üres oldalra nem');
});

t('🫙 üres héten: barátságos üzenet, nem üres oldal', () => {
  const h = trendRadarHtml(trendRadar([], { now: MOST }), { sz: SZ, datum: s => s });
  assert.ok(h.includes('Check back tomorrow.'));
});

t('📊 VALÓDI adat: a mai cikkekből a hét trend-útmutatói, mindnek van összefoglalója', () => {
  const D = join(ROOT, 'content', 'articles');
  const cikkek = readdirSync(D).filter(f => f.startsWith('ARTICLE_GUIDE_')).map(f => {
    const j = JSON.parse(readFileSync(join(D, f), 'utf-8'));
    const md = String(j.article_markdown || '').replace(/^---[\s\S]*?\n---\n/, '');
    return { slug: j._meta?.slug, title: j._meta?.slug, kifejezes: j._meta?.trend?.kifejezes || '', tool: j._meta?.tool || '',
      publishedAt: j._meta?.published_at || '', md, mdEn: md };
  });
  const r = trendRadar(cikkek, { now: Date.now() });
  console.log(`     📏 a héten ${r.het.length} · összefoglalóval ${r.het.filter(x => x.rovid).length}`);
  assert.ok(r.het.every(x => x.rovid), 'minden trend-útmutatónak van összefoglalója');
});

t('🔌 build.js: oldal 3 nyelven, sitemap, lábléc-link, link a trend-útmutatók végén, mai lista + hirdetés, feliratok 3 nyelven', () => {
  const b = readFileSync(join(ROOT, 'website', 'build.js'), 'utf-8');
  assert.match(b, /import \{ trendRadar, trendRadarHtml \} from '\.\.\/core\/trend-radar\.js'/);
  assert.match(b, /import \{ aktivTrendek \} from '\.\.\/core\/trend-kutato\.js'/);
  assert.match(b, /writeFileSync\(join\(outBase, 'trending\.html'\), buildTrendingPage\(articles, loc\)/);
  assert.match(b, /sitemapUrls\.push\(\{ loc: `\$\{SITE\.url\}\$\{lp\}\/trending`/);
  assert.match(b, /<a href="\$\{LP\}\/trending">🔥 \$\{tr\('trBanner'\)\}<\/a>/, 'nincs lábléc-link');
  assert.match(b, /\$\{a\.trend \? `<p class="tr-more"><a href="\.\.\/trending">/, 'nincs link a trend-útmutatók végén');
  assert.match(b, /trendKif: data\._meta\?\.trend\?\.kifejezes \|\| ''/, 'a cikk-objektum nem kapja meg a kereső-kifejezést');
  assert.match(b, /\}\)\), \{ mai \}\);/, 'a mai trendlista nem jut el a radarhoz');
  assert.match(b, /hirdetes: hirdetesBlokk\(HIRDETES, LANG\)/, 'nincs hirdetés a trend-oldalon');
  for (const k of ['trNav', 'trTitle', 'trTag', 'trCount', 'trRead', 'trWeek', 'trAgain', 'trSearched', 'trEmpty', 'trBanner', 'trMore'])
    assert.equal((b.match(new RegExp(k + ': ', 'g')) || []).length, 3, `${k}: nem pontosan 3 nyelven`);
  assert.equal((b.match(/trEarlier: /g) || []).length, 0, 'a „korábbi trendek” felirat megszűnt');
});

t('🎨 style.css: a radar osztályai megvannak', () => {
  const css = readFileSync(join(ROOT, 'website', 'assets', 'style.css'), 'utf-8');
  for (const o of ['.tr-hero', '.tr-weekbar', '.tr-week7', '.tr-w7-dot', '.tr-range', '.tr-log', '.tr-day', '.tr-when', '.tr-q', '.tr-answer', '.tr-t', '.tr-s', '.tr-prompt', '.tr-foot', '.tr-img', '.tr-again', '.tr-ad', '.tr-more'])
    assert.ok(css.includes(o + ' ') || css.includes(o + '{') || css.includes(o + ','), 'hiányzik: ' + o);
});

if (hiba) { console.log(`\n❌ trend-radar.test: ${hiba} hiba`); process.exit(1); }
console.log('✅ trend-radar.test: mind rendben');
