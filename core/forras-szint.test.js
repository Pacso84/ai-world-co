// TESZT — eszköz → forrásszint leképezés (core/forras-szint.js). Ingyenes, hálózat nélküli.
import assert from 'assert/strict';
import { readFileSync, readdirSync } from 'fs';
import { SZINT, forrasSzint, ESZKOZ_SZINT } from './forras-szint.js';

let pass = 0, hiba = 0;
const t = (n, f) => { try { f(); pass++; console.log('  ✅ ' + n); } catch (e) { hiba++; console.log('  ❌ ' + n + '\n     ' + String(e.message).split('\n')[0]); } };
console.log('🧪 forrásszint-leképezés\n');

const sz = (tool, company = '') => forrasSzint(tool, company).szint;

t('a szintek neve rögzített és fagyasztott', () => {
  assert.deepEqual({ ...SZINT }, { TELJES: 'teljes', RESZLEGES: 'reszleges', NINCS: 'nincs', CEGFUGGETLEN: 'cegfuggetlen' });
  assert.ok(Object.isFrozen(SZINT));
});

t('már jóváhagyott súgók: teljes', () => {
  for (const [tool, ceg] of [['ChatGPT', 'OpenAI'], ['Claude', 'Anthropic'], ['Gemini', 'Google'], ['Gemini Notebook', 'Google'],
    ['NotebookLM', 'Google'], ['Google Photos', 'Google'], ['Microsoft Copilot', 'Microsoft'], ['Copilot', 'Microsoft'],
    ['Le Chat', 'Mistral'], ['Mistral AI', 'Mistral'], ['Apple Intelligence', 'Apple'], ['Image Playground', 'Apple'], ['Siri', 'Apple'],
    ['Alexa+', 'Amazon'], ['Alexa', 'Amazon']])
    assert.equal(sz(tool, ceg), 'teljes', tool);
});

t('új jóváhagyott súgók: teljes', () => {
  for (const [tool, ceg] of [['Grok', 'xAI'], ['Perplexity', 'Perplexity'], ['Perplexity', 'Perplexity AI'], ['GitHub Copilot', 'GitHub'],
    ['Hugging Face', 'Hugging Face'], ['Hugging Face Spaces', 'Hugging Face'], ['Cohere', 'Cohere'], ['Duck.ai', 'DuckDuckGo'],
    ['Lumo', 'Proton'], ['Z.ai', 'Z.ai'], ['ElevenLabs', 'ElevenLabs'], ['Scribe v3', 'ElevenLabs'], ['Scribe', 'ElevenLabs']])
    assert.equal(sz(tool, ceg), 'teljes', tool);
});

t('részleges: csak a funkció léte igazolható', () => {
  for (const [tool, ceg] of [['DeepSeek', 'DeepSeek'], ['DeepSeek Chat', 'DeepSeek'], ['Kimi', 'Moonshot AI'],
    ['MiniMax Code', 'MiniMax'], ['Brave Leo', 'Brave']])
    assert.equal(sz(tool, ceg), 'reszleges', tool);
});

t('🧯 nincs jóváhagyott súgó: fék', () => {
  for (const [tool, ceg] of [['Meta AI', 'Meta'], ['Qwen', 'Alibaba'], ['Qwen Chat', 'Alibaba'], ['Alibaba Cloud', 'Alibaba'],
    ['Midjourney', 'Midjourney'], ['Picsart', 'Picsart'], ['Suno.ai', 'Suno.ai'], ['Kling', 'Kling'], ['Recraft', 'Recraft'],
    ['Ideogram', 'Ideogram'], ['Zapier', 'Zapier'], ['Galaxy Ring', 'Samsung'], ['Upscayl', 'NVIDIA'],
    ['Project Genie', 'Google'], ['FooBot', 'Foo Inc']]) {
    const r = forrasSzint(tool, ceg);
    assert.equal(r.szint, 'nincs', tool);
    assert.equal(r.ok, 'nincs jóváhagyott hivatalos súgó', tool);
  }
  assert.equal(forrasSzint('FooBot', 'Foo Inc').eszkoz, null, 'ismeretlennek nincs kanonikus neve');
  assert.equal(forrasSzint('Qwen Chat', 'Alibaba').eszkoz, 'Qwen');
});

t('🔑 az eszköz-egyezés erősebb a cégnél: Project Genie (Google Labs) nem kap Gemini-súgót', () => {
  assert.equal(sz('Project Genie', 'Google'), 'nincs');
});

t('cégfüggetlen: se eszköz, se cég', () => {
  assert.equal(sz('', ''), 'cegfuggetlen');
  assert.equal(sz('-', ''), 'cegfuggetlen');
  assert.equal(sz(undefined, null), 'cegfuggetlen');
  assert.equal(forrasSzint('', '').eszkoz, null);
});

t('csak cég: a cég fő termékének súgója számít', () => {
  assert.equal(sz('', 'Google'), 'teljes');
  assert.equal(sz('-', 'Google'), 'teljes');
  assert.equal(sz('', 'Meta'), 'nincs');
  assert.equal(sz('', 'DeepSeek'), 'reszleges');
  assert.equal(sz('', 'Amazon'), 'teljes');
  assert.equal(sz('', 'Valami Kft'), 'nincs');
});

t('kisbetű, szóköz, + megtartva', () => {
  assert.equal(sz(' alexa+ ', 'amazon'), 'teljes');
  assert.equal(sz('Hugging   Face', 'HUGGING FACE'), 'teljes');
  assert.equal(forrasSzint(' alexa+ ', 'amazon').eszkoz, 'Alexa+');
  assert.equal(forrasSzint('Alexa', 'Amazon').eszkoz, 'Alexa+', 'az Alexa az Alexa+ aliasa');
  assert.equal(forrasSzint('Grok', 'xAI').eszkoz, 'Grok');
});

t('cégnél a .ai / " ai" végződés levágva', () => {
  assert.equal(sz('', 'Perplexity AI'), 'teljes');
  assert.equal(sz('', 'Moonshot AI'), 'reszleges');
  assert.equal(sz('', 'Z.ai'), 'teljes');
});

t('a táblázat szerkezete: minden tételnek érvényes szintje, aliasa, cége, súgó-listája', () => {
  const szintek = new Set(Object.values(SZINT));
  for (const [nev, e] of Object.entries(ESZKOZ_SZINT)) {
    assert.ok(szintek.has(e.szint) && e.szint !== 'cegfuggetlen', nev + ': szint');
    assert.ok(Array.isArray(e.aliasok) && Array.isArray(e.cegek) && Array.isArray(e.sugo), nev + ': mezők');
    if (e.szint === 'nincs') assert.equal(e.sugo.length, 0, nev + ': a „nincs” szintnek nincs súgó-URL-je');
    else assert.ok(e.sugo.length > 0 && e.sugo.every(u => /^https:\/\//.test(u)), nev + ': súgó-URL kell');
  }
});

// ── VALÓDI ADAT: a 11-12-i számlálás szerint a „nincs” szintű útmutatók száma 30–60 (mért ~43) ─────────
function keret(md, kulcs) {
  const m = String(md).match(/^---\n([\s\S]*?)\n---/);
  const s = m && m[1].match(new RegExp('^' + kulcs + ':\\s*(.*)$', 'm'));
  return s ? s[1].trim().replace(/^["']|["']$/g, '') : '';
}

t('🔑 VALÓDI ADAT: egyetlen élő útmutató sem ad ismeretlen szintet; a „nincs” 30–60 db', () => {
  const dir = new URL('../content/articles/', import.meta.url);
  const szintek = new Set(Object.values(SZINT));
  let nincs = 0, ossz = 0;
  const nincsCegek = {};
  for (const f of readdirSync(dir)) {
    if (!/^ARTICLE_GUIDE_.*\.json$/.test(f)) continue;
    let j; try { j = JSON.parse(readFileSync(new URL(f, dir), 'utf-8')); } catch { continue; }
    const md = j.article_markdown || '';
    const tool = keret(md, 'tool') || (j._meta && j._meta.tool) || '';
    const company = keret(md, 'company') || (j._meta && j._meta.company) || '';
    const r = forrasSzint(tool, company);
    assert.ok(r && szintek.has(r.szint), f + ': ismeretlen szint (' + tool + '/' + company + ')');
    ossz++;
    if (r.szint === 'nincs') { nincs++; nincsCegek[tool + '/' + company] = (nincsCegek[tool + '/' + company] || 0) + 1; }
  }
  assert.ok(ossz > 300, 'túl kevés útmutatót olvasott: ' + ossz);
  assert.ok(nincs >= 30 && nincs <= 60, '🔴 a „nincs” szintű útmutatók száma ' + nincs + ' (várt 30–60): ' + JSON.stringify(nincsCegek));
});

if (hiba) { console.log(`\n❌ forras-szint.test: ${hiba} hiba`); process.exit(1); }
console.log(`\n✅ forras-szint.test: mind a ${pass} eset rendben`);
