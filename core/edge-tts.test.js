// core/edge-tts.js — a felolvasó az ÚJ Microsoft-hoston (2026-10-12). Hálózat nélkül.
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { edgeTts, SZINTEZIS_HOST } from './edge-tts.js';

let hiba = 0;
const t = async (nev, fn) => { try { await fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };
console.log('\n🧪 edge-tts');

await t('🔴 a szintézis az ÚJ hostra megy (a régi speech.platform.bing.com 403-at ad, US-ban 10-12 óta)', async () => {
  const { MsEdgeTTS } = await edgeTts();
  const url = await MsEdgeTTS.getSynthUrl();
  assert.ok(url.startsWith('wss://' + SZINTEZIS_HOST + '/tts/cognitiveservices/websocket/v1?'), 'régi host: ' + url.slice(0, 80));
  assert.match(url, /[?&]Ocp-Apim-Subscription-Key=[0-9A-F]{32}(&|$)/, 'a kulcs nem Ocp-Apim-Subscription-Key-ként megy');
  assert.match(url, /[?&]Sec-MS-GEC=[0-9A-F]{64}(&|$)/, 'hiányzik a Sec-MS-GEC');
  assert.match(url, /[?&]Sec-MS-GEC-Version=1-\d+\.\d+\.\d+\.\d+(&|$)/);
  assert.match(url, /[?&]ConnectionId=[0-9a-f-]{32,36}(&|$)/);   // a msedge-tts kötőjeles UUID-t ad — élőben így működik
  assert.ok(!url.includes('speech.platform.bing.com'));
});

await t('ugyanazt az osztályt adja vissza (a javítás egyszer fut, nem halmozódik)', async () => {
  const a = await edgeTts(), b = await edgeTts();
  assert.equal(a.MsEdgeTTS, b.MsEdgeTTS);
  assert.ok(a.OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
});

await t('🔌 a videókészítők a közös modult használják, nem a csupasz msedge-tts-t', async () => {
  for (const f of ['core/short-video.js', 'core/daily-summary-video.js', 'agents/video/agent.js']) {
    const src = readFileSync(new URL('../' + f, import.meta.url), 'utf-8');
    assert.ok(!/import\(['"]msedge-tts['"]\)/.test(src), f + ': még közvetlenül importálja a msedge-tts-t (régi host → 403)');
    assert.match(src, /edge-tts\.js['"]\)\)\.edgeTts\(\)|edgeTts\(\)/, f + ': nem a core/edge-tts.js-t használja');
  }
});

if (hiba) { console.log(`\n❌ edge-tts.test: ${hiba} hiba`); process.exit(1); }
console.log('\n✅ edge-tts.test: mind rendben');
