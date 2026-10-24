// ===================================================================
// EDGE FELOLVASÓ (msedge-tts) — az ÚJ Microsoft-hoston (2026-10-12)
// ===================================================================
// MI TÖRTÉNT: 10-12-én mindkét CI-futásban „Edge TTS WebSocket error:
// Unexpected server response: 403" → 0 Reel, 0 TikTok (a hang nélkül nincs
// videó). Helyben már 10-10 óta így volt. OK: a Microsoft 2026 októberében
// lezárta a szintézist a régi hoston (speech.platform.bing.com) — országonként
// fokozatosan, az USA-ban (a GitHub-futtató) 10-12-től. Az Edge 155 már az
// api.msedgeservices.com-on szintetizál, és ez a régi kulcsot is elfogadja,
// Ocp-Apim-Subscription-Key néven (edge-tts #490, javítás: PR #491).
// Helyben ellenőrizve 10-12: a régi host 403, az új azonnal mp3-at ad
// (24 kHz, mono — ugyanaz a hang, ugyanaz a formátum).
//
// A msedge-tts 2.0.9 (a legújabb) is még a régi hostot hívja, ezért itt, EGY
// helyen írjuk felül a cím-építőt; MINDEN videókészítő ezen át kapja az
// osztályt (core/edge-tts.test.js őrzi). Ha a csomag egyszer magától átáll,
// ez a felülírás ártalmatlan.
// ===================================================================

import { execFileSync } from 'node:child_process';

// ── 2026-10-24: ÚJ TOKEN (Sec-MS-GEC v2) ────────────────────────────
// MI TÖRTÉNT: 10-24-én mind a 3 futásban „Unexpected server response: 200" → 0 Reel, 0 TikTok-videó.
// A Microsoft új tokent kér (edge-tts #492: Sec-MS-GEC v2; #507: a verzió-előtag „2-"), és az
// api.msedgeservices.com most minden kapcsolódásra 200-at ad. USA-beli próbafutással igazolva
// (.github/workflows/tts-proba.yml, 10-24): a v2 tokennel a speech.platform.bing.com ad mp3-at ÉS
// szóidőzítést (a Reel-feliratokhoz kell), az új hoszt nem.
// A v2 token egy visszafejtett számítás az edge-tts csomagban (LGPLv3) — NEM másoljuk át: a CI a
// RÖGZÍTETT commitot telepíti (auto.yml), és mi csak a tokent kérjük tőle. Helyben (HU) a régi hoszt
// országos tiltás miatt amúgy is 403 — a videó a CI-ban készül.
export const SZINTEZIS_HOST = 'speech.platform.bing.com';
export const SZINTEZIS_UT = '/consumer/speech/synthesize/readaloud/edge/v1';
export const EDGE_TTS_COMMIT = 'bd44c1d1aaebdc1db7f47456ee12431b42ec7cac';   // edge-tts master, 2026-10-14 (v2 token + „2-")

/** A szintézis websocket-címe — tiszta függvény. */
export function szintezisUrl({ kulcs, token, verzio, kapcsolat }) {
  return `wss://${SZINTEZIS_HOST}${SZINTEZIS_UT}?TrustedClientToken=${kulcs}`
    + `&Sec-MS-GEC=${token}&Sec-MS-GEC-Version=${verzio}&ConnectionId=${kapcsolat}`;
}

// A token 5 perces ablakra szól (a Windows-idő 300 mp-re kerekítve) → ablakonként egyszer kérjük.
let gyorsTar = { ablak: -1, adat: null };
function pythonToken() {
  const ablak = Math.floor(Date.now() / 300000);
  if (gyorsTar.ablak === ablak) return gyorsTar.adat;
  const py = process.env.EDGE_TTS_PYTHON || 'python3';
  let ki;
  try {
    ki = execFileSync(py, ['-c', 'from edge_tts.drm import DRM; from edge_tts.constants import SEC_MS_GEC_VERSION as v; print(DRM.generate_sec_ms_gec()); print(v)'],
      { encoding: 'utf-8', timeout: 20000 }).trim().split(/\r?\n/);
  } catch (e) {
    throw new Error('Edge TTS: a Python edge-tts (v2 token) nem érhető el — a CI „Függőségek” lépése telepíti (' + String(e.message).slice(0, 120) + ')');
  }
  gyorsTar = { ablak, adat: { token: ki[0], verzio: ki[1] } };
  return gyorsTar.adat;
}
let tokenForras = pythonToken;
/** Csak teszthez: a token forrása (hálózat/Python nélkül). */
export function beallitTokenForras(fn) { tokenForras = fn; }

let kesz = null;

/** A msedge-tts osztálya a v2 tokennel a működő végpontra állítva. { MsEdgeTTS, OUTPUT_FORMAT } */
export async function edgeTts() {
  if (kesz) return kesz;
  const mod = await import('msedge-tts');
  const { MsEdgeTTS } = mod;
  MsEdgeTTS.getSynthUrl = async function () {
    const { token, verzio } = tokenForras();
    return szintezisUrl({ kulcs: MsEdgeTTS.TRUSTED_CLIENT_TOKEN, token, verzio, kapcsolat: MsEdgeTTS.generateUUID() });
  };
  kesz = { MsEdgeTTS, OUTPUT_FORMAT: mod.OUTPUT_FORMAT };
  return kesz;
}

// ── TÜRELMES SZINTÉZIS (2026-10-14) ─────────────────────────────────
// Élesben: „Edge TTS WebSocket error: Unexpected server response: 429" — a Microsoft
// egy futásban sok kérést kapott (a nap Reeljeinek újragyártása + a TikTok-extra), és
// visszaszólt. Egyetlen 429 az EGÉSZ gyártást megállította, a pótló TikTok-videó el sem
// készült (10-14: 2/3). Ezért a túlterheléses hibára NÖVEKVŐ várakozással újrapróbálunk;
// minden más hiba (pl. rossz hang) azonnal továbbmegy — azt az újrapróba nem javítja.
export const TULTERHELES_RX = /\b429\b|too many requests|Unexpected server response: 5\d\d/i;
export const VARASOK_MS = [20000, 60000];

/** Egy szöveg hangja (mp3 Buffer). A 429-re / 5xx-re VARASOK_MS szerint újrapróbál. */
export async function hangSzintezis({ MsEdgeTTS, OUTPUT_FORMAT }, voice, szoveg,
  { varasok = VARASOK_MS, alvas = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  for (let proba = 0; ; proba++) {
    try {
      const tts = new MsEdgeTTS();
      await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const { audioStream } = tts.toStream(szoveg);
      const d = [];
      audioStream.on('data', x => d.push(x));
      await new Promise((ok, hiba) => { audioStream.on('close', ok); audioStream.on('error', hiba); });
      return Buffer.concat(d);
    } catch (e) {
      if (proba >= varasok.length || !TULTERHELES_RX.test(String(e?.message || e))) throw e;
      console.log(`   ⏳ felolvasó túlterhelt (${String(e?.message || e).slice(0, 60)}) — ${varasok[proba] / 1000} mp múlva újra`);
      await alvas(varasok[proba]);
    }
  }
}

export default { SZINTEZIS_HOST, SZINTEZIS_UT, EDGE_TTS_COMMIT, szintezisUrl, edgeTts, hangSzintezis };
