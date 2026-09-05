// ===================================================================
// TESZT — cég + eszköz név-összefűzés (kettőződés nélkül)
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
// A miértet lásd a core/tool-label.js fejlécében.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { toolLabel } from './tool-label.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };

console.log('🧪 cég + eszköz név-összefűzés\n');

// --- A HIBA, AMIÉRT EZ A MODUL LÉTREJÖTT ---
// "This guide uses GitHub GitHub Copilot" — élesben, 3 nyelven, a
// schema.org FAQ-jelölésben is.
t('a cégnévvel KEZDŐDŐ eszköznév nem kettőződik', () => {
  const parok = [
    ['GitHub', 'GitHub Copilot', 'GitHub Copilot'],
    ['Apple', 'Apple Intelligence', 'Apple Intelligence'],
    ['Meta', 'Meta AI', 'Meta AI'],
    ['Hugging Face', 'Hugging Face Spaces', 'Hugging Face Spaces'],
    ['Google', 'Google Photos', 'Google Photos'],
    ['DeepSeek', 'DeepSeek Chat', 'DeepSeek Chat'],
    ['Mistral', 'Mistral AI', 'Mistral AI'],
    ['Microsoft', 'Microsoft 365 Copilot', 'Microsoft 365 Copilot'],
    ['Alibaba', 'Alibaba Cloud', 'Alibaba Cloud']
  ];
  for (const [c, e, varva] of parok) assert.equal(toolLabel(c, e), varva, `${c} + ${e}`);
});

t('az AZONOS cég- és eszköznév egyszer szerepel', () => {
  // Élesben 14 cikk: company="DeepSeek" tool="DeepSeek" → "DeepSeek DeepSeek".
  for (const n of ['DeepSeek', 'Perplexity', 'Hugging Face', 'Cohere', 'Midjourney', 'Kling'])
    assert.equal(toolLabel(n, n), n, n);
});

t('a cégnévbe ÁGYAZOTT eszköznév sem kettőződik (fordított irány)', () => {
  // Élesben: company="Perplexity AI" tool="Perplexity" → "Perplexity AI Perplexity".
  // A hosszabb, teljesebb név nyer.
  assert.equal(toolLabel('Perplexity AI', 'Perplexity'), 'Perplexity AI');
  assert.equal(toolLabel('Mistral AI', 'Mistral'), 'Mistral AI');
});

// --- AHOL A MOSTANI VISELKEDÉS HELYES, ÉS MEG KELL MARADNIA ---
t('a független eszköznév elé KIKERÜL a cégnév', () => {
  const parok = [
    ['NVIDIA', 'ChatRTX', 'NVIDIA ChatRTX'],
    ['OpenAI', 'ChatGPT', 'OpenAI ChatGPT'],
    ['Google', 'Gemini', 'Google Gemini'],
    ['Anthropic', 'Claude', 'Anthropic Claude'],
    ['Microsoft', 'Copilot', 'Microsoft Copilot'],
    ['Mistral', 'Le Chat', 'Mistral Le Chat'],
    ['xAI', 'Grok', 'xAI Grok'],
    ['Amazon', 'Alexa+', 'Amazon Alexa+'],
    ['Alibaba', 'Qwen', 'Alibaba Qwen'],
    ['Google', 'NotebookLM', 'Google NotebookLM'],
    ['Apple', 'Image Playground', 'Apple Image Playground'],
    ['NVIDIA', 'Upscayl', 'NVIDIA Upscayl']
  ];
  for (const [c, e, varva] of parok) assert.equal(toolLabel(c, e), varva, `${c} + ${e}`);
});

// --- SZÓHATÁR: EXPLICIT, SOHA NEM PUSZTA ELŐTAG-ILLESZTÉS ---
// Ugyanaz a lecke, mint a core/us-spelling.js analysis→analyzis csapdájánál
// és a core/tool-regex.js raglistájánál: a megengedő minta hamis találatot ad.
t('a cégnév csak SZÓHATÁRON illeszkedik, előtagként SOHA', () => {
  // A "Meta" nem előtagja szóhatáron a "Metaphor"-nak → a cégnév marad.
  assert.equal(toolLabel('Meta', 'Metaphor'), 'Meta Metaphor');
  assert.equal(toolLabel('Open', 'OpenAI'), 'Open OpenAI');
  assert.equal(toolLabel('Cohere', 'Coherence'), 'Cohere Coherence');
  assert.equal(toolLabel('Apple', 'Applebee'), 'Apple Applebee');
  assert.equal(toolLabel('Mist', 'Mistral'), 'Mist Mistral');
  // Számjegy is szónak számít: a "Copilot" nem nyeli el a "Copilot365"-öt.
  assert.equal(toolLabel('Copilot', 'Copilot365'), 'Copilot Copilot365');
});

t('a szóhatár nem csak a szóköz', () => {
  // Kötőjel, kettőspont, pont — egyik sem betű és nem számjegy.
  assert.equal(toolLabel('GitHub', 'GitHub-Copilot'), 'GitHub-Copilot');
  assert.equal(toolLabel('Adobe', 'Adobe: Firefly'), 'Adobe: Firefly');
  assert.equal(toolLabel('Notion', 'Notion.AI'), 'Notion.AI');
});

t('a kis/nagybetű eltérés nem zavar meg', () => {
  assert.equal(toolLabel('github', 'GitHub Copilot'), 'GitHub Copilot');
  assert.equal(toolLabel('GITHUB', 'GitHub Copilot'), 'GitHub Copilot');
  assert.equal(toolLabel('GitHub', 'github copilot'), 'github copilot');
  assert.equal(toolLabel('hugging face', 'Hugging Face Spaces'), 'Hugging Face Spaces');
  // Ékezetes eltérés viszont NEM ugyanaz a szó.
  assert.equal(toolLabel('Mistral', 'Mistrál AI'), 'Mistral Mistrál AI');
});

// --- ELVÁLASZTÓ (a 📘 útmutató-csempe morzsamenüje) ---
// A csempén "Cég · Eszköz" alakban áll a két név — de a kettőződés ott is
// kilátszott: "📘 GitHub · GitHub Copilot", 378 kiépített oldalon.
t('két külön névnél MEGMARAD a megadott elválasztó', () => {
  const parok = [
    ['NVIDIA', 'ChatRTX', 'NVIDIA · ChatRTX'],
    ['OpenAI', 'ChatGPT', 'OpenAI · ChatGPT'],
    ['Google', 'Gemini', 'Google · Gemini'],
    ['Anthropic', 'Claude', 'Anthropic · Claude'],
    ['Mistral', 'Le Chat', 'Mistral · Le Chat'],
    ['Meta', 'Metaphor', 'Meta · Metaphor']       // szóhatár: itt sem nyel el
  ];
  for (const [c, e, varva] of parok) assert.equal(toolLabel(c, e, ' · '), varva, `${c} + ${e}`);
});

t('ha az egyik név ELNYELI a másikat, elválasztó sem kell', () => {
  const parok = [
    ['GitHub', 'GitHub Copilot', 'GitHub Copilot'],
    ['Apple', 'Apple Intelligence', 'Apple Intelligence'],
    ['Meta', 'Meta AI', 'Meta AI'],
    ['DeepSeek', 'DeepSeek', 'DeepSeek'],
    ['Hugging Face', 'Hugging Face', 'Hugging Face'],
    ['Perplexity AI', 'Perplexity', 'Perplexity AI'],
    ['Microsoft', 'Microsoft 365 Copilot', 'Microsoft 365 Copilot']
  ];
  for (const [c, e, varva] of parok) assert.equal(toolLabel(c, e, ' · '), varva, `${c} + ${e}`);
});

t('az elválasztó CSAK két név KÖZÉ kerül, a végére soha', () => {
  // Hiányzó mezőnél a régi kód a filter(Boolean)-nel védekezett — ez itt is kell,
  // különben "OpenAI · " vagy " · ChatGPT" megy ki az oldalra.
  assert.equal(toolLabel('OpenAI', '', ' · '), 'OpenAI');
  assert.equal(toolLabel('', 'ChatGPT', ' · '), 'ChatGPT');
  assert.equal(toolLabel(null, 'ChatGPT', ' · '), 'ChatGPT');
  assert.equal(toolLabel('OpenAI', '   ', ' · '), 'OpenAI');
  assert.equal(toolLabel('', '', ' · '), '');
});

t('az ALAPÉRTELMEZETT elválasztó továbbra is a szóköz', () => {
  // A GYIK-mondat és a search.json viselkedése NEM változhat.
  assert.equal(toolLabel('NVIDIA', 'ChatRTX'), 'NVIDIA ChatRTX');
  assert.equal(toolLabel('NVIDIA', 'ChatRTX', undefined), 'NVIDIA ChatRTX');
  assert.equal(toolLabel('OpenAI', 'ChatGPT'), toolLabel('OpenAI', 'ChatGPT', ' '));
  // Üres elválasztó kérése nem ragaszthatja össze a két nevet.
  assert.equal(toolLabel('NVIDIA', 'ChatRTX', ''), 'NVIDIA ChatRTX');
  assert.equal(toolLabel('NVIDIA', 'ChatRTX', null), 'NVIDIA ChatRTX');
});

t('bármilyen elválasztóval ugyanaz a NÉV-döntés születik', () => {
  // Az elnyelés szabálya az elválasztótól FÜGGETLEN — csak a köztes jel más.
  for (const sep of [' ', ' · ', ' — ', ' / ', ' | ']) {
    assert.equal(toolLabel('GitHub', 'GitHub Copilot', sep), 'GitHub Copilot', sep);
    assert.equal(toolLabel('NVIDIA', 'ChatRTX', sep), 'NVIDIA' + sep + 'ChatRTX', sep);
  }
});

t('hiányzó mező esetén a meglévő megy ki', () => {
  assert.equal(toolLabel('', 'ChatGPT'), 'ChatGPT');
  assert.equal(toolLabel('OpenAI', ''), 'OpenAI');
  assert.equal(toolLabel(null, 'ChatGPT'), 'ChatGPT');
  assert.equal(toolLabel('OpenAI', undefined), 'OpenAI');
});

t('mindkét mező üres → üres sztring (nem "undefined")', () => {
  for (const [c, e] of [['', ''], [null, null], [undefined, undefined], [null, undefined], ['  ', '\t']])
    assert.equal(toolLabel(c, e), '', JSON.stringify([c, e]));
});

t('a fölös szóköz nem szivárog ki a szövegbe', () => {
  assert.equal(toolLabel('  GitHub ', ' GitHub Copilot  '), 'GitHub Copilot');
  assert.equal(toolLabel(' NVIDIA', 'ChatRTX '), 'NVIDIA ChatRTX');
  assert.equal(toolLabel('  ', ' ChatGPT'), 'ChatGPT');
});

t('a szabályos regex-karakter nem robbantja szét a mintát', () => {
  // Ha a cégnevet nyersen tennénk regexbe, ezek dobnának vagy vadul illesztenének.
  assert.equal(toolLabel('C++', 'C++ Builder'), 'C++ Builder');
  assert.equal(toolLabel('A.I.', 'A.I. Dungeon'), 'A.I. Dungeon');
  assert.equal(toolLabel('(x)', 'ChatGPT'), '(x) ChatGPT');
  assert.equal(toolLabel('[', ']'), '[ ]');
});

t('a nem-sztring bemenet nem borítja fel', () => {
  assert.equal(toolLabel(0, 'ChatGPT'), 'ChatGPT');
  assert.equal(toolLabel(false, 'ChatGPT'), 'ChatGPT');
  assert.equal(typeof toolLabel({}, []), 'string');
});

// --- VALÓDI ÉLES ADATON ---
// Kitalált adaton a zöld teszt már egyszer elfedte, hogy az éles cikkek alakja
// más (2026-08-25, reelCaption). Ezért minden pár a lemezről jön.
t('EGYETLEN élő cikk-pár sem ad kettőződő címkét', () => {
  const dir = join(ROOT, 'content', 'articles');
  const parok = new Map();
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    let a; try { a = JSON.parse(readFileSync(join(dir, f), 'utf-8')); } catch { continue; }
    const m = a._meta || {};
    if (!m.company && !m.tool) continue;
    parok.set(`${m.company}|${m.tool}`, [m.company, m.tool]);
  }
  assert.ok(parok.size >= 10, 'túl kevés éles pár (' + parok.size + ') — jó helyen keresünk?');

  const rossz = [];
  for (const [c, e] of parok.values()) {
    const cimke = toolLabel(c, e);
    // 1) Szomszédos szó-ismétlés (ez látszott a GYIK-ben).
    const szavak = cimke.split(/\s+/).filter(Boolean);
    for (let i = 1; i < szavak.length; i++)
      if (szavak[i].toLowerCase() === szavak[i - 1].toLowerCase()) rossz.push(`${cimke} (ismételt szó)`);
    // 2) Több szavas cégnév kétszer ("Hugging Face Hugging Face Spaces").
    const c2 = String(c || '').trim();
    if (c2 && cimke.toLowerCase().split(c2.toLowerCase()).length - 1 > 1) rossz.push(`${cimke} (cégnév 2×)`);
  }
  console.log(`     📏 ${parok.size} éles cég/eszköz pár átnézve`);
  assert.deepEqual(rossz, [], rossz.length + ' kettőződő címke');
});

t('minden éles pár címkéje tartalmazza az eszköznevet', () => {
  // Az ellenőrzés IRÁNYA számít (2026-08-14, prompt-szivárgás): a
  // "ne kettőződjön" mérce önmagában a "csonkolj mindent" megoldást is
  // átengedné. Ezért külön kimondjuk: az eszköznév NEM veszhet el.
  const dir = join(ROOT, 'content', 'articles');
  const hianyzo = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    let a; try { a = JSON.parse(readFileSync(join(dir, f), 'utf-8')); } catch { continue; }
    const m = a._meta || {};
    const e = String(m.tool || '').trim(), c = String(m.company || '').trim();
    const cimke = toolLabel(c, e);
    if (e && !cimke.toLowerCase().includes(e.toLowerCase())) hianyzo.push(`${c} + ${e} → ${cimke}`);
    if (c && !e && cimke !== c) hianyzo.push(`${c} + (üres) → ${cimke}`);
  }
  assert.deepEqual(hianyzo, [], hianyzo.length + ' címkéből kiesett az eszköznév');
});

// --- A BUILD TÉNYLEG EZT HASZNÁLJA-E ---
// Egy javítás, amit senki nem hív, pontosan annyit ér, mint egy őrszem,
// ami a CI-naplóba ír (2026-08-10).
t('a website/build.js a közös függvényt hívja, nem a nyers join-t', () => {
  const src = readFileSync(join(ROOT, 'website', 'build.js'), 'utf-8');
  assert.ok(/from '\.\.\/core\/tool-label\.js'/.test(src), 'nincs import a build.js-ben');
  assert.ok(/const faqTool = toolLabel\(/.test(src), 'a GYIK nem a toolLabel()-t hívja');
  assert.ok(/toolLabel\(a\.company, a\.tool, ' · '\)/.test(src), 'a 📘 csempe nem a toolLabel()-t hívja');
  // Semmilyen elválasztóval nem maradhat nyers összefűzés.
  for (const sep of [' ', ' · ']) {
    const nyers = new RegExp('\\[a\\.company, a\\.tool\\]\\.filter\\(Boolean\\)\\.join\\(\'' + sep + '\'\\)');
    assert.ok(!nyers.test(src), `maradt nyers [company, tool].join('${sep}') a build.js-ben`);
  }
});

console.log(`\n✅ ${pass} teszt rendben`);
