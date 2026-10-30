// 🎯 Forrásonkénti címszűrő + dátum-cím pótlás (2026-10-30). Ingyenes, AI nélküli.
//
// A magánszféra-cégek (DuckDuckGo, Brave, Proton) hírfolyama vegyes: a MI-asszisztensükről
// (Duck.ai, Leo, Lumo) szóló hír ritka, a többi böngésző/VPN/levelezés. Az általános kulcsszó-szűrő
// az 'ai' részszó miatt szinte mindent átengedne ("privacy", "email") → fizetős relevancia-hívás
// minden tételre. A forrás `title_include` mezője (regex, kis-nagybetű mindegy) a CÍMEN dönt.
//
// A Z.ai hivatalos változásnaplója (Mintlify RSS) a tétel címének csak a dátumot adja
// ("2026-08-26"). `datum_cim_elotag` mellett a cím: "<előtag>: <a tartalom első mondata>".

const DATUM_CIM = /^\s*\d{4}-\d{2}-\d{2}\s*$/;

/** Átmegy-e a tétel a forrás címszűrőjén? Szűrő nélkül mindig igen; hibás regex = nincs szűrés. */
export function cimSzuronAtmegy(forras, cim) {
  const minta = forras?.title_include;
  if (!minta) return true;
  try { return new RegExp(minta, 'i').test(String(cim || '')); } catch { return true; }
}

/** Puszta dátum-cím helyett "<előtag>: <első mondat>" (max ~140 karakter). Egyébként a cím változatlan. */
export function datumCimPotlas(forras, cim, tartalom) {
  const elotag = forras?.datum_cim_elotag;
  if (!elotag || !DATUM_CIM.test(String(cim || ''))) return cim;
  const szoveg = String(tartalom || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!szoveg) return cim;
  let mondat = (szoveg.match(/^.+?[.!?](?=\s|$)/) || [szoveg])[0];
  if (mondat.length > 140) mondat = mondat.slice(0, 137).replace(/\s+\S*$/, '') + '…';
  return `${elotag}: ${mondat}`;
}
