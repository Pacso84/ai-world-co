// ===================================================================
// TESZT — eszköz-fajták (mi mehet az "asszisztens" fejléc alá)
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// MIÉRT (2026-08-17, a user vette észre): a /tools oldal "Pick your assistant"
// ígérete alatt ott ült a Midjourney — képgenerátor a chat-asszisztensek
// között. A lap CÉG szerint csoportosított, és semmit nem tudott arról, MIFÉLE
// eszközről szól egy útmutató; amíg csak chat-asszisztensekről írtunk, a
// feltevés igaznak látszott.
//
// Ez a teszt KÉT dolgot őriz:
//   1) a besorolás ne csússzon el (Midjourney ≠ asszisztens),
//   2) ÚJ eszköz ne tudjon besorolatlanul megjelenni — az utolsó eset azt
//      méri, hogy minden ténylegesen megjelent cég/eszköz kap-e KIMONDOTT
//      besorolást. Új név → ez a teszt bukik, amíg valaki be nem sorolja.
//      (Enélkül a hiba pont ugyanúgy jönne vissza, ahogy ment: csendben.)
// ===================================================================

import assert from 'assert/strict';
import {
  KINDS, KIND_ORDER, DEFAULT_KIND, TOOL_KINDS,
  kindOf, isClassified, isAssistant, unclassified, scanGuideToolNames
} from './tool-kinds.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };

console.log('🧪 eszköz-fajták\n');

t('🖼️ a Midjourney NEM asszisztens — EZ VOLT A HIBA', () => {
  assert.equal(kindOf('Midjourney'), KINDS.IMAGE);
  assert.ok(!isAssistant('Midjourney'), 'a Midjourney nem mehet az LLM-fejléc alá');
  // A user szabálya: "az llm-nél nem lehet csak llm modellek".
  assert.notEqual(kindOf('Midjourney'), KINDS.ASSISTANT);
});

t('💬 a valódi LLM chat-asszisztensek azok maradnak', () => {
  for (const nev of ['ChatGPT', 'Gemini', 'Claude', 'Copilot', 'GitHub Copilot',
                     'Perplexity', 'Le Chat', 'DeepSeek', 'Qwen', 'Grok', 'Cohere']) {
    assert.equal(kindOf(nev), KINDS.ASSISTANT, nev + ' asszisztens kell legyen');
    assert.ok(isAssistant(nev));
  }
  // Cég-szinten is: a /tools CÉG szerint szekcionál, tehát a cégnévnek is
  // besorolhatónak kell lennie, nem csak az eszköznek.
  for (const ceg of ['OpenAI', 'Google', 'Anthropic', 'Microsoft', 'xAI']) {
    assert.equal(kindOf(ceg), KINDS.ASSISTANT, ceg + ' asszisztens-cég');
  }
});

t('🚫 az ISMERETLEN eszköz `other`, SOHA nem `assistant`', () => {
  // Ez a teszt lelke: az "amit nem ismerünk, az biztos chatbot" alapértelmezés
  // pontosan a javított hibát gyártaná újra, csak csendben.
  assert.equal(kindOf('Teljesen Uj Eszkoz 9000'), KINDS.OTHER);
  assert.equal(kindOf('Teljesen Uj Eszkoz 9000'), DEFAULT_KIND);
  assert.ok(!isAssistant('Teljesen Uj Eszkoz 9000'));
  assert.ok(!isClassified('Teljesen Uj Eszkoz 9000'), 'és tudjuk is, hogy nem soroltuk be');
  assert.notEqual(DEFAULT_KIND, KINDS.ASSISTANT, 'az alapértelmezés nem billenhet át');
});

t('üres/hibás névre sem esik szét, és nem lesz asszisztens', () => {
  for (const rossz of ['', '   ', null, undefined, 0, {}]) {
    assert.equal(kindOf(rossz), KINDS.OTHER);
    assert.ok(!isAssistant(rossz));
  }
});

t('a név kis-nagybetűre és szóközre nem érzékeny', () => {
  // A frontmatterbe ember és AI is ír — "chatgpt", "GitHub  Copilot" is előfordult.
  assert.equal(kindOf('chatgpt'), KINDS.ASSISTANT);
  assert.equal(kindOf('  MIDJOURNEY '), KINDS.IMAGE);
  assert.equal(kindOf('GitHub  Copilot'), KINDS.ASSISTANT);
});

t('🧰 nem-chat eszközök a helyükön (nem csak a Midjourney volt téves)', () => {
  // A besoroláskor derült ki: a Hugging Face (modell-tárhely) is az
  // "asszisztens"-ígéret alatt állt. Egy hiba ritkán van egyedül.
  assert.equal(kindOf('Hugging Face'), KINDS.OTHER);
  assert.equal(kindOf('Stable Diffusion'), KINDS.IMAGE);
  assert.equal(kindOf('Upscayl'), KINDS.IMAGE);
  assert.equal(kindOf('Project Genie'), KINDS.IMAGE);
  assert.equal(kindOf('Picsart'), KINDS.IMAGE);
  assert.equal(kindOf('Suno.ai'), KINDS.OTHER);
  assert.equal(kindOf('Alibaba Cloud'), KINDS.OTHER);
  assert.equal(kindOf('Credential Provider for Windows'), KINDS.OTHER);
  // A Databricks útmutatóját visszavontuk, a besorolása mégis bent maradt:
  // ha holnap új születik, ne az asszisztensek közt bukkanjon fel.
  assert.equal(kindOf('Databricks'), KINDS.DATA);
});

t('a fajta-lista zárt, és minden fajtának van sorrendbeli helye', () => {
  assert.deepEqual([...KIND_ORDER], ['assistant', 'image', 'data', 'other']);
  assert.equal(KIND_ORDER.length, Object.keys(KINDS).length, 'a lista nem nőhet észrevétlenül');
  for (const k of Object.values(KINDS)) assert.ok(KIND_ORDER.includes(k), k + ' kimaradt a sorrendből');
  // A nyilvántartás minden eleme érvényes fajtát kap.
  for (const [nev, k] of Object.entries(TOOL_KINDS)) {
    assert.ok(KIND_ORDER.includes(k), nev + ' fajtája érvénytelen: ' + k);
  }
});

t('az `unclassified` csak a tényleg ismeretleneket adja vissza', () => {
  assert.deepEqual(unclassified(['ChatGPT', 'Midjourney']), []);
  assert.deepEqual(unclassified(['ChatGPT', 'Uj Dolog']), ['Uj Dolog']);
  assert.deepEqual(unclassified(['Uj Dolog', 'uj  dolog']), ['Uj Dolog'], 'ugyanaz a név egyszer');
  assert.deepEqual(unclassified(null), []);
  assert.deepEqual(unclassified('nem tömb'), []);
});

t('🔒 MINDEN megjelent útmutató cége/eszköze BE VAN SOROLVA', () => {
  // Ez az őrszem: új eszközről szóló útmutató megjelenése ITT bukik el
  // előbb, nem az olvasó szeme előtt, egy hamis fejléc alatt.
  const { companies, tools } = scanGuideToolNames();
  assert.ok(companies.length > 0, 'a cikk-beolvasás nem találhat nullát');

  const hianyzoCeg = unclassified(companies);
  assert.deepEqual(hianyzoCeg, [],
    'BESOROLATLAN CÉG a /tools oldalon → vedd fel a core/tool-kinds.js-be: ' + hianyzoCeg.join(', '));

  const hianyzoEszkoz = unclassified(tools);
  assert.deepEqual(hianyzoEszkoz, [],
    'BESOROLATLAN ESZKÖZ egy megjelent útmutatóban → vedd fel a core/tool-kinds.js-be: ' + hianyzoEszkoz.join(', '));
});

t('📌 a cég-besorolás a /tools csoportosítását adja — és tartja a user szabályát', () => {
  // A /tools CÉG szerint szekcionál (a `#c-<cégslug>` horgony nem mozdítható),
  // ezért a csoportosítás a CÉG fajtáján múlik. Az asszisztens-fejléc alá
  // egyetlen nem-asszisztens cég sem kerülhet.
  const { companies } = scanGuideToolNames();
  const asszisztensek = companies.filter(isAssistant);
  assert.ok(!asszisztensek.includes('Midjourney'), 'a Midjourney nem lehet az asszisztensek közt');
  assert.ok(!asszisztensek.includes('Hugging Face'));
  assert.ok(asszisztensek.includes('OpenAI') && asszisztensek.includes('Google'),
    'a valódi asszisztens-cégek viszont ott maradnak');
});

console.log('\n✅ tool-kinds.test: mind a ' + pass + ' eset rendben');
