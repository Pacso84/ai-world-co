// Angol mondat a magyar/spanyol Felkapott oldalon és Prompt-tárban (2026-10-20, user: „a trendeknél
// a magyarban vannak angol mondatok! ez így nem jó” · „de ez van a prompttárban is”). Ingyenes, hálózat nélküli.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { helyiPromptok, angolNak, promptTar } from './prompt-library.js';
import { trendRadar, trendRadarHtml } from './trend-radar.js';
import { kerdesForditas, hianyzoForditasok, valaszFeldolgoz, szotarBetolt, MAX_FUTASONKENT } from './trend-forditas.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };

const EN = `## Step 1\n💬 Try typing this:\n\n\`\`\`\nPlease write a short polite email to my landlord asking when the broken heater will be fixed.\n\`\`\`\n\n## Step 2\n💬 Then ask:\n\n\`\`\`\nNow make it shorter and friendlier, and add a thank-you line at the end.\n\`\`\``;
const HU = `## 1. lépés\n💬 Írd be ezt:\n\n\`\`\`\nKérlek, írj egy rövid, udvarias e-mailt a főbérlőmnek, és kérdezd meg, mikor javítják meg a rossz fűtést.\n\`\`\`\n\n## 2. lépés\n💬 Aztán kérd:\n\n\`\`\`\nMost legyen rövidebb és barátságosabb, a végére pedig tegyél egy köszönő sort.\n\`\`\``;
const HU_ANGOL = HU.replace(/Kérlek[^\n]*/, 'Please write a short polite email to my landlord asking when the broken heater will be fixed.');

console.log('\n🧪 helyi-nyelv');

t('🔁 a prompt HELYI változata ugyanazon a helyen; angolul maradt fordítás → null', () => {
  const r = helyiPromptok(EN, HU);
  assert.equal(r.length, 2);
  assert.match(r[0].helyi, /^Kérlek, írj/);
  assert.match(r[0].en, /^Please write/);
  assert.equal(helyiPromptok(EN, HU_ANGOL)[0].helyi, null, 'angolul maradt — nem mehet ki a magyar oldalra');
  assert.equal(helyiPromptok(EN, HU.split('## 2.')[0])[0].helyi, null, 'eltérő darabszám → nem találgatunk');
  assert.equal(helyiPromptok(EN, '')[0].helyi, null);
});

t('🔤 angolNak: angol mondat igen, magyar/spanyol nem', () => {
  assert.equal(angolNak('Please write a short email to my landlord and make it polite.'), true);
  assert.equal(angolNak('Kérlek, írj egy rövid e-mailt a főbérlőmnek, és legyen udvarias.'), false);
  assert.equal(angolNak('Por favor, escribe un correo corto a mi casero para que sea amable.'), false);
});

const cikk = (extra = {}) => ({ slug: 'level', title: 'Levél a főbérlőnek', kifejezes: 'write email to landlord', tool: '',
  publishedAt: '2026-10-20T08:00:00Z', md: HU, mdEn: EN, kep: '', ...extra });
const SZ = { cim: 'Felkapott', tag: 't', het: 'h', ujra: 'u', db: n => String(n), kerestek: 'Erre kerestek rá:', ures: 'ü', masol: 'Másolás', masolva: 'Kész', utmutato: 'Útmutató' };
const NOW = Date.parse('2026-10-20T12:00:00Z');

t('📈 Felkapott, magyar oldal: magyar keresés + magyar prompt; angol oldal változatlan', () => {
  const hu = trendRadar([cikk({ helyi: true, kerdesHelyi: 'e-mail a főbérlőnek' })], { now: NOW });
  assert.equal(hu.het[0].kerdes, 'e-mail a főbérlőnek');
  assert.match(hu.het[0].prompt, /^Kérlek, írj/);
  const html = trendRadarHtml(hu, { sz: SZ });
  assert.ok(!html.includes('write email to landlord'), 'az angol keresés kint maradt');
  assert.ok(!html.includes('Please write'), 'az angol prompt kint maradt');
  const en = trendRadar([cikk({ md: EN })], { now: NOW });
  assert.equal(en.het[0].kerdes, 'write email to landlord');
  assert.match(en.het[0].prompt, /^Please write/);
});

t('🙈 ha nincs fordítás: a keresés sora és a prompt KIMARAD (nem angolul jelenik meg)', () => {
  const r = trendRadar([cikk({ helyi: true, kerdesHelyi: '', md: HU_ANGOL })], { now: NOW });
  assert.equal(r.het[0].kerdes, '');
  assert.equal(r.het[0].prompt, null);
  const html = trendRadarHtml(r, { sz: SZ });
  assert.ok(!html.includes('tr-q'), 'üres keresés-sor maradt');
  assert.ok(!/Please write|write email/.test(html));
});

t('📋 Prompt-tár, magyar oldal: csak magyar promptok; az angolul maradt kimarad', () => {
  const tar = promptTar([
    { slug: 'a', title: 'A', md: EN, helyi: true, mdHelyi: HU, publishedAt: '2026-10-19T00:00:00Z' },
    { slug: 'b', title: 'B', md: EN.replace('landlord', 'boss'), helyi: true, mdHelyi: HU_ANGOL, publishedAt: '2026-10-19T00:00:00Z' }
  ], { now: NOW });
  const mind = [...tar.kiemelt, ...tar.temak.flatMap(x => x.lista), ...tar.egyeb];
  assert.ok(mind.length >= 1);
  for (const e of mind) assert.ok(!angolNak(e.szoveg), 'angol prompt a magyar tárban: ' + e.szoveg.slice(0, 60));
  assert.ok(!mind.some(e => e.slug === 'b' && /^Please write/.test(e.szoveg)));
});

t('🔎 trend-keresés szótár: fordítás, hiánylista, modellválasz feldolgozása', () => {
  const sz = { 'ai trends': { hu: 'ai-trendek' } };
  assert.equal(kerdesForditas(sz, 'AI Trends', 'hu'), 'ai-trendek');
  assert.equal(kerdesForditas(sz, 'ai trends', 'es'), '');
  assert.equal(kerdesForditas(sz, 'ai trends', 'en'), 'ai trends');
  assert.deepEqual(hianyzoForditasok(['ai trends', 'AI trends', 'dow today'], sz, ['hu', 'es']),
    [{ kifejezes: 'ai trends', nyelv: 'es' }, { kifejezes: 'dow today', nyelv: 'hu' }, { kifejezes: 'dow today', nyelv: 'es' }]);
  assert.ok(hianyzoForditasok(Array.from({ length: 50 }, (_, i) => 'q' + i), {}, ['hu', 'es']).length <= MAX_FUTASONKENT);
  assert.deepEqual(valaszFeldolgoz('1. Tendencias de IA\n2. "dow jones hoy"', 2), ['tendencias de ia', 'dow jones hoy']);
  assert.equal(valaszFeldolgoz('csak egy sor', 2), null);
});

// ── VALÓDI ADAT (10-17 tanulság: a teszt a valódi sablonból/adatból) ──
const cikkek = [];
for (const f of readdirSync(join(ROOT, 'content', 'articles'))) {
  if (!f.includes('_GUIDE_') || !f.endsWith('.json')) continue;
  try {
    const a = JSON.parse(readFileSync(join(ROOT, 'content', 'articles', f), 'utf-8'));
    let tr = {}; try { tr = JSON.parse(readFileSync(join(ROOT, 'content', 'translations', f), 'utf-8')); } catch { /* nincs fordítás */ }
    cikkek.push({ a, tr });
  } catch { /* sérült */ }
}

t('🌍 VALÓDI útmutatók: a magyar és spanyol Prompt-tárba egyetlen angol prompt sem kerül', () => {
  for (const ny of ['hu', 'es']) {
    const tar = promptTar(cikkek.map(({ a, tr }) => ({ slug: a._meta?.slug, title: 'x', md: a.article_markdown || '', helyi: true,
      mdHelyi: typeof tr[ny] === 'string' ? tr[ny] : '', publishedAt: a._meta?.published_at || '' })));
    const mind = [...tar.kiemelt, ...tar.temak.flatMap(x => x.lista), ...tar.egyeb];
    assert.ok(mind.length > 50, `${ny}: gyanúsan kevés prompt maradt (${mind.length})`);
    const angol = mind.filter(e => angolNak(e.szoveg));
    assert.equal(angol.length, 0, `${ny}: angol prompt: ${angol.slice(0, 2).map(e => e.szoveg.slice(0, 50)).join(' | ')}`);
  }
});

t('🌍 VALÓDI trend-útmutatók: minden keresésnek van magyar és spanyol fordítása a szótárban', () => {
  const szotar = szotarBetolt();
  const kif = cikkek.map(({ a }) => a._meta?.trend?.kifejezes).filter(Boolean);
  const hiany = hianyzoForditasok(kif, szotar, ['hu', 'es']);
  assert.deepEqual(hiany, [], 'a fordító a következő futásban pótolja — de a ma kint lévőknek meg kell lenniük');
});

t('🔌 bekötés: build (Prompt-tár + Felkapott) és a fordító', () => {
  const b = readFileSync(join(ROOT, 'website', 'build.js'), 'utf-8');
  assert.equal((b.match(/helyi: LANG !== 'en'/g) || []).length, 2, 'mindkét oldal helyi módban kell fusson');
  assert.match(b, /kerdesHelyi: kerdesForditas\(TREND_SZOTAR, a\.trendKif, LANG\)/);
  const f = readFileSync(join(ROOT, 'agents', 'translator', 'agent.js'), 'utf-8');
  assert.match(f, /from '\.\.\/\.\.\/core\/trend-forditas\.js'/);
  assert.match(f, /await trendKeresesekForditasa\(\)/);
});

if (hiba) { console.log(`\n❌ helyi-nyelv.test: ${hiba} hiba`); process.exit(1); }
console.log('✅ helyi-nyelv.test: mind rendben');
