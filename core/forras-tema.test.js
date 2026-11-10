// FORRÁS ↔ TÉMA ŐR — a hír nem szólhat olyan eszközről, amit a forrása meg sem említ (2026-11-10).
// Futtatás: node core/forras-tema.test.js   (hálózat és AI-hívás nélkül)
//
// A forrásszövegek itt SAJÁT SZAVAKKAL írt összefoglalók (nem a kiadó szövege — az a nyilvános repóba
// nem kerülhet, lásd core/kiadoi-szoveg-or.test.js), a valódi esetek tényeivel.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { forrasTemaElteres, forrasTemaJelzes, cikkCime, MIN_FORRAS_SZOVEG, MIN_TORZS_EMLITES } from './forras-tema.js';
import { isBlocking, lessonFor, leckeNevHu } from './auto-check-codes.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };
console.log('🧪 forrás ↔ téma őr\n');

// Teljes hosszúságú forrás: a lényegi bekezdés + semleges töltelék a MIN_FORRAS_SZOVEG fölé.
const TOLTELEK = ' The post walks through the setup in detail, explains the configuration options for administrators, '
  + 'lists the requirements, and closes with a short summary of the benefits for teams that roll it out.';
const teljes = mag => { let s = mag; while (s.length < MIN_FORRAS_SZOVEG + 200) s += TOLTELEK; return s; };
const cikk = (cim, torzs) => `---\ntitle: "${cim}"\ncategory: "how-to"\n---\n\n# ${cim}\n\n${torzs}\n`;

// A VALÓDI ESET (2026-07-08): AWS-hír a Jamf-ről → az élő cikk ChatGPT-hangmód útmutató lett.
const JAMF_CIM = 'Manage AI applications on Mac with Jamf’s AI Governance and Amazon Bedrock';
const JAMF_FORRAS = teljes('IT administrators can use Jamf AI Governance together with Amazon Bedrock to control how AI '
  + 'applications such as Claude Code, Claude Desktop and OpenAI Codex are configured on employee Mac computers.');
const HANG_CIKK = cikk('How to Use Voice Mode in ChatGPT on Your Phone (Step by Step)',
  'Open the app, allow the microphone and pick a voice. Then talk to it while you cook.');

t('🎯 A VALÓDI ESET: Jamf-hírből ChatGPT-hangmód útmutató → ELTÉRÉS (a cím eszköze nincs a forrásban)', () => {
  const r = forrasTemaElteres({ markdown: HANG_CIKK, forrasCim: JAMF_CIM, forrasSzoveg: JAMF_FORRAS });
  assert.equal(r.elteres, true);
  assert.deepEqual(r.hianyzoNevek, ['ChatGPT']);
  assert.match(r.ok, /ChatGPT/);
});

t('🎯 a TÖRZS tanít idegen eszközt (Amazon Nova-hírből ChatGPT-s iratszkennelés) → ELTÉRÉS', () => {
  const forras = teljes('Amazon Nova 2 Lite can be paired with Claude on Amazon Bedrock to process large volumes of '
    + 'business documents at a lower cost per page.');
  const md = cikk('How to Turn Scanned Documents into Searchable Files with AI',
    'Open ChatGPT on your phone. Upload the photo to ChatGPT and ask for the text. ChatGPT returns a searchable file.');
  const r = forrasTemaElteres({ markdown: md, forrasCim: 'Pair Nova 2 Lite with Claude for cost-optimized document processing', forrasSzoveg: forras });
  assert.equal(r.elteres, true);
  assert.deepEqual(r.hianyzoNevek, ['ChatGPT']);
  assert.match(r.ok, /szöveg/);
});

t('🎯 tool-links-en kívüli hétköznapi eszköz is számít (OpenAI-hírből Zapier-útmutató)', () => {
  const forras = teljes('OpenAI describes how companies should plan and measure their AI investments as agents take on more work.');
  const md = cikk('Automate Daily Tasks with AI Agents (No Coding Required)',
    'Sign up for Zapier. In Zapier, pick a trigger. Zapier then files every receipt for you.');
  assert.equal(forrasTemaElteres({ markdown: md, forrasCim: 'How to manage AI investments in the agentic era', forrasSzoveg: forras }).elteres, true);
});

t('✅ a „mit jelent ez neked” MAGYARÁZÓ nem hiba: a forrás termékéről szól, más eszközt csak futólag említ', () => {
  const forras = teljes('OpenAI previews Ultrafast mode: GPT-5.6 Sol can answer at up to fourteen times the usual speed.');
  const md = cikk('Why AI Chatbots Are About to Get Much Faster',
    'OpenAI is testing a faster mode for GPT-5.6. Assistants such as Gemini may follow. For you this means shorter waits.');
  assert.equal(forrasTemaElteres({ markdown: md, forrasCim: 'Previewing Ultrafast mode: GPT-5.6 Sol at up to 14X the speed', forrasSzoveg: forras }).elteres, false);
});

t(`✅ futó említés (${MIN_TORZS_EMLITES - 1}×) még nem téma — csak ${MIN_TORZS_EMLITES}-tól számít`, () => {
  const forras = teljes('Snowflake adds new agent features for analysts working with company data.');
  const keves = cikk('What Snowflake’s New Agents Mean for Analysts', 'Unlike ChatGPT, this runs on your data. ChatGPT is general.');
  const sok = cikk('What Snowflake’s New Agents Mean for Analysts', 'Open ChatGPT. Ask ChatGPT. Then paste into ChatGPT.');
  assert.equal(forrasTemaElteres({ markdown: keves, forrasCim: 'Snowflake agents', forrasSzoveg: forras }).elteres, false);
  assert.equal(forrasTemaElteres({ markdown: sok, forrasCim: 'Snowflake agents', forrasSzoveg: forras }).elteres, true);
});

t('🔕 KIVONATBÓL / forrásszöveg nélkül NEM ítél (a tár hiánya soha ne állítson meg semmit)', () => {
  // 10-17: a Google Vids-hír forrása említi a ChatGPT-t, az 1500 karakteres kivonata nem.
  const kivonat = 'Google Vids is a video creation tool in Google Workspace.'.padEnd(1500, ' x');
  assert.ok(kivonat.length < MIN_FORRAS_SZOVEG);
  assert.equal(forrasTemaElteres({ markdown: HANG_CIKK, forrasCim: JAMF_CIM, forrasSzoveg: kivonat }).elteres, false);
  assert.equal(forrasTemaElteres({ markdown: HANG_CIKK, forrasCim: JAMF_CIM, forrasSzoveg: '' }).elteres, false);
  assert.equal(forrasTemaElteres({}).elteres, false);
});

t('🏷️ átnevezett / összetett név nem téves riasztás', () => {
  const f1 = teljes('Google renamed NotebookLM and added audio overviews for uploaded documents.');
  assert.equal(forrasTemaElteres({ markdown: cikk('Gemini Notebook Gets Audio Overviews', 'x'), forrasCim: 'NotebookLM update', forrasSzoveg: f1 }).elteres, false);
  const f2 = teljes('GitHub Copilot now offers the newest Claude model to paying customers.');
  assert.equal(forrasTemaElteres({ markdown: cikk('Claude Arrives in GitHub Copilot', 'x'), forrasCim: 'Claude in GitHub Copilot', forrasSzoveg: f2 }).elteres, false);
  assert.equal(forrasTemaElteres({ markdown: cikk('Claude Arrives in Copilot', 'x'), forrasCim: 'Claude in GitHub Copilot', forrasSzoveg: f2 }).elteres, false);
  const f3 = teljes('Amazon says Alexa can now keep track of household reminders across Echo devices.');
  assert.equal(forrasTemaElteres({ markdown: cikk('Alexa+ Now Tracks Household Reminders', 'x'), forrasCim: 'Alexa reminders', forrasSzoveg: f3 }).elteres, false);
});

t('az útmutatót, a saját heti összefoglalót és a részben-kivonatos összevont hírt NEM vizsgálja', () => {
  const alap = { article_markdown: HANG_CIKK, original_title: JAMF_CIM };
  assert.match(forrasTemaJelzes({ ...alap, _meta: {} }, JAMF_FORRAS), /^SOURCE_TOPIC_MISMATCH: /);
  assert.equal(forrasTemaJelzes({ ...alap, _meta: { type: 'guide' } }, JAMF_FORRAS), null);
  assert.equal(forrasTemaJelzes({ ...alap, _meta: { source_id: 'aiworld-editorial' } }, JAMF_FORRAS), null);
  assert.equal(forrasTemaJelzes({ ...alap, _meta: { source_text_via: ['hirfolyam', 'kivonat'] } }, JAMF_FORRAS), null);
  assert.match(forrasTemaJelzes({ ...alap, _meta: { source_text_via: ['hirfolyam', 'html'] } }, JAMF_FORRAS), /SOURCE_TOPIC_MISMATCH/);
  assert.equal(forrasTemaJelzes(null, JAMF_FORRAS), null);
});

t('a cím a frontmatterből jön, ennek híján az első H1-ből', () => {
  assert.equal(cikkCime('---\ntitle: "A cím"\n---\n# Más'), 'A cím');
  assert.equal(cikkCime('# Csak H1\n\nszöveg'), 'Csak H1');
  assert.equal(cikkCime(''), '');
});

t('🔌 BEKÖTVE: az Ellenőrző a gépi kapu után hívja, a kód ELUTASÍT, van leckéje és magyar neve', () => {
  const e = readFileSync(new URL('../agents/ellenorzo/agent.js', import.meta.url), 'utf-8');
  assert.match(e, /import \{ forrasTemaJelzes \} from '\.\.\/\.\.\/core\/forras-tema\.js'/);
  assert.ok(e.includes('if (temaJelzes) { autoCheckResult.issues.push(temaJelzes); autoCheckResult.passed = false; }'));
  // a jelzés a blokkolók kigyűjtése ELŐTT kerül a listába — különben nem utasítana el
  assert.ok(e.indexOf('forrasTemaJelzes({') < e.indexOf('const criticalAutoFailures = blockingIssues(autoCheckResult.issues)'));
  // TELJES forrásszöveget kap (nem a rövid kivonatot)
  assert.ok(e.includes("forrasTemaJelzes({ ...writerData, article_markdown: markdown }, cikkForrasSzovege(writerData._meta) || '')"));
  assert.ok(isBlocking('SOURCE_TOPIC_MISMATCH: x'));
  assert.notEqual(lessonFor('SOURCE_TOPIC_MISMATCH: x'), 'SOURCE_TOPIC_MISMATCH');
  assert.ok(leckeNevHu('SOURCE_TOPIC_MISMATCH'));
});

console.log(`\n✅ forras-tema.test: mind a ${pass} eset rendben`);
