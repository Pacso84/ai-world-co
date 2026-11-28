// Csalás-képek gyártása (CLI) — 2026-11-23, terv: docs/superpowers/plans/2026-11-21-csalas-figyelo.md 4. rész.
//
//   node core/csalas-kepek.js        (a CI futtatja, a Reel-gyártás ELŐTT, a build előtt)
//
// Minden csalás-cikkre (`_meta.csalas`) és nyelvre (en + a content/translations hu/es-e):
//   website/assets/images/csalas/<slug>-<lang>.jpg        4:5, a cikkbe (8. rész)
//   website/assets/images/csalas/<slug>-<lang>-16x9.jpg   16:9, nyelvenkénti borító (8. rész: hu/es oldal ezt kapja)
//   website/assets/images/<slug>.jpg                      16:9 angol borító (a designer a csalás-cikket KIHAGYJA)
//
// Hibánál a többit folytatja; a hibák a memory/csalas-guard.json `kep_hibak` tömbjébe kerülnek (a többi mezőt —
// más részek adatát — megtartja), `kep_at` őrszem-időbélyeggel. Változatlan példát nem rajzol újra
// (memory/csalas-kep-hash.json; a rajz változásakor RAJZ_V emelése mindent újrarajzol).
//
// KILL-SWITCH: CSALAS_FIGYELO_BE false → azonnal kilép, semmit nem ír.

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { CSALAS_FIGYELO_BE, csalasHir } from './csalas-figyelo.js';
import { peldaBlokk } from './csalas-sablon.js';
import { csalasArchivBetolt } from './csalas-archiv.js';
import { rajzolCsalasKep, rajzolCsalasKartya, rajzSablon, betuAllapot, RAJZ_V } from './csalas-kep.js';

const NYELVEK = ['en', 'hu', 'es'];

const jsonOlvas = (ut, alap) => { try { return JSON.parse(readFileSync(ut, 'utf-8')); } catch { return alap; } };

export async function csalasKepekFuttat({ ROOT, be = CSALAS_FIGYELO_BE, sharpModul = null, now = new Date() } = {}) {
  if (!be) return { kihagyva: true, kesz: 0, valtozatlan: 0, hibak: [] };
  const sharp = sharpModul || (await import('sharp')).default;
  const CIKK = join(ROOT, 'content', 'articles');
  const FORD = join(ROOT, 'content', 'translations');
  const KEP = join(ROOT, 'website', 'assets', 'images');
  const CSKEP = join(KEP, 'csalas');
  const HASH_UT = join(ROOT, 'memory', 'csalas-kep-hash.json');
  const GUARD_UT = join(ROOT, 'memory', 'csalas-guard.json');
  mkdirSync(CSKEP, { recursive: true });

  const hash = jsonOlvas(HASH_UT, {});
  const ujHash = {};
  const hibak = [];
  let kesz = 0, valtozatlan = 0, cikkDb = 0;

  const fajlok = existsSync(CIKK) ? readdirSync(CIKK).filter(f => f.startsWith('ARTICLE_') && f.endsWith('.json')) : [];
  // 🗂️ csalás-archív (2026-11-28, core/csalas-archiv.js): a 2026-os korábbi figyelmeztetések is kapnak képet;
  // a hu/es szöveg a fájlon BELÜL van (`forditas`), nem a content/translations-ben
  const tetelek = [
    ...fajlok.map(f => ({ f, d: jsonOlvas(join(CIKK, f), null), archiv: false })),
    ...csalasArchivBetolt(ROOT).map(({ file, data }) => ({ f: file, d: data, archiv: true })),
  ];
  for (const { f, d, archiv } of tetelek) {
    if (!d || !csalasHir(d._meta)) continue;
    cikkDb++;
    const slug = d._meta?.slug;
    if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) { hibak.push({ slug: slug || f, lang: '-', hiba: 'nincs (érvényes) _meta.slug' }); continue; }
    const ford = archiv ? (d.forditas || {}) : jsonOlvas(join(FORD, f), {});
    for (const lang of NYELVEK) {
      const md = lang === 'en' ? d.article_markdown : ford[lang];
      if (!md) continue;                                   // a fordítás még nem készült el — nem hiba
      const pelda = peldaBlokk(md);
      if (!pelda) { hibak.push({ slug, lang, hiba: 'nincs példablokk' }); continue; }
      if (!rajzSablon(pelda.csatorna)) { hibak.push({ slug, lang, hiba: `ismeretlen csatorna: ${pelda.csatorna}` }); continue; }
      const celok = [
        { rel: `csalas/${slug}-${lang}.jpg`, format: '4x5' },
        { rel: `csalas/${slug}-${lang}-16x9.jpg`, format: '16x9' },
        ...(lang === 'en' ? [{ rel: `${slug}.jpg`, format: '16x9' }] : []),
        // 🛡️ 13. rész: a csalás-Reel üzenet-kártyája (core/reel-post.js prepareCsalasReel) — itt, mert csak ebben a
        // lépésben van fent a normál betűvastagság
        ...(lang === 'en' ? [{ rel: `csalas/${slug}-kartya.png`, format: 'kartya' }] : []),
      ];
      for (const c of celok) {
        const h = createHash('sha1').update(JSON.stringify([RAJZ_V, lang, c.format, pelda])).digest('hex').slice(0, 16);
        const ut = join(KEP, c.rel);
        if (hash[c.rel] === h && existsSync(ut)) { ujHash[c.rel] = h; valtozatlan++; continue; }
        try {
          writeFileSync(ut, c.format === 'kartya'
            ? await rajzolCsalasKartya(pelda, { lang, sharpModul: sharp })
            : await rajzolCsalasKep(pelda, { lang, format: c.format, sharpModul: sharp }));
          ujHash[c.rel] = h;
          kesz++;
        } catch (e) {
          hibak.push({ slug, lang, format: c.format, hiba: String(e?.message || e).split('\n')[0] });
          break;                                           // ugyanaz a példa a többi formátumnál is elbukna
        }
      }
    }
  }

  writeFileSync(HASH_UT, JSON.stringify(ujHash, null, 1));
  const guard = jsonOlvas(GUARD_UT, {});
  // `at` = EZ a lépés futásának bélyege (a napi riport frissesség-térképe ezt nézi: ha a lépés kimarad, szól).
  // A csalás-figyelő többi része (5. rész: hírgyűjtő) SAJÁT mezőt használjon, ne az `at`-et.
  Object.assign(guard, {
    at: now.toISOString(),
    kep_at: now.toISOString(),
    kep_cikk_db: cikkDb,
    kep_kesz: kesz,
    kep_valtozatlan: valtozatlan,
    kep_hibak: hibak,
    kep_betu: await betuAllapot(sharp),
  });
  writeFileSync(GUARD_UT, JSON.stringify(guard, null, 2));
  return { kihagyva: false, kesz, valtozatlan, hibak };
}

// A napi riport sorai (core/daily-report.js) — CSAK baj esetén szól: elmaradt kép, vagy nem jött meg a normál
// betűvastagság (akkor a kép elkészül, de az üzenet-szöveg vastag/tartalék betűvel). Jó napon: üres tömb.
export function csalasKepRiportSorok(guard) {
  if (!guard || typeof guard !== 'object') return [];
  const sorok = [];
  const hibak = Array.isArray(guard.kep_hibak) ? guard.kep_hibak : [];
  if (hibak.length) {
    const minta = hibak.slice(0, 2).map(h => `${h.slug} [${h.lang}]: ${String(h.hiba || '').slice(0, 70)}`).join(' · ');
    sorok.push(`🛡️ CSALÁS-KÉP: ${hibak.length} kép nem készült el — ${minta}${hibak.length > 2 ? ' …' : ''}`);
  }
  if (guard.kep_betu && guard.kep_betu.ok === false) {
    sorok.push(`🛡️ CSALÁS-KÉP betű: ${String(guard.kep_betu.reason || '').slice(0, 140)}`);
  }
  return sorok;
}

const fut = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (fut) {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
  try {
    const r = await csalasKepekFuttat({ ROOT });
    if (r.kihagyva) console.log('🛡️ Csalás-képek: a csalás-figyelő ki van kapcsolva (CSALAS_FIGYELO_BE=false) — nincs teendő.');
    else {
      console.log(`🛡️ Csalás-képek: ${r.kesz} új kép, ${r.valtozatlan} változatlan, ${r.hibak.length} hiba.`);
      for (const h of r.hibak) console.log(`   ⚠️ ${h.slug} [${h.lang}${h.format ? ' ' + h.format : ''}]: ${h.hiba}`);
    }
  } catch (e) {
    console.log('❌ Csalás-képek: váratlan hiba — ' + String(e?.message || e));
  }
  process.exit(0);
}
