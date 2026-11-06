// ===================================================================
// TESZT — a napi Telegram-riport a VALÓSÁGOT mondja (2026-11-05)
// ===================================================================
// User 11-05: „még mindig azt írja, hogy elavult forrásból írunk! … nézd át a többit is,
// hogy átláthatóbb legyen, és a valóságot tükrözze!”
// Ingyenes, hálózat nélküli. Fut: node core/run-tests.js
// ===================================================================

import assert from 'assert/strict';
import { readFileSync } from 'fs';
import * as awaitFs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { judgeSource, reportLine, RSS_KORHATAR_ELES, collectArticleStats } from './source-report-card.js';
import { rovidCim, fonokiDontesSor, kimenetOrSor, kimaradtSzoveg, elakadasLine, tenyellenorzoLine } from './report-lines.js';
import { tiktokSor, tiktokHianyOk } from './buffer-guard.js';
import { cardsFromGuide } from './short-video.js';
import { lepesekMdbol } from './social-poster.js';
import { insertMidGuide } from './mid-guide.js';
import { paritasElemzes } from './template-parity.js';
import { nemVideozhatoFrissek, tiktokNincsMibolOk } from './reel-post.js';
import { szurZajt } from './report-noise.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };
console.log('🧪 a napi riport a valóságot mondja\n');

// ── 1. ELAVULT FORRÁS ─────────────────────────────────────────────
t('🕰️ a 11-05-i ÉLŐ eset (Sony, 10-21-i cikk, a korhatár ELŐTT) már NEM „ELAVULT forrásból írunk”', () => {
  const sony = { feedAgeDays: 128, published30d: 1, published30dAfterAgeGuard: 0, truthBlocks: 0, truthUnfixed: 0, totalAttempts: 0, alreadyDisabled: false };
  assert.notEqual(judgeSource(sony).verdict, 'stale');
});

t('🕰️ a korhatár UTÁN írt cikk elavult feedből továbbra is ⚠️ ELAVULT (valódi új hiba)', () => {
  const uj = { feedAgeDays: 128, published30d: 2, published30dAfterAgeGuard: 1, truthBlocks: 0, truthUnfixed: 0, totalAttempts: 0, alreadyDisabled: false };
  const j = judgeSource(uj);
  assert.equal(j.verdict, 'stale');
  assert.match(j.reason, /mégis 1 "friss" cikket/);
  // régi hívó (mező nélkül) → a régi viselkedés
  assert.equal(judgeSource({ ...uj, published30dAfterAgeGuard: undefined }).verdict, 'stale');
});

t('🕰️ a gyűjtő a korhatár előtti és utáni cikket külön számolja', () => {
  const dir = join(ROOT, 'core', '__nincs_ilyen_mappa__');   // üres → 0; a valódi számolás a lenti mintán
  assert.deepEqual(collectArticleStats({ articlesDir: dir, truthLog: {} }), {});
  assert.ok(RSS_KORHATAR_ELES.startsWith('2026-10-29T'), 'a korhatár élesítésének ideje (e2c341c2)');
  const src = readFileSync(join(ROOT, 'core', 'source-report-card.js'), 'utf-8');
  assert.match(src, /published_at \|\| ''\) >= RSS_KORHATAR_ELES\) a\.published30dAfterAgeGuard\+\+/);
});

t('🏷️ a „(hivatalos)” végződés tényleg leválik a forrásnévről (a regex backslash nélkül volt)', () => {
  const sor = reportLine({ autoDisabled: [], proposals: [{ name: 'IBM Research (hivatalos)', reason: 'él, de 30 napja egy cikket sem adott' }] });
  assert.match(sor, /Nem termel \(1\): IBM Research — /);
});

t('🔇 a forrás-blokk SORONKÉNT megy a riportba → a „Nem termel” lista nem lovagol a ⚠️ soron', () => {
  const dr = readFileSync(join(ROOT, 'core', 'daily-report.js'), 'utf-8');
  assert.match(dr, /lines\.push\(\.\.\.srcLine\.split\('\\n'\)/);
  // a zajszűrő: két külön sor → a változatlan „Nem termel” lista néma, a ⚠️ sor kimegy
  const ki = szurZajt(['⚠️ ELAVULT forrásból írunk (1): X — …', '🔎 Nem termel (2): A, B — érdemes megnézni'],
    { nemTermel: ['A', 'B'] });
  assert.equal(ki.sorok.length, 1);
  assert.match(ki.sorok[0], /^⚠️ ELAVULT/);
});

// ── 2. TIKTOK: valódi ok, nem nem létező sorokra mutogatás ────────
t('🎵 a 11-05-i útmutató („## Step 1: …”) videózható — eddig 0 lépést látott a gyártó', () => {
  const md = ['---', 'title: "How to Write a Polite No Using Grok"', '---', '# How to Write a Polite No',
    '## Before you start', 'x', '## Step 1: Open a new chat with Grok', 'a', '## Step 2: Describe the situation', 'b',
    '## Step 3: Ask for a tone', 'c', '## Step 4: Review the draft', 'd', '## Common mistakes', 'e'].join('\n');
  const r = cardsFromGuide(md);
  assert.ok(r.cards, r.reason);
  assert.equal(lepesekMdbol(md).length, 4);
  assert.deepEqual(lepesekMdbol(md).slice(0, 2), ['Open a new chat with Grok', 'Describe the situation']);
  // a gondolatjeles alak változatlanul megy
  assert.equal(lepesekMdbol('## Step 1 — Egy\n## Step 2 – Kettő\n## Step 3 - Három').length, 3);
});

t('🎵 a TikTok-hiány sora az OKOT mondja, és nem hivatkozik nem létező „REEL- és BUFFER-sorokra”', () => {
  const D = Date.parse('2026-11-05T16:00:00Z');
  const g = { tiktokMa: { nap: '2026-11-05', db: 3, plafon: 6, video: 1, foto: 2 } };
  const ok = tiktokHianyOk({ at: '2026-11-05T16:02:11Z', prepare: { nemVideozhato: [{ slug: 's', cim: "How to write a polite 'no' using Grok", ok: 'csak 0 lépés (legalább 3 kell)' }] } }, '2026-11-05');
  const sor = tiktokSor(g, D, { ok });
  assert.match(sor, /^⚠️ TIKTOK: ma eddig csak 1 videó ment ki \(cél: 3\) \+ 2 fotó — nem készülhetett videó/);
  assert.match(sor, /csak 0 lépés/);
  assert.doesNotMatch(sor, /nézd meg a REEL- és BUFFER-sorokat/);
  // ok nélkül is őszinte
  assert.match(tiktokSor(g, D), /az okát a videó-gyártás nem jegyezte fel/);
  // tegnapi feljegyzés nem ok ma
  assert.equal(tiktokHianyOk({ at: '2026-11-04T16:00:00Z', prepare: { nemVideozhato: [{ ok: 'x', slug: 'y' }] } }, '2026-11-05'), '');
});

t('🎵 11-06: „nincs miből” — ha minden friss útmutatóból volt már videó, a TikTok-sor EZT mondja', () => {
  const D = Date.parse('2026-11-06T16:00:00Z');
  const g = { tiktokMa: { nap: '2026-11-06', db: 4, plafon: 6, video: 2, foto: 2 } };
  const okSz = tiktokNincsMibolOk(7);
  const ok = tiktokHianyOk({ at: '2026-11-06T15:40:00Z', prepare: { ok: true, tiktokExtraOk: okSz } }, '2026-11-06');
  assert.equal(ok, okSz);
  const sor = tiktokSor(g, D, { ok });
  assert.match(sor, /nincs miből több videót gyártani: az elmúlt 7 nap/);
  assert.doesNotMatch(sor, /nem jegyezte fel/);
  // a konkrét útmutató-ok (0 lépés) előnyt élvez
  const mindketto = tiktokHianyOk({ at: '2026-11-06T15:40:00Z', prepare: { tiktokExtraOk: okSz, nemVideozhato: [{ slug: 's', ok: 'csak 0 lépés' }] } }, '2026-11-06');
  assert.match(mindketto, /csak 0 lépés/);
  // a bekötés: a gyártó visszaadja, a fázis-író elmenti, a prepare továbbadja
  const rp = readFileSync(join(ROOT, 'core', 'reel-post.js'), 'utf-8');
  assert.match(rp, /mellek\.tiktokExtraOk = ki\.tiktokExtraOk/, '🔴 az ok nem kerül az őrszem-fájlba');
  assert.match(rp, /extra = await prepareTiktokExtra\(ROOT, join\)/, '🔴 a prepare eldobja az extra-gyártó okát');
  assert.match(rp, /return \{ tiktokExtraOk: ok \}/, '🔴 a TikTok-extra gyártó nem adja vissza az okot');
});

t('🎵 a Reel-gyártó a friss, videó nélküli, nem videózható útmutatót okkal adja vissza', () => {
  const now = Date.parse('2026-11-05T16:00:00Z');
  const cikkek = [
    { type: 'guide', slug: 'a', title: 'A', published_at: '2026-11-05T04:18:00Z', reel_at: '', md: 'ROSSZ' },
    { type: 'guide', slug: 'b', title: 'B', published_at: '2026-11-05T04:17:00Z', reel_at: '2026-11-05T04:30:00Z', md: 'ROSSZ' },
    { type: 'guide', slug: 'c', title: 'C', published_at: '2026-11-01T04:17:00Z', reel_at: '', md: 'ROSSZ' },
    { type: 'news', slug: 'd', title: 'D', published_at: '2026-11-05T04:17:00Z', reel_at: '', md: 'ROSSZ' },
    { type: 'guide', slug: 'e', title: 'E', published_at: '2026-11-05T04:19:00Z', reel_at: '', md: 'JO' }
  ];
  const ki = nemVideozhatoFrissek(cikkek, now, md => md === 'ROSSZ' ? 'csak 0 lépés' : '');
  assert.deepEqual(ki, [{ slug: 'a', cim: 'A', ok: 'csak 0 lépés' }]);
  const rp = readFileSync(join(ROOT, 'core', 'reel-post.js'), 'utf-8');
  assert.match(rp, /mellek\.nemVideozhato = ki\.nemVideozhato/, 'az ok bekerül az őrszem-fájlba');
});

// ── 3. KÖZÉP-DOBOZ az útmutatókban (a kimenet-őr 11-04 óta jelezte) ──
t('📘 a közép-doboz a build.js VALÓDI lépés-jelölőjénél („g-step g-slide”) is a helyére kerül', () => {
  const b = readFileSync(join(ROOT, 'website', 'build.js'), 'utf-8');
  const sablon = (b.match(/<div class="g-step[^"]*" id="step-\$\{stepNo\}">/) || [])[0];
  assert.ok(sablon, 'a build.js lépés-sablonja nem található');
  const torzs = n => Array.from({ length: n }, (_, i) => sablon.replace('${stepNo}', i + 1) + `L${i + 1}</div>`).join('\n');
  const DOBOZ = '<aside class="midread">X</aside>';
  for (const n of [5, 6, 8]) {
    const ki = insertMidGuide(torzs(n), n, DOBOZ);
    assert.equal(ki.split(DOBOZ).length - 1, 1, `${n} lépés: pontosan egy doboz`);
  }
});

t('🧩 a „pack-foot” (PDF-csomag ajánló) szándékosan csak útmutatóban van → nem ismeretlen eltérés', () => {
  const hir = Array.from({ length: 3 }, () => '<article><p class="x">h</p></article>');
  const utm = Array.from({ length: 3 }, () => '<article><div class="g-steps"></div><p class="pack-foot">p</p></article>');
  const r = paritasElemzes([...hir, ...utm], { minLap: 1 });
  assert.ok(r.csakUtm.includes('pack-foot'));
  assert.ok(!r.ismeretlenUtm.includes('pack-foot'));
});

// ── 4. KÖZÉRTHETŐ SOROK ───────────────────────────────────────────
t('✂️ a címek szóhatáron rövidülnek (eddig: „…és mi mar”)', () => {
  const c = 'Így készíti el az AI az első munkahelyi vázlatot – és mi marad az emberi munkának';
  const r = rovidCim(c, 60);
  assert.ok(r.endsWith('…') && r.length <= 60, r);
  assert.ok(!/\bmar…$/.test(r), r);
  assert.equal(rovidCim('Rövid cím', 60), 'Rövid cím');
});

t('🧩 a kimenet-őr sora emberi nyelven szól (a 11-05-i élő lelet)', () => {
  const og = { hir: 457, utmutato: 367, problems: [
    { code: 'PARITAS_CSAK_HIR', uzenet: 'csak a hírben van, az útmutatóban nincs: midread, midread__arrow, midread__lbl, midread__link', elemek: ['midread', 'midread__arrow', 'midread__lbl', 'midread__link'] },
    { code: 'H1_NEM_EGY', uzenet: '🔠 2 lapon nem pontosan 1 főcím (H1) van — Bing-hiba! pl. a, b' }
  ] };
  const s = kimenetOrSor(og);
  assert.match(s, /az útmutató-oldalakról hiányzik, ami a híreken megvan: az „Ezt olvasd utána” doboz/);
  assert.doesNotMatch(s, /midread__/);
  assert.match(s, /🔠 2 lapon/, 'a H1-lelet szövege változatlanul kimegy');
  assert.match(s, /457 hír \+ 367 útmutató átnézve$/);
  assert.equal(kimenetOrSor({ problems: [] }), '');
});

t('👔 a főnöki döntés érthető (eddig: „Újraindítva (rewrite-explainer, 1. főnöki kör)”)', () => {
  const s = fonokiDontesSor(['Újraindítva (rewrite-explainer, 1. főnöki kör): "Heimstaden is changing residential real estate management wi"']);
  assert.match(s, /^👔 Főnöki döntés ma: 1 — újraíratta közérthetőbben: „Heimstaden/);
  assert.doesNotMatch(s, /rewrite-explainer|főnöki kör/);
  assert.match(fonokiDontesSor(['Elvetve (okafogyott): "X"', 'Duplikátum lezárva: "Y"', 'Valami más']), /…és még 1$/);
  assert.equal(fonokiDontesSor([]), '');
});

t('🔧 a „kimaradt: index ×3” belső kód helyett mondat', () => {
  assert.equal(kimaradtSzoveg('index ×3'), '3 útmutató (nem kaptunk cikklistát a gyártó súgójából)');
  assert.equal(kimaradtSzoveg('keret'), 'elfogyott a napi keret');
  assert.equal(kimaradtSzoveg('ismeretlen ×2'), 'ismeretlen ×2');
  assert.match(elakadasLine({ nap: '2026-11-05', uj: 1, forditva: 2, koltseg: 0.002772, kimaradt: 'index ×3' }, '2026-11-05'),
    /^🔧 „Ha elakadsz” dobozok: 1 új, 2 fordítás \(\$0\.003\) · kimaradt: 3 útmutató \(nem kaptunk cikklistát/);
});

t('🕵️ a tény-ellenőrző minden tétele megmondja a fajtáját (eddig nem derült ki, melyik gyanú)', () => {
  const now = Date.parse('2026-11-05T16:00:00Z');
  const s = tenyellenorzoLine([{ at: '2026-11-05T15:00:00Z', osszes: 3, cost: 0.05,
    darab: { ok: 1, javitva: 0, gyanu: 1, visszautasitva: 1, kihagyva: 0, ertelmezhetetlen: 0 },
    items: [{ eredmeny: 'gyanu', cim: 'Meet', ok_hu: 'dátum-ellentmondás' }, { eredmeny: 'visszautasitva', cim: 'Picsart', ok_hu: 'a javítás törölne egy mondatot, amit a forrás igazol' }] }], now);
  assert.match(s, /🙋 1 gyanú \(nem javítottuk\)/);
  assert.match(s, /⛔ 1 javítás-javaslatot nem engedtünk át/);
  assert.match(s, /• ⛔ nem engedtük „Picsart”/);
  assert.match(s, /• 🙋 gyanú „Meet”/);
});

// ── 5. ELVESZETT BACKSLASH A REGEXEKBEN ───────────────────────────
// 11-05: ugyanazon a napon HÁROM helyen: `/s*(hivatalos)$/` (forrás-sor), `/s+/g` (kitölthető-sor), és
// `[p{L}]` / `18.d` (ismert-tevedesek.js: ChatGPT Team, Apple Intelligence iOS 18) — a minta „működött”, csak mást
// jelentett. Az őr a komment nélküli kódsorokban keresi a jellegzetes alakokat.
t('🔍 nincs backslash nélküli \\p{L} / \\p{N}, és nincs „/s+/” „/s*” kezdetű regex a kódban', () => {
  const { readdirSync, statSync } = awaitFs;
  const fajlok = [];
  const jar = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (!/node_modules|public|_forrasok/.test(f)) jar(p); } else if (/\.(m?js)$/.test(f) && !/\.test\.js$/.test(f)) fajlok.push(p); } };
  jar(join(ROOT, 'core')); jar(join(ROOT, 'agents'));
  const rossz = [];
  for (const p of fajlok) {
    readFileSync(p, 'utf-8').split(/\r?\n/).forEach((sor, i) => {   // Windows-sorvég: a \r mellett a `.*$` nem ér a végére
      const kod = sor.replace(/\/\/.*$/, '');
      if (/^\s*\*/.test(sor)) return;   // JSDoc-sor
      if (/(?<!\\)p\{[LN]\}/.test(kod) && /[[(]/.test(kod)) rossz.push(`${p.slice(ROOT.length + 1)}:${i + 1}: ${sor.trim().slice(0, 90)}`);
      if (/\(\/s[+*]/.test(kod)) rossz.push(`${p.slice(ROOT.length + 1)}:${i + 1}: ${sor.trim().slice(0, 90)}`);
    });
  }
  assert.deepEqual(rossz, [], 'backslash nélküli regex:\n' + rossz.join('\n'));
});

console.log(`\n✅ ${pass} teszt rendben`);
