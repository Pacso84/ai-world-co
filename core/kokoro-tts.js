// ===================================================================
// 🤗 KOKORO TARTALÉK FELOLVASÓ (2026-11-19, user: „rádbízom”)
// ===================================================================
// MIT: ha a Microsoft-felolvasó (Edge TTS) elbukik, a Motion Reel hangját a Kokoro-82M adja
// (Hugging Face, Apache-2.0, a GitHub CPU-ján fut, $0). Eddig ilyenkor a régi Reel készült — de az
// is az Edge TTS-t használja, tehát valójában NEM lett videó (10-24: 3 futás, 0 Reel).
// PRÓBA (11-19, .github/workflows/kokoro-proba.yml): telepítés 53 mp, betöltés 10,5 mp, egy ~14 mp-es
// Reel hangja ~7 mp, szóidőzítés 38/38 szó → a szavankénti felirat ugyanúgy működik.
// HANG: af_heart — női, mint az Edge-es Ava (a Reelek hangja ne ugorjon), és a Kokoro legjobbra értékelt hangja.
// TELEPÍTÉS: csak akkor, amikor tényleg kell (a normál napokon a CI-t 1 másodperccel sem lassítja).
// ⛔ KIKAPCSOLÁS: KOKORO_TARTALEK_BE = false → Edge-hibánál újra a régi viselkedés (hiba → régi Reel).
// RIPORT: memory/kokoro-tartalek.json → core/daily-report.js „🤗 TARTALÉK FELOLVASÓ” sor (csak ha aznap beugrott).
// ===================================================================
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const KOKORO_TARTALEK_BE = true;
export const KOKORO_HANG = 'af_heart';
export const KOKORO_CSOMAGOK = ['kokoro>=0.9.2,<1.0', 'soundfile'];
const ITT = dirname(fileURLToPath(import.meta.url));
const ROOT = join(ITT, '..');
const PYTHON = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');

/** Csak írásjelből álló „szó” nem szó (ugyanaz a mérce, mint a motion-reel.js szószámlálója). */
export function kokoroSzavak(nyers) {
  return (nyers || []).filter(s => /[\p{L}\p{N}]/u.test(String(s?.w || '')))
    .map(s => ({ t: Number(s.t) || 0, d: Number(s.d) || 0, w: String(s.w) }));
}

/** A Python csomagok — egyszer futásonként, és csak ha még nincsenek fent. */
function telepit(futtat, naplo) {
  try { futtat(PYTHON, ['-c', 'import kokoro, soundfile'], { stdio: 'pipe' }); return; } catch { /* telepíteni kell */ }
  naplo('   🤗 Kokoro telepítése (~1 perc, csak tartalék-napon)…');
  try { futtat('sudo', ['apt-get', 'install', '-y', '-qq', 'espeak-ng'], { stdio: 'pipe', timeout: 120000 }); } catch { /* a pip-es espeak is elég */ }
  futtat(PYTHON, ['-m', 'pip', 'install', '-q', 'torch', '--index-url', 'https://download.pytorch.org/whl/cpu'], { stdio: 'pipe', timeout: 400000 });
  futtat(PYTHON, ['-m', 'pip', 'install', '-q', ...KOKORO_CSOMAGOK], { stdio: 'pipe', timeout: 300000 });
}

/** A szegmensek hangja egy Python-futásban (a modell egyszer töltődik be). → [{ mp3: wav-út, szavak }] */
export function kokoroFelolvas(szovegek, dir, { hang = KOKORO_HANG, futtat = execFileSync, naplo = console.log } = {}) {
  telepit(futtat, naplo);
  mkdirSync(dir, { recursive: true });
  const be = join(dir, 'kokoro-be.json');
  writeFileSync(be, JSON.stringify({ szovegek, hang, dir }), 'utf-8');
  const ki = String(futtat(PYTHON, [join(ITT, 'kokoro-tts.py'), be], { encoding: 'utf-8', maxBuffer: 1e8, timeout: 400000, stdio: ['ignore', 'pipe', 'pipe'] }));
  const sor = ki.trim().split('\n').pop();
  const lista = JSON.parse(sor);
  if (!Array.isArray(lista) || lista.length !== szovegek.length) throw new Error('Kokoro: a szegmensek száma nem egyezik');
  return lista.map(x => ({ mp3: x.wav, szavak: kokoroSzavak(x.szavak) }));
}

/**
 * A hang-gyártás menete: Edge TTS → hiba esetén Kokoro (ha be van kapcsolva).
 * KOKORO_KENYSZER=1 (csak a kézi előnézet-workflow) → rögtön a Kokoro, az Edge-et ki sem próbálja.
 * @returns {{ hangok: [{mp3, szavak}], felolvaso: 'edge'|'kokoro' }}
 */
export async function hangokGyartasa(szovegek, { edge, kokoro, be = KOKORO_TARTALEK_BE, kenyszer = process.env.KOKORO_KENYSZER === '1', feljegyez = tartalekFeljegyez, naplo = console.log }) {
  let edgeHiba;
  if (!kenyszer) {
    try { return { hangok: await edge(), felolvaso: 'edge' }; } catch (e) {
      if (!be) throw e;
      edgeHiba = String(e?.message || e).slice(0, 160);
      naplo('   ⚠️ Microsoft-felolvasó hiba (' + edgeHiba + ') → 🤗 Kokoro tartalék');
    }
  }
  try {
    const hangok = await kokoro();
    feljegyez({ ok: true, edgeHiba: edgeHiba || (kenyszer ? 'kényszerítve (próba)' : '') });
    return { hangok, felolvaso: 'kokoro' };
  } catch (e) {
    const kHiba = String(e?.message || e).slice(0, 160);
    feljegyez({ ok: false, edgeHiba, kokoroHiba: kHiba });
    throw new Error('Edge TTS: ' + (edgeHiba || '—') + ' · Kokoro: ' + kHiba);
  }
}

/** Napi feljegyzés a riportnak: memory/kokoro-tartalek.json { nap, ok, hiba, utolsoEdgeHiba, utolsoKokoroHiba }. SOHA nem dob. */
export function tartalekFeljegyez(r, { gyoker = ROOT, most = new Date() } = {}) {
  try {
    const dir = join(gyoker, 'memory');
    mkdirSync(dir, { recursive: true });
    const p = join(dir, 'kokoro-tartalek.json');
    const nap = most.toISOString().slice(0, 10);
    let e = {};
    if (existsSync(p)) { try { e = JSON.parse(readFileSync(p, 'utf-8')); } catch { /* */ } }
    if (e.nap !== nap) e = { nap, ok: 0, hiba: 0 };
    if (r.ok) e.ok++; else { e.hiba++; e.utolsoKokoroHiba = r.kokoroHiba || ''; }
    if (r.edgeHiba) e.utolsoEdgeHiba = r.edgeHiba;
    e.at = most.toISOString();
    writeFileSync(p, JSON.stringify(e, null, 1), 'utf-8');
  } catch { /* a feljegyzés hibája nem ronthatja el a Reelt */ }
}

/** A napi riport sora — '' ha ma nem kellett a tartalék. */
export function kokoroRiportSor(e, ma) {
  if (!e || e.nap !== ma || !(e.ok || e.hiba)) return '';
  const ok = e.ok ? `ma ${e.ok} Reel hangját a Kokoro adta` : '';
  const hiba = e.hiba ? `${ok ? ' · ' : ''}❌ ${e.hiba}× a tartalék IS elbukott (${String(e.utolsoKokoroHiba || '?').slice(0, 80)})` : '';
  return `🤗 TARTALÉK FELOLVASÓ: ${ok}${hiba} — a Microsoft-felolvasó hibája: ${String(e.utolsoEdgeHiba || '?').slice(0, 90)}`;
}
