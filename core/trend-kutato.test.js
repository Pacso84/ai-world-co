// core/trend-kutato.js — a napi, ingyenes trendkutató (2026-10-14, user ötlete). Hálózat nélkül:
// a fetch beadott hamisítvány.
import assert from 'node:assert/strict';
import {
  trendBeallitas, normal, eszkozBenne, marMegirt, szuro, rssTetelek, googleJavaslatok,
  googleFelkapott, sajatTopEszkozok, osszesit, frissE, aktivTrendek, rssAiE, mentendo,
  trendTalalat, trendElore, maiTrendDb, maiTrendTema, kovetkezoTrendTema, trendFelvetelKell, trendProbaJegyez, trendPrompt,
  trendRiportSorok, trendMeres, trendekBetolt, bingListaBetolt
} from './trend-kutato.js';

let pass = 0;
const t = (n, f) => { f(); pass++; console.log('  ✅ ' + n); };
const ta = async (n, f) => { await f(); pass++; console.log('  ✅ ' + n); };
console.log('🧪 trend-kutato\n');

const ESZK = ['ChatGPT', 'Claude', 'Gemini', 'Microsoft Copilot', 'Alexa+', 'NotebookLM'];
const NAP = 864e5;
const MOST = Date.parse('2026-10-14T12:00:00Z');

t('beállítás: alapból be; csak a kifejezett false kapcsol ki; legfeljebb 40 alapkérdés', () => {
  assert.equal(trendBeallitas({}).be, true);
  assert.equal(trendBeallitas({ content: { trends: { enabled: false } } }).be, false);
  const sok = Array.from({ length: 60 }, (_, i) => 'q' + i);
  assert.equal(trendBeallitas({ content: { trends: { seeds: sok } } }).seeds.length, 40);
});

t('eszköz-felismerés: szóhatáron, a „+" nélkül is; részszó nem', () => {
  assert.equal(eszkozBenne('how to use alexa for cooking', ESZK), 'Alexa+');
  assert.equal(eszkozBenne('chatgpt paraphrase', ESZK), 'ChatGPT');
  assert.equal(eszkozBenne('claudette recipes', ESZK), '');
});

t('🔴 szűrő: összehasonlítás, tiltott, szám/ár-kérdés, nem angol, navigációs és ismeretlen márka KI', () => {
  const o = { eszkozok: ESZK, magok: ['ai photo trend'] };
  for (const [k, ok] of [
    ['supergrok vs chatgpt', /összehasonlítás/], ['Microsoft Copilot vs ChatGPT vs Claude comparison', /összehasonlítás/],
    ['difference between AI copilots and traditional automation tools', /összehasonlítás/],
    ['best ai photo app', /összehasonlítás/], ['ai undress app', /nem nekünk való/],
    ['how much does grok ai cost', /szám/], ['copilot adoption rate 2026', /szám/],
    ['copilot ai gratis', /nem angol/], ['gemini (bot conversacional)', /nem angol/],
    ['gpt chat', /csak márkanév/], ['anthropic ai claude', /csak márkanév/],
    ['lovable ai', /ismeretlen márka/], ['viral air fryer', /nem AI-téma/],
    ['sci-bot', /egyszavas/], ['ai photo trend', /alapkérdés/],
    ['according to this training how can chatgpt be used by someone in operations and administration', /túl hosszú/]
  ]) {
    const r = szuro(k, o);
    assert.equal(r.ok, false, k);
    assert.match(r.ok_ok, ok, k + ' → ' + r.ok_ok);
  }
});

t('szűrő: ami ÁTMEGY — eszköz + feladat, vagy AI + feladat', () => {
  const o = { eszkozok: ESZK, magok: [] };
  assert.deepEqual(szuro('chatgpt paraphrase', o), { ok: true, ok_ok: '', eszkoz: 'ChatGPT' });
  assert.equal(szuro('claude record a skill', o).ok, true);
  assert.equal(szuro('can ai help with daily tasks', o).ok, true);
  assert.equal(szuro('gemini trending photo prompt for girls', o).eszkoz, 'Gemini');
});

t('már megírt: a kifejezés szavai benne vannak egy meglévő útmutató címében → KI', () => {
  const cimek = ['How to Paraphrase Text with ChatGPT in 5 Minutes'];
  assert.equal(marMegirt('chatgpt paraphrase', cimek), true);
  assert.equal(marMegirt('chatgpt identify pictures', cimek), false);
  assert.equal(szuro('chatgpt paraphrase', { eszkozok: ESZK, meglevoCimek: cimek }).ok_ok, 'már van ilyen útmutatónk');
});

t('RSS: tételek, forgalom és hírcímek; a felkapott szó lehet egyszavas', () => {
  const xml = '<rss><channel><title>Daily Search Trends</title><item><title>nano banana</title><ht:approx_traffic>200+</ht:approx_traffic>'
    + '<ht:news_item><ht:news_item_title>Gemini&#39;s new AI image trend</ht:news_item_title></ht:news_item></item>'
    + '<item><title>fenerbahçe</title><ht:approx_traffic>500+</ht:approx_traffic></item></channel></rss>';
  const r = rssTetelek(xml);
  assert.deepEqual(r[0], { kifejezes: 'nano banana', forgalom: '200+', hirek: ["Gemini's new AI image trend"] });
  assert.equal(r.length, 2);
  assert.equal(szuro('whalefall', { eszkozok: ESZK, rss: true }).ok, true, 'a felkapott listánál egy szó is mehet');
});

await ta('🔴 Review Focus 3: Google-javaslat — 429-nél megáll, HTML-re és hálózati hibára sem dob', async () => {
  const valasz = (status, body) => async () => ({ status, ok: status === 200, text: async () => body });
  const alvas = async () => {};
  const jo = await googleJavaslatok(['ai photo trend'], { fetchFn: valasz(200, JSON.stringify(['ai photo trend', ['ai photo trend prompt', 'ai photo trend free']])), alvas });
  assert.deepEqual(jo.talalat.map(x => [x.kifejezes, x.hely]), [['ai photo trend prompt', 0], ['ai photo trend free', 1]]);
  assert.equal(jo.hiba, '');
  let hivas = 0;
  const tiltott = await googleJavaslatok(['a', 'b', 'c'], { fetchFn: async () => { hivas++; return { status: 429, ok: false, text: async () => '' }; }, alvas });
  assert.equal(hivas, 1, '🔴 a tiltás után is tovább bombázza a Google-t');
  assert.match(tiltott.hiba, /429/);
  const html = await googleJavaslatok(['a'], { fetchFn: valasz(200, '<html>consent</html>'), alvas });
  assert.deepEqual(html.talalat, []);
  const halo = await googleJavaslatok(['a'], { fetchFn: async () => { throw new Error('ECONNRESET'); }, alvas });
  assert.match(halo.hiba, /hálózati hiba/);
  const felk = await googleFelkapott({ fetchFn: async () => { throw new Error('x'); } });
  assert.deepEqual(felk.tetelek, []);
  assert.match(felk.hiba, /hálózati hiba/);
});

t('saját adat: az utolsó 14 nap legolvasottabb cikkeinek eszközei (kisbetűvel)', () => {
  const nap = n => new Date(MOST - n * NAP).toISOString().slice(0, 10);
  const days = { [nap(1)]: [{ path: '/article/a', visits: 9 }, { path: '/hu/article/b', visits: 4 }], [nap(30)]: [{ path: '/article/c', visits: 99 }] };
  const meta = new Map([['a', { tool: 'Gemini' }], ['b', { tool: '' }], ['c', { tool: 'Claude' }]]);
  assert.deepEqual(sajatTopEszkozok(days, meta, MOST), ['gemini']);
});

t('összesítés: pontozás, összevonás azonos szókészletre, saját bónusz, top 10, összehasonlítás kiesik', () => {
  const temak = osszesit({
    javaslatok: [
      { kifejezes: 'gemini trending photo prompt', hely: 0, mag: 'gemini trend' },
      { kifejezes: 'gemini trending photo prompt', hely: 3, mag: 'ai photo trend' },
      { kifejezes: 'chatgpt vs gemini', hely: 0, mag: 'x' }
    ],
    felkapott: [{ kifejezes: 'nano banana', forgalom: '200+', hirek: ['Gemini AI image trend'] }, { kifejezes: 'fenerbahçe', hirek: [] }],
    bing: { lehetosegek: [{ kifejezes: 'claude record a skill', sav: '101-500' }, { kifejezes: 'record a skill claude', sav: '101-500' }] },
    sajatEszkozok: ['gemini'], eszkozok: ESZK, magok: [], meglevoCimek: []
  });
  assert.deepEqual(temak.map(x => x.kifejezes), ['nano banana', 'gemini trending photo prompt', 'claude record a skill']);
  assert.equal(temak[1].pont, 10 + 5 + 10, 'első hely 10 + második alapkérdés 5 + saját Gemini-bónusz 10');
  assert.deepEqual(temak[1].forras, ['google-javaslat']);
  assert.equal(temak[2].pont, 10, 'a két szórendű Bing-kifejezés EGY téma, nem kettő');
  assert.ok(temak.length <= 10);
});

t('🔴 Review Focus 4: frissesség — 20 órán belül nem gyűjt újra; 48 óra után nincs trendhatás; kikapcsolva sincs', () => {
  const tr = { at: new Date(MOST - 5 * 3600e3).toISOString(), temak: [{ kifejezes: 'x y', forras: [], pont: 1 }] };
  assert.equal(frissE(tr, MOST), true);
  assert.equal(frissE({ at: new Date(MOST - 21 * 3600e3).toISOString() }, MOST), false);
  assert.equal(frissE(null, MOST), false);
  assert.equal(aktivTrendek({ now: MOST, cfg: {}, trendek: tr }), tr);
  assert.equal(aktivTrendek({ now: MOST + 2 * NAP, cfg: {}, trendek: tr }), null);
  assert.equal(aktivTrendek({ now: MOST, cfg: { content: { trends: { enabled: false } } }, trendek: tr }), null);
  assert.equal(normal('  Gemini  (Bot)!! '), 'gemini bot');
});

t('🔴 javítás F1/F2: többszavas márkanév, verzió/évszám, hír-stílus, feladat-szó mindig kell', () => {
  const o = { eszkozok: ESZK, magok: [] };
  for (const k of ['microsoft copilot', 'microsoft copilot login']) { const r = szuro(k, o); assert.equal(r.ok, false, k); assert.match(r.ok_ok, /csak márkanév/, k); }
  for (const k of ['how to use gemini 4 argon', 'gemini new features 2026']) { const r = szuro(k, o); assert.equal(r.ok, false, k); assert.match(r.ok_ok, /verzió/, k); }
  assert.equal(szuro('gemini new features', o).ok, false);
  assert.equal(szuro('Microsoft Copilot Linux support', o).ok, false);
  for (const k of ['chatgpt paraphrase', 'claude record a skill', 'can ai help with daily tasks', 'gemini trending photo prompt for girls']) assert.equal(szuro(k, o).ok, true, k);
});

t('🔴 javítás F3: felkapott tétel csak akkor AI, ha a kifejezés az, vagy a hírcímek TÖBBSÉGE az', () => {
  assert.equal(rssAiE({ kifejezes: 'nano banana', hirek: ['Gemini AI image trend', 'Google Gemini nano banana'] }, ESZK), true);
  assert.equal(rssAiE({ kifejezes: 'fenerbahçe', hirek: ['Fenerbahçe wins', 'Coach uses AI analytics', 'Match report'] }, ESZK), false);
  assert.equal(rssAiE({ kifejezes: 'chatgpt outage', hirek: [] }, ESZK), true);
  assert.equal(rssAiE({ kifejezes: 'whalefall', hirek: [] }, ESZK), false);
});

t('🔴 javítás F4: eszközönként legfeljebb 2 téma; az ismétlődő-alapkérdés bónusz legfeljebb +10', () => {
  const temak = osszesit({
    javaslatok: [
      { kifejezes: 'gemini prompt for headshot', hely: 0, mag: 'a' }, { kifejezes: 'gemini trending photo prompt', hely: 0, mag: 'b' },
      { kifejezes: 'gemini make a video', hely: 0, mag: 'c' }, { kifejezes: 'gemini write an email', hely: 0, mag: 'd' },
      { kifejezes: 'chatgpt paraphrase', hely: 9, mag: 'e' }
    ],
    eszkozok: ESZK, magok: [], meglevoCimek: []
  });
  assert.equal(temak.filter(x => x.eszkoz === 'Gemini').length, 2);
  assert.ok(temak.some(x => x.eszkoz === 'ChatGPT'));
  const ot = osszesit({ javaslatok: ['a', 'b', 'c', 'd', 'e'].map(m => ({ kifejezes: 'chatgpt paraphrase', hely: 2, mag: m })), eszkozok: ESZK, magok: [], meglevoCimek: [] });
  assert.equal(ot[0].pont, 8 + 10);
});

await ta('javítás M2: 5xx-nél a Google-forrás megáll', async () => {
  let hivas = 0;
  const r = await googleJavaslatok(['a', 'b'], { fetchFn: async () => { hivas++; return { status: 503, ok: false, text: async () => '' }; }, alvas: async () => {} });
  assert.equal(hivas, 1);
  assert.match(r.hiba, /szerverhiba/);
});

t('javítás M1: üres + hibás gyűjtés nem írja felül a tegnapi nem üres listát', () => {
  const regi = { at: 'x', temak: [{ kifejezes: 'a b' }], hibak: [] };
  const ures = { at: 'y', temak: [], hibak: ['Google-javaslat: HTTP 429'] };
  assert.equal(mentendo(ures, regi), regi);
  assert.equal(mentendo(ures, null), ures);
  assert.equal(mentendo({ at: 'y', temak: [], hibak: [] }, regi).at, 'y');
  const uj = { at: 'z', temak: [{ kifejezes: 'c d' }], hibak: ['x'] };
  assert.equal(mentendo(uj, regi), uj);
});

import { readFileSync as rfs } from 'node:fs';
const forras = p => rfs(new URL('../' + p, import.meta.url), 'utf-8').replace(/\r\n/g, '\n');
const TR = { at: new Date(MOST).toISOString(), datum: '2026-10-14', temak: [
  { kifejezes: 'gemini trending photo prompt', forras: ['google-javaslat'], pont: 25, eszkoz: 'Gemini' },
  { kifejezes: 'can ai help with daily tasks', forras: ['bing-lehetoseg'], pont: 10, eszkoz: '' }
] };

t('hír-sorrend: a trendhez illő draft ELŐRE, a többi sorrendje változatlan; trend nélkül semmi nem változik', () => {
  const cimek = { a: 'OpenAI ships new ChatGPT voice', b: 'Google brings new photo tricks to Gemini app', c: 'SAP finance suite update', d: 'How AI can help with daily tasks at home' };
  assert.deepEqual(trendElore(['a', 'b', 'c', 'd'], TR, f => cimek[f]), ['b', 'd', 'a', 'c']);
  assert.deepEqual(trendElore(['a', 'b'], null, f => cimek[f]), ['a', 'b']);
  assert.deepEqual(trendElore(['x'], TR, () => { throw new Error('sérült draft'); }), ['x']);
  assert.equal(trendTalalat('SAP finance suite update', TR), null);
  assert.equal(trendTalalat('Gemini gets a photo editor', TR), 'gemini trending photo prompt');
});

t('útmutató-hely: napi 1 trend-téma; ha ma már készült trend-útmutató, nincs több', () => {
  const ma = '2026-10-14';
  const topics = [{ id: 'k', status: 'todo', level: 'intermediate' }, { id: 'tr', status: 'todo', priority: 'trend' }, { id: 'kesz', status: 'done', priority: 'trend' }];
  assert.equal(maiTrendTema(topics, [], ma).id, 'tr');
  const metak = [{ trend: { kifejezes: 'x' }, written_at: ma + 'T03:00:00Z' }];
  assert.equal(maiTrendDb(metak, ma), 1);
  assert.equal(maiTrendTema(topics, metak, ma), null);
  assert.equal(maiTrendTema([{ id: 'k', status: 'todo' }], [], ma), null);
});

t('🔴 Review Focus 5: téma-felvétel naponta egyszer — sikertelen ötletelés után sem próbál újra aznap; 30 napig nem ismétel', () => {
  const store = { topics: [] };
  const elso = trendFelvetelKell(store, TR, MOST);
  assert.equal(elso.kifejezes, 'gemini trending photo prompt');
  store.trend_proba = trendProbaJegyez(store.trend_proba, elso.kifejezes, MOST);
  assert.equal(trendFelvetelKell(store, TR, MOST + 3600e3), null, '🔴 ugyanazon a napon újra AI-hívás menne');
  const holnap = trendFelvetelKell(store, TR, MOST + NAP);
  assert.equal(holnap.kifejezes, 'can ai help with daily tasks', 'a már kipróbált kifejezés 30 napig nem jön újra');
  assert.equal(trendFelvetelKell({ topics: [{ priority: 'trend', status: 'todo' }] }, TR, MOST), null, 'ha már vár egy trend-téma, ne halmozzon');
  assert.equal(trendFelvetelKell({ topics: [] }, null, MOST), null);
  assert.equal(kovetkezoTrendTema(TR, [{ kifejezes: 'gemini trending photo prompt', at: new Date(MOST - 40 * NAP).toISOString() }], MOST).kifejezes, 'gemini trending photo prompt', '30 nap után újra jöhet');
  assert.equal(trendProbaJegyez(null, 'x', MOST).length, 1);
});

t('ötletelő-prompt: a kifejezés benne van, összehasonlítást tilt, csak létező funkció', () => {
  const p = trendPrompt(TR.temak[0]);
  assert.match(p, /"gemini trending photo prompt"/);
  assert.match(p, /using Gemini/);
  assert.match(p, /No comparisons/);
  assert.match(p, /Only describe features that really exist/);
  assert.equal(trendPrompt(null), '');
});

t('🔌 Író: a draftok trend szerint rendezve, a cikk _meta.trend-et kap', () => {
  const s = forras('agents/iro/agent.js');
  assert.match(s, /import \{ aktivTrendek, trendElore, trendTalalat \} from '\.\.\/\.\.\/core\/trend-kutato\.js';/);
  assert.match(s, /trendElore\(rendezve, T, f => JSON\.parse\(readFileSync\(join\(DRAFTS_DIR, f\), 'utf-8'\)\)\.title\)/);
  assert.match(s, /trend: trendJeloles\(lista\),/);
});

t('🔌 Útmutató-agent: felvétel naponta 1, a középszintű MARAD, a trend utána jön (az általános hely helyére)', () => {
  const s = forras('agents/guide/agent.js');
  assert.match(s, /import \{ aktivTrendek, trendFelvetelKell, trendProbaJegyez, maiTrendTema, trendPrompt \} from '\.\.\/\.\.\/core\/trend-kutato\.js';/);
  assert.match(s, /szintSorrend\(fk\.tobbi\.filter\(t => t\.priority !== 'trend'\), \{ maiKozep: fk\.maiKozep, be: kozepBe \}\)/,
    '🔴 a középszintű szabálya változott, vagy a nem választott trend-téma az általános sorba csúszna');
  assert.match(s, /out\.push\(rendezett\.shift\(\)\);\n(?:\s*\/\/[^\n]*\n)*\s*const trendTema = out\.length < args\.limit \? maiTrendTema\(fk\.tobbi, metak, maNap\) : null;/,
    '🔴 a trend nem a középszintű UTÁN jön (user 10-14: „a középszintű maradjon")');
  assert.ok(!/trendMa/.test(s), '🔴 a trend kiszorítaná a középszintűt');
  assert.match(s, /const tema = trendFelvetelKell\(store, aktivTrendek\(\), Date\.now\(\)\);/);
  assert.match(s, /store\.trend_proba = trendProbaJegyez\(store\.trend_proba, tema\.kifejezes, Date\.now\(\)\);/);
  assert.match(s, /\{ generalOnly = false, fokusz = null, trend = null \} = \{\}/);
  assert.match(s, /proposed_by: trend \? 'trend-kutato' : 'guide-ideas'/);
  assert.match(s, /trend: topic\.trend \|\| null,/);
});

t('riport: a 3 legjobb téma forrással; kiesett forrás ⚠️; régi lista ⚠️; régi Bing-lista 🔁; még nem futott → csend', () => {
  const s = trendRiportSorok({ ...TR, hibak: ['Google-javaslat: HTTP 429 (letiltott)'] }, { frissitve: '2026-10-14' }, MOST);
  assert.equal(s[0], '📈 Trend ma: gemini trending photo prompt (Google-javaslat) · can ai help with daily tasks (Bing)');
  assert.equal(s[1], '⚠️ Trendforrás kiesett: Google-javaslat: HTTP 429 (letiltott)');
  assert.equal(s.length, 2);
  assert.match(trendRiportSorok(TR, null, MOST + 3 * NAP)[0], /^⚠️ Trendkutató: a lista 3 napja nem frissült/);
  assert.match(trendRiportSorok(TR, { frissitve: '2026-08-01' }, MOST).at(-1), /^🔁 Bing AI-lehetőség lista régi \(\d+ nap\)/);
  assert.deepEqual(trendRiportSorok(null, null, MOST), []);
  assert.equal(trendRiportSorok({ ...TR, temak: [] }, null, MOST)[0], '📈 Trend ma: nincs a szűrőn átjutó téma');
});

t('mérés: az első 7 nap belépői, trend vs többi, útmutató és hír külön; a 7 napja még nem teljes cikk kimarad', () => {
  const nap = n => new Date(MOST - n * NAP).toISOString().slice(0, 10);
  const days = {};
  for (let i = 0; i <= 30; i++) days[nap(i)] = [];
  days[nap(20)].push({ path: '/article/tr1', visits: 12 }, { path: '/article/sima', visits: 2 }, { path: '/hu/article/tr1', visits: 3 });
  const cikkek = [
    { slug: 'tr1', published_at: new Date(MOST - 21 * NAP).toISOString(), guide: true, trend: true },
    { slug: 'sima', published_at: new Date(MOST - 21 * NAP).toISOString(), guide: true, trend: false },
    { slug: 'friss', published_at: new Date(MOST - 2 * NAP).toISOString(), guide: true, trend: true },
    { slug: 'regi', published_at: new Date(MOST - 29 * NAP).toISOString(), guide: false, trend: false }
  ];
  const m = trendMeres({ cikkek, days, kezdet: nap(25), now: MOST });
  assert.deepEqual(m.utmutato.trend, { db: 1, atlag: 15, median: 15 });
  assert.deepEqual(m.utmutato.tobbi, { db: 1, atlag: 2, median: 2 });
  assert.deepEqual(m.hir.tobbi, { db: 0, atlag: 0, median: 0 }, 'a kezdet előtti cikk nem számít');
});

t('🔌 napi riport és CI: a riport a trendsorokat kiírja; a CI-lépés a Pipeline ELŐTT, || true-val, 3 perces kerettel', () => {
  const dr = forras('core/daily-report.js');
  assert.match(dr, /trendRiportSorok\(trendekBetolt\(\), bingListaBetolt\(\), Date\.now\(\)\)/);
  const yml = forras('.github/workflows/auto.yml');
  assert.match(yml, /- name: Trendkutató \(napi 1×, ingyenes\)\n\s*timeout-minutes: 3\n\s*run: node core\/trend-kutato\.js \|\| true/);
  assert.ok(yml.indexOf('node core/trend-kutato.js') < yml.indexOf('node agents/ceo/agent.js'), '🔴 a trend a CEO UTÁN gyűjtene — aznap már késő');
});

console.log('\n✅ trend-kutato.test: mind a ' + pass + ' eset rendben');
