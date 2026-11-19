// node core/kokoro-tts.test.js — a Kokoro tartalék felolvasó menete (offline, hamis felolvasókkal; Python NEM fut)
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hangokGyartasa, kokoroSzavak, kokoroFelolvas, tartalekFeljegyez, kokoroRiportSor, KOKORO_TARTALEK_BE, KOKORO_HANG } from './kokoro-tts.js';

const HANG = [{ mp3: 'a.wav', szavak: [{ t: 0, d: 0.3, w: 'Hi' }] }];
const csendes = () => {};
const jegyek = [];
const jegyez = r => jegyek.push(r);

// 1) Edge működik → a Kokoro HOZZÁ SEM nyúl (a normál napot nem lassítja)
{
  let kHivas = 0;
  const r = await hangokGyartasa(['x'], { edge: async () => HANG, kokoro: async () => { kHivas++; return HANG; }, kenyszer: false, feljegyez: jegyez, naplo: csendes });
  assert.equal(r.felolvaso, 'edge');
  assert.equal(kHivas, 0, '⚠️ a Kokoro akkor is fut, ha az Edge jó');
  assert.equal(jegyek.length, 0, 'jó napon nem lehet tartalék-feljegyzés (hamis riasztás a riportban)');
}
// 2) Edge hibázik → Kokoro adja a hangot, és ez a riportba kerül
{
  const r = await hangokGyartasa(['x'], { edge: async () => { throw new Error('WebSocket error: 403'); }, kokoro: async () => HANG, kenyszer: false, feljegyez: jegyez, naplo: csendes });
  assert.equal(r.felolvaso, 'kokoro');
  assert.deepEqual(r.hangok, HANG);
  assert.equal(jegyek.at(-1).ok, true);
  assert.match(jegyek.at(-1).edgeHiba, /403/, 'a riport nem tudná megmondani, MIÉRT ugrott be a tartalék');
}
// 3) KAPCSOLÓ KI → a régi viselkedés: az Edge hibája továbbmegy (→ reel-post: régi Reel)
{
  await assert.rejects(hangokGyartasa(['x'], { edge: async () => { throw new Error('edge le'); }, kokoro: async () => HANG, be: false, kenyszer: false, feljegyez: jegyez, naplo: csendes }), /edge le/);
}
// 4) Mindkettő bukik → érthető, kettős hibaüzenet + feljegyzés (nem néma)
{
  await assert.rejects(hangokGyartasa(['x'], { edge: async () => { throw new Error('edge le'); }, kokoro: async () => { throw new Error('pip hiba'); }, kenyszer: false, feljegyez: jegyez, naplo: csendes }), /Edge TTS: edge le · Kokoro: pip hiba/);
  assert.equal(jegyek.at(-1).ok, false);
  assert.match(jegyek.at(-1).kokoroHiba, /pip hiba/);
}
// 5) Kényszer (csak a kézi előnézet) → az Edge-et ki sem próbálja
{
  let eHivas = 0;
  const r = await hangokGyartasa(['x'], { edge: async () => { eHivas++; return HANG; }, kokoro: async () => HANG, kenyszer: true, feljegyez: jegyez, naplo: csendes });
  assert.equal(r.felolvaso, 'kokoro'); assert.equal(eHivas, 0);
}
// 6) Szavak: írásjel-token kiesik, a mezők számok (a motion-reel szószámlálójával egyező mérce)
assert.deepEqual(kokoroSzavak([{ w: 'OpenAI', t: 0.275, d: 0.7 }, { w: ',', t: 1, d: 0 }, { w: '.', t: 2, d: 0 }, { w: 'dot', t: '2.1', d: '0.2' }]),
  [{ t: 0.275, d: 0.7, w: 'OpenAI' }, { t: 2.1, d: 0.2, w: 'dot' }]);
// 7) kokoroFelolvas: a Python kimenetének UTOLSÓ sorát olvassa (előtte figyelmeztetések lehetnek), hiányzó csomagnál telepít
{
  const dir = mkdtempSync(join(tmpdir(), 'kokoro-'));
  const hivasok = [];
  const futtat = (cmd, args) => {
    hivasok.push([cmd, ...args].join(' '));
    if (args[0] === '-c') throw new Error('No module named kokoro');
    if (String(args[0]).endsWith('kokoro-tts.py')) {
      const be = JSON.parse(readFileSync(args[1], 'utf-8'));
      assert.equal(be.hang, KOKORO_HANG);
      return 'WARNING: valami zaj\n' + JSON.stringify(be.szovegek.map((_, i) => ({ wav: join(dir, `k${i}.wav`), szavak: [{ w: 'Hi', t: 0.1, d: 0.2 }, { w: '!', t: 0.3, d: 0 }] })));
    }
    return '';
  };
  const r = kokoroFelolvas(['Hi!', 'Yo.'], dir, { futtat, naplo: csendes });
  assert.equal(r.length, 2);
  assert.deepEqual(r[0].szavak, [{ t: 0.1, d: 0.2, w: 'Hi' }]);
  assert.ok(hivasok.some(h => /pip install -q kokoro/.test(h)), 'hiányzó csomagnál nem telepített');
  assert.ok(hivasok.some(h => /download\.pytorch\.org\/whl\/cpu/.test(h)), 'a torch nem a kis CPU-s változat (a GPU-s több GB, lassú)');
  // ha már fent van, NEM telepít újra
  const h2 = [];
  kokoroFelolvas(['a'], dir, { futtat: (c, a) => { h2.push(a.join(' ')); return a[0] === '-c' ? '' : JSON.stringify([{ wav: 'x', szavak: [] }]); }, naplo: csendes });
  assert.ok(!h2.some(h => /pip install/.test(h)), 'feleslegesen telepít újra');
  // darabszám-eltérés → hiba (különben elcsúszna a hang a szöveghez képest)
  assert.throws(() => kokoroFelolvas(['a', 'b'], dir, { futtat: (c, a) => a[0] === '-c' ? '' : JSON.stringify([{ wav: 'x', szavak: [] }]), naplo: csendes }), /nem egyezik/);
  rmSync(dir, { recursive: true, force: true });
}
// 8) Feljegyzés + riport-sor: csak a MAI napra szól, napváltáskor nullázódik
{
  const g = mkdtempSync(join(tmpdir(), 'kokoro-g-'));
  tartalekFeljegyez({ ok: true, edgeHiba: 'WS 403' }, { gyoker: g, most: new Date('2026-11-20T05:00:00Z') });
  tartalekFeljegyez({ ok: true, edgeHiba: 'WS 403' }, { gyoker: g, most: new Date('2026-11-20T06:00:00Z') });
  let e = JSON.parse(readFileSync(join(g, 'memory', 'kokoro-tartalek.json'), 'utf-8'));
  assert.equal(e.ok, 2);
  assert.match(kokoroRiportSor(e, '2026-11-20'), /ma 2 Reel hangját a Kokoro adta.*WS 403/);
  assert.equal(kokoroRiportSor(e, '2026-11-21'), '', 'a tegnapi tartalék nem szólhat a mai riportban');
  tartalekFeljegyez({ ok: false, edgeHiba: 'x', kokoroHiba: 'pip' }, { gyoker: g, most: new Date('2026-11-21T05:00:00Z') });
  e = JSON.parse(readFileSync(join(g, 'memory', 'kokoro-tartalek.json'), 'utf-8'));
  assert.equal(e.ok, 0); assert.equal(e.hiba, 1);
  assert.match(kokoroRiportSor(e, '2026-11-21'), /❌ 1× a tartalék IS elbukott \(pip\)/);
  assert.equal(kokoroRiportSor(null, '2026-11-21'), '');
  rmSync(g, { recursive: true, force: true });
}
// 9) Bekötés-őrök: a motion-reel TÉNYLEG ezen a menetén gyárt, a riport TÉNYLEG kiírja (kommentek nélkül nézve)
{
  const tiszta = f => readFileSync(new URL(f, import.meta.url), 'utf-8').split('\n').filter(s => !s.trim().startsWith('//')).join('\n');
  assert.ok(/hangokGyartasa\s*\(/.test(tiszta('./motion-reel.js')), '⚠️ a motion-reel.js nem a tartalékos menettel gyárt');
  assert.ok(/kokoroFelolvas\s*\(/.test(tiszta('./motion-reel.js')), 'a motion-reel.js nem adja át a Kokorót tartaléknak');
  assert.ok(/kokoroRiportSor\s*\(/.test(tiszta('./daily-report.js')), '⚠️ a napi riport nem írja ki, ha a tartalék beugrott (néma őr)');
  assert.equal(KOKORO_TARTALEK_BE, true);
}
console.log('✅ kokoro-tts.test: minden átment');
