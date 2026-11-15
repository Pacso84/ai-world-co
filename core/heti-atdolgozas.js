// HETI ÖSSZEFOGLALÓ ÁTDOLGOZÁSA (2026-11-15)
//
// MIÉRT VAN: a heti cikk („This Week in AI: …”, agents/digest) a szokásos bírálaton megy át. Ha elutasítják, az
// ÁLTALÁNOS hír-átdolgozó (agents/iro, runReworkMode) kapja — annak a promptja egyforrású hírcikkre szól, a heti
// formát semmi nem köti. 11-15: a modell új címet adott („AI Assistants and Your Money, Shopping, and Privacy…”) és
// a számozott hírek helyett tanácsadó szakaszokat írt → a slug nem this-week-in-ai-… lett → a vasárnapi hírlevél
// és a heti híradó (mindkettő a slug-előtagból és a „## 1. …” hír-alcímekből dolgozik) csendben kimaradt.
//
// MIT CSINÁL:
//   hetiCikkE(data)            — a heti cikk felismerése (forrás + a digest pontos címe; az összehasonlító agent is
//                                aiworld-editorial, ezért a forrás önmagában NEM elég)
//   hetiAtdolgozasSzabaly(cim) — a promptba fűzött kötelező szabály (pontos cím, számozott hírek)
//   hetiAtdolgozasJavit(t,cim) — KÓD-BIZTOSÍTÉK a válaszon: a címsort és a H1-et visszaállítja a pontos heti címre;
//                                ha kevesebb mint HETI_MIN_HIR számozott hír maradt → ok:false (marad elutasítva,
//                                nem jelenik meg rossz formában, nem megy ki rossz hírlevél)
import { focimek } from './heti-hirado.js';

export const HETI_MIN_HIR = 3;   // a hírlevél is ennyit kér (core/hirlevel.js: „csak N hír-alcím — nem küldöm”)

const HETI_CIM = /^This Week in AI\b/i;

export function hetiCikkE(data) {
  if (!data || typeof data !== 'object') return false;
  return data._meta?.source_id === 'aiworld-editorial' && HETI_CIM.test(String(data.original_title || ''));
}

export function hetiAtdolgozasSzabaly(cim) {
  return `
THIS IS THE WEEKLY ROUNDUP — its format is fixed:
- Keep the frontmatter title EXACTLY: title: "${cim}"
- Keep the H1 EXACTLY: # ${cim}
- Keep it a roundup of separate news stories, each under a numbered H2 ("## 1. …", "## 2. …"). Fix the reviewer's
  problems inside the stories; if a story cannot be fixed, DROP that story (at least ${HETI_MIN_HIR} must remain) and
  renumber. Do NOT turn it into a single-topic article, a how-to or an advice piece. Keep the story links.
`;
}

const idezoJel = s => String(s).replace(/"/g, '\\"');

/** @returns {{ok:boolean, text:string, hirDb:number, ok_ok?:string}} */
export function hetiAtdolgozasJavit(text, cim) {
  let md = String(text || '').trimStart();
  const fm = md.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!fm) return { ok: false, text: md, hirDb: 0, ok_ok: 'nincs frontmatter' };

  // 1) frontmatter title → a pontos heti cím (ha hiányzik, beírjuk)
  let fej = fm[1];
  fej = /^title:.*$/m.test(fej) ? fej.replace(/^title:.*$/m, `title: "${idezoJel(cim)}"`) : `title: "${idezoJel(cim)}"\n${fej}`;
  let torzs = md.slice(fm[0].length);

  // 2) H1 → pontosan egy, a heti cím, közvetlenül a frontmatter után
  torzs = torzs.replace(/^#\s+(?!#).*\n?/gm, '');
  torzs = `# ${cim}\n${torzs.replace(/^\n+/, '\n')}`;
  md = `---\n${fej}\n---\n${torzs}`;

  // 3) a hírlevél / híradó ugyanígy számolja a híreket (CSAK számozott alcím számít: a tanácsadó szakasz nem hír)
  const szamozott = (md.match(/^##\s+\d+\.\s+\S/gm) || []).length;
  const hirDb = szamozott ? focimek(md, 99).length : 0;
  if (hirDb < HETI_MIN_HIR) return { ok: false, text: md, hirDb, ok_ok: `csak ${hirDb} számozott hír maradt` };
  return { ok: true, text: md, hirDb };
}
