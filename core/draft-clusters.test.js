// ===================================================================
// TESZT — hír-csoportosítás korlátai
// ===================================================================
// INGYENES, hálózat nélküli.
//
// MIÉRT: user-kérés (2026-08-18): „ne több nézőpontból legyen több cikk, hanem
// több hírből egy cikk". A rokonságot AI dönti el, mert gépi mérce nem tudja:
// a ROKON Midjourney-ötös cím-hasonlósága 0,056, a FÜGGETLEN OpenAI-ötösé
// 0,022 — megkülönböztethetetlen. Ez a modul NEM dönt rokonságról; azt tartatja
// be, hogy az AI döntése ne mehessen félre.
// ===================================================================

import assert from 'assert/strict';
import {
  parseClusterReply, planWriteOrder, isGenericTheme,
  MAX_CLUSTER, MIN_CLUSTER, MIN_THEME_LEN
} from './draft-clusters.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };

console.log('🧪 Hír-csoportosítás\n');

const ID = ['a.json', 'b.json', 'c.json', 'd.json', 'e.json', 'f.json'];

t('a jó választ elfogadja', () => {
  const g = parseClusterReply([{ theme: 'Midjourney V8 rollout', ids: ['a.json', 'b.json'] }], ID);
  assert.equal(g.length, 1);
  assert.deepEqual(g[0].ids, ['a.json', 'b.json']);
});

t('📌 a Midjourney-ötös ÖSSZEVONHATÓ', () => {
  const g = parseClusterReply([{ theme: 'Midjourney V8 release and web updates', ids: ID.slice(0, 5) }], ID);
  assert.equal(g.length, 1);
  assert.equal(g[0].ids.length, 5);
});

t('📌 az OpenAI-ötös NEM vonható össze — az ítélet külön hagyja őket', () => {
  // Ez a legfontosabb teszt. Ha az ítélet nem ad csoportot, MINDEN hír külön
  // cikk marad — pontosan úgy, ahogy ma. Az összevonás soha nem kötelező.
  const g = parseClusterReply([], ID);
  assert.deepEqual(g, []);
  const terv = planWriteOrder(ID.slice(0, 5), g);
  assert.equal(terv.length, 5, 'öt független bejelentés → öt cikk');
  terv.forEach(x => assert.equal(x.ids.length, 1));
});

t('🚫 az általános téma NEM csoport', () => {
  // „AI news" nem közös téma, hanem a rovat neve. Ha ezt elfogadnánk, az ítélet
  // a nap összes hírét egyetlen cikké gyúrhatná.
  assert.equal(isGenericTheme('AI news'), true);
  assert.equal(isGenericTheme('news'), true);
  assert.equal(isGenericTheme('   '), true);
  assert.equal(isGenericTheme('Midjourney V8 rollout'), false);
  for (const rossz of ['AI', 'news', 'updates', 'various', '']) {
    assert.deepEqual(parseClusterReply([{ theme: rossz, ids: ['a.json', 'b.json'] }], ID), []);
  }
});

t('a túl rövid téma sem csoport', () => {
  assert.ok('AI x'.length < MIN_THEME_LEN);
  assert.deepEqual(parseClusterReply([{ theme: 'AI x', ids: ['a.json', 'b.json'] }], ID), []);
});

t(`a csoport max ${MAX_CLUSTER} elemű — a többi külön cikk lesz`, () => {
  const g = parseClusterReply([{ theme: 'Nagyon sok Midjourney hir', ids: ID }], ID);
  assert.equal(g[0].ids.length, MAX_CLUSTER);
  const terv = planWriteOrder(ID, g);
  assert.equal(terv.length, 2, '5-ös csoport + a kimaradt egy külön');
  assert.equal(terv[1].ids.length, 1);
});

t(`az egyelemű „csoport" nem csoport (min ${MIN_CLUSTER})`, () => {
  assert.deepEqual(parseClusterReply([{ theme: 'Valami rendes tema', ids: ['a.json'] }], ID), []);
});

t('az ismeretlen azonosítót kidobja', () => {
  const g = parseClusterReply([{ theme: 'Valami rendes tema', ids: ['a.json', 'NINCS.json', 'b.json'] }], ID);
  assert.deepEqual(g[0].ids, ['a.json', 'b.json']);
});

t('egy hír csak EGY csoportba kerülhet', () => {
  // A második csoport a `b.json` nélkül marad, így egyelemű lenne → kiesik.
  const g = parseClusterReply([
    { theme: 'Elso rendes tema', ids: ['a.json', 'b.json'] },
    { theme: 'Masodik rendes tema', ids: ['b.json', 'c.json'] }
  ], ID);
  assert.equal(g.length, 1);
  assert.deepEqual(g[0].ids, ['a.json', 'b.json']);
});

t('🛟 SZEMÉT VÁLASZ → minden hír külön cikk (a mai viselkedés)', () => {
  for (const szemet of [null, undefined, 'szoveg', {}, [1, 2, 3], [{ nincs: 'ids' }]]) {
    assert.deepEqual(parseClusterReply(szemet, ID), [], JSON.stringify(szemet));
  }
  const terv = planWriteOrder(ID, parseClusterReply(null, ID));
  assert.equal(terv.length, ID.length);
});

t('a terv MINDEN híre pontosan egyszer szerepel', () => {
  const g = parseClusterReply([{ theme: 'Midjourney V8 rollout', ids: ['a.json', 'b.json', 'c.json'] }], ID);
  const terv = planWriteOrder(ID, g);
  const mind = terv.flatMap(x => x.ids);
  assert.equal(mind.length, ID.length);
  assert.equal(new Set(mind).size, ID.length);
});

t('a csoportok elöl vannak a tervben', () => {
  const g = parseClusterReply([{ theme: 'Midjourney V8 rollout', ids: ['e.json', 'f.json'] }], ID);
  const terv = planWriteOrder(ID, g);
  assert.equal(terv[0].ids.length, 2, 'a csoport megy elsőként');
  assert.ok(terv[0].theme);
});

console.log('\n✅ draft-clusters.test: mind a ' + pass + ' eset rendben');
