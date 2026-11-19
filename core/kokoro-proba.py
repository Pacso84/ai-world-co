# KOKORO-82M PRÓBA (2026-11-19) — CSAK a kézi .github/workflows/kokoro-proba.yml futtatja, élesben SEMMI nem használja.
# Kérdés: jó TARTALÉK lehet-e az Edge TTS mellé a Motion Reelhez (core/motion-reel.js felolvas())?
# Mérjük: modell-betöltés ideje, gyártási sebesség a GitHub CPU-n (valós idő arány), és hogy ad-e
# SZÓIDŐZÍTÉST (a szavankénti felirathoz kell) — hangmintákat ír a kokoro-ki/ mappába (artifact).
# Licenc: a modell és a kód Apache-2.0 (huggingface.co/hexgrad/Kokoro-82M).
import json, time, os, re
import soundfile as sf

t0 = time.time()
from kokoro import KPipeline
pipe = KPipeline(lang_code='a', repo_id='hexgrad/Kokoro-82M')   # 'a' = amerikai angol (a közönségünk)
betoltes = time.time() - t0

# Valódi Motion Reel-szerű szegmensek (horog → lényeg → zárás), ugyanaz a hossz-nagyság (13–16 mp összesen)
SZEGMENSEK = [
    "OpenAI just made ChatGPT a lot more useful at work.",
    "The new update lets you connect your calendar, so it can plan your week and draft replies for you.",
    "Full guide on AI World H Q dot com.",
]
HANGOK = ['af_heart', 'am_michael', 'af_bella']
os.makedirs('kokoro-ki', exist_ok=True)
ki = {'betoltes_mp': round(betoltes, 1), 'hangok': {}}
for hang in HANGOK:
    osszes_hang, osszes_ido, szegm = 0.0, 0.0, []
    for i, szoveg in enumerate(SZEGMENSEK):
        t = time.time()
        darabok, szavak = [], []
        for r in pipe(szoveg, voice=hang):
            darabok.append(r.audio.numpy() if hasattr(r.audio, 'numpy') else r.audio)
            for tok in (r.tokens or []):
                if tok.start_ts is not None:
                    szavak.append({'w': tok.text, 't': round(tok.start_ts, 3), 'v': round(tok.end_ts or tok.start_ts, 3)})
        import numpy as np
        a = np.concatenate(darabok)
        ido = time.time() - t
        hossz = len(a) / 24000
        sf.write(f'kokoro-ki/{hang}_{i}.wav', a, 24000)
        vart = len([w for w in re.findall(r"\S+", szoveg) if re.search(r"\w", w)])
        szavas = [s for s in szavak if re.search(r"\w", s['w'])]
        szegm.append({'szoveg': szoveg, 'hang_mp': round(hossz, 2), 'gyartas_mp': round(ido, 2),
                      'vart_szo': vart, 'idozitett_szo': len(szavas), 'szavak': szavak})
        osszes_hang += hossz; osszes_ido += ido
    ki['hangok'][hang] = {'hang_mp': round(osszes_hang, 2), 'gyartas_mp': round(osszes_ido, 2),
                          'valos_ido_arany': round(osszes_ido / osszes_hang, 2), 'szegmensek': szegm}
    print(f"{hang}: {osszes_hang:.1f} mp hang {osszes_ido:.1f} mp alatt (arány {osszes_ido/osszes_hang:.2f}); "
          f"szóidőzítés: {sum(s['idozitett_szo'] for s in szegm)}/{sum(s['vart_szo'] for s in szegm)} szó")
print('modell-betöltés:', round(betoltes, 1), 'mp')
json.dump(ki, open('kokoro-ki/eredmeny.json', 'w'), ensure_ascii=False, indent=1)
