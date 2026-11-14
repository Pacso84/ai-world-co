// core/sugo-proba.js — CI-PRÓBA MINDEN SÚGÓRA (2026-11-14). Költsége $0: csak HTTP-letöltés, AI-hívás nincs.
//
// Miért: egy súgóközpont helyben (HU) lehet olvasható, a CI-ből (USA) mégis tiltott — a tiltás
// földrajz- és IP-függő. Ezért minden súgóra EGYSZER ugyanonnan próbáljuk ki a letöltést, ahonnan az
// éles gépsor fut: letöltjük a cikklistát, és két mintacikket (az elejéről és a közepéről).
// A próba nem „bukik”, hanem JELENT: a kilépési kód mindig 0, az eredmény a kimenetben van.
//
// Indítás helyben:  node core/sugo-proba.js --proba [kulcs …]   (kulcs nélkül: mind)
// Indítás a CI-ben: gh workflow run sugo-proba.yml   (lásd .github/workflows/sugo-proba.yml)
import { FORRASOK, indexLetolt } from './sugo-index.js';
import { cikkSzoveg } from './elakadas-gen.js';

// Ennél rövidebb szöveg nem számít „olvashatónak” (belépőoldal, hibaoldal, robot-szűrő lapja lehet).
export const MIN_HOSSZ = 300;

// n mintacikk egyenletesen a listából: n=2 → az első és a középső (nem csak egy gyűjtőlapot nézünk).
function mintaIndexek(db, n) {
  const ki = new Set();
  for (let i = 0; i < n && i < db; i++) ki.add(Math.floor(i * db / n));
  return [...ki];
}

export async function probaKulcs(kulcs, { fetchFn = fetch, cikkSzovegFn = cikkSzoveg, n = 2 } = {}) {
  const eredmeny = { kulcs, cikkek: 0, minta: [], ok: false, miert: '', olvashato: 0 };
  let lista = [];
  try { lista = await indexLetolt(kulcs, fetchFn); } catch { lista = []; }
  eredmeny.cikkek = Array.isArray(lista) ? lista.length : 0;
  if (!eredmeny.cikkek) { eredmeny.miert = '0 cikk a listában'; return eredmeny; }

  for (const i of mintaIndexek(lista.length, n)) {
    const { url, cim } = lista[i];
    let hossz = 0;
    try {
      const cikk = await cikkSzovegFn(url, fetchFn);
      hossz = cikk && typeof cikk.szoveg === 'string' ? cikk.szoveg.length : 0;
    } catch { hossz = 0; }   // egy hibás cikk nem állítja meg a próbát
    eredmeny.minta.push({ url, cim, hossz });
  }
  const olvashato = eredmeny.minta.filter(m => m.hossz >= MIN_HOSSZ).length;
  eredmeny.ok = olvashato > 0;
  eredmeny.miert = eredmeny.ok ? 'rendben' : 'a cikkek szövege nem jött le';
  eredmeny.olvashato = olvashato;
  return eredmeny;
}

// Egy sor kulcsonként, nem-technikus olvasónak.
export function sor(r) {
  if (r.ok) return `✅ ${r.kulcs}: ${r.cikkek} cikk, minta ${r.olvashato}/${r.minta.length} olvasható`;
  return `❌ ${r.kulcs}: ${r.miert}` + (r.cikkek ? ` (${r.cikkek} cikk a listában, minta 0/${r.minta.length} olvasható)` : '');
}

async function main() {
  const args = process.argv.slice(2).filter(a => a !== '--proba');
  const kulcsok = args.length ? args : Object.keys(FORRASOK);
  const mind = [];
  for (const kulcs of kulcsok) {   // egymás után, udvariasan — nincs párhuzamos zaklatás
    let r;
    try { r = await probaKulcs(kulcs); }
    catch (e) { r = { kulcs, cikkek: 0, minta: [], ok: false, olvashato: 0, miert: 'váratlan hiba: ' + (e && e.message) }; }
    console.log(sor(r));
    mind.push(r);
  }
  const jo = mind.filter(r => r.ok).length;
  console.log(`\nÖsszesen: ${jo}/${mind.length} súgó működik ebből a gépből.`);
  console.log('PROBA_JSON ' + JSON.stringify(mind));
}

// A CLI csak közvetlen futtatáskor indul; importáláskor nincs mellékhatás.
if (process.argv[1] && process.argv[1].endsWith('sugo-proba.js')) {
  main().then(() => process.exit(0), e => { console.log('❌ váratlan hiba: ' + (e && e.message)); process.exit(0); });
}
