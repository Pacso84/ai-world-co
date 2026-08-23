// ===================================================================
// ÁLLÓ RÖVIDVIDEÓ (1080x1920) EGY ÚTMUTATÓBÓL — teljesen ingyen
// ===================================================================
//
// MIÉRT KÜLÖN MODUL, és miért nem a meglévő Orbit-lánc. A
// `core/video-compose.js` 1280x720 FEKVŐ, és a felbontás átírása nem elég:
// a kártya SVG-je abszolút pixelkoordinátákkal dolgozik, az ASS-stílus
// margói pedig a fekvő elrendezés jobb oldali dobozához vannak igazítva.
// Az a lánc ráadásul EGYETLEN bemenetet ismer (a heti digest fix
// weekly.json+mp3 párosát), és a hangját csak a fizetős agent tudja
// legyártani. Ez itt önálló, paraméterezhető és $0.
//
// MIÉRT NEM KELL AI A SZÖVEGHEZ. Mérve (2026-08-23): a 352 útmutató
// MINDEGYIKE legalább 3 lépéses, és mind a 2026 lépés-cím ugyanabban a
// formában áll: „Step N — <cím>". A videó szövegét tehát a cikk saját
// szerkezete adja. Hang: msedge-tts (ingyen). Kép: sharp. Összerakás:
// ffmpeg. A teljes lánc nulla forint.
//
// ⚠️ A SZÜNET A HANGBA IS KELL, nem csak a kép hosszába. Az első
// változatban csak a képekhez adtam +0,45 mp levegőt — tábláként fél
// másodperc csúszás halmozódott, a hatodiknál már 2,25 mp, és a záró
// tábla ki is esett, mert a `-shortest` a rövidebb hanghoz vágott.
// ===================================================================

import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

export const W = 1080, H = 1920;

/** Ennél kevesebb lépésből nem lesz videó — egy helyen, hogy ne csússzon szét. */
export const MIN_LEPES = 3;

/** Ennyi levegő marad a tábla végén, hogy a felirat elolvasható legyen. */
export const SZUNET_MP = 0.45;

/** A felolvasás mért tempója — a hossz-becsléshez, nem a vágáshoz. */
export const SZO_PER_MP = 2.6;

const SORSZAM = ['One', 'Two', 'Three', 'Four', 'Five', 'Six'];

// Ahol egy angol lépés-cím természetesen kettétörik. A vágás után a maradék
// alcímként megy a nagy szöveg alá.
const TORES = /^(for|with|to|in|on|from|before|after|that|and|using|so|without|into|about|as|at|by|when|while)$/i;

/** A nagy szöveg ideális hossza a kártyán — ehhez a legközelebbi törést keressük. */
const CEL_HOSSZ = 18;

/**
 * Egy lépés-cím kettévágása: NAGY szöveg + alcím.
 *
 * A kézzel írt mintában a „Watch the face for small glitches" ebből lett:
 * nagy „Watch the face", kicsi „for small glitches". Ez nem ötlet volt,
 * hanem a mondat természetes törése — és gépiesíthető.
 *
 * ⚠️ NEM az ELSŐ töréspontnál vágunk. A „Listen to the voice for flat
 * delivery" első törése a „to", ami után egyetlen szó maradna („Listen").
 * Azt a törést keressük, ahol a nagy szöveg a CEL_HOSSZ-hoz legközelebb van.
 */
export function splitHeading(cim) {
  // A zárójeles kiegészítés se a kártyára, se a hangba nem való.
  const t = String(cim == null ? '' : cim).replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  if (!t) return { nagy: '', kicsi: '' };

  const szavak = t.split(' ');
  let legjobb = -1, legjobbTav = Infinity;
  for (let i = 1; i < szavak.length; i++) {
    if (!TORES.test(szavak[i])) continue;
    if (i < 2) continue;                      // egyszavas nagy szöveg nem kártya
    const hossz = szavak.slice(0, i).join(' ').length;
    const tav = Math.abs(hossz - CEL_HOSSZ);
    if (tav < legjobbTav) { legjobbTav = tav; legjobb = i; }
  }
  // Rövid cím egyben marad: a darabolás csak akkor segít, ha van mit darabolni.
  if (legjobb < 0 || t.length <= 26) return { nagy: t, kicsi: '' };
  return { nagy: szavak.slice(0, legjobb).join(' '), kicsi: szavak.slice(legjobb).join(' ') };
}

/** A frontmatter egy mezője. */
function fm(md, kulcs) {
  const m = String(md).match(new RegExp('^' + kulcs + ':\\s*["\']?(.*?)["\']?\\s*$', 'm'));
  return m ? m[1].trim() : '';
}

/** A nagy szöveg tördelése a kártyán — kézzel, mert az SVG nem tördel. */
function tordel(s, maxSor = 13) {
  const szavak = String(s).split(' ');
  const sorok = [];
  let mostani = '';
  for (const sz of szavak) {
    if (!mostani) { mostani = sz; continue; }
    if ((mostani + ' ' + sz).length <= maxSor) mostani += ' ' + sz;
    else { sorok.push(mostani); mostani = sz; }
  }
  if (mostani) sorok.push(mostani);
  return sorok.slice(0, 3).join('\n');
}

/**
 * A videó kártyái egy útmutató markdownjából.
 *
 * A HALLGATÁS A BIZTONSÁGOS IRÁNY: ha a cikk nem alkalmas (kevés lépés,
 * nincs cím), `cards: null`-t adunk vissza az OKKAL együtt — rossz videót
 * kitenni rosszabb, mint nem kitenni semmit.
 *
 * @returns {{cards: object[]|null, reason: string}}
 */
export function cardsFromGuide(md, { maxSteps = 4 } = {}) {
  if (typeof md !== 'string' || !md.trim()) return { cards: null, reason: 'nincs szöveg' };

  const cim = fm(md, 'title');
  if (!cim) return { cards: null, reason: 'nincs cím a frontmatterben' };

  // ⚠️ CSAK a „Step N — …" alakú fejlécek lépések. A „Before you start" és a
  // „Common mistakes" ugyanúgy `##`, de nem tartozik a menetbe.
  const lepesek = [...md.matchAll(/^##\s*Step\s*\d+\s*[—–-]\s*(.+)$/gim)].map(m => m[1].trim());
  if (lepesek.length < MIN_LEPES) {
    return { cards: null, reason: `csak ${lepesek.length} lépés (legalább ${MIN_LEPES} kell)` };
  }

  const valasztott = lepesek.slice(0, Math.max(MIN_LEPES, maxSteps));
  const horogCim = splitHeading(cim.replace(/^how to\s+/i, '')).nagy;

  // A HOROG. Reelsben az első két másodperc dönt, ezért FELSZÓLÍTÓ mondat,
  // nem körülírás: a „How to Spot a Deepfake…" címből „Spot a Deepfake…" lesz.
  // Az első változat „Here is how to Spot a…"-t mondott — hosszabb és sutább.
  const horogMondat = cim.replace(/^how to\s+/i, '').replace(/[.:]\s*$/, '');
  const cards = [{
    cimke: '',
    nagy: tordel(horogCim),
    kicsi: `In ${SORSZAM[valasztott.length - 1]?.toLowerCase() || valasztott.length} steps`,
    mond: `${horogMondat}. In ${SORSZAM[valasztott.length - 1]?.toLowerCase() || valasztott.length} fast steps.`
  }];

  valasztott.forEach((l, i) => {
    const { nagy, kicsi } = splitHeading(l);
    cards.push({
      cimke: String(i + 1).padStart(2, '0'),
      nagy: tordel(nagy),
      kicsi,
      // A sorszám kimondva tartja követhetően a menetet.
      mond: `${SORSZAM[i] || i + 1}. ${nagy}${kicsi ? ' ' + kicsi : ''}.`
    });
  });

  cards.push({
    cimke: '',
    nagy: 'aiworldhq\n.com',
    kicsi: 'Daily AI tips, in plain English',
    // ⚠️ A felolvasó a pontot nem mondja ki — ezért „dot com".
    mond: 'Full guide at aiworldhq dot com.'
  });

  return { cards, reason: '' };
}

/** Becsült hossz másodpercben — a kapuhoz, nem a vágáshoz. */
export function becsultHossz(cards) {
  const szavak = (cards || []).map(c => c.mond).join(' ').trim().split(/\s+/).length;
  return szavak / SZO_PER_MP + (cards || []).length * SZUNET_MP;
}

// ── A RENDERELÉS (ffmpeg + sharp + msedge-tts) ──────────────────────
// Innentől I/O van: a tesztek a fenti tiszta függvényeket nézik.

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Egy álló tábla SVG-ben. A színek a megosztás-képekéivel azonosak. */
export function tablaSvg({ cimke, nagy, kicsi }, i, db) {
  const sorok = String(nagy).split('\n');
  const meret = sorok.some(s => s.length > 11) ? 118 : 146;
  const kezd = H / 2 - ((sorok.length - 1) * meret * 0.56);
  const szoveg = sorok.map((s, k) =>
    `<text x="${W / 2}" y="${kezd + k * meret * 1.12}" text-anchor="middle" font-size="${meret}"
       font-family="Arial Black, Arial, sans-serif" font-weight="900" fill="#ffffff">${esc(s)}</text>`).join('\n');

  // Haladásjelző: Reelsben ez mutatja, mennyi van hátra — ez tartja bent a nézőt.
  const sav = Array.from({ length: db }, (_, k) => {
    const sz = (W - 120 - (db - 1) * 10) / db;
    return `<rect x="${60 + k * (sz + 10)}" y="${H - 132}" width="${sz}" height="7" rx="3.5"
      fill="${k <= i ? '#e8c15a' : '#ffffff'}" opacity="${k <= i ? '1' : '0.22'}"/>`;
  }).join('\n');

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#14120f" opacity="0.80"/>
  <rect x="0" y="0" width="${W}" height="10" fill="#e8c15a"/>
  ${cimke ? `<text x="${W / 2}" y="${H / 2 - 330}" text-anchor="middle" font-size="150"
      font-family="Arial Black, Arial, sans-serif" font-weight="900" fill="#e8c15a" opacity="0.85">${cimke}</text>` : ''}
  ${szoveg}
  ${kicsi ? `<text x="${W / 2}" y="${H / 2 + 250}" text-anchor="middle" font-size="52"
    font-family="Arial, sans-serif" fill="#e8c15a">${esc(kicsi)}</text>` : ''}
  ${sav}
  <text x="${W / 2}" y="${H - 66}" text-anchor="middle" font-size="40" letter-spacing="5"
    font-family="Arial, sans-serif" font-weight="bold" fill="#ffffff" opacity="0.72">AI WORLD HQ</text>
</svg>`);
}

const hossz = f => parseFloat(execFileSync('ffprobe',
  ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim());

/**
 * A videó legyártása. Külön függvény, hogy a szkript-logika tesztelhető
 * maradjon nélküle.
 *
 * @returns {Promise<{file: string, seconds: number}>}
 */
export async function renderVideo(cards, { out, workDir, cover, voice = 'en-US-AvaMultilingualNeural' }) {
  const sharp = (await import('sharp')).default;
  const { MsEdgeTTS, OUTPUT_FORMAT } = await import('msedge-tts');

  rmSync(workDir, { recursive: true, force: true });
  mkdirSync(workDir, { recursive: true });

  const hatter = cover && existsSync(cover)
    ? await sharp(cover).resize(W, H, { fit: 'cover' }).blur(9).toBuffer()
    : await sharp({ create: { width: W, height: H, channels: 3, background: '#14120f' } }).png().toBuffer();

  const idok = [];
  for (let i = 0; i < cards.length; i++) {
    const nyers = join(workDir, `n${i}.mp3`), mp3 = join(workDir, `h${i}.mp3`);

    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(cards[i].mond);
    const d = [];
    audioStream.on('data', x => d.push(x));
    await new Promise(r => audioStream.on('close', r));
    writeFileSync(nyers, Buffer.concat(d));

    // A szünet a HANGBA is bekerül — enélkül a kép elcsúszik a beszédtől.
    execFileSync('ffmpeg', ['-y', '-i', nyers, '-af', `apad=pad_dur=${SZUNET_MP}`,
      '-c:a', 'libmp3lame', mp3], { stdio: 'pipe' });
    idok.push(hossz(mp3));

    await sharp(hatter).composite([{ input: tablaSvg(cards[i], i, cards.length) }])
      .jpeg({ quality: 92 }).toFile(join(workDir, `k${i}.jpg`));
  }

  writeFileSync(join(workDir, 'kepek.txt'),
    cards.map((_, i) => `file 'k${i}.jpg'\nduration ${idok[i].toFixed(3)}`).join('\n')
    + `\nfile 'k${cards.length - 1}.jpg'\n`, 'utf-8');
  writeFileSync(join(workDir, 'hangok.txt'), cards.map((_, i) => `file 'h${i}.mp3'`).join('\n'), 'utf-8');

  execFileSync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', join(workDir, 'hangok.txt'),
    '-c', 'copy', join(workDir, 'teljes.mp3')], { stdio: 'pipe' });

  execFileSync('ffmpeg', ['-y',
    '-f', 'concat', '-safe', '0', '-i', join(workDir, 'kepek.txt'),
    '-i', join(workDir, 'teljes.mp3'),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30', '-preset', 'veryfast', '-crf', '26',
    '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart',
    '-vf', `scale=${W}:${H}`, out], { stdio: 'pipe' });

  return { file: out, seconds: idok.reduce((a, b) => a + b, 0) };
}

export default { cardsFromGuide, splitHeading, becsultHossz, renderVideo, tablaSvg, MIN_LEPES, W, H };

// ── CLI ─────────────────────────────────────────────────────────────
//
//   node core/short-video.js <slug|fájlnév>     egy videó legyártása
//   node core/short-video.js <...> --dry        csak a szkript, $0, ffmpeg nélkül
//
// ⚠️ EZ A FÁJL AZ IMPORTRA NEM INDUL EL. 25 agentből 21 a fájl végén
// feltétel nélkül hívja a main()-t → a puszta import pénzt költ és publikál
// (2026-08-06). A core/daily-report.js és a core/video-compose.js is ilyen.
// Itt őrszem van.

async function main() {
  const { readFileSync, readdirSync } = await import('fs');
  const { fileURLToPath } = await import('url');
  const { dirname } = await import('path');
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const kulcs = args.find(a => !a.startsWith('--'));
  if (!kulcs) { console.log('Használat: node core/short-video.js <slug> [--dry]'); return; }

  const DIR = join(ROOT, 'content', 'articles');
  const fajl = readdirSync(DIR).find(f => f.includes(kulcs) && f.endsWith('.json'));
  if (!fajl) { console.log('❌ nincs ilyen cikk: ' + kulcs); process.exit(1); }

  const a = JSON.parse(readFileSync(join(DIR, fajl), 'utf-8'));
  const slug = a._meta?.slug || kulcs;
  const { cards, reason } = cardsFromGuide(a.article_markdown || '', { maxSteps: 4 });
  if (!cards) { console.log('⏭️  kihagyva — ' + reason); return; }

  console.log('🎬 ' + slug);
  for (const c of cards) console.log('   ' + (c.cimke || '  ') + '  «' + c.mond + '»');
  console.log('   becsült hossz: ' + becsultHossz(cards).toFixed(1) + ' mp');
  if (dry) { console.log('   (--dry: itt megállunk)'); return; }

  // A videó a FORRÁS-oldalon él, nem a public/-ban: a build ÜRÍTI a public/-ot
  // (lásd a deploy-receptet), tehát ami oda kerül, az a következő buildnél
  // eltűnne. A build innen másolja ki (website/build.js, shorts/).
  const kiDir = join(ROOT, 'website', 'assets', 'video', 'shorts');
  mkdirSync(kiDir, { recursive: true });
  const cover = join(ROOT, 'website', 'assets', 'images', slug + '.jpg');

  const r = await renderVideo(cards, {
    out: join(kiDir, slug + '.mp4'),
    workDir: join(ROOT, '.video-munka'),
    cover
  });
  rmSync(join(ROOT, '.video-munka'), { recursive: true, force: true });
  console.log('✅ ' + r.file + ' — ' + r.seconds.toFixed(1) + ' mp, ' + W + 'x' + H);
}

const kozvetlen = process.argv[1] && process.argv[1].endsWith('short-video.js');
if (kozvetlen) main().catch(e => { console.error('💥 short-video hiba:', e.message); process.exit(1); });
