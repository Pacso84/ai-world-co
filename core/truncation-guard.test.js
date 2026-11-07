// ===================================================================
// TESZT — csonka-kapu
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
// A miértet és a méréseket lásd a core/truncation-guard.js fejlécében.
// ===================================================================

import assert from 'assert/strict';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { looksTruncated, translationTooShort, shouldRetryTruncated, scanCorpus } from './truncation-guard.js';
import { effectiveMaxTokens } from './ai-router.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// 400 karakter FÖLÖTT: a pásztázó ez alatt szándékosan nem mond ítéletet,
// és az első változatban épp ezért ugrotta át a saját próbaszövegemet.
const TOLTELEK = 'Egy teljesen szabályos mondat a törzsben. '.repeat(12);

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };

console.log('🧪 csonka-kapu\n');

// ── amit MEG KELL fognia ──────────────────────────────────────────
t('mondat közepén elvágva', () => {
  assert.ok(looksTruncated(TOLTELEK + '\n\nall without'));
});

// ── IDÉZETTEL ZÁRULÓ SOR (2026-11-07) — az ai-image-basics en+es valódi vége ──
t('egész soros prompt-idézet NEM csonka (élő ai-image-basics)', () => {
  assert.equal(looksTruncated(TOLTELEK + '\n\n*"A friendly koala wearing a green scarf, holding a warm mug of tea, soft digital illustration style"'), false);
  assert.equal(looksTruncated(TOLTELEK + '\n\n"Un koala amigable con una bufanda verde, estilo de ilustración digital suave"*'), false);
});
t('de az idézőjelen BELÜL elvágott, vagy nem idézettel kezdődő sor továbbra is csonka', () => {
  assert.ok(looksTruncated(TOLTELEK + '\n\n*"A friendly koala wearing a green scarf, holding'));
  assert.ok(looksTruncated(TOLTELEK + '\n\nType "hello" and then press'));
});

t('a napi őrszem jelzi a beszivárgott kínai írásjelet, az eredetiben is szereplőt nem', () => {
  const en = TOLTELEK + '\n\nQwen is a perfectly capable helper for this job.';
  const r = scanCorpus({
    articles: [{ file: 'A.json', md: en }],
    translations: new Map([['A.json', { es: TOLTELEK + '\n\nQwen es un帮手 perfectamente capaz.', hu: TOLTELEK + '\n\nA Qwen remek segítő.' }]])
  });
  assert.deepEqual(r.problems.map(p => [p.code, p.lang]), [['TRANSLATION_FOREIGN_SCRIPT', 'es']]);
});

t('SZÓ közepén elvágva (az éles magyar eset)', () => {
  assert.ok(looksTruncated(TOLTELEK + '\n\nKattints rá, vagy használd a Ctrl + I (vagy Cmd + I Mac‑'));
});

t('vesszővel elvágva', () => {
  assert.ok(looksTruncated(TOLTELEK + '\n\noffer free trials or low-cost entry points,'));
});

t('csupasz cím-jel a végén', () => {
  assert.ok(looksTruncated(TOLTELEK + '\n\n##'));
});

t('cím, alatta SEMMI', () => {
  // Ez az éles microsoft-ai eset: "## Wrap-up" és ott a vége.
  assert.ok(looksTruncated(TOLTELEK + '\n\n## Wrap-up'));
  assert.ok(looksTruncated(TOLTELEK + '\n\n## Try it now'));
});

// ── amit NEM SZABAD megfognia ─────────────────────────────────────
t('a szokásos aláírásunk NEM csonka', () => {
  // Ez a minta 102 hamis riasztást okozott az első változatban: a cikkeink
  // többsége dőlt betűs aláírással zárul, tehát a mondatvég UTÁN dísz áll.
  assert.ok(!looksTruncated(TOLTELEK + "\n\n*Written and edited by AI World Co.'s autonomous AI agents.*"));
  assert.ok(!looksTruncated(TOLTELEK + '\n\n_Reviewed for accuracy by our editorial system._'));
  assert.ok(!looksTruncated(TOLTELEK + '\n\n**Egy félkövér mondat vége.**'));
});

t('idézettel vagy kódjellel zárt mondat NEM csonka', () => {
  assert.ok(!looksTruncated(TOLTELEK + '\n\nÍrd be: *"Készíts nekem egy listát."*'));
  assert.ok(!looksTruncated(TOLTELEK + '\n\nPróbáld ki ezt: `git commit -m "kész".`'));
});

t('forrás-URL, vonal, táblázat, kódblokk NEM csonka', () => {
  assert.ok(!looksTruncated(TOLTELEK + '\n\nForrás — https://example.com/cikk'));
  assert.ok(!looksTruncated(TOLTELEK + '\n\n---'));
  assert.ok(!looksTruncated(TOLTELEK + '\n\n| oszlop | másik |'));
  assert.ok(!looksTruncated(TOLTELEK + '\n\n```'));
});

t('rövid szövegre NEM mondunk ítéletet', () => {
  // A rövidhír-mentőöv 200-250 szavas cikkeket gyárt; és a "nem tudom"
  // sosem lehet "igen".
  assert.ok(!looksTruncated('Két szó'));
  assert.ok(!looksTruncated(''));
  assert.ok(!looksTruncated(null));
});

// ── a fordítás-arány mérce ────────────────────────────────────────
t('a gyanúsan rövid fordítás megfogódik', () => {
  const en = 'x'.repeat(10000);
  assert.ok(translationTooShort(en, 'y'.repeat(3893)), '38% — az éles magyar eset');
  assert.ok(!translationTooShort(en, 'y'.repeat(10500)), '105% — a normális');
  assert.ok(!translationTooShort(en, 'y'.repeat(6300)), '63% — épp a küszöb fölött');
});

t('összevetés nélkül NEM állítunk semmit', () => {
  assert.ok(!translationTooShort('', 'valami'), 'nincs eredeti');
  assert.ok(!translationTooShort('x'.repeat(10000), ''), 'nincs fordítás');
  assert.ok(!translationTooShort('rövid eredeti', 'x'), 'túl rövid eredeti');
});

// ── az újrapróba-döntés (a routerből kiemelve) ────────────────────
t('elvágott, nem üres válasz → ÚJRA, bővebb kerettel', () => {
  assert.equal(shouldRetryTruncated({
    finishReason: 'length', text: 'félig kész szöveg',
    alreadyRetried: false, currentCeiling: 8000, nextCeiling: 12000
  }), true);
});

t('az ÜRES válasz NEM ide tartozik', () => {
  // Azt a gondolkodás-mentő kezeli, más gyógyszerrel. Ha mindkettő elkapná,
  // kétszer fizetnénk ugyanazért a hívásért.
  for (const ures of ['', '   ', null, undefined]) {
    assert.equal(shouldRetryTruncated({
      finishReason: 'length', text: ures,
      alreadyRetried: false, currentCeiling: 8000, nextCeiling: 12000
    }), false);
  }
});

t('ha nem a keret vágta el, nem próbálunk újra', () => {
  for (const ok of ['stop', 'end_turn', null, undefined, 'content_filter']) {
    assert.equal(shouldRetryTruncated({
      finishReason: ok, text: 'kész szöveg.',
      alreadyRetried: false, currentCeiling: 8000, nextCeiling: 12000
    }), false, String(ok));
  }
});

t('MODELLENKÉNT CSAK EGYSZER — nincs végtelen kör', () => {
  assert.equal(shouldRetryTruncated({
    finishReason: 'length', text: 'félig kész',
    alreadyRetried: true, currentCeiling: 8000, nextCeiling: 12000
  }), false);
});

t('ha nincs hova emelni, inkább a csonka szöveget adjuk vissza', () => {
  // A 24000-es plafonon már nincs ráhagyás. Ilyenkor NEM dobjuk el a választ
  // (az modell-kaszkádot indítana a napi $1-os keret terhére) — a mentés
  // előtti kapunak kell elkapnia.
  assert.equal(shouldRetryTruncated({
    finishReason: 'length', text: 'félig kész',
    alreadyRetried: false, currentCeiling: 24000, nextCeiling: 24000
  }), false);
  assert.equal(shouldRetryTruncated({
    finishReason: 'length', text: 'félig kész',
    alreadyRetried: false, currentCeiling: 24000, nextCeiling: NaN
  }), false);
});

t('hiányzó paraméterek nem okoznak összeomlást', () => {
  assert.equal(shouldRetryTruncated(), false);
  assert.equal(shouldRetryTruncated({}), false);
});

t('a keret tényleg emelhető a valódi számítással', () => {
  // Nem elég, hogy a döntés helyes — kell, hogy legyen is hova emelni.
  const most = 8000;
  const kov = effectiveMaxTokens({ model: 'minimax/minimax-m2', maxTokens: most, noThink: false, prevCeiling: most });
  assert.ok(kov > most, `a ráhagyás nem emelt: ${most} → ${kov}`);
  assert.ok(kov <= 24000, 'a plafon fölé nem megyünk');
});

// ── az őrszem-pásztázás ───────────────────────────────────────────
t('a pásztázó szétválasztja a három hibafajtát', () => {
  const jo = TOLTELEK + '\n\nEz rendesen véget ér.';
  const articles = [
    { file: 'a.json', md: jo },
    { file: 'b.json', md: TOLTELEK + '\n\nelvágva itt' }
  ];
  const translations = new Map([
    ['a.json', { hu: 'x'.repeat(120), es: jo }],          // a hu GYANÚSAN RÖVID
    ['b.json', { hu: TOLTELEK + '\n\nfélbe' }]            // teljes hosszú, de elvágva
  ]);
  const r = scanCorpus({ articles, translations });
  const kod = c => r.problems.filter(p => p.code === c).length;
  assert.equal(kod('ARTICLE_TRUNCATED'), 1, 'egy angol cikk csonka');
  assert.equal(kod('TRANSLATION_TRUNCATED'), 1, 'egy fordítás gyanúsan rövid');
  assert.equal(kod('TRANSLATION_CUT_OFF'), 1, 'egy fordítás mondat közepén ér véget');
  assert.equal(r.cikkNezve, 2);
  assert.equal(r.parNezve, 3);
});

t('a LEFEDETTSÉG akkor is megvan, ha nincs hiba', () => {
  // A néma siker és a néma vakság enélkül egyformán néz ki.
  const r = scanCorpus({ articles: [{ file: 'a.json', md: TOLTELEK + '\n\nRendben van.' }] });
  assert.equal(r.problems.length, 0);
  assert.equal(r.cikkNezve, 1, 'a "0 hiba" mellé oda kell írni, hogy MENNYIT néztünk');
});

t('üres bemenetre nem omlik össze', () => {
  assert.deepEqual(scanCorpus().problems, []);
  assert.deepEqual(scanCorpus({}).problems, []);
});

// ── VALÓDI CIKKEKEN ───────────────────────────────────────────────
t('az élő cikk-tár átnézve, a csonkák száma nem nő', () => {
  const A = join(ROOT, 'content', 'articles');
  if (!existsSync(A)) { console.log('     ⏭️  kihagyva: nincs content/articles'); return; }
  let n = 0, csonka = 0;
  for (const f of readdirSync(A).filter(x => x.endsWith('.json'))) {
    let j; try { j = JSON.parse(readFileSync(join(A, f), 'utf-8')); } catch { continue; }
    const md = String(j.article_markdown || '');
    if (md.trim().length < 400) continue;
    n++;
    if (looksTruncated(md)) csonka++;
  }
  console.log(`     📏 ${n} angol cikk átnézve · ${csonka} csonka`);
  // 2026-08-25: 11 jelölés → 2026-11-07: a 3 valódi csonka útmutató vége pótolva, a határeset
  // (idézettel záruló sor) már nem jelölés → 0. Ha nő, egy futás új csonka cikket engedett ki.
  assert.equal(csonka, 0, `${csonka} csonka angol cikk — 11-07 óta 0 volt`);
});

t('a fordítás-tár átnézve, a csonkák száma nem nő', () => {
  const A = join(ROOT, 'content', 'articles'), T = join(ROOT, 'content', 'translations');
  if (!existsSync(T)) { console.log('     ⏭️  kihagyva: nincs content/translations'); return; }
  let par = 0, rovid = 0;
  for (const f of readdirSync(A).filter(x => x.endsWith('.json'))) {
    if (!existsSync(join(T, f))) continue;
    let en, tr;
    try {
      en = JSON.parse(readFileSync(join(A, f), 'utf-8'));
      tr = JSON.parse(readFileSync(join(T, f), 'utf-8'));
    } catch { continue; }
    const enMd = String(en.article_markdown || '');
    for (const l of ['hu', 'es']) {
      if (!tr[l]) continue;
      par++;
      if (translationTooShort(enMd, tr[l])) rovid++;
    }
  }
  // 2026-11-07: a teljes őrszem-mérce (rövid + mondat közepén végződő + idegen írásjel) is 0 —
  // a 21 csonka és a 42 kínai/japán írásjeles fordítás újrafordítva, a fordító mentés előtt szűr.
  const osszes = scanCorpus({
    articles: readdirSync(A).filter(x => x.endsWith('.json') && existsSync(join(T, x)))
      .map(f => { try { return { file: f, md: JSON.parse(readFileSync(join(A, f), 'utf-8')).article_markdown || '' }; } catch { return null; } })
      .filter(Boolean),
    translations: new Map(readdirSync(T).filter(x => x.endsWith('.json'))
      .map(f => { try { return [f, JSON.parse(readFileSync(join(T, f), 'utf-8'))]; } catch { return [f, {}]; } }))
  }).problems.filter(p => p.lang !== 'en');
  console.log(`     📏 ${par} fordítás-pár átnézve · ${rovid} gyanúsan rövid · ${osszes.length} őrszem-jelzés`);
  assert.equal(rovid, 0, `${rovid} csonka fordítás — 11-07 óta 0 volt`);
  assert.deepEqual(osszes.map(p => `${p.code} ${p.lang} ${p.file.slice(0, 50)}`), [], 'fordítás-hiba az őrszem szerint (11-07 óta 0)');
  assert.ok(par > 1000, 'a mérés lefutott (nem 0 páron)');
});

console.log(`\n✅ ${pass} teszt rendben`);
