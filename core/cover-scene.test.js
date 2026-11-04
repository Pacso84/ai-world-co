// Borítókép: NE legyen kitalált felirat a képen (2026-10-19, reggeli ellenőrzés:
// „Aleza+”, „Vidde aps day”, „ti-baswy” a kiküldött FB/Threads/TikTok képeken).
// Ok: a jelenetíró KÉPERNYŐT kért („a smartphone displaying…”), a Flux pedig a
// képernyőre betűket rajzol — írni nem tud, ezért halandzsa lesz belőle.
// Ingyenes, hálózat nélküli. A designer agentet NEM importáljuk (feltétel nélküli main()).
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { szovegMentesJelenet, SZOVEGMENTES_TOLDAT, szovegKockazat, ujrairasKeres } from './cover-scene.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const agent = readFileSync(join(ROOT, 'agents', 'designer', 'agent.js'), 'utf-8');
let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };

console.log('\n🧪 cover-scene');

t('🖼️ a képernyős jelenet megkapja a „kikapcsolt, üres képernyő, sehol semmi felirat” toldatot', () => {
  for (const jelenet of [
    'A glossy smartphone displaying the Alexa+ app with a morning checklist',   // a 10-19-i hiba
    'A laptop screen showing a chat window next to a coffee cup',
    'A friendly robot pointing at a website dashboard',
    'A smart speaker labeled Alexa beside an alarm clock'
  ]) {
    const ki = szovegMentesJelenet(jelenet);
    assert.ok(ki.startsWith(jelenet), 'a jelenet eleje elveszett');
    assert.ok(ki.endsWith(SZOVEGMENTES_TOLDAT), 'nincs toldat: ' + jelenet);
  }
});

t('🖼️ a tiszta, tárgyas jelenet változatlan marad', () => {
  const j = 'A glossy smart speaker on a breakfast table next to an alarm clock and a steaming mug';
  assert.equal(szovegMentesJelenet(j), j);
});

t('🖼️ kétszer alkalmazva sem duplázódik, hibás bemenetre nem dob', () => {
  const egyszer = szovegMentesJelenet('A phone screen with a calendar');
  assert.equal(szovegMentesJelenet(egyszer), egyszer);
  for (const rossz of [null, undefined, 42]) assert.doesNotThrow(() => szovegMentesJelenet(rossz));
});

t('📰 a papíros tárgyakat is felismeri (10-19 előnézet: „Rtews News” újság, „Welrday Lisey” napló)', () => {
  assert.equal(szovegKockazat('A friendly robot holds a printed AI news headline'), 'headline');
  assert.equal(szovegKockazat('An Echo speaker next to an open weekly planner'), 'planner');
  assert.equal(szovegKockazat('A robot reading a newspaper'), 'newspaper');
  assert.equal(szovegKockazat('a speech bubble floats with a plain-English explanation'), 'speech bubble');   // 10-19: „cutoe!”
  assert.equal(szovegKockazat('A glossy smart speaker on a breakfast table next to an alarm clock and a steaming mug'), null);
  assert.equal(szovegKockazat(null), null);
});

t('📰 az újraíró kérés megnevezi a bajos szót, és tárgyat kér helyette', () => {
  const k = ujrairasKeres('A robot reading a newspaper', 'newspaper');
  assert.ok(k.includes('"newspaper"') && k.includes('A robot reading a newspaper'));
  assert.match(k, /physical objects/);
});

t('🔌 a jelenetíró feliratos tárgynál EGYSZER újraíratja a jelenetet', () => {
  const ds = agent.slice(agent.indexOf('async function describeScene('), agent.indexOf('function buildPrompt('));
  assert.match(agent, /import \{ szovegMentesJelenet, szovegKockazat, ujrairasKeres \} from '\.\.\/\.\.\/core\/cover-scene\.js';/);
  assert.match(ds, /const szo = szovegKockazat\(t\);/, 'nem nézi meg a jelenetet');
  assert.match(ds, /await ask\(ujrairasKeres\(t, szo\)/, 'nem íratja újra');
  assert.equal((ds.match(/await ask\(/g) || []).length, 2, 'pontosan egy újraíratás kell (nem ciklus — költség)');
  assert.match(ds, /papers, books, notebooks, planners, newspapers/, 'a tilalmi lista nem tiltja a papírt');
  assert.match(ds, /speech bubbles/, 'a tilalmi lista nem tiltja a szóbuborékot');
});

t('🔌 a designer a buildPrompt-ban használja (a 160 karakteres vágás UTÁN, hogy a toldat ne vesszen el)', () => {
  const bp = agent.slice(agent.indexOf('function buildPrompt('), agent.indexOf('function buildPrompt(') + 700);
  assert.match(bp, /= szovegMentesJelenet\(.*\.slice\(0, 160\)\);/, 'a toldat nem a vágás után kerül a jelenetre');
  assert.match(bp, /\$\{s\}\./, 'a prompt nem a hálózott jelenetet használja');
});

t('🎬 a jelenetíró NEM kér képernyőt, és tárgyat kér helyette', () => {
  const ds = agent.slice(agent.indexOf('async function describeScene('), agent.indexOf('function buildPrompt('));
  assert.ok(!/screens and\s+actions/.test(ds), 'még mindig „screens”-ből dolgoztatja');
  assert.ok(!/smartphone displaying/.test(ds), 'a példa még mindig képernyőt mutat');
  assert.match(ds, /NO screens, displays/, 'nincs képernyő-tilalom');
  assert.match(ds, /PHYSICAL object/, 'nem kér tárgyat helyette');
});

t('🎨 a stílus-sor tiltja a logót és a felhasználói felületet is', () => {
  const st = (agent.match(/const STYLE = '([^']+)'/) || [])[1] || '';
  assert.match(st, /no text no words no letters/);
  assert.match(st, /no logos/);
  assert.match(st, /no user interface/);
});

if (hiba) { console.log(`\n❌ cover-scene.test: ${hiba} hiba`); process.exit(1); }
console.log('✅ cover-scene.test: mind rendben');
