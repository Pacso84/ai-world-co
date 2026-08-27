// ===================================================================
// PIPELINE-ŐRKUTYA — a worker oldala (2026-08-27)
// ===================================================================
// MIÉRT ITT: 2026-08-27-én a 00:00 UTC-s GitHub-futás EL SEM INDULT.
// Nálunk nem volt hiba — a GitHub az ütemezett futásokra „legjobb szándék"
// garanciát ad, azok késhetnek és ki is maradhatnak.
//
// A GITHUB ÜTEMEZŐJÉT NEM TUDJUK MEGJAVÍTANI. Amit tehetünk: teszünk mellé
// egy FÜGGETLEN ÓRÁT. Ez a worker amúgy is fut, van GitHub-kulcsa, és a
// Cloudflare cron-ja külön rendszer — hogy MINDKETTŐ ugyanabban az órában
// hibázzon, sokkal valószínűtlenebb, mint hogy az egyik.
//
// A DÖNTÉS NEM ITT VAN, hanem a core/pipeline-watchdog.js-ben: azt lehet
// hálózat nélkül tesztelni, ezt nem. Itt csak a beszerzés és a cselekvés van.
//
// ⚠️ A LEKÉRDEZÉS HITELESÍTÉS NÉLKÜL MEGY: a repó publikus, az Actions API
// token nélkül is olvasható (mérve). Így az őrkutyához NEM kellett új
// jogosultságot adni a kulcsnak — a meglévő GH_TOKEN csak az INDÍTÁSHOZ kell,
// pontosan azzal a `repository_dispatch` hívással, ami már évek óta működik.
// ===================================================================
import { shouldTrigger } from '../../core/pipeline-watchdog.js';
import { tg } from './tg.js';

const KV_KULCS = 'watchdog:last-poke';
const WORKFLOW = 'auto.yml';
const UA = 'aiworld-pipeline-watchdog';

/** Mikor indult utoljára az auto pipeline? null, ha nem derül ki. */
async function utolsoFutas(env, fetchFn) {
  const url = `https://api.github.com/repos/${env.GH_REPO}/actions/workflows/${WORKFLOW}/runs?per_page=1`;
  const r = await fetchFn(url, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': UA },
    signal: AbortSignal.timeout(15000)
  });
  if (!r.ok) return null;
  const j = await r.json();
  return j?.workflow_runs?.[0]?.created_at || null;
}

/** Elindítja a pipeline-t ugyanazzal a mechanizmussal, ami a chatnál is megy. */
async function inditas(env, fetchFn, indok) {
  const r = await fetchFn(`https://api.github.com/repos/${env.GH_REPO}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': UA,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ event_type: 'pipeline-catchup', client_payload: { reason: indok } }),
    signal: AbortSignal.timeout(15000)
  });
  return { ok: r.ok, status: r.status, detail: r.ok ? '' : (await r.text().catch(() => '')).slice(0, 160) };
}

/**
 * Egy őrkutya-kör. SOHA nem dob: a Cloudflare cron hibája némán elveszne.
 * @returns {Promise<{trigger:boolean, reason:string, sent?:boolean}>}
 */
export async function pipelineWatchdog(env, fetchFn = fetch, now = Date.now()) {
  try {
    if (!env?.GH_REPO) return { trigger: false, reason: 'nincs GH_REPO' };

    const lastRunAt = await utolsoFutas(env, fetchFn);
    let lastPokeAt = null;
    try { lastPokeAt = await env.FEEDBACK?.get(KV_KULCS); } catch { /* KV-hiba: mintha nem böktünk volna */ }

    const d = shouldTrigger({ lastRunAt, lastPokeAt, now });

    // ⚠️ AZ "ISMERETLEN" NEM CSEND. Ha nem derül ki, mikor futott utoljára,
    // nem indítunk vakon (duplikált futás = dupla költés) — de SZÓLUNK,
    // különben a vakság ugyanúgy néz ki, mint a nyugalom.
    if (!d.trigger) {
      if (d.reason.startsWith('ISMERETLEN')) {
        await tg(env, env.OWNER_CHAT_ID, `🐕 Őrkutya: ${d.reason} — nem indítottam el semmit.`)
          .catch(() => { /* a Telegram hibája ne dobja el az őrjáratot */ });
      }
      return d;
    }

    const r = await inditas(env, fetchFn, d.reason);
    // A bökés tényét AKKOR IS rögzítjük, ha a hívás elbukott: különben
    // óránként újrapróbálnánk ugyanazt.
    try { await env.FEEDBACK?.put(KV_KULCS, new Date(now).toISOString(), { expirationTtl: 86400 }); }
    catch { /* */ }

    await tg(env, env.OWNER_CHAT_ID, r.ok
      ? `🐕 Őrkutya: kimaradt egy futás (${d.gapHours.toFixed(1)} óra némaság) — elindítottam a pipeline-t.`
      : `🐕 Őrkutya: kimaradt egy futás (${d.gapHours.toFixed(1)} óra), de az indítás NEM sikerült (HTTP ${r.status}). ${r.detail}`
    ).catch(() => { /* */ });

    return { ...d, sent: r.ok };
  } catch (e) {
    return { trigger: false, reason: 'őrkutya-hiba: ' + String(e?.message || e).slice(0, 120) };
  }
}
