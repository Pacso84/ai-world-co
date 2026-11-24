// Csalás-figyelő alapmodul (2026-11-23, terv: docs/superpowers/plans/2026-11-21-csalas-figyelo.md 1. rész):
// kézi kapcsoló, napi +1 csalás-hely, 7 napos frissesség, csalás-forrás jelölés, szűrő-prompt és
// a szűrő válaszának értelmezése. Ingyenes, hálózat nélküli.
import assert from 'node:assert/strict';
import {
  CSALAS_FIGYELO_BE, CSALAS_EXTRA_NAPI, CSALAS_MAX_KOR_NAP, CSATORNAK,
  csalasForras, csalasFriss, csalasExtraMaradek, csalasHir, csalasExtraHir,
  CSALAS_SZURO_RENDSZER, csalasSzuroPrompt, csalasDontesek,
  CSALAS_FORRASOK, csalasSzetosztas, csalasVazlatMeta, csalasGuardFrissit, csalasSzetvalaszt,
} from './csalas-figyelo.js';
import { readFileSync } from 'node:fs';

let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };
console.log('\n🧪 csalas-figyelo (alapmodul, kikapcsolva)');

const NAP = 24 * 3600 * 1000;
const MOST = Date.parse('2026-11-23T12:00:00Z');

t('🔌 a kapcsoló KI van kapcsolva (élesítésig — az élesítő rész írja át true-ra)', () => {
  assert.equal(CSALAS_FIGYELO_BE, false);
});

t('🔢 állandók: napi 1 hely, 7 nap, 6 csatorna', () => {
  assert.equal(CSALAS_EXTRA_NAPI, 1);
  assert.equal(CSALAS_MAX_KOR_NAP, 7);
  assert.deepEqual(CSATORNAK, ['sms', 'email', 'chat', 'call', 'social', 'web']);
});

t('🛑 kikapcsolva 0 csalás-hely marad (akkor is, ha ma még nem volt csalás-hír)', () => {
  assert.equal(csalasExtraMaradek(0), 0);
  assert.equal(csalasExtraMaradek(1), 0);
});

t('📅 frissesség: 6 napos igen, 8 napos nem', () => {
  assert.equal(csalasFriss({ pubDate: new Date(MOST - 6 * NAP).toUTCString() }, MOST), true);
  assert.equal(csalasFriss({ pubDate: new Date(MOST - 8 * NAP).toUTCString() }, MOST), false);
});

t('📅 isoDate is elfogadott; hiányzó vagy hibás dátum → nem friss', () => {
  assert.equal(csalasFriss({ isoDate: new Date(MOST - 2 * NAP).toISOString() }, MOST), true);
  assert.equal(csalasFriss({}, MOST), false);
  assert.equal(csalasFriss({ pubDate: 'nem dátum' }, MOST), false);
  assert.equal(csalasFriss(null, MOST), false);
});

t('📅 jövőbeli (hibás órájú) dátum nem számít „7 napon belülinek” végtelenül — de 1 napos csúszás még friss', () => {
  assert.equal(csalasFriss({ pubDate: new Date(MOST + 0.5 * NAP).toUTCString() }, MOST), true);
  assert.equal(csalasFriss({ pubDate: new Date(MOST + 30 * NAP).toUTCString() }, MOST), false);
});

t('🏷️ csalás-forrás csak a `csalas: true` jelölésű', () => {
  assert.equal(csalasForras({ csalas: true }), true);
  assert.equal(csalasForras({}), false);
  assert.equal(csalasForras({ csalas: 'true' }), false);
  assert.equal(csalasForras(undefined), false);
});

t('🏷️ csalasHir / csalasExtraHir a _meta jelöléséből', () => {
  assert.equal(csalasHir({ csalas: true }), true);
  assert.equal(csalasHir({}), false);
  assert.equal(csalasHir(undefined), false);
  assert.equal(csalasExtraHir({ csalas_extra: '2026-11-23' }), true);
  assert.equal(csalasExtraHir({ csalas: true }), false);
});

t('🧾 szűrő-prompt: sorszámozott cím + kivonat', () => {
  const p = csalasSzuroPrompt([{ title: 'A', snippet: 'b' }, { title: 'C', snippet: '' }]);
  assert.ok(p.includes('[0] Title: A'), p);
  assert.ok(p.includes('b'));
  assert.ok(p.includes('[1] Title: C'));
});

t('🧾 rendszer-prompt kimondja a határokat és a válaszformát', () => {
  for (const szo of ['vulnerab', 'product feature', 'decisions', 'sms|email|chat|call|social|web']) {
    assert.ok(CSALAS_SZURO_RENDSZER.toLowerCase().includes(szo.toLowerCase()), 'hiányzik: ' + szo);
  }
});

t('🧩 döntések: {"decisions":[…]} boríték', () => {
  const d = csalasDontesek('{"decisions":[{"index":0,"csalas":true,"csatorna":"sms","ok":"x"},{"index":1,"csalas":false,"csatorna":null,"ok":"y"}]}', 2);
  assert.equal(d.length, 2);
  assert.deepEqual(d[0], { index: 0, csalas: true, csatorna: 'sms', ok: 'x' });
  assert.deepEqual(d[1], { index: 1, csalas: false, csatorna: null, ok: 'y' });
});

t('🧩 döntések: csupasz tömb és kódblokkba csomagolt válasz is jó', () => {
  assert.equal(csalasDontesek('[{"index":0,"csalas":true,"csatorna":"call","ok":"z"}]', 1)[0].csatorna, 'call');
  assert.equal(csalasDontesek('```json\n{"decisions":[{"index":0,"csalas":true,"csatorna":"email","ok":"z"}]}\n```', 1)[0].csatorna, 'email');
});

t('🧩 ismeretlen csatorna → null; „true” szöveg nem igaz; tartományon kívüli index kimarad', () => {
  const d = csalasDontesek('{"decisions":[{"index":0,"csalas":true,"csatorna":"fax","ok":"x"},{"index":1,"csalas":"true","csatorna":"sms"},{"index":5,"csalas":true,"csatorna":"sms"}]}', 2);
  assert.equal(d.length, 2);
  assert.equal(d[0].csatorna, null);
  assert.equal(d[1].csalas, false);
  assert.equal(d[1].ok, '');
});

t('🧩 hibás JSON → null', () => {
  assert.equal(csalasDontesek('nem json', 1), null);
  assert.equal(csalasDontesek('', 1), null);
  assert.equal(csalasDontesek('{"valami":1}', 1), null);
});

// ── 5. rész: források, szétosztás, vázlat-jelölés, őrszem ──────────────────────────────────────────────

t('📡 forrásfájl-őr: pontosan a két jóváhagyott csalás-forrás (user 11-21), más nem kerülhet be', () => {
  const feeds = JSON.parse(readFileSync(new URL('../sources/rss-feeds.json', import.meta.url), 'utf-8'));
  const cs = feeds.sources.filter(s => s.csalas === true);
  assert.deepEqual(cs.map(s => [s.id, s.url]).sort(), [
    ['google-safety', 'https://blog.google/technology/safety-security/rss/'],
    ['ic3-psa', 'https://www.ic3.gov/PSA/RSS'],
  ]);
  assert.deepEqual(CSALAS_FORRASOK, { 'ic3-psa': 'https://www.ic3.gov/PSA/RSS', 'google-safety': 'https://blog.google/technology/safety-security/rss/' });
  for (const s of cs) {
    assert.equal(s.category, 'scam-official', s.id);
    assert.equal(s.enabled, true, s.id);
    assert.equal(s.country, 'US', s.id);
    assert.equal(s.language, 'en', s.id);
    assert.ok(/11-21/.test(s.comment || ''), s.id + ': a comment-ben a 11-21-i user-jóváhagyás');
    assert.ok(csalasForras(s), s.id);
  }
  // Csalás-kategóriát csak csalas-jelölésű forrás kaphat.
  assert.ok(feeds.sources.filter(s => s.category === 'scam-official').every(s => s.csalas === true));
});

const J = (cim) => ({ feedConfig: { id: 'ic3-psa' }, item: { title: cim, link: 'https://www.ic3.gov/PSA/' + cim } });

t('🧮 szétosztás: csalás → vázlat, „nem” → eldobva, döntés nélküli → újrapróba', () => {
  const jeloltek = [J('a'), J('b'), J('c')];
  const r = csalasSzetosztas(jeloltek, [
    { index: 0, csalas: true, csatorna: 'sms', ok: 'toll text' },
    { index: 1, csalas: false, csatorna: null, ok: 'aimed at officials' },
  ]);
  assert.equal(r.csalas.length, 1);
  assert.equal(r.csalas[0].jelolt, jeloltek[0]);
  assert.equal(r.csalas[0].csatorna, 'sms');
  assert.equal(r.csalas[0].ok, 'toll text');
  assert.deepEqual(r.eldobva, [{ jelolt: jeloltek[1], cim: 'b', ok: 'aimed at officials' }]);
  assert.deepEqual(r.dontetlen, [jeloltek[2]]);
});

t('🧮 szétosztás: csalás csatorna nélkül → eldobva (kép nem készülhetne), indokkal', () => {
  const r = csalasSzetosztas([J('a')], [{ index: 0, csalas: true, csatorna: null, ok: 'x' }]);
  assert.equal(r.csalas.length, 0);
  assert.equal(r.eldobva.length, 1);
  assert.ok(/csatorn/i.test(r.eldobva[0].ok), r.eldobva[0].ok);
});

t('🧮 szétosztás: sikertelen hívás (null) → minden újrapróba, semmi sem eldobva', () => {
  const jeloltek = [J('a'), J('b')];
  const r = csalasSzetosztas(jeloltek, null);
  assert.deepEqual(r, { csalas: [], eldobva: [], dontetlen: jeloltek });
});

t('🧮 szétosztás: ugyanarra az indexre kétszer jött döntés → csak az első számít', () => {
  const r = csalasSzetosztas([J('a')], [
    { index: 0, csalas: true, csatorna: 'email', ok: '1' },
    { index: 0, csalas: false, csatorna: null, ok: '2' },
  ]);
  assert.equal(r.csalas.length, 1);
  assert.equal(r.eldobva.length, 0);
});

t('🏷️ vázlat-jelölés: _meta.csalas + 10-es relevancia „scam” kategóriával', () => {
  const m = csalasVazlatMeta({ csatorna: 'call', ok: 'fake bank call' }, { id: 'google-safety' });
  assert.deepEqual(m.csalas, { csatorna: 'call', ok: 'fake bank call', forras_id: 'google-safety' });
  assert.deepEqual(m.relevance, { relevant: true, score: 10, category: 'scam', reason: 'fake bank call' });
});

t('🛰️ őrszem: saját figyelo_* mezők; a kép-lépés at-je és kep_* mezői érintetlenek', () => {
  const regi = { at: '2026-11-23T19:00:00.000Z', kep_at: '2026-11-23T19:00:00.000Z', kep_hibak: [{ slug: 's' }], figyelo_jelolt: 99 };
  const most = new Date('2026-11-24T12:00:00Z');
  const g = csalasGuardFrissit(regi, { jelolt: 3, csalas: 1, eldobva: [{ cim: 'b', ok: 'y' }] }, most);
  assert.equal(g.at, regi.at);
  assert.equal(g.kep_at, regi.kep_at);
  assert.deepEqual(g.kep_hibak, regi.kep_hibak);
  assert.equal(g.figyelo_at, most.toISOString());
  assert.equal(g.figyelo_jelolt, 3);
  assert.equal(g.figyelo_csalas, 1);
  assert.deepEqual(g.figyelo_eldobva, [{ cim: 'b', ok: 'y' }]);
  assert.equal('figyelo_hiba' in g, false);
  assert.notEqual(g, regi, 'új objektum, a régit nem módosítja');
  assert.equal(regi.figyelo_jelolt, 99);
});

t('🛰️ őrszem: hibánál figyelo_hiba; a következő jó futás törli', () => {
  const most = new Date('2026-11-24T12:00:00Z');
  const rossz = csalasGuardFrissit({}, { jelolt: 2, csalas: 0, eldobva: [], hiba: 'AI router elesett' }, most);
  assert.equal(rossz.figyelo_hiba, 'AI router elesett');
  const jo = csalasGuardFrissit(rossz, { jelolt: 0, csalas: 0, eldobva: [] }, most);
  assert.equal('figyelo_hiba' in jo, false);
});

t('🛰️ őrszem: hibás régi tartalom (null, tömb, szöveg) → tiszta objektum', () => {
  const most = new Date('2026-11-24T12:00:00Z');
  for (const regi of [null, undefined, [1, 2], 'x']) {
    const g = csalasGuardFrissit(regi, { jelolt: 0, csalas: 0, eldobva: [] }, most);
    assert.equal(Array.isArray(g), false);
    assert.equal(g.figyelo_at, most.toISOString());
  }
});

// ── 6. rész: az író szétválasztója ─────────────────────────────────────────────────────────────────────

t('✂️ szétválasztás: a terv esete (a, c rendes; b csalás), a rendes sorrend marad', () => {
  assert.deepEqual(csalasSzetvalaszt(['a', 'b', 'c'], id => ({ csalas: id === 'b' })), { rendes: ['a', 'c'], csalas: ['b'] });
});

t('✂️ szétválasztás: üres / hiányzó bemenet → üres listák', () => {
  assert.deepEqual(csalasSzetvalaszt([], () => ({ csalas: true })), { rendes: [], csalas: [] });
  assert.deepEqual(csalasSzetvalaszt(undefined, () => ({})), { rendes: [], csalas: [] });
});

t('✂️ szétválasztás: a csalás-lista a legfrissebb forrás-tétellel kezdődik; dátum nélküli a végére', () => {
  const ido = { x: '2026-11-20T10:00:00Z', y: '2026-11-23T10:00:00Z', z: null, w: 'Mon, 22 Nov 2026 10:00:00 GMT' };
  const r = csalasSzetvalaszt(['x', 'r', 'z', 'y', 'w'], id => ({ csalas: id !== 'r', ido: ido[id] }));
  assert.deepEqual(r, { rendes: ['r'], csalas: ['y', 'w', 'x', 'z'] });
});

t('✂️ szétválasztás: olvashatatlan vázlat (info hibát dob vagy üres) → rendes ág, mint eddig', () => {
  const r = csalasSzetvalaszt(['a', 'b'], id => { if (id === 'a') throw new Error('x'); return {}; });
  assert.deepEqual(r, { rendes: ['a', 'b'], csalas: [] });
});

// ── 6. rész: bekötés-őr (az agentet importálni tilos — a forrásszövegét nézzük) ─────────────────────────
const AGENT = p => readFileSync(new URL('../agents/' + p, import.meta.url), 'utf-8');

t('🔌 CEO: a csalás-hely számol, levonódik, és --csalas-extra-ként jut az Íróhoz', () => {
  const k = AGENT('ceo/agent.js');
  assert.ok(/csalasExtraMaradek\(byType\.newsCsalas \+ drafts\.writerNewsCsalas\)/.test(k), 'publikált + váró csalás-hír nem vonódik le');
  assert.ok(/byType\.news - byType\.newsExtra - byType\.newsCsalas/.test(k), 'a csalás-hír a rendes keretet fogyasztja');
  assert.ok(/'--csalas-extra', String\(csalasExtra\)/.test(k), 'az Író nem kapja meg a csalás-helyet');
  assert.ok(/!\(report\.csalas_extra_remaining > 0\)/.test(k), 'a newsBlocked nem nézi a csalás-helyet');
  assert.ok(/vazlat\.writerNewsCsalas/.test(k), 'a váró csalás-vázlat rendes helyet foglal');
});

t('🔌 Író: --csalas-extra beolvasva; a rendes ág csak a rendes listát kapja; a csalás-hír csalas_extra-val mentődik', () => {
  const k = AGENT('iro/agent.js');
  assert.ok(/'--csalas-extra'/.test(k), 'nincs --csalas-extra kapcsoló');
  assert.ok(/csalasSzetvalaszt\(elo,/.test(k) && /elo\.splice\(0, elo\.length, \.\.\.szet\.rendes\)/.test(k), 'a csalás-vázlat a rendes ágba kerülhet');
  // a szétválasztás a válogatás ELŐTT fut
  assert.ok(k.indexOf('csalasSzetvalaszt(elo,') < k.indexOf('const terv = valogat('), 'a szétválasztás a válogatás után fut');
  assert.ok(/csalasVazlatok\.slice\(0, args\.csalasExtra \|\| 0\)/.test(k), 'a csalás-ág nem a kapott helyszámmal fut');
  assert.ok(/csalas_extra: true/.test(k), 'a csalás-hír nem kap csalas_extra jelet');
  assert.ok(/response\.__csalasHibak/.test(k), 'a hibás csalás-sablon is mentődne');
});

// ── 7. rész: ellenőrző + fordító kapui ─────────────────────────────────────────
t('🔌 Ellenőrző: csalás-hírnél a sablon- és példa-kapu elutasít, a bíró és a forrás-kapu a példa NÉLKÜL olvas', () => {
  const k = AGENT('ellenorzo/agent.js');
  assert.ok(/const csalasE = csalasHir\(writerData\._meta\)/.test(k), 'nincs csalás-felismerés');
  assert.ok(/csalasE \? peldaBlokkNelkul\(markdown\) : markdown/.test(k), 'a vizsgált szöveg a példaüzenettel együtt megy');
  assert.ok(/SCAM_TEMPLATE_MISSING: \$\{szerkezet/.test(k) && /SCAM_EXAMPLE_UNSAFE: \$\{biztonsag/.test(k), 'hiányzik egy csalás-kapu');
  // a kapuk az elutasítás-döntés ELŐTT futnak
  assert.ok(k.indexOf('SCAM_EXAMPLE_UNSAFE: ${') < k.indexOf('blockingIssues(autoCheckResult.issues)'), 'a csalás-kapu az elutasítás után fut');
  assert.ok(/forrasHirJelzesek\(\{ \.\.\.writerData, article_markdown: vizsgaltMd \}/.test(k), 'a forrás-kapu a kitalált példát is nézi');
  assert.ok(/csalasBiroKiegeszites\(writerData\._meta\.csalas\.csatorna\)/.test(k), 'a bíró nem kapja a csalás-szabályt');
  assert.ok(!/aiReview\(markdown,/.test(k), 'van aiReview-hívás a példaüzenettel együtt');
});

t('🔌 Fordító: a példablokk szabálya a promptban, és a széttört blokk újrapróbálható hiba', () => {
  const k = AGENT('translator/agent.js');
  assert.ok(/🧪/.test(k) && /\[\[n\|/.test(k), 'a fordító-prompt nem ismeri a példablokkot');
  assert.ok(/SCAM_BLOCK/.test(k), 'nincs SCAM_BLOCK hibaok');
  assert.ok(/forditasEgyezik\(/.test(k), 'a fordítás nem ellenőrzi a példablokkot');
});

if (hiba) { console.log(`\n❌ ${hiba} hiba`); process.exit(1); }
console.log('\n✅ csalas-figyelo: minden rendben');
