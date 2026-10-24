// core/elakadas.js — „🔧 Ha elakadsz” doboz: jelöltek, prompt, válasz-ellenőrzés (2026-10-24). Ingyenes, hálózat nélküli.
//
// A MÉRCE IRÁNYA: a veszély nem az, hogy egy jó tétel kimarad (akkor nincs doboz, a régi nézet marad),
// hanem hogy KITALÁLT hibaelhárítás kerül élő oldalra: nem létező menü, kitalált forrás-URL, a súgóban
// nem szereplő állítás, vagy a „Common mistakes” megismétlése. Ezeket kell biztosan kiszűrni.
import assert from 'node:assert/strict';
import {
  ELAKADAS_BE, jeloltCikkek, promptEpit, valaszErtelmez, alatamasztott, ismetliHibat, dobozKeszit
} from './elakadas.js';

const U1 = 'https://help.openai.com/en/articles/8555545-file-uploads-faq';
const U2 = 'https://help.openai.com/en/articles/8437071-data-analysis-with-chatgpt';
const U3 = 'https://help.openai.com/en/articles/6825453-chatgpt-release-notes';

const FORRAS1 = 'File uploads FAQ. You can upload up to 80 files every 3 hours. Each file can be up to 512 MB. ' +
  'If the result seems incomplete, ask ChatGPT to inspect specific sheets, rows, columns, or sections, or split the file into smaller files. ' +
  'Spreadsheets with many sheets may be summarized only partially.';
const FORRAS2 = 'Data analysis with ChatGPT. ChatGPT can create charts from your data. ' +
  'To download a chart, hover over it and select the download icon. Interactive charts support bar, line, pie, and scatter charts.';

const utm = {
  cim: 'How to analyse files and spreadsheets with ChatGPT',
  eszkoz: 'ChatGPT',
  lepesek: ['Upload your spreadsheet', 'Ask for a summary of the sheets', 'Create a chart from the data'],
  hibak: 'Uploading a scanned PDF instead of a real spreadsheet. Forgetting to name the column you want analyzed.'
};

// 1) JELÖLTEK: a releváns cikk elöl; 0 pontos nem jön; engedélyezetlen URL SOHA
{
  const index = [
    { url: U3, cim: 'ChatGPT release notes' },
    { url: 'https://help.openai.com.evil.example/en/articles/1-upload-spreadsheet-files', cim: 'Upload spreadsheet files and analyze sheets' },
    { url: 'https://community.openai.com/t/upload-spreadsheet', cim: 'Upload spreadsheet summary chart data' },
    { url: U1, cim: 'File uploads FAQ: upload limits for spreadsheet files' },
    { url: U2, cim: 'Data analysis with ChatGPT' },
    { url: 'https://help.openai.com/en/articles/1-billing', cim: 'How to change your billing address' }
  ];
  const j = jeloltCikkek(utm, index);
  assert.equal(j[0].url, U1, 'a feltöltés/táblázat cikk legyen elöl');
  assert.ok(j.some(c => c.url === U2));
  assert.ok(!j.some(c => /evil|community/.test(c.url)), 'engedélyezetlen URL nem lehet jelölt');
  assert.ok(!j.some(c => /billing/.test(c.url)), '0 pontos cikk nem jelölt');
  // az eszköz neve kisebb súlyú: a csak „ChatGPT”-t tartalmazó cím a tartalmi találat MÖGÉ kerül
  const i3 = j.findIndex(c => c.url === U3), i2 = j.findIndex(c => c.url === U2);
  assert.ok(i3 === -1 || i3 > i2, 'a csak eszköznév-találat ne előzze meg a tartalmit');
  assert.deepEqual(jeloltCikkek(utm, [{ url: U3, cim: 'ChatGPT release notes' }, { url: U2, cim: 'Chart basics' }]).map(c => c.url), [U2, U3],
    'egy tartalmi szó (1) > az eszköz neve (0,3)');
  assert.ok(j.length <= 4);
  assert.equal(jeloltCikkek(utm, index, 1).length, 1, 'az n korlát');
  assert.deepEqual(jeloltCikkek(utm, []), []);
  // stabil sorrend azonos pontnál
  const azonos = [{ url: U1, cim: 'Spreadsheet help' }, { url: U2, cim: 'Spreadsheet tips' }];
  assert.deepEqual(jeloltCikkek(utm, azonos).map(c => c.url), [U1, U2]);
}

// 2) PROMPT: minden cikk URL-je + a „Common mistakes” benne; a rendszer-prompt kimondja a JSON-alakot és az „ONLY”-t
const cikkek = [
  { url: U1, cim: 'File uploads FAQ', szoveg: FORRAS1 },
  { url: U2, cim: 'Data analysis with ChatGPT', szoveg: FORRAS2 }
];
{
  const { rendszer, felhasznalo } = promptEpit(utm, cikkek);
  assert.equal(typeof rendszer, 'string'); assert.equal(typeof felhasznalo, 'string');
  assert.match(rendszer, /\bONLY\b/);
  assert.ok(rendszer.includes('{"items":[{"symptom"'), 'a JSON-alak legyen kimondva');
  assert.ok(rendszer.includes('{"items":[]}'), 'a „nincs releváns” kimenet is');
  assert.match(rendszer, /"source"/); assert.match(rendszer, /Common mistakes/);
  assert.match(rendszer, /straight quote/i);
  for (const c of cikkek) { assert.ok(felhasznalo.includes(c.url)); assert.ok(felhasznalo.includes(c.cim)); }
  assert.ok(felhasznalo.includes('[1] ' + U1 + '\nFile uploads FAQ\n'), 'cikk-formátum: [n] URL\\nCÍM\\nSZÖVEG');
  assert.ok(felhasznalo.includes(utm.hibak), 'a Common mistakes szövege a user-üzenetben');
  assert.ok(felhasznalo.includes(utm.cim) && felhasznalo.includes('Create a chart from the data'));
  // eszköz nélküli útmutató: minden tétel nevezze meg az eszközt
  const alt = promptEpit({ ...utm, eszkoz: '' }, cikkek).rendszer;
  assert.match(alt, /In ChatGPT:/);
  assert.notEqual(alt, rendszer);
}

// 3) VÁLASZ-ÉRTELMEZÉS
const jo1 = {
  symptom: 'ChatGPT only analyzed part of my spreadsheet?',
  why: 'Spreadsheets with many sheets may be summarized only partially.',
  fix: 'Ask ChatGPT to inspect specific sheets, rows, columns, or sections. You can also split the file into smaller files.',
  prompt: '"Inspect the sheet [sheet name] and list every column."',
  source: U1
};
const jo2 = {
  symptom: 'My upload stopped working after many files',
  why: 'You can upload up to 80 files every 3 hours.',
  fix: 'Each file can be up to 512 MB, so split the file into smaller files.',
  source: U1
};
const kitalalt = {
  symptom: 'ChatGPT forgot my file?',
  why: 'ChatGPT deletes uploaded files after one minute of inactivity.',
  fix: 'Click the Turbo Upload button in Settings to keep your files available.',
  source: U2
};
{
  const nyers = JSON.stringify({ items: [jo1, jo2, { ...jo2, source: 'https://help.openai.com/en/articles/999-made-up' }] });
  const t = valaszErtelmez(nyers, cikkek);
  assert.equal(t.length, 2, 'a kitalált forrás-URL-es tétel kiesik');
  assert.equal(t[0].prompt, jo1.prompt);
  // ```json burok
  assert.equal(valaszErtelmez('```json\n' + nyers + '\n```', cikkek).length, 2);
  assert.equal(valaszErtelmez('```\n' + nyers + '\n```', cikkek).length, 2);
  // hibás JSON / rossz alak → []
  assert.deepEqual(valaszErtelmez('{"items": [', cikkek), []);
  assert.deepEqual(valaszErtelmez('', cikkek), []);
  assert.deepEqual(valaszErtelmez('{"foo":1}', cikkek), []);
  assert.deepEqual(valaszErtelmez('{"items":[]}', cikkek), []);
  // az idézőjel nélkül kezdődő prompt kiesik, a tétel MARAD
  const p = valaszErtelmez(JSON.stringify({ items: [{ ...jo1, prompt: 'Inspect the sheet [sheet name].' }] }), cikkek);
  assert.equal(p.length, 1); assert.ok(!('prompt' in p[0]), 'a rossz prompt mező törlődik');
  for (const q of ['“Inspect [x].”', '„Inspect [x].”'])
    assert.equal(valaszErtelmez(JSON.stringify({ items: [{ ...jo1, prompt: q }] }), cikkek)[0].prompt, q);
  assert.ok(!('prompt' in valaszErtelmez(JSON.stringify({ items: [{ ...jo1, prompt: '"' + 'x'.repeat(400) + '"' }] }), cikkek)[0]), 'túl hosszú prompt');
  // hiányzó / túl hosszú mező → a tétel kiesik
  assert.equal(valaszErtelmez(JSON.stringify({ items: [{ ...jo1, why: '  ' }] }), cikkek).length, 0);
  assert.equal(valaszErtelmez(JSON.stringify({ items: [{ ...jo1, fix: 5 }] }), cikkek).length, 0);
  assert.equal(valaszErtelmez(JSON.stringify({ items: [{ ...jo1, symptom: 'x'.repeat(121) }] }), cikkek).length, 0);
  assert.equal(valaszErtelmez(JSON.stringify({ items: [{ ...jo1, why: 'x'.repeat(401) }] }), cikkek).length, 0);
  assert.equal(valaszErtelmez(JSON.stringify({ items: [{ ...jo1, fix: 'x'.repeat(601) }] }), cikkek).length, 0);
  // engedélyezetlen forrás akkor is kiesik, ha a cikklistában szerepelne
  const rossz = [...cikkek, { url: 'https://example.com/help', cim: 'x', szoveg: FORRAS1 }];
  assert.equal(valaszErtelmez(JSON.stringify({ items: [{ ...jo1, source: 'https://example.com/help' }] }), rossz).length, 0);
  // vágás
  const v = valaszErtelmez(JSON.stringify({ items: [{ ...jo2, symptom: '  ' + jo2.symptom + '  ' }] }), cikkek);
  assert.equal(v[0].symptom, jo2.symptom);
}

// 4) FORRÁS-ALÁTÁMASZTÁS
assert.equal(alatamasztott(jo1, FORRAS1), true);
assert.equal(alatamasztott(jo2, FORRAS1), true);
assert.equal(alatamasztott(kitalalt, FORRAS2), false, 'a súgóban nem szereplő állítás kiesik');
assert.equal(alatamasztott(jo1, ''), false, 'forrásszöveg nélkül nincs alátámasztás');
assert.equal(alatamasztott(jo1, undefined), false);
assert.equal(alatamasztott({ ...jo1, why: 'Too many.', fix: 'Split it.' }, FORRAS1), false, '0 mondat → false');
// a szám is számít: a forrás 80-at mond, nem 100-at
assert.equal(alatamasztott({ ...jo2, why: 'You can upload up to 100 files every 3 hours.', fix: 'Each file can be up to 900 MB in size today.' }, FORRAS1), false);

// 5) „COMMON MISTAKES” ISMÉTLÉSE
const ismetlo = { ...jo1, symptom: 'Uploaded a scanned PDF instead of a spreadsheet?' };
assert.equal(ismetliHibat(ismetlo, utm.hibak), true);
assert.equal(ismetliHibat(jo1, utm.hibak), false);
assert.equal(ismetliHibat(jo2, ''), false);

// 6) DOBOZ
{
  const forrasok = { [U1]: FORRAS1, [U2]: FORRAS2 };
  assert.deepEqual(dobozKeszit([jo1, jo2], forrasok, utm.hibak), { items: [jo1, jo2] });
  assert.equal(dobozKeszit([jo1, kitalalt], forrasok, utm.hibak), null, '1 maradó tétel → nincs doboz');
  assert.equal(dobozKeszit([jo1, ismetlo], forrasok, utm.hibak), null, 'az ismétlő tétel kiesik → 1 marad → null');
  assert.equal(dobozKeszit([], forrasok, utm.hibak), null);
  const sok = [jo1, jo2, { ...jo1, symptom: 'Third symptom here' }, { ...jo2, symptom: 'Fourth symptom here' }, { ...jo1, symptom: 'Fifth symptom here' }];
  const d = dobozKeszit(sok, forrasok, utm.hibak);
  assert.equal(d.items.length, 4, 'legfeljebb 4');
  assert.deepEqual(d.items.map(x => x.symptom), sok.slice(0, 4).map(x => x.symptom), 'a sorrend marad');
  assert.equal(dobozKeszit([jo1, jo2], { [U2]: FORRAS2 }, utm.hibak), null, 'a tétel a SAJÁT forrásához mérve');
  // kill-switch
  assert.equal(ELAKADAS_BE, true);
  assert.equal(dobozKeszit([jo1, jo2], forrasok, utm.hibak, false), null);
}

console.log('✅ elakadas: modul rendben');
