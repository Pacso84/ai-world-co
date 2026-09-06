// ===================================================================
// TESZT — NÉV-ZÁR (a tény-ellenőrző nem nevezhet át terméket)
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// A VALÓDI ESET (2026-08-31, élesben megtörtént): a fact-check agent egy
// publikált útmutatóban a VALÓDI `ChatRTX` terméknevet átírta „NVIDIA
// Chat"-re, ezzel az indoklással: „NVIDIA ChatRTX has been rebranded to
// NVIDIA Chat". Ez HAMIS — az nvidia.com-on ma is ChatRTX. A cikk 10 helyen
// állította az átnevezést, és a NEM LÉTEZŐ névre küldte keresni az olvasót
// (magyarul 11×, spanyolul 10×).
//
// 🔑 Nem az író hallucinált, hanem a TÉNYELLENŐR — az a szerep, aminek
// éppen a nevek helyességét kellene őriznie. A hiedelem 2026-09-04-én is
// előjött (egy másik NVIDIA-cikk audit-mezőjében megint „rebranded" áll),
// és 17 NVIDIA-útmutatónk van.
//
// EZ A TESZT AZT ŐRZI, hogy a név-váltás VISSZAUTASÍTVA legyen — a cikk
// neve marad, a kifogás pedig naplóba és a napi jelentésbe megy.
// A tény-ellenőrző TÖBBI munkája (elavult gombnév, képernyő-elem, halott
// URL eltávolítása) HASZNOS: az ellenpéldák azt őrzik, hogy az átmenjen.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
import {
  NEV_ZAR_MAX, declaredNames, nameLockObjection, unregisteredNames,
  jegyezNevZar, nevZarTalalatok
} from './name-guard.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };

console.log('🧪 név-zár (a tény-ellenőrző nem nevezhet át terméket)\n');

// -------------------------------------------------------------------
// Valósághű minta: EGY az élő 16 ChatRTX-útmutatónk alakjából.
// -------------------------------------------------------------------
const META = { type: 'guide', company: 'NVIDIA', tool: 'ChatRTX', slug: 'getting-started-nvidia-chatrtx' };

const EREDETI = `---
title: "Getting started with NVIDIA ChatRTX: a beginner's guide"
subtitle: "Run your own private AI chatbot on an NVIDIA-powered Windows PC with ChatRTX."
category: "guide"
audience: "personal"
company: "NVIDIA"
tool: "ChatRTX"
level: "beginner"
read_time_minutes: 6
---

# Getting started with NVIDIA ChatRTX: a beginner's guide

## Before you start
You need a Windows PC with an NVIDIA RTX graphics card. ChatRTX runs locally.

## Step 1 — Download ChatRTX
Open the NVIDIA site and download ChatRTX. Install it like any other app.

## Step 2 — Point ChatRTX at your folder
ChatRTX reads the documents in the folder you choose.

## Common mistakes
Expecting ChatRTX to work without an RTX card.

## What this means for you
ChatRTX keeps your documents on your own machine.

## Try it now
Open ChatRTX and ask it one question about your own files.
`;

/** A 08-31-i VALÓDI kimenet alakja: minden előfordulás átírva. */
const ATNEVEZETT = EREDETI
  .replace(/NVIDIA ChatRTX/g, 'NVIDIA Chat')
  .replace(/ChatRTX/g, 'NVIDIA Chat');

/** Jogos javítás: a konkrét gombnév/URL lágyítva, a NÉV érintetlen. */
const JOGOS_JAVITAS = EREDETI
  .replace('Open the NVIDIA site and download ChatRTX. Install it like any other app.',
           'If it is available in your region, look for ChatRTX on the official NVIDIA site.');

t('🔴 A VALÓDI ESET: ChatRTX → „NVIDIA Chat" VISSZAUTASÍTVA', () => {
  const k = nameLockObjection(EREDETI, ATNEVEZETT, META);
  assert.ok(k, 'a név-váltásnak kifogást kell adnia — EZ VOLT A HIBA');
  assert.equal(k.mezo, 'tool');
  assert.equal(k.regi, 'ChatRTX');
  assert.equal(k.uj, 'NVIDIA Chat');
  // A „NVIDIA Chat" nem szerepel a core/tool-kinds.js regiszterében → ez az
  // ERŐSEBB kifogás: nem csak nevet váltott, hanem ISMERETLEN nevet írt be.
  assert.equal(k.kod, 'ISMERETLEN_NEV');
  assert.match(k.indok, /ChatRTX/);
  assert.match(k.indok, /NVIDIA Chat/);
});

t('✅ ELLENPÉLDA: a jogos javítás (gombnév/URL lágyítása) ÁTMEGY', () => {
  // A tény-ellenőrző MÁS munkája hasznos, és nem akadhat el ezen a kapun.
  assert.equal(nameLockObjection(EREDETI, JOGOS_JAVITAS, META), null);
  // A változatlan szöveg is átmegy.
  assert.equal(nameLockObjection(EREDETI, EREDETI, META), null);
});

t('✅ a kanonizálás NEM átnevezés: „NVIDIA ChatRTX" = „ChatRTX"', () => {
  // A quality-guard `canonicalChip`-je a cégnév-előtagot amúgy is levágja,
  // tehát ez a chipen nem változtat semmit — nem szabad elakadnia.
  const bovebb = EREDETI.replace('tool: "ChatRTX"', 'tool: "NVIDIA ChatRTX"');
  assert.equal(nameLockObjection(EREDETI, bovebb, META), null);
  // Kis-nagybetű és a többszörös szóköz sem különbség.
  const maskepp = EREDETI.replace('tool: "ChatRTX"', 'tool: "chatrtx"');
  assert.equal(nameLockObjection(EREDETI, maskepp, META), null);
});

t('🔒 ISMERT névre váltani is TILOS — a nevet nem a tény-ellenőrző dönti el', () => {
  const masik = EREDETI.replace('tool: "ChatRTX"', 'tool: "Gemini"');
  const k = nameLockObjection(EREDETI, masik, META);
  assert.ok(k, 'a csere akkor is kifogás, ha a cél-név szerepel a regiszterben');
  assert.equal(k.kod, 'NEV_ATIRVA', 'ismert névnél a gyengébb kód jár — a naplóból látszik a különbség');
  assert.equal(k.mezo, 'tool');
});

t('🏢 a CÉG átírása ugyanúgy kifogás', () => {
  const masCeg = EREDETI.replace('company: "NVIDIA"', 'company: "Nvidia Corporation"');
  const k = nameLockObjection(EREDETI, masCeg, META);
  assert.ok(k);
  assert.equal(k.mezo, 'company');
  assert.equal(k.regi, 'NVIDIA');
  assert.equal(k.uj, 'Nvidia Corporation');
});

t('👻 a NÉV NEM TŰNHET EL a szövegből, akkor sem, ha a frontmatter érintetlen', () => {
  // Ravaszabb alak: a `tool:` sor marad, de a törzsben minden előfordulás
  // átíródik. A chip helyes maradna, a SZÖVEG mégis hazudna.
  const csakTorzs = ATNEVEZETT
    .replace('tool: "NVIDIA Chat"', 'tool: "ChatRTX"')
    .replace('company: "NVIDIA"', 'company: "NVIDIA"');
  const k = nameLockObjection(EREDETI, csakTorzs, META);
  assert.ok(k, 'a termék saját neve nem tűnhet el a cikkből');
  assert.equal(k.kod, 'NEV_ELTUNT');
  assert.equal(k.regi, 'ChatRTX');
});

t('📛 a CÍMBŐL sem tűnhet el a terméknév', () => {
  // A cím a /guides listát és a keresőt is hajtja — ott az átnevezés
  // ugyanúgy kiül az olvasó elé.
  const masCim = EREDETI
    .replace('title: "Getting started with NVIDIA ChatRTX: a beginner\'s guide"',
             'title: "Getting started with NVIDIA Chat: a beginner\'s guide"')
    .replace('# Getting started with NVIDIA ChatRTX: a beginner\'s guide',
             '# Getting started with NVIDIA Chat: a beginner\'s guide');
  const k = nameLockObjection(EREDETI, masCim, META);
  assert.ok(k, 'a címből eltűnt terméknév kifogás');
  assert.equal(k.kod, 'CIM_ATNEVEZVE');
});

t('🧾 egy említésnyi név eltűnése NEM blokkol (az lehet jogos lágyítás)', () => {
  // Irány-szabály: a kapu a TÖMEGES átírásra van élezve. Egyetlen, mellékes
  // említés eltávolítása lehet valódi javítás — ott a frontmatter-zár őriz.
  const egyszer = EREDETI.replace(/ChatRTX/g, 'the app')
    .replace('tool: "the app"', 'tool: "ChatRTX"')
    .replace('title: "Getting started with NVIDIA the app: a beginner\'s guide"',
             'title: "Getting started with NVIDIA ChatRTX: a beginner\'s guide"');
  // Ebben a mintában a név 2-nél többször szerepelt → EZ blokkol.
  assert.ok(nameLockObjection(EREDETI, egyszer, META));
  // De egy olyan cikkben, ahol a név egyszer szerepelt, nem.
  const alig = `---\ntitle: "Two ways to summarize a PDF"\ncompany: "NVIDIA"\ntool: "ChatRTX"\n---\n\nYou can also use ChatRTX for this.\n`;
  const aligJav = `---\ntitle: "Two ways to summarize a PDF"\ncompany: "NVIDIA"\ntool: "ChatRTX"\n---\n\nYou can also use a local assistant for this.\n`;
  assert.equal(nameLockObjection(alig, aligJav, META), null);
});

t('🧭 declaredNames: a frontmatter az elsődleges, a _meta a tartalék', () => {
  // Ugyanaz a sorrend, amit a core/quality-guard.js 2b pontja használ, amikor
  // a `_meta.tool`-t a frontmatterből SZINKRONIZÁLJA — ez az a lépés, amin
  // keresztül a kitalált név a chipre és a /tools oldalra jutott volna.
  assert.deepEqual(declaredNames(EREDETI, META), { tool: 'ChatRTX', company: 'NVIDIA' });
  const fmNelkul = 'Nincs itt frontmatter, csak szöveg.';
  assert.deepEqual(declaredNames(fmNelkul, META), { tool: 'ChatRTX', company: 'NVIDIA' });
  // A frontmatter üt: a _meta-ban ChatRTX áll, a cikkben Gemini.
  assert.equal(declaredNames(EREDETI.replace('tool: "ChatRTX"', 'tool: "Gemini"'), META).tool, 'Gemini');
});

t('🔎 ELŐZETES regiszter-ellenőrzés: ismeretlen név nem mehet ki csendben', () => {
  // Ez a core/tool-kinds.js meglévő csapdájának ELŐRE HOZOTT változata: ott a
  // teszt AZUTÁN bukik, hogy a név már a cikkben van; itt már a javaslatnál.
  assert.deepEqual(unregisteredNames(['ChatRTX', 'NVIDIA']), []);
  assert.deepEqual(unregisteredNames(['NVIDIA Chat']), ['NVIDIA Chat']);
  assert.deepEqual(unregisteredNames(['NVIDIA Chat', 'nvidia  chat']), ['NVIDIA Chat'], 'ugyanaz a név egyszer');
  assert.deepEqual(unregisteredNames(null), []);
  assert.deepEqual(unregisteredNames(['', '   ']), []);
});

t('🛟 üres/hibás bemenetre nem dob, és nem is talál ki kifogást', () => {
  assert.equal(nameLockObjection(null, null, null), null);
  assert.equal(nameLockObjection('', '', {}), null);
  assert.equal(nameLockObjection(undefined, EREDETI, undefined), null);
  assert.deepEqual(declaredNames(null, null), { tool: '', company: '' });
});

t('📓 a kifogás NAPLÓBA megy, és a napló nem nő a végtelenségig', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nevzar-'));
  const ut = join(dir, 'name-guard.json');
  const k = nameLockObjection(EREDETI, ATNEVEZETT, META);
  assert.ok(jegyezNevZar({ ...k, file: 'ARTICLE_GUIDE_getting-started-nvidia-chatrtx.json' }, ut));
  const log = JSON.parse(readFileSync(ut, 'utf-8'));
  assert.equal(log.entries.length, 1);
  assert.equal(log.entries[0].uj, 'NVIDIA Chat');
  assert.ok(log.entries[0].at, 'időbélyeg nélkül a napló nem mond semmit');

  // Plafon: a növekvő listához mindig kell felső korlát (a _redirects lecke).
  for (let i = 0; i < NEV_ZAR_MAX + 10; i++) jegyezNevZar({ ...k, file: 'f' + i + '.json' }, ut);
  const tele = JSON.parse(readFileSync(ut, 'utf-8'));
  assert.equal(tele.entries.length, NEV_ZAR_MAX);
  assert.equal(tele.entries[tele.entries.length - 1].file, 'f' + (NEV_ZAR_MAX + 9) + '.json', 'a LEGÚJABB marad');

  // Írhatatlan út: nem dob, csak hamisat ad — az őr sosem akaszthatja meg az agentet.
  assert.equal(jegyezNevZar({ ...k }, join(dir, 'nincs-ilyen-mappa', 'x.json')), false);
  assert.equal(jegyezNevZar(null, ut), false, 'üres bejegyzést nem naplózunk');
  unlinkSync(ut);
});

t('📣 A JEL ODAÉR, AHOL A USER NÉZ: a minőség-őr találatai közt megjelenik', () => {
  // „Az őrszem csak akkor őr, ha odaszól, ahol a user néz" — a napi Telegram-
  // jelentés a core/quality-guard.js `qualityFindings()`-ét írja ki, ezért a
  // név-zár kifogása ODA fut be, nem a CI-naplóba.
  const dir = mkdtempSync(join(tmpdir(), 'nevzar-jel-'));
  const ut = join(dir, 'name-guard.json');
  assert.deepEqual(nevZarTalalatok(ut), [], 'napló nélkül nincs találat — csendes napon ne zajongjon');

  const k = nameLockObjection(EREDETI, ATNEVEZETT, META);
  jegyezNevZar({ ...k, file: 'ARTICLE_GUIDE_getting-started-nvidia-chatrtx.json' }, ut);
  const sorok = nevZarTalalatok(ut);
  assert.equal(sorok.length, 1);
  assert.match(sorok[0], /NÉV-ZÁR/);
  assert.match(sorok[0], /ChatRTX/);
  assert.match(sorok[0], /NVIDIA Chat/);

  // A RÉGI bejegyzés kikopik: a jelentés a MAI napról szól, nem az örökségről.
  const log = JSON.parse(readFileSync(ut, 'utf-8'));
  log.entries[0].at = '2026-01-01T00:00:00.000Z';
  writeFileSync(ut, JSON.stringify(log), 'utf-8');
  assert.deepEqual(nevZarTalalatok(ut), [], 'a tegnapi kifogás már nem mai hír');
  unlinkSync(ut);
});

t('🔌 A KAPU BE IS VAN KÖTVE a tény-ellenőrzőbe (nem csak megépült)', () => {
  // „A kód saját kommentje nem bizonyíték", és a legdrágább hiba nem a rossz
  // kód, hanem a HIÁNYZÓ ZÁRÓLÉPÉS: megépült kapu, amit senki nem hív.
  // Az `agents/` alól SEMMIT nem szabad importálni (25-ből 21 modul a fájl
  // végén feltétel nélkül hívja a `main()`-t → pénzt költ és publikál),
  // ezért a bekötést a FORRÁSSZÖVEGBŐL olvassuk ki, `fs`-sel.
  const AGENT = join(__dirname, '..', 'agents', 'fact-check', 'agent.js');
  assert.ok(existsSync(AGENT), 'a tény-ellenőrző agent a helyén van');
  const src = readFileSync(AGENT, 'utf-8');

  assert.match(src, /import\s*\{[^}]*nameLockObjection[^}]*\}\s*from\s*['"]\.\.\/\.\.\/core\/name-guard\.js['"]/,
    'a fact-check agentnek importálnia kell a név-zárat');
  assert.match(src, /nameLockObjection\(\s*guide\.data\.article_markdown\s*,\s*decision\.fixed_markdown/,
    'a név-zárat a JAVASOLT szövegre kell hívni, a régi cikkel összevetve');
  assert.match(src, /jegyezNevZar\(/, 'a kifogásnak naplóba kell mennie');

  // ÉS a hívás a beírás ELŐTT van: az `applyFix()` csak azután futhat.
  // (A HÍVÁST keressük, nem a függvény DEFINÍCIÓJÁT — az feljebb van a fájlban.)
  const zarIdx = src.indexOf('nameLockObjection(');
  const irasIdx = src.indexOf('applyFix(guide, decision.fixed_markdown');
  assert.ok(zarIdx > 0 && irasIdx > 0, 'mindkét hívásnak léteznie kell');
  assert.ok(zarIdx < irasIdx, 'a név-zárnak a cikk felülírása ELŐTT kell döntenie');

  // A prompt is szól róla — de ez csak a második réteg: a döntés a core-ban van.
  assert.match(src, /DO NOT RENAME THE PRODUCT/, 'a prompt is tiltsa az átnevezést');
});

// A minőség-őr betöltése `await import` — ezért ez az eset a `t()` helperen
// KÍVÜL fut (a helper nem várna meg egy ígéretet, és a bukás némán elveszne).
{
  // A két modul KÜLÖN olvassa a fájlt (körkörös import elkerülése miatt) —
  // ez a teszt köti össze őket, hogy a két olvasás ne váljon el egymástól.
  const dir = mkdtempSync(join(tmpdir(), 'nevzar-qg-'));
  const ut = join(dir, 'name-guard.json');
  const k = nameLockObjection(EREDETI, ATNEVEZETT, META);
  jegyezNevZar({ ...k, file: 'ARTICLE_GUIDE_getting-started-nvidia-chatrtx.json' }, ut);

  process.env.NAME_GUARD_PATH = ut;
  const { qualityFindings } = await import('./quality-guard.js');
  const talalatok = qualityFindings();
  delete process.env.NAME_GUARD_PATH;
  assert.ok(talalatok.some(x => /NÉV-ZÁR/.test(x) && /NVIDIA Chat/.test(x)),
    'a név-zár kifogásának ott kell lennie a minőség-őr találatai közt: ' + talalatok.join(' | '));
  if (existsSync(ut)) unlinkSync(ut);
  pass++;
  console.log('  ✅ 🔗 a minőség-őr TÉNYLEG beolvassa a naplót (nem csak elvben)');
}

console.log('\n✅ name-guard.test: mind a ' + pass + ' eset rendben');
