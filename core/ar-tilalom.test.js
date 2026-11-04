// ===================================================================
// TESZT — ár-tilalom, core/ar-tilalom.js (2026-11-01, user: „árakat nem közlünk!")
// Ingyenes, hálózat nélküli. (a) egységtesztek en/hu/es pozitív + negatív példákkal,
// (b) KORPUSZ: az élő cikkek és fordításaik szövegében 0 termékár az elvárt.
// ===================================================================
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arAllitasok, vanAr, ujArak, arJelzes } from './ar-tilalom.js';
import { BLOCKING_CODES, lessonFor } from './auto-check-codes.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, bukott = 0;
const t = (nev, fn) => {
  try { fn(); pass++; console.log('  ✅ ' + nev); }
  catch (e) { bukott++; console.log('  ❌ ' + nev + '\n     ' + String(e && e.message).split('\n').slice(0, 60).join('\n     ')); }
};
const md = body => `---\ntitle: x\n---\n# Cím\n\n${body}\n`;
console.log('🧪 Ár-tilalom\n');

// ── (a) AMIT MEG KELL FOGNI ─────────────────────────────────────────
const AR = [
  'You need **ChatGPT Plus ($20/month)** for the best results.',
  'NVIDIA RTX Spark laptops are now on sale starting at $2,399.',
  'Alexa+ is free for Prime members or $19.99 per month without Prime.',
  'Around $10 USD for the cheapest plan — there is no free tier.',
  'The three plans are **Basic ($10/mo)**, **Standard ($30/mo)** and **Pro ($60/mo)**.',
  'It costs $8 a month.',
  'Az Alexa+ a Prime-tagoknak ingyenes, Prime nélkül havi 19,99 dollár.',
  'A **Plus-előfizetés** kell hozzá (kb. 20 USD/hó).',
  'Az ár 2399 dollártól indul a hat partner márkánál.',
  'A **ChatGPT Plus (20 $/hó)** adja a legjobb eredményt.',
  'Necesitas una suscripción a ChatGPT Plus (unos 20 USD/mes).',
  'Los portátiles ya están a la venta desde 2.399 $.',
  'Es gratis para los miembros de Prime y cuesta 19,99 dólares al mes sin Prime.',
  // 2026-11-02, kód-átnézés (8. rész): ezek eddig átcsúsztak
  'Alexa+ is $19.99 without Prime.',
  'The Pro tier is $200.',
  'It is €9 per month.',
  'Gemini Advanced is US$19.99.',
  'Az Alexa+ ára Prime nélkül 19,99 dollár.',
  'El plan Pro vale 19,99 dólares.',
  'Gemini 3 Pro: $1.25 per million input tokens.',
  'Input tokens are $1.25 per 1M.',
  'The price of Plus is $20.',
  'ChatGPT Go costs ₹399 in India.',
  'Plus costs £20 a month.',
  'Le Chat Pro: €14.99',
  'Without Prime, Alexa+ is $19.99.',
  'Right now Netflix is $15.49 in the US.'
];
for (const s of AR) t('ár: ' + s.slice(0, 60), () => assert.ok(vanAr(md(s)), 'nem fogta meg'));

// ── AMIT BÉKÉN KELL HAGYNI (olvasói példaszám, cégpénz, kód, idézett prompt) ──
const NEM = [
  '💬 Example: "Budget is about $50. It\'s for her birthday."',
  'Ask it to "find three flights under $300 to Lisbon next month".',
  'Anthropic says it will commit $150 million over three years.',
  'The workflow could free up about $100K in cash flow.',
  'They finished the rebuild in two weeks, at a cost around $12,000.',
  'Type `Monthly plan: $20 × 12 = $240` into the cell.',
  'Fix: spend two extra minutes listing anything under $20 that recurs monthly.',
  'Akkor tudod, hogy működött, ha nem ajánl egy 5000 dolláros havi csomagot.',
  'The free plan is enough for this guide — check the official pricing page for current plans.',
  'A legolcsóbb csomag neve Basic — az aktuális árat a hivatalos árlapon nézd meg.',
  '```\nPrice: $2,199 per month plan\n```',
  // 2026-11-02: nulla = ingyenes (szabad); „vale la pena" = megéri; olvasói adatlap- és részlet-példák
  'It is $0 on the free plan.',
  'You pay $0 on the free plan.',
  'sin pagar 40 $ por la revista, suelta el PDF y decide si vale la pena dedicarle la noche.',
  'Here are the specs for the first laptop: RAM: 16GB, Weight: 1.4kg, Price: $2,199',
  '• Price: $2,199 vs $1,799 (second product is cheaper)',
  "Add up: the plan's base price, taxes, any **device installment** (say $25 for a phone on a 24-month plan).",
  'Spend less than $50 per month on groceries.',
  'Set a budget of $200 for the trip.',
  // olvasói költségvetés-lista (nem termék)
  'Rent is $1,200 and utilities are about $150.',
  'Groceries: $400',
  '- Groceries are $400 a month.',
  'Total: $1,750'
];
for (const s of NEM) t('nem ár: ' + s.slice(0, 60).replace(/\n/g, ' '), () => assert.deepEqual(arAllitasok(md(s)), []));

// 2026-11-02 (kód-átnézés): a cím/alcím/leírás LÁTSZIK (lap teteje, kereső) → számít; a többi frontmatter-mező nem.
// Eddig LF-nél kimaradt, CRLF-nél az egész frontmatter számított — most mindkettő ugyanúgy (élőben 1 alcím-ár volt: NVIDIA RTX Spark).
t('frontmatter: title/subtitle/description ára SZÁMÍT (LF és CRLF is)', () => {
  assert.equal(vanAr('---\ntitle: "Plus for $20/month"\n---\n# Cím\n\nNincs itt ár.\n'), true);
  assert.equal(vanAr('---\ntitle: x\nsubtitle: "New laptops — starting at $2,399."\n---\n# Cím\n\nNincs.\n'), true);
  assert.equal(vanAr('---\r\ntitle: x\r\ndescription: "Alexa+ costs $19.99 without Prime."\r\n---\r\n# Cím\r\n\r\nNincs.\r\n'), true);
});
t('frontmatter: más mező (tags, source) NEM számít — LF és CRLF egyformán', () => {
  for (const nl of ['\n', '\r\n']) {
    const s = ['---', 'title: x', 'source_note: "It costs $8 a month."', 'tags: ["plus-$20"]', '---', '# Cím', '', 'Nincs ár.', ''].join(nl);
    assert.equal(vanAr(s), false, JSON.stringify(nl));
  }
});
t('ujArak: csak az ÚJ ár-mondatot adja', () => {
  const regi = md('Old line. ChatGPT Plus ($20/month) works.');
  assert.deepEqual(ujArak(regi, regi), []);
  assert.equal(ujArak(md('No price here.'), regi).length, 1);
});
t('arJelzes: PRICE_IN_ARTICLE kód, árnál; ár nélkül null', () => {
  assert.match(arJelzes(md('It costs $8 a month.')), /^PRICE_IN_ARTICLE: /);
  assert.equal(arJelzes(md('No price.')), null);
});
t('az ellenőrző ELUTASÍT miatta, és van állandó lecke', () => {
  assert.ok(BLOCKING_CODES.includes('PRICE_IN_ARTICLE'));
  assert.notEqual(lessonFor('PRICE_IN_ARTICLE: x'), 'PRICE_IN_ARTICLE');
});

t('az író promptja NEM kéri az árat a forrásból, hanem tiltja (kód-átnézés 11-02: eddig „price … MUST come from the input”)', () => {
  const iro = readFileSync(join(ROOT, 'agents', 'iro', 'agent.js'), 'utf8');
  assert.doesNotMatch(iro, /\(feature, product\/model name, date, price,/);
  assert.match(iro, /NEVER state a price/);
  const jogi = readFileSync(join(ROOT, 'shared', 'legal-rules-ai.md'), 'utf8');
  assert.doesNotMatch(jogi, /\(number, price, quote/);
  assert.match(jogi, /NEVER PUBLISH A PRICE/);
});

// ── (b) KORPUSZ: élő cikkek en + fordítások hu/es ───────────────────
t('korpusz: 0 termékár az élő cikkekben (en/hu/es)', () => {
  const dir = join(ROOT, 'content', 'articles');
  const hibak = [];
  for (const f of readdirSync(dir).filter(x => x.endsWith('.json'))) {
    let d; try { d = JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch { continue; }
    const tp = join(ROOT, 'content', 'translations', f);
    let tr = {}; if (existsSync(tp)) { try { tr = JSON.parse(readFileSync(tp, 'utf8')); } catch { /* sérült fordítás: más teszt dolga */ } }
    for (const [nyelv, szoveg] of [['en', d.article_markdown], ['hu', tr.hu], ['es', tr.es]]) {
      if (!szoveg) continue;
      for (const m of arAllitasok(String(szoveg))) hibak.push(`${f} [${nyelv}] ${m.slice(0, 140)}`);
    }
  }
  assert.equal(hibak.length, 0, `${hibak.length} ár-mondat:\n` + hibak.join('\n'));
});

console.log(`\n${bukott ? '❌' : '✅'} ${pass} rendben, ${bukott} hibás`);
if (bukott) process.exit(1);
