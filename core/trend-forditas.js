// ===================================================================
// A TREND-KERESÉSEK FORDÍTÁSA (2026-10-20, user: „a trendeknél a magyarban vannak angol mondatok!
// ez így nem jó”). A Felkapott oldal (core/trend-radar.js) minden tételnél megmutatja, mire
// kerestek rá („can ai help me write a book”) — a magyar és a spanyol oldalon ez eddig angolul
// állt. A fordítás a content/trend-forditas.json szótárban él: { "<angol keresés>": { hu, es } }.
// Az újakat a fordító (agents/translator/agent.js) pótolja egy rövid hívással; ami nincs meg,
// az a nem angol oldalon KIMARAD (nem angolul jelenik meg).
// Ez a modul csak számol (hálózat nélkül) → tesztelhető.
// ===================================================================
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

export const SZOTAR = join(dirname(fileURLToPath(import.meta.url)), '..', 'content', 'trend-forditas.json');
/** Egy futásban legfeljebb ennyi keresést fordít a fordító (a költség elhanyagolható, de legyen plafon). */
export const MAX_FUTASONKENT = 20;

const kulcs = s => String(s || '').trim().toLowerCase();

export function szotarBetolt(ut = SZOTAR) {
  try { const j = JSON.parse(readFileSync(ut, 'utf-8')); return j && typeof j === 'object' ? j : {}; } catch { return {}; }
}

/** A keresés fordítása az adott nyelvre; angolra maga a keresés; ha nincs: ''. */
export function kerdesForditas(szotar, kifejezes, nyelv) {
  const k = kulcs(kifejezes);
  if (!k) return '';
  if (!nyelv || nyelv === 'en') return k;
  return kulcs(szotar?.[k]?.[nyelv]);
}

/** A még le nem fordított (keresés, nyelv) párok — legfeljebb MAX_FUTASONKENT. */
export function hianyzoForditasok(kifejezesek, szotar, nyelvek) {
  const ki = [], latott = new Set();
  for (const kif of kifejezesek || []) {
    const k = kulcs(kif);
    if (!k || latott.has(k)) continue;
    latott.add(k);
    for (const ny of nyelvek || []) if (!kerdesForditas(szotar, k, ny)) ki.push({ kifejezes: k, nyelv: ny });
  }
  return ki.slice(0, MAX_FUTASONKENT);
}

/** A modell válasza (soronként egy fordítás, a kérés sorrendjében) → tömb; hibás válaszra null. */
export function valaszFeldolgoz(szoveg, db) {
  const sorok = String(szoveg || '').split('\n').map(s => s.replace(/^\s*(\d+[.)]|[-*•])\s*/, '').replace(/^["“„']|["”']$/g, '').trim()).filter(Boolean);
  if (sorok.length !== db) return null;
  if (sorok.some(s => s.length > 120)) return null;
  return sorok.map(kulcs);
}
