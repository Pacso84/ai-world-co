// ===================================================================
// BESZÉLŐ KABALA — PRÓBA (2026-10-11) — csak a .github/workflows/beszelo-proba.yml futtatja
// ===================================================================
// A kérdés: tud-e az ingyenes MI (LTX-2.3, Hugging Face ZeroGPU) a kabala-
// figurából TERMÉSZETESEN beszélő hírolvasót csinálni? User (10-10): „nem gagyi
// dolgokat gyártunk, minőséget próbálunk adni!" — ha a szájmozgás nem
// természetes, NEM rakjuk ki. Ez a próba csak megmutatja, nem posztol.
// A kép a honlapon már nyilvános: website/assets/images/mascot-weekly.jpg.
// Két változat (más véletlenszám), hogy legyen miből választani. $0.
// Kimenet: video-proba/beszelo-1.mp4, beszelo-2.mp4, eredmeny.json (artifact).
// ===================================================================
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { zerogpuKlip, kepFeltoltes } from './zerogpu-video.js';

const token = (process.env.HF_TOKEN || '').trim();
const PROMPT = 'The cartoon news host in the green t-shirt looks into the camera, smiles warmly and says in a friendly, clear '
  + 'American English male voice: "Hi! This is today\'s AI news from AI World HQ." His lips move naturally in sync with every word, '
  + 'he blinks and nods slightly. Static camera, the studio background stays still, high quality 3D animated film style.';

mkdirSync('video-proba', { recursive: true });
const eredmeny = { token: token ? 'van' : 'NINCS', klipek: [] };
const kepUt = await kepFeltoltes({ kepBuf: readFileSync('website/assets/images/mascot-weekly.jpg'), nev: 'host.jpg', token });
console.log('kép feltöltve:', kepUt ? 'igen' : 'NEM');
// 1. változat: feltöltött kép · 2.: a kép nyilvános címe (10-11: az első próbán a
// feltöltött képpel „complete" jött videó nélkül — kiderül, melyik út a jó).
const KEP_URL = 'https://aiworldhq.com/assets/images/mascot-weekly.jpg';
{
  for (const [i, seed, kep] of [[1, 10, { kepUt }], [2, 77, { kepUrl: KEP_URL }]]) {
    if (i === 1 && !kepUt) continue;
    const r = await zerogpuKlip({ prompt: PROMPT, token, mp: 6, magas: 544, szeles: 960, seed, ...kep });
    if (r.ok) writeFileSync(`video-proba/beszelo-${i}.mp4`, r.buf);
    const sor = { klip: i, ok: r.ok, mp: r.mp, kb: r.buf ? Math.round(r.buf.length / 1024) : 0, kvota: !!r.kvota, hiba: r.hiba || '' };
    eredmeny.klipek.push(sor);
    console.log(JSON.stringify(sor));
    if (r.kvota) break;
  }
}
writeFileSync('video-proba/eredmeny.json', JSON.stringify(eredmeny, null, 2));
