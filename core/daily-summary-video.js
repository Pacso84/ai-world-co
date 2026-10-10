// ===================================================================
// NAPI MI-ÖSSZEFOGLALÓ VIDEÓ — „Today in AI" (2026-10-10)
// ===================================================================
// User: „marad a mostani videók, de eggyel lenne több ezzel az MI-videóval —
// egy napi összesítő; de mielőtt kirakod, szeretném látni". Pontosítás
// (10-10): „EGY összesítőt, nem három külön klipet" → EGY MI-animáció a
// napról, és erre kerül sorban a nap híreinek címe + gépi hang.
//
// FELÉPÍTÉS (~20–30 mp, 1080×1920): a háttér VÉGIG ugyanaz az egy MI-animáció
// (előre-hátra lejátszva, hogy ne ugorjon a hurok); fölötte a kártyák sorban:
//   „TODAY IN AI" → 2–3 hír címe (+ rövid alcím) → aiworldhq.com.
// Naponta 1 MI-készítés: a napi ingyenes ZeroGPU-keretbe biztosan belefér
// (élő mérés 10-10: 3–4 klip után elfogyott).
//
// FORRÁS: a SAJÁT, már ellenőrzött, kiadott híreink címe és alcíme — nincs
// szövegíró MI, nincs új állítás. A klip-prompt sablon, és tiltja a feliratot,
// logót, valódi embert (core/zerogpu-video.js: LTX-2.3, $0).
// Ha a klip nem készül el: NINCS összefoglaló aznap (a mostani videók mennek).
// ===================================================================
import { execFileSync } from 'child_process';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { W, H, tablaSvg, tordel, splitHeading, horogCimbol, nagybetusHorog, SZUNET_MP } from './short-video.js';

/** Ennyi óránál frissebb hír kerülhet a napi összefoglalóba. */
export const FRISS_ORA = 30;
export const HIR_MAX = 3;
export const HIR_MIN = 2;
/** A napi EGY MI-animáció hossza (mp) — a Space legfeljebb 10-et ad. */
export const KLIP_MP = 10;

/**
 * A nap hírei: nem útmutató (a hívó a közös core/guide-kind.js utmutatoE-vel tölti az „utmutato" mezőt), kiadott, FRISS_ORA-n belüli, a legfrissebb elöl.
 * @param {Array<{utmutato,published_at,title,subtitle,slug}>} cikkek
 * @returns {Array|null}  null, ha HIR_MIN-nél kevesebb van (akkor nincs videó)
 */
export function napiHirek(cikkek, now = Date.now(), db = HIR_MAX) {
  const hatar = now - FRISS_ORA * 3600e3;
  const ki = (Array.isArray(cikkek) ? cikkek : [])
    .filter(c => c && !c.utmutato && c.title && Date.parse(c.published_at) >= hatar && Date.parse(c.published_at) <= now)
    .sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)))
    .slice(0, db);
  return ki.length >= HIR_MIN ? ki : null;
}

/** Legfeljebb n szó, mondatvég nélkül. */
export function rovid(s, n) {
  const szavak = String(s || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const t = szavak.slice(0, n).join(' ').replace(/[,;:—–-]+$/, '');
  return szavak.length > n ? t + '…' : t;
}

/**
 * Az alcím KIMONDHATÓ része: csak az ELSŐ mondat, és csak ha legfeljebb `max`
 * szó — különben semmi. A hang soha nem áll meg félmondatnál (10-10, első
 * próba: „…Here's why that" — a vágott alcím értelmetlenül szakadt meg).
 */
export function elsoMondat(s, max = 18) {
  const m = String(s || '').replace(/\s+/g, ' ').trim().match(/^(.+?[.!?])(?:\s|$)/);
  const mondat = (m ? m[1] : String(s || '').trim()).replace(/[.!?]+$/, '');
  return mondat && mondat.split(' ').length <= max ? mondat : '';
}

// A felolvasó a pontot, kettőspontot sajátosan ejti; a hang szövegében egyszerűsítünk.
const kimondhato = s => String(s || '').replace(/…/g, '').replace(/\s*[—–]\s*/g, ', ').replace(/\s+/g, ' ').trim();

/** A napi EGY animáció képi utasítása — sablon, NEM a cikkek állításai; tilt feliratot, logót, embert. */
export function napiPrompt() {
  return 'A cute glossy 3D cartoon newsroom: friendly little robots pass glowing news cards to each other, '
    + 'floating icons of phones, chat bubbles and smart speakers drift around, warm sunrise light through big windows, '
    + 'vibrant colorful 3D render, playful modern tech illustration, smooth slow cinematic camera push-in. '
    + 'No text, no letters, no logos, no real people.';
}

/**
 * A kártya címe: kettőspontnál kettévágva (nagy = előtte, kicsi = utána).
 * MIÉRT (10-10, első bemutató): a teljes hír-cím 3 sorba tördelve LEVÁGÓDOTT
 * („…Become a Short", „…What Businesses Need"). A nagy rész legfeljebb 7 szó;
 * a hang ettől függetlenül a TELJES címet mondja.
 */
export function kartyaCim(cim) {
  const c = String(cim || '').replace(/\s+/g, ' ').trim();
  const [elo, ...tobbi] = c.split(/:\s+/);
  const utana = tobbi.join(': ');
  if (utana && elo.split(' ').length >= 2) return { nagy: rovid(elo, 7), kicsi: rovid(utana, 9) };
  return { nagy: rovid(nagybetusHorog(splitHeading(horogCimbol(c)).nagy), 7), kicsi: '' };
}

/** A videó szakaszai (kártya + kimondott szöveg): nyitó + hírek + záró. Egyik sem kér saját klipet. */
export function osszesitoSzakaszok(hirek) {
  const db = hirek.length;
  const szam = ['', 'one', 'two', 'three'][db] || String(db);
  const ki = [{ cimke: '', nagy: tordel('TODAY IN AI'), kicsi: `${db} things worth knowing`, mond: `Today in A I: ${szam} things worth knowing.` }];
  hirek.forEach((h, i) => {
    const { nagy, kicsi } = kartyaCim(h.title);
    ki.push({
      cimke: '', nagy: tordel(nagy), kicsi: kicsi || rovid(h.subtitle, 9),
      mond: kimondhato(`${['One', 'Two', 'Three'][i] || i + 1}. ${h.title.replace(/[.:]\s*$/, '')}.`
        + (elsoMondat(h.subtitle) ? ` ${elsoMondat(h.subtitle)}.` : ''))
    });
  });
  ki.push({ cimke: '', nagy: 'aiworldhq\n.com', kicsi: 'Full stories, in plain English', mond: 'Full stories at aiworldhq dot com.' });
  return ki;
}

/** A kártyák idősávjai a hangok hosszából: [{tol, ig}], egymás után. */
export function idosavok(hosszak) {
  let t = 0;
  return (hosszak || []).map(h => { const s = { tol: t, ig: t + h }; t += h; return s; });
}

const hossz = f => parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
  '-of', 'default=nw=1:nk=1', f]).toString().trim()) || 0;

/**
 * A videó legyártása EGY MI-animációval. `klipFn(prompt, mp)` → { ok, buf, kvota?, hiba? }.
 * @returns {{ok:boolean, file?:string, seconds?:number, hiba?:string, kvota?:boolean}}
 */
export async function renderOsszesito(szakaszok, { out, workDir, klipFn, voice = 'en-US-AvaMultilingualNeural' }) {
  const sharp = (await import('sharp')).default;
  const { MsEdgeTTS, OUTPUT_FORMAT } = await import('msedge-tts');
  rmSync(workDir, { recursive: true, force: true });
  mkdirSync(workDir, { recursive: true });

  // 1) A NAP EGY MI-ANIMÁCIÓJA — előbb, mert nélküle nincs videó (és nem kell hangot gyártani).
  const r = await klipFn(napiPrompt(), KLIP_MP);
  if (!r || !r.ok) return { ok: false, kvota: !!(r && r.kvota), hiba: (r && r.hiba) || 'nincs válasz' };
  const klip = join(workDir, 'klip.mp4');
  writeFileSync(klip, r.buf);

  // 2) HANGOK szakaszonként (a kis szünet a hangba is kerül, mint a mostani Reelen).
  const hangok = [], hosszak = [];
  for (let i = 0; i < szakaszok.length; i++) {
    const nyers = join(workDir, `n${i}.mp3`), mp3 = join(workDir, `h${i}.mp3`);
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(szakaszok[i].mond);
    const d = [];
    audioStream.on('data', x => d.push(x));
    await new Promise(res => audioStream.on('close', res));
    writeFileSync(nyers, Buffer.concat(d));
    execFileSync('ffmpeg', ['-y', '-i', nyers, '-af', `apad=pad_dur=${SZUNET_MP}`, '-c:a', 'libmp3lame', mp3], { stdio: 'pipe' });
    hangok.push(mp3); hosszak.push(hossz(mp3));
  }
  writeFileSync(join(workDir, 'hangok.txt'), hangok.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n'), 'utf-8');
  const teljes = join(workDir, 'teljes.mp3');
  execFileSync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', join(workDir, 'hangok.txt'), '-c', 'copy', teljes], { stdio: 'pipe' });
  const osszHossz = hosszak.reduce((a, b) => a + b, 0);

  // 3) HÁTTÉR: a klip előre + visszafelé (nincs ugrás a hurok végén), a teljes hosszig ismételve.
  const oda = join(workDir, 'oda-vissza.mp4');
  execFileSync('ffmpeg', ['-y', '-i', klip, '-filter_complex',
    `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H},setsar=1,fps=30,split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1:a=0,format=yuv420p[v]`,
    '-map', '[v]', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', oda], { stdio: 'pipe' });

  // 4) KÁRTYÁK átlátszó rétegen, mindegyik a saját idősávjában látszik.
  const savok = idosavok(hosszak);
  const retegek = [];
  for (let i = 0; i < szakaszok.length; i++) {
    const f = join(workDir, `r${i}.png`);
    await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: Buffer.from(tablaSvg(szakaszok[i], i, szakaszok.length, { alap: false, kartya: true })) }])
      .png().toFile(f);
    retegek.push(f);
  }
  const be = ['-stream_loop', '-1', '-i', oda, ...retegek.flatMap(f => ['-i', f]), '-i', teljes];
  let lanc = '[0:v]null[v0]';
  savok.forEach((s, i) => { lanc += `;[v${i}][${i + 1}:v]overlay=0:0:enable='between(t,${s.tol.toFixed(3)},${s.ig.toFixed(3)})'[v${i + 1}]`; });
  execFileSync('ffmpeg', ['-y', ...be, '-filter_complex', lanc, '-map', `[v${savok.length}]`, '-map', `${retegek.length + 1}:a`,
    '-t', osszHossz.toFixed(3), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-ar', '44100', '-ac', '1', '-movflags', '+faststart', out], { stdio: 'pipe' });
  return { ok: true, file: out, seconds: hossz(out) };
}

export default { FRISS_ORA, HIR_MAX, HIR_MIN, KLIP_MP, napiHirek, rovid, elsoMondat, napiPrompt, osszesitoSzakaszok, idosavok, renderOsszesito };
