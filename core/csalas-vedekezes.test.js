// Csalás védekezés-tár (2026-11-23, terv: docs/superpowers/plans/2026-11-21-csalas-figyelo.md 3. rész):
// csatornánként 3–6 kézzel ellenőrzött védekezési lépés, mindegyik mellett a hivatalos forrás URL-je.
// Az író CSAK ezekből (vagy a csalás saját forrásából) választhat. Ingyenes, hálózat nélküli.
import assert from 'node:assert/strict';
import { VEDEKEZES, vedekezesCsatornara, BEJELENTES, ORSZAGFUGGETLEN, PENZ_VISSZA } from './csalas-vedekezes.js';
import { CSATORNAK } from './csalas-figyelo.js';
import { arAllitasok } from './ar-tilalom.js';

let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };
console.log('\n🧪 csalas-vedekezes (védekezés-tár hivatalos forrásokból)');

const ENGEDETT_HOST = ['consumer.ftc.gov', 'reportfraud.ftc.gov', 'www.ftc.gov', 'www.ic3.gov', 'www.fbi.gov', 'www.cisa.gov'];
const minden = () => Object.values(VEDEKEZES).flat();

t('📚 mind a 6 csatornához van tár, és csak azokhoz', () => {
  assert.deepEqual(Object.keys(VEDEKEZES).sort(), [...CSATORNAK].sort());
});

t('🔢 csatornánként 3–6 lépés', () => {
  for (const c of CSATORNAK) {
    const n = VEDEKEZES[c].length;
    assert.ok(n >= 3 && n <= 6, `${c}: ${n} lépés`);
  }
});

t('🔗 minden lépés mellett hivatalos https-forrás (FTC, IC3, FBI, CISA)', () => {
  for (const x of minden()) {
    assert.ok(x.lepes && x.lepes.trim().length > 10, 'üres lépés');
    const u = new URL(x.forras);
    assert.equal(u.protocol, 'https:', x.forras);
    assert.ok(ENGEDETT_HOST.includes(u.host), `nem engedett forrás: ${x.forras}`);
  }
});

t('💵 egyik lépésben sincs ár (core/ar-tilalom.js)', () => {
  for (const x of [...minden(), PENZ_VISSZA]) assert.deepEqual(arAllitasok(x.lepes), [], x.lepes);
});

t('🔁 csatornán belül nincs ismétlődő lépés', () => {
  for (const c of CSATORNAK) {
    const l = VEDEKEZES[c].map(x => x.lepes.toLowerCase());
    assert.equal(new Set(l).size, l.length, c);
  }
});

t('🇺🇸 amerikai angol: nincs brit írásmód a lépésekben', () => {
  for (const x of minden()) assert.ok(!/\b(organis|recognis|realis|colour|behaviour|centre|licence)/i.test(x.lepes), x.lepes);
});

t('🧭 vedekezesCsatornara: másolatot ad; ismeretlen csatornára üres lista', () => {
  const sms = vedekezesCsatornara('sms');
  assert.equal(sms.length, VEDEKEZES.sms.length);
  sms.push({ lepes: 'x', forras: 'y' });
  assert.equal(vedekezesCsatornara('sms').length, VEDEKEZES.sms.length, 'a tár nem módosítható kívülről');
  assert.deepEqual(vedekezesCsatornara('fax'), []);
  assert.deepEqual(vedekezesCsatornara(undefined), []);
});

t('📮 bejelentés: pontosan az IC3 és a ReportFraud, + országfüggetlen mondat', () => {
  assert.deepEqual(BEJELENTES.map(x => x.url), ['https://www.ic3.gov', 'https://reportfraud.ftc.gov']);
  for (const x of BEJELENTES) assert.ok(x.nev && x.nev.length > 2);
  assert.equal(ORSZAGFUGGETLEN, 'Outside the US, contact your local police or consumer protection agency.');
});

t('🏦 pénz-visszakérés lépése hivatalos forrással', () => {
  assert.ok(/bank|card issuer/i.test(PENZ_VISSZA.lepes));
  assert.equal(new URL(PENZ_VISSZA.forras).host, 'consumer.ftc.gov');
});

t('🧊 a tár fagyasztott (nem írható át véletlenül)', () => {
  assert.ok(Object.isFrozen(VEDEKEZES) && Object.isFrozen(VEDEKEZES.sms) && Object.isFrozen(VEDEKEZES.sms[0]));
  assert.ok(Object.isFrozen(BEJELENTES) && Object.isFrozen(PENZ_VISSZA));
});

if (hiba) { console.log(`\n❌ csalas-vedekezes: ${hiba} hiba`); process.exit(1); }
console.log('\n✅ csalas-vedekezes: minden zöld');
