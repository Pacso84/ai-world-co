// ===================================================================
// CSATORNA NAPI PLAFON — tesztek
// ===================================================================
//
// ELŐZMÉNY (2026-08-24). Az Instagram NAPI 6 posztot kapott (`--limit 2` ×
// napi 3 CI-futás), miközben 11 nap alatt 0 látogatót hozott — a Facebook
// ugyanennyi idő alatt 435-öt. A magas ütem gépi mintázatot rajzol, és
// cserébe nem hozott olvasót.
//
// A user döntése: napi 6 → napi 1, a csatorna megmarad.
//
// ⚠️ A `--limit` FUTÁSONKÉNT számol, ezért napi plafonnak alkalmatlan:
// `--limit 1` × 3 futás = napi 3, nem napi 1. Ezért kell ez a modul.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { allowedNow, countSentToday, capFor } from './channel-cap.js';

let pass = 0;
const t = (n, f) => { f(); pass++; console.log('  ✅ ' + n); };
console.log('🧪 csatorna napi plafon\n');

// ── a maradék kiszámítása ───────────────────────────────────────────

t('plafon nélkül a futás-limit érvényes — más csatornát nem fojtunk meg', () => {
  // FONTOS: a Threads és a később bekötendő X NEM kap plafont. Ha a hiányzó
  // beállítás 0-t adna, egy elgépelés némán elnémítaná az összes csatornát.
  assert.equal(allowedNow({ sentToday: 0, dailyCap: null, runLimit: 2 }), 2);
  assert.equal(allowedNow({ sentToday: 99, dailyCap: undefined, runLimit: 2 }), 2);
});

t('a plafon a szűkebb: napi 1-ből a futás-limit 2 is csak 1-et enged', () => {
  assert.equal(allowedNow({ sentToday: 0, dailyCap: 1, runLimit: 2 }), 1);
});

t('ha ma már kiment a napi adag, ebben a körben 0 megy', () => {
  assert.equal(allowedNow({ sentToday: 1, dailyCap: 1, runLimit: 2 }), 0);
});

t('a maradék pontosan a különbség', () => {
  assert.equal(allowedNow({ sentToday: 1, dailyCap: 4, runLimit: 9 }), 3);
  assert.equal(allowedNow({ sentToday: 3, dailyCap: 4, runLimit: 1 }), 1, 'a futás-limit is korlátoz');
});

t('túllépés esetén sem megy negatívba', () => {
  assert.equal(allowedNow({ sentToday: 7, dailyCap: 1, runLimit: 2 }), 0);
});

// ── AZ IRÁNY ────────────────────────────────────────────────────────
//
// „Minden mérce IRÁNYA számít" (2026-08-14, prompt-szivárgás). Ha nem tudjuk,
// hány poszt ment ma ki, két rossz irány közül kell választani:
//   fel-nyitás  → átléphetjük a plafont, épp azt, amiért a modul készült
//   be-zárás    → kimarad egy nap Instagram, ami 11 nap alatt 0 látogatót hozott
// A veszteség nem szimmetrikus, ezért ZÁRUNK.

t('🔒 ismeretlen napi darabszám + plafon → 0 (inkább kimarad, mint túllépjen)', () => {
  for (const x of [null, undefined, NaN, 'kettő', -1]) {
    assert.equal(allowedNow({ sentToday: x, dailyCap: 1, runLimit: 2 }), 0,
      'sentToday=' + JSON.stringify(x));
  }
});

t('🔓 ismeretlen darabszám plafon NÉLKÜL viszont nem fojt', () => {
  // Plafon nélküli csatornánál a darabszámot le sem kérdezzük — ne fogja meg.
  assert.equal(allowedNow({ sentToday: null, dailyCap: null, runLimit: 2 }), 2);
});

t('értelmetlen futás-limitre 0, nem szemét', () => {
  assert.equal(allowedNow({ sentToday: 0, dailyCap: 5, runLimit: 0 }), 0);
  assert.equal(allowedNow({ sentToday: 0, dailyCap: 5, runLimit: -3 }), 0);
});

// ── a mai darabszám a BUFFER válaszából ─────────────────────────────
//
// A számot NEM a saját jelölésünkből vesszük. Ugyanez a lecke 2026-08-06-ról:
// a napi riport „Facebook-poszt: N" sora a saját jelölésünkből jött és
// torzított — azóta a Make naplójából megy. A láncot a VÉGÉRŐL mérd.

const MOST = Date.parse('2026-08-24T19:00:00Z');

t('csak a MAI (UTC) kiküldött posztokat számolja', () => {
  const posts = [
    { status: 'sent', sentAt: '2026-08-24T00:30:00Z' },
    { status: 'sent', sentAt: '2026-08-24T16:10:00Z' },
    { status: 'sent', sentAt: '2026-08-23T23:59:00Z' },   // tegnap
    { status: 'sent', sentAt: '2026-08-25T00:01:00Z' }    // holnap
  ];
  assert.equal(countSentToday(posts, MOST), 2);
});

t('a nem kiküldött poszt nem számít bele', () => {
  const posts = [
    { status: 'sent', sentAt: '2026-08-24T08:00:00Z' },
    { status: 'draft', sentAt: '2026-08-24T09:00:00Z' },
    { status: 'error', sentAt: '2026-08-24T10:00:00Z' },
    { status: 'sent', sentAt: null }
  ];
  assert.equal(countSentToday(posts, MOST), 1);
});

t('üres/hibás bemenetre null — NEM nulla', () => {
  // A különbség létfontosságú: a 0 azt jelenti „ma még nem ment ki semmi"
  // (mehet a poszt), a null azt, hogy „nem tudom" (ne menjen). Ha a lekérdezés
  // elhasal és 0-t adnánk vissza, a plafon némán kikapcsolna.
  assert.equal(countSentToday(null, MOST), null);
  assert.equal(countSentToday(undefined, MOST), null);
  assert.equal(countSentToday('hopp', MOST), null);
  assert.equal(countSentToday([], MOST), 0, 'az ÜRES lista viszont valódi nulla');
});

// ── a beállítás olvasása ────────────────────────────────────────────
//
// „A config `enabled` mezője nem kapcsol ki semmit" (2026-08-19): egy mező
// PUSZTA LÉTE nem bizonyíték, hogy bárki olvassa. Ezért van rá teszt.

t('a plafont a beállításból veszi, csatornanév szerint', () => {
  const cfg = { limits: { social_daily_caps: { instagram: 1 } } };
  assert.equal(capFor(cfg, 'instagram'), 1);
  assert.equal(capFor(cfg, 'threads'), null, 'akinek nincs bejegyzése, annak nincs plafonja');
});

t('hiányzó beállításra nincs plafon, nem borulás', () => {
  assert.equal(capFor({}, 'instagram'), null);
  assert.equal(capFor(null, 'instagram'), null);
  assert.equal(capFor({ limits: {} }, 'instagram'), null);
});

t('a 0 VALÓDI plafon — a csatorna teljes elnémítása', () => {
  // Ez a leállítás módja, ha a user később mégis a kivezetést választja:
  // nem kell kódot írni, elég a beállításban 0-t adni.
  const cfg = { limits: { social_daily_caps: { instagram: 0 } } };
  assert.equal(capFor(cfg, 'instagram'), 0);
  assert.equal(allowedNow({ sentToday: 0, dailyCap: 0, runLimit: 2 }), 0);
});

t('értelmetlen plafon-érték = nincs plafon, nem néma nulla', () => {
  for (const rossz of ['egy', -2, NaN, {}]) {
    const cfg = { limits: { social_daily_caps: { instagram: rossz } } };
    assert.equal(capFor(cfg, 'instagram'), null, JSON.stringify(rossz));
  }
});

// ── és a valódi beállítás? ──────────────────────────────────────────

// ⚠️ EZ A TESZT SZINKRON, ÉS EZ SZÁNDÉKOS. Először `async`-ként írtam meg, és
// a futtató kiírta a „mind a 16 rendben"-t, MIELŐTT a bukott állítás felszínre
// jött — a hiba a záró ✅ sor UTÁN jelent meg. Ugyanez a csapda 2026-08-23-án
// már megfogott 7 tesztet egy másik fájlban. Szinkron olvasás = a bukás ott
// van, ahol keresed.
t('📌 az ÉLES config.json tényleg napi 1-re fogja az Instagramot', () => {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
  const eles = JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf-8'));
  assert.equal(capFor(eles, 'instagram'), 1,
    'a 2026-08-24-i user-döntés: napi 6 → napi 1');
});

console.log('\n✅ channel-cap.test: mind a ' + pass + ' eset rendben');
