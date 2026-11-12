// TESZT — hír → útmutató a hivatalos súgóból (core/sugo-parositas.js). Ingyenes, hálózat nélküli.
import assert from 'assert/strict';
import { readFileSync } from 'fs';
import {
  SUGO_PAROSITAS_BE, NAPI_MAX, sugoSzolgaltatok, masodikEselyKell, napiMaradek,
  valasztoPrompt, valasztoValasz, ellenorzoPrompt, ellenorzoValasz, meglevoTema
} from './sugo-parositas.js';

let pass = 0, hiba = 0;
const t = (n, f) => { try { f(); pass++; console.log('  ✅ ' + n); } catch (e) { hiba++; console.log('  ❌ ' + n + '\n     ' + String(e.message).split('\n')[0]); } };
console.log('🧪 súgó-alapú párosítás\n');

t('🔌 bekapcsolva, napi 1', () => { assert.equal(SUGO_PAROSITAS_BE, true); assert.equal(NAPI_MAX, 1); });

t('csak jóváhagyott súgó: OpenAI/Google/Microsoft/Anthropic/Mistral igen, ElevenLabs/MiniMax/Picsart nem', () => {
  assert.deepEqual(sugoSzolgaltatok('openai-blog'), ['openai']);
  assert.deepEqual(sugoSzolgaltatok('google-gemini'), ['gemini']);
  assert.deepEqual(sugoSzolgaltatok('elevenlabs'), []);
  assert.deepEqual(sugoSzolgaltatok('minimax-blog'), []);
  assert.deepEqual(sugoSzolgaltatok('picsart'), []);
  assert.deepEqual(sugoSzolgaltatok(''), []);
});

// A VALÓDI 11-10/11-11-i elutasított termékhírek (címek a content/articles-ből).
t('🔑 második esély: a valódi elutasított LLM-termékhírek kapnak, a többi nem', () => {
  const el = { guide_worthy: false };
  assert.equal(masodikEselyKell({ sourceId: 'openai-blog', cim: 'Introducing Businesses in ChatGPT', parsed: el }), true);
  assert.equal(masodikEselyKell({ sourceId: 'google-gemini', cim: 'Gemini 4 Carbon is now available', parsed: el }), true);
  assert.equal(masodikEselyKell({ sourceId: 'google-ai-blog', cim: 'Gemini Intelligence: New features, on more devices', parsed: el }), true);
  // nincs jóváhagyott súgó
  assert.equal(masodikEselyKell({ sourceId: 'elevenlabs', cim: 'Introducing Scribe v3 and v3 Live, our most accurate speech-to-text', parsed: el }), false);
  // esettanulmány (nem termékhír)
  assert.equal(masodikEselyKell({ sourceId: 'openai-blog', cim: 'Australian universities are creating AI-native graduates', parsed: el }), false);
  // a párosító elfogadta → nincs mit pótolni; értelmezhetetlen válasz → nem
  assert.equal(masodikEselyKell({ sourceId: 'openai-blog', cim: 'Introducing Images 2.6', parsed: { guide_worthy: true } }), false);
  assert.equal(masodikEselyKell({ sourceId: 'openai-blog', cim: 'Introducing Images 2.6', parsed: null }), false);
});

t('napi keret: a ma született súgó-alapú téma levonódik, a tegnapi nem', () => {
  const most = Date.parse('2026-11-11T21:30:00Z');
  assert.equal(napiMaradek([], most), 1);
  assert.equal(napiMaradek([{ sugo_alapu: true, created_at: '2026-11-11T04:00:00Z' }], most), 0);
  assert.equal(napiMaradek([{ sugo_alapu: true, created_at: '2026-11-10T22:00:00Z' }], most), 1);
  assert.equal(napiMaradek([{ created_at: '2026-11-11T04:00:00Z' }], most), 1, 'a nem súgó-alapú téma nem számít');
  assert.equal(napiMaradek([], NaN), 0, '🔒 hibás idő → 0');
});

const INDEX = [
  { url: 'https://help.openai.com/en/articles/11084440-images-in-chatgpt', cim: 'Images in ChatGPT' },
  { url: 'https://help.openai.com/en/articles/20001635-setting-up-your-business-on-chatgpt', cim: 'Setting up your business on ChatGPT' },
  { url: 'https://evil.example.com/x', cim: 'Kamu' }
];

t('választó: a prompt számozott listát kap; a válasz csak a listából, csak engedélyezett címre', () => {
  const p = valasztoPrompt({ cim: 'Introducing Businesses in ChatGPT', kivonat: 'Businesses can set up...' }, INDEX);
  assert.match(p.felhasznalo, /2\. Setting up your business on ChatGPT/);
  assert.match(p.rendszer, /Pick 0 if no article/);
  assert.equal(valasztoValasz('{"pick": 2, "reason": "x"}', INDEX).url, INDEX[1].url);
  assert.equal(valasztoValasz('```json\n{"pick": 1}\n```', INDEX).url, INDEX[0].url);
  assert.equal(valasztoValasz('{"pick": 0}', INDEX), null, 'a 0 = egyik sem');
  assert.equal(valasztoValasz('{"pick": 3}', INDEX), null, '🔒 nem engedélyezett domain');
  assert.equal(valasztoValasz('{"pick": 9}', INDEX), null, 'listán kívüli sorszám');
  assert.equal(valasztoValasz('nem json', INDEX), null);
});

t('ellenőrző: csak ok:true + „How to …” cím megy át; a mezők tisztítva', () => {
  const p = ellenorzoPrompt({ cim: 'X' }, { cim: 'Images in ChatGPT', url: INDEX[0].url, szoveg: 'Step 1 …' });
  assert.match(p.rendszer, /using ONLY what the help article says/);
  assert.match(p.felhasznalo, /Step 1/);
  const jo = ellenorzoValasz('{"ok":true,"title":"How to set up your business on ChatGPT","tool":"ChatGPT","company":"OpenAI","angle":"a","level":"x","audience":"y"}');
  assert.equal(jo.ok, true); assert.equal(jo.tool, 'ChatGPT'); assert.equal(jo.level, 'beginner'); assert.equal(jo.audience, 'both');
  assert.equal(ellenorzoValasz('{"ok":false,"reason":"admin only"}').ok, false);
  assert.equal(ellenorzoValasz('{"ok":true,"title":"ChatGPT business tools explained"}').ok, false, 'nem How to → nincs ígéret');
  assert.equal(ellenorzoValasz('{"ok":"true","title":"How to x"}').ok, false, 'csak a valódi true');
  assert.equal(ellenorzoValasz('').ok, false);
});

t('🔴 meglévő téma: idegen eszközre SOHA (MiniMax kép ≠ Gemini kép), az eszköz neve nem közös szó', () => {
  const topics = [
    { id: 'gemini-images', tool: 'Gemini', company: 'Google', title: 'How to create images with Gemini' },
    { id: 'minimax-code', tool: 'MiniMax', company: 'MiniMax', title: 'Getting started with MiniMax Code' },
    { id: 'chatgpt-images', tool: 'ChatGPT', company: 'OpenAI', title: 'How to create images in ChatGPT' }
  ];
  assert.equal(meglevoTema({ tool: 'MiniMax', company: 'MiniMax', title: 'How to generate 4K images with MiniMax H3-Image' }, topics), null);
  assert.equal(meglevoTema({ tool: 'ChatGPT', company: 'OpenAI', title: 'How to make images with ChatGPT Images 2.6' }, topics).id, 'chatgpt-images');
  assert.equal(meglevoTema({ tool: '', company: '', title: 'How to create images' }, topics), null, 'eszköz és cég nélkül nincs összekötés');
});

t('🔑 VALÓDI ADAT: a 11-08-i „GPT Image 2.6 in Picsart” nem kötődik a custom GPT útmutatóhoz', () => {
  const topics = JSON.parse(readFileSync(new URL('../guides/guide-topics.json', import.meta.url), 'utf-8')).topics;
  const x = meglevoTema({ tool: 'Picsart', company: 'Picsart', title: 'How to use GPT Image 2.6 in Picsart' }, topics);
  assert.ok(!x || String(x.tool).toLowerCase() === 'picsart', 'idegen eszközű témához kötötte: ' + (x && x.id));
  const y = meglevoTema({ tool: 'MiniMax', company: 'MiniMax', title: 'How to generate 4K images with MiniMax H3-Image' }, topics);
  assert.ok(!y || /image/i.test(y.title), '🔴 a MiniMax-képhír nem képes útmutatóhoz kötődött: ' + (y && y.id));
});

t('🔌 a párosító tényleg használja (második esély + új meglevoTema)', () => {
  const src = readFileSync(new URL('../agents/pairing/agent.js', import.meta.url), 'utf-8');
  assert.match(src, /masodikEselyKell\(/, 'a második esély nincs bekötve');
  assert.match(src, /meglevoTema\(/, 'a régi, idegen eszközre is kötő egyezés maradt');
  assert.match(src, /official_sources:/, 'a téma nem kapja meg a súgócikket');
  assert.match(src, /sugo_alapu: true/);
});

// ── 2. RÉSZ: az útmutató-író CSAK a súgóból, az Ellenőrző a súgón méri a gombneveket ──────────────────
const SP = await import('./sugo-parositas.js');
const { sugoBlokk, sugoUtmutatoJelzes } = SP;
const { engedelyezett } = await import('./sugo-index.js');
const { readdirSync } = await import('fs');
const { blockingIssues, lessonFor, LECKES_KODOK, issueCode } = await import('./auto-check-codes.js');

const SUGO = 'To switch models in Gemini Apps, go to gemini.google.com. At the top, click the model menu. '
  + 'Select Gemini 4 Carbon. If you do not see it, check your plan. You can switch back at any time from the same menu. '
  + 'Model availability can vary by country and language. '.repeat(12);

t('író-blokk: a súgó szövege + „csak ebből” szabály; üres → üres', () => {
  const b = sugoBlokk([{ url: 'https://support.google.com/gemini/answer/18648722', cim: 'About Gemini models', szoveg: SUGO }]);
  assert.match(b, /OFFICIAL HELP ARTICLE/);
  assert.match(b, /ONLY source/);
  assert.match(b, /About Gemini models/);
  assert.match(b, /click the model menu/);
  assert.equal(sugoBlokk([]), '');
  assert.equal(sugoBlokk(null), '');
});

t('🔴 ellenőrző: a súgóban nem szereplő magabiztos gombnevek → elutasító kód; a súgóval egyező szöveg átmegy', () => {
  const kitalalt = '## Step 1 — Open the menu\nClick the **Upgrade** button, then open the **Labs** menu and select **Carbon Mode**.\n';
  const jo = '## Step 1 — Pick the model\nAt the top, click the model menu and select **Gemini 4 Carbon**.\n';
  const j = sugoUtmutatoJelzes(kitalalt, SUGO);
  assert.ok(j && issueCode(j) === 'GUIDE_UI_NOT_IN_HELP', 'a kitalált gombnevek átmentek: ' + j);
  assert.equal(blockingIssues([j]).length, 1, 'a kód nem blokkoló');
  assert.ok(LECKES_KODOK.includes('GUIDE_UI_NOT_IN_HELP') && /help article/.test(lessonFor(j) || ''), 'nincs lecke-szöveg');
  assert.equal(sugoUtmutatoJelzes(jo, SUGO), null);
  assert.equal(sugoUtmutatoJelzes(kitalalt, ''), null, 'súgószöveg nélkül nem ítél');
});

t('🔴 a régi, kézzel írt útmutatók official_sources-ára (sima URL, nem jóváhagyott súgó) a gát NEM vonatkozik', () => {
  const { sugoForrasok } = SP;
  assert.deepEqual(sugoForrasok({ official_sources: ['https://help.openai.com/en/articles/1'] }), [], 'jelölés nélkül nem');
  assert.deepEqual(sugoForrasok({ sugo_alapu: true, official_sources: ['https://help.openai.com/en/articles/1-x'] }),
    [{ url: 'https://help.openai.com/en/articles/1-x', title: '' }], 'sima URL is mehet');
  assert.deepEqual(sugoForrasok({ sugo_alapu: true, official_sources: [{ url: 'https://support.zoom.com/hc/x', title: 'Z' }] }), [], 'nem jóváhagyott súgó nem');
  assert.deepEqual(sugoForrasok(null), []);
  // VALÓDI ADAT (2026-11-12 módosítva): eddig 0 élő útmutató esett a gát alá (mind kézzel írt, sugo_alapu nélkül).
  // 11-12-én megjelent az első SZÁNDÉKOS súgó-alapú útmutató (ARTICLE_GUIDE_how-to-use-gemini-4-carbon, sugo_alapu: true,
  // official_sources = support.google.com/gemini/…) → már nem a „0 darab” a helyes állítás, hanem az: ami a gát alá esik,
  // az mind valódi súgó-alapú útmutató, és minden forrás-URL jóváhagyott súgóra mutat.
  const dir = new URL('../content/articles/', import.meta.url);
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    let meta; try { meta = JSON.parse(readFileSync(new URL(f, dir), 'utf-8'))._meta; } catch { continue; }
    const forrasok = sugoForrasok(meta);
    if (!forrasok.length) continue;
    assert.equal(meta.sugo_alapu, true, '🔴 ' + f + ': a gát alá esik, de nincs sugo_alapu jelölése');
    assert.equal(meta.type, 'guide', '🔴 ' + f + ': a gát nem útmutatóra futna le');
    for (const s of forrasok) assert.ok(engedelyezett(s.url), '🔴 ' + f + ': nem jóváhagyott súgó-URL: ' + s.url);
  }
});

t('🔌 az író letölti a súgót és nem ír nélküle; az Ellenőrző a súgón mér', () => {
  const g = readFileSync(new URL('../agents/guide/agent.js', import.meta.url), 'utf-8');
  assert.match(g, /sugoBlokk\(/, 'az író nem kapja a súgót');
  assert.match(g, /official_sources: topic\.official_sources/, 'a vázlat nem viszi tovább a súgócikket');
  assert.match(g, /sugo_alapu: topic\.sugo_alapu === true/, 'a vázlat nem viszi tovább a súgó-jelölést');
  assert.match(g, /súgó nem tölthető le/, 'súgó nélkül is írna (emlékezetből)');
  assert.equal((g.match(/sugoForrasok\(/g) || []).length, 3, 'az író, az átdolgozó ÉS (11-12, 0d) az átdolgozó név-szűrője is a jelölésre szűrt listát használja');
  const e = readFileSync(new URL('../agents/ellenorzo/agent.js', import.meta.url), 'utf-8');
  assert.match(e, /sugoUtmutatoJelzes\(/, 'az Ellenőrző nem méri a súgón');
  assert.match(e, /sugoForrasok\(writerData\._meta\)/, 'az Ellenőrző a régi, kézzel írt útmutatókra is lefutna');
});

if (hiba) { console.log(`\n❌ sugo-parositas.test: ${hiba} hiba`); process.exit(1); }
console.log(`\n✅ sugo-parositas.test: mind a ${pass} eset rendben`);
