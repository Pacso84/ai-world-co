// ===================================================================
// BUFFER GraphQL API-RÉTEG — a hálózati fél, TESZTELHETŐEN (2026-09-16)
// ===================================================================
//
// MIÉRT KELT KI EZ A POSZTERBŐL. A Buffer-hívások eddig az
// `agents/social/buffer-poster.js`-ben laktak, az pedig NEM IMPORTÁLHATÓ: a
// fájl végén feltétel nélkül elindul a `main()`, tehát a puszta `import`
// VALÓDI posztot küldene ki. Emiatt a réteg, ami a pénzt és a kiküldést
// kezeli, EGYETLEN teszt alatt sem állt — pontosan az a minta, amiért a
// `core/buffer-guard.js` is kikerült ide 2026-08-30-án.
//
// ⚠️ A KÖZPONTI LECKE, AMIT EZ A MODUL ŐRIZ:
//     A GRAPHQL MINDIG HTTP 200-AT AD.
// A hibát nem a státuszkód hozza, hanem a válasz TARTALMA, típusos unióban:
//     createPost -> PostActionSuccess | NotFoundError | UnauthorizedError |
//                   UnexpectedError | RestProxyError | LimitReachedError |
//                   InvalidInputError
// Ez élesben MEG IS VEZETETT (2026-08-14): az első változat csak
// `__typename`-et kért, GraphQL-szintű hiba nem jött, ezért MINDEN variánst
// sikernek vett. A Threadsnél véletlenül igaz volt, az Instagramnál viszont a
// poszt LÉTRE SEM JÖTT, miközben a napló ✅-t írt. Azóta: csak a
// `PostActionSuccess` siker, minden más HIBA — és a hiba ugyanúgy megy tovább
// a `core/buffer-guard.js` felé, mint a lejárt token 401-e.
// („A sikeres válasz nem elvégzett munka" — a lánc VÉGÉT mérjük.)
//
// ── A VÉGPONT ÉS A HITELESÍTÉS (a Buffer saját dokumentációjából) ────
//   POST https://api.buffer.com
//   Authorization: Bearer <API_KEY>
//   Content-Type: application/json
//   body: { "query": "...", "variables": { ... } }
// A kulcs a https://publish.buffer.com/settings/api oldalon készül.
//
// ⚠️ A RÉGI REST API (`api.bufferapp.com/1/`) MÁR NEM ÉRINT MINKET: erre a
// GraphQL API-ra 2026-08-14-én álltunk át, a repóban egyetlen `bufferapp`
// hivatkozás sincs. A Buffer a régi felületet 2027-02-01-én nyugdíjazza.
//
// ⚠️ A `graph.buffer.com` IS ÉL és introspektálható, de az adat-lekérdezéseknél
// maga a Buffer szól rá: {"errors":[{"message":"Please use api.buffer.com"}]}.
//
// EZ A MODUL NEM INDÍT SEMMIT a betöltésekor, és nem olvas környezeti
// változót — a tokent és a `fetch`-et a hívó adja. Ezért importálható,
// ezért tesztelhető hálózat nélkül (core/buffer-api.test.js).
// ===================================================================

/** A GraphQL végpont. EGY helyen, mert a teszt is erre hivatkozik. */
export const BUFFER_ENDPOINT = 'https://api.buffer.com/';

/**
 * A Reel-csempe pillanata (ms).
 *
 * A horog-kártya a videó elején van; az 1. másodperc biztosan benne esik, a 0
 * viszont a legelső képkockára ülne.
 *
 * ⚠️ MIÉRT NEM `thumbnailUrl` (2026-08-27, éles lecke). A mező SZEREPEL a
 * sémában, tehát támogatottnak LÁTSZIK — az API mégis elutasítja:
 *     "Video thumbnailUrl is not supported: social networks do not accept
 *      custom video thumbnail images… To pick the video thumbnail, set
 *      metadata.thumbnailOffset on the video (milliseconds)."
 * A séma megléte NEM bizonyítja, hogy a hálózat el is fogadja.
 */
export const REEL_CSEMPE_MS = 1000;

// ── A LEKÉRDEZÉSEK ─────────────────────────────────────────────────
// Kiemelve, hogy a teszt az ALAKJUKAT is pinnelni tudja: a `channelId`
// EGYES SZÁMA nem stílus kérdése, hanem a REST→GraphQL váltás lényege.

/**
 * ⚠️ Az `account.currentOrganization` út FORBIDDEN ezzel a tokennel, az
 * `account.organizations` viszont működik (mindkettőt élesben mértem).
 */
export const SZERVEZET_QUERY = `{ account { organizations { id } } }`;

/** A csatorna-lekérdezés KÖTELEZŐEN kér szervezet-azonosítót. */
export const CSATORNAK_QUERY =
  `query($i: ChannelsInput!){ channels(input:$i){ id service name isDisconnected isLocked } }`;

/**
 * ⚠️ A `channelIds` NEM a PostsInput gyökerében van, hanem a `filter` alatt
 * (élesben mérve, 2026-08-24: a gyökérbe téve „Field channelIds is not
 * defined by type PostsInput" jön).
 */
export const POSZTOK_QUERY =
  `query($i: PostsInput!){ posts(input:$i){ edges { node { status sentAt } } } }`;

/**
 * A poszt-készítő mutáció.
 *
 * ⚠️ MINDEN unió-variánst LEKÉRDEZÜNK. Ha csak a `PostActionSuccess`-t kérnénk,
 * a hibás válasz üres objektumként jönne vissza, üzenet nélkül — és megint ott
 * tartanánk, hogy a bukás oka láthatatlan. A `message` az, ami a napi riportba
 * kerül (pl. „Instagram posts require a type (post, story, or reel)").
 */
export const CREATE_POST_MUTATION = `mutation ($input: CreatePostInput!) {
    createPost(input: $input) {
      __typename
      ... on PostActionSuccess { post { id status } }
      ... on NotFoundError { message }
      ... on UnauthorizedError { message }
      ... on UnexpectedError { message }
      ... on RestProxyError { code message }
      ... on LimitReachedError { message }
      ... on InvalidInputError { message }
    }
  }`;

/**
 * Egy GraphQL kérés a Bufferhez.
 *
 * SOHA NEM DOB: minden kimenetel `{ data }` vagy `{ error }` alakban jön
 * vissza, mert a hívó (a poszter) a hibát az őrszem-fájlba teszi, nem
 * kivételbe. Egy dobott hiba itt az egész futást megölné.
 *
 * ⚠️ TOKEN NÉLKÜL EL SEM INDUL a kérés. Ez az „alszik, nem hibázik"
 * viselkedés: amíg a `BUFFER_ACCESS_TOKEN` titok üres, a poszter nem
 * hálózatozik, nem jelöl meg semmit, és a CI-lépés zölden fut le.
 *
 * @param {string} query      a GraphQL szöveg
 * @param {object} variables  a változók
 * @param {object} opts
 *   token     {string}    a Buffer API-kulcs (a hívó olvassa ki a környezetből)
 *   fetchFn   {Function}  INJEKTÁLHATÓ — a teszt hamis fetch-et ad, így a
 *                         tesztcsomag hálózat és pénz nélkül fut
 *   endpoint  {string}    felülírható végpont (teszt)
 *   timeoutMs {number}    8 helyett 20 mp — ugyanaz, ami eddig is volt
 * @returns {Promise<{data?: object, error?: string, status?: number}>}
 */
export async function bufferGql(query, variables = {}, opts = {}) {
  const t = String(opts.token || '').trim();
  if (!t) return { error: 'nincs BUFFER_ACCESS_TOKEN' };

  const f = opts.fetchFn || globalThis.fetch;
  const endpoint = opts.endpoint || BUFFER_ENDPOINT;
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 20000;

  try {
    const r = await f(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(timeoutMs)
    });
    const j = await r.json().catch(() => ({}));
    // A NEM HELYREHOZHATÓ hibák (hitelesítés, jogosultság, keret) az `errors`
    // tömbben jönnek — HTTP 200 mellett is. Ezt nézzük ELŐBB: a lejárt token
    // élesben így néz ki („Access token is not valid").
    if (j.errors?.length) return { error: String(j.errors[0].message).slice(0, 140), status: r.status };
    if (!r.ok) return { error: `HTTP ${r.status}`, status: r.status };
    return { data: j.data };
  } catch (e) {
    return { error: String(e.message).slice(0, 100) };
  }
}

/** A fiók első szervezetének azonosítója. */
export async function lekerSzervezet(opts = {}) {
  const r = await bufferGql(SZERVEZET_QUERY, {}, opts);
  if (r.error) return { error: r.error };
  const id = r.data?.account?.organizations?.[0]?.id;
  return id ? { id } : { error: 'nincs szervezet a fiókhoz' };
}

/**
 * A bekötött csatornák — SZŰRETLENÜL.
 *
 * ⚠️ A szűrés (isDisconnected / isLocked) SZÁNDÉKOSAN a hívónál marad: az
 * őrszemnek a NYERS lista kell, különben a „leesett az Instagram" és a „ma nem
 * volt mit posztolni" kívülről egyformán nézne ki.
 */
export async function lekerCsatornak(organizationId, opts = {}) {
  const r = await bufferGql(CSATORNAK_QUERY, { i: { organizationId } }, opts);
  if (r.error) return { error: r.error };
  const cs = r.data?.channels;
  if (!Array.isArray(cs)) return { error: 'hiányzó channels lista' };
  return { csatornak: cs };
}

/**
 * Az EGY csatornára tartozó posztok (a napi plafon nyersanyaga).
 *
 * ⚠️ HIBÁNÁL `{ error }` JÖN, NEM üres lista. A hívó ebből csinál `null`-t, és
 * a `null` nem ugyanaz, mint a 0: a 0 azt jelenti, „ma még nem ment ki semmi",
 * a null azt, hogy „nem tudom" — utóbbira az `allowedNow()` BEZÁR. Ha a hibát
 * 0-nak adnánk, a napi plafon némán kikapcsolna.
 *
 * ⚠️ ISMERT KORLÁT: a Buffer lapozva válaszol (mérve 10 poszt, legújabb elöl).
 * 10 fölötti napi plafonnál ITT kellene lapozást írni.
 */
export async function lekerPosztok({ organizationId, channelId }, opts = {}) {
  const r = await bufferGql(POSZTOK_QUERY, { i: { organizationId, filter: { channelIds: [channelId] } } }, opts);
  if (r.error) return { error: r.error };
  const edges = r.data?.posts?.edges;
  if (!Array.isArray(edges)) return { error: 'hiányzó posts.edges' };
  return { nodes: edges.map(e => e?.node).filter(Boolean) };
}

/**
 * A `createPost` bemenete — TISZTA függvény, hálózat nélkül ellenőrizhető.
 *
 * ⚠️ EGY POSZT = EGY CSATORNA. A régi REST `profile_ids[]` TÖMBÖT fogadott, a
 * GraphQL `channelId`-t, EGYES SZÁMBAN. Több csatornára tehát CSATORNÁNKÉNT
 * EGY mutációt kell küldeni — ezt a `createPostInput` alakja kényszeríti ki,
 * és a teszt is ezt őrzi.
 *
 * A séma ÉLESBEN LEKÉRDEZVE (2026-08-14) — az első tippem HÁROM ponton tévedett
 * volna, és a poszt elbukott volna:
 *    tippem: channelIds:[id]      valóság: channelId (EGYES SZÁM), kötelező
 *    tippem: assets opcionális    valóság: assets KÖTELEZŐ (NON_NULL)
 *    tippem: —                    valóság: mode + needsApproval +
 *                                          schedulingType MIND kötelező
 * Az értékkészletek is a szerverről:
 *    ShareMode      = addToQueue | customScheduled | shareNext | shareNow
 *    SchedulingType = automatic | notification
 */
export function createPostInput({ channelId, text, image, video, channelKey }) {
  // ── VIDEÓ VAGY KÉP ──────────────────────────────────────────────
  // A séma élesben lekérdezve (2026-08-25):
  //     AssetInput      = { document | image | video }
  //     VideoAssetInput = { url, thumbnailUrl, metadata }
  // A csempét a videó egy PILLANATÁVAL választjuk — lásd REEL_CSEMPE_MS.
  const assets = video
    ? [{ video: { url: video, metadata: { thumbnailOffset: REEL_CSEMPE_MS } } }]
    : image ? [{ image: { url: image } }] : [];

  const input = {
    channelId,
    text,
    // Az assets NON_NULL: kép nélkül ÜRES lista megy (X/Threads elfogadja,
    // az Instagramot kép nélkül a hívó már kihagyta).
    assets,
    mode: 'shareNow',
    schedulingType: 'automatic',
    needsApproval: false
  };

  // AZ INSTAGRAM KÜLÖN METAADATOT KÖVETEL. Enélkül a mutáció így felel:
  //    InvalidInputError: Instagram posts require a type (post, story, or reel)
  // — és ez a hibaüzenet CSAK azért látszik, mert az unió-variánsokat is
  // lekérdezzük. Korábban némán „sikernek" tűnt, miközben a poszt létre sem jött.
  //    PostType = carousel | event | ghost_post | offer | post | reel | short
  //               | story | thread | whats_new
  if (channelKey === 'instagram') {
    input.metadata = { instagram: { type: video ? 'reel' : 'post', shouldShareToFeed: true } };
  }

  return input;
}

/**
 * A `createPost` VÁLASZÁNAK értékelése — TISZTA függvény.
 *
 * 🔑 ITT LAKIK A LECKE: a HTTP 200 önmagában SEMMIT nem bizonyít. Csak a
 * `PostActionSuccess` variáns siker; minden más — beleértve a hiányzó vagy
 * ismeretlen `__typename`-t — HIBA, és `{ error }`-ként megy tovább, ugyanúgy,
 * ahogy a lejárt token hibája.
 *
 * ⚠️ AZ ISMERETLEN VARIÁNS IS HIBA, NEM SIKER. Ha a Buffer holnap új
 * hibatípust vezet be (a saját dokumentációjuk épp erre figyelmeztet a
 * `VoidMutationError` kapcsán), az ide „ismeretlen válasz"-ként esik be — nem
 * pedig némán sikerré válik.
 *
 * @param {object} r a `bufferGql` eredménye
 */
export function ertekelCreatePost(r) {
  if (!r || r.error) return { error: r?.error || 'nincs válasz' };
  const p = r.data?.createPost;
  if (p?.__typename !== 'PostActionSuccess') {
    return { error: `${p?.__typename || 'ismeretlen válasz'}: ${p?.message || '(nincs üzenet)'}` };
  }
  // ⚠️ A siker MÉG ÍGY IS csak annyit jelent: „a Buffer átvette". Hogy a poszt
  // meg is JELENT, azt a csatornánkénti látogatószám mutatja meg — külön mérés.
  return { data: p.post };
}

/**
 * EGY poszt kiküldése EGY csatornára.
 *
 * @returns {Promise<{data?: object, error?: string}>}
 */
export async function createPost(args, opts = {}) {
  const input = createPostInput(args);
  const r = await bufferGql(CREATE_POST_MUTATION, { input }, opts);
  return ertekelCreatePost(r);
}

export default {
  BUFFER_ENDPOINT, REEL_CSEMPE_MS,
  SZERVEZET_QUERY, CSATORNAK_QUERY, POSZTOK_QUERY, CREATE_POST_MUTATION,
  bufferGql, lekerSzervezet, lekerCsatornak, lekerPosztok,
  createPostInput, ertekelCreatePost, createPost
};
