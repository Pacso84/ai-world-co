// ===================================================================
// HETI MI-HÍRADÓ (2026-10-19)
// ===================================================================
// User (10-19): „azt mondtuk a heti összefoglaló videó lesz! de nem így sikerült!"
// A 10-11-i mini-híradót (a beszélő kabala jobbra, mellette a cikk borítója, alul
// hírszalag) egyszer, KÉZZEL raktam össze — rendszeres heti videó sosem lett belőle.
// Ez a modul minden héten MAGÁTÓL elkészíti, ugyanabban a formában („ez így jó!"):
//
//   1. a hét összefoglaló cikkéből („This Week in AI…") kiveszi az első két hír
//      CÍMÉT — szó szerint, semmit nem talál ki (a kabala csak a címet mondja ki);
//   2. a Hugging Face ingyenes LTX-keretén legyártja a 3 beszélő jelenetet
//      (bevezető + 2 hír; a napi keret ~3 tíz mp-es jelenet);
//   3. ffmpeg-gel összerakja: fekvő híradó-kép → álló 1080×1920 (Reels/TikTok);
//   4. website/assets/video/shorts/this-week-in-ai-<dátum>.mp4 + content/hirado/<dátum>.json
//      (ezt olvassa a meglévő kiküldő: core/hirado-kuldes.js).
//
// A KIKÜLDÉS NEM ITT VAN: az első hetekben a user megnézi, és csak a jóváhagyása
// után indul a .github/workflows/hirado-kuldes.yml.
// BORÍTÓ: csak a felirat-javítás (a835e619, 10-19) UTÁN készült kép kerülhet bele —
// a régiek halandzsa szöveget hordoznak; helyettük a heti cikk saját borítója.
//
// Futtatás: CSAK a .github/workflows/heti-hirado.yml (HF_TOKEN). Importja biztonságos.
// ===================================================================
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Egy 10 mp-es jelenetbe ennyi szó fér kényelmesen (hírolvasó-tempó). */
export const MAX_SZO = 24;
/** Ettől kezdve készülnek a borítók felirat nélkül (core/cover-scene.js, a835e619). */
export const JAVITOTT_KEP_OTA = '2026-10-19T09:00:00Z';
/** Ennyi napon belül megjelent heti összefoglalóból gyártunk. */
export const FRISS_NAP = 3;

const STOP = new Set('a an the to for of in on and or with new is are its it this that your you from at by as about how what why ai'.split(' '));
const tokenek = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/)
  .filter(w => w.length > 2 && !STOP.has(w)).map(w => w.replace(/(es|s)$/, ''));

/** A legfrissebb heti összefoglaló (this-week-in-ai-…), ha FRISS_NAP napon belül jelent meg; különben null. */
export function hetiOsszefoglalo(cikkek, ma = new Date().toISOString()) {
  const most = Date.parse(ma);
  return (Array.isArray(cikkek) ? cikkek : [])
    .filter(c => /^this-week-in-ai-/.test(c.slug || '') && Number.isFinite(Date.parse(c.published_at)))
    .filter(c => most - Date.parse(c.published_at) <= FRISS_NAP * 864e5 && Date.parse(c.published_at) <= most + 36e5)
    .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at))[0] || null;
}

/** A számozott alcímek („## 1. Cím") — a hírek címe, szó szerint. */
export function focimek(md, n = 2) {
  return [...String(md || '').matchAll(/^##\s+\d+\.\s+(.+?)\s*$/gm)].map(m => m[1].replace(/[*_`]/g, '').trim()).filter(Boolean).slice(0, n);
}

/** Szóhatáron rövidített cím a hírszalagra. */
export function rovidCim(cim, max = 58) {
  const s = String(cim || '').trim();
  if (s.length <= max) return s;
  const vag = s.slice(0, max).replace(/\s+\S*$/, '').replace(/[,:;—–-]+$/, '').trim();
  return vag + '…';
}

/** A kabala szövege: bevezető + „First up" + (ha van) „Also this week". */
export function szakaszok(cimek) {
  const c = (Array.isArray(cimek) ? cimek : []).filter(Boolean);
  if (!c.length) return [];
  const rov = x => x.split(/\s+/).slice(0, MAX_SZO - 4).join(' ').replace(/[.!?]+$/, '');
  const ki = ["Hi, and welcome to this week's AI news from AI World HQ. Here are the stories people were talking about.",
    `First up: ${rov(c[0])}.`];
  if (c[1]) ki.push(`Also this week: ${rov(c[1])}.`);
  return ki;
}

const HONAPOK = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** „(October 18, 2026)" a címből → { szoveg, iso }; nincs → null. */
export function datumCimbol(cim) {
  const m = String(cim || '').match(/\((January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4})\)/);
  if (!m) return null;
  const ho = String(HONAPOK.indexOf(m[1]) + 1).padStart(2, '0');
  return { szoveg: `${m[1]} ${m[2]}, ${m[3]}`, iso: `${m[3]}-${ho}-${m[2].padStart(2, '0')}` };
}

/**
 * A hír borítója: a legjobban illeszkedő friss hír képe (≥2 közös tartalmi szó), de CSAK ha a
 * felirat-javítás után készült; különben a heti cikk saját borítója (tartalek).
 */
export function boritoValaszt(cim, hirek, tartalek) {
  const t = new Set(tokenek(cim));
  let legjobb = null, pont = 0;
  for (const h of Array.isArray(hirek) ? hirek : []) {
    const k = tokenek(h.cim).filter(w => t.has(w)).length;
    if (k > pont) { pont = k; legjobb = h; }
  }
  if (legjobb && pont >= 2 && legjobb.image && String(legjobb.image_at || '') >= JAVITOTT_KEP_OTA) return legjobb.image;
  return tartalek;
}

/** A kiküldő modul (core/hirado-kuldes.js) json-ja — jelölés nélkül. */
export function hiradoJson({ datum, cikkSlug, cimek }) {
  const c = (cimek || []).filter(Boolean);
  const felsorolas = c.length > 1 ? `${c[0]}, ${c[1]} and more` : (c[0] || 'the week in AI');
  return {
    datum, video_slug: `this-week-in-ai-${datum}`, cikk_slug: cikkSlug,
    szoveg: `This week in AI: ${felsorolas}. Our AI news host has the week's top stories.`
  };
}

// ---------- gyártás (csak a CI) ----------

function cikkekBetolt() {
  const dir = join(ROOT, 'content', 'articles');
  const ki = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    try {
      const j = JSON.parse(readFileSync(join(dir, f), 'utf-8')); const m = j._meta || {}; const md = j.article_markdown || '';
      const cim = ((md.match(/^title:\s*["']?(.+?)["']?\s*$/m) || [])[1]) || m.slug;
      const kep = join(ROOT, 'website', 'assets', 'images', `${m.slug}.jpg`);
      ki.push({ slug: m.slug, md, cim, published_at: m.published_at, image_at: m.image_at, image: existsSync(kep) ? kep : null, guide: f.includes('_GUIDE_') });
    } catch { /* sérült fájl */ }
  }
  return ki;
}

const ff = (args, cwd) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { cwd, stdio: 'inherit' });
const hossz = (f, cwd) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { cwd }).toString().trim()) || 10;

/** A 10-11-i forma: fekvő 1152×768 jelenetek → összefűzés → álló 1080×1920. */
export function osszerak({ D, klipek, cimek, boritok, datumSzoveg, kimenet }) {
  copyFileSync(join(ROOT, 'shared', 'fonts', 'schibsted-grotesk-900.ttf'), join(D, 'font.ttf'));
  const szoveg = {
    t_cim: 'This Week in AI', t_datum: `Week of ${datumSzoveg}`, t_url: 'aiworldhq.com', t_szalag0: 'Weekly AI news for everyday life',
    t_tovabb: 'Full stories: aiworldhq.com', t_ai: 'AI-generated video', t_zaro1: 'This Week in AI', t_zaro2: 'Full stories, free, at aiworldhq.com',
    a_cim: 'This Week in AI', a_datum: `Week of ${datumSzoveg}`, a_link: 'Full stories: aiworldhq.com'
  };
  cimek.forEach((c, i) => { szoveg[`t_hir${i + 1}`] = rovidCim(c, 58); szoveg[`t_szam${i + 1}`] = `TOP STORY ${i + 1}`; });
  for (const [k, v] of Object.entries(szoveg)) writeFileSync(join(D, k + '.txt'), v, 'utf-8');
  const NAVY = '0x0e1a2b', TEAL = '0x5fd4e6';
  const dt = (f, o) => `drawtext=fontfile=font.ttf:textfile=${f}.txt:${o}`;
  const PANEL = `drawbox=x=696:y=62:w=428:h=290:color=${NAVY}@1:t=fill,drawbox=x=696:y=62:w=428:h=5:color=${TEAL}:t=fill`;
  const SZALAG = `drawbox=x=40:y=650:w=1072:h=78:color=${NAVY}@0.92:t=fill,drawbox=x=40:y=650:w=8:h=78:color=${TEAL}:t=fill`;
  const AI = dt('t_ai', 'fontsize=18:fontcolor=white:x=24:y=22:box=1:boxcolor=black@0.55:boxborderw=7');
  const KI = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '24', '-c:a', 'aac', '-ar', '48000', '-ac', '2'];

  const reszek = [];
  klipek.forEach((klip, i) => {
    const ki = `resz-${i}.mp4`;
    if (i === 0) {
      ff(['-i', klip, '-vf', ['scale=1152:768:flags=lanczos', PANEL, dt('t_cim', 'fontsize=46:fontcolor=white:x=732:y=110'),
        dt('t_datum', 'fontsize=24:fontcolor=0xc9d6e3:x=734:y=180'), dt('t_url', `fontsize=26:fontcolor=${TEAL}:x=734:y=300`),
        SZALAG, dt('t_szalag0', 'fontsize=30:fontcolor=white:x=72:y=673'), AI].join(','), ...KI, ki], D);
    } else {
      const v = hossz(klip, D), valt = Math.max(1, v - 1.4).toFixed(2);
      ff(['-i', klip, '-i', boritok[i - 1], '-filter_complex', ['[1:v]scale=400:225:force_original_aspect_ratio=increase,crop=400:225[b]',
        `[0:v]scale=1152:768:flags=lanczos,${PANEL}[h]`, '[h][b]overlay=716:75', dt(`t_szam${i}`, `fontsize=24:fontcolor=${TEAL}:x=718:y=314`),
        SZALAG, dt(`t_hir${i}`, `fontsize=28:fontcolor=white:x=72:y=675:enable='lt(t,${valt})'`),
        dt('t_tovabb', `fontsize=30:fontcolor=${TEAL}:x=72:y=673:enable='gte(t,${valt})'`), AI].join(','), ...KI, ki], D);
    }
    reszek.push(ki);
  });
  ff(['-f', 'lavfi', '-i', `color=c=${NAVY}:s=1152x768:d=2.5:r=24`, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '2.5',
    '-vf', [dt('t_zaro1', 'fontsize=64:fontcolor=white:x=(w-text_w)/2:y=300'), dt('t_zaro2', `fontsize=32:fontcolor=${TEAL}:x=(w-text_w)/2:y=400`), AI].join(','),
    ...KI, 'zaro.mp4'], D);

  // Összefűzés: a beszélő részek között 0,3 mp-es áttűnés (a vágás ne ugorjon), a végén a zárókép.
  const bemenet = [...reszek, 'zaro.mp4'].flatMap(f => ['-i', f]);
  let lanc = '', v = '[0:v]', a = '[0:a]', offset = 0;
  for (let i = 1; i < reszek.length; i++) {
    offset += hossz(reszek[i - 1], D) - 0.3;
    lanc += `${v}[${i}:v]xfade=transition=fade:duration=0.3:offset=${offset.toFixed(2)}[v${i}];${a}[${i}:a]acrossfade=d=0.3[a${i}];`;
    v = `[v${i}]`; a = `[a${i}]`;
  }
  const z = reszek.length;
  lanc += `${v}${a}[${z}:v][${z}:a]concat=n=2:v=1:a=1[v][a]`;
  ff([...bemenet, '-filter_complex', lanc, '-map', '[v]', '-map', '[a]', ...KI, '-movflags', '+faststart', 'fekvo.mp4'], D);

  // Álló 1080×1920 (Reels/TikTok) — a 10-11-i forma, a Facebook által elfogadott kódolással (yuv420p, 4.0, 30 fps).
  ff(['-i', 'fekvo.mp4', '-filter_complex', ['[0:v]scale=1080:720:flags=lanczos[h]', `color=c=${NAVY}:s=1080x1920:r=24[bg]`,
    '[bg][h]overlay=0:600:shortest=1', `drawbox=x=0:y=596:w=1080:h=4:color=${TEAL}:t=fill`,
    dt('a_cim', 'fontsize=96:fontcolor=white:x=(w-text_w)/2:y=300'), dt('a_datum', 'fontsize=44:fontcolor=0xc9d6e3:x=(w-text_w)/2:y=440'),
    dt('a_link', `fontsize=50:fontcolor=${TEAL}:x=(w-text_w)/2:y=1385`), 'scale=out_range=tv,format=yuv420p'].join(','),
    '-map', '0:a', '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-profile:v', 'high', '-level:v', '4.0', '-pix_fmt', 'yuv420p',
    '-color_range', 'tv', '-r', '30', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', kimenet], D);
}

async function gyart() {
  const cikkek = cikkekBetolt();
  const heti = hetiOsszefoglalo(cikkek);
  if (!heti) { console.log('⏭️  nincs friss (≤3 napos) heti összefoglaló — nincs mit gyártani'); return { ok: false, ok_ok: 'nincs' }; }
  const datum = datumCimbol(heti.cim) || { szoveg: heti.published_at.slice(0, 10), iso: heti.published_at.slice(0, 10) };
  const jsonUt = join(ROOT, 'content', 'hirado', `${datum.iso}.json`);
  if (existsSync(jsonUt)) { console.log(`⏭️  a ${datum.iso} híradó már elkészült`); return { ok: false, ok_ok: 'kesz' }; }
  const cimek = focimek(heti.md, 2);
  const szak = szakaszok(cimek);
  if (!szak.length) { console.log('⚠️  a heti cikkben nincs számozott hír-alcím'); return { ok: false, ok_ok: 'nincs-cim' }; }

  const { zerogpuKlip, kepFeltoltes } = await import('./zerogpu-video.js');
  const { SZAKASZ_PROMPT } = await import('./beszelo-proba.js');
  const token = (process.env.HF_TOKEN || '').trim();
  const D = join(tmpdir(), 'heti-hirado'); mkdirSync(D, { recursive: true });
  const kepUt = await kepFeltoltes({ kepBuf: readFileSync(join(ROOT, 'website', 'assets', 'images', 'mascot-weekly.jpg')), nev: 'host.jpg', token });
  if (!kepUt) throw new Error('a kabala-kép feltöltése nem sikerült (HF_TOKEN?)');
  const klipek = [];
  for (let i = 0; i < szak.length; i++) {
    const r = await zerogpuKlip({ prompt: SZAKASZ_PROMPT(szak[i]), token, mp: 10, magas: 512, szeles: 768, seed: 42, veletlen: false, kepUt });
    console.log(`  jelenet ${i + 1}/${szak.length}: ${r.ok ? 'kész' : 'HIBA ' + (r.kvota ? '(kvóta) ' : '') + (r.hiba || '')} (${r.mp} mp)`);
    if (!r.ok) break;
    const f = `klip-${i}.mp4`; writeFileSync(join(D, f), r.buf); klipek.push(f);
  }
  if (klipek.length < 2) throw new Error(`csak ${klipek.length} jelenet készült el (kell legalább a bevezető + 1 hír)`);

  const hasznalt = cimek.slice(0, klipek.length - 1);
  const friss = cikkek.filter(c => !c.guide && Date.parse(c.published_at) >= Date.parse(heti.published_at) - 8 * 864e5);
  const tartalek = heti.image || join(ROOT, 'website', 'assets', 'images', 'mascot-weekly.jpg');
  const boritok = hasznalt.map(c => boritoValaszt(c, friss, tartalek));
  const j = hiradoJson({ datum: datum.iso, cikkSlug: heti.slug, cimek: hasznalt });
  const kimenet = join(ROOT, 'website', 'assets', 'video', 'shorts', `${j.video_slug}.mp4`);
  mkdirSync(dirname(kimenet), { recursive: true });
  osszerak({ D, klipek, cimek: hasznalt, boritok, datumSzoveg: datum.szoveg, kimenet });
  mkdirSync(dirname(jsonUt), { recursive: true });
  writeFileSync(jsonUt, JSON.stringify(j, null, 2) + '\n', 'utf-8');
  console.log(`🎬 kész: ${kimenet} (${klipek.length} jelenet) + ${jsonUt}`);
  return { ok: true, j, jelenetek: klipek.length };
}

const kozvetlen = process.argv[1] && process.argv[1].endsWith('heti-hirado.js');
if (kozvetlen && process.argv.includes('--gyart')) {
  let uzenet;
  try {
    const r = await gyart();
    uzenet = r.ok
      ? `🎬 Elkészült a heti MI-híradó (${r.j.datum}, ${r.jelenetek} jelenet). A következő frissítés után itt nézhető meg:\nhttps://aiworldhq.com/assets/video/shorts/${r.j.video_slug}.mp4\nKiküldés CSAK jóváhagyás után (szólj Claude-nak).`
      : null;
  } catch (e) {
    uzenet = `⚠️ A heti MI-híradó nem készült el: ${String(e.message).slice(0, 200)}`;
    process.exitCode = 1;
  }
  if (uzenet) { const { sendMessage } = await import('./telegram.js'); await sendMessage(uzenet); }
}
