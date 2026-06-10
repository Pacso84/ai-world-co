// ===================================================================
// VEZÉRLŐPULT SZERVER (Control Panel) — helyi, localhost-only
// ===================================================================
//
// Élő Mission Control + API kulcs hozzáadás űrlapon (a .env-be ír).
// Node beépített http — NINCS külső csomag.
//
// FUTTATÁS:
//   node dashboard/server.js
//   majd nyisd meg: http://localhost:4178
//
// BIZTONSÁG: CSAK 127.0.0.1 (localhost). A kulcsok a gépeden maradnak,
// a .env-be kerülnek (amit a .gitignore véd). Kulcsot sosem ír ki teljesen.
// ===================================================================

import { createServer } from 'http';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { gather, render } from './build-dashboard.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ENV_PATH = join(ROOT, '.env');
const CONFIG_PATH = join(ROOT, 'config.json');
const PORT = 4178;
const HOST = '127.0.0.1'; // CSAK localhost!

// Engedélyezett kulcs-nevek (whitelist — biztonság)
const ALLOWED_KEYS = new Set([
  'ANTHROPIC_API_KEY', 'GOOGLE_API_KEY', 'GROQ_API_KEY',
  'CEREBRAS_API_KEY', 'OPENROUTER_API_KEY', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'
]);

// .env-be ír: meglévő sort frissít, vagy hozzáad
function saveKey(envName, value) {
  if (!ALLOWED_KEYS.has(envName)) throw new Error('ismeretlen kulcs-név');
  if (/[\r\n]/.test(value)) throw new Error('érvénytelen érték');
  let lines = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf-8').split('\n') : [];
  let found = false;
  lines = lines.map(l => {
    if (l.match(new RegExp('^\\s*' + envName + '\\s*='))) { found = true; return `${envName}=${value}`; }
    return l;
  });
  if (!found) lines.push(`${envName}=${value}`);
  writeFileSync(ENV_PATH, lines.join('\n'), 'utf-8');
}

const ALLOWED_PROVIDERS = new Set(['anthropic', 'google', 'groq', 'cerebras', 'openrouter']);

// config.json agent beállítás frissítése (modell + enabled)
function saveAgent({ id, provider, model, enabled }) {
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
  if (!config.agents[id]) throw new Error('ismeretlen agent: ' + id);
  // enabled mindig állítható
  if (typeof enabled === 'boolean') config.agents[id].enabled = enabled;
  // modell csak ha nem determinisztikus és kapott provider+model-t
  if (provider && model) {
    if (!ALLOWED_PROVIDERS.has(provider)) throw new Error('ismeretlen provider');
    if (!/^[\w.\/-]{2,60}$/.test(model)) throw new Error('érvénytelen modell');
    if (config.agents[id].deterministic) throw new Error('ez az agent determinisztikus (nincs modell)');
    config.agents[id].primary_model = { provider, model };
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

// ÚJ custom agent létrehozása (mint az etalonnál: név + ikon + szerep + utasítás + modell)
function createAgent({ id, name, icon, role, instructions, provider, model }) {
  if (!/^[a-z0-9][a-z0-9-]{1,28}$/.test(id || '')) throw new Error('érvénytelen id (kisbetű, szám, kötőjel)');
  if (!name || !instructions) throw new Error('hiányzó név vagy utasítás');
  if (provider && !ALLOWED_PROVIDERS.has(provider)) throw new Error('ismeretlen provider');
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
  if (config.agents[id]) throw new Error('már létezik ilyen agent: ' + id);

  config.agents[id] = {
    primary_model: { provider: provider || 'google', model: model || 'gemini-flash-latest' },
    fallback_model: { provider: 'google', model: 'gemini-2.5-flash' },
    enabled: true,
    type: 'custom',
    name, icon: icon || '🤖', role: role || '',
    instructions
  };
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');

  // instructions.md is (kényelemből)
  const dir = join(ROOT, 'agents', id);
  try { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'instructions.md'), instructions, 'utf-8'); } catch {}
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e5) req.destroy(); });
    req.on('end', () => resolve(data));
  });
}

const server = createServer(async (req, res) => {
  try {
    // Élő dashboard
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
      const html = render(gather());
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    }

    // Kulcs mentés
    if (req.method === 'POST' && req.url === '/api/key') {
      const body = await readBody(req);
      let payload;
      try { payload = JSON.parse(body); } catch { payload = {}; }
      const { env, value } = payload;
      try {
        if (!env || !value) throw new Error('hiányzó adat');
        saveKey(env, value.trim());
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    }

    // Agent beállítás mentés
    if (req.method === 'POST' && req.url === '/api/agent') {
      const body = await readBody(req);
      let payload;
      try { payload = JSON.parse(body); } catch { payload = {}; }
      try {
        if (!payload.id) throw new Error('hiányzó agent id');
        saveAgent(payload);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    }

    // Új custom agent létrehozása
    if (req.method === 'POST' && req.url === '/api/create-agent') {
      const body = await readBody(req);
      let payload; try { payload = JSON.parse(body); } catch { payload = {}; }
      try {
        createAgent(payload);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Server error: ' + e.message);
  }
});

server.listen(PORT, HOST, () => {
  console.log('🎛️  VEZÉRLŐPULT FUT (Control Panel)');
  console.log('─'.repeat(50));
  console.log(`   Nyisd meg: http://localhost:${PORT}`);
  console.log('   Itt élőben látod a dashboardot ÉS hozzáadhatsz API kulcsot.');
  console.log('   Leállítás: Ctrl+C');
  console.log('   (Csak localhost — a kulcsok a gépeden maradnak.)');
});
