// ===================================================================
// TERMÉKNÉV-HORGONY REGEX — tesztek
// ===================================================================
import assert from 'assert/strict';
import { toolRegex, HU_SUFFIXES } from './tool-regex.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };
const hit = (tool, text, lang) => { const m = toolRegex(tool, lang).exec(text); return m ? m[0] : null; };

console.log('🧪 terméknév-horgony\n');

// ---------- ami eddig is működött, MARADJON ----------

t('ragtalan alak illeszkedik minden nyelven', () => {
  for (const l of ['en', 'hu', 'es']) assert.equal(hit('Gemini', 'a Gemini jó', l), 'Gemini');
});

t('kötőjeles rag illeszkedik (a ChatGPT-t eset)', () => {
  assert.equal(hit('ChatGPT', 'ha ChatGPT-t használsz', 'hu'), 'ChatGPT');
  assert.equal(hit('Claude', 'a Claude-ot nyisd meg', 'hu'), 'Claude');
});

t('más szó, ami ugyanúgy kezdődik, NEM illeszkedik', () => {
  assert.equal(hit('Claude', 'Claudia nevű', 'hu'), null);
  assert.equal(hit('Gemini', 'Geminiden', 'hu'), null, 'a "den" nem magyar rag');
});

t('kis-nagybetű számít (köznévi "grok" nem link)', () => {
  assert.equal(hit('Grok', 'to grok something', 'en'), null);
});

// ---------- A JAVÍTÁS: magyar tapadó toldalék ----------

t('MAGYARBAN a tapadó toldalék után is illeszkedik', () => {
  assert.equal(hit('Gemini', 'ha Geminit használsz', 'hu'), 'Gemini');
  assert.equal(hit('Copilot', 'a Copilotot nyisd meg', 'hu'), 'Copilot');
  assert.equal(hit('Grok', 'a Grokkal beszélgetsz', 'hu'), 'Grok');
});

t('a LINK SZÖVEGE csak a terméknév, a rag NEM része', () => {
  // Ugyanaz a szabály, mint a "ChatGPT-t"-nél: a rag a linken kívül marad.
  assert.equal(hit('Gemini', 'Geminivel dolgozol', 'hu'), 'Gemini',
    'a találat nem lehet "Geminivel"');
});

t('ANGOLBAN a tapadó toldalék NEM illeszkedik', () => {
  assert.equal(hit('Gemini', 'Geminit', 'en'), null);
  assert.equal(hit('Copilot', 'Copilotot', 'es'), null);
});

t('a mért leggyakoribb ragok mind átmennek', () => {
  // A 835 elbukó előfordulás 99%-át ez a 12 alak adta (éles mérés, 2026-08-05).
  for (const s of ['ot', 't', 'nek', 'tal', 'et', 'nak', 'vel', 'tól', 'be', 'hez', 'kal', 'ba']) {
    assert.equal(hit('Copilot', 'a Copilot' + s + ' most', 'hu'), 'Copilot', 'rag: ' + s);
  }
});

t('a birtokos alakok is átmennek', () => {
  for (const s of ['ja', 'ját', 'jával', 'juk']) {
    assert.equal(hit('Copilot', 'a Copilot' + s + ' most', 'hu'), 'Copilot', 'rag: ' + s);
  }
});

t('NEM-rag utótag magyarban sem illeszkedik', () => {
  // Éles mérésből: a "Chat" utótag egyszer előfordult — az NEM rag.
  assert.equal(hit('Le Chat', 'Le ChatChat', 'hu'), null);
  assert.equal(hit('Copilot', 'Copilotautó', 'hu'), null);
});

t('az igei -ta/-te NEM rag, elgépelést nem linkelünk', () => {
  // "Nyisd meg a Geminita" — valódi fordítási hiba az éles szövegben.
  // A helyes alak "Geminit"; az elgépelést nem tesszük linkelhetővé.
  assert.equal(hit('Gemini', 'Nyisd meg a Geminita', 'hu'), null);
  assert.equal(hit('Gemini', 'Nyisd meg a Geminit', 'hu'), 'Gemini');
});

// ---------- szerkezet ----------

t('a raglista explicit, nem előtag-illesztés', () => {
  assert.ok(Array.isArray(HU_SUFFIXES) && HU_SUFFIXES.length > 20);
  assert.ok(HU_SUFFIXES.every(s => /^[a-záéíóúüőűöä]+$/.test(s)), 'minden rag kisbetűs');
});

t('a többszavas terméknév is működik', () => {
  assert.equal(hit('GitHub Copilot', 'a GitHub Copilottal', 'hu'), 'GitHub Copilot');
});

t('a regex-metakarakter a terméknévben nem robban', () => {
  assert.equal(hit('Alexa+', 'az Alexa+ jó', 'hu'), 'Alexa+');
});

console.log('\n✅ tool-regex.test: mind a ' + pass + ' eset rendben');
