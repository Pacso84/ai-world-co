// ===================================================================
// TESZT — nincs cég-összehasonlítás, a cég önmagáról szóló állítása
// forrásmegjelöléssel (user-szabály 2026-09-26). Ingyenes, hálózat nélkül.
//
// MIÉRT: a teljes jogi szabálykönyvben (legal-rules.md) benne volt a
// „Claude is better than ChatGPT" = ROSSZ példa, de a PROMPTBA kerülő
// kivonatból (legal-rules-ai.md) a 08-03-i „prompt-diéta" kivágta — csak a
// „worse than" maradt. A style-guide pedig épp összehasonlításra biztatott
// („a kettő közül a második a jobb kezdés"). Ez a teszt őrzi, hogy a szabály
// a promptban maradjon, és a kint lévő cikkekben se legyen ilyen mondat.
// ===================================================================
import assert from 'assert/strict';
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, bukott = 0;
const t = (nev, fn) => {
  try { fn(); pass++; console.log('  ✅ ' + nev); }
  catch (e) { bukott++; console.log('  ❌ ' + nev + '\n     ' + String(e.message).split('\n')[0]); }
};
console.log('🧪 Nincs cég-összehasonlítás\n');

const ai = readFileSync(join(ROOT, 'shared', 'legal-rules-ai.md'), 'utf-8');
const teljes = readFileSync(join(ROOT, 'shared', 'legal-rules.md'), 'utf-8');
const stilus = readFileSync(join(ROOT, 'shared', 'style-guide.md'), 'utf-8');

t('a PROMPT-szabály tiltja a dicsérő összehasonlítást is', () => {
  assert.match(ai, /NEVER rank or compare companies\/products as better or worse/);
  assert.match(ai, /better than ChatGPT/);
});

t('a PROMPT-szabály: a cég önmagáról szóló állítása csak forrásmegjelöléssel', () => {
  assert.match(ai, /claims about ITSELF/);
  assert.match(ai, /always attribute/);
});

t('a teljes szabálykönyv is (a kettőt EGYÜTT kell frissíteni)', () => {
  assert.match(teljes, /X jobb, mint Y/);
  assert.ok(!/✅ \*\*Saját tapasztalatot\*\*/.test(teljes), 'a kitalált „saját tapasztalat" újra engedélyezve');
});

t('a stílus-útmutató nem biztat összehasonlításra, és nem ausztrál közönségre szól', () => {
  assert.ok(!/LEGYEN VÉLEMÉNYED\.\*\* „Ez a kettő közül a második a jobb kezdés"/.test(stilus), 'a régi összehasonlító példa visszakerült');
  assert.ok(!/\*\*AUD \(ausztrál dollár\)\*\* elsődleges/.test(stilus), 'újra az AUD az elsődleges pénznem');
  assert.match(stilus, /\*\*Month D, YYYY\*\*/);
});

t('🔑 a kint lévő cikkekben NINCS „X jobb, mint Y" cégek/termékek között', () => {
  const T = '(ChatGPT|Gemini|Claude|Copilot|Perplexity|DeepSeek|Qwen|Grok|Le Chat|Meta AI|Kimi|MiniMax|Mistral|Cohere|Alexa|Siri)';
  const rx = new RegExp(T + '[^.]{0,60}\\b(?:is|are|was)\\s+(?:much |far |clearly |way )?(?:better|stronger|smarter|superior)\\s+than\\b[^.]{0,40}' + T, 'i');
  // A mérőt ISMERT esettel hitelesítjük — különben a 0 találat vakságot is jelenthetne.
  assert.match('Claude is better than ChatGPT for coding.', rx, 'a mérő nem ismeri fel a mintapéldát');
  assert.match('In our view Gemini is far smarter than Copilot at this.', rx);
  assert.ok(!rx.test('Claude is better at long documents than it used to be.'), 'téves riasztás');
  const D = join(ROOT, 'content', 'articles');
  const rossz = [];
  let db = 0;
  for (const f of readdirSync(D).filter(x => x.startsWith('ARTICLE_'))) {
    db++;
    const md = JSON.parse(readFileSync(join(D, f), 'utf-8')).article_markdown || '';
    const m = md.match(rx);
    if (m) rossz.push(f.slice(8, 50) + ' :: ' + m[0].slice(0, 100));
  }
  assert.ok(db > 500, 'gyanúsan kevés cikk: ' + db);
  assert.equal(rossz.length, 0, rossz.length + ' összehasonlító mondat, pl. ' + rossz.slice(0, 2).join(' · '));
});

t('a „melyiket válaszd" összehasonlító agent NEM fut a CI-ban', () => {
  const yml = readFileSync(join(ROOT, '.github', 'workflows', 'auto.yml'), 'utf-8');
  assert.ok(!/^\s*node agents\/compare\/agent\.js/m.test(yml), 'a compare agent újra be van kötve');
});

t('az író- és ellenőrző-promptok is tiltják a dicsérő összehasonlítást', () => {
  const iro = readFileSync(join(ROOT, 'agents', 'iro', 'agent.js'), 'utf-8');
  assert.match(iro, /not "X is better than Y", not "worse", not "the best AI"/);
  assert.ok(!/The input you receive is ONLY a SIGNAL/.test(iro), 'visszakerült a „csak jelzés, ne kövesd" szabály');
  const ell = readFileSync(join(ROOT, 'agents', 'ellenorzo', 'agent.js'), 'utf-8');
  assert.match(ell, /No comparisons or rankings between companies\/products/);
  const guide = readFileSync(join(ROOT, 'agents', 'guide', 'agent.js'), 'utf-8');
  assert.match(guide, /No comparisons or rankings between companies\/products/);
});

t('a CEO-felülbírálás SEM kerüli meg a hitelesség-kaput', () => {
  const src = readFileSync(join(ROOT, 'agents', 'ceo', 'escalate-guides.js'), 'utf-8');
  const kapu = src.indexOf('await truthGate(');
  const publ = src.indexOf('const out = publishGuide(');
  assert.ok(kapu > 0 && publ > 0 && kapu < publ, 'a jóváhagyott útmutató kapu nélkül publikálódik');
});

console.log(`\n${bukott ? '❌' : '✅'} ${pass} sikeres, ${bukott} bukott`);
process.exit(bukott ? 1 : 0);
