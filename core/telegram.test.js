// ===================================================================
// TESZT — Telegram-küldés és a beszélgetés-napló
// ===================================================================
// INGYENES, hálózat nélküli (a `fetch` becsomagolva). Fut: node core/run-tests.js
//
// MIÉRT VAN EZ A FÁJL (2026-08-27): a `memory/chat-history.json`-ba olyan
// bot-üzenet is bekerült, ami SOSEM MENT KI — a naplózás a token-ellenőrzés
// ELŐTT futott. Ebből a napló ELŐZMÉNYT ír, amit a Főnök visszaolvas a
// promptjába (agents/ceo/instruct.js:214), vagyis a cég azt hihette, hogy
// válaszolt valamire, amit a user sosem látott.
//
// ⚠️ A NAPLÓ-FÁJL VALÓDI ÉS GIT-KÖVETETT. A teszt lementi az elejét és
// `finally`-ben visszaállítja — enélkül minden `npm test` beleírna.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { sendMessage, loadChatHistory } from './telegram.js';

const HIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'memory', 'chat-history.json');
const EREDETI_FAJL = existsSync(HIST) ? readFileSync(HIST, 'utf-8') : null;
const EREDETI_FETCH = globalThis.fetch;
const EREDETI_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const EREDETI_CHAT = process.env.TELEGRAM_OWNER_CHAT_ID;

let pass = 0;
const t = async (name, fn) => { await fn(); pass++; console.log('  ✅ ' + name); };

// ⚠️ A HOSSZ NEM JÓ MÉRCE: a napló HISTORY_MAX = 40 bejegyzésnél vág
// (`h.slice(-40)`), tehát telített naplónál egy új üzenet NEM növeli a
// darabszámot, csak kitolja a legrégebbit. Az első teszt-változatom emiatt
// bukott el egy helyes javításra — a mércét a mérendő dologhoz kell szabni.
/** A napló utolsó bejegyzése összehasonlítható alakban. */
const naploUtolso = () => JSON.stringify(loadChatHistory().at(-1) ?? null);
/** Hány bejegyzés van a naplóban PONTOSAN ezzel a szöveggel? */
const naploDarab = (szoveg) => loadChatHistory().filter(e => e.text === szoveg).length;

/** A Telegram API válaszait adja vissza sorban; rögzíti a hívásokat. */
function mockFetch(...valaszok) {
  const hivasok = [];
  globalThis.fetch = async (url, opts) => {
    hivasok.push({ url: String(url), body: opts?.body });
    const v = valaszok[Math.min(hivasok.length - 1, valaszok.length - 1)];
    if (v instanceof Error) throw v;
    return { ok: true, json: async () => v };
  };
  globalThis.fetch.hivasok = hivasok;
  return globalThis.fetch;
}

console.log('🧪 Telegram — küldés és napló\n');

try {
  await t('nincs token → NEM naplóz (ez volt a hiba)', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_OWNER_CHAT_ID;
    const elotte = naploUtolso();
    const r = await sendMessage('helyi futás, ez sosem megy ki');
    assert.equal(r.ok, false);
    assert.equal(r.skipped, true);
    assert.equal(naploUtolso(), elotte, 'ki nem ment üzenetet naplózott');
  });

  process.env.TELEGRAM_BOT_TOKEN = 'teszt-token';
  process.env.TELEGRAM_OWNER_CHAT_ID = '42';

  await t('a Telegram hibája (mindkét próbán) → NEM naplóz', async () => {
    // A `sendMessage` Markdown-hiba esetén formázás nélkül újrapróbál.
    mockFetch({ ok: false, description: 'Bad Request' });
    const elotte = naploUtolso();
    const r = await sendMessage('ezt a Telegram elutasítja');
    assert.equal(r.ok, false);
    assert.equal(naploUtolso(), elotte, 'sikertelen küldést naplózott');
    assert.equal(globalThis.fetch.hivasok.length, 2, 'nem próbálta újra formázás nélkül');
  });

  await t('hálózati hiba → NEM naplóz, és NEM dob', async () => {
    mockFetch(new Error('halott hálózat'));
    const elotte = naploUtolso();
    const r = await sendMessage('ez elhasal');
    assert.equal(r.ok, false);
    assert.ok(r.error.includes('halott'), r.error);
    assert.equal(naploUtolso(), elotte);
  });

  await t('SIKERES küldés → naplóz, pontosan egyszer', async () => {
    mockFetch({ ok: true, result: { message_id: 1 } });
    const r = await sendMessage('ez tényleg kimegy');
    assert.equal(r.ok, true);
    const utolso = loadChatHistory().at(-1);
    assert.equal(utolso.from, 'bot');
    assert.equal(utolso.text, 'ez tényleg kimegy');
  });

  await t('a MÁSODIK próbán sikerül → egyszer naplóz, nem kétszer', async () => {
    // Markdown-hiba → formázás nélküli újrapróba → siker. A naiv javítás
    // (naplózás mindkét ágon) itt duplán írna.
    mockFetch({ ok: false, description: "can't parse entities" }, { ok: true, result: { message_id: 2 } });
    const r = await sendMessage('*rossz markdown');
    assert.equal(r.ok, true);
    assert.equal(naploDarab('*rossz markdown'), 1, 'duplán naplózott');
  });

  console.log(`\n✅ ${pass} teszt rendben`);
} finally {
  // A napló-fájl és a környezet VISSZAÁLL — a teszt nem hagy nyomot.
  globalThis.fetch = EREDETI_FETCH;
  if (EREDETI_TOKEN === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
  else process.env.TELEGRAM_BOT_TOKEN = EREDETI_TOKEN;
  if (EREDETI_CHAT === undefined) delete process.env.TELEGRAM_OWNER_CHAT_ID;
  else process.env.TELEGRAM_OWNER_CHAT_ID = EREDETI_CHAT;
  if (EREDETI_FAJL !== null) writeFileSync(HIST, EREDETI_FAJL, 'utf-8');
}
