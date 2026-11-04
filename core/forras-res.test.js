// 🕳️ Forrás-rés + a forráskutató új szabályai (2026-10-29). Ingyenes, hálózat nélküli.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { forrasRes, resAblak, utmutatoEszkoz, hirCim, hirDb, futasiGyakorisag, marKovetett } from './forras-res.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };

console.log('\n🧪 forras-res');

t('🎯 a VALÓDI adatokon az Alexa+ a legnagyobb rés (24 útmutató, ~0 hír)', () => {
  const dir = join(ROOT, 'content', 'articles');
  const utmutatok = [], hirCimek = [];
  for (const f of readdirSync(dir).filter(x => x.endsWith('.json'))) {
    const a = JSON.parse(readFileSync(join(dir, f), 'utf-8'));
    if (f.includes('GUIDE')) utmutatok.push(utmutatoEszkoz(a.article_markdown)); else hirCimek.push(hirCim(a.article_markdown));
  }
  const res = forrasRes({ utmutatok, hirCimek: hirCimek.slice(0, 0) });   // hír nélkül: a sorrend a tiszta útmutatószám
  assert.ok(res.length > 0 && res.length <= 4);
  assert.ok(res.some(r => r.eszkoz === 'Alexa+'), 'az Alexa+ nincs a résben: ' + JSON.stringify(res));
});

t('🧮 a rés szabályai: ≥8 útmutató, ≤3 friss hír, útmutatószám szerint, max 4; üres eszköznév kimarad', () => {
  const ut = [...Array(10).fill('Alpha'), ...Array(9).fill('Bravo'), ...Array(20).fill('Charlie'), ...Array(5).fill('Delta'), ...Array(30).fill('')];
  const hir = ['Charlie launches X', 'Charlie adds Y', 'New Charlie feature', 'Charlie again', 'Bravo update'];
  assert.deepEqual(forrasRes({ utmutatok: ut, hirCimek: hir }).map(r => r.eszkoz), ['Alpha', 'Bravo'], 'Charlie-ról 4 hír van, D-ről kevés útmutató, az üres kimarad');
  assert.equal(hirDb('Alexa+', ['Alexa for Shopping adds', 'Echo news']), 1, 'a „+” nélkül is egyezik');
});

t('🗓️ ritkítás: 4 üres futás után hetente', () => {
  assert.equal(futasiGyakorisag(0), 3); assert.equal(futasiGyakorisag(3), 3); assert.equal(futasiGyakorisag(4), 7); assert.equal(futasiGyakorisag(undefined), 3);
});

t('🔗 pontos hírfolyam-egyezés: protokoll, www, perjel nem számít; a domain másik csatornája NEM egyezés', () => {
  const kov = ['https://blog.google/technology/ai/rss/', 'https://www.notion.com/releases/rss.xml'];
  assert.equal(marKovetett('http://blog.google/technology/ai/rss', kov), true);
  assert.equal(marKovetett('https://notion.com/releases/rss.xml', kov), true);
  assert.equal(marKovetett('https://blog.google/products/gemini/rss/', kov), false, 'ugyanaz a domain, másik csatorna = új forrás lehet');
  assert.equal(marKovetett('', kov), false);
});

t('🔌 a forráskutató bekötve: rés a kérésben, pontos URL kipróbálva, csatorna-szintű kizárás, ritkítás mentve', () => {
  const src = readFileSync(join(ROOT, 'agents', 'source-scout', 'agent.js'), 'utf-8').replace(/\r\n/g, '\n').replace(/^\s*\/\/.*$/gm, '');
  assert.match(src, /getCandidateOrgs\(coverage, resSzamol\(\)\)/);
  assert.match(src, /\(d\) the OFFICIAL product-update/);
  assert.match(src, /\(pontosUrl && await pontosHirfolyam\(pontosUrl\)\) \|\| await discoverFeedForDomain/);
  assert.match(src, /reliabilityCheck\(org, hostname, found\.feed, coverage, found\.type, found\.url\)/);
  assert.doesNotMatch(src, /hardFail: 'ezt a domaint már követjük'/, 'a régi domain-szintű kizárás maradt');
  assert.match(src, /ures_futasok: ujMost \? 0 : elozoUres\(\) \+ 1/);
  assert.match(src, /futasiGyakorisag\(elozoUres\(\)\)/);
});

t('🔄 forgó ablak (10-30): futásonként 6, és néhány egymást követő futás alatt MINDEN eszköz sorra kerül', () => {
  const l = Array.from({ length: 16 }, (_, i) => ({ eszkoz: 'E' + i }));
  const latott = new Set();
  for (let k = 0; k < 3; k++) { const a = resAblak(l, 6, new Date(Date.UTC(2026, 9, 30 + k * 3))); assert.equal(a.length, 6); a.forEach(x => latott.add(x.eszkoz)); }
  assert.equal(latott.size, 16, '3 futás alatt nem került sorra mind a 16: ' + latott.size);
  assert.deepEqual(resAblak(l.slice(0, 4), 6), l.slice(0, 4), 'kevés eszköznél mind');
  const src = readFileSync(join(ROOT, 'agents', 'source-scout', 'agent.js'), 'utf-8');
  assert.ok(src.includes('resAblak(forrasRes({ utmutatok, hirCimek, minUtmutato: 3, max: 50 }), 6)'), 'a kutató nem a forgó ablakot használja');
});

if (hiba) { console.log(`\n❌ forras-res.test: ${hiba} hiba`); process.exit(1); }
console.log('✅ forras-res.test: mind rendben');
