# KOKORO-82M FELOLVASÓ — a Motion Reel TARTALÉK hangja (2026-11-19, user: „rádbízom”).
# CSAK akkor fut, ha a Microsoft-felolvasó (Edge TTS) elbukott — lásd core/kokoro-tts.js.
# Bemenet: argv[1] = JSON-fájl {"szovegek": [...], "hang": "af_heart", "dir": "..."}.
# Kimenet (stdout UTOLSÓ sora): JSON [{"wav": "...", "szavak": [{"w","t","d"}]}] szegmensenként.
# Licenc: Apache-2.0 (huggingface.co/hexgrad/Kokoro-82M). Próba: core/kokoro-proba.py (11-19, 38/38 szó időzítve).
import json, sys, os
import numpy as np
import soundfile as sf
from kokoro import KPipeline

be = json.load(open(sys.argv[1], encoding='utf-8'))
pipe = KPipeline(lang_code='a', repo_id='hexgrad/Kokoro-82M')   # 'a' = amerikai angol
ki = []
for i, szoveg in enumerate(be['szovegek']):
    darabok, szavak, eltolas = [], [], 0.0
    for r in pipe(szoveg, voice=be['hang']):
        a = r.audio.numpy() if hasattr(r.audio, 'numpy') else np.asarray(r.audio)
        for tok in (r.tokens or []):
            if tok.start_ts is None:
                continue
            vege = tok.end_ts if tok.end_ts is not None else tok.start_ts
            # egy hosszú szöveget a Kokoro darabokra vág, és darabonként 0-tól számol → eltolás
            szavak.append({'w': tok.text, 't': round(eltolas + tok.start_ts, 3), 'd': round(max(0.0, vege - tok.start_ts), 3)})
        darabok.append(a)
        eltolas += len(a) / 24000
    if not darabok:
        raise SystemExit(f'Kokoro: üres hang a(z) {i}. szegmensre')
    wav = os.path.join(be['dir'], f'k{i}.wav')
    sf.write(wav, np.concatenate(darabok), 24000)
    ki.append({'wav': wav, 'szavak': szavak})
print(json.dumps(ki, ensure_ascii=False))
