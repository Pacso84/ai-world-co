// ===================================================================
// FORRÁS-BIZONYÍTVÁNY TESZT — futtatás: node core/source-report-card.test.js
// Tiszta döntési logika, hálózat és fájlírás nélkül.
// ===================================================================
import { strict as assert } from 'assert';
import { judgeSource, reportLine, DEAD_FEED_DAYS, MIN_SAMPLE, BAD_RATIO } from './source-report-card.js';

// 1) HALOTT FEED → automatikus kikapcsolás
{
  const j = judgeSource({ feedAgeDays: DEAD_FEED_DAYS + 1, published30d: 0, truthBlocks: 0, totalAttempts: 5 });
  assert.equal(j.verdict, 'dead');
  assert.equal(j.auto, true, 'halott feedet a rendszer MAGÁTÓL kikapcsolja');
}

// 2) VALÓTLANT KÖZÖL → automatikus kikapcsolás (elég minta felett)
{
  const j = judgeSource({ feedAgeDays: 1, published30d: 2, truthBlocks: 3, totalAttempts: 6 });
  assert.equal(j.verdict, 'unreliable');
  assert.equal(j.auto, true);
  assert.ok(/hitelesség-kapu/i.test(j.reason));
}

// 3) KEVÉS MINTA → NEM minősítünk (egy-két rossz cikk nem tendencia)
{
  const j = judgeSource({ feedAgeDays: 1, published30d: 1, truthBlocks: 2, totalAttempts: MIN_SAMPLE - 1 });
  assert.notEqual(j.verdict, 'unreliable', 'kis mintán nem bélyegzünk meg forrást');
  assert.equal(j.auto, false);
}

// 4) ÉL, DE NEM TERMEL → csak JAVASLAT (a user dönt), nem automatikus
{
  const j = judgeSource({ feedAgeDays: 2, published30d: 0, truthBlocks: 0, totalAttempts: 0 });
  assert.equal(j.verdict, 'no-yield');
  assert.equal(j.auto, false, 'ítélet kérdése — NEM kapcsoljuk ki magunktól');
}

// 5) JÓL MŰKÖDŐ FORRÁS → nincs teendő
{
  const j = judgeSource({ feedAgeDays: 0, published30d: 12, truthBlocks: 0, totalAttempts: 12 });
  assert.equal(j.verdict, 'ok');
  assert.equal(j.auto, false);
}

// 6) Egy rossz cikk sok jó mellett NEM elég a kikapcsoláshoz
{
  const j = judgeSource({ feedAgeDays: 0, published30d: 20, truthBlocks: 1, totalAttempts: 20 });
  assert.equal(j.verdict, 'ok', `1/20 blokk (${BAD_RATIO} küszöb alatt) még rendben`);
}

// 7) Már kikapcsolt forrást nem bántunk újra
{
  const j = judgeSource({ feedAgeDays: null, published30d: 0, truthBlocks: 0, totalAttempts: 0, alreadyDisabled: true });
  assert.equal(j.verdict, 'disabled');
  assert.equal(j.auto, false);
}

// 8) Riport-sor: csendes, ha nincs teendő; beszédes, ha van
{
  assert.equal(reportLine({ autoDisabled: [], proposals: [] }), '', 'nincs teendő → néma');
  const line = reportLine({
    autoDisabled: [{ id: 'x', name: 'Teszt Forrás (hivatalos)', reason: 'halott feed — 400 napja néma' }],
    proposals: [{ id: 'y', name: 'Másik Forrás', reason: 'nem termel' }]
  });
  assert.ok(line.includes('KIKAPCSOLVA') && line.includes('Teszt Forrás'), 'a kikapcsolt forrás nevesítve');
  assert.ok(!line.includes('(hivatalos)'), 'a technikai utótag nem megy ki a riportba');
  assert.ok(line.includes('Másik Forrás'), 'a javaslat is megjelenik');
}

console.log('✅ source-report-card.test: minden átment');
