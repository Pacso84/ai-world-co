// ===================================================================
// VISSZAADÓ-IRODA (2026-07-13) — spec: docs/superpowers/specs/
// 2026-07-13-ceg-hierarchia-visszaadas-tanulas-design.md
//
// Munka-visszaadás ügynökök közt a config.company.hierarchy élei mentén:
// ha egy munkatárs hibás bemenetet kap (pl. a Fordító szerkezet nélküli
// cikket), NEM próbálkozik némán a végtelenségig, hanem visszaadja a
// felelősnek. A postás (agents/ceo/agent.js eleje) kézbesíti a meglévő
// javító-körbe; ami 2 körben sem oldódik meg, vagy egy futásnyit
// kézbesítetlenül ül, az a Főnök asztalára kerül (agents/ceo/desk.js) —
// ott AZONNAL döntés születik ("mentsd, ne dobd").
//
// Állapot: memory/handbacks.json — sérült fájl esetén üresként indul
// újra, a pipeline-t SOSEM állítja meg.
// ===================================================================
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const STATE_PATH = join(ROOT, 'memory', 'handbacks.json');
const MAX_ROUNDS = 2;                 // ennyi kör után a Főnök asztalára kerül
const STALE_MS = 7 * 3600e3;          // ~1 futásnyi türelem (8 órás cron, kis ráhagyással)

function loadState() {
  try { return JSON.parse(readFileSync(STATE_PATH, 'utf-8')); } catch { return { items: [] }; }
}
function saveState(s) {
  const dir = join(ROOT, 'memory');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(s, null, 2), 'utf-8');
}
function hierarchy() {
  try { return JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf-8')).company?.hierarchy || {}; } catch { return {}; }
}

// Visszaadás nyitása. Ugyanarra a (to, ref) párra nyitott tétel → az ok
// frissül, NEM keletkezik új tétel. A kör-számláló a ref TELJES életútjára
// számol (kézbesített tételek is) — a limit felett a tétel eszkalálódik.
export function fileHandback({ from, to, ref, reason, hint = '' }) {
  const h = hierarchy();
  const allowed = h[from]?.may_handback_to || [];
  if (!allowed.includes(to)) {
    console.log(`🚫 postás: ${from} → ${to} visszaadás NEM engedélyezett él (config.company.hierarchy) — eldobva: ${ref}`);
    return { ok: false, error: 'edge-not-allowed' };
  }
  const s = loadState();
  if (s.items.some(it => it.ref === ref && it.status === 'closed')) {
    console.log(`🔒 postás: "${ref}" ügye már lezárt (a Főnök döntött) — új visszaadás nem nyitható.`);
    return { ok: false, error: 'case-closed' };
  }
  const now = new Date().toISOString();
  const open = s.items.find(it => it.ref === ref && it.to === to && it.status === 'open');
  let current = open;
  if (open) {
    open.reason = reason; open.hint = hint || open.hint; open.updated_at = now;
  } else {
    current = { id: 'hb' + Date.now() + Math.floor(Math.random() * 1000), from, to, ref, reason, hint, status: 'open', created_at: now, updated_at: now };
    s.items.push(current);
  }
  // Kör-limit a ref teljes életútjára (delivered tételek is számítanak)
  const rounds = s.items.filter(it => it.ref === ref && it.status !== 'closed').length;
  if (rounds > MAX_ROUNDS) { current.status = 'escalated'; current.updated_at = now; }
  saveState(s);
  return { ok: true, id: current.id };
}

export function openFor(to) { return loadState().items.filter(it => it.to === to && it.status === 'open'); }
export function roundsFor(ref) { return loadState().items.filter(it => it.ref === ref && it.status !== 'closed').length; }

export function markDelivered(id) {
  const s = loadState();
  const it = s.items.find(x => x.id === id);
  if (it) { it.status = 'delivered'; it.updated_at = new Date().toISOString(); saveState(s); }
}

// Előző futásból nyitva maradt tételek → a Főnök asztalára (nincs néma rothadás —
// user 2026-07-13: "döntés szülessen, ne határidő")
export function escalateStale() {
  const s = loadState();
  const stale = s.items.filter(it => it.status === 'open' && Date.now() - new Date(it.created_at).getTime() > STALE_MS);
  for (const it of stale) { it.status = 'escalated'; it.updated_at = new Date().toISOString(); }
  if (stale.length) saveState(s);
  return stale;
}

export function listEscalated() { return loadState().items.filter(it => it.status === 'escalated'); }

// A Főnök lezárja az ügyet — több visszaadás nem nyitható rá (hurok-védelem)
export function closeCase(ref) {
  const s = loadState();
  for (const it of s.items.filter(x => x.ref === ref)) { it.status = 'closed'; it.updated_at = new Date().toISOString(); }
  saveState(s);
}

// Napi jelentésnek: a mai forgalom
export function handbackStats() {
  const day = new Date().toISOString().slice(0, 10);
  const items = loadState().items;
  return {
    open: items.filter(it => it.status === 'open').length,
    deliveredToday: items.filter(it => it.status === 'delivered' && (it.updated_at || '').startsWith(day)).length,
    escalated: items.filter(it => it.status === 'escalated').length
  };
}

// POSTÁS (a CEO-orchestrator hívja a futás elején): az Írónak címzett
// visszaadásokat a meglévő javító-körbe kézbesíti — a publikált cikk
// átkerül content/rejected/-be REJECTED_ néven, a főnöki/visszaadói
// utasítással a _meta-ban. Az Író MÉG UGYANABBAN a futásban felveszi.
export function deliverToIro({ articlesDir, rejectedDir }) {
  const delivered = [];
  for (const hb of openFor('iro')) {
    try {
      const src = join(articlesDir, hb.ref);
      if (existsSync(src)) {
        const d = JSON.parse(readFileSync(src, 'utf-8'));
        d._meta = { ...(d._meta || {}), status: 'rejected', rejected_at: new Date().toISOString(), reason: hb.reason, ceo_hint: hb.hint || '', handback_from: hb.from };
        if (!existsSync(rejectedDir)) mkdirSync(rejectedDir, { recursive: true });
        writeFileSync(join(rejectedDir, hb.ref.replace(/^ARTICLE_/, 'REJECTED_')), JSON.stringify(d, null, 2), 'utf-8');
        unlinkSync(src);
        console.log(`📮 postás: ${hb.from} → iro kézbesítve: ${hb.ref} (${String(hb.reason).slice(0, 60)})`);
        delivered.push(hb.ref);
      } else {
        console.log(`📮 postás: a hivatkozott fájl már nincs meg (${hb.ref}) — tétel kézbesítettnek jelölve.`);
      }
      markDelivered(hb.id);
    } catch (e) { console.log(`⚠️ postás-hiba egy tételnél (${hb.ref}): ${e.message.slice(0, 60)} — megy tovább.`); }
  }
  return delivered;
}

// Hibás forrás-cikk felismerése (a Fordító használja: EZ visszaadás-ok,
// a modell-hiba — 429/timeout — NEM, az magától rendeződik a retry-ban).
export function sourceDefect(md) {
  const t = String(md || '');
  if (!/^#\s+.+$/m.test(t)) return 'hiányzó H1 főcím';
  if (t.replace(/---[\s\S]*?---/, '').trim().length < 400) return 'gyanúsan rövid törzs (<400 karakter)';
  return null;
}
