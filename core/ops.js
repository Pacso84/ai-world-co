// ===================================================================
// OPS — Feladatok (Kanban) + Értesítések (Heartbeat) — Marveen-stílus
// ===================================================================
//
// Egyszerű, fájl-alapú (bármelyik agent/process használhatja):
//   TASKS (Kanban): addTask, listTasks, setTaskStatus  (todo/doing/done)
//   NOTIFICATIONS (Heartbeat): notify(level,text), listNotifications
//     level: info | success | warn | alert  (alert = "hangos", Telegramra később)
//
// Tárolás: memory/ops.json
// ===================================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OPS_DIR = join(__dirname, '..', 'memory');
const OPS_PATH = join(OPS_DIR, 'ops.json');

function load() {
  if (!existsSync(OPS_PATH)) return { tasks: [], notifications: [] };
  try { return JSON.parse(readFileSync(OPS_PATH, 'utf-8')); } catch { return { tasks: [], notifications: [] }; }
}
function save(s) {
  if (!existsSync(OPS_DIR)) mkdirSync(OPS_DIR, { recursive: true });
  writeFileSync(OPS_PATH, JSON.stringify(s, null, 2), 'utf-8');
}

// ---------- KANBAN ----------
export function addTask(title, opts = {}) {
  const s = load();
  const id = 't' + Date.now() + Math.floor(Math.random() * 100);
  s.tasks.push({ id, title, status: 'todo', agent: opts.agent || null, created: new Date().toISOString() });
  // max 60 feladat
  if (s.tasks.length > 60) s.tasks = s.tasks.slice(-60);
  save(s);
  return id;
}
export function setTaskStatus(id, status) {
  const s = load();
  const t = s.tasks.find(x => x.id === id);
  if (t) { t.status = status; t.updated = new Date().toISOString(); save(s); }
}
export function listTasks() {
  const s = load();
  return {
    todo: s.tasks.filter(t => t.status === 'todo'),
    doing: s.tasks.filter(t => t.status === 'doing'),
    done: s.tasks.filter(t => t.status === 'done').slice(-15)
  };
}

// ---------- HEARTBEAT / ÉRTESÍTÉSEK ----------
export function notify(level, text, opts = {}) {
  const s = load();
  s.notifications.push({
    id: 'n' + Date.now() + Math.floor(Math.random() * 100),
    level: ['info', 'success', 'warn', 'alert'].includes(level) ? level : 'info',
    text, agent: opts.agent || null, at: new Date().toISOString(),
    loud: level === 'alert'   // a "hangos" megy majd Telegramra
  });
  if (s.notifications.length > 100) s.notifications = s.notifications.slice(-100);
  save(s);
}
export function listNotifications(limit = 20) {
  const s = load();
  return s.notifications.slice(-limit).reverse();
}
export function opsStats() {
  const s = load();
  return {
    tasks: { todo: s.tasks.filter(t => t.status === 'todo').length, doing: s.tasks.filter(t => t.status === 'doing').length, done: s.tasks.filter(t => t.status === 'done').length },
    alerts: s.notifications.filter(n => n.level === 'alert').length,
    notifications: s.notifications.length,
    open_needs: (s.messages || []).filter(m => m.kind === 'need' && m.open).length
  };
}

// ---------- AGENT-KOMMUNIKÁCIÓ (csapat-chat: ki, kinek, mi a baj / mi kell) ----------
// Az agentek nem csak csendben adják át a fájlt — ELMONDJÁK egymásnak mi a helyzet.
//   from / to : agent-id (pl. 'ellenorzo','guide','iro','ceo','human') vagy 'team' (mindenki)
//   kind:
//     'problem'  → mi a HIBA (az Ellenőrző visszaadja, mi a baj)
//     'fix'      → mit JAVÍTOTTAM (az Író/Útmutató jelzi, mit orvosolt)
//     'need'     → a munka HIÁNYOS / KELL MÉG ADAT (nyitva marad, amíg meg nem oldják)
//     'decision' → FŐNÖK döntés (jóváhagyás / visszatartás)
//     'info'     → általános állapot (pl. "átment, rendben")
const MSG_KINDS = ['problem', 'fix', 'need', 'decision', 'info'];
export function message(from, to, kind, text, opts = {}) {
  const s = load();
  if (!s.messages) s.messages = [];
  const k = MSG_KINDS.includes(kind) ? kind : 'info';
  const id = 'm' + Date.now() + Math.floor(Math.random() * 100);
  s.messages.push({
    id, from: from || '?', to: to || 'team', kind: k,
    text: String(text || '').slice(0, 400),
    ref: opts.ref || null,
    open: k === 'need' ? true : undefined,    // a kérés addig nyitva, amíg nem teljesül
    at: new Date().toISOString()
  });
  if (s.messages.length > 150) s.messages = s.messages.slice(-150);
  // A blokkoló kérés ('need') és a főnök-döntés a heartbeatre is felkerül (látható a vezérlőn)
  if (k === 'need' || k === 'decision') {
    s.notifications.push({
      id: 'n' + Date.now() + Math.floor(Math.random() * 100),
      level: k === 'need' ? 'warn' : 'info',
      text: `📨 ${from} → ${to}: ${String(text || '').slice(0, 120)}`,
      agent: from, at: new Date().toISOString(), loud: false
    });
    if (s.notifications.length > 100) s.notifications = s.notifications.slice(-100);
  }
  save(s);
  return id;
}
export function listMessages(limit = 40, opts = {}) {
  const s = load();
  let m = s.messages || [];
  if (opts.to) m = m.filter(x => x.to === opts.to || x.to === 'team');
  if (opts.kind) m = m.filter(x => x.kind === opts.kind);
  if (opts.openNeeds) m = m.filter(x => x.kind === 'need' && x.open);
  if (opts.ref) m = m.filter(x => x.ref === opts.ref);
  return m.slice(-limit).reverse();
}
// Egy 'need' (hiány/adatkérés) lezárása, amikor teljesült
export function resolveNeed(ref) {
  const s = load();
  let changed = false;
  for (const m of (s.messages || [])) {
    if (m.kind === 'need' && m.open && (m.ref === ref || !ref)) { m.open = false; m.resolved_at = new Date().toISOString(); changed = true; }
  }
  if (changed) save(s);
  return changed;
}

export default { addTask, setTaskStatus, listTasks, notify, listNotifications, opsStats, message, listMessages, resolveNeed };
