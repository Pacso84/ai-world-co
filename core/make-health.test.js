// ===================================================================
// MAKE-EGÉSZSÉG — tesztek
// ===================================================================
import assert from 'assert/strict';
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

console.log('\n✅ make-health.test: mind a ' + pass + ' eset rendben');
