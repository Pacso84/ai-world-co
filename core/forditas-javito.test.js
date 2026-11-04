// Fordítás-javító (2026-10-20, user: „nem minden magyar, és szerintem ez vonatkozik a spanyolra is!”).
// Az angolul maradt darabok keresése és cseréje. Ingyenes, hálózat nélküli.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { angolDarab, angolDarabok, csere, valaszFeldolgoz, javitoPrompt, ujjlenyomat, MAX_FUTASONKENT } from './forditas-javito.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };

const MD = `---
title: "What Is Google AI Mode and How to Use It Right Now"
subtitle: "Egy rövid útmutató arról, hogy mit tud az új keresési mód, és hogyan próbálhatod ki."
---

# What Is Google AI Mode and How to Use It Right Now

Ez egy magyar bekezdés, amely elmagyarázza a lényeget, és nem kell hozzányúlni.

💬 Példa: „Please summarize this article in five short bullet points for a busy reader.”

\`\`\`
Write a short polite email to my landlord asking when the heater will be fixed.
\`\`\`

[Olvasd el a teljes cikket](https://aiworldhq.com/article/how-to-use-it-for-the-first-time-with-your-team)

![How to Use the New AI Mode in Your Browser Today](/assets/images/x.jpg)
`;

console.log('\n🧪 forditas-javito');

t('🔎 megtalálja: cím, fejezetcím, idézett prompt, kódblokk, képfelirat — a magyar bekezdést és a link-slugot NEM', () => {
  const d = angolDarabok(MD, 'hu');
  const tipusok = d.map(x => x.tipus);
  for (const k of ['cím', 'fejezetcím', 'idézet', 'prompt', 'képfelirat']) assert.ok(tipusok.includes(k), 'hiányzik: ' + k);
  assert.ok(!d.some(x => /magyar bekezdés|Egy rövid útmutató/.test(x.szoveg)), 'magyar szöveget jelölt');
  assert.ok(!d.some(x => /aiworldhq\.com|Olvasd el/.test(x.szoveg)), 'a link célját (slug) angol szövegnek nézte');
});

t('🔤 angolDarab: a spanyol „En resumen: … es un asistente de IA” nem angol', () => {
  assert.equal(angolDarab('**En resumen:** GitHub Copilot es un asistente de IA que vive dentro de un editor de código y te sugiere código', 'es'), false);
  assert.equal(angolDarab('By the end of this guide you will be able to ask Copilot to draft small snippets for you', 'es'), true);
});

t('🔁 csere: a darabok helyére a fordítás; a frontmatter ép, idézőjel nem törik', () => {
  const d = angolDarabok(MD, 'hu');
  const ford = d.map(x => x.tipus === 'cím' ? 'Mi az a "Google AI Mode", és hogyan használd' : 'Magyar fordítás és egy kicsit hosszabb szöveg');
  const uj = csere(MD, d, ford);
  assert.match(uj, /^---\ntitle: "Mi az a ”Google AI Mode”, és hogyan használd"\n/);
  assert.match(uj, /\n---\n/);
  assert.equal(angolDarabok(uj, 'hu').length, 0, 'maradt angol darab');
  assert.match(uj, /\(https:\/\/aiworldhq\.com\/article\/how-to-use-it-for-the-first-time-with-your-team\)/, 'a link célja megsérült');
});

t('🙅 a változatlanul visszaadott (szándékosan idegen nyelvű) darab nem cserélődik', () => {
  const d = angolDarabok(MD, 'hu');
  assert.equal(csere(MD, d, d.map(() => null)), MD);
});

t('🧾 modellválasz: JSON-tömb, pontos darabszám; hibásra null', () => {
  assert.deepEqual(valaszFeldolgoz('Itt van:\n["a", "b"]', 2), ['a', 'b']);
  assert.equal(valaszFeldolgoz('["a"]', 2), null);
  assert.equal(valaszFeldolgoz('nem json', 1), null);
  assert.equal(ujjlenyomat('abc'), ujjlenyomat('abc'));
  assert.ok(MAX_FUTASONKENT > 0 && MAX_FUTASONKENT <= 50);
});

t('📝 a kérés tartalmazza a szabályokat (tegeződés, márkanév, szándékos idegen nyelv, JSON)', () => {
  const p = javitoPrompt([{ szoveg: 'Hello there' }], 'hu');
  assert.match(p, /tegeződés/); assert.match(p, /UNCHANGED/); assert.match(p, /JSON array of 1 strings/);
  assert.match(javitoPrompt([{ szoveg: 'x' }], 'es'), /"tú"/);
});

t('🌍 VALÓDI fordítások: a csere minden fájlon ép frontmattert hagy, és utána nem marad angol darab', () => {
  let db = 0;
  for (const f of readdirSync(join(ROOT, 'content', 'translations'))) {
    if (!f.endsWith('.json') || !existsSync(join(ROOT, 'content', 'articles', f))) continue;
    const tr = JSON.parse(readFileSync(join(ROOT, 'content', 'translations', f), 'utf-8'));
    for (const ny of ['hu', 'es']) {
      const md = tr[ny]; const d = angolDarabok(md, ny);
      if (!d.length) continue;
      db++;
      const ford = d.map(() => (ny === 'hu' ? 'Ez egy magyar fordítás, és nem angol' : 'Esta es una traducción y no es inglés'));
      const uj = csere(md, d, ford);
      assert.ok(/^---\n[\s\S]*?\n---/.test(uj.trimStart()), `${f} (${ny}): a frontmatter megsérült`);
      assert.equal(angolDarabok(uj, ny).length, 0, `${f} (${ny}): angol darab maradt a csere után`);
    }
  }
  console.log(`     (${db} cikk-nyelv pár ellenőrizve)`);
});

t('🪧 rövid fejezetcím: az angol eredetivel SZÓ SZERINT egyező cím találat (10-21: „Before you start”), az egyszavas nem', () => {
  const en = '# Shared list\n\n## Before you start\n\nText.\n\n## Gemini\n';
  const hu = '# Közös lista\n\n## Before you start\n\nSzöveg, és még egy kis szöveg.\n\n## Gemini\n';
  assert.equal(angolDarabok(hu, 'hu').length, 0, 'eredeti nélkül a számláló nem látja (ezért kell az eredeti)');
  const d = angolDarabok(hu, 'hu', en);
  assert.deepEqual(d.map(x => x.szoveg), ['Before you start']);
  assert.equal(csere(hu, d, ['Mielőtt elkezded']).includes('## Mielőtt elkezded\n'), true);
  const src = readFileSync(join(ROOT, 'agents', 'translator', 'agent.js'), 'utf-8');
  assert.match(src, /angolDarabok\(data\[ny\], ny, en\)/, 'a fordító átadja az angol eredetit');
});

t('🔌 a fordító minden futásban lefuttatja (korláttal, kihagyás-listával)', () => {
  const src = readFileSync(join(ROOT, 'agents', 'translator', 'agent.js'), 'utf-8');
  assert.match(src, /from '\.\.\/\.\.\/core\/forditas-javito\.js'/);
  assert.match(src, /cost \+= await forditasJavitas\(startedAt \+ maxMs\)/, 'a javító ne lépje túl a CI időkeretét');
  assert.match(src, /Date\.now\(\) > hatarido - 90e3/);
  assert.match(src, /naplo\.kihagy\[ujjlenyomat/);
  assert.match(src, /JAVITO_MAX/);
});

if (hiba) { console.log(`\n❌ forditas-javito.test: ${hiba} hiba`); process.exit(1); }
console.log('✅ forditas-javito.test: mind rendben');
