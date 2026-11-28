// /scams gyűjtőoldal (2026-11-27, terv: docs/superpowers/plans/2026-11-21-csalas-figyelo.md 8. rész,
// spec 8.6): papírlapos fejléc → legújabb csalás-hírek → átnézett útmutatók → bejelentő doboz → MI-címke.
// Ingyenes, hálózat nélküli.
import assert from 'node:assert/strict';
import { csalasOldalHtml, csalasFejlecLap, CSALAS_UTMUTATOK, CSALAS_UI, bejelentesNyelven, csalasBorito, csalasRovidMd, csalasTeljesUt } from './csalas-oldal.js';
import { peldaBlokk } from './csalas-sablon.js';
import { BEJELENTES, ORSZAGFUGGETLEN } from './csalas-vedekezes.js';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };
console.log('\n🧪 csalas-oldal (/scams gyűjtőoldal)');

const HIRDETES = '<aside class="ad-slot" aria-label="Ad">X</aside>';
const FEJLEC = '<section class="lh-hero"><h1 class="lh-h1">Scam alerts</h1></section>';
const sz = l => CSALAS_UI[l];
const UT = [{ slug: 'how-to-spot-a-phishing-email-or-scam-text-before-you-click', title: 'How to spot a phishing email' }];
const H1 = { slug: 'regi-csalas', title: 'Old scam', summary: 'Old one.', kep: '/assets/images/csalas/regi-csalas-en.jpg', datum: '2026-11-20T10:00:00Z' };
const H2 = { slug: 'uj-csalas', title: 'New scam', summary: 'New one.', kep: '', datum: '2026-11-26T10:00:00Z' };
const oldal = (hirek, lang = 'en') => csalasOldalHtml({
  hirek, utmutatok: UT, sz: sz(lang), bejelentes: bejelentesNyelven(lang), hirdetes: HIRDETES, fejlec: FEJLEC,
});
const db = (s, re) => (s.match(re) || []).length;

t('🕳️ 0 hírrel is teljes: útmutató-szakasz, bejelentő doboz, üres-szöveg', () => {
  const h = oldal([]);
  assert.ok(h.includes(sz('en').scEmpty), 'nincs scEmpty');
  assert.ok(h.includes('article/how-to-spot-a-phishing-email-or-scam-text-before-you-click'), 'nincs útmutató-link');
  assert.ok(h.includes('class="sc-report"'), 'nincs bejelentő doboz');
});

t('🆕 2 hírnél a legújabb van elöl', () => {
  const h = oldal([H1, H2]);
  assert.ok(h.indexOf('scams/uj-csalas') > -1 && h.indexOf('scams/uj-csalas') < h.indexOf('scams/regi-csalas'));
  assert.ok(!h.includes(sz('en').scEmpty), 'hír mellett nincs üres-szöveg');
});

t('🔠 pontosan 1 <h1 (a fejlécből) és pontosan 1 hirdetés-hely', () => {
  for (const hirek of [[], [H1, H2]]) {
    const h = oldal(hirek);
    assert.equal(db(h, /<h1[\s>]/g), 1);
    assert.equal(db(h, /class="ad-slot"/g), 1);
  }
});

t('🚨 a bejelentő dobozban ic3.gov + reportfraud.ftc.gov + országfüggetlen mondat', () => {
  const h = oldal([]);
  const doboz = h.slice(h.indexOf('class="sc-report"'));
  assert.ok(doboz.includes('href="https://www.ic3.gov"'));
  assert.ok(doboz.includes('href="https://reportfraud.ftc.gov"'));
  assert.ok(doboz.includes(ORSZAGFUGGETLEN));
});

t('🌐 hu/es: a bejelentő doboz és a feliratok a saját nyelven (angol mondat nincs)', () => {
  for (const l of ['hu', 'es']) {
    const h = oldal([], l);
    assert.ok(!h.includes(ORSZAGFUGGETLEN), l + ': angol országfüggetlen mondat');
    assert.ok(!h.includes(BEJELENTES[0].nev), l + ': angol IC3-név');
    assert.ok(h.includes(sz(l).scCountry));
    for (const k of Object.keys(CSALAS_UI.en)) {
      assert.ok(CSALAS_UI[l][k], `${l}.${k} hiányzik`);
      assert.notEqual(CSALAS_UI[l][k], CSALAS_UI.en[k], `${l}.${k} angol maradt`);
    }
  }
});

t('🏷️ a feliratok a terv szerint', () => {
  assert.equal(CSALAS_UI.en.scNav, 'Scams'); assert.equal(CSALAS_UI.hu.scNav, 'Csalások'); assert.equal(CSALAS_UI.es.scNav, 'Estafas');
  assert.equal(CSALAS_UI.en.scTitle, 'Scam alerts'); assert.equal(CSALAS_UI.hu.scTitle, 'Csalás-figyelő'); assert.equal(CSALAS_UI.es.scTitle, 'Alertas de estafas');
  assert.equal(CSALAS_UI.en.scBadge, 'Scam alert'); assert.equal(CSALAS_UI.hu.scBadge, 'Csalásriasztás'); assert.equal(CSALAS_UI.es.scBadge, 'Alerta de estafa');
});

t('🤖 EU AI Act: MI-címke az oldalon', () => {
  assert.ok(oldal([]).includes('class="ai-disclosure"'));
});

t('🖼️ kép csak ha van; alt-szöveg a cím + „nem valódi” jelölés; escape', () => {
  const h = oldal([H1, { ...H2, title: 'A <b> & "x"' }]);
  assert.ok(h.includes('src="/assets/images/csalas/regi-csalas-en.jpg"'));
  assert.ok(h.includes(`alt="Old scam — ${sz('en').scImgAlt}"`));
  assert.equal(db(h, /<img /g), 1);
  assert.ok(h.includes('A &lt;b&gt; &amp; &quot;x&quot;') && !h.includes('<b>'));
});

t('📄 fejléc-lap: van friss képes hír → a képe; nincs → a bejelentő lista', () => {
  const kepes = csalasFejlecLap({ hirek: [H2, H1], sz: sz('en'), bejelentes: bejelentesNyelven('en') });
  assert.ok(kepes.includes('class="lh-lap"') && kepes.includes('regi-csalas-en.jpg') && kepes.includes('scams/regi-csalas'));
  const ures = csalasFejlecLap({ hirek: [H2], sz: sz('en'), bejelentes: bejelentesNyelven('en') });
  assert.ok(ures.includes('https://www.ic3.gov') && !ures.includes('<img'));
  assert.ok(!/<h1[\s>]/.test(kepes + ures));
});

t('📚 CSALAS_UTMUTATOK: a 9. részben átnézett 5 útmutató (a „pasting it into an AI” nélkül)', () => {
  assert.equal(CSALAS_UTMUTATOK.length, 5);
  assert.equal(new Set(CSALAS_UTMUTATOK).size, 5);
  assert.ok(!CSALAS_UTMUTATOK.some(s => /past/.test(s)));
});

t('🖼️ csalasBorito: hu/es oldalon a nyelvi 16:9 borító, ha létezik; különben a régi', () => {
  const van = new Set(['csalas/x-hu-16x9.jpg']);
  const letezik = p => van.has(p);
  assert.equal(csalasBorito({ slug: 'x', image: 'x.jpg' }, 'hu', letezik), 'csalas/x-hu-16x9.jpg');
  assert.equal(csalasBorito({ slug: 'x', image: 'x.jpg' }, 'es', letezik), 'x.jpg');
  assert.equal(csalasBorito({ slug: 'x', image: 'x.jpg' }, 'en', letezik), 'x.jpg');
});

t('📚 CSALAS_UTMUTATOK minden slugja létező, átnézett (fact_human_ok) útmutató', () => {
  const dir = join(ROOT, 'content', 'articles');
  const meta = readdirSync(dir).filter(f => f.startsWith('ARTICLE_GUIDE_') && f.endsWith('.json'))
    .map(f => JSON.parse(readFileSync(join(dir, f), 'utf-8'))._meta || {});
  for (const s of CSALAS_UTMUTATOK) {
    const m = meta.find(x => x.slug === s);
    assert.ok(m, `nincs ilyen útmutató: ${s}`);
    assert.ok(m.fact_human_ok, `nincs átnézve: ${s}`);
  }
});

t('🔌 build.js: menüpont, lábléc, scams.html, sitemap-sor és a /scams-link CSAK a kapcsoló mögött', () => {
  const b = readFileSync(join(ROOT, 'website', 'build.js'), 'utf-8');
  const sorok = b.split(/\r?\n/).filter(s => /\/scams|scams\.html|buildScamsPage\(loc\)/.test(s) && !/^\s*\/\//.test(s) && !/^\s*function /.test(s) && !/pagePath: 'scams\.html'/.test(s));   // a buildScamsPage belseje: csak bekapcsolva hívódik
  assert.ok(sorok.length >= 5, 'túl kevés /scams-sor: ' + sorok.length);
  for (const s of sorok) assert.ok(/CSALAS_FIGYELO_BE/.test(s), 'kapcsoló nélküli sor: ' + s.trim());
});

// 11-28 ELŐNÉZET-LELET (390 px): a cikkfej-kép fix 340 px magas + object-fit: cover → mobilon négyzet, és a SZÖVEGES
// 16:9-es csalás-borító két széle lemaradt („What this sca…”, „Pressure to hurr…”). Csalás-hírnél 16:9 doboz, nem vág.
t('📱 csalás-hír cikkfej-képe mobilon sem vág (16:9 doboz, contain)', () => {
  const b = readFileSync(join(ROOT, 'website', 'build.js'), 'utf8');
  assert.match(b, /coverHtml\(a, '\.\.\/', a\.csalas \? 'article__cover article__cover--csalas' : 'article__cover', true\)/);
  const css = readFileSync(join(ROOT, 'website', 'assets', 'style.css'), 'utf8');
  assert.match(css, /\.article__cover--csalas\s*\{[^}]*height:\s*auto[^}]*aspect-ratio:\s*16\s*\/\s*9/);
  assert.match(css, /\.article__cover--csalas img\s*\{[^}]*object-fit:\s*contain/);
});

// ── 12. rész (11-28): rövid hír a Hírek között, teljes leírás a /scams/<slug> oldalon ──
const VALODI = JSON.parse(readFileSync(join(ROOT, 'core', 'fixtures', 'csalas-ic3-valasztas.json'), 'utf8'));
const h2k = md => md.split('\n').filter(s => /^##\s/.test(s));

t('✂️ rövid hír (valódi en/hu/es fordítás): a 3. H2 előtt vág — a példa + 3 jel marad, a védekezés nem', () => {
  for (const l of ['en', 'hu', 'es']) {
    const teljes = VALODI[l];
    const rovid = csalasRovidMd(teljes);
    assert.deepEqual(h2k(rovid), h2k(teljes).slice(0, 2), `${l}: nem az első két fejezet`);
    assert.ok(/^#\s/m.test(rovid), `${l}: nincs H1`);
    assert.ok(rovid.includes(teljes.match(/^>\s*\*\*[^*]+\*\*.*$/m)[0]), `${l}: nincs „In short” sor`);
    const p = peldaBlokk(rovid);
    assert.ok(p, `${l}: nincs példablokk`);
    assert.equal(p.magyarazat.length, 3, `${l}: nem 3 jel-magyarázat`);
    assert.deepEqual(p, peldaBlokk(teljes), `${l}: a példa nem azonos a teljes cikkével`);
    assert.ok(rovid.length < teljes.length * 0.65, `${l}: nem rövidebb érdemben (${rovid.length}/${teljes.length})`);
    assert.ok(!rovid.includes(h2k(teljes)[2]), `${l}: benne van a védekezés-fejezet`);
    assert.ok(teljes.startsWith(rovid.trimEnd()), `${l}: nem a cikk eleje`);
  }
});

t('✂️ rövid hír: sablon nélküli szöveg (kevesebb mint 3 H2) érintetlen; kódblokkban lévő ## nem számít', () => {
  const ket = '# T\n\n> **In short:** x\n\n## A\n\nx\n\n## B\n\ny\n';
  assert.equal(csalasRovidMd(ket), ket);
  const kod = '# T\n\n## A\n\n```\n## nem fejléc\n```\n\n## B\n\nb\n\n## C\n\nc\n';
  assert.equal(csalasRovidMd(kod), '# T\n\n## A\n\n```\n## nem fejléc\n```\n\n## B\n\nb\n');
  assert.equal(csalasRovidMd(''), '');
  assert.equal(csalasRovidMd(null), '');
});

t('🔗 a /scams kártyái és a fejléc-lap a TELJES oldalra (/scams/<slug>) mutatnak, nem a rövid hírre', () => {
  assert.equal(csalasTeljesUt('abc'), 'scams/abc');
  const h = oldal([H1, H2]);
  assert.ok(!/href="article\/(uj|regi)-csalas"/.test(h), 'a kártya még a rövid hírre mutat');
  assert.ok(h.includes('href="scams/uj-csalas"') && h.includes('href="scams/regi-csalas"'));
  assert.ok(h.includes('href="article/how-to-spot-a-phishing-email-or-scam-text-before-you-click"'), 'az útmutató-link nem article/');
});

t('🌐 a teljes-oldal gomb felirata hu/es nyelven nem angol', () => {
  for (const k of ['scFull']) {
    assert.ok(CSALAS_UI.en[k] && CSALAS_UI.hu[k] && CSALAS_UI.es[k], `hiányzó ${k}`);
    assert.notEqual(CSALAS_UI.hu[k], CSALAS_UI.en[k]);
    assert.notEqual(CSALAS_UI.es[k], CSALAS_UI.en[k]);
  }
});

// 🛡️ CSALÁS-ARCHÍV (2026-11-28): a 2026-ban már közzétett figyelmeztetések KÜLÖN szakaszban, a friss hírek alatt,
// az eredeti forrásdátummal („FBI warning · …”) — hogy régi figyelmeztetés ne látsszon friss hírnek.
const A1 = { slug: 'archiv-rendor', title: 'Fake police', summary: 'Old warning.', kep: '/assets/images/csalas/archiv-rendor-en.jpg', datum: '2026-09-17', forras: 'FBI' };
const A2 = { slug: 'archiv-ic3', title: 'Fake IC3', summary: 'Older warning.', kep: '', datum: '2026-07-20', forras: 'FBI' };

t('🗂️ archív: külön „korábbi” szakasz a friss hírek ALATT, forrásdátummal', () => {
  const h = oldal([A2, H1, A1]);
  const korabbi = h.indexOf(sz('en').scEarlier);
  assert.ok(korabbi > -1, 'nincs scEarlier szakasz');
  assert.ok(h.indexOf('scams/regi-csalas') < korabbi, 'a friss hír a korábbiak FÖLÖTT');
  assert.ok(h.indexOf('scams/archiv-rendor') > korabbi && h.indexOf('scams/archiv-ic3') > korabbi);
  assert.ok(h.indexOf('scams/archiv-rendor') < h.indexOf('scams/archiv-ic3'), 'a korábbiak közt is az újabb elöl');
  assert.ok(h.includes('FBI warning · 2026-09-17'), 'nincs „FBI warning · dátum”');
  assert.ok(!h.includes(sz('en').scEmpty), 'friss hír mellett nincs üres-szöveg');
});

t('🗂️ archív: friss hír nélkül az üres-szöveg marad, alatta a korábbiak', () => {
  const h = oldal([A1]);
  assert.ok(h.includes(sz('en').scEmpty));
  assert.ok(h.indexOf(sz('en').scEmpty) < h.indexOf(sz('en').scEarlier));
  assert.equal(db(h, /<h1[\s>]/g), 1);
  assert.equal(db(h, /class="ad-slot"/g), 1);
});

t('🗂️ archív: nincs archív elem → nincs „korábbi” szakasz', () => {
  assert.ok(!oldal([H1, H2]).includes(sz('en').scEarlier));
});

t('🌐 archív feliratok hu/es nyelven, {f} helyén a forrás', () => {
  assert.equal(CSALAS_UI.hu.scWarnFrom.replace('{f}', 'FBI'), 'FBI-figyelmeztetés');
  assert.equal(CSALAS_UI.es.scWarnFrom.replace('{f}', 'FBI'), 'Aviso de FBI');
  assert.ok(oldal([A1], 'hu').includes('FBI-figyelmeztetés · 2026-09-17'));
  for (const l of ['hu', 'es']) assert.notEqual(CSALAS_UI[l].scEarlier, CSALAS_UI.en.scEarlier);
});

if (hiba) { console.log(`\n❌ csalas-oldal: ${hiba} hiba`); process.exit(1); }
console.log('✅ csalas-oldal: minden eset zöld');
