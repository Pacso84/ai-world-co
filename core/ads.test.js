// core/ads.js — a hirdetés-kapcsoló (2026-10-01, user: „rakjunk ki reklámokat").
// Ingyenes, hálózat nélküli.
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readdirSync } from 'fs';
import { marked } from 'marked';
import { hirdetesBeallitas, fejKod, hirdetesBlokk, adsTxt, CIMKE, URES_VARAS_MS, hirdetesHirbe, hirdetesLepesek, lepesHirdetesHely } from './ads.js';
import { midStepNo, masodikStepNo } from './mid-guide.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };

const KLIENS = 'ca-pub-1234567890123456';
console.log('\n🧪 ads');

t('🔒 alapból KI: üres / hiányzó beállítás → semmi', () => {
  for (const web of [undefined, {}, { ads: {} }, { ads: { enabled: false, client: KLIENS, slot: '123' } }]) {
    const h = hirdetesBeallitas(web);
    assert.equal(h.be, false);
    assert.equal(fejKod(h), '');
    assert.equal(hirdetesBlokk(h, 'en'), '');
    assert.equal(adsTxt(h), '');
  }
});

t('🔒 hibás azonosítóval NEM kapcsol be (elgépelés ne vigyen ki törött kódot)', () => {
  for (const client of ['pub-1234567890123456', 'ca-pub-12', 'ca-pub-123456789012345a', ' ', '"><script>']) {
    assert.equal(hirdetesBeallitas({ ads: { enabled: true, client } }).be, false, client);
  }
});

t('1. szakasz (csak azonosító): fejléc-kód + ads.txt, de LÁTHATÓ hirdetés még nincs', () => {
  const h = hirdetesBeallitas({ ads: { enabled: true, client: KLIENS } });
  assert.equal(h.be, true);
  const fej = fejKod(h);
  assert.match(fej, /pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js\?client=ca-pub-1234567890123456/);
  assert.match(fej, /async/);
  assert.match(fej, /<meta name="google-adsense-account" content="ca-pub-1234567890123456">/);
  assert.equal(hirdetesBlokk(h, 'en'), '', 'hirdetés-egység (slot) nélkül nem rakunk ki üres dobozt');
  assert.equal(adsTxt(h), 'google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n');
});

t('2. szakasz (azonosító + egység): EGY blokk, jelölve, a saját nyelvén', () => {
  const h = hirdetesBeallitas({ ads: { enabled: true, client: KLIENS, slot: '9876543210' } });
  for (const lang of ['en', 'hu', 'es']) {
    const b = hirdetesBlokk(h, lang);
    assert.equal((b.match(/<ins /g) || []).length, 1, 'pontosan egy hirdetés-egység');
    assert.match(b, /data-ad-client="ca-pub-1234567890123456"/);
    assert.match(b, /data-ad-slot="9876543210"/);
    assert.ok(b.includes(CIMKE[lang]), lang + ': a hirdetés jelölve van');
  }
  assert.notEqual(CIMKE.en, CIMKE.hu);
  assert.equal(hirdetesBlokk(h, 'xx').includes(CIMKE.en), true, 'ismeretlen nyelv → angol címke');
});

t('🫥 10-14: ÜRES DOBOZ NEM MARAD — töltve látszik; „unfilled” vagy 8 mp csend után eltűnik', () => {
  // 10-14 élőben: a személyazonosság-igazolásig a Google 280 px-t foglalt, de hirdetést
  // nem küldött → minden cikk alján üres „ADVERTISEMENT” sáv. A doboz-kód futtatva:
  const h = hirdetesBeallitas({ ads: { enabled: true, client: KLIENS, slot: '9876543210' } });
  const kod = (hirdetesBlokk(h, 'en').match(/<script>(\(function\(a\)[\s\S]*?)<\/script>/) || [])[1];
  assert.ok(kod, 'nincs láthatóság-kezelő a dobozban');
  const futtat = () => {
    const osztaly = new Set(), attr = {};
    let mo = null, io = null, idozito = null;
    const ins = { getAttribute: k => attr[k] ?? null };
    const aside = { querySelector: () => ins, classList: { add: c => osztaly.add(c), remove: c => osztaly.delete(c), contains: c => osztaly.has(c) } };
    function MO(cb) { mo = cb; this.observe = () => {}; }
    function IO(cb) { io = cb; this.observe = () => {}; this.disconnect = () => {}; }
    new Function('window', 'document', 'setTimeout', 'MutationObserver', 'IntersectionObserver', kod)(
      { MutationObserver: MO, IntersectionObserver: IO }, { currentScript: { parentNode: aside } },
      (f, ms) => { idozito = { f, ms }; }, MO, IO);
    return { osztaly, attr, valt: () => mo(), lathato: () => io([{ isIntersecting: true }]), ido: () => idozito };
  };
  const tele = futtat(); tele.lathato(); tele.attr['data-ad-status'] = 'filled'; tele.valt(); tele.ido().f();
  assert.ok(tele.osztaly.has('ad-slot--tele') && !tele.osztaly.has('ad-slot--ures'), '🔴 a megérkezett hirdetés eltűnt');
  const csend = futtat(); csend.lathato();
  assert.equal(csend.ido().ms, URES_VARAS_MS);
  csend.ido().f();
  assert.ok(csend.osztaly.has('ad-slot--ures'), '🔴 hirdetés nélkül is ott marad az üres doboz');
  const nincs = futtat(); nincs.attr['data-ad-status'] = 'unfilled'; nincs.valt();
  assert.ok(nincs.osztaly.has('ad-slot--ures'), '🔴 a Google „nincs hirdetés” jelzése után is látszik');
  nincs.attr['data-ad-status'] = 'filled'; nincs.valt();
  assert.ok(nincs.osztaly.has('ad-slot--tele') && !nincs.osztaly.has('ad-slot--ures'), '🔴 a később megjött hirdetés rejtve marad');
  const css = readFileSync(join(ROOT, 'website', 'assets', 'style.css'), 'utf-8');
  assert.match(css, /\.ad-slot--ures \{ display: none; \}/, 'a stílus nem rejti el az üres dobozt');
  assert.match(css, /\.ad-slot__label \{[^}]*visibility: hidden;/, 'a címke hirdetés nélkül is látszik');
  assert.match(css, /\.ad-slot--tele \.ad-slot__label \{ visibility: visible; \}/, '🔴 a hirdetés CÍMKE NÉLKÜL jelenne meg');
});

t('🔒 nem számjegyes egység-azonosító → nincs blokk', () => {
  const h = hirdetesBeallitas({ ads: { enabled: true, client: KLIENS, slot: '12ab' } });
  assert.equal(h.be, true);
  assert.equal(hirdetesBlokk(h, 'en'), '');
});

t('🔌 a config.json-ban a kapcsoló KI van, amíg a user azonosítót nem ad', () => {
  const cfg = JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf-8'));
  assert.ok(cfg.website && cfg.website.ads, 'website.ads blokk létezik');
  assert.equal(typeof cfg.website.ads.enabled, 'boolean');
});

t('🔗 be van kötve: a build.js a core/ads.js-t használja (fej, cikk-alj, ads.txt)', () => {
  const b = readFileSync(join(ROOT, 'website', 'build.js'), 'utf-8');
  assert.ok(/from '\.\.\/core\/ads\.js'/.test(b), 'import hiányzik');
  assert.ok(/fejKod\(HIRDETES\)/.test(b), 'fejléc-kód nincs bekötve');
  assert.ok((b.match(/hirdetesBlokk\(HIRDETES, LANG\)/g) || []).length >= 2, 'hír- ÉS útmutató-oldalon is');
  assert.ok(/adsTxt\(HIRDETES\)/.test(b), 'ads.txt nincs bekötve');
});

t('🔒 /privacy: minden szöveg mindhárom nyelven, a hirdetés-kártya CSAK bekapcsolva', () => {
  const b = readFileSync(join(ROOT, 'website', 'build.js'), 'utf-8');
  const blokk = b.slice(b.indexOf('const UI_PRIV = {'), b.indexOf('for (const l of SITE_LANGS) Object.assign(UI[l], UI_PRIV'));
  const kulcsok = ['privNav', 'privTitle', 'privTag', 'privStatsP', 'privFbP', 'privCsP', 'privLocalP', 'privPayP',
    'privAdsP', 'privAdsSet', 'privAdsHow', 'privNoP', 'privAskP'];
  for (const k of kulcsok) assert.equal((blokk.match(new RegExp('\\b' + k + ':', 'g')) || []).length, 3, k + ' nincs meg mind a 3 nyelven');
  const fn = b.slice(b.indexOf('function buildPrivacyPage()'), b.indexOf('function buildWizardPage()'));
  assert.ok(/const hirdetes = !HIRDETES\.be \? '' :/.test(fn), 'a hirdetés-kártya kapcsoló nélkül kerülne ki → kikapcsolva is sütit állítana');
  assert.ok(/'privacy\.html'\), buildPrivacyPage\(\)/.test(b), 'az oldal nincs kiírva');
  assert.ok(/\$\{LP\}\/privacy">\$\{tr\('privNav'\)\}/.test(b), 'nincs lábléc-link');
});

// ── A HIRDETÉS A CIKK KÖZEPÉN (2026-10-16, user: „igen, ha szerinted jó ötlet!") ──────────
// Mérve (AdSense, 10-15): 57 oldalmegtekintésből csak 11 hirdetéskérés — a cikk aljáig kevesen
// jutnak el. EGY hirdetés marad, csak feljebb: útmutatóban két LÉPÉS, hírben két BEKEZDÉS közé.
const B = '<aside class="ad-slot">AD</aside>';
const bek = n => Array.from({ length: n }, (_, i) => `<p>${'szó '.repeat(20)}${i}</p>`).join('\n');

t('🔗 hír: két BEKEZDÉS közé, a szöveg ~40%-ánál; a hirdetés pontosan egyszer', () => {
  const r = hirdetesHirbe(bek(10), B);
  assert.equal(r.kozepen, true);
  assert.equal(r.html.split(B).length - 1, 1, 'pontosan egy hirdetés');
  const elotte = r.html.slice(0, r.html.indexOf(B));
  assert.equal((elotte.match(/<p>/g) || []).length, 4, '10 bekezdésből 4 után (40%)');
  assert.match(r.html, /<\/p>\n?<aside class="ad-slot">AD<\/aside>\n?<p>/, 'két bekezdés között');
});

t('🔗 hír: alcím vagy doboz mellé NEM kerül; ha nincs két bekezdés közti hely a 20–70%-os sávban → marad alul', () => {
  const h2Kozt = '<p>' + 'a '.repeat(50) + '</p><h2>X</h2><p>' + 'b '.repeat(50) + '</p><aside class="midread">M</aside><h2>Y</h2><p>' + 'c '.repeat(50) + '</p>';
  const r = hirdetesHirbe(h2Kozt, B);
  assert.equal(r.kozepen, false, 'csak alcím/doboz előtti határ van → ne ott');
  assert.equal(r.html, h2Kozt, 'változatlan törzs');
  assert.equal(hirdetesHirbe(bek(2), B).kozepen, false, 'rövid cikkben nincs középső hely');
  assert.deepEqual(hirdetesHirbe(bek(10), ''), { html: bek(10), kozepen: false }, 'kikapcsolt hirdetés → semmi');
  assert.deepEqual(hirdetesHirbe('', B), { html: '', kozepen: false });
});

t('🔗 útmutató: két LÉPÉS közé, a 40%-hoz legközelebb — soha nem az „olvass tovább" doboz helyére', () => {
  const vart = { 3: 2, 4: 2, 5: 2, 6: 3, 7: 3, 8: 4, 11: 5 };
  for (const [n, hely] of Object.entries(vart).map(([a, b]) => [+a, b])) {
    assert.equal(lepesHirdetesHely(n), hely, `${n} lépésnél a ${hely}. lépés elé`);
    assert.notEqual(lepesHirdetesHely(n), midStepNo(n), `${n}: az első doboz helyére esne`);
    assert.notEqual(lepesHirdetesHely(n), masodikStepNo(n), `${n}: a második doboz helyére esne`);
  }
  assert.equal(lepesHirdetesHely(1), 0);
  assert.equal(lepesHirdetesHely(0), 0);
  assert.equal(lepesHirdetesHely(null), 0);
});

t('🔗 útmutató: a beszúrás a megadott lépés ELÉ kerül; ha a lépés-jelölő nincs meg → marad alul', () => {
  const lepesek = n => Array.from({ length: n }, (_, i) => `<div class="g-step" id="step-${i + 1}">L${i + 1}</div>`).join('');
  const r = hirdetesLepesek(lepesek(6), 6, B);
  assert.equal(r.kozepen, true);
  assert.ok(r.html.includes(`${B}<div class="g-step" id="step-3">`), 'a 3. lépés elé');
  assert.equal(r.html.split(B).length - 1, 1);
  assert.deepEqual(hirdetesLepesek('<div>régi felépítés</div>', 6, B), { html: '<div>régi felépítés</div>', kozepen: false });
  assert.deepEqual(hirdetesLepesek(lepesek(6), 6, ''), { html: lepesek(6), kozepen: false });
});

t('🔗 útmutató: a build.js VALÓDI lépés-jelölőjét is megtalálja (10-17: a „g-step g-slide" miatt élőben alul maradt)', () => {
  const b = readFileSync(join(ROOT, 'website', 'build.js'), 'utf-8');
  const sablon = (b.match(/<div class="g-step[^"]*" id="step-\$\{stepNo\}">/) || [])[0];
  assert.ok(sablon, 'a build.js lépés-sablonja nem található');
  const lepesek = n => Array.from({ length: n }, (_, i) => sablon.replace('${stepNo}', i + 1) + `L${i + 1}</div>`).join('');
  for (const n of [4, 6, 8]) {
    const r = hirdetesLepesek(lepesek(n), n, B);
    assert.equal(r.kozepen, true, `${n} lépés: a valódi jelölőnél is középre kell kerülnie`);
    assert.ok(r.html.includes(B + sablon.replace('${stepNo}', lepesHirdetesHely(n))), `${n} lépés: a ${lepesHirdetesHely(n)}. lépés elé`);
  }
});

t('📊 VALÓDI cikkeken: az útmutatók és a hírek többsége kap középső helyet', () => {
  const DIR = join(ROOT, 'content', 'articles');
  let ut = 0, utKozep = 0, hir = 0, hirKozep = 0;
  for (const f of readdirSync(DIR).filter(f => f.endsWith('.json'))) {
    const md = String(JSON.parse(readFileSync(join(DIR, f), 'utf-8')).article_markdown || '').replace(/^---[\s\S]*?\n---\n/, '');
    if (!md) continue;
    if (f.startsWith('ARTICLE_GUIDE_')) {
      ut++;
      const n = (md.match(/^##\s*Step\s*\d+/gim) || []).length;
      if (lepesHirdetesHely(n)) utKozep++;
    } else {
      hir++;
      if (hirdetesHirbe(marked.parse(md), B).kozepen) hirKozep++;
    }
  }
  console.log(`     útmutató: ${utKozep}/${ut} · hír: ${hirKozep}/${hir} kap középső helyet (a többinél marad alul)`);
  assert.ok(utKozep / ut > 0.9, 'az útmutatók 90%-a felett kell legyen');
  assert.ok(hirKozep / hir > 0.8, 'a hírek 80%-a felett kell legyen');
});

t('🔌 build.js: mindkét sablon a középső helyet használja, és alul CSAK akkor tesz hirdetést, ha középre nem került', () => {
  const b = readFileSync(join(ROOT, 'website', 'build.js'), 'utf-8');
  assert.match(b, /hirdetesHirbe\(/, 'a hír-sablon nem használja');
  assert.match(b, /hirdetesLepesek\(/, 'az útmutató-sablon nem használja');
  assert.equal((b.match(/\$\{[a-zA-Z]+\.kozepen \? '' : hirdetesBlokk\(HIRDETES, LANG\)\}/g) || []).length, 2,
    '🔴 két hirdetés kerülne egy oldalra (közép + alj)');
});

if (hiba) { console.log(`\n❌ ads.test: ${hiba} hiba`); process.exit(1); }
console.log('\n✅ ads.test: mind rendben');
