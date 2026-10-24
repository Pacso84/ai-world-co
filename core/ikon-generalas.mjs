// LÉPÉS-IKON GENERÁLÁS (2026-10-24) — a .github/workflows/ikon-generalas.yml futtatja (kézi indítás).
// Cloudflare Workers AI Flux (ingyenes napi keret) a meglévő 14 ikon (website/assets/art/) stílusában.
// A képek a futás „artifact”-jába kerülnek; válogatás és vágás (640×480) kézzel, a repóba csak a kiválasztott kerül.
// NEM teszt (nem .test.js): hálózatot hív.
import fs from 'node:fs';
const { CLOUDFLARE_FLUX_TOKEN: TOKEN, CLOUDFLARE_ACCOUNT_ID: ACCT } = process.env;
if (!TOKEN || !ACCT) { console.log('❌ hiányzó Cloudflare-kulcs'); process.exit(1); }
const STILUS = 'single 3D icon floating in the center, glossy soft rounded clay-like shapes, playful modern tech illustration, soft studio lighting, soft shadow below the object, smooth pastel gradient background, minimal, lots of empty space around, high quality octane render, no text, no letters, no numbers, no words, no logos';
const IKONOK = {
  table: 'a small white spreadsheet card with a colorful grid table of rounded cells and a tiny bar chart, pastel mint green background',
  calendar: 'a cute desk calendar page with colorful rounded day squares and a small check mark on one day, pastel peach background',
  compare: 'a playful balance scale with two rounded cards on its pans, one pink and one blue, perfectly balanced, pastel lavender background'
};
fs.mkdirSync('ikonok', { recursive: true });
for (const [nev, targy] of Object.entries(IKONOK)) {
  for (const seed of [7, 42, 1234]) {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCT}/ai/run/@cf/black-forest-labs/flux-1-schnell`, {
      method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: `${targy}. ${STILUS}`, steps: 8, seed })
    });
    if (!r.ok) { console.log('❌', nev, seed, r.status, (await r.text()).slice(0, 160)); continue; }
    const b64 = (await r.json())?.result?.image;
    if (!b64) { console.log('❌', nev, seed, 'nincs kép'); continue; }
    fs.writeFileSync(`ikonok/${nev}-${seed}.jpg`, Buffer.from(b64, 'base64'));
    console.log('✅', nev, seed);
  }
}
