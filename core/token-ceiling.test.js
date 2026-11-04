// ===================================================================
// KIMENETI KERET (max_tokens) TESZT — futtatás: node core/token-ceiling.test.js
//
// MIÉRT VAN EZ A FÁJL (2026-08-04, napi ellenőrzésből):
// A 01:23-as futásban 5 üres MiniMax-válasz égetett $0,077-et (a napi költés
// 22%-a). A napló ujjlenyomata: a kimenő token PONTOSAN a plafonon áll
// (10000/9999), a content ÜRES — a modell a gondolkodó-csatornába írt, amíg
// a keret el nem fogyott (élesben elkapva: content 0 kar, reasoning 5200 kar,
// finish_reason "length").
//
// A GONDOLKODÁS-MENTŐ EZT NEM TUDTA MEGOLDANI, mert csak a zászlót billentette
// át, a KERETET nem: az újrapróba ugyanannyi helyet kapott, tehát ugyanabba a
// falba futott (élesben: 9999 → 9999, bitre ugyanaz a plafon).
// Sőt: `noThink=true` mellett a 8000-es gondolkodó-padló is KIESIK, így egy
// kis keretű agentnél az újrapróba KEVESEBB helyet kapott volna, mint az imént
// HELY HIÁNYÁBAN elbukott hívás.
//
// A max_tokens csak FELSŐ HATÁR — ha a modell nem használja ki, nem kerül
// többe (ezt a projekt már 2026-07-22-ben megállapította a padló emelésekor).
// A ráhagyás tehát ingyen van, a bukás viszont teljes árú.
// ===================================================================
import { strict as assert } from 'assert';
import { effectiveMaxTokens } from './ai-router.js';

const M3 = 'minimax/minimax-m3';
const PLAIN = 'openai/gpt-4o-mini';

// 1) ALAP: gondolkodó modellnél érvényes a 8000-es padló (változatlan viselkedés)
{
  assert.equal(effectiveMaxTokens({ model: M3, maxTokens: 3000, noThink: false }), 8000,
    'gondolkodó modell kis kerettel → 8000-es padló');
  assert.equal(effectiveMaxTokens({ model: M3, maxTokens: 10000, noThink: false }), 10000,
    'a padló nem csökkenti a nagyobb keretet');
}

// 2) NEM gondolkodó modellnél nincs padló (változatlan)
{
  assert.equal(effectiveMaxTokens({ model: PLAIN, maxTokens: 3000, noThink: false }), 3000);
  assert.equal(effectiveMaxTokens({ model: PLAIN, maxTokens: 0, noThink: false }), 2048,
    'keret nélkül a 2048 az alapértelmezés');
}

// 3) ELSŐ hívás kikapcsolt gondolkodással: a padló értelmetlen, kimarad
{
  assert.equal(effectiveMaxTokens({ model: M3, maxTokens: 3000, noThink: true }), 3000,
    'gondolkodás nélkül nincs mit elgondolkodni → nincs padló');
}

// 4) ★ A BUKÓ ESET — MENTŐÖV-ÚJRAPRÓBA KIS KERETŰ AGENTNÉL
//    Az elbukott hívás 8000-et kapott (padló). A mai kód az újrapróbának
//    3000-et adna: KEVESEBBET, mint ami az imént kevés volt.
{
  const failed = effectiveMaxTokens({ model: M3, maxTokens: 3000, noThink: false }); // 8000
  const retry = effectiveMaxTokens({ model: M3, maxTokens: 3000, noThink: true, prevCeiling: failed });
  assert.ok(retry > failed,
    `az újrapróba TÖBB helyet kap, mint az elbukott hívás (kapott: ${retry}, elbukott: ${failed})`);
}

// 5) ★ AZ ÉLES ESET — iro/guide, maxTokens 10000, a plafonon bukott el
//    Élesben: 10000 → 🧯 → 9999 → megint üres. Az újrapróbának nőnie KELL.
{
  const failed = effectiveMaxTokens({ model: M3, maxTokens: 10000, noThink: false }); // 10000
  const retry = effectiveMaxTokens({ model: M3, maxTokens: 10000, noThink: true, prevCeiling: failed });
  assert.ok(retry > failed,
    `az iro újrapróbája nem futhat ugyanabba a falba (kapott: ${retry}, elbukott: ${failed})`);
}

// 6) A ráhagyásnak FELSŐ KORLÁTJA van — egy elszabadult modell ne tudjon
//    korlátlanul költeni egyetlen hívásban.
{
  const retry = effectiveMaxTokens({ model: M3, maxTokens: 10000, noThink: true, prevCeiling: 20000 });
  assert.ok(retry <= 24000, `a ráhagyás korlátos (kapott: ${retry})`);
  assert.ok(retry > 20000, `de a korlátig azért nő (kapott: ${retry})`);
}

// 7) prevCeiling nélkül a viselkedés VÁLTOZATLAN (nem rontunk el meglévő utat)
{
  for (const mt of [500, 2048, 4000, 10000]) {
    assert.equal(effectiveMaxTokens({ model: M3, maxTokens: mt, noThink: false }), Math.max(mt, 8000));
    assert.equal(effectiveMaxTokens({ model: M3, maxTokens: mt, noThink: true }), mt);
  }
}

console.log('✅ token-ceiling.test: minden átment');
