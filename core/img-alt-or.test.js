// 🖼️ IMG ALT őr (2026-11-06): a Bing „<img> ALT nélkül” jelzése a /trending lapon jött (alt="").
// A kimenet-őr minden kiépített lapon jelzi; a /trending sablon a cikk címét adja alt-nak.
import assert from 'assert';
import { readFileSync } from 'fs';
import { altEllenorzes } from './output-guard.js';

let fail = 0;
const t = (n, f) => { try { f(); console.log('  ✅', n); } catch (e) { fail++; console.log('  ❌', n, '\n    ', e.message); } };

t('a jó lapot átengedi (dupla/szimpla idézőjel, idézőjel nélküli alt; script-beli sablon nem kép)', () => {
  const h = `<img src="a.jpg" alt="Logo"><img alt='Cím' src=b.jpg><img src=c alt=X>
    <script>const s = '<img src="x">';</script>`;
  assert.equal(altEllenorzes([{ f: 'index.html', h }]), null);
});

t('🔑 ELKAPJA: hiányzó alt, üres alt, csak szóköz', () => {
  const l = altEllenorzes([
    { f: 'trending.html', h: '<img src="a.jpg" alt="" width="1">' },
    { f: 'hu/x.html', h: '<img src="b.jpg">' },
    { f: 'es/y.html', h: '<img src="c.jpg" alt="  ">' },
    { f: 'ok.html', h: '<img src="d.jpg" alt="ok">' }
  ]);
  assert.ok(l, 'nem jelzett');
  assert.equal(l.code, 'IMG_ALT_HIANY');
  assert.equal(l.db, 3);
  assert.match(l.uzenet, /trending\.html \(1 kép\)/);
});

t('az átirányító lap és a Google-igazoló fájl kivétel (mint a H1-nél)', () => {
  assert.equal(altEllenorzes([{ f: 'google1a2b.html', h: '<img src="x">' },
    { f: 'old.html', h: '<meta http-equiv="refresh" content="0;url=/"><img src="x">' }]), null);
});

t('bekötés: a CLI hívja, és a /trending sablon nem ad üres alt-ot', () => {
  const og = readFileSync(new URL('./output-guard.js', import.meta.url), 'utf-8');
  assert.match(og, /const alt = altEllenorzes\(minden\);\s*\n\s*if \(alt\) eredmeny\.problems\.unshift\(alt\);/);
  const tr = readFileSync(new URL('./trend-radar.js', import.meta.url), 'utf-8');
  assert.doesNotMatch(tr, /alt=""/, '🔴 a /trending képe újra üres alt-tal megy ki');
});

if (fail) { console.log(`❌ ${fail} hiba`); process.exit(1); }
console.log('✅ img-alt-or: minden rendben');
