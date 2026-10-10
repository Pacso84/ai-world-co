// ===================================================================
// NAPI ÖSSZEFOGLALÓ — BEMUTATÓ-GYÁRTÁS (2026-10-10)
// ===================================================================
// Csak a .github/workflows/osszesito-proba.yml futtatja. A mai hírekből
// legyártja a „Today in AI" videót (core/daily-summary-video.js), és artifactként
// menti — NEM posztol, NEM commitol. A user előbb látni akarja (10-10).
// ===================================================================
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { fm } from './frontmatter.js';
import { utmutatoE } from './guide-kind.js';
import { napiHirek, osszesitoSzakaszok, renderOsszesito } from './daily-summary-video.js';
import { zerogpuKlip } from './zerogpu-video.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'content', 'articles');
const cikkek = [];
for (const f of readdirSync(DIR)) {
  if (!f.startsWith('ARTICLE_') || !f.endsWith('.json')) continue;
  let j; try { j = JSON.parse(readFileSync(join(DIR, f), 'utf-8')); } catch { continue; }
  const m = j._meta || {};
  if (m.status && m.status !== 'published') continue;
  const md = j.article_markdown || '';
  cikkek.push({ utmutato: utmutatoE(f, j), published_at: m.published_at || '', slug: m.slug || '',
    title: fm(md, 'title') || '', subtitle: fm(md, 'subtitle') || '' });
}
const hirek = napiHirek(cikkek);
mkdirSync('osszesito-proba', { recursive: true });
if (!hirek) { console.log('💤 Nincs elég friss hír a napi összefoglalóhoz.'); writeFileSync('osszesito-proba/eredmeny.json', '{"ok":false,"hiba":"kevés hír"}'); process.exit(0); }
const szakaszok = osszesitoSzakaszok(hirek);
console.log('📰 Hírek:\n' + hirek.map(h => '  • ' + h.title).join('\n'));
const token = (process.env.HF_TOKEN || '').trim();
const r = await renderOsszesito(szakaszok, {
  out: 'osszesito-proba/osszesito.mp4', workDir: join(ROOT, '.osszesito-munka'),
  klipFn: (prompt, mp) => zerogpuKlip({ prompt, token, mp })
});
writeFileSync('osszesito-proba/eredmeny.json', JSON.stringify({ ...r, hirek: hirek.map(h => h.title), szoveg: szakaszok.map(s => s.mond) }, null, 2));
console.log(r.ok ? `✅ Kész: ${r.seconds.toFixed(1)} mp, ${r.klipek} MI-klip${r.potolt.length ? ", pótolva: " + r.potolt.join("; ") : ""}` : `❌ ${r.hiba}${r.kvota ? ' (elfogyott a keret)' : ''}`);
