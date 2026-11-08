// ===================================================================
// TESZT — megszűnt eszközökről nem születhet új útmutató
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// MIÉRT (2026-11-04): a 2026-01-21-én megszüntetett NVIDIA ChatRTX-hez 10-30-án
// és 10-31-én is írtunk új útmutatót (lásd core/megszunt-eszkozok.js).
// ===================================================================

import assert from 'assert/strict';
import { readFileSync, readdirSync } from 'fs';
import { megszuntTema } from './megszunt-eszkozok.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };

console.log('🧪 megszűnt eszközök\n');

t('🪦 ChatRTX-téma kiszűrve (eszköz, cím vagy szög alapján) — EZ VOLT A HIBA', () => {
  assert.ok(megszuntTema({ tool: 'ChatRTX', title: 'Plan a party' }));
  assert.ok(megszuntTema({ tool: 'NVIDIA ChatRTX', title: 'x' }));
  assert.ok(megszuntTema({ tool: '', title: 'Summarize a report with Chat RTX' }));
  assert.ok(megszuntTema({ title: 'Plan dinners', angle: 'Tell ChatRTX your needs' }));
});

t('✅ más NVIDIA- és általános témák NEM esnek ki', () => {
  assert.equal(megszuntTema({ company: 'NVIDIA', tool: 'NVIDIA Broadcast', title: 'Clean up your mic' }), null);
  assert.equal(megszuntTema({ tool: 'ChatGPT', title: 'Plan a kids birthday party' }), null);
  assert.equal(megszuntTema({ title: 'RTX graphics cards explained' }), null);
  assert.equal(megszuntTema(null), null);
});

t('🪦 Egyedi GPT-téma kiszűrve (2026-12-11-én kivezetik) — a GPT-5 / ChatGPT-témák NEM', () => {
  assert.equal(megszuntTema({ tool: 'ChatGPT', title: 'How to set up a custom GPT in ChatGPT for a task you repeat weekly' })?.nev, 'Custom GPTs (ChatGPT)');
  assert.ok(megszuntTema({ tool: 'ChatGPT', title: 'Create your own custom GPT in ChatGPT (no coding)' }));
  assert.ok(megszuntTema({ title: 'How to use custom GPTs (and build a simple one)' }));
  assert.ok(megszuntTema({ title: 'Find helpers', angle: 'Browse the GPT Store for a recipe helper' }));
  assert.ok(megszuntTema({ title: 'x', angle: 'Open Explore GPTs and pick one' }));
  assert.ok(megszuntTema({ title: 'Build your own GPT for meal plans' }));
  assert.equal(megszuntTema({ tool: 'ChatGPT', title: 'Getting started with ChatGPT: your first 15 minutes' }), null);
  assert.equal(megszuntTema({ tool: 'ChatGPT', title: 'What GPT-5 changes for everyday users' }), null);
  assert.equal(megszuntTema({ tool: 'ChatGPT', title: 'Set ChatGPT custom instructions so it answers your way' }), null);
  assert.equal(megszuntTema({ title: 'Build a GPT-4o voice reminder' }), null);
  assert.equal(megszuntTema({ tool: 'ChatGPT Projects', title: 'Keep a project folder in ChatGPT' }), null);
});

t('📜 VALÓDI témalista: egyetlen ChatRTX-téma sem vár írásra', () => {
  const topics = JSON.parse(readFileSync(new URL('../guides/guide-topics.json', import.meta.url), 'utf-8')).topics;
  const varo = topics.filter(x => x.status !== 'done' && megszuntTema(x));
  assert.deepEqual(varo.map(x => x.id), []);
});

t('📜 az útmutató-író bekötve: témaválasztó + ötletelő szűr, a cég-katalógusban nincs ChatRTX', () => {
  const src = readFileSync(new URL('../agents/guide/agent.js', import.meta.url), 'utf-8');
  assert.ok((src.match(/megszuntTema\(/g) || []).length >= 3, 'pickTopics + kiegyenlítő + ötletelő');
  const katalogus = src.slice(src.indexOf('const COMPANY_CATALOG'), src.indexOf('];', src.indexOf('const COMPANY_CATALOG')));
  assert.doesNotMatch(katalogus, /tool:\s*'[^']*ChatRTX/);
});

t('📜 nincs élő ChatRTX-útmutató', () => {
  const dir = new URL('../content/articles/', import.meta.url);
  for (const f of readdirSync(dir)) {
    if (!f.startsWith('ARTICLE_GUIDE_')) continue;
    const a = JSON.parse(readFileSync(new URL(f, dir), 'utf-8'));
    const fej = (a.article_markdown || '').slice(0, 600);
    const tool = (fej.match(/^tool:\s*"([^"]*)"/m) || [])[1] || '';
    const title = (fej.match(/^title:\s*"([^"]*)"/m) || [])[1] || '';
    assert.equal(megszuntTema({ tool, title }), null, f);
  }
});


console.log(`\n✅ ${pass} eset rendben`);
