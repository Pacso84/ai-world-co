// 🌐 Bővített LLM-céglista (2026-10-30): 6 új cég, MINDEGYIKHEZ hivatalos forrás. Ingyenes, hálózat nélküli.
// User 10-30: „lehetne bővíteni az LLM-céglistát” → „mehet, de mindegyikhez kell hivatalos forrás!”
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cimSzuronAtmegy, datumCimPotlas } from './forras-cimszuro.js';
import { kindOf as toolKind } from './tool-kinds.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };
const forrasok = JSON.parse(readFileSync(join(ROOT, 'sources', 'rss-feeds.json'), 'utf-8')).sources;
const forras = id => forrasok.find(s => s.id === id);

// cég → a hivatalos forrás id-je
const UJ = { 'Moonshot AI': 'kimi-blog', 'MiniMax': 'minimax-blog', 'Z.ai': 'zai-release-notes',
  'DuckDuckGo': 'duckduckgo-duck-ai', 'Brave': 'brave-leo', 'Proton': 'proton-lumo' };

console.log('\n🧪 llm-ceglista');

t('🏢 mind a 6 cég a katalógusban, és mindegyikhez van BEKAPCSOLT hivatalos forrás', () => {
  const src = readFileSync(join(ROOT, 'agents', 'guide', 'agent.js'), 'utf-8');
  for (const [ceg, id] of Object.entries(UJ)) {
    assert.ok(src.includes(`company: '${ceg}'`), ceg + ': nincs a COMPANY_CATALOG-ban');
    const f = forras(id);
    assert.ok(f, ceg + ': nincs forrás (' + id + ')');
    assert.equal(f.enabled, true, id + ': ki van kapcsolva');
    assert.equal(f.category, 'ai-company-official', id);
    assert.match(f.url, /^https:\/\//, id);
  }
});

t('🎯 címszűrő a VALÓDI címeken: csak a MI-asszisztens hírei mennek át', () => {
  const p = forras('proton-lumo'), d = forras('duckduckgo-duck-ai'), b = forras('brave-leo');
  assert.equal(cimSzuronAtmegy(p, 'Lumo can now turn your ideas into creations'), true);
  assert.equal(cimSzuronAtmegy(p, 'How to protect your privacy while traveling'), false);
  assert.equal(cimSzuronAtmegy(p, 'Google can now use your Gmail data for ads: How to turn it off'), false, 'más cégről szóló kommentár = összehasonlítás');
  assert.equal(cimSzuronAtmegy(p, 'Illuminating the facts'), false, 'szórészlet nem egyezés');
  assert.equal(cimSzuronAtmegy(d, 'Duck.ai now lets you share chats, privately and on your terms'), true);
  assert.equal(cimSzuronAtmegy(d, '2026 DuckDuckGo Charitable Donations: $1M to privacy and digital competition non-profits'), false);
  assert.equal(cimSzuronAtmegy(b, 'Another Brave User-First AI Win: Leo adds End-to-end Encryption'), true);
  assert.equal(cimSzuronAtmegy(b, 'Brave launches Email Aliases to keep your personal email address private'), false, 'az „email” ai-részszava nem egyezés');
  assert.equal(cimSzuronAtmegy({}, 'bármi'), true, 'szűrő nélkül minden átmegy');
  assert.equal(cimSzuronAtmegy({ title_include: '(' }, 'bármi'), true, 'hibás regex nem némítja el a forrást');
});

t('📅 dátum-cím pótlás (Z.ai): „2026-08-26” helyett előtag + első mondat; rendes cím változatlan', () => {
  const z = forras('zai-release-notes');
  const tartalom = '<ul>\n<li>\n<p>Native visual capabilities enable the model to observe interfaces.</p>\n</li><li><p>Second.</p></li></ul>';
  assert.equal(datumCimPotlas(z, '2026-08-26', tartalom), 'Z.ai GLM update: Native visual capabilities enable the model to observe interfaces.');
  assert.equal(datumCimPotlas(z, 'GLM-6 is here', tartalom), 'GLM-6 is here');
  assert.equal(datumCimPotlas(z, '2026-08-26', ''), '2026-08-26', 'üres tartalomnál marad a dátum');
  assert.equal(datumCimPotlas({}, '2026-08-26', tartalom), '2026-08-26', 'előtag nélkül nincs pótlás');
  const hosszu = datumCimPotlas(z, '2026-01-01', 'x '.repeat(200));
  assert.ok(hosszu.length <= 160 && hosszu.endsWith('…'), 'a hosszú cím nincs levágva');
});

t('🔌 a scraper bekötve: dátum-cím a szűrők ELŐTT, címszűrő a kulcsszó-szűrő előtt, látottnak jelölve', () => {
  const src = readFileSync(join(ROOT, 'agents', 'rss-scraper', 'agent.js'), 'utf-8').replace(/\r\n/g, '\n');
  const i = src.indexOf('item.title = datumCimPotlas(feedConfig'), j = src.indexOf('if (!cimSzuronAtmegy(feedConfig, item.title))'), k = src.indexOf('if (!keywordPrefilter(item))');
  assert.ok(i > 0 && j > i && k > j, 'rossz sorrend vagy nincs bekötve');
  assert.match(src.slice(j, k), /seen\[feedConfig\.id\]\.push\(item\.link\)/);
});

t('🧰 névjegyzék + hivatalos link: az új eszközök asszisztensek és van hivatalos URL-jük', () => {
  const links = JSON.parse(readFileSync(join(ROOT, 'website', 'tool-links.json'), 'utf-8'));
  for (const n of ['Kimi', 'MiniMax Code', 'Z.ai', 'Duck.ai', 'Brave Leo', 'Lumo']) {
    assert.equal(toolKind(n), 'assistant', n);
    assert.match(links.tools[n] || '', /^https:\/\//, n + ': nincs hivatalos link');
  }
  for (const c of ['Moonshot AI', 'MiniMax', 'DuckDuckGo', 'Brave', 'Proton']) assert.match(links.companies[c] || '', /^https:\/\//, c);
  assert.notEqual(toolKind('Leo'), 'assistant', 'a puszta „Leo” köznév, nem kerülhet a névjegyzékbe');
});

if (hiba) { console.log(`\n❌ llm-ceglista.test: ${hiba} hiba`); process.exit(1); }
console.log('✅ llm-ceglista.test: mind rendben');
