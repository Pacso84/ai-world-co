// 🧩 Régi promptok kitölthetővé tétele (2026-10-29): kód-biztosíték, megjelenítés, generátor-logika. Ingyenes, hálózat nélküli.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promptKulcs, marKitoltheto, promptokKinyer, mezokEllenoriz, mezosites, MAX_MEZO } from './kitoltheto-regi.js';
import { kitoltottSzoveg } from './kitoltheto-prompt.js';
import { jelolendoPromptok, valaszErtelmez, feldolgoz, keretOk, NAPI_PLAFON, sorrend } from './kitoltheto-regi-gen.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = readFileSync(join(ROOT, 'website', 'build.js'), 'utf-8').replace(/\r\n/g, '\n');
let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };
const tA = async (nev, fn) => { try { await fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };

console.log('\n🧪 kitoltheto-regi');

const PROMPT = 'Plan a 3-day trip to Lisbon for a family of four on a budget.';

t('🛡️ a kód-biztosíték: csak az egyszer előforduló, nem átfedő, valódi szó marad', () => {
  const ok = mezokEllenoriz(PROMPT, [{ eredeti: 'Lisbon', hely: 'your city' }, { eredeti: 'a family of four', hely: 'who is going' }]);
  assert.deepEqual(ok.map(m => m.eredeti), ['Lisbon', 'a family of four']);
  // nem létező szó, kétszer szereplő szó, átfedés, túl rövid, saját [zárójeles], azonos hely-szöveg
  assert.deepEqual(mezokEllenoriz(PROMPT, [{ eredeti: 'Paris', hely: 'your city' }]), []);
  assert.deepEqual(mezokEllenoriz('Go to Rome and then Rome again', [{ eredeti: 'Rome', hely: 'your city' }]), [], 'kétszer szerepel → melyik?');
  assert.deepEqual(mezokEllenoriz(PROMPT, [{ eredeti: 'a family of four', hely: 'who' }, { eredeti: 'family', hely: 'someone' }]).length, 1, 'átfedő mező');
  assert.deepEqual(mezokEllenoriz(PROMPT, [{ eredeti: 'a', hely: 'letter' }]), []);
  assert.deepEqual(mezokEllenoriz(PROMPT, [{ eredeti: 'Lisbon', hely: '[x]' }]), []);
  assert.deepEqual(mezokEllenoriz(PROMPT, [{ eredeti: 'Lisbon', hely: 'lisbon' }]), []);
  assert.deepEqual(mezokEllenoriz(PROMPT, [{ eredeti: ' Lisbon', hely: 'your city' }]), [], 'szóköz a szélén');
  assert.deepEqual(mezokEllenoriz(PROMPT, 'nem tömb'), []);
  assert.deepEqual(mezokEllenoriz(PROMPT, [null, 5, {}]), []);
});

t('🔢 legfeljebb MAX_MEZO mező, és ahol az író már hagyott [helykitöltőt], a meglévő mechanizmus dolgozik (nincs új mező)', () => {
  const sok = 'Alpha one, Bravo two, Charlie three, Delta four, Echo five';
  assert.equal(mezokEllenoriz(sok, ['Alpha one', 'Bravo two', 'Charlie three', 'Delta four'].map(x => ({ eredeti: x, hely: 'your thing' }))).length, MAX_MEZO);
  assert.deepEqual(mezokEllenoriz('Write to [your boss] about Lisbon', [{ eredeti: 'Lisbon', hely: 'your city' }]), []);
  assert.equal(marKitoltheto('Write to [your boss]'), true); assert.equal(marKitoltheto('Write to [REDACTED]'), false);
});

t('🔁 a visszaírás-próba: az alapértelmezett (kitöltetlen) mező betűre az eredeti promptot adja', () => {
  const mezok = mezokEllenoriz(PROMPT, [{ eredeti: 'Lisbon', hely: 'your city' }, { eredeti: 'a family of four', hely: 'who is going' }]);
  const html = mezosites(PROMPT, mezok, { escaped: false });
  assert.equal((html.match(/<input class="g-fill g-fill--regi"/g) || []).length, 2);
  // a böngésző-másoló szabálya: üres mező → data-o (az eredeti szó); kitöltött mező → az érték
  const ertekek = [...html.matchAll(/value="([^"]*)" placeholder="[^"]*"[^>]*data-o="([^"]*)"/g)].map(m => m[1] || m[2]);
  assert.deepEqual(ertekek, ['Lisbon', 'a family of four']);
  const vissza = html.replace(/<input[^>]*data-o="([^"]*)"[^>]*>/g, '$1');
  assert.equal(vissza, PROMPT, 'a megjelenített prompt szövege megváltozott');
});

t('🌐 escape: a dobozban már escape-elt szövegben is egyezik, idézőjel/és-jel nem töri a HTML-t', () => {
  const p = 'Reply to "Tom & Jerry" about the budget';
  const mezok = mezokEllenoriz(p, [{ eredeti: 'Tom & Jerry', hely: 'the name' }]);
  assert.equal(mezok.length, 1);
  const esc = p.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const h = mezosites(esc, mezok, { escaped: true });
  assert.match(h, /value="Tom &amp; Jerry"/); assert.match(h, /data-o="Tom &amp; Jerry"/);
  assert.equal(mezosites('nincs benne', mezok, { escaped: true }), 'nincs benne', 'ahol a szó nincs a dobozban, nem csinál semmit');
  assert.equal(mezosites(PROMPT, [{ eredeti: 'Lisbon', hely: 'your city' }], { escaped: false, be: false }), PROMPT, 'kill-switch');
});

t('🔑 a prompt kulcsa szóköz-független, szövegfüggő (átírt prompt új kulcsot kap)', () => {
  assert.equal(promptKulcs('a  b\nc'), promptKulcs('a b c'));
  assert.notEqual(promptKulcs('Plan a trip to Rome'), promptKulcs('Plan a trip to Paris'));
});

t('📚 a VALÓDI útmutatókból kinyert promptokra a biztosíték soha nem ront: a visszaírt szöveg az eredeti', () => {
  const dir = join(ROOT, 'content', 'articles');
  let promptDb = 0, mezoDb = 0;
  for (const f of readdirSync(dir).filter(x => x.includes('GUIDE'))) {
    const md = JSON.parse(readFileSync(join(dir, f), 'utf-8')).article_markdown || '';
    for (const p of promptokKinyer(md)) {
      promptDb++;
      // ész-nélküli „modell”: minden 4–12 betűs nagybetűs szót megjelöl — a biztosítéknak kell megfognia a rosszat
      const javaslat = [...p.szoveg.matchAll(/\b[A-Z][a-z]{3,11}\b/g)].map(m => ({ eredeti: m[0], hely: 'your thing' }));
      const jo = mezokEllenoriz(p.szoveg, javaslat);
      mezoDb += jo.length;
      assert.ok(jo.length <= MAX_MEZO);
      const vissza = mezosites(p.szoveg, jo, { escaped: false }).replace(/<input[^>]*data-o="([^"]*)"[^>]*>/g, '$1');
      assert.equal(vissza, p.szoveg, f);
    }
  }
  assert.ok(promptDb > 300, 'kevés prompt: ' + promptDb);
  assert.ok(mezoDb > 0);
});

t('🧭 a kinyerő a build két 💬-szabályát tükrözi: a regexek betűre egyeznek a build forrásával', () => {
  const regi = readFileSync(join(ROOT, 'core', 'kitoltheto-regi.js'), 'utf-8');
  const kod = regi.match(/KODBLOKK_RX = (\/.*\/gmi);/)[1], sor = regi.match(/EGYSOR_RX = (\/.*\/gmi);/)[1];
  assert.ok(BUILD.includes(kod), 'a kódblokkos 💬-regex eltér a build.js-ben lévőtől');
  assert.ok(BUILD.includes(sor), 'az egysoros 💬-regex eltér a build.js-ben lévőtől');
});

t('🔌 build.js: csak az angol oldalon, a prompt KULCSA szerint, mindkét dobozfajtánál; app.js: üres mező = eredeti szó', () => {
  assert.match(BUILD, /REGI_MEZOK = LANG === 'en' \? regiBetolt\(PROJECT_ROOT, a\.slug\) : null/);
  assert.match(BUILD, /mezosites\(kitolthetoHtml\(escapeHtml\(body\)[^\n]*regiMezok\(body\), \{ escaped: true \}\)/);
  assert.match(BUILD, /mezosites\(kitolthetoHtml\(txt\), regiMezok\(txt\), \{ escaped: false \}\)/);
  assert.match(BUILD, /boxHtml\.includes\('class="g-fill'\)/, 'a „Tipp” sor nem jelenik meg a régi mezőknél');
  const app = readFileSync(join(ROOT, 'website', 'assets', 'app.js'), 'utf-8');
  assert.match(app, /m\.getAttribute\('data-o'\)/);
  const css = readFileSync(join(ROOT, 'website', 'assets', 'style.css'), 'utf-8');
  assert.match(css, /\.g-fill\.g-fill--regi/);
});

t('🧮 jelölendő promptok: csak beírandó, még nem kitölthető, nincs róla bejegyzés, nem túl hosszú', () => {
  const md = 'Step\n\n💬 "Plan a trip to Lisbon for me"\n\n💬 "Write to [your boss] now"\n\n💬 Example: a plain description here\n';
  const j = jelolendoPromptok(md, null);
  assert.equal(j.length, 1); assert.match(j[0].szoveg, /Lisbon/);
  assert.equal(jelolendoPromptok(md, { promptok: { [j[0].kulcs]: [] } }).length, 0, 'az üres lista is „kész” → nincs újra-hívás');
  assert.equal(jelolendoPromptok('💬 "' + 'x'.repeat(800) + '"', null).length, 0);
});

t('📝 a modell válasza: ```json burok, szemét, hibás JSON, nem tömb → null', () => {
  assert.deepEqual(valaszErtelmez('```json\n[{"i":0,"mezok":[{"eredeti":"Lisbon","hely":"your city"}]}]\n```'), { 0: [{ eredeti: 'Lisbon', hely: 'your city' }] });
  assert.equal(valaszErtelmez('nem json'), null); assert.equal(valaszErtelmez('[{broken'), null); assert.equal(valaszErtelmez(''), null);
});

await tA('💰 feldolgozás: költség könyvelve; a modell ROSSZ javaslata kiesik; átmeneti hiba nem ír fájlt; üres válasz nem „kész”', async () => {
  const md = '💬 "Plan a trip to Lisbon for a family of four"\n\n💬 "Summarise this report in one page"\n';
  let koltseg = 0;
  const ctx = (valasz) => ({ keret: () => true, koltseg: u => { koltseg += u; }, ask: async () => valasz });
  const jo = await feldolgoz({ slug: 's', cim: 'T', bodyMd: md, fajl: null, ctx: ctx({ text: JSON.stringify([{ i: 0, mezok: [{ eredeti: 'Lisbon', hely: 'your city' }, { eredeti: 'Paris', hely: 'nincs ilyen' }] }, { i: 1, mezok: [] }]), costUsd: 0.002 }) });
  assert.equal(jo.uj, true); assert.equal(jo.mezoDb, 1, 'a nem létező Paris kiesik'); assert.equal(koltseg, 0.002);
  const kulcsok = Object.keys(jo.fajl.promptok); assert.equal(kulcsok.length, 2);
  assert.equal((await feldolgoz({ slug: 's', cim: 'T', bodyMd: md, fajl: null, ctx: ctx(null) })).atmeneti, true);
  assert.equal((await feldolgoz({ slug: 's', cim: 'T', bodyMd: md, fajl: null, ctx: ctx({ text: 'szemét', costUsd: 0.001 }) })).atmeneti, true, 'használhatatlan válasz → holnap újra');
  assert.equal((await feldolgoz({ slug: 's', cim: 'T', bodyMd: md, fajl: null, ctx: { ...ctx(null), keret: () => false } })).ok, 'keret');
  assert.equal((await feldolgoz({ slug: 's', cim: 'T', bodyMd: 'nincs prompt', fajl: null, ctx: ctx(null) })).kihagyva, true);
});

t('🚦 keret és sorrend', () => {
  assert.equal(keretOk({ napiOsszes: 0.1, generatorMa: 0.01 }), true);
  assert.equal(keretOk({ napiOsszes: 0.7, generatorMa: 0 }), false, 'az összes napi költés határa');
  assert.equal(keretOk({ napiOsszes: 0.1, generatorMa: NAPI_PLAFON }), false, 'a saját napi plafon');
  const s = sorrend([{ slug: 'a', published_at: '2026-01-01' }, { slug: 'b', published_at: '2026-02-01' }, { slug: 'c', published_at: '2026-03-01' }], new Map([['a', 9]]));
  assert.deepEqual(s.map(x => x.slug), ['a', 'c', 'b']);
});

t('🔌 CI: a generátor a „Ha elakadsz” lépésben fut (nincs új lépés-időkorlát), saját agent-konfigja van', () => {
  const yml = readFileSync(join(ROOT, '.github', 'workflows', 'auto.yml'), 'utf-8').replace(/\r\n/g, '\n');
  assert.match(yml, /node core\/kitoltheto-regi-gen\.js --limit 12 --max-minutes 4 \|\| true/);
  const cfg = JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf-8'));
  assert.ok(cfg.agents['kitoltheto-regi']?.primary_model, 'nincs agent-konfig');
  const gen = readFileSync(join(ROOT, 'core', 'kitoltheto-regi-gen.js'), 'utf-8');
  assert.match(gen, /agentName: 'kitoltheto-regi'/);
  assert.match(gen, /import\(['"]\.\/ai-router\.js['"]\)/, 'az ai-router importja nem lusta → a teszt hálózatot érintene');
});

if (hiba) { console.log(`\n❌ kitoltheto-regi.test: ${hiba} hiba`); process.exit(1); }
console.log('✅ kitoltheto-regi.test: mind rendben');
