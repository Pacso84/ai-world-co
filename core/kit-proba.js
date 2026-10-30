// 🔑 Kit-kulcs + űrlapok ellenőrzése (2026-10-30) — CSAK OLVAS (GET /v4/account, /v4/forms), a kulcsot SOHA nem írja ki.
// Kézi futtatás: gh workflow run kit-proba.yml
const kulcs = (process.env.KIT_API_KEY || '').trim();
if (!kulcs) { console.log('❌ nincs KIT_API_KEY'); process.exit(1); }
const get = async ut => { const r = await fetch('https://api.kit.com/v4' + ut, { headers: { 'X-Kit-Api-Key': kulcs, accept: 'application/json' } }); return { status: r.status, j: await r.json().catch(() => ({})) }; };
const a = await get('/account');
console.log('fiók:', a.status, a.status === 200 ? `OK (${a.j?.account?.plan_type || '?'} csomag)` : 'HIBA');
const f = await get('/forms?status=all');
console.log('űrlapok:', f.status);
for (const x of f.j.forms || []) console.log(`  #${x.id} „${x.name}” típus=${x.type || x.format || '?'} archivált=${!!x.archived}`);
if (!(f.j.forms || []).length) console.log('  (nincs űrlap)');
// feliratkozók állapot szerint — CSAK darabszám (a repó nyilvános, a naplóba e-mail cím nem kerülhet)
const s = await get('/subscribers?status=all&per_page=500');
const db = {}; for (const x of s.j.subscribers || []) db[x.state] = (db[x.state] || 0) + 1;
console.log('feliratkozók:', s.status, JSON.stringify(db), '(inactive = megerősítésre vár, active = megerősítette)');
const fs = await get('/forms/10121836/subscribers?status=all');
console.log('a „Newsletter site” űrlapon:', fs.status, (fs.j.subscribers || []).length, 'fő');
