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

export const SZINTEZIS_HOST = 'api.msedgeservices.com';
// A msedge-tts 2.0.7 saját értéke — a Sec-MS-GEC ehhez a verzióhoz illik.
export const GEC_VERZIO = '1-143.0.3650.96';

let kesz = null;

/** A msedge-tts osztálya az új hostra állítva. { MsEdgeTTS, OUTPUT_FORMAT } */
export async function edgeTts() {
  if (kesz) return kesz;
  const mod = await import('msedge-tts');
  const { MsEdgeTTS } = mod;
  MsEdgeTTS.getSynthUrl = async function () {
    const kapcsolat = MsEdgeTTS.generateUUID();
    const gec = await MsEdgeTTS.generateSecMsGec(MsEdgeTTS.TRUSTED_CLIENT_TOKEN);
    return `wss://${SZINTEZIS_HOST}/tts/cognitiveservices/websocket/v1`
      + `?Ocp-Apim-Subscription-Key=${MsEdgeTTS.TRUSTED_CLIENT_TOKEN}`
      + `&Sec-MS-GEC=${gec}&Sec-MS-GEC-Version=${GEC_VERZIO}&ConnectionId=${kapcsolat}`;
  };
  kesz = { MsEdgeTTS, OUTPUT_FORMAT: mod.OUTPUT_FORMAT };
  return kesz;
}

export default { SZINTEZIS_HOST, GEC_VERZIO, edgeTts };
