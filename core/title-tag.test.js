// ===================================================================
// TESZT — a <title> rövidítése (core/title-tag.js). Ingyenes, hálózat nélkül.
// A valódi címállományon is végigmegy (csak olvas).
// ===================================================================
import assert from 'assert/strict';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { cimTag, CIM_TAG_MAX } from './title-tag.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, bukott = 0;
const t = (nev, fn) => {
  try { fn(); pass++; console.log('  ✅ ' + nev); }
  catch (e) { bukott++; console.log('  ❌ ' + nev + '\n     ' + String(e.message).split('\n')[0]); }
};
console.log('🧪 <title> rövidítés\n');

t('rövid cím változatlan', () => {
  assert.equal(cimTag('How to use Gemini Live'), 'How to use Gemini Live');
});

t('tagolásnál az első rész megy (kettőspont, gondolatjel, kérdőjel)', () => {
  assert.equal(cimTag('Understanding the AI Spending Boom: How to Spend Smarter on AI Tools This Year'), 'Understanding the AI Spending Boom');
  // a 25 karakternél rövidebb előtag nem áll meg egyedül → szóhatáros vágás
  const r = cimTag('The Next Big Leap in AI: How Digital Agents Will Help You Get Things Done');
  assert.ok(r.endsWith('…') && r.length <= CIM_TAG_MAX, r);
  assert.equal(cimTag('Hogyan gyorsíthatják az AI-ügynökök a szoftverfejlesztést? – gyakorlati útmutató'),
    'Hogyan gyorsíthatják az AI-ügynökök a szoftverfejlesztést?');
});

t('túl rövid előtag NEM áll meg egyedül (a „Gemini:" nem cím)', () => {
  const r = cimTag('Gemini: How to Organize Your Busy Life With the New Features in the App');
  assert.ok(r.length <= CIM_TAG_MAX && r !== 'Gemini', r);
});

t('tagolás nélkül szóhatáron vág, „…"-val, lógó kötőszó nélkül', () => {
  const r = cimTag('How AI Glasses Can Boost Everyday Independence for People with Disabilities');
  assert.ok(r.endsWith('…'), r);
  assert.ok(r.length <= CIM_TAG_MAX, r.length + ': ' + r);
  assert.ok(!/\s(for|with|and|to|the|a)…$/i.test(r), 'lógó kötőszó: ' + r);
});

t('🔑 a VALÓDI címállományon: mind belefér, egyik sem végződik lógó szóval', () => {
  const cim = md => ((md || '').match(/^title:\s*["']?(.+?)["']?\s*$/m) || [])[1] || '';
  const AD = join(ROOT, 'content', 'articles'), TR = join(ROOT, 'content', 'translations');
  let db = 0; const rossz = [];
  const LOGO = /\s(?:a|an|the|and|or|to|for|of|in|on|with|az|egy|és|hogy|y|de|la|el|para|con|en)…$/i;
  for (const f of readdirSync(AD).filter(x => x.startsWith('ARTICLE_'))) {
    const d = JSON.parse(readFileSync(join(AD, f), 'utf-8'));
    const tr = existsSync(join(TR, f)) ? JSON.parse(readFileSync(join(TR, f), 'utf-8')) : {};
    for (const c of [cim(d.article_markdown), cim(tr.hu), cim(tr.es)]) {
      if (!c) continue;
      db++;
      const r = cimTag(c);
      if (r.length > CIM_TAG_MAX || LOGO.test(r) || r.length < 20) rossz.push(`(${r.length}) ${r}`);
    }
  }
  assert.ok(db > 2000, 'gyanúsan kevés cím: ' + db);
  assert.equal(rossz.length, 0, rossz.length + ' rossz rövidítés, pl. ' + rossz.slice(0, 3).join(' · '));
});

t('üres / hiányzó bemenet nem dől el', () => {
  assert.equal(cimTag(''), '');
  assert.equal(cimTag(null), '');
});

console.log(`\n${bukott ? '❌' : '✅'} ${pass} sikeres, ${bukott} bukott`);
process.exit(bukott ? 1 : 0);
