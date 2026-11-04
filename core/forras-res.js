// 🕳️ FORRÁS-RÉS (2026-10-29, user: „nézzük meg a forráskutatót is!”). A forráskutató 08-15 óta
// egyetlen új forrást sem talált, mert az MI-től kért „új cégeket”, és azok mind elutasítottak voltak.
// Közben a saját adatunk megmutatta a valódi hiányt: az Alexa+-ról 24, a Geminiről 22, a Copilotról 18
// útmutatónk van, hírforrásunk viszont alig. Ez a modul ezt a rést számolja ki — a kutató ebből
// kap célzott keresési feladatot. Tiszta függvények, hálózat nélkül.

/** Egy útmutató-markdown „tool:” (vagy „company:”) mezője. */
export function utmutatoEszkoz(md) {
  const m = String(md || '').match(/^tool:\s*"?([^"\n]+)/m) || String(md || '').match(/^company:\s*"?([^"\n]+)/m);
  return m ? m[1].trim() : '';
}

/** Hány friss hír címében szerepel az eszköz neve (a „+”, kis-nagybetű nem számít)? */
export function hirDb(eszkoz, hirCimek) {
  const kulcs = String(eszkoz).toLowerCase().replace(/\+$/, '').trim();
  if (kulcs.length < 3) return 0;
  return hirCimek.filter(c => String(c).toLowerCase().includes(kulcs)).length;
}

/**
 * A rés: sok útmutató (≥ minUtmutato), kevés friss hír (≤ maxHir) — csökkenő útmutatószám szerint.
 * @param {{utmutatok: string[], hirCimek: string[], minUtmutato?: number, maxHir?: number, max?: number}} p
 *   utmutatok: az útmutatók eszköznevei (ismétlődve, ahány útmutató), hirCimek: az utolsó 30 nap híreinek címe
 */
export function forrasRes({ utmutatok, hirCimek, minUtmutato = 8, maxHir = 3, max = 4 }) {
  const db = new Map();
  for (const e of utmutatok) if (e) db.set(e, (db.get(e) || 0) + 1);
  return [...db.entries()]
    .filter(([e, n]) => n >= minUtmutato && hirDb(e, hirCimek) <= maxHir)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([eszkoz, utmutato]) => ({ eszkoz, utmutato, hir: hirDb(eszkoz, hirCimek) }));
}

/** Ritkítás: egymás utáni üres futások után hány naponta fusson (alap 3, 4 üres után 7). */
export function futasiGyakorisag(uresFutasok, { alap = 3, ritka = 7, kuszob = 4 } = {}) {
  return (Number(uresFutasok) || 0) >= kuszob ? ritka : alap;
}

/** Ugyanaz a hírfolyam-e (a már követett URL-ek között)? A „www.”, a perjel és a protokoll nem számít. */
export function marKovetett(url, kovetettUrlek) {
  const n = u => String(u || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
  const c = n(url);
  return !!c && kovetettUrlek.some(u => n(u) === c);
}

/** Egy cikk-markdown „title:” mezője. */
export function hirCim(md) {
  const m = String(md || '').match(/^title:\s*"?([^"\n]+)/m);
  return m ? m[1].trim() : '';
}

/**
 * FORGÓ ABLAK (2026-10-30, user: „ne csak Alexa és Grok legyen a prioritás!”): a rés MINDEN eszköze sorra kerül —
 * futásonként `n` darab, a napból számolt eltolással körbe forogva (a lista elejéről indulva), így néhány futás alatt
 * mind a 16 eszköz csatornáját keresi a kutató, nem mindig ugyanazt a 4-et.
 */
export function resAblak(res, n = 6, datum = new Date()) {
  const l = Array.isArray(res) ? res : [];
  if (l.length <= n) return l;
  const kor = Math.floor(Date.UTC(datum.getUTCFullYear(), datum.getUTCMonth(), datum.getUTCDate()) / 864e5 / 3);   // a kutató 3 naponta fut
  const kezd = (kor * n) % l.length;
  return Array.from({ length: n }, (_, i) => l[(kezd + i) % l.length]);
}
