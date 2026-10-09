// core/affiliate.js — Amazon partnerlink-PRÓBA (2026-10-09, user: „megvásárlási
// lehetőség is"). Ingyenes, hálózat nélküli.
//
// A MÉRCE IRÁNYA: itt a veszély nem az, hogy a doboz NEM jelenik meg, hanem
// hogy (1) jelöletlenül, (2) átirányítva (= az Amazon nem fizet), (3) árral
// (= tilos API nélkül), vagy (4) kikapcsolt kapcsolóval is kikerül.
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { partnerBeallitas, termekFor, amazonUrl, partnerDoboz, partnerJelzes, affKulcs,
  partnerKattintasSor, SZOVEG, TERMEKEK, TAG_MINTA } from './affiliate.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const olvas = p => readFileSync(join(ROOT, ...p.split('/')), 'utf-8');
let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };

const TAG = 'aiworldhq-20';
const BE = partnerBeallitas({ affiliate: { amazon: { enabled: true, tag: TAG } } });
const ALEXA = { tool: 'Alexa+', company: 'Amazon', slug: 'alexa-routines' };
const CHATGPT = { tool: 'ChatGPT', company: 'OpenAI', slug: 'x' };
const KOTELEZO = 'As an Amazon Associate I earn from qualifying purchases.';
console.log('\n🧪 affiliate (Amazon partnerlink)');

t('🔒 alapból KI: hiányzó / kikapcsolt beállítás → semmi nem kerül ki', () => {
  for (const web of [undefined, null, {}, { affiliate: {} }, { affiliate: { amazon: { enabled: false, tag: TAG } } }]) {
    const b = partnerBeallitas(web);
    assert.equal(b.be, false);
    assert.equal(partnerDoboz(b, ALEXA, 'en'), '');
    assert.equal(partnerJelzes(b, ALEXA, 'en'), '');
  }
});

t('🔒 hibás azonosítóval NEM kapcsol be (elgépelés / beinjektált szöveg)', () => {
  for (const tag of ['', ' ', 'aiworldhq', 'aiworldhq-21', 'AIWORLD-20', '"><script>-20', 'a b-20']) {
    assert.equal(partnerBeallitas({ affiliate: { amazon: { enabled: true, tag } } }).be, false, tag);
  }
  assert.ok(TAG_MINTA.test(TAG));
});

t('csak a termékhez illő útmutatón: Alexa+ → Echo; más eszköz → semmi', () => {
  assert.equal(termekFor(ALEXA).id, 'echo');
  assert.equal(termekFor(CHATGPT), null);
  assert.equal(termekFor({ tool: 'toString' }), null, 'az Object.prototype ne számítson terméknek');
  assert.equal(partnerDoboz(BE, CHATGPT, 'en'), '');
  assert.equal(partnerJelzes(BE, CHATGPT, 'en'), '');
});

t('🔴 a link KÖZVETLENÜL az amazon.com-ra mutat (átirányítás = nincs jutalék)', () => {
  const html = partnerDoboz(BE, ALEXA, 'en');
  const href = (html.match(/href="([^"]+)"/) || [])[1] || '';
  assert.match(href, /^https:\/\/www\.amazon\.com\/s\?k=amazon\+echo&amp;tag=aiworldhq-20$/);
  assert.doesNotMatch(href, /aiworldhq\.com|workers\.dev|\/go\//, 'köztes oldalon át menne');
  assert.equal(amazonUrl(TERMEKEK['Alexa+'], TAG), 'https://www.amazon.com/s?k=amazon+echo&tag=aiworldhq-20');
});

t('🔴 jelölve: címke + kötelező Amazon-mondat + rel="sponsored", mindhárom nyelven; ár NINCS', () => {
  for (const lang of ['en', 'hu', 'es']) {
    const html = partnerDoboz(BE, ALEXA, lang);
    assert.ok(html.includes(SZOVEG[lang].cimke), lang + ': nincs címke');
    assert.ok(html.includes(KOTELEZO), lang + ': nincs a kötelező mondat');
    assert.match(html, /rel="sponsored nofollow noopener"/);
    assert.match(html, /data-aff="echo"/, 'a kattintásszámláló nem tudná, mire kattintottak');
    assert.doesNotMatch(html, /[$€]\s?\d|\d\s?(USD|Ft)/, lang + ': árat írna ki (API nélkül tilos)');
    assert.ok(partnerJelzes(BE, ALEXA, lang).includes(SZOVEG[lang].jelzes), lang + ': nincs jelzés a cikk tetején');
  }
});

t('🚫 a szövegben nincs összehasonlítás / ajánlás (user-szabály 09-26)', () => {
  for (const lang of Object.keys(SZOVEG)) {
    const s = Object.values(SZOVEG[lang]).join(' ');
    assert.doesNotMatch(s, /\b(best|better|top|recommend|mejor|recomend)\w*/i, lang);
    assert.doesNotMatch(s, /legjobb|jobb, mint|ajánl/i, lang);
  }
});

t('a KV-kulcs: csak ismert termék, napra bontva (UTC)', () => {
  assert.equal(affKulcs('echo', Date.parse('2026-10-09T23:59:00Z')), 'aff:2026-10-09:echo');
  for (const p of ['', 'x', '../echo', 'toString', null]) assert.equal(affKulcs(p), null, String(p));
});

const MOST = Date.parse('2026-10-10T06:00:00Z');
t('riport-sor: tegnap + 7 nap; csendes hét → nincs sor; HIBA → külön mondat', () => {
  assert.equal(partnerKattintasSor({ '2026-10-09': { echo: 2 }, '2026-10-05': { echo: 1 } }, MOST), '🛒 Amazon-kattintás tegnap: 2 · 7 nap: 3');
  assert.equal(partnerKattintasSor({ '2026-10-05': { echo: 1 } }, MOST), '🛒 Amazon-kattintás tegnap: 0 · 7 nap: 1');
  assert.equal(partnerKattintasSor({}, MOST), '');
  assert.equal(partnerKattintasSor(null, MOST), '');
  assert.match(partnerKattintasSor({ error: true }, MOST), /nem sikerült lekérdezni/);
});

// ── bekötés (a build, a riport és a Worker nem importálható: futnak / Worker-környezet) ──
t('🔌 a lánc be van kötve: build → app.js → Worker → napi riport', () => {
  const b = olvas('website/build.js');
  assert.match(b, /from '\.\.\/core\/affiliate\.js'/);
  assert.match(b, /PARTNER = partnerBeallitas\(web\)/, 'a config nem jut el a buildig');
  assert.equal((b.match(/partnerDoboz\(PARTNER, a, LANG\)/g) || []).length, 1, 'a doboz pontosan egyszer (útmutató)');
  assert.equal((b.match(/partnerJelzes\(PARTNER, a, LANG\)/g) || []).length, 1, 'a tetején a jelzés pontosan egyszer');
  assert.match(b, /PARTNER\.be \? kartya\('🛒', 'privAffH', 'privAffP'\) : ''/, 'az adatvédelmi kártya kapcsoló nélkül kerülne ki');
  const priv = b.slice(b.indexOf('const UI_PRIV = {'), b.indexOf('for (const l of SITE_LANGS) Object.assign(UI[l], UI_PRIV'));
  for (const k of ['privAffH', 'privAffP']) assert.equal((priv.match(new RegExp('\\b' + k + ':', 'g')) || []).length, 3, k + ' nincs meg mind a 3 nyelven');
  const app = olvas('website/assets/app.js');
  assert.match(app, /closest\('\.aff__btn'\)/);
  assert.match(app, /workers\.dev\/aff-hit/);
  assert.match(app, /keepalive: true/);
  assert.match(olvas('website/assets/style.css'), /\.aff \{/);
  assert.match(olvas('core/daily-report.js'), /partnerKattintasSor\(exp\.__aff\)/);
  const w = olvas('telegram-worker/src/worker.js');
  assert.match(w, /path === '\/aff-hit'\) return handleAffHit\(request, env\)/);
  assert.match(w, /out\.__aff = await affExport\(env\)/);
});

t('🔒 PDF-be Amazon-link nem kerülhet (az Amazon tiltja „other document"-ben)', () => {
  assert.doesNotMatch(olvas('core/ebook-build.js'), /affiliate\.js|amazon\.com\/s\?/);
});

t('⚖️ config: a kapcsoló létezik; BEKAPCSOLVA a „nincs affiliate" állítás nem maradhat a szövegeinkben', () => {
  const cfg = JSON.parse(olvas('config.json'));
  const am = cfg.website && cfg.website.affiliate && cfg.website.affiliate.amazon;
  assert.ok(am, 'website.affiliate.amazon blokk hiányzik');
  assert.equal(typeof am.enabled, 'boolean');
  if (partnerBeallitas(cfg.website).be) {
    assert.doesNotMatch(olvas('shared/legal-rules-ai.md'), /NO affiliate links/, 'az MI még azt mondja: nincs affiliate link');
    assert.doesNotMatch(olvas('shared/company-info.md'), /NINCS affiliate/, 'a cégleírás (és a chatbot) még azt mondja: nincs affiliate');
  }
});

if (hiba) { console.log(`\n❌ affiliate.test: ${hiba} hiba`); process.exit(1); }
console.log('\n✅ affiliate.test: mind rendben');
