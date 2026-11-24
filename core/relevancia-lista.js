// A hírgyűjtő (agents/rss-scraper) relevancia-promptjának tétel-listája (2026-11-24).
// A jelölt alakja: { feedConfig, item, snippet } — a cím az item.title-ben van. A régi kód `it.title`-t
// olvasott, ezért a promptban „Title: undefined” állt, és az AI csak a kivonatot látta.
export function relevanciaLista(batch) {
  return (batch || []).map((it, i) =>
    `[${i}] Title: ${String(it?.item?.title ?? '')}\n    Summary: ${String(it?.snippet ?? '').slice(0, 200)}`
  ).join('\n\n');
}
