// ===================================================================
// MARKDOWN NORMALIZÁLÁS mentés előtt (2026-07-24)
// ===================================================================
// Az LLM néha apró FORMÁTUM-hibát vét, amitől az Ellenőrző egy egyébként JÓ
// cikket/útmutatót eldob (pénzt égetve reménytelen újraírásra). Itt
// determinisztikusan (AI nélkül) kijavítjuk mentés előtt. Közös az Írónak (iro)
// és az Útmutató-írónak (guide) — mindkettő ugyanezt a hibát vétheti.
//   1. Kódblokk-burok: a modell néha ```markdown ... ``` fence-be csomagolja az
//      EGÉSZ cikket → kibontjuk (a build/ellenőrzés nyers markdownt vár).
//   2. Vezető szóköz/sortörés a --- előtt → levágjuk. KRITIKUS: az Ellenőrző
//      startsWith('---')-rel nézte (nem trimStart), így egy vezető '\n' HAMIS
//      NO_FRONTMATTER-t dobott jó cikkekre.
//   3. Hiányzó H1: ha van frontmatter title, de a törzsben nincs "# Cím",
//      beszúrjuk a title-ből. Determinisztikus, ingyen — elutasítás helyett.
export function normalizeArticleMarkdown(md) {
  if (!md || typeof md !== 'string') return md;
  let out = md;

  // 1. Kódblokk-burok eltávolítása (ha az EGÉSZ kimenet fence-be van csomagolva)
  const fence = out.trim().match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/);
  if (fence) out = fence[1];

  // 2. Vezető üres sorok/szóközök levágása (a --- kerüljön az abszolút elejére)
  out = out.replace(/^\s+/, '');

  // 3. Hiányzó H1 pótlása a frontmatter title-ből
  const fm = out.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (fm) {
    const body = fm[2];
    if (!/^#\s+.+$/m.test(body)) {
      const tm = fm[1].match(/^title:\s*(.+)$/m);
      const title = tm ? tm[1].trim().replace(/^["']|["']$/g, '') : '';
      if (title) out = `---\n${fm[1]}\n---\n\n# ${title}\n\n${body.replace(/^\s+/, '')}`;
    }
  }

  return out;
}
