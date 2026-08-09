// ===================================================================
// KÉP-CÉLPONTOK — melyik cikkhez melyik megosztás-képet gyártsuk le
// ===================================================================
//
// MIÉRT VAN KÜLÖN FÁJLBAN: a core/share-images.js a végén FELTÉTEL NÉLKÜL
// hívja a main()-t, tehát az importálása elindítaná a képgyártást. Tiszta
// függvényt csak külön modulból lehet tesztelni.
//
// A MEGOLDOTT PROBLÉMA (2026-08-09, mérve):
// A képgenerátor eddig CSAK a 7 napnál frissebb cikkekhez dolgozott, mert a
// build minden futáskor üríti a public/-ot, és mindent újragyártani drága.
// A Facebook-sor viszont FENNTARTOTT HELYEN küld ki örökzöld útmutatókat is
// (core/social-queue.js), hetekkel a publikálás után. Az utolsó 22 kiküldött
// posztból 11 emiatt CÍM NÉLKÜLI sima borítót kapott — pontosan a felük.
//
// Megoldás: a 7 napos ablakon kívül is legyártjuk a képet annak, ami MÉG
// SORBAN ÁLL. Ez 222 cikk, ~65 másodperc CI-futásonként (mérve: 145 ms/kép),
// a futások pedig 10-23 percesek a 42 perces keretből — belefér.
// ===================================================================

// A posztolók ezeket keresik először (agents/social/poster.js,
// agents/social/pinterest-poster.js). A share/ SZÁNDÉKOSAN nincs köztük:
// az az og:image és a régi posztok tartaléka, nem a mostani kiküldésé.
export const POST_ONLY = ['fb', 'pin'];

// Egy cikkhez legyártandó formátumok.
//   friss            → mind (a share/ kell az og:image-hez is)
//   régi, de sorban  → csak a posztoló formátumok
//   régi és kiküldve → semmi
export function selectFormats({ ageDays, freshDays, isQueued, all }) {
  // Ismeretlen kor (hiányzó published_at): inkább kihagyjuk. Enélkül egy
  // elrontott dátum-mező 600+ képet gyártatna le minden futásban.
  if (!Number.isFinite(ageDays)) return [];
  if (ageDays <= freshDays) return all;
  if (isQueued) return all.filter(f => POST_ONLY.includes(f.key));
  return [];
}

// A social-sor VALÓDI slugja: elsődlegesen az url-ből, mert az a publikált
// cím — a `slug` mező lehet régi/csonka maradvány. (Ugyanaz a szabály, mint
// az agents/social/poster.js realSlug() függvényében; 2026-08-09-én mérve
// mind a 610 sorelemnél egyeztek, de a szabály maradjon egységes.)
function realSlug(post) {
  const fromUrl = String(post?.url || '').split('/article/')[1];
  return (fromUrl || post?.slug || '').replace(/\.html$/, '').replace(/[?#].*$/, '');
}

// Azok a slugok, amelyekre MÉG VÁR kiküldés valamelyik csatornán.
// A `posted_*` mező bármilyen igaz értéke lezárást jelent — a posztolók is
// így nézik (`if (post.posted_fb) continue`), tehát a 'skipped-stale-news'
// string is lezárt.
export function queuedSlugs(posts) {
  const out = new Set();
  for (const p of posts || []) {
    if (p?.posted_fb && p?.posted_pin) continue;      // mindkét csatornán lezárva
    const s = realSlug(p);
    if (s) out.add(s);
  }
  return out;
}
