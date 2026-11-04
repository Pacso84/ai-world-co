// Friss cikkek tényellenőrzése (2026-10-21, user: „a tény-ellenőr a friss cikkeket nézze át, ne a régieket”).
// Ingyenes, hálózat nélküli: a sorrend, a forrás-tisztítás és a javítás-őr.
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  ellenorzesiSor, forrasSzoveg, forrasLinkek, forrasAlatamasztja, MIN_FORRAS, hirCsereEp, HIR_RENDSZER,
  kesz, SKIP_MAX, ERTELMEZHETETLEN_MAX, atnezveMeta, kihagyasMeta, ertelmezhetetlenMeta, gyanuMeta,
  frontmatterVissza, forrasbanNemSzereplo, UTMUTATO_GYANU_RENDSZER, gyanuDontes, jsonKivesz,
  EREDMENYEK, naploTetel, tenyNaplo, latogatasTerkep, cikkUtvonal
} from './friss-tenyellenorzes.js';
import { valodiModositas } from './sitemap-lastmod.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAP = 86400e3;
const NOW = Date.parse('2026-10-21T08:00:00Z');
const c = (nev, meta) => ({ file: nev + '.json', data: { _meta: meta, article_markdown: '' } });
let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };

console.log('\n🧪 friss-tenyellenorzes');

t('🆕 a friss (≤7 napos) hír a régi útmutató ELŐTT jön, és a legújabb hír az elsők között', () => {
  const sor = ellenorzesiSor([
    c('regi-utmutato', { type: 'guide', published_at: new Date(NOW - 90 * NAP).toISOString() }),
    c('hir-regi', { published_at: new Date(NOW - 5 * NAP).toISOString() }),
    c('hir-uj', { published_at: new Date(NOW - 1 * NAP).toISOString() }),
  ], NOW);
  assert.deepEqual(sor.map(x => x.file), ['hir-uj.json', 'hir-regi.json', 'regi-utmutato.json']);
});

t('⏭️ az átnézett friss cikk kimarad, a megjelölt (emberre váró) is', () => {
  const sor = ellenorzesiSor([
    c('mar-atnezve', { published_at: new Date(NOW - 1 * NAP).toISOString(), fact_verified_at: new Date(NOW).toISOString() }),
    c('megjelolt', { published_at: new Date(NOW - 1 * NAP).toISOString(), fact_check_flag: 'may-be-obsolete' }),
    c('uj', { published_at: new Date(NOW - 2 * NAP).toISOString() }),
  ], NOW);
  assert.deepEqual(sor.map(x => x.file), ['uj.json']);
});

t('📚 a régi hírt NEM nézi (csak a 30 napnál régebbi útmutatókat), és a régi útmutató a legrégebben átnézettel kezdődik', () => {
  const sor = ellenorzesiSor([
    c('regi-hir', { published_at: new Date(NOW - 60 * NAP).toISOString() }),
    c('util-a', { type: 'guide', published_at: new Date(NOW - 60 * NAP).toISOString(), fact_verified_at: '2026-10-10T00:00:00Z' }),
    c('util-b', { type: 'guide', published_at: new Date(NOW - 60 * NAP).toISOString(), fact_verified_at: '2026-09-01T00:00:00Z' }),
  ], NOW);
  assert.deepEqual(sor.map(x => x.file), ['util-b.json', 'util-a.json']);
});

t('🔗 összevont hír: MINDEN forrás kell (10-21 Picsart: 3 forrásból csak az elsőt néztük → helyes adatot vett ki)', () => {
  const meta = { source_link: 'https://picsart.com/blog/a/', source_links: ['https://picsart.com/blog/a/', 'https://picsart.com/blog/b/', 'https://picsart.com/blog/c/'], merged_from: 3 };
  assert.deepEqual(forrasLinkek(meta), ['https://picsart.com/blog/a/', 'https://picsart.com/blog/b/', 'https://picsart.com/blog/c/']);
  assert.deepEqual(forrasLinkek({ source_link: 'https://x.com/y' }), ['https://x.com/y'], 'egyforrású hír');
  assert.deepEqual(forrasLinkek({}), [], 'forrás nélkül üres → nem ítélünk');
  const src = readFileSync(join(ROOT, 'agents', 'fact-check', 'agent.js'), 'utf-8');
  assert.match(src, /await hirForrasa\(item\.data\._meta\)/, 'a hír forrása a core/tenyellenorzo-forras.js-ből (minden link kell, különben kihagyás)');
  assert.match(HIR_RENDSZER, /supported if ANY source supports it/);
});

t('🛑 GÉPI BIZTOSÍTÉK: a forrás által alátámasztott mondatot a javítás NEM veheti ki (10-21 Picsart, valódi szövegek)', () => {
  const eredeti = '---\ntitle: "Picsart"\n---\n\n# Picsart\n\nAccording to the company, one vertical product photo can become:\n\n- A wide website banner\n- A tall story frame for a phone\n\nPicsart\'s Halloween post offers 12 prompts, split into six photo prompts and six video prompts. The company\'s advice is to start with your own photo.\n';
  const javitott = eredeti.replace("Picsart's Halloween post offers 12 prompts, split into six photo prompts and six video prompts.", "Picsart's Halloween post offers prompts for costumed portraits.").replace('- A wide website banner\n- A tall story frame for a phone\n', '');
  const forras = 'Meet Picsart Commerce ... A vertical product photo can become a wide website banner, a tall story frame or a square feed post, all from the same shot. Halloween AI prompts: 12 photo and video prompts. Below are six Halloween photo prompts and six video prompts that bring each portrait to life.';
  const al = forrasAlatamasztja(eredeti, javitott, forras);
  assert.ok(al.some(s => /12 prompts/.test(s)), 'a „12 prompt” mondatot a forrás alátámasztja → nem vehető ki');
  assert.ok(al.some(s => /website banner/.test(s)), 'a „banner” sort a forrás alátámasztja → nem vehető ki');
});

t('✅ GÉPI BIZTOSÍTÉK ellenpróba: a forrásban NEM szereplő (kitalált) állítást a javítás kiveheti', () => {
  const eredeti = '---\ntitle: "X"\n---\n\nPicsart Commerce costs $29 per month and works only for Shopify sellers in Europe. You can see a credit quote before anything is generated.\n';
  const javitott = eredeti.replace('Picsart Commerce costs $29 per month and works only for Shopify sellers in Europe. ', '');
  const forras = 'Commerce is designed to show you a credit quote before anything is generated. The model and output settings you pick determine the cost.';
  assert.deepEqual(forrasAlatamasztja(eredeti, javitott, forras), []);
  assert.deepEqual(forrasAlatamasztja(eredeti, eredeti, forras), [], 'változatlan szöveg → nincs mit védeni');
});

t('💵 ÁR-KIVÉTEL (2026-11-02): a forrás által alátámasztott ÁR-mondatot a javítás kiveheti/átírhatja; a többi védett mondat marad', () => {
  const eredeti = '---\ntitle: "Alexa+"\n---\n\n# Alexa+\n\nAlexa+ is free for Prime members and costs $19.99 per month without Prime. Alexa+ is available to all customers in the United States.\n';
  const forras = 'Alexa+ is free for Prime members, and $19.99 per month for non-Prime customers. Alexa+ is now available to all customers in the United States.';
  const arNelkul = eredeti.replace('Alexa+ is free for Prime members and costs $19.99 per month without Prime.', 'Alexa+ is free for Prime members; check Amazon’s official page for other plans.');
  assert.deepEqual(forrasAlatamasztja(eredeti, arNelkul, forras), [], 'az ár kivétele átmegy az őrön');
  assert.deepEqual(forrasbanNemSzereplo(eredeti, arNelkul, forras), [], 'a „nézd meg a hivatalos oldalt” csere nem számít új állításnak');
  const torolt = arNelkul.replace(' Alexa+ is available to all customers in the United States.', '');
  assert.equal(forrasAlatamasztja(eredeti, torolt, forras).length, 1, 'a forrás által alátámasztott NEM-ár mondat továbbra is védett');
  const src = readFileSync(join(ROOT, 'agents', 'fact-check', 'agent.js'), 'utf-8');
  assert.match(src, /ujArak\(guide\.data\.article_markdown, decision\.fixed_markdown\)/, 'az átírt mondat új árat sem hozhat be');
});

t('🔌 bekötés: a hír-javítás előtt fut a biztosíték; útmutatót automata körben (emlékezetből) NEM írhat át', () => {
  const src = readFileSync(join(ROOT, 'agents', 'fact-check', 'agent.js'), 'utf-8');
  assert.match(src, /forrasAlatamasztja\(guide\.data\.article_markdown, decision\.fixed_markdown, forras\)/);
  assert.match(src, /forrasbanNemSzereplo\(guide\.data\.article_markdown, decision\.fixed_markdown, forras\)/, 'a hozzáadott állítás-őr is be van kötve');
  assert.match(src, /return \{ response, decision: jsonKivesz\(response\?\.text\), forras, forrasVia: via \}/, 'az auditHir adja vissza a forrásszöveget');
  assert.match(src, /if \(!why && !hir && auto\) why = /, 'útmutató + automata kör → csak jelzés');
  // a frontmatter-visszaállítás az ellenőrzések ELŐTT, a biztosítékok a NÉV-ZÁR és az applyFix ELŐTT állnak
  const fmIdx = src.indexOf('= frontmatterVissza(decision.fixed_markdown'), cserIdx = src.indexOf('hirCsereEp(decision.fixed_markdown');
  assert.ok(fmIdx > 0 && fmIdx < cserIdx, 'a frontmatter-visszaállítás a hirCsereEp ELŐTT');
  assert.ok(src.indexOf('forrasAlatamasztja(guide') > 0 && src.indexOf('forrasAlatamasztja(guide') < src.indexOf('applyFix(guide, decision.fixed_markdown'));
  assert.ok(src.indexOf('forrasbanNemSzereplo(guide') < src.indexOf('nameLockObjection(guide'));
});

t('🧹 a forrás-tisztítás eldobja a szkriptet és a stílust, és a szöveget megtartja', () => {
  const html = '<html><script>var x="ne";</script><style>p{}</style><main><h1>Gemini &amp; Docs</h1><p>Az új ár 20 dollár.</p></main></html>';
  const sz = forrasSzoveg(html);
  assert.equal(sz.includes('var x'), false);
  assert.equal(sz.includes('p{}'), false);
  assert.match(sz, /Gemini & Docs Az új ár 20 dollár\./);
});

t('🚫 túl rövid (JS-only / hibaoldal) forrásból nem ítélünk', () => {
  assert.ok(forrasSzoveg('<html><body>Enable JavaScript</body></html>').length < MIN_FORRAS);
});

t('🔒 a hír-javítás csak kicsi, célzott csere lehet: a nagy átírás és a fejezetszám-változás kiesik', () => {
  const eredeti = '---\ntitle: "A"\n---\n\n# A\n\n## Egy\n\n' + 'szó '.repeat(200) + '\n\n## Kettő\n\n' + 'szó '.repeat(200);
  const kicsi = eredeti.replace('szó szó szó', 'új szó szó szó');
  assert.equal(hirCsereEp(kicsi, eredeti), null, 'kis javítás elfogadva');
  assert.match(hirCsereEp('---\ntitle: "A"\n---\n\n# A\n\nrövid', eredeti), /túl nagy/);
  assert.match(hirCsereEp(eredeti.replace('## Kettő', 'Kettő'), eredeti), /fejezetek száma/);
  assert.match(hirCsereEp('nincs frontmatter', eredeti), /frontmatter/);
});

t('📜 a hír-prompt a FORRÁST tekinti hatóságnak, nem a modell emlékezetét (új funkciót nem tilthat le)', () => {
  assert.match(HIR_RENDSZER, /The source text is the ONLY authority/);
  assert.match(HIR_RENDSZER, /never call something false just because you have not heard of it/);
});

t('🔌 a tény-ellenőrző a friss sorrendet (olvasottsággal) és a hír-ágat használja; a CI 6 cikket néz futásonként', () => {
  const src = readFileSync(join(ROOT, 'agents', 'fact-check', 'agent.js'), 'utf-8');
  assert.match(src, /if \(auto\) list = ellenorzesiSor\(list, Date\.now\(\), \{ latogatas: olvasottsag\(\) \}\);/);
  assert.match(src, /latogatasTerkep\(JSON\.parse\(readFileSync\(p, 'utf-8'\)\)\.days\)/, 'a térkép a forgalmi napló days mezőjéből épüljön');
  assert.match(src, /const hir = guide\.data\._meta\?\.type !== 'guide';/);
  assert.match(src, /guide\.data\._meta = atnezveMeta\(guide\.data\._meta\)/);
  assert.match(src, /guide\.data\._meta = kihagyasMeta\(guide\.data\._meta, skip\)/, 'az olvashatatlan forrású hír számlálót kapjon, különben minden futásban elöl áll');
  assert.match(src, /guide\.data\._meta = ertelmezhetetlenMeta\(guide\.data\._meta\)/, 'az értelmezhetetlen válasz is jegyződjön');
  assert.match(src, /decision\.removed_claims \|\| decision\.errors/, 'a hír-ág hibalistája (errors) is a jelentésbe kerüljön');
  const yml = readFileSync(join(ROOT, '.github', 'workflows', 'auto.yml'), 'utf-8');
  assert.match(yml, /node agents\/fact-check\/agent\.js --limit 6/);
});

// ── 2026-11-01 (4. rész): LEFEDETTSÉG — a régi, olvasott hírek is sorra kerülnek ─────────────
t('📈 latogatasTerkep: 30 nap, /hu/ KIZÁRVA (a tulaj böngészése), /es/ ugyanahhoz a cikkhez számít', () => {
  const days = {
    '2026-10-20': [{ path: '/article/a', visits: 3 }, { path: '/hu/article/a', visits: 50 }, { path: '/es/article/a', visits: 2 }, { path: '/', visits: 9 }],
    '2026-10-21': [{ path: '/article/b/', visits: 1 }, { path: '/article/c?x=1', visits: 4 }, { path: '/article/z', visits: 0 }],
    '2026-09-01': [{ path: '/article/regi', visits: 99 }],                 // 30 napon kívül
    '2026-10-22': 'hibás nap'                                              // nem tömb → kimarad
  };
  const v = latogatasTerkep(days, NOW);
  assert.equal(v.get('a'), 5, '/article/a 3 + /es/ 2 — a /hu/ 50 NEM');
  assert.equal(v.get('b'), 1);
  assert.equal(v.get('c'), 4);
  assert.equal(v.has('z'), false, '0 látogatás nem olvasott');
  assert.equal(v.has('regi'), false, 'a 30 napon kívüli nap nem számít');
  assert.equal(latogatasTerkep(undefined, NOW).size, 0);
  assert.equal(cikkUtvonal({ slug: 'abc' }), '/article/abc');
  assert.equal(cikkUtvonal({}), null);
});

t('📈 ellenorzesiSor + olvasottság: friss elöl, utána FELVÁLTVA régi olvasott hír (legolvasottabb előre) és régi útmutató', () => {
  const nap = n => new Date(NOW - n * NAP).toISOString();
  const cikkek = [
    c('friss', { type: 'news', slug: 'friss', published_at: nap(1) }),
    c('hir-keves', { type: 'news', slug: 'hir-keves', published_at: nap(40) }),
    c('hir-sok', { type: 'news', slug: 'hir-sok', published_at: nap(20) }),
    c('hir-olvasatlan', { type: 'news', slug: 'hir-olvasatlan', published_at: nap(20) }),
    c('hir-kesz', { type: 'news', slug: 'hir-kesz', published_at: nap(20), fact_verified_at: nap(10) }),
    c('hir-jelolt', { type: 'news', slug: 'hir-jelolt', published_at: nap(20), fact_check_flag: 'may-be-obsolete' }),
    c('hir-human', { type: 'news', slug: 'hir-human', published_at: nap(20), fact_human_ok: nap(5) }),
    c('hir-ujraproba', { type: 'news', slug: 'hir-ujraproba', published_at: nap(20), fact_verified_at: nap(3), fact_check_skip: 'HTTP 403', fact_check_skip_count: 1 }),
    c('ut-1', { type: 'guide', slug: 'ut-1', published_at: nap(60), fact_verified_at: nap(50) }),
    c('ut-2', { type: 'guide', slug: 'ut-2', published_at: nap(60), fact_verified_at: nap(40) })
  ];
  const latogatas = new Map([['hir-keves', 2], ['hir-sok', 30], ['hir-kesz', 99], ['hir-jelolt', 99], ['hir-human', 99], ['hir-ujraproba', 5], ['friss', 1]]);
  const sor = ellenorzesiSor(cikkek, NOW, { latogatas }).map(x => x.file.replace('.json', ''));
  assert.deepEqual(sor, ['friss', 'hir-sok', 'ut-1', 'hir-ujraproba', 'ut-2', 'hir-keves']);
  // olvasottság nélkül (nincs napló / üres): a régi viselkedés — régi hír nincs a sorban
  assert.deepEqual(ellenorzesiSor(cikkek, NOW).map(x => x.file.replace('.json', '')), ['friss', 'ut-1', 'ut-2']);
  assert.deepEqual(ellenorzesiSor(cikkek, NOW, { latogatas: new Map() }).map(x => x.file.replace('.json', '')), ['friss', 'ut-1', 'ut-2']);
});

t('🧠 ismert tévedés: a javítás nem hozhat be cáfolt állítást, és ilyen tanulság nem íródik (agent-bekötés)', () => {
  const src = readFileSync(join(ROOT, 'agents', 'fact-check', 'agent.js'), 'utf-8');
  assert.match(src, /import \{ ujTevedesek, tevesLecke \} from '\.\.\/\.\.\/core\/ismert-tevedesek\.js';/);
  assert.match(src, /const tev = ujTevedesek\(guide\.data\.article_markdown, decision\.fixed_markdown, 'en'\);/);
  assert.match(src, /if \(tev\.length\) why = /, 'a találat a visszautasítás ágába fusson (a régi szöveg marad)');
  assert.match(src, /if \(claims && args\.claim && tevesLecke\(lecke\)\)/);
  assert.ok(!/TODO \(4\. rész\)/.test(src), 'a 4. rész TODO-ja maradt az agentben');
  // a sorrend: az ismert-tévedés őr a név-zár ELŐTT, a javítás (applyFix) előtt fut
  assert.ok(src.indexOf('const tev = ujTevedesek(') < src.indexOf('applyFix(guide, decision.fixed_markdown'), 'az őr az applyFix után áll');
});

// ── 2026-11-01: az átnézés (10-21 – 10-31, 33 futás, 130 tétel) javításai ──────────────────────

t('✂️ forrasLinkek: a szóközzel kezdődő link (valódi Dropbox-_meta) is forrás, levágva; duplikátum egyszer', () => {
  // valódi alak: content/articles/ARTICLE_2026-08-16T00-38-45-861Z_dropbox-blog__… _meta.source_link
  const dropbox = '  https://blog.dropbox.com/topics/news/trusted-dropbox-content-into-openai-workflows ';
  assert.deepEqual(forrasLinkek({ source_link: dropbox }), ['https://blog.dropbox.com/topics/news/trusted-dropbox-content-into-openai-workflows']);
  assert.deepEqual(forrasLinkek({ source_link: dropbox, source_links: [dropbox.trim()] }), ['https://blog.dropbox.com/topics/news/trusted-dropbox-content-into-openai-workflows']);
  assert.deepEqual(forrasLinkek({ source_link: '  ', source_links: [null, 42, 'ftp://x', 'https://'] }), []);
});

const I = d => new Date(NOW - d * NAP).toISOString();
t('✅ kesz(): átnézett = kész; kihagyott csak 3. próba után; értelmezhetetlen 2 után; a régi (számláló nélküli) kihagyás NEM kész', () => {
  assert.equal(kesz({}), false);
  assert.equal(kesz({ fact_verified_at: I(0) }), true);
  assert.equal(kesz({ fact_verified_at: I(0), fact_check_skip: 'a forrás nem olvasható (0/1)' }), false, 'a régi 13 kihagyott újra sorra kerülhet');
  assert.equal(kesz({ fact_check_skip: 'x', fact_check_skip_count: 2 }), false);
  assert.equal(kesz({ fact_check_skip: 'x', fact_check_skip_count: SKIP_MAX }), true);
  assert.equal(kesz({ fact_check_parse_fail_count: 1 }), false);
  assert.equal(kesz({ fact_check_parse_fail_count: ERTELMEZHETETLEN_MAX }), true);
  assert.equal(kesz(null), false);
});

t('🔁 kihagyás → 3 próba; utána siker esetén a próba-mezők törlődnek és fact_verified_at íródik', () => {
  let m = { published_at: I(1), fact_verified_at: '2026-10-21T19:47:11.459Z', fact_check_skip: 'a forrás nem olvasható (0/3)' };   // régi alak
  m = kihagyasMeta(m, 'a forrás nem olvasható (1/2: HTTP 403)', NOW);
  assert.equal(m.fact_check_skip_count, 1);
  assert.equal(m.fact_check_skip_at, new Date(NOW).toISOString());
  assert.equal(m.fact_verified_at, '2026-10-21T19:47:11.459Z', 'a kihagyás NEM írja a fact_verified_at-et');
  assert.equal(kesz(m), false);
  m = kihagyasMeta(kihagyasMeta(m, 'x', NOW), 'y', NOW);
  assert.equal(m.fact_check_skip_count, 3); assert.equal(kesz(m), true);
  const ok = atnezveMeta({ ...m, fact_check_parse_fail_count: 1, slug: 's' }, NOW);
  for (const k of ['fact_check_skip', 'fact_check_skip_count', 'fact_check_skip_at', 'fact_check_parse_fail_count']) assert.equal(k in ok, false, k + ' maradt');
  assert.equal(ok.fact_verified_at, new Date(NOW).toISOString()); assert.equal(ok.slug, 's'); assert.equal(kesz(ok), true);
});

t('⚠️ értelmezhetetlen válasz: 1. alkalom → újra sorra kerül; 2. alkalom → kész, okkal', () => {
  const m1 = ertelmezhetetlenMeta({ published_at: I(1) }, NOW);
  assert.equal(m1.fact_check_parse_fail_count, 1); assert.equal(m1.fact_verified_at, undefined); assert.equal(kesz(m1), false);
  const m2 = ertelmezhetetlenMeta(m1, NOW);
  assert.equal(m2.fact_check_parse_fail_count, 2); assert.equal(m2.fact_verified_at, new Date(NOW).toISOString());
  assert.equal(m2.fact_check_skip, 'a válasz kétszer nem volt értelmezhető'); assert.equal(kesz(m2), true);
});

t('🙋 gyanuMeta: átnézett + gyanú-szöveg + időpont, a szöveghez (article_markdown) nem nyúl', () => {
  const m = gyanuMeta({ fact_check_parse_fail_count: 1 }, 'A cikk szerint a funkció ingyenes, de lehet, hogy már fizetős.', NOW);
  assert.equal(m.fact_check_suspect_at, new Date(NOW).toISOString()); assert.match(m.fact_check_suspect, /fizetős/);
  assert.equal(m.fact_check_parse_fail_count, undefined); assert.equal(kesz(m), true);
  assert.equal(gyanuMeta({}, 'x'.repeat(500), NOW).fact_check_suspect.length, 300);
});

t('📋 sor: a régi kihagyott friss hír visszakerül, a 3-szor kihagyott nem; az újrapróbás a soha nem nézett MÖGÉ kerül; a régi útmutatók rendje változatlan', () => {
  const sor = ellenorzesiSor([
    c('regi-kihagyott', { published_at: I(1), fact_verified_at: I(0.5), fact_check_skip: 'a forrás nem olvasható (0/1)' }),
    c('harmadszor', { published_at: I(1), fact_check_skip: 'x', fact_check_skip_count: 3 }),
    c('uj-hir', { published_at: I(3) }),
    c('ertelmezhetetlen-1', { published_at: I(0.5), fact_check_parse_fail_count: 1 }),
    c('util-regi', { type: 'guide', published_at: I(90), fact_verified_at: '2026-09-01T00:00:00Z', fact_check_parse_fail_count: 2 }),
  ], NOW);
  assert.deepEqual(sor.map(x => x.file), ['uj-hir.json', 'ertelmezhetetlen-1.json', 'regi-kihagyott.json', 'util-regi.json']);
});

t('🩹 frontmatterVissza: a csak törzset adó javítás az EREDETI frontmattert kapja vissza, és átmegy a hirCsereEp-en (valódi formájú hír)', () => {
  const fm = '---\ntitle: "Gemini\'s New Student Hub and Immersive Explorations: What Google Announced"\nsubtitle: "Google is rolling out a student hub."\ncategory: "explainer"\naudience: "personal"\nread_time_minutes: 3\ntags: ["gemini", "students"]\n---\n\n';
  const torzs = '# Gemini\'s New Student Hub\n\n## What changed\n\n' + 'Google says students can save notes and quizzes in one hub. '.repeat(20) + '\n\n## What this means for you\n\n' + 'You can try it in the Gemini app today. '.repeat(10) + '\n';
  const eredeti = fm + torzs;
  const javitottTorzs = torzs.replace('save notes and quizzes', 'save notes and flashcards');
  assert.equal(hirCsereEp(javitottTorzs, eredeti), 'nincs frontmatter', 'kiinduló hiba (10-21 – 10-31: 5 eset)');
  const vissza = frontmatterVissza(javitottTorzs, eredeti);
  assert.ok(vissza.startsWith(fm), 'az eredeti frontmatter került vissza');
  assert.equal(hirCsereEp(vissza, eredeti), null, 'utána a szokásos ellenőrzésen átmegy');
  assert.equal(frontmatterVissza(eredeti, eredeti), eredeti, 'ha megvan, nem nyúl hozzá');
  assert.equal(frontmatterVissza('\n\n' + javitottTorzs, eredeti), vissza, 'a vezető üres sorok nem zavarnak');
  assert.equal(frontmatterVissza(javitottTorzs, torzs), javitottTorzs, 'frontmatter nélküli eredetinél nincs mit visszatenni');
  assert.equal(frontmatterVissza('', eredeti), '', 'üres javítás üres marad');
  const crlf = eredeti.replace(/\n/g, '\r\n');
  assert.ok(frontmatterVissza(javitottTorzs, crlf).startsWith('---\r\ntitle:'), 'CRLF-es eredetinél is');
});

t('🛑 HOZZÁADOTT állítás-őr: a forrásban nem szereplő új szám vagy állítás nem mehet ki; a forrásból vett javítás és a lágyítás mehet', () => {
  const eredeti = '---\ntitle: "X"\n---\n\nPicsart Commerce costs $29 per month for Shopify sellers. You can see a credit quote before anything is generated.\n';
  const forras = 'Commerce is designed to show you a credit quote before anything is generated. Picsart Commerce costs $19 per month for Shopify sellers.';
  // a forrásból vett szám-javítás → rendben
  assert.deepEqual(forrasbanNemSzereplo(eredeti, eredeti.replace('$29', '$19'), forras), []);
  // kitalált új szám → kiesik
  const kitalalt = eredeti.replace('$29', '$39');
  assert.equal(forrasbanNemSzereplo(eredeti, kitalalt, forras).length, 1);
  // kitalált új állítás (tartalomszavai nincsenek a forrásban) → kiesik
  const ujMondat = eredeti.replace('You can see', 'It also integrates with Amazon marketplace listings automatically. You can see');
  assert.match(forrasbanNemSzereplo(eredeti, ujMondat, forras)[0], /Amazon marketplace/);
  // lágyítás (csak lágyító szavak + a forrás szavai) → rendben
  const lagyitott = eredeti.replace('Picsart Commerce costs $29 per month for Shopify sellers.', 'Check whether your account has it, the source does not specify details.');
  assert.deepEqual(forrasbanNemSzereplo(eredeti, lagyitott, forras), []);
  // csak törlés → semmi új
  assert.deepEqual(forrasbanNemSzereplo(eredeti, eredeti.replace('Picsart Commerce costs $29 per month for Shopify sellers. ', ''), forras), []);
});

t('📜 a hír-prompt kér reason_hu-t és tiltja az új állítást; a rövid útmutató-prompt nem kér szöveget, és kimondja az elavult emlékezetet', () => {
  assert.match(HIR_RENDSZER, /"reason_hu"/);
  assert.match(HIR_RENDSZER, /Do NOT add any new claim/);
  assert.match(UTMUTATO_GYANU_RENDSZER, /"verdict":"ok"\|"suspect"/);
  assert.match(UTMUTATO_GYANU_RENDSZER, /"reason_hu"/);
  assert.doesNotMatch(UTMUTATO_GYANU_RENDSZER, /fixed_markdown/, 'automata körben NEM kérünk javított szöveget');
  assert.match(UTMUTATO_GYANU_RENDSZER, /MEMORY IS OLDER/);
  assert.match(UTMUTATO_GYANU_RENDSZER, /do NOT treat it as non-existent, removed or discontinued/);
  assert.match(UTMUTATO_GYANU_RENDSZER, /NOT an error just because you have not heard of it/);
});

t('🧩 gyanuDontes: rövid válasz feldolgozása (kódkerítés, régi ítéletszó, hibás/csonka JSON)', () => {
  assert.deepEqual(gyanuDontes('{"verdict":"ok","claims":[],"reason":"fine","reason_hu":"Rendben."}'), { verdict: 'ok', claims: [], reason: 'fine', reason_hu: 'Rendben.' });
  const g = gyanuDontes('```json\n{"verdict":"suspect","claims":["a","b","c","d",5,""],"reason":"r","reason_hu":"Gyanús."}\n```');
  assert.equal(g.verdict, 'suspect'); assert.deepEqual(g.claims, ['a', 'b', 'c']);
  assert.equal(gyanuDontes('{"verdict":"unpublish","removed_claims":["x"],"reason":"gone"}').verdict, 'suspect', 'régi ítéletszó = gyanú');
  assert.equal(gyanuDontes('{"verdict":"maybe"}'), null);
  assert.equal(gyanuDontes('{"verdict":"ok","claims":["csonka'), null, 'csonka JSON → értelmezhetetlen');
  assert.equal(gyanuDontes(''), null); assert.equal(gyanuDontes(null), null); assert.equal(jsonKivesz('[1,2]'), null);
});

t('📒 napló: stabil forma (tételek + darabszám eredményenként + régi mezők), ismeretlen eredmény hibát dob', () => {
  const items = [
    naploTetel({ file: 'a.json', cim: 'Hír A', hir: true, eredmeny: 'kihagyva', ok_hu: 'a forrás nem olvasható (0/1: HTTP 403)', status: 403 }),
    naploTetel({ file: 'b.json', cim: 'Útmutató B', hir: false, eredmeny: 'gyanu', ok_hu: 'Lehet, hogy fizetős lett.' }),
    naploTetel({ file: 'c.json', cim: 'Hír C', hir: true, eredmeny: 'javitva', ok_hu: 'A dátum 12-e, nem 21-e.' }),
    naploTetel({ file: 'd.json', cim: 'x'.repeat(300), hir: true, eredmeny: 'ok', ok_hu: '' }),
  ];
  assert.deepEqual(items[0], { file: 'a.json', cim: 'Hír A', tipus: 'hir', eredmeny: 'kihagyva', ok_hu: 'a forrás nem olvasható (0/1: HTTP 403)', status: 403 });
  assert.equal(items[1].tipus, 'utmutato'); assert.equal('status' in items[1], false);
  assert.equal(items[3].cim.length, 120);
  const n = tenyNaplo({ items, cost: 0.0123, at: '2026-11-01T12:00:00.000Z' });
  assert.deepEqual(n.darab, { ok: 1, javitva: 1, visszautasitva: 0, gyanu: 1, kihagyva: 1, ertelmezhetetlen: 0 });
  assert.deepEqual([n.ok, n.fixed, n.removed, n.cost, n.at, n.claim, n.osszes], [1, 1, 0, 0.0123, '2026-11-01T12:00:00.000Z', null, 4]);
  assert.equal(n.items, items);
  assert.deepEqual(EREDMENYEK, ['ok', 'javitva', 'visszautasitva', 'gyanu', 'kihagyva', 'ertelmezhetetlen']);
  assert.throws(() => naploTetel({ eredmeny: 'fixed' }));
  assert.equal(tenyNaplo({ items: [naploTetel({ eredmeny: 'gyanu', jelolve: true })] }).removed, 1);
});

t('🔌 agent: automata körben az útmutató a rövid gyanú-promptot kapja (800 token), kézi módban a teljes javítót; a napló a tenyNaplo-ból', () => {
  const src = readFileSync(join(ROOT, 'agents', 'fact-check', 'agent.js'), 'utf-8');
  assert.match(src, /hir \? await auditHir\(guide\)\s*: auto \? await auditGyanu\(guide\)\s*: await audit\(guide, args, brandContext\)/);
  assert.match(src, /systemPrompt: UTMUTATO_GYANU_RENDSZER, maxTokens: 800/);
  assert.match(src, /decision: gyanuDontes\(response\?\.text\)/);
  // 2026-11-02: a napló menet közben is mentődik (naploIr), ugyanazzal az időbélyeggel
  assert.match(src, /tenyNaplo\(\{ items, cost, at: naploAt, claim: args\.claim \}\)/);
  assert.match(src, /JSON\.stringify\(naplo, null, 2\)/);
  assert.match(src, /cikk ellenőrzése/);
  assert.doesNotMatch(src, /útmutató ellenőrzése/);
});

t('🧠 agent: tanulság (remember) CSAK --claim mellett; a jelölés fact_flagged_at-et ír (nem hamis „Frissítve”)', () => {
  const src = readFileSync(join(ROOT, 'agents', 'fact-check', 'agent.js'), 'utf-8').replace(/\r\n/g, '\n');
  const hivasok = src.split('\n').filter(l => /\bremember\(/.test(l) && !/^\s*(\/\/|import)/.test(l));
  assert.ok(hivasok.length >= 1);
  for (const l of hivasok) assert.match(l, /if \([^)]*args\.claim[^)]*\) remember\(/, 'feltétel nélküli tanulság: ' + l.trim().slice(0, 80));
  const flag = src.slice(src.indexOf('function flagForHuman'), src.indexOf('async function main'));
  assert.match(flag, /fact_flagged_at: new Date\(\)\.toISOString\(\)/);
  assert.doesNotMatch(flag.replace(/^\s*\/\/.*$/gm, ''), /fact_checked_at/);
  // ha ember leveszi a jelölést, a jelölés dátuma nem lesz „Frissítve”
  assert.equal(valodiModositas({ published_at: '2026-08-01T10:00:00Z', fact_flagged_at: '2026-10-10T10:00:00Z' }), '2026-08-01T10:00:00Z');
});

t('🚫 agent --dry: minden írás (cikk, ops-üzenet, memória, név-zár, napló) !args.dry mögött', () => {
  const src = readFileSync(join(ROOT, 'agents', 'fact-check', 'agent.js'), 'utf-8').replace(/\r\n/g, '\n');
  const main = src.slice(src.indexOf('async function main'));
  const sorok = main.split('\n');
  // minden író hívás egy `if (!args.dry)` blokkban vagy sorban van
  let melyseg = 0; const dryBlokk = [];
  for (const l of sorok) {
    if (/if \(!args\.dry\) \{\s*$/.test(l)) dryBlokk.push(melyseg);
    melyseg += (l.match(/\{/g) || []).length - (l.match(/\}/g) || []).length;
    while (dryBlokk.length && melyseg <= dryBlokk[dryBlokk.length - 1]) dryBlokk.pop();
    const ir = /\b(saveGuide|applyFix|flagForHuman|message|remember|jegyezNevZar|writeFileSync)\(/.test(l) && !/^\s*\/\//.test(l) && !/function /.test(l);
    if (ir && !dryBlokk.length && !/if \(!args\.dry\)/.test(l)) assert.fail('dry-védelem nélküli írás: ' + l.trim().slice(0, 90));
  }
  assert.match(main, /const ment = \(\) => \{ if \(!args\.dry\) saveGuide\(guide\); \};/);
});

if (hiba) { console.log(`\n❌ friss-tenyellenorzes.test: ${hiba} hiba`); process.exit(1); }
console.log('✅ friss-tenyellenorzes.test: mind rendben');
