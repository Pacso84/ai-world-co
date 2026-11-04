// ===================================================================
// AI ROUTER FÜST-TESZT  —  ⚠️  PÉNZBE KERÜL
// ===================================================================
//
// Hogyan futtasd:
//   1. Töltsd ki a .env fájlt API kulcsokkal
//   2. PowerShell-ben: npm run router-smoke
//
// Mit csinál: meghív minden agent-et egy egyszerű kérdéssel,
// és kiírja a választ + költséget.
//
// ⚠️  EZ NEM EGYSÉGTESZT. Valódi, FIZETŐS hívásokat küld (~$0.0005
// futásonként), és a recordSpend()-en át beleír a core/budget-state.json
// éles költség-nyilvántartásba. Ezért NEM `.test.js` a neve: az `npm test`
// (core/run-tests.js) csak a `*.test.js` fájlokat futtatja, azok ingyenesek.
// Kézzel futtasd, akkor, amikor tényleg az élő útválasztóra vagy kíváncsi.
// ===================================================================

import { ask } from './ai-router.js';

const TEST_PROMPT = 'Reply with exactly: "Hello from {your model name}! I am working correctly."';

const TEST_AGENTS = ['ceo', 'rss-scraper', 'iro', 'ellenorzo'];

console.log('🧪 AI ROUTER TESZT INDUL\n');
console.log('Próba minden agent-tel egy egyszerű prompttal...\n');
console.log('─'.repeat(60));

let totalCost = 0;
let successCount = 0;

for (const agentName of TEST_AGENTS) {
  console.log(`\n🤖 Tesztelem: ${agentName}`);
  console.log(`Prompt: "${TEST_PROMPT}"\n`);

  try {
    const response = await ask(TEST_PROMPT, {
      agentName,
      systemPrompt: 'You are a test bot. Reply exactly as instructed.',
      maxTokens: 100
    });

    if (response) {
      console.log(`📝 Válasz: ${response.text.trim()}`);
      console.log(`💰 Költség: $${response.costUsd.toFixed(6)}`);
      totalCost += response.costUsd;
      successCount++;
    } else {
      console.log('❌ Nincs válasz (minden provider elesett)');
    }
  } catch (error) {
    console.log(`💥 Hiba: ${error.message}`);
  }

  console.log('─'.repeat(60));
}

console.log(`\n📊 ÖSSZEFOGLALÓ:`);
console.log(`   Sikeres tesztek: ${successCount}/${TEST_AGENTS.length}`);
console.log(`   Teljes költség: $${totalCost.toFixed(6)}`);
console.log(`\n${successCount === TEST_AGENTS.length ? '✅ MINDEN AGENT MŰKÖDIK!' : '⚠️  Néhány agent nem válaszolt — ellenőrizd az API kulcsokat'}`);
