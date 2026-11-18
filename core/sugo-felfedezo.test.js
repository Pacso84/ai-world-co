// TESZT — súgó-felfedező engedély-rész (core/sugo-felfedezo.js, tiszta függvények). Ingyenes, hálózat és MI nélküli.
// A tesztszövegek kitaláltak (kiadói szöveg nem kerülhet a nyilvános repóba).
import assert from 'assert/strict';
import { FELFEDEZO_BE, felfedezoHost, sugoJellegu, felfedezettEngedelyezett, forrasEngedelyezett } from './sugo-felfedezo.js';

let pass = 0, hiba = 0;
const t = (n, f) => { try { f(); pass++; console.log('  ✅ ' + n); } catch (e) { hiba++; console.log('  ❌ ' + n + '\n     ' + String(e.message).split('\n')[0]); } };
console.log('🧪 súgó-felfedező (engedély)\n');

const TL = { tools: { 'MiniMax Code': 'https://agent.minimax.io', 'Lumo': 'https://lumo.proton.me', 'Brave Leo': 'https://brave.com/leo/',
  'Proba': 'https://www.proton.me', 'Httpes': 'http://example.org', 'Portos': 'https://example.org:8443' } };

t('🔌 kapcsoló bekapcsolva', () => assert.equal(FELFEDEZO_BE, true));
t('pontos host', () => assert.equal(felfedezoHost('MiniMax Code', TL), 'agent.minimax.io'));
t('aldomain nem öröklődik a kizárásból', () => assert.equal(felfedezoHost('Lumo', TL), 'lumo.proton.me'));
t('ENGEDELY-host kizár', () => assert.equal(felfedezoHost('Brave Leo', TL), null));
t('www-eltérés is kizár', () => assert.equal(felfedezoHost('Proba', TL), null));          // proton.me/support/ az ENGEDELY-ben
t('http-cím nem felfedezhető', () => assert.equal(felfedezoHost('Httpes', TL), null));
t('port nem lehet', () => assert.equal(felfedezoHost('Portos', TL), null));
t('ismeretlen eszköz', () => assert.equal(felfedezoHost('Nincs Ilyen', TL), null));

t('súgó-jellegű útvonalak', () => {
  for (const u of ['https://agent.minimax.io/docs/code/welcome', 'https://x.io/help/start', 'https://x.io/faq', 'https://x.io/user-guide/a', 'https://x.io/support/a', 'https://x.io/guides/a'])
    assert.equal(sugoJellegu(u), true, u);
});
t('kizárt szakaszok', () => {
  for (const u of ['https://x.io/docs/api/a', 'https://x.io/docs/api-reference/a', 'https://x.io/developers/docs/a', 'https://x.io/docs/reference/a',
    'https://x.io/docs/sdk/a', 'https://x.io/docs/cookbook/a', 'https://x.io/help/pricing', 'https://x.io/docs/techblog', 'https://x.io/blog/help',
    'https://x.io/news/faq', 'https://x.io/legal/faq', 'https://x.io/help/terms', 'https://x.io/help/privacy', 'https://x.io/careers/faq',
    'https://x.io/features', 'https://platform.x.io/docs/a'])
    assert.equal(sugoJellegu(u), false, u);
});
t('nem angol nyelvi előtag kiesik, az en marad', () => {
  assert.equal(sugoJellegu('https://x.io/zh/docs/a'), false);
  assert.equal(sugoJellegu('https://x.io/en-cn/help/a'), false);
  assert.equal(sugoJellegu('https://x.io/en/help/a'), true);
});

t('felfedezett: csak a tool-host', () => {
  assert.equal(felfedezettEngedelyezett('https://agent.minimax.io/docs/code/welcome', 'MiniMax Code', TL), true);
  assert.equal(felfedezettEngedelyezett('https://code.minimax.io/docs/code/welcome', 'MiniMax Code', TL), false);
  assert.equal(felfedezettEngedelyezett('https://agent.minimax.io/docs/../api/x', 'MiniMax Code', TL), false);
  assert.equal(felfedezettEngedelyezett('https://agent.minimax.io/docs/%2e%2e/x', 'MiniMax Code', TL), false);
  assert.equal(felfedezettEngedelyezett('https://user@agent.minimax.io/docs/a', 'MiniMax Code', TL), false);
  assert.equal(felfedezettEngedelyezett('http://agent.minimax.io/docs/a', 'MiniMax Code', TL), false);
});
t('forrasEngedelyezett: jóváhagyott marad, felfedezett jelöléssel bővül', () => {
  const tema = { tool: 'MiniMax Code', company: 'MiniMax' };
  assert.equal(forrasEngedelyezett({ url: 'https://help.openai.com/en/articles/1-a' }, tema, TL), true);
  assert.equal(forrasEngedelyezett({ url: 'https://agent.minimax.io/docs/code/welcome' }, tema, TL), false);   // jelölés nélkül nem
  assert.equal(forrasEngedelyezett({ url: 'https://agent.minimax.io/docs/code/welcome', felfedezett: true }, tema, TL), true);
  assert.equal(forrasEngedelyezett({ url: 'https://agent.minimax.io/docs/code/welcome', felfedezett: true }, { tool: 'Kimi' }, TL), false);   // más eszköz
  assert.equal(forrasEngedelyezett('https://help.openai.com/en/articles/1-a', tema, TL), true);   // sima URL-szöveg is
});

if (hiba) { console.log(`\n❌ sugo-felfedezo.test: ${hiba} hiba`); process.exit(1); }
console.log(`\n✅ sugo-felfedezo.test: mind a ${pass} eset rendben`);
