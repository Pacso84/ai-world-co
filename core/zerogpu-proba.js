// ===================================================================
// KVÓTA-PRÓBA (2026-10-09) — csak a .github/workflows/video-proba.yml futtatja
// ===================================================================
// A kérdés, amit EGYETLEN valódi futás dönt el: ha a GitHub futtató a user
// Hugging Face-kulcsával hívja a ZeroGPU Space-t, a FIÓK napi 5 perces
// keretét használja-e, vagy a megosztott IP vendég-keretét (2 perc)?
// Módszer: két ~4 mp-es klip egymás után (~75 mp foglalás/hívás). Ha a
// MÁSODIK is sikerül, a 2 perces vendég-keretbe nem fért volna bele → a fiók
// kerete számít. Költség: $0 (ingyenes fiók, túlfizetés nem lehetséges).
// Kimenet: video-proba/klip-1.mp4, klip-2.mp4, eredmeny.json (artifact).
// ===================================================================
import { mkdirSync, writeFileSync } from 'fs';
import { zerogpuKlip } from './zerogpu-video.js';

const token = (process.env.HF_TOKEN || '').trim();
const PROMPTOK = [
  'A cute glossy 3D cartoon smart speaker with a glowing blue light ring on a cozy kitchen counter; two round kitchen timers with ticking hands pop up beside it; soft morning light; camera slowly pushes in. Vibrant colorful 3D render, playful, smooth motion, no text, no people.',
  'A friendly glossy 3D cartoon smart display on a bedside table glows softly at night, then a warm sunrise fills the room and gentle light waves pulse from the speaker; slow camera orbit. Vibrant colorful 3D render, playful, smooth motion, no text, no people.'
];

mkdirSync('video-proba', { recursive: true });
const eredmeny = { token: token ? 'van' : 'NINCS', klipek: [] };
for (let i = 0; i < PROMPTOK.length; i++) {
  const r = await zerogpuKlip({ prompt: PROMPTOK[i], token, mp: 4 });
  if (r.ok) writeFileSync(`video-proba/klip-${i + 1}.mp4`, r.buf);
  const sor = { klip: i + 1, ok: r.ok, mp: r.mp, kb: r.buf ? Math.round(r.buf.length / 1024) : 0, kvota: !!r.kvota, hiba: r.hiba || '' };
  eredmeny.klipek.push(sor);
  console.log(JSON.stringify(sor));
}
const db = eredmeny.klipek.filter(k => k.ok).length;
eredmeny.dontes = db === 2 ? 'FIÓK-KERET (mindkét klip kész — a 2 perces vendég-keretbe nem fért volna)'
  : db === 1 ? 'BIZONYTALAN (csak 1 klip — lehet vendég-keret)'
  : 'NEM MŰKÖDIK a futtatóról';
writeFileSync('video-proba/eredmeny.json', JSON.stringify(eredmeny, null, 2));
console.log('\n➡️  ' + eredmeny.dontes);
