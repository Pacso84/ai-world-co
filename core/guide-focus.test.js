// core/guide-focus.js — útmutató-fókusz (2026-10-09, user: „először legyen eladásunk").
// Ingyenes, hálózat nélküli.
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { fokuszBeallitas, azonosEszkoz, maiFokuszDb, fokuszElore, fokuszHiany, fokuszOtletPrompt,
  fokuszCimOk, FOKUSZ_TARTALEK } from './guide-focus.js';
import { kovetkezoReel } from './reel-queue.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const olvas = p => readFileSync(join(ROOT, ...p.split('/')), 'utf-8');
let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };
console.log('\n🧪 guide-focus (útmutató-fókusz)');

const MA = '2026-10-10';
const CFG = { guide_focus: { enabled: true, tool: 'Alexa+', company: 'Amazon', until: '2026-10-23', per_day: 1, keywords: ['Alexa', 'Echo'] } };
const BE = fokuszBeallitas(CFG, MA);

t('🔒 kikapcsolva / lejárt / hiányos → semmi (a régi viselkedés)', () => {
  for (const c of [undefined, {}, { guide_focus: {} },
    { guide_focus: { ...CFG.guide_focus, enabled: false } },
    { guide_focus: { ...CFG.guide_focus, until: '2026-10-09' } },
    { guide_focus: { ...CFG.guide_focus, until: 'holnap' } },
    { guide_focus: { ...CFG.guide_focus, tool: '' } }]) {
    const b = fokuszBeallitas(c, MA);
    assert.equal(b.be, false, JSON.stringify(c));
    assert.equal(fokuszElore([{ tool: 'Alexa+' }], b).tema, null);
    assert.equal(fokuszHiany([], b), 0, 'kikapcsolva ne ötleteljen (pénz)');
    assert.equal(fokuszOtletPrompt(b), '');
  }
  assert.equal(fokuszBeallitas(CFG, '2026-10-23').be, true, 'az utolsó napon még él');
});

t('a napi darab 1–2 közé szorítva (elgépelés ne vigye el az egész keretet)', () => {
  assert.equal(fokuszBeallitas({ guide_focus: { ...CFG.guide_focus, per_day: 9 } }, MA).perDay, 2);
  assert.equal(fokuszBeallitas({ guide_focus: { ...CFG.guide_focus, per_day: 0 } }, MA).perDay, 1);
});

t('„Alexa+" = „Amazon Alexa+"; más eszköz nem', () => {
  assert.ok(azonosEszkoz('Alexa+', 'Amazon Alexa+'));
  assert.ok(azonosEszkoz('alexa+', 'Alexa+'));
  assert.ok(!azonosEszkoz('Alexa+', 'ChatGPT'));
  assert.ok(!azonosEszkoz('', ''), 'üres eszköz nem egyezik semmivel');
});

t('témasor: az ELSŐ fókusz-téma kerül elő, a többi sorrendje marad', () => {
  const T = [{ id: 'a', tool: 'ChatGPT' }, { id: 'b', tool: 'Alexa+' }, { id: 'c', tool: 'Gemini' }, { id: 'd', tool: 'Alexa+' }];
  const { tema, tobbi } = fokuszElore(T, BE);
  assert.equal(tema.id, 'b');
  assert.deepEqual(tobbi.map(x => x.id), ['a', 'c', 'd']);
  assert.equal(fokuszElore([{ id: 'x', tool: 'Claude' }], BE).tema, null, 'fókusz-téma nélkül nem talál ki semmit');
});

t('mai darab: csak a MA írt fókusz-útmutatók számítanak', () => {
  const metak = [{ tool: 'Alexa+', written_at: MA + 'T05:00:00Z' }, { tool: 'Alexa+', written_at: '2026-10-09T23:00:00Z' },
    { tool: 'ChatGPT', written_at: MA + 'T06:00:00Z' }];
  assert.equal(maiFokuszDb(metak, BE, MA), 1);
});

t('tartalék: csak a VÁRAKOZÓ (todo) fókusz-témák számítanak', () => {
  assert.equal(fokuszHiany([{ tool: 'Alexa+', status: 'done' }, { tool: 'Alexa+', status: 'todo' }], BE), FOKUSZ_TARTALEK - 1);
  assert.equal(fokuszHiany(Array.from({ length: FOKUSZ_TARTALEK }, () => ({ tool: 'Alexa+', status: 'todo' })), BE), 0);
});

t('🚫 az ötlet-kérés tiltja az összehasonlítást, a vásárlási tanácsot és az árat', () => {
  const p = fokuszOtletPrompt(BE);
  assert.match(p, /Alexa\+/);
  assert.match(p, /Never compare products/);
  assert.match(p, /never recommend what to buy/);
  assert.match(p, /never mention prices/);
  assert.ok(fokuszCimOk('Set up an Echo Show kitchen timer', BE));
  assert.ok(!fokuszCimOk('Plan a trip with ChatGPT', BE), 'elkalandozott ötlet nem kerülhet a fókusz-témák közé');
});

// ── a videós sor (core/reel-queue.js) ───────────────────────────────
const NOW = Date.parse(MA + 'T12:00:00Z');
const g = (slug, tool, nap, extra = {}) => ({ slug, type: 'guide', tool, published_at: `2026-10-${nap}T08:00:00Z`, reel_at: '', md: `title: "${slug}"`, ...extra });

t('🎬 Reel: a fókusz-útmutató elsőbbséget kap — akkor is, ha a változatosság kiszorítaná', () => {
  const cikkek = [
    g('regi-alexa', 'Alexa+', '05', { reel_at: '2026-10-08T10:00:00Z' }),   // a héten már volt Alexa-Reel
    g('chatgpt-x', 'ChatGPT', '07'),
    g('uj-alexa', 'Alexa+', '09')
  ];
  assert.equal(kovetkezoReel(cikkek, NOW, { napiMax: 2 }).slug, 'chatgpt-x', 'fókusz nélkül a régi viselkedés');
  assert.equal(kovetkezoReel(cikkek, NOW, { napiMax: 2, fokusz: 'Alexa+' }).slug, 'uj-alexa');
});

t('🎬 Reel: naponta legfeljebb EGY fókusz-Reel, a második ugyanúgy változatos', () => {
  const cikkek = [
    g('ma-alexa', 'Alexa+', '08', { reel_at: MA + 'T06:00:00Z' }),
    g('chatgpt-x', 'ChatGPT', '07'),
    g('uj-alexa', 'Alexa+', '09')
  ];
  assert.equal(kovetkezoReel(cikkek, NOW, { napiMax: 2, fokusz: 'Alexa+' }).slug, 'chatgpt-x');
});

t('🎬 Reel: a „csak friss" szabály (user, 09-27) a fókuszra is áll — régi útmutatóból nincs Reel', () => {
  const cikkek = [g('regi-alexa', 'Alexa+', '01'), g('chatgpt-x', 'ChatGPT', '08')];
  assert.equal(kovetkezoReel(cikkek, NOW, { napiMax: 2, maxKorNap: 7, fokusz: 'Alexa+' }).slug, 'chatgpt-x');
});

// ── bekötés ─────────────────────────────────────────────────────────
t('🔌 be van kötve: témasor, ötletelő (--focus), CEO, Reel, config', () => {
  const ga = olvas('agents/guide/agent.js');
  assert.match(ga, /from '\.\.\/\.\.\/core\/guide-focus\.js'/);
  assert.match(ga, /fokuszElore\(todo, fok\)/, 'a témasor nem kapja meg a fókuszt');
  assert.match(ga, /if \(args\.focus\)/, 'nincs --focus mód');
  assert.match(ga, /fokuszOtletPrompt\(fokusz\)/, 'az ötletelő nem kapja meg a fókusz-kérést');
  assert.match(ga, /fokuszCimOk\(title, fokusz\)/, 'az elkalandozott ötletet nem szűri');
  assert.match(olvas('agents/ceo/agent.js'), /runAgent\('agents\/guide\/agent\.js', \['--focus'\]\)/, 'a CEO nem indítja a fókusz-ötletelést');
  assert.match(olvas('core/reel-post.js'), /fokusz: fokusz\.be \? fokusz\.tool : ''/, 'a Reel nem kapja meg a fókuszt');
  const cfg = JSON.parse(olvas('config.json'));
  assert.ok(cfg.content && cfg.content.guide_focus, 'config.json content.guide_focus hiányzik');
  assert.equal(typeof cfg.content.guide_focus.enabled, 'boolean');
});

if (hiba) { console.log(`\n❌ guide-focus.test: ${hiba} hiba`); process.exit(1); }
console.log('\n✅ guide-focus.test: mind rendben');
