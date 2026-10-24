// core/edge-tts.js — a felolvasó az ÚJ Microsoft-hoston (2026-10-12). Hálózat nélkül.
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { edgeTts, SZINTEZIS_HOST, SZINTEZIS_UT, szintezisUrl, beallitTokenForras, EDGE_TTS_COMMIT } from './edge-tts.js';

// 10-24: a v2 tokent a Python edge-tts adja (CI-ban telepítve) — a tesztben hamis forrás, hálózat/Python nélkül.
// A minta-token VALÓDI: az USA-beli próbafutás (tts-proba.yml, 10-24) írta ki az 1761350400-as időpontra.
const MINTA = { token: 'E45DDD5265B0ACED-C260B75EA2BD06259C3E20F40CD77408BA7657605E984C424A85203C8EADC4F8', verzio: '2-143.0.3650.75' };
beallitTokenForras(() => MINTA);

let hiba = 0;
const t = async (nev, fn) => { try { await fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };
console.log('\n🧪 edge-tts');

await t('🔴 10-24: a szintézis a v2 tokennel a speech.platform.bing.com-ra megy (az api.msedgeservices.com „200”-at ad — USA-beli próbafutással igazolva)', async () => {
  const { MsEdgeTTS } = await edgeTts();
  const url = await MsEdgeTTS.getSynthUrl();
  assert.equal(SZINTEZIS_HOST, 'speech.platform.bing.com');
  assert.ok(url.startsWith('wss://' + SZINTEZIS_HOST + SZINTEZIS_UT + '?'), 'rossz végpont: ' + url.slice(0, 90));
  assert.match(url, /[?&]TrustedClientToken=[0-9A-F]{32}(&|$)/, 'a kulcs nem TrustedClientToken-ként megy');
  assert.ok(url.includes('&Sec-MS-GEC=' + MINTA.token + '&'), 'nem a v2 token megy');
  assert.match(url, /[?&]Sec-MS-GEC-Version=2-\d+\.\d+\.\d+\.\d+(&|$)/, 'a verzió-előtag „2-” kell legyen (edge-tts #507)');
  assert.match(url, /[?&]ConnectionId=[0-9a-f-]{32,36}(&|$)/);
  assert.ok(!url.includes('msedgeservices'));
});

await t('a cím-építő tiszta függvény, a sorrend és a kódolás rögzített', async () => {
  assert.equal(szintezisUrl({ kulcs: 'K', token: 'A-B', verzio: '2-1.2.3.4', kapcsolat: 'c' }),
    'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=K&Sec-MS-GEC=A-B&Sec-MS-GEC-Version=2-1.2.3.4&ConnectionId=c');
});

await t('🔴 a GitHub-futás telepíti a RÖGZÍTETT edge-tts-t, a videógyártás ELŐTT', async () => {
  const yml = readFileSync(new URL('../.github/workflows/auto.yml', import.meta.url), 'utf-8');
  const pip = yml.indexOf('pip install "git+https://github.com/rany2/edge-tts@' + EDGE_TTS_COMMIT + '"');
  assert.ok(pip > 0, 'nincs telepítve (vagy nem a rögzített commit)');
  assert.match(EDGE_TTS_COMMIT, /^[0-9a-f]{40}$/, 'teljes commit-hash kell (ellátási lánc)');
  assert.ok(pip < yml.indexOf('name: Reel — napi videó gyártása'), 'a videógyártás után települ');
  assert.ok(yml.lastIndexOf('actions/setup-python@v5', pip) > 0, 'a rendszer-pip az Ubuntu 24-en tiltott → setup-python kell');
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

// ── 10-14: „Unexpected server response: 429" → az EGÉSZ videógyártás megállt, a pótló
// TikTok-videó el sem készült. A szintézis most türelmesen újrapróbál. Hálózat nélkül:
// hamis felolvasó-osztály, ami az első N hívásra 429-cel bukik.
const { hangSzintezis } = await import('./edge-tts.js');
const hamisTts = (bukas, uzenet = 'Unexpected server response: 429') => {
  let hivas = 0;
  class Hamis {
    async setMetadata() { hivas++; if (hivas <= bukas) throw new Error(uzenet); }
    toStream(szoveg) {
      const fel = {};
      const audioStream = { on: (ev, fn) => { fel[ev] = fn; if (ev === 'close') setTimeout(() => { fel.data?.(Buffer.from('hang:' + szoveg)); fn(); }, 0); } };
      return { audioStream };
    }
  }
  return { mod: { MsEdgeTTS: Hamis, OUTPUT_FORMAT: { AUDIO_24KHZ_48KBITRATE_MONO_MP3: 'x' } }, hivasok: () => hivas };
};

await t('🔴 10-14: a 429-es válasz után türelmesen újrapróbál, és visszaadja a hangot', async () => {
  const h = hamisTts(2);
  const varasok = [];
  const buf = await hangSzintezis(h.mod, 'hang', 'Hello', { alvas: async ms => { varasok.push(ms); } });
  assert.equal(buf.toString(), 'hang:Hello');
  assert.equal(h.hivasok(), 3);
  assert.deepEqual(varasok, [20000, 60000], 'növekvő várakozás kell, különben a Microsoft tovább tilt');
});

await t('a próbák elfogyása után a hiba továbbmegy (nem nyeli el)', async () => {
  const h = hamisTts(9);
  await assert.rejects(hangSzintezis(h.mod, 'hang', 'x', { alvas: async () => {} }), /429/);
  assert.equal(h.hivasok(), 3);
});

await t('más hibára NEM próbál újra (pl. rossz hang) — azonnal szól', async () => {
  const h = hamisTts(1, 'Voice not found');
  await assert.rejects(hangSzintezis(h.mod, 'hang', 'x', { alvas: async () => {} }), /Voice not found/);
  assert.equal(h.hivasok(), 1);
});

await t('🔌 a Reel-gyártó (short-video.js) az újrapróbáló szintézist használja', async () => {
  const src = readFileSync(new URL('../core/short-video.js', import.meta.url), 'utf-8');
  assert.match(src, /await et\.hangSzintezis\(\{ MsEdgeTTS, OUTPUT_FORMAT \}, voice, cards\[i\]\.mond\)/);
});

if (hiba) { console.log(`\n❌ edge-tts.test: ${hiba} hiba`); process.exit(1); }
console.log('\n✅ edge-tts.test: mind rendben');
