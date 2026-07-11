// Mini előnézet-szerver az Orbit-videóhoz (feliratokkal) — csak helyi teszt
const http = require('http');
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, 'website', 'public', 'assets', 'video');
const MIME = { '.mp4': 'video/mp4', '.vtt': 'text/vtt', '.jpg': 'image/jpeg', '.html': 'text/html' };

const page = `<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8"><title>Orbit előnézet</title>
<style>body{background:#f2ede4;font-family:sans-serif;display:grid;place-items:center;min-height:100vh;margin:0}
.box{max-width:900px;width:94%}video{width:100%;border-radius:16px;border:1px solid #d3cabb}
h1{color:#1c1a16;font-size:22px} p{color:#6f6a60}</style></head><body><div class="box">
<h1>🎬 Orbit heti videó — ELŐNÉZET (magyar felirat alapból BE)</h1>
<video controls poster="/weekly-poster.jpg" src="/weekly-2026-W28.mp4">
  <track kind="subtitles" srclang="hu" label="Magyar" src="/weekly-2026-W28.hu.vtt" default>
  <track kind="subtitles" srclang="es" label="Español" src="/weekly-2026-W28.es.vtt">
  <track kind="subtitles" srclang="de" label="Deutsch" src="/weekly-2026-W28.de.vtt">
  <track kind="subtitles" srclang="fr" label="Français" src="/weekly-2026-W28.fr.vtt">
</video>
<p>A felirat a lejátszó „CC" gombjával váltható. Ez CSAK helyi előnézet — élesben a cikk tetején így fog kinézni.</p>
</div></body></html>`;

http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/preview.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(page); }
  const f = path.join(DIR, path.basename(req.url));
  if (fs.existsSync(f)) { res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); return fs.createReadStream(f).pipe(res); }
  res.writeHead(404); res.end('nincs');
}).listen(8123, () => console.log('Előnézet: http://localhost:8123/'));
