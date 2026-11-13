// TESZT — a FÉK: jóváhagyott súgó nélküli eszközről nincs új/átírt útmutató (core/fek.js). Ingyenes, hálózat nélküli.
// Az állapotfájl-próbák ideiglenes fájlba írnak (os.tmpdir()), a repo memory/fek-allapot.json-jához NEM nyúlnak.
import assert from 'assert/strict';
import { readFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FEK_BE, fekezett, fekSzuro, fekAllapotIr, fekOsszegzo } from './fek.js';

let pass = 0, hiba = 0;
const t = (n, f) => { try { f(); pass++; console.log('  ✅ ' + n); } catch (e) { hiba++; console.log('  ❌ ' + n + '\n     ' + String(e.message).split('\n')[0]); } };
console.log('🧪 fék (TÉNYKÖZPONT 0b)\n');

const tmp = mkdtempSync(join(tmpdir(), 'fek-teszt-'));

t('a kill-switch BE van kapcsolva (FEK_BE === true)', () => {
  assert.equal(FEK_BE, true);
});

t('Meta AI / Qwen: fékezett (nincs jóváhagyott súgó)', () => {
  const r = fekezett({ tool: 'Meta AI', company: 'Meta' });
  assert.equal(r.fek, true);
  assert.equal(r.szint, 'nincs');
  assert.equal(r.eszkoz, 'Meta AI');
  assert.ok(r.ok.length > 0);
  assert.equal(fekezett({ tool: 'Qwen', company: 'Alibaba' }).fek, true);
  assert.equal(fekezett({ tool: 'Ismeretlen Eszköz', company: 'Meta' }).fek, true);   // a táblán kívüli név is „nincs”
});

t('teljes súgójú eszköz NEM fékezett', () => {
  const r = fekezett({ tool: 'ChatGPT' });
  assert.equal(r.fek, false);
  assert.equal(r.szint, 'teljes');
});

t('🔑 jóváhagyott súgócikkre épülő téma NEM fékezett, akkor sem, ha az eszköz „nincs” szintű', () => {
  const sugoUrl = 'https://help.openai.com/en/articles/12345678-example';
  const alap = { tool: 'Meta AI', company: 'Meta', official_sources: [sugoUrl] };
  const be = fekezett({ ...alap, sugo_alapu: true });
  assert.equal(be.fek, false);
  assert.equal(be.szint, 'nincs', 'a szint tájékoztató marad');
  assert.equal(be.eszkoz, 'Meta AI');
  assert.equal(be.ok, 'a téma jóváhagyott súgócikkre épül');
  assert.equal(fekezett({ ...alap, sugo_alapu: true, official_sources: [{ url: sugoUrl, title: 'Cikk' }] }).fek, false, '{url, title} alak is');
  // ugyanez súgó-jelölés nélkül fékezett (a régi kézi official_sources-ra a kivétel NEM vonatkozik)
  assert.equal(fekezett({ ...alap, sugo_alapu: false }).fek, true);
  assert.equal(fekezett(alap).fek, true);
  // nem engedélyezett URL nem számít súgónak
  assert.equal(fekezett({ ...alap, sugo_alapu: true, official_sources: ['https://example.org/help'] }).fek, true);
  assert.equal(fekezett({ ...alap, sugo_alapu: true, official_sources: [] }).fek, true);
});

t('részleges (DeepSeek) NEM fékezett — azt a 0c kapu (GUIDE_UI_NO_HELP) fogja', () => {
  const r = fekezett({ tool: 'DeepSeek' });
  assert.equal(r.fek, false);
  assert.equal(r.szint, 'reszleges');
});

t('cégfüggetlen (se eszköz, se cég) NEM fékezett', () => {
  assert.equal(fekezett({}).fek, false);
  assert.equal(fekezett({ title: 'How to write a clear prompt' }).szint, 'cegfuggetlen');
  assert.equal(fekezett(null).fek, false);
  assert.equal(fekezett(undefined).fek, false);
});

t('csak cég megadva (eszköz üres): a cég főterméke szerint', () => {
  assert.equal(fekezett({ tool: '', company: 'Meta' }).fek, true);
  assert.equal(fekezett({ tool: '-', company: 'OpenAI' }).fek, false);
});

t('a cég-katalógus (agents/guide COMPANY_CATALOG) cégei csak cégnévvel: egyedül Meta és Alibaba fékezett', () => {
  // A katalógus `tool` mezője megjelenített név („Amazon Alexa+”, „Le Chat (Mistral)”) — az eszköz-egyezés ott tévesen
  // „nincs”-et adna, ezért a katalógus-helyeken csak a céget adjuk át (agents/guide/agent.js addCompanyCoverage, runBalanceMode).
  const cegek = ['OpenAI', 'Google', 'Anthropic', 'Microsoft', 'Meta', 'Apple', 'Amazon', 'Perplexity', 'xAI', 'DeepSeek', 'Mistral',
    'Alibaba', 'Hugging Face', 'GitHub', 'Cohere', 'Moonshot AI', 'MiniMax', 'Z.ai', 'DuckDuckGo', 'Brave', 'Proton'];
  assert.deepEqual(cegek.filter(c => fekezett({ company: c }).fek), ['Meta', 'Alibaba']);});

t('a cég-katalógus MINDEN (eszköz, cég) párja ugyanazt a fék-ítéletet kapja eszközzel és csak cégnévvel', () => {
  // A katalógus az agents/guide/agent.js-ben él (importálni TILOS: feltétel nélküli main()) → a forrásszövegből olvassuk ki.
  const src = readFileSync(new URL('../agents/guide/agent.js', import.meta.url), 'utf-8');
  const blokk = src.slice(src.indexOf('const COMPANY_CATALOG = ['), src.indexOf('function normCompany'));
  const parok = [...blokk.matchAll(/\{\s*company:\s*'([^']+)',\s*tool:\s*'([^']+)'/g)].map(m => ({ company: m[1], tool: m[2] }));
  assert.equal(parok.length, 21, 'a katalógus 21 cége: ' + parok.map(p => p.company).join(', '));
  for (const p of parok) {
    assert.equal(fekezett(p).fek, fekezett({ company: p.company }).fek, p.company + ' / ' + p.tool + ': eszközzel más az ítélet, mint cégnévvel');
  }
  assert.deepEqual(parok.filter(p => fekezett(p).fek).map(p => p.company), ['Meta', 'Alibaba']);
});

t('🔴 upgrade-howtos.js frissites(): a fék SZŰRŐ a frissitendok() ELŐTT fut (különben a fékezett útmutató elvinné a napi 1 helyet)', () => {
  const src = readFileSync(new URL('../agents/iro/upgrade-howtos.js', import.meta.url), 'utf-8');
  const fv = src.slice(src.indexOf('async function frissites('), src.indexOf('async function linkEllenorzes('));
  assert.ok(fv.length > 100, 'a frissites() függvény nem található');
  const fek = fv.indexOf('fekezett({');
  const hivas = fv.indexOf('frissitendok(frissithetok');
  assert.ok(!/frissitendok\(utmutatok/.test(fv), 'a frissitendok() a szűretlen listát is megkapná');
  assert.ok(fek > 0 && hivas > 0, 'hiányzik a fék vagy a frissitendok() hívás');
  assert.ok(fek < hivas, 'a fék a frissitendok() UTÁN szűr');
  assert.match(fv, /frissitendok\(frissithetok, hirek\)/, 'a frissitendok() nem a fékkel szűrt listát kapja');
});

t('upgrade-howtos.js candidates(): az eszköz/cég a _meta-ból, ennek hiányában a frontmatterből jön (mint a frissites()-ben)', () => {
  const src = readFileSync(new URL('../agents/iro/upgrade-howtos.js', import.meta.url), 'utf-8');
  const c = src.slice(src.indexOf('function candidates()'), src.indexOf('async function main()'));
  assert.match(c, /j\._meta\?\.tool \|\| fm\('tool'\)/);
  assert.match(c, /j\._meta\?\.company \|\| fm\('company'\)/);
});

t('kill-switch próba: be:false mellett semmi sem fékezett, a szint így is látszik', () => {
  const r = fekezett({ tool: 'Meta AI', company: 'Meta' }, { be: false });
  assert.equal(r.fek, false);
  assert.equal(r.szint, 'nincs');
  assert.deepEqual(fekSzuro([{ tool: 'Meta AI', company: 'Meta' }], { be: false }), { mehet: [{ tool: 'Meta AI', company: 'Meta' }], fekezett: [] });
});

t('fekSzuro: szétválaszt és megtartja a sorrendet', () => {
  const lista = [
    { id: 'a', tool: 'ChatGPT', company: 'OpenAI' },
    { id: 'b', tool: 'Meta AI', company: 'Meta' },
    { id: 'c', tool: '', company: '' },
    { id: 'd', tool: 'Qwen', company: 'Alibaba' },
    { id: 'e', tool: 'Claude', company: 'Anthropic' },
    { id: 'f', tool: 'Midjourney', company: 'Midjourney' }
  ];
  const { mehet, fekezett: f } = fekSzuro(lista);
  assert.deepEqual(mehet.map(x => x.id), ['a', 'c', 'e']);
  assert.deepEqual(f.map(x => x.id), ['b', 'd', 'f']);
  assert.equal(mehet[0], lista[0]);   // ugyanaz az objektum, nem másolat
});

t('fekSzuro: nem tömb / üres bemenet nem dob', () => {
  assert.deepEqual(fekSzuro([]), { mehet: [], fekezett: [] });
  assert.deepEqual(fekSzuro(undefined), { mehet: [], fekezett: [] });
});

t('fekAllapotIr: ideiglenes fájlba ír, a db és az eszközök helyesek', () => {
  const fajl = join(tmp, 'also', 'fek-allapot.json');   // az almappát is létre kell hoznia
  const most = new Date('2026-11-12T10:00:00Z');
  fekAllapotIr([
    { id: 'x1', title: 'Meta téma 1', tool: 'Meta AI', company: 'Meta' },
    { id: 'x2', title: 'Meta téma 2', tool: 'Meta AI', company: 'Meta' },
    { id: 'x3', title: 'Qwen téma', tool: 'Qwen', company: 'Alibaba' }
  ], { fajl, most });
  const j = JSON.parse(readFileSync(fajl, 'utf-8'));
  assert.equal(j.at, '2026-11-12T10:00:00.000Z');
  assert.equal(j.db, 3);
  assert.deepEqual(j.eszkozok, { 'Meta AI': 2, 'Qwen': 1 });
  assert.equal(j.minta.length, 3);
  assert.deepEqual(j.minta[0], { id: 'x1', title: 'Meta téma 1', eszkoz: 'Meta AI' });
});

t('fekAllapotIr: a minta legfeljebb 10 elem; ismeretlen eszköz a megadott névvel számít', () => {
  const fajl = join(tmp, 'sok.json');
  const sok = Array.from({ length: 14 }, (_, i) => ({ id: 'i' + i, title: 'T' + i, tool: 'Valami Új', company: '' }));
  fekAllapotIr(sok, { fajl });
  const j = JSON.parse(readFileSync(fajl, 'utf-8'));
  assert.equal(j.db, 14);
  assert.equal(j.minta.length, 10);
  assert.deepEqual(j.eszkozok, { 'Valami Új': 14 });
});

t('fekAllapotIr: üres lista is frissíti az „at”-ot (az őrszem lássa, hogy a fék élt)', () => {
  const fajl = join(tmp, 'ures.json');
  fekAllapotIr([], { fajl, most: new Date('2026-11-12T12:00:00Z') });
  const j = JSON.parse(readFileSync(fajl, 'utf-8'));
  assert.equal(j.db, 0);
  assert.deepEqual(j.eszkozok, {});
  assert.deepEqual(j.minta, []);
  assert.ok(j.at);
});

t('fekAllapotIr: sosem dob (nem írható hely, rossz bemenet)', () => {
  const fajlnakAlmappa = join(tmp, 'fajl-van-itt');
  writeFileSync(fajlnakAlmappa, 'x');   // fájl, nem mappa → az almappa-létrehozás elbukik
  fekAllapotIr([{ id: 'a', tool: 'Meta AI' }], { fajl: join(fajlnakAlmappa, 'x', 'y.json') });
  fekAllapotIr(null, { fajl: join(tmp, 'null.json') });
  fekAllapotIr([null, undefined, 5], { fajl: join(tmp, 'rossz.json') });
});

t('fekOsszegzo: eszközök csökkenő sorrendben, döntetlennél ábécé, legfeljebb 5 név', () => {
  assert.equal(fekOsszegzo([]), '🧯 Fék: 0 téma vár hivatalos súgóra');
  const k = (tool, db) => Array.from({ length: db }, () => ({ tool }));
  assert.equal(fekOsszegzo([...k('Qwen', 1), ...k('Meta AI', 2)]), '🧯 Fék: 3 téma vár hivatalos súgóra (Meta AI 2, Qwen 1)');
  assert.equal(fekOsszegzo([...k('B', 1), ...k('A', 1)]), '🧯 Fék: 2 téma vár hivatalos súgóra (A 1, B 1)');
  const hat = ['A', 'B', 'C', 'D', 'E', 'F'].flatMap(n => k(n, 1));
  assert.equal(fekOsszegzo(hat), '🧯 Fék: 6 téma vár hivatalos súgóra (A 1, B 1, C 1, D 1, E 1…)');
});

rmSync(tmp, { recursive: true, force: true });
console.log(`\n${hiba ? '❌' : '✅'} ${pass}/${pass + hiba} teszt${hiba ? ' — ' + hiba + ' BUKOTT' : ' sikeres'}`);
if (hiba) process.exit(1);
