# ===================================================================
# AI World Co. — NAPI AUTOMATA FUTÁS (a Windows Időzítő hívja)
# ===================================================================
# Lefuttatja a teljes pipeline-t (hírkeresés → cikk- és útmutató-írás →
# ellenőrzés → párosítás → designer → SEO → web-designer → build),
# majd ÉLESRE deployol a Cloudflare Pages-re (aiworldco.pages.dev).
# Minden kimenet a logs/auto_*.log fájlba kerül.
#
# Kézzel is futtatható:  powershell -ExecutionPolicy Bypass -File scripts\daily-run.ps1
# ===================================================================
$ErrorActionPreference = "Continue"
$proj = "C:\AI work\ai-world-co"
Set-Location $proj
$env:CLOUDFLARE_ACCOUNT_ID = "c2c77a680eb2e2e525d948278dadafc9"

if (-not (Test-Path "$proj\logs")) { New-Item -ItemType Directory "$proj\logs" | Out-Null }
$log = "$proj\logs\auto_$(Get-Date -Format 'yyyy-MM-dd_HH-mm-ss').log"
"=== AI World auto-run START $(Get-Date) ===" | Out-File $log -Encoding utf8

# 1) Teljes pipeline (a napi limit miatt nem termel túl: max 5 cikk/nap)
node agents/ceo/agent.js *>> $log

# 2) Friss build (biztos, ami biztos) + DEPLOY az élő oldalra (wrangler OAuth)
node website/build.js *>> $log
npx --yes wrangler pages deploy website/public --project-name=aiworldco --branch=main --commit-dirty=true *>> $log

"=== AI World auto-run DONE $(Get-Date) ===" | Out-File $log -Append -Encoding utf8
