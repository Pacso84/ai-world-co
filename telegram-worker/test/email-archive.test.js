// node telegram-worker/test/email-archive.test.js — a teljes support-levél mentése (offline, hamis KV)
import { strict as assert } from 'assert';
import { levelArchival, tgLevelSzoveg, EMAIL_KV_PREFIX, EMAIL_TTL_MP, TG_ELONEZET } from '../src/email-archive.js';

const hamisKV = () => {
  const tar = new Map();
  return { tar, put: async (k, v, o) => { tar.set(k, { v, o }); } };
};

// 1) a TELJES szöveg megmarad (a Telegram-előnézetnél jóval hosszabb is)
{
  const kv = hamisKV();
  const hosszu = 'Ko-fi link: https://ko-fi.com/verify?t=' + 'x'.repeat(3000) + ' VEGE';
  const kulcs = await levelArchival({ FEEDBACK: kv }, { from: 'a@b.c', subject: 'Confirm', text: hosszu, ts: 123 });
  assert.equal(kulcs, EMAIL_KV_PREFIX + '123');
  const mentett = JSON.parse(kv.tar.get(kulcs).v);
  assert.equal(mentett.message, hosszu, 'a mentett szöveg nem a teljes levél');
  assert.ok(mentett.message.endsWith('VEGE'), 'a levél vége elveszett');
  assert.equal(mentett.subject, 'Confirm');
  assert.equal(kv.tar.get(kulcs).o.expirationTtl, EMAIL_TTL_MP, 'nem 30 napig tárolja');
}

// 2) SOHA nem dob — a KV hibája nem akaszthatja meg az értesítést
{
  const rossz = { FEEDBACK: { put: async () => { throw new Error('KV le'); } } };
  assert.equal(await levelArchival(rossz, { from: 'a', subject: 's', text: 't', ts: 1 }), null);
  assert.equal(await levelArchival({}, { from: 'a', subject: 's', text: 't', ts: 1 }), null);
}

// 3) a Telegram-üzenet: rövid levélnél nincs utalás, hosszúnál jelzi a kulcsot
{
  const rovid = tgLevelSzoveg({ from: 'a@b.c', subject: 'Hi', text: 'Szia' }, 'cs:email:1');
  assert.ok(rovid.includes('Szia') && !rovid.includes('TELJES'), rovid);
  const hosszu = 'y'.repeat(TG_ELONEZET + 50);
  const h = tgLevelSzoveg({ from: 'a@b.c', subject: 'Hi', text: hosszu }, 'cs:email:9');
  assert.ok(h.includes('cs:email:9') && h.includes(String(hosszu.length)), h.slice(-120));
  assert.ok(!h.includes('y'.repeat(TG_ELONEZET + 1)), 'a Telegramra a teljes szöveg ment ki');
  const bukott = tgLevelSzoveg({ from: 'a', subject: 's', text: hosszu }, null);
  assert.ok(/NEM sikerült/.test(bukott), 'mentési hibát nem jelzi');
}

// 4) a levélkezelő TÉNYLEG hívja (a cs-email.js-t nem importálhatjuk: cloudflare:email)
{
  const { readFileSync } = await import('fs');
  const src = readFileSync(new URL('../src/cs-email.js', import.meta.url), 'utf-8');
  assert.ok(/await levelArchival\(env,/.test(src), 'a cs-email.js nem menti a levelet');
  assert.ok(/tgLevelSzoveg\(/.test(src), 'a Telegram-üzenet nem a tgLevelSzoveg-ből készül');
  assert.ok(src.indexOf('levelArchival(env') < src.indexOf('await tg(env'), 'a mentés a Telegram UTÁN jön');
}
console.log('✅ email-archive.test: minden átment');
