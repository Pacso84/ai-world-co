// ===================================================================
// VÉSZHÁLÓ-RIASZTÁS TESZT — futtatás: node core/emergency-alert.test.js
//
// MI A VÉDETT SZABÁLY: a napi dedup-kulcs (`memory/emergency-fallback-state.json`
// → `last_alert`) CSAK SIKERES KÜLDÉS UTÁN íródhat be.
//
// MIÉRT: 2026-08-30-ig fordított volt a sorrend — előbb ment a kulcs a
// lemezre, aztán indult a Telegram-küldés. A `sendMessage()` viszont SOHA
// nem dob: hiányzó tokenre `{ok:false, skipped:true}`, Telegram- és hálózati
// hibára `{ok:false}` jön vissza. A CI „Fordítás" lépésének NINCS
// TELEGRAM_BOT_TOKEN-je, a fordító viszont paid-only — vagyis pont ott, ahol
// a vészháló a legvalószínűbben megszólalna, a riasztás némán elveszett,
// a `last_alert` pedig beíródott ÉS visszacommitolódott (a fájl git-követett).
// Aznap a Pipeline-lépés (aminek VAN tokenje) sem szólt többé.
//
// Ugyanaz a hibaosztály, amit 2026-08-27-én a napi riportnál javítottunk,
// ezért ugyanazt a KÖZÖS szabályt hívjuk: `report-window.js → sikeresKuldes()`.
// Két helyre kimásolva előbb-utóbb szétcsúszna.
//
// A teszt SEM hálózatot, SEM lemezt nem érint: a küldő és a mentő is
// injektált (`send` / `mentes`).
// ===================================================================
import { strict as assert } from 'assert';
import { veszRiasztasKuldes, veszUzenet } from './ai-router.js';
import { sikeresKuldes } from './report-window.js';

const alap = { agentName: 'translator', provider: 'openrouter-free', model: 'free/x', today: '2026-08-30' };

/** Egy próbafutás: visszaadja, mit küldtünk és mit mentettünk. */
async function futtat(kuldesValasz, extra = {}) {
  const kuldott = [], mentett = [], naplo = [];
  const r = await veszRiasztasKuldes({
    ...alap, ...extra,
    send: async (szoveg) => {
      kuldott.push(szoveg);
      if (typeof kuldesValasz === 'function') return kuldesValasz();
      return kuldesValasz;
    },
    mentes: (allapot) => { if (extra.mentesDob) throw new Error('lemez tele'); mentett.push(allapot); },
    log: (s) => naplo.push(s)
  });
  return { r, kuldott, mentett, naplo };
}

// ── 1) A VALÓDI eset: nincs Telegram-token (CI „Fordítás" lépés) ───
// `sendMessage()` ilyenkor `{ok:false, skipped:true}`-t ad — NEM dob.
{
  const { r, kuldott, mentett, naplo } = await futtat({ ok: false, skipped: true });
  assert.equal(kuldott.length, 1, 'a küldést azért megpróbáltuk');
  assert.deepEqual(mentett, [], 'SIKERTELEN küldés után a dedup-kulcs NEM íródhat be');
  assert.equal(r.sent, false);
  assert.equal(r.saved, false);
  assert.ok(naplo.join(' ').includes('token'), 'a napló megmondja, MIÉRT nem ment ki');
}

// ── 2) Telegram-hiba és hálózati hiba: ugyanaz a döntés ────────────
{
  const { mentett, r } = await futtat({ ok: false, description: 'chat not found' });
  assert.deepEqual(mentett, [], 'Telegram-hiba után sem mentünk kulcsot');
  assert.equal(r.saved, false);
}
{
  // A `send` DOBÁSA sem szivároghat ki: a router futását semmi nem állíthatja meg.
  const { mentett, r } = await futtat(() => { throw new Error('ECONNRESET'); });
  assert.deepEqual(mentett, [], 'kivétel után sem mentünk kulcsot');
  assert.equal(r.sent, false, 'és nem hazudunk sikert');
}

// ── 3) SIKERES küldés: ilyenkor — és CSAK ilyenkor — megy a kulcs ──
{
  const { r, mentett } = await futtat({ ok: true });
  assert.equal(mentett.length, 1, 'sikeres küldés után pontosan egyszer mentünk');
  assert.equal(mentett[0].last_alert, '2026-08-30', 'a dedup-kulcs a MAI nap');
  assert.equal(mentett[0].agent, 'translator', 'a mentett állapot megőrzi, ki bukott el');
  assert.equal(mentett[0].provider, 'openrouter-free');
  assert.equal(mentett[0].model, 'free/x');
  assert.deepEqual(r, { sent: true, saved: true });
}

// ── 4) A KÖZÖS SZABÁLYT használjuk, nem sajátot ────────────────────
// `sikeresKuldes()` szigorú: csak `ok === true`. Egy „igazságos", de nem
// `true` érték (pl. `ok: 'igen'`, vagy hiányzó válasz) NEM siker.
assert.equal(sikeresKuldes({ ok: 'igen' }), false, 'a közös szabály szigorú');
{
  const { mentett } = await futtat({ ok: 'igen' });
  assert.deepEqual(mentett, [], 'a router is a szigorú szabályt követi');
}
{
  const { mentett } = await futtat(undefined);
  assert.deepEqual(mentett, [], 'üres válasz sem siker');
}

// ── 5) A MENTÉS bukása nem tünteti el a riasztást ──────────────────
// Kiment az üzenet — ezt nem tagadjuk le —, de a hibát látni kell, mert
// ilyenkor a következő futás MÉGEGYSZER szólhat.
{
  const { r, naplo } = await futtat({ ok: true }, { mentesDob: true });
  assert.deepEqual(r, { sent: true, saved: false });
  assert.ok(naplo.join(' ').includes('lemez tele'), 'a mentési hiba okát kiírjuk');
}

// ── 6) AZ ÜZENET SZÖVEGE ───────────────────────────────────────────
// 2026-07-22 óta nem a Google/Gemini feltöltésére küld (az a szolgáltató
// azóta nincs is) — a TÉNYLEGES helyzetet mondja, OpenRouterrel.
{
  const uz = veszUzenet('translator', 'openrouter-free', 'free/x');
  assert.ok(uz.includes('translator'), 'megnevezi az agentet');
  assert.ok(uz.includes('openrouter-free/free/x'), 'megnevezi a provider/modellt');
  assert.ok(/openrouter\.ai/i.test(uz), 'oda irányít, ahol a user tenni tud róla');
  assert.ok(!/gemini|google/i.test(uz), 'nem a kivezetett szolgáltatóra mutat');
}

console.log('✅ emergency-alert.test: minden átment');
