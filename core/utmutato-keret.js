// ÚTMUTATÓ-KERET (2026-11-19, user: „útmutató-keret rés kivizsgálása!”) — hány ÚJ útmutató írható még ma?
//
// A napi plafon (config.limits.daily_guides_max, most 2) a PUBLIKÁLT útmutatókra szól.
// Eddig: plafon − ma publikált − váró vázlat. Az ELUTASÍTOTT, de még javítható útmutató viszont nem
// foglalt helyet: elbukott → a helye felszabadult → az idle-fill/párosító írt helyette újat → egy
// későbbi futásban az átdolgozó (3d) a régit is kiadta. Mérve: 11-12 (05:00 új + 16:30, 16:31 átdolgozott)
// és 11-17 (05:47, 05:48 új + 17:15 átdolgozott trend) = 3 / 2. Ugyanez a rés a hír-keretnél 11-05-én
// már be lett zárva (core/hir-keret.js) — ez annak az útmutató-párja.
//
// A már megírt (kifizetett) régi munka ELSŐBBSÉGET kap. Ha az átdolgozás végleg elbukik, aznap kevesebb
// útmutató jelenik meg — a plafon plafon. Ami NEM számít: a cég-lefedettség +1 hely (_meta.extra_slot)
// és a fékezett (súgóra váró) elutasított vázlat (azt az átdolgozó amúgy sem veszi elő).
import { hirIroKeret } from './hir-keret.js';

export function utmutatoKeret({ max, maPublikalt = 0, varoVazlat = 0, atdolgozhato = 0, fonokDontesre = 0 }) {
  const n = (x) => (Number.isFinite(x) && x > 0 ? Math.floor(x) : 0);
  return hirIroKeret({ max, maPublikalt, varoVazlat, atdolgozhato: n(atdolgozhato) + n(fonokDontesre) });
}
