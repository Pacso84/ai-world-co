// ===================================================================
// MAKE-EGÉSZSÉG — tesztek
// ===================================================================
import assert from 'assert/strict';
import { readFileSync } from 'fs';
import { summarizeRuns, describeFailures } from './make-health.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };
const SINCE = '2026-08-05T00:00:00Z';

console.log('🧪 make-egészség\n');

t('a sikeres és bukott futásokat szétválasztja', () => {
  const r = summarizeRuns([
    { timestamp: '2026-08-05T10:00:00Z', status: 1 },
    { timestamp: '2026-08-05T10:01:00Z', status: 3 },
    { timestamp: '2026-08-05T10:02:00Z', status: 2 }
  ], SINCE);
  assert.equal(r.ok, 1);
  assert.equal(r.failed, 2, 'a status 2 (befejezetlen) IS bukás — ezen állt le ma a Pinterest');
});

t('az ablakon KÍVÜLI futásokat nem számolja', () => {
  const r = summarizeRuns([
    { timestamp: '2026-08-04T23:59:00Z', status: 3 },
    { timestamp: '2026-08-05T00:01:00Z', status: 3 }
  ], SINCE);
  assert.equal(r.failed, 1);
});

t('a "warning" naplóbejegyzés NEM futás (nem számol duplán)', () => {
  // A Make a bukás mellé külön warning sort is ír, status MEZŐ NÉLKÜL.
  const r = summarizeRuns([
    { timestamp: '2026-08-05T10:31:04Z', status: 3, error: { message: 'x' } },
    { timestamp: '2026-08-05T10:31:05Z', type: 'warning', detail: { reason: 'Scenario has encountered an error' } }
  ], SINCE);
  assert.equal(r.failed, 1, 'egy bukás, nem kettő');
});

t('a leggyakoribb hibaokot kiemeli', () => {
  const r = summarizeRuns([
    { timestamp: '2026-08-05T10:00:00Z', status: 3, error: { message: '[400] {"code":1,"message":"Sorry we could not fetch the image."}' } },
    { timestamp: '2026-08-05T10:01:00Z', status: 3, error: { message: '[400] {"code":1,"message":"Sorry we could not fetch the image."}' } },
    { timestamp: '2026-08-05T10:02:00Z', status: 3, error: { message: 'Something else' } }
  ], SINCE);
  assert.equal(r.failed, 3);
  assert.match(r.topReason, /fetch the image/);
});

t('üres napló nem borul fel', () => {
  const r = summarizeRuns([], SINCE);
  assert.deepEqual({ ok: r.ok, failed: r.failed }, { ok: 0, failed: 0 });
  assert.equal(r.topReason, '');
});

t('hiányzó időbélyeg nem számít bele', () => {
  const r = summarizeRuns([{ status: 3 }, { timestamp: '2026-08-05T10:00:00Z', status: 3 }], SINCE);
  assert.equal(r.failed, 1);
});

// ---------- a riport-sor ----------

t('hibátlan napról NINCS sor (ne zajongjon)', () => {
  assert.equal(describeFailures('PINTEREST', { ok: 12, failed: 0, topReason: '' }), null);
});

t('bukásnál tömör, cselekvésre alkalmas sor', () => {
  const line = describeFailures('PINTEREST', {
    ok: 3, failed: 8,
    topReason: '[400] {"code":1,"message":"Sorry we could not fetch the image."}'
  });
  assert.match(line, /PINTEREST/);
  assert.match(line, /8/);
  assert.ok(line.length < 200, 'a Telegram-riport rövid, ez is legyen az');
  assert.ok(!line.includes('{'), 'a nyers JSON-t ne öntsük a riportba');
});

t('a hibaüzenetből az OLVASHATÓ rész marad', () => {
  const line = describeFailures('PINTEREST', {
    ok: 0, failed: 2,
    topReason: '[400] {"code":1,"message":"Sorry we could not fetch the image."}'
  });
  assert.match(line, /Sorry we could not fetch the image/);
});

t('ismeretlen ok esetén is ad használható sort', () => {
  const line = describeFailures('FB-POSZTOLÓ', { ok: 1, failed: 1, topReason: '' });
  assert.match(line, /FB-POSZTOLÓ/);
  assert.match(line, /1/);
});

// 10-27: a Reelnél a 2-es (WARNING) kétértelmű — 10-26-án kint volt, az „újrajátszható” tanács dupla posztot okozott
t('a 2-es futás külön számolódik (warned), a 3-as nem', () => {
  const most = new Date().toISOString();
  const r = summarizeRuns([{ status: 1, timestamp: most }, { status: 2, timestamp: most }, { status: 3, timestamp: most }],
    new Date(Date.now() - 3600e3).toISOString());
  assert.deepEqual([r.ok, r.failed, r.warned], [1, 2, 1]);
});

t('bizonytalan forgatókönyv, csak figyelmeztetés → szelíd 🟡 sor, ellenőrzést kér, nem újraküldést', () => {
  const line = describeFailures('REEL-POSZTOLÓ', { ok: 2, failed: 1, warned: 1, topReason: '' }, { bizonytalan: true });
  assert.match(line, /^🟡 REEL-POSZTOLÓ: 1\/3 futás figyelmeztetéssel/);
  assert.match(line, /Business Suite/);
  assert.doesNotMatch(line, /ELBUKOTT|újrajátszható|elbukott|nem sikerült|leállt/);
});

t('bizonytalan forgatókönyv, valódi (3-as) bukással → marad a ⚠️ ELBUKOTT', () => {
  assert.match(describeFailures('REEL-POSZTOLÓ', { ok: 1, failed: 2, warned: 1, topReason: '' }, { bizonytalan: true }), /^⚠️ REEL-POSZTOLÓ: 2\/3 poszt ELBUKOTT/);
});

t('nem bizonytalan forgatókönyv (FB-link): a 2-es is ⚠️ ELBUKOTT, mint eddig', () => {
  assert.match(describeFailures('FB-POSZTOLÓ', { ok: 1, failed: 1, warned: 1, topReason: '' }), /^⚠️ FB-POSZTOLÓ: 1\/2 poszt ELBUKOTT/);
});

t('bekötés: a daily-report a Reel-forgatókönyvet bizonytalannak jelöli, és átadja', () => {
  const src = readFileSync(new URL('./daily-report.js', import.meta.url), 'utf-8');
  assert.match(src, /name: 'REEL-POSZTOLÓ'[^}]*bizonytalan: true/);
  assert.match(src, /describeFailures\(w\.name, summarizeRuns\(.*, since\), \{ bizonytalan: !!w\.bizonytalan \}\)/);
});

console.log('\n✅ make-health.test: mind a ' + pass + ' eset rendben');
