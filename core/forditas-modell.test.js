// A fordító modellje (2026-10-20, user: „1 választom!” → „oké”). 20 mondatos próba után a GPT-5.6 Luna
// fordít (MiniMax M3: ~10 hiba, Luna: ~1). Ingyenes, hálózat nélküli.
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf-8'));
const router = readFileSync(join(ROOT, 'core', 'ai-router.js'), 'utf-8');
const t = cfg.agents.translator;

assert.equal(t.primary_model.model, 'openai/gpt-5.6-luna', 'a fordító nem a próbán nyertes modell');
assert.equal(t.primary_model.provider, 'openrouter');
assert.equal(t.fallback_model.model, 'minimax/minimax-m3', 'tartaléknak a régi fordító marad');
assert.equal(t.routing, 'paid-only', 'a fordítás nem eshet ingyenes modellre (user 07-05)');
assert.equal(t.reasoning, 'off', 'a próba reasoning-off módban is igazolta a minőséget');
assert.match(router, /'openai\/gpt-5\.6-luna': \{ input: 0\.20, output: 1\.20 \}/, 'hiányzik az ár — a költés $0-nak látszana');
console.log('✅ forditas-modell.test: a fordító GPT-5.6 Luna, M3 tartalékkal, ár rögzítve');
