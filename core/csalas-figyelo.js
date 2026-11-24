// Csalás-figyelő alapmodul (2026-11-23; terv: docs/superpowers/plans/2026-11-21-csalas-figyelo.md 1. rész,
// spec: docs/superpowers/specs/2026-11-21-csalas-figyelo-design.md 8.1–8.4).
//
// Két jóváhagyott hivatalos forrás (FBI IC3 PSA, Google Safety & Security — user 11-21) új tételeiből egy
// olcsó besorolás dönti el, hogy KONKRÉT, magánembereket célzó csalásról szól-e. Ha igen, napi +1 külön
// helyen csalás-hír készül (nem számít a napi 4 hírbe). Ez a fájl csak a tiszta logika — hálózat nélkül,
// az agentek innen veszik.
//
// KILL-SWITCH: CSALAS_FIGYELO_BE (kézi, teszttel őrzött). A config `enabled` mezői NEM kapcsolnak ki semmit.
// false = nincs csalás-gyűjtés, 0 csalás-hely, nincs /scams oldal, nincs menüpont.

export const CSALAS_FIGYELO_BE = false;
export const CSALAS_EXTRA_NAPI = 1;
export const CSALAS_MAX_KOR_NAP = 7;

// A kép-sablon csak az első 4-hez készül; social → chat, web → email rajz (4. rész).
export const CSATORNAK = ['sms', 'email', 'chat', 'call', 'social', 'web'];

const NAP_MS = 24 * 3600 * 1000;
// Hibás órájú forrás: kis jövőbeli csúszás még elfogadott, nagy nem.
const JOVO_TURES_MS = 1 * NAP_MS;

// A két jóváhagyott forrás (user 11-21: „Mindkettőt”). A tesztje a sources/rss-feeds.json-t is ehhez méri:
// más csalás-forrás user-jóváhagyás nélkül nem kerülhet be.
export const CSALAS_FORRASOK = {
  'ic3-psa': 'https://www.ic3.gov/PSA/RSS',
  'google-safety': 'https://blog.google/technology/safety-security/rss/',
};

export function csalasForras(feedConfig) {
  return feedConfig?.csalas === true;
}

export function csalasFriss(item, now = Date.now()) {
  const nyers = item?.pubDate ?? item?.isoDate;
  if (!nyers) return false;
  const ido = Date.parse(nyers);
  if (!Number.isFinite(ido)) return false;
  const kor = now - ido;
  return kor <= CSALAS_MAX_KOR_NAP * NAP_MS && kor >= -JOVO_TURES_MS;
}

export function csalasExtraMaradek(maCsalasDb) {
  if (!CSALAS_FIGYELO_BE) return 0;
  const db = Number.isFinite(maCsalasDb) ? maCsalasDb : 0;
  return Math.max(0, CSALAS_EXTRA_NAPI - db);
}

export function csalasHir(meta) {
  return !!meta?.csalas;
}

export function csalasExtraHir(meta) {
  return !!meta?.csalas_extra;
}

export const CSALAS_SZURO_RENDSZER = `You classify items from official consumer-safety feeds (FBI IC3 public service announcements, Google Safety & Security blog).
For each item decide whether it describes a SPECIFIC scam (or scam wave) that targets ordinary private people: who the scammer pretends to be, which channel they use, and what they ask the victim for (money, codes, passwords, personal data, remote access).

Answer "csalas": true ONLY for that case.
Answer "csalas": false for:
- warnings aimed at officials, businesses, IT staff or other organizations,
- software or security vulnerabilities (CVE, "vulnerability alert", patches),
- general safety tip collections that do not describe a concrete scam,
- announcements of a new anti-scam or security product feature (for example scam detection in a messaging app) — that is product news, not a warning.

"csatorna" is the main channel the scam reaches people through: one of sms|email|chat|call|social|web (null when "csalas" is false).
"ok" is one short English sentence explaining the decision.

Reply with JSON only, no prose:
{"decisions":[{"index":0,"csalas":true,"csatorna":"sms|email|chat|call|social|web","ok":"brief"}]}`;

export function csalasSzuroPrompt(tetelek) {
  const sorok = (tetelek || []).map((x, i) => {
    const kivonat = String(x?.snippet ?? '').replace(/\s+/g, ' ').trim().slice(0, 600);
    return `[${i}] Title: ${String(x?.title ?? '').trim()}\nSummary: ${kivonat}`;
  });
  return `Classify these ${sorok.length} items.\n\n${sorok.join('\n\n')}`;
}

function jsonKivag(text) {
  let s = String(text ?? '').trim();
  const kerites = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (kerites) s = kerites[1].trim();
  try { return JSON.parse(s); } catch { /* lent tovább */ }
  // Ha a modell szöveget is írt a JSON köré: az első { vagy [ és az utolsó } vagy ] közötti rész.
  const eleje = s.search(/[\[{]/);
  const vege = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
  if (eleje < 0 || vege <= eleje) return undefined;
  try { return JSON.parse(s.slice(eleje, vege + 1)); } catch { return undefined; }
}

export function csalasDontesek(text, n) {
  const adat = jsonKivag(text);
  const lista = Array.isArray(adat) ? adat : Array.isArray(adat?.decisions) ? adat.decisions : null;
  if (!lista) return null;
  const kesz = [];
  for (const d of lista) {
    const index = d?.index;
    if (!Number.isInteger(index) || index < 0 || index >= n) continue;
    const csalas = d.csalas === true;
    const csatorna = CSATORNAK.includes(d.csatorna) ? d.csatorna : null;
    kesz.push({ index, csalas, csatorna, ok: typeof d.ok === 'string' ? d.ok : '' });
  }
  return kesz;
}

// ── 5. rész (2026-11-24): a hírgyűjtő ága — szétosztás, vázlat-jelölés, őrszem ──────────────────────────

// A besoroló döntései (csalasDontesek kimenete) → mi lesz vázlat, mi eldobva, mi marad újrapróbára.
// `dontesek === null` (sikertelen hívás / értelmezhetetlen válasz): SEMMI sem dől el — a hírgyűjtő ilyenkor
// egyik tételt sem jelöli látottnak, a következő futás újra próbálja.
// Csalás csatorna nélkül → eldobva: a kép-sablon csatornából készül (4. rész), csatorna nélkül nem lenne kép.
export function csalasSzetosztas(jeloltek, dontesek) {
  const lista = Array.isArray(jeloltek) ? jeloltek : [];
  const ki = { csalas: [], eldobva: [], dontetlen: [] };
  if (!Array.isArray(dontesek)) { ki.dontetlen = lista; return ki; }
  const eldontve = new Set();
  for (const d of dontesek) {
    const jelolt = lista[d?.index];
    if (!jelolt || eldontve.has(d.index)) continue;
    eldontve.add(d.index);
    const cim = String(jelolt.item?.title ?? '');
    if (d.csalas === true && d.csatorna) ki.csalas.push({ jelolt, csatorna: d.csatorna, ok: d.ok || '' });
    else if (d.csalas === true) ki.eldobva.push({ jelolt, cim, ok: 'csalás, de a besoroló nem adott csatornát' + (d.ok ? ` (${d.ok})` : '') });
    else ki.eldobva.push({ jelolt, cim, ok: d.ok || '' });
  }
  ki.dontetlen = lista.filter((_, i) => !eldontve.has(i));
  return ki;
}

// A csalás-vázlat _meta-kiegészítése (a hírgyűjtő saveDraft-ja a _meta-ba teríti).
export function csalasVazlatMeta(dontes, feedConfig) {
  const ok = dontes?.ok || '';
  return {
    csalas: { csatorna: dontes?.csatorna ?? null, ok, forras_id: feedConfig?.id ?? null },
    relevance: { relevant: true, score: 10, category: 'scam', reason: ok },
  };
}

// memory/csalas-guard.json frissítése a hírgyűjtő futása után. A fájlon a kép-lépés (4. rész) is osztozik:
// az `at` és a kep_* mezők az övéi — ezeket NEM bántjuk. A hírgyűjtő SAJÁT figyelo_* mezőket ír, minden
// futásban (akkor is, ha nem volt jelölt), hogy a „nem futott” is látsszon. Hibánál figyelo_hiba, a következő
// jó futás törli.
export function csalasGuardFrissit(regi, { jelolt = 0, csalas = 0, eldobva = [], hiba } = {}, now = new Date()) {
  const alap = regi && typeof regi === 'object' && !Array.isArray(regi) ? { ...regi } : {};
  delete alap.figyelo_hiba;
  Object.assign(alap, {
    figyelo_at: now.toISOString(),
    figyelo_jelolt: jelolt,
    figyelo_csalas: csalas,
    figyelo_eldobva: eldobva,
  });
  if (hiba) alap.figyelo_hiba = String(hiba);
  return alap;
}
