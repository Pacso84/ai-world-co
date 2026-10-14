// core/trend-kutato.js — a napi, ingyenes trendkutató (2026-10-14, user ötlete). Hálózat nélkül:
// a fetch beadott hamisítvány.
import assert from 'node:assert/strict';
import {
  trendBeallitas, normal, eszkozBenne, marMegirt, szuro, rssTetelek, googleJavaslatok,
  googleFelkapott, sajatTopEszkozok, osszesit, frissE, aktivTrendek, rssAiE, mentendo
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

console.log('\n✅ trend-kutato.test: mind a ' + pass + ' eset rendben');
