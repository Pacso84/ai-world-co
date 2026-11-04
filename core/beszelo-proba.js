// ===================================================================
// BESZÉLŐ KABALA — PRÓBA (2026-10-11) — csak a .github/workflows/beszelo-proba.yml futtatja
// ===================================================================
// A kérdés: tud-e az ingyenes MI (LTX-2.3, Hugging Face ZeroGPU) a kabala-
// figurából TERMÉSZETESEN beszélő hírolvasót csinálni? User (10-10): „nem gagyi
// dolgokat gyártunk, minőséget próbálunk adni!" — ha a szájmozgás nem
// természetes, NEM rakjuk ki. Ez a próba csak megmutatja, nem posztol.
// A kép a honlapon már nyilvános: website/assets/images/mascot-weekly.jpg.
//
// 1. kör (10-11): két 6 mp-es változat — a user: „tetszik, de lehetne hosszabb!"
// 2. kör (10-11): MINI-HÍRADÓ — 3 × 10 mp (a Space felső határa) ugyanabból a
//   képből, FIX seeddel (a hang darabonként ne változzon). Az összefűzés helyben
//   történik. Napi keret: ~4 hívás (a Space 75 mp GPU-t foglal, a fiók 5 percet ad).
// Kimenet: video-proba/szakasz-N.mp4, eredmeny.json (artifact). $0.
// ===================================================================
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { zerogpuKlip, kepFeltoltes } from './zerogpu-video.js';

const token = (process.env.HF_TOKEN || '').trim();
const HANG = 'in a warm, friendly, clear American English male voice with a medium pitch and a calm newsreader pace';
const MOZGAS = 'His lips move naturally in sync with every word, he blinks and nods slightly. '
  + 'Static camera, the studio background stays still, high quality 3D animated film style.';
// A hír a 10-11-i cikkből (google-vids-new-point-in-time-editing-explained) — csak ami ott áll.
export const SZAKASZOK = [
  'Hi, and welcome to today\'s AI news from AI World HQ. I\'m here with the stories that matter for your everyday life.',
  'First up: Google Vids now shows only what\'s on screen at each moment, so editing videos with captions and logos feels much calmer.',
  'That\'s all for today. Read the full stories, free, at AI World HQ dot com. See you tomorrow!'
];
export const SZAKASZ_PROMPT = mondat => 'The cartoon news host in the green t-shirt looks into the camera and says '
  + `${HANG}: "${mondat}" ${MOZGAS}`;

const kozvetlen = process.argv[1] && process.argv[1].endsWith('beszelo-proba.js');
if (kozvetlen) {
  mkdirSync('video-proba', { recursive: true });
  const eredmeny = { token: token ? 'van' : 'NINCS', klipek: [] };
  const kepUt = await kepFeltoltes({ kepBuf: readFileSync('website/assets/images/mascot-weekly.jpg'), nev: 'host.jpg', token });
  console.log('kép feltöltve:', kepUt ? 'igen' : 'NEM');
  // A Space saját fekvő mérete 768×512 (64-gyel osztható — a 960×544 csendben elbukott, 10-11).
  if (kepUt) {
    for (let i = 0; i < SZAKASZOK.length; i++) {
      const r = await zerogpuKlip({ prompt: SZAKASZ_PROMPT(SZAKASZOK[i]), token, mp: 10, magas: 512, szeles: 768, seed: 42, veletlen: false, kepUt });
      if (r.ok) writeFileSync(`video-proba/szakasz-${i + 1}.mp4`, r.buf);
      const sor = { szakasz: i + 1, ok: r.ok, mp: r.mp, kb: r.buf ? Math.round(r.buf.length / 1024) : 0, kvota: !!r.kvota, hiba: r.hiba || '' };
      eredmeny.klipek.push(sor);
      console.log(JSON.stringify(sor));
      if (r.kvota) break;
    }
  }
  writeFileSync('video-proba/eredmeny.json', JSON.stringify(eredmeny, null, 2));
}
