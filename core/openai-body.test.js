// ===================================================================
// KÉRÉS-TÖRZS TESZT — futtatás: node core/openai-body.test.js
// A buildOpenAIBody tiszta függvény: hálózat nélkül ellenőrizhető, hogy a
// gondolkodás-kikapcsolás CSAK ott és CSAK úgy kerül a kérésbe, ahogy kell.
// (2026-07-23: a fordító gondolkodó-tokenjei 57 percre lassították a pipeline-t.)
// ===================================================================
import { strict as assert } from 'assert';
import { buildOpenAIBody } from './ai-router.js';

// 1) Alap: reasoningOff nélkül NINCS reasoning mező (semmi nem változik)
{
  const b = buildOpenAIBody('openrouter', 'minimax/minimax-m3', 'hello', { maxTokens: 100 });
  assert.equal(b.reasoning, undefined, 'alapból nem küldünk reasoning mezőt');
  assert.equal(b.max_tokens, 100);
  assert.deepEqual(b.usage, { include: true }, 'openrouternél a valódi költséget kérjük');
}

// 2) reasoningOff + openrouter → reasoning: {enabled:false}
{
  const b = buildOpenAIBody('openrouter', 'minimax/minimax-m3', 'hello', { maxTokens: 100, reasoningOff: true });
  assert.deepEqual(b.reasoning, { enabled: false }, 'a gondolkodás kikapcsolva megy ki');
}

// 3) reasoningOff MÁS providernél → NEM küldjük (a Cerebras/Mistral nem
//    dokumentálja a paramétert — ismeretlen mező hibát okozhatna)
{
  const b = buildOpenAIBody('cerebras', 'zai-glm-4.7', 'hello', { maxTokens: 100, reasoningOff: true });
  assert.equal(b.reasoning, undefined, 'nem-openrouter providernek nem küldünk reasoning mezőt');
  assert.equal(b.usage, undefined, 'a usage.include is csak openrouteres');
}

// 4) jsonMode változatlanul működik a reasoningOff mellett
{
  const b = buildOpenAIBody('openrouter', 'minimax/minimax-m3', 'hello', { maxTokens: 100, reasoningOff: true, jsonMode: true });
  assert.deepEqual(b.response_format, { type: 'json_object' });
  assert.deepEqual(b.reasoning, { enabled: false });
}

// 5) rendszer-prompt + felhasználói prompt a helyén
{
  const b = buildOpenAIBody('openrouter', 'm', 'kérdés', { systemPrompt: 'Te vagy a fordító.' });
  assert.equal(b.messages[0].role, 'system');
  assert.equal(b.messages[0].content, 'Te vagy a fordító.');
  assert.equal(b.messages[1].content, 'kérdés');
  assert.equal(b.max_tokens, 2048, 'alapértelmezett keret');
}

console.log('✅ openai-body.test: minden átment');
