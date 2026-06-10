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
    notifications: s.notifications.length
  };
}

export default { addTask, setTaskStatus, listTasks, notify, listNotifications, opsStats };
