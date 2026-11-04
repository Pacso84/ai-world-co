// ===================================================================
// PIPELINE-ŐRKUTYA — a worker oldala (2026-08-27, javítva 08-28)
// ===================================================================
// MIÉRT ITT: 2026-08-27-én a 00:00 UTC-s GitHub-futás EL SEM INDULT.
// Nálunk nem volt hiba — a GitHub az ütemezett futásokra „legjobb szándék"
// garanciát ad, azok késhetnek és ki is maradhatnak. A GitHub ütemezőjét
// nem tudjuk megjavítani; teszünk mellé egy FÜGGETLEN ÓRÁT.
//
// A DÖNTÉS NEM ITT VAN, hanem a core/pipeline-watchdog.js-ben: azt lehet
// hálózat nélkül tesztelni, ezt nem. Itt csak a beszerzés és a cselekvés van.
// ===================================================================

import { shouldTrigger } from '../../core/pipeline-watchdog.js';
import { tg } from './tg.js';

const KV_POKE = 'watchdog:last-poke';
const KV_NYOM = 'watchdog:last-check';
const KV_RIASZT = 'watchdog:last-alert';
const RIASZTAS_SZUNET_MP = 4 * 3600;   // egy hibáról max. 4 óránként szólunk
const NAP_MP = 86400;
const WORKFLOW = 'auto.yml';
const UA = 'aiworld-pipeline-watchdog';

// A KV SOSEM dönthet el egy őrjáratot — se olvasáskor, se íráskor.
const kvGet = async (env, k) => { try { return await env?.FEEDBACK?.get(k); } catch { return null; } };
const kvPut = async (env, k, v, ttl) => {
  try { await env?.FEEDBACK?.put(k, v, { expirationTtl: ttl }); } catch { /* néma */ }
};

/**
 * 🔔 RIASZTÁS, LEGFELJEBB 4 ÓRÁNKÉNT (2026-08-28).
 *
 * A bökésre volt szünet, a riasztásra nem: egy tartós hiba óránként egy
 * üzenetet jelentett volna, napi 24-et. Egy figyelmeztetés, ami mindennap
 * huszonnégyszer szól, egy hét alatt láthatatlanná válik — ugyanaz a hiba,
 * amit az egyenleg-őrnél már egyszer kijavítottunk.
 *
 * 🔑 CSAK A TÉNYLEG KIMENT RIASZTÁS NÉMÍT (2026-08-30). Korábban a szünet
 * akkor is bejegyződött, ha a Telegram elutasította a küldést — a „szóltam"
 * a KÜLDÉS MEGKÍSÉRLÉSÉT jelentette, nem a megérkezését. Egy átmeneti 429
 * így négy órára ELNÉMÍTOTTA az őrkutyát egy olyan riasztásról, amit senki
 * nem kapott meg. („Sikeres" válasz ≠ elvégzett munka — a lánc VÉGÉT mérd.)
 */
async function riaszt(env, szoveg) {
  if (await kvGet(env, KV_RIASZT)) return false;
  // A `tg()` szerződés szerint nem dob; a `.catch` csak öv a nadrágtartó mellé,
  // mert itt egy elutasított ígéret a `ctx.waitUntil()` alatt némán elveszne.
  const kuldes = await tg(env, env?.OWNER_CHAT_ID, szoveg).catch(() => ({ ok: false }));
  if (!kuldes?.ok) return false;   // nem ment ki → NEM némítjuk el magunkat
  await kvPut(env, KV_RIASZT, new Date().toISOString(), RIASZTAS_SZUNET_MP);
  return true;
}

/** Egyetlen lekérdezés a GitHubhoz — `hitelesitve` dönti el, megy-e token. */
function kerdez(env, fetchFn, hitelesitve) {
  const url = `https://api.github.com/repos/${env.GH_REPO}/actions/workflows/${WORKFLOW}/runs?per_page=1`;
  const fejlec = { Accept: 'application/vnd.github+json', 'User-Agent': UA };
  if (hitelesitve) fejlec.Authorization = `Bearer ${env.GH_TOKEN}`;
  return fetchFn(url, { headers: fejlec, signal: AbortSignal.timeout(15000) });
}

/**
 * Mikor indult utoljára az auto pipeline?
 *
 * 🔑 HITELESÍTVE (2026-08-28). Eredetileg szándékosan hitelesítés nélkül ment
 * („a repó publikus, így nem kellett új jogosultság") — rossz dolgot
 * optimalizáltam: a `GH_TOKEN` már itt volt a workerben. A hitelesítetlen
 * GitHub-keret 60 kérés/óra IP-CÍMENKÉNT, a Workerek pedig OSZTOTT, forgó
 * kimenő IP-ket használnak. Próba-workerrel mérve, ugyanezzel a kéréssel:
 *     keret 39/60 · 48/60 · 58/60 · 57/60
 * — vagyis MÁS BÉRLŐK 2-21 kérést már elhasználtak azon az IP-n. Tokennel a
 * keret 5000/óra, és a TOKENHEZ tartozik, nem egy idegen IP-hez (mérve).
 *
 * ⚠️ TARTALÉK-ÚT: a `GH_TOKEN` a dokumentációnk szerint „szűk jogú PAT (repo
 * dispatch)". Ha az fine-grained PAT `Actions: Read` nélkül, akkor erre a
 * végpontra PUBLIKUS repón is 403-at ad — és a javítás megölné az őrkutyát.
 * Ezért 401/403-nál visszaesünk a régi, hitelesítetlen útra: így a változás
 * SOSEM lehet rosszabb a korábbi állapotnál.
 *
 * @returns {{at: string|null, allapot: string}}
 */
async function utolsoFutas(env, fetchFn) {
  const vanToken = !!env.GH_TOKEN;
  let r = await kerdez(env, fetchFn, vanToken);
  let allapot = 'ok';

  if (vanToken && !r.ok && (r.status === 401 || r.status === 403)) {
    const elsoStatus = r.status;
    r = await kerdez(env, fetchFn, false);
    allapot = r.ok
      ? `ok (TARTALÉK: a token ${elsoStatus}-at adott, hitelesítés nélkül ment)`
      : `HTTP ${elsoStatus} tokennel, ${r.status} anélkül`;
  }

  if (!r.ok) return { at: null, allapot: allapot === 'ok' ? `HTTP ${r.status}` : allapot };
  const j = await r.json();
  return { at: j?.workflow_runs?.[0]?.created_at || null, allapot };
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

/** Egy őrjárat érdemi része. Dobhat — a hívó fogja el. */
async function orjarat(env, fetchFn, now) {
  if (!env?.GH_REPO) return { trigger: false, reason: 'nincs GH_REPO' };

  const futas = await utolsoFutas(env, fetchFn);
  const lastPokeAt = await kvGet(env, KV_POKE);
  const d = shouldTrigger({ lastRunAt: futas.at, lastPokeAt, now });

  // ⚠️ AZ "ISMERETLEN" NEM CSEND. Ha nem derül ki, mikor futott utoljára,
  // nem indítunk vakon (duplikált futás = dupla költés) — de SZÓLUNK,
  // különben a vakság ugyanúgy néz ki, mint a nyugalom.
  if (!d.trigger) {
    if (d.reason.startsWith('ISMERETLEN')) {
      await riaszt(env, `🐕 Őrkutya: ${d.reason} (${futas.allapot}) — nem indítottam el semmit.`);
    }
    return { ...d, allapot: futas.allapot };
  }

  // ⚠️ A BÖKÉS-NYOM AZ INDÍTÁS ELŐTT megy be (2026-08-28). Korábban utána
  // volt: ha a dispatch DOBOTT (15 s-os timeout, miközben a GitHub már
  // átvette a kérést), a nyom nem rögzült, és egy óra múlva újra bökhettünk
  // volna. Fordított sorrendben a legrosszabb eset egy KIMARADT pótlás
  // (4 óra múlva újrapróbáljuk), nem egy DUPLA, fizetős futás.
  await kvPut(env, KV_POKE, new Date(now).toISOString(), NAP_MP);

  const r = await inditas(env, fetchFn, d.reason);
  await tg(env, env.OWNER_CHAT_ID, r.ok
    ? `🐕 Őrkutya: kimaradt egy futás (${d.gapHours.toFixed(1)} óra némaság) — elindítottam a pipeline-t.`
    : `🐕 Őrkutya: kimaradt egy futás (${d.gapHours.toFixed(1)} óra), de az indítás NEM sikerült (HTTP ${r.status}). ${r.detail}`
  ).catch(() => { /* */ });

  return { ...d, sent: r.ok, allapot: futas.allapot };
}

/**
 * Egy őrkutya-kör. SOHA nem dob: a `ctx.waitUntil()` alatt egy elutasított
 * ígéret NÉMÁN elveszne — pontosan az a hibaosztály, ami az egészet kiváltotta.
 *
 * 🔍 NYOM MINDEN ŐRJÁRATRÓL. A 08-28-i nyomozás egy órába telt, mert a
 * bökés-nyom CSAK beavatkozáskor íródott: a hiánya egyszerre jelentette azt,
 * hogy „nem volt dolga", és azt, hogy „el sem indult". A `watchdog:last-check`
 * mostantól minden kör végén rögzíti az időt és a döntést:
 *     wrangler kv key get "watchdog:last-check" --namespace-id=… --remote
 *
 * ⚠️ EGYETLEN ÍRÁS, a kör VÉGÉN. Az első változatom kettőt írt (indulás +
 * vég) UGYANARRA a kulcsra, ezredmásodpercek különbséggel — a Workers KV
 * viszont kulcsonként 1 írás/másodpercet enged. A második, ÉRDEMI írás
 * veszett volna el, és a KV-ben maradt „indul" bejegyzés félbeszakadt
 * őrjáratnak látszott volna. A diagnosztika épp az egészséges esetben adott
 * volna hamis riasztást.
 */
export async function pipelineWatchdog(env, fetchFn = fetch, now = Date.now()) {
  let eredmeny;
  try {
    eredmeny = await orjarat(env, fetchFn, now);
  } catch (e) {
    const reason = 'őrkutya-hiba: ' + String(e?.message || e).slice(0, 120);
    // ⚠️ A KIVÉTEL-ÁG KORÁBBAN TELJESEN NÉMA VOLT: se Telegram, se indítás.
    // Az ISMERETLEN ág kapott hangot, ez nem — pedig ugyanúgy azt jelenti,
    // hogy az őrkutya nem őrködik.
    await riaszt(env, `🐕 Őrkutya: ${reason} — nem tudtam ellenőrizni a pipeline-t.`);
    eredmeny = { trigger: false, reason };
  }

  // A `now` érvénytelen is lehet — a nyom írása sosem dobhat.
  const mikor = new Date(Number.isFinite(now) ? now : Date.now()).toISOString();
  await kvPut(env, KV_NYOM, JSON.stringify({
    at: mikor,
    trigger: !!eredmeny.trigger,
    reason: eredmeny.reason,
    allapot: eredmeny.allapot || null
  }), NAP_MP);

  return eredmeny;
}
