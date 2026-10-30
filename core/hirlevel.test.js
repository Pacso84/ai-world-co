// ✉️ Heti hírlevél (2026-10-30) — KIKAPCSOLVA vár: a user nem ad meg lakcímet (a levél aljára kötelező postacím kell),
// postafiókig nincs küldés és nincs feliratkozó doboz. Ingyenes, hálózat nélküli teszt.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hirlevelBeallitas, hirlevelTartalom, kuldendo, brevoKuldes, kitKuldes } from './hirlevel.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let hiba = 0;
const t = async (nev, fn) => { try { await fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };
const MD = `---\ntitle: "This Week in AI: The 5 Stories That Matter (October 25, 2026)"\n---\n# X\n\n> **In short:** Five things happened.\n\n## One\n\ntext\n\n## Two\n\n## Three\n\n## Four\n\n## Five\n\n## What this means for you\n`;
const HETI = { slug: 'this-week-in-ai-x', md: MD, cim: 'This Week in AI: The 5 Stories That Matter (October 25, 2026)', published_at: '2026-10-26T02:20:00Z' };

console.log('\n🧪 hirlevel');

await t('🔒 KIKAPCSOLVA: config nélkül, kulcs nélkül, hibás feladóval NINCS küldés; a config-ban nincs bekapcsolva', () => {
  const ok = { newsletter: { enabled: true, provider: 'brevo', list_id: 3, sender_email: 'news@aiworldhq.com' } };
  assert.equal(hirlevelBeallitas({ newsletter: { enabled: true } }, {}).be, false, 'Kit: kulcs nélkül nem küldhet');
  assert.equal(hirlevelBeallitas({ newsletter: { enabled: true } }, { KIT_API_KEY: 'k'.repeat(30) }).szolg, 'kit', 'alapból Kit');
  assert.equal(hirlevelBeallitas({ newsletter: { enabled: false } }, { KIT_API_KEY: 'k'.repeat(30) }).be, false);
  assert.equal(hirlevelBeallitas({}, { BREVO_API_KEY: 'x'.repeat(40) }).be, false);
  assert.equal(hirlevelBeallitas(ok, {}).be, false, 'kulcs nélkül nem küldhet');
  assert.equal(hirlevelBeallitas({ newsletter: { ...ok.newsletter, enabled: 'true' } }, { BREVO_API_KEY: 'x'.repeat(40) }).be, false);
  assert.equal(hirlevelBeallitas({ newsletter: { ...ok.newsletter, sender_email: 'rossz' } }, { BREVO_API_KEY: 'x'.repeat(40) }).be, false);
  assert.equal(hirlevelBeallitas(ok, { BREVO_API_KEY: 'x'.repeat(40) }).be, true);
  const cfg = JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf-8'));
  // 10-30 este BEKAPCSOLVA (user: „csináld meg”): Kit-fiók, KIT_API_KEY (GitHub + Worker), űrlap #10121836, dupla megerősítés élőben igazolva.
  // A szolgáltató KIT kell legyen: a Brevo-ághoz saját postacím kellene (a user lakcímet nem ad meg).
  if (cfg.newsletter?.enabled === true) assert.notEqual(cfg.newsletter.provider, 'brevo', 'a Brevo-ág saját postacímet kívánna');
});

await t('✉️ tartalom: 5 hír (a záró rész nélkül), jelölt link, MI-jelölés, leiratkozás; tárgy dátum nélkül', () => {
  const x = hirlevelTartalom(HETI, [{ slug: 'g1', cim: 'Guide <1>' }]);
  assert.equal(x.hirDb, 5);
  assert.equal(x.targy, 'This Week in AI: The 5 Stories That Matter');
  assert.match(x.html, /article\/this-week-in-ai-x\?src=nl/);
  assert.match(x.html, /written by AI/);
  assert.match(x.html, /\{\{ unsubscribe \}\}/);
  assert.match(x.html, /Guide &lt;1&gt;/, 'nincs HTML-escape');
  assert.doesNotMatch(x.html, /What this means for you/);
  assert.doesNotMatch(x.kitHtml, /\{\{ unsubscribe \}\}|<!doctype/i, 'a Kit saját sablont + leiratkozást ad — nálunk ne legyen dupla');
  assert.match(x.kitHtml, /written by AI/, 'a Kit-levélben is kell az MI-jelölés');
});

await t('📅 egy heti cikket csak egyszer; 3 napnál régebbit nem', () => {
  const cikkek = [HETI, { slug: 'g', guide: true, cim: 'G', published_at: '2026-10-25T10:00:00Z', md: '' }];
  assert.ok(kuldendo(cikkek, {}, '2026-10-26T12:00:00Z'));
  assert.equal(kuldendo(cikkek, { kuldve: { 'this-week-in-ai-x': {} } }, '2026-10-26T12:00:00Z'), null);
  assert.equal(kuldendo(cikkek, {}, '2026-10-31T12:00:00Z'), null);
});

await t('🌐 Brevo: vázlat a listára, majd sendNow; hibánál kivétel (nem csendes siker)', async () => {
  const hivasok = [];
  const ff = async (url, o) => { hivasok.push([url, o]); return { ok: true, json: async () => ({ id: 77 }), text: async () => '' }; };
  const b = { kulcs: 'k', lista: 3, felado: { name: 'AI World HQ', email: 'news@aiworldhq.com' } };
  assert.equal(await brevoKuldes(b, { targy: 'T', html: '<p>x</p>' }, { fetchFn: ff }), 77);
  assert.match(hivasok[0][0], /\/v3\/emailCampaigns$/);
  assert.deepEqual(JSON.parse(hivasok[0][1].body).recipients, { listIds: [3] });
  assert.match(hivasok[1][0], /\/v3\/emailCampaigns\/77\/sendNow$/);
  const rossz = async () => ({ ok: false, status: 401, text: async () => 'unauthorized' });
  await assert.rejects(brevoKuldes(b, { targy: 'T', html: '' }, { fetchFn: rossz }), /HTTP 401/);
});

await t('🌐 Kit: EGY hívás a broadcasts végpontra, azonnali send_at, nem nyilvános; hibánál kivétel', async () => {
  const hivasok = [];
  const ff = async (url, o) => { hivasok.push([url, o]); return { ok: true, json: async () => ({ broadcast: { id: 9 } }), text: async () => '' }; };
  const x = hirlevelTartalom(HETI);
  assert.equal(await kitKuldes({ kulcs: 'k' }, x, { fetchFn: ff, most: '2026-11-01T20:00:00Z' }), 9);
  assert.equal(hivasok.length, 1); assert.equal(hivasok[0][0], 'https://api.kit.com/v4/broadcasts');
  assert.equal(hivasok[0][1].headers['X-Kit-Api-Key'], 'k');
  const b = JSON.parse(hivasok[0][1].body);
  assert.equal(b.send_at, '2026-11-01T20:00:00Z'); assert.equal(b.public, false); assert.equal(b.content, x.kitHtml);
  await assert.rejects(kitKuldes({ kulcs: 'k' }, x, { fetchFn: async () => ({ ok: false, status: 422, text: async () => 'bad' }) }), /HTTP 422/);
});

await t('📬 doboz: CSAK enabled ÉS signup mellett, CSAK angol oldalon; kulcs nincs benne; 07-es tanulság őrizve', async () => {
  const { dobozBe, hirlevelDoboz, VEGPONT } = await import('./hirlevel-doboz.js');
  assert.equal(dobozBe({ newsletter: { enabled: false, signup: true } }), false, 'küldés nélkül NINCS doboz (07-27 tanulság)');
  assert.equal(dobozBe({ newsletter: { enabled: true, signup: false } }), false);
  assert.equal(dobozBe({ newsletter: { enabled: true, signup: true } }), true);
  assert.equal(hirlevelDoboz(true, 'hu'), '', 'angol levelet nem ígérünk magyar oldalon');
  assert.equal(hirlevelDoboz(false, 'en'), '');
  const h = hirlevelDoboz(true, 'en');
  assert.match(h, /class="nl__hp"/, 'nincs honeypot'); assert.ok(h.includes(VEGPONT));
  assert.doesNotMatch(h, /api\.kit\.com|X-Kit-Api-Key/, 'a Kit-kulcs/végpont nem kerülhet a böngészőbe');
  const cfg = JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf-8'));
  if (dobozBe(cfg)) assert.equal(cfg.newsletter.enabled, true, 'doboz csak bekapcsolt küldés mellett (07-27 tanulság)');
});

await t('🔌 bekötés: cikk + útmutató alja + főoldal; /privacy feltételes kártya; CI vasárnapi lépés; Worker /subscribe', () => {
  const b = readFileSync(join(ROOT, 'website', 'build.js'), 'utf-8');
  assert.equal((b.match(/\$\{hirlevelDoboz\(HIRLEVEL_DOBOZ, LANG\)\}/g) || []).length, 2, 'a hír és az útmutató alján');
  assert.match(b, /grid \+ hirlevelDoboz\(HIRLEVEL_DOBOZ, LANG\)/, 'főoldal');
  assert.match(b, /HIRLEVEL_DOBOZ = dobozBe\(rawConfig\)/);
  assert.match(b, /HIRLEVEL_DOBOZ \? kartya\('📬', 'privNlH', 'privNlP'\)/);
  assert.match(b, /kartya\('🚫', 'privNoH', HIRLEVEL_DOBOZ \? 'privNoPNl' : 'privNoP'\)/, 'bekapcsolt hírlevélnél a „nincs hírlevél” állítás hamis lenne');
  for (const k of ['privNlH', 'privNlP', 'privNoPNl']) assert.equal((b.match(new RegExp(k + ':', 'g')) || []).length, 3, k + ': nem mindhárom nyelven');
  const ci = readFileSync(join(ROOT, '.github', 'workflows', 'auto.yml'), 'utf-8');
  assert.match(ci, /KIT_API_KEY: \$\{\{ secrets\.KIT_API_KEY \}\}\s+run: node core\/hirlevel\.js --send \|\| true/);
  assert.ok(ci.indexOf('core/hirlevel.js --send') > ci.indexOf('core/indexnow.js'), 'a küldés a deploy UTÁN kell (élő linkek)');
  const w = readFileSync(join(ROOT, 'telegram-worker', 'src', 'worker.js'), 'utf-8');
  assert.match(w, /if \(path === '\/subscribe'\) return handleSubscribe\(request, env\);/);
});

if (hiba) { console.log(`\n❌ hirlevel.test: ${hiba} hiba`); process.exit(1); }
console.log('✅ hirlevel.test: mind rendben');
