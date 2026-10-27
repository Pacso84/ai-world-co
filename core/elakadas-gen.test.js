// core/elakadas-gen.js — a „🔧 Ha elakadsz” napi generátor (2026-10-26). Ingyenes, hálózat nélküli:
// a modell- és letöltés-hívások beinjektált hamisítványok, állapotfájlt nem érint.
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  NAPI_PLAFON, NAPI_HATAR, FUTASONKENT_MAX, UJRAPROBA_NAP, UJ_NAP, NYELVEK,
  utmutatoAdat, cikkSzoveg, sorrend, forditasPrompt, forditasErtelmez, dobozHash, keretOk, cikkJelol, feldolgoz, ATMENETI_NAP, jelolendok, kor
} from './elakadas-gen.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let hiba = 0;
const t = (nev, fn) => {
  const zar = e => { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); };
  try { const r = fn(); if (r && typeof r.then === 'function') return r.then(() => console.log('  ✅ ' + nev), zar); console.log('  ✅ ' + nev); }
  catch (e) { zar(e); }
};

console.log('\n🧪 elakadas-gen');

const NAP = 86400000;
const NOW = Date.parse('2026-10-26T12:00:00Z');
const nap = d => new Date(NOW - d * NAP).toISOString();
const U = (slug, pub) => ({ slug, published_at: pub });
const FAJL_KESZ = (slug, extra = {}) => ({ slug, probalva: nap(1), doboz: { keszult: nap(1), enHash: 'x', forrasok: {}, en: [{}], hu: [{}], es: [{}] }, ...extra });

// ── állandók ───────────────────────────────────────────────────────────────────────────
t('állandók: a brief értékei', () => {
  assert.equal(NAPI_PLAFON, 0.10); assert.equal(NAPI_HATAR, 0.60); assert.equal(FUTASONKENT_MAX, 10);
  assert.equal(UJRAPROBA_NAP, 30); assert.equal(UJ_NAP, 3); assert.deepEqual(NYELVEK, ['hu', 'es']);
});

// ── sorrend ────────────────────────────────────────────────────────────────────────────
t('sorrend (a): az UJ_NAP-nál frissebb, fájl nélküli útmutató elöl, akkor is, ha kevesebb látogatója van', () => {
  const r = sorrend({
    utmutatok: [U('regi-nepszeru', nap(40)), U('uj', nap(1)), U('regi-masik', nap(50))],
    kesz: {}, latogatas: new Map([['regi-nepszeru', 99], ['uj', 0], ['regi-masik', 5]]), now: NOW, n: 10
  });
  assert.deepEqual(r.map(x => x.slug), ['uj', 'regi-nepszeru', 'regi-masik']);
  assert.ok(r.every(x => x.feladat === 'general'));
});

t('sorrend (a): a több új közül a legfrissebb az első; a pont UJ_NAP-os már nem új', () => {
  const r = sorrend({
    utmutatok: [U('a', nap(2)), U('b', nap(0.5)), U('c', nap(UJ_NAP)), U('d', nap(10))],
    kesz: {}, latogatas: new Map([['c', 50], ['d', 1]]), now: NOW, n: 10
  });
  assert.deepEqual(r.map(x => x.slug), ['b', 'a', 'c', 'd']);
});

t('sorrend (b): a fájl nélküliek látogatás szerint csökkenőben; egyenlőnél a frissebb', () => {
  const r = sorrend({
    utmutatok: [U('a', nap(30)), U('b', nap(31)), U('c', nap(32)), U('d', nap(20))],
    kesz: {}, latogatas: new Map([['a', 3], ['b', 9], ['c', 3]]), now: NOW, n: 10
  });
  assert.deepEqual(r.map(x => x.slug), ['b', 'a', 'c', 'd']);
});

t('sorrend (c): a kész dobozú (mindhárom nyelv) fájl kimarad', () => {
  const r = sorrend({ utmutatok: [U('kesz', nap(20)), U('nincs', nap(21))], kesz: { kesz: FAJL_KESZ('kesz') }, latogatas: new Map(), now: NOW, n: 10 });
  assert.deepEqual(r.map(x => x.slug), ['nincs']);
});

t('sorrend (d): doboz:null és < 30 nap → kimarad; ≥ 30 nap → újra general', () => {
  const kesz = {
    friss: { slug: 'friss', probalva: nap(UJRAPROBA_NAP - 1), doboz: null },
    regi: { slug: 'regi', probalva: nap(UJRAPROBA_NAP), doboz: null },
    nagyonregi: { slug: 'nagyonregi', probalva: nap(90), doboz: null }
  };
  const r = sorrend({ utmutatok: [U('friss', nap(40)), U('regi', nap(41)), U('nagyonregi', nap(42))], kesz, latogatas: new Map(), now: NOW, n: 10 });
  assert.deepEqual(r.map(x => x.slug).sort(), ['nagyonregi', 'regi']);
  assert.ok(r.every(x => x.feladat === 'general'));
});

t('sorrend (d): a hibás probalva dátumú null-fájl újrapróbálható (nem ragad be örökre)', () => {
  const r = sorrend({ utmutatok: [U('x', nap(40))], kesz: { x: { slug: 'x', probalva: 'hibas', doboz: null } }, latogatas: new Map(), now: NOW, n: 10 });
  assert.deepEqual(r.map(x => x.slug), ['x']);
});

t('sorrend (e): megvan a doboz, de hu VAGY es null → fordit, és a generálandók UTÁN', () => {
  const f1 = FAJL_KESZ('csakhu'); f1.doboz.es = null;
  const f2 = FAJL_KESZ('csakes'); f2.doboz.hu = null;
  const f3 = FAJL_KESZ('semmi'); f3.doboz.hu = null; f3.doboz.es = null;
  const r = sorrend({
    utmutatok: [U('csakhu', nap(5)), U('csakes', nap(6)), U('semmi', nap(7)), U('uj-gen', nap(60))],
    kesz: { csakhu: f1, csakes: f2, semmi: f3 }, latogatas: new Map([['csakhu', 100], ['uj-gen', 0]]), now: NOW, n: 10
  });
  assert.equal(r[0].slug, 'uj-gen'); assert.equal(r[0].feladat, 'general');
  assert.deepEqual(r.slice(1).map(x => x.feladat), ['fordit', 'fordit', 'fordit']);
  assert.deepEqual(r.slice(1).map(x => x.slug), ['csakhu', 'csakes', 'semmi']);   // látogatás szerint, majd frissebb
});

t('sorrend (f): legfeljebb n elem; a fordítás szorul ki először', () => {
  const f1 = FAJL_KESZ('fo'); f1.doboz.hu = null;
  const r = sorrend({ utmutatok: [U('a', nap(10)), U('b', nap(11)), U('fo', nap(12))], kesz: { fo: f1 }, latogatas: new Map(), now: NOW, n: 2 });
  assert.equal(r.length, 2); assert.ok(r.every(x => x.feladat === 'general'));
  assert.equal(sorrend({ utmutatok: [U('a', nap(10))], kesz: {}, latogatas: new Map(), now: NOW, n: 0 }).length, 0);
});

t('sorrend: a kesz Map is jó; látogatás nélkül (üres napló) a published_at dönt, nem dob', () => {
  const r = sorrend({ utmutatok: [U('a', nap(10)), U('b', nap(20))], kesz: new Map([['a', FAJL_KESZ('a')]]), latogatas: undefined, now: NOW, n: 5 });
  assert.deepEqual(r.map(x => x.slug), ['b']);
});

// ── dobozHash ──────────────────────────────────────────────────────────────────────────
const EN = [
  { symptom: 'Upload fails', why: 'The file is too large.', fix: 'Split the file into smaller files.', source: 'https://help.openai.com/en/articles/1-a' },
  { symptom: 'Chart is missing', why: 'Charts need data analysis.', fix: 'Ask for a bar chart.', source: 'https://help.openai.com/en/articles/2-b', prompt: '"Make a chart"' }
];
t('dobozHash: azonosra azonos, egy betűre más, hex sha1; a prompt nem számít bele', () => {
  const h = dobozHash(EN);
  assert.match(h, /^[0-9a-f]{40}$/);
  assert.equal(dobozHash(JSON.parse(JSON.stringify(EN))), h);
  const b = JSON.parse(JSON.stringify(EN)); b[1].fix = 'Ask for a bar chart!';
  assert.notEqual(dobozHash(b), h);
  const c = JSON.parse(JSON.stringify(EN)); c[0].prompt = '"valami"';
  assert.equal(dobozHash(c), h);
});

// ── keretOk ────────────────────────────────────────────────────────────────────────────
t('keretOk: 0,60 összes → nem; 0,10 doboz-költés → nem; 0,59 / 0,09 → igen', () => {
  assert.equal(keretOk({ napiOsszes: 0.60, elakadasMa: 0 }), false);
  assert.equal(keretOk({ napiOsszes: 0.9, elakadasMa: 0 }), false);
  assert.equal(keretOk({ napiOsszes: 0, elakadasMa: 0.10 }), false);
  assert.equal(keretOk({ napiOsszes: 0.59, elakadasMa: 0.09 }), true);
  assert.equal(keretOk({ napiOsszes: 0, elakadasMa: 0 }), true);
});

// ── forditasPrompt / forditasErtelmez ──────────────────────────────────────────────────
t('forditasPrompt: angol rendszerprompt, célnyelv megnevezve, a source nem megy a modellnek', () => {
  const hu = forditasPrompt(EN, 'hu'), es = forditasPrompt(EN, 'es');
  assert.match(hu.rendszer, /Hungarian/); assert.match(es.rendszer, /Spanish/);
  assert.match(hu.rendszer, /STRICT JSON|strict JSON/i); assert.match(hu.rendszer, /same number|exactly \d|same order/i);
  assert.match(hu.felhasznalo, /Upload fails/);
  assert.doesNotMatch(hu.felhasznalo, /help\.openai\.com/);
  assert.doesNotMatch(hu.felhasznalo, /Make a chart/, 'a prompt-mezőt nem fordítjuk');
  // 10-27 előnézet: az oldal tegez (hu) / tú-formát használ (es) — a fordító se magázzon
  assert.match(hu.rendszer, /informal "te" form/); assert.match(hu.rendszer, /never the formal/);
  assert.match(es.rendszer, /informal "tú" form/); assert.match(es.rendszer, /never "usted"/);
});

const HU_JO = JSON.stringify({ items: [
  { symptom: 'A feltöltés nem sikerül', why: 'A fájl túl nagy.', fix: 'Oszd kisebb fájlokra.' },
  { symptom: 'Hiányzik a diagram', why: 'A diagramhoz adatelemzés kell.', fix: 'Kérj oszlopdiagramot.' }] });

t('forditasErtelmez: helyes JSON → tételek, a source az EREDETIBŐL jön', () => {
  const r = forditasErtelmez(HU_JO, EN);
  assert.equal(r.length, 2);
  assert.equal(r[0].symptom, 'A feltöltés nem sikerül');
  assert.deepEqual(r.map(x => x.source), EN.map(x => x.source));
  assert.ok(r.every(x => !('prompt' in x)));
  const kamu = JSON.stringify({ items: [{ symptom: 'a', why: 'b', fix: 'c', source: 'https://evil.example/x' }, { symptom: 'd', why: 'e', fix: 'f' }] });
  assert.deepEqual(forditasErtelmez(kamu, EN).map(x => x.source), EN.map(x => x.source));
});

t('forditasErtelmez: ```json burok és körítő szöveg elfogadva', () => {
  assert.equal(forditasErtelmez('```json\n' + HU_JO + '\n```', EN).length, 2);
  assert.equal(forditasErtelmez('Itt a fordítás:\n' + HU_JO, EN).length, 2);
});

t('forditasErtelmez: eltérő darabszám / nem JSON / nincs items → null', () => {
  const egy = JSON.stringify({ items: [{ symptom: 'a', why: 'b', fix: 'c' }] });
  const harom = JSON.stringify({ items: [1, 2, 3].map(() => ({ symptom: 'a', why: 'b', fix: 'c' })) });
  for (const s of [egy, harom, 'nem json', '', null, '{}', JSON.stringify({ items: 'x' })]) assert.equal(forditasErtelmez(s, EN), null);
});

t('forditasErtelmez: üres / hiányzó / nem szöveg mező → null', () => {
  const valt = (i, mezo, ertek) => { const o = JSON.parse(HU_JO); if (ertek === undefined) delete o.items[i][mezo]; else o.items[i][mezo] = ertek; return JSON.stringify(o); };
  for (const [i, m, v] of [[0, 'why', ''], [1, 'fix', '   '], [0, 'symptom', undefined], [1, 'why', 5], [0, 'fix', null]]) {
    assert.equal(forditasErtelmez(valt(i, m, v), EN), null, `${i}.${m}=${v}`);
  }
});

t('forditasErtelmez: URL, link vagy „<” a szövegben → null', () => {
  for (const rossz of ['Lásd https://evil.example/x', 'www.evil.example', 'Nyisd meg a <b>Beállítások</b> menüt', '[ide](http://x)']) {
    const o = JSON.parse(HU_JO); o.items[1].fix = rossz;
    assert.equal(forditasErtelmez(JSON.stringify(o), EN), null, rossz);
  }
});

t('forditasErtelmez: angolul maradt szöveg (bodyLooksUntranslated) → null', () => {
  const angol = 'You can upload the files with this tool and the results will be shown for you when the analysis is done. ' +
    'Ask for what you need and the chart will be created from your data for the next steps that you want to take.';
  const o = JSON.parse(HU_JO); o.items[0].why = angol; o.items[0].fix = angol;
  assert.equal(forditasErtelmez(JSON.stringify(o), EN), null);
});

t('forditasErtelmez: a mezők túl hosszúak (elszabadult modell) → null', () => {
  const o = JSON.parse(HU_JO); o.items[0].fix = 'a '.repeat(2000);
  assert.equal(forditasErtelmez(JSON.stringify(o), EN), null);
});

// ── cikkJelol ──────────────────────────────────────────────────────────────────────────
t('cikkJelol: CRLF-et és a végi újsor hiányát megtartja; csak az elakadas_at kerül be; meglévőt nem írja felül', () => {
  const j = { _meta: { slug: 's', type: 'guide' }, article_markdown: '# T\nszöveg ő' };
  const crlf = JSON.stringify(j, null, 2).replace(/\n/g, '\r\n');
  const ki = cikkJelol(crlf, '2026-10-26T12:00:00.000Z');
  assert.equal(ki.split('\r\n').length, ki.split('\n').length, 'minden sor CRLF maradt');
  const p = JSON.parse(ki);
  assert.equal(p._meta.elakadas_at, '2026-10-26T12:00:00.000Z');
  assert.deepEqual({ ...p._meta, elakadas_at: undefined }, { ...j._meta, elakadas_at: undefined });
  assert.equal(p.article_markdown, j.article_markdown);
  assert.ok(!ki.endsWith('\n'));
  const lf = cikkJelol(JSON.stringify(j, null, 2) + '\n', '2026-10-26T12:00:00.000Z');
  assert.ok(!lf.includes('\r') && lf.endsWith('}\n'));
  assert.equal(cikkJelol(ki, '2030-01-01T00:00:00.000Z'), null, 'már megjelölt → nincs mit írni');
  assert.equal(cikkJelol('nem json', 'x'), null);
});

// ── utmutatoAdat ───────────────────────────────────────────────────────────────────────
t('utmutatoAdat: cím, lépések (Step N: előtag nélkül), Common mistakes', () => {
  const md = '# How to analyse files with ChatGPT\n\nBevezető.\n\n## Step 1: Upload your spreadsheet\nszöveg\n\n## Step 2 — Ask for a summary\nszöveg\n\n## Common mistakes\n- Rossz fájl\n- Rossz oszlop\n\n## Final thoughts\nvég';
  const u = utmutatoAdat({ _meta: { slug: 'sl', tool: 'ChatGPT', company: 'OpenAI' }, article_markdown: md });
  assert.deepEqual(u.lepesek, ['Upload your spreadsheet', 'Ask for a summary']);
  assert.equal(u.cim, 'How to analyse files with ChatGPT');
  assert.equal(u.slug, 'sl'); assert.equal(u.tool, 'ChatGPT'); assert.equal(u.eszkoz, 'ChatGPT'); assert.equal(u.company, 'OpenAI');
  assert.match(u.hibak, /Rossz fájl/); assert.doesNotMatch(u.hibak, /Final/);
  const ures = utmutatoAdat({ _meta: { slug: 'x' }, article_markdown: 'nincs cím' });
  assert.equal(ures.cim, 'x'); assert.deepEqual(ures.lepesek, []); assert.equal(ures.hibak, ''); assert.equal(ures.tool, '');
});

// ── cikkSzoveg (hamis fetch) ───────────────────────────────────────────────────────────
await t('cikkSzoveg: cím + olvasható szöveg; hiba / nem 200 → null', async () => {
  const html = '<html><head><title>Uploading files &amp; sheets | OpenAI Help Center</title><script>x=1</script></head><body><nav>menü</nav><p>Upload up to 80 files.</p></body></html>';
  const jo = await cikkSzoveg('https://x', async () => ({ ok: true, text: async () => html }));
  assert.equal(jo.cim, 'Uploading files & sheets');
  assert.match(jo.szoveg, /Upload up to 80 files/); assert.doesNotMatch(jo.szoveg, /menü|x=1/);
  assert.equal(await cikkSzoveg('https://x', async () => ({ ok: false, text: async () => '' })), null);
  assert.equal(await cikkSzoveg('https://x', async () => { throw new Error('háló'); }), null);
});

// ── feldolgoz (beinjektált hamis modell + letöltés) ────────────────────────────────────
const U1 = 'https://help.openai.com/en/articles/8555545-file-uploads-faq';
const FORRAS1 = 'File uploads FAQ. You can upload up to 80 files every 3 hours. Each file can be up to 512 MB. ' +
  'If the result seems incomplete, ask ChatGPT to inspect specific sheets, rows, columns, or sections, or split the file into smaller files. ' +
  'Spreadsheets with many sheets may be summarized only partially. ' +
  'Uploaded files are available in the chat where you added them. Supported formats include spreadsheets, documents, presentations, and text files. ' +
  'You can remove an uploaded file from the conversation at any time.';
const UTM = {
  slug: 'sl', tool: 'ChatGPT', company: 'OpenAI', cim: 'How to analyse files and spreadsheets with ChatGPT', eszkoz: 'ChatGPT',
  lepesek: ['Upload your spreadsheet', 'Ask for a summary of the sheets'], hibak: 'Forgetting to name the column.'
};
const MODELL_VALASZ = JSON.stringify({ items: [
  { symptom: 'The result seems incomplete', why: 'Spreadsheets with many sheets may be summarized only partially.', fix: 'Ask ChatGPT to inspect specific sheets, rows, columns, or sections.', source: U1 },
  { symptom: 'The upload of many files fails', why: 'You can upload up to 80 files every 3 hours.', fix: 'Split the file into smaller files.', source: U1 }] });

function ctxEpit(felulir = {}) {
  const hivasok = [];
  const ctx = {
    utm: UTM, fajl: null, now: NOW, be: true, hivasok, koltsegek: [],
    indexek: {}, indexLetolt: async () => [{ url: U1, cim: 'Upload spreadsheet files and analyze sheets with ChatGPT file uploads FAQ' }],
    cikkSzoveg: async url => ({ szoveg: FORRAS1, cim: 'File uploads FAQ' }),
    keret: () => true,
    koltseg: usd => ctx.koltsegek.push(usd),
    ask: async (prompt, opt) => {
      hivasok.push(opt.agentName);
      if (opt.agentName === 'elakadas') return { text: MODELL_VALASZ, costUsd: 0.01 };
      const nyelv = /Hungarian/.test(opt.systemPrompt) ? 'hu' : 'es';
      return { text: JSON.stringify({ items: [
        { symptom: nyelv + ' tünet egy', why: nyelv + ' ok egy', fix: nyelv + ' megoldás egy' },
        { symptom: nyelv + ' tünet kettő', why: nyelv + ' ok kettő', fix: nyelv + ' megoldás kettő' }] }), costUsd: 0.002 };
    },
    ...felulir
  };
  return ctx;
}

await t('feldolgoz general: doboz + mindkét fordítás, hash, forrás-cím, költség mind elszámolva', async () => {
  const c = ctxEpit();
  const r = await feldolgoz({ slug: 'sl', feladat: 'general' }, c);
  assert.equal(r.uj, true);
  assert.equal(r.forditva, 2);
  assert.deepEqual(c.hivasok, ['elakadas', 'translator', 'translator']);
  const d = r.fajl.doboz;
  assert.equal(r.fajl.slug, 'sl'); assert.ok(r.fajl.probalva);
  assert.equal(d.en.length, 2); assert.equal(d.hu.length, 2); assert.equal(d.es.length, 2);
  assert.equal(d.enHash, dobozHash(d.en));
  assert.deepEqual(d.forrasok, { [U1]: 'File uploads FAQ' });
  assert.ok(d.hu.every((x, i) => x.source === d.en[i].source));
  assert.ok(Math.abs(c.koltsegek.reduce((a, b) => a + b, 0) - 0.014) < 1e-9);
});

await t('feldolgoz general: a modell nem ad igazolható tételt → {doboz:null, probalva}, fordítás nincs', async () => {
  const c = ctxEpit({ ask: async (p, o) => { c.hivasok.push(o.agentName); return { text: JSON.stringify({ items: [] }), costUsd: 0.01 }; } });
  const r = await feldolgoz({ slug: 'sl', feladat: 'general' }, c);
  assert.equal(r.uj, false);
  assert.equal(r.fajl.doboz, null); assert.ok(r.fajl.probalva);
  assert.deepEqual(c.hivasok, ['elakadas']);
});

await t('feldolgoz general: kill-switch (be=false) → doboz:null, modellhívás sincs', async () => {
  const c = ctxEpit({ be: false });
  const r = await feldolgoz({ slug: 'sl', feladat: 'general' }, c);
  assert.deepEqual(c.hivasok, []);
  assert.equal(r.fajl, null);
});

await t('feldolgoz general: nincs jelölt → null-fájl modellhívás nélkül; letöltési/indexhiba → NEM ír fájlt (újra próbálható)', async () => {
  const c1 = ctxEpit({ indexLetolt: async () => [{ url: 'https://help.openai.com/en/articles/1-x', cim: 'Billing address' }] });
  const r1 = await feldolgoz({ slug: 'sl', feladat: 'general' }, c1);
  assert.equal(r1.fajl.doboz, null); assert.deepEqual(c1.hivasok, []);
  const c2 = ctxEpit({ indexLetolt: async () => [] });
  const r2 = await feldolgoz({ slug: 'sl', feladat: 'general' }, c2);
  assert.equal(r2.fajl, null); assert.match(r2.kimaradt, /index/); assert.equal(r2.kihagyva, true);
  // cikk-letöltési / modell-hiba: NINCS doboz, de rövid (ATMENETI_NAP) várakozás-jelölés kerül a fájlba
  const c3 = ctxEpit({ cikkSzoveg: async () => null });
  const r3 = await feldolgoz({ slug: 'sl', feladat: 'general' }, c3);
  assert.equal(r3.fajl.doboz, null); assert.equal(r3.fajl.atmeneti, true); assert.ok(r3.fajl.probalva); assert.deepEqual(c3.hivasok, []);
  const c4 = ctxEpit({ ask: async () => null });
  const r4 = await feldolgoz({ slug: 'sl', feladat: 'general' }, c4);
  assert.equal(r4.fajl.doboz, null); assert.equal(r4.fajl.atmeneti, true); assert.match(r4.kimaradt, /modell/);
  // a „nincs igazolható tétel” NEM átmeneti (30 napos várakozás)
  const c5 = ctxEpit({ ask: async () => ({ text: '{"items":[]}', costUsd: 0 }) });
  assert.ok(!(await feldolgoz({ slug: 'sl', feladat: 'general' }, c5)).fajl.atmeneti);
});

await t('feldolgoz: keret nélkül SEMMI hívás; a keret a generálás után a fordítás előtt is számít', async () => {
  const c = ctxEpit({ keret: () => false });
  const r = await feldolgoz({ slug: 'sl', feladat: 'general' }, c);
  assert.deepEqual(c.hivasok, []); assert.equal(r.fajl, null); assert.match(r.kimaradt, /keret/);
  // az első hívás után elfogy a keret: a doboz (en) mentődik, a fordítás marad null
  let db = 0;
  const c2 = ctxEpit({ keret: () => db++ < 1 });
  const r2 = await feldolgoz({ slug: 'sl', feladat: 'general' }, c2);
  assert.deepEqual(c2.hivasok, ['elakadas']);
  assert.equal(r2.uj, true); assert.equal(r2.forditva, 0);
  assert.equal(r2.fajl.doboz.en.length, 2); assert.equal(r2.fajl.doboz.hu, null); assert.equal(r2.fajl.doboz.es, null);
});

await t('feldolgoz fordit: csak a hiányzó nyelv; az en és a másik nyelv érintetlen; rossz fordítás null marad', async () => {
  const en = [{ symptom: 'S1', why: 'W1', fix: 'F1', source: U1 }, { symptom: 'S2', why: 'W2', fix: 'F2', source: U1 }];
  const hu = [{ symptom: 'h1', why: 'h1', fix: 'h1', source: U1 }, { symptom: 'h2', why: 'h2', fix: 'h2', source: U1 }];
  const fajl = { slug: 'sl', probalva: nap(2), doboz: { keszult: nap(2), enHash: dobozHash(en), forrasok: { [U1]: 'T' }, en, hu, es: null } };
  const c = ctxEpit({ fajl });
  const r = await feldolgoz({ slug: 'sl', feladat: 'fordit' }, c);
  assert.deepEqual(c.hivasok, ['translator']);
  assert.equal(r.uj, false); assert.equal(r.forditva, 1);
  assert.equal(r.fajl.doboz.es.length, 2); assert.deepEqual(r.fajl.doboz.hu, hu); assert.deepEqual(r.fajl.doboz.en, en);
  assert.equal(r.fajl.doboz.keszult, fajl.doboz.keszult);
  // rossz fordítás: marad null
  const c2 = ctxEpit({ fajl, ask: async (p, o) => { c2.hivasok.push(o.agentName); return { text: 'nem json', costUsd: 0.001 }; } });
  const r2 = await feldolgoz({ slug: 'sl', feladat: 'fordit' }, c2);
  assert.equal(r2.forditva, 0); assert.equal(r2.fajl.doboz.es, null);
  assert.equal(fajl.doboz.es, null, 'a bemeneti fájlt nem módosítja');
});

// ── 1. javítási kör (független átnézés 10-26) ───────────────────────────────────────────
const EN1 = [{ symptom: 'Upload fails in ChatGPT', why: 'The file is too large.', fix: 'Open Settings and split the file.', source: 'https://help.openai.com/en/articles/1-a' }];
const echo = items => JSON.stringify({ items: items.map(({ symptom, why, fix }) => ({ symptom, why, fix })) });

t('forditasErtelmez: a visszamásolt (angol) doboz → null, a 40 szavas küszöb alatt is (1 és 2 tétel)', () => {
  assert.equal(forditasErtelmez(echo(EN1), EN1), null);
  assert.equal(forditasErtelmez(echo(EN), EN), null);
  // kis-nagybetű, írásjel, szóköz-eltérés sem segít
  const o = JSON.parse(echo(EN1)); o.items[0].symptom = '  UPLOAD fails, in ChatGPT! '; o.items[0].why = 'the file is too large'; o.items[0].fix = 'Open  Settings and split the file';
  assert.equal(forditasErtelmez(JSON.stringify(o), EN1), null);
});

t('forditasErtelmez: ha CSAK a tünet maradt angolul (vagy csak a why/fix) → null', () => {
  const hu = { symptom: 'A feltöltés nem sikerül a ChatGPT-ben', why: 'A fájl túl nagy.', fix: 'Nyisd meg a Settings menüt, és oszd fel a fájlt.' };
  for (const mezo of ['symptom', 'why', 'fix']) {
    const o = { items: [{ ...hu, [mezo]: EN1[0][mezo] }] };
    assert.equal(forditasErtelmez(JSON.stringify(o), EN1), null, mezo + ' angolul maradt');
  }
});

t('forditasErtelmez: valódi RÖVID magyar fordítás (terméknév / menünév eredetiben) elfogadva', () => {
  const hu = { symptom: 'A feltöltés nem sikerül a ChatGPT-ben', why: 'A fájl túl nagy.', fix: 'Nyisd meg a Settings menüt, és oszd fel a fájlt.' };
  const r = forditasErtelmez(JSON.stringify({ items: [hu] }), EN1);
  assert.equal(r.length, 1); assert.equal(r[0].fix, hu.fix); assert.equal(r[0].source, EN1[0].source);
});

t('sorrend: az átmeneti hibájú fájl 1 nap után újrapróbálható (0,5 nap → kimarad, 1,5 nap → general); a sima null 30 napig vár', () => {
  assert.equal(ATMENETI_NAP, 1);
  const kesz = {
    fel: { slug: 'fel', probalva: nap(0.5), doboz: null, atmeneti: true },
    masfel: { slug: 'masfel', probalva: nap(1.5), doboz: null, atmeneti: true },
    sima: { slug: 'sima', probalva: nap(1.5), doboz: null }
  };
  const r = sorrend({ utmutatok: [U('fel', nap(40)), U('masfel', nap(41)), U('sima', nap(42))], kesz, latogatas: new Map(), now: NOW, n: 10 });
  assert.deepEqual(r.map(x => x.slug), ['masfel']);
  assert.equal(r[0].feladat, 'general');
});

await t('kor: az egyik szolgáltató indexe üres → a többi szolgáltató útmutatói feldolgozódnak, a kihagyottak nem foglalnak helyet', async () => {
  const hivasok = [], indexHivasok = [];
  const eszkoz = { o1: 'ChatGPT', o2: 'ChatGPT', o3: 'ChatGPT', g1: 'Gemini', g2: 'Gemini', g3: 'Gemini' };
  const indexek = {};
  const alap = ctxEpit();
  const sor = ['o1', 'o2', 'o3', 'g1', 'g2', 'g3'].map(slug => ({ slug, feladat: 'general' }));
  const ered = await kor(sor, {
    limit: 2, keret: () => true,
    ctxEpit: f => ({
      ...alap, indexek, utm: { ...UTM, slug: f.slug, tool: eszkoz[f.slug] },
      indexLetolt: async s => { indexHivasok.push(s); return s === 'openai' ? [] : [{ url: U1, cim: 'Upload spreadsheet files and analyze sheets with ChatGPT file uploads FAQ' }]; },
      ask: async (p, o) => { hivasok.push(o.agentName); return alap.ask(p, o); }
    })
  });
  assert.deepEqual(indexHivasok.filter(s => s === 'openai'), ['openai'], 'a letiltott szolgáltató indexét csak egyszer kérjük');
  assert.equal(hivasok.filter(x => x === 'elakadas').length, 2, 'a limit (2) a Gemini-útmutatókra jut');
  assert.equal(ered.hely, 2);
  assert.equal(ered.kimaradtOk.index, 3);
  assert.equal(ered.ujDb, 2);
});

await t('feldolgoz: a modell prompt-mezejét NEM tároljuk (a tétel alakja {symptom, why, fix, source})', async () => {
  const valasz = JSON.parse(MODELL_VALASZ); valasz.items[0].prompt = '"Check [my sheet] for incomplete results"';
  const base = ctxEpit();
  const c = ctxEpit({ ask: async (p, o) => o.agentName === 'elakadas' ? { text: JSON.stringify(valasz), costUsd: 0.01 } : base.ask(p, o) });
  const r = await feldolgoz({ slug: 'sl', feladat: 'general' }, c);
  assert.equal(r.uj, true);
  for (const x of r.fajl.doboz.en) assert.deepEqual(Object.keys(x).sort(), ['fix', 'source', 'symptom', 'why']);
  assert.equal(r.fajl.doboz.enHash, dobozHash(r.fajl.doboz.en));
});

t('jelolendok: van doboz, de a cikkből hiányzik az elakadas_at → jelölendő (nem csak az új doboznál); doboz nélkül / jelöltnél nem', () => {
  const cikk = at => ({ json: { _meta: at ? { elakadas_at: at } : {} } });
  const cikkek = { jelolt: cikk('2026-10-20T00:00:00Z'), hianyzo: cikk(), nincsdoboz: cikk(), nullfajl: cikk() };
  const kesz = {
    jelolt: { slug: 'jelolt', doboz: { keszult: '2026-10-20T00:00:00Z' } },
    hianyzo: { slug: 'hianyzo', doboz: { keszult: '2026-10-25T08:00:00.000Z' } },
    nullfajl: { slug: 'nullfajl', probalva: nap(1), doboz: null }
  };
  assert.deepEqual(jelolendok(cikkek, kesz), [{ slug: 'hianyzo', at: '2026-10-25T08:00:00.000Z' }]);
  assert.deepEqual(jelolendok(cikkek, new Map(Object.entries(kesz))), [{ slug: 'hianyzo', at: '2026-10-25T08:00:00.000Z' }]);
});

// ── bekötés (forrásszöveg) ─────────────────────────────────────────────────────────────
const FORRAS = readFileSync(join(ROOT, 'core', 'elakadas-gen.js'), 'utf-8');
const mainTest = FORRAS.slice(FORRAS.indexOf('async function main'));

t('bekötés: a main az ELAKADAS_BE-t nézi, és az ai-router importja ELŐTT kilép', () => {
  const be = mainTest.search(/if \(!ELAKADAS_BE\)/);
  const imp = mainTest.search(/import\(['"]\.\/ai-router\.js['"]\)/);
  assert.ok(be >= 0 && imp > be, 'ELAKADAS_BE-vizsgálat előbb, mint az ai-router importja');
  assert.match(mainTest.slice(be, imp), /return/);
});

t('bekötés: az ai-router / budget / traffic-log importja LUSTA (a teszt nem érint hálózatot, állapotot)', () => {
  const fej = FORRAS.slice(0, FORRAS.indexOf('async function main'));
  for (const m of ['ai-router', 'budget', 'traffic-log']) assert.doesNotMatch(fej, new RegExp(`^import .*['"]\\./${m}\\.js['"]`, 'm'), m);
});

t('bekötés: a fájlírás atomi (ideiglenes fájl + renameSync)', () => {
  assert.match(FORRAS, /renameSync/);
  assert.match(FORRAS, /writeFileSync\([^)]*\.tmp/);
});

t('bekötés: csak közvetlen futtatáskor indul (agent-modul nem importálható hibásan)', () => {
  assert.match(FORRAS, /process\.argv\[1\][^\n]*endsWith\(['"]elakadas-gen\.js['"]\)/);
});

t('bekötés: a mérés-szkript a közös utmutatoAdat/cikkSzoveg-et használja, nem a sajátját', () => {
  const m = readFileSync(join(ROOT, 'core', 'elakadas-meres.mjs'), 'utf-8');
  assert.match(m, /from '\.\/elakadas-gen\.js'/);
  assert.doesNotMatch(m, /function utmutato\(|function cikkSzoveg\(/);
});

t('config: az elakadas agent a guide modelljeivel, paid-only', () => {
  const cfg = JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf-8'));
  const a = cfg.agents.elakadas, g = cfg.agents.guide;
  assert.ok(a, 'agents.elakadas');
  assert.deepEqual(a.primary_model, { provider: 'openrouter', model: 'anthropic/claude-haiku-5.5' });
  assert.deepEqual(a.fallback_model, { provider: 'openrouter', model: 'minimax/minimax-m3' });
  assert.deepEqual(a.primary_model, g.primary_model);
  assert.equal(a.routing, 'paid-only');
  assert.ok(cfg.agents.translator);
});

// ── CI-BEKÖTÉS (Task 5, 10-27): a fordítás UTÁN, a build ELŐTT, és a hibája nem dönti el a futást ──
t('auto.yml: a doboz-gyártás a fordítás után és a build előtt fut, || true-val, kulccsal', () => {
  const yml = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '.github', 'workflows', 'auto.yml'), 'utf-8');
  const ford = yml.indexOf('node agents/translator/agent.js');
  const gen = yml.indexOf('node core/elakadas-gen.js --limit 10 || true');
  const build = yml.indexOf('run: node website/build.js');
  assert.ok(ford > 0 && gen > 0 && build > 0, 'hiányzó lépés');
  assert.ok(ford < gen && gen < build, 'a sorrend: fordítás → doboz-gyártás → build');
  const lepes = yml.slice(yml.lastIndexOf('- name:', gen), gen);
  assert.match(lepes, /OPENROUTER_API_KEY: \$\{\{ secrets\.OPENROUTER_API_KEY \}\}/);
  assert.match(lepes, /if: always\(\)/);
});

if (hiba) { console.log(`\n❌ elakadas-gen.test: ${hiba} hiba`); process.exit(1); }
console.log('\n✅ elakadas-gen.test: mind rendben');
