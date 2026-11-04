// 🎙️ ElevenLabs hivatalos blog mint hírforrás (2026-11-03, user: „oké”). Ingyenes, hálózat nélküli.
// MIÉRT: a forráskutató 100/100-ra pontozta, de a hírfolyam ~75%-a céges/fejlesztői anyag (ElevenAgents,
// ügyfélszolgálati robotok), ~10%-a országhoz kötött. A meglévő „hétköznapi” kapu ebből szinte semmit nem fog
// (mérve 11-03: 50-ből 47 átment volna) → saját címszűrő. A jó fogyasztói címekben viszont gyakran nincs „AI” szó
// (50-ből 5 jó címből 4) → mind_mi_tema: a kulcsszó-szűrő kimarad. A teszt a VALÓDI 11-03-i címeken őrzi mindkettőt.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cimSzuronAtmegy, kulcsszoSzuroKell } from './forras-cimszuro.js';
import { kindOf, KINDS } from './tool-kinds.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };
const forrasok = JSON.parse(readFileSync(join(ROOT, 'sources', 'rss-feeds.json'), 'utf-8')).sources;
const e = forrasok.find(s => s.id === 'elevenlabs');

console.log('\n🧪 elevenlabs-forras');

t('📡 a forrás bent van, bekapcsolva, hivatalos, közönség- és készülék-kapuval', () => {
  assert.ok(e, 'nincs elevenlabs forrás');
  assert.equal(e.enabled, true);
  assert.equal(e.category, 'ai-company-official');
  assert.equal(e.url, 'https://elevenlabs.io/blog/rss.xml');
  assert.equal(e.audience_gate, 'everyday');
  assert.equal(e.eszkoz_kapu, true);
  assert.equal(e.mind_mi_tema, true);
  assert.ok(e.title_include, 'saját címszűrő nélkül a mind_mi_tema a teljes hírfolyamot a fizetős hívásra küldené');
});

// A 11-03-i hírfolyam valódi címei.
const AT = [
  'Introducing SFX v3 in ElevenCreative and ElevenAPI',
  'Talk to anyone, in any language, in realtime',
  'Introducing Instant Soundtracks',
  'Audio deepfake detection: How it works & how to verify ElevenLabs audio',
  'Introducing Brand Kit'
];
const KI = [
  'Introducing SFX v3 for developers',
  'Introducing Eleven Realtime: a simpler way to build natural voice agents',
  'Introducing ElevenAgents Architect',
  'Angle Health’s ElevenAgents pilot handles 90% of provider calls without a transfer',
  'TELUS Digital cut early cancellations by more than half with ElevenAgents',
  'Conversational AI in banking: Use cases, benefits, examples',
  'ElevenReader launches in Brazil with Fábio Porchat and 70,000 Brazilian Portuguese books in audio',
  'ElevenLabs launches in Singapore',
  'ElevenLabs and adELA bring free voice restoration to Spain',
  'Voice AI for Karnataka',
  'What is call transcription? A practical business guide',
  'How to integrate Text to Speech into your applications',
  'JavaScript speech recognition tutorial: Build voice UX',
  'Webinar Recap: Reaching At-Risk Patients When Minutes Matter',
  'How to transcribe a podcast: A step-by-step guide',
  'Contact center automation: A guide to better service'
];

t('🎯 címszűrő a valódi címeken: a fogyasztói újdonság átmegy, a céges/fejlesztői/országos kiesik', () => {
  for (const c of AT) assert.equal(cimSzuronAtmegy(e, c), true, 'ki kellene engedni: ' + c);
  for (const c of KI) assert.equal(cimSzuronAtmegy(e, c), false, 'ki kellene szűrni: ' + c);
});

t('🔑 kulcsszó-szűrő: csak a saját címszűrős mind_mi_tema forrásnál marad ki', () => {
  assert.equal(kulcsszoSzuroKell(e), false);
  assert.equal(kulcsszoSzuroKell({ mind_mi_tema: true }), true, 'címszűrő nélkül a kulcsszó-szűrő marad');
  assert.equal(kulcsszoSzuroKell({ title_include: 'x' }), true);
  assert.equal(kulcsszoSzuroKell({}), true);
  assert.equal(kulcsszoSzuroKell(null), true);
  const tobbi = forrasok.filter(s => s.id !== 'elevenlabs' && !kulcsszoSzuroKell(s)).map(s => s.id);
  assert.deepEqual(tobbi, [], 'más forrásnál nem maradhat ki a kulcsszó-szűrő');
});

t('🔌 a hírgyűjtő bekötve: a kulcsszó-szűrő a kapcsoló mögött van', () => {
  const src = readFileSync(join(ROOT, 'agents', 'rss-scraper', 'agent.js'), 'utf-8');
  assert.match(src, /if \(kulcsszoSzuroKell\(feedConfig\) && !keywordPrefilter\(item\)\)/);
  assert.doesNotMatch(src, /if \(!keywordPrefilter\(item\)\)/, 'maradt kapcsoló nélküli kulcsszó-szűrő');
});

t('🧰 hivatalos link + besorolás (nem chatbot)', () => {
  const links = JSON.parse(readFileSync(join(ROOT, 'website', 'tool-links.json'), 'utf-8'));
  assert.equal(links.tools.ElevenLabs, 'https://elevenlabs.io');
  assert.equal(links.companies.ElevenLabs, 'https://elevenlabs.io');
  assert.notEqual(kindOf('ElevenLabs'), KINDS.ASSISTANT);
});

if (hiba) { console.log(`\n❌ elevenlabs-forras.test: ${hiba} hiba`); process.exit(1); }
console.log('✅ elevenlabs-forras.test: mind rendben');
