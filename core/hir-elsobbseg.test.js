// 📰 HÍR-ELSŐBBSÉG teszt (2026-11-09) — ingyenes, hálózat nélküli. A címek a VALÓDI 10–11-i hírek címei.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  termekHirE, termekSzint, forrasOlvasottsag, forrasPont, elsobbsegiSorrend, valogat, tervRendez,
  termekExtraMaradek, termekExtraHir, TERMEK_FORRASOK, HIR_ELSOBBSEG_BE, TERMEK_EXTRA_NAPI
} from './hir-elsobbseg.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };
console.log('\n🧪 hir-elsobbseg');

t('🔌 bekapcsolva, +2 extra hely', () => { assert.equal(HIR_ELSOBBSEG_BE, true); assert.equal(TERMEK_EXTRA_NAPI, 2); });

t('📰 termékhír a valódi címeken (új funkció / modell)', () => {
  for (const [f, c] of [
    ['openai-blog', 'Introducing Images 2.6'],
    ['meta-ai', 'Introducing Muse Wonder and Muse Wonder Full: Frontier Models for Agents'],
    ['kimi-blog', 'Kimi K3.1 Pro Tech Blog: Advancing Open Intelligence'],
    ['minimax-blog', 'MiniMax M3.1 Flash: Redefining Agent Performance and Cost - MiniMax Research'],
    ['mistral-ai', 'Voxtral 3'],
    ['xai-news', 'Model Card: Grok 4.7 - xAI'],
    ['google-gemini', 'Dive into new topics with immersive explorations in the Gemini app.'],
    ['google-gemini', 'New Gemini tools for small business owners'],
    ['amazon-alexa', 'Text, shop, done: Alexa for Shopping is now just a text away'],
    ['brave-leo', 'Another Brave User-First AI Win: Leo adds End-to-end Encryption, Oblivious HTTP, and Verifiable Confidential Computing'],
    ['github-copilot-changelog', 'GitHub Copilot is now available in Xcode’s coding assistant'],
    ['google-ai-blog', 'The latest AI news we announced in October 2026'],
    ['google-workspace', 'New Gemini side panel features in Gmail']
  ]) assert.equal(termekHirE(f, c), true, `${f}: ${c}`);
});

t('🏢 NEM termékhír: esettanulmány, partnerség, kormány, hirdetés-üzlet, gazdaság, más cég', () => {
  for (const [f, c] of [
    ['openai-blog', 'Credit Saison achieves 954% ROI in a ChatGPT Enterprise pilot'],
    ['openai-blog', 'Franchisee reconciles cash in 94% less time with ChatGPT Work'],
    ['openai-blog', 'How Fanatics and OpenAI streamline the fan experience'],
    ['openai-blog', 'How we built ChatGPT’s novel ad stack for user trust and relevance'],
    ['openai-blog', 'ChatGPT Ads expands to 26 new countries as over 100,000 advertisers have used the platform'],
    ['openai-blog', 'OpenAI and Poland’s NASK partner to advance AI safety and security'],
    ['openai-blog', 'Sophos cuts threat investigation time by 96% with OpenAI Daybreak'],
    ['openai-blog', 'Australian universities are creating AI-native graduates'],
    ['anthropic-blog', 'Singapore office and government MOU'],
    ['anthropic-blog', 'Anthropic update on independent evaluators'],
    ['google-deepmind', 'Google DeepMind and Singapore Government announce new AI tool to protect citizens against scams'],
    ['google-ai-blog', 'Southeast Asia’s digital economy to hit $368 billion'],
    ['microsoft-ai', 'Before the ambulance arrives: How AI is helping the NHS rethink patient care'],
    ['perplexity-news', 'Get Maine Lobster triples ad revenue with Perplexity - Perplexity'],
    ['picsart', 'New AI video tools in Picsart'],                       // nem LLM-cég
    ['google-workspace', 'New admin settings for Drive labels'],      // vegyes forrás, Gemini nélkül
    ['openai-blog', ''], [null, 'Introducing Images 2.6']
  ]) assert.equal(termekHirE(f, c), false, `${f}: ${c}`);
});

t('🗂️ minden termékforrás létezik és be van kapcsolva a forráslistában', () => {
  const src = JSON.parse(readFileSync(join(ROOT, 'sources', 'rss-feeds.json'), 'utf-8')).sources;
  for (const id of TERMEK_FORRASOK) {
    const s = src.find(x => x.id === id);
    assert.ok(s, id + ': nincs a sources/rss-feeds.json-ban');
    assert.equal(s.enabled, true, id + ': ki van kapcsolva');
  }
});

const LOG = {
  '2026-11-01': [{ path: '/article/a1', visits: 20 }, { path: '/article/a2', visits: 10 }, { path: '/hu/article/a1', visits: 99 }],
  '2026-11-02': [{ path: '/article/p1', visits: 2 }, { path: '/article/p2', visits: 1 }, { path: '/article/p3', visits: 0 }, { path: '/article/a3', visits: 3 }]
};
const HIREK = [
  { slug: 'a1', forras: 'jo' }, { slug: 'a2', forras: 'jo' }, { slug: 'a3', forras: 'jo' },
  { slug: 'p1', forras: 'picsart' }, { slug: 'p2', forras: 'picsart' }, { slug: 'p3', forras: 'picsart' },
  { slug: 'u1', forras: 'uj' }
];

t('📈 forrás-olvasottság: angol cikkoldal, forrásonkénti átlag; kevés adat → összátlag (semleges)', () => {
  const o = forrasOlvasottsag(LOG, HIREK);
  assert.equal(o.forras.jo.atlag, 11);          // (20+10+3)/3 — a /hu/ nem számít
  assert.equal(o.forras.picsart.atlag, 1);
  assert.equal(forrasPont(o, 'jo'), 11);
  assert.equal(forrasPont(o, 'uj'), o.atlag, '1 hír kevés → semleges');
  assert.equal(forrasPont(o, 'ismeretlen'), o.atlag);
  assert.equal(forrasPont(null, 'jo'), 0);
});

const INFO = {
  p: { forras: 'picsart', cim: 'New AI video tools in Picsart' },
  j: { forras: 'jo', cim: 'Some story' },
  g: { forras: 'google-gemini', cim: 'New Gemini tools for small business owners' },
  o: { forras: 'openai-blog', cim: 'Introducing Images 2.6' },
  o2: { forras: 'openai-blog', cim: 'Introducing Sora 3' },
  o3: { forras: 'openai-blog', cim: 'Introducing Codex 5' },
  c: { forras: 'openai-blog', cim: 'Credit Saison achieves 954% ROI in a ChatGPT Enterprise pilot' },
  p2: { forras: 'picsart', cim: 'Another Picsart post' }
};
const info = id => INFO[id];

t('↕️ sorrend: LLM-termékhír → más cég újdonsága (11-10) → olvasottság szerint; egyenlőnél a régi sorrend', () => {
  const o = forrasOlvasottsag(LOG, HIREK);
  // p = „New AI video tools in Picsart” → 11-10 óta 1. szint (más cég újdonsága), a nem-újdonságok elé kerül
  assert.deepEqual(elsobbsegiSorrend(['p', 'j', 'c', 'g', 'o'], info, o), ['g', 'o', 'p', 'j', 'c']);
  // HA NINCS ÚJDONSÁG: a régi szabály (olvasottság) dönt — a user: „ha nincs naponta elég, a régi szabályok”
  assert.deepEqual(elsobbsegiSorrend(['p2', 'j', 'c'], info, o), ['j', 'c', 'p2']);
});

t('🏭 MINDEN CÉG ÚJDONSÁGA (11-10, user: „a honlapon fent lévő összes céget nézzük”): szint 2 / 1 / 0 valódi címeken', () => {
  // 2 = LLM-cég termékhíre (változatlan termekHirE)
  for (const [f, c] of [
    ['openai-blog', 'Introducing Images 2.6'],
    ['github-copilot-changelog', 'Claude Fable 5.2 in GitHub Copilot']
  ]) assert.equal(termekSzint(f, c), 2, `${f}: ${c}`);
  // 1 = más cég új funkciója / modellje / fejlesztése — a 11-10-i valódi vázlatcímek és publikált címek
  for (const [f, c] of [
    ['google-workspace', 'Pause and schedule automated workflows with the new “Wait until” step in Workspace Studio'],
    ['aws-ml', 'Professional work deserves professional tools. Meet AWS Quick.'],
    ['microsoft-365', 'Improved detection for improper or missing headings in Word'],
    ['google-ai-blog', 'We’re bringing Adobe’s creative and productivity tools closer to your everyday Google apps.'],
    ['samsung-newsroom', "Samsung's Updated Sleep Apnea Feature Now Works on Galaxy Ring and Watch"],
    ['sap', 'SAP Adds New AI to Ariba, Fieldglass, and Concur'],
    ['picsart', 'Kling 4.0 in Picsart: What the New 30-Second AI Video Tool Can Do'],
    ['aws-ml', "Amazon Polly's Generative Voices Get More Expressive, and Hindi and Finnish Are Now Generally Available"],
    ['nvidia-blog', 'NVIDIA Expands Open AI Models and Local Hardware for Europe']
  ]) assert.equal(termekSzint(f, c), 1, `${f}: ${c}`);
  // 0 = esettanulmány, üzlet, oktatás, tanács, statisztika — és nem cég forrása
  for (const [f, c] of [
    ['openai-blog', 'ChatGPT Enterprise now available in AWS Marketplace'],          // vállalati üzlet
    ['openai-blog', 'Kuken Industries searches 70 years of drawings in minutes'],    // esettanulmány
    ['snowflake', "Snowflake's Audit Team Cut Fieldwork Time in Half With AI"],
    ['d-id-news', 'When Should Businesses Use AI Video? 5 Use Cases That Make Sense'],
    ['picsart', 'AI relight: how to change the lighting in a video'],               // tanács, nem újdonság
    ['aws-ml', 'How skills and agents work in AWS Quick'],
    ['dropbox-blog', 'Why 36.6% of Your AI Time at Work Goes to Gathering Context'],  // 🔴 a % nem verzió
    ['salesforce', 'Salesforce Plans to Acquire Cresta to Expand Its AI Phone Support'],
    ['salesforce', 'Half of Slack Messages Now Come From Apps and AI Agents, Slack Says'],
    ['google-workspace', 'Google Meet can show recording policies'],                // a „Meet” itt terméknév, nem bemutató
    ['aiworld-editorial', 'This Week in AI: The 5 Stories That Matter (New Releases)'], // saját szerkesztőség
    ['techcrunch-ai', 'OpenAI launches new model'],                                 // sajtó, nem a cég forrása
    ['picsart', ''], [null, 'Introducing X 2.0'], ['picsart', null]
  ]) assert.equal(termekSzint(f, c), 0, `${f}: ${c}`);
});

t('🚦 más cég újdonságából forrásonként napi 1 (a Picsart ne vigye el a napot), LLM-termékhírből 2', () => {
  const PI = { a: { forras: 'picsart', cim: 'New AI video tools in Picsart' }, b: { forras: 'picsart', cim: 'Kling 4.0 in Picsart: new video tool' },
    c: { forras: 'sap', cim: 'SAP Adds New AI to Concur' } };
  const ki = valogat(['a', 'b', 'c'].map(id => ({ ids: [id], theme: null })), { n: 4, extra: 2, info: id => PI[id] });
  assert.deepEqual(ki.map(e => [e.ids[0], e.termek]), [['a', true], ['c', true]], 'Picsartból 2 újdonság ment ki egy nap');
});

t('🚦 forrás-plafon: naponta 1 / forrás (termékhírből 2), a ma már publikáltakkal együtt', () => {
  const terv = ['p', 'p2', 'j', 'o', 'o2', 'o3'].map(id => ({ ids: [id], theme: null }));
  const ki = valogat(terv, { n: 6, extra: 0, info }).map(e => e.ids[0]);
  assert.deepEqual(ki, ['p', 'j', 'o', 'o2'], 'Picsartból 1, OpenAI termékhírből 2');
  const ki2 = valogat(terv, { n: 6, extra: 0, info, maForrasDb: { picsart: 1 } }).map(e => e.ids[0]);
  assert.ok(!ki2.includes('p') && !ki2.includes('p2'), 'ma már volt Picsart → ma több nem');
});

t('➕ extra hely CSAK termékhírnek, a rendes keret után; n=0 mellett is', () => {
  const terv = ['j', 'p', 'g', 'o'].map(id => ({ ids: [id], theme: null }));
  const ki = valogat(terv, { n: 1, extra: 2, info });
  // 11-10: a „New AI video tools in Picsart” (p) is újdonság → extra helyre mehet (a terv sorrendjében)
  assert.deepEqual(ki.map(e => [e.ids[0], e.extra]), [['j', false], ['p', true], ['g', true]]);
  const csak = valogat(terv, { n: 0, extra: 1, info });
  assert.deepEqual(csak.map(e => e.ids[0]), ['p']);
  // a nem-újdonság extra helyre SOHA
  assert.equal(valogat([{ ids: ['j'], theme: null }, { ids: ['c'], theme: null }], { n: 0, extra: 2, info }).length, 0);
  assert.equal(valogat(terv, { n: 0, extra: 0, info }).length, 0, '--limit 0 = semmi');
});

t('🔗 összevont csoport a legjobb tagja helyére kerül (eddig mindig előre)', () => {
  const terv = [{ ids: ['p', 'p2'], theme: 'Picsart' }, { ids: ['g'], theme: null }, { ids: ['j'], theme: null }];
  assert.deepEqual(tervRendez(terv, ['g', 'j', 'p', 'p2']).map(e => e.ids[0]), ['g', 'j', 'p']);
});

t('🧮 extra-maradék és jelölés', () => {
  assert.equal(termekExtraMaradek(0), 2); assert.equal(termekExtraMaradek(1), 1);
  assert.equal(termekExtraMaradek(5), 0); assert.equal(termekExtraMaradek(NaN), 2);
  assert.equal(termekExtraHir({ termek_extra: true }), true); assert.equal(termekExtraHir({}), false);
});

t('🔌 bekötés: Író (sorrend + válogatás + jelölés) és CEO (extra nem számít a 4-be, --termek-extra)', () => {
  const iro = readFileSync(join(ROOT, 'agents', 'iro', 'agent.js'), 'utf-8');
  assert.match(iro, /elsobbsegiSorrend\(elo, draftInfo, elsobbseg\.olv\)/);
  assert.match(iro, /valogat\(tervRendez\(planWriteOrder\(elo, groups\), elo\)/);
  assert.match(iro, /termek_hir: lista\.some\(d => termekSzint\(/, '🔴 a jelölés nem a bővített (minden cég) szabályt használja');
  assert.match(iro, /termek_extra: true/);
  assert.match(iro, /'--termek-extra'/);
  const ceo = readFileSync(join(ROOT, 'agents', 'ceo', 'agent.js'), 'utf-8');
  assert.match(ceo, /LIMITS\.daily_articles_max - \(byType\.news - byType\.newsExtra\)/);
  assert.match(ceo, /'--termek-extra', String\(termekExtra\)/);
  assert.match(ceo, /newsBlocked: report\.articles_remaining <= 0 && !\(report\.termek_extra_remaining > 0\)/);
  assert.match(ceo, /maPublikalt: most\.news_published_today - most\.news_extra_today/);
});

const { termekHirLine } = await import('./report-lines.js');
t('📨 Telegram-sor: termékhír / hír, extra külön; útmutató nem számít', () => {
  const most = new Date().toISOString();
  const sor = termekHirLine([
    { _meta: { published_at: most, termek_hir: true, termek_extra: true } },
    { _meta: { published_at: most, termek_hir: true } },
    { _meta: { published_at: most } },
    { _meta: { published_at: most, type: 'guide', termek_hir: true } }
  ]);
  assert.equal(sor, '📰 Termékhír (új funkció/modell): 2 / 3 hír — ebből 1 az extra helyen');
  assert.equal(termekHirLine([]), '📰 Termékhír (új funkció/modell): 0 / 0 hír');
  assert.match(readFileSync(join(ROOT, 'core', 'daily-report.js'), 'utf-8'), /termekHirLine\(r\.maiCikkek, 1\)/);
});

if (hiba) { console.log(`\n❌ hir-elsobbseg.test: ${hiba} hiba`); process.exit(1); }
console.log('\n✅ hir-elsobbseg.test: mind rendben');
