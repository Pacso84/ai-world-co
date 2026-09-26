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

console.log(`\n${bukott ? '❌' : '✅'} ${pass} sikeres, ${bukott} bukott`);
process.exit(bukott ? 1 : 0);
