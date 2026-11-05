// HÍR-KERET (2026-11-05): hány ÚJ hírt írhat az Író ebben a futásban?
//
// A napi plafon (config.limits.daily_articles_max, most 4) a PUBLIKÁLT hírekre szól.
// Eddig az Író „plafon − ma publikált” keretet kapott — de UGYANABBAN a futásban az
// átdolgozó (3b. lépés) a KORÁBBI futásokból maradt, még javítható elutasított híreket
// is publikálja, és az ellenőrző a korábbról ott ragadt WRITER_-vázlatokat is.
// Ezek nem vonódtak le → 11-05: 4 új hír + a 11-04-én elutasított Heimstaden = 5/4.
// (Szeptember közepe óta így ~5 nap ment a plafon fölé; az útmutatóknál ugyanezt
// 07-07-én már javítottuk: guides_remaining a várakozó vázlatokat is levonja.)
//
// A már megírt (kifizetett) régi munka ELSŐBBSÉGET kap az új vázlatokkal szemben.
// Ha az átdolgozás végleg elbukik, aznap kevesebb hír jelenik meg — a plafon plafon.

export function hirIroKeret({ max, maPublikalt = 0, varoVazlat = 0, atdolgozhato = 0 }) {
  const n = (x) => (Number.isFinite(x) && x > 0 ? Math.floor(x) : 0);
  if (!Number.isFinite(max) || max <= 0) return 0;
  return Math.max(0, n(max) - n(maPublikalt) - n(varoVazlat) - n(atdolgozhato));
}
