// ===================================================================
// ORBIT VIDEÓ-COMPOSE — a heti videó összerakása (2. fele)
// ===================================================================
//
// MINDEN futásban a build UTÁN fut (gyors): ha van friss weekly.json +
// weekly.mp3 (az agents/video/agent.js gyártja vasárnap), összerakja az
// mp4-et: stúdió-kártya (Orbit + cím + márka) + égetett, szinkron feliratok
// + hang. Az mp4 NINCS commitolva (repo-hízás ellen) — mindig újragenerálódik
// a cache-elt mp3-ból (~30-60 mp, ffmpeg a runneren előre telepítve).
//
// FUTTATÁS:  node core/video-compose.js
// ===================================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const VID_SRC = join(ROOT, 'website', 'assets', 'video');
const OUT_DIR = join(ROOT, 'website', 'public', 'assets', 'video');
const ORBIT_RAW = join(ROOT, 'website', 'assets', 'orbit-raw.png');

const W = 1280, H = 720;
const CREAM = '#f2ede4', INK = '#1c1a16', SAGE = '#5f8a76', SOFT = '#6f6a60', GOLD = '#b08a3e';

function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// mp3 hossz (mp): az utolsó szó vége + ráhagyás
function audioLenMs(meta) {
  const last = meta.words[meta.words.length - 1];
  return last ? last.s + last.d + 1200 : 90000;
}

// Stúdió-kártya: Orbit balra, cím + márka jobbra, felirat-sáv alul
async function makeBoard(meta, boardPath) {
  const orbitH = 470;
  const orbit = await sharp(ORBIT_RAW).resize(orbitH, orbitH, { fit: 'cover' }).png().toBuffer();
  const svg = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="${CREAM}"/>
    <rect x="0" y="0" width="${W}" height="6" fill="${SAGE}"/>
    <text x="500" y="120" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="700" letter-spacing="6" fill="${SOFT}">THIS WEEK IN AI</text>
    <text x="500" y="185" font-family="Arial, Helvetica, sans-serif" font-size="48" font-weight="800" fill="${INK}">Your weekly A.I. round-up</text>
    <text x="560" y="240" font-family="Arial, Helvetica, sans-serif" font-size="27" font-weight="700" fill="${SAGE}">with ORBIT · AI WORLD HQ</text>
    <text x="560" y="286" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="${GOLD}">aiworldhq.com · ${esc(meta.week)}</text>
    <rect x="540" y="330" width="680" height="240" rx="18" fill="#fbf9f4" stroke="#d3cabb" stroke-width="2"/>
  </svg>`);
  await sharp({ create: { width: W, height: H, channels: 4, background: CREAM } })
    .composite([{ input: svg }, { input: orbit, left: 40, top: H - orbitH - 30 }])
    .png().toFile(boardPath);
}

// ASS felirat: a szó-időzítésekből 5-7 szavas sorok, a kártya dobozában
function makeAss(meta, assPath) {
  const chunks = [];
  let cur = [], curStart = 0;
  for (const w of meta.words) {
    if (!cur.length) curStart = w.s;
    cur.push(w);
    const text = cur.map(x => x.w).join(' ');
    if (text.length > 38 || cur.length >= 7) { chunks.push({ start: curStart, end: w.s + w.d, text }); cur = []; }
  }
  if (cur.length) chunks.push({ start: curStart, end: cur[cur.length - 1].s + cur[cur.length - 1].d, text: cur.map(x => x.w).join(' ') });
  // az egyes sorok a következő sor kezdetéig maradjanak kint (folyamatos olvasás)
  for (let i = 0; i < chunks.length - 1; i++) chunks[i].end = chunks[i + 1].start;
  chunks[chunks.length - 1].end += 800;

  const ts = (ms) => {
    const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60, cs = Math.floor((ms % 1000) / 10);
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  };
  const lines = chunks.map(c => `Dialogue: 0,${ts(c.start)},${ts(c.end)},Orbit,,0,0,0,,${c.text.replace(/[{}\\]/g, '')}`);
  writeFileSync(assPath, `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Orbit,Arial,40,&H00161A1C,&H00161A1C,&H00F4F9FB,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,8,600,90,368,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${lines.join('\n')}
`, 'utf-8');
}

function main() {
  // KILL-SWITCH (user 2026-07-11): amíg agents.video.enabled false, élesben nem gyártunk
  const FORCE = process.argv.includes('--force');
  try {
    const cfg = JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf-8'));
    if (cfg.agents?.video?.enabled === false && !FORCE) { console.log('⏸️  Orbit-compose: KIKAPCSOLVA (fejlesztés alatt) — kihagyom.'); return; }
  } catch { /* óvatos folytatás */ }
  const metaPath = join(VID_SRC, 'weekly.json');
  const mp3Path = join(VID_SRC, 'weekly.mp3');
  if (!existsSync(metaPath) || !existsSync(mp3Path)) { console.log('💤 Orbit-compose: nincs weekly.json/mp3 — nincs teendő.'); return; }
  const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
  if (!meta.words?.length) { console.log('⏭️  Orbit-compose: nincs szó-időzítés — kihagyom.'); return; }
  if ((Date.now() - new Date(meta.created_at).getTime()) > 8 * 86400e3) { console.log('⏭️  Orbit-compose: a heti anyag régi (>8 nap) — kihagyom.'); return; }

  // ffmpeg megvan? (helyi Windowson lehet, hogy nincs — a felhőben adott)
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); }
  catch { console.log('⚠️ Orbit-compose: nincs ffmpeg ezen a gépen — kihagyom (a felhő megcsinálja).'); return; }

  console.log('🎬 ORBIT-COMPOSE: videó összerakása…');
  mkdirSync(OUT_DIR, { recursive: true });
  const durMs = audioLenMs(meta);

  // A subtitles-szűrő útvonal-escape poklát relatív nevekkel kerüljük el:
  // mindent a VID_SRC-ben gyártunk, az ffmpeg cwd-je is az.
  const boardPath = join(VID_SRC, 'board.png');
  const assPath = join(VID_SRC, 'weekly.ass');

  return (async () => {
    await makeBoard(meta, boardPath);
    makeAss(meta, assPath);
    const outName = `weekly-${meta.week}.mp4`;
    execFileSync('ffmpeg', [
      '-y', '-loop', '1', '-i', 'board.png', '-i', 'weekly.mp3',
      '-vf', `subtitles=weekly.ass,drawbox=x=0:y=ih-8:w='iw*t/${(durMs / 1000).toFixed(1)}':h=8:color=0x5F8A76:t=fill`,
      '-t', (durMs / 1000).toFixed(1),
      '-c:v', 'libx264', '-tune', 'stillimage', '-preset', 'veryfast', '-crf', '27', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart',
      join(OUT_DIR, outName)
    ], { cwd: VID_SRC, stdio: ['ignore', 'ignore', 'pipe'] });

    // Többnyelvű VTT-feliratok (hu/es/de/fr) — a lejátszóban kapcsolhatók,
    // a nem-angol oldalakon alapból BE (user-kérés 2026-07-11)
    if (meta.sentences?.length) {
      const vt = (ms) => {
        const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60, x = ms % 1000;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(x).padStart(3, '0')}`;
      };
      for (const lang of ['hu', 'es']) {
        const cues = meta.sentences.filter(x => x[lang]);
        if (!cues.length) continue;
        const body = cues.map((x, i) => `${i + 1}\n${vt(x.s)} --> ${vt(x.e)}\n${x[lang]}`).join('\n\n');
        writeFileSync(join(OUT_DIR, `weekly-${meta.week}.${lang}.vtt`), `WEBVTT\n\n${body}\n`, 'utf-8');
      }
      console.log('   🌍 VTT-feliratok kiírva (hu/es/de/fr)');
    }

    // poszter-kép a lejátszóhoz
    await sharp(boardPath).jpeg({ quality: 80 }).toFile(join(OUT_DIR, 'weekly-poster.jpg'));
    const size = readFileSync(join(OUT_DIR, outName)).length;
    console.log(`✅ Orbit-videó kész: ${outName} (${(size / 1e6).toFixed(1)} MB, ${(durMs / 1000).toFixed(0)} mp)`);
  })();
}

Promise.resolve(main()).then(() => process.exit(0)).catch(e => { console.error('💥 ORBIT-COMPOSE HIBA:', e.message.slice(0, 300)); process.exit(1); });
