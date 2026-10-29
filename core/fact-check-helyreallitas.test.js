// 🧑 A tény-ellenőrző téves átírásainak helyreállítása (2026-10-29). Ingyenes, hálózat nélküli.
// A tény-ellenőrző a SAJÁT emlékezete alapján 75 útmutatót írt át; négyben a „javítás” maga volt téves, hatot tévesen
// „elavultnak” jelölt (3 téves, 3 jogos). Hivatalos forrással helyreállítva; ez a teszt őrzi, hogy ne térjen vissza.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ellenorzesiSor, emberOk, HUMAN_OK_NAP } from './friss-tenyellenorzes.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };
const cikk = id => { const f = readdirSync(join(ROOT, 'content', 'articles')).find(x => x.includes(id)); return { f, a: JSON.parse(readFileSync(join(ROOT, 'content', 'articles', f), 'utf-8')), t: JSON.parse(readFileSync(join(ROOT, 'content', 'translations', f), 'utf-8')) }; };
const NYELVEK = c => [['en', c.a.article_markdown], ['hu', c.t.hu], ['es', c.t.es]];

console.log('\n🧪 fact-check-helyreallitas');

t('📊 ChatGPT-fájlelemzés: nincs többé „diagram csak fizetősben” és „csak PDF/XLSX/CSV” — mindhárom nyelven', () => {
  const c = cikk('ARTICLE_GUIDE_chatgpt-files-data');
  for (const [nyelv, s] of NYELVEK(c)) {
    assert.doesNotMatch(s, /only accepts PDFs|kizárólag PDF|solo acepta PDF/i, nyelv + ': a „csak PDF/XLSX/CSV” állítás visszajött');
    assert.doesNotMatch(s, /requires a paid ChatGPT|fizetős ChatGPT-(csomag|előfizetés) (kell|szükséges)|requiere (un plan|una suscripción) de pago/i, nyelv + ': a „diagram csak fizetősben” visszajött');
    assert.doesNotMatch(s, /not available on the free tier|az ingyenes csomagban ez nem érhető el|no está disponible en la versión gratuita/i, nyelv);
  }
  assert.match(c.a.article_markdown, /Charts work on the free plan too/);
});

t('🍎 Apple Intelligence: nincs lezárt iPhone-lista (az iPhone 17 is támogatott), „15 Pro és újabb” mindhárom nyelven', () => {
  const c = cikk('apple-intelligence-getting-started');
  for (const [nyelv, s] of NYELVEK(c)) {
    assert.doesNotMatch(s, /iPhone 16e|iPhone 16 Plus/, nyelv + ': a lezárt modell-lista visszajött');
    assert.match(s, /iPhone 15 Pro/, nyelv);
  }
  assert.match(c.a.article_markdown, /iPhone 15 Pro and newer/);
});

t('🤖 Asszisztens-áttekintő: a Mistral asszisztense nincs kivéve („megszűnt” téves volt), az új néven szerepel', () => {
  const c = cikk('ai-assistants-overview');
  for (const [nyelv, s] of NYELVEK(c)) assert.match(s, /Mistral/, nyelv + ': a Mistral hiányzik');
  assert.match(c.a.article_markdown, /Vibe, formerly Le Chat/);
});

t('📺 Alexa+ nem „fizetős szolgáltatás”: az USA-ban a Prime része', () => {
  const c = cikk('control-tv-and-streaming-apps-using-alexa');
  for (const [nyelv, s] of NYELVEK(c)) assert.doesNotMatch(s, /Amazon's paid service|fizetős szolgáltatása|el servicio de pago de Amazon|az Amazon fizetős előfizetése|la suscripción de pago de Amazon/, nyelv);
});

t('🚩 a 3 tévesen „elavultnak” jelölt útmutatóról lekerült a jelölés, és ember-ellenőrzött; a 3 jogos jelölés marad', () => {
  for (const id of ['amazon-alexa-plus', 'chatgpt-gpts', 'build-a-basic-ai-chatbot-for-your-website-using-openai-s']) {
    const m = cikk(id).a._meta;
    assert.equal(m.fact_check_flag, undefined, id + ': a téves jelölés maradt');
    assert.match(String(m.fact_human_ok), /^2026-10-29$/); assert.ok(m.fact_human_note);
  }
  for (const id of ['automate-basic-email-replies-in-outlook-with-meta-ai', 'build-a-smart-recipe-finder-that-suggests-meals', 'create-ai-generated-meeting-summaries-directly-in-apple-cale'])
    assert.equal(cikk(id).a._meta.fact_check_flag, 'may-be-obsolete', id + ': a jogos jelölés eltűnt — ez felhasználói döntés');
});

t('🛡️ emberOk: 180 napig kikerül az automata sorból; lejárat után visszakerül; hibás dátum nem véd', () => {
  const most = Date.parse('2026-10-29T12:00:00Z');
  assert.equal(emberOk({ fact_human_ok: '2026-10-29' }, most), true);
  assert.equal(emberOk({ fact_human_ok: '2026-05-15' }, most), true);
  assert.equal(emberOk({ fact_human_ok: '2026-04-01' }, most), false, HUMAN_OK_NAP + ' nap után újra sorra kerül');
  for (const rossz of [{}, null, { fact_human_ok: 'x' }, { fact_human_ok: '' }]) assert.equal(emberOk(rossz, most), false);
  const mk = (slug, m) => ({ file: slug, data: { _meta: { type: 'guide', published_at: '2026-01-01T00:00:00Z', ...m } } });
  const sor = ellenorzesiSor([mk('a', {}), mk('b', { fact_human_ok: '2026-10-29' })], most).map(c => c.file);
  assert.deepEqual(sor, ['a'], 'az ember-ellenőrzött cikk bekerült az automata sorba');
});

t('🔌 az agent: automata körben a „tárgytalan” ítélet csak gyanú — nincs jelölés, nincs tanulság a memóriába', () => {
  const src = readFileSync(join(ROOT, 'agents', 'fact-check', 'agent.js'), 'utf-8').replace(/\r\n/g, '\n').replace(/^\s*\/\/.*$/gm, '');
  const i = src.indexOf("decision.verdict === 'unpublish' && auto");
  assert.ok(i > 0, 'nincs bekötve');
  const blokk = src.slice(i, src.indexOf("if (decision.verdict === 'unpublish') {", i));
  assert.match(blokk, /fact_check_suspect/);
  assert.doesNotMatch(blokk, /flagForHuman|remember\(/, 'az automata gyanú jelölne vagy tanulságot írna');
  assert.ok(src.indexOf("if (decision.verdict === 'unpublish') {") > i, 'a kézi ág (--claim/--id) sorrendje megváltozott');
});

t('🧠 a téves tanulságok kikerültek a memóriából (a Le Chat / Alexa+ / Playground / GPT Store / iPhone-lista / diagram)', () => {
  const j = JSON.parse(readFileSync(join(ROOT, 'memory', 'store.json'), 'utf-8'));
  for (const k of ['discontinued Le Chat', 'has not been widely', 'retired the Playground', 'shut down the GPT Store', 'or any later model (incorrect', 'Simple charts are supported on both free and paid tiers'])
    assert.ok(!j.items.some(it => String(it.text).includes(k)), 'visszajött a téves tanulság: ' + k);
});

if (hiba) { console.log(`\n❌ fact-check-helyreallitas.test: ${hiba} hiba`); process.exit(1); }
console.log('✅ fact-check-helyreallitas.test: mind rendben');
