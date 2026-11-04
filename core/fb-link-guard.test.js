// FB-linkkorlát-őr (2026-10-19, kutatás: „Látogatószerzés a mostani oldalra").
// A forgalom ~82%-a a Facebookról jön; a Meta havi 2 linkes korlátja (Mari Smith
// 09-29: a kommentlink is számít) egyik napról a másikra elviheti. Az őr naponta
// rögzíti a Facebookról jött látogatókat és a kiment posztokat, és Telegramon
// szól, ha két egymást követő napon a megszokott szint fele alá esik.
// Ingyenes, hálózat nélküli — a fő folyamat (main) itt NEM fut.
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { fbHost, threadsHost, threadsRiportSor, posztokNapra, median, dontes, osszevon, riportSor, MIN_ALAP, ALAP_NAP } from './fb-link-guard.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };
const nap = (i) => new Date(Date.UTC(2026, 9, 1) + i * 864e5).toISOString().slice(0, 10);
/** n napos sor: fb látogató naponta (tömb), posztok naponta (alap 6). */
const sor = (fbk, poszt = 6) => Object.fromEntries(fbk.map((fb, i) => [nap(i), { fb, posztok: Array.isArray(poszt) ? poszt[i] : poszt }]));

console.log('\n🧪 fb-link-guard');

t('🔎 a Facebook minden hivatkozó-címe Facebooknak számít, más nem', () => {
  for (const h of ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'l.facebook.com', 'lm.facebook.com', 'web.facebook.com', 'FB.ME', 'fb.com'])
    assert.equal(fbHost(h), true, h);
  for (const h of ['notfacebook.com', 'facebook.com.evil.io', 'threads.com', 'instagram.com', '', null])
    assert.equal(fbHost(h), false, String(h));
});

t('📮 a napi posztszám: a Facebookra kiment link-posztok + Reelek az adott UTC-napon', () => {
  const cikkek = [
    { social_at: '2026-10-18T02:40:00Z' }, { social_at: '2026-10-18T14:26:00Z', reel_at: '2026-10-18T20:31:00Z' },
    { social_at: '2026-10-17T23:59:59Z' }, { reel_at: '2026-10-18T04:27:00Z' }, {}
  ];
  assert.equal(posztokNapra(cikkek, '2026-10-18'), 4);
  assert.equal(posztokNapra(cikkek, '2026-10-17'), 1);
  assert.equal(posztokNapra(null, '2026-10-18'), 0);
});

t('📐 medián: páros/páratlan, üresen null', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), null);
});

t('😴 nyugalom: rendes ingadozásnál NEM riaszt', () => {
  const d = dontes(sor([60, 70, 55, 80, 65, 72, 58, 61, 77, 69, 63, 70, 66, 71, 59, 64]));
  assert.equal(d.riaszt, false, d.ok);
  assert.ok(d.alap > 50);
});

t('🚨 két egymást követő napon a szint fele alá → RIASZT, és megmondja a számokat', () => {
  const d = dontes(sor([60, 70, 55, 80, 65, 72, 58, 61, 77, 69, 63, 70, 66, 71, 12, 9]));
  assert.equal(d.riaszt, true, d.ok);
  assert.match(d.uzenet, /12/); assert.match(d.uzenet, /9/);
  assert.match(d.uzenet, /linkkorlát/i, 'nem nevezi meg a gyanút');
});

t('🙂 EGY rossz nap még nem riasztás (zaj ellen kell a 2 nap)', () => {
  const d = dontes(sor([60, 70, 55, 80, 65, 72, 58, 61, 77, 69, 63, 70, 66, 71, 64, 9]));
  assert.equal(d.riaszt, false);
});

t('🧭 ha a posztok sem mentek ki, az üzenet a POSZTOLÁST gyanúsítja, nem a korlátot', () => {
  const d = dontes(sor([60, 70, 55, 80, 65, 72, 58, 61, 77, 69, 63, 70, 66, 71, 10, 8], [6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 0, 0]));
  assert.equal(d.riaszt, true);
  assert.match(d.uzenet, /nem mentek ki/i);
});

t('📏 kevés adatnál (rövid alap vagy túl kicsi forgalom) hallgat, és megmondja miért', () => {
  assert.equal(dontes(sor([60, 70, 10, 8])).riaszt, false, 'rövid alapból riasztott');
  assert.match(dontes(sor([60, 70, 10, 8])).ok, /kevés/i);
  assert.equal(dontes(sor([3, 2, 4, 3, 2, 3, 4, 2, 3, 3, 2, 4, 3, 2, 0, 0])).riaszt, false, 'apró forgalomnál zajra riasztott');
  assert.equal(dontes({}).riaszt, false);
  assert.ok(ALAP_NAP >= 7 && MIN_ALAP >= 10);
});

t('🔁 egy esetre EGYSZER szól: ha 3 napon belül már riasztott, nem ismétli; helyreállásnál egyszer jelez', () => {
  const rossz = sor([60, 70, 55, 80, 65, 72, 58, 61, 77, 69, 63, 70, 66, 71, 12, 9]);
  const utolso = Object.keys(rossz).sort().at(-1);
  assert.equal(dontes(rossz, { riasztva: utolso }).kuld, false, 'ugyanarra kétszer szólt');
  assert.equal(dontes(rossz, {}).kuld, true);
  const jo = sor([60, 70, 55, 80, 65, 72, 58, 61, 77, 69, 63, 70, 66, 71, 64, 66]);
  const h = dontes(jo, { riasztva: nap(14) });
  assert.equal(h.helyreallt, true); assert.equal(h.kuld, true); assert.match(h.uzenet, /helyre/i);
});

t('🗃️ összevonás: az új napok felülírják a régit, 60 napnál régebbi kiesik', () => {
  const regi = { '2026-07-01': { fb: 1, posztok: 1 }, '2026-10-17': { fb: 5, posztok: 6 } };
  const u = osszevon(regi, { '2026-10-17': { fb: 50, posztok: 6 }, '2026-10-18': { fb: 40, posztok: 5 } }, '2026-10-19');
  assert.deepEqual(Object.keys(u).sort(), ['2026-10-17', '2026-10-18']);
  assert.equal(u['2026-10-17'].fb, 50);
});

t('🔌 a CI futtatja, a Telegram- és Cloudflare-kulccsal, és a fő folyamat csak közvetlen futtatáskor indul', () => {
  const yml = readFileSync(join(ROOT, '.github', 'workflows', 'auto.yml'), 'utf-8');
  const i = yml.indexOf('node core/fb-link-guard.js');
  assert.ok(i > 0, 'nincs CI-lépés');
  const lepes = yml.slice(yml.lastIndexOf('- name:', i), i);
  for (const k of ['CF_ANALYTICS_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_OWNER_CHAT_ID']) assert.ok(lepes.includes(k), 'hiányzik: ' + k);
  assert.ok(/if: always\(\)/.test(lepes), 'egy korábbi hiba elnémítaná az őrt');
  const src = readFileSync(join(ROOT, 'core', 'fb-link-guard.js'), 'utf-8');
  assert.match(src, /process\.argv\[1\] && process\.argv\[1\]\.endsWith\('fb-link-guard\.js'\)/);
  assert.match(src, /requestPath_notlike: "\/hu\/%"/, 'a tulaj magyar böngészése belekeveredne');
});

t('📨 napi riport-sor: riasztásnál ⚠️-vel kezdődik (a zajszűrő átengedi), rendben egy rövid számsor, adat nélkül hallgat', () => {
  const napok = { '2026-10-17': { fb: 31, posztok: 8 }, '2026-10-18': { fb: 44, posztok: 8 } };
  assert.match(riportSor({ riasztva: '2026-10-18', napok, alap: 36 }), /^⚠️ .*Facebook/);
  const s = riportSor({ napok, alap: 36 });
  assert.match(s, /44/); assert.match(s, /36/); assert.ok(!s.startsWith('⚠️'));
  assert.equal(riportSor({}), '');
  assert.equal(riportSor(null), '');
});

t('🧵 Threads: a hivatkozó felismerése és a napi riport-sor (user 10-22)', () => {
  for (const h of ['threads.net', 'www.threads.net', 'l.threads.net', 'threads.com', 'l.threads.com']) assert.equal(threadsHost(h), true, h);
  for (const h of ['facebook.com', 'nothreads.net', 'threads.org', '']) assert.equal(threadsHost(h), false, h);
  assert.equal(threadsRiportSor({ napok: { '2026-10-20': { fb: 38 } } }), '', 'régi napokon nincs Threads-adat → nincs sor');
  const napok = { '2026-10-20': { fb: 1 }, '2026-10-21': { fb: 2, th: 3 }, '2026-10-22': { fb: 4, th: 5 } };
  assert.equal(threadsRiportSor({ napok }), '🧵 Threadsről tegnap: 5 látogató (utolsó 2 nap: 8)');
  const src = readFileSync(new URL('./daily-report.js', import.meta.url), 'utf-8');
  // 10-28 (user: „duplán jön … a Threadsnél”): a hivatkozó-alapú sor KIVÉVE a riportból (0-t mutatott, miközben a
  // jelölt linkes 10-et) — csak a pontos, jelölt linkes Threads-sor marad
  assert.doesNotMatch(src, /threadsRiportSor\(fbg\)/, 'a pontatlan, dupla Threads-sor visszakerült');
  assert.match(src, /Threads-linkről tegnap/, 'a pontos (jelölt linkes) Threads-sor eltűnt');
});

if (hiba) { console.log(`\n❌ fb-link-guard.test: ${hiba} hiba`); process.exit(1); }
console.log('✅ fb-link-guard.test: mind rendben');
