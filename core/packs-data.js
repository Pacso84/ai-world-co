// ===================================================================
// A FIZETŐS CSOMAGOK ADATLAPJA — website/packs.json előállítása
// (2026-09-20)
//
// MIÉRT KELL EZ A FÁJL EGYÁLTALÁN:
// a honlapi eladó oldal (/packs) kiírja, hány oldalas és hány útmutatót
// tartalmaz egy csomag. Ezt a számot CSAK a legyártott PDF mondhatja meg.
//
// ⚠️ A BECSLÉS 40%-ot tévedett, és MINDIG lefelé. A `SZO_PER_OLDAL = 600`
// szerint a pénz-csomag 16 oldal lett volna; a valódi PDF 27. Ha a boltban
// 16-ot hirdetnénk és 27 érkezne, az „csak" kellemes meglepetés — de a
// fordított irány már hazugság, és ugyanaz a képlet adja mindkettőt.
// Ezért itt SEMMIT nem becslünk: a /Count mezőt olvassuk ki a PDF-ből, az
// útmutató-számot pedig a generátor által beírt <meta> mezőből.
//
// ⚠️ MIÉRT VAN A SZÁM EGY BEKOMMITOLT JSON-BAN:
// a `dist/` a .gitignore-ban van (a PDF-ek nem valók a NYILVÁNOS repóba),
// tehát a CI-ban NEM létezik. A honlap-építő viszont a CI-ban fut. Ha az
// oldal a PDF-ből akarna olvasni, élesben nulla oldalszámot írna ki.
// Ezért: itt, helyben mérünk → `website/packs.json` → azt olvassa a build.
// A `core/packs-page.test.js` őrzi, hogy a JSON teljes és hihető marad.
//
// FUTTATÁS (helyben, a PDF-ek legyártása UTÁN):
//   node core/ebook-build.js --mind --pdf
//   node core/packs-data.js --write
//
// Ez a modul BIZTONSÁGOSAN importálható: a `main()` csak közvetlen
// futtatáskor indul (lásd a fájl végét).
// ===================================================================
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { TEMAK } from './topics.js';
import { NYELVEK } from './ebook-pack.js';

/** A gyűjtemény azonosítója — a 8 téma-csomag MELLETT ez a kilencedik tétel. */
export const NAGY_ID = 'all';

// A BOLTI SORREND SZERKESZTŐI DÖNTÉS, NEM A TEMAK SORRENDJE (2026-09-20).
//
// A `TEMAK` a téma-oldalakhoz készült, és a pénz-csomagot a második helyre
// tette — miközben az a LEGVÉKONYABB tételünk (6 útmutató, 27 oldal). Egy
// boltban a második kártya még „a kínálat", nem „a maradék": ha ott a
// legsoványabb áll, az egész sorra rávetül.
//
// A sorrend indoka, lefelé:
//   work, home  — a bejövő forgalom legnagyobb témái (a belépők 61%-a
//                 útmutatóra érkezik, és ez a két téma a legnépesebb)
//   safe        — az átverés/deepfake tartalom megy a legjobban Facebookon,
//                 onnan jön a forgalmunk 82%-a
//   learn       — a teljesen kezdő látogató kapuja (lásd /start)
//   explain, create — nagy, vaskos csomagok (48 és 52 oldal)
//   automate, money — a két legkisebb, ezért hátul
//   all         — a gyűjtemény ZÁR, teljes szélességű kártyán: akkor
//                 ajánljuk a „mindet egyben"-t, amikor már látta, mi van benne
export const BOLTI_SORREND = ['work', 'home', 'safe', 'learn', 'explain', 'create', 'automate', 'money'];

/** A bolti tételek sorrendje az eladó oldalon: 8 mini, majd a gyűjtemény. */
export const CSOMAG_IDK = [...BOLTI_SORREND, NAGY_ID];

// ⚠️ AZ ÁR ITT LAKIK, EGY HELYEN. A Ko-fin beírt árnak ezzel EGYEZNIE kell;
// ha a kettő elválik, a honlap hazudik. A gyűjtemény ára szándékosan nem a
// 8 × 3 dollár: a „mindet egyben" kedvezmény a teljes csomag fő érve.
export const ARAK = { mini: 3, nagy: 9 };

/** Egy tétel ára dollárban. */
export function arOf(id) { return id === NAGY_ID ? ARAK.nagy : ARAK.mini; }

/**
 * A PDF VALÓDI oldalszáma: a lapfa `/Count` mezőinek maximuma.
 * A PDF több `/Count`-ot is tartalmazhat (részfák), a gyökéré a legnagyobb.
 * @returns {number|null} null, ha a fájl hiányzik vagy nem PDF
 */
export function pdfOldalszam(utvonal) {
  try {
    const b = readFileSync(utvonal);
    if (b.slice(0, 5).toString() !== '%PDF-') return null;
    const szamok = [...b.toString('latin1').matchAll(/\/Count\s+(\d+)/g)].map(m => Number(m[1]));
    return szamok.length ? Math.max(...szamok) : null;
  } catch { return null; }
}

/**
 * Hány útmutató van a csomagban — a GÉPI mezőből.
 * ⚠️ NE fejléc-számolásból: az első változatom 12 helyett 24-et adott, mert
 * a „Try it now" és társai is `<h2>`-k. Ezt a mezőt ugyanaz a szám tölti,
 * ami a csomag borítójára kerül, tehát nem tud elválni tőle.
 */
export function utmutatoSzam(utvonal) {
  try {
    const s = readFileSync(utvonal, 'utf-8');
    const m = s.match(/<meta name="aiworld-guides" content="(\d+)"/);
    return m ? Number(m[1]) : null;
  } catch { return null; }
}

/**
 * Végigméri a legyártott csomagokat, és visszaadja a packs.json tartalmát.
 * @param {string} distDir a `dist/ebook` mappa
 */
export function epit(distDir) {
  const packs = CSOMAG_IDK.map(id => {
    const sor = { id, price: arOf(id) };
    for (const ny of NYELVEK) {
      sor[ny] = {
        pages: pdfOldalszam(join(distDir, `${id}-${ny}.pdf`)),
        guides: utmutatoSzam(join(distDir, `${id}-${ny}.html`))
      };
    }
    return sor;
  });
  return {
    _comment: 'GÉPI FÁJL — ne szerkeszd kézzel. Előállítás: node core/packs-data.js --write',
    generated_at: new Date().toISOString().slice(0, 10),
    currency: 'USD',
    // A bolt címe. A tételenkénti linkek addig üresek, amíg a 18 tétel fel
    // nem kerül a Ko-fira; addig minden gomb a bolt nyitólapjára visz.
    shop_url: 'https://ko-fi.com/aiworldhq/shop',
    packs
  };
}

/** Hiányzó mérés keresése — ezzel bukik a --write, nem féladattal. */
export function hianyok(adat) {
  const baj = [];
  for (const p of adat.packs || []) {
    for (const ny of NYELVEK) {
      const m = p[ny] || {};
      if (!(m.pages > 0)) baj.push(`${p.id}-${ny}: nincs oldalszám`);
      if (!(m.guides > 0)) baj.push(`${p.id}-${ny}: nincs útmutató-szám`);
    }
  }
  return baj;
}

async function main() {
  const ROOT = join(import.meta.dirname, '..');
  const distDir = join(ROOT, 'dist', 'ebook');
  if (!existsSync(distDir)) {
    console.error('🔴 Nincs ' + distDir + ' — előbb: node core/ebook-build.js --mind --pdf');
    process.exit(1);
  }
  const adat = epit(distDir);
  const baj = hianyok(adat);
  if (baj.length) {
    // Inkább ne írjunk fájlt, mint hogy a honlapra nulla oldalszám kerüljön.
    console.error('🔴 Hiányzó mérés — NEM írok fájlt:\n   ' + baj.join('\n   '));
    process.exit(1);
  }
  const ki = join(ROOT, 'website', 'packs.json');
  writeFileSync(ki, JSON.stringify(adat, null, 2) + '\n', 'utf-8');
  for (const p of adat.packs) {
    console.log(`  ${p.id.padEnd(9)} $${p.price}  en: ${String(p.en.pages).padStart(3)} oldal / ${p.en.guides} útmutató`
      + `   es: ${String(p.es.pages).padStart(3)} oldal / ${p.es.guides} útmutató`);
  }
  console.log('✅ ' + ki);
}

const kozvetlen = process.argv[1] && process.argv[1].endsWith('packs-data.js');
if (kozvetlen && process.argv.includes('--write')) main();
