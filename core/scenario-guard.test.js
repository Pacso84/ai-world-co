// ===================================================================
// TESZT — szabad-e küldeni erre a Make-forgatókönyvre?
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
// ===================================================================

import assert from 'assert/strict';
import { scenarioVerdict } from './scenario-guard.js';

const ok = { isActive: true, isPaused: false, usedPackages: ['gateway', 'threads'] };

// --- a jó eset ------------------------------------------------------
assert.equal(scenarioVerdict({ scenario: ok, requiredPackage: 'threads', hasId: true }).send, true);

// --- nincs kimeneti modul: a webhook 200-at ad, a poszt SEHOVA nem megy
// Ez a 2026-07-27-i eset: 38 pin kapott „kiküldve" jelölést úgy, hogy
// sosem jelent meg. A jelölés visszafordíthatatlan — inkább ne küldjünk.
{
  const v = scenarioVerdict({
    scenario: { isActive: true, isPaused: false, usedPackages: ['gateway'] },
    requiredPackage: 'threads', hasId: true
  });
  assert.equal(v.send, false);
  assert.match(v.reason, /kimeneti modul/i);
}

// --- inaktív vagy szüneteltetett ------------------------------------
for (const s of [{ ...ok, isActive: false }, { ...ok, isPaused: true }]) {
  const v = scenarioVerdict({ scenario: s, requiredPackage: 'threads', hasId: true });
  assert.equal(v.send, false, 'inaktív/szünetelő forgatókönyvre nem küldünk');
}

// --- NINCS forgatókönyv-azonosító: ÚJ csatornánál NEM küldünk --------
// Itt szándékosan eltérünk a pinterest-poster „hiba esetén küldj" elvétől.
// Egy még soha nem ellenőrzött csatornánál a téves küldés VÉGLEGES
// veszteség (a poszt „kiküldve" lesz, de sosem jelenik meg), a blokkolás
// viszont visszafordítható: beállítod az azonosítót, és megy tovább.
{
  const v = scenarioVerdict({ scenario: null, requiredPackage: 'threads', hasId: false });
  assert.equal(v.send, false);
  assert.match(v.reason, /azonosító/i);
}

// --- az azonosító megvan, de az API elhasalt ------------------------
// Ilyenkor KÜLDÜNK: a csatornát korábban már ellenőriztük, és egy
// monitorozási hiba ne állítsa meg a működő terjesztést.
{
  const v = scenarioVerdict({ scenario: null, requiredPackage: 'threads', hasId: true, apiFailed: true });
  assert.equal(v.send, true);
}

// --- nincs Make-token: az ellenőrzés kimarad, de az azonosító dönt ---
{
  assert.equal(scenarioVerdict({ scenario: null, requiredPackage: 'threads', hasId: true, noToken: true }).send, true);
  assert.equal(scenarioVerdict({ scenario: null, requiredPackage: 'threads', hasId: false, noToken: true }).send, false,
    'token nélkül SEM küldünk ismeretlen forgatókönyvre');
}

// --- a segéd-csomagok nem számítanak kimenetnek ---------------------
{
  const v = scenarioVerdict({
    scenario: { isActive: true, isPaused: false, usedPackages: ['gateway', 'http', 'json', 'tools'] },
    requiredPackage: 'threads', hasId: true
  });
  assert.equal(v.send, false, 'csak segédmodulokkal nincs hova kimennie a posztnak');
}

console.log('✅ scenario-guard: minden teszt átment');
