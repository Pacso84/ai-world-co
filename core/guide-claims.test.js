// ===================================================================
// TESZT — forrás nélküli útmutató-állítások (felület, pénz, hozzáférés)
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// MIÉRT (2026-08-17, user-lelet: „az útmutatóknál valami nem stimmel"):
// három élő útmutatóban volt hamis tartalom, mind ugyanabból a gyökérből —
// az útmutatók FORRÁS NÉLKÜL készülnek. A teszt a HÁROM VALÓDI bukás
// mondataival dolgozik (rövidítve), nem kitalált példákkal: a 2026-08-11-i
// ui-phrases lecke szerint a kitalált tesztszöveg átmegy, az éles nem.
//
// ⚠️ A védett ellenpélda ITT A LEGFONTOSABB: a JÓ útmutató is ír felületről,
// csak őszintén. „Midjourney updates its layout often, but the prompt box is
// always near the center" — erre a kapunak NÉMÁNAK kell maradnia, különben
// pont a helyes írásmódot bünteti.
// ===================================================================

import assert from 'assert/strict';
import {
  confidentUiClaims, expiringMoneyClaims, employerOnlyAccess,
  hasUsableSource, guideClaimIssues, clauses, quotedScreenText,
  UI_CLAIM_MIN, ACCESS_SIGNAL_MIN,
  sugoNelkuliFeluletJelzes, SUGO_NELKULI_FELULET_BE
} from './guide-claims.js';
import { readFileSync, readdirSync } from 'fs';
import { forrasSzint } from './forras-szint.js';
import { MIN_HIANYZO_FELIRAT } from './forras-tema.js';
import { isBlocking, lessonFor, leckeNevHu } from './auto-check-codes.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };
const md = body => `---\ntitle: "T"\ncategory: "guide"\n---\n\n# T\n\n${body}\n`;

console.log('🧪 útmutató-állítások (forrás nélkül)\n');

// ===================================================================
// 1. FELÜLET-ÁLLÍTÁS
// ===================================================================

t('🛡️ a VÉDETT hedge-mondat NEM állítás (a jó útmutató írásmódja)', () => {
  // Ez a mondat a javítás előtti Midjourney-cikkből való, és HELYES: helyzetet
  // ír le, nem feliratot. Ha ezt megfognánk, az őszinte írást büntetnénk.
  const s = 'Midjourney updates its layout often, but the prompt box is always near the center of the screen.';
  assert.equal(confidentUiClaims(md(s)).count, 0);
});

t('🎯 a 2. VALÓS BUKÁS: a Discord-gombok a webes leírásban fennakadnak', () => {
  // Szó szerinti mondat a javítás ELŐTTI „social media graphics" útmutatóból.
  // A cikk a midjourney.com webappra küld, majd a Discord-bot gombjait írja le.
  const s = "Once the four images appear, you'll see a row of small buttons labeled **U1, U2, U3, U4** underneath them.";
  const r = confidentUiClaims(md(s));
  // ⚠️ EZ A TESZT ELŐSZÖR 1-et VÁRT, és emiatt a kapu a SAJÁT SZÜLŐOKÁT engedte
  // át: egyetlen „u1, u2, u3, u4" címke lett a listából, ami a 3-as küszöb alatt
  // marad. Négy gomb NÉGY állítás — a splitLabelList() ezért bontja szét.
  assert.equal(r.count, 4, 'négy külön felirat-állítás, nem egy lista');
  assert.deepEqual(r.labels, ['u1', 'u2', 'u3', 'u4']);
  // És a lényeg: forrás nélkül ettől tényleg MEGSZÓLAL a kapu.
  assert.ok(guideClaimIssues(md(s), { source_link: '' }).some(i => i.startsWith('UI_CLAIMS_UNSOURCED')));
});

t('a hedge CSAK a saját tagmondatát menti, nem az egész mondatot', () => {
  // A Genie One-cikk mondata: az „often" az IKON kinézetére vonatkozik, nem
  // arra, hogy létezik-e „Send" feliratú gomb. Mondat-szinten mérve ez
  // hedgeltnek látszana — tagmondat-szinten nem.
  assert.ok(clauses("tap the 'Send' button, often represented by a paper plane").length > 1);
  // ('Send' egyetemes felirat, ezért nem SZÁMÍT — de a tagmondat-bontás áll.)
  const r = confidentUiClaims(md("Tap the 'Purchase Reserved Capacity' button, often represented by a cart icon."));
  assert.equal(r.count, 1, 'a termék-specifikus felirat magabiztos állítás marad');
});

t('a VALÓDI hedge viszont ment: „if you don\'t see…" nem állítás', () => {
  const s = "If you don't see a **Create** button, look for a section labeled **Generate Draft** instead.";
  assert.equal(confidentUiClaims(md(s)).count, 0);
});

t('az EGYETEMES feliratok nem számítanak (Save, Enter, New chat, Send)', () => {
  const s = 'Click **Save**. Press **Enter**. Click the "New chat" button. Tap the **Send** icon.';
  assert.equal(confidentUiClaims(md(s)).count, 0);
});

t('KÜLÖNBÖZŐ feliratot számolunk, nem előfordulást', () => {
  // Enélkül egy bőbeszédű, de HELYES útmutató ugyanoda kerülne, mint egy kitalálós.
  const ismetel = Array(6).fill('Click the **Skills & Games** tab.').join(' ');
  assert.equal(confidentUiClaims(md(ismetel)).count, 1);
});

t('a példa-prompt (kódblokk / backtick) NEM felület-állítás', () => {
  const s = 'Type this: `click the **Fabricated Panel** tab`\n\n```\nclick the **Another Fake** button\n```';
  assert.equal(confidentUiClaims(md(s)).count, 0);
});

t('a frontmatter nem szennyezi a mérést', () => {
  assert.equal(confidentUiClaims('---\ntitle: "Click the **Free** button"\n---\n\n# T\n\nsemmi').count, 0);
});

t('rossz bemenetre nem esik szét', () => {
  for (const x of [null, undefined, '', 123, {}]) {
    assert.equal(confidentUiClaims(x).count, 0);
    assert.deepEqual(expiringMoneyClaims(x).claims, []);
    assert.deepEqual(employerOnlyAccess(x).signals, []);
  }
});

// ===================================================================
// 2. ROMLANDÓ PÉNZ-TÉNY
// ===================================================================

t('💸 a 3. VALÓS BUKÁS: az „ingyenes próba" mondat fennakad', () => {
  // Szó szerint a javítás ELŐTTI profilkép-útmutatóból. A Midjourney 2023
  // MÁRCIUSA óta nem ad ingyenes próbát — ez évekig kint volt.
  const s = 'While there might be very limited free trials sometimes, expect to need a subscription for full access.';
  const r = expiringMoneyClaims(md(s));
  assert.ok(r.claims.includes('free trials'), JSON.stringify(r));
  assert.equal(r.pointsAtPricing, false);
});

t('💸 a HEDGE ITT NEM MENT — a pénznél a bizonytalanság maga a hiba', () => {
  // A bukott mondat tele volt hedge-dzsel („might", „sometimes", „very limited"),
  // és pont ezért volt kártékony: az olvasó a pénztárcáját tervezi rá.
  assert.ok(expiringMoneyClaims(md('There might sometimes be a free trial.')).claims.length);
});

t('a konkrét összeg is romlandó tény', () => {
  assert.ok(expiringMoneyClaims(md('The Basic plan starts at around $10/month.')).claims.some(c => c.includes('10')));
});

t('a „free tier" / „free plan" SZÁNDÉKOSAN kimarad (a korpusz 40%-a)', () => {
  // Mérve: free tier 58 (18%), free plan 51 (16%), free version 29 (9%) — ezek
  // SZERKEZETI leírások, rendszerint hatókörrel („enough for this guide").
  // Ha beszámítanánk, a kapu a korpusz többségén tüzelne, tehát semmit nem mondana.
  assert.deepEqual(expiringMoneyClaims(md('The free tier is enough for this guide; the free plan works fine.')).claims, []);
});

t('a hivatalos ÁRLAPRA mutatás kivezető út', () => {
  const s = 'A paid plan is needed — check the current pricing page before you subscribe, prices change.';
  assert.equal(expiringMoneyClaims(md(s)).pointsAtPricing, true);
  assert.equal(guideClaimIssues(md(s), { source_link: '' }).filter(i => i.startsWith('PRICE_')).length, 0);
});

// ===================================================================
// 3. NEM ÖNKISZOLGÁLÓ HOZZÁFÉRÉS
// ===================================================================

t('🏢 az 1. VALÓS BUKÁS: a Genie One céges előfeltételei fennakadnak', () => {
  // Szó szerinti sorok a LEVETT Genie One-útmutatóból. Ezt a cikket a
  // felület-kapu NEM fogta volna meg: minden kitalált gombnevét hedgelte.
  // A saját előfeltétel-listája viszont feketén-fehéren megmondta, hogy az
  // olvasónk el sem tud indulni.
  const s = [
    '- **Access to the Genie One mobile app:** This app is usually provided and set up by your workplace.',
    "- **Your company login details:** You'll need your standard work username and password.",
    'Genie One is designed to analyze your data, unless your IT team has specifically configured it.'
  ].join('\n');
  const r = employerOnlyAccess(md(s));
  assert.ok(r.signals.length >= ACCESS_SIGNAL_MIN, JSON.stringify(r.signals));
  const iss = guideClaimIssues(md(s), { source_link: '' });
  assert.ok(iss.some(i => i.startsWith('ACCESS_NOT_SELF_SERVE')), JSON.stringify(iss));
});

t('EGY jel nem elég — a mellékes említés nem hozzáférés-korlát', () => {
  // A korpuszon 1 jelre 10 cikk (3%) akadna fenn, de a hét egyjeles mind
  // MELLÉKES EMLÍTÉS: „your IT admin may have turned this off". Ott az olvasó
  // el tud indulni. 2 független jelre 3 cikk (0,9%) marad, mind valódi.
  const s = 'If the button is missing, your IT admin may have turned the feature off.';
  assert.equal(employerOnlyAccess(md(s)).signals.length, 1);
  assert.equal(guideClaimIssues(md(s), { source_link: '' }).filter(i => i.startsWith('ACCESS_')).length, 0);
});

t('az „ask your manager" NEM hozzáférés-jel (első változat téves riasztása)', () => {
  // Egy FELMONDÓLEVÉL-útmutatót jelölt meg. A főnök megkérdezése nem korlát.
  assert.deepEqual(employerOnlyAccess(md('When the letter is ready, ask your manager for a short meeting.')).signals, []);
});

// ===================================================================
// 4. A KAPU MAGÁT SZŰKÍTI — a forráslinken
// ===================================================================

t('🔑 forráslinkkel a kapu ELHALLGAT (a gyökérok szűnt meg)', () => {
  const s = "You'll see buttons labeled **U1, U2, U3, U4** and a free trial for $10.";
  assert.ok(guideClaimIssues(md(s), { source_link: '' }).length >= 2, 'forrás nélkül szól');
  assert.deepEqual(guideClaimIssues(md(s), { source_link: 'https://docs.midjourney.com/x' }), [], 'forrással néma');
});

t('a szóközzel körbevett forráslink IS forrás (3 hír-cikkben mérve)', () => {
  assert.equal(hasUsableSource({ source_link: '  https://blog.dropbox.com/x  ' }), true);
  assert.equal(hasUsableSource({ source_link: '' }), false);
  assert.equal(hasUsableSource({}), false);
  assert.equal(hasUsableSource(null), false);
  assert.equal(hasUsableSource({ source_link: 'nem-url' }), false);
});

t(`a felület-kapu küszöbe ${UI_CLAIM_MIN} (kalibrálva: 62/324 = 19%)`, () => {
  // Eloszlás a 324 publikált útmutatón: 0→166, 1→59, 2→37, 3→24, 4→17, 5+→21.
  // A medián 0. >=1 még 49%-on tüzelne (haszontalan), >=3 már csak 19%-on.
  // ⚠️ ÚJRAMÉRVE 2026-08-17-én, két javítás után: a felirat-LISTA szétbontása
  // (**U1, U2, U3, U4** = négy állítás) és a hedge-vizsgálat felirat-mentesítése
  // (a „Vary" GOMBNÉV nem bizonytalanság). 17% → 19%. A küszöb marad 3.
  const kettoLabel = 'Click the **Skills & Games** tab. Open the **Reserved Capacity** panel.';
  assert.equal(confidentUiClaims(md(kettoLabel)).count, 2);
  assert.equal(guideClaimIssues(md(kettoLabel), { source_link: '' }).filter(i => i.startsWith('UI_')).length, 0);
  const haromLabel = kettoLabel + ' Then open the **Voice History** section.';
  assert.equal(confidentUiClaims(md(haromLabel)).count, UI_CLAIM_MIN);
  assert.equal(guideClaimIssues(md(haromLabel), { source_link: '' }).filter(i => i.startsWith('UI_')).length, 1);
});

// ===================================================================
// 5. A HÁZ SZERZŐDÉSE: TANÁCSADÓ + ÁLLANDÓ LECKE
// ===================================================================

t('🚧 mind a három jelzés TANÁCSADÓ — nem indíthat fizetős újraírást', () => {
  // A user döntése erre az osztályra: „tanuljon, de ne utasítson el".
  for (const kod of ['UI_CLAIMS_UNSOURCED', 'PRICE_CLAIM_UNSOURCED', 'ACCESS_NOT_SELF_SERVE']) {
    assert.ok(!isBlocking(kod + ': részletek'), kod + ' NEM blokkolhat');
  }
});

t('📌 a lecke ÁLLANDÓ — két különböző cikk UGYANAZT az emléket erősíti', () => {
  // A remember() PONTOS SZÖVEGRE dedupolja az emléket. Ha a lecke tartalmazná
  // a feliratokat vagy az összeget, minden cikk ÚJ emléket hozna létre a
  // meglévő erősítése helyett — pontosan az a csapda, ami az accessCount 305-ös
  // JSON-hibaüzeneteket bevitte.
  const a = guideClaimIssues(md("You'll see buttons labeled **U1, U2, U3, U4**, a **V3** button and a **Vary** panel."), { source_link: '' })[0];
  const b = guideClaimIssues(md('Open the **Skills & Games** tab, the **Routines** panel and the **Devices** section.'), { source_link: '' })[0];
  assert.notEqual(a, b, 'a JELZÉS különbözik (a napló látja a feliratokat)');
  assert.equal(lessonFor(a), lessonFor(b), 'a LECKE viszont azonos');
  assert.ok(!/U1|Skills|Routines/.test(lessonFor(a)), 'a leckében nincs konkrét felirat');
});

t('minden új kódnak van TANÍTHATÓ lecke-szövege (nem puszta kód)', () => {
  for (const kod of ['UI_CLAIMS_UNSOURCED', 'PRICE_CLAIM_UNSOURCED', 'ACCESS_NOT_SELF_SERVE']) {
    const l = lessonFor(kod + ': x');
    assert.notEqual(l, kod, kod + ' lecke nélkül maradt');
    assert.ok(l.length > 60, kod + ' lecke túl rövid');
    assert.ok(!/\d+ (felirat|jel)|\$\d/.test(l), kod + ' leckéjében szám van');
  }
});

t('a pénz-lecke nem tartalmaz konkrét összeget (állandóság)', () => {
  const l = lessonFor('PRICE_CLAIM_UNSOURCED: "$10", "free trials"');
  assert.ok(!/\$\s?\d/.test(l), 'a leckében nincs összeg');
  assert.ok(/pricing page/i.test(l), 'megmondja, mit tegyen');
});

// ===================================================================
// 6. IDÉZETT KÉPERNYŐ-SZÖVEG (SCREEN_TEXT_QUOTED, 2026-11-08)
// ===================================================================

t('🖥️ a 11-08-án kijavított VALÓDI kitalált üdvözléseket megfogja', () => {
  // Szó szerint az élő útmutatókból (a javítás ELŐTTI mondatok).
  const esetek = [
    '**You\'ll know it worked when** you see a blank chat conversation area ready for your input, often with a greeting from Claude like "Hello! How can I help you today?"',
    'You\'ll know it worked when you see Grok reply with a friendly greeting and a question like “What’s the first tweet about?”',
    '**You\'ll know it worked when** the chat window is empty, and Qwen Chat might even greet you with a message like "Hello, how can I help you today?" or "What\'s on your mind?"',
    'If your screen looks different: the assistant might greet you with "How can I help you today?" — that text area below it is the chat box.',
    'You should land on a welcome screen that says "Meet Gemini." with a button below it.',
    'Click into the box that says “Ask Copilot anything…” and type your request.',
  ];
  for (const s of esetek) {
    const iss = guideClaimIssues(md(s), { source_link: '' });
    assert.ok(iss.some(i => i.startsWith('SCREEN_TEXT_QUOTED')), 'nem fogta: ' + s.slice(0, 70));
  }
});

t('🖥️ az OLVASÓ saját szövegét és a valódi weboldal-adatot békén hagyja (mérve 11-08)', () => {
  const jogos = [
    'Say clearly: *"Alexa, what\'s on my calendar today?"* and wait for the answer.',
    'When Siri says "Wo ist die nächste Bushaltestelle?", repeat it slowly.',
    'If the AI says "5.1%" but the official page says "5.2%", trust the page.',
    'Start with a greeting such as **"Dear Customer Service team"** and keep it polite.',
    'Make the greeting even more casual, like "Hey there! How\'s it going?"',
    'Type "Summarize this email in three bullet points" and press Enter.',
  ];
  for (const s of jogos) {
    assert.deepEqual(quotedScreenText(md(s)), [], 'téves riasztás: ' + s.slice(0, 70));
  }
});

t('🖥️ forráslinkes cikkre nem szól, és TANÁCSADÓ marad (nem indít fizetős újraírást)', () => {
  const s = 'Claude greets you with "Hello! How can I help you today?"';
  assert.equal(guideClaimIssues(md(s), { source_link: 'https://support.claude.com/x' }).length, 0);
  assert.ok(!isBlocking('SCREEN_TEXT_QUOTED: x'), 'SCREEN_TEXT_QUOTED NEM blokkolhat');
  const l = lessonFor('SCREEN_TEXT_QUOTED: "Hello"');
  assert.ok(l.length > 60 && !/Hello/.test(l), 'állandó, felirat nélküli lecke');
});

// ===================================================================
// GUIDE_UI_NO_HELP — súgó nélküli útmutató nem állíthat gombnevet (TÉNYKÖZPONT 0c, 11-12)
// ===================================================================
const ketGomb = 'Click **Schedule send** to pick a time. Then tap **Compose** to start a new message.';
const egyGomb = 'Click **Schedule send** to pick a time. Then open a new message from your inbox.';
const hedge = 'If you do not see **Compose**, look for a button that starts a new message. If you do not see **Schedule send**, check the arrow next to Send.';

t('🧯 GUIDE_UI_NO_HELP: cégfüggetlen, súgó nélkül, 2 magabiztos gombnév → jelzés', () => {
  const j = sugoNelkuliFeluletJelzes(md(ketGomb), { szint: 'cegfuggetlen', vanSugoSzoveg: false });
  assert.ok(j && j.startsWith('GUIDE_UI_NO_HELP'), String(j));
  assert.ok(/schedule send/i.test(j) && /compose/i.test(j));
  assert.ok(isBlocking(j), 'blokkoló');
});
t('🧯 GUIDE_UI_NO_HELP: a küszöb a MIN_HIANYZO_FELIRAT — 1 gombnév még nem elég', () => {
  assert.equal(MIN_HIANYZO_FELIRAT, 2);
  assert.equal(sugoNelkuliFeluletJelzes(md(egyGomb), { szint: 'cegfuggetlen', vanSugoSzoveg: false }), null);
});
t('🧯 GUIDE_UI_NO_HELP: a hedge-elt említés nem állítás', () => {
  assert.equal(sugoNelkuliFeluletJelzes(md(hedge), { szint: 'cegfuggetlen', vanSugoSzoveg: false }), null);
});
t('🧯 GUIDE_UI_NO_HELP: részleges és nincs szintnél is ítél', () => {
  for (const szint of ['reszleges', 'nincs'])
    assert.ok(sugoNelkuliFeluletJelzes(md(ketGomb), { szint, vanSugoSzoveg: false })?.startsWith('GUIDE_UI_NO_HELP'), szint);
});
t('🧯 GUIDE_UI_NO_HELP: teljes súgós eszköz nem bukik itt (0. fázis), súgószövegnél a GUIDE_UI_NOT_IN_HELP mér', () => {
  assert.equal(sugoNelkuliFeluletJelzes(md(ketGomb), { szint: 'teljes', vanSugoSzoveg: false }), null);
  for (const szint of ['teljes', 'reszleges', 'nincs', 'cegfuggetlen'])
    assert.equal(sugoNelkuliFeluletJelzes(md(ketGomb), { szint, vanSugoSzoveg: true }), null, szint);
});
t('🧯 GUIDE_UI_NO_HELP: ismeretlen szint nem ítél; a jelzésben legfeljebb 4 felirat', () => {
  assert.equal(sugoNelkuliFeluletJelzes(md(ketGomb), { szint: 'valami', vanSugoSzoveg: false }), null);
  assert.equal(sugoNelkuliFeluletJelzes(md(ketGomb), undefined), null);
  const sok = 'Click **Alpha Pane**. Tap **Beta Panel**. Press **Gamma Tab**. Select **Delta Menu**. Choose **Epsilon Box**.';
  const j = sugoNelkuliFeluletJelzes(md(sok), { szint: 'nincs', vanSugoSzoveg: false });
  assert.ok(j && (j.match(/"/g) || []).length === 8, String(j));
});
t('🧯 GUIDE_UI_NO_HELP: kill-switch be van kapcsolva; blokkoló; van lecke és magyar név', () => {
  assert.equal(SUGO_NELKULI_FELULET_BE, true);
  assert.equal(isBlocking('GUIDE_UI_NO_HELP: x'), true);
  const l = lessonFor('GUIDE_UI_NO_HELP: x');
  assert.ok(l.length > 60 && l !== 'GUIDE_UI_NO_HELP' && !/\d/.test(l), 'angol lecke, szám nélkül');
  assert.equal(leckeNevHu(l), 'súgó nélkül leírt gomb- és menünevek');
});

// ── VALÓDI ADAT: a publikált cégfüggetlen útmutatók közül legfeljebb 20 kapna jelzést (11-12-i mérés: 14 / 108) ──
function keret(mdTxt, kulcs) {
  const m = String(mdTxt).match(/^---\n([\s\S]*?)\n---/);
  const s = m && m[1].match(new RegExp('^' + kulcs + ':\\s*(.*)$', 'm'));
  return s ? s[1].trim().replace(/^["']|["']$/g, '') : '';
}
t('🔑 VALÓDI ADAT: a túlfékezés elleni védelem — cégfüggetlen útmutatóból legfeljebb 20 kap jelzést', () => {
  const dir = new URL('../content/articles/', import.meta.url);
  const db = { cegfuggetlen: 0, nincs: 0, reszleges: 0, teljes: 0 }, ossz = { cegfuggetlen: 0, nincs: 0, reszleges: 0, teljes: 0 };
  for (const f of readdirSync(dir)) {
    if (!/^ARTICLE_GUIDE_.*\.json$/.test(f)) continue;
    let j; try { j = JSON.parse(readFileSync(new URL(f, dir), 'utf-8')); } catch { continue; }
    const mdTxt = j.article_markdown || '';
    const tool = keret(mdTxt, 'tool') || (j._meta && j._meta.tool) || '';
    const company = keret(mdTxt, 'company') || (j._meta && j._meta.company) || '';
    const szint = forrasSzint(tool, company).szint;
    ossz[szint]++;
    if (sugoNelkuliFeluletJelzes(mdTxt, { szint, vanSugoSzoveg: false })) db[szint]++;
  }
  console.log('     📊 jelzést kapna (jelzés / összes): cégfüggetlen ' + db.cegfuggetlen + '/' + ossz.cegfuggetlen
    + ' · nincs ' + db.nincs + '/' + ossz.nincs + ' · részleges ' + db.reszleges + '/' + ossz.reszleges
    + ' · teljes (súgószöveg nélkül itt nem ítél) ' + db.teljes + '/' + ossz.teljes);
  assert.ok(ossz.cegfuggetlen > 50, 'túl kevés cégfüggetlen útmutatót olvasott: ' + ossz.cegfuggetlen);
  assert.equal(db.teljes, 0, 'teljes súgós útmutató súgószöveg nélkül nem ítélhető');
  assert.ok(db.cegfuggetlen <= 20, '🔴 túlfékezés: ' + db.cegfuggetlen + ' cégfüggetlen útmutató kapna jelzést (max 20)');
});

console.log('\n✅ guide-claims.test: mind a ' + pass + ' eset rendben');
