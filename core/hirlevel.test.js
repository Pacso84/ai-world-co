// ✉️ Heti hírlevél (2026-10-30) — KIKAPCSOLVA vár: a user nem ad meg lakcímet (a levél aljára kötelező postacím kell),
// postafiókig nincs küldés és nincs feliratkozó doboz. Ingyenes, hálózat nélküli teszt.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hirlevelBeallitas, hirlevelTartalom, kuldendo, brevoKuldes } from './hirlevel.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let hiba = 0;
const t = async (nev, fn) => { try { await fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };
const MD = `---\ntitle: "This Week in AI: The 5 Stories That Matter (October 25, 2026)"\n---\n# X\n\n> **In short:** Five things happened.\n\n## One\n\ntext\n\n## Two\n\n## Three\n\n## Four\n\n## Five\n\n## What this means for you\n`;
const HETI = { slug: 'this-week-in-ai-x', md: MD, cim: 'This Week in AI: The 5 Stories That Matter (October 25, 2026)', published_at: '2026-10-26T02:20:00Z' };

console.log('\n🧪 hirlevel');

await t('🔒 KIKAPCSOLVA: config nélkül, kulcs nélkül, hibás feladóval NINCS küldés; a config-ban nincs bekapcsolva', () => {
  const ok = { newsletter: { enabled: true, list_id: 3, sender_email: 'news@aiworldhq.com' } };
  assert.equal(hirlevelBeallitas({}, { BREVO_API_KEY: 'x'.repeat(40) }).be, false);
  assert.equal(hirlevelBeallitas(ok, {}).be, false, 'kulcs nélkül nem küldhet');
  assert.equal(hirlevelBeallitas({ newsletter: { ...ok.newsletter, enabled: 'true' } }, { BREVO_API_KEY: 'x'.repeat(40) }).be, false);
  assert.equal(hirlevelBeallitas({ newsletter: { ...ok.newsletter, sender_email: 'rossz' } }, { BREVO_API_KEY: 'x'.repeat(40) }).be, false);
  assert.equal(hirlevelBeallitas(ok, { BREVO_API_KEY: 'x'.repeat(40) }).be, true);
  const cfg = JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf-8'));
  assert.notEqual(cfg.newsletter?.enabled, true, 'postafiók (a levél aljára kötelező cím) nélkül NEM kapcsolható be');
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

if (hiba) { console.log(`\n❌ hirlevel.test: ${hiba} hiba`); process.exit(1); }
console.log('✅ hirlevel.test: mind rendben');
