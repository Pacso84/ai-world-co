// Csalás-képrajzoló (2026-11-23, terv: docs/superpowers/plans/2026-11-21-csalas-figyelo.md 4. rész):
// a cikk kitalált példaüzenetéből sablonból rajzolt, megjelölt kép (4:5 a cikkbe, 16:9 borító), MI nélkül.
// Ingyenes, hálózat nélküli. A példák a 2. rész valódi blokk-formátumában, az értelmező (peldaBlokk) adja őket.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { peldaBlokk } from './csalas-sablon.js';
import {
  KEP_SZ, RAJZ_V, rajzSablon, kepTordel, csalasKepSvg, rajzolCsalasKep, betuAllapot,
} from './csalas-kep.js';
import { csalasKepekFuttat, csalasKepRiportSorok } from './csalas-kepek.js';

let hiba = 0;
const tesztek = [];
const t = (nev, fn) => tesztek.push([nev, fn]);

const cikk = (blokk, lista) => `---
title: "Minta"
---

## What's happening

Valami.

## Warning signs

${blokk}

${lista}

## How to protect yourself

1. Lépés.
`;

const LISTA_EN = `1. **Unknown number** — real delivery companies don't text like this.
2. **Pressure** — so you don't have time to think.
3. **Odd link** — it's not the company's own address.`;

const SMS_EN = cikk(`> 🧪 [sms]
> 👤 [[1|+1 (555) 555-0199]]
> Your package is on hold because the address is incomplete.
> [[2|It will be deleted in 24 hours!]]
> Confirm here: [[3|parcel-track.example.com]]`, LISTA_EN);

const SMS_HU = cikk(`> 🧪 [sms]
> 👤 [[1|+1 (555) 555-0199]]
> A csomagod elakadt, mert hiányos a cím.
> [[2|24 órán belül törlődik!]]
> Erősítsd meg itt: [[3|csomag-kovetes.example.com]]`, `1. **Ismeretlen szám** — a valódi futárcég nem így ír.
2. **Sürgetés** — hogy ne legyen időd gondolkodni.
3. **Furcsa link** — nem a cég saját címe.`);

const EMAIL_EN = cikk(`> 🧪 [email]
> 👤 [[1|Account Team <security@account-alerts.example.com>]]
> 📌 Unusual sign-in detected
> We noticed a sign-in to your account from a new location.
> [[2|Verify within 2 hours or your account will be locked.]]
> Review activity: [[3|secure-login.example.com/verify]]`, `1. **Odd sender** — the address isn't the company's own.
2. **Deadline** — a threat to make you hurry.
3. **Fake login page** — the link leads somewhere else.`);

const CHAT_EN = cikk(`> 🧪 [chat]
> 👤 [[1|Mom (new number)]]
> Hi, it's me. I dropped my phone and this is my new number.
> I need to pay a bill today and my card isn't working.
> [[2|Can you send me the money right now? I'll pay you back tomorrow.]]
> [[3|Please don't call, I can't talk right now.]]`, `1. **New number** — a family member suddenly writes from an unknown number.
2. **Money, fast** — an urgent request to send money.
3. **No calls** — they avoid a call so you can't check.`);

const CALL_EN = cikk(`> 🧪 [call]
> 👤 [[1|Unknown caller · +1 (555) 555-0142]]
> This is your bank's fraud department.
> [[2|Someone is using your card right now.]]
> [[3|Read me the code we just texted you so we can stop it.]]`, `1. **Unexpected call** — they called you, not the other way around.
2. **Alarm** — a scare so you act before thinking.
3. **Asks for a code** — no real bank asks for this code.`);

const SOCIAL_EN = CHAT_EN.replace('[chat]', '[social]');
const WEB_EN = EMAIL_EN.replace('[email]', '[web]');

const DOBOZOK = { sms: SMS_EN, email: EMAIL_EN, chat: CHAT_EN, call: CALL_EN, social: SOCIAL_EN, web: WEB_EN };

t('KEP_SZ: 3 nyelv, a terv szövegeivel; a vízjel egyezik a 2. rész PELDA_VIZJEL-ével', async () => {
  assert.deepEqual(Object.keys(KEP_SZ).sort(), ['en', 'es', 'hu']);
  assert.equal(KEP_SZ.en.cim, 'What this scam looks like');
  assert.equal(KEP_SZ.hu.vizjel, 'PÉLDA – CSALÁS');
  assert.equal(KEP_SZ.es.lab, 'Ejemplo inventado para ayudarte a reconocerla · aiworldhq.com');
  const { PELDA_VIZJEL } = await import('./csalas-sablon.js');
  for (const l of ['en', 'hu', 'es']) assert.equal(KEP_SZ[l].vizjel, PELDA_VIZJEL[l]);
  // a felület-feliratok (feladó, tárgy, bejövő hívás) is mindhárom nyelven megvannak
  for (const l of ['en', 'hu', 'es']) for (const k of ['felado', 'targy', 'bejovo', 'mondja']) assert.ok(KEP_SZ[l][k], `${l}.${k}`);
});

t('rajzSablon: 4 saját sablon, social → chat, web → email, ismeretlen → null', () => {
  assert.equal(rajzSablon('sms'), 'sms');
  assert.equal(rajzSablon('email'), 'email');
  assert.equal(rajzSablon('chat'), 'chat');
  assert.equal(rajzSablon('call'), 'call');
  assert.equal(rajzSablon('social'), 'chat');
  assert.equal(rajzSablon('web'), 'email');
  assert.equal(rajzSablon('fax'), null);
});

t('kepTordel: a jelölt rész MINDIG külön sorban kezdődik és végződik; a hosszú sor tördelődik', () => {
  const p = peldaBlokk(SMS_EN);
  const sorok = kepTordel(p.sorok, 30, 500);
  const jelSor = sorok.filter(s => s.jel === '3');
  assert.equal(jelSor.length, 1);
  assert.equal(jelSor[0].szoveg, 'parcel-track.example.com');
  assert.ok(sorok.some(s => s.szoveg === 'Confirm here:' && !s.jel), 'a jel előtti szöveg külön sor');
  assert.ok(sorok.filter(s => !s.jel).length >= 3, 'az első mondat tördelődik 500 px-en');
  assert.ok(!sorok.some(s => s.szoveg.includes('[[')), 'a jelölés nem kerül a képre');
});

t('csalasKepSvg: a képen a feladó, a jelölt szöveg, a ①②③, a vízjel és a lábjegyzet a cikk nyelvén', () => {
  const svg = csalasKepSvg(peldaBlokk(SMS_HU), { lang: 'hu', format: '4x5' });
  assert.ok(svg.includes('width="1080" height="1350"'));
  for (const s of ['Így néz ki ez a csalás', 'PÉLDA – CSALÁS', 'Kitalált példa a felismeréshez', '+1 (555) 555-0199',
    'csomag-kovetes.example.com', 'Ismeretlen szám', 'Sürgetés', 'Furcsa link']) assert.ok(svg.includes(s), s);
  assert.ok(!svg.includes('[['), 'jelölő-szintaxis nincs a képen');
  assert.ok(!/What this scam|EXAMPLE – SCAM|Made-up example/.test(svg), 'angol felirat nincs a magyar képen');
  assert.equal((svg.match(/stroke-dasharray/g) || []).length >= 3, true, 'legalább 3 szaggatott keret');
});

t('csalasKepSvg: e-mailnél fejléc + tárgy, hívásnál bejövő-hívás felirat — a cikk nyelvén', () => {
  const em = csalasKepSvg(peldaBlokk(EMAIL_EN), { lang: 'en', format: '4x5' });
  assert.ok(em.includes('Unusual sign-in detected') && em.includes(KEP_SZ.en.targy) && em.includes(KEP_SZ.en.felado));
  assert.ok(em.includes('Account Team') && em.includes('&lt;security@account-alerts.example.com&gt;'), 'a feladó XML-escape-elve');
  assert.ok(!/<security@/.test(em), 'nyers < nincs a képen');
  const ca = csalasKepSvg(peldaBlokk(CALL_EN), { lang: 'es', format: '4x5' });
  assert.ok(ca.includes(KEP_SZ.es.bejovo));
});

t('rajzolCsalasKep: 4x5 = 1080×1350 JPEG, 16x9 = 1280×720 JPEG (a valódi sharp-pal)', async () => {
  const p = peldaBlokk(SMS_HU);
  const a = await sharp(await rajzolCsalasKep(p, { lang: 'hu', format: '4x5' })).metadata();
  assert.deepEqual([a.width, a.height, a.format], [1080, 1350, 'jpeg']);
  const b = await sharp(await rajzolCsalasKep(p, { lang: 'hu', format: '16x9' })).metadata();
  assert.deepEqual([b.width, b.height, b.format], [1280, 720, 'jpeg']);
});

t('rajzolCsalasKep: mind a 6 csatorna rajzol (4 saját sablon + social/web átvétel), mindkét formátumban', async () => {
  for (const [cs, md] of Object.entries(DOBOZOK)) {
    const p = peldaBlokk(md);
    for (const format of ['4x5', '16x9']) {
      const m = await sharp(await rajzolCsalasKep(p, { lang: 'en', format })).metadata();
      assert.equal(m.format, 'jpeg', `${cs} ${format}`);
    }
  }
});

t('rajzolCsalasKep: nem biztonságos példa (valódi márka / domain / szám) → elutasít, kép nem készül', async () => {
  const rossz = [
    SMS_EN.replace('parcel-track.example.com', 'paypal-help.com'),
    SMS_EN.replace('Your package', 'Your Amazon package'),
    SMS_EN.replace('+1 (555) 555-0199', '+1 (800) 555-1234'),
  ];
  for (const md of rossz) {
    await assert.rejects(() => rajzolCsalasKep(peldaBlokk(md), { lang: 'en', format: '4x5' }));
  }
  await assert.rejects(() => rajzolCsalasKep(null, { lang: 'en', format: '4x5' }));
});

t('rajzolCsalasKep: ismeretlen nyelv / formátum → elutasít (nem rajzol angol feliratot csendben)', async () => {
  const p = peldaBlokk(SMS_EN);
  await assert.rejects(() => rajzolCsalasKep(p, { lang: 'de', format: '4x5' }));
  await assert.rejects(() => rajzolCsalasKep(p, { lang: 'en', format: '1x1' }));
});

t('csalasKepSvg: hosszú üzenet is a vásznon belül marad (a jelmagyarázat alja a lábjegyzet fölött)', () => {
  const hosszu = cikk(`> 🧪 [sms]
> 👤 [[1|+1 (555) 555-0199]]
> ${'Your package is on hold because the address is incomplete and we could not deliver it today. '.repeat(2)}
> ${'We tried to reach you several times but nobody answered the door at the address. '.repeat(2)}
> [[2|${'It will be deleted in 24 hours unless you act now! '.repeat(2)}]]
> Confirm here: [[3|parcel-track.example.com/confirm-address-now]]`, LISTA_EN.replace("real delivery companies don't text like this.", 'real delivery companies do not send texts like this from random personal numbers, and never ask for fees this way.'));
  const svg = csalasKepSvg(peldaBlokk(hosszu), { lang: 'en', format: '4x5' });
  const ys = [...svg.matchAll(/ y="(\d+(?:\.\d+)?)"/g)].map(m => Number(m[1]));
  assert.ok(Math.max(...ys) <= 1350, 'minden elem a vásznon belül');
  const m = svg.match(/data-jelmagyarazat-alja="(\d+(?:\.\d+)?)"/);
  assert.ok(m && Number(m[1]) < 1270, 'a jelmagyarázat nem lóg a lábjegyzetre: ' + (m && m[1]));
});

t('betuAllapot: hamis sharp-pal mindhárom kimenet (ok / nincs változó vastagság / nem mérhető)', async () => {
  // A valódi mérés a CI-ben fut; itt a döntési ágakat járjuk végig determinisztikusan.
  const mk = (fn) => (input) => ({ raw: () => ({ toBuffer: async () => fn(String(input)) }) });
  const kep = (s) => Buffer.from(s.includes('Zzqqx') ? 'alap' + (s.includes('font-size="28"') ? 'k' : '') : s.includes('font-weight="900"') ? 'vastag' : 'normal');
  assert.equal((await betuAllapot(mk(kep))).ok, true);
  const egyforma = (s) => Buffer.from(s.includes('Zzqqx') ? 'alap' + (s.includes('font-size="28"') ? 'k' : '') : 'vastag');
  assert.equal((await betuAllapot(mk(egyforma))).ok, false);
  assert.equal((await betuAllapot(mk(() => Buffer.from('x')))).ok, null);
  assert.equal((await betuAllapot(undefined)).ok, null);
});

// ── a CLI magja (core/csalas-kepek.js) egy ideiglenes repó-gyökérben ──────────────────
const ARTICLE = 'ARTICLE_2026-11-23T10-00-00-000Z_ic3_Package_scam.json';
function gyoker() {
  const R = mkdtempSync(join(tmpdir(), 'csalas-kep-'));
  for (const d of ['content/articles', 'content/translations', 'website/assets/images', 'memory']) mkdirSync(join(R, d), { recursive: true });
  writeFileSync(join(R, 'content/articles', ARTICLE), JSON.stringify({ article_markdown: SMS_EN, _meta: { slug: 'package-scam', csalas: true } }));
  writeFileSync(join(R, 'content/translations', ARTICLE), JSON.stringify({ hu: SMS_HU, es: SMS_EN.replace('[sms]', '[nope]') }));
  // egy rendes (nem csalás) cikk: hozzá SEMMI nem készül
  writeFileSync(join(R, 'content/articles', 'ARTICLE_2026-11-23T11-00-00-000Z_x_Other.json'), JSON.stringify({ article_markdown: SMS_EN, _meta: { slug: 'other' } }));
  return R;
}

t('csalasKepekFuttat: kikapcsolt kapcsolónál semmit nem csinál (nincs kép, nincs őrszem-írás)', async () => {
  const R = gyoker();
  try {
    const r = await csalasKepekFuttat({ ROOT: R, be: false });
    assert.equal(r.kihagyva, true);
    assert.ok(!existsSync(join(R, 'website/assets/images/csalas')));
    assert.ok(!existsSync(join(R, 'memory/csalas-guard.json')));
  } finally { rmSync(R, { recursive: true, force: true }); }
});

t('csalasKepekFuttat: bekapcsolva nyelvenként 4x5 + 16x9, angol borító; a hibás nyelv a kep_hibak-ba, a többi elkészül', async () => {
  const R = gyoker();
  try {
    const r = await csalasKepekFuttat({ ROOT: R, be: true, sharpModul: sharp });
    const I = join(R, 'website/assets/images');
    for (const f of ['csalas/package-scam-en.jpg', 'csalas/package-scam-hu.jpg', 'csalas/package-scam-en-16x9.jpg',
      'csalas/package-scam-hu-16x9.jpg', 'package-scam.jpg']) assert.ok(existsSync(join(I, f)), f);
    assert.ok(!existsSync(join(I, 'csalas/package-scam-es.jpg')), 'a hibás spanyol blokkból nem készül kép');
    assert.ok(!existsSync(join(I, 'other.jpg')) && !existsSync(join(I, 'csalas/other-en.jpg')), 'nem csalás-cikkhez nincs kép');
    const borito = await sharp(join(I, 'package-scam.jpg')).metadata();
    assert.deepEqual([borito.width, borito.height], [1280, 720]);
    const g = JSON.parse(readFileSync(join(R, 'memory/csalas-guard.json'), 'utf-8'));
    assert.ok(g.kep_at, 'őrszem-időbélyeg');
    assert.equal(g.kep_hibak.length, 1);
    assert.match(g.kep_hibak[0].hiba, /csatorna|példablokk/);
    assert.equal(g.kep_hibak[0].lang, 'es');
    // 🛡️ 13. rész: + az angol Reel-kártya (PNG, átlátszó háttér) — csak angolul
    const kartya = await sharp(join(I, 'csalas/package-scam-kartya.png')).metadata();
    assert.equal(kartya.format, 'png');
    assert.ok(kartya.hasAlpha, 'a kártya háttere átlátszó legyen');
    assert.ok(!existsSync(join(I, 'csalas/package-scam-hu-kartya.png')) && !existsSync(join(I, 'csalas/package-scam-kartya-hu.png')));
    assert.equal(r.kesz, 6);
    // második futás: változatlan példa → nem rajzol újra (hash), de az őrszem friss
    const r2 = await csalasKepekFuttat({ ROOT: R, be: true, sharpModul: sharp });
    assert.equal(r2.kesz, 0);
    assert.equal(r2.valtozatlan, 6);
  } finally { rmSync(R, { recursive: true, force: true }); }
});

t('csalasKepekFuttat: a meglévő őrszem-mezőket (más részek adatát) megtartja', async () => {
  const R = gyoker();
  try {
    writeFileSync(join(R, 'memory/csalas-guard.json'), JSON.stringify({ forras_at: 'x', talalat: 2 }));
    await csalasKepekFuttat({ ROOT: R, be: true, sharpModul: sharp });
    const g = JSON.parse(readFileSync(join(R, 'memory/csalas-guard.json'), 'utf-8'));
    assert.equal(g.forras_at, 'x');
    assert.equal(g.talalat, 2);
    assert.ok(Array.isArray(g.kep_hibak));
  } finally { rmSync(R, { recursive: true, force: true }); }
});

t('csalasKepRiportSorok: jó napon csend; elmaradt kép és hiányzó normál betű → magyar riport-sor', () => {
  assert.deepEqual(csalasKepRiportSorok(null), []);
  assert.deepEqual(csalasKepRiportSorok({ at: 'x', kep_hibak: [], kep_betu: { ok: true } }), []);
  assert.deepEqual(csalasKepRiportSorok({ kep_hibak: [], kep_betu: { ok: null, reason: 'nem mérhető' } }), [], 'a „nem tudom” nem riaszt');
  const s = csalasKepRiportSorok({
    kep_hibak: [{ slug: 'a', lang: 'es', hiba: 'nincs példablokk' }, { slug: 'b', lang: 'en', hiba: 'nem biztonságos példa: tiltott név: Amazon' }, { slug: 'c', lang: 'hu', hiba: 'x' }],
    kep_betu: { ok: false, reason: 'a normál (500) vastagság nem jött meg' },
  });
  assert.equal(s.length, 2);
  assert.match(s[0], /^🛡️ CSALÁS-KÉP: 3 kép nem készült el — a \[es\]: nincs példablokk · b \[en\]/);
  assert.match(s[1], /betű: a normál \(500\) vastagság/);
});

t('csalasKepekFuttat: az őrszem `at` bélyeget is ír (a napi riport frissesség-térképe ezt nézi)', async () => {
  const R = gyoker();
  try {
    await csalasKepekFuttat({ ROOT: R, be: true, sharpModul: sharp, now: new Date('2026-11-23T12:00:00Z') });
    const g = JSON.parse(readFileSync(join(R, 'memory/csalas-guard.json'), 'utf-8'));
    assert.equal(g.at, '2026-11-23T12:00:00.000Z');
  } finally { rmSync(R, { recursive: true, force: true }); }
});

// ── bekötés (szöveg-őr: az agentet NEM importáljuk, mert a main() feltétel nélkül fut) ─────────────
const GY = new URL('..', import.meta.url);
t('designer: a csalás-hírt kihagyja az új-borítós ÉS a --refresh ágon is (csalasHir)', () => {
  const src = readFileSync(new URL('agents/designer/agent.js', GY), 'utf-8');
  assert.match(src, /import \{ csalasHir \} from '\.\.\/\.\.\/core\/csalas-figyelo\.js'/);
  assert.match(src, /\.filter\(x => x && x\.d\._meta\?\.published_at[^\n]*!csalasHir\(x\.d\._meta\)\)/, 'a --refresh szűrő');
  const ciklus = src.slice(src.indexOf('for (const file of files)'));
  const kihagy = ciklus.indexOf('if (csalasHir(data._meta)) { skipped++; continue; }');
  assert.ok(kihagy > 0 && kihagy < ciklus.indexOf('generateImage('), 'a fő ciklus a képgenerálás ELŐTT kihagyja');
});

t('auto.yml: a csalás-kép lépés a betűtelepítés után, a Reel-gyártás előtt, if: always(), a betűt utána leveszi', () => {
  const yml = readFileSync(new URL('.github/workflows/auto.yml', GY), 'utf-8');
  const i = n => yml.indexOf(`- name: ${n}`);
  const csalas = i('Csalás-képek (példaüzenet-rajz + borító, a Reel ELŐTT)');
  assert.ok(csalas > 0, 'van ilyen lépés');
  assert.ok(i('Betűtípus telepítése (a Reel-táblákhoz)') < csalas && csalas < i('Reel — napi videó gyártása (a build ELŐTT)'));
  const lepes = yml.slice(csalas, i('Reel — napi videó gyártása (a build ELŐTT)'));
  assert.match(lepes, /if: always\(\)/);
  assert.match(lepes, /node core\/csalas-kepek\.js \|\| true/);
  assert.ok(lepes.indexOf('cp shared/fonts/schibsted-grotesk-var.ttf') < lepes.indexOf('node core/csalas-kepek.js')
    && lepes.indexOf('node core/csalas-kepek.js') < lepes.indexOf('rm -f "$VF"'), 'telepít → rajzol → levesz');
  assert.ok(existsSync(new URL('shared/fonts/schibsted-grotesk-var.ttf', GY)), 'a betűfájl a repóban');
});

t('RAJZ_V: egész szám (a rajz változásakor emelve minden kép újrarajzolódik)', () => {
  assert.ok(Number.isInteger(RAJZ_V) && RAJZ_V >= 1);
});

console.log('\n🧪 csalas-kep (képrajzoló, CLI)');
for (const [nev, fn] of tesztek) {
  try { await fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + String(e?.message || e).split('\n')[0]); }
}
console.log(`\n${hiba === 0 ? '✅' : '❌'} csalas-kep.test: ${tesztek.length - hiba} rendben, ${hiba} bukott`);
if (hiba) process.exit(1);
