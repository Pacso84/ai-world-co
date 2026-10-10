// ===================================================================
// NAPI MI-ÖSSZEFOGLALÓ VIDEÓ — „Today in AI" (2026-10-10)
// ===================================================================
// User: „marad a mostani videók, de eggyel lenne több ezzel az MI-videóval —
// egy napi összesítő; de mielőtt kirakod, szeretném látni".
//
// FELÉPÍTÉS (~20–30 mp, 1080×1920):
//   nyitó (MI-klip + „3 things in AI today") → 2–3 hír (MI-klip + a cím a
//   kártyán + gépi hang: cím + rövid alcím) → záró kártya (aiworldhq.com).
//
// FORRÁS: a SAJÁT, már ellenőrzött, kiadott híreink címe és alcíme — nincs
// szövegíró MI, nincs új állítás. A klip-prompt sablonból készül, és tiltja a
// feliratot, logót, valódi embert (core/zerogpu-video.js: LTX-2.3, $0).
//
// MINDEN VAGY SEMMI: ha bármelyik klip nem készül el, NINCS összefoglaló
// (a mostani videók ettől függetlenül mennek) — egy félkész videó rosszabb,
// mint egy kihagyott nap.
// ===================================================================
import { execFileSync } from 'child_process';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { W, H, tablaSvg, tordel, splitHeading, horogCimbol, nagybetusHorog, SZUNET_MP } from './short-video.js';

/** Ennyi óránál frissebb hír kerülhet a napi összefoglalóba. */
export const FRISS_ORA = 30;
export const HIR_MAX = 3;
export const HIR_MIN = 2;

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

/** A klip képi utasítása — sablon, NEM a cikk állításai; tilt feliratot, logót, embert. */
export function klipPrompt(tema) {
  const t = rovid(String(tema || '').replace(/["']/g, ''), 14);
  return `A cute glossy 3D cartoon scene that playfully illustrates this tech news topic: ${t}. `
    + 'Friendly rounded gadgets, glowing screens and soft light, vibrant colorful 3D render, playful modern tech illustration, '
    + 'smooth cinematic camera motion. No text, no letters, no logos, no real people.';
}

/** A videó szakaszai: nyitó + hírek + záró. Mindegyik: {cimke,nagy,kicsi,mond,prompt}. */
export function osszesitoSzakaszok(hirek) {
  const db = hirek.length;
  const szam = ['', 'one', 'two', 'three'][db] || String(db);
  const ki = [{
    cimke: '', nagy: tordel('TODAY IN AI'), kicsi: `${db} things worth knowing`,
    mond: `Today in A I: ${szam} things worth knowing.`,
    prompt: 'A cute glossy 3D cartoon newsroom of friendly robots holding glowing news cards, sunrise light, confetti of tiny icons, '
      + 'vibrant colorful 3D render, playful modern tech illustration, smooth camera push-in. No text, no letters, no logos, no real people.'
  }];
  hirek.forEach((h, i) => {
    const horog = nagybetusHorog(splitHeading(horogCimbol(h.title)).nagy);
    ki.push({
      cimke: '', nagy: tordel(horog), kicsi: rovid(h.subtitle, 9),
      mond: kimondhato(`${['One', 'Two', 'Three'][i] || i + 1}. ${h.title.replace(/[.:]\s*$/, '')}.`
        + (elsoMondat(h.subtitle) ? ` ${elsoMondat(h.subtitle)}.` : '')),
      prompt: klipPrompt(h.title)
    });
  });
  ki.push({
    cimke: '', nagy: 'aiworldhq\n.com', kicsi: 'Full stories, in plain English',
    mond: 'Full stories at aiworldhq dot com.', prompt: null
  });
  return ki;
}

const hossz = f => parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
  '-of', 'default=nw=1:nk=1', f]).toString().trim()) || 0;

/**
 * A videó legyártása. `klipFn(prompt, mp)` → { ok, buf, kvota?, hiba? } (core/zerogpu-video.js).
 * @returns {{ok:boolean, file?:string, seconds?:number, klipek?:number, hiba?:string, kvota?:boolean}}
 */
export async function renderOsszesito(szakaszok, { out, workDir, klipFn, voice = 'en-US-AvaMultilingualNeural' }) {
  const sharp = (await import('sharp')).default;
  const { MsEdgeTTS, OUTPUT_FORMAT } = await import('msedge-tts');
  rmSync(workDir, { recursive: true, force: true });
  mkdirSync(workDir, { recursive: true });
  const papir = await sharp({ create: { width: W, height: H, channels: 3, background: '#f4efe6' } }).jpeg().toBuffer();
  writeFileSync(join(workDir, 'papir.jpg'), papir);
  let klipDb = 0;
  const darabok = [];
  for (let i = 0; i < szakaszok.length; i++) {
    const sz = szakaszok[i];
    // 1) HANG — előbb, mert a hossza szabja a klip hosszát.
    const nyers = join(workDir, `n${i}.mp3`), mp3 = join(workDir, `h${i}.mp3`);
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(sz.mond);
    const d = [];
    audioStream.on('data', x => d.push(x));
    await new Promise(r => audioStream.on('close', r));
    writeFileSync(nyers, Buffer.concat(d));
    execFileSync('ffmpeg', ['-y', '-i', nyers, '-af', `apad=pad_dur=${SZUNET_MP}`, '-c:a', 'libmp3lame', mp3], { stdio: 'pipe' });
    const mp = hossz(mp3);

    // 2) KÉP — MI-klip (hurkolva a hang hosszáig) vagy a záró kártya papír-alapon.
    let hatter;
    if (sz.prompt) {
      const r = await klipFn(sz.prompt, Math.max(4, Math.min(8, Math.ceil(mp))));
      if (!r || !r.ok) return { ok: false, klipek: klipDb, kvota: !!(r && r.kvota), hiba: `klip ${i + 1}: ${(r && r.hiba) || 'nincs válasz'}` };
      klipDb++;
      hatter = join(workDir, `c${i}.mp4`);
      writeFileSync(hatter, r.buf);
    }
    // 3) FELIRAT-KÁRTYA átlátszó rétegen (ugyanaz a dizájn, mint a mostani Reelen).
    const reteg = join(workDir, `r${i}.png`);
    await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: Buffer.from(tablaSvg(sz, i, szakaszok.length, { alap: false, kartya: true })) }])
      .png().toFile(reteg);
    const darab = join(workDir, `d${i}.mp4`);
    const be = hatter ? ['-stream_loop', '-1', '-i', hatter] : ['-loop', '1', '-i', join(workDir, 'papir.jpg')];
    execFileSync('ffmpeg', ['-y', ...be, '-i', reteg, '-i', mp3, '-filter_complex',
      `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H},setsar=1,fps=30[v];[v][1:v]overlay=0:0,format=yuv420p[o]`,
      '-map', '[o]', '-map', '2:a', '-t', mp.toFixed(3), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
      '-c:a', 'aac', '-ar', '44100', '-ac', '1', darab], { stdio: 'pipe' });
    darabok.push(darab);
  }
  writeFileSync(join(workDir, 'lista.txt'), darabok.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n'), 'utf-8');
  execFileSync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', join(workDir, 'lista.txt'), '-c', 'copy',
    '-movflags', '+faststart', out], { stdio: 'pipe' });
  return { ok: true, file: out, seconds: hossz(out), klipek: klipDb };
}

export default { FRISS_ORA, HIR_MAX, HIR_MIN, napiHirek, rovid, klipPrompt, osszesitoSzakaszok, renderOsszesito };
