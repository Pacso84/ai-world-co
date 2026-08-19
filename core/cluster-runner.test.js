// ===================================================================
// ÖSSZEVONÓ FUTTATÓ — tesztek
// ===================================================================
// MIÉRT VAN EZ A FÁJL: 2026-08-19-ig ez a 45 sor az agents/iro/agent.js-ben élt,
// tehát TESZTELHETETLEN volt (az agents/ alól tilos importálni: 21 agent
// feltétel nélkül hívja a main()-t → a puszta import pénzt költ és publikál).
// Épp az a rész maradt fedezetlenül, ami NÉMÁN üres tömböt adhat örökre.
//
// Az `ask` és a draft-olvasás most PARAMÉTER, ezért hálózat és pénz nélkül
// végigjárható mind a hibaág.
// ===================================================================

import assert from 'assert/strict';
import { clusterDrafts } from './cluster-runner.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };
const at = async (name, fn) => { await fn(); pass++; console.log('  ✅ ' + name); };

console.log('🧪 összevonó futtató\n');

// Három draft: kettő ugyanarról, egy külön.
const DRAFTOK = {
  'a.json': { title: 'Midjourney V8 Alpha is here', content_snippet: 'New model', _meta: { source_name: 'Midjourney' } },
  'b.json': { title: 'Midjourney V8.1 faster upscales', content_snippet: 'Speed', _meta: { source_name: 'The Verge' } },
  'c.json': { title: 'OpenAI board adds two directors', content_snippet: 'Governance', _meta: { source_name: 'OpenAI' } }
};
const olvas = f => { if (!DRAFTOK[f]) throw new Error('nincs ilyen draft'); return DRAFTOK[f]; };
const valasz = (text, costUsd = 0.0001) => async () => ({ text, costUsd });

await at('a jó válaszból csoport lesz', async () => {
  const r = await clusterDrafts({
    ids: ['a.json', 'b.json', 'c.json'], readDraft: olvas,
    ask: valasz('{"groups":[{"theme":"Midjourney V8 release","ids":["a.json","b.json"]}]}')
  });
  assert.equal(r.groups.length, 1);
  assert.deepEqual(r.groups[0].ids, ['a.json', 'b.json']);
  assert.equal(r.costUsd, 0.0001);
});

await at('🔌 KIKAPCSOLVA: nem hív AI-t, nem költ', async () => {
  // A config "enabled: false"-nak VALÓDI hatása kell legyen. A core/ai-router.js
  // NEM nézi az agents.<név>.enabled mezőt — a kapcsolót itt kötjük be.
  let hivas = 0;
  const r = await clusterDrafts({
    ids: ['a.json', 'b.json'], readDraft: olvas,
    ask: async () => { hivas++; return { text: '{"groups":[]}', costUsd: 1 }; },
    enabled: false
  });
  assert.equal(hivas, 0, 'kikapcsolva NEM hívhat AI-t');
  assert.deepEqual(r.groups, []);
  assert.equal(r.costUsd, 0);
});

await at('nincs válasz (null) → mai viselkedés, 0 költség', async () => {
  const r = await clusterDrafts({ ids: ['a.json', 'b.json'], readDraft: olvas, ask: async () => null });
  assert.deepEqual(r.groups, []);
  assert.equal(r.costUsd, 0);
});

await at('értelmezhetetlen válasz → üres csoport, DE a költség elszámolva', async () => {
  // A tokent akkor is kifizettük, ha a válasz szemét. A költséget elnyelni
  // annyi, mint eltitkolni a költést — a napi keret-őr pont ezen múlik.
  const r = await clusterDrafts({
    ids: ['a.json', 'b.json'], readDraft: olvas, ask: valasz('bocsánat, nem tudom', 0.002)
  });
  assert.deepEqual(r.groups, []);
  assert.equal(r.costUsd, 0.002);
});

await at('az AI dobása sem boríthatja fel az írást', async () => {
  const r = await clusterDrafts({
    ids: ['a.json', 'b.json'], readDraft: olvas,
    ask: async () => { throw new Error('hálózati hiba'); }
  });
  assert.deepEqual(r.groups, []);
  assert.equal(r.costUsd, 0);
});

await at('olvashatatlan draft kimarad, a többi megy tovább', async () => {
  let latott = '';
  const r = await clusterDrafts({
    ids: ['a.json', 'nincs.json', 'b.json'], readDraft: olvas,
    ask: async (p) => { latott = p; return { text: '{"groups":[{"theme":"Midjourney V8 release","ids":["a.json","b.json"]}]}', costUsd: 0 }; }
  });
  assert.equal(r.groups.length, 1);
  assert.ok(!latott.includes('nincs.json'), 'a hibás draft nem mehet be a promptba');
});

await at('kevesebb mint két hír → nincs mit összevonni, nincs AI-hívás', async () => {
  let hivas = 0;
  const ask = async () => { hivas++; return { text: '{"groups":[]}', costUsd: 1 }; };
  for (const ids of [[], ['a.json'], null]) {
    const r = await clusterDrafts({ ids, readDraft: olvas, ask });
    assert.deepEqual(r.groups, []);
  }
  assert.equal(hivas, 0);
});

await at('ha csak EGY draft olvasható, szintén nincs hívás', async () => {
  let hivas = 0;
  const r = await clusterDrafts({
    ids: ['a.json', 'nincs1.json', 'nincs2.json'], readDraft: olvas,
    ask: async () => { hivas++; return { text: '{"groups":[]}', costUsd: 1 }; }
  });
  assert.equal(hivas, 0);
  assert.deepEqual(r.groups, []);
});

await at('a promptba a cím ÉS a forrás is bekerül', async () => {
  // Kereszt-forrású csoportosítás: ugyanazt a hírt három forrás is bejelentheti.
  let latott = '';
  await clusterDrafts({
    ids: ['a.json', 'b.json'], readDraft: olvas,
    ask: async (p) => { latott = p; return { text: '{"groups":[]}', costUsd: 0 }; }
  });
  assert.match(latott, /Midjourney V8 Alpha is here/);
  assert.match(latott, /The Verge/);
});

await at('a kitalált azonosítót eldobja (a korlátok a draft-clusters-ből jönnek)', async () => {
  const r = await clusterDrafts({
    ids: ['a.json', 'b.json'], readDraft: olvas,
    ask: valasz('{"groups":[{"theme":"Midjourney V8 release","ids":["a.json","kitalalt.json"]}]}')
  });
  assert.deepEqual(r.groups, [], 'egy érvényes id nem csoport');
});

console.log('\n✅ cluster-runner.test: mind a ' + pass + ' eset rendben');
