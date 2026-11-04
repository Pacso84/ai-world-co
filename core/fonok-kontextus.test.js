// ===================================================================
// TESZT — a Főnök-bot élő adatai (core/fonok-kontextus.js)
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// MIÉRT (2026-11-04, user-lelet): a bot „tegnap 518 látogató”-t írt, a napi
// jelentés 203-at — a bot a régi Telegram-üzenetekből vette a számot, mert az
// élő adataiban nem volt látogatószám. És a már felvett ElevenLabs-forrást
// „jóváhagyásra várónak” mondta.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync } from 'fs';
import { latogatoKontextus, fuggoJavaslatok, urlKulcs } from './fonok-kontextus.js';
import { visitorLine } from './report-lines.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };

console.log('🧪 Főnök-bot élő adatai\n');

const napok = {
  '2026-11-01': [{ path: '/', visits: 300 }, { path: '/article/x', visits: 218 }],
  '2026-11-02': [{ path: '/', visits: 150 }, { path: '/article/y', visits: 82 }],
  '2026-11-03': [{ path: '/', visits: 203 }]
};

t('👥 a bot UGYANAZT a számot kapja, mint a napi jelentés — EZ VOLT A HIBA', () => {
  const sor = latogatoKontextus(napok, '2026-11-04');
  assert.equal(sor, visitorLine(napok, '2026-11-04'));
  assert.match(sor, /Tegnap: 203 látogató/);
  assert.doesNotMatch(sor, /518/, 'a régi (11-01-i) szám nem lehet „tegnapi”');
});

t('👥 régi adatnál a dátum látszik, nem „Tegnap”', () => {
  assert.match(latogatoKontextus(napok, '2026-11-09'), /2026-11-03: 203 látogató/);
});

t('👥 üres napló → üres sor (nem kitalált szám)', () => {
  assert.equal(latogatoKontextus({}, '2026-11-04'), '');
  assert.equal(latogatoKontextus(null, '2026-11-04'), '');
});

t('🧭 a már felvett forrás NEM függő javaslat (ElevenLabs-eset)', () => {
  const jav = [
    { name: 'ElevenLabs Blog (hivatalos)', url: 'https://elevenlabs.io/blog/rss.xml', suggested_id: 'elevenlabs' },
    { name: 'Új Blog', url: 'https://uj.example.com/feed', suggested_id: 'uj-blog' }
  ];
  const forr = [{ id: 'elevenlabs', url: 'https://elevenlabs.io/blog/rss.xml' }];
  assert.deepEqual(fuggoJavaslatok(jav, forr).map(j => j.suggested_id), ['uj-blog']);
});

t('🧭 URL-egyezés protokoll/www/záró perjel nélkül is, id-egyezés más URL-lel is', () => {
  assert.equal(urlKulcs('https://www.Example.com/feed/'), 'example.com/feed');
  assert.equal(fuggoJavaslatok([{ url: 'http://example.com/feed' }], [{ url: 'https://www.example.com/feed/' }]).length, 0);
  assert.equal(fuggoJavaslatok([{ url: 'https://a.example/x', suggested_id: 'a' }], [{ id: 'a', url: 'https://b.example/y' }]).length, 0);
  assert.equal(fuggoJavaslatok(undefined, undefined).length, 0);
});

t('🧭 VALÓDI fájlokkal: a mostani javaslat-listából a már felvett források kiesnek', () => {
  const jav = JSON.parse(readFileSync(new URL('../agents/source-scout/discovered-sources.json', import.meta.url), 'utf-8')).discovered_sources || [];
  const forr = JSON.parse(readFileSync(new URL('../sources/rss-feeds.json', import.meta.url), 'utf-8')).sources || [];
  const bent = new Set(forr.map(s => urlKulcs(s.url)));
  for (const j of fuggoJavaslatok(jav, forr)) assert.ok(!bent.has(urlKulcs(j.url)), j.name + ' már bent van');
});

t('📜 a bot utasítása kimondja: számot csak az élő adatból, a régi üzenet elavult', () => {
  const src = readFileSync(new URL('../agents/ceo/instruct.js', import.meta.url), 'utf-8');
  assert.match(src, /latogatoKontextus\(/, 'a bot élő adataiban kell a látogatószám');
  assert.match(src, /fuggoJavaslatok\(/, 'a javaslat-listát szűrni kell');
  assert.match(src, /OUTDATED/, 'a promptnak ki kell mondania, hogy az előzmény számai elavultak');
});

t('🤖 a bot háttér-szövegében nincs konkrét modellnév (elavul → „a $0,20 a MiniMax-on ment el”, 11-04)', () => {
  const src = readFileSync(new URL('../agents/ceo/instruct.js', import.meta.url), 'utf-8');
  assert.doesNotMatch(src, /MiniMax|Haiku|Luna|Gemini 2\.5|\bM2\.7\b|\bM3\b/, 'konkrét modellnév a bot szövegében — a modellek változnak');
});

console.log(`\n✅ ${pass} eset rendben`);
