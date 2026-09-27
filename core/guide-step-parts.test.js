// ===================================================================
// TESZT — az útmutató-lépés részekre bontása a „prezentáció" nézethez
// (core/guide-step-parts.js). Ingyenes, hálózat nélkül; a valódi
// útmutatókon is végigmegy (csak olvas).
// ===================================================================
import assert from 'assert/strict';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { lepesReszek, dobozSzoveg } from './guide-step-parts.js';
import { utmutatoE } from './guide-kind.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, bukott = 0;
const t = (nev, fn) => {
  try { fn(); pass++; console.log('  ✅ ' + nev); }
  catch (e) { bukott++; console.log('  ❌ ' + nev + '\n     ' + String(e.message).split('\n')[0]); }
};
console.log('🧪 Útmutató-lépés részekre bontása\n');

const EN = `Tap the **microphone icon** at the bottom-right of the chat box. A round circle appears. If you can't see a microphone, look inside the top-right ⋯ menu.

💬 Example: say "What's the weather tomorrow?"

You'll know it worked when your spoken words appear as text on the screen.`;

t('🔑 a siker-mondat és a „ha másképp" mondat kiemelődik, a többi szöveg SZÓ SZERINT marad', () => {
  const r = lepesReszek(EN, 'en');
  assert.equal(r.siker, "You'll know it worked when your spoken words appear as text on the screen.");
  assert.equal(r.maskepp, "If you can't see a microphone, look inside the top-right ⋯ menu.");
  assert.ok(r.fo.includes('Tap the **microphone icon** at the bottom-right of the chat box. A round circle appears.'));
  assert.ok(r.fo.includes('💬 Example: say "What\'s the weather tomorrow?"'), 'a 💬 példa elveszett');
  assert.ok(!/You'll know it worked/.test(r.fo) && !/can't see a microphone/.test(r.fo), 'kettőzés: a kiemelt mondat a fő szövegben is maradt');
});

t('magyar és spanyol alak is', () => {
  assert.match(lepesReszek('Nyisd meg az appot. Akkor csináltad jól, ha megjelenik a kezdőképernyő.', 'hu').siker, /^Akkor csináltad jól/);
  assert.match(lepesReszek('Abre la app. Sabrás que funcionó cuando veas la pantalla de inicio.', 'es').siker, /^Sabrás que funcionó/);
});

t('a doboz szövege nem ismétli a doboz címét (élő kép 09-27)', () => {
  assert.equal(dobozSzoveg("You'll know it worked when you can describe the message.", 'siker', 'en'), 'you can describe the message.');
  assert.equal(dobozSzoveg('If it looks different: in some apps a preview shows.', 'maskepp', 'en'), 'in some apps a preview shows.');
  assert.equal(dobozSzoveg('Akkor tudod, hogy működik, ha zöld lesz a pipa.', 'siker', 'hu'), 'zöld lesz a pipa.');
  assert.equal(dobozSzoveg('Sabrás que funcionó cuando veas la pantalla.', 'siker', 'es'), 'veas la pantalla.');
  assert.equal(dobozSzoveg('Tap send when ready.', 'siker', 'en'), 'Tap send when ready.', 'nem illő mondatot is megcsonkított');
  const b = readFileSync(join(ROOT, 'website', 'build.js'), 'utf-8');
  assert.match(b, /dobozSzoveg\(reszek\.siker, 'siker', LANG\)/);
});

t('ha nincs ilyen mondat, a lépés ÉRINTETLEN', () => {
  const md = 'Open the app and sign in with your account.';
  assert.deepEqual(lepesReszek(md, 'en'), { fo: md, siker: '', maskepp: '' });
});

t('a 💬 példa-sorban álló „you\'ll know" NEM emelődik ki (a példa-doboz érintetlen)', () => {
  const md = '💬 Example: "Write: you\'ll know it worked when the cake rises."\n\nThen send it.';
  assert.equal(lepesReszek(md, 'en').siker, '');
});

t('🔑 a VALÓDI útmutatókon: siker-kiemelés ≥90% (en/es), ≥85% (hu); egy szó sem vész el', () => {
  const STEP = /^##\s*(?:(?:step|paso)\s*\d*|\d+\s*\.?\s*l[ée]p[ée]s)/im;
  const db = { en: [0, 0], hu: [0, 0], es: [0, 0] };
  let veszett = 0;
  const AD = join(ROOT, 'content', 'articles'), TD = join(ROOT, 'content', 'translations');
  for (const f of readdirSync(AD).filter(x => x.startsWith('ARTICLE_'))) {
    const d = JSON.parse(readFileSync(join(AD, f), 'utf-8'));
    if (!utmutatoE(f, d)) continue;
    const tr = existsSync(join(TD, f)) ? JSON.parse(readFileSync(join(TD, f), 'utf-8')) : {};
    for (const [ny, md] of [['en', d.article_markdown], ['hu', tr.hu], ['es', tr.es]]) {
      for (const l of String(md || '').split(/\n(?=##\s)/).filter(s => STEP.test(s))) {
        const body = l.split('\n').slice(1).join('\n');
        const r = lepesReszek(body, ny);
        db[ny][0]++; if (r.siker) db[ny][1]++;
        const szavak = s => (String(s).match(/[\p{L}\p{N}]+/gu) || []).length;
        if (szavak(r.fo) + szavak(r.siker) + szavak(r.maskepp) !== szavak(body)) veszett++;
      }
    }
  }
  const arany = ny => db[ny][1] / Math.max(1, db[ny][0]);
  assert.ok(db.en[0] > 1000, 'gyanúsan kevés lépés: ' + db.en[0]);
  assert.ok(arany('en') >= 0.9 && arany('es') >= 0.9 && arany('hu') >= 0.85,
    `lefedettség en ${Math.round(arany('en') * 100)}% · hu ${Math.round(arany('hu') * 100)}% · es ${Math.round(arany('es') * 100)}%`);
  assert.equal(veszett, 0, veszett + ' lépésnél szó veszett el vagy kettőződött a bontáskor');
});

t('a honlap TÉNYLEG használja (lépéskártya + feliratok 3 nyelven + Másolás gomb)', () => {
  const b = readFileSync(join(ROOT, 'website', 'build.js'), 'utf-8');
  assert.match(b, /const reszek = lepesReszek\(s\.body, LANG\);/);
  assert.equal((b.match(/stepOf: '/g) || []).length, 3, 'a „Step n of m" felirat nem mind a 3 nyelven van meg');
  assert.equal((b.match(/masolGomb\(isPrompt\)/g) || []).length, 3, 'a Másolás gomb nem mindkét példa-ágon van');
  const app = readFileSync(join(ROOT, 'website', 'assets', 'app.js'), 'utf-8');
  assert.match(app, /closest\('\.g-copy'\)/);
});

console.log(`\n${bukott ? '❌' : '✅'} ${pass} sikeres, ${bukott} bukott`);
process.exit(bukott ? 1 : 0);
