// ===================================================================
// TESZT — a kiépített kimenet frissessége (core/built-output.js)
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
// A MIÉRT: a kimenetet néző tesztek egy befagyott, napokkal korábbi buildön
// adtak zöldet (helyben), a CI-ban pedig üresen (nincs public/). Ez a modul
// dönti el, mikor szabad a helyi kimeneten állítani.
// ===================================================================

import assert from 'assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { kimenetAllapot, kimenetForrasai } from './built-output.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };
console.log('🧪 kiépített kimenet frissessége\n');

// Kitalált projekt egy ideiglenes mappában; az időbélyegeket INJEKTÁLJUK,
// hogy a teszt ne függjön a fájlrendszer óráitól.
function projekt({ publikus = true } = {}) {
  const g = mkdtempSync(join(tmpdir(), 'kimenet-'));
  mkdirSync(join(g, 'website', 'assets'), { recursive: true });
  mkdirSync(join(g, 'core'), { recursive: true });
  writeFileSync(join(g, 'website', 'build.js'),
    "import { a } from '../core/mid-guide.js';\nimport { b } from '../core/topics.js';\n", 'utf-8');
  writeFileSync(join(g, 'website', 'assets', 'style.css'), '', 'utf-8');
  writeFileSync(join(g, 'core', 'mid-guide.js'), '', 'utf-8');
  writeFileSync(join(g, 'core', 'topics.js'), '', 'utf-8');
  if (publikus) {
    mkdirSync(join(g, 'website', 'public', 'article'), { recursive: true });
    writeFileSync(join(g, 'website', 'public', 'index.html'), '', 'utf-8');
  }
  return g;
}
const orak = (g, ido) => (p) => {
  const rel = p.replace(/\\/g, '/').slice(g.replace(/\\/g, '/').length + 1);
  if (!(rel in ido)) throw new Error('nincs idő: ' + rel);
  return ido[rel];
};
const ALAP = {
  'website/public/index.html': 1000,
  'website/build.js': 900, 'website/assets/style.css': 900,
  'core/mid-guide.js': 900, 'core/topics.js': 900
};

t('nincs kiépített kimenet → nem használható, és megmondja, miért', () => {
  const g = projekt({ publikus: false });
  try {
    const a = kimenetAllapot(g, { mtimeFn: orak(g, ALAP) });
    assert.equal(a.hasznalhato, false);
    assert.match(a.ok, /nincs kiépített kimenet/);
  } finally { rmSync(g, { recursive: true, force: true }); }
});

t('a kimenet újabb minden forrásnál → friss', () => {
  const g = projekt();
  try {
    const a = kimenetAllapot(g, { mtimeFn: orak(g, ALAP) });
    assert.deepEqual([a.hasznalhato, a.ok], [true, 'friss']);
  } finally { rmSync(g, { recursive: true, force: true }); }
});

t('🔴 a build.js újabb a kimenetnél → ELAVULT (ez volt a helyi 09-09-i másolat)', () => {
  const g = projekt();
  try {
    const a = kimenetAllapot(g, { mtimeFn: orak(g, { ...ALAP, 'website/build.js': 1500 }) });
    assert.equal(a.hasznalhato, false);
    assert.deepEqual(a.ujabb, ['website/build.js']);
    assert.match(a.ok, /ELAVULT/);
  } finally { rmSync(g, { recursive: true, force: true }); }
});

t('🔴 egy build.js által IMPORTÁLT core-modul újabb → szintén ELAVULT', () => {
  // A kimenetet nem csak a build.js állítja elő: a mid-guide.js változása is
  // más HTML-t ad. A lista a build.js importjaiból épül, így magától követi.
  const g = projekt();
  try {
    assert.ok(kimenetForrasai(g).includes('core/mid-guide.js'));
    const a = kimenetAllapot(g, { mtimeFn: orak(g, { ...ALAP, 'core/mid-guide.js': 2000 }) });
    assert.equal(a.hasznalhato, false);
    assert.deepEqual(a.ujabb, ['core/mid-guide.js']);
  } finally { rmSync(g, { recursive: true, force: true }); }
});

t('a kifejezetten megadott mappáért a hívó felel', () => {
  const g = projekt();
  try {
    assert.equal(kimenetAllapot(g, { pubDir: join(g, 'website', 'public', 'article') }).hasznalhato, true);
    assert.equal(kimenetAllapot(g, { pubDir: join(g, 'nincs-ilyen') }).hasznalhato, false);
  } finally { rmSync(g, { recursive: true, force: true }); }
});

t('a VALÓDI build.js importjai bekerülnek a forráslistába', () => {
  const lista = kimenetForrasai(ROOT);
  for (const kell of ['website/build.js', 'website/assets/style.css', 'core/mid-guide.js', 'core/topics.js'])
    assert.ok(lista.includes(kell), 'hiányzik a forráslistából: ' + kell);
  console.log('     📏 ' + lista.length + ' forrásfájl · a helyi kimenet most: ' + kimenetAllapot(ROOT).ok);
});

console.log(`\n✅ ${pass} teszt rendben`);
