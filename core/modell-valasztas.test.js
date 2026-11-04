// Modell-választás a 16 modelles mérés után (2026-10-20, user: „mérd meg mindet … még a trend-ellenőrre is!”
// → „oké csináld”). memoria/reports/Modell-mérés minden feladatra 2026-10-20.md. Ingyenes, hálózat nélküli.
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { buildOpenAIBody } from './ai-router.js';
import { nemAiKifejezesek, aiSzuresAlkalmaz, TREND_SZURO_RENDSZER } from './trend-kutato.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf-8')).agents;
const router = readFileSync(join(ROOT, 'core', 'ai-router.js'), 'utf-8');
let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };

console.log('\n🧪 modell-valasztas');

t('✍️ az író és az útmutató-író Claude Haiku 5.5, tartalék az M3; az ár rögzítve', () => {
  for (const a of ['iro', 'guide']) {
    assert.equal(cfg[a].primary_model.model, 'anthropic/claude-haiku-5.5', a);
    assert.equal(cfg[a].fallback_model.model, 'minimax/minimax-m3', a + ' tartaléka');
  }
  assert.match(router, /'anthropic\/claude-haiku-5\.5': \{ input: 0\.10, output: 0\.50 \}/);
});

t('🎨 a borító-jelenet (designer) MARAD az M2.5-ön — a nagyobb mintán az nyert (5/8 vs Luna 0/8)', () => {
  assert.equal(cfg.designer.primary_model.model, 'minimax/minimax-m2.5');
});

t('📈 a trend-ellenőr: GPT-5.6 Luna, kevés gondolkodással, csak fizetős', () => {
  assert.equal(cfg.trend.primary_model.model, 'openai/gpt-5.6-luna');
  assert.equal(cfg.trend.reasoning, 'low');
  assert.equal(cfg.trend.routing, 'paid-only');
});

t('🧠 „low” gondolkodás: reasoning.effort megy ki; a kikapcsolás elsőbbséget élvez', () => {
  assert.deepEqual(buildOpenAIBody('openrouter', 'openai/gpt-5.6-luna', 'x', { reasoningEffort: 'low' }).reasoning, { effort: 'low' });
  assert.deepEqual(buildOpenAIBody('openrouter', 'm', 'x', { reasoningOff: true, reasoningEffort: 'low' }).reasoning, { enabled: false });
  assert.equal(buildOpenAIBody('groq', 'm', 'x', { reasoningEffort: 'low' }).reasoning, undefined, 'csak openrouteren');
  assert.match(router, /reasoningEffort: \['low', 'medium', 'high'\]\.includes\(agentConfig\.reasoning\)/);
});

t('🔎 trend-ellenőr válasza: a nem MI-témák halmaza; értelmezhetetlenre null (nincs szűrés)', () => {
  const kif = ['nano banana', 'dow today', 'claude monet exhibition', 'copilot login'];
  const v = JSON.stringify([{ query: 'nano banana', ai: true }, { query: 'Dow today', ai: false }, { query: 'claude monet exhibition', ai: false }, { query: 'copilot login', ai: true }]);
  assert.deepEqual([...nemAiKifejezesek('Itt: ' + v, kif)].sort(), ['claude monet exhibition', 'dow today']);
  assert.equal(nemAiKifejezesek('nem json', kif), null);
  assert.equal(nemAiKifejezesek(JSON.stringify([{ query: 'dow today', ai: false }]), kif), null, 'a kifejezések felénél kevesebbet minősített → nem bízunk benne');
});

t('🧹 a szűrés kiveszi a nem MI-témákat, és megőrzi őket a kiszurt_ai listában', () => {
  const ki = { datum: '2026-10-21', temak: [{ kifejezes: 'nano banana', pont: 30 }, { kifejezes: 'dow today', pont: 50 }] };
  const uj = aiSzuresAlkalmaz(ki, new Set(['dow today']));
  assert.deepEqual(uj.temak.map(x => x.kifejezes), ['nano banana']);
  assert.deepEqual(uj.kiszurt_ai, ['dow today']);
  assert.equal(aiSzuresAlkalmaz(ki, null), ki, 'hibánál változatlan (fail-open)');
});

t('🔌 bekötés: a napi gyűjtés után fut, --dry módban NEM (helyben nincs fizetős hívás); a CI-lépés kapja a kulcsot', () => {
  const src = readFileSync(join(ROOT, 'core', 'trend-kutato.js'), 'utf-8');
  assert.match(src, /arg\.includes\('--dry'\) \? await gyujt\(\{ beall \}\) : await aiSzures\(await gyujt\(\{ beall \}\)\)/);
  assert.match(src, /agentName: 'trend'/);
  assert.match(src, /await import\('\.\/ai-router\.js'\)/, 'az ai-router csak futáskor töltődjön (a build is importálja a modult)');
  assert.ok(TREND_SZURO_RENDSZER.includes('JSON array'));
  const yml = readFileSync(join(ROOT, '.github', 'workflows', 'auto.yml'), 'utf-8').replace(/\r\n/g, '\n');
  const i = yml.indexOf('run: node core/trend-kutato.js');
  const lepes = yml.slice(yml.lastIndexOf('- name:', i), i);
  assert.match(lepes, /OPENROUTER_API_KEY: \$\{\{ secrets\.OPENROUTER_API_KEY \}\}/, 'a trend-lépésnek nincs kulcsa');
});

if (hiba) { console.log(`\n❌ modell-valasztas.test: ${hiba} hiba`); process.exit(1); }
console.log('✅ modell-valasztas.test: mind rendben');
