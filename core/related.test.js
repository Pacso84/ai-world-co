// ===================================================================
// TESZT — kapcsolódó cikkek rangsorolása
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// MIÉRT (2026-08-15, élesben mérve): egy DEEPFAKE-CSALÁSOKRÓL szóló cikk alján
// hétvégi autós út és szülinapi ajándékötletek álltak, miközben van
// adathalászat-cikkünk. Ok: a két cikk EGYETLEN címkén sem osztozott, a régi
// pontozás pedig csak címke-átfedést nézett → 0 találat → tartalék → a négy
// legfrissebb cikk.
// ===================================================================

import assert from 'assert/strict';
import { rankRelated, tokenize, MIN_SIM, REL_MIN, REL_MAX, STOPWORDS } from './related.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };

console.log('🧪 kapcsolódó cikkek\n');

const cikk = (file, title, tags = [], extra = {}) => ({
  file, title, subtitle: '', tags, category: 'guide', company: '',
  publishedAt: '2026-08-01T00:00:00Z', isGuide: true, ...extra
});

t('a szótő-bontás kiszedi a zajt és a rövid szavakat', () => {
  assert.deepEqual(tokenize('How to Spot a Deepfake Video'), ['spot', 'deepfake', 'video']);
  assert.deepEqual(tokenize('voice-clones'), ['voice', 'clones'], 'a kötőjel határ');
  assert.deepEqual(tokenize(''), []);
  assert.deepEqual(tokenize(null), []);
});

t('a SAJÁT sablonszavaink is zajnak számítanak', () => {
  // "how to ... with AI in 5 minutes" minden címünkben ott van — ha bent
  // maradna, pont a rossz párokat erősítené.
  for (const w of ['ai', 'guide', 'steps', 'minutes', 'easy']) {
    assert.ok(STOPWORDS.has(w), w + ' legyen zajszó');
  }
});

// ⚠️ A KORPUSZ MÉRETE SZÁMÍT. A TF-IDF azt súlyozza, mennyire RITKA egy szó a
// gyűjteményben — négy dokumentumnál minden szó "ritka", tehát semmi sem az, és
// a valódi rokon a küszöb alá esik. (Ez elsőre meg is fogott: a 4 elemű
// próbában a friss autós út nyert.) A MIN_SIM a 711 cikkes ÉLES korpuszon van
// mérve, ezért a teszt is ad annyi hátteret, hogy az IDF értelmet nyerjen.
const toltelek = () => [
  'Turn meeting notes into action plans', 'Build a packing list for any trip',
  'Write a heartfelt wedding speech', 'Fix spreadsheet formula errors',
  'Practice a job interview out loud', 'Summarise a long report quickly',
  'Create playlists for a dinner party', 'Draft a polite decline message',
  'Compare phone plans without stress', 'Plan a vegetable garden layout'
].map((cim, i) => cikk('t' + i + '.json', cim, ['x' + i]));

t('⚠️ AZ ÉLES HIBA: a rokon téma nyer, nem a friss', () => {
  // A deepfake-cikk mellé a SZÉLHÁMOSSÁG-cikknek kell kerülnie — NEM az aznapi
  // autós útnak. Ez a teszt a valódi, élesben látott bukást őrzi.
  const A = [
    ...toltelek(),
    cikk('deepfake.json', 'Spot a deepfake scam video before you share it',
      ['ai-safety', 'deepfakes']),
    cikk('phishing.json', 'Spot a phishing scam email before you click it',
      ['security', 'phishing'], { publishedAt: '2026-07-01T00:00:00Z' }),   // RÉGEBBI
    cikk('roadtrip.json', 'Plan a weekend road trip with Meta in fifteen',
      ['road-trip'], { publishedAt: '2026-08-14T00:00:00Z' }),              // legfrissebb
    cikk('gifts.json', 'Brainstorm birthday presents from a vague brief',
      ['gifts'], { publishedAt: '2026-08-14T00:00:00Z' })
  ];
  const r = rankRelated(A, { min: 1, max: 3 });
  const lista = r.get('deepfake.json');
  assert.equal(lista[0].file, 'phishing.json',
    'a témában rokon cikk álljon elöl, akkor is, ha régebbi');
  assert.ok(!lista.some(x => x.file === 'roadtrip.json'),
    'a friss, de témán kívüli cikk NE kerüljön be');
});

t('azonos cégről szóló hírek közelebb kerülnek', () => {
  const A = [
    cikk('a.json', 'Copilot adds spreadsheet formulas', ['excel'], { company: 'Microsoft' }),
    cikk('b.json', 'Microsoft ships a new Copilot pane', ['office'], { company: 'Microsoft' }),
    cikk('c.json', 'A totally unrelated cooking topic', ['food'], { company: '' })
  ];
  const r = rankRelated(A, { min: 1, max: 2 });
  assert.equal(r.get('a.json')[0].file, 'b.json');
});

t('gyenge egyezésnél TARTALÉK jön, hogy ne legyen árva oldal', () => {
  // Az árva oldal (0 belső link) rosszabbul indexelhető — fiatal domainnél
  // ez valódi kár. Inkább laza kapcsolat, mint semmi.
  const A = [
    cikk('maganyos.json', 'Zebra xylophone quokka', ['zzz']),
    cikk('b.json', 'Completely different subject matter here', ['bbb']),
    cikk('c.json', 'Another unrelated headline entirely', ['ccc']),
    cikk('d.json', 'Yet another distinct topic', ['ddd']),
    cikk('e.json', 'And one more separate thing', ['eee'])
  ];
  const r = rankRelated(A, { min: 4, max: 6 });
  assert.equal(r.get('maganyos.json').length, 4, 'feltöltve a minimumig');
});

t('a cikk SOHA nem ajánlja önmagát', () => {
  const A = [cikk('a.json', 'Spot a deepfake scam', ['x']), cikk('b.json', 'Spot a deepfake scam too', ['x'])];
  for (const [file, lista] of rankRelated(A)) {
    assert.ok(!lista.some(x => x.file === file), file + ' nem ajánlhatja magát');
  }
});

t('nincs ismétlődés a listában', () => {
  const A = Array.from({ length: 8 }, (_, i) => cikk('f' + i + '.json', 'Spot a phishing scam email ' + i, ['security']));
  for (const lista of rankRelated(A).values()) {
    assert.equal(new Set(lista.map(x => x.file)).size, lista.length, 'mindegyik egyszer');
  }
});

t('determinisztikus: kétszer futtatva ugyanaz', () => {
  // Enélkül két build más sorrendet adna ugyanarra a tartalomra, és minden
  // futás fölöslegesen újraírná az oldalakat.
  const A = Array.from({ length: 6 }, (_, i) => cikk('g' + i + '.json', 'Same words repeated topic ' + i, ['tag']));
  const a = [...rankRelated(A).get('g0.json')].map(x => x.file);
  const b = [...rankRelated(A).get('g0.json')].map(x => x.file);
  assert.deepEqual(a, b);
});

t('a küszöb és a határok épek', () => {
  assert.ok(MIN_SIM > 0 && MIN_SIM < 0.5, 'se mindent, se semmit ne engedjen át');
  assert.ok(REL_MIN >= 3 && REL_MAX >= REL_MIN, 'értelmes tartomány');
});

t('rossz bemenetre nem esik szét', () => {
  assert.equal(rankRelated([]).size, 0);
  assert.equal(rankRelated(null).size, 0);
  assert.equal(rankRelated().size, 0);
  assert.equal(rankRelated([null, undefined]).size, 0);
  const r = rankRelated([{ file: 'x.json' }, { file: 'y.json' }], { min: 1 });
  assert.ok(r.has('x.json'), 'cím és címke nélküli cikk sem borítja fel');
});

console.log('\n✅ related.test: mind a ' + pass + ' eset rendben');
