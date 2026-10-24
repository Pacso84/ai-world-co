// EDGE TTS PRÓBA (2026-10-24) — a .github/workflows/tts-proba.yml futtatja (kézi indítás, $0).
// A msedge-tts osztály a Python edge-tts-től kapott Sec-MS-GEC v2 tokennel: régi és új hoszton.
// NEM teszt (nem .test.js): hálózatot hív. Helyben a régi hoszt országos tiltás miatt 403.
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
const mod = await import('msedge-tts');
const { MsEdgeTTS, OUTPUT_FORMAT } = mod;
const py = kod => execSync(`python3 -c "${kod}"`, { encoding: 'utf-8' }).trim();
const verzio = py('from edge_tts.constants import SEC_MS_GEC_VERSION as v; print(v)');
const token = () => py('from edge_tts.drm import DRM; print(DRM.generate_sec_ms_gec())');
const T = MsEdgeTTS.TRUSTED_CLIENT_TOKEN;
const VALTOZATOK = {
  'regi hoszt + v2': id => `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${T}&Sec-MS-GEC=${token()}&Sec-MS-GEC-Version=${verzio}&ConnectionId=${id}`,
  'uj hoszt + v2': id => `wss://api.msedgeservices.com/tts/cognitiveservices/websocket/v1?Ocp-Apim-Subscription-Key=${T}&Sec-MS-GEC=${token()}&Sec-MS-GEC-Version=${verzio}&ConnectionId=${id}`
};
console.log('verzió:', verzio, '· msedge-tts:', createRequire(import.meta.url)('msedge-tts/package.json').version);
for (const [nev, url] of Object.entries(VALTOZATOK)) {
  MsEdgeTTS.getSynthUrl = async () => url(MsEdgeTTS.generateUUID());
  try {
    const tts = new MsEdgeTTS();
    await tts.setMetadata('en-US-AriaNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3, { wordBoundaryEnabled: true });
    const { audioStream, metadataStream } = tts.toStream('Hello, this is a short test.');
    const d = []; let meta = 0;
    metadataStream?.on('data', () => meta++);
    await new Promise((ok, no) => { audioStream.on('data', x => d.push(x)); audioStream.on('end', ok); audioStream.on('error', no); setTimeout(() => no(new Error('időtúllépés')), 25000); });
    console.log('✅', nev, '→', Buffer.concat(d).length, 'bájt mp3,', meta, 'metaadat-csomag');
    tts.close?.();
  } catch (e) { console.log('❌', nev, '→', e.message); }
}
// ÉLES ÚT: maga a core/edge-tts.js (amit a Reel-, TikTok- és napi videó-gyártó hív) — friss betöltés
{
  const et = await import('./edge-tts.js?eles');
  try {
    const k = await et.edgeTts();
    const buf = await et.hangSzintezis(k, 'en-US-AriaNeural', 'Hello from the production module.', { varasok: [] });
    console.log('✅ core/edge-tts.js hangSzintezis →', buf.length, 'bájt mp3');
    const tts = new k.MsEdgeTTS();
    await tts.setMetadata('en-US-GuyNeural', k.OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, { wordBoundaryEnabled: true });
    const { audioStream, metadataStream } = tts.toStream('Word timing for subtitles works.');
    let meta = 0; metadataStream?.on('data', () => meta++);
    await new Promise((ok, no) => { audioStream.on('data', () => {}); audioStream.on('end', ok); audioStream.on('error', no); setTimeout(() => no(new Error('időtúllépés')), 25000); });
    console.log('✅ core/edge-tts.js szóidőzítés (agents/video útja) →', meta, 'metaadat-csomag');
  } catch (e) { console.log('❌ core/edge-tts.js →', e.message); }
}
process.exit(0);
