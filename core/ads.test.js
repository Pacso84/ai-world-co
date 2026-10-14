// core/ads.js — a hirdetés-kapcsoló (2026-10-01, user: „rakjunk ki reklámokat").
// Ingyenes, hálózat nélküli.
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { hirdetesBeallitas, fejKod, hirdetesBlokk, adsTxt, CIMKE, URES_VARAS_MS } from './ads.js';

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

if (hiba) { console.log(`\n❌ ads.test: ${hiba} hiba`); process.exit(1); }
console.log('\n✅ ads.test: mind rendben');
