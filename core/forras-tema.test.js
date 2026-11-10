// FORRÁS ↔ TÉMA ŐR — a hír nem szólhat olyan eszközről, amit a forrása meg sem említ (2026-11-10).
// Futtatás: node core/forras-tema.test.js   (hálózat és AI-hívás nélkül)
//
// A forrásszövegek itt SAJÁT SZAVAKKAL írt összefoglalók (nem a kiadó szövege — az a nyilvános repóba
// nem kerülhet, lásd core/kiadoi-szoveg-or.test.js), a valódi esetek tényeivel.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { forrasTemaElteres, forrasTemaJelzes, forrasHirJelzesek, forrasbanNemLevoFeliratok, cikkCime, MIN_FORRAS_SZOVEG, MIN_TORZS_EMLITES, MIN_HIANYZO_FELIRAT } from './forras-tema.js';
import { felujitasKifogas } from './upgrade-gate.js';
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
  assert.match(e, /import \{ forrasHirJelzesek \} from '\.\.\/\.\.\/core\/forras-tema\.js'/);
  assert.ok(e.includes('if (forrasJelzesek.length) { autoCheckResult.issues.push(...forrasJelzesek); autoCheckResult.passed = false; }'));
  // a jelzés a blokkolók kigyűjtése ELŐTT kerül a listába — különben nem utasítana el
  assert.ok(e.indexOf('forrasHirJelzesek({') < e.indexOf('const criticalAutoFailures = blockingIssues(autoCheckResult.issues)'));
  // TELJES forrásszöveget kap (nem a rövid kivonatot)
  assert.ok(e.includes("forrasHirJelzesek({ ...writerData, article_markdown: markdown }, cikkForrasSzovege(writerData._meta) || '')"));
  assert.ok(isBlocking('UI_NOT_IN_SOURCE: x'));
  assert.notEqual(lessonFor('UI_NOT_IN_SOURCE: x'), 'UI_NOT_IN_SOURCE');
  assert.ok(leckeNevHu('UI_NOT_IN_SOURCE'));
  assert.ok(isBlocking('SOURCE_TOPIC_MISMATCH: x'));
  assert.notEqual(lessonFor('SOURCE_TOPIC_MISMATCH: x'), 'SOURCE_TOPIC_MISMATCH');
  assert.ok(leckeNevHu('SOURCE_TOPIC_MISMATCH'));
});

// ---------- 2. GOMB-/MENÜNÉV A FORRÁSBAN (UI_NOT_IN_SOURCE) ----------
// A VALÓDI ESET (07-06): Amazon Nova PII-kitakarás → „How to hide personal details” útmutató, emlékezetből írt
// lépésekkel. A téma-őr nem fogta (nem nevez meg idegen eszközt), a feliratok viszont nincsenek a forrásban.
const NOVA_FORRAS = teljes('Amazon Nova can find personal data such as names and card numbers in images and blur it '
  + 'automatically inside an AWS pipeline built with Amazon Bedrock and AWS Lambda.');
const PII_CIKK = cikk('How to Hide Personal Details in Photos Before Sharing Them',
  'Open the photo and tap the **three dots** in the corner. Choose **Markup** and draw over your card number.');

t('🖱️ A VALÓDI ESET: a forrásban nem szereplő gombnevek → UI_NOT_IN_SOURCE', () => {
  const f = forrasbanNemLevoFeliratok(PII_CIKK, NOVA_FORRAS);
  assert.ok(f.hianyzo.length >= MIN_HIANYZO_FELIRAT, JSON.stringify(f));
  const j = forrasHirJelzesek({ article_markdown: PII_CIKK, original_title: 'Automatically redact PII in images with Amazon Nova', _meta: {} }, NOVA_FORRAS);
  assert.equal(j.length, 1);
  assert.match(j[0], /^UI_NOT_IN_SOURCE: /);
});

t('🖱️ ha a gombnevek a forrásban vannak, rendben (a forrás lépéseit szabad leírni)', () => {
  const forras = teljes('To try it, open the app, tap Markup, then tap the Redact tool and drag over the text.');
  const md = cikk('Hide Text in Screenshots with the New Redact Tool', 'Tap **Markup**, then tap **Redact** and drag over the text.');
  assert.deepEqual(forrasbanNemLevoFeliratok(md, forras).hianyzo, []);
  assert.deepEqual(forrasHirJelzesek({ article_markdown: md, original_title: 'Redact tool', _meta: {} }, forras), []);
});

t(`🖱️ ${MIN_HIANYZO_FELIRAT - 1} hiányzó felirat még nem riasztás; kivonatból és útmutatóra nem ítél`, () => {
  const forras = teljes('Open the app and tap Markup to draw on a photo.');
  const egy = cikk('Draw on Photos with Markup', 'Tap **Markup**, then tap **Highlighter**.');
  assert.deepEqual(forrasHirJelzesek({ article_markdown: egy, original_title: 'Markup', _meta: {} }, forras), []);
  assert.deepEqual(forrasbanNemLevoFeliratok(PII_CIKK, 'rövid kivonat').hianyzo, []);
  assert.deepEqual(forrasHirJelzesek({ article_markdown: PII_CIKK, original_title: 'x', _meta: { type: 'guide' } }, NOVA_FORRAS), []);
  assert.deepEqual(forrasHirJelzesek({ article_markdown: PII_CIKK, original_title: 'x', _meta: { source_text_via: ['html', 'kivonat'] } }, NOVA_FORRAS), []);
});

t('🧭 a Jamf-eset a közös belépőn át is kijön (idegen eszköz)', () => {
  const j = forrasHirJelzesek({ article_markdown: HANG_CIKK, original_title: JAMF_CIM, _meta: {} }, JAMF_FORRAS);
  assert.ok(j.some(x => x.startsWith('SOURCE_TOPIC_MISMATCH:')));
});

// ---------- 3. A FELÚJÍTÓ: hírből csak forrással (a gyökérok) ----------
const JO_UJ = '---\ntitle: "How to x"\n---\n\n## What this means for you\n\nszöveg';
t('🔧 felújító: hírből forrásszöveg NÉLKÜL nem ír lépéseket (NINCS_FORRAS)', () => {
  assert.equal(felujitasKifogas({ regiMd: 'a', ujMd: '', fedez: true, hir: true, forras: null }).kod, 'NINCS_FORRAS');
  assert.equal(felujitasKifogas({ regiMd: 'a', ujMd: JO_UJ, fedez: true, hir: true, forras: '  ' }).kod, 'NINCS_FORRAS');
});

t('🔧 felújító: a forráshoz mérve eltérő új szöveg nem cserélhet (FORRAS_ELTER)', () => {
  const k = felujitasKifogas({ regiMd: 'a', ujMd: JO_UJ, fedez: true, hir: true, forras: 'x', forrasJelzesek: ['UI_NOT_IN_SOURCE: 3 gomb'] });
  assert.equal(k.kod, 'FORRAS_ELTER');
  assert.match(k.indok, /UI_NOT_IN_SOURCE/);
});

t('🔧 felújító: útmutatóra (hir=false) a forrás-feltétel nem vonatkozik', () => {
  assert.equal(felujitasKifogas({ regiMd: 'a', ujMd: '', fedez: true }).kod, 'URES', 'útmutatónál a régi sorrend marad');
});

t('🔌 felújító BEKÖTVE: forrást kér, a promptba adja, és a csere előtt a forráshoz méri', () => {
  const u = readFileSync(new URL('../agents/iro/upgrade-howtos.js', import.meta.url), 'utf-8');
  assert.ok(u.includes("import { hirForrasa } from '../../core/tenyellenorzo-forras.js';"));
  assert.ok(u.includes('const hir = !utmutatoE(c.file, c.data);'));
  assert.ok(u.includes('const r = hir && !forras ? null'), 'forrás nélkül NEM hív modellt');
  assert.ok(u.includes('upgradePrompt(c.md, brandContext, forras)'));
  assert.ok(u.includes('OFFICIAL SOURCE TEXT (this article is NEWS'));
  assert.ok(u.includes('forrasJelzesek: hir && forras ? forrasHirJelzesek({ ...c.data, article_markdown: text }, forras) : []'));
});

console.log(`\n✅ forras-tema.test: mind a ${pass} eset rendben`);
