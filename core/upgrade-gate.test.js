// ===================================================================
// TESZT — FELÚJÍTÁS-KAPU: mi engedi ÉLŐ cikk lecserélését?
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// MI TÖRTÉNT (2026-09-08)
// ──────────────────────
// Az `agents/iro/upgrade-howtos.js` PUBLIKÁLT cikkeket ír át — 79-et eddig,
// legutóbb ma. A csere feltétele NÉGY SZERKEZETI ellenőrzés volt: ép
// frontmatter, van `title:`, elég szó és lépés, megvan a brand-szekció.
// Mind azt kérdezi, MEGVAN-E A FORMA. Egyik sem azt, hogy IGAZ-E vagy EGÉSZ-E.
//
// A prompt kéri a modelltől, hogy ne találjon ki menüt — de semmi nem
// ellenőrizte. A hitelesség-kapu naplójában pont ilyen blokkok állnak:
// „a 'Settings → Extensions → Google apps' menüútvonal KITALÁLT".
//
// 🔑 EZ A TESZT AZT ŐRZI, hogy a kapu ne váljon vissza forma-ellenőrzéssé.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { felujitasKifogas } from './upgrade-gate.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, bukott = 0;
const t = (nev, fn) => {
  try { fn(); pass++; console.log('  ✅ ' + nev); }
  catch (e) { bukott++; console.log('  ❌ ' + nev + '\n     ' + String(e.message).split('\n')[0]); }
};

console.log('🧪 felújítás-kapu — mi engedi élő cikk lecserélését\n');

/** Élethű, ÁTMENŐ cikk: minden kötelező elem megvan. */
const JO = `---
title: "How to use ChatGPT Memory in five minutes"
subtitle: "Stop repeating yourself."
read_time_minutes: 6
---

# How to use ChatGPT Memory in five minutes

## Step 1 — Open ChatGPT
Open ChatGPT and sign in. You'll know it worked when you see the chat box.

## Step 2 — Turn on Memory
In ChatGPT, open the settings panel. OpenAI calls this Personalization.

## Step 3 — Tell it something
Tell ChatGPT one fact about yourself. It remembers between chats.

## Common mistakes
Expecting ChatGPT to remember without turning Memory on.

## What this means for you
ChatGPT stops asking you the same questions.
`;

const jo = (p = {}) => felujitasKifogas({ regiMd: JO, ujMd: JO, fedez: true, ...p });

// ===================================================================
// 1. AZ ÁTMENŐ ESET — enélkül minden más teszt hazudna
// ===================================================================
t('🔑 a rendes átírás ÁTMEGY (különben a kapu csak befagyasztana)', () => {
  assert.equal(jo(), null, 'jó szövegre kifogást emelt');
});

// ===================================================================
// 2. A RÉGI, SZERKEZETI KAPUK — nem veszhettek el
// ===================================================================
t('üres válasz NEM siker', () => {
  // „Üres válasz ≠ semmi": a modell némán is bukhat, és enélkül a cikk
  // helyére a SEMMI kerülne.
  for (const ures of ['', '   ', null, undefined]) {
    const k = felujitasKifogas({ regiMd: JO, ujMd: ures, fedez: true });
    assert.ok(k, 'üres szövegre nincs kifogás: ' + JSON.stringify(ures));
    assert.equal(k.kod, 'URES');
  }
});

t('sérült frontmatter → kifogás (a „---title:" alak is)', () => {
  // 2026-07-28-i valódi hiba: a modell sortörés NÉLKÜL írta a nyitó határolót.
  // A régi `startsWith("---")` átengedte, és mivel a címet így senki nem
  // találta meg, a fedezet-vizsgálat is TÉVESEN „rendben"-t mondott.
  assert.equal(felujitasKifogas({ regiMd: JO, ujMd: '---title: "X"\n\nSzöveg', fedez: true }).kod, 'FRONTMATTER');
  assert.equal(felujitasKifogas({ regiMd: JO, ujMd: 'Nincs is frontmatter.', fedez: true }).kod, 'FRONTMATTER');
});

t('nincs title mező → kifogás', () => {
  assert.equal(felujitasKifogas({ regiMd: JO, ujMd: '---\nsubtitle: "x"\n---\n\nSzöveg', fedez: true }).kod, 'NINCS_CIM');
});

t('nem fedezi az ígéretet → kifogás, a hívó indokával', () => {
  const k = felujitasKifogas({ regiMd: JO, ujMd: JO, fedez: false, fedezIndok: '412 szó / 2 lépés' });
  assert.equal(k.kod, 'NEM_FEDEZ');
  assert.match(k.indok, /412 szó/, 'a hívó mérési indoka nem megy ki: ' + k.indok);
});

t('hiányzó brand-szekció → kifogás', () => {
  const k = jo({ ujMd: JO.replace('## What this means for you', '## Wrapping up') });
  assert.equal(k.kod, 'NINCS_BRAND');
});

// ===================================================================
// 3. AZ ÚJ KAPUK — ezek hiányoztak
// ===================================================================
t('🔑 CSONKA: a mondat közepén elvágott szöveg NEM mehet ki', () => {
  // A fedezet-vizsgálat SZÓSZÁMOT néz, tehát egy hosszú, de félbeszakadt
  // szöveg átmegy rajta. Élesben 53 ilyen ment ki (2026-08-26). Itt külön
  // súlyos: siker esetén a hívó TÖRLI a fordítást, tehát a csonka angol
  // további két nyelvre is kimenne.
  const csonka = JO.replace('ChatGPT stops asking you the same questions.',
    'ChatGPT stops asking you the same questions, and the next thing you should do is');
  const k = jo({ ujMd: csonka });
  assert.ok(k, 'a csonka szöveget átengedte');
  assert.equal(k.kod, 'CSONKA');
});

t('🔑 NÉV-ZÁR: a cikk tárgyának eltűnése NEM mehet ki', () => {
  // A 2026-09-05-i eset alakja (ChatRTX → „NVIDIA Chat"), csak itt az író
  // követné el. A `regiMd` a viszonyítási alap — ezért kell a kapunak a RÉGI
  // szöveg is, nem csak az új.
  const nevtelen = JO.replace(/ChatGPT/g, 'the assistant').replace(/OpenAI/g, 'the maker');
  const k = jo({ ujMd: nevtelen });
  assert.ok(k, 'a névtelenített szöveget átengedte');
  assert.equal(k.kod, 'NEV_ELTUNT');
  assert.match(k.indok, /ChatGPT/, 'nem mondja meg, MELYIK név tűnt el: ' + k.indok);
});

t('a név-zár a RÉGI szöveghez viszonyít, nem abszolút', () => {
  // Ha a régiben sem volt terméknév, az újban sem hiányozhat.
  const nevtelen = '---\ntitle: "General AI tips"\n---\n\n## What this means for you\nSemmi konkrét.';
  assert.equal(felujitasKifogas({ regiMd: nevtelen, ujMd: nevtelen, fedez: true }), null);
});

// ===================================================================
// 4. SORREND — az olcsó kapu ELŐBB, hogy ne fizessünk feleslegesen
// ===================================================================
t('🔑 az ELSŐ kifogás nyer, és a szerkezet ELŐBB dől el, mint a tartalom', () => {
  // Egy szövegben egyszerre több baj is lehet. A naplóba EGY, olvasható
  // indok kell — és a legolcsóbban megállapítható.
  const mindenRossz = 'Nincs frontmatter, és csonka is, mert';
  assert.equal(felujitasKifogas({ regiMd: JO, ujMd: mindenRossz, fedez: false }).kod, 'FRONTMATTER');
});

// ===================================================================
// 5. VALÓDI CIKKEKEN — „a kézzel gyártott minta az ALAKOT nézi"
// ===================================================================
t('🔑 ÉLES ADAT: a már felújított cikkek ÁTMENNÉNEK a saját kapujukon', () => {
  // Ha a kapu a MEGLÉVŐ, elfogadott cikkeket is elutasítaná, akkor nem őr,
  // hanem befagyasztás: a felújító örökre elakadna, némán.
  const dir = join(ROOT, 'content', 'articles');
  if (!existsSync(dir)) { console.log('     (nincs cikk-mappa — kihagyva)'); return; }
  let nezett = 0; const elakadt = [];
  for (const f of readdirSync(dir).filter(x => x.endsWith('.json'))) {
    let j; try { j = JSON.parse(readFileSync(join(dir, f), 'utf-8')); } catch { continue; }
    if (!j._meta?.howto_upgraded_at) continue;
    const md = j.article_markdown || '';
    nezett++;
    // Önmagához viszonyítva: a névzárnak nincs mit kifogásolnia, a csonka-őr
    // és a szerkezeti kapuk viszont valódi ítéletet mondanak a kint lévő
    // szövegre. Az `fedez: true` azért fix, mert azt a hívó méri.
    const k = felujitasKifogas({ regiMd: md, ujMd: md, fedez: true });
    if (k) elakadt.push(k.kod + ' — ' + f.slice(0, 46));
  }
  if (!nezett) { console.log('     (nincs felújított cikk — kihagyva)'); return; }
  console.log('     ↳ ' + nezett + ' élő, felújított cikk vizsgálva, elakadt: ' + elakadt.length);
  for (const e of elakadt.slice(0, 5)) console.log('        ⚠️ ' + e);
  assert.ok(elakadt.length / nezett < 0.1,
    'a kapu a MEGLÉVŐ cikkek ' + (100 * elakadt.length / nezett).toFixed(0)
    + '%-át utasítaná el — ez befagyasztás, nem őrzés');
});

// ===================================================================
// 6. BEKÖTÉS-ŐR — a kapu tényleg ott van a cserénél
// ===================================================================
// Az `agents/iro/upgrade-howtos.js`-t IMPORTÁLNI TILOS (a fájl végén
// feltétel nélkül hívja a `main()`-t → pénzt költene és átírna élő cikket).
// Ezért forrásból ellenőrizzük. ⚠️ Nem az import-sort nézzük: egy behozott,
// de sosem hívott függvény forrásszinten pontosan úgy néz ki, mint egy
// működő bekötés. A HÍVÁST és a SORRENDET kell megfogni.
console.log('\n🧪 bekötés — a kapu tényleg ott áll a csere előtt');

const AGENT = join(ROOT, 'agents', 'iro', 'upgrade-howtos.js');
const nyers = existsSync(AGENT) ? readFileSync(AGENT, 'utf-8') : '';

// ⚠️ A KOMMENTEKET LE KELL VÁGNI, ÉS EZT MUTÁCIÓVAL TANULTAM MEG (2026-09-08).
// Az első változatom a `felujitasKifogas(` mintát kereste a nyers forrásban —
// és a fájl FEJLÉCE is leírja a függvény nevét zárójellel. Amikor kísérletként
// kivágtam a VALÓDI hívást, a teszt ZÖLD MARADT: a komment tartotta életben.
// Ugyanaz a hibaosztály, ami ebben a projektben már kétszer átengedett elvágott
// huzalozást. A sor-ellenőrzések (indexOf) is EZEN a szövegen futnak, különben
// egy fejléc-említés eltolná a sorrendet.
const forras = nyers.split('\n').filter(s => !s.trim().startsWith('//')).join('\n');

t('🧪 a bekötés-őr saját mérőeszköze: a komment NEM számít hívásnak', () => {
  // Hitelesítés ismert esettel: ha ez elbukik, a többi bekötés-teszt zöldje
  // sem bizonyít semmit.
  assert.ok(nyers.includes('// '), 'a forrásban nincs is komment — a teszt elavult');
  assert.ok(!/^\s*\/\//m.test(forras), 'maradtak teljes soros kommentek a szűrt forrásban');
});

t('🔌 a felújító HÍVJA az ingyenes kaput', () => {
  assert.ok(forras, 'nem olvasható: agents/iro/upgrade-howtos.js');
  assert.ok(/from '\.\.\/\.\.\/core\/upgrade-gate\.js'/.test(forras), 'nincs import a upgrade-gate.js-ből');
  assert.ok(/felujitasKifogas\s*\(/.test(forras), 'a felujitasKifogas() csak importálva van, nem HÍVVA');
});

t('🔌 a felújító HÍVJA az igazság-kaput is', () => {
  assert.ok(/from '\.\.\/\.\.\/core\/truth-gate\.js'/.test(forras), 'nincs import a truth-gate.js-ből');
  assert.ok(/await\s+truthGate\s*\(/.test(forras), 'a truthGate() nincs HÍVVA (vagy nincs await-elve)');
});

t('🔑 a kapuk a CSERE ELŐTT futnak, nem utána', () => {
  // A legfontosabb sorrend-kérdés. Ha a csere (`article_markdown = text`)
  // megelőzné a kaput, a kapu ítélete már semmit nem védene.
  const kapuNal = forras.indexOf('felujitasKifogas(');
  const csereNel = forras.indexOf('c.data.article_markdown = text');
  assert.ok(kapuNal > 0, 'nincs kapu-hívás');
  assert.ok(csereNel > 0, 'nem találom a csere sorát — a teszt elavult, nézd meg');
  assert.ok(kapuNal < csereNel, '⚠️ a csere MEGELŐZI a kaput — a kapu semmit nem véd');
});

t('🔑 a bukott átírás NEM cseréli le a cikket', () => {
  // A bevált minta: bukásnál a RÉGI marad kint, az oldalon soha nincs lyuk.
  assert.ok(/if\s*\(\s*why\s*\)[\s\S]{0,400}?continue;/.test(forras),
    'a kifogás után nincs `continue` — a bukott szöveg átcsúszhat a cserére');
});

t('🔑 a `hold` NEM számít bukott próbálkozásnak', () => {
  // Ha az AI-bíró elérhetetlen, az a MI hibánk, nem a szövegé. Enélkül három
  // hálózati akadás ÖRÖKRE kizárná a cikket a felújításból — némán.
  const holdNal = forras.indexOf('gate.hold');
  const szamlaloNal = forras.indexOf('howto_upgrade_attempts = (c.data._meta.howto_upgrade_attempts || 0) + 1');
  assert.ok(holdNal > 0, 'nincs `hold` ág — az elérhetetlen bíró bukásnak számítana');
  assert.ok(szamlaloNal > 0, 'nem találom a próbálkozás-számlálót — a teszt elavult');
  assert.ok(holdNal < szamlaloNal, 'a `hold` ág a számláló UTÁN van — a visszatartás rovásnak számítana');
  const kozte = forras.slice(holdNal, szamlaloNal);
  assert.ok(/continue;/.test(kozte), 'a `hold` ág nem lép ki a számláló előtt');
});

console.log(`\n${bukott === 0 ? '✅' : '❌'} upgrade-gate.test: ${pass} rendben, ${bukott} bukott`);
process.exit(bukott === 0 ? 0 : 1);
